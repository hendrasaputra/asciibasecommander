/* ---------- Torchlight Dungeons: the interface, in HTML over the map (phase 6) ---------- */
// The HUD (status, minimap, target, messages, action bar and hotbar), the side panel's tabs (Character, Pack,
// Book, Journal, Map), dialogs (items, shops, menus) and the title, creation and tombstone screens. Keyboard only:
// the mouse just points (tooltips) and clicks in the panel and dialogs. Drawn lazily: refreshUI() marks it stale and
// the next frame redraws it.
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const URLS = new WeakMap();
const pic = (c, cls = "") => `<img class="px ${cls}" src="${URLS.get(c) || (URLS.set(c, c.toDataURL()), URLS.get(c))}" alt="">`;
const itemPic = (it, cls) => pic(itemIcon(it), cls);
const sgn = v => (v > 0 ? "+" : "") + v;
let uiDirty = true, panelOn = store.get("panel") !== "0", tab = "char", panelFocus = false, psel = 0, dlg = null, tipFor = null;
const refreshUI = () => { uiDirty = true; };

/* ---------- items: quality colours and the item card ---------- */
// The colour frame shows what you know of an item: red cursed, blue magical, purple special, gold artifact,
// grey a kind you have not identified, white plain.
function quality(it){
  if (it.k === "gold") return "plain";
  const K = ITEM[it.k], sum = (it.tohit || 0) + (it.todam || 0) + (it.toac || 0);
  if (it.art && (it.id || it.sense)) return "art";
  if (it.cursed && (it.id || it.sense === "cursed")) return "cursed";
  if (it.sense === "special" || (it.id && it.ego)) return "ego";
  if (it.sense === "magical" || (it.id && (sum > 0 || it.pval > 0))) return "magic";
  if (K.flavoured && !kindKnown(K, player.know)) return "unknown";
  return "plain";
}
const avgDice = s => { if (!s) return 0; const [n, d] = s.split("d").map(Number); return n * (d + 1) / 2; };
function itemNumbers(it){   // what you can see of it: base numbers always, bonuses once identified
  const K = ITEM[it.k], o = {};
  if (K.dice && K.cat !== "ammo") o.dmg = avgDice(K.dice);
  if (K.ac !== undefined) o.ac = K.ac + (it.id && it.toac || 0);
  if (it.id && (K.dice || K.mult)){ o.hit = it.tohit || 0; o.dam = it.todam || 0; }
  return o;
}
const slotFor = K => K.slot === "ring" ? (player.eq.ring1 ? "ring1" : "ring1") : K.slot;
function card(it, compare = true){
  const K = ITEM[it.k], q = quality(it), A = it.art ? ARTIFACT[it.art] : null, P = itemPowers(it), known = kindKnown(K, player.know);
  const rows = [], n = itemNumbers(it), worn = compare && K.slot ? player.eq[slotFor(K)] : null, w = worn && worn !== it ? itemNumbers(worn) : null;
  const cmp = (k, v, fmt = x => x) => { let d = ""; if (w && w[k] !== undefined && v !== w[k]){ const g = v > w[k]; d = ` <i class="${g ? "up" : "down"}">${g ? "▲" : "▼"} ${fmt(Math.abs(v - w[k]))}</i>`; } return d; };
  if (K.dice && K.cat !== "ammo") rows.push(["Damage", K.dice + (K.cat === "dart" ? " thrown" : "") + cmp("dmg", n.dmg, x => x.toFixed(1))]);
  if (K.dice && K.cat === "ammo") rows.push(["Damage", K.dice + " × launcher"]);
  if (K.mult) rows.push(["Multiplier", "×" + K.mult]);
  if (n.hit !== undefined && (n.hit || n.dam)) rows.push(["To hit / damage", sign(n.hit) + " / " + sign(n.dam) + cmp("hit", n.hit) ]);
  if (n.ac !== undefined) rows.push(["Armour", n.ac + cmp("ac", n.ac)]);
  if (K.radius) rows.push(["Light radius", (A && A.radius) || K.radius]);
  if (it.fuel !== undefined) rows.push(["Fuel", it.fuel + " turns"]);
  if (it.charges !== undefined && it.id) rows.push(["Charges", it.charges]);
  if (K.food) rows.push(["Nourishment", K.food >= 3000 ? "a meal" : K.food >= 1500 ? "a snack" : "a bite"]);
  rows.push(["Weight", (Math.round(itemWeight(it) * 10) / 10) + " lb"]);
  const lines = [];
  if (K.effect) lines.push(known ? "It " + EFFECT_TEXT[K.effect] + "." : "You do not know what it does" + (player.know.tried[K.id] ? " (tried)." : "."));
  if (it.id || A){
    if (P.brand) lines.push("It " + { fire: "burns", cold: "freezes", elec: "shocks" }[P.brand] + " your foes.");
    if (P.slay) lines.push("Deadly against " + { animal: "animals", undead: "the undead", evil: "evil" }[P.slay] + ".");
    if (P.res.length) lines.push("Protects you from " + [...new Set(P.res)].join(", ") + ".");
    for (const [k, v] of Object.entries(P.stats)) lines.push(sign(v) + " " + STAT_NAMES[k] + ".");
    if (P.speed) lines.push(sign(P.speed) + " speed.");
    if (P.stealth) lines.push("+" + P.stealth + " stealth.");
    if (P.freeAct) lines.push("Keeps you from being put to sleep or paralysed.");
    if (P.seeInv) lines.push("Lets you see invisible things.");
    if (P.regen) lines.push("Speeds your healing.");
    if (P.slowDigest) lines.push("You need less food.");
    if (it.cursed) lines.push("It is cursed.");
  } else if ((K.dice || K.ac !== undefined || K.mult) && K.cat !== "dart") lines.push(it.sense ? "You feel it is " + it.sense + "." : "Its quality is unknown.");
  if (K.cat === "book") lines.push("Holds " + SPELLS.filter(S => bookOf(S) === K.id).map(S => S.name).join(", ") + ".");
  if (A) lines.push(A.desc);
  if (K.desc) lines.push(K.desc);
  const kind = K.slot ? SLOT_NAMES[slotFor(K)] : { potion: "Potion", scroll: "Scroll", food: "Food", mushroom: "Mushroom", wand: "Wand", staff: "Staff", rod: "Rod", ammo: "Ammunition", dart: "Thrown", flask: "Oil", book: "Spell book" }[K.cat] || "";
  return `<div class="card q-${q}"><div class="ct">${itemPic(it, "big")}<div><b>${esc(cap(nameOf(it)))}</b><small>${kind}${worn && worn !== it ? " · compared with what you wear" : ""}</small></div></div>
    ${rows.map(([a, b]) => `<p><span>${a}</span><span>${b}</span></p>`).join("")}${lines.length ? "<hr>" + lines.map(s => `<div class="ln">${esc(s)}</div>`).join("") : ""}</div>`;
}
function spellCard(S){
  const C = cls(), lv = spellLevel(S, C), knows = player.spells.includes(S.id);
  return `<div class="card"><div class="ct">${pic(spellPic(S), "big")}<div><b>${esc(S.name)}</b><small>${S.realm === "holy" ? "Prayer" : "Spell"} · ${esc(ITEM[bookOf(S)].name)}</small></div></div>
    <p><span>Level</span><span>${lv}</span></p><p><span>Mana</span><span>${S.mana}</span></p><p><span>Failure</span><span>${spellFail(S, player)}%</span></p>
    <hr><div class="ln">${esc(cap(S.desc))}.</div>${knows ? "" : `<div class="ln dim">${player.lvl >= lv ? "You can study it" + (books().has(bookOf(S)) ? "." : " once you carry its book.") : "Learned at level " + lv + "."}</div>`}</div>`;
}
const SPELL_PICS = new Map();
const spellPic = S => memo(SPELL_PICS, S.id, () => spellIcon(S, ELEM_RGB[S.elem] || (S.realm === "holy" ? [1, 0.88, 0.5] : [0.75, 0.6, 1])));
function showTip(html, el){
  const t = $("tip"); t.innerHTML = html; t.hidden = false;
  const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  let x = r.left - w - 10; if (x < 8) x = r.right + 10; if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - w - 8);
  t.style.left = x + "px"; t.style.top = Math.max(8, Math.min(innerHeight - h - 8, r.top - 10)) + "px";
}
const hideTip = () => { $("tip").hidden = true; tipFor = null; };
// Tooltips for everything drawn with data-r: each holds a function that returns its card.
function bindTips(root, cards){
  root.querySelectorAll("[data-r]").forEach(el => { const f = cards[+el.dataset.r]; el.onmouseenter = () => { tipFor = el; showTip(f(), el); }; el.onmouseleave = hideTip; });
}

