/* ---------- hero ---------- */
(() => {
  const C = makeCanvas("hero"), S = new Screen(11), w = new World();
  const L = { x: 0, y: 0, z: 80, R2: 1, on: true }; let started = !reduceMotion;
  const render = () => {
    S.clear(); S.floor(w.bodies, L);
    for (const b of w.bodies) S.sphere(b, L);
    for (const b of w.bodies) S.streak(b, w.unit);
    S.bulb(L, w.unit); S.render(C.ctx);
  };
  C.onResize = () => {
    const first = !w.bodies.length;
    S.fit(C.W, C.H, C.dpr); w.w = S.w; w.h = S.h; w.unit = Math.min(C.W, C.H) / 22;
    w.g = { x: 0, y: w.h * 1.6 }; w.drag = 2e-4 * (600 / w.h) ** 2;
    L.x = w.w * 0.3; L.y = w.h * 0.35; L.z = w.unit * 6;
    if (first) for (let i = 0; i < 16; i++) spawn(w, Math.random() * w.w, Math.random() * w.h * 0.6, MIX[i % MIX.length]);
    render();
  };
  C.onResize();
  grabber(C.cv, w, () => w.unit * 1.8, () => { started = true; });
  register(C.cv, dt => { if (!started) return; w.step(dt); render(); });
})();

/* ---------- 1: cells ---------- */
(() => {
  const C = makeCanvas("c1"), out = $("c1r"), fontPx = 13; let cw = 7, ch = 15, sel = null;
  const render = () => {
    const ctx = C.ctx, W = C.W, H = C.H;
    ctx.font = fontPx + "px " + MONO; cw = ctx.measureText("M").width; ch = Math.round(fontPx * 1.15);
    const cols = Math.floor(W / cw), rows = Math.floor(H / ch);
    ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = SCREEN.line; ctx.lineWidth = 0.5; ctx.beginPath();
    for (let c = 0; c <= cols; c++){ ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, rows * ch); }
    for (let r = 0; r <= rows; r++){ ctx.moveTo(0, r * ch); ctx.lineTo(cols * cw, r * ch); }
    ctx.stroke();
    const R = Math.min(W * 0.17, (H - 30) * 0.22), cy = (H - 22) / 2, lx = W * 0.27, rx = W * 0.73, rc = R / cw;
    ctx.textBaseline = "top"; ctx.textAlign = "left"; const yOff = (ch - fontPx) / 2;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
      const px = (c + 0.5) * cw, py = (r + 0.5) * ch;
      if ((px - lx) ** 2 + (py - cy) ** 2 < R * R){ ctx.fillStyle = SCREEN.accent; ctx.fillText("#", c * cw, r * ch + yOff); }
      else if ((c + 0.5 - rx / cw) ** 2 + (r + 0.5 - cy / ch) ** 2 < rc * rc){ ctx.fillStyle = SCREEN.pink; ctx.fillText("#", c * cw, r * ch + yOff); }
    }
    ctx.font = "12px " + SANS; ctx.textAlign = "center"; ctx.fillStyle = SCREEN.muted;
    ctx.fillText("radius measured in pixels", lx, H - 17); ctx.fillText("radius measured in cells", rx, H - 17); ctx.textAlign = "left";
    if (sel){
      ctx.strokeStyle = SCREEN.lamp; ctx.lineWidth = 2; ctx.strokeRect(sel.c * cw, sel.r * ch, cw, ch);
      out.textContent = "col = floor(" + sel.x.toFixed(0) + " / " + cw.toFixed(1) + ") = " + sel.c + "\nrow = floor(" + sel.y.toFixed(0) + " / " + ch + ") = " + sel.r + "\nCell size: " + cw.toFixed(1) + " × " + ch + " px";
    }
  };
  const pick = p => { sel = { x: p.x, y: p.y, c: Math.floor(p.x / cw), r: Math.floor(p.y / ch) }; render(); };
  pointer(C.cv, { down: pick, move: pick });
  C.onResize = render; render();
})();

