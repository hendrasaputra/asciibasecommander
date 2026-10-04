/* ---------- Torchlight Dungeons: game data (phase 1); the dungeon's monsters are in bestiary.js (phase 7) ---------- */
// Original content, written for this game: no names, numbers or descriptions are taken from Moria or Umoria.
// Depth is in levels (one level is 50 ft; 0 is the town). Speed: 0 normal, +10 twice as fast, -10 half as fast.
// Monster flags: erratic (share of random moves), pack [min, max], still (never moves), flee (runs when hurt),
// glow { r, rgb } (gives off light), drop (chance to carry gold or an item), cold (no body heat: infravision
// cannot see it), animal / undead / evil (for weapons that slay them), res (elements it shrugs off).
const MONSTERS = [
  // the townsfolk of Lanternhollow, on the surface (town: true); "steal" takes some gold and runs off with it
  { id: "peddler", town: true, name: "wandering peddler", glyph: "p", rgb: [0.8, 0.7, 0.5], depth: 0, rarity: 1, speed: 0, hp: "1d4", ac: 1, exp: 0,
    blows: [["0d0", "tries to sell you a bent spoon"]], erratic: 0.7, desc: "A cheerful pedlar weighed down by a pack of useless trinkets." },
  { id: "mutt", town: true, name: "stray mutt", glyph: "C", rgb: [0.7, 0.55, 0.4], depth: 0, rarity: 1, speed: 10, hp: "1d3", ac: 2, exp: 0, animal: true,
    blows: [["1d1", "nips"]], erratic: 0.6, desc: "A scruffy dog that follows anyone who might drop a crust." },
  { id: "reveller", town: true, name: "tipsy reveller", glyph: "p", rgb: [0.9, 0.5, 0.6], depth: 0, rarity: 1, speed: 0, hp: "1d6", ac: 1, exp: 0,
    blows: [["0d0", "sings at you"]], erratic: 0.8, desc: "Someone who has been celebrating something since yesterday." },
  { id: "cutpurse", town: true, name: "cutpurse", glyph: "p", rgb: [0.55, 0.6, 0.75], depth: 0, rarity: 2, speed: 10, hp: "2d4", ac: 4, exp: 1,
    blows: [["0d0", "touches", "steal"]], desc: "Quick fingers, a hood pulled low, and an eye on your purse." },
  { id: "brawler", town: true, name: "dockside brawler", glyph: "p", rgb: [0.85, 0.6, 0.35], depth: 0, rarity: 2, speed: 0, hp: "3d6", ac: 3, exp: 1, evil: true,
    blows: [["1d4", "punches"]], desc: "Spoiling for a fight, and not fussy about with whom." }
];
// Experience needed for each character level, and the depth in feet shown to the player.
const expFor = lvl => Math.round(8 * Math.pow(lvl - 1, 2.1));
const feet = depth => depth * 50;
