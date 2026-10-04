(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a small board per player. Each board cell is drawn as a lit slab 4 characters wide and 2 rows tall,
// which is about square. Cleared cells break into engine bodies that tumble down the well; the locked stack is an
// engine terrain grid, so the pieces land on it. Four games share the well:
//   CLASSIC  falling blocks after Tetris: 7-bag, SRS turns, hold, T-spins, back-to-back and combos;
//   VERSUS   the same on two wells, where clears send garbage rows across (against the computer or a second player);
//   COLUMNS  after Columns: three jewels fall as a column; three or more in a row (any direction) clear;
//   PUYO     after Puyo Puyo: round pairs fall; four or more touching of one colour clear. Clears chain.
const CW = 4, CH = 2;                              // characters per board cell
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
const GARBAGE_RGB = [0.16, 0.16, 0.18];
// Jewels (Columns) and blobs (Puyo): colour numbers 1..6, as albedos.
const GEM_RGB = [null, [0.95, 0.15, 0.15], [0.15, 0.85, 0.2], [0.2, 0.35, 1.0], [1.0, 0.85, 0.1], [0.75, 0.2, 0.95], [1.0, 0.5, 0.1]].map(c => c && c.map(v => v * 0.3));
// SRS wall kicks for a clockwise turn from each rotation state, as [dx, dy] with y down.
// A counter-clockwise turn from state r + 1 to r tries the same offsets negated.
const KICKS = [[[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
               [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]]];
const KICKS_I = [[[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]], [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
                 [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]], [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]]];
// Scoring, times the level, as in the modern guideline. Back-to-back (a Tetris or a T-spin clear after another)
// is worth half as much again; each lock that keeps a run of clears going adds 50 x the combo.
const LINE_SCORE = [0, 100, 300, 500, 800], TSPIN_SCORE = [400, 800, 1200, 1600], MINI_SCORE = [100, 200, 400];
// Garbage sent in VERSUS: by lines cleared, for T-spins, and for combos; back-to-back adds one.
const SEND = [0, 0, 1, 2, 4], TSPIN_SEND = [0, 2, 4, 6], COMBO_SEND = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];
const PUYO_CHAIN = [0, 8, 16, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320];   // a chain's power, Puyo-style
const LOCK_SECS = 0.5, LOCK_RESETS = 15, DAS = 0.16, ARR = 0.05, SOFT = 0.04, CLEAR_SECS = 0.3;
const WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], ACCENT = [1.6, 1.2, 0.45], RED = [1.6, 0.3, 0.25];
const BLOCK = { name: "block", density: 1, e: 0.3, mu: 0.6, kd: 0.9, ks: 0.25, shine: 16 };
const BLOB = { name: "blob", density: 0.8, e: 0.55, mu: 0.4, kd: 0.85, ks: 0.6, shine: 30 };
const WALL = { name: "wall", density: 1, e: 0.2, mu: 0.7, kd: 0.9, ks: 0.1, shine: 8 };
const FONT = {   // 5x5 block letters for the title
  S: [".####", "#....", ".###.", "....#", "####."], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  A: [".###.", "#...#", "#####", "#...#", "#...#"], C: [".####", "#....", "#....", "#....", ".####"],
  K: ["#...#", "#..#.", "###..", "#..#.", "#...#"], M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
  H: ["#...#", "#...#", "#####", "#...#", "#...#"]
};
const MODES = ["classic", "versus", "columns", "puyo"];
const MODE_NAME = { classic: "CLASSIC", versus: "VERSUS", columns: "COLUMNS", puyo: "PUYO" };
const FOES = ["easy", "normal", "hard", "player"];
const FOE_NAME = { easy: "COMPUTER, EASY", normal: "COMPUTER, NORMAL", hard: "COMPUTER, HARD", player: "PLAYER 2" };
const CPU_STEP = { easy: 0.28, normal: 0.14, hard: 0.06 };   // seconds between the computer's moves

const D = defaultDisplay(); D.room = 0.3; D.glow = 0.3; D.lampRGB = [1.0, 0.92, 0.8];   // a warm lamp over the well
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
const world = new World(), lamp = { x: 0, y: 0, z: 0, on: true };
let screen = null, state = "title", stateT = 0, GW = 78, GH = 43;
let mode = "classic", nextMode = "classic", foe = "normal", nextFoe = "normal", players = [], startLevel = 1, nextStartLevel = 1, best = false, winner = -1;
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const rule = () => mode === "columns" || mode === "puyo" ? mode : "blocks";

/* ---------- saved settings, high scores and sound (src/arcade.js) ---------- */
const store = prefs("stackSmash.v1.", "Stack Smash"), scores = scoreTable(store);
// one table per single-player game; CLASSIC keeps the original key so old scores stay
const tables = { classic: scores, columns: scoreTable(store, 5, "scores.columns"), puyo: scoreTable(store, 5, "scores.puyo") };
function saveScore(p){ const T = tables[mode]; if (T) best = p.score > 0 && T.add({ score: p.score, lines: p.lines, level: p.level }).rank === 0; }
// effects and Korobeiniki, made by audio/stack-sfx.py
const audio = createAudio({ label: "Stack Smash", store, sounds: STACK_SFX, music: { music: STACK_MUSIC }, volume: 1, musicGain: 0.32 });
const sfx = name => audio.play(name), playMusic = on => audio.music(on ? "music" : null);

