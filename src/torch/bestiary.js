/* ---------- Torchlight Dungeons: the bestiary (phase 7) ---------- */
// Original content, written for this game: no names, numbers or descriptions come from Moria, Umoria or Tolkien.
// About 40 families, each in tiers by depth. A family sets the body plan, flags, attacks and how tough it is for its
// depth; each kind's hit dice, armour, damage and experience come from its depth by the formulas below, unless the
// entry gives its own (the first fifteen kinds keep their phase 1 numbers).
//
// Blow effects (the third part of a blow): poison, confuse, blind, paralyze, terrify, fire, cold, elec, acid, dark,
//   steal (gold), stealItem, drainExp, drain:<stat>, drainCharges, eatFood, eatLight.
// Spells { freq: one turn in freq when it can see you, list }: blink, tport, teleTo, heal, haste, blind, confuse,
//   scare, slow, paralyze, darkness, drainMana, arrow, bolt:<elem>, ball:<elem>, breath:<elem> (a cone), summon:kin,
//   summon:undead, summon:any.
// Other flags: breed (multiplies), invis, passWall, killWall (tunnels), mimic (the item category it poses as),
//   unique, boss, size (drawn larger), regen, kit (what a humanoid wears), shape (body plan in sprites.js).
const monHp = (d, k = 1) => { const avg = (4 + d * 3.2 + d * d * 0.05) * k; return Math.max(1, Math.round(avg / 4.5)) + "d8"; };
const monAc = (d, k = 1) => Math.round((2 + d * 1.25) * k);
const monExp = (d, k = 1) => Math.max(1, Math.round((0.5 + d * 0.4 + d * d * 0.55) * k));
function monBlow(d, k, n, die){   // dice for one of n blows, so the total per turn grows with depth
  const per = (1.6 + d * 0.5 + d * d * 0.004) * k / n, s = die || (per < 3 ? 4 : per < 6 ? 6 : per < 12 ? 8 : 10);
  return Math.max(1, Math.round(per * 2 / (s + 1))) + "d" + s;
}
// Combat numbers shared by the game and the balance check (tests/balance.js).
const hitChance = (skill, ac, extra = 0) => Math.max(5, Math.min(95, skill + 20 - ac * 0.8 + extra));   // the player's blows and shots
const blowChance = (depth, ac) => Math.max(15, Math.min(95, 60 + 2 * depth - ac));                      // a monster's blow lands
const boltDice = d => (1 + Math.floor(d / 4)) + "d8";                                                    // monster bolts; arrows 0.6x, balls 1.4x
const breathDmg = (hp, d) => Math.max(1, Math.min(Math.floor(hp / 5), 15 + Math.floor(d * 1.5)));                      // breath: a share of its health, capped by depth
const FAMILIES = {};
function family(fam, glyph, base, list){
  FAMILIES[fam] = [];
  for (const [id, name, depth, rgb, desc, o = {}] of list){
    const B = { ...base, ...o }, d = depth, blows = B.blowSet || base.blows;
    const K = { id, name, glyph, rgb, depth, desc, fam, rarity: B.r || 1, speed: B.speed || 0, shape: B.shape };
    for (const f of ["animal", "undead", "evil", "cold", "res", "pack", "erratic", "still", "flee", "glow", "drop", "dropGood", "breed", "invis", "passWall", "killWall",
      "mimic", "unique", "boss", "size", "regen", "kit", "spells"]) if (B[f] !== undefined) K[f] = B[f];
    K.hp = o.hp || monHp(d, B.hpK || 1);
    K.ac = o.ac !== undefined ? o.ac : monAc(d, B.acK || 1);
    K.exp = o.exp !== undefined ? o.exp : monExp(d, (B.expK || 1) * (B.unique ? 2.5 : 1));
    K.blows = o.blows || blows.map(b => { const [verb, fx] = Array.isArray(b) ? b : [b]; return fx ? [monBlow(d, B.dmgK || 1, blows.length, B.die), verb, fx] : [monBlow(d, B.dmgK || 1, blows.length, B.die), verb]; });
    MONSTERS.push(K); FAMILIES[fam].push(K);
  }
}
const C3 = (r, g, b) => [r, g, b];

