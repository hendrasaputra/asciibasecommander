"use strict";
/* ================= Shared core: physics, light, ink, 24-bit renderer ================= */
const MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace';
const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif';
// The simulated screen is always dark: characters emit light, so they need a black background.
const SCREEN = { bg: "#0B0F16", dot: "#1C2432", line: "#263042", text: "#DCE3EC", muted: "#7C889B", accent: "#7FA2FF", pink: "#F07FB8", lamp: "#FFC857" };
const RAMPS = { classic: " .:-=+*#%@", detailed: " .'`^\",:;Il!i~+_-?]}1)|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@", blocks: " \u2591\u2592\u2593\u2588" };
function norm(v){ const l = Math.hypot(...v); return v.map(x => x / l); }
const DIR = norm([-0.5, -0.6, 0.65]), SUB = [0.25, 0.75], MREF = 2.4;
const AMB_RGB = [0.55, 0.65, 0.9];     // room light is slightly blue
const FLASH_RGB = [1.0, 0.75, 0.45];   // impact flashes are warm
const FLOOR_ALB = 0.5;                 // share of light the floor reflects
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MATS = {
  foam:   { name: "foam",   density: 0.2, e: 0.70, mu: 0.6, kd: 0.95, ks: 0.05, shine: 4,  alb: [0.20, 0.85, 0.72], rMin: 1.6, rMax: 2.4 },
  rubber: { name: "rubber", density: 1.0, e: 0.55, mu: 0.8, kd: 0.85, ks: 0.30, shine: 14, alb: [0.30, 0.48, 1.00], alt: [1.00, 0.38, 0.68], rMin: 1.2, rMax: 1.9 },
  steel:  { name: "steel",  density: 7.0, e: 0.35, mu: 0.2, kd: 0.45, ks: 1.10, shine: 70, alb: [0.72, 0.76, 0.82], rMin: 0.9, rMax: 1.3 },
  peg:    { name: "peg",    density: 0,   e: 0.50, mu: 0.3, kd: 0.80, ks: 0.20, shine: 10, alb: [0.42, 0.47, 0.56] }
};
const MIX = ["rubber", "rubber", "rubber", "rubber", "foam", "foam", "foam", "steel", "steel", "steel"];
function hexToLinear(hex){
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => Math.pow(c / 255, 2.2));
}
function defaultDisplay(){
  return { chars: RAMPS.classic, calibrate: true, dither: false, black: 0.15, exposure: 1.3, gamma: 2.2, split: 0.2, glow: 0.35, room: 0.18, lampHex: "#FFD9A0", lampRGB: hexToLinear("#FFD9A0") };
}

