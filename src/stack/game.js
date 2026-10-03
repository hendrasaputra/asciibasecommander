(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a 10 x 20 board. Each board cell is drawn as a lit slab 4 characters wide and 2 rows tall, which is
// about square. Cleared lines and the final stack break into engine boxes that tumble down the well; the locked
// stack is an engine terrain grid, so the pieces land on it.
const BW = 10, BH = 20, CW = 4, CH = 2;           // board size; characters per board cell
const BX = 19, BY = 1;                             // where the well starts on the character grid
const GW = BX + BW * CW + 19, GH = BY + BH * CH + 2;
const PIECES = {   // spawn shapes in their n x n rotation box (SRS); O does not turn
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], rgb: [0.1, 0.8, 0.95] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], rgb: [0.15, 0.3, 1.0] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], rgb: [1.0, 0.45, 0.05] },
  O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], rgb: [1.0, 0.8, 0.05] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], rgb: [0.2, 0.95, 0.2] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], rgb: [0.7, 0.2, 1.0] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], rgb: [1.0, 0.12, 0.15] }
};
const KINDS = Object.keys(PIECES);
for (const k of KINDS) PIECES[k].rgb = PIECES[k].rgb.map(v => v * 0.3);   // these are albedos: the lamp is bright
// SRS wall kicks for a clockwise turn from each rotation state, as [dx, dy] with y down.
// A counter-clockwise turn from state r + 1 to r tries the same offsets negated.
const KICKS = [[[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
               [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]];
const KICKS_I = [[[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
                 [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]]];
const LINE_SCORE = [0, 100, 300, 500, 800];
const LOCK_SECS = 0.5, LOCK_RESETS = 15, DAS = 0.16, ARR = 0.05, SOFT = 0.04, CLEAR_SECS = 0.3;
const WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], ACCENT = [1.6, 1.2, 0.45];
const BLOCK = { name: "block", density: 1, e: 0.3, mu: 0.6, kd: 0.9, ks: 0.25, shine: 16 };
const WALL = { name: "wall", density: 1, e: 0.2, mu: 0.7, kd: 0.9, ks: 0.1, shine: 8 };
const FONT = {   // 5x5 block letters for the title
  S: [".####", "#....", ".###.", "....#", "####."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  A: [".###.", "#...#", "#####", "#...#", "#...#"], C: [".####", "#....", "#....", "#....", ".####"],
  K: ["#...#", "#..#.", "###..", "#..#.", "#...#"], M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  H: ["#...#", "#...#", "#####", "#...#", "#...#"]
};

const D = defaultDisplay(); D.room = 0.3; D.glow = 0.3; D.lampRGB = [1.0, 0.92, 0.8];   // a warm lamp over the well
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
const world = new World(), lamp = { x: 0, y: 0, z: 0, on: true };
let screen = null, state = "title", stateT = 0;
let board = new Array(BW * BH).fill(null), flash = new Float32Array(BW * BH);   // board cells hold a piece kind or null
let cur = null, bag = [], queue = [], held = null, canHold = true;
let score = 0, lines = 0, level = 1, startLevel = 1, nextStartLevel = 1;
let fallT = 0, lockT = 0, resets = 0, lowest = 0, das = { dir: 0, t: 0 }, clearing = [], msg = "", msgT = 0, best = false;
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;

/* ---------- high scores ---------- */
const SCORES_KEY = "stackSmash.v1.scores";
let scores = [];
try { scores = JSON.parse(localStorage.getItem(SCORES_KEY)) || []; } catch (e){}
function saveScore(){
  const entry = { score, lines, level };
  scores.push(entry); scores.sort((a, b) => b.score - a.score); scores = scores.slice(0, 5);
  best = score > 0 && scores[0] === entry;
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(scores)); } catch (e){ console.warn("Stack Smash: could not save scores", e); }
}

/* ---------- sound: effects and music from audio/stack-sfx.py (STACK_SFX, STACK_MUSIC) ---------- */
// Browsers only allow audio after a user gesture, so nothing is decoded until the first key or tap.
const MUTE_KEY = "stackSmash.v1.muted";
let actx = null, master = null, buffers = {}, unlocked = false, muted = false, song = null;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e){}
function unlockAudio(){
  if (unlocked) return;
  unlocked = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC){ console.warn("Stack Smash: Web Audio not supported, playing silent"); return; }
  actx = new AC(); master = actx.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(actx.destination);
  const decode = (k, v) => actx.decodeAudioData(Uint8Array.from(atob(v), c => c.charCodeAt(0)).buffer,
    b => { buffers[k] = b; if (k === "music" && state === "play") playMusic(true); }, e => console.warn("Stack Smash: could not decode sound", k, e));
  for (const [k, v] of Object.entries(STACK_SFX)) decode(k, v);
  decode("music", STACK_MUSIC.data);
}
function sfx(name){
  const b = buffers[name]; if (!b || muted) return;
  const src = actx.createBufferSource(); src.buffer = b; src.connect(master); src.start();
}
function playMusic(on){
  if (song){ song.stop(); song = null; }
  if (!on || !buffers.music) return;
  const g = actx.createGain(); g.gain.value = 0.35; g.connect(master);
  song = actx.createBufferSource(); song.buffer = buffers.music; song.loop = true;
  song.loopStart = STACK_MUSIC.loopStart; song.loopEnd = STACK_MUSIC.loopEnd;
  song.connect(g); song.start(0, STACK_MUSIC.loopStart);
}
function toggleMute(){
  unlockAudio(); muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, actx.currentTime, 0.02);
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e){ console.warn("Stack Smash: could not save sound setting", e); }
}

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
  world.w = W; world.h = H; world.unit = screen.cw; world.drag = 2e-4 * (600 / H) ** 2; world.g = { x: 0, y: H * 1.4 };
  if (world.terrain){ world.terrain.cw = screen.cw; world.terrain.ch = screen.ch; }
  lamp.x = cx(BX + BW * CW / 2); lamp.y = cy(BY + 4); lamp.z = screen.ch * 34;
  if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const b of world.bodies){ b.x *= kx; b.y *= ky; b.r *= kx; if (b.box){ b.hw *= kx; b.hh *= kx; } } }
}

