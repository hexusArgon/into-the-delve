import { createIDosGamesClient, isOk, type IDosGamesClient } from "@idosgames/core";
import { bestAdventure, onAdventureRecorded, recordAdventure } from "./adventure.ts";
import { higherBest, richerLoadout } from "./progress.ts";
import { copyLoadout, loadoutFromJson, onLoadoutSaved, type Loadout } from "../data/instances.ts";
import type { WeaponId } from "../data/weapons.ts";

const PROGRESS_KEY = "delve";
const BOARD_ID = "adventure";

export interface GuildRow {
  rank: number;
  name: string;
  level: number;
  you: boolean;
}

let client: IDosGamesClient | null = null;
let account: IDosGamesClient | null = null;
let userID = "";
let heldLoadout: Loadout | null = null;
let heldBest: number | null = null;
let armed = false;
let sending = false;
let queued = false;
let opened: Promise<void> = Promise.resolve();

function titleID(): string | null {
  const host = (globalThis.location?.hostname ?? "").toLowerCase().replace(/\.$/, "");
  const match = /^([a-z0-9]{8})(-dev)?\.idos\.games$/.exec(host);
  if (match?.[1]) {
    const id = match[1].toUpperCase();
    return match[2] ? `${id}-DEV` : id;
  }
  const fromEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_IDOS_TITLE_ID;
  return fromEnv ? fromEnv : null;
}

function readFile(raw: string, weapon: WeaponId): { best: number | null; loadout: Loadout | null } | null {
  try {
    const data = JSON.parse(raw) as { best?: unknown; loadout?: unknown };
    const best = typeof data.best === "number" && data.best >= 0 ? Math.floor(data.best) : null;
    const loadout = data.loadout ? loadoutFromJson(JSON.stringify(data.loadout), weapon) : null;
    return { best, loadout };
  } catch {
    return null;
  }
}

async function push(): Promise<void> {
  if (!client || !heldLoadout || !armed) return;
  if (sending) {
    queued = true;
    return;
  }
  sending = true;
  try {
    const body = JSON.stringify({ best: heldBest, loadout: heldLoadout });
    await client.userCustomData.setPrivateData(PROGRESS_KEY, body);
    if (heldBest !== null) await client.leaderboard.submitScore(BOARD_ID, heldBest);
  } catch {
    /* сеть: в браузере запись уже лежит */
  } finally {
    sending = false;
  }
  if (queued) {
    queued = false;
    await push();
  }
}

async function connect(loadout: Loadout, weapon: WeaponId): Promise<void> {
  const id = titleID();
  if (!id) return;
  const created = createIDosGamesClient({ titleID: id, throttleMs: 0 });
  let session = await created.auth.autoLogin();
  if (!isOk(session)) session = await created.auth.loginWithDeviceID();
  if (!isOk(session)) return;
  client = created;
  userID = created.auth.context?.userID ?? "";
  const mine = await created.userCustomData.getMyUserCustomData();
  const raw = isOk(mine) ? mine.data.Private?.[PROGRESS_KEY]?.Value : null;
  const remote = raw ? readFile(raw, weapon) : null;
  const best = higherBest(bestAdventure(), remote?.best ?? null);
  copyLoadout(richerLoadout(loadout, remote?.loadout ?? null), loadout);
  heldLoadout = loadout;
  heldBest = best;
  if (best !== null && best !== bestAdventure()) recordAdventure(best);
  onLoadoutSaved((next) => {
    heldLoadout = next;
    void push();
  });
  onAdventureRecorded((level) => {
    heldBest = level;
    void push();
  });
  armed = true;
  await push();
}

const TOKEN_ID = "Main";

/** Сессия входа (кошелёк или гость). Аукцион читает токен с неё, не с отдельного входа. */
export function bindAccount(next: IDosGamesClient): void {
  account = next;
}

function session(): IDosGamesClient | null {
  return account ?? client;
}

/** Баланс токена Into the Delve. null — сессии ещё нет, аукцион не подменяет его нулём. */
export function tokenBalance(): number | null {
  const current = session();
  if (!current) return null;
  const raw = current.data.user.getCryptoCurrencyAmount(TOKEN_ID);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Подтянуть баланс токена со счёта, если игрок только что внёс или вывел. */
export async function refreshTokenBalance(): Promise<number | null> {
  const current = session();
  if (!current) return null;
  const state = await current.blockchain.getUserState();
  if (isOk(state)) current.data.user.applyBlockchainState(state.data.State ?? null, state.data.CryptoBalances ?? null);
  return tokenBalance();
}

/** Вход с устройства и сверка локального мешка с сервером. Без тайтла остаётся браузер. */
export function openCloud(loadout: Loadout, weapon: WeaponId): Promise<void> {
  const run = connect(loadout, weapon).catch(() => undefined);
  opened = run;
  return run;
}

function playerName(entry: { UserID: string; PublicProfile?: { Username?: string | null } | null }, you: boolean): string {
  const name = entry.PublicProfile?.Username?.trim();
  if (name) return name;
  return you ? "You" : `Player ${entry.UserID.slice(-4)}`;
}

/** Таблица всех игроков тайтла. `online` — сервер ответил, даже если строк ещё нет. */
export async function loadBoard(): Promise<{ rows: GuildRow[]; online: boolean }> {
  await opened;
  if (!client) return { rows: [], online: false };
  const board = await client.leaderboard.getLeaderboard(BOARD_ID);
  if (!isOk(board)) return { rows: [], online: false };
  const rows: GuildRow[] = (board.data.TopUsers ?? [])
    .filter((entry) => typeof entry.Score === "number")
    .map((entry) => {
      const you = entry.UserID === userID;
      return { rank: entry.Rank ?? 0, name: playerName(entry, you), level: entry.Score ?? 0, you };
    });
  const listed = rows.some((row) => row.you);
  if (!listed && heldBest !== null) {
    const mine = await client.leaderboard.getMyProgress(BOARD_ID);
    if (isOk(mine) && typeof mine.data.CurrentScore === "number") {
      rows.push({ rank: mine.data.LastKnownRank ?? rows.length + 1, name: "You", level: mine.data.CurrentScore, you: true });
    }
  }
  rows.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  return { rows, online: true };
}
