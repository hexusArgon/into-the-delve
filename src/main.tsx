import { installPreviewProbe } from "./previewProbe";
import { IDOS_TITLE_ID } from "./idos.title";
import { mountLocalRoom } from "./local-room";

installPreviewProbe({ titleId: IDOS_TITLE_ID });

const app = document.getElementById("app");
if (!app) throw new Error("#app container not found");

// Тайтла ещё нет, поэтому комната открывается сразу, без входа.
// Когда в src/idos.title.ts появится id, вход и лобби поднимает src/boot-host.tsx.
mountLocalRoom(app);