/* ---------- the screen: one well, or two side by side ---------- */
function sizes(){   // board size and screen grid for the mode
  const bw = rule() === "blocks" ? 10 : 6, bh = rule() === "blocks" ? 20 : rule() === "columns" ? 13 : 12;
  const w = bw * CW;
  if (mode === "versus") return { bw, bh, GW: 2 * (17 + w + 2) + 3, GH: bh * CH + 3, bx: [18, 17 + w + 2 + 3 + 2] };
  return { bw, bh, GW: 78, GH: 43, bx: [(78 - w) >> 1] };
}
function layout(force){
  const S = sizes(); if (state === "title"){ S.GW = 78; S.GH = 43; }
  const old = screen; GW = S.GW; GH = S.GH;
  screen = fitGrid(stage, cv, ctx, D, GW, GH) || old; if (screen === old && !force) return;
  const W = GW * screen.cw, H = GH * screen.ch;
  world.w = W; world.h = H; world.unit = screen.cw; world.drag = 2e-4 * (600 / H) ** 2; world.g = { x: 0, y: H * 1.4 };
  lamp.x = W / 2; lamp.y = cy(5); lamp.z = screen.ch * 34;
  if (old && old !== screen) rescaleBodies(world, old, screen);
  if (players.length) rebuildTerrain();
}

/* ---------- a player: one board and everything about it ---------- */
function newPlayer(i, bx, cpu){
  const S = sizes();
  return { i, bx, by: 1, bw: S.bw, bh: S.bh, board: new Array(S.bw * S.bh).fill(null), flash: new Float32Array(S.bw * S.bh),
    cur: null, bag: [], queue: [], held: null, canHold: true, score: 0, lines: 0, level: startLevel,
    fallT: 0, lockT: 0, resets: 0, lowest: 0, das: { dir: 0, t: 0 }, clearing: [], mode: "play", modeT: 0, chain: 0,
    combo: -1, b2b: false, pending: 0, sent: 0, lastRot: false, lastKick: 0, msg: "", msgT: 0,
    keys: { left: false, right: false, down: false }, cpu: cpu ? { level: cpu, t: 0, plan: null } : null, seed: 0 };
}
const at = (p, x, y) => p.board[y * p.bw + x];
function rebuildTerrain(withStack = true){   // walls, floor and every locked cell, for the debris to land on
  const solid = new Uint8Array(GW * GH);
  for (const p of players){
    const x0 = p.bx - 1, x1 = p.bx + p.bw * CW, yf = p.by + p.bh * CH;
    for (let gy = 0; gy < GH; gy++){ solid[gy * GW + x0] = 1; solid[gy * GW + x1] = 1; }
    for (let gx = x0; gx <= x1; gx++) if (yf < GH) solid[yf * GW + gx] = 1;
    if (withStack) for (let y = 0; y < p.bh; y++) for (let x = 0; x < p.bw; x++) if (at(p, x, y))
      for (let r = 0; r < CH; r++) for (let c = 0; c < CW; c++) solid[(p.by + y * CH + r) * GW + p.bx + x * CW + c] = 1;
  }
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid, mat: WALL };
}
function say(p, text, secs){ p.msg = text; p.msgT = secs; }
const gravity = p => Math.pow(0.8 - (p.level - 1) * 0.007, p.level - 1);   // seconds per row, as in the modern guideline

