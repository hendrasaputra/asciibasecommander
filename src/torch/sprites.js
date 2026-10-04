/* ---------- Torchlight Dungeons: tiles, figures and icons, all drawn by code (phase 6) ---------- */
// Nothing here is a picture file: each tile, monster and icon is drawn once, when first needed, into a small
// offscreen canvas of 16 x 16 logical pixels, then copied. A dark one-pixel outline is what makes them read.
const TS = 16;
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const hex = (rgb, k = 1) => "rgb(" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v * k * 255)))).join(",") + ")";
const newCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
// A tiny pixel pen over an offscreen canvas.
function pix(w = TS, h = TS){
  const c = newCanvas(w, h), g = c.getContext("2d");
  const p = { c, g,
    px: (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); },
    rect: (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); },
    disc: (cx, cy, r, col) => { g.fillStyle = col; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) g.fillRect(cx + x, cy + y, 1, 1); },
    line: (x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; g.fillStyle = col; for (let i = 0; i <= n; i++) g.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); },
    outline: (col = "#0b0a10") => {
      const d = g.getImageData(0, 0, w, h), a = d.data, o = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ if (a[4 * (y * w + x) + 3]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){ const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && a[4 * (Y * w + X) + 3] > 128){ o[y * w + x] = 1; break; } } }
      g.fillStyle = col; for (let i = 0; i < w * h; i++) if (o[i]) g.fillRect(i % w, (i / w) | 0, 1, 1);
      return p; }
  };
  return p;
}
const memo = (cache, key, make) => cache.has(key) ? cache.get(key) : (cache.set(key, make()), cache.get(key));

