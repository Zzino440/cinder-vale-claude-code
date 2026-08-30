/* ============================================================
   RENDERER.
   Il mondo viene disegnato su un buffer a bassa risoluzione e poi
   ingrandito di un fattore INTERO: è così che la pixel art resta
   nitida invece di sfocarsi. L'interfaccia viene disegnata sopra,
   a risoluzione nativa, per avere testo leggibile.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const A = CV.Art;
  const W = CV.World;
  const P = CV.Player;
  const M = CV.M;
  const T = 16;
  /* Intensità del rilievo del terreno (passata di luce macro in
     buildZoneCanvas). Un solo numero per tarare l'intero effetto. */
  const RELIEF = 0.55;

  const R = {
    canvas: null, ctx: null,
    buf: null, bctx: null,
    cssW: 0, cssH: 0, dpr: 1, scale: 3,
    viewW: 0, viewH: 0,
    cam: { x: 0, y: 0 },
    zoneCanvas: null, zoneId: null,
    lightCanvas: null,
    ashParticles: [],
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    shakeX: 0, shakeY: 0,
    time: 0,
    quality: 'medium',        /* low | medium | high */
    bloomCanvas: null, bloomCtx: null, blurOk: false
  };

  function init(canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d');
    resize();
    root.addEventListener('resize', resize);
    root.addEventListener('orientationchange', () => setTimeout(resize, 120));
  }

  /* Non tutti i browser supportano ctx.filter: senza, si ripiega su un
     bagliore meno morbido invece di rompere il disegno. */
  function testBlur(ctx) {
    try {
      ctx.filter = 'blur(2px)';
      const ok = ctx.filter !== 'none';
      ctx.filter = 'none';
      return ok;
    } catch (e) { return false; }
  }

  function readInsets() {
    const s = getComputedStyle(document.documentElement);
    const get = (n) => parseFloat(s.getPropertyValue(n)) || 0;
    /* env() non è leggibile da JS: si usa una stima ragionevole. */
    const top = root.visualViewport ? 0 : 0;
    return { top: 8, right: 6, bottom: 10, left: 6 };
  }

  function resize() {
    const c = R.canvas;
    R.cssW = c.clientWidth || root.innerWidth;
    R.cssH = c.clientHeight || root.innerHeight;
    R.dpr = Math.min(root.devicePixelRatio || 1, 2);
    c.width = Math.floor(R.cssW * R.dpr);
    c.height = Math.floor(R.cssH * R.dpr);

    /* Fattore di ingrandimento intero: più grande su schermi grandi */
    const minDim = Math.min(R.cssW, R.cssH);
    R.scale = M.clamp(Math.round(minDim / 210), 2, 5);
    R.viewW = Math.ceil(R.cssW / R.scale);
    R.viewH = Math.ceil(R.cssH / R.scale);

    R.buf = A.makeCanvas(R.viewW, R.viewH);
    R.bctx = R.buf.getContext('2d');
    R.bctx.imageSmoothingEnabled = false;
    R.ctx.imageSmoothingEnabled = false;

    /* Il bagliore lavora a metà risoluzione: è sfocato comunque, quindi
       nessuno se ne accorge e costa un quarto dei pixel. */
    R.bloomCanvas = A.makeCanvas(Math.max(1, R.viewW >> 1), Math.max(1, R.viewH >> 1));
    R.bloomCtx = R.bloomCanvas.getContext('2d');
    R.blurOk = testBlur(R.bloomCtx);

    R.insets = readInsets();
    CV.Input.setLayout(R.cssW, R.cssH, R.insets);
    buildLight();
    seedAsh();
  }

  /* Maschera di luce per le zone buie: un alone attorno al giocatore. */
  function buildLight() {
    const w = R.viewW, h = R.viewH;
    const cv = A.makeCanvas(w, h);
    R.lightCanvas = cv;
  }

  /* Particolato d'ambiente. Ogni bioma respira in modo diverso: cenere
     sulla valle, foglie e lucciole nel bosco, spore nella miniera,
     braci che salgono nella Rocca. */
  const AMBIENT = {
    village: { ash: 0.7, leaf: 0.2, fly: 0.1, ember: 0 },
    moor:    { ash: 0.9, leaf: 0.1, fly: 0,   ember: 0 },
    forest:  { ash: 0.4, leaf: 0.3, fly: 0.3, ember: 0 },
    cave:    { ash: 0.2, leaf: 0,   fly: 0.6, ember: 0.2 },
    keep:    { ash: 0.5, leaf: 0,   fly: 0,   ember: 0.5 }
  };

  function seedAsh(biome) {
    R.ashParticles = [];
    R.ashBiome = biome || 'moor';
    const mix = AMBIENT[R.ashBiome] || AMBIENT.moor;
    const n = Math.round(R.viewW * R.viewH / 2200);
    const pick = () => {
      let r = Math.random();
      for (const k of ['ash', 'leaf', 'fly', 'ember']) {
        r -= mix[k];
        if (r <= 0) return k;
      }
      return 'ash';
    };
    for (let i = 0; i < n; i++) {
      const type = pick();
      R.ashParticles.push({
        type: type,
        x: Math.random() * R.viewW, y: Math.random() * R.viewH,
        vy: type === 'ember' ? -(8 + Math.random() * 16) : (type === 'fly' ? -2 + Math.random() * 4 : 6 + Math.random() * 14),
        vx: type === 'fly' ? -3 + Math.random() * 6 : -4 - Math.random() * 8,
        s: Math.random() < 0.75 ? 1 : 2,
        a: 0.15 + Math.random() * 0.3,
        ph: Math.random() * Math.PI * 2,
        rot: Math.random() * 6
      });
    }
  }

  /* ---------------- Pre-render del terreno ----------------
     Le transizioni fra terreni si calcolano qui, una volta sola quando si
     entra nella zona: a gioco avviato costano zero. */
  const NEIGH = [
    [0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3],
    [1, -1, 4], [1, 1, 5], [-1, 1, 6], [-1, -1, 7]
  ];

  /* Mappa di luce del terreno: un pixel per tile. Combina la pendenza
     ricavata da `z.elev` (luce fissa da nord-ovest, coerente col
     gradiente degli sprite in art.js) con un rumore a bassa frequenza
     che aggiunge chiazze larghe di luce e ombra — la modulazione su
     scala di mappa che manca del tutto se si guarda solo la pendenza
     tile per tile. Ogni pixel è bianco (schiarisce) o nero (scurisce):
     lo smoothing acceso alla stesura fonde i due in una sfumatura. */
  function buildRelief(z) {
    const w = z.w, h = z.h;
    const cv = A.makeCanvas(w, h);
    const rctx = cv.getContext('2d');
    const img = rctx.createImageData(w, h);
    const d = img.data;
    const elev = z.elev;
    const getE = (x, y) => elev[M.clamp(y, 0, h - 1) * w + M.clamp(x, 0, w - 1)];
    const seed = z.def.seed + 8100;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const slope = ((getE(x - 1, y) - getE(x + 1, y)) + (getE(x, y - 1) - getE(x, y + 1))) / 255;
        const macro = CV.noise.fbm(x / 9, y / 9, seed, 2) * 2 - 1;
        const s = M.clamp(slope * 0.5 + macro * 0.4, -1, 1);
        const i = (y * w + x) * 4;
        const a = Math.round(Math.abs(s) * RELIEF * 90);
        if (s >= 0) { d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a; }
        else { d[i + 3] = a; }
      }
    }
    rctx.putImageData(img, 0, 0);
    return cv;
  }

  function buildZoneCanvas(z) {
    if (R.zoneId === z.id && R.zoneCanvas) return R.zoneCanvas;
    const atlas = A.getTileAtlas();
    const cv = A.makeCanvas(z.pxW, z.pxH);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    /* Passata 1: il terreno di base */
    for (let ty = 0; ty < z.h; ty++) {
      for (let tx = 0; tx < z.w; tx++) {
        const i = ty * z.w + tx;
        ctx.drawImage(atlas, z.variant[i] * T, z.tiles[i] * T, T, T, tx * T, ty * T, T, T);
      }
    }

    /* Passata 2: ogni terreno "più alto" sborda sui vicini più bassi con
       un margine sfrangiato. Va fatta dopo, o le transizioni verrebbero
       coperte dai tile disegnati più tardi. */
    /* `higher(tx,ty)` = indice del terreno del vicino se sborda su questo,
       altrimenti -1. Serve anche a decidere se un angolo è già coperto
       dai due lati che lo affiancano: in quel caso si salta, e sono la
       maggioranza dei casi. */
    const zOf = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= z.w || ty >= z.h) return null;
      return A.TILE_DEFS[A.TILE_KEYS[z.tiles[ty * z.w + tx]]];
    };

    for (let ty = 0; ty < z.h; ty++) {
      for (let tx = 0; tx < z.w; tx++) {
        const selfDef = zOf(tx, ty);
        if (!selfDef || selfDef.wall) continue;
        const selfZ = selfDef.z;

        for (let k = 0; k < NEIGH.length; k++) {
          const dx = NEIGH[k][0], dy = NEIGH[k][1], dir = NEIGH[k][2];
          const nDef = zOf(tx + dx, ty + dy);
          if (!nDef || nDef.wall || nDef.z <= selfZ) continue;

          /* Angolo già chiuso dai lati adiacenti: nulla da disegnare */
          if (dir >= 4) {
            const sideA = zOf(tx + dx, ty), sideB = zOf(tx, ty + dy);
            const aCovers = sideA && !sideA.wall && sideA.z > selfZ;
            const bCovers = sideB && !sideB.wall && sideB.z > selfZ;
            if (aCovers && bCovers) continue;
          }

          const ni = (ty + dy) * z.w + (tx + dx);
          const maskVar = (CV.noise.hash2(tx, ty, 4000 + dir) * A.MASK_VARIANTS) | 0;
          ctx.drawImage(A.edgePiece(z.tiles[ni], z.variant[ni], dir, maskVar), tx * T, ty * T);
        }
      }
    }

    /* Passata 2.5: rilievo del terreno. Un pixel per tile, con lo
       smoothing acceso quando viene steso: il browser lo trasforma in una
       sfumatura continua invece che in un mosaico quadrettato, e questo
       attenua anche i confini a scalino fra terreni diversi lasciati
       dalle passate precedenti. È la luce che manca alle zone a cielo
       aperto: senza, ogni pixel della mappa riceve la stessa luce e il
       terreno legge come una texture invece che come un luogo. */
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(buildRelief(z), 0, 0, z.w, z.h, 0, 0, z.pxW, z.pxH);
    ctx.imageSmoothingEnabled = false;

    /* Passata 3: i muri prendono forma. Un muro non è un rettangolo di
       colore: ha una cima illuminata, spigoli, e una faccia frontale in
       ombra. È quello che li fa leggere come roccia invece che come
       campitura. */
    const isWall = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= z.w || ty >= z.h) return true;
      const d = A.TILE_DEFS[A.TILE_KEYS[z.tiles[ty * z.w + tx]]];
      return !!(d && d.wall);
    };

    for (let ty = 0; ty < z.h; ty++) {
      for (let tx = 0; tx < z.w; tx++) {
        if (!isWall(tx, ty)) continue;
        const px = tx * T, py = ty * T;
        const up = isWall(tx, ty - 1), down = isWall(tx, ty + 1);
        const left = isWall(tx - 1, ty), right = isWall(tx + 1, ty);

        /* Cresta illuminata dove il muro si affaccia sul vuoto */
        if (!up) {
          ctx.fillStyle = 'rgba(190,180,210,0.30)';
          ctx.fillRect(px, py, T, 2);
          ctx.fillStyle = 'rgba(230,220,245,0.16)';
          ctx.fillRect(px, py, T, 1);
        }
        /* Faccia frontale: la parte che "guarda" il giocatore, più scura */
        if (!down) {
          const g = ctx.createLinearGradient(0, py + T - 6, 0, py + T);
          g.addColorStop(0, 'rgba(6,4,10,0)');
          g.addColorStop(1, 'rgba(6,4,10,0.55)');
          ctx.fillStyle = g;
          ctx.fillRect(px, py + T - 6, T, 6);
          ctx.fillStyle = 'rgba(6,4,10,0.75)';
          ctx.fillRect(px, py + T - 1, T, 1);
        }
        /* Spigoli laterali */
        if (!left) { ctx.fillStyle = 'rgba(8,5,14,0.35)'; ctx.fillRect(px, py, 1, T); }
        if (!right) { ctx.fillStyle = 'rgba(8,5,14,0.35)'; ctx.fillRect(px + T - 1, py, 1, T); }

        /* Ombra proiettata sul terreno sotto */
        if (!down) {
          const g2 = ctx.createLinearGradient(0, py + T, 0, py + T + 8);
          g2.addColorStop(0, 'rgba(8,5,14,0.50)');
          g2.addColorStop(1, 'rgba(8,5,14,0)');
          ctx.fillStyle = g2;
          ctx.fillRect(px, py + T, T, 8);
        }
      }
    }

    /* Passata 4: minuzie sul terreno — sassolini, crepe, radici. Servono
       a togliere la sensazione di superficie verniciata, e disegnate qui
       non costano nulla mentre si gioca. */
    const drng = new CV.Rng(z.def.seed ^ 0x5eed);
    const detailCount = Math.round(z.w * z.h * 0.16);
    for (let i = 0; i < detailCount; i++) {
      const tx = drng.int(1, z.w - 2), ty = drng.int(1, z.h - 2);
      const ti = ty * z.w + tx;
      const def = A.TILE_DEFS[A.TILE_KEYS[z.tiles[ti]]];
      if (!def || def.wall || def.liquid) continue;
      const px = tx * T + drng.int(0, 15), py = ty * T + drng.int(0, 15);
      const roll = drng.next();
      if (roll < 0.45) {
        /* sassolino con la sua ombretta */
        ctx.fillStyle = 'rgba(8,5,14,0.35)';
        ctx.fillRect(px, py + 1, 2, 1);
        ctx.fillStyle = def.speck;
        ctx.fillRect(px, py, 2, 1);
      } else if (roll < 0.75) {
        /* crepa breve */
        ctx.fillStyle = 'rgba(8,5,14,0.28)';
        const len = drng.int(2, 5);
        for (let k = 0; k < len; k++) ctx.fillRect(px + k, py + (drng.chance(0.4) ? 1 : 0), 1, 1);
      } else {
        /* ciuffo o radice */
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(px, py, 3, 1);
      }
    }

    /* Passata 5: ombre proiettate. Solo dagli oggetti solidi (hanno `col`):
       alberi, rocce, case, tronchi — non ogni ciuffo d'erba, o il bosco
       diventerebbe un pulviscolo di macchie invece che restare leggibile.
       Un'ellisse schiacciata ancorata al punto di contatto col terreno,
       non una copia deformata dello sprite: un top-down non ha un vero
       "profilo" da proiettare, e deformare l'intera sagoma la stacca
       visibilmente dalla base quando l'oggetto è alto (è quello che
       succedeva prima). L'ellisse resta sempre attaccata, qualunque sia
       la forma o l'altezza dell'immagine sopra. Baked col terreno: a
       gioco avviato costa zero, e finisce sotto tutto — giocatore
       compreso, che ci cammina sopra. */
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = '#050308';
    for (const p of z.props) {
      if (!p.col) continue;
      const rx = Math.max(7, p.col.w * 0.85);
      const ry = Math.max(3, rx * 0.4);
      A.ellip(ctx, Math.round(p.x + rx * 0.22), Math.round(p.y + ry * 0.35), Math.round(rx), Math.round(ry));
    }
    ctx.globalAlpha = 1;

    /* Memorizza dove sta l'acqua: il renderer la anima a ogni fotogramma */
    R.waterTiles = [];
    for (let ty = 0; ty < z.h; ty++) {
      for (let tx = 0; tx < z.w; tx++) {
        const d = A.TILE_DEFS[A.TILE_KEYS[z.tiles[ty * z.w + tx]]];
        if (d && d.liquid) R.waterTiles.push(tx, ty, d === A.TILE_DEFS.lava ? 1 : 0);
      }
    }

    R.zoneCanvas = cv;
    R.zoneId = z.id;
    return cv;
  }

  function invalidateZone() { R.zoneCanvas = null; R.zoneId = null; }

  /* Cambio zona: si butta il terreno pre-renderizzato e si ricalibra
     l'atmosfera sul nuovo bioma. */
  function onZone(z) {
    invalidateZone();
    R.waterTiles = [];
    seedAsh(z.def.biome);
    const b = z.def.biome;
    R.fogEnabled = (b === 'moor' || b === 'forest' || b === 'keep');
  }

  /* ---------------- Camera ---------------- */
  function updateCamera(G, dt) {
    const pe = G.pe, z = G.zone;
    let tx = pe.x - R.viewW / 2;
    let ty = pe.y - R.viewH / 2;
    /* La camera non esce mai dai bordi della zona (se la zona è più grande della vista) */
    tx = z.pxW > R.viewW ? M.clamp(tx, 0, z.pxW - R.viewW) : (z.pxW - R.viewW) / 2;
    ty = z.pxH > R.viewH ? M.clamp(ty, 0, z.pxH - R.viewH) : (z.pxH - R.viewH) / 2;
    const k = 1 - Math.pow(0.0015, dt);
    R.cam.x += (tx - R.cam.x) * k;
    R.cam.y += (ty - R.cam.y) * k;
  }

  function snapCamera(G) {
    const pe = G.pe, z = G.zone;
    R.cam.x = z.pxW > R.viewW ? M.clamp(pe.x - R.viewW / 2, 0, z.pxW - R.viewW) : (z.pxW - R.viewW) / 2;
    R.cam.y = z.pxH > R.viewH ? M.clamp(pe.y - R.viewH / 2, 0, z.pxH - R.viewH) : (z.pxH - R.viewH) / 2;
  }

  function worldToScreen(wx, wy) {
    return { x: (wx - R.cam.x) * R.scale, y: (wy - R.cam.y) * R.scale };
  }
  function screenToWorld(sx, sy) {
    return { x: sx / R.scale + R.cam.x, y: sy / R.scale + R.cam.y };
  }

  /* ================================================================
     DISEGNO DEL FRAME
     ================================================================ */
  function draw(G, dt) {
    R.time += dt;
    const b = R.bctx;
    const ox = Math.round(R.cam.x - R.shakeX), oy = Math.round(R.cam.y - R.shakeY);

    b.fillStyle = '#0d0b10';
    b.fillRect(0, 0, R.viewW, R.viewH);

    /* Terreno */
    const zc = buildZoneCanvas(G.zone);
    b.drawImage(zc, ox, oy, R.viewW, R.viewH, 0, 0, R.viewW, R.viewH);

    /* Sopra il terreno ma sotto tutto il resto: liquidi in movimento,
       tracce lasciate dagli scontri, foschia rasoterra. */
    drawLiquids(b, ox, oy);
    drawDecals(b, G, ox, oy);
    drawGroundFog(b, ox, oy);
    drawPlaneVeil(b, G.zone.def.biome);

    /* Raccolta di tutto ciò che va ordinato per profondità */
    const list = [];
    const cull = (x, y, pad) => x > ox - (pad || 40) && x < ox + R.viewW + (pad || 40) && y > oy - 60 && y < oy + R.viewH + 60;

    for (const p of G.zone.props) if (cull(p.x, p.y, 40)) list.push({ y: p.y, t: 'prop', o: p });
    for (const c of G.zone.chests) if (cull(c.x, c.y)) list.push({ y: c.y, t: 'chest', o: c });
    for (const n of G.zone.nodes) if (n.spent <= 0 && cull(n.x, n.y)) list.push({ y: n.y, t: 'node', o: n });
    for (const e of G.zone.exits) if (cull(e.x, e.y)) list.push({ y: e.y - 6, t: 'exit', o: e });
    for (const n of G.zone.npcs) if (cull(n.x, n.y)) list.push({ y: n.y, t: 'npc', o: n });
    for (const d of G.drops) if (cull(d.x, d.y)) list.push({ y: d.y, t: 'drop', o: d });
    for (const e of G.enemies) if (cull(e.x, e.y)) list.push({ y: e.dead ? e.y - 100 : e.y, t: 'enemy', o: e });
    list.push({ y: G.pe.y, t: 'player', o: G.pe });
    list.sort((a, b2) => a.y - b2.y);

    for (const item of list) {
      switch (item.t) {
        case 'prop': drawProp(b, item.o, ox, oy, G); break;
        case 'chest': drawChest(b, item.o, ox, oy); break;
        case 'node': drawNode(b, item.o, ox, oy); break;
        case 'exit': drawExit(b, item.o, ox, oy, G); break;
        case 'npc': drawNpc(b, item.o, ox, oy); break;
        case 'drop': drawDrop(b, item.o, ox, oy); break;
        case 'enemy': drawEnemy(b, item.o, ox, oy, G); break;
        case 'player': drawPlayer(b, G, ox, oy); break;
      }
    }

    /* Proiettili sopra le entità */
    for (const pr of G.projectiles) drawProjectile(b, pr, ox, oy);

    /* Particelle */
    for (const q of G.particles) {
      const a = 1 - q.t / q.life;
      b.globalAlpha = q.fade ? Math.max(0, a) : 1;
      b.fillStyle = q.color;
      b.fillRect(Math.round(q.x - ox), Math.round(q.y - oy), q.size, q.size);
    }
    b.globalAlpha = 1;

    /* Bagliore diffuso, poi buio, poi colore: l'ordine conta. Il bagliore
       nasce dalle luci vere della scena, il buio le lascia emergere, il
       grading dà al luogo la sua temperatura. */
    drawBloom(b);

    /* Oscurità delle caverne */
    if (G.zone.def.dark) drawDarkness(b, G, ox, oy);

    applyGrade(b, G.zone.def.biome, !!G.zone.def.dark);

    /* Cenere che cade: presente in tutta la valle */
    drawAsh(b, dt, G.zone.def.dark ? 0.5 : 1);

    /* Numeri di danno: nel buffer, così scalano con il mondo */
    for (const f of G.floats) {
      const a = 1 - f.t / f.life;
      b.globalAlpha = Math.max(0, a);
      drawPixelText(b, f.text, Math.round(f.x - ox), Math.round(f.y - oy), f.color, true, f.big);
    }
    b.globalAlpha = 1;

    /* Trasferimento al canvas visibile */
    const ctx = R.ctx;
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, R.cssW, R.cssH);
    ctx.drawImage(R.buf, 0, 0, R.viewW, R.viewH, 0, 0, R.viewW * R.scale, R.viewH * R.scale);

    /* Vignettatura */
    drawVignette(ctx);

    /* Interfaccia a risoluzione nativa */
    CV.Hud.draw(ctx, G, dt);
  }

  /* ================================================================
     LUCE E ATMOSFERA
     ================================================================ */

  /* Ogni bioma ha la sua temperatura di colore: è ciò che dà a ciascun
     luogo un'identità propria senza cambiare un solo pixel degli sprite. */
  const GRADE = {
    village: { shadow: '#3a2a4a', shadowA: 0.15, tint: '#ffd8a8', tintA: 0.18 },
    moor:    { shadow: '#2a3348', shadowA: 0.25, tint: '#b9c8dc', tintA: 0.13 },
    forest:  { shadow: '#1e2e26', shadowA: 0.29, tint: '#c2d8a8', tintA: 0.13 },
    cave:    { shadow: '#160f1e', shadowA: 0.30, tint: '#ffb07a', tintA: 0.15 },
    keep:    { shadow: '#2a1020', shadowA: 0.27, tint: '#ff9a6a', tintA: 0.20 }
  };

  let softLightOk = null;
  function supportsSoftLight(ctx) {
    if (softLightOk !== null) return softLightOk;
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'soft-light';
    softLightOk = ctx.globalCompositeOperation === 'soft-light';
    ctx.globalCompositeOperation = prev;
    return softLightOk;
  }

  function applyGrade(b, biome, dark) {
    const g = GRADE[biome] || GRADE.moor;
    b.globalCompositeOperation = 'multiply';
    /* Nelle caverne l'oscurità ha già fatto gran parte del lavoro:
       sommarci l'intero grading le renderebbe illeggibili. */
    b.globalAlpha = dark ? g.shadowA * 0.45 : g.shadowA;
    b.fillStyle = g.shadow;
    b.fillRect(0, 0, R.viewW, R.viewH);

    b.globalCompositeOperation = supportsSoftLight(b) ? 'soft-light' : 'overlay';
    b.globalAlpha = g.tintA;
    b.fillStyle = g.tint;
    b.fillRect(0, 0, R.viewW, R.viewH);

    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
  }

  /* Bagliore diffuso. Le alte luci dell'immagine vengono isolate
     moltiplicando il fotogramma per se stesso (le zone scure crollano a
     zero, quelle chiare resistono), poi sfocate e riaggiunte in somma. */
  function drawBloom(b) {
    if (R.quality === 'low' || !R.bloomCanvas) return;
    const bc = R.bloomCanvas, bx = R.bloomCtx;
    const bw = bc.width, bh = bc.height;

    bx.globalCompositeOperation = 'source-over';
    bx.globalAlpha = 1;
    bx.clearRect(0, 0, bw, bh);
    bx.drawImage(R.buf, 0, 0, R.viewW, R.viewH, 0, 0, bw, bh);

    bx.globalCompositeOperation = 'multiply';
    bx.drawImage(bc, 0, 0);
    bx.drawImage(bc, 0, 0);
    bx.globalCompositeOperation = 'source-over';

    if (R.quality === 'high' && R.blurOk) {
      bx.filter = 'blur(2.5px)';
      bx.drawImage(bc, 0, 0);
      bx.filter = 'none';
    }

    b.globalCompositeOperation = 'lighter';
    /* Dosato: il bagliore deve accendere fuoco e magia, non lavare la scena */
    b.globalAlpha = R.quality === 'high' ? 0.40 : 0.26;
    b.imageSmoothingEnabled = true;
    b.drawImage(bc, 0, 0, bw, bh, 0, 0, R.viewW, R.viewH);
    b.imageSmoothingEnabled = false;
    b.globalCompositeOperation = 'source-over';
    b.globalAlpha = 1;
  }

  /* Acqua che scorre e lava che respira. I tile liquidi sono già nel
     terreno pre-renderizzato: qui sopra passa solo il movimento. */
  function drawLiquids(b, ox, oy) {
    const wt = R.waterTiles;
    if (!wt || !wt.length) return;
    const t = R.time;
    for (let i = 0; i < wt.length; i += 3) {
      const px = wt[i] * T - ox, py = wt[i + 1] * T - oy;
      if (px < -T || py < -T || px > R.viewW || py > R.viewH) continue;

      if (wt[i + 2]) {
        /* Lava: crosta che si apre e si richiude */
        const pulse = 0.5 + Math.sin(t * 1.7 + wt[i] * 0.7 + wt[i + 1] * 0.4) * 0.5;
        b.globalAlpha = 0.20 + pulse * 0.28;
        b.fillStyle = '#ff8a3a';
        b.fillRect(px + 2, py + 4 + Math.round(pulse * 2), 12, 2);
        b.fillRect(px + 5, py + 10 - Math.round(pulse * 2), 7, 2);
        b.globalAlpha = 0.5 + pulse * 0.4;
        b.fillStyle = '#ffd166';
        b.fillRect(px + 6, py + 7, 3, 1);
        b.globalAlpha = 1;
      } else {
        /* Acqua: due creste di riflesso che scivolano a velocità diverse */
        b.globalAlpha = 0.30;
        b.fillStyle = '#7fb4d8';
        const a = Math.round(Math.sin(t * 1.3 + wt[i + 1] * 0.9) * 3);
        const c = Math.round(Math.sin(t * 0.8 + wt[i] * 0.6 + 2) * 4);
        b.fillRect(px + 3 + a, py + 4, 6, 1);
        b.fillRect(px + 6 + c, py + 11, 5, 1);
        b.globalAlpha = 0.16;
        b.fillStyle = '#cfe6f5';
        b.fillRect(px + 4 + a, py + 5, 4, 1);
        b.globalAlpha = 1;
      }
    }
  }

  /* Tracce degli scontri: restano finché non si cambia zona. */
  function drawDecals(b, G, ox, oy) {
    if (!G.decals || !G.decals.length) return;
    for (const d of G.decals) {
      const x = d.x - ox, y = d.y - oy;
      if (x < -20 || y < -20 || x > R.viewW + 20 || y > R.viewH + 20) continue;
      b.globalAlpha = d.a * Math.min(1, d.life / 3);
      b.fillStyle = d.color;
      A.circle(b, Math.round(x), Math.round(y), d.r);
      if (d.r > 2) {
        b.globalAlpha = d.a * 0.5 * Math.min(1, d.life / 3);
        A.circle(b, Math.round(x + d.dx), Math.round(y + d.dy), Math.max(1, d.r - 2));
      }
    }
    b.globalAlpha = 1;
  }

  /* Foschia rasoterra: chiazze larghe e lentissime, ancorate al mondo così
     scorrono con la mappa invece di appiccicarsi allo schermo. */
  function drawGroundFog(b, ox, oy) {
    if (R.quality === 'low' || !R.fogEnabled) return;
    const t = R.time;
    for (let i = 0; i < 6; i++) {
      const seed = i * 719.3;
      const wx = (seed % 900) + t * (5 + (i % 3) * 3);
      const wy = (seed * 1.7 % 700) + Math.sin(t * 0.19 + i) * 14;
      const x = ((wx - ox) % (R.viewW + 220)) - 110;
      const y = ((wy - oy) % (R.viewH + 160)) - 80;
      const rx = 62 + (i % 3) * 26, ry = 22 + (i % 2) * 10;
      const g = b.createRadialGradient(x, y, 1, x, y, rx);
      g.addColorStop(0, 'rgba(198,196,214,0.085)');
      g.addColorStop(0.6, 'rgba(198,196,214,0.035)');
      g.addColorStop(1, 'rgba(198,196,214,0)');
      b.save();
      b.translate(x, y); b.scale(1, ry / rx); b.translate(-x, -y);
      b.fillStyle = g;
      b.fillRect(x - rx, y - rx, rx * 2, rx * 2);
      b.restore();
    }
  }

  /* Vela leggerissima sul solo terreno, prima che entità e prop vengano
     disegnati sopra: schiaccia il fondo verso il colore medio del bioma,
     così chi cammina sul terreno resta a contrasto pieno invece di
     confondersi con esso. Riusa la tabella GRADE già usata da
     applyGrade(), senza introdurne una seconda. */
  function drawPlaneVeil(b, biome) {
    const g = GRADE[biome] || GRADE.moor;
    b.globalAlpha = 0.10;
    b.fillStyle = g.shadow;
    b.fillRect(0, 0, R.viewW, R.viewH);
    b.globalAlpha = 1;
  }

  /* ---------------- Elementi del mondo ---------------- */
  /* Ombra morbida: un'ellisse sfumata pre-renderizzata, scalata al volo.
     Molto più naturale del disco pixelato di prima. */
  function shadow(b, x, y, w, h) {
    const t = A.getShadowTex();
    const ww = w * 1.7, hh = Math.max(4, h * 1.7);
    b.imageSmoothingEnabled = true;
    b.drawImage(t, Math.round(x - ww / 2), Math.round(y - hh / 2), Math.round(ww), Math.round(hh));
    /* Ombra di contatto: stretta, scura, senza sfumatura. È quello che fa
       smettere gli sprite di sembrare sospesi sopra il terreno invece che
       poggiati sopra. */
    b.globalAlpha = 0.5;
    b.fillStyle = '#050308';
    A.ellip(b, Math.round(x), Math.round(y), Math.round(w * 0.28), Math.round(h * 0.4));
    b.globalAlpha = 1;
    b.imageSmoothingEnabled = false;
  }

  /* Ondeggio nel vento: lo sprite viene disegnato in fasce orizzontali,
     ognuna spostata un po' più della precedente salendo. La base resta
     ferma, la cima si piega — come si comporta una pianta vera. */
  function drawSwaying(b, img, dx, dy, amount, phase) {
    const h = img.height;
    const bands = h > 26 ? 5 : 3;
    const bh = Math.ceil(h / bands);
    const s = Math.sin(phase);
    for (let i = 0; i < bands; i++) {
      const sy = i * bh;
      const sh = Math.min(bh, h - sy);
      if (sh <= 0) break;
      const t = 1 - (sy + sh * 0.5) / h;   /* 1 in cima, 0 alla base */
      const off = Math.round(s * amount * t * t);
      b.drawImage(img, 0, sy, img.width, sh, dx + off, dy + sy, img.width, sh);
    }
  }

  function drawProp(b, p, ox, oy, G) {
    const dx = Math.round(p.x - p.ox - ox);
    const dy = Math.round(p.y - p.oy - oy);

    /* Chioma trasparente quando ci cammini sotto: niente più giocatore
       che sparisce dietro un albero. */
    let alpha = 1;
    if (p.kind === 'tree' && G) {
      const pe = G.pe;
      const halfW = p.img.width * 0.42;
      if (Math.abs(pe.x - p.x) < halfW && pe.y < p.y + 4 && pe.y > p.y - p.img.height) alpha = 0.45;
    }
    if (alpha < 1) b.globalAlpha = alpha;

    if (p.sway) {
      /* Ogni pianta ha una fase propria: un bosco che ondeggia all'unisono
         sembra un errore, non vento. */
      const phase = R.time * (1.1 + (p.x % 7) * 0.06) + p.x * 0.09 + p.y * 0.05;
      drawSwaying(b, p.img, dx, dy, 1.2 + p.sway * 2.2, phase);
    } else {
      b.drawImage(p.img, dx, dy);
    }
    if (alpha < 1) b.globalAlpha = 1;

    /* I funghi delle caverne emettono la loro luce fredda */
    if (p.glow) {
      const gx = Math.round(p.x - ox), gy = Math.round(p.y - 8 - oy);
      const pulse = 0.5 + Math.sin(R.time * 1.6 + p.x) * 0.5;
      const rad = 13 + pulse * 3;
      const g = b.createRadialGradient(gx, gy, 1, gx, gy, rad);
      g.addColorStop(0, 'rgba(120,180,255,' + (0.16 + pulse * 0.07) + ')');
      g.addColorStop(1, 'rgba(120,180,255,0)');
      b.fillStyle = g;
      b.fillRect(gx - rad, gy - rad, rad * 2, rad * 2);
    }

    if (p.kind === 'campfire' || p.kind === 'forge') {
      /* Alone caldo attorno al fuoco: sfumato, non un disco piatto */
      const t = R.time * 6;
      const cx = Math.round(p.x - ox), cy = Math.round(p.y - 8 - oy);
      const rad = 22 + Math.sin(t * 0.7) * 2;
      const g = b.createRadialGradient(cx, cy, 1, cx, cy, rad);
      g.addColorStop(0, 'rgba(255,180,90,' + (0.22 + Math.sin(t) * 0.04) + ')');
      g.addColorStop(0.5, 'rgba(240,108,58,0.10)');
      g.addColorStop(1, 'rgba(240,108,58,0)');
      b.fillStyle = g;
      b.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);

      /* Scintille: calcolate dal tempo, senza memoria e senza allocazioni.
         Ogni scintilla ha il suo ciclo di vita e risale ondeggiando. */
      const n = p.kind === 'forge' ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const cycle = 1.1 + (i % 3) * 0.45;
        const k = ((R.time * (0.75 + i * 0.11) + i * 0.37) % 1);
        const life = 1 - k;
        const sx = cx + Math.sin(R.time * 2.4 + i * 2.1) * (2 + k * 5) + (i - n / 2);
        const sy = cy - 2 - k * (13 + (i % 3) * 5);
        b.globalAlpha = life * life * 0.9;
        b.fillStyle = k < 0.45 ? '#ffe9a8' : (k < 0.75 ? '#ffb066' : '#c9541f');
        b.fillRect(Math.round(sx), Math.round(sy), 1, k < 0.3 ? 2 : 1);
      }
      b.globalAlpha = 1;
    }
  }

  function drawChest(b, c, ox, oy) {
    shadow(b, c.x - ox, c.y - oy + 2, 14, 5);
    b.drawImage(A.sprite(c.open ? 'chest_open' : 'chest'), Math.round(c.x - 8 - ox), Math.round(c.y - 14 - oy));
  }

  function drawNode(b, n, ox, oy) {
    const spr = n.type === 'herb' ? 'node_herb' : n.type === 'ore' ? 'node_ore' : 'node_bone';
    shadow(b, n.x - ox, n.y - oy + 2, 12, 4);
    const bob = Math.sin(R.time * 2 + n.x) * 0.5;
    b.drawImage(A.sprite(spr), Math.round(n.x - 8 - ox), Math.round(n.y - 14 - oy + bob));
  }

  function drawExit(b, e, ox, oy, G) {
    const locked = e.requires && !CV.Player.count(G.p, e.requires);
    const img = locked ? A.sprite('gate') : A.sprite('portal');
    if (!locked) {
      const t = R.time * 3;
      b.globalAlpha = 0.18 + Math.sin(t) * 0.06;
      b.fillStyle = '#ffd166';
      A.circle(b, Math.round(e.x - ox), Math.round(e.y - oy), 14);
      b.globalAlpha = 1;
    }
    b.drawImage(img, Math.round(e.x - 8 - ox), Math.round(e.y - 10 - oy));
  }

  function drawNpc(b, n, ox, oy) {
    shadow(b, n.x - ox, n.y + 6 - oy, 12, 5);
    const swap = A.NPC_SWAPS[n.id];
    const bob = Math.floor(Math.sin(R.time * 1.8 + n.x * 0.1) * 1.2);
    b.drawImage(A.sprite('npc', swap), Math.round(n.x - 8 - ox), Math.round(n.y - 14 - oy + bob));
    /* Marcatore sopra la testa */
    const t = Math.sin(R.time * 3) * 1.5;
    b.fillStyle = n.marker === 'quest' ? '#ffd166' : (n.marker === 'turnin' ? '#7cc46a' : null);
    if (b.fillStyle && n.marker) {
      const mx = Math.round(n.x - ox), my = Math.round(n.y - 22 - oy + t);
      b.fillRect(mx - 1, my, 3, 6);
      b.fillRect(mx - 1, my + 8, 3, 3);
    }
  }

  function drawDrop(b, d, ox, oy) {
    const res = P.resolve(d.item);
    const icon = A.iconFor(res);
    const bob = Math.sin(R.time * 4 + d.x) * 1.5;
    b.globalAlpha = 0.3;
    b.fillStyle = '#000';
    A.circle(b, Math.round(d.x - ox), Math.round(d.y - oy + 6), 5);
    b.globalAlpha = 1;
    if (icon) {
      /* Le icone sono 16x16: si disegnano a metà scala per non dominare la scena */
      b.drawImage(icon, 0, 0, 16, 16, Math.round(d.x - 6 - ox), Math.round(d.y - 12 - oy + bob), 12, 12);
    }
    const rar = res ? res.rar : 'common';
    if (rar !== 'common') {
      const col = { fine: '#7cc46a', rare: '#6fb3ff', epic: '#c9a6ff', legend: '#ffd166' }[rar];
      b.globalAlpha = 0.3 + Math.sin(R.time * 5) * 0.12;
      b.fillStyle = col;
      A.circle(b, Math.round(d.x - ox), Math.round(d.y - 6 - oy), 8);
      b.globalAlpha = 1;
    }
  }

  function drawProjectile(b, pr, ox, oy) {
    const x = Math.round(pr.x - ox), y = Math.round(pr.y - oy);
    if (pr.kind === 'arrow') {
      b.strokeStyle = '#c8ae86'; b.lineWidth = 1;
      b.beginPath();
      b.moveTo(x - Math.cos(pr.dir) * 5, y - Math.sin(pr.dir) * 5);
      b.lineTo(x + Math.cos(pr.dir) * 4, y + Math.sin(pr.dir) * 4);
      b.stroke();
      b.fillStyle = '#e2e6ee';
      b.fillRect(x + Math.cos(pr.dir) * 4 - 1, y + Math.sin(pr.dir) * 4 - 1, 2, 2);
    } else {
      const t = R.time * 14;
      b.globalAlpha = 0.5;
      b.fillStyle = '#a5451f';
      A.circle(b, x, y, 5 + Math.sin(t) * 0.6);
      b.globalAlpha = 1;
      b.fillStyle = '#f06c3a';
      A.circle(b, x, y, 3);
      b.fillStyle = '#ffd166';
      A.circle(b, x, y, 1 + (Math.sin(t) > 0 ? 1 : 0));
    }
  }

  function drawEnemy(b, e, ox, oy, G) {
    const x = Math.round(e.x - ox), y = Math.round(e.y - oy);

    if (e.dead) {
      /* Dissolvenza in cenere */
      const a = Math.max(0, 1 - e.deadT / 0.9);
      if (a <= 0) return;
      b.globalAlpha = a * 0.6;
      const spr = A.sprite(e.def.sprite);
      if (spr) b.drawImage(spr, x - spr.width / 2, y - spr.height + 4);
      b.globalAlpha = 1;
      return;
    }

    shadow(b, x, y + e.radius - 1, e.radius * 2, 5);

    /* Alone d'affisso: identifica un'élite a distanza, prima ancora di
       leggerne il nome sopra la barra vita. */
    if (e.affixAura) {
      b.globalAlpha = 0.55 + Math.sin(R.time * 3.2) * 0.12;
      b.strokeStyle = e.affixAura;
      b.lineWidth = 2;
      b.beginPath();
      b.ellipse(x, y + e.radius - 1, e.radius + 3, (e.radius + 3) * 0.5, 0, 0, Math.PI * 2);
      b.stroke();
      b.globalAlpha = 1;
    }

    /* Anello sul bersaglio agganciato: dice a colpo d'occhio chi colpirai.
       Senza questo, l'assistenza di mira lavora ma il giocatore non lo sa. */
    if (e === G.pe.target && !G.pe.dead) {
      const rr = e.radius + 5;
      b.globalAlpha = 0.5 + Math.sin(R.time * 5) * 0.14;
      b.strokeStyle = '#ffd166';
      b.lineWidth = 1;
      b.beginPath();
      b.ellipse(x, y + e.radius - 1, rr, rr * 0.45, 0, 0, Math.PI * 2);
      b.stroke();
      /* Quattro tacche, così si distingue da un'ombra qualunque */
      b.globalAlpha = 0.8;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + R.time * 0.9;
        b.fillRect(Math.round(x + Math.cos(a) * rr) - 1, Math.round(y + e.radius - 1 + Math.sin(a) * rr * 0.45) - 1, 2, 2);
      }
      b.globalAlpha = 1;
    }

    /* Telegrafo: settore che si riempie davanti al nemico.
       È l'informazione che rende parabile il combattimento, quindi
       nell'ultimo terzo pulsa e si contorna di bianco: l'occhio coglie
       il cambio di colore molto prima di stimare un riempimento. */
    if (e.state === 'telegraph') {
      const tgMult = (e.affixMods && e.affixMods.telegraphMult) || 1;
      const f = Math.min(1, e.stateT / (e.def.telegraph * tgMult));
      const dir = Math.atan2(G.pe.y - e.y, G.pe.x - e.x);
      const reach = e.def.ai === 'ranged' ? 26 : e.def.attackRange + 8;
      const imminent = f > 0.66;
      const pulse = imminent ? (Math.sin(R.time * 34) * 0.5 + 0.5) : 0;
      /* Il nemico cinereo si legge peggio: il proprio telegrafo è più fioco. */
      const readability = (e.affixMods && e.affixMods.ashCloud) ? 0.6 : 1;

      b.globalAlpha = (0.18 + f * 0.34 + pulse * 0.22) * readability;
      b.fillStyle = imminent ? (pulse > 0.5 ? '#ffd166' : '#ff8a5c') : '#c33636';
      b.beginPath();
      b.moveTo(x, y);
      b.arc(x, y, reach * (0.4 + f * 0.6), dir - 0.7, dir + 0.7);
      b.closePath();
      b.fill();

      if (imminent) {
        b.globalAlpha = (0.55 + pulse * 0.45) * readability;
        b.strokeStyle = '#fff3d0';
        b.lineWidth = 1;
        b.stroke();
      }
      b.globalAlpha = 1;
    }
    if (e.state === 'special') {
      const f = Math.min(1, e.stateT / 0.8);
      b.globalAlpha = 0.2 + f * 0.3;
      b.strokeStyle = '#f06c3a'; b.lineWidth = 2;
      b.beginPath(); b.arc(x, y, 10 + f * 40, 0, Math.PI * 2); b.stroke();
      b.globalAlpha = 1;
    }

    const spr = e.flash > 0 ? A.flashOf(e.def.sprite, null, '#ffffff') : A.sprite(e.def.sprite);
    if (!spr) return;
    const bobY = e.moving ? Math.round(Math.abs(Math.sin(e.animT * 9)) * -1.5) : 0;
    const flip = e.face === 1;
    const dx = x - Math.floor(spr.width / 2);
    const dy = y - spr.height + Math.ceil(spr.height * 0.28) + bobY;

    if (e.stagger > 0) { b.globalAlpha = 0.85; }

    /* Deformazione: il nemico si accovaccia caricando il colpo, si allunga
       scattando in avanti e si schiaccia quando incassa. Nessuno sprite in
       più, ma il corpo smette di sembrare un cartoncino rigido. */
    let sx = 1, sy = 1;
    if (e.hitT > 0) {
      const k = e.hitT / 0.26;
      sx = 1 + k * 0.30; sy = 1 - k * 0.22;
    } else if (e.state === 'telegraph') {
      const tgMult2 = (e.affixMods && e.affixMods.telegraphMult) || 1;
      const f = Math.min(1, e.stateT / Math.max(0.01, e.def.telegraph * tgMult2));
      sx = 1 + f * 0.14; sy = 1 - f * 0.13;
    } else if (e.state === 'attack' && e.stateT < 0.18) {
      const f = 1 - e.stateT / 0.18;
      sx = 1 - f * 0.13; sy = 1 + f * 0.16;
    }

    b.save();
    /* Il ridimensionamento parte dai piedi, non dal centro: altrimenti
       la figura sprofonda nel terreno mentre si schiaccia. */
    const footX = dx + spr.width / 2, footY = dy + spr.height;
    b.translate(footX, footY);
    b.scale(flip ? -sx : sx, sy);
    b.translate(-spr.width / 2, -spr.height);
    b.drawImage(spr, 0, 0);
    b.restore();
    b.globalAlpha = 1;

    /* Barra della vita sopra i nemici feriti o allertati */
    if (e.hp < e.maxHp || e.aggro) {
      const w = e.boss ? 34 : (e.elite ? 24 : 18);
      const bx = x - w / 2, by = dy - 5;
      b.fillStyle = '#0d0b10'; b.fillRect(bx - 1, by - 1, w + 2, 4);
      b.fillStyle = '#3a1b1b'; b.fillRect(bx, by, w, 2);
      b.fillStyle = e.elite ? '#ffd166' : '#c33636';
      b.fillRect(bx, by, Math.max(0, w * (e.hp / e.maxHp)), 2);
      if (e.stagger > 0) { b.fillStyle = '#6fb3ff'; b.fillRect(bx, by + 2, w, 1); }
    }
  }

  function drawPlayer(b, G, ox, oy) {
    const pe = G.pe, p = G.p;
    const x = Math.round(pe.x - ox), y = Math.round(pe.y - oy);

    if (pe.dead) {
      b.globalAlpha = 0.5;
      const spr = A.sprite('p_side_0');
      b.save();
      b.translate(x, y);
      b.rotate(Math.PI / 2);
      b.drawImage(spr, -8, -12);
      b.restore();
      b.globalAlpha = 1;
      return;
    }

    shadow(b, x, y + 7, 13, 5);

    /* Scia della schivata */
    if (pe.state === 'dodge') {
      b.globalAlpha = 0.25;
      b.fillStyle = '#c9a6ff';
      A.circle(b, x - pe.vx * 0.04, y - pe.vy * 0.04, 6);
      b.globalAlpha = 1;
    }

    const frame = pe.moving ? (Math.floor(pe.animT * 8) % 2) : 0;
    let name;
    if (pe.face === 3) name = 'p_up_' + frame;
    else if (pe.face === 0) name = 'p_down_' + frame;
    else name = 'p_side_' + frame;

    const spr = pe.flash > 0 ? A.flashOf(name, null, '#ffffff') : A.sprite(name);
    const flip = pe.face === 1;
    const dy = y - 12;
    if (pe.iframes > 0 && pe.state === 'dodge') b.globalAlpha = 0.6;

    if (flip) {
      b.save(); b.translate(x + 8, dy); b.scale(-1, 1);
      b.drawImage(spr, 0, 0); b.restore();
    } else {
      b.drawImage(spr, x - 8, dy);
    }
    b.globalAlpha = 1;

    /* Arma: disegnata a parte così può ruotare durante il colpo */
    drawWeapon(b, G, x, y);

    /* Guardia: l'arco è disegnato nella direzione REALE di parata e con
       la sua ampiezza reale, così vedi esattamente cosa stai coprendo.
       Dorato = finestra di parata perfetta ancora aperta. */
    if (pe.blocking) {
      const a = pe.aimAngle;
      const arc = CV.Ent.BLOCK_ARC;
      const perfect = pe.blockT < 0.25;
      b.globalAlpha = perfect ? 0.85 : 0.38;
      b.strokeStyle = perfect ? '#ffd166' : '#9aa2b0';
      b.lineWidth = perfect ? 3 : 2;
      b.beginPath();
      b.arc(x, y - 2, 13, a - arc, a + arc);
      b.stroke();
      b.globalAlpha = 1;
    }

    /* Aura di lancio */
    if (pe.castT > 0) {
      b.globalAlpha = 0.5;
      b.fillStyle = '#6fb3ff';
      A.circle(b, x, y - 2, 4 + (1 - pe.castT / 0.22) * 6);
      b.globalAlpha = 1;
    }
  }

  function drawWeapon(b, G, x, y) {
    const pe = G.pe;
    const w = P.equipped(G.p, 'weapon');
    if (!w) return;
    const len = Math.max(9, (w.reach || 26) * 0.45);
    let ang, alpha = 1;

    if (pe.state === 'attack') {
      /* L'arma spazza l'arco durante la finestra attiva del colpo */
      const total = pe.swingDur || 0.24;
      const t = M.clamp(pe.stateT / total, 0, 1);
      const arc = (w.arc || 1.5);
      ang = pe.attackDir - arc / 2 + arc * t;
      /* Scia */
      b.globalAlpha = 0.22;
      b.strokeStyle = '#ffffff';
      b.lineWidth = 2;
      b.beginPath();
      b.arc(x, y - 2, len, pe.attackDir - arc / 2, ang);
      b.stroke();
      b.globalAlpha = 1;
    } else {
      /* A riposo l'arma punta verso il bersaglio agganciato: è un secondo
         indizio, oltre all'anello, di dove finirà il prossimo colpo. */
      ang = (pe.target && !pe.target.dead ? pe.aimAngle : CV.Ent.faceAngle(pe.face)) + 0.6;
      alpha = 0.9;
    }

    const col = w.icon === 'w_ember' ? '#f0864a' : w.icon === 'w_fang' ? '#ffb066' : w.icon === 'w_rusty' ? '#8a7f74' : '#cfd6e2';
    b.globalAlpha = alpha;
    b.strokeStyle = col;
    b.lineWidth = w.icon === 'w_maul' || w.icon === 'w_axe' ? 3 : 2;
    b.beginPath();
    b.moveTo(x + Math.cos(ang) * 4, y - 2 + Math.sin(ang) * 4);
    b.lineTo(x + Math.cos(ang) * len, y - 2 + Math.sin(ang) * len);
    b.stroke();
    if (w.fire > 0 || w.icon === 'w_ember' || w.icon === 'w_fang') {
      b.globalAlpha = 0.4 + Math.sin(R.time * 8) * 0.15;
      b.strokeStyle = '#ffd166';
      b.stroke();
    }
    b.globalAlpha = 1;
  }

  /* ---------------- Oscurità e atmosfera ---------------- */
  function drawDarkness(b, G, ox, oy) {
    const lc = R.lightCanvas;
    const lx = lc.getContext('2d');
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = 'rgba(6,4,10,0.86)';
    lx.fillRect(0, 0, lc.width, lc.height);

    lx.globalCompositeOperation = 'destination-out';
    const px = G.pe.x - ox, py = G.pe.y - oy;
    const r = 70 + Math.sin(R.time * 2.2) * 3;
    let g = lx.createRadialGradient(px, py, 6, px, py, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.55, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g;
    lx.fillRect(px - r, py - r, r * 2, r * 2);

    /* Ogni fuoco e ogni proiettile infuocato illumina */
    for (const p of G.zone.props) {
      if (p.kind !== 'campfire' && p.kind !== 'forge') continue;
      const fx = p.x - ox, fy = p.y - 8 - oy;
      const fr = 46;
      g = lx.createRadialGradient(fx, fy, 2, fx, fy, fr);
      g.addColorStop(0, 'rgba(0,0,0,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g;
      lx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }
    for (const pr of G.projectiles) {
      if (pr.kind !== 'fireball') continue;
      const fx = pr.x - ox, fy = pr.y - oy, fr = 30;
      g = lx.createRadialGradient(fx, fy, 1, fx, fy, fr);
      g.addColorStop(0, 'rgba(0,0,0,0.8)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g;
      lx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
    }
    lx.globalCompositeOperation = 'source-over';
    b.drawImage(lc, 0, 0);
  }

  function drawAsh(b, dt, intensity) {
    const t = R.time;
    for (const a of R.ashParticles) {
      /* Deriva laterale: cenere e foglie non cadono in verticale */
      const drift = Math.sin(t * 1.4 + a.ph) * (a.type === 'leaf' ? 16 : 6);
      a.x += (a.vx + drift * 0.35) * dt;
      a.y += a.vy * dt;

      if (a.y > R.viewH + 4) { a.y = -3; a.x = Math.random() * R.viewW; }
      if (a.y < -6) { a.y = R.viewH + 3; a.x = Math.random() * R.viewW; }
      if (a.x < -4) a.x = R.viewW + 3;
      if (a.x > R.viewW + 4) a.x = -3;

      const x = Math.round(a.x), y = Math.round(a.y);
      switch (a.type) {
        case 'leaf': {
          /* Foglia che rulla: si vede larga o di taglio a seconda della rotazione */
          const spin = Math.sin(t * 3 + a.ph);
          b.globalAlpha = (a.a + 0.2) * intensity;
          b.fillStyle = spin > 0 ? '#6b7a4a' : '#4a5636';
          b.fillRect(x, y, Math.abs(spin) > 0.5 ? 2 : 1, 1);
          break;
        }
        case 'fly': {
          /* Lucciola: pulsa e vaga lentamente */
          const pulse = 0.5 + Math.sin(t * 2.6 + a.ph) * 0.5;
          a.x += Math.sin(t * 0.9 + a.ph) * 8 * dt;
          a.y += Math.cos(t * 0.7 + a.ph * 1.3) * 6 * dt;
          b.globalAlpha = pulse * 0.75 * intensity;
          b.fillStyle = '#9fe8c0';
          b.fillRect(x, y, 1, 1);
          if (pulse > 0.7) {
            b.globalAlpha = (pulse - 0.7) * 0.9 * intensity;
            b.fillRect(x - 1, y, 3, 1);
            b.fillRect(x, y - 1, 1, 3);
          }
          break;
        }
        case 'ember': {
          /* Brace che risale e si spegne salendo */
          const fade = Math.max(0, Math.min(1, 1 - (y / R.viewH)));
          b.globalAlpha = (0.35 + fade * 0.5) * intensity;
          b.fillStyle = fade > 0.6 ? '#ffb066' : '#c9541f';
          b.fillRect(x, y, 1, 1);
          break;
        }
        default: {
          b.globalAlpha = a.a * intensity;
          b.fillStyle = '#b8b2c4';
          b.fillRect(x, y, a.s, a.s);
        }
      }
    }
    b.globalAlpha = 1;
  }

  function drawVignette(ctx) {
    const g = ctx.createRadialGradient(R.cssW / 2, R.cssH / 2, Math.min(R.cssW, R.cssH) * 0.35,
      R.cssW / 2, R.cssH / 2, Math.max(R.cssW, R.cssH) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, R.cssW, R.cssH);
  }

  /* Testo con contorno, leggibile su qualunque fondo. */
  function drawPixelText(b, text, x, y, color, center, big) {
    b.font = (big ? 'bold 9px ' : 'bold 7px ') + 'ui-monospace, monospace';
    b.textAlign = center ? 'center' : 'left';
    b.textBaseline = 'middle';
    b.lineWidth = 2.5;
    b.strokeStyle = 'rgba(6,4,10,0.9)';
    b.strokeText(text, x, y);
    b.fillStyle = color;
    b.fillText(text, x, y);
  }

  CV.Render = {
    init, resize, draw, updateCamera, snapCamera, invalidateZone, onZone,
    worldToScreen, screenToWorld, drawPixelText,
    get state() { return R; },
    get scale() { return R.scale; },
    setShake: (x, y) => { R.shakeX = x; R.shakeY = y; },
    setQuality: (q) => { R.quality = q; },
    getQuality: () => R.quality
  };
})(typeof window !== 'undefined' ? window : globalThis);
