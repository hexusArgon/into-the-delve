import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { FeatureEntry, FeatureRegistry } from "@idosgames/module-sdk";
import { useUserState } from "@idosgames/react";
import {
  Badge,
  EmptyState,
  FeatureGrid,
  Icon,
  IconButton,
  type Layout,
  ON_TONE,
  outlined,
  ResourceCounter,
  screenBackground,
  uiT,
  useCatalog,
  useLayout,
  useUiKit,
  v,
} from "@idosgames/react/ui";
import type { AppConfig } from "../app-config";
import { Account } from "./Account";
import { WalletButton } from "./WalletButton";
import { MORE, PLAY, arrangeFeatures, splitTabs } from "./model";
import { t } from "./i18n";

// The lobby — the app's home. Its tabs are the modules' features (ctx.features — the shop, heroes,
// leaders, rewards, the marketplace… and "Play" with a button per game); the lobby only lays them
// out, in three layouts by its width:
//  - phone: balances, the wallet and the profile on top, the screen, 4 tabs + "More" at the bottom;
//  - tablet: the same frame, the tab bar a centred pill with room for 6;
//  - desktop: every feature in a side rail, grouped; the screen gets up to 1120px.
// It is also the PRESENTER of features while on screen: `features.open(id)` from any module switches
// the lobby to that screen. A feature the title has nothing for yet (`available: false`) is not
// shown; remove a module from src/modules.ts and its tab is gone.

export interface LobbyOptions {
  features: FeatureRegistry;
  /** `lobby` of src/app.config.ts: tabs to put first / to lift out of "More". */
  lobby: AppConfig["lobby"];
  /** Show the wallet button — a web3 title on an EVM network. */
  wallet: boolean;
  /**
   * A screen asked for while the lobby was not on screen (a game's "Open for friends"): the base
   * switched to the lobby, the lobby opens it on mount. See `createBaseModule`.
   */
  pending?: { take(): { id: string; args?: Record<string, unknown> } | null };
  /**
   * The "Play" tab was picked: switch to the game and return true (the game then sits inside the
   * lobby's frame — ./GameFrame.tsx), or false to show the "Play" screen (several games).
   */
  onPlay?: () => boolean;
}

const CONTENT_MAX: Record<Layout, number> = {
  phone: 760,
  tablet: 900,
  desktop: 1120,
};

export function makeLobbyPanel(options: LobbyOptions): ComponentType {
  return function LobbyPanel(): ReactNode {
    return <Lobby options={options} />;
  };
}

interface Active {
  id: string;
  args?: Record<string, unknown>;
}

function Lobby({ options }: { options: LobbyOptions }): ReactNode {
  const { features } = options;
  const all = useSyncExternalStore(
    features.subscribe,
    features.list,
    features.list,
  );
  const list = arrangeFeatures(
    all.filter((f) => f.available),
    options.lobby,
  );
  const catalog = useCatalog();
  const kit = useUiKit();
  const rootRef = useRef<HTMLDivElement>(null);
  const layout = useLayout(rootRef);
  const [active, setActive] = useState<Active | null>(
    () => options.pending?.take() ?? null,
  );

  // While the lobby is on screen, "open feature X" from any module switches the lobby to X.
  useEffect(
    () =>
      features.setPresenter((id, args) => {
        setActive({ id, args });
        return true;
      }),
    [features],
  );

  const { tabs, more } = splitTabs(list, layout);
  const first = tabs[0];
  const current: Active | null =
    active && (active.id === MORE || list.some((f) => f.id === active.id))
      ? active
      : first
        ? { id: first.id }
        : null;
  const entry =
    current && current.id !== MORE ? features.get(current.id) : undefined;
  const inMore = current !== null && more.some((f) => f.id === current.id);
  const go = (id: string): void => setActive({ id });
  const pick = (id: string): void => {
    kit.play("tab");
    if (id === PLAY && options.onPlay?.()) return;
    go(id);
  };

  const desktop = layout === "desktop";
  const pad = layout === "phone" ? 14 : 24;
  const frame: CSSProperties = desktop
    ? {
        gridTemplateColumns: "232px minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr)",
        gridTemplateAreas: `"tabs header" "tabs content"`,
      }
    : {
        gridTemplateColumns: "minmax(0, 1fr)",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        gridTemplateAreas: `"header" "content" "tabs"`,
      };

  const Screen = entry?.Screen;
  const moreBadge = more.reduce((s, f) => s + (f.badge > 0 ? 1 : 0), 0);
  const inventoryInMore = more.some((f) => f.id === "inventory");

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        ...frame,
        background: screenBackground,
        fontFamily: v.font,
        color: v.text,
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      <LobbyHeader
        features={features}
        wallet={options.wallet}
        pad={pad}
        onStore={list.some((f) => f.id === "store") ? () => go("store") : null}
        style={{ gridArea: "header" }}
      />

      {/* The screen */}
      <div
        className="idos-scroll"
        style={{
          gridArea: "content",
          overflowY: "auto",
          padding: `6px ${pad}px ${desktop ? 28 : 18}px`,
        }}
      >
        <div
          key={current?.id ?? "none"}
          style={{
            maxWidth: CONTENT_MAX[layout],
            margin: "0 auto",
            animation: `idos-fade-in ${v.normal} ease both`,
          }}
        >
          {list.length === 0 ? (
            <EmptyState glyph="box" text={t("noFeatures")} />
          ) : current?.id === MORE ? (
            <FeatureGrid items={more} onOpen={go} />
          ) : Screen && entry ? (
            <>
              {inMore && !desktop ? (
                <BackToMore
                  label={catalog.localize(entry.label)}
                  icon={entry.icon}
                  onBack={() => go(MORE)}
                />
              ) : null}
              <Screen
                args={current?.args}
                close={() =>
                  inMore ? go(MORE) : first ? go(first.id) : undefined
                }
              />
            </>
          ) : null}
        </div>
      </div>

      {list.length === 0 ? null : desktop ? (
        <SideRail features={tabs} current={current?.id ?? null} onPick={pick} />
      ) : (
        <BottomTabs
          tabs={tabs}
          more={
            more.length > 0
              ? { badge: moreBadge, counter: inventoryInMore }
              : null
          }
          current={inMore ? MORE : (current?.id ?? null)}
          pill={layout === "tablet"}
          onPick={pick}
        />
      )}
    </div>
  );
}

