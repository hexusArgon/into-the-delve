import { mountGame } from "./modules/room/game/hub.ts";

export function mountLocalRoom(app: HTMLElement): void {
  const game = mountGame(app);
  game.setRunning(true);
}
