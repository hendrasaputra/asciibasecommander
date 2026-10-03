/* ---------- Torchlight Dungeons: items, flavours and identification (phase 3) ---------- */
// Original content: names, numbers and effects are this game's own, not Moria's. Weight is in pounds, cost in gold.
// Kinds of potion, scroll, wand, staff, rod, ring, amulet and mushroom look different in every game (their
// "flavour") until you learn what they are, by using them, reading Identify, or (later) selling them.
const SLOTS = ["weapon", "bow", "ring1", "ring2", "neck", "light", "body", "cloak", "shield", "head", "hands", "feet"];
const SLOT_NAMES = { weapon: "Weapon", bow: "Shooting", ring1: "Left ring", ring2: "Right ring", neck: "Neck", light: "Light", body: "Body", cloak: "Cloak", shield: "Arm", head: "Head", hands: "Hands", feet: "Feet" };
const CAT = {   // per category: glyph, colour, slot, and whether its kinds are flavoured
  weapon: { glyph: "|", rgb: [0.8, 0.8, 0.9], slot: "weapon" }, bow: { glyph: "}", rgb: [0.8, 0.65, 0.45], slot: "bow" },
  ammo: { glyph: "{", rgb: [0.8, 0.75, 0.6] }, dart: { glyph: "{", rgb: [0.8, 0.75, 0.6] },
  body: { glyph: "[", rgb: [0.75, 0.75, 0.8], slot: "body" }, shield: { glyph: ")", rgb: [0.7, 0.6, 0.45], slot: "shield" },
  head: { glyph: "]", rgb: [0.75, 0.75, 0.8], slot: "head" }, hands: { glyph: "]", rgb: [0.7, 0.55, 0.4], slot: "hands" },
  feet: { glyph: "]", rgb: [0.65, 0.5, 0.35], slot: "feet" }, cloak: { glyph: "(", rgb: [0.55, 0.6, 0.5], slot: "cloak" },
  light: { glyph: "~", rgb: [1.0, 0.7, 0.3], slot: "light" }, food: { glyph: ",", rgb: [0.85, 0.7, 0.45] }, flask: { glyph: "!", rgb: [0.9, 0.8, 0.4] },
  mushroom: { glyph: ",", flavour: true }, potion: { glyph: "!", flavour: true }, scroll: { glyph: "?", flavour: true },
  wand: { glyph: "-", flavour: true }, staff: { glyph: "_", flavour: true }, rod: { glyph: "-", flavour: true },
  ring: { glyph: "=", flavour: true, slot: "ring" }, amulet: { glyph: "\"", flavour: true, slot: "neck" }
};
const ARMOUR_CATS = ["body", "shield", "head", "hands", "feet", "cloak"], WEAR_CATS = ["weapon", "bow", ...ARMOUR_CATS, "light", "ring", "amulet"];
const I = (cat, id, name, depth, rarity, wt, cost, o = {}) => ({ cat, id, name, depth, rarity, wt, cost, ...o });
const ITEMS = [
  // swords, hafted weapons, polearms and axes: [dice]
  ...[["dagger", "Dagger", "1d4", 1, 1, 10], ["maingauche", "Main gauche", "1d5", 1.5, 2, 25], ["rapier", "Rapier", "1d6", 4, 3, 42], ["shortsword", "Short sword", "1d7", 5, 2, 50],
      ["cutlass", "Cutlass", "1d8", 11, 5, 85], ["sabre", "Sabre", "1d8", 5, 6, 90], ["broadsword", "Broadsword", "2d4", 15, 8, 160], ["longsword", "Long sword", "2d5", 13, 10, 200],
      ["bastard", "Bastard sword", "3d4", 14, 14, 350], ["twohander", "Two-handed sword", "3d6", 22, 20, 650], ["headsman", "Headsman's sword", "4d5", 26, 30, 1100]]
    .map(([id, n, d, wt, dep, c]) => I("weapon", id, n, dep, dep > 12 ? 2 : 1, wt, c, { dice: d })),
  ...[["club", "Club", "1d5", 8, 1, 5], ["staffw", "Quarterstaff", "1d9", 15, 2, 20], ["mace", "Mace", "2d4", 12, 3, 130], ["warhammer", "War hammer", "3d3", 12, 8, 225],
      ["morningstar", "Morning star", "2d6", 15, 10, 300], ["flail", "Flail", "2d6", 15, 12, 300], ["leadmace", "Lead-filled mace", "3d4", 18, 16, 500],
      ["maul", "Maul", "4d4", 25, 24, 800], ["greatmaul", "Great maul", "5d5", 30, 35, 1400]]
    .map(([id, n, d, wt, dep, c]) => I("weapon", id, n, dep, dep > 12 ? 2 : 1, wt, c, { dice: d, glyph: "\\" })),
  ...[["spear", "Spear", "1d6", 5, 2, 35], ["handaxe", "Hand axe", "2d3", 8, 3, 60], ["trident", "Trident", "1d10", 7, 6, 120], ["axe", "Broad axe", "2d6", 16, 8, 250],
      ["pike", "Pike", "2d5", 16, 10, 240], ["glaive", "Glaive", "2d6", 19, 14, 360], ["battleaxe", "Battle axe", "2d8", 17, 16, 420], ["halberd", "Halberd", "3d5", 19, 20, 600],
      ["lance", "Lance", "2d8", 30, 22, 500], ["greataxe", "Great axe", "4d4", 23, 28, 900], ["scythe", "War scythe", "5d3", 25, 32, 1000]]
    .map(([id, n, d, wt, dep, c]) => I("weapon", id, n, dep, dep > 12 ? 2 : 1, wt, c, { dice: d, glyph: "/" })),
  // launchers and what they shoot
  I("bow", "sling", "Sling", 1, 1, 0.5, 5, { mult: 2, ammo: "shot" }), I("bow", "shortbow", "Short bow", 3, 1, 3, 80, { mult: 2, ammo: "arrow" }),
  I("bow", "longbow", "Long bow", 8, 2, 4, 200, { mult: 3, ammo: "arrow" }), I("bow", "lightxbow", "Light crossbow", 10, 2, 11, 300, { mult: 3, ammo: "bolt" }),
  I("bow", "heavyxbow", "Heavy crossbow", 20, 3, 18, 700, { mult: 4, ammo: "bolt" }),
  I("ammo", "shot", "Iron shot", 1, 1, 0.4, 1, { dice: "1d4", ammo: "shot" }), I("ammo", "arrow", "Arrow", 2, 1, 0.2, 1, { dice: "1d4", ammo: "arrow" }),
  I("ammo", "barbed", "Barbed arrow", 15, 3, 0.3, 4, { dice: "1d6", ammo: "arrow" }), I("ammo", "bolt", "Crossbow bolt", 8, 2, 0.3, 2, { dice: "1d5", ammo: "bolt" }),
  I("dart", "dart", "Throwing dart", 1, 2, 0.3, 1, { dice: "1d5", throw: true }),
  // armour: [base armour class]
  ...[["robe", "Robe", 2, 2, 1, 4, "("], ["jerkin", "Padded jerkin", 3, 8, 1, 10, "("], ["leather", "Soft leather coat", 6, 8, 3, 30, "("], ["hardleather", "Hard leather coat", 8, 12, 5, 60, "("],
      ["studded", "Studded leather", 10, 20, 8, 100, "("], ["leatherscale", "Leather scale coat", 12, 14, 10, 160, "["], ["ringmail", "Ring mail", 14, 25, 12, 200, "["],
      ["scale", "Scale coat", 16, 25, 15, 300, "["], ["chain", "Chain shirt", 16, 22, 14, 280, "["], ["chainmail", "Chain mail", 20, 25, 18, 450, "["],
      ["banded", "Banded mail", 24, 30, 24, 650, "["], ["splint", "Splint mail", 26, 33, 28, 800, "["], ["plate", "Plate armour", 30, 38, 34, 1200, "["], ["fullplate", "Full plate", 36, 45, 42, 2000, "["]]
    .map(([id, n, ac, wt, dep, c, g]) => I("body", id, n, dep, dep > 14 ? 2 : 1, wt, c, { ac, glyph: g })),
  ...[["buckler", "Buckler", 2, 3, 1, 15], ["leathershield", "Leather shield", 4, 6, 3, 40], ["roundshield", "Round shield", 6, 8, 8, 100], ["kite", "Kite shield", 8, 10, 15, 220], ["tower", "Tower shield", 12, 16, 25, 500]]
    .map(([id, n, ac, wt, dep, c]) => I("shield", id, n, dep, 1, wt, c, { ac })),
  ...[["cap", "Leather cap", 2, 1.5, 1, 8], ["ironhelm", "Iron helm", 5, 7, 6, 75], ["steelhelm", "Steel helm", 7, 6, 14, 200], ["greathelm", "Great helm", 9, 9, 24, 450], ["circlet", "Silver circlet", 3, 1, 18, 300]]
    .map(([id, n, ac, wt, dep, c]) => I("head", id, n, dep, id === "circlet" ? 3 : 1, wt, c, { ac })),
  ...[["gloves", "Leather gloves", 1, 1, 1, 6], ["gauntlets", "Gauntlets", 3, 2.5, 8, 60], ["steelgauntlets", "Steel gauntlets", 5, 3, 20, 250]]
    .map(([id, n, ac, wt, dep, c]) => I("hands", id, n, dep, 1, wt, c, { ac })),
  ...[["sandals", "Sandals", 1, 1, 1, 4], ["softboots", "Soft boots", 2, 2, 2, 12], ["hardboots", "Hard boots", 3, 4, 6, 40], ["ironboots", "Iron boots", 5, 8, 16, 200]]
    .map(([id, n, ac, wt, dep, c]) => I("feet", id, n, dep, 1, wt, c, { ac })),
  ...[["cloak", "Cloak", 1, 1, 1, 5], ["furcloak", "Fur cloak", 3, 3, 8, 50], ["oilskin", "Oilskin cloak", 2, 2, 12, 80]]
    .map(([id, n, ac, wt, dep, c]) => I("cloak", id, n, dep, 1, wt, c, { ac })),
  // light
  I("light", "torch", "Torch", 1, 1, 3, 1, { radius: 3, fuel: 4000, rgb: [1.0, 0.6, 0.25] }),
  I("light", "lantern", "Lantern", 5, 3, 5, 100, { radius: 4, fuel: 7500, maxFuel: 15000, rgb: [1.0, 0.85, 0.4] }),
  I("light", "crystal", "Glow crystal", 25, 4, 1, 1500, { radius: 3, rgb: [0.7, 0.9, 1.2] }),   // never runs out
  I("flask", "oil", "Flask of oil", 1, 1, 1, 3, { use: "fuel", fuel: 7500 }),
  // food; mushrooms are flavoured and do something besides
  I("food", "ration", "Ration of food", 1, 1, 0.8, 3, { food: 3000 }), I("food", "jerky", "Strip of dried meat", 1, 1, 0.3, 2, { food: 1500 }),
  I("food", "biscuit", "Hard biscuit", 1, 1, 0.2, 1, { food: 800 }), I("food", "honeycake", "Honey cake", 3, 2, 0.4, 10, { food: 2000, effect: "curePoison" }),
  ...[["mvigor", "Vigor", "heal", { dice: "2d8" }, 1], ["mclear", "Clear Mind", "mana", { amount: 10 }, 4], ["mcure", "Cleansing", "cure", {}, 2],
      ["msick", "Sickness", "poison", {}, 1], ["mstupor", "Stupor", "sleep", {}, 2], ["msight", "Second Sight", "detectMon", {}, 3]]
    .map(([id, n, e, o, dep]) => I("mushroom", id, n, dep, 1, 0.1, 5, { effect: e, ...o, food: 300 })),
  // potions
  ...[["heal", "Mending", "heal", { dice: "4d6" }, 1, 1, 20], ["bigheal", "Greater Mending", "heal", { dice: "10d8" }, 6, 2, 80], ["life", "Life", "healFull", {}, 35, 6, 2500],
      ["pmana", "Restore Mana", "mana", { amount: 30 }, 10, 3, 350], ["pspeed", "Speed", "fast", {}, 5, 3, 75], ["phero", "Heroism", "hero", {}, 2, 2, 35],
      ["pberserk", "Berserk Strength", "berserk", {}, 10, 3, 100], ["pfire", "Resist Heat", "resFire", {}, 3, 2, 30], ["pcold", "Resist Cold", "resCold", {}, 3, 2, 30],
      ["pinfra", "Infravision", "infra", {}, 1, 2, 20], ["pclear", "Clear Mind", "cure", {}, 3, 2, 40], ["ppoisoncure", "Neutralize Poison", "curePoison", {}, 2, 1, 25],
      ["psleep", "Sleep", "sleep", {}, 1, 1, 0], ["ppoison", "Poison", "poison", {}, 2, 1, 0], ["pconfuse", "Confusion", "confuse", {}, 1, 1, 0],
      ["pblind", "Blindness", "blind", {}, 2, 1, 0], ["psalt", "Salt Water", "salt", {}, 1, 1, 0],
      ["pstr", "Strength", "gainStat", { stat: "str" }, 25, 8, 4000], ["pint", "Intellect", "gainStat", { stat: "int" }, 25, 8, 4000], ["pwis", "Wisdom", "gainStat", { stat: "wis" }, 25, 8, 4000],
      ["pdex", "Dexterity", "gainStat", { stat: "dex" }, 25, 8, 4000], ["pcon", "Constitution", "gainStat", { stat: "con" }, 30, 8, 4000], ["pcha", "Charisma", "gainStat", { stat: "cha" }, 20, 6, 1000],
      ["penlight", "Enlightenment", "enlight", {}, 25, 5, 800], ["pexp", "Experience", "exp", {}, 40, 10, 10000], ["pclair", "Clairvoyance", "clairvoyance", {}, 15, 4, 400]]
    .map(([id, n, e, o, dep, r, c]) => I("potion", id, n, dep, r, 0.4, c, { effect: e, ...o })),
  // scrolls
  ...[["sident", "Identify", "identify", 1, 1, 50], ["suncurse", "Remove Curse", "removeCurse", 5, 2, 100], ["slight", "Light", "lightArea", 1, 1, 15],
      ["smap", "Magic Mapping", "map", 8, 2, 150], ["sobj", "Object Detection", "detectObj", 1, 1, 20], ["smon", "Monster Detection", "detectMon", 2, 1, 25],
      ["sphase", "Phase Door", "phase", 1, 1, 15], ["stele", "Teleportation", "teleport", 8, 2, 40], ["stelelevel", "Teleport Level", "teleLevel", 12, 3, 60],
      ["sdeep", "Deep Descent", "deepDescent", 5, 3, 50], ["senchhit", "Enchant Weapon To-Hit", "enchHit", 6, 2, 125], ["senchdam", "Enchant Weapon To-Dam", "enchDam", 8, 2, 125],
      ["senchac", "Enchant Armour", "enchAc", 6, 2, 125], ["sbless", "Blessing", "bless", 1, 1, 15], ["schant", "Holy Chant", "chant", 10, 2, 40],
      ["sfood", "Satisfy Hunger", "satisfy", 5, 2, 10], ["sconf", "Monster Confusion", "monConf", 3, 2, 30], ["sslumber", "Slumber", "slumber", 4, 2, 35],
      ["sdark", "Darkness", "darkness", 1, 1, 0], ["saggr", "Aggravate Monsters", "aggravate", 5, 1, 0], ["scursearm", "Curse Armour", "curseArmour", 10, 2, 0],
      ["sundead", "Summon Undead", "summonUndead", 15, 2, 0]]
    .map(([id, n, e, dep, r, c]) => I("scroll", id, n, dep, r, 0.5, c, { effect: e })),
  // wands: aimed, with charges
  ...[["wmissile", "Magic Missile", "bolt", { elem: "arcane", dice: "3d4" }, 2, 1, 100, "5d4"], ["wstink", "Stinking Cloud", "ball", { elem: "poison", dmg: 12, r: 2 }, 5, 1, 400, "5d3"],
      ["wfire", "Fire Bolts", "bolt", { elem: "fire", dice: "6d6" }, 12, 2, 800, "4d3"], ["wcold", "Frost Bolts", "bolt", { elem: "cold", dice: "5d6" }, 10, 2, 700, "4d3"],
      ["welec", "Lightning Bolts", "beam", { elem: "elec", dice: "4d6" }, 8, 2, 600, "4d3"], ["wacid", "Acid Bolts", "bolt", { elem: "acid", dice: "6d6" }, 15, 2, 900, "4d3"],
      ["wfireball", "Fire Balls", "ball", { elem: "fire", dmg: 40, r: 2 }, 30, 3, 1800, "2d3"], ["wcoldball", "Cold Balls", "ball", { elem: "cold", dmg: 35, r: 2 }, 25, 3, 1500, "2d3"],
      ["wsleep", "Sleep Monster", "sleepMon", {}, 3, 1, 150, "5d3"], ["wslow", "Slow Monster", "slowMon", {}, 5, 1, 200, "5d3"], ["wconf", "Confuse Monster", "confMon", {}, 4, 1, 200, "5d3"],
      ["wscare", "Scare Monster", "scareMon", {}, 6, 2, 250, "5d3"], ["wlight", "Light", "beamLight", {}, 2, 1, 150, "6d3"], ["wmud", "Stone to Mud", "stoneMud", {}, 10, 2, 300, "4d4"],
      ["wdrain", "Drain Life", "bolt", { elem: "drain", dice: "75d1" }, 40, 4, 3000, "1d3"]]
    .map(([id, n, e, o, dep, r, c, ch]) => I("wand", id, n, dep, r, 1, c, { effect: e, aim: true, charges: ch, ...o })),
  // staffs: used where you stand, with charges
  ...[["tlight", "Light", "lightArea", 1, 1, 200, "8d3"], ["tdetmon", "Detect Monsters", "detectMon", 2, 1, 250, "8d3"], ["tdetobj", "Detect Objects", "detectObj", 3, 1, 300, "8d3"],
      ["tmap", "Mapping", "map", 10, 2, 700, "4d3"], ["ttele", "Teleportation", "teleport", 15, 2, 800, "4d3"], ["tcure", "Mending", "heal", 5, 2, 400, "5d3", { dice: "4d8" }],
      ["tsleep", "Sleep Monsters", "sleepAll", 8, 2, 500, "4d3"], ["tslow", "Slow Monsters", "slowAll", 12, 2, 600, "4d3"], ["tspeed", "Speed", "fast", 40, 5, 4000, "2d3"],
      ["tsummon", "Summoning", "summon", 10, 2, 0, "4d3"], ["tdark", "Darkness", "darkness", 5, 1, 0, "4d3"]]
    .map(([id, n, e, dep, r, c, ch, o]) => I("staff", id, n, dep, r, 5, c, { effect: e, charges: ch, ...(o || {}) })),
  // rods: recharge by themselves
  ...[["rdetect", "Detection", "detection", 20, 3, 3000, 50], ["rillum", "Illumination", "lightArea", 10, 2, 1000, 30], ["rlight", "Light", "beamLight", 6, 2, 800, 10, true],
      ["rcure", "Curing", "cure", 15, 3, 1500, 40], ["rodfire", "Fire Bolts", "bolt", 20, 3, 2500, 15, true, { elem: "fire", dice: "9d8" }],
      ["rodcold", "Frost Bolts", "bolt", 18, 3, 2200, 13, true, { elem: "cold", dice: "6d8" }], ["robj", "Treasure Location", "detectObj", 5, 2, 800, 30]]
    .map(([id, n, e, dep, r, c, time, aim, o]) => I("rod", id, n, dep, r, 1.5, c, { effect: e, recharge: time, aim: !!aim, ...(o || {}) })),
  // rings and amulets: worn; pval is rolled when made
  ...[["rprot", "Protection", 5, 1, { pac: true }, 400], ["rstr", "Strength", 20, 3, { pstat: "str" }, 1500], ["rint", "Intellect", 20, 3, { pstat: "int" }, 1500],
      ["rdex", "Dexterity", 20, 3, { pstat: "dex" }, 1500], ["rcon", "Constitution", 22, 3, { pstat: "con" }, 1500], ["racc", "Accuracy", 8, 2, { phit: true }, 500],
      ["rdam", "Damage", 10, 2, { pdam: true }, 600], ["rslay", "Slaying", 25, 3, { phit: true, pdam: true }, 2500], ["rspeed", "Speed", 50, 6, { pspeed: true }, 50000],
      ["rregen", "Regeneration", 15, 3, { regen: 1 }, 1200], ["rfire", "Resist Fire", 6, 2, { res: ["fire"] }, 300], ["rcold", "Resist Cold", 6, 2, { res: ["cold"] }, 300],
      ["rfree", "Free Action", 20, 3, { freeAct: true }, 1500], ["rdigest", "Slow Digestion", 5, 2, { slowDigest: true }, 250],
      ["rtele", "Teleportation", 5, 2, { teleportCurse: true, cursed: true }, 0], ["rweak", "Weakness", 3, 1, { pstat: "str", cursed: true }, 0],
      ["rstupid", "Stupidity", 3, 1, { pstat: "int", cursed: true }, 0], ["rwoe", "Woe", 10, 2, { pac: true, pstat: "wis", cursed: true }, 0]]
    .map(([id, n, dep, r, o, c]) => I("ring", id, n, dep, r, 0.1, c, o)),
  ...[["awis", "Wisdom", 20, 3, { pstat: "wis" }, 1500], ["acha", "Charisma", 10, 2, { pstat: "cha" }, 500], ["adigest", "Slow Digestion", 8, 2, { slowDigest: true }, 300],
      ["aacid", "Resist Acid", 12, 2, { res: ["acid"] }, 400], ["ainfra", "Infravision", 6, 2, { pinfra: true }, 300], ["award", "Warding", 15, 3, { pac: true }, 800],
      ["ainertia", "Inertia", 15, 2, { pspeed: true, cursed: true }, 0], ["adoom", "Doom", 25, 3, { pstat: "all", cursed: true }, 0]]
    .map(([id, n, dep, r, o, c]) => I("amulet", id, n, dep, r, 0.3, c, o))
];
for (const K of ITEMS){ const C = CAT[K.cat]; K.glyph = K.glyph || C.glyph; if (!K.rgb && C.rgb) K.rgb = C.rgb; K.slot = K.slot || C.slot; K.flavoured = !!C.flavour; }
const ITEM = Object.fromEntries(ITEMS.map(k => [k.id, k]));