// ---- small beasts
family("rodent", "r", { shape: "rodent", animal: true, hpK: 0.7, acK: 0.6, dmgK: 0.8, blows: ["bites"], erratic: 0.25 }, [
  ["rat", "cave rat", 1, C3(0.75, 0.55, 0.4), "A mangy rat with yellow teeth, bolder in the dark.", { hp: "2d3", ac: 2, exp: 1, blows: [["1d3", "bites"]], erratic: 0.3 }],
  ["gutterrat", "gutter rat", 2, C3(0.55, 0.5, 0.45), "Where there is one, there will soon be twenty.", { breed: 0.1, r: 2 }],
  ["vole", "tunnel vole", 3, C3(0.6, 0.45, 0.3), "A blind, burrowing thing with oversized front teeth.", { killWall: true, r: 2 }],
  ["bristlerat", "bristle rat", 6, C3(0.8, 0.75, 0.6), "Its back is a mat of needle-sharp quills.", { blowSet: ["bites", "pricks"] }],
  ["plaguerat", "plague rat", 10, C3(0.6, 0.65, 0.35), "Patchy fur, weeping eyes, and a bite that festers.", { blowSet: [["bites", "poison"]], breed: 0.07, r: 2 }],
  ["molerat", "giant mole-rat", 15, C3(0.85, 0.65, 0.6), "Pink, wrinkled and the size of a pony, it chews through rock.", { killWall: true, hpK: 1.2, blowSet: ["bites", "claws"] }]
]);
family("bat", "b", { shape: "bat", animal: true, speed: 10, erratic: 0.5, hpK: 0.5, acK: 0.8, dmgK: 0.7, blows: ["bites"] }, [
  ["cavebat", "cave bat", 2, C3(0.5, 0.42, 0.38), "It flits at your light, then away, then back again.", { pack: [2, 4] }],
  ["screecher", "screech bat", 6, C3(0.65, 0.55, 0.5), "A shriek like tearing tin comes before it.", { blowSet: [["bites", "confuse"]] }],
  ["bloodbat", "blood bat", 13, C3(0.7, 0.2, 0.25), "A sleek red bat that drinks from what it bites.", { blowSet: [["bites", "drainExp"]], r: 2 }],
  ["stormbat", "storm bat", 22, C3(0.55, 0.65, 1.0), "Its wings crackle and leave a smell of rain.", { blowSet: [["bites", "elec"]], glow: { r: 2, rgb: [0.4, 0.5, 1.0] } }],
  ["duskwing", "duskwing", 32, C3(0.3, 0.25, 0.4), "A bat as wide as a door, dark against the dark.", { hpK: 1.4, blowSet: ["bites", ["claws", "blind"]], invis: true, r: 3 }]
]);
family("insect", "I", { shape: "insect", animal: true, cold: true, erratic: 0.5, speed: 10, hpK: 0.5, dmgK: 0.6, blows: ["stings"] }, [
  ["moth", "glimmer moth", 1, C3(0.75, 1.0, 0.55), "Its wings shed a pale green light as it flutters about.", { hp: "1d4", ac: 3, exp: 2, r: 2, blows: [["1d2", "brushes"]], erratic: 0.6, glow: { r: 3, rgb: [0.45, 0.8, 0.35] } }],
  ["gnats", "gnat cloud", 1, C3(0.6, 0.6, 0.5), "A buzzing smudge in the air that gets into your eyes.", { breed: 0.12, blowSet: [["bites", "blind"]], hpK: 0.3 }],
  ["lanternfly", "lantern fly", 5, C3(1.0, 0.85, 0.4), "A fat fly whose tail glows like a coal.", { glow: { r: 2, rgb: [1.0, 0.75, 0.3] }, blowSet: [["bites", "fire"]] }],
  ["midges", "blood midges", 9, C3(0.8, 0.3, 0.3), "Tiny red flies in their hundreds, and all of them hungry.", { breed: 0.08, blowSet: ["bites"], r: 2 }],
  ["wickmoth", "wick moth", 14, C3(0.7, 0.65, 0.55), "Grey dusty wings that smother any flame they touch.", { blowSet: [["smothers", "eatLight"]] }],
  ["locusts", "locust swarm", 14, C3(0.6, 0.6, 0.35), "A chittering cloud that strips everything it lands on.", { breed: 0.06, blowSet: [["bites", "eatFood"]], hpK: 0.4 }],
  ["thunderwasp", "thunder wasp", 24, C3(0.95, 0.9, 0.4), "A wasp the length of your arm, humming like a storm.", { blowSet: [["stings", "elec"], ["stings", "poison"]], pack: [2, 4] }]
]);
family("spider", "S", { shape: "spider", animal: true, cold: true, speed: 10, hpK: 0.7, dmgK: 0.9, blows: [["bites", "poison"]] }, [
  ["spider", "cave spider", 4, C3(0.6, 0.55, 0.7), "Quick black spiders that pour out of cracks in swarms.", { hp: "1d6", ac: 4, exp: 2, r: 2, blows: [["1d4", "bites"]], pack: [3, 5] }],
  ["wolfspider", "wolf spider", 8, C3(0.55, 0.45, 0.3), "It does not spin. It runs you down.", { speed: 20, blowSet: ["bites", "bites"] }],
  ["weaver", "web weaver", 12, C3(0.8, 0.8, 0.85), "Pale and patient, with silk that sticks like tar.", { blowSet: [["bites", "paralyze"]], spells: { freq: 6, list: ["slow"] } }],
  ["phasespider", "phase spider", 20, C3(0.6, 0.5, 1.0), "It blinks out of the world and back beside you.", { spells: { freq: 3, list: ["blink", "teleTo"] } }],
  ["gloomspider", "gloom spider", 30, C3(0.3, 0.28, 0.35), "You see the web, and the bites, but never the spider.", { invis: true, pack: [1, 3], hpK: 0.5, r: 2 }],
  ["broodmother", "brood mother", 40, C3(0.45, 0.3, 0.5), "Bloated and enormous, with young that crawl from her back.", { size: 1.4, hpK: 2, blowSet: [["bites", "poison"], ["bites", "poison"], "stings"], spells: { freq: 4, list: ["summon:kin"] }, r: 3 }]
]);
family("beetle", "K", { shape: "beetle", animal: true, cold: true, acK: 1.4, dmgK: 0.9, blows: ["bites"] }, [
  ["ants", "tunnel ants", 2, C3(0.6, 0.35, 0.25), "A marching column of red ants, each the size of a thumb.", { shape: "beetle", pack: [4, 7], hpK: 0.4 }],
  ["beetle", "ember beetle", 4, C3(1.0, 0.45, 0.2), "Its shell glows like a coal from the fire in its belly.", { res: ["fire"], hp: "5d6", ac: 12, exp: 10, r: 2, blows: [["2d4", "burns", "fire"]], glow: { r: 2, rgb: [1.0, 0.35, 0.1] } }],
  ["fireants", "fire ants", 8, C3(1.0, 0.4, 0.25), "Tiny, bright red, and they bite like sparks.", { pack: [3, 6], hpK: 0.4, dmgK: 0.45, res: ["fire"], blowSet: [["bites", "fire"]] }],
  ["acidbeetle", "acid beetle", 9, C3(0.6, 0.85, 0.3), "It spits something that smokes on the stone.", { res: ["acid"], blowSet: [["spits", "acid"]], spells: { freq: 6, list: ["bolt:acid"] } }],
  ["centipede", "iron centipede", 13, C3(0.55, 0.55, 0.6), "Plated like a knight, and a hundred legs long.", { shape: "centipede", blowSet: ["bites", "stings"], speed: 10 }],
  ["borebeetle", "bore beetle", 18, C3(0.6, 0.45, 0.35), "Jaws like mattocks; walls are just slow air to it.", { killWall: true, hpK: 1.3 }],
  ["lampbeetle", "lamp beetle", 26, C3(1.0, 0.95, 0.6), "A slow beetle that blazes like a lantern.", { glow: { r: 5, rgb: [1.0, 0.9, 0.6] }, spells: { freq: 5, list: ["blind"] }, speed: -5 }],
  ["stagking", "stag king", 36, C3(0.5, 0.35, 0.25), "Its horns could lift a cart. They do lift you.", { size: 1.3, hpK: 1.6, blowSet: ["gores", "gores", "bites"] }]
]);
family("worm", "w", { shape: "worm", animal: true, cold: true, speed: -10, hpK: 0.9, dmgK: 0.7, blows: ["bites"] }, [
  ["slug", "mire slug", 1, C3(0.45, 0.75, 0.35), "A fat slug that leaves a glistening trail across the stone.", { hp: "3d4", ac: 1, exp: 1, blows: [["1d2", "slimes"]] }],
  ["grubs", "grub mass", 2, C3(0.9, 0.85, 0.7), "A writhing heap of pale grubs that grows as you watch.", { breed: 0.12, hpK: 0.4, r: 2 }],
  ["rotworm", "rot worm", 5, C3(0.55, 0.45, 0.3), "Brown, soft and full of sickness.", { breed: 0.08, blowSet: [["bites", "poison"]] }],
  ["frostworm", "frost worm", 12, C3(0.75, 0.9, 1.0), "Rime gathers on the floor where it passes.", { res: ["cold"], blowSet: [["bites", "cold"]], breed: 0.05 }],
  ["rockborer", "rock borer", 17, C3(0.55, 0.5, 0.45), "A grey worm that eats stone and leaves tunnels behind.", { killWall: true, speed: 0, hpK: 1.4 }],
  ["thunderworm", "thunderworm", 34, C3(0.6, 0.55, 0.8), "The ground hums before it bursts through.", { size: 1.5, killWall: true, speed: 0, hpK: 2.2, blowSet: [["crushes", "elec"], "bites"], r: 3 }]
]);
family("mould", "m", { shape: "mould", still: true, cold: true, res: ["poison"], hpK: 1.2, dmgK: 1.1, expK: 0.8, blows: ["stings"] }, [
  ["mold", "weeping mold", 2, C3(0.55, 0.8, 0.7), "A damp grey-green growth that oozes when touched.", { hp: "6d6", ac: 1, exp: 4, r: 2, blows: [["1d6", "stings"]] }],
  ["puffball", "puffball", 4, C3(0.85, 0.8, 0.6), "It bursts in a cloud of dizzying spores.", { blowSet: [["releases spores at", "confuse"]] }],
  ["embermould", "ember mould", 8, C3(1.0, 0.5, 0.25), "Orange and warm, it smoulders without burning away.", { res: ["fire", "poison"], blowSet: [["burns", "fire"]], glow: { r: 2, rgb: [1.0, 0.45, 0.15] } }],
  ["frostmould", "frost mould", 12, C3(0.7, 0.85, 1.0), "Frozen into a white crust that cracks as it reaches.", { res: ["cold", "poison"], blowSet: [["freezes", "cold"]] }],
  ["memorymoss", "memory moss", 18, C3(0.6, 0.5, 0.8), "Soft violet moss that steals what it touches from your mind.", { blowSet: [["touches", "drainExp"]], spells: { freq: 5, list: ["confuse"] } }],
  ["gildmould", "gilded mould", 28, C3(1.0, 0.85, 0.35), "A crust of gold leaf that is, alas, alive.", { blowSet: [["stings", "acid"], ["stings", "acid"]], drop: 1, r: 2 }],
  ["deathcap", "deathcap colony", 40, C3(0.85, 0.85, 0.75), "Pale caps in a ring; the air around them tastes of graves.", { blowSet: [["releases spores at", "poison"], ["releases spores at", "paralyze"]], hpK: 1.6 }]
]);
family("jelly", "j", { shape: "jelly", still: true, cold: true, hpK: 1.8, acK: 0.4, dmgK: 0.9, expK: 1.1, blows: ["touches"] }, [
  ["ooze", "cave ooze", 3, C3(0.55, 0.6, 0.45), "A sluggish puddle that creeps toward warmth.", { still: false, speed: -10 }],
  ["acidjelly", "acid jelly", 7, C3(0.65, 0.9, 0.35), "A wobbling yellow-green cube that eats through boots.", { res: ["acid"], blowSet: [["touches", "acid"]] }],
  ["whitejelly", "white jelly", 12, C3(0.95, 0.95, 0.95), "A great pale mound; touching it numbs the skin.", { res: ["poison"], blowSet: [["touches", "poison"]], hpK: 2.6 }],
  ["glassooze", "glass ooze", 18, C3(0.75, 0.9, 1.0), "So clear you only notice it when it has you.", { invis: true, still: false, speed: -5, blowSet: [["engulfs", "acid"]] }],
  ["ochreslime", "ochre slime", 25, C3(0.85, 0.6, 0.25), "It dissolves whatever you carry that it can reach.", { still: false, speed: -5, blowSet: [["engulfs", "stealItem"]] }],
  ["rainbowjelly", "rainbow jelly", 34, C3(0.9, 0.5, 0.9), "Colours swim inside it; staring is a mistake.", { blowSet: [["touches", "confuse"], ["touches", "drainCharges"]], spells: { freq: 4, list: ["blind", "drainMana"] }, glow: { r: 3, rgb: [0.8, 0.4, 0.9] } }]
]);
family("snake", "J", { shape: "snake", animal: true, acK: 1.2, hpK: 0.9, blows: ["bites"] }, [
  ["grasssnake", "grass snake", 1, C3(0.45, 0.75, 0.35), "Harmless, mostly, but it does not like being trodden on.", { speed: -5 }],
  ["pitadder", "pit adder", 4, C3(0.6, 0.5, 0.35), "A short fat viper coiled in the dust.", { blowSet: [["bites", "poison"]] }],
  ["python", "rock python", 9, C3(0.55, 0.5, 0.4), "Thick as a man and patient as a stone.", { blowSet: ["bites", "crushes"], hpK: 1.4, speed: -5 }],
  ["cobra", "spitting cobra", 14, C3(0.3, 0.3, 0.3), "Its hood flares, and its venom finds your eyes.", { blowSet: [["bites", "poison"]], spells: { freq: 4, list: ["blind"] } }],
  ["copperserpent", "copper serpent", 22, C3(0.85, 0.5, 0.3), "Scales of bright metal that spark when it strikes.", { res: ["elec"], blowSet: [["bites", "elec"], "crushes"] }],
  ["kingviper", "king viper", 32, C3(0.4, 0.6, 0.3), "A crown of horns, and venom that stops the heart.", { blowSet: [["bites", "poison"], ["bites", "poison"]], speed: 10, r: 2 }]
]);

