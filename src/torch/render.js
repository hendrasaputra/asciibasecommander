/* ---------- Torchlight Dungeons: drawing the map (phase 6) ---------- */
// Tiles and figures from sprites.js, then the light field multiplied over them: what you see now is lit by your
// torch and the rooms, what you remember is dim and cold, and the unknown is black. Movement, lunges, hit flashes,
// damage numbers and debris are only for show: the rules in game.js have already decided everything.
const cv = document.getElementById("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = document.getElementById("stage");
let Z = 3, DPR = 1, VWpx = 0, VHpx = 0;   // Z: device pixels per sprite pixel; the view in device pixels
const view = { x: 0, y: 0 };               // the camera: the map pixel at the view's top-left
const lightTex = newCanvas(1, 1), lightG = lightTex.getContext("2d");
const anim = new WeakMap();                // per figure: where it is drawn, and its lunge and flash
let parts = [], floats = [], hoverCell = null;

function renderLayout(){
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  DPR = Math.min(window.devicePixelRatio || 1, 3);
  // the Detail setting: larger or smaller sprites; whole device pixels keep the edges crisp
  const css = { 1: r.width > 1300 ? 2.5 : 2, 2: 1.5, 3: 1 }[DETAIL] || 2;
  Z = Math.max(1, Math.round(css * DPR));
  VWpx = Math.round(r.width * DPR); VHpx = Math.round(r.height * DPR);
  cv.width = VWpx; cv.height = VHpx; cv.style.width = r.width + "px"; cv.style.height = r.height + "px";
  if (player) snapView();
}
const viewCells = () => [VWpx / (Z * TS), VHpx / (Z * TS)];
function cameraTarget(){
  const [vw, vh] = viewCells(), w = L ? L.w : MW, h = L ? L.h : MH, a = posOf(player);
  const fit = (p, v, n) => n <= v ? (n - v) / 2 : Math.max(0, Math.min(n - v, p + 0.5 - v / 2));
  return { x: fit(a.x, vw, w) * TS, y: fit(a.y, vh, h) * TS };
}
function snapView(){ const c = cameraTarget(); view.x = c.x; view.y = c.y; }
function posOf(o){
  let a = anim.get(o);
  if (!a){ a = { x: o.x, y: o.y, lunge: null, flash: 0, face: 1 }; anim.set(o, a); }
  return a;
}
function stepAnim(o, dt){
  const a = posOf(o), dx = o.x - a.x, dy = o.y - a.y, d = Math.hypot(dx, dy);
  if (d > 2.5){ a.x = o.x; a.y = o.y; }   // teleports and new levels jump
  else if (d > 0){ const s = Math.min(1, dt * 12 / d); a.x += dx * s; a.y += dy * s; }
  if (a.lunge && (a.lunge.t -= dt) <= 0) a.lunge = null;
  if (a.flash > 0) a.flash -= dt;
  return a;
}
// called from the rules: purely visual
function fxLunge(a, b){ const A = posOf(a); A.lunge = { dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y), t: 0.16 }; }
function fxHit(m){ posOf(m).flash = 0.14; }
function fxFloat(x, y, text, rgb){ floats.push({ x, y, text, rgb, t: 0 }); }
function burst(x, y, rgb, n){   // bits that tumble from a kill, sparks from a hit, glass from a potion
  for (let k = 0; k < n; k++){
    const a = Math.random() * 6.283, sp = 2 + Math.random() * 5;
    parts.push({ x: x + 0.5, y: y + 0.6, z: 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 3 + Math.random() * 6, rgb, life: 1.4 + Math.random() * 0.8, s: Math.random() < 0.3 ? 2 : 1 });
  }
}
function shove(x, y, r){   // a blast pushes the debris lying around it
  for (const p of parts){ const dx = p.x - x - 0.5, dy = p.y - y - 0.5, d = Math.hypot(dx, dy) || 0.1; if (d > r) continue;
    const k = (1 - d / r) * 14; p.vx += dx / d * k; p.vy += dy / d * k; p.vz += k * 0.6; }
}
function stepParts(dt){
  for (const p of parts){
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (blocks(Math.floor(nx), Math.floor(p.y))) p.vx *= -0.5; else p.x = nx;   // walls stop them
    if (blocks(Math.floor(p.x), Math.floor(ny))) p.vy *= -0.5; else p.y = ny;
    p.vz -= 30 * dt; p.z += p.vz * dt;
    if (p.z < 0){ p.z = 0; p.vz = -p.vz * 0.4; p.vx *= 0.6; p.vy *= 0.6; if (Math.abs(p.vz) < 0.8) p.vz = 0; }
    p.life -= dt;
  }
  parts = parts.filter(p => p.life > 0);
  for (const f of floats) f.t += dt;
  floats = floats.filter(f => f.t < 0.9);
}

