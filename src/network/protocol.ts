export type HubPhase = "HUB_LOBBY" | "GAME_CONFIG" | "GAME_RUNNING";

/** Metadata for a live GitHub game synced via HubState. */
export interface CustomGameMeta {
  /** Stable key: `custom--{owner}--{repo}` */
  key: string;
  name: string;
  repo: string;
  version?: string;
  desc?: string;
  emoji?: string;
  hasPreConfig: boolean;
  mountFn?: string;
  shellBackground?: string;
  avatars?: string[];
  downloadUrl?: string;
  addedAt: number;
  isCustom: true;
}

export interface HubState {
  selectedGame: string | null;
  activeGame: string | null;
  gameConfig: any | null;
  phase: HubPhase;
  enableVoice?: boolean;
  enableTextChat?: boolean;
  /** Host-owned live GitHub games mirrored to guests. */
  customGames?: CustomGameMeta[];
}

export interface GameActionMessage {
  type:
    | "SELECT_GAME"
    | "START_GAME"
    | "RETURN_TO_HUB"
    | "PLAYER_JOINED"
    | "SYNC_LOBBY"
    | "SYNC_HUB_STATE"
    | "CHAT_MESSAGE";
  payload?: any;
  sender: string;
}
