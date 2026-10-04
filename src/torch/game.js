(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Torchlight Dungeons: a turn-based dungeon crawl after Moria. The rules run on the 198 x 66 map in gen.js; you
// see what your light (or a lit room, a glowing monster, a flying spell) shows you, and warm bodies within your
// infravision. Characters come from chars.js. The engine draws the light and throws a little physics debris.
// See TORCHLIGHT_PLAN.md for the phases.
const TORCH_RGB = [1.0, 0.62, 0.3], ROOM_RGB = [0.42, 0.42, 0.47], MEM_RGB = [0.07, 0.08, 0.12];
const WHITE = [1.6, 1.6, 1.6], DIM = [0.45, 0.48, 0.6], ACCENT = [1.6, 1.15, 0.5], RED = [1.6, 0.4, 0.35], GREEN = [0.6, 1.4, 0.6], BLUE = [0.6, 0.85, 1.6];
const TILE = {   // glyph and base colour per tile
  [T.EDGE]: ["#", [0.5, 0.46, 0.42]], [T.WALL]: ["#", [0.55, 0.5, 0.45]], [T.FLOOR]: [".", [0.32, 0.32, 0.32]],
  [T.DOOR]: ["+", [0.75, 0.48, 0.22]], [T.OPEN]: ["'", [0.75, 0.48, 0.22]], [T.DOWN]: [">", [1.2, 1.2, 1.2]], [T.UP]: ["<", [1.2, 1.2, 1.2]],
  [T.SHOP]: ["1", [1.2, 1.1, 0.8]], [T.GROUND]: [".", [0.42, 0.4, 0.3]], [T.LAMP]: ["i", [1.1, 0.95, 0.6]]
};
const BITS = { name: "bits", density: 0.6, e: 0.45, mu: 0.5, kd: 0.9, ks: 0.5, shine: 20 };
const DIRS = { 1: [-1, 1], 2: [0, 1], 3: [1, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 8: [0, -1], 9: [1, -1] };
const VY = 2;   // map rows start under the two message rows; the status bar takes the last two rows

const D = defaultDisplay(); D.room = 0.15; D.glow = 0.3; D.lampRGB = TORCH_RGB;
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
// Detail: this page's grid already follows the screen, so higher detail means smaller characters and a bigger view.
const DETAIL = D.detail; D.detail = 1;
if (D.pixels){ TILE[T.FLOOR][1] = [0.09, 0.09, 0.1]; TILE[T.GROUND][1] = [0.12, 0.11, 0.08]; }   // as solid pixels, floor must be much darker than wall to read the map
const world = new World(); world.openTop = true;
const lamp = { x: 0, y: 0, z: 0, on: true };   // the player's torch, for lighting the debris
let screen = null, GW = 80, GH = 30, VH = 26, state = "title", stateT = 0;
let rng = new RNG(Date.now() & 0xffffffff), L = null, depth = 1, player = null, mons = [], floor = [], cam = { x: 0, y: 0 };
let roomLight = new Float32Array(3 * MW * MH), lightNow = new Float32Array(3 * MW * MH), lightTurn = new Float32Array(3 * MW * MH);
let seenAt = new Uint32Array(MW * MH), inFov = new Uint32Array(MW * MH), mem = new Uint8Array(MW * MH), turnNo = 1;
let msgs = [], oldMsgs = [], log = [], killer = "", tomb = null;
let shots = [], flashes = [], later = [];   // visual only: flying bolts and darts, impact flashes, and effects that wait for them
const idx = (x, y) => y * MW + x;
const blocks = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || opaque(L.tiles[y * MW + x]);
const visible = i => seenAt[i] === turnNo;
const monAt = (x, y) => mons.find(m => m.x === x && m.y === y);
const itemsAt = (x, y) => floor.filter(f => f.x === x && f.y === y);
const dist = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const race = () => RACE[player.race], cls = () => CLASS[player.cls];
function say(s){ msgs.push(s); log.push(s); if (log.length > 200) log.shift(); }
// You see a monster if light shows it, or if it is warm-blooded, in your line of sight and within your infravision.
const byHeat = m => !m.K.cold && infra() > 0 && inFov[idx(m.x, m.y)] === turnNo && dist(m.x, m.y, player.x, player.y) <= infra() && !visible(idx(m.x, m.y));
const seesMon = m => visible(idx(m.x, m.y)) || byHeat(m);
const sensed = m => seesMon(m) || m.det === turnNo;   // seen, or found by detection this turn
const theName = m => seesMon(m) ? "the " + m.K.name : "it";

/* ---------- saved preferences and high scores ---------- */
const store = prefs("torchlightDungeons.v1.", "Torchlight Dungeons"), scores = scoreTable(store);   // src/arcade.js
let keySet = store.getJSON("keys", "original");

/* ---------- items: names, carrying, and what worn things add ---------- */
const nameOf = (it, n) => itemName(it, player.know, n);
const cap = s => s[0].toUpperCase() + s.slice(1);
const sameItem = (a, b) => a.k === b.k && (["potion", "scroll", "food", "mushroom", "flask", "book"].includes(ITEM[a.k].cat) || a.fuel === b.fuel && a.charges === undefined && b.charges === undefined && a.timeout === undefined && b.timeout === undefined
  && !!a.id === !!b.id && a.sense === b.sense && (a.tohit || 0) === (b.tohit || 0) && (a.todam || 0) === (b.todam || 0) && (a.toac || 0) === (b.toac || 0)
  && a.ego === b.ego && !a.art && !b.art && a.pval === b.pval && !!a.cursed === !!b.cursed);
function carry(it){
  const same = player.inv.find(o => sameItem(o, it));
  if (same){ same.n += it.n; return same; }
  if (player.inv.length >= 22) return null;
  player.inv.push(it); return it;
}
const plainItem = (k, n = 1) => { const it = { k, n, id: true }; if (ITEM[k].cat === "light" && ITEM[k].fuel) it.fuel = ITEM[k].fuel; if (ITEM[k].charges) it.charges = rng.dice(ITEM[k].charges); return it; };
const loot = d => rollItem(d, rng, player.know);
const weapon = () => player.eq.weapon;
const weaponDice = () => weapon() ? ITEM[weapon().k].dice : "1d2";
const armour = () => player.bonus.ac + statMod(player.stats.dex) + Math.floor(player.lvl / 5);
const totalWeight = () => player.inv.reduce((s, it) => s + itemWeight(it), 0) + SLOTS.reduce((s, k) => s + (player.eq[k] ? itemWeight(player.eq[k]) : 0), 0);
const capacity = () => 70 + player.stats.str * 6;
// Everything worn items and timed effects add, worked out again whenever something changes.
function recalc(){
  const p = player, b = { hit: 0, dam: 0, ac: 0, speed: 0, stealth: 0, search: 0, infra: 0, regen: 0, light: 0, res: new Set(), stats: {} };
  for (const s of SLOTS){
    const it = p.eq[s]; if (!it) continue;
    const P = itemPowers(it);
    if (s !== "weapon" && s !== "bow"){ b.hit += P.hit; b.dam += P.dam; }   // a weapon's or bow's own numbers count only for its own attacks
    b.ac += P.ac; b.speed += P.speed;
    for (const f of ["stealth", "search", "infra", "regen", "light"]) b[f] += P[f] || 0;
    for (const [k, v] of Object.entries(P.stats)) b.stats[k] = (b.stats[k] || 0) + v;
    for (const r of P.res) b.res.add(r);
    for (const f of ["freeAct", "slowDigest", "teleportCurse"]) if (P[f]) b[f] = true;
  }
  const t = p.t;
  if (t.fast) b.speed += 10;
  if (t.bless){ b.hit += 10; b.ac += 5; }
  if (t.hero) b.hit += 12;
  if (t.berserk){ b.hit += 12; b.ac -= 10; }
  if (t.resFire) b.res.add("fire");
  if (t.resCold) b.res.add("cold");
  if (t.infra) b.infra += 3;
  if (RACE[p.race].fireRes) b.res.add("fire");
  p.stats = {}; for (const k of STATS) p.stats[k] = clampStat(p.base[k] + (b.stats[k] || 0));
  const over = totalWeight() - capacity();
  b.burden = over > 0 ? Math.ceil(over / 10) : 0;   // every 10 lb over what you can carry slows you a step
  p.speed = b.speed - b.burden; p.bonus = b;
}
function lightRadius(){
  const it = player.eq.light; if (!it || (it.fuel !== undefined && it.fuel <= 0)) return 0;
  const A = it.art ? ARTIFACT[it.art] : null;
  const R = ((A && A.radius) || ITEM[it.k].radius) + ((player.cls && cls().lightBonus) || 0) + ((player.bonus && player.bonus.light) || 0);
  return it.fuel === undefined ? R : it.fuel < 100 ? 1 : it.fuel < 500 ? R - 1 : R;
}
const infra = () => player.t.blind ? 0 : race().infra + player.bonus.infra;

/* ---------- levels ---------- */
function newLevel(d){
  const from = depth;
  depth = d; player.maxDepth = Math.max(player.maxDepth, d);
  L = d === 0 ? generateTown(rng) : generateLevel(rng, d);
  mem.fill(0); mons = [player]; floor = []; pendingLevel = null; world.bodies.length = 0; shots = []; flashes = []; later = [];
  const at = L.spot(); player.x = at % MW; player.y = Math.floor(at / MW);
  if (d === 0){
    // back from the dungeon: the shops have sold some things and bought in others
    if (from > 0 && player.turns - lastTown > 500) shops.forEach((sh, i) => { sh.stock = restock(sh.stock, SHOPS[i], rng, player.know, 0.5); });
    lastTown = player.turns; wasDay = isDay(); lightTown();
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) mem[idx(x, y)] = 1;   // you know your own town
    for (let k = 0, n = 5 + rng.int(4) + (wasDay ? 0 : 3); k < n; k++) spawnMonster(false);
    centerCamera(true); updateSight();
    say(from > 0 ? "You climb out into the town of Lanternhollow." : "You stand in Lanternhollow, a town above the dungeon. The shops are numbered 1 to 6.");
    say(wasDay ? "It is daytime." : "It is night; the lamps are lit.");
    return;
  }
  // light from lit rooms is fixed for the whole level
  roomLight.fill(0);
  for (let i = 0; i < MW * MH; i++) if (L.lit[i]){ roomLight[3 * i] = ROOM_RGB[0]; roomLight[3 * i + 1] = ROOM_RGB[1]; roomLight[3 * i + 2] = ROOM_RGB[2]; }
  for (let k = 0, n = 14 + d + rng.int(8); k < n; k++) spawnMonster(false);
  for (let k = 0, n = 8 + rng.int(6); k < n; k++) dropAt(freeSpot(0), rng.chance(0.35) ? { k: "gold", n: rng.range(8, 25) * d } : loot(d));
  centerCamera(true); updateSight();
  say(d === 1 && from === 0 ? "You enter the dungeon at 50 ft. Your torch hisses in the damp air." : "You are now at " + feet(d) + " ft.");
}
const depthName = d => d ? feet(d) + " ft" : "the town";

/* ---------- the town: day and night ---------- */
// A day lasts DAY turns: daylight for the first half. By day the sun crosses from east to west and the buildings
// cast shadows away from it; at night there is faint moonlight, and the lamp posts and shop doorways glow.
const DAY = 10000, MOON_RGB = [0.035, 0.045, 0.08], LAMP_RGB = [1.0, 0.7, 0.35];
let shops = null, lastTown = 0, wasDay = true;
const dayPhase = () => (player.turns % DAY) / DAY, isDay = () => dayPhase() < 0.5;
function lightTown(){
  roomLight.fill(0);
  const ph = dayPhase();
  if (ph < 0.5){
    const a = ph / 0.5 * Math.PI, high = Math.sin(a), k = 0.3 + 0.7 * high;   // brightest at noon, warmer at dawn and dusk
    const rgb = [0.95 * k, (0.7 + 0.22 * high) * k, (0.5 + 0.35 * high) * k], sx = Math.cos(a) * 2, sy = 0.6;   // towards the sun (to the south)
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++){
      const i = idx(x, y);
      let f = 1;
      if (!opaque(L.tiles[i])) for (let s = 1; s <= 4; s++){   // in a building's shadow?
        const tx = Math.round(x + sx * s), ty = Math.round(y + sy * s);
        if (tx >= 0 && ty >= 0 && tx < L.w && ty < L.h && L.tiles[idx(tx, ty)] === T.WALL){ f = 0.45; break; }
      }
      roomLight[3 * i] = rgb[0] * f; roomLight[3 * i + 1] = rgb[1] * f; roomLight[3 * i + 2] = rgb[2] * f;
    }
    return;
  }
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++){ const i = idx(x, y); roomLight[3 * i] = MOON_RGB[0]; roomLight[3 * i + 1] = MOON_RGB[1]; roomLight[3 * i + 2] = MOON_RGB[2]; }
  for (const i of L.lamps) addLight(roomLight, MW, MH, blocks, { x: i % MW, y: Math.floor(i / MW), r: 6, i: 0.9, rgb: LAMP_RGB });
  L.shops.forEach((sh, k) => addLight(roomLight, MW, MH, blocks, { x: sh.door % MW, y: Math.floor(sh.door / MW), r: 4, i: 0.8, rgb: SHOPS[k].rgb.map(v => v * 0.7) }));
}
function freeSpot(minDist){
  for (let tries = 0; tries < 400; tries++){
    const r = rng.pick(L.rooms), i = rng.pick(r.cells), x = i % MW, y = Math.floor(i / MW);
    if ((L.tiles[i] === T.FLOOR || L.tiles[i] === T.GROUND) && !monAt(x, y) && dist(x, y, player.x, player.y) >= minDist && !(minDist && visible(i))) return i;
  }
  return -1;
}
function dropAt(i, it){ if (i >= 0) floor.push({ x: i % MW, y: Math.floor(i / MW), it }); }
function pickMonster(d){
  const deep = rng.chance(0.1) ? 3 : 0;   // now and then, something from deeper down
  const pool = d === 0 ? MONSTERS.filter(m => m.town) : MONSTERS.filter(m => !m.town && m.depth <= d + deep);
  return rng.weighted(pool, m => 1 / m.rarity * (m.depth >= d - 4 ? 1.5 : 0.6));
}
function spawnMonster(awake){
  const K = pickMonster(depth), at = freeSpot(10); if (at < 0) return;
  const n = K.pack ? rng.range(K.pack[0], K.pack[1]) : 1;
  let x = at % MW, y = Math.floor(at / MW);
  for (let k = 0; k < n; k++){
    // a pack gathers around the first one
    let px = x, py = y;
    for (let t = 0; t < 12 && (k > 0) && (monAt(px, py) || !passable(L.tiles[idx(px, py)])); t++){ px = x + rng.range(-2, 2); py = y + rng.range(-2, 2); }
    if (monAt(px, py) || !passable(L.tiles[idx(px, py)])) continue;
    const hp = rng.dice(K.hp);
    mons.push({ K, x: px, y: py, hp, mhp: hp, energy: rng.int(100), speed: K.speed, sleep: awake || K.pack ? 0 : rng.range(0, 30), seen: false });
  }
}

