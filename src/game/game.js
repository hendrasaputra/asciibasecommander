(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a fixed grid of cells (the old character grid); physics runs in world units on top of it. Everything
// is drawn as pixel art (src/pixel.js), 4 x 8 pixels to a cell; text and the menu use a coarser grid over it.
const GW = 96, GH = 66, PY = GH - 4;   // playfield in cells; PY is the cannon's top row
const COL = 8, ROW = 16, PU = 2, XP = COL / PU, YP = ROW / PU;   // world units per cell column and row, and per pixel; pixels per cell
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
// Enemy fire is the brightest thing on screen, so attacks read as sharp lines against the dimmed debris.
const WEAPONS = {   // speed in cells per second
  laser: { speed: 34, rgb: [3.0, 0.15, 0.1], glyph: 124 },   // very bright, low green and blue so it stays red after tone mapping
  bomb:  { speed: 16, rgb: [2.4, 1.6, 0.4], glyph: 111, blast: true }
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

applyArcadeSettings(defaultDisplay());   // the tube TV filter from the shared Settings page
const world = new World();
world.w = GW * COL; world.h = (GH - 1) * ROW; world.unit = COL; world.g = { x: 0, y: world.h * 1.6 }; world.drag = 2e-4 * (600 / world.h) ** 2;
const pix = createPixels(GW * XP, GH * YP, 64, 43, PU);
let ready = false, diffKey = "normal", score = 0, lives = 3, level = 1, lv = null;
let state = "title", titleT = 0, fwT = 0, landed = new Set(), paused = false, deadT = 0, msg = "", msgT = 0;
let px = 0, fireT = 0, gun = 0, parts = 0, shots = [], bombs = [], aliens = [], shields = [], cannon = null, plane = null, dropT = 0;
let fleet = { dir: 1, t: 0, every: 0.7 }, frame = 0, animT = 0, chewT = 0;
let recorded = false, rank = -1;
const cx = gx => (gx + 0.5) * COL, cy = gy => (gy + 0.5) * ROW;
const partsCost = () => 3 + gun * 2;
const cannonArt = () => [GUNS[gun].top, ...CANNON_BASE];

/* ---------- saved settings, sound and scores (src/arcade.js) ---------- */
const store = prefs("baseCommander.v1.", "Base Commander");
const VOL = { shoot: 0.35, laser: 0.3, bomb: 0.5, hit: 0.5, explode: 0.6, shield: 0.3, pickup: 0.8, upgrade: 0.9,
  life: 0.9, death: 1, plane: 0.5, level_start: 0.7, wave_clear: 0.8, game_over: 0.9 };
// the Sonic Pi effects and music (audio/base-commander.rb, processed by audio/process.py); a volley from many
// enemies at once still makes one sound
const audio = createAudio({ label: "Base Commander", store, sounds: SFX_DATA, music: MUSIC_DATA, vol: VOL, minGap: 0.05 });
const feel = createFeel(), vfx = createFx();
const sfx = (name, pan) => audio.play(name, pan), playSong = name => audio.music(name);
playSong("title");   // starts once the first key or tap turns the sound on
const scores = scoreTable(store, 5, "scores", (a, b) => b.s - a.s);
function recordScore(){
  if (recorded || !score) return;
  recorded = true;
  const r = scores.add({ s: score, l: level, d: diffKey, t: Date.now() });
  rank = r.rank;
  if (!r.saved) flash("SCORE NOT SAVED (STORAGE BLOCKED)", 3);
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

function layout(){ if (pix.fit(stage, cv, ctx)) ready = true; }

function buildShields(){
  for (const s of shields) world.bodies.splice(world.bodies.indexOf(s.body), 1);
  shields = [];
  for (const sx of SHIELD_X) SHIELD.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch !== "#") return;
    const s = { x: sx - 5 + dx, y: PY - 8 + dy, hp: 3 };
    s.body = world.add(cx(s.x), cy(s.y), ROW * 0.5, "peg", SHIELD_RGB.slice());
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
  cannon = world.add(-1e4, 0, COL * 3.2, "peg"); cannon.hidden = true;   // invisible bumper so debris bounces off the cannon
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
// In play, debris is dimmed and greyed so it never competes with enemy fire; vivid keeps full colour (title effects).
function burst(x, y, rgb, n, vy0 = 0, vivid = false){
  const alb = vivid ? rgb : rgb.map(v => 0.06 + 0.22 * Math.min(v, 1.2));
  for (let i = 0; i < n; i++){
    const a = Math.random() * 6.283, sp = 120 + Math.random() * 380, r = COL * (0.55 + Math.random() * 0.35);
    const b = world.add(x + (Math.random() - 0.5) * COL, y + (Math.random() - 0.5) * ROW, r, "debris", alb, DEBRIS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp + vy0; b.w = (Math.random() - 0.5) * 30;
    b.flash = vivid ? 1 : 0.25; b.life = 3 + Math.random() * 2; b.r0 = r;
  }
}
// Airdrop crates are real bodies: they float down on a chute, then bounce off shields and debris.
function dropCrate(x, y){
  const r = Math.random(), kind = r < 0.7 ? "P" : r < 0.9 ? "S" : "L";
  const b = world.add(x, y, ROW * 0.5, "crate", DROPS[kind].rgb, CRATE);
  b.crate = kind; b.chute = true; b.ttl = 8;   // ttl counts down only once it has landed
}
function eachCell(sprite, x, y, fn){ sprite.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== " ") fn(x + dx, y + dy, row.charCodeAt(dx)); }); }

/* ---------- rules ---------- */
function damage(s){
  s.hp--; s.body.flash = 1; sfx("shield"); vfx.burst(s.body.x, s.body.y, { n: 8, speed: ROW * 10, pal: PAL.ice, life: 0.35 }); s.body.alb = SHIELD_RGB.map(v => v * (0.25 + 0.75 * s.hp / 3));
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
    a.alive = false; sfx("explode"); vfx.explode(cx(a.x + AW / 2), cy(a.y + AH / 2), ROW * 1.2); feel.shake(1.5, 0.15); score += T.pts + Math.floor((GH - a.y) / 4) + level;
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
  vfx.explode(cx(Math.round(px) + 3), cy(PY + 1), ROW * 2.5); feel.shake(8, 0.45); feel.freeze(0.15); feel.flash(0.45);
  if (lives <= 0){ state = "over"; recordScore(); playSong(null); setTimeout(() => sfx("game_over"), 900); return; }
  const lost = gun > 0; gun = Math.max(0, gun - 1);
  px = (GW - CW) / 2; state = "dead"; deadT = 1.2; flash(lost ? "SHIP LOST - GUN DOWN TO " + GUNS[gun].name : "SHIP LOST");
}
function collect(kind){
  burst(cannon.x, cannon.y - ROW * 2, DROPS[kind].rgb, 6, -300);
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
  if (aimX !== null){ keys.left = aimX < px - 0.5; keys.right = aimX > px + 0.5; }   // a finger on the screen: the cannon goes to it
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
  for (const b of world.bodies) if (b.crate && b.ttl > 0 && Math.hypot(b.x - cannon.x, b.y - cannon.y) < cannon.r + b.r + ROW * 0.5){ b.ttl = 0; collect(b.crate); }
  // passing bullets shove loose debris
  for (const b of world.bodies) if (b.life){
    for (const s of shots) if (Math.abs(cx(s.x) - b.x) < COL * 1.5 && Math.abs(cy(s.y) - b.y) < ROW){ b.vy = Math.min(b.vy, -500); b.vx += (b.x - cx(s.x)) * 20; }
    for (const s of bombs) if (Math.abs(cx(s.x) - b.x) < COL * 1.5 && Math.abs(cy(s.y) - b.y) < ROW) b.vy = Math.max(b.vy, 400);
  }
}

/* ---------- drawing: pixel art (src/pixel.js) ---------- */
// After Balote: each colour as a ramp of five shades, light from the upper left, outlines from the edge pass. A cell
// is 4 x 8 pixels, so an enemy (7 x 4 cells) is 28 x 32 pixels. The enemies are built from lit balls and bevelled
// plates; their hit areas are still the old character shapes.
const SHOT_RGB = [0.5, 1.1, 1.6], WHITE = [1.6, 1.6, 1.6], DIM = [0.35, 0.4, 0.55];
const ALIEN_PIX = [[120, 220, 70], [70, 180, 230], [230, 80, 190], [235, 205, 70], [235, 140, 50], [180, 100, 235], [235, 80, 70]];
const METAL = [150, 156, 176], GOLD = [235, 190, 90], DROP_PIX = { P: [235, 190, 80], S: [90, 220, 130], L: [235, 90, 110] };
const lit = (c, k) => k > 1 ? c.map(v => v + (255 - v) * Math.min(1, k - 1)) : c.map(v => v * k);   // above 1: towards white
function bev(x, y, w, h, c, layer = 3){   // a bevelled plate: lit top and left, shaded bottom and right
  const R = pix.ramp(c);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pix.px(x + i, y + j, R[j === 0 || i === 0 ? 4 : j === h - 1 || i === w - 1 ? 1 : 3], layer);
}
const eye = (x, y, look = 0) => { pix.rect(x, y, 3, 3, [245, 245, 250], 3); pix.px(x + 1 + look, y + 1, [20, 16, 30], 3); };
function drawAlien(type, gx, gy, f, k, t){
  const x = gx * XP, y = gy * YP, c = lit(ALIEN_PIX[type], k), R = pix.ramp(c), B = (bx, by, r, col = c) => pix.ball(x + bx, y + by, r, col);
  const look = cannon && state === "play" ? Math.sign(Math.round(px) * XP + 14 - x - 14) : 0;
  if (type === 0){   // GRUNT: a round blob on stubby legs
    for (const lx of f ? [9, 17] : [7, 19]) pix.rect(x + lx, y + 23, 3, 6, R[1], 3);
    B(14, 15, 9); eye(x + 9, y + 10, look); eye(x + 16, y + 10, look); pix.rect(x + 11, y + 19, 6, 1, R[0], 3);
  } else if (type === 1){   // TROOPER: a helmet with a visor, arms up and down
    for (const s of [-1, 1]) pix.line(x + 14 + s * 7, y + 17, x + 14 + s * 12, y + (f ? 11 : 23), R[2], 3);
    for (const lx of [10, 16]) pix.rect(x + lx, y + 24, 3, 5, R[1], 3);
    B(14, 17, 8); bev(x + 5, y + 6, 18, 6, METAL); pix.rect(x + 8, y + 12, 12, 3, [16, 20, 34], 3); pix.rect(x + 9 + (f ? 0 : 7), y + 13, 3, 1, [150, 230, 255], 3);
  } else if (type === 2){   // SCOUT: a small eye on beating wings
    for (let i = 0; i < 12; i++) for (let j = 0; j <= (12 - i) >> 1; j++) for (const s of [-1, 1]) pix.px(x + 14 + s * (5 + i), y + 15 + (f ? -1 : 1) * Math.round(i * 0.4) - j, R[j ? 2 : 3], 3);
    B(14, 15, 6); eye(x + 13, y + 13, look); pix.px(x + 14, y + 6, R[4], 3); pix.px(x + 14, y + 7, R[3], 3); pix.px(x + 14, y + 8, R[3], 3);
  } else if (type === 3){   // GUNNER: twin side guns
    bev(x + 1, y + 13, 6, 5, METAL); bev(x + 21, y + 13, 6, 5, METAL);
    if (f){ pix.px(x + 3, y + 19, [255, 220, 120], 3); pix.px(x + 24, y + 19, [255, 220, 120], 3); }
    B(14, 15, 8); pix.rect(x + 9, y + 12, 10, 2, [20, 16, 30], 3); pix.rect(x + 10 + (f ? 0 : 6), y + 12, 2, 1, [255, 90, 60], 3);
    for (const lx of [10, 16]) pix.rect(x + lx, y + 23, 3, 5, R[1], 3);
  } else if (type === 4){   // TANK: an armoured hull on treads, a turret and its gun
    const K = pix.ramp([60, 60, 70]);
    for (let i = 0; i < 26; i++) for (let j = 0; j < 6; j++) pix.px(x + 1 + i, y + 22 + j, K[j === 0 ? 3 : (i + (f ? 1 : 0)) % 3 ? 1 : 2], 3);
    bev(x + 2, y + 9, 24, 13, c); for (let i = 5; i < 24; i += 6) pix.px(x + i, y + 15, R[1], 3);
    B(14, 10, 5); pix.rect(x + 13, y + 26, 2, 6, METAL.map(v => v * 0.8), 3);
  } else if (type === 5){   // SEEKER: one big eye that follows your cannon
    B(14, 15, 10, [228, 222, 238]); pix.ball(x + 14 + look * 3, y + 15, 4.5, c); pix.rect(x + 13 + look * 3, y + 14, 2, 2, [16, 12, 24], 3);
    for (let i = -8; i <= 8; i++) pix.px(x + 14 + i, y + 6 + Math.round(i * i / 18), R[f ? 3 : 1], 3);
  } else {   // BOMBER: a saucer with a dome, rim lights and a bomb bay
    for (let j = -5; j <= 5; j++) for (let i = -13; i <= 13; i++) if ((i / 13.5) ** 2 + (j / 5.5) ** 2 <= 1) pix.px(x + 14 + i, y + 17 + j, R[j < -2 ? 4 : j < 1 ? 3 : j < 4 ? 2 : 1], 3);
    pix.ball(x + 14, y + 11, 5, [170, 220, 240]);
    for (let i = -10; i <= 10; i += 5) pix.px(x + 14 + i, y + 18, ((i / 5 + (f ? 1 : 0)) & 1) ? [255, 240, 150] : R[1], 3);
    bev(x + 11, y + 22, 6, 4, METAL);
  }
}
function drawCannon(){
  const x = Math.round(px) * XP, y = PY * YP, G = GUNS[gun], R = pix.ramp(GOLD);
  for (const [ox] of G.shots){ const bx = x + 13 + ox * XP; bev(bx, y + (ox ? 4 : 0), 3, ox ? 8 : 10, METAL); }   // a barrel for each shot
  pix.ball(x + 14, y + 11, 6, GOLD);
  for (let j = 0; j < 8; j++) for (let i = 3 - (j >> 2); i < 25 + (j >> 2); i++) pix.px(x + i, y + 15 + j, R[j === 0 ? 4 : j === 7 ? 1 : i < 6 ? 4 : i > 22 ? 1 : 3], 3);
  for (let i = 6; i < 23; i += 4) pix.px(x + i, y + 19, R[1], 3);
}
function drawShield(sh){
  const c = [70, 200, 110].map(v => v * (0.4 + 0.6 * sh.hp / 3)), x = sh.x * XP, y = sh.y * YP;
  bev(x, y, XP, YP, sh.body.flash > 0 ? lit(c, 1.6) : c, 2);
  if (sh.hp < 3) pix.px(x + 1 + (sh.x & 1), y + 3 + (sh.y & 1) * 2, [20, 40, 26], 2);   // a crack
}
const TINY = { P: ["##", "##", "#."], S: [".#", "#.", "#."], L: ["#.", "#.", "##"] };   // letters for the crates, 2 x 3
function drawCrate(b, t){
  const x = Math.round(b.x / PU) - 4, y = Math.round(b.y / PU) - 4;
  if (b.chute){ for (let i = -7; i <= 7; i++) pix.px(x + 4 + i, y - 6 - Math.round(Math.sqrt(49 - i * i) * 0.6), [235, 235, 245], 3);
    pix.line(x - 3, y - 6, x, y, [200, 200, 210], 3); pix.line(x + 11, y - 6, x + 7, y, [200, 200, 210], 3); }
  if (!(b.ttl > 3 || (t / 150 | 0) % 2)) return;   // blinks before it disappears
  bev(x, y, 8, 8, DROP_PIX[b.crate]);
  TINY[b.crate].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === "#") pix.px(x + 3 + i, y + 2 + j, [40, 30, 20], 3); }));
}
function drawPlane(t){
  const x = Math.round(plane.x * XP), y = 2 * YP + 2, d = plane.dir, P = (i, j, w, h, c) => bev(d > 0 ? x + i : x + 32 - i - w, y + j, w, h, c);
  P(4, 3, 24, 6, [200, 205, 215]); P(12, 0, 6, 12, [170, 175, 190]); P(2, 0, 4, 4, [180, 60, 60]);
  pix.rect(d > 0 ? x + 28 : x + 2, y + 3 + ((t / 60 | 0) % 2) * 3, 2, 3, [60, 60, 70], 3);   // the propeller
  pix.rect(d > 0 ? x + 20 : x + 9, y + 4, 4, 2, [90, 160, 230], 3);
}
const back = { d: null, lay: null };
function bakeBack(){   // deep space: a dithered gradient, a faint nebula, and stars
  pix.clear();
  for (let y = 0; y < pix.H; y++) for (let x = 0; x < pix.W; x++){
    const n = pixNoise(x * 0.012, y * 0.012), v = y / pix.H + (pix.bayer(x, y) - 0.5) * 0.15;
    let c = v < 0.5 ? [8, 9, 22] : [12, 11, 28];
    if (n + (pix.bayer(x, y) - 0.5) * 0.15 > 0.66) c = [26, 16, 42];
    pix.px(x, y, c, -1);
  }
  for (let k = 0; k < 160; k++){ const v = 60 + 120 * pixHash(k, 3); pix.px(pixHash(k, 1) * pix.W, pixHash(k, 2) * pix.H, [v, v, v * 1.15], -1); }
  back.d = new Uint8ClampedArray(pix.d); back.lay = new Int8Array(pix.lay);
}
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
      if (p > 0.37 && !landed.has(k)){ landed.add(k); burst(cx(x + 3), cy(y0 + 7), hue(x / GW), 6, -150, true); }   // dust on first impact
      FONT[word[i]].forEach((row, dy) => { for (let dx = 0; dx < 7; dx++) if (row[dx] === "#")
        bev((x + dx) * XP, (y + dy) * YP, XP, YP, pix.rgb(hue(t * 0.0002 + (x + dx) / GW * 0.6 + dy * 0.03).map(v => v * 1.2))); });
    }
  }
  const fleetX = Math.round(Math.sin(titleT * 0.8) * 3);
  for (let i = 0; i < 7; i++) drawAlien(i, 6 + fleetX + i * 13, 28, frame, 1, t);
  const C = pix.center;
  if (titleT > 3){
    C(16, "~ DEFEND THE BASE ~", CANNON_RGB);
    if ((t / 500 | 0) % 2) C(29, audio.unlocked || audio.muted || INPUT.touch ? (INPUT.touch ? "TAP TO BEGIN" : "PRESS SPACE TO START") : "PRESS ANY KEY FOR SOUND", WHITE);
  }
  C(22, "HIGH SCORES", CANNON_RGB);
  if (!scores.list.length) C(23, "NO SCORES YET", DIM);
  scores.list.forEach((e, i) => C(23 + i, (i + 1) + ". " + String(e.s).padStart(6, "0") + "  LV " + String(e.l).padEnd(3) + " " + e.d.toUpperCase().padEnd(6) + " " + new Date(e.t).toISOString().slice(0, 10), WHITE));
  C(31, INPUT.touch ? "TOUCH AND SLIDE: THE CANNON FOLLOWS YOUR FINGER AND FIRES" : "ARROWS/A D MOVE  SPACE FIRE  ESC MENU  R RESTART  M SOUND", DIM);
  C(32, "CATCH AIRDROPS: [P] PARTS  [S] SHIELDS  [L] LIFE", DIM);
  C(33, "DIFFICULTY: " + diffKey.toUpperCase(), DIM);
}
function draw(t){
  if (!back.d) bakeBack();
  pix.clear(); pix.d.set(back.d); pix.lay.set(back.lay);
  for (let k = 0; k < 40; k++){ const v = (90 + 120 * pixHash(k, 7)) * (0.5 + 0.5 * Math.sin(t * 0.002 + k)); pix.px(pixHash(k, 5) * pix.W, pixHash(k, 6) * pix.H, [v, v, v * 1.2], -1); }   // twinkling
  const shieldBodies = new Set(shields.map(q => q.body));
  for (const q of shields) drawShield(q);
  for (const b of world.bodies){   // debris; in play it is dimmed so it never competes with enemy fire
    if (b.hidden || b.crate || shieldBodies.has(b)) continue;
    pix.ball(b.x / PU, b.y / PU, Math.max(1, b.r / PU), pix.rgb(b.alb.map(v => v * (state === "title" ? 1.6 : 2.6))), 3, true);
  }
  vfx.draw(pix);
  if (state === "title"){ drawTitle(t); return finish(); }
  const pulse = 0.85 + 0.15 * frame;
  for (const a of aliens) if (a.alive) drawAlien(a.type, a.x, a.y, frame, a.flash > 0 ? 1.8 : pulse * (0.55 + 0.45 * a.hp / a.maxHp), t);   // damaged armour is dimmer
  for (const b of world.bodies) if (b.crate) drawCrate(b, t);
  if (plane) drawPlane(t);
  for (const s of shots) pix.rect(s.x * XP + 1, s.y * YP, 2, 7, GUNS[gun].pierce ? [240, 120, 230] : [150, 225, 255], 3);
  for (const s of bombs){   // lasers are a long red line, bombs a hot ball
    if (s.kind === "laser"){ pix.rect(s.x * XP + 1, (s.y - 1) * YP, 2, 16, [255, 50, 30], 3); pix.rect(s.x * XP + 1, (s.y - 1) * YP + 2, 1, 12, [255, 210, 190], 3); }
    else { pix.ball(s.x * XP + 2, s.y * YP + 4, 2.6, [255, 200, 90], 3, true); pix.glow(cx(s.x), cy(s.y), ROW * 1.4, [0.5, 0.3, 0.1]); }
  }
  if (state === "play" || state === "clear") drawCannon();
  pix.edges();
  pix.rect(0, 0, pix.W, 11, [10, 12, 26], 4); pix.rect(0, 11, pix.W, 1, [40, 48, 80], 4);                       // the HUD bars
  pix.rect(0, pix.H - 8, pix.W, 8, [10, 12, 26], 4); pix.rect(0, pix.H - 9, pix.W, 1, [40, 48, 80], 4);       // under the floor, clear of the cannon
  const T = pix.text, cols = pix.cols, rows = pix.rows;
  T(1, 0, "SCORE " + String(score).padStart(6, "0") + "  HI " + String(Math.max(score, scores.list[0]?.s || 0)).padStart(6, "0"), WHITE);
  const right = "LV " + level + "  LIVES " + Math.max(0, lives) + "  " + diffKey.toUpperCase();
  T(cols - 1 - right.length, 0, right, WHITE);
  T(1, rows - 1, "GUN " + GUNS[gun].name + "  PARTS " + (gun < GUNS.length - 1 ? parts + "/" + partsCost() : "MAX"), CANNON_RGB);
  const left = "ENEMIES " + aliens.filter(a => a.alive).length;
  T(cols - 1 - left.length, rows - 1, left, WHITE);
  const mid = rows >> 1;
  if (state === "over"){
    pix.center(mid, (INPUT.touch ? "  GAME OVER - TAP TO PLAY AGAIN  " : "  GAME OVER - press R  "), WHITE);
    if (rank >= 0) pix.center(mid + 2, "  NEW HIGH SCORE - RANK " + (rank + 1) + "  ", CANNON_RGB);
  } else if (state === "clear"){
    const n = makeLevel(level);
    pix.center(mid, "  WAVE " + (level - 1) + " CLEARED - " + (INPUT.touch ? "TAP" : "press R") + "  ", WHITE);
    pix.center(mid + 2, "  NEXT: " + n.rows * n.cols + " ENEMIES" + (n.fresh !== undefined ? "  NEW: " + TYPES[n.fresh].name : "") + "  ", CANNON_RGB);
  }
  if (msgT > 0) pix.center(3, " " + msg + " ", [1.6, 0.5, 0.35]);
  finish();
}
function finish(){
  if (state === "title") pix.edges();
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(pix, { accent: CANNON_RGB, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "DIFFICULTY APPLIES ON RESTART" });
  pix.present(ctx);
}