/* ---------- physics (unchanged from v2) ---------- */
function hit(b, dv){ if (dv > 220) b.flash = Math.max(b.flash, Math.min(1, (dv - 220) / 1000)); }
class World {
  constructor(){ this.bodies = []; this.forces = []; this.w = 300; this.h = 300; this.unit = 10; this.g = { x: 0, y: 0 };
    this.substeps = 4; this.cell = 60; this.grid = new Map(); this.drag = 0; this.onSub = null; }
  add(x, y, r, matName, alb, matOverride){
    const M = matOverride || MATS[matName], st = matName === "peg";
    const m = st ? 0 : M.density * (r / this.unit) ** 2;
    const b = { x, y, vx: 0, vy: 0, r, a: Math.random() * 6.283, w: 0, mat: M, alb: alb || M.alb, static: st, m,
      im: st ? 0 : 1 / m, iI: st ? 0 : 1 / (0.4 * m * r * r), grab: null, flash: 0, touch: false };
    this.bodies.push(b);
    if (this.bodies.length > 260){ const i = this.bodies.findIndex(o => !o.static && !o.grab); if (i >= 0) this.bodies.splice(i, 1); }
    return b;
  }
  step(dt){
    let maxR = 1; for (const b of this.bodies) if (b.r > maxR) maxR = b.r;
    this.cell = maxR * 2 + 2;
    const h = dt / this.substeps;
    for (let s = 0; s < this.substeps; s++){ this.substep(h); if (this.onSub) this.onSub(); }
    const decay = Math.pow(0.001, dt); for (const b of this.bodies) b.flash *= decay;
  }
  substep(h){
    const { w, h: H, g } = this;
    for (const b of this.bodies){
      if (b.static) continue;
      const mN = Math.max(0.25, b.m / MREF);
      let ax = g.x, ay = g.y;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0 && this.drag){ const k = this.drag * b.r * sp * b.im; ax -= b.vx * k; ay -= b.vy * k; }
      if (b.grab){ ax += (520 * (b.grab.x - b.x) - 46 * b.vx) / mN; ay += (520 * (b.grab.y - b.y) - 46 * b.vy) / mN; }
      for (const f of this.forces){
        const dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy);
        if (d > 0.001 && d < f.radius){ const k = (1 - d / f.radius) * f.strength / mN; ax += dx / d * k; ay += dy / d * k; }
      }
      b.vx += ax * h; b.vy += ay * h;
      const s2 = Math.hypot(b.vx, b.vy); if (s2 > 4000){ b.vx *= 4000 / s2; b.vy *= 4000 / s2; }
      b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h; b.w *= 0.9997;
      if (b.x - b.r <= 0){ b.x = b.r; this.wall(b, -1, 0, h); }
      if (b.x + b.r >= w){ b.x = w - b.r; this.wall(b, 1, 0, h); }
      if (b.y - b.r <= 0){ b.y = b.r; this.wall(b, 0, -1, h); }
      if (b.y + b.r >= H){ b.y = H - b.r; this.wall(b, 0, 1, h); }
    }
    for (const b of this.bodies) b.touch = false;
    this.collide(); this.collide();
    for (const b of this.bodies){
      if (b.static) continue;
      if (b.touch && !b.grab && b.vx * b.vx + b.vy * b.vy < 1600){ b.vx *= 0.9; b.vy *= 0.9; b.w *= 0.9; }
      b.x = Math.min(w - b.r, Math.max(b.r, b.x)); b.y = Math.min(H - b.r, Math.max(b.r, b.y));
    }
  }
  wall(b, nx, ny, h){
    const M = b.mat; let jn; b.touch = true;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0){ const e = vn < 30 ? 0 : M.e, dv = (1 + e) * vn; b.vx -= dv * nx; b.vy -= dv * ny; hit(b, dv); jn = dv * b.m; }
    else jn = Math.max(0, this.g.x * nx + this.g.y * ny) * h * b.m;
    const tx = -ny, ty = nx, slip = b.vx * tx + b.vy * ty + b.w * b.r;
    let jt = -slip / (b.im + b.r * b.r * b.iI);
    const lim = M.mu * jn; jt = Math.max(-lim, Math.min(lim, jt));
    b.vx += jt * tx * b.im; b.vy += jt * ty * b.im; b.w += jt * b.r * b.iI;
  }
  buildGrid(){
    const cs = this.cell, grid = this.grid, B = this.bodies; grid.clear();
    for (let i = 0; i < B.length; i++){
      const key = Math.floor(B[i].x / cs) + "," + Math.floor(B[i].y / cs);
      let arr = grid.get(key); if (!arr){ arr = []; grid.set(key, arr); } arr.push(i);
    }
  }
  collide(){
    this.buildGrid();
    const cs = this.cell, grid = this.grid, B = this.bodies;
    for (let i = 0; i < B.length; i++){
      const a = B[i], cx = Math.floor(a.x / cs), cy = Math.floor(a.y / cs);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){
        const arr = grid.get((cx + ox) + "," + (cy + oy));
        if (arr) for (const j of arr) if (j > i) this.resolve(a, B[j]);
      }
    }
  }
  resolve(a, b){
    const dx = b.x - a.x, dy = b.y - a.y, rs = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= rs * rs || d2 === 0) return;
    const wa = a.im, wb = b.im, ws = wa + wb; if (ws === 0) return;
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d; a.touch = b.touch = true;
    const corr = Math.max(0, rs - d - 0.3) / ws * 0.8;
    a.x -= nx * corr * wa; a.y -= ny * corr * wa; b.x += nx * corr * wb; b.y += ny * corr * wb;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return;
    const e = -vn < 30 ? 0 : (a.mat.e + b.mat.e) / 2, j = -(1 + e) * vn / ws;
    a.vx -= j * nx * wa; a.vy -= j * ny * wa; b.vx += j * nx * wb; b.vy += j * ny * wb;
    hit(a, j * wa); hit(b, j * wb);
    const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty - b.w * b.r - a.w * a.r;
    let jt = -vt / (ws + a.r * a.r * a.iI + b.r * b.r * b.iI);
    const lim = Math.sqrt(a.mat.mu * b.mat.mu) * j; jt = Math.max(-lim, Math.min(lim, jt));
    a.vx -= jt * tx * wa; a.vy -= jt * ty * wa; b.vx += jt * tx * wb; b.vy += jt * ty * wb;
    a.w -= jt * a.r * a.iI; b.w -= jt * b.r * b.iI;
  }
  pick(x, y, slop){
    let best = null, bestD = Infinity;
    for (const b of this.bodies){ if (b.static || b.grab) continue;
      const d = Math.hypot(b.x - x, b.y - y) - b.r; if (d < slop && d < bestD){ best = b; bestD = d; } }
    return best;
  }
}
function spawn(w, x, y, matName, rScale){
  const M = MATS[matName], k = rScale ?? (M.rMin + Math.random() * (M.rMax - M.rMin));
  return w.add(x, y, w.unit * k, matName, M.alt && Math.random() < 0.5 ? M.alt : M.alb);
}

