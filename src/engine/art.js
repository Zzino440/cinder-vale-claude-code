/* ============================================================
   ARTE: palette, sprite in pixel art, tile procedurali, icone.
   LIVELLO MOTORE - dipende dal canvas. In Godot questo file
   viene sostituito da veri PNG/AtlasTexture.
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});

  /* Asset moderni ad alta densita'. La logica del gioco continua a usare
     coordinate da 16 px, ma questi PNG conservano due pixel grafici per
     ogni unita' del mondo. Se un file manca, il renderer usa gli sprite
     procedurali storici: il gioco resta sempre avviabile. */
  const HD_PATHS = {
    house: 'assets/hd/runtime/ashford-house.png',
    hero: 'assets/hd/runtime/traveler-atlas.png',
    attack: 'assets/hd/runtime/traveler-attack-atlas.png',
    defense: 'assets/hd/runtime/traveler-defense-atlas.png',
    actions: 'assets/hd/runtime/traveler-mobility-magic-atlas.png',
    defeat: 'assets/hd/runtime/traveler-defeat-atlas.png',
    shrine: 'assets/hd/runtime/hearth-shrine.png',
    handcart: 'assets/hd/runtime/handcart.png',
    woodpile: 'assets/hd/runtime/woodpile.png',
    wall: 'assets/hd/runtime/stone-wall.png',
    barrel: 'assets/hd/runtime/barrel.png',
    crate: 'assets/hd/runtime/crate.png',
    terrain: 'assets/hd/runtime/ashford-terrain-atlas.jpg'
  };
  const HD = {};
  let hdLoaded = false;

  function loadHdAssets() {
    const embedded = root.CV_EMBEDDED_ASSETS || {};
    const jobs = Object.keys(HD_PATHS).map((key) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { HD[key] = img; resolve(); };
      img.onerror = () => resolve();
      img.src = embedded[key] || HD_PATHS[key];
    }));
    return Promise.all(jobs).then(() => { hdLoaded = true; });
  }

  function hdReady() { return hdLoaded && !!(HD.house && HD.hero && HD.terrain); }
  function hdImage(key, width, height) {
    const source = HD[key];
    if (!source) return null;
    return { hd: true, source: source, sx: 0, sy: 0, sw: source.width, sh: source.height, width: width, height: height };
  }
  function hdHouse() { return hdImage('house', 88, 80); }
  function hdProp(key) {
    const sizes = {
      shrine: [60, 55], handcart: [48, 32], woodpile: [36, 28],
      wall: [64, 24], barrel: [24, 28], crate: [24, 24]
    };
    const size = sizes[key];
    return size ? hdImage(key, size[0], size[1]) : null;
  }
  function hdHeroFrame(direction, frame) {
    if (!HD.hero) return null;
    const col = direction === 'up' ? 2 : (direction === 'side' ? 1 : 0);
    const row = frame ? 1 : 0;
    return { hd: true, source: HD.hero, sx: col * 40, sy: row * 56, sw: 40, sh: 56, width: 20, height: 28 };
  }
  function hdCombatFrame(kind, frame) {
    const specs = {
      attack: { key: 'attack', cols: 4, fw: 96, fh: 64, width: 48, height: 32, row: 0 },
      defense: { key: 'defense', cols: 4, fw: 80, fh: 64, width: 40, height: 32, row: 0 },
      dodge: { key: 'actions', cols: 3, fw: 80, fh: 64, width: 40, height: 32, row: 0 },
      cast: { key: 'actions', cols: 3, fw: 80, fh: 64, width: 40, height: 32, row: 1 },
      defeat: { key: 'defeat', cols: 3, fw: 96, fh: 64, width: 48, height: 32, row: 0 }
    };
    const spec = specs[kind];
    if (!spec || !HD[spec.key]) return null;
    const index = Math.max(0, Math.min(spec.cols - 1, frame | 0));
    return {
      hd: true, source: HD[spec.key], sx: index * spec.fw, sy: spec.row * spec.fh,
      sw: spec.fw, sh: spec.fh, width: spec.width, height: spec.height
    };
  }
  function hdTile(key, tx, ty) {
    if (!HD.terrain) return null;
    const material = key === 'path' ? 0
      : (key === 'grass' || key === 'ash_grass') ? 1
        : key === 'village_wall' ? 2 : 3;
    return {
      source: HD.terrain,
      sx: material * 128 + ((tx * 37 + ty * 17) & 96),
      sy: ((tx * 11 + ty * 29) & 96), sw: 32, sh: 32
    };
  }

  /* ---------------- Palette ----------------
     Un carattere = un colore. '.' = trasparente. */
  const PAL = {
    '.': null,
    /* Contorno: non nero puro ma un viola-cenere molto scuro. Il nero
       assoluto è la firma grafica degli 8 bit; un contorno tinto si posa
       sul fondo invece di ritagliare la figura. */
    k: '#191426', K: '#26203a',
    s: '#e0b088', S: '#c08a63',      /* pelle */
    h: '#3b2b20', H: '#5b4330',      /* capelli */
    c: '#6b4a30', C: '#4a3324',      /* stoffa */
    l: '#a5713f', L: '#7a5028',      /* cuoio */
    m: '#9aa2b0', M: '#5a5f6b',      /* metallo */
    o: '#cfd6e2',                    /* metallo lucido */
    b: '#2e2119',                    /* stivali */
    r: '#a03030', R: '#6b1f1f',      /* rosso */
    g: '#57705a', G: '#7d8a84',      /* pelo grigio-verde */
    e: '#2f6b3f', E: '#1c4227',      /* verde */
    f: '#f06c3a', F: '#a5451f',      /* fuoco */
    d: '#ffd166', D: '#c99a35',      /* oro */
    j: '#6fb3ff', J: '#2f5c9e',      /* blu */
    v: '#a06fd1', V: '#5f3d84',      /* viola */
    w: '#f2f0f5',                    /* bianco */
    n: '#4a4358', N: '#2a2430',      /* grigio scuro */
    y: '#6b8f2f',                    /* verde veleno */
    x: '#8f96a3',                    /* pietra */
    z: '#3a3242'                     /* ombra */
  };

  /* ---------------- Sprite ----------------
     Le righe vengono normalizzate a 16 colonne automaticamente,
     quindi un carattere in piu' o in meno non rompe il disegno. */
  const SPR = {};

  /* ===== Giocatore ===== */
  SPR.p_down_0 = [
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '....hssssssh....',
    '....hswssswh....',
    '....kssssssk....',
    '......ssss......',
    '...klcccccclk...',
    '..klsccccccslk..',
    '..klsccccccslk..',
    '...kCCCCCCCCk...',
    '....cccccccc....',
    '....cccccccc....',
    '....kcc..cck....',
    '....kbb..bbk....',
    '.....bb..bb.....'
  ];
  SPR.p_down_1 = [
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '....hssssssh....',
    '....hswssswh....',
    '....kssssssk....',
    '......ssss......',
    '...klcccccclk...',
    '..klsccccccslk..',
    '...lsccccccsl...',
    '...kCCCCCCCCk...',
    '....cccccccc....',
    '....cccccccc....',
    '...kcc....cck...',
    '...kbb....bbk...',
    '...bb......bb...'
  ];
  SPR.p_up_0 = [
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '....khhhhhhk....',
    '......cccc......',
    '...klcccccclk...',
    '..klsccccccslk..',
    '..klsccccccslk..',
    '...kCCCCCCCCk...',
    '....cccccccc....',
    '....cccccccc....',
    '....kcc..cck....',
    '....kbb..bbk....',
    '.....bb..bb.....'
  ];
  SPR.p_up_1 = [
    '................',
    '.....kkkkkk.....',
    '....khhhhhhk....',
    '....hhhhhhhh....',
    '....hhhhhhhh....',
    '....khhhhhhk....',
    '......cccc......',
    '...klcccccclk...',
    '..klsccccccslk..',
    '...lsccccccsl...',
    '...kCCCCCCCCk...',
    '....cccccccc....',
    '....cccccccc....',
    '...kcc....cck...',
    '...kbb....bbk...',
    '...bb......bb...'
  ];
  SPR.p_side_0 = [
    '................',
    '.....kkkkk......',
    '....khhhhhk.....',
    '....hhssssk.....',
    '....hhswsk......',
    '....khsssk......',
    '.....kssk.......',
    '....klccclk.....',
    '...klscccclk....',
    '....lscccccl....',
    '....kCCCCCk.....',
    '.....cccccc.....',
    '.....cccccc.....',
    '.....kcckcc.....',
    '.....kbbkbb.....',
    '.....bb..bb.....'
  ];
  SPR.p_side_1 = [
    '................',
    '.....kkkkk......',
    '....khhhhhk.....',
    '....hhssssk.....',
    '....hhswsk......',
    '....khsssk......',
    '.....kssk.......',
    '....klccclk.....',
    '...klscccclk....',
    '....lscccccl....',
    '....kCCCCCk.....',
    '.....cccccc.....',
    '.....cccccc.....',
    '....kcc..cck....',
    '....kbb...bb....',
    '...bbb.....bb...'
  ];

  /* ===== Personaggi non giocanti (base neutra, ricolorata) ===== */
  SPR.npc = [
    '................',
    '.....kkkkkk.....',
    '....kHHHHHHk....',
    '....HssssssH....',
    '....Hswssswh....',
    '....kssssssk....',
    '......ssss......',
    '...kcccccccck...',
    '..kcsccccccsck..',
    '..kcsccccccsck..',
    '...kCCCCCCCCk...',
    '....CCCCCCCC....',
    '....cccccccc....',
    '....kcc..cck....',
    '....kbb..bbk....',
    '.....bb..bb.....'
  ];

  /* ===== Nemici ===== */
  SPR.e_wolf = [
    '................',
    '................',
    '..k..........k..',
    '.kGk........kGk.',
    '.kGGkkkkkkkkGGk.',
    'kGGGGGGGGGGGGGGk',
    'kGwGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGk',
    'kGGGGGGGGGGGGGGk',
    '.kGGGGGGGGGGGGk.',
    '..kGGkkkkkkGGk..',
    '..kGk......kGk..',
    '..kGk......kGk..',
    '..kkk......kkk..',
    '................',
    '................'
  ];
  SPR.e_bandit = [
    '................',
    '.....kkkkkk.....',
    '....kRRRRRRk....',
    '....RSSSSSSR....',
    '....RSrssrSR....',
    '....kSSSSSSk....',
    '......SSSS......',
    '...kLCCCCCCLk...',
    '..kLSCCCCCCSLk..',
    '..kLSCCCCCCSLk..',
    '...kbbbbbbbbk...',
    '....CCCCCCCC....',
    '....CCCCCCCC....',
    '....kCC..CCk....',
    '....kbb..bbk....',
    '.....bb..bb.....'
  ];
  SPR.e_archer = [
    '................',
    '.....kkkkkk.....',
    '....kEEEEEEk....',
    '....ESSSSSSE....',
    '....ESrssrSE....',
    '....kSSSSSSk....',
    '......SSSS......',
    '...kLEEEEEELk...',
    '..kLSEEEEEESLk..',
    '..kLSEEEEEESLk..',
    '...kbbbbbbbbk...',
    '....EEEEEEEE....',
    '....EEEEEEEE....',
    '....kEE..EEk....',
    '....kbb..bbk....',
    '.....bb..bb.....'
  ];
  SPR.e_spider = [
    '................',
    '................',
    '.k...........k..',
    '..k....k....k...',
    '...kk.kkk.kk....',
    '..kkNNNNNNNkk...',
    '.kNNNNNNNNNNNk..',
    'kNNrNNNNNNrNNNk.',
    'kNNNNNNNNNNNNNk.',
    '.kNNNNNNNNNNNk..',
    '..kkNNNNNNNkk...',
    '...kk.kkk.kk....',
    '..k....k....k...',
    '.k...........k..',
    '................',
    '................'
  ];
  SPR.e_revenant = [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '....wwwwwwww....',
    '....wfwwwwfw....',
    '....kwwwwwwk....',
    '.....kwwwwk.....',
    '...kNNNNNNNNk...',
    '..kNwNNNNNNwNk..',
    '..kNwNNNNNNwNk..',
    '...kNNNNNNNNk...',
    '....NwNNNNwN....',
    '....NNNNNNNN....',
    '....kNN..NNk....',
    '....kww..wwk....',
    '.....ww..ww.....'
  ];
  SPR.e_cultist = [
    '................',
    '......kkkk......',
    '.....kVVVVk.....',
    '....kVVVVVVk....',
    '....VVfVVfVV....',
    '....kVVVVVVk....',
    '...kVVVVVVVVk...',
    '..kVVVVVVVVVVk..',
    '..kVVVfffVVVVk..',
    '..kVVVfffVVVVk..',
    '..kVVVVVVVVVVk..',
    '..kVVVVVVVVVVk..',
    '...kVVVVVVVVk...',
    '...kVVVVVVVVk...',
    '....kkkkkkkk....',
    '................'
  ];
  /* Il boss e' 24x24 */
  SPR.e_boss = {
    w: 24, h: 24, rows: [
      '........................',
      '.........kkkkkk.........',
      '.......kkFFFFFFkk.......',
      '......kFFFFFFFFFFk......',
      '.....kFFfffffffFFFk.....',
      '.....kFFdffdffdFFFk.....',
      '.....kFFFFFFFFFFFFk.....',
      '......kFFFFFFFFFFk......',
      '....kkkkFFFFFFFFkkkk....',
      '..kkRRRRRRRRRRRRRRRRkk..',
      '.kRRRRRfffffffffRRRRRRk.',
      'kRRRRRffdddddddffRRRRRRk',
      'kRRRRRfdddwwwdddfRRRRRRk',
      'kRRRRRffdddddddffRRRRRRk',
      '.kRRRRRfffffffffRRRRRRk.',
      '..kRRRRRRRRRRRRRRRRRRk..',
      '...kRRRRRRRRRRRRRRRRk...',
      '....kRRRRRRRRRRRRRRk....',
      '.....kRRRRRRRRRRRRk.....',
      '.....kRRRRk..kRRRRk.....',
      '.....kRRRRk..kRRRRk.....',
      '.....kkkkkk..kkkkkk.....',
      '........................',
      '........................'
    ]
  };

  /* ===== Oggetti del mondo ===== */
  SPR.chest = [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '.kLLLLLLLLLLLLk.',
    '.kLdddddddddLLk.',
    '.kLLLLLLLLLLLLk.',
    '.kkkkkkkkkkkkkk.',
    '.kLLLLLdkLLLLLk.',
    '.kLLLLLdkLLLLLk.',
    '.kLLLLLLLLLLLLk.',
    '.kLLLLLLLLLLLLk.',
    '.kkkkkkkkkkkkkk.',
    '..k..........k..',
    '................',
    '................',
    '................'
  ];
  SPR.chest_open = [
    '................',
    '..kkkkkkkkkkkk..',
    '.kLLLLLLLLLLLLk.',
    '.kLdddddddddLLk.',
    '.kkkkkkkkkkkkkk.',
    '................',
    '.kkkkkkkkkkkkkk.',
    '.kLdddddddddddk.',
    '.kLdddddddddddk.',
    '.kLLLLLLLLLLLLk.',
    '.kLLLLLLLLLLLLk.',
    '.kkkkkkkkkkkkkk.',
    '..k..........k..',
    '................',
    '................',
    '................'
  ];
  SPR.node_herb = [
    '................',
    '................',
    '.......e........',
    '....e..e..e.....',
    '....ee.e.ee.....',
    '.....eeeee......',
    '..e...eee...e...',
    '..ee.eeeee.ee...',
    '...eeeeeeeee....',
    '....eeeeeee.....',
    '.....eeeee......',
    '......ekE.......',
    '......kEk.......',
    '.....kkEkk......',
    '................',
    '................'
  ];
  SPR.node_ore = [
    '................',
    '................',
    '.......kk.......',
    '.....kkxxkk.....',
    '....kxxxxxxk....',
    '...kxxdxxdxxk...',
    '..kxxxxxxxxxxk..',
    '..kxdxxxxxxdxk..',
    '..kxxxxxxxxxxk..',
    '..kxxxdxxxxxxk..',
    '...kxxxxxxxxk...',
    '....kkxxxxkk....',
    '......kkkk......',
    '................',
    '................',
    '................'
  ];
  SPR.node_bone = [
    '................',
    '................',
    '................',
    '....w.....w.....',
    '...www...www....',
    '....wwwwwww.....',
    '.....wwwww......',
    '...wwwwwwwww....',
    '..www.....www...',
    '..w.........w...',
    '....wwwwwww.....',
    '...w.......w....',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.campfire = [
    '................',
    '................',
    '.......f........',
    '......fdf.......',
    '.....fdddf......',
    '.....fdwdf......',
    '....ffdddff.....',
    '....fffffff.....',
    '.....fffff......',
    '...kLLLLLLLk....',
    '..kLLkLLLkLLk...',
    '..kLLLLLLLLLk...',
    '...kkkkkkkkk....',
    '................',
    '................',
    '................'
  ];
  SPR.forge = [
    '................',
    '..kkkkkkkkkkkk..',
    '..kMMMMMMMMMMk..',
    '..kMxxxxxxxxMk..',
    '..kMxffffffxMk..',
    '..kMxfddddfxMk..',
    '..kMxffffffxMk..',
    '..kMxxxxxxxxMk..',
    '..kMMMMMMMMMMk..',
    '..kkMMMMMMMMkk..',
    '...kLLLLLLLLk...',
    '...kLLLLLLLLk...',
    '...kkkkkkkkkk...',
    '................',
    '................',
    '................'
  ];
  SPR.cauldron = [
    '................',
    '................',
    '.....k....k.....',
    '......kkkk......',
    '..kkkkkkkkkkkk..',
    '..kNeeeeeeeeNk..',
    '..kNeeggeegeNk..',
    '..kNNNNNNNNNNk..',
    '..kNNNNNNNNNNk..',
    '...kNNNNNNNNk...',
    '....kNNNNNNk....',
    '.....kkkkkk.....',
    '.....k....k.....',
    '....k......k....',
    '................',
    '................'
  ];
  SPR.sign = [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '..kLLLLLLLLLLk..',
    '..kLkkkkkkkkLk..',
    '..kLkLLLLLLkLk..',
    '..kLkkkkkkkkLk..',
    '..kLLLLLLLLLLk..',
    '..kkkkkkkkkkkk..',
    '......kLLk......',
    '......kLLk......',
    '......kLLk......',
    '.....kkLLkk.....',
    '................',
    '................',
    '................'
  ];
  SPR.portal = [
    '......dddd......',
    '....ddffffdd....',
    '...dffffffffd...',
    '..dffkkkkkkffd..',
    '..dffkkkkkkffd..',
    '.dffkkkkkkkkffd.',
    '.dffkkkkkkkkffd.',
    '.dffkkkkkkkkffd.',
    '.dffkkkkkkkkffd.',
    '.dffkkkkkkkkffd.',
    '..dffkkkkkkffd..',
    '..dffkkkkkkffd..',
    '...dffkkkkffd...',
    '....ddffffdd....',
    '......dddd......',
    '................'
  ];
  SPR.gate = [
    'MMMMMMMMMMMMMMMM',
    'MkkMkkkkkkkkMkkM',
    'MkkMkkkkkkkkMkkM',
    'MMMMMMMMMMMMMMMM',
    'MkkMkkkkkkkkMkkM',
    'MkkMkkkkkkkkMkkM',
    'MMMMMMMMMMMMMMMM',
    'MkkMkkkkkkkkMkkM',
    'MkkMkkkkkkkkMkkM',
    'MMMMMMMMMMMMMMMM',
    'MkkMkkkkkkkkMkkM',
    'MkkMkkkkkkkkMkkM',
    'MMMMMMMMMMMMMMMM',
    'MkkMkkkkkkkkMkkM',
    'MkkMkkkkkkkkMkkM',
    'MMMMMMMMMMMMMMMM'
  ];

  /* ===== Icone oggetti (16x16, ricolorabili) ===== */
  SPR.ic_sword = [
    '..............o.',
    '.............ooo',
    '............oooo',
    '...........oooo.',
    '..........oooo..',
    '.........oooo...',
    '........oooo....',
    '.......oooo.....',
    '......oooo......',
    '.....oooo.......',
    '..d.ooo.........',
    '.ddd.o..........',
    'ldddd...........',
    'llld............',
    'lld.............',
    'ld..............'
  ];
  SPR.ic_axe = [
    '................',
    '......oooo......',
    '.....ooooooo....',
    '....oooooooooo..',
    '....oooooooooo..',
    '....ooo...oooo..',
    '.....o.....ooo..',
    '.....l.....oo...',
    '.....l..........',
    '.....l..........',
    '.....l..........',
    '.....l..........',
    '.....l..........',
    '.....l..........',
    '.....l..........',
    '................'
  ];
  SPR.ic_dagger = [
    '................',
    '............o...',
    '...........ooo..',
    '..........ooo...',
    '.........ooo....',
    '........ooo.....',
    '.......ooo......',
    '......ooo.......',
    '.....ooo........',
    '...dddd.........',
    '..ddddd.........',
    '..lld...........',
    '.lll............',
    '.ll.............',
    '................',
    '................'
  ];
  SPR.ic_maul = [
    '................',
    '....MMMMMMMM....',
    '...MoooooooM....',
    '...MoooooooM....',
    '...MoooooooM....',
    '...MMMMMMMMM....',
    '.......l........',
    '.......l........',
    '.......l........',
    '.......l........',
    '.......l........',
    '.......l........',
    '.......l........',
    '.......l........',
    '................',
    '................'
  ];
  SPR.ic_armor = [
    '................',
    '...MM......MM...',
    '..MMMMMMMMMMMM..',
    '.MMMoooooooMMMM.',
    '.MMoooooooooMMM.',
    '.MMoooooooooMMM.',
    '.MMoooooooooMMM.',
    '.MMoooooooooMMM.',
    '..MoooooooooMM..',
    '..MoooooooooMM..',
    '..MMoooooooMM...',
    '...MMoooooMM....',
    '....MMMMMMM.....',
    '................',
    '................',
    '................'
  ];
  SPR.ic_robe = [
    '................',
    '....cc....cc....',
    '...cccccccccc...',
    '..cccccccccccc..',
    '..cccCCCCCcccc..',
    '..cccCCCCCcccc..',
    '..cccCCCCCcccc..',
    '..cccCCCCCcccc..',
    '..cccccccccccc..',
    '...cccccccccc...',
    '...cccccccccc...',
    '...cccccccccc...',
    '...cccccccccc...',
    '................',
    '................',
    '................'
  ];
  SPR.ic_ring = [
    '................',
    '................',
    '......jjj.......',
    '.....jJJJj......',
    '....ddjjjdd.....',
    '...dd.....dd....',
    '..dd.......dd...',
    '..dd.......dd...',
    '..dd.......dd...',
    '..dd.......dd...',
    '...dd.....dd....',
    '....ddddddd.....',
    '......ddd.......',
    '................',
    '................',
    '................'
  ];
  SPR.ic_amulet = [
    '................',
    '...dd......dd...',
    '..d..dd..dd..d..',
    '.d.....dd.....d.',
    '.d............d.',
    '..d..........d..',
    '...dd......dd...',
    '.....dd..dd.....',
    '.......dd.......',
    '......dddd......',
    '.....ddjjdd.....',
    '.....ddjjdd.....',
    '......dddd......',
    '................',
    '................',
    '................'
  ];
  SPR.ic_potion = [
    '................',
    '......kkkk......',
    '......kLLk......',
    '......kLLk......',
    '.....kkLLkk.....',
    '.....kj..jk.....',
    '....kjjjjjjk....',
    '...kjjjjjjjjk...',
    '...kjjjjjjjjk...',
    '...kjjwjjjjjk...',
    '...kjjjjjjjjk...',
    '...kjjjjjjjjk...',
    '....kjjjjjjk....',
    '.....kkkkkk.....',
    '................',
    '................'
  ];
  SPR.ic_herb = [
    '................',
    '.......e........',
    '....e..e..e.....',
    '...ee..e..ee....',
    '...eee.e.eee....',
    '....eeeeeee.....',
    '.....eeeee......',
    '......eee.......',
    '.......e........',
    '.......e........',
    '.......e........',
    '......E.E.......',
    '.....E...E......',
    '................',
    '................',
    '................'
  ];
  SPR.ic_ore = [
    '................',
    '................',
    '.....kkkkk......',
    '....kxxxxxk.....',
    '...kxxdxxxxk....',
    '..kxxxxxxdxxk...',
    '..kxdxxxxxxxk...',
    '..kxxxxxdxxxk...',
    '..kxxxdxxxxxk...',
    '...kxxxxxxxk....',
    '....kkxxxkk.....',
    '......kkk.......',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_ingot = [
    '................',
    '................',
    '................',
    '.....kkkkkk.....',
    '....kmmmmmmk....',
    '...kmmmmmmmmk...',
    '..kmmmmmmmmmmk..',
    '..kmoooooooomk..',
    '..kmmmmmmmmmmk..',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_coin = [
    '................',
    '................',
    '.....kkkkk......',
    '....kdddddk.....',
    '...kdddddddk....',
    '..kddDdddDddk...',
    '..kdddddddddk...',
    '..kddDdddDddk...',
    '..kdddDDDdddk...',
    '...kdddddddk....',
    '....kdddddk.....',
    '.....kkkkk......',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_bone = [
    '................',
    '..w...........w.',
    '.www.........www',
    '..wwww.....wwww.',
    '....wwwwwwwww...',
    '.....wwwwwww....',
    '....wwwwwwwww...',
    '..wwww.....wwww.',
    '.www.........www',
    '..w...........w.',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_leather = [
    '................',
    '....llll........',
    '..llllllll......',
    '.lllLLLLllll....',
    '.llLLLLLLLlll...',
    '.llLLLLLLLLll...',
    '.lllLLLLLLlll...',
    '..llLLLLLLll....',
    '..lllLLLLlll....',
    '...llllllll.....',
    '....llllll......',
    '................',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_key = [
    '................',
    '................',
    '...ddd..........',
    '..d...d.........',
    '..d...d.........',
    '..d...d.........',
    '...ddd..........',
    '....ddddddddd...',
    '.............d..',
    '..........d..d..',
    '..........d..d..',
    '................',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_misc = [
    '................',
    '................',
    '....kkkkkkk.....',
    '...klllllllk....',
    '...kllllllllk...',
    '...kllllllllk...',
    '...kllllllllk...',
    '...kllllllllk...',
    '...kllllllllk...',
    '....kkkkkkkk....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ];
  SPR.ic_heart = [
    '................',
    '...RR.....RR....',
    '..RrrRR.RRrrR...',
    '.RrrrrrRrrrrrR..',
    '.RrrrfrrrrrrrR..',
    '.RrrrrrrrrrrrR..',
    '..RrrrrrrrrrR...',
    '..RrrrrrrrrR....',
    '...RrrrrrrR.....',
    '....RrrrrR......',
    '.....RrrR.......',
    '......RR........',
    '................',
    '................',
    '................',
    '................'
  ];

  /* ================================================================
     COSTRUZIONE DEGLI SPRITE
     ================================================================ */
  const cache = new Map();

  function normalize(rows, w) {
    return rows.map(r => {
      if (r.length === w) return r;
      if (r.length > w) return r.slice(0, w);
      return r + '.'.repeat(w - r.length);
    });
  }

  function makeCanvas(w, h) {
    const c = (typeof OffscreenCanvas !== 'undefined' && false)
      ? new OffscreenCanvas(w, h)
      : document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* Il protagonista usa una tela piu' grande degli sprite storici 16x16.
     La collisione resta invariata: guadagniamo solo una silhouette piu'
     autorevole, mantello, pelliccia e metallo leggibili anche su telefono. */
  function heroSprite(name) {
    const m = /^p_(down|up|side)_(\d)$/.exec(name);
    if (!m) return null;
    const dir = m[1], step = parseInt(m[2], 10);
    const cv = makeCanvas(24, 28), ctx = cv.getContext('2d');
    const outline = '#15121a', iron = '#777b82', ironHi = '#b8b9b4';
    const leather = '#5a3b27', leatherHi = '#815638';
    const cloth = '#292a2d', clothHi = '#3b3b3c';
    const fur = '#9a9184', furHi = '#c0b7a7', skin = '#c58b66';
    const boot = '#211711';
    const legA = step ? 6 : 8, legB = step ? 15 : 14;
    const footA = step ? 24 : 23, footB = step ? 22 : 23;

    /* Gambe e stivali: due pose nette, senza deformare tutto il corpo. */
    ctx.fillStyle = outline;
    ctx.fillRect(legA - 1, 19, 5, 7); ctx.fillRect(legB - 1, 19, 5, 7);
    ctx.fillStyle = leather;
    ctx.fillRect(legA, 19, 3, 5); ctx.fillRect(legB, 19, 3, 5);
    ctx.fillStyle = boot;
    ctx.fillRect(legA - 1, footA, 5, 3); ctx.fillRect(legB - 1, footB, 5, 3);

    if (dir === 'side') {
      /* Profilo: il mantello allungato rende chiara la direzione. */
      ctx.fillStyle = outline; ctx.fillRect(7, 9, 11, 13);
      ctx.fillStyle = cloth; ctx.fillRect(8, 10, 9, 11);
      ctx.fillStyle = clothHi; ctx.fillRect(9, 10, 3, 9);
      ctx.fillStyle = leather; ctx.fillRect(7, 16, 11, 3);
      ctx.fillStyle = leatherHi; ctx.fillRect(15, 11, 4, 8);
      ctx.fillStyle = outline; ctx.fillRect(8, 2, 9, 7); ctx.fillRect(6, 6, 13, 2);
      ctx.fillStyle = leather; ctx.fillRect(9, 3, 7, 4); ctx.fillRect(7, 6, 11, 1);
      ctx.fillStyle = skin; ctx.fillRect(15, 7, 3, 3);
      ctx.fillStyle = fur; ctx.fillRect(7, 9, 12, 4);
      ctx.fillStyle = furHi; ctx.fillRect(9, 9, 7, 1);
      /* Scudo visto di taglio sulla schiena. */
      ctx.fillStyle = outline; ctx.fillRect(5, 11, 3, 9);
      ctx.fillStyle = iron; ctx.fillRect(6, 12, 2, 7);
    } else {
      /* Corpo a strati: tunica, cintura, braccia e mantello. */
      ctx.fillStyle = outline; ctx.fillRect(5, 9, 14, 13);
      ctx.fillStyle = cloth; ctx.fillRect(6, 10, 12, 11);
      ctx.fillStyle = clothHi; ctx.fillRect(7, 10, 3, 9);
      ctx.fillStyle = outline; ctx.fillRect(3, 11, 4, 9); ctx.fillRect(17, 11, 4, 9);
      ctx.fillStyle = leatherHi; ctx.fillRect(4, 12, 3, 7); ctx.fillRect(17, 12, 3, 7);
      ctx.fillStyle = leather; ctx.fillRect(5, 16, 14, 3);
      ctx.fillStyle = iron; ctx.fillRect(11, 16, 2, 3);
      ctx.fillStyle = ironHi; ctx.fillRect(11, 16, 1, 1);
      /* Mantello e spallaccio di pelliccia. */
      ctx.fillStyle = fur; ctx.fillRect(4, 9, 16, 4);
      ctx.fillStyle = furHi; ctx.fillRect(6, 9, 12, 1);
      ctx.fillStyle = '#716a61';
      ctx.fillRect(5, 12, 2, 2); ctx.fillRect(10, 11, 2, 2); ctx.fillRect(17, 12, 2, 2);
      /* Cappuccio/berretto e volto. */
      ctx.fillStyle = outline; ctx.fillRect(7, 2, 10, 7); ctx.fillRect(5, 6, 14, 2);
      ctx.fillStyle = leather; ctx.fillRect(8, 3, 8, 4); ctx.fillRect(6, 6, 12, 1);
      if (dir === 'down') {
        ctx.fillStyle = skin; ctx.fillRect(9, 7, 6, 3);
        ctx.fillStyle = '#2b201b'; ctx.fillRect(10, 9, 4, 1);
        /* Scudo frontale laterale, piccolo ma riconoscibile. */
        ctx.fillStyle = outline; ctx.fillRect(18, 12, 5, 8);
        ctx.fillStyle = leather; ctx.fillRect(19, 13, 3, 6);
        ctx.fillStyle = iron; ctx.fillRect(20, 15, 2, 2);
      } else {
        ctx.fillStyle = '#3a2920'; ctx.fillRect(8, 7, 8, 3);
        ctx.fillStyle = leatherHi; ctx.fillRect(8, 11, 2, 8);
        ctx.fillStyle = iron; ctx.fillRect(4, 13, 2, 6);
      }
    }
    return cv;
  }

  /* Costruisce (e memorizza) un canvas dallo sprite.
     `swap` rimappa singoli caratteri su colori diversi: permette di
     riusare lo stesso disegno per varianti di colore. */
  function sprite(name, swap) {
    const key = name + (swap ? '|' + JSON.stringify(swap) : '');
    if (cache.has(key)) return cache.get(key);

    if (!swap && /^p_(down|up|side)_\d$/.test(name)) {
      const hero = heroSprite(name);
      cache.set(key, hero);
      return hero;
    }

    let def = SPR[name];
    if (!def) { cache.set(key, null); return null; }
    let rows, w, h;
    if (Array.isArray(def)) { rows = def; w = 16; h = def.length; }
    else { rows = def.rows; w = def.w; h = def.h; }
    rows = normalize(rows, w);

    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let y = 0; y < h; y++) {
      const line = rows[y] || '';
      for (let x = 0; x < w; x++) {
        const ch = line[x] || '.';
        let col = (swap && swap[ch] !== undefined) ? swap[ch] : PAL[ch];
        if (!col) continue;
        const i = (y * w + x) * 4;
        data[i] = parseInt(col.slice(1, 3), 16);
        data[i + 1] = parseInt(col.slice(3, 5), 16);
        data[i + 2] = parseInt(col.slice(5, 7), 16);
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    /* Luce dall'alto: schiarisce la parte superiore e scurisce la base,
       solo dove ci sono pixel opachi. Dà volume a sprite piatti senza
       ridisegnarli, ed è la differenza fra "ritagliato" e "scolpito". */
    ctx.globalCompositeOperation = 'source-atop';
    const lit = ctx.createLinearGradient(0, 0, 0, h);
    lit.addColorStop(0, 'rgba(255,242,214,0.16)');
    lit.addColorStop(0.42, 'rgba(255,242,214,0.03)');
    lit.addColorStop(0.62, 'rgba(20,12,30,0.00)');
    lit.addColorStop(1, 'rgba(20,12,30,0.20)');
    ctx.fillStyle = lit;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    cache.set(key, cv);
    return cv;
  }

  /* Texture d'ombra riutilizzabile: un'ellisse sfumata disegnata una volta
     sola e poi scalata. Molto più economica di un gradiente per entità
     a ogni fotogramma, e infinitamente più morbida di un disco pixelato. */
  let shadowTex = null;
  function getShadowTex() {
    if (shadowTex) return shadowTex;
    const w = 64, h = 32;
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(10,6,16,0.55)');
    g.addColorStop(0.55, 'rgba(10,6,16,0.28)');
    g.addColorStop(1, 'rgba(10,6,16,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    shadowTex = cv;
    return cv;
  }

  /* Variante "silhouette": usata per il lampeggio bianco quando si viene colpiti. */
  function flashOf(name, swap, color) {
    const key = 'flash|' + name + '|' + color + (swap ? JSON.stringify(swap) : '');
    if (cache.has(key)) return cache.get(key);
    const src = sprite(name, swap);
    if (!src) return null;
    const cv = makeCanvas(src.width, src.height);
    const ctx = cv.getContext('2d');
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, cv.width, cv.height);
    cache.set(key, cv);
    return cv;
  }

  /* ================================================================
     TILE PROCEDURALI
     Ogni tipo genera 4 varianti deterministiche: niente ripetizione
     visibile a griglia.
     ================================================================ */
  const TILE = 16;
  /* `z` = ordine di sovrapposizione: un terreno con z più alto sborda su
     quello con z più basso, con un bordo irregolare. È ciò che elimina i
     confini dritti fra le macchie di terreno. */
  const TILE_DEFS = {
    water:      { z: 0,  base: '#22384f', tones: ['#284158', '#1d3145', '#2e4a63'], speck: '#3a5f7d', solid: true, liquid: true },
    lava:       { z: 0,  base: '#5a1f10', tones: ['#7a2a12', '#45170c', '#8f3517'], speck: '#f06c3a', solid: true, liquid: true, glow: '#f06c3a' },
    /* I toni base sono volutamente distanti fra loro: la luce d'ambiente
       li riavvicina, e se partono già simili il terreno diventa una
       poltiglia bruna in cui non si distingue più nulla. */
    grass:      { z: 10, base: '#334531', tones: ['#3c5138', '#293a27', '#485d40'], speck: '#5c6d50', solid: false },
    ash_grass:  { z: 11, base: '#454638', tones: ['#515244', '#383a30', '#5b5a49'], speck: '#6f6e59', solid: false },
    dirt:       { z: 13, base: '#45382d', tones: ['#514237', '#392d25', '#5b4a3b'], speck: '#756451', solid: false },
    ash:        { z: 12, base: '#4c4657', tones: ['#575062', '#3f3949', '#605970'], speck: '#736c85', solid: false },
    stone:      { z: 14, base: '#42404e', tones: ['#4c4a59', '#383644', '#565365'], speck: '#635f73', solid: false },
    cave_floor: { z: 15, base: '#2f2a37', tones: ['#383140', '#28232f', '#403948'], speck: '#4c4458', solid: false },
    keep_floor: { z: 16, base: '#3a3340', tones: ['#443c4b', '#312b36', '#4c4454'], speck: '#584e62', solid: false },
    path:       { z: 20, base: '#5a554b', tones: ['#676156', '#4b473f', '#706a5e'], speck: '#898275', solid: false },
    wood:       { z: 21, base: '#5a4028', tones: ['#644731', '#4e3722', '#6d4e36'], speck: '#7a5a3f', solid: false },
    /* I muri non partecipano alle transizioni: hanno già il proprio stacco */
    rock_wall:  { z: 90, base: '#2a2630', tones: ['#332e3a', '#241f2b', '#3a3442'], speck: '#443d4c', solid: true, wall: true },
    keep_wall:  { z: 90, base: '#332c38', tones: ['#3c3442', '#2b2530', '#443b4a'], speck: '#524859', solid: true, wall: true },
    village_wall:{ z: 90, base: '#3b3a3d', tones: ['#48474a', '#302f33', '#535155'], speck: '#67656a', solid: true, wall: true }
  };
  const TILE_KEYS = Object.keys(TILE_DEFS);

  let tileAtlas = null;
  const VARIANTS = 4;

  /* Crea un atlante: righe = tipi di tile, colonne = varianti. */
  function buildTileAtlas() {
    if (tileAtlas) return tileAtlas;
    const cv = makeCanvas(TILE * VARIANTS, TILE * TILE_KEYS.length);
    const ctx = cv.getContext('2d');
    const rng = new CV.Rng(20260830);

    TILE_KEYS.forEach((key, row) => {
      const def = TILE_DEFS[key];
      for (let v = 0; v < VARIANTS; v++) {
        const ox = v * TILE, oy = row * TILE;
        ctx.fillStyle = def.base;
        ctx.fillRect(ox, oy, TILE, TILE);

        /* Macchie ampie e morbide invece di rumore fitto: da vicino il
           rumore a un pixel sembra dettaglio, a schermo intero sembra
           sporco. Poche chiazze larghe leggono molto meglio. */
        for (let i = 0; i < 7; i++) {
          ctx.fillStyle = def.tones[Math.floor(rng.next() * def.tones.length)];
          const w = 3 + Math.floor(rng.next() * 6);
          const h = 2 + Math.floor(rng.next() * 4);
          ctx.globalAlpha = 0.5 + rng.next() * 0.35;
          ctx.fillRect(ox + Math.floor(rng.next() * TILE), oy + Math.floor(rng.next() * TILE), w, h);
        }
        ctx.globalAlpha = 1;
        /* Pochissimi granelli, solo per rompere la piattezza */
        for (let i = 0; i < 2; i++) {
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = def.speck;
          ctx.fillRect(ox + Math.floor(rng.next() * TILE), oy + Math.floor(rng.next() * TILE), 1, 1);
        }
        ctx.globalAlpha = 1;
        /* I muri hanno un bordo superiore piu' chiaro: leggono meglio in verticale */
        if (def.wall) {
          ctx.fillStyle = def.speck;
          ctx.fillRect(ox, oy, TILE, 2);
          ctx.fillStyle = '#0d0b10';
          ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
        }
        if (def.liquid) {
          ctx.fillStyle = def.speck;
          for (let i = 0; i < 3; i++) {
            const yy = oy + 2 + Math.floor(rng.next() * (TILE - 4));
            ctx.fillRect(ox + Math.floor(rng.next() * 8), yy, 3 + Math.floor(rng.next() * 5), 1);
          }
        }
      }
    });
    tileAtlas = cv;
    return cv;
  }

  function tileIndex(key) { return TILE_KEYS.indexOf(key); }
  function getTileAtlasInternal() { return tileAtlas || buildTileAtlas(); }

  /* ---------------- Maschere di transizione ----------------
     Ritagliano il terreno "superiore" perché sbordi su quello inferiore
     con un margine irregolare e sfrangiato, invece del bordo dritto che
     produce l'effetto scacchiera.
     Le 8 direzioni sono: 0=N 1=E 2=S 3=O 4=NE 5=SE 6=SO 7=NO          */
  const maskCache = new Map();
  const MASK_VARIANTS = 3;

  function edgeMask(dir, variant) {
    const key = dir + ':' + variant;
    if (maskCache.has(key)) return maskCache.get(key);
    const cv = makeCanvas(TILE, TILE);
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(TILE, TILE);
    const d = img.data;
    const rng = new CV.Rng(4700 + dir * 137 + variant * 911);

    const put = (x, y, a) => {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      const i = (y * TILE + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
      d[i + 3] = Math.max(d[i + 3], a);
    };

    if (dir < 4) {
      /* Lati: profondità variabile lungo il bordo, più due file di
         sfrangiatura che sfumano il confine invece di tagliarlo netto. */
      for (let i = 0; i < TILE; i++) {
        const n = CV.noise.fbm(i / 4.5, variant * 11 + dir * 3, 331, 2);
        const depth = 3 + Math.round(n * 4);
        for (let j = 0; j < depth; j++) {
          if (dir === 0) put(i, j, 255);
          else if (dir === 1) put(TILE - 1 - j, i, 255);
          else if (dir === 2) put(i, TILE - 1 - j, 255);
          else put(j, i, 255);
        }
        /* Sfrangiatura: pixel sparsi oltre il bordo, densità calante */
        for (let k = 0; k < 3; k++) {
          if (!rng.chance(0.55 - k * 0.17)) continue;
          const j = depth + k;
          const a = 235 - k * 60;
          if (dir === 0) put(i, j, a);
          else if (dir === 1) put(TILE - 1 - j, i, a);
          else if (dir === 2) put(i, TILE - 1 - j, a);
          else put(j, i, a);
        }
      }
    } else {
      /* Angoli: quarto di macchia irregolare, per chiudere il punto in cui
         due lati si incontrano senza lasciare un dente quadrato. */
      const r0 = 5.5;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          let cx, cy;
          if (dir === 4) { cx = TILE - 1; cy = 0; }
          else if (dir === 5) { cx = TILE - 1; cy = TILE - 1; }
          else if (dir === 6) { cx = 0; cy = TILE - 1; }
          else { cx = 0; cy = 0; }
          const dist = Math.hypot(x - cx, y - cy);
          const wob = CV.noise.fbm(x / 3.5, y / 3.5, 770 + variant * 53 + dir, 2) * 2.6;
          const edge = r0 + wob;
          if (dist < edge - 0.8) put(x, y, 255);
          else if (dist < edge + 0.9 && rng.chance(0.5)) put(x, y, 200);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    maskCache.set(key, cv);
    return cv;
  }

  /* Pezzo di bordo già ritagliato: il tile "superiore" mascherato secondo
     una direzione. Le combinazioni che servono davvero sono poche e si
     ripetono migliaia di volte in una mappa, quindi conviene tenerle in
     memoria invece di ricomporle a ogni cella. */
  const edgeCache = new Map();
  function edgePiece(tileRow, tileVar, dir, maskVar) {
    const key = tileRow + '|' + tileVar + '|' + dir + '|' + maskVar;
    let cv = edgeCache.get(key);
    if (cv) return cv;
    cv = makeCanvas(TILE, TILE);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(getTileAtlasInternal(), tileVar * TILE, tileRow * TILE, TILE, TILE, 0, 0, TILE, TILE);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(edgeMask(dir, maskVar), 0, 0);
    edgeCache.set(key, cv);
    return cv;
  }

  /* ================================================================
     PROP GRANDI DISEGNATI IN PROCEDURA (alberi, rocce, case)
     ================================================================ */
  const propCache = new Map();

  function tree(variant) {
    const key = 'tree' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const w = 32, h = 44;
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const rng = new CV.Rng(7000 + variant * 131);
    const dead = variant >= 2;

    /* Tronco */
    ctx.fillStyle = '#241a14';
    ctx.fillRect(13, 26, 6, 18);
    ctx.fillStyle = '#3a2a1e';
    ctx.fillRect(14, 26, 3, 18);

    if (dead) {
      /* Albero secco: solo rami */
      ctx.strokeStyle = '#2e2219'; ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const y0 = 30 - i * 3.5;
        const dir = i % 2 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(16, y0);
        ctx.lineTo(16 + dir * (5 + rng.next() * 9), y0 - 6 - rng.next() * 5);
        ctx.stroke();
      }
      ctx.fillStyle = '#3a2f28';
      for (let i = 0; i < 14; i++) ctx.fillRect(4 + rng.next() * 24, 4 + rng.next() * 22, 2, 2);
    } else {
      /* Chioma: grappoli di cerchi pixelati */
      const dark = variant === 0 ? '#243a26' : '#2b3a2c';
      const mid = variant === 0 ? '#31502f' : '#3a4d35';
      const lit = variant === 0 ? '#41653a' : '#4c6244';
      const blobs = [[16, 14, 13], [9, 19, 9], [23, 19, 9], [16, 22, 11], [12, 10, 7], [21, 11, 7]];
      for (const [cx, cy, r] of blobs) { ctx.fillStyle = dark; circle(ctx, cx, cy, r); }
      for (const [cx, cy, r] of blobs) { ctx.fillStyle = mid; circle(ctx, cx, cy - 1, r - 2); }
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = lit;
        ctx.fillRect(6 + Math.floor(rng.next() * 20), 5 + Math.floor(rng.next() * 18), 2, 2);
      }
      /* Un velo di cenere sulle foglie: e' il tema del gioco */
      ctx.fillStyle = 'rgba(160,155,170,0.20)';
      for (let i = 0; i < 16; i++) ctx.fillRect(5 + Math.floor(rng.next() * 22), 4 + Math.floor(rng.next() * 16), 2, 1);
    }
    propCache.set(key, cv);
    return cv;
  }

  function circle(ctx, cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      ctx.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
    }
  }

  function rock(variant) {
    const key = 'rock' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const w = 24, h = 20;
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const rng = new CV.Rng(3100 + variant * 77);
    ctx.fillStyle = '#0d0b10'; circle(ctx, 12, 12, 9);
    ctx.fillStyle = '#413c49'; circle(ctx, 12, 11, 8);
    ctx.fillStyle = '#4e4857'; circle(ctx, 11, 10, 6);
    ctx.fillStyle = '#5d5668'; circle(ctx, 10, 8, 3);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = rng.chance(0.5) ? '#37323f' : '#5d5668';
      ctx.fillRect(5 + Math.floor(rng.next() * 14), 5 + Math.floor(rng.next() * 12), 2, 1);
    }
    propCache.set(key, cv);
    return cv;
  }

  function bush(variant) {
    const key = 'bush' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(20, 16);
    const ctx = cv.getContext('2d');
    const rng = new CV.Rng(5500 + variant * 53);
    ctx.fillStyle = '#1e2a1c'; circle(ctx, 10, 9, 7);
    ctx.fillStyle = '#2c3d27'; circle(ctx, 10, 8, 6);
    ctx.fillStyle = '#3a4f31'; circle(ctx, 9, 7, 4);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = '#48603c';
      ctx.fillRect(4 + Math.floor(rng.next() * 12), 3 + Math.floor(rng.next() * 9), 2, 2);
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Casa di Ashford: pietra bagnata, travi annerite, tetto ripido e
     rattoppato. Le tre varianti condividono i materiali ma non la sagoma. */
  function house(variant) {
    const key = 'house' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const w = variant === 0 ? 72 : (variant === 1 ? 56 : 64);
    const h = variant === 2 ? 70 : 66;
    const cv = makeCanvas(w, h);
    const ctx = cv.getContext('2d');
    const rng = new CV.Rng(8200 + variant * 97);
    const wallY = variant === 2 ? 29 : 27, wallH = h - wallY - 2;

    /* Basamento di pietra, con corsi irregolari e giunti profondi. */
    ctx.fillStyle = '#111016'; ctx.fillRect(2, wallY, w - 4, wallH);
    ctx.fillStyle = '#4b4949'; ctx.fillRect(3, wallY + 1, w - 6, wallH - 2);
    for (let y = wallY + 3; y < h - 2; y += 6) {
      ctx.fillStyle = '#29282c'; ctx.fillRect(3, y, w - 6, 1);
      for (let x = 5 + ((y / 6) % 2) * 5; x < w - 5; x += 12) ctx.fillRect(x, y - 5, 1, 5);
    }
    ctx.fillStyle = '#686463';
    for (let i = 0; i < 22; i++) ctx.fillRect(5 + rng.int(0, w - 11), wallY + 2 + rng.int(0, wallH - 7), 2, 1);

    /* Struttura lignea annerita, più pesante del vecchio graticcio. */
    ctx.fillStyle = '#241a16';
    ctx.fillRect(3, wallY, w - 6, 3);
    for (let x = 8; x < w - 7; x += 15) ctx.fillRect(x, wallY, 3, wallH - 1);
    ctx.fillStyle = '#5d4130';
    for (let x = 9; x < w - 7; x += 15) ctx.fillRect(x, wallY + 2, 1, wallH - 5);

    /* Tetto molto ripido: scandole visibili, cenere e alcune rotture. */
    for (let y = 1; y < wallY; y++) {
      const t = y / wallY;
      const half = Math.round((w / 2) * (0.10 + 0.94 * t));
      ctx.fillStyle = y % 5 < 2 ? '#2d2420' : '#3a2d27';
      ctx.fillRect(Math.floor(w / 2 - half), y, half * 2, 2);
      if (y % 5 === 0) {
        ctx.fillStyle = '#181418';
        for (let x = Math.floor(w / 2 - half) + 3; x < w / 2 + half - 2; x += 7) ctx.fillRect(x, y + 1, 1, 2);
      }
    }
    ctx.fillStyle = '#171319'; ctx.fillRect(0, wallY - 2, w, 4);
    ctx.fillStyle = 'rgba(176,170,166,0.28)';
    for (let i = 0; i < 15; i++) ctx.fillRect(5 + rng.int(0, w - 11), 5 + rng.int(0, wallY - 9), rng.int(1, 4), 1);
    /* Tetto sfondato diverso per variante. */
    const holeX = variant === 0 ? w - 24 : 13;
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(holeX, 10 + variant * 3, 7, 5);
    ctx.fillRect(holeX - 2, 12 + variant * 3, 11, 2);

    /* Comignolo di pietra. */
    const chimX = variant === 1 ? w - 16 : 12;
    ctx.fillStyle = '#151419'; ctx.fillRect(chimX, 5, 9, 20);
    ctx.fillStyle = '#555357'; ctx.fillRect(chimX + 1, 6, 7, 18);
    ctx.fillStyle = '#777477'; ctx.fillRect(chimX, 5, 9, 3);
    ctx.fillStyle = '#29282c'; ctx.fillRect(chimX + 2, 11, 6, 1); ctx.fillRect(chimX + 1, 17, 6, 1);

    /* Porta */
    const dx = Math.floor(w / 2) - 7;
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(dx, h - 23, 14, 21);
    ctx.fillStyle = '#33231c'; ctx.fillRect(dx + 2, h - 21, 10, 19);
    ctx.fillStyle = '#6e4932';
    for (let x = dx + 3; x < dx + 12; x += 3) ctx.fillRect(x, h - 20, 1, 17);
    ctx.fillStyle = '#8b8b88'; ctx.fillRect(dx + 9, h - 12, 2, 2);

    /* Finestre piccole e calde: sicurezza fragile nel villaggio. */
    const wy = h - 34;
    for (const wx of [7, w - 19]) {
      ctx.fillStyle = '#0d0b10'; ctx.fillRect(wx, wy, 12, 10);
      ctx.fillStyle = '#b96532'; ctx.fillRect(wx + 1, wy + 1, 10, 8);
      ctx.fillStyle = '#f0a94c'; ctx.fillRect(wx + 2, wy + 2, 8, 6);
      ctx.fillStyle = '#241a16'; ctx.fillRect(wx + 5, wy, 2, 10); ctx.fillRect(wx, wy + 4, 12, 2);
    }
    propCache.set(key, cv);
    return cv;
  }

  function hearthShrine() {
    const key = 'hearthShrine';
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(36, 46), ctx = cv.getContext('2d');
    ctx.fillStyle = '#111016'; ellip(ctx, 18, 40, 16, 5);
    ctx.fillStyle = '#4a484c'; ellip(ctx, 18, 38, 15, 5);
    ctx.fillStyle = '#777379'; ellip(ctx, 18, 36, 11, 3);
    ctx.fillStyle = '#17151b'; ctx.fillRect(11, 9, 14, 29);
    ctx.fillStyle = '#4b484f'; ctx.fillRect(12, 10, 12, 27);
    ctx.fillStyle = '#68646b'; ctx.fillRect(13, 11, 3, 23);
    ctx.fillStyle = '#28262c';
    ctx.fillRect(15, 15, 6, 1); ctx.fillRect(15, 24, 6, 1); ctx.fillRect(17, 12, 1, 21);
    /* Cavita' della brace, unica nota calda. */
    ctx.fillStyle = '#161017'; ctx.fillRect(14, 27, 8, 8);
    ctx.fillStyle = '#8f301e'; ctx.fillRect(15, 29, 6, 5);
    ctx.fillStyle = '#f06c3a'; ctx.fillRect(17, 28, 3, 5);
    ctx.fillStyle = '#ffd166'; ctx.fillRect(18, 30, 2, 2);
    propCache.set(key, cv);
    return cv;
  }

  function handcart(variant) {
    const key = 'handcart' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(34, 24), ctx = cv.getContext('2d');
    ctx.fillStyle = '#151116'; circle(ctx, 9, 18, 5); circle(ctx, 25, 18, 5);
    ctx.fillStyle = '#5d4938'; circle(ctx, 9, 18, 3); circle(ctx, 25, 18, 3);
    ctx.fillStyle = '#92908d'; ctx.fillRect(8, 14, 2, 8); ctx.fillRect(5, 17, 8, 2); ctx.fillRect(24, 14, 2, 8); ctx.fillRect(21, 17, 8, 2);
    ctx.fillStyle = '#211814'; ctx.fillRect(4, 5, 26, 12);
    ctx.fillStyle = variant ? '#60452f' : '#523b2c'; ctx.fillRect(5, 6, 24, 10);
    ctx.fillStyle = '#2b1e18'; for (let y = 8; y < 16; y += 3) ctx.fillRect(6, y, 22, 1);
    ctx.fillStyle = '#6f6c68'; ctx.fillRect(5, 6, 24, 2); ctx.fillRect(6, 14, 22, 2);
    ctx.fillStyle = '#3b2a20'; ctx.fillRect(1, 15, 7, 2); ctx.fillRect(27, 15, 7, 2);
    propCache.set(key, cv);
    return cv;
  }

  function woodpile(variant) {
    const key = 'woodpile' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(28, 19), ctx = cv.getContext('2d');
    ctx.fillStyle = '#181216'; ctx.fillRect(2, 5, 24, 13);
    for (let y = 6; y < 17; y += 4) for (let x = 4 + ((y / 4) % 2) * 3; x < 24; x += 6) {
      ctx.fillStyle = '#533a29'; ctx.fillRect(x, y, 7, 3);
      ctx.fillStyle = '#8a6847'; ctx.fillRect(x + 5, y, 2, 3);
      ctx.fillStyle = '#2b1d18'; ctx.fillRect(x + 6, y + 1, 1, 1);
    }
    ctx.fillStyle = '#383238'; ctx.fillRect(1, 16, 26, 2);
    propCache.set(key, cv);
    return cv;
  }

  /* ================================================================
     REPERTORIO DI OGGETTI
     Tutti disegnati da codice: nessun file, ma abbastanza varianti da
     non far riconoscere la ripetizione mentre si cammina.
     ================================================================ */

  /* Ellisse pixelata: serve a dare la faccia superiore agli oggetti
     cilindrici, che in vista dall'alto senza fianco sembrano monete. */
  function ellip(ctx, cx, cy, rx, ry) {
    for (let y = -ry; y <= ry; y++) {
      const dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      ctx.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
    }
  }

  /* Ceppo tagliato: fianco di corteccia + faccia superiore con gli anelli.
     È il fianco a dargli altezza. */
  function stump(variant) {
    const key = 'stump' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(18, 18), ctx = cv.getContext('2d');
    const rng = new CV.Rng(6100 + variant * 41);

    /* Fianco */
    ctx.fillStyle = '#160f0a'; ctx.fillRect(2, 6, 14, 11);
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(3, 6, 12, 10);
    ctx.fillStyle = '#4a3524'; ctx.fillRect(3, 6, 4, 10);
    ctx.fillStyle = '#2a1e14';
    for (let i = 0; i < 5; i++) ctx.fillRect(4 + i * 2 + (i % 2), 7, 1, 9);

    /* Faccia superiore con anelli di crescita */
    ctx.fillStyle = '#160f0a'; ellip(ctx, 9, 6, 7, 4);
    ctx.fillStyle = '#6b5138'; ellip(ctx, 9, 6, 6, 3);
    ctx.fillStyle = '#54402b'; ellip(ctx, 9, 6, 4, 2);
    ctx.fillStyle = '#6b5138'; ellip(ctx, 9, 6, 2, 1);
    ctx.fillStyle = '#3a2a1c'; ctx.fillRect(8, 6, 1, 1);
    /* Radici che affiorano */
    ctx.fillStyle = '#2a1e14';
    for (let i = 0; i < 3; i++) ctx.fillRect(2 + Math.floor(rng.next() * 13), 16, 2, 1);
    propCache.set(key, cv);
    return cv;
  }

  /* Ciuffo d'erba alta: ondeggia nel renderer */
  function tallgrass(variant) {
    const key = 'tallgrass' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(16, 14), ctx = cv.getContext('2d');
    const rng = new CV.Rng(6300 + variant * 29);
    const cols = ['#3f5c38', '#4b6b42', '#57804c'];
    for (let i = 0; i < 9; i++) {
      const x = 2 + Math.floor(rng.next() * 12);
      const h = 5 + Math.floor(rng.next() * 8);
      const lean = rng.chance(0.5) ? 1 : -1;
      ctx.fillStyle = cols[Math.floor(rng.next() * cols.length)];
      for (let y = 0; y < h; y++) {
        ctx.fillRect(x + Math.round(lean * (y / h) * 2), 13 - y, 1, 1);
      }
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Fiori di cenere: una delle poche note di colore della valle */
  function flowers(variant) {
    const key = 'flowers' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(14, 12), ctx = cv.getContext('2d');
    const rng = new CV.Rng(6400 + variant * 61);
    const petal = ['#c9668a', '#d9a05b', '#a06fd1', '#e8c9a0'][variant % 4];
    for (let i = 0; i < 4; i++) {
      const x = 2 + Math.floor(rng.next() * 10);
      const y = 3 + Math.floor(rng.next() * 5);
      ctx.fillStyle = '#3d5232';
      ctx.fillRect(x, y + 1, 1, 11 - y);
      ctx.fillStyle = petal;
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(x, y, 1, 1);
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Funghi luminescenti: nelle caverne fanno anche da fonte di luce */
  function mushrooms(variant) {
    const key = 'mushrooms' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(16, 14), ctx = cv.getContext('2d');
    const rng = new CV.Rng(6500 + variant * 83);
    const cap = variant % 2 ? '#6fb3ff' : '#a06fd1';
    const capDark = variant % 2 ? '#2f5c9e' : '#5f3d84';
    for (let i = 0; i < 3; i++) {
      const x = 3 + i * 4 + Math.floor(rng.next() * 2);
      const y = 6 + Math.floor(rng.next() * 4);
      const r = 2 + Math.floor(rng.next() * 2);
      ctx.fillStyle = '#c9c4d6';
      ctx.fillRect(x, y, 1, 13 - y);
      ctx.fillStyle = capDark; circle(ctx, x, y, r);
      ctx.fillStyle = cap; circle(ctx, x, y - 1, r - 1);
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Mucchio d'ossa */
  function boneheap(variant) {
    const key = 'boneheap' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(20, 14), ctx = cv.getContext('2d');
    const rng = new CV.Rng(6600 + variant * 97);
    ctx.fillStyle = '#0f0b14';
    circle(ctx, 10, 11, 6);
    for (let i = 0; i < 6; i++) {
      const x = 3 + Math.floor(rng.next() * 13);
      const y = 6 + Math.floor(rng.next() * 6);
      const len = 3 + Math.floor(rng.next() * 5);
      const horiz = rng.chance(0.65);
      ctx.fillStyle = i % 2 ? '#d8d2c0' : '#b9b2a0';
      if (horiz) { ctx.fillRect(x, y, len, 2); ctx.fillRect(x - 1, y - 1, 2, 4); ctx.fillRect(x + len - 1, y - 1, 2, 4); }
      else { ctx.fillRect(x, y, 2, len); }
    }
    if (variant % 2) {
      ctx.fillStyle = '#e2ddcc'; circle(ctx, 6, 8, 3);
      ctx.fillStyle = '#1a1420'; ctx.fillRect(5, 7, 1, 2); ctx.fillRect(7, 7, 1, 2);
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Barile e cassa: arredo di villaggi e accampamenti */
  function barrel() {
    if (propCache.has('barrel')) return propCache.get('barrel');
    const cv = makeCanvas(14, 18), ctx = cv.getContext('2d');
    ctx.fillStyle = '#1d1510'; ctx.fillRect(1, 2, 12, 16);
    ctx.fillStyle = '#5a4028'; ctx.fillRect(2, 3, 10, 14);
    ctx.fillStyle = '#6d4e36'; ctx.fillRect(3, 3, 3, 14);
    ctx.fillStyle = '#3b2a1a';
    for (const y of [5, 10, 15]) ctx.fillRect(2, y, 10, 2);
    ctx.fillStyle = '#8f96a3';
    for (const y of [5, 15]) ctx.fillRect(2, y, 10, 1);
    ctx.fillStyle = '#75542f'; ctx.fillRect(3, 2, 8, 2);
    propCache.set('barrel', cv);
    return cv;
  }

  function crate() {
    if (propCache.has('crate')) return propCache.get('crate');
    const cv = makeCanvas(16, 16), ctx = cv.getContext('2d');
    ctx.fillStyle = '#1d1510'; ctx.fillRect(1, 3, 14, 13);
    ctx.fillStyle = '#6b4a30'; ctx.fillRect(2, 4, 12, 11);
    ctx.fillStyle = '#7d5738'; ctx.fillRect(2, 4, 12, 3);
    ctx.fillStyle = '#3b2a1a';
    ctx.fillRect(2, 8, 12, 1); ctx.fillRect(7, 4, 1, 11);
    ctx.fillRect(2, 4, 12, 1); ctx.fillRect(2, 14, 12, 1);
    propCache.set('crate', cv);
    return cv;
  }

  /* Lapide: la valle ne è piena */
  function gravestone(variant) {
    const key = 'grave' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(14, 18), ctx = cv.getContext('2d');
    const lean = variant % 2 ? 1 : 0;
    ctx.fillStyle = '#141019';
    ctx.fillRect(2 + lean, 2, 10, 15);
    ctx.fillStyle = '#4d4757'; ctx.fillRect(3 + lean, 3, 8, 14);
    ctx.fillStyle = '#5c5568'; ctx.fillRect(3 + lean, 3, 3, 14);
    ctx.fillStyle = '#38323f';
    ctx.fillRect(5 + lean, 6, 4, 1); ctx.fillRect(5 + lean, 9, 4, 1); ctx.fillRect(6 + lean, 12, 2, 1);
    ctx.fillStyle = '#141019'; circle(ctx, 7 + lean, 4, 3);
    ctx.fillStyle = '#4d4757'; circle(ctx, 7 + lean, 4, 2);
    propCache.set(key, cv);
    return cv;
  }

  /* Staccionata */
  function fence(variant) {
    const key = 'fence' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(16, 16), ctx = cv.getContext('2d');
    ctx.fillStyle = '#1d1510';
    for (const x of [2, 12]) ctx.fillRect(x, 4, 3, 12);
    ctx.fillStyle = '#5a4028';
    for (const x of [2, 12]) ctx.fillRect(2 + (x === 2 ? 0 : 10), 5, 2, 11);
    ctx.fillStyle = '#4a3524';
    ctx.fillRect(0, 7, 16, 2); ctx.fillRect(0, 12, 16, 2);
    ctx.fillStyle = '#6d4e36';
    ctx.fillRect(0, 7, 16, 1); ctx.fillRect(0, 12, 16, 1);
    propCache.set(key, cv);
    return cv;
  }

  /* Stalagmite delle caverne */
  function stalagmite(variant) {
    const key = 'stalag' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const h = 14 + variant * 5;
    const cv = makeCanvas(14, h), ctx = cv.getContext('2d');
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const w = Math.max(1, Math.round(1 + t * 5));
      ctx.fillStyle = '#231e2c';
      ctx.fillRect(7 - w, y, w * 2, 1);
      ctx.fillStyle = '#3a3345';
      ctx.fillRect(7 - w + 1, y, Math.max(1, w), 1);
      if (y > h * 0.5 && y % 4 === 0) { ctx.fillStyle = '#4a4257'; ctx.fillRect(7 - w + 1, y, 1, 1); }
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Ragnatela d'angolo */
  function cobweb(variant) {
    const key = 'web' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(16, 16), ctx = cv.getContext('2d');
    ctx.strokeStyle = 'rgba(210,205,225,0.55)';
    ctx.lineWidth = 1;
    const cx = variant % 2 ? 0 : 16, cy = 0;
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2) + (variant % 2 ? 0 : Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 16, cy + Math.sin(a) * 16);
      ctx.stroke();
    }
    for (let r = 5; r <= 15; r += 5) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, variant % 2 ? 0 : Math.PI / 2, variant % 2 ? Math.PI / 2 : Math.PI);
      ctx.stroke();
    }
    propCache.set(key, cv);
    return cv;
  }

  /* Stendardo della Rocca */
  function banner(variant) {
    const key = 'banner' + variant;
    if (propCache.has(key)) return propCache.get(key);
    const cv = makeCanvas(14, 30), ctx = cv.getContext('2d');
    ctx.fillStyle = '#2a2430'; ctx.fillRect(1, 0, 12, 2);
    ctx.fillStyle = '#6b1f1f'; ctx.fillRect(2, 2, 10, 24);
    ctx.fillStyle = '#8f2d2d'; ctx.fillRect(3, 2, 4, 24);
    ctx.fillStyle = '#f06c3a';
    circle(ctx, 7, 11, 3);
    ctx.fillStyle = '#6b1f1f'; circle(ctx, 7, 11, 1);
    ctx.fillStyle = '#5a1717';
    ctx.beginPath(); ctx.moveTo(2, 26); ctx.lineTo(7, 30); ctx.lineTo(12, 26); ctx.closePath(); ctx.fill();
    propCache.set(key, cv);
    return cv;
  }

  /* Colonna/pilastro della Rocca */
  function pillar() {
    if (propCache.has('pillar')) return propCache.get('pillar');
    const cv = makeCanvas(20, 40);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(1, 0, 18, 40);
    ctx.fillStyle = '#4a4252'; ctx.fillRect(2, 1, 16, 38);
    ctx.fillStyle = '#5a5163'; ctx.fillRect(3, 1, 6, 38);
    ctx.fillStyle = '#332d3b';
    for (let y = 4; y < 40; y += 7) ctx.fillRect(2, y, 16, 1);
    ctx.fillStyle = '#5a5163'; ctx.fillRect(0, 0, 20, 5); ctx.fillRect(0, 35, 20, 5);
    ctx.fillStyle = '#0d0b10'; ctx.fillRect(0, 5, 20, 1); ctx.fillRect(0, 34, 20, 1);
    propCache.set('pillar', cv);
    return cv;
  }

  /* Icona di un oggetto risolto: sceglie lo sprite giusto e lo ricolora. */
  function iconFor(res) {
    if (!res) return sprite('ic_misc');
    if (res.type === 'potion') {
      const col = res.potion ? res.potion.color : '#6fb3ff';
      return sprite('ic_potion', { j: col, w: '#ffffff' });
    }
    const map = {
      w_rusty: ['ic_sword', { o: '#8a7f74', d: '#6b5a3f' }],
      w_iron: ['ic_sword', null],
      w_steel: ['ic_sword', { o: '#dfe6f2' }],
      w_ember: ['ic_sword', { o: '#f0864a', d: '#ffd166' }],
      w_fang: ['ic_sword', { o: '#ffb066', d: '#ffe6a0', l: '#5a1f1f' }],
      w_axe: ['ic_axe', null],
      w_maul: ['ic_maul', null],
      w_dagger: ['ic_dagger', null],
      a_rags: ['ic_robe', { c: '#6b6357', C: '#4c463d' }],
      a_leath: ['ic_robe', { c: '#8a5c30', C: '#5e3d1f' }],
      a_chain: ['ic_armor', null],
      a_plate: ['ic_armor', { M: '#6c7280', o: '#dfe6f2' }],
      a_mantle: ['ic_robe', { c: '#6e6478', C: '#463d50' }],
      t_hearth: ['ic_amulet', { j: '#f06c3a' }],
      t_sigil: ['ic_amulet', { j: '#6fb3ff' }],
      t_ring: ['ic_ring', null],
      t_totem: ['ic_amulet', { d: '#8a6a3f', j: '#a5713f' }],
      t_eye: ['ic_amulet', { j: '#c9a6ff', d: '#8a6fd1' }],
      coin: ['ic_coin', null],
      ingot_iron: ['ic_ingot', null],
      ingot_steel: ['ic_ingot', { m: '#b9c2d0', o: '#eef3fa' }],
      ingot_ember: ['ic_ingot', { m: '#c46a35', o: '#ffb066' }],
      ore_iron: ['ic_ore', null],
      ore_coal: ['ic_ore', { x: '#2e2a33', d: '#4a4550' }],
      ore_ember: ['ic_ore', { x: '#6b4030', d: '#f06c3a' }],
      leather: ['ic_leather', null],
      strips: ['ic_leather', { l: '#8a5c30', L: '#5e3d1f' }],
      pelt: ['ic_leather', { l: '#6f6a60', L: '#4a463f' }],
      bone: ['ic_bone', null],
      heart: ['ic_heart', null],
      key: ['ic_key', null],
      seal: ['ic_coin', { d: '#c9a6ff', D: '#5f3d84' }],
      fang: ['ic_bone', { w: '#e8e2d0' }],
      mark: ['ic_coin', { d: '#a03030', D: '#6b1f1f' }],
      torch: ['ic_maul', { M: '#5a4028', o: '#f06c3a' }],
      pick: ['ic_dagger', { o: '#9aa2b0', d: '#6b5a3f' }],
      herb_ash: ['ic_herb', { e: '#8a8a72', E: '#5f5f4e' }],
      herb_root: ['ic_herb', { e: '#3a2f45', E: '#241d2b' }],
      herb_cap: ['ic_herb', { e: '#6fb3ff', E: '#2f5c9e' }],
      herb_thistle: ['ic_herb', { e: '#f06c3a', E: '#a5451f' }],
      herb_moss: ['ic_herb', { e: '#8f9a8a', E: '#5d6459' }],
      herb_night: ['ic_herb', { e: '#a06fd1', E: '#5f3d84' }],
      herb_wing: ['ic_herb', { e: '#6b8f2f', E: '#3f5a1c' }],
      herb_frost: ['ic_herb', { e: '#a8d8f0', E: '#5a8fa8' }]
    };
    const entry = map[res.icon];
    if (entry) return sprite(entry[0], entry[1]);
    return sprite('ic_misc');
  }

  /* Colori del corpo per i PNG, cosi' si distinguono a colpo d'occhio */
  const NPC_SWAPS = {
    maren:   { c: '#5b4a6e', C: '#3f3350', H: '#6b5a48', h: '#4a3d33' },
    torvald: { c: '#7a3a24', C: '#54281a', H: '#3b2b20', h: '#2a1f17' },
    ilsa:    { c: '#3f5e3f', C: '#2b422b', H: '#8a6a3f', h: '#5f492c' },
    bram:    { c: '#5a4a35', C: '#3e3225', H: '#9a9a9a', h: '#6e6e6e' }
  };

  CV.Art = {
    PAL, SPR, TILE, TILE_DEFS, TILE_KEYS, VARIANTS, NPC_SWAPS,
    MASK_VARIANTS, edgeMask, edgePiece, getShadowTex,
    sprite, flashOf, buildTileAtlas, tileIndex,
    getTileAtlas: () => tileAtlas || buildTileAtlas(),
    tree, rock, bush, house, hearthShrine, handcart, woodpile, pillar, circle, iconFor, makeCanvas,
    stump, tallgrass, flowers, mushrooms, boneheap, barrel, crate,
    gravestone, fence, stalagmite, cobweb, banner,
    loadHdAssets, hdReady, hdHouse, hdProp, hdHeroFrame, hdCombatFrame, hdTile
  };
})(typeof window !== 'undefined' ? window : globalThis);