/** Balances on the left, the wallet and the profile on the right — the lobby's top row, and the
 *  same row over a game (./GameFrame.tsx). */
export function LobbyHeader({
  features,
  wallet,
  pad,
  onStore,
  style,
}: {
  features: FeatureRegistry;
  wallet: boolean;
  pad: number;
  /** A tap on a balance opens the shop; null — no shop on this title. */
  onStore: (() => void) | null;
  style?: CSSProperties;
}): ReactNode {
  const state = useUserState();
  const catalog = useCatalog();
  const balances = Object.entries(state?.InventoryV2?.VirtualCurrencies ?? {})
    .filter(
      ([id]) =>
        catalog.currencies[id] !== undefined ||
        Object.keys(catalog.currencies).length === 0,
    )
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: `12px ${pad}px 6px`,
        minHeight: 20,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          flex: "1 1 auto",
          minWidth: 0,
        }}
      >
        {balances.map(([id, c]) => (
          <ResourceCounter
            key={id}
            currencyID={id}
            amount={Number(c?.Amount ?? 0)}
            onClick={onStore ?? undefined}
          />
        ))}
      </div>
      {wallet ? <WalletButton /> : null}
      <Account features={features} />
    </div>
  );
}

function BackToMore({
  label,
  icon,
  onBack,
}: {
  label: string;
  icon?: string;
  onBack: () => void;
}): ReactNode {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        margin: "0 0 12px",
      }}
    >
      <IconButton glyph="back" label={uiT("back")} onClick={onBack} size={36} />
      {icon ? <Icon glyph={icon} size={28} /> : null}
      <span style={{ ...outlined, fontSize: 19 }}>{label}</span>
    </div>
  );
}