/* ---------- ink measurement: how much of its cell each character actually fills ---------- */
const inkCache = new Map();
function measureInk(chars, fontPx){
  const key = chars + "|" + fontPx;
  if (inkCache.has(key)) return inkCache.get(key);
  const k = 4, c = document.createElement("canvas"), x = c.getContext("2d", { willReadFrequently: true });
  x.font = (fontPx * k) + "px " + MONO;
  const cw = Math.ceil(x.measureText("M").width), ch = Math.round(fontPx * 1.15) * k;
  c.width = cw; c.height = ch;
  x.font = (fontPx * k) + "px " + MONO; x.textBaseline = "top"; x.fillStyle = "#fff";
  const yOff = (ch - fontPx * k) / 2, out = [];
  for (const g of new Set([...chars])){
    x.clearRect(0, 0, cw, ch); x.fillText(g, 0, yOff);
    const d = x.getImageData(0, 0, cw, ch).data; let s = 0;
    for (let i = 3; i < d.length; i += 4) s += d[i];
    out.push({ ch: g, ink: s / (255 * cw * ch) });
  }
  inkCache.set(key, out);
  return out;
}
// Build a 256-entry table: brightness 0..255 -> character code.
function buildLUT(chars, fontPx, calibrate){
  if ([...chars].length < 2) chars = " @";
  const lut = new Uint16Array(256);
  const measured = measureInk(chars, fontPx);
  if (calibrate){
    const lv = measured.slice().sort((a, b) => a.ink - b.ink);
    if (lv[0].ink > 0.001) lv.unshift({ ch: " ", ink: 0 });
    const max = lv[lv.length - 1].ink || 1;
    lv.forEach(l => l.level = l.ink / max);
    let j = 0;
    for (let i = 0; i < 256; i++){
      const t = i / 255;
      while (j < lv.length - 1 && Math.abs(lv[j + 1].level - t) <= Math.abs(lv[j].level - t)) j++;
      lut[i] = lv[j].ch.charCodeAt(0);
    }
    return { lut, levels: lv, count: lv.length, ascii: lv.every(l => l.ch.charCodeAt(0) < 128) };
  }
  const arr = [...chars], n = arr.length - 1;
  for (let i = 0; i < 256; i++) lut[i] = arr[Math.round(i / 255 * n)].charCodeAt(0);
  const lv = arr.map((ch, i) => ({ ch, ink: (measured.find(m => m.ch === ch) || { ink: 0 }).ink, level: i / n }));
  return { lut, levels: lv, count: arr.length, ascii: arr.every(c => c.charCodeAt(0) < 128) };
}

