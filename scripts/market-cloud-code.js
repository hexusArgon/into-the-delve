// Cloud Code тайтла Into the Delve: серверная часть рынка игроков.
// Публикуется в тайтл целиком (publish_cloud_code). Второй рубеж лимитов — в настройках тайтла:
// CloudCode.ResourcePolicy.Caps (HONE и золото в сутки) и CloudCode.RateLimit (частота вызовов).
//
// Вещи игры живут в сохранении игрока. Чтобы продать вещь другим игрокам, её надо положить на
// сервер: depositGear выдаёт такой же предмет каталога "gear" и столько валюты HONE, сколько
// уровней заточки у вещи; клиент тут же поднимает Level предмета улучшением за HONE и удаляет
// свою копию. Сервер не видит забег, поэтому вещь принимается на слово клиента; подделку
// ограничивают дневные лимиты игрока (DAILY). Золото обратно в мешок забирает withdrawGold.

var CATALOG = "gear";
var GOLD = "gold";
var HONE = "HONE";
var MAX_PIECES = 10;
var MAX_LEVEL = 20;
var MAX_GOLD = 100000;
/** Сколько игрок может положить на рынок за сутки (UTC). Подделку вещей ограничивает только это. */
var DAILY = { pieces: 30, hone: 200, gold: 20000 };

function fail(message) {
  throw new Error(message);
}

function catalogItems() {
  var cfg = server.GetTitleConfig("Item");
  // Ответ бывает обёрнут в { Success, Data } или приходит самим конфигом.
  if (cfg && cfg.Success === false) fail("Item config: " + cfg.Error);
  var data = cfg && cfg.Success === true ? cfg.Data : cfg;
  var root = data && (data.Item || data);
  var catalogs = root && root.Catalogs;
  var gear = catalogs && catalogs[CATALOG];
  if (!gear || !gear.Items) fail("Market catalog not found: " + JSON.stringify(cfg).slice(0, 300));
  return gear.Items;
}

/** Сегодняшний счёт переносов игрока: { day, pieces, hone, gold }. */
function readDaily() {
  var today = new Date().toISOString().slice(0, 10);
  var data = server.GetUserCustomData();
  if (!data.Success) fail("User data: " + data.Error);
  var record = data.Data && data.Data.Internal && data.Data.Internal.market_daily;
  var row = null;
  try {
    row = record && record.Value ? JSON.parse(record.Value) : null;
  } catch (e) {
    row = null;
  }
  if (!row || row.day !== today) row = { day: today, pieces: 0, hone: 0, gold: 0 };
  return row;
}

/** Ключ попытки от клиента: повтор того же вызова после обрыва связи ничего не выдаёт дважды. */
function requestKey(args) {
  var key = String((args && args.requestId) || "");
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) fail("requestId is required");
  return key;
}

function apply(reason, grant, consume) {
  var op = {};
  if (grant) op.Grant = { Standard: { Entries: grant } };
  if (consume) op.Consume = { Standard: { Entries: consume } };
  var res = server.ApplyResourceOperation({ Reason: reason, Operation: op });
  if (!res.Success) fail(res.Error || "Resource operation refused");
  return res.Data;
}

/** args: { requestId, pieces: [{ catalogId, level }], gold?: number }; level — заточка 0..20. */
handlers.depositGear = function (args, context) {
  var key = requestKey(args);
  var pieces = (args && args.pieces) || [];
  var gold = Math.floor(Number((args && args.gold) || 0));
  if (!Array.isArray(pieces)) fail("pieces must be a list");
  if (pieces.length > MAX_PIECES) fail("At most " + MAX_PIECES + " pieces at once");
  if (!(gold >= 0) || gold > MAX_GOLD) fail("Bad gold amount");
  if (pieces.length === 0 && gold === 0) fail("Nothing to deposit");

  var items = pieces.length > 0 ? catalogItems() : {};
  var grant = [];
  var hone = 0;
  for (var i = 0; i < pieces.length; i++) {
    var piece = pieces[i] || {};
    var catalogId = String(piece.catalogId || "");
    var level = Math.floor(Number(piece.level || 0));
    var def = items[catalogId];
    if (!def || def.IsStackable) fail("Unknown piece " + catalogId);
    if (!(level >= 0) || level > MAX_LEVEL) fail("Bad level for " + catalogId);
    grant.push({ Type: "Item", CatalogID: CATALOG, ItemID: catalogId, Amount: 1 });
    hone += level;
  }
  if (gold > 0) grant.push({ Type: "Item", CatalogID: CATALOG, ItemID: GOLD, Amount: gold });
  if (hone > 0) grant.push({ Type: "VirtualCurrency", CurrencyID: HONE, Amount: hone });

  var daily = readDaily();
  if (daily.pieces + pieces.length > DAILY.pieces) fail("Daily market limit: " + DAILY.pieces + " pieces");
  if (daily.hone + hone > DAILY.hone) fail("Daily market limit: " + DAILY.hone + " sharpening levels");
  if (daily.gold + gold > DAILY.gold) fail("Daily market limit: " + DAILY.gold + " gold");
  apply("deposit:" + key, grant, null);
  daily.pieces += pieces.length;
  daily.hone += hone;
  daily.gold += gold;
  var write = server.SetUserCustomData("Internal", "market_daily", JSON.stringify(daily));
  if (!write.Success) log.Warning("market_daily not saved", { error: write.Error });
  return { pieces: pieces.length, hone: hone, gold: gold };
};

/** args: { requestId, amount } — забрать золото с сервера обратно в мешок. */
handlers.withdrawGold = function (args, context) {
  var key = requestKey(args);
  var amount = Math.floor(Number((args && args.amount) || 0));
  if (!(amount > 0) || amount > MAX_GOLD) fail("Bad gold amount");
  apply("withdraw-gold:" + key, null, [{ Type: "Item", CatalogID: CATALOG, ItemID: GOLD, Amount: amount }]);
  return { gold: amount };
};
