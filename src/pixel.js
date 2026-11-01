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
    // the edge pass: outlines from the layers (after Balote's shadeEdges, in core.js)
    edges(){ pixelArt(d, lay, flat, W, H); },
    fit(stage, cv, ctx){
      const r = stage.getBoundingClientRect(); if (!r.width) return false;
      const dpr = Math.min(window.devicePixelRatio || 1, 3), fit = Math.min(r.width / W, r.height / H);
      scale = Math.floor(fit * dpr) / dpr;
      if (scale * W < r.width * 0.75 && scale * H < r.height * 0.75) scale = fit;   // whole pixels would waste too much
      if (scale <= 0) scale = fit;
      sizeCanvas(cv, ctx, W * scale, H * scale, dpr, 1);
      return true;
    },
    present(ctx){
      bx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, W * scale, H * scale);   // the sky is see-through
      ctx.drawImage(buf, 0, 0, W * scale, H * scale);
      const cw = W * scale / cols, ch = H * scale / rows, f = Math.floor(Math.min(ch * 0.92, cw / 0.6));
      ctx.font = f + "px " + MONO; ctx.textBaseline = "middle";
      for (const t of texts){
        const y = (t.y + 0.5) * ch;
        if (t.layer >= MENU_LAYER){ ctx.fillStyle = "#000"; ctx.fillRect(t.x * cw, t.y * ch, t.s.length * cw, ch); }
        const c = P.rgb(t.v); if (!(c[0] + c[1] + c[2])) continue;
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        for (let i = 0; i < t.s.length; i++) if (t.s[i] !== " ") ctx.fillText(t.s[i], (t.x + i) * cw + (cw - f * 0.6) / 2, y);
      }
    }
  };
  return P;
}
