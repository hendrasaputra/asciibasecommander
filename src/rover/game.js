(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// A side-scroller after Moon Patrol. Rules run on a character grid in world columns: the course scrolls left
// under the rover, one column at a time. The ground is an engine terrain grid rebuilt every frame, so rubble,
// dust and the wreck of the rover bounce and roll on it. Rocks and the planet are lit engine spheres.
const GW = 120, GH = 44, GBASE = GH - 7;          // GBASE: ground row on flat ground
const SEC = 160, POST = 40;                        // course columns per checkpoint; post position in a section
const CRUISE = 14, VMIN = 8, VMAX = 24;            // speed in columns per second
const JUMPV = 24, G = 55, BOMB_G = 30;             // rows per second, rows per second squared
const WHEELS = [1, 4, 7], RW = 9;                  // wheel columns in the rover sprite; sprite width
const ROVER = ["  ._n_.  ", " [=###=]>"];
const SAUCER = [" .-. ", "<=o=>"], BOMBER = ["\\_^_/", " (#) "];
const LIVES = 3;
const WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], ACCENT = [1.6, 1.25, 0.45];
const ROVER_RGB = [1.6, 1.3, 0.5], WHEEL_RGB = [1.1, 1.1, 1.2], SHOT_RGB = [2.2, 2.0, 1.2], BOMB_RGB = [2.6, 0.2, 0.1];
// Everything that can wreck the rover (craters, rocks, mines, bombs) is drawn in warning red, so it never blends into the grey ground.
const HAZARD_RGB = [2.4, 0.16, 0.08];
const UFO_RGB = { saucer: [0.6, 1.6, 0.8], bomber: [1.6, 0.5, 1.4] }, FLASH = [1.8, 0.9, 0.4];
const GROUND_RGB = [0.75, 0.7, 0.6], HILL_RGB = [0.42, 0.42, 0.55], FAR_RGB = [0.28, 0.32, 0.55];
const ROCK = { name: "rock", density: 1.4, e: 0.25, mu: 0.8, kd: 0.95, ks: 0.15, shine: 8 };
const PART = { name: "part", density: 0.8, e: 0.45, mu: 0.6, kd: 0.9, ks: 0.6, shine: 24 };
const FONT = {   // 5x5 block letters for the title, drawn two cells wide per dot
  R: ["####.", "#...#", "####.", "#..#.", "#...#"], O: [".###.", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", ".#.#.", "..#.."], E: ["#####", "#....", "####.", "#....", "#####"],
  P: ["####.", "#...#", "####.", "#....", "#...."], A: [".###.", "#...#", "#####", "#...#", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#.."], L: ["#....", "#....", "#....", "#....", "#####"]
};

const D = defaultDisplay(); D.room = 0.2; D.glow = 0.25; D.lampRGB = [1.0, 0.95, 0.85];   // a low sun on the left
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
const world = new World(); world.openTop = true;
const sun = { x: 0, y: 0, z: 0, on: true };
let screen = null, state = "title", stateT = 0, stars = [];
let scroll = 0, sc = 0, speed = CRUISE, features = [], genTo = 0, seed = 1, gr = new Int16Array(GW + 16);
let grounded = true, by = 0, vy = 0, wy = [0, 0, 0];
let ufos = [], bombs = [], fShots = [], uShots = [], flashes = [], waveT = 0, fireT = 0;
let score = 0, lives = LIVES, reached = 0, pointT = 0, msg = "", msgT = 0, best = false;
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const bxs = () => 16 + (speed - VMIN);   // the rover's screen column: it moves forward on screen as it speeds up
const bx = () => sc + Math.floor(bxs());   // the rover's left world column
const letter = k => String.fromCharCode(65 + k % 26);
const postX = k => k * SEC + POST;

/* ---------- saved settings, high scores and sound (src/arcade.js) ---------- */
const store = prefs("roverPatrol.v1.", "Rover Patrol"), scores = scoreTable(store);
function saveScore(){ best = score > 0 && scores.add({ score, point: letter(reached) + (reached >= 26 ? "+" : "") }).rank === 0; }
// effects and an original music loop, made by audio/rover-sfx.py
const audio = createAudio({ label: "Rover Patrol", store, sounds: ROVER_SFX, music: { music: ROVER_MUSIC }, volume: 1, musicGain: 0.27 });
const sfx = name => audio.play(name), playMusic = on => audio.music(on ? "music" : null);

function layout(){
  const old = screen; screen = fitGrid(stage, cv, ctx, D, GW, GH) || old; if (screen === old) return;
  const W = GW * screen.cw, H = GH * screen.ch;
  world.w = W; world.h = H; world.unit = screen.cw; world.drag = 2e-4 * (600 / H) ** 2; world.g = { x: 0, y: H * 1.2 };
  sun.x = W * 0.08; sun.y = -H * 0.25; sun.z = H * 0.9;
  rescaleBodies(world, old, screen);
  stars = Array.from({ length: 110 }, () => ({ x: Math.floor(Math.random() * GW), y: 2 + Math.floor(Math.random() * 22), ph: Math.random() * 6.283 }));
}

/* ---------- the course ---------- */
// Each checkpoint section is generated from its own seed, so going back to a checkpoint rebuilds the same course.
function rngFor(s){ let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let q = a; q = Math.imul(q ^ q >>> 15, q | 1); q ^= q + Math.imul(q ^ q >>> 7, q | 61); return ((q ^ q >>> 14) >>> 0) / 4294967296; }; }
function genSection(s){
  const rnd = rngFor(seed * 1000 + s), d = s;   // difficulty grows with every checkpoint
  let x = s * SEC + POST + 18;
  const end = (s + 1) * SEC + POST - 22;   // keep the ground around each post clear, for a safe restart
  while (x < end){
    const roll = rnd();
    if (roll < 0.4){ const w = 3 + Math.floor(rnd() * Math.min(5, 1 + d / 2)); add({ type: "crater", x, w }); x += w; }
    else if (roll < 0.62 || d < 2) { add({ type: "rock", x, w: 2, h: 1, hp: 1 }); x += 2; }
    else if (roll < 0.8 || d < 4){ add({ type: "rock", x, w: 3, h: 2, hp: 2 }); x += 3; }
    else { add({ type: "mine", x, w: 1 }); x += 1; }
    if (d >= 6 && rnd() < 0.3){ x += 9; add({ type: "rock", x, w: 2, h: 1, hp: 1 }); x += 2; }   // a pair: land, then jump or shoot again
    x += Math.round(16 + Math.max(0, 16 - d) + rnd() * 14);
  }
}
function add(f){ features.push(f); features.sort((a, b) => a.x - b.x); }
const bump = wc => Math.max(0, Math.min(2, Math.round(1 + 0.6 * Math.sin(wc * 0.12) + 0.8 * Math.sin(wc * 0.037 + 2))));
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
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid, mat: ROCK };
}
const groundAt = wc => gr[Math.max(0, Math.min(gr.length - 1, wc - sc))];

