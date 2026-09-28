(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a fixed character grid; physics and light run in pixels on top of it.
const GW = 64, GH = 44, PY = GH - 3;   // playfield in cells; PY is the cannon's top row
const ALIENS = [   // 5x3 sprites, two animation frames each
  [[" (^) ", "<o_o>", " / \\ "], [" (^) ", "<o_o>", " \\ / "]],
  [["~[=]~", "(O.O)", "/   \\"], ["~[=]~", "(O.O)", " | | "]],
  [[" oOo ", "{-v-}", " ' ' "], [" oOo ", "{-^-}", "'   '"]]
];
const ALIEN_RGB = [[1.0, 0.3, 0.8], [0.3, 0.8, 1.0], [0.55, 1.0, 0.3]], ROW_TYPE = [0, 1, 1, 2];
const CANNON = ["  A  ", "/=#=\\"], CANNON_RGB = [1.4, 1.1, 0.5];
const SHIELD = ["  ###  ", " ##### ", "### ###"], SHIELD_RGB = [0.3, 0.9, 0.5], SHIELD_X = [10, 25, 39, 54];
const DIFF = {   // shot: alien shots per alien per second
  easy:   { shot: 0.13, step: 0.90, fire: 0.15, lives: 4 },
  normal: { shot: 0.24, step: 0.72, fire: 0.20, lives: 3 },
  hard:   { shot: 0.39, step: 0.58, fire: 0.30, lives: 3 }
};
const DEBRIS = { name: "debris", density: 0.5, e: 0.5, mu: 0.5, kd: 0.9, ks: 0.6, shine: 24 };
const SHOT_SPEED = 50, BOMB_SPEED = 24, CANNON_SPEED = 22;   // cells per second
const FONT = {   // 5x5 block letters for the launch screen
  B: ["####.", "#...#", "####.", "#...#", "####."], A: [".###.", "#...#", "#####", "#...#", "#...#"],
  S: [".####", "#....", ".###.", "....#", "####."], E: ["#####", "#....", "####.", "#....", "#####"],
  C: [".####", "#....", "#....", "#....", ".####"], O: [".###.", "#...#", "#...#", "#...#", ".###."],
  M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], N: ["#...#", "##..#", "#.#.#", "#..##", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "####."], R: ["####.", "#...#", "####.", "#..#.", "#...#"]
};
const TITLE = [["BASE", 5], ["COMMANDER", 12]];   // word, top row

const D = defaultDisplay(); D.room = 0.3; D.lampRGB = D.lampRGB.map(v => v * 0.55);
const world = new World(), lamp = { x: 0, y: 0, z: 0, on: true };
let screen = null, stars = [], diffKey = "normal", score = 0, lives = 3, level = 1;
let state = "title", titleT = 0, fwT = 0, landed = new Set(), paused = false, deadT = 0, msg = "", msgT = 0;
let px = 0, fireT = 0, shots = [], bombs = [], aliens = [], shields = [], cannon = null;
let fleet = { dir: 1, t: 0, every: 0.7 }, frame = 0, animT = 0, chewT = 0;
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;

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
  lamp.z = screen.ch * 12;
  if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const b of world.bodies){ b.x *= kx; b.y *= ky; b.r *= kx; } }
  stars = Array.from({ length: 70 }, () => ({ i: (1 + Math.floor(Math.random() * (GH - 2))) * GW + 1 + Math.floor(Math.random() * (GW - 2)), ph: Math.random() * 6.283 }));
}

function setupLevel(){
  const d = DIFF[diffKey];
  shots = []; bombs = []; aliens = []; shields = []; world.bodies.length = 0;
  px = (GW - 5) / 2; fireT = 0;
  const top = 3 + Math.min(level - 1, 4);   // later waves start lower
  for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) aliens.push({ x: 4 + c * 7, y: top + r * 4, type: ROW_TYPE[r], alive: true });
  fleet = { dir: 1, t: 0, every: Math.max(0.3, d.step - (level - 1) * 0.07) };
  for (const sx of SHIELD_X) SHIELD.forEach((row, dy) => [...row].forEach((ch, dx) => {
    if (ch !== "#") return;
    const s = { x: sx - 3 + dx, y: PY - 6 + dy, hp: 3 };
    s.body = world.add(cx(s.x), cy(s.y), screen.ch * 0.5, "peg", SHIELD_RGB.slice());
    shields.push(s);
  }));
  cannon = world.add(-1e4, 0, screen.cw * 2.3, "peg"); cannon.hidden = true;   // invisible bumper so debris bounces off the cannon
}
function restart(){
  if (state === "clear"){ setupLevel(); state = "play"; return; }
  score = 0; level = 1; lives = DIFF[diffKey].lives; paused = false; msgT = 0; setupLevel(); state = "play";
}
function flash(text){ msg = text; msgT = 1.4; }

