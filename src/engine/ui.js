(() => {
const cv = document.getElementById("cv"), ctx = cv.getContext("2d", { alpha: false });
const stage = document.getElementById("stage"), hud = document.getElementById("hud");
const hint = document.getElementById("hint"), toastEl = document.getElementById("toast");
const world = new World();
const STORE = "asciiPhysics.v3.display";
const D = defaultDisplay(); let rampName = "classic", custom = " .:oO0@", cellPx = 0, showGrid = false;
const lamp = { x: 0, y: 0, z: 80, R2: 1e6, on: true };
try {
  const s = JSON.parse(localStorage.getItem(STORE) || "null");
  if (s){ Object.assign(D, s.D); rampName = s.rampName || rampName; custom = s.custom ?? custom; cellPx = s.cellPx || 0; lamp.on = s.lampOn !== false; showGrid = !!s.grid; D.lampRGB = hexToLinear(D.lampHex); }
} catch (e){}
function save(){ try { localStorage.setItem(STORE, JSON.stringify({ D: { ...D, lampRGB: undefined }, rampName, custom, cellPx, lampOn: lamp.on, grid: showGrid })); } catch (e){} }
D.chars = rampName === "custom" ? custom : RAMPS[rampName];

let screen = null, W = 0, H = 0, dpr = 1, tool = "grab", gravMode = 0, sceneIdx = 0;
const MAT_CYCLE = ["mixed", "foam", "rubber", "steel"]; let matIdx = 0;

function layout(){
  const rect = stage.getBoundingClientRect(); if (!rect.width) return;
  const oldW = W || rect.width, oldH = H || rect.height;
  W = rect.width; H = rect.height; dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!cellPx) cellPx = Math.round(Math.max(9, Math.min(14, W / 64 / 0.6)));
  screen = new Screen(cellPx, D); screen.fit(W, H, dpr);
  world.w = screen.w; world.h = screen.h; world.unit = Math.min(W, H) / 40;
  world.drag = 2e-4 * (600 / world.h) ** 2;
  if (gravMode === 0) world.g = { x: 0, y: world.h * 1.6 };
  lamp.z = world.unit * 10; lamp.R2 = (Math.max(W, H) * 0.7) ** 2;
  if (!lamp.x){ lamp.x = world.w * 0.35; lamp.y = world.h * 0.45; } else { lamp.x *= W / oldW; lamp.y *= H / oldH; }
  for (const b of world.bodies){ b.x *= W / oldW; b.y *= H / oldH; }
  drawRampView();
}
function pickMat(){ const m = MAT_CYCLE[matIdx]; return m === "mixed" ? MIX[Math.floor(Math.random() * MIX.length)] : m; }
const SHAPES = ["balls", "boxes", "mixed"]; let shapeIdx = 0;
// Adds a ball or a box, following the Shape button.
function make(x, y, mat){ const sh = SHAPES[shapeIdx]; return (sh === "boxes" || (sh === "mixed" && Math.random() < 0.5)) ? spawnBox(world, x, y, mat) : spawn(world, x, y, mat); }
const GRAV = ["down", "off", "tilt"];
function setGrav(mode){ gravMode = mode; world.g = mode === 0 ? { x: 0, y: world.h * 1.6 } : { x: 0, y: 0 }; document.getElementById("bGrav").textContent = "Gravity: " + GRAV[mode]; }
const SCENES = [
  { name: "pit", grav: 0, build(){ for (let i = 0; i < 28; i++) make(Math.random() * world.w, Math.random() * world.h * 0.5, MIX[i % MIX.length]); } },
  { name: "pegs", grav: 0, build(){
      const pr = Math.max(world.unit * 0.55, screen.cw * 0.9), gap = world.unit * 5.2; let row = 0;
      for (let y = world.h * 0.3; y < world.h * 0.8; y += gap * 0.8, row++)
        for (let x = (row % 2 ? gap / 2 : gap / 4); x < world.w; x += gap) world.add(x, y, pr, "peg");
      for (let i = 0; i < 24; i++) make(Math.random() * world.w, Math.random() * world.h * 0.2, MIX[i % MIX.length]);
  }},
  { name: "space", grav: 1, build(){ for (let i = 0; i < 22; i++){ const b = make(Math.random() * world.w, Math.random() * world.h, MIX[i % MIX.length]); b.vx = (Math.random() - 0.5) * 500; b.vy = (Math.random() - 0.5) * 500; } } },
  { name: "dark room", grav: 0, build(){ for (let i = 0; i < 14; i++) make(Math.random() * world.w, Math.random() * world.h * 0.5, MIX[i % MIX.length]); } },
  { name: "empty", grav: null, build(){} }
];
let roomBeforeDark = null;
function loadScene(){
  world.bodies.length = 0; world.forces.length = 0;
  const s = SCENES[sceneIdx];
  if (s.name !== "dark room" && roomBeforeDark !== null){ D.room = roomBeforeDark; roomBeforeDark = null; syncSheet(); }
  if (s.grav !== null && gravMode !== 2) setGrav(s.grav);
  if (s.name === "dark room" && roomBeforeDark === null){ roomBeforeDark = D.room; D.room = 0.02; lamp.on = true; syncSheet(); }
  s.build();
  document.getElementById("bScene").textContent = "Scene: " + s.name;
}

/* ---------- input ---------- */
const pointers = new Map();
const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cv.addEventListener("pointerdown", e => {
  cv.setPointerCapture(e.pointerId);
  const p = local(e), ptr = { x: p.x, y: p.y, body: null, force: null, lamp: false };
  if (tool === "grab") ptr.body = world.pick(p.x, p.y, world.unit * 1.8);
  else if (tool === "spawn") ptr.body = make(p.x, p.y, pickMat());
  else if (tool === "push"){ ptr.force = { x: p.x, y: p.y, radius: world.unit * 9, strength: world.h * 30 }; world.forces.push(ptr.force); }
  else { ptr.lamp = true; lamp.x = p.x; lamp.y = p.y; if (!lamp.on){ lamp.on = true; syncSheet(); } }
  if (ptr.body) ptr.body.grab = ptr;
  pointers.set(e.pointerId, ptr); hint.style.opacity = 0;
});
cv.addEventListener("pointermove", e => {
  const ptr = pointers.get(e.pointerId); if (!ptr) return;
  const p = local(e); ptr.x = p.x; ptr.y = p.y;
  if (ptr.force){ ptr.force.x = p.x; ptr.force.y = p.y; }
  if (ptr.lamp){ lamp.x = p.x; lamp.y = p.y; }
});
const release = e => {
  const ptr = pointers.get(e.pointerId); if (!ptr) return;
  if (ptr.body) ptr.body.grab = null;
  if (ptr.force) world.forces.splice(world.forces.indexOf(ptr.force), 1);
  pointers.delete(e.pointerId);
};
cv.addEventListener("pointerup", release); cv.addEventListener("pointercancel", release);

/* ---------- toolbar ---------- */
function toast(msg){ toastEl.textContent = msg; toastEl.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("show"), 2200); }
const HINTS = { grab: "Drag a body and let go to throw it", spawn: "Tap to add a body, drag to throw it", push: "Hold to push bodies away", light: "Drag to move the lamp" };
document.querySelectorAll("[data-tool]").forEach(btn => btn.addEventListener("click", () => {
  tool = btn.dataset.tool;
  document.querySelectorAll("[data-tool]").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
  hint.textContent = HINTS[tool]; hint.style.opacity = 1;
}));
let tiltOn = false, tiltSeen = false;
function onTilt(e){ if (gravMode !== 2 || e.gamma == null) return; tiltSeen = true; const G = world.h * 1.6, r = Math.PI / 180; world.g = { x: Math.sin(e.gamma * r) * G, y: Math.sin(e.beta * r) * G }; }
async function enableTilt(){
  try {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function"){
      if (await DeviceOrientationEvent.requestPermission() !== "granted"){ toast("Tilt needs motion access. Allow it and try again."); return; }
    }
    if (!tiltOn){ window.addEventListener("deviceorientation", onTilt); tiltOn = true; }
    setTimeout(() => { if (gravMode === 2 && !tiltSeen) toast("No tilt sensor found. Gravity stays off."); }, 1500);
  } catch (e){ toast("Tilt is not available on this device."); }
}
document.getElementById("bGrav").addEventListener("click", async () => { setGrav((gravMode + 1) % 3); if (gravMode === 2) await enableTilt(); });
document.getElementById("bMat").addEventListener("click", e => { matIdx = (matIdx + 1) % MAT_CYCLE.length; e.target.textContent = "Material: " + MAT_CYCLE[matIdx]; });
document.getElementById("bShape").addEventListener("click", e => { shapeIdx = (shapeIdx + 1) % SHAPES.length; e.target.textContent = "Shape: " + SHAPES[shapeIdx]; loadScene(); });
document.getElementById("bScene").addEventListener("click", () => { sceneIdx = (sceneIdx + 1) % SCENES.length; loadScene(); });
document.getElementById("bClear").addEventListener("click", loadScene);

