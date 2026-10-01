(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a fixed character grid; physics and light run in pixels on top of it.
const GW = 96, GH = 66, PY = GH - 4;   // playfield in cells; PY is the cannon's top row
const AW = 7, AH = 4;                   // alien sprite size
// Enemy types, two frames each. `from` is the first level they can appear in. Every enemy fires
// laser lines: rate multiplies fire rate, speed the laser speed, bomb is the chance a shot is a bomb.
const TYPES = [
  { name: "GRUNT",   from: 1, hp: 1, pts: 10, rate: 1,   speed: 1,   bomb: 0.1,  rgb: [0.55, 1.0, 0.3],
    art: [["  .-.  ", " (o o) ", " /)=(\\ ", "  ' '  "], ["  .-.  ", " (o o) ", " \\)=(/ ", " '   ' "]] },
  { name: "TROOPER", from: 1, hp: 1, pts: 15, rate: 1,   speed: 1,   bomb: 0.1,  rgb: [0.3, 0.8, 1.0],
    art: [["~[===]~", " (O.O) ", " /| |\\ ", " /   \\ "], ["~[===]~", " (O.O) ", " \\| |/ ", "  | |  "]] },
  { name: "SCOUT",   from: 1, hp: 1, pts: 20, rate: 1,   speed: 1.3, bomb: 0.05, rgb: [1.0, 0.3, 0.8],
    art: [["   ^   ", " <(o)> ", "<--+-->", "  / \\  "], ["   ^   ", " <(o)> ", "<--+-->", "  \\ /  "]] },
  { name: "GUNNER",  from: 2, hp: 2, pts: 30, rate: 1,   speed: 1,   bomb: 0.1,  rgb: [1.0, 0.9, 0.3], twin: true,
    art: [["\\--o--/", " <|=|> ", " [===] ", "  ^ ^  "], ["/--o--\\", " <|=|> ", " [===] ", "  ^ ^  "]] },
  { name: "TANK",    from: 3, hp: 3, pts: 40, rate: 0.8, speed: 1.5, bomb: 0.15, rgb: [1.0, 0.6, 0.2],
    art: [[" _____ ", "[#####]", "|@-=-@|", "d-----b"], [" _____ ", "[#####]", "|@-=-@|", "b-----d"]] },
  { name: "SEEKER",  from: 4, hp: 2, pts: 35, rate: 2,   speed: 1.2, bomb: 0.05, rgb: [0.8, 0.45, 1.0],
    art: [["  .V.  ", " (@@@) ", "(( + ))", "  `-'  "], ["  .V.  ", " (@@@) ", "(( x ))", "  '-`  "]] },
  { name: "BOMBER",  from: 6, hp: 4, pts: 60, rate: 1,   speed: 1,   bomb: 0.6,  rgb: [1.0, 0.35, 0.3],
    art: [["__/^\\__", "[ OOO ]", " \\_v_/ ", "  | |  "], ["__/^\\__", "[ ooo ]", " \\_v_/ ", "  ! !  "]] }
];
// Enemy fire is kept dim and emits no light: only the sun lights the scene, so attacks read as thin lines.
const WEAPONS = {   // speed in cells per second
  laser: { speed: 34, rgb: [1.0, 0.3, 0.25], glyph: 124 },
  bomb:  { speed: 16, rgb: [1.0, 0.75, 0.3], glyph: 111, blast: true }
};
const GUNS = [   // shots: [x offset, sideways cells per row]; delay scales the difficulty's fire delay
  { name: "BLASTER", top: "   |   ", delay: 1,    shots: [[0, 0]] },
  { name: "RAPID",   top: "  :|:  ", delay: 0.55, shots: [[0, 0]] },
  { name: "TWIN",    top: "  | |  ", delay: 0.6,  shots: [[-1, 0], [1, 0]] },
  { name: "TRIDENT", top: " \\ | / ", delay: 0.6,  shots: [[0, 0], [-2, -0.25], [2, 0.25]] },
  { name: "LANCE",   top: " |I I| ", delay: 0.5,  shots: [[-1, 0], [1, 0]], pierce: 3 },
  { name: "STORM",   top: "\\\\ | //", delay: 0.45, shots: [[0, 0], [-1, -0.2], [1, 0.2], [-3, -0.45], [3, 0.45]] }
];
const DROPS = { P: { rgb: [1.3, 1.0, 0.3] }, S: { rgb: [0.4, 1.4, 0.6] }, L: { rgb: [1.5, 0.4, 0.5] } };   // parts, shield repair, life
const CANNON_RGB = [1.4, 1.1, 0.5], CANNON_BASE = [" /###\\ ", "/=====\\"], CW = 7;
const SHIELD = ["   #####   ", "  #######  ", " ######### ", "####   ####"], SHIELD_RGB = [0.3, 0.9, 0.5], SHIELD_X = [14, 36, 60, 82];
const DIFF = {   // shot: alien shots per alien per second on level 1; step: seconds per fleet step
  easy:   { shot: 0.13, step: 0.60, fire: 0.15, lives: 4 },
  normal: { shot: 0.24, step: 0.48, fire: 0.20, lives: 3 },
  hard:   { shot: 0.39, step: 0.39, fire: 0.30, lives: 3 }
};
const DEBRIS = { name: "debris", density: 0.5, e: 0.5, mu: 0.5, kd: 0.9, ks: 0.6, shine: 24 };
const CRATE = { name: "crate", density: 1.5, e: 0.3, mu: 0.8, kd: 0.9, ks: 0.3, shine: 10 };
const SHOT_SPEED = 75, CANNON_SPEED = 33, PLANE_SPEED = 21;   // cells per second
const STORE = "baseCommander.v1.scores";
const FONT = {   // 7x7 block letters for the launch screen
  B: ["######.", "##...##", "##...##", "######.", "##...##", "##...##", "######."],
  A: [".#####.", "##...##", "##...##", "#######", "##...##", "##...##", "##...##"],
  S: [".######", "##.....", "##.....", ".#####.", ".....##", ".....##", "######."],
  E: ["#######", "##.....", "##.....", "######.", "##.....", "##.....", "#######"],
  C: [".######", "##.....", "##.....", "##.....", "##.....", "##.....", ".######"],
  O: [".#####.", "##...##", "##...##", "##...##", "##...##", "##...##", ".#####."],
  M: ["##...##", "###.###", "#######", "##.#.##", "##...##", "##...##", "##...##"],
  N: ["##...##", "###..##", "####.##", "##.####", "##..###", "##...##", "##...##"],
  D: ["######.", "##...##", "##...##", "##...##", "##...##", "##...##", "######."],
  R: ["######.", "##...##", "##...##", "######.", "##.##..", "##..##.", "##...##"]
};
const TITLE = [["BASE", 5], ["COMMANDER", 15]];   // word, top row

const D = defaultDisplay(); D.room = 0.3; D.glow = 0.2;
const world = new World(), sun = { on: false };   // lamp off: spheres fall back to the engine's fixed directional light
let screen = null, stars = [], diffKey = "normal", score = 0, lives = 3, level = 1, lv = null;
let state = "title", titleT = 0, fwT = 0, landed = new Set(), paused = false, deadT = 0, msg = "", msgT = 0;
let px = 0, fireT = 0, gun = 0, parts = 0, shots = [], bombs = [], aliens = [], shields = [], cannon = null, plane = null, dropT = 0;
let fleet = { dir: 1, t: 0, every: 0.7 }, frame = 0, animT = 0, chewT = 0;
let scores = loadScores(), recorded = false, rank = -1;
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const partsCost = () => 3 + gun * 2;
const cannonArt = () => [GUNS[gun].top, ...CANNON_BASE];

/* ---------- sound ---------- */
// Browsers only allow audio after a user gesture, so nothing is decoded until the first key or tap.
const MUTE_KEY = "baseCommander.v1.muted";
const VOL = { shoot: 0.35, laser: 0.3, bomb: 0.5, hit: 0.5, explode: 0.6, shield: 0.3, pickup: 0.8, upgrade: 0.9,
  life: 0.9, death: 1, plane: 0.5, level_start: 0.7, wave_clear: 0.8, game_over: 0.9 };
let unlocked = false, actx = null, master = null, musicBus = null, sfxBus = null, buffers = {}, lastPlayed = {};
let song = "title", songNode = null, muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e){}
function unlockAudio(){
  if (unlocked) return;
  unlocked = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC){ console.warn("Base Commander: Web Audio not supported, playing silent"); return; }
  actx = new AC();
  master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
  musicBus = actx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
  sfxBus = actx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
  const decode = (key, b64) => actx.decodeAudioData(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer,
    b => { buffers[key] = b; if (key === song) startSong(); },
    e => console.warn("Base Commander: could not decode sound", key, e));
  for (const [k, v] of Object.entries(AUDIO_DATA.sfx)) decode(k, v);
  for (const [k, v] of Object.entries(AUDIO_DATA.music)) decode(k, v.data);
}
function sfx(name, pan){   // pan: sweep from -pan to +pan over the sound, for the plane flying across
  const b = buffers[name]; if (!b || muted) return;
  const now = actx.currentTime;
  if (now - (lastPlayed[name] ?? -1) < 0.05) return;   // a volley from many enemies still makes one sound
  lastPlayed[name] = now;
  const src = actx.createBufferSource(), g = actx.createGain(); src.buffer = b; g.gain.value = VOL[name];
  src.connect(g);
  if (pan && actx.createStereoPanner){
    const p = actx.createStereoPanner(); p.pan.setValueAtTime(-pan, now); p.pan.linearRampToValueAtTime(pan, now + b.duration);
    g.connect(p); p.connect(sfxBus);
  } else g.connect(sfxBus);
  src.start();
}
function playSong(name){   // null stops the music
  if (song === name) return;
  song = name;
  if (songNode){ songNode.g.gain.setTargetAtTime(0, actx.currentTime, 0.3); songNode.stop(actx.currentTime + 1.5); songNode = null; }
  startSong();
}
function startSong(){
  if (!actx || !song || songNode || !buffers[song]) return;
  const M = AUDIO_DATA.music[song], src = actx.createBufferSource(), g = actx.createGain();
  // loop points sit inside margins cut from the recording, so MP3 padding never lands in the loop
  src.buffer = buffers[song]; src.loop = true; src.loopStart = M.loopStart; src.loopEnd = M.loopEnd;
  src.connect(g); g.connect(musicBus); src.start(0, M.loopStart); src.g = g; songNode = src;
}
function toggleMute(){
  unlockAudio(); muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 1, actx.currentTime, 0.02);
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e){ console.warn("Base Commander: could not save sound setting", e); }
  $("bSound").textContent = "Sound: " + (muted ? "off" : "on");
}