/* ---------- falling blocks (CLASSIC and VERSUS) ---------- */
function shape(kind, rot){   // cells after turning clockwise rot times: (x, y) -> (n - 1 - y, x)
  const P = PIECES[kind];
  let cells = P.cells;
  if (kind !== "O") for (let k = 0; k < rot; k++) cells = cells.map(([x, y]) => [P.n - 1 - y, x]);
  return cells;
}
function fits(p, kind, rot, px, py, board = p.board){   // rows above the board (y < 0) count as empty, so pieces can spawn there
  return shape(kind, rot).every(([x, y]) => { const bx = px + x, by = py + y; return bx >= 0 && bx < p.bw && by < p.bh && (by < 0 || !board[by * p.bw + bx]); });
}
// The 7-bag. In VERSUS both players get the same sequence, so neither is luckier.
let bagSeed = 1;
function nextKind(p){
  while (p.queue.length < 4){
    if (!p.bag.length){
      let s = (bagSeed * 2654435761 + p.seed++ * 40503) >>> 0; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
      p.bag = [...KINDS]; for (let i = p.bag.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [p.bag[i], p.bag[j]] = [p.bag[j], p.bag[i]]; }
    }
    p.queue.push(p.bag.pop());
  }
  return p.queue.shift();
}
function spawn(p, kind){
  p.cur = { kind, rot: 0, x: kind === "O" ? 4 : 3, y: -1 };
  p.fallT = 0; p.lockT = 0; p.resets = 0; p.lowest = p.cur.y; p.lastRot = false;
  if (!fits(p, kind, 0, p.cur.x, p.cur.y)) return topOut(p);
  if (fits(p, kind, 0, p.cur.x, p.cur.y + 1)) p.cur.y++;   // drop into view straight away
  if (p.cpu) p.cpu.plan = null;
}
function tryMove(p, dx, dy){
  const c = p.cur;
  if (!fits(p, c.kind, c.rot, c.x + dx, c.y + dy)) return false;
  c.x += dx; c.y += dy; p.lastRot = false;
  if (c.y > p.lowest){ p.lowest = c.y; p.resets = 0; }
  if (dx) touched(p);
  return true;
}
function touched(p){ const c = p.cur; if (!fits(p, c.kind, c.rot, c.x, c.y + 1) && p.resets < LOCK_RESETS){ p.lockT = 0; p.resets++; } }   // moving on the floor delays the lock
function turn(p, dir){   // dir 1 clockwise, -1 counter-clockwise
  const c = p.cur;
  if (c.kind === "O") return;
  const from = c.rot, to = (from + dir + 4) % 4, table = c.kind === "I" ? KICKS_I : KICKS;
  const kicks = dir > 0 ? table[from] : table[to].map(([x, y]) => [-x, -y]);
  for (let k = 0; k < kicks.length; k++){ const [kx, ky] = kicks[k];
    if (fits(p, c.kind, to, c.x + kx, c.y + ky)){ c.rot = to; c.x += kx; c.y += ky; touched(p); p.lastRot = true; p.lastKick = k; sfx("rotate"); return; } }
}
function ghostY(p){ const c = p.cur; let y = c.y; while (fits(p, c.kind, c.rot, c.x, y + 1)) y++; return y; }
function hardDrop(p){
  const c = p.cur, y = ghostY(p), n = y - c.y;
  if (n) p.lastRot = false;
  c.y = y; p.score += 2 * n;
  // the slam shoves any loose debris in the well away from where it lands
  const cells = shape(c.kind, c.rot), mx = cells.reduce((s, [x]) => s + x, 0) / 4, my = cells.reduce((s, [, yy]) => s + yy, 0) / 4;
  world.forces.push({ x: cx(p.bx + (c.x + mx) * CW + 1.5), y: cy(p.by + (c.y + my) * CH + 1), radius: screen.ch * 8, strength: world.h * 15, t: 0.06 });
  sfx("drop"); lock(p, 0.5);
}
function holdPiece(p){
  if (!p.canHold) return;
  const k = p.cur.kind; p.canHold = false; sfx("hold");
  if (p.held){ const h = p.held; p.held = k; spawn(p, h); } else { p.held = k; spawn(p, nextKind(p)); }
}
// A T-spin: the last move was a turn, and three of the four corners round the T's centre are filled (walls count).
// A mini, unless both corners the T points at are filled (or the turn used the last, long kick).
function tspin(p){
  const c = p.cur; if (c.kind !== "T" || !p.lastRot) return null;
  const full = (x, y) => x < 0 || x >= p.bw || y >= p.bh || (y >= 0 && at(p, x, y));
  const ox = c.x + 1, oy = c.y + 1, corners = [[ox - 1, oy - 1], [ox + 1, oy - 1], [ox + 1, oy + 1], [ox - 1, oy + 1]].map(([x, y]) => full(x, y));
  if (corners.filter(Boolean).length < 3) return null;
  const front = [[0, 1], [1, 2], [2, 3], [3, 0]][c.rot];   // the corners on the side the T points to
  return corners[front[0]] && corners[front[1]] || p.lastKick === 4 ? "full" : "mini";
}
function lock(p, flashK = 0.25){
  const c = p.cur, cells = shape(c.kind, c.rot), ts = tspin(p);
  if (cells.some(([, y]) => c.y + y < 0)) return topOut(p);   // locked above the top of the well
  for (const [x, y] of cells){ const i = (c.y + y) * p.bw + c.x + x; p.board[i] = c.kind; p.flash[i] = flashK; }
  if (flashK < 0.5) sfx("lock");
  p.cur = null; p.canHold = true;
  p.clearing = [];
  for (let y = 0; y < p.bh; y++) if (p.board.slice(y * p.bw, y * p.bw + p.bw).every(Boolean)) p.clearing.push(y);
  const n = p.clearing.length, before = p.level;
  // scoring: lines or T-spins, back-to-back, and combos
  let pts = ts === "full" ? TSPIN_SCORE[n] : ts === "mini" ? MINI_SCORE[Math.min(n, 2)] : LINE_SCORE[n], send = ts === "full" ? TSPIN_SEND[n] : ts === "mini" ? 0 : SEND[n], label = [];
  if (ts) label.push((ts === "mini" ? "MINI " : "") + "T-SPIN" + (n ? " " + ["", "SINGLE", "DOUBLE", "TRIPLE"][n] : ""));
  else if (n === 4) label.push("SMASH!");
  if (n){
    const hard = n === 4 || !!ts;
    if (hard && p.b2b){ pts = Math.floor(pts * 1.5); send++; label.push("BACK-TO-BACK"); }
    p.b2b = hard;
    p.combo++;
    if (p.combo > 0){ pts += 50 * p.combo; send += COMBO_SEND[Math.min(p.combo, COMBO_SEND.length - 1)]; label.push("COMBO " + p.combo); }
  } else p.combo = -1;
  p.score += pts * p.level;
  if (mode === "versus" && n){   // garbage: cancel what is coming first, send the rest
    const cancel = Math.min(send, p.pending); p.pending -= cancel; send -= cancel;
    if (send > 0){ const o = players[1 - p.i]; o.pending += send; p.sent += send; }
  }
  if (label.length) say(p, label.join("  "), 1.4);
  if (!n){
    if (mode === "versus" && p.pending) addGarbage(p);
    if (p.mode !== "dead"){ rebuildTerrain(); spawn(p, nextKind(p)); }
    return;
  }
  p.lines += n; if (mode !== "versus") p.level = startLevel + Math.floor(p.lines / 10);
  for (const y of p.clearing) for (let x = 0; x < p.bw; x++){ shatter(p, x, y, at(p, x, y), n === 4 ? 1.6 : 1); p.board[y * p.bw + x] = null; }
  sfx(n === 4 || ts ? "smash" : "clear");
  if (p.level > before){ sfx("level"); say(p, "LEVEL " + p.level, 1.5); }
  rebuildTerrain();   // the cleared rows are open now, so the debris flies out of them
  p.mode = "clear"; p.modeT = 0;
}
// Garbage rises from the bottom: grey rows with one gap, all in the same column for this batch.
function addGarbage(p){
  const n = Math.min(p.pending, 8), hole = Math.floor(Math.random() * p.bw);
  p.pending -= n;
  for (let y = 0; y < n; y++) for (let x = 0; x < p.bw; x++) if (at(p, x, y)) return topOut(p);   // pushed over the top
  p.board.copyWithin(0, n * p.bw); p.flash.copyWithin(0, n * p.bw);
  for (let y = p.bh - n; y < p.bh; y++) for (let x = 0; x < p.bw; x++){ p.board[y * p.bw + x] = x === hole ? null : "G"; p.flash[y * p.bw + x] = 0.4; }
  sfx("lock");
}
function collapse(p){   // drop the rows above each cleared line
  for (const y of p.clearing){
    p.board.copyWithin(p.bw, 0, y * p.bw); p.flash.copyWithin(p.bw, 0, y * p.bw);
    p.board.fill(null, 0, p.bw); p.flash.fill(0, 0, p.bw);
  }
  p.clearing = []; rebuildTerrain();
}

