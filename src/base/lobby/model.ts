// Pure helpers of the lobby — covered by model.test.ts.

import type { ModeEntry } from "@idosgames/module-sdk";
import {
  sortFeatures,
  type FeatureMenuItem,
  type Layout,
} from "@idosgames/react/ui";
import type { AppConfig } from "../app-config";

/** The pseudo-feature "More" — the rest of the features, as a grid. */
export const MORE = "__more";

/** The lobby's own feature: the "Play" tab with a button per game. */
export const PLAY = "play";

export interface LobbyFeature extends FeatureMenuItem {
  primary?: boolean;
}

/** How many tabs fit next to "More" at this width (the desktop rail lists everything). */
export function tabSlots(layout: Layout): number {
  return layout === "phone"
    ? 5
    : layout === "tablet"
      ? 7
      : Number.POSITIVE_INFINITY;
}

/**
 * Applies app.config.ts on top of what the modules declared: the features named in `order` come
 * first, in that order, as main tabs; those in `primary` become main tabs too. Everything else keeps
 * the module's own `primary` / `order`.
 */
export function arrangeFeatures<T extends LobbyFeature>(
  features: readonly T[],
  lobby: AppConfig["lobby"],
): T[] {
  return features.map((f) => {
    const i = lobby.order.indexOf(f.id);
    if (i >= 0) return { ...f, primary: true, order: -1000 + i };
    if (lobby.primary.includes(f.id)) return { ...f, primary: true };
    return f;
  });
}

/**
 * Splits the game's features into the lobby's tabs and "More": main (primary) features by their
 * order take the tab slots first, secondary ones fill what is left; the rest goes under "More".
 * "More" appears only when it has something — an app with three screens has three tabs.
 */
export function splitTabs<T extends LobbyFeature>(
  features: readonly T[],
  layout: Layout,
): { tabs: T[]; more: T[] } {
  const primary = [...features]
    .filter((f) => f.primary)
    .sort(
      (a, b) =>
        (a.order ?? 100) - (b.order ?? 100) || a.label.localeCompare(b.label),
    );
  const secondary = sortFeatures(features.filter((f) => !f.primary));
  const ordered = [...primary, ...secondary];
  const slots = tabSlots(layout);
  if (ordered.length <= slots) return { tabs: ordered, more: [] };
  // One slot goes to "More" itself; main features claim the rest first.
  const room = Math.max(1, slots - 1);
  return { tabs: ordered.slice(0, room), more: ordered.slice(room) };
}

/** The modes the lobby offers to play: those of `game` modules, in the host's order. */
export function gameModes(modes: readonly ModeEntry[]): ModeEntry[] {
  return modes.filter((m) => m.moduleType === "game");
}

/**
 * What the base draws over the mode on screen: nothing in the lobby (it draws itself); the lobby's
 * frame around a game that lives inside it (`inLobby` — idle-rpg); a small button back over a game
 * that takes the whole screen (voxelcraft, board-game).
 */
export function chromeFor(
  modes: readonly ModeEntry[],
  current: string | null,
): "none" | "frame" | "back" {
  const mode = modes.find((m) => m.id === current);
  if (!mode || mode.moduleType !== "game") return "none";
  return mode.inLobby ? "frame" : "back";
}

/** `start: "game"`: the game that lives inside the lobby — the first one; none → stay in the lobby. */
export function startGame(modes: readonly ModeEntry[]): ModeEntry | undefined {
  return gameModes(modes).find((m) => m.inLobby);
}

/**
 * Whether the lobby offers the wallet: a web3 title with a network — EVM or Solana alike, the panel
 * is the same for both (it picks the chain from the title's networks by itself).
 */
export function hasWallet(identity: {
  web3: boolean;
  networkID: string;
}): boolean {
  return identity.web3 && identity.networkID.length > 0;
}