// Special kinds of weapon and armour, and one-off artifacts. brand: extra damage of an element; slay: double
// damage to one sort of monster; res: elements resisted; stats: stat bonuses.
const EGOS = [
  { id: "burning", name: "of Burning", cats: ["weapon"], brand: "fire", depth: 8 }, { id: "frost", name: "of Frost", cats: ["weapon"], brand: "cold", depth: 8 },
  { id: "storms", name: "of Storms", cats: ["weapon"], brand: "elec", depth: 12 }, { id: "slaybeast", name: "of Slay Beast", cats: ["weapon"], slay: "animal", depth: 4 },
  { id: "slayundead", name: "of Slay Undead", cats: ["weapon"], slay: "undead", depth: 8 }, { id: "slayevil", name: "of Slay Evil", cats: ["weapon"], slay: "evil", depth: 12 },
  { id: "warding", name: "of Warding", cats: ["weapon"], ac: 5, res: ["fire", "cold", "acid", "elec"], depth: 25 }, { id: "sharp", name: "of Sharpness", cats: ["weapon"], dam: 4, depth: 15 },
  { id: "blessed", name: "(Blessed)", cats: ["weapon"], stats: { wis: 1 }, depth: 6 },
  { id: "rfire", name: "of Resist Fire", cats: ["body", "shield", "cloak"], res: ["fire"], depth: 4 }, { id: "rcold", name: "of Resist Cold", cats: ["body", "shield", "cloak"], res: ["cold"], depth: 4 },
  { id: "racid", name: "of Resist Acid", cats: ["body", "shield", "cloak"], res: ["acid"], depth: 6 }, { id: "relec", name: "of Resist Lightning", cats: ["body", "shield", "cloak"], res: ["elec"], depth: 6 },
  { id: "resistance", name: "of Resistance", cats: ["body", "shield"], res: ["fire", "cold", "acid", "elec"], depth: 25 },
  { id: "stealth", name: "of Stealth", cats: ["cloak", "feet"], stealth: 2, depth: 6 }, { id: "speed", name: "of Speed", cats: ["feet"], speed: [1, 4], depth: 35 },
  { id: "free", name: "of Free Action", cats: ["hands"], freeAct: true, depth: 10 }, { id: "seeing", name: "of Seeing", cats: ["head"], search: 15, infra: 2, depth: 10 },
  { id: "intellect", name: "of Intellect", cats: ["head"], stats: { int: 2 }, depth: 15 }, { id: "wisdom", name: "of Wisdom", cats: ["head"], stats: { wis: 2 }, depth: 15 },
  { id: "might", name: "of Might", cats: ["hands"], stats: { str: 2 }, depth: 15 },
  { id: "power", name: "of Power", cats: ["bow"], dam: 5, depth: 12 }, { id: "accuracy", name: "of Accuracy", cats: ["bow"], hit: 6, depth: 8 }
];
const EGO = Object.fromEntries(EGOS.map(e => [e.id, e]));
const ARTIFACTS = [
  { id: "embersong", name: "Embersong", base: "longsword", depth: 20, hit: 7, dam: 8, brand: "fire", res: ["fire"], light: 1, desc: "Its blade glows like a coal and hums softly." },
  { id: "mantle", name: "the Mantle of Quiet Steps", base: "cloak", depth: 18, ac: 8, stealth: 3, desc: "Grey cloth that seems to swallow sound." },
  { id: "stonehelm", name: "the Stonehelm of the Deep Halls", base: "greathelm", depth: 25, ac: 6, stats: { str: 2, con: 2 }, infra: 2, desc: "Carved from one block of dark stone, and yet light as a cap." },
  { id: "firstlamp", name: "the Lantern of the First Keeper", base: "lantern", depth: 30, radius: 5, nofuel: true, desc: "Its flame never needs oil." },
  { id: "starfall", name: "Starfall", base: "longbow", depth: 35, hit: 10, dam: 10, desc: "A bow of pale wood strung with silver." },
  { id: "swiftband", name: "the Band of Swift Feet", base: "rspeed", depth: 45, pval: 4, freeAct: true, desc: "A plain silver ring that makes the world seem slow." }
];
const ARTIFACT = Object.fromEntries(ARTIFACTS.map(a => [a.id, a]));