/* ---------- the computer, in VERSUS: tries every turn and column, keeps the best by a simple heuristic ---------- */
// Lower and flatter is better, with few holes and many lines (weights after Yiyuan Lee's well-known tuning).
function evaluate(p, board){
  const w = p.bw, h = p.bh, heights = [];
  let holes = 0, lines = 0;
  for (let x = 0; x < w; x++){ let y = 0; while (y < h && !board[y * w + x]) y++; heights.push(h - y); for (let yy = y + 1; yy < h; yy++) if (!board[yy * w + x]) holes++; }
  for (let y = 0; y < h; y++){ let full = true; for (let x = 0; x < w; x++) if (!board[y * w + x]){ full = false; break; } if (full) lines++; }
  let bump = 0; for (let x = 1; x < w; x++) bump += Math.abs(heights[x] - heights[x - 1]);
  return -0.51 * heights.reduce((a, b) => a + b, 0) + 0.76 * lines - 0.36 * holes - 0.18 * bump;
}
function cpuPlan(p){
  const c = p.cur, choices = [];
  for (let rot = 0; rot < (c.kind === "O" ? 1 : 4); rot++) for (let x = -2; x < p.bw; x++){
    if (!fits(p, c.kind, rot, x, c.y)) continue;
    let y = c.y; while (fits(p, c.kind, rot, x, y + 1)) y++;
    const b = p.board.slice(); for (const [cx_, cy_] of shape(c.kind, rot)){ if (y + cy_ < 0) continue; b[(y + cy_) * p.bw + x + cx_] = c.kind; }
    choices.push({ rot, x, v: evaluate(p, b) });
  }
  choices.sort((a, b) => b.v - a.v);
  // Easy sometimes takes its second or third choice
  const k = p.cpu.level === "easy" ? Math.min(choices.length - 1, Math.floor(Math.random() * 3)) : p.cpu.level === "normal" && Math.random() < 0.15 ? 1 : 0;
  return choices[Math.min(k, choices.length - 1)] || { rot: c.rot, x: c.x };
}
function cpuStep(p, dt){
  if (!p.cur || p.mode !== "play") return;
  if (!p.cpu.plan) p.cpu.plan = cpuPlan(p);
  if ((p.cpu.t -= dt) > 0) return;
  p.cpu.t = CPU_STEP[p.cpu.level];
  const P = p.cpu.plan, c = p.cur;
  if (c.rot !== P.rot) turn(p, 1);
  else if (c.x < P.x){ if (!tryMove(p, 1, 0)) hardDrop(p); }
  else if (c.x > P.x){ if (!tryMove(p, -1, 0)) hardDrop(p); }
  else hardDrop(p);
}

