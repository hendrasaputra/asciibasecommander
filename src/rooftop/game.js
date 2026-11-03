(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// The city is an engine terrain grid of small square cells, one pixel each, so blasts punch round holes in it. The apes
// stand on it and drop when their roof goes. The thrown fruit and the rubble are engine bodies on top. Everything is
// drawn as pixel art (src/pixel.js) on a 200 x 224 picture, small enough to scale by whole pixels on a phone, with
// the text in the pixel font at its native size.
const WIN_SCORE = 3;
const NX = 200, NY = 224, CELL = 4, PU = 4;  // city cells; world units per cell and per pixel
const COL = 8, ROW = 16;                     // world units the sizes of things are measured in (once a text column and row)
const PLAYER_RGB = [[1.5, 0.85, 0.4], [0.5, 1.0, 1.5]];                  // for text
const PLAYER_PIX = [[230, 140, 70], [90, 190, 240]];                     // the title, the arrow, the aim
const FUR = [[150, 92, 52], [70, 104, 150]], CHEST = [[214, 170, 120], [160, 186, 214]];
const MOON = { x: 100, y: 31, r: 8 };                                    // in pixels
const TINT = [[72, 82, 124], [128, 70, 66], [62, 108, 106]];             // the buildings' walls
const FLASH = [1.8, 0.9, 0.4], WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], FRUIT = [1.8, 1.6, 0.3];
const BRICK = { name: "brick", density: 1.2, e: 0.2, mu: 0.8, kd: 0.9, ks: 0.15, shine: 8 };
const DEBRIS = { name: "debris", density: 0.5, e: 0.5, mu: 0.5, kd: 0.9, ks: 0.6, shine: 24 };
const FONT = {   // 5x5 block letters for the title, each dot a 4 x 4 block
  R: ["####.", "#...#", "####.", "#..#.", "#...#"], O: [".###.", "#...#", "#...#", "#...#", ".###."],
  F: ["#####", "#....", "####.", "#....", "#...."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  P: ["####.", "#...#", "####.", "#....", "#...."], U: ["#...#", "#...#", "#...#", "#...#", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], B: ["####.", "#...#", "####.", "#...#", "####."],
  L: ["#....", "#....", "#....", "#....", "#####"], E: ["#####", "#....", "####.", "#....", "#####"]
};

applyArcadeSettings(defaultDisplay());   // the tube TV filter from the shared Settings page
const world = new World(); world.openTop = true;   // high throws arc above the screen and come back down
world.w = NX * CELL; world.h = NY * CELL; world.unit = COL; world.drag = 2e-4 * (600 / world.h) ** 2;
const pix = createPixels(NX * CELL / PU, NY * CELL / PU, (NX * CELL / PU) / PIXEL_FONT.w, Math.floor(NY * CELL / PU / PIXEL_FONT.h), PU);
pix.font = PIXEL_FONT;
const TGW = pix.cols, TGH = pix.rows;   // the text grid: 50 x 32
let ready = false, mode = "cpu", state = "title", stateT = 0;
let city = null, apes = [], turn = 0, score = [0, 0], wind = 0, fruit = null, trail = [], lastTrail = [[], []];
let blasts = [], moonShock = 0, roundStarter = 0, msg = "", msgT = 0, cpu = null, plan = null;
// Power comes from holding the throw button: the meter runs 0 -> 100 -> 0 while held, and letting go throws.
const CHARGE_SECS = 1.1;   // time for the meter to fill once
let charge = null, lastPower = [null, null], arc = null;   // charge: seconds held, or null when not charging; arc: the cached prediction
const cx = c => (c + 0.5) * CELL, cy = r => (r + 0.5) * CELL;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCpu = i => mode === "cpu" && i === 1;
const name = i => isCpu(i) ? "COMPUTER" : "PLAYER " + (i + 1);
const vmax = () => Math.sqrt(1.4 * world.w * world.g.y);   // full power at 45 degrees carries about 1.4 screens on flat ground
const setWind = () => { world.g = { x: wind * world.h * 0.012, y: world.h * 0.9 }; };   // wind is sideways gravity
setWind();

/* ---------- saved settings and sound (src/arcade.js) ---------- */
const store = prefs("rooftopRumble.v1.", "Rooftop Rumble");
// the effects shared with Base Commander (SFX_DATA, from audio/), at their own volumes here
const VOL = { shoot: 0.45, bomb: 0.35, explode: 0.7, death: 1, hit: 0.5, level_start: 0.6, wave_clear: 0.8, game_over: 0.9 };
const audio = createAudio({ label: "Rooftop Rumble", store, sounds: SFX_DATA, vol: VOL });
const sfx = name => audio.play(name);
const feel = createFeel(), vfx = createFx();

function layout(){ if (pix.fit(stage, cv, ctx)) ready = true; }

/* ---------- the city ---------- */
// Buildings of random width and height following one skyline shape, laid out in blocks of two cells across and four
// down (LW x LH of them), as before. bld: which building a cell belongs to (1 up); burnt: scorched by a blast nearby.
// dirty: it changed, so its picture is drawn again.
function makeCity(){
  const solid = new Uint8Array(NX * NY), bld = new Uint8Array(NX * NY), burnt = new Uint8Array(NX * NY), buildings = [];
  const shape = ["rise", "fall", "valley", "valley", "valley", "peak"][Math.floor(Math.random() * 6)];
  const LW = NX / 2, LH = NY / 4;
  let h = shape === "fall" || shape === "valley" ? 30 : 12, x = 1;
  while (x < LW - 7){
    const half = x < LW / 2;
    h += shape === "rise" ? 2 : shape === "fall" ? -2 : shape === "valley" ? (half ? -3 : 3) : (half ? 3 : -3);
    const bw = Math.min(LW - 1 - x, 6 + Math.floor(Math.random() * 7)), bh = clamp(h + Math.floor(Math.random() * 10), 6, LH - 18);
    const B = { x: x * 2, w: bw * 2, top: (LH - bh) * 4, tint: Math.floor(Math.random() * 3), seed: Math.random() * 1000, deco: Math.floor(Math.random() * 4) };
    buildings.push(B);
    for (let c = B.x; c < B.x + B.w; c++) for (let r = B.top; r < NY; r++){ solid[r * NX + c] = 1; bld[r * NX + c] = buildings.length; }
    x += bw + 1;
  }
  return { solid, bld, burnt, buildings, seed: Math.random() * 1000, dirty: true };
}
function newMatch(){ score = [0, 0]; roundStarter = 0; newRound(); }
function newRound(){
  world.bodies.length = 0; world.forces.length = 0; blasts = []; fruit = null; trail = []; lastTrail = [[], []]; moonShock = 0;
  city = makeCity();
  world.terrain = { cw: CELL, ch: CELL, cols: NX, rows: NY, solid: city.solid, mat: BRICK };
  wind = Math.round((Math.random() * 10 - 5) * (Math.random() < 0.33 ? 2 : 1));   // usually gentle, sometimes strong
  setWind();
  const B = city.buildings, pick = (a, b) => B[a + Math.floor(Math.random() * (b - a + 1))];
  // an ape: x, the cell column at its middle; y, the row its feet stand on
  apes = [pick(1, 2), pick(B.length - 3, B.length - 2)].map(b => ({ x: b.x + (b.w >> 1), y: b.top, angle: 45, power: 50, pose: "idle", poseT: 0, dead: false, fallT: 0 }));
  cpu = null;
  turn = roundStarter; roundStarter ^= 1;
  sfx("level_start");
  startTurn();
}
function startTurn(){
  trail = []; stateT = 0; charge = null;
  state = isCpu(turn) ? "cpu" : "aim";
  if (state === "cpu") plan = planShot(turn);
  say(name(turn) + "'S TURN", 1.2);
}
function say(text, secs){ msg = text; msgT = secs; }
// What a thrown fruit at (x, y), in world units, has hit: the ground or a building, an ape (j), or the moon.
function solidAt(x, y){ const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL); return gy >= NY - 1 || (gy >= 0 && gx >= 0 && gx < NX && city.solid[gy * NX + gx] === 1); }
function onApe(j, x, y){ const A = apes[j], dx = x - A.x * CELL, dy = y - A.y * CELL; return !A.dead && Math.abs(dx) <= 18 && dy <= 0 && dy >= -54; }   // in world units
const hand = (A, dir) => [A.x * CELL + dir * 20, A.y * CELL - 56];   // the raised hand the fruit leaves from

