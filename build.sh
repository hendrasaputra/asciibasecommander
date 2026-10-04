#!/bin/sh
# Rebuilds the single-file pages from src/. core.js is shared by every page; the cartridges also share menu.js,
# arcade.js and the gamepad styles in src/arcade/pad.css.
set -e
cd "$(dirname "$0")"

# page OUT HEAD SCRIPT...: the head (with pad.css put in place of its marker line), then the scripts, as one file
page(){
  out=$1; head=$2; shift 2
  { awk '/<!-- src\/arcade\/pad.css goes here/ { print "<style>"; while ((getline l < "src/arcade/pad.css") > 0) print l; print "</style>"; next } { print }' "$head"
    echo "<script>"; cat "$@"; echo "</script>"; echo "</body></html>"; } > "$out"
}
# game OUT DIR SCRIPT...: a cartridge, built on the engine, the pause menu and the shared arcade code
game(){ out=$1; dir=$2; shift 2; page "$out" "src/$dir/head.html" src/core.js src/menu.js src/arcade.js "$@"; }

page ascii-physics.html src/engine/head.html src/core.js src/engine/ui.js
{ cat src/tutorial/head.html src/tutorial/body.html; echo "<script>"; cat src/tutorial/code.js src/core.js src/tutorial/util.js src/tutorial/demos.js; echo "</script>"; echo "</body></html>"; } > ascii-engine-tutorial.html
game base-commander.html game src/audio/sfx-data.js src/audio/music-data.js src/game/game.js
game rooftop-rumble.html rooftop src/audio/sfx-data.js src/rooftop/game.js
game crater-duel.html crater src/audio/crater-sfx-data.js src/crater/game.js
game stack-smash.html stack src/audio/stack-sfx-data.js src/stack/game.js
game rover-patrol.html rover src/audio/rover-sfx-data.js src/rover/game.js
game torchlight-dungeons.html torch src/torch/rng.js src/torch/fov.js src/torch/turn.js src/torch/gen.js src/torch/data.js src/torch/items.js src/torch/shops.js src/torch/chars.js src/torch/spells.js src/torch/game.js
page settings.html src/settings/head.html src/core.js src/settings/page.js
echo "Built ascii-physics.html, ascii-engine-tutorial.html, base-commander.html, rooftop-rumble.html, crater-duel.html, stack-smash.html, rover-patrol.html, torchlight-dungeons.html and settings.html"