// ---- hunters
family("canine", "C", { shape: "canine", animal: true, speed: 10, pack: [2, 4], hpK: 0.5, dmgK: 0.5, blows: ["bites"] }, [
  ["jackal", "tunnel jackal", 2, C3(0.8, 0.65, 0.4), "Lean scavengers that hunt in yapping packs.", { speed: 0, hp: "2d5", ac: 3, exp: 2, blows: [["1d3", "bites"]], pack: [3, 5] }],
  ["wolf", "grey wolf", 6, C3(0.7, 0.7, 0.75), "A hungry wolf, one of many, with eyes that catch your light.", { hp: "5d6", ac: 10, exp: 15, blows: [["1d6", "bites"], ["1d4", "bites"]], pack: [2, 3] }],
  ["ashhound", "ash hound", 12, C3(0.85, 0.4, 0.25), "Smoke curls from its jaws before the flames do.", { res: ["fire"], spells: { freq: 8, list: ["breath:fire"] } }],
  ["frosthound", "frost hound", 16, C3(0.75, 0.85, 1.0), "Its breath frosts the walls white.", { res: ["cold"], spells: { freq: 8, list: ["breath:cold"] } }],
  ["stormhound", "storm hound", 22, C3(0.6, 0.65, 1.0), "It runs on thunder, and barks lightning.", { res: ["elec"], spells: { freq: 8, list: ["breath:elec"] } }],
  ["shadowhound", "shadow hound", 30, C3(0.3, 0.25, 0.4), "A shape of dark with a wet red mouth.", { res: ["dark"], invis: true, spells: { freq: 8, list: ["breath:dark"] } }],
  ["cindermastiff", "cinder mastiff", 42, C3(1.0, 0.55, 0.2), "Huge, black and burning, it guards something deep below.", { size: 1.3, hpK: 1.1, dmgK: 0.6, res: ["fire"], blowSet: [["bites", "fire"], ["bites", "fire"]], spells: { freq: 6, list: ["breath:fire"] } }]
]);
family("feline", "f", { shape: "feline", animal: true, speed: 10, hpK: 0.8, dmgK: 1.0, blows: ["claws", "bites"] }, [
  ["lynx", "cave lynx", 5, C3(0.75, 0.6, 0.4), "Tufted ears and a silent pounce."],
  ["prowler", "spotted prowler", 10, C3(0.85, 0.7, 0.35), "It stalks you from the edge of your light."],
  ["duskpanther", "dusk panther", 18, C3(0.2, 0.2, 0.25), "Black on black; only its eyes give it away.", { invis: true, r: 2 }],
  ["sabrecat", "sabre cat", 26, C3(0.8, 0.65, 0.45), "Two teeth as long as daggers, and as sharp.", { blowSet: ["claws", "claws", "bites"], hpK: 1.2 }],
  ["stormtiger", "storm tiger", 36, C3(0.6, 0.7, 1.0), "Striped with lightning, it moves like a thunderclap.", { speed: 20, res: ["elec"], blowSet: [["claws", "elec"], ["claws", "elec"], "bites"] }]
]);
family("beast", "q", { shape: "bear", animal: true, hpK: 1.3, dmgK: 1.0, blows: ["claws", "bites"] }, [
  ["badger", "rock badger", 3, C3(0.55, 0.55, 0.55), "Short, broad and very, very angry.", { shape: "rodent" }],
  ["boar", "tusked boar", 5, C3(0.55, 0.4, 0.3), "Bristling and low, it charges at anything that moves.", { blowSet: ["gores"] }],
  ["bear", "cave bear", 7, C3(0.65, 0.45, 0.3), "It rears up on its hind legs, filling the corridor.", { hp: "10d8", ac: 16, exp: 25, r: 2, blows: [["1d8", "claws"], ["1d8", "claws"], ["1d10", "bites"]] }],
  ["icebear", "ice bear", 16, C3(0.92, 0.95, 1.0), "White fur, black lips, and a hug like a glacier.", { res: ["cold"], blowSet: ["claws", ["bites", "cold"]] }],
  ["direboar", "dire boar", 24, C3(0.4, 0.3, 0.25), "A boar the size of an ox, with tusks like scythes.", { blowSet: ["gores", "gores"], hpK: 1.6 }],
  ["woollyhulk", "woolly hulk", 34, C3(0.6, 0.45, 0.3), "A shaggy mountain of a beast that shakes the floor.", { size: 1.5, hpK: 2.2, speed: -5, blowSet: ["tramples", "gores", "gores"] }]
]);
family("bird", "B", { shape: "bird", animal: true, speed: 10, erratic: 0.3, hpK: 0.6, dmgK: 0.8, blows: ["pecks", "claws"] }, [
  ["cavecrow", "cave crow", 2, C3(0.3, 0.3, 0.35), "A black bird that steals bright things.", { blowSet: [["pecks", "steal"]] }],
  ["rook", "deep rook", 6, C3(0.4, 0.4, 0.5), "It caws your name, or something close to it.", { pack: [2, 4] }],
  ["stormowl", "storm owl", 12, C3(0.7, 0.75, 1.0), "Its wings spark as it swoops in silence.", { blowSet: [["claws", "elec"]], erratic: 0 }],
  ["firekestrel", "fire kestrel", 20, C3(1.0, 0.55, 0.25), "A bird of embers that dives like a falling star.", { res: ["fire"], blowSet: [["claws", "fire"]], spells: { freq: 6, list: ["bolt:fire"] }, glow: { r: 2, rgb: [1.0, 0.5, 0.2] } }],
  ["rocchick", "roc chick", 30, C3(0.85, 0.7, 0.45), "Only a fledgling. Its mother must be... large.", { size: 1.5, hpK: 1.8, blowSet: ["pecks", "claws", "claws"], erratic: 0 }]
]);

// ---- goblin-kin, kobolds and people of the deep
family("kobold", "k", { shape: "goblin", evil: true, drop: 0.3, hpK: 0.9, blows: ["hits"], kit: { weapon: "spear" } }, [
  ["koboldscrapper", "kobold scrapper", 2, C3(0.75, 0.55, 0.35), "A yapping little reptile-man with a sharpened stick."],
  ["koboldtrapper", "kobold trapper", 4, C3(0.6, 0.6, 0.4), "Smells of rope, grease and bad intentions.", { spells: { freq: 6, list: ["arrow"] } }],
  ["largekobold", "large kobold", 6, C3(0.8, 0.45, 0.3), "Large for a kobold, which is not saying much.", { hpK: 1.3, kit: { weapon: "mace", body: "leather" } }],
  ["koboldchief", "kobold chieftain", 10, C3(0.9, 0.7, 0.3), "Wears a pot for a crown and a crown for a belt.", { hpK: 1.5, drop: 0.8, kit: { weapon: "broadsword", body: "studded", head: "ironhelm" } }]
]);
family("goblin", "g", { shape: "goblin", evil: true, drop: 0.5, flee: true, blows: ["hits"], kit: { weapon: "dagger", body: "leather" } }, [
  ["goblin", "pit goblin", 3, C3(0.55, 0.85, 0.45), "A wiry goblin in rags, clutching a rusty blade and a stolen purse.", { hp: "3d6", ac: 6, exp: 4, blows: [["1d6", "hits"]] }],
  ["goblinarcher", "goblin archer", 5, C3(0.5, 0.7, 0.4), "It hides behind its friends and shoots.", { pack: [2, 4], spells: { freq: 3, list: ["arrow"] }, kit: { weapon: "dagger", body: "leather" } }],
  ["brute", "goblin brute", 6, C3(0.9, 0.6, 0.35), "A hulking goblin who wears a door as a shield.", { flee: false, hp: "8d8", ac: 14, exp: 18, blows: [["1d10", "smashes"]], drop: 0.6, kit: { weapon: "maul", shield: "tower" } }],
  ["goblinshaman", "goblin shaman", 8, C3(0.6, 0.9, 0.7), "Bones in its hair and sparks at its fingers.", { spells: { freq: 3, list: ["blink", "bolt:elec", "heal"] }, kit: { weapon: "staffw" } }],
  ["goblinwarband", "goblin raider", 11, C3(0.45, 0.65, 0.35), "One of a war-band, painted and screaming.", { pack: [3, 5], hpK: 0.6, dmgK: 0.7, flee: false, kit: { weapon: "handaxe", body: "studded", shield: "buckler" } }],
  ["goblinchief", "goblin warchief", 16, C3(0.7, 0.75, 0.3), "Scarred, mean and covered in other people's jewellery.", { flee: false, hpK: 1.6, drop: 1, kit: { weapon: "battleaxe", body: "chainmail", head: "steelhelm" }, spells: { freq: 5, list: ["summon:kin"] } }]
]);
family("brigand", "p", { shape: "person", evil: true, drop: 0.6, blows: ["hits"], kit: { weapon: "shortsword", body: "leather" } }, [
  ["cutthroat", "cutthroat", 3, C3(0.55, 0.45, 0.4), "A knife in each hand and nothing to lose."],
  ["brigand", "brigand", 5, C3(0.6, 0.5, 0.35), "Hired muscle with a dented helm.", { kit: { weapon: "mace", body: "studded", head: "cap" }, pack: [2, 3] }],
  ["mercenary", "deep mercenary", 9, C3(0.6, 0.6, 0.65), "Fights for whoever paid last, and fights well.", { kit: { weapon: "longsword", body: "chainmail", shield: "roundshield" }, blowSet: ["hits", "hits"] }],
  ["brigandcaptain", "brigand captain", 13, C3(0.75, 0.3, 0.3), "Gold teeth, a red sash and a long blade.", { hpK: 1.4, drop: 1, kit: { weapon: "sabre", body: "scale", head: "ironhelm" }, blowSet: ["hits", "hits"], spells: { freq: 6, list: ["summon:kin"] } }],
  ["bladedancer", "blade dancer", 20, C3(0.85, 0.6, 0.75), "Two curved swords and a smile; you never see the third cut.", { speed: 10, kit: { weapon: "cutlass", body: "leather" }, blowSet: ["cuts", "cuts", "cuts"] }],
  ["deathblade", "deathblade", 32, C3(0.35, 0.3, 0.35), "A killer in black who has already chosen where to strike.", { invis: false, kit: { weapon: "bastard", body: "fullplate", head: "greathelm" }, blowSet: ["hits", ["hits", "poison"], "hits"], hpK: 1.3 }]
]);
family("thief", "p", { shape: "person", evil: true, speed: 10, drop: 0.8, hpK: 0.8, dmgK: 0.6, blows: [["touches", "steal"]], kit: { weapon: "dagger", body: "leather" } }, [
  ["pickpocket", "pickpocket", 2, C3(0.5, 0.55, 0.6), "All smiles and quick hands."],
  ["sneakthief", "sneak thief", 7, C3(0.4, 0.45, 0.4), "Gone before you know what is missing.", { blowSet: [["touches", "stealItem"]] }],
  ["masterthief", "master thief", 16, C3(0.3, 0.3, 0.35), "Not even the shadows notice this one.", { invis: true, blowSet: [["touches", "stealItem"], ["touches", "steal"]], spells: { freq: 5, list: ["blink"] } }]
]);
family("mage", "p", { shape: "person", evil: true, drop: 0.7, hpK: 0.6, dmgK: 0.5, blows: ["hits"], kit: { weapon: "staffw", body: "robe" } }, [
  ["apprentice", "runaway apprentice", 2, C3(0.5, 0.5, 0.85), "Half a spell book and a whole bad temper.", { spells: { freq: 3, list: ["blink", "bolt:arcane"] } }],
  ["hedgewizard", "hedge wizard", 5, C3(0.45, 0.6, 0.4), "A mossy beard and a pocket full of tricks.", { spells: { freq: 3, list: ["confuse", "blink", "bolt:cold"] } }],
  ["illusionist", "illusionist", 10, C3(0.75, 0.5, 0.85), "Its smile is the only real thing about it.", { spells: { freq: 3, list: ["blind", "confuse", "darkness", "blink"] } }],
  ["pyromancer", "pyromancer", 16, C3(1.0, 0.45, 0.2), "Scorched sleeves and a laugh like crackling wood.", { res: ["fire"], spells: { freq: 3, list: ["bolt:fire", "ball:fire", "blink"] } }],
  ["tempestmage", "tempest mage", 24, C3(0.55, 0.65, 1.0), "The air goes heavy and strange around it.", { res: ["elec"], spells: { freq: 3, list: ["bolt:elec", "ball:elec", "tport", "slow"] } }],
  ["voidsorcerer", "void sorcerer", 38, C3(0.4, 0.3, 0.6), "It speaks words that leave holes in the air.", { res: ["dark"], hpK: 1.2, spells: { freq: 2, list: ["ball:dark", "bolt:cold", "teleTo", "paralyze", "summon:any"] } }]
]);
family("priest", "p", { shape: "person", evil: true, drop: 0.7, hpK: 0.8, dmgK: 0.7, blows: ["hits"], kit: { weapon: "mace", body: "robe" } }, [
  ["fallenacolyte", "fallen acolyte", 4, C3(0.6, 0.55, 0.45), "Once a lamp-keeper; now it serves the dark.", { spells: { freq: 4, list: ["scare", "heal"] } }],
  ["gravepriest", "grave priest", 9, C3(0.5, 0.5, 0.45), "It smells of incense and old earth.", { spells: { freq: 3, list: ["summon:undead", "blind", "heal"] } }],
  ["plaguecleric", "plague cleric", 15, C3(0.55, 0.65, 0.35), "Its blessings bring boils.", { blowSet: [["hits", "poison"]], spells: { freq: 3, list: ["ball:poison", "slow", "heal"] } }],
  ["shadowbishop", "shadow bishop", 25, C3(0.35, 0.3, 0.45), "Robes of night, and a crook of black iron.", { res: ["dark"], spells: { freq: 3, list: ["bolt:dark", "summon:undead", "darkness", "paralyze"] } }],
  ["necromancer", "high necromancer", 35, C3(0.45, 0.35, 0.5), "The dead rise to bow when it passes.", { res: ["cold", "dark"], hpK: 1.3, spells: { freq: 2, list: ["summon:undead", "ball:dark", "bolt:cold", "drainMana", "teleTo"] } }]
]);