/* ---------- difficulty ---------- */
// Easy shows the whole predicted arc and the computer aims loosely; Normal shows the start of the arc; Hard shows
// only the aim pointer, and the computer reads the wind and judges its throws well.
const LEVELS = ["easy", "normal", "hard"];
let level = LEVELS.includes(store.get("difficulty")) ? store.get("difficulty") : "normal";
const ARC_SHARE = { easy: 1, normal: 0.2, hard: 0 };   // how much of the predicted arc is drawn
// The computer's error on its first throw of a round, how much of it is left after each throw, and the least it
// keeps. Measured over many rounds (computer alone), a hit takes about 7 throws on Easy, 4 on Normal and 3 on Hard.
const CPU = { easy: { noise: 0.5, decay: 0.9, floor: 0.14 }, normal: { noise: 0.3, decay: 0.8, floor: 0.06 }, hard: { noise: 0.2, decay: 0.65, floor: 0.03 } };

/* ---------- predicting a throw: the same physics as the engine's step, without touching the world ---------- */
let probe = null;   // the fruit's radius and inverse mass, measured once from a real body
function predict(i, angle, power){
  if (!probe){ const b = world.add(0, 0, ROW * 0.35, "steel"); probe = { r: b.r, im: b.im }; world.bodies.splice(world.bodies.indexOf(b), 1); }
  const A = apes[i], dir = i === 0 ? 1 : -1, ang = angle * Math.PI / 180, v = power / 100 * vmax(), h = 1 / 60 / world.substeps;
  let [x, y] = hand(A, dir), vx = Math.cos(ang) * v * dir, vy = -Math.sin(ang) * v;
  const path = [];
  for (let n = 0; n < 60 * 12 * world.substeps; n++){
    const sp = Math.hypot(vx, vy), k = world.drag * probe.r * sp * probe.im;
    vx += (world.g.x - vx * k) * h; vy += (world.g.y - vy * k) * h;
    const s2 = Math.hypot(vx, vy); if (s2 > 4000){ vx *= 4000 / s2; vy *= 4000 / s2; }
    x += vx * h; y += vy * h;
    if (n % world.substeps === 0) path.push({ x, y });
    const age = n * h;
    if (x <= probe.r + 1 || x >= world.w - probe.r - 1) return { path, x, y, ape: -1 };
    for (let j = 0; j < 2; j++) if ((j !== i || age > 0.25) && onApe(j, x, y)) return { path, x, y, ape: j };
    if (solidAt(x, y)) return { path, x, y, ape: -1 };
  }
  return { path, x, y, ape: -1 };
}

