/* ============================================================
   SISTEMI: bottino, forgiatura, alchimia, missioni, dialoghi,
   salvataggio (serializzazione pura, senza I/O).
   LOGICA PURA.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const P = CV.Player;
  const M = CV.M;

  /* ================================================================
     BOTTINO
     ================================================================ */
  const Loot = {};

  /* Genera un pezzo di equipaggiamento casuale della fascia indicata. */
  Loot.makeGear = function (rng, tier, rarBias) {
    const pool = D.gearByTier(tier);
    if (!pool.length) return null;
    const id = rng.pick(pool);
    const rar = Loot.rollRarity(rng, rarBias || 0);
    const base = D.base(id);
    const aff = Loot.rollAffixes(rng, base.type, D.rarity[rar].affixes);
    return P.makeItem(id, { rar: rar, aff: aff });
  };

  Loot.rollRarity = function (rng, bias) {
    const r = rng.next() - (bias || 0) * 0.35;
    if (r < 0.02) return 'legend';
    if (r < 0.09) return 'epic';
    if (r < 0.26) return 'rare';
    if (r < 0.55) return 'fine';
    return 'common';
  };

  Loot.rollAffixes = function (rng, type, n) {
    const out = [];
    if (n <= 0) return out;
    const pre = D.prefixes.filter(a => a.on.indexOf(type) >= 0);
    const suf = D.suffixes.filter(a => a.on.indexOf(type) >= 0);
    if (pre.length && rng.chance(0.75)) out.push(rng.pick(pre).key);
    if (suf.length && (n > 1 || !out.length)) out.push(rng.pick(suf).key);
    if (n > 2 && pre.length) {
      const extra = rng.pick(pre).key;
      if (out.indexOf(extra) < 0) out.push(extra);
    }
    return out;
  };

  Loot.makeTrinket = function (rng) {
    const keys = Object.keys(D.trinkets);
    const id = rng.pick(keys);
    const rar = Loot.rollRarity(rng, 0.1);
    return P.makeItem(id, { rar: rar, aff: Loot.rollAffixes(rng, 'trinket', D.rarity[rar].affixes) });
  };

  /* Estrae 1..n voci da una tabella e le trasforma in istanze. */
  Loot.rollTable = function (table, rng, draws, boost) {
    const out = [];
    draws = draws || 1;
    for (let i = 0; i < draws; i++) {
      const e = rng.weighted(table);
      if (e.kind === 'gear') {
        const g = Loot.makeGear(rng, e.tier || 1, boost ? 0.25 : 0);
        if (g) out.push(g);
      } else if (e.kind === 'trinket') {
        out.push(Loot.makeTrinket(rng));
      } else {
        const qty = e.min == null ? 1 : rng.int(e.min, e.max == null ? e.min : e.max);
        if (qty > 0) out.push(P.makeItem(e.id, { qty: qty }));
      }
    }
    return out;
  };

  Loot.fromEnemy = function (def, rng, boost) {
    const draws = boost ? 3 : (rng.chance(0.45) ? 2 : 1);
    return Loot.rollTable(def.loot, rng, draws, boost);
  };

  Loot.fromChest = function (tableName, rng) {
    const t = D.chestTables[tableName] || D.chestTables.poor;
    return Loot.rollTable(t, rng, 2 + (rng.chance(0.4) ? 1 : 0), tableName === 'rich');
  };

  /* ================================================================
     FORGIATURA
     ================================================================ */
  const Smith = {};

  Smith.canCraft = function (p, recipe) {
    if (p.skills.smithing.lvl < recipe.skill) return { ok: false, why: 'Fabbrilità insufficiente (serve ' + recipe.skill + ').' };
    for (const id in recipe.cost) {
      if (P.count(p, id) < recipe.cost[id]) {
        return { ok: false, why: 'Materiali insufficienti.' };
      }
    }
    return { ok: true };
  };

  Smith.craft = function (p, recipe, rng, out) {
    const chk = Smith.canCraft(p, recipe);
    if (!chk.ok) return chk;
    const free = p.perks.salvage && rng.chance(0.30);
    if (!free) for (const id in recipe.cost) P.removeById(p, id, recipe.cost[id]);

    let rar = 'common';
    if (recipe.kind !== 'material' && p.perks.masterwork) {
      const r = rng.next();
      rar = r < 0.12 ? 'epic' : (r < 0.42 ? 'rare' : 'fine');
    } else if (recipe.kind !== 'material' && p.skills.smithing.lvl >= 40 && rng.chance(0.3)) {
      rar = 'fine';
    }
    const aff = recipe.kind === 'material' ? [] : Loot.rollAffixes(rng, recipe.kind, D.rarity[rar].affixes);
    const it = P.makeItem(recipe.out, { qty: recipe.qty, rar: rar, aff: aff });
    P.addItem(p, it);
    P.trainSkill(p, 'smithing', 12 + recipe.skill * 0.6, out);
    return { ok: true, item: it, free: free };
  };

  Smith.maxUpgrade = function (p) { return D.MAX_UPGRADE + (p.perks.tempering ? 1 : 0); };

  Smith.canUpgrade = function (p, it) {
    const r = P.resolve(it);
    if (!r || (r.type !== 'weapon' && r.type !== 'armor')) return { ok: false, why: 'Non temprabile.' };
    if (it.up >= Smith.maxUpgrade(p)) return { ok: false, why: 'Tempra già al massimo.' };
    const reqSkill = it.up * 12;
    if (p.skills.smithing.lvl < reqSkill) return { ok: false, why: 'Serve Fabbrilità ' + reqSkill + '.' };
    const cost = D.upgradeCost(it.up);
    for (const id in cost) if (P.count(p, id) < cost[id]) return { ok: false, why: 'Materiali insufficienti.', cost: cost };
    return { ok: true, cost: cost };
  };

  Smith.upgrade = function (p, it, out) {
    const chk = Smith.canUpgrade(p, it);
    if (!chk.ok) return chk;
    for (const id in chk.cost) P.removeById(p, id, chk.cost[id]);
    it.up++;
    P.trainSkill(p, 'smithing', 18 + it.up * 8, out);
    P.recalc(p);
    return { ok: true };
  };

  /* ================================================================
     ALCHIMIA — effetti condivisi, come in Skyrim
     ================================================================ */
  const Alch = {};

  Alch.sharedEffects = function (idA, idB) {
    const a = D.ingredients[idA], b = D.ingredients[idB];
    if (!a || !b) return [];
    return a.fx.filter(f => b.fx.indexOf(f) >= 0);
  };

  /* Anteprima di cosa uscirebbe, mostrando solo ciò che il giocatore conosce. */
  Alch.preview = function (p, idA, idB) {
    const shared = Alch.sharedEffects(idA, idB);
    const a = D.ingredients[idA], b = D.ingredients[idB];
    return shared.map(k => ({
      key: k,
      known: P.knowsEffect(p, idA, a.fx.indexOf(k)) && P.knowsEffect(p, idB, b.fx.indexOf(k))
    }));
  };

  Alch.power = function (p) {
    let mult = 1 + p.skills.alchemy.lvl * 0.014;
    if (p.perks.concentration) mult *= 1.45;
    return mult;
  };

  Alch.brew = function (p, idA, idB, out) {
    if (idA === idB) return { ok: false, why: 'Servono due ingredienti diversi.' };
    if (P.count(p, idA) < 1 || P.count(p, idB) < 1) return { ok: false, why: 'Ingredienti mancanti.' };
    const shared = Alch.sharedEffects(idA, idB);
    if (!shared.length) {
      /* Come in Skyrim: senza virtù comuni non si ottiene nulla, ma si impara qualcosa. */
      const a = D.ingredients[idA], b = D.ingredients[idB];
      P.learnEffect(p, idA, 0); P.learnEffect(p, idB, 0);
      return { ok: false, why: 'Nessuna virtù in comune. Il miscuglio si annerisce e si spegne.', learned: true };
    }

    P.removeById(p, idA, 1);
    P.removeById(p, idB, 1);

    const mult = Alch.power(p);
    const a = D.ingredients[idA], b = D.ingredients[idB];
    const fx = [];
    for (const k of shared) {
      const def = D.effects[k];
      const mag = def.mode === 'instant'
        ? Math.round(def.base * mult)
        : Math.round(def.base * mult * 100) / 100;
      fx.push({ key: k, mag: mag, dur: def.dur ? Math.round(def.dur * (1 + p.skills.alchemy.lvl * 0.006)) : 0 });
      P.learnEffect(p, idA, a.fx.indexOf(k));
      P.learnEffect(p, idB, b.fx.indexOf(k));
    }

    const harmful = fx.length > 0 && D.effects[fx[0].key].harmful;
    const primary = D.effects[fx[0].key];
    const name = (harmful ? 'Veleno di ' : 'Pozione di ') + primary.name + (fx.length > 1 ? ' (+' + (fx.length - 1) + ')' : '');
    let value = 0;
    for (const f of fx) value += Math.round(f.mag * (f.dur ? f.dur * 0.4 : 1) * 0.9) + 10;

    const potion = {
      name: name,
      sig: fx.map(f => f.key + ':' + f.mag + ':' + f.dur).join('|'),
      fx: fx, harmful: harmful, value: Math.max(12, Math.round(value)),
      icon: harmful ? 'potion_bad' : ('potion_' + fx[0].key),
      color: primary.color,
      desc: fx.map(f => D.effects[f.key].name + ' ' + D.fmtMag(f.key, f.mag) + (f.dur ? ' per ' + f.dur + 's' : '')).join(', ')
    };
    const it = P.makeItem('potion', { potion: potion, rar: fx.length >= 3 ? 'rare' : (fx.length === 2 ? 'fine' : 'common') });
    P.addItem(p, it);
    P.trainSkill(p, 'alchemy', 14 + fx.length * 9, out);
    return { ok: true, item: it, potion: potion };
  };

  /* Mangiare un ingrediente crudo: effetto debole, ma se ne impara la prima virtù. */
  Alch.eat = function (p, id) {
    const ing = D.ingredients[id];
    if (!ing || P.count(p, id) < 1) return { ok: false };
    P.removeById(p, id, 1);
    const key = ing.fx[0];
    const def = D.effects[key];
    const mag = def.mode === 'instant' ? Math.round(def.base * 0.35) : Math.round(def.base * 0.4 * 100) / 100;
    P.applyEffect(p, key, mag, (def.dur || 0) * 0.5);
    const isNew = P.learnEffect(p, id, 0);
    P.trainSkill(p, 'alchemy', 4);
    return { ok: true, key: key, isNew: isNew };
  };

  /* Bere una pozione preparata. */
  Alch.drink = function (p, it) {
    if (!it || !it.potion) return false;
    for (const f of it.potion.fx) P.applyEffect(p, f.key, f.mag, f.dur);
    P.removeUid(p, it.uid, 1);
    return true;
  };

  /* ================================================================
     MISSIONI
     ================================================================ */
  const Q = {};

  Q.get = function (p, id) {
    return p.quests[id] || null;
  };

  Q.state = function (p, id) {
    const def = D.quests[id];
    if (!def) return 'none';
    const q = p.quests[id];
    if (q && q.done) return 'done';
    if (q) return Q.stageComplete(p, id) && q.stage >= def.stages.length - 1 ? 'ready' : 'active';
    if (def.requires && (!p.quests[def.requires] || !p.quests[def.requires].done)) return 'locked';
    return 'available';
  };

  Q.start = function (p, id, out) {
    if (p.quests[id]) return false;
    const def = D.quests[id];
    if (!def) return false;
    p.quests[id] = { id: id, stage: 0, done: false, counters: {} };
    if (out) out.push({ type: 'quest', quest: id, event: 'start' });
    Q.check(p, out);
    return true;
  };

  /* Verifica se l'obiettivo dello stage corrente è soddisfatto. */
  Q.stageComplete = function (p, id) {
    const q = p.quests[id], def = D.quests[id];
    if (!q || !def) return false;
    const st = def.stages[q.stage];
    if (!st) return true;
    const o = st.obj;
    switch (o.type) {
      case 'kill':    return (q.counters[o.target] || 0) >= o.count;
      case 'collect': return P.count(p, o.target) >= o.count;
      case 'reach':   return !!p.flags['reached_' + o.target];
      case 'talk':    return false;  /* si completa solo dialogando */
      case 'flag':    return !!p.flags[o.target];
      default:        return false;
    }
  };

  /* Avanza di uno stage; se era l'ultimo, completa la missione. */
  Q.advance = function (p, id, out) {
    const q = p.quests[id], def = D.quests[id];
    if (!q || q.done) return false;
    if (q.stage < def.stages.length - 1) {
      q.stage++;
      if (out) out.push({ type: 'quest', quest: id, event: 'stage', stage: q.stage });
      Q.check(p, out);
      return true;
    }
    return Q.complete(p, id, out);
  };

  Q.complete = function (p, id, out) {
    const q = p.quests[id], def = D.quests[id];
    if (!q || q.done) return false;
    q.done = true;
    const rw = def.reward || {};
    if (rw.take) for (const [iid, n] of rw.take) P.removeById(p, iid, n);
    if (rw.gold) p.gold += rw.gold;
    if (rw.items) for (const [iid, n] of rw.items) P.addById(p, iid, n);
    if (rw.xp) P.gainXp(p, rw.xp, out);
    P.recalc(p);
    if (out) out.push({ type: 'quest', quest: id, event: 'complete', reward: rw });
    return true;
  };

  /* Chiamata dopo ogni evento rilevante: avanza gli stage automatici. */
  Q.check = function (p, out) {
    for (const id in p.quests) {
      const q = p.quests[id], def = D.quests[id];
      if (!q || q.done || !def) continue;
      let guard = 0;
      while (!q.done && guard++ < 8) {
        const st = def.stages[q.stage];
        if (!st || st.obj.type === 'talk') break;
        if (!Q.stageComplete(p, id)) break;
        if (q.stage < def.stages.length - 1) {
          q.stage++;
          if (out) out.push({ type: 'quest', quest: id, event: 'stage', stage: q.stage });
        } else {
          /* Ultimo stage non dialogico: si chiude da solo solo se marcato `auto` */
          if (def.auto) Q.complete(p, id, out);
          break;
        }
      }
    }
  };

  Q.onKill = function (p, enemyId, out) {
    for (const id in p.quests) {
      const q = p.quests[id];
      if (!q || q.done) continue;
      q.counters[enemyId] = (q.counters[enemyId] || 0) + 1;
      q.counters.any = (q.counters.any || 0) + 1;
    }
    Q.check(p, out);
  };

  Q.onEnterZone = function (p, zoneId, out) {
    p.flags['reached_' + zoneId] = true;
    p.discovered[zoneId] = true;
    Q.check(p, out);
  };

  /* Testo di avanzamento leggibile per il diario. */
  Q.progressText = function (p, id) {
    const q = p.quests[id], def = D.quests[id];
    if (!q || !def) return '';
    const st = def.stages[q.stage];
    if (!st) return '';
    const o = st.obj;
    if (o.type === 'kill') return (q.counters[o.target] || 0) + ' / ' + o.count;
    if (o.type === 'collect') return Math.min(P.count(p, o.target), o.count) + ' / ' + o.count;
    return '';
  };

  /* ================================================================
     DIALOGHI — valutazione di condizioni dichiarative
     ================================================================ */
  const Dlg = {};

  Dlg.testCond = function (p, cond) {
    if (!cond) return true;
    for (const k in cond) {
      const v = cond[k];
      switch (k) {
        case 'questDone':      if (Q.state(p, v) !== 'done') return false; break;
        case 'questActive':    { const s = Q.state(p, v); if (s !== 'active' && s !== 'ready') return false; break; }
        case 'questReady':     if (Q.state(p, v) !== 'ready') return false; break;
        case 'questAvailable': if (Q.state(p, v) !== 'available') return false; break;
        case 'questStage': {
          const q = p.quests[v[0]];
          if (!q || q.done || q.stage !== v[1]) return false;
          break;
        }
        case 'hasItem':        if (P.count(p, v[0]) < (v[1] || 1)) return false; break;
        case 'flag':           if (!p.flags[v]) return false; break;
        case 'minLevel':       if (p.level < v) return false; break;
        case 'not':            if (Dlg.testCond(p, v)) return false; break;
        default: break;
      }
    }
    return true;
  };

  /* Primo nodo la cui condizione è soddisfatta.
     I nodi marcati `sub` sono solo continuazioni raggiungibili da
     un'opzione: non possono mai aprire una conversazione. L'ultimo
     nodo non-`sub` fa da battuta predefinita. */
  Dlg.rootFor = function (p, npcId) {
    const nodes = D.dialogue[npcId];
    if (!nodes) return null;
    let fallback = null;
    for (const n of nodes) {
      if (n.sub) continue;
      if (Dlg.testCond(p, n.cond)) return n;
      fallback = n;
    }
    return fallback;
  };

  Dlg.nodeById = function (npcId, nodeId) {
    const nodes = D.dialogue[npcId];
    if (!nodes) return null;
    return nodes.find(n => n.id === nodeId) || null;
  };

  /* Filtra le opzioni visibili in base alle loro condizioni. */
  Dlg.options = function (p, node) {
    if (!node || !node.opts) return [];
    return node.opts.filter(o => Dlg.testCond(p, o.cond));
  };

  /* ================================================================
     SALVATAGGIO — serializzazione pura (l'I/O sta nel layer motore)
     ================================================================ */
  const Save = {};
  Save.VERSION = 1;

  Save.serialize = function (p, worldState, settings) {
    return {
      v: Save.VERSION,
      t: Date.now(),
      uid: P.getUidCounter(),
      player: p,
      world: worldState,
      settings: settings || {}
    };
  };

  Save.deserialize = function (raw) {
    if (!raw || raw.v !== Save.VERSION) return null;
    const p = raw.player;
    if (!p) return null;
    /* Ricostruisce i campi eventualmente assenti in salvataggi vecchi */
    for (const k of P.SKILL_ORDER) if (!p.skills[k]) p.skills[k] = { lvl: 5, xp: 0 };
    p.effects = p.effects || [];
    p.known = p.known || {};
    p.flags = p.flags || {};
    p.quests = p.quests || {};
    p.discovered = p.discovered || {};
    P.setUidCounter((raw.uid || 1) + 1);
    P.recalc(p);
    return { player: p, world: raw.world || {}, settings: raw.settings || {}, t: raw.t };
  };

  CV.Loot = Loot;
  CV.Smith = Smith;
  CV.Alch = Alch;
  CV.Quests = Q;
  CV.Dialogue = Dlg;
  CV.Save = Save;
})(typeof window !== 'undefined' ? window : globalThis);
