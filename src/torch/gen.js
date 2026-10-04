/* ---------- Torchlight Dungeons: level generation ---------- */
// Rooms of a few shapes joined by corridors, with doors where a corridor passes through a room's wall, and stairs.
// Original code: the layout ideas (rooms, tunnels, lit rooms that get rarer with depth) are common to the genre.
const MW = 198, MH = 66;   // map size, as in Moria
// Town tiles: GROUND (open ground), SHOP (a shop's entrance; L.shopAt says which), LAMP (a lamp post: blocks your
// way but not your view).
const T = { EDGE: 0, WALL: 1, FLOOR: 2, DOOR: 3, OPEN: 4, DOWN: 5, UP: 6, SHOP: 7, GROUND: 8, LAMP: 9 };
const passable = t => t >= T.FLOOR && t !== T.DOOR && t !== T.LAMP;   // closed doors open when you walk into them
const opaque = t => t <= T.WALL || t === T.DOOR;

function generateLevel(rng, depth){
  const tiles = new Uint8Array(MW * MH).fill(T.WALL), room = new Int16Array(MW * MH).fill(-1), lit = new Uint8Array(MW * MH);
  for (let x = 0; x < MW; x++){ tiles[x] = T.EDGE; tiles[(MH - 1) * MW + x] = T.EDGE; }
  for (let y = 0; y < MH; y++){ tiles[y * MW] = T.EDGE; tiles[y * MW + MW - 1] = T.EDGE; }
  const rooms = [];
  const free = (x0, y0, x1, y1) => {   // inside the map, and not touching another room (one cell of wall between)
    if (x0 < 2 || y0 < 2 || x1 > MW - 3 || y1 > MH - 3) return false;
    for (let y = y0 - 2; y <= y1 + 2; y++) for (let x = x0 - 2; x <= x1 + 2; x++) if (room[y * MW + x] >= 0) return false;
    return true;
  };
  const target = 20 + rng.int(10);
  for (let tries = 0; rooms.length < target && tries < 600; tries++){
    const w = 4 + rng.int(14), h = 3 + rng.int(7), x0 = 2 + rng.int(MW - w - 4), y0 = 2 + rng.int(MH - h - 4), x1 = x0 + w - 1, y1 = y0 + h - 1;
    if (!free(x0, y0, x1, y1)) continue;
    const id = rooms.length, isLit = rng.int(28) + 1 > depth;   // lit rooms are common near the top, rare deep down
    const shape = w >= 9 && h >= 5 ? rng.pick(["plain", "plain", "plain", "cross", "pillars"]) : "plain";
    const cells = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++){
      if (shape === "cross"){   // a plus shape: drop the four corners
        const cxw = Math.floor(w / 4), cyh = Math.floor(h / 3);
        if ((x < x0 + cxw || x > x1 - cxw) && (y < y0 + cyh || y > y1 - cyh)) continue;
      }
      if (shape === "pillars" && (x - x0) % 2 === 1 && (y - y0) % 2 === 1 && x < x1 && y < y1) continue;   // a pillared hall
      cells.push(y * MW + x);
    }
    for (const i of cells){ tiles[i] = T.FLOOR; room[i] = id; }
    // the room's walls belong to it too, so they are lit with it and doors can be placed in them
    for (const i of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      const j = i + dy * MW + dx; if (tiles[j] === T.WALL && room[j] < 0) room[j] = id;
    }
    if (isLit) for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (room[y * MW + x] === id) lit[y * MW + x] = 1;
    rooms.push({ id, x0, y0, x1, y1, lit: isLit, cells, cx: (x0 + x1) >> 1, cy: (y0 + y1) >> 1 });
  }
  // corridors: each room to the next one from left to right, then a few extra links so there are loops
  const order = [...rooms].sort((a, b) => a.cx - b.cx);
  const carved = new Uint8Array(MW * MH);
  const dig = i => { if (tiles[i] === T.WALL){ tiles[i] = T.FLOOR; carved[i] = 1; } };
  const tunnel = (a, b) => {
    let x = a.cx, y = a.cy;
    const hFirst = rng.chance(0.5), bendX = hFirst ? b.cx : a.cx, bendY = hFirst ? a.cy : b.cy;
    const walk = (tx, ty) => { while (x !== tx || y !== ty){ if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); dig(y * MW + x); } };
    walk(bendX, bendY); walk(b.cx, b.cy);
  };
  for (let i = 1; i < order.length; i++) tunnel(order[i - 1], order[i]);
  for (let k = 0; k < 3 + rng.int(4); k++) tunnel(rng.pick(rooms), rng.pick(rooms));
  // doors: a carved cell in a room's wall that a corridor passes straight through
  for (let i = 0; i < tiles.length; i++){
    if (!carved[i] || room[i] < 0 || tiles[i] !== T.FLOOR) continue;
    const ns = passable(tiles[i - MW]) && passable(tiles[i + MW]) && opaque(tiles[i - 1]) && opaque(tiles[i + 1]);
    const ew = passable(tiles[i - 1]) && passable(tiles[i + 1]) && opaque(tiles[i - MW]) && opaque(tiles[i + MW]);
    if ((ns || ew) && rng.chance(0.75)) tiles[i] = rng.chance(0.65) ? T.DOOR : T.OPEN;
  }
  // stairs, on room floor away from doors
  const spot = () => {
    for (let tries = 0; tries < 500; tries++){
      const r = rng.pick(rooms), i = rng.pick(r.cells);
      if (tiles[i] !== T.FLOOR) continue;
      let nearDoor = false; for (const d of [1, -1, MW, -MW]) if (tiles[i + d] === T.DOOR || tiles[i + d] === T.OPEN) nearDoor = true;
      if (!nearDoor) return i;
    }
    return rooms[0].cells[0];
  };
  for (let k = 0; k < 1 + rng.int(2); k++) tiles[spot()] = T.DOWN;
  for (let k = 0; k < 1 + rng.int(2); k++) tiles[spot()] = T.UP;   // on level 1 they lead up to the town
  return { tiles, room, lit, rooms, spot, w: MW, h: MH };
}