/* ---------- sight and light ---------- */
function computeLight(field, t){
  field.set(roomLight);
  const R = lightRadius();
  if (R > 0){
    const f = t ? 0.06 * Math.sin(t * 0.011) + 0.04 * Math.sin(t * 0.029 + 1.3) + 0.03 * Math.sin(t * 0.071) : 0;   // the flame flickers
    addLight(field, MW, MH, blocks, { x: player.x, y: player.y, r: R + f * 4, i: 1.3 * (1 + f), rgb: TORCH_RGB });
  }
  for (const m of mons) if (m.K && m.K.glow) addLight(field, MW, MH, blocks, { x: m.x, y: m.y, r: m.K.glow.r, i: 1.0, rgb: m.K.glow.rgb });
  if (!t) return;   // bolts and flashes only light what is drawn; they do not change what the turn saw
  for (const s of shots){ const c = s.path[Math.min(s.path.length - 1, Math.floor(s.t * s.speed))]; if (s.light) addLight(field, MW, MH, blocks, { x: c[0], y: c[1], r: 2.5, i: 1.2, rgb: s.light }); }
  for (const f of flashes) addLight(field, MW, MH, blocks, { x: f.x, y: f.y, r: 3.5, i: 1.6 * f.t / f.t0, rgb: f.rgb });
}
// After each turn: what the player can see is what is in their line of sight AND has light on it.
function updateSight(){
  turnNo++;
  computeLight(lightTurn, 0);
  const blind = player.t && player.t.blind > 0;
  fov(player.x, player.y, 45, blocks, (x, y) => {
    const i = idx(x, y); inFov[i] = turnNo;
    if (!blind && lum(lightTurn, 3 * i) > 0.03){ seenAt[i] = turnNo; mem[i] = 1; }
  }, MW, MH);
  for (const f of floor) if (visible(idx(f.x, f.y))) f.seen = true;   // items you have seen stay on the map
  rebuildTerrain();
}
function centerCamera(force){
  const ox = cam.x, oy = cam.y, w = L ? L.w : MW, h = L ? L.h : MH, mx = Math.max(0, w - GW), my = Math.max(0, h - VH);
  // the view moves in steps when you near its edge, like Moria's panels, rather than on every step
  if (force || player.x - cam.x < GW * 0.2 || player.x - cam.x > GW * 0.8) cam.x = w < GW ? -((GW - w) >> 1) : Math.max(0, Math.min(mx, player.x - (GW >> 1)));
  if (force || player.y - cam.y < VH * 0.2 || player.y - cam.y > VH * 0.8) cam.y = h < VH ? -((VH - h) >> 1) : Math.max(0, Math.min(my, player.y - (VH >> 1)));
  if (screen && (ox !== cam.x || oy !== cam.y)) for (const b of world.bodies){ b.x += (ox - cam.x) * screen.cw; b.y += (oy - cam.y) * screen.ch; }
}
// The engine's terrain for the debris: the walls on screen, plus the message and status rows.
function rebuildTerrain(){
  if (!screen || !L) return;
  const solid = new Uint8Array(GW * GH);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++){
    const my = cam.y + r - VY, mx = cam.x + c;
    solid[r * GW + c] = r < VY || r >= VY + VH || mx < 0 || my < 0 || mx >= MW || my >= MH || opaque(L.tiles[idx(mx, my)]) ? 1 : 0;
  }
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid, mat: BITS };
}