/* ---------- the well as engine terrain: walls, floor and every locked cell ---------- */
function rebuildTerrain(withStack = true){
  const solid = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++){ solid[gy * GW + BX - 1] = 1; solid[gy * GW + BX + BW * CW] = 1; }
  for (let gx = BX - 1; gx <= BX + BW * CW; gx++) solid[(BY + BH * CH) * GW + gx] = 1;
  if (withStack) for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (board[y * BW + x])
    for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) solid[(BY + y * CH + r) * GW + BX + x * CW + c] = 1;
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid, mat: WALL };
}

/* ---------- pieces ---------- */
function shape(kind, rot){   // cells after turning clockwise rot times: (x, y) -> (n - 1 - y, x)
  const P = PIECES[kind];
  let cells = P.cells;
  if (kind !== "O") for (let k = 0; k < rot; k++) cells = cells.map(([x, y]) => [P.n - 1 - y, x]);
  return cells;
}
function fits(kind, rot, px, py){   // rows above the board (y < 0) count as empty, so pieces can spawn there
  return shape(kind, rot).every(([x, y]) => { const bx = px + x, by = py + y; return bx >= 0 && bx < BW && by < BH && (by < 0 || !board[by * BW + bx]); });
}
function nextKind(){
  while (queue.length < 4){
    if (!bag.length){ bag = [...KINDS]; for (let i = bag.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }   // 7-bag
    queue.push(bag.pop());
  }
  return queue.shift();
}
function spawn(kind){
  cur = { kind, rot: 0, x: kind === "O" ? 4 : 3, y: -1 };
  fallT = 0; lockT = 0; resets = 0; lowest = cur.y;
  if (!fits(kind, 0, cur.x, cur.y)) return gameOver();
  if (fits(kind, 0, cur.x, cur.y + 1)) cur.y++;   // drop into view straight away
}
const gravity = () => Math.pow(0.8 - (level - 1) * 0.007, level - 1);   // seconds per row, as in the modern guideline
function tryMove(dx, dy){
  if (!fits(cur.kind, cur.rot, cur.x + dx, cur.y + dy)) return false;
  cur.x += dx; cur.y += dy;
  if (cur.y > lowest){ lowest = cur.y; resets = 0; }
  if (dx) touched();
  return true;
}
function touched(){ if (!fits(cur.kind, cur.rot, cur.x, cur.y + 1) && resets < LOCK_RESETS){ lockT = 0; resets++; } }   // moving on the floor delays the lock
function turn(dir){   // dir 1 clockwise, -1 counter-clockwise
  if (cur.kind === "O") return;
  const from = cur.rot, to = (from + dir + 4) % 4, table = cur.kind === "I" ? KICKS_I : KICKS;
  const kicks = dir > 0 ? table[from] : table[to].map(([x, y]) => [-x, -y]);
  for (const [kx, ky] of kicks) if (fits(cur.kind, to, cur.x + kx, cur.y + ky)){
    cur.rot = to; cur.x += kx; cur.y += ky; touched(); sfx("rotate"); return;
  }
}
function ghostY(){ let y = cur.y; while (fits(cur.kind, cur.rot, cur.x, y + 1)) y++; return y; }
function hardDrop(){
  const y = ghostY(), n = y - cur.y;
  cur.y = y; score += 2 * n;
  // the slam shoves any loose debris in the well away from where it lands
  const cells = shape(cur.kind, cur.rot), mx = cells.reduce((s, [x]) => s + x, 0) / 4, my = cells.reduce((s, [, yy]) => s + yy, 0) / 4;
  world.forces.push({ x: cx(BX + (cur.x + mx) * CW + 1.5), y: cy(BY + (cur.y + my) * CH + 1), radius: screen.ch * 8, strength: world.h * 15, t: 0.06 });
  sfx("drop"); lock(0.5);
}
function holdPiece(){
  if (!canHold) return;
  const k = cur.kind; canHold = false; sfx("hold");
  if (held){ const h = held; held = k; spawn(h); } else { held = k; spawn(nextKind()); }
}
function lock(flashK = 0.25){
  const cells = shape(cur.kind, cur.rot);
  if (cells.some(([, y]) => cur.y + y < 0)) return gameOver();   // locked above the top of the well
  for (const [x, y] of cells){ const i = (cur.y + y) * BW + cur.x + x; board[i] = cur.kind; flash[i] = flashK; }
  if (flashK < 0.5) sfx("lock");
  cur = null; canHold = true;
  clearing = [];
  for (let y = 0; y < BH; y++) if (board.slice(y * BW, y * BW + BW).every(Boolean)) clearing.push(y);
  if (!clearing.length){ rebuildTerrain(); spawn(nextKind()); return; }
  const n = clearing.length, before = level;
  score += LINE_SCORE[n] * level; lines += n; level = startLevel + Math.floor(lines / 10);
  for (const y of clearing) for (let x = 0; x < BW; x++){ shatter(x, y, board[y * BW + x], n === 4 ? 1.6 : 1); board[y * BW + x] = null; }
  sfx(n === 4 ? "smash" : "clear");
  if (level > before){ sfx("level"); say("LEVEL " + level, 1.5); }
  else if (n === 4) say("SMASH!", 1.2);
  rebuildTerrain();   // the cleared rows are open now, so the debris flies out of them
  state = "clear"; stateT = 0;
}
// A board cell becomes a tumbling engine box of its colour.
function shatter(x, y, kind, k){
  const b = world.addBox(cx(BX + x * CW + 1.5), cy(BY + y * CH + 0.5), screen.cw * CW * 0.42, screen.ch * CH * 0.42, "block", PIECES[kind].rgb, BLOCK);
  const sp = (200 + Math.random() * 300) * k;
  b.vx = (x - (BW - 1) / 2) * 50 * k + (Math.random() - 0.5) * sp; b.vy = -sp - Math.random() * 200; b.w = (Math.random() - 0.5) * 24;
  b.flash = 1; b.life = 1.8 + Math.random() * 0.8; b.hw0 = b.hw; b.hh0 = b.hh;
  return b;
}
function collapse(){   // drop the rows above each cleared line
  for (const y of clearing){
    board.copyWithin(BW, 0, y * BW); flash.copyWithin(BW, 0, y * BW);
    board.fill(null, 0, BW); flash.fill(0, 0, BW);
  }
  clearing = []; rebuildTerrain();
}
function gameOver(){
  state = "over"; stateT = 0; cur = null; playMusic(false); sfx("over"); saveScore();
  // the whole stack comes apart and falls down the well; the last drop's shove would fling it at the walls
  world.forces.length = 0;
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (board[y * BW + x]){
    const b = shatter(x, y, board[y * BW + x], 0.3); b.vy = -Math.random() * 150; b.life = 0;
  }
  board.fill(null); rebuildTerrain(false);
}
function say(text, secs){ msg = text; msgT = secs; }
function newGame(){
  world.bodies.length = 0; world.forces.length = 0;
  board.fill(null); flash.fill(0); bag = []; queue = []; held = null; canHold = true;
  startLevel = nextStartLevel; level = startLevel; score = 0; lines = 0; best = false; msgT = 0;
  rebuildTerrain(); state = "play"; stateT = 0;
  sfx("start"); playMusic(true);
  spawn(nextKind());
}

/* ---------- update ---------- */
function update(dt){
  stateT += dt; msgT -= dt;
  for (let i = 0; i < flash.length; i++) if (flash[i] > 0) flash[i] = Math.max(0, flash[i] - dt * 2);
  if (state === "clear"){ if (stateT >= CLEAR_SECS){ collapse(); state = "play"; spawn(nextKind()); } return; }
  if (state !== "play" || !cur) return;
  // left/right: one step on press, then auto-repeat after a short delay
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  if (dir !== das.dir){ das.dir = dir; das.t = -DAS; if (dir && tryMove(dir, 0)) sfx("move"); }
  else if (dir){ das.t += dt; while (das.t >= 0){ if (tryMove(dir, 0)) sfx("move"); das.t -= ARR; } }
  const step = keys.down ? Math.min(SOFT, gravity()) : gravity();
  if (fits(cur.kind, cur.rot, cur.x, cur.y + 1)){
    lockT = 0; fallT += dt;
    while (fallT >= step && tryMove(0, 1)){ fallT -= step; if (keys.down) score++; }
  } else if ((lockT += dt) >= LOCK_SECS) lock();
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, TEXT_LAYER, s.charCodeAt(i)); }   // stays letters in pixel mode
const center = (gy, s, rgb) => text(Math.floor((GW - s.length) / 2), gy, s, rgb);
const slab = { box: true, a: 0, mat: BLOCK, flash: 0 };
function block(gx, gy, w, h, rgb, fl, layer = 2){   // a lit raised slab covering w x h characters from (gx, gy)
  slab.x = gx * screen.cw + w * screen.cw / 2; slab.y = gy * screen.ch + h * screen.ch / 2;
  slab.hw = w * screen.cw * 0.48; slab.hh = h * screen.ch * 0.48; slab.r = Math.hypot(slab.hw, slab.hh);
  slab.alb = rgb; slab.flash = fl;
  if (layer === 2) return screen.box(slab, lamp);
  // the falling piece and the title sit above the debris: shade, then lift the cells to layer 3. Drawn before the
  // debris, so the debris can't take these cells.
  screen.box(slab, lamp);
  screen.raise(gx, gy, w, h, layer);
}
function cellAt(x, y, rgb, fl, layer){ if (y >= 0) block(BX + x * CW, BY + y * CH, CW, CH, rgb, fl, layer); }
function mini(kind, gx, gy){   // a piece in a side panel, centred in a 16 x 4 area
  const cells = shape(kind, 0), xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  const ox = gx + ((16 - w * CW) >> 1) - Math.min(...xs) * CW, oy = gy + ((4 - h * CH) >> 1) - Math.min(...ys) * CH;
  for (const [x, y] of cells) block(ox + x * CW, oy + y * CH, CW, CH, PIECES[kind].rgb, 0);
}
function drawWell(){
  const wall = [0.35, 0.38, 0.5];
  for (let gy = BY; gy < BY + BH * CH; gy++){ put(BX - 1, gy, wall, 1, 1, 124); put(BX + BW * CW, gy, wall, 1, 1, 124); }
  for (let gx = BX - 1; gx <= BX + BW * CW; gx++) put(gx, BY + BH * CH, wall, 1, 1, 61);
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) put(BX + x * CW + 1, BY + y * CH + 1, DIM, 0.35, 0, 46);   // a faint dot in each cell
}
function drawTitle(t){
  [["STACK", 6], ["SMASH", 13]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((GW - word.length * 12 + 2) / 2);
    [...word].forEach((ch, li) => {
      const rgb = PIECES[KINDS[(li + wi * 5) % 7]].rgb;
      FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#") block(x0 + li * 12 + dx * 2, y0 + dy, 2, 1, rgb, 0.15 + 0.15 * Math.sin(t * 0.004 - li), 3); });
    });
  });
  const blink = (performance.now() / 500 | 0) % 2;
  center(21, touchMode ? "PRESS A OR START" : "PRESS SPACE TO START", blink ? WHITE : DIM);
  center(23, "STARTING LEVEL " + nextStartLevel, DIM);
  if (touchMode){
    center(26, "D-PAD MOVE   DOWN SOFT DROP   UP DROP", DIM);
    center(27, "A TURN   B TURN BACK   START HOLD   SELECT MENU", DIM);
  } else {
    center(26, "LEFT/RIGHT MOVE   UP OR X TURN   Z TURN BACK", DIM);
    center(27, "DOWN SOFT DROP   SPACE DROP   C HOLD   ESC MENU", DIM);
  }
  if (scores.length){
    center(30, "HIGH SCORES", ACCENT);
    scores.forEach((s, i) => center(32 + i, `${i + 1}. ${String(s.score).padStart(7)}   LV ${String(s.level).padStart(2)}   ${String(s.lines).padStart(3)} LINES`, i ? DIM : WHITE));
  }
}
function drawPanels(){
  const L = 1, R = BX + BW * CW + 2;
  text(L, BY + 1, "HOLD", canHold ? WHITE : DIM);
  if (held) mini(held, L, BY + 3);
  [["SCORE", score], ["LEVEL", level], ["LINES", lines], ["BEST", Math.max(score, scores[0] ? scores[0].score : 0)]].forEach(([k, v], i) => {
    text(L, BY + 10 + i * 4, k, DIM); text(L, BY + 11 + i * 4, String(v), i ? WHITE : ACCENT);
  });
  text(R, BY + 1, "NEXT", WHITE);
  queue.slice(0, 3).forEach((k, i) => mini(k, R, BY + 3 + i * 6));
}
function draw(t){
  screen.clear();
  if (state === "title"){
    drawTitle(t);
    for (const b of world.bodies) screen.sphere(b, lamp, { stripe: false });
    drawMenu(); screen.render(ctx); return;
  }
  drawWell();
  for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++){ const k = board[y * BW + x]; if (k) cellAt(x, y, PIECES[k].rgb, flash[y * BW + x]); }
  if (cur){
    const cells = shape(cur.kind, cur.rot), gy = ghostY(), rgb = PIECES[cur.kind].rgb;
    for (const [x, y] of cells) if (gy + y >= 0) for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++)   // the ghost: where it will land
      put(BX + (cur.x + x) * CW + c, BY + (gy + y) * CH + r, rgb, 0.3, 1, c === 0 || c === CW - 1 ? 58 : 46);
    for (const [x, y] of cells) cellAt(cur.x + x, cur.y + y, rgb, lockT / LOCK_SECS * 0.3, 3);
  }
  for (const b of world.bodies) screen.sphere(b, lamp, { stripe: false });
  drawPanels();
  const mid = BY + BH;
  if (state === "over" && stateT > 1){
    center(mid - 2, "  GAME OVER  ", WHITE);
    center(mid, `  ${score} POINTS  `, ACCENT);
    if (best) center(mid + 2, "  NEW HIGH SCORE!  ", ACCENT);
    center(mid + 4, touchMode ? "  PRESS START  " : "  PRESS SPACE  ", DIM);
  } else if (msgT > 0) center(mid - 6, "  " + msg + "  ", WHITE);
  const hint = touchMode ? " SELECT MENU " : " ESC MENU ";
  text(GW - 1 - hint.length, GH - 1, hint, DIM);
  drawMenu();
  screen.render(ctx);
}
function drawMenu(){
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw({ text: (x, y, str, rgb) => { for (let i = 0; i < str.length; i++) put(x + i, y, rgb, 1, MENU_LAYER, str.charCodeAt(i)); }, GW, GH, accent: ACCENT, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "LEVEL APPLIES TO THE NEXT GAME" });
}