/* ---------- monster recall: what you have learned about a kind, in words ---------- */
const andList = a => a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const ELEM_WORD = { fire: "fire", cold: "frost", elec: "lightning", acid: "acid", poison: "poison", dark: "darkness", light: "light", arcane: "force" };
const BLOW_WORD = { poison: "poisons", confuse: "confuses", blind: "blinds", paralyze: "paralyses", terrify: "terrifies", fire: "burns", cold: "freezes", elec: "shocks", acid: "corrodes",
  dark: "darkens", light: "dazzles", steal: "steals gold", stealItem: "steals items", drainExp: "drains experience", drainCharges: "drains wands", eatFood: "eats food", eatLight: "eats light" };
function spellWord(S){ const [k, a] = S.split(":");
  return { blink: "blink", tport: "teleport away", teleTo: "pull you to it", heal: "heal itself", haste: "haste itself", blind: "blind you", confuse: "confuse you", scare: "terrify you", slow: "slow you",
    paralyze: "paralyse you", darkness: "make darkness", drainMana: "drain your mana", arrow: "fire missiles", bolt: ELEM_WORD[a] + " bolts", ball: ELEM_WORD[a] + " balls", breath: "breathe " + ELEM_WORD[a],
    summon: "summon " + ({ kin: "its kin", undead: "the undead", any: "monsters" })[a] }[k]; }
function recall(K){
  const l = LORE[K.id] || { seen: 0, kills: 0, deaths: 0, blows: [], spells: [], res: [] }, out = [];
  out.push(K.town ? "Lives in the town." : "Found from " + feet(K.depth) + " ft" + (K.unique ? "; there is only one." : "."));
  if (l.seen >= 2){
    const sp = K.speed; out.push(sp >= 20 ? "Very fast." : sp >= 10 ? "Fast." : sp <= -10 ? "Slow." : sp < 0 ? "A little slow." : "Normal speed.");
    const f = [K.pack && "hunts in packs", K.breed && "multiplies", K.invis && "is invisible", K.passWall && "passes through walls", K.killWall && "tunnels through rock", K.still && "never moves",
      K.erratic && "moves erratically", K.regen && "heals quickly", K.glow && "gives off light", K.cold && "has no body heat", K.mimic && "poses as treasure"].filter(Boolean);
    if (f.length) out.push(cap(andList(f)) + ".");
  }
  const bl = K.blows.map(([dice, verb, fx], i) => l.blows[i] ? verb + (l.blows[i] >= 4 ? " " + dice : "") + (fx ? " (" + (BLOW_WORD[fx] || "drains " + STAT_NAMES[fx.slice(6)].toLowerCase()) + ")" : "") : null).filter(Boolean);
  if (bl.length) out.push("Attacks: " + andList(bl) + ".");
  if (l.spells.length) out.push("Can " + andList(l.spells.map(spellWord)) + ".");
  if (l.res.length) out.push("Resists " + andList(l.res.map(e => ELEM_WORD[e])) + ".");
  if (l.kills) out.push("Slain " + l.kills + (l.kills > 1 ? " times" : " time") + (l.kills >= 3 ? "; about " + Math.round(avgDice(K.hp)) + " hit points" : "") + (player && player.lvl ? "; worth " + Math.round(K.exp * K.depth / player.lvl) + " exp to you now." : "."));
  if (l.deaths) out.push("It has killed " + l.deaths + " of your characters.");
  return out;
}