/* ---------- 2: coverage ---------- */
(() => {
  const C = makeCanvas("c2"); let four = true; const b = { x: 0, y: 0, placed: false };
  const cw = 30, ch = Math.round(30 / 0.55), ramp = RAMPS.classic, n = ramp.length - 1;
  const render = () => {
    const ctx = C.ctx, W = C.W, H = C.H;
    if (!b.placed){ b.x = W * 0.5; b.y = H * 0.5; b.placed = true; }
    const R = Math.min(W, H) * 0.3, cols = Math.ceil(W / cw), rows = Math.ceil(H / ch);
    const pts = four ? [[.25, .25], [.75, .25], [.25, .75], [.75, .75]] : [[.5, .5]];
    ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
      const x = c * cw, y = r * ch; let inside = 0; const hits = [];
      for (const [sx, sy] of pts){ const px = x + sx * cw, py = y + sy * ch, ins = (px - b.x) ** 2 + (py - b.y) ** 2 < R * R; hits.push([px, py, ins]); if (ins) inside++; }
      const v = inside / pts.length;
      if (v > 0){
        ctx.globalAlpha = 0.08 + v * 0.14; ctx.fillStyle = SCREEN.accent; ctx.fillRect(x, y, cw, ch); ctx.globalAlpha = 1;
        ctx.font = "26px " + MONO; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = SCREEN.accent;
        ctx.fillText(ramp[Math.round(v * n)], x + cw / 2, y + ch / 2 + 4);
        ctx.font = "10px " + MONO; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillStyle = SCREEN.text;
        ctx.fillText(v === 1 ? "1" : v.toFixed(2).slice(1), x + 3, y + 3);
      }
      const near = Math.hypot(x + cw / 2 - b.x, y + ch / 2 - b.y) < R + ch;
      for (const [px, py, ins] of hits){
        if (!ins && !near) continue;
        ctx.beginPath(); ctx.arc(px, py, 2.3, 0, 6.283);
        if (ins){ ctx.fillStyle = SCREEN.lamp; ctx.fill(); } else { ctx.strokeStyle = SCREEN.muted; ctx.lineWidth = 1; ctx.stroke(); }
      }
    }
    ctx.strokeStyle = SCREEN.line; ctx.lineWidth = 1; ctx.beginPath();
    for (let c = 0; c <= cols; c++){ ctx.moveTo(c * cw + .5, 0); ctx.lineTo(c * cw + .5, H); }
    for (let r = 0; r <= rows; r++){ ctx.moveTo(0, r * ch + .5); ctx.lineTo(W, r * ch + .5); }
    ctx.stroke();
    ctx.setLineDash([4, 4]); ctx.strokeStyle = SCREEN.text; ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
  };
  const move = p => { b.x = p.x; b.y = p.y; render(); };
  pointer(C.cv, { down: move, move });
  toggleGroup("[data-c2]", "c2", v => { four = v === "4"; render(); });
  C.onResize = render; render();
})();

/* ---------- 3: ramp by position ---------- */
(() => {
  const C = makeCanvas("c3"), slider = $("c3v"), out = $("c3r"); let name = "classic";
  const render = () => {
    const ctx = C.ctx, W = C.W, ramp = RAMPS[name], n = ramp.length - 1, v = +slider.value;
    ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, W, C.H);
    const grad = ctx.createLinearGradient(12, 0, W - 12, 0); grad.addColorStop(0, SCREEN.bg); grad.addColorStop(1, SCREEN.text);
    ctx.fillStyle = grad; ctx.fillRect(12, 12, W - 24, 22); ctx.strokeStyle = SCREEN.line; ctx.strokeRect(12.5, 12.5, W - 25, 21);
    ctx.font = "15px " + MONO; const cw = ctx.measureText("M").width, cols = Math.floor((W - 24) / cw);
    ctx.textBaseline = "top"; ctx.textAlign = "left"; ctx.fillStyle = SCREEN.text;
    for (let c = 0; c < cols; c++) ctx.fillText(ramp[Math.round(c / (cols - 1) * n)], 12 + c * cw, 42);
    const mx = 12 + v * (W - 24);
    ctx.fillStyle = SCREEN.lamp; ctx.beginPath(); ctx.moveTo(mx, 62); ctx.lineTo(mx - 6, 72); ctx.lineTo(mx + 6, 72); ctx.fill();
    const idx = Math.round(v * n), g = ramp[idx];
    ctx.font = "56px " + MONO; ctx.textAlign = "center"; ctx.fillStyle = SCREEN.lamp; ctx.fillText(g === " " ? "␣" : g, W / 2, 80);
    out.textContent = "v = " + v.toFixed(2) + "   " + v.toFixed(2) + " × " + n + " = " + (v * n).toFixed(2) + " → round → " + idx + " → \"" + g + "\"";
  };
  slider.addEventListener("input", render);
  toggleGroup("[data-c3]", "c3", v => { name = v; render(); });
  C.onResize = render; render();
})();

