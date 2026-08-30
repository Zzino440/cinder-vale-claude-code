/* ============================================================
   PERSONAGGIO: statistiche, abilità, talenti, inventario, effetti.
   LOGICA PURA. Nessun accesso al DOM, al canvas o al tempo reale:
   tutte le funzioni ricevono lo stato e lo modificano.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const M = CV.M;

  /* ================= ABILITÀ ================= */
  const SKILLS = {
    blade:       { key: 'blade',       name: 'Lama',        desc: 'Danno con armi da mischia.',              color: '#c33636' },
    destruction: { key: 'destruction', name: 'Distruzione', desc: 'Potenza degli incantesimi e riserva di etere.', color: '#6fb3ff' },
    block:       { key: 'block',       name: 'Blocco',      desc: 'Efficacia della parata e resistenza.',     color: '#8f96a3' },
    athletics:   { key: 'athletics',   name: 'Atletica',    desc: 'Velocità, vigore e costo delle schivate.', color: '#7cc46a' },
    smithing:    { key: 'smithing',    name: 'Fabbrilità',  desc: 'Qualità di ciò che forgi e temperi.',      color: '#f06c3a' },
    alchemy:     { key: 'alchemy',     name: 'Alchimia',    desc: 'Potenza e durata delle pozioni.',          color: '#c9a6ff' }
  };
  const SKILL_ORDER = ['blade', 'destruction', 'block', 'athletics', 'smithing', 'alchemy'];
  const SKILL_MAX = 100;

  /* ================= TALENTI ================= */
  const PERKS = {
    /* Lama */
    cleave:        { id: 'cleave',        skill: 'blade',       req: 15, name: 'Fendente Ampio',   desc: 'I colpi in mischia colpiscono ogni nemico dentro l\'arco, non solo il primo.' },
    bleed:         { id: 'bleed',         skill: 'blade',       req: 35, name: 'Ferita Aperta',    desc: 'I colpi critici fanno sanguinare il bersaglio per 6 secondi.' },
    execute:       { id: 'execute',       skill: 'blade',       req: 60, name: 'Colpo di Grazia',  desc: '+60% di danno contro nemici sotto un quarto della vita.' },
    /* Distruzione */
    focus:         { id: 'focus',         skill: 'destruction', req: 15, name: 'Concentrazione',   desc: 'Gli incantesimi costano il 30% di etere in meno.' },
    blast:         { id: 'blast',         skill: 'destruction', req: 35, name: 'Deflagrazione',    desc: 'Le sfere di fuoco esplodono in un\'area.' },
    conflagration: { id: 'conflagration', skill: 'destruction', req: 60, name: 'Conflagrazione',   desc: '+35% di danno magico.' },
    /* Blocco */
    bulwark:       { id: 'bulwark',       skill: 'block',       req: 15, name: 'Baluardo',         desc: 'La parata assorbe l\'80% del danno invece del 55%.' },
    riposte:       { id: 'riposte',       skill: 'block',       req: 35, name: 'Rimessa',          desc: 'La parata perfetta restituisce vigore e stordisce più a lungo.' },
    ironskin:      { id: 'ironskin',      skill: 'block',       req: 60, name: 'Pelle di Ferro',   desc: '+8 di armatura permanente.' },
    /* Atletica */
    nimble:        { id: 'nimble',        skill: 'athletics',   req: 15, name: 'Agile',            desc: 'Le schivate costano il 35% di vigore in meno.' },
    windstep:      { id: 'windstep',      skill: 'athletics',   req: 35, name: 'Passo di Vento',   desc: '+12% di velocità di movimento.' },
    secondwind:    { id: 'secondwind',    skill: 'athletics',   req: 60, name: 'Secondo Fiato',    desc: 'Il vigore si rigenera al doppio della velocità.' },
    /* Fabbrilità */
    tempering:     { id: 'tempering',     skill: 'smithing',    req: 15, name: 'Tempra Salda',     desc: 'Puoi temprare l\'equipaggiamento di un grado in più.' },
    salvage:       { id: 'salvage',       skill: 'smithing',    req: 35, name: 'Recupero',         desc: '30% di possibilità di non consumare i materiali quando forgi.' },
    masterwork:    { id: 'masterwork',    skill: 'smithing',    req: 60, name: 'Opera Magistrale', desc: 'Ciò che forgi ha buone probabilità di nascere di rarità superiore.' },
    /* Alchimia */
    botanist:      { id: 'botanist',      skill: 'alchemy',     req: 15, name: 'Botanico',         desc: 'Raccogli il doppio di ingredienti dai cespugli.' },
    concentration: { id: 'concentration', skill: 'alchemy',     req: 35, name: 'Distillato',       desc: 'Le pozioni che prepari sono più potenti del 45%.' },
    physician:     { id: 'physician',     skill: 'alchemy',     req: 60, name: 'Medico',           desc: 'Gli effetti a tempo durano il 60% in più.' }
  };

  /* ================= ISTANZE DI OGGETTO ================= */
  let uidCounter = 1;

  /* Crea un'istanza concreta di un oggetto a partire da un id base.
     opts: { qty, rar, aff:[chiaviAffisso], up:gradoDiTempra, potion:{...} } */
  function makeItem(id, opts) {
    opts = opts || {};
    const base = D.base(id);
    if (!base && id !== 'potion') return null;
    const it = {
      uid: 'i' + (uidCounter++),
      id: id,
      qty: opts.qty || 1,
      rar: opts.rar || 'common',
      aff: opts.aff ? opts.aff.slice() : [],
      up: opts.up || 0
    };
    if (opts.potion) it.potion = opts.potion;
    return it;
  }

  /* Un oggetto è impilabile se non è equipaggiabile e non ha modificatori. */
  function isStackable(it) {
    if (it.potion) return true;
    const b = D.base(it.id);
    if (!b) return false;
    return b.type === 'ingredient' || b.type === 'material' || b.type === 'misc';
  }

  /* Firma usata per capire se due istanze possono impilarsi insieme. */
  function stackKey(it) {
    if (it.potion) return 'potion:' + it.potion.sig;
    return it.id + '|' + it.rar + '|' + it.aff.join(',') + '|' + it.up;
  }

  /* Risolve tutte le proprietà finali di un'istanza (base + rarità + affissi + tempra). */
  function resolve(it) {
    if (!it) return null;
    if (it.potion) {
      return {
        id: 'potion', type: 'potion', name: it.potion.name, icon: it.potion.icon || 'potion',
        weight: 0.4, value: it.potion.value, rar: it.rar, potion: it.potion,
        flavor: it.potion.desc || ''
      };
    }
    const b = D.base(it.id);
    if (!b) return null;
    const rar = D.rarity[it.rar] || D.rarity.common;
    const r = {
      id: b.id, type: b.type, slot: b.slot, icon: b.icon, flavor: b.flavor || '',
      rar: it.rar, up: it.up, aff: it.aff,
      weight: b.weight, value: b.value, quest: !!b.quest
    };

    /* Nome composto: prefisso + base + suffisso + grado di tempra */
    let pre = '', suf = '';
    for (const k of it.aff) {
      const p = D.prefixes.find(x => x.key === k);
      if (p) { pre = p.name + ' '; continue; }
      const s = D.suffixes.find(x => x.key === k);
      if (s) suf = ' ' + s.name;
    }
    r.name = pre + b.name + suf + (it.up > 0 ? ' +' + it.up : '');

    const mods = collectMods(it);
    const upMult = 1 + it.up * 0.14;

    if (b.type === 'weapon') {
      r.dmg = Math.round(b.dmg * rar.mult * upMult * (1 + (mods.damage || 0)) * 10) / 10;
      r.spd = b.spd * (1 + (mods.atkSpeed || 0));
      r.reach = b.reach; r.arc = b.arc; r.stamCost = b.stam;
      r.magic = (b.magic || 0) + (mods.fireDamage || 0);
      r.fire = mods.fireDamage || 0;
    } else if (b.type === 'armor') {
      r.armor = Math.round((b.armor * rar.mult * upMult + (mods.armor || 0)) * 10) / 10;
      r.res = b.res + (mods.res || 0);
      r.magicBonus = b.magicBonus || 0;
    } else if (b.type === 'trinket') {
      r.bonus = Object.assign({}, b.bonus);
    }
    r.mods = mods;
    r.weight = Math.max(0, b.weight * (1 + (mods.weightMod || 0)));
    r.value = Math.round(b.value * rar.value * upMult * (1 + (mods.valueMod || 0)));
    return r;
  }

  /* Somma i modificatori portati dagli affissi. */
  function collectMods(it) {
    const out = {};
    for (const k of (it.aff || [])) {
      const a = D.prefixes.find(x => x.key === k) || D.suffixes.find(x => x.key === k);
      if (!a) continue;
      for (const m in a.mod) out[m] = (out[m] || 0) + a.mod[m];
    }
    return out;
  }

  /* ================= CREAZIONE PERSONAGGIO ================= */
  function create(name) {
    const p = {
      name: name || 'Viandante',
      level: 1, xp: 0, perkPoints: 1,
      hp: 100, mp: 60, sp: 90,
      gold: 45,
      skills: {}, perks: {},
      inv: [], equip: { weapon: null, armor: null, trinket: null },
      effects: [],
      known: {},             /* ingrediente -> indici effetto scoperti */
      quests: {}, flags: {},
      zone: D.startZone, x: 0, y: 0,
      stats: null,
      playtime: 0, kills: 0, deaths: 0,
      discovered: { ashford: true }
    };
    for (const k of SKILL_ORDER) p.skills[k] = { lvl: 5, xp: 0 };

    const sword = makeItem('rusty_sword');
    const rags = makeItem('rags');
    addItem(p, sword);
    addItem(p, rags);
    addItem(p, makeItem('ashbloom', { qty: 2 }));
    equip(p, sword.uid);
    equip(p, rags.uid);
    recalc(p);
    p.hp = p.stats.maxHp; p.mp = p.stats.maxMp; p.sp = p.stats.maxSp;
    return p;
  }

  /* ================= STATISTICHE DERIVATE ================= */
  function recalc(p) {
    const s = {
      maxHp: 100 + (p.level - 1) * 9,
      maxMp: 55 + p.skills.destruction.lvl * 0.7,
      maxSp: 85 + p.skills.athletics.lvl * 0.55,
      armor: 0, res: 0,
      damage: 1.0, magicPower: 1.0,
      moveSpeed: 1.0, atkSpeed: 1.0,
      hpRegen: 0.55, mpRegen: 1.6 + p.skills.destruction.lvl * 0.02, spRegen: 13,
      carry: 145 + (p.level - 1) * 4,
      fire: 0, weight: 0
    };

    /* Contributo delle abilità */
    s.damage += p.skills.blade.lvl * 0.008;            /* +0.8% per livello di Lama */
    s.magicPower += p.skills.destruction.lvl * 0.012;
    s.moveSpeed += p.skills.athletics.lvl * 0.0018;
    s.blockRatio = 0.55 + p.skills.block.lvl * 0.0018;

    /* Equipaggiamento */
    const w = equipped(p, 'weapon'), a = equipped(p, 'armor'), t = equipped(p, 'trinket');
    if (a) { s.armor += a.armor; s.res += a.res; if (a.magicBonus) s.magicPower += a.magicBonus / 100; }
    if (w) { s.fire += w.fire || 0; }
    if (t && t.bonus) {
      for (const k in t.bonus) {
        if (k === 'damage' || k === 'moveSpeed') s[k] += t.bonus[k];
        else s[k] = (s[k] || 0) + t.bonus[k];
      }
    }
    /* Modificatori d'affisso da tutto l'equipaggiamento */
    for (const slot of ['weapon', 'armor', 'trinket']) {
      const r = equipped(p, slot);
      if (!r || !r.mods) continue;
      const m = r.mods;
      if (m.maxHp) s.maxHp += m.maxHp;
      if (m.maxMp) s.maxMp += m.maxMp;
      if (m.maxSp) s.maxSp += m.maxSp;
      if (m.moveSpeed) s.moveSpeed += m.moveSpeed;
      if (m.spRegen) s.spRegen += m.spRegen;
      if (m.armor && r.type !== 'armor') s.armor += m.armor;
    }

    /* Talenti */
    if (p.perks.ironskin) s.armor += 8;
    if (p.perks.windstep) s.moveSpeed += 0.12;
    if (p.perks.secondwind) s.spRegen *= 2;
    if (p.perks.conflagration) s.magicPower += 0.35;
    if (p.perks.bulwark) s.blockRatio = Math.max(s.blockRatio, 0.80);

    /* Effetti attivi (pozioni) */
    for (const e of p.effects) {
      if (e.key === 'fury') s.damage += e.mag;
      else if (e.key === 'stone') s.res += e.mag;
      else if (e.key === 'swift') s.moveSpeed += e.mag;
    }

    /* Peso trasportato: oltre il limite si rallenta fino al 45% */
    s.weight = Math.round(totalWeight(p) * 10) / 10;
    if (s.weight > s.carry) {
      const over = (s.weight - s.carry) / Math.max(1, s.carry);
      s.encumbered = true;
      s.moveSpeed *= Math.max(0.45, 1 - over * 0.8);
    } else s.encumbered = false;

    s.maxHp = Math.round(s.maxHp);
    s.maxMp = Math.round(s.maxMp);
    s.maxSp = Math.round(s.maxSp);
    s.res = Math.min(0.75, s.res);

    p.stats = s;
    p.hp = Math.min(p.hp, s.maxHp);
    p.mp = Math.min(p.mp, s.maxMp);
    p.sp = Math.min(p.sp, s.maxSp);
    return s;
  }

  /* ================= INVENTARIO ================= */
  function addItem(p, it) {
    if (!it) return null;
    if (isStackable(it)) {
      const key = stackKey(it);
      const found = p.inv.find(x => stackKey(x) === key);
      if (found) { found.qty += it.qty; return found; }
    }
    p.inv.push(it);
    return it;
  }

  function addById(p, id, qty, opts) {
    const it = makeItem(id, Object.assign({ qty: qty || 1 }, opts || {}));
    return addItem(p, it);
  }

  function removeById(p, id, qty) {
    qty = qty || 1;
    let left = qty;
    for (let i = p.inv.length - 1; i >= 0 && left > 0; i--) {
      const it = p.inv[i];
      if (it.id !== id) continue;
      const take = Math.min(it.qty, left);
      it.qty -= take; left -= take;
      if (it.qty <= 0) { unequipUid(p, it.uid); p.inv.splice(i, 1); }
    }
    return left === 0;
  }

  function removeUid(p, uid, qty) {
    const i = p.inv.findIndex(x => x.uid === uid);
    if (i < 0) return false;
    const it = p.inv[i];
    qty = qty || it.qty;
    it.qty -= qty;
    if (it.qty <= 0) { unequipUid(p, uid); p.inv.splice(i, 1); }
    return true;
  }

  function count(p, id) {
    let n = 0;
    for (const it of p.inv) if (it.id === id) n += it.qty;
    return n;
  }

  function findUid(p, uid) { return p.inv.find(x => x.uid === uid) || null; }

  function totalWeight(p) {
    let w = 0;
    for (const it of p.inv) {
      const r = resolve(it);
      if (r) w += r.weight * it.qty;
    }
    return w;
  }

  /* ================= EQUIPAGGIAMENTO ================= */
  function equip(p, uid) {
    const it = findUid(p, uid);
    if (!it) return false;
    const r = resolve(it);
    if (!r || !r.slot) return false;
    p.equip[r.slot] = uid;
    recalc(p);
    return true;
  }

  function unequipSlot(p, slot) { p.equip[slot] = null; recalc(p); }

  function unequipUid(p, uid) {
    for (const s in p.equip) if (p.equip[s] === uid) p.equip[s] = null;
  }

  function isEquipped(p, uid) {
    for (const s in p.equip) if (p.equip[s] === uid) return true;
    return false;
  }

  /* Ritorna le proprietà risolte dell'oggetto in un dato slot. */
  function equipped(p, slot) {
    const uid = p.equip[slot];
    if (!uid) return null;
    const it = findUid(p, uid);
    return it ? resolve(it) : null;
  }

  /* ================= ESPERIENZA E LIVELLI ================= */
  function xpForLevel(lv) { return Math.round(120 * Math.pow(lv, 1.42)); }

  function gainXp(p, amount, out) {
    p.xp += amount;
    let need = xpForLevel(p.level);
    while (p.xp >= need) {
      p.xp -= need;
      p.level++;
      p.perkPoints++;
      recalc(p);
      p.hp = p.stats.maxHp; p.mp = p.stats.maxMp; p.sp = p.stats.maxSp;
      if (out) out.push({ type: 'level', level: p.level });
      need = xpForLevel(p.level);
    }
  }

  /* XP di abilità: costa sempre di più salire, come in Skyrim. */
  function skillXpNeeded(lvl) { return Math.round(24 + Math.pow(lvl, 1.55) * 1.6); }

  function trainSkill(p, key, amount, out) {
    const s = p.skills[key];
    if (!s || s.lvl >= SKILL_MAX) return;
    s.xp += amount;
    let need = skillXpNeeded(s.lvl);
    while (s.xp >= need && s.lvl < SKILL_MAX) {
      s.xp -= need;
      s.lvl++;
      if (out) out.push({ type: 'skill', skill: key, level: s.lvl });
      /* Ogni livello di abilità dà anche esperienza al personaggio */
      gainXp(p, 14 + s.lvl, out);
      need = skillXpNeeded(s.lvl);
    }
    recalc(p);
  }

  function canTakePerk(p, id) {
    const perk = PERKS[id];
    if (!perk || p.perks[id]) return false;
    if (p.perkPoints < 1) return false;
    return p.skills[perk.skill].lvl >= perk.req;
  }

  function takePerk(p, id) {
    if (!canTakePerk(p, id)) return false;
    p.perks[id] = true;
    p.perkPoints--;
    recalc(p);
    return true;
  }

  /* ================= EFFETTI A TEMPO ================= */
  function applyEffect(p, key, mag, dur) {
    const def = D.effects[key];
    if (!def) return;
    if (def.mode === 'instant') {
      if (key === 'heal') p.hp = Math.min(p.stats.maxHp, p.hp + mag);
      else if (key === 'stam') p.sp = Math.min(p.stats.maxSp, p.sp + mag);
      else if (key === 'mana') p.mp = Math.min(p.stats.maxMp, p.mp + mag);
      return;
    }
    const dur2 = p.perks.physician ? dur * 1.6 : dur;
    const ex = p.effects.find(e => e.key === key);
    if (ex) { ex.mag = Math.max(ex.mag, mag); ex.t = Math.max(ex.t, dur2); }
    else p.effects.push({ key: key, mag: mag, t: dur2 });
    recalc(p);
  }

  /* dt in secondi. Ritorna il danno da veleno accumulato nel frame. */
  function tickEffects(p, dt) {
    let poison = 0, changed = false;
    for (let i = p.effects.length - 1; i >= 0; i--) {
      const e = p.effects[i];
      e.t -= dt;
      if (e.key === 'regen') p.hp = Math.min(p.stats.maxHp, p.hp + e.mag * dt);
      if (e.key === 'venom') poison += e.mag * dt;
      if (e.t <= 0) { p.effects.splice(i, 1); changed = true; }
    }
    if (changed) recalc(p);
    return poison;
  }

  /* ================= CONOSCENZA ALCHEMICA ================= */
  /* Scopre l'effetto in posizione `idx` di un ingrediente. */
  function learnEffect(p, ingId, idx) {
    const arr = p.known[ingId] || (p.known[ingId] = []);
    if (arr.indexOf(idx) < 0) { arr.push(idx); return true; }
    return false;
  }
  function knowsEffect(p, ingId, idx) {
    /* Con Alchimia molto alta si riconoscono tutti gli effetti a vista */
    if (p.skills.alchemy.lvl >= 75) return true;
    const arr = p.known[ingId];
    return !!arr && arr.indexOf(idx) >= 0;
  }

  CV.Player = {
    SKILLS, SKILL_ORDER, SKILL_MAX, PERKS,
    create, recalc,
    makeItem, resolve, isStackable, stackKey, collectMods,
    addItem, addById, removeById, removeUid, count, findUid, totalWeight,
    equip, unequipSlot, isEquipped, equipped,
    xpForLevel, gainXp, skillXpNeeded, trainSkill,
    canTakePerk, takePerk,
    applyEffect, tickEffects,
    learnEffect, knowsEffect,
    setUidCounter: (n) => { uidCounter = Math.max(uidCounter, n); },
    getUidCounter: () => uidCounter
  };
})(typeof window !== 'undefined' ? window : globalThis);