/* ---------- saved scores ---------- */
function loadScores(){
  try { return JSON.parse(localStorage.getItem(STORE) || "[]"); }
  catch (e){ console.warn("Base Commander: saved scores unreadable, starting fresh", e); return []; }
}
function recordScore(){
  if (recorded || !score) return;
  recorded = true;
  const entry = { s: score, l: level, d: diffKey, t: Date.now() };
  scores = [...scores, entry].sort((a, b) => b.s - a.s).slice(0, 5); rank = scores.indexOf(entry);
  try { localStorage.setItem(STORE, JSON.stringify(scores)); }
  catch (e){ console.warn("Base Commander: could not save score", e); flash("SCORE NOT SAVED (STORAGE BLOCKED)", 3); }
}

/* ---------- levels ---------- */
// Seeded, so level N always has the same line-up.
const rng32 = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function makeLevel(n){
  const d = DIFF[diffKey], rand = rng32(n * 7919 + 1);
  const pool = TYPES.map((t, i) => i).filter(i => TYPES[i].from <= n);
  const rows = Math.min(6, 4 + Math.floor((n - 1) / 3)), cols = Math.min(8, 6 + n);
  const fresh = n > 1 ? pool.find(i => TYPES[i].from === n) : undefined;
  const rowTypes = Array.from({ length: rows }, () => pool[Math.floor(rand() * pool.length)]);
  if (fresh !== undefined && !rowTypes.includes(fresh)) rowTypes[0] = fresh;
  rowTypes.sort((a, b) => TYPES[b].pts - TYPES[a].pts);   // toughest rows at the top
  return { rows, cols, rowTypes, fresh,
    top: Math.min(3 + n, 44 - rows * 6),               // later waves start lower
    step: Math.max(0.22, d.step * 0.95 ** (n - 1)),   // seconds per fleet step
    shot: d.shot * (1 + 0.12 * (n - 1)),              // fire rate
    bombMul: Math.min(1.6, 1 + 0.05 * (n - 1)),       // enemy shot speed
    hpBonus: Math.floor((n - 1) / 8) };               // extra armour every 8 levels
}
for (let n = 1; n <= 40; n++){   // self-check: every generated level fits above the shields
  const L = makeLevel(n);
  console.assert(L.top >= 3 && L.top + L.rows * 6 <= PY - 8 && L.cols * 10 - 3 <= GW - 6 && (L.fresh === undefined || L.rowTypes.includes(L.fresh)), "Base Commander: bad level", n, L);
}
for (const T of TYPES) for (const f of T.art) console.assert(f.length === AH && f.every(r => r.length === AW), "Base Commander: bad sprite", T.name);
for (const G of GUNS) console.assert(G.top.length === CW, "Base Commander: bad cannon top", G.name);