/* ---------- 4: measured ink ---------- */
(() => {
  const C = makeCanvas("c4"), out = $("c4r"); let name = "classic"; const fontPx = 14;
  const render = () => {
    const ctx = C.ctx, W = C.W, chars = RAMPS[name];
    const pos = buildLUT(chars, fontPx, false), cal = buildLUT(chars, fontPx, true), ink = measureInk(chars, fontPx);
    const arr = [...new Set([...chars])], maxInk = Math.max(...ink.map(l => l.ink));
    ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, W, C.H);
    const slot = Math.min(26, (W - 24) / arr.length);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    arr.forEach((g, i) => {
      const cx = 12 + slot * (i + 0.5), k = ink.find(l => l.ch === g).ink;
      ctx.font = Math.min(16, slot) + "px " + MONO; ctx.fillStyle = SCREEN.text; ctx.fillText(g === " " ? "␣" : g, cx, 8);
      const bh = 36 * k / maxInk; ctx.fillStyle = SCREEN.accent; ctx.fillRect(cx - slot * 0.3, 66 - bh, slot * 0.6, bh);
    });
    ctx.font = fontPx + "px " + MONO; const cw = ctx.measureText("M").width, ch = Math.round(fontPx * 1.15), cols = Math.floor((W - 24) / cw);
    ctx.textAlign = "left";
    const band = (lut, y, label) => {
      ctx.font = "11px " + SANS; ctx.fillStyle = SCREEN.muted; ctx.fillText(label, 12, y);
      ctx.font = fontPx + "px " + MONO; ctx.fillStyle = SCREEN.text;
      let s = ""; for (let c = 0; c < cols; c++) s += String.fromCharCode(lut[Math.round(c / (cols - 1) * 255)]);
      for (let k = 0; k < 2; k++) ctx.fillText(s, 12, y + 15 + k * ch);
    };
    band(pos.lut, 80, "By position in the list (step 3)");
    band(cal.lut, 130, "By measured ink");
    ctx.font = "11px " + SANS; ctx.fillStyle = SCREEN.muted; ctx.fillText("Target: smooth light", 12, 180);
    const grad = ctx.createLinearGradient(12, 0, 12 + cols * cw, 0); grad.addColorStop(0, SCREEN.bg); grad.addColorStop(1, SCREEN.text);
    ctx.fillStyle = grad; ctx.fillRect(12, 196, cols * cw, 18);
    out.textContent = arr.map(g => (g === " " ? "␣" : g) + " " + (100 * ink.find(l => l.ch === g).ink).toFixed(1) + "%").join("   ");
  };
  toggleGroup("[data-c4]", "c4", v => { name = v; render(); });
  C.onResize = render; render();
})();

/* ---------- 5: black cutoff and dither ---------- */
(() => {
  const C = makeCanvas("c5"), D = Object.assign(defaultDisplay(), { split: 0, room: 0, glow: 0.2 }), S = new Screen(11, D);
  const L = { x: 0, y: 0, z: 60, R2: 1, on: true }; let placed = false;
  const render = () => {
    if (!placed){ L.x = S.w * 0.5; L.y = S.h * 0.5; placed = true; }
    L.z = Math.min(S.w, S.h) * 0.3;
    S.clear(); S.floor([], L); S.bulb(L, Math.min(S.w, S.h) / 40); S.render(C.ctx);
  };
  const mv = p => { L.x = p.x; L.y = p.y; render(); };
  pointer(C.cv, { down: mv, move: mv });
  toggleBtn("c5d", on => { D.dither = on; render(); });
  $("c5b").addEventListener("input", e => { D.black = +e.target.value; render(); });
  C.onResize = () => { S.fit(C.W, C.H, C.dpr); render(); }; C.onResize();
})();

