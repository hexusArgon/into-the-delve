// The base of the app: sign-in (./login, rendered by the host) and the lobby (./module.ts, installed
// by main.tsx before the modules of src/modules.ts).

export { baseModule, createBaseModule, type BaseWeb3 } from "./module";
export { LoginScreen, type LoginScreenExtras } from "./login/LoginScreen";
export { PlayAccessScreen } from "./login/PlayAccessScreen";
export {
  defineAppConfig,
  GAME_START,
  LOBBY_MODE,
  type AppConfig,
  type AppConfigInput,
} from "./app-config";