/* ---------- jewels and blobs (COLUMNS and PUYO): a small piece, then matches clear in chains ---------- */
const COLOURS = { columns: 6, puyo: 4 };
const randomGem = () => 1 + Math.floor(Math.random() * COLOURS[mode]);
function matchPiece(){ return mode === "columns" ? [randomGem(), randomGem(), randomGem()] : [randomGem(), randomGem()]; }
// The piece's cells: COLUMNS a vertical column of three (rot is how far the colours have cycled); PUYO a pivot and
// a second blob that turns round it (rot 0 up, 1 right, 2 down, 3 left).
function gemCells(c){
  if (mode === "columns") return [0, 1, 2].map(k => [c.x, c.y + k, c.gems[(k + c.rot) % 3]]);
  const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][c.rot];
  return [[c.x, c.y, c.gems[0]], [c.x + d[0], c.y + d[1], c.gems[1]]];
}
const gemFits = (p, c) => gemCells(c).every(([x, y]) => x >= 0 && x < p.bw && y < p.bh && (y < 0 || !at(p, x, y)));
function matchSpawn(p){
  const gems = p.queue.length ? p.queue.shift() : matchPiece(); while (p.queue.length < 2) p.queue.push(matchPiece());
  p.cur = { gems, rot: 0, x: 2, y: mode === "columns" ? -2 : 0 };
  p.fallT = 0; p.lockT = 0; p.resets = 0; p.lowest = p.cur.y; p.chain = 0;
  if (!gemFits(p, p.cur) || (mode === "puyo" && at(p, 2, 0))) return topOut(p);   // the spawn point is buried
}
function matchMove(p, dx, dy){ const c = { ...p.cur, x: p.cur.x + dx, y: p.cur.y + dy }; if (!gemFits(p, c)) return false; p.cur = c; if (c.y > p.lowest){ p.lowest = c.y; p.resets = 0; } if (dx) matchTouched(p); return true; }
function matchTouched(p){ if (!gemFits(p, { ...p.cur, y: p.cur.y + 1 }) && p.resets < LOCK_RESETS){ p.lockT = 0; p.resets++; } }
function matchTurn(p, dir){
  const c = p.cur;
  if (mode === "columns"){ p.cur = { ...c, rot: (c.rot + (dir > 0 ? 2 : 1)) % 3 }; sfx("rotate"); return; }   // cycle the colours down (or up)
  const t = { ...c, rot: (c.rot + dir + 4) % 4 };
  for (const [kx, ky] of [[0, 0], [-1, 0], [1, 0], [0, -1]]){ const k = { ...t, x: t.x + kx, y: t.y + ky }; if (gemFits(p, k)){ p.cur = k; matchTouched(p); sfx("rotate"); return; } }
  const flip = { ...c, rot: (c.rot + 2) % 4 }; if (gemFits(p, flip)){ p.cur = flip; sfx("rotate"); }   // boxed in: swap the two blobs
}
function matchDrop(p){ let n = 0; while (matchMove(p, 0, 1)) n++; p.score += n; sfx("drop"); matchLock(p); }
function matchLock(p){
  for (const [x, y, g] of gemCells(p.cur)){ if (y < 0) return topOut(p); p.board[y * p.bw + x] = g; p.flash[y * p.bw + x] = 0.25; }
  p.cur = null; sfx("lock");
  settleGems(p); resolve(p);
}
function settleGems(p){   // every jewel or blob falls straight down until it rests
  for (let x = 0; x < p.bw; x++){ let w = p.bh - 1; for (let y = p.bh - 1; y >= 0; y--){ const g = at(p, x, y); if (!g) continue; p.board[y * p.bw + x] = null; p.board[w * p.bw + x] = g; w--; } }
  rebuildTerrain();
}
// Find what clears: COLUMNS any line of three or more (across, down or diagonal); PUYO any group of four or more.
function findMatches(p){
  const hit = new Set();
  if (mode === "columns"){
    for (let y = 0; y < p.bh; y++) for (let x = 0; x < p.bw; x++){ const g = at(p, x, y); if (!g) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]){
        let n = 1; while (x + dx * n >= 0 && x + dx * n < p.bw && y + dy * n >= 0 && y + dy * n < p.bh && at(p, x + dx * n, y + dy * n) === g) n++;
        if (n >= 3) for (let k = 0; k < n; k++) hit.add((y + dy * k) * p.bw + x + dx * k);
      } }
  } else {
    const seen = new Uint8Array(p.bw * p.bh);
    for (let i = 0; i < p.board.length; i++){ if (seen[i] || !p.board[i]) continue;
      const g = p.board[i], group = [i]; seen[i] = 1;
      for (let k = 0; k < group.length; k++){ const j = group[k], x = j % p.bw, y = Math.floor(j / p.bw);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const X = x + dx, Y = y + dy, n = Y * p.bw + X;
          if (X >= 0 && X < p.bw && Y >= 0 && Y < p.bh && !seen[n] && p.board[n] === g){ seen[n] = 1; group.push(n); } } }
      if (group.length >= 4) for (const j of group) hit.add(j);
    }
  }
  return [...hit];
}
function resolve(p){
  const hit = findMatches(p);
  if (!hit.length){ p.chain = 0; matchSpawn(p); return; }
  p.chain++;
  const n = hit.length;
  p.score += mode === "columns" ? 30 * n * p.chain * p.level : 10 * n * Math.max(1, PUYO_CHAIN[Math.min(p.chain - 1, PUYO_CHAIN.length - 1)]) * p.level;
  p.lines += n; const before = p.level; p.level = startLevel + Math.floor(p.lines / (mode === "columns" ? 45 : 40));
  for (const j of hit){ shatter(p, j % p.bw, Math.floor(j / p.bw), p.board[j], p.chain > 1 ? 1.4 : 1); p.board[j] = null; }
  sfx(p.chain > 1 ? "smash" : "clear");
  if (p.chain > 1) say(p, p.chain + " CHAIN!", 1.2);
  if (p.level > before){ sfx("level"); say(p, "LEVEL " + p.level, 1.5); }
  rebuildTerrain(); p.mode = "clear"; p.modeT = 0;
}

/* ---------- debris, and the end ---------- */
// A cleared cell becomes a tumbling engine body of its colour: a box for blocks and jewels, a ball for a blob.
function shatter(p, x, y, kind, k){
  const rgb = kind === "G" ? GARBAGE_RGB : typeof kind === "number" ? GEM_RGB[kind] : PIECES[kind].rgb, gx = cx(p.bx + x * CW + 1.5), gy = cy(p.by + y * CH + 0.5);
  const b = mode === "puyo" ? world.add(gx, gy, screen.ch * CH * 0.45, "blob", rgb, BLOB) : world.addBox(gx, gy, screen.cw * CW * 0.42, screen.ch * CH * 0.42, "block", rgb, BLOCK);
  const sp = (200 + Math.random() * 300) * k;
  b.vx = (x - (p.bw - 1) / 2) * 50 * k + (Math.random() - 0.5) * sp; b.vy = -sp - Math.random() * 200; b.w = (Math.random() - 0.5) * 24;
  b.flash = 1; b.life = 1.8 + Math.random() * 0.8; b.hw0 = b.hw; b.hh0 = b.hh; b.r0 = b.r;
  return b;
}
function topOut(p){
  p.mode = "dead"; p.modeT = 0; p.cur = null;
  // the whole stack comes apart and falls down the well; the last drop's shove would fling it at the walls
  world.forces.length = 0;
  for (let y = 0; y < p.bh; y++) for (let x = 0; x < p.bw; x++) if (at(p, x, y)){ const b = shatter(p, x, y, at(p, x, y), 0.3); b.vy = -Math.random() * 150; b.life = 0; }
  p.board.fill(null);
  if (mode === "versus"){ winner = 1 - p.i; say(players[winner], "WINS!", 99); }
  if (players.every(q => q.mode === "dead") || mode === "versus"){
    state = "over"; stateT = 0; playMusic(false); sfx("over");
    if (mode !== "versus") saveScore(p);
  }
  rebuildTerrain();
}
function newGame(){
  mode = nextMode; foe = nextFoe; startLevel = nextStartLevel; best = false; winner = -1; bagSeed = 1 + Math.floor(Math.random() * 1e9);
  world.bodies.length = 0; world.forces.length = 0;
  const S = sizes();
  players = S.bx.map((bx, i) => newPlayer(i, bx, i === 1 && foe !== "player" ? foe : null));
  state = "play"; stateT = 0;
  layout(true);
  sfx("start"); playMusic(true);
  for (const p of players) rule() === "blocks" ? spawn(p, nextKind(p)) : matchSpawn(p);
}
function toTitle(){ state = "title"; players = []; world.bodies.length = 0; world.terrain = null; layout(true); }

