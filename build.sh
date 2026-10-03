#!/bin/sh
# Rebuilds the single-file pages from src/. core.js is shared by both.
set -e
cd "$(dirname "$0")"
{ cat src/engine/head.html; echo "<script>"; cat src/core.js src/engine/ui.js; echo "</script>"; echo "</body></html>"; } > ascii-physics.html
{ cat src/tutorial/head.html src/tutorial/body.html; echo "<script>"; cat src/tutorial/code.js src/core.js src/tutorial/util.js src/tutorial/demos.js; echo "</script>"; echo "</body></html>"; } > ascii-engine-tutorial.html
{ cat src/game/head.html; echo "<script>"; cat src/core.js src/menu.js src/audio/sfx-data.js src/audio/music-data.js src/game/game.js; echo "</script>"; echo "</body></html>"; } > base-commander.html
{ cat src/rooftop/head.html; echo "<script>"; cat src/core.js src/menu.js src/audio/sfx-data.js src/rooftop/game.js; echo "</script>"; echo "</body></html>"; } > rooftop-rumble.html
{ cat src/crater/head.html; echo "<script>"; cat src/core.js src/menu.js src/audio/crater-sfx-data.js src/crater/game.js; echo "</script>"; echo "</body></html>"; } > crater-duel.html
{ cat src/settings/head.html; echo "<script>"; cat src/core.js src/settings/page.js; echo "</script>"; echo "</body></html>"; } > settings.html
echo "Built ascii-physics.html, ascii-engine-tutorial.html, base-commander.html, rooftop-rumble.html, crater-duel.html and settings.html"