/* ---------- the HUD ---------- */
const healthWord = m => m.hp >= m.mhp ? "unhurt" : m.hp > m.mhp * 0.6 ? "wounded" : m.hp > m.mhp * 0.25 ? "badly wounded" : "almost dead";
function bar(label, v, max, cls){ return `<div class="meter ${cls}"><span>${label}<b>${v} / ${max}</b></span><i><s style="width:${Math.max(0, Math.min(100, 100 * v / max))}%"></s></i></div>`; }
function drawHud(){
  const p = player, lt = p.eq.light;
  const food = p.food < 0 ? "Starving" : p.food < 1000 ? "Weak" : p.food < 2000 ? "Hungry" : "";
  const T0 = p.t, chips = [[T0.fast, "Fast", "good"], [T0.hero, "Hero", "good"], [T0.berserk, "Berserk", "good"], [T0.bless, "Blessed", "good"], [T0.protEvil, "Warded", "good"],
    [T0.resFire, "Res. heat", "good"], [T0.resCold, "Res. cold", "good"], [T0.seeInv, "True sight", "good"], [T0.poison, "Poisoned", "bad"], [T0.confused, "Confused", "bad"], [T0.blind, "Blind", "bad"], [T0.asleep, "Asleep", "bad"],
    [T0.afraid, "Afraid", "bad"], [T0.paralyzed, "Paralysed", "bad"], [T0.slow, "Slowed", "bad"],
    [p.bonus.burden, "Burdened", "bad"], [food, food, "bad"], [p.recall, "Recall", "good"]].filter(c => c[0]);
  const xpNext = expNeeded(p, p.lvl + 1), xpPrev = p.lvl > 1 ? expNeeded(p, p.lvl) : 0;
  $("status").innerHTML = `<div class="who">${pic(heroImage(), "face")}<div><b>${esc(p.name)}</b><small>Level ${p.lvl} ${esc(titleOf(p))}</small></div></div>
    ${bar("Health", Math.max(0, p.hp), p.mhp, p.hp < p.mhp * 0.3 ? "hp low" : "hp")}${p.mmana ? bar("Mana", p.mana, p.mmana, "mp") : ""}
    <div class="meter xp"><i><s style="width:${100 * (p.exp - xpPrev) / (xpNext - xpPrev)}%"></s></i></div>
    <div class="facts"><span>${depth ? feet(depth) + " ft" : "Town · " + (isDay() ? "day" : "night")}</span><span class="${!lt || lt.fuel < 500 ? "bad" : ""}">${lt ? (lt.fuel !== undefined ? "🔥 " + lt.fuel : "🔥 steady") : "No light"}</span><span class="gold">● ${p.gold}</span></div>
    <div class="chips">${chips.map(([v, s, c]) => `<em class="${c}">${s}${typeof v === "number" && s !== "Burdened" ? " " + v : ""}</em>`).join("")}</div>`;
  // the target
  const tg = target && mons.includes(target) && sensed(target) ? target : null;
  $("target").hidden = !tg;
  if (tg) $("target").innerHTML = `<div class="ct">${pic(creatureImage(tg.K), "big")}<div><b>${esc(cap(tg.K.name))}</b><small>${healthWord(tg)}${tg.sleep > 0 ? ", asleep" : ""}${tg.afraid ? ", afraid" : ""} · ${dist(tg.x, tg.y, player.x, player.y)} away</small></div></div>
    <div class="meter hp"><i><s style="width:${100 * Math.max(0, tg.hp) / tg.mhp}%"></s></i></div><div class="ln">${esc(tg.K.desc)}</div>${recall(tg.K).slice(1, 4).map(s => `<div class="ln dim">${esc(s)}</div>`).join("")}`;
  // messages: this turn's bright, older ones fading
  const fresh = msgs.length, last = log.slice(-6);
  $("log").innerHTML = last.map((s, k) => `<div class="${k >= last.length - fresh ? "new" : ""}" style="opacity:${k >= last.length - fresh ? 1 : 0.35 + 0.1 * k}">${esc(s)}</div>`).join("");
  drawBar();
  $("prompt").hidden = !aiming; if (aiming) $("prompt").textContent = aimText;
}
// The action bar: the four smart keys, then the hotbar 1 to 0.
function drawBar(){
  const cards = [], r = f => (cards.push(f), cards.length - 1), p = player;
  const S = readySpell(), pot = bestPotion(), here = itemsAt(p.x, p.y), t = L.tiles[idx(p.x, p.y)];
  const grab = here.length ? itemPic(here[0].it) : t === T.DOWN || t === T.UP ? `<span class="glyph">${t === T.DOWN ? "▼" : "▲"}</span>` : t === T.SHOP ? `<span class="glyph">⌂</span>` : `<span class="glyph dim">✋</span>`;
  const slot = (key, inner, label, ref, cls = "") => `<div class="slot ${cls}" ${ref !== undefined ? `data-r="${ref}"` : ""}><span class="k">${key}</span>${inner}${label ? `<span class="n">${label}</span>` : ""}</div>`;
  let h = `<div class="acts">`;
  h += slot("A", p.eq.weapon ? itemPic(p.eq.weapon) : `<span class="glyph">✊</span>`, "Attack", p.eq.weapon ? r(() => card(p.eq.weapon, false)) : undefined);
  h += S ? slot("S", pic(spellPic(S)), S.mana + " mp", r(() => spellCard(S)), p.mana < S.mana ? "off" : "") : slot("S", `<span class="glyph dim">✦</span>`, cls().realm ? "Spell" : "", undefined, "off");
  h += slot("D", pot ? itemPic(pot) : `<span class="glyph dim">♥</span>`, pot ? "×" + pot.n : "Drink", pot ? r(() => card(pot)) : undefined, pot ? "" : "off");
  h += slot("W", grab, "Grab", here.length ? r(() => card(here[0].it)) : undefined) + `</div><div class="hot">`;
  for (let k = 0; k < 10; k++){
    const e = p.hot[k], key = String((k + 1) % 10);
    if (!e){ h += slot(key, "", ""); continue; }
    if (e.spell){ const Sp = SPELL[e.spell]; h += slot(key, pic(spellPic(Sp)), Sp.mana + " mp", r(() => spellCard(Sp)), p.mana < Sp.mana ? "off" : ""); continue; }
    const it = p.inv.find(o => o.k === e.k), n = p.inv.filter(o => o.k === e.k).reduce((s, o) => s + o.n, 0);
    h += slot(key, itemPic(it || { k: e.k, n: 1 }), n ? (n > 1 ? "×" + n : "") : "0", it ? r(() => card(it)) : undefined, it ? "" : "off");
  }
  $("bar").innerHTML = h + "</div>";
  bindTips($("bar"), cards);
}

