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
const MW = 7, MH = 4, MOON_X = (GW - 7) >> 1, MOON_Y = 3;
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
const world = new World(); world.openTop = true;   // high throws arc above the screen and come back down
const moonLight = { x: 0, y: 0, z: 0, on: true };
let screen = null, stars = [], mode = "cpu", state = "title", stateT = 0, t0 = 0;
let city = null, apes = [], turn = 0, score = [0, 0], wind = 0, fruit = null, trail = [], lastTrail = [[], []];
let blasts = [], moonShock = 0, roundStarter = 0, msg = "", msgT = 0, cpu = null, plan = null;
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCpu = i => mode === "cpu" && i === 1;
const name = i => isCpu(i) ? "COMPUTER" : "PLAYER " + (i + 1);
const vmax = () => Math.sqrt(1.4 * world.w * world.g.y);   // full power at 45 degrees carries about 1.4 screens on flat ground

function layout(){
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  const old = screen, dpr = Math.min(window.devicePixelRatio || 1, 3);
  for (let f = Math.max(5, Math.ceil(Math.min(r.width / GW / 0.5, r.height / GH / 1.15))); ; f--){
    screen = new Screen(f, D); screen.fit(r.width, r.height, dpr);
    if ((screen.cols >= GW && screen.rows >= GH) || f <= 5) break;   // below 5px the text is unreadable: scale the canvas instead
  }
  const W = GW * screen.cw, H = GH * screen.ch;
  screen.fit(W, H, dpr);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  const k = Math.min(1, r.width / W, r.height / H);
  cv.style.transform = "translate(-50%,-50%)" + (k < 1 ? " scale(" + k + ")" : "");
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.w = W; world.h = H; world.unit = screen.cw; world.drag = 2e-4 * (600 / H) ** 2;
  world.g = { x: wind * H * 0.012, y: H * 0.9 };
  if (world.terrain){ world.terrain.cw = screen.cw; world.terrain.ch = screen.ch; }
  moonLight.x = cx(MOON_X + 3); moonLight.y = cy(MOON_Y + 1); moonLight.z = screen.ch * 30;
  if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const b of world.bodies){ b.x *= kx; b.y *= ky; b.r *= kx; if (b.box){ b.hw *= kx; b.hh *= kx; } }
    for (const p of [...trail, ...lastTrail[0], ...lastTrail[1]]){ p.x *= kx; p.y *= ky; } }
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
  startTurn();
}
function startTurn(){
  trail = []; stateT = 0;
  state = isCpu(turn) ? "cpu" : "aim";
  if (state === "cpu") plan = planShot(turn);
  say(name(turn) + "'S TURN", 1.2);
}
function say(text, secs){ msg = text; msgT = secs; }

/* ---------- computer opponent: a ballistic first guess, then corrects power from where the last shot landed ---------- */
function planShot(i){
  const me = apes[i], foe = apes[1 - i], dist = Math.abs(cx(foe.x) - cx(me.x));
  if (!cpu){
    const angle = 40 + Math.random() * 25, th = angle * Math.PI / 180, v = Math.sqrt(dist * world.g.y / Math.sin(2 * th));
    cpu = { angle, power: clamp(v / vmax() * 100 * (0.85 + Math.random() * 0.3), 10, 100), err: null };
  } else if (cpu.err !== null){
    cpu.power = clamp(cpu.power * (1 - clamp(cpu.err, -0.6, 0.6) * 0.5) + (Math.random() - 0.5) * 4, 5, 100);
  }
  return { angle: Math.round(cpu.angle), power: Math.round(cpu.power) };
}

