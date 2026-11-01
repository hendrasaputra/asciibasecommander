(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// A meadow of grass squares with mines buried under some. Dig a square to see how many mines touch it; flag the
// ones you think hide a mine. Drawn as pixel art (src/pixel.js), one tile T pixels square, under a HUD band. The
// text grid is sized from the fitted picture, about 7 x 14 CSS pixels a letter, so the HUD and menu read on a phone.
const T = 12, HUD = 22;
const LEVELS = { easy: [9, 9, 10], medium: [16, 16, 40], hard: [30, 16, 99] };   // columns, rows, mines (wide)
const NAMES = Object.keys(LEVELS);
const GRASS = [[84, 158, 68], [94, 170, 76]], DIRT = [[150, 110, 70], [140, 102, 64]], SCORCH = [60, 44, 36];
const NUM = [null, [90, 170, 255], [120, 230, 110], [255, 110, 90], [200, 140, 255], [255, 196, 70], [90, 232, 220], [244, 244, 244], [176, 176, 176]];
const DIGITS = ["###", "#.#", "#.#", "#.#", "###", ".#.", "##.", ".#.", ".#.", "###", "###", "..#", "###", "#..", "###", "###", "..#", "###", "..#", "###",
  "#.#", "#.#", "###", "..#", "..#", "###", "#..", "###", "..#", "###", "###", "#..", "###", "#.#", "###", "###", "..#", "..#", "#..", "#..", "###", "#.#", "###", "#.#", "###"];
const WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], ACCENT = [1.6, 1.3, 0.5], RED = [1.8, 0.4, 0.3], GREEN = [0.6, 1.6, 0.6];

applyArcadeSettings(defaultDisplay());   // the tube TV filter from the shared Settings page
const store = prefs("meadowMines.v1.", "Meadow Mines");
const audio = createAudio({ label: "Meadow Mines", store, sounds: CRATER_SFX, volume: 1, minGap: 0.05 });
const sfx = name => audio.play(name);
const feel = createFeel(), vfx = createFx();
const best = store.getJSON("best", {});   // fastest clear in seconds, per level

let pix = null, ready = false, level = NAMES.includes(store.get("level")) ? store.get("level") : "easy", nextLevel = level;
let bc = 0, br = 0, nMines = 0, mine, open, flag, cnt, gone, nOpen = 0, nFlags = 0;
let state = "ready", time = 0, overT = 0, boomQ = [], hitAt = -1, digMode = true, cursor = { x: 0, y: 0 }, msg = "";

