import Peer from "peerjs";
import type { DataConnection } from "peerjs";

export class HubPeerManager {
  private peer: Peer | null = null;
  public myPeerId: string | null = null;
  public hostPeerId: string | null = null;
  public connections: Map<string, DataConnection> = new Map();
  public isHost: boolean = false;

  public onStatusChange: ((status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED') => void) | null = null;
  public onMessage: ((sender: string, data: any) => void) | null = null;
  public onPlayersUpdate: (() => void) | null = null;

  public username: string = "";
  public avatar: string = "👑";
  public lobbyPlayers: { peerId: string; username: string; avatar: string }[] = [];

  public initialize(isHost: boolean, roomId: string, username: string, avatar: string = "👑") {
    this.isHost = isHost;
    this.username = username;
    this.avatar = avatar;
    this.lobbyPlayers = [{ peerId: isHost ? roomId : "", username, avatar }];
    
    const peerId = isHost 
      ? roomId 
      : `${username.replace(/[^a-zA-Z0-9]/g, '')}_${roomId}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    
    this.peer = new Peer(peerId);
    
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
      if (this.isHost) {
        this.setupConnection(conn);
      }
    });

    this.peer.on("disconnected", () => {
      if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
    });

    this.peer.on("error", (err) => {
      console.error("PeerJS Error:", err);
      if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
    });
  }

  private setupConnection(conn: DataConnection) {
    conn.on("open", () => {
      this.connections.set(conn.peer, conn);
      
      // If we are a client, let the host know our username & avatar
      if (!this.isHost) {
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
      }

      if (this.onMessage) {
        this.onMessage(conn.peer, data);
      }
      
      // If we are host, broadcast non-join messages to other clients
      if (this.isHost && data.type !== 'PLAYER_JOINED' && data.type !== 'UPDATE_AVATAR') {
        this.broadcast(data, conn.peer);
      }
    });

    conn.on("close", () => {
      this.connections.delete(conn.peer);
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
    if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
  }
}
export const globalHubPeer = new HubPeerManager();
