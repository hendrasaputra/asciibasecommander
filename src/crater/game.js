(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a fixed character grid; the ground is an engine terrain grid of the same cells. Shells and rubble are
// engine bodies on top. After every blast, unsupported dirt falls down a cell at a time until the ground settles.
const GW = 100, GH = 56, WIN_ROUNDS = 2;
const TANK = [" /#\\ ", "(ooo)"], TW = 5, TH = 2;
const TANK_RGB = [[1.4, 0.9, 0.35], [0.45, 1.0, 1.45]];
const WEAPONS = [   // r: blast radius in rows; dmg: damage at the centre
  { name: "MISSILE",   r: 2.2, dmg: 45, ammo: Infinity },
  { name: "BIG SHOT",  r: 3.6, dmg: 65, ammo: 2 },
  { name: "MIRV",      r: 2.0, dmg: 35, ammo: 1, split: 5 },
  { name: "DIRT BOMB", r: 3.0, dmg: 0,  ammo: 2, dirt: true }
];
const GROUND_RGB = [[0.42, 0.55, 0.22], [0.55, 0.37, 0.2], [0.36, 0.3, 0.3]];   // topsoil, dirt, rock
const SUN = ["  ___  ", " /###\\ ", "|#####|", " \\###/ "], SUN_X = GW - 16, SUN_Y = 3;
const SHELL_RGB = [1.8, 1.7, 1.2], FLASH = [1.8, 0.9, 0.4], WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6];
const DIRT = { name: "dirt", density: 1.2, e: 0.15, mu: 0.9, kd: 0.9, ks: 0.1, shine: 6 };
const METAL = { name: "metal", density: 2, e: 0.4, mu: 0.4, kd: 0.6, ks: 0.9, shine: 40 };
const FONT = {   // 5x5 block letters for the title, drawn two cells wide per dot
  C: [".####", "#....", "#....", "#....", ".####"], R: ["####.", "#...#", "####.", "#..#.", "#...#"],
  A: [".###.", "#...#", "#####", "#...#", "#...#"], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  E: ["#####", "#....", "####.", "#....", "#####"], D: ["####.", "#...#", "#...#", "#...#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", ".###."], L: ["#....", "#....", "#....", "#....", "#####"]
};

/* ---------- sound: Crater Duel's own effects (CRATER_SFX, made by audio/crater-sfx.py) ---------- */
// Browsers only allow audio after a user gesture, so nothing is decoded until the first key or tap.
const MUTE_KEY = "craterDuel.v1.muted";
let actx = null, sfxBus = null, buffers = {}, unlocked = false, muted = false, waiting = null;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e){}
function unlockAudio(){
  if (unlocked) return;
  unlocked = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC){ console.warn("Crater Duel: Web Audio not supported, playing silent"); return; }
  actx = new AC(); sfxBus = actx.createGain(); sfxBus.gain.value = muted ? 0 : 0.9; sfxBus.connect(actx.destination);
  for (const [k, v] of Object.entries(CRATER_SFX)) actx.decodeAudioData(Uint8Array.from(atob(v), c => c.charCodeAt(0)).buffer,
    b => { buffers[k] = b; if (k === waiting){ waiting = null; sfx(k); } }, e => console.warn("Crater Duel: could not decode sound", k, e));
}
function sfx(name, vol = 1){
  if (muted) return;
  const b = buffers[name];
  if (!b){ if (actx) waiting = name; return; }   // the first tap starts the game before decoding finishes: play it once ready
  const src = actx.createBufferSource(), g = actx.createGain(); src.buffer = b; g.gain.value = vol;
  src.connect(g); g.connect(sfxBus); src.start();
}
function toggleMute(){
  unlockAudio(); muted = !muted;
  if (sfxBus) sfxBus.gain.setTargetAtTime(muted ? 0 : 0.9, actx.currentTime, 0.02);
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e){ console.warn("Crater Duel: could not save sound setting", e); }
}

