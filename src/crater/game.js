(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// Rules run on a fixed character grid; the ground is an engine terrain grid of the same cells. Shells and rubble are
// engine bodies on top. After every blast, unsupported dirt falls down a cell at a time until the ground settles.
// Two to four tanks, each a person or the computer. Between rounds each tank spends its winnings in the shop.
const GW = 100, GH = 56, WIN_ROUNDS = 3;
const TANK = [" /#\\ ", "(ooo)"], TW = 5, TH = 2;
const TANK_RGB = [[1.4, 0.9, 0.35], [0.45, 1.0, 1.45], [1.3, 0.5, 1.2], [0.6, 1.4, 0.5]];
const WEAPONS = [   // r: blast radius in rows; dmg: damage at the centre; ammo: what a tank starts a match with
  { name: "MISSILE",   r: 2.2, dmg: 40, ammo: Infinity },
  { name: "BIG SHOT",  r: 3.6, dmg: 60, ammo: 1 },
  { name: "MIRV",      r: 2.0, dmg: 30, ammo: 0, split: 5 },
  { name: "DIRT BOMB", r: 3.0, dmg: 0,  ammo: 1, dirt: true }
];
// The shop: what each item costs, and how many you get for it. Fuel drives the tank (a column a unit); a shield takes
// the first 40 damage of a round. Winnings: 1 per point of damage dealt to others, 60 a kill, 80 for winning the
// round, 30 for surviving it, and 50 for everyone, so a beaten tank can still afford something; everyone starts with 150.
const SHOP = [
  { name: "BIG SHOT",  price: 90,  give: T => T.ammo[1]++, has: T => T.ammo[1] },
  { name: "MIRV",      price: 160, give: T => T.ammo[2]++, has: T => T.ammo[2] },
  { name: "DIRT BOMB", price: 50,  give: T => T.ammo[3]++, has: T => T.ammo[3] },
  { name: "FUEL x20",  price: 40,  give: T => { T.fuel += 20; }, has: T => T.fuel },
  { name: "SHIELD",    price: 110, give: T => { T.shieldBuy = 1; }, has: T => T.shieldBuy, one: true }
];
const PAY = { damage: 1, kill: 60, win: 80, survive: 30, all: 50, start: 150 }, SHIELD_HP = 40, START_FUEL = 20;
const GROUND_RGB = [[0.42, 0.55, 0.22], [0.55, 0.37, 0.2], [0.36, 0.3, 0.3]];   // topsoil, dirt, rock
const SUN = ["  ___  ", " /###\\ ", "|#####|", " \\###/ "], SUN_X = GW - 16, SUN_Y = 3;
const SHELL_RGB = [1.8, 1.7, 1.2], FLASH = [1.8, 0.9, 0.4], WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], GOLD = [1.6, 1.3, 0.4];
const DIRT = { name: "dirt", density: 1.2, e: 0.15, mu: 0.9, kd: 0.9, ks: 0.1, shine: 6 };
const METAL = { name: "metal", density: 2, e: 0.4, mu: 0.4, kd: 0.6, ks: 0.9, shine: 40 };
const FONT = {   // 5x5 block letters for the title, drawn two cells wide per dot
  C: [".####", "#....", "#....", "#....", ".####"], R: ["####.", "#...#", "####.", "#..#.", "#...#"],
  A: [".###.", "#...#", "#####", "#...#", "#...#"], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  E: ["#####", "#....", "####.", "#....", "#####"], D: ["####.", "#...#", "#...#", "#...#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", ".###."], L: ["#....", "#....", "#....", "#....", "#####"]
};

/* ---------- saved settings and sound (src/arcade.js) ---------- */
const store = prefs("craterDuel.v1.", "Crater Duel");
const audio = createAudio({ label: "Crater Duel", store, sounds: CRATER_SFX, volume: 1 });
const sfx = name => audio.play(name);

const D = defaultDisplay(); D.room = 0.28; D.glow = 0.25; D.lampRGB = [1.0, 0.72, 0.45];   // the low sun is the lamp: warm light
applyArcadeSettings(D);   // character set, pixel mode and TV filter from the shared Settings page
const world = new World(); world.openTop = true;   // high shots arc above the screen and come back down
const sunLight = { x: 0, y: 0, z: 0, on: true };
let screen = null, stars = [], mode = "cpu", count = 2, state = "title", stateT = 0;
let ground = null, tanks = [], turn = 0, wind = 0, shells = [], trail = [], lastTrail = [];
let blasts = [], roundStarter = 0, msg = "", msgT = 0, plan = null, settleT = 0, shopAt = 0, shopSel = 0, driveT = 0;
// Power comes from holding the fire button: the meter runs 0 -> 100 -> 0 while held, and letting go fires.
const CHARGE_SECS = 1.1;   // time for the meter to fill once
let charge = null, lastPower = [];   // charge: seconds held, or null when not charging
const cx = gx => (gx + 0.5) * screen.cw, cy = gy => (gy + 0.5) * screen.ch;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCpu = i => !tanks[i].human;
const name = i => tanks[i].human ? "PLAYER " + tanks[i].pn : tanks.filter(T => !T.human).length > 1 ? "CPU " + (tanks.slice(0, i + 1).filter(T => !T.human).length) : "COMPUTER";
const alive = () => tanks.filter(T => !T.dead);
const vmax = () => Math.sqrt(1.3 * world.w * world.g.y);   // full power at 45 degrees carries about 1.3 screens on flat ground

