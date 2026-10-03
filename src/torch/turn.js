/* ---------- Torchlight Dungeons: turns ---------- */
// Energy scheduler: every tick each actor gains energy by its speed, and whoever reaches 100 acts. Speed +10 acts
// twice as often as speed 0, and -10 half as often.
const energyGain = speed => 10 * Math.pow(2, speed / 10);
function nextActor(actors){
  for (;;){
    let best = null;
    for (const a of actors) if (a.energy >= 100 && (!best || a.energy > best.energy)) best = a;
    if (best) return best;
    for (const a of actors) a.energy += energyGain(a.speed);
  }
}