function layout(){
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  const old = screen, dpr = Math.min(window.devicePixelRatio || 1, 3);
  // largest font whose grid still fits the stage
  for (let f = Math.max(5, Math.ceil(Math.min(r.width / GW / 0.5, r.height / GH / 1.15))); ; f--){
    screen = new Screen(f, D); screen.fit(r.width, r.height, dpr);
    if ((screen.cols >= GW && screen.rows >= GH) || f <= 5) break;   // ponytail: below 5px the grid just overflows the stage
  }
  const W = GW * screen.cw, H = GH * screen.ch;
  screen.fit(W, H, dpr);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.w = W; world.h = (GH - 1) * screen.ch; world.unit = screen.cw;
  world.g = { x: 0, y: world.h * 1.6 }; world.drag = 2e-4 * (600 / world.h) ** 2;
    if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const b of world.bodies){ b.x *= kx; b.y *= ky; b.r *= kx; } }
  stars = Array.from({ length: 140 }, () => ({ i: (1 + Math.floor(Math.random() * (GH - 2))) * GW + 1 + Math.floor(Math.random() * (GW - 2)), ph: Math.random() * 6.283 }));
}

function buildShields(){
  for (const s of shields) world.bodies.splice(world.bodies.indexOf(s.body), 1);
  shields = [];
  for (const sx of SHIELD_X) SHIELD.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch !== "#") return;
    const s = { x: sx - 5 + dx, y: PY - 8 + dy, hp: 3 };
    s.body = world.add(cx(s.x), cy(s.y), screen.ch * 0.5, "peg", SHIELD_RGB.slice());
    shields.push(s);
  }));
}
function setupLevel(){
  lv = makeLevel(level);
  shields = []; world.bodies.length = 0; shots = []; bombs = []; aliens = []; plane = null; dropT = 5 + Math.random() * 5;
  px = (GW - CW) / 2; fireT = 0;
  const x0 = Math.floor((GW - lv.cols * 10 + 3) / 2);
  lv.rowTypes.forEach((type, r) => { for (let c = 0; c < lv.cols; c++){
    const hp = TYPES[type].hp + lv.hpBonus;
    aliens.push({ x: x0 + c * 10, y: lv.top + r * 6, type, hp, maxHp: hp, alive: true, flash: 0 });
  } });
  fleet = { dir: 1, t: 0, every: lv.step };
  buildShields();
  cannon = world.add(-1e4, 0, screen.cw * 3.2, "peg"); cannon.hidden = true;   // invisible bumper so debris bounces off the cannon
  sfx("level_start");
  flash("LEVEL " + level + (lv.fresh !== undefined ? "  NEW ENEMY: " + TYPES[lv.fresh].name : ""), 2.5);
}
function restart(){
  if (state === "clear"){ setupLevel(); state = "play"; return; }
  if (state !== "title") recordScore();   // a run abandoned with R still counts
  score = 0; level = 1; gun = 0; parts = 0; lives = DIFF[diffKey].lives; paused = false; recorded = false; rank = -1;
  setupLevel(); state = "play"; playSong("battle");
}
function flash(text, secs = 1.4){ msg = text; msgT = secs; }