/* ---------- terrain: a palette for each band of depth, and the town ---------- */
const THEMES = {
  stone:   { stone: [0.36, 0.36, 0.42], mortar: [0.16, 0.15, 0.2], top: [0.2, 0.19, 0.25], brick: [0.46, 0.42, 0.44] },
  moss:    { stone: [0.3, 0.36, 0.3], mortar: [0.12, 0.16, 0.12], top: [0.15, 0.2, 0.15], brick: [0.36, 0.42, 0.34], speck: [0.35, 0.6, 0.3] },
  crypt:   { stone: [0.38, 0.34, 0.4], mortar: [0.14, 0.11, 0.16], top: [0.19, 0.15, 0.22], brick: [0.5, 0.45, 0.52], speck: [0.75, 0.72, 0.65] },
  magma:   { stone: [0.34, 0.27, 0.25], mortar: [0.14, 0.08, 0.07], top: [0.2, 0.12, 0.1], brick: [0.45, 0.3, 0.26], speck: [1.0, 0.45, 0.15] },
  crystal: { stone: [0.3, 0.33, 0.44], mortar: [0.1, 0.11, 0.2], top: [0.15, 0.16, 0.28], brick: [0.38, 0.42, 0.6], speck: [0.6, 0.85, 1.0] }
};
const themeFor = d => d < 10 ? "stone" : d < 20 ? "moss" : d < 30 ? "crypt" : d < 40 ? "magma" : "crystal";
const TOWN = { grass: [0.28, 0.42, 0.22], dirt: [0.42, 0.34, 0.22], cobble: [0.48, 0.46, 0.44], plaster: [0.82, 0.76, 0.62], timber: [0.36, 0.24, 0.14], roof: [0.55, 0.22, 0.16], stone: [0.5, 0.48, 0.46] };
const WOOD = [0.55, 0.34, 0.18];
function floorTile(th, v){
  const p = pix(), s = th.stone, off = v & 1 ? 4 : 0;
  p.rect(0, 0, TS, TS, hex(th.mortar));
  for (let r = 0; r < 2; r++) for (let c = -1; c < 3; c++){   // flagstones in staggered rows, each with a lit top edge
    const x = c * 8 + (r ? off : 8 - off) % 8, y = r * 8, k = 0.85 + hash(c, r, v) * 0.3;
    p.rect(x + 1, y + 1, 7, 7, hex(s, k)); p.rect(x + 1, y + 1, 7, 1, hex(s, k * 1.18));
    if (hash(c, r, v + 9) < 0.25) p.line(x + 2, y + 3, x + 5, y + 6, hex(s, k * 0.7));
  }
  for (let i = 0; i < 6; i++) p.px((hash(i, v, 3) * TS) | 0, (hash(v, i, 4) * TS) | 0, hex(s, 0.65));
  if (th.speck && v === 3) for (let i = 0; i < 3; i++) p.px(3 + ((hash(i, 8) * 10) | 0), 3 + ((hash(8, i) * 10) | 0), hex(th.speck));
  return p.c;
}
function wallFace(th, v){   // a wall seen from the front: a lighter cap, then courses of brick
  const p = pix(), b = th.brick;
  p.rect(0, 0, TS, TS, hex(th.mortar));
  p.rect(0, 0, TS, 4, hex(th.top, 1.45)); p.rect(0, 3, TS, 1, hex(th.top, 0.8));
  for (let r = 0; r < 3; r++){ const y = 4 + r * 4, off = (r + v) & 1 ? 0 : 4;
    for (let c = -1; c < 3; c++){ const x = c * 8 + off, k = 0.8 + hash(c, r, v) * 0.35; p.rect(x, y, 7, 3, hex(b, k)); p.rect(x, y, 7, 1, hex(b, k * 1.2)); } }
  if (th.speck && v === 1) p.px(5, 9, hex(th.speck));
  p.rect(0, TS - 1, TS, 1, hex(th.mortar, 0.6));
  return p.c;
}
function wallTop(th, mask){   // the top of a wall; a lighter rim along each side that meets open floor
  const p = pix(), t = th.top; p.rect(0, 0, TS, TS, hex(t));
  for (let i = 0; i < 4; i++) p.px((hash(i, mask) * TS) | 0, (hash(mask, i) * TS) | 0, hex(t, 1.3));
  const rim = hex(t, 1.7);
  if (mask & 1) p.rect(0, 0, TS, 1, rim); if (mask & 2) p.rect(TS - 1, 0, 1, TS, rim); if (mask & 8) p.rect(0, 0, 1, TS, rim);
  return p.c;
}
function doorTile(face, open){
  const p = pix(); p.g.drawImage(face, 0, 0);
  p.rect(3, 2, 10, 14, "#120f14");
  if (open){ p.rect(3, 2, 2, 14, hex(WOOD, 0.8)); return p.c; }
  for (let x = 4; x < 12; x += 2) p.rect(x, 3, 2, 13, hex(WOOD, 0.85 + (x % 4) * 0.08));
  p.rect(4, 6, 8, 1, hex([0.3, 0.3, 0.35])); p.rect(4, 12, 8, 1, hex([0.3, 0.3, 0.35])); p.px(10, 9, hex([0.9, 0.8, 0.4]));
  return p.c;
}
function stairsTile(th, down, under){
  const p = pix(); p.g.drawImage(under, 0, 0);
  for (let i = 0; i < 5; i++){ const k = down ? 1 - i * 0.17 : 0.5 + i * 0.13, y = 2 + i * 3;
    p.rect(2, y, 12, 3, hex(th.stone, k)); p.rect(2, y, 12, 1, hex(th.stone, k * 1.3)); }
  p.rect(1, 1, 1, 15, hex(th.mortar)); p.rect(14, 1, 1, 15, hex(th.mortar));
  if (down) p.rect(3, 13, 10, 3, "#08070a");
  return p.c;
}
function grassTile(v){
  const p = pix(); p.rect(0, 0, TS, TS, hex(TOWN.grass, 0.9 + hash(v, 1) * 0.15));
  for (let i = 0; i < 14; i++){ const x = (hash(i, v, 5) * TS) | 0, y = (hash(v, i, 6) * TS) | 0; p.px(x, y, hex(TOWN.grass, 1.35)); p.px(x, y + 1, hex(TOWN.grass, 0.7)); }
  if (v === 2) for (let i = 0; i < 2; i++) p.px(4 + i * 6, 6 + i * 4, i ? "#e8d860" : "#e88aa0");   // a flower or two
  if (v === 3){ p.rect(3, 9, 9, 4, hex(TOWN.dirt)); p.rect(4, 9, 7, 1, hex(TOWN.dirt, 1.2)); }
  return p.c;
}
function cobbleTile(v){
  const p = pix(); p.rect(0, 0, TS, TS, hex(TOWN.cobble, 0.55));
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++){ const k = 0.85 + hash(x, y, v) * 0.3, ox = y & 1 ? 2 : 0;
    p.rect((x * 4 + ox) % TS, y * 4, 3, 3, hex(TOWN.cobble, k)); p.px((x * 4 + ox) % TS, y * 4, hex(TOWN.cobble, k * 1.2)); }
  return p.c;
}
function houseFace(v){   // a timber-framed wall with a lit window
  const p = pix(); p.rect(0, 0, TS, TS, hex(TOWN.plaster, 0.9 + hash(v, 2) * 0.1));
  p.rect(0, 0, TS, 2, hex(TOWN.roof, 0.7)); p.rect(0, 2, TS, 1, hex(TOWN.timber)); p.rect(0, TS - 2, TS, 2, hex(TOWN.timber));
  p.rect(0, 2, 1, 14, hex(TOWN.timber)); p.rect(15, 2, 1, 14, hex(TOWN.timber));
  if (v & 1){ p.rect(5, 5, 6, 6, hex(TOWN.timber)); p.rect(6, 6, 4, 4, "#f2c870"); p.rect(8, 6, 1, 4, hex(TOWN.timber)); p.rect(6, 8, 4, 1, hex(TOWN.timber)); }
  else p.line(2, 3, 13, 13, hex(TOWN.timber));
  return p.c;
}
function roofTile(mask){   // overlapping roof tiles; the ridge is lighter
  const p = pix(), r = TOWN.roof; p.rect(0, 0, TS, TS, hex(r, 0.75));
  for (let y = 0; y < TS; y += 4) for (let x = (y & 4) ? 0 : 2; x < TS; x += 4){ p.rect(x, y, 3, 3, hex(r, 0.9 + hash(x, y) * 0.2)); p.px(x, y + 2, hex(r, 0.55)); }
  if (mask & 1) p.rect(0, 0, TS, 1, hex(r, 1.4)); if (mask & 2) p.rect(TS - 1, 0, 1, TS, hex(r, 0.5)); if (mask & 8) p.rect(0, 0, 1, TS, hex(r, 1.2));
  return p.c;
}
function shopDoor(rgb){
  const p = pix(); p.g.drawImage(houseFace(0), 0, 0);
  p.rect(3, 4, 10, 12, "#120f14"); for (let x = 4; x < 12; x += 2) p.rect(x, 5, 2, 11, hex(WOOD, 0.9 + (x % 4) * 0.06));
  for (let x = 0; x < TS; x += 2) p.rect(x, 1, 2, 3, x % 4 ? hex(rgb, 0.9) : "#f0ead8");   // a striped awning in the shop's colour
  p.px(10, 10, "#f0d060");
  return p.c;
}
function lampPost(under){
  const p = pix(); p.g.drawImage(under, 0, 0);
  const q = pix(); q.rect(7, 4, 2, 11, "#2a2a30"); q.rect(5, 14, 6, 2, "#2a2a30"); q.rect(5, 0, 6, 5, "#2a2a30"); q.rect(6, 1, 4, 3, "#ffd27a"); q.outline();
  p.g.drawImage(q.c, 0, 0); return p.c;
}
const TILE_CACHE = new Map();
// The picture for map cell (x, y). wallAt(x, y) says whether a neighbour is wall-like.
function tileImage(L, x, y, depth){
  const i = y * MW + x, t = L.tiles[i], v = (hash(x, y) * 4) | 0, below = y + 1 < MH ? L.tiles[i + MW] : T.EDGE;
  const wallish = (xx, yy) => xx < 0 || yy < 0 || xx >= MW || yy >= MH || L.tiles[yy * MW + xx] <= T.WALL || L.tiles[yy * MW + xx] === T.SHOP;
  const mask = () => (wallish(x, y - 1) ? 0 : 1) | (wallish(x + 1, y) ? 0 : 2) | (wallish(x - 1, y) ? 0 : 8);
  if (L.town){
    const near = Math.abs(y - L.street) <= 1, ground = () => near ? memo(TILE_CACHE, "cob" + v, () => cobbleTile(v)) : memo(TILE_CACHE, "grass" + v, () => grassTile(v));
    const house = t === T.WALL && x > 0 && y > 0 && x < L.w - 1 && y < L.h - 1, th = THEMES.stone;
    if (t <= T.WALL){
      const open = below > T.WALL && below !== T.SHOP;
      if (!house) return open ? memo(TILE_CACHE, "tface" + (v & 1), () => wallFace({ ...th, brick: TOWN.stone }, v & 1)) : memo(TILE_CACHE, "ttop" + mask(), () => wallTop(th, mask()));
      return open ? memo(TILE_CACHE, "house" + (v & 1), () => houseFace(v & 1)) : memo(TILE_CACHE, "roof" + mask(), () => roofTile(mask()));
    }
    if (t === T.SHOP){ const k = L.shopAt[i]; return memo(TILE_CACHE, "shop" + k, () => shopDoor(SHOPS[k].rgb)); }
    if (t === T.LAMP) return memo(TILE_CACHE, "lamp" + near + v, () => lampPost(ground()));
    if (t === T.DOWN) return memo(TILE_CACHE, "tdown", () => stairsTile(th, true, grassTile(0)));
    return ground();
  }
  const name = themeFor(depth), th = THEMES[name], k = (s, f) => memo(TILE_CACHE, name + s, f);
  const face = n => k("face" + n, () => wallFace(th, n));
  if (t <= T.WALL) return below > T.WALL && below !== T.DOOR ? face(v & 1) : k("top" + mask(), () => wallTop(th, mask()));
  if (t === T.DOOR) return k("door", () => doorTile(face(0), false));
  if (t === T.OPEN) return k("open", () => doorTile(face(0), true));
  const fl = n => k("floor" + n, () => floorTile(th, n));
  if (t === T.DOWN) return k("down", () => stairsTile(th, true, fl(0)));
  if (t === T.UP) return k("up", () => stairsTile(th, false, fl(0)));
  return fl(v);
}