/* ---------- the side panel ---------- */
const TABS = [["char", "Character", "C"], ["pack", "Pack", "I"], ["book", "Book", "B"], ["journal", "Journal", "J"], ["map", "Map", "M"]];
let panelSel = [];   // what the arrow keys move through on this tab: { el index, open() }
function drawPanel(){
  const A = $("panel"); A.hidden = !panelOn; if (!panelOn) return;
  $("tabs").innerHTML = TABS.map(([id, name, k]) => `<b class="${id === tab ? "on" : ""}" data-tab="${id}">${name}<small>${k}</small></b>`).join("");
  $("tabs").querySelectorAll("[data-tab]").forEach(b => b.onclick = () => { tab = b.dataset.tab; psel = 0; refreshUI(); });
  const cards = [], r = f => (cards.push(f), cards.length - 1), sel = [], p = player, body = $("tab");
  const selectable = (open, cardFn) => { sel.push({ open, cardFn }); return `data-s="${sel.length - 1}"`; };
  const slotEl = (it, label, open, extra = "") => it ? `<div class="slot q-${quality(it)}" data-r="${r(() => card(it, extra !== "worn"))}" ${selectable(open, () => card(it, extra !== "worn"))}>${itemPic(it)}${it.n > 1 ? `<span class="n">${it.n}</span>` : ""}</div>`
    : `<div class="slot empty" ${selectable(open, null)}><span class="lab">${label}</span></div>`;
  let h = "";
  if (tab === "char"){
    const R = race(), C = cls(), b = p.bonus, xpNext = expNeeded(p, p.lvl + 1);
    const eq = s => slotEl(p.eq[s], SLOT_NAMES[s], p.eq[s] ? () => itemDialog(p.eq[s], s) : () => wearDialog(s), "worn");
    h += `<div class="who"><div class="lv"><b>${p.lvl}</b>Level</div><div><div class="name">${esc(p.name)}</div><div class="sub">${R.name} ${C.name} · ${esc(titleOf(p))}</div></div></div>
      ${bar("Experience", Math.floor(p.exp), xpNext, "xp")}${bar("Health", Math.max(0, p.hp), p.mhp, "hp")}${p.mmana ? bar("Mana", p.mana, p.mmana, "mp") : ""}
      <div class="doll"><div class="col">${["head", "neck", "body", "cloak"].map(eq).join("")}</div><div class="dmid">${pic(doll(dollLook(p), 64), "hero")}</div><div class="col">${["light", "shield", "hands", "feet"].map(eq).join("")}</div></div>
      <div class="row4">${["weapon", "bow", "ring1", "ring2"].map(eq).join("")}</div>
      <h3>Attributes</h3><div class="stats">${STATS.map(k => `<span>${STAT_NAMES[k]}<b>${p.stats[k]}${p.stats[k] !== p.base[k] ? `<i class="${p.stats[k] > p.base[k] ? "up" : "down"}">${sign(p.stats[k] - p.base[k])}</i>` : ""}</b></span>`).join("")}</div>
      <h3>Combat</h3><div class="stats"><span>Armour<b>${armour()}</b></span><span>Speed<b>${sign(p.speed)}</b></span><span>Weapon<b>${weaponDice()}</b></span><span>To hit / dam<b>${sign(b.hit)} / ${sign(b.dam)}</b></span>
        <span>Infravision<b>${infra() ? infra() * 10 + " ft" : "none"}</b></span><span>Light<b>${lightRadius()}</b></span></div>
      ${b.res.size ? `<div class="ln">Resists ${[...b.res].join(", ")}.</div>` : ""}
      <h3>Skills</h3><div class="stats">${SKILLS.map(k => { const v = skillOf(p, k) + (k === "stealth" ? b.stealth : k === "search" ? b.search : 0); return `<span>${SKILL_NAMES[k]}<b>${k === "stealth" ? stealthWord(v) : skillWord(v)}</b></span>`; }).join("")}</div>
      <div class="ln dim">Deepest ${feet(p.maxDepth)} ft · ${p.kills} kills · ${p.turns} turns · exp penalty +${R.xp + C.xp}%</div>`;
  } else if (tab === "pack"){
    const wt = totalWeight(), capW = capacity();
    h += `<div class="meter ${wt > capW ? "hp low" : "wt"}"><span>Pack ${p.inv.length} / 22<b>${Math.round(wt)} / ${capW} lb</b></span><i><s style="width:${Math.min(100, 100 * wt / capW)}%"></s></i></div><div class="grid">`;
    for (let k = 0; k < 22; k++){ const it = p.inv[k]; h += slotEl(it, "", it ? () => itemDialog(it) : () => {}); }
    h += `</div><div class="ln dim">Gold ${p.gold}. Enter on an item to use, wear, drop or put it on the hotbar.</div>`;
  } else if (tab === "book"){
    const C = cls();
    if (!C.realm) h += `<div class="ln">A ${C.name} knows no magic.</div>`;
    else {
      const have = books(), ready = readySpell();
      h += `<div class="ln dim">Mana ${p.mana} / ${p.mmana}. Enter readies a ${realmWord()} for S, or studies one you can learn.</div>`;
      for (let b = 1; b <= 4; b++){
        const bk = (C.realm === "holy" ? "hbook" : "abook") + b, list = SPELLS.filter(S => S.realm === C.realm && bookOf(S) === bk && spellLevel(S, C) <= 50);
        if (!list.length) continue;
        h += `<h3>${esc(ITEM[bk].name)}${have.has(bk) ? "" : " <small>(not carried)</small>"}</h3>`;
        for (const S of list){
          const knows = p.spells.includes(S.id), can = !knows && learnable(p, have).includes(S);
          h += `<div class="spell ${knows ? "" : "off"} ${ready === S ? "ready" : ""}" data-r="${r(() => spellCard(S))}" ${selectable(() => spellDialog(S), () => spellCard(S))}>${pic(spellPic(S))}<span>${esc(S.name)}${can ? " <em>study</em>" : ""}</span><small>${knows ? S.mana + " mp · " + spellFail(S, p) + "%" : "level " + spellLevel(S, C)}</small></div>`;
        }
      }
    }
  } else if (tab === "journal"){
    h += `<h3>Messages</h3><div class="msgs">${log.slice(-80).reverse().map(s => `<div>${esc(s)}</div>`).join("")}</div>`;
    const met = MONSTERS.filter(K => LORE[K.id] && LORE[K.id].seen).sort((a, b) => a.depth - b.depth);
    h += `<h3>Creatures you know (${met.length} of ${MONSTERS.length})</h3>${met.map(K => `<div class="beast">${pic(creatureImage(K))}<div><b class="${K.unique ? "gold" : ""}">${esc(cap(K.name))}</b><div class="ln">${esc(K.desc)}</div>${recall(K).map(s => `<div class="ln dim">${esc(s)}</div>`).join("")}</div></div>`).join("")}`;
    const known = ITEMS.filter(K => K.flavoured && p.know.known[K.id]);
    h += `<h3>Kinds you have identified (${known.length})</h3><div class="ln">${known.map(K => esc(K.name)).join(", ") || "None yet."}</div>`;
  } else if (tab === "map"){
    h += `<canvas id="bigmap"></canvas><div class="ln dim">${depth ? feet(depth) + " ft" : "Lanternhollow"}. White: stairs; blue: items; red: monsters you sense.</div>`;
  }
  body.innerHTML = h; bindTips(body, cards);
  panelSel = sel; psel = Math.min(psel, Math.max(0, sel.length - 1));
  body.querySelectorAll("[data-s]").forEach(el => el.onclick = () => { psel = +el.dataset.s; sel[psel].open(); });
  if (panelFocus && sel.length){ const el = body.querySelector(`[data-s="${psel}"]`); if (el){ el.classList.add("sel"); el.scrollIntoView({ block: "nearest" }); if (sel[psel].cardFn) showTip(sel[psel].cardFn(), el); else hideTip(); } }
  A.classList.toggle("focus", panelFocus);
  if (tab === "map") drawBigMap();
}
function drawBigMap(){ const c = $("bigmap"); if (!c || !L) return; const w = $("tab").clientWidth - 4, s = Math.max(1, Math.floor(w / L.w)); c.width = L.w * s; c.height = L.h * s; drawMinimap(c, s, false); }
function openTab(id){
  if (!panelOn){ panelOn = true; store.set("panel", "1"); }
  if (panelFocus && tab === id){ panelFocus = false; hideTip(); }
  else { if (tab !== id) psel = 0; tab = id; panelFocus = id !== "map"; }
  refreshUI();
}
function togglePanel(){ panelOn = !panelOn; panelFocus = false; store.set("panel", panelOn ? "1" : "0"); hideTip(); refreshUI(); }
function panelKey(e){
  const k = e.key, cols = tab === "pack" ? 6 : tab === "char" ? 1 : 1, n = panelSel.length;
  if (k === "Escape"){ panelFocus = false; hideTip(); refreshUI(); return true; }
  if (tab === "journal" && (k === "ArrowUp" || k === "ArrowDown")){ $("tab").scrollBy(0, k === "ArrowUp" ? -60 : 60); return true; }
  if (!n) return false;
  const mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols }[k];
  if (mv){ psel = Math.max(0, Math.min(n - 1, psel + mv)); refreshUI(); return true; }
  if (k === "Enter" || k === " "){ panelSel[psel].open(); return true; }
  return false;
}

