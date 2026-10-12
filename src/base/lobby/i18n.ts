import { makeT } from "@idosgames/react/ui";

// Strings of the lobby. Names of currencies, items and the rest are the publisher's words (title
// config), and every tab's label is its module's own.

const EN = {
  lobby: "Lobby",
  toLobby: "To the lobby",
  play: "Play",
  withFriends: "With friends",
  more: "More",
  profile: "Profile",
  playerId: "Player ID",
  copyId: "Copy ID",
  copied: "Copied",
  logout: "Log out",
  wallet: "Wallet",
  noFeatures:
    "Nothing to show yet. Tabs appear as the app's modules (shop, heroes, leaderboards…) get their settings on the title.",
} as const;

export type StringKey = keyof typeof EN;

export const t = makeT<StringKey>(EN, {
  lobby: "Лобби",
  toLobby: "В лобби",
  play: "Играть",
  withFriends: "С друзьями",
  more: "Ещё",
  profile: "Профиль",
  playerId: "ID игрока",
  copyId: "Скопировать ID",
  copied: "Скопировано",
  logout: "Выйти",
  wallet: "Кошелёк",
  noFeatures:
    "Пока здесь пусто. Вкладки появляются, когда модулям приложения (магазин, герои, лидеры…) заданы настройки в тайтле.",
});
