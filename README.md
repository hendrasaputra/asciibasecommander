# ASCII Physics Engine v0.3

Three self-contained pages. Play online: https://games.hendrasaputra.com/ Open either HTML file in a browser; no server or install needed.

- `ascii-physics.html`: the engine (touch physics, lighting, 24-bit colour, display settings)
- `ascii-engine-tutorial.html`: the 14-step tutorial with live demos
- `settings.html`: display settings shared by the games, saved in localStorage under `arcade.v1.display`: ASCII characters or pixels (text stays readable), the character set, and a tube TV filter. Source in `src/settings/`.
- `index.html`: the cartridge shelf, the site's front page. Pick a cartridge to open its game. Album art lives in `cartridges/<id>.jpg`; prompts for making it are in `CARTRIDGE_PROMPT.md`.
- `stack-smash.html`: Stack Smash, a falling-block puzzle after Tetris: seven pieces from a shuffled bag, SRS turning with wall kicks, hold, ghost piece, three-piece preview, lock delay, levels that speed up every 10 lines. Each block is a lit slab; cleared lines burst into tumbling engine boxes that land on the stack, and at game over the whole stack falls apart. High scores are saved in localStorage under `stackSmash.v1.scores`. Its sound effects and music (Korobeiniki, a public-domain folk song) are synthesised by `audio/stack-sfx.py`.
- `crater-duel.html`: Crater Duel, a tank artillery duel after Scorched Earth: rolling hills that collapse after every blast, tanks that fall and take damage, four weapons (missile, big shot, MIRV, dirt bomb), wind, one player against the computer or two players. Its sound effects are synthesised by `audio/crater-sfx.py`.
- `rooftop-rumble.html`: Rooftop Rumble, an artillery duel after QBasic Gorillas: two apes on a night skyline lob fruit with angle and power against wind; blasts carve the buildings into tumbling rubble. One player against the computer, or two players.
- `base-commander.html`: Base Commander, a fixed-shooter game built on the engine: generated levels, 7 enemy types, 6 gun upgrades from airdropped parts, debris physics, sun-lit shields. High scores are saved in localStorage under `baseCommander.v1.scores`.

## Editing

Edit the files in `src/`, then run `./build.sh` to rebuild all pages.

- `src/core.js`: shared by all pages. Physics (`World`: balls and boxes), lighting, ink measurement (`measureInk`, `buildLUT`), and the 24-bit renderer (`Screen`). Check the physics with `node tests/physics.js`.
- `src/engine/`: engine page markup, styles and UI.
- `src/tutorial/`: tutorial markup, code snippets shown on the page, helpers and demos.
- `src/game/`: the Base Commander page markup and game rules.
- `src/rooftop/`: the Rooftop Rumble page markup and game rules.
- `src/crater/`: the Crater Duel page markup and game rules.
- `src/stack/`: the Stack Smash page markup and game rules.
- `PLAN.md`: what to build next.
- `audio/`: game sound. `base-commander.rb` is the Sonic Pi source for all effects and music.

## Game audio

1. Open `audio/base-commander.rb` in Sonic Pi, set `piece`, then Rec, Run, Stop and save to `audio/raw/` (`sfx.wav`, `battle.wav`, `title.wav`). The raw WAVs are not tracked in git.
2. Run `python3 audio/process.py` (needs ffmpeg and numpy). It splits and levels the effects, cuts seamless music loops, writes MP3s to `audio/sfx/` and `audio/music/`, and generates `src/audio/sfx-data.js` (effects, used by both games) and `src/audio/music-data.js` (Base Commander's music).
3. Run `./build.sh`. The audio is embedded in `base-commander.html`, so each page still works offline as a single file: Base Commander about 1 MB, Rooftop Rumble about 270 KB (effects only).

A change to physics or rendering goes in `core.js`, so all pages stay in sync.

## Notes

- The tutorial loads two fonts from Google Fonts. Offline, it falls back to Georgia and the system monospace font.
- The engine saves display settings in the browser's localStorage under `asciiPhysics.v3.display`.

## License

MIT. See [LICENSE](LICENSE).
