/* ============================================================
   MENU E SCHERMATE (DOM sopra il canvas).
   Il DOM è la scelta giusta per liste lunghe e testo scorrevole:
   su mobile eredita gratis lo scroll fluido e i tocchi precisi.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const P = CV.Player;
  const M = CV.M;

  let G = null;
  let el = null, toastsEl = null;
  let current = null;         /* pannello aperto */
  let ctxData = {};           /* dati del pannello corrente */
  let invTab = 'all', invSel = null;
  let smithTab = 'forge';
  let alchPick = [];
  let shopTab = 'buy';
  let dlgNpc = null, dlgNode = null;
  let debugTab = 'respawn';

  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- Icone come immagini ---------------- */
  const iconCache = new Map();
  function iconUrl(res) {
    const key = res ? (res.icon || res.id) + '|' + (res.potion ? res.potion.color : '') : 'none';
    if (iconCache.has(key)) return iconCache.get(key);
    const src = CV.Art.iconFor(res);
    let url = '';
    if (src) {
      const c = CV.Art.makeCanvas(16, 16);
      c.getContext('2d').drawImage(src, 0, 0);
      url = c.toDataURL();
    }
    iconCache.set(key, url);
    return url;
  }

  function init(game) {
    G = game;
    el = document.getElementById('overlay');
    toastsEl = document.getElementById('toasts');
    el.addEventListener('click', onClick);
  }

  function isOpen() { return !!current; }
  function currentPanel() { return current; }

  function open(panel, data) {
    current = panel;
    ctxData = data || {};
    el.className = 'open' + (panel === 'dialogue' ? ' dialogue-mode' : '') + (panel === 'title' ? ' title-mode' : '');
    CV.Input.setEnabled(false);
    render();
  }

  function close() {
    current = null;
    ctxData = {};
    el.className = '';
    el.innerHTML = '';
    CV.Input.setEnabled(true);
    CV.Input.clearAll();
  }

  function toast(msg, cls) {
    const d = document.createElement('div');
    d.className = 'toast' + (cls ? ' ' + cls : '');
    d.textContent = msg;
    toastsEl.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  /* ================================================================
     ROUTER DI RENDER
     ================================================================ */
  function render() {
    if (!current) return;
    switch (current) {
      case 'title': el.innerHTML = viewTitle(); break;
      case 'menu': el.innerHTML = viewMenu(); break;
      case 'dialogue': el.innerHTML = viewDialogue(); break;
      case 'shop': el.innerHTML = viewShop(); break;
      case 'contracts': el.innerHTML = viewContracts(); break;
      case 'smith': el.innerHTML = viewSmith(); break;
      case 'alchemy': el.innerHTML = viewAlchemy(); break;
      case 'death': el.innerHTML = viewDeath(); break;
      case 'victory': el.innerHTML = viewVictory(); break;
    }
  }

  /* ================================================================
     SCHERMATA DEL TITOLO
     ================================================================ */
  function viewTitle() {
    const has = ctxData.hasSave;
    return `<div class="title-screen">
      <h1>CINDER VALE</h1>
      <div class="tagline">Sette anni di cenere</div>
      <div class="menu">
        ${has ? '<button class="primary" data-act="continue">Continua</button>' : ''}
        <button class="${has ? '' : 'primary'}" data-act="newgame">${has ? 'Nuova partita' : 'Inizia'}</button>
        <button data-act="settings">Impostazioni</button>
      </div>
      <div class="ver">v1.0 — tocca lo schermo o usa WASD</div>
    </div>`;
  }

  /* ================================================================
     MENU PRINCIPALE (a schede)
     ================================================================ */
  function viewMenu() {
    const tab = ctxData.tab || 'inv';
    const tabs = [
      ['inv', 'Zaino'], ['skills', 'Abilità'], ['quests', 'Diario'],
      ['map', 'Mappa'], ['settings', 'Opzioni']
    ];
    let body = '';
    if (tab === 'inv') body = viewInventory();
    else if (tab === 'skills') body = viewSkills();
    else if (tab === 'quests') body = viewQuests();
    else if (tab === 'map') body = viewMap();
    else body = viewSettings();

    return `<div class="panel">
      <div class="panel-head">
        <h2>${esc(G.p.name)} — Liv ${G.p.level}</h2>
        <span style="font-size:12px;color:var(--gold);font-family:var(--mono)">${G.p.gold} ⬤</span>
        <button class="close-x" data-act="close">✕</button>
      </div>
      <div class="tabs">
        ${tabs.map(t => `<div class="tab${t[0] === tab ? ' active' : ''}" data-act="tab" data-tab="${t[0]}">${t[1]}</div>`).join('')}
      </div>
      <div class="panel-body">${body}</div>
    </div>`;
  }

  /* ---------------- Zaino ---------------- */
  function viewInventory() {
    const p = G.p;
    const filters = [['all', 'Tutto'], ['weapon', 'Armi'], ['armor', 'Difesa'], ['potion', 'Consumo'], ['material', 'Materiali']];
    const rows = [];

    const entries = p.inv.map(it => ({ it: it, res: P.resolve(it) })).filter(x => x.res);
    entries.sort((a, b) => {
      const ea = P.isEquipped(p, a.it.uid) ? 0 : 1, eb = P.isEquipped(p, b.it.uid) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return a.res.name.localeCompare(b.res.name);
    });

    for (const { it, res } of entries) {
      if (!matchFilter(res, invTab)) continue;
      const eq = P.isEquipped(p, it.uid);
      rows.push(`<div class="row rar-${res.rar}${invSel === it.uid ? ' sel' : ''}${eq ? ' equipped' : ''}" data-act="pick" data-uid="${it.uid}">
        <img class="ic" src="${iconUrl(res)}" alt="">
        <div class="txt">
          <div class="nm rar-${res.rar}">${esc(res.name)}</div>
          <div class="sub">${esc(subLine(res))}</div>
        </div>
        <div class="qty">${it.qty > 1 ? '×' + it.qty : ''}</div>
      </div>`);
    }

    const sel = invSel ? P.findUid(p, invSel) : null;
    const detail = sel ? viewItemDetail(sel) : '';
    const st = p.stats;

    return `
      <div class="tabs inv-filter-bar">
        ${filters.map(f => `<div class="tab${invTab === f[0] ? ' active' : ''}" data-act="filter" data-f="${f[0]}">${f[1]}</div>`).join('')}
      </div>
      <div class="stat-line"><span>Carico</span><span class="v ${st.encumbered ? 'neg' : ''}">${st.weight} / ${st.carry}</span></div>
      <div class="stat-line"><span>Danno · Armatura</span><span class="v">${dmgLabel()} · ${st.armor.toFixed(1)}</span></div>
      ${detail}
      <div class="sect">Oggetti</div>
      <div class="list">${rows.join('') || '<div class="empty">Niente qui dentro.</div>'}</div>`;
  }

  function dmgLabel() {
    const w = P.equipped(G.p, 'weapon');
    if (!w) return (4 * G.p.stats.damage).toFixed(1);
    return (w.dmg * G.p.stats.damage).toFixed(1);
  }

  function matchFilter(res, f) {
    if (f === 'all') return true;
    if (f === 'weapon') return res.type === 'weapon';
    if (f === 'armor') return res.type === 'armor' || res.type === 'trinket';
    if (f === 'potion') return res.type === 'potion' || res.type === 'ingredient';
    if (f === 'material') return res.type === 'material' || res.type === 'misc';
    return true;
  }

  function subLine(res) {
    if (res.type === 'weapon') return 'Danno ' + res.dmg + ' · Vel ' + res.spd.toFixed(2) + ' · ' + res.weight.toFixed(1) + 'kg';
    if (res.type === 'armor') return 'Armatura ' + res.armor + ' · Res ' + Math.round(res.res * 100) + '% · ' + res.weight.toFixed(1) + 'kg';
    if (res.type === 'trinket') return Object.keys(res.bonus || {}).map(k => bonusLabel(k, res.bonus[k])).join(' · ');
    if (res.type === 'potion') return res.potion.desc;
    if (res.type === 'ingredient') return knownEffects(res.id);
    return (D.rarity[res.rar] ? '' : '') + res.value + ' ⬤ · ' + res.weight.toFixed(1) + 'kg';
  }

  function knownEffects(id) {
    const ing = D.ingredients[id];
    if (!ing) return '';
    return ing.fx.map((k, i) => P.knowsEffect(G.p, id, i) ? D.effects[k].name : '???').join(', ');
  }

  const BONUS_NAMES = { maxHp: 'Vita', maxMp: 'Etere', maxSp: 'Vigore', armor: 'Armatura', damage: 'Danno', moveSpeed: 'Velocità', mpRegen: 'Rig. etere', spRegen: 'Rig. vigore', res: 'Resistenza' };
  function bonusFmt(k, v) {
    const pct = (k === 'damage' || k === 'moveSpeed' || k === 'res');
    return pct ? Math.round(v * 100) + '%' : v;
  }
  function bonusLabel(k, v) {
    return (BONUS_NAMES[k] || k) + ' +' + bonusFmt(k, v);
  }

  function viewItemDetail(it) {
    const res = P.resolve(it);
    if (!res) return '';
    const p = G.p;
    const eq = P.isEquipped(p, it.uid);
    const cur = (res.slot && !eq) ? P.equipped(p, res.slot) : null;
    const acts = [];
    if (res.slot) acts.push(eq ? `<button data-act="unequip" data-slot="${res.slot}">Togli</button>` : `<button class="primary" data-act="equip" data-uid="${it.uid}">Equipaggia</button>`);
    if (res.type === 'potion') acts.push(`<button class="primary" data-act="drink" data-uid="${it.uid}">Bevi</button>`);
    if (res.type === 'ingredient') acts.push(`<button data-act="eat" data-uid="${it.uid}">Assaggia</button>`);
    if (!res.quest) acts.push(`<button data-act="drop" data-uid="${it.uid}">Getta</button>`);

    let stats = '';
    if (res.type === 'weapon') {
      stats += lineCmp('Danno', res.dmg, cur ? cur.dmg : null);
      if (res.fire || (cur && cur.fire)) stats += lineCmp('Danno da fuoco', res.fire || 0, cur ? (cur.fire || 0) : null);
      stats += lineCmp('Velocità', res.spd, cur ? cur.spd : null, v => v.toFixed(2) + '×');
      stats += lineCmp('Portata', res.reach, cur ? cur.reach : null);
      stats += lineCmp('Vigore per colpo', res.stamCost, cur ? cur.stamCost : null, null, true);
    } else if (res.type === 'armor') {
      stats += lineCmp('Armatura', res.armor, cur ? cur.armor : null);
      stats += lineCmp('Resistenza', res.res, cur ? cur.res : null, v => Math.round(v * 100) + '%');
    } else if (res.type === 'trinket') {
      const curBonus = (cur && cur.bonus) || {};
      const keys = new Set([...Object.keys(res.bonus || {}), ...Object.keys(curBonus)]);
      for (const k of keys) {
        stats += lineCmp(BONUS_NAMES[k] || k, (res.bonus && res.bonus[k]) || 0, cur ? (curBonus[k] || 0) : null, v => bonusFmt(k, v));
      }
    } else if (res.type === 'potion') {
      for (const f of res.potion.fx) {
        const d = D.effects[f.key];
        stats += line(d.name, D.fmtMag(f.key, f.mag) + (f.dur ? ' / ' + f.dur + 's' : ''));
      }
    } else if (res.type === 'ingredient') {
      const ing = D.ingredients[res.id];
      ing.fx.forEach((k, i) => {
        stats += line(P.knowsEffect(p, res.id, i) ? D.effects[k].name : '??? sconosciuto', '');
      });
    }
    if (res.up > 0) stats += line('Tempra', '+' + res.up);
    stats += lineCmp('Peso', res.weight, cur ? cur.weight : null, v => v.toFixed(1) + ' kg', true);
    stats += line('Valore', res.value + ' ⬤');

    return `<div class="detail">
      <h3 class="nm rar-${res.rar}">${esc(res.name)}</h3>
      ${res.flavor ? `<div class="flavor">« ${esc(res.flavor)} »</div>` : ''}
      ${cur ? `<div class="hint">Confronto con l'equipaggiato: <b>${esc(cur.name)}</b></div>` : ''}
      ${stats}
      <div class="btn-row" style="margin-top:10px">${acts.join('')}</div>
    </div>`;
  }

  function line(k, v) {
    return `<div class="stat-line"><span>${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
  }

  /* Confronta un valore con quello dell'oggetto equipaggiato, se c'è.
     lowerBetter: true per statistiche dove un numero più basso è un vantaggio (peso, costo). */
  function lineCmp(label, val, curVal, fmt, lowerBetter) {
    fmt = fmt || (v => v);
    const valTxt = fmt(val);
    if (curVal == null || curVal === val) return line(label, valTxt);
    const diff = val - curVal;
    const better = lowerBetter ? diff < 0 : diff > 0;
    const sign = diff > 0 ? '+' : '';
    const deltaTxt = sign + fmt(diff);
    return `<div class="stat-line"><span>${esc(label)}</span><span class="v">${esc(valTxt)} <span class="delta ${better ? 'pos' : 'neg'}">(${esc(deltaTxt)})</span></span></div>`;
  }

  /* ---------------- Abilità e talenti ---------------- */
  function viewSkills() {
    const p = G.p;
    let out = `<div class="hint">Le abilità salgono <b>usandole</b>: colpisci di lama per far salire Lama, para per far salire Blocco. Ogni livello del personaggio dà un punto talento.</div>`;
    out += `<div class="sect">Punti talento disponibili: <span style="color:var(--gold)">${p.perkPoints}</span></div>`;

    for (const key of P.SKILL_ORDER) {
      const def = P.SKILLS[key], s = p.skills[key];
      const need = P.skillXpNeeded(s.lvl);
      out += `<div class="detail" style="border-left:3px solid ${def.color}">
        <div style="display:flex;align-items:baseline;gap:8px">
          <h3 style="color:${def.color}">${def.name}</h3>
          <span style="font-family:var(--mono);color:var(--gold)">${s.lvl}</span>
          <span style="flex:1"></span>
        </div>
        <div class="flavor" style="margin-bottom:4px">${def.desc}</div>
        <div class="bar xp"><i style="width:${Math.min(100, s.xp / need * 100)}%"></i></div>
        <div style="margin-top:8px">${perkRows(key)}</div>
      </div>`;
    }
    return out;
  }

  function perkRows(skillKey) {
    const p = G.p;
    const list = Object.values(P.PERKS).filter(k => k.skill === skillKey).sort((a, b) => a.req - b.req);
    return list.map(perk => {
      const owned = !!p.perks[perk.id];
      const can = P.canTakePerk(p, perk.id);
      const locked = p.skills[skillKey].lvl < perk.req;
      const color = owned ? 'var(--gold)' : (locked ? 'var(--text-dim)' : 'var(--text)');
      return `<div class="row" style="opacity:${locked ? .55 : 1}" ${can ? `data-act="perk" data-perk="${perk.id}"` : ''}>
        <div class="txt">
          <div class="nm" style="color:${color}">${owned ? '◈ ' : ''}${esc(perk.name)} <small style="color:var(--text-dim);font-weight:400">— richiede ${perk.req}</small></div>
          <div class="sub" style="white-space:normal">${esc(perk.desc)}</div>
        </div>
        ${can ? '<div class="qty" style="color:var(--gold)">Sblocca</div>' : ''}
      </div>`;
    }).join('');
  }

  /* ---------------- Diario ---------------- */
  function viewQuests() {
    const p = G.p;
    const active = [], done = [];
    for (const id in p.quests) {
      const q = p.quests[id], def = D.quests[id];
      if (!def) continue;
      (q.done ? done : active).push({ q, def });
    }
    if (!active.length && !done.length) return '<div class="empty">Il diario è vuoto. Parla con qualcuno ad Ashford.</div>';

    const card = ({ q, def }) => {
      const stages = def.stages.map((s, i) => {
        const state = q.done || i < q.stage ? '✔' : (i === q.stage ? '▸' : '·');
        const cur = i === q.stage && !q.done;
        const prog = cur ? CV.Quests.progressText(p, def.id) : '';
        return `<div class="stat-line" style="opacity:${i > q.stage && !q.done ? .4 : 1}">
          <span>${state} ${esc(s.text)}</span><span class="v">${prog}</span></div>`;
      }).join('');
      return `<div class="detail" style="border-left:3px solid ${def.main ? 'var(--gold)' : 'var(--ash-4)'}">
        <h3 style="color:${def.main ? 'var(--gold)' : 'var(--text)'}">${def.main ? '❖ ' : ''}${esc(def.name)}</h3>
        <div class="flavor">${esc(def.summary)}</div>
        ${stages}
      </div>`;
    };

    let out = '';
    if (active.length) out += '<div class="sect">In corso</div>' + active.map(card).join('');
    if (done.length) out += '<div class="sect">Concluse</div>' + done.map(card).join('');
    return out;
  }

  /* ---------------- Mappa ---------------- */
  function viewMap() {
    const p = G.p;
    const z = G.zone;
    const url = miniMapUrl(z);
    const zones = D.zoneOrder.map(id => {
      const zd = D.zones[id];
      const seen = p.discovered[id];
      return `<div class="row" style="opacity:${seen ? 1 : .35}">
        <div class="txt">
          <div class="nm" style="color:${id === z.id ? 'var(--gold)' : 'var(--text)'}">${seen ? esc(zd.name) : '???'}</div>
          <div class="sub">${seen ? esc(zd.subtitle) : 'Non ancora esplorata'}</div>
        </div>
        ${id === z.id ? '<div class="qty" style="color:var(--gold)">qui</div>' : ''}
      </div>`;
    }).join('');

    return `<div class="sect">${esc(z.def.name)}</div>
      <img src="${url}" style="width:100%;image-rendering:pixelated;border:1px solid var(--ash-3);border-radius:6px;background:#0d0b10">
      <div class="hint">Il punto dorato sei tu. I rombi rossi sono i nemici che hai già visto.</div>
      <div class="sect">Valle di Cinder</div>
      <div class="list">${zones}</div>`;
  }

  function miniMapUrl(z) {
    const c = CV.Art.makeCanvas(z.w, z.h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(z.w, z.h);
    for (let i = 0; i < z.w * z.h; i++) {
      const key = CV.Art.TILE_KEYS[z.tiles[i]];
      const def = CV.Art.TILE_DEFS[key];
      const col = def ? def.base : '#000';
      const o = i * 4;
      img.data[o] = parseInt(col.slice(1, 3), 16);
      img.data[o + 1] = parseInt(col.slice(3, 5), 16);
      img.data[o + 2] = parseInt(col.slice(5, 7), 16);
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const T = CV.World.T;
    /* Punti d'interesse */
    ctx.fillStyle = '#ffd166';
    for (const e of z.exits) ctx.fillRect(Math.floor(e.x / T) - 1, Math.floor(e.y / T) - 1, 3, 3);
    ctx.fillStyle = '#c9a6ff';
    for (const n of z.npcs) ctx.fillRect(Math.floor(n.x / T), Math.floor(n.y / T), 2, 2);
    ctx.fillStyle = '#c33636';
    for (const e of G.enemies) if (!e.dead && e.aggro) ctx.fillRect(Math.floor(e.x / T), Math.floor(e.y / T), 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.floor(G.pe.x / T) - 1, Math.floor(G.pe.y / T) - 1, 3, 3);
    return c.toDataURL();
  }

  /* ---------------- Impostazioni ---------------- */
  function viewSettings() {
    const s = G.settings;
    const schemes = [
      ['auto', 'Auto'],
      ['touch_stick', 'Touch · joystick'],
      ['touch_tap', 'Touch · tocca per muovere'],
      ['kbm', 'Tastiera + mouse']
    ];
    const detected = CV.Input.effectiveScheme();
    const names = { touch_stick: 'joystick virtuale', touch_tap: 'tocca per muovere', kbm: 'tastiera e mouse' };

    return `
      <div class="sect">Comandi</div>
      <div class="opt-row">
        <div class="lbl">Schema di controllo
          <small>In automatico il gioco sceglie da solo. Ora è attivo: <b>${names[detected]}</b>.</small>
        </div>
      </div>
      <div class="seg" style="margin-bottom:10px">
        ${schemes.map(x => `<button class="${s.scheme === x[0] ? 'on' : ''}" data-act="scheme" data-v="${x[0]}">${x[1]}</button>`).join('')}
      </div>
      <div class="hint">
        <b>Joystick</b>: il pollice sinistro muove, i tasti a destra combattono.<br>
        <b>Tocca per muovere</b>: tocchi (o trascini) dove vuoi andare, niente joystick.<br>
        <b>Tastiera</b>: WASD muove, il mouse mira, click sinistro attacca, destro para, Spazio schiva, Q incantesimo, E interagisce.
      </div>

      <div class="opt-row">
        <div class="lbl">Come si tiene la guardia
          <small>In automatico: interruttore col tocco, tenuta premuta con la tastiera.</small>
        </div>
      </div>
      <div class="seg" style="margin-bottom:6px">
        ${[['auto', 'Auto'], ['toggle', 'Interruttore'], ['hold', 'Tenere premuto']]
          .map(x => `<button class="${(s.blockMode || 'auto') === x[0] ? 'on' : ''}" data-act="blockmode" data-v="${x[0]}">${x[1]}</button>`).join('')}
      </div>
      <div class="hint">
        Con l'<b>interruttore</b> un tocco alza la guardia e ci resta: si abbassa se attacchi,
        schivi o ritocchi il pulsante. La <b>parata perfetta</b> premia comunque il tempismo,
        perché conta il momento in cui <i>alzi</i> la guardia: alzarla appena senti il colpo
        in arrivo vale più che tenerla su sempre.
      </div>

      <div class="sect">Grafica</div>
      <div class="opt-row">
        <div class="lbl">Qualità
          <small>In automatico il gioco parte alto e scende da solo se non regge i 60 fotogrammi.
          Ora attiva: <b>${{ low: 'bassa', medium: 'media', high: 'alta' }[CV.Render.getQuality()]}</b> · ${Math.round(G.lastFps)} fps</small>
        </div>
      </div>
      <div class="seg" style="margin-bottom:6px">
        ${[['auto', 'Auto'], ['high', 'Alta'], ['medium', 'Media'], ['low', 'Bassa']]
          .map(x => `<button class="${(s.quality || 'auto') === x[0] ? 'on' : ''}" data-act="quality" data-v="${x[0]}">${x[1]}</button>`).join('')}
      </div>
      <div class="hint">
        <b>Alta</b>: bagliori sfocati sulle fonti di luce. <b>Media</b>: bagliori più semplici.
        <b>Bassa</b>: nessun bagliore. Le transizioni fra terreni e i colori d'ambiente
        ci sono sempre, perché si calcolano una volta sola all'ingresso nella zona.
      </div>

      <div class="sect">Audio</div>
      <div class="opt-row">
        <div class="lbl">Volume</div>
        <input class="slider" type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-act="volume">
      </div>
      <div class="opt-row">
        <div class="lbl">Musica di sottofondo</div>
        <div class="seg">
          <button class="${s.music ? 'on' : ''}" data-act="music" data-v="1">Sì</button>
          <button class="${!s.music ? 'on' : ''}" data-act="music" data-v="0">No</button>
        </div>
      </div>

      <div class="sect">Partita</div>
      <div class="opt-row">
        <div class="lbl">Salvataggio automatico
          <small>Il gioco salva a ogni cambio di zona e ogni due minuti.</small>
        </div>
      </div>
      <div class="btn-row" style="margin-top:10px">
        <button data-act="save">Salva ora</button>
        <button data-act="title">Torna al titolo</button>
      </div>
      <div class="btn-row" style="margin-top:8px">
        <button data-act="wipe" style="border-color:var(--blood);color:var(--blood)">Cancella salvataggio</button>
      </div>
      <div class="hint">Uccisioni: ${G.p.kills} · Morti: ${G.p.deaths} · Tempo: ${Math.floor(G.p.playtime / 60)} min</div>

      <div class="sect">Debug</div>
      <div class="seg" style="margin-bottom:10px">
        ${debugSections.map(x => `<button class="${debugTab === x[0] ? 'on' : ''}" data-act="debugtab" data-t="${x[0]}">${x[1]}</button>`).join('')}
      </div>
      ${viewDebugPanel()}`;
  }

  /* ---------------- Debug ---------------- */
  const debugSections = [['respawn', 'Respawn']];

  function viewDebugPanel() {
    if (debugTab === 'respawn') return viewDebugRespawn();
    return '';
  }

  const DEBUG_TIMERS = [
    ['enemyRespawnSeconds', 'Nemici comuni', 300],
    ['chestRespawnSeconds', 'Forzieri', 600],
    ['shrineRespawnSeconds', 'Santuari', 600]
  ];

  function viewDebugRespawn() {
    const dbg = G.settings.debug || (G.settings.debug = {});
    const inZone = !!G.zone && !G.zone.def.safe;

    const rows = DEBUG_TIMERS.map(([key, label, def]) => {
      const v = dbg[key] != null ? dbg[key] : def;
      return `<div class="opt-row">
        <div class="lbl">${label}</div>
        <input class="slider" type="number" min="0" step="5" value="${v}" data-act="dbgsecs" data-key="${key}" style="width:80px">
        <span style="margin-left:8px;color:var(--muted)">sec · ${(v / 60).toFixed(1)} min</span>
      </div>`;
    }).join('');

    return `
      <div class="opt-row">
        <div class="lbl">Tempo di respawn
          <small>Secondi reali da quando lo usi/uccidi/svuoti. I nemici unici e i boss restano
          permanenti per ora: li tratteremo a parte più avanti.</small>
        </div>
      </div>
      ${rows}

      <div class="opt-row" style="margin-top:10px">
        <div class="lbl">Respawn forzato — zona corrente
          <small>Ricostruisce subito i contenuti scelti, senza aspettare il timer.</small>
        </div>
      </div>
      <div class="btn-row">
        <button data-act="dbgforcerespawn" data-scope="all" ${inZone ? '' : 'disabled'}>Tutto (esclusi boss)</button>
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button data-act="dbgforcerespawn" data-scope="common" ${inZone ? '' : 'disabled'}>Nemici comuni</button>
        <button data-act="dbgforcerespawn" data-scope="chests" ${inZone ? '' : 'disabled'}>Forzieri</button>
        <button data-act="dbgforcerespawn" data-scope="shrines" ${inZone ? '' : 'disabled'}>Santuari</button>
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button data-act="dbgforcerespawn" data-scope="epic" ${inZone ? '' : 'disabled'}>Epici/Boss</button>
      </div>
      ${inZone ? '<div class="hint">Attenzione: i nemici unici rigenerati possono far riottenere il loro drop di missione.</div>'
                : '<div class="hint">Non disponibile: sei fuori partita o in una zona sicura (senza nemici).</div>'}`;
  }

  /* ================================================================
     DIALOGO
     ================================================================ */
  function viewDialogue() {
    const node = ctxData.node;
    const npc = ctxData.npc;
    if (!node) return '';
    const opts = CV.Dialogue.options(G.p, node);
    return `<div class="dlg">
      <div class="who">${esc(npc.def.name)} — ${esc(npc.def.title)}</div>
      <div class="say">${esc(node.say)}</div>
      <div class="opts">
        ${opts.map((o, i) => `<div class="opt ${o.cls || ''}" data-act="dlgopt" data-i="${i}">${esc(o.text)}</div>`).join('')}
        ${opts.length ? '' : '<div class="opt" data-act="close">Congedarsi</div>'}
      </div>
    </div>`;
  }

  /* ================================================================
     MERCANTE
     ================================================================ */
  function viewShop() {
    const shop = D.shops[ctxData.shop];
    const p = G.p;
    let rows = '';

    if (shopTab === 'buy') {
      rows = shop.stock.map(id => {
        const res = P.resolve({ id: id, qty: 1, rar: 'common', aff: [], up: 0 });
        if (!res) return '';
        const price = Math.max(1, Math.round(res.value * shop.buyMult));
        const afford = p.gold >= price;
        return `<div class="row rar-${res.rar}" style="opacity:${afford ? 1 : .5}" data-act="buy" data-id="${id}" data-price="${price}">
          <img class="ic" src="${iconUrl(res)}" alt="">
          <div class="txt"><div class="nm">${esc(res.name)}</div><div class="sub">${esc(subLine(res))}</div></div>
          <div class="qty" style="color:${afford ? 'var(--gold)' : 'var(--blood)'}">${price} ⬤</div>
        </div>`;
      }).join('');
    } else {
      const entries = p.inv.map(it => ({ it, res: P.resolve(it) })).filter(x => x.res && !x.res.quest && !P.isEquipped(p, x.it.uid));
      rows = entries.map(({ it, res }) => {
        const price = Math.max(1, Math.round(res.value * shop.sellMult));
        return `<div class="row rar-${res.rar}" data-act="sell" data-uid="${it.uid}" data-price="${price}">
          <img class="ic" src="${iconUrl(res)}" alt="">
          <div class="txt"><div class="nm">${esc(res.name)}</div><div class="sub">${esc(subLine(res))}</div></div>
          <div class="qty" style="color:var(--gold)">${price} ⬤${it.qty > 1 ? ' ×1' : ''}</div>
        </div>`;
      }).join('') || '<div class="empty">Non hai nulla da vendere.</div>';
    }

    return `<div class="panel">
      <div class="panel-head">
        <h2>${esc(shop.name)}</h2>
        <span style="font-size:12px;color:var(--gold);font-family:var(--mono)">${p.gold} ⬤</span>
        <button class="close-x" data-act="close">✕</button>
      </div>
      <div class="tabs">
        <div class="tab${shopTab === 'buy' ? ' active' : ''}" data-act="shoptab" data-t="buy">Compra</div>
        <div class="tab${shopTab === 'sell' ? ' active' : ''}" data-act="shoptab" data-t="sell">Vendi</div>
      </div>
      <div class="panel-body"><div class="list">${rows}</div></div>
    </div>`;
  }

  /* ================================================================
     BACHECA DEI CONTRATTI
     ================================================================ */
  function viewContracts() {
    const p = G.p;
    const rows = (p.contracts || []).map(c => {
      const st = CV.Contracts.state(p, c);
      const ready = st === 'ready';
      const prog = CV.Contracts.progressText(p, c);
      const rw = c.reward || {};
      const rewardTxt = [
        rw.gold ? rw.gold[0] + '-' + rw.gold[1] + ' ⬤' : '',
        rw.xp ? rw.xp + ' PE' : '',
        rw.tier ? 'equipaggiamento' : ''
      ].filter(Boolean).join(' · ');
      return `<div class="detail" style="border-left:3px solid ${ready ? 'var(--gold)' : 'var(--ash-4)'}">
        <h3 style="color:${ready ? 'var(--gold)' : 'var(--text)'}">${esc(c.title)}</h3>
        <div class="flavor">${esc(c.desc)}</div>
        <div class="stat-line"><span>Avanzamento</span><span class="v">${esc(prog)}</span></div>
        <div class="stat-line"><span>Ricompensa</span><span class="v">${esc(rewardTxt)}</span></div>
        <div class="btn-row" style="margin-top:8px">
          <button class="${ready ? 'primary' : ''}" ${ready ? '' : 'disabled'} data-act="contractclaim" data-cid="${c.cid}">Riscuoti</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="panel">
      <div class="panel-head">
        <h2>Bacheca dei Contratti</h2>
        <span style="font-size:12px;color:var(--gold);font-family:var(--mono)">${p.gold} ⬤</span>
        <button class="close-x" data-act="close">✕</button>
      </div>
      <div class="panel-body">
        <div class="hint">Tre contratti alla volta. Riscuoterne uno ne genera subito un altro: è pensata per essere ripetuta.</div>
        <div class="list">${rows || '<div class="empty">Nessun contratto disponibile.</div>'}</div>
      </div>
    </div>`;
  }

  /* ================================================================
     FUCINA
     ================================================================ */
  function viewSmith() {
    const p = G.p;
    let body = '';

    if (smithTab === 'forge') {
      body = D.smithRecipes.map((r, i) => {
        const chk = CV.Smith.canCraft(p, r);
        const costs = Object.keys(r.cost).map(id => {
          const have = P.count(p, id);
          const need = r.cost[id];
          const nm = D.base(id).name;
          return `<span style="color:${have >= need ? 'var(--stam)' : 'var(--blood)'}">${esc(nm)} ${have}/${need}</span>`;
        }).join(' · ');
        return `<div class="row" style="opacity:${chk.ok ? 1 : .55}" data-act="forge" data-i="${i}">
          <img class="ic" src="${iconUrl(P.resolve({ id: r.out, qty: 1, rar: 'common', aff: [], up: 0 }))}" alt="">
          <div class="txt">
            <div class="nm">${esc(r.name)}${r.qty > 1 ? ' ×' + r.qty : ''}</div>
            <div class="sub" style="white-space:normal">${costs}</div>
          </div>
          <div class="qty" style="color:${p.skills.smithing.lvl >= r.skill ? 'var(--text-dim)' : 'var(--blood)'}">Fab ${r.skill}</div>
        </div>`;
      }).join('');
    } else {
      const gear = p.inv.map(it => ({ it, res: P.resolve(it) }))
        .filter(x => x.res && (x.res.type === 'weapon' || x.res.type === 'armor'));
      body = gear.map(({ it, res }) => {
        const chk = CV.Smith.canUpgrade(p, it);
        const costTxt = chk.cost ? Object.keys(chk.cost).map(id => `${esc(D.base(id).name)} ${P.count(p, id)}/${chk.cost[id]}`).join(' · ') : (chk.why || '');
        return `<div class="row rar-${res.rar}" style="opacity:${chk.ok ? 1 : .55}" data-act="temper" data-uid="${it.uid}">
          <img class="ic" src="${iconUrl(res)}" alt="">
          <div class="txt">
            <div class="nm rar-${res.rar}">${esc(res.name)}</div>
            <div class="sub" style="white-space:normal">${esc(costTxt)}</div>
          </div>
          <div class="qty" style="color:var(--gold)">+${it.up}</div>
        </div>`;
      }).join('') || '<div class="empty">Non hai equipaggiamento da temprare.</div>';
    }

    return `<div class="panel">
      <div class="panel-head">
        <h2>Fucina</h2>
        <span style="font-size:12px;color:var(--ember)">Fabbrilità ${p.skills.smithing.lvl}</span>
        <button class="close-x" data-act="close">✕</button>
      </div>
      <div class="tabs">
        <div class="tab${smithTab === 'forge' ? ' active' : ''}" data-act="smithtab" data-t="forge">Forgia</div>
        <div class="tab${smithTab === 'temper' ? ' active' : ''}" data-act="smithtab" data-t="temper">Tempra</div>
      </div>
      <div class="panel-body"><div class="list">${body}</div></div>
    </div>`;
  }

  /* ================================================================
     ALCHIMIA
     ================================================================ */
  function viewAlchemy() {
    const p = G.p;
    const owned = [];
    for (const id in D.ingredients) {
      const n = P.count(p, id);
      if (n > 0) owned.push({ id, n });
    }

    const rows = owned.map(({ id, n }) => {
      const ing = D.ingredients[id];
      const res = P.resolve({ id: id, qty: n, rar: 'common', aff: [], up: 0 });
      const picked = alchPick.indexOf(id) >= 0;
      return `<div class="row${picked ? ' sel' : ''}" data-act="alchpick" data-id="${id}">
        <img class="ic" src="${iconUrl(res)}" alt="">
        <div class="txt">
          <div class="nm">${esc(ing.name)}</div>
          <div class="sub">${esc(knownEffects(id))}</div>
        </div>
        <div class="qty">×${n}</div>
      </div>`;
    }).join('') || '<div class="empty">Non hai ingredienti. Cerca i cespugli nel mondo.</div>';

    /* Anteprima della miscela */
    let preview = '<div class="hint">Scegli <b>due</b> ingredienti. Si attivano solo le virtù che hanno <b>in comune</b>: è l\'unica regola dell\'alchimia.</div>';
    if (alchPick.length === 2) {
      const shared = CV.Alch.preview(p, alchPick[0], alchPick[1]);
      const mult = CV.Alch.power(p);
      if (!shared.length) {
        preview = `<div class="detail"><h3 style="color:var(--blood)">Nessuna virtù in comune</h3>
          <div class="flavor">Il miscuglio si annerirebbe. Prova un'altra combinazione — imparerai comunque qualcosa.</div></div>`;
      } else {
        preview = `<div class="detail"><h3 style="color:var(--gold)">Risultato previsto</h3>
          ${shared.map(s => {
            const d = D.effects[s.key];
            const mag = d.mode === 'instant' ? Math.round(d.base * mult) : (Math.round(d.base * mult * 100) / 100);
            return line(s.known ? d.name : '??? virtù nascosta',
              s.known ? D.fmtMag(s.key, mag) + (d.dur ? ' / ' + Math.round(d.dur * (1 + p.skills.alchemy.lvl * 0.006)) + 's' : '') : '');
          }).join('')}
        </div>`;
      }
    }

    return `<div class="panel">
      <div class="panel-head">
        <h2>Calderone</h2>
        <span style="font-size:12px;color:var(--ember)">Alchimia ${p.skills.alchemy.lvl}</span>
        <button class="close-x" data-act="close">✕</button>
      </div>
      <div class="panel-body">
        ${preview}
        <div class="sect">Ingredienti — selezionati ${alchPick.length}/2</div>
        <div class="list">${rows}</div>
      </div>
      <div class="panel-foot">
        <div class="btn-row">
          <button data-act="alchclear">Azzera</button>
          <button class="primary" data-act="brew" ${alchPick.length === 2 ? '' : 'disabled'}>Prepara</button>
        </div>
      </div>
    </div>`;
  }

  /* ================================================================
     MORTE / VITTORIA
     ================================================================ */
  function viewDeath() {
    return `<div class="title-screen">
      <h1 style="color:var(--blood);font-size:34px">SEI CADUTO</h1>
      <div class="tagline">Ashford ti ha raccolto di nuovo</div>
      <div class="menu">
        <button class="primary" data-act="respawn">Risvegliati ad Ashford</button>
        <button data-act="title">Torna al titolo</button>
      </div>
      <div class="ver">Perdi metà dell'oro che avevi addosso. Nient'altro.</div>
    </div>`;
  }

  function viewVictory() {
    return `<div class="title-screen">
      <h1>LA CENERE SI POSA</h1>
      <div class="tagline">Vaelrik è caduto</div>
      <div style="max-width:340px;font-size:13px;line-height:1.6;color:var(--text-dim);margin-bottom:24px">
        Il fuoco sulla Rocca si è spento per la prima volta in sette anni. Domani, ad Ashford, qualcuno vedrà il colore del cielo e non saprà come chiamarlo.
      </div>
      <div class="menu">
        <button class="primary" data-act="close">Continua a giocare</button>
        <button data-act="title">Torna al titolo</button>
      </div>
    </div>`;
  }

  /* ================================================================
     GESTIONE DEI CLIC
     ================================================================ */
  function onClick(ev) {
    const t = ev.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    CV.Audio.unlock();
    if (act !== 'volume') CV.Audio.play('ui');

    switch (act) {
      case 'close': close(); break;
      case 'tab': ctxData.tab = t.dataset.tab; render(); break;
      case 'filter': invTab = t.dataset.f; render(); break;
      case 'pick': invSel = (invSel === t.dataset.uid ? null : t.dataset.uid); render(); break;

      case 'equip': {
        P.equip(G.p, t.dataset.uid);
        CV.Audio.play('pickup');
        render();
        break;
      }
      case 'unequip': P.unequipSlot(G.p, t.dataset.slot); render(); break;
      case 'drink': {
        const it = P.findUid(G.p, t.dataset.uid);
        if (it && CV.Alch.drink(G.p, it)) { CV.Audio.play('potion'); toast('Hai bevuto ' + it.potion.name, 'good'); }
        invSel = null; render();
        break;
      }
      case 'eat': {
        const it = P.findUid(G.p, t.dataset.uid);
        if (!it) break;
        const id = it.id;
        const r = CV.Alch.eat(G.p, id);
        if (r.ok) {
          const nm = D.effects[r.key].name;
          toast(r.isNew ? 'Nuova virtù scoperta: ' + nm : 'Virtù: ' + nm, r.isNew ? 'gold' : 'good');
          CV.Audio.play('potion');
        }
        if (P.count(G.p, id) === 0) invSel = null;
        render();
        break;
      }
      case 'drop': {
        if (t.dataset.confirm !== '1') {
          t.dataset.confirm = '1';
          t.textContent = 'Sicuro? Tocca ancora';
          break;
        }
        const it = P.findUid(G.p, t.dataset.uid);
        if (it) { G.dropItemToGround(it); toast('Gettato'); }
        invSel = null; render();
        break;
      }
      case 'perk': {
        if (P.takePerk(G.p, t.dataset.perk)) {
          CV.Audio.play('level');
          toast('Talento sbloccato: ' + P.PERKS[t.dataset.perk].name, 'gold');
        }
        render();
        break;
      }

      /* Impostazioni */
      case 'scheme': {
        G.settings.scheme = t.dataset.v;
        CV.Input.setScheme(t.dataset.v);
        G.saveSettings();
        render();
        break;
      }
      case 'quality': {
        G.settings.quality = t.dataset.v;
        G.applyQuality();
        G.saveSettings();
        render();
        break;
      }
      case 'blockmode': {
        G.settings.blockMode = t.dataset.v;
        G.saveSettings();
        render();
        break;
      }
      case 'music': {
        G.settings.music = t.dataset.v === '1';
        G.applyAudioSettings();
        if (G.settings.music) G.refreshMusic();
        G.saveSettings();
        render();
        break;
      }
      case 'save': G.save(); toast('Partita salvata', 'good'); break;
      case 'title': G.toTitle(); break;
      case 'wipe': {
        if (t.dataset.confirm === '1') { G.wipeSave(); }
        else { t.dataset.confirm = '1'; t.textContent = 'Sicuro? Tocca ancora'; }
        break;
      }
      case 'respawn': G.respawn(); break;

      /* Debug */
      case 'debugtab': debugTab = t.dataset.t; render(); break;
      case 'dbgforcerespawn': {
        const labels = { all: 'Tutto (esclusi boss)', common: 'Nemici comuni', chests: 'Forzieri', shrines: 'Santuari', epic: 'Epici/Boss' };
        G.debugForceRespawn(t.dataset.scope);
        toast('Rigenerato: ' + (labels[t.dataset.scope] || t.dataset.scope), 'gold');
        render();
        break;
      }

      /* Dialogo */
      case 'dlgopt': {
        const node = ctxData.node;
        const opts = CV.Dialogue.options(G.p, node);
        const o = opts[parseInt(t.dataset.i, 10)];
        if (o) applyDialogueOption(o);
        break;
      }

      /* Mercante */
      case 'shoptab': shopTab = t.dataset.t; render(); break;
      case 'buy': {
        const price = parseInt(t.dataset.price, 10);
        if (G.p.gold < price) { CV.Audio.play('error'); toast('Oro insufficiente', 'bad'); break; }
        G.p.gold -= price;
        P.addById(G.p, t.dataset.id, 1);
        P.recalc(G.p);
        CV.Audio.play('coin');
        toast('Acquistato: ' + D.base(t.dataset.id).name, 'good');
        render();
        break;
      }
      case 'sell': {
        const it = P.findUid(G.p, t.dataset.uid);
        if (!it) break;
        G.p.gold += parseInt(t.dataset.price, 10);
        P.removeUid(G.p, it.uid, 1);
        P.recalc(G.p);
        CV.Audio.play('coin');
        render();
        break;
      }

      /* Bacheca dei contratti */
      case 'contractclaim': {
        const evs = [];
        const res = CV.Contracts.claim(G.p, t.dataset.cid, G.rng, G.p.level, !!G.p.flags.endgame, evs);
        G.pushEvents(evs);
        if (res.ok) {
          CV.Audio.play('quest');
          toast('Contratto riscosso' + (res.contract.reward.xp ? ' (+' + res.contract.reward.xp + ' PE)' : ''), 'gold');
          if (res.item) toast('Ricevuto: ' + P.resolve(res.item).name, 'good');
        } else {
          CV.Audio.play('error');
          toast(res.why || 'Non ancora pronto.', 'bad');
        }
        render();
        break;
      }

      /* Fucina */
      case 'smithtab': smithTab = t.dataset.t; render(); break;
      case 'forge': {
        const r = D.smithRecipes[parseInt(t.dataset.i, 10)];
        const evs = [];
        const res = CV.Smith.craft(G.p, r, G.rng, evs);
        G.pushEvents(evs);
        if (res.ok) {
          CV.Audio.play('craft');
          const nm = P.resolve(res.item).name;
          toast('Forgiato: ' + nm + (res.free ? ' (materiali recuperati)' : ''), 'gold');
        } else { CV.Audio.play('error'); toast(res.why, 'bad'); }
        render();
        break;
      }
      case 'temper': {
        const it = P.findUid(G.p, t.dataset.uid);
        if (!it) break;
        const evs = [];
        const res = CV.Smith.upgrade(G.p, it, evs);
        G.pushEvents(evs);
        if (res.ok) { CV.Audio.play('craft'); toast('Temprato a +' + it.up, 'gold'); }
        else { CV.Audio.play('error'); toast(res.why, 'bad'); }
        render();
        break;
      }

      /* Alchimia */
      case 'alchpick': {
        const id = t.dataset.id;
        const i = alchPick.indexOf(id);
        if (i >= 0) alchPick.splice(i, 1);
        else { alchPick.push(id); if (alchPick.length > 2) alchPick.shift(); }
        render();
        break;
      }
      case 'alchclear': alchPick = []; render(); break;
      case 'brew': {
        const evs = [];
        const res = CV.Alch.brew(G.p, alchPick[0], alchPick[1], evs);
        G.pushEvents(evs);
        if (res.ok) { CV.Audio.play('potion'); toast('Preparato: ' + res.potion.name, 'gold'); alchPick = []; }
        else { CV.Audio.play('error'); toast(res.why, 'bad'); if (res.learned) alchPick = []; }
        render();
        break;
      }

      /* Titolo */
      case 'newgame': G.newGame(); break;
      case 'continue': G.continueGame(); break;
      case 'settings': open('menu', { tab: 'settings' }); break;
    }
  }

  /* Slider del volume */
  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (!t || !t.dataset) return;
    if (t.dataset.act === 'volume') {
      G.settings.volume = parseInt(t.value, 10) / 100;
      G.applyAudioSettings();
      G.saveSettings();
    } else if (t.dataset.act === 'dbgsecs') {
      const v = Math.max(0, parseInt(t.value, 10) || 0);
      (G.settings.debug || (G.settings.debug = {}))[t.dataset.key] = v;
      G.saveSettings();
    }
  });

  function applyDialogueOption(o) {
    const p = G.p;
    const evs = [];
    let closeAfter = false, next = null;

    if (o.act) {
      const a = o.act;
      if (a.startQuest) { CV.Quests.start(p, a.startQuest, evs); }
      if (a.advance) { CV.Quests.advance(p, a.advance, evs); }
      if (a.give) P.addById(p, a.give[0], a.give[1]);
      if (a.take) P.removeById(p, a.take[0], a.take[1]);
      if (a.gold) p.gold += a.gold;
      if (a.xp) P.gainXp(p, a.xp, evs);
      if (a.flag) p.flags[a.flag] = true;
      if (a.shop) { G.pushEvents(evs); open('shop', { shop: a.shop }); return; }
      if (a.smith) { G.pushEvents(evs); smithTab = 'forge'; open('smith', {}); return; }
      if (a.alchemy) { G.pushEvents(evs); alchPick = []; open('alchemy', {}); return; }
      if (a.close) closeAfter = true;
    }
    G.pushEvents(evs);

    if (o.to) next = CV.Dialogue.nodeById(ctxData.npc.id, o.to);
    if (closeAfter || !next) {
      if (next) { ctxData.node = next; render(); return; }
      close();
      G.refreshNpcMarkers();
      return;
    }
    ctxData.node = next;
    render();
  }

  /* ---------------- API pubblica ---------------- */
  function openDialogue(npc) {
    const node = CV.Dialogue.rootFor(G.p, npc.id);
    if (!node) return;
    open('dialogue', { npc: npc, node: node });
  }

  CV.UI = {
    init, open, close, isOpen, currentPanel, toast, render,
    openDialogue,
    openSmith: () => { smithTab = 'forge'; open('smith', {}); },
    openAlchemy: () => { alchPick = []; open('alchemy', {}); },
    openShop: (id) => { shopTab = 'buy'; open('shop', { shop: id }); },
    openContracts: () => { CV.Contracts.ensure(G.p, G.rng, G.p.level, !!G.p.flags.endgame); open('contracts', {}); },
    openMenu: (tab) => { open('menu', { tab: tab || 'inv' }); },
    openTitle: (hasSave) => open('title', { hasSave: hasSave }),
    openDeath: () => open('death', {}),
    openVictory: () => open('victory', {})
  };
})(typeof window !== 'undefined' ? window : globalThis);