/* ---------- the player's actions: each returns true when it took a turn ---------- */
function tryMove(dx, dy){
  if (player.t.confused && rng.chance(0.4)){ [dx, dy] = DIRS[rng.pick([1, 2, 3, 4, 6, 7, 8, 9])]; say("You are confused."); }
  const x = player.x + dx, y = player.y + dy, i = idx(x, y), t = L.tiles[i], m = monAt(x, y);
  if (m) return attack(m);
  if (t === T.DOOR){ L.tiles[i] = T.OPEN; say("You open the door."); return true; }
  if (!passable(t)){ say(t <= T.WALL ? "There is a wall in the way." : "Something is in the way."); return false; }
  player.x = x; player.y = y;
  for (const f of itemsAt(x, y)) if (f.it.k === "gold"){ player.gold += f.it.n; say("You find " + f.it.n + " gold pieces."); floor.splice(floor.indexOf(f), 1); }
  const here = itemsAt(x, y);
  if (here.length === 1) say("You see " + nameOf(here[0].it) + ".");
  else if (here.length > 1) say("You see several items here.");
  if (t === T.SHOP) openShop(L.shopAt[i]);
  if (t === T.DOWN) say("There is a staircase down here.");
  if (t === T.UP) say("There is a staircase up here.");
  return true;
}
const hitChance = (skill, ac, extra = 0) => Math.max(5, Math.min(95, skill + 20 - ac * 0.8 + extra));
// A weapon that slays a sort of monster, or is branded with an element the monster does not resist, doubles its dice.
function multiplier(P, K){
  if (P.slay && K[P.slay]) return 2;
  if (P.brand && !(K.res || []).includes(P.brand)) return 2;
  return 1;
}
function attack(m){
  const K = m.K, name = theName(m), weak = player.food < 1000 ? -10 : 0, w = weapon(), P = w ? itemPowers(w) : { hit: 0, dam: 0 };
  if (rng.int(100) < hitChance(skillOf(player, "fight") + 3 * (P.hit + player.bonus.hit), K.ac, weak)){
    const mult = w ? multiplier(P, K) : 1, ambush = cls().ambush && m.sleep > 0;
    let dmg = Math.max(1, rng.dice(weaponDice()) * mult + P.dam + player.bonus.dam + statMod(player.stats.str));
    if (ambush) dmg *= 2;   // a Delver strikes a sleeping monster twice as hard
    if (player.t.confHit){ player.t.confHit = 0; say("Your hands stop glowing."); if (!resists(m)) m.conf = 10 + rng.int(10); }
    const verb = ambush ? "You ambush " : mult > 1 && P.brand ? { fire: "You burn ", cold: "You freeze ", elec: "You shock " }[P.brand] : mult > 1 ? "You smite " : "You hit ";
    damage(m, dmg, verb + name + ".");
    return true;
  }
  say("You miss " + name + ".");
  return true;
}
function damage(m, dmg, msg, delay = 0){   // returns true if it died
  m.hp -= dmg; m.sleep = 0;
  if (m.hp <= 0){ kill(m, theName(m), delay); return true; }
  say(msg);
  if (m.K.flee && m.hp < m.mhp * 0.3) m.afraid = 10;
  return false;
}
function kill(m, name, delay = 0){
  say("You have slain " + name + ".");
  mons.splice(mons.indexOf(m), 1); player.kills++;
  gainExp(m.K.exp * m.K.depth / player.lvl);
  if (m.K.drop && rng.chance(m.K.drop)) dropAt(idx(m.x, m.y), rng.chance(0.6) ? { k: "gold", n: rng.range(5, 20) * depth } : loot(depth));
  const { x, y } = m;
  later.push({ t: delay, fn: () => burst(x, y, m.K.rgb, 7) });
}
function gainExp(e){
  player.exp += e;
  while (player.exp >= expNeeded(player, player.lvl + 1) && player.lvl < 40){
    const before = titleOf(player);
    player.lvl++; const up = levelHp(player, rng); player.mhp += up; player.hp += up;
    player.mmana = maxMana(player);
    say("Welcome to level " + player.lvl + "." + (titleOf(player) !== before ? " You are now a " + titleOf(player) + "." : ""));
    const n = player.spells && learnable(player, books()).length;
    if (n) say("You can learn " + n + " new " + realmWord() + (n > 1 ? "s" : "") + ". Press S to study.");
  }
}
// Bits that tumble from a kill (or sparks from a hit, or glass from a potion), lit by your torch.
function burst(x, y, rgb, n){
  if (!screen) return;
  const px = (x - cam.x + 0.5) * screen.cw, py = (y - cam.y + VY + 0.5) * screen.ch;
  for (let k = 0; k < n; k++){
    const a = Math.random() * 6.283, sp = 80 + Math.random() * 220, b = world.add(px, py, screen.ch * (0.18 + Math.random() * 0.15), "bits", rgb.map(v => v * 0.45), BITS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 120; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 1.2 + Math.random() * 0.8;
  }
}
// A feeling about a weapon's or armour's quality, before it is identified.
function sense(it, chance){
  const K = ITEM[it.k];
  if (it.id || it.sense || !(K.dice || K.ac !== undefined || K.mult) || K.cat === "dart" || rng.int(100) >= chance) return;
  const sum = (it.tohit || 0) + (it.todam || 0) + (it.toac || 0);
  it.sense = it.cursed || sum < 0 ? "cursed" : it.art || it.ego ? "special" : sum > 0 ? "magical" : "average";
}
function pickUp(){
  const here = itemsAt(player.x, player.y);
  if (!here.length){ say("There is nothing here to pick up."); return false; }
  for (const f of here){
    sense(f.it, skillOf(player, "notice"));
    const got = carry(f.it);
    if (!got){ say("You cannot carry any more."); break; }
    floor.splice(floor.indexOf(f), 1);
    say("You have " + nameOf(got) + " (" + String.fromCharCode(97 + player.inv.indexOf(got)) + ").");
  }
  recalc();
  if (player.bonus.burden) say("You are carrying too much and slow down.");
  return true;
}
function takeStairs(down){
  const t = L.tiles[idx(player.x, player.y)];
  if (t !== (down ? T.DOWN : T.UP)){ say("There is no staircase " + (down ? "down" : "up") + " here."); return false; }
  say(down ? "You descend the stairs." : "You climb the stairs.");
  newLevel(depth + (down ? 1 : -1));
  return "level";
}
function takeOne(it){ if (--it.n <= 0) player.inv.splice(player.inv.indexOf(it), 1); }
// Using an item teaches you its kind when you could tell what it did; otherwise it is marked {tried}.
function learn(it, noticed){
  const K = ITEM[it.k];
  if (!K.flavoured) return;
  if (!noticed){ player.know.tried[K.id] = true; return; }
  if (player.know.known[K.id]) return;
  player.know.known[K.id] = true;
  say("You learn that it is " + nameOf({ k: it.k, n: 1 }) + ".");
  gainExp((K.depth + (player.lvl >> 1)) / player.lvl);
}
function useItem(it, how){
  const K = ITEM[it.k];
  if (how === "eat"){
    player.food = Math.min(15000, player.food + (K.food || 0)); takeOne(it);
    if (K.effect) learn(it, FX[K.effect]({ K, it })); else say("That tastes good.");
    return true;
  }
  if (how === "quaff"){ takeOne(it); learn(it, FX[K.effect]({ K, it })); return true; }
  if (how === "read"){
    if (player.t.blind){ say("You can't see to read!"); return false; }
    if (player.t.confused){ say("You are too confused to read."); return false; }
    takeOne(it); learn(it, FX[K.effect]({ K, it })); return true;
  }
  if (how === "fuel"){
    const lt = player.eq.light;
    if (!lt || !ITEM[lt.k].maxFuel || lt.fuel === undefined){ say("You need a lantern to pour the oil into."); return false; }
    lt.fuel = Math.min(ITEM[lt.k].maxFuel, lt.fuel + K.fuel); say("You fill your lantern."); takeOne(it); return true;
  }
  if (how === "wield") return wear(it);
  if (how === "use") return useDevice(it);
  if (how === "drop"){
    floor.push({ x: player.x, y: player.y, it: { ...it }, seen: true }); player.inv.splice(player.inv.indexOf(it), 1);
    say("You drop " + nameOf(it) + "."); recalc(); return true;
  }
  return false;
}
function wear(it){
  const K = ITEM[it.k];
  if (!K.slot){ say("You cannot wear that."); return false; }
  let slot = K.slot;
  if (slot === "ring") slot = !player.eq.ring1 ? "ring1" : !player.eq.ring2 ? "ring2" : "ring1";
  const old = player.eq[slot];
  if (old && old.cursed){ say("You cannot remove " + nameOf(old) + ": it is cursed!"); if (!old.id) old.sense = "cursed"; return false; }
  const one = { ...it, n: 1 }; takeOne(it);
  player.eq[slot] = one;
  if (old && !carry(old)) floor.push({ x: player.x, y: player.y, it: old, seen: true });
  const verb = slot === "weapon" ? "You are wielding " : slot === "bow" ? "You are shooting with " : slot === "light" ? "Your light source is " : "You are wearing ";
  // a ring or amulet whose effect you can feel at once (a stat, speed, armour, aim) shows what it is
  if ((K.cat === "ring" || K.cat === "amulet") && (K.pstat || K.pspeed || K.pac || K.phit || K.pdam || K.pinfra)){ one.id = true; learn(one, true); }
  say(verb + nameOf(one) + ".");
  if (one.cursed){ say("Oops! It feels deathly cold."); if (!one.id) one.sense = "cursed"; }
  recalc();
  return true;
}
function takeOff(slot){
  const it = player.eq[slot]; if (!it) return false;
  if (it.cursed){ say("You cannot remove " + nameOf(it) + ": it is cursed!"); if (!it.id) it.sense = "cursed"; return false; }
  if (player.inv.length >= 22){ say("You have no room in your pack."); return false; }
  player.eq[slot] = null; carry(it); say("You take off " + nameOf(it) + "."); recalc(); return true;
}
function useDevice(it){
  const K = ITEM[it.k], verb = { wand: "Aim", staff: "Use", rod: "Zap" }[K.cat];
  if (K.cat === "rod" && it.timeout > 0){ say("The rod is still charging."); return false; }
  if (K.cat !== "rod" && it.charges <= 0){ say("It has no charges left."); return true; }
  const fail = Math.max(5, Math.min(75, 35 + K.depth - skillOf(player, "device") * 0.5));
  const go = (tx, ty) => {
    if (rng.int(100) < fail){ say("You failed to use it properly."); return true; }
    if (K.cat === "rod") it.timeout = K.recharge; else it.charges--;
    learn(it, FX[K.effect]({ K, it, tx, ty }));
    return true;
  };
  if (K.aim){ aim(verb + " " + nameOf({ ...it, n: 1 }) + ".", go); return false; }
  return go();
}

/* ---------- effects: what potions, scrolls, mushrooms, wands, staffs and rods do ---------- */
// Each returns true when the player can tell what happened, which teaches them the item's kind.
const ELEM_RGB = { fire: [1.0, 0.45, 0.15], cold: [0.5, 0.75, 1.0], elec: [0.8, 0.8, 1.2], acid: [0.5, 1.0, 0.3], poison: [0.5, 0.9, 0.3], arcane: [0.8, 0.6, 1.0], drain: [0.6, 0.25, 0.8], light: [1.0, 1.0, 0.75] };
const TIMERS = { fast: ["You feel yourself moving faster!", "You feel yourself slow down."], hero: ["You feel like a hero!", "The heroism wears off."],
  berserk: ["You feel a terrible rage!", "You feel less violent."], bless: ["You feel righteous!", "The prayer has expired."],
  resFire: ["You feel safe from heat.", "You feel less safe from heat."], resCold: ["You feel safe from cold.", "You feel less safe from cold."],
  infra: ["Your eyes begin to tingle.", "Your eyes stop tingling."], protEvil: ["You feel safe from evil!", "You no longer feel safe from evil."], poison: ["You are poisoned!", "You are no longer poisoned."],
  confused: ["You are confused!", "You feel less confused now."], blind: ["You are blind!", "You can see again."], asleep: ["You fall asleep.", "You wake up."] };
function setTimer(k, n){ const was = player.t[k] > 0; player.t[k] = Math.max(player.t[k] || 0, n); if (!was) say(TIMERS[k][0]); recalc(); return true; }
function clearTimer(k){ if (!(player.t[k] > 0)) return false; player.t[k] = 0; say(TIMERS[k][1]); recalc(); return true; }
const resists = m => rng.int(100) < 10 + 3 * m.K.depth;   // monsters save against sleep, slowing, confusion and fear
function hurtMon(m, dmg, elem, msg, delay){
  if (elem === "drain" && m.K.undead){ say(cap(theName(m)) + " is unaffected."); return false; }
  if (elem && (m.K.res || []).includes(elem)){ dmg = Math.ceil(dmg / 3); msg += " It resists a lot."; }
  if (elem === "light" && m.K.undead){ dmg *= 2; msg += " It burns!"; }   // holy light is twice as hard on the undead
  return damage(m, dmg, msg, delay);
}
function missile(path, elem, speed = 40){   // the visible flight of a bolt, and its flash where it stops
  if (!path.length) return 0;
  const rgb = ELEM_RGB[elem] || ELEM_RGB.arcane, end = path[path.length - 1], delay = path.length / speed;
  shots.push({ path, t: 0, speed, glyph: elem === "elec" ? "~" : "*", rgb: rgb.map(v => v * 1.8), light: rgb });
  later.push({ t: delay, fn: () => { flashes.push({ x: end[0], y: end[1], t: 0.35, t0: 0.35, rgb }); burst(end[0], end[1], rgb, 3); } });
  return delay;
}
function lineToWall(tx, ty, range){ const out = []; for (const c of line(player.x, player.y, tx, ty, range)){ if (blocks(c[0], c[1])) return { path: out, wall: c }; out.push(c); } return { path: out, wall: null }; }
function mapAround(r){
  for (let y = Math.max(1, player.y - r); y < Math.min(MH - 1, player.y + r); y++) for (let x = Math.max(1, player.x - r); x < Math.min(MW - 1, player.x + r); x++){
    const i = idx(x, y), t = L.tiles[i];
    if (!opaque(t) || t === T.DOOR) mem[i] = 1;
    else for (const d of [1, -1, MW, -MW, MW + 1, MW - 1, -MW + 1, -MW - 1]) if (!opaque(L.tiles[i + d])){ mem[i] = 1; break; }
  }
}
function teleportPlayer(range){
  for (let tries = 0; tries < 800; tries++){
    const x = player.x + rng.range(-range, range), y = player.y + rng.range(-range, range);
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || !passable(L.tiles[idx(x, y)]) || monAt(x, y) || dist(x, y, player.x, player.y) < range / 3) continue;
    player.x = x; player.y = y; centerCamera(true); return true;
  }
  return false;
}
function summonNear(pool, n){
  let made = 0;
  for (let k = 0; k < n && pool.length; k++){
    const K = rng.pick(pool);
    for (let tries = 0; tries < 20; tries++){
      const x = player.x + rng.range(-3, 3), y = player.y + rng.range(-3, 3);
      if (!passable(L.tiles[idx(x, y)]) || monAt(x, y)) continue;
      const hp = rng.dice(K.hp); mons.push({ K, x, y, hp, mhp: hp, energy: 0, speed: K.speed, sleep: 0, seen: false }); made++; break;
    }
  }
  return made;
}
function lightCells(cells){ for (const i of cells){ L.lit[i] = 1; roomLight[3 * i] = ROOM_RGB[0]; roomLight[3 * i + 1] = ROOM_RGB[1]; roomLight[3 * i + 2] = ROOM_RGB[2]; } }
function roomCells(){   // the room you stand in (with its walls), or the cells around you in a corridor
  const id = L.room[idx(player.x, player.y)], out = [];
  if (id >= 0) for (let i = 0; i < MW * MH; i++) if (L.room[i] === id) out.push(i);
  for (let y = player.y - 2; y <= player.y + 2; y++) for (let x = player.x - 2; x <= player.x + 2; x++) out.push(idx(x, y));
  return out;
}
function statusBolt(c, what){   // a bolt that puts a monster to sleep, slows, confuses or scares it
  const { path, m } = flight(c.tx, c.ty, 18), delay = missile(path, "arcane");
  if (!m) return false;
  if (resists(m)){ say(cap(theName(m)) + " is unaffected."); return true; }
  if (what === "sleep"){ m.sleep = 500; say(cap(theName(m)) + " falls asleep."); }
  if (what === "slow"){ m.slow = 20; say(cap(theName(m)) + " starts moving slower."); }
  if (what === "confuse"){ m.conf = 10 + rng.int(10); say(cap(theName(m)) + " looks confused."); }
  if (what === "scare"){ m.afraid = 20; say(cap(theName(m)) + " flees in terror!"); }
  return true;
}
function allInView(what){
  let n = 0;
  for (const m of mons) if (m.K && seesMon(m) && !resists(m)){ n++; if (what === "sleep") m.sleep = 500; else m.slow = 20; }
  if (n) say(what === "sleep" ? "The monsters around you fall asleep." : "The monsters around you slow down.");
  return n > 0;
}
const FX = {
  heal: c => { player.hp = Math.min(player.mhp, player.hp + rng.dice(c.K.dice) + (c.power || 0)); say(player.hp >= player.mhp ? "You feel very good." : "You feel better."); return true; },
  healFull: () => { player.hp = player.mhp; for (const k of ["poison", "confused", "blind"]) clearTimer(k); say("You feel wonderful!"); return true; },
  mana: c => { player.mana = Math.min(player.mmana, player.mana + c.K.amount); say("Your mind feels clearer."); return true; },
  fast: () => setTimer("fast", 20 + rng.int(25)), hero: () => setTimer("hero", 25 + rng.int(25)),
  berserk: () => { player.hp = Math.min(player.mhp, player.hp + Math.ceil(player.mhp * 0.3)); return setTimer("berserk", 25 + rng.int(25)); },
  resFire: () => setTimer("resFire", 20 + rng.int(20)), resCold: () => setTimer("resCold", 20 + rng.int(20)), infra: () => setTimer("infra", 100 + rng.int(100)),
  cure: () => { let any = false; for (const k of ["poison", "confused", "blind"]) any = clearTimer(k) || any; if (!any) say("You feel healthy."); return true; },
  curePoison: () => clearTimer("poison"),
  sleep: () => { if (player.bonus.freeAct){ say("You feel drowsy for a moment, but it passes."); return true; } return setTimer("asleep", 4 + rng.int(4)); },
  poison: () => setTimer("poison", 10 + rng.int(10)), confuse: () => setTimer("confused", 10 + rng.int(10)), blind: () => setTimer("blind", 30 + rng.int(30)),
  salt: () => { say("The potion makes you vomit!"); player.food = Math.min(player.food, 1500); clearTimer("poison"); return true; },
  gainStat: c => { const k = c.K.stat; if (player.base[k] >= 25){ say("You feel no different."); return true; } player.base[k]++; recalc();
    say("You feel " + { str: "stronger", int: "smarter", wis: "wiser", dex: "more nimble", con: "healthier", cha: "more charming" }[k] + "!"); return true; },
  enlight: () => { mapAround(250); for (const f of floor) f.seen = true; say("You suddenly know the whole level."); return true; },
  exp: () => { gainExp(Math.max(10, expNeeded(player, player.lvl + 1) - player.exp)); say("You feel more experienced."); return true; },
  clairvoyance: () => { mapAround(60); FX.detectObj(); say("Images of the level flood your mind."); return true; },
  identify: () => {
    const unknown = [...player.inv, ...SLOTS.map(s => player.eq[s]).filter(Boolean)].filter(it => !it.id || !kindKnown(ITEM[it.k], player.know));
    if (!unknown.length){ say("You have nothing to identify."); return true; }
    say("This is a scroll of Identify.");
    chooseItem("IDENTIFY WHICH?", it => unknown.includes(it), it => { it.id = true; delete it.sense; player.know.known[it.k] = true; say("It is " + nameOf(it) + "."); });
    return true;
  },
  removeCurse: () => { let any = false; for (const s of SLOTS){ const it = player.eq[s]; if (it && it.cursed && !it.art){ it.cursed = false; if (it.sense === "cursed") delete it.sense; any = true; } }
    say(any ? "You feel as if someone is watching over you." : "You feel no different."); return any; },
  lightArea: () => { lightCells(roomCells()); flashes.push({ x: player.x, y: player.y, t: 0.5, t0: 0.5, rgb: ELEM_RGB.light }); say("You are surrounded by light."); return true; },
  darkness: () => { for (const i of roomCells()){ L.lit[i] = 0; roomLight[3 * i] = roomLight[3 * i + 1] = roomLight[3 * i + 2] = 0; } say("Darkness surrounds you."); setTimer("blind", 3 + rng.int(5)); return true; },
  map: () => { mapAround(30); say("You sense the dungeon around you."); return true; },
  detectObj: () => { let n = 0; for (const f of floor) if (dist(f.x, f.y, player.x, player.y) <= 30){ f.seen = true; n++; } say(n ? "You sense the presence of objects!" : "You sense no objects."); return n > 0; },
  detectMon: () => { let n = 0; for (const m of mons) if (m.K && dist(m.x, m.y, player.x, player.y) <= 30){ m.det = turnNo + 1; n++; } say(n ? "You sense the presence of monsters!" : "You sense no monsters."); return n > 0; },
  detection: () => { FX.detectMon(); FX.detectObj(); return true; },
  phase: () => teleportPlayer(10), teleport: () => teleportPlayer(60),
  teleLevel: () => { const up = depth >= 1 && rng.chance(0.5); say(up ? "You rise up through the ceiling." : "You sink through the floor."); pendingLevel = depth + (up ? -1 : 1); return true; },
  deepDescent: () => { say("The floor opens beneath you!"); pendingLevel = depth + 2; return true; },
  recall: () => {
    if (player.recall > 0){ player.recall = 0; say("A tension leaves the air around you."); return true; }
    if (depth === 0 && player.maxDepth < 1){ say("The air stirs, but there is nowhere for it to take you yet."); return true; }
    player.recall = 15 + rng.int(20); say("The air about you becomes charged..."); return true;
  },
  enchHit: () => enchant(weapon(), "tohit"), enchDam: () => enchant(weapon(), "todam"),
  enchAc: () => { const worn = ["body", "shield", "cloak", "head", "hands", "feet"].map(s => player.eq[s]).filter(Boolean); return enchant(worn.length ? rng.pick(worn) : null, "toac"); },
  bless: () => setTimer("bless", 12 + rng.int(12)), chant: () => setTimer("bless", 24 + rng.int(24)),
  satisfy: () => { player.food = Math.max(player.food, 10000); say("You feel full."); return true; },
  monConf: () => { player.t.confHit = 1; say("Your hands begin to glow."); return true; },
  slumber: () => { let n = 0; for (const m of mons) if (m.K && dist(m.x, m.y, player.x, player.y) <= 1 && !resists(m)){ m.sleep = 500; n++; } if (n) say("The monsters next to you fall asleep."); return n > 0; },
  aggravate: () => { for (const m of mons) if (m.K) m.sleep = 0; say("There is a high-pitched humming noise."); return true; },
  curseArmour: () => { const worn = ["body", "shield", "cloak", "head", "hands", "feet"].filter(s => player.eq[s] && !player.eq[s].art); if (!worn.length) return false;
    const it = player.eq[rng.pick(worn)]; it.cursed = true; it.toac = -(1 + rng.int(5)); delete it.ego; say("Your " + ITEM[it.k].name.toLowerCase() + " glows black!"); recalc(); return true; },
  summonUndead: () => summonNear(MONSTERS.filter(K => K.undead && K.depth <= depth + 5), 1 + rng.int(3)) > 0 && (say("Cold, dead things appear around you!"), true),
  summon: () => summonNear(MONSTERS.filter(K => K.depth <= depth + 2), 2 + rng.int(3)) > 0 && (say("Monsters appear around you!"), true),
  bolt: c => { const { path, m } = flight(c.tx, c.ty, 18), delay = missile(path, c.K.elem); if (m) hurtMon(m, rng.dice(c.K.dice) + ((c.power || 0) >> 1), c.K.elem, "The bolt hits " + theName(m) + ".", delay); return true; },
  beam: c => { const { path } = lineToWall(c.tx, c.ty, 18), delay = missile(path, c.K.elem, 60);
    for (const [x, y] of path){ const m = monAt(x, y); if (m) hurtMon(m, rng.dice(c.K.dice) + ((c.power || 0) >> 1), c.K.elem, "The lightning strikes " + theName(m) + ".", delay); } return true; },
  ball: c => {
    const { path } = flight(c.tx, c.ty, 18), end = path.length ? path[path.length - 1] : [player.x, player.y], delay = missile(path, c.K.elem), rgb = ELEM_RGB[c.K.elem];
    later.push({ t: delay, fn: () => { flashes.push({ x: end[0], y: end[1], t: 0.6, t0: 0.6, rgb: rgb.map(v => v * 1.6) }); burst(end[0], end[1], rgb, 10);
      if (screen) world.forces.push({ x: (end[0] - cam.x + 0.5) * screen.cw, y: (end[1] - cam.y + VY + 0.5) * screen.ch, radius: screen.ch * 6, strength: world.h * 12, t: 0.08 }); } });
    for (const m of [...mons]) if (m.K && dist(m.x, m.y, end[0], end[1]) <= c.K.r) hurtMon(m, Math.floor((c.K.dmg + (c.power || 0)) / (1 + dist(m.x, m.y, end[0], end[1]))), c.K.elem, "The blast engulfs " + theName(m) + ".", delay);
    return true;
  },
  sleepMon: c => statusBolt(c, "sleep"), slowMon: c => statusBolt(c, "slow"), confMon: c => statusBolt(c, "confuse"), scareMon: c => statusBolt(c, "scare"),
  sleepAll: () => allInView("sleep"), slowAll: () => allInView("slow"),
  beamLight: c => { const { path } = lineToWall(c.tx, c.ty, 25); lightCells(path.map(([x, y]) => idx(x, y))); missile(path, "light", 80); say("A line of light appears."); return true; },
  stoneMud: c => {
    const { path, wall } = lineToWall(c.tx, c.ty, 25); missile(path, "acid", 60);
    if (!wall) return false;
    const i = idx(wall[0], wall[1]);
    if (L.tiles[i] !== T.WALL){ say("The wall resists."); return true; }
    L.tiles[i] = T.FLOOR; say("The wall turns into mud!");
    later.push({ t: path.length / 60, fn: () => { burst(wall[0], wall[1], [0.55, 0.5, 0.45], 9); rebuildTerrain(); } });
    return true;
  }
};
// Moves a monster to a far, empty spot on the level.
function sendAway(m){
  for (let tries = 0; tries < 200; tries++){
    const i = rng.pick(rng.pick(L.rooms).cells), x = i % MW, y = Math.floor(i / MW);
    if (passable(L.tiles[i]) && !monAt(x, y) && dist(x, y, player.x, player.y) > 20){ m.x = x; m.y = y; m.sleep = 0; return true; }
  }
  return false;
}
// Walls fall and floors heave within r cells: the stone breaks into rubble that tumbles (physics), then settles.
function shake(r, wipe){
  let fallen = 0;
  for (let y = player.y - r; y <= player.y + r; y++) for (let x = player.x - r; x <= player.x + r; x++){
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || Math.hypot(x - player.x, (y - player.y) * 1.6) > r || (x === player.x && y === player.y)) continue;
    const i = idx(x, y), t = L.tiles[i];
    if (t === T.EDGE || t === T.DOWN || t === T.UP || t === T.SHOP) continue;
    const m = monAt(x, y);
    if (wipe){   // Unravel: everything in reach is torn apart
      if (m && m.K) mons.splice(mons.indexOf(m), 1);
      floor = floor.filter(f => f.x !== x || f.y !== y);
      L.tiles[i] = rng.chance(0.5) ? T.WALL : T.FLOOR; L.lit[i] = 0; roomLight[3 * i] = roomLight[3 * i + 1] = roomLight[3 * i + 2] = 0; mem[i] = 0;
    } else {
      if (!rng.chance(0.3) || m || itemsAt(x, y).length) continue;
      L.tiles[i] = opaque(t) ? T.FLOOR : T.WALL;
    }
    if (inFov[i] === turnNo && fallen++ < 30) later.push({ t: rng.next() * 0.3, fn: () => burst(x, y, [0.55, 0.5, 0.45], 3) });
  }
  if (screen) world.forces.push({ x: (player.x - cam.x + 0.5) * screen.cw, y: (player.y - cam.y + VY + 0.5) * screen.ch, radius: screen.ch * r * 2, strength: world.h * 6, t: 0.1 });
  rebuildTerrain();
}
Object.assign(FX, {
  recharge: () => {
    chooseItem("RECHARGE WHICH?", it => ITEM[it.k].cat === "wand" || ITEM[it.k].cat === "staff", it => {
      if (rng.chance(it.charges > 8 ? 0.35 : 0.08)){ takeOne(it); say("There is a bright flash. It has exploded!"); burst(player.x, player.y, [1.2, 0.9, 0.5], 8); }
      else { it.charges += rng.range(2, 4 + Math.floor(player.lvl / 5)); say("It glows for a moment."); }
    }, "You have nothing to recharge.");
    return true;
  },
  teleOther: c => { const { path, m } = flight(c.tx, c.ty, 18); missile(path, "arcane"); if (!m) return false; if (sendAway(m)) say(cap(theName(m)) + " disappears!"); return true; },
  wardElements: () => { setTimer("resFire", 20 + rng.int(20)); setTimer("resCold", 20 + rng.int(20)); return true; },
  detectEvil: () => { let n = 0; for (const m of mons) if (m.K && m.K.evil && dist(m.x, m.y, player.x, player.y) <= 30){ m.det = turnNo + 1; n++; } say(n ? "You sense the presence of evil!" : "You sense no evil."); return true; },
  refuel: () => {
    const lt = player.eq.light;
    if (!lt){ say("You have no light to tend."); return true; }
    if (lt.fuel === undefined){ say("Your light needs no tending."); return true; }
    const K = ITEM[lt.k]; lt.fuel = K.maxFuel ? Math.min(K.maxFuel, lt.fuel + 7500) : K.fuel;
    flashes.push({ x: player.x, y: player.y, t: 0.5, t0: 0.5, rgb: TORCH_RGB }); say("Your light burns bright and fresh again."); return true;
  },
  dispel: c => { let n = 0; flashes.push({ x: player.x, y: player.y, t: 0.5, t0: 0.5, rgb: ELEM_RGB.light });
    for (const m of [...mons]) if (m.K && seesMon(m) && (!c.K.flag || m.K[c.K.flag])){ n++; hurtMon(m, rng.dice(c.K.dice), null, cap(theName(m)) + " shudders."); }
    if (!n) say("Nothing in sight answers to it."); return true; },
  protEvil: () => setTimer("protEvil", 25 + player.lvl * 2),
  banish: () => { let n = 0; for (const m of mons) if (m.K && m.K.evil && seesMon(m) && sendAway(m)) n++; say(n ? "The evil around you is swept away!" : "There is no evil in sight."); return true; },
  avatar: () => { FX.healFull(); setTimer("fast", 20 + rng.int(20)); setTimer("hero", 30); setTimer("bless", 30); setTimer("resFire", 30); setTimer("resCold", 30); say("The unbroken flame burns within you!"); return true; },
  earthquake: () => { shake(8, false); say("The ground shakes, and the walls come down!"); return true; },
  destruction: () => { shake(12, true); say("There is a searing blast of light, and the dungeon tears apart!"); setTimer("blind", 5 + rng.int(5)); return true; }
});
function enchant(it, field){
  if (!it){ say("You have nothing to enchant."); return true; }
  const v = it[field] || 0, chance = v < 0 ? 100 : Math.max(10, 100 - v * 12);
  if (rng.int(100) < chance && !it.art){
    it[field] = v + 1; if (it.cursed && rng.chance(0.5)){ it.cursed = false; if (it.sense === "cursed") delete it.sense; }
    say("Your " + ITEM[it.k].name.toLowerCase() + " glows faintly."); recalc();
  } else say("The enchantment fails.");
  return true;
}

