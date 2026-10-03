(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Torchlight Dungeons: a turn-based dungeon crawl after Moria. The rules run on the 198 x 66 map in gen.js; you
// see what your light (or a lit room, a glowing monster, a flying spell) shows you, and warm bodies within your
// infravision. Characters come from chars.js. The engine draws the light and throws a little physics debris.
// See TORCHLIGHT_PLAN.md for the phases.
const TORCH_RGB = [1.0, 0.62, 0.3], ROOM_RGB = [0.42, 0.42, 0.47], MEM_RGB = [0.07, 0.08, 0.12], SPARK_RGB = [1.0, 0.95, 0.55];
const WHITE = [1.6, 1.6, 1.6], DIM = [0.45, 0.48, 0.6], ACCENT = [1.6, 1.15, 0.5], RED = [1.6, 0.4, 0.35], GREEN = [0.6, 1.4, 0.6], BLUE = [0.6, 0.85, 1.6];
const TILE = {   // glyph and base colour per tile
  [T.EDGE]: ["#", [0.5, 0.46, 0.42]], [T.WALL]: ["#", [0.55, 0.5, 0.45]], [T.FLOOR]: [".", [0.32, 0.32, 0.32]],
  [T.DOOR]: ["+", [0.75, 0.48, 0.22]], [T.OPEN]: ["'", [0.75, 0.48, 0.22]], [T.DOWN]: [">", [1.2, 1.2, 1.2]], [T.UP]: ["<", [1.2, 1.2, 1.2]]
};
const BITS = { name: "bits", density: 0.6, e: 0.45, mu: 0.5, kd: 0.9, ks: 0.5, shine: 20 };
const DIRS = { 1: [-1, 1], 2: [0, 1], 3: [1, 1], 4: [-1, 0], 6: [1, 0], 7: [-1, -1], 8: [0, -1], 9: [1, -1] };
const VY = 2;   // map rows start under the two message rows; the status bar takes the last two rows

const D = defaultDisplay(); D.room = 0.15; D.glow = 0.3; D.lampRGB = TORCH_RGB;
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
if (D.pixels) TILE[T.FLOOR][1] = [0.09, 0.09, 0.1];   // as solid pixels, floor must be much darker than wall to read the map
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
const byHeat = m => !m.K.cold && race().infra > 0 && inFov[idx(m.x, m.y)] === turnNo && dist(m.x, m.y, player.x, player.y) <= race().infra && !visible(idx(m.x, m.y));
const seesMon = m => visible(idx(m.x, m.y)) || byHeat(m);
const theName = m => seesMon(m) ? "the " + m.K.name : "it";

/* ---------- saved preferences and high scores ---------- */
const PREFIX = "torchlightDungeons.v1.";
const load = (k, d) => { try { const v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch (e){ return d; } };
const store = (k, v) => { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e){ console.warn("Torchlight Dungeons: could not save", k, e); } };
let keySet = load("keys", "original"), scores = load("scores", []);

/* ---------- items ---------- */
function makeItem(k, n = 1){ const K = ITEM[k], it = { k, n }; if (K.slot === "light") it.fuel = K.fuel; return it; }
function plural(name){ const i = name.indexOf(" of "), w = i > 0 ? name.slice(0, i) : name, rest = i > 0 ? name.slice(i) : ""; return w + (/(ch|sh|s|x)$/.test(w) ? "es" : "s") + rest; }
function itemName(it){
  const K = ITEM[it.k], base = it.n > 1 ? it.n + " " + plural(K.name) : (/^[AEIOU]/.test(K.name) ? "an " : "a ") + K.name;
  return base + (K.dice ? " (" + K.dice + ")" : "") + (K.ac ? " [" + K.ac + "]" : "") + (it.fuel !== undefined ? " (" + it.fuel + " turns)" : "");
}
const stackable = (a, b) => a.k === b.k && a.fuel === b.fuel;
function carry(it){
  const same = player.inv.find(o => stackable(o, it));
  if (same){ same.n += it.n; return same; }
  if (player.inv.length >= 22) return null;
  player.inv.push(it); return it;
}
function pickItem(d){
  const pool = ITEMS.filter(k => k.depth <= d);
  const K = rng.weighted(pool, k => 1 / k.rarity * (k.depth >= d - 3 ? 1.5 : 1));
  return makeItem(K.id, K.throw ? rng.range(4, 12) : 1);
}
const weaponDice = () => player.eq.weapon ? ITEM[player.eq.weapon.k].dice : "1d2";
const armour = () => (player.eq.body ? ITEM[player.eq.body.k].ac : 0) + statMod(player.stats.dex) + Math.floor(player.lvl / 5);
function lightRadius(){
  const it = player.eq.light; if (!it || it.fuel <= 0) return 0;
  const R = ITEM[it.k].radius + ((player.cls && cls().lightBonus) || 0);
  return it.fuel < 100 ? 1 : it.fuel < 500 ? R - 1 : R;
}

/* ---------- levels ---------- */
function newLevel(d){
  depth = d; player.maxDepth = Math.max(player.maxDepth, d);
  L = generateLevel(rng, d);
  mem.fill(0); mons = [player]; floor = []; world.bodies.length = 0; shots = []; flashes = []; later = [];
  // light from lit rooms is fixed for the whole level
  roomLight.fill(0);
  for (let i = 0; i < MW * MH; i++) if (L.lit[i]){ roomLight[3 * i] = ROOM_RGB[0]; roomLight[3 * i + 1] = ROOM_RGB[1]; roomLight[3 * i + 2] = ROOM_RGB[2]; }
  const at = L.spot(); player.x = at % MW; player.y = Math.floor(at / MW);
  for (let k = 0, n = 14 + d + rng.int(8); k < n; k++) spawnMonster(false);
  for (let k = 0, n = 8 + rng.int(6); k < n; k++) dropAt(freeSpot(0), rng.chance(0.35) ? { k: "gold", n: rng.range(8, 25) * d } : pickItem(d));
  centerCamera(true); updateSight();
  say(d === 1 ? "You enter the dungeon at 50 ft. Your torch hisses in the damp air." : "You are now at " + feet(d) + " ft.");
}
function freeSpot(minDist){
  for (let tries = 0; tries < 400; tries++){
    const r = rng.pick(L.rooms), i = rng.pick(r.cells), x = i % MW, y = Math.floor(i / MW);
    if (L.tiles[i] === T.FLOOR && !monAt(x, y) && dist(x, y, player.x, player.y) >= minDist && !(minDist && visible(i))) return i;
  }
  return -1;
}
function dropAt(i, it){ if (i >= 0) floor.push({ x: i % MW, y: Math.floor(i / MW), it }); }
function pickMonster(d){
  const deep = rng.chance(0.1) ? 3 : 0;   // now and then, something from deeper down
  const pool = MONSTERS.filter(m => m.depth <= d + deep);
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
  fov(player.x, player.y, 45, blocks, (x, y) => {
    const i = idx(x, y); inFov[i] = turnNo;
    if (lum(lightTurn, 3 * i) > 0.03){ seenAt[i] = turnNo; mem[i] = 1; }
  }, MW, MH);
  rebuildTerrain();
}
function centerCamera(force){
  const ox = cam.x, oy = cam.y, mx = Math.max(0, MW - GW), my = Math.max(0, MH - VH);
  // the view moves in steps when you near its edge, like Moria's panels, rather than on every step
  if (force || player.x - cam.x < GW * 0.2 || player.x - cam.x > GW * 0.8) cam.x = Math.max(0, Math.min(mx, player.x - (GW >> 1)));
  if (force || player.y - cam.y < VH * 0.2 || player.y - cam.y > VH * 0.8) cam.y = Math.max(0, Math.min(my, player.y - (VH >> 1)));
  if (screen && (ox !== cam.x || oy !== cam.y)) for (const b of world.bodies){ b.x += (ox - cam.x) * screen.cw; b.y += (oy - cam.y) * screen.ch; }
}
// The engine's terrain for the debris: the walls on screen, plus the message and status rows.
function rebuildTerrain(){
  if (!screen || !L) return;
  const solid = new Uint8Array(GW * GH);
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++){
    const my = cam.y + r - VY, mx = cam.x + c;
    solid[r * GW + c] = r < VY || r >= VY + VH || mx >= MW || my >= MH || opaque(L.tiles[idx(mx, my)]) ? 1 : 0;
  }
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid, mat: BITS };
}