/* ---------- computer opponent: works out the best throw for the city as it is now, then misses by its error ---------- */
// The error shrinks with every throw in a round, faster on Hard: the computer gets its eye in, as people do.
function planShot(i){
  const foe = apes[1 - i], C = CPU[level];
  if (!cpu) cpu = { tries: 0 };
  // Angles every 5 degrees and every power: the throw that comes nearest the middle of the target. A hit counts as
  // much nearer, so a solid hit beats a near miss, and one that only grazes the sprite's edge is the last choice.
  let best = null;
  const tx = foe.x * CELL, ty = foe.y * CELL - 26;
  for (let angle = 15; angle <= 85; angle += 5) for (let power = 5; power <= 100; power++){
    if (cpu.last && cpu.last.angle === angle && cpu.last.power === power) continue;   // never the same throw that just missed
    const r = predict(i, angle, power), miss = r.ape === i ? 1e9 : Math.hypot(r.x - tx, r.y - ty) + (r.ape === 1 - i ? 0 : 1000);
    if (!best || miss < best.miss) best = { angle, power, miss };
  }
  const e = Math.max(C.floor, C.noise * Math.pow(C.decay, cpu.tries++)), wobble = () => Math.random() * 2 - 1;
  cpu.last = { angle: Math.round(clamp(best.angle + wobble() * e * 25, 5, 85)), power: Math.round(clamp(best.power * (1 + wobble() * e), 5, 100)) };
  return cpu.last;
}

/* ---------- throwing ---------- */
function throwFruit(i){
  const A = apes[i], dir = i === 0 ? 1 : -1, ang = A.angle * Math.PI / 180, v = A.power / 100 * vmax();
  const [hx, hy] = hand(A, dir);
  fruit = world.add(hx, hy, ROW * 0.35, "steel");
  fruit.sensor = true;   // flies through everything; checkFruit() decides what it hit
  fruit.vx = Math.cos(ang) * v * dir; fruit.vy = -Math.sin(ang) * v; fruit.w = 14 * dir; fruit.thrower = i; fruit.age = 0;
  A.pose = dir > 0 ? "throwR" : "throwL"; A.poseT = 0.35;
  trail = []; state = "flight"; stateT = 0; sfx("shoot");
}
// Runs after every physics substep, so a fast throw can't skip through a thin wall between frames.
function checkFruit(){
  const b = fruit; if (!b || state !== "flight") return;
  if (b.x <= b.r + 1 || b.x >= world.w - b.r - 1) return endShot();   // off the side: a miss
  for (let i = 0; i < 2; i++) if ((i !== b.thrower || b.age > 0.25) && onApe(i, b.x, b.y)) return apeHit(i, b.thrower);
  if (solidAt(b.x, b.y)){ explode(b.x, b.y, 2.0); return endShot(); }
  if (Math.hypot(b.x / PU - MOON.x, b.y / PU - MOON.y) < MOON.r){ if (moonShock <= 0){ sfx("hit"); vfx.burst(b.x, b.y, { n: 10, speed: ROW * 10, life: 0.4 }); } moonShock = 1.5; }   // the moon flinches; the throw carries on
}
function removeFruit(){ if (fruit){ world.bodies.splice(world.bodies.indexOf(fruit), 1); fruit = null; } }
function endShot(){
  const i = turn;
  lastTrail[i] = trail; removeFruit();
  state = "settle"; stateT = 0;
}