// ---- big folk
family("ogre", "O", { shape: "giant", evil: true, drop: 0.5, hpK: 1.5, dmgK: 1.2, blows: ["hits", "hits"], kit: { weapon: "club" } }, [
  ["ogre", "ogre", 12, C3(0.75, 0.6, 0.45), "Twice your height and three times your appetite."],
  ["caveogre", "cave ogre", 15, C3(0.6, 0.55, 0.5), "Grey from never seeing the sun, and twice as mean.", { pack: [1, 2], hpK: 1.2 }],
  ["ogremage", "ogre mage", 20, C3(0.45, 0.55, 0.85), "A blue-skinned ogre who learned to read, unfortunately.", { spells: { freq: 3, list: ["bolt:cold", "blink", "darkness", "heal"] } }],
  ["ogrechief", "ogre chieftain", 26, C3(0.85, 0.5, 0.35), "Wears a whole bear as a cloak.", { hpK: 2, drop: 1, kit: { weapon: "greatmaul" }, spells: { freq: 5, list: ["summon:kin"] } }]
]);
family("troll", "T", { shape: "giant", evil: true, regen: true, drop: 0.5, hpK: 1.6, dmgK: 1.1, blows: ["hits", "hits", "bites"], kit: { weapon: "club" } }, [
  ["troll", "stone troll", 10, C3(0.6, 0.6, 0.6), "Grey hide like weathered rock, and a club made from a stalactite.", { hp: "16d10", ac: 24, exp: 70, r: 2, blows: [["1d10", "hits"], ["1d10", "hits"], ["2d6", "bites"]] }],
  ["mosstroll", "moss troll", 14, C3(0.45, 0.65, 0.35), "Green, damp and very hard to kill."],
  ["icetroll", "ice troll", 20, C3(0.8, 0.9, 1.0), "Its blood is cold enough to crack stone.", { res: ["cold"], blowSet: ["hits", ["hits", "cold"], "bites"] }],
  ["cavetroll", "cave troll", 24, C3(0.5, 0.45, 0.4), "Broad as a doorway, with a hide like boot leather.", { hpK: 1.3 }],
  ["oldtroll", "old troll", 32, C3(0.4, 0.4, 0.35), "Lichen grows on it. It has been here longer than the dungeon.", { size: 1.3, hpK: 2.2, kit: { weapon: "greatmaul" } }]
]);
family("giant", "P", { shape: "giant", evil: true, drop: 0.8, hpK: 2, dmgK: 1.3, size: 1.5, blows: ["hits", "hits"], kit: { weapon: "greatmaul" } }, [
  ["hillgiant", "hill giant", 18, C3(0.75, 0.6, 0.45), "It throws boulders the way you throw pebbles.", { spells: { freq: 5, list: ["arrow"] } }],
  ["frostgiant", "frost giant", 26, C3(0.75, 0.85, 1.0), "Its beard is icicles and its axe is older than kings.", { res: ["cold"], blowSet: [["hits", "cold"], ["hits", "cold"]], kit: { weapon: "greataxe" } }],
  ["firegiant", "fire giant", 32, C3(1.0, 0.5, 0.3), "Skin like cooling slag and a sword of red iron.", { res: ["fire"], blowSet: [["hits", "fire"], ["hits", "fire"]], kit: { weapon: "twohander" }, glow: { r: 2, rgb: [1.0, 0.4, 0.15] } }],
  ["stormgiant", "storm giant", 42, C3(0.6, 0.65, 1.0), "Thunder follows it from room to room.", { res: ["elec"], blowSet: [["hits", "elec"], ["hits", "elec"]], spells: { freq: 4, list: ["bolt:elec", "ball:elec", "teleTo"] } }],
  ["titan", "deep titan", 55, C3(0.9, 0.85, 0.7), "The dungeon was built around its bed.", { size: 1.8, hpK: 2.3, blowSet: ["hits", "hits", "hits"], spells: { freq: 4, list: ["summon:any", "heal", "teleTo"] }, r: 3 }]
]);

// ---- the dead
family("skeleton", "s", { shape: "skeleton", undead: true, evil: true, cold: true, res: ["cold", "poison"], hpK: 1.0, blows: ["hits"] }, [
  ["skeleton", "bone rattler", 4, C3(0.95, 0.95, 0.85), "Old bones held together by spite, clicking as they walk.", { hp: "4d6", ac: 9, exp: 8, blows: [["1d6", "claws"]] }],
  ["bonearcher", "bone archer", 9, C3(0.85, 0.82, 0.7), "It nocks arrows made from finger bones.", { spells: { freq: 3, list: ["arrow"] } }],
  ["skelknight", "skeleton knight", 16, C3(0.75, 0.75, 0.8), "Rusted plate still hangs on it, buckled tight.", { acK: 1.5, blowSet: ["hits", "hits"] }],
  ["giantskeleton", "giant skeleton", 22, C3(0.9, 0.88, 0.8), "A ribcage you could walk through.", { size: 1.5, hpK: 1.6, blowSet: ["hits", "hits"] }],
  ["bonecolossus", "bone colossus", 34, C3(0.95, 0.9, 0.8), "A hundred skeletons, fused into one walking ossuary.", { size: 1.7, hpK: 1.8, speed: -5, blowSet: ["crushes", "crushes", "hits"], r: 3 }]
]);
family("zombie", "z", { shape: "ghoul", undead: true, evil: true, cold: true, res: ["cold", "poison"], speed: -5, hpK: 1.5, blows: ["claws", "claws"] }, [
  ["shambler", "shambler", 3, C3(0.55, 0.6, 0.45), "It was someone, once. Now it is slow and hungry.", { speed: -10 }],
  ["ghoul", "crypt ghoul", 9, C3(0.6, 0.75, 0.55), "A grey, stooped corpse-eater that smells you long before it sees you.", { speed: 0, hp: "12d8", ac: 18, exp: 40, r: 2, drop: 0.4, blows: [["1d8", "claws"], ["1d8", "claws"]] }],
  ["rothulk", "rot hulk", 12, C3(0.5, 0.55, 0.35), "Swollen, stitched and smelling of the grave.", { hpK: 2.2, blowSet: [["crushes", "poison"]] }],
  ["ghast", "ghast", 18, C3(0.7, 0.7, 0.6), "Its touch locks your muscles stiff.", { speed: 0, blowSet: [["claws", "paralyze"], "bites"] }],
  ["plaguewalker", "plague walker", 26, C3(0.5, 0.65, 0.3), "Flies follow it in a buzzing cloud.", { blowSet: [["claws", "poison"], ["claws", "drain:con"]], spells: { freq: 5, list: ["ball:poison"] } }]
]);
family("ghost", "G", { shape: "ghost", undead: true, evil: true, cold: true, invis: true, passWall: true, res: ["cold", "poison"], hpK: 0.8, dmgK: 0.8, erratic: 0.3, blows: ["touches"] }, [
  ["poltergeist", "poltergeist", 4, C3(0.85, 0.85, 0.95), "Things move by themselves, and then they hit you.", { speed: 20, erratic: 0.6, invis: false }],
  ["moaner", "moaning spirit", 8, C3(0.7, 0.8, 0.9), "A cold breath and a long, low wail.", { blowSet: [["wails at", "terrify"]], spells: { freq: 5, list: ["scare", "tport"] } }],
  ["banshee", "keening woman", 16, C3(0.9, 0.85, 0.95), "Her cry is the sound of every loss you remember.", { speed: 10, blowSet: [["touches", "drainExp"]], spells: { freq: 4, list: ["scare"] } }],
  ["spectre", "spectre", 26, C3(0.6, 0.7, 0.85), "Its hands pass into you and take some of you away.", { blowSet: [["touches", "drain:str"], ["touches", "drainExp"]], spells: { freq: 4, list: ["blind", "scare", "bolt:dark"] } }],
  ["dread", "dread", 36, C3(0.35, 0.35, 0.45), "A shape of cold hatred wrapped in tattered dark.", { speed: 10, blowSet: [["touches", "blind"], ["touches", "drainExp"]], spells: { freq: 3, list: ["bolt:dark", "darkness", "blind", "slow"] } }],
  ["griefwraith", "grief wraith", 46, C3(0.5, 0.45, 0.65), "It wears the faces of everyone it took.", { speed: 10, hpK: 1.4, blowSet: [["touches", "drainExp"], ["touches", "drain:wis"], ["touches", "terrify"]], spells: { freq: 3, list: ["ball:dark", "paralyze", "summon:undead"] } }]
]);
family("mummy", "M", { shape: "mummy", undead: true, evil: true, cold: true, res: ["poison"], speed: -5, hpK: 1.8, drop: 0.8, blows: ["hits", "hits"] }, [
  ["wrappeddead", "wrapped dead", 14, C3(0.85, 0.8, 0.6), "Linen and resin and something still inside."],
  ["tombpriest", "mummified priest", 24, C3(0.8, 0.7, 0.5), "It still mutters the old rites.", { spells: { freq: 4, list: ["scare", "summon:undead", "blind"] } }],
  ["tombking", "tomb king", 34, C3(1.0, 0.85, 0.4), "A crown of beaten gold above a face of dust.", { size: 1.2, hpK: 2.4, dropGood: 2, spells: { freq: 4, list: ["summon:undead", "paralyze", "bolt:dark"] } }]
]);
family("vampire", "V", { shape: "vampire", undead: true, evil: true, cold: true, res: ["cold", "poison"], regen: true, drop: 0.9, hpK: 1.4, blows: ["hits", ["bites", "drainExp"]] }, [
  ["bloodthrall", "blood thrall", 20, C3(0.75, 0.6, 0.6), "Pale, eager, and not yet entirely dead."],
  ["vampire", "vampire", 30, C3(0.7, 0.25, 0.3), "Courtly manners and a cold, hungry mouth.", { spells: { freq: 3, list: ["scare", "teleTo", "darkness", "heal"] } }],
  ["vampirelord", "vampire lord", 42, C3(0.55, 0.15, 0.25), "It remembers when this dungeon was a palace.", { size: 1.2, hpK: 1.8, speed: 10, dropGood: 2, spells: { freq: 3, list: ["bolt:dark", "paralyze", "summon:kin", "heal"] } }]
]);
family("lich", "L", { shape: "lich", undead: true, evil: true, cold: true, res: ["cold", "poison", "elec"], hpK: 1.3, dmgK: 0.7, drop: 1, dropGood: 1, blows: [["touches", "drainExp"], ["touches", "paralyze"]] }, [
  ["lich", "lich", 38, C3(0.75, 0.7, 0.55), "A sorcerer who would not die, and was not allowed to rest.", { spells: { freq: 2, list: ["ball:cold", "bolt:dark", "blink", "paralyze", "drainMana", "summon:undead"] } }],
  ["elderlich", "elder lich", 50, C3(0.6, 0.55, 0.75), "Its jewelled skull holds a thousand years of spite.", { size: 1.2, hpK: 1.8, spells: { freq: 2, list: ["ball:dark", "ball:fire", "teleTo", "paralyze", "summon:undead", "heal"] } }]
]);