/* ---------- dialogs ---------- */
// d: { title, note, cols: [[row]], c, at, onBack, side }. A row: { label, icon, right, item, spell, select, adjust, off }.
function openDialog(d){ d.c = d.c || 0; d.at = d.at || d.cols.map(() => 0); d.at = d.at.map((a, i) => Math.min(a, Math.max(0, d.cols[i].length - 1))); dlg = d; hideTip(); drawDialog(); }
function closeDialog(){ dlg = null; $("dlg").hidden = true; hideTip(); refreshUI(); }
function drawDialog(){
  const d = dlg, el = $("dlg"); if (!d){ el.hidden = true; return; }
  el.hidden = false;
  const sel = d.cols[d.c][d.at[d.c]];
  el.innerHTML = `<div class="box ${d.wide ? "wide" : ""}"><h2>${esc(d.title)}</h2>${d.head || ""}<div class="cols">${d.cols.map((rows, ci) => `<div class="list">${d.heads ? `<h3>${esc(d.heads[ci])}</h3>` : ""}${rows.map((r, ri) =>
    `<div class="row ${ci === d.c && ri === d.at[ci] ? "sel" : ""} ${r.off ? "off" : ""} ${r.item ? "q-" + quality(r.item) : ""}" data-c="${ci}" data-i="${ri}">${r.item ? itemPic(r.item) : r.spell ? pic(spellPic(r.spell)) : r.icon || ""}<span>${r.html || esc(r.label)}</span>${r.right !== undefined ? `<small>${esc(r.right)}</small>` : ""}</div>`).join("") || `<div class="row off"><span>${esc(d.empty || "Nothing.")}</span></div>`}</div>`).join("")}
    ${d.side !== false ? `<div class="side">${sel && sel.item ? card(sel.item) : sel && sel.spell ? spellCard(sel.spell) : d.sideHtml || ""}</div>` : ""}</div>
    <div class="note">${esc(d.note || "")}${d.note ? " · " : ""}↑↓ choose${d.cols.length > 1 ? " · ←→ switch" : ""} · Enter select · Esc back</div></div>`;
  el.querySelectorAll(".row[data-i]").forEach(r => r.onclick = () => { d.c = +r.dataset.c; d.at[d.c] = +r.dataset.i; const row = d.cols[d.c][d.at[d.c]]; if (row && row.select && !row.off) row.select(); else drawDialog(); });
  const s = el.querySelector(".row.sel"); if (s) s.scrollIntoView({ block: "nearest" });
}
function dialogKey(e){
  const d = dlg, rows = d.cols[d.c], k = e.key;
  if (k === "Escape"){ d.onBack ? d.onBack() : closeDialog(); return; }
  if (k === "ArrowUp" || k === "ArrowDown"){ if (rows.length) d.at[d.c] = (d.at[d.c] + (k === "ArrowUp" ? rows.length - 1 : 1)) % rows.length; return drawDialog(); }
  if (k === "ArrowLeft" || k === "ArrowRight"){
    const row = rows[d.at[d.c]];
    if (row && row.adjust){ row.adjust(k === "ArrowLeft" ? -1 : 1); return dlg === d && drawDialog(); }
    if (d.cols.length > 1){ d.c = (d.c + 1) % d.cols.length; return drawDialog(); }
    return;
  }
  if (k === "Enter" || k === " "){ const row = rows[d.at[d.c]]; if (row && row.select && !row.off) row.select(); }
}
function chooseItem(title, filter, fn, none = "You have nothing suitable."){
  const rows = player.inv.filter(it => filter(it)).map(it => ({ item: it, label: cap(nameOf(it)), select: () => { closeDialog(); fn(it); } }));
  for (const sl of SLOTS){ const it = player.eq[sl]; if (it && filter(it)) rows.push({ item: it, label: cap(nameOf(it)), right: SLOT_NAMES[sl], select: () => { closeDialog(); fn(it); } }); }
  if (!rows.length){ msgs = []; say(none); refreshUI(); return; }
  openDialog({ title, cols: [rows] });
}
const VERB_LABEL = { eat: "Eat", quaff: "Drink", read: "Read", fuel: "Fill lantern", use: "Use", fire: "Fire", wield: "Wear", throw: "Throw", drop: "Drop" };
function itemDialog(it, slot){
  const K = ITEM[it.k], rows = [], go = fn => () => { closeDialog(); fn(); };
  if (slot) rows.push({ label: "Take off", select: go(() => act(() => takeOff(slot))) });
  else for (const [how, label] of verbsFor(it)){
    if (how === "inspect") continue;
    rows.push({ label, select: go(() => how === "throw" ? throwItem(it) : how === "fire" ? fireAmmo(it) : act(() => useItem(it, how))) });
  }
  const hk = player.hot.findIndex(e => e && e.k === it.k), usable = ["potion", "scroll", "food", "mushroom", "wand", "staff", "rod", "flask", "dart", "ammo"].includes(K.cat);
  if (usable && hk < 0 && !slot){ const free = player.hot.indexOf(null); if (free >= 0) rows.push({ label: "Put on hotbar (" + ((free + 1) % 10) + ")", select: () => { player.hot[free] = { k: it.k }; closeDialog(); } }); }
  if (hk >= 0) rows.push({ label: "Take off the hotbar", select: () => { player.hot[hk] = null; closeDialog(); } });
  rows.push({ label: "Back", select: closeDialog });
  openDialog({ title: cap(nameOf(it)), cols: [rows], sideHtml: card(it, !slot) });
}
function wearDialog(slot){   // an empty equipment slot: what in the pack could go there?
  const fits = it => { const s = ITEM[it.k].slot; return s && (s === slot || (s === "ring" && slot.startsWith("ring"))); };
  chooseItem("Wear on " + SLOT_NAMES[slot].toLowerCase(), it => player.inv.includes(it) && fits(it), it => act(() => wear(it)), "You have nothing to wear there.");
}
function spellDialog(S){
  const knows = player.spells.includes(S.id), can = !knows && learnable(player, books()).includes(S), rows = [];
  if (can) rows.push({ label: cls().realm === "holy" ? "Pray to be granted a prayer" : "Study this spell", select: () => { closeDialog(); study(S); } });
  if (knows){
    rows.push({ label: "Cast now", select: () => { closeDialog(); castSpell(S, true); } });
    rows.push({ label: "Ready it for S", select: () => { player.ready = S.id; closeDialog(); } });
    const hk = player.hot.findIndex(e => e && e.spell === S.id), free = player.hot.indexOf(null);
    if (hk >= 0) rows.push({ label: "Take off the hotbar", select: () => { player.hot[hk] = null; closeDialog(); } });
    else if (free >= 0) rows.push({ label: "Put on hotbar (" + ((free + 1) % 10) + ")", select: () => { player.hot[free] = { spell: S.id }; closeDialog(); } });
  }
  rows.push({ label: "Back", select: closeDialog });
  openDialog({ title: S.name, cols: [rows], sideHtml: spellCard(S) });
}
function castDialog(){   // Classic keys: m / p
  const known = SPELLS.filter(S => player.spells.includes(S.id));
  if (!known.length){ msgs = []; say("You have not learned any " + realmWord() + "s yet."); return refreshUI(); }
  openDialog({ title: (cls().realm === "holy" ? "Pray" : "Cast") + " · mana " + player.mana + "/" + player.mmana, cols: [known.map(S => ({ spell: S, label: S.name, right: S.mana + " mp " + spellFail(S, player) + "%", select: () => { closeDialog(); castSpell(S, false); } }))] });
}
function studyDialog(can){ openDialog({ title: "Study which spell?", cols: [can.map(S => ({ spell: S, label: S.name, right: "level " + spellLevel(S, cls()), select: () => { closeDialog(); study(S); } }))] }); }