/* ---------- physics effects ---------- */
function burst(x, y, rgb, n, vy0 = 0){
  for (let i = 0; i < n; i++){
    const a = Math.random() * 6.283, sp = 120 + Math.random() * 380, r = screen.cw * (0.55 + Math.random() * 0.35);
    const b = world.add(x + (Math.random() - 0.5) * screen.cw, y + (Math.random() - 0.5) * screen.ch, r, "debris", rgb, DEBRIS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp + vy0; b.w = (Math.random() - 0.5) * 30;
    b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = r;
  }
}
// Airdrop crates are real bodies: they float down on a chute, then bounce off shields and debris.
function dropCrate(x, y){
  const r = Math.random(), kind = r < 0.7 ? "P" : r < 0.9 ? "S" : "L";
  const b = world.add(x, y, screen.ch * 0.5, "crate", DROPS[kind].rgb, CRATE);
  b.crate = kind; b.chute = true; b.ttl = 8;   // ttl counts down only once it has landed
}
function eachCell(sprite, x, y, fn){ sprite.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== " ") fn(x + dx, y + dy, row.charCodeAt(dx)); }); }

/* ---------- rules ---------- */
function damage(s){
  s.hp--; s.body.flash = 1; sfx("shield"); s.body.alb = SHIELD_RGB.map(v => v * (0.25 + 0.75 * s.hp / 3));
  if (s.hp > 0) return;
  world.bodies.splice(world.bodies.indexOf(s.body), 1); shields.splice(shields.indexOf(s), 1);
  burst(s.body.x, s.body.y, SHIELD_RGB, 2);
}
function hitShield(x, y){ const s = shields.find(s => s.x === x && s.y === y); if (s) damage(s); return !!s; }
function hitAlien(x, y, shot){
  for (const a of aliens){
    if (!a.alive || shot.hits.has(a)) continue;
    const T = TYPES[a.type], art = T.art[frame], dx = x - a.x, dy = y - a.y;
    if (dx < 0 || dx >= AW || dy < 0 || dy >= AH || art[dy][dx] === " ") continue;
    shot.hits.add(a); a.flash = 0.12;
    if (--a.hp > 0){ sfx("hit"); score += 1; burst(cx(x), cy(y), T.rgb, 2, -150); return true; }
    a.alive = false; sfx("explode"); score += T.pts + Math.floor((GH - a.y) / 4) + level;
    eachCell(art, a.x, a.y, (gx, gy) => burst(cx(gx), cy(gy), T.rgb, 1, -250));
    if (a.maxHp >= 3 && Math.random() < 0.35) dropCrate(cx(a.x + 3), cy(a.y + 2));   // armoured enemies may drop parts
    return true;
  }
  return false;
}
function inCannon(x, y){ const art = cannonArt(), dx = x - Math.round(px), dy = y - PY; return dy >= 0 && dy < 3 && dx >= 0 && dx < CW && art[dy][dx] !== " "; }
function loseLife(){
  eachCell(cannonArt(), Math.round(px), PY, (gx, gy) => burst(cx(gx), cy(gy), CANNON_RGB, 2, -300));
  lives--; shots = []; bombs = []; sfx("death");
  if (lives <= 0){ state = "over"; recordScore(); playSong(null); setTimeout(() => sfx("game_over"), 900); return; }
  const lost = gun > 0; gun = Math.max(0, gun - 1);
  px = (GW - CW) / 2; state = "dead"; deadT = 1.2; flash(lost ? "SHIP LOST - GUN DOWN TO " + GUNS[gun].name : "SHIP LOST");
}
function collect(kind){
  burst(cannon.x, cannon.y - screen.ch * 2, DROPS[kind].rgb, 6, -300);
  if (kind === "S"){ buildShields(); sfx("pickup"); flash("SHIELDS REPAIRED"); return; }
  if (kind === "L"){ lives++; sfx("life"); flash("+1 LIFE"); return; }
  parts++;
  if (gun < GUNS.length - 1 && parts >= partsCost()){ parts -= partsCost(); gun++; sfx("upgrade"); flash("GUN UPGRADE: " + GUNS[gun].name, 2); }
  else { sfx("pickup"); flash("+1 PARTS"); }
}
function fireAlien(a){
  const T = TYPES[a.type], x = a.x + 3, y = a.y + AH, sp = T.speed * lv.bombMul;
  if (Math.random() < T.bomb){ bombs.push({ kind: "bomb", x, y, sp: lv.bombMul, acc: 0 }); sfx("bomb"); return; }
  sfx("laser");
  for (const ox of T.twin ? [-2, 2] : [0]) bombs.push({ kind: "laser", x: x + ox, y, sp, acc: 0 });
}
function impact(s, y){   // an enemy shot lands on a shield or the floor; bombs hit a small area
  const r = WEAPONS[s.kind].blast ? 1 : 0;
  shields.filter(q => Math.abs(q.x - s.x) <= r && Math.abs(q.y - y) <= r).forEach(damage);
  burst(cx(s.x), cy(y), WEAPONS[s.kind].rgb.map(v => v * 0.6), r ? 4 : 1, -200);
}