/* ---------- aiming: bolts and thrown things fly along a line until they hit a wall or a monster ---------- */
let aiming = null;   // while set, the next direction (or "nearest") fires it
function line(x0, y0, x1, y1, range){
  const out = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  let err = dx + dy, x = x0, y = y0;
  while (out.length < range){
    if (x === x1 && y === y1) break;
    const e2 = 2 * err; if (e2 >= dy){ err += dy; x += sx; } if (e2 <= dx){ err += dx; y += sy; }
    out.push([x, y]);
  }
  return out;
}
function flight(tx, ty, range){   // the cells a missile passes, and the monster it reaches first
  const path = [];
  for (const [x, y] of line(player.x, player.y, tx, ty, range)){
    if (blocks(x, y)) break;
    path.push([x, y]);
    const m = monAt(x, y); if (m) return { path, m };
  }
  return { path, m: null };
}
function nearestTarget(){
  let best = null;
  for (const m of mons) if (m.K && seesMon(m) && (!best || dist(m.x, m.y, player.x, player.y) < dist(best.x, best.y, player.x, player.y))) best = m;
  return best;
}
function aim(prompt, fn){ aiming = fn; oldMsgs = []; msgs = []; say(prompt + " Direction? (" + (pad.touch ? "D-pad, A nearest, B cancel" : "a direction key, ' or t for nearest, Esc") + ")"); }
function aimAt(dx, dy){ const f = aiming; aiming = null; act(() => f(player.x + dx * 20, player.y + dy * 20)); }
function aimNearest(){
  if (!aiming) return;
  const m = nearestTarget(); if (!m){ aiming = null; oldMsgs = []; msgs = []; say("There is nothing in sight to aim at."); return; }
  const f = aiming; aiming = null; act(() => f(m.x, m.y));
}
function throwItem(it){
  const K = ITEM[it.k];
  aim("Throw " + nameOf(it, 1) + ".", (tx, ty) => {
    const { path, m } = flight(tx, ty, 10), one = { ...it, n: 1 }, rgb = itemRgb(one, player.know);
    takeOne(it); recalc();
    if (!path.length){ dropAt(idx(player.x, player.y), one); say("It drops at your feet."); return true; }
    shots.push({ path, t: 0, speed: 35, glyph: K.glyph, rgb });
    const delay = path.length / 35, end = path[path.length - 1];
    let lands = K.cat !== "potion";
    if (m){
      if (rng.int(100) < hitChance(skillOf(player, "shoot"), m.K.ac, -2 * path.length + (K.throw ? 10 : 0))){
        const dmg = Math.max(1, rng.dice(K.dice || "1d1") + (one.todam || 0) + (K.throw ? Math.max(0, statMod(player.stats.dex)) : 0));
        damage(m, dmg, "The " + K.name.toLowerCase() + " hits " + theName(m) + ".", delay);
        if (K.throw && rng.chance(0.25)) lands = false;   // darts sometimes break
      } else say("The " + K.name.toLowerCase() + " misses " + theName(m) + ".");
    }
    if (K.cat === "potion"){ say("The potion shatters."); later.push({ t: delay, fn: () => burst(end[0], end[1], rgb, 8) }); }   // glass skitters across the floor
    if (lands) dropAt(idx(end[0], end[1]), one);
    return true;
  });
}
function fireAmmo(it){
  const bow = player.eq.bow, K = ITEM[it.k], B = ITEM[bow.k];
  aim("Fire " + nameOf(it, 1) + ".", (tx, ty) => {
    const { path, m } = flight(tx, ty, 10 + B.mult * 5), one = { ...it, n: 1 }, BP = itemPowers(bow);
    takeOne(it); recalc();
    if (!path.length){ dropAt(idx(player.x, player.y), one); return true; }
    shots.push({ path, t: 0, speed: 55, glyph: K.glyph, rgb: K.rgb });
    const delay = path.length / 55, end = path[path.length - 1];
    let lands = true;
    if (m){
      if (rng.int(100) < hitChance(skillOf(player, "shoot") + 3 * (BP.hit + (one.tohit || 0) + player.bonus.hit), m.K.ac, -path.length)){
        damage(m, Math.max(1, (rng.dice(K.dice) + (one.todam || 0) + BP.dam) * B.mult), "The " + K.name.toLowerCase() + " hits " + theName(m) + ".", delay);
        if (rng.chance(0.35)) lands = false;
      } else { say("The " + K.name.toLowerCase() + " misses " + theName(m) + "."); if (rng.chance(0.1)) lands = false; }
    }
    if (lands) dropAt(idx(end[0], end[1]), one);
    return true;
  });
}
function fire(){
  const bow = player.eq.bow;
  if (!bow){ say("You have nothing to fire with."); return; }
  const ammo = ITEM[bow.k].ammo;
  chooseItem("FIRE WHICH?", it => ITEM[it.k].ammo === ammo && ITEM[it.k].cat === "ammo", fireAmmo, "You have nothing to fire from your " + ITEM[bow.k].name.toLowerCase() + ".");
}
const books = () => new Set(player.inv.filter(it => ITEM[it.k].cat === "book").map(it => it.k));
const realmWord = () => cls().realm === "holy" ? "prayer" : "spell";
function castMenu(){
  const C = cls();
  if (!C.realm){ say("You know no spells or prayers."); return; }
  const known = SPELLS.filter(S => player.spells.includes(S.id));
  if (!known.length){ oldMsgs = []; msgs = []; say("You have not learned any " + realmWord() + "s yet." + (learnable(player, books()).length ? " Press S to study." : "")); return; }
  const have = books();
  openList((C.realm === "holy" ? "PRAY" : "CAST") + "   MANA " + player.mana + "/" + player.mmana, known.map(S => ({
    label: S.name.padEnd(20) + String(S.mana).padStart(3) + " MP" + String(spellFail(S, player)).padStart(4) + "% fail" + (have.has(bookOf(S)) ? "" : "  (no book)"),
    select: done(() => castSpell(S)) })), "A SPELL NEEDS ITS BOOK IN YOUR PACK");
}
function castSpell(S){
  const holy = S.realm === "holy";
  if (!books().has(bookOf(S))){ say("You need the " + ITEM[bookOf(S)].name + " to " + (holy ? "pray " : "cast ") + S.name + "."); return false; }
  if (player.mana < S.mana){ say("You do not have enough mana to " + (holy ? "pray " : "cast ") + S.name + "."); return false; }
  if (player.t.blind || player.t.confused){ say(player.t.blind ? "You cannot see to read your book!" : "You are too confused."); return false; }
  const go = (tx, ty) => {
    player.mana -= S.mana;
    if (rng.int(100) < spellFail(S, player)){ say(holy ? "You lose your concentration." : "You failed to get the spell off!"); return true; }
    // a spell grows with its caster: power is added to bolts, beams, balls and healing (items stay as they are)
    FX[S.fx]({ K: S, tx, ty, power: player.lvl });
    if (S.also) FX[S.also]({ K: S, tx, ty, power: player.lvl });
    if (!player.cast.includes(S.id)){ player.cast.push(S.id); gainExp(spellLevel(S, cls()) * 2); }   // the first casting teaches you something
    return true;
  };
  if (S.aim) aim((holy ? "Pray " : "Cast ") + S.name + ".", go);
  else act(() => go());
  return false;
}
// Studying: an arcane caster chooses the spell; a holy one is granted a prayer, as in Moria.
function study(){
  const C = cls();
  oldMsgs = []; msgs = [];
  if (!C.realm){ say("You cannot learn magic."); return; }
  const can = learnable(player, books());
  if (!can.length){ say("You have nothing new to " + (C.realm === "holy" ? "pray for" : "learn") + " right now."); return; }
  const learn = S => { player.spells.push(S.id); say((C.realm === "holy" ? "You have been granted the prayer of " : "You have learned the spell of ") + S.name + ": " + S.desc + "."); };
  if (C.realm === "holy") return learn(rng.pick(can));
  openList("STUDY WHICH SPELL?", can.map(S => ({ label: S.name.padEnd(20) + " " + S.desc.slice(0, 30), select: done(() => learn(S)) })));
}