/* ---------- lighting ---------- */
// Returns diffuse and highlight strength for one point on a sphere.
function lightTerms(b, dx, dy, nz, L, out){
  const M = b.mat; let lx, ly, lz, att;
  if (L && L.on){
    const px = b.x + dx * b.r, py = b.y + dy * b.r, pz = b.r * (1 + nz);
    lx = L.x - px; ly = L.y - py; lz = L.z - pz;
    const d2 = lx * lx + ly * ly + lz * lz, ld = Math.sqrt(d2) || 1;
    lx /= ld; ly /= ld; lz /= ld; att = Math.min(3, 2.5 * L.z * L.z / d2);   // inverse-square falloff
  } else { lx = DIR[0]; ly = DIR[1]; lz = DIR[2]; att = 1; }
  out.d = att * M.kd * Math.max(0, dx * lx + dy * ly + nz * lz);
  const hx = lx, hy = ly, hz = lz + 1, hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
  out.s = att * M.ks * Math.pow(Math.max(0, (dx * hx + dy * hy + nz * hz) / hl), M.shine);
}
function shadowAt(fx, fy, B, L){
  const dx = L.x - fx, dy = L.y - fy, lz = L.z, d2 = dx * dx + dy * dy + lz * lz;
  let sh = 1;
  for (const b of B){
    const cx = b.x - fx, cy = b.y - fy, cz = b.r, t = (cx * dx + cy * dy + cz * lz) / d2;
    if (t <= 0 || t >= 1) continue;
    const qx = cx - t * dx, qy = cy - t * dy, qz = cz - t * lz;
    const o = (b.r * 1.15 - Math.sqrt(qx * qx + qy * qy + qz * qz)) / (b.r * 0.45);
    if (o <= 0) continue;
    sh *= 1 - 0.85 * Math.min(1, o); if (sh < 0.12) break;
  }
  return sh;
}