const D = defaultDisplay(); D.room = 0.28; D.glow = 0.25; D.lampRGB = [1.0, 0.72, 0.45];   // the low sun is the lamp: warm light
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
const world = new World(); world.openTop = true;   // high shots arc above the screen and come back down
const sunLight = { x: 0, y: 0, z: 0, on: true };
let screen = null, stars = [], mode = "cpu", state = "title", stateT = 0;
let ground = null, tanks = [], turn = 0, wins = [0, 0], wind = 0, shells = [], trail = [], lastTrail = [[], []];
let blasts = [], roundStarter = 0, msg = "", msgT = 0, cpu = null, plan = null, settleT = 0;
// Power comes from holding the fire button: the meter runs 0 -> 100 -> 0 while held, and letting go fires.
const CHARGE_SECS = 1.1;   // time for the meter to fill once
let charge = null, lastPower = [null, null];   // charge: seconds held, or null when not charging
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCpu = i => mode === "cpu" && i === 1;
const name = i => isCpu(i) ? "COMPUTER" : "PLAYER " + (i + 1);
const vmax = () => Math.sqrt(1.3 * world.w * world.g.y);   // full power at 45 degrees carries about 1.3 screens on flat ground

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
  sunLight.x = cx(SUN_X + 3); sunLight.y = cy(SUN_Y + 2); sunLight.z = screen.ch * 14;
  if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const b of world.bodies){ b.x *= kx; b.y *= ky; b.r *= kx; if (b.box){ b.hw *= kx; b.hh *= kx; } }
    for (const p of [...trail, ...lastTrail[0], ...lastTrail[1]]){ p.x *= kx; p.y *= ky; } }
  stars = Array.from({ length: 80 }, () => ({ x: 1 + Math.floor(Math.random() * (GW - 2)), y: 2 + Math.floor(Math.random() * 20), ph: Math.random() * 6.283 }));
}

/* ---------- the ground ---------- */
// Rolling hills from three random waves. Each cell remembers its layer (topsoil, dirt, rock) so falling dirt keeps its colour.
function makeGround(){
  const solid = new Uint8Array(GW * GH), layer = new Uint8Array(GW * GH);
  const waves = [0, 1, 2].map(i => ({ a: [7, 4, 2][i] * (0.6 + Math.random() * 0.8), f: [0.04, 0.09, 0.21][i] * (0.7 + Math.random() * 0.6), p: Math.random() * 6.283 }));
  const base = GH * (0.55 + Math.random() * 0.12);
  for (let c = 0; c < GW; c++){
    const top = Math.round(clamp(base + waves.reduce((t, w) => t + w.a * Math.sin(c * w.f + w.p), 0), 16, GH - 6));
    for (let r = top; r < GH; r++){ solid[r * GW + c] = 1; layer[r * GW + c] = r - top < 2 ? 0 : r - top < 9 ? 1 : 2; }
  }
  return { solid, layer };
}
const surface = c => { for (let r = 0; r < GH; r++) if (ground.solid[r * GW + c]) return r; return GH; };
function newMatch(){ wins = [0, 0]; roundStarter = 0; newRound(); }
function newRound(){
  world.bodies.length = 0; world.forces.length = 0; blasts = []; shells = []; trail = []; lastTrail = [[], []];
  ground = makeGround();
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: ground.solid, mat: DIRT };
  wind = Math.round((Math.random() * 10 - 5) * (Math.random() < 0.33 ? 2 : 1));
  world.g = { x: wind * world.h * 0.012, y: world.h * 0.9 };   // wind is sideways gravity
  tanks = [8 + Math.floor(Math.random() * 14), GW - 13 - Math.floor(Math.random() * 14)].map((x, i) => {
    // level a pad under the tank so it starts sitting flat
    const top = Math.min(...Array.from({ length: TW }, (_, k) => surface(x + k)));
    for (let k = 0; k < TW; k++) for (let r = 0; r < GH; r++){ const j = r * GW + x + k; ground.solid[j] = r >= top ? 1 : 0; if (r >= top && r < top + 2) ground.layer[j] = 0; }
    return { x, y: top - TH, angle: i ? 120 : 60, power: 55, hp: 100, ammo: WEAPONS.map(w => w.ammo), weapon: 0, dead: false, fallT: 0, fallen: 0 };
  });
  cpu = null;
  turn = roundStarter; roundStarter ^= 1;
  sfx("round");
  startTurn();
}
function startTurn(){
  if (tanks.filter(T => !T.dead).length <= 1) return endRound();   // checked here, so no path can start a turn after the round is decided
  if (tanks[turn].dead) turn ^= 1;
  trail = []; stateT = 0; charge = null;
  state = isCpu(turn) ? "cpu" : "aim";
  if (state === "cpu") plan = planShot(turn);
  say(name(turn) + "'S TURN", 1.2);
}
function say(text, secs){ msg = text; msgT = secs; }
function endRound(){
  const w = tanks.findIndex(T => !T.dead);
  if (w >= 0) wins[w]++;
  say(w >= 0 ? name(w) + " WINS THE ROUND" : "BOTH TANKS DESTROYED", 2.4);
  state = "roundover"; stateT = 0;
}

