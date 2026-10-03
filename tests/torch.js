// Checks for Torchlight Dungeons' rules. Run: node tests/torch.js
// Loads the game's logic files without a browser: random numbers, sight and light, turns, levels and data.
const fs = require("fs"), vm = require("vm"), path = require("path");
const files = ["rng.js", "fov.js", "turn.js", "gen.js", "data.js", "items.js", "chars.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", "torch", f), "utf8"));
const G = vm.runInNewContext(files.join("\n") + "\n;({ RNG, fov, addLight, lum, nextActor, generateLevel, reachable, T, MW, MH, passable, opaque, MONSTERS, ITEMS, ITEM, EGOS, ARTIFACTS, CAT, SLOTS, newKnowledge, makeItem, rollItem, itemName, itemPowers, kindKnown, RACES, CLASSES, RACE, CLASS, STATS, SKILLS, rollStats, finalStats, skillOf, expNeeded, maxMana, firstHp, levelHp, titleOf, buySpent, BUY_POINTS, randomName, powerFor, POWERS })", { Math, console });

let failed = 0;
const check = (name, ok, detail) => { console.log((ok ? "ok    " : "FAIL  ") + name + (detail ? "  (" + detail + ")" : "")); if (!ok) failed++; };
const { MW, MH, T } = G;

{ // every cell you can walk on is reachable, on levels of every depth
  let bad = 0, worst = "";
  for (let k = 0; k < 200; k++){
    const L = G.generateLevel(new G.RNG(1000 + k), 1 + (k % 30)), seen = G.reachable(L);
    let missing = 0; for (let i = 0; i < L.tiles.length; i++) if ((G.passable(L.tiles[i]) || L.tiles[i] === T.DOOR) && !seen[i]) missing++;
    const downs = L.tiles.filter(t => t === T.DOWN).length;
    if (missing || !downs || L.rooms.length < 10){ bad++; worst = `seed ${1000 + k}: ${missing} cut off, ${downs} stairs down, ${L.rooms.length} rooms`; }
  }
  check("200 levels: every floor cell reachable, stairs down, at least 10 rooms", bad === 0, bad ? worst : "");
}

{ // field of view is symmetric: if A sees B, B sees A
  let pairs = 0, broken = 0;
  for (let k = 0; k < 15; k++){
    const rng = new G.RNG(50 + k), L = G.generateLevel(rng, 3), blocks = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || G.opaque(L.tiles[y * MW + x]);
    const floors = []; for (let i = 0; i < L.tiles.length; i++) if (G.passable(L.tiles[i])) floors.push(i);
    for (let n = 0; n < 40; n++){
      const a = rng.pick(floors), ax = a % MW, ay = Math.floor(a / MW), seenA = new Set();
      G.fov(ax, ay, 12, blocks, (x, y) => seenA.add(y * MW + x), MW, MH);
      for (const b of seenA){
        if (!G.passable(L.tiles[b]) || b === a) continue;
        let back = false; G.fov(b % MW, Math.floor(b / MW), 12, blocks, (x, y) => { if (y * MW + x === a) back = true; }, MW, MH);
        pairs++; if (!back) broken++;
      }
    }
  }
  check("field of view is symmetric between floor cells", broken === 0 && pairs > 1000, `${pairs} pairs, ${broken} one-way`);
}

{ // light stops at walls: a lamp in a closed room does not light the cell behind its wall
  const w = 15, h = 9, wall = (x, y) => x < 0 || y < 0 || x >= w || y >= h || x === 7;   // a wall down the middle
  const f = new Float32Array(3 * w * h);
  G.addLight(f, w, h, wall, { x: 4, y: 4, r: 6, i: 1, rgb: [1, 1, 1] });
  const at = (x, y) => G.lum(f, 3 * (y * w + x));
  check("light reaches the wall it faces but not the cell behind it", at(5, 4) > 0.3 && at(7, 4) > 0 && at(8, 4) === 0 && at(9, 4) === 0,
    `near ${at(5, 4).toFixed(2)} wall ${at(7, 4).toFixed(2)} behind ${at(8, 4)}`);
  check("light fades with distance", at(4, 4) > at(5, 4) && at(5, 4) > at(6, 4));
}

