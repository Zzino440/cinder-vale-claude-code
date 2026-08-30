/* ============================================================
   CICLO DI GIOCO E COLLANTE.
   Tiene insieme input, logica, mondo e interfaccia. È l'unico file
   che conosce tutti gli altri: gli altri non si conoscono a vicenda.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const P = CV.Player;
  const W = CV.World;
  const E = CV.Ent;
  const M = CV.M;

  const SAVE_KEY = 'cindervale.save.v1';
  const SET_KEY = 'cindervale.settings.v1';
  const ENTRY_SAFE_RADIUS = 280;
  const ENTRY_ORIENT_SECONDS = 2;
  const CHEST_RESPAWN_SECONDS = 600;
  const SHRINE_RESPAWN_SECONDS = 600;

  /* Stato globale della partita */
  const G = {
    p: null, pe: null, zone: null, world: null, worldAll: null,
    enemies: [], projectiles: [], particles: [], floats: [], drops: [], decals: [],
    freezeT: 0, entryGraceT: 0,
    rng: new CV.Rng(Date.now() & 0xffffff),
    running: false, paused: true,
    shakeAmt: 0, shakeT: 0,
    interactTarget: null, interactLabel: '',
    autosaveT: 0, tipT: 12,
    fpsAcc: 0, fpsFrames: 0, lastFps: 60, lowFpsRun: 0, autoQuality: null,
    settings: {
      scheme: 'auto', volume: 0.6, music: true, blockMode: 'auto', quality: 'auto',
      debug: { enemyRespawnSeconds: 300, chestRespawnSeconds: 600, shrineRespawnSeconds: 600 }
    }
  };

  /* ================= AVVIO ================= */
  function boot() {
    const canvas = document.getElementById('game');
    CV.Art.buildTileAtlas();
    CV.Render.init(canvas);
    CV.Input.attach(canvas);
    CV.UI.init(G);

    loadSettings();
    applyAudioSettings();
    applyQuality();
    CV.Input.setScheme(G.settings.scheme);

    CV.UI.openTitle(hasSave());
    G.running = true;
    requestAnimationFrame(frame);
  }

  /* ================= PARTITA ================= */
  function newGame() {
    G.p = P.create('Viandante');
    G.worldAll = { zones: {} };
    enterZone(D.startZone, null, true);
    G.p.gold = 45;
    CV.UI.close();
    G.paused = false;
    CV.Hud.showTip('Parla con Maren, al centro del villaggio.');
    save();
  }

  function continueGame() {
    const raw = readSave();
    if (!raw) { newGame(); return; }
    const data = CV.Save.deserialize(raw);
    if (!data) { CV.UI.toast('Salvataggio non compatibile', 'bad'); newGame(); return; }
    G.p = data.player;
    G.worldAll = data.world && data.world.zones ? data.world : { zones: {} };
    enterZone(G.p.zone || D.startZone, null, true, { x: G.p.x, y: G.p.y });
    CV.UI.close();
    G.paused = false;
  }

  function toTitle() {
    save();
    G.paused = true;
    CV.Audio.stopMusic();
    CV.UI.openTitle(hasSave());
  }

  /* ================= ZONE ================= */
  function enterZone(zoneId, fromZone, hard, atPos) {
    const z = W.generate(zoneId);
    if (!z) return;
    G.zone = z;
    CV.Render.onZone(z);

    /* Il punto reale d'ingresso serve anche a tenere liberi gli immediati
       dintorni: vale sia per i varchi sia per la posizione di un salvataggio. */
    const pos = atPos || W.entryPoint(z, fromZone);

    /* Stato mutevole persistente della zona */
    G.worldAll.zones[zoneId] = G.worldAll.zones[zoneId] || { killed: {}, chests: {}, nodes: {}, shrines: {} };
    G.world = G.worldAll.zones[zoneId];
    if (!G.world.shrines) G.world.shrines = {};

    /* Applica ciò che è già successo qui. Forzieri e santuari, come i nemici
       comuni, restano "usati" solo fino a un timestamp: passato quello,
       tornano disponibili da soli al prossimo ingresso in zona. */
    const nowT = Date.now() / 1000;
    for (const c of z.chests) if (G.world.chests[c.key] > nowT) c.open = true;
    for (const n of z.nodes) {
      const t = G.world.nodes[n.key];
      if (t) n.spent = Math.max(0, t - nowT);
    }
    for (const sh of z.shrines) if (G.world.shrines[sh.key] > nowT) sh.used = true;

    G.enemies = z.def.safe ? [] : E.spawnZone(z, G.world, G.p.level, {
      x: pos.x, y: pos.y, radius: ENTRY_SAFE_RADIUS
    }, !!G.p.flags.endgame);
    G.projectiles = []; G.particles = []; G.floats = []; G.drops = []; G.decals = [];
    G.freezeT = 0;
    G.entryGraceT = z.def.safe ? 0 : ENTRY_ORIENT_SECONDS;

    if (!G.pe) G.pe = E.makePlayer(G.p, pos.x, pos.y);
    else { G.pe.x = pos.x; G.pe.y = pos.y; G.pe.state = 'idle'; G.pe.stateT = 0; G.pe.dead = false; }

    G.p.zone = zoneId;
    CV.Render.snapCamera(G);

    const evs = [];
    CV.Quests.onEnterZone(G.p, zoneId, evs);
    pushEvents(evs);

    refreshNpcMarkers();
    CV.Hud.showZone(z.def.name, z.def.subtitle);
    CV.Hud.setBoss(null);
    if (G.settings.music) CV.Audio.setMood(z.def.music || 'calm');
    CV.Input.clearMoveTarget();
    if (!hard) save();
  }

  /* Marcatori sopra i PNG: chi ha una missione da dare o da consegnare. */
  function refreshNpcMarkers() {
    if (!G.zone) return;
    for (const n of G.zone.npcs) {
      let marker = null;
      for (const qid in D.quests) {
        const q = D.quests[qid];
        if (q.giver !== n.id) continue;
        const s = CV.Quests.state(G.p, qid);
        if (s === 'available') marker = marker || 'quest';
        if (s === 'ready') marker = 'turnin';
        const pq = G.p.quests[qid];
        if (pq && !pq.done) {
          const st = q.stages[pq.stage];
          if (st && st.obj.type === 'talk' && st.obj.target === n.id) marker = 'turnin';
        }
      }
      n.marker = marker;
    }
  }

  /* ================= CICLO ================= */
  let lastT = 0, acc = 0;
  const STEP = 1 / 60;

  function frame(now) {
    if (!G.running) return;
    requestAnimationFrame(frame);
    const t = now / 1000;
    let dt = lastT ? t - lastT : 0;
    lastT = t;
    dt = Math.min(dt, 0.1);

    if (G.paused || !G.zone) {
      /* Nulla da simulare: la schermata del titolo è statica */
      return;
    }

    acc += dt;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    render(dt);
    watchFps(dt);
  }

  function update(dt) {
    const p = G.p, pe = G.pe;

    /* Micro-blocco: la simulazione si ferma, il disegno no. Serve a far
       "sentire" il colpo; l'input continua a essere raccolto e verrà
       consumato appena il gioco riparte. */
    if (G.freezeT > 0) {
      G.freezeT -= dt;
      CV.Input.update();
      CV.Input.endFrame();
      return;
    }

    p.playtime += dt;
    CV.Input.update();

    /* Scuotimento della camera */
    if (G.shakeT > 0) {
      G.shakeT -= dt;
      const a = G.shakeAmt * (G.shakeT / G.shakeDur);
      CV.Render.setShake((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
      if (G.shakeT <= 0) CV.Render.setShake(0, 0);
    }

    if (!CV.UI.isOpen()) {
      if (CV.Input.pressed('menu')) { CV.UI.openMenu('inv'); CV.Input.endFrame(); return; }
      if (CV.Input.pressed('inv')) { CV.UI.openMenu('inv'); CV.Input.endFrame(); return; }
      if (CV.Input.pressed('quests')) { CV.UI.openMenu('quests'); CV.Input.endFrame(); return; }
      if (CV.Input.pressed('skills')) { CV.UI.openMenu('skills'); CV.Input.endFrame(); return; }
      if (CV.Input.pressed('map')) { CV.UI.openMenu('map'); CV.Input.endFrame(); return; }
      if (CV.Input.pressed('potion')) quickPotion();
    }

    if (!pe.dead) {
      updatePlayer(dt);
      updateInteractions();
      updateAmbushes();
      updateSiteObjective();
    } else {
      pe.stateT += dt;
      if (pe.stateT > 1.8 && !CV.UI.isOpen()) CV.UI.openDeath();
    }

    if (G.entryGraceT > 0) G.entryGraceT = Math.max(0, G.entryGraceT - dt);
    for (const e of G.enemies) E.updateEnemy(G, e, dt);
    /* Rimuove i corpi dissolti */
    for (let i = G.enemies.length - 1; i >= 0; i--) if (G.enemies[i].dead && G.enemies[i].deadT > 1.2) G.enemies.splice(i, 1);

    E.updateProjectiles(G, dt);
    E.updateFx(G, dt);
    updateDrops(dt);
    updateNodes(dt);

    /* Rigenerazione e effetti */
    const regenBoost = G.zone.def.safe ? 3.5 : 1;
    if (!pe.dead) {
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.hpRegen * regenBoost * dt);
      p.mp = Math.min(p.stats.maxMp, p.mp + p.stats.mpRegen * regenBoost * dt);
      if (pe.state !== 'attack' && !pe.blocking)
        p.sp = Math.min(p.stats.maxSp, p.sp + p.stats.spRegen * (pe.moving ? 0.6 : 1) * dt);
      const poison = P.tickEffects(p, dt);
      if (poison > 0) {
        p.hp -= poison;
        if (p.hp <= 0) { p.hp = 0; E.killPlayer(G); }
      }
    }

    /* Barra del boss quando è vicino */
    const boss = G.enemies.find(e => !e.dead && (e.boss || e.elite) && e.aggro && M.dist(e.x, e.y, pe.x, pe.y) < 260);
    if (boss) CV.Hud.setBoss(boss);

    /* Salvataggio automatico */
    G.autosaveT += dt;
    if (G.autosaveT > 120) { G.autosaveT = 0; save(); }

    /* Suggerimenti iniziali, uno ogni tanto */
    G.tipT -= dt;
    if (G.tipT <= 0) {
      G.tipT = 95;
      if (p.playtime < 900) CV.Hud.showTip(G.rng.pick(D.tips));
    }

    CV.Input.endFrame();
  }

  /* ---------------- Giocatore ---------------- */
  function updatePlayer(dt) {
    const p = G.p, pe = G.pe, z = G.zone;
    pe.stateT += dt;
    if (pe.flash > 0) pe.flash -= dt;
    if (pe.iframes > 0) pe.iframes -= dt;
    if (pe.castT > 0) pe.castT -= dt;

    /* Contraccolpo */
    if (Math.abs(pe.knockX) > 1 || Math.abs(pe.knockY) > 1) {
      W.moveWithCollision(z, pe, pe.knockX * dt, pe.knockY * dt);
      pe.knockX *= 0.85; pe.knockY *= 0.85;
    }

    const uiOpen = CV.UI.isOpen();
    const scheme = CV.Input.effectiveScheme();

    /* --- Vettore di movimento, indipendente dallo schema --- */
    let mx = 0, my = 0;
    if (!uiOpen) {
      if (scheme === 'touch_tap') {
        const t = CV.Input.moveTarget;
        if (t) {
          const wp = CV.Render.screenToWorld(t.x, t.y);
          const d = M.dist(pe.x, pe.y, wp.x, wp.y);
          if (d > 5) {
            mx = (wp.x - pe.x) / d;
            my = (wp.y - pe.y) / d;
          } else if (!CV.Input.moveTargetHeld) {
            CV.Input.clearMoveTarget();
          }
        }
      } else {
        mx = CV.Input.move.x;
        my = CV.Input.move.y;
      }
    }

    /* --- Comando della parata: tenuta premuta oppure a interruttore --- */
    const blockMode = effectiveBlockMode();
    if (!uiOpen) {
      if (blockMode === 'toggle') {
        if (CV.Input.pressed('block')) {
          if (pe.blockHeld) pe.blockHeld = false;
          else if (p.sp > 3) { pe.blockHeld = true; pe.blockT = 0; }
        }
      } else {
        pe.blockHeld = CV.Input.down('block');
      }
    } else if (blockMode === 'hold') {
      pe.blockHeld = false;
    }

    const wantBlock = pe.blockHeld && p.sp > 3 && pe.state !== 'attack' && pe.state !== 'dodge';
    if (wantBlock && !pe.blocking) { pe.blocking = true; pe.blockT = 0; }
    else if (!wantBlock && pe.blocking) pe.blocking = false;
    if (pe.blocking) {
      pe.blockT += dt;
      p.sp = Math.max(0, p.sp - 2.5 * dt);
      if (p.sp <= 0) { pe.blocking = false; pe.blockHeld = false; }
    }

    /* --- Bersaglio agganciato --- */
    const wep = P.equipped(p, 'weapon');
    const lockRange = Math.max(74, (wep ? wep.reach : 26) * 2.4);
    pe.target = pickTarget(pe, mx, my, lockRange);

    /* --- Direzione di mira: angolo continuo, non più una delle 4 cardinali.
       Da fermo mantiene l'ultimo angolo invece di scattare sulla cardinale
       più vicina: è ciò che rendeva impossibile colpire in diagonale. --- */
    if (scheme === 'kbm' && CV.Input.aimScreen) {
      const wp = CV.Render.screenToWorld(CV.Input.aimScreen.x, CV.Input.aimScreen.y);
      pe.aimAngle = Math.atan2(wp.y - pe.y, wp.x - pe.x);
    } else if (mx || my) {
      pe.aimAngle = Math.atan2(my, mx);
    }

    /* Aggancio morbido: col mouse corregge solo piccoli errori, col tocco
       è generoso, e da fermo aggancia in qualsiasi direzione. Se stai
       spingendo altrove in modo netto, la tua scelta viene rispettata. */
    if (pe.target) {
      const tAng = Math.atan2(pe.target.y - pe.y, pe.target.x - pe.x);
      const pushing = Math.hypot(mx, my) > 0.35;
      const arc = scheme === 'kbm' ? 0.60 : (pushing ? 2.094 : Math.PI);
      if (Math.abs(M.angDelta(pe.aimAngle, tAng)) <= arc) pe.aimAngle = tAng;
    }

    /* Mentre pari, la guardia segue la minaccia: niente più parate
       orientate dove ti eri mosso l'ultima volta. */
    if (pe.blocking) {
      const threat = pickThreat(pe);
      if (threat) {
        pe.aimAngle = Math.atan2(threat.y - pe.y, threat.x - pe.x);
        pe.face = M.facingFromVec(Math.cos(pe.aimAngle), Math.sin(pe.aimAngle));
      }
    }

    /* --- Azioni, con buffer: un comando dato pochi istanti troppo presto
       non viene buttato via, parte appena il personaggio è libero. --- */
    if (!uiOpen) {
      if (CV.Input.pressed('attack')) pe.bufAttack = 0.22;
      if (CV.Input.pressed('dodge')) pe.bufDodge = 0.22;
      if (CV.Input.pressed('cast')) tryCast(pe.aimAngle);
      if (CV.Input.pressed('interact')) doInteract();
    } else {
      pe.bufAttack = 0; pe.bufDodge = 0;
    }
    if (pe.bufDodge > 0) {
      pe.bufDodge -= dt;
      if (pe.state !== 'dodge' && tryDodge(pe.aimAngle, mx, my)) pe.bufDodge = 0;
    }
    if (pe.bufAttack > 0) {
      pe.bufAttack -= dt;
      if (pe.state !== 'attack' && pe.state !== 'dodge' && tryAttack(pe.aimAngle)) pe.bufAttack = 0;
    }

    /* --- Macchina a stati del movimento --- */
    let speed = 62 * p.stats.moveSpeed;
    if (pe.state === 'dodge') {
      const f = 1 - M.clamp(pe.stateT / 0.30, 0, 1);
      const sp = speed * (1.0 + 2.6 * f);
      W.moveWithCollision(z, pe, Math.cos(pe.dodgeDir) * sp * dt, Math.sin(pe.dodgeDir) * sp * dt);
      if (Math.random() < dt * 22)
        G.particles.push(E.makeParticle(pe.x, pe.y + 4, '#6b6577', { speed: 22, life: 0.35, gravity: 8 }));
      if (pe.stateT >= 0.30) { pe.state = 'idle'; pe.stateT = 0; }
      pe.moving = true;
    } else {
      if (pe.blocking) speed *= 0.45;
      if (pe.state === 'attack') speed *= 0.30;
      if (pe.state === 'recover') speed *= 0.55;

      const len = Math.hypot(mx, my);
      if (len > 0.01 && !uiOpen) {
        const nx = mx / Math.max(1, len), ny = my / Math.max(1, len);
        const mag = Math.min(1, len);
        W.moveWithCollision(z, pe, nx * speed * mag * dt, ny * speed * mag * dt);
        pe.moving = true;
        pe.animT += dt * (0.6 + mag);
        if (pe.state !== 'attack') pe.face = M.facingFromVec(nx, ny);
        /* Camminare allena l'Atletica, ma pochissimo */
        if (Math.random() < dt * 0.35) {
          const evs = []; P.trainSkill(p, 'athletics', 1, evs); pushEvents(evs);
        }
      } else {
        pe.moving = false;
      }
    }

    /* Colpo: la finestra attiva scatta a metà dell'animazione */
    if (pe.state === 'attack') {
      const dur = pe.swingDur || 0.26;
      /* Passo in avanti verso il bersaglio, se ne era stato deciso uno */
      if (pe.lungeT > 0) {
        pe.lungeT -= dt;
        const sp = 155;
        W.moveWithCollision(z, pe, Math.cos(pe.lungeDir) * sp * dt, Math.sin(pe.lungeDir) * sp * dt);
      }
      if (!pe.didSwing && pe.stateT >= dur * 0.34) {
        pe.didSwing = true;
        E.resolveMeleeSwing(G);
      }
      if (pe.stateT >= dur) { pe.state = 'recover'; pe.stateT = 0; }
    } else if (pe.state === 'recover') {
      if (pe.stateT >= (pe.recoverDur || 0.12)) { pe.state = 'idle'; pe.stateT = 0; }
    }

    /* Lava e acqua fanno male / rallentano */
    const tk = CV.Art.TILE_KEYS[z.tiles[W.idx(z, M.clamp(Math.floor(pe.x / 16), 0, z.w - 1), M.clamp(Math.floor(pe.y / 16), 0, z.h - 1))]];
    if (tk === 'lava') {
      p.hp -= 16 * dt;
      if (Math.random() < dt * 10) G.particles.push(E.makeParticle(pe.x, pe.y, '#f06c3a', { speed: 40, life: 0.4, gravity: -20 }));
      if (p.hp <= 0) { p.hp = 0; E.killPlayer(G); }
    }
  }

  /* Sceglie il nemico da agganciare. Il punteggio pesa distanza e scarto
     angolare, dà priorità a chi sta per colpirti, e con una piccola
     isteresi evita che il bersaglio salti da un nemico all'altro. */
  function pickTarget(pe, mx, my, range) {
    let best = null, bestScore = Infinity;
    const ref = (mx || my) ? Math.atan2(my, mx) : pe.aimAngle;
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = M.dist(pe.x, pe.y, e.x, e.y);
      if (d > range + e.radius) continue;
      const a = Math.atan2(e.y - pe.y, e.x - pe.x);
      let score = d + Math.abs(M.angDelta(ref, a)) * 26;
      if (e.state === 'telegraph' || e.state === 'attack') score -= 34;
      if (e === pe.target) score -= 14;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  /* Minaccia da fronteggiare mentre si para: prima chi sta caricando
     un colpo, poi semplicemente chi è più vicino. */
  function pickThreat(pe) {
    let best = null, bestScore = Infinity;
    for (const e of G.enemies) {
      if (e.dead || !e.aggro) continue;
      const d = M.dist(pe.x, pe.y, e.x, e.y);
      if (d > 150) continue;
      let score = d;
      if (e.state === 'telegraph') score -= 120;
      else if (e.state === 'attack') score -= 90;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    /* Anche un proiettile in arrivo è una minaccia da parare */
    for (const pr of G.projectiles) {
      if (pr.fromPlayer) continue;
      const d = M.dist(pe.x, pe.y, pr.x, pr.y);
      if (d > 90) continue;
      const closing = M.dist(pe.x, pe.y, pr.x + pr.vx * 0.1, pr.y + pr.vy * 0.1) < d;
      if (closing && d - 100 < bestScore) { bestScore = d - 100; best = pr; }
    }
    return best;
  }

  /* 'auto' = interruttore col tocco, tenuta premuta con la tastiera. */
  function effectiveBlockMode() {
    const m = G.settings.blockMode || 'auto';
    if (m !== 'auto') return m;
    return CV.Input.isTouchScheme() ? 'toggle' : 'hold';
  }

  function tryAttack(dir) {
    const p = G.p, pe = G.pe;
    if (pe.state === 'attack' || pe.state === 'dodge') return false;
    const w = P.equipped(p, 'weapon');
    const cost = (w ? w.stamCost : 8);
    if (p.sp < cost * 0.5) { pe.bufAttack = 0; return false; }
    p.sp = Math.max(0, p.sp - cost);
    pe.state = 'attack';
    pe.stateT = 0;
    pe.didSwing = false;
    pe.attackDir = dir;
    pe.swingDur = 0.26 / (w ? w.spd : 1);
    pe.recoverDur = 0.10 / (w ? w.spd : 1);
    pe.blocking = false;
    pe.blockHeld = false;
    pe.face = M.facingFromVec(Math.cos(dir), Math.sin(dir));
    G.entryGraceT = 0;

    /* Passo in avanti se il bersaglio è appena fuori portata: evita i
       colpi che mancano per due pixel senza allungare l'arma. */
    if (pe.target && !pe.target.dead) {
      const d = M.dist(pe.x, pe.y, pe.target.x, pe.target.y);
      const reach = (w ? w.reach : 26) + pe.target.radius;
      if (d > reach && d < reach * 1.7) { pe.lungeT = 0.11; pe.lungeDir = dir; }
    }
    CV.Audio.play('swing');
    return true;
  }

  function tryDodge(dir, mx, my) {
    const p = G.p, pe = G.pe;
    if (pe.state === 'dodge') return false;
    const cost = CV.Hud.dodgeCost(p);
    if (p.sp < cost) { pe.bufDodge = 0; return false; }
    p.sp -= cost;
    pe.state = 'dodge';
    pe.stateT = 0;
    pe.iframes = 0.24;
    pe.blocking = false;
    pe.blockHeld = false;
    /* Si schiva nella direzione di movimento; da fermi, all'indietro */
    pe.dodgeDir = (mx || my) ? Math.atan2(my, mx) : dir + Math.PI;
    CV.Audio.play('dodge');
    const evs = []; P.trainSkill(p, 'athletics', 5, evs); pushEvents(evs);
    return true;
  }

  function tryCast(dir) {
    const p = G.p, pe = G.pe;
    if (pe.state === 'dodge' || pe.state === 'attack') return;
    const cost = CV.Hud.castCost(p);
    if (p.mp < cost) { CV.Audio.play('error'); CV.UI.toast('Etere insufficiente', 'bad'); return; }
    p.mp -= cost;
    pe.castT = 0.22;
    pe.blocking = false;
    pe.blockHeld = false;
    pe.face = M.facingFromVec(Math.cos(dir), Math.sin(dir));
    G.entryGraceT = 0;

    const w = P.equipped(p, 'weapon');
    const dmg = (12 + p.skills.destruction.lvl * 0.55 + (w ? (w.magic || 0) : 0)) * p.stats.magicPower;
    const proj = E.makeProjectile('fireball', pe.x + Math.cos(dir) * 10, pe.y + Math.sin(dir) * 10, dir, dmg, true,
      { aoe: p.perks.blast ? 30 : 0, life: 1.8 });
    G.projectiles.push(proj);
    CV.Audio.play('cast');
    const evs = []; P.trainSkill(p, 'destruction', 9, evs); pushEvents(evs);
  }

  function quickPotion() {
    const p = G.p;
    /* Beve la pozione curativa più efficace che si possiede */
    let best = null, bestVal = -1;
    for (const it of p.inv) {
      if (!it.potion || it.potion.harmful) continue;
      const heal = (it.potion.fx.find(f => f.key === 'heal') || {}).mag || 0;
      const val = heal * 2 + it.potion.fx.length;
      if (val > bestVal) { bestVal = val; best = it; }
    }
    if (!best) { CV.Audio.play('error'); CV.UI.toast('Nessuna pozione', 'bad'); return; }
    const name = best.potion.name;
    CV.Alch.drink(p, best);
    CV.Audio.play('potion');
    G.floats.push(E.makeFloat(G.pe.x, G.pe.y - 20, name, '#7cc46a'));
  }

  /* Le imboscate non stanno fra gli interactables: non si aprono con
     un tasto, scattano avvicinandosi. Un forziere apparentemente
     incustodito che, avvicinandosi, rivela chi lo sorvegliava. */
  function updateAmbushes() {
    const pe = G.pe;
    for (const a of (G.zone.ambushes || [])) {
      if (a.done) continue;
      if (M.dist(pe.x, pe.y, a.x, a.y) > a.r) continue;
      a.done = true;
      let spawned = 0;
      for (const s of a.spawns) {
        const e = E.spawnAmbushOne(s, G.world, G.p.level);
        if (e) { G.enemies.push(e); spawned++; }
      }
      if (spawned) {
        CV.Audio.play("telegraph");
        CV.UI.toast("Imboscata!", "bad");
        G.entryGraceT = 0;
      }
    }
  }

  /* Traccia il sito più vicino con nemici propri (z.sites[i].keys, vedi
     world.js) e mostra "sgombera (n/tot)" mentre il giocatore ci sta
     dentro. La ricompensa scatta al passaggio da "resta almeno un nemico"
     a "nessuno vivo", una volta per visita: lasciare la zona e tornare a
     respawn scaduto permette di sgomberarlo di nuovo. */
  function updateSiteObjective() {
    const pe = G.pe;
    let nearest = null, nearestD = Infinity;
    for (const s of (G.zone.sites || [])) {
      if (!s.keys || !s.keys.length) continue;
      const cx = s.tx * W.T + 8, cy = s.ty * W.T + 8;
      const d = M.dist(pe.x, pe.y, cx, cy);
      if (d > (s.r + 2) * W.T) continue;
      if (d < nearestD) { nearestD = d; nearest = s; }
    }
    if (!nearest) { CV.Hud.setSite(null); G.activeSitePrefix = null; return; }

    const remaining = nearest.keys.filter(k => !E.isDead(G.world.killed, k)).length;
    const total = nearest.keys.length;
    const isNewTrack = G.activeSitePrefix !== nearest.prefix;
    if (isNewTrack) { G.activeSitePrefix = nearest.prefix; G.siteRemainingSeen = remaining; }

    if (remaining === 0) {
      if (!isNewTrack && G.siteRemainingSeen > 0) grantSiteReward(nearest);
      G.siteRemainingSeen = 0;
      CV.Hud.setSite(null);
      return;
    }
    G.siteRemainingSeen = remaining;
    CV.Hud.setSite({ name: nearest.name, done: total - remaining, total: total });
  }

  function grantSiteReward(site) {
    const def = D.sites[site.id];
    const rw = def && def.clearReward;
    if (!rw) { CV.UI.toast(site.name + ' sgomberato.', 'good'); return; }
    const p = G.p, pe = G.pe;
    const evs = [];
    if (rw.xp) P.gainXp(p, rw.xp, evs);
    if (rw.gold) {
      const g = G.rng.int(rw.gold[0], rw.gold[1]);
      p.gold += g;
      G.floats.push(E.makeFloat(pe.x, pe.y - 24, '+' + g + ' oro', '#ffd166'));
    }
    if (rw.tier) {
      const tier = Math.min(4, rw.tier + (p.flags.endgame ? 1 : 0));
      const item = CV.Loot.makeGear(G.rng, tier, 0.15);
      if (item) {
        P.addItem(p, item);
        G.floats.push(E.makeFloat(pe.x, pe.y - 40, P.resolve(item).name, '#7cc46a'));
      }
    }
    P.recalc(p);
    CV.Contracts.onSiteCleared(p, G.zone.id, evs);
    pushEvents(evs);
    CV.Audio.play('quest');
    CV.UI.toast(site.name + ' sgomberato! Ricompensa raccolta.', 'gold');
  }

  /* ---------------- Interazioni ---------------- */
  function updateInteractions() {
    const pe = G.pe;
    let best = null, bestD = Infinity, label = '';

    for (const it of G.zone.interactables) {
      if (it.kind === 'node' && it.ref.spent > 0) continue;
      if (it.kind === 'chest' && it.ref.open) continue;
      const d = M.dist(pe.x, pe.y, it.x, it.y);
      if (d < it.r && d < bestD) { bestD = d; best = it; label = it.label; }
    }
    for (const ex of G.zone.exits) {
      const d = M.dist(pe.x, pe.y, ex.x, ex.y);
      if (d < ex.r && d < bestD) { bestD = d; best = { kind: 'exit', ref: ex, x: ex.x, y: ex.y }; label = 'Vai: ' + ex.label; }
    }

    G.interactTarget = best;
    G.interactLabel = label;
    CV.Input.setInteractAvailable(!!best);
  }

  function doInteract() {
    const t = G.interactTarget;
    if (!t) return;
    const p = G.p;

    switch (t.kind) {
      case 'npc': {
        CV.UI.openDialogue(t.ref);
        break;
      }
      case 'chest': {
        const c = t.ref;
        c.open = true;
        G.world.chests[c.key] = Date.now() / 1000 + debugSeconds('chestRespawnSeconds', CHEST_RESPAWN_SECONDS);
        CV.Audio.play('chest');
        /* Dopo Vaelrik i forzieri più ricchi passano alla tabella 'hoard':
           stesso forziere di sempre, bottino da fine partita. */
        const table = (p.flags.endgame && c.table === 'rich') ? 'hoard' : c.table;
        const items = CV.Loot.fromChest(table, G.rng);
        for (const it of items) {
          const a = G.rng.next() * Math.PI * 2;
          G.drops.push({ item: it, x: c.x + Math.cos(a) * 12, y: c.y + Math.sin(a) * 12 + 6, t: 0, vy: -40 });
        }
        break;
      }
      case 'node': {
        const n = t.ref;
        const def = D.harvestNodes[n.type];
        const qty = (n.type === 'herb' && p.perks.botanist) ? 2 : 1;
        const id = G.rng.pick(def.table);
        P.addById(p, id, qty);
        P.recalc(p);
        n.spent = def.respawn;
        G.world.nodes[n.key] = Date.now() / 1000 + def.respawn;
        CV.Audio.play('pickup');
        G.floats.push(E.makeFloat(n.x, n.y - 12, '+' + qty + ' ' + D.base(id).name, '#7cc46a'));
        if (n.type === 'herb') { const evs = []; P.trainSkill(p, 'alchemy', 3, evs); pushEvents(evs); }
        const evs2 = []; CV.Quests.check(p, evs2); pushEvents(evs2);
        break;
      }
      case 'forge': CV.UI.openSmith(); break;
      case 'cauldron': CV.UI.openAlchemy(); break;
      case 'sign': CV.UI.toast(t.text || '...'); break;
      case 'noticeboard': CV.UI.openContracts(); break;
      case 'shrine': {
        const sh = t.ref;
        if (sh.used) { CV.UI.toast('Il santuario è già stato onorato.'); break; }
        sh.used = true;
        G.world.shrines[sh.key] = Date.now() / 1000 + debugSeconds('shrineRespawnSeconds', SHRINE_RESPAWN_SECONDS);
        const boons = ['fury', 'stone', 'swift', 'regen'];
        const key = G.rng.pick(boons);
        P.applyEffect(p, key, D.effects[key].base, D.effects[key].dur);
        CV.Audio.play('level');
        CV.UI.toast('Il santuario dona: ' + D.effects[key].name, 'good');
        G.floats.push(E.makeFloat(sh.x, sh.y - 14, D.effects[key].name, D.effects[key].color, true));
        save();
        break;
      }
      case 'campfire': {
        p.hp = p.stats.maxHp; p.mp = p.stats.maxMp; p.sp = p.stats.maxSp;
        for (const n of G.zone.nodes) n.spent = 0;
        CV.Audio.play('quest');
        CV.UI.toast('Hai riposato. Forze ristabilite.', 'good');
        save();
        break;
      }
      case 'exit': {
        const ex = t.ref;
        if (ex.requires && P.count(p, ex.requires) < 1) {
          CV.Audio.play('error');
          CV.UI.toast(ex.lockedText || 'È chiuso.', 'bad');
          return;
        }
        CV.Audio.play('door');
        save();
        enterZone(ex.to, G.zone.id, false);
        break;
      }
    }
  }

  /* ---------------- Oggetti a terra e nodi ---------------- */
  function updateDrops(dt) {
    const pe = G.pe, p = G.p;
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const d = G.drops[i];
      if (d.t < 0.35) continue;   /* piccolo ritardo prima di poterli raccogliere */
      if (M.dist(d.x, d.y, pe.x, pe.y) < 16) {
        const res = P.resolve(d.item);
        if (d.item.id === 'gold') {
          p.gold += d.item.qty;
          CV.Audio.play('coin');
          G.floats.push(E.makeFloat(pe.x, pe.y - 22, '+' + d.item.qty + ' oro', '#ffd166'));
        } else {
          P.addItem(p, d.item);
          CV.Audio.play('pickup');
          G.floats.push(E.makeFloat(pe.x, pe.y - 22, res.name + (d.item.qty > 1 ? ' ×' + d.item.qty : ''),
            res.rar === 'common' ? '#d7d2e0' : { fine: '#7cc46a', rare: '#6fb3ff', epic: '#c9a6ff', legend: '#ffd166' }[res.rar]));
        }
        P.recalc(p);
        const evs = []; CV.Quests.check(p, evs); pushEvents(evs);
        G.drops.splice(i, 1);
      }
    }
  }

  function updateNodes(dt) {
    for (const n of G.zone.nodes) if (n.spent > 0) n.spent -= dt;
  }

  function dropItemToGround(it) {
    const pe = G.pe;
    P.removeUid(G.p, it.uid, it.qty);
    /* Deve atterrare oltre il raggio di auto-raccolta (16px in updateDrops),
       altrimenti il pg se lo riprende da solo appena scade il ritardo. */
    const a = E.faceAngle(pe.face);
    G.drops.push({ item: it, x: pe.x + Math.cos(a) * 26, y: pe.y + Math.sin(a) * 26 + 8, t: -1.2, vy: 0 });
    P.recalc(G.p);
  }

  /* ---------------- Eventi (livelli, abilità, missioni) ---------------- */
  function pushEvents(evs) {
    if (!evs || !evs.length) return;
    for (const e of evs) {
      if (e.type === 'level') {
        CV.Audio.play('level');
        CV.UI.toast('Livello ' + e.level + '! Hai un punto talento.', 'gold');
        if (G.pe) G.floats.push(E.makeFloat(G.pe.x, G.pe.y - 30, 'LIVELLO ' + e.level, '#ffd166', true));
      } else if (e.type === 'skill') {
        CV.Audio.play('skillup');
        CV.UI.toast(P.SKILLS[e.skill].name + ' → ' + e.level, 'good');
      } else if (e.type === 'quest') {
        if (e.event === 'start') { CV.Audio.play('quest'); CV.UI.toast('Nuova missione: ' + D.quests[e.quest].name, 'gold'); }
        else if (e.event === 'complete') {
          CV.Audio.play('quest');
          const rw = e.reward || {};
          CV.UI.toast('Missione completata: ' + D.quests[e.quest].name + (rw.gold ? ' (+' + rw.gold + ' oro)' : ''), 'gold');
          if (e.quest === 'q_main4') {
            /* La valle dopo Vaelrik: più élite, forzieri 'hoard', contratti
               di fascia superiore. Riusa gli stessi sistemi, solo alzati. */
            G.p.flags.endgame = true;
            setTimeout(() => CV.UI.openVictory(), 900);
          }
        } else if (e.event === 'stage') {
          CV.Audio.play('ui');
          CV.UI.toast('Obiettivo aggiornato');
        }
        refreshNpcMarkers();
      } else if (e.type === 'contract') {
        if (e.event === 'progress') {
          CV.Audio.play('ui');
          CV.UI.toast('Contratto pronto per la consegna: ' + e.contract.title, 'gold');
        }
      }
    }
    refreshNpcMarkers();
  }

  /* ---------------- Morte ---------------- */
  function onPlayerDeath() {
    CV.Audio.stopMusic();
  }

  function respawn() {
    const p = G.p;
    p.gold = Math.floor(p.gold / 2);
    p.hp = p.stats.maxHp; p.mp = p.stats.maxMp; p.sp = p.stats.maxSp;
    p.effects = [];
    P.recalc(p);
    G.pe.dead = false;
    G.pe.state = 'idle';
    G.pe.stateT = 0;
    G.pe.iframes = 1.2;
    CV.UI.close();
    enterZone('ashford', null, false);
    CV.UI.toast('Ti sei risvegliato ad Ashford.', 'bad');
  }

  /* ---------------- Render ---------------- */
  function render(dt) {
    CV.Render.updateCamera(G, dt);
    CV.Render.draw(G, dt);
  }

  /* ---------------- Salvataggio ---------------- */
  function hasSave() { return !!readSave(); }

  function readSave() {
    try { const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return null; }
  }

  function save() {
    if (!G.p) return;
    try {
      G.p.x = G.pe ? G.pe.x : 0;
      G.p.y = G.pe ? G.pe.y : 0;
      const data = CV.Save.serialize(G.p, G.worldAll, G.settings);
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* spazio esaurito o modalità privata: si continua a giocare */ }
  }

  function wipeSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    CV.UI.toast('Salvataggio cancellato', 'bad');
    G.paused = true;
    CV.UI.openTitle(false);
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SET_KEY) || 'null');
      if (s) Object.assign(G.settings, s);
    } catch (e) {}
  }
  function saveSettings() {
    try { localStorage.setItem(SET_KEY, JSON.stringify(G.settings)); } catch (e) {}
  }
  function applyAudioSettings() {
    CV.Audio.setVolume(G.settings.volume);
    if (!G.settings.music) CV.Audio.stopMusic();
    else if (G.zone) CV.Audio.setMood(G.zone.def.music || 'calm');
  }

  /* setMood ignora le chiamate con la stessa mood già attiva: giusto
     per non ripartire da capo a ogni piccola modifica delle impostazioni,
     ma sbagliato quando la musica va davvero fatta ripartire dopo essere
     stata fermata (stessa zona = stessa mood di prima). */
  function refreshMusic() {
    if (G.settings.music && G.zone) CV.Audio.restartMood(G.zone.def.music || 'calm');
  }

  /* In automatico si parte da una stima prudente e si scende solo se il
     dispositivo dimostra di non farcela: è più affidabile che indovinare
     il modello di telefono dalle stringhe del browser. */
  function resolveQuality() {
    const q = G.settings.quality || 'auto';
    if (q !== 'auto') return q;
    if (G.autoQuality) return G.autoQuality;
    const cores = navigator.hardwareConcurrency || 4;
    G.autoQuality = (!CV.Input.isTouchScheme() && cores >= 4) || cores >= 6 ? 'high' : 'medium';
    return G.autoQuality;
  }

  function applyQuality() {
    G.autoQuality = null;
    CV.Render.setQuality(resolveQuality());
  }

  /* Sorveglianza della fluidità: se in automatico si resta sotto i 45 fps
     per tre secondi di fila, si scende di un gradino. */
  function watchFps(dt) {
    /* Con la scheda in secondo piano il browser rallenta l'animazione:
       misurare lì significherebbe abbassare la qualità per un problema
       che non esiste. */
    if (document.hidden) { G.fpsAcc = 0; G.fpsFrames = 0; G.lowFpsRun = 0; return; }
    G.fpsAcc += dt; G.fpsFrames++;
    if (G.fpsAcc < 1) return;
    G.lastFps = G.fpsFrames / G.fpsAcc;
    G.fpsAcc = 0; G.fpsFrames = 0;
    if ((G.settings.quality || 'auto') !== 'auto') return;
    G.lowFpsRun = G.lastFps < 45 ? G.lowFpsRun + 1 : 0;
    if (G.lowFpsRun < 3) return;
    const cur = CV.Render.getQuality();
    const next = cur === 'high' ? 'medium' : (cur === 'medium' ? 'low' : null);
    G.lowFpsRun = 0;
    if (!next) return;
    G.autoQuality = next;
    CV.Render.setQuality(next);
    CV.UI.toast('Qualità grafica ridotta per mantenere la fluidità');
  }

  /* ---------------- Utilità esposte all'interfaccia ---------------- */
  G.shake = function (amt, time) { G.shakeAmt = amt; G.shakeT = time; G.shakeDur = time; };
  G.freeze = function (time) { G.freezeT = Math.max(G.freezeT, time); };

  /* Le tracce a terra sono decorative: si tiene solo un numero limitato,
     e le più vecchie sbiadiscono via via che ne arrivano di nuove. */
  const MAX_DECALS = 70;
  G.addDecal = function (x, y, r, color, dir) {
    G.decals.push({
      x: x, y: y, r: r, color: color, a: 0.42 + Math.random() * 0.2, life: 999,
      dx: Math.cos(dir || 0) * r * 0.7, dy: Math.sin(dir || 0) * r * 0.5
    });
    if (G.decals.length > MAX_DECALS) G.decals.splice(0, G.decals.length - MAX_DECALS);
  };
  G.pushEvents = pushEvents;
  G.onPlayerDeath = onPlayerDeath;
  G.dropItemToGround = dropItemToGround;
  G.refreshNpcMarkers = refreshNpcMarkers;
  G.newGame = newGame;
  G.continueGame = continueGame;
  G.toTitle = toTitle;
  G.save = save;
  G.wipeSave = wipeSave;
  G.saveSettings = saveSettings;
  G.applyAudioSettings = applyAudioSettings;
  G.refreshMusic = refreshMusic;
  G.applyQuality = applyQuality;
  G.respawn = respawn;

  /* ---------------- Debug ---------------- */
  /* Valore di debug se impostato dal menu, altrimenti il default di bilanciamento.
     Esposta su G perché entities.js la usa (killEnemy riceve G). */
  function debugSeconds(key, fallback) {
    const d = G.settings.debug;
    return (d && d[key] != null) ? d[key] : fallback;
  }
  G.debugSeconds = debugSeconds;

  /* Forza il respawn dei contenuti della zona corrente senza aspettare il timer.
     scope: 'common' (nemici comuni) | 'epic' (unici/boss) | 'chests' | 'shrines'
     | 'all' (comuni + forzieri + santuari, MAI i boss: quelli restano una
     scelta a parte finché non decidiamo diversamente per la narrativa). */
  function debugForceRespawn(scope) {
    if (!G.zone || !G.world || G.zone.def.safe) return;
    if (scope === 'common' || scope === 'epic' || scope === 'all') {
      G.enemies = E.forceRespawn(G.zone, G.world, G.p.level, {
        x: G.pe.x, y: G.pe.y, radius: ENTRY_SAFE_RADIUS
      }, scope === 'all' ? 'common' : scope, !!G.p.flags.endgame);
    }
    if (scope === 'chests' || scope === 'all') {
      for (const c of G.zone.chests) { c.open = false; delete G.world.chests[c.key]; }
    }
    if (scope === 'shrines' || scope === 'all') {
      for (const sh of G.zone.shrines) { sh.used = false; delete G.world.shrines[sh.key]; }
    }
  }
  G.debugForceRespawn = debugForceRespawn;

  /* Utili anche dalla console del browser per provare il gioco */
  G.enterZone = enterZone;
  G.doInteract = doInteract;
  G.updateInteractions = updateInteractions;

  CV.Game = G;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