// ---- spirits, vortices and things that eat light
family("elemental", "E", { shape: "elemental", cold: true, res: ["poison"], hpK: 1.3, blows: ["hits", "hits"] }, [
  ["earthspirit", "earth spirit", 15, C3(0.6, 0.5, 0.35), "Walls are doors to it.", { passWall: true, speed: -5, acK: 1.4 }],
  ["flamespirit", "flame spirit", 18, C3(1.0, 0.55, 0.2), "A dancing column of fire with a face in it.", { res: ["fire", "poison"], blowSet: [["burns", "fire"], ["burns", "fire"]], glow: { r: 4, rgb: [1.0, 0.5, 0.15] }, speed: 10 }],
  ["airspirit", "air spirit", 20, C3(0.85, 0.9, 1.0), "A gust that has decided to stay and hurt you.", { invis: true, speed: 20, erratic: 0.4 }],
  ["waterspirit", "water spirit", 22, C3(0.4, 0.6, 1.0), "Cold water in the shape of a drowning man.", { res: ["cold", "poison", "acid"], blowSet: [["engulfs", "cold"], "hits"] }],
  ["magmaspirit", "magma spirit", 32, C3(1.0, 0.4, 0.15), "It oozes through the walls, leaving them glowing.", { res: ["fire", "poison"], passWall: true, blowSet: [["burns", "fire"], ["burns", "fire"]], glow: { r: 3, rgb: [1.0, 0.35, 0.1] }, spells: { freq: 5, list: ["bolt:fire"] } }],
  ["stormspirit", "storm spirit", 40, C3(0.7, 0.75, 1.0), "Lightning that has learned to walk.", { res: ["elec", "poison"], speed: 10, blowSet: [["shocks", "elec"], ["shocks", "elec"]], glow: { r: 4, rgb: [0.5, 0.6, 1.0] }, spells: { freq: 3, list: ["bolt:elec", "ball:elec"] } }]
]);
family("vortex", "v", { shape: "vortex", cold: true, erratic: 0.6, speed: 10, hpK: 0.7, res: ["poison"], blows: ["engulfs"] }, [
  ["dustdevil", "dust devil", 8, C3(0.75, 0.65, 0.5), "A whirl of grit that scours your eyes.", { blowSet: [["engulfs", "blind"]] }],
  ["firevortex", "fire vortex", 18, C3(1.0, 0.5, 0.2), "A spinning furnace.", { res: ["fire", "poison"], blowSet: [["engulfs", "fire"]], spells: { freq: 6, list: ["breath:fire"] }, glow: { r: 3, rgb: [1.0, 0.45, 0.15] } }],
  ["coldvortex", "cold vortex", 20, C3(0.75, 0.9, 1.0), "Snow whirls out of nowhere.", { res: ["cold", "poison"], blowSet: [["engulfs", "cold"]], spells: { freq: 6, list: ["breath:cold"] } }],
  ["energyvortex", "energy vortex", 24, C3(0.65, 0.65, 1.0), "Crackling blue sparks in a tight spiral.", { res: ["elec", "poison"], blowSet: [["engulfs", "elec"]], spells: { freq: 6, list: ["breath:elec"] }, glow: { r: 3, rgb: [0.5, 0.55, 1.0] } }],
  ["voidvortex", "void vortex", 40, C3(0.3, 0.2, 0.45), "A hole in the world, turning slowly.", { res: ["dark", "poison"], blowSet: [["engulfs", "dark"], ["engulfs", "drainCharges"]], spells: { freq: 5, list: ["breath:dark", "teleTo"] } }]
]);
family("shade", "Y", { shape: "ghost", evil: true, cold: true, res: ["dark"], invis: true, hpK: 0.9, blows: [["touches", "eatLight"]] }, [
  ["shade", "shade", 10, C3(0.3, 0.3, 0.38), "Where it stands, your torch burns low.", { spells: { freq: 5, list: ["darkness"] } }],
  ["lanterneater", "lantern-eater", 20, C3(0.25, 0.22, 0.3), "It gulps at your flame like a drowning man at air.", { blowSet: [["touches", "eatLight"], ["bites", "dark"]], spells: { freq: 4, list: ["darkness", "blind"] } }],
  ["umbralstalker", "umbral stalker", 30, C3(0.2, 0.18, 0.25), "The dark behind you moves when you do.", { speed: 10, passWall: true, blowSet: [["claws", "dark"], ["claws", "eatLight"]] }],
  ["darkheart", "heart of darkness", 44, C3(0.15, 0.1, 0.2), "A pulse in the black, slow and patient.", { still: true, hpK: 2.5, blowSet: [["touches", "drainExp"]], spells: { freq: 2, list: ["ball:dark", "darkness", "summon:kin", "teleTo"] } }]
]);
family("eye", "e", { shape: "eye", still: true, cold: true, hpK: 0.9, acK: 0.6, expK: 1.2, blows: [["gazes at", "paralyze"]] }, [
  ["watcherorb", "watcher orb", 3, C3(0.85, 0.85, 0.7), "A floating eye; meeting its gaze is a mistake.", {}],
  ["bloodeye", "blood eye", 8, C3(0.9, 0.3, 0.3), "Red and weeping, it stares and drains.", { blowSet: [["gazes at", "drainExp"]] }],
  ["stormeye", "storm eye", 16, C3(0.65, 0.7, 1.0), "Lightning flickers behind its lid.", { blowSet: [["gazes at", "elec"]], spells: { freq: 3, list: ["bolt:elec"] } }],
  ["dreadgazer", "dread gazer", 28, C3(0.65, 0.4, 0.75), "A great eye ringed with smaller ones, all looking at you.", { hpK: 1.6, spells: { freq: 2, list: ["paralyze", "bolt:cold", "bolt:fire", "drainMana", "scare"] } }],
  ["eyeofdeep", "eye of the deep", 42, C3(0.4, 0.75, 0.85), "Something vast looks up through it.", { size: 1.5, hpK: 2.2, spells: { freq: 2, list: ["ball:dark", "teleTo", "paralyze", "summon:any"] } }]
]);
family("mimic", "$", { shape: "mimic", still: true, cold: true, hpK: 1.4, acK: 1.3, expK: 1.4, blows: ["bites", "bites"] }, [
  ["chestmimic", "chest mimic", 8, C3(0.7, 0.5, 0.3), "That chest has teeth.", { mimic: "gold", drop: 1 }],
  ["potionmimic", "potion mimic", 14, C3(0.6, 0.8, 1.0), "A bottle that drinks you.", { mimic: "potion", blowSet: [["bites", "poison"]], spells: { freq: 4, list: ["confuse", "blind", "bolt:cold"] } }],
  ["scrollmimic", "scroll mimic", 18, C3(0.95, 0.9, 0.8), "Reading it would be its idea of a joke.", { mimic: "scroll", spells: { freq: 3, list: ["confuse", "scare", "bolt:fire", "summon:any"] } }],
  ["gildmimic", "gilded mimic", 28, C3(1.0, 0.85, 0.3), "A heap of gold that has been waiting for you.", { mimic: "gold", hpK: 2, dropGood: 2, spells: { freq: 3, list: ["ball:acid", "paralyze"] } }]
]);
family("plant", ",", { shape: "plant", still: true, cold: true, hpK: 1.2, dmgK: 1.1, blows: ["lashes"] }, [
  ["creeper", "creeper vine", 3, C3(0.4, 0.65, 0.3), "Vines that move when you are not looking."],
  ["sporepod", "spore pod", 6, C3(0.75, 0.6, 0.85), "It swells and bursts when you come near.", { blowSet: [["releases spores at", "confuse"]], spells: { freq: 5, list: ["ball:poison"] } }],
  ["strangler", "strangler vine", 10, C3(0.3, 0.5, 0.25), "It wraps your arms and squeezes.", { blowSet: ["lashes", "crushes"] }],
  ["bloodroot", "bloodroot", 18, C3(0.75, 0.2, 0.25), "Red tendrils that drink from wherever they pierce.", { blowSet: [["pierces", "drain:con"]], regen: true }],
  ["thornwood", "ancient thornwood", 30, C3(0.45, 0.4, 0.3), "A tree that grew in the dark, out of spite and bones.", { size: 1.5, hpK: 2.4, blowSet: ["lashes", "lashes", ["pierces", "poison"]] }]
]);
family("arachnid", "x", { shape: "scorpion", animal: true, cold: true, acK: 1.3, blows: ["pinches", ["stings", "poison"]] }, [
  ["cavecrab", "cave crab", 3, C3(0.75, 0.45, 0.35), "Click, click, click, pinch.", { blowSet: ["pinches"] }],
  ["scorpion", "giant scorpion", 9, C3(0.6, 0.45, 0.25), "The tail curls up, and waits."],
  ["lavacrab", "lava crab", 16, C3(1.0, 0.45, 0.2), "Its shell is cooling rock with fire beneath.", { res: ["fire"], blowSet: [["pinches", "fire"], ["pinches", "fire"]], glow: { r: 2, rgb: [1.0, 0.4, 0.1] } }],
  ["shadowscorpion", "shadow scorpion", 24, C3(0.3, 0.28, 0.35), "Black, quick, and almost invisible in torchlight.", { invis: true, speed: 10 }]
]);

