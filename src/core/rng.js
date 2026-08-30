/* ============================================================
   RNG deterministico + utilita' matematiche.
   LOGICA PURA - nessuna dipendenza dal browser.
   Portabile 1:1 in GDScript.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});

  /* mulberry32: PRNG a 32 bit, veloce e deterministico.
     Stesso seed => stessa sequenza => stesso mondo generato. */
  function Rng(seed) {
    this.s = (seed >>> 0) || 1;
  }
  Rng.prototype.next = function () {
    this.s = (this.s + 0x6D2B79F5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (a, b) { return a + this.next() * (b - a); };
  Rng.prototype.int = function (a, b) { return Math.floor(a + this.next() * (b - a + 1)); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.chance = function (p) { return this.next() < p; };
  Rng.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };
  /* Estrae n elementi pesati (peso = campo `w`, default 1) */
  Rng.prototype.weighted = function (entries) {
    let total = 0;
    for (const e of entries) total += (e.w == null ? 1 : e.w);
    let r = this.next() * total;
    for (const e of entries) {
      r -= (e.w == null ? 1 : e.w);
      if (r <= 0) return e;
    }
    return entries[entries.length - 1];
  };

  /* Rumore a valore intero, deterministico su coordinate.
     Usato dalla generazione del mondo per biomi e dettagli. */
  function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function smooth(t) { return t * t * (3 - 2 * t); }

  /* Rumore a valore interpolato: base per le macchie di terreno. */
  function valueNoise(x, y, seed) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = smooth(x - x0), fy = smooth(y - y0);
    const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  /* Somma di ottave: dettaglio piu' ricco. */
  function fbm(x, y, seed, octaves, lacunarity, gain) {
    octaves = octaves || 3; lacunarity = lacunarity || 2; gain = gain || 0.5;
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  const M = {
    clamp: (v, a, b) => v < a ? a : (v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    /* Avvicina `a` a `b` di al massimo `max` (per interpolazioni frame-rate safe) */
    approach: (a, b, max) => { const d = b - a; return Math.abs(d) <= max ? b : a + Math.sign(d) * max; },
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    dist2: (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; },
    /* Differenza angolare minima nell'intervallo [-PI, PI] */
    angDelta: (a, b) => {
      let d = (b - a) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
    /* Direzione cardinale (0=giu 1=sinistra 2=destra 3=su) da un vettore */
    facingFromVec: (dx, dy) => {
      if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 2;
      return dy < 0 ? 3 : 0;
    }
  };

  CV.Rng = Rng;
  CV.noise = { hash2, valueNoise, fbm };
  CV.M = M;
})(typeof window !== 'undefined' ? window : globalThis);
