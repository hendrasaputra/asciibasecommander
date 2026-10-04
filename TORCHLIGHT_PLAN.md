# Torchlight Dungeons: plan

A full-size dungeon crawler after Moria (Robert Koeneke, 1983; C port Umoria). It covers everything Moria has:
races and classes, the town and its shops, deep dungeon levels, about 280 kinds of monster, hundreds of items,
magic and prayers, hunger, identification, and save games.

The game is turn-based on a grid, like Moria. The engine's job is light: a torch in the dark, lit rooms, glowing
monsters, and spell flashes. Physics is the finishing touch, after each turn: rubble, shattering potions, blasts
that shove debris.

The plan runs in ten phases. Phase 1 is the small "Moria-lite" recommended earlier, and it ships to the cartridge
shelf on its own. Each later phase adds one Moria system and ships as an update, so the game is playable at every
step.

## Progress

| Phase | State |
|---|---|
| 0 Groundwork | Done. Field of view, light, the scheduler and levels have node checks in `tests/torch.js`. Light lives in `fov.js` next to field of view, instead of its own `light.js`. Not yet: the "-more-" prompt (long turns show their newest lines, and the full log is under Messages). |
| 1 First descent | Done. On the shelf as an early version: a human fighter, 15 monsters to 500 ft and a little beyond, 16 item kinds, food and light fuel, running and resting, high scores. A playing bot ran thousands of turns without errors. Not checked yet: a full game on a real phone. |
| 2 Races, classes and stats | Done. 8 original peoples and 6 callings, rolled or point-bought stats, 8 skills, infravision, class titles, hit dice and experience penalties; checks for all 48 pairs. Pulled forward so every class plays differently now: each caster's first power (Spark, Mend) with mana and failure chances, a Delver's ambush, a Lampwarden's brighter light, and throwing with direction or nearest-target aiming (from phases 3 and 5). A bot playing each class reached about 225 ft as an Arcanist and 370 ft as a Sellsword or Oathknight. |
| 3 Items and identification | Done. 196 original item kinds (not yet the 300 planned: spell books and digging tools arrive with phases 5 and 7), 23 special kinds and 6 artifacts, 12 equipment slots, weight and burden, bows and ammo, wands, staffs and rods, sticky curses, per-character flavours, learning by use, Identify, and sensing {magical} / {cursed} on pickup and over time. Items you have seen stay on the map. Pulled forward: one set of effect handlers for every item (the base for phase 5's spells), and the first timed effects (speed, heroism, blessing, resistances, poison, confusion, blindness, sleep) from phase 7. Checks: 60,000 items over six depths, flavours, names before and after identifying, and knowledge surviving a JSON round trip. Every kind was used, worn and inspected in the browser without errors. |
| 4 The town | Done. Lanternhollow, a walled town with six shops (General Store, Armoury, Weaponsmith, Temple, Alchemist, Magic Shop), each with a keeper, a markup and staples that never run out; stock changes between visits; buying teaches you an item's kind, and selling makes the keeper tell you what it is. Day and night: by day the sun crosses the sky and buildings cast shadows that move; at night there is faint moonlight and the lamp posts and shop doorways glow. Townspeople, including a cutpurse who steals gold and runs. Word of Recall between the town and your deepest level; level 1 has stairs up; a new character starts in town with gold to spend. Prices are fixed: haggling (open question 1) is left out for now, and there is no home to store things in yet. Checks: 100 towns all reachable, shop goods never cursed or worthless, prices and Charisma, restocking. |
| 5 to 9 | Not started |

## Ground rules

### Licence

Umoria is GPL-3.0, and this project is MIT, so nothing may be copied from it:

- not its C code, nor code translated from it;
- not its data tables (monsters, items, spells, shops), names, descriptions or numbers;
- not anything from Tolkien: no Balrog, mithril, hobbits, Morgoth, or Tolkien's named characters.

Game systems are not protected, so we keep the systems and write all the content ourselves:

- races, classes, light radius, hunger, flavour identification, spell books, shops, and dungeon depth;
- original monsters, items, spells, races and classes, names, numbers and formulas.

We work from general knowledge of how Moria plays, not from its source. Each data file says that it is original.

### What stays like Moria

- Turn-based play on a grid, with a speed system: fast monsters act more often.
- Each trip down the stairs makes a new level, and levels are not kept. This also keeps save files small.
- Permanent death: the save is deleted when the character dies, and a tombstone goes in the hall of fame.
- A town on the surface; the dungeon below gets deeper and harder.
- A final boss deep down, with an original design.

### What the engine adds

| Moria | Torchlight Dungeons |
|---|---|
| A light radius of 1 or 2 squares, on or off | A real light field: a warm flickering torch that fades with distance, lanterns, lit rooms, and coloured light from glowing monsters and spells. Walls block light. |
| Day and night in town | The sun's angle and colour over the town; at night, only lamps |
| Spells print a message | Bolts and balls leave a trail of light, flash the walls around them, and shove debris |
| Rubble is a map symbol | Digging and earthquakes break walls into rubble that bounces and settles, then becomes passable floor |
| Monsters vanish when killed | Each kill bursts into a few tumbling bits in the monster's colour |
| Potions are quaffed | Thrown potions shatter into glass that skitters across the floor |

Physics only runs between turns, as a short animation (under 0.4 s) that any key skips. It never decides the
outcome of a turn, so the turn-based rules stay exact.

## Size of the content

| Content | Target | Notes |
|---|---|---|
| Races | 8 | Original peoples, each with stat changes, infravision, skills and an XP penalty |
| Classes | 6 | Fighter, arcane caster, holy caster, rogue, ranger and holy knight, each with its own name and title per level |
| Character levels | 40 | |
| Dungeon | 50 levels, then deeper with no limit | Shown as depth in feet, like Moria |
| Monsters | about 280 | About 40 families in tiers, plus about 25 named uniques and the final boss |
| Item kinds | about 300 | Weapons, armour, launchers and ammo, light sources, food, potions, scrolls, wands, staffs, rings, amulets, books |
| Special items | about 20 kinds, plus a handful of one-off artifacts | For example "of Slaying", "of Resistance" |
| Spells | 2 realms, about 30 each, in 4 books per realm | Arcane and holy |
| Traps | about 15 | |
| Shops | 6 | General store, armoury, weaponsmith, temple, alchemist, magic shop |

Estimated size: 12,000 to 18,000 lines of JavaScript and data. The page stays self-contained, at about 1.5 MB or less
with sound.

## Architecture

All the code goes under `src/torch/`. `build.sh` joins it into `torchlight-dungeons.html`, after `core.js` and
`menu.js`, the same way as the other games.

| File | Contents |
|---|---|
| `head.html` | Page markup and the touch gamepad |
| `data/*.js` | The tables of races, classes, monsters, items, specials, spells, traps, shops and flavours. Plain data; each file checks itself |
| `rng.js` | Seeded random numbers, so a game can be replayed and tested |
| `gen.js` | Dungeon and town generation |
| `fov.js` | Field of view, by recursive shadowcasting |
| `light.js` | The light field: coloured light from several sources, blocked by walls |
| `turn.js` | The energy and speed scheduler |
| `combat.js` | To-hit, damage dice, armour, criticals, saving throws |
| `monsters.js` | Monster AI and spawning |
| `items.js` | Item generation, identification, inventory and weight |
| `magic.js` | Spell and effect handlers: bolts, balls, beams, detection, teleport and more |
| `town.js` | Shops, stock, prices and day/night |
| `save.js` | Saving, versioning and migration |
| `ui/*.js` | The map view, message log, inventory, character sheet, shop and spell screens, and the command menu |
| `game.js` | The main loop and input |

The map is 198 × 66 cells, like Moria. The screen shows a part of it that scrolls with the player: about 100 × 36
cells on a desktop, and fewer on a phone. The rest of the screen holds the status bar and the message log. All UI
text is drawn on `TEXT_LAYER`, so it stays readable in pixel mode.

## Phases

Phase sizes: S is about the work of one of the existing games, M is two to three times that, and L is more.

### Phase 0: groundwork (M)

The pieces every later phase builds on.

- The scrolling map view, and a test map you can walk around.
- Field of view and the light field. Each square is lit, remembered (seen before and drawn dim), or unknown.
- The torch flickers and lights the walls, and light fades with distance.
- The turn scheduler, with speed and energy.
- Seeded random numbers, and the message log, with "-more-" when messages pile up.
- Input:
  - two key sets: original keys and roguelike (hjkl) keys;
  - an 8-way D-pad on touch;
  - a command menu (for pick up, drink, read, cast and so on), built on the pause menu in `src/menu.js`.
- Node tests: field of view is symmetric, light is blocked by walls, and the scheduler is fair across speeds.

**Done when:** you can walk a test map with a flickering torch, at 60 frames a second on a mid-range phone.

### Phase 1: first descent, the Moria-lite (M)

The first version on the shelf. It is the small game recommended earlier, built on the Phase 0 foundation so
nothing is thrown away.

- **Dungeon generator:**
  - rooms (plain, lit and dark, and a few special shapes) joined by corridors;
  - doors, and stairs up and down;
  - a check that every level is fully connected.
- **Characters:** one race and one class (a human fighter), with hit points, experience and levels.
- **Fighting:** melee with damage dice, armour class, and to-hit rolls.
- **Monsters:** about 15 original kinds, from depth 50 ft to 500 ft. They hunt, flee, and come in packs.
- **Items:** weapons, armour, food, torches, oil flasks, and healing potions. Everything is already identified.
- **Light and food:** the torch burns down and you buy or find new ones. A simple food counter.
- **Death and scores:** a tombstone, and high scores for depth and experience.
- **Physics:** kills burst into bits.

**Done when:** a new player can play a full 20-minute game from the stairs down to death, on keyboard and touch.

### Phase 2: races, classes and stats (M)

- Eight original races and six original classes, each with stat changes, skills and an XP penalty.
- Six stats, rolled or bought with points, and a character sheet.
- Experience up to level 40, a title per level for each class, and hit dice.
- Skills: fighting, shooting, saving throws, stealth, disarming, magic devices, searching and noticing.
- Infravision: seeing warm-blooded monsters in the dark, drawn as a faint red glow in the light field.

**Done when:** each class plays clearly differently in the first 500 ft.

### Phase 3: items and identification (L)

- **Equipment:** weapon, bow, two rings, amulet, light source, body armour, cloak, shield, helmet, gloves and
  boots.
- **Item generation:** about 300 kinds, scaled by depth. Items roll to-hit, damage and armour bonuses, with good
  and bad (cursed) rolls.
- **Specials:** about 20 special kinds, and a few original one-off artifacts.
- **Identification, Moria-style:**
  - each new character gets its own shuffled flavours: potion colours, scroll titles, wand woods, ring stones;
  - an item becomes known by using it, by a scroll or spell, or by selling it;
  - shops show "{magical}" or "{cursed}" when the item has been sensed.
- **Weight:** carrying too much slows you down.
- **Shooting and devices:** launchers and ammo, plus wands, staffs and rods with charges.
- **Physics:** a thrown potion shatters into glass bits.

**Done when:** a node test generates 10,000 items at each depth band, every one valid, and the identification
state survives a save and load.

### Phase 4: the town (M)

- A surface level with six shops, and townspeople who are mostly harmless and sometimes thieves.
- Day and night:
  - by day the sun lights the town from a slowly moving angle;
  - at night only lamps glow, and shop windows show warm light.
- **Shops:**
  - stock is chosen per shop and refreshed while you are in the dungeon;
  - each shop has a keeper with greed and personality;
  - you can buy and sell.
- Stairs between the town and the first level, and a Word-of-Recall-style item that takes you between the town
  and your deepest level.

Haggling (Moria has it) is an option and off by default. See the open questions.

**Done when:** a trip down and back to buy gear is smooth on touch.

### Phase 5: magic and prayers (L)

- **Two realms, about 30 spells each, in four books per realm:**
  - arcane, for the caster, rogue and ranger;
  - holy, for the priest and holy knight.
- **Learning:** spells unlock by level and from books. Each spell has a mana cost and a failure chance that depends
  on the caster's stat.
- **Effects** are one set of handlers, shared with wands, staffs, scrolls and monster spells:
  - bolt, beam, ball and cone;
  - detection, light and darkness;
  - teleport and teleport-to;
  - heal and cure, bless, resistances, slowing and confusing;
  - earthquake, and making or destroying doors and walls.
- **Engine use:**
  - a ball spell's blast shoves debris and flashes light on the walls;
  - Light Room really lights the room in the light field;
  - Darkness takes the light away;
  - earthquakes turn walls into rubble.

**Done when:** every spell has a node test of its effect, and a playtest of each realm reaches 1,000 ft.

### Phase 6: the full bestiary (L)

- A monster data format:
  - character and colour, depth, rarity, speed, and hit dice;
  - armour class, up to four attacks with hit effects, and behaviour flags;
  - spells and breath, what it drops, and its own light, if any.
- About 40 families, each in tiers by depth. Families include vermin, insects, jellies and moulds, snakes, canines,
  goblin-kin, undead, giants, elementals, demons and dragons, all with original names and descriptions. Together
  they come to about 280 kinds.
- **Behaviour:**
  - packs and wandering;
  - erratic movement;
  - fear and fleeing;
  - breeders that multiply;
  - invisibility;
  - passing through walls;
  - stealing and draining.
- Monster spells and breath use the Phase 5 effects. A breath is a cone of coloured light.
- About 25 named uniques with set depths and drops, and the final boss deep below, with an original design.
- **Monster recall:** what you know about each kind, learned by meeting and fighting it.
- **Balance:** a node script that simulates fights for each class and depth band, to catch monsters that are far too
  weak or too strong.

**Done when:** the data validator passes, monster recall works, and no depth band has a monster the
simulation rates as unwinnable at the expected character level.

### Phase 7: survival and dungeon detail (M)

- **Hunger:** full, hungry, weak, fainting, starving. Food kinds differ in how much they feed you.
- **Light:** torches and oil burn down; lanterns are refilled with oil flasks.
- **Status effects:** poison, cuts, stun, blindness, confusion, fear, paralysis, hallucination, and slow and fast.
- **Traps:** about 15 kinds, including trapdoors, pits, darts, summoning runes, teleport, and fire and acid. They are
  found by searching or noticing, and can be disarmed.
- **Doors:** secret doors, and doors that are locked, stuck or jammed. Spikes jam a door shut.
- **Digging:** tunnelling through rubble, magma and quartz veins, with treasure in the veins. Broken rock becomes
  physics rubble.
- **Repeat commands:** resting, running along corridors, and repeated commands.
- **Level feelings.**

**Done when:** a long playtest has no soft-locks, meaning no state where the player cannot act, and none where a
level has no way out.

### Phase 8: save games (M)

- **When it saves:** on every level change, every few hundred turns, when you leave the page or switch tabs, and on
  quit.
- **Slots:** one character per slot, and three slots.
- **Permanent death:** the slot is cleared on death, and the tombstone and character dump go to the hall of fame.
- **Format:** versioned JSON, with a migration step for each version. Because levels are not kept, a save holds
  the character, inventory, flavours, shops, the current level, and the turn count. The target is under 200 KB.
- **Storage:**
  - localStorage, with a clear message when it is full or blocked;
  - export to a file and import from a file, for backups and moving to another device.
- **A text character dump**, like Moria's.
- Node tests: save, load, save again gives the same file; old-version saves still load; a damaged save is refused
  with a message instead of crashing.

### Phase 9: presentation and polish (M)

- **Sound:** `audio/torch-sfx.py`, in the style of the other games:
  - footsteps, hits and misses;
  - a sound for each spell element;
  - monster cries by family;
  - doors and shop bells;
  - town and dungeon ambience;
  - an original music loop for the town, and one for the depths.
- **Help:** an in-game command reference and help screen.
- **Options:** key sets, auto-pickup, "-more-" prompts, haggling, colour-blind-safe status colours, and larger text.
- **Phones:** tuning on a real phone, including the command menu and a quick bar for spells and items.
- **Balance:** a full pass from the town to the final boss.
- **The shelf:** cartridge art from `CARTRIDGE_PROMPT.md`, and README and PLAN.md entries.

## Testing throughout

Every phase leaves node checks next to `tests/physics.js`:

- level connectivity;
- field-of-view symmetry;
- combat expected values;
- data table validation;
- item generation;
- spell effects;
- save round-trips;
- the balance simulation.

Browser tests use the same temporary test-page method as the other games.

## Risks

| Risk | How we deal with it |
|---|---|
| Writing 280 monsters and 300 items is a lot of content | Family templates with tiers, a validator, and a balance simulation. Drafts are generated in bulk and then edited by hand. |
| Copying Moria by accident | Content is written from scratch, never from Umoria's tables. A review step checks names and descriptions against the Tolkien and Moria lists before each release. |
| Too many commands for touch | The command menu, a quick bar, and context actions: tapping an item on the floor picks it up, and moving into a door opens it. |
| Corrupted or lost saves | Versioned saves, migrations, export to a file, and refusing bad data with a message |
| Page size and speed on phones | Data stays as compact tables; light is only recomputed when something changes; physics only runs between turns. |
| Long project | Every phase ships something playable, so stopping after any phase still leaves a good game. |

## Open questions

1. **Haggling:** keep Moria's haggling as an option (proposed: off by default), or leave it out?
2. **Keys:** offer both original and roguelike (hjkl) key sets (proposed), or only one?
3. **Save slots:** three (proposed) or one?
4. **Endgame:** a final boss at a set depth, then an endless dungeon (proposed)? Or end the game when the boss
   falls?
5. **Kept levels:** keep Moria's new level on every trip down the stairs (proposed), or remember levels?
