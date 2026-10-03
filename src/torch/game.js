(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Torchlight Dungeons, phase 1: a turn-based dungeon crawl after Moria. The rules run on the 198 x 66 map in
// gen.js; you see what your light (or a lit room, or a glowing monster) shows you. The engine draws the light and
// throws a little physics debris when something dies. See TORCHLIGHT_PLAN.md for what comes next.
const TORCH_RGB = [1.0, 0.62, 0.3], ROOM_RGB = [0.42, 0.42, 0.47], MEM_RGB = [0.07, 0.08, 0.12];
const WHITE = [1.6, 1.6, 1.6], DIM = [0.45, 0.48, 0.6], ACCENT = [1.6, 1.15, 0.5], RED = [1.6, 0.4, 0.35], GREEN = [0.6, 1.4, 0.6];
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
const idx = (x, y) => y * MW + x;
const blocks = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || opaque(L.tiles[y * MW + x]);
const visible = i => seenAt[i] === turnNo;
const monAt = (x, y) => mons.find(m => m.x === x && m.y === y);
const itemsAt = (x, y) => floor.filter(f => f.x === x && f.y === y);
const dist = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
function say(s){ msgs.push(s); log.push(s); if (log.length > 200) log.shift(); }

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
  return makeItem(rng.weighted(pool, k => 1 / k.rarity * (k.depth >= d - 3 ? 1.5 : 1)).id, 1);
}
const weaponDice = () => player.eq.weapon ? ITEM[player.eq.weapon.k].dice : "1d2";
const armour = () => (player.eq.body ? ITEM[player.eq.body.k].ac : 0) + Math.floor(player.lvl / 3);
function lightRadius(){
  const it = player.eq.light; if (!it || it.fuel <= 0) return 0;
  const R = ITEM[it.k].radius; return it.fuel < 100 ? 1 : it.fuel < 500 ? R - 1 : R;
}

