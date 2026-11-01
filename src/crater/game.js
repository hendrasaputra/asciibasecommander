(() => {
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d", { alpha: false }), stage = $("stage");
// The ground is an engine terrain grid of small square cells (2 x 2 pixels), so blasts dig round craters. Tanks sit on
// it and fall when it goes. Shells and rubble are engine bodies on top. After every blast, unsupported dirt falls
// until the ground settles. Two to four tanks, each a person or the computer; between rounds each spends its winnings
// in the shop. Everything is drawn as pixel art (src/pixel.js); text and the menu use a 100 x 56 grid over it.
const TGW = 100, TGH = 56, WIN_ROUNDS = 3;         // the text grid
const NX = 200, NY = 224, CELL = 4, PU = 2;        // ground cells; world units per cell and per pixel
const COL = 8, ROW = 16;                           // a text column and row in world units: the sizes things are measured in
const TW = 10, TH = 8;                             // a tank in ground cells (20 x 16 pixels)
const TANK_RGB = [[1.4, 0.9, 0.35], [0.45, 1.0, 1.45], [1.3, 0.5, 1.2], [0.6, 1.4, 0.5]];   // for text
const TANK_PIX = [[226, 150, 60], [70, 180, 222], [204, 92, 192], [112, 200, 92]];         // for the tanks
const WEAPONS = [   // r: blast radius in rows; dmg: damage at the centre; ammo: what a tank starts a match with
  { name: "MISSILE",   r: 2.2, dmg: 40, ammo: Infinity },
  { name: "BIG SHOT",  r: 3.6, dmg: 60, ammo: 1 },
  { name: "MIRV",      r: 2.0, dmg: 30, ammo: 0, split: 5 },
  { name: "DIRT BOMB", r: 3.0, dmg: 0,  ammo: 1, dirt: true }
];
// The shop: what each item costs, and how many you get for it. Fuel drives the tank (a unit every two cells); a
// shield takes the first 40 damage of a round. Winnings: 1 per point of damage dealt to others, 60 a kill, 80 for
// winning the round, 30 for surviving it, and 50 for everyone, so a beaten tank can still afford something; everyone
// starts with 150.
const SHOP = [
  { name: "BIG SHOT",  price: 90,  give: T => T.ammo[1]++, has: T => T.ammo[1] },
  { name: "MIRV",      price: 160, give: T => T.ammo[2]++, has: T => T.ammo[2] },
  { name: "DIRT BOMB", price: 50,  give: T => T.ammo[3]++, has: T => T.ammo[3] },
  { name: "FUEL x20",  price: 40,  give: T => { T.fuel += 20; }, has: T => T.fuel },
  { name: "SHIELD",    price: 110, give: T => { T.shieldBuy = 1; }, has: T => T.shieldBuy, one: true }
];
const PAY = { damage: 1, kill: 60, win: 80, survive: 30, all: 50, start: 150 }, SHIELD_HP = 40, START_FUEL = 20;
const GROUND_RGB = [[0.42, 0.55, 0.22], [0.55, 0.37, 0.2], [0.36, 0.3, 0.3]];   // topsoil, dirt, rock: rubble
const SOIL = [[104, 142, 58], [146, 100, 60], [98, 86, 92]];                     // the same, as pixels
const SUN_X = 348, SUN_Y = 40;                                                    // in pixels
const FLASH = [1.8, 0.9, 0.4], WHITE = [1.6, 1.6, 1.6], DIM = [0.4, 0.45, 0.6], GOLD = [1.6, 1.3, 0.4];
const DIRT = { name: "dirt", density: 1.2, e: 0.15, mu: 0.9, kd: 0.9, ks: 0.1, shine: 6 };
const METAL = { name: "metal", density: 2, e: 0.4, mu: 0.4, kd: 0.6, ks: 0.9, shine: 40 };
const FONT = {   // 5x5 block letters for the title, two text columns wide per dot
  C: [".####", "#....", "#....", "#....", ".####"], R: ["####.", "#...#", "####.", "#..#.", "#...#"],
  A: [".###.", "#...#", "#####", "#...#", "#...#"], T: ["#####", "..#..", "..#..", "..#..", "..#.."],
  E: ["#####", "#....", "####.", "#....", "#####"], D: ["####.", "#...#", "#...#", "#...#", "####."],
  U: ["#...#", "#...#", "#...#", "#...#", ".###."], L: ["#....", "#....", "#....", "#....", "#####"]
};

/* ---------- saved settings and sound (src/arcade.js) ---------- */
const store = prefs("craterDuel.v1.", "Crater Duel");
const audio = createAudio({ label: "Crater Duel", store, sounds: CRATER_SFX, volume: 1 });
const sfx = name => audio.play(name);
const feel = createFeel(), vfx = createFx();

applyArcadeSettings(defaultDisplay());   // the tube TV filter from the shared Settings page
const world = new World(); world.openTop = true;   // high shots arc above the screen and come back down
world.w = NX * CELL; world.h = NY * CELL; world.unit = COL; world.drag = 2e-4 * (600 / world.h) ** 2; world.g = { x: 0, y: world.h * 0.9 };
const pix = createPixels(NX * CELL / PU, NY * CELL / PU, TGW, TGH, PU);
let ready = false, mode = "cpu", count = 2, state = "title", stateT = 0;
let ground = null, tanks = [], turn = 0, wind = 0, shells = [], trail = [], lastTrail = [];
let blasts = [], roundStarter = 0, msg = "", msgT = 0, plan = null, settleT = 0, shopAt = 0, shopSel = 0, driveT = 0;
// Power comes from holding the fire button: the meter runs 0 -> 100 -> 0 while held, and letting go fires.
const CHARGE_SECS = 1.1;   // time for the meter to fill once
let charge = null, lastPower = [];   // charge: seconds held, or null when not charging
const cx = c => (c + 0.5) * CELL, cy = r => (r + 0.5) * CELL;
const mid = T => [(T.x + TW / 2) * CELL, (T.y + TH / 2) * CELL];   // a tank's centre in world units
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isCpu = i => !tanks[i].human;
const name = i => tanks[i].human ? "PLAYER " + tanks[i].pn : tanks.filter(T => !T.human).length > 1 ? "CPU " + (tanks.slice(0, i + 1).filter(T => !T.human).length) : "COMPUTER";
const alive = () => tanks.filter(T => !T.dead);
const vmax = () => Math.sqrt(1.3 * world.w * world.g.y);   // full power at 45 degrees carries about 1.3 screens on flat ground

function layout(){ if (pix.fit(stage, cv, ctx)) ready = true; }

/* ---------- the ground ---------- */
// Rolling hills from three random waves. Each cell remembers its layer (topsoil, dirt, rock) so falling dirt keeps
// its colour. dirty: it changed, so its picture is drawn again.
function makeGround(){
  const solid = new Uint8Array(NX * NY), layer = new Uint8Array(NX * NY);
  const waves = [0, 1, 2].map(i => ({ a: [28, 16, 8][i] * (0.6 + Math.random() * 0.8), f: [0.02, 0.045, 0.105][i] * (0.7 + Math.random() * 0.6), p: Math.random() * 6.283 }));
  const base = NY * (0.55 + Math.random() * 0.12);
  for (let c = 0; c < NX; c++){
    const top = Math.round(clamp(base + waves.reduce((t, w) => t + w.a * Math.sin(c * w.f + w.p), 0), 64, NY - 24));
    const soil = 7 + 3 * Math.sin(c * 0.13 + waves[2].p), rock = 30 + 12 * Math.sin(c * 0.05 + waves[1].p) + 5 * Math.sin(c * 0.21);   // wavy layer boundaries
    for (let r = top; r < NY; r++){ solid[r * NX + c] = 1; layer[r * NX + c] = r - top < soil ? 0 : r - top < rock ? 1 : 2; }
  }
  return { solid, layer, dirty: true };
}
const surface = c => { for (let r = 0; r < NY; r++) if (ground.solid[r * NX + c]) return r; return NY; };
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
  world.terrain = { cw: CELL, ch: CELL, cols: NX, rows: NY, solid: ground.solid, mat: DIRT };
  wind = Math.round((Math.random() * 10 - 5) * (Math.random() < 0.33 ? 2 : 1));
  world.g = { x: wind * world.h * 0.012, y: world.h * 0.9 };   // wind is sideways gravity
  // spread the tanks along the hills, in a shuffled order so nobody always starts on the left
  const n = tanks.length, gap = (NX - 32) / (n - 1), order = tanks.map((_, i) => i).sort(() => Math.random() - 0.5);
  order.forEach((k, slot) => {
    const T = tanks[k], x = clamp(Math.round(8 + slot * gap + (Math.random() - 0.5) * gap * 0.4), 4, NX - TW - 4);
    const top = Math.min(...Array.from({ length: TW }, (_, j) => surface(x + j)));   // level a pad under the tank
    for (let j = 0; j < TW; j++) for (let r = 0; r < NY; r++){ const c = r * NX + x + j; ground.solid[c] = r >= top ? 1 : 0; if (r >= top && r < top + 8) ground.layer[c] = 0; }
    Object.assign(T, { x, y: top - TH, angle: x < NX / 2 ? 60 : 120, power: 55, hp: 100, weapon: 0, dead: false, fallT: 0, fallen: 0, cpu: null, earned: 0,
      shield: T.shieldBuy ? SHIELD_HP : 0, odo: 0 });
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
  if (!probe){ const b = world.add(0, 0, ROW * 0.3, "steel", null, METAL); probe = { r: b.r, im: b.im }; world.bodies.splice(world.bodies.indexOf(b), 1); }
  const T = tanks[i], a = angle * Math.PI / 180, v = power / 100 * vmax(), h = 1 / 60 / world.substeps;
  let [x, y] = muzzle({ ...T, angle }), vx = Math.cos(a) * v, vy = -Math.sin(a) * v;
  for (let n = 0; n < 60 * 14 * world.substeps; n++){
    const sp = Math.hypot(vx, vy), k = world.drag * probe.r * sp * probe.im;
    vx += (world.g.x - vx * k) * h; vy += (world.g.y - vy * k) * h;
    const s2 = Math.hypot(vx, vy); if (s2 > 4000){ vx *= 4000 / s2; vy *= 4000 / s2; }
    x += vx * h; y += vy * h;
    if (x <= probe.r + 1 || x >= world.w - probe.r - 1) return { x, y, off: true };
    const gx = Math.floor(x / CELL), gy = Math.floor(y / CELL), age = n * h;
    const hit = tanks.findIndex((U, j) => !U.dead && (j !== i || age > 0.2) && inTank(U, gx, gy));
    if (hit >= 0 || gy >= NY - 1 || (gy >= 0 && gx >= 0 && gx < NX && ground.solid[gy * NX + gx])) return { x, y, tank: hit };
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
  const C = me.cpu, [tx, ty] = mid(foe), dir = foe.x > me.x ? 1 : -1;
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
  const R = WEAPONS[1].r * ROW;
  const weapon = e < 0.12 && best.miss < R && me.ammo[1] > 0 ? 1 : e < 0.2 && best.miss < R * 2 && me.ammo[2] > 0 ? 2 : 0;
  return { ...C.last, weapon };
}

/* ---------- driving: a cell at a time on fuel (a unit every two cells); it climbs small steps and drops off ledges ---------- */
function drive(i, dir){
  const T = tanks[i], x = T.x + dir;
  if (T.fuel <= 0){ say("NO FUEL", 0.8); return; }
  if (x < 2 || x + TW > NX - 2) return;
  if (tanks.some((U, j) => j !== i && !U.dead && Math.abs(U.x - x) < TW && Math.abs(U.y - T.y) < TH + 4)) return;   // another tank in the way
  const top = Math.min(...Array.from({ length: TW }, (_, j) => surface(x + j)));
  if (T.y + TH - top > 4) return;   // too steep to climb
  T.x = x; if (top < T.y + TH) T.y = top - TH;
  if (++T.odo % 2 === 0){ T.fuel--; sfx("dirt"); }
}

/* ---------- firing ---------- */
const muzzle = T => { const a = T.angle * Math.PI / 180; return [(T.x + TW / 2) * CELL + Math.cos(a) * COL * 3, T.y * CELL + 11 - Math.sin(a) * ROW * 1.5]; };
function addShell(x, y, vx, vy, w, owner){
  const b = world.add(x, y, ROW * 0.3, "steel", null, METAL);
  b.sensor = true;   // flies through everything; checkShells() decides what it hit
  b.vx = vx; b.vy = vy; b.weapon = w; b.owner = owner; b.age = 0;
  shells.push(b);
  return b;
}
function fire(i){
  const T = tanks[i], a = T.angle * Math.PI / 180, v = T.power / 100 * vmax(), [mx, my] = muzzle(T);
  if (T.ammo[T.weapon] !== Infinity) T.ammo[T.weapon]--;
  addShell(mx, my, Math.cos(a) * v, -Math.sin(a) * v, T.weapon, i);
  vfx.burst(mx, my, { n: 6, speed: ROW * 8, life: 0.2, dir: -a, spread: 0.8, g: 0 }); vfx.puff(mx, my, ROW * 0.6, 2);
  if (T.ammo[T.weapon] <= 0) T.weapon = 0;   // out of that weapon: back to missiles
  sfx("fire"); trail = []; state = "flight"; stateT = 0;
}
// A tank's cells: the hull and tracks fill its box; the turret, the top two rows, is narrower.
function inTank(T, gx, gy){ const dx = gx - T.x, dy = gy - T.y; return dy >= 0 && dy < TH && dx >= 0 && dx < TW && (dy >= 2 || (dx >= 2 && dx < 8)); }
// Runs after every physics substep, so a fast shell can't skip through a thin ridge between frames.
function checkShells(){
  if (state !== "flight") return;
  for (const b of shells.slice()){
    if (b.dead) continue;
    const gx = Math.floor(b.x / CELL), gy = Math.floor(b.y / CELL);
    if (b.x <= b.r + 1 || b.x >= world.w - b.r - 1){ b.dead = true; continue; }   // off the side: a miss
    const hitTank = tanks.some(T => !T.dead && (T !== tanks[b.owner] || b.age > 0.2) && inTank(T, gx, gy));
    if (hitTank || gy >= NY - 1 || (gy >= 0 && gx >= 0 && gx < NX && ground.solid[gy * NX + gx])){
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
  const R = W.r * ROW;
  blasts.push({ x, y, t: 0.45, big: W.r > 3 });
  sfx(W.dirt ? "dirt" : W.r > 3 ? "bigboom" : "boom");
  const c0 = Math.max(0, Math.floor((x - R) / CELL)), c1 = Math.min(NX - 1, Math.floor((x + R) / CELL));
  const r0 = Math.max(0, Math.floor((y - R) / CELL)), r1 = Math.min(NY - 1, Math.floor((y + R) / CELL));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++){
    const i = r * NX + c, dx = cx(c) - x, dy = cy(r) - y, d = Math.hypot(dx, dy);
    if (d > R) continue;
    if (W.dirt){ if (!ground.solid[i] && !tanks.some(T => !T.dead && inTank(T, c, r))){ ground.solid[i] = 1; ground.layer[i] = 1; } continue; }
    if (!ground.solid[i]) continue;
    if (Math.random() < 0.05){
      const b = world.addBox(cx(c), cy(r), CELL * 0.9, CELL * 0.8, "dirt", GROUND_RGB[ground.layer[i]], DIRT), sp = 150 + Math.random() * 350;
      b.vx = dx / (d || 1) * sp; b.vy = dy / (d || 1) * sp - 150; b.w = (Math.random() - 0.5) * 20; b.flash = 0.6; b.life = 3 + Math.random() * 2; b.soil = ground.layer[i];
    }
    ground.solid[i] = 0;
  }
  ground.dirty = true;
  if (W.dirt) vfx.puff(x, y, R, 6);
  else {
    world.forces.push({ x, y, radius: R * 2.2, strength: world.h * 60, t: 0.08 });
    vfx.explode(x, y, R * 0.6); vfx.debris(x, y, R * 0.5);
    feel.shake(W.r > 3 ? 6 : 3, 0.3); feel.freeze(W.r > 3 ? 0.08 : 0.04);
  }
  tanks.forEach((T, k) => {   // full damage near the centre, none beyond 1.6 radii
    if (T.dead || !W.dmg) return;
    const [mx, my] = mid(T), d = Math.hypot(mx - x, my - y) / R;
    if (d < 1.6) hurt(k, Math.round(W.dmg * clamp(1.6 - d, 0, 1)), owner);
  });
}
function hurt(k, amount, by){
  const T = tanks[k], [tx, ty] = mid(T);
  if (T.dead || amount <= 0) return;
  if (T.shield > 0){ const s = Math.min(T.shield, amount); T.shield -= s; amount -= s; T.flash = 0.3; sfx("clang"); vfx.burst(tx, ty, { n: 12, speed: ROW * 12, pal: PAL.ice, life: 0.4 }); if (!amount) return; }
  const dealt = Math.min(T.hp, amount);
  if (by !== undefined && by !== k){ tanks[by].money += dealt * PAY.damage; tanks[by].earned += dealt * PAY.damage; }   // paid for damage to others
  T.hp -= dealt; T.flash = 0.3;
  if (T.hp > 0){ sfx("clang"); vfx.burst(tx, ty, { n: 10, speed: ROW * 10, life: 0.35 }); feel.shake(2, 0.15); return; }
  T.dead = true; sfx("destroyed");
  vfx.explode(tx, ty, ROW * 2.2); feel.shake(9, 0.5); feel.freeze(0.15); feel.flash(0.45);
  if (by !== undefined && by !== k){ tanks[by].money += PAY.kill; tanks[by].earned += PAY.kill; }
  for (let n = 0; n < 18; n++){   // the tank comes apart: plates and wheels in its colour
    const a = Math.random() * 6.283, sp = 150 + Math.random() * 450, b = world.add(tx, ty, COL * (0.4 + Math.random() * 0.3), "steel", TANK_RGB[k].map(v => v * 0.6), METAL);
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp - 250; b.flash = 1; b.life = 3 + Math.random() * 2; b.r0 = b.r; b.tank = k;
  }
  blasts.push({ x: tx, y: ty, t: 0.45, big: true });
}
// Unsupported dirt drops one cell per pass, bottom-up, so whole columns slide down together. Returns true if anything moved.
function settleGround(){
  const { solid, layer } = ground; let moved = false;
  for (let r = NY - 2; r >= 0; r--) for (let c = 0; c < NX; c++){
    const i = r * NX + c, j = i + NX;
    if (solid[i] && !solid[j]){ solid[j] = 1; layer[j] = layer[i]; solid[i] = 0; moved = true; }
  }
  if (moved) ground.dirty = true;
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
    let held = T.y + TH >= NY;
    for (let c = T.x; c < T.x + TW && !held; c++) if (ground.solid[(T.y + TH) * NX + c]) held = true;
    if (!held){ falling = true; if ((T.fallT -= dt) <= 0){ T.y++; T.fallen++; T.fallT = 0.01; } }
    else if (T.fallen){ if (T.fallen > 8) hurt(k, Math.round((T.fallen - 8) * 0.75)); T.fallen = 0; }
  });
  if (state === "aim"){
    const T = tanks[turn];
    if (keys.drive){ if ((driveT -= dt) <= 0){ driveT = 0.045; drive(turn, keys.drive); } }   // driving, while a drive key is held
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
          for (let n = 0; n < W.split; n++){ const c = addShell(b.x, b.y, b.vx + (n - (W.split - 1) / 2) * COL * 6, b.vy, b.weapon, b.owner); c.child = true; c.falling = true; }
        }
      }
    }
    const lead = shells.find(b => !b.dead); if (lead){ trail.push({ x: lead.x, y: lead.y }); if (trail.length > 400) trail.shift(); }
    if (shells.every(b => b.dead) || stateT > 14) finishFlight();
  } else if (state === "settle"){
    if ((settleT -= dt) <= 0){   // four cells a pass, so dirt falls as fast as it did on the old grid of tall cells
      settleT = 0.02; let moved = false;
      for (let n = 0; n < 4; n++) moved = settleGround() || moved;
      if (moved) stateT = Math.min(stateT, 0.3);   // keep waiting while dirt is still falling
    }
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
// Pixel art, drawn in code. Dusk on a grassy planet: a dithered sky, a low sun, far ridges, and the ground's layers
// in Balote's close tones with pebbles and grass. Tanks after a modern tank seen from the side: tracks on road
// wheels, a sloped hull, a rounded turret with a hatch and aerial, and a barrel that follows the aim.
const SKY = [[14, 16, 38], [22, 22, 52], [36, 28, 64], [58, 36, 72], [92, 50, 76]];
const hash = (x, y) => pixHash(x, y);
const back = { d: new Uint8ClampedArray(pix.W * pix.H * 4), lay: new Int8Array(pix.W * pix.H), key: "" };
// The sky, the sun, the ridges and the ground, drawn again only when the ground changes (or dims behind a screen).
function bakeBack(dim){
  pix.clear();
  for (let y = 0; y < pix.H; y++){   // the sky: five bands, dithered into each other, lighter towards the horizon
    const v = Math.min(4, y / (pix.H * 0.62) * 4);
    for (let x = 0; x < pix.W; x++) pix.px(x, y, SKY[clamp(Math.floor(v + pix.bayer(x, y) - 0.5), 0, 4)], -1);
  }
  for (let k = 0; k < 90; k++){ const x = Math.floor(hash(k, 1) * pix.W), y = Math.floor(hash(k, 2) * pix.H * 0.35), v = 90 + 120 * hash(k, 3); pix.px(x, y, [v, v, v * 1.1], -1); }
  pix.ball(SUN_X, SUN_Y, 13, [255, 168, 84], 1);
  const ridge = pix.ramp([58, 44, 78]);
  for (let x = 0; x < pix.W; x++){   // far ridges
    const top = pix.H * 0.42 - 26 * Math.abs(Math.sin(x * 0.011 + 1.3)) - 10 * Math.sin(x * 0.037);
    for (let y = Math.floor(top); y < pix.H; y++) pix.px(x, y, ridge[y - top < 1 ? 3 : (y - top) * 0.02 + pix.bayer(x, y) * 0.5 > 0.5 ? 1 : 2], 1);
  }
  const { solid, layer } = ground;
  for (let r = 0; r < NY; r++) for (let c = 0; c < NX; c++){
    const i = r * NX + c; if (!solid[i]) continue;
    const R = pix.ramp(SOIL[layer[i]]), open = !r || !solid[i - NX];
    let depth = 0; for (let k = 1; k <= 12 && r - k >= 0 && solid[i - k * NX]; k++) depth = k;   // cells of ground above this one
    for (let j = 0; j < 2; j++) for (let q = 0; q < 2; q++){
      const x = c * 2 + q, y = r * 2 + j, h = hash(x, y);
      let col;
      if (open && j === 0) col = R[4];   // the lit top edge
      else if (h > 0.985) col = R[4]; else if (hash(x - 1, y - 1) > 0.985) col = R[1];   // pebbles with a shadow
      else {   // Balote's close tones from smooth noise, darker deeper down
        const t = [0.9, 0.94, 0.98, 1.02][clamp(Math.floor((0.5 + (pixNoise(x * 0.07, y * 0.1) - 0.5) * 0.8) * 4 + (pix.bayer(x, y) - 0.5) * 0.6), 0, 3)] * (1 - depth * 0.02);
        col = R[3].map(v => v * t);
      }
      pix.px(x, y, dim < 1 ? col.map(v => v * dim) : col, 2);
    }
    if (open && layer[i] === 0 && hash(c, 7) < 0.35){   // grass blades on open topsoil
      const g = pix.ramp(SOIL[0]), hgt = 1 + Math.floor(hash(c, 8) * 3);
      for (let k = 1; k <= hgt; k++) pix.px(c * 2 + (hash(c, 9) > 0.5 ? 1 : 0), r * 2 - k, dim < 1 ? g[4].map(v => v * dim) : g[k === hgt ? 4 : 3], 2);
    }
  }
  back.d.set(pix.d); back.lay.set(pix.lay);
}
function drawTank(T, k, t){
  const x0 = T.x * 2, y0 = T.y * 2, f = T.angle <= 90 ? 1 : -1, hot = T.flash > 0;
  const col = hot ? [250, 250, 250] : TANK_PIX[k], R = pix.ramp(col), M = pix.ramp([150, 152, 164]), K = pix.ramp([62, 62, 70]);
  const P = (lx, ly, c) => pix.px(f > 0 ? x0 + lx : x0 + 19 - lx, y0 + ly, c, 3);   // the tank faces the way it aims
  for (let lx = 0; lx < 20; lx++) for (let ly = 12; ly < 16; ly++){   // tracks: a rounded belt with moving links
    if ((lx === 0 || lx === 19) && (ly === 12 || ly === 15)) continue;
    P(lx, ly, K[ly === 12 ? 3 : ly === 15 ? 1 : (lx + T.odo * f) % 3 ? 1 : 2]);
  }
  for (const wx of [2, 6, 10, 14, 17]) { P(wx, 13, M[4]); P(wx + 1, 13, M[3]); P(wx, 14, M[2]); P(wx + 1, 14, M[1]); }   // road wheels
  // the hull, long and low: a sloped glacis at the front, a darker skirt with bolts along the side
  [[2, 15, 4], [1, 17, 3], [1, 18, 2], [1, 18, 2]].forEach(([a, b, lv], j) => { for (let lx = a; lx <= b; lx++) P(lx, 8 + j, R[j < 2 && lx >= b - 1 ? 4 : lv]); });
  for (let lx = 3; lx <= 16; lx += 3) P(lx, 10, R[1]);
  // the turret, set back and angular, with a sloped front; a hatch and an aerial on top
  [[7, 13, 4], [6, 14, 3], [6, 15, 3], [5, 15, 2]].forEach(([a, b, lv], j) => { for (let lx = a; lx <= b; lx++) P(lx, 4 + j, R[lx >= b ? Math.min(4, lv + 1) : lv]); });
  P(9, 3, M[3]); P(10, 3, M[4]); P(11, 3, M[2]);
  for (let ly = -3; ly < 4; ly++) P(6, ly, M[ly === -3 ? 4 : 2]);
  const a = T.angle * Math.PI / 180, bx = (f > 0 ? x0 + 14 : x0 + 5) + 0.5, by = y0 + 5.5;   // the barrel pivots at the turret's front
  for (let n = 1; n <= 11; n++){
    const px = bx + Math.cos(a) * n, py = by - Math.sin(a) * n;
    pix.px(px, py, M[3], 3); pix.px(px + Math.sin(a), py + Math.cos(a), M[1], 3);
    if (n === 11){ pix.px(px + Math.cos(a), py - Math.sin(a), M[4], 3); pix.px(px - Math.sin(a), py - Math.cos(a), M[2], 3); }   // the muzzle brake
  }
  if (T.shield > 0) for (let n = 0; n < 48; n++){   // the shield: a bubble of dots, fuller the more it has left
    if (n / 48 > 0.35 + 0.65 * T.shield / SHIELD_HP && n % 2) continue;
    const s = n / 48 * Math.PI * 2 + t * 0.001; pix.px(x0 + 10 + Math.cos(s) * 14, y0 + 9 + Math.sin(s) * 11, (n + (t / 120 | 0)) % 6 ? [120, 200, 255] : [230, 250, 255], 3);
  }
}
// A small bobbing arrow over the tank whose turn it is (after Balote's), in its colour with a dark outline.
const ARROW = ["ooooo", "oXXXo", "ooXoo", ".oXo.", "..o.."];
function drawArrow(T, k, t){
  const x0 = T.x * 2 + 8, y0 = T.y * 2 - 16 - (t / 300 | 0) % 2 * 2;
  ARROW.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") pix.px(x0 + i, y0 + j, ch === "X" ? pix.ramp(TANK_PIX[k])[4] : [24, 22, 30], 3); }));
}
function drawWorld(t){
  for (const B of blasts) pix.glow(B.x, B.y, ROW * (B.big ? 9 : 6), FLASH.map(v => v * B.t * 0.8));
  for (const b of world.bodies){
    if (b.sensor) continue;
    if (b.box) pix.body(b, SOIL[b.soil ?? 1]);
    else pix.ball(b.x / PU, b.y / PU, Math.max(1, b.r / PU), b.tank !== undefined ? TANK_PIX[b.tank] : [150, 152, 164], 3, true);
  }
  vfx.draw(pix);
}
function drawTitle(){
  pix.rect(30, 25 * 8 - 4, pix.W - 60, 9 * 8 + 8, [10, 12, 22], 3);   // a dark panel behind the text
  [["CRATER", 10], ["DUEL", 17]].forEach(([word, y0], wi) => {
    const x0 = Math.floor((TGW - word.length * 12 + 2) / 2), R = pix.ramp(TANK_PIX[wi]);
    [...word].forEach((ch, li) => FONT[ch].forEach((row, dy) => { for (let dx = 0; dx < 5; dx++) if (row[dx] === "#"){
      const X = (x0 + li * 12 + dx * 2) * 4, Y = (y0 + dy) * 8, on = (ddx, ddy) => FONT[ch][dy + ddy] && FONT[ch][dy + ddy][dx + ddx] === "#";
      for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++){   // each dot a bevelled block, joined to its neighbours
        const lv = (j === 0 && !on(0, -1)) || (i === 0 && !on(-1, 0)) ? 4 : (j === 7 && !on(0, 1)) || (i === 7 && !on(1, 0)) ? 1 : j < 3 ? 3 : 2;
        pix.px(X + i, Y + j, R[lv], 3);
      }
    } }));
  });
  const blink = (performance.now() / 500 | 0) % 2;
  pix.center(27, (pad.touch ? "A" : "1") + "  ONE PLAYER (VS COMPUTER)     " + (pad.touch ? "B" : "2") + "  TWO PLAYERS", blink ? WHITE : DIM);
  pix.center(29, pad.touch ? "D-PAD LEFT/RIGHT AIM, UP/DOWN DRIVE.  HOLD A FOR POWER, LET GO TO FIRE.  B WEAPON" : "LEFT/RIGHT AIM  SHIFT+LEFT/RIGHT DRIVE  HOLD SPACE FOR POWER  TAB WEAPON  ESC MENU", DIM);
  pix.center(31, "LAST TANK STANDING WINS THE ROUND. FIRST TO " + WIN_ROUNDS + " ROUNDS. SHOP BETWEEN ROUNDS.", DIM);
  pix.center(32, count + " TANKS (CHANGE IN THE MENU)", DIM);
}
function drawShop(){
  const T = tanks[shopAt], x0 = 25, y0 = 12, w = 50, text = pix.text;
  pix.rect((x0 - 2) * 4, (y0 - 1) * 8, (w + 4) * 4, (17 + SHOP.length) * 8, [10, 12, 22], 3);
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
  text(Math.max(x0, (TGW - st.length) >> 1), y0 + 13 + SHOP.length, st, DIM);
}
function draw(t){
  const dim = state === "title" || state === "shop" ? 0.45 : 1, key = dim + "";
  if (ground.dirty || back.key !== key){ ground.dirty = false; back.key = key; bakeBack(dim); }
  pix.clear(); pix.d.set(back.d); pix.lay.set(back.lay);
  drawWorld(t);
  if (state === "title"){ drawTitle(); return finish(); }
  if (state === "shop"){ drawShop(); return finish(); }
  tanks.forEach((T, k) => { if (!T.dead) drawTank(T, k, t); });
  const T = tanks[turn];
  if ((state === "aim" || state === "cpu") && T && !T.dead){   // your last shot, faintly, and an aim guide whose length shows power
    const R = pix.ramp(TANK_PIX[turn]), a = T.angle * Math.PI / 180, [mx, my] = muzzle(T);
    lastTrail[turn].forEach((p, i) => { if (i % 3 === 0) pix.px(p.x / PU, p.y / PU, R[1], 1); });
    const n = 2 + Math.round(T.power / 14);
    for (let k = 1; k <= n; k++){ const px = mx / PU + Math.cos(a) * k * 5, py = my / PU - Math.sin(a) * k * 5; pix.px(px, py, k === n ? R[4] : R[2], 3); }
    const ex = mx / PU + Math.cos(a) * n * 5, ey = my / PU - Math.sin(a) * n * 5;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pix.px(ex + dx, ey + dy, R[4], 3);
    drawArrow(T, turn, t);
  }
  trail.forEach((p, i) => { if (i % 2 === 0) pix.px(p.x / PU, p.y / PU, [150, 140, 120], 1); });
  for (const b of shells) if (!b.dead){
    const x = b.x / PU, y = b.y / PU;
    if (y < 28){ for (let k = 0; k < 3; k++) pix.rect(x - k, 28 + k, 2 * k + 1, 1, [255, 230, 160], 3); continue; }   // above the top: a mark shows where it will come down
    pix.ball(x, y, 2, [255, 236, 190], 3, true); pix.glow(b.x, b.y, ROW * 1.2, [0.5, 0.35, 0.15]);
  }
  pix.edges();
  // HUD: each tank's health and rounds across the top, wind in the middle, the active tank's aim, weapon and fuel below
  const colW = Math.floor(TGW / tanks.length);
  tanks.forEach((U, i) => { const s = `${name(i)} HP ${String(U.hp).padStart(3)}${U.shield ? "+" + U.shield : ""} R${U.wins}`; pix.text(i * colW + ((colW - s.length) >> 1), 0, s, U.dead ? DIM : TANK_RGB[i]); });
  pix.center(1, "WIND " + (wind === 0 ? "CALM" : wind < 0 ? "<".repeat(Math.min(5, Math.ceil(-wind / 2))) + " " + -wind : wind + " " + ">".repeat(Math.min(5, Math.ceil(wind / 2)))), WHITE);
  if (state !== "over" && T && !T.dead){
    const W = WEAPONS[T.weapon], ammo = T.ammo[T.weapon] === Infinity ? "" : " x" + T.ammo[T.weapon];
    pix.center(2, `ANGLE ${String(Math.round(T.angle)).padStart(3)}   POWER ${String(Math.round(T.power)).padStart(3)}   ${W.name}${ammo}   FUEL ${T.fuel}`, TANK_RGB[turn]);
  }
  if (state === "aim" || state === "cpu"){   // the power meter, with a mark where your last shot was
    const R = pix.ramp(TANK_PIX[turn]), w = 120, x0 = (pix.W - w) >> 1, y0 = 26, fill = Math.round(T.power / 100 * w), lp = lastPower[turn];
    pix.rect(x0 - 1, y0 - 1, w + 2, 6, [20, 22, 34], 4);
    for (let x = 0; x < w; x++) for (let y = 0; y < 4; y++) pix.px(x0 + x, y0 + y, x < fill ? R[y ? 3 : 4] : [44, 46, 62], 4);
    if (lp !== null){ const m = x0 + Math.min(w - 1, Math.round(lp / 100 * w)); pix.rect(m, y0 - 2, 1, 8, [240, 240, 240], 4); }
    if (state === "aim" && charge === null && msgT <= 0) pix.center(5, pad.touch ? "HOLD A FOR POWER, LET GO TO FIRE.  D-PAD UP/DOWN DRIVES" : "HOLD SPACE FOR POWER, LET GO TO FIRE.  SHIFT+ARROWS DRIVE", DIM);
  }
  if (state === "over"){
    const w = winner();
    pix.center(9, `  ${name(w)} WINS ${tanks.map(U => U.wins).join("-")}  `, TANK_RGB[w]);
    pix.center(11, pad.touch ? "  PRESS START FOR A NEW MATCH  " : "  PRESS SPACE FOR A NEW MATCH  ", WHITE);
  } else if (msgT > 0) pix.center(9, "  " + msg + "  ", WHITE);
  const hint = pad.touch ? " SELECT MENU " : " ESC MENU ";
  pix.text(TGW - 1 - hint.length, TGH - 1, hint, DIM);
  finish();
}
function finish(){
  if (state === "title" || state === "shop") pix.edges();
  // the menu writes on its own layer, above the game's text, so nothing shows through its box
  if (menu.open) menu.draw(pix, { accent: TANK_RGB[0], normal: WHITE, dim: DIM, title: state === "title" ? "MENU" : "PAUSED", note: "MODE AND TANKS APPLY TO THE NEXT MATCH" });
  pix.present(ctx);
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
  if (menu.open){ const [gx, gy] = gridAt(e, cv, TGW, TGH); menu.tap(gx, gy); return; }
  if (state === "title" || state === "over") action();
  else if (!pad.touch) menu.show();   // a mouse click during play opens the menu
});

/* ---------- loop ---------- */
world.onSub = checkShells;
function tick(dt, t){
  if (ready && !menu.open && (dt = feel.step(dt))){   // the open menu pauses everything, and so does a hit-stop
    vfx.update(dt);
    if (state !== "title" && state !== "over") update(dt);
    for (const B of blasts) B.t -= dt;
    blasts = blasts.filter(B => B.t > 0);
    for (const f of world.forces) f.t -= dt;
    world.forces = world.forces.filter(f => f.t > 0);
    world.step(dt);
    for (const b of world.bodies) if (b.life){ b.life -= dt; if (b.life < 1 && b.r0) b.r = b.r0 * Math.max(0.3, b.life); }
    world.bodies = world.bodies.filter(b => !(b.life <= 0));
  }
  if (ready){ feel.begin(ctx, cv); draw(t); feel.end(ctx, cv); }
}
layout();
ground = makeGround();   // hills behind the title screen
world.terrain = { cw: CELL, ch: CELL, cols: NX, rows: NY, solid: ground.solid, mat: DIRT };
onResize(stage, layout);
startLoop(tick);
})();
