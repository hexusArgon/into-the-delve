import { installPreviewProbe } from "./previewProbe";
import { bootHost } from "./boot-host";
import { IDOS_TITLE_ID } from "./idos.title";
import { mountLocalRoom } from "./local-room";

installPreviewProbe({ titleId: IDOS_TITLE_ID });

const app = document.getElementById("app");
if (!app) throw new Error("#app container not found");

// На адресе тайтла — вход (гость или кошелёк Solana) и сразу данж.
// Локально id в адресе нет, комната открывается без входа.
const hosted =
  typeof window !== "undefined" &&
  /\.idos\.games$/i.test(window.location.hostname.replace(/\.$/, ""));

if (hosted) bootHost(app);
else mountLocalRoom(app);
