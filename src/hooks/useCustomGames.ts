import { useCallback, useState } from "react";
import { globalHubPeer } from "../network/peerManager";
import type { CustomGameMeta } from "../network/protocol";
import {
  loadStoredCustomGames,
  mergeCustomGamesIntoStorage,
  removeCustomGameFromStorage,
  saveCustomGameToStorage,
} from "../utils/customGameLoader";

/**
 * Host/guest catalog of live GitHub games (localStorage + hub state sync).
 * Kept separate from useHub networking/lifecycle.
 */
export function useCustomGames() {
  const [customGames, setCustomGames] = useState<CustomGameMeta[]>(() => loadStoredCustomGames());

  const addCustomGameMeta = useCallback((meta: CustomGameMeta) => {
    const updated = saveCustomGameToStorage(meta);
    setCustomGames(updated);
    if (globalHubPeer.isHost) globalHubPeer.setHubCustomGames(updated);
  }, []);

  const removeCustomGame = useCallback((key: string) => {
    const updated = removeCustomGameFromStorage(key);
    setCustomGames(updated);
    if (globalHubPeer.isHost) globalHubPeer.setHubCustomGames(updated);
    return key;
  }, []);

  const syncCustomGamesFromHub = useCallback((games: CustomGameMeta[]) => {
    setCustomGames(mergeCustomGamesIntoStorage(games));
  }, []);

  const seedHostCustomGames = useCallback(() => {
    globalHubPeer.customGames = loadStoredCustomGames();
  }, []);

  return {
    customGames,
    addCustomGameMeta,
    removeCustomGame,
    syncCustomGamesFromHub,
    seedHostCustomGames,
  };
}