/* ---------- computer opponent: a ballistic first guess, then corrects power from where the last shot landed ---------- */
function planShot(i){
  const me = tanks[i], foe = tanks[1 - i], dx = cx(foe.x) - cx(me.x), dist = Math.abs(dx);
  if (!cpu){
    const lift = 40 + Math.random() * 25, th = lift * Math.PI / 180, v = Math.sqrt(dist * world.g.y / Math.sin(2 * th));
    cpu = { angle: dx > 0 ? lift : 180 - lift, power: clamp(v / vmax() * 100 * (0.85 + Math.random() * 0.3), 10, 100), err: null };
  } else if (cpu.err !== null){
    cpu.power = clamp(cpu.power * (1 - clamp(cpu.err, -0.6, 0.6) * 0.5) + (Math.random() - 0.5) * 4, 5, 100);
  }
  // once it is close, use the big guns while they last
  let weapon = 0;
  if (cpu.err !== null && Math.abs(cpu.err) < 0.12 && me.ammo[1] > 0) weapon = 1;
  else if (cpu.err !== null && Math.abs(cpu.err) < 0.25 && me.ammo[2] > 0) weapon = 2;
  return { angle: Math.round(cpu.angle), power: Math.round(cpu.power), weapon };
}

/* ---------- firing ---------- */
const muzzle = T => { const a = T.angle * Math.PI / 180; return [cx(T.x + 2) + Math.cos(a) * screen.cw * 3, cy(T.y) - Math.sin(a) * screen.ch * 1.5]; };
function addShell(x, y, vx, vy, w, owner){
  const b = world.add(x, y, screen.ch * 0.3, "steel", null, METAL);
  b.sensor = true;   // flies through everything; checkShells() decides what it hit
  b.vx = vx; b.vy = vy; b.weapon = w; b.owner = owner; b.age = 0;
  shells.push(b);
  return b;
}
function fire(i){
  const T = tanks[i], a = T.angle * Math.PI / 180, v = T.power / 100 * vmax(), [mx, my] = muzzle(T);
  if (T.ammo[T.weapon] !== Infinity) T.ammo[T.weapon]--;
  addShell(mx, my, Math.cos(a) * v, -Math.sin(a) * v, T.weapon, i);
  if (T.ammo[T.weapon] <= 0) T.weapon = 0;   // out of that weapon: back to missiles
  sfx("fire"); trail = []; state = "flight"; stateT = 0;
}
function inTank(T, gx, gy){ const dx = gx - T.x, dy = gy - T.y; return dy >= 0 && dy < TH && dx >= 0 && dx < TW && TANK[dy][dx] !== " "; }
// Runs after every physics substep, so a fast shell can't skip through a thin ridge between frames.
function checkShells(){
  if (state !== "flight") return;
  for (const b of shells.slice()){
    if (b.dead) continue;
    const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch);
    if (b.x <= b.r + 1 || b.x >= world.w - b.r - 1){ b.dead = true; b.landX = b.x; continue; }   // off the side: a miss
    const hitTank = tanks.some(T => !T.dead && (T !== tanks[b.owner] || b.age > 0.2) && inTank(T, gx, gy));
    if (hitTank || gy >= GH - 1 || (gy >= 0 && gx >= 0 && gx < GW && ground.solid[gy * GW + gx])){
      b.dead = true; b.landX = b.x; explode(b.x, b.y, WEAPONS[b.weapon]);
    }
  }
}
function finishFlight(){
  const i = turn, me = tanks[i], foe = tanks[1 - i], landed = shells.filter(b => b.landX !== undefined);
  if (isCpu(i) && cpu && landed.length){   // how far past (or short of) the target it went, as a share of the distance
    const landX = landed.reduce((t, b) => t + b.landX, 0) / landed.length, dir = Math.sign(cx(foe.x) - cx(me.x)) || 1;
    const dist = Math.abs(cx(foe.x) - cx(me.x)), went = (landX - cx(me.x)) * dir;
    cpu.err = (went - dist) / dist;
    if (landed.some(b => b.landX <= b.r + 1 || b.landX >= world.w - b.r - 1)) cpu.err = Math.max(cpu.err, 0.4);   // off the edge: it went further
  }
  lastTrail[i] = trail;
  for (const b of shells){ const k = world.bodies.indexOf(b); if (k >= 0) world.bodies.splice(k, 1); }
  shells = [];
  state = "settle"; stateT = 0; settleT = 0;
}

