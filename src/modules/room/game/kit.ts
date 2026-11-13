import type { WeaponId } from "../data/weapons.ts";

/** Что у игрока на руках в хабе: надетое оружие, золото, баланс токена, открытые виды оружия. */
export interface AuctionKit {
  weapon: WeaponId;
  gold: number;
  /** Баланс токена Into the Delve. Им оплачиваются ставка и выкуп. */
  tokens: number;
  /** Баланс уже прочитан со счёта. Повторный вход в аукцион не затирает трату этой сессии. */
  tokensKnown: boolean;
  owned: string[];
}
