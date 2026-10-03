// Checks for Torchlight Dungeons' rules. Run: node tests/torch.js
// Loads the game's logic files without a browser: random numbers, sight and light, turns, levels and data.
const fs = require("fs"), vm = require("vm"), path = require("path");
const files = ["rng.js", "fov.js", "turn.js", "gen.js", "data.js"].map(f => fs.readFileSync(path.join(__dirname, "..", "src", "torch", f), "utf8"));
const G = vm.runInNewContext(files.join("\n") + "\n;({ RNG, fov, addLight, lum, nextActor, generateLevel, reachable, T, MW, MH, passable, opaque, MONSTERS, ITEMS })", { Math, console });

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
  const badI = G.ITEMS.filter(k => !k.id || !k.name || k.glyph.length !== 1 || !(k.depth >= 1) || (k.slot === "weapon" && !dice(k.dice)) || (k.use === "quaff" && !dice(k.heal)));
  check("every monster and item is complete", !badM.length && !badI.length, [...badM, ...badI].map(x => x.id).join(", "));
  const ids = [...G.MONSTERS, ...G.ITEMS].map(x => x.id);
  check("ids are unique", new Set(ids).size === ids.length);
}

{ // the same seed makes the same level
  const a = G.generateLevel(new G.RNG(7), 5), b = G.generateLevel(new G.RNG(7), 5);
  check("a seed always makes the same level", a.tiles.every((t, i) => t === b.tiles[i]));
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
