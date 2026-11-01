(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// A side-scroller after Moon Patrol. Rules run on a grid of world columns and rows: the course scrolls left
// under the rover, one column at a time. The ground is an engine terrain grid rebuilt every frame, so rubble,
// dust and the wreck of the rover bounce and roll on it. Everything is drawn as pixel art (src/pixel.js), four
// pixels to a column and eight to a row, and scrolls smoothly between columns.
const GW = 120, GH = 44, GBASE = GH - 7;          // GBASE: ground row on flat ground
const CW = 8, CH = 16, PU = 2, PX = CW / PU, PY = CH / PU;   // world units per column and row; per pixel; pixels per column and row
const SEC = 160, POST = 40;                        // course columns per checkpoint; post position in a section
const CRUISE = 14, VMIN = 8, VMAX = 24;            // speed in columns per second
const JUMPV = 18, G = 44, BOMB_G = 30;             // rows per second, rows per second squared
// Holding jump makes it longer: while rising with the button held (up to JUMP_HOLD seconds) gravity is only
// HOLD_G of normal. A tap clears small rocks and craters; a full hold clears big rocks and wide craters.
const JUMP_HOLD = 0.45, HOLD_G = 0.25, JUMP_BUFFER = 0.15;   // a press this long before landing still jumps
const WHEELS = [1, 4, 7], RW = 9;                  // wheel columns in the rover sprite; sprite width
const TW = 5;                                      // a ground tank's width in columns
// When the new hazards start: ground tanks from point E, rolling boulders from H, diving fighters from J.
const TANKS_FROM = 4, BOULDERS_FROM = 7, FIGHTERS_FROM = 9, PAIR_GAP = 20;   // PAIR_GAP: columns between a rock pair, room to land and jump again
const LIVES = 3;
const WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], ACCENT = [1.6, 1.25, 0.45];
// text and light in the engine's light values (above 1 is brighter than white); the pixel art's colours are C, below
const ROVER_RGB = [1.6, 1.3, 0.5], BOMB_RGB = [2.6, 0.2, 0.1], FLASH = [1.8, 0.9, 0.4];
const UFO_RGB = { saucer: [0.6, 1.6, 0.8], bomber: [1.6, 0.5, 1.4], fighter: [1.7, 1.0, 0.3] };
const ROCK = { name: "rock", density: 1.4, e: 0.25, mu: 0.8, kd: 0.95, ks: 0.15, shine: 8 };
const PART = { name: "part", density: 0.8, e: 0.45, mu: 0.6, kd: 0.9, ks: 0.6, shine: 24 };
const FONT = {   // 5x5 block letters for the title, drawn two cells wide per dot
  R: ["####.", "#...#", "####.", "#..#.", "#...#"], O: [".###.", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", ".#.#.", "..#.."], E: ["#####", "#....", "####.", "#....", "#####"],
  P: ["####.", "#...#", "####.", "#....", "#...."], A: [".###.", "#...#", "#####", "#...#", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#.."], L: ["#....", "#....", "#....", "#....", "#####"]
};

applyArcadeSettings(defaultDisplay());   // the tube TV filter from the shared Settings page
const world = new World(); world.openTop = true;
world.w = GW * CW; world.h = GH * CH; world.unit = CW; world.drag = 2e-4 * (600 / world.h) ** 2; world.g = { x: 0, y: world.h * 1.2 };
const pix = createPixels(GW * PX, GH * PY, GW, GH, PU);
let ready = false, state = "title", stateT = 0;
const stars = Array.from({ length: 140 }, () => ({ x: Math.random() * GW * PX, y: 16 + Math.random() * 180, ph: Math.random() * 6.283, b: Math.random() }));
let scroll = 0, sc = 0, speed = CRUISE, features = [], genTo = 0, seed = 1, gr = new Int16Array(GW + 16);
let grounded = true, by = 0, vy = 0, wy = [0, 0, 0], airT = 0;
let ufos = [], bombs = [], fShots = [], uShots = [], tShots = [], flashes = [], waveT = 0, fireT = 0;
let score = 0, lives = LIVES, reached = 0, pointT = 0, msg = "", msgT = 0, best = false;
const cx = gx => (gx + 0.5) * CW, cy = gy => (gy + 0.5) * CH;
const bxs = () => 16 + (speed - VMIN);   // the rover's screen column: it moves forward on screen as it speeds up
const bx = () => sc + Math.floor(bxs());   // the rover's left world column
const letter = k => String.fromCharCode(65 + k % 26);
const postX = k => k * SEC + POST;

/* ---------- saved settings, high scores and sound (src/arcade.js) ---------- */
const store = prefs("roverPatrol.v1.", "Rover Patrol"), scores = scoreTable(store);
// You can start at any checkpoint you have reached before (the menu's Start at).
let furthest = Math.max(0, +store.get("furthest", 0) || 0), startAt = 0;
function saveScore(){ best = score > 0 && scores.add({ score, point: letter(reached) + (reached >= 26 ? "+" : "") }).rank === 0; }
// effects and an original music loop, made by audio/rover-sfx.py
const audio = createAudio({ label: "Rover Patrol", store, sounds: ROVER_SFX, music: { music: ROVER_MUSIC }, volume: 1, musicGain: 0.27 });
const sfx = name => audio.play(name), playMusic = on => audio.music(on ? "music" : null);
const feel = createFeel(), vfx = createFx();

function layout(){ if (pix.fit(stage, cv, ctx)) ready = true; }

/* ---------- the course ---------- */
// Each checkpoint section is generated from its own seed, so going back to a checkpoint rebuilds the same course.
function rngFor(s){ let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ q >>> 15, q | 1); q ^= q + Math.imul(q ^ q >>> 7, q | 61); return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }
function genSection(s){
  const rnd = rngFor(seed * 1000 + s), d = s;   // difficulty grows with every checkpoint
  let x = s * SEC + POST + 18;
  const end = (s + 1) * SEC + POST - 22;   // keep the ground around each post clear, for a safe restart
  const kinds = [["crater", 0.38], ["rock", 0.22], ["big", d >= 2 ? 0.18 : 0], ["mine", d >= 4 ? 0.12 : 0], ["tank", d >= TANKS_FROM ? 0.08 : 0], ["boulder", d >= BOULDERS_FROM ? 0.08 : 0]];
  const total = kinds.reduce((t, k) => t + k[1], 0);
  while (x < end){
    let roll = rnd() * total, kind = kinds[0][0]; for (const [k, w] of kinds){ if ((roll -= w) < 0){ kind = k; break; } }
    if (kind === "crater"){ const w = 3 + Math.floor(rnd() * Math.min(5, 1 + d / 2)); add({ type: "crater", x, w }); x += w; }
    else if (kind === "rock"){ add({ type: "rock", x, w: 2, h: 1, hp: 1 }); x += 2; }
    else if (kind === "big"){ add({ type: "rock", x, w: 3, h: 2, hp: 2 }); x += 3; }
    else if (kind === "mine"){ add({ type: "mine", x, w: 1 }); x += 1; }
    else if (kind === "tank"){ add({ type: "tank", x, w: TW, h: 2, hp: 2, fireT: 1 + rnd() * 2 }); x += TW + 10; }   // it creeps toward you, so leave room
    else { add({ type: "boulder", x: x + 12, w: 2, h: 2, hp: 2, a: 0 }); x += 2; }   // it rolls toward you from further on
    if (d >= 6 && (kind === "rock" || kind === "big") && rnd() < 0.4){ x += PAIR_GAP; add({ type: "rock", x, w: 2, h: 1, hp: 1 }); x += 2; }   // a rock pair: land, then jump or shoot again
    x += Math.round(16 + Math.max(0, 16 - d) + rnd() * 14);
  }
}
function add(f){ features.push(f); features.sort((a, b) => a.x - b.x); }
const bumpF = wc => Math.max(0, Math.min(2, 1 + 0.6 * Math.sin(wc * 0.12) + 0.8 * Math.sin(wc * 0.037 + 2)));   // the ground's rise, in rows
const bump = wc => Math.round(bumpF(wc));
function craterAt(wc){ for (const f of features) if (f.type === "crater" && wc >= f.x && wc < f.x + f.w) return f; return null; }
function inPit(f, wc){ return f.w <= 2 ? true : wc > f.x && wc < f.x + f.w - 1; }   // the deep middle of a crater
function groundRow(wc){
  const f = craterAt(wc);
  let r = GBASE - bump(wc);
  if (f) r += f.w <= 2 ? 2 : (wc === f.x || wc === f.x + f.w - 1) ? 1 : 3;
  return r;
}
// The ground under every screen column (plus a margin for the rover's wheels), and the same as engine terrain.
function computeGround(){
  for (let c = 0; c < gr.length; c++) gr[c] = groundRow(sc + c);
  const solid = world.terrain ? world.terrain.solid : new Uint8Array(GW * GH);
  for (let c = 0; c < GW; c++) for (let r = 0; r < GH; r++) solid[r * GW + c] = r >= gr[c] ? 1 : 0;
  world.terrain = { cw: CW, ch: CH, cols: GW, rows: GH, solid, mat: ROCK };
}
const groundAt = wc => gr[Math.max(0, Math.min(gr.length - 1, wc - sc))];

/* ---------- game flow ---------- */
function newGame(){
  seed = 1 + Math.floor(Math.random() * 1e6);
  score = 0; lives = LIVES; reached = Math.min(startAt, furthest); best = false; features = [];
  state = "play"; stateT = 0; sfx("start"); playMusic(true);
  respawn();
}
function respawn(){
  world.bodies.length = 0; world.forces.length = 0;
  features = features.filter(f => f.x < reached * SEC); genTo = reached;
  ufos = []; bombs = []; fShots = []; uShots = []; tShots = []; flashes = [];
  speed = CRUISE; scroll = postX(reached) + 3 - (Math.floor(bxs()) + 4); sc = Math.floor(scroll);
  ensureCourse(); computeGround();
  grounded = true; vy = 0; for (let i = 0; i < 3; i++) wy[i] = groundAt(bx() + WHEELS[i]) - 1;
  waveT = 6; pointT = 0; say("POINT " + letter(reached), 1.5);
}
function ensureCourse(){
  while (genTo * SEC < sc + GW + SEC){ genSection(genTo); genTo++; }
  features = features.filter(f => f.x + f.w > sc - 2);
}
function say(text, secs){ msg = text; msgT = secs; }
function die(){
  if (state !== "play") return;
  state = "dead"; stateT = 0; sfx("crash"); feel.shake(10, 0.5); feel.freeze(0.18); feel.flash(0.5);
  // the rover comes apart: chassis plates and the three wheels fly, then bounce on the ground
  const x0 = bxs(), top = Math.min(...wy) - 2;
  boom(cx(x0 + 4), cy(top + 1), 1.4);
  for (let k = 0; k < 4; k++){
    const b = world.addBox(cx(x0 + 1 + k * 2), cy(top + 1), CW * 1.1, CH * 0.4, "part", ROVER_RGB.map(v => v * 0.35), PART);
    b.vx = (Math.random() - 0.3) * 300; b.vy = -200 - Math.random() * 250; b.w = (Math.random() - 0.5) * 20; b.flash = 1; b.gold = k % 2;
  }
  for (const w of WHEELS){
    const b = world.add(cx(x0 + w), cy(wy[0]), CH * 0.55, "rubber", [0.3, 0.3, 0.33]);
    b.vx = (Math.random() - 0.2) * 300; b.vy = -250 - Math.random() * 200; b.w = (Math.random() - 0.5) * 30;
  }
}
function boom(px, py, size, rgb = FLASH, n = 0){   // a flash that lights the ground, a shove, and optional rubble
  flashes.push({ x: px, y: py, t: 0.5, size });
  world.forces.push({ x: px, y: py, radius: CH * 6 * size, strength: world.h * 10, t: 0.06 });
  vfx.explode(px, py, CH * 1.2 * size); if (n) vfx.debris(px, py, CH * size, PAL.dirt, n);
  feel.shake(2 + size * 3, 0.25); if (size >= 1) feel.freeze(0.06);
  for (let k = 0; k < n; k++){
    const a = Math.random() * Math.PI, sp = 150 + Math.random() * 350;
    const b = world.add(px, py, CH * (0.25 + Math.random() * 0.25), "rock", rgb, ROCK);
    b.vx = Math.cos(a) * sp; b.vy = -Math.sin(a) * sp; b.w = (Math.random() - 0.5) * 20; b.life = 1.5 + Math.random();
  }
}
function scoreAt(pts, text){ score += pts; if (text) say(text, 0.8); }

/* ---------- update ---------- */
function update(dt){
  stateT += dt; msgT -= dt; pointT += dt;
  for (const f of flashes) f.t -= dt;
  flashes = flashes.filter(f => f.t > 0);
  if (state === "dead"){
    if (stateT > 2.5){
      lives--;
      if (lives <= 0){ state = "over"; stateT = 0; playMusic(false); sfx("over"); saveScore(); }
      else { state = "play"; respawn(); }
    }
    return scrollBy(dt * speed * 0.3);   // the wreck slows to a stop
  }
  if (state !== "play") return;
  // speed: right accelerates, left brakes, otherwise drift back to cruising speed
  if (keys.right) speed = Math.min(VMAX, speed + 14 * dt);
  else if (keys.left) speed = Math.max(VMIN, speed - 14 * dt);
  else speed += Math.sign(CRUISE - speed) * Math.min(Math.abs(CRUISE - speed), 5 * dt);
  scrollBy(speed * dt);
  const x = bx(), mid = x + 4;
  // wheels: on the ground each one follows the ground under it, so the rover rocks over bumps and crater rims
  if (grounded){
    for (let i = 0; i < 3; i++){ const tg = groundAt(x + WHEELS[i]) - 1; wy[i] += (tg - wy[i]) * Math.min(1, dt * 30); if (tg < wy[i]) wy[i] = tg; }
    const pit = craterAt(mid);
    if (pit && inPit(pit, mid)) return die();
  } else {
    airT += dt;
    vy += (jumpHeld && vy < 0 && airT < JUMP_HOLD ? G * HOLD_G : G) * dt; by += vy * dt;
    const land = Math.min(...WHEELS.map(w => groundAt(x + w) - 1));
    if (vy > 0 && by >= land){
      grounded = true; for (let i = 0; i < 3; i++) wy[i] = Math.max(by, groundAt(x + WHEELS[i]) - 1);
      sfx("land"); vfx.puff(cx(bxs() + 4), cy(land), CH, 3);
      for (let k = 0; k < 3; k++){ const b = world.add(cx(bxs() + 1 + k * 3), cy(land), CH * 0.2, "foam", [0.3, 0.28, 0.25]); b.vx = (Math.random() - 0.5) * 200; b.vy = -100 - Math.random() * 120; b.life = 0.6; }
    } else for (let i = 0; i < 3; i++) wy[i] = by;
  }
  if (jumpQueued > 0 && grounded){ grounded = false; by = Math.min(...wy); vy = -JUMPV; airT = 0; jumpQueued = 0; sfx("jump"); }
  jumpQueued = Math.max(0, jumpQueued - dt);
  const bottom = Math.max(...wy);
  for (const f of features){
    if (f.x > x + RW) continue;
    if (f.x + f.w <= x + 1){ if (!f.passed){ f.passed = true; if (f.type !== "crater" || f.w > 2) scoreAt(f.type === "tank" || f.type === "boulder" ? 100 : 50); } continue; }
    if (SOLID[f.type] && f.x <= x + RW - 1 && f.x + f.w - 1 >= x + 1 && bottom >= groundAt(Math.floor(f.x)) - f.h) return die();
    if (f.type === "mine" && grounded && f.x >= x + 1 && f.x <= x + 7){ boom(cx(f.x - sc), cy(groundAt(f.x)), 1); return die(); }
  }
  // firing: one shot forward and one straight up, while the button is held
  if ((fireT -= dt) <= 0 && fireHeld && fShots.length < 1 + (uShots.length < 3 ? 1 : 0)){
    fireT = 0.28; sfx("fire");
    const row1 = Math.round(Math.min(...wy)) - 1;
    vfx.burst(cx(bxs() + RW), cy(row1), { n: 4, speed: CH * 8, life: 0.15, dir: 0, spread: 1, g: 0 });
    if (!fShots.length) fShots.push({ x: x + RW, y: row1, d: 0 });
    if (uShots.length < 3) uShots.push({ x: x + 4, y: row1 - 2 });
  }
  for (const s of fShots){
    for (let k = 0, n = Math.ceil(70 * dt); k < n && !s.dead; k++){
      s.x += 70 * dt / n; s.d += 70 * dt / n;
      const wc = Math.floor(s.x);
      for (const f of features) if (SOLID[f.type] && wc >= Math.floor(f.x) && wc < f.x + f.w && s.y >= groundAt(Math.floor(f.x)) - f.h - 1){ hitRock(f); s.dead = true; break; }
      for (const t of tShots) if (!t.dead && Math.abs(t.x - s.x) < 1.5 && Math.abs(t.y - s.y) < 1.2){ t.dead = true; s.dead = true; boom(cx(t.x - sc), cy(t.y), 0.4); sfx("rock"); scoreAt(50); }
    }
    if (s.d > 42) s.dead = true;
  }
  fShots = fShots.filter(s => !s.dead);
  for (const s of uShots){
    s.y -= 45 * dt;
    for (const u of ufos) if (!u.dead && s.x >= u.x + sc && s.x < u.x + sc + 5 && s.y >= u.y - 0.5 && s.y < u.y + 2){ kill(u); s.dead = true; break; }
    for (const b of bombs) if (!s.dead && Math.abs(b.x - s.x) < 1.2 && Math.abs(b.y - s.y) < 1.2){ b.dead = true; s.dead = true; boom(cx(b.x - sc), cy(b.y), 0.6, BOMB_RGB.map(v => v * 0.3), 3); sfx("explode"); scoreAt(50); }
    if (s.y < 1) s.dead = true;
  }
  uShots = uShots.filter(s => !s.dead);
  updateUfos(dt, x);
  if (updateMovers(dt, x, bottom)) return;
  for (const b of bombs){
    b.vy += BOMB_G * dt; b.y += b.vy * dt;
    const wc = Math.floor(b.x), top = Math.min(...wy) - 2;
    if (wc >= x && wc < x + RW && b.y >= top - 0.5 && b.y <= bottom + 0.5){ b.dead = true; boom(cx(wc - sc), cy(b.y), 1); return die(); }
    if (b.y >= groundAt(wc) - 0.5){
      b.dead = true; boom(cx(wc - sc), cy(groundAt(wc)), 0.8, [0.3, 0.28, 0.25], 5); sfx("explode");
      const w = b.big ? 3 : 2;
      if (!features.some(f => f.x < wc + w + 1 && f.x + f.w > wc - 1)) add({ type: "crater", x: wc, w, passed: wc + w <= x + 1 });   // the blast leaves a crater
    }
  }
  bombs = bombs.filter(b => !b.dead);
  if (mid >= postX(reached + 1)){
    reached++;
    if (reached > furthest){ furthest = reached; store.set("furthest", furthest); }
    const bonus = 500 + Math.max(0, Math.round(60 - pointT)) * 10;
    score += bonus; pointT = 0; sfx("point");
    say((reached % 26 === 0 ? "COURSE COMPLETE! " : "POINT " + letter(reached) + "  ") + "BONUS " + bonus, 2);
  }
}
function scrollBy(cols){
  const before = sc; scroll += cols; sc = Math.floor(scroll);
  if (sc !== before){
    const dx = (sc - before) * CW;
    for (const b of world.bodies) b.x -= dx;   // the rubble stays where it fell on the ground
    world.bodies = world.bodies.filter(b => b.x > -b.r * 2);
    for (const f of flashes) f.x -= dx;
    for (const p of vfx.parts) p.x -= dx;
    if (state !== "title") ensureCourse();   // the title drives along an empty course
  }
  computeGround();
}
// Ground tanks creep toward the rover and fire low shells along the ground; boulders roll at it. Both only move
// once they are on screen, and are hit like rocks (two hits each). Returns true if the rover was wrecked.
const SOLID = { rock: 1, tank: 1, boulder: 1 };
function updateMovers(dt, x, bottom){
  for (const f of features){
    if (f.type !== "tank" && f.type !== "boulder") continue;
    const ahead = f.x - (x + RW);
    if (f.x - sc > GW + 2 || ahead < -RW - 6) continue;
    if (f.type === "boulder"){ f.x -= 7 * dt; f.a -= 7 * dt / 1.1; continue; }
    if (ahead > 2) f.x -= 2 * dt;
    if ((f.fireT -= dt) <= 0 && ahead > 16 && ahead < 60){   // it stops firing once you are close, so you can deal with it
      f.fireT = 3 + Math.random() * 1.5 - Math.min(0.8, reached * 0.03);
      tShots.push({ x: f.x - 1, y: groundAt(Math.floor(f.x)) - 2 }); sfx("fire");
    }
  }
  for (const t of tShots){
    t.x -= 16 * dt;
    if (t.x >= x + 1 && t.x <= x + RW - 1 && bottom >= t.y - 0.5){ t.dead = true; boom(cx(t.x - sc), cy(t.y), 0.8); die(); return true; }   // jump over it, or shoot it
    if (t.x < sc - 2) t.dead = true;
  }
  tShots = tShots.filter(t => !t.dead);
  return false;
}
function hitRock(f){
  const px = cx(f.x - sc + f.w / 2), py = cy(groundAt(f.x) - f.h / 2);
  f.hp--; sfx("rock");
  boom(px, py, 0.5, [0.35, 0.32, 0.3], f.hp > 0 ? 4 : 8);
  if (f.hp > 0){ if (f.type === "rock"){ f.w = 2; f.h = 1; } scoreAt(50); }   // a big rock breaks down to a small one; a tank or boulder just cracks
  else { features.splice(features.indexOf(f), 1); scoreAt(f.type === "rock" ? 100 : 200); }
}
function kill(u){
  u.dead = true; sfx("explode");
  boom(cx(u.x + 2), cy(u.y + 1), 1, UFO_RGB[u.kind].map(v => v * 0.3), 8);
  const pts = u.kind === "bomber" ? 200 : u.kind === "fighter" ? 150 : 100; scoreAt(pts, String(pts));
}
// A fighter hovers like a saucer, then dives: it swoops down to the rover's body height where the rover is when the
// dive starts, and climbs away behind it. It warns first (it flashes and cries out); change speed to move the rover
// along the screen out of its path, or shoot it on the way down. Returns true while it is diving.
function dive(u, dt){
  if (!u.dv){ if ((u.diveIn -= dt) > 0 || u.t > u.life) return false; u.dv = { t: -0.6, x0: u.x, y0: u.y, tx: bxs() + 3 }; sfx("ufo"); }
  const D = u.dv; D.t += dt;
  if (D.t < 0) return true;   // the warning: it hangs still and flashes
  const T = 1.8, k = Math.min(1, D.t / T), low = Math.min(...wy) - 2.5;
  u.x = D.x0 + (D.tx - D.x0) * 2 * k; u.y = D.y0 + (low - D.y0) * Math.sin(Math.PI * k);
  const rx = bxs(), top = Math.min(...wy) - 2;
  if (u.x + 2 >= rx && u.x <= rx + RW - 1 && u.y + 1 >= top && u.y <= Math.max(...wy) && state === "play"){ u.dead = true; boom(cx(u.x + 1), cy(u.y), 1); die(); }
  if (k >= 1){ u.dead = true; }   // gone, behind the rover
  return true;
}
function updateUfos(dt, x){
  if (reached >= 1 && (waveT -= dt) <= 0){   // UFO waves from the second checkpoint on
    const d = reached, n = 2 + Math.min(3, Math.floor(d / 3));
    waveT = 14 - Math.min(8, d * 0.7) + Math.random() * 6; sfx("ufo");
    for (let i = 0; i < n; i++) ufos.push({ kind: d >= FIGHTERS_FROM && i % 3 === 2 ? "fighter" : d >= 4 && i % 2 ? "bomber" : "saucer", x: GW + 4 + i * 8, y: 5, y0: 4 + Math.random() * 10,
      home: 30 + Math.random() * 70, ph: Math.random() * 6.283, t: 0, life: 12 + Math.random() * 6, drop: 1.5 + Math.random() * 2, diveIn: 3 + Math.random() * 4 });
  }
  const mid = x + 4;
  for (const u of ufos){
    u.t += dt;
    if (u.kind === "fighter" && dive(u, dt)) continue;
    if (u.t < u.life){
      u.x += (u.home + 14 * Math.sin(u.t * 0.8 + u.ph) - u.x) * Math.min(1, dt * 1.2);
      u.y = u.y0 + 3 * Math.sin(u.t * 1.7 + u.ph);
      // drop a bomb where the rover will be when it lands, with some error so a steady speed isn't fatal
      const T = Math.sqrt(2 * Math.max(1, GBASE - u.y) / BOMB_G), aim = mid + speed * T + (u.err ??= (Math.random() - 0.5) * 6);
      if (u.kind !== "fighter" && (u.drop -= dt) <= 0 && Math.abs(u.x + 2 + sc - aim) < 1.5){   // fighters dive instead of bombing
        bombs.push({ x: u.x + 2 + sc, y: u.y + 2, vy: 0, big: u.kind === "bomber" }); sfx("bomb");
        u.drop = (u.kind === "bomber" ? 1.6 : 2.4) - Math.min(1, reached * 0.06) + Math.random(); u.err = undefined;
      }
    } else { u.x += 40 * dt; u.y -= 8 * dt; }
  }
  ufos = ufos.filter(u => !u.dead && u.x < GW + 6 + 8 * 6 && u.y > -3);
}

/* ---------- drawing ---------- */
// Pixel art, drawn in code. The buggy follows the Apollo moon buggy: a low open frame on big wire-mesh wheels under
// gold fenders, two seats (the driver in front), an umbrella dish on a mast, an equipment rack at the back; ours
// adds a cannon at the nose and one pointing up between the seats. Its frame tilts with the wheels, which ride the
// ground on their own. Things that can wreck it (craters, rocks, mines, tanks, boulders, bombs) are in reds.
const C = {
  far: [62, 68, 108], hill: [92, 92, 118], dust: [178, 170, 154], earth: [52, 104, 186], land: [96, 140, 72], cloud: [232, 236, 240],
  hull: [222, 224, 230], gold: [226, 170, 62], frame: [126, 130, 142], seat: [66, 72, 92], tire: [98, 100, 110], rim: [176, 178, 188],
  suit: [236, 236, 230], visor: [240, 186, 70], rock: [164, 74, 54], tank: [150, 62, 50], tread: [64, 64, 72], mine: [116, 116, 126],
  saucer: [110, 210, 140], bomber: [200, 104, 196], fighter: [232, 150, 60], warn: [240, 60, 40], glass: [150, 214, 250],
  shot: [255, 246, 200], red: [255, 60, 40], amber: [255, 196, 90], post: [150, 156, 176], hiAccent: [255, 200, 90]
};
let frac = 0;   // how far the course has scrolled past the current whole column, 0 to 1
const xOf = wc => (wc - scroll) * PX;   // a world column's left edge on screen, in pixels
// The ground's height in pixels under screen pixel x: the smooth rise the rows are rounded from, and each crater a
// round bowl as deep as its rows (the rules use the rows; the two differ by under half a row).
function surf(x){
  const u = sc + x / PX + frac, f = craterAt(Math.floor(u));
  const e = f ? 2 * Math.max(0, Math.min(1, (u - f.x) / f.w)) - 1 : 1, dip = f ? (f.w <= 2 ? 2 : 3) * Math.min(1, 1.4 * (1 - e * e)) : 0;   // a flat-bottomed bowl
  return (GBASE - bumpF(u) + dip) * PY;
}
const hash = (x, y) => pixHash(x, y);
function drawSky(t){
  // the earth, slowly turning: oceans, land and cloud from noise, lit from the left, with a dither at the terminator
  const ex = (GW - 18) * PX, ey = 9 * PY, er = 24, R = { o: pix.ramp(C.earth), l: pix.ramp(C.land), c: pix.ramp(C.cloud) };
  for (let y = -er; y <= er; y++) for (let x = -er; x <= er; x++){
    const dx = (x + 0.5) / er, dy = (y + 0.5) / er, nn = dx * dx + dy * dy; if (nn > 1) continue;
    const nz = Math.sqrt(1 - nn), lon = Math.atan2(dx, nz) + t * 0.00003, lat = Math.asin(dy);
    const kind = pixNoise(lon * 2.2 + 7, lat * 3 + 3) > 0.57 ? "l" : "o", cloud = pixNoise(lon * 4 + 40 + t * 0.00002, lat * 7) > 0.66;
    const l = Math.max(0, Math.min(1, -0.75 * dx - 0.25 * dy + 0.6 * nz));
    const lv = Math.max(0, Math.min(4, Math.floor(l * 4.4 + 0.2 + (pix.bayer(x, y) - 0.5) * 0.7)));
    pix.px(ex + x, ey + y, (cloud ? R.c : R[kind])[lv], 1);
  }
  // far mountains and nearer hills, scrolling slower than the ground; slopes facing the sun (left) are lit
  const ridge = (x, k, f) => { const c = x / PX + scroll * k; return f(c) * PY; };
  const farF = c => 28 - (3 * Math.sin(c * 0.045) + 2 * Math.sin(c * 0.13 + 1) + 1.5 * Math.abs(Math.sin(c * 0.29)));
  const hillF = c => 33.5 - (2 * Math.sin(c * 0.07 + 3) + 1.3 * Math.sin(c * 0.19));
  for (const [f, k, col, layer] of [[farF, 0.12, C.far, 1], [hillF, 0.35, C.hill, 1]]){
    const R = pix.ramp(col);
    for (let x = 0; x < pix.W; x++){
      const top = ridge(x, k, f), lit = ridge(x - 1, k, f) - ridge(x + 1, k, f);   // > 0: rising to the right, facing the sun
      for (let y = Math.max(0, Math.floor(top)); y < pix.H; y++){
        const depth = y - top, b = pix.bayer(x, y);
        let lv = depth < 1 ? 3 : 1 + (lit * 0.6 + 0.4 - depth * 0.02 + (b - 0.5) * 0.6 > 0.5 ? 1 : 0);
        if (hash(Math.floor(x + scroll * k * PX), y) > 0.985) lv = 0;   // a pock mark
        pix.px(x, y, R[Math.max(0, lv)], layer);
      }
    }
  }
}
function drawGround(){
  const R = pix.ramp(C.dust), H = pix.ramp(C.rock), X0 = Math.floor(scroll * PX);
  for (let x = 0; x < pix.W; x++){
    const top = surf(x), slope = surf(x - 1) - surf(x + 1), wc = sc + Math.floor(x / PX + frac), pit = craterAt(wc), X = x + X0;
    for (let y = Math.floor(top); y < pix.H; y++){
      const depth = y - top, h = hash(X, y);
      if (pit && inPit(pit, wc) && depth < 6){ pix.px(x, y, H[depth < 1 ? 3 : 2], 2); continue; }   // a crater's floor is red: a pit always reads as danger
      let c = R[depth < 1 ? 4 : 3];
      if (depth < 3 && Math.abs(slope) > 1.5) c = R[slope > 0 ? 4 : 2];   // slopes facing the sun are lit
      else if (h > 0.986) c = R[4]; else if (hash(X - 1, y - 1) > 0.986) c = R[1];   // pebbles with a shadow
      else if (depth >= 1){   // Balote's close tones from smooth noise, darkening with depth
        const k = [0.9, 0.94, 0.98, 1.02][Math.max(0, Math.min(3, Math.floor((0.5 + (pixNoise(X * 0.06, y * 0.12) - 0.5) * 0.8) * 4 + (pix.bayer(x, y) - 0.5) * 0.6)))] * Math.max(0.55, 1 - depth * 0.006);
        c = [c[0] * k, c[1] * k, c[2] * k];
      }
      pix.px(x, y, c, 2);
    }
  }
}
// A wire-mesh wheel of radius r turned by angle a: a chevron tread, spokes, a hub.
function wheel(cx, cy, r, a){
  const T = pix.ramp(C.tire), M = pix.ramp(C.rim);
  for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++){
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx) - a;
    if (d > r + 0.5) continue;
    const tread = ((Math.floor(th * 10 / Math.PI) % 2) + 2) % 2;
    if (d > r - 0.6){ if (tread) pix.px(x, y, T[2], 3); continue; }   // the tread's bumps stand proud of the tyre
    if (d > r - 1.8){ pix.px(x, y, T[tread ? 1 : 2], 3); continue; }
    if (d < 1.4){ pix.px(x, y, M[4], 3); continue; }
    let spoke = false; for (let k = 0; k < 3; k++) if (Math.abs(Math.sin(th - k * Math.PI / 3)) * d < 0.6) spoke = true;
    pix.px(x, y, spoke ? M[3] : (x + y) & 1 ? T[1] : T[0], 3);   // the wire mesh
  }
}
function drawBuggy(t){
  const x0 = Math.round(bxs() * PX), r = 6;
  const W3 = WHEELS.map((w, i) => {
    const x = x0 + w * PX + 2;
    return { x, y: (grounded || state === "title" ? surf(x) : (wy[i] + 1) * PY) - r };
  });
  const axle = lx => { const x = x0 + lx; return x <= W3[1].x ? W3[0].y + (W3[1].y - W3[0].y) * (x - W3[0].x) / (W3[1].x - W3[0].x) : W3[1].y + (W3[2].y - W3[1].y) * (x - W3[1].x) / (W3[2].x - W3[1].x); };
  const P = (lx, ly, c) => pix.px(x0 + lx, Math.round(axle(lx)) + ly, c, 3);   // a pixel on the buggy, which tilts with its wheels
  const box = (lx, ly, w, h, R, top = 4, mid = 3, bot = 2) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) P(lx + i, ly + j, R[j === 0 ? top : j === h - 1 ? bot : mid]); };
  const hull = pix.ramp(C.hull), gold = pix.ramp(C.gold), fr = pix.ramp(C.frame), seat = pix.ramp(C.seat), suit = pix.ramp(C.suit);
  const spin = scroll * PX / r;
  // suspension arms, then the wheels on them
  for (const w of W3) for (let k = 0; k <= 4; k++) P(w.x - x0 - k, -k, fr[2]);
  W3.forEach(w => wheel(w.x, w.y, r, spin));
  // the frame: a two-pixel tube from end to end, a deck, the rack at the back and the nose
  for (let lx = 1; lx <= 36; lx++){ P(lx, -5, fr[3]); P(lx, -4, fr[1]); }
  box(4, -7, 30, 2, hull, 4, 3, 2);
  box(2, -12, 7, 5, fr, 4, 3, 2); box(2, -13, 7, 1, gold, 4); P(3, -10, gold[3]); P(6, -10, gold[3]); P(4, -9, hull[4]);   // the equipment rack, gold foil on top
  for (let k = 0; k < 4; k++) P(33 + k, -7 + Math.max(0, k - 1), hull[3 - (k >> 1)]);   // the nose slopes down
  // fenders: gold arcs over each wheel, lit on top
  for (const w of W3) for (let a = Math.PI * 1.08; a <= Math.PI * 1.92; a += 0.08){
    const lx = Math.round(w.x - x0 + Math.cos(a) * (r + 1.6)), ly = Math.round(w.y - axle(w.x - x0) + Math.sin(a) * (r + 1.6));
    P(lx, ly, gold[Math.sin(a) < -0.85 ? 4 : 3]); P(lx, ly - 1, gold[4]);
  }
  // two seats, the driver in the front one: white suit, helmet with a gold visor, backpack
  box(12, -9, 6, 2, seat, 3, 2, 2); box(12, -14, 2, 5, seat, 3, 2, 1);
  box(21, -9, 6, 2, seat, 3, 2, 2); box(21, -14, 2, 5, seat, 3, 2, 1);
  box(23, -14, 3, 5, suit, 4, 3, 2); box(22, -13, 1, 4, fr, 3, 2, 2); box(26, -11, 3, 2, suit, 4, 3, 2);   // body, backpack, arm to the wheel
  for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= 9) P(24 + x, -17 + y, x > 0 && y > -2 && y < 2 ? pix.ramp(C.visor)[x > 1 ? 4 : 3] : suit[y < 0 && x < 1 ? 4 : 3]);
  // the up cannon between the seats, the nose cannon with a headlight, the dish on its mast, the whip aerial
  box(18, -11, 2, 3, fr, 3, 2, 2); for (let ly = -17; ly <= -12; ly++) P(18, ly, fr[ly === -17 ? 4 : 3]);
  for (let lx = 34; lx <= 39; lx++) P(lx, -6, fr[lx === 39 ? 4 : 3]);
  P(36, -8, C.amber); P(37, -8, C.amber);
  for (let ly = -8; ly >= -18; ly--) P(31, ly, fr[2]);
  for (let lx = -5; lx <= 5; lx++){ const h = Math.round(Math.abs(lx) * 0.35); P(31 + lx, -20 + h, hull[lx < 0 ? 4 : 3]); if (Math.abs(lx) < 5) P(31 + lx, -19 + h, hull[1]); }
  for (let ly = -6; ly >= -22; ly--) P(1, ly, fr[3]);
  P(1, -23, (t / 400 | 0) % 2 ? C.red : pix.ramp(C.red)[1]);
}
// Rocks are lumpy domes, each with its own shape; shading as a lit ball.
function drawRock(f, x0, base){
  const w = f.w * PX, h = f.h * PY * 0.85, seed = f.seed ??= Math.random() * 100, R = pix.ramp(C.rock);
  for (let x = 0; x < w; x++){
    const u = (x + 0.5 - w / 2) / (w / 2), top = base - h * Math.sqrt(Math.max(0, 1 - u * u)) * (0.8 + 0.35 * pixNoise(seed + x * 0.5, 1));
    for (let y = Math.floor(top); y <= base + 1; y++){
      const v = (y - (base - h / 2)) / (h / 2 + 1), l = Math.max(0, Math.min(1, -0.55 * u - 0.6 * v + 0.5));
      const lv = Math.max(1, Math.min(4, Math.floor(l * 4.4 + 0.2 + (pix.bayer(x0 + x, y) - 0.5) * 0.7) - (hash(seed + x, y) > 0.9 ? 1 : 0)));
      pix.px(x0 + x, y, R[lv], 3);
    }
  }
}
function drawTank(f, x0, base, t){
  const R = pix.ramp(f.hp > 1 ? C.tank : C.tank.map(v => v * 0.7)), T = pix.ramp(C.tread), F = pix.ramp(C.frame);
  for (let x = 1; x < 19; x++) for (let y = -5; y <= 0; y++){   // the tracks, round at the ends, with road wheels
    const ends = (x < 3 || x > 16) && (y === -5 || y === 0); if (ends) continue;
    pix.px(x0 + x, base + y, T[y === -5 ? 3 : (x + Math.floor(t / 60)) % 3 ? 1 : 2], 3);
  }
  for (const wx of [4, 8, 12, 16]) pix.ball(x0 + wx, base - 2.5, 1.6, C.frame, 3, true);
  for (let x = 2; x < 18; x++) for (let y = -9; y <= -6; y++) if (!(y === -9 && (x < 4 || x > 15))) pix.px(x0 + x, base + y, R[y === -9 ? 4 : y === -6 ? 2 : 3], 3);
  pix.ball(x0 + 11, base - 9.5, 3.6, f.hp > 1 ? C.tank : C.tank.map(v => v * 0.7), 3, true);
  for (let x = -4; x < 8; x++){ pix.px(x0 + x, base - 11, F[3], 3); pix.px(x0 + x, base - 10, F[1], 3); }   // the gun points at you
  if ((t / 300 | 0) % 2) pix.px(x0 + 13, base - 12, C.red, 3);
}
function drawUfo(u, t){
  const cx = (u.x + 2.5) * PX, cy = (u.y + 1) * PY, warn = u.dv && u.dv.t < 0;
  const col = u.kind === "fighter" && (warn || u.dv) ? C.warn : C[u.kind], R = pix.ramp(col), G = pix.ramp(C.glass);
  if (u.kind === "fighter"){   // a dart pointing down, an engine glowing on top
    for (let j = 0; j < 8; j++){ const hw = 6 - j * 0.75; for (let x = -hw; x <= hw; x++) pix.px(cx + x, cy - 4 + j, R[j === 0 ? 4 : Math.abs(x) > hw - 1 ? 2 : 3], 3); }
    pix.px(cx, cy - 1, G[4]); pix.px(cx, cy, G[2]); pix.px(cx - 1, cy - 5, C.amber); pix.px(cx + 1, cy - 5, C.amber);
    return;
  }
  const big = u.kind === "bomber", rx = big ? 10 : 9, ry = big ? 3.5 : 2.5;
  for (let y = -Math.ceil(ry); y <= ry; y++) for (let x = -rx; x <= rx; x++){
    if ((x / rx) ** 2 + (y / ry) ** 2 > 1) continue;
    pix.px(cx + x, cy + y, R[y < -ry * 0.4 ? 4 : y < ry * 0.3 ? 3 : 1], 3);
  }
  for (let y = -4; y < -1; y++) for (let x = -4; x <= 4; x++) if ((x / 4.5) ** 2 + ((y + 1) / 3.5) ** 2 <= 1) pix.px(cx + x, cy + y - (big ? 1 : 0), G[x < 0 && y < -2 ? 4 : 3], 3);   // the glass dome
  const k = Math.floor(t / 120);
  for (let i = -2; i <= 2; i++) pix.px(cx + i * 3.5, cy + (big ? 1 : 0), (i + k) % 3 ? R[1] : C.amber, 3);   // running lights
  if (big){ pix.rect(cx - 3, cy + 3, 6, 1, R[1], 3); if (k % 2) pix.px(cx, cy + 4, C.red, 3); }   // the bomb bay
}
function drawCourse(t){
  for (const f of features){
    const x0 = Math.round(xOf(f.x)); if (x0 > pix.W + 24 || x0 + f.w * PX < -24) continue;
    const base = Math.round(surf(x0 + f.w * PX / 2));
    if (f.type === "rock") drawRock(f, x0, base);
    else if (f.type === "tank") drawTank(f, x0, base, t);
    else if (f.type === "boulder"){   // rolls, with dark pocks that turn with it
      const bx0 = x0 + PX, by0 = base - 7.5;
      pix.ball(bx0, by0, 7.5, C.rock.map(v => v * 0.8), 3);
      for (let k = 0; k < 3; k++){ const a = f.a + k * 2.1; pix.px(bx0 + Math.cos(a) * 4, by0 + Math.sin(a) * 4, pix.ramp(C.rock)[0], 3); }
    } else if (f.type === "mine"){   // a squat dome with spikes and a blinking light
      const mx = x0 + 2;
      pix.ball(mx, base - 1, 3, C.mine, 3, true);
      for (const [dx, dy] of [[-4, -1], [4, -1], [0, -5], [-3, -4], [3, -4]]) pix.px(mx + dx, base + dy, pix.ramp(C.mine)[1], 3);
      pix.px(mx, base - 4, Math.sin(t * 0.012) > 0 ? C.red : pix.ramp(C.red)[1], 3);
    }
  }
  for (let k = reached; k <= reached + 1; k++){   // checkpoint posts: a pole, a beacon and a flag with the letter
    const x = Math.round(xOf(postX(k))) + 2; if (x < -12 || x > pix.W + 12) continue;
    const base = Math.round(surf(x)), F = pix.ramp(C.post), next = k > reached;
    for (let y = base - 30; y < base; y++) pix.px(x, y, F[y === base - 30 ? 4 : 3], 3);
    pix.rect(x + 1, base - 30, 9, 6, pix.ramp(next ? C.hiAccent : C.post)[next ? 3 : 1], 3);
    pix.px(x, base - 31, next && (t / 300 | 0) % 2 ? C.amber : F[2], 3);
    pix.text(Math.round(postX(k) - scroll) - 1, Math.floor((base - 40) / PY), "[" + letter(k) + "]", next ? ACCENT : DIM);
  }
}
function drawShots(t){
  for (const s of fShots){ const x = xOf(s.x), y = s.y * PY + 4; for (let k = 0; k < 7; k++) pix.px(x - k, y, k < 3 ? C.shot : C.amber, 3); }
  for (const s of uShots){ const x = xOf(s.x) + 2, y = s.y * PY; for (let k = 0; k < 6; k++) pix.px(x, y + k, k < 3 ? C.shot : C.amber, 3); }
  for (const b of bombs){ const x = xOf(b.x) + 2, y = b.y * PY + 4; pix.ball(x, y, b.big ? 3 : 2.2, [70, 70, 80], 3, true); if ((t / 150 | 0) % 2) pix.px(x, y - (b.big ? 3 : 2), C.red, 3); }
  for (const s of tShots){ const x = xOf(s.x) + 2, y = s.y * PY + 4; pix.ball(x, y, 2, C.amber, 3, true); pix.px(x - 1, y - 1, C.shot, 3); }
}
// world drawing (bodies, fx, flashes) is in the sc frame: shift it by the part-column scroll
function drawWorld(){
  pix.ox = -frac * PX;
  for (const f of flashes) pix.glow(f.x, f.y, CH * 6 * f.size, FLASH.map(v => v * f.t));
  for (const b of world.bodies){
    if (b.mat.name === "rubber"){ wheel(b.x / PU + pix.ox, b.y / PU, b.r / PU, b.a); continue; }
    pix.body(b, b.mat.name === "part" ? (b.gold ? C.gold : C.hull) : null);
  }
  vfx.draw(pix);
  pix.ox = 0;
}
function drawTitle(){
  [["ROVER", 7], ["PATROL", 14]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((GW - word.length * 12 + 2) / 2), R = pix.ramp(wi ? C.gold : C.saucer);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#"){
      const X = (x0 + li * 12 + dx * 2) * PX, Y = (y0 + dy) * PY, on = (ddx, ddy) => FONT[ch][dy + ddy] && FONT[ch][dy + ddy][dx + ddx] === "#";
      for (let j = 0; j < PY; j++) for (let i = 0; i < 2 * PX; i++){   // each dot a bevelled block, joined to its neighbours
        const lv = (j === 0 && !on(0, -1)) || (i === 0 && !on(-1, 0)) ? 4 : (j === PY - 1 && !on(0, 1)) || (i === 2 * PX - 1 && !on(1, 0)) ? 1 : j < 3 ? 3 : 2;
        pix.px(X + i, Y + j, R[lv], 3);
      }
    } }));
  });
  const blink = (performance.now() / 500 | 0) % 2;
  pix.center(21, pad.touch ? "PRESS A OR START" : "PRESS SPACE TO START", blink ? WHITE : DIM);
  pix.center(23, pad.touch ? "D-PAD LEFT/RIGHT SPEED   A OR UP JUMP (HOLD: FURTHER)   B FIRE   SELECT MENU" : "LEFT/RIGHT SPEED   UP OR SPACE JUMP (HOLD: FURTHER)   X FIRE   ESC MENU", DIM);
  pix.center(24, "JUMP CRATERS AND MINES. SHOOT ROCKS AHEAD AND UFOS ABOVE.", DIM);
  pix.center(25, "LATER: TANKS (JUMP THEIR SHELLS), ROLLING BOULDERS, AND FIGHTERS THAT DIVE (CHANGE SPEED TO DODGE).", DIM);
  if (furthest) pix.center(19, "START AT POINT " + letter(Math.min(startAt, furthest)) + "  (MENU: START AT, UP TO " + letter(furthest) + ")", DIM);
  if (scores.list.length){
    pix.center(27, "HIGH SCORES", ACCENT);
    scores.list.forEach((s, i) => pix.center(28 + i, `${i + 1}. ${String(s.score).padStart(7)}   POINT ${s.point.padEnd(2)}`, i ? DIM : WHITE));
  }
}
function draw(t){
  frac = scroll - sc;
  pix.clear();
  drawSky(t);
  drawGround();
  if (state !== "title") drawCourse(t);
  if (state === "play" || state === "title") drawBuggy(t);
  if (state !== "title") for (const u of ufos){ const warn = u.dv && u.dv.t < 0; if (!warn || (performance.now() / 90 | 0) % 2) drawUfo(u, t); }
  drawShots(t);
  drawWorld();
  pix.edges();
  for (const s of stars){   // stars last, only where the sky is empty, twinkling
    const x = Math.floor(((s.x - scroll * 0.05) % pix.W + pix.W) % pix.W), y = Math.floor(s.y), i = y * pix.W + x;
    if (pix.lay[i] >= 0) continue;
    const v = 70 + 90 * s.b + 40 * Math.sin(t * 0.0015 + s.ph * 7); pix.px(x, y, [v, v, v * 1.15], -1);
  }
  if (state === "title") drawTitle();
  else {
    // HUD: score and lives on the left, the course A..Z in the middle, time on the right
    pix.text(1, 0, "SCORE " + String(score).padStart(6, "0"), WHITE);
    pix.text(1, 1, "HI    " + String(Math.max(score, scores.list[0] ? scores.list[0].score : 0)).padStart(6, "0"), DIM);
    pix.text(GW - 18, 0, "LIVES " + "^".repeat(Math.max(0, lives - (state === "dead" ? 1 : 0))), ROVER_RGB);
    pix.text(GW - 18, 1, "TIME  " + String(Math.floor(pointT)).padStart(3), DIM);
    const x0 = Math.floor((GW - 51) / 2), here = reached % 26;
    for (let k = 0; k < 26; k++) pix.text(x0 + k * 2, 0, letter(k), k === here ? ACCENT : k < here ? WHITE : DIM);
    if (state === "over"){
      pix.center(16, "  GAME OVER  ", WHITE);
      pix.center(18, `  ${score} POINTS  `, ACCENT);
      if (best) pix.center(20, "  NEW HIGH SCORE!  ", ACCENT);
      if (stateT > 1) pix.center(22, pad.touch ? "  PRESS START  " : "  PRESS SPACE  ", DIM);
    } else if (msgT > 0) pix.center(4, "  " + msg + "  ", WHITE);
  }
  const hint = pad.touch ? " SELECT MENU " : " ESC MENU ";
  pix.text(GW - 1 - hint.length, GH - 1, hint, DIM);
  if (menu.open) menu.draw(pix, { accent: ACCENT, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED" });
  pix.present(ctx);
}

/* ---------- input ---------- */
const keys = { left: false, right: false };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
const JUMP_KEYS = new Set(["ArrowUp", "w", "W", " "]), FIRE_KEYS = new Set(["x", "X", "f", "F", "Control", "Enter"]);
let jumpQueued = 0, jumpHeld = false, fireHeld = false;   // jumpQueued: seconds a press waits for the ground
function action(){   // start from the title; back to the title from game over
  if (state === "title") newGame();
  else if (state === "over" && stateT > 1) toTitle();
}
function toTitle(){ state = "title"; features = []; world.bodies.length = 0; ufos = []; bombs = []; tShots = []; speed = CRUISE; }
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "title" ? "START GAME" : "RESTART", select: () => { menu.hide(); audio.unlock(); newGame(); } },
  { label: "START AT", value: () => "POINT " + letter(Math.min(startAt, furthest)), change: d => { startAt = (Math.min(startAt, furthest) + (d || 1) + furthest + 1) % (furthest + 1); } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "CONTROLS", value: () => pad.touch ? "TOUCH" : "KEYBOARD", change: () => pad.toggle() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { for (const k in keys) keys[k] = false; fireHeld = jumpHeld = false; audio.pause(); },
  onClose: () => { audio.resume(); }
});
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (JUMP_KEYS.has(e.key) || FIRE_KEYS.has(e.key)) e.preventDefault();
  if (FIRE_KEYS.has(e.key)) fireHeld = true;
  if (e.repeat) return;
  audio.unlock();
  if (e.key === "Escape" || e.key === "p" || e.key === "P") return menu.show();
  if (e.key === "m" || e.key === "M") return audio.toggleMute();
  if (e.key === "r" || e.key === "R") return newGame();
  if (state !== "play"){ if (e.key === " " || e.key === "Enter") action(); return; }
  if (JUMP_KEYS.has(e.key)){ jumpQueued = JUMP_BUFFER; jumpHeld = true; }
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; if (FIRE_KEYS.has(e.key)) fireHeld = false; if (JUMP_KEYS.has(e.key)) jumpHeld = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; fireHeld = jumpHeld = false; });

