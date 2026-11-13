/**
 * Каталог предметов рынка для конфига тайтла iDos (раздел Item, каталог "gear").
 * Источник — данные игры: снаряжение (data/items.ts), способности героя (data/hero-abilities.ts)
 * и золото с этажа. Оружие на рынок не идёт.
 *
 * Уровень заточки хранится в Level экземпляра: уровень игры L — это Level L + 1. Поднимается он
 * улучшением предмета за валюту HONE, которую выдаёт только серверный скрипт depositGear.
 *
 * Запуск: node scripts/market-catalog.ts > catalog.json — затем каталог сохраняется в тайтл
 * (save_item) вместе с остальными каталогами.
 */
import { GEAR } from "../src/modules/room/data/items.ts";
import { HERO_ABILITIES } from "../src/modules/room/data/hero-abilities.ts";
import { SHARPEN_CAP } from "../src/modules/room/data/instances.ts";
import { MARKET_CATALOG, MARKET_GOLD, MARKET_HONE } from "../src/modules/room/data/market-ids.ts";

const RARITY: Record<string, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", epic: "Epic" };

const upgrade = {
  MaxLevel: SHARPEN_CAP + 1,
  PriceOptions: {
    hone: {
      OptionID: "hone",
      Name: "Sharpening",
      Cost: { Standard: { Entries: [{ Type: "VirtualCurrency", CurrencyID: MARKET_HONE, Amount: 1 }] } },
    },
  },
};

const items: Record<string, unknown> = {};
for (const piece of GEAR) {
  items[piece.id] = {
    ItemID: piece.id,
    CatalogID: MARKET_CATALOG,
    ItemClass: "Gear",
    DisplayName: piece.name,
    IsStackable: false,
    IsTradable: true,
    Weight: 1,
    Tags: ["gear"],
    Upgrade: upgrade,
    Metadata: { RarityID: RARITY[piece.rarity] ?? "Common" },
  };
}
for (const ability of HERO_ABILITIES) {
  items[ability.id] = {
    ItemID: ability.id,
    CatalogID: MARKET_CATALOG,
    ItemClass: "Ability",
    DisplayName: ability.name,
    IsStackable: false,
    IsTradable: true,
    Weight: 1,
    Tags: ["ability"],
    Upgrade: upgrade,
    Metadata: { RarityID: "Common" },
  };
}
items[MARKET_GOLD] = {
  ItemID: MARKET_GOLD,
  CatalogID: MARKET_CATALOG,
  ItemClass: "Resource",
  DisplayName: "Gold",
  Description: "Coins from the dungeon floor. Traded in stacks.",
  IsStackable: true,
  IsTradable: true,
  Weight: 1,
  Tags: ["gold"],
  Metadata: { RarityID: "Common" },
};

process.stdout.write(JSON.stringify({ Items: items }, null, 2) + "\n");
