/* ---------- shared by the game pages: saved settings, sound, the touch gamepad, fitting the canvas, the loop ---------- */
// Built into every cartridge after core.js and menu.js. Each game keeps only its own rules and drawing.

// Saved settings for one game, under "<prefix><key>" in localStorage. Values are strings; *JSON for anything else.
function prefs(prefix, label){
  return {
    get(k, d = null){ try { const v = localStorage.getItem(prefix + k); return v === null ? d : v; } catch (e){ return d; } },
    set(k, v){ try { localStorage.setItem(prefix + k, v); return true; } catch (e){ console.warn(label + ": could not save " + k, e); return false; } },
    getJSON(k, d){ const v = this.get(k); if (v === null) return d; try { return JSON.parse(v); } catch (e){ console.warn(label + ": saved " + k + " unreadable, using defaults", e); return d; } },
    setJSON(k, v){ return this.set(k, JSON.stringify(v)); }
  };
}
// A saved top-n list. add() returns the new entry's rank (0 is best) and whether saving worked.
function scoreTable(store, n = 5, key = "scores", better = (a, b) => b.score - a.score){
  const list = store.getJSON(key, []);
  return { list, add(entry){ list.push(entry); list.sort(better); list.length = Math.min(list.length, n); return { rank: list.indexOf(entry), saved: store.setJSON(key, list) }; } };
}

// Sound from base64 MP3s. Browsers only allow audio after a user gesture, so nothing is decoded until unlock().
// sounds: { name: base64 }; music: { name: { data, loopStart, loopEnd } }, looped between margins cut from the
// recording so MP3 padding never lands inside the loop. vol: per-sound gain (volume for the rest). minGap: seconds within which a
// sound plays only once (a volley from many enemies still makes one sound). The mute choice is saved.
function createAudio({ label, store, sounds, music = {}, vol = {}, volume = 0.6, sfxGain = 0.9, musicGain = 0.5, minGap = 0 }){
  let ctx = null, master = null, sfxBus = null, musicBus = null, unlocked = false, waiting = null, song = null, songNode = null;
  let muted = store.get("muted") === "1";
  const buffers = {}, lastPlayed = {};
  function startSong(){
    const b = song && buffers["music:" + song]; if (!ctx || !b || songNode) return;
    const M = music[song], src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; src.loop = true; src.loopStart = M.loopStart; src.loopEnd = M.loopEnd;
    src.connect(g); g.connect(musicBus); src.start(0, M.loopStart); src.g = g; songNode = src;
  }
  const A = {
    get unlocked(){ return unlocked; }, get muted(){ return muted; },
    unlock(){
      if (unlocked) return;
      unlocked = true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC){ console.warn(label + ": Web Audio not supported, playing silent"); return; }
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.gain.value = sfxGain; sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = musicGain; musicBus.connect(master);
      const decode = (key, b64, done) => ctx.decodeAudioData(Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer,
        b => { buffers[key] = b; done(); }, e => console.warn(label + ": could not decode sound", key, e));
      for (const [k, v] of Object.entries(sounds)) decode(k, v, () => { if (k === waiting){ waiting = null; A.play(k); } });   // the first tap may start a sound before it is decoded
      for (const [k, v] of Object.entries(music)) decode("music:" + k, v.data, () => { if (k === song) startSong(); });
    },
    play(name, pan){   // pan: sweep from -pan to +pan over the sound
      if (muted || !ctx) return;
      const b = buffers[name]; if (!b){ waiting = name; return; }
      const now = ctx.currentTime;
      if (minGap && now - (lastPlayed[name] ?? -1) < minGap) return;
      lastPlayed[name] = now;
      const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = b; g.gain.value = vol[name] ?? volume;
      src.connect(g);
      if (pan && ctx.createStereoPanner){
        const p = ctx.createStereoPanner(); p.pan.setValueAtTime(-pan, now); p.pan.linearRampToValueAtTime(pan, now + b.duration);
        g.connect(p); p.connect(sfxBus);
      } else g.connect(sfxBus);
      src.start();
    },
    music(name){   // switch to a song (fading the old one out); null stops the music
      if (song === name) return;
      song = name;
      if (songNode){ songNode.g.gain.setTargetAtTime(0, ctx.currentTime, 0.3); songNode.stop(ctx.currentTime + 1.5); songNode = null; }
      startSong();
    },
    toggleMute(){
      A.unlock(); muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
      store.set("muted", muted ? "1" : "0");
    },
    pause(){ if (ctx) ctx.suspend(); }, resume(){ if (ctx) ctx.resume(); }
  };
  return A;
}