/* ---------- one frame ---------- */
function drawWorld(t, dt){
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, VWpx, VHpx);
  if (!L) return;
  const title = state === "title" || state === "create";
  computeLight(lightNow, t);
  for (const m of mons) stepAnim(m, dt);
  stepParts(dt);
  const c = cameraTarget(), k = 1 - Math.exp(-dt * 10);
  view.x += (c.x - view.x) * k; view.y += (c.y - view.y) * k;
  if (Math.hypot(c.x - view.x, c.y - view.y) > TS * 12) snapView();
  const vx = Math.round(view.x * Z) / Z, vy = Math.round(view.y * Z) / Z;   // whole device pixels: no shimmer
  ctx.setTransform(Z, 0, 0, Z, -vx * Z, -vy * Z); ctx.imageSmoothingEnabled = false;
  const [vw, vh] = viewCells(), x0 = Math.max(0, Math.floor(vx / TS)), y0 = Math.max(0, Math.floor(vy / TS)), x1 = Math.min(MW - 1, x0 + Math.ceil(vw) + 1), y1 = Math.min(MH - 1, y0 + Math.ceil(vh) + 1);
  const lit = i => title ? lum(lightNow, 3 * i) > 0.02 : visible(i) || ((inFov[i] === turnNo || depth === 0) && lum(lightNow, 3 * i) > 0.03);
  const shown = i => title ? lit(i) : mem[i];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (shown(idx(x, y))) ctx.drawImage(tileImage(L, x, y, depth), x * TS, y * TS);
  if (title) return lightOverlay(x0, y0, x1, y1, lit, title);
  const bob = n => Math.round(Math.sin(t / 260 + n) * 0.6);
  for (const f of floor){ const i = idx(f.x, f.y); if (!visible(i) && !f.seen) continue;
    ctx.drawImage(itemIcon(f.it), f.x * TS + 2, f.y * TS + 2 + (visible(i) ? bob(f.x) : 0), 12, 12); }
  // figures, back to front; the lit ones go under the light so the torch shades them
  const after = [], figs = mons.filter(m => m === player ? state === "play" || state === "dead" : m.K && sensed(m)).sort((a, b) => posOf(a).y - posOf(b).y);
  for (const m of figs){
    if (m !== player && !seesMon(m)){ after.push(m); continue; }
    if (m !== player && byHeat(m)){ after.push(m); continue; }
    figure(m, t);
  }
  lightOverlay(x0, y0, x1, y1, lit, false);
  for (const m of after) figure(m, t, byHeat(m) ? "heat" : "ghost");
  for (const s of shots) shotDraw(s);
  for (const p of parts){ const px = p.x * TS, py = p.y * TS;
    ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(px, py, p.s, 1);
    ctx.fillStyle = hex(p.rgb, p.life < 0.4 ? p.life * 2.5 * 0.8 : 0.8); ctx.fillRect(px, py - p.z * 3, p.s, p.s); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);   // labels in device pixels, so text stays sharp
  const scr = (x, y) => [(x * TS - vx) * Z, (y * TS - vy) * Z];
  for (const m of figs) if (m !== player && seesMon(m)){
    const a = posOf(m), [sx, sy] = scr(a.x, a.y);
    if (m.hp < m.mhp){ ctx.fillStyle = "#000c"; ctx.fillRect(sx + 2 * Z, sy - 2 * Z, 12 * Z, 2 * Z); ctx.fillStyle = m.hp < m.mhp * 0.3 ? "#e8402a" : "#d8a030"; ctx.fillRect(sx + 2 * Z, sy - 2 * Z, Math.max(Z, 12 * Z * m.hp / m.mhp), 2 * Z); }
    if (m.sleep > 0) label(sx + 13 * Z, sy - Z * (2 + Math.sin(t / 400) * 1.5), "z", "#9cf", 0.7);
  }
  if (target && sensed(target)){ const a = posOf(target), [sx, sy] = scr(a.x, a.y), q = Z * (1 + Math.sin(t / 150) * 0.6), L4 = 4 * Z, w = TS * Z;
    ctx.fillStyle = "#f0c040";
    for (const [cx, cy, ex, ey] of [[sx - q, sy - q, 1, 1], [sx + w + q, sy - q, -1, 1], [sx - q, sy + w + q, 1, -1], [sx + w + q, sy + w + q, -1, -1]]){
      ctx.fillRect(Math.min(cx, cx + ex * L4), cy - (ey < 0 ? Z : 0), L4, Z); ctx.fillRect(cx - (ex < 0 ? Z : 0), Math.min(cy, cy + ey * L4), Z, L4); } }
  if (depth === 0) L.shops.forEach((sh, k) => { const x = sh.door % MW, y = Math.floor(sh.door / MW); if (!mem[sh.door]) return; const [sx, sy] = scr(x, y + (y < L.street ? -1 : 1.1)); label(sx + 8 * Z, sy + 10 * Z, (k + 1) + " " + SHOPS[k].name, "#f6e7c4", 0.62, true); });
  for (const f of floats){ const [sx, sy] = scr(f.x, f.y - f.t * 0.9); ctx.globalAlpha = Math.min(1, (0.9 - f.t) * 3); label(sx + 8 * Z, sy - 2 * Z, f.text, hex(f.rgb), 0.95, true); ctx.globalAlpha = 1; }
  if (aiming){ const [sx, sy] = scr(posOf(player).x, posOf(player).y); ctx.strokeStyle = "#f0c04088"; ctx.lineWidth = Z; ctx.setLineDash([2 * Z, 2 * Z]); ctx.strokeRect(sx - 2 * Z, sy - 2 * Z, 20 * Z, 20 * Z); ctx.setLineDash([]); }
}
function label(x, y, s, col, size = 0.8, centre = false){
  ctx.font = "bold " + Math.round(Z * TS * size * 0.5) + "px ui-monospace, Menlo, monospace"; ctx.textAlign = centre ? "center" : "left";
  ctx.lineWidth = Math.max(2, Z * 0.9); ctx.strokeStyle = "#000"; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); ctx.textAlign = "left";
}
function figure(m, t, how){
  const a = posOf(m), img = m === player ? heroImage() : creatureImage(m.K);
  let ox = 0, oy = Math.round(Math.sin(t / 260 + (m === player ? 0 : m.x * 3)) * 0.6);
  if (a.lunge){ const k = Math.sin(Math.PI * (1 - a.lunge.t / 0.16)) * 5; ox = a.lunge.dx * k; oy += a.lunge.dy * k; }
  const px = Math.round(a.x * TS + ox), py = Math.round(a.y * TS + oy);
  if (m === player){ if (m.x !== a.lastX){ if (m.x !== a.lastX && a.lastX !== undefined) a.face = m.x < a.lastX ? -1 : 1; a.lastX = m.x; } }
  const flip = m === player ? a.face < 0 : m.x > player.x;
  if (!how){ ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.beginPath(); ctx.ellipse(px + 8, py + 14.5, 5, 1.6, 0, 0, 7); ctx.fill(); }
  const pic = how === "heat" ? heatImage(img) : a.flash > 0 ? flashImage(img) : img;
  ctx.globalAlpha = how === "ghost" ? 0.45 : 1;
  if (flip){ ctx.save(); ctx.translate(px + TS, py); ctx.scale(-1, 1); ctx.drawImage(pic, 0, 0); ctx.restore(); } else ctx.drawImage(pic, px, py);
  ctx.globalAlpha = 1;
}
const FLASH = new Map();
const flashImage = img => memo(FLASH, img, () => { const c = newCanvas(TS, TS), g = c.getContext("2d"); g.drawImage(img, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#fff"; g.fillRect(0, 0, TS, TS); return c; });
let heroKey = "", heroPic = null;
function heroImage(){   // the paper doll, redrawn when what you wear changes
  const look = dollLook(player), key = JSON.stringify(look);
  if (key !== heroKey){ heroKey = key; heroPic = doll(look); }
  return heroPic;
}
const dollLook = p => ({ race: p.race, eq: Object.fromEntries(["weapon", "shield", "body", "head", "hands", "feet", "cloak", "light"].filter(s => p.eq[s]).map(s => [s, p.eq[s].k])) });
const ICONS = new Map();
const itemIcon = it => it.k === "gold" ? memo(ICONS, "gold", () => icon({ cat: "gold" }, [1, 0.8, 0.3])) : memo(ICONS, it.k + "|" + (it.art || ""), () => icon(ITEM[it.k], itemRgb(it, player.know)));
function shotDraw(s){
  const f = Math.min(s.path.length - 1, s.t * s.speed), i = Math.floor(f), c = s.path[i], n = s.path[Math.min(s.path.length - 1, i + 1)], u = f - i;
  const x = (c[0] + (n[0] - c[0]) * u + 0.5) * TS, y = (c[1] + (n[1] - c[1]) * u + 0.5) * TS;
  if (s.item){ ctx.save(); ctx.translate(x, y); ctx.rotate(s.t * 14); ctx.drawImage(itemIcon(s.item), -5, -5, 10, 10); ctx.restore(); return; }
  ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < 4; k++){ const b = Math.max(0, f - k * 0.5), j = Math.floor(b), cc = s.path[j];
    ctx.fillStyle = hex(s.rgb, 0.6 - k * 0.13); const r = 3 - k * 0.5; ctx.fillRect((cc[0] + 0.5) * TS - r, (cc[1] + 0.5) * TS - r, r * 2, r * 2); }
  ctx.fillStyle = "#fff"; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  ctx.globalCompositeOperation = "source-over";
}
// The light: one pixel per cell, smoothly enlarged and multiplied over the tiles, with a little warm bloom on top.
function lightOverlay(x0, y0, x1, y1, lit, title){
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  if (lightTex.width !== w || lightTex.height !== h){ lightTex.width = w; lightTex.height = h; }
  const img = lightG.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const mx = x0 + x - 1, my = y0 + y - 1, o = 4 * (y * w + x); d[o + 3] = 255;
    if (mx < 0 || my < 0 || mx >= MW || my >= MH) continue;
    const i = idx(mx, my), j = 3 * i;
    if (lit(i)){ d[o] = Math.min(255, lightNow[j] * 220 + 22); d[o + 1] = Math.min(255, lightNow[j + 1] * 220 + 20); d[o + 2] = Math.min(255, lightNow[j + 2] * 220 + 26); }
    else if (!title && mem[i]){ d[o] = 30; d[o + 1] = 34; d[o + 2] = 58; }   // remembered: dim and cold
  }
  lightG.putImageData(img, 0, 0);
  const X = (x0 - 1.5) * TS, Y = (y0 - 1.5) * TS;
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = "multiply"; ctx.drawImage(lightTex, X, Y, w * TS, h * TS);
  ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.16; ctx.drawImage(lightTex, X, Y, w * TS, h * TS);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.imageSmoothingEnabled = false;
}
// The minimap and the Map tab: s screen pixels per cell, of what you remember.
function drawMinimap(c, s, focus){
  const w = L.w, h = L.h, g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
    const i = idx(x, y), o = 4 * (y * w + x); if (!mem[i]) continue;
    const t = L.tiles[i], v = visible(i);
    const col = t === T.DOWN || t === T.UP ? [240, 240, 240] : t === T.SHOP ? [240, 200, 90] : t === T.DOOR || t === T.OPEN ? [170, 110, 50] : opaque(t) ? [96, 92, 110] : v ? [70, 66, 58] : [40, 40, 52];
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  for (const f of floor) if (f.seen || visible(idx(f.x, f.y))){ const o = 4 * (f.y * w + f.x); d[o] = 90; d[o + 1] = 170; d[o + 2] = 255; d[o + 3] = 255; }
  for (const m of mons) if (m.K && sensed(m)){ const o = 4 * (m.y * w + m.x); d[o] = 255; d[o + 1] = 70; d[o + 2] = 60; d[o + 3] = 255; }
  const tmp = memo(ICONS, "mini" + w + "x" + h, () => newCanvas(w, h)); tmp.getContext("2d").putImageData(img, 0, 0);
  const cw = c.width, ch = c.height;
  // a small minimap follows you; the Map tab shows the whole level
  const ox = focus ? Math.max(0, Math.min(w * s - cw, player.x * s - cw / 2)) : (w * s - cw) / 2, oy = focus ? Math.max(0, Math.min(h * s - ch, player.y * s - ch / 2)) : (h * s - ch) / 2;
  g.fillStyle = "#07060b"; g.fillRect(0, 0, cw, ch); g.imageSmoothingEnabled = false;
  g.drawImage(tmp, -ox, -oy, w * s, h * s);
  g.fillStyle = (performance.now() / 300 | 0) % 2 ? "#ffe060" : "#fff"; g.fillRect(player.x * s - ox - 1, player.y * s - oy - 1, s + 2, s + 2);
}
