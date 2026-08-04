import { useState, useEffect, useCallback } from "react";
import type { ChatMessage } from "p2play-core";
import {
  clearRoomUrlFromAddressBar,
  subscribeForeignRoomReload,
  syncRoomUrlToAddressBar,
} from "p2play-core/url";
import { globalHubPeer } from "../network/peerManager";
import type { GameActionMessage, HubState } from "../network/protocol";
import { useCustomGames } from "./useCustomGames";

export function useHub() {
  const [status, setStatus] = useState<"CONNECTING" | "CONNECTED" | "DISCONNECTED">("DISCONNECTED");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ peerId: string; username: string; avatar: string }[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<string | null>(null);
  const [gameConfig, setGameConfig] = useState<any>(null);
  const [isHost, setIsHost] = useState(false);
  const [enableVoice, setEnableVoice] = useState(true);
  const [enableTextChat, setEnableTextChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => globalHubPeer.chatHistory);

  const {
    customGames,
    addCustomGameMeta,
    removeCustomGame: removeCustomGameBase,
    syncCustomGamesFromHub,
    seedHostCustomGames,
  } = useCustomGames();

  useEffect(() => {
    // Hub owns the salon chat store. usePeer chains over this handler while a game is mounted
    // and restores it on unmount — do not null onChatReceived here.
    globalHubPeer.onChatReceived = () => {
      setChatMessages([...globalHubPeer.chatHistory]);
    };
    globalHubPeer.onChatHistorySync = (msgs) => {
      setChatMessages([...msgs]);
    };
  }, []);

  const sendChat = useCallback((text: string) => {
    const localPlayer = globalHubPeer.lobbyPlayers.find((p) => p.peerId === globalHubPeer.myPeerId);
    const sender = localPlayer?.username || globalHubPeer.username || "Joueur";
    globalHubPeer.sendChat(sender, text);
  }, []);

  const updateAvatar = useCallback((avatar: string) => {
    globalHubPeer.updateAvatar(avatar);
  }, []);

  const removeCustomGame = useCallback(
    (key: string) => {
      removeCustomGameBase(key);
      setSelectedGame((prev) => (prev === key ? null : prev));
      setActiveGame((prev) => (prev === key ? null : prev));
    },
    [removeCustomGameBase],
  );

  const broadcastGameSelection = useCallback((gameKey: string) => {
    // Host-owned room control — guests must not broadcast SELECT_GAME.
    if (!globalHubPeer.isHost) return;
    setSelectedGame(gameKey);
    globalHubPeer.setHubSelection(gameKey);
  }, []);

  const launchGame = useCallback(
    (phase: "GAME_CONFIG" | "GAME_RUNNING" = "GAME_RUNNING") => {
      if (!globalHubPeer.isHost) return;
      const game = globalHubPeer.selectedGame || selectedGame;
      if (!game) return;
      setActiveGame(game);
      globalHubPeer.setHubActiveGame(game, phase);
    },
    [selectedGame],
  );

  const returnToHub = useCallback(() => {
    setActiveGame(null);
    setSelectedGame(null);
    setGameConfig(null);
    // Only the host may reset the shared room; guests just leave the local game view.
    if (globalHubPeer.isHost) {
      globalHubPeer.resetHubState();
    }
  }, []);

  const updateGameConfig = useCallback((config: any) => {
    setGameConfig(config);
    if (globalHubPeer.isHost) {
      globalHubPeer.setHubGameConfig(config);
    }
  }, []);

  useEffect(() => {
    if (status !== "CONNECTED" && status !== "CONNECTING") return;
    return subscribeForeignRoomReload(() => roomId);
  }, [status, roomId]);

  useEffect(() => {
    globalHubPeer.onStatusChange = (newStatus) => {
      setStatus(newStatus);
      if (newStatus === "CONNECTED") {
        const id = globalHubPeer.hostPeerId;
        setRoomId(id);
        if (id) syncRoomUrlToAddressBar(id);
      } else {
        setRoomId(null);
        setPlayers([]);
        setSelectedGame(null);
        setActiveGame(null);
        setGameConfig(null);
        clearRoomUrlFromAddressBar();
      }
    };

    globalHubPeer.onPlayersUpdate = () => {
      setPlayers([...globalHubPeer.lobbyPlayers]);
    };

    globalHubPeer.onHubStateUpdate = (state: HubState) => {
      setSelectedGame(state.selectedGame);
      setActiveGame(state.activeGame);
      setGameConfig(state.gameConfig);
      if (state.enableVoice !== undefined) setEnableVoice(state.enableVoice);
      if (state.enableTextChat !== undefined) setEnableTextChat(state.enableTextChat);
      if (Array.isArray(state.customGames)) syncCustomGamesFromHub(state.customGames);
    };

    globalHubPeer.onMessage = (sender, data: GameActionMessage) => {
      // Legacy control messages — only from room host (prefer SYNC_HUB_STATE).
      if (sender !== globalHubPeer.hostPeerId) return;
      switch (data.type) {
        case "SELECT_GAME":
          setSelectedGame(data.payload);
          break;
        case "START_GAME":
          setActiveGame(data.payload);
          break;
        case "RETURN_TO_HUB":
          setActiveGame(null);
          setSelectedGame(null);
          setGameConfig(null);
          break;
      }
    };

    return () => {
      globalHubPeer.onStatusChange = null;
      globalHubPeer.onPlayersUpdate = null;
      globalHubPeer.onHubStateUpdate = null;
      globalHubPeer.onMessage = null;
    };
  }, [status, roomId, syncCustomGamesFromHub]);

  const createRoom = useCallback(
    (
      roomName: string,
      username: string,
      avatar: string = "👑",
      voiceEnabled: boolean = true,
      textChatEnabled: boolean = true
    ) => {
      setIsHost(true);
      setEnableVoice(voiceEnabled);
      setEnableTextChat(textChatEnabled);
      seedHostCustomGames();
      globalHubPeer.initialize(true, roomName, username, avatar, voiceEnabled, textChatEnabled);
    },
    [seedHostCustomGames],
  );

  const joinRoom = useCallback((roomName: string, username: string, avatar: string = "👑") => {
    setIsHost(false);
    globalHubPeer.initialize(false, roomName, username, avatar);
  }, []);

  const disconnect = useCallback(() => {
    globalHubPeer.disconnect();
    setIsHost(false);
    setActiveGame(null);
    setSelectedGame(null);
    setGameConfig(null);
    setChatMessages([]);
    clearRoomUrlFromAddressBar();
  }, []);

  return {
    status,
    roomId,
    myPeerId: globalHubPeer.myPeerId,
    players,
    selectedGame,
    activeGame,
    gameConfig,
    customGames,
    phase: globalHubPeer.phase,
    hubPhase: globalHubPeer.phase,
    isHost,
    enableVoice,
    enableTextChat,
    chatMessages,
    sendChat,
    createRoom,
    joinRoom,
    updateAvatar,
    addCustomGameMeta,
    removeCustomGame,
    broadcastGameSelection,
    launchGame,
    updateGameConfig,
    returnToHub,
    disconnect,
    externalPeerManager: globalHubPeer,
  };
}