/* ---------- the field ---------- */
function newField(){
  level = nextLevel; store.set("level", level);
  const [w, h, m] = LEVELS[level], r = stage.getBoundingClientRect();
  [bc, br] = r.height > r.width && w > h ? [h, w] : [w, h];   // a long field stands up on a phone held upright
  nMines = m; const n = bc * br;
  mine = new Uint8Array(n); open = new Uint8Array(n); flag = new Uint8Array(n); cnt = new Uint8Array(n); gone = new Uint8Array(n);
  nOpen = nFlags = 0; state = "ready"; time = overT = 0; boomQ = []; hitAt = -1; msg = "";
  cursor = { x: bc >> 1, y: br >> 1 }; vfx.clear();
  layout();
}
const around = i => {
  const x = i % bc, y = (i / bc) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
    const X = x + dx, Y = y + dy;
    if ((dx || dy) && X >= 0 && Y >= 0 && X < bc && Y < br) out.push(Y * bc + X);
  }
  return out;
};
// Mines are laid at the first dig, away from it, so the first square always opens ground.
function lay(first){
  const keep = new Set([first, ...around(first)]), spots = [];
  for (let i = 0; i < bc * br; i++) if (!keep.has(i)) spots.push(i);
  for (let k = 0; k < nMines; k++){ const j = k + Math.floor(Math.random() * (spots.length - k)); [spots[k], spots[j]] = [spots[j], spots[k]]; mine[spots[k]] = 1; }
  for (let i = 0; i < bc * br; i++) cnt[i] = around(i).reduce((s, j) => s + mine[j], 0);
}
function dig(i){
  if (state === "ready"){ lay(i); state = "play"; }
  if (state !== "play" || open[i] || flag[i]) return;
  if (mine[i]) return lose(i);
  const todo = [i]; let n = 0;   // empty ground opens its neighbours too
  while (todo.length){
    const j = todo.pop(); if (open[j] || flag[j]) continue;
    open[j] = 1; nOpen++; n++;
    if (!cnt[j]) todo.push(...around(j));
  }
  const [x, y] = mid(i); vfx.debris(x, y, n > 1 ? 3 : 2, PAL.dirt, n > 1 ? 10 : 5);
  sfx("dirt");
  if (nOpen === bc * br - nMines) win();
}
// Digging an open number whose mines are all flagged digs every square around it.
function chord(i){
  const ns = around(i);
  if (ns.reduce((s, j) => s + flag[j], 0) !== cnt[i]) return;
  for (const j of ns) if (!open[j] && !flag[j]) dig(j);
}
function act(i, flagIt){
  if (state === "lost" || state === "won") return;
  if (open[i]) return chord(i);
  if (!flagIt) return dig(i);
  flag[i] ^= 1; nFlags += flag[i] ? 1 : -1; sfx("switch");
  if (navigator.vibrate) navigator.vibrate(12);
}
function lose(i){
  state = "lost"; hitAt = i; open[i] = 1;
  blow(i); feel.freeze(0.08);
  // the other mines go off one after another, nearest first
  const [x0, y0] = [i % bc, (i / bc) | 0], rest = [];
  for (let j = 0; j < bc * br; j++) if (mine[j] && j !== i && !flag[j]) rest.push(j);
  rest.sort((a, b) => Math.hypot(a % bc - x0, ((a / bc) | 0) - y0) - Math.hypot(b % bc - x0, ((b / bc) | 0) - y0));
  boomQ = rest.map((j, k) => ({ j, t: 0.35 + k * Math.min(0.12, 2 / rest.length) }));
  msg = "BOOM!";
}
function blow(i){
  gone[i] = 1; const [x, y] = mid(i);
  vfx.explode(x, y, 6); feel.shake(boomQ.length ? 3 : 6, 0.3); sfx(boomQ.length ? "boom" : "bigboom");
}
function win(){
  state = "won";
  for (let i = 0; i < bc * br; i++) if (mine[i] && !flag[i]){ flag[i] = 1; nFlags++; }
  const s = Math.floor(time), prev = best[level];
  msg = "CLEARED IN " + s + "S";
  if (prev === undefined || s < prev){ best[level] = s; store.setJSON("best", best); if (prev !== undefined) msg += " - NEW BEST"; }
  for (let k = 0; k < 6; k++) vfx.burst(pix.W * (0.15 + k * 0.14), HUD + br * T * 0.4, { n: 12, speed: 120, life: 0.9, g: 160 });
  sfx("win");
}
const mid = i => [(i % bc + 0.5) * T, HUD + (((i / bc) | 0) + 0.5) * T];

/* ---------- fitting ---------- */
function layout(){
  const r = stage.getBoundingClientRect(); if (!r.width || !bc) return;
  const W = bc * T, H = HUD + br * T, fit = Math.min(r.width / W, r.height / H);
  const cols = Math.max(44, Math.round(W * fit / 7)), rows = Math.max(16, Math.round(H * fit / 14));
  if (!pix || pix.W !== W || pix.H !== H || pix.cols !== cols || pix.rows !== rows) pix = createPixels(W, H, cols, rows, 1);
  ready = pix.fit(stage, cv, ctx);
}
// the DIG / FLAG switch in the middle of the HUD, in pixels
const button = () => { const w = Math.max(30, Math.round(pix.W * 0.3)); return { x: (pix.W - w) >> 1, y: 3, w, h: HUD - 6 }; };

