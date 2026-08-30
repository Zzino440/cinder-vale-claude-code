/* ============================================================
   AUDIO: sintesi in tempo reale con WebAudio.
   Nessun file da scaricare: ogni suono è generato da oscillatori.
   LIVELLO MOTORE.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});

  let ctx = null, master = null, muted = false, volume = 0.6;
  let musicGain = null, musicTimers = [], currentMood = null;
  let reverbBus = null, reverbReturn = null;

  /* Riverbero sintetico: rumore con decadimento esponenziale, nessun file da caricare. */
  function makeImpulse(c, duration, decay) {
    const len = Math.floor(c.sampleRate * duration);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /* Saturazione morbida (tanh): toglie la "purezza" digitale che
     suona sterile/8-bit, aggiunge un pelo di calore a tutto il segnale. */
  function makeSatCurve(amount) {
    const n = 2048;
    const curve = new Float32Array(n);
    const k = 1 + amount;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return curve;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeSatCurve(0.5);
    shaper.oversample = '2x';
    master.connect(shaper);
    shaper.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.28;

    /* Filtro che respira lentamente: senza, un pad tenuto per secondi
       suona statico e fermo. L'LFO apre e chiude il taglio nel tempo. */
    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 1600;
    musicFilter.Q.value = 0.6;
    musicGain.connect(musicFilter);
    musicFilter.connect(master);
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.055;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 700;
    lfo.connect(lfoDepth);
    lfoDepth.connect(musicFilter.frequency);
    lfo.start();

    /* Eco leggero sulla musica: ripetizioni corte e attenuate, il
       tocco che fa sembrare "prodotto" invece che generato al volo. */
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.34;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = 0.28;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.22;
    musicFilter.connect(delay);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    delay.connect(delayWet);
    delayWet.connect(master);

    /* Bus di riverbero: riceve in parallelo, non è mai in retroazione su master. */
    reverbBus = ctx.createGain();
    reverbBus.gain.value = 1;
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 1.8, 1.6);
    reverbReturn = ctx.createGain();
    reverbReturn.gain.value = volume * 1.1;
    reverbBus.connect(convolver);
    convolver.connect(reverbReturn);
    reverbReturn.connect(ctx.destination);

    /* Un filo di coda ambientale anche sugli SFX, per coerenza con la musica. */
    const masterSend = ctx.createGain();
    masterSend.gain.value = 0.06;
    master.connect(masterSend);
    masterSend.connect(reverbBus);

    return ctx;
  }

  /* I browser richiedono un gesto dell'utente prima di produrre suono. */
  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* Nota sintetica con inviluppo e sweep di frequenza opzionale.
     attack/sustain permettono note più morbide (pad, bassi) oltre
     al default percussivo usato dagli SFX. reverb (0-1) manda una
     frazione del segnale al bus di coda, in parallelo al secco. */
  function tone(opt) {
    if (muted || !ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opt.type || 'square';
    if (opt.detune) o.detune.value = opt.detune;
    o.frequency.setValueAtTime(opt.freq, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opt.to), t + opt.dur);
    const vol = (opt.vol == null ? 0.25 : opt.vol);
    const attack = opt.attack == null ? 0.008 : opt.attack;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    if (opt.sustain) g.gain.setValueAtTime(vol, t + Math.max(attack, opt.sustain * opt.dur));
    g.gain.exponentialRampToValueAtTime(0.0001, t + opt.dur);
    o.connect(g);
    let out = g;
    if (opt.pan != null && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opt.pan;
      g.connect(p);
      out = p;
    }
    out.connect(opt.bus || master);
    if (opt.reverb && reverbBus) {
      const send = ctx.createGain();
      send.gain.value = opt.reverb;
      g.connect(send); send.connect(reverbBus);
    }
    o.start(t); o.stop(t + opt.dur + 0.02);
  }

  /* Rumore filtrato: colpi, passi, impatti. */
  function noise(opt) {
    if (muted || !ensure()) return;
    const dur = opt.dur || 0.12;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = opt.filter || 'bandpass';
    f.frequency.value = opt.freq || 900;
    f.Q.value = opt.q || 1.2;
    const g = ctx.createGain();
    g.gain.value = opt.vol == null ? 0.22 : opt.vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  const SFX = {
    swing:   () => noise({ freq: 1400, dur: 0.11, vol: 0.14, filter: 'highpass' }),
    hit:     () => { noise({ freq: 420, dur: 0.13, vol: 0.26 }); tone({ freq: 180, to: 70, dur: 0.10, type: 'square', vol: 0.18 }); },
    crit:    () => { noise({ freq: 700, dur: 0.16, vol: 0.3 }); tone({ freq: 520, to: 140, dur: 0.16, type: 'sawtooth', vol: 0.22 }); },
    hurt:    () => tone({ freq: 240, to: 90, dur: 0.22, type: 'sawtooth', vol: 0.24 }),
    block:   () => { noise({ freq: 2200, dur: 0.09, vol: 0.2, filter: 'highpass' }); tone({ freq: 900, to: 600, dur: 0.09, type: 'square', vol: 0.12 }); },
    parry:   () => { tone({ freq: 1400, to: 2400, dur: 0.14, type: 'triangle', vol: 0.26 }); tone({ freq: 700, to: 1200, dur: 0.18, type: 'sine', vol: 0.2 }); },
    dodge:   () => noise({ freq: 600, dur: 0.16, vol: 0.13, filter: 'lowpass' }),
    cast:    () => { tone({ freq: 300, to: 900, dur: 0.20, type: 'sine', vol: 0.2 }); tone({ freq: 600, to: 1500, dur: 0.16, type: 'triangle', vol: 0.12 }); },
    fire:    () => { noise({ freq: 300, dur: 0.3, vol: 0.2, filter: 'lowpass' }); tone({ freq: 160, to: 60, dur: 0.28, type: 'sawtooth', vol: 0.16 }); },
    arrow:   () => noise({ freq: 2600, dur: 0.09, vol: 0.12, filter: 'highpass' }),
    /* Avviso di colpo in arrivo: due note che salgono, corte e distinguibili
       da tutto il resto. Serve a far capire QUANDO parare. */
    telegraph: () => { tone({ freq: 760, dur: 0.06, type: 'triangle', vol: 0.10 }); setTimeout(() => tone({ freq: 1080, dur: 0.07, type: 'triangle', vol: 0.11 }), 55); },
    die:     () => tone({ freq: 200, to: 45, dur: 0.5, type: 'sawtooth', vol: 0.24 }),
    pickup:  () => { tone({ freq: 780, dur: 0.08, type: 'triangle', vol: 0.14, reverb: 0.25 }); setTimeout(() => tone({ freq: 1180, dur: 0.1, type: 'triangle', vol: 0.12, reverb: 0.25 }), 55); },
    coin:    () => { tone({ freq: 1200, dur: 0.06, type: 'triangle', vol: 0.12, reverb: 0.2 }); setTimeout(() => tone({ freq: 1700, dur: 0.09, type: 'triangle', vol: 0.1, reverb: 0.2 }), 45); },
    chest:   () => { noise({ freq: 320, dur: 0.25, vol: 0.18 }); setTimeout(() => tone({ freq: 500, to: 900, dur: 0.2, type: 'triangle', vol: 0.16, reverb: 0.25 }), 90); },
    level:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.28, type: 'triangle', vol: 0.2, reverb: 0.3 }), i * 95)); },
    skillup: () => { [660, 880].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.18, type: 'triangle', vol: 0.14, reverb: 0.28 }), i * 90)); },
    quest:   () => { [440, 587, 740].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.32, type: 'sine', vol: 0.18, reverb: 0.28 }), i * 130)); },
    ui:      () => tone({ freq: 620, dur: 0.04, type: 'square', vol: 0.09 }),
    craft:   () => { [0, 120, 240].forEach((d, i) => setTimeout(() => { noise({ freq: 1100 - i * 200, dur: 0.1, vol: 0.2 }); }, d)); },
    potion:  () => tone({ freq: 400, to: 1000, dur: 0.3, type: 'sine', vol: 0.16, reverb: 0.2 }),
    error:   () => tone({ freq: 190, to: 130, dur: 0.16, type: 'square', vol: 0.14 }),
    door:    () => { noise({ freq: 200, dur: 0.4, vol: 0.2, filter: 'lowpass' }); }
  };

  function play(name) {
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* audio non disponibile: si prosegue in silenzio */ } }
  }

  /* ---------------- Musica di sottofondo ----------------
     Non è una colonna sonora orchestrale, ma tre voci indipendenti
     invece di una sola nota alla volta: un pad armonico (accordo,
     due oscillatori leggermente scordati per voce = più corpo), un
     basso con ritmo proprio, e una linea melodica sparsa che pesca
     dall'accordo corrente invece di ripetere sempre la stessa scala. */
  const MOODS = {
    calm:  { root: 196.0, chords: [[0, 3, 7], [5, 8, 12], [7, 10, 14], [-2, 3, 7]], step: 1000, pad: 'sine', bass: 'triangle', lead: 'triangle', vol: 0.10 },
    tense: { root: 174.6, chords: [[0, 1, 7], [-1, 2, 8], [0, 1, 7], [1, 2, 9]], step: 820, pad: 'sine', bass: 'sine', lead: 'triangle', vol: 0.09 },
    dread: { root: 130.8, chords: [[0, 1, 6], [0, 1, 6], [-2, 1, 6], [0, 1, 6]], step: 760, pad: 'sine', bass: 'sine', lead: 'sine', vol: 0.11 }
  };

  /* Due oscillatori scordati di pochi cent sulla stessa nota, panning
     leggermente separato: è il trucco più semplice per non suonare
     "sintetico e secco" e dare un minimo di ampiezza stereo. */
  function padVoice(freq, dur, type, vol, bus) {
    [[-6, -0.35], [6, 0.35]].forEach(([det, pan]) => {
      tone({ freq, detune: det, pan, dur, type, vol: vol * 0.45, attack: 0.35, sustain: 0.55, bus, reverb: 0.5 });
    });
  }

  /* Un solo clock a battito guida le tre voci insieme, invece di tre
     timer scollegati: pad e basso e melodia restano sincronizzati. */
  function setMood(mood) {
    if (currentMood === mood) return;
    currentMood = mood;
    stopMusic();
    if (!mood || muted || !ensure()) return;
    const m = MOODS[mood] || MOODS.calm;
    const beatsPerChord = 4;
    let beat = 0;

    function tick() {
      if (muted) { beat++; return; }
      const chord = m.chords[Math.floor(beat / beatsPerChord) % m.chords.length];
      const inChord = beat % beatsPerChord;

      if (inChord === 0) {
        const dur = beatsPerChord * m.step / 1000 * 1.05;
        chord.forEach((semi) => padVoice(m.root * Math.pow(2, semi / 12), dur, m.pad, m.vol, musicGain));
      }

      /* Basso ritmico: tonica - pausa - quinta - pausa. Nota corta e
         percussiva, non una nota tenuta: è quello che dà groove. */
      if (inChord === 0 || inChord === 2) {
        const degree = inChord === 2 ? chord[Math.min(2, chord.length - 1)] : chord[0];
        const bassFreq = m.root * Math.pow(2, (degree - 12) / 12);
        tone({ freq: bassFreq, dur: m.step / 1000 * 0.55, type: m.bass, vol: m.vol, attack: 0.012, bus: musicGain, reverb: 0.15 });
      }

      if (Math.random() < 0.35) {
        const semi = chord[Math.floor(Math.random() * chord.length)] + 12;
        const freq = m.root * Math.pow(2, semi / 12);
        const pan = Math.random() < 0.5 ? -0.2 : 0.2;
        tone({ freq, dur: m.step / 1000 * 0.9, type: m.lead, vol: m.vol * 0.6, attack: 0.02, pan, bus: musicGain, reverb: 0.4 });
      }

      beat++;
    }

    tick();
    musicTimers.push(setInterval(tick, m.step));
  }

  function stopMusic() {
    musicTimers.forEach(clearInterval);
    musicTimers = [];
  }

  /* Come setMood, ma ignora la guardia "stessa mood": serve quando la
     musica va fatta ripartire davvero (es. riattivata dopo essere
     stata fermata), non solo aggiornata. */
  function restartMood(mood) {
    currentMood = null;
    setMood(mood);
  }

  CV.Audio = {
    unlock, play, setMood, restartMood, stopMusic,
    setVolume: (v) => { volume = v; if (master) master.gain.value = v; if (reverbReturn) reverbReturn.gain.value = v * 1.1; },
    getVolume: () => volume,
    setMuted: (m) => { muted = m; if (m) stopMusic(); else if (currentMood) { const c = currentMood; currentMood = null; setMood(c); } },
    isMuted: () => muted
  };
})(typeof window !== 'undefined' ? window : globalThis);