/* ---------- 6: colour sphere ---------- */
(() => {
  const C = makeCanvas("c6"), D = defaultDisplay(), S = new Screen(11, D), zs = $("c6z");
  const L = { x: 0, y: 0, z: 0, R2: 1, on: true }, b = ball(0, 0, 50, "steel"), opt = { diffuse: true, spec: true, stripe: false }; let placed = false;
  const render = () => {
    b.x = S.w / 2; b.y = S.h / 2; b.r = Math.min(S.w, S.h) * 0.36; L.z = b.r * +zs.value;
    if (!placed){ L.x = S.w * 0.2; L.y = S.h * 0.2; placed = true; }
    S.clear(); S.sphere(b, L, opt); S.bulb(L, b.r / 5); S.render(C.ctx);
  };
  const mv = p => { L.x = p.x; L.y = p.y; render(); };
  pointer(C.cv, { down: mv, move: mv });
  toggleGroup("[data-c6m]", "c6m", m => { b.mat = MATS[m]; b.alb = MATS[m].alb; render(); });
  toggleGroup("[data-c6c]", "c6c", hex => { D.lampHex = hex; D.lampRGB = hexToLinear(hex); render(); });
  toggleBtn("c6d", on => { opt.diffuse = on; render(); });
  toggleBtn("c6s", on => { opt.spec = on; render(); });
  zs.addEventListener("input", render);
  C.onResize = () => { S.fit(C.W, C.H, C.dpr); render(); }; C.onResize();
})();

/* ---------- 7: tone mapping inspector ---------- */
(() => {
  const C = makeCanvas("c7"), D = defaultDisplay(), S = new Screen(11, D), out = $("c7r");
  const L = { x: 0, y: 0, z: 0, R2: 1, on: true }, b = ball(0, 0, 40, "rubber"); let sel = -1;
    const render = () => {
    b.x = S.w * 0.55; b.y = S.h * 0.55; b.r = Math.min(S.w, S.h) * 0.3;
    L.x = S.w * 0.2; L.y = S.h * 0.22; L.z = b.r * 1.5;
    S.clear(); S.floor([b], L); S.sphere(b, L, { stripe: false }); S.bulb(L, b.r / 5); S.render(C.ctx);
    if (sel < 0) return;
    const c = sel % S.cols, r = (sel / S.cols) | 0, ctx = C.ctx;
    ctx.strokeStyle = SCREEN.lamp; ctx.lineWidth = 2; ctx.strokeRect(c * S.cw - 1, r * S.ch - 1, S.cw + 2, S.ch + 2);
    const k = sel * 3, lin = [S.rad[k], S.rad[k + 1], S.rad[k + 2]];
    if (S.lay[sel] < 0){ out.textContent = "col " + c + ", row " + r + "\nNo light reaches this cell."; return; }
    const tm = lin.map(v => 1 - Math.exp(-v * D.exposure)), ga = tm.map(v => Math.pow(v, 1 / D.gamma));
    const Y = 0.2126 * ga[0] + 0.7152 * ga[1] + 0.0722 * ga[2], f = a => a.map(v => v.toFixed(2)).join(" ");
    let s = "cell " + c + "," + r + "      r    g    b" +
      "\nlinear light  " + f(lin) + "\ntone mapped   " + f(tm) + "\ngamma         " + f(ga) +
      "\nbrightness Y  " + Y.toFixed(2);
    if (Y <= D.black) s += "\nbelow cutoff " + D.black.toFixed(2) + ": blank";
    else {
      const Yc = (Y - D.black) / (1 - D.black), gl = Yc + D.split * (1 - Yc), p = sel * 4, cd = S.colImg.data;
      s += " → " + Yc.toFixed(2) + " after cutoff" +
        "\nsplit " + Math.round(D.split * 100) + "%: ink " + gl.toFixed(2) + " → \"" + String.fromCharCode(S.glyphs[sel]) + "\"" +
        "\ncolour #" + hex2(cd[p] / 255) + hex2(cd[p + 1] / 255) + hex2(cd[p + 2] / 255) + " supplies the rest";
    }
    out.textContent = s;
  };
  const pick = p => { const c = Math.floor(p.x / S.cw), r = Math.floor(p.y / S.ch); if (c >= 0 && r >= 0 && c < S.cols && r < S.rows){ sel = r * S.cols + c; render(); } };
  pointer(C.cv, { down: pick, move: pick });
  [["c7e", "exposure"], ["c7g", "gamma"], ["c7s", "split"]].forEach(([id, key]) => $(id).addEventListener("input", e => { D[key] = +e.target.value; render(); }));
  C.onResize = () => { S.fit(C.W, C.H, C.dpr); sel = -1; render(); }; C.onResize();
})();