/* ---------- drawing ---------- */
const hash = (x, y) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;
function grass(x0, y0, tx, ty, pressed){
  const R = pix.ramp(GRASS[(tx + ty) & 1]), h = hash(tx, ty);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++){
    const edge = pressed ? 2 : y === 0 || x === 0 ? 3 : y === T - 1 || x === T - 1 ? 1 : 2;
    pix.px(x0 + x, y0 + y, R[pressed ? 1 : edge], 2);
  }
  if (pressed) return;
  for (let k = 0; k < 3; k++){   // a few tufts
    const x = 2 + (h * (k + 3)) % (T - 4), y = 3 + (h * (k + 7)) % (T - 5);
    pix.px(x0 + x, y0 + y, R[4], 2); pix.px(x0 + x, y0 + y + 1, R[1], 2);
  }
}
function ground(x0, y0, tx, ty, base){
  const R = pix.ramp(base), h = hash(tx, ty);
  pix.rect(x0, y0, T, T, R[2], 1);
  pix.px(x0 + 2 + h % 7, y0 + 2 + (h >> 3) % 7, R[1], 1); pix.px(x0 + 3 + (h >> 2) % 6, y0 + 4 + (h >> 4) % 6, R[3], 1);
}
function digit(x0, y0, d, c){
  for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (DIGITS[d * 5 + r][k] === "#") pix.rect(x0 + 3 + k * 2, y0 + 1 + r * 2, 2, 2, c, 3);
}
function drawFlag(x0, y0, wrong){
  pix.rect(x0 + 3, y0 + 9, 6, 2, [70, 60, 50], 3);
  pix.line(x0 + 5, y0 + 2, x0 + 5, y0 + 9, [226, 222, 210], 3);
  for (let r = 0; r < 5; r++) pix.rect(x0 + 6, y0 + 2 + r, 3 - Math.abs(r - 2), 1, [230, 56, 44], 3);
  if (wrong){ pix.line(x0 + 1, y0 + 1, x0 + 10, y0 + 10, [255, 220, 60], 3); pix.line(x0 + 10, y0 + 1, x0 + 1, y0 + 10, [255, 220, 60], 3); }
}
function drawMine(x0, y0){
  const cx = x0 + 6, cy = y0 + 6;
  for (let a = 0; a < 8; a++){ const s = a % 2 ? 4 : 5; pix.line(cx, cy, Math.round(cx + Math.cos(a * Math.PI / 4) * s), Math.round(cy + Math.sin(a * Math.PI / 4) * s), [44, 44, 52], 3); }
  pix.ball(cx - 0.5, cy - 0.5, 3.4, [80, 80, 92], 3, true);
}
function draw(){
  pix.clear();
  const W = pix.W, b = button(), held = [...touches.values()].find(p => p.moved < 12 && !p.done);
  const press = held && state !== "lost" && state !== "won" ? cellAt(held) : -1;
  // the HUD band
  pix.rect(0, 0, W, HUD, [26, 34, 30], 1);
  for (let x = 0; x < W; x++) pix.px(x, HUD - 1, [14, 18, 16], 1);
  for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++){
    const rim = y === b.y || y === b.y + b.h - 1 || x === b.x || x === b.x + b.w - 1;
    pix.px(x, y, rim ? (digMode ? [140, 104, 66] : [200, 70, 56]) : (digMode ? [64, 46, 30] : [88, 30, 26]), 3);
  }
  // the field
  for (let ty = 0; ty < br; ty++) for (let tx = 0; tx < bc; tx++){
    const i = ty * bc + tx, x0 = tx * T, y0 = HUD + ty * T, over = state === "lost";
    if (gone[i]){ ground(x0, y0, tx, ty, i === hitAt ? [200, 60, 40] : SCORCH); continue; }
    if (open[i]){ ground(x0, y0, tx, ty, DIRT[(tx + ty) & 1]); if (cnt[i]) digit(x0, y0, cnt[i], NUM[cnt[i]]); continue; }
    if (over && mine[i] && !flag[i]){ ground(x0, y0, tx, ty, DIRT[(tx + ty) & 1]); drawMine(x0, y0); continue; }
    grass(x0, y0, tx, ty, i === press && !flag[i]);
    if (flag[i]) drawFlag(x0, y0, over && !mine[i]);
  }
  if (!INPUT.touch && state !== "lost" && state !== "won"){   // the keyboard cursor
    const x0 = cursor.x * T, y0 = HUD + cursor.y * T, c = [255, 226, 90];
    for (let k = 0; k < T; k++){ pix.px(x0 + k, y0, c, 3); pix.px(x0 + k, y0 + T - 1, c, 3); pix.px(x0, y0 + k, c, 3); pix.px(x0 + T - 1, y0 + k, c, 3); }
  }
  vfx.draw(pix);
  pix.edges();
  // text over it
  const C = pix.cols, hr = Math.floor(HUD / 2 / pix.H * pix.rows), bcol = Math.round((b.x + b.w / 2) / W * C);
  const left = nMines - nFlags, label = digMode ? "DIG" : "FLAG";
  pix.text(1, hr, String(left).padStart(3, " "), left < 0 ? RED : ACCENT);
  pix.text(bcol - (label.length >> 1), hr, label, WHITE);
  pix.text(C - 4, hr, String(Math.min(999, Math.floor(time))).padStart(3, "0"), ACCENT);
  const mr = Math.round(pix.rows * 0.55);
  if (state === "ready" && !menu.open) say(mr, INPUT.touch ? "TAP TO DIG - HOLD TO FLAG" : "CLICK TO DIG - RIGHT-CLICK TO FLAG", WHITE);
  if ((state === "lost" || state === "won") && overT > 0.6 && !menu.open){
    say(mr - 1, msg, state === "won" ? GREEN : RED);
    say(mr + 1, INPUT.touch ? "TAP FOR A NEW FIELD" : "CLICK OR N FOR A NEW FIELD", WHITE);
  }
  if (menu.open) menu.draw(pix, { accent: ACCENT, normal: WHITE, dim: DIM, title: "MEADOW MINES", note: bestNote() });
  pix.present(ctx);
}
// a message over the field: text on MENU_LAYER gets a black box behind it
const say = (row, s, v) => pix.text((pix.cols - s.length - 2) >> 1, row, " " + s + " ", v, MENU_LAYER);
const bestNote = () => "BEST " + NAMES.map(n => n.toUpperCase() + " " + (best[n] === undefined ? "--" : best[n] + "S")).join("  ");

