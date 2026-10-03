/* ---------- in-game pause menu, shared by the games ---------- */
// Drawn into the game's own screen through a text() writer the game passes in (on MENU_LAYER, above game text),
// so it matches ASCII or pixel mode and stays readable.
// The game supplies the rows as a function (labels and values can change): each row is
// { label, value?: () => string, change?: dir => void, select?: () => void }.
// Keys while open: up/down move, left/right change a value, Enter/Space choose, Esc/P close.
function createMenu(rows, { onOpen, onClose, onChange } = {}){
  const m = { open: false, at: 0, box: null };
  const touched = () => onChange && onChange();
  m.show = () => { if (m.open) return; m.open = true; m.at = 0; onOpen && onOpen(); touched(); };
  m.hide = () => { if (!m.open) return; m.open = false; onClose && onClose(); touched(); };
  m.toggle = () => (m.open ? m.hide() : m.show());
  m.move = d => { const n = rows().length; m.at = (m.at + d + n) % n; touched(); };
  m.change = d => { const r = rows()[m.at]; if (r.change) r.change(d); else if (d > 0 && r.select) r.select(); touched(); };
  m.choose = () => { const r = rows()[m.at]; if (r.select) r.select(); else if (r.change) r.change(1); touched(); };
  // Returns true when the menu used the key, so the game ignores it.
  m.key = e => {
    if (!m.open) return false;
    const k = e.key;
    if (k === "ArrowUp" || k === "w" || k === "W") m.move(-1);
    else if (k === "ArrowDown" || k === "s" || k === "S") m.move(1);
    else if (k === "ArrowLeft" || k === "a" || k === "A") m.change(-1);
    else if (k === "ArrowRight" || k === "d" || k === "D") m.change(1);
    else if (k === "Enter" || k === " ") m.choose();
    else if (k === "Escape" || k === "p" || k === "P") m.hide();
    return true;   // other keys do nothing while the menu is open
  };
  // A tap or click at grid cell (gx, gy): picks that row and changes or chooses it. Taps outside the box close it.
  m.tap = (gx, gy) => {
    if (!m.open || !m.box) return false;
    const b = m.box, i = gy - b.y0;
    if (gx < b.x0 || gx >= b.x0 + b.w || gy < b.top || gy >= b.top + b.h){ m.hide(); return true; }
    if (i >= 0 && i < b.n){ m.at = b.first + i; m.choose(); }
    return true;
  };
  m.draw = ({ text, GW, GH, accent, normal, dim, title = "PAUSED", note = "" }) => {
    const R = rows(); m.at = Math.min(m.at, R.length - 1);
    // a list longer than the screen shows a window around the chosen row, with ^ and v marks
    const n = Math.min(R.length, Math.max(3, GH - 8 - (note ? 1 : 0))), first = Math.max(0, Math.min(m.at - (n >> 1), R.length - n));
    const w = 40, h = n + 6 + (note ? 1 : 0), x0 = (GW - w) >> 1, top = Math.max(1, (GH - h) >> 1);
    const edge = "+" + "-".repeat(w - 2) + "+";
    text(x0, top, edge, dim); text(x0, top + h - 1, edge, dim);
    for (let y = 1; y < h - 1; y++){
      // Spaces blank the game behind. They are drawn black: on a shared layer the brighter text wins, so anything
      // written on top later (including dim notes) still shows.
      text(x0, top + y, "|", dim); text(x0 + 1, top + y, " ".repeat(w - 2), [0, 0, 0]); text(x0 + w - 1, top + y, "|", dim);
    }
    text(x0 + ((w - title.length) >> 1), top + 1, title, accent);
    for (let i = 0; i < n; i++){
      const r = R[first + i], sel = first + i === m.at, v = r.value ? "< " + r.value() + " >" : "";
      text(x0 + 3, top + 3 + i, (sel ? "> " : "  ") + r.label.padEnd(18) + v, sel ? accent : normal);
    }
    if (first > 0) text(x0 + w - 3, top + 3, "^", dim);
    if (first + n < R.length) text(x0 + w - 3, top + 2 + n, "v", dim);
    if (note) text(x0 + ((w - note.length) >> 1), top + h - 2, note, dim);
    m.box = { x0, w, top, h, y0: top + 3, first, n };
  };
  return m;
}
// Grid cell under a pointer event on the game canvas (handles the canvas being scaled to fit).
function gridAt(e, canvas, GW, GH){
  const r = canvas.getBoundingClientRect();
  return [Math.floor((e.clientX - r.left) / r.width * GW), Math.floor((e.clientY - r.top) / r.height * GH)];
}