/* ---------- throwing ---------- */
function throwFruit(i){
  const A = apes[i], dir = i === 0 ? 1 : -1, ang = A.angle * Math.PI / 180, v = A.power / 100 * vmax();
  const hx = cx(A.x + (dir > 0 ? AW - 1 : 0)), hy = cy(A.y) - screen.ch;   // from the raised hand
  fruit = world.add(hx, hy, screen.ch * 0.35, "steel");
  fruit.sensor = true;   // flies through everything; checkFruit() decides what it hit
  fruit.vx = Math.cos(ang) * v * dir; fruit.vy = -Math.sin(ang) * v; fruit.w = 14 * dir; fruit.thrower = i; fruit.age = 0;
  A.pose = dir > 0 ? "throwR" : "throwL"; A.poseT = 0.35;
  trail = []; state = "flight"; stateT = 0;
}
function inSprite(art, x, y, gx, gy){ const dx = gx - x, dy = gy - y; return dy >= 0 && dy < art.length && dx >= 0 && dx < art[0].length && art[dy][dx] !== " "; }
// Runs after every physics substep, so a fast throw can't skip through a thin wall between frames.
function checkFruit(){
  const b = fruit; if (!b || state !== "flight") return;
  const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch);
  if (b.x <= b.r + 1 || b.x >= world.w - b.r - 1) return endShot(b.x);   // off the side: a miss
  for (let i = 0; i < 2; i++) if (!apes[i].dead && (i !== b.thrower || b.age > 0.25) && inSprite(APE[apes[i].pose], apes[i].x, apes[i].y, gx, gy)) return apeHit(i, b.thrower);
  if (gy >= GH - 1 || (gy >= 0 && gx >= 0 && gx < GW && city.solid[gy * GW + gx])){ explode(b.x, b.y, 2.0); return endShot(b.x); }
  if (inSprite(MOON.calm, MOON_X, MOON_Y, gx, gy)) moonShock = 1.5;   // the moon flinches; the throw carries on
}
function removeFruit(){ if (fruit){ world.bodies.splice(world.bodies.indexOf(fruit), 1); fruit = null; } }
function endShot(landX){
  const i = turn, me = apes[i], foe = apes[1 - i];
  if (isCpu(i) && cpu){   // how far past (or short of) the target it went, as a share of the distance
    const dist = Math.abs(cx(foe.x) - cx(me.x)), went = (i === 0 ? landX - cx(me.x) : cx(me.x) - landX);
    cpu.err = (went - dist) / dist;
    if (landX <= fruit.r + 1 || landX >= world.w - fruit.r - 1) cpu.err = Math.max(cpu.err, 0.4);   // off the screen edge: it went further than the edge shows
  }
  lastTrail[i] = trail; removeFruit();
  state = "settle"; stateT = 0;
}