/* ---------- input ---------- */
function cellAt(p){
  const x = Math.floor(p.x * pix.W / T), y = Math.floor((p.y * pix.H - HUD) / T);
  return x >= 0 && y >= 0 && x < bc && y < br ? y * bc + x : -1;
}
const nextField = () => { if (overT > 0.6) newField(); };
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: "NEW FIELD", select: () => { menu.hide(); newField(); } },
  { label: "FIELD", value: () => nextLevel.toUpperCase() + (nextLevel !== level ? " (NEXT)" : ""),
    change: d => { nextLevel = NAMES[(NAMES.indexOf(nextLevel) + (d || 1) + 3) % 3]; if (state !== "play") newField(); } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], { onOpen: () => audio.pause(), onClose: () => audio.resume() });

addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = e.key, mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (mv || k === " ") e.preventDefault();
  if (e.repeat && !mv) return;
  audio.unlock();
  if (k === "Escape" || k === "p" || k === "P") return menu.show();
  if (k === "m" || k === "M") return audio.toggleMute();
  if (k === "n" || k === "N" || k === "r" || k === "R") return newField();
  if (state === "lost" || state === "won"){ if (k === " " || k === "Enter") nextField(); return; }
  if (mv){ cursor.x = Math.max(0, Math.min(bc - 1, cursor.x + mv[0])); cursor.y = Math.max(0, Math.min(br - 1, cursor.y + mv[1])); }
  const i = cursor.y * bc + cursor.x;
  if (k === " " || k === "Enter") act(i, false);
  if (k === "f" || k === "F" || k === "x" || k === "X") act(i, true);
});
// Touch and mouse: a tap digs (or flags, with the switch on FLAG); holding a finger still on a square does the other
// one. A right-click flags. Tapping the switch in the HUD flips it.
let button0 = 0;
stage.addEventListener("pointerdown", e => { button0 = e.button; }, true);
stage.addEventListener("contextmenu", e => e.preventDefault());
const HOLD = 0.38;   // seconds a still finger takes to flag
const touches = createTouch(cv, {
  down: p => { audio.unlock(); p.t = 0; },
  up: p => {
    if (p.done || !p.tap || !pix) return;
    if (menu.open) return menu.tap(Math.floor(p.x * pix.cols), Math.floor(p.y * pix.rows));
    if (state === "lost" || state === "won") return nextField();
    const b = button(), x = p.x * pix.W, y = p.y * pix.H;
    if (x >= b.x - 4 && x < b.x + b.w + 4 && y < HUD){ digMode = !digMode; sfx("switch"); return; }
    const i = cellAt(p); if (i < 0) return;
    cursor = { x: i % bc, y: (i / bc) | 0 };
    act(i, button0 === 2 ? true : !digMode);
  }
});
headerButtons(menu, audio);

/* ---------- loop ---------- */
function tick(dt){
  if (!ready) return;
  if (!menu.open && (dt = feel.step(dt))){
    vfx.update(dt);
    if (state === "play") time += dt;
    if (state === "lost" || state === "won") overT += dt;
    for (const q of boomQ) if ((q.t -= dt) <= 0 && !gone[q.j]) blow(q.j);
    for (const p of touches.values()){   // a held finger
      if (p.done || p.moved >= 12 || (p.t += dt) < HOLD || state === "lost" || state === "won") continue;
      p.done = true; const i = cellAt(p);
      if (i >= 0 && !open[i]) act(i, digMode);
    }
  }
  feel.begin(ctx, cv); draw(); feel.end(ctx, cv);
}
newField();
onResize(stage, layout);
startLoop(tick);
})();
