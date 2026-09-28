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

A change to physics or rendering goes in `core.js`, so all pages stay in sync.

## Notes

- The tutorial loads two fonts from Google Fonts. Offline, it falls back to Georgia and the system monospace font.
- The engine saves display settings in the browser's localStorage under `asciiPhysics.v3.display`.