/* ---------- levels ---------- */
function newLevel(d){
  depth = d; player.maxDepth = Math.max(player.maxDepth, d);
  L = generateLevel(rng, d);
  mem.fill(0); mons = [player]; floor = []; world.bodies.length = 0;
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
function attack(m){
  const K = m.K, name = visible(idx(m.x, m.y)) ? "the " + K.name : "it";
  const weak = player.food < 1000 ? 10 : 0;
  if (rng.int(100) < Math.max(10, Math.min(95, 60 + 3 * player.lvl - K.ac - weak))){
    const dmg = rng.dice(weaponDice()) + Math.floor(player.lvl / 5);
    m.hp -= dmg; m.sleep = 0;
    if (m.hp <= 0) return kill(m, name), true;
    say("You hit " + name + ".");
    if (K.flee && m.hp < m.mhp * 0.3) m.afraid = 10;
  } else say("You miss " + name + ".");
  return true;
}
function kill(m, name){
  say("You have slain " + name + ".");
  mons.splice(mons.indexOf(m), 1); player.kills++;
  gainExp(m.K.exp * m.K.depth / player.lvl);
  if (m.K.drop && rng.chance(m.K.drop)) dropAt(idx(m.x, m.y), rng.chance(0.6) ? { k: "gold", n: rng.range(5, 20) * depth } : pickItem(depth));
  burst(m.x, m.y, m.K.rgb);
}
function gainExp(e){
  player.exp += e;
  while (player.exp >= expFor(player.lvl + 1) && player.lvl < 40){
    player.lvl++; const up = rng.range(5, 11); player.mhp += up; player.hp += up;
    say("Welcome to level " + player.lvl + ".");
  }
}
// A kill bursts into a few tumbling bits in the monster's colour, lit by your torch.
function burst(x, y, rgb){
  if (!screen) return;
  const px = (x - cam.x + 0.5) * screen.cw, py = (y - cam.y + VY + 0.5) * screen.ch;
  for (let k = 0; k < 7; k++){
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
  for (const m of mons) if (m.K){ const v = visible(idx(m.x, m.y)); if (v && !m.seen) disturbed = true; m.seen = v; }
}
let disturbed = false, hpBefore = 0;
function everyTurn(){
  // food and light burn away, and wounds slowly heal
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
  if (player.food > 1000 && player.hp < player.mhp){
    player.regen += 0.03 + player.mhp * 0.004 * (resting ? 2 : 1);
    while (player.regen >= 1 && player.hp < player.mhp){ player.hp++; player.regen--; }
  }
}
function hurt(n, by){
  player.hp -= n; disturbed = true;
  if (player.hp <= 0){ killer = by; die(); }
}
function die(){
  state = "dead"; stateT = 0;
  const entry = { score: Math.floor(player.exp) + 100 * player.maxDepth, lvl: player.lvl, depth: feet(player.maxDepth), killer };
  scores.push(entry); scores.sort((a, b) => b.score - a.score); scores = scores.slice(0, 5); store("scores", scores);
  tomb = { ...entry, best: scores[0] === entry, turns: player.turns };
  say("You die.");
}
function monsterTurn(m){
  const K = m.K, d = dist(m.x, m.y, player.x, player.y);
  if (m.sleep > 0){ if (d < 14) m.sleep -= rng.range(1, 3); return; }   // noise nearby wakes it, sooner the closer you are
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
  const K = m.K, name = visible(idx(m.x, m.y)) ? "The " + K.name : "It";
  for (const [dice, verb] of K.blows){
    if (state !== "play") return;
    if (rng.int(100) < Math.max(15, Math.min(95, 60 + 2 * K.depth - armour()))){ say(name + " " + verb + " you."); hurt(rng.dice(dice), "a " + K.name); }
    else say(name + " misses you.");
  }
}

/* ---------- longer actions: running and resting stop when something happens ---------- */
let resting = false;
function run(dx, dy){
  if (state !== "play") return;
  disturbed = false;
  const open = (x, y) => passable(L.tiles[idx(x, y)]) && !monAt(x, y);
  for (let n = 0; n < 200 && state === "play" && !disturbed; n++){
    if (mons.some(m => m.K && visible(idx(m.x, m.y)) && !m.K.still)) break;
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
  if (player.hp >= player.mhp){ say("You are already fully rested."); return; }
  disturbed = false; resting = true;
  for (let n = 0; n < 1000 && state === "play" && !disturbed && player.hp < player.mhp; n++){
    if (mons.some(m => m.K && visible(idx(m.x, m.y)))){ say("You cannot rest with monsters nearby."); break; }
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
  const seen = mons.filter(m => m.K && visible(idx(m.x, m.y)));
  oldMsgs = []; msgs = [];
  if (!seen.length) say("You see no monsters.");
  for (const m of seen.slice(0, 4)) say("You see a " + m.K.name + (m.sleep > 0 ? " (asleep)" : "") + ". " + m.K.desc);
}

/* ---------- a new character (phase 1: a human fighter) ---------- */
function newGame(){
  rng = new RNG((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  player = { x: 0, y: 0, hp: 24, mhp: 24, lvl: 1, exp: 0, energy: 100, speed: 0, food: 5000, gold: rng.range(40, 120), regen: 0,
    inv: [], eq: { weapon: makeItem("shortsword"), body: makeItem("jerkin"), light: makeItem("torch") }, maxDepth: 1, kills: 0, turns: 0 };
  for (const [k, n] of [["torch", 2], ["ration", 4], ["heal", 2]]) carry(makeItem(k, n));
  log = []; msgs = []; oldMsgs = []; killer = ""; tomb = null;
  state = "play"; stateT = 0;
  newLevel(1);
}

/* ---------- drawing ---------- */
function put(gx, gy, rgb, k, layer, code){ if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) screen.put(gy * GW + gx, rgb[0] * k, rgb[1] * k, rgb[2] * k, layer, code); }
function text(gx, gy, s, rgb){ for (let i = 0; i < s.length; i++) put(gx + i, gy, rgb, 1, TEXT_LAYER, s.charCodeAt(i)); }   // stays letters in pixel mode
const center = (gy, s, rgb) => text(Math.floor((GW - s.length) / 2), gy, s, rgb);
function drawMap(t){
  computeLight(lightNow, t);
  for (let r = 0; r < VH; r++) for (let c = 0; c < GW; c++){
    const x = cam.x + c, y = cam.y + r; if (x >= MW || y >= MH) continue;
    const i = idx(x, y), tile = L.tiles[i], [g, base] = TILE[tile];
    if (visible(i)){
      const j = 3 * i, k = 1.7;
      put(c, VY + r, [base[0] * lightNow[j] * k, base[1] * lightNow[j + 1] * k, base[2] * lightNow[j + 2] * k], 1, 1, g.charCodeAt(0));
    } else if (mem[i]) put(c, VY + r, [base[0] * MEM_RGB[0] * 2, base[1] * MEM_RGB[1] * 2, base[2] * MEM_RGB[2] * 2], 1, 1, g.charCodeAt(0));   // remembered: dim and blue
  }
  const shade = i => Math.max(0.55, Math.min(1.3, 0.45 + lum(lightNow, 3 * i) * 1.2));
  for (const f of floor){ const i = idx(f.x, f.y); if (!visible(i)) continue;
    const K = f.it.k === "gold" ? { glyph: "$", rgb: [1.4, 1.15, 0.3] } : ITEM[f.it.k];
    put(f.x - cam.x, VY + f.y - cam.y, K.rgb, shade(i), TEXT_LAYER, K.glyph.charCodeAt(0)); }
  for (const m of mons){ if (!m.K) continue; const i = idx(m.x, m.y); if (!visible(i)) continue;
    put(m.x - cam.x, VY + m.y - cam.y, m.K.rgb, m.K.glow ? 1.4 : shade(i) * 1.15, TEXT_LAYER, m.K.glyph.charCodeAt(0)); }
  if (state === "play") put(player.x - cam.x, VY + player.y - cam.y, [1.7, 1.55, 1.2], 1, TEXT_LAYER, 64);
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
  const s1 = `Fighter  LV ${p.lvl}  EXP ${Math.floor(p.exp)}/${expFor(p.lvl + 1)}  `, hp = `HP ${Math.max(0, p.hp)}/${p.mhp}`, s2 = `  AC ${armour()}  ${feet(depth)} ft`;
  text(0, GH - 2, s1, WHITE); text(s1.length, GH - 2, hp, low ? RED : GREEN); text(s1.length + hp.length, GH - 2, s2, WHITE);
  const lightTxt = lt ? (ITEM[lt.k].name + " " + lt.fuel) : "No light";
  text(0, GH - 1, lightTxt, lt && lt.fuel > 500 ? ACCENT : RED);
  if (food) text(lightTxt.length + 2, GH - 1, food, RED);
  const gold = "Gold " + p.gold; text(lightTxt.length + (food ? food.length + 4 : 2), GH - 1, gold, DIM);
  const hint = touchMode ? "B COMMANDS  START MENU" : "? HELP  ESC MENU";
  text(GW - hint.length, GH - 1, hint, DIM);
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
  center(top + 6, "Early version: one character type, no saves yet.", DIM);
  if (scores.length){
    center(top + 9, "HALL OF FAME", ACCENT);
    scores.forEach((s, k) => center(top + 10 + k, `${String(s.score).padStart(6)}  Fighter LV ${String(s.lvl).padStart(2)}  ${String(s.depth).padStart(5)} ft  ${s.killer}`.slice(0, GW - 2), k ? DIM : WHITE));
  }
}
function drawTomb(){
  const T0 = tomb, lines = ["R.I.P.", "", "A Fighter of level " + T0.lvl, "killed by " + T0.killer, "at " + feet(depth) + " ft", "", "Score " + T0.score + (T0.best ? "  (best!)" : ""), "",
    touchMode ? "Press A for the title" : "Press Space for the title"];
  const w = 34, top = Math.max(2, (GH >> 1) - 7), x0 = (GW - w) >> 1;
  for (let r = 0; r < lines.length + 4; r++) text(x0, top + r, r === 0 || r === lines.length + 3 ? "+" + "-".repeat(w - 2) + "+" : "|" + " ".repeat(w - 2) + "|", DIM);
  lines.forEach((s, k) => text(x0 + ((w - s.length) >> 1), top + 2 + k, s, k === 0 ? ACCENT : WHITE));
}
function draw(t){
  screen.clear();
  if (state === "title") drawTitle(t);
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
  openList("COMMANDS", [
    { label: "Inventory", select: () => inventoryList() },
    { label: "Pick up", select: done(() => act(pickUp)) },
    { label: "Take the stairs", select: done(() => { const t = L.tiles[idx(player.x, player.y)]; act(() => takeStairs(t !== T.UP)); }) },
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
  player.inv.forEach((it, k) => { if (!filter || filter(it)) rows.push({ label: String.fromCharCode(97 + k) + ") " + itemName(it), select: () => verb ? (list.hide(), act(() => useItem(it, verb))) : itemActions(it) }); });
  if (!rows.length) rows.push(info(filter ? "Nothing suitable." : "You are carrying nothing."));
  openList(filter ? verb.toUpperCase() + " WHICH?" : "INVENTORY  " + player.inv.length + "/22", rows);
}
function verbsFor(it){
  const K = ITEM[it.k], v = [];
  if (K.use === "eat") v.push(["eat", "Eat"]);
  if (K.use === "quaff") v.push(["quaff", "Drink"]);
  if (K.use === "fuel") v.push(["fuel", "Fill lantern"]);
  if (K.slot) v.push(["wield", K.slot === "body" ? "Wear" : K.slot === "light" ? "Use as light" : "Wield"]);
  v.push(["drop", "Drop"]);
  return v;
}
function itemActions(it){
  openList(itemName(it).toUpperCase().slice(0, 34), [...verbsFor(it).map(([how, label]) => ({ label, select: done(() => act(() => useItem(it, how))) })), { label: "Back", select: () => inventoryList() }]);
}
function characterList(){
  const p = player;
  openList("CHARACTER", [info("Human Fighter, level " + p.lvl), info("Experience " + Math.floor(p.exp) + " / " + expFor(p.lvl + 1)), info("Hit points " + p.hp + " / " + p.mhp),
    info("Armour class " + armour()), info("Weapon " + weaponDice()), info("Gold " + p.gold), info("Deepest " + feet(p.maxDepth) + " ft"), info("Monsters slain " + p.kills), info("Turns " + p.turns)]);
}
function messageList(){ openList("MESSAGES", log.length ? log.slice(-60).reverse().flatMap(s => wrap(s, 34).map(info)) : [info("No messages yet.")], "NEWEST FIRST"); }
function helpList(){
  const ro = keySet === "roguelike";
  openList("HELP", [
    info(ro ? "hjklyubn  move (Shift runs)" : "Arrows/numpad  move"), info(ro ? "arrows also move" : "Shift + move  run"),
    info("Walk into a monster to attack"), info("Walk into a door to open it"),
    info("g or ,  pick up"), info("i  inventory    E  eat"), info("q  drink    w  wield/wear"), info("F  fill lantern  d  drop"),
    info(">  <  take the stairs"), info("R  rest   " + (ro ? "." : ". or 5") + "  wait"), info((ro ? "x" : "l") + "  look   C  character"),
    info("Ctrl+P  messages"), info("Esc  menu"),
    info("Touch: D-pad moves (8 ways),"), info("A acts here, B commands")
  ], "KEYS CAN BE CHANGED IN THE MENU");
}
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: state === "play" ? "NEW CHARACTER" : "START", select: () => { menu.hide(); newGame(); } },
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
  if (e.key === "Escape"){ e.preventDefault(); return menu.show(); }
  if (state === "title"){ if (e.key === " " || e.key === "Enter"){ e.preventDefault(); newGame(); } return; }
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
  else if (k === "R") rest();
  else if (k === "." || (!ro && (k === "5" || e.code === "Numpad5"))) act(() => true);
  else if (k === (ro ? "x" : "l")) look();
  else if (k === "C") characterList();
  else if (k === "?") helpList();
  else return;
  e.preventDefault();
}
addEventListener("keydown", onKey);
function toTitle(){ state = "title"; L = null; world.bodies.length = 0; }
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
  if (state !== "play") return;
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
    if (state === "title"){ if (id === "a" || id === "start") newGame(); else if (id === "select") menu.show(); return; }
    if (state === "dead"){ if (stateT > 1 && (id === "a" || id === "start")) toTitle(); return; }
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
  if (state === "title") return newGame();
  if (state === "dead"){ if (stateT > 1) toTitle(); return; }
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
  if (holdDir && state === "play" && !list.open && !menu.open && (holdT -= dt) <= 0){   // keep walking while the D-pad is held
    holdT = 0.14;
    if (disturbed || !act(() => tryMove(...DIRS[holdDir]))) holdDir = 0;
  }
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
