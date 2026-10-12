import { defineAppConfig } from "./base/app-config";

// What happens after sign-in and how the lobby is ordered. The look, animations and sounds are in
// ./ui.config.ts. Which systems (shop, heroes, leaderboards…) and games the app has is
// ./modules.ts: remove a module there and its tab is gone. A tab whose system has nothing configured
// on the title yet (no store offers, no heroes…) stays hidden from players by itself.
//
// Everything is optional; uncomment and edit.
export default defineAppConfig({
  // "game" — sign-in → straight into a game that lives inside the lobby (idle-rpg); an app whose
  // games take the whole screen (voxelcraft, board-game) starts in the lobby. "lobby" — always
  // sign-in → lobby → "Play". The mode id of a game ("voxelcraft") starts in that one.
  start: "room",
  lobby: {
    // order: ["play", "store", "character"], // these tabs first, in this order
    // primary: ["season"],                    // also a main tab rather than under "More"
  },
});