/* ---------- a turn: the player acts, then everyone faster or as fast acts until it is the player's turn again ---------- */
function act(fn){
  if (state !== "play") return false;
  oldMsgs = msgs.length ? msgs : oldMsgs; msgs = [];
  const r = fn();
  if (!r) return false;
  if (r === "level") return true;
  const go = () => { if (pendingLevel === null || state !== "play") return false; const d = Math.max(0, pendingLevel); pendingLevel = null; newLevel(d); return true; };
  if (go()) return true;
  endTurn();
  while (player.t.asleep > 0 && state === "play") endTurn();   // asleep: the monsters keep moving
  go();   // Word of Recall takes effect at the end of a turn
  return true;
}
function endTurn(){
  player.energy -= 100; player.turns++;
  everyTurn();
  for (let guard = 0; guard < 500 && state === "play"; guard++){
    const a = nextActor(mons);
    if (a === player) break;
    monsterTurn(a); a.energy -= 100;
  }
  if (state !== "play") return;
  if (rng.int(300) === 0) spawnMonster(true);   // the dungeon is never quite empty
  centerCamera(false); updateSight();
  for (const m of mons) if (m.K){ const v = seesMon(m); if (v && !m.seen) disturbed = true; m.seen = v; }
}
let disturbed = false, pendingLevel = null;
function everyTurn(){
  // food and light burn away, and wounds and mana slowly come back
  if (!player.bonus.slowDigest || player.turns % 2) player.food--;
  if (player.food === 2000) say("You are getting hungry.");
  if (player.food === 1000) say("You are getting weak from hunger.");
  if (player.food === 0) say("You are starving!");
  if (player.food < 0 && player.food % 10 === 0) hurt(1, "starvation");
  if (player.t.poison > 0) hurt(1, "poison");
  if (player.recall > 0 && --player.recall === 0){
    pendingLevel = depth > 0 ? 0 : Math.max(1, player.maxDepth);
    say(depth > 0 ? "You feel yourself yanked upwards!" : "You feel yourself yanked downwards!");
  }
  if (depth === 0 && player.turns % 25 === 0){   // the sun moves; night falls; morning comes
    lightTown();
    if (isDay() !== wasDay){ wasDay = isDay(); say(wasDay ? "The sun rises over Lanternhollow." : "Night falls, and the lamps are lit."); }
  }
  for (const k of Object.keys(TIMERS)) if (player.t[k] > 0 && --player.t[k] === 0){ say(TIMERS[k][1]); recalc(); }
  for (const it of player.inv) if (it.timeout > 0) it.timeout--;   // rods recharge
  if (player.bonus.teleportCurse && rng.int(80) === 0 && teleportPlayer(40)){ say("You feel yourself yanked sideways!");
    for (const s of ["ring1", "ring2"]) if (player.eq[s] && ITEM[player.eq[s].k].teleportCurse) learn(player.eq[s], true); }
  if (player.turns % 100 === 0) for (const it of [...player.inv, ...SLOTS.map(s => player.eq[s]).filter(Boolean)]) sense(it, skillOf(player, "notice") / 3);
  const lt = player.eq.light;
  if (lt && lt.fuel > 0){
    lt.fuel--;
    if (lt.fuel === 500) say("Your light is growing faint.");
    if (lt.fuel === 0) say("Your light has gone out!");
  }
  const k = resting ? 2 : 1;
  if (player.food > 1000 && player.hp < player.mhp){
    player.regen += (0.03 + player.mhp * 0.004) * k * (race().regen || 1) * (player.bonus.regen ? 2 : 1);
    while (player.regen >= 1 && player.hp < player.mhp){ player.hp++; player.regen--; }
  }
  if (player.mana < player.mmana){
    player.mregen += (0.02 + player.mmana * 0.008) * k;
    while (player.mregen >= 1 && player.mana < player.mmana){ player.mana++; player.mregen--; }
  }
}
function hurt(n, by){
  player.hp -= n; disturbed = true;
  if (player.hp <= 0){ killer = by; die(); }
}
function die(){
  state = "dead"; stateT = 0; aiming = null;
  const p = player, entry = { score: Math.floor(p.exp) + 100 * p.maxDepth, name: p.name, race: race().name, cls: cls().name, lvl: p.lvl, depth: feet(p.maxDepth), killer };
  tomb = { ...entry, best: scores.add(entry).rank === 0, at: depthName(depth) };
  say("You die.");
}
function monsterTurn(m){
  const K = m.K, d = dist(m.x, m.y, player.x, player.y);
  if (m.sleep > 0){   // noise nearby wakes it; a stealthy character makes less of it
    const st = skillOf(player, "stealth");
    if (d < 16 - st) m.sleep -= rng.range(0, Math.max(1, 6 - st));
    return;
  }
  m.speed = K.speed - (m.slow > 0 ? 10 : 0);
  if (m.slow > 0) m.slow--;
  if (K.still){ if (d <= 1) monsterAttack(m); return; }
  if (m.conf > 0){ m.conf--; const [dx, dy] = DIRS[rng.pick([1, 2, 3, 4, 6, 7, 8, 9])]; return step(m, m.x + dx, m.y + dy); }
  if (d <= 1 && !m.afraid) return monsterAttack(m);
  const seesYou = inFov[idx(m.x, m.y)] === turnNo && d < 20;   // sight is symmetric: if you could see it, it can see you
  let tx = player.x, ty = player.y, away = false;
  if (m.afraid){ m.afraid--; away = true; }
  if ((K.erratic && rng.chance(K.erratic)) || (!seesYou && d > 6)){   // wander
    const [dx, dy] = DIRS[rng.pick([1, 2, 3, 4, 6, 7, 8, 9])]; tx = m.x + dx; ty = m.y + dy;
    return step(m, tx, ty);
  }
  // step to the neighbour that gets closest to (or furthest from) the player
  let best = null, bestD = away ? -1 : 1e9;
  for (const k of [1, 2, 3, 4, 6, 7, 8, 9]){
    const [dx, dy] = DIRS[k], x = m.x + dx, y = m.y + dy, t = L.tiles[idx(x, y)];
    if (!(passable(t) || t === T.DOOR) || (monAt(x, y) && !(x === player.x && y === player.y))) continue;
    const nd = Math.hypot(x - tx, y - ty);
    if (away ? nd > bestD : nd < bestD){ bestD = nd; best = [x, y]; }
  }
  if (best) step(m, best[0], best[1]);
}
function step(m, x, y){
  const i = idx(x, y), t = L.tiles[i];
  if (x === player.x && y === player.y) return m.afraid ? null : monsterAttack(m);
  if (t === T.DOOR){ L.tiles[i] = T.OPEN; if (visible(i)) say("A door opens."); return; }
  if (!passable(t) || monAt(x, y)) return;
  m.x = x; m.y = y;
}
function monsterAttack(m){
  const K = m.K, name = seesMon(m) ? "The " + K.name : "It";
  for (const [dice, verb, effect] of K.blows){
    if (state !== "play") return;
    if (player.t.protEvil && K.evil && rng.int(100) < 50 + player.lvl - K.depth){ say(name + " is repelled."); continue; }
    if (rng.int(100) < Math.max(15, Math.min(95, 60 + 2 * K.depth - armour()))){
      if (effect === "steal"){   // a thief takes some gold, then slips away
        if (!player.gold){ say(name + " fumbles at your empty purse."); continue; }
        const n = Math.max(1, Math.floor(player.gold * (0.1 + rng.next() * 0.15)));
        player.gold -= n; say(name + " " + verb + " you. Your purse feels " + n + " gold lighter!");
        if (seesMon(m)) say("The " + K.name + " vanishes into the crowd.");
        mons.splice(mons.indexOf(m), 1); return;
      }
      let dmg = rng.dice(dice);
      if (verb === "burns" && player.bonus.res.has("fire")){ dmg = Math.ceil(dmg / 3); say(name + " burns you, but you resist the heat."); }
      else say(name + " " + verb + (dmg ? " you." : "."));
      if (dmg) hurt(dmg, "a " + K.name);
    } else say(name + " misses you.");
  }
}

/* ---------- longer actions: running and resting stop when something happens ---------- */
let resting = false;
function run(dx, dy){
  if (state !== "play") return;
  disturbed = false;
  const open = (x, y) => passable(L.tiles[idx(x, y)]) && !monAt(x, y);
  for (let n = 0; n < 200 && state === "play" && !disturbed; n++){
    if (mons.some(m => m.K && seesMon(m) && !m.K.still)) break;
    if (!open(player.x + dx, player.y + dy)){
      // in a corridor, follow a single bend
      if (dx && dy) break;
      const turns = (dx ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]).filter(([a, b]) => open(player.x + a, player.y + b));
      if (turns.length !== 1) break;
      [dx, dy] = turns[0];
    }
    if (!act(() => tryMove(dx, dy))) break;
    const t = L.tiles[idx(player.x, player.y)];
    if (t === T.DOWN || t === T.UP || itemsAt(player.x, player.y).length) break;
    let doors = 0; for (const k of [1, 2, 3, 4, 6, 7, 8, 9]){ const [a, b] = DIRS[k], u = L.tiles[idx(player.x + a, player.y + b)]; if (u === T.DOOR || u === T.OPEN) doors++; }
    if (doors) break;
  }
}
function rest(){
  if (state !== "play") return;
  if (player.hp >= player.mhp && player.mana >= player.mmana){ say("You are already fully rested."); return; }
  disturbed = false; resting = true;
  for (let n = 0; n < 1000 && state === "play" && !disturbed && (player.hp < player.mhp || player.mana < player.mmana); n++){
    if (mons.some(m => m.K && seesMon(m))){ say("You cannot rest with monsters nearby."); break; }
    act(() => true);
  }
  resting = false;
}
function contextAction(){   // the touch A button: whatever makes sense here
  const t = L.tiles[idx(player.x, player.y)];
  if (t === T.DOWN || t === T.UP) return act(() => takeStairs(t === T.DOWN));
  if (t === T.SHOP) return openShop(L.shopAt[idx(player.x, player.y)]);
  if (itemsAt(player.x, player.y).length) return act(pickUp);
  act(() => true);   // otherwise wait a turn
}
function look(){
  const seen = mons.filter(m => m.K && seesMon(m));
  oldMsgs = []; msgs = [];
  if (!seen.length) say("You see no monsters.");
  for (const m of seen.slice(0, 4)) say("You see a " + m.K.name + (byHeat(m) ? " (by its body heat)" : "") + (m.sleep > 0 ? " (asleep)" : "") + ". " + m.K.desc);
}

/* ---------- a new character: race, class, stats and name ---------- */
let cr = null;
function startCreate(){
  rng = new RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  cr = { step: 0, at: 0, race: 0, cls: 0, mode: "roll", base: rollStats(rng), buy: Object.fromEntries(STATS.map(k => [k, 8])), name: randomName(rng) };
  state = "create"; aiming = null;
}
const crBase = () => cr.mode === "roll" ? cr.base : cr.buy;
const crPreview = () => { const p = { race: RACES[cr.race].id, cls: CLASSES[cr.cls].id, lvl: 1 }; p.stats = finalStats(crBase(), RACE[p.race], CLASS[p.cls]); return p; };
function crRows(){
  const next = () => { cr.step++; cr.at = cr.step === 1 ? cr.cls : 0; };
  if (cr.step === 0) return RACES.map((R, i) => ({ label: R.name, select: () => { cr.race = i; next(); } }));
  if (cr.step === 1) return CLASSES.map((C, i) => ({ label: C.name, select: () => { cr.cls = i; next(); } }));
  if (cr.step === 2){
    if (cr.mode === "roll") return [{ label: "Keep these", select: next }, { label: "Roll again", select: () => { cr.base = rollStats(rng); } }, { label: "Buy with points", select: () => { cr.mode = "buy"; cr.at = 0; } }];
    return [...STATS.map(k => ({ label: STAT_NAMES[k], adjust: d => {
      const v = cr.buy[k] + d; if (v < 8 || v > 16) return;
      const was = cr.buy[k]; cr.buy[k] = v; if (buySpent(cr.buy) > BUY_POINTS) cr.buy[k] = was;
    } })), { label: "Keep these", select: next }, { label: "Roll instead", select: () => { cr.mode = "roll"; cr.at = 0; } }];
  }
  return [{ label: "Begin the adventure", select: begin }, { label: "Another name", select: () => { cr.name = randomName(rng); } }];
}
function crBack(){ if (cr.step === 0) return toTitle(); cr.step--; cr.at = cr.step === 0 ? cr.race : cr.step === 1 ? cr.cls : 0; }
function crKey(d){ const rows = crRows(); if (d === "up") cr.at = (cr.at + rows.length - 1) % rows.length; else if (d === "down") cr.at = (cr.at + 1) % rows.length;
  else if (rows[cr.at].adjust) rows[cr.at].adjust(d === "left" ? -1 : 1); }