/* ---------- 8: floor and shadows ---------- */
(() => {
  const C = makeCanvas("c8"), S = new Screen(11), out = $("c8r");
  const L = { x: 0, y: 0, z: 0, R2: 1, on: true }, b = ball(0, 0, 30, "rubber");
  let shadows = true, probe = null, drag = null, placed = false;
  const render = () => {
    if (!placed){ L.x = S.w * 0.25; L.y = S.h * 0.3; b.x = S.w * 0.5; b.y = S.h * 0.55; placed = true; }
    b.r = Math.min(S.w, S.h) * 0.12; L.z = b.r * 2.2;
    S.clear(); S.floor([b], L, shadows); S.sphere(b, L, { stripe: false }); S.bulb(L, b.r / 3); S.render(C.ctx);
    if (!probe) return;
    const sh = shadowAt(probe.x, probe.y, [b], L), ctx = C.ctx, blocked = sh < 0.98;
    ctx.strokeStyle = blocked ? SCREEN.pink : SCREEN.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(probe.x, probe.y); ctx.lineTo(L.x, L.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(probe.x, probe.y, 4, 0, 6.283); ctx.fill();
    out.textContent = blocked ? "The line hits the ball. This point gets " + Math.round(sh * 100) + "% of the lamp's light." : "The line reaches the lamp. This point gets full light.";
  };
  pointer(C.cv, {
    down(p){
      if (Math.hypot(p.x - L.x, p.y - L.y) < 36) drag = "lamp";
      else if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 10) drag = "ball";
      else { drag = "probe"; probe = { x: p.x, y: p.y }; }
      render();
    },
    move(p){ const t = drag === "lamp" ? L : drag === "ball" ? b : probe; if (t){ t.x = p.x; t.y = p.y; render(); } },
    up(){ drag = null; }
  });
  toggleBtn("c8s", on => { shadows = on; render(); });
  C.onResize = () => { S.fit(C.W, C.H, C.dpr); render(); }; C.onResize();
})();

/* ---------- 9: substeps ---------- */
(() => {
  const C = makeCanvas("c9"), S = new Screen(11), w = new World(), out = $("c9r");
  const stats = {}; let bl = null, trail = [], running = false, t = 0, wallX = 0, pegR = 6, sub = 1, result = "";
  w.onSub = () => { if (bl && running){ trail.push({ x: bl.x, y: bl.y }); if (trail.length > 120) trail.shift(); } };
  const build = () => {
    S.fit(C.W, C.H, C.dpr); w.bodies = []; bl = null; trail = []; running = false;
    w.w = S.w; w.h = S.h; w.unit = 10; w.g = { x: 0, y: 0 };
    pegR = Math.max(5, S.cw * 0.8); wallX = w.w * 0.62;
    for (let y = pegR; y < w.h; y += pegR * 2) w.add(wallX, y, pegR, "peg");
    render();
  };
  const render = () => {
    S.clear(); for (const b of w.bodies) S.sphere(b, null); S.render(C.ctx);
    const ctx = C.ctx; ctx.fillStyle = SCREEN.lamp;
    for (const p of trail){ ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 6.283); ctx.fill(); }
  };
  const report = () => {
    const lines = Object.keys(stats).sort((a, b) => a - b).map(k => k + (k === "1" ? " substep:  " : " substeps: ") + stats[k].through + " of " + stats[k].shots + " shots went through");
    out.textContent = (result ? result + "\n" : "") + lines.join("\n");
  };
  $("c9f").addEventListener("click", () => {
    if (bl) w.bodies.splice(w.bodies.indexOf(bl), 1);
    bl = w.add(20 + Math.random() * 60, w.h * (0.2 + Math.random() * 0.6), Math.max(5, S.ch * 0.42), "steel");
    bl.vx = 3000; bl.vy = 0; trail = []; running = true; t = 0; w.substeps = sub; result = "";
  });
  toggleGroup("[data-c9]", "c9", v => { sub = +v; });
  register(C.cv, () => {
    if (!running || !bl) return;
    w.step(1 / 60); t += 1 / 60;
    let done = null;
    if (bl.x > wallX + pegR + bl.r) done = "through"; else if (bl.vx < 0 || t > 1.5) done = "blocked";
    if (done){
      running = false; const s = stats[sub] || (stats[sub] = { shots: 0, through: 0 });
      s.shots++; if (done === "through") s.through++;
      result = done === "through" ? "Last shot tunnelled through the wall." : "Last shot hit the wall."; report();
    }
    render();
  });
  C.onResize = build; build();
})();