function layout(){
  const old = screen; screen = fitGrid(stage, cv, ctx, D, GW, GH) || old; if (screen === old) return;
  const W = GW * screen.cw, H = GH * screen.ch;
  world.w = W; world.h = H; world.unit = screen.cw; world.drag = 2e-4 * (600 / H) ** 2;
  world.g = { x: wind * H * 0.012, y: H * 0.9 };
  if (world.terrain){ world.terrain.cw = screen.cw; world.terrain.ch = screen.ch; }
  sunLight.x = cx(SUN_X + 3); sunLight.y = cy(SUN_Y + 2); sunLight.z = screen.ch * 14;
  rescaleBodies(world, old, screen);
  if (old){ const kx = screen.cw / old.cw, ky = screen.ch / old.ch; for (const p of [...trail, ...lastTrail.flat()]){ p.x *= kx; p.y *= ky; } }
  stars = Array.from({ length: 80 }, () => ({ x: 1 + Math.floor(Math.random() * (GW - 2)), y: 2 + Math.floor(Math.random() * 20), ph: Math.random() * 6.283 }));
}

/* ---------- the ground ---------- */
// Rolling hills from three random waves. Each cell remembers its layer (topsoil, dirt, rock) so falling dirt keeps its colour.
function makeGround(){
  const solid = new Uint8Array(GW * GH), layer = new Uint8Array(GW * GH);
  const waves = [0, 1, 2].map(i => ({ a: [7, 4, 2][i] * (0.6 + Math.random() * 0.8), f: [0.04, 0.09, 0.21][i] * (0.7 + Math.random() * 0.6), p: Math.random() * 6.283 }));
  const base = GH * (0.55 + Math.random() * 0.12);
  for (let c = 0; c < GW; c++){
    const top = Math.round(clamp(base + waves.reduce((t, w) => t + w.a * Math.sin(c * w.f + w.p), 0), 16, GH - 6));
    for (let r = top; r < GH; r++){ solid[r * GW + c] = 1; layer[r * GW + c] = r - top < 2 ? 0 : r - top < 9 ? 1 : 2; }
  }
  return { solid, layer };
}
const surface = c => { for (let r = 0; r < GH; r++) if (ground.solid[r * GW + c]) return r; return GH; };
// A match: the tanks, who drives them, and what they carry from round to round.
function newMatch(){
  const humans = mode === "two" ? 2 : 1;
  tanks = Array.from({ length: count }, (_, i) => ({ human: i < humans, pn: i + 1, wins: 0, money: PAY.start, ammo: WEAPONS.map(w => w.ammo), fuel: START_FUEL, shieldBuy: 0 }));
  lastPower = tanks.map(() => null); roundStarter = 0;
  newRound();
}
function newRound(){
  world.bodies.length = 0; world.forces.length = 0; blasts = []; shells = []; trail = []; lastTrail = tanks.map(() => []);
  ground = makeGround();
  world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: ground.solid, mat: DIRT };
  wind = Math.round((Math.random() * 10 - 5) * (Math.random() < 0.33 ? 2 : 1));
  world.g = { x: wind * world.h * 0.012, y: world.h * 0.9 };   // wind is sideways gravity
  // spread the tanks along the hills, in a shuffled order so nobody always starts on the left
  const n = tanks.length, gap = (GW - 16) / (n - 1), order = tanks.map((_, i) => i).sort(() => Math.random() - 0.5);
  order.forEach((k, slot) => {
    const T = tanks[k], x = clamp(Math.round(4 + slot * gap + (Math.random() - 0.5) * gap * 0.4), 2, GW - TW - 2);
    const top = Math.min(...Array.from({ length: TW }, (_, j) => surface(x + j)));   // level a pad under the tank
    for (let j = 0; j < TW; j++) for (let r = 0; r < GH; r++){ const c = r * GW + x + j; ground.solid[c] = r >= top ? 1 : 0; if (r >= top && r < top + 2) ground.layer[c] = 0; }
    Object.assign(T, { x, y: top - TH, angle: x < GW / 2 ? 60 : 120, power: 55, hp: 100, weapon: 0, dead: false, fallT: 0, fallen: 0, cpu: null, earned: 0,
      shield: T.shieldBuy ? SHIELD_HP : 0 });
    T.shieldBuy = 0;
  });
  turn = roundStarter % n; roundStarter++;
  sfx("round");
  startTurn();
}
function startTurn(){
  if (alive().length <= 1) return endRound();   // checked here, so no path can start a turn after the round is decided
  for (let k = 0; k < tanks.length && tanks[turn].dead; k++) turn = (turn + 1) % tanks.length;
  trail = []; stateT = 0; charge = null;
  state = isCpu(turn) ? "cpu" : "aim";
  if (state === "cpu") plan = planShot(turn);
  say(name(turn) + "'S TURN", 1.2);
}
function nextTurn(){ turn = (turn + 1) % tanks.length; startTurn(); }
function say(text, secs){ msg = text; msgT = secs; }
function endRound(){
  const w = tanks.findIndex(T => !T.dead);
  for (const T of tanks){ const p = PAY.all + (T.dead ? 0 : PAY.survive); T.money += p; T.earned += p; }
  if (w >= 0){ tanks[w].wins++; tanks[w].money += PAY.win; tanks[w].earned += PAY.win; }
  say(w >= 0 ? name(w) + " WINS THE ROUND" : "NO TANK LEFT STANDING", 2.4);
  state = "roundover"; stateT = 0;
}