/* ---------- shops ---------- */
let shopNow = -1;
function openShop(i){ const S = SHOPS[i]; msgs = []; say("You enter the " + S.name + ". " + S.keeper + ": \"" + rng.pick(S.hello) + "\""); shopNow = i; shopDialog(i, 0, [0, 0]); }
function shopDialog(i, c, at){
  const S = SHOPS[i], stock = shops[i].stock, cha = player.stats.cha;
  const buyRows = stock.map(it => ({ item: it, html: esc(cap(shopName(it))), right: buyPrice(it, S, cha) + " g", off: buyPrice(it, S, cha) > player.gold, select: () => { buy(i, it); shopDialog(i, 0, dlg.at); } }));
  const sellRows = player.inv.map(it => ({ item: it, label: cap(nameOf(it)), right: !shopBuys(S, it) ? "–" : it.id && kindKnown(ITEM[it.k], player.know) ? sellPrice(it, S, cha) + " g" : "? g", select: () => { sell(i, it); shopDialog(i, 1, dlg.at); } }));
  openDialog({ title: S.name + " · " + S.keeper, wide: true, heads: ["Buy", "Sell"], cols: [buyRows, sellRows], c, at, empty: "Nothing here.",
    head: `<div class="shopline"><span class="gold">● ${player.gold} gold</span><span>${esc(msgs.slice(-1)[0] || "")}</span></div>`, note: "Prices are for one · selling tells you what a thing is" });
}

