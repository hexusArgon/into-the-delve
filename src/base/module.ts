import { defineModule, type Module } from "@idosgames/module-sdk";
import appConfig from "../app.config";
import { IDOS_WEB3, IDOS_WEB3_NETWORK_ID } from "../idos.title";
import { GAME_START, LOBBY_MODE, type AppConfig } from "./app-config";
import { makeLobbyPanel } from "./lobby/Lobby";
import { makePlayScreen } from "./lobby/PlayScreen";
import { makeBackToLobby } from "./lobby/BackToLobby";
import { makeFrameHeader, makeFrameTabs } from "./lobby/GameFrame";
import { PLAY, gameModes, hasWallet, startGame } from "./lobby/model";
import { t } from "./lobby/i18n";

// The base of every app on the platform — the lobby, the home the player lands on after sign-in (the
// sign-in itself is ./login, rendered by the host before any module runs). It is written against the
// same module contract as everything in src/modules/, and main.tsx installs it first.
//
//  - The lobby lays out the features of the installed modules (the shop, heroes, leaders…) as tabs,
//    with the balances, the wallet and the profile on top.
//  - A game whose route says `inLobby` (idle-rpg) sits INSIDE the lobby: over it the base keeps the
//    balances on top and the tabs at the bottom (./lobby/GameFrame.tsx), "Play" is that game, the
//    app starts in it. Any other game (voxelcraft, board-game) takes the whole screen: "Play" in the
//    lobby launches it, and over it the base draws only a small button back (./lobby/BackToLobby.tsx).
//  - It takes the shared-UI roles it draws for everybody, so games hide their own balances and wallet,
//    and the host draws no nav, ☰ or "Log out" of its own.
//
// What happens after sign-in and the order of the tabs: ../app.config.ts.
export const baseModule: Module = createBaseModule(appConfig, {
  web3: IDOS_WEB3,
  networkID: IDOS_WEB3_NETWORK_ID,
});

/** The web3 identity of the project (src/idos.title.ts) — whether the lobby offers the wallet. */
export interface BaseWeb3 {
  web3: boolean;
  networkID: string;
}

/** The base for a given app.config — the project uses `baseModule`; a test harness makes its own. */
export function createBaseModule(
  config: AppConfig,
  identity: BaseWeb3,
): Module {
  return defineModule({
    id: "base",
    meta: { name: "Base", type: "app", engine: "dom" },
    sharedUi: {
      provides: ["currency-bar", "wallet", "account", "menu", "modes"],
    },
    setup(ctx) {
      ctx.registerRoute({
        id: LOBBY_MODE,
        label: t("lobby"),
        icon: "🏠",
        order: -1000,
      });

      // The wallet lives next to the balances — for any web3 title (EVM or Solana).
      const wallet = hasWallet(identity);

      // `features.open(id)` from a game (the lobby is not on screen, its own presenter is gone): switch
      // to the lobby and let it open the screen on mount. While the lobby is shown, its presenter —
      // registered later — handles the request first.
      let pending: { id: string; args?: Record<string, unknown> } | null = null;
      ctx.features.setPresenter((id, args) => {
        pending = { id, args };
        ctx.navigate(LOBBY_MODE);
        return true;
      });

      // "Play" in the lobby with ONE game that lives inside the lobby (`inLobby`, idle-rpg) goes
      // straight into it — it sits in the lobby's frame below. Otherwise (a full-screen game, or
      // several) the "Play" screen shows the game cards.
      const openGame = (): boolean => {
        const games = gameModes(ctx.modes.list());
        const only = games.length === 1 ? games[0] : undefined;
        if (!only?.inLobby) return false;
        ctx.navigate(only.id);
        return true;
      };

      ctx.registerPanel({
        id: "lobby",
        slot: "overlay",
        component: makeLobbyPanel({
          features: ctx.features,
          lobby: config.lobby,
          wallet,
          onPlay: openGame,
          pending: {
            take: () => {
              const next = pending;
              pending = null;
              return next;
            },
          },
        }),
      });

      // The game inside the lobby: over a game the base keeps the lobby's balances on top and its tabs
      // at the bottom (the host's frame slots — the game is laid out between them).
      const frame = {
        features: ctx.features,
        modes: ctx.modes,
        lobby: config.lobby,
        wallet,
        openInLobby: (id: string) => {
          pending = { id };
          ctx.navigate(LOBBY_MODE);
        },
      };
      ctx.registerPanel({
        id: "frame-header",
        slot: "header",
        activeOnly: false,
        component: makeFrameHeader(frame),
      });
      ctx.registerPanel({
        id: "frame-tabs",
        slot: "footer",
        activeOnly: false,
        component: makeFrameTabs(frame),
      });
      // Over a game that takes the whole screen (voxelcraft, board-game) — only a button back.
      ctx.registerPanel({
        id: "back",
        slot: "modal",
        activeOnly: false,
        component: makeBackToLobby(ctx.modes, ctx.navigate),
      });

      // "Play" — only while there is something to play. The modes are known once every module is
      // installed, so this follows the list instead of reading it here.
      const PlayScreen = makePlayScreen(
        ctx.modes,
        ctx.navigate,
        ctx.multiplayer,
        ctx.features,
      );
      let offPlay: (() => void) | null = null;
      const syncPlay = (): void => {
        const hasGames = gameModes(ctx.modes.list()).length > 0;
        if (hasGames && !offPlay)
          offPlay = ctx.features.register({
            id: PLAY,
            label: t("play"),
            icon: "star",
            group: "events",
            order: 0,
            primary: true,
            Screen: PlayScreen,
          });
        else if (!hasGames && offPlay) {
          offPlay();
          offPlay = null;
        }
      };
      ctx.modes.subscribe(syncPlay);

      // app.config.ts `start`: a game's mode id starts straight in it (the host applies it on its first
      // render — no flash of the lobby). An id no module registered is ignored by the host.
      // "game" — the game that lives inside the lobby (`inLobby`, idle-rpg); an app with only
      // full-screen games (voxelcraft, board-game) starts in the lobby, "Play" launches them. The list
      // is filled once every module is installed, so this waits for it and decides once, and only
      // while nothing is on screen yet (the host has not shown the app).
      if (config.start === GAME_START) {
        let decided = false;
        ctx.modes.subscribe(() => {
          if (decided || ctx.modes.list().length === 0) return;
          decided = true;
          const game = startGame(ctx.modes.list());
          if (game && ctx.modes.current() === null) ctx.navigate(game.id);
        });
      } else if (config.start !== LOBBY_MODE) ctx.navigate(config.start);

      // The lobby is ordinary React in the DOM: an agent reads it as a tree and presses its buttons.
      // What is not on screen goes here — above all, why a tab is missing.
      ctx.exposeToAgent({
        state: () => ({
          mode: ctx.modes.current(),
          start: config.start,
          games: gameModes(ctx.modes.list()).map((m) => m.id),
          wallet,
          features: ctx.features.list().map((f) => ({
            id: f.id,
            module: f.moduleId,
            available: f.available,
            ...(f.unavailableReason
              ? { hiddenBecause: f.unavailableReason }
              : {}),
            badge: f.badge,
          })),
        }),
        actions: {
          go: (args) => ctx.navigate(String(args?.mode ?? LOBBY_MODE)),
          open: (args) => ctx.features.open(String(args?.feature ?? "")),
        },
        describeActions: {
          go: 'go({ mode }) — switch to a mode: "lobby" or a game\'s mode id',
          open: 'open({ feature }) — open a tab by feature id ("store", "character"…); false if it is hidden',
        },
      });
    },
  });
}