/* ---------- the shop: between rounds, each tank in turn ---------- */
function openShop(){ state = "shop"; shopAt = 0; shopSel = 0; stateT = 0; shopNext(0); }
function shopNext(from){   // the computer's tanks shop at once; the next person gets the screen
  for (shopAt = from; shopAt < tanks.length; shopAt++){
    if (!tanks[shopAt].human){ cpuShop(tanks[shopAt]); continue; }
    shopSel = 0; return;
  }
  newRound();
}
function buy(T, item){
  if (T.money < item.price || (item.one && item.has(T))) return false;
  T.money -= item.price; item.give(T); return true;
}
function cpuShop(T){   // big guns first, then a shield and fuel, then whatever is left
  for (const want of [[1, 2], [4, 1], [2, 1], [3, 1], [1, 3], [2, 2]]){
    const item = SHOP[want[0]];
    while ((item.has(T) || 0) < want[1] && buy(T, item)){}
  }
}
function shopKey(k){
  const T = tanks[shopAt], rows = SHOP.length + 1;
  if (k === "up") shopSel = (shopSel + rows - 1) % rows;
  else if (k === "down") shopSel = (shopSel + 1) % rows;
  else if (k === "buy"){
    if (shopSel === SHOP.length) return shopNext(shopAt + 1);
    sfx(buy(T, SHOP[shopSel]) ? "clang" : "switch");
  } else if (k === "done") return shopNext(shopAt + 1);
  if (k === "up" || k === "down") sfx("switch");
}

/* ---------- predicting a shot: the same physics as the engine's step, without touching the world ---------- */
let probe = null;   // the shell's radius and inverse mass, measured once from a real body
function predict(i, angle, power){
  if (!probe){ const b = world.add(0, 0, screen.ch * 0.3, "steel", null, METAL); probe = { r: b.r, im: b.im }; world.bodies.splice(world.bodies.indexOf(b), 1); }
  const T = tanks[i], a = angle * Math.PI / 180, v = power / 100 * vmax(), h = 1 / 60 / world.substeps;
  let [x, y] = muzzle({ ...T, angle }), vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
  for (let n = 0; n < 60 * 14 * world.substeps; n++){
    const sp = Math.hypot(vx, vy), k = world.drag * probe.r * sp * probe.im;
    vx += (world.g.x - vx * k) * h; vy += (world.g.y - vy * k) * h;
    const s2 = Math.hypot(vx, vy); if (s2 > 4000){ vx *= 4000 / s2; vy *= 4000 / s2; }
    x += vx * h; y += vy * h;
    if (x <= probe.r + 1 || x >= world.w - probe.r - 1) return { x, y, off: true };
    const gx = Math.floor(x / screen.cw), gy = Math.floor(y / screen.ch), age = n * h;
    const hit = tanks.findIndex((U, j) => !U.dead && (j !== i || age > 0.2) && inTank(U, gx, gy));
    if (hit >= 0 || gy >= GH - 1 || (gy >= 0 && gx >= 0 && gx < GW && ground.solid[gy * GW + gx])) return { x, y, tank: hit };
  }
  return { x, y, off: true };
}

/* ---------- the computer: aims at the nearest tank with the predicted best shot, then misses by its error ---------- */
// The error shrinks with every shot it fires at the same target, as it gets its eye in.
const CPU_AIM = { noise: 0.28, decay: 0.75, floor: 0.05 };
function planShot(i){
  const me = tanks[i], foes = tanks.filter((U, j) => j !== i && !U.dead);
  const foe = foes.reduce((a, b) => Math.abs(b.x - me.x) < Math.abs(a.x - me.x) ? b : a), fi = tanks.indexOf(foe);
  if (!me.cpu || me.cpu.target !== fi) me.cpu = { target: fi, tries: 0, last: null };
  const C = me.cpu, tx = cx(foe.x + 2), ty = cy(foe.y + 1), dir = foe.x > me.x ? 1 : -1;
  let best = null;
  for (let lift = 15; lift <= 80; lift += 5) for (let power = 10; power <= 100; power++){
    const angle = dir > 0 ? lift : 180 - lift;
    if (C.last && C.last.angle === angle && C.last.power === power) continue;   // never the same shot that just missed
    const r = predict(i, angle, power), miss = r.tank === i ? 1e9 : r.tank === fi ? 0 : r.off ? 1e6 : Math.hypot(r.x - tx, r.y - ty);
    if (!best || miss < best.miss) best = { angle, power, miss };
  }
  const e = Math.max(CPU_AIM.floor, CPU_AIM.noise * Math.pow(CPU_AIM.decay, C.tries++)), wobble = () => Math.random() * 2 - 1;
  C.last = { angle: Math.round(clamp(best.angle + wobble() * e * 20, 0, 180)), power: Math.round(clamp(best.power * (1 + wobble() * e), 5, 100)) };
  // once its aim is close, the big guns, while they last
  const R = WEAPONS[1].r * screen.ch;
  const weapon = e < 0.12 && best.miss < R && me.ammo[1] > 0 ? 1 : e < 0.2 && best.miss < R * 2 && me.ammo[2] > 0 ? 2 : 0;
  return { ...C.last, weapon };
}

/* ---------- driving: a column at a time on fuel; it climbs small steps and drops off ledges ---------- */
function drive(i, dir){
  const T = tanks[i], x = T.x + dir;
  if (T.fuel <= 0){ say("NO FUEL", 0.8); return; }
  if (x < 1 || x + TW > GW - 1) return;
  if (tanks.some((U, j) => j !== i && !U.dead && Math.abs(U.x - x) < TW && Math.abs(U.y - T.y) < TH + 1)) return;   // another tank in the way
  const top = Math.min(...Array.from({ length: TW }, (_, j) => surface(x + j)));
  if (T.y + TH - top > 2) return;   // too steep to climb
  T.x = x; if (top < T.y + TH) T.y = top - TH;
  T.fuel--; sfx("dirt");
}