/* ---------- flavours and knowledge ---------- */
const FLAVOURS = {
  potion: [["Azure", [0.3, 0.55, 1.0]], ["Crimson", [1.0, 0.2, 0.25]], ["Murky", [0.45, 0.45, 0.3]], ["Bubbling", [0.6, 0.9, 0.8]], ["Golden", [1.0, 0.8, 0.25]], ["Smoky", [0.55, 0.55, 0.6]],
    ["Milky", [0.95, 0.95, 0.9]], ["Violet", [0.7, 0.35, 1.0]], ["Amber", [1.0, 0.6, 0.2]], ["Emerald", [0.25, 0.9, 0.4]], ["Silvery", [0.8, 0.85, 0.95]], ["Inky", [0.25, 0.25, 0.45]],
    ["Rosy", [1.0, 0.55, 0.65]], ["Brown", [0.6, 0.4, 0.25]], ["Cloudy", [0.75, 0.8, 0.85]], ["Fizzy", [0.85, 1.0, 0.6]], ["Oily", [0.5, 0.45, 0.2]], ["Glowing", [1.0, 1.0, 0.6]],
    ["Grey", [0.6, 0.6, 0.6]], ["Pink", [1.0, 0.6, 0.8]], ["Teal", [0.2, 0.75, 0.7]], ["Coppery", [0.85, 0.5, 0.3]], ["Speckled", [0.7, 0.65, 0.55]], ["Icy", [0.7, 0.9, 1.0]],
    ["Thick", [0.55, 0.35, 0.4]], ["Clear", [0.85, 0.9, 1.0]], ["Coral", [1.0, 0.5, 0.4]], ["Indigo", [0.35, 0.3, 0.8]], ["Chalky", [0.9, 0.88, 0.8]], ["Rusty", [0.7, 0.35, 0.2]]],
  wood: [["Oak", [0.7, 0.5, 0.3]], ["Ash", [0.8, 0.75, 0.6]], ["Yew", [0.6, 0.35, 0.25]], ["Elm", [0.65, 0.5, 0.35]], ["Birch", [0.9, 0.88, 0.8]], ["Willow", [0.7, 0.7, 0.5]],
    ["Hazel", [0.6, 0.45, 0.3]], ["Rowan", [0.75, 0.4, 0.3]], ["Cedar", [0.8, 0.45, 0.3]], ["Ebony", [0.3, 0.25, 0.25]], ["Maple", [0.85, 0.55, 0.35]], ["Pine", [0.8, 0.7, 0.45]],
    ["Walnut", [0.5, 0.35, 0.25]], ["Holly", [0.85, 0.85, 0.75]], ["Alder", [0.7, 0.45, 0.35]], ["Teak", [0.65, 0.45, 0.25]]],
  metal: [["Iron", [0.6, 0.6, 0.65]], ["Copper", [0.85, 0.5, 0.3]], ["Brass", [0.9, 0.75, 0.35]], ["Tin", [0.75, 0.78, 0.8]], ["Silver", [0.85, 0.87, 0.95]],
    ["Golden", [1.0, 0.8, 0.3]], ["Pewter", [0.6, 0.62, 0.62]], ["Bronze", [0.75, 0.5, 0.25]], ["Steel", [0.7, 0.75, 0.85]], ["Zinc", [0.7, 0.75, 0.75]]],
  stone: [["Jade", [0.35, 0.8, 0.5]], ["Ruby", [1.0, 0.2, 0.3]], ["Opal", [0.9, 0.9, 1.0]], ["Onyx", [0.3, 0.3, 0.35]], ["Garnet", [0.75, 0.15, 0.25]], ["Topaz", [1.0, 0.75, 0.3]],
    ["Pearl", [0.95, 0.95, 0.9]], ["Amethyst", [0.7, 0.4, 0.95]], ["Agate", [0.75, 0.55, 0.45]], ["Jasper", [0.8, 0.35, 0.3]], ["Quartz", [0.9, 0.9, 0.95]], ["Coral", [1.0, 0.5, 0.45]],
    ["Sapphire", [0.25, 0.4, 1.0]], ["Emerald", [0.25, 0.9, 0.45]], ["Moonstone", [0.8, 0.85, 1.0]], ["Obsidian", [0.25, 0.2, 0.3]], ["Bloodstone", [0.5, 0.6, 0.4]],
    ["Amber", [1.0, 0.65, 0.25]], ["Tourmaline", [0.9, 0.45, 0.6]], ["Malachite", [0.2, 0.7, 0.45]]],
  amulet: [["Bone", [0.9, 0.88, 0.75]], ["Copper", [0.85, 0.5, 0.3]], ["Crystal", [0.8, 0.9, 1.0]], ["Ivory", [0.95, 0.92, 0.8]], ["Silver", [0.85, 0.87, 0.95]],
    ["Golden", [1.0, 0.8, 0.3]], ["Iron", [0.6, 0.6, 0.65]], ["Amber", [1.0, 0.65, 0.25]], ["Shell", [0.95, 0.8, 0.75]], ["Wooden", [0.7, 0.5, 0.3]]],
  mushroom: [["Grey", [0.6, 0.6, 0.6]], ["Spotted", [0.9, 0.5, 0.4]], ["Purple", [0.7, 0.4, 0.9]], ["White", [0.95, 0.95, 0.9]], ["Black", [0.35, 0.3, 0.35]],
    ["Yellow", [1.0, 0.85, 0.3]], ["Red", [1.0, 0.3, 0.25]]]
};
const FLAVOUR_POOL = { potion: "potion", wand: "wood", staff: "wood", rod: "metal", ring: "stone", amulet: "amulet", mushroom: "mushroom" };
const SYLLABLES = ["ab", "ra", "zu", "mor", "ith", "kal", "vex", "lo", "nar", "eth", "qua", "dim", "or", "sel", "tha", "ung", "bri", "fal", "ok", "yr", "pex", "um", "gor", "wen"];
// A new character's knowledge: which flavour each kind wears, and which kinds they know.
function newKnowledge(rng){
  const know = { flav: {}, known: {}, tried: {}, arts: {} }, used = new Set();
  for (const cat of Object.keys(FLAVOUR_POOL)){
    const pool = rng.shuffle([...FLAVOURS[FLAVOUR_POOL[cat]]]);
    ITEMS.filter(K => K.cat === cat).forEach((K, i) => { know.flav[K.id] = pool[i % pool.length]; });
  }
  for (const K of ITEMS.filter(K => K.cat === "scroll")){   // scroll titles: made-up words, all different
    let t; do { t = Array.from({ length: 2 + rng.int(2) }, () => rng.pick(SYLLABLES) + (rng.chance(0.5) ? rng.pick(SYLLABLES) : "")).join(" "); } while (used.has(t));
    used.add(t); know.flav[K.id] = [t, [0.95, 0.92, 0.85]];
  }
  return know;
}
const kindKnown = (K, know) => !K.flavoured || !!know.known[K.id];
const itemRgb = (it, know) => { const K = ITEM[it.k]; return it.art && ARTIFACT[it.art].rgb || (K.flavoured ? know.flav[K.id][1] : K.rgb); };

