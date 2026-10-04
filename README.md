# ASCII Physics Engine and Arcade

A small physics engine that draws with characters: lit balls and boxes, 24-bit colour, and soft glow, all made of
text. Seven games are built on it so far.

**Play online:** https://games.hendrasaputra.com/

Every page is one self-contained HTML file. You can also open it straight from disk, with no server or install.

## The cartridge shelf

`index.html` is the front page: a shelf of game cartridges. Click one to open its game. The album art is in
`cartridges/<id>.jpg`, and `CARTRIDGE_PROMPT.md` has the prompts used to make it. A cartridge with no image shows an
ASCII label instead.

| Game | After | What the engine adds |
|---|---|---|
| [Base Commander](base-commander.html) | Space Invaders / ASCII Alien Attack | Generated waves, 7 enemy types, 6 gun upgrades from airdrops, sun-lit shields, tumbling debris |
| [Rooftop Rumble](rooftop-rumble.html) | QBasic Gorillas | Lobbed fruit with wind; blasts carve buildings into rubble; apes fall when their roof goes |
| [Crater Duel](crater-duel.html) | Scorched Earth | Hills that collapse after each blast, falling tanks, four weapons |
| [Stack Smash](stack-smash.html) | Tetris | Blocks as lit slabs; cleared lines burst into boxes that land on the stack |
| [Rover Patrol](rover-patrol.html) | Moon Patrol, Ascii Patrol | Sprung wheels over bumps; shot rocks, UFOs and the rover break into rolling rubble |
| [Physics Sandbox](ascii-physics.html) | | The engine itself: throw balls and boxes under a lamp |

All games are original code and art. Rover Patrol takes its idea from msokalski's
[Ascii Patrol](https://github.com/msokalski/ascii-patrol), which is GPL, so nothing is copied from it.
Torchlight Dungeons, a Moria adaptation, began here and has moved to its own project.

### Playing

- **Keyboard:** each game lists its keys on the title screen. Esc or P opens the pause menu, M turns the sound on or
  off, and R restarts.
- **Touch:** a handheld-style gamepad with a D-pad, A/B, SELECT and START. On a phone it shows up by itself; choose
  between touch and keyboard in the pause menu. On a phone held sideways, the D-pad and buttons move to the sides.
- **Pause menu:** drawn on the game screen. It has resume, restart, game options (difficulty, mode or starting
  level), sound, controls, display settings, and the way back to the shelf.
- **Display settings** (`settings.html`, shared by every game): draw with ASCII characters or solid pixels (text
  stays readable either way), pick the character set, choose the detail, and turn on a tube TV filter. Detail (Fine
  2x, Finest 3x) draws the engine's lit balls, boxes, blocks, rubble and light with smaller characters or pixels, while
  game text and sprites keep their size.

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
  music), the touch gamepad, fitting the canvas to a fixed grid, resizing, and the frame loop.
- `src/arcade/pad.css`: the styles every cartridge page shares (layout, gamepad, phone on its side); `build.sh` puts
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
| `audio/crater-sfx.py` | Crater Duel | none |
| `audio/stack-sfx.py` | Stack Smash | Korobeiniki, a public-domain folk song |
| `audio/rover-sfx.py` | Rover Patrol | an original groove |

Then run `./build.sh`. The sound is embedded, so each page still works offline as one file. Sizes: Base Commander
about 1 MB, Stack Smash 370 KB, Rover Patrol and Rooftop Rumble about 250 KB, Crater Duel 220 KB.

## Saved data

Everything is saved in the browser's localStorage. Nothing is sent anywhere.

| Key | What |
|---|---|
| `arcade.v1.display` | Display settings shared by the games |
| `asciiPhysics.v3.display` | The sandbox's own display settings |
| `<game>.v1.scores` | High scores (Base Commander, Stack Smash, Rover Patrol) |
| `<game>.v1.muted`, `<game>.v1.controls` | Sound on or off, touch or keyboard, per game |

## Notes

- The tutorial loads two fonts from Google Fonts. Offline, it falls back to Georgia and the system monospace font.
- The site is served by GitHub Pages from this repository. The custom domain is in `CNAME`.

## License

MIT. See [LICENSE](LICENSE).
