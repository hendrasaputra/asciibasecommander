# ASCII Physics Engine v0.3

Three self-contained pages. Open either HTML file in a browser; no server or install needed.

- `ascii-physics.html`: the engine (touch physics, lighting, 24-bit colour, display settings)
- `ascii-engine-tutorial.html`: the 14-step tutorial with live demos
- `base-commander.html`: Base Commander, a fixed-shooter game built on the engine: generated levels, 7 enemy types, 6 gun upgrades from airdropped parts, debris physics, sun-lit shields. High scores are saved in localStorage under `baseCommander.v1.scores`.

## Editing

Edit the files in `src/`, then run `./build.sh` to rebuild all pages.

- `src/core.js`: shared by both pages. Physics (`World`), lighting, ink measurement (`measureInk`, `buildLUT`), and the 24-bit renderer (`Screen`).
- `src/engine/`: engine page markup, styles and UI.
- `src/tutorial/`: tutorial markup, code snippets shown on the page, helpers and demos.
- `src/game/`: the Base Commander page markup and game rules.
- `audio/`: game sound. `base-commander.rb` is the Sonic Pi source for all effects and music.

## Game audio

1. Open `audio/base-commander.rb` in Sonic Pi, set `piece`, then Rec, Run, Stop and save to `audio/raw/` (`sfx.wav`, `battle.wav`, `title.wav`). The raw WAVs are not tracked in git.
2. Run `python3 audio/process.py` (needs ffmpeg and numpy). It splits and levels the effects, cuts seamless music loops, writes MP3s to `audio/sfx/` and `audio/music/`, and generates `src/game/audio-data.js`.
3. Run `./build.sh`. The audio is embedded in `base-commander.html`, so the page still works offline as a single file (about 1 MB).

A change to physics or rendering goes in `core.js`, so all pages stay in sync.

## Notes

- The tutorial loads two fonts from Google Fonts. Offline, it falls back to Georgia and the system monospace font.
- The engine saves display settings in the browser's localStorage under `asciiPhysics.v3.display`.

## License

MIT. See [LICENSE](LICENSE).
