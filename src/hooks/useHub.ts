import { useState, useEffect, useCallback } from "react";
import { globalHubPeer } from "../network/peerManager";
import type { GameActionMessage } from "../network/protocol";

export function useHub() {
  const [status, setStatus] = useState<'CONNECTING' | 'CONNECTED' | 'DISCONNECTED'>('DISCONNECTED');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ peerId: string; username: string; avatar: string }[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  const updateAvatar = useCallback((avatar: string) => {
    globalHubPeer.updateAvatar(avatar);
  }, []);

  const broadcastGameSelection = useCallback((gameKey: string) => {
    setSelectedGame(gameKey);
    globalHubPeer.broadcast({ type: 'SELECT_GAME', payload: gameKey, sender: globalHubPeer.myPeerId || "" });
  }, []);

  const launchGame = useCallback(() => {
    if (!selectedGame) return;
    setActiveGame(selectedGame);
    globalHubPeer.broadcast({ type: 'START_GAME', payload: selectedGame, sender: globalHubPeer.myPeerId || "" });
  }, [selectedGame]);

  const returnToHub = useCallback(() => {
    setActiveGame(null);
    setSelectedGame(null);
    globalHubPeer.broadcast({ type: 'RETURN_TO_HUB', sender: globalHubPeer.myPeerId || "" });
  }, []);

  useEffect(() => {
    globalHubPeer.onStatusChange = (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'CONNECTED') {
        setRoomId(globalHubPeer.hostPeerId);
      } else {
        setRoomId(null);
        setPlayers([]);
      }
    };

    globalHubPeer.onPlayersUpdate = () => {
      setPlayers([...globalHubPeer.lobbyPlayers]);
    };

    globalHubPeer.onMessage = (sender, data: GameActionMessage) => {
      switch (data.type) {
        case 'SELECT_GAME':
          setSelectedGame(data.payload);
          break;
        case 'START_GAME':
          setActiveGame(data.payload);
          break;
        case 'RETURN_TO_HUB':
          setActiveGame(null);
          setSelectedGame(null);
          break;
      }
    };

    return () => {
      globalHubPeer.onStatusChange = null;
      globalHubPeer.onPlayersUpdate = null;
      globalHubPeer.onMessage = null;
    };
  }, []);

  const createRoom = useCallback((roomName: string, username: string, avatar: string = "👑") => {
    setIsHost(true);
    globalHubPeer.initialize(true, roomName, username, avatar);
  }, []);

  const joinRoom = useCallback((roomName: string, username: string, avatar: string = "👑") => {
    setIsHost(false);
    globalHubPeer.initialize(false, roomName, username, avatar);
  }, []);

  const disconnect = useCallback(() => {
    globalHubPeer.disconnect();
    setIsHost(false);
    setActiveGame(null);
    setSelectedGame(null);
  }, []);

  return {
    status,
    roomId,
    myPeerId: globalHubPeer.myPeerId,
    players,
    selectedGame,
    activeGame,
    isHost,
    createRoom,
    joinRoom,
    updateAvatar,
    disconnect,
    broadcastGameSelection,
    launchGame,
    returnToHub,
    externalPeerManager: globalHubPeer
  };
}