/* ---------- blasts ---------- */
// Clears the city cells in the blast, turns some into tumbling rubble boxes, scorches the walls around the hole, and
// shoves loose debris away.
function explode(x, y, rRows){
  const R = rRows * ROW, S = R * 1.35, { solid, bld, burnt, buildings } = city;
  blasts.push({ x, y, t: 0.45 }); sfx("explode");
  const c0 = Math.max(0, Math.floor((x - S) / CELL)), c1 = Math.min(NX - 1, Math.floor((x + S) / CELL));
  const r0 = Math.max(0, Math.floor((y - S) / CELL)), r1 = Math.min(NY - 1, Math.floor((y + S) / CELL));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
    const i = r * NX + c, dx = cx(c) - x, dy = cy(r) - y, d = Math.hypot(dx, dy);
    if (!solid[i] || d > S) continue;
    if (d > R){ burnt[i] = 1; continue; }
    if (Math.random() < 0.07){
      const tint = buildings[bld[i] - 1].tint, b = world.addBox(cx(c), cy(r), CELL * 0.6, CELL * 0.5, "brick", TINT[tint].map(v => v / 160), BRICK), sp = 150 + Math.random() * 350;
      b.vx = dx / (d || 1) * sp; b.vy = dy / (d || 1) * sp - 150; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 4 + Math.random() * 2; b.tint = tint;
    }
    solid[i] = 0;
  }
  city.dirty = true;
  world.forces.push({ x, y, radius: R * 2.2, strength: world.h * 60, t: 0.08 });
  vfx.explode(x, y, R * 0.6); vfx.debris(x, y, R * 0.5, PAL.spark); feel.shake(4, 0.3); feel.freeze(0.05);
}
function apeHit(i, thrower){
  const A = apes[i], ax = A.x * CELL, ay = A.y * CELL - 26;
  removeFruit();
  explode(ax, ay, 1.4);
  for (let k = 0; k < 16; k++){
    const a = Math.random() * 6.283, sp = 150 + Math.random() * 400, b = world.add(ax, ay, COL * (0.5 + Math.random() * 0.3), "debris", PLAYER_RGB[i].map(v => v * 0.6), DEBRIS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 200; b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = b.r; b.ape = i;
  }
  A.dead = true; sfx("death"); feel.shake(9, 0.5); feel.freeze(0.15); feel.flash(0.45);
  const winner = i === thrower ? 1 - i : thrower;
  score[winner]++;
  say(i === thrower ? "OOPS! " + name(i) + " HIT THEMSELF" : "DIRECT HIT!", 2.4);
  state = "hit"; stateT = 0;
}

/* ---------- update ---------- */
function update(dt){
  stateT += dt; msgT -= dt; moonShock -= dt;
  for (const A of apes){
    if (A.poseT > 0 && (A.poseT -= dt) <= 0) A.pose = "idle";
    if (A.dead) continue;
    // an ape whose rooftop was blasted away drops until it lands on something
    let held = A.y >= NY - 1;
    for (let c = A.x - 4; c < A.x + 4 && !held; c++) if (city.solid[A.y * NX + c]) held = true;
    if (!held && (A.fallT -= dt) <= 0){ A.y++; A.fallT = 0.0125; }
  }
  if (state === "aim"){
    const A = apes[turn];
    A.angle = clamp(A.angle + ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * 40 * dt, 0, 90);
    if (charge !== null){ charge += dt; const c = (charge / CHARGE_SECS) % 2; A.power = clamp(Math.round((c < 1 ? c : 2 - c) * 100), 1, 100); }
  } else if (state === "cpu"){   // sweep the aim towards the plan, so the player sees it think
    const A = apes[turn], k = Math.min(1, dt * 3);
    A.angle += (plan.angle - A.angle) * k; A.power += (plan.power - A.power) * k;
    if (stateT > 1.3){ A.angle = plan.angle; A.power = plan.power; throwFruit(turn); }
  } else if (state === "flight"){
    if (!fruit.falling && fruit.vy > 0){ fruit.falling = true; sfx("bomb"); }   // the whistle starts as it begins to drop
    fruit.age += dt; trail.push({ x: fruit.x, y: fruit.y }); if (trail.length > 400) trail.shift();
    if (stateT > 12) endShot();   // safety net: a throw that never lands
  } else if (state === "settle" && stateT > 0.7){ turn ^= 1; startTurn(); }
  else if (state === "hit"){
    const w = apes.findIndex(A => !A.dead); if (w >= 0){ apes[w].pose = (stateT * 3.5 | 0) % 2 ? "cheer" : "idle"; }
    if (stateT > 2.4){
      if (Math.max(...score) >= WIN_SCORE){ state = "over"; stateT = 0; sfx(isCpu(score[0] > score[1] ? 0 : 1) ? "game_over" : "wave_clear"); }
      else newRound();
    }
  }
}

/* ---------- drawing: pixel art (src/pixel.js) ---------- */
// After Balote: each colour as a ramp of five shades, light from the upper left, dithered gradients, outlines from
// the edge pass. A night sky with a moon, a far skyline, and the city: walls in close tones with rows of windows,
// most of them lit, and rooftop antennas and water tanks. The apes are gorillas built from lit balls. One city cell is
// one pixel.
const SKY = [[8, 10, 26], [12, 16, 38], [18, 22, 52], [26, 30, 66], [40, 42, 84]];
const hash = (x, y) => pixHash(x, y);
const back = { d: new Uint8ClampedArray(pix.W * pix.H * 4), lay: new Int8Array(pix.W * pix.H), key: "" };
// The sky, the far skyline and the city, drawn again only when the city changes (or dims behind the title).
function bakeBack(dim){
  pix.clear();
  const D = c => dim < 1 ? c.map(v => v * dim) : c;
  for (let y = 0; y < pix.H; y++){   // the sky: five bands, dithered into each other, lighter towards the horizon
    const v = Math.min(4, y / (pix.H * 0.8) * 4);
    for (let x = 0; x < pix.W; x++) pix.px(x, y, D(SKY[clamp(Math.floor(v + pix.bayer(x, y) - 0.5), 0, 4)]), -1);
  }
  pix.glow(MOON.x * PU, MOON.y * PU, 22 * PU, [0.1, 0.1, 0.14].map(v => v * dim));   // the moon's halo
  const far = pix.ramp(D([30, 34, 64])), lit = D([150, 120, 70]);
  for (let x = 0, k = 0; x < pix.W; k++){   // the far skyline: dark blocks with a few lit windows
    const w = 5 + Math.floor(hash(k, city.seed) * 11), top = Math.floor(pix.H * (0.5 + hash(k, city.seed + 1) * 0.22));
    for (let i = 0; i < w; i++) for (let y = top; y < pix.H; y++){
      const win = i % 3 === 1 && (y - top) % 4 === 2 && hash(x + i, y) < 0.18;
      pix.px(x + i, y, win ? lit : far[y === top ? 3 : 2], 1);
    }
    x += w + 1 + Math.floor(hash(k, city.seed + 2) * 2);
  }
  const { solid, bld, burnt, buildings } = city;
  for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++){
    const i = r * NX + c; if (!solid[i]) continue;
    const B = buildings[bld[i] - 1], R = pix.ramp(TINT[B.tint]), open = !r || !solid[i - NX], scorch = burnt[i] ? 0.55 : 1;
    // windows two pixels square, in columns every four and rows every five
    const lx = c - B.x, ly = r - B.top, wx = (lx - 2) >> 2, wy = Math.floor((ly - 3) / 5);
    const inWin = lx >= 2 && lx < B.w - 2 && (lx - 2) % 4 < 2 && ly >= 3 && (ly - 3) % 5 < 2;
    let col;
    if (open) col = R[4];                                                 // the moonlit top edge
    else if (inWin){
      const on = hash(wx + B.seed, wy) < 0.7, warm = hash(wx, wy + B.seed) < 0.5 ? [255, 206, 120] : [250, 226, 160];
      col = on ? ((ly - 3) % 5 === 0 ? warm.map(v => v * 0.8) : warm) : [24, 28, 46];   // lit, with a shadow under the lintel; or dark
    } else if (lx === 0) col = R[4]; else if (lx === B.w - 1) col = R[1]; // lit left side, shaded right side
    else {   // Balote's close tones from smooth noise
      const t = [0.9, 0.94, 0.98, 1.02][clamp(Math.floor((0.5 + (pixNoise(c * 0.18, r * 0.1) - 0.5) * 0.8) * 4 + (pix.bayer(c, r) - 0.5) * 0.6), 0, 3)];
      col = R[3].map(v => v * t);
    }
    pix.px(c, r, D(scorch < 1 ? [col[0] * scorch + 12, col[1] * scorch * 0.9, col[2] * scorch * 0.8] : col), 2);
  }
  for (const B of buildings){   // rooftop details, standing only while the roof under them does
    const x = B.x + (B.w >> 1) + (B.deco === 1 ? -3 : 2), y = B.top, M = pix.ramp(D([120, 124, 140]));
    if (!solid[y * NX + x]) continue;
    if (B.deco === 1){ for (let k = 1; k <= 6; k++) pix.px(x, y - k, M[k === 6 ? 4 : 2], 2); pix.px(x - 1, y - 4, M[3], 2); pix.px(x + 1, y - 4, M[1], 2); pix.px(x, y - 7, D([255, 70, 60]), 2); }
    else if (B.deco === 2){   // a water tank on legs
      pix.px(x - 1, y - 1, M[1], 2); pix.px(x + 2, y - 1, M[1], 2);
      const T = pix.ramp(D([132, 96, 72]));
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) pix.px(x - 1 + i, y - 5 + j, T[j === 0 ? 4 : i === 0 ? 3 : i === 3 ? 1 : 2], 2);
      pix.px(x, y - 6, T[3], 2); pix.px(x + 1, y - 6, T[3], 2);
    } else if (B.deco === 3) pix.rect(x - 2, y - 2, 4, 2, M[2], 2);   // a vent box
  }
  back.d.set(pix.d); back.lay.set(pix.lay);
}
function drawMoon(t){
  const { x, y, r } = MOON, M = pix.ramp([236, 228, 184]), ink = [70, 62, 52];
  pix.ball(x, y, r, [236, 228, 184], 1);
  for (const [dx, dy] of [[-4, 2], [3, 4], [4, -3]]){ pix.px(x + dx, y + dy, M[1], 1); pix.px(x + dx + 1, y + dy, M[2], 1); }   // craters
  if (moonShock > 0){   // wide eyes and an O of a mouth
    for (const ex of [-3, 2]){ pix.rect(x + ex, y - 3, 2, 2, ink, 1); pix.px(x + ex, y - 3, [255, 255, 255], 1); }
    pix.px(x, y + 1, ink, 1); pix.px(x - 1, y + 2, ink, 1); pix.px(x + 1, y + 2, ink, 1); pix.px(x, y + 3, ink, 1);
  } else {
    const blink = (t / 160 | 0) % 25 === 0;
    for (const ex of [-3, 2]) blink ? pix.rect(x + ex, y - 2, 2, 1, ink, 1) : pix.rect(x + ex, y - 3, 1, 2, ink, 1);
    for (const [i, j] of [[-2, 1], [-1, 2], [0, 2], [1, 2], [2, 1]]) pix.px(x + i, y + j, ink, 1);   // a smile
  }
}
// A gorilla built from lit balls: legs, a round body with a pale chest, arms by pose, a head with a pale muzzle.
// (x, y): the middle of its feet, in pixels.
function drawApe(A, i){
  const x = A.x, y = A.y, F = pix.ramp(FUR[i]), fur = FUR[i], chest = CHEST[i];
  const limb = (x0, y0, x1, y1) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let k = 0; k <= n; k++) pix.px(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), F[2], 3); };
  pix.rect(x - 3, y - 3, 2, 3, F[2], 3); pix.rect(x + 1, y - 3, 2, 3, F[1], 3);   // legs
  pix.rect(x - 4, y - 1, 3, 1, F[1], 3); pix.rect(x + 1, y - 1, 3, 1, F[0], 3);   // feet
  pix.ball(x, y - 6, 3.6, fur);
  pix.ball(x, y - 5.5, 2, chest, 3, true);
  const up = A.pose === "cheer" ? [1, 1] : A.pose === "throwR" ? [0, 1] : A.pose === "throwL" ? [1, 0] : [0, 0];   // [left, right] arm raised
  [-1, 1].forEach((s, k) => {
    const sx = x + s * 3, sy = y - 8, hx = up[k] ? x + s * 4 : x + s * 5, hy = up[k] ? y - 14 : y - 2;
    limb(sx, sy, hx, hy); pix.px(hx, hy, chest.map(v => v * 0.8), 3);
  });
  pix.ball(x, y - 10.5, 2.8, fur);
  pix.rect(x - 1, y - 10, 3, 2, chest, 3);                                   // the muzzle
  pix.rect(x - 2, y - 12, 5, 1, F[0], 3);                                    // the brow
  pix.px(x - 1, y - 11, [24, 18, 20], 3); pix.px(x + 1, y - 11, [24, 18, 20], 3);
  pix.px(x, y - 9, F[0], 3);                                                 // the mouth
}
// A small bobbing arrow over the ape whose turn it is, in its colour with a dark outline.
const ARROW = ["ooooo", ".oXo.", "..o.."];
function drawArrow(A, k, t){
  const x0 = A.x - 2, y0 = A.y - 20 - (t / 300 | 0) % 2;
  ARROW.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") pix.px(x0 + i, y0 + j, ch === "X" ? pix.ramp(PLAYER_PIX[k])[4] : [24, 22, 30], 3); }));
}
// The fruit: a banana, turning as it flies, in drawn frames: lying flat and on the diagonal, each turned in quarter
// turns, so eight directions and no pixel art turned at an angle. b: brown tip, y: yellow, Y: its lit side.
const BANANA = [["b...b", ".YyY."], ["...b", "..Yy", ".Yy.", "b..."]];
function drawFruit(b){
  const k = ((Math.round(b.a / (Math.PI / 4)) % 8) + 8) % 8, F = BANANA[k & 1], q = k >> 1, Y = pix.ramp([240, 210, 60]);
  const w = F[0].length, h = F.length, x0 = Math.round(b.x / PU), y0 = Math.round(b.y / PU);
  F.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === ".") return;
    let u = i - (w >> 1), v = j - (h >> 1);
    for (let n = 0; n < q; n++) [u, v] = [-v, u];   // a quarter turn
    pix.px(x0 + u, y0 + v, ch === "b" ? [110, 80, 30] : Y[ch === "Y" ? 4 : 3], 3);
  }));
}
function drawWorld(t){
  drawMoon(t);
  for (const B of blasts) pix.glow(B.x, B.y, ROW * 6, FLASH.map(v => v * B.t * 0.8));
  for (const b of world.bodies){
    if (b.sensor) continue;
    // rubble: a two-pixel brick, lying or standing by its angle in quarter turns
    if (b.box){ const R = pix.ramp(TINT[b.tint ?? 0]), flat = (Math.round(b.a / (Math.PI / 2)) & 1) === 0, x = Math.round(b.x / PU), y = Math.round(b.y / PU); pix.px(x, y, R[3], 3); pix.px(x + (flat ? 1 : 0), y + (flat ? 0 : 1), R[1], 3); }
    else pix.ball(b.x / PU, b.y / PU, Math.max(0.8, b.r / PU), b.ape !== undefined ? FUR[b.ape] : [150, 152, 164], 3, true);
  }
  vfx.draw(pix);
}
// text with a black box behind it (MENU_LAYER), so it reads over the city
const say2 = (row, s, v) => pix.text((TGW - s.length - 2) >> 1, row, " " + s + " ", v, MENU_LAYER);
function drawTitle(){
  pix.rect(8, 94, pix.W - 16, 84, [10, 12, 22], 3);   // a dark panel behind the buttons and text
  [["ROOFTOP", 40], ["RUMBLE", 66]].forEach(([word, y0], wi) => {
    const x0 = (pix.W - word.length * 24 + 4) >> 1, R = pix.ramp(PLAYER_PIX[wi]);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#"){
      const X = x0 + li * 24 + dx * 4, Y = y0 + dy * 4, on = (ddx, ddy) => FONT[ch][dy + ddy] && FONT[ch][dy + ddy][dx + ddx] === "#";
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++){   // each dot a bevelled block, joined to its neighbours
        const lv = (j === 0 && !on(0, -1)) || (i === 0 && !on(-1, 0)) ? 4 : (j === 3 && !on(0, 1)) || (i === 3 && !on(1, 0)) ? 1 : j < 2 ? 3 : 2;
        pix.px(X + i, Y + j, R[lv], 3);
      }
    } }));
  });
  const t = INPUT.touch;
  pix.button(14, (t ? "" : "1  ") + "ONE PLAYER (VS COMPUTER)", WHITE); pix.button(17, (t ? "" : "2  ") + "TWO PLAYERS", WHITE);
  if (t) pix.center(21, "DRAG BACK FROM ANYWHERE AND LET GO TO THROW", DIM);
  else { pix.center(21, "UP/DOWN ANGLE - HOLD SPACE FOR POWER", DIM); pix.center(22, "LET GO TO THROW - ESC MENU", DIM); }
  pix.center(23, "FIRST TO " + WIN_SCORE + " HITS WINS. MIND THE WIND.", DIM);
  pix.center(24, "DIFFICULTY: " + level.toUpperCase() + " (CHANGE IN THE MENU)", DIM);
}
function draw(t){
  const dim = state === "title" ? 0.45 : 1, key = dim + "";
  if (city.dirty || back.key !== key){ city.dirty = false; back.key = key; bakeBack(dim); }
  pix.clear(); pix.d.set(back.d); pix.lay.set(back.lay);
  for (let k = 0; k < 40; k++){   // twinkling stars
    const x = Math.floor(hash(k, 11) * pix.W), y = Math.floor(hash(k, 12) * pix.H * 0.45), v = (60 + 120 * hash(k, 13)) * (0.6 + 0.4 * Math.sin(t * 0.0015 + k)) * dim;
    pix.px(x, y, [v, v, v * 1.15], -1);
  }
  drawWorld(t);
  if (state === "title"){ drawTitle(); return finish(); }
  apes.forEach((A, i) => { if (!A.dead) drawApe(A, i); });
  if (state === "aim" || state === "cpu"){
    const A = apes[turn], dir = turn === 0 ? 1 : -1, a = A.angle * Math.PI / 180, R = pix.ramp(PLAYER_PIX[turn]);
    lastTrail[turn].forEach((p, i) => { if (i % 3 === 0) pix.px(p.x / PU, p.y / PU, R[1], 1); });   // your last throw, faintly
    const [hx, hy] = hand(A, dir).map(v => v / PU), n = 2 + Math.round(A.power / 14);   // an aim guide whose length shows power
    for (let k = 1; k <= n; k++) pix.px(hx + Math.cos(a) * dir * k * 3, hy - Math.sin(a) * k * 3, k === n ? R[4] : R[2], 3);
    const ex = hx + Math.cos(a) * dir * n * 3, ey = hy - Math.sin(a) * n * 3;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pix.px(ex + dx, ey + dy, R[4], 3);
    // the predicted arc, as dots: all of it on Easy, its start on Normal (only for people, not the computer)
    const share = ARC_SHARE[level];
    if (share && state === "aim"){
      const key = turn + "," + Math.round(A.angle) + "," + Math.round(A.power) + "," + wind;
      if (!arc || arc.key !== key) arc = { key, ...predict(turn, Math.round(A.angle), Math.round(A.power)) };
      const pts = arc.path, m = Math.ceil(pts.length * share);
      for (let k = 6; k < m; k += 4){ const p = pts[k]; if (p.y > 0) pix.px(p.x / PU, p.y / PU, R[k / m < 0.6 ? 3 : 2], 3); }
      if (share === 1 && arc.ape === 1 - turn){ const p = pts[pts.length - 1]; for (let d = -1; d <= 1; d++){ pix.px(p.x / PU + d, p.y / PU + d, [255, 255, 255], 3); pix.px(p.x / PU + d, p.y / PU - d, [255, 255, 255], 3); } }   // it would hit: an X marks it
    }
    drawArrow(A, turn, t);
  }
  trail.forEach((p, i) => { if (i % 3 === 0) pix.px(p.x / PU, p.y / PU, [150, 140, 90], 1); });
  if (fruit){
    if (fruit.y >= 0) drawFruit(fruit);
    else for (let k = 0; k < 2; k++) pix.rect(Math.round(fruit.x / PU) - k, 15 + k, 2 * k + 1, 1, [255, 230, 120], 3);   // above the screen: a mark shows where it will come down
  }
  pix.edges();
  // HUD: each player's score, angle and power on their side; wind in the middle
  for (let i = 0; i < 2; i++){
    const A = apes[i], s = `${name(i)}  ${score[i]}`, a = `ANGLE ${String(Math.round(A.angle)).padStart(2)} POWER ${String(Math.round(A.power)).padStart(3)}`, c = i === turn ? PLAYER_RGB[i] : DIM;
    pix.text(i === 0 ? 1 : TGW - 1 - s.length, 0, s, c); pix.text(i === 0 ? 1 : TGW - 1 - a.length, 1, a, c);
  }
  if (state === "aim" || state === "cpu"){   // the power meter, with a mark where your last throw was
    const A = apes[turn], R = pix.ramp(PLAYER_PIX[turn]), w = 60, x0 = (pix.W - w) >> 1, y0 = 16, fill = Math.round(A.power / 100 * w), lp = lastPower[turn];
    pix.rect(x0 - 1, y0 - 1, w + 2, 4, [20, 22, 34], 4);
    for (let x = 0; x < w; x++) for (let y = 0; y < 2; y++) pix.px(x0 + x, y0 + y, x < fill ? R[y ? 3 : 4] : [44, 46, 62], 4);
    if (lp !== null){ const m = x0 + Math.min(w - 1, Math.round(lp / 100 * w)); pix.rect(m, y0 - 2, 1, 6, [240, 240, 240], 4); }
    if (state === "aim" && charge === null && !sling && msgT <= 0) pix.center(3, INPUT.touch ? "DRAG BACK AND LET GO TO THROW" : "HOLD SPACE FOR POWER, LET GO TO THROW", DIM);
  }
  const arrows = wind === 0 ? "CALM" : (wind < 0 ? "<".repeat(Math.min(5, Math.ceil(-wind / 2))) + " " + -wind : wind + " " + ">".repeat(Math.min(5, Math.ceil(wind / 2))));
  pix.center(0, "WIND", WHITE); pix.center(1, arrows, WHITE);
  if (state === "over"){
    const w = score[0] > score[1] ? 0 : 1;
    say2(8, `${name(w)} WINS ${score[w]}-${score[1 - w]}`, PLAYER_RGB[w]);
    say2(10, INPUT.touch ? "TAP FOR A NEW MATCH" : "PRESS SPACE FOR A NEW MATCH", WHITE);
  } else if (msgT > 0) say2(8, msg, WHITE);
  if (!INPUT.touch) pix.text(TGW - 11, TGH - 1, " ESC MENU ", DIM);
  finish();
}
function finish(){
  if (state === "title") pix.edges();
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(pix, { accent: FRUIT, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "MODE APPLIES TO THE NEXT MATCH" });
  pix.present(ctx);
}

