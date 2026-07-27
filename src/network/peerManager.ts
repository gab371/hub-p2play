import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { ChatMessage, NetworkMessage, PeerManagerLike } from "p2play-core";
import type { HubPhase, HubState } from "./protocol";

export class HubPeerManager implements PeerManagerLike {
  private peer: Peer | null = null;
  public myPeerId: string | null = null;
  public hostPeerId: string | null = null;
  public connections: Map<string, DataConnection> = new Map();
  public isHost: boolean = false;

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
  public chatHistory: ChatMessage[] = [];
  public onChatHistorySync: ((messages: ChatMessage[]) => void) | null = null;

  public initialize(isHost: boolean, roomId: string, username: string, avatar: string = "👑", enableVoice: boolean = true) {
    this.isHost = isHost;
    this.username = username;
    this.avatar = avatar;
    this.enableVoice = enableVoice;
    this.chatHistory = [];
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
      if (isHost) {
        this.lobbyPlayers[0].peerId = id;
      }
      if (this.onStatusChange) this.onStatusChange('CONNECTED');
      if (this.onPlayersUpdate) this.onPlayersUpdate();

      if (!isHost && roomId) {
        const conn = this.peer!.connect(roomId);
        this.setupConnection(conn);
      }
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
      this.onPeerStatusChange?.(conn.peer, 'CONNECTED');
      
      // If we are a client connecting to host, let the host know our username & avatar
      if (!this.isHost && conn.peer === this.hostPeerId) {
        conn.send({ type: 'PLAYER_JOINED', payload: { username: this.username, avatar: this.avatar }, sender: this.myPeerId });
      }
    });

    conn.on("data", (data: any) => {
      if (data.type === 'PLAYER_JOINED' && this.isHost) {
        // Add new player to lobby mapping
        const playerObj = typeof data.payload === 'string' 
          ? { username: data.payload, avatar: "👑" } 
          : data.payload;
        if (!this.lobbyPlayers.some(p => p.peerId === data.sender)) {
          this.lobbyPlayers.push({ peerId: data.sender, username: playerObj.username, avatar: playerObj.avatar || "👑" });
        }
        // Broadcast the updated list to all players
        this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
        // Sync the current Hub state (selected game / active game / config) to the late joiner
        this.send(data.sender, { type: 'SYNC_HUB_STATE', payload: this.getHubState(), sender: this.myPeerId || "" });
        this.send(data.sender, { type: 'CHAT_HISTORY_SYNC', messages: this.chatHistory });
        if (this.onPlayersUpdate) this.onPlayersUpdate();
      } else if (data.type === 'UPDATE_AVATAR' && this.isHost) {
        const player = this.lobbyPlayers.find(p => p.peerId === data.sender);
        if (player) {
          player.avatar = data.payload;
          this.broadcast({ type: 'SYNC_LOBBY', payload: this.lobbyPlayers });
          if (this.onPlayersUpdate) this.onPlayersUpdate();
        }
      } else if (data.type === 'SYNC_LOBBY') {
        this.lobbyPlayers = data.payload;
        if (this.onPlayersUpdate) this.onPlayersUpdate();

        // Full Mesh Auto-Connection: establish direct PeerJS DataConnection to all non-host peers
        if (!this.isHost && Array.isArray(this.lobbyPlayers)) {
          this.lobbyPlayers.forEach(p => {
            if (p.peerId && p.peerId !== this.myPeerId && !this.connections.has(p.peerId)) {
              const peerConn = this.peer?.connect(p.peerId);
              if (peerConn) {
                this.setupConnection(peerConn);
              }
            }
          });
        }
      } else if (data.type === 'SYNC_HUB_STATE') {
        this.applyHubState(data.payload);
      }

      if (this.onMessage) {
        this.onMessage(conn.peer, data);
      }

      // Game-level message routing (embedded games reuse this peer manager)
      switch (data.type) {
        case 'STATE_UPDATE':
          if (this.onStateReceived && data.state) this.onStateReceived(data.state);
          return;
        case 'CHAT':
          this.chatHistory = [...this.chatHistory.slice(-199), data];
          if (this.onChatReceived) this.onChatReceived(data);
          if (this.isHost) this.broadcast(data, conn.peer); // relay to other merchants
          return;
        case 'CHAT_HISTORY_SYNC':
          if (data.messages && Array.isArray(data.messages)) {
            this.chatHistory = data.messages;
            if (this.onChatHistorySync) this.onChatHistorySync(this.chatHistory);
          }
          return;
        case 'AUDIO_EVENT':
          if (this.onAudioReceived && data.sfx) this.onAudioReceived(data.sfx);
          if (this.isHost) this.broadcast(data, conn.peer); // relay to other merchants
          return;
        case 'VOICE_STATE_UPDATE':
        case 'VOICE_MODERATION_ACTION':
          if (this.onVoiceMessage) this.onVoiceMessage(data);
          if (this.isHost) this.broadcast(data, conn.peer);
          return;
        case 'ACTION':
          if (this.isHost && this.hostActionHandler) this.hostActionHandler(conn.peer, data);
          return; // host engine processes; do not relay raw actions
        default:
          if (this.onCustomMessage) this.onCustomMessage(data);
          break;
      }

      // If we are host, broadcast non-join hub messages to other clients.
      // SYNC_LOBBY / SYNC_HUB_STATE are host-owned and must never be relayed from a client.
      if (this.isHost && data.type !== 'PLAYER_JOINED' && data.type !== 'UPDATE_AVATAR'
          && data.type !== 'SYNC_LOBBY' && data.type !== 'SYNC_HUB_STATE') {
        this.broadcast(data, conn.peer);
      }
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);
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
    if (this.isHost) {
      if (this.hostActionHandler && this.myPeerId) {
        this.hostActionHandler(this.myPeerId, { type, ...payload });
      }
    } else if (this.hostPeerId) {
      const conn = this.connections.get(this.hostPeerId);
      if (conn && conn.open) conn.send({ type, ...payload });
    }
  }

  public broadcastState(state: any): void {
    if (this.isHost) this.broadcast({ type: 'STATE_UPDATE', state });
  }

  public sendChat(senderName: string, text: string): void {
    const chatMsg: ChatMessage = {
      type: 'CHAT',
      sender: senderName,
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

  public disconnect() {
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