/* ---------- blasts ---------- */
// A blast clears (or, for a dirt bomb, fills) the cells in its radius, throws some as rubble, shoves loose debris,
// and damages tanks by distance. Afterwards the ground settles.
function explode(x, y, W){
  const R = W.r * screen.ch;
  blasts.push({ x, y, t: 0.45, big: W.r > 3 });
  sfx(W.dirt ? "dirt" : W.r > 3 ? "bigboom" : "boom");
  const c0 = Math.max(0, Math.floor((x - R) / screen.cw)), c1 = Math.min(GW - 1, Math.floor((x + R) / screen.cw));
  const r0 = Math.max(0, Math.floor((y - R) / screen.ch)), r1 = Math.min(GH - 1, Math.floor((y + R) / screen.ch));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
    const i = r * GW + c, dx = cx(c) - x, dy = cy(r) - y, d = Math.hypot(dx, dy);
    if (d > R) continue;
    if (W.dirt){ if (!ground.solid[i]){ ground.solid[i] = 1; ground.layer[i] = 1; } continue; }
    if (!ground.solid[i]) continue;
    if (Math.random() < 0.35){
      const b = world.addBox(cx(c), cy(r), screen.cw * 0.45, screen.ch * 0.38, "dirt", GROUND_RGB[ground.layer[i]], DIRT), sp = 150 + Math.random() * 350;
      b.vx = dx / (d || 1) * sp; b.vy = dy / (d || 1) * sp - 150; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 3 + Math.random() * 2;
    }
    ground.solid[i] = 0;
  }
  if (!W.dirt) world.forces.push({ x, y, radius: R * 2.2, strength: world.h * 60, t: 0.08 });
  tanks.forEach((T, k) => {   // full damage near the centre, none beyond 1.6 radii
    if (T.dead || !W.dmg) return;
    const d = Math.hypot(cx(T.x + 2) - x, (cy(T.y) + screen.ch / 2 - y)) / R;
    if (d < 1.6) hurt(k, Math.round(W.dmg * clamp(1.6 - d, 0, 1)));
  });
}
function hurt(k, amount){
  const T = tanks[k];
  if (T.dead || amount <= 0) return;
  T.hp = Math.max(0, T.hp - amount); T.flash = 0.3;
  if (T.hp > 0){ sfx("clang"); return; }
  T.dead = true; sfx("destroyed");
  const tx = cx(T.x + 2), ty = cy(T.y);
  for (let n = 0; n < 18; n++){
    const a = Math.random() * 6.283, sp = 150 + Math.random() * 450, b = world.add(tx, ty, screen.cw * (0.5 + Math.random() * 0.3), "steel", TANK_RGB[k].map(v => v * 0.6), METAL);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 250; b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = b.r;
  }
  blasts.push({ x: tx, y: ty, t: 0.45, big: true });
}
// Unsupported dirt drops one cell per pass, bottom-up, so whole columns slide down together. Returns true if anything moved.
function settleGround(){
  const { solid, layer } = ground; let moved = false;
  for (let r = GH - 2; r >= 0; r--) for (let c = 0; c < GW; c++){
    const i = r * GW + c, j = i + GW;
    if (solid[i] && !solid[j]){ solid[j] = 1; layer[j] = layer[i]; solid[i] = 0; moved = true; }
  }
  return moved;
}