/* ---------- input ---------- */
const keys = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down" };
let nextMode = mode;   // the menu's Mode choice; it takes over when a new match starts
function start(m){ mode = nextMode = m; newMatch(); }
function action(){   // start or continue from the title and win screens
  if (state === "title") start("cpu");
  else if (state === "over") state = "title";
}
function press(){ if (state === "aim"){ if (charge === null){ charge = 0; apes[turn].power = 1; } } else action(); }   // Space, A, B down
function release(){   // Space, A, B up: throw with the power on the meter
  if (state !== "aim" || charge === null) return;
  charge = null; lastPower[turn] = apes[turn].power; throwFruit(turn);
}
// The pause menu (src/menu.js). Open it with Esc or P, or the header's Menu button.
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: "NEW MATCH", select: () => { menu.hide(); audio.unlock(); start(nextMode); } },
  { label: "MODE", value: () => nextMode === "cpu" ? "VS COMPUTER" : "TWO PLAYERS", change: () => { nextMode = nextMode === "cpu" ? "two" : "cpu"; } },
  { label: "DIFFICULTY", value: () => level.toUpperCase(), change: d => { level = LEVELS[(LEVELS.indexOf(level) + (d || 1) + 3) % 3]; store.set("difficulty", level); arc = null; } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { charge = sling = null; for (const k in keys) keys[k] = false; audio.pause(); },   // opening cancels a charge
  onClose: () => { audio.resume(); }
});
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.key === " ") e.preventDefault();
  if (e.repeat) return;
  if (e.key === "Escape" || e.key === "p" || e.key === "P"){ audio.unlock(); return menu.show(); }
  if (e.key === "m" || e.key === "M") return audio.toggleMute();
  audio.unlock();
  if (state === "title" && (e.key === "1" || e.key === "2")) return start(e.key === "1" ? "cpu" : "two");
  if (e.key === " " || e.key === "Enter") press();
  if (e.key === "r" || e.key === "R") start(nextMode);
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; if (e.key === " " || e.key === "Enter") release(); });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; charge = sling = null; });   // leaving the window cancels a charge

