(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a fixed character grid; the city is an engine terrain grid of the same cells, so each character
// cell of a building is one solid terrain cell. The thrown fruit and the rubble are engine bodies on top.
const GW = 100, GH = 56, WIN_SCORE = 3;
const APE = {   // 6 x 3 sprites
  idle:   [" (..) ", "/|##|\\", " d  b "],
  throwL: ["\\(..) ", " |##|\\", " d  b "],
  throwR: [" (..)/", "/|##| ", " d  b "],
  cheer:  ["\\(^^)/", " |##| ", " d  b "]
};
const AW = 6, AH = 3;
const PLAYER_RGB = [[1.5, 0.85, 0.4], [0.5, 1.0, 1.5]];
const MOON = { calm: [" .---. ", "/ o o \\", "\\ \\_/ /", " '---' "], shock: [" .---. ", "/ O O \\", "\\  o  /", " '---' "] };
const MOON_X = (GW - 7) >> 1, MOON_Y = 3;
const BUILDING_RGB = [[0.30, 0.34, 0.55], [0.55, 0.30, 0.30], [0.28, 0.46, 0.46]];
const WINDOW_RGB = [1.6, 1.2, 0.55], FRUIT_RGB = [1.8, 1.6, 0.3], FLASH = [1.8, 0.9, 0.4], WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6];
const BRICK = { name: "brick", density: 1.2, e: 0.2, mu: 0.8, kd: 0.9, ks: 0.15, shine: 8 };
const DEBRIS = { name: "debris", density: 0.5, e: 0.5, mu: 0.5, kd: 0.9, ks: 0.6, shine: 24 };
const FONT = {   // 5x5 block letters for the title, drawn two cells wide per dot
  R: ["####.", "#...#", "####.", "#..#.", "#...#"], O: [".###.", "#...#", "#...#", "#...#", ".###."],
  F: ["#####", "#....", "####.", "#....", "#...."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  P: ["####.", "#...#", "####.", "#....", "#...."], U: ["#...#", "#...#", "#...#", "#...#", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], B: ["####.", "#...#", "####.", "#...#", "####."],
  L: ["#....", "#....", "#....", "#....", "#####"], E: ["#####", "#....", "####.", "#....", "#####"]
};

const D = defaultDisplay(); D.room = 0.25; D.glow = 0.25; D.lampRGB = [0.55, 0.65, 0.95];   // the moon is the lamp: cool light
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
const world = new World(); world.openTop = true;   // high throws arc above the screen and come back down
const moonLight = { x: 0, y: 0, z: 0, on: true };
let screen = null, stars = [], mode = "cpu", state = "title", stateT = 0;
let city = null, apes = [], turn = 0, score = [0, 0], wind = 0, fruit = null, trail = [], lastTrail = [[], []];
let blasts = [], moonShock = 0, roundStarter = 0, msg = "", msgT = 0, cpu = null, plan = null;
// Power comes from holding the throw button: the meter runs 0 -> 100 -> 0 while held, and letting go throws.
const CHARGE_SECS = 1.1;   // time for the meter to fill once
let charge = null, lastPower = [null, null], arc = null;   // charge: seconds held, or null when not charging; arc: the cached prediction
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCpu = i => mode === "cpu" && i === 1;
const name = i => isCpu(i) ? "COMPUTER" : "PLAYER " + (i + 1);
const vmax = () => Math.sqrt(1.4 * world.w * world.g.y);   // full power at 45 degrees carries about 1.4 screens on flat ground

/* ---------- saved settings and sound (src/arcade.js) ---------- */
const store = prefs("rooftopRumble.v1.", "Rooftop Rumble");
// the effects shared with Base Commander (SFX_DATA, from audio/), at their own volumes here
const VOL = { shoot: 0.45, bomb: 0.35, explode: 0.7, death: 1, hit: 0.5, level_start: 0.6, wave_clear: 0.8, game_over: 0.9 };
const audio = createAudio({ label: "Rooftop Rumble", store, sounds: SFX_DATA, vol: VOL });
const sfx = name => audio.play(name);

function layout(){
  const old = screen; screen = fitGrid(stage, cv, ctx, D, GW, GH) || old; if (screen === old) return;
  const W = GW * screen.cw, H = GH * screen.ch;
  world.w = W; world.h = H; world.unit = screen.cw; world.drag = 2e-4 * (600 / H) ** 2;
  world.g = { x: wind * H * 0.012, y: H * 0.9 };
  if (world.terrain){ world.terrain.cw = screen.cw; world.terrain.ch = screen.ch; }
  moonLight.x = cx(MOON_X + 3); moonLight.y = cy(MOON_Y + 1); moonLight.z = screen.ch * 30;
  rescaleBodies(world, old, screen);
  if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const p of [...trail, ...lastTrail[0], ...lastTrail[1]]){ p.x *= kx; p.y *= ky; } }
  stars = Array.from({ length: 90 }, () => ({ x: 1 + Math.floor(Math.random() * (GW - 2)), y: 1 + Math.floor(Math.random() * 24), ph: Math.random() * 6.283 }));
}