function update(dt){
  const d = DIFF[diffKey];
  if ((animT += dt) >= 0.35){ animT = 0; frame ^= 1; }
  px = Math.max(1, Math.min(GW - 1 - CW, px + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * CANNON_SPEED * dt));
  if ((fireT -= dt) <= 0 && keys.fire){
    const G = GUNS[gun];
    for (const [ox, vx] of G.shots){ const x = Math.round(px) + 3 + ox; shots.push({ x, fx: x, y: PY - 1, vx, acc: 0, pierce: G.pierce || 1, hits: new Set() }); }
    fireT = d.fire * G.delay; sfx("shoot");
  }
  // bullets advance one cell at a time so nothing is skipped at low frame rates
  for (const s of shots){
    s.acc += SHOT_SPEED * dt;
    while (s.acc >= 1 && !s.dead){
      s.acc--; s.y--; s.fx += s.vx; s.x = Math.round(s.fx);
      if (s.y < 1 || s.x < 1 || s.x > GW - 2 || hitShield(s.x, s.y)) s.dead = true;
      else if (hitAlien(s.x, s.y, s) && --s.pierce <= 0) s.dead = true;
    }
  }
  shots = shots.filter(s => !s.dead);

  const alive = aliens.filter(a => a.alive);
  if (!alive.length){ score += 50 * level; state = "clear"; level++; sfx("wave_clear"); return; }
  for (const a of alive) a.flash -= dt;
  const gone = 1 - alive.length / aliens.length;
  if ((fleet.t += dt) >= Math.max(0.1, fleet.every - gone * 0.4)){
    fleet.t = 0;
    const minX = Math.min(...alive.map(a => a.x)), maxX = Math.max(...alive.map(a => a.x + AW - 1));
    if (fleet.dir > 0 ? maxX >= GW - 3 : minX <= 2){ for (const a of alive) a.y += 2; fleet.dir = -fleet.dir; }
    else for (const a of alive) a.x += fleet.dir;
  }
  if (Math.max(...alive.map(a => a.y + AH - 1)) >= PY){ lives = 1; loseLife(); return; }   // landed: game over
  if ((chewT += dt) >= 0.2){   // aliens chew through shields they touch
    chewT = 0;
    for (const a of alive) eachCell(TYPES[a.type].art[frame], a.x, a.y, (gx, gy) => { const s = shields.find(s => s.x === gx && s.y === gy); if (s) damage(s); });
  }
  for (const a of alive){
    if (Math.random() >= (lv.shot + gone * 0.18) * TYPES[a.type].rate * dt) continue;
    if (alive.some(o => o.y > a.y && Math.abs(o.x - a.x) < AW)) continue;   // only the front line fires
    fireAlien(a);
  }
  let hitMe = false;
  for (const s of bombs){
    s.acc += WEAPONS[s.kind].speed * s.sp * dt;
    while (s.acc >= 1 && !s.dead){
      s.acc--; s.y++;
      if (s.y >= GH - 1){ s.dead = true; impact(s, s.y - 1); }
      else if (shields.some(q => q.x === s.x && q.y === s.y)){ s.dead = true; impact(s, s.y); }
      else if (inCannon(s.x, s.y)) s.dead = hitMe = true;
      else { const p = shots.find(p => !p.dead && p.x === s.x && Math.abs(p.y - s.y) <= 1);
        if (p){ p.dead = s.dead = true; score += 2; sfx("hit"); burst(cx(s.x), cy(s.y), [1, 0.7, 0.3], 2); } }
    }
  }
  bombs = bombs.filter(s => !s.dead); shots = shots.filter(s => !s.dead);
  if (hitMe){ loseLife(); return; }
  // supply plane crosses the top and drops a crate at a random column
  if (!plane && (dropT -= dt) <= 0){
    const dir = Math.random() < 0.5 ? 1 : -1;
    plane = { x: dir > 0 ? -8 : GW, dir, dropX: 6 + Math.floor(Math.random() * (GW - 12)), done: false };
    dropT = 12 + Math.random() * 10; sfx("plane", dir);
  }
  if (plane){
    plane.x += plane.dir * PLANE_SPEED * dt;
    if (!plane.done && Math.abs(plane.x + 4 - plane.dropX) < 1){ plane.done = true; dropCrate(cx(plane.dropX), cy(3)); }
    if (plane.x < -9 || plane.x > GW + 1) plane = null;
  }
  for (const b of world.bodies) if (b.crate && b.ttl > 0 && Math.hypot(b.x - cannon.x, b.y - cannon.y) < cannon.r + b.r + screen.ch * 0.5){ b.ttl = 0; collect(b.crate); }
  // passing bullets shove loose debris
  for (const b of world.bodies) if (b.life){
    for (const s of shots) if (Math.abs(cx(s.x) - b.x) < screen.cw * 1.5 && Math.abs(cy(s.y) - b.y) < screen.ch){ b.vy = Math.min(b.vy, -500); b.vx += (b.x - cx(s.x)) * 20; }
    for (const s of bombs) if (Math.abs(cx(s.x) - b.x) < screen.cw * 1.5 && Math.abs(cy(s.y) - b.y) < screen.ch) b.vy = Math.max(b.vy, 400);
  }
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, 3, s.charCodeAt(i)); }
const center = (gy, s, rgb) => text(Math.floor((GW - s.length) / 2), gy, s, rgb);
const SHOT_RGB = [0.5, 1.1, 1.6], LANCE_RGB = [1.6, 0.6, 1.4], WHITE = [1.6, 1.6, 1.6], DIM = [0.35, 0.4, 0.55], BORDER_RGB = [0.12, 0.16, 0.28];
function bounce(p){   // ease-out bounce: a letter dropping onto the floor
  const n = 7.5625, d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
}
const hue = h => [0, 1, 2].map(k => 0.8 * (0.5 + 0.5 * Math.cos(6.283 * (h - k / 3))) + 0.15);
function drawTitle(t){
  let k = 0;
  for (const [word, y0] of TITLE){
    const x0 = Math.floor((GW - word.length * 8 + 1) / 2);
    for (let i = 0; i < word.length; i++, k++){
      const p = Math.max(0, Math.min(1, (titleT - 0.15 * k) / 1.1)); if (!p) continue;
      const x = x0 + i * 8, y = Math.round(y0 - (1 - bounce(p)) * (y0 + 8));
      if (p > 0.37 && !landed.has(k)){ landed.add(k); burst(cx(x + 3), cy(y0 + 7), hue(x / GW), 6, -150); }   // dust on first impact
      FONT[word[i]].forEach((row, dy) => { for (let dx = 0; dx < 7; dx++) if (row[dx] === "#"){
        const c = hue(t * 0.0002 + (x + dx) / GW * 0.6 + dy * 0.03);
        put(x + dx + 1, y + dy + 1, c, 0.12, 1, 46);   // drop shadow
        put(x + dx, y + dy, c, 1.5, 2, 35);
      } });
    }
  }
  const fleetX = Math.round(Math.sin(titleT * 0.8) * 3);
  for (let i = 0; i < 7; i++) eachCell(TYPES[i].art[frame], 6 + fleetX + i * 13, 28, (gx, gy, code) => put(gx, gy, TYPES[i].rgb, 0.9, 2, code));
  if (titleT > 3){
    center(25, "~ DEFEND THE BASE ~", CANNON_RGB);
    if ((t / 500 | 0) % 2) center(46, unlocked || muted ? (touchMode ? "PRESS START OR A TO BEGIN" : "PRESS SPACE TO START")
      : (touchMode ? "TAP ANY BUTTON FOR SOUND" : "PRESS ANY KEY FOR SOUND"), WHITE);
  }
  center(36, "HIGH SCORES", CANNON_RGB);
  if (!scores.length) center(38, "NO SCORES YET", DIM);
  scores.forEach((e, i) => center(38 + i, (i + 1) + ". " + String(e.s).padStart(6, "0") + "  LV " + String(e.l).padEnd(3) + " " + e.d.toUpperCase().padEnd(6) + " " + new Date(e.t).toISOString().slice(0, 10), WHITE));
  center(52, touchMode ? "D-PAD MOVE  A/B FIRE  START PAUSE  SELECT SOUND" : "ARROWS/A D MOVE  SPACE FIRE  P PAUSE  R RESTART  M SOUND", DIM);
  center(54, "CATCH AIRDROPS: [P] PARTS  [S] SHIELDS  [L] LIFE", DIM);
  center(56, "DIFFICULTY: " + diffKey.toUpperCase(), DIM);
}
function draw(t){
  screen.clear();
  for (const s of stars){ const v = 0.07 + 0.05 * Math.sin(t * 0.002 + s.ph); screen.put(s.i, v, v, v * 1.2, 0, 46); }
  const bodies = world.bodies.filter(b => !b.hidden);
  for (const b of bodies) if (!b.crate) screen.sphere(b, sun, { stripe: false });
  if (state === "title") for (const b of bodies) if (b.life) screen.streak(b, world.unit);   // in play, streaks would look like enemy lasers
  if (state === "title"){ drawTitle(t); drawBorder(); screen.render(ctx); return; }
  const pulse = 0.85 + 0.15 * frame;
  for (const a of aliens) if (a.alive){
    const k = a.flash > 0 ? 2 : pulse * (0.55 + 0.45 * a.hp / a.maxHp);   // damaged armour glows dimmer
    eachCell(TYPES[a.type].art[frame], a.x, a.y, (gx, gy, code) => put(gx, gy, TYPES[a.type].rgb, k, 2, code));
  }
  for (const b of bodies) if (b.crate && (b.ttl > 3 || (t / 150 | 0) % 2)){
    const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch), c = DROPS[b.crate].rgb;
    text(gx - 1, gy, "[" + b.crate + "]", c);
    if (b.chute) text(gx - 1, gy - 1, "/~\\", WHITE);
  }
  if (plane) text(Math.floor(plane.x), 2, plane.dir > 0 ? "==-[H]->" : "<-[H]-==", WHITE);
  for (const s of shots) put(s.x, s.y, GUNS[gun].pierce ? LANCE_RGB : SHOT_RGB, 1, 3, s.vx < 0 ? 92 : s.vx > 0 ? 47 : 124);
  for (const s of bombs){   // lasers are a two-cell line, bombs a small dot
    const W = WEAPONS[s.kind]; put(s.x, s.y, W.rgb, 1, 3, W.glyph);
    if (s.kind === "laser") put(s.x, s.y - 1, W.rgb, 0.6, 3, W.glyph);
  }
  if (state === "play" || state === "clear") eachCell(cannonArt(), Math.round(px), PY, (gx, gy, code) => put(gx, gy, CANNON_RGB, 1, 3, code));
  drawBorder();
  text(2, 0, " SCORE " + String(score).padStart(6, "0") + "  HI " + String(Math.max(score, scores[0]?.s || 0)).padStart(6, "0") + " ", WHITE);
  const right = " LV " + level + "  LIVES " + Math.max(0, lives) + "  " + diffKey.toUpperCase() + " ";
  text(GW - 2 - right.length, 0, right, WHITE);
  text(2, GH - 1, " GUN " + GUNS[gun].name + "  PARTS " + (gun < GUNS.length - 1 ? parts + "/" + partsCost() : "MAX") + " ", CANNON_RGB);
  const left = " ENEMIES " + aliens.filter(a => a.alive).length + " ";
  text(GW - 2 - left.length, GH - 1, left, WHITE);
  const mid = GH >> 1;
  if (paused) center(mid, "  [ PAUSED ]  ", WHITE);
  else if (state === "over"){
    center(mid, "  GAME OVER - press " + (touchMode ? "START" : "R") + "  ", WHITE);
    if (rank >= 0) center(mid + 2, "  NEW HIGH SCORE - RANK " + (rank + 1) + "  ", CANNON_RGB);
  } else if (state === "clear"){
    const n = makeLevel(level);
    center(mid, "  WAVE " + (level - 1) + " CLEARED - press " + (touchMode ? "START" : "R") + "  ", WHITE);
    center(mid + 2, "  NEXT: " + n.rows * n.cols + " ENEMIES" + (n.fresh !== undefined ? "  NEW: " + TYPES[n.fresh].name : "") + "  ", CANNON_RGB);
  }
  if (msgT > 0) center(4, " " + msg + " ", [1.6, 0.5, 0.35]);
  screen.render(ctx);
}

