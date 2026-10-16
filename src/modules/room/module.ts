import { defineModule } from "@idosgames/module-sdk";
import { mountGame } from "./game/hub.ts";

export const roomModule = defineModule({
  id: "room",
  meta: { name: "Dungeon", type: "game", genre: "tactics", engine: "dom" },
  setup(ctx) {
    let game: ReturnType<typeof mountGame> | null = null;
    ctx.registerScene({
      surface: "fullbleed-canvas",
      mount(scene) {
        game = mountGame(scene.host, ctx.client);
      },
      activate() {
        game?.setRunning(true);
      },
      suspend() {
        game?.setRunning(false);
      },
      destroy() {
        game?.destroy();
        game = null;
      },
    });
    ctx.registerRoute({ id: "room", label: "Dungeon", icon: "⚔" });
  },
});