/* ---------- blasts ---------- */
// Clears the terrain cells in the blast, turns some into tumbling rubble boxes, and shoves loose debris away.
function explode(x, y, rRows){
  const R = rRows * screen.ch;
  blasts.push({ x, y, t: 0.45 });
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
  A.dead = true;
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
    A.power = clamp(A.power + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * 35 * dt, 1, 100);
  } else if (state === "cpu"){   // sweep the aim towards the plan, so the player sees it think
    const A = apes[turn], k = Math.min(1, dt * 3);
    A.angle += (plan.angle - A.angle) * k; A.power += (plan.power - A.power) * k;
    if (stateT > 1.3){ A.angle = plan.angle; A.power = plan.power; throwFruit(turn); }
  } else if (state === "flight"){
    fruit.age += dt; trail.push({ x: fruit.x, y: fruit.y }); if (trail.length > 400) trail.shift();
    if (stateT > 12) endShot(fruit.x);   // safety net: a throw that never lands
  } else if (state === "settle" && stateT > 0.7){ turn ^= 1; startTurn(); }
  else if (state === "hit"){
    const w = apes.findIndex(A => !A.dead); if (w >= 0){ apes[w].pose = (stateT * 3.5 | 0) % 2 ? "cheer" : "idle"; }
    if (stateT > 2.4){ if (Math.max(...score) >= WIN_SCORE){ state = "over"; stateT = 0; } else newRound(); }
  }
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, 3, s.charCodeAt(i)); }
const center = (gy, s, rgb) => text(Math.floor((GW - s.length) / 2), gy, s, rgb);
function sprite(art, x, y, rgb, k, layer){ art.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== " ") put(x + dx, y + dy, rgb, k, layer, row.charCodeAt(dx)); }); }
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
  if (touchMode){
    center(27, "A  ONE PLAYER (VS COMPUTER)     B  TWO PLAYERS", blink ? WHITE : DIM);
    center(29, "D-PAD: UP/DOWN ANGLE, LEFT/RIGHT POWER.  A OR B THROWS", DIM);
  } else {
    center(27, "1  ONE PLAYER (VS COMPUTER)     2  TWO PLAYERS", blink ? WHITE : DIM);
    center(29, "UP/DOWN ANGLE   LEFT/RIGHT POWER   SPACE THROWS   R NEW MATCH", DIM);
  }
  center(31, "FIRST TO " + WIN_SCORE + " HITS WINS. MIND THE WIND.", DIM);
}
function draw(t){
  screen.clear();
  for (const s of stars){ const v = 0.06 + 0.05 * Math.sin(t * 0.0015 + s.ph); put(s.x, s.y, [v, v, v * 1.3], 1, 0, 46); }
  sprite(moonShock > 0 ? MOON.shock : MOON.calm, MOON_X, MOON_Y, [1.5, 1.5, 1.2], 1, 2);
  if (city) drawCity(t);
  for (const b of world.bodies) if (!b.sensor) screen.sphere(b, moonLight, { stripe: false });
  if (state === "title"){ drawTitle(); screen.render(ctx); return; }
  apes.forEach((A, i) => { if (!A.dead) sprite(APE[A.pose], A.x, A.y, PLAYER_RGB[i], i === turn && state !== "hit" ? 1.15 : 0.8, 3); });
  if (state === "aim" || state === "cpu"){
    const A = apes[turn], dir = turn === 0 ? 1 : -1, ang = A.angle * Math.PI / 180;
    for (const p of lastTrail[turn]) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), PLAYER_RGB[turn], 0.18, 0, 46);   // your last throw, faintly
    const hx = A.x + (dir > 0 ? AW - 1 : 0) + 0.5, hy = A.y - 0.5, n = 2 + Math.round(A.power / 14);
    for (let k = 1; k <= n; k++) put(Math.floor(hx + Math.cos(ang) * dir * k * 1.6), Math.floor(hy - Math.sin(ang) * k * 0.8), PLAYER_RGB[turn], k === n ? 1.3 : 0.6, 3, k === n ? 43 : 46);
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
  const arrows = wind === 0 ? "CALM" : (wind < 0 ? "<".repeat(Math.min(5, Math.ceil(-wind / 2))) + " " + -wind : wind + " " + ">".repeat(Math.min(5, Math.ceil(wind / 2))));
  center(1, "WIND " + arrows, WHITE);
  if (state === "over"){
    const w = score[0] > score[1] ? 0 : 1;
    center(8, `  ${name(w)} WINS ${score[w]}-${score[1 - w]}  `, PLAYER_RGB[w]);
    center(10, touchMode ? "  PRESS START FOR A NEW MATCH  " : "  PRESS SPACE FOR A NEW MATCH  ", WHITE);
  } else if (msgT > 0) center(8, "  " + msg + "  ", WHITE);
  screen.render(ctx);
}