function drawBorder(){
  for (let x = 0; x < GW; x++){ put(x, 0, BORDER_RGB, 1, 1, 45); put(x, GH - 1, BORDER_RGB, 1, 1, 45); }
  for (let y = 0; y < GH; y++){ put(0, y, BORDER_RGB, 1, 1, 124); put(GW - 1, y, BORDER_RGB, 1, 1, 124); }
  for (const [x, y] of [[0, 0], [GW - 1, 0], [0, GH - 1], [GW - 1, GH - 1]]) put(x, y, BORDER_RGB, 1, 1, 43);
}

/* ---------- input ---------- */
const keys = { left: false, right: false, fire: false };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", " ": "fire" };
function togglePause(){
  if (state !== "play" && state !== "dead") return;
  paused = !paused; $("bPause").textContent = paused ? "Resume" : "Pause";
  if (actx) paused ? actx.suspend() : actx.resume();
}
// On the title, the first key or tap only turns the sound on (and starts the title music).
function titlePress(){ if (!unlocked && !muted){ unlockAudio(); return; } unlockAudio(); restart(); }
addEventListener("keydown", e => {
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.repeat) return;
  if (e.key === "m" || e.key === "M"){ toggleMute(); return; }
  if (state === "title"){ if (!unlocked && !muted) unlockAudio(); else if (e.key === " " || e.key === "Enter") titlePress(); return; }
  unlockAudio();
  if (e.key === "p" || e.key === "P") togglePause();
  if (e.key === "r" || e.key === "R" || (e.key === "Enter" && (state === "over" || state === "clear"))) restart();
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
addEventListener("blur", () => { keys.left = keys.right = keys.fire = false; });

/* ---------- controls: keyboard or touch gamepad ---------- */
const CTRL_KEY = "baseCommander.v1.controls";
let touchMode = matchMedia("(pointer: coarse)").matches;   // default follows the device; the Controls button overrides it
try { const c = localStorage.getItem(CTRL_KEY); if (c) touchMode = c === "touch"; } catch (e){}
function setControls(touch, save){
  touchMode = touch; document.body.classList.toggle("touch", touch); $("gamepad").hidden = !touch;
  $("bControls").textContent = "Controls: " + (touch ? "touch" : "keyboard");
  if (save) try { localStorage.setItem(CTRL_KEY, touch ? "touch" : "keyboard"); } catch (e){ console.warn("Base Commander: could not save controls setting", e); }
}
setControls(touchMode, false);
$("bControls").addEventListener("click", () => setControls(!touchMode, true));
const buzz = () => navigator.vibrate && navigator.vibrate(8);   // a tick of feedback on phones that support it
// The D-pad is one surface: the thumb's position picks the direction, so sliding across switches like a real pad.
const dpad = $("dpad");
function dpadAt(e){
  const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2);
  const dir = Math.abs(dx) < r.width * 0.1 ? "" : dx < 0 ? "left" : "right";
  if (dir !== (dpad.dataset.dir || "")){ dpad.dataset.dir = dir; if (dir) buzz(); }
  keys.left = dir === "left"; keys.right = dir === "right";
}
dpad.addEventListener("pointerdown", e => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); unlockAudio(); dpadAt(e); });
dpad.addEventListener("pointermove", e => { if (dpad.hasPointerCapture(e.pointerId)) dpadAt(e); });
for (const ev of ["pointerup", "pointercancel"]) dpad.addEventListener(ev, () => { dpad.dataset.dir = ""; keys.left = keys.right = false; });
function padStart(){   // START: begin, continue after a wave or game over, otherwise pause
  if (state === "title") titlePress();
  else if (state === "over" || state === "clear") restart();
  else { unlockAudio(); togglePause(); }
}
const firing = new Set();   // A and B both fire; firing stops once neither is held
document.querySelectorAll("[data-pad]").forEach(b => {
  const id = b.dataset.pad;
  b.addEventListener("pointerdown", e => {
    e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); buzz();
    if (id === "select") return toggleMute();
    if (id === "start") return padStart();
    if (state === "title") return titlePress();
    unlockAudio(); firing.add(id); keys.fire = true;
  });
  const up = () => { b.classList.remove("on"); if (firing.delete(id)) keys.fire = firing.size > 0; };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
});
cv.addEventListener("pointerdown", () => { if (state === "title") titlePress(); else unlockAudio(); });
$("bSound").addEventListener("click", toggleMute);
$("bSound").textContent = "Sound: " + (muted ? "off" : "on");
$("bPause").addEventListener("click", togglePause);
$("bRestart").addEventListener("click", () => { $("bPause").textContent = "Pause"; restart(); });
$("bDiff").addEventListener("click", e => {   // lives change on the next restart; level tuning on the next wave
  const ks = Object.keys(DIFF); diffKey = ks[(ks.indexOf(diffKey) + 1) % ks.length];
  e.target.textContent = "Difficulty: " + diffKey; if (state !== "title") flash("DIFFICULTY " + diffKey.toUpperCase() + " - APPLIES ON RESTART");
});

