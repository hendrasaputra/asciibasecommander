const CODE = {
s1: `// Measure one character to get the cell size
ctx.font = fontPx + "px monospace";
const cw = ctx.measureText("M").width;  // cell width, e.g. 7.2 px
const ch = Math.round(fontPx * 1.15);   // cell height, e.g. 14 px
const cols = Math.floor(W / cw);
const rows = Math.floor(H / ch);

// Pixel position -> cell
const col = Math.floor(x / cw);
const row = Math.floor(y / ch);`,
s2: `const SUB = [0.25, 0.75];              // 2x2 sample offsets inside a cell
// bounding box: only the cells the ball can touch
const c0 = Math.floor((ball.x - ball.r) / cw), c1 = Math.floor((ball.x + ball.r) / cw);
const r0 = Math.floor((ball.y - ball.r) / ch), r1 = Math.floor((ball.y + ball.r) / ch);
for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
  let inside = 0;
  for (const sy of SUB) for (const sx of SUB) {
    const dx = (c + sx) * cw - ball.x;
    const dy = (r + sy) * ch - ball.y;
    if (dx * dx + dy * dy < ball.r * ball.r) inside++;
  }
  val[r * cols + c] = inside / 4;      // coverage 0..1
}`,
s3: `const ramp = " .:-=+*#%@";
const n = ramp.length - 1;             // 9
const glyph = ramp[Math.round(v * n)]; // v = 0.62 -> 5.58 -> 6 -> "*"`,
s4: `// 1. measure: draw each character in white, count lit pixels
function measureInk(chars, fontPx) {
  const c = document.createElement("canvas"), x = c.getContext("2d");
  c.width = cellW * 4; c.height = cellH * 4;         // 4x size for accuracy
  x.font = fontPx * 4 + "px monospace"; x.fillStyle = "#fff";
  return [...new Set(chars)].map(ch => {
    x.clearRect(0, 0, c.width, c.height);
    x.fillText(ch, 0, yOff);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i];   // alpha channel
    return { ch, ink: s / (255 * c.width * c.height) };          // share of the cell
  });
}
// 2. sort by ink, scale so the densest = 1, then pick the closest per brightness
const lv = measureInk(ramp, fontPx).sort((a, b) => a.ink - b.ink);
const max = lv[lv.length - 1].ink;
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  lut[i] = nearest(lv, l => Math.abs(l.ink / max - t)).ch;   // brightness -> char
}`,
s5: `if (Y <= black) { glyph = " "; }               // darker than the cutoff: blank
else {
  const Yc = (Y - black) / (1 - black);        // stretch the rest to 0..1
  let t = Yc;
  if (dither) {
    const b = BAYER[(row & 3) * 4 + (col & 3)];  // 0..15, fixed for each cell
    t += ((b + 0.5) / 16 - 0.5) / (levels - 1);  // up to half a step up or down
  }
  glyph = lut[Math.round(t * 255)];
}`,
s6: `const nz = Math.sqrt(1 - dx*dx - dy*dy);          // sphere height at this point
let lx = lamp.x - px, ly = lamp.y - py, lz = lamp.z - pz;
const d2 = lx*lx + ly*ly + lz*lz, d = Math.sqrt(d2);
lx /= d; ly /= d; lz /= d;                         // direction to the lamp, length 1
const fade = Math.min(3, 2.5 * lamp.z * lamp.z / d2);  // inverse square

const diffuse = fade * mat.kd * Math.max(0, dx*lx + dy*ly + nz*lz);
const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);   // halfway to the eye
const spec = fade * mat.ks * Math.pow(Math.max(0, (dx*hx + dy*hy + nz*hz) / hl), mat.shine);

// per colour channel: albedo tints diffuse and room light; highlight keeps the lamp colour
for (const k of [0, 1, 2])
  light[k] = alb[k] * (room[k] + lampRGB[k] * diffuse) + lampRGB[k] * spec;`,
s7: `// linear light r, g, b can be any size >= 0
const R = Math.pow(1 - Math.exp(-r * exposure), 1 / gamma);   // tone map, then gamma
const G = Math.pow(1 - Math.exp(-g * exposure), 1 / gamma);
const B = Math.pow(1 - Math.exp(-b * exposure), 1 / gamma);
const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;               // brightness as the eye sees it
const Yc = (Y - black) / (1 - black);                          // after the cutoff (step 5)

const level = Yc + split * (1 - Yc);        // how much ink the character carries
const glyph = lut[Math.round(level * 255)]; // measured ramp (step 4)
const k = Yc / level / Y;                   // colour supplies the rest...
let cr = R * k, cg = G * k, cb = B * k;     // ...keeping the cell's hue
const m = Math.max(cr, cg, cb);
if (m > 1) { cr /= m; cg /= m; cb /= m; }   // too bright: keep hue, cap at 1`,
s8: `// light arriving at floor point F: tilt x inverse square = (z / d)^3
const q = lamp.z / Math.hypot(lamp.x - fx, lamp.y - fy, lamp.z);
let light = 0.25 * q * q * q;
// line from floor point F to the lamp: F + t * D, with t from 0 to 1
const Dx = lamp.x - fx, Dy = lamp.y - fy, Dz = lamp.z;
const D2 = Dx*Dx + Dy*Dy + Dz*Dz;
for (const b of balls) {
  const cx = b.x - fx, cy = b.y - fy, cz = b.r;   // ball centre, relative to F
  const t = (cx*Dx + cy*Dy + cz*Dz) / D2;         // closest point on the line
  if (t <= 0 || t >= 1) continue;                 // ball not between F and lamp
  const qx = cx - t*Dx, qy = cy - t*Dy, qz = cz - t*Dz;
  const miss = Math.hypot(qx, qy, qz);            // how far the line passes from the centre
  const o = (b.r * 1.15 - miss) / (b.r * 0.45);   // 0 = clear, 1 = fully blocked
  if (o > 0) light *= 1 - 0.85 * Math.min(1, o);
}`,
s9: `step(dt) {
  const h = dt / this.substeps;           // 4 substeps = 1/240 s each at 60 fps
  for (let s = 0; s < this.substeps; s++) {
    for (const b of this.bodies) {
      b.vx += g.x * h;  b.vy += g.y * h;  // 1. velocity first
      b.x  += b.vx * h; b.y  += b.vy * h; // 2. then position
    }
    this.collide();                       // 3. fix overlaps
  }
}`,
s10: `const nx = dx / d, ny = dy / d;              // unit arrow from a to b
const wa = a.im, wb = b.im;                  // im = 1 / mass
// 1. separate: the lighter ball (bigger im) moves further
const push = (a.r + b.r - d) / (wa + wb);
a.x -= nx * push * wa;  a.y -= ny * push * wa;
b.x += nx * push * wb;  b.y += ny * push * wb;
// 2. bounce, only if the balls are moving towards each other
const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
if (vn < 0) {
  const j = -(1 + e) * vn / (wa + wb);       // impulse size
  a.vx -= j * nx * wa;  a.vy -= j * ny * wa; // equal and opposite
  b.vx += j * nx * wb;  b.vy += j * ny * wb;
}`,
s11: `const cs = maxRadius * 2 + 2;                 // square size
grid.clear();
for (let i = 0; i < B.length; i++) {
  const key = Math.floor(B[i].x / cs) + "," + Math.floor(B[i].y / cs);
  if (!grid.has(key)) grid.set(key, []);
  grid.get(key).push(i);
}
for (let i = 0; i < B.length; i++) {
  const cx = Math.floor(B[i].x / cs), cy = Math.floor(B[i].y / cs);
  for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
    for (const j of grid.get((cx + ox) + "," + (cy + oy)) || [])
      if (j > i) resolve(B[i], B[j]);          // j > i: test each pair once
  }
}`,
s12: `// n = arrow from ball centre to the wall, t = along the wall
const tx = -ny, ty = nx;
const slip = b.vx*tx + b.vy*ty + b.w * b.r;      // speed of the contact point
let jt = -slip / (b.im + b.r*b.r * b.iI);       // impulse that would stop the slip
const max = mat.mu * pressImpulse;              // grip limit
jt = Math.max(-max, Math.min(max, jt));
b.vx += jt * tx * b.im;  b.vy += jt * ty * b.im; // slows the ball
b.w  += jt * b.r * b.iI;                         // spins it up
// iI = 1 / (0.4 * mass * r * r) for a solid ball`,
s13: `if (b.grab) {
  const K = 520, C = 46;                  // spring stiffness, damper strength
  const mN = b.m / MREF;                  // mass relative to an average rubber ball
  ax += (K * (b.grab.x - b.x) - C * b.vx) / mN;
  ay += (K * (b.grab.y - b.y) - C * b.vy) / mN;
}`,
s14: `// 1. one pixel per cell holds that cell's 24-bit colour
colourImg.data.set([r, g, b, 255], i * 4);      // for every cell i
colourCtx.putImageData(colourImg, 0, 0);        // canvas is cols x rows pixels

// 2. every character in white, one fillText per row
g.fillStyle = "#fff";
for (let row = 0; row < rows; row++) g.fillText(rowText[row], 0, row * ch);

// 3. keep only the white pixels, painted with their cell's colour
g.globalCompositeOperation = "source-in";
g.imageSmoothingEnabled = false;                // hard cell edges
g.drawImage(colourCanvas, 0, 0, cols * cw, rows * ch);
g.globalCompositeOperation = "source-over";

// 4. glow behind, text on top
ctx.imageSmoothingEnabled = true;               // soft, blurry stretch
ctx.globalAlpha = glow; ctx.drawImage(glowCanvas, 0, 0, cols * cw, rows * ch);
ctx.globalAlpha = 1;    ctx.drawImage(textCanvas, 0, 0, W, H);`,
s15: `function frame(t) {
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
  world.step(dt);                                  // physics: steps 9-13
  screen.clear();
  screen.floor(world.bodies, lamp);                // floor light and shadows: step 8
  for (const b of world.bodies) screen.sphere(b, lamp);   // steps 2, 6
  for (const b of world.bodies) screen.streak(b, unit);   // trails for fast balls
  screen.bulb(lamp, unit);
  screen.render(ctx);                              // steps 4, 5, 7, 14
  requestAnimationFrame(frame);
}`
};
document.querySelectorAll("pre[data-code]").forEach(pre => {
  const code = document.createElement("code");
  for (const line of CODE[pre.dataset.code].split("\n")) {
    const i = line.indexOf("//");
    if (i >= 0) {
      code.append(line.slice(0, i));
      const s = document.createElement("span"); s.className = "cm"; s.textContent = line.slice(i);
      code.append(s);
    } else code.append(line);
    code.append("\n");
  }
  pre.append(code);
});
