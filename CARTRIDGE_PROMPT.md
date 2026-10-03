# Cartridge album art prompts

Prompts for making the label art on the cartridge shelf (`index.html`) with ChatGPT's image generation.

## How to use

1. In ChatGPT, paste the **shared style** paragraph followed by one game's **scene** paragraph, as one message.
2. Ask for a **square image (1024 × 1024)**. The label is square; other shapes get cropped to the centre.
3. Regenerate until you like it. If it adds text or logos, reply: "Same image, remove all text and logos."
4. Save it as `cartridges/originals/<id>.png`, using the id listed with each game. That folder stays on your
   computer only (git ignores it).
5. Make the small copy the shelf loads, 512 px and about 50 KB, or ask me to:

   ```bash
   sips -s format jpeg -s formatOptions 82 -Z 512 cartridges/originals/<id>.png --out cartridges/<id>.jpg
   ```

   The shelf shows `cartridges/<id>.jpg` automatically; until it exists the cartridge shows its ASCII label.

The game's name is printed on the cartridge under the art, so the art itself must not contain text.

## Shared style (paste first, every time)

> Square cartridge label illustration for a retro handheld video game, in the style of late-1980s game box art
> repainted with modern lighting. The whole image is built from glowing ASCII text characters (such as # @ % + = - : .)
> on a near-black background, the way a colour terminal draws pictures: denser characters for brighter areas,
> sparse dots for dim ones. Vivid 24-bit colours, a soft glow around bright characters, and one strong light from
> the upper left casting clear shadows. Bold, readable silhouettes that still read at thumbnail size. Centred
> composition with a little empty margin at the edges. No text, no letters, no numbers, no logos, no brand names,
> no console hardware, no frame or border.

## Base Commander

Id: `base-commander` (done)

> Scene: a fixed-shooter space battle seen from the ground. Rows of small alien invaders fill the top half,
> each built from ASCII characters, in distinct colours: magenta, cyan, lime green, yellow, orange, violet and red.
> At the bottom centre a small gold cannon fires a thin cyan bolt upward. Between them stand four low green
> shield bunkers, cracked and partly blasted away. Several bright red laser lines rain down from the aliens; they
> are the brightest, most saturated thing in the picture. One alien bursts into dim grey-brown debris that tumbles
> and bounces. In the top corner a small supply plane drops a crate on a parachute. Deep starfield behind.
> Mood: tense, heroic, last stand.

## Physics Sandbox

Id: `physics-sandbox`

> Scene: a dark room seen from above, with a single warm lamp glowing in the upper left. Glossy balls and
> bevelled blocks in different materials tumble, bounce and pile up on the floor: soft teal foam balls, blue and
> pink rubber balls, and small shiny steel balls with sharp highlights, plus a few rectangular blocks caught mid-tip.
> Every object is shaded like a 3D sphere or slab but drawn entirely in ASCII characters, and each casts a soft
> shadow away from the lamp. A pool of warm light spreads across the floor and fades into darkness at the edges.
> A couple of fast balls leave short streak trails. Mood: playful, curious, tactile.

## Rooftop Rumble

Id: `rooftop-rumble`

> Scene: a night city skyline of tall rectangular buildings with rows of windows, some lit warm yellow and some
> dark. On two rooftops far apart, two big cartoonish apes face each other. One has just thrown a spinning yellow
> banana high across the sky, leaving a dotted arc. A building in the middle has a round bite blasted out of its
> side, with blocks tumbling down. A large round moon with a surprised face watches from the top and lights the scene. A small arrow-like
> streak shows the wind. Mood: comic duel, cheeky.

## Crater Duel

Id: `crater-duel`

> Scene: a tank artillery duel at dusk over rolling hills of layered soil: a thin green topsoil edge, brown dirt and
> grey rock below, all drawn as granular ASCII characters. A low, glowing orange sun sits near the horizon in the
> upper right and lights everything from the side. On the left hill a small chunky tank in warm orange fires; its
> shell arcs high across the sky in a dotted trail, splitting into five falling warheads. On the right hill a small
> tank in cool cyan braces. Between them, a fresh crater has been blasted out of the hillside, with clods of dirt
> tumbling down into it and a bright warm flash lighting the ground around the blast. Both tanks are original,
> simple designs, not based on any existing game. Mood: tense standoff, explosive.

## Next cartridges

When a game from [PLAN.md](PLAN.md) ships, write its scene from what was actually built.

### Template for a new game

Id: `<game-id>` (the game page's file name without `.html`)

> Scene: [the moment that best shows the game, in one sentence]. [The player's object, where it is and what it
> is doing]. [The threat or goal, and its colours]. [One physics moment: something bouncing, tumbling, toppling
> or exploding]. [What the light falls on, and where the shadows go]. Mood: [two or three words].

Then add the game to `index.html`: copy one `<a class="cart">` block and change its link, id, image path, title
and tagline. Replace its ASCII `<pre>` art with a few lines from the game, or keep the block's art until you have
an image.
