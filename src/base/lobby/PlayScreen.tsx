import {
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import type {
  FeatureRegistry,
  FeatureScreenProps,
  ModeEntry,
  ModeRegistry,
  MultiplayerRegistry,
} from "@idosgames/module-sdk";
import {
  Button,
  Icon,
  outlined,
  panel,
  useStagger,
  useUiKit,
  v,
} from "@idosgames/react/ui";
import { gameModes } from "./model";
import { t } from "./i18n";

// The "Play" tab of the lobby: a button per installed game. One game — one big card; several — a
// card each. Pressing it switches the host to the game's mode: a game that lives inside the lobby sits
// in its frame (GameFrame.tsx), any other takes the whole screen with a button back (BackToLobby.tsx).
// A game that plays online (registered in ctx.multiplayer) also gets "With friends" — its rooms in
// the multiplayer system — while that system is on the app.

export function makePlayScreen(
  modes: ModeRegistry,
  navigate: (modeId: string) => void,
  online: MultiplayerRegistry,
  features: FeatureRegistry,
): ComponentType<FeatureScreenProps> {
  return function PlayScreen(): ReactNode {
    const list = useSyncExternalStore(modes.subscribe, modes.list, modes.list);
    const onlineGames = useSyncExternalStore(
      online.subscribe,
      online.listGames,
      online.listGames,
    );
    const rooms = useSyncExternalStore(
      features.subscribe,
      () => features.get("multiplayer")?.available === true,
      () => false,
    );
    const games = gameModes(list);
    const stagger = useStagger();
    const kit = useUiKit();
    const start = (mode: ModeEntry): void => {
      kit.play("open");
      navigate(mode.id);
    };

    return (
      <div
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns:
            games.length > 1
              ? "repeat(auto-fill, minmax(240px, 1fr))"
              : "minmax(0, 1fr)",
          maxWidth: games.length > 1 ? undefined : 520,
          margin: "0 auto",
        }}
      >
        {games.map((game, i) => (
          <div
            key={game.id}
            className="idos-shine"
            style={{
              ...panel,
              ...stagger(i),
              padding: games.length > 1 ? 18 : 26,
              display: "grid",
              gap: 14,
              justifyItems: "center",
              background: `linear-gradient(180deg, color-mix(in srgb, ${v.blue} 30%, ${v.panel}) 0%, ${v.panelDeep} 100%)`,
            }}
          >
            <div className="idos-bounce">
              <Icon
                glyph={game.icon ?? "star"}
                size={games.length > 1 ? 56 : 84}
              />
            </div>
            <div style={{ ...outlined, fontSize: 22, textAlign: "center" }}>
              {game.label}
            </div>
            <Button
              attract
              size="lg"
              style={{ minWidth: 180 }}
              onClick={() => start(game)}
              data-tutorial-anchor={`play:${game.id}`}
            >
              ▶ {t("play")}
            </Button>
            {rooms && onlineGames.some((g) => g.mode === game.id) ? (
              <Button
                tone="blue"
                style={{ minWidth: 180 }}
                onClick={() => features.open("multiplayer", { mode: game.id })}
                data-tutorial-anchor={`play-friends:${game.id}`}
              >
                <Icon glyph="friends" size={18} /> {t("withFriends")}
              </Button>
            ) : null}
          </div>
        ))}
        {games.length === 0 ? (
          <div style={{ ...outlined, color: v.textDim, textAlign: "center" }}>
            {t("noFeatures")}
          </div>
        ) : null}
      </div>
    );
  };
}