/* ---------- the town ---------- */
// A walled town on the surface: six shops in two rows along a main street, a few houses, lamp posts, and the
// stairs down. It uses the top-left TW x TH of the map; L.w and L.h tell the camera where it ends.
const TW = 80, TH = 26;
function generateTown(rng){
  const tiles = new Uint8Array(MW * MH).fill(T.EDGE), room = new Int16Array(MW * MH).fill(-1), lit = new Uint8Array(MW * MH);
  const shopAt = new Int8Array(MW * MH).fill(-1), at = (x, y) => y * MW + x;
  for (let y = 1; y < TH - 1; y++) for (let x = 1; x < TW - 1; x++) tiles[at(x, y)] = T.GROUND;
  const shops = [], houses = [], lamps = [];
  const building = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) tiles[at(x, y)] = T.WALL; };
  // shops: three facing the street from above, three from below; the street runs along the middle
  const order = rng.shuffle([0, 1, 2, 3, 4, 5]), street = TH >> 1;
  for (let k = 0; k < 6; k++){
    const top = k < 3, col = k % 3, w = 12 + rng.int(4), h = 5, x0 = 5 + col * 25 + rng.int(4), y0 = top ? street - h - 2 - rng.int(2) : street + 3 + rng.int(2);
    building(x0, y0, w, h);
    const dx = x0 + 2 + rng.int(w - 4), dy = top ? y0 + h - 1 : y0, door = at(dx, dy);   // the entrance faces the street
    tiles[door] = T.SHOP; shopAt[door] = order[k];
    shops[order[k]] = { x0, y0, w, h, door };
  }
  // small houses, and lamp posts along the street
  for (let tries = 0; tries < 60 && houses.length < 6; tries++){
    const w = 4 + rng.int(4), h = 3 + rng.int(2), x0 = 2 + rng.int(TW - w - 4), y0 = 2 + rng.int(TH - h - 4);
    let free = true;
    for (let y = y0 - 1; y <= y0 + h && free; y++) for (let x = x0 - 1; x <= x0 + w && free; x++) if (tiles[at(x, y)] !== T.GROUND || Math.abs(y - street) <= 1) free = false;
    if (free){ building(x0, y0, w, h); houses.push({ x0, y0, w, h }); }
  }
  for (let x = 6; x < TW - 4; x += 12) for (const y of [street - 1, street + 1]) if (tiles[at(x, y)] === T.GROUND){ tiles[at(x, y)] = T.LAMP; lamps.push(at(x, y)); }
  // the stairs down, somewhere on open ground away from the street
  const ground = []; for (let i = 0; i < tiles.length; i++) if (tiles[i] === T.GROUND) ground.push(i);
  let down;
  do down = rng.pick(ground); while (Math.abs(Math.floor(down / MW) - street) < 3);
  tiles[down] = T.DOWN;
  return { tiles, room, lit, rooms: [{ cells: ground.filter(i => i !== down) }], spot: () => down, w: TW, h: TH, town: true, shops, shopAt, lamps, houses, street };
}
// Every cell a player can stand on, reached from the first room (closed doors count as passable).
function reachable(L){
  const seen = new Uint8Array(MW * MH), stack = [L.rooms[0].cells[0]]; seen[stack[0]] = 1;
  while (stack.length){
    const i = stack.pop();
    for (const d of [1, -1, MW, -MW, MW + 1, MW - 1, -MW + 1, -MW - 1]){
      const j = i + d; if (seen[j] || !(passable(L.tiles[j]) || L.tiles[j] === T.DOOR)) continue;
      seen[j] = 1; stack.push(j);
    }
  }
  return seen;
}
