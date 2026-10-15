import assert from "node:assert/strict";
import { UNIT, itemById } from "./items.ts";
import { heroAbilityById } from "./hero-abilities.ts";
import {
  abilityAmount,
  abilitySplash,
  fillEmptyWear,
  grantHeroAbilities,
  addInstance,
  equippedWeaponHit,
  freshLoadout,
  levelFactor,
  pointChance,
  scaled,
  sharpen,
  wornGearBonus,
  SHARPEN_CAP,
} from "./instances.ts";
import { armorFactor } from "../game/rules.ts";

const belt = itemById("belt");
assert.ok(belt?.maxHp);
assert.equal(scaled(belt?.maxHp, 0), belt?.maxHp);
assert.equal(scaled(belt?.maxHp, 1), (belt?.maxHp ?? 0) * 1.2);
assert.equal(scaled(belt?.maxHp, 20), (belt?.maxHp ?? 0) * levelFactor(20));
assert.equal(scaled(0, 5), 0);
assert.equal(scaled(undefined, 3), 0);

const common = itemById("fang");
assert.equal(scaled(common?.maxHp, 4), 0);

const mirror = itemById("whisper-mirror");
const points = scaled(mirror?.critChance, 1);
assert.equal(points, (mirror?.critChance ?? 0) * 1.2);
assert.equal(pointChance(points), 1 - armorFactor(points));
assert.notEqual(pointChance(points), points * 1.2);

const loadout = freshLoadout();
assert.equal(loadout.items.length, 3);
const copies = loadout.items.filter((item) => item.catalogId === "belt");
assert.equal(copies.length, 2);
assert.equal(copies[0]?.level, 0);
assert.notEqual(copies[0]?.id, copies[1]?.id);

const success = sharpen(loadout, copies[0]!.id, copies[1]!.id, () => 0);
assert.equal(success.ok && success.success, true);
assert.equal(loadout.items.filter((item) => item.catalogId === "belt").length, 1);
assert.equal(loadout.items.find((item) => item.catalogId === "belt")?.level, 1);

const again = freshLoadout();
const pair = again.items.filter((item) => item.catalogId === "belt");
const fail = sharpen(again, pair[0]!.id, pair[1]!.id, () => 0.99);
assert.equal(fail.ok && fail.success === false, true);
assert.equal(again.items.some((item) => item.catalogId === "belt"), false);

const same = freshLoadout();
const only = same.items.find((item) => item.catalogId === "belt")!;
assert.equal(sharpen(same, only.id, only.id, () => 0).ok, false);

const mixed = freshLoadout();
const sword = mixed.items.find((item) => item.kind === "weapon")!;
const one = mixed.items.find((item) => item.catalogId === "belt")!;
assert.equal(sharpen(mixed, sword.id, one.id, () => 0).ok, false);

const capped = freshLoadout();
const tops = capped.items.filter((item) => item.catalogId === "belt");
tops[0]!.level = SHARPEN_CAP;
assert.equal(sharpen(capped, tops[0]!.id, tops[1]!.id, () => 0).ok, false);
assert.equal(capped.items.length, 3);

const worn = freshLoadout();
const belts = worn.items.filter((item) => item.catalogId === "belt");
worn.worn[0] = belts[0]!.id;
sharpen(worn, belts[0]!.id, belts[1]!.id, () => 0.99);
assert.equal(worn.worn[0], null);
assert.equal(equippedWeaponHit(worn) > 0, true);

const bare = freshLoadout();
bare.weapon = null;
assert.equal(equippedWeaponHit(bare), 0);

const bolt = addInstance(freshLoadout(), "ability", "bolt", 1);
assert.equal(abilityAmount(bolt), (heroAbilityById("bolt")?.damage ?? 0) * 1.2);
assert.equal(abilitySplash(bolt), (heroAbilityById("bolt")?.splash ?? 0) * 1.2);
const shard = addInstance(freshLoadout(), "ability", "shard", 5);
assert.equal(abilityAmount(shard), (heroAbilityById("shard")?.damage ?? 0) * 1.2 ** 5);
assert.equal(abilitySplash(shard), 0);
assert.equal(heroAbilityById("bolt")?.mp, 40);
assert.equal(heroAbilityById("ram"), undefined);
const granted = freshLoadout();
grantHeroAbilities(granted);
assert.equal(granted.items.filter((item) => item.kind === "ability").length, 6);
fillEmptyWear(granted);
assert.equal(granted.wornAbilities.filter((id) => id !== null).length, 4);
assert.equal(granted.worn.filter((id) => id !== null).length, 2);
const keptAbility = granted.items.find((item) => item.kind === "ability" && !granted.wornAbilities.includes(item.id));
assert.ok(keptAbility);
const occupied = freshLoadout();
grantHeroAbilities(occupied);
const firstAbility = occupied.items.find((item) => item.kind === "ability")!;
occupied.wornAbilities[1] = firstAbility.id;
const keptGear = occupied.items.find((item) => item.catalogId === "belt")!;
occupied.worn[3] = keptGear.id;
fillEmptyWear(occupied);
assert.equal(occupied.wornAbilities[1], firstAbility.id);
assert.equal(occupied.worn[3], keptGear.id);
assert.equal(occupied.wornAbilities.filter((id) => id !== null).length, 4);
assert.equal(occupied.worn.filter((id) => id !== null).length, 2);
assert.equal(freshLoadout().items.length, 3);
const spear = freshLoadout("spear");
assert.equal(spear.items.find((item) => item.kind === "weapon")?.catalogId, "spear");
assert.equal(spear.items.length, 3);

const dressed = freshLoadout();
const piece = dressed.items.find((item) => item.catalogId === "belt")!;
piece.level = 1;
dressed.worn[0] = piece.id;
assert.equal(wornGearBonus(dressed).maxHp, (itemById("belt")?.maxHp ?? 0) * 1.2);

assert.equal(UNIT.dodge > 0, true);

console.log("instances ok");