/* ---------- update ---------- */
function update(dt){
  stateT += dt; msgT -= dt;
  let falling = false;
  tanks.forEach((T, k) => {   // a tank with nothing under it drops; long falls hurt
    if (T.dead) return;
    T.flash = Math.max(0, (T.flash || 0) - dt);
    let held = T.y + TH >= GH;
    for (let c = T.x; c < T.x + TW && !held; c++) if (ground.solid[(T.y + TH) * GW + c]) held = true;
    if (!held){ falling = true; if ((T.fallT -= dt) <= 0){ T.y++; T.fallen++; T.fallT = 0.04; } }
    else if (T.fallen){ if (T.fallen > 2) hurt(k, (T.fallen - 2) * 3); T.fallen = 0; }
  });
  if (state === "aim"){
    const T = tanks[turn];
    T.angle = clamp(T.angle + ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * 50 * dt, 0, 180);
    if (charge !== null){ charge += dt; const c = (charge / CHARGE_SECS) % 2; T.power = clamp(Math.round((c < 1 ? c : 2 - c) * 100), 1, 100); }
  } else if (state === "cpu"){   // sweep the aim towards the plan, so the player sees it think
    const T = tanks[turn], k = Math.min(1, dt * 3);
    T.angle += (plan.angle - T.angle) * k; T.power += (plan.power - T.power) * k;
    if (stateT > 1.3){ T.angle = plan.angle; T.power = plan.power; T.weapon = plan.weapon; fire(turn); }
  } else if (state === "flight"){
    for (const b of shells){
      b.age += dt;
      const W = WEAPONS[b.weapon];
      if (!b.falling && b.vy > 0){   // the top of the arc: the whistle starts, and a MIRV splits
        b.falling = true; sfx("whistle");
        if (W.split && !b.child && !b.dead){
          b.dead = true; sfx("split");
          for (let n = 0; n < W.split; n++){ const c = addShell(b.x, b.y, b.vx + (n - (W.split - 1) / 2) * screen.cw * 6, b.vy, b.weapon, b.owner); c.child = true; c.falling = true; }
        }
      }
    }
    const lead = shells.find(b => !b.dead); if (lead){ trail.push({ x: lead.x, y: lead.y }); if (trail.length > 400) trail.shift(); }
    if (shells.every(b => b.dead) || stateT > 14) finishFlight();
  } else if (state === "settle"){
    if ((settleT -= dt) <= 0){ settleT = 0.02; if (settleGround()) stateT = Math.min(stateT, 0.3); }   // keep waiting while dirt is still falling
    if (stateT > 0.8 && !falling){ turn ^= 1; startTurn(); }
  } else if (state === "roundover" && stateT > 2.6){
    if (Math.max(...wins) >= WIN_ROUNDS){
      state = "over"; stateT = 0;
      const w = wins[0] > wins[1] ? 0 : 1; sfx(isCpu(w) ? "lose" : "win");
    } else newRound();
  }
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, TEXT_LAYER, s.charCodeAt(i)); }   // stays letters in pixel mode
const center = (gy, s, rgb) => text(Math.floor((GW - s.length) / 2), gy, s, rgb);
function sprite(art, x, y, rgb, k, layer){ art.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== " ") put(x + dx, y + dy, rgb, k, layer, row.charCodeAt(dx)); }); }
function blastLight(gx, gy){   // warm light from recent blasts, falling off with distance
  let v = 0;
  for (const B of blasts){ const d = Math.hypot(cx(gx) - B.x, (cy(gy) - B.y) * 0.8) / (screen.ch * (B.big ? 16 : 11)); if (d < 1) v += (B.t / 0.45) * (1 - d) * 1.4; }
  return v;
}
const GRAIN = [58, 59, 37, 58, 35, 59, 58, 37];   // : ; % # mixed by position, so the ground looks granular
function drawGround(){
  const { solid, layer } = ground, dim = state === "title" ? 0.45 : 1;
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++){
    const i = r * GW + c; if (!solid[i]) continue;
    const top = r === 0 || !solid[i - GW], base = GROUND_RGB[layer[i]], f = blasts.length ? blastLight(c, r) : 0;
    const k = (top ? 1.0 : 0.55 - Math.min(0.25, (layer[i] === 2 ? 0.15 : 0))) * dim;
    put(c, r, [base[0] * k + FLASH[0] * f * 0.4, base[1] * k + FLASH[1] * f * 0.4, base[2] * k + FLASH[2] * f * 0.4], 1, 1, top ? 61 : GRAIN[(c * 7 + r * 3) & 7]);
  }
  for (const B of blasts){   // the flash also lights the air around it
    const gx = Math.floor(B.x / screen.cw), gy = Math.floor(B.y / screen.ch), v = B.t / 0.45, rx = B.big ? 16 : 12, ry = rx >> 1;
    for (let r = gy - ry; r <= gy + ry; r++) for (let c = gx - rx; c <= gx + rx; c++){
      const d = Math.hypot((c - gx) / rx, (r - gy) / ry); if (d >= 1 || c < 0 || r < 0 || c >= GW || r >= GH) continue;
      const a = v * (1 - d) * 0.25; screen.add(r * GW + c, FLASH[0] * a, FLASH[1] * a, FLASH[2] * a);
    }
  }
}
function drawTank(T, k){
  const hot = T.flash > 0, glow = hot ? 2 : k === turn && state !== "roundover" ? 1.15 : 0.85;
  sprite(TANK, T.x, T.y, hot ? WHITE : TANK_RGB[k], glow, 3);
  const a = T.angle * Math.PI / 180, glyph = T.angle < 22.5 || T.angle > 157.5 ? 45 : T.angle < 67.5 ? 47 : T.angle < 112.5 ? 124 : 92;   // - / | \
  for (let n = 1; n <= 2; n++) put(Math.round(T.x + 2 + Math.cos(a) * n * 1.5), Math.round(T.y - Math.sin(a) * n * 0.75), TANK_RGB[k], glow, 3, glyph);
}
function drawTitle(){
  for (let r = 25; r <= 32; r++) for (let c = 8; c < GW - 8; c++) put(c, r, WHITE, 1, 3, 32);   // a dark panel behind the menu
  [["CRATER", 10], ["DUEL", 17]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((GW - word.length * 12 + 2) / 2);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#")
      for (const k of [0, 1]) put(x0 + li * 12 + dx * 2 + k, y0 + dy, TANK_RGB[wi], 1.3, 3, 35); }));
  });
  const blink = (performance.now() / 500 | 0) % 2;
  center(27, (touchMode ? "A" : "1") + "  ONE PLAYER (VS COMPUTER)     " + (touchMode ? "B" : "2") + "  TWO PLAYERS", blink ? WHITE : DIM);
  center(29, touchMode ? "D-PAD LEFT/RIGHT AIM.  HOLD A FOR POWER, LET GO TO FIRE.  B WEAPON" : "LEFT/RIGHT AIM  HOLD SPACE FOR POWER, LET GO TO FIRE  TAB WEAPON  ESC MENU", DIM);
  center(31, "LAST TANK STANDING WINS THE ROUND. FIRST TO " + WIN_ROUNDS + " ROUNDS.", DIM);
}
function draw(t){
  screen.clear();
  for (const s of stars){ const v = 0.05 + 0.04 * Math.sin(t * 0.0015 + s.ph); put(s.x, s.y, [v, v, v * 1.3], 1, 0, 46); }
  sprite(SUN, SUN_X, SUN_Y, [1.8, 0.85, 0.35], 1, 2);
  if (ground) drawGround();
  for (const b of world.bodies) if (!b.sensor) screen.sphere(b, sunLight, { stripe: false });
  if (state === "title"){ drawTitle(); drawMenu(); screen.render(ctx); return; }
  tanks.forEach((T, k) => { if (!T.dead) drawTank(T, k); });
  if (state === "aim" || state === "cpu"){   // your last shot, faintly, and an aim guide whose length shows power
    const T = tanks[turn], a = T.angle * Math.PI / 180;
    for (const p of lastTrail[turn]) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), TANK_RGB[turn], 0.18, 0, 46);
    const n = 2 + Math.round(T.power / 14);
    for (let k = 3; k <= n + 2; k++) put(Math.round(T.x + 2 + Math.cos(a) * k * 1.5), Math.round(T.y - Math.sin(a) * k * 0.75), TANK_RGB[turn], k === n + 2 ? 1.3 : 0.5, 3, k === n + 2 ? 43 : 46);
  }
  for (const p of trail) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), SHELL_RGB, 0.22, 0, 46);
  for (const b of shells) if (!b.dead){
    const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch);
    put(gx, Math.max(gy, 3), SHELL_RGB, gy >= 3 ? 1 : 0.8, 3, gy >= 3 ? 42 : 94);   // above the HUD: a ^ shows where it will come down
  }
  // HUD: health on each side, wind in the middle, the active player's aim and weapon below
  for (let i = 0; i < 2; i++){
    const T = tanks[i], s = `${name(i)}  HP ${String(T.hp).padStart(3)}  ROUNDS ${wins[i]}`;
    text(i === 0 ? 1 : GW - 1 - s.length, 0, s, T.dead ? DIM : TANK_RGB[i]);
  }
  center(1, "WIND " + (wind === 0 ? "CALM" : wind < 0 ? "<".repeat(Math.min(5, Math.ceil(-wind / 2))) + " " + -wind : wind + " " + ">".repeat(Math.min(5, Math.ceil(wind / 2)))), WHITE);
  if (state !== "over" && tanks[turn] && !tanks[turn].dead){
    const T = tanks[turn], W = WEAPONS[T.weapon], ammo = T.ammo[T.weapon] === Infinity ? "" : " x" + T.ammo[T.weapon];
    center(2, `ANGLE ${String(Math.round(T.angle)).padStart(3)}   POWER ${String(Math.round(T.power)).padStart(3)}   ${W.name}${ammo}`, TANK_RGB[turn]);
  }
  if (state === "aim" || state === "cpu"){   // power meter, with a | where your last shot was
    const T = tanks[turn], M = 30, fill = Math.round(T.power / 100 * M), lp = lastPower[turn], x0 = Math.floor((GW - M) / 2);
    for (let k = 0; k < M; k++){
      const mark = lp !== null && k === Math.min(M - 1, Math.round(lp / 100 * M));
      put(x0 + k, 3, mark ? WHITE : TANK_RGB[turn], k < fill ? 1.2 : mark ? 0.9 : 0.25, 3, mark ? 124 : k < fill ? 35 : 46);
    }
    if (state === "aim" && charge === null && msgT <= 0) center(4, touchMode ? "HOLD A FOR POWER, LET GO TO FIRE" : "HOLD SPACE FOR POWER, LET GO TO FIRE", DIM);
  }
  if (state === "over"){
    const w = wins[0] > wins[1] ? 0 : 1;
    center(9, `  ${name(w)} WINS ${wins[w]}-${wins[1 - w]}  `, TANK_RGB[w]);
    center(11, touchMode ? "  PRESS START FOR A NEW MATCH  " : "  PRESS SPACE FOR A NEW MATCH  ", WHITE);
  } else if (msgT > 0) center(9, "  " + msg + "  ", WHITE);
  const hint = touchMode ? " SELECT MENU " : " ESC MENU ";
  text(GW - 1 - hint.length, GH - 1, hint, DIM);
  drawMenu();
  screen.render(ctx);
}
function drawMenu(){
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw({ text: (x, y, str, rgb) => { for (let i = 0; i < str.length; i++) put(x + i, y, rgb, 1, MENU_LAYER, str.charCodeAt(i)); }, GW, GH, accent: TANK_RGB[0], normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "MODE APPLIES TO THE NEXT MATCH" });
}