/* ---------- physics effects ---------- */
function burst(x, y, rgb, n, vy0 = 0){
  for (let i = 0; i < n; i++){
    const a = Math.random() * 6.283, sp = 120 + Math.random() * 380, r = screen.cw * (0.55 + Math.random() * 0.35);
    const b = world.add(x + (Math.random() - 0.5) * screen.cw, y + (Math.random() - 0.5) * screen.ch, r, "debris", rgb, DEBRIS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp + vy0; b.w = (Math.random() - 0.5) * 30;
    b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = r;
  }
}
function eachCell(sprite, x, y, fn){ sprite.forEach((row, dy) => { for (let dx = 0; dx < row.length; dx++) if (row[dx] !== " ") fn(x + dx, y + dy, row.charCodeAt(dx)); }); }

/* ---------- rules ---------- */
function damage(s){
  s.hp--; s.body.flash = 1; s.body.alb = SHIELD_RGB.map(v => v * (0.25 + 0.75 * s.hp / 3));
  if (s.hp > 0) return;
  world.bodies.splice(world.bodies.indexOf(s.body), 1); shields.splice(shields.indexOf(s), 1);
  burst(s.body.x, s.body.y, SHIELD_RGB, 2);
}
function hitShield(x, y){ const s = shields.find(s => s.x === x && s.y === y); if (s) damage(s); return !!s; }
function hitAlien(x, y){
  for (const a of aliens){
    const dx = x - a.x, dy = y - a.y;
    if (!a.alive || dx < 0 || dx > 4 || dy < 0 || dy > 2 || ALIENS[a.type][frame][dy][dx] === " ") continue;
    a.alive = false; score += 10 + Math.floor((GH - a.y) / 4) + level;
    eachCell(ALIENS[a.type][frame], a.x, a.y, (gx, gy) => burst(cx(gx), cy(gy), ALIEN_RGB[a.type], 1, -250));
    return true;
  }
  return false;
}
function inCannon(x, y){ const dx = x - Math.round(px), dy = y - PY; return dy >= 0 && dy < 2 && dx >= 0 && dx < 5 && CANNON[dy][dx] !== " "; }
function loseLife(){
  eachCell(CANNON, Math.round(px), PY, (gx, gy) => burst(cx(gx), cy(gy), CANNON_RGB, 2, -300));
  lives--; shots = []; bombs = [];
  if (lives <= 0){ state = "over"; return; }
  px = (GW - 5) / 2; state = "dead"; deadT = 1.2; flash("SHIP LOST");
}

function update(dt){
  const d = DIFF[diffKey];
  if ((animT += dt) >= 0.35){ animT = 0; frame ^= 1; }
  px = Math.max(1, Math.min(GW - 6, px + ((keys.right ? 1 : 0) - (keys.left ? 1 : 0)) * CANNON_SPEED * dt));
  if ((fireT -= dt) <= 0 && keys.fire){ shots.push({ x: Math.round(px) + 2, y: PY - 1, acc: 0 }); fireT = d.fire; }
  // bullets advance one cell at a time so nothing is skipped at low frame rates
  for (const s of shots){
    s.acc += SHOT_SPEED * dt;
    while (s.acc >= 1 && !s.dead){ s.acc--; s.y--; s.dead = s.y < 1 || hitShield(s.x, s.y) || hitAlien(s.x, s.y); }
  }
  shots = shots.filter(s => !s.dead);

  const alive = aliens.filter(a => a.alive);
  if (!alive.length){ state = "clear"; level++; return; }
  const gone = 1 - alive.length / aliens.length;
  if ((fleet.t += dt) >= Math.max(0.1, fleet.every - gone * 0.4)){
    fleet.t = 0;
    const minX = Math.min(...alive.map(a => a.x)), maxX = Math.max(...alive.map(a => a.x + 4));
    if (fleet.dir > 0 ? maxX >= GW - 3 : minX <= 2){ for (const a of alive) a.y++; fleet.dir = -fleet.dir; }
    else for (const a of alive) a.x += fleet.dir;
  }
  if (Math.max(...alive.map(a => a.y + 2)) >= PY){ lives = 1; loseLife(); return; }   // landed: game over
  if ((chewT += dt) >= 0.2){   // aliens chew through shields they touch
    chewT = 0;
    for (const a of alive) eachCell(ALIENS[a.type][frame], a.x, a.y, (gx, gy) => { const s = shields.find(s => s.x === gx && s.y === gy); if (s) damage(s); });
  }
  for (const a of alive){
    if (Math.random() >= (d.shot + gone * 0.18) * dt) continue;
    if (alive.some(o => o.y > a.y && Math.abs(o.x - a.x) < 5)) continue;   // only the front line fires
    bombs.push({ x: a.x + 2, y: a.y + 3, acc: 0 });
  }
  let hitMe = false;
  for (const s of bombs){
    s.acc += BOMB_SPEED * dt;
    while (s.acc >= 1 && !s.dead){
      s.acc--; s.y++;
      if (s.y >= GH - 1){ s.dead = true; burst(cx(s.x), cy(s.y - 1), [1, 0.4, 0.3], 1, -200); }
      else if (hitShield(s.x, s.y)) s.dead = true;
      else if (inCannon(s.x, s.y)) s.dead = hitMe = true;
      else { const p = shots.find(p => !p.dead && p.x === s.x && Math.abs(p.y - s.y) <= 1);
        if (p){ p.dead = s.dead = true; score += 2; burst(cx(s.x), cy(s.y), [1, 0.7, 0.3], 2); } }
    }
  }
  bombs = bombs.filter(s => !s.dead); shots = shots.filter(s => !s.dead);
  if (hitMe) loseLife();
  // passing bullets shove loose debris
  for (const b of world.bodies) if (b.life){
    for (const s of shots) if (Math.abs(cx(s.x) - b.x) < screen.cw * 1.5 && Math.abs(cy(s.y) - b.y) < screen.ch){ b.vy = Math.min(b.vy, -500); b.vx += (b.x - cx(s.x)) * 20; }
    for (const s of bombs) if (Math.abs(cx(s.x) - b.x) < screen.cw * 1.5 && Math.abs(cy(s.y) - b.y) < screen.ch) b.vy = Math.max(b.vy, 400);
  }
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, 3, s.charCodeAt(i)); }
function halo(gx, gy, rgb, k){   // soft light a bullet casts on the floor
  for (let dy = -2; dy <= 2; dy++) for (let dx = -4; dx <= 4; dx++){
    const v = k * (1 - Math.hypot(dx / 4.5, dy / 2.5)), x = gx + dx, y = gy + dy;
    if (v > 0 && x >= 0 && y >= 0 && x < GW && y < GH) screen.add(y * GW + x, rgb[0] * v, rgb[1] * v, rgb[2] * v);
  }
}
const SHOT_RGB = [0.5, 1.1, 1.6], BOMB_RGB = [1.6, 0.35, 0.25], WHITE = [1.6, 1.6, 1.6], BORDER_RGB = [0.12, 0.16, 0.28];
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
    const x0 = Math.floor((GW - word.length * 6 + 1) / 2);
    for (let i = 0; i < word.length; i++, k++){
      const p = Math.max(0, Math.min(1, (titleT - 0.15 * k) / 1.1)); if (!p) continue;
      const x = x0 + i * 6, y = Math.round(y0 - (1 - bounce(p)) * (y0 + 6));
      if (p > 0.37 && !landed.has(k)){ landed.add(k); burst(cx(x + 2), cy(y0 + 5), hue(x / GW), 4, -150); }   // dust on first impact
      FONT[word[i]].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#"){
        const c = hue(t * 0.0002 + (x + dx) / GW * 0.6 + dy * 0.03);
        put(x + dx + 1, y + dy + 1, c, 0.12, 1, 46);   // drop shadow
        put(x + dx, y + dy, c, 1.5, 2, 35);
      } });
    }
  }
  const fleetX = Math.round(Math.sin(titleT * 0.8) * 6);
  for (let i = 0; i < 6; i++) eachCell(ALIENS[i % 3][frame], 5 + fleetX + i * 9, 23, (gx, gy, code) => put(gx, gy, ALIEN_RGB[i % 3], 0.9, 2, code));
  if (titleT > 3){
    text(Math.floor((GW - 20) / 2), 19, "~ DEFEND THE BASE ~", CANNON_RGB);
    if ((t / 500 | 0) % 2) text(Math.floor((GW - 32) / 2), 31, "PRESS SPACE OR TAP FIRE TO START", WHITE);
  }
  const help = "ARROWS/A D MOVE  SPACE FIRE  P PAUSE  R RESTART";
  text(Math.floor((GW - help.length) / 2), 35, help, [0.35, 0.4, 0.55]);
  const dl = "DIFFICULTY: " + diffKey.toUpperCase();
  text(Math.floor((GW - dl.length) / 2), 37, dl, [0.35, 0.4, 0.55]);
}
function draw(t){
  screen.clear();
  for (const s of stars){ const v = 0.07 + 0.05 * Math.sin(t * 0.002 + s.ph); screen.put(s.i, v, v, v * 1.2, 0, 46); }
  const bodies = world.bodies.filter(b => !b.hidden);
  screen.floor(bodies, lamp);
  for (const s of shots) halo(s.x, s.y, SHOT_RGB, 0.12);
  for (const s of bombs) halo(s.x, s.y, BOMB_RGB, 0.1);
  for (const b of bodies) screen.sphere(b, lamp, { stripe: false });
  for (const b of bodies) if (b.life) screen.streak(b, world.unit);
  if (state === "title"){ drawTitle(t); drawBorder(); screen.render(ctx); return; }
  const pulse = 0.85 + 0.15 * frame;
  for (const a of aliens) if (a.alive) eachCell(ALIENS[a.type][frame], a.x, a.y, (gx, gy, code) => put(gx, gy, ALIEN_RGB[a.type], pulse, 2, code));
  for (const s of shots) put(s.x, s.y, SHOT_RGB, 1, 3, 124);
  for (const s of bombs) put(s.x, s.y, BOMB_RGB, 1, 3, s.y & 1 ? 33 : 58);
  if (state === "play" || state === "clear") eachCell(CANNON, Math.round(px), PY, (gx, gy, code) => put(gx, gy, CANNON_RGB, 1, 3, code));
  drawBorder();
  text(2, 0, " SCORE " + String(score).padStart(6, "0") + " ", WHITE);
  const right = " LEVEL " + level + "  LIVES " + Math.max(0, lives) + "  " + diffKey.toUpperCase() + " ";
  text(GW - 2 - right.length, 0, right, WHITE);
  const mid = s => text(Math.floor((GW - s.length) / 2), GH >> 1, s, WHITE);
  if (paused) mid("  [ PAUSED ]  ");
  else if (state === "over") mid("  GAME OVER - press R  ");
  else if (state === "clear") mid("  WAVE CLEARED - press R  ");
  if (msgT > 0) text(Math.floor((GW - msg.length - 2) / 2), 3, " " + msg + " ", BOMB_RGB);
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
function togglePause(){ if (state !== "play" && state !== "dead") return; paused = !paused; $("bPause").textContent = paused ? "Resume" : "Pause"; }
addEventListener("keydown", e => {
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.repeat) return;
  if (state === "title"){ if (e.key === " " || e.key === "Enter") restart(); return; }
  if (e.key === "p" || e.key === "P") togglePause();
  if (e.key === "r" || e.key === "R" || (e.key === "Enter" && (state === "over" || state === "clear"))) restart();
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
addEventListener("blur", () => { keys.left = keys.right = keys.fire = false; });
document.querySelectorAll("[data-key]").forEach(b => {
  const set = v => e => { e.preventDefault(); keys[b.dataset.key] = v; if (v && state === "title" && b.dataset.key === "fire") restart(); };
  b.addEventListener("pointerdown", set(true));
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, set(false));
});
cv.addEventListener("pointerdown", () => { if (state === "title") restart(); });
$("bPause").addEventListener("click", togglePause);
$("bRestart").addEventListener("click", () => { $("bPause").textContent = "Pause"; restart(); });
$("bDiff").addEventListener("click", e => {   // takes effect on the next restart, like the lives count
  const ks = Object.keys(DIFF); diffKey = ks[(ks.indexOf(diffKey) + 1) % ks.length];
  e.target.textContent = "Difficulty: " + diffKey; if (state !== "title") flash("DIFFICULTY " + diffKey.toUpperCase() + " - press R");
});

/* ---------- loop ---------- */
let last = performance.now();
function tick(t){
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
    if (cannon){ cannon.x = state === "play" ? cx(Math.round(px) + 2) : -1e4; cannon.y = PY * screen.ch + screen.ch; }
    world.step(dt);
    for (const b of world.bodies) if (b.life){ b.life -= dt; if (b.life < 1) b.r = b.r0 * Math.max(0.3, b.life); }
    world.bodies = world.bodies.filter(b => !(b.life <= 0));
  }
  if (screen){
    if (state === "title"){ lamp.x = cx(GW / 2 + Math.sin(titleT * 0.6) * 24); lamp.y = cy(28); }
    else { lamp.x = cx(px + 2); lamp.y = cy(PY - 2); }
    draw(t);
  }
  requestAnimationFrame(tick);
}
layout();
new ResizeObserver(() => { if (screen){ layout(); for (const s of shields){ s.body.x = cx(s.x); s.body.y = cy(s.y); } } }).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