/* ---------- firing ---------- */
const muzzle = T => { const a = T.angle * Math.PI / 180; return [cx(T.x + 2) + Math.cos(a) * screen.cw * 3, cy(T.y) - Math.sin(a) * screen.ch * 1.5]; };
function addShell(x, y, vx, vy, w, owner){
  const b = world.add(x, y, screen.ch * 0.3, "steel", null, METAL);
  b.sensor = true;   // flies through everything; checkShells() decides what it hit
  b.vx = vx; b.vy = vy; b.weapon = w; b.owner = owner; b.age = 0;
  shells.push(b);
  return b;
}
function fire(i){
  const T = tanks[i], a = T.angle * Math.PI / 180, v = T.power / 100 * vmax(), [mx, my] = muzzle(T);
  if (T.ammo[T.weapon] !== Infinity) T.ammo[T.weapon]--;
  addShell(mx, my, Math.cos(a) * v, -Math.sin(a) * v, T.weapon, i);
  if (T.ammo[T.weapon] <= 0) T.weapon = 0;   // out of that weapon: back to missiles
  sfx("fire"); trail = []; state = "flight"; stateT = 0;
}
function inTank(T, gx, gy){ const dx = gx - T.x, dy = gy - T.y; return dy >= 0 && dy < TH && dx >= 0 && dx < TW && TANK[dy][dx] !== " "; }
// Runs after every physics substep, so a fast shell can't skip through a thin ridge between frames.
function checkShells(){
  if (state !== "flight") return;
  for (const b of shells.slice()){
    if (b.dead) continue;
    const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch);
    if (b.x <= b.r + 1 || b.x >= world.w - b.r - 1){ b.dead = true; continue; }   // off the side: a miss
    const hitTank = tanks.some(T => !T.dead && (T !== tanks[b.owner] || b.age > 0.2) && inTank(T, gx, gy));
    if (hitTank || gy >= GH - 1 || (gy >= 0 && gx >= 0 && gx < GW && ground.solid[gy * GW + gx])){
      b.dead = true; explode(b.x, b.y, WEAPONS[b.weapon], b.owner);
    }
  }
}
function finishFlight(){
  lastTrail[turn] = trail;
  for (const b of shells){ const k = world.bodies.indexOf(b); if (k >= 0) world.bodies.splice(k, 1); }
  shells = [];
  state = "settle"; stateT = 0; settleT = 0;
}

/* ---------- blasts ---------- */
// A blast clears (or, for a dirt bomb, fills) the cells in its radius, throws some as rubble, shoves loose debris,
// and damages tanks by distance. Afterwards the ground settles.
function explode(x, y, W, owner){
  const R = W.r * screen.ch;
  blasts.push({ x, y, t: 0.45, big: W.r > 3 });
  sfx(W.dirt ? "dirt" : W.r > 3 ? "bigboom" : "boom");
  const c0 = Math.max(0, Math.floor((x - R) / screen.cw)), c1 = Math.min(GW - 1, Math.floor((x + R) / screen.cw));
  const r0 = Math.max(0, Math.floor((y - R) / screen.ch)), r1 = Math.min(GH - 1, Math.floor((y + R) / screen.ch));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
    const i = r * GW + c, dx = cx(c) - x, dy = cy(r) - y, d = Math.hypot(dx, dy);
    if (d > R) continue;
    if (W.dirt){ if (!ground.solid[i] && !tanks.some(T => !T.dead && inTank(T, c, r))){ ground.solid[i] = 1; ground.layer[i] = 1; } continue; }
    if (!ground.solid[i]) continue;
    if (Math.random() < 0.35){
      const b = world.addBox(cx(c), cy(r), screen.cw * 0.45, screen.ch * 0.38, "dirt", GROUND_RGB[ground.layer[i]], DIRT), sp = 150 + Math.random() * 350;
      b.vx = dx / (d || 1) * sp; b.vy = dy / (d || 1) * sp - 150; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 3 + Math.random() * 2;
    }
    ground.solid[i] = 0;
  }
  if (!W.dirt) world.forces.push({ x, y, radius: R * 2.2, strength: world.h * 60, t: 0.08 });
  tanks.forEach((T, k) => {   // full damage near the centre, none beyond 1.6 radii
    if (T.dead || !W.dmg) return;
    const d = Math.hypot(cx(T.x + 2) - x, (cy(T.y) + screen.ch / 2 - y)) / R;
    if (d < 1.6) hurt(k, Math.round(W.dmg * clamp(1.6 - d, 0, 1)), owner);
  });
}
function hurt(k, amount, by){
  const T = tanks[k];
  if (T.dead || amount <= 0) return;
  if (T.shield > 0){ const s = Math.min(T.shield, amount); T.shield -= s; amount -= s; T.flash = 0.3; sfx("clang"); if (!amount) return; }
  const dealt = Math.min(T.hp, amount);
  if (by !== undefined && by !== k){ tanks[by].money += dealt * PAY.damage; tanks[by].earned += dealt * PAY.damage; }   // paid for damage to others
  T.hp -= dealt; T.flash = 0.3;
  if (T.hp > 0){ sfx("clang"); return; }
  T.dead = true; sfx("destroyed");
  if (by !== undefined && by !== k){ tanks[by].money += PAY.kill; tanks[by].earned += PAY.kill; }
  const tx = cx(T.x + 2), ty = cy(T.y);
  for (let n = 0; n < 18; n++){
    const a = Math.random() * 6.283, sp = 150 + Math.random() * 450, b = world.add(tx, ty, screen.cw * (0.5 + Math.random() * 0.3), "steel", TANK_RGB[k].map(v => v * 0.6), METAL);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 250; b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = b.r;
  }
  blasts.push({ x: tx, y: ty, t: 0.45, big: true });
}
// Unsupported dirt drops one cell per pass, bottom-up, so whole columns slide down together. Returns true if anything moved.
function settleGround(){
  const { solid, layer } = ground; let moved = false;
  for (let r = GH - 2; r >= 0; r--) for (let c = 0; c < GW; c++){
    const i = r * GW + c, j = i + GW;
    if (solid[i] && !solid[j]){ solid[j] = 1; layer[j] = layer[i]; solid[i] = 0; moved = true; }
  }
  return moved;
}

