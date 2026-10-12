import {
  useRef,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import type { FeatureRegistry, ModeRegistry } from "@idosgames/module-sdk";
import { useLayout, useUiKit, v } from "@idosgames/react/ui";
import type { AppConfig } from "../app-config";
import { BottomTabs, LobbyHeader } from "./Lobby";
import { PLAY, arrangeFeatures, chromeFor, splitTabs } from "./model";

// The game inside the lobby — only a game whose route says `inLobby` (idle-rpg); a full-screen game
// (voxelcraft, board-game) gets just the button back (BackToLobby.tsx). While such a game is on
// screen the base keeps the lobby around it: the same balances, wallet and profile on top (the
// host's `header` slot), the same tabs at the bottom (its `footer` slot) with "Play" lit — "Play"
// IS the game. Any other tab opens that screen in the lobby.
// The host lays the game's canvas and panels out between the two, so a game needs to know nothing.
// In the lobby itself both render nothing — it draws its own.

export interface GameFrameOptions {
  features: FeatureRegistry;
  modes: ModeRegistry;
  /** `lobby` of src/app.config.ts — the same tab order as in the lobby. */
  lobby: AppConfig["lobby"];
  wallet: boolean;
  /** Switch to the lobby and open this screen there (a feature id, or the "More" grid). */
  openInLobby: (id: string) => void;
}

/** A game that lives inside the lobby (`inLobby`) is on screen — a full-screen game is not framed. */
function useInGame(modes: ModeRegistry): boolean {
  const current = useSyncExternalStore(
    modes.subscribe,
    modes.current,
    modes.current,
  );
  return chromeFor(modes.list(), current) === "frame";
}

export function makeFrameHeader(options: GameFrameOptions): ComponentType {
  return function GameFrameHeader(): ReactNode {
    const features = useSyncExternalStore(
      options.features.subscribe,
      options.features.list,
      options.features.list,
    );
    if (!useInGame(options.modes)) return null;
    const store = features.some((f) => f.id === "store" && f.available);
    return (
      <LobbyHeader
        features={options.features}
        wallet={options.wallet}
        pad={12}
        onStore={store ? () => options.openInLobby("store") : null}
        style={{
          padding: "8px 12px 8px",
          background: `linear-gradient(180deg, ${v.bgTop}, ${v.panelDeep})`,
          borderBottom: `2px solid ${v.panelEdge}`,
        }}
      />
    );
  };
}

export function makeFrameTabs(options: GameFrameOptions): ComponentType {
  return function GameFrameTabs(): ReactNode {
    const all = useSyncExternalStore(
      options.features.subscribe,
      options.features.list,
      options.features.list,
    );
    const ref = useRef<HTMLDivElement>(null);
    const layout = useLayout(ref);
    const kit = useUiKit();
    const inGame = useInGame(options.modes);
    if (!inGame) return null;

    // The lobby's own split; on a wide screen the lobby has a side rail, over a game — the pill.
    const list = arrangeFeatures(
      all.filter((f) => f.available),
      options.lobby,
    );
    const { tabs, more } = splitTabs(
      list,
      layout === "desktop" ? "tablet" : layout,
    );
    return (
      // The tabs place themselves in the lobby grid's "tabs" area — the same one area here.
      <div ref={ref} style={{ display: "grid", gridTemplateAreas: '"tabs"' }}>
        <BottomTabs
          tabs={tabs}
          more={
            more.length > 0
              ? {
                  badge: more.reduce((s, f) => s + (f.badge > 0 ? 1 : 0), 0),
                  counter: more.some((f) => f.id === "inventory"),
                }
              : null
          }
          current={PLAY}
          pill={layout !== "phone"}
          onPick={(id) => {
            if (id === PLAY) return;
            kit.play("tab");
            options.openInLobby(id);
          }}
        />
      </div>
    );
  };
}
