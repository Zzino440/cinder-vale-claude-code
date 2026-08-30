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
    /* Terreno freddo e saturo d'acqua: il verde sopravvive solo a chiazze,
       mentre cenere e fango dominano le aree calpestate. */
    for (let y = 0; y < z.h; y++) {
      for (let x = 0; x < z.w; x++) {
        const n = CV.noise.fbm(x / 9, y / 9, d.seed, 3);
        setTile(z, x, y, n > 0.55 ? 'dirt' : (n < 0.43 ? 'ash_grass' : 'grass'), false);
      }
    }
    /* Palizzata perimetrale con varchi verso le uscite */
    for (let x = 0; x < z.w; x++) { setTile(z, x, 0, 'village_wall', true); setTile(z, x, 1, 'village_wall', true); setTile(z, x, z.h - 1, 'village_wall', true); }
    for (let y = 0; y < z.h; y++) { setTile(z, 0, y, 'village_wall', true); setTile(z, 1, y, 'village_wall', true); setTile(z, z.w - 1, y, 'village_wall', true); setTile(z, z.w - 2, y, 'village_wall', true); }

    /* Strade principali e piazza: abbastanza larghe per combattere e per
       leggere bene sul touch, ma con bordi irregolari aggiunti dal terreno. */
    fillRect(z, 21, 4, 6, z.h - 6, 'path', false);
    fillRect(z, 5, 20, z.w - 10, 6, 'path', false);
    fillRect(z, 17, 17, 14, 15, 'path', false);

    /* Case attorno alla piazza */
    const spots = [
      [6, 13, 0], [36, 11, 2], [18, 21, 1], [29, 18, 0], [15, 5, 1], [30, 36, 2]
    ];
    for (const [tx, ty, v] of spots) {
      const img = A.hdHouse() || A.house(v);
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

    /* Landmark e arredi deliberati: Ashford deve sembrare abitata, non
       prodotta da una semplice dispersione casuale di oggetti. */
    const fixed = [
      ['hearth_shrine', A.hdProp('shrine') || A.hearthShrine(), 24, 27, 18, 8],
      ['handcart', A.hdProp('handcart') || A.handcart(0), 30, 29, 22, 7],
      ['handcart', A.hdProp('handcart') || A.handcart(1), 13, 27, 22, 7],
      ['woodpile', A.hdProp('woodpile') || A.woodpile(0), 29, 19, 20, 6],
      ['woodpile', A.hdProp('woodpile') || A.woodpile(1), 17, 33, 20, 6]
    ];
    for (const [kind, img, tx, ty, cw, ch] of fixed) {
      const x = tx * T + 8, y = ty * T + 16;
      z.props.push({ kind: kind, img: img, x: x, y: y, ox: img.width / 2, oy: img.height,
        col: { x: x - cw / 2, y: y - ch, w: cw, h: ch } });
      z.solid[idx(z, tx, ty)] = 1;
    }

    /* Alberi e cespugli negli spazi liberi */
    scatterNature(z, rng, 34, 24, [0, 1], 0.62);
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
      }
    }
    borderWalls(z, 'rock_wall');
    /* Sentiero irregolare che attraversa la brughiera */
    windingPath(z, rng, 32, z.h - 4, 60, 14, 'path');
    windingPath(z, rng, 32, 40, 4, 30, 'path');
    scatterNature(z, rng, 30, 34, [2, 3], 0.35);
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
      }
    }
    borderWalls(z, 'rock_wall');
    windingPath(z, rng, z.w - 4, 32, 32, 4, 'path');
    /* Bosco fitto: la densità cresce lontano dai sentieri */
    scatterNature(z, rng, 150, 70, [0, 2, 3], 0.9);
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
    /* Canali di lava ai lati della sala */
    fillRect(z, 8, 21, 32, 1, 'lava', true);
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
      const img = A.hdTree(v) || A.tree(v);
      z.props.push({ kind: 'tree', img: img, sway: v >= 2 ? 0.35 : 0.6, x: tx * T + 8, y: ty * T + 16, ox: img.width / 2, oy: img.height,
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
      const bushVariant = rng.int(0, 1);
      const img = A.hdVegetation('bush', bushVariant) || A.bush(bushVariant);
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
    tallgrass:  { make: (v) => A.hdVegetation('tallgrass', v) || A.tallgrass(v), n: 3, oy: 13, sway: 1.00, solid: false },
    flowers:    { make: (v) => A.hdVegetation('flowers', v) || A.flowers(v),     n: 4, oy: 11, sway: 0.70, solid: false },
    mushrooms:  { make: (v) => A.hdVegetation('mushrooms', v) || A.mushrooms(v), n: 3, oy: 13, sway: 0.25, solid: false, glow: true },
    boneheap:   { make: (v) => A.boneheap(v),  n: 2, oy: 13, sway: 0,    solid: false },
    cobweb:     { make: (v) => A.cobweb(v),    n: 2, oy: 14, sway: 0.35, solid: false },
    stump:      { make: (v) => A.hdVegetation('stump', v) || A.stump(v), n: 3, oy: 15, sway: 0, solid: true, cw: 11, ch: 6 },
    barrel:     { make: () => A.hdProp('barrel') || A.barrel(), n: 1, oy: 17, sway: 0, solid: true, cw: 10, ch: 6 },
    crate:      { make: () => A.hdProp('crate') || A.crate(),   n: 1, oy: 15, sway: 0, solid: true, cw: 12, ch: 6 },
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
    village: [['tallgrass', 92], ['flowers', 28], ['fence', 18], ['barrel', 10], ['crate', 9], ['stump', 7]],
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
        const oy = img.hd ? img.height : (def.oy || img.height);
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
      props: [], chests: [], nodes: [], npcs: [], exits: [], interactables: [],
      spawnDefs: def.spawns || [], namedDefs: def.named || []
    };
    const rng = new CV.Rng(def.seed);

    switch (def.biome) {
      case 'village': genVillage(z, rng); break;
      case 'moor': genMoor(z, rng); break;
      case 'forest': genForest(z, rng); break;
      case 'cave': genCave(z, rng); break;
      case 'keep': genKeep(z, rng); break;
      default: genMoor(z, rng);
    }

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
      const img = A.sprite(p.kind === 'forge' ? 'forge' : p.kind === 'cauldron' ? 'cauldron' : p.kind === 'sign' ? 'sign' : 'campfire');
      const o = { kind: p.kind, img: img, x: p.tx * T + 8, y: p.ty * T + 16, ox: 8, oy: 16, text: p.text,
        col: p.kind === 'sign' ? null : { x: p.tx * T + 3, y: p.ty * T + 6, w: 11, h: 9 } };
      z.props.push(o);
      if (p.kind === 'forge' || p.kind === 'cauldron' || p.kind === 'campfire' || p.kind === 'sign') {
        z.interactables.push({ kind: p.kind, x: o.x, y: o.y - 8, r: 26, text: p.text,
          label: p.kind === 'forge' ? 'Fucina' : p.kind === 'cauldron' ? 'Calderone' : p.kind === 'campfire' ? 'Riposa' : 'Leggi' });
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

  CV.World = { T, generate, solidAt, blocked, moveWithCollision, findFreeSpot, entryPoint, idx, inside, TI };
})(typeof window !== 'undefined' ? window : globalThis);