/* ---------- 24-bit character screen ---------- */
// Layers decide who wins a cell: 0 floor light, 1 trails and rings, 2 balls, 3 lamp bulb.
class Screen {
  constructor(fontPx, D){ this.fontPx = fontPx; this.D = D || defaultDisplay();
    this.colC = document.createElement("canvas"); this.glowC = document.createElement("canvas");
    this.glowS = document.createElement("canvas"); this.glyphC = document.createElement("canvas"); this.t = {}; }
  fit(W, H, dpr){
    const probe = this.glyphC.getContext("2d"); probe.font = this.fontPx + "px " + MONO;
    this.cw = probe.measureText("M").width; this.ch = Math.round(this.fontPx * 1.15);
    this.cols = Math.max(1, Math.floor(W / this.cw)); this.rows = Math.max(1, Math.floor(H / this.ch));
    const n = this.n = this.cols * this.rows;
    this.rad = new Float32Array(3 * n); this.lum = new Float32Array(n); this.lay = new Int8Array(n);
    this.over = new Uint16Array(n); this.glyphs = new Uint16Array(n);
    this.w = this.cols * this.cw; this.h = this.rows * this.ch; this.W = W; this.H = H; this.dpr = dpr;
    this.colC.width = this.glowC.width = this.cols; this.colC.height = this.glowC.height = this.rows;
    this.glowS.width = Math.max(1, Math.ceil(this.cols / 4)); this.glowS.height = Math.max(1, Math.ceil(this.rows / 4));
    this.colX = this.colC.getContext("2d"); this.glowX = this.glowC.getContext("2d"); this.glowSX = this.glowS.getContext("2d");
    this.colImg = this.colX.createImageData(this.cols, this.rows); this.glowImg = this.glowX.createImageData(this.cols, this.rows);
    this.glyphC.width = Math.max(1, Math.round(W * dpr)); this.glyphC.height = Math.max(1, Math.round(H * dpr));
    this.gx = this.glyphC.getContext("2d");
    this.setRamp();
  }
  setRamp(){ this.ink = buildLUT(this.D.chars, this.fontPx, this.D.calibrate); }
  clear(){ this.rad.fill(0); this.lum.fill(0); this.lay.fill(-1); this.over.fill(0); }
  put(i, r, g, b, layer, glyph){
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b, lay = this.lay;
    if (lay[i] > layer || (lay[i] === layer && L <= this.lum[i])) return;
    const k = 3 * i; this.rad[k] = r; this.rad[k + 1] = g; this.rad[k + 2] = b;
    this.lum[i] = L; lay[i] = layer; this.over[i] = glyph || 0;
  }
  add(i, r, g, b){   // light adds up: used for floor light, glows and halos
    if (this.lay[i] > 0) return;
    const k = 3 * i; this.rad[k] += r; this.rad[k + 1] += g; this.rad[k + 2] += b;
    this.lum[i] = 0.2126 * this.rad[k] + 0.7152 * this.rad[k + 1] + 0.0722 * this.rad[k + 2]; this.lay[i] = 0;
  }
  light(L){ return L && L.on ? this.D.lampRGB : [0.95, 0.95, 0.95]; }
  sphere(b, L, opt = {}){
    const { cols, rows, cw, ch } = this, t = this.t, A = b.alb, LC = this.light(L), room = this.D.room;
    const dOn = opt.diffuse !== false, sOn = opt.spec !== false, stripe = opt.stripe !== false && !b.static;
    const c0 = Math.max(0, Math.floor((b.x - b.r) / cw)), c1 = Math.min(cols - 1, Math.floor((b.x + b.r) / cw));
    const r0 = Math.max(0, Math.floor((b.y - b.r) / ch)), r1 = Math.min(rows - 1, Math.floor((b.y + b.r) / ch));
    const inv = 1 / b.r, ca = Math.cos(b.a), sa = Math.sin(b.a), fl = b.flash * 0.8;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
      let R = 0, G = 0, Bv = 0, cov = 0;
      for (const sy of SUB) for (const sx of SUB){
        const dx = ((c + sx) * cw - b.x) * inv, dy = ((r + sy) * ch - b.y) * inv, d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        cov++; lightTerms(b, dx, dy, Math.sqrt(1 - d2), L, t);
        const d = dOn ? t.d : 0, s = sOn ? t.s : 0;
        let k = (stripe && Math.abs(-dx * sa + dy * ca) < 0.13) ? 0.45 : 1;
        R += k * (A[0] * (AMB_RGB[0] * room + LC[0] * d) + LC[0] * s + FLASH_RGB[0] * fl);
        G += k * (A[1] * (AMB_RGB[1] * room + LC[1] * d) + LC[1] * s + FLASH_RGB[1] * fl);
        Bv += k * (A[2] * (AMB_RGB[2] * room + LC[2] * d) + LC[2] * s + FLASH_RGB[2] * fl);
      }
      if (cov) this.put(r * cols + c, R / 4, G / 4, Bv / 4, 2);
    }
  }
  floor(B, L, shadows = true){
    const { cols, rows, cw, ch } = this;
    if (L && L.on){
      const LC = this.D.lampRGB, lz2 = L.z * L.z;
      for (let r = 0; r < rows; r++){
        const fy = (r + 0.5) * ch;
        for (let c = 0; c < cols; c++){
          const fx = (c + 0.5) * cw, dx = L.x - fx, dy = L.y - fy, d2 = dx * dx + dy * dy + lz2, d = Math.sqrt(d2);
          // point light on a flat floor: cosine of the angle times inverse square = (z / d)^3
          const q = L.z / d; let v = 0.25 * q * q * q;
          if (v < 0.002) continue;
          if (shadows) v *= shadowAt(fx, fy, B, L);
          v *= FLOOR_ALB;
          this.add(r * cols + c, LC[0] * v, LC[1] * v, LC[2] * v);
        }
      }
    }
    for (const g of B){
      if (g.flash < 0.12) continue;
      const R = g.r * 4.5, c0 = Math.max(0, Math.floor((g.x - R) / cw)), c1 = Math.min(cols - 1, Math.floor((g.x + R) / cw));
      const r0 = Math.max(0, Math.floor((g.y - R) / ch)), r1 = Math.min(rows - 1, Math.floor((g.y + R) / ch));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
        const dd = Math.hypot((c + 0.5) * cw - g.x, (r + 0.5) * ch - g.y); if (dd >= R) continue;
        const v = g.flash * 0.35 * (1 - dd / R);
        this.add(r * cols + c, FLASH_RGB[0] * v, FLASH_RGB[1] * v, FLASH_RGB[2] * v);
      }
    }
  }
  streak(b, unit){
    if (b.static) return;
    const sp = Math.hypot(b.vx, b.vy); if (sp < 320) return;
    const len = Math.min((sp - 320) * 0.045, unit * 7); if (len < 2) return;
    const { cols, rows, cw, ch } = this, ux = -b.vx / sp, uy = -b.vy / sp, P = Math.PI, A = b.alb;
    let ang = Math.atan2(b.vy, b.vx); ang = ((ang % P) + P) % P;
    const glyph = (ang < P / 8 || ang > 7 * P / 8) ? 45 : ang < 3 * P / 8 ? 92 : ang < 5 * P / 8 ? 124 : 47;
    const step = Math.min(cw, ch) * 0.7;
    for (let s = b.r * 0.9; s < b.r + len; s += step){
      const c = Math.floor((b.x + ux * s) / cw), r = Math.floor((b.y + uy * s) / ch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const v = 0.7 * (1 - (s - b.r) / len);
      this.put(r * cols + c, A[0] * v, A[1] * v, A[2] * v, 1, glyph);
    }
  }
  ring(x, y, radius, rgb){
    const { cols, rows, cw, ch } = this, steps = Math.ceil(radius * 0.5);
    for (let k = 0; k < steps; k++){
      const a = k / steps * Math.PI * 2, c = Math.floor((x + Math.cos(a) * radius) / cw), r = Math.floor((y + Math.sin(a) * radius) / ch);
      if (c >= 0 && r >= 0 && c < cols && r < rows) this.put(r * cols + c, rgb[0], rgb[1], rgb[2], 1);
    }
  }
  bulb(L, unit){
    if (!L.on) return;
    const { cols, rows, cw, ch } = this, LC = this.D.lampRGB, R = unit * 2.4, Rb = Math.max(unit * 0.9, cw * 1.2);
    const c0 = Math.max(0, Math.floor((L.x - R) / cw)), c1 = Math.min(cols - 1, Math.floor((L.x + R) / cw));
    const r0 = Math.max(0, Math.floor((L.y - R) / ch)), r1 = Math.min(rows - 1, Math.floor((L.y + R) / ch));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
      const d = Math.hypot((c + 0.5) * cw - L.x, (r + 0.5) * ch - L.y), i = r * cols + c;
      if (d < Rb){ const v = 3 * (1 - 0.5 * d / Rb); this.put(i, LC[0] * v, LC[1] * v, LC[2] * v, 3); }
      else if (d < R){ const v = 0.35 * (1 - d / R); this.add(i, LC[0] * v, LC[1] * v, LC[2] * v); }
    }
  }
  // Light (linear, can exceed 1) -> screen colour -> character + colour per cell -> pixels.
  render(ctx, opt = {}){
    const { cols, rows, cw, ch, n, rad, lay, over, glyphs, D } = this;
    const ex = D.exposure, ig = 1 / D.gamma, split = D.split, black = D.black, lut = this.ink.lut, amp = 1 / Math.max(1, this.ink.count - 1);
    const cd = this.colImg.data, gd = this.glowImg.data;
    for (let i = 0; i < n; i++){
      const p = i * 4;
      if (lay[i] < 0){ cd[p + 3] = 0; gd[p] = gd[p + 1] = gd[p + 2] = 0; gd[p + 3] = 255; glyphs[i] = 32; continue; }
      const k = 3 * i;
      // 1. tone map: squeeze unlimited light into 0..1, then gamma-encode for the screen
      const R = Math.pow(1 - Math.exp(-rad[k] * ex), ig), G = Math.pow(1 - Math.exp(-rad[k + 1] * ex), ig), B = Math.pow(1 - Math.exp(-rad[k + 2] * ex), ig);
      gd[p] = R * 255; gd[p + 1] = G * 255; gd[p + 2] = B * 255; gd[p + 3] = 255;
      const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      if (Y <= black){ cd[p + 3] = 0; glyphs[i] = 32; continue; }   // darker than the cutoff: leave blank
      // 2. split brightness: part carried by character density, part by colour
      const Yc = (Y - black) / (1 - black), gl = Yc + split * (1 - Yc);
      let code = over[i];
      if (!code){
        let tt = gl;
        if (D.dither){ const c = i % cols, r = (i / cols) | 0; tt += ((BAYER[(r & 3) * 4 + (c & 3)] + 0.5) / 16 - 0.5) * amp; }
        code = lut[Math.max(0, Math.min(255, Math.round(tt * 255)))];
      }
      glyphs[i] = code;
      if (code === 32){ cd[p + 3] = 0; continue; }
      // colour keeps the cell's hue; its brightness supplies whatever the character's ink does not
      const kc = Yc / gl / Y; let dr = R * kc, dg = G * kc, db = B * kc; const m = Math.max(dr, dg, db);
      if (m > 1){ dr /= m; dg /= m; db /= m; }
      cd[p] = dr * 255; cd[p + 1] = dg * 255; cd[p + 2] = db * 255; cd[p + 3] = 255;
    }
    this.colX.putImageData(this.colImg, 0, 0); this.glowX.putImageData(this.glowImg, 0, 0);
    // 3. draw every character in white on its own layer...
    const g = this.gx, dpr = this.dpr, yOff = (ch - this.fontPx) / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "source-over"; g.clearRect(0, 0, this.glyphC.width, this.glyphC.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.font = this.fontPx + "px " + MONO; g.textBaseline = "top"; g.textAlign = "left"; g.fillStyle = "#fff";
    if ("fontKerning" in g) g.fontKerning = "none";
    if (this.ink.ascii){
      for (let r = 0; r < rows; r++){   // one call per row: monospace ASCII keeps every character on its cell
        const s = String.fromCharCode.apply(null, glyphs.subarray(r * cols, (r + 1) * cols));
        if (s.trim()) g.fillText(s, 0, r * ch + yOff);
      }
    } else {
      for (let i = 0; i < n; i++) if (glyphs[i] !== 32) g.fillText(String.fromCharCode(glyphs[i]), (i % cols) * cw, ((i / cols) | 0) * ch + yOff);
    }
    // ...then keep the white pixels only, painted with each cell's 24-bit colour
    g.globalCompositeOperation = "source-in"; g.imageSmoothingEnabled = false;
    g.drawImage(this.colC, 0, 0, cols * cw, rows * ch);
    g.globalCompositeOperation = "source-over";
    // 4. compose: background, soft glow, grid dots, coloured characters
    ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, this.W, this.H);
    if (D.glow > 0){
      ctx.imageSmoothingEnabled = true; this.glowSX.imageSmoothingEnabled = true;
      this.glowSX.clearRect(0, 0, this.glowS.width, this.glowS.height);
      this.glowSX.drawImage(this.glowC, 0, 0, this.glowS.width, this.glowS.height);
      ctx.globalAlpha = D.glow * 0.35; ctx.drawImage(this.glowC, 0, 0, cols * cw, rows * ch);
      ctx.globalAlpha = D.glow * 0.8; ctx.drawImage(this.glowS, 0, 0, cols * cw, rows * ch);
      ctx.globalAlpha = 1;
    }
    if (opt.grid){
      ctx.fillStyle = SCREEN.dot; ctx.font = this.fontPx + "px " + MONO; ctx.textBaseline = "top";
      for (let i = 0; i < n; i++) if (glyphs[i] === 32) ctx.fillText("\u00b7", (i % cols) * cw, ((i / cols) | 0) * ch + yOff);
    }
    ctx.drawImage(this.glyphC, 0, 0, this.W, this.H);
  }
}
