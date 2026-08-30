/* ============================================================
   MONDO, PERSONAGGI, DIALOGHI E MISSIONI.
   Tutto dichiarativo: condizioni e azioni sono oggetti dati,
   non funzioni, cosi' il motore che li interpreta puo' essere
   riscritto in GDScript senza toccare i contenuti.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data;

  /* ---------------- ZONE ----------------
     biome  : regole di generazione del terreno
     spawns : nemici generati, con densità
     exits  : varchi verso altre zone (tx,ty in tile)
     safe   : nessun nemico, rigenerazione accelerata */
  D.zones = {
    ashford: {
      id: 'ashford', name: 'Ashford', subtitle: 'Villaggio della Valle',
      biome: 'village', w: 48, h: 48, seed: 1201, safe: true,
      music: 'calm',
      exits: [{ to: 'cindermoor', tx: 24, ty: 46, from: 'north', label: 'Brughiera di Cenere' }],
      nodes: [{ type: 'herb', tx: 8, ty: 12 }, { type: 'herb', tx: 40, ty: 9 }],
      props: [
        { kind: 'forge', tx: 31, ty: 22 },
        { kind: 'cauldron', tx: 15, ty: 22 },
        { kind: 'campfire', tx: 24, ty: 27 },
        { kind: 'sign', tx: 24, ty: 41, text: 'ASHFORD — ultimo focolare della valle' }
      ],
      chests: [{ tx: 34, ty: 15, table: 'poor' }]
    },
    cindermoor: {
      id: 'cindermoor', name: 'Brughiera di Cenere', subtitle: 'Terre Basse',
      biome: 'moor', w: 64, h: 64, seed: 4407,
      music: 'tense',
      exits: [
        { to: 'ashford', tx: 32, ty: 62, from: 'south', label: 'Ashford' },
        { to: 'blackroot', tx: 2, ty: 30, from: 'west', label: 'Bosco di Radicenera' },
        { to: 'emberdeep', tx: 60, ty: 14, from: 'east', label: 'Miniera Profonda', requires: 'mine_key',
          lockedText: 'Un cancello di ferro sbarra il pozzo. Serve la chiave della miniera.' }
      ],
      spawns: [
        { id: 'ash_wolf', count: 7 },
        { id: 'bandit', count: 5 },
        { id: 'bandit_archer', count: 2 }
      ],
      named: [{ id: 'bandit', tx: 47, ty: 46, name: 'Korr lo Sfregiato', hpMult: 2.6, dmgMult: 1.5, drop: 'mine_key', boostLoot: true }],
      nodes: [
        { type: 'herb', tx: 20, ty: 20 }, { type: 'herb', tx: 44, ty: 33 }, { type: 'herb', tx: 12, ty: 48 },
        { type: 'ore', tx: 52, ty: 24 }, { type: 'ore', tx: 18, ty: 8 }
      ],
      chests: [{ tx: 49, ty: 45, table: 'common' }, { tx: 10, ty: 14, table: 'poor' }],
      props: [{ kind: 'campfire', tx: 46, ty: 47 }, { kind: 'sign', tx: 32, ty: 58, text: 'A ovest il bosco. A est la miniera. Nessuna delle due è saggia.' }]
    },
    blackroot: {
      id: 'blackroot', name: 'Bosco di Radicenera', subtitle: 'Sotto le Fronde Morte',
      biome: 'forest', w: 64, h: 64, seed: 8813,
      music: 'tense',
      exits: [
        { to: 'cindermoor', tx: 61, ty: 32, from: 'east', label: 'Brughiera di Cenere' },
        { to: 'pyre_keep', tx: 32, ty: 3, from: 'north', label: 'Rocca del Rogo', requires: 'keep_seal',
          lockedText: 'Il portale è sigillato da un cerchio inciso. Manca il Sigillo del Rogo.' }
      ],
      spawns: [
        { id: 'cave_spider', count: 8 },
        { id: 'bandit', count: 4 },
        { id: 'bandit_archer', count: 3 },
        { id: 'ash_wolf', count: 3 }
      ],
      nodes: [
        { type: 'herb', tx: 16, ty: 20 }, { type: 'herb', tx: 30, ty: 44 }, { type: 'herb', tx: 48, ty: 18 },
        { type: 'herb', tx: 22, ty: 54 }, { type: 'ore', tx: 40, ty: 50 }
      ],
      chests: [{ tx: 20, ty: 25, table: 'common' }, { tx: 45, ty: 52, table: 'common' }]
    },
    emberdeep: {
      id: 'emberdeep', name: 'Miniera Profonda', subtitle: 'Le Vene di Braceferro',
      biome: 'cave', w: 56, h: 56, seed: 3355, dark: true,
      music: 'dread',
      exits: [{ to: 'cindermoor', tx: 28, ty: 53, from: 'south', label: 'Superficie' }],
      spawns: [
        { id: 'cave_spider', count: 9 },
        { id: 'revenant', count: 5 },
        { id: 'ash_cultist', count: 2 }
      ],
      named: [{ id: 'revenant', tx: 28, ty: 8, name: 'Il Primo Sepolto', hpMult: 2.2, dmgMult: 1.4, drop: 'keep_seal', boostLoot: true }],
      nodes: [
        { type: 'ore', tx: 14, ty: 20 }, { type: 'ore', tx: 40, ty: 26 }, { type: 'ore', tx: 22, ty: 40 },
        { type: 'ore', tx: 45, ty: 14 }, { type: 'bones', tx: 30, ty: 30 }, { type: 'bones', tx: 12, ty: 36 },
        { type: 'herb', tx: 36, ty: 44 }
      ],
      chests: [{ tx: 26, ty: 10, table: 'rich' }, { tx: 44, ty: 38, table: 'common' }, { tx: 10, ty: 12, table: 'common' }]
    },
    pyre_keep: {
      id: 'pyre_keep', name: 'Rocca del Rogo', subtitle: 'Dove la Cenere Iniziò',
      biome: 'keep', w: 48, h: 56, seed: 9091,
      music: 'dread',
      exits: [{ to: 'blackroot', tx: 24, ty: 54, from: 'south', label: 'Bosco di Radicenera' }],
      spawns: [
        { id: 'ash_cultist', count: 5 },
        { id: 'revenant', count: 4 }
      ],
      named: [{ id: 'vaelrik', tx: 24, ty: 9, name: 'Vaelrik, il Rogo', hpMult: 1, dmgMult: 1, boostLoot: true, boss: true }],
      chests: [{ tx: 12, ty: 16, table: 'rich' }, { tx: 36, ty: 16, table: 'rich' }],
      nodes: [{ type: 'bones', tx: 24, ty: 28 }]
    }
  };
  D.zoneOrder = ['ashford', 'cindermoor', 'blackroot', 'emberdeep', 'pyre_keep'];
  D.startZone = 'ashford';

  /* ---------------- MISSIONI ----------------
     Ogni stage ha un obiettivo. Tipi:
       talk    : parla con un PNG
       kill    : uccidi N nemici di un tipo (o 'any')
       collect : possiedi N unità di un oggetto
       reach   : entra in una zona
       flag    : avanzamento manuale via dialogo */
  D.quests = {
    q_main1: {
      id: 'q_main1', name: 'Cenere sulla Soglia', main: true, giver: 'maren',
      summary: 'Maren dice che i lupi scendono dalla brughiera. Nessuno scende dalla brughiera senza un motivo.',
      stages: [
        { obj: { type: 'kill', target: 'ash_wolf', count: 4 }, text: 'Abbatti 4 lupi cinerei nella Brughiera di Cenere.' },
        { obj: { type: 'talk', target: 'maren' }, text: 'Riferisci a Maren.' }
      ],
      reward: { gold: 120, xp: 90, items: [['iron_sword', 1], ['ashbloom', 3]] }
    },
    q_main2: {
      id: 'q_main2', name: 'La Chiave del Pozzo', main: true, giver: 'maren', requires: 'q_main1',
      summary: 'I banditi hanno preso la chiave della miniera. Korr lo Sfregiato la porta al collo.',
      stages: [
        { obj: { type: 'collect', target: 'mine_key', count: 1 }, text: 'Recupera la chiave da Korr lo Sfregiato, a est della brughiera.' },
        { obj: { type: 'reach', target: 'emberdeep' }, text: 'Scendi nella Miniera Profonda.' },
        { obj: { type: 'collect', target: 'ash_heart', count: 1 }, text: 'Recupera un Cuore di Cenere dalle profondità.' },
        { obj: { type: 'talk', target: 'maren' }, text: 'Porta il Cuore a Maren.' }
      ],
      reward: { gold: 260, xp: 220, items: [['steel_ingot', 3], ['hearth_charm', 1]] }
    },
    q_main3: {
      id: 'q_main3', name: 'Il Sigillo del Rogo', main: true, auto: true, giver: 'maren', requires: 'q_main2',
      summary: 'Il Primo Sepolto custodisce il sigillo che apre la Rocca. Riposava. Non riposa più.',
      stages: [
        { obj: { type: 'collect', target: 'keep_seal', count: 1 }, text: 'Strappa il Sigillo del Rogo al Primo Sepolto, in fondo alla miniera.' },
        { obj: { type: 'reach', target: 'pyre_keep' }, text: 'Attraversa il bosco e apri la Rocca del Rogo.' }
      ],
      reward: { gold: 300, xp: 300, items: [['ember_ore', 4]] }
    },
    q_main4: {
      id: 'q_main4', name: 'Il Rogo', main: true, giver: 'maren', requires: 'q_main3',
      summary: 'Vaelrik ha acceso la valle credendo di purificarla. Brucia ancora, e non ha finito.',
      stages: [
        { obj: { type: 'kill', target: 'vaelrik', count: 1 }, text: 'Poni fine a Vaelrik, il Rogo.' },
        { obj: { type: 'talk', target: 'maren' }, text: 'Torna ad Ashford.' }
      ],
      reward: { gold: 1000, xp: 900, items: [['pyre_fang', 1], ['ash_eye', 1]] }
    },
    q_wolves: {
      id: 'q_wolves', name: 'Zanne per Bram', giver: 'bram',
      summary: 'Bram compra zanne di lupo. Non chiede perché tu ne abbia.',
      stages: [{ obj: { type: 'collect', target: 'wolf_fang', count: 5 }, text: 'Raccogli 5 zanne di lupo.' }],
      reward: { gold: 90, xp: 60, items: [['leather_jack', 1]], take: [['wolf_fang', 5]] }
    },
    q_iron: {
      id: 'q_iron', name: 'Ferro per la Fucina', giver: 'torvald',
      summary: 'Torvald non batte il ferro che non ha.',
      stages: [{ obj: { type: 'collect', target: 'iron_ore', count: 6 }, text: 'Porta 6 minerali di ferro a Torvald.' }],
      reward: { gold: 70, xp: 55, items: [['iron_ingot', 3], ['strips', 4]], take: [['iron_ore', 6]] }
    },
    q_herbs: {
      id: 'q_herbs', name: 'Il Cardo Giusto', giver: 'ilsa',
      summary: 'Ilsa cerca cardo di brace. Cresce dove il terreno è ancora tiepido.',
      stages: [{ obj: { type: 'collect', target: 'emberthistle', count: 3 }, text: 'Raccogli 3 Cardi di Brace.' }],
      reward: { gold: 80, xp: 70, items: [['ether_sigil', 1]], take: [['emberthistle', 3]] }
    },
    q_bandits: {
      id: 'q_bandits', name: 'Marchi di Sangue', giver: 'maren', requires: 'q_main1',
      summary: 'Ogni bandito porta un marchio. Maren li conta.',
      stages: [{ obj: { type: 'collect', target: 'bandit_mark', count: 5 }, text: 'Raccogli 5 Marchi dei Banditi.' }],
      reward: { gold: 200, xp: 140, items: [['bear_totem', 1]], take: [['bandit_mark', 5]] }
    }
  };

  /* ---------------- PERSONAGGI NON GIOCANTI ---------------- */
  D.npcs = {
    maren: {
      id: 'maren', name: 'Maren', title: 'Capovillaggio', sprite: 'n_maren',
      zone: 'ashford', tx: 24, ty: 20, color: '#c9a6ff'
    },
    torvald: {
      id: 'torvald', name: 'Torvald', title: 'Fabbro', sprite: 'n_smith',
      zone: 'ashford', tx: 30, ty: 23, color: '#f06c3a', shop: 'smith'
    },
    ilsa: {
      id: 'ilsa', name: 'Ilsa', title: 'Erborista', sprite: 'n_herb',
      zone: 'ashford', tx: 16, ty: 23, color: '#7cc46a', shop: 'alchemy'
    },
    bram: {
      id: 'bram', name: 'Vecchio Bram', title: 'Cacciatore', sprite: 'n_hunter',
      zone: 'ashford', tx: 20, ty: 32, color: '#a5713f', shop: 'general'
    }
  };

  /* ---------------- MERCANTI ---------------- */
  D.shops = {
    smith: {
      name: 'Fucina di Torvald', buyMult: 1.0, sellMult: 0.4,
      stock: ['iron_sword', 'iron_axe', 'hunter_dagger', 'steel_sword', 'leather_jack', 'chainmail', 'iron_ingot', 'coal', 'strips', 'leather']
    },
    alchemy: {
      name: 'Banco di Ilsa', buyMult: 1.0, sellMult: 0.5,
      stock: ['ashbloom', 'palemoss', 'glowcap', 'blackroot', 'emberthistle', 'frostpetal', 'ether_sigil']
    },
    general: {
      name: 'Scorte di Bram', buyMult: 1.0, sellMult: 0.45,
      stock: ['torch', 'lockpick', 'pelt', 'wolf_fang', 'nightcrown', 'beetlewing', 'wind_ring']
    }
  };

  /* ---------------- DIALOGHI ----------------
     Il primo nodo la cui `cond` è soddisfatta diventa la radice.
     cond  : { questActive, questStage:[id,n], questDone, questAvailable, hasItem:[id,n], flag, not:{...} }
     act   : eseguita quando l'opzione viene scelta */
  D.dialogue = {
    maren: [
      { id: 'm_end', cond: { questDone: 'q_main4' },
        say: 'La cenere si sta posando, viandante. Per la prima volta da anni, il cielo sopra Ashford ha un colore.',
        opts: [
          { text: 'E adesso?', to: 'm_end2' },
          { text: '(Congedarsi)', act: { close: true } }
        ] },
      { id: 'm_end2', sub: true, say: 'Adesso si ricostruisce. È un lavoro più lento e più noioso di quello che hai fatto tu. Ma dura di più.',
        opts: [{ text: '(Congedarsi)', act: { close: true } }] },

      { id: 'm_m4_wait', cond: { questStage: ['q_main4', 0] },
        say: 'Vaelrik è ancora là. Lo sento nell\'aria: sa di ferro caldo.',
        opts: [{ text: 'Ci sto andando.', act: { close: true } }] },
      { id: 'm_m4_done', cond: { questStage: ['q_main4', 1] },
        say: 'È finita. Lo leggo dalla tua faccia prima ancora che tu parli.',
        opts: [{ text: 'È finita.', act: { advance: 'q_main4', close: true } }] },
      { id: 'm_m4_give', cond: { questAvailable: 'q_main4' },
        say: 'La Rocca è aperta. Dentro c\'è l\'uomo che ha acceso la valle credendo di guarirla. Non tornerà indietro da solo.',
        opts: [
          { text: 'Chi era, prima?', to: 'm_m4_lore' },
          { text: 'Andrò io.', cls: 'quest', act: { startQuest: 'q_main4', close: true } }
        ] },
      { id: 'm_m4_lore', sub: true, say: 'Era il nostro protettore. Poi ha deciso che la cenere era una cura, e noi la malattia. Le cose peggiori cominciano quasi sempre da una buona intenzione.',
        opts: [{ text: 'Andrò io.', cls: 'quest', act: { startQuest: 'q_main4', close: true } }] },

      { id: 'm_m3_prog', cond: { questActive: 'q_main3' },
        say: 'Il Primo Sepolto ha il sigillo. Portalo al portale a nord del bosco.',
        opts: [{ text: 'Sto andando.', act: { close: true } }] },
      { id: 'm_m3_give', cond: { questAvailable: 'q_main3' },
        say: 'Il Cuore che mi hai portato pulsa ancora. Viene dalla Rocca del Rogo, e la Rocca è sigillata. Serve il Sigillo: lo tiene il Primo Sepolto, in fondo alla miniera.',
        opts: [{ text: 'Lo prenderò.', cls: 'quest', act: { startQuest: 'q_main3', close: true } }] },

      { id: 'm_m2_turn', cond: { questStage: ['q_main2', 3] },
        say: 'Fammi vedere... Sì. È questo che marcisce sotto la valle.',
        opts: [{ text: 'Consegnare il Cuore di Cenere.', cls: 'quest', act: { advance: 'q_main2', close: true } }] },
      { id: 'm_m2_prog', cond: { questActive: 'q_main2' },
        say: 'Korr lo Sfregiato ha la chiave. È accampato a est, dove la brughiera si alza.',
        opts: [{ text: 'Torno presto.', act: { close: true } }] },
      { id: 'm_m2_give', cond: { questAvailable: 'q_main2' },
        say: 'Quattro lupi in meno. Ma i lupi erano il sintomo. Qualcosa sotto la miniera li spinge fuori dalle tane, e i banditi hanno rubato la chiave del pozzo.',
        opts: [
          { text: 'Quanto è profonda la miniera?', to: 'm_m2_lore' },
          { text: 'Recupererò la chiave.', cls: 'quest', act: { startQuest: 'q_main2', close: true } }
        ] },
      { id: 'm_m2_lore', sub: true, say: 'Più di quanto sia stata scavata. Ecco il problema.',
        opts: [{ text: 'Recupererò la chiave.', cls: 'quest', act: { startQuest: 'q_main2', close: true } }] },

      { id: 'm_m1_turn', cond: { questStage: ['q_main1', 1] },
        say: 'Li hai contati? Bene. Adesso conta quante notti sono passate da quando hanno cominciato a scendere.',
        opts: [{ text: 'Riferire dei lupi.', cls: 'quest', act: { advance: 'q_main1', close: true } }] },
      { id: 'm_m1_prog', cond: { questActive: 'q_main1' },
        say: 'I lupi sono nella brughiera, a nord del villaggio. Quattro dovrebbero bastare a capire.',
        opts: [{ text: 'Vado.', act: { close: true } }] },
      { id: 'm_bandit_side', cond: { questAvailable: 'q_bandits' },
        say: 'Un\'altra cosa, già che ci sei. I banditi portano un marchio inciso. Portamene cinque e considera il villaggio in debito.',
        opts: [
          { text: 'Accetto.', cls: 'quest', act: { startQuest: 'q_bandits', close: true } },
          { text: 'Non ora.', act: { close: true } }
        ] },
      { id: 'm_bandit_turn', cond: { questReady: 'q_bandits' },
        say: 'Cinque marchi. Cinque persone che non torneranno a casa. Nessuno qui è felice, ma tutti dormiranno meglio.',
        opts: [{ text: 'Consegnare i marchi.', cls: 'quest', act: { advance: 'q_bandits', close: true } }] },
      { id: 'm_start', say: 'Sei arrivato camminando, con quella spada, e non sei scappato quando hai visto il cielo. Questo qui basta per essere assunti.',
        opts: [
          { text: 'Cos\'è successo alla valle?', to: 'm_lore1' },
          { text: 'Cosa ti serve?', cls: 'quest', act: { startQuest: 'q_main1' }, to: 'm_task' }
        ] },
      { id: 'm_lore1', sub: true, say: 'Sette anni fa la Rocca a nord si è accesa e non si è più spenta. Da allora piove cenere. I raccolti sono grigi, i lupi sono affamati, e la gente se ne va.',
        opts: [{ text: 'Cosa ti serve?', cls: 'quest', act: { startQuest: 'q_main1' }, to: 'm_task' }] },
      { id: 'm_task', sub: true, say: 'I lupi scendono dalla brughiera, e non è la fame a spingerli: è la paura. Abbattine quattro e guarda che aspetto hanno. Poi torna.',
        opts: [{ text: 'Ci penso io.', act: { close: true } }] }
    ],

    torvald: [
      { id: 't_turn', cond: { questReady: 'q_iron' },
        say: 'Ferro vero. Non quella ruggine che portano gli altri. Tieni, te lo cambio in lingotti e strisce.',
        opts: [{ text: 'Consegnare il minerale.', cls: 'quest', act: { advance: 'q_iron', close: true } }] },
      { id: 't_hub', cond: { questActive: 'q_iron' },
        say: 'Sei minerali. Li trovi nei filoni scuri, su nella brughiera o giù nel pozzo.',
        opts: [
          { text: 'Usa la fucina.', act: { smith: true } },
          { text: 'Mostrami la merce.', act: { shop: 'smith' } },
          { text: 'Ripasso.', act: { close: true } }
        ] },
      { id: 't_offer', cond: { questAvailable: 'q_iron' },
        say: 'Se vuoi un\'arma decente mi serve materiale. Portami sei minerali di ferro e la fucina è tua quando vuoi.',
        opts: [
          { text: 'Ti porto il ferro.', cls: 'quest', act: { startQuest: 'q_iron', close: true } },
          { text: 'Usa la fucina.', act: { smith: true } },
          { text: 'Mostrami la merce.', act: { shop: 'smith' } }
        ] },
      { id: 't_main', say: 'La fucina è accesa. Batti quello che ti serve, ma non lamentarti del caldo.',
        opts: [
          { text: 'Usa la fucina.', act: { smith: true } },
          { text: 'Mostrami la merce.', act: { shop: 'smith' } },
          { text: 'Come si migliora un\'arma?', to: 't_tip' },
          { text: 'Nulla, grazie.', act: { close: true } }
        ] },
      { id: 't_tip', sub: true, say: 'Alla fucina, scheda "Tempra". Serve un lingotto e del carbone, e serve mano ferma: più sale la tua Fabbrilità, più il pezzo tiene la tempra.',
        opts: [{ text: 'Capito.', act: { close: true } }] }
    ],

    ilsa: [
      { id: 'i_turn', cond: { questReady: 'q_herbs' },
        say: 'Tre cardi, e nessuno bruciacchiato. Sai già cosa fai.',
        opts: [{ text: 'Consegnare i cardi.', cls: 'quest', act: { advance: 'q_herbs', close: true } }] },
      { id: 'i_offer', cond: { questAvailable: 'q_herbs' },
        say: 'Il Cardo di Brace cresce dove il suolo è ancora tiepido. Me ne servono tre, e in cambio ti do qualcosa che ti terrà l\'etere pieno.',
        opts: [
          { text: 'Te li porto.', cls: 'quest', act: { startQuest: 'q_herbs', close: true } },
          { text: 'Usa il calderone.', act: { alchemy: true } },
          { text: 'Cosa vendi?', act: { shop: 'alchemy' } }
        ] },
      { id: 'i_main', say: 'Due erbe, un calderone. Se hanno una virtù in comune, quella virtù finisce nella boccetta. Se non ce l\'hanno, hai solo sprecato due erbe.',
        opts: [
          { text: 'Usa il calderone.', act: { alchemy: true } },
          { text: 'Cosa vendi?', act: { shop: 'alchemy' } },
          { text: 'Come faccio a sapere gli effetti?', to: 'i_tip' },
          { text: 'A dopo.', act: { close: true } }
        ] },
      { id: 'i_tip', sub: true, say: 'Assaggiandole. Mangia un\'erba e ne scopri la prima virtù; mescolala con successo e ne impari altre. Con l\'esperienza le vedrai tutte prima ancora di toccarle.',
        opts: [{ text: 'Proverò.', act: { close: true } }] }
    ],

    bram: [
      { id: 'b_turn', cond: { questReady: 'q_wolves' },
        say: 'Cinque zanne. Non chiedo come. Tieni, questa giubba era di mio figlio: a lui non serve più e a te sì.',
        opts: [{ text: 'Consegnare le zanne.', cls: 'quest', act: { advance: 'q_wolves', close: true } }] },
      { id: 'b_offer', cond: { questAvailable: 'q_wolves' },
        say: 'Compro zanne di lupo. Cinque, e ti do qualcosa da metterti addosso che non sia straccio.',
        opts: [
          { text: 'Affare fatto.', cls: 'quest', act: { startQuest: 'q_wolves', close: true } },
          { text: 'Fammi vedere le scorte.', act: { shop: 'general' } }
        ] },
      { id: 'b_main', say: 'Cacciavo, prima. Adesso vendo agli altri quello che serve per cacciare. È meno faticoso e si dorme di più.',
        opts: [
          { text: 'Fammi vedere le scorte.', act: { shop: 'general' } },
          { text: 'Consigli per la brughiera?', to: 'b_tip' },
          { text: 'Passo dopo.', act: { close: true } }
        ] },
      { id: 'b_tip', sub: true, say: 'Il lupo carica dritto: schivalo di lato, non indietro. Il bandito alza l\'arma prima di colpire: quello è il momento di parare. E se senti un arco tendersi, mettici un albero in mezzo.',
        opts: [{ text: 'Terrò a mente.', act: { close: true } }] }
    ]
  };

  /* ---------------- Suggerimenti a schermo ---------------- */
  D.tips = [
    'Parare all\'ultimo istante respinge il colpo e stordisce il nemico.',
    'Le abilità salgono usandole: colpisci di lama per migliorare la Lama.',
    'Schivare costa vigore, ma per un istante sei intoccabile.',
    'Due erbe con una virtù in comune fanno una pozione. Le altre virtù vanno perse.',
    'Il peso trasportato oltre il limite ti rallenta.',
    'I filoni e i cespugli ricrescono col tempo.',
    'Alla fucina puoi temprare l\'arma che hai già, non solo forgiarne di nuove.'
  ];
})(typeof window !== 'undefined' ? window : globalThis);
