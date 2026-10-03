/* ---------- Torchlight Dungeons: game data (phase 1) ---------- */
// Original content, written for this game: no names, numbers or descriptions are taken from Moria or Umoria.
// Depth is in levels (one level is 50 ft). Speed: 0 normal, +10 twice as fast, -10 half as fast.
// Monster flags: erratic (share of random moves), pack [min, max], still (never moves), flee (runs when hurt),
// glow { r, rgb } (gives off light), drop (chance to carry gold or an item), cold (no body heat: infravision
// cannot see it), animal / undead / evil (for weapons that slay them), res (elements it shrugs off).
const MONSTERS = [
  { id: "rat", animal: true, name: "cave rat", glyph: "r", rgb: [0.75, 0.55, 0.4], depth: 1, rarity: 1, speed: 0, hp: "2d3", ac: 2, exp: 1,
    blows: [["1d3", "bites"]], erratic: 0.3, desc: "A mangy rat with yellow teeth, bolder in the dark." },
  { id: "slug", animal: true, cold: true, name: "mire slug", glyph: "w", rgb: [0.45, 0.75, 0.35], depth: 1, rarity: 1, speed: -10, hp: "3d4", ac: 1, exp: 1,
    blows: [["1d2", "slimes"]], desc: "A fat slug that leaves a glistening trail across the stone." },
  { id: "moth", animal: true, cold: true, name: "glimmer moth", glyph: "I", rgb: [0.75, 1.0, 0.55], depth: 1, rarity: 2, speed: 10, hp: "1d4", ac: 3, exp: 2,
    blows: [["1d2", "brushes"]], erratic: 0.6, glow: { r: 3, rgb: [0.45, 0.8, 0.35] }, desc: "Its wings shed a pale green light as it flutters about." },
  { id: "jackal", animal: true, name: "tunnel jackal", glyph: "C", rgb: [0.8, 0.65, 0.4], depth: 2, rarity: 1, speed: 0, hp: "2d5", ac: 3, exp: 2,
    blows: [["1d3", "bites"]], pack: [3, 5], desc: "Lean scavengers that hunt in yapping packs." },
  { id: "mold", res: ["poison"], cold: true, name: "weeping mold", glyph: "m", rgb: [0.55, 0.8, 0.7], depth: 2, rarity: 2, speed: 0, hp: "6d6", ac: 1, exp: 4,
    blows: [["1d6", "stings"]], still: true, desc: "A damp grey-green growth that oozes when touched." },
  { id: "goblin", evil: true, name: "pit goblin", glyph: "g", rgb: [0.55, 0.85, 0.45], depth: 3, rarity: 1, speed: 0, hp: "3d6", ac: 6, exp: 4,
    blows: [["1d6", "hits"]], drop: 0.5, flee: true, desc: "A wiry goblin in rags, clutching a rusty blade and a stolen purse." },
  { id: "spider", animal: true, cold: true, name: "cave spider", glyph: "S", rgb: [0.6, 0.55, 0.7], depth: 4, rarity: 2, speed: 10, hp: "1d6", ac: 4, exp: 2,
    blows: [["1d4", "bites"]], pack: [3, 5], desc: "Quick black spiders that pour out of cracks in swarms." },
  { id: "skeleton", undead: true, evil: true, res: ["cold", "poison"], cold: true, name: "bone rattler", glyph: "s", rgb: [0.95, 0.95, 0.85], depth: 4, rarity: 1, speed: 0, hp: "4d6", ac: 9, exp: 8,
    blows: [["1d6", "claws"]], desc: "Old bones held together by spite, clicking as they walk." },
  { id: "beetle", animal: true, res: ["fire"], cold: true, name: "ember beetle", glyph: "K", rgb: [1.0, 0.45, 0.2], depth: 4, rarity: 2, speed: 0, hp: "5d6", ac: 12, exp: 10,
    blows: [["2d4", "burns"]], glow: { r: 2, rgb: [1.0, 0.35, 0.1] }, desc: "Its shell glows like a coal from the fire in its belly." },
  { id: "wolf", animal: true, name: "grey wolf", glyph: "C", rgb: [0.7, 0.7, 0.75], depth: 6, rarity: 1, speed: 10, hp: "5d6", ac: 10, exp: 15,
    blows: [["1d6", "bites"], ["1d4", "bites"]], pack: [3, 6], desc: "A hungry wolf, one of many, with eyes that catch your light." },
  { id: "brute", evil: true, name: "goblin brute", glyph: "g", rgb: [0.9, 0.6, 0.35], depth: 6, rarity: 1, speed: 0, hp: "8d8", ac: 14, exp: 18,
    blows: [["1d10", "smashes"]], drop: 0.6, desc: "A hulking goblin who wears a door as a shield." },
  { id: "bear", animal: true, name: "cave bear", glyph: "q", rgb: [0.65, 0.45, 0.3], depth: 7, rarity: 2, speed: 0, hp: "10d8", ac: 16, exp: 25,
    blows: [["1d8", "claws"], ["1d8", "claws"], ["1d10", "bites"]], desc: "It rears up on its hind legs, filling the corridor." },
  { id: "wisp", res: ["elec", "poison"], cold: true, name: "marsh wisp", glyph: "*", rgb: [0.6, 0.8, 1.2], depth: 8, rarity: 3, speed: 10, hp: "6d6", ac: 20, exp: 30,
    blows: [["2d6", "shocks"]], erratic: 0.5, glow: { r: 4, rgb: [0.35, 0.55, 1.0] }, desc: "A drifting ball of cold blue light that crackles as it nears." },
  { id: "ghoul", undead: true, evil: true, res: ["cold", "poison"], cold: true, name: "crypt ghoul", glyph: "z", rgb: [0.6, 0.75, 0.55], depth: 9, rarity: 2, speed: 0, hp: "12d8", ac: 18, exp: 40,
    blows: [["1d8", "claws"], ["1d8", "claws"]], drop: 0.4, desc: "A grey, stooped corpse-eater that smells you long before it sees you." },
  { id: "troll", evil: true, name: "stone troll", glyph: "T", rgb: [0.6, 0.6, 0.6], depth: 10, rarity: 2, speed: 0, hp: "16d10", ac: 24, exp: 70,
    blows: [["1d10", "hits"], ["1d10", "hits"], ["2d6", "bites"]], drop: 0.5, desc: "Grey hide like weathered rock, and a club made from a stalactite." }
];
const MONSTER = Object.fromEntries(MONSTERS.map(m => [m.id, m]));
// Experience needed for each character level, and the depth in feet shown to the player.
const expFor = lvl => Math.round(8 * Math.pow(lvl - 1, 2.1));
const feet = depth => depth * 50;
