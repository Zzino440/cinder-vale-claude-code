/* ============================================================
   INTERFACCIA DI GIOCO disegnata sul canvas a risoluzione nativa.
   Include i comandi a schermo: i cerchi disegnati qui coincidono
   esattamente con le aree di tocco calcolate in input.js.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;
  const P = CV.Player;
  const M = CV.M;

  const H = {
    zoneBanner: 0, zoneName: '', zoneSub: '',
    bossRef: null, bossT: 0,
    tipText: '', tipT: 0
  };

  function showZone(name, sub) { H.zoneName = name; H.zoneSub = sub || ''; H.zoneBanner = 3.2; }
  function showTip(text) { H.tipText = text; H.tipT = 4.5; }
  function setBoss(e) { H.bossRef = e; H.bossT = e ? 4 : 0; }

  /* ---------------- Primitive di disegno ---------------- */
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function bar(ctx, x, y, w, h, frac, color, bg, label) {
    ctx.fillStyle = 'rgba(6,4,10,0.75)';
    roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 3); ctx.fill();
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, 2); ctx.fill();
    const fw = Math.max(0, Math.min(1, frac)) * w;
    if (fw > 0) {
      ctx.fillStyle = color;
      roundRect(ctx, x, y, fw, h, 2); ctx.fill();
      /* Riflesso in alto: dà volume alla barra */
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      roundRect(ctx, x, y, fw, Math.max(1, h * 0.35), 2); ctx.fill();
    }
    if (label) {
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(label, x + w - 3, y + h / 2 + 0.5);
    }
  }

  function text(ctx, str, x, y, opt) {
    opt = opt || {};
    ctx.font = (opt.bold === false ? '' : 'bold ') + (opt.size || 12) + 'px ' + (opt.mono ? 'ui-monospace, monospace' : 'system-ui, -apple-system, "Segoe UI", sans-serif');
    ctx.textAlign = opt.align || 'left';
    ctx.textBaseline = opt.baseline || 'middle';
    if (opt.outline !== false) {
      ctx.lineWidth = opt.outlineW || 3;
      ctx.strokeStyle = 'rgba(6,4,10,0.85)';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = opt.color || '#d7d2e0';
    ctx.fillText(str, x, y);
  }

  /* ---------------- Icone dei pulsanti (vettoriali) ---------------- */
  function icon(ctx, kind, cx, cy, r, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.10);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const s = r * 0.5;

    switch (kind) {
      case 'attack':   /* spada */
        ctx.beginPath();
        ctx.moveTo(-s * 0.8, s * 0.9); ctx.lineTo(s * 0.85, -s * 0.85);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.95, s * 0.25); ctx.lineTo(-s * 0.15, s * 1.05);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.45, -s * 1.05); ctx.lineTo(s * 1.05, -s * 0.45);
        ctx.stroke();
        break;
      case 'block':    /* scudo */
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.85, -s * 0.55);
        ctx.lineTo(s * 0.7, s * 0.35);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.7, s * 0.35);
        ctx.lineTo(-s * 0.85, -s * 0.55);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'dodge':    /* freccia di scatto */
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(s * 0.4, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.05, -s * 0.55); ctx.lineTo(s * 0.75, 0); ctx.lineTo(s * 0.05, s * 0.55);
        ctx.stroke();
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(-s * 1.05, -s * 0.5); ctx.lineTo(-s * 0.45, -s * 0.5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 1.05, s * 0.5); ctx.lineTo(-s * 0.45, s * 0.5); ctx.stroke();
        ctx.globalAlpha = 1;
        break;
      case 'cast':     /* fiamma */
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.05);
        ctx.quadraticCurveTo(s * 0.9, -s * 0.1, s * 0.42, s * 0.62);
        ctx.quadraticCurveTo(0, s * 1.15, -s * 0.42, s * 0.62);
        ctx.quadraticCurveTo(-s * 0.9, -s * 0.1, 0, -s * 1.05);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'interact': /* mano / punto esclamativo */
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillRect(-r * 0.06, -s * 0.45, r * 0.12, s * 0.6);
        ctx.beginPath(); ctx.arc(0, s * 0.45, r * 0.08, 0, Math.PI * 2); ctx.fill();
        break;
      case 'menu':
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(-s * 0.75, i * s * 0.5); ctx.lineTo(s * 0.75, i * s * 0.5);
          ctx.stroke();
        }
        break;
      case 'potion':   /* boccetta */
        ctx.beginPath();
        ctx.moveTo(-s * 0.32, -s * 0.9); ctx.lineTo(-s * 0.32, -s * 0.3);
        ctx.lineTo(-s * 0.7, s * 0.55);
        ctx.quadraticCurveTo(-s * 0.7, s * 0.95, -s * 0.2, s * 0.95);
        ctx.lineTo(s * 0.2, s * 0.95);
        ctx.quadraticCurveTo(s * 0.7, s * 0.95, s * 0.7, s * 0.55);
        ctx.lineTo(s * 0.32, -s * 0.3);
        ctx.lineTo(s * 0.32, -s * 0.9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-s * 0.45, -s * 0.9); ctx.lineTo(s * 0.45, -s * 0.9);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  /* Pulsante circolare: fondo, bordo, icona, eventuale ricarica. */
  function button(ctx, b, opts) {
    opts = opts || {};
    const pressed = opts.pressed;
    const dim = opts.disabled;
    ctx.save();
    ctx.globalAlpha = dim ? 0.32 : (pressed ? 0.95 : 0.78);

    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(90,70,60,0.85)' : 'rgba(18,14,24,0.62)';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = opts.accent || 'rgba(150,140,165,0.75)';
    ctx.stroke();

    /* Anello di ricarica */
    if (opts.cooldown != null && opts.cooldown > 0) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - opts.cooldown));
      ctx.strokeStyle = 'rgba(240,108,58,0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    icon(ctx, b.icon, b.x, b.y, b.r, opts.iconColor || (dim ? '#6b6577' : '#e6e1ef'));
    ctx.restore();

    if (opts.label) {
      text(ctx, opts.label, b.x, b.y + b.r + 11, { size: 9, align: 'center', color: 'rgba(215,210,224,0.6)' });
    }
    if (opts.badge) {
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x + b.r * 0.72, b.y - b.r * 0.72, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#a5451f'; ctx.fill();
      ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
      text(ctx, String(opts.badge), b.x + b.r * 0.72, b.y - b.r * 0.72 + 0.5, { size: 10, align: 'center', color: '#ffd166', outline: false });
    }
  }

  /* ================================================================
     DISEGNO COMPLETO DELL'INTERFACCIA
     ================================================================ */
  function draw(ctx, G, dt) {
    const p = G.p, pe = G.pe;
    const L = CV.Input.layout;
    const ins = L.insets;
    const W = L.w, Hh = L.h;

    /* ---------- Barre vitali ---------- */
    const bx = ins.left + 12, by = ins.top + 14;
    const bw = Math.min(150, W * 0.42);
    bar(ctx, bx, by, bw, 9, p.hp / p.stats.maxHp, '#c33636', 'rgba(40,16,16,0.85)');
    bar(ctx, bx, by + 13, bw * 0.86, 6, p.sp / p.stats.maxSp, '#7cc46a', 'rgba(20,36,18,0.85)');
    bar(ctx, bx, by + 22, bw * 0.86, 6, p.mp / p.stats.maxMp, '#6fb3ff', 'rgba(16,26,44,0.85)');

    text(ctx, Math.ceil(p.hp) + '/' + p.stats.maxHp, bx + bw - 4, by + 4.5,
      { size: 9, align: 'right', color: 'rgba(255,255,255,0.7)', mono: true, outlineW: 2 });

    /* Livello */
    ctx.save();
    ctx.beginPath(); ctx.arc(bx - 2, by + 4, 0, 0, 0); ctx.restore();
    text(ctx, 'Liv ' + p.level, bx, by + 38, { size: 11, color: '#ffd166' });
    const xpFrac = p.xp / P.xpForLevel(p.level);
    bar(ctx, bx + 42, by + 35, 56, 4, xpFrac, '#c9a6ff', 'rgba(30,24,42,0.85)');

    /* Sovraccarico */
    if (p.stats.encumbered) {
      text(ctx, 'SOVRACCARICO', bx, by + 52, { size: 10, color: '#f06c3a' });
    }

    /* ---------- Effetti attivi ---------- */
    if (p.effects.length) {
      let ex = bx, ey = by + (p.stats.encumbered ? 66 : 52);
      for (const e of p.effects) {
        const def = D.effects[e.key];
        if (!def) continue;
        ctx.save();
        ctx.beginPath(); ctx.arc(ex + 8, ey, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(10,8,16,0.8)'; ctx.fill();
        ctx.strokeStyle = def.color; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        text(ctx, def.name[0], ex + 8, ey, { size: 10, align: 'center', color: def.color });
        text(ctx, Math.ceil(e.t) + 's', ex + 8, ey + 15, { size: 8, align: 'center', color: 'rgba(215,210,224,0.55)' });
        ex += 24;
      }
    }

    /* ---------- Obiettivo di missione ---------- */
    const activeQ = currentObjective(p);
    if (activeQ) {
      const qy = Hh - ins.bottom - 18;
      text(ctx, '❖ ' + activeQ.name, ins.left + 12, qy - 15, { size: 11, color: '#ffd166' });
      const prog = CV.Quests.progressText(p, activeQ.id);
      text(ctx, activeQ.text + (prog ? '  ' + prog : ''), ins.left + 12, qy,
        { size: 10, color: 'rgba(215,210,224,0.75)' });
    }

    /* ---------- Barra del boss ---------- */
    if (H.bossRef && !H.bossRef.dead) {
      const e = H.bossRef;
      const w = Math.min(280, W * 0.7), x = (W - w) / 2, y = ins.top + 16;
      text(ctx, e.name, W / 2, y - 8, { size: 12, align: 'center', color: '#ffd166' });
      bar(ctx, x, y, w, 8, e.hp / e.maxHp, '#c33636', 'rgba(40,16,16,0.9)');
    } else if (H.bossRef) {
      H.bossT -= dt;
      if (H.bossT <= 0) H.bossRef = null;
    }

    /* ---------- Nome della zona all'ingresso ---------- */
    if (H.zoneBanner > 0) {
      H.zoneBanner -= dt;
      const a = M.clamp(H.zoneBanner > 2.6 ? (3.2 - H.zoneBanner) / 0.6 : Math.min(1, H.zoneBanner / 0.8), 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      text(ctx, H.zoneName, W / 2, Hh * 0.26, { size: 22, align: 'center', color: '#ffd166' });
      if (H.zoneSub) text(ctx, H.zoneSub.toUpperCase(), W / 2, Hh * 0.26 + 22, { size: 10, align: 'center', color: 'rgba(215,210,224,0.7)' });
      ctx.restore();
    }

    /* ---------- Suggerimento ---------- */
    if (H.tipT > 0) {
      H.tipT -= dt;
      const a = Math.min(1, H.tipT / 0.6);
      ctx.save(); ctx.globalAlpha = a;
      text(ctx, H.tipText, W / 2, Hh * 0.16, { size: 11, align: 'center', color: 'rgba(215,210,224,0.85)' });
      ctx.restore();
    }

    /* ---------- Comandi a schermo ---------- */
    const scheme = CV.Input.effectiveScheme();
    const touch = scheme === 'touch_stick' || scheme === 'touch_tap';

    /* Menu e pozione sono utili anche col mouse */
    button(ctx, L.menu, { pressed: CV.Input.down('menu') });
    const potions = countPotions(p);
    button(ctx, L.potion, { pressed: CV.Input.down('potion'), disabled: potions === 0, badge: potions || null });

    if (touch) {
      /* Joystick virtuale */
      if (scheme === 'touch_stick') drawStick(ctx, L);
      else drawTapMarker(ctx, G);

      const w = P.equipped(p, 'weapon');
      const staCost = w ? w.stamCost : 8;
      button(ctx, L.attack, {
        pressed: CV.Input.down('attack'),
        disabled: p.sp < staCost * 0.5,
        cooldown: pe.state === 'attack' || pe.state === 'recover' ? 1 - M.clamp(pe.stateT / 0.32, 0, 1) : 0,
        accent: 'rgba(240,108,58,0.8)'
      });
      button(ctx, L.dodge, { pressed: CV.Input.down('dodge'), disabled: p.sp < dodgeCost(p) });
      button(ctx, L.block, { pressed: pe.blocking, accent: pe.blocking && pe.blockT < 0.25 ? '#ffd166' : null });
      button(ctx, L.cast, { pressed: CV.Input.down('cast'), disabled: p.mp < castCost(p), accent: 'rgba(111,179,255,0.8)' });

      if (CV.Input.hasInteract()) {
        button(ctx, L.interact, { pressed: CV.Input.down('interact'), accent: '#ffd166', label: G.interactLabel || 'Usa' });
      }
    } else {
      /* Promemoria dei tasti su PC */
      drawKeyHints(ctx, L, G);
    }

    /* Etichetta di ciò che si può usare, sopra al personaggio */
    if (G.interactTarget && !touch) {
      const s = CV.Render.worldToScreen(G.interactTarget.x, G.interactTarget.y - 22);
      text(ctx, '[E] ' + (G.interactLabel || 'Usa'), s.x, s.y, { size: 11, align: 'center', color: '#ffd166' });
    } else if (G.interactTarget && touch) {
      const s = CV.Render.worldToScreen(G.interactTarget.x, G.interactTarget.y - 22);
      text(ctx, G.interactLabel || 'Usa', s.x, s.y, { size: 11, align: 'center', color: '#ffd166' });
    }

    /* Schermata di morte */
    if (pe.dead) {
      ctx.fillStyle = 'rgba(20,4,4,' + M.clamp(pe.stateT * 0.6, 0, 0.72) + ')';
      ctx.fillRect(0, 0, W, Hh);
      if (pe.stateT > 0.7) {
        text(ctx, 'SEI CADUTO', W / 2, Hh * 0.42, { size: 26, align: 'center', color: '#c33636' });
        text(ctx, 'La cenere ti copre. Ma non oggi.', W / 2, Hh * 0.42 + 26, { size: 12, align: 'center', color: 'rgba(215,210,224,0.7)' });
      }
    }
  }

  function drawStick(ctx, L) {
    const st = CV.Input.stick;
    const z = L.stickZone;
    if (!st) {
      /* Suggerimento discreto quando il pollice non tocca */
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = '#d7d2e0'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x0 + 78, z.y1 - 108, 40, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(z.x0 + 78, z.y1 - 108, 17, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    const dx = st.x - st.ox, dy = st.y - st.oy;
    const len = Math.hypot(dx, dy), maxR = 46;
    const f = len > maxR ? maxR / len : 1;
    const kx = st.ox + dx * f, ky = st.oy + dy * f;

    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(st.ox, st.oy, maxR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(18,14,24,0.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(180,172,196,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(kx, ky, 20, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,190,215,0.55)'; ctx.fill();
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function drawTapMarker(ctx, G) {
    const t = CV.Input.moveTarget;
    if (!t) return;
    const time = CV.Render.state.time;
    ctx.save();
    ctx.globalAlpha = 0.55 + Math.sin(time * 8) * 0.15;
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 2;
    const r = 12 + Math.sin(time * 8) * 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.x - 5, t.y); ctx.lineTo(t.x + 5, t.y);
    ctx.moveTo(t.x, t.y - 5); ctx.lineTo(t.x, t.y + 5);
    ctx.stroke();
    ctx.restore();
  }

  function drawKeyHints(ctx, L, G) {
    const x = L.w - L.insets.right - 14, y0 = L.h - L.insets.bottom - 12;
    const rows = [
      ['WASD', 'muovi'],
      ['Click sin. / J', 'attacca'],
      ['Click des. / K', 'para'],
      ['Spazio', 'schiva'],
      ['Q', 'incantesimo'],
      ['E', 'interagisci'],
      ['I  L  P  M', 'zaino, diario, abilità, mappa']
    ];
    ctx.save();
    ctx.globalAlpha = 0.42;
    rows.forEach((r, i) => {
      const y = y0 - (rows.length - 1 - i) * 15;
      text(ctx, r[0], x - 132, y, { size: 10, color: '#ffd166', align: 'right', outlineW: 2 });
      text(ctx, r[1], x - 126, y, { size: 10, color: '#d7d2e0', align: 'left', outlineW: 2 });
    });
    ctx.restore();
  }

  /* ---------------- Supporto ---------------- */
  function currentObjective(p) {
    let best = null;
    for (const id in p.quests) {
      const q = p.quests[id], def = D.quests[id];
      if (!q || q.done || !def) continue;
      const st = def.stages[q.stage];
      if (!st) continue;
      const cand = { id: id, name: def.name, text: st.text, main: !!def.main };
      if (!best || (cand.main && !best.main)) best = cand;
    }
    return best;
  }

  function countPotions(p) {
    let n = 0;
    for (const it of p.inv) if (it.potion && !it.potion.harmful) n += it.qty;
    return n;
  }

  function dodgeCost(p) { return p.perks.nimble ? 14 : 22; }
  function castCost(p) { return Math.round((18 - p.skills.destruction.lvl * 0.06) * (p.perks.focus ? 0.7 : 1)); }

  CV.Hud = { draw, showZone, showTip, setBoss, countPotions, dodgeCost, castCost, currentObjective, text, roundRect };
})(typeof window !== 'undefined' ? window : globalThis);