/* ---------- making items ---------- */
// Weapons and armour roll a quality: cursed (minus bonuses, and they stick to you), plain, good (plus bonuses),
// or great (good, plus a special kind or, rarely, an artifact). Deeper means better odds.
function makeItem(k, depth, rng, know, n = 1){
  const K = ITEM[k], it = { k, n };
  if (K.fuel && K.cat === "light") it.fuel = K.fuel;
  if (K.charges) it.charges = rng.dice(K.charges);
  if (K.cat === "rod") it.timeout = 0;
  if (K.pstat || K.pac || K.phit || K.pdam || K.pspeed || K.pinfra){   // rings and amulets
    const p = K.pac ? 5 + rng.int(3 + depth / 2) : K.pspeed ? 1 + rng.int(depth >= 70 ? 6 : 3) : 1 + rng.int(2 + Math.floor(depth / 15));
    it.pval = K.cursed ? -p : p; if (K.cursed) it.cursed = true;
  }
  if (K.cursed) it.cursed = true;
  if (!K.dice && !K.ac && !K.mult) return it;
  if (K.cat === "dart") return it;
  const roll = rng.int(100), good = Math.min(60, 12 + depth * 1.5), bonus = () => 1 + rng.int(3 + Math.floor(depth / 5));
  const armourish = ARMOUR_CATS.includes(K.cat);
  if (roll < 10){   // cursed
    it.cursed = K.cat !== "ammo";
    if (armourish) it.toac = -bonus(); else { it.tohit = -bonus(); it.todam = -bonus(); }
  } else if (roll < 10 + good){
    if (armourish) it.toac = bonus(); else { it.tohit = bonus(); it.todam = bonus(); }
    if (rng.int(100) < Math.min(35, 5 + depth)){   // great
      const art = ARTIFACTS.find(a => a.base === k && a.depth <= depth && !know.arts[a.id]);
      if (art && rng.chance(0.15)) return makeArtifact(art, know);
      const egos = EGOS.filter(e => e.cats.includes(K.cat) && e.depth <= depth);
      if (egos.length && K.cat !== "ammo"){ const e = rng.pick(egos); it.ego = e.id; if (e.speed) it.pval = e.speed[0] + rng.int(e.speed[1]); if (e.dam) it.todam = (it.todam || 0) + e.dam; if (e.hit) it.tohit = (it.tohit || 0) + e.hit; if (e.ac) it.toac = (it.toac || 0) + e.ac; }
    }
  }
  return it;
}
function makeArtifact(A, know){
  know.arts[A.id] = true;   // each artifact exists once per game
  const K = ITEM[A.base], it = { k: A.base, n: 1, art: A.id, tohit: A.hit || 0, todam: A.dam || 0, toac: A.ac || 0 };
  if (K.fuel && !A.nofuel) it.fuel = K.fuel;
  if (A.pval) it.pval = A.pval;
  return it;
}
function rollItem(depth, rng, know){
  const pool = ITEMS.filter(K => K.depth <= depth && (K.cat !== "rod" || depth >= 5));
  const K = rng.weighted(pool, K => 1 / K.rarity * (K.depth >= depth - 5 ? 1.4 : 1) * (K.cat === "potion" || K.cat === "scroll" ? 1.6 : 1));
  const n = K.cat === "ammo" ? rng.range(10, 25) : K.cat === "dart" ? rng.range(4, 12) : (K.cat === "potion" || K.cat === "scroll" || K.cat === "food" || K.cat === "flask") && rng.chance(0.25) ? rng.range(2, 4) : 1;
  return makeItem(K.id, depth, rng, know, n);
}

