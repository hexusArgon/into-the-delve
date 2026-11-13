import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Серверный скрипт рынка (scripts/market-cloud-code.js) на поддельном server.*: каталог в обоих
 * видах ответа GetTitleConfig, ключ операции из requestId, дневные лимиты, отказ на чужое.
 */
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../scripts/market-cloud-code.js");
const source = readFileSync(file, "utf8");

interface Op {
  Reason: string;
  Operation: { Grant?: { Standard: { Entries: { ItemID?: string; CurrencyID?: string; Amount: number }[] } }; Consume?: unknown };
}

function harness(wrapConfig: boolean) {
  const ops: Op[] = [];
  const internal: Record<string, { Value: string }> = {};
  const catalog = { Catalogs: { gear: { Items: { belt: { IsStackable: false }, gold: { IsStackable: true } } } } };
  const server = {
    GetTitleConfig: () => (wrapConfig ? { Success: true, Data: { Item: catalog } } : catalog),
    GetUserCustomData: () => ({ Success: true, Data: { Internal: internal } }),
    SetUserCustomData: (_bucket: string, key: string, value: string) => {
      internal[key] = { Value: value };
      return { Success: true };
    },
    ApplyResourceOperation: (op: Op) => {
      ops.push(op);
      return { Success: true, Data: op.Operation };
    },
  };
  const handlers: Record<string, (args: unknown, ctx: unknown) => unknown> = {};
  const log = { Warning: () => undefined, Info: () => undefined };
  new Function("server", "handlers", "log", source)(server, handlers, log);
  return { ops, handlers };
}

for (const wrap of [true, false]) {
  const { ops, handlers } = harness(wrap);
  const deposit = handlers.depositGear!;
  const result = deposit({ requestId: "abcdefgh1", pieces: [{ catalogId: "belt", level: 3 }], gold: 50 }, {}) as { hone: number };
  assert.equal(result.hone, 3);
  assert.equal(ops[0]?.Reason, "deposit:abcdefgh1");
  const entries = ops[0]?.Operation.Grant?.Standard.Entries ?? [];
  assert.deepEqual(
    entries.map((e) => [e.ItemID ?? e.CurrencyID, e.Amount]),
    [
      ["belt", 1],
      ["gold", 50],
      ["HONE", 3],
    ],
  );
  // Неизвестная вещь, стопка вместо вещи, плохой уровень и пустой ключ — отказ.
  assert.throws(() => deposit({ requestId: "abcdefgh2", pieces: [{ catalogId: "sword", level: 0 }] }, {}), /Unknown piece/);
  assert.throws(() => deposit({ requestId: "abcdefgh3", pieces: [{ catalogId: "gold", level: 0 }] }, {}), /Unknown piece/);
  assert.throws(() => deposit({ requestId: "abcdefgh4", pieces: [{ catalogId: "belt", level: 21 }] }, {}), /Bad level/);
  assert.throws(() => deposit({ pieces: [{ catalogId: "belt", level: 0 }] }, {}), /requestId/);
  // Дневной лимит заточки: 3 уже есть, ещё 198 не влезает.
  const many = Array.from({ length: 10 }, () => ({ catalogId: "belt", level: 20 }));
  assert.throws(() => deposit({ requestId: "abcdefgh5", pieces: many }, {}), /sharpening levels/);
  // Лимит штук: 1 уже есть, 29 влезает, следующая — нет.
  for (let i = 0; i < 3; i += 1) {
    deposit({ requestId: `batch000${i}`, pieces: Array.from({ length: i < 2 ? 10 : 9 }, () => ({ catalogId: "belt", level: 0 })) }, {});
  }
  assert.throws(() => deposit({ requestId: "abcdefgh6", pieces: [{ catalogId: "belt", level: 0 }] }, {}), /30 pieces/);

  const withdraw = handlers.withdrawGold!;
  withdraw({ requestId: "wd123456", amount: 20 }, {});
  assert.equal(ops.at(-1)?.Reason, "withdraw-gold:wd123456");
  assert.throws(() => withdraw({ requestId: "wd123457", amount: 0 }, {}), /Bad gold/);
}

console.log("market cloud code ok");