function crChoose(){ const r = crRows()[cr.at]; if (r.select) r.select(); else if (r.adjust) r.adjust(1); }
function begin(){
  const p = crPreview(), C = CLASS[p.cls];
  const weapon = { sellsword: "shortsword", arcanist: "dagger", lampwarden: "mace", delver: "dagger", wayfinder: "shortsword", oathknight: "mace" }[p.cls];
  player = { ...p, base: { ...p.stats }, name: cr.name, x: 0, y: 0, exp: 0, energy: 100, speed: 0, food: 5000, gold: rng.range(250, 450), regen: 0, mregen: 0,
    inv: [], eq: Object.fromEntries(SLOTS.map(s => [s, null])), t: {}, know: newKnowledge(rng), maxDepth: 0, kills: 0, turns: 0, recall: 0 };
  Object.assign(player.eq, { weapon: plainItem(weapon), body: plainItem("jerkin"), light: plainItem("torch") });
  for (const [k, n] of [["torch", 2], ["ration", 4], ["heal", 2], ...(C.realm ? [[C.realm === "holy" ? "hbook1" : "abook1", 1]] : []), ...(C.kit || [])]){ carry(plainItem(k, n)); player.know.known[k] = true; }
  player.spells = []; player.cast = [];
  for (const S of learnable(player, books())) player.spells.push(S.id);   // a caster starts knowing their first spells
  if (C.bow) player.eq.bow = plainItem(C.bow);
  recalc();
  player.mhp = player.hp = firstHp(player); player.mmana = player.mana = maxMana(player);
  log = []; msgs = []; oldMsgs = []; killer = ""; tomb = null; cr = null;
  state = "play"; stateT = 0;
  shops = newShops(rng, player.know); lastTown = 0; depth = 0;
  newLevel(0);
}
function statLine(s, k){ const m = statMod(s[k]); return k.toUpperCase() + " " + String(s[k]).padStart(2) + " (" + (m >= 0 ? "+" : "") + m + ")"; }
function drawCreate(){
  const steps = ["Choose a people", "Choose a calling", "Your strengths", "Your name"], rows = crRows(), x0 = 2, x1 = 24, wR = GW - x1 - 1;
  text(x0, 1, "NEW CHARACTER", ACCENT); text(x0 + 15, 1, "step " + (cr.step + 1) + " of 4: " + steps[cr.step], DIM);
  rows.forEach((r, i) => {
    const sel = i === cr.at, v = cr.step === 2 && cr.mode === "buy" && i < 6 ? " < " + cr.buy[STATS[i]] + " >" : "";
    text(x0, 4 + i, (sel ? "> " : "  ") + r.label + v, sel ? ACCENT : WHITE);
  });
  let y = 4;
  const para = (s, rgb = WHITE) => { for (const ln of wrap(s, wR)) text(x1, y++, ln, rgb); };
  const p = crPreview(), R = RACE[p.race], C = CLASS[p.cls], mods = o => STATS.filter(k => o[k]).map(k => k.toUpperCase() + " " + (o[k] > 0 ? "+" : "") + o[k]).join("  ") || "no changes";
  if (cr.step === 0){
    const H = RACES[cr.at];
    text(x1, y++, H.name, ACCENT); y++; para(H.desc); y++;
    para("Stats: " + mods(H.stats), DIM); para("Infravision: " + (H.infra ? H.infra * 10 + " ft" : "none"), DIM);
    para("Hit die " + H.hd + "   Experience +" + H.xp + "%", DIM);
    const sk = Object.entries(H.skills).filter(([k]) => k !== "stealth").map(([k, v]) => SKILL_NAMES[k] + " " + (v > 0 ? "+" : "") + v);
    if (H.skills.stealth) sk.push("Stealth " + (H.skills.stealth > 0 ? "+" : "") + H.skills.stealth);
    if (sk.length) para("Skills: " + sk.join(", "), DIM);
  } else if (cr.step === 1){
    const K = CLASSES[cr.at];
    text(x1, y++, K.name, ACCENT); y++; para(K.desc); y++;
    para("Stats: " + mods(K.stats), DIM); para("Hit die " + K.hd + "   Experience +" + K.xp + "%", DIM);
    const fs = firstSpell(K); para(fs ? (K.realm === "holy" ? "Holy prayers" : "Arcane spells") + (spellLevel(fs, K) > 1 ? " from level " + spellLevel(fs, K) : "") + ", starting with " + fs.name + ": " + fs.desc + "." : "No magic.", DIM);
    para("Titles: " + K.titles.slice(0, 3).join(", ") + " ...", DIM);
  } else {
    text(x1, y++, cr.name + ", " + R.name + " " + C.name, ACCENT); y++;
    for (let i = 0; i < 6; i += 2) text(x1, y++, statLine(p.stats, STATS[i]).padEnd(14) + statLine(p.stats, STATS[i + 1]), WHITE);
    y++;
    text(x1, y++, "Hit points " + firstHp(p) + (C.realm ? "   Mana " + maxMana(p) : ""), WHITE);
    for (const k of SKILLS){ const v = skillOf(p, k); text(x1, y++, SKILL_NAMES[k].padEnd(15) + (k === "stealth" ? stealthWord(v) : skillWord(v)), DIM); }
    if (cr.step === 2 && cr.mode === "buy") { y++; text(x1, y++, "Points left: " + (BUY_POINTS - buySpent(cr.buy)) + " of " + BUY_POINTS, ACCENT); }
    if (cr.step === 3){ y++; para(pad.touch ? "A begins; B goes back." : "Type to change the name. Enter begins; Esc goes back.", DIM); }
  }
  const hint = pad.touch ? "D-PAD CHOOSE   A SELECT   B BACK" : "ARROWS CHOOSE   ENTER SELECT   ESC BACK";
  text(x0, GH - 1, hint, DIM);
}