// ---- reptiles, hybrids, horrors
family("reptile", "R", { shape: "lizard", animal: true, hpK: 1.1, blows: ["bites"] }, [
  ["cavelizard", "cave lizard", 2, C3(0.55, 0.6, 0.4), "A pale lizard that licks the damp from the walls."],
  ["salamander", "salamander", 6, C3(1.0, 0.5, 0.25), "A little lizard that burns hot to the touch.", { res: ["fire"], blowSet: [["bites", "fire"]], glow: { r: 2, rgb: [1.0, 0.45, 0.15] } }],
  ["crocodile", "deep crocodile", 10, C3(0.4, 0.5, 0.35), "It lies very still in the black pools.", { hpK: 1.6, blowSet: ["bites", "crushes"], speed: -5 }],
  ["basilisk", "basilisk", 20, C3(0.5, 0.6, 0.3), "Do not look into its yellow eyes.", { blowSet: [["gazes at", "paralyze"], "bites"], spells: { freq: 4, list: ["paralyze"] } }],
  ["hydra2", "two-headed hydra", 16, C3(0.5, 0.65, 0.4), "Two heads, both arguing about which bites first.", { shape: "hydra", blowSet: ["bites", "bites"], hpK: 1.6 }],
  ["hydra5", "five-headed hydra", 28, C3(0.45, 0.6, 0.45), "Cut one head off, and you still have four problems.", { shape: "hydra", size: 1.3, regen: true, blowSet: ["bites", "bites", ["bites", "poison"]], hpK: 2, spells: { freq: 5, list: ["breath:poison"] } }],
  ["hydra7", "seven-headed hydra", 40, C3(0.75, 0.4, 0.3), "Seven heads, seven tempers, one fire.", { shape: "hydra", size: 1.5, regen: true, res: ["fire"], blowSet: [["bites", "fire"], ["bites", "fire"], "bites"], hpK: 2.4, spells: { freq: 4, list: ["breath:fire", "scare"] } }]
]);
family("hybrid", "H", { shape: "hybrid", hpK: 1.2, blows: ["hits", "gores"] }, [
  ["harpy", "harpy", 6, C3(0.7, 0.55, 0.45), "A woman's face, a vulture's body, and terrible manners.", { shape: "bird", speed: 10, erratic: 0.3, blowSet: ["claws", ["claws", "steal"]] }],
  ["goatman", "goat-man", 8, C3(0.6, 0.5, 0.35), "Horned and hooved, it plays a pipe made of shin bone.", { evil: true, spells: { freq: 6, list: ["confuse"] } }],
  ["bullman", "bull-man", 20, C3(0.55, 0.35, 0.25), "It lowers its horns, paws the ground, and comes.", { evil: true, size: 1.3, hpK: 1.8, blowSet: ["gores", "gores", "hits"] }],
  ["manticore", "manticore", 30, C3(0.85, 0.5, 0.3), "A lion's body, a man's grin, and a tail full of spikes.", { evil: true, size: 1.3, spells: { freq: 3, list: ["arrow"] }, blowSet: ["claws", "claws", ["stings", "poison"]] }],
  ["chimera", "chimera", 36, C3(0.9, 0.6, 0.35), "Three heads, none of them friendly, one of them on fire.", { evil: true, size: 1.4, hpK: 1.8, res: ["fire"], spells: { freq: 4, list: ["breath:fire"] }, blowSet: ["bites", ["bites", "fire"], "gores"] }]
]);
family("horror", "h", { shape: "horror", evil: true, hpK: 1.3, blows: [["grasps", "confuse"], "bites"] }, [
  ["palecrawler", "pale crawler", 12, C3(0.85, 0.82, 0.8), "Too many joints, all of them bending the wrong way.", { speed: 10 }],
  ["mindleech", "mind leech", 18, C3(0.7, 0.5, 0.65), "A soft grey thing that fastens behind your ear.", { blowSet: [["fastens on", "drain:int"]], spells: { freq: 4, list: ["confuse", "drainMana"] } }],
  ["tentaclehorror", "tentacled horror", 24, C3(0.45, 0.55, 0.5), "A knot of grasping arms around a beak.", { blowSet: [["grasps", "paralyze"], ["grasps", "confuse"], "bites"] }],
  ["mawbeast", "maw beast", 32, C3(0.6, 0.3, 0.35), "Mostly mouth. The rest is teeth.", { size: 1.4, hpK: 2, blowSet: ["bites", "bites", "bites"] }],
  ["thingbelow", "thing from below", 45, C3(0.35, 0.45, 0.4), "Your eyes refuse to agree on its shape.", { size: 1.6, hpK: 2.6, passWall: true, blowSet: [["grasps", "drainExp"], ["grasps", "drain:wis"], "bites"], spells: { freq: 3, list: ["paralyze", "teleTo", "ball:dark", "summon:any"] } }]
]);
family("golem", "W", { shape: "golem", cold: true, res: ["poison"], speed: -5, hpK: 2, acK: 1.6, expK: 0.8, blows: ["hits", "hits"] }, [
  ["claygolem", "clay golem", 10, C3(0.7, 0.55, 0.4), "Shaped by hand and told to stand guard forever."],
  ["fleshgolem", "flesh golem", 14, C3(0.85, 0.65, 0.6), "Stitched from many, and angry about all of them.", { speed: 0 }],
  ["stonegolem", "stone golem", 20, C3(0.6, 0.6, 0.6), "A walking statue of grey granite.", { acK: 2, size: 1.2 }],
  ["irongolem", "iron golem", 30, C3(0.55, 0.6, 0.7), "Hinges groan as it turns its iron head.", { size: 1.3, res: ["poison", "fire", "cold"], spells: { freq: 6, list: ["slow"] } }],
  ["crystalgolem", "crystal golem", 40, C3(0.7, 0.9, 1.0), "It catches your torchlight and throws it back as knives.", { size: 1.3, res: ["poison", "elec", "fire", "cold"], spells: { freq: 4, list: ["blind", "bolt:light"] }, glow: { r: 3, rgb: [0.6, 0.8, 1.0] } }]
]);
family("fiend", "u", { shape: "fiend", evil: true, res: ["fire"], hpK: 1.2, blows: ["claws", ["bites", "fire"]] }, [
  ["imp", "imp", 12, C3(0.9, 0.35, 0.25), "A cackling red thing the size of a cat, with a tail like a whip.", { speed: 10, invis: true, spells: { freq: 3, list: ["blink", "bolt:fire"] } }],
  ["emberimp", "ember imp", 16, C3(1.0, 0.55, 0.25), "It leaves scorched footprints and worse jokes.", { speed: 10, spells: { freq: 3, list: ["ball:fire", "tport"] }, glow: { r: 2, rgb: [1.0, 0.45, 0.15] } }],
  ["gloomfiend", "gloom fiend", 22, C3(0.4, 0.3, 0.5), "Bat wings and a voice like a cold fireplace.", { res: ["fire", "dark"], spells: { freq: 3, list: ["darkness", "bolt:dark", "scare"] } }],
  ["hornedfiend", "horned fiend", 30, C3(0.7, 0.2, 0.2), "Horns like a ram and a halberd of black iron.", { size: 1.3, hpK: 1.8, blowSet: ["gores", "hits", ["bites", "fire"]], spells: { freq: 4, list: ["ball:fire", "summon:kin"] } }],
  ["flayer", "flayer fiend", 38, C3(0.8, 0.45, 0.5), "It wears its victims, and it wants your coat.", { speed: 10, hpK: 1.6, blowSet: ["claws", "claws", ["bites", "drain:con"]], spells: { freq: 3, list: ["paralyze", "teleTo", "bolt:fire"] } }],
  ["nightduke", "night duke", 48, C3(0.45, 0.25, 0.55), "A noble of the pit, crowned with flame.", { size: 1.5, hpK: 2.4, res: ["fire", "dark", "poison"], dropGood: 2, spells: { freq: 2, list: ["ball:fire", "ball:dark", "summon:kin", "teleTo", "heal"] } }]
]);
family("drake", "d", { shape: "drake", evil: true, drop: 0.8, hpK: 1.4, blows: ["claws", "bites"] }, [
  ["greenwyrmling", "green wyrmling", 10, C3(0.4, 0.75, 0.35), "A dragon no bigger than a dog, already greedy.", { res: ["poison"], spells: { freq: 6, list: ["breath:poison"] } }],
  ["bluewyrmling", "blue wyrmling", 11, C3(0.45, 0.55, 1.0), "Small, quick and crackling.", { res: ["elec"], spells: { freq: 6, list: ["breath:elec"] } }],
  ["whitewyrmling", "white wyrmling", 12, C3(0.92, 0.95, 1.0), "Its scales are cold enough to burn.", { res: ["cold"], spells: { freq: 6, list: ["breath:cold"] } }],
  ["redwyrmling", "red wyrmling", 13, C3(1.0, 0.35, 0.25), "It hisses smoke and sits on a heap of copper coins.", { res: ["fire"], spells: { freq: 6, list: ["breath:fire"] } }],
  ["venomdrake", "venom drake", 24, C3(0.45, 0.7, 0.3), "Green fumes drip from its teeth.", { res: ["poison"], size: 1.2, spells: { freq: 5, list: ["breath:poison", "scare"] } }],
  ["firedrake", "fire drake", 26, C3(1.0, 0.45, 0.25), "A young dragon with an old temper.", { res: ["fire"], size: 1.2, spells: { freq: 5, list: ["breath:fire", "scare"] } }],
  ["frostdrake", "frost drake", 27, C3(0.8, 0.9, 1.0), "Icicles hang from its jaws.", { res: ["cold"], size: 1.2, spells: { freq: 5, list: ["breath:cold", "scare"] } }],
  ["stormdrake", "storm drake", 28, C3(0.55, 0.6, 1.0), "It flies on a wind of its own making.", { res: ["elec"], size: 1.2, speed: 10, spells: { freq: 5, list: ["breath:elec", "scare"] } }]
]);
family("dragon", "D", { shape: "dragon", evil: true, drop: 1, dropGood: 2, size: 1.8, hpK: 2.0, dmgK: 0.95, r: 3, blows: ["claws", "claws", "bites"] }, [
  ["emberdragon", "ember dragon", 40, C3(1.0, 0.4, 0.2), "Its hoard glows from the heat of its sleeping.", { res: ["fire"], glow: { r: 3, rgb: [1.0, 0.4, 0.15] }, spells: { freq: 4, list: ["breath:fire", "scare", "slow"] } }],
  ["rimedragon", "rime dragon", 42, C3(0.85, 0.92, 1.0), "Snow falls from the ceiling of its lair.", { res: ["cold"], spells: { freq: 4, list: ["breath:cold", "scare", "slow"] } }],
  ["thunderdragon", "thunder dragon", 44, C3(0.55, 0.6, 1.0), "Every beat of its wings is a thunderclap.", { res: ["elec"], spells: { freq: 4, list: ["breath:elec", "scare", "teleTo"] } }],
  ["plaguedragon", "plague dragon", 46, C3(0.45, 0.65, 0.3), "Its breath rots stone.", { res: ["poison", "acid"], spells: { freq: 4, list: ["breath:poison", "breath:acid", "scare"] } }],
  ["prismdragon", "prism dragon", 55, C3(0.9, 0.85, 1.0), "Its scales split your torchlight into every colour.", { res: ["fire", "cold", "elec", "acid", "poison"], hpK: 2.3, glow: { r: 4, rgb: [0.9, 0.85, 1.0] }, spells: { freq: 3, list: ["breath:fire", "breath:cold", "breath:elec", "breath:acid", "paralyze", "heal"] } }]
]);