/* ---------- the city ---------- */
// Buildings of random width and height following one skyline shape. Cell kinds: 1 wall, 2 lit window, 3 dark window.
function makeCity(){
  const solid = new Uint8Array(GW * GH), kind = new Uint8Array(GW * GH), tint = new Uint8Array(GW * GH), buildings = [];
  const shape = ["rise", "fall", "valley", "valley", "valley", "peak"][Math.floor(Math.random() * 6)];
  let h = shape === "fall" || shape === "valley" ? 30 : 12, x = 1;
  while (x < GW - 7){
    const half = x < GW / 2;
    h += shape === "rise" ? 2 : shape === "fall" ? -2 : shape === "valley" ? (half ? -3 : 3) : (half ? 3 : -3);
    const bw = Math.min(GW - 1 - x, 6 + Math.floor(Math.random() * 7));
    const bh = clamp(h + Math.floor(Math.random() * 10), 6, GH - 18), top = GH - bh, tn = Math.floor(Math.random() * 3);
    for (let c = x; c < x + bw; c++) for (let r = top; r < GH; r++){
      const i = r * GW + c, win = (c - x) % 2 === 1 && c < x + bw - 1 && (GH - r) % 2 === 0 && r > top && r < GH - 1;
      solid[i] = 1; tint[i] = tn; kind[i] = win ? (Math.random() < 0.75 ? 2 : 3) : 1;
    }
    buildings.push({ x, w: bw, top });
    x += bw + 1;
  }
  return { solid, kind, tint, buildings };
}
function newMatch(){ score = [0, 0]; roundStarter = 0; newRound(); }
function newRound(){
  world.bodies.length = 0; world.forces.length = 0; blasts = []; fruit = null; trail = []; lastTrail = [[], []]; moonShock = 0;
  city = makeCity();
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: city.solid, mat: BRICK };
  wind = Math.round((Math.random() * 10 - 5) * (Math.random() < 0.33 ? 2 : 1));   // usually gentle, sometimes strong
  world.g = { x: wind * world.h * 0.012, y: world.h * 0.9 };   // wind is sideways gravity
  const B = city.buildings, pick = (a, b) => B[a + Math.floor(Math.random() * (b - a + 1))];
  apes = [pick(1, 2), pick(B.length - 3, B.length - 2)].map(b => ({ x: b.x + ((b.w - AW) >> 1), y: b.top - AH, angle: 45, power: 50, pose: "idle", poseT: 0, dead: false, fallT: 0 }));
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
  if (!probe){ const b = world.add(0, 0, screen.ch * 0.35, "steel"); probe = { r: b.r, im: b.im }; world.bodies.splice(world.bodies.indexOf(b), 1); }
  const A = apes[i], dir = i === 0 ? 1 : -1, ang = angle * Math.PI / 180, v = power / 100 * vmax(), h = 1 / 60 / world.substeps;
  let x = cx(A.x + (dir > 0 ? AW - 1 : 0)), y = cy(A.y) - screen.ch, vx = Math.cos(ang) * v * dir, vy = -Math.sin(ang) * v;
  const path = [];
  for (let n = 0; n < 60 * 12 * world.substeps; n++){
    const sp = Math.hypot(vx, vy), k = world.drag * probe.r * sp * probe.im;
    vx += (world.g.x - vx * k) * h; vy += (world.g.y - vy * k) * h;
    const s2 = Math.hypot(vx, vy); if (s2 > 4000){ vx *= 4000 / s2; vy *= 4000 / s2; }
    x += vx * h; y += vy * h;
    if (n % world.substeps === 0) path.push({ x, y });
    const gx = Math.floor(x / screen.cw), gy = Math.floor(y / screen.ch), age = n * h;
    if (x <= probe.r + 1 || x >= world.w - probe.r - 1) return { path, x, y, ape: -1 };
    for (let j = 0; j < 2; j++) if (!apes[j].dead && (j !== i || age > 0.25) && inSprite(APE[apes[j].pose], apes[j].x, apes[j].y, gx, gy)) return { path, x, y, ape: j };
    if (gy >= GH - 1 || (gy >= 0 && gx >= 0 && gx < GW && city.solid[gy * GW + gx])) return { path, x, y, ape: -1 };
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
  const tx = cx(foe.x + 3), ty = cy(foe.y + 1);
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
  const hx = cx(A.x + (dir > 0 ? AW - 1 : 0)), hy = cy(A.y) - screen.ch;   // from the raised hand
  fruit = world.add(hx, hy, screen.ch * 0.35, "steel");
  fruit.sensor = true;   // flies through everything; checkFruit() decides what it hit
  fruit.vx = Math.cos(ang) * v * dir; fruit.vy = -Math.sin(ang) * v; fruit.w = 14 * dir; fruit.thrower = i; fruit.age = 0;
  A.pose = dir > 0 ? "throwR" : "throwL"; A.poseT = 0.35;
  trail = []; state = "flight"; stateT = 0; sfx("shoot");
}
function inSprite(art, x, y, gx, gy){ const dx = gx - x, dy = gy - y; return dy >= 0 && dy < art.length && dx >= 0 && dx < art[0].length && art[dy][dx] !== " "; }
// Runs after every physics substep, so a fast throw can't skip through a thin wall between frames.
function checkFruit(){
  const b = fruit; if (!b || state !== "flight") return;
  const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch);
  if (b.x <= b.r + 1 || b.x >= world.w - b.r - 1) return endShot();   // off the side: a miss
  for (let i = 0; i < 2; i++) if (!apes[i].dead && (i !== b.thrower || b.age > 0.25) && inSprite(APE[apes[i].pose], apes[i].x, apes[i].y, gx, gy)) return apeHit(i, b.thrower);
  if (gy >= GH - 1 || (gy >= 0 && gx >= 0 && gx < GW && city.solid[gy * GW + gx])){ explode(b.x, b.y, 2.0); return endShot(); }
  if (inSprite(MOON.calm, MOON_X, MOON_Y, gx, gy)){ if (moonShock <= 0) sfx("hit"); moonShock = 1.5; }   // the moon flinches; the throw carries on
}
function removeFruit(){ if (fruit){ world.bodies.splice(world.bodies.indexOf(fruit), 1); fruit = null; } }
function endShot(){
  const i = turn;
  lastTrail[i] = trail; removeFruit();
  state = "settle"; stateT = 0;
}