/* ---------- what an item adds when worn ---------- */
// Everything a worn item gives, from its kind, its rolled numbers, its special kind or artifact.
function itemPowers(it){
  const K = ITEM[it.k], E = it.ego ? EGO[it.ego] : null, A = it.art ? ARTIFACT[it.art] : null, out = { stats: {}, res: [] };
  const merge = s => { if (!s) return; if (s.stats) for (const [k, v] of Object.entries(s.stats)) out.stats[k] = (out.stats[k] || 0) + v; if (s.res) out.res.push(...s.res);
    for (const f of ["brand", "slay", "freeAct", "slowDigest", "teleportCurse"]) if (s[f]) out[f] = s[f];
    for (const f of ["stealth", "search", "infra", "regen", "light"]) if (s[f]) out[f] = (out[f] || 0) + s[f]; };
  merge(K); merge(E); merge(A);
  const p = it.pval || 0;
  if (K.pstat === "all") for (const s of ["str", "int", "wis", "dex", "con", "cha"]) out.stats[s] = (out.stats[s] || 0) + p;
  else if (K.pstat) out.stats[K.pstat] = (out.stats[K.pstat] || 0) + p;
  out.ac = (K.ac || 0) + (it.toac || 0) + (K.pac ? p : 0);
  out.hit = (it.tohit || 0) + (K.phit ? p : 0);
  out.dam = (it.todam || 0) + (K.pdam ? p : 0);
  out.speed = K.pspeed || (E && E.speed) || (A && A.pval && ITEM[A.base].pspeed) ? p : 0;
  if (K.pinfra) out.infra = (out.infra || 0) + p;
  return out;
}