{ // the scheduler: speed +10 acts twice as often as speed 0, and -10 half as often
  const A = [{ speed: 0, energy: 0, n: 0 }, { speed: 10, energy: 0, n: 0 }, { speed: -10, energy: 0, n: 0 }];
  for (let k = 0; k < 7000; k++){ const a = G.nextActor(A); a.energy -= 100; a.n++; }
  const r1 = A[1].n / A[0].n, r2 = A[2].n / A[0].n;
  check("speed +10 acts twice as often, -10 half as often", Math.abs(r1 - 2) < 0.03 && Math.abs(r2 - 0.5) < 0.02, `${r1.toFixed(3)}, ${r2.toFixed(3)}`);
}

{ // the data tables are complete
  const dice = s => /^\d+d\d+$/.test(s);
  const badM = G.MONSTERS.filter(m => !m.id || !m.name || m.glyph.length !== 1 || !(m.depth >= 1) || !dice(m.hp) || !m.blows.length || !m.blows.every(b => dice(b[0])) || !m.desc);
  const badI = G.ITEMS.filter(k => !k.id || !k.name || !G.CAT[k.cat] || k.glyph.length !== 1 || !(k.depth >= 1) || !(k.wt > 0) || !(k.cost >= 0)
    || (k.cat === "weapon" && !dice(k.dice)) || ((k.cat === "wand" || k.cat === "staff") && !dice(k.charges)) || (k.dice && !dice(k.dice)));
  check("every monster and item is complete", !badM.length && !badI.length, [...badM, ...badI].map(x => x.id).join(", "));
  const ids = [...G.MONSTERS, ...G.ITEMS].map(x => x.id);
  check("ids are unique", new Set(ids).size === ids.length);
}

{ // the same seed makes the same level
  const a = G.generateLevel(new G.RNG(7), 5), b = G.generateLevel(new G.RNG(7), 5);
  check("a seed always makes the same level", a.tiles.every((t, i) => t === b.tiles[i]));
}

{ // races and classes: every combination makes a sound character at level 1 and at level 40
  const rng = new G.RNG(3), bad = [];
  for (const R of G.RACES) for (const C of G.CLASSES){
    for (const lvl of [1, 40]){
      const p = { race: R.id, cls: C.id, lvl }; p.stats = G.finalStats(G.rollStats(rng), R, C);
      const sk = G.SKILLS.map(k => G.skillOf(p, k));
      if (sk.some(v => !Number.isFinite(v)) || G.firstHp(p) < 4 || (C.realm && G.maxMana(p) < 1) || (!C.realm && G.maxMana(p) !== 0) || !G.titleOf(p)) bad.push(R.id + "/" + C.id + "@" + lvl);
      if (G.STATS.some(k => p.stats[k] < 3 || p.stats[k] > 25)) bad.push(R.id + "/" + C.id + " stats");
    }
  }
  check("all 48 race and class pairs give valid skills, hit points, mana and titles", !bad.length, bad.slice(0, 5).join(", "));
  const p = { race: "human", cls: "sellsword", lvl: 1, stats: G.finalStats({ str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 }, G.RACE.human, G.CLASS.sellsword) };
  let rising = true; for (let l = 2; l <= 40; l++) if (G.expNeeded(p, l) <= G.expNeeded(p, l - 1)) rising = false;
  check("experience needed rises with every level", rising);
  const slow = { ...p, race: "cragborn", cls: "oathknight" };
  check("a race and class penalty means more experience per level", G.expNeeded(slow, 10) > G.expNeeded(p, 10));
  check("every class has 10 titles", G.CLASSES.every(C => C.titles.length === 10));
  const sw = G.skillOf({ ...p, cls: "sellsword" }, "fight"), ar = G.skillOf({ ...p, cls: "arcanist", stats: p.stats }, "fight");
  check("a Sellsword fights better than an Arcanist", sw > ar + 20, `${sw} vs ${ar}`);
  check("casters have a power, the others do not", G.CLASSES.every(C => !!G.powerFor(C) === !!C.realm && (!C.realm || G.POWERS[G.powerFor(C)])));
}