/* ---------- the player's actions: each returns true when it took a turn ---------- */
function tryMove(dx, dy){
  const x = player.x + dx, y = player.y + dy, i = idx(x, y), t = L.tiles[i], m = monAt(x, y);
  if (m) return attack(m);
  if (t === T.DOOR){ L.tiles[i] = T.OPEN; say("You open the door."); return true; }
  if (!passable(t)){ say(t <= T.WALL ? "There is a wall in the way." : "Something is in the way."); return false; }
  player.x = x; player.y = y;
  for (const f of itemsAt(x, y)) if (f.it.k === "gold"){ player.gold += f.it.n; say("You find " + f.it.n + " gold pieces."); floor.splice(floor.indexOf(f), 1); }
  const here = itemsAt(x, y);
  if (here.length === 1) say("You see " + itemName(here[0].it) + ".");
  else if (here.length > 1) say("You see several items here.");
  if (t === T.DOWN) say("There is a staircase down here.");
  if (t === T.UP) say("There is a staircase up here.");
  return true;
}
const hitChance = (skill, ac, extra = 0) => Math.max(5, Math.min(95, skill + 20 - ac * 0.8 + extra));
function attack(m){
  const K = m.K, name = theName(m), weak = player.food < 1000 ? -10 : 0;
  if (rng.int(100) < hitChance(skillOf(player, "fight"), K.ac, weak)){
    let dmg = Math.max(1, rng.dice(weaponDice()) + statMod(player.stats.str));
    const ambush = cls().ambush && m.sleep > 0;
    if (ambush) dmg *= 2;   // a Delver strikes a sleeping monster twice as hard
    m.sleep = 0;
    return damage(m, dmg, ambush ? "You ambush " + name + "." : "You hit " + name + "."), true;
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
  if (m.K.drop && rng.chance(m.K.drop)) dropAt(idx(m.x, m.y), rng.chance(0.6) ? { k: "gold", n: rng.range(5, 20) * depth } : pickItem(depth));
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
  }
}
// Bits that tumble from a kill (or sparks from a hit), lit by your torch.
function burst(x, y, rgb, n){
  if (!screen) return;
  const px = (x - cam.x + 0.5) * screen.cw, py = (y - cam.y + VY + 0.5) * screen.ch;
  for (let k = 0; k < n; k++){
    const a = Math.random() * 6.283, sp = 80 + Math.random() * 220, b = world.add(px, py, screen.ch * (0.18 + Math.random() * 0.15), "bits", rgb.map(v => v * 0.45), BITS);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 120; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 1.2 + Math.random() * 0.8;
  }
}
function pickUp(){
  const here = itemsAt(player.x, player.y);
  if (!here.length){ say("There is nothing here to pick up."); return false; }
  for (const f of here){
    const got = carry(f.it);
    if (!got){ say("You cannot carry any more."); break; }
    floor.splice(floor.indexOf(f), 1);
    say("You have " + itemName(got) + " (" + String.fromCharCode(97 + player.inv.indexOf(got)) + ").");
  }
  return true;
}
function takeStairs(down){
  const t = L.tiles[idx(player.x, player.y)];
  if (t !== (down ? T.DOWN : T.UP)){ say("There is no staircase " + (down ? "down" : "up") + " here."); return false; }
  say(down ? "You descend the stairs." : "You climb the stairs.");
  newLevel(depth + (down ? 1 : -1));
  return "level";
}
function useItem(it, how){
  const K = ITEM[it.k], take = () => { if (--it.n <= 0) player.inv.splice(player.inv.indexOf(it), 1); };
  if (how === "eat"){ player.food = Math.min(15000, player.food + K.food); say("That tastes good."); take(); return true; }
  if (how === "quaff"){
    const h = rng.dice(K.heal); player.hp = Math.min(player.mhp, player.hp + h);
    say(player.hp >= player.mhp ? "You feel very good." : "You feel better."); take(); return true;
  }
  if (how === "fuel"){
    const lt = player.eq.light;
    if (!lt || !ITEM[lt.k].maxFuel){ say("You need a lantern to pour the oil into."); return false; }
    lt.fuel = Math.min(ITEM[lt.k].maxFuel, lt.fuel + K.fuel); say("You fill your lantern."); take(); return true;
  }
  if (how === "wield"){
    const slot = K.slot, one = { ...it, n: 1 };
    take();
    const old = player.eq[slot]; player.eq[slot] = one;
    if (old) carry(old);
    say((slot === "body" ? "You are wearing " : slot === "light" ? "Your light source is " : "You are wielding ") + itemName(one) + ".");
    return true;
  }
  if (how === "drop"){
    floor.push({ x: player.x, y: player.y, it: { ...it } }); player.inv.splice(player.inv.indexOf(it), 1);
    say("You drop " + itemName(it) + "."); return true;
  }
  return false;
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
function aim(prompt, fn){ aiming = fn; oldMsgs = []; msgs = []; say(prompt + " Direction? (" + (touchMode ? "D-pad, A nearest, B cancel" : "a direction key, ' or t for nearest, Esc") + ")"); }
function aimAt(dx, dy){ const f = aiming; aiming = null; act(() => f(player.x + dx * 20, player.y + dy * 20)); }
function aimNearest(){
  const m = nearestTarget(); if (!m){ aiming = null; oldMsgs = []; msgs = []; say("There is nothing in sight to aim at."); return; }
  const f = aiming; aiming = null; act(() => f(m.x, m.y));
}
function throwItem(it){
  const K = ITEM[it.k];
  aim("Throw " + itemName({ ...it, n: 1 }) + ".", (tx, ty) => {
    const { path, m } = flight(tx, ty, 10), one = { ...it, n: 1 };
    if (--it.n <= 0) player.inv.splice(player.inv.indexOf(it), 1);
    if (!path.length){ dropAt(idx(player.x, player.y), one); say("It drops at your feet."); return true; }
    shots.push({ path, t: 0, speed: 35, glyph: K.glyph, rgb: K.rgb });
    const delay = path.length / 35, end = path[path.length - 1];
    let lands = true;
    if (m){
      const hit = rng.int(100) < hitChance(skillOf(player, "shoot"), m.K.ac, -2 * path.length + (K.throw ? 10 : 0));
      if (hit){
        const dmg = Math.max(1, rng.dice(K.dice || "1d1") + (K.throw ? Math.max(0, statMod(player.stats.dex)) : 0));
        damage(m, dmg, "The " + K.name.toLowerCase() + " hits " + theName(m) + ".", delay);
        if (K.throw && rng.chance(0.25)) lands = false;   // darts sometimes break
      } else say("The " + K.name.toLowerCase() + " misses " + theName(m) + ".");
    }
    if (lands) dropAt(idx(end[0], end[1]), one);
    return true;
  });
}
function cast(){
  const C = cls(), P = POWERS[powerFor(C)];
  if (!P){ say("You know no spells or prayers."); return false; }
  if (player.mana < P.cost){ say("You do not have enough mana to " + (C.realm === "holy" ? "pray " : "cast ") + P.name + "."); return false; }
  const fail = Math.max(5, Math.min(95, 30 - 3 * statMod(player.stats[C.stat]) - 2 * (player.lvl - 1)));
  const go = (tx, ty) => {
    player.mana -= P.cost;
    if (rng.int(100) < fail){ say(C.realm === "holy" ? "You lose your concentration." : "You failed to get the spell off!"); return true; }
    if (P.heal){ const h = rng.dice(P.heal) + player.lvl; player.hp = Math.min(player.mhp, player.hp + h); say("A warm light closes your wounds."); flashes.push({ x: player.x, y: player.y, t: 0.4, t0: 0.4, rgb: [1.0, 0.85, 0.5] }); return true; }
    // Spark: a bolt of light that always hits the first monster in its path
    const { path, m } = flight(tx, ty, 15);
    if (!path.length){ say("The spark fizzles against the wall."); return true; }
    shots.push({ path, t: 0, speed: 40, glyph: "*", rgb: [1.8, 1.7, 1.0], light: SPARK_RGB });
    const delay = path.length / 40, end = path[path.length - 1];
    later.push({ t: delay, fn: () => { flashes.push({ x: end[0], y: end[1], t: 0.35, t0: 0.35, rgb: SPARK_RGB }); burst(end[0], end[1], [1.6, 1.4, 0.6], 3); } });
    if (m) damage(m, rng.dice(P.dice) + Math.floor(player.lvl / 2), "The spark strikes " + theName(m) + ".", delay);
    return true;
  };
  if (P.aim) aim("Cast " + P.name + ".", go);
  else act(() => go());
  return false;
}

/* ---------- a turn: the player acts, then everyone faster or as fast acts until it is the player's turn again ---------- */
function act(fn){
  if (state !== "play") return false;
  oldMsgs = msgs.length ? msgs : oldMsgs; msgs = [];
  const r = fn();
  if (!r) return false;
  if (r !== "level") endTurn();
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
let disturbed = false;
function everyTurn(){
  // food and light burn away, and wounds and mana slowly come back
  player.food--;
  if (player.food === 2000) say("You are getting hungry.");
  if (player.food === 1000) say("You are getting weak from hunger.");
  if (player.food === 0) say("You are starving!");
  if (player.food < 0 && player.food % 10 === 0) hurt(1, "starvation");
  const lt = player.eq.light;
  if (lt && lt.fuel > 0){
    lt.fuel--;
    if (lt.fuel === 500) say("Your light is growing faint.");
    if (lt.fuel === 0) say("Your light has gone out!");
  }
  const k = resting ? 2 : 1;
  if (player.food > 1000 && player.hp < player.mhp){
    player.regen += (0.03 + player.mhp * 0.004) * k * (race().regen || 1);
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
  scores.push(entry); scores.sort((a, b) => b.score - a.score); scores = scores.slice(0, 5); store("scores", scores);
  tomb = { ...entry, best: scores[0] === entry, at: feet(depth) };
  say("You die.");
}
function monsterTurn(m){
  const K = m.K, d = dist(m.x, m.y, player.x, player.y);
  if (m.sleep > 0){   // noise nearby wakes it; a stealthy character makes less of it
    const st = skillOf(player, "stealth");
    if (d < 16 - st) m.sleep -= rng.range(0, Math.max(1, 6 - st));
    return;
  }
  if (K.still){ if (d <= 1) monsterAttack(m); return; }
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
  for (const [dice, verb] of K.blows){
    if (state !== "play") return;
    if (rng.int(100) < Math.max(15, Math.min(95, 60 + 2 * K.depth - armour()))){
      let dmg = rng.dice(dice);
      if (verb === "burns" && race().fireRes){ dmg = Math.ceil(dmg / 2); say(name + " burns you, but you resist the heat."); }
      else say(name + " " + verb + " you.");
      hurt(dmg, "a " + K.name);
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
  player = { ...p, name: cr.name, x: 0, y: 0, exp: 0, energy: 100, speed: 0, food: 5000, gold: rng.range(40, 120), regen: 0, mregen: 0,
    inv: [], eq: { weapon: makeItem(weapon), body: makeItem("jerkin"), light: makeItem("torch") }, maxDepth: 1, kills: 0, turns: 0 };
  player.mhp = player.hp = firstHp(player); player.mmana = player.mana = maxMana(player);
  for (const [k, n] of [["torch", 2], ["ration", 4], ["heal", 2], ...(C.kit || [])]) carry(makeItem(k, n));
  log = []; msgs = []; oldMsgs = []; killer = ""; tomb = null; cr = null;
  state = "play"; stateT = 0;
  newLevel(1);
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
    const pw = POWERS[powerFor(K)]; para(pw ? (K.realm === "holy" ? "Prays " : "Casts ") + pw.name + ": " + pw.desc + "." : "No magic.", DIM);
    para("Titles: " + K.titles.slice(0, 3).join(", ") + " ...", DIM);
  } else {
    text(x1, y++, cr.name + ", " + R.name + " " + C.name, ACCENT); y++;
    for (let i = 0; i < 6; i += 2) text(x1, y++, statLine(p.stats, STATS[i]).padEnd(14) + statLine(p.stats, STATS[i + 1]), WHITE);
    y++;
    text(x1, y++, "Hit points " + firstHp(p) + (C.realm ? "   Mana " + maxMana(p) : ""), WHITE);
    for (const k of SKILLS){ const v = skillOf(p, k); text(x1, y++, SKILL_NAMES[k].padEnd(15) + (k === "stealth" ? stealthWord(v) : skillWord(v)), DIM); }
    if (cr.step === 2 && cr.mode === "buy") { y++; text(x1, y++, "Points left: " + (BUY_POINTS - buySpent(cr.buy)) + " of " + BUY_POINTS, ACCENT); }
    if (cr.step === 3){ y++; para(touchMode ? "A begins; B goes back." : "Type to change the name. Enter begins; Esc goes back.", DIM); }
  }
  const hint = touchMode ? "D-PAD CHOOSE   A SELECT   B BACK" : "ARROWS CHOOSE   ENTER SELECT   ESC BACK";
  text(x0, GH - 1, hint, DIM);
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, TEXT_LAYER, s.charCodeAt(i)); }   // stays letters in pixel mode
const center = (gy, s, rgb) => text(Math.floor((GW - s.length) / 2), gy, s, rgb);
function drawMap(t){
  computeLight(lightNow, t);
  for (let r = 0; r < VH; r++) for (let c = 0; c < GW; c++){
    const x = cam.x + c, y = cam.y + r; if (x >= MW || y >= MH) continue;
    const i = idx(x, y), tile = L.tiles[i], [g, base] = TILE[tile], j = 3 * i;
    // drawn lit: what the turn saw, plus anything in sight that a flying spell or flash lights up right now
    if (visible(i) || (inFov[i] === turnNo && lum(lightNow, j) > 0.03)){
      const k = 1.7;
      put(c, VY + r, [base[0] * lightNow[j] * k, base[1] * lightNow[j + 1] * k, base[2] * lightNow[j + 2] * k], 1, 1, g.charCodeAt(0));
    } else if (mem[i]) put(c, VY + r, [base[0] * MEM_RGB[0] * 2, base[1] * MEM_RGB[1] * 2, base[2] * MEM_RGB[2] * 2], 1, 1, g.charCodeAt(0));   // remembered: dim and blue
  }
  const shade = i => Math.max(0.55, Math.min(1.3, 0.45 + lum(lightNow, 3 * i) * 1.2));
  for (const f of floor){ const i = idx(f.x, f.y); if (!visible(i)) continue;
    const K = f.it.k === "gold" ? { glyph: "$", rgb: [1.4, 1.15, 0.3] } : ITEM[f.it.k];
    put(f.x - cam.x, VY + f.y - cam.y, K.rgb, shade(i), TEXT_LAYER, K.glyph.charCodeAt(0)); }
  for (const m of mons){ if (!m.K || !seesMon(m)) continue; const i = idx(m.x, m.y), heat = byHeat(m);
    // seen only by infravision: a dull red shape
    put(m.x - cam.x, VY + m.y - cam.y, heat ? [1.2, 0.3, 0.25] : m.K.rgb, heat ? 0.9 : m.K.glow ? 1.4 : shade(i) * 1.15, TEXT_LAYER, m.K.glyph.charCodeAt(0)); }
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
  seg("AC " + armour(), WHITE); seg(feet(depth) + " ft", WHITE);
  x = 0;
  const seg2 = (s, rgb) => { text(x, GH - 1, s, rgb); x += s.length + 2; };
  seg2(lt ? ITEM[lt.k].name + " " + lt.fuel : "No light", lt && lt.fuel > 500 ? ACCENT : RED);
  if (food) seg2(food, RED);
  seg2("Gold " + p.gold, DIM);
  const hint = touchMode ? "B COMMANDS  START MENU" : "? HELP  ESC MENU";
  if (x + hint.length <= GW) text(GW - hint.length, GH - 1, hint, DIM);
}
function drawTitle(t){
  // a lit chamber behind the title: the first level, shown by a flickering torch
  if (!L){ rng = new RNG(4242); player = { x: 0, y: 0, eq: { light: { k: "torch", fuel: 4000 } }, lvl: 1 }; L = generateLevel(rng, 1); mons = []; floor = []; roomLight.fill(0);
    const r = L.rooms.reduce((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a); player.x = r.cx; player.y = r.cy; centerCamera(true);
    for (let i = 0; i < MW * MH; i++) if (L.room[i] === r.id){ roomLight[3 * i] = ROOM_RGB[0] * 0.6; roomLight[3 * i + 1] = ROOM_RGB[1] * 0.6; roomLight[3 * i + 2] = ROOM_RGB[2] * 0.6; } }   // the biggest room, dimly lit
  computeLight(lightNow, t);
  for (let r = 0; r < VH; r++) for (let c = 0; c < GW; c++){
    const x = cam.x + c, y = cam.y + r; if (x >= MW || y >= MH) continue;
    const i = idx(x, y), j = 3 * i, v = lum(lightNow, j); if (v < 0.02) continue;
    const [g, base] = TILE[L.tiles[i]];
    put(c, VY + r, [base[0] * lightNow[j] * 1.7, base[1] * lightNow[j + 1] * 1.7, base[2] * lightNow[j + 2] * 1.7], 1, 1, g.charCodeAt(0));
  }
  const top = Math.max(1, (GH >> 1) - 9);
  center(top, "T O R C H L I G H T", ACCENT); center(top + 1, "D U N G E O N S", ACCENT);
  center(top + 3, "A dungeon crawl after Moria", DIM);
  const blink = (performance.now() / 500 | 0) % 2;
  center(top + 5, touchMode ? "PRESS A OR START TO BEGIN" : "PRESS SPACE TO BEGIN", blink ? WHITE : DIM);
  center(top + 6, "Early version: no saves yet.", DIM);
  if (scores.length){
    center(top + 9, "HALL OF FAME", ACCENT);
    scores.forEach((s, k) => center(top + 10 + k, `${String(s.score).padStart(6)}  ${s.name || ""} ${s.race || ""} ${s.cls || "Fighter"}  LV ${s.lvl}  ${s.depth} ft  ${s.killer}`.replace(/  +/g, "  ").slice(0, GW - 2), k ? DIM : WHITE));
  }
}
function drawTomb(){
  const T0 = tomb, lines = ["R.I.P.", "", T0.name, "the " + T0.race + " " + T0.cls, "of level " + T0.lvl, "killed by " + T0.killer, "at " + T0.at + " ft", "", "Score " + T0.score + (T0.best ? "  (best!)" : ""), "",
    touchMode ? "Press A for the title" : "Press Space for the title"];
  const w = 34, top = Math.max(2, (GH >> 1) - 8), x0 = (GW - w) >> 1;
  for (let r = 0; r < lines.length + 4; r++) text(x0, top + r, r === 0 || r === lines.length + 3 ? "+" + "-".repeat(w - 2) + "+" : "|" + " ".repeat(w - 2) + "|", DIM);
  lines.forEach((s, k) => text(x0 + ((w - s.length) >> 1), top + 2 + k, s, k === 0 ? ACCENT : WHITE));
}
function draw(t){
  screen.clear();
  if (state === "title") drawTitle(t);
  else if (state === "create") drawCreate();
  else { drawMap(t); drawUI(); if (state === "dead" && stateT > 1) drawTomb(); }
  const mt = (m, title, note) => { if (m.open) m.draw({ text: (x, y, str, rgb) => { for (let i = 0; i < str.length; i++) put(x + i, y, rgb, 1, MENU_LAYER, str.charCodeAt(i)); }, GW, GH, accent: ACCENT, normal: WHITE, dim: DIM, title, note }); };
  mt(list, listTitle, listNote); mt(menu, state === "title" ? "MENU" : "PAUSED", "THIS EARLY VERSION DOES NOT SAVE");
  screen.render(ctx);
}

/* ---------- lists: commands, inventory, character sheet, help ---------- */
let listRows = [], listTitle = "", listNote = "";
const list = createMenu(() => listRows);
function openList(title, rows, note = ""){ listTitle = title; listRows = rows; listNote = note; list.at = 0; if (!list.open) list.show(); }
const info = s => ({ label: s, select: () => {} });
const done = fn => () => { list.hide(); fn(); };
function commandList(){
  const P = POWERS[powerFor(cls())];
  openList("COMMANDS", [
    { label: "Inventory", select: () => inventoryList() },
    { label: "Pick up", select: done(() => act(pickUp)) },
    { label: "Take the stairs", select: done(() => { const t = L.tiles[idx(player.x, player.y)]; act(() => takeStairs(t !== T.UP)); }) },
    ...(P ? [{ label: (cls().realm === "holy" ? "Pray " : "Cast ") + P.name + " (" + P.cost + " MP)", select: done(cast) }] : []),
    { label: "Throw", select: () => inventoryList(() => true, "throw") },
    { label: "Rest until healed", select: done(rest) },
    { label: "Wait a turn", select: done(() => act(() => true)) },
    { label: "Look around", select: done(look) },
    { label: "Character", select: () => characterList() },
    { label: "Messages", select: () => messageList() },
    { label: "Help", select: () => helpList() }
  ]);
}
function inventoryList(filter, verb){
  const rows = [];
  for (const slot of ["weapon", "body", "light"]){ const it = player.eq[slot]; if (it && !filter) rows.push(info(slot.padEnd(7) + itemName(it))); }
  const items = player.inv.map((it, k) => [it, k]).filter(([it]) => !filter || filter(it));
  if (verb === "throw") items.sort((a, b) => !!ITEM[b[0].k].throw - !!ITEM[a[0].k].throw);   // darts first
  for (const [it, k] of items) rows.push({ label: String.fromCharCode(97 + k) + ") " + itemName(it), select: () => verb ? (list.hide(), verb === "throw" ? throwItem(it) : act(() => useItem(it, verb))) : itemActions(it) });
  if (!rows.length) rows.push(info(filter ? "Nothing suitable." : "You are carrying nothing."));
  openList(filter ? verb.toUpperCase() + " WHICH?" : "INVENTORY  " + player.inv.length + "/22", rows);
}
function verbsFor(it){
  const K = ITEM[it.k], v = [];
  if (K.use === "eat") v.push(["eat", "Eat"]);
  if (K.use === "quaff") v.push(["quaff", "Drink"]);
  if (K.use === "fuel") v.push(["fuel", "Fill lantern"]);
  if (K.slot) v.push(["wield", K.slot === "body" ? "Wear" : K.slot === "light" ? "Use as light" : "Wield"]);
  v.push(["throw", "Throw"], ["drop", "Drop"]);
  return v;
}
function itemActions(it){
  openList(itemName(it).toUpperCase().slice(0, 34), [...verbsFor(it).map(([how, label]) => ({ label, select: done(() => how === "throw" ? throwItem(it) : act(() => useItem(it, how))) })), { label: "Back", select: () => inventoryList() }]);
}
function characterList(){
  const p = player, R = race(), C = cls(), s = p.stats;
  openList("CHARACTER", [
    info(p.name + ", " + R.name + " " + C.name), info("Title: " + titleOf(p)),
    info("Level " + p.lvl + "   Exp " + Math.floor(p.exp) + " / " + expNeeded(p, p.lvl + 1)),
    info("HP " + p.hp + "/" + p.mhp + (p.mmana ? "  MP " + p.mana + "/" + p.mmana : "") + "  AC " + armour()),
    info(statLine(s, "str").padEnd(15) + statLine(s, "int")), info(statLine(s, "wis").padEnd(15) + statLine(s, "dex")), info(statLine(s, "con").padEnd(15) + statLine(s, "cha")),
    ...SKILLS.map(k => { const v = skillOf(p, k); return info(SKILL_NAMES[k].padEnd(15) + (k === "stealth" ? stealthWord(v) : skillWord(v))); }),
    info("Infravision".padEnd(15) + (R.infra ? R.infra * 10 + " ft" : "none")), info("Hit die".padEnd(15) + "d" + hitDie(p)),
    info("Exp penalty".padEnd(15) + "+" + (R.xp + C.xp) + "%"),
    info("Weapon " + weaponDice() + "   Gold " + p.gold), info("Deepest " + feet(p.maxDepth) + " ft   Kills " + p.kills), info("Turns " + p.turns)
  ]);
}
function messageList(){ openList("MESSAGES", log.length ? log.slice(-60).reverse().flatMap(s => wrap(s, 34).map(info)) : [info("No messages yet.")], "NEWEST FIRST"); }
function helpList(){
  const ro = keySet === "roguelike";
  openList("HELP", [
    info(ro ? "hjklyubn  move (Shift runs)" : "Arrows/numpad  move"), info(ro ? "arrows also move" : "Shift + move  run"),
    info("Walk into a monster to attack"), info("Walk into a door to open it"),
    info("g or ,  pick up"), info("i  inventory    E  eat"), info("q  drink    w  wield/wear"), info("F  fill lantern  d  drop"),
    info("m  cast or pray   v  throw"), info("  then a direction, or ' / t"), info("  for the nearest monster"),
    info(">  <  take the stairs"), info("R  rest   " + (ro ? "." : ". or 5") + "  wait"), info((ro ? "x" : "l") + "  look   C  character"),
    info("Ctrl+P  messages"), info("Esc  menu"),
    info("Touch: D-pad moves (8 ways),"), info("A acts here, B commands")
  ], "KEYS CAN BE CHANGED IN THE MENU");
}
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "play" ? "NEW CHARACTER" : "START", select: () => { menu.hide(); startCreate(); } },
  { label: "KEYS", value: () => keySet === "roguelike" ? "ROGUELIKE" : "ORIGINAL", change: () => { keySet = keySet === "roguelike" ? "original" : "roguelike"; store("keys", keySet); } },
  { label: "CONTROLS", value: () => touchMode ? "TOUCH" : "KEYBOARD", change: () => setControls(!touchMode, true) },
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
  else if (k === "E") inventoryList(it => ITEM[it.k].use === "eat", "eat");
  else if (k === "q") inventoryList(it => ITEM[it.k].use === "quaff", "quaff");
  else if (k === "w") inventoryList(it => !!ITEM[it.k].slot, "wield");
  else if (k === "F") inventoryList(it => ITEM[it.k].use === "fuel", "fuel");
  else if (k === "d") inventoryList(() => true, "drop");
  else if (k === "v") inventoryList(() => true, "throw");
  else if (k === "m" || k === "p") cast();
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

const CTRL_KEY = "controls";
let touchMode = matchMedia("(pointer: coarse)").matches;   // default follows the device; the menu's Controls row overrides it
{ const c = load(CTRL_KEY, null); if (c) touchMode = c === "touch"; }
function setControls(touch, save){
  touchMode = touch; document.body.classList.toggle("touch", touch); $("gamepad").hidden = !touch;
  if (save) store(CTRL_KEY, touch ? "touch" : "keyboard");
}
setControls(touchMode, false);
const buzz = () => navigator.vibrate && navigator.vibrate(8);
// The D-pad picks one of eight directions from the angle of the thumb; holding it keeps walking.
const dpad = $("dpad");
let holdDir = 0, holdT = 0;
function dpadAt(e){
  const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  if (Math.hypot(dx, dy) < r.width * 0.1) return 0;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));   // 0 east, 2 south, -2 north, 4 / -4 west
  return { 0: 6, 1: 3, 2: 2, 3: 1, 4: 4, [-4]: 4, [-3]: 7, [-2]: 8, [-1]: 9 }[a];
}
function dpadPress(d){
  const was = holdDir; holdDir = d;
  dpad.dataset.dir = !d ? "" : d === 8 ? "up" : d === 2 ? "down" : [1, 4, 7].includes(d) ? "left" : "right";
  if (!d || d === was) return;
  buzz();
  if (list.open || menu.open){ const m = list.open ? list : menu; d === 8 ? m.move(-1) : d === 2 ? m.move(1) : d === 4 ? m.change(-1) : d === 6 ? m.change(1) : 0; holdDir = 0; return; }
  if (state === "create"){ holdDir = 0; if ([8, 2, 4, 6].includes(d)) crKey({ 8: "up", 2: "down", 4: "left", 6: "right" }[d]); return; }
  if (state !== "play") return;
  if (aiming){ holdDir = 0; return aimAt(...DIRS[d]); }
  disturbed = false; holdT = 0.3;   // a short pause before walking on
  act(() => tryMove(...DIRS[d]));
}
dpad.addEventListener("pointerdown", e => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); dpadPress(dpadAt(e)); });
dpad.addEventListener("pointermove", e => { if (dpad.hasPointerCapture(e.pointerId)) dpadPress(dpadAt(e)); });
for (const ev of ["pointerup", "pointercancel"]) dpad.addEventListener(ev, () => { holdDir = 0; dpad.dataset.dir = ""; });
document.querySelectorAll("[data-pad]").forEach(b => {
  const id = b.dataset.pad;
  b.addEventListener("pointerdown", e => {
    e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); buzz();
    if (list.open){ id === "a" ? list.choose() : list.hide(); return; }   // in a list: A chooses, any other button closes
    if (menu.open){ id === "a" ? menu.choose() : menu.hide(); return; }
    if (state === "title"){ if (id === "a" || id === "start") startCreate(); else if (id === "select") menu.show(); return; }
    if (state === "create"){ if (id === "a" || id === "start") crChoose(); else if (id === "b") crBack(); else menu.show(); return; }
    if (state === "dead"){ if (stateT > 1 && (id === "a" || id === "start")) toTitle(); return; }
    if (aiming){ if (id === "a") aimNearest(); else { aiming = null; oldMsgs = []; msgs = []; say("Never mind."); } return; }
    if (id === "start" || id === "select") return menu.show();
    if (id === "a") contextAction(); else commandList();
  });
  const up = () => b.classList.remove("on");
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
});
cv.addEventListener("pointerdown", e => {
  const [gx, gy] = gridAt(e, cv, GW, GH);
  if (list.open) return list.tap(gx, gy);
  if (menu.open) return menu.tap(gx, gy);
  if (state === "title") return startCreate();
  if (state === "create"){ const i = gy - 4; if (i >= 0 && i < crRows().length){ cr.at = i; crChoose(); } return; }
  if (state === "dead"){ if (stateT > 1) toTitle(); return; }
  if (aiming) return aimNearest();
  if (!touchMode) commandList();   // a click opens the commands
});