/* ---------- game flow ---------- */
function newGame(){
  seed = 1 + Math.floor(Math.random() * 1e6);
  score = 0; lives = LIVES; reached = 0; best = false;
  state = "play"; stateT = 0; sfx("start"); playMusic(true);
  respawn();
}
function respawn(){
  world.bodies.length = 0; world.forces.length = 0;
  features = features.filter(f => f.x < reached * SEC); genTo = reached;
  ufos = []; bombs = []; fShots = []; uShots = []; flashes = [];
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
  state = "dead"; stateT = 0; sfx("crash");
  // the rover comes apart: chassis plates and the three wheels fly, then bounce on the ground
  const x0 = bxs(), top = Math.min(...wy) - 2;
  boom(cx(x0 + 4), cy(top + 1), 1.4);
  for (let k = 0; k < 4; k++){
    const b = world.addBox(cx(x0 + 1 + k * 2), cy(top + 1), screen.cw * 1.1, screen.ch * 0.4, "part", ROVER_RGB.map(v => v * 0.35), PART);
    b.vx = (Math.random() - 0.3) * 300; b.vy = -200 - Math.random() * 250; b.w = (Math.random() - 0.5) * 20; b.flash = 1;
  }
  for (const w of WHEELS){
    const b = world.add(cx(x0 + w), cy(wy[0]), screen.ch * 0.55, "rubber", [0.3, 0.3, 0.33]);
    b.vx = (Math.random() - 0.2) * 300; b.vy = -250 - Math.random() * 200; b.w = (Math.random() - 0.5) * 30;
  }
}
function boom(px, py, size, rgb = FLASH, n = 0){   // a flash that lights the ground, a shove, and optional rubble
  flashes.push({ x: px, y: py, t: 0.5, size });
  world.forces.push({ x: px, y: py, radius: screen.ch * 6 * size, strength: world.h * 10, t: 0.06 });
  for (let k = 0; k < n; k++){
    const a = Math.random() * Math.PI, sp = 150 + Math.random() * 350;
    const b = world.add(px, py, screen.ch * (0.25 + Math.random() * 0.25), "rock", rgb, ROCK);
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
    vy += G * dt; by += vy * dt;
    const land = Math.min(...WHEELS.map(w => groundAt(x + w) - 1));
    if (vy > 0 && by >= land){
      grounded = true; for (let i = 0; i < 3; i++) wy[i] = Math.max(by, groundAt(x + WHEELS[i]) - 1);
      sfx("land");
      for (let k = 0; k < 3; k++){ const b = world.add(cx(bxs() + 1 + k * 3), cy(land), screen.ch * 0.2, "foam", [0.3, 0.28, 0.25]); b.vx = (Math.random() - 0.5) * 200; b.vy = -100 - Math.random() * 120; b.life = 0.6; }
    } else for (let i = 0; i < 3; i++) wy[i] = by;
  }
  if (jumpQueued && grounded){ grounded = false; by = Math.min(...wy); vy = -JUMPV; sfx("jump"); }
  jumpQueued = false;
  const bottom = Math.max(...wy);
  for (const f of features){
    if (f.x > x + RW) break;
    if (f.x + f.w <= x + 1){ if (!f.passed){ f.passed = true; if (f.type !== "crater" || f.w > 2) scoreAt(50); } continue; }
    if (f.type === "rock" && f.x <= x + RW - 1 && f.x + f.w - 1 >= x + 1 && bottom >= groundAt(f.x) - f.h) return die();
    if (f.type === "mine" && grounded && f.x >= x + 1 && f.x <= x + 7){ boom(cx(f.x - sc), cy(groundAt(f.x)), 1); return die(); }
  }
  // firing: one shot forward and one straight up, while the button is held
  if ((fireT -= dt) <= 0 && fireHeld && fShots.length < 1 + (uShots.length < 3 ? 1 : 0)){
    fireT = 0.28; sfx("fire");
    const row1 = Math.round(Math.min(...wy)) - 1;
    if (!fShots.length) fShots.push({ x: x + RW, y: row1, d: 0 });
    if (uShots.length < 3) uShots.push({ x: x + 4, y: row1 - 2 });
  }
  for (const s of fShots){
    for (let k = 0, n = Math.ceil(70 * dt); k < n && !s.dead; k++){
      s.x += 70 * dt / n; s.d += 70 * dt / n;
      const wc = Math.floor(s.x);
      for (const f of features) if (f.type === "rock" && wc >= f.x && wc < f.x + f.w && s.y >= groundAt(f.x) - f.h - 1){ hitRock(f); s.dead = true; break; }
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
    const bonus = 500 + Math.max(0, Math.round(60 - pointT)) * 10;
    score += bonus; pointT = 0; sfx("point");
    say((reached % 26 === 0 ? "COURSE COMPLETE! " : "POINT " + letter(reached) + "  ") + "BONUS " + bonus, 2);
  }
}
function scrollBy(cols){
  const before = sc; scroll += cols; sc = Math.floor(scroll);
  if (sc !== before){
    const dx = (sc - before) * screen.cw;
    for (const b of world.bodies) b.x -= dx;   // the rubble stays where it fell on the ground
    world.bodies = world.bodies.filter(b => b.x > -b.r * 2);
    for (const f of flashes) f.x -= dx;
    if (state !== "title") ensureCourse();   // the title drives along an empty course
  }
  computeGround();
}
function hitRock(f){
  const px = cx(f.x - sc + f.w / 2), py = cy(groundAt(f.x) - f.h / 2);
  f.hp--; sfx("rock");
  boom(px, py, 0.5, [0.35, 0.32, 0.3], f.hp > 0 ? 4 : 8);
  if (f.hp > 0){ f.w = 2; f.h = 1; scoreAt(50); }   // a big rock breaks down to a small one
  else { features.splice(features.indexOf(f), 1); scoreAt(100); }
}
function kill(u){
  u.dead = true; sfx("explode");
  boom(cx(u.x + 2), cy(u.y + 1), 1, UFO_RGB[u.kind].map(v => v * 0.3), 8);
  scoreAt(u.kind === "bomber" ? 200 : 100, u.kind === "bomber" ? "200" : "100");
}
function updateUfos(dt, x){
  if (reached >= 1 && (waveT -= dt) <= 0){   // UFO waves from the second checkpoint on
    const d = reached, n = 2 + Math.min(3, Math.floor(d / 3));
    waveT = 14 - Math.min(8, d * 0.7) + Math.random() * 6; sfx("ufo");
    for (let i = 0; i < n; i++) ufos.push({ kind: d >= 4 && i % 2 ? "bomber" : "saucer", x: GW + 4 + i * 8, y: 5, y0: 4 + Math.random() * 10,
      home: 30 + Math.random() * 70, ph: Math.random() * 6.283, t: 0, life: 12 + Math.random() * 6, drop: 1.5 + Math.random() * 2 });
  }
  const mid = x + 4;
  for (const u of ufos){
    u.t += dt;
    if (u.t < u.life){
      u.x += (u.home + 14 * Math.sin(u.t * 0.8 + u.ph) - u.x) * Math.min(1, dt * 1.2);
      u.y = u.y0 + 3 * Math.sin(u.t * 1.7 + u.ph);
      // drop a bomb where the rover will be when it lands, with some error so a steady speed isn't fatal
      const T = Math.sqrt(2 * Math.max(1, GBASE - u.y) / BOMB_G), aim = mid + speed * T + (u.err ??= (Math.random() - 0.5) * 6);
      if ((u.drop -= dt) <= 0 && Math.abs(u.x + 2 + sc - aim) < 1.5){
        bombs.push({ x: u.x + 2 + sc, y: u.y + 2, vy: 0, big: u.kind === "bomber" }); sfx("bomb");
        u.drop = (u.kind === "bomber" ? 1.6 : 2.4) - Math.min(1, reached * 0.06) + Math.random(); u.err = undefined;
      }
    } else { u.x += 40 * dt; u.y -= 8 * dt; }
  }
  ufos = ufos.filter(u => !u.dead && u.x < GW + 6 + 8 * 6 && u.y > -3);
}

/* ---------- drawing ---------- */
const { put, text, center, sprite } = pen(() => screen);   // drawing on the character grid (src/arcade.js)
const ball = { a: 0, w: 0, flash: 0, mat: ROCK };
function litBall(px, py, r, alb, mat = ROCK){ ball.x = px; ball.y = py; ball.r = r; ball.alb = alb; ball.mat = mat; screen.sphere(ball, sun, { stripe: false }); }
function flashAt(gx, gy){
  let v = 0;
  for (const f of flashes){ const d = Math.hypot(cx(gx) - f.x, (cy(gy) - f.y) * 0.8) / (screen.ch * 10 * f.size); if (d < 1) v += (f.t / 0.5) * (1 - d) * 1.2; }
  return v;
}
// Far mountains and nearer hills scroll slower than the ground, for depth.
const farH = x => 28 - Math.round(3 * Math.sin(x * 0.045) + 2 * Math.sin(x * 0.13 + 1) + 1.5 * Math.abs(Math.sin(x * 0.29)));
const hillH = x => 33 - Math.round(2 * Math.sin(x * 0.07 + 3) + 1.3 * Math.sin(x * 0.19));
function drawLand(t){
  const fx = Math.floor(scroll * 0.12), hx = Math.floor(scroll * 0.35), lit = flashes.length > 0;
  for (let c = 0; c < GW; c++){
    const fTop = farH(c + fx), hTop = hillH(c + hx), g = gr[c], pit = craterAt(sc + c);
    for (let r = 2; r < GH; r++){
      let rgb, v, layer = 0, glyph = 0;
      if (r >= g){   // the ground: lit from the left on rising slopes, darker with depth
        const slope = (gr[Math.max(0, c - 1)] - gr[Math.min(GW - 1, c + 1)]) * 0.15, depth = r - g;
        v = depth === 0 ? 0.55 + slope : Math.max(0.04, 0.24 - depth * 0.05); rgb = GROUND_RGB; layer = 1;
        if (pit && depth <= 1){ rgb = HAZARD_RGB; v = depth === 0 ? 0.85 : 0.5; glyph = 35; }   // a crater's rim and floor, solid and red
      } else if (r >= hTop){ v = r === hTop ? 0.2 : 0.05; rgb = HILL_RGB; }
      else if (r >= fTop){ v = r === fTop ? 0.16 : 0.035; rgb = FAR_RGB; }
      else continue;
      const f = lit ? flashAt(c, r) : 0;
      put(c, r, [rgb[0] * v + FLASH[0] * f * 0.5, rgb[1] * v + FLASH[1] * f * 0.5, rgb[2] * v + FLASH[2] * f * 0.5], 1, layer, glyph);
    }
  }
  for (const s of stars) if (s.y < farH(s.x + fx)){ const v = 0.07 + 0.05 * Math.sin(t * 0.0015 + s.ph); put(s.x, s.y, [v, v, v * 1.3], 1, 0, 46); }
  litBall(cx(GW - 18), cy(9), screen.ch * 3.2, [0.15, 0.35, 0.75], PART);   // a planet in the sky, lit from the side
}
function drawCourse(t){
  for (const f of features){
    const c = f.x - sc; if (c > GW + 2) break; if (c + f.w < -2) continue;
    if (f.type === "rock"){   // solid red, lighter on top, so it reads as danger in every display mode
      const g = groundAt(f.x), art = f.h > 1 ? [" @ ", "@@@"] : ["@@"];
      art.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== " ") put(c + dx, g - art.length + dy, HAZARD_RGB, dy === 0 ? 1 : 0.75, 3, 64); });
    }
    else if (f.type === "mine") put(c, groundAt(f.x) - 1, BOMB_RGB, 0.85 + 0.25 * Math.sin(t * 0.012), 3, 42);   // pulses, but never goes dim
  }
  for (let k = reached; k <= reached + 1; k++){   // checkpoint posts with their letter
    const c = postX(k) - sc; if (c < -3 || c > GW + 3) continue;
    const g = groundAt(postX(k));
    for (let r = g - 4; r < g; r++) put(c, r, DIM, 1.4, 3, 124);
    text(c - 1, g - 6, "[" + letter(k) + "]", k <= reached ? DIM : ACCENT);
  }
}
function drawRover(t){
  const x = Math.floor(bxs()), top = Math.round(Math.min(...wy)) - 2;
  sprite(ROVER, x, top, ROVER_RGB, 1, 3);
  WHEELS.forEach((w, i) => put(x + w, Math.round(wy[i]), WHEEL_RGB, 1, 3, "O0Oo"[((scroll + w) * 2 | 0) & 3].charCodeAt(0)));
}
function drawTitle(){
  [["ROVER", 7], ["PATROL", 14]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((GW - word.length * 12 + 2) / 2);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#")
      for (const k of [0, 1]) put(x0 + li * 12 + dx * 2 + k, y0 + dy, wi ? ROVER_RGB : UFO_RGB.saucer, 1.2, 3, 35); }));
  });
  const blink = (performance.now() / 500 | 0) % 2;
  center(21, pad.touch ? "PRESS A OR START" : "PRESS SPACE TO START", blink ? WHITE : DIM);
  center(23, pad.touch ? "D-PAD LEFT/RIGHT SPEED   A OR UP JUMP   B FIRE   SELECT MENU" : "LEFT/RIGHT SPEED   UP OR SPACE JUMP   X FIRE   ESC MENU", DIM);
  center(24, "JUMP CRATERS AND MINES. SHOOT ROCKS AHEAD AND UFOS ABOVE.", DIM);
  if (scores.list.length){
    center(27, "HIGH SCORES", ACCENT);
    scores.list.forEach((s, i) => center(28 + i, `${i + 1}. ${String(s.score).padStart(7)}   POINT ${s.point.padEnd(2)}`, i ? DIM : WHITE));
  }
}
function draw(t){
  screen.clear();
  drawLand(t);
  for (const b of world.bodies) screen.sphere(b, sun, { stripe: false });
  if (state === "title"){ drawRover(t); drawTitle(); drawMenu(); screen.render(ctx); return; }
  drawCourse(t);
  if (state === "play") drawRover(t);
  for (const u of ufos) sprite(u.kind === "bomber" ? BOMBER : SAUCER, Math.round(u.x), Math.round(u.y), UFO_RGB[u.kind], 1, 3);
  for (const b of bombs) put(Math.floor(b.x) - sc, Math.round(b.y), BOMB_RGB, 1, 3, b.big ? 64 : 111);
  for (const s of fShots) put(Math.floor(s.x) - sc, s.y, SHOT_RGB, 1, 3, 45);
  for (const s of uShots) put(s.x - sc, Math.round(s.y), SHOT_RGB, 1, 3, 124);
  // HUD: score and lives on the left, the course A..Z in the middle, time on the right
  text(1, 0, "SCORE " + String(score).padStart(6, "0"), WHITE);
  text(1, 1, "HI    " + String(Math.max(score, scores.list[0] ? scores.list[0].score : 0)).padStart(6, "0"), DIM);
  text(GW - 18, 0, "LIVES " + "^".repeat(Math.max(0, lives - (state === "dead" ? 1 : 0))), ROVER_RGB);
  text(GW - 18, 1, "TIME  " + String(Math.floor(pointT)).padStart(3), DIM);
  const x0 = Math.floor((GW - 51) / 2), here = reached % 26;
  for (let k = 0; k < 26; k++) put(x0 + k * 2, 0, k === here ? ACCENT : k < here ? WHITE : DIM, 1, TEXT_LAYER, 65 + k);
  if (state === "over"){
    center(16, "  GAME OVER  ", WHITE);
    center(18, `  ${score} POINTS  `, ACCENT);
    if (best) center(20, "  NEW HIGH SCORE!  ", ACCENT);
    if (stateT > 1) center(22, pad.touch ? "  PRESS START  " : "  PRESS SPACE  ", DIM);
  } else if (msgT > 0) center(4, "  " + msg + "  ", WHITE);
  const hint = pad.touch ? " SELECT MENU " : " ESC MENU ";
  text(GW - 1 - hint.length, GH - 1, hint, DIM);
  drawMenu();
  screen.render(ctx);
}
function drawMenu(){
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(screen, { accent: ACCENT, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED" });
}

/* ---------- input ---------- */
const keys = { left: false, right: false };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
const JUMP_KEYS = new Set(["ArrowUp", "w", "W", " "]), FIRE_KEYS = new Set(["x", "X", "f", "F", "Control", "Enter"]);
let jumpQueued = false, fireHeld = false;
function action(){   // start from the title; back to the title from game over
  if (state === "title") newGame();
  else if (state === "over" && stateT > 1) toTitle();
}
function toTitle(){ state = "title"; features = []; world.bodies.length = 0; ufos = []; bombs = []; speed = CRUISE; }
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "title" ? "START GAME" : "RESTART", select: () => { menu.hide(); audio.unlock(); newGame(); } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "CONTROLS", value: () => pad.touch ? "TOUCH" : "KEYBOARD", change: () => pad.toggle() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { for (const k in keys) keys[k] = false; fireHeld = false; audio.pause(); },
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
  if (JUMP_KEYS.has(e.key)) jumpQueued = true;
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; if (FIRE_KEYS.has(e.key)) fireHeld = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; fireHeld = false; });