/* ---------- update ---------- */
function update(dt){
  stateT += dt;
  for (const p of players){
    p.msgT -= dt; p.modeT += dt;
    for (let i = 0; i < p.flash.length; i++) if (p.flash[i] > 0) p.flash[i] = Math.max(0, p.flash[i] - dt * 2);
    if (state !== "play") continue;
    if (p.mode === "clear"){
      if (p.modeT >= CLEAR_SECS){
        p.mode = "play";
        if (rule() === "blocks"){ collapse(p); if (mode === "versus" && p.pending) addGarbage(p); if (p.mode !== "dead") spawn(p, nextKind(p)); }
        else { settleGems(p); resolve(p); }   // fall, then look again: a chain
      }
      continue;
    }
    if (p.mode !== "play" || !p.cur) continue;
    if (p.cpu){ cpuStep(p, dt); if (!p.cur) continue; }
    const blocks = rule() === "blocks", move = blocks ? (dx, dy) => tryMove(p, dx, dy) : (dx, dy) => matchMove(p, dx, dy);
    // left/right: one step on press, then auto-repeat after a short delay
    const dir = (p.keys.right ? 1 : 0) - (p.keys.left ? 1 : 0);
    if (dir !== p.das.dir){ p.das.dir = dir; p.das.t = -DAS; if (dir && move(dir, 0)) sfx("move"); }
    else if (dir){ p.das.t += dt; while (p.das.t >= 0){ if (move(dir, 0)) sfx("move"); p.das.t -= ARR; } }
    const step = p.keys.down ? Math.min(SOFT, gravity(p)) : gravity(p);
    const free = blocks ? fits(p, p.cur.kind, p.cur.rot, p.cur.x, p.cur.y + 1) : gemFits(p, { ...p.cur, y: p.cur.y + 1 });
    if (free){
      p.lockT = 0; p.fallT += dt;
      while (p.fallT >= step && p.cur && move(0, 1)){ p.fallT -= step; if (p.keys.down) p.score++; }
    } else if ((p.lockT += dt) >= LOCK_SECS) blocks ? lock(p) : matchLock(p);
  }
}

