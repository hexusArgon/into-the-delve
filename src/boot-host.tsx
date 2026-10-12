import { createIDosGamesClient } from "@idosgames/core";
import { mountHost } from "@idosgames/app-shell";
import { baseModule, LoginScreen, PlayAccessScreen } from "./base";
import { modules } from "./modules";
import { renderWalletLogin } from "./walletLogin";
import { TITLE_ID, BUILD_KEY } from "./config";
import { IS_DEV } from "./env";
import ui from "./ui.config";

export function bootHost(app: HTMLElement): void {
  const client = createIDosGamesClient({
    titleID: TITLE_ID,
    buildKey: BUILD_KEY.length > 0 ? BUILD_KEY : undefined,
    throttleMs: 0,
  });

  client.on("error:global", (message) => {
    console.error("[idos] global error:", message);
  });
  client.on("error:connection", (message) => {
    console.error("[idos] connection error:", message);
  });

  if (IS_DEV) {
    (globalThis as typeof globalThis & { idosClient?: typeof client }).idosClient = client;
  }

  mountHost({
    container: app,
    client,
    modules: [baseModule, ...modules],
    renderLogin: (props) => <LoginScreen {...props} renderWalletLogin={renderWalletLogin} />,
    renderPlayAccess: (props) => <PlayAccessScreen {...props} />,
    ui,
  });
}