/* ---------- update ---------- */
function update(dt){
  stateT += dt; msgT -= dt;
  if (state === "shop") return;
  let falling = false;
  tanks.forEach((T, k) => {   // a tank with nothing under it drops; long falls hurt
    if (T.dead) return;
    T.flash = Math.max(0, (T.flash || 0) - dt);
    let held = T.y + TH >= GH;
    for (let c = T.x; c < T.x + TW && !held; c++) if (ground.solid[(T.y + TH) * GW + c]) held = true;
    if (!held){ falling = true; if ((T.fallT -= dt) <= 0){ T.y++; T.fallen++; T.fallT = 0.04; } }
    else if (T.fallen){ if (T.fallen > 2) hurt(k, (T.fallen - 2) * 3); T.fallen = 0; }
  });
  if (state === "aim"){
    const T = tanks[turn];
    if (keys.drive){ if ((driveT -= dt) <= 0){ driveT = 0.09; drive(turn, keys.drive); } }   // driving, while a drive key is held
    else T.angle = clamp(T.angle + ((keys.left ? 1 : 0) - (keys.right ? 1 : 0)) * 50 * dt, 0, 180);
    if (charge !== null){ charge += dt; const c = (charge / CHARGE_SECS) % 2; T.power = clamp(Math.round((c < 1 ? c : 2 - c) * 100), 1, 100); }
  } else if (state === "cpu"){   // sweep the aim towards the plan, so the player sees it think
    const T = tanks[turn], k = Math.min(1, dt * 3);
    T.angle += (plan.angle - T.angle) * k; T.power += (plan.power - T.power) * k;
    if (stateT > 1.3){ T.angle = plan.angle; T.power = plan.power; T.weapon = plan.weapon; fire(turn); }
  } else if (state === "flight"){
    for (const b of shells){
      b.age += dt;
      const W = WEAPONS[b.weapon];
      if (!b.falling && b.vy > 0){   // the top of the arc: the whistle starts, and a MIRV splits
        b.falling = true; sfx("whistle");
        if (W.split && !b.child && !b.dead){
          b.dead = true; sfx("split");
          for (let n = 0; n < W.split; n++){ const c = addShell(b.x, b.y, b.vx + (n - (W.split - 1) / 2) * screen.cw * 6, b.vy, b.weapon, b.owner); c.child = true; c.falling = true; }
        }
      }
    }
    const lead = shells.find(b => !b.dead); if (lead){ trail.push({ x: lead.x, y: lead.y }); if (trail.length > 400) trail.shift(); }
    if (shells.every(b => b.dead) || stateT > 14) finishFlight();
  } else if (state === "settle"){
    if ((settleT -= dt) <= 0){ settleT = 0.02; if (settleGround()) stateT = Math.min(stateT, 0.3); }   // keep waiting while dirt is still falling
    if (stateT > 0.8 && !falling) nextTurn();
  } else if (state === "roundover" && stateT > 2.6){
    if (Math.max(...tanks.map(T => T.wins)) >= WIN_ROUNDS){
      state = "over"; stateT = 0;
      const w = winner(); sfx(isCpu(w) ? "lose" : "win");
    } else openShop();
  }
}
const winner = () => tanks.reduce((b, T, i) => T.wins > tanks[b].wins ? i : b, 0);

