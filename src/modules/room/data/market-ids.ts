/**
 * Id рынка игроков в конфиге тайтла iDos. Каталог собирает scripts/market-catalog.ts,
 * серверный скрипт — scripts/market-cloud-code.js. Меняются только вместе с тайтлом.
 */

/** Каталог предметов, которыми торгуют игроки. ItemID внутри — id из data/. */
export const MARKET_CATALOG = "gear";
/** Золото с этажа: пачкуемый предмет каталога. */
export const MARKET_GOLD = "gold";
/** Валюта заточки на сервере. Выдаёт только depositGear, тратит только улучшение предмета. */
export const MARKET_HONE = "HONE";
/** Токен Into the Delve: им платят на рынке. */
export const MARKET_TOKEN = "Main";
/** Сроки лота из дизайна: 12, 24 и 48 часов. */
export const MARKET_HOURS = [12, 24, 48] as const;
/** Серверная копия вещи в мешке: id экземпляра на сервере с этой приставкой. */
export const SERVER_PIECE_PREFIX = "srv:";
