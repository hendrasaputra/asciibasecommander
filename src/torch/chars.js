/* ---------- Torchlight Dungeons: races, classes, stats and skills (phase 2) ---------- */
// Original content: the peoples, callings, titles and numbers here are this game's own, not Moria's.
// Stats run 3..25; each 2 points above 10 give +1 (statMod). Skills are percentages, roughly: Poor under 20,
// Superb over 80. A skill is [value at level 1, gain per level]; races add flat amounts.
const STATS = ["str", "int", "wis", "dex", "con", "cha"];
const STAT_NAMES = { str: "Strength", int: "Intellect", wis: "Wisdom", dex: "Dexterity", con: "Constitution", cha: "Charisma" };
const SKILLS = ["fight", "shoot", "save", "stealth", "disarm", "device", "search", "notice"];
const SKILL_NAMES = { fight: "Fighting", shoot: "Shooting", save: "Saving throw", stealth: "Stealth", disarm: "Disarming", device: "Magic devices", search: "Searching", notice: "Noticing" };
const RACES = [
  { id: "human", name: "Human", stats: {}, hd: 10, infra: 0, xp: 0, skills: {},
    desc: "Adaptable and quick to learn. No gifts and no failings; they rise in level fastest." },
  { id: "sylvan", name: "Sylvan", stats: { str: -1, int: 2, wis: 1, dex: 1, con: -1, cha: 1 }, hd: 9, infra: 3, xp: 20,
    skills: { fight: -5, shoot: 10, save: 5, stealth: 2, device: 5, search: 5, notice: 5 },
    desc: "Slender forest folk with keen eyes and quiet feet. Good archers and casters, a little frail." },
  { id: "stonekin", name: "Stonekin", stats: { str: 2, int: -1, wis: 1, dex: -2, con: 2, cha: -2 }, hd: 11, infra: 5, xp: 20,
    skills: { fight: 10, save: 10, stealth: -1, search: 5 },
    desc: "Broad, stubborn people of the deep halls. Tough, strong-willed, and they see heat in the dark." },
  { id: "burrowfolk", name: "Burrowfolk", stats: { str: -2, int: 1, wis: 1, dex: 3, cha: 1 }, hd: 7, infra: 4, xp: 10,
    skills: { fight: -10, shoot: 15, save: 10, stealth: 4, disarm: 15, search: 10, notice: 10 },
    desc: "Small, nimble and hard to notice. Poor in a brawl, superb at sneaking and slings." },
  { id: "tinkerling", name: "Tinkerling", stats: { str: -1, int: 2, dex: 2, con: -1, cha: -1 }, hd: 8, infra: 4, xp: 25,
    skills: { fight: -8, save: 10, stealth: 2, disarm: 10, device: 20 },
    desc: "Clever little makers who can coax any wand or gadget to work, and pick most locks." },
  { id: "ashborn", name: "Ashborn", stats: { str: 1, int: 1, wis: -1, con: 1, cha: -1 }, hd: 10, infra: 3, xp: 35, fireRes: true,
    skills: { fight: 3, device: 5 },
    desc: "Born near the deep fires, with ember-coloured eyes. They resist fire: burns hurt them far less." },
  { id: "marrowkin", name: "Marrowkin", stats: { str: 2, int: -2, wis: -1, con: 1, cha: -3 }, hd: 10, infra: 3, xp: 10,
    skills: { fight: 12, stealth: -1, device: -10 },
    desc: "Rough, tusked brawlers, unwelcome in most towns but welcome in any fight." },
  { id: "cragborn", name: "Cragborn", stats: { str: 4, int: -4, wis: -2, dex: -3, con: 3, cha: -3 }, hd: 12, infra: 3, xp: 40, regen: 1.5,
    skills: { fight: 20, shoot: -10, save: -5, stealth: -2, device: -15 },
    desc: "Huge, slow-witted giants of the mountain roots. Hit hardest of all and heal fast." }
];
const CLASSES = [
  { id: "sellsword", name: "Sellsword", stats: { str: 3, int: -2, wis: -2, dex: 2, con: 2 }, hd: 10, xp: 0,
    fight: [65, 3.0], shoot: [50, 2.2], save: [25, 1.0], stealth: 1, disarm: [25, 1.0], device: [20, 0.8], search: [20, 0.5], notice: [25, 0.5],
    titles: ["Recruit", "Blade", "Veteran", "Swordhand", "Champion", "Warden", "Hero", "Warlord", "Lord of Blades", "Unbroken"],
    desc: "A fighter for hire. The most hit points and the surest blows; no magic at all." },
  { id: "arcanist", name: "Arcanist", stats: { str: -4, int: 3, dex: 1, con: -2, cha: 1 }, hd: 4, xp: 30, realm: "arcane", stat: "int",
    fight: [35, 1.5], shoot: [40, 1.5], save: [40, 1.6], stealth: 2, disarm: [35, 1.4], device: [50, 2.0], search: [25, 0.8], notice: [30, 0.8],
    titles: ["Novice", "Scribe", "Spark-wright", "Conjurer", "Spellbinder", "Thaumaturge", "Magister", "Arch-scholar", "Stormcaller", "Archmage"],
    desc: "A student of the arcane. Frail, but casts Spark: a bolt of light that strikes from a distance." },
  { id: "lampwarden", name: "Lampwarden", stats: { str: -1, int: -2, wis: 3, dex: -1, con: 1, cha: 2 }, hd: 6, xp: 20, realm: "holy", stat: "wis", lightBonus: 1,
    fight: [45, 2.0], shoot: [35, 1.2], save: [45, 1.8], stealth: 1, disarm: [25, 1.0], device: [40, 1.6], search: [25, 0.8], notice: [30, 0.8],
    titles: ["Acolyte", "Lamp-bearer", "Keeper", "Watcher", "Warden", "Beacon", "High Keeper", "Lightward", "Dawnbringer", "Lamp of the Deep"],
    desc: "A keeper of the sacred flame. Their light reaches one step further, and they pray Mend to heal." },
  { id: "delver", name: "Delver", stats: { int: 1, wis: -2, dex: 3, cha: -1 }, hd: 7, xp: 25, ambush: true,
    fight: [50, 2.2], shoot: [55, 2.4], save: [35, 1.4], stealth: 5, disarm: [55, 2.2], device: [40, 1.6], search: [45, 1.4], notice: [45, 1.4],
    titles: ["Footpad", "Cutpurse", "Sneak", "Prowler", "Shadow", "Infiltrator", "Vaultbreaker", "Nightblade", "Master Delver", "Unseen"],
    desc: "A quiet treasure-seeker. Monsters stay asleep longer, and a sleeping one takes double damage." },
  { id: "wayfinder", name: "Wayfinder", stats: { int: 1, wis: -1, dex: 2, con: 1 }, hd: 8, xp: 30, kit: [["dart", 10], ["shot", 30]], bow: "sling",
    fight: [52, 2.4], shoot: [70, 3.2], save: [35, 1.4], stealth: 3, disarm: [35, 1.4], device: [35, 1.4], search: [40, 1.2], notice: [45, 1.4],
    titles: ["Trailhand", "Scout", "Tracker", "Pathfinder", "Outrider", "Hunter", "Far-strider", "Deepranger", "Wayfinder", "Warden of Roads"],
    desc: "A scout of the deep roads. The best shot: starts with a sling, iron shot and throwing darts." },
  { id: "oathknight", name: "Oathknight", stats: { str: 2, int: -3, wis: 1, con: 1, cha: 2 }, hd: 9, xp: 35, realm: "holy", stat: "wis", manaK: 0.6,
    fight: [60, 2.8], shoot: [40, 1.6], save: [40, 1.6], stealth: 1, disarm: [25, 1.0], device: [30, 1.2], search: [20, 0.5], notice: [25, 0.6],
    titles: ["Squire", "Sworn", "Shieldbearer", "Knight", "Oathkeeper", "Knight-Captain", "Lord Protector", "Banneret", "Paragon", "Oathbound"],
    desc: "A holy warrior. Fights nearly as well as a Sellsword and can pray Mend, with less power." }
];
const RACE = Object.fromEntries(RACES.map(r => [r.id, r])), CLASS = Object.fromEntries(CLASSES.map(c => [c.id, c]));
// Class powers: each caster's first spell. Phase 5 folds these into full spell books.
const POWERS = {
  spark: { name: "Spark", cost: 1, realm: "arcane", dice: "3d4", aim: true, desc: "a bolt of light" },
  mend: { name: "Mend", cost: 2, realm: "holy", heal: "3d6", desc: "heals wounds" }
};
const powerFor = C => C.realm === "arcane" ? "spark" : C.realm === "holy" ? "mend" : null;

