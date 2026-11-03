# ASCII Physics Engine and Arcade

A small physics engine that draws with characters: lit balls and boxes, 24-bit colour, and soft glow, all made of
text. Five games are built on it so far, plus a sandbox for the engine itself.

**Play online:** https://games.hendrasaputra.com/

Every page is one self-contained HTML file. You can also open it straight from disk, with no server or install.

## The cartridge shelf

`index.html` is the front page: a grid of game cards, two across on a phone, each one a single large link to its
game. The album art is in `cartridges/<id>.jpg`, and `CARTRIDGE_PROMPT.md` has the prompts used to make it; Meadow
Mines' label is a picture of the game itself.

| Game | After | What the engine adds |
|---|---|---|
| [Base Commander](base-commander.html) | Space Invaders / ASCII Alien Attack | Generated waves, 7 enemy types, 6 gun upgrades from airdrops, brick shields, tumbling debris. Pixel art drawn in code: enemies built from lit balls and plates (the Seeker's eye follows your cannon), a supply plane and parachute crates |
| [Rooftop Rumble](rooftop-rumble.html) | QBasic Gorillas | Lobbed fruit with wind; blasts carve buildings into rubble; apes fall when their roof goes. Pixel art drawn in code on a 200 x 224 picture, one city cell per pixel: a night city with lit windows, gorillas built from lit balls, a moon that flinches when hit; blasts punch round holes. Easy, Normal and Hard, with a predicted aiming arc (all of it on Easy, its start on Normal) and a computer that judges its throws like you do |
| [Crater Duel](crater-duel.html) | Scorched Earth | Pixel art drawn in code on a 200 x 224 picture, one ground cell per pixel: tanks after a modern tank, a dusk sky, layered ground with round craters. Hills that collapse after each blast, falling tanks, four weapons. Two to four tanks (people or the computer), money and a shop between rounds (big shots, MIRVs, dirt bombs, fuel, shields), and tanks that drive on fuel |
| [Stack Smash](stack-smash.html) | Tetris, Columns, Puyo Puyo | Pixel art drawn in code: bevelled tiles, cut jewels and round blobs with eyes; cleared lines burst into boxes that land on the stack. T-spins, back-to-back and combos; Versus, where clears send garbage to the other well (against the computer or a second player); and Columns and Puyo games in the same well, with chains |
| [Rover Patrol](rover-patrol.html) | Moon Patrol, Ascii Patrol | Pixel art drawn in code: a moon buggy after the Apollo rover, the turning Earth, shaded hills. Sprung wheels over bumps; shot rocks, UFOs and the rover break into rolling rubble. Hold jump to jump further; ground tanks, rolling boulders and diving fighters further along; start at any checkpoint you have reached |
| [Meadow Mines](meadow-mines.html) | Minesweeper | Pixel art drawn in code: a grass meadow you dig into, numbered dirt, flags. The first dig is always safe; digging a number whose mines are all flagged clears around it; a mine sets the rest off one after another. Easy 9x9, Medium 16x16, Hard 30x16 and Custom (9 to 30 across, 9 to 24 down, up to (width - 1) x (height - 1) mines, as in the Windows game); a long field stands upright on a phone held upright. Best times for the three set sizes. Follows the pixel art rules fully: whole-pixel scaling with black bars, one pixel size, and its text in a 3x5 pixel font at native size |
| [Physics Sandbox](ascii-physics.html) | | The engine itself: throw balls and boxes under a lamp |

All games are original code and art. Rover Patrol takes its idea from msokalski's
[Ascii Patrol](https://github.com/msokalski/ascii-patrol), which is GPL, so nothing is copied from it.
Torchlight Dungeons, a Moria adaptation, began here and has moved to its own project.

### Playing

- **Keyboard:** each game lists its keys on the title screen. Esc or P opens the pause menu, M turns the sound on or
  off, and R restarts.
- **Touch:** the game screen is the controller, as in Pixel Plays' Balote; touch, mouse and keyboard all work at
  once, and the hints follow whichever you used last. Rooftop Rumble and Crater Duel: drag back from anywhere and let
  go to throw or fire (Crater Duel: drag your tank to drive, tap the weapon to change it). Rover Patrol: the right half
  jumps (hold to jump further), the left half fires and slides to change speed. Stack Smash: slide to move, tap to
  turn, drag down to drop faster, flick down to drop, swipe up to hold. Base Commander: the cannon follows your finger
  and fires while you touch. Meadow Mines: tap to dig, hold to flag (the DIG switch at the top swaps them). Title buttons, the shop and the menu are tapped; the header has Menu and Sound buttons,
  and every button is at least 44 pixels tall. On a phone, the menu's rows are spaced out for fingers.
- **Pause menu:** drawn on the game screen. It has resume, restart, the game's own options (Rooftop Rumble's mode and
  difficulty, Crater Duel's mode and number of tanks, Stack Smash's game, opponent and starting level, Rover Patrol's
  starting point, Meadow Mines' field size and custom width, height and mines), sound, the TV filter, and the way back to the shelf.
- **Tube TV filter** (`settings.html`, shared by every game): scanlines, phosphor glow, rounded glass and a faint
  flicker over the game screen.
- **Game feel**, in every game: screen shake, a short freeze on heavy hits, a flash, and sparks, embers, smoke and
  debris.

### Other pages

- `ascii-physics.html`: the Physics Sandbox, with touch physics, lighting and its own display settings.
- `ascii-engine-tutorial.html`: a 14-step tutorial with live demos of how the engine works.

## Editing

Edit the files in `src/`, then run `./build.sh` to rebuild every page. Run `node tests/physics.js` to check the
physics.

- `src/core.js`: shared by every page.
  - Physics (`World`): balls and boxes, a terrain grid, and sensors.
  - Lighting.
  - Ink measurement (`measureInk`, `buildLUT`).
  - The 24-bit renderer (`Screen`), with pixel mode.
  - The shared display settings.

  A change to physics or rendering goes here, so every page stays in step.
- `src/menu.js`: the pause menu, used by every game.
- `src/arcade.js`: everything else the cartridges share: saved settings and high scores, sound (effects and looped
  music), touch (`createTouch`, the header buttons), fitting the canvas to a fixed grid, resizing, the frame loop, and shake, freeze and
  flash (`createFeel`).
- `src/pixel.js`: native pixel art (`createPixels`): a small canvas scaled to fit, shaded balls and plates, lit
  outlines, light, and sharp text and menus over it. All six cartridges draw with it. Meadow Mines, Rooftop Rumble and Crater Duel draw their text into the picture in `PIXEL_FONT`, a 3 x 5 pixel font, at native size, and scale only by whole pixels. The other three still put their text on a coarser grid than the picture (about 6 x 12 pixels a letter) in a smooth font, and scale by a fraction when whole pixels would waste the screen, until they are redrawn smaller.
- `src/fx.js`: the cartridges' particle effects (`createFx`): sparks, embers, smoke, debris and light.
- `src/arcade/pad.css`: the styles every cartridge page shares (layout, header buttons, phone on its side); `build.sh` puts
  it into each page.
- `src/game/`, `src/rooftop/`, `src/crater/`, `src/stack/`, `src/rover/`: each game's page markup (`head.html`) and rules
  (`game.js`).
- `src/engine/`, `src/tutorial/`, `src/settings/`: the sandbox, the tutorial and the settings page.
- `favicon.svg`: the site icon, a cartridge with a lit ball on its label.
- `PLAN.md`: which games come next, and the engine features they need.

## Sound

Base Commander's effects and music come from Sonic Pi:

1. Open `audio/base-commander.rb` in Sonic Pi and set `piece`. Then press Rec, Run and Stop, and save to `audio/raw/`
   as `sfx.wav`, `battle.wav` and `title.wav`. The raw WAVs are not kept in git.
2. Run `python3 audio/process.py` (needs ffmpeg and numpy). It splits and levels the effects, cuts seamless music
   loops, and writes `src/audio/sfx-data.js` and `src/audio/music-data.js`. Rooftop Rumble uses the same effects.

The newer games make their sound in Python, with no recording needed. Each script uses ffmpeg and numpy, and writes
a `src/audio/*-data.js` file:

| Script | Game | Music |
|---|---|---|
| `audio/crater-sfx.py` | Crater Duel, Meadow Mines | none |
| `audio/stack-sfx.py` | Stack Smash | Korobeiniki, a public-domain folk song |
| `audio/rover-sfx.py` | Rover Patrol | an original groove |

Then run `./build.sh`. The sound is embedded, so each page still works offline as one file. Sizes: Base Commander
about 1 MB, Stack Smash 370 KB, Rover Patrol and Rooftop Rumble about 250 KB, Crater Duel and Meadow Mines (which uses its sounds) about 220 KB.

## Saved data

Everything is saved in the browser's localStorage. Nothing is sent anywhere.

| Key | What |
|---|---|
| `arcade.v1.display` | The tube TV filter, shared by the games (its older ASCII and detail choices are no longer used) |
| `asciiPhysics.v3.display` | The sandbox's own display settings |
| `<game>.v1.scores` | High scores (Base Commander, Stack Smash's Classic game, Rover Patrol) |
| `stackSmash.v1.scores.columns`, `stackSmash.v1.scores.puyo` | Stack Smash's Columns and Puyo high scores |
| `meadowMines.v1.level`, `meadowMines.v1.custom`, `meadowMines.v1.best` | Meadow Mines' field size, custom field and best times |
| `rooftopRumble.v1.difficulty` | Rooftop Rumble's difficulty |
| `roverPatrol.v1.furthest` | The furthest checkpoint reached in Rover Patrol, for choosing where to start |
| `<game>.v1.muted` | Sound on or off, per game |

## Notes

- The tutorial loads two fonts from Google Fonts. Offline, it falls back to Georgia and the system monospace font.
- The site is served by GitHub Pages from this repository. The custom domain is in `CNAME`.

## License

MIT. See [LICENSE](LICENSE).
