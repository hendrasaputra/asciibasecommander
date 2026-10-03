(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
const D = defaultDisplay(); D.room = 0.3; D.glow = 0.25;
let s = applyArcadeSettings(D);   // also installs the TV filter CSS used by the games
const world = new World(), lamp = { x: 0, y: 0, z: 0, on: true };
let screen = null, GW = 0, GH = 0, stars = [];
const ALIEN = [" (^) ", "<o_o>", " / \\ "], ALIEN2 = ["~[=]~", "(O.O)", "/   \\"], CANNON = ["  A  ", "/=#=\\"];
const MATS_CYCLE = ["rubber", "foam", "steel", "rubber"];

/* ---------- the form ---------- */
function syncForm(){
  for (const r of document.querySelectorAll("input[name=mode]")) r.checked = r.value === s.mode;
  for (const r of document.querySelectorAll("input[name=ramp]")){ r.checked = r.value === s.ramp; r.disabled = s.mode === "pixels"; }
  $("custom").hidden = s.ramp !== "custom"; $("custom").value = s.custom; $("custom").disabled = s.mode === "pixels";
  $("charsetHint").textContent = s.mode === "pixels"
    ? "Not used in pixel mode: lit objects become solid pixels. Switch to ASCII characters to choose a set."
    : "Used for shading lit objects such as debris, rubble and the physics balls. Sprites and text keep their own characters.";
  $("crt").checked = !!s.crt;
  for (const r of document.querySelectorAll("input[name=detail]")) r.checked = +r.value === (s.detail || 1);
}
function apply(note){
  const detailChanged = D.detail !== (s.detail || 1);
  D.chars = arcadeChars(s); D.pixels = s.mode === "pixels"; D.detail = s.detail || 1;
  if (screen) screen.setRamp();
  if (detailChanged) layout();   // the preview's fine grid is made when it is fitted
  document.body.classList.toggle("crt", !!s.crt);
  syncForm();
  $("status").textContent = saveArcadeSettings(s) ? (note || "Saved") : "Could not save: this browser is blocking storage.";
}
document.querySelectorAll("input[name=mode]").forEach(r => r.addEventListener("change", () => {
  const toPixels = r.value === "pixels" && s.mode !== "pixels";
  s.mode = r.value;
  if (toPixels) s.crt = true;   // pixels look best on a tube; it can be switched off below
  apply(toPixels ? "Saved. Tube TV filter switched on for pixels." : "Saved");
}));
document.querySelectorAll("input[name=ramp]").forEach(r => r.addEventListener("change", () => { s.ramp = r.value; apply(); if (r.value === "custom") $("custom").focus(); }));
$("custom").addEventListener("input", e => { s.custom = e.target.value; apply(); });
$("crt").addEventListener("change", e => { s.crt = e.target.checked; apply(); });
document.querySelectorAll("input[name=detail]").forEach(r => r.addEventListener("change", () => { s.detail = +r.value; apply(); }));
$("reset").addEventListener("click", () => { s = { ...ARCADE_DEFAULTS }; apply("Reset to defaults"); });
syncForm();

/* ---------- live preview: a little of everything the games draw ---------- */
function layout(){
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  screen = new Screen(Math.max(8, Math.min(13, Math.round(r.height / 26))), D); screen.fit(r.width, r.height, dpr);
  GW = screen.cols; GH = screen.rows;
  cv.style.width = screen.w + "px"; cv.style.height = screen.h + "px";
  cv.width = Math.round(screen.w * dpr); cv.height = Math.round(screen.h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.w = screen.w; world.h = screen.h - screen.ch; world.unit = screen.cw;
  world.g = { x: 0, y: world.h * 1.6 }; world.drag = 2e-4 * (600 / world.h) ** 2;
  lamp.z = screen.ch * 8;
  world.bodies.length = 0;
  stars = Array.from({ length: 40 }, () => [Math.floor(Math.random() * GW), Math.floor(Math.random() * GH * 0.5), Math.random() * 6.283]);
}
let dropT = 0, n = 0;
function drop(){   // keep a few lit balls and boxes tumbling in from the top
  const x = world.w * (0.45 + Math.random() * 0.5), mat = MATS_CYCLE[n++ % MATS_CYCLE.length];
  const b = n % 3 ? spawn(world, x, screen.ch * 2, mat, 0.9) : spawnBox(world, x, screen.ch * 2, mat);
  b.vx = (Math.random() - 0.5) * 300; b.life = 9;
}
const put = (gx, gy, rgb, layer, code) => screen.cell(gx, gy, rgb, 1, layer, code);
const sprite = (art, x, y, rgb) => screen.sprite(art, x, y, rgb, 1, 2), text = (x, y, str, rgb) => screen.text(x, y, str, rgb);
let last = performance.now();
function tick(t){
  requestAnimationFrame(tick);
  if (!screen) return;
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
  if ((dropT -= dt) <= 0 && world.bodies.length < 14){ drop(); dropT = 0.7; }
  world.step(dt);
  for (const b of world.bodies) b.life -= dt;
  world.bodies = world.bodies.filter(b => b.life > 0);
  lamp.x = world.w * (0.7 + 0.2 * Math.sin(t * 0.0006)); lamp.y = world.h * 0.35;
  screen.clear();
  for (const [x, y, ph] of stars){ const v = 0.06 + 0.05 * Math.sin(t * 0.002 + ph); put(x, y, [v, v, v * 1.3], 0, 46); }
  for (const b of world.bodies) screen.sphere(b, lamp, { stripe: false });
  const ax = 3 + Math.round(Math.sin(t * 0.0012) * 2);   // the aliens sway, like a marching fleet
  for (let i = 0; i < 3; i++) sprite(i % 2 ? ALIEN2 : ALIEN, ax + i * 7, 3, i % 2 ? [0.3, 0.8, 1.0] : [1.0, 0.3, 0.8]);
  for (let c = 0; c < 9; c++) for (let r = 0; r < 2; r++) put(5 + c, GH - 6 + r, [0.3, 0.9, 0.5], 2, 35);   // a shield
  sprite(CANNON, 8, GH - 3, [1.4, 1.1, 0.5]);
  for (let y = 7; y < GH - 7; y += 2) put(11, y, [3.0, 0.15, 0.1], 3, 124);   // an enemy laser
  text(1, 0, "SCORE 001250", [1.6, 1.6, 1.6]);
  text(GW - 9, 0, "LIVES 3", [1.6, 1.6, 1.6]);
  text(1, GH - 1, (s.mode === "pixels" ? "PIXELS" : "ASCII " + s.ramp.toUpperCase()) + (s.detail > 1 ? " x" + s.detail : "") + (s.crt ? " + TV" : ""), [1.4, 1.1, 0.5]);
  screen.render(ctx);
}
layout();
new ResizeObserver(() => layout()).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