/* ---------- title: pieces of every colour tumble down the screen ---------- */
let rainT = 0;
function rain(dt){
  if ((rainT -= dt) > 0 || world.bodies.length > 40) return;
  rainT = 0.35;
  const k = KINDS[Math.floor(Math.random() * 7)], x = world.w * (0.05 + Math.random() * 0.9);
  const b = world.addBox(x, -screen.ch * 4, screen.cw * CW * 0.42, screen.ch * CH * 0.42, "block", PIECES[k].rgb, BLOCK);
  b.vx = (Math.random() - 0.5) * 200; b.w = (Math.random() - 0.5) * 6; b.life = 7; b.hw0 = b.hw; b.hh0 = b.hh;
}

/* ---------- input ---------- */
const keys = { left: false, right: false, down: false };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowDown: "down", s: "down", S: "down" };
function action(){   // start from the title; back to the title from game over
  if (state === "title") newGame();
  else if (state === "over" && stateT > 1){ state = "title"; world.bodies.length = 0; world.terrain = null; }
}
const playing = () => state === "play" && cur;
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "title" ? "START GAME" : "RESTART", select: () => { menu.hide(); unlockAudio(); newGame(); } },
  { label: "STARTING LEVEL", value: () => String(nextStartLevel), change: d => { nextStartLevel = (nextStartLevel + d + 14) % 15 + 1; } },
  { label: "SOUND", value: () => muted ? "OFF" : "ON", change: () => toggleMute() },
  { label: "CONTROLS", value: () => touchMode ? "TOUCH" : "KEYBOARD", change: () => setControls(!touchMode, true) },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { for (const k in keys) keys[k] = false; if (actx) actx.suspend(); },
  onClose: () => { if (actx) actx.resume(); }
});
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.key === " " || e.key === "ArrowUp") e.preventDefault();
  if (e.repeat) return;
  unlockAudio();
  if (e.key === "Escape" || e.key === "p" || e.key === "P") return menu.show();
  if (e.key === "m" || e.key === "M") return toggleMute();
  if (e.key === "r" || e.key === "R") return newGame();
  if (!playing()){ if (e.key === " " || e.key === "Enter") action(); return; }
  if (e.key === " ") hardDrop();
  else if (e.key === "ArrowUp" || e.key === "x" || e.key === "X" || e.key === "w" || e.key === "W") turn(1);
  else if (e.key === "z" || e.key === "Z" || e.key === "Control") turn(-1);
  else if (e.key === "c" || e.key === "C" || e.key === "Shift") holdPiece();
});
addEventListener("keyup", e => { const k = KEYMAP[e.key]; if (k) keys[k] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

const CTRL_KEY = "stackSmash.v1.controls";
let touchMode = matchMedia("(pointer: coarse)").matches;   // default follows the device; the menu's Controls row overrides it
try { const c = localStorage.getItem(CTRL_KEY); if (c) touchMode = c === "touch"; } catch (e){}
function setControls(touch, save){
  touchMode = touch; document.body.classList.toggle("touch", touch); $("gamepad").hidden = !touch;
  if (save) try { localStorage.setItem(CTRL_KEY, touch ? "touch" : "keyboard"); } catch (e){ console.warn("Stack Smash: could not save controls setting", e); }
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
  if (changed && dir === "up" && playing()) hardDrop();
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
    if (!playing()){ if (id === "a" || id === "start") action(); return; }
    if (id === "a") turn(1); else if (id === "b") turn(-1); else holdPiece();
  });
  const up = () => b.classList.remove("on");
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
});
cv.addEventListener("pointerdown", e => {
  unlockAudio();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!touchMode) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
let last = performance.now(), nextFrame = 0;
const FRAME_MS = 1000 / 60;
function tick(t){
  requestAnimationFrame(tick);
  if (t < nextFrame - 1) return;   // run at most ~60 times a second, even on faster displays
  nextFrame = t - nextFrame > FRAME_MS ? t + FRAME_MS : nextFrame + FRAME_MS;
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
  if (screen && !menu.open){   // the open menu pauses everything
    if (state === "title") rain(dt); else update(dt);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){   // debris shrinks away in its last second
      b.life -= dt; const k = Math.max(0.2, Math.min(1, b.life)); b.hw = b.hw0 * k; b.hh = b.hh0 * k; b.r = Math.hypot(b.hw, b.hh);
    }
    world.bodies = world.bodies.filter(b => !(b.life < 0));
  }
  if (screen) draw(t);
}
layout();
let fitted = stage.getBoundingClientRect();
new ResizeObserver(() => {   // re-fit only for real size changes, not the mobile address bar sliding in and out
  const r = stage.getBoundingClientRect();
  if (Math.abs(r.width - fitted.width) < 1 && Math.abs(r.height - fitted.height) < fitted.height * 0.15) return;
  fitted = r; if (screen) layout();
}).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