/* ---------- input ---------- */
const keys = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowUp: "up", w: "up", W: "up", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
function start(m){ mode = m; $("bMode").textContent = "Mode: " + (m === "cpu" ? "vs computer" : "two players"); newMatch(); }
function action(){   // Space, A, B: throw when it's your turn; start or continue otherwise
  if (state === "title") start("cpu");
  else if (state === "over") state = "title";
  else if (state === "aim") throwFruit(turn);
}
addEventListener("keydown", e => {
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.key === " ") e.preventDefault();
  if (e.repeat) return;
  if (state === "title" && (e.key === "1" || e.key === "2")) return start(e.key === "1" ? "cpu" : "two");
  if (e.key === " " || e.key === "Enter") action();
  if (e.key === "r" || e.key === "R") start(mode);
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

const CTRL_KEY = "rooftopRumble.v1.controls";
let touchMode = matchMedia("(pointer: coarse)").matches;   // default follows the device; the Controls button overrides it
try { const c = localStorage.getItem(CTRL_KEY); if (c) touchMode = c === "touch"; } catch (e){}
function setControls(touch, save){
  touchMode = touch; document.body.classList.toggle("touch", touch); $("gamepad").hidden = !touch;
  $("bControls").textContent = "Controls: " + (touch ? "touch" : "keyboard");
  if (save) try { localStorage.setItem(CTRL_KEY, touch ? "touch" : "keyboard"); } catch (e){ console.warn("Rooftop Rumble: could not save controls setting", e); }
}
setControls(touchMode, false);
$("bControls").addEventListener("click", () => setControls(!touchMode, true));
$("bNew").addEventListener("click", () => start(mode));
$("bMode").addEventListener("click", () => start(mode === "cpu" ? "two" : "cpu"));
const buzz = () => navigator.vibrate && navigator.vibrate(8);
// The D-pad is one surface; the thumb's offset from the centre picks the direction, so sliding switches it.
const dpad = $("dpad");
function dpadAt(e){
  const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const dir = Math.hypot(dx, dy) < r.width * 0.1 ? "" : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
  if (dir !== (dpad.dataset.dir || "")){ dpad.dataset.dir = dir; if (dir) buzz(); }
  for (const k in keys) keys[k] = k === dir;
}
dpad.addEventListener("pointerdown", e => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); dpadAt(e); });
dpad.addEventListener("pointermove", e => { if (dpad.hasPointerCapture(e.pointerId)) dpadAt(e); });
for (const ev of ["pointerup", "pointercancel"]) dpad.addEventListener(ev, () => { dpad.dataset.dir = ""; for (const k in keys) keys[k] = false; });
document.querySelectorAll("[data-pad]").forEach(b => {
  const id = b.dataset.pad;
  b.addEventListener("pointerdown", e => {
    e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); buzz();
    if (id === "select"){ if (state === "title") mode = mode === "cpu" ? "two" : "cpu"; return; }
    if (state === "title" && (id === "a" || id === "b")) return start(id === "a" ? "cpu" : "two");
    action();
  });
  const up = () => b.classList.remove("on");
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
});
cv.addEventListener("pointerdown", () => { if (state === "title" || state === "over") action(); });

/* ---------- loop ---------- */
world.onSub = checkFruit;
let last = performance.now(), nextFrame = 0;
const FRAME_MS = 1000 / 60;
function tick(t){
  requestAnimationFrame(tick);
  if (t < nextFrame - 1) return;   // run at most ~60 times a second, even on faster displays
  nextFrame = t - nextFrame > FRAME_MS ? t + FRAME_MS : nextFrame + FRAME_MS;
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
  if (screen){
    if (state !== "title" && state !== "over") update(dt);
    for (const B of blasts) B.t -= dt;
    blasts = blasts.filter(B => B.t > 0);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){ b.life -= dt; if (b.life < 1 && b.r0) b.r = b.r0 * Math.max(0.3, b.life); }
    world.bodies = world.bodies.filter(b => !(b.life <= 0));
    draw(t);
  }
}
layout();
city = makeCity();   // a skyline behind the title screen
world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: city.solid, mat: BRICK };
let fitted = stage.getBoundingClientRect();
new ResizeObserver(() => {   // re-fit only for real size changes, not the mobile address bar sliding in and out
  const r = stage.getBoundingClientRect();
  if (Math.abs(r.width - fitted.width) < 1 && Math.abs(r.height - fitted.height) < fitted.height * 0.15) return;
  fitted = r; if (screen) layout();
}).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