/* ---------- blasts ---------- */
// Clears the terrain cells in the blast, turns some into tumbling rubble boxes, and shoves loose debris away.
function explode(x, y, rRows){
  const R = rRows * screen.ch;
  blasts.push({ x, y, t: 0.45 }); sfx("explode");
  const c0 = Math.max(0, Math.floor((x - R) / screen.cw)), c1 = Math.min(GW - 1, Math.floor((x + R) / screen.cw));
  const r0 = Math.max(0, Math.floor((y - R) / screen.ch)), r1 = Math.min(GH - 1, Math.floor((y + R) / screen.ch));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
    const i = r * GW + c, dx = cx(c) - x, dy = cy(r) - y, d = Math.hypot(dx, dy);
    if (d > R || !city.solid[i]) continue;
    if (Math.random() < 0.55){
      const rgb = city.kind[i] === 2 ? WINDOW_RGB.map(v => v * 0.5) : BUILDING_RGB[city.tint[i]];
      const b = world.addBox(cx(c), cy(r), screen.cw * 0.45, screen.ch * 0.38, "brick", rgb, BRICK), sp = 150 + Math.random() * 350;
      b.vx = dx / (d || 1) * sp; b.vy = dy / (d || 1) * sp - 150; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 4 + Math.random() * 2;
    }
    city.solid[i] = 0; city.kind[i] = 0;
  }
  world.forces.push({ x, y, radius: R * 2.2, strength: world.h * 60, t: 0.08 });
}
function apeHit(i, thrower){
  const A = apes[i], ax = cx(A.x + 3), ay = cy(A.y + 1);
  removeFruit();
  explode(ax, ay, 1.4);
  for (let k = 0; k < 16; k++){
    const a = Math.random() * 6.283, sp = 150 + Math.random() * 400, b = world.add(ax, ay, screen.cw * (0.5 + Math.random() * 0.3), "debris", PLAYER_RGB[i].map(v => v * 0.6), DEBRIS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 200; b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = b.r;
  }
  A.dead = true; sfx("death");
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
    let held = A.y + AH >= GH;
    for (let c = A.x; c < A.x + AW && !held; c++) if (city.solid[(A.y + AH) * GW + c]) held = true;
    if (!held && (A.fallT -= dt) <= 0){ A.y++; A.fallT = 0.05; }
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

/* ---------- drawing ---------- */
const { put, text, center, sprite } = pen(() => screen);   // drawing on the character grid (src/arcade.js)
function blastLight(gx, gy){   // warm light from recent blasts, falling off with distance
  let v = 0;
  for (const B of blasts){ const d = Math.hypot(cx(gx) - B.x, (cy(gy) - B.y) * 0.8) / (screen.ch * 12); if (d < 1) v += (B.t / 0.45) * (1 - d) * 1.4; }
  return v;
}
function drawCity(t){
  const { solid, kind, tint } = city;
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++){
    const i = r * GW + c; if (!solid[i]) continue;
    const base = BUILDING_RGB[tint[i]], roof = r === 0 || !solid[i - GW], f = blasts.length ? blastLight(c, r) : 0;
    let rgb, k, glyph;
    if (kind[i] === 2){ rgb = WINDOW_RGB; k = 0.85 + 0.15 * Math.sin(t * 0.003 + i); glyph = 35; }   // lit window
    else if (kind[i] === 3){ rgb = base; k = 0.25; glyph = 46; }                                       // dark window
    else { rgb = base; k = roof ? 0.9 : 0.5; glyph = roof ? 61 : 58; }                                 // wall; moonlit roof edge
    if (state === "title") k *= 0.45;   // keep the skyline behind the title quiet
    put(c, r, [rgb[0] * k + FLASH[0] * f * 0.4, rgb[1] * k + FLASH[1] * f * 0.4, rgb[2] * k + FLASH[2] * f * 0.4], 1, 1, glyph);
  }
  for (const B of blasts){   // the flash also lights the night air around it
    const gx = Math.floor(B.x / screen.cw), gy = Math.floor(B.y / screen.ch), v = B.t / 0.45;
    for (let r = gy - 6; r <= gy + 6; r++) for (let c = gx - 12; c <= gx + 12; c++){
      const d = Math.hypot((c - gx) / 12, (r - gy) / 6); if (d >= 1 || c < 0 || r < 0 || c >= GW || r >= GH) continue;
      const a = v * (1 - d) * 0.25; screen.add(r * GW + c, FLASH[0] * a, FLASH[1] * a, FLASH[2] * a);
    }
  }
}
function drawTitle(){
  for (let r = 25; r <= 32; r++) for (let c = 8; c < GW - 8; c++) put(c, r, WHITE, 1, 3, 32);   // a dark panel behind the menu
  [["ROOFTOP", 12], ["RUMBLE", 19]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((GW - word.length * 12 + 2) / 2);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#")
      for (const k of [0, 1]) put(x0 + li * 12 + dx * 2 + k, y0 + dy, wi ? PLAYER_RGB[1] : PLAYER_RGB[0], 1.3, 3, 35); }));
  });
  const blink = (performance.now() / 500 | 0) % 2;
  if (pad.touch){
    center(27, "A  ONE PLAYER (VS COMPUTER)     B  TWO PLAYERS", blink ? WHITE : DIM);
    center(29, "D-PAD UP/DOWN ANGLE.  HOLD A OR B FOR POWER, LET GO TO THROW", DIM);
  } else {
    center(27, "1  ONE PLAYER (VS COMPUTER)     2  TWO PLAYERS", blink ? WHITE : DIM);
    center(29, "UP/DOWN ANGLE   HOLD SPACE FOR POWER, LET GO TO THROW   ESC MENU", DIM);
  }
  center(31, "FIRST TO " + WIN_SCORE + " HITS WINS. MIND THE WIND.   DIFFICULTY: " + level.toUpperCase() + " (MENU)", DIM);
}
function draw(t){
  screen.clear();
  for (const s of stars){ const v = 0.06 + 0.05 * Math.sin(t * 0.0015 + s.ph); put(s.x, s.y, [v, v, v * 1.3], 1, 0, 46); }
  sprite(moonShock > 0 ? MOON.shock : MOON.calm, MOON_X, MOON_Y, [1.5, 1.5, 1.2], 1, 2);
  if (city) drawCity(t);
  for (const b of world.bodies) if (!b.sensor) screen.sphere(b, moonLight, { stripe: false });
  if (state === "title"){ drawTitle(); drawMenu(); screen.render(ctx); return; }
  apes.forEach((A, i) => { if (!A.dead) sprite(APE[A.pose], A.x, A.y, PLAYER_RGB[i], i === turn && state !== "hit" ? 1.15 : 0.8, 3); });
  if (state === "aim" || state === "cpu"){
    const A = apes[turn], dir = turn === 0 ? 1 : -1, ang = A.angle * Math.PI / 180;
    for (const p of lastTrail[turn]) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), PLAYER_RGB[turn], 0.18, 0, 46);   // your last throw, faintly
    const hx = A.x + (dir > 0 ? AW - 1 : 0) + 0.5, hy = A.y - 0.5, n = 2 + Math.round(A.power / 14);
    for (let k = 1; k <= n; k++) put(Math.floor(hx + Math.cos(ang) * dir * k * 1.6), Math.floor(hy - Math.sin(ang) * k * 0.8), PLAYER_RGB[turn], k === n ? 1.3 : 0.6, 3, k === n ? 43 : 46);
    // the predicted arc, as dots: all of it on Easy, its start on Normal (only for people, not the computer)
    const share = ARC_SHARE[level];
    if (share && state === "aim"){
      const key = turn + "," + Math.round(A.angle) + "," + Math.round(A.power) + "," + wind;
      if (!arc || arc.key !== key) arc = { key, ...predict(turn, Math.round(A.angle), Math.round(A.power)) };
      const pts = arc.path, m = Math.ceil(pts.length * share);
      for (let k = 6; k < m; k += 3){ const p = pts[k], gy = Math.floor(p.y / screen.ch); if (gy >= 1) put(Math.floor(p.x / screen.cw), gy, PLAYER_RGB[turn], 0.5 * (1 - k / (m + 6)) + 0.25, 3, 46); }
      if (share === 1 && arc.ape === 1 - turn){ const p = pts[pts.length - 1]; put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), WHITE, 1.4, 3, 88); }   // it would hit: an X marks it
    }
  }
  for (const p of trail) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), FRUIT_RGB, 0.25, 0, 46);
  if (fruit){
    const gx = Math.floor(fruit.x / screen.cw), gy = Math.floor(fruit.y / screen.ch);
    if (gy >= 1) put(gx, gy, FRUIT_RGB, 1, 3, "(^)v".charCodeAt(((fruit.a % 6.283 + 6.283) % 6.283) / 1.571 | 0));
    else put(gx, 1, FRUIT_RGB, 0.8, 3, 94);   // above the screen: show where it will come down
  }
  // HUD: each player's angle, power and score on their side; wind in the middle
  for (let i = 0; i < 2; i++){
    const A = apes[i], s = `${name(i)}  ${score[i]}   ANGLE ${String(Math.round(A.angle)).padStart(2)}  POWER ${String(Math.round(A.power)).padStart(3)}`;
    text(i === 0 ? 1 : GW - 1 - s.length, 0, s, i === turn ? PLAYER_RGB[i] : DIM);
  }
  if (state === "aim" || state === "cpu"){   // power meter, with a | where your last throw was
    const A = apes[turn], W = 30, fill = Math.round(A.power / 100 * W), lp = lastPower[turn];
    const x0 = Math.floor((GW - W - 16) / 2);
    text(x0, 2, "POWER ", PLAYER_RGB[turn]);
    for (let k = 0; k < W; k++){
      const mark = lp !== null && k === Math.min(W - 1, Math.round(lp / 100 * W));
      put(x0 + 6 + k, 2, mark ? WHITE : PLAYER_RGB[turn], k < fill ? 1.2 : mark ? 0.9 : 0.25, 3, mark ? 124 : k < fill ? 35 : 46);
    }
    text(x0 + 7 + W, 2, String(Math.round(A.power)).padStart(3), PLAYER_RGB[turn]);
    if (state === "aim" && charge === null && msgT <= 0) center(3, pad.touch ? "HOLD A OR B FOR POWER, LET GO TO THROW" : "HOLD SPACE FOR POWER, LET GO TO THROW", DIM);
  }
  const arrows = wind === 0 ? "CALM" : (wind < 0 ? "<".repeat(Math.min(5, Math.ceil(-wind / 2))) + " " + -wind : wind + " " + ">".repeat(Math.min(5, Math.ceil(wind / 2))));
  center(1, "WIND " + arrows, WHITE);
  if (state === "over"){
    const w = score[0] > score[1] ? 0 : 1;
    center(8, `  ${name(w)} WINS ${score[w]}-${score[1 - w]}  `, PLAYER_RGB[w]);
    center(10, pad.touch ? "  PRESS START FOR A NEW MATCH  " : "  PRESS SPACE FOR A NEW MATCH  ", WHITE);
  } else if (msgT > 0) center(8, "  " + msg + "  ", WHITE);
  const hint = pad.touch ? " SELECT MENU " : " ESC MENU ";
  text(GW - 1 - hint.length, GH - 1, hint, DIM);
  drawMenu();
  screen.render(ctx);
}
function drawMenu(){
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(screen, { accent: FRUIT_RGB, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "MODE APPLIES TO THE NEXT MATCH" });
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
// The pause menu (src/menu.js) holds what the old button row did. Open it with Esc or P, SELECT, or a mouse click.
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: "NEW MATCH", select: () => { menu.hide(); audio.unlock(); start(nextMode); } },
  { label: "MODE", value: () => nextMode === "cpu" ? "VS COMPUTER" : "TWO PLAYERS", change: () => { nextMode = nextMode === "cpu" ? "two" : "cpu"; } },
  { label: "DIFFICULTY", value: () => level.toUpperCase(), change: d => { level = LEVELS[(LEVELS.indexOf(level) + (d || 1) + 3) % 3]; store.set("difficulty", level); arc = null; } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "CONTROLS", value: () => pad.touch ? "TOUCH" : "KEYBOARD", change: () => pad.toggle() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { charge = null; for (const k in keys) keys[k] = false; audio.pause(); },   // opening cancels a charge
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
addEventListener("blur", () => { for (const k in keys) keys[k] = false; charge = null; });   // leaving the window cancels a charge

const pad = createPad({ store, menu: () => menu.open && menu, onAny: () => audio.unlock(),
  onDir: d => { for (const k in keys) keys[k] = k === d; },
  onPress: id => {
    if (id === "select") return menu.show();
    if (state === "title" && (id === "a" || id === "b")) return start(id === "a" ? "cpu" : "two");
    if (id === "start") return state === "title" || state === "over" ? action() : menu.show();
    press();
  },
  onRelease: id => { if (id === "a" || id === "b") release(); } });
cv.addEventListener("pointerdown", e => {
  audio.unlock();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!pad.touch) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
world.onSub = checkFruit;
function tick(dt, t){
  if (screen && !menu.open){   // the open menu pauses everything
    if (state !== "title" && state !== "over") update(dt);
    for (const B of blasts) B.t -= dt;
    blasts = blasts.filter(B => B.t > 0);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){ b.life -= dt; if (b.life < 1 && b.r0) b.r = b.r0 * Math.max(0.3, b.life); }
    world.bodies = world.bodies.filter(b => !(b.life <= 0));
  }
  if (screen) draw(t);
}
layout();
city = makeCity();   // a skyline behind the title screen
world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: city.solid, mat: BRICK };
onResize(stage, layout);
startLoop(tick);
})();