const pad = createPad({ store, menu: () => menu.open && menu, onAny: () => audio.unlock(),
  onDir: d => { if (d === "up" && state === "play") jumpQueued = true; keys.left = d === "left"; keys.right = d === "right"; },
  onPress: id => {
    if (id === "select") return menu.show();
    if (state === "title" || state === "over"){ if (id === "a" || id === "start") action(); return; }
    if (id === "start") return menu.show();
    if (id === "a") jumpQueued = true; else fireHeld = true;
  },
  onRelease: id => { if (id === "b") fireHeld = false; } });
cv.addEventListener("pointerdown", e => {
  audio.unlock();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!pad.touch) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
function tick(dt, t){
  if (screen && !menu.open){   // the open menu pauses everything
    if (state === "title"){   // the rover drives along an empty course behind the title
      scrollBy(10 * dt); for (let i = 0; i < 3; i++) wy[i] += (groundAt(bx() + WHEELS[i]) - 1 - wy[i]) * Math.min(1, dt * 30);
    } else update(dt);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life) b.life -= dt;
    world.bodies = world.bodies.filter(b => !(b.life < 0));
  }
  if (screen) draw(t);
}
layout();
computeGround(); for (let i = 0; i < 3; i++) wy[i] = groundAt(bx() + WHEELS[i]) - 1;
onResize(stage, () => { layout(); computeGround(); });
startLoop(tick);
})();
