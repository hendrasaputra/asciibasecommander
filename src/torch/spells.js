/* ---------- Torchlight Dungeons: magic and prayers (phase 5) ---------- */
// Original content: the spells, their names, levels, costs and effects are this game's own. Two realms of 30, four
// books each. lv is the level a full caster learns it at; mana its cost; fail its base chance of failing (%).
// fx names an effect handler in game.js (shared with items); also names a second one. The rest are its numbers.
const SPELLS = [
  // ---- arcane: Book of First Sparks
  { id: "spark", name: "Spark", realm: "arcane", book: 1, lv: 1, mana: 1, fail: 22, fx: "bolt", elem: "arcane", dice: "3d4", aim: true, desc: "a bolt of light that never misses" },
  { id: "senseFoes", name: "Sense Foes", realm: "arcane", book: 1, lv: 2, mana: 1, fail: 22, fx: "detectMon", desc: "shows monsters nearby" },
  { id: "phaseStep", name: "Phase Step", realm: "arcane", book: 1, lv: 3, mana: 2, fail: 24, fx: "phase", desc: "a short teleport" },
  { id: "kindle", name: "Kindle", realm: "arcane", book: 1, lv: 5, mana: 2, fail: 25, fx: "lightArea", desc: "lights the room around you" },
  { id: "glint", name: "Glint of Gold", realm: "arcane", book: 1, lv: 5, mana: 2, fail: 25, fx: "detectObj", desc: "shows objects nearby" },
  { id: "knit", name: "Knit Flesh", realm: "arcane", book: 1, lv: 7, mana: 3, fail: 27, fx: "heal", dice: "2d8", desc: "heals a little" },
  { id: "befuddle", name: "Befuddle", realm: "arcane", book: 1, lv: 8, mana: 3, fail: 28, fx: "confMon", aim: true, desc: "confuses a monster" },
  { id: "stench", name: "Choking Cloud", realm: "arcane", book: 1, lv: 9, mana: 4, fail: 30, fx: "ball", elem: "poison", dmg: 14, r: 2, aim: true, desc: "a ball of poison gas" },
  // ---- arcane: Book of Hidden Ways
  { id: "slumber", name: "Slumber", realm: "arcane", book: 2, lv: 10, mana: 4, fail: 30, fx: "sleepMon", aim: true, desc: "puts a monster to sleep" },
  { id: "frostBolt", name: "Frost Bolt", realm: "arcane", book: 2, lv: 11, mana: 5, fail: 32, fx: "bolt", elem: "cold", dice: "6d6", aim: true, desc: "a bolt of cold" },
  { id: "slowFoe", name: "Leaden Limbs", realm: "arcane", book: 2, lv: 12, mana: 5, fail: 33, fx: "slowMon", aim: true, desc: "slows a monster" },
  { id: "knowing", name: "Knowing", realm: "arcane", book: 2, lv: 13, mana: 7, fail: 35, fx: "identify", desc: "identifies an item" },
  { id: "lightLance", name: "Light Lance", realm: "arcane", book: 2, lv: 14, mana: 5, fail: 33, fx: "beamLight", aim: true, desc: "lights a line through the dark" },
  { id: "melt", name: "Melt Stone", realm: "arcane", book: 2, lv: 15, mana: 6, fail: 35, fx: "stoneMud", aim: true, desc: "turns a wall to mud" },
  { id: "blink", name: "Far Step", realm: "arcane", book: 2, lv: 17, mana: 8, fail: 37, fx: "teleport", desc: "teleports you far away" },
  { id: "recharge", name: "Recharge", realm: "arcane", book: 2, lv: 19, mana: 9, fail: 40, fx: "recharge", desc: "adds charges to a wand or staff (it may break)" },
  // ---- arcane: Book of Storm and Frost
  { id: "lightning", name: "Forked Lightning", realm: "arcane", book: 3, lv: 20, mana: 8, fail: 38, fx: "beam", elem: "elec", dice: "6d8", aim: true, desc: "a beam of lightning through every monster in line" },
  { id: "ward", name: "Ward of Elements", realm: "arcane", book: 3, lv: 21, mana: 8, fail: 38, fx: "wardElements", desc: "resists heat and cold for a while" },
  { id: "fireBolt", name: "Fire Bolt", realm: "arcane", book: 3, lv: 22, mana: 9, fail: 40, fx: "bolt", elem: "fire", dice: "9d8", aim: true, desc: "a bolt of fire" },
  { id: "chart", name: "Chart the Depths", realm: "arcane", book: 3, lv: 23, mana: 9, fail: 40, fx: "map", desc: "maps the area around you" },
  { id: "banishOne", name: "Send Away", realm: "arcane", book: 3, lv: 24, mana: 10, fail: 42, fx: "teleOther", aim: true, desc: "teleports a monster far away" },
  { id: "frostBall", name: "Frost Ball", realm: "arcane", book: 3, lv: 25, mana: 12, fail: 44, fx: "ball", elem: "cold", dmg: 45, r: 2, aim: true, desc: "an exploding ball of cold" },
  { id: "recallA", name: "Homeward Path", realm: "arcane", book: 3, lv: 26, mana: 14, fail: 45, fx: "recall", desc: "Word of Recall" },
  { id: "haste", name: "Quicken", realm: "arcane", book: 3, lv: 27, mana: 14, fail: 46, fx: "fast", desc: "makes you faster for a while" },
  // ---- arcane: Book of Deep Sorcery
  { id: "fireBall", name: "Fire Ball", realm: "arcane", book: 4, lv: 30, mana: 18, fail: 48, fx: "ball", elem: "fire", dmg: 75, r: 2, aim: true, desc: "an exploding ball of fire" },
  { id: "quake", name: "Shake the Earth", realm: "arcane", book: 4, lv: 32, mana: 20, fail: 50, fx: "earthquake", desc: "brings walls down around you" },
  { id: "deepSight", name: "Deep Sight", realm: "arcane", book: 4, lv: 33, mana: 22, fail: 52, fx: "enlight", desc: "shows you the whole level" },
  { id: "acidStorm", name: "Acid Storm", realm: "arcane", book: 4, lv: 35, mana: 24, fail: 54, fx: "ball", elem: "acid", dmg: 100, r: 3, aim: true, desc: "a wide storm of acid" },
  { id: "unravel", name: "Unravel", realm: "arcane", book: 4, lv: 38, mana: 30, fail: 58, fx: "destruction", desc: "tears the dungeon around you to pieces" },
  { id: "manaStorm", name: "Mana Storm", realm: "arcane", book: 4, lv: 40, mana: 35, fail: 60, fx: "ball", elem: "arcane", dmg: 160, r: 3, aim: true, desc: "a storm of raw magic" },
  // ---- holy: Lamp Psalter
  { id: "mend", name: "Mend", realm: "holy", book: 1, lv: 1, mana: 2, fail: 20, fx: "heal", dice: "3d6", desc: "heals wounds" },
  { id: "bless", name: "Blessing", realm: "holy", book: 1, lv: 1, mana: 1, fail: 20, fx: "bless", desc: "better aim and armour for a while" },
  { id: "senseEvil", name: "Sense Evil", realm: "holy", book: 1, lv: 3, mana: 1, fail: 22, fx: "detectEvil", desc: "shows evil monsters nearby" },
  { id: "sacredLight", name: "Sacred Light", realm: "holy", book: 1, lv: 3, mana: 2, fail: 22, fx: "lightArea", desc: "lights the room around you" },
  { id: "cleanse", name: "Cleanse", realm: "holy", book: 1, lv: 5, mana: 2, fail: 24, fx: "curePoison", desc: "cures poison" },
  { id: "sanctuary", name: "Sanctuary", realm: "holy", book: 1, lv: 7, mana: 3, fail: 26, fx: "slumber", desc: "puts monsters next to you to sleep" },
  { id: "tendFlame", name: "Tend the Flame", realm: "holy", book: 1, lv: 8, mana: 3, fail: 26, fx: "refuel", desc: "refills your torch or lantern" },
  { id: "breadOfLight", name: "Bread of Light", realm: "holy", book: 1, lv: 9, mana: 4, fail: 28, fx: "satisfy", desc: "fills your stomach" },
  // ---- holy: Hymns of the Hearth
  { id: "greaterMend", name: "Greater Mend", realm: "holy", book: 2, lv: 11, mana: 5, fail: 30, fx: "heal", dice: "6d8", desc: "heals serious wounds" },
  { id: "chant", name: "Hearth Chant", realm: "holy", book: 2, lv: 12, mana: 5, fail: 30, fx: "chant", desc: "a long blessing" },
  { id: "senseWays", name: "Sense the Ways", realm: "holy", book: 2, lv: 13, mana: 6, fail: 32, fx: "map", desc: "maps the area around you" },
  { id: "purify", name: "Purify", realm: "holy", book: 2, lv: 14, mana: 6, fail: 32, fx: "cure", desc: "cures poison, confusion and blindness" },
  { id: "hearthWard", name: "Hearth Ward", realm: "holy", book: 2, lv: 15, mana: 7, fail: 34, fx: "wardElements", desc: "resists heat and cold for a while" },
  { id: "orb", name: "Orb of Radiance", realm: "holy", book: 2, lv: 16, mana: 7, fail: 34, fx: "ball", elem: "light", dmg: 24, r: 1, aim: true, desc: "a ball of holy light (twice as hard on the undead)" },
  { id: "uncurse", name: "Lift Curse", realm: "holy", book: 2, lv: 17, mana: 8, fail: 36, fx: "removeCurse", desc: "removes curses from your equipment" },
  { id: "portal", name: "Portal", realm: "holy", book: 2, lv: 19, mana: 9, fail: 38, fx: "teleport", desc: "teleports you far away" },
  // ---- holy: Litany of Dawn
  { id: "healing", name: "Healing", realm: "holy", book: 3, lv: 20, mana: 10, fail: 38, fx: "heal", dice: "10d8", desc: "heals grievous wounds" },
  { id: "heroism", name: "Valor", realm: "holy", book: 3, lv: 21, mana: 9, fail: 38, fx: "hero", desc: "makes you heroic" },
  { id: "dispelUndead", name: "Turn the Dead", realm: "holy", book: 3, lv: 22, mana: 11, fail: 40, fx: "dispel", flag: "undead", dice: "4d10", desc: "harms every undead monster in sight" },
  { id: "dawn", name: "Searing Dawn", realm: "holy", book: 3, lv: 24, mana: 12, fail: 42, fx: "ball", elem: "light", dmg: 55, r: 2, aim: true, desc: "a burst of dawn light" },
  { id: "protEvil", name: "Shield from Evil", realm: "holy", book: 3, lv: 25, mana: 12, fail: 42, fx: "protEvil", desc: "evil monsters often fail to touch you" },
  { id: "recallH", name: "Path Home", realm: "holy", book: 3, lv: 26, mana: 14, fail: 44, fx: "recall", desc: "Word of Recall" },
  { id: "vision", name: "Vision", realm: "holy", book: 3, lv: 27, mana: 14, fail: 45, fx: "clairvoyance", desc: "shows the level and its objects" },
  { id: "restore", name: "Restoration", realm: "holy", book: 3, lv: 29, mana: 16, fail: 46, fx: "healFull", desc: "heals you completely" },
  // ---- holy: Rites of the Unbroken Flame
  { id: "dispelEvil", name: "Dispel Evil", realm: "holy", book: 4, lv: 30, mana: 18, fail: 48, fx: "dispel", flag: "evil", dice: "6d10", desc: "harms every evil monster in sight" },
  { id: "quakeH", name: "Wrath of Stone", realm: "holy", book: 4, lv: 31, mana: 20, fail: 50, fx: "earthquake", desc: "brings walls down around you" },
  { id: "holyWord", name: "Holy Word", realm: "holy", book: 4, lv: 33, mana: 25, fail: 52, fx: "dispel", flag: "evil", dice: "4d10", also: "healFull", desc: "harms evil in sight and heals you completely" },
  { id: "banishEvil", name: "Banish Evil", realm: "holy", book: 4, lv: 35, mana: 28, fail: 55, fx: "banish", desc: "sends every evil monster in sight far away" },
  { id: "sunburst", name: "Sunburst", realm: "holy", book: 4, lv: 37, mana: 30, fail: 56, fx: "ball", elem: "light", dmg: 120, r: 3, aim: true, also: "lightArea", desc: "a blinding burst that lights the room" },
  { id: "avatar", name: "Unbroken Flame", realm: "holy", book: 4, lv: 40, mana: 40, fail: 60, fx: "avatar", desc: "heals you, and makes you fast, heroic, blessed and warded" }
];
const SPELL = Object.fromEntries(SPELLS.map(S => [S.id, S]));
// Full casters learn a spell at its level; part-time casters later (pace, start). A spell beyond level 40 is out of reach.
const spellLevel = (S, C) => S.realm !== C.realm ? 99 : Math.round(S.lv * (C.pace || 1) + (C.start || 0));
function spellFail(S, p){
  const C = CLASS[p.cls];
  return Math.max(5, Math.min(95, S.fail - 3 * (p.lvl - spellLevel(S, C)) - 3 * statMod(p.stats[C.stat]) + ((C.pace || 1) > 1 ? 5 : 0)));
}
const bookOf = S => (S.realm === "arcane" ? "abook" : "hbook") + S.book;
// Spells you could study now: your realm, your level reached, its book in your pack, not yet known.
const learnable = (p, carried) => SPELLS.filter(S => S.realm === CLASS[p.cls].realm && !p.spells.includes(S.id) && spellLevel(S, CLASS[p.cls]) <= p.lvl && carried.has(bookOf(S)));
const firstSpell = C => C.realm ? SPELLS.find(S => S.realm === C.realm) : null;
