import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { ChatMessage, NetworkMessage, PeerManagerLike } from "p2play-core";
import {
  clearSession,
  createSessionToken,
  loadSession,
  saveProfile,
  saveSession,
} from "p2play-core/session";
import type { HubPhase, HubState } from "./protocol";

const HEARTBEAT_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 12_000;

export class HubPeerManager implements PeerManagerLike {
  private peer: Peer | null = null;
  public myPeerId: string | null = null;
  public hostPeerId: string | null = null;
  public connections: Map<string, DataConnection> = new Map();
  public isHost: boolean = false;

  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private lastPongReceived: Map<string, number> = new Map();

  public onStatusChange: ((status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void) | null = null;
  public onMessage: ((sender: string, data: any) => void) | null = null;
  public onPlayersUpdate: (() => void) | null = null;
  public onHubStateUpdate: ((state: HubState) => void) | null = null;

  // Canonical Hub state (owned by the host, mirrored by clients)
  public selectedGame: string | null = null;
  public activeGame: string | null = null;
  public gameConfig: any = null;
  public phase: HubPhase = 'HUB_LOBBY';
  public customGames: HubState['customGames'] = [];

  // Game-level callbacks (used by embedded games via externalPeerManager)
  public onStateReceived: ((state: any) => void) | null = null;
  public onChatReceived: ((msg: any) => void) | null = null;
  public onAudioReceived: ((sfx: string, intensity?: number) => void) | null = null;
  public onPeerStatusChange: ((peerId: string, status: 'CONNECTED' | 'DISCONNECTED') => void) | null = null;
  public hostActionHandler: ((sender: string, msg: any) => void) | null = null;
  public onCustomMessage: ((msg: any) => void) | null = null;
  public onVoiceMessage: ((msg: any) => void) | null = null;

  public getPeer(): Peer | null {
    return this.peer;
  }

  public username: string = "";
  public avatar: string = "👑";
  public lobbyPlayers: { peerId: string; username: string; avatar: string }[] = [];
  public enableVoice: boolean = true;
  public enableTextChat: boolean = true;
  public chatHistory: ChatMessage[] = [];
  public onChatHistorySync: ((messages: ChatMessage[]) => void) | null = null;
  private sessionToken: string = createSessionToken();

  /** Salon session (reconnect) + durable profile (multi-day pseudo/avatar). */
  private persistHubSession(): void {
    if (this.username.trim()) {
      saveProfile({ username: this.username, avatar: this.avatar });
    }
    if (!this.myPeerId || !this.hostPeerId) return;
    saveSession(this.hostPeerId, {
      previousPeerId: this.myPeerId,
      username: this.username,
      avatar: this.avatar,
      role: "player",
      sessionToken: this.sessionToken,
    });
  }

  public initialize(
    isHost: boolean,
    roomId: string,
    username: string,
    avatar: string = "👑",
    enableVoice: boolean = true,
    enableTextChat: boolean = true
  ) {
    this.isHost = isHost;
    this.username = username;
    this.avatar = avatar;
    this.enableVoice = enableVoice;
    this.enableTextChat = enableTextChat;
    this.chatHistory = [];
    this.sessionToken = createSessionToken();
    this.lobbyPlayers = [{ peerId: isHost ? roomId : "", username, avatar }];
    
    const peerId = isHost 
      ? roomId 
      : `${username.replace(/[^a-zA-Z0-9]/g, '')}_${roomId}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    this.peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ],
      },
    });
    
    if (this.onStatusChange) this.onStatusChange('CONNECTING');

    this.peer.on("open", (id) => {
      this.myPeerId = id;
      this.hostPeerId = roomId;
      // Always bind local seat id (guests used to stay at "" until SYNC_LOBBY → pseudo "Joueur").
      if (this.lobbyPlayers[0]) this.lobbyPlayers[0].peerId = id;
      if (this.onStatusChange) this.onStatusChange('CONNECTED');
      if (this.onPlayersUpdate) this.onPlayersUpdate();

      // Host: persist as soon as the salon exists (pseudo restore on F5 without a game).
      if (isHost) this.persistHubSession();

      if (!isHost && roomId) {
        const conn = this.peer!.connect(roomId);
        this.setupConnection(conn);
      }

      this.startHeartbeat();
    });

    this.peer.on("connection", (conn) => {
      this.setupConnection(conn);
    });

    this.peer.on("disconnected", () => {
      if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
    });

    this.peer.on("error", (err: any) => {
      console.warn("PeerJS Warning/Error:", err?.type || err);
      // Only disconnect on fatal connection/ID failure types
      const fatalTypes = ["invalid-id", "unavailable-id", "browser-incompatible"];
      if (err?.type && fatalTypes.includes(err.type)) {
        if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
      }
    });
  }

  private setupConnection(conn: DataConnection) {
    conn.on("open", () => {
      this.connections.set(conn.peer, conn);
      this.lastPongReceived.set(conn.peer, Date.now());
      this.onPeerStatusChange?.(conn.peer, 'CONNECTED');
      
      // Same reconnect path as standalone joinGame (hub owns the PeerJS connect).
      if (!this.isHost && this.isHostConnection(conn) && this.myPeerId && this.hostPeerId) {
        const prev = loadSession(this.hostPeerId);
        if (prev?.previousPeerId && prev.previousPeerId !== this.myPeerId) {
          conn.send({
            type: "REQUEST_RECONNECT",
            previousPeerId: prev.previousPeerId,
            username: this.username,
            sessionToken: prev.sessionToken,
          });
          this.sessionToken = createSessionToken();
        } else if (prev?.sessionToken && prev.previousPeerId === this.myPeerId) {
          this.sessionToken = prev.sessionToken;
        }
        this.persistHubSession();
        conn.send({
          type: "PLAYER_JOINED",
          payload: { username: this.username, avatar: this.avatar },
          sender: this.myPeerId,
        });
      }
    });

    conn.on("data", (data: any) => {
      if (data.type === 'PING') {
        if (conn.open) conn.send({ type: 'PONG', ts: Date.now() });
        return;
      }
      if (data.type === 'PONG') {
        this.lastPongReceived.set(conn.peer, Date.now());
        return;
      }
      if (data.type === 'PLAYER_JOINED' && this.isHost) {
        // Identity is the DataConnection peer — never trust data.sender from the client.
        const peerId = conn.peer;
        const playerObj = typeof data.payload === 'string' 
          ? { username: data.payload, avatar: "👑" } 
          : data.payload;
        if (!this.lobbyPlayers.some(p => p.peerId === peerId)) {
          this.lobbyPlayers.push({
            peerId,
            username: playerObj.username || `Joueur-${peerId.slice(0, 4)}`,
            avatar: playerObj.avatar || "👑",
          });
        }
        // Broadcast the updated list to all players
        this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
        // Sync the current Hub state (selected game / active game / config) to the late joiner
        this.send(peerId, { type: 'SYNC_HUB_STATE', payload: this.getHubState(), sender: this.myPeerId || "" });
        this.send(peerId, { type: 'CHAT_HISTORY_SYNC', messages: this.chatHistory });
        if (this.onPlayersUpdate) this.onPlayersUpdate();
        return;
      } else if (data.type === 'UPDATE_AVATAR' && this.isHost) {
        const player = this.lobbyPlayers.find(p => p.peerId === conn.peer);
        if (player) {
          player.avatar = data.payload;
          this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
          if (this.onPlayersUpdate) this.onPlayersUpdate();
        }
        return;
      } else if (data.type === 'SYNC_LOBBY') {
        // Host-owned — clients only accept from the room host.
        if (this.isHost || !this.isHostConnection(conn)) return;
        this.lobbyPlayers = data.payload;
        if (this.onPlayersUpdate) this.onPlayersUpdate();

        // Full Mesh Auto-Connection: establish direct PeerJS DataConnection to all non-host peers
        if (Array.isArray(this.lobbyPlayers)) {
          this.lobbyPlayers.forEach(p => {
            if (p.peerId && p.peerId !== this.myPeerId && !this.connections.has(p.peerId)) {
              const peerConn = this.peer?.connect(p.peerId);
              if (peerConn) {
                this.setupConnection(peerConn);
              }
            }
          });
        }
        return;
      } else if (data.type === 'SYNC_HUB_STATE') {
        if (this.isHost || !this.isHostConnection(conn)) return;
        this.applyHubState(data.payload);
        return;
      }

      // Game-level message routing (embedded games reuse this peer manager)
      switch (data.type) {
        case 'STATE_UPDATE':
          // Only the host may push game state (guests must not inject via mesh).
          if (!this.isHost && !this.isHostConnection(conn)) return;
          if (this.isHost) return; // host engine is authoritative locally
          if (this.onStateReceived && data.state) this.onStateReceived(data.state);
          return;
        case 'CHAT': {
          if (this.isHost) {
            const safe: ChatMessage = {
              type: 'CHAT',
              sender: this.resolveChatSender(conn.peer),
              text: typeof data.text === 'string' ? data.text : '',
              time:
                typeof data.time === 'string' && data.time
                  ? data.time
                  : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              senderPeerId: conn.peer,
            };
            this.chatHistory = [...this.chatHistory.slice(-199), safe];
            if (this.onChatReceived) this.onChatReceived(safe);
            this.broadcast(safe, conn.peer);
          } else if (this.isHostConnection(conn)) {
            this.chatHistory = [...this.chatHistory.slice(-199), data];
            if (this.onChatReceived) this.onChatReceived(data);
          }
          return;
        }
        case 'CHAT_HISTORY_SYNC':
          if (this.isHost || !this.isHostConnection(conn)) return;
          if (data.messages && Array.isArray(data.messages)) {
            this.chatHistory = data.messages;
            if (this.onChatHistorySync) this.onChatHistorySync(this.chatHistory);
          }
          return;
        case 'AUDIO_EVENT':
          if (this.isHost) {
            if (this.onAudioReceived && data.sfx) this.onAudioReceived(data.sfx);
            this.broadcast(data, conn.peer);
          } else if (this.isHostConnection(conn) && this.onAudioReceived && data.sfx) {
            this.onAudioReceived(data.sfx);
          }
          return;
        case 'VOICE_STATE_UPDATE': {
          if (this.isHost) {
            const safe = {
              type: 'VOICE_STATE_UPDATE' as const,
              sender: conn.peer,
              voiceState: {
                ...(data.voiceState && typeof data.voiceState === 'object' ? data.voiceState : {}),
                peerId: conn.peer,
                username: this.resolveChatSender(conn.peer),
              },
            };
            if (this.onVoiceMessage) this.onVoiceMessage(safe);
            this.broadcast(safe, conn.peer);
          } else if (this.isHostConnection(conn) && this.onVoiceMessage) {
            this.onVoiceMessage(data);
          }
          return;
        }
        case 'VOICE_MODERATION_ACTION':
          // Only host may moderate; guests ignore peer injections.
          if (this.isHost) return;
          if (this.isHostConnection(conn) && this.onVoiceMessage) this.onVoiceMessage(data);
          return;
        case 'ACTION':
          if (this.isHost && this.hostActionHandler) this.hostActionHandler(conn.peer, data);
          return;
        case 'SHOT_FRAME':
          // Host engine broadcasts frames; never relay guest-injected frames.
          if (this.isHost) return;
          if (this.isHostConnection(conn) && this.onCustomMessage) this.onCustomMessage(data);
          return;
        case 'SELECT_GAME':
        case 'START_GAME':
        case 'RETURN_TO_HUB':
          // Legacy hub control — host-owned only (prefer SYNC_HUB_STATE).
          if (!this.isHost && this.isHostConnection(conn) && this.onMessage) {
            this.onMessage(conn.peer, data);
          }
          return;
        case 'PLAYER_JOINED':
        case 'UPDATE_AVATAR':
        case 'REGISTER_SESSION':
        case 'REQUEST_RECONNECT':
          if (this.isHost && this.hostActionHandler && (data.type === 'REGISTER_SESSION' || data.type === 'REQUEST_RECONNECT')) {
            this.hostActionHandler(conn.peer, data);
          }
          return;
        default:
          // Do not relay unknown guest messages. Custom host→client only.
          if (!this.isHost && this.isHostConnection(conn) && this.onCustomMessage) {
            this.onCustomMessage(data);
          }
          return;
      }
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);
      this.lastPongReceived.delete(conn.peer);
      this.onPeerStatusChange?.(conn.peer, 'DISCONNECTED');
      if (this.isHost) {
        this.lobbyPlayers = this.lobbyPlayers.filter(p => p.peerId !== conn.peer);
        this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
      }
      if (this.onPlayersUpdate) this.onPlayersUpdate();
    });

    conn.on("error", () => {
      this.connections.delete(conn.peer);
      this.lastPongReceived.delete(conn.peer);
      this.onPeerStatusChange?.(conn.peer, 'DISCONNECTED');
      if (this.isHost) {
        this.lobbyPlayers = this.lobbyPlayers.filter(p => p.peerId !== conn.peer);
        this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
      }
      if (this.onPlayersUpdate) this.onPlayersUpdate();
    });
  }

  public broadcast(data: any, excludePeerId?: string) {
    this.connections.forEach((conn, peerId) => {
      if (peerId !== excludePeerId) {
        conn.send(data);
      }
    });
  }

  public send(peerId: string, data: any) {
    const conn = this.connections.get(peerId);
    if (conn) conn.send(data);
  }

  // ---- Hub shared state (host-owned) ----

  public getHubState(): HubState {
    return {
      selectedGame: this.selectedGame,
      activeGame: this.activeGame,
      gameConfig: this.gameConfig,
      phase: this.phase,
      enableVoice: this.enableVoice,
      enableTextChat: this.enableTextChat,
      customGames: this.customGames,
    };
  }

  public applyHubState(state: HubState) {
    if (!state) return;
    this.selectedGame = state.selectedGame ?? null;
    this.activeGame = state.activeGame ?? null;
    this.gameConfig = state.gameConfig ?? null;
    this.phase = state.phase ?? 'HUB_LOBBY';
    if (state.enableVoice !== undefined) {
      this.enableVoice = state.enableVoice;
    }
    if (state.enableTextChat !== undefined) {
      this.enableTextChat = state.enableTextChat;
    }
    if (Array.isArray(state.customGames)) {
      this.customGames = state.customGames;
    }
    if (this.onHubStateUpdate) this.onHubStateUpdate(this.getHubState());
  }

  public setHubCustomGames(games: NonNullable<HubState['customGames']>) {
    this.customGames = games;
    if (this.isHost) this.broadcastHubState();
  }

  public broadcastHubState(excludePeerId?: string) {
    if (!this.isHost) return;
    this.broadcast({ type: 'SYNC_HUB_STATE', payload: this.getHubState(), sender: this.myPeerId || "" }, excludePeerId);
  }

  public setHubSelection(gameKey: string | null) {
    this.selectedGame = gameKey;
    this.phase = gameKey ? 'HUB_LOBBY' : 'HUB_LOBBY';
    this.broadcastHubState();
  }

  public setHubActiveGame(gameKey: string | null, phase: HubPhase = 'GAME_RUNNING') {
    this.activeGame = gameKey;
    this.phase = gameKey ? phase : 'HUB_LOBBY';
    this.broadcastHubState();
  }

  public setHubGameConfig(config: any) {
    this.gameConfig = config;
    this.broadcastHubState();
  }

  public resetHubState() {
    this.selectedGame = null;
    this.activeGame = null;
    this.gameConfig = null;
    this.phase = 'HUB_LOBBY';
    if (this.isHost) this.broadcastHubState();
  }

  // ---- Game PeerManager API (used by embedded games via externalPeerManager) ----

  public sendToHost(type: string, payload: Record<string, unknown>): void {
    // In-game REGISTER_SESSION refreshes the token; hub already owns username/avatar.
    if (type === "REGISTER_SESSION" && typeof payload.sessionToken === "string") {
      this.sessionToken = payload.sessionToken;
      this.persistHubSession();
    }

    if (this.isHost) {
      if (this.hostActionHandler && this.myPeerId) {
        this.hostActionHandler(this.myPeerId, { type, ...payload });
      }
      return;
    }
    if (!this.hostPeerId) return;
    const conn = this.connections.get(this.hostPeerId);
    if (conn?.open) {
      conn.send({ type, ...payload });
      return;
    }
    // Match p2play-core retry — conn may still be opening after Peer "open".
    const started = Date.now();
    const room = this.hostPeerId;
    const trySend = () => {
      const c = this.connections.get(room);
      if (c?.open) {
        c.send({ type, ...payload });
        return;
      }
      if (Date.now() - started < 5000) window.setTimeout(trySend, 100);
    };
    window.setTimeout(trySend, 50);
  }

  public broadcastState(state: any): void {
    if (this.isHost) this.broadcast({ type: 'STATE_UPDATE', state });
  }

  private peerIdsMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.length >= 4 && b.endsWith(a)) return true;
    if (b.length >= 4 && a.endsWith(b)) return true;
    return false;
  }

  private isHostConnection(conn: { peer: string }): boolean {
    if (!this.hostPeerId) return false;
    return this.peerIdsMatch(conn.peer, this.hostPeerId);
  }

  public getTrustedUsername(peerId: string | null | undefined): string | undefined {
    if (!peerId) return this.username || undefined;
    const lobby = this.lobbyPlayers.find((p) => this.peerIdsMatch(p.peerId, peerId));
    if (lobby?.username) return lobby.username;
    if (peerId === this.myPeerId && this.username) return this.username;
    return undefined;
  }

  public resolveChatSender(peerId: string | null | undefined): string {
    return (
      this.getTrustedUsername(peerId) ??
      (peerId ? `Joueur-${peerId.slice(0, 4)}` : this.username || "Joueur")
    );
  }

  public registerPeerProfile(peerId: string, profile: { username: string; avatar?: string }): void {
    if (!peerId) return;
    const existing = this.lobbyPlayers.find((p) => this.peerIdsMatch(p.peerId, peerId));
    if (!existing) return;
    // Lock non-empty salon names; allow fill-in if seat has no username yet.
    if (!existing.username && profile.username) existing.username = profile.username;
    if (profile.avatar) existing.avatar = profile.avatar;
  }

  public sendChat(_senderName: string, text: string): void {
    const chatMsg: ChatMessage = {
      type: 'CHAT',
      sender: this.resolveChatSender(this.myPeerId),
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      senderPeerId: this.myPeerId ?? undefined,
    };
    this.chatHistory = [...this.chatHistory.slice(-199), chatMsg];
    this.onChatReceived?.(chatMsg);
    if (this.isHost) {
      this.broadcast(chatMsg);
    } else if (this.hostPeerId) {
      const conn = this.connections.get(this.hostPeerId);
      if (conn && conn.open) conn.send(chatMsg);
    }
  }

  public sendAudio(sfx: string, intensity?: number): void {
    const audioMsg: NetworkMessage = {
      type: 'AUDIO_EVENT',
      sfx,
      ...(intensity !== undefined ? { intensity } : {}),
    };
    if (this.isHost) {
      this.broadcast(audioMsg);
      if (this.onAudioReceived) this.onAudioReceived(sfx, intensity);
    } else if (this.hostPeerId) {
      const conn = this.connections.get(this.hostPeerId);
      if (conn && conn.open) conn.send(audioMsg);
    }
  }

  public updateAvatar(newAvatar: string) {
    this.avatar = newAvatar;
    const me = this.lobbyPlayers.find(p => p.peerId === this.myPeerId);
    if (me) {
      me.avatar = newAvatar;
    }
    this.persistHubSession();
    if (this.isHost) {
      this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
    } else if (this.hostPeerId) {
      const hostConn = this.connections.get(this.hostPeerId);
      if (hostConn && hostConn.open) {
        hostConn.send({ type: 'UPDATE_AVATAR', payload: newAvatar, sender: this.myPeerId });
      }
    }
    if (this.onPlayersUpdate) this.onPlayersUpdate();
  }

  public startHeartbeat(): void {
    this.stopHeartbeat();
    const now = Date.now();
    this.connections.forEach((_conn, peerId) => this.lastPongReceived.set(peerId, now));

    this.heartbeatInterval = setInterval(() => {
      const ping = { type: 'PING', ts: Date.now() };
      const deadline = Date.now() - HEARTBEAT_TIMEOUT_MS;

      this.connections.forEach((conn) => {
        if (conn.open) conn.send(ping);
      });

      for (const [peerId, lastSeen] of this.lastPongReceived) {
        if (lastSeen < deadline && this.connections.has(peerId)) {
          console.warn(`[hub-p2play] heartbeat timeout for ${peerId}`);
          const conn = this.connections.get(peerId);
          this.connections.delete(peerId);
          this.lastPongReceived.delete(peerId);
          this.onPeerStatusChange?.(peerId, 'DISCONNECTED');
          if (this.isHost) {
            this.lobbyPlayers = this.lobbyPlayers.filter(p => p.peerId !== peerId);
            this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
          }
          if (this.onPlayersUpdate) this.onPlayersUpdate();
          try { conn?.close(); } catch { /* already dead */ }
        }
      }
    }, HEARTBEAT_MS);
  }

  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.lastPongReceived.clear();
  }

  public disconnect() {
    if (this.hostPeerId) clearSession(this.hostPeerId);
    this.stopHeartbeat();
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.myPeerId = null;
    this.hostPeerId = null;
    this.isHost = false;
    this.selectedGame = null;
    this.activeGame = null;
    this.gameConfig = null;
    this.phase = 'HUB_LOBBY';
    this.chatHistory = [];
    if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
  }
}
export const globalHubPeer = new HubPeerManager();