/* ---------- input ---------- */
const keys = { up: false, down: false, left: false, right: false };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right" };
let nextMode = mode;   // the menu's Mode choice; it takes over when a new match starts
function start(m){ mode = nextMode = m; newMatch(); }
function action(){   // start or continue from the title and win screens
  if (state === "title") start("cpu");
  else if (state === "over") state = "title";
}
function press(){ if (state === "aim"){ if (charge === null){ charge = 0; tanks[turn].power = 1; } } else action(); }   // Space, A down
function release(){   // Space, A up: fire with the power on the meter
  if (state !== "aim" || charge === null) return;
  charge = null; lastPower[turn] = tanks[turn].power; fire(turn);
}
// The pause menu (src/menu.js) holds what the old button row did. Open it with Esc or P, SELECT, or a mouse click.
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: "NEW MATCH", select: () => { menu.hide(); unlockAudio(); start(nextMode); } },
  { label: "MODE", value: () => nextMode === "cpu" ? "VS COMPUTER" : "TWO PLAYERS", change: () => { nextMode = nextMode === "cpu" ? "two" : "cpu"; } },
  { label: "SOUND", value: () => muted ? "OFF" : "ON", change: () => toggleMute() },
  { label: "CONTROLS", value: () => touchMode ? "TOUCH" : "KEYBOARD", change: () => setControls(!touchMode, true) },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { charge = null; for (const k in keys) keys[k] = false; if (actx) actx.suspend(); },   // opening cancels a charge
  onClose: () => { if (actx) actx.resume(); }
});
function nextWeapon(){   // cycle to the next weapon that still has ammo
  if (state !== "aim") return;
  const T = tanks[turn];
  for (let n = 1; n <= WEAPONS.length; n++){ const w = (T.weapon + n) % WEAPONS.length; if (T.ammo[w] > 0){ T.weapon = w; break; } }
  sfx("switch");
}
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.key === " " || e.key === "Tab") e.preventDefault();
  if (e.repeat) return;
  if (e.key === "Escape" || e.key === "p" || e.key === "P"){ unlockAudio(); return menu.show(); }
  if (e.key === "m" || e.key === "M") return toggleMute();
  unlockAudio();
  if (state === "title" && (e.key === "1" || e.key === "2")) return start(e.key === "1" ? "cpu" : "two");
  if (e.key === " " || e.key === "Enter") press();
  if (e.key === "Tab" || e.key === "q" || e.key === "Q" || e.key === "e" || e.key === "E") nextWeapon();
  if (e.key === "r" || e.key === "R") start(nextMode);
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; if (e.key === " " || e.key === "Enter") release(); });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; charge = null; });   // leaving the window cancels a charge