/* ---------- drawing ---------- */
const { put, text, center, sprite } = pen(() => screen);   // drawing on the character grid (src/arcade.js)
function blastLight(gx, gy){   // warm light from recent blasts, falling off with distance
  let v = 0;
  for (const B of blasts){ const d = Math.hypot(cx(gx) - B.x, (cy(gy) - B.y) * 0.8) / (screen.ch * (B.big ? 16 : 11)); if (d < 1) v += (B.t / 0.45) * (1 - d) * 1.4; }
  return v;
}
const GRAIN = [58, 59, 37, 58, 35, 59, 58, 37];   // : ; % # mixed by position, so the ground looks granular
function drawGround(){
  const { solid, layer } = ground, dim = state === "title" || state === "shop" ? 0.45 : 1;
  for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++){
    const i = r * GW + c; if (!solid[i]) continue;
    const top = r === 0 || !solid[i - GW], base = GROUND_RGB[layer[i]], f = blasts.length ? blastLight(c, r) : 0;
    const k = (top ? 1.0 : 0.55 - Math.min(0.25, (layer[i] === 2 ? 0.15 : 0))) * dim;
    put(c, r, [base[0] * k + FLASH[0] * f * 0.4, base[1] * k + FLASH[1] * f * 0.4, base[2] * k + FLASH[2] * f * 0.4], 1, 1, top ? 61 : GRAIN[(c * 7 + r * 3) & 7]);
  }
  for (const B of blasts){   // the flash also lights the air around it
    const gx = Math.floor(B.x / screen.cw), gy = Math.floor(B.y / screen.ch), v = B.t / 0.45, rx = B.big ? 16 : 12, ry = rx >> 1;
    for (let r = gy - ry; r <= gy + ry; r++) for (let c = gx - rx; c <= gx + rx; c++){
      const d = Math.hypot((c - gx) / rx, (r - gy) / ry); if (d >= 1 || c < 0 || r < 0 || c >= GW || r >= GH) continue;
      const a = v * (1 - d) * 0.25; screen.add(r * GW + c, FLASH[0] * a, FLASH[1] * a, FLASH[2] * a);
    }
  }
}
function drawTank(T, k){
  const hot = T.flash > 0, glow = hot ? 2 : k === turn && state !== "roundover" ? 1.15 : 0.85;
  sprite(TANK, T.x, T.y, hot ? WHITE : TANK_RGB[k], glow, 3);
  const a = T.angle * Math.PI / 180, glyph = T.angle < 22.5 || T.angle > 157.5 ? 45 : T.angle < 67.5 ? 47 : T.angle < 112.5 ? 124 : 92;   // - / | \
  for (let n = 1; n <= 2; n++) put(Math.round(T.x + 2 + Math.cos(a) * n * 1.5), Math.round(T.y - Math.sin(a) * n * 0.75), TANK_RGB[k], glow, 3, glyph);
  if (T.shield > 0){ const s = 0.4 + 0.5 * T.shield / SHIELD_HP; put(T.x - 1, T.y + 1, [0.6, 1.0, 1.6], s, 3, 40); put(T.x + TW, T.y + 1, [0.6, 1.0, 1.6], s, 3, 41); }   // ( ) a shield
}
function drawTitle(){
  for (let r = 25; r <= 33; r++) for (let c = 8; c < GW - 8; c++) put(c, r, WHITE, 1, 3, 32);   // a dark panel behind the menu
  [["CRATER", 10], ["DUEL", 17]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((GW - word.length * 12 + 2) / 2);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#")
      for (const k of [0, 1]) put(x0 + li * 12 + dx * 2 + k, y0 + dy, TANK_RGB[wi], 1.3, 3, 35); }));
  });
  const blink = (performance.now() / 500 | 0) % 2;
  center(27, (pad.touch ? "A" : "1") + "  ONE PLAYER (VS COMPUTER)     " + (pad.touch ? "B" : "2") + "  TWO PLAYERS", blink ? WHITE : DIM);
  center(29, pad.touch ? "D-PAD LEFT/RIGHT AIM, UP/DOWN DRIVE.  HOLD A FOR POWER, LET GO TO FIRE.  B WEAPON" : "LEFT/RIGHT AIM  SHIFT+LEFT/RIGHT DRIVE  HOLD SPACE FOR POWER  TAB WEAPON  ESC MENU", DIM);
  center(31, "LAST TANK STANDING WINS THE ROUND. FIRST TO " + WIN_ROUNDS + " ROUNDS. SHOP BETWEEN ROUNDS.", DIM);
  center(32, count + " TANKS (CHANGE IN THE MENU)", DIM);
}
function drawShop(){
  const T = tanks[shopAt], x0 = 25, y0 = 12, w = 50;
  for (let r = y0 - 1; r <= y0 + 15 + SHOP.length; r++) for (let c = x0 - 2; c < x0 + w + 2; c++) put(c, r, WHITE, 1, 3, 32);
  text(x0, y0, "THE SHOP", GOLD); text(x0 + w - 18, y0, ("ROUND " + (tanks.reduce((s, U) => s + U.wins, 0) + 1)).padStart(18), DIM);
  text(x0, y0 + 2, name(shopAt), TANK_RGB[shopAt]); text(x0 + 20, y0 + 2, ("MONEY $" + T.money).padStart(w - 20), GOLD);
  text(x0, y0 + 3, "EARNED LAST ROUND $" + T.earned, DIM);
  SHOP.forEach((it, k) => {
    const sel = k === shopSel, can = T.money >= it.price && !(it.one && it.has(T));
    text(x0, y0 + 5 + k, (sel ? "> " : "  ") + it.name.padEnd(12) + ("$" + it.price).padStart(6) + "    HAVE " + String(it.has(T) || 0).padStart(3), sel ? (can ? WHITE : DIM) : can ? [1, 1, 1] : DIM);
  });
  text(x0, y0 + 6 + SHOP.length, (shopSel === SHOP.length ? "> " : "  ") + "DONE", shopSel === SHOP.length ? WHITE : [1, 1, 1]);
  text(x0, y0 + 8 + SHOP.length, "MISSILES ARE FREE. AMMO, FUEL AND MONEY CARRY ON.", DIM);
  text(x0, y0 + 9 + SHOP.length, "A SHIELD TAKES THE FIRST " + SHIELD_HP + " DAMAGE OF ONE ROUND.", DIM);
  text(x0, y0 + 11 + SHOP.length, pad.touch ? "UP/DOWN CHOOSE   A BUY   B DONE" : "UP/DOWN CHOOSE   SPACE OR ENTER BUY   D WHEN DONE", DIM);
  const st = tanks.map((U, i) => name(i) + " " + U.wins).join("   ");
  text(Math.max(x0, (GW - st.length) >> 1), y0 + 13 + SHOP.length, st, DIM);
}
function draw(t){
  screen.clear();
  for (const s of stars){ const v = 0.05 + 0.04 * Math.sin(t * 0.0015 + s.ph); put(s.x, s.y, [v, v, v * 1.3], 1, 0, 46); }
  sprite(SUN, SUN_X, SUN_Y, [1.8, 0.85, 0.35], 1, 2);
  if (ground) drawGround();
  for (const b of world.bodies) if (!b.sensor) screen.sphere(b, sunLight, { stripe: false });
  if (state === "title"){ drawTitle(); drawMenu(); screen.render(ctx); return; }
  if (state === "shop"){ drawShop(); drawMenu(); screen.render(ctx); return; }
  tanks.forEach((T, k) => { if (!T.dead) drawTank(T, k); });
  if (state === "aim" || state === "cpu"){   // your last shot, faintly, and an aim guide whose length shows power
    const T = tanks[turn], a = T.angle * Math.PI / 180;
    for (const p of lastTrail[turn]) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), TANK_RGB[turn], 0.18, 0, 46);
    const n = 2 + Math.round(T.power / 14);
    for (let k = 3; k <= n + 2; k++) put(Math.round(T.x + 2 + Math.cos(a) * k * 1.5), Math.round(T.y - Math.sin(a) * k * 0.75), TANK_RGB[turn], k === n + 2 ? 1.3 : 0.5, 3, k === n + 2 ? 43 : 46);
  }
  for (const p of trail) put(Math.floor(p.x / screen.cw), Math.floor(p.y / screen.ch), SHELL_RGB, 0.22, 0, 46);
  for (const b of shells) if (!b.dead){
    const gx = Math.floor(b.x / screen.cw), gy = Math.floor(b.y / screen.ch);
    put(gx, Math.max(gy, 3), SHELL_RGB, gy >= 3 ? 1 : 0.8, 3, gy >= 3 ? 42 : 94);   // above the HUD: a ^ shows where it will come down
  }
  // HUD: each tank's health and rounds across the top, wind in the middle, the active tank's aim, weapon and fuel below
  const colW = Math.floor(GW / tanks.length);
  tanks.forEach((T, i) => { const s = `${name(i)} HP ${String(T.hp).padStart(3)}${T.shield ? "+" + T.shield : ""} R${T.wins}`; text(i * colW + ((colW - s.length) >> 1), 0, s, T.dead ? DIM : TANK_RGB[i]); });
  center(1, "WIND " + (wind === 0 ? "CALM" : wind < 0 ? "<".repeat(Math.min(5, Math.ceil(-wind / 2))) + " " + -wind : wind + " " + ">".repeat(Math.min(5, Math.ceil(wind / 2)))), WHITE);
  if (state !== "over" && tanks[turn] && !tanks[turn].dead){
    const T = tanks[turn], W = WEAPONS[T.weapon], ammo = T.ammo[T.weapon] === Infinity ? "" : " x" + T.ammo[T.weapon];
    center(2, `ANGLE ${String(Math.round(T.angle)).padStart(3)}   POWER ${String(Math.round(T.power)).padStart(3)}   ${W.name}${ammo}   FUEL ${T.fuel}`, TANK_RGB[turn]);
  }
  if (state === "aim" || state === "cpu"){   // power meter, with a | where your last shot was
    const T = tanks[turn], M = 30, fill = Math.round(T.power / 100 * M), lp = lastPower[turn], x0 = Math.floor((GW - M) / 2);
    for (let k = 0; k < M; k++){
      const mark = lp !== null && k === Math.min(M - 1, Math.round(lp / 100 * M));
      put(x0 + k, 3, mark ? WHITE : TANK_RGB[turn], k < fill ? 1.2 : mark ? 0.9 : 0.25, 3, mark ? 124 : k < fill ? 35 : 46);
    }
    if (state === "aim" && charge === null && msgT <= 0) center(4, pad.touch ? "HOLD A FOR POWER, LET GO TO FIRE.  D-PAD UP/DOWN DRIVES" : "HOLD SPACE FOR POWER, LET GO TO FIRE.  SHIFT+ARROWS DRIVE", DIM);
  }
  if (state === "over"){
    const w = winner();
    center(9, `  ${name(w)} WINS ${tanks.map(T => T.wins).join("-")}  `, TANK_RGB[w]);
    center(11, pad.touch ? "  PRESS START FOR A NEW MATCH  " : "  PRESS SPACE FOR A NEW MATCH  ", WHITE);
  } else if (msgT > 0) center(9, "  " + msg + "  ", WHITE);
  const hint = pad.touch ? " SELECT MENU " : " ESC MENU ";
  text(GW - 1 - hint.length, GH - 1, hint, DIM);
  drawMenu();
  screen.render(ctx);
}
function drawMenu(){
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(screen, { accent: TANK_RGB[0], normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "MODE AND TANKS APPLY TO THE NEXT MATCH" });
}