/* ---------- 10: collisions ---------- */
(() => {
  const C = makeCanvas("c10"), S = new Screen(11), w = new World(), out = $("c10r");
  let lm = "steel", rm = "foam", A = null, B = null, running = false, before = null;
  const setup = () => {
    w.bodies = []; w.unit = Math.min(C.W, C.H) / 9;
    const M1 = MATS[lm], M2 = MATS[rm];
    A = w.add(S.w * 0.2, w.h / 2, w.unit * (M1.rMin + M1.rMax) / 2, lm);
    B = w.add(S.w * 0.62, w.h / 2, w.unit * (M2.rMin + M2.rMax) / 2, rm);
    A.a = B.a = 0;
  };
  const f1 = x => x.toFixed(1);
  const report = () => {
    const vA = toM(w, A.vx), vB = toM(w, B.vx), p = A.m * vA + B.m * vB, e = 0.5 * A.m * vA * vA + 0.5 * B.m * vB * vB;
    let s = "Left  " + lm.padEnd(6) + " " + f1(A.m) + " kg   Right " + rm.padEnd(6) + " " + f1(B.m) + " kg\n";
    if (before) s += "Before: left " + f1(before.vA) + " m/s, right 0.0 m/s. Momentum " + f1(before.p) + "\n";
    s += "Now:    left " + f1(vA) + " m/s, right " + f1(vB) + " m/s. Momentum " + f1(p);
    if (before && before.e > 0) s += "\nMovement energy kept: " + Math.round(e / before.e * 100) + "%";
    out.textContent = s;
  };
  const L = { on: false };
  const render = () => { S.clear(); for (const b of [A, B]) if (b) S.sphere(b, L); for (const b of [A, B]) if (b) S.streak(b, w.unit); S.render(C.ctx); };
  $("c10f").addEventListener("click", () => { setup(); A.vx = S.w * 1.1; running = true; const vA = toM(w, A.vx); before = { vA, p: A.m * vA, e: 0.5 * A.m * vA * vA }; });
  toggleGroup("[data-c10l]", "c10l", v => { lm = v; running = false; before = null; setup(); render(); report(); });
  toggleGroup("[data-c10r]", "c10r", v => { rm = v; running = false; before = null; setup(); render(); report(); });
  register(C.cv, () => {
    if (!running) return;
    w.step(1 / 60);
    for (const b of [A, B]) if (b.x - b.r > S.w || b.x + b.r < 0) running = false;   // no side walls here
    render(); report();
  });
  C.onResize = () => { S.fit(C.W, C.H, C.dpr); w.w = 1e6; w.h = S.h; running = false; setup(); render(); };
  C.onResize();
})();