/* ---------- display sheet ---------- */
const sheet = document.getElementById("sheet"), $ = id => document.getElementById(id);
$("bDisplay").addEventListener("click", () => { sheet.hidden = false; drawRampView(); });
$("sClose").addEventListener("click", () => { sheet.hidden = true; });
const SLIDERS = [
  ["sBlack", "oBlack", "black", v => v.toFixed(2)],
  ["sExp", "oExp", "exposure", v => v.toFixed(2)], ["sGam", "oGam", "gamma", v => v.toFixed(2)],
  ["sSplit", "oSplit", "split", v => Math.round(v * 100) + "%"], ["sGlow", "oGlow", "glow", v => v.toFixed(2)],
  ["sRoom", "oRoom", "room", v => v.toFixed(2)]
];
function syncSheet(){
  for (const [id, oid, key, f] of SLIDERS){ $(id).value = D[key]; $(oid).textContent = f(D[key]); }
  $("sCell").value = cellPx; $("oCell").textContent = cellPx + "px";
  document.querySelectorAll("[data-ramp]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ramp === rampName)));
  $("sCustom").hidden = rampName !== "custom"; $("sCustom").value = custom;
  $("sCal").setAttribute("aria-pressed", String(D.calibrate)); $("sDither").setAttribute("aria-pressed", String(D.dither));
  $("sLamp").setAttribute("aria-pressed", String(lamp.on)); $("sGrid").setAttribute("aria-pressed", String(showGrid));
  $("sLampC").value = D.lampHex;
}
for (const [id, oid, key, f] of SLIDERS) $(id).addEventListener("input", e => { D[key] = +e.target.value; $(oid).textContent = f(D[key]); save(); });
$("sCell").addEventListener("input", e => { cellPx = +e.target.value; $("oCell").textContent = cellPx + "px"; layout(); save(); });
function applyRamp(){ D.chars = rampName === "custom" ? (custom.length > 1 ? custom : " @") : RAMPS[rampName]; if (screen) screen.setRamp(); drawRampView(); save(); }
document.querySelectorAll("[data-ramp]").forEach(b => b.addEventListener("click", () => { rampName = b.dataset.ramp; syncSheet(); applyRamp(); }));
$("sCustom").addEventListener("input", e => { custom = e.target.value; applyRamp(); });
$("sCal").addEventListener("click", () => { D.calibrate = !D.calibrate; syncSheet(); applyRamp(); });
$("sDither").addEventListener("click", () => { D.dither = !D.dither; syncSheet(); save(); });
$("sLamp").addEventListener("click", () => { lamp.on = !lamp.on; syncSheet(); save(); });
$("sGrid").addEventListener("click", () => { showGrid = !showGrid; syncSheet(); save(); });
$("sLampC").addEventListener("input", e => { D.lampHex = e.target.value; D.lampRGB = hexToLinear(D.lampHex); save(); });
$("sReset").addEventListener("click", () => {
  Object.assign(D, defaultDisplay()); rampName = "classic"; cellPx = 0; lamp.on = true; showGrid = false;
  layout(); syncSheet(); applyRamp();
});

// Show each character with a bar for how much ink it really puts in its cell.
function drawRampView(){
  if (!screen || sheet.hidden) return;
  const c = $("rampView"), r = c.getBoundingClientRect(), x = c.getContext("2d"), pr = Math.min(window.devicePixelRatio || 1, 3);
  c.width = Math.round(r.width * pr); c.height = Math.round(r.height * pr); x.setTransform(pr, 0, 0, pr, 0, 0);
  x.fillStyle = SCREEN.bg; x.fillRect(0, 0, r.width, r.height);
  const lv = screen.ink.levels, maxInk = Math.max(...lv.map(l => l.ink), 0.001), slot = Math.min(28, (r.width - 16) / lv.length);
  x.font = Math.min(18, slot * 0.9) + "px " + MONO; x.textAlign = "center"; x.textBaseline = "top";
  lv.forEach((l, i) => {
    const cx = 8 + slot * (i + 0.5);
    x.fillStyle = SCREEN.text; x.fillText(l.ch === " " ? "␣" : l.ch, cx, 6);
    const bh = 26 * l.ink / maxInk; x.fillStyle = SCREEN.accent; x.fillRect(cx - slot * 0.3, 56 - bh, slot * 0.6, bh);
  });
  $("rampNote").textContent = lv.length + " levels. Bars show the ink each character really uses, measured from the font. " +
    (D.calibrate ? "Brightness picks the character whose ink is closest." : "Brightness picks by position in the list, ignoring ink.");
}

/* ---------- loop ---------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0, hudT = 0;
function frame(t){
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
  if (screen){
    world.step(dt);
    screen.clear();
    screen.floor(world.bodies, lamp);
    for (const b of world.bodies) screen.sphere(b, lamp);
    for (const b of world.bodies) screen.streak(b, world.unit);
    for (const f of world.forces) screen.ring(f.x, f.y, f.radius, [0.45, 0.5, 0.6]);
    screen.bulb(lamp, world.unit);
    screen.render(ctx, { grid: showGrid });
    fpsAcc += dt; fpsN++;
    if (t - hudT > 250){
      let text = Math.round(fpsN / fpsAcc) + " fps  " + screen.cols + "\u00d7" + screen.rows + " @" + cellPx + "px  " + world.bodies.length + " bodies";
      for (const p of pointers.values()) if (p.body){ const b = p.body, v = Math.hypot(b.vx, b.vy) / (world.unit * 10); text = b.mat.name + " " + b.m.toFixed(1) + "kg " + v.toFixed(1) + "m/s p=" + (b.m * v).toFixed(1); break; }
      hud.textContent = text; fpsAcc = 0; fpsN = 0; hudT = t;
    }
  }
  requestAnimationFrame(frame);
}
layout(); syncSheet(); loadScene();
new ResizeObserver(() => { layout(); }).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
})();