family("wisp", "*", { shape: "wisp", cold: true, erratic: 0.5, speed: 10, res: ["poison"], hpK: 0.8, blows: [["shocks", "elec"]] }, [
  ["wisp", "marsh wisp", 8, C3(0.6, 0.8, 1.2), "A drifting ball of cold blue light that crackles as it nears.", { res: ["elec", "poison"], r: 3, hp: "6d6", ac: 20, exp: 30, blows: [["2d6", "shocks"]], glow: { r: 4, rgb: [0.35, 0.55, 1.0] } }],
  ["willolantern", "will-o'-lantern", 14, C3(1.0, 0.8, 0.45), "A warm light that bobs ahead, always just one room further.", { blowSet: [["burns", "fire"]], glow: { r: 4, rgb: [1.0, 0.7, 0.3] }, spells: { freq: 4, list: ["blink", "confuse"] } }],
  ["ghostlight", "ghost light", 22, C3(0.85, 0.95, 0.9), "A pale glow that makes your eyes water and then fail.", { invis: false, blowSet: [["touches", "blind"]], glow: { r: 5, rgb: [0.7, 0.9, 0.8] }, spells: { freq: 4, list: ["blind", "tport"] } }],
  ["starwisp", "star wisp", 34, C3(1.0, 1.0, 0.8), "A splinter of starlight, lost a very long way down.", { blowSet: [["burns", "light"], ["shocks", "elec"]], glow: { r: 6, rgb: [1.0, 1.0, 0.8] }, spells: { freq: 3, list: ["bolt:light", "blink"] } }]
]);
family("deadhound", "C", { shape: "canine", undead: true, evil: true, cold: true, res: ["cold", "poison"], speed: 10, pack: [2, 4], hpK: 0.5, dmgK: 0.55, blows: ["bites", "bites"] }, [
  ["bonehound", "bone hound", 14, C3(0.9, 0.88, 0.8), "Rattling ribs and a jaw that never tires."],
  ["gravehound", "grave hound", 24, C3(0.5, 0.55, 0.45), "It digs where the dead are buried, and finds them.", { blowSet: [["bites", "drainExp"], "bites"] }],
  ["deathhound", "death hound", 36, C3(0.3, 0.25, 0.35), "A black dog with no eyes, that always knows where you are.", { invis: true, spells: { freq: 6, list: ["breath:dark"] } }]
]);
family("were", "p", { shape: "person", evil: true, regen: true, hpK: 1.2, blows: ["claws", "bites"] }, [
  ["wererat", "wererat", 8, C3(0.6, 0.5, 0.4), "A sly man with a twitching nose and a long, bald tail.", { shape: "rodent", spells: { freq: 6, list: ["summon:kin"] } }],
  ["werewolf", "werewolf", 18, C3(0.6, 0.55, 0.5), "It was a man at dusk. It is not a man now.", { shape: "canine", speed: 10, blowSet: ["claws", "claws", "bites"] }],
  ["werebear", "werebear", 26, C3(0.55, 0.4, 0.3), "Huge, brown, and in a terrible mood about it.", { shape: "bear", hpK: 1.8, blowSet: ["claws", "claws", "bites"] }]
]);
family("scalekin", "l", { shape: "scalekin", evil: true, drop: 0.5, blows: ["hits", "bites"], kit: { weapon: "spear", shield: "buckler" } }, [
  ["scalewarrior", "scalekin warrior", 7, C3(0.45, 0.65, 0.4), "A lizard-man with a bone spear and a crest of feathers.", { pack: [2, 4] }],
  ["scaleshaman", "scalekin shaman", 11, C3(0.55, 0.5, 0.75), "It hisses old words and the torches gutter.", { spells: { freq: 3, list: ["bolt:poison", "heal", "darkness"] }, kit: { weapon: "staffw" } }],
  ["scalechampion", "scalekin champion", 17, C3(0.4, 0.55, 0.35), "Plated in turtle shell and proud of every scar.", { hpK: 1.5, kit: { weapon: "trident", shield: "roundshield" }, blowSet: ["hits", "hits", "bites"] }],
  ["scaletyrant", "scalekin tyrant", 27, C3(0.7, 0.45, 0.3), "Old, vast and crowned; it ate the last tyrant.", { size: 1.3, hpK: 2, drop: 1, kit: { weapon: "glaive" }, spells: { freq: 4, list: ["summon:kin", "scare"] } }]
]);
family("sporefolk", "F", { shape: "mushroom", cold: true, res: ["poison"], speed: -5, hpK: 1.1, blows: [["slaps", "confuse"]] }, [
  ["sporeling", "sporeling", 4, C3(0.85, 0.7, 0.55), "A waddling mushroom child that sneezes spores.", { pack: [2, 5] }],
  ["mycoshambler", "myco shambler", 9, C3(0.7, 0.55, 0.75), "A walking toadstool as tall as you, humming to itself.", { blowSet: [["slaps", "poison"], ["slaps", "confuse"]] }],
  ["puffcapelder", "puffcap elder", 15, C3(0.9, 0.4, 0.35), "Red-capped and white-spotted, it rules the damp rooms.", { hpK: 1.6, spells: { freq: 3, list: ["ball:poison", "confuse", "summon:kin"] } }]
]);
family("gargoyle", "N", { shape: "fiend", evil: true, cold: true, res: ["poison"], acK: 1.6, hpK: 1.2, blows: ["claws", "claws", "bites"] }, [
  ["gargoyle", "gargoyle", 18, C3(0.55, 0.55, 0.55), "Carved for a roof, it found the cellar more to its taste.", { erratic: 0.2 }],
  ["gargoylelord", "gargoyle lord", 30, C3(0.45, 0.45, 0.5), "It sits so still that you walk right past it.", { size: 1.3, hpK: 1.6, spells: { freq: 5, list: ["summon:kin", "scare"] } }]
]);
// ---- the named: one of each in a game, at set depths, and they carry something good
family("unique", "@", { unique: true, drop: 1, dropGood: 2, hpK: 2.4, dmgK: 1.15, r: 2, blows: ["hits", "hits"] }, [
  ["whiskers", "Old Whiskers, King of Rats", 3, C3(0.8, 0.7, 0.55), "A rat as big as a dog, wearing a thimble for a crown.", { shape: "rodent", glyph: "r", animal: true, blowSet: ["bites", ["bites", "poison"]], spells: { freq: 3, list: ["summon:kin"] }, dropGood: 1 }],
  ["fenwick", "Fenwick Gutterking", 5, C3(0.9, 0.7, 0.3), "The self-crowned king of the kobolds, and every one of them owes him money.", { shape: "goblin", evil: true, kit: { weapon: "morningstar", body: "studded", head: "circlet" }, spells: { freq: 4, list: ["summon:kin", "arrow"] } }],
  ["snag", "Snag the Quick", 6, C3(0.55, 0.85, 0.5), "A goblin who has stolen from three kings and every one of their cooks.", { shape: "goblin", evil: true, speed: 10, kit: { weapon: "dagger", body: "leather" }, blowSet: [["touches", "stealItem"], ["touches", "steal"]], spells: { freq: 4, list: ["blink"] } }],
  ["oldtusk", "Old Tusk", 7, C3(0.5, 0.35, 0.25), "A boar with one eye, many scars, and no fear at all.", { shape: "bear", animal: true, blowSet: ["gores", "gores"], speed: 10 }],
  ["bristle", "Mother Bristle", 9, C3(0.55, 0.45, 0.6), "A spider as wide as a cart, ringed by her children.", { shape: "spider", animal: true, size: 1.4, blowSet: [["bites", "poison"], ["bites", "paralyze"]], spells: { freq: 3, list: ["summon:kin", "slow"] } }],
  ["varn", "Varn the Flayer", 10, C3(0.7, 0.3, 0.3), "A brigand chief who collects ears.", { shape: "person", evil: true, kit: { weapon: "sabre", body: "chainmail", head: "ironhelm" }, blowSet: ["cuts", "cuts", ["cuts", "terrify"]], spells: { freq: 5, list: ["summon:any"] } }],
  ["lanternthief", "the Lantern Thief", 11, C3(0.3, 0.28, 0.35), "A shadow in a stolen coat, with a sack full of snuffed lights.", { shape: "ghost", invis: true, evil: true, blowSet: [["touches", "eatLight"], ["touches", "stealItem"]], spells: { freq: 3, list: ["darkness", "blink"] } }],
  ["corvane", "Corvane, Crow of the Deep", 12, C3(0.25, 0.25, 0.32), "A crow as tall as a man, who speaks in your mother's voice.", { shape: "bird", animal: true, speed: 20, blowSet: [["pecks", "blind"], ["claws", "steal"]], spells: { freq: 3, list: ["summon:kin", "scare"] } }],
  ["vesper", "Sister Vesper", 13, C3(0.55, 0.45, 0.55), "She kept the lamps of a temple once, and put them all out.", { shape: "person", evil: true, kit: { weapon: "mace", body: "robe" }, spells: { freq: 2, list: ["darkness", "summon:undead", "bolt:dark", "heal"] } }],
  ["kettlemaw", "Kettlemaw", 15, C3(0.8, 0.6, 0.4), "An ogre cook who wants you for the pot.", { shape: "giant", evil: true, kit: { weapon: "greatmaul" }, blowSet: ["hits", "hits", "bites"] }],
  ["hollowjack", "Hollow Jack", 17, C3(0.95, 0.65, 0.25), "A scarecrow with a candle for a heart, and it is lonely.", { shape: "ghost", undead: true, evil: true, passWall: true, glow: { r: 3, rgb: [1.0, 0.6, 0.2] }, blowSet: [["touches", "terrify"], ["burns", "fire"]], spells: { freq: 3, list: ["scare", "bolt:fire", "tport"] } }],
  ["grimsby", "Grimsby Coldhand", 19, C3(0.6, 0.6, 0.75), "A necromancer whose servants are all former apprentices.", { shape: "person", evil: true, kit: { weapon: "staffw", body: "robe" }, spells: { freq: 2, list: ["summon:undead", "bolt:cold", "paralyze", "blink"] } }],
  ["brakka", "Brakka Stoneteeth", 21, C3(0.55, 0.55, 0.5), "A troll so old her teeth have turned to granite.", { shape: "giant", evil: true, regen: true, size: 1.3, kit: { weapon: "club" }, blowSet: ["hits", "hits", "bites"] }],
  ["ysolde", "Ysolde of the Ashes", 23, C3(1.0, 0.5, 0.3), "She burned her own tower down to be free of it.", { shape: "person", evil: true, res: ["fire"], kit: { weapon: "staffw", body: "robe" }, glow: { r: 3, rgb: [1.0, 0.45, 0.15] }, spells: { freq: 2, list: ["ball:fire", "bolt:fire", "blink", "scare"] } }],
  ["maulwyrm", "the Maul-Wyrm", 25, C3(0.55, 0.45, 0.4), "A worm the width of a corridor, that makes the corridors.", { shape: "worm", animal: true, killWall: true, size: 1.6, speed: -5, blowSet: ["crushes", "bites"] }],
  ["greywidow", "the Grey Widow", 27, C3(0.7, 0.7, 0.75), "Silk hangs from her like a bride's veil.", { shape: "spider", animal: true, size: 1.4, invis: true, blowSet: [["bites", "poison"], ["bites", "paralyze"]], spells: { freq: 3, list: ["summon:kin", "slow", "teleTo"] } }],
  ["thessaly", "Thessaly Glass", 29, C3(0.8, 0.9, 1.0), "A mimic that took the shape of a mirror, and then of you.", { shape: "mimic", mimic: "potion", still: true, spells: { freq: 2, list: ["blind", "confuse", "ball:cold", "teleTo"] } }],
  ["ironjaw", "Ironjaw", 31, C3(0.5, 0.55, 0.65), "A golem built to guard a vault that no longer exists.", { shape: "golem", res: ["poison", "fire", "cold"], size: 1.4, acK: 1.8, speed: -5, blowSet: ["hits", "hits", "crushes"] }],
  ["palebride", "the Pale Bride", 33, C3(0.95, 0.9, 0.9), "Still in her wedding white, still waiting, still hungry.", { shape: "vampire", undead: true, evil: true, regen: true, blowSet: ["hits", ["bites", "drainExp"]], spells: { freq: 2, list: ["paralyze", "teleTo", "summon:undead", "heal"] } }],
  ["drownedking", "the Drowned King", 35, C3(0.4, 0.6, 0.65), "Weed in his crown, water in his lungs, and patience forever.", { shape: "mummy", undead: true, evil: true, res: ["cold", "poison"], size: 1.2, blowSet: [["hits", "cold"], ["hits", "paralyze"]], spells: { freq: 3, list: ["summon:undead", "ball:cold", "slow"] } }],
  ["rimeheart", "Rimeheart", 37, C3(0.75, 0.9, 1.0), "A frost giant who froze his own heart to stop it hurting.", { shape: "giant", evil: true, res: ["cold"], size: 1.6, kit: { weapon: "greataxe" }, blowSet: [["hits", "cold"], ["hits", "cold"], "hits"], spells: { freq: 3, list: ["ball:cold", "breath:cold"] } }],
  ["manymouthed", "the Many-Mouthed", 39, C3(0.6, 0.35, 0.4), "Every mouth whispers a different lie, all at once.", { shape: "horror", evil: true, size: 1.5, blowSet: ["bites", ["bites", "confuse"], ["bites", "drainExp"]], spells: { freq: 2, list: ["confuse", "scare", "summon:any", "ball:dark"] } }],
  ["skarth", "Skarth the Unsleeping", 42, C3(0.7, 0.65, 0.5), "A lich who has not closed his eyes in nine hundred years.", { shape: "lich", undead: true, evil: true, res: ["cold", "poison", "elec"], blowSet: [["touches", "drainExp"], ["touches", "paralyze"]], spells: { freq: 2, list: ["ball:cold", "ball:dark", "paralyze", "summon:undead", "teleTo", "heal"] } }],
  ["emberqueen", "the Ember Queen", 45, C3(1.0, 0.35, 0.15), "An old red dragon who remembers the first fire.", { shape: "dragon", evil: true, res: ["fire"], size: 2, glow: { r: 4, rgb: [1.0, 0.4, 0.15] }, blowSet: ["claws", "claws", ["bites", "fire"]], spells: { freq: 3, list: ["breath:fire", "scare", "summon:kin"] } }],
  ["ashvane", "Duke Ashvane", 48, C3(0.6, 0.25, 0.4), "A fiend who wagered his kingdom and won yours.", { shape: "fiend", evil: true, res: ["fire", "dark", "poison"], size: 1.6, blowSet: ["hits", ["bites", "fire"], ["claws", "drain:str"]], spells: { freq: 2, list: ["ball:fire", "ball:dark", "summon:kin", "teleTo", "paralyze"] } }]
]);
// The end of the road: deep below lives what eats the light. Killing it wins the game (the dungeon goes on).
family("boss", "&", { unique: true, boss: true, drop: 1, dropGood: 4, hpK: 3.2, dmgK: 1.0, acK: 1.3, r: 1 }, [
  ["morrowgloom", "Morrowgloom, the Lantern-Eater", 50, C3(0.25, 0.2, 0.35), "A darkness older than the stars, with your torch reflected in a thousand of its eyes.",
    { shape: "horror", evil: true, size: 2.2, speed: 10, res: ["dark", "poison", "cold", "fire"], blowSet: [["engulfs", "eatLight"], ["bites", "dark"], ["grasps", "drainExp"], ["bites", "drain:con"]],
      spells: { freq: 2, list: ["breath:dark", "darkness", "summon:kin", "teleTo", "paralyze", "heal"] } }]
]);
// a unique's kin are its family's kinds near its depth; "summon:kin" for the boss calls shades
FAMILIES.unique = []; FAMILIES.boss = [];
const MON = Object.fromEntries(MONSTERS.map(K => [K.id, K]));
const KIN = { whiskers: "rodent", fenwick: "kobold", snag: "goblin", oldtusk: "beast", bristle: "spider", varn: "brigand", lanternthief: "shade", corvane: "bird", vesper: "priest",
  kettlemaw: "ogre", hollowjack: "ghost", grimsby: "skeleton", brakka: "troll", ysolde: "mage", maulwyrm: "worm", greywidow: "spider", thessaly: "mimic", ironjaw: "golem", palebride: "vampire",
  drownedking: "zombie", rimeheart: "giant", manymouthed: "horror", skarth: "skeleton", emberqueen: "drake", ashvane: "fiend", morrowgloom: "shade" };
for (const K of MONSTERS) if (KIN[K.id]) K.kin = KIN[K.id]; else if (K.fam && !K.town) K.kin = K.fam;