/* ---------- layout and loop ---------- */
function layout(){
  const r = stage.getBoundingClientRect(); if (!r.width) return;
  const old = screen, dpr = Math.min(window.devicePixelRatio || 1, 3);
  // as large a font as fits at least 60 x 24 characters, up to 14px; the view grows with the space
  const f = Math.max(6, Math.min(14, Math.floor(r.width / 60 / 0.6), Math.floor(r.height / 24 / 1.15)));
  screen = new Screen(f, D); screen.fit(r.width, r.height, dpr);
  GW = Math.min(screen.cols, 140); GH = Math.min(screen.rows, 50); VH = GH - VY - 2;
  const W = GW * screen.cw, H = GH * screen.ch;
  screen.fit(W, H, dpr);
  cv.style.width = W + "px"; cv.style.height = H + "px"; cv.style.transform = "translate(-50%,-50%)";
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.w = W; world.h = H; world.unit = screen.cw; world.g = { x: 0, y: H * 1.2 };
  if (old) world.bodies.length = 0;
  if (player) centerCamera(true);
  rebuildTerrain();
}
let last = performance.now(), nextFrame = 0;
const FRAME_MS = 1000 / 60;
function tick(t){
  requestAnimationFrame(tick);
  if (t < nextFrame - 1) return;   // run at most ~60 times a second, even on faster displays
  nextFrame = t - nextFrame > FRAME_MS ? t + FRAME_MS : nextFrame + FRAME_MS;
  const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
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
let fitted = stage.getBoundingClientRect();
new ResizeObserver(() => {   // re-fit only for real size changes, not the mobile address bar sliding in and out
  const r = stage.getBoundingClientRect();
  if (Math.abs(r.width - fitted.width) < 1 && Math.abs(r.height - fitted.height) < fitted.height * 0.15) return;
  fitted = r; layout();
}).observe(stage);
requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
})();