/* ---------- drawing ---------- */
const { put, text, center } = pen(() => screen);   // drawing on the character grid (src/arcade.js)
function drawMap(t){
  computeLight(lightNow, t);
  for (let r = 0; r < VH; r++) for (let c = 0; c < GW; c++){
    const x = cam.x + c, y = cam.y + r; if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
    const i = idx(x, y), tile = L.tiles[i], j = 3 * i;
    let [g, base] = TILE[tile];
    if (tile === T.SHOP){ g = String(L.shopAt[i] + 1); base = SHOPS[L.shopAt[i]].rgb; }   // shop entrances show their number
    else if (tile === T.GROUND && (x * 7 + y * 13) % 9 === 0) g = ",";                      // a little grass among the dirt
    // drawn lit: what the turn saw, plus anything in sight that a flying spell or flash lights up right now
    if (visible(i) || ((inFov[i] === turnNo || depth === 0) && lum(lightNow, j) > 0.03)){   // the town: every lit street and roof shows
      const k = 1.7;
      put(c, VY + r, [base[0] * lightNow[j] * k, base[1] * lightNow[j + 1] * k, base[2] * lightNow[j + 2] * k], 1, 1, g.charCodeAt(0));
    } else if (mem[i]) put(c, VY + r, [base[0] * MEM_RGB[0] * 2, base[1] * MEM_RGB[1] * 2, base[2] * MEM_RGB[2] * 2], 1, 1, g.charCodeAt(0));   // remembered: dim and blue
  }
  const shade = i => Math.max(0.55, Math.min(1.3, 0.45 + lum(lightNow, 3 * i) * 1.2));
  for (const f of floor){ const i = idx(f.x, f.y), v = visible(i); if (!v && !f.seen) continue;   // items seen before stay on the map, dim
    const gold = f.it.k === "gold", g = gold ? "$" : ITEM[f.it.k].glyph, rgb = gold ? [1.4, 1.15, 0.3] : itemRgb(f.it, player.know);
    put(f.x - cam.x, VY + f.y - cam.y, rgb, v ? shade(i) : 0.3, TEXT_LAYER, g.charCodeAt(0)); }
  for (const m of mons){ if (!m.K || !sensed(m)) continue; const i = idx(m.x, m.y), heat = byHeat(m), seen = seesMon(m);
    // seen only by infravision: a dull red shape; found only by detection: dim
    put(m.x - cam.x, VY + m.y - cam.y, heat ? [1.2, 0.3, 0.25] : m.K.rgb, !seen ? 0.45 : heat ? 0.9 : m.K.glow ? 1.4 : shade(i) * 1.15, TEXT_LAYER, m.K.glyph.charCodeAt(0)); }
  if (state === "play") put(player.x - cam.x, VY + player.y - cam.y, [1.7, 1.55, 1.2], 1, TEXT_LAYER, 64);
  for (const s of shots){ const c = s.path[Math.min(s.path.length - 1, Math.floor(s.t * s.speed))]; put(c[0] - cam.x, VY + c[1] - cam.y, s.rgb, 1.2, TEXT_LAYER, s.glyph.charCodeAt(0)); }
  lamp.x = (player.x - cam.x + 0.5) * screen.cw; lamp.y = (player.y - cam.y + VY + 0.5) * screen.ch; lamp.z = screen.ch * 3;
  for (const b of world.bodies) screen.sphere(b, lamp, { stripe: false });
}
function wrap(s, w){ const out = []; let line = ""; for (const word of s.split(" ")){ if ((line + " " + word).trim().length > w){ out.push(line); line = word; } else line = (line + " " + word).trim(); } if (line) out.push(line); return out; }
function drawUI(){
  // messages: this turn's in white; if nothing happened, the last turn's in grey. Long turns keep the newest lines.
  const fresh = msgs.length > 0, lines = wrap((fresh ? msgs : oldMsgs).join("  "), GW - 1);
  lines.slice(-2).forEach((s, k) => text(0, k, s, fresh ? WHITE : DIM));
  const p = player, low = p.hp < p.mhp * 0.3, lt = p.eq.light;
  const food = p.food < 0 ? "Starving" : p.food < 1000 ? "Weak" : p.food < 2000 ? "Hungry" : "";
  let x = 0;
  const seg = (s, rgb) => { text(x, GH - 2, s, rgb); x += s.length + 2; };
  if (GW >= 96) seg(p.name + " the " + titleOf(p), WHITE);
  seg("LV " + p.lvl, WHITE); seg("EXP " + Math.floor(p.exp) + "/" + expNeeded(p, p.lvl + 1), WHITE);
  seg("HP " + Math.max(0, p.hp) + "/" + p.mhp, low ? RED : GREEN);
  if (p.mmana) seg("MP " + p.mana + "/" + p.mmana, BLUE);
  seg("AC " + armour(), WHITE); seg(depth ? feet(depth) + " ft" : "Town, " + (isDay() ? "day" : "night"), WHITE);
  x = 0;
  const seg2 = (s, rgb) => { text(x, GH - 1, s, rgb); x += s.length + 2; };
  seg2(lt ? ITEM[lt.k].name + " " + lt.fuel : "No light", lt && lt.fuel > 500 ? ACCENT : RED);
  if (food) seg2(food, RED);
  seg2("Gold " + p.gold, DIM);
  const T0 = p.t, st = [[T0.fast, "Fast", GREEN], [T0.hero, "Hero", GREEN], [T0.berserk, "Berserk", GREEN], [T0.bless, "Blessed", GREEN],
    [T0.poison, "Poisoned", RED], [T0.confused, "Confused", RED], [T0.blind, "Blind", RED], [T0.asleep, "Asleep", RED], [p.bonus.burden, "Burdened", RED]];
  for (const [on, label, rgb] of st) if (on && x + label.length < GW - 24) seg2(label, rgb);
  const hint = pad.touch ? "B COMMANDS  START MENU" : "? HELP  ESC MENU";
  if (x + hint.length <= GW) text(GW - hint.length, GH - 1, hint, DIM);
}
function drawTitle(t){
  // a lit chamber behind the title: the first level, shown by a flickering torch
  if (!L){ rng = new RNG(4242); player = { x: 0, y: 0, eq: { light: { k: "torch", fuel: 4000 } }, lvl: 1 }; L = generateLevel(rng, 1); mons = []; floor = []; roomLight.fill(0);
    const r = L.rooms.reduce((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a); player.x = r.cx; player.y = r.cy; centerCamera(true);
    for (let i = 0; i < MW * MH; i++) if (L.room[i] === r.id){ roomLight[3 * i] = ROOM_RGB[0] * 0.6; roomLight[3 * i + 1] = ROOM_RGB[1] * 0.6; roomLight[3 * i + 2] = ROOM_RGB[2] * 0.6; } }   // the biggest room, dimly lit
  computeLight(lightNow, t);
  for (let r = 0; r < VH; r++) for (let c = 0; c < GW; c++){
    const x = cam.x + c, y = cam.y + r; if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
    const i = idx(x, y), j = 3 * i, v = lum(lightNow, j); if (v < 0.02) continue;
    const [g, base] = TILE[L.tiles[i]];
    put(c, VY + r, [base[0] * lightNow[j] * 1.7, base[1] * lightNow[j + 1] * 1.7, base[2] * lightNow[j + 2] * 1.7], 1, 1, g.charCodeAt(0));
  }
  const top = Math.max(1, (GH >> 1) - 9);
  center(top, "T O R C H L I G H T", ACCENT); center(top + 1, "D U N G E O N S", ACCENT);
  center(top + 3, "A dungeon crawl after Moria", DIM);
  const blink = (performance.now() / 500 | 0) % 2;
  center(top + 5, pad.touch ? "PRESS A OR START TO BEGIN" : "PRESS SPACE TO BEGIN", blink ? WHITE : DIM);
  center(top + 6, "Early version: no saves yet.", DIM);
  if (scores.list.length){
    center(top + 9, "HALL OF FAME", ACCENT);
    scores.list.forEach((s, k) => center(top + 10 + k, `${String(s.score).padStart(6)}  ${s.name || ""} ${s.race || ""} ${s.cls || "Fighter"}  LV ${s.lvl}  ${s.depth} ft  ${s.killer}`.replace(/  +/g, "  ").slice(0, GW - 2), k ? DIM : WHITE));
  }
}
function drawTomb(){
  const T0 = tomb, lines = ["R.I.P.", "", T0.name, "the " + T0.race + " " + T0.cls, "of level " + T0.lvl, "killed by " + T0.killer, (T0.at === "the town" ? "in the town" : "at " + T0.at), "", "Score " + T0.score + (T0.best ? "  (best!)" : ""), "",
    pad.touch ? "Press A for the title" : "Press Space for the title"];
  const w = 34, top = Math.max(2, (GH >> 1) - 8), x0 = (GW - w) >> 1;
  for (let r = 0; r < lines.length + 4; r++) text(x0, top + r, r === 0 || r === lines.length + 3 ? "+" + "-".repeat(w - 2) + "+" : "|" + " ".repeat(w - 2) + "|", DIM);
  lines.forEach((s, k) => text(x0 + ((w - s.length) >> 1), top + 2 + k, s, k === 0 ? ACCENT : WHITE));
}
function draw(t){
  screen.clear();
  if (state === "title") drawTitle(t);
  else if (state === "create") drawCreate();
  else { drawMap(t); drawUI(); if (state === "dead" && stateT > 1) drawTomb(); }
  const mt = (m, title, note) => { if (m.open) m.draw(screen, { accent: ACCENT, normal: WHITE, dim: DIM, title, note }); };
  mt(list, listTitle, listNote); mt(menu, state === "title" ? "MENU" : "PAUSED", "THIS EARLY VERSION DOES NOT SAVE");
  screen.render(ctx);
}

/* ---------- lists: commands, inventory, character sheet, help ---------- */
let listRows = [], listTitle = "", listNote = "";
const list = createMenu(() => listRows);
function openList(title, rows, note = ""){ listTitle = title; listRows = rows; listNote = note; list.at = 0; if (!list.open) list.show(); }
const info = s => ({ label: s, select: () => {} });
const done = fn => () => { list.hide(); fn(); };
/* ---------- shops: buy, sell, and selling tells you what a thing was ---------- */
const shopName = it => itemName(it, { ...player.know, known: SHOP_KNOWS.known });
const shopCol = () => Math.max(24, Math.min(40, GW - 26));   // the name column, narrower on a phone
const shopTitle = i => SHOPS[i].name.toUpperCase() + "   GOLD " + player.gold;
function openShop(i){
  const S = SHOPS[i]; oldMsgs = []; msgs = [];
  say("You enter the " + S.name + ". " + S.keeper + ": \"" + rng.pick(S.hello) + "\"");
  shopMain(i);
}
function shopMain(i){
  openList(shopTitle(i), [{ label: "Buy", select: () => shopBuy(i) }, { label: "Sell", select: () => shopSell(i) }, { label: "Leave", select: () => list.hide() }], SHOPS[i].keeper.toUpperCase());
}
function shopBuy(i, at = 0){
  const S = SHOPS[i], stock = shops[i].stock;
  const rows = stock.map(it => ({ label: cap(shopName(it)).padEnd(shopCol()) + String(buyPrice(it, S, player.stats.cha)).padStart(6) + " gold", select: () => buy(i, it) }));
  rows.push({ label: "Back", select: () => shopMain(i) });
  openList(shopTitle(i), rows, "PRICES ARE FOR ONE"); list.at = Math.min(at, rows.length - 1);
}
function buy(i, it){
  const S = SHOPS[i], price = buyPrice(it, S, player.stats.cha), at = list.at;
  oldMsgs = []; msgs = [];
  if (player.gold < price) say(S.keeper + ": \"Come back when you can afford it.\"");
  else {
    const one = { ...it, n: 1 }, got = carry(one);
    if (!got) say("You have no room in your pack.");
    else {
      player.gold -= price; player.know.known[it.k] = true;
      if (--it.n <= 0) shops[i].stock.splice(shops[i].stock.indexOf(it), 1);
      say("You buy " + nameOf(one) + " for " + price + " gold."); recalc();
    }
  }
  shopBuy(i, at);
}
function shopSell(i, at = 0){
  const S = SHOPS[i];
  const rows = player.inv.map((it, k) => ({ label: (String.fromCharCode(97 + k) + ") " + nameOf(it)).padEnd(shopCol()) + (shopBuys(S, it) ? (it.id && kindKnown(ITEM[it.k], player.know) ? String(sellPrice(it, S, player.stats.cha)).padStart(6) + " gold" : "     ? gold") : "     -"), select: () => sell(i, it) }));
  if (!rows.length) rows.push(info("You have nothing to sell."));
  rows.push({ label: "Back", select: () => shopMain(i) });
  openList(shopTitle(i), rows, "SELLING ONE ALSO TELLS YOU WHAT IT IS"); list.at = Math.min(at, rows.length - 1);
}
function sell(i, it){
  const S = SHOPS[i], at = list.at;
  oldMsgs = []; msgs = [];
  if (!shopBuys(S, it)){ say(S.keeper + ": \"I don't deal in those.\""); return shopSell(i, at); }
  const knew = it.id && kindKnown(ITEM[it.k], player.know);
  it.id = true; delete it.sense; player.know.known[it.k] = true;   // the keeper looks it over and tells you
  if (!knew) say("The keeper looks it over: it is " + nameOf(it, 1) + ".");
  const price = sellPrice(it, S, player.stats.cha);
  if (price <= 0){ say(S.keeper + ": \"That's worth nothing to me.\""); return shopSell(i, at); }
  const one = { ...it, n: 1 }; takeOne(it); player.gold += price;
  const same = shops[i].stock.find(o => sameItem(o, one)); if (same) same.n++; else shops[i].stock.push(one);
  say("You sell " + nameOf(one) + " for " + price + " gold."); recalc();
  shopSell(i, at);
}
function commandList(){
  openList("COMMANDS", [
    { label: "Inventory", select: () => inventoryList() },
    { label: "Pick up", select: done(() => act(pickUp)) },
    { label: "Take the stairs", select: done(() => { const t = L.tiles[idx(player.x, player.y)]; act(() => takeStairs(t !== T.UP)); }) },
    { label: "Equipment", select: () => equipmentList() },
    ...(cls().realm ? [{ label: cls().realm === "holy" ? "Pray" : "Cast a spell", select: () => castMenu() }, { label: "Study", select: done(study) }] : []),
    { label: "Drink a potion", select: () => useWhich("quaff") }, { label: "Read a scroll", select: () => useWhich("read") },
    { label: "Use a wand, staff or rod", select: () => chooseItem("USE WHICH?", it => ["wand", "staff", "rod"].includes(ITEM[it.k].cat), it => act(() => useItem(it, "use")), "You have no magic devices.") },
    ...(player.eq.bow ? [{ label: "Fire", select: () => fire() }] : []),
    { label: "Throw", select: () => useWhich("throw") },
    { label: "Rest until healed", select: done(rest) },
    { label: "Wait a turn", select: done(() => act(() => true)) },
    { label: "Look around", select: done(look) },
    { label: "Character", select: () => characterList() },
    { label: "Messages", select: () => messageList() },
    { label: "Help", select: () => helpList() }
  ]);
}
function chooseItem(title, filter, fn, none = "You have nothing suitable."){
  const rows = player.inv.map((it, k) => [it, k]).filter(([it]) => filter(it)).map(([it, k]) => ({ label: String.fromCharCode(97 + k) + ") " + nameOf(it), select: () => { list.hide(); fn(it); } }));
  for (const sl of SLOTS){ const it = player.eq[sl]; if (it && filter(it)) rows.push({ label: SLOT_NAMES[sl].slice(0, 6).padEnd(7) + nameOf(it), select: () => { list.hide(); fn(it); } }); }
  if (!rows.length){ oldMsgs = []; msgs = []; say(none); return; }
  openList(title, rows);
}
const VERB_FILTER = { eat: it => ITEM[it.k].cat === "food" || ITEM[it.k].cat === "mushroom", quaff: it => ITEM[it.k].cat === "potion", read: it => ITEM[it.k].cat === "scroll",
  fuel: it => ITEM[it.k].cat === "flask", wield: it => !!ITEM[it.k].slot && player.inv.includes(it), drop: it => player.inv.includes(it),
  wand: it => ITEM[it.k].cat === "wand", staff: it => ITEM[it.k].cat === "staff", rod: it => ITEM[it.k].cat === "rod", throw: it => player.inv.includes(it), inspect: () => true };
function useWhich(verb){   // the item lists behind single keys: q drink, r read, a aim and so on
  const how = verb === "wand" || verb === "staff" || verb === "rod" ? "use" : verb;
  chooseItem({ eat: "EAT", quaff: "DRINK", read: "READ", fuel: "FILL LANTERN WITH", wield: "WEAR OR WIELD", drop: "DROP", wand: "AIM", staff: "USE", rod: "ZAP", throw: "THROW", inspect: "INSPECT" }[verb] + " WHICH?",
    VERB_FILTER[verb], it => verb === "throw" ? throwItem(it) : verb === "inspect" ? inspect(it) : act(() => useItem(it, how)),
    { wand: "You have no wands.", staff: "You have no staffs.", rod: "You have no rods.", read: "You have no scrolls.", quaff: "You have no potions.", eat: "You have nothing to eat." }[verb]);
}
function inventoryList(){
  const rows = player.inv.map((it, k) => ({ label: String.fromCharCode(97 + k) + ") " + nameOf(it), select: () => itemActions(it) }));
  if (!rows.length) rows.push(info("You are carrying nothing."));
  openList("PACK " + player.inv.length + "/22  " + Math.round(totalWeight()) + "/" + capacity() + " LB", rows);
}
function equipmentList(){
  openList("EQUIPMENT", SLOTS.map(sl => { const it = player.eq[sl];
    return { label: SLOT_NAMES[sl].slice(0, 6).padEnd(7) + (it ? nameOf(it) : "-"), select: () => it ? openList(nameOf(it).toUpperCase().slice(0, 34), [
      { label: "Take off", select: done(() => act(() => takeOff(sl))) }, { label: "Inspect", select: () => inspect(it) }, { label: "Back", select: equipmentList }]) : null }; }));
}
function verbsFor(it){
  const K = ITEM[it.k], v = [];
  if (K.cat === "food" || K.cat === "mushroom") v.push(["eat", "Eat"]);
  if (K.cat === "potion") v.push(["quaff", "Drink"]);
  if (K.cat === "scroll") v.push(["read", "Read"]);
  if (K.cat === "flask") v.push(["fuel", "Fill lantern"]);
  if (K.cat === "wand" || K.cat === "staff" || K.cat === "rod") v.push(["use", { wand: "Aim", staff: "Use", rod: "Zap" }[K.cat]]);
  if (K.cat === "ammo" && player.eq.bow && ITEM[player.eq.bow.k].ammo === K.ammo) v.push(["fire", "Fire"]);
  if (K.slot) v.push(["wield", K.slot === "weapon" ? "Wield" : K.slot === "light" ? "Use as light" : "Wear"]);
  v.push(["throw", "Throw"], ["inspect", "Inspect"], ["drop", "Drop"]);
  return v;
}
function itemActions(it){
  openList(nameOf(it).toUpperCase().slice(0, 34), [...verbsFor(it).map(([how, label]) => ({ label, select: how === "inspect" ? () => inspect(it) : done(() =>
    how === "throw" ? throwItem(it) : how === "fire" ? fireAmmo(it) : act(() => useItem(it, how))) })), { label: "Back", select: () => inventoryList() }]);
}
const EFFECT_TEXT = { heal: "heals wounds", healFull: "heals you completely", mana: "restores mana", fast: "makes you faster for a while", hero: "makes you heroic",
  berserk: "puts you in a fighting rage", resFire: "protects you from heat", resCold: "protects you from cold", infra: "lets you see heat further",
  cure: "cures poison, confusion and blindness", curePoison: "cures poison", sleep: "puts you to sleep", poison: "poisons you", confuse: "confuses you", blind: "blinds you",
  salt: "makes you sick", gainStat: "raises a stat for good", enlight: "shows you the whole level", exp: "gives experience", clairvoyance: "shows you the level and its objects",
  identify: "identifies an item", removeCurse: "removes curses from your equipment", lightArea: "lights up the area", darkness: "darkens the area and blinds you",
  map: "maps the area around you", detectObj: "shows objects nearby", detectMon: "shows monsters nearby", detection: "shows monsters and objects nearby",
  recall: "takes you to the town, or back down to your deepest level", phase: "teleports you a short way", teleport: "teleports you far away", teleLevel: "takes you up or down a level", deepDescent: "drops you two levels",
  enchHit: "makes your weapon more accurate", enchDam: "makes your weapon hit harder", enchAc: "strengthens a piece of armour", bless: "blesses you", chant: "blesses you for longer",
  satisfy: "fills your stomach", monConf: "makes your next hit confuse", slumber: "puts monsters next to you to sleep", aggravate: "wakes every monster",
  curseArmour: "curses your armour", summonUndead: "calls the undead", summon: "calls monsters", bolt: "fires a bolt", beam: "fires a beam that goes through monsters",
  ball: "fires an exploding ball", sleepMon: "puts a monster to sleep", slowMon: "slows a monster", confMon: "confuses a monster", scareMon: "frightens a monster",
  sleepAll: "puts the monsters you see to sleep", slowAll: "slows the monsters you see", beamLight: "lights a line through the dark", stoneMud: "turns a wall to mud" };
function inspect(it){
  const K = ITEM[it.k], known = kindKnown(K, player.know), lines = [], P = itemPowers(it), A = it.art ? ARTIFACT[it.art] : null;
  lines.push(...wrap(cap(nameOf(it)), 34));
  lines.push("Weighs " + (Math.round(itemWeight(it) * 10) / 10) + " lb.");
  if (K.dice && K.cat !== "ammo") lines.push("Hits for " + K.dice + (K.cat === "dart" ? " when thrown." : "."));
  if (K.mult) lines.push("Multiplies damage by " + K.mult + ".");
  if (K.radius) lines.push("Lights a radius of " + ((A && A.radius) || K.radius) + ".");
  if (K.effect) lines.push(...wrap(known ? "It " + EFFECT_TEXT[K.effect] + "." : "You do not know what it does.", 34));
  if (K.cat === "rod" && known) lines.push("Recharges in " + K.recharge + " turns.");
  if (it.id || A){
    if (P.brand) lines.push("It " + { fire: "burns", cold: "freezes", elec: "shocks" }[P.brand] + " your foes.");
    if (P.slay) lines.push("It is deadly against " + { animal: "animals", undead: "the undead", evil: "evil" }[P.slay] + ".");
    if (P.res.length) lines.push(...wrap("It protects you from " + [...new Set(P.res)].join(", ") + ".", 34));
    for (const [k, v] of Object.entries(P.stats)) lines.push((v > 0 ? "+" : "") + v + " " + STAT_NAMES[k] + ".");
    if (P.speed) lines.push((P.speed > 0 ? "+" : "") + P.speed + " speed.");
    if (P.stealth) lines.push("+" + P.stealth + " stealth.");
    if (P.freeAct) lines.push("It keeps you from being put to sleep.");
    if (P.regen) lines.push("It speeds your healing.");
    if (P.slowDigest) lines.push("You need less food.");
    if (it.cursed) lines.push("It is cursed.");
  } else if (K.dice || K.ac !== undefined || K.mult) lines.push(it.sense ? "You feel it is " + it.sense + "." : "Its quality is unknown.");
  if (A) lines.push(...wrap(A.desc, 34));
  openList("INSPECT", lines.map(info));
}
function characterList(){
  const p = player, R = race(), C = cls(), s = p.stats, b = p.bonus;
  openList("CHARACTER", [
    info(p.name + ", " + R.name + " " + C.name), info("Title: " + titleOf(p)),
    info("Level " + p.lvl + "   Exp " + Math.floor(p.exp) + " / " + expNeeded(p, p.lvl + 1)),
    info("HP " + p.hp + "/" + p.mhp + (p.mmana ? "  MP " + p.mana + "/" + p.mmana : "") + "  AC " + armour()),
    info(statLine(s, "str").padEnd(15) + statLine(s, "int")), info(statLine(s, "wis").padEnd(15) + statLine(s, "dex")), info(statLine(s, "con").padEnd(15) + statLine(s, "cha")),
    info("To-hit " + (b.hit >= 0 ? "+" : "") + b.hit + "  To-dam " + (b.dam >= 0 ? "+" : "") + b.dam + "  Speed " + (p.speed >= 0 ? "+" : "") + p.speed),
    info("Carrying " + Math.round(totalWeight()) + " of " + capacity() + " lb"),
    ...(b.res.size ? [info("Resists " + [...b.res].join(", "))] : []),
    ...SKILLS.map(k => { const v = skillOf(p, k) + (k === "stealth" ? b.stealth : k === "search" ? b.search : 0); return info(SKILL_NAMES[k].padEnd(15) + (k === "stealth" ? stealthWord(v) : skillWord(v))); }),
    info("Infravision".padEnd(15) + (infra() ? infra() * 10 + " ft" : "none")), info("Hit die".padEnd(15) + "d" + hitDie(p)),
    info("Exp penalty".padEnd(15) + "+" + (R.xp + C.xp) + "%"),
    ...(C.realm ? [info((C.realm === "holy" ? "Prayers" : "Spells").padEnd(15) + p.spells.length + " of " + SPELLS.filter(S => S.realm === C.realm && spellLevel(S, C) <= 40).length)] : []),
    info("Weapon " + weaponDice() + "   Gold " + p.gold), info("Deepest " + feet(p.maxDepth) + " ft   Kills " + p.kills), info("Turns " + p.turns)
  ]);
}
function messageList(){ openList("MESSAGES", log.length ? log.slice(-60).reverse().flatMap(s => wrap(s, 34).map(info)) : [info("No messages yet.")], "NEWEST FIRST"); }
function helpList(){
  const ro = keySet === "roguelike";
  openList("HELP", [
    info(ro ? "hjklyubn  move (Shift runs)" : "Arrows/numpad  move"), info(ro ? "arrows also move" : "Shift + move  run"),
    info("Walk into a monster to attack"), info("Walk into a door to open it"), info("In town, walk onto a number to shop"),
    info("g or ,  pick up"), info("i  pack   e  equipment"), info("w  wear   " + (ro ? "T" : "t") + "  take off   d  drop"),
    info("E  eat   q  drink   r  read"), info("a  aim a wand   " + (ro ? "Z" : "u") + "  use a staff"), info("z  zap a rod   F  fill lantern"),
    info("f  fire   v  throw   I  inspect"), info("m or p  cast or pray   S  study"), info("  then a direction, or ' / t"), info("  for the nearest monster"),
    info(">  <  take the stairs"), info("R  rest   " + (ro ? "." : ". or 5") + "  wait"), info((ro ? "x" : "l") + "  look   C  character"),
    info("Ctrl+P  messages"), info("Esc  menu"),
    info("Touch: D-pad moves (8 ways),"), info("A acts here, B commands")
  ], "KEYS CAN BE CHANGED IN THE MENU");
}
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "play" ? "NEW CHARACTER" : "START", select: () => { menu.hide(); startCreate(); } },
  { label: "KEYS", value: () => keySet === "roguelike" ? "ROGUELIKE" : "ORIGINAL", change: () => { keySet = keySet === "roguelike" ? "original" : "roguelike"; store.setJSON("keys", keySet); } },
  { label: "CONTROLS", value: () => pad.touch ? "TOUCH" : "KEYBOARD", change: () => pad.toggle() },
  { label: "HELP", select: () => { menu.hide(); helpList(); } },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
]);