{ // stat generation: rolls stay in range; the point budget is respected by the costs
  const rng = new G.RNG(9); let ok = true;
  for (let k = 0; k < 2000; k++){ const s = G.rollStats(rng); if (G.STATS.some(x => s[x] < 3 || s[x] > 18)) ok = false; }
  check("rolled stats are 3 to 18", ok);
  const all8 = Object.fromEntries(G.STATS.map(k => [k, 8])), max = Object.fromEntries(G.STATS.map(k => [k, 16]));
  check("point buy: all 8s cost nothing, all 16s are over budget", G.buySpent(all8) === 0 && G.buySpent(max) > G.BUY_POINTS);
  const names = new Set(); for (let k = 0; k < 50; k++) names.add(G.randomName(rng));
  check("random names vary", names.size > 30, names.size + " of 50");
}

{ // items: every kind of effect exists in the game, names are complete at every depth, flavours are distinct
  const game = fs.readFileSync(path.join(__dirname, "..", "src", "torch", "game.js"), "utf8");
  const missing = G.ITEMS.filter(K => K.effect && !new RegExp("\\b" + K.effect + ": ").test(game)).map(K => K.id + ":" + K.effect);
  check("every item effect has a handler in game.js", !missing.length, missing.join(", "));
  const rng = new G.RNG(11);
  let bad = [], cursed = 0, egos = 0, arts = 0, total = 0;
  for (const depth of [1, 5, 10, 20, 35, 50]){
    const know = G.newKnowledge(rng);
    for (let k = 0; k < 10000; k++){
      const it = G.rollItem(depth, rng, know), K = G.ITEM[it.k]; total++;
      if (!K || !(it.n >= 1) || K.depth > depth) { bad.push(JSON.stringify(it)); continue; }
      for (const id of [false, true]){ const name = G.itemName({ ...it, id }, know); if (!name || /undefined|NaN/.test(name)) bad.push(name + " " + JSON.stringify(it)); }
      const P = G.itemPowers(it); if (![P.ac, P.hit, P.dam, P.speed].every(Number.isFinite)) bad.push("powers " + JSON.stringify(it));
      if (it.cursed) cursed++; if (it.ego) egos++; if (it.art) arts++;
    }
  }
  check("60,000 items across six depths: all valid, with names and numbers", !bad.length, bad.length ? bad.slice(0, 3).join(" | ") : `${cursed} cursed, ${egos} special, ${arts} artifacts`);
  check("each artifact is made at most once per game", arts <= G.ARTIFACTS.length * 6);
  const know = G.newKnowledge(new G.RNG(5)), cats = ["potion", "wand", "staff", "rod", "ring", "amulet", "mushroom", "scroll"];
  const clash = cats.filter(c => { const f = G.ITEMS.filter(K => K.cat === c).map(K => know.flav[K.id][0]); return new Set(f).size !== f.length; });
  check("no two kinds in a category share a flavour", !clash.length, clash.join(", "));
  // what you know survives being written out and read back (as a save game will do)
  know.known.pspeed = true; know.tried.sident = true;
  const back = JSON.parse(JSON.stringify(know)), samples = ["pspeed", "sident", "wfire", "rstr"].map(k => ({ k, n: 2 }));
  check("knowledge and names survive a JSON round trip", samples.every(it => G.itemName(it, know) === G.itemName(it, back)), samples.map(it => G.itemName(it, back)).join("; "));
  check("an unknown potion shows its colour, a known one its name", !/Speed/.test(G.itemName({ k: "pfire", n: 1 }, know)) && /Speed/.test(G.itemName({ k: "pspeed", n: 1 }, know)));
  const sword = { k: "longsword", n: 1, tohit: 3, todam: 4, ego: "burning" };
  check("weapon numbers and specials show only once identified", !/\+3|Burning/.test(G.itemName(sword, know)) && /\(\+3,\+4\)/.test(G.itemName({ ...sword, id: true }, know)) && /Burning/.test(G.itemName({ ...sword, id: true }, know)));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