// Touch and mouse, after Balote: drag back from anywhere and let go to throw. The pull sets the angle (the throw goes
// the opposite way) and its length the power; a short drag is cancelled. Taps choose the title's buttons, go on from
// the end of a match, and pick rows in the menu.
let sling = null;   // the drag that is aiming, while there is one
function aimFrom(p){
  const dir = turn === 0 ? 1 : -1, dx = (p.x0 - p.x) * pix.W * dir, dy = (p.y0 - p.y) * pix.H, A = apes[turn];
  A.angle = clamp(Math.round(Math.atan2(-dy, Math.max(0, dx)) * 180 / Math.PI), 0, 90);
  A.power = clamp(Math.round(Math.hypot(dx, dy) / (pix.W * 0.4) * 100), 1, 100);
}
createTouch(cv, {
  down: p => { audio.unlock(); if (!menu.open && state === "aim" && charge === null) sling = p; },
  move: p => { if (p === sling && p.moved >= 12) aimFrom(p); },
  up: p => {
    if (p === sling){ sling = null; if (p.moved >= 12 && state === "aim"){ aimFrom(p); lastPower[turn] = apes[turn].power; throwFruit(turn); } return; }
    if (!p.tap) return;
    if (menu.open) return menu.tap(...pix.gridAt(p.x, p.y));
    const gy = pix.gridAt(p.x, p.y)[1];
    if (state === "title"){ if (gy >= 14 && gy < 17) start("cpu"); else if (gy >= 17 && gy < 20) start("two"); }
    else if (state === "over") action();
  }
});
headerButtons(menu, audio);

/* ---------- loop ---------- */
world.onSub = checkFruit;
function tick(dt, t){
  if (ready && !menu.open && (dt = feel.step(dt))){   // the open menu pauses everything, and so does a hit-stop
    vfx.update(dt);
    if (state !== "title" && state !== "over") update(dt);
    for (const B of blasts) B.t -= dt;
    blasts = blasts.filter(B => B.t > 0);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){ b.life -= dt; if (b.life < 1 && b.r0) b.r = b.r0 * Math.max(0.3, b.life); }
    world.bodies = world.bodies.filter(b => !(b.life <= 0));
  }
  if (ready){ feel.begin(ctx, cv); draw(t); feel.end(ctx, cv); }
}
layout();
city = makeCity();   // a skyline behind the title screen
world.terrain = { cw: CELL, ch: CELL, cols: NX, rows: NY, solid: city.solid, mat: BRICK };
onResize(stage, layout);
startLoop(tick);
})();
