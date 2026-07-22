export interface GameActionMessage {
  type: 'SELECT_GAME' | 'START_GAME' | 'RETURN_TO_HUB' | 'PLAYER_JOINED' | 'CHAT_MESSAGE';
  payload?: any;
  sender: string;
}