/* ---------- 11: broad phase ---------- */
(() => {
  const C = makeCanvas("c11"), S = new Screen(10), w = new World(), out = $("c11r");
  let showSq = true, hudT = 0; const mat = Object.assign({}, MATS.rubber, { e: 0.98, mu: 0 });
  const build = () => {
    S.fit(C.W, C.H, C.dpr); w.w = S.w; w.h = S.h; w.unit = Math.min(C.W, C.H) / 32; w.bodies = [];
    for (let i = 0; i < 70; i++){
      const b = w.add(Math.random() * w.w, Math.random() * w.h, w.unit * (0.7 + Math.random() * 0.45), "rubber", i === 0 ? [1, 0.8, 0.25] : (i % 2 ? MATS.rubber.alb : MATS.rubber.alt), mat);
      b.vx = (Math.random() - 0.5) * 240; b.vy = (Math.random() - 0.5) * 240;
    }
    w.step(0); render();
  };
  const count = () => {
    w.buildGrid(); const cs = w.cell, B = w.bodies; let n = 0;
    for (let i = 0; i < B.length; i++){
      const cx = Math.floor(B[i].x / cs), cy = Math.floor(B[i].y / cs);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++){ const arr = w.grid.get((cx + ox) + "," + (cy + oy)); if (arr) for (const j of arr) if (j > i) n++; }
    }
    return n;
  };
  const render = () => {
    S.clear(); for (const b of w.bodies) S.sphere(b, null); S.render(C.ctx);
    if (!showSq || !w.bodies.length) return;
    const ctx = C.ctx, cs = w.cell, b0 = w.bodies[0], cx = Math.floor(b0.x / cs), cy = Math.floor(b0.y / cs);
    ctx.globalAlpha = 0.16; ctx.fillStyle = SCREEN.lamp; ctx.fillRect((cx - 1) * cs, (cy - 1) * cs, cs * 3, cs * 3); ctx.globalAlpha = 1;
    ctx.strokeStyle = SCREEN.line; ctx.lineWidth = 0.8; ctx.beginPath();
    for (let x = 0; x <= C.W; x += cs){ ctx.moveTo(x, 0); ctx.lineTo(x, C.H); }
    for (let y = 0; y <= C.H; y += cs){ ctx.moveTo(0, y); ctx.lineTo(C.W, y); }
    ctx.stroke();
  };
  toggleBtn("c11g", on => { showSq = on; render(); });
  register(C.cv, dt => {
    w.step(dt); render(); hudT += dt;
    if (hudT > 0.25){ hudT = 0; const n = w.bodies.length; out.textContent = "Every pair:   " + (n * (n - 1) / 2).toLocaleString() + " checks\nGrid squares: " + count() + " checks"; }
  });
  C.onResize = build; build();
})();

/* ---------- 12: friction ---------- */
(() => {
  const C = makeCanvas("c12"), S = new Screen(11), w = new World(), out = $("c12r");
  let mu = 0.8, bl = null;
  const slide = () => {
    w.bodies = []; const M = Object.assign({}, MATS.rubber, { mu });
    bl = w.add(0, 0, w.unit * 2.4, "rubber", MATS.rubber.alb, M);
    bl.x = bl.r + 2; bl.y = w.h - bl.r; bl.vx = w.w * 0.9; bl.vy = 0; bl.w = 0; bl.a = 0;
  };
  const render = () => { S.clear(); if (bl) S.sphere(bl, null); S.render(C.ctx); };
  const report = () => {
    if (!bl) return;
    const v = toM(w, bl.vx), s = toM(w, bl.w * bl.r), slipping = Math.abs(bl.vx - bl.w * bl.r) > Math.max(8, Math.abs(bl.vx) * 0.03);
    out.textContent = "Ball speed:            " + v.toFixed(2) + " m/s\nSpeed from spin (w×r): " + s.toFixed(2) + " m/s\n" + (Math.abs(v) < 0.02 ? "Stopped" : slipping ? "Sliding: the two speeds differ" : "Rolling: the two speeds match");
  };
  $("c12f").addEventListener("click", slide);
  toggleGroup("[data-c12]", "c12", v => { mu = +v; slide(); });
  register(C.cv, dt => { w.step(dt); render(); report(); });
  C.onResize = () => { S.fit(C.W, C.H, C.dpr); w.w = S.w; w.h = S.h; w.unit = Math.min(C.W, C.H) / 20; w.g = { x: 0, y: w.h * 1.6 }; slide(); render(); report(); };
  C.onResize();
})();

