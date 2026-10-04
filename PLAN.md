# Plan

What to build next on the ASCII physics engine, and the engine work each step needs.
Game ideas come from [awesome-ttygames](https://github.com/ligurio/awesome-ttygames) (363 terminal games) and
QBasic Gorillas ([source](https://github.com/SWO-GS/gorillas/blob/master/gorillas.bas)); names in `code` are the
entries there.

## Engine strengths to play to

Round and box bodies under gravity with bounce, friction, spin and drag; stacking; radial push forces; static
bodies that can be destroyed (Base Commander's shields); debris; a point light with shadows; 24-bit colour.
Games where these features are the gameplay fit best; grid-only games gain little.

## Order

| # | Game | Why it fits | New engine work |
|---|---|---|---|
| 1 | Rooftop Rumble (working title), after QBasic Gorillas | Two players on a night skyline throw a spinning projectile with angle and speed against gravity and wind; blasts punch holes in buildings; lit windows and blast flashes light the city | Destructible terrain grid |
| 2 | Scorched Earth (`gorched`, `shell-tanks`) | The bigger sibling of #1: tanks, weapons, ground that slides down after a blast | None beyond the terrain grid from #1 |
| 3 | Lunar Lander (`Lunar Landing`, `landing-rust`) | One box body: thrust against gravity, a safe landing depends on speed and angle; the engine flame lights the ground | None beyond the terrain grid |
| 4 | Bombardier (`bombardier`) | A plane sinks a row each pass while bombing towers built from stacked boxes, which topple and scatter | None: box stacking exists |
| 5 | Asteroids (`just-asteroids`) | Round rocks bounce off each other and split | Screen edges that wrap around |
| 6 | Missile Command (`miscom`) | Expanding blasts push missiles and debris; blast flashes light the cities | None: reuses Base Commander's effects |
| 7 | Moon Patrol (`moon-buggy`, `ASCII patrol`) | A buggy on sprung wheels bounces over craters and jumps | Spring joints; a scrolling camera |
| 8 | Bowling (`bowling`), top-down | Ball and pins are circles; scatter and spin come for free | A curve force from ball spin |
| 9 | Xonix (`conix`, `xonitix`) | Enemies are balls bouncing inside the open area; claimed ground becomes static boxes they bounce off | None |

Rooftop Rumble comes first because it is the smallest artillery game: the city never moves, and players only aim.
Scorched Earth then reuses its terrain, aiming, wind and explosions. Lunar Lander and Bombardier are small and need
no new engine work, so they are good quick wins between larger games.

## 1. Rooftop Rumble (after QBasic Gorillas)

The original (`gorillas.bas`, QBasic Gorillas 1.0 © 1990 Microsoft, 2.2 by Daniel Beardsmore) has no licence in
that repository. Reimplement the idea with our own code, art and name; copy nothing from the source.

What the original does, and how it maps to the engine:

| Original | Here |
|---|---|
| Random skyline: buildings of random width and height, following one of four slopes (up, down, V, inverted V) | Same rule; buildings are cells in a destructible terrain grid |
| Windows randomly lit or dark | Lit windows are small light sources: a night city lit from inside |
| Each turn a player types an angle and a speed | Angle and power with the keyboard or the touch D-pad; a dotted arc preview on easy |
| Gravity (adjustable, default 17) and a wind arrow, fixed per round | Gravity and sideways gravity for wind, already in the engine |
| The thrown banana spins | A spinning box or capsule body; real spin from the throw |
| A blast punches a round hole in a building | Remove the terrain cells in the blast radius; they fall as box debris; the push force throws nearby debris |
| Hitting a player blows them up and scores a point; you can hit yourself | Same |
| A sun that looks shocked when hit, otherwise smiles | A moon that flinches when hit; it is the scene's lamp |
| A shot that hits the street bounces once | Engine bounce off the floor, with the material's restitution |
| First to N wins, then a victory dance | Same; add a computer opponent that aims from the last miss |

First playable slice:

1. Skyline generation, two players on rooftops, turn order.
2. Aim with angle and power, throw, wind shown in the HUD.
3. Blasts carve buildings and fall as debris; hits score.
4. Night lighting from windows and blast flashes.

## 2. Scorched Earth (artillery)

Builds on #1. Shells are bodies under gravity and drag, wind is sideways gravity, explosions are the existing push
force, and the ground is the same destructible terrain grid. A light can ride on the shell to light and shadow the
terrain. Turn-based, so CPU stays low.

Adds over #1: tanks that sit on and slide with the ground, ground that falls after a blast, several weapons,
health, an AI opponent, night levels.

## Engine work, shared between games

Build each once, in `core.js`, so every page gets it.

| Feature | Used by | Notes |
|---|---|---|
| Destructible terrain grid | Rooftop Rumble, Scorched Earth, Lunar Lander, Moon Patrol | A grid of solid cells that bodies collide with as fixed boxes, checked only near each moving body, with cells removable by blasts. Unlike a heightmap it allows holes and overhangs, which Rooftop Rumble's buildings need. Storing terrain as cells, not bodies, keeps it fast: a screen of terrain bodies (about 2,000) would make shadows too slow. |
| Wrap-around edges | Asteroids | A World option: bodies leaving one edge appear at the other, instead of bouncing. |
| Spring joints | Moon Patrol; also ragdolls and chains | A spring with damping between two points on two bodies. |
| Scrolling camera | Moon Patrol, longer Lunar Lander maps | Draw the world offset from the screen; physics unchanged. |
| Compound bodies | Physics Tetris, Katamari (`katamascii`) | Several shapes rigidly joined into one body. Not planned yet. |

## Grid puzzle games: Tetris, Columns, Puyo, match-3

Keep the normal grid rules. The engine draws the pieces as lit blocks and turns cleared lines into tumbling
debris.

- Tetris (`vitetris` and others), Columns (`TinyCols`) and match-3 games (`terminal_gem_match`, `Behacked`,
  `clines`) use **box shapes**.
- Puyo (`Puyo on Vim`) pieces are round, so they use circles.
- Not planned: physics Tetris where pieces tumble freely. That needs compound bodies.

## Skipped

- Card, board, word and number games, Minesweeper, Sudoku: the physics and lighting add nothing.
- Roguelikes. Torchlight Dungeons, a full adaptation of Moria, started here as a cartridge and moved to its own
  project after its phase 7.
- Boulder Dash, Pac-Man, Snake, Tron light cycles, Frogger: grid rules decide everything.
- Platform games (`0verkill`, `PAG`, `venzone`): need a character controller, which fights a physics engine.
- Racing (`zracer`, `ztrack`) and skiing (`ski`, `gnuski`, `asciijump`): need tyre or snow friction that the
  engine doesn't model; little gain over plain rules.
- Breakout (`arkanoid-*`, `Bricks`) and other Space Invaders clones: would mostly repeat Base Commander.
- Two-player space shooters (`astwar`, `matanza`, `spacezero`): Asteroids covers the same physics.

## Done

- Base Commander (fixed shooter): generated levels, enemy types, gun upgrades, airdrops, audio, touch gamepad.
- Rooftop Rumble, first playable version: skyline generation, aiming, wind, carving blasts with rubble, falling apes,
  a computer opponent, first to 3, sound. Not yet: an aiming arc preview, difficulty levels.
- Crater Duel (after Scorched Earth), first playable version: rolling hills, dirt that falls after blasts, tanks that
  fall and take damage, four weapons, health, wind, a computer opponent, synthesised sound. Not yet: more than two
  tanks, a weapon shop between rounds, moving tanks.
- Stack Smash (after Tetris), first playable version: 7-bag, SRS turning and wall kicks, hold, ghost, preview,
  lock delay, levels, high scores, touch gamepad, synthesised effects and music. Cleared lines and the topped-out
  stack break into engine boxes. Not yet: T-spin and combo scoring, a two-player garbage mode, Columns and Puyo.
- Rover Patrol (after Moon Patrol and Ascii Patrol), first playable version: speed control, jumping, twin
  forward/up cannon, craters, rocks, mines, UFO waves whose bombs dig new craters, checkpoints A to Z with time
  bonuses, high scores, synthesised sound and music. Not yet: ground tanks, rolling boulders, alien fighters that
  dive, a starting-point choice. The wheel suspension lives in the game, not as engine spring joints, and the
  scrolling camera shifts the rubble by whole columns as the ground scrolls.
- Torchlight Dungeons, phases 0 and 1 (since moved to its own project): a torch-lit dungeon crawl after
  Moria, with symmetric field of view, a light field with shadows, glowing monsters, lit rooms, and a speed scheduler.
- Engine: box shapes, destructible terrain grid, sensors, open top; checks in `tests/physics.js`.
