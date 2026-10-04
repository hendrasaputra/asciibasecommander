// Balance check for Torchlight Dungeons' bestiary. Run: node tests/balance.js   (add -v for every band's worst fights)
// For each monster, a character of each class at the level you would expect at that depth fights it (and its pack)
// by expected values: hit chances, average damage, speed, spells and breath, resistances you would have by then,
// fighting a pack two at a time from a corridor.
// A fight scores the share of the character's hit points it costs. Above 1 you would usually lose; the check fails
// if a monster scores over its limit for the middle class (1.4 for most, 2.5 for uniques, 3.5 for the final boss).
const fs = require("fs"), vm = require("vm"), path = require("path");
const files = ["rng.js", "data.js", "bestiary.js", "chars.js", "spells.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", "torch", f), "utf8"));
const G = vm.runInNewContext(files.join("\n") + "\n;({ MONSTERS, CLASSES, RACE, CLASS, finalStats, skillOf, statMod, hitDie, firstHp, maxMana, SPELLS, spellLevel, hitChance, blowChance, boltDice, breathDmg })");
const avg = s => { const [n, d] = s.split("d").map(Number); return n * (d + 1) / 2; };
const gain = s => 10 * Math.pow(2, s / 10);
const verbose = process.argv.includes("-v");

// the character you would expect to be at a depth, with the gear and resistances you would have found by then
const levelAt = d => Math.max(1, Math.min(40, Math.round(1 + d * 0.8)));
function hero(C, d){
  const lvl = levelAt(d), base = { str: 14, int: 14, wis: 14, dex: 14, con: 14, cha: 11 };
  for (const k in base) base[k] += Math.floor(d / 12);   // stat potions and gear
  const p = { race: "human", cls: C.id, lvl, stats: G.finalStats(base, G.RACE.human, C) };
  p.hp = G.firstHp(p) + (lvl - 1) * Math.max(1, (G.hitDie(p) - 1) / 2 + 1 + G.statMod(p.stats.con));
  p.ac = Math.round(6 + d * 1.1) + G.statMod(p.stats.dex) + Math.floor(lvl / 5);
  const wdmg = 3.5 + d * 0.12 + d / 4 + G.statMod(p.stats.str), wHit = Math.floor(d / 4);
  p.melee = K => G.hitChance(G.skillOf(p, "fight") + 3 * wHit, K.ac) / 100 * Math.max(1, wdmg) * (K.res && C.realm ? 1 : 1);
  // a caster's best attack spell (with its level bonus), if it beats the weapon
  const S = G.SPELLS.filter(S => ["bolt", "ball", "beam"].includes(S.fx) && G.spellLevel(S, C) <= lvl).map(S => ({ S, dmg: (S.dice ? avg(S.dice) + lvl / 2 : S.dmg + lvl) * (1 - Math.min(0.5, S.fail / 100)) }))
    .sort((a, b) => b.dmg - a.dmg)[0];
  p.spell = S ? K => S.dmg / ((K.res || []).includes(S.S.elem) ? 3 : 1) : null;
  p.mana = C.realm ? G.maxMana(p) : 0;
  p.res = new Set([...(d >= 22 ? ["fire", "cold"] : []), ...(d >= 28 ? ["elec", "acid"] : []), ...(d >= 34 ? ["poison"] : [])]);
  p.freeAct = d >= 15;
  return p;
}
// What one monster does to you in one of its turns, on average.
function monsterTurn(K, p, hp){
  const resist = e => e && p.res.has(e) ? 1 / 3 : 1;
  const melee = K.blows.reduce((s, [dice, , fx]) => s + G.blowChance(K.depth, p.ac) / 100 * avg(dice) * resist(fx) * (fx === "paralyze" && !p.freeAct ? 2 : 1), 0);
  if (!K.spells) return K.still ? melee * 0.5 : melee;   // you can walk away from things that never move
  const f = 1 / K.spells.freq, spell = K.spells.list.reduce((s, S) => {
    const [k, e] = S.split(":"), b = avg(G.boltDice(K.depth));
    return s + (k === "bolt" ? b * resist(e) : k === "ball" ? b * 1.4 * resist(e) : k === "arrow" ? b * 0.6 : k === "breath" ? G.breathDmg(hp, K.depth) * resist(e) : k === "paralyze" && !p.freeAct ? melee * 2 : 0);
  }, 0) / K.spells.list.length;
  return f * spell + (1 - f) * (K.still ? melee * 0.5 : melee);
}
// The share of your hit points a fight against K costs you. A pack is fought from a corridor: two at a time at most.
function fight(K, p){
  const n = K.pack ? (K.pack[0] + K.pack[1]) / 2 : 1, hp = avg(K.hp);
  let mana = p.mana, cost = 0;
  const speed = gain(K.speed) / gain(0);
  for (let k = n; k > 0; k--){   // one at a time they fall, while up to two of them hit you
    let left = hp;
    while (left > 0){
      const useSpell = p.spell && mana >= 2 && p.spell(K) > p.melee(K);
      left -= useSpell ? p.spell(K) : p.melee(K); if (useSpell) mana -= 3;
      cost += Math.min(k, 2) * speed * monsterTurn(K, p, Math.max(left, hp * 0.3));
      if (cost > p.hp * 10) return 10;
    }
  }
  return cost / p.hp;
}

let failed = 0;
const bands = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25], [26, 30], [31, 35], [36, 40], [41, 45], [46, 50], [51, 60]];
for (const [lo, hi] of bands){
  const ks = G.MONSTERS.filter(K => !K.town && K.depth >= lo && K.depth <= hi), rows = [];
  for (const K of ks){
    const scores = G.CLASSES.map(C => fight(K, hero(C, K.depth))).sort((a, b) => a - b), mid = scores[2];   // the third best of six
    const limit = K.boss ? 3.5 : K.unique ? 2.5 : 1.4;
    rows.push({ K, mid, best: scores[0], limit, bad: mid > limit });
  }
  rows.sort((a, b) => b.mid - a.mid);
  const bad = rows.filter(r => r.bad), easy = rows.filter(r => r.mid < 0.05);
  console.log(`${bad.length ? "FAIL " : "ok   "} ${String(lo * 50).padStart(4)}-${String(hi * 50).padEnd(5)} ft  ${String(ks.length).padStart(2)} kinds, level ${levelAt(lo)}-${levelAt(hi)}; hardest: ${rows.slice(0, 2).map(r => r.K.id + " " + r.mid.toFixed(2)).join(", ")}${easy.length ? "; trivial: " + easy.length : ""}`);
  if (verbose) for (const r of rows.slice(0, 6)) console.log("        " + r.K.id.padEnd(16) + " middle " + r.mid.toFixed(2) + "  best " + r.best.toFixed(2) + "  limit " + r.limit);
  for (const r of bad) console.log("        too strong: " + r.K.id + " (" + r.K.name + ") scores " + r.mid.toFixed(2) + ", limit " + r.limit);
  failed += bad.length;
}
console.log(failed ? failed + " monsters are too strong" : "every band is winnable at its expected level");
process.exitCode = failed ? 1 : 0;
