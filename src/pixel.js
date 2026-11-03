/* ---------- native pixel art: a small canvas the cartridges draw into, pixel by pixel ---------- */
// A W x H canvas, scaled up to fit the stage by whole device pixels where it can, in the style of Pixel Plays'
// Balote. Colours are [r, g, b] 0 to 255; ramp(c) gives five shades of one (see rampOf in core.js's pixel pass).
// Every pixel has a layer: -1 empty sky, 1 scenery, 2 ground, 3 things; the edge pass in core.js (pixelArt)
// outlines shapes from those. Text and the menu are drawn over the scaled picture in a sharp font, on a grid of
// cols x rows cells, so menu.js and gridAt work unchanged. unit: world (physics) units per pixel; ox shifts world
// drawing sideways in pixels (a scrolling game's sub-column scroll).
function createPixels(W, H, cols, rows, unit){
  const buf = document.createElement("canvas"); buf.width = W; buf.height = H;
  const bx = buf.getContext("2d"), img = bx.createImageData(W, H), d = img.data;
  const lay = new Int8Array(W * H), flat = new Uint8Array(W * H), texts = [], ramps = new WeakMap();
  const lin = v => 255 * Math.pow(1 - Math.exp(-Math.max(0, v) * 1.3), 1 / 2.2);   // the engine's light values to 0..255
  const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  let scale = 1;
  const P = {
    W, H, cols, rows, unit, ox: 0, d, lay, cw: unit, ch: unit,   // cw, ch: one pixel in world units (fx.js)
    bayer,
    ramp(c){
      let r = ramps.get(c);
      if (!r){ const o = [0, 0, 0, 0]; r = [0, 1, 2, 3, 4].map(lv => { pixRamp(o, 0, c[0], c[1], c[2], lv); return [o[0], o[1], o[2]]; }); ramps.set(c, r); }
      return r;
    },
    clear(){ d.fill(0); lay.fill(-1); texts.length = 0; },
    // one pixel; a lower layer never covers a higher one
    px(x, y, c, layer = 3){
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = y * W + x; if (lay[i] > layer) return;
      const p = 4 * i; d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; lay[i] = layer;
    },
    rect(x, y, w, h, c, layer){ for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.px(x + i, y + j, c, layer); },
    line(x0, y0, x1, y1, c, layer){
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let k = 0; k <= n; k++) P.px(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), c, layer);
    },
    // A lit ball, as Balote's sphere(): light from the upper left, warm bounce from below, a shade of base's ramp
    // with a Bayer dither (solid: flat bands, for small things that should read as sharp shapes).
    ball(cx, cy, r, base, layer = 3, solid = false){
      const R = P.ramp(base), x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, nn = dx * dx + dy * dy;
        if (nn > 1) continue;
        let l = Math.max(0, Math.min(1, -0.55 * dx - 0.6 * dy + 0.58 * Math.sqrt(1 - nn)));
        if (dy > 0.35) l = Math.max(l, 0.12 + dy * 0.24);
        const lv = Math.max(solid ? 1 : 0, Math.min(4, Math.floor(l * 4.4 + 0.2 + (solid ? 0 : (bayer(x, y) - 0.5) * 0.7))));
        P.px(x, y, R[lv], layer);
      }
    },
    // the engine's light colours ([1.6, 1.3, 0.5] and so on) as a pixel colour
    rgb: v => [lin(v[0]), lin(v[1]), lin(v[2])],
    /* drawing in world units, for physics bodies and fx.js */
    dot(x, y, v, layer = 3){ P.px(x / unit + P.ox, y / unit, P.rgb(v), layer); },
    // Light that adds to whatever is there, in three dithered steps, so it stays pixel art.
    glow(x, y, R, v){
      const cx = x / unit + P.ox, cy = y / unit, r = R / unit;
      for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++){
        if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const q = 1 - Math.hypot(i + 0.5 - cx, j + 0.5 - cy) / r; if (q <= 0) continue;
        const k = Math.floor(q * q * 3 + bayer(i, j)) / 3; if (k <= 0) continue;
        const p = 4 * (j * W + i);
        d[p] = Math.min(255, d[p] + lin(v[0]) * k); d[p + 1] = Math.min(255, d[p + 1] + lin(v[1]) * k); d[p + 2] = Math.min(255, d[p + 2] + lin(v[2]) * k);
        if (!d[p + 3]){ d[p + 3] = 255; lay[j * W + i] = 0; }
      }
    },
    // A physics body: balls as lit balls, boxes as bevelled plates turned to their angle. alb is the body's colour
    // in the engine's light values.
    body(b, base){
      base = base || P.rgb(b.alb);
      const cx = b.x / unit + P.ox, cy = b.y / unit;
      if (!b.box) return P.ball(cx, cy, Math.max(0.8, b.r / unit), base);
      const R = P.ramp(base), c = Math.cos(b.a), s = Math.sin(b.a), hw = b.hw / unit, hh = b.hh / unit, e = Math.ceil(Math.hypot(hw, hh));
      for (let y = Math.floor(cy - e); y <= cy + e; y++) for (let x = Math.floor(cx - e); x <= cx + e; x++){
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, lx = dx * c + dy * s, ly = -dx * s + dy * c;
        if (Math.abs(lx) > hw || Math.abs(ly) > hh) continue;
        const ex = hw - Math.abs(lx) < 1 ? Math.sign(lx) : 0, ey = hh - Math.abs(ly) < 1 ? Math.sign(ly) : 0;
        const tilt = (ex * c - ey * s) + (ex * s + ey * c);   // the edge's screen direction: up/left lit, down/right dark
        P.px(x, y, R[tilt < 0 ? 4 : tilt > 0 ? 1 : 3], 3);
      }
    },
    /* text, on the cols x rows grid, drawn sharp over the picture */
    text(x, y, s, v, layer = TEXT_LAYER){ texts.push({ x, y, s, v, layer }); },
    center(y, s, v){ P.text((cols - s.length) >> 1, y, s, v); },
    // A button three text rows tall from row r0, big enough to tap, with its label in the middle row.
    button(r0, label, v, w = W * 0.68){
      const x0 = Math.round((W - w) / 2), x1 = W - 1 - x0, y0 = Math.round(r0 * H / rows), y1 = Math.round((r0 + 3) * H / rows) - 3;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) P.px(x, y, y === y0 || y === y1 || x === x0 || x === x1 ? [96, 104, 150] : [24, 28, 50], 3);
      P.center(r0 + 1, label, v);
    },
    // the edge pass: outlines from the layers (after Balote's shadeEdges, in core.js)
    edges(){ pixelArt(d, lay, flat, W, H); },
    fit(stage, cv, ctx){
      const r = stage.getBoundingClientRect(); if (!r.width) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 3), fit = Math.min(r.width / W, r.height / H);
      // Whole device pixels per pixel, with black bars around the picture. A picture with its own pixel font (P.font)
      // keeps to that always. The others are too big for a phone at whole pixels (a 400-pixel-wide picture on a
      // 386-point screen would be drawn 200 points wide), so when whole pixels waste more than 10% of the stage they
      // scale by a fraction instead, until they are redrawn smaller. ponytail: at least 1 device pixel, so a stage
      // smaller than that crops the picture.
      scale = Math.max(1, Math.floor(fit * dpr)) / dpr;
      if (!P.font && scale < fit * 0.9) scale = fit;
      sizeCanvas(cv, ctx, W * scale, H * scale, dpr, 1);
      // placed on whole device pixels (translate(-50%) can land on a half one, which blurs the picture)
      const at = (room, size) => Math.round((room - size) / 2 * dpr) / dpr + "px";
      cv.style.transform = "none"; cv.style.left = at(r.width, W * scale); cv.style.top = at(r.height, H * scale);
      cv.dataset.px = scale;   // CSS pixels per pixel, so the screen shake (createFeel) moves by whole pixels
      return true;
    },
    // With P.font set (PIXEL_FONT), text is drawn into the picture in that pixel font at its native size, one cell
    // font.w x font.h pixels, instead of in a smooth font over it. gridAt(fx, fy): the text cell at a fraction of
    // the picture (a pointer), for menu.tap.
    font: null,
    gridAt(fx, fy){
      const F = P.font; if (!F) return [Math.floor(fx * cols), Math.floor(fy * rows)];
      return [Math.floor((fx * W - ((W - cols * F.w) >> 1)) / F.w), Math.floor(fy * H / F.h)];
    },
    present(ctx){
      if (P.font) drawFont();
      bx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, W * scale, H * scale);   // the sky is see-through
      ctx.drawImage(buf, 0, 0, W * scale, H * scale);
      const cw = W * scale / cols, ch = H * scale / rows, f = Math.floor(Math.min(ch * 0.92, cw / 0.6));
      ctx.font = f + "px " + MONO; ctx.textBaseline = "middle";
      for (const t of P.font ? [] : texts){
        const y = (t.y + 0.5) * ch;
        if (t.layer >= MENU_LAYER){ ctx.fillStyle = "#000"; ctx.fillRect(t.x * cw, t.y * ch, t.s.length * cw, ch); }
        const c = P.rgb(t.v); if (!(c[0] + c[1] + c[2])) continue;
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        for (let i = 0; i < t.s.length; i++) if (t.s[i] !== " ") ctx.fillText(t.s[i], (t.x + i) * cw + (cw - f * 0.6) / 2, y);
      }
    }
  };
  function drawFont(){
    const F = P.font, x0 = (W - cols * F.w) >> 1, set = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = 4 * (y * W + x); d[p] = c[0]; d[p + 1] = c[1]; d[p + 2] = c[2]; d[p + 3] = 255; };
    for (const t of texts){
      const X = x0 + t.x * F.w, Y = t.y * F.h, c = P.rgb(t.v);
      if (t.layer >= MENU_LAYER) for (let y = 0; y < F.h; y++) for (let x = 0; x < t.s.length * F.w; x++) set(X + x, Y + y, [0, 0, 0]);
      if (!(c[0] + c[1] + c[2])) continue;
      for (let i = 0; i < t.s.length; i++){
        const g = F.glyphs[t.s[i]] || F.glyphs[t.s[i].toUpperCase()]; if (!g) continue;
        for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (+g[r] >> (2 - k) & 1) set(X + i * F.w + k, Y + 1 + r, c);
      }
    }
  }
  return P;
}
// A 3 x 5 pixel font, drawn for this arcade: each glyph is five rows, a digit 0-7 per row whose bits are the three
// columns, left to right. Cells are 4 x 7 pixels: a column and two rows of space.
const PIXEL_FONT = { w: 4, h: 7, glyphs: {
  A: "25755", B: "65656", C: "34443", D: "65556", E: "74647", F: "74644", G: "34553", H: "55755", I: "72227", J: "11152",
  K: "55655", L: "44447", M: "57755", N: "65555", O: "75557", P: "65644", Q: "25553", R: "65655", S: "34216", T: "72222",
  U: "55557", V: "55552", W: "55775", X: "55255", Y: "55222", Z: "71247",
  0: "25552", 1: "26227", 2: "61247", 3: "61216", 4: "55711", 5: "74616", 6: "34757", 7: "71222", 8: "75757", 9: "75716",
  "!": "22202", "-": "00700", ".": "00002", ":": "02020", "<": "12421", ">": "42124", "^": "25000", "|": "22222", "+": "02720",
  "(": "12221", ")": "42224", "/": "11244", "'": "22000", ",": "00024", "?": "61202", "*": "05250", "#": "57575", "=": "07070", "_": "00007"
} };
