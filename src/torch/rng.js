/* ---------- Torchlight Dungeons: seeded random numbers ---------- */
// One small generator (mulberry32), so a level or a whole game can be replayed from its seed, and its state saved.
class RNG {
  constructor(seed){ this.s = (seed >>> 0) || 1; }
  next(){
    let a = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    a = Math.imul(a ^ a >>> 15, a | 1); a ^= a + Math.imul(a ^ a >>> 7, a | 61);
    return ((a ^ a >>> 14) >>> 0) / 4294967296;
  }
  int(n){ return Math.floor(this.next() * n); }              // 0 .. n - 1
  range(a, b){ return a + this.int(b - a + 1); }             // a .. b
  chance(p){ return this.next() < p; }
  pick(arr){ return arr[this.int(arr.length)]; }
  dice(s){ const [n, d] = s.split("d").map(Number); let t = 0; for (let i = 0; i < n; i++) t += 1 + this.int(d); return t; }   // "2d6"
  shuffle(a){ for (let i = a.length - 1; i > 0; i--){ const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  weighted(list, w){ let sum = 0; for (const x of list) sum += w(x); let r = this.next() * sum; for (const x of list){ r -= w(x); if (r < 0) return x; } return list[list.length - 1]; }
}
