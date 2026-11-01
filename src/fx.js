/* ---------- effects: sparks, embers, smoke, debris and light ---------- */
// After pixelfx (MIT, github.com/patch-gg/pixelfx), rewritten for the engine's screen. Particles step at 120 Hz with
// drag, so a burst is fast and its drift slow at any frame rate. Each takes its colour from a palette, dark to
// bright, by how much life it has left: it starts hot and cools. Light pools add to what is behind them, so hot
// things glow. Colours are linear light, like the engine's (above 1 is brighter than white).
const PAL = {
  fire:  [[0.25, 0.04, 0.02], [0.8, 0.18, 0.04], [1.5, 0.6, 0.12], [2.2, 1.5, 0.6], [2.6, 2.4, 1.8]],
  ice:   [[0.04, 0.1, 0.3], [0.15, 0.4, 0.9], [0.5, 1.0, 1.6], [1.6, 2.0, 2.4]],
  toxic: [[0.05, 0.2, 0.04], [0.2, 0.7, 0.1], [0.7, 1.6, 0.3], [1.8, 2.4, 1.0]],
  spark: [[0.6, 0.3, 0.1], [1.6, 1.2, 0.5], [2.4, 2.2, 1.6]],
  smoke: [[0.05, 0.05, 0.06], [0.13, 0.12, 0.13], [0.22, 0.2, 0.2]],
  dirt:  [[0.12, 0.07, 0.03], [0.3, 0.18, 0.08], [0.5, 0.34, 0.16]]
};
function createFx(){
  const parts = [], H = 1 / 120;
  let acc = 0;
  const add = p => { parts.push(p); if (parts.length > 600) parts.shift(); return p; };
  function burst(x, y, { n = 10, speed = 100, pal = PAL.spark, life = 0.5, g = 200, drag = 3, dir = -Math.PI / 2, spread = Math.PI * 2, kind = "spark", size = 1 } = {}){
    for (let i = 0; i < n; i++){
      const a = dir + (Math.random() - 0.5) * spread, v = speed * (0.35 + Math.random() * 0.65), L = life * (0.6 + Math.random() * 0.8);
      add({ kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g, drag, pal, life: L, age: 0, size });
    }
  }
  return {
    parts, burst,
    light(x, y, R, rgb, life = 0.25){ add({ kind: "light", x, y, vx: 0, vy: 0, g: 0, drag: 0, rgb, R, life, age: 0 }); },
    // A blast of radius R (in the same units as the bodies): a flash of light, a hot core of sparks, embers that
    // drift up, then smoke that swells and thins. Phases after pixelfx: fast attack, slow release.
    explode(x, y, R, pal = PAL.fire){
      this.light(x, y, R * 2, pal[pal.length - 2], 0.3);
      burst(x, y, { n: 18, speed: R * 9, pal, life: 0.45, g: R * 6, drag: 4 });
      burst(x, y, { n: 8, speed: R * 4, pal, life: 1.2, g: -R * 1.5, drag: 2.5, kind: "ember" });
      burst(x, y, { n: 5, speed: R * 1.5, pal: PAL.smoke, life: 1.6, g: -R * 1.2, drag: 2, kind: "smoke", size: R * 0.45 });
    },
    // Chunks thrown by an impact: they fall and tumble, darker than sparks.
    debris(x, y, R, pal = PAL.dirt, n = 8){ burst(x, y, { n, speed: R * 7, pal, life: 0.9, g: R * 18, drag: 1, spread: 2.4, kind: "chunk", size: 2 }); },
    puff(x, y, R, n = 4){ burst(x, y, { n, speed: R * 2, pal: PAL.smoke, life: 0.8, g: -R, drag: 3, spread: 2, kind: "smoke", size: R * 0.5 }); },
    clear(){ parts.length = 0; },
    update(dt){
      for (acc += dt; acc >= H; acc -= H){
        for (const p of parts){
          const k = Math.max(0, 1 - p.drag * H);
          p.vx *= k; p.vy = p.vy * k + p.g * H; p.x += p.vx * H; p.y += p.vy * H; p.age += H;
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].age >= parts[i].life) parts.splice(i, 1);
    },
    draw(screen){
      const S = screen.fine || screen, d = Math.min(S.cw, S.ch);   // d: one dot on the finest grid, for two-dot chunks
      for (const p of parts){
        const t = p.age / p.life;
        if (p.kind === "light"){ const v = (1 - t) * (1 - t); screen.glow(p.x, p.y, p.R, p.rgb.map(c => c * v * 0.4)); continue; }
        const P = p.pal, c = P[Math.min(P.length - 1, Math.floor((1 - t) * P.length))];
        if (p.kind === "smoke"){ const v = 1 - t; screen.glow(p.x, p.y, p.size * (0.6 + t * 1.4), c.map(x => x * v)); continue; }   // soft haze that swells and thins
        screen.dot(p.x, p.y, c, 3);
        if (p.kind === "chunk"){ screen.dot(p.x + d, p.y, c, 3); screen.dot(p.x, p.y + d, c, 3); }
        else if (t < 0.3) screen.dot(p.x - p.vx * 0.012, p.y - p.vy * 0.012, P[Math.max(0, P.indexOf(c) - 1)], 3);   // a short tail
      }
    }
  };
}