const statMod = v => Math.floor((v - 10) / 2);
const clampStat = v => Math.max(3, Math.min(25, v));
// Base stats: rolled as 4d6 keeping the best three, or bought with points (every stat starts at 8).
function rollStats(rng){ const s = {}; for (const k of STATS){ const d = [0, 0, 0, 0].map(() => 1 + rng.int(6)).sort((a, b) => b - a); s[k] = d[0] + d[1] + d[2]; } return s; }
const BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9, 16: 12 }, BUY_POINTS = 30;
const buySpent = s => STATS.reduce((t, k) => t + BUY_COST[s[k]], 0);
function finalStats(base, R, C){ const s = {}; for (const k of STATS) s[k] = clampStat(base[k] + (R.stats[k] || 0) + (C.stats[k] || 0)); return s; }
function skillOf(p, k){
  const R = RACE[p.race], C = CLASS[p.cls], s = p.stats, lv = p.lvl - 1;
  if (k === "stealth") return C.stealth + (R.skills.stealth || 0) + Math.max(0, statMod(s.dex) >> 1);
  const v = C[k][0] + C[k][1] * lv + (R.skills[k] || 0);
  const bonus = { fight: statMod(s.dex) * 2 + statMod(s.str), shoot: statMod(s.dex) * 3, save: statMod(s.wis) * 3, disarm: (statMod(s.dex) + statMod(s.int)) * 2,
    device: statMod(s.int) * 3, search: statMod(s.int) * 2, notice: statMod(s.wis) * 2 }[k];
  return Math.round(v + bonus);
}
const skillWord = v => v < 20 ? "Poor" : v < 35 ? "Fair" : v < 50 ? "Good" : v < 65 ? "Very good" : v < 80 ? "Excellent" : "Superb";
const stealthWord = v => ["Bad", "Poor", "Fair", "Fair", "Good", "Good", "Very good", "Excellent", "Superb"][Math.max(0, Math.min(8, v))];
const hitDie = p => Math.round((RACE[p.race].hd + CLASS[p.cls].hd) / 2);
function expNeeded(p, lvl){ return Math.round(expFor(lvl) * (100 + RACE[p.race].xp + CLASS[p.cls].xp) / 100); }
function maxMana(p){
  const C = CLASS[p.cls]; if (!C.realm) return 0;
  return Math.max(1, Math.floor((2 + p.lvl * 1.2) * (1 + statMod(p.stats[C.stat]) * 0.15) * (C.manaK || 1)));
}
const titleOf = p => CLASS[p.cls].titles[Math.min(9, Math.floor((p.lvl - 1) / 4))];
// Hit points: two hit dice and a little more at level 1, then one roll per level; Constitution adds to each.
const firstHp = p => hitDie(p) * 2 + 4 + statMod(p.stats.con) * 2;
const levelHp = (p, rng) => Math.max(1, 1 + rng.int(hitDie(p)) + statMod(p.stats.con));
// Names for a new character, from syllables.
function randomName(rng){
  const a = ["Ar", "Bel", "Cor", "Da", "El", "Fen", "Gar", "Hal", "Is", "Jor", "Kel", "Lir", "Mor", "Nes", "Or", "Pel", "Quen", "Ros", "Sel", "Tor", "Ul", "Vey", "Wen", "Yr"];
  const b = ["a", "e", "i", "o", "an", "en", "ir", "or", "ul", "ar"], c = ["d", "n", "th", "k", "l", "ra", "wyn", "mir", "dor", "sa", "ric", "ven"];
  return rng.pick(a) + (rng.chance(0.6) ? rng.pick(b) : "") + rng.pick(c);
}