/* ---------- the menu and help ---------- */
const KEYSETS = { modern: "Modern (arrows + A S D W)", original: "Classic (Moria letters)", roguelike: "Roguelike (hjkl)" };
function menuDialog(){
  const rows = [
    { label: "Resume", select: closeDialog },
    { label: state === "play" ? "New character" : "Start", select: () => { closeDialog(); startCreate(); } },
    { label: "Keys", right: KEYSETS[keySet] + "  ‹ ›", adjust: d => { const ks = Object.keys(KEYSETS); keySet = ks[(ks.indexOf(keySet) + ks.length + d) % ks.length]; store.set("keymap", keySet); menuDialog(); }, select: () => rows[2].adjust(1) },
    { label: "Side panel", right: (panelOn ? "Shown" : "Hidden") + " (P)", select: () => { togglePanel(); menuDialog(); } },
    { label: "Help", select: helpDialog },
    { label: "Display settings", select: () => { location.href = "settings.html"; } },
    { label: "Back to cartridges", select: () => { location.href = "./"; } }
  ];
  openDialog({ title: state === "play" ? "Paused" : "Menu", cols: [rows], side: false, note: "This early version does not save", at: dlg && dlg.title.match(/Paused|Menu/) ? dlg.at : [0] });
}
function helpDialog(){
  const modern = [["Arrow keys", "move; into a monster attacks, into a door opens"], ["Two arrows", "move diagonally (or numpad, Home, End, PgUp, PgDn)"], ["Shift + arrow", "run"],
    ["A", "attack the target: melee, or fire / throw if it is further"], ["S", "cast the readied spell"], ["D", "drink the best-fitting healing potion"], ["W", "grab: pick up, stairs, shop"],
    ["Q / Shift+Q", "ready the next / previous spell"], ["E", "eat"], ["R", "rest"], ["F", "refill your lantern, or a fresh torch"], ["Tab / Shift+Tab", "next / previous target"],
    ["Space", "wait a turn"], ["1 to 0", "use a hotbar slot"], ["I C B J M", "Pack, Character, Book, Journal, Map"], ["P", "show or hide the panel"], ["L", "look"], ["Esc", "close, or the menu"]];
  const ro = keySet === "roguelike";
  const classic = [[ro ? "hjklyubn" : "Arrows / numpad", "move (Shift runs)"], ["g or ,", "pick up"], ["i  e", "pack, equipment"], ["w  " + (ro ? "T" : "t") + "  d", "wear, take off, drop"],
    ["E  q  r", "eat, drink, read"], ["a  " + (ro ? "Z" : "u") + "  z", "aim a wand, use a staff, zap a rod"], ["F", "fill lantern"], ["f  v  I", "fire, throw, inspect"], ["m or p  S", "cast or pray, study"],
    [">  <", "stairs"], ["R  " + (ro ? "." : ". or 5"), "rest, wait"], [(ro ? "x" : "l") + "  C", "look, character"], ["Tab", "next target"], ["Esc", "menu"]];
  openDialog({ title: "Keys · " + KEYSETS[keySet], cols: [(keySet === "modern" ? modern : classic).map(([a, b]) => ({ html: `<kbd>${esc(a)}</kbd> ${esc(b)}` }))], side: false, onBack: closeDialog, note: "Change the key set in the menu" });
}