/* ---------- input ---------- */
const keys = { up: false, down: false, left: false, right: false, drive: 0 };
const KEYMAP = { ArrowLeft: "left", a: "left", A: "left", ArrowRight: "right", d: "right", D: "right", ArrowUp: "up", ArrowDown: "down" };
let nextMode = mode, nextCount = count;   // the menu's choices; they take over when a new match starts
function start(m){ mode = nextMode = m; count = nextCount; newMatch(); }
function action(){   // start or continue from the title and win screens
  if (state === "title") start("cpu");
  else if (state === "over") state = "title";
}
function press(){ if (state === "aim"){ if (charge === null){ charge = 0; tanks[turn].power = 1; } } else if (state === "shop") shopKey("buy"); else action(); }   // Space, A down
function release(){   // Space, A up: fire with the power on the meter
  if (state !== "aim" || charge === null) return;
  charge = null; lastPower[turn] = tanks[turn].power; fire(turn);
}
// The pause menu (src/menu.js) holds what the old button row did. Open it with Esc or P, SELECT, or a mouse click.
const menu = createMenu(() => [
  { label: "RESUME", select: () => menu.hide() },
  { label: "NEW MATCH", select: () => { menu.hide(); audio.unlock(); start(nextMode); } },
  { label: "MODE", value: () => nextMode === "cpu" ? "VS COMPUTER" : "TWO PLAYERS", change: () => { nextMode = nextMode === "cpu" ? "two" : "cpu"; } },
  { label: "TANKS", value: () => String(nextCount), change: d => { nextCount = (nextCount - 2 + (d || 1) + 3) % 3 + 2; } },
  { label: "SOUND", value: () => audio.muted ? "OFF" : "ON", change: () => audio.toggleMute() },
  { label: "CONTROLS", value: () => pad.touch ? "TOUCH" : "KEYBOARD", change: () => pad.toggle() },
  { label: "DISPLAY SETTINGS", select: () => { location.href = "settings.html"; } },
  { label: "BACK TO CARTRIDGES", select: () => { location.href = "./"; } }
], {
  onOpen: () => { charge = null; for (const k in keys) keys[k] = k === "drive" ? 0 : false; audio.pause(); },   // opening cancels a charge
  onClose: () => { audio.resume(); }
});
function nextWeapon(){   // cycle to the next weapon that still has ammo
  if (state !== "aim") return;
  const T = tanks[turn];
  for (let n = 1; n <= WEAPONS.length; n++){ const w = (T.weapon + n) % WEAPONS.length; if (T.ammo[w] > 0){ T.weapon = w; break; } }
  sfx("switch");
}
addEventListener("keydown", e => {
  if (menu.key(e)){ e.preventDefault(); return; }
  const k = KEYMAP[e.key]; if (k){ e.preventDefault(); keys[k] = true; }
  if (e.key === " " || e.key === "Tab") e.preventDefault();
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.shiftKey) keys.drive = e.key === "ArrowLeft" ? -1 : 1;
  if (e.key === "Shift" && (keys.left || keys.right)) keys.drive = keys.left ? -1 : 1;
  if (e.repeat) return;
  if (state === "shop"){
    if (k === "up" || k === "down"){ shopKey(k); return; }
    if (e.key === "Enter" || e.key === " "){ shopKey("buy"); return; }
    if (e.key === "d" || e.key === "D"){ shopKey("done"); return; }
  }
  if (e.key === "Escape" || e.key === "p" || e.key === "P"){ audio.unlock(); return menu.show(); }
  if (e.key === "m" || e.key === "M") return audio.toggleMute();
  audio.unlock();
  if (state === "title" && (e.key === "1" || e.key === "2")) return start(e.key === "1" ? "cpu" : "two");
  if (e.key === " " || e.key === "Enter") press();
  if (e.key === "Tab" || e.key === "q" || e.key === "Q" || e.key === "e" || e.key === "E") nextWeapon();
  if (e.key === "r" || e.key === "R") start(nextMode);
});
addEventListener("keyup", e => {
  const k = KEYMAP[e.key]; if (k) keys[k] = false;
  if (e.key === "Shift" || e.key === "ArrowLeft" || e.key === "ArrowRight") keys.drive = 0;
  if (e.key === " " || e.key === "Enter") release();
});
addEventListener("blur", () => { for (const k in keys) keys[k] = k === "drive" ? 0 : false; charge = null; });   // leaving the window cancels a charge