/* ---------- drawing ---------- */
const { put, text, center } = pen(() => screen);   // drawing on the character grid (src/arcade.js)
const slab = { box: true, a: 0, mat: BLOCK, flash: 0 }, ball = { a: 0, mat: BLOB, flash: 0 };
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
function blob(gx, gy, rgb, fl, layer = 2){   // a lit ball filling one board cell (PUYO)
  ball.x = (gx + CW / 2) * screen.cw; ball.y = (gy + CH / 2) * screen.ch; ball.r = Math.min(CW * screen.cw, CH * screen.ch) * 0.5; ball.alb = rgb; ball.flash = fl;
  screen.sphere(ball, lamp, { stripe: false });
  if (layer !== 2) screen.raise(gx, gy, CW, CH, layer);
}
function cellAt(p, x, y, kind, fl, layer){
  if (y < 0) return;
  const gx = p.bx + x * CW, gy = p.by + y * CH;
  if (typeof kind === "number"){ if (mode === "puyo") return blob(gx, gy, GEM_RGB[kind], fl, layer); return block(gx, gy, CW, CH, GEM_RGB[kind], fl + 0.08, layer); }
  block(gx, gy, CW, CH, kind === "G" ? GARBAGE_RGB : PIECES[kind].rgb, fl, layer);
}
function mini(kind, gx, gy){   // a piece in a side panel, centred in a 16 x 4 area
  if (Array.isArray(kind)){   // jewels or blobs: a small column or pair
    kind.forEach((g, k) => mode === "puyo" ? blob(gx + 6, gy + (1 - k) * CH, GEM_RGB[g], 0) : block(gx + 6, gy + k * CH, CW, CH, GEM_RGB[g], 0.08));
    return;
  }
  const cells = shape(kind, 0), xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  const ox = gx + ((16 - w * CW) >> 1) - Math.min(...xs) * CW, oy = gy + ((4 - h * CH) >> 1) - Math.min(...ys) * CH;
  for (const [x, y] of cells) block(ox + x * CW, oy + y * CH, CW, CH, PIECES[kind].rgb, 0);
}
function drawWell(p){
  const wall = [0.35, 0.38, 0.5], x1 = p.bx + p.bw * CW, yf = p.by + p.bh * CH;
  for (let gy = p.by; gy < yf; gy++){ put(p.bx - 1, gy, wall, 1, 1, 124); put(x1, gy, wall, 1, 1, 124); }
  for (let gx = p.bx - 1; gx <= x1; gx++) put(gx, yf, wall, 1, 1, 61);
  for (let y = 0; y < p.bh; y++) for (let x = 0; x < p.bw; x++) put(p.bx + x * CW + 1, p.by + y * CH + 1, DIM, 0.35, 0, 46);   // a faint dot in each cell
  if (mode === "versus") for (let k = 0; k < Math.min(p.pending, p.bh); k++)   // garbage on its way: a red bar by the well
    put(p.i === 0 ? x1 + 1 : p.bx - 2, yf - 1 - k * CH, RED, 1.2, 1, 35), put(p.i === 0 ? x1 + 1 : p.bx - 2, yf - 2 - k * CH, RED, 1.2, 1, 35);
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
  center(20, pad.touch ? "PRESS A OR START" : "PRESS SPACE TO START", blink ? WHITE : DIM);
  center(22, "GAME " + MODE_NAME[nextMode] + (nextMode === "versus" ? " AGAINST " + FOE_NAME[nextFoe] : "") + "   LEVEL " + nextStartLevel + "   (MENU TO CHANGE)", DIM);
  const tips = { classic: "CLEAR LINES. T-SPINS, BACK-TO-BACK AND COMBOS SCORE MORE.", versus: "CLEARS SEND GARBAGE TO THE OTHER WELL. LAST ONE STANDING WINS.",
    columns: "THREE JEWELS IN A ROW, ANY DIRECTION, CLEAR. CHAINS SCORE MORE.", puyo: "FOUR BLOBS OF ONE COLOUR TOUCHING CLEAR. CHAINS SCORE MORE." };
  center(23, tips[nextMode], DIM);
  if (pad.touch){
    center(26, "D-PAD MOVE   DOWN SOFT DROP   UP DROP", DIM);
    center(27, "A TURN   B TURN BACK   START HOLD   SELECT MENU", DIM);
  } else if (nextMode === "versus" && nextFoe === "player"){
    center(26, "PLAYER 1: A/D MOVE  W TURN  Q TURN BACK  S SOFT DROP  SPACE DROP  E HOLD", DIM);
    center(27, "PLAYER 2: ARROWS MOVE  UP TURN  / TURN BACK  DOWN SOFT DROP  ENTER DROP  . HOLD", DIM);
  } else {
    center(26, "LEFT/RIGHT MOVE   UP OR X TURN   Z TURN BACK", DIM);
    center(27, "DOWN SOFT DROP   SPACE DROP   C HOLD   ESC MENU", DIM);
  }
  const T = tables[nextMode];
  if (T && T.list.length){
    center(30, "HIGH SCORES, " + MODE_NAME[nextMode], ACCENT);
    T.list.forEach((s, i) => center(32 + i, `${i + 1}. ${String(s.score).padStart(7)}   LV ${String(s.level).padStart(2)}   ${String(s.lines).padStart(3)} ${nextMode === "classic" ? "LINES" : "CLEARED"}`, i ? DIM : WHITE));
  }
}
function drawPanels(p){
  const blocks = rule() === "blocks", outer = mode === "versus" && p.i === 1 ? p.bx + p.bw * CW + 3 : 1, nextX = mode === "versus" ? outer : p.bx + p.bw * CW + 2;
  const who = mode === "versus" ? (p.i === 0 ? "PLAYER 1" : foe === "player" ? "PLAYER 2" : "COMPUTER") : "";
  if (who) text(outer, 0, who, p.i ? [0.6, 1.1, 1.5] : ACCENT);
  if (blocks){ text(outer, p.by + 1, "HOLD", p.canHold ? WHITE : DIM); if (p.held) mini(p.held, outer, p.by + 3); }
  const T = tables[mode], stats = mode === "versus" ? [["SCORE", p.score], ["LINES", p.lines], ["SENT", p.sent]] :
    [["SCORE", p.score], ["LEVEL", p.level], [blocks ? "LINES" : "CLEARED", p.lines], ["BEST", Math.max(p.score, T && T.list[0] ? T.list[0].score : 0)]];
  stats.forEach(([k, v], i) => { text(outer, p.by + 9 + i * 4, k, DIM); text(outer, p.by + 10 + i * 4, String(v), i ? WHITE : ACCENT); });
  const ny = mode === "versus" ? p.by + 23 : p.by + 1;
  text(nextX, ny, "NEXT", WHITE);
  (blocks ? p.queue.slice(0, mode === "versus" ? 2 : 3) : p.queue.slice(0, 2)).forEach((k, i) => mini(k, nextX, ny + 2 + i * (blocks ? 6 : 8)));
}
function drawPlayer(p){
  drawWell(p);
  for (let y = 0; y < p.bh; y++) for (let x = 0; x < p.bw; x++){ const k = at(p, x, y); if (k) cellAt(p, x, y, k, p.flash[y * p.bw + x]); }
  const c = p.cur;
  if (c && rule() === "blocks"){
    const cells = shape(c.kind, c.rot), gy = ghostY(p), rgb = PIECES[c.kind].rgb;
    for (const [x, y] of cells) if (gy + y >= 0) for (let r = 0; r < CH; r++) for (let q = 0; q < CW; q++)   // the ghost: where it will land
      put(p.bx + (c.x + x) * CW + q, p.by + (gy + y) * CH + r, rgb, 0.3, 1, q === 0 || q === CW - 1 ? 58 : 46);
    for (const [x, y] of cells) cellAt(p, c.x + x, c.y + y, c.kind, p.lockT / LOCK_SECS * 0.3, 3);
  } else if (c) for (const [x, y, g] of gemCells(c)) cellAt(p, x, y, g, p.lockT / LOCK_SECS * 0.3, 3);
}
function draw(t){
  screen.clear();
  if (state === "title"){
    drawTitle(t);
    for (const b of world.bodies) screen.sphere(b, lamp, { stripe: false });
    drawMenu(); screen.render(ctx); return;
  }
  for (const p of players) drawPlayer(p);
  for (const b of world.bodies) screen.sphere(b, lamp, { stripe: false });
  for (const p of players){
    drawPanels(p);
    const midX = p.bx + (p.bw * CW >> 1), mid = p.by + p.bh;
    const line = s => text(midX - (s.length >> 1), mid, s, WHITE);
    if (p.msgT > 0){ const s = "  " + p.msg + "  "; text(midX - (s.length >> 1), mid - 6, s, p.msg === "WINS!" ? ACCENT : WHITE); }
    if (mode === "versus" && state === "over" && winner >= 0 && p.i !== winner) line("  TOPPED OUT  ");
  }
  const midY = (GH >> 1);
  if (state === "over" && stateT > 1){
    if (mode === "versus"){ center(midY + 4, "  " + (winner === 0 ? "PLAYER 1" : foe === "player" ? "PLAYER 2" : "COMPUTER") + " WINS  ", ACCENT); }
    else { center(midY - 2, "  GAME OVER  ", WHITE); center(midY, `  ${players[0].score} POINTS  `, ACCENT); if (best) center(midY + 2, "  NEW HIGH SCORE!  ", ACCENT); }
    center(midY + 6, pad.touch ? "  PRESS START  " : "  PRESS SPACE  ", DIM);
  }
  const hint = pad.touch ? " SELECT MENU " : " ESC MENU ";
  text(GW - 1 - hint.length, GH - 1, hint, DIM);
  drawMenu();
  screen.render(ctx);
}
function drawMenu(){
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(screen, { accent: ACCENT, normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "GAME, OPPONENT AND LEVEL APPLY TO THE NEXT GAME" });
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
// One player: the arrows (or A/D/S) and the usual keys. Two players in VERSUS share the keyboard: player 1 on the
// left (A D W Q S, Space, E), player 2 on the right (arrows, /, Enter, period).
const SOLO = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowDown: "down", s: "down", S: "down" };
const P1 = { a: "left", A: "left", d: "right", D: "right", s: "down", S: "down" }, P2 = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down" };
const twoUp = () => mode === "versus" && foe === "player";
function keyOwner(e){   // which player a held key belongs to, and what it does
  if (!twoUp()) return SOLO[e.key] ? [players[0], SOLO[e.key]] : null;
  if (P1[e.key]) return [players[0], P1[e.key]];
  if (P2[e.key]) return [players[1], P2[e.key]];
  return null;
}
function action(){   // start from the title; back to the title from game over
  if (state === "title") newGame();
  else if (state === "over" && stateT > 1) toTitle();
}
const live = p => state === "play" && p && p.cur && p.mode === "play" && !p.cpu;
function doMove(p, what){   // a single-press command for player p
  if (!live(p)) return;
  const blocks = rule() === "blocks";
  if (what === "drop") blocks ? hardDrop(p) : matchDrop(p);
  else if (what === "turn") blocks ? turn(p, 1) : matchTurn(p, 1);
  else if (what === "back") blocks ? turn(p, -1) : matchTurn(p, -1);
  else if (what === "hold" && blocks) holdPiece(p);
}
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "title" ? "START GAME" : "RESTART", select: () => { menu.hide(); audio.unlock(); newGame(); } },
  { label: "GAME", value: () => MODE_NAME[nextMode], change: d => { nextMode = MODES[(MODES.indexOf(nextMode) + (d || 1) + 4) % 4]; } },
  { label: "OPPONENT", value: () => FOE_NAME[nextFoe], change: d => { nextFoe = FOES[(FOES.indexOf(nextFoe) + (d || 1) + 4) % 4]; } },
  { label: "STARTING LEVEL", value: () => String(nextStartLevel), change: d => { nextStartLevel = (nextStartLevel + d + 14) % 15 + 1; } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "CONTROLS", value: () => pad.touch ? "TOUCH" : "KEYBOARD", change: () => pad.toggle() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { for (const p of players) for (const k in p.keys) p.keys[k] = false; audio.pause(); },
  onClose: () => { audio.resume(); }
});
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const own = state === "play" && keyOwner(e); if (own){ e.preventDefault(); own[0].keys[own[1]] = true; }
  if (e.key === " " || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "/") e.preventDefault();
  if (e.repeat) return;
  audio.unlock();
  if (e.key === "Escape" || e.key === "p" || e.key === "P") return menu.show();
  if (e.key === "m" || e.key === "M") return audio.toggleMute();
  if (e.key === "r" || e.key === "R") return newGame();
  if (state !== "play"){ if (e.key === " " || e.key === "Enter") action(); return; }
  const k = e.key;
  if (twoUp()){
    const [a, b] = players;
    if (k === " ") doMove(a, "drop"); else if (k === "w" || k === "W") doMove(a, "turn"); else if (k === "q" || k === "Q") doMove(a, "back"); else if (k === "e" || k === "E") doMove(a, "hold");
    else if (k === "Enter") doMove(b, "drop"); else if (k === "ArrowUp") doMove(b, "turn"); else if (k === "/") doMove(b, "back"); else if (k === ".") doMove(b, "hold");
    return;
  }
  const p = players[0];
  if (k === " ") doMove(p, "drop");
  else if (k === "ArrowUp" || k === "x" || k === "X" || k === "w" || k === "W") doMove(p, "turn");
  else if (k === "z" || k === "Z" || k === "Control") doMove(p, "back");
  else if (k === "c" || k === "C" || k === "Shift") doMove(p, "hold");
});
addEventListener("keyup", e => { const own = players.length && keyOwner(e); if (own) own[0].keys[own[1]] = false; });
addEventListener("blur", () => { for (const p of players) for (const k in p.keys) p.keys[k] = false; });

