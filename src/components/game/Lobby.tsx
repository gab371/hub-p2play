import { P2PlayLobby } from "p2play-core";
import { AvatarSelector } from "./AvatarSelector";

interface LobbyProps {
  status: 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';
  onCreate: (name: string, username: string, avatar: string, enableVoice: boolean) => void;
  onJoin: (name: string, username: string, avatar: string) => void;
}

export function Lobby({ status, onCreate, onJoin }: LobbyProps) {
  return (
    <P2PlayLobby
      title="P2PLAY"
      subtitle="Votre Hub de Jeux de Société P2P Sans Serveur"
      theme="violet"
      status={status}
      maxUsernameLength={15}
      showCharacterCounter={false}
      bannerFollowsAvatar
      subtitleTransform="none"
      usernameLabel="Votre Pseudo"
      usernamePlaceholder="Entrez votre pseudo..."
      createButtonText="Créer un salon"
      joinCodeLabel="Saisir le code du salon"
      joinCodePlaceholder="CODE DU SALON..."
      joinButtonText="Rejoindre un salon"
      onCreateRoom={(code, username, avatar, enableVoice) => onCreate(code, username, avatar, enableVoice)}
      onJoinRoom={(code, username, avatar) => onJoin(code, username, avatar)}
      renderAvatarSelector={({ selectedAvatar, onSelectAvatar }) => (
        <AvatarSelector selectedAvatar={selectedAvatar} onSelectAvatar={onSelectAvatar} layout="grid" />
      )}
      classes={{
        root: "max-w-md mx-auto p-8 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800 rounded-3xl shadow-2xl relative text-center",
        header: "text-center mb-6",
        emoji: "text-6xl inline-block mb-4 animate-bounce",
        title: "text-4xl font-black bg-gradient-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent tracking-tight mb-2",
        subtitle: "text-zinc-400 text-sm mb-6",
        content: "space-y-6",
        inputGroup: "text-left",
        labelWrapper: "mb-2",
        label: "block text-xs font-bold uppercase tracking-wider text-zinc-500",
        input: "w-full px-4 py-3 rounded-2xl bg-[#09090b] dark:bg-[#09090b] border border-zinc-800 focus:border-violet-500 text-zinc-100 outline-none transition-all disabled:opacity-50 text-center font-bold",
        hr: "border-t border-zinc-800 my-4",
        actionGroup: "flex flex-col gap-3",
        createButton: "w-full py-3.5 px-6 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-violet-900/30",
        divider: "relative flex items-center justify-center my-4",
        dividerLine: "flex-grow border-t border-zinc-800",
        dividerText: "relative flex-shrink-0 px-3 text-xs uppercase font-bold text-zinc-500 bg-zinc-900",
        joinWrapper: "space-y-3",
        joinInput: "w-full px-4 py-3 rounded-2xl bg-[#09090b] dark:bg-[#09090b] border border-zinc-800 focus:border-violet-500 text-zinc-100 outline-none transition-all disabled:opacity-50 text-center font-bold tracking-widest uppercase font-mono",
        joinButton: "w-full py-3.5 px-6 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed",
      }}
    />
  );
}