/* ---------- input ---------- */
const keys = { left: false, right: false, fire: false };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", " ": "fire" };
// The pause menu (src/menu.js). Open it with Esc or P, or the header's Menu button.
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "title" ? "START GAME" : state === "clear" ? "NEXT WAVE" : "RESTART", select: () => { menu.hide(); audio.unlock(); restart(); } },
  { label: "DIFFICULTY", value: () => diffKey.toUpperCase(), change: d => { const ks = Object.keys(DIFF); diffKey = ks[(ks.indexOf(diffKey) + d + ks.length) % ks.length]; } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { paused = true; keys.left = keys.right = keys.fire = false; audio.pause(); },
  onClose: () => { paused = false; audio.resume(); },
  onChange: () => { pausedDrawn = false; }   // the paused screen is only redrawn when something changes
});
// On the title, the first key or tap only turns the sound on (and starts the title music).
function titlePress(){ if (!audio.unlocked && !audio.muted){ audio.unlock(); return; } audio.unlock(); restart(); }
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.repeat) return;
  if (e.key === "Escape" || e.key === "p" || e.key === "P"){ audio.unlock(); return menu.show(); }
  if (e.key === "m" || e.key === "M"){ audio.toggleMute(); return; }
  if (state === "title"){ if (!audio.unlocked && !audio.muted) audio.unlock(); else if (e.key === " " || e.key === "Enter") titlePress(); return; }
  audio.unlock();
  if (e.key === "r" || e.key === "R" || (e.key === "Enter" && (state === "over" || state === "clear"))) restart();
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
addEventListener("blur", () => { keys.left = keys.right = keys.fire = false; });