/* ---------- names ---------- */
function plural(name){ const i = name.indexOf(" of "), w = i > 0 ? name.slice(0, i) : name, rest = i > 0 ? name.slice(i) : ""; return w + (/(ch|sh|s|x)$/.test(w) ? "es" : "s") + rest; }
const sign = v => (v >= 0 ? "+" : "") + v;
// The name the player sees, which depends on what they know: the kind, and (once identified) the numbers.
function itemName(it, know, count = it.n){
  const K = ITEM[it.k], A = it.art ? ARTIFACT[it.art] : null, E = it.ego ? EGO[it.ego] : null, known = kindKnown(K, know), many = count > 1;
  const an = s => (/^[AEIOU]/.test(s) ? "an " : "a ") + s;
  let base;
  if (K.flavoured){
    const [fl] = know.flav[K.id], noun = { potion: "Potion", scroll: "Scroll", wand: "Wand", staff: "Staff", rod: "Rod", ring: "Ring", amulet: "Amulet", mushroom: "Mushroom" }[K.cat];
    if (K.cat === "scroll") base = (many ? count + " Scrolls" : "a Scroll") + (known ? " of " + K.name : " titled \"" + fl + "\"");
    else if (known) base = (many ? count + " " + plural(noun) : an(noun)) + " of " + K.name;
    else base = many ? count + " " + fl + " " + plural(noun) : an(fl + " " + noun);
  } else base = many ? count + " " + plural(K.name) : an(K.name);
  if (A && it.id) base = A.name + ", " + an(K.name);
  else if (E && it.id) base += " " + E.name;
  let s = base;
  if (K.dice && (K.cat === "weapon" || K.cat === "ammo")) s += " (" + K.dice + ")";   // a wand's dice would give it away
  if (K.mult) s += " (x" + K.mult + ")";
  if (K.ac !== undefined && K.cat !== "ring") s += " [" + K.ac + (it.id && it.toac ? "," + sign(it.toac) : "") + "]";
  if (it.id && (it.tohit || it.todam) && !K.ac) s += " (" + sign(it.tohit || 0) + "," + sign(it.todam || 0) + ")";
  if (it.id && it.pval && known && (K.pstat || K.pspeed || K.pinfra || K.phit || K.pdam)) s += K.phit && K.pdam ? " (" + sign(it.pval) + "," + sign(it.pval) + ")" : " (" + sign(it.pval) + ")";
  if (it.id && it.pval && known && K.pac) s += " [" + sign(it.pval) + "]";
  if (it.id && it.pval && (E || A) && !(K.pstat || K.pspeed || K.pinfra || K.phit || K.pdam || K.pac)) s += " (" + sign(it.pval) + ")";
  if (it.charges !== undefined && it.id && known) s += " (" + it.charges + " charge" + (it.charges === 1 ? "" : "s") + ")";
  if (it.fuel !== undefined) s += " (" + it.fuel + " turns)";
  if (K.cat === "rod" && it.timeout > 0) s += " (charging)";
  const tag = it.id ? (it.cursed ? "cursed" : "") : it.sense || (known && K.flavoured ? "" : know.tried[K.id] ? "tried" : "");
  if (it.charges === 0 && !it.id) s += " {empty}";
  else if (tag) s += " {" + tag + "}";
  return s;
}
const itemWeight = it => ITEM[it.k].wt * it.n;