/** Phone: a full-width tab strip at the bottom. Tablet: the same tabs as a centred pill. */
export function BottomTabs({
  tabs,
  more,
  current,
  pill,
  onPick,
}: {
  tabs: FeatureEntry[];
  more: { badge: number; counter: boolean } | null;
  current: string | null;
  pill: boolean;
  onPick: (id: string) => void;
}): ReactNode {
  const items = [
    ...tabs.map((f) => ({
      id: f.id,
      label: f.label,
      icon: f.icon ?? "box",
      badge: f.badge,
    })),
    ...(more
      ? [{ id: MORE, label: t("more"), icon: "menu", badge: more.badge }]
      : []),
  ];
  return (
    <nav
      style={{
        gridArea: "tabs",
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`,
        gap: items.length >= 5 ? 2 : 6,
        padding: `8px ${items.length >= 5 ? 4 : 10}px calc(8px + env(safe-area-inset-bottom))`,
        background: `linear-gradient(180deg, ${v.panelDeep}, ${v.bgBottom})`,
        // Longhands only: a shorthand `border` next to `borderTop` confuses React's style diffing.
        borderTop: `2px solid ${v.panelEdge}`,
        ...(pill
          ? {
              borderLeft: `2px solid ${v.panelEdge}`,
              borderRight: `2px solid ${v.panelEdge}`,
              borderBottom: `2px solid ${v.panelEdge}`,
              width: `min(${Math.max(520, items.length * 110)}px, calc(100% - 32px))`,
              justifySelf: "center",
              margin: "0 0 12px",
              padding: "8px 10px",
              borderRadius: 22,
              boxShadow: `0 6px 0 ${v.shadow}`,
            }
          : {}),
      }}
    >
      {items.map((tb) => {
        const active = tb.id === current;
        return (
          <button
            key={tb.id}
            type="button"
            className="idos-press"
            onClick={() => onPick(tb.id)}
            data-tutorial-anchor={`tab:${tb.id}`}
            data-resource-counter={
              tb.id === "inventory" || (tb.id === MORE && more?.counter)
                ? "inventory"
                : undefined
            }
            style={{
              position: "relative",
              border: "none",
              borderRadius: 14,
              padding: pill ? "8px 6px" : "6px 4px",
              cursor: "pointer",
              display: "grid",
              justifyItems: "center",
              gap: 2,
              minWidth: 0,
              background: active
                ? `linear-gradient(180deg, ${v.blue}, ${v.blueDeep})`
                : "transparent",
              boxShadow: active
                ? `0 3px 0 color-mix(in srgb, ${v.blueDeep} 70%, black), inset 0 2px 0 rgba(255,255,255,.3)`
                : "none",
              transform: active ? "translateY(-4px)" : "none",
              transition: `transform ${v.fast} ease`,
            }}
          >
            <Icon glyph={tb.icon} size={active ? 30 : 26} />
            <span
              style={{
                ...outlined,
                fontSize: pill ? 13 : items.length >= 5 ? 10.5 : 12,
                letterSpacing: items.length >= 5 && !pill ? -0.2 : 0.2,
                ...(active ? ON_TONE.blue : { color: v.textDim }),
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {tb.label}
            </span>
            <Badge
              count={tb.badge}
              style={{ top: 0, right: "calc(50% - 26px)" }}
            />
          </button>
        );
      })}
    </nav>
  );
}

/** Desktop: every feature in a rail on the left — the main ones first, the rest grouped. */
function SideRail({
  features,
  current,
  onPick,
}: {
  features: FeatureEntry[];
  current: string | null;
  onPick: (id: string) => void;
}): ReactNode {
  const main = features.filter((f) => f.primary);
  const rest = features.filter((f) => !f.primary);
  const row = (f: FeatureEntry): ReactNode => {
    const active = f.id === current;
    return (
      <button
        key={f.id}
        type="button"
        className="idos-press"
        onClick={() => onPick(f.id)}
        data-tutorial-anchor={`tab:${f.id}`}
        data-resource-counter={f.id === "inventory" ? "inventory" : undefined}
        style={{
          position: "relative",
          border: "none",
          borderRadius: 16,
          padding: "10px 14px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          textAlign: "left",
          background: active
            ? `linear-gradient(180deg, ${v.blue}, ${v.blueDeep})`
            : `color-mix(in srgb, ${v.text} 5%, transparent)`,
          boxShadow: active
            ? `0 4px 0 color-mix(in srgb, ${v.blueDeep} 70%, black), inset 0 2px 0 rgba(255,255,255,.3)`
            : "none",
          transform: active ? "translateX(4px)" : "none",
          transition: `transform ${v.fast} ease`,
        }}
      >
        <Icon glyph={f.icon ?? "box"} size={f.primary ? 34 : 28} />
        <span
          style={{
            ...outlined,
            fontSize: f.primary ? 17 : 15,
            ...(active ? ON_TONE.blue : { color: v.textDim }),
          }}
        >
          {f.label}
        </span>
        <Badge count={f.badge} style={{ top: 6, right: 8 }} />
      </button>
    );
  };
  return (
    <nav
      className="idos-scroll"
      style={{
        gridArea: "tabs",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "20px 14px",
        background: `linear-gradient(180deg, ${v.panelDeep}, ${v.bgBottom})`,
        borderRight: `2px solid ${v.panelEdge}`,
        overflowY: "auto",
      }}
    >
      {main.map(row)}
      {rest.length > 0 ? (
        <div
          style={{
            height: 2,
            background: v.panelEdge,
            opacity: 0.5,
            margin: "6px 4px",
          }}
        />
      ) : null}
      {rest.map(row)}
    </nav>
  );
}
