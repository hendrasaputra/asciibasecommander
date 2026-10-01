// Box physics checks for src/core.js. Run: node tests/boxes.js
// Loads the engine without a browser (the physics needs no DOM) and checks that boxes settle sensibly.
const fs = require("fs"), vm = require("vm"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "core.js"), "utf8");
const { World, boxBox } = vm.runInNewContext(src + "\n;({ World, boxBox })", { Math, console });

let failed = 0;
const check = (name, ok, detail) => { console.log((ok ? "ok    " : "FAIL  ") + name + (detail ? "  (" + detail + ")" : "")); if (!ok) failed++; };
function world(){ const w = new World(); w.w = 600; w.h = 400; w.unit = 10; w.g = { x: 0, y: 640 }; return w; }
function run(w, secs){ for (let i = 0; i < secs * 60; i++) w.step(1 / 60); }
const quarterTurnOff = a => { const q = Math.PI / 2, m = ((a % q) + q) % q; return Math.min(m, q - m); };   // radians from the nearest flat pose
const lowestCorner = b => b.y + Math.abs(Math.sin(b.a)) * b.hw + Math.abs(Math.cos(b.a)) * b.hh;

{ const w = world(), b = w.addBox(300, 100, 30, 15, "rubber"); b.a = 0; run(w, 4);
  check("flat box comes to rest on the floor", Math.abs(b.y - 385) < 1.5 && Math.hypot(b.vx, b.vy) < 2 && quarterTurnOff(b.a) < 0.02,
    `y=${b.y.toFixed(1)} v=${Math.hypot(b.vx, b.vy).toFixed(2)} tilt=${quarterTurnOff(b.a).toFixed(3)}`); }

{ const w = world(), b = w.addBox(300, 80, 30, 15, "rubber"); b.a = 0.5; run(w, 5);
  check("tilted box tips onto a face", quarterTurnOff(b.a) < 0.03 && Math.abs(lowestCorner(b) - 400) < 1.5,
    `tilt=${quarterTurnOff(b.a).toFixed(3)} bottom=${lowestCorner(b).toFixed(1)}`); }

{ const w = world(), S = [0, 1, 2].map(i => { const b = w.addBox(300, 390 - i * 20, 20, 10, "rubber"); b.a = 0; return b; }); run(w, 5);
  check("stack of three boxes stays stacked", S.every(b => Math.abs(b.x - 300) < 3) && S[0].y > S[1].y && S[1].y > S[2].y && Math.abs(S[2].y - 350) < 2,
    S.map(b => `(${b.x.toFixed(1)},${b.y.toFixed(1)})`).join(" ")); }

{ const w = world(), box = w.addBox(300, 390, 60, 10, "rubber"), ball = w.add(300, 200, 12, "steel"); box.a = 0; run(w, 4);
  check("ball comes to rest on top of a box", Math.abs(ball.y - (380 - 12)) < 2 && Math.abs(ball.x - box.x) < 60,
    `ball y=${ball.y.toFixed(1)} expected ${380 - 12}`); }

{ const w = world();
  for (let i = 0; i < 40; i++){ const x = 40 + (i * 53) % 520, y = 30 + Math.floor(i / 10) * 45;
    if (i % 3) w.addBox(x, y, 8 + (i % 5) * 3, 6 + (i % 4) * 2, "rubber"); else w.add(x, y, 9, "steel"); }
  run(w, 8);
  const B = w.bodies, boxes = B.filter(b => b.box);
  let worst = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++){ const c = boxBox(boxes[i], boxes[j]); if (c) worst = Math.max(worst, c.depth); }
  const finite = B.every(b => [b.x, b.y, b.vx, b.vy, b.a, b.w].every(Number.isFinite));
  const inside = boxes.every(b => lowestCorner(b) < 401 && b.x > 0 && b.x < 600);
  const avgSpeed = B.reduce((t, b) => t + Math.hypot(b.vx, b.vy), 0) / B.length;
  check("pile of 40 boxes and balls settles without blowing up", finite && inside && worst < 3 && avgSpeed < 20,
    `deepest box overlap ${worst.toFixed(2)} px, average speed ${avgSpeed.toFixed(2)}`); }

process.exitCode = failed ? 1 : 0;