const pad = createPad({ store, menu: () => menu.open && menu, onAny: () => audio.unlock(),
  onDir: d => { const p = players[0]; if (!p) return; if (d === "up") doMove(p, "drop"); for (const k in p.keys) p.keys[k] = k === d; },
  onPress: id => {
    if (id === "select") return menu.show();
    if (state !== "play"){ if (id === "a" || id === "start") action(); return; }
    const p = players[0];
    if (id === "a") doMove(p, "turn"); else if (id === "b") doMove(p, "back"); else doMove(p, "hold");
  } });
cv.addEventListener("pointerdown", e => {
  audio.unlock();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!pad.touch) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
function tick(dt, t){
  if (screen && !menu.open){   // the open menu pauses everything
    if (state === "title") rain(dt); else update(dt);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){   // debris shrinks away in its last second
      b.life -= dt; const k = Math.max(0.2, Math.min(1, b.life));
      if (b.box){ b.hw = b.hw0 * k; b.hh = b.hh0 * k; b.r = Math.hypot(b.hw, b.hh); } else b.r = b.r0 * k;
    }
    world.bodies = world.bodies.filter(b => !(b.life < 0));
  }
  if (screen) draw(t);
}
layout(true);
onResize(stage, () => layout());
startLoop(tick);
})();