const CTRL_KEY = "craterDuel.v1.controls";
let touchMode = matchMedia("(pointer: coarse)").matches;   // default follows the device; the Controls button overrides it
try { const c = localStorage.getItem(CTRL_KEY); if (c) touchMode = c === "touch"; } catch (e){}
function setControls(touch, save){
  touchMode = touch; document.body.classList.toggle("touch", touch); $("gamepad").hidden = !touch;
  if (save) try { localStorage.setItem(CTRL_KEY, touch ? "touch" : "keyboard"); } catch (e){ console.warn("Crater Duel: could not save controls setting", e); }
}
setControls(touchMode, false);
const buzz = () => navigator.vibrate && navigator.vibrate(8);
// The D-pad is one surface; the thumb's offset from the centre picks the direction, so sliding switches it.
const dpad = $("dpad");
function dpadAt(e){
  const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const dir = Math.hypot(dx, dy) < r.width * 0.1 ? "" : Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
  const changed = dir !== (dpad.dataset.dir || "");
  if (changed){ dpad.dataset.dir = dir; if (dir) buzz(); }
  if (menu.open){ if (changed && dir) dir === "up" ? menu.move(-1) : dir === "down" ? menu.move(1) : menu.change(dir === "left" ? -1 : 1); return; }   // in the menu: one step per push
  for (const k in keys) keys[k] = k === dir;
}
dpad.addEventListener("pointerdown", e => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); unlockAudio(); dpadAt(e); });
dpad.addEventListener("pointermove", e => { if (dpad.hasPointerCapture(e.pointerId)) dpadAt(e); });
for (const ev of ["pointerup", "pointercancel"]) dpad.addEventListener(ev, () => { dpad.dataset.dir = ""; for (const k in keys) keys[k] = false; });
document.querySelectorAll("[data-pad]").forEach(b => {
  const id = b.dataset.pad;
  b.addEventListener("pointerdown", e => {
    e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); buzz();
    unlockAudio();
    if (menu.open){ id === "a" ? menu.choose() : menu.hide(); return; }   // in the menu: A chooses, any other button closes
    if (id === "select") return menu.show();
    if (state === "title" && (id === "a" || id === "b")) return start(id === "a" ? "cpu" : "two");
    if (id === "b") return nextWeapon();
    if (id === "start") return state === "title" || state === "over" ? action() : menu.show();
    press();
  });
  const up = () => { b.classList.remove("on"); if (id === "a") release(); };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
});
cv.addEventListener("pointerdown", e => {
  unlockAudio();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!touchMode) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
world.onSub = checkShells;
let last = performance.now(), nextFrame = 0;
const FRAME_MS = 1000 / 60;
function tick(t){
  requestAnimationFrame(tick);
  if (t < nextFrame - 1) return;   // run at most ~60 times a second, even on faster displays
  nextFrame = t - nextFrame > FRAME_MS ? t + FRAME_MS : nextFrame + FRAME_MS;
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
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
ground = makeGround();   // hills behind the title screen
world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: ground.solid, mat: DIRT };
let fitted = stage.getBoundingClientRect();
new ResizeObserver(() => {   // re-fit only for real size changes, not the mobile address bar sliding in and out
  const r = stage.getBoundingClientRect();
  if (Math.abs(r.width - fitted.width) < 1 && Math.abs(r.height - fitted.height) < fitted.height * 0.15) return;
  fitted = r; if (screen) layout();
}).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