const pad = createPad({ store, menu: () => menu.open && menu, onAny: () => audio.unlock(),
  onDir: d => {
    if (state === "shop"){ if (d === "up" || d === "down") shopKey(d); return; }
    keys.left = d === "left"; keys.right = d === "right"; keys.drive = d === "up" ? 1 : d === "down" ? -1 : 0;   // up drives right, down drives left
  },
  onPress: id => {
    if (id === "select") return menu.show();
    if (state === "title" && (id === "a" || id === "b")) return start(id === "a" ? "cpu" : "two");
    if (state === "shop"){ shopKey(id === "b" ? "done" : "buy"); return; }
    if (id === "b") return nextWeapon();
    if (id === "start") return state === "title" || state === "over" ? action() : menu.show();
    press();
  },
  onRelease: id => { if (id === "a") release(); } });
cv.addEventListener("pointerdown", e => {
  audio.unlock();
  if (menu.open){ const [gx, gy] = gridAt(e, cv, GW, GH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!pad.touch) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
world.onSub = checkShells;
function tick(dt, t){
  if (screen && !menu.open){   // the open menu pauses everything
    if (state !== "title" && state !== "over") update(dt);
    for (const B of blasts) B.t -= dt;
    blasts = blasts.filter(B => B.t > 0);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){ b.life -= dt; if (b.life < 1 && b.r0) b.r = b.r0 * Math.max(0.3, b.life); }
    world.bodies = world.bodies.filter(b => !(b.life <= 0));
  }
  if (screen) draw(t);
}
layout();
ground = makeGround();   // hills behind the title screen
world.terrain = { cw: screen.cw, ch: screen.ch, cols: GW, rows: GH, solid: ground.solid, mat: DIRT };
onResize(stage, layout);
startLoop(tick);
})();