// The handheld-style touch gamepad (#gamepad, #dpad and [data-pad] buttons in the page), or the keyboard.
// The D-pad is one surface: the thumb's angle from its centre picks the direction, so sliding across switches.
// axis: "x" (left and right only), 4, or 8 directions. While menu() returns an open menu, the D-pad moves through
// it and A chooses (any other button closes it). Otherwise onDir(dir) hears every change ("" when let go),
// onPress(id) and onRelease(id) the buttons, and onAny() any touch at all (games unlock their sound with it).
function createPad({ store, axis = 4, menu = () => null, onDir = () => {}, onPress = () => {}, onRelease = () => {}, onAny = () => {} }){
  const pad = document.getElementById("gamepad"), dpad = document.getElementById("dpad");
  let touch = matchMedia("(pointer: coarse)").matches;   // default follows the device; the menu's Controls row overrides it
  const saved = store.get("controls"); if (saved) touch = saved === "touch";
  const buzz = () => navigator.vibrate && navigator.vibrate(8);   // a tick of feedback on phones that support it
  const P = {
    get touch(){ return touch; },
    set(t, save){ touch = t; document.body.classList.toggle("touch", t); pad.hidden = !t; if (save) store.set("controls", t ? "touch" : "keyboard"); },
    toggle(){ P.set(!touch, true); }
  };
  P.set(touch, false);
  const NAMES8 = ["right", "downright", "down", "downleft", "left", "upleft", "up", "upright"];
  function dirAt(e, mode){
    const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    if (mode === "x") return Math.abs(dx) < r.width * 0.1 ? "" : dx < 0 ? "left" : "right";
    if (Math.hypot(dx, dy) < r.width * 0.1) return "";
    if (mode === 8) return NAMES8[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : (dy < 0 ? "up" : "down");
  }
  let dir = "";
  function at(e){
    const m = menu(), d = dirAt(e, m ? 4 : axis);
    if (d === dir) return;
    dir = d; dpad.dataset.dir = d.includes("left") ? "left" : d.includes("right") ? "right" : d;
    if (d) buzz();
    if (m){ if (d) d === "up" ? m.move(-1) : d === "down" ? m.move(1) : m.change(d === "left" ? -1 : 1); return; }   // in a menu: one step per push
    onDir(d);
  }
  dpad.addEventListener("pointerdown", e => { e.preventDefault(); dpad.setPointerCapture(e.pointerId); onAny(); at(e); });
  dpad.addEventListener("pointermove", e => { if (dpad.hasPointerCapture(e.pointerId)) at(e); });
  for (const ev of ["pointerup", "pointercancel"]) dpad.addEventListener(ev, () => { dir = ""; dpad.dataset.dir = ""; if (!menu()) onDir(""); });
  document.querySelectorAll("[data-pad]").forEach(b => {
    const id = b.dataset.pad;
    b.addEventListener("pointerdown", e => {
      e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add("on"); buzz(); onAny();
      const m = menu();
      if (m){ id === "a" ? m.choose() : m.hide(); return; }
      onPress(id);
    });
    const up = () => { b.classList.remove("on"); onRelease(id); };
    b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up);
  });
  return P;
}

// The short names every game draws with, on whichever screen get() returns (it changes when the page is re-fitted).
function pen(get){
  return { put: (gx, gy, rgb, k, layer, glyph) => get().cell(gx, gy, rgb, k, layer, glyph), text: (gx, gy, s, rgb) => get().text(gx, gy, s, rgb),
    center: (gy, s, rgb) => get().center(gy, s, rgb), sprite: (art, x, y, rgb, k, layer) => get().sprite(art, x, y, rgb, k, layer) };
}
// Sizes the canvas to w x h CSS pixels (scaled down by k < 1 if it must shrink to fit) and the drawing to the device.
function sizeCanvas(cv, ctx, w, h, dpr, k = 1){
  cv.style.width = w + "px"; cv.style.height = h + "px";
  cv.style.transform = "translate(-50%,-50%)" + (k < 1 ? " scale(" + k + ")" : "");
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
// A screen for a game whose rules run on a fixed gw x gh grid: the largest font whose grid fits the stage. Below 5px
// text is unreadable, so a tiny stage (a phone on its side) scales the canvas down instead. null if the stage is hidden.
function fitGrid(stage, cv, ctx, D, gw, gh){
  const r = stage.getBoundingClientRect(); if (!r.width) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  let screen;
  for (let f = Math.max(5, Math.ceil(Math.min(r.width / gw / 0.5, r.height / gh / 1.15))); ; f--){
    screen = new Screen(f, D); screen.fit(r.width, r.height, dpr);
    if ((screen.cols >= gw && screen.rows >= gh) || f <= 5) break;
  }
  const W = gw * screen.cw, H = gh * screen.ch;
  screen.fit(W, H, dpr);
  sizeCanvas(cv, ctx, W, H, dpr, Math.min(1, r.width / W, r.height / H));
  return screen;
}
// After a re-fit, bodies keep their place on the grid: scale them by the change in cell size.
function rescaleBodies(world, old, screen){
  if (!old) return;
  const kx = screen.cw / old.cw, ky = screen.ch / old.ch;
  for (const b of world.bodies){ b.x *= kx; b.y *= ky; b.r *= kx; if (b.box){ b.hw *= kx; b.hh *= kx; if (b.hw0){ b.hw0 *= kx; b.hh0 *= kx; } } if (b.r0) b.r0 *= kx; }
}
// Calls fn after real size changes (rotation, window resize), not the mobile address bar sliding in and out,
// which would make the game jump while you play.
function onResize(stage, fn){
  let fitted = stage.getBoundingClientRect();
  new ResizeObserver(() => {
    const r = stage.getBoundingClientRect();
    if (Math.abs(r.width - fitted.width) < 1 && Math.abs(r.height - fitted.height) < fitted.height * 0.15) return;
    fitted = r; fn();
  }).observe(stage);
}
// The frame loop: step(dt, t) at most ~60 times a second (120 Hz displays call more often than a game needs),
// with dt capped at 1/30 s so a stall never makes things jump.
function startLoop(step){
  const FRAME_MS = 1000 / 60;
  let last = 0, next = 0;
  function tick(t){
    requestAnimationFrame(tick);
    if (t < next - 1) return;
    next = t - next > FRAME_MS ? t + FRAME_MS : next + FRAME_MS;
    const dt = Math.min((t - last) / 1000, 1 / 30); last = t;
    step(dt, t);
  }
  requestAnimationFrame(t => { last = t; requestAnimationFrame(tick); });
}
