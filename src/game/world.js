/* ============================================================
   GENERAZIONE DEL MONDO.
   Deterministica: lo stesso seme produce sempre la stessa zona,
   quindi il mondo non ha bisogno di essere salvato, solo il suo
   stato mutevole (forzieri aperti, nemici uccisi, nodi raccolti).
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const A = CV.Art;
  const M = CV.M;
  const T = 16;   /* dimensione del tile in pixel */
  /* La nuova tabella dei siti cambia quali scene occupano gli indici
     deterministici. Versionare le chiavi evita di applicare a un nuovo sito
     lo stato persistito di una scena diversa nei salvataggi esistenti. */
  const SITE_KEY_VERSION = 2;

  /* Indici dei tile nell'atlante */
  const TI = {};
  A.TILE_KEYS.forEach((k, i) => { TI[k] = i; });

  function idx(z, tx, ty) { return ty * z.w + tx; }
  function inside(z, tx, ty) { return tx >= 0 && ty >= 0 && tx < z.w && ty < z.h; }

  function setTile(z, tx, ty, key, solid) {
    if (!inside(z, tx, ty)) return;
    const i = idx(z, tx, ty);
    z.tiles[i] = TI[key];
    z.variant[i] = (CV.noise.hash2(tx, ty, z.def.seed) * A.VARIANTS) | 0;
    z.solid[i] = solid ? 1 : 0;
  }

  function fillRect(z, x0, y0, w, h, key, solid) {
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) setTile(z, x, y, key, solid);
  }

  /* Libera un'area attorno a un punto d'interesse: garantisce che
     forzieri, uscite e PNG non finiscano dentro un muro. */
  function clearAround(z, tx, ty, r, key) {
    for (let y = ty - r; y <= ty + r; y++)
      for (let x = tx - r; x <= tx + r; x++)
        if (inside(z, x, y)) setTile(z, x, y, key, false);
  }

  /* ================================================================
     BIOMI
     ================================================================ */

  function genVillage(z, rng) {
    const d = z.def;
    /* Prato con macchie di terra */
    for (let y = 0; y < z.h; y++) {
      for (let x = 0; x < z.w; x++) {
        const n = CV.noise.fbm(x / 9, y / 9, d.seed, 3);
        setTile(z, x, y, n > 0.58 ? 'dirt' : (n < 0.36 ? 'ash_grass' : 'grass'), false);
        z.elev[idx(z, x, y)] = n * 255;
      }
    }
    /* Palizzata perimetrale con varchi verso le uscite */
    for (let x = 0; x < z.w; x++) { setTile(z, x, 0, 'village_wall', true); setTile(z, x, 1, 'village_wall', true); setTile(z, x, z.h - 1, 'village_wall', true); }
    for (let y = 0; y < z.h; y++) { setTile(z, 0, y, 'village_wall', true); setTile(z, 1, y, 'village_wall', true); setTile(z, z.w - 1, y, 'village_wall', true); setTile(z, z.w - 2, y, 'village_wall', true); }

    /* Strade principali a croce */
    fillRect(z, 22, 4, 4, z.h - 6, 'path', false);
    fillRect(z, 6, 21, z.w - 12, 4, 'path', false);
    fillRect(z, 18, 18, 12, 12, 'path', false);

    /* Case attorno alla piazza */
    const spots = [
      [8, 14, 0], [36, 12, 1], [8, 30, 1], [36, 30, 0], [17, 6, 1], [30, 36, 1]
    ];
    for (const [tx, ty, v] of spots) {
      const img = A.house(v);
      const px = tx * T, py = ty * T;
      z.props.push({ kind: 'house', img: img, x: px + img.width / 2, y: py + img.height, ox: img.width / 2, oy: img.height,
        col: { x: px + 3, y: py + img.height - 26, w: img.width - 6, h: 24 } });
      /* Il muro della casa blocca il passaggio */
      const cw = Math.ceil((img.width - 6) / T), ch = 2;
      for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
        const gx = tx + xx, gy = ty + Math.floor((img.height - 26) / T) + yy;
        if (inside(z, gx, gy)) z.solid[idx(z, gx, gy)] = 1;
      }
    }

    /* Alberi e cespugli negli spazi liberi */
    scatterNature(z, rng, 26, 20, [0, 1, 2, 3], 0.5);
    /* Uscita verso la brughiera: apre la palizzata */
    for (const ex of d.exits) clearAround(z, ex.tx, ex.ty, 2, 'path');
  }

  function genMoor(z, rng) {
    const d = z.def;
    for (let y = 0; y < z.h; y++) {
      for (let x = 0; x < z.w; x++) {
        const n = CV.noise.fbm(x / 11, y / 11, d.seed, 4);
        const n2 = CV.noise.fbm(x / 5 + 40, y / 5, d.seed + 77, 2);
        let key = 'ash_grass';
        if (n > 0.63) key = 'ash';
        else if (n < 0.34) key = 'dirt';
        if (n2 > 0.78 && n < 0.5) key = 'water';
        setTile(z, x, y, key, key === 'water');
        z.elev[idx(z, x, y)] = n * 255;
      }
    }
    borderWalls(z, 'rock_wall');
    /* Sentiero irregolare che attraversa la brughiera */
    windingPath(z, rng, 32, z.h - 4, 60, 14, 'path');
    windingPath(z, rng, 32, 40, 4, 30, 'path');
    scatterNature(z, rng, 30, 34, [4, 5, 6, 7], 0.35);
    scatterRocks(z, rng, 26);
  }

  function genForest(z, rng) {
    const d = z.def;
    for (let y = 0; y < z.h; y++) {
      for (let x = 0; x < z.w; x++) {
        const n = CV.noise.fbm(x / 10, y / 10, d.seed, 3);
        /* Sottobosco: terra battuta e chiazze d'erba secca. Niente pietra,
           che in mezzo agli alberi legge come una macchia fredda fuori posto. */
        setTile(z, x, y, n > 0.6 ? 'dirt' : (n < 0.38 ? 'ash_grass' : 'grass'), false);
        z.elev[idx(z, x, y)] = n * 255;
      }
    }
    borderWalls(z, 'rock_wall');
    windingPath(z, rng, z.w - 4, 32, 32, 4, 'path');
    /* Bosco fitto: la densità cresce lontano dai sentieri */
    scatterNature(z, rng, 150, 70, [0, 1, 2, 3, 4, 6], 0.9);
    scatterRocks(z, rng, 16);
  }

  function genCave(z, rng) {
    /* Si parte da roccia piena e si scava. */
    for (let y = 0; y < z.h; y++)
      for (let x = 0; x < z.w; x++) setTile(z, x, y, 'rock_wall', true);

    /* Punti da collegare: uscite, nodi, forzieri, nemici unici */
    const pts = [];
    const d = z.def;
    for (const e of d.exits) pts.push([e.tx, e.ty]);
    for (const n of (d.nodes || [])) pts.push([n.tx, n.ty]);
    for (const c of (d.chests || [])) pts.push([c.tx, c.ty]);
    for (const n of (d.named || [])) pts.push([n.tx, n.ty]);
    /* Qualche sala extra per dare respiro */
    for (let i = 0; i < 7; i++) pts.push([rng.int(6, z.w - 7), rng.int(6, z.h - 7)]);

    /* Sale */
    for (const [tx, ty] of pts) {
      const r = rng.int(3, 5);
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r + 2) setTile(z, tx + x, ty + y, 'cave_floor', false);
    }
    /* Corridoi che collegano ogni punto al successivo, con serpeggiamento */
    for (let i = 1; i < pts.length; i++) tunnel(z, rng, pts[i - 1], pts[i]);
    /* Un paio di anelli, così non è un albero lineare */
    tunnel(z, rng, pts[0], pts[pts.length - 1]);
    if (pts.length > 4) tunnel(z, rng, pts[2], pts[pts.length - 2]);

    /* Pozze di lava nelle vene di braceferro */
    for (let i = 0; i < 5; i++) {
      const tx = rng.int(5, z.w - 6), ty = rng.int(5, z.h - 6);
      if (z.solid[idx(z, tx, ty)]) continue;
      const r = rng.int(1, 2);
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (!z.solid[idx(z, M.clamp(tx + x, 0, z.w - 1), M.clamp(ty + y, 0, z.h - 1))])
            setTile(z, tx + x, ty + y, 'lava', true);
    }
    borderWalls(z, 'rock_wall');
    for (const e of d.exits) clearAround(z, e.tx, e.ty, 2, 'cave_floor');
    scatterRocks(z, rng, 18, true);
    /* Rete di sicurezza: nessun punto d'interesse deve restare isolato. */
    ensureConnected(z, pts);
  }

  function genKeep(z, rng) {
    const d = z.def;
    for (let y = 0; y < z.h; y++)
      for (let x = 0; x < z.w; x++) setTile(z, x, y, 'keep_wall', true);

    /* Sala del trono in alto, cortili sotto, corridoio centrale */
    const rooms = [
      [8, 4, 32, 18],    /* sala del boss */
      [6, 24, 16, 12],
      [26, 24, 16, 12],
      [16, 38, 16, 12]
    ];
    for (const [x, y, w, h] of rooms) fillRect(z, x, y, w, h, 'keep_floor', false);
    fillRect(z, 22, 20, 4, 22, 'keep_floor', false);
    fillRect(z, 20, 34, 8, 6, 'keep_floor', false);
    fillRect(z, 22, 46, 4, 8, 'keep_floor', false);

    /* Colonne nella sala del trono */
    for (const cx of [12, 20, 28, 36]) {
      for (const cy of [8, 16]) {
        const img = A.pillar();
        z.props.push({ kind: 'pillar', img: img, x: cx * T + 8, y: cy * T + 20, ox: img.width / 2, oy: img.height,
          col: { x: cx * T + 1, y: cy * T + 4, w: 14, h: 14 } });
        setTile(z, cx, cy, 'keep_floor', true);
      }
    }
    /* Canali di lava ai lati della sala. Il varco centrale (x20-27) lascia
       libero il corridoio [22,20,4,22] che scende al resto della Rocca:
       prima la striscia correva su tutta la larghezza e sigillava la sala
       del boss, corridoio incluso, tagliandola fuori dal resto della mappa. */
    fillRect(z, 8, 21, 12, 1, 'lava', true);
    fillRect(z, 28, 21, 12, 1, 'lava', true);
    for (const e of d.exits) clearAround(z, e.tx, e.ty, 2, 'keep_floor');
    borderWalls(z, 'keep_wall');
  }

  /* ---------------- Strumenti di generazione ---------------- */

  function borderWalls(z, key) {
    for (let x = 0; x < z.w; x++) {
      setTile(z, x, 0, key, true); setTile(z, x, 1, key, true);
      setTile(z, x, z.h - 1, key, true); setTile(z, x, z.h - 2, key, true);
    }
    for (let y = 0; y < z.h; y++) {
      setTile(z, 0, y, key, true); setTile(z, 1, y, key, true);
      setTile(z, z.w - 1, y, key, true); setTile(z, z.w - 2, y, key, true);
    }
  }

  function tunnel(z, rng, a, b) {
    let [x, y] = a;
    const [tx, ty] = b;
    let guard = 0;
    const carve = (cx, cy) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          setTile(z, M.clamp(cx + dx, 2, z.w - 3), M.clamp(cy + dy, 2, z.h - 3), 'cave_floor', false);
    };
    while ((x !== tx || y !== ty) && guard++ < 600) {
      carve(x, y);
      if (rng.chance(0.78)) {
        if (Math.abs(tx - x) > Math.abs(ty - y)) x += Math.sign(tx - x);
        else y += Math.sign(ty - y);
      } else {
        if (rng.chance(0.5)) x += rng.chance(0.5) ? 1 : -1;
        else y += rng.chance(0.5) ? 1 : -1;
        x = M.clamp(x, 2, z.w - 3); y = M.clamp(y, 2, z.h - 3);
      }
    }
    carve(tx, ty);
  }

  /* Insieme delle celle non solide raggiungibili da `start` (BFS 4-direzionale). */
  function floodReachable(z, start) {
    const seen = new Uint8Array(z.w * z.h);
    const startI = idx(z, start[0], start[1]);
    seen[startI] = 1;
    const stack = [start[0], start[1]];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      const neigh = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
      for (const [nx, ny] of neigh) {
        if (!inside(z, nx, ny)) continue;
        const i = idx(z, nx, ny);
        if (seen[i] || z.solid[i]) continue;
        seen[i] = 1;
        stack.push(nx, ny);
      }
    }
    return seen;
  }

  /* Corridoio in linea retta (nessuna casualità, nessun guard): usato solo
     come riparazione di emergenza quando tunnel() non è riuscito a collegare
     due punti, per garantire sempre la connessione indipendentemente dalla
     fortuna dell'rng. */
  function carveDirect(z, a, b) {
    let [x, y] = a;
    const [tx, ty] = b;
    const carve = (cx, cy) => {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          setTile(z, M.clamp(cx + dx, 2, z.w - 3), M.clamp(cy + dy, 2, z.h - 3), 'cave_floor', false);
    };
    while (x !== tx) { carve(x, y); x += Math.sign(tx - x); }
    while (y !== ty) { carve(x, y); y += Math.sign(ty - y); }
    carve(tx, ty);
  }

  /* Verifica finale: ogni punto d'interesse deve essere raggiungibile dal
     primo (un'uscita). tunnel() è casuale e con un guard limitato può non
     arrivare a destinazione su tratte lunghe e sfortunate, lasciando una
     sala scavata ma isolata dal resto della caverna: qui la si ricollega
     con certezza, senza affidarsi di nuovo alla fortuna dell'rng. */
  function ensureConnected(z, pts) {
    if (!pts.length) return;
    let seen = floodReachable(z, pts[0]);
    for (let pass = 0; pass < pts.length; pass++) {
      const unreached = pts.filter(p => !seen[idx(z, p[0], p[1])]);
      if (!unreached.length) break;
      const reached = pts.filter(p => seen[idx(z, p[0], p[1])]);
      for (const p of unreached) {
        let best = reached[0], bestD = Infinity;
        for (const r of reached) {
          const d = (r[0] - p[0]) * (r[0] - p[0]) + (r[1] - p[1]) * (r[1] - p[1]);
          if (d < bestD) { bestD = d; best = r; }
        }
        carveDirect(z, best, p);
      }
      seen = floodReachable(z, pts[0]);
    }
  }

  function windingPath(z, rng, x0, y0, x1, y1, key) {
    let x = x0, y = y0, guard = 0;
    while ((Math.abs(x - x1) > 1 || Math.abs(y - y1) > 1) && guard++ < 500) {
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if (inside(z, x + dx, y + dy) && !z.solid[idx(z, x + dx, y + dy)])
            setTile(z, x + dx, y + dy, key, false);
      if (rng.chance(0.72)) {
        if (Math.abs(x1 - x) > Math.abs(y1 - y)) x += Math.sign(x1 - x);
        else y += Math.sign(y1 - y);
      } else {
        x += rng.int(-1, 1); y += rng.int(-1, 1);
        x = M.clamp(x, 3, z.w - 4); y = M.clamp(y, 3, z.h - 4);
      }
    }
  }

  /* Alberi e cespugli, evitando sentieri, muri e punti d'interesse. */
  function scatterNature(z, rng, trees, bushes, variants, edgeBias) {
    const busy = busyMap(z);
    let placed = 0, guard = 0;
    while (placed < trees && guard++ < trees * 40) {
      const tx = rng.int(2, z.w - 3), ty = rng.int(3, z.h - 3);
      const i = idx(z, tx, ty);
      if (z.solid[i] || busy[i]) continue;
      const key = A.TILE_KEYS[z.tiles[i]];
      if (key === 'path' || key === 'water' || key === 'lava') continue;
      /* Più fitto ai bordi della mappa: crea una cornice naturale */
      const edge = Math.min(tx, ty, z.w - tx, z.h - ty) / (Math.min(z.w, z.h) / 2);
      if (rng.next() > (1 - edge) * edgeBias + 0.22) continue;
      const v = rng.pick(variants);
      const img = A.tree(v);
      z.props.push({ kind: 'tree', img: img, sway: v >= 4 ? 0.35 : 0.6, x: tx * T + 8, y: ty * T + 16, ox: img.width / 2, oy: img.height,
        col: { x: tx * T + 4, y: ty * T + 6, w: 9, h: 9 } });
      z.solid[i] = 1; busy[i] = 1;
      placed++;
    }
    placed = 0; guard = 0;
    while (placed < bushes && guard++ < bushes * 30) {
      const tx = rng.int(2, z.w - 3), ty = rng.int(3, z.h - 3);
      const i = idx(z, tx, ty);
      if (z.solid[i] || busy[i]) continue;
      const key = A.TILE_KEYS[z.tiles[i]];
      if (key === 'path' || key === 'water' || key === 'lava') continue;
      const img = A.bush(rng.int(0, 1));
      z.props.push({ kind: 'bush', img: img, sway: 0.85, x: tx * T + 8, y: ty * T + 14, ox: img.width / 2, oy: img.height, col: null });
      busy[i] = 1;
      placed++;
    }
  }

  function scatterRocks(z, rng, n, cave) {
    const busy = busyMap(z);
    let placed = 0, guard = 0;
    while (placed < n && guard++ < n * 40) {
      const tx = rng.int(3, z.w - 4), ty = rng.int(3, z.h - 4);
      const i = idx(z, tx, ty);
      if (z.solid[i] || busy[i]) continue;
      const img = A.rock(rng.int(0, 1));
      z.props.push({ kind: 'rock', img: img, x: tx * T + 8, y: ty * T + 16, ox: img.width / 2, oy: img.height,
        col: { x: tx * T + 2, y: ty * T + 4, w: 13, h: 11 } });
      z.solid[i] = 1; busy[i] = 1;
      placed++;
    }
  }

  /* ---------------- Arredo del mondo ----------------
     `sway` = quanto l'oggetto ondeggia nel vento (0 = rigido).
     `solid` = se blocca il passaggio. */
  const DECOR = {
    tallgrass:  { make: (v) => A.tallgrass(v), n: 3, oy: 13, sway: 1.00, solid: false },
    flowers:    { make: (v) => A.flowers(v),   n: 4, oy: 11, sway: 0.70, solid: false },
    mushrooms:  { make: (v) => A.mushrooms(v), n: 3, oy: 13, sway: 0.25, solid: false, glow: true },
    boneheap:   { make: (v) => A.boneheap(v),  n: 2, oy: 13, sway: 0,    solid: false },
    cobweb:     { make: (v) => A.cobweb(v),    n: 2, oy: 14, sway: 0.35, solid: false },
    stump:      { make: (v) => A.stump(v),     n: 2, oy: 15, sway: 0,    solid: true, cw: 11, ch: 6 },
    barrel:     { make: () => A.barrel(),      n: 1, oy: 17, sway: 0,    solid: true, cw: 10, ch: 6 },
    crate:      { make: () => A.crate(),       n: 1, oy: 15, sway: 0,    solid: true, cw: 12, ch: 6 },
    gravestone: { make: (v) => A.gravestone(v),n: 2, oy: 17, sway: 0,    solid: true, cw: 9,  ch: 5 },
    fence:      { make: (v) => A.fence(v),     n: 2, oy: 15, sway: 0,    solid: true, cw: 14, ch: 5 },
    /* Le stalagmiti non bloccano: nelle gallerie strette chiuderebbero
       il passaggio, e una miniera impercorribile non è un'ambientazione. */
    stalagmite: { make: (v) => A.stalagmite(v),n: 3, oy: 0,  sway: 0,    solid: false },
    banner:     { make: (v) => A.banner(v),    n: 2, oy: 30, sway: 0.55, solid: false }
  };

  /* Che cosa cresce dove: è la differenza fra cinque mappe e cinque luoghi. */
  /* Densità alte: nella vista rientra circa il 4% della mappa, quindi
     numeri bassi si traducono in schermate spoglie. */
  const BIOME_DECOR = {
    village: [['tallgrass', 120], ['flowers', 60], ['fence', 12], ['barrel', 7], ['crate', 7], ['stump', 9]],
    moor:    [['tallgrass', 210], ['flowers', 34], ['stump', 18], ['boneheap', 14], ['gravestone', 11], ['fence', 8]],
    forest:  [['tallgrass', 290], ['mushrooms', 42], ['stump', 28], ['flowers', 48], ['boneheap', 9]],
    cave:    [['stalagmite', 75], ['mushrooms', 48], ['boneheap', 24], ['cobweb', 32], ['crate', 6]],
    keep:    [['banner', 13], ['boneheap', 18], ['gravestone', 9], ['crate', 9], ['barrel', 7], ['cobweb', 16]]
  };

  /* Un oggetto che blocca può essere piazzato solo in uno spazio aperto:
     in un corridoio a un tile chiuderebbe la strada. */
  function openEnough(z, tx, ty) {
    let free = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (inside(z, tx + dx, ty + dy) && !z.solid[idx(z, tx + dx, ty + dy)]) free++;
      }
    }
    return free >= 7;
  }

  function scatterDecor(z, rng, busy) {
    const list = BIOME_DECOR[z.def.biome] || [];
    for (const [kind, count] of list) {
      const def = DECOR[kind];
      if (!def) continue;
      let placed = 0, guard = 0;
      while (placed < count && guard++ < count * 45) {
        const tx = rng.int(3, z.w - 4), ty = rng.int(3, z.h - 4);
        const i = idx(z, tx, ty);
        if (z.solid[i] || busy[i]) continue;
        const key = A.TILE_KEYS[z.tiles[i]];
        if (key === 'water' || key === 'lava') continue;
        /* L'erba non cresce sul sentiero battuto */
        if (key === 'path' && def.sway > 0.5) continue;
        if (def.solid && !openEnough(z, tx, ty)) continue;

        const v = rng.int(0, def.n - 1);
        const img = def.make(v);
        const oy = def.oy || img.height;
        const o = {
          kind: kind, img: img, sway: def.sway,
          x: tx * T + 8, y: ty * T + Math.min(16, oy),
          ox: img.width / 2, oy: oy, col: null
        };
        if (def.solid) {
          o.col = { x: tx * T + 8 - def.cw / 2, y: ty * T + 16 - def.ch, w: def.cw, h: def.ch };
          z.solid[i] = 1;
        }
        if (def.glow) o.glow = true;
        z.props.push(o);
        busy[i] = 1;
        placed++;
      }
    }
  }

  /* Marca come occupate le celle vicino a uscite, nodi, forzieri, PNG. */
  function busyMap(z) {
    const b = new Uint8Array(z.w * z.h);
    const mark = (tx, ty, r) => {
      for (let y = ty - r; y <= ty + r; y++)
        for (let x = tx - r; x <= tx + r; x++)
          if (inside(z, x, y)) b[idx(z, x, y)] = 1;
    };
    const d = z.def;
    for (const e of (d.exits || [])) mark(e.tx, e.ty, 3);
    for (const n of (d.nodes || [])) mark(n.tx, n.ty, 2);
    for (const c of (d.chests || [])) mark(c.tx, c.ty, 2);
    for (const n of (d.named || [])) mark(n.tx, n.ty, 4);
    for (const p of (d.props || [])) mark(p.tx, p.ty, 2);
    for (const id in D.npcs) if (D.npcs[id].zone === d.id) mark(D.npcs[id].tx, D.npcs[id].ty, 2);
    return b;
  }

  /* ================================================================
     SITI: luoghi generati proceduralmente.

     Fino a qui la generazione produceva terreno e arredo: spazio, non
     contenuto. Tutti i punti d'interesse venivano da liste scritte a mano
     in story.js, quindi uscire dal sentiero non pagava mai. Un sito è una
     scena — terreno modificato, arredo, una composizione di nemici e una
     ricompensa — ed è la fonte procedurale che mancava.

     I nemici arrivano per RUOLO (vedi D.sites): la zona decide chi
     interpreta quel ruolo, così i siti non vanno riscritti quando il
     bestiario cresce.
     ================================================================ */

  /* Pavimento e muro coerenti col bioma: un sito di pietra nel bosco
     stona, e in caverna 'dirt' non esiste nell'atlante come pavimento. */
  function floorKeyFor(biome, preferred) {
    if (biome === 'cave') return 'cave_floor';
    if (biome === 'keep') return 'keep_floor';
    return preferred || 'dirt';
  }
  function wallKeyFor(biome) {
    return biome === 'keep' ? 'keep_wall' : 'rock_wall';
  }

  /* Scorre le celle di un disco in tile. */
  function eachDisc(z, tx, ty, r, fn) {
    for (let y = ty - r; y <= ty + r; y++)
      for (let x = tx - r; x <= tx + r; x++) {
        const dx = x - tx, dy = y - ty;
        if (dx * dx + dy * dy > r * r) continue;
        if (inside(z, x, y)) fn(x, y, idx(z, x, y));
      }
  }

  /* Rimuove gli oggetti già sparsi dentro l'area del sito.
     Serve davvero: alberi e rocce sono piazzati dai generatori di bioma
     PRIMA dei siti, e spianare il terreno senza togliere l'albero
     lascerebbe una collisione invisibile in mezzo alla radura. */
  function clearProps(z, cx, cy, rPx) {
    const kept = [];
    for (const p of z.props) {
      if (M.dist(p.x, p.y, cx, cy) > rPx) { kept.push(p); continue; }
      /* Libera anche le celle che l'oggetto rendeva solide */
      if (p.col) {
        const x0 = Math.floor(p.col.x / T), x1 = Math.floor((p.col.x + p.col.w) / T);
        const y0 = Math.floor(p.col.y / T), y1 = Math.floor((p.col.y + p.col.h) / T);
        for (let y = y0; y <= y1; y++)
          for (let x = x0; x <= x1; x++)
            if (inside(z, x, y)) z.solid[idx(z, x, y)] = 0;
      }
    }
    z.props = kept;
  }

  /* La cella libera più vicina: un nemico o un nodo dichiarato in
     posizione relativa può cadere su roccia quando il sito non spiana. */
  function nearestFree(z, tx, ty, maxR) {
    for (let r = 0; r <= (maxR || 4); r++) {
      for (let y = ty - r; y <= ty + r; y++)
        for (let x = tx - r; x <= tx + r; x++) {
          if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue;
          if (!inside(z, x, y) || z.solid[idx(z, x, y)]) continue;
          const key = A.TILE_KEYS[z.tiles[idx(z, x, y)]];
          if (key === 'water' || key === 'lava') continue;
          return { tx: x, ty: y };
        }
    }
    return null;
  }

  /* Il sito può stare qui? Il controllo è severo di proposito: un sito
     che tappa un corridoio o inghiotte un PNG costa più di un sito in meno. */
  function siteFits(z, s, tx, ty, busy, placed) {
    const r = s.r;
    if (tx - r < 3 || ty - r < 3 || tx + r > z.w - 4 || ty + r > z.h - 4) return false;
    /* Mai a ridosso di un varco: si entrerebbe dentro uno scontro */
    for (const e of (z.def.exits || []))
      if (M.dist(tx, ty, e.tx, e.ty) < r + 8) return false;
    for (const o of placed)
      if (M.dist(tx, ty, o.tx, o.ty) < r + o.r + 3) return false;
    /* Il centro dev'essere calpestabile: niente siti dentro la roccia */
    if (z.solid[idx(z, tx, ty)]) return false;

    let cells = 0, solid = 0, bad = 0, occupied = 0;
    eachDisc(z, tx, ty, r, (x, y, i) => {
      cells++;
      if (z.solid[i]) solid++;
      if (busy[i]) occupied++;
      const key = A.TILE_KEYS[z.tiles[i]];
      if (key === 'water' || key === 'lava') bad++;
    });
    if (!cells || bad || occupied) return false;
    /* In caverna il sito deve stare in uno spazio già scavato: scavarne uno
       nuovo nella roccia piena produrrebbe una sala irraggiungibile. */
    const maxSolid = z.def.biome === 'cave' ? 0.40 : 0.55;
    return solid / cells <= maxSolid;
  }

  /* Costruisce un oggetto d'arredo del sito riusando la tabella DECOR
     già usata da scatterDecor, più i pochi sprite fissi che servono. */
  function siteProp(z, spec, tx, ty, rng) {
    const px = tx * T + 8;
    let img, oy, sway = 0, col = null, cw = 0, ch = 0;

    if (spec.kind === 'campfire') {
      img = A.sprite('campfire'); oy = 16; cw = 11; ch = 9;
    } else if (spec.kind === 'pillar') {
      img = A.pillar(); oy = img.height; cw = 14; ch = 14;
    } else if (spec.kind === 'altar') {
      img = A.gravestone(0); oy = 17; cw = 9; ch = 5;
    } else {
      const d = DECOR[spec.kind];
      if (!d) return null;
      /* Un oggetto solido in un passaggio stretto lo chiuderebbe */
      if (d.solid && !openEnough(z, tx, ty)) return null;
      img = d.make(rng.int(0, d.n - 1));
      oy = d.oy || img.height;
      sway = d.sway;
      if (d.solid) { cw = d.cw; ch = d.ch; }
    }

    const py = ty * T + Math.min(16, oy);
    if (cw) col = { x: px - cw / 2, y: ty * T + 16 - ch, w: cw, h: ch };
    const o = { kind: spec.kind, img: img, sway: sway, x: px, y: py,
                ox: img.width / 2, oy: oy, col: col };
    if (col) z.solid[idx(z, tx, ty)] = 1;
    z.props.push(o);
    return o;
  }

  function placeSites(z, rng) {
    const def = z.def;
    const want = def.siteCount || 0;
    if (!want || !D.sites) return;

    const roles = def.roles || {};
    /* Un ruolo non definito ricade su quello successivo invece di far
       scartare il sito: così una rovina esiste anche dove non ci sono
       nemici pesanti, con un nemico comune irrobustito. */
    const resolveRole = (role) => {
      let r = role, guard = 0;
      while (r && guard++ < 4) {
        if (roles[r]) return roles[r];
        r = D.roleFallback[r];
      }
      return null;
    };

    const pool = [];
    for (const id in D.sites) {
      const s = D.sites[id];
      if (s.biomes.indexOf(def.biome) < 0) continue;
      if ((s.needs || []).some(role => !resolveRole(role))) continue;
      for (let i = 0; i < (s.weight || 1); i++) pool.push(s);
    }
    if (!pool.length) return;

    const busy = busyMap(z);
    let guard = 0;
    while (z.sites.length < want && guard++ < want * 80) {
      const s = rng.pick(pool);
      const tx = rng.int(s.r + 3, z.w - s.r - 4);
      const ty = rng.int(s.r + 3, z.h - s.r - 4);
      if (!siteFits(z, s, tx, ty, busy, z.sites)) continue;
      const index = z.sites.length;
      const built = buildSite(z, s, tx, ty, index, rng, resolveRole);
      /* prefix e keys identificano il sito come obiettivo: sono ciò che
         main.js legge per sapere quanti nemici del sito sono ancora vivi
         (vedi updateSiteObjective) e sono deterministici — lo stesso seme
         di zona produce sempre lo stesso sito allo stesso indice. */
      z.sites.push({ id: s.id, name: s.name, tx: tx, ty: ty, r: s.r,
        prefix: z.id + ':site' + SITE_KEY_VERSION + ':' + index, keys: built.keys });
      /* L'area occupata vale anche per i siti successivi */
      eachDisc(z, tx, ty, s.r + 1, (x, y, i) => { busy[i] = 1; });
    }
  }

  function buildSite(z, s, tx, ty, index, rng, resolveRole) {
    const biome = z.def.biome;
    const floor = floorKeyFor(biome, s.carve && s.carve.key);
    const prefix = z.id + ':site' + SITE_KEY_VERSION + ':' + index;

    /* 1. Si libera il terreno PRIMA di modificarlo, così le collisioni
          degli alberi rimossi spariscono insieme agli alberi. */
    clearProps(z, tx * T + 8, ty * T + 8, (s.r + 0.5) * T);

    /* 2. Terreno */
    const mode = s.carve ? s.carve.mode : 'none';
    if (mode === 'clear') {
      eachDisc(z, tx, ty, s.r, (x, y) => setTile(z, x, y, floor, false));
      /* Un pavimento spianato non può avere sotto il rilievo del terreno
         originale: il renderer lo leggerebbe come un pavimento bitorzoluto. */
      const flatElev = z.elev[idx(z, tx, ty)];
      eachDisc(z, tx, ty, s.r, (x, y, i) => { z.elev[i] = flatElev; });
    } else if (mode === 'ring') {
      eachDisc(z, tx, ty, s.r - 1, (x, y) => setTile(z, x, y, floor, false));
      const flatElev2 = z.elev[idx(z, tx, ty)];
      eachDisc(z, tx, ty, s.r - 1, (x, y, i) => { z.elev[i] = flatElev2; });
      const wall = wallKeyFor(biome);
      const steps = Math.round(2 * Math.PI * (s.r - 1) * 1.7);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        if (rng.next() < (s.carve.gaps || 0.4)) continue;   /* i varchi */
        setTile(z, Math.round(tx + Math.cos(a) * (s.r - 1)),
                   Math.round(ty + Math.sin(a) * (s.r - 1)), wall, true);
      }
    }

    /* 3. Arredo */
    for (const p of (s.props || [])) {
      const px = tx + p.dx, py = ty + p.dy;
      if (!inside(z, px, py)) continue;
      const o = siteProp(z, p, px, py, rng);
      /* Il fuoco di un accampamento ripulito diventa un punto di sosta:
         è la ricompensa per aver sgomberato la scena. */
      if (o && p.rest) {
        z.interactables.push({ kind: 'campfire', x: o.x, y: o.y - 8, r: 26, label: 'Riposa' });
      }
    }

    /* 4. Ricompense */
    (s.chests || []).forEach((c, j) => {
      const spot = nearestFree(z, tx + c.dx, ty + c.dy, 3);
      if (!spot) return;
      clearAround(z, spot.tx, spot.ty, 1, floor);
      const o = { key: prefix + 'c' + j, table: c.table,
                  x: spot.tx * T + 8, y: spot.ty * T + 14, open: false };
      z.chests.push(o);
      z.interactables.push({ kind: 'chest', ref: o, x: o.x, y: o.y - 6, r: 26, label: 'Apri' });
    });

    (s.nodes || []).forEach((n, j) => {
      const spot = nearestFree(z, tx + n.dx, ty + n.dy, 3);
      if (!spot) return;
      clearAround(z, spot.tx, spot.ty, 1, floor);
      const o = { key: prefix + 'n' + j, type: n.type,
                  x: spot.tx * T + 8, y: spot.ty * T + 14, spent: 0 };
      z.nodes.push(o);
      z.interactables.push({ kind: 'node', ref: o, x: o.x, y: o.y - 6, r: 24, label: 'Raccogli' });
    });

    if (s.shrine) {
      const spot = nearestFree(z, tx + s.shrine.dx, ty + s.shrine.dy, 3);
      if (spot) {
        clearAround(z, spot.tx, spot.ty, 1, floor);
        siteProp(z, { kind: 'altar' }, spot.tx, spot.ty, rng);
        const o = { key: prefix + 's', x: spot.tx * T + 8, y: spot.ty * T + 14, used: false };
        z.shrines.push(o);
        z.interactables.push({ kind: 'shrine', ref: o, x: o.x, y: o.y - 6, r: 26, label: 'Prega' });
      }
    }

    /* 5. Nemici: composizione, non posizioni a caso. */
    const mkSpawn = (sp, j, keyPrefix) => {
      const id = resolveRole(sp.role);
      if (!id) return null;
      const spot = nearestFree(z, tx + sp.dx, ty + sp.dy, 4);
      if (!spot) return null;
      return {
        key: keyPrefix + j, id: id,
        x: spot.tx * T + 8, y: spot.ty * T + 8,
        siteIndex: index, spawnIndex: j,
        hpMult: sp.hpMult || 1, dmgMult: sp.dmgMult || 1, sightMult: sp.sightMult || 1
      };
    };

    /* Le chiavi dei nemici piazzati qui (non quelli d'imboscata, che
       restano una sorpresa a parte) sono ciò che rende il sito un
       obiettivo verificabile: vedi z.sites.push in placeSites. */
    const keys = [];
    (s.spawns || []).forEach((sp, j) => {
      const e = mkSpawn(sp, j, prefix + ':e');
      if (e) { z.siteSpawns.push(e); keys.push(e.key); }
    });

    if (s.ambush) {
      const list = [];
      (s.ambush.spawns || []).forEach((sp, j) => {
        const e = mkSpawn(sp, j, prefix + ':a');
        if (e) list.push(e);
      });
      if (list.length) {
        z.ambushes.push({ x: tx * T + 8, y: ty * T + 8,
                          r: s.ambush.radius || 46, spawns: list, done: false });
      }
    }
    return { keys: keys };
  }

  /* Applica una variante deterministica ai siti già sgomberati. Il ciclo
     zero resta intenzionalmente invariato rispetto alla prima campagna. */
  function rollSiteMods(z, worldState) {
    if (!D.siteMods || !D.siteModList) return;
    const cycles = worldState.siteCycle = worldState.siteCycle || {};
    const ready = worldState.siteCycleReady = worldState.siteCycleReady || {};
    const now = Date.now() / 1000;

    (z.sites || []).forEach((site, siteIndex) => {
      const storedCycle = Math.max(0, cycles[site.prefix] | 0);
      const cycle = ready[site.prefix] > now ? Math.max(0, storedCycle - 1) : storedCycle;
      site.cycle = cycle;
      const seed = Math.floor(CV.noise.hash2(siteIndex, cycle, z.def.seed + 7301) * 4294967296);
      const rng = new CV.Rng(seed);
      const mod = cycle === 0 ? D.siteMods.none : rng.weighted(D.siteModList);
      site.mod = mod.key;
      site.rewardBonus = mod.rewardBonus || null;
      site.eliteBiasAdd = mod.eliteBiasAdd || 0;
      if (mod.key === 'none') return;

      site.name += ' — ' + mod.label;
      let spawns = z.siteSpawns.filter(s => s.siteIndex === siteIndex);

      if (mod.removeSpawnFrac && spawns.length > 1) {
        const removeCount = Math.min(spawns.length - 1, Math.floor(spawns.length * mod.removeSpawnFrac));
        const removed = new Set(rng.shuffle(spawns.slice()).slice(0, removeCount).map(s => s.key));
        z.siteSpawns = z.siteSpawns.filter(s => !removed.has(s.key));
        site.keys = site.keys.filter(k => !removed.has(k));
        spawns = spawns.filter(s => !removed.has(s.key));
      }

      if (mod.extraSpawns && spawns.length) {
        for (let j = 0; j < mod.extraSpawns; j++) {
          const source = spawns[j % spawns.length];
          const angle = rng.next() * Math.PI * 2;
          const dist = 2 + (j % 2);
          const spot = nearestFree(z,
            site.tx + Math.round(Math.cos(angle) * dist),
            site.ty + Math.round(Math.sin(angle) * dist), 4);
          if (!spot) continue;
          const extra = Object.assign({}, source, {
            key: site.prefix + ':x' + cycle + ':' + j,
            x: spot.tx * T + 8, y: spot.ty * T + 8,
            spawnIndex: spawns.length + j
          });
          z.siteSpawns.push(extra);
          site.keys.push(extra.key);
        }
      }
    });
  }

  /* ================================================================
     COSTRUZIONE DELLA ZONA
     ================================================================ */
  function generate(zoneId) {
    const def = D.zones[zoneId];
    if (!def) return null;
    const z = {
      id: zoneId, def: def, w: def.w, h: def.h,
      pxW: def.w * T, pxH: def.h * T,
      tiles: new Uint8Array(def.w * def.h),
      variant: new Uint8Array(def.w * def.h),
      solid: new Uint8Array(def.w * def.h),
      elev: new Uint8Array(def.w * def.h),
      props: [], chests: [], nodes: [], npcs: [], exits: [], interactables: [],
      sites: [], siteSpawns: [], ambushes: [], shrines: [],
      spawnDefs: def.spawns || [], namedDefs: def.named || []
    };
    const rng = new CV.Rng(def.seed);

    /* Quota di appoggio a bassa frequenza: i biomi a cielo aperto la
       sovrascrivono col loro stesso rumore (riusato, non ricalcolato).
       Miniera e Rocca scavano invece di generare rumore, ma restano
       comunque con una quota plausibile per il rilievo del renderer. */
    for (let y = 0; y < z.h; y++)
      for (let x = 0; x < z.w; x++)
        z.elev[idx(z, x, y)] = CV.noise.fbm(x / 14, y / 14, def.seed + 4200, 3) * 255;

    switch (def.biome) {
      case 'village': genVillage(z, rng); break;
      case 'moor': genMoor(z, rng); break;
      case 'forest': genForest(z, rng); break;
      case 'cave': genCave(z, rng); break;
      case 'keep': genKeep(z, rng); break;
      default: genMoor(z, rng);
    }

    /* Siti: dopo il bioma, prima dell'arredo. Un accampamento deve poter
       spianare la sua radura senza che l'erba ci sia già cresciuta sopra. */
    placeSites(z, rng);

    /* Arredo: dopo il terreno, prima dei punti d'interesse, così l'erba
       non spunta in mezzo a un forziere o davanti a un mercante. */
    scatterDecor(z, rng, busyMap(z));

    const floorKey = def.biome === 'cave' ? 'cave_floor' : (def.biome === 'keep' ? 'keep_floor' : 'path');

    /* Uscite */
    (def.exits || []).forEach((e, i) => {
      clearAround(z, e.tx, e.ty, 2, floorKey);
      const locked = !!e.requires;
      z.exits.push({
        i: i, to: e.to, label: e.label, requires: e.requires, lockedText: e.lockedText,
        x: e.tx * T + 8, y: e.ty * T + 8, r: 20, from: e.from,
        img: A.sprite(locked ? 'gate' : 'portal')
      });
    });

    /* Oggetti fissi dello scenario */
    (def.props || []).forEach(p => {
      clearAround(z, p.tx, p.ty, 1, floorKey);
      const img = A.sprite(p.kind === 'forge' ? 'forge' : p.kind === 'cauldron' ? 'cauldron' : p.kind === 'sign' ? 'sign' : p.kind === 'noticeboard' ? 'noticeboard' : 'campfire');
      const o = { kind: p.kind, img: img, x: p.tx * T + 8, y: p.ty * T + 16, ox: 8, oy: 16, text: p.text,
        col: (p.kind === 'sign' || p.kind === 'noticeboard') ? null : { x: p.tx * T + 3, y: p.ty * T + 6, w: 11, h: 9 } };
      z.props.push(o);
      if (p.kind === 'forge' || p.kind === 'cauldron' || p.kind === 'campfire' || p.kind === 'sign' || p.kind === 'noticeboard') {
        z.interactables.push({ kind: p.kind, x: o.x, y: o.y - 8, r: 26, text: p.text,
          label: p.kind === 'forge' ? 'Fucina' : p.kind === 'cauldron' ? 'Calderone' : p.kind === 'campfire' ? 'Riposa' : p.kind === 'noticeboard' ? 'Bacheca' : 'Leggi' });
      }
    });

    /* Forzieri */
    (def.chests || []).forEach((c, i) => {
      clearAround(z, c.tx, c.ty, 1, floorKey);
      const o = { key: 'chest' + i, table: c.table, x: c.tx * T + 8, y: c.ty * T + 14, open: false };
      z.chests.push(o);
      z.interactables.push({ kind: 'chest', ref: o, x: o.x, y: o.y - 6, r: 26, label: 'Apri' });
    });

    /* Nodi di raccolta */
    (def.nodes || []).forEach((n, i) => {
      clearAround(z, n.tx, n.ty, 1, floorKey);
      const o = { key: 'node' + i, type: n.type, x: n.tx * T + 8, y: n.ty * T + 14, spent: 0 };
      z.nodes.push(o);
      z.interactables.push({ kind: 'node', ref: o, x: o.x, y: o.y - 6, r: 24, label: 'Raccogli' });
    });

    /* Personaggi non giocanti */
    for (const id in D.npcs) {
      const n = D.npcs[id];
      if (n.zone !== zoneId) continue;
      clearAround(z, n.tx, n.ty, 1, floorKey);
      const o = { id: id, def: n, x: n.tx * T + 8, y: n.ty * T + 8, face: 0, t: 0 };
      z.npcs.push(o);
      z.interactables.push({ kind: 'npc', ref: o, x: o.x, y: o.y, r: 28, label: n.name });
    }

    /* Ordinamento dei prop per profondità: chi sta più in basso copre chi sta sopra */
    z.props.sort((a, b) => a.y - b.y);
    return z;
  }

  /* ================================================================
     COLLISIONI
     ================================================================ */
  function solidAt(z, px, py) {
    const tx = Math.floor(px / T), ty = Math.floor(py / T);
    if (!inside(z, tx, ty)) return true;
    if (z.solid[idx(z, tx, ty)]) return true;
    return false;
  }

  /* Collisione a cerchio contro griglia + box dei prop. */
  function blocked(z, px, py, r) {
    if (solidAt(z, px - r, py - r) || solidAt(z, px + r, py - r) ||
        solidAt(z, px - r, py + r) || solidAt(z, px + r, py + r) ||
        solidAt(z, px, py)) return true;
    for (const p of z.props) {
      const c = p.col;
      if (!c) continue;
      if (px + r > c.x && px - r < c.x + c.w && py + r > c.y && py - r < c.y + c.h) return true;
    }
    return false;
  }

  /* Movimento con scivolamento lungo i muri: evita di "incollarsi" agli angoli. */
  function moveWithCollision(z, e, dx, dy) {
    const r = e.radius || 7;
    if (dx !== 0) {
      if (!blocked(z, e.x + dx, e.y, r)) e.x += dx;
      else {
        /* Prova a scivolare in diagonale, mezzo passo per volta */
        if (!blocked(z, e.x + dx * 0.5, e.y, r)) e.x += dx * 0.5;
      }
    }
    if (dy !== 0) {
      if (!blocked(z, e.x, e.y + dy, r)) e.y += dy;
      else if (!blocked(z, e.x, e.y + dy * 0.5, r)) e.y += dy * 0.5;
    }
    e.x = M.clamp(e.x, r, z.pxW - r);
    e.y = M.clamp(e.y, r, z.pxH - r);
  }

  /* Trova la casella calpestabile più vicina: usata per gli spawn. */
  function findFreeSpot(z, rng, avoidX, avoidY, minDist) {
    for (let i = 0; i < 400; i++) {
      const tx = rng.int(3, z.w - 4), ty = rng.int(3, z.h - 4);
      const px = tx * T + 8, py = ty * T + 8;
      if (blocked(z, px, py, 8)) continue;
      const key = A.TILE_KEYS[z.tiles[idx(z, tx, ty)]];
      if (key === 'water' || key === 'lava') continue;
      if (avoidX != null && M.dist(px, py, avoidX, avoidY) < (minDist || 140)) continue;
      return { x: px, y: py };
    }
    /* Se i tentativi casuali non bastano, cerca sistematicamente prima di
       rinunciare: l'area sicura non deve essere violata da un fallback. */
    if (avoidX != null) {
      const limit = minDist || 140;
      for (let ty = 3; ty <= z.h - 4; ty++) {
        for (let tx = 3; tx <= z.w - 4; tx++) {
          const px = tx * T + 8, py = ty * T + 8;
          if (blocked(z, px, py, 8)) continue;
          const key = A.TILE_KEYS[z.tiles[idx(z, tx, ty)]];
          if (key === 'water' || key === 'lava') continue;
          if (M.dist(px, py, avoidX, avoidY) >= limit) return { x: px, y: py };
        }
      }
      return null;
    }
    return { x: z.pxW / 2, y: z.pxH / 2 };
  }

  /* Punto di comparsa entrando in una zona: vicino all'uscita che riporta indietro. */
  function entryPoint(z, fromZone) {
    if (fromZone) {
      const ex = z.exits.find(e => e.to === fromZone);
      if (ex) {
        /* Un po' spostati dal varco, così non si rientra subito */
        const off = 26;
        const cx = z.pxW / 2, cy = z.pxH / 2;
        const dx = Math.sign(cx - ex.x), dy = Math.sign(cy - ex.y);
        return { x: ex.x + dx * off, y: ex.y + dy * off };
      }
    }
    const d = z.def;
    if (d.biome === 'village') return { x: 24 * 16 + 8, y: 30 * 16 };
    const rng = new CV.Rng(d.seed + 991);
    return findFreeSpot(z, rng);
  }

  CV.World = { T, generate, rollSiteMods, solidAt, blocked, moveWithCollision, findFreeSpot, entryPoint, idx, inside, TI };
})(typeof window !== 'undefined' ? window : globalThis);
