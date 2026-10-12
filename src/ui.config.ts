import { defineUiConfig } from "@idosgames/react/ui";

// The game's interface in ONE place: colours, animations and sounds of every module built on
// @idosgames/react/ui (shop, inventory, heroes, rewards, marketplace, …). Change them here — never in
// a module: an edited catalog module is marked "customized" and stops getting catalog updates.
//
// Everything is optional; what you leave out keeps its default. Uncomment and edit.
export default defineUiConfig({
  theme: {
    // bgTop: "#232a6b",          // screen background, top of the gradient
    // bgBottom: "#0d1033",       // … and bottom
    // panel: "#2c3480",          // cards and popups
    // panelEdge: "#4f5bc9",      // their frame
    // gold: "#ffd24a",           // prices, highlights, the "claim" button
    // green: "#59d35b",          // main action buttons
    // radius: 18,                // corner radius of cards, px
    // buttonRadius: 14,          // corner radius of buttons, px
    // font: "'Baloo 2', 'Nunito', system-ui, sans-serif",
    // rarity: { Mythic: "#ff3df5" },   // frame colour of a rarity id (adds to Common…Legendary)
  },
  motion: {
    // enabled: true,             // false — no animations at all
    // speed: 1,                  // 2 — twice as fast, 0.5 — twice as slow
    // intensity: 1,              // bounce/overshoot strength: 0 none … 2 cartoonish
    // rewardFlight: true,        // reward icons fly to the balance counters
    // particles: true,           // particle bursts on claims and purchases
    // stagger: true,             // lists appear item by item
    // respectReducedMotion: true,// follow the system "reduce motion" setting
  },
  sound: {
    // enabled: true,             // false — a silent interface
    // volume: 0.6,               // master volume 0..1 (the player's own volume multiplies it)
    events: {
      // Built-in sounds are synthesized in code (no files). Per event:
      //   "coin"                         — the built-in sound of another event
      //   { url: "https://…/click.mp3" } — your own file (optional volume: 0..1)
      //   { synth: { notes: [{ freq: 880, dur: 0.08, wave: "triangle" }] } } — your own synth
      //   false                          — silence
      // Events: click, tab, open, close, reward, coin, purchase, claim, error, notify, lootbox,
      // levelUp, countTick.
      // click: "tab",
      // countTick: false,
    },
  },
});