/* ---------- people: a paper doll layered from what they wear ---------- */
const SKIN = { human: [0.93, 0.74, 0.6], sylvan: [0.95, 0.85, 0.7], stonekin: [0.8, 0.6, 0.5], burrowfolk: [0.95, 0.75, 0.6], tinkerling: [0.9, 0.8, 0.65],
  ashborn: [0.75, 0.45, 0.35], marrowkin: [0.55, 0.65, 0.45], cragborn: [0.6, 0.6, 0.62] };
const HAIR = { human: [0.35, 0.22, 0.14], sylvan: [0.85, 0.75, 0.45], stonekin: [0.55, 0.3, 0.15], burrowfolk: [0.45, 0.3, 0.15], tinkerling: [0.75, 0.75, 0.8],
  ashborn: [0.2, 0.15, 0.15], marrowkin: [0.15, 0.15, 0.12], cragborn: [0.3, 0.3, 0.3] };
const HEIGHT = { burrowfolk: 2, tinkerling: 2, stonekin: 1 };   // short peoples stand lower in the tile
const METAL = [0.72, 0.75, 0.82], LEATHER = [0.55, 0.36, 0.22], CLOTH = [0.35, 0.38, 0.6];
function material(k){
  if (!k) return null;
  if (/plate|banded|splint|steel|iron|gauntlets|tower|kite|great/.test(k)) return { rgb: METAL, shine: true };
  if (/chain|ring|scale/.test(k)) return { rgb: [0.6, 0.62, 0.66], mail: true };
  if (/robe/.test(k)) return { rgb: [0.4, 0.3, 0.6], robe: true };
  if (/circlet|silver/.test(k)) return { rgb: [1, 0.82, 0.35] };
  if (/sandal|soft/.test(k)) return { rgb: [0.62, 0.48, 0.3] };
  if (/fur/.test(k)) return { rgb: [0.5, 0.4, 0.3] };
  return { rgb: LEATHER };
}
// who: { race, skin?, hair?, tusks?, cloth?, eq: { weapon, shield, body, head, hands, feet, cloak, light, bow } as item kind ids }
function doll(who, size = TS){
  const p = pix(size, size), s = size / TS, R = (x, y, w, h, c) => p.rect(Math.round(x * s), Math.round(y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), c);
  const e = who.eq || {}, skin = who.skin || SKIN[who.race] || SKIN.human, dy = HEIGHT[who.race] || 0, big = who.race === "cragborn" ? 1 : 0;
  const body = material(e.body) || { rgb: who.cloth || CLOTH }, legs = body.robe ? body.rgb : [0.3, 0.27, 0.32];
  if (e.cloak) R(4 - big, 6 + dy, 8 + 2 * big, 8 - dy, hex(/fur/.test(e.cloak) ? [0.5, 0.4, 0.3] : /oil/.test(e.cloak) ? [0.4, 0.38, 0.2] : [0.3, 0.42, 0.32], 0.8));
  R(5 - big, 11 + dy, 2 + big, 4 - dy, hex(legs)); R(9, 11 + dy, 2 + big, 4 - dy, hex(legs));
  const boot = e.feet ? material(e.feet).rgb : [0.3, 0.22, 0.16];
  R(4 - big, 14, 3 + big, 2, hex(boot)); R(9, 14, 3 + big, 2, hex(boot));
  R(4 - big, 6 + dy, 8 + 2 * big, 6, hex(body.rgb));
  if (body.robe) R(4 - big, 11 + dy, 8 + 2 * big, 3 - dy, hex(body.rgb, 0.85));
  if (body.mail) for (let y = 7; y < 12; y += 2) for (let x = 5; x < 11; x += 2) R(x - big + ((y >> 1) & 1), y + dy, 1, 1, hex(body.rgb, 0.7));
  if (body.shine){ R(5 - big, 7 + dy, 2, 3, hex(body.rgb, 1.3)); R(4 - big, 6 + dy, 8 + 2 * big, 1, hex(body.rgb, 1.2)); }
  R(4 - big, 11 + dy, 8 + 2 * big, 1, hex([0.25, 0.18, 0.12]));
  const hand = e.hands ? material(e.hands).rgb : skin;
  R(2 - big, 7 + dy, 2, 4, hex(body.rgb, 0.85)); R(12 + big, 7 + dy, 2, 4, hex(body.rgb, 0.85));
  R(2 - big, 10 + dy, 2, 2, hex(hand)); R(12 + big, 10 + dy, 2, 2, hex(hand));
  R(5, 1 + dy, 6, 5, hex(skin)); R(6, 3 + dy, 1, 1, "#1a1418"); R(9, 3 + dy, 1, 1, "#1a1418");
  if (who.tusks){ R(6, 5 + dy, 1, 1, "#eee"); R(9, 5 + dy, 1, 1, "#eee"); }
  const helm = material(e.head);
  if (helm){ if (/circlet/.test(e.head)){ R(5, 0 + dy, 6, 2, hex(who.hair || HAIR[who.race] || HAIR.human)); R(5, 1 + dy, 6, 1, hex(helm.rgb)); }
    else { R(4, 0 + dy, 8, 3, hex(helm.rgb)); R(4, 0 + dy, 8, 1, hex(helm.rgb, 1.25)); if (/great/.test(e.head)){ R(4, 3 + dy, 8, 3, hex(helm.rgb, 0.9)); R(5, 3 + dy, 6, 1, "#1a1418"); } } }
  else R(5, 0 + dy, 6, 2, hex(who.hair || HAIR[who.race] || HAIR.human));
  weaponArt(R, e.weapon, dy, big);
  if (e.shield){ const sh = material(e.shield).rgb, small = /buckler/.test(e.shield), tall = /tower|kite/.test(e.shield);
    R(11 + big, (small ? 8 : tall ? 5 : 7) + dy, small ? 4 : 5, small ? 4 : tall ? 9 : 6, hex(sh)); R(12 + big, (small ? 9 : tall ? 7 : 8) + dy, 2, 2, hex([0.85, 0.7, 0.3])); }
  else if (e.light){ R(13 + big, 7 + dy, 1, 4, hex(LEATHER)); R(13 + big, 5 + dy, 1, 2, hex(/lantern/.test(e.light) ? [1, 0.85, 0.45] : [1, 0.75, 0.25])); R(13 + big, 4 + dy, 1, 1, hex([1, 0.95, 0.6])); }
  return p.outline().c;
}
function weaponArt(R, k, dy, big){
  if (!k) return;
  const steel = hex([0.82, 0.85, 0.92]), dark = hex([0.45, 0.32, 0.2]), x = 1 - big;
  if (/staff|pike|spear|lance|glaive|halberd|trident|scythe/.test(k)){ R(x + 1, 1 + dy, 1, 14, dark); if (!/staff/.test(k)) R(x, 0 + dy, 3, 3, steel); return; }
  if (/axe/.test(k)){ R(x + 1, 3 + dy, 1, 9, dark); R(x, 2 + dy, 3, 4, steel); return; }
  if (/mace|hammer|maul|club|star|flail/.test(k)){ R(x + 1, 4 + dy, 1, 7, dark); R(x, 2 + dy, 3, 3, /club/.test(k) ? dark : steel); return; }
  const long = /two|headsman|bastard|long|broad/.test(k) ? 9 : 6;
  R(x + 1, 10 - long + dy, 1, long, steel); R(x, 10 + dy, 3, 1, hex([0.85, 0.7, 0.3])); R(x + 1, 11 + dy, 1, 1, dark);
}