/* ---------- loop ---------- */
let last = performance.now(), nextFrame = 0, pausedDrawn = false;
const FRAME_MS = 1000 / 60;
function tick(t){
  requestAnimationFrame(tick);
  // 120 Hz and faster displays call this more often than the game needs: run at most ~60 times a second
  if (t < nextFrame - 1) return;
  nextFrame = t - nextFrame > FRAME_MS ? t + FRAME_MS : nextFrame + FRAME_MS;
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
  if (screen && !paused){
    if (state === "play") update(dt);
    else if (state === "dead" && (deadT -= dt) <= 0) state = "play";
    else if (state === "title"){
      titleT += dt; if ((animT += dt) >= 0.35){ animT = 0; frame ^= 1; }
      if (titleT > 3 && (fwT -= dt) <= 0){   // fireworks: debris bursts that rain onto the floor
        fwT = 0.6 + Math.random() * 0.8;
        burst(cx(8 + Math.random() * (GW - 16)), cy(3 + Math.random() * 16), hue(Math.random()), 12, -100);
      }
    }
    msgT -= dt;
    if (cannon){ cannon.x = state === "play" ? cx(Math.round(px) + 3) : -1e4; cannon.y = (PY + 1.5) * screen.ch; }
    world.step(dt);
    for (const b of world.bodies){
      if (b.life){ b.life -= dt; if (b.life < 1) b.r = b.r0 * Math.max(0.3, b.life); }
      if (b.crate){
        if (!b.chute) b.ttl -= dt;
        // the chute holds the fall to a slow drift until the crate lands on something
        if (b.chute && (b.touch || b.y + b.r >= world.h - 1)) b.chute = false;
        if (b.chute){ b.vy = Math.min(b.vy, screen.ch * 8); b.vx *= 0.95; }
      }
    }
    world.bodies = world.bodies.filter(b => !(b.life <= 0) && !(b.ttl <= 0));
  }
  if (screen && !(paused && pausedDrawn)){ draw(t); pausedDrawn = paused; }   // a paused screen is drawn once
}
layout();
// Re-fit only for real size changes (rotation, window resize). Mobile browsers also nudge the page height
// as the address bar slides in and out; re-fitting then would make the game jump while you play.
let fitted = stage.getBoundingClientRect();
new ResizeObserver(() => {
  const r = stage.getBoundingClientRect();
  if (Math.abs(r.width - fitted.width) < 1 && Math.abs(r.height - fitted.height) < fitted.height * 0.15) return;
  fitted = r;
  if (screen){ layout(); pausedDrawn = false; for (const s of shields){ s.body.x = cx(s.x); s.body.y = cy(s.y); } }
}).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
