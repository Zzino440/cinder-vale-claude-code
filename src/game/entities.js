/* ============================================================
   ENTITÀ E COMBATTIMENTO IN TEMPO REALE.
   Il giocatore e i nemici condividono la stessa struttura di stato
   a macchina: idle -> telegrafo -> colpo -> recupero.
   Il telegrafo è la finestra in cui si può parare o schivare: è ciò
   che rende leggibile un combattimento action.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const P = CV.Player;
  const W = CV.World;
  const M = CV.M;

  const E = {};

  /* Ampiezza della parata: ±120° attorno alla direzione di guardia.
     Prima erano ±98° attorno a una delle quattro direzioni cardinali,
     ed era la causa principale delle parate "dalla parte sbagliata". */
  E.BLOCK_ARC = 2.094;

  /* Tempo (in secondi reali) prima che un nemico comune ripopoli il suo
     punto. I nemici unici (named/boss) restano uccisi per sempre: la
     voce in `killed` per loro è `true`, non un timestamp. */
  const ENEMY_RESPAWN_SECONDS = 300;

  /* `killed[key]` vale `true` (permanente) oppure un timestamp Unix:
     "morto fino ad allora". Nessuna voce = mai ucciso. */
  function isDead(killed, key) {
    const v = killed[key];
    if (!v) return false;
    if (v === true) return true;
    return v > Date.now() / 1000;
  }

  /* ================= GIOCATORE ================= */
  E.makePlayer = function (p, x, y) {
    return {
      kind: 'player', x: x, y: y, radius: 7,
      vx: 0, vy: 0, face: 0, animT: 0, moving: false,
      state: 'idle', stateT: 0,
      /* Direzione di mira CONTINUA: da qui derivano colpo, parata e
         incantesimi. `face` resta a 4 direzioni ma serve solo allo sprite. */
      aimAngle: Math.PI / 2,
      target: null,              /* nemico agganciato dall'assistenza di mira */
      attackDir: 0, comboStep: 0, comboT: 0,
      iframes: 0, blockT: 0, blocking: false, blockHeld: false,
      bufAttack: 0, bufDodge: 0, /* comandi premuti un attimo troppo presto */
      lungeT: 0, lungeDir: 0,    /* passo in avanti verso il bersaglio */
      flash: 0, knockX: 0, knockY: 0,
      bleedT: 0, castT: 0, dead: false
    };
  };

  /* ================= NEMICI ================= */
  E.makeEnemy = function (defId, x, y, opts) {
    const def = D.enemies[defId];
    if (!def) return null;
    opts = opts || {};
    const hpMult = opts.hpMult || 1;
    const maxHp = Math.round(def.hp * hpMult * (1 + (opts.levelScale || 0)));
    return {
      kind: 'enemy', defId: defId, def: def, key: opts.key || null,
      name: opts.name || def.name,
      x: x, y: y, radius: def.radius || 8,
      hp: maxHp, maxHp: maxHp,
      dmgMult: (opts.dmgMult || 1) * (1 + (opts.levelScale || 0) * 0.6),
      face: 0, animT: 0, state: 'idle', stateT: 0,
      homeX: x, homeY: y, targetX: x, targetY: y,
      wanderT: 0, flash: 0, knockX: 0, knockY: 0,
      aggro: false, alertT: 0, stagger: 0, bleed: 0, poison: 0, hitT: 0,
      sightMult: opts.sightMult || 1,
      lunge: 0, phase: 0, special: 0, dead: false, deadT: 0,
      drop: opts.drop || null, boostLoot: !!opts.boostLoot, boss: !!opts.boss,
      elite: !!opts.name
    };
  };

  /* Popola una zona rispettando ciò che è già stato ucciso. */
  E.spawnZone = function (z, worldState, playerLevel, safeArea) {
    const out = [];
    const rng = new CV.Rng(z.def.seed + 17);
    const killed = (worldState.killed = worldState.killed || {});
    const levelScale = Math.max(0, (playerLevel - 1) * 0.06);

    (z.namedDefs || []).forEach((n, i) => {
      const key = z.id + ':named' + i;
      if (isDead(killed, key)) return;
      const e = E.makeEnemy(n.id, n.tx * W.T + 8, n.ty * W.T + 8, {
        key: key, name: n.name, hpMult: n.hpMult, dmgMult: n.dmgMult,
        drop: n.drop, boostLoot: n.boostLoot, boss: n.boss, levelScale: n.boss ? 0 : levelScale
      });
      if (e) out.push(e);
    });

    (z.spawnDefs || []).forEach((s, si) => {
      for (let i = 0; i < s.count; i++) {
        const key = z.id + ':' + si + ':' + i;
        if (isDead(killed, key)) continue;
        const spot = W.findFreeSpot(
          z, rng,
          safeArea && safeArea.x,
          safeArea && safeArea.y,
          safeArea && safeArea.radius
        );
        if (!spot) continue;
        const e = E.makeEnemy(s.id, spot.x, spot.y, { key: key, levelScale: levelScale });
        if (e) out.push(e);
      }
    });

    /* Nemici piazzati dai siti (composizioni, non posizioni a caso):
       vedi W.placeSites. Gia in posizione, gia con il ruolo risolto. */
    (z.siteSpawns || []).forEach((s) => {
      if (isDead(killed, s.key)) return;
      const e = E.makeEnemy(s.id, s.x, s.y, {
        key: s.key, hpMult: s.hpMult, dmgMult: s.dmgMult,
        sightMult: s.sightMult, levelScale: levelScale
      });
      if (e) out.push(e);
    });
    return out;
  };

  /* Strumento di debug: libera dalla mappa `killed` le chiavi dello scope
     richiesto e ripopola la zona da capo. 'epic' = i named/boss (z.namedDefs),
     'common' = densità di zona + composizioni dei siti, 'all' = entrambi. */
  E.forceRespawn = function (z, worldState, playerLevel, safeArea, scope) {
    const killed = (worldState.killed = worldState.killed || {});
    if (scope === 'epic' || scope === 'all') {
      (z.namedDefs || []).forEach((n, i) => { delete killed[z.id + ':named' + i]; });
    }
    if (scope === 'common' || scope === 'all') {
      (z.spawnDefs || []).forEach((s, si) => {
        for (let i = 0; i < s.count; i++) delete killed[z.id + ':' + si + ':' + i];
      });
      (z.siteSpawns || []).forEach((s) => { delete killed[s.key]; });
    }
    return E.spawnZone(z, worldState, playerLevel, safeArea);
  };

  /* ================= PROIETTILI ================= */
  E.makeProjectile = function (kind, x, y, dir, dmg, fromPlayer, opts) {
    opts = opts || {};
    const speed = kind === 'arrow' ? 240 : (kind === 'fireball' ? 155 : 200);
    return {
      kind: kind, x: x, y: y, dir: dir,
      vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed,
      dmg: dmg, fromPlayer: !!fromPlayer, life: opts.life || 2.6,
      radius: kind === 'arrow' ? 3 : 5, aoe: opts.aoe || 0, t: 0
    };
  };

  /* ================= EFFETTI VISIVI ================= */
  E.makeFloat = function (x, y, text, color, big) {
    return { x: x, y: y, text: text, color: color || '#fff', t: 0, life: big ? 1.1 : 0.8, big: !!big, vy: -26 };
  };
  E.makeParticle = function (x, y, color, opts) {
    opts = opts || {};
    const a = opts.dir == null ? Math.random() * Math.PI * 2 : opts.dir + (Math.random() - 0.5) * (opts.spread || 1.2);
    const sp = (opts.speed || 60) * (0.5 + Math.random() * 0.8);
    return {
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      color: color, life: opts.life || 0.45, t: 0,
      size: opts.size || 2, gravity: opts.gravity == null ? 40 : opts.gravity, fade: opts.fade !== false
    };
  };

  /* ================= LOGICA DI COMBATTIMENTO ================= */

  /* Danno inflitto dal giocatore con l'arma equipaggiata. */
  E.playerDamage = function (G) {
    const p = G.p;
    const w = P.equipped(p, 'weapon');
    const base = w ? w.dmg : 4;
    let dmg = base * p.stats.damage;
    const critChance = 0.07 + p.skills.blade.lvl * 0.0018;
    const crit = Math.random() < critChance;
    if (crit) dmg *= 1.85;
    return { dmg: dmg, crit: crit, fire: w ? (w.fire || 0) : 0 };
  };

  /* Applica danno a un nemico, con tutte le conseguenze. */
  E.hurtEnemy = function (G, e, amount, opts) {
    opts = opts || {};
    if (e.dead) return 0;
    const p = G.p;
    let dmg = amount;
    if (p.perks.execute && e.hp / e.maxHp < 0.25) dmg *= 1.6;
    const armor = (e.def.armor || 0) * (opts.ignoreArmor ? 0 : 1);
    dmg = Math.max(1, dmg - armor * 0.55);
    dmg = Math.round(dmg * 10) / 10;

    e.hp -= dmg;
    e.flash = 0.14;
    e.hitT = opts.crit ? 0.26 : 0.16;   /* deformazione dello sprite */
    e.aggro = true;
    e.alertT = 6;

    /* Micro-blocco sui critici: l'immagine si ferma un istante e il colpo
       acquista peso. Solo sui critici, perché su ogni colpo diventa
       singhiozzo invece che impatto. */
    if (opts.crit) G.freeze(0.055);
    if (opts.knock) {
      e.knockX += Math.cos(opts.knockDir) * opts.knock;
      e.knockY += Math.sin(opts.knockDir) * opts.knock;
    }
    if (opts.stagger) e.stagger = Math.max(e.stagger, opts.stagger);
    if (opts.bleed) e.bleed = Math.max(e.bleed, opts.bleed);

    G.floats.push(E.makeFloat(e.x, e.y - e.radius - 6, Math.round(dmg) + (opts.crit ? '!' : ''),
      opts.crit ? '#ffd166' : '#ffffff', opts.crit));

    /* Schizzo direzionale: le particelle partono lungo la traiettoria del
       colpo invece che a raggiera, e le più veloci lasciano un segno. */
    const dir = opts.dir == null ? Math.random() * Math.PI * 2 : opts.dir;
    const n = opts.crit ? 14 : 7;
    for (let i = 0; i < n; i++) {
      const fast = i < n * 0.4;
      G.particles.push(E.makeParticle(e.x, e.y, i % 4 ? '#c33636' : '#8f2020', {
        dir: dir, speed: fast ? 170 : 95, spread: fast ? 0.55 : 1.25,
        size: fast ? 2 : 1, life: 0.3 + Math.random() * 0.3, gravity: 90
      }));
    }
    G.addDecal(e.x + Math.cos(dir) * 8, e.y + Math.sin(dir) * 8, opts.crit ? 4 : 2.5, '#6b1a1a', dir);

    CV.Audio.play(opts.crit ? 'crit' : 'hit');
    if (e.hp <= 0) E.killEnemy(G, e, opts);
    return dmg;
  };

  E.killEnemy = function (G, e, opts) {
    e.dead = true; e.deadT = 0;
    e.hp = 0;
    CV.Audio.play('die');
    const p = G.p;
    p.kills++;

    for (let i = 0; i < 18; i++)
      G.particles.push(E.makeParticle(e.x, e.y, i % 2 ? '#6b6577' : '#a03030', { speed: 110, life: 0.75, size: 2 }));
    /* Il segno che resta dove è caduto */
    G.addDecal(e.x, e.y + 2, e.boss ? 11 : (e.elite ? 8 : 6), '#5a1616', Math.random() * 6.28);

    /* Esperienza */
    const evs = [];
    P.gainXp(p, e.def.xp * (e.elite ? 2 : 1), evs);
    G.pushEvents(evs);

    /* Bottino */
    const rng = G.rng;
    const items = CV.Loot.fromEnemy(e.def, rng, e.boostLoot);
    if (e.drop) items.push(P.makeItem(e.drop));
    for (const it of items) {
      const a = rng.next() * Math.PI * 2, d = 6 + rng.next() * 14;
      G.drops.push({ item: it, x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, t: 0, vy: -30 });
    }

    /* Registra la morte: i nemici unici (named/boss) restano fuori per
       sempre, quelli comuni ripopolano il loro punto dopo un po'.
       Il tempo è regolabile dal menu di debug (G.settings.debug). */
    if (e.key) {
      const respawnSecs = G.debugSeconds('enemyRespawnSeconds', ENEMY_RESPAWN_SECONDS);
      G.world.killed[e.key] = (e.elite || e.boss) ? true : Date.now() / 1000 + respawnSecs;
    }

    const evs2 = [];
    CV.Quests.onKill(p, e.defId, evs2);
    G.pushEvents(evs2);
    G.floats.push(E.makeFloat(e.x, e.y - 18, '+' + (e.def.xp * (e.elite ? 2 : 1)) + ' PE', '#c9a6ff'));
  };

  /* Danno subito dal giocatore: parata, parata perfetta, schivata. */
  E.hurtPlayer = function (G, amount, fromX, fromY, opts) {
    opts = opts || {};
    const p = G.p, pe = G.pe;
    if (pe.dead) return;
    if (pe.iframes > 0) {
      G.floats.push(E.makeFloat(pe.x, pe.y - 16, 'schivato', '#7cc46a'));
      return;
    }

    const dir = Math.atan2(pe.y - fromY, pe.x - fromX);

    if (pe.blocking && !opts.unblockable) {
      /* Parata perfetta: entro un quarto di secondo dall'alzata */
      const perfect = pe.blockT < 0.25;
      /* Il confronto usa la direzione di guardia continua, non più una
         delle quattro cardinali: pari davvero dove stai guardando. */
      const incoming = Math.atan2(fromY - pe.y, fromX - pe.x);
      const facing = Math.abs(M.angDelta(pe.aimAngle, incoming)) < E.BLOCK_ARC;
      if (facing) {
        if (perfect) {
          CV.Audio.play('parry');
          G.floats.push(E.makeFloat(pe.x, pe.y - 20, 'PARATA!', '#ffd166', true));
          G.shake(6, 0.18);
          for (let i = 0; i < 12; i++)
            G.particles.push(E.makeParticle(pe.x + Math.cos(dir) * -10, pe.y + Math.sin(dir) * -10, '#ffd166', { speed: 130, life: 0.4 }));
          if (opts.source) {
            opts.source.stagger = p.perks.riposte ? 1.6 : 1.0;
            opts.source.state = 'stagger'; opts.source.stateT = 0;
          }
          G.freeze(0.06);
          if (p.perks.riposte) p.sp = Math.min(p.stats.maxSp, p.sp + 22);
          const evs = [];
          P.trainSkill(p, 'block', 18, evs);
          G.pushEvents(evs);
          return;
        }
        /* Parata normale: assorbe una quota e costa vigore */
        const ratio = p.stats.blockRatio;
        const cost = Math.max(6, amount * 0.6);
        if (p.sp >= cost) {
          p.sp -= cost;
          amount *= (1 - ratio);
          CV.Audio.play('block');
          G.floats.push(E.makeFloat(pe.x, pe.y - 18, 'parato', '#8f96a3'));
          const evs = [];
          P.trainSkill(p, 'block', 7, evs);
          G.pushEvents(evs);
        } else {
          /* Guardia rotta */
          pe.blocking = false;
          pe.state = 'hurt'; pe.stateT = 0;
          G.floats.push(E.makeFloat(pe.x, pe.y - 18, 'guardia rotta!', '#c33636'));
        }
      }
    }

    /* Armatura e resistenza */
    let dmg = Math.max(1, amount - p.stats.armor * 0.7);
    dmg *= (1 - p.stats.res);
    dmg = Math.round(dmg * 10) / 10;

    p.hp -= dmg;
    pe.flash = 0.18;
    pe.iframes = Math.max(pe.iframes, 0.35);
    pe.knockX += Math.cos(dir) * (opts.knock || 90);
    pe.knockY += Math.sin(dir) * (opts.knock || 90);
    if (pe.state === 'attack') { pe.state = 'idle'; pe.stateT = 0; }

    G.shake(5, 0.16);
    G.floats.push(E.makeFloat(pe.x, pe.y - 16, '-' + Math.round(dmg), '#ff6b6b'));
    for (let i = 0; i < 6; i++)
      G.particles.push(E.makeParticle(pe.x, pe.y, '#c33636', { dir: dir, speed: 80, spread: 1.0 }));
    CV.Audio.play('hurt');

    if (opts.venom) P.applyEffect(p, 'venom', opts.venom, 5);
    if (p.hp <= 0) { p.hp = 0; E.killPlayer(G); }
  };

  E.killPlayer = function (G) {
    G.pe.dead = true;
    G.pe.state = 'dead';
    G.pe.stateT = 0;
    G.p.deaths++;
    CV.Audio.play('die');
    G.onPlayerDeath();
  };

  /* Ingresso nel telegrafo: suono breve solo se il nemico è abbastanza
     vicino da riguardarti, altrimenti in mezzo a un gruppo diventa rumore. */
  E.enterTelegraph = function (G, e, dist) {
    e.state = 'telegraph';
    e.stateT = 0;
    e.didHit = false;
    if (dist < 210) CV.Audio.play('telegraph');
  };

  E.faceAngle = function (face) {
    /* 0=giù 1=sinistra 2=destra 3=su */
    return face === 0 ? Math.PI / 2 : face === 1 ? Math.PI : face === 2 ? 0 : -Math.PI / 2;
  };

  /* Colpo ad arco del giocatore: raccoglie i nemici dentro il settore. */
  E.resolveMeleeSwing = function (G) {
    const p = G.p, pe = G.pe;
    const w = P.equipped(p, 'weapon');
    const reach = (w ? w.reach : 24) + 4;
    const arc = (w ? w.arc : 1.5) / 2;
    const dir = pe.attackDir;
    const hits = [];

    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = M.dist(pe.x, pe.y, e.x, e.y);
      if (d > reach + e.radius) continue;
      const a = Math.atan2(e.y - pe.y, e.x - pe.x);
      if (Math.abs(M.angDelta(dir, a)) > arc) continue;
      hits.push({ e: e, d: d });
    }
    hits.sort((a, b) => a.d - b.d);
    if (!hits.length) return 0;

    /* Senza il talento Fendente Ampio si colpisce solo il bersaglio più vicino */
    const targets = p.perks.cleave ? hits : [hits[0]];
    let total = 0;
    for (const t of targets) {
      const roll = E.playerDamage(G);
      let dmg = roll.dmg;
      if (t !== targets[0] && p.perks.cleave) dmg *= 0.75;
      const dealt = E.hurtEnemy(G, t.e, dmg + roll.fire, {
        crit: roll.crit, dir: dir, knock: 110 + (roll.crit ? 60 : 0), knockDir: dir,
        stagger: roll.crit ? 0.35 : 0.15,
        bleed: (roll.crit && p.perks.bleed) ? 6 : 0
      });
      total += dealt;
    }
    const evs = [];
    P.trainSkill(p, 'blade', 6 + targets.length * 2, evs);
    G.pushEvents(evs);
    G.shake(3, 0.1);
    return total;
  };

  /* ================= AGGIORNAMENTO NEMICI ================= */
  E.updateEnemy = function (G, e, dt) {
    const pe = G.pe, p = G.p;

    if (e.dead) { e.deadT += dt; return; }

    /* Effetti nel tempo */
    if (e.bleed > 0) {
      e.bleed -= dt;
      e.hp -= 4 * dt;
      if (Math.random() < dt * 6) G.particles.push(E.makeParticle(e.x, e.y, '#a03030', { speed: 20, life: 0.5, gravity: 60 }));
      if (e.hp <= 0) { E.killEnemy(G, e, {}); return; }
    }
    if (e.flash > 0) e.flash -= dt;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.stagger > 0) { e.stagger -= dt; }

    /* Contraccolpo */
    if (Math.abs(e.knockX) > 1 || Math.abs(e.knockY) > 1) {
      W.moveWithCollision(G.zone, e, e.knockX * dt, e.knockY * dt);
      e.knockX *= 0.86; e.knockY *= 0.86;
    }
    if (e.stagger > 0) return;   /* stordito: non agisce */

    const def = e.def;
    const dist = M.dist(e.x, e.y, pe.x, pe.y);
    const toPlayer = Math.atan2(pe.y - e.y, pe.x - e.x);

    /* Percezione */
    /* All'ingresso il giocatore ha un breve tempo per leggere la scena.
       Un'azione offensiva azzera entryGraceT dal ciclo principale. */
    const sight = def.sight * (e.sightMult || 1);
    if (!pe.dead && G.entryGraceT <= 0 && dist < sight) { e.aggro = true; e.alertT = 5; }
    else if (e.alertT > 0) { e.alertT -= dt; if (e.alertT <= 0) e.aggro = false; }

    e.stateT += dt;
    e.animT += dt;

    if (!e.aggro || pe.dead) {
      /* Pattugliamento pigro attorno al punto di partenza */
      e.wanderT -= dt;
      if (e.wanderT <= 0) {
        e.wanderT = 1.6 + Math.random() * 2.6;
        const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 46;
        e.targetX = e.homeX + Math.cos(a) * r;
        e.targetY = e.homeY + Math.sin(a) * r;
      }
      const d2 = M.dist(e.x, e.y, e.targetX, e.targetY);
      if (d2 > 4) {
        const a = Math.atan2(e.targetY - e.y, e.targetX - e.x);
        const sp = def.speed * 0.4 * dt;
        W.moveWithCollision(G.zone, e, Math.cos(a) * sp, Math.sin(a) * sp);
        e.face = M.facingFromVec(Math.cos(a), Math.sin(a));
        e.moving = true;
      } else e.moving = false;
      e.state = 'idle';
      return;
    }

    e.face = M.facingFromVec(pe.x - e.x, pe.y - e.y);

    switch (e.state) {
      case 'idle':
      case 'chase': {
        e.state = 'chase';
        const ai = def.ai;
        let want = 0;
        if (ai === 'ranged') {
          const keep = def.keepDist || 110;
          if (dist > keep + 20) want = 1;
          else if (dist < keep - 30) want = -1;
          if (dist <= def.attackRange && e.stateT > 0.35) E.enterTelegraph(G, e, dist);
        } else {
          want = 1;
          if (dist <= def.attackRange + e.radius) E.enterTelegraph(G, e, dist);
        }
        if (want !== 0) {
          const sp = def.speed * dt * want;
          /* Piccolo scarto laterale: evita che il branco si sovrapponga in fila */
          const wob = Math.sin(e.animT * 3 + e.x) * 0.25;
          const a = toPlayer + wob * (ai === 'charger' ? 0.5 : 1);
          W.moveWithCollision(G.zone, e, Math.cos(a) * sp, Math.sin(a) * sp);
          e.moving = true;
        } else e.moving = false;

        /* Il boss lancia attacchi speciali a intervalli */
        if (def.ai === 'boss') {
          e.special -= dt;
          if (e.special <= 0) {
            e.special = e.hp / e.maxHp < 0.5 ? 4.2 : 6.5;
            e.state = 'special'; e.stateT = 0;
          }
        }
        break;
      }

      case 'telegraph': {
        e.moving = false;
        /* I ranged possono ancora ruotare verso il bersaglio */
        if (e.stateT >= def.telegraph) {
          e.state = 'attack'; e.stateT = 0;
          e.attackDir = toPlayer;
          if (def.ai === 'charger') e.lunge = 0.22;
          if (def.ai === 'ranged') {
            const dmg = def.dmg * e.dmgMult;
            const proj = E.makeProjectile(def.projectile || 'arrow', e.x, e.y, toPlayer, dmg, false,
              { aoe: def.projectile === 'fireball' ? 22 : 0 });
            G.projectiles.push(proj);
            CV.Audio.play(def.projectile === 'fireball' ? 'fire' : 'arrow');
          } else {
            CV.Audio.play('swing');
          }
        }
        break;
      }

      case 'attack': {
        if (def.ai === 'charger' && e.lunge > 0) {
          e.lunge -= dt;
          const sp = def.speed * 2.4 * dt;
          W.moveWithCollision(G.zone, e, Math.cos(e.attackDir) * sp, Math.sin(e.attackDir) * sp);
        }
        /* Finestra attiva del colpo in mischia */
        if (def.ai !== 'ranged' && e.stateT < 0.18) {
          const reach = def.attackRange + e.radius + 4;
          if (M.dist(e.x, e.y, pe.x, pe.y) < reach && !e.didHit) {
            const a = Math.atan2(pe.y - e.y, pe.x - e.x);
            if (Math.abs(M.angDelta(e.attackDir, a)) < 1.1) {
              e.didHit = true;
              E.hurtPlayer(G, def.dmg * e.dmgMult, e.x, e.y, {
                source: e, knock: def.ai === 'charger' ? 150 : 100,
                venom: def.venom || 0
              });
            }
          }
        }
        if (e.stateT >= 0.28) { e.state = 'recover'; e.stateT = 0; e.didHit = false; }
        break;
      }

      case 'special': {
        /* Attacco speciale del boss: anello di fuoco */
        e.moving = false;
        if (e.stateT > 0.8 && !e.didHit) {
          e.didHit = true;
          const n = e.hp / e.maxHp < 0.5 ? 12 : 8;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 + e.animT;
            G.projectiles.push(E.makeProjectile('fireball', e.x, e.y, a, def.dmg * 0.7 * e.dmgMult, false, { aoe: 18, life: 3.2 }));
          }
          CV.Audio.play('fire');
          G.shake(9, 0.3);
        }
        if (e.stateT > 1.4) { e.state = 'recover'; e.stateT = 0; e.didHit = false; }
        break;
      }

      case 'recover': {
        e.moving = false;
        if (e.stateT >= def.recovery) { e.state = 'chase'; e.stateT = 0; }
        break;
      }

      default:
        e.state = 'chase';
    }
  };

  /* ================= PROIETTILI ================= */
  E.updateProjectiles = function (G, dt) {
    const pe = G.pe;
    for (let i = G.projectiles.length - 1; i >= 0; i--) {
      const pr = G.projectiles[i];
      pr.t += dt;
      pr.life -= dt;
      const nx = pr.x + pr.vx * dt, ny = pr.y + pr.vy * dt;

      if (pr.life <= 0 || W.solidAt(G.zone, nx, ny)) {
        E.burst(G, pr);
        G.projectiles.splice(i, 1);
        continue;
      }
      pr.x = nx; pr.y = ny;

      if (pr.fromPlayer) {
        for (const e of G.enemies) {
          if (e.dead) continue;
          if (M.dist(pr.x, pr.y, e.x, e.y) < e.radius + pr.radius) {
            const p = G.p;
            let dmg = pr.dmg;
            E.hurtEnemy(G, e, dmg, { dir: pr.dir, knock: 70, knockDir: pr.dir, stagger: 0.2 });
            if (pr.aoe) E.splash(G, pr.x, pr.y, pr.aoe, dmg * 0.6, e);
            E.burst(G, pr);
            G.projectiles.splice(i, 1);
            break;
          }
        }
      } else if (!pe.dead) {
        if (M.dist(pr.x, pr.y, pe.x, pe.y) < pe.radius + pr.radius + 1) {
          E.hurtPlayer(G, pr.dmg, pr.x - pr.vx * 0.05, pr.y - pr.vy * 0.05, { knock: 70 });
          E.burst(G, pr);
          G.projectiles.splice(i, 1);
        }
      }
    }
  };

  E.splash = function (G, x, y, radius, dmg, skip) {
    for (const e of G.enemies) {
      if (e.dead || e === skip) continue;
      if (M.dist(x, y, e.x, e.y) < radius + e.radius)
        E.hurtEnemy(G, e, dmg, { dir: Math.atan2(e.y - y, e.x - x), knock: 60, knockDir: Math.atan2(e.y - y, e.x - x) });
    }
  };

  E.burst = function (G, pr) {
    const col = pr.kind === 'fireball' ? '#f06c3a' : '#a5713f';
    const n = pr.kind === 'fireball' ? 12 : 5;
    for (let i = 0; i < n; i++)
      G.particles.push(E.makeParticle(pr.x, pr.y, i % 3 ? col : '#ffd166', { speed: 90, life: 0.4, size: pr.kind === 'fireball' ? 3 : 2 }));
    if (pr.kind === 'fireball') CV.Audio.play('fire');
  };

  /* ================= PARTICELLE E TESTI ================= */
  E.updateFx = function (G, dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const q = G.particles[i];
      q.t += dt;
      if (q.t >= q.life) { G.particles.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vy += q.gravity * dt;
      q.vx *= 0.96; q.vy *= 0.98;
    }
    for (let i = G.floats.length - 1; i >= 0; i--) {
      const f = G.floats[i];
      f.t += dt;
      if (f.t >= f.life) { G.floats.splice(i, 1); continue; }
      f.y += f.vy * dt;
      f.vy *= 0.92;
    }
    for (let i = G.drops.length - 1; i >= 0; i--) {
      const d = G.drops[i];
      d.t += dt;
      d.y += d.vy * dt;
      d.vy = Math.min(0, d.vy + 120 * dt);
    }
  };

    /* Genera un nemico di imboscata (chiamata da main.js al momento
     dell innesco). Rispetta la stessa persistenza killed degli altri. */
  E.spawnAmbushOne = function (s, worldState, playerLevel) {
    const killed = worldState.killed || {};
    if (isDead(killed, s.key)) return null;
    const levelScale = Math.max(0, (playerLevel - 1) * 0.06);
    return E.makeEnemy(s.id, s.x, s.y, {
      key: s.key, hpMult: s.hpMult, dmgMult: s.dmgMult,
      sightMult: s.sightMult, levelScale: levelScale
    });
  };

  CV.Ent = E;
})(typeof window !== 'undefined' ? window : globalThis);