/* ---------- creatures: one drawing per body plan; colour and size come from the monster's data ---------- */
// The plan is K.shape when the data gives one, otherwise it follows the monster's letter.
const PLAN = { r: "rodent", C: "canine", w: "worm", I: "insect", m: "mould", S: "spider", K: "beetle", q: "bear", "*": "wisp", s: "skeleton", z: "ghoul", T: "giant", g: "goblin", p: "person", o: "goblin", k: "goblin" };
const SPRITES = new Map();
const creatureImage = K => memo(SPRITES, K.id, () => creature(K));
function creature(K){
  const p = pix(), c = K.rgb, base = hex(c), dark = hex(c, 0.6), light = hex(c, 1.25), eye = K.undead ? "#7ff" : "#ff4";
  switch (K.shape || PLAN[K.glyph]){
    case "rodent": p.rect(3, 9, 9, 5, base); p.rect(4, 9, 7, 1, light); p.rect(11, 8, 4, 4, base); p.px(13, 9, eye); p.px(12, 7, light); p.line(0, 13, 3, 11, dark); p.rect(4, 14, 1, 1, dark); p.rect(10, 14, 1, 1, dark); break;
    case "canine": p.rect(2, 7, 10, 5, base); p.rect(3, 7, 8, 1, light); p.rect(11, 4, 4, 5, base); p.rect(14, 6, 2, 2, dark); p.px(12, 5, eye); p.px(11, 3, base);
      for (const x of [3, 5, 9, 11]) p.rect(x, 12, 1, 3, dark); p.line(0, 5, 2, 8, base); break;
    case "worm": for (let i = 0; i < 5; i++) p.disc(3 + i * 2.5 | 0, 11 - (i === 4 ? 1 : 0), 2 + (i > 1 && i < 4 ? 1 : 0), i & 1 ? base : light); p.px(13, 9, eye); p.line(13, 7, 14, 5, dark); break;
    case "insect": p.disc(5, 7, 3, light); p.disc(11, 7, 3, light); p.disc(5, 11, 2, base); p.disc(11, 11, 2, base); p.rect(7, 5, 2, 8, dark); p.px(7, 5, eye); p.px(8, 5, eye); break;
    case "mould": for (let i = 0; i < 6; i++) p.disc(3 + (hash(i, 1) * 10 | 0), 8 + (hash(i, 2) * 5 | 0), 2 + (hash(i, 3) * 2 | 0), i & 1 ? base : dark); for (let i = 0; i < 5; i++) p.px(4 + (hash(i, 5) * 8 | 0), 8 + (hash(i, 6) * 5 | 0), light); break;
    case "spider": p.disc(8, 8, 3, base); p.disc(8, 12, 2, dark); for (const s of [-1, 1]) for (let i = 0; i < 4; i++) p.line(8 + s * 2, 7 + i, 8 + s * 6, 4 + i * 3, dark); p.px(7, 7, "#f44"); p.px(9, 7, "#f44"); break;
    case "beetle": p.disc(8, 9, 4, base); p.rect(8, 5, 1, 9, dark); p.disc(8, 4, 2, dark); p.px(6, 7, light); p.px(10, 7, light); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) p.line(8 + s * 4, 7 + i * 2, 8 + s * 6, 6 + i * 3, dark); break;
    case "bear": p.rect(2, 6, 12, 7, base); p.rect(3, 6, 10, 1, light); p.disc(12, 6, 3, base); p.px(12, 3, base); p.px(14, 3, base); p.px(13, 6, eye); p.rect(14, 7, 2, 2, dark);
      for (const x of [3, 6, 9, 12]) p.rect(x, 13, 2, 3, dark); break;
    case "wisp": p.disc(8, 8, 4, hex(c, 0.9)); p.disc(8, 8, 2, light); p.px(8, 8, "#fff"); p.px(3, 3, light); p.px(13, 4, light); p.px(4, 13, light); break;
    case "skeleton": return doll({ skin: [0.9, 0.88, 0.8], hair: [0.9, 0.88, 0.8], cloth: [0.85, 0.83, 0.75], race: "human", eq: { weapon: "shortsword" } });
    case "ghoul": return doll({ skin: c, hair: c.map(v => v * 0.6), cloth: [0.3, 0.32, 0.28], race: "human", eq: {} });
    case "giant": return doll({ skin: c, hair: c.map(v => v * 0.6), cloth: [0.4, 0.32, 0.22], race: "cragborn", tusks: true, eq: { weapon: "club" } });
    case "goblin": return doll({ skin: c, hair: [0.15, 0.12, 0.1], race: "burrowfolk", tusks: true, eq: { weapon: "dagger", body: "leather" } });
    case "person": return doll({ skin: SKIN.human, hair: c.map(v => v * 0.5), cloth: c, race: "human", eq: {} });
    default: {   // no plan: a mirrored shape seeded by the monster's id, so every kind still looks like itself
      let seed = 0; for (const ch of K.id) seed = seed * 31 + ch.charCodeAt(0);
      for (let y = 2; y < 15; y++) for (let x = 2; x < 8; x++) if (hash(x, y, seed) < 0.5 - Math.abs(y - 8) * 0.03){ const col = hash(x, y, seed + 1) < 0.2 ? light : base; p.px(x, y, col); p.px(15 - x, y, col); }
      p.px(6, 6, eye); p.px(9, 6, eye);
    }
  }
  return p.outline().c;
}
// The same shape as a dull red glow: how a warm body looks by infravision alone.
const HEAT = new Map();
const heatImage = img => memo(HEAT, img, () => { const c = newCanvas(TS, TS), g = c.getContext("2d"); g.drawImage(img, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "#c8402f"; g.fillRect(0, 0, TS, TS); return c; });

/* ---------- item icons: one drawing per category, coloured by material or flavour ---------- */
function icon(K, rgb){
  const p = pix(), col = hex(rgb), dark = hex(rgb, 0.6), light = hex(rgb, 1.3), c = K.cat;
  if (c === "weapon"){ p.g.translate(16, 0); p.g.rotate(Math.PI / 4); p.g.translate(-3, 2);
    weaponArt((x, y, w, h, cl) => p.rect(x * 1.3, y * 1.3, w * 1.3 + 0.5, h * 1.3 + 0.5, cl), K.id, 0, 0); p.g.setTransform(1, 0, 0, 1, 0, 0); }
  else if (c === "bow"){ if (/sling/.test(K.id)){ p.line(3, 3, 8, 11, hex(LEATHER)); p.line(13, 3, 8, 11, hex(LEATHER)); p.disc(8, 12, 2, hex(LEATHER, 0.8)); }
    else { for (let y = 2; y < 15; y++) p.px(5 + Math.round(4 * Math.sin((y - 2) / 12 * Math.PI)), y, hex(WOOD)); p.line(5, 2, 5, 14, "#ddd"); } }
  else if (c === "ammo" || c === "dart"){ if (/shot|pebble/.test(K.id)) for (const [x, y] of [[5, 9], [10, 9], [8, 5], [7, 12]]) p.disc(x, y, 1, "#9a9aa4");
    else { p.line(3, 13, 12, 4, hex(WOOD)); p.rect(11, 3, 2, 2, "#ccd"); p.px(3, 12, "#d44"); p.px(4, 13, "#d44"); if (c === "ammo"){ p.line(4, 11, 13, 2, hex(WOOD)); } } }
  else if (c === "potion" || c === "flask"){ const cc = c === "flask" ? hex([0.9, 0.75, 0.3]) : col; p.rect(7, 2, 2, 3, "#ccd"); p.rect(6, 1, 4, 1, hex([0.5, 0.35, 0.2])); p.disc(8, 10, 4, cc); p.rect(5, 7, 6, 1, c === "flask" ? "#fe9" : light); p.px(6, 9, "#fff"); }
  else if (c === "scroll"){ p.rect(3, 4, 10, 8, "#e8dcc0"); p.rect(2, 3, 2, 10, "#c8b890"); p.rect(12, 3, 2, 10, "#c8b890"); for (let y = 6; y < 11; y += 2) p.rect(5, y, 6, 1, "#8a7a60"); p.px(8, 12, "#b33"); }
  else if (c === "book"){ const bc = K.realm === "holy" ? [0.95, 0.85, 0.45] : [0.45, 0.4, 0.9]; p.rect(3, 3, 10, 11, hex(bc)); p.rect(3, 3, 2, 11, hex(bc, 0.6)); p.rect(6, 6, 5, 1, hex(bc, 1.4)); p.rect(6, 8, 4, 1, hex(bc, 1.4)); }
  else if (c === "ring"){ p.disc(8, 10, 4, hex([0.95, 0.8, 0.35])); p.g.clearRect(7, 9, 3, 3); p.disc(8, 5, 2, col); p.px(7, 4, "#fff"); }
  else if (c === "amulet"){ p.line(3, 2, 8, 9, "#ccb070"); p.line(13, 2, 8, 9, "#ccb070"); p.disc(8, 11, 3, col); p.px(7, 10, "#fff"); }
  else if (c === "wand" || c === "rod" || c === "staff"){ if (c === "staff"){ p.line(4, 15, 11, 1, col); p.line(5, 15, 12, 1, dark); p.disc(11, 2, 2, "#fe8"); } else { p.line(3, 13, 12, 3, col); p.line(4, 13, 13, 3, dark); p.disc(12, 3, 1, c === "rod" ? "#9cf" : "#fe8"); } }
  else if (c === "light"){ if (/lantern/.test(K.id)){ p.rect(5, 4, 6, 9, "#3a3a40"); p.rect(6, 5, 4, 7, "#ffd27a"); p.rect(7, 1, 2, 3, "#3a3a40"); } else { p.rect(7, 6, 2, 9, hex(LEATHER)); p.disc(8, 4, 2, "#fa3"); p.px(8, 2, "#ffd"); } }
  else if (c === "mushroom"){ p.rect(7, 9, 2, 5, "#ddc"); p.disc(8, 8, 4, col); p.g.clearRect(3, 9, 11, 4); p.rect(7, 9, 2, 5, "#ddc"); p.px(6, 6, "#fff"); }
  else if (c === "food"){ p.disc(8, 9, 5, hex([0.75, 0.55, 0.3])); p.rect(4, 7, 8, 1, hex([0.9, 0.75, 0.45])); }
  else if (c === "gold"){ for (const [x, y] of [[5, 11], [9, 11], [7, 8], [11, 9], [7, 12]]){ p.disc(x, y, 2, "#e8b830"); p.px(x - 1, y - 1, "#fff2a0"); } }
  else { const m = material(K.id) || { rgb }, mc = hex(m.rgb);   // armour: a small silhouette per slot
    if (c === "body"){ p.rect(3, 3, 10, 10, mc); p.rect(1, 3, 3, 5, mc); p.rect(12, 3, 3, 5, mc); p.g.clearRect(6, 3, 4, 2); p.rect(3, 12, 10, 1, hex(m.rgb, 0.7)); if (m.mail) for (let y = 5; y < 12; y += 2) for (let x = 4; x < 12; x += 2) p.px(x + (y & 2 ? 1 : 0), y, hex(m.rgb, 0.7)); }
    else if (c === "shield"){ p.rect(3, 2, 10, 8, mc); p.disc(8, 10, 5, mc); p.rect(7, 3, 2, 10, hex([0.85, 0.7, 0.3])); }
    else if (c === "head"){ if (/circlet/.test(K.id)){ p.rect(3, 8, 10, 2, mc); p.disc(8, 7, 1, "#8cf"); } else { p.disc(8, 9, 5, mc); p.g.clearRect(2, 10, 13, 6); p.rect(3, 9, 10, 2, hex(m.rgb, 0.8)); } }
    else if (c === "feet"){ p.rect(3, 3, 4, 10, mc); p.rect(3, 11, 7, 3, mc); p.rect(9, 3, 4, 10, hex(m.rgb, 0.85)); p.rect(9, 11, 6, 3, hex(m.rgb, 0.85)); }
    else if (c === "hands"){ p.rect(4, 5, 8, 8, mc); p.rect(4, 2, 2, 4, mc); p.rect(7, 1, 2, 5, mc); p.rect(10, 2, 2, 4, mc); }
    else if (c === "cloak"){ const cc = hex(material(K.id).rgb === LEATHER ? [0.3, 0.42, 0.32] : material(K.id).rgb); p.rect(4, 2, 8, 2, cc); p.rect(3, 4, 10, 10, cc); p.rect(7, 4, 2, 10, "rgba(0,0,0,.3)"); }
    else p.rect(4, 4, 8, 8, col); }
  return p.outline().c;
}
// A spell's icon: by what it does, in its element's colour.
function spellIcon(S, rgb){
  const p = pix(), col = hex(rgb), light = hex(rgb, 1.4);
  const fx = S.fx;
  if (/bolt|beam|ball/.test(fx)){ p.line(2, 14, 11, 5, col); p.line(3, 14, 12, 5, col); p.disc(12, 4, fx === "ball" ? 3 : 2, light); p.px(12, 4, "#fff"); }
  else if (/heal|cure|avatar/.test(fx)){ p.rect(6, 2, 4, 12, col); p.rect(2, 6, 12, 4, col); p.rect(7, 3, 2, 10, light); }
  else if (/detect|map|clair|enlight/.test(fx)){ p.disc(8, 8, 5, col); p.disc(8, 8, 3, "#fff"); p.disc(8, 8, 1, "#111"); }
  else if (/phase|teleport|sendAway|teleOther|recall|banish/.test(fx)){ for (let a = 0; a < 18; a++){ const r = a / 3; p.px(8 + Math.round(Math.cos(a * 0.7) * r), 8 + Math.round(Math.sin(a * 0.7) * r), a > 12 ? light : col); } }
  else if (/light|refuel|dispel/.test(fx)){ p.disc(8, 8, 3, light); for (let a = 0; a < 8; a++) p.px(8 + Math.round(Math.cos(a * 0.785) * 6), 8 + Math.round(Math.sin(a * 0.785) * 6), col); }
  else if (/res|ward|prot|bless|hero|fast/.test(fx)){ p.rect(3, 2, 10, 7, col); p.disc(8, 9, 5, col); p.rect(7, 4, 2, 8, light); p.rect(5, 6, 6, 2, light); }
  else { p.disc(8, 8, 5, col); p.line(5, 5, 11, 11, light); p.line(11, 5, 5, 11, light); }
  return p.outline().c;
}
