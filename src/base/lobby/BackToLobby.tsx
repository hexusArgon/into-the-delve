import {
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import type { ModeRegistry } from "@idosgames/module-sdk";
import { IconButton } from "@idosgames/react/ui";
import { LOBBY_MODE } from "../app-config";
import { chromeFor } from "./model";
import { t } from "./i18n";

// Over a game that takes the whole screen (voxelcraft, board-game) the base draws only this: a small
// round button back to the lobby, in the top-left corner — the game keeps the screen. A game that
// lives inside the lobby (`inLobby`, idle-rpg) gets the lobby's frame instead (GameFrame.tsx).
// A game with its own "exit" calls ctx.navigate("lobby") instead; then delete this panel in
// ../module.ts.

export function makeBackToLobby(
  modes: ModeRegistry,
  navigate: (modeId: string) => void,
): ComponentType {
  return function BackToLobby(): ReactNode {
    const current = useSyncExternalStore(
      modes.subscribe,
      modes.current,
      modes.current,
    );
    if (chromeFor(modes.list(), current) !== "back") return null;
    return (
      <div
        style={{
          position: "absolute",
          top: "calc(var(--idos-safe-top, 0px) + 10px)",
          left: 10,
          pointerEvents: "auto",
        }}
      >
        <IconButton
          glyph="back"
          label={t("toLobby")}
          onClick={() => navigate(LOBBY_MODE)}
          size={40}
          tone="blue"
        />
      </div>
    );
  };
}