const pad = createPad({ store, menu: () => menu.open && menu, onAny: () => audio.unlock(),
  onDir: d => { if (d === "up" && state === "play" && !jumpHeld) jumpQueued = JUMP_BUFFER; jumpHeld = d === "up"; keys.left = d === "left"; keys.right = d === "right"; },
  onPress: id => {
    if (id === "select") return menu.show();
    if (state === "title" || state === "over"){ if (id === "a" || id === "start") action(); return; }
    if (id === "start") return menu.show();
    if (id === "a"){ jumpQueued = JUMP_BUFFER; jumpHeld = true; } else fireHeld = true;
  },
  onRelease: id => { if (id === "b") fireHeld = false; if (id === "a") jumpHeld = false; } });
cv.addEventListener("pointerdown", e => {
  audio.unlock();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!pad.touch) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
function tick(dt, t){
  if (ready && !menu.open && (dt = feel.step(dt))){   // the open menu pauses everything, and so does a hit-stop
    vfx.update(dt);
    if (state === "title"){   // the rover drives along an empty course behind the title
      scrollBy(10 * dt); for (let i = 0; i < 3; i++) wy[i] += (groundAt(bx() + WHEELS[i]) - 1 - wy[i]) * Math.min(1, dt * 30);
    } else update(dt);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life) b.life -= dt;
    world.bodies = world.bodies.filter(b => !(b.life < 0));
  }
  if (ready){ feel.begin(ctx, cv); draw(t); feel.end(ctx, cv); }
}
layout();
computeGround(); for (let i = 0; i < 3; i++) wy[i] = groundAt(bx() + WHEELS[i]) - 1;
onResize(stage, layout);
startLoop(tick);
})();