/* ---------- input ---------- */
const ORIGINAL = { ArrowUp: 8, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 6, Home: 7, PageUp: 9, End: 1, PageDown: 3, 1: 1, 2: 2, 3: 3, 4: 4, 6: 6, 7: 7, 8: 8, 9: 9 };
const ROGUE = { ArrowUp: 8, ArrowDown: 2, ArrowLeft: 4, ArrowRight: 6, h: 4, j: 2, k: 8, l: 6, y: 7, u: 9, b: 1, n: 3 };
function dirFor(e){
  const code = /^Numpad([1-9])$/.exec(e.code);
  if (code && code[1] !== "5") return +code[1];
  const map = keySet === "roguelike" ? ROGUE : ORIGINAL;
  return map[e.key] || map[e.key.toLowerCase()] || 0;
}
function onKey(e){
  if (list.open && list.key(e)){ e.preventDefault(); return; }
  if (menu.key(e)){ e.preventDefault(); return; }
  if (state === "create") return createKey(e);
  if (aiming){   // waiting for a direction
    e.preventDefault();
    const d = dirFor(e);
    if (d) return aimAt(...DIRS[d]);
    if (e.key === "'" || e.key === "t" || e.key === "Enter" || e.key === "*") return aimNearest();
    if (e.key === "Escape"){ aiming = null; oldMsgs = []; msgs = []; say("Never mind."); }
    return;
  }
  if (e.key === "Escape"){ e.preventDefault(); return menu.show(); }
  if (state === "title"){ if (e.key === " " || e.key === "Enter"){ e.preventDefault(); startCreate(); } return; }
  if (state === "dead"){ if (stateT > 1 && (e.key === " " || e.key === "Enter")){ e.preventDefault(); toTitle(); } return; }
  const ro = keySet === "roguelike", d = dirFor(e);
  if (d){
    e.preventDefault();
    const [dx, dy] = DIRS[d];
    if (e.shiftKey || (ro && /^[HJKLYUBN]$/.test(e.key))) return run(dx, dy);
    return act(() => tryMove(dx, dy));
  }
  if (e.ctrlKey && (e.key === "p" || e.key === "P")){ e.preventDefault(); return messageList(); }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k === "g" || k === ",") act(pickUp);
  else if (k === ">") act(() => takeStairs(true));
  else if (k === "<") act(() => takeStairs(false));
  else if (k === "i") inventoryList();
  else if (k === "e") equipmentList();
  else if (k === "E") useWhich("eat");
  else if (k === "q") useWhich("quaff");
  else if (k === "r") useWhich("read");
  else if (k === "w") useWhich("wield");
  else if (k === (ro ? "T" : "t")) equipmentList();
  else if (k === "F") useWhich("fuel");
  else if (k === "d") useWhich("drop");
  else if (k === "v") useWhich("throw");
  else if (k === "a") useWhich("wand");
  else if (k === (ro ? "Z" : "u")) useWhich("staff");
  else if (k === "z") useWhich("rod");
  else if (k === "f") fire();
  else if (k === "I") useWhich("inspect");
  else if (k === "m" || k === "p") castMenu();
  else if (k === "S") study();
  else if (k === "R") rest();
  else if (k === "." || (!ro && (k === "5" || e.code === "Numpad5"))) act(() => true);
  else if (k === (ro ? "x" : "l")) look();
  else if (k === "C") characterList();
  else if (k === "?") helpList();
  else return;
  e.preventDefault();
}
function createKey(e){
  const k = e.key;
  if (k === "Escape"){ e.preventDefault(); return crBack(); }
  if (k === "Enter" || k === " "){ e.preventDefault(); return crChoose(); }
  if (cr.step === 3){   // typing the name; letters type, even the roguelike movement keys
    if (k === "Backspace"){ e.preventDefault(); cr.name = cr.name.slice(0, -1); return; }
    if (/^[A-Za-z'-]$/.test(k)){ e.preventDefault(); if (cr.name.length < 14) cr.name = cr.name ? cr.name + k : k.toUpperCase(); return; }
  }
  const d = dirFor(e);
  if (d === 8 || d === 2 || d === 4 || d === 6){ e.preventDefault(); crKey({ 8: "up", 2: "down", 4: "left", 6: "right" }[d]); }
}
addEventListener("keydown", onKey);
function toTitle(){ state = "title"; L = null; cr = null; aiming = null; world.bodies.length = 0; }
addEventListener("beforeunload", e => { if (state === "play"){ e.preventDefault(); e.returnValue = ""; } });   // nothing is saved yet

// The shared gamepad (src/arcade.js), with eight directions; holding the D-pad keeps walking.
const DIR8 = { up: 8, down: 2, left: 4, right: 6, upleft: 7, upright: 9, downleft: 1, downright: 3 };
let holdDir = 0, holdT = 0;
const pad = createPad({ store, axis: 8, menu: () => (list.open && list) || (menu.open && menu),
  onDir: d => {
    const n = DIR8[d] || 0, was = holdDir; holdDir = n;
    if (!n || n === was) return;
    if (state === "create"){ holdDir = 0; if ([8, 2, 4, 6].includes(n)) crKey({ 8: "up", 2: "down", 4: "left", 6: "right" }[n]); return; }
    if (state !== "play") return;
    if (aiming){ holdDir = 0; return aimAt(...DIRS[n]); }
    disturbed = false; holdT = 0.3;   // a short pause before walking on
    act(() => tryMove(...DIRS[n]));
  },
  onPress: id => {
    if (state === "title"){ if (id === "a" || id === "start") startCreate(); else if (id === "select") menu.show(); return; }
    if (state === "create"){ if (id === "a" || id === "start") crChoose(); else if (id === "b") crBack(); else menu.show(); return; }
    if (state === "dead"){ if (stateT > 1 && (id === "a" || id === "start")) toTitle(); return; }
    if (aiming){ if (id === "a") aimNearest(); else { aiming = null; oldMsgs = []; msgs = []; say("Never mind."); } return; }
    if (id === "start" || id === "select") return menu.show();
    if (id === "a") contextAction(); else commandList();
  } });
cv.addEventListener("pointerdown", e => {
  const [gx, gy] = gridAt(e, cv, GW, GH);
  if (list.open) return list.tap(gx, gy);
  if (menu.open) return menu.tap(gx, gy);
  if (state === "title") return startCreate();
  if (state === "create"){ const i = gy - 4; if (i >= 0 && i < crRows().length){ cr.at = i; crChoose(); } return; }
  if (state === "dead"){ if (stateT > 1) toTitle(); return; }
  if (aiming) return aimNearest();
  if (!pad.touch) commandList();   // a click opens the commands
});

/* ---------- layout and loop ---------- */
function layout(){
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  const old = screen, dpr = Math.min(window.devicePixelRatio || 1, 3);
  // as large a font as fits at least 60 x 24 characters, up to 14px (smaller with higher detail); the view grows with the space
  const f = Math.max(4, Math.min(Math.round(14 / DETAIL), Math.floor(r.width / 60 / 0.6), Math.floor(r.height / 24 / 1.15)));
  screen = new Screen(f, D); screen.fit(r.width, r.height, dpr);
  GW = Math.min(screen.cols, MW); GH = Math.min(screen.rows, MH + VY + 2); VH = GH - VY - 2;
  const W = GW * screen.cw, H = GH * screen.ch;
  screen.fit(W, H, dpr); sizeCanvas(cv, ctx, W, H, dpr);
  world.w = W; world.h = H; world.unit = screen.cw; world.g = { x: 0, y: H * 1.2 };
  if (old) world.bodies.length = 0;
  if (player) centerCamera(true);
  rebuildTerrain();
}
function tick(dt, t){
  if (!screen) return;
  stateT += dt;
  if (holdDir && state === "play" && !aiming && !list.open && !menu.open && (holdT -= dt) <= 0){   // keep walking while the D-pad is held
    holdT = 0.14;
    if (disturbed || !act(() => tryMove(...DIRS[holdDir]))) holdDir = 0;
  }
  for (const s of shots) s.t += dt;
  shots = shots.filter(s => s.t * s.speed < s.path.length + 1);
  for (const f of flashes) f.t -= dt;
  flashes = flashes.filter(f => f.t > 0);
  for (const l of later) if ((l.t -= dt) <= 0) l.fn();
  later = later.filter(l => l.t > 0);
  world.step(dt);
  for (const b of world.bodies) b.life -= dt;
  world.bodies = world.bodies.filter(b => b.life > 0);
  draw(t);
}
layout();
onResize(stage, layout);
startLoop(tick);
})();
