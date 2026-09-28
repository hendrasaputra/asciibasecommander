/* ---------- tutorial helpers ---------- */
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
function makeCanvas(id){
  const cv = $(id), ctx = cv.getContext("2d");
  const o = { cv, ctx, W: 0, H: 0, dpr: 1, onResize: null };
  const fit = () => {
    const r = cv.getBoundingClientRect(); if (!r.width) return;
    if (Math.abs(r.width - o.W) < 0.5 && Math.abs(r.height - o.H) < 0.5 && o.W) return;   // ignore no-op resizes
    o.dpr = Math.min(window.devicePixelRatio || 1, 3);
    o.W = r.width; o.H = r.height; cv.width = Math.round(o.W * o.dpr); cv.height = Math.round(o.H * o.dpr);
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    if (o.onResize) o.onResize();
  };
  fit(); new ResizeObserver(fit).observe(cv);
  return o;
}
function pointer(cv, h){
  const active = new Set();
  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); active.add(e.pointerId); h.down && h.down(pos(e), e.pointerId); });
  cv.addEventListener("pointermove", e => { if (active.has(e.pointerId) && h.move) h.move(pos(e), e.pointerId); });
  const up = e => { if (!active.delete(e.pointerId)) return; h.up && h.up(pos(e), e.pointerId); };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
}
function grabber(cv, w, slop, onAny){
  const held = new Map();
  pointer(cv, {
    down(p, id){ onAny && onAny(); const b = w.pick(p.x, p.y, slop()); if (b){ const g = { x: p.x, y: p.y }; b.grab = g; held.set(id, { b, g }); } },
    move(p, id){ const h = held.get(id); if (h){ h.g.x = p.x; h.g.y = p.y; } },
    up(p, id){ const h = held.get(id); if (h){ h.b.grab = null; held.delete(id); } }
  });
}
function toggleGroup(sel, attr, onPick){
  const btns = [...document.querySelectorAll(sel)];
  btns.forEach(b => b.addEventListener("click", () => { btns.forEach(x => x.setAttribute("aria-pressed", String(x === b))); onPick(b.dataset[attr]); }));
}
function toggleBtn(id, onChange){
  const b = $(id);
  b.addEventListener("click", () => { const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", String(on)); onChange(on); });
}
const live = [];
const io = new IntersectionObserver(es => es.forEach(e => { const d = live.find(x => x.el === e.target); if (d) d.visible = e.isIntersecting; }), { rootMargin: "80px" });
function register(el, frame){ const d = { el, frame, visible: false }; live.push(d); io.observe(el); }
let lastT = performance.now();
function loop(t){
  const dt = Math.min((t - lastT) / 1000, 1 / 30); lastT = t;
  for (const d of live) if (d.visible){ try { d.frame(dt); } catch (err){ console.error(err); } }
  requestAnimationFrame(loop);
}
requestAnimationFrame(t => { lastT = t; requestAnimationFrame(loop); });
const toM = (w, px) => px / (w.unit * 10);
const hex2 = v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0").toUpperCase();
function ball(x, y, r, matName, alb){ const M = MATS[matName]; return { x, y, r, a: 0, w: 0, vx: 0, vy: 0, static: false, flash: 0, mat: M, alb: alb || M.alb }; }
