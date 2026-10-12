// The shape of src/app.config.ts and its defaults.
//
// app.config.ts says what happens after sign-in and how the lobby is ordered. It does NOT list which
// systems the app has — that is src/modules.ts: every installed module (shop, heroes, a game…) brings
// its own tab or mode, and removing it there removes it from the app.

/** The mode id of the lobby. Every other mode is a module's route (a game). */
export const LOBBY_MODE = "lobby";

/** `start` value: the game that lives inside the lobby (its route says `inLobby`); none — the lobby. */
export const GAME_START = "game";

export interface AppConfig {
  /**
   * Where the player lands after sign-in: `"game"` (the default) — straight into the game that lives
   * inside the lobby (idle-rpg), or the lobby when the app's games take the whole screen (voxelcraft,
   * board-game); `"lobby"`; or the mode id of a particular game. From a game the lobby stays one tap
   * away.
   */
  start: string;
  lobby: {
    /** These tabs first, in this order (feature ids: "play", "store", "character"…). */
    order: readonly string[];
    /** Also shown as main tabs rather than under "More" (feature ids). */
    primary: readonly string[];
  };
}

export interface AppConfigInput {
  start?: string;
  lobby?: {
    order?: readonly string[];
    primary?: readonly string[];
  };
}

/** Fills in the defaults — every field of app.config.ts is optional. */
export function defineAppConfig(input: AppConfigInput = {}): AppConfig {
  const start = input.start?.trim();
  return {
    start: start ? start : GAME_START,
    lobby: {
      order: input.lobby?.order ?? [],
      primary: input.lobby?.primary ?? [],
    },
  };
}
