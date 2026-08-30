/* ============================================================
   DATABASE DI GIOCO - dati puri, nessuna logica di rendering.
   Questo file e' il primo candidato alla conversione in .json
   per Godot (JSON.parse_string / Resource custom).
   ============================================================ */
(function (root) {
  'use strict';
  const CV = root.CV || (root.CV = {});
  const D = CV.Data = CV.Data || {};

  /* ---------------- Rarita' ---------------- */
  D.rarity = {
    common: { key: 'common', name: 'Comune',      mult: 1.00, value: 1.0, affixes: 0 },
    fine:   { key: 'fine',   name: 'Pregiato',    mult: 1.18, value: 1.8, affixes: 1 },
    rare:   { key: 'rare',   name: 'Raro',        mult: 1.40, value: 3.2, affixes: 2 },
    epic:   { key: 'epic',   name: 'Epico',       mult: 1.70, value: 6.0, affixes: 3 },
    legend: { key: 'legend', name: 'Leggendario', mult: 2.10, value: 12.0, affixes: 4 }
  };
  D.rarityOrder = ['common', 'fine', 'rare', 'epic', 'legend'];

  /* ---------------- Effetti alchemici ----------------
     Come in Skyrim: ogni ingrediente ha 4 effetti; mescolando
     due ingredienti si attivano SOLO gli effetti che hanno in comune. */
  D.effects = {
    heal:    { key: 'heal',    name: 'Ristoro',        color: '#c33636', mode: 'instant', base: 24, unit: 'PF',        desc: 'Recupera punti ferita.' },
    stam:    { key: 'stam',    name: 'Vigore',         color: '#7cc46a', mode: 'instant', base: 30, unit: 'vigore',    desc: 'Recupera vigore.' },
    mana:    { key: 'mana',    name: 'Etere',          color: '#6fb3ff', mode: 'instant', base: 22, unit: 'etere',     desc: 'Recupera etere.' },
    fury:    { key: 'fury',    name: 'Furia',          color: '#f06c3a', mode: 'timed',   base: 0.25, dur: 30, unit: '% danno', desc: 'Aumenta il danno inflitto.' },
    stone:   { key: 'stone',   name: 'Pelle di Pietra',color: '#8f96a3', mode: 'timed',   base: 0.22, dur: 35, unit: '% difesa', desc: 'Riduce il danno subito.' },
    swift:   { key: 'swift',   name: 'Passo Lieve',    color: '#c9a6ff', mode: 'timed',   base: 0.20, dur: 28, unit: '% velocità', desc: 'Aumenta la velocità di movimento.' },
    regen:   { key: 'regen',   name: 'Linfa',          color: '#57a05a', mode: 'timed',   base: 2.2, dur: 20, unit: 'PF/s',   desc: 'Rigenera ferite nel tempo.' },
    venom:   { key: 'venom',   name: 'Veleno',         color: '#6b8f2f', mode: 'timed',   base: 3.5, dur: 8,  unit: 'danno/s', desc: 'Avvelena chi lo beve. Utile solo sui nemici.', harmful: true }
  };

  /* ---------------- Ingredienti alchemici ---------------- */
  D.ingredients = {
    ashbloom:    { id: 'ashbloom',    name: 'Cenerina',        icon: 'herb_ash',   value: 6,  weight: 0.1, fx: ['heal', 'stam', 'venom', 'stone'],  flavor: 'Sboccia solo dove la cenere è ancora calda.' },
    blackroot:   { id: 'blackroot',   name: 'Radice Nera',     icon: 'herb_root',  value: 8,  weight: 0.2, fx: ['stam', 'fury', 'stone', 'mana'],   flavor: 'Cresce aggrovigliata come una mano chiusa.' },
    glowcap:     { id: 'glowcap',     name: 'Fungo Lucente',   icon: 'herb_cap',   value: 9,  weight: 0.1, fx: ['mana', 'heal', 'swift', 'venom'],  flavor: 'Illumina i cunicoli più profondi.' },
    emberthistle:{ id: 'emberthistle',name: 'Cardo di Brace',  icon: 'herb_thistle',value: 12, weight: 0.1, fx: ['fury', 'heal', 'swift', 'mana'],  flavor: 'Punge e brucia allo stesso tempo.' },
    palemoss:    { id: 'palemoss',    name: 'Muschio Pallido', icon: 'herb_moss',  value: 5,  weight: 0.1, fx: ['stone', 'mana', 'regen', 'fury'],  flavor: 'Si aggrappa alle pietre delle rovine.' },
    nightcrown:  { id: 'nightcrown',  name: 'Corolla Notturna',icon: 'herb_night', value: 14, weight: 0.1, fx: ['venom', 'swift', 'stam', 'regen'], flavor: 'Si apre solo quando il sole è sepolto.' },
    beetlewing:  { id: 'beetlewing',  name: 'Ala di Scarabeo', icon: 'herb_wing',  value: 7,  weight: 0.1, fx: ['venom', 'fury', 'stam', 'stone'],  flavor: 'Iridescente, fragile, sorprendentemente potente.' },
    frostpetal:  { id: 'frostpetal',  name: 'Petalo Gelido',   icon: 'herb_frost', value: 11, weight: 0.1, fx: ['stone', 'swift', 'mana', 'regen'], flavor: 'Freddo al tatto anche in piena estate.' }
  };

  /* ---------------- Materiali ---------------- */
  D.materials = {
    iron_ore:    { id: 'iron_ore',    name: 'Minerale di Ferro',   icon: 'ore_iron',   value: 4,  weight: 1.0 },
    iron_ingot:  { id: 'iron_ingot',  name: 'Lingotto di Ferro',   icon: 'ingot_iron', value: 12, weight: 1.0 },
    coal:        { id: 'coal',        name: 'Carbone',             icon: 'ore_coal',   value: 3,  weight: 0.5 },
    steel_ingot: { id: 'steel_ingot', name: "Lingotto d'Acciaio",  icon: 'ingot_steel',value: 30, weight: 1.0 },
    ember_ore:   { id: 'ember_ore',   name: 'Braceferro Grezzo',   icon: 'ore_ember',  value: 22, weight: 1.2 },
    ember_ingot: { id: 'ember_ingot', name: 'Lingotto di Braceferro', icon: 'ingot_ember', value: 70, weight: 1.0 },
    leather:     { id: 'leather',     name: 'Cuoio',               icon: 'leather',    value: 6,  weight: 0.5 },
    strips:      { id: 'strips',      name: 'Strisce di Cuoio',    icon: 'strips',     value: 3,  weight: 0.2 },
    pelt:        { id: 'pelt',        name: 'Pelliccia Cinerea',   icon: 'pelt',       value: 9,  weight: 1.0 },
    bone:        { id: 'bone',        name: 'Osso Annerito',       icon: 'bone',       value: 5,  weight: 0.4 },
    ash_heart:   { id: 'ash_heart',   name: 'Cuore di Cenere',     icon: 'heart',      value: 120,weight: 0.5, flavor: 'Pulsa ancora. Non dovrebbe.' }
  };

  /* ---------------- Armi ----------------
     dmg  = danno base
     spd  = moltiplicatore velocita' di attacco (1 = normale)
     reach= raggio dell'arco di colpo in pixel
     arc  = ampiezza dell'arco in radianti */
  D.weapons = {
    rusty_sword:  { id: 'rusty_sword',  name: 'Spada Arrugginita', icon: 'w_rusty',  dmg: 6,  spd: 1.00, reach: 26, arc: 1.5, stam: 9,  weight: 7,  value: 20,  tier: 0, flavor: 'Meglio di niente. Di poco.' },
    iron_sword:   { id: 'iron_sword',   name: 'Spada di Ferro',    icon: 'w_iron',   dmg: 11, spd: 1.00, reach: 28, arc: 1.5, stam: 10, weight: 9,  value: 70,  tier: 1, flavor: "L'acciaio dei soldati di valle." },
    iron_axe:     { id: 'iron_axe',     name: 'Scure di Ferro',    icon: 'w_axe',    dmg: 15, spd: 0.75, reach: 30, arc: 1.9, stam: 15, weight: 13, value: 90,  tier: 1, flavor: 'Lenta, ma quando arriva, arriva.' },
    hunter_dagger:{ id: 'hunter_dagger',name: 'Pugnale da Caccia', icon: 'w_dagger', dmg: 7,  spd: 1.70, reach: 21, arc: 1.1, stam: 5,  value: 55,  weight: 3, tier: 1, flavor: 'Tre colpi nel tempo di uno.' },
    steel_sword:  { id: 'steel_sword',  name: "Spada d'Acciaio",   icon: 'w_steel',  dmg: 17, spd: 1.00, reach: 30, arc: 1.5, stam: 11, weight: 11, value: 190, tier: 2, flavor: 'Bilanciata come una frase ben detta.' },
    steel_maul:   { id: 'steel_maul',   name: 'Maglio di Acciaio', icon: 'w_maul',   dmg: 26, spd: 0.60, reach: 33, arc: 2.2, stam: 21, weight: 20, value: 240, tier: 2, flavor: 'Non taglia. Non serve.' },
    ember_blade:  { id: 'ember_blade',  name: 'Lama di Brace',     icon: 'w_ember',  dmg: 24, spd: 1.10, reach: 31, arc: 1.6, stam: 11, weight: 10, value: 520, tier: 3, magic: 6, flavor: 'Il metallo non si è mai davvero raffreddato.' },
    pyre_fang:    { id: 'pyre_fang',    name: 'Zanna del Rogo',    icon: 'w_fang',   dmg: 34, spd: 1.20, reach: 33, arc: 1.7, stam: 10, weight: 12, value: 1400,tier: 4, magic: 14, unique: true, flavor: 'Forgiata nel cuore che ha incendiato la valle.' }
  };

  /* ---------------- Armature ----------------
     armor = riduzione danno piatta; res = riduzione percentuale */
  D.armors = {
    rags:        { id: 'rags',        name: 'Vesti Logore',        icon: 'a_rags',  armor: 1,  res: 0.00, weight: 3,  value: 10,  tier: 0, flavor: 'Hanno visto giorni migliori. Molti.' },
    leather_jack:{ id: 'leather_jack',name: 'Giubba di Cuoio',     icon: 'a_leath', armor: 4,  res: 0.05, weight: 8,  value: 80,  tier: 1, flavor: 'Leggera e silenziosa.' },
    chainmail:   { id: 'chainmail',   name: 'Cotta di Maglia',     icon: 'a_chain', armor: 8,  res: 0.10, weight: 18, value: 200, tier: 2, flavor: 'Mille anelli, mille possibilità di sopravvivere.' },
    plate:       { id: 'plate',       name: 'Corazza di Piastre',  icon: 'a_plate', armor: 14, res: 0.16, weight: 32, value: 480, tier: 3, flavor: 'Ti muovi peggio. Ma ti muovi ancora.' },
    ash_mantle:  { id: 'ash_mantle',  name: 'Manto di Cenere',     icon: 'a_mantle',armor: 11, res: 0.22, weight: 12, value: 900, tier: 4, magicBonus: 15, flavor: 'La cenere lo riconosce e lo evita.' }
  };

  /* ---------------- Monili ---------------- */
  D.trinkets = {
    hearth_charm:{ id: 'hearth_charm',name: 'Amuleto del Focolare', icon: 't_hearth', weight: 0.5, value: 150, bonus: { maxHp: 25 },        flavor: 'Tiepido, sempre.' },
    ether_sigil: { id: 'ether_sigil', name: "Sigillo dell'Etere",   icon: 't_sigil',  weight: 0.5, value: 180, bonus: { maxMp: 30, mpRegen: 1.2 }, flavor: 'Ronza vicino alla magia.' },
    wind_ring:   { id: 'wind_ring',   name: 'Anello del Vento',     icon: 't_ring',   weight: 0.2, value: 200, bonus: { moveSpeed: 0.12, maxSp: 20 }, flavor: 'Pesa meno di quanto dovrebbe.' },
    bear_totem:  { id: 'bear_totem',  name: "Totem dell'Orso",      icon: 't_totem',  weight: 1.0, value: 260, bonus: { armor: 5, maxHp: 15 }, flavor: 'Scolpito da mani grandi.' },
    ash_eye:     { id: 'ash_eye',     name: 'Occhio di Cenere',     icon: 't_eye',    weight: 0.3, value: 600, bonus: { damage: 0.15, maxMp: 20 }, flavor: 'Vede attraverso il fumo. E altro.' }
  };

  /* ---------------- Oggetti vari / chiave ---------------- */
  D.misc = {
    gold:        { id: 'gold',        name: 'Oro',                 icon: 'coin',   value: 1,  weight: 0,   stack: true },
    torch:       { id: 'torch',       name: 'Torcia',              icon: 'torch',  value: 5,  weight: 1 },
    lockpick:    { id: 'lockpick',    name: 'Grimaldello',         icon: 'pick',   value: 8,  weight: 0.1 },
    mine_key:    { id: 'mine_key',    name: 'Chiave della Miniera',icon: 'key',    value: 0,  weight: 0.1, quest: true, flavor: 'Il ferro è freddo, la cera del sigillo no.' },
    keep_seal:   { id: 'keep_seal',   name: 'Sigillo del Rogo',    icon: 'seal',   value: 0,  weight: 0.2, quest: true, flavor: 'Un cerchio spezzato in tre punti.' },
    wolf_fang:   { id: 'wolf_fang',   name: 'Zanna di Lupo',       icon: 'fang',   value: 7,  weight: 0.1 },
    bandit_mark: { id: 'bandit_mark', name: 'Marchio dei Banditi', icon: 'mark',   value: 10, weight: 0.1, flavor: 'Prova che qualcuno non tornerà a casa.' }
  };

  /* ---------------- Affissi (generati sul loot) ---------------- */
  D.prefixes = [
    { key: 'sharp',   name: 'Affilata',   on: ['weapon'], mod: { damage: 0.10 } },
    { key: 'heavy',   name: 'Pesante',    on: ['weapon'], mod: { damage: 0.18, atkSpeed: -0.12 } },
    { key: 'quick',   name: 'Rapida',     on: ['weapon'], mod: { atkSpeed: 0.20 } },
    { key: 'burning', name: 'Ardente',    on: ['weapon'], mod: { fireDamage: 5 } },
    { key: 'sturdy',  name: 'Robusta',    on: ['armor'],  mod: { armor: 3 } },
    { key: 'light',   name: 'Leggera',    on: ['armor'],  mod: { weightMod: -0.35, moveSpeed: 0.05 } },
    { key: 'warded',  name: 'Protetta',   on: ['armor'],  mod: { res: 0.05 } },
    { key: 'gilded',  name: 'Dorata',     on: ['weapon', 'armor', 'trinket'], mod: { valueMod: 0.5 } }
  ];
  D.suffixes = [
    { key: 'ofBear',  name: "dell'Orso",   on: ['weapon', 'armor', 'trinket'], mod: { maxHp: 18 } },
    { key: 'ofWolf',  name: 'del Lupo',    on: ['weapon', 'armor', 'trinket'], mod: { moveSpeed: 0.07 } },
    { key: 'ofEmber', name: 'della Brace', on: ['weapon', 'armor', 'trinket'], mod: { fireDamage: 4, maxMp: 12 } },
    { key: 'ofStone', name: 'della Pietra',on: ['armor', 'trinket'],           mod: { armor: 4 } },
    { key: 'ofBreath',name: 'del Respiro', on: ['weapon', 'armor', 'trinket'], mod: { maxSp: 20, spRegen: 2 } },
    { key: 'ofAsh',   name: 'di Cenere',   on: ['weapon', 'armor', 'trinket'], mod: { damage: 0.08, res: 0.04 } }
  ];

  /* ---------------- Ricette di forgiatura ----------------
     skill = livello minimo di Fabbrilità */
  D.smithRecipes = [
    { out: 'iron_ingot',  qty: 1, kind: 'material', cost: { iron_ore: 2 },                        skill: 0,  name: 'Fondere Ferro' },
    { out: 'steel_ingot', qty: 1, kind: 'material', cost: { iron_ingot: 1, coal: 2 },             skill: 20, name: 'Fondere Acciaio' },
    { out: 'ember_ingot', qty: 1, kind: 'material', cost: { ember_ore: 2, coal: 3 },              skill: 45, name: 'Fondere Braceferro' },
    { out: 'strips',      qty: 3, kind: 'material', cost: { leather: 1 },                          skill: 0,  name: 'Tagliare Strisce' },
    { out: 'leather',     qty: 1, kind: 'material', cost: { pelt: 2 },                             skill: 0,  name: 'Conciare Cuoio' },
    { out: 'iron_sword',  qty: 1, kind: 'weapon',   cost: { iron_ingot: 3, strips: 1 },            skill: 5,  name: 'Spada di Ferro' },
    { out: 'iron_axe',    qty: 1, kind: 'weapon',   cost: { iron_ingot: 3, strips: 2 },            skill: 10, name: 'Scure di Ferro' },
    { out: 'hunter_dagger',qty:1, kind: 'weapon',   cost: { iron_ingot: 1, strips: 1 },            skill: 5,  name: 'Pugnale da Caccia' },
    { out: 'leather_jack',qty: 1, kind: 'armor',    cost: { leather: 4, strips: 2 },               skill: 8,  name: 'Giubba di Cuoio' },
    { out: 'steel_sword', qty: 1, kind: 'weapon',   cost: { steel_ingot: 3, strips: 2 },           skill: 30, name: "Spada d'Acciaio" },
    { out: 'steel_maul',  qty: 1, kind: 'weapon',   cost: { steel_ingot: 4, strips: 2 },           skill: 35, name: 'Maglio di Acciaio' },
    { out: 'chainmail',   qty: 1, kind: 'armor',    cost: { steel_ingot: 5, strips: 3 },           skill: 32, name: 'Cotta di Maglia' },
    { out: 'plate',       qty: 1, kind: 'armor',    cost: { steel_ingot: 8, leather: 3 },          skill: 55, name: 'Corazza di Piastre' },
    { out: 'ember_blade', qty: 1, kind: 'weapon',   cost: { ember_ingot: 3, steel_ingot: 2, ash_heart: 1 }, skill: 65, name: 'Lama di Brace' },
    { out: 'ash_mantle',  qty: 1, kind: 'armor',    cost: { ember_ingot: 2, pelt: 4, ash_heart: 1 }, skill: 70, name: 'Manto di Cenere' }
  ];

  /* Costo di potenziamento: dipende dal livello di temperatura attuale */
  D.upgradeCost = function (level) {
    return { iron_ingot: 1 + level, coal: Math.max(1, level) };
  };
  D.MAX_UPGRADE = 5;

  /* ---------------- Nemici ----------------
     ai: 'melee' | 'ranged' | 'charger' | 'boss'
     telegraph = secondi di preavviso prima del colpo (la finestra per parare/schivare) */
  D.enemies = {
    ash_wolf: {
      id: 'ash_wolf', name: 'Lupo Cinereo', sprite: 'e_wolf', ai: 'charger',
      hp: 30, dmg: 8, armor: 0, speed: 62, sight: 190, attackRange: 22,
      telegraph: 0.42, recovery: 0.75, xp: 14, level: 1, radius: 8,
      loot: [{ id: 'pelt', w: 5, min: 1, max: 1 }, { id: 'wolf_fang', w: 4, min: 1, max: 2 }, { id: 'gold', w: 3, min: 2, max: 9 }]
    },
    bandit: {
      id: 'bandit', name: 'Bandito', sprite: 'e_bandit', ai: 'melee',
      hp: 46, dmg: 11, armor: 2, speed: 44, sight: 175, attackRange: 26,
      telegraph: 0.55, recovery: 0.85, xp: 22, level: 2, radius: 8,
      loot: [{ id: 'gold', w: 6, min: 8, max: 26 }, { id: 'bandit_mark', w: 3, min: 1, max: 1 }, { id: 'leather', w: 3, min: 1, max: 2 }, { id: 'iron_sword', w: 1, min: 1, max: 1, equip: true }]
    },
    bandit_archer: {
      id: 'bandit_archer', name: 'Arciere Bandito', sprite: 'e_archer', ai: 'ranged',
      hp: 34, dmg: 13, armor: 1, speed: 40, sight: 240, attackRange: 165, keepDist: 110,
      telegraph: 0.70, recovery: 1.15, xp: 26, level: 3, radius: 8, projectile: 'arrow',
      loot: [{ id: 'gold', w: 6, min: 10, max: 30 }, { id: 'strips', w: 3, min: 1, max: 3 }, { id: 'hunter_dagger', w: 1, min: 1, max: 1, equip: true }]
    },
    cave_spider: {
      id: 'cave_spider', name: 'Ragno delle Grotte', sprite: 'e_spider', ai: 'charger',
      hp: 26, dmg: 7, armor: 0, speed: 70, sight: 165, attackRange: 20,
      telegraph: 0.35, recovery: 0.60, xp: 16, level: 2, radius: 7, venom: 3,
      loot: [{ id: 'beetlewing', w: 5, min: 1, max: 2 }, { id: 'nightcrown', w: 2, min: 1, max: 1 }, { id: 'gold', w: 2, min: 1, max: 6 }]
    },
    revenant: {
      id: 'revenant', name: 'Redivivo di Cenere', sprite: 'e_revenant', ai: 'melee',
      hp: 88, dmg: 18, armor: 6, speed: 30, sight: 200, attackRange: 30,
      telegraph: 0.95, recovery: 1.20, xp: 48, level: 5, radius: 9,
      loot: [{ id: 'bone', w: 6, min: 1, max: 3 }, { id: 'ash_heart', w: 1, min: 1, max: 1 }, { id: 'gold', w: 4, min: 15, max: 45 }, { id: 'ember_ore', w: 2, min: 1, max: 2 }]
    },
    ash_cultist: {
      id: 'ash_cultist', name: 'Cinerario', sprite: 'e_cultist', ai: 'ranged',
      hp: 52, dmg: 20, armor: 2, speed: 36, sight: 250, attackRange: 175, keepDist: 125,
      telegraph: 0.85, recovery: 1.40, xp: 55, level: 6, radius: 8, projectile: 'fireball',
      loot: [{ id: 'gold', w: 5, min: 25, max: 70 }, { id: 'emberthistle', w: 4, min: 1, max: 3 }, { id: 'ember_ore', w: 3, min: 1, max: 3 }, { id: 'ash_heart', w: 2, min: 1, max: 1 }]
    },
    vaelrik: {
      id: 'vaelrik', name: 'Vaelrik, il Rogo', sprite: 'e_boss', ai: 'boss',
      hp: 520, dmg: 26, armor: 9, speed: 46, sight: 400, attackRange: 38,
      telegraph: 0.75, recovery: 0.95, xp: 400, level: 10, radius: 13, boss: true,
      loot: [{ id: 'gold', w: 1, min: 400, max: 600 }, { id: 'ash_heart', w: 1, min: 3, max: 3 }, { id: 'ember_ingot', w: 1, min: 4, max: 4 }]
    }
  };

  /* ---------------- Tabelle di bottino dei forzieri ---------------- */
  D.chestTables = {
    poor: [
      { id: 'gold', w: 8, min: 10, max: 40 },
      { id: 'iron_ore', w: 5, min: 1, max: 3 },
      { id: 'leather', w: 4, min: 1, max: 2 },
      { id: 'lockpick', w: 3, min: 1, max: 3 },
      { id: 'ashbloom', w: 4, min: 1, max: 2 },
      { kind: 'gear', w: 3, tier: 1 }
    ],
    common: [
      { id: 'gold', w: 8, min: 30, max: 90 },
      { id: 'iron_ingot', w: 5, min: 1, max: 3 },
      { id: 'coal', w: 4, min: 1, max: 4 },
      { id: 'blackroot', w: 3, min: 1, max: 2 },
      { kind: 'gear', w: 5, tier: 2 },
      { kind: 'trinket', w: 2 }
    ],
    rich: [
      { id: 'gold', w: 7, min: 90, max: 220 },
      { id: 'steel_ingot', w: 4, min: 1, max: 3 },
      { id: 'ember_ore', w: 4, min: 1, max: 3 },
      { id: 'ash_heart', w: 2, min: 1, max: 1 },
      { kind: 'gear', w: 6, tier: 3 },
      { kind: 'trinket', w: 3 }
    ]
  };

  /* Nodi di raccolta sparsi nel mondo */
  D.harvestNodes = {
    herb:  { icon: 'node_herb',  name: 'Erbe',     respawn: 150, table: ['ashbloom', 'palemoss', 'glowcap', 'blackroot', 'emberthistle', 'nightcrown', 'frostpetal'] },
    ore:   { icon: 'node_ore',   name: 'Filone',   respawn: 220, table: ['iron_ore', 'iron_ore', 'coal', 'ember_ore'] },
    bones: { icon: 'node_bone',  name: 'Ossa',     respawn: 260, table: ['bone', 'bone', 'ash_heart'] }
  };

  /* ---------------- Indice unificato ----------------
     Permette di risolvere qualunque id con una sola funzione. */
  D.baseIndex = {};
  (function buildIndex() {
    const add = (map, type, slot) => {
      for (const k in map) {
        const o = Object.assign({}, map[k]);
        o.type = type;
        if (slot) o.slot = slot;
        if (o.weight == null) o.weight = 0.5;
        if (o.value == null) o.value = 1;
        D.baseIndex[k] = o;
      }
    };
    add(D.weapons, 'weapon', 'weapon');
    add(D.armors, 'armor', 'armor');
    add(D.trinkets, 'trinket', 'trinket');
    add(D.ingredients, 'ingredient');
    add(D.materials, 'material');
    add(D.misc, 'misc');
  })();

  D.base = function (id) { return D.baseIndex[id] || null; };

  /* Formattazione di un effetto alchemico per l'interfaccia.
     Gli effetti percentuali sono memorizzati come frazione (0.24) ma
     vanno mostrati come percentuale (24%). */
  D.fmtMag = function (key, mag) {
    const d = D.effects[key];
    if (!d) return String(mag);
    if (d.unit.charAt(0) === '%') return Math.round(mag * 100) + d.unit;
    return (Math.round(mag * 10) / 10) + ' ' + d.unit;
  };

  /* Elenco degli oggetti equipaggiabili per fascia, usato dal loot generator */
  D.gearByTier = function (tier) {
    const out = [];
    for (const k in D.weapons) if (D.weapons[k].tier <= tier && !D.weapons[k].unique) out.push(k);
    for (const k in D.armors) if (D.armors[k].tier <= tier) out.push(k);
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
