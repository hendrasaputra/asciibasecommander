/* ---------- Torchlight Dungeons: the shops of Lanternhollow (phase 4) ---------- */
// Original content: the shops, keepers and lines are this game's own. Prices are fixed (Moria haggles; that may
// come later as an option). A keeper marks prices up by their greed; Charisma moves both buying and selling prices.
const SHOPS = [
  { name: "General Store", keeper: "Odda the Provisioner", greed: 1.1, rgb: [1.3, 1.1, 0.6], size: [12, 16], always: ["torch", "ration", "oil"],
    sells: ["ration", "jerky", "biscuit", "honeycake", "torch", "lantern", "oil", "cloak", "furcloak", "dart", "arrow", "shot", "bolt", "sling"],
    buys: ["food", "light", "flask", "cloak", "ammo", "dart"], hello: ["Need anything for the road, dear?", "Torches, food and oil: all you need down there.", "Mind you come back."] },
  { name: "Armoury", keeper: "Bram Ironside", greed: 1.2, rgb: [0.8, 0.85, 1.1], size: [10, 14], cats: ["body", "shield", "head", "hands", "feet"], maxDepth: 14,
    buys: ["body", "shield", "head", "hands", "feet", "cloak"], hello: ["Good steel saves lives.", "Try it on. It's the only way to know.", "Dents are extra."] },
  { name: "Weaponsmith", keeper: "Kessa Edgewright", greed: 1.25, rgb: [1.2, 0.7, 0.5], size: [10, 14], cats: ["weapon", "bow", "ammo"], maxDepth: 14,
    buys: ["weapon", "bow", "ammo", "dart"], hello: ["Every blade here is sharp. I checked.", "Point the sharp end away from you.", "Bring me something good from below."] },
  { name: "Temple", keeper: "Sister Ilvane", greed: 1.15, rgb: [1.3, 1.2, 0.9], size: [10, 14], always: ["heal", "hbook1"],
    sells: ["hbook1", "hbook2", "heal", "bigheal", "pclear", "ppoisoncure", "sbless", "schant", "suncurse", "srecall", "mace", "flail", "morningstar", "warhammer"],
    buys: ["potion", "scroll", "book"], hello: ["May your light never fail.", "The flame keeps watch over all of us.", "Rest here a while, if you need."] },
  { name: "Alchemist", keeper: "Thorne Vialkeeper", greed: 1.3, rgb: [0.7, 1.2, 0.8], size: [10, 15], always: ["heal", "sident", "srecall"],
    sells: ["heal", "bigheal", "pfire", "pcold", "pinfra", "phero", "pspeed", "sident", "slight", "sphase", "smap", "sobj", "smon", "sfood", "srecall", "senchhit", "senchdam", "senchac", "stele"],
    buys: ["potion", "scroll"], hello: ["Don't touch the green ones.", "Every bottle has a story. Some of them explode.", "Read the label. Then read it again."] },
  { name: "Magic Shop", keeper: "Maelis of the Blue Door", greed: 1.4, rgb: [0.8, 0.7, 1.4], size: [8, 12],
    always: ["abook1"], sells: ["abook1", "abook2", "wmissile", "wsleep", "wslow", "wconf", "wstink", "wlight", "wmud", "tlight", "tdetmon", "tdetobj", "tcure", "rillum", "rlight", "robj",
      "rprot", "rfire", "rcold", "racc", "rdam", "adigest", "ainfra", "acha"],
    buys: ["wand", "staff", "rod", "ring", "amulet", "book"], hello: ["Everything here does something. Mostly what it should.", "Charges not included. Well, some are.", "Ah, a customer with taste."] }
];
// What an item is worth (in gold), from its kind and what was rolled for it. Cursed or broken things are worth nothing.
function itemValue(it){
  const K = ITEM[it.k];
  if (it.cursed || !K.cost) return 0;
  const plus = (it.tohit || 0) + (it.todam || 0) + (it.toac || 0);
  if (plus < 0) return 0;
  let v = K.cost + plus * 60;
  if (it.ego) v += K.cost + 400;
  if (it.art) v += 5000;
  if (it.pval > 0 && (K.pstat || K.pspeed || K.phit || K.pdam || K.pac || K.pinfra)) v += K.cost * (it.pval - 1) * 0.5;
  if (it.charges !== undefined) v = it.charges > 0 ? K.cost * (0.4 + it.charges / 10) : 0;
  if (K.cat === "light" && it.fuel !== undefined && K.fuel) v = K.cost * Math.max(0.2, it.fuel / K.fuel);
  return Math.round(v);
}
const chaFactor = cha => Math.max(0.8, Math.min(1.2, 1 - 0.03 * statMod(cha)));
const buyPrice = (it, shop, cha) => Math.max(1, Math.ceil(itemValue(it) * shop.greed * chaFactor(cha)));
const sellPrice = (it, shop, cha) => Math.floor(itemValue(it) * 0.4 / shop.greed / chaFactor(cha));
const shopBuys = (shop, it) => shop.buys.includes(ITEM[it.k].cat);
// A shop's goods: its own kinds (or categories, up to a depth), never cursed, all fully known to the keeper.
function stockItem(shop, rng, know, kind){
  const pool = shop.sells || ITEMS.filter(K => shop.cats.includes(K.cat) && K.depth <= shop.maxDepth).map(K => K.id);
  for (let tries = 0; tries < 20; tries++){
    const K = ITEM[kind || rng.pick(pool)], n = ["food", "potion", "scroll", "flask", "ammo", "dart"].includes(K.cat) ? (K.cat === "ammo" || K.cat === "dart" ? rng.range(10, 30) : rng.range(1, 5)) : 1;
    const it = makeItem(K.id, 5, rng, know, n);
    if (it.cursed || itemValue(it) <= 0 || it.art) continue;
    it.id = true; delete it.sense;
    return it;
  }
  return null;
}
function newShops(rng, know){ return SHOPS.map(S => ({ stock: restock([], S, rng, know, 1) })); }
// Between visits, part of the stock sells and new goods come in. share: how much changes (1 fills a new shop).
// Plain goods of one kind share a shelf (one stack); a shop's staples (always) are never sold out.
const plainGoods = it => !it.tohit && !it.todam && !it.toac && !it.ego && !it.art && it.charges === undefined && !it.pval;
function shelve(stock, it){
  const same = plainGoods(it) && stock.find(o => o.k === it.k && plainGoods(o) && o.fuel === it.fuel);
  if (same) same.n += it.n; else stock.push(it);
}
function restock(stock, shop, rng, know, share){
  const keep = [];
  for (const it of stock) if (!rng.chance(share * 0.5)) keep.push(it);
  for (const k of shop.always || []) if (!keep.some(o => o.k === k)){ const it = stockItem(shop, rng, know, k); if (it) shelve(keep, it); }
  const target = rng.range(shop.size[0], shop.size[1]);
  for (let tries = 0; keep.length < target && tries < 60; tries++){ const it = stockItem(shop, rng, know); if (it) shelve(keep, it); }
  return keep;
}
// Everyone knows what is on a keeper's shelf: names in a shop show every kind as known.
const SHOP_KNOWS = { known: new Proxy({}, { get: () => true }) };