// Touch and mouse: touch the screen and the cannon slides to your finger and fires while you hold on. Taps start a
// game, go on after a wave or game over, and pick rows in the menu.
let aimX = null, aimer = null;   // where the finger wants the cannon (its left column), and that finger
const aimAt = t => { aimX = t.x * GW - CW / 2; };
createTouch(cv, {
  down: t => { if (menu.open || state !== "play" || aimer) return; aimer = t; audio.unlock(); aimAt(t); keys.fire = true; },
  move: t => { if (t === aimer) aimAt(t); },
  up: t => {
    if (t === aimer){ aimer = aimX = null; keys.left = keys.right = keys.fire = false; return; }
    if (!t.tap) return;
    if (menu.open) menu.tap(Math.floor(t.x * pix.cols), Math.floor(t.y * pix.rows));
    else if (state === "title"){ audio.unlock(); restart(); }
    else if (state === "over" || state === "clear"){ audio.unlock(); restart(); }
  }
});
headerButtons(menu, audio);

/* ---------- loop ---------- */
let pausedDrawn = false;
function tick(dt, t){
  if (ready && !paused && (dt = feel.step(dt))){   // a hit-stop holds everything still for a moment
    vfx.update(dt);
    if (state === "play") update(dt);
    else if (state === "dead" && (deadT -= dt) <= 0) state = "play";
    else if (state === "title"){
      titleT += dt; if ((animT += dt) >= 0.35){ animT = 0; frame ^= 1; }
      if (titleT > 3 && (fwT -= dt) <= 0){   // fireworks: debris bursts that rain onto the floor
        fwT = 0.6 + Math.random() * 0.8;
        burst(cx(8 + Math.random() * (GW - 16)), cy(3 + Math.random() * 16), hue(Math.random()), 12, -100, true);
      }
    }
    msgT -= dt;
    if (cannon){ cannon.x = state === "play" ? cx(Math.round(px) + 3) : -1e4; cannon.y = (PY + 1.5) * ROW; }
    world.step(dt);
    for (const b of world.bodies){
      if (b.life){ b.life -= dt; if (b.life < 1) b.r = b.r0 * Math.max(0.3, b.life); }
      if (b.crate){
        if (!b.chute) b.ttl -= dt;
        // the chute holds the fall to a slow drift until the crate lands on something
        if (b.chute && (b.touch || b.y + b.r >= world.h - 1)) b.chute = false;
        if (b.chute){ b.vy = Math.min(b.vy, ROW * 8); b.vx *= 0.95; }
      }
    }
    world.bodies = world.bodies.filter(b => !(b.life <= 0) && !(b.ttl <= 0));
  }
  if (ready && !(paused && pausedDrawn)){ feel.begin(ctx, cv); draw(t); feel.end(ctx, cv); pausedDrawn = paused; }   // a paused screen is drawn once
}
layout();
onResize(stage, () => { layout(); pausedDrawn = false; });
startLoop(tick);
})();
