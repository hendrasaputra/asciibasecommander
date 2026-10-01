# Plan

What to build next on the ASCII physics engine, and the engine work each step needs.

## Engine strengths to play to

Round bodies under gravity with bounce, friction, spin and drag; radial push forces; static bodies that can be
destroyed (Base Commander's shields); debris; a point light with shadows; 24-bit colour. Box shapes are being
added (see below). Games where these features are the gameplay fit best; grid-only games gain little.

## Next game: Scorched Earth (artillery)

Source idea: `gorched` / `shell-tanks` from [awesome-ttygames](https://ligurio.github.io/awesome-ttygames/).

Why: shells are bodies under gravity and drag, wind is sideways gravity, explosions are the existing push force,
and terrain is destructible static bodies. A light can ride on the shell to light and shadow the terrain.
Turn-based, so CPU stays low.

First playable slice:

1. Two tanks, angle and power control, fire.
2. Wind (sideways gravity), shown in the HUD.
3. Destructible ground; explosions carve it and push debris and tanks.
4. Light follows the shell in flight.

Later: turn order and health, several weapons, an AI opponent, night levels.

Engine work needed:

- **Heightmap ground** in `core.js`: a ground height per column that bodies rest on and that explosions lower.
  Keep static blocks only near the surface. A full screen of terrain blocks (about 2,000 bodies) would make
  shadows too slow.

## Runners-up

| Game | Fit | Engine work |
|---|---|---|
| Asteroids (`just-asteroids`) | Rocks are round bodies that bounce off each other and split | Screen edges that wrap around instead of bouncing |
| Bowling (`bowling`), top-down | Ball and pins are circles; scatter and spin come for free | A curve force from ball spin; lane walls |

## Grid puzzle games: Tetris, Columns, Puyo

Keep the normal grid rules. The engine draws the pieces as lit blocks and turns cleared lines into tumbling
debris.

- Tetris and Columns use **box shapes** (added to the engine).
- Puyo pieces are round, so they use circles.
- Not planned: physics Tetris where pieces tumble freely. That needs compound bodies (several boxes joined into
  one piece).

## Skipped

Roguelikes, card, word and number games, Minesweeper, Sudoku: the physics and lighting add nothing.
Boulder Dash, Pac-Man, Snake: grid rules decide everything. Breakout: would mostly repeat Base Commander.

## Done

- Base Commander (fixed shooter): generated levels, enemy types, gun upgrades, airdrops, audio, touch gamepad.