/* ---------- title, a new character, and the tombstone ---------- */
function drawScreen(){
  const el = $("screen");
  if (state === "play" || (state === "dead" && stateT < 1)){ el.hidden = true; return; }
  el.hidden = false;
  if (state === "title"){
    el.innerHTML = `<div class="titlecard"><h1>Torchlight<span>Dungeons</span></h1><p class="dim">A dungeon crawl after Moria</p>
      <p class="blink">Press Enter to begin</p><p class="dim">Early version: no saves yet. Esc opens the menu.</p>
      ${scores.list.length ? `<h3>Hall of fame</h3>${scores.list.map((s, k) => `<div class="fame ${k ? "" : "best"}"><b>${s.score}</b> ${esc(s.name || "")} the ${esc(s.race || "")} ${esc(s.cls || "Fighter")}, level ${s.lvl}, ${s.depth} ft, ${esc(s.killer)}</div>`).join("")}` : ""}</div>`;
  } else if (state === "create") drawCreate();
  else if (state === "dead"){
    const T0 = tomb;
    el.innerHTML = `<div class="titlecard tomb"><h1 class="rip">R.I.P.</h1><b>${esc(T0.name)}</b><div>the ${esc(T0.race)} ${esc(T0.cls)}, level ${T0.lvl}</div><div>killed by ${esc(T0.killer)}</div><div>${T0.at === "the town" ? "in the town" : "at " + T0.at}</div>
      <h3>Score ${T0.score}${T0.best ? " · best!" : ""}</h3><p class="blink">Press Enter for the title</p></div>`;
  }
}
function drawCreate(){
  const steps = ["People", "Calling", "Strengths", "Name"], rows = crRows(), p = crPreview(), R = RACE[p.race], C = CLASS[p.cls];
  const kit = { sellsword: "shortsword", arcanist: "dagger", lampwarden: "mace", delver: "dagger", wayfinder: "shortsword", oathknight: "mace" }[p.cls];
  const show = cr.step === 0 ? RACES[cr.at] : cr.step === 1 ? CLASSES[cr.at] : null;
  const look = { race: cr.step === 0 ? RACES[cr.at].id : p.race, eq: { weapon: cr.step >= 1 ? { sellsword: "shortsword", arcanist: "dagger", lampwarden: "mace", delver: "dagger", wayfinder: "shortsword", oathknight: "mace" }[cr.step === 1 ? CLASSES[cr.at].id : p.cls] : kit, body: "jerkin", light: "torch" } };
  const mods = o => STATS.filter(k => o[k]).map(k => STAT_NAMES[k] + " " + sign(o[k])).join(", ") || "no changes";
  let info = "";
  if (cr.step === 0){ const H = show; info = `<h2>${H.name}</h2><p>${esc(H.desc)}</p><p class="dim">Stats: ${mods(H.stats)}<br>Infravision: ${H.infra ? H.infra * 10 + " ft" : "none"} · hit die ${H.hd} · experience +${H.xp}%</p>`; }
  else if (cr.step === 1){ const K = show, fs = firstSpell(K); info = `<h2>${K.name}</h2><p>${esc(K.desc)}</p><p class="dim">Stats: ${mods(K.stats)}<br>Hit die ${K.hd} · experience +${K.xp}%<br>${fs ? (K.realm === "holy" ? "Holy prayers" : "Arcane spells") + (spellLevel(fs, K) > 1 ? " from level " + spellLevel(fs, K) : "") + ", starting with " + fs.name + "." : "No magic."}<br>Titles: ${K.titles.slice(0, 3).join(", ")} …</p>`; }
  else info = `<h2>${esc(cr.name)}</h2><p class="dim">${R.name} ${C.name}</p><div class="stats">${STATS.map(k => `<span>${STAT_NAMES[k]}<b>${p.stats[k]} <i class="dim">(${sign(statMod(p.stats[k]))})</i></b></span>`).join("")}</div>
    <p>Hit points ${firstHp(p)}${C.realm ? " · mana " + maxMana(p) : ""}</p><div class="stats">${SKILLS.map(k => { const v = skillOf(p, k); return `<span>${SKILL_NAMES[k]}<b>${k === "stealth" ? stealthWord(v) : skillWord(v)}</b></span>`; }).join("")}</div>
    ${cr.step === 2 && cr.mode === "buy" ? `<p class="gold">Points left: ${BUY_POINTS - buySpent(cr.buy)} of ${BUY_POINTS}</p>` : ""}${cr.step === 3 ? `<p class="dim">Type to change the name.</p>` : ""}`;
  $("screen").innerHTML = `<div class="create"><div class="steps">${steps.map((s, i) => `<b class="${i === cr.step ? "on" : i < cr.step ? "done" : ""}">${i + 1} ${s}</b>`).join("")}</div>
    <div class="cbody"><div class="list">${rows.map((r, i) => `<div class="row ${i === cr.at ? "sel" : ""}" data-i="${i}"><span>${esc(r.label)}</span>${cr.step === 2 && cr.mode === "buy" && i < 6 ? `<small>‹ ${cr.buy[STATS[i]]} ›</small>` : ""}</div>`).join("")}
      ${cr.step === 3 ? `<div class="namebox">${esc(cr.name)}<span class="caret">▌</span></div>` : ""}</div>
    <div class="preview">${pic(doll(look, 64), "hero")}</div><div class="cinfo">${info}</div></div>
    <div class="note">↑↓ choose · Enter select · ${cr.step === 2 && cr.mode === "buy" ? "←→ change · " : ""}Esc back</div></div>`;
  $("screen").querySelectorAll(".row[data-i]").forEach(r => r.onclick = () => { cr.at = +r.dataset.i; crChoose(); refreshUI(); });
}

/* ---------- each frame ---------- */
let miniT = 0;
function drawUI(dt){
  miniT -= dt;
  if (uiDirty){
    uiDirty = false;
    drawScreen();
    const playing = player && player.hot && (state === "play" || state === "dead");
    $("ov").hidden = !playing;
    if (playing){ drawHud(); drawPanel(); } else $("panel").hidden = true;
    if (dlg) drawDialog();
    if (tipFor && !document.body.contains(tipFor)) hideTip();
  }
  if (miniT <= 0 && L && player && player.hot && state !== "title"){ miniT = 0.2; drawMinimap($("mini"), 3, true); if (tab === "map" && panelOn) drawBigMap(); }
}

renderLayout(); titleScene();
onResize(stage, renderLayout);
startLoop(tick);
