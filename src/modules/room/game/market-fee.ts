import { isOk, type IDosGamesClient } from "@idosgames/core";
import { MARKET_CATALOG } from "../data/market-ids.ts";
import type { PriceRule } from "./market.ts";

/**
 * Сколько продавец получит на руки. Цена в токене: торговый сбор токена
 * (`PlayerTradeFeePercent` у валюты, проценты). Цена во внутренней валюте: комиссия маркетплейса
 * (`Commission.Percent`, доля, с переопределением для каталога gear и минимумом за позицию).
 */

export interface FeeRule {
  /** Доля цены, 0.05 — 5%. */
  share: number;
  /** Минимум сбора за позицию. */
  min: number;
  /** Сбор округляется вверх до целого (внутренняя валюта). Токен делится. */
  whole: boolean;
}

export const NO_FEE: FeeRule = { share: 0, min: 0, whole: false };

/** Сбор с цены по правилу маркетплейса: min(цена, max(ceil(цена × доля), минимум)). */
export function feeOf(price: number, fee: FeeRule): number {
  if (!(price > 0)) return 0;
  const raw = price * fee.share;
  const cut = Math.max(fee.whole ? Math.ceil(raw) : raw, fee.min);
  return Math.min(price, cut);
}

export function sellerNet(price: number, fee: FeeRule): number {
  if (!(price > 0)) return 0;
  return Math.round((price - feeOf(price, fee)) * 1e6) / 1e6;
}

function shareOf(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function feeRule(client: IDosGamesClient, rule: PriceRule): Promise<FeeRule> {
  try {
    if (rule.type === "CryptoCurrency") {
      const defs = await client.title.getCurrencyDefinitions();
      if (!isOk(defs)) return NO_FEE;
      const token = defs.data.CryptoCurrencies?.[rule.currencyId] as Record<string, unknown> | undefined;
      return { share: shareOf(token?.["PlayerTradeFeePercent"]) / 100, min: 0, whole: false };
    }
    const defs = await client.marketplace.getDefinitions();
    if (!isOk(defs)) return NO_FEE;
    const commission = defs.data.Definitions?.Commission;
    const own = commission?.PerCatalogOverrides?.[MARKET_CATALOG];
    return {
      share: shareOf(own?.Percent ?? commission?.Percent),
      min: shareOf(own?.MinPerPosition ?? commission?.MinPerPosition),
      whole: true,
    };
  } catch {
    return NO_FEE;
  }
}
