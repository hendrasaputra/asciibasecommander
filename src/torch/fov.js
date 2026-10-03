/* ---------- Torchlight Dungeons: field of view and the light field ---------- */
// Symmetric shadowcasting, written from Albert Ford's public description of the algorithm: if A can see B, B can see
// A, so "the monster sees you" and "you see the monster" always agree. Walls that bound the view are seen too.
// blocks(x, y) says whether a cell stops sight (out-of-bounds cells must block); see(x, y) is called once per cell.
let fovStamp = null, fovMark = 0, fovW = 0;
function fov(ox, oy, radius, blocks, see, w, h){
  if (!fovStamp || fovStamp.length !== w * h){ fovStamp = new Uint32Array(w * h); fovMark = 0; }
  fovW = w; fovMark++;
  const r2 = radius * (radius + 1), mark = fovMark;
  const show = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = y * fovW + x; if (fovStamp[i] !== mark){ fovStamp[i] = mark; see(x, y); } };
  show(ox, oy);
  for (let q = 0; q < 4; q++){
    // the four quadrants: north, east, south, west; (depth, col) -> map cell
    const tx = (d, c) => q === 0 ? ox + c : q === 1 ? ox + d : q === 2 ? ox + c : ox - d;
    const ty = (d, c) => q === 0 ? oy - d : q === 1 ? oy + c : q === 2 ? oy + d : oy + c;
    const scan = (depth, start, end) => {
      if (depth > radius) return;
      let prev = 0;   // 0 none yet, 1 wall, 2 floor
      const c0 = Math.floor(depth * start + 0.5), c1 = Math.ceil(depth * end - 0.5);
      for (let c = c0; c <= c1; c++){
        const x = tx(depth, c), y = ty(depth, c), wall = blocks(x, y);
        if ((wall || (c >= depth * start && c <= depth * end)) && c * c + depth * depth <= r2) show(x, y);
        if (prev === 1 && !wall) start = (2 * c - 1) / (2 * depth);
        if (prev === 2 && wall) scan(depth + 1, start, (2 * c - 1) / (2 * depth));
        prev = wall ? 1 : 2;
      }
      if (prev === 2) scan(depth + 1, start, end);
    };
    scan(1, -1, 1);
  }
}
// Adds one light source into a field of RGB light (3 floats per cell): it lights every cell it can see, fading
// with distance, so walls cast real shadows. src: { x, y, r: radius in cells, i: intensity, rgb }.
function addLight(field, w, h, blocks, src){
  if (src.r <= 0) return;
  const R = src.r + 0.5;
  fov(src.x, src.y, Math.ceil(src.r), blocks, (x, y) => {
    const k = 1 - Math.hypot(x - src.x, y - src.y) / R; if (k <= 0) return;
    const v = src.i * k * k, j = 3 * (y * w + x);
    field[j] += src.rgb[0] * v; field[j + 1] += src.rgb[1] * v; field[j + 2] += src.rgb[2] * v;
  }, w, h);
}
const lum = (f, j) => 0.2126 * f[j] + 0.7152 * f[j + 1] + 0.0722 * f[j + 2];