/* ---------- 13: spring grab ---------- */
(() => {
  const C = makeCanvas("c13"), S = new Screen(11), w = new World(), out = $("c13r");
  let foam = null, steel = null, finger = null, t = 0, hudT = 0; const target = { x: 0, y: 0 };
  const attach = () => { const off = w.w * 0.2; foam.grab.x = target.x - off; foam.grab.y = target.y; steel.grab.x = target.x + off; steel.grab.y = target.y; };
  const build = () => {
    S.fit(C.W, C.H, C.dpr); w.w = S.w; w.h = S.h; w.unit = Math.min(C.W, C.H) / 22; w.g = { x: 0, y: w.h * 1.6 }; w.bodies = [];
    target.x = w.w / 2; target.y = w.h * 0.35;
    foam = w.add(w.w * 0.3, w.h * 0.5, w.unit * 2, "foam"); steel = w.add(w.w * 0.7, w.h * 0.5, w.unit * 1.3, "steel");
    foam.grab = {}; steel.grab = {}; attach(); render();
  };
  const render = () => {
    S.clear(); S.sphere(foam, null); S.sphere(steel, null); S.streak(foam, w.unit); S.streak(steel, w.unit); S.render(C.ctx);
    const ctx = C.ctx;
    for (const b of [foam, steel]){
      ctx.strokeStyle = SCREEN.muted; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(b.grab.x, b.grab.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = SCREEN.lamp; ctx.lineWidth = 2; ctx.beginPath();
      ctx.moveTo(b.grab.x - 7, b.grab.y); ctx.lineTo(b.grab.x + 7, b.grab.y); ctx.moveTo(b.grab.x, b.grab.y - 7); ctx.lineTo(b.grab.x, b.grab.y + 7); ctx.stroke();
    }
  };
  pointer(C.cv, { down: p => { finger = p; }, move: p => { finger = p; }, up: () => { finger = null; } });
  register(C.cv, dt => {
    t += dt;
    if (finger){ target.x = finger.x; target.y = finger.y; }
    else if (!reduceMotion){ target.x = w.w / 2 + w.w * 0.12 * Math.sin(t * 1.4); target.y = w.h * 0.35 + w.h * 0.12 * Math.sin(t * 2.3); }
    attach(); w.step(dt); render(); hudT += dt;
    if (hudT > 0.2){ hudT = 0; const lag = b => Math.hypot(b.x - b.grab.x, b.y - b.grab.y).toFixed(0);
      out.textContent = "Foam  " + foam.m.toFixed(1) + " kg: " + lag(foam) + " px from its handle\nSteel " + steel.m.toFixed(1) + " kg: " + lag(steel) + " px from its handle"; }
  });
  C.onResize = build; build();
})();

/* ---------- 14: render layers ---------- */
(() => {
  const C = makeCanvas("c14"), D = defaultDisplay(), S = new Screen(11, D), w = new World(), out = $("c14r");
  const L = { x: 0, y: 0, z: 60, R2: 1, on: true }; let mode = "glow", started = !reduceMotion;
  const render = () => {
    S.clear(); S.floor(w.bodies, L);
    for (const b of w.bodies) S.sphere(b, L);
    for (const b of w.bodies) S.streak(b, w.unit);
    S.bulb(L, w.unit);
    D.glow = mode === "glow" ? 0.6 : 0;
    S.render(C.ctx);
    const ctx = C.ctx, { cols, rows, cw, ch } = S;
    if (mode === "colour"){
      ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, C.W, C.H);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(S.colC, 0, 0, cols * cw, rows * ch); ctx.imageSmoothingEnabled = true;
    } else if (mode === "white"){
      ctx.fillStyle = SCREEN.bg; ctx.fillRect(0, 0, C.W, C.H);
      ctx.fillStyle = "#fff"; ctx.font = S.fontPx + "px " + MONO; ctx.textBaseline = "top"; ctx.textAlign = "left";
      const yOff = (ch - S.fontPx) / 2;
      for (let r = 0; r < rows; r++){ const s = String.fromCharCode.apply(null, S.glyphs.subarray(r * cols, (r + 1) * cols)); if (s.trim()) ctx.fillText(s, 0, r * ch + yOff); }
    }
  };
  const report = () => {
    let used = 0; for (let r = 0; r < S.rows; r++){ for (let c = 0; c < S.cols; c++) if (S.glyphs[r * S.cols + c] !== 32){ used++; break; } }
    out.textContent = "Colour image: " + S.cols + " × " + S.rows + " pixels, one per cell\nText calls this frame: " + used + " (one per row that has characters)";
  };
  toggleGroup("[data-c14]", "c14", v => { mode = v; render(); report(); });
  grabber(C.cv, w, () => w.unit * 1.8, () => { started = true; });
  let hudT = 0;
  register(C.cv, dt => { if (!started) return; w.step(dt); render(); hudT += dt; if (hudT > 0.3){ hudT = 0; report(); } });
  C.onResize = () => {
    const first = !w.bodies.length;
    S.fit(C.W, C.H, C.dpr); w.w = S.w; w.h = S.h; w.unit = Math.min(C.W, C.H) / 22; w.g = { x: 0, y: w.h * 1.6 };
    L.x = w.w * 0.5; L.y = w.h * 0.4; L.z = w.unit * 6;
    if (first) for (let i = 0; i < 10; i++) spawn(w, Math.random() * w.w, Math.random() * w.h * 0.5, MIX[i % MIX.length]);
    render(); report();
  };
  C.onResize();
})();
