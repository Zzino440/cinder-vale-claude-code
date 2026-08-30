/* ============================================================
   INPUT: tre schemi di comando che producono le STESSE intenzioni.
     touch_stick : joystick virtuale a sinistra + pulsanti a destra
     touch_tap   : si tocca dove andare (niente joystick) + pulsanti
     kbm         : tastiera + mouse (per lo sviluppo su PC)

   Il gioco legge solo `move`, `aim` e le azioni: non sa da quale
   schema arrivino. È lo stesso modello delle Input Action di Godot.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const M = CV.M;

  const ACTIONS = ['attack', 'dodge', 'cast', 'block', 'interact', 'menu', 'potion', 'inv', 'quests', 'skills', 'map'];

  const state = {
    scheme: 'auto',          /* auto | touch_stick | touch_tap | kbm */
    detected: null,          /* schema rilevato automaticamente */
    enabled: true,

    move: { x: 0, y: 0 },
    aim: { x: 0, y: 1 },
    hasAim: false,
    aimScreen: null,         /* posizione del mouse in px CSS */
    moveTarget: null,        /* bersaglio in px CSS per tap-to-move */
    moveTargetHeld: false,

    down: {}, pressed: {}, released: {},
    layout: null,
    stick: null,             /* { id, ox, oy, x, y } joystick attivo */
    pointers: new Map(),
    interactAvailable: false,
    lastTapWorld: null
  };
  for (const a of ACTIONS) { state.down[a] = false; state.pressed[a] = false; }

  /* Mappa tastiera -> azione.
     Si usa `event.code` (posizione fisica del tasto: resta corretta anche
     su layout AZERTY o QWERTZ), con ripiego su `event.key` perché alcune
     tastiere virtuali e strumenti di automazione non compilano `code`. */
  const KEY_ACTION = {
    KeyJ: 'attack', KeyK: 'block', KeyQ: 'cast', Space: 'dodge',
    KeyE: 'interact', KeyR: 'potion', Escape: 'menu',
    KeyI: 'inv', KeyL: 'quests', KeyP: 'skills', KeyM: 'map', Tab: 'inv',
    'key:j': 'attack', 'key:k': 'block', 'key:q': 'cast', 'key: ': 'dodge',
    'key:e': 'interact', 'key:r': 'potion', 'key:escape': 'menu',
    'key:i': 'inv', 'key:l': 'quests', 'key:p': 'skills', 'key:m': 'map', 'key:tab': 'inv'
  };
  const KEY_MOVE = {
    KeyW: [0, -1], ArrowUp: [0, -1],
    KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0],
    KeyD: [1, 0], ArrowRight: [1, 0],
    'key:w': [0, -1], 'key:arrowup': [0, -1],
    'key:s': [0, 1], 'key:arrowdown': [0, 1],
    'key:a': [-1, 0], 'key:arrowleft': [-1, 0],
    'key:d': [1, 0], 'key:arrowright': [1, 0]
  };
  const keysDown = new Set();

  /* Identificatore stabile del tasto, valido con o senza `code`. */
  function keyId(e) {
    if (e.code) return e.code;
    return 'key:' + String(e.key || '').toLowerCase();
  }

  /* ---------------- Layout dei comandi a schermo ----------------
     Coordinate in pixel CSS. Il renderer disegna esattamente questi
     cerchi, così tocco e disegno non possono divergere. */
  function computeLayout(w, h, insets) {
    const ins = insets || { top: 0, right: 0, bottom: 0, left: 0 };
    const small = Math.min(w, h) < 420;
    const R = small ? 34 : 40;      /* pulsante principale */
    const r = small ? 25 : 29;      /* pulsanti secondari */
    const rb = ins.bottom + (small ? 18 : 26);
    const rr = ins.right + (small ? 14 : 20);

    /* Disposizione a diamante attorno al pulsante d'attacco.
       `D` è la distanza fra i centri: tenuta maggiore della somma dei
       raggi, così due pulsanti non possono mai sovrapporsi. */
    const ax = w - rr - R - 6;
    const ay = h - rb - R - 10;
    const Dg = R + r + 17;
    const dodgeX = ax - Dg;

    return {
      w, h, insets: ins,
      attack:   { x: ax,                 y: ay,                 r: R,     icon: 'attack',   label: 'Colpo' },
      block:    { x: ax,                 y: ay - Dg,            r: r,     icon: 'block',    label: 'Parata' },
      dodge:    { x: dodgeX,             y: ay,                 r: r,     icon: 'dodge',    label: 'Schivata' },
      cast:     { x: ax - Dg * 0.72,     y: ay - Dg * 0.72,     r: r,     icon: 'cast',     label: 'Fuoco' },
      interact: { x: ax,                 y: ay - Dg * 2,        r: r - 2, icon: 'interact', label: 'Usa', conditional: true },
      menu:     { x: w - rr - 24,        y: ins.top + 30,       r: 21,    icon: 'menu',     label: 'Menu' },
      potion:   { x: w - rr - 24,        y: ins.top + 80,       r: 21,    icon: 'potion',   label: 'Pozione' },
      /* Area del joystick / tap di movimento: si ferma prima dei pulsanti */
      stickZone: { x0: 0, y0: ins.top + 110, x1: Math.min(w * 0.55, dodgeX - r - 12), y1: h }
    };
  }

  function setLayout(w, h, insets) { state.layout = computeLayout(w, h, insets); }

  function hitButton(x, y, onlyKeys) {
    const L = state.layout;
    if (!L) return null;
    const keys = onlyKeys || ['attack', 'dodge', 'cast', 'block', 'menu', 'potion', 'interact'];
    for (const k of keys) {
      const b = L[k];
      if (!b) continue;
      if (b.conditional && !state.interactAvailable) continue;
      /* Area di tocco leggermente più generosa del disegno: dita, non puntatori */
      const pad = 8;
      if (M.dist2(x, y, b.x, b.y) <= (b.r + pad) * (b.r + pad)) return k;
    }
    return null;
  }

  function press(action) {
    if (!state.down[action]) state.pressed[action] = true;
    state.down[action] = true;
  }
  function release(action) {
    if (state.down[action]) state.released[action] = true;
    state.down[action] = false;
  }

  function effectiveScheme() {
    if (state.scheme !== 'auto') return state.scheme;
    return state.detected || (matchMediaTouch() ? 'touch_stick' : 'kbm');
  }
  function matchMediaTouch() {
    return ('ontouchstart' in root) || (navigator.maxTouchPoints > 0);
  }
  function isTouchScheme() {
    const s = effectiveScheme();
    return s === 'touch_stick' || s === 'touch_tap';
  }

  /* ---------------- Registrazione eventi ---------------- */
  function attach(canvas) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('pointerdown', onDown, { passive: false });
    canvas.addEventListener('pointermove', onMove, { passive: false });
    root.addEventListener('pointerup', onUp, { passive: false });
    root.addEventListener('pointercancel', onUp, { passive: false });

    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('keyup', onKeyUp);
    root.addEventListener('blur', clearAll);

    function localPos(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onDown(e) {
      if (!state.enabled) return;
      e.preventDefault();
      CV.Audio.unlock();
      const p = localPos(e);
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (touch && !state.detected) state.detected = 'touch_stick';
      if (!touch && !state.detected) state.detected = 'kbm';

      /* Mouse: bottone destro = parata, sinistro = attacco, MA prima si
         controlla se il sinistro cade su Menu/Pozione (gli unici pulsanti
         del cerchio disegnati anche in schema kbm: vedi hud.js). */
      if (!touch && !isTouchScheme()) {
        state.aimScreen = p;
        if (e.button === 0) {
          const btn = hitButton(p.x, p.y, ['menu', 'potion']);
          if (btn) {
            state.pointers.set(e.pointerId, { role: 'button', btn: btn });
            press(btn);
            return;
          }
        }
        if (e.button === 2) press('block');
        else if (e.button === 0) press('attack');
        else if (e.button === 1) press('cast');
        return;
      }

      const btn = hitButton(p.x, p.y);
      if (btn) {
        state.pointers.set(e.pointerId, { role: 'button', btn: btn });
        press(btn);
        return;
      }

      const scheme = effectiveScheme();
      if (scheme === 'touch_stick') {
        const z = state.layout.stickZone;
        if (p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1 && !state.stick) {
          state.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
          state.pointers.set(e.pointerId, { role: 'stick' });
          return;
        }
      } else if (scheme === 'touch_tap') {
        state.moveTarget = { x: p.x, y: p.y };
        state.moveTargetHeld = true;
        state.pointers.set(e.pointerId, { role: 'movetap' });
        return;
      }
      state.pointers.set(e.pointerId, { role: 'none' });
    }

    function onMove(e) {
      if (!state.enabled) return;
      const p = localPos(e);
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!touch) { state.aimScreen = p; state.hasAim = true; }

      const rec = state.pointers.get(e.pointerId);
      if (!rec) return;
      e.preventDefault();
      if (rec.role === 'stick' && state.stick && state.stick.id === e.pointerId) {
        state.stick.x = p.x; state.stick.y = p.y;
      } else if (rec.role === 'movetap') {
        state.moveTarget = { x: p.x, y: p.y };
      } else if (rec.role === 'button') {
        /* Se il dito esce dal pulsante, lo rilascia: comportamento atteso su mobile */
        const b = state.layout[rec.btn];
        if (b && M.dist2(p.x, p.y, b.x, b.y) > (b.r + 26) * (b.r + 26)) {
          release(rec.btn);
          rec.role = 'none';
        }
      }
    }

    function onUp(e) {
      const rec = state.pointers.get(e.pointerId);
      const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
      if (!touch && !isTouchScheme()) {
        if (e.button === 2) release('block');
        else if (e.button === 0) release('attack');
        else if (e.button === 1) release('cast');
      }
      if (!rec) return;
      if (rec.role === 'stick') { state.stick = null; state.move.x = 0; state.move.y = 0; }
      else if (rec.role === 'button') release(rec.btn);
      else if (rec.role === 'movetap') state.moveTargetHeld = false;
      state.pointers.delete(e.pointerId);
    }

    function onKeyDown(e) {
      if (!state.detected) state.detected = 'kbm';
      const id = keyId(e);
      if (id === 'Tab' || id === 'Space' || id === 'key:tab' || id === 'key: ') e.preventDefault();
      if (e.repeat) return;
      keysDown.add(id);
      const a = KEY_ACTION[id];
      if (a && state.enabled) press(a);
      if (KEY_MOVE[id]) e.preventDefault();
    }

    function onKeyUp(e) {
      const id = keyId(e);
      keysDown.delete(id);
      const a = KEY_ACTION[id];
      if (a) release(a);
    }
  }

  function clearAll() {
    keysDown.clear();
    state.pointers.clear();
    state.stick = null;
    state.move.x = 0; state.move.y = 0;
    for (const a of ACTIONS) { state.down[a] = false; }
  }

  /* ---------------- Aggiornamento per frame ----------------
     Va chiamata PRIMA della logica di gioco. `endFrame` dopo. */
  function update() {
    const scheme = effectiveScheme();

    if (scheme === 'kbm') {
      let mx = 0, my = 0;
      for (const code of keysDown) {
        const v = KEY_MOVE[code];
        if (v) { mx += v[0]; my += v[1]; }
      }
      const len = Math.hypot(mx, my);
      state.move.x = len ? mx / len : 0;
      state.move.y = len ? my / len : 0;
      state.moveTarget = null;
    } else if (scheme === 'touch_stick') {
      if (state.stick) {
        const dx = state.stick.x - state.stick.ox;
        const dy = state.stick.y - state.stick.oy;
        const len = Math.hypot(dx, dy);
        const dead = 6, maxR = 46;
        if (len < dead) { state.move.x = 0; state.move.y = 0; }
        else {
          const f = Math.min(1, (len - dead) / (maxR - dead));
          state.move.x = (dx / len) * f;
          state.move.y = (dy / len) * f;
        }
      } else { state.move.x = 0; state.move.y = 0; }
      state.moveTarget = null;
    } else {
      /* touch_tap: il movimento lo calcola il gioco confrontando la
         posizione del personaggio con il bersaglio toccato. */
      state.move.x = 0; state.move.y = 0;
    }
  }

  function endFrame() {
    for (const a of ACTIONS) { state.pressed[a] = false; state.released[a] = false; }
  }

  CV.Input = {
    ACTIONS,
    attach, setLayout, update, endFrame, clearAll,
    get layout() { return state.layout; },
    get move() { return state.move; },
    get stick() { return state.stick; },
    get moveTarget() { return state.moveTarget; },
    get moveTargetHeld() { return state.moveTargetHeld; },
    clearMoveTarget: () => { state.moveTarget = null; state.moveTargetHeld = false; },
    get aimScreen() { return state.aimScreen; },
    down: (a) => !!state.down[a],
    pressed: (a) => !!state.pressed[a],
    released: (a) => !!state.released[a],
    setScheme: (s) => { state.scheme = s; state.detected = (s === 'auto' ? state.detected : null); clearAll(); },
    getScheme: () => state.scheme,
    effectiveScheme, isTouchScheme,
    setEnabled: (v) => { state.enabled = v; if (!v) clearAll(); },
    setInteractAvailable: (v) => { state.interactAvailable = v; },
    hasInteract: () => state.interactAvailable
  };
})(typeof window !== 'undefined' ? window : globalThis);
