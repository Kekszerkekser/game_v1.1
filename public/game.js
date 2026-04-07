//score wird auf 0 gesetzt wenn prestige. wär cooler wenn alter score da stehen bleibt. Neuen score evtl wo anders einbauen?
//-> wenn geändert leaderboard anpassen
//global und weekly trennen in notion. führt schnell zu verwirrung
//clicken wird nicht belohnt. Entweder mengen erhöhen welche man bekommt oder öfter level upen
//Level ups mehr belohnen. zb x2 auf alle prod + clicks 
//warum veraltet? dann sollte man alte Gebäude verbessern können, das diese wieder "normal" produzieren
//prestige stärker belohnen. nur die Letzten 3 stufen "schwer" machen
//boni von artefacts und quests mit einberechnen bei den Clicks und der produktion
//offline fortschritt "freischalten" indem man gebäude x kaufen muss
//nanobanana für bilder
//test

'use strict';
// ── Constants ─────────────────────────────────────────────────────────────────

const API = '/api';
const TICK_MS = 200; // game update every 200ms
const AUTOSAVE_MS = 60_000;

// Click slots: unlocked at N total buildings, each uses a different res from the current age
const CLICK_SLOTS = [
  { unlockBuildings: 0,  basePower: 2,   resIdx: 0, icon: '👆', label: 'Sammeln' },
  { unlockBuildings: 10, basePower: 1,   resIdx: 1, icon: '⛏️', label: 'Sammeln' },
  { unlockBuildings: 25, basePower: 0.5, resIdx: 2, icon: '🏗️', label: 'Sammeln' },
];

const AGES = [
  { name: 'Stone Age',    icon: '🪨', scene: '🏕️',  label: 'Primitive Settlement',  primaryRes: 'food'        },
  { name: 'Bronze Age',   icon: '🥉', scene: '🏘️',  label: 'Growing Village',       primaryRes: 'food'        },
  { name: 'Iron Age',     icon: '⚒️', scene: '🏰',  label: 'Fortified Town',        primaryRes: 'stone'       },
  { name: 'Medieval',     icon: '👑', scene: '🏯',  label: 'Medieval Kingdom',      primaryRes: 'gold'        },
  { name: 'Renaissance',  icon: '🎨', scene: '🏛️',  label: 'Renaissance City',      primaryRes: 'gold'        },
  { name: 'Industrial',   icon: '⚙️', scene: '🏭',  label: 'Industrial Empire',     primaryRes: 'coal'        },
  { name: 'Modern',       icon: '🌆', scene: '🌃',  label: 'Modern Nation',         primaryRes: 'oil'         },
  { name: 'Space Age',    icon: '🚀', scene: '🌌',  label: 'Space-Faring Civilization', primaryRes: 'credits' },
];

// ── Prestige-Ränge ────────────────────────────────────────────────────────────
const PRESTIGE_RANKS = [
  { min: 0,  label: 'Nomade',      icon: '🏕️' },
  { min: 1,  label: 'Dorfbewohner', icon: '🏘️' },
  { min: 3,  label: 'Häuptling',   icon: '👑' },
  { min: 6,  label: 'König',       icon: '🏰' },
  { min: 11, label: 'Kaiser',      icon: '⚔️' },
  { min: 21, label: 'Legende',     icon: '🌟' },
];

function getPrestigeRank(prestigePoints) {
  let rank = PRESTIGE_RANKS[0];
  for (const r of PRESTIGE_RANKS) {
    if (prestigePoints >= r.min) rank = r;
  }
  return rank;
}

// ── Missions ──────────────────────────────────────────────────────────────────

const MISSION_POOL = [
  { id: 'clicks_50',    type: 'clicks',     icon: '👆', label: '50× klicken',            target: 50,      reward: { food: 200,  wood: 100 } },
  { id: 'clicks_200',   type: 'clicks',     icon: '✋', label: '200× klicken',           target: 200,     reward: { stone: 300, food: 200 } },
  { id: 'clicks_500',   type: 'clicks',     icon: '🖐️', label: '500× klicken',           target: 500,     reward: { bronze: 30, wood: 500 } },
  { id: 'buy_bld_3',    type: 'buy_bld',    icon: '🏗️', label: '3 Gebäude kaufen',       target: 3,       reward: { food: 500,  wood: 300 } },
  { id: 'buy_bld_10',   type: 'buy_bld',    icon: '🏘️', label: '10 Gebäude kaufen',      target: 10,      reward: { stone: 800, food: 600 } },
  { id: 'buy_bld_25',   type: 'buy_bld',    icon: '🏙️', label: '25 Gebäude kaufen',      target: 25,      reward: { iron: 50,   gold: 30 } },
  { id: 'score_5k',     type: 'score_gain', icon: '⭐', label: '5.000 Score verdienen',  target: 5000,    reward: { food: 400,  wood: 200 } },
  { id: 'score_100k',   type: 'score_gain', icon: '🌟', label: '100K Score verdienen',   target: 100000,  reward: { stone: 600, bronze: 100 } },
  { id: 'score_1m',     type: 'score_gain', icon: '💫', label: '1 Mio. Score verdienen', target: 1000000, reward: { gold: 150,  iron: 80 } },
  { id: 'level_up_1',   type: 'level_up',   icon: '🎯', label: '1× aufsteigen',          target: 1,       reward: { food: 400,  stone: 200 } },
  { id: 'level_up_3',   type: 'level_up',   icon: '🎓', label: '3× aufsteigen',          target: 3,       reward: { gold: 80,   bronze: 100 } },
  { id: 'prestige_run', type: 'prestige',   icon: '✨', label: 'Prestige sammeln',       target: 1,       reward: { gold: 500, iron: 300, bronze: 500 } },
];

// ── Charaktere ───────────────────────────────────────────────────────────────
// One historical character per age. Quest = one-time challenge; reward = permanent bonus
// that survives prestige. rewardType: 'click_pct' | 'prod_pct' | 'cost_pct'

const CHARACTERS = [
  {
    id: 'shaman',
    ageIdx: 0,
    name: 'Urk der Schamane',
    icon: '🧙',
    quotes: [
      '"Die Steine sprechen zu denen, die zuhören."',
      '"Feuer ist das erste Geschenk der Götter."',
      '"Ein Stamm überlebt gemeinsam — oder gar nicht."',
    ],
    questType:   'clicks',
    questTarget: 100,
    questLabel:  '100× auf Ressourcen klicken',
    rewardType:  'click_pct',
    rewardValue: 5,
    rewardLabel: '+5% Klickkraft dauerhaft',
  },
  {
    id: 'bronzesmith',
    ageIdx: 1,
    name: 'Keth der Schmied',
    icon: '⚒️',
    quotes: [
      '"Bronze ist nicht nur Metall — es ist Macht."',
      '"Wer das Werkzeug hat, regiert das Dorf."',
      '"Feuer und Geduld verwandeln Erz in Legenden."',
    ],
    questType:   'buy_bld',
    questBldId:  'bronzemine',
    questTarget: 5,
    questLabel:  '5 Bronze-Minen bauen',
    rewardType:  'prod_pct',
    rewardValue: 5,
    rewardLabel: '+5% Produktion dauerhaft',
  },
  {
    id: 'ironlord',
    ageIdx: 2,
    name: 'Valkar der Eisenfürst',
    icon: '⚔️',
    quotes: [
      '"Eisen schlägt Bronze. Der Starke schlägt den Schwachen."',
      '"Eine gute Klinge ist mehr wert als zehn schlechte Krieger."',
      '"Schmieden ist Krieg in der Stille."',
    ],
    questType:   'score',
    questTarget: 1e6,
    questLabel:  '1 Million Score erreichen',
    rewardType:  'click_pct',
    rewardValue: 8,
    rewardLabel: '+8% Klickkraft dauerhaft',
  },
  {
    id: 'king',
    ageIdx: 3,
    name: 'König Aldric',
    icon: '👑',
    quotes: [
      '"Ein Königreich baut man Stein für Stein."',
      '"Gold kauft Loyalität — Weisheit verdient sie."',
      '"Der Thron ist kalt ohne ein Volk dahinter."',
    ],
    questType:   'lvl',
    questTarget: 20,
    questLabel:  'Level 20 erreichen',
    rewardType:  'cost_pct',
    rewardValue: 5,
    rewardLabel: '-5% Gebäude- & Levelkosten dauerhaft',
  },
  {
    id: 'artist',
    ageIdx: 4,
    name: 'Leonardo di Fabbro',
    icon: '🎨',
    quotes: [
      '"Kunst ist die Sprache, die alle verstehen."',
      '"Wissenschaft und Schönheit sind zwei Seiten derselben Münze."',
      '"Die Natur ist das beste Buch — lies sie täglich."',
    ],
    questType:   'buy_bld',
    questBldId:  'academy',
    questTarget: 3,
    questLabel:  '3 Akademien bauen',
    rewardType:  'prod_pct',
    rewardValue: 8,
    rewardLabel: '+8% Produktion dauerhaft',
  },
  {
    id: 'inventor',
    ageIdx: 5,
    name: 'Heinrich von Dampf',
    icon: '⚙️',
    quotes: [
      '"Dampf ist die Seele der modernen Welt."',
      '"Maschinen schlafen nicht — das ist ihr größter Vorteil."',
      '"Wer Kohle hat, hat Kraft."',
    ],
    questType:   'score',
    questTarget: 1e11,
    questLabel:  '100 Mrd. Score erreichen',
    rewardType:  'click_pct',
    rewardValue: 10,
    rewardLabel: '+10% Klickkraft dauerhaft',
  },
  {
    id: 'admiral',
    ageIdx: 6,
    name: 'Admiral Nexus',
    icon: '🌆',
    quotes: [
      '"Öl ist das Blut des 20. Jahrhunderts."',
      '"Information ist Macht — wer sie kontrolliert, regiert."',
      '"Technologie ist der neue Kriegsschauplatz."',
    ],
    questType:   'buy_bld',
    questBldId:  'techlab',
    questTarget: 5,
    questLabel:  '5 Tech-Labs bauen',
    rewardType:  'cost_pct',
    rewardValue: 8,
    rewardLabel: '-8% Gebäude- & Levelkosten dauerhaft',
  },
  {
    id: 'astronaut',
    ageIdx: 7,
    name: 'Kdt. Lyra',
    icon: '🚀',
    quotes: [
      '"Der Kosmos wartet nicht — wir müssen ihm entgegengehen."',
      '"In den Sternen liegt die Zukunft der Menschheit."',
      '"Ein kleiner Schritt für eine Zivilisation, ein Riesensatz für das Universum."',
    ],
    questType:   'prestige',
    questTarget: 1,
    questLabel:  'Einmal Prestige sammeln',
    rewardType:  'prod_pct',
    rewardValue: 15,
    rewardLabel: '+15% Produktion dauerhaft',
  },
];

// ── Artefakte ─────────────────────────────────────────────────────────────────
// 12 artifacts, 1–2 per age. Unlock condition checked each tick.
// Bonus survives prestige. bonusType: 'click_pct' | 'prod_pct' | 'cost_pct'

const ARTIFACTS = [
  // ── Stone Age ──────────────────────────────────────────────────────────────
  {
    id: 'flint_axe',
    ageIdx: 0,
    name: 'Feuersteinbeil',
    icon: '🪓',
    unlockDesc: '200× klicken',
    check: s => (s.clicks || 0) >= 200,
    bonusType: 'click_pct', bonusValue: 12,
    bonusLabel: '+12% Klickkraft',
  },
  {
    id: 'cave_painting',
    ageIdx: 0,
    name: 'Höhlengemälde',
    icon: '🖼️',
    unlockDesc: 'Je 100 Food, Wood & Stone sammeln',
    check: s => (s.res.food||0) >= 100 && (s.res.wood||0) >= 100 && (s.res.stone||0) >= 100,
    bonusType: 'prod_pct', bonusValue: 8,
    bonusLabel: '+8% Produktion',
  },
  // ── Bronze Age ─────────────────────────────────────────────────────────────
  {
    id: 'bronze_mask',
    ageIdx: 1,
    name: 'Bronzemaske',
    icon: '🎭',
    unlockDesc: '5 Bronze-Minen bauen',
    check: s => (s.bld.bronzemine || 0) >= 5,
    bonusType: 'prod_pct', bonusValue: 10,
    bonusLabel: '+10% Produktion',
  },
  {
    id: 'trade_seal',
    ageIdx: 1,
    name: 'Handelssiegel',
    icon: '🔏',
    unlockDesc: '300 Bronze sammeln',
    check: s => (s.res.bronze || 0) >= 300,
    bonusType: 'cost_pct', bonusValue: 5,
    bonusLabel: '-5% Kosten',
  },
  // ── Iron Age ───────────────────────────────────────────────────────────────
  {
    id: 'iron_sword',
    ageIdx: 2,
    name: 'Eisenschwert',
    icon: '⚔️',
    unlockDesc: 'Level 13 erreichen',
    check: s => (s.lvl || 1) >= 13,
    bonusType: 'click_pct', bonusValue: 12,
    bonusLabel: '+12% Klickkraft',
  },
  {
    id: 'legion_helmet',
    ageIdx: 2,
    name: 'Legionärshelm',
    icon: '⛑️',
    unlockDesc: '200 Iron sammeln',
    check: s => (s.res.iron || 0) >= 200,
    bonusType: 'prod_pct', bonusValue: 10,
    bonusLabel: '+10% Produktion',
  },
  // ── Medieval ───────────────────────────────────────────────────────────────
  {
    id: 'holy_grail',
    ageIdx: 3,
    name: 'Heiliger Gral',
    icon: '🏆',
    unlockDesc: '500 Gold sammeln',
    check: s => (s.res.gold || 0) >= 500,
    bonusType: 'prod_pct', bonusValue: 12,
    bonusLabel: '+12% Produktion',
  },
  {
    id: 'knight_armor',
    ageIdx: 3,
    name: 'Ritterrüstung',
    icon: '🛡️',
    unlockDesc: '3 Kathedralen bauen',
    check: s => (s.bld.cathedral || 0) >= 3,
    bonusType: 'cost_pct', bonusValue: 8,
    bonusLabel: '-8% Kosten',
  },
  // ── Renaissance ────────────────────────────────────────────────────────────
  {
    id: 'golden_compass',
    ageIdx: 4,
    name: 'Goldener Kompass',
    icon: '🧭',
    unlockDesc: 'Je 3 Akademien & Art-Studios bauen',
    check: s => (s.bld.academy || 0) >= 3 && (s.bld.studio || 0) >= 3,
    bonusType: 'click_pct', bonusValue: 15,
    bonusLabel: '+15% Klickkraft',
  },
  // ── Industrial ─────────────────────────────────────────────────────────────
  {
    id: 'steam_engine',
    ageIdx: 5,
    name: 'Dampfmaschine',
    icon: '♨️',
    unlockDesc: '5 Fabriken bauen',
    check: s => (s.bld.factory || 0) >= 5,
    bonusType: 'prod_pct', bonusValue: 15,
    bonusLabel: '+15% Produktion',
  },
  // ── Modern ─────────────────────────────────────────────────────────────────
  {
    id: 'microchip',
    ageIdx: 6,
    name: 'Mikroprozessor',
    icon: '💾',
    unlockDesc: '3 Tech-Labs bauen & 1.000 Tech sammeln',
    check: s => (s.bld.techlab || 0) >= 3 && (s.res.tech || 0) >= 1000,
    bonusType: 'click_pct', bonusValue: 15,
    bonusLabel: '+15% Klickkraft',
  },
  // ── Space Age ──────────────────────────────────────────────────────────────
  {
    id: 'moon_shard',
    ageIdx: 7,
    name: 'Mondstein',
    icon: '🌙',
    unlockDesc: 'Level 38 erreichen',
    check: s => (s.lvl || 1) >= 38,
    bonusType: 'prod_pct', bonusValue: 20,
    bonusLabel: '+20% Produktion',
  },
];

// ── Zufalls-Ereignisse ────────────────────────────────────────────────────────
// effect.type: 'prod_mult' | 'click_mult' | 'cost_mult'
// duration in seconds. ageIdx = minimum age required.

const EVENT_POOL = [
  // ── Stone Age ──────────────────────────────────────────────────────────────
  { id: 'great_hunt',   ageIdx: 0, icon: '🦌', name: 'Große Jagd',
    desc: 'Die Herde zieht durch — Klickkraft ×3 für 60 Sek.!',
    effect: { type: 'click_mult', value: 3 }, duration: 60 },
  { id: 'tribal_feast', ageIdx: 0, icon: '🍖', name: 'Stammesfeier',
    desc: 'Das Dorf feiert! Produktion ×2 für 90 Sek.',
    effect: { type: 'prod_mult', value: 2 }, duration: 90 },

  // ── Bronze Age ─────────────────────────────────────────────────────────────
  { id: 'caravan',      ageIdx: 1, icon: '🐪', name: 'Händlerkarawane',
    desc: 'Händler aus dem Osten — Produktion ×2.5 für 75 Sek.!',
    effect: { type: 'prod_mult', value: 2.5 }, duration: 75 },

  // ── Iron Age ───────────────────────────────────────────────────────────────
  { id: 'iron_vein',    ageIdx: 2, icon: '⛏️', name: 'Eisenader entdeckt',
    desc: 'Reiche Erzader gefunden! Produktion ×2 für 120 Sek.',
    effect: { type: 'prod_mult', value: 2 }, duration: 120 },
  { id: 'war_rally',    ageIdx: 2, icon: '⚔️', name: 'Kriegsruf',
    desc: 'Die Legion marschiert! Klickkraft ×4 für 45 Sek.',
    effect: { type: 'click_mult', value: 4 }, duration: 45 },

  // ── Medieval ───────────────────────────────────────────────────────────────
  { id: 'royal_decree', ageIdx: 3, icon: '📜', name: 'Königliches Dekret',
    desc: 'Der König erlässt Steuern — Gebäude 50% günstiger für 60 Sek.!',
    effect: { type: 'cost_mult', value: 0.5 }, duration: 60 },
  { id: 'crusade',      ageIdx: 3, icon: '✝️', name: 'Kreuzzug',
    desc: 'Glaube und Stahl! Klickkraft ×4 für 60 Sek.',
    effect: { type: 'click_mult', value: 4 }, duration: 60 },

  // ── Renaissance ────────────────────────────────────────────────────────────
  { id: 'renaissance_fair', ageIdx: 4, icon: '🎭', name: 'Renaissancefest',
    desc: 'Kunst und Wissenschaft in voller Blüte! Produktion ×3 für 90 Sek.',
    effect: { type: 'prod_mult', value: 3 }, duration: 90 },

  // ── Industrial ─────────────────────────────────────────────────────────────
  { id: 'steam_rush',   ageIdx: 5, icon: '🚂', name: 'Dampfrausch',
    desc: 'Alle Maschinen auf Vollast! Produktion ×3 für 90 Sek.',
    effect: { type: 'prod_mult', value: 3 }, duration: 90 },

  // ── Modern ─────────────────────────────────────────────────────────────────
  { id: 'oil_boom',     ageIdx: 6, icon: '🛢️', name: 'Ölboom',
    desc: 'Schwarzes Gold sprudelt! Produktion ×4 für 75 Sek.',
    effect: { type: 'prod_mult', value: 4 }, duration: 75 },

  // ── Space Age ──────────────────────────────────────────────────────────────
  { id: 'solar_flare',  ageIdx: 7, icon: '☀️', name: 'Sonnensturm',
    desc: 'Kosmische Energie entfesselt! Klickkraft ×5 für 60 Sek.',
    effect: { type: 'click_mult', value: 5 }, duration: 60 },
  { id: 'colony_boom',  ageIdx: 7, icon: '🌌', name: 'Kolonie-Boom',
    desc: 'Neue Siedlung im All! Produktion ×5 für 75 Sek.',
    effect: { type: 'prod_mult', value: 5 }, duration: 75 },
];

// Returns aggregate bonuses from all unlocked artifacts
function getArtifactBonuses() {
  let clickPct = 0, prodPct = 0, costPct = 0;
  if (!state.artifacts) return { clickMult: 1, prodMult: 1, costMult: 1 };
  for (const art of ARTIFACTS) {
    if (!state.artifacts[art.id]) continue;
    if (art.bonusType === 'click_pct') clickPct += art.bonusValue;
    if (art.bonusType === 'prod_pct')  prodPct  += art.bonusValue;
    if (art.bonusType === 'cost_pct')  costPct  += art.bonusValue;
  }
  return {
    clickMult: 1 + clickPct / 100,
    prodMult:  1 + prodPct  / 100,
    costMult:  1 - costPct  / 100,
  };
}

// Checks all artifacts each tick; unlocks and notifies on first discovery
function checkArtifacts() {
  if (!state.artifacts) state.artifacts = {};
  for (const art of ARTIFACTS) {
    if (state.artifacts[art.id]) continue;          // already unlocked
    if (state.age < art.ageIdx) continue;           // age not reached
    if (art.check(state)) {
      state.artifacts[art.id] = Date.now();
      playSound('achievement');
      notify(`🏺 Artefakt gefunden: ${art.icon} ${art.name} — ${art.bonusLabel}`, 'success');
    }
  }
}

// Returns aggregate bonuses from all quest-completed characters
function getCharacterBonuses() {
  let clickPct = 0, prodPct = 0, costPct = 0;
  if (!state.characters) return { clickMult: 1, prodMult: 1, costMult: 1 };
  for (const ch of CHARACTERS) {
    const cs = state.characters[ch.id];
    if (!cs || !cs.questDone) continue;
    if (ch.rewardType === 'click_pct') clickPct += ch.rewardValue;
    if (ch.rewardType === 'prod_pct')  prodPct  += ch.rewardValue;
    if (ch.rewardType === 'cost_pct')  costPct  += ch.rewardValue;
  }
  return {
    clickMult: 1 + clickPct / 100,
    prodMult:  1 + prodPct  / 100,
    costMult:  1 - costPct  / 100,  // cost reduction
  };
}

// Check if a character's quest condition is currently met
function isCharacterQuestMet(ch) {
  switch (ch.questType) {
    case 'clicks':  return (state.clicks || 0) >= ch.questTarget;
    case 'buy_bld': return (state.bld[ch.questBldId] || 0) >= ch.questTarget;
    case 'score':   return (state.score || 0) >= ch.questTarget;
    case 'lvl':     return (state.lvl || 1) >= ch.questTarget;
    case 'prestige':return (state.prestige || 0) >= ch.questTarget;
    default: return false;
  }
}

// Raw progress value for a quest (capped at target)
function getCharacterQuestProgress(ch) {
  switch (ch.questType) {
    case 'clicks':   return Math.min(state.clicks || 0, ch.questTarget);
    case 'buy_bld':  return Math.min(state.bld[ch.questBldId] || 0, ch.questTarget);
    case 'score':    return Math.min(state.score || 0, ch.questTarget);
    case 'lvl':      return Math.min(state.lvl || 1, ch.questTarget);
    case 'prestige': return Math.min(state.prestige || 0, ch.questTarget);
    default: return 0;
  }
}

// ── Character Popup ───────────────────────────────────────────────────────────

let _charPopupPendingQueue = []; // characters waiting to appear (queue to avoid overlap)
let _charPopupOpen = false;

function _charEnsureState(ch) {
  if (!state.characters) state.characters = {};
  if (!state.characters[ch.id]) state.characters[ch.id] = { met: false, questDone: false };
}

function showCharacterIntro(ch) {
  _charEnsureState(ch);
  const cs = state.characters[ch.id];
  if (cs.met && !cs.questDone) return; // already introduced, not done → skip re-intro (shown in gallery later)
  if (cs.met && cs.questDone) return;  // fully done

  // If another popup is open, queue this one
  if (_charPopupOpen) {
    if (!_charPopupPendingQueue.includes(ch.id)) _charPopupPendingQueue.push(ch.id);
    return;
  }

  _charPopupOpen = true;
  const quote = ch.quotes[Math.floor(Math.random() * ch.quotes.length)];
  const progress = getCharacterQuestProgress(ch);
  const pct = Math.min(100, Math.floor(progress / ch.questTarget * 100));

  document.getElementById('char-popup-avatar').textContent = ch.icon;
  document.getElementById('char-popup-name').textContent = ch.name;
  document.getElementById('char-popup-era').textContent = AGES[ch.ageIdx].name;
  document.getElementById('char-popup-quote').textContent = quote;
  document.getElementById('char-popup-body').innerHTML = `
    <div class="char-quest-box">
      <div class="char-quest-title">⚔️ Deine Quest</div>
      <div class="char-quest-label">${ch.questLabel}</div>
      <div class="char-quest-bar-wrap">
        <div class="char-quest-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="char-quest-sub">${fmt(progress)} / ${fmt(ch.questTarget)}</div>
    </div>
    <div class="char-reward-box">
      <span class="char-reward-label">🎁 Belohnung</span>
      <span class="char-reward-val">${ch.rewardLabel}</span>
    </div>`;

  const okBtn = document.getElementById('char-popup-ok');
  okBtn.textContent = 'Quest annehmen!';
  okBtn.onclick = () => {
    state.characters[ch.id].met = true;
    closeCharacterPopup();
  };

  document.getElementById('char-popup-title').textContent = 'Ein Charakter erscheint!';
  openModal(document.getElementById('char-popup'));
  playSound('age');
}

function showCharacterQuestComplete(ch) {
  // If another popup is open, queue and come back
  if (_charPopupOpen) {
    if (!_charPopupPendingQueue.includes(ch.id + '_done')) _charPopupPendingQueue.push(ch.id + '_done');
    return;
  }

  _charPopupOpen = true;
  document.getElementById('char-popup-avatar').textContent = ch.icon;
  document.getElementById('char-popup-name').textContent = ch.name;
  document.getElementById('char-popup-era').textContent = AGES[ch.ageIdx].name;
  document.getElementById('char-popup-quote').textContent = `"Beeindruckend. Du hast mein Vertrauen verdient."`;
  document.getElementById('char-popup-body').innerHTML = `
    <div class="char-quest-box char-quest-done">
      <div class="char-quest-title">✅ Quest abgeschlossen!</div>
      <div class="char-quest-label">${ch.questLabel}</div>
    </div>
    <div class="char-reward-box char-reward-glow">
      <span class="char-reward-label">🎁 Permanente Belohnung</span>
      <span class="char-reward-val">${ch.rewardLabel}</span>
    </div>`;

  const okBtn = document.getElementById('char-popup-ok');
  okBtn.textContent = '✨ Belohnung einlösen!';
  okBtn.onclick = () => {
    state.characters[ch.id].met = true;
    closeCharacterPopup();
  };

  document.getElementById('char-popup-title').textContent = 'Quest erfüllt!';
  openModal(document.getElementById('char-popup'));
  playSound('achievement');
  vibrate([80, 40, 160]);
}

function closeCharacterPopup() {
  closeModal(document.getElementById('char-popup'));
  _charPopupOpen = false;
  // Drain the queue
  if (_charPopupPendingQueue.length > 0) {
    const next = _charPopupPendingQueue.shift();
    setTimeout(() => {
      if (next.endsWith('_done')) {
        const id = next.replace('_done', '');
        const ch = CHARACTERS.find(c => c.id === id);
        if (ch) showCharacterQuestComplete(ch);
      } else {
        const ch = CHARACTERS.find(c => c.id === next);
        if (ch) showCharacterIntro(ch);
      }
    }, 400);
  }
}

// Marks quest as done — called from checkCharacters() each tick
function completeCharacterQuest(ch) {
  _charEnsureState(ch);
  if (state.characters[ch.id].questDone) return;
  state.characters[ch.id].questDone = true;
  showCharacterQuestComplete(ch);
}

function checkCharacters() {
  if (!state.characters) state.characters = {};
  for (const ch of CHARACTERS) {
    if (state.age < ch.ageIdx) continue;
    _charEnsureState(ch);
    const cs = state.characters[ch.id];
    if (!cs.questDone && isCharacterQuestMet(ch)) {
      completeCharacterQuest(ch);
    }
  }
}

// Show intro for current age's character if not yet met
function triggerCharacterForAge(ageIdx) {
  const ch = CHARACTERS.find(c => c.ageIdx === ageIdx);
  if (!ch) return;
  _charEnsureState(ch);
  const cs = state.characters[ch.id];
  if (cs.met || cs.questDone) return;
  showCharacterIntro(ch);
}

// Level → age index
function getAgeForLevel(lvl) {
  if (lvl >= 36) return 7;
  if (lvl >= 31) return 6;
  if (lvl >= 26) return 5;
  if (lvl >= 21) return 4;
  if (lvl >= 16) return 3;
  if (lvl >= 11) return 2;
  if (lvl >= 6)  return 1;
  return 0;
}

// Score needed to unlock level up button (cumulative score, not delta)
const LEVEL_SCORE = [
  0,         // lvl 1  (start)
  500,       // lvl 2
  1500,      // lvl 3
  5000,      // lvl 4
  15000,     // lvl 5
  40000,     // lvl 6  (Bronze Age)
  80000,     // lvl 7
  160000,    // lvl 8
  320000,    // lvl 9
  640000,    // lvl 10
  1.3e6,     // lvl 11 (Iron Age)
  2.6e6,     // lvl 12
  5.2e6,     // lvl 13
  10e6,      // lvl 14
  20e6,      // lvl 15
  50e6,      // lvl 16 (Medieval)
  100e6,     // lvl 17
  200e6,     // lvl 18
  400e6,     // lvl 19
  800e6,     // lvl 20
  1.6e9,     // lvl 21 (Renaissance)
  3.2e9,     // lvl 22
  6.5e9,     // lvl 23
  13e9,      // lvl 24
  26e9,      // lvl 25
  50e9,      // lvl 26 (Industrial)
  100e9,     // lvl 27
  200e9,     // lvl 28
  400e9,     // lvl 29
  800e9,     // lvl 30
  1.6e12,    // lvl 31 (Modern)
  3.2e12,    // lvl 32
  6.5e12,    // lvl 33
  13e12,     // lvl 34
  26e12,     // lvl 35
  50e12,     // lvl 36 (Space Age)
  100e12,    // lvl 37
  200e12,    // lvl 38
  400e12,    // lvl 39
  800e12,    // lvl 40 (max)
];

// Resources per age (which are visible)
const RES_BY_AGE = [
  ['food', 'wood', 'stone'],
  ['food', 'wood', 'stone', 'bronze'],
  ['food', 'wood', 'stone', 'bronze', 'iron'],
  ['gold', 'faith', 'culture'],
  ['gold', 'science', 'art'],
  ['coal', 'steel', 'goods'],
  ['oil', 'electricity', 'tech'],
  ['credits', 'fuel', 'alloys'],
];

// Unique resources introduced per age (used for click-gathering selection)
const UNIQUE_RES_BY_AGE = [
  ['food', 'wood', 'stone'],          // 0 Stone Age  — 3 slots
  ['bronze'],                          // 1 Bronze Age  — 1 slot
  ['iron'],                            // 2 Iron Age    — 1 slot
  ['gold', 'faith', 'culture'],       // 3 Medieval    — 3 slots
  ['science', 'art'],                  // 4 Renaissance — 2 slots
  ['coal', 'steel', 'goods'],         // 5 Industrial  — 3 slots
  ['oil', 'electricity', 'tech'],     // 6 Modern      — 3 slots
  ['credits', 'fuel', 'alloys'],      // 7 Space Age   — 3 slots
];

// Resources shown on click buttons per age — primary/newest resource always first
const CLICK_RES_BY_AGE = [
  ['food', 'wood', 'stone'],           // 0 Stone Age
  ['bronze', 'food', 'wood'],          // 1 Bronze Age:   bronze first
  ['iron', 'bronze', 'food'],          // 2 Iron Age:     iron first
  ['gold', 'faith', 'culture'],        // 3 Medieval
  ['gold', 'science', 'art'],          // 4 Renaissance
  ['coal', 'steel', 'goods'],          // 5 Industrial
  ['oil', 'electricity', 'tech'],      // 6 Modern
  ['credits', 'fuel', 'alloys'],       // 7 Space Age
];

// Grouped for the 3-column display (3 resources per row, null = empty locked slot)
const RES_GROUPS = [
  { id: 'primitive',   label: 'Steinzeit',     icon: '🪨', minAge: 0, resources: ['food', 'wood', 'stone'] },
  { id: 'metals',      label: 'Metalle',        icon: '⛏️', minAge: 1, resources: ['bronze', 'iron', null] },
  { id: 'medieval',    label: 'Mittelalter',    icon: '👑', minAge: 3, resources: ['gold', 'faith', 'culture'] },
  { id: 'renaissance', label: 'Renaissance',    icon: '🎨', minAge: 4, resources: ['science', 'art', null] },
  { id: 'industrial',  label: 'Industrie',      icon: '⚙️', minAge: 5, resources: ['coal', 'steel', 'goods'] },
  { id: 'modern',      label: 'Moderne',        icon: '🌆', minAge: 6, resources: ['oil', 'electricity', 'tech'] },
  { id: 'space',       label: 'Raumfahrt',      icon: '🚀', minAge: 7, resources: ['credits', 'fuel', 'alloys'] },
];

// Which age a resource first becomes available
const RES_FIRST_AGE = (() => {
  const m = {};
  for (let a = 0; a < RES_BY_AGE.length; a++) {
    for (const r of RES_BY_AGE[a]) {
      if (!(r in m)) m[r] = a;
    }
  }
  return m;
})();

const RESOURCES = {
  food:        { name: 'Food',        icon: '🍞' },
  wood:        { name: 'Wood',        icon: '🪵' },
  stone:       { name: 'Stone',       icon: '🪨' },
  bronze:      { name: 'Bronze',      icon: '🥉' },
  iron:        { name: 'Iron',        icon: '⚒️'  },
  gold:        { name: 'Gold',        icon: '💰' },
  faith:       { name: 'Faith',       icon: '⛪' },
  culture:     { name: 'Culture',     icon: '🎭' },
  science:     { name: 'Science',     icon: '🔬' },
  art:         { name: 'Art',         icon: '🎨' },
  coal:        { name: 'Coal',        icon: '🪨' },
  steel:       { name: 'Steel',       icon: '⚙️'  },
  goods:       { name: 'Goods',       icon: '📦' },
  oil:         { name: 'Oil',         icon: '🛢️'  },
  electricity: { name: 'Electricity', icon: '⚡' },
  tech:        { name: 'Technology',  icon: '💻' },
  credits:     { name: 'Credits',     icon: '💎' },
  fuel:        { name: 'Fuel',        icon: '🔥' },
  alloys:      { name: 'Alloys',      icon: '🔩' },
};

// Buildings definition: { id, name, icon, desc, unlockAge, baseProduction, baseCost, costScale }
const BUILDINGS = [
  // Stone Age
  { id: 'camp',           name: 'Hunting Camp',     icon: '🏕️', unlockAge: 0,
    desc: '+0.5 Food/s',  baseProd: { food: 0.5 },
    baseCost: { stone: 10 }, costScale: 1.15 },
  { id: 'lumbermill',     name: 'Lumber Mill',      icon: '🪚', unlockAge: 0,
    desc: '+0.5 Wood/s',  baseProd: { wood: 0.5 },
    baseCost: { food: 15 }, costScale: 1.15 },
  { id: 'quarry',         name: 'Stone Quarry',     icon: '⛏️', unlockAge: 0,
    desc: '+0.5 Stone/s', baseProd: { stone: 0.5 },
    baseCost: { wood: 20 }, costScale: 1.15 },
  // Bronze Age
  { id: 'bronzemine',     name: 'Bronze Mine',      icon: '⛏️', unlockAge: 1,
    desc: '+0.3 Bronze/s', baseProd: { bronze: 0.3 },
    baseCost: { stone: 100 }, costScale: 1.18 },
  { id: 'tradingpost',    name: 'Trading Post',     icon: '🏪', unlockAge: 1,
    desc: '+0.2 Bronze/s, +0.2 Stone/s', baseProd: { bronze: 0.2, stone: 0.2 },
    baseCost: { bronze: 60, wood: 80 }, costScale: 1.18 },
  // Iron Age
  { id: 'ironforge',      name: 'Iron Forge',       icon: '🔨', unlockAge: 2,
    desc: '+0.3 Iron/s',  baseProd: { iron: 0.3 },
    baseCost: { bronze: 200, stone: 150 }, costScale: 1.2 },
  { id: 'barracks',       name: 'Barracks',         icon: '⚔️', unlockAge: 2,
    desc: '+0.2 Iron/s, bonus score', baseProd: { iron: 0.2 },
    baseCost: { iron: 100, wood: 200 }, costScale: 1.2 },
  // Medieval
  { id: 'treasury',       name: 'Treasury',         icon: '💰', unlockAge: 3,
    desc: '+0.5 Gold/s',  baseProd: { gold: 0.5 },
    baseCost: { iron: 500 }, costScale: 1.2 },
  { id: 'cathedral',      name: 'Cathedral',        icon: '⛪', unlockAge: 3,
    desc: '+0.3 Faith/s', baseProd: { faith: 0.3 },
    baseCost: { gold: 300, stone: 500 }, costScale: 1.2 },
  { id: 'library',        name: 'Library',          icon: '📚', unlockAge: 3,
    desc: '+0.3 Culture/s', baseProd: { culture: 0.3 },
    baseCost: { gold: 400, wood: 300 }, costScale: 1.2 },
  // Renaissance
  { id: 'academy',        name: 'Academy',          icon: '🎓', unlockAge: 4,
    desc: '+0.5 Science/s', baseProd: { science: 0.5 },
    baseCost: { gold: 2000, culture: 500 }, costScale: 1.22 },
  { id: 'studio',         name: 'Art Studio',       icon: '🖼️', unlockAge: 4,
    desc: '+0.3 Art/s',   baseProd: { art: 0.3 },
    baseCost: { gold: 1500, science: 300 }, costScale: 1.22 },
  // Industrial
  { id: 'coalmine',       name: 'Coal Mine',        icon: '⛏️', unlockAge: 5,
    desc: '+1 Coal/s',    baseProd: { coal: 1 },
    baseCost: { gold: 10000 }, costScale: 1.2 },
  { id: 'steelmill',      name: 'Steel Mill',       icon: '🏗️', unlockAge: 5,
    desc: '+0.5 Steel/s', baseProd: { steel: 0.5 },
    baseCost: { coal: 2000, iron: 1000 }, costScale: 1.2 },
  { id: 'factory',        name: 'Factory',          icon: '🏭', unlockAge: 5,
    desc: '+0.4 Goods/s', baseProd: { goods: 0.4 },
    baseCost: { steel: 1500, coal: 1000 }, costScale: 1.2 },
  // Modern
  { id: 'oilrig',         name: 'Oil Rig',          icon: '🛢️', unlockAge: 6,
    desc: '+1 Oil/s',     baseProd: { oil: 1 },
    baseCost: { steel: 20000 }, costScale: 1.22 },
  { id: 'powerplant',     name: 'Power Plant',      icon: '⚡', unlockAge: 6,
    desc: '+0.5 Electricity/s', baseProd: { electricity: 0.5 },
    baseCost: { oil: 10000, steel: 5000 }, costScale: 1.22 },
  { id: 'techlab',        name: 'Tech Lab',         icon: '🔬', unlockAge: 6,
    desc: '+0.3 Technology/s', baseProd: { tech: 0.3 },
    baseCost: { electricity: 8000, oil: 5000 }, costScale: 1.22 },
  // Space Age
  { id: 'spaceport',      name: 'Spaceport',        icon: '🚀', unlockAge: 7,
    desc: '+1 Credits/s', baseProd: { credits: 1 },
    baseCost: { electricity: 100000, tech: 50000 }, costScale: 1.25 },
  { id: 'fueldepot',      name: 'Fuel Depot',       icon: '⛽', unlockAge: 7,
    desc: '+0.5 Fuel/s',  baseProd: { fuel: 0.5 },
    baseCost: { credits: 50000 }, costScale: 1.25 },
  { id: 'alloyfoundry',   name: 'Alloy Foundry',    icon: '🔩', unlockAge: 7,
    desc: '+0.3 Alloys/s', baseProd: { alloys: 0.3 },
    baseCost: { credits: 80000, fuel: 30000 }, costScale: 1.25 },
];

// Buildings grouped by age (for the collapsible panel display)
const BLD_GROUPS = [
  { id: 'bld_stone',      label: 'Steinzeit',   icon: '🪨', minAge: 0, bldIds: ['camp', 'lumbermill', 'quarry'] },
  { id: 'bld_bronze',     label: 'Bronzezeit',  icon: '🥉', minAge: 1, bldIds: ['bronzemine', 'tradingpost'] },
  { id: 'bld_iron',       label: 'Eisenzeit',   icon: '⚒️', minAge: 2, bldIds: ['ironforge', 'barracks'] },
  { id: 'bld_medieval',   label: 'Mittelalter', icon: '👑', minAge: 3, bldIds: ['treasury', 'cathedral', 'library'] },
  { id: 'bld_renaissance',label: 'Renaissance', icon: '🎨', minAge: 4, bldIds: ['academy', 'studio'] },
  { id: 'bld_industrial', label: 'Industrie',   icon: '⚙️', minAge: 5, bldIds: ['coalmine', 'steelmill', 'factory'] },
  { id: 'bld_modern',     label: 'Moderne',     icon: '🌆', minAge: 6, bldIds: ['oilrig', 'powerplant', 'techlab'] },
  { id: 'bld_space',      label: 'Raumfahrt',   icon: '🚀', minAge: 7, bldIds: ['spaceport', 'fueldepot', 'alloyfoundry'] },
];

// Achievements
const ACHIEVEMENTS = [
  { id: 'click10',   icon: '👆', name: 'Erste Schritte',       desc: '10× geklickt',                   bonus: 'click', check: s => (s.clicks||0) >= 10 },
  { id: 'click100',  icon: '✋', name: 'Fleißige Hände',       desc: '100× geklickt',                  bonus: 'click', check: s => (s.clicks||0) >= 100 },
  { id: 'click1k',   icon: '🖐️', name: 'Unermüdlich',          desc: '1.000× geklickt',                bonus: 'click', check: s => (s.clicks||0) >= 1000 },
  { id: 'bld1',      icon: '🏗️', name: 'Erste Baustelle',      desc: 'Erstes Gebäude gebaut',          bonus: 'bld',   check: s => Object.values(s.bld||{}).reduce((a,b)=>a+b,0) >= 1 },
  { id: 'bld10',     icon: '🏘️', name: 'Kleine Siedlung',      desc: '10 Gebäude besitzen',            bonus: 'bld',   check: s => Object.values(s.bld||{}).reduce((a,b)=>a+b,0) >= 10 },
  { id: 'bld25',     icon: '🏙️', name: 'Wachsende Stadt',      desc: '25 Gebäude besitzen',            bonus: 'bld',   check: s => Object.values(s.bld||{}).reduce((a,b)=>a+b,0) >= 25 },
  { id: 'bld50',     icon: '🌆', name: 'Metropole',             desc: '50 Gebäude besitzen',            bonus: 'bld',   check: s => Object.values(s.bld||{}).reduce((a,b)=>a+b,0) >= 50 },
  { id: 'score1k',   icon: '⭐', name: 'Anfänger',              desc: '1.000 Score erreicht',           bonus: 'score', check: s => (s.score||0) >= 1000 },
  { id: 'score1m',   icon: '🌟', name: 'Fortgeschritten',       desc: '1 Million Score',                bonus: 'score', check: s => (s.score||0) >= 1e6 },
  { id: 'score1b',   icon: '💫', name: 'Legende',               desc: '1 Milliarde Score',              bonus: 'score', check: s => (s.score||0) >= 1e9 },
  { id: 'score1t',   icon: '🔮', name: 'Gottheit',              desc: '1 Billion Score',                bonus: 'score', check: s => (s.score||0) >= 1e12 },
  { id: 'age1',      icon: '🥉', name: 'Bronzezeit',            desc: 'Bronzezeit erreicht',            bonus: null,    check: s => (s.age||0) >= 1 },
  { id: 'age3',      icon: '👑', name: 'Mittelalter',           desc: 'Mittelalter erreicht',           bonus: null,    check: s => (s.age||0) >= 3 },
  { id: 'age5',      icon: '⚙️', name: 'Industriezeitalter',   desc: 'Industriezeitalter erreicht',    bonus: null,    check: s => (s.age||0) >= 5 },
  { id: 'age7',      icon: '🚀', name: 'Raumfahrtzeitalter',   desc: 'Space Age erreicht',             bonus: null,    check: s => (s.age||0) >= 7 },
  { id: 'lvl10',     icon: '🎯', name: 'Aufsteiger',            desc: 'Level 10 erreicht',              bonus: null,    check: s => (s.lvl||1) >= 10 },
  { id: 'lvl20',     icon: '🎓', name: 'Meister',               desc: 'Level 20 erreicht',              bonus: null,    check: s => (s.lvl||1) >= 20 },
  { id: 'lvlmax',    icon: '♾️', name: 'Unsterblich',           desc: 'Max Level (40) erreicht',        bonus: null,    check: s => (s.lvl||1) >= 40 },
];

// Returns { clickMult, prodMult } from unlocked achievements
function getAchievementBonuses() {
  let clickBonus = 0; // additive %
  let prodBonus  = 0;
  for (const ach of ACHIEVEMENTS) {
    if (!state.achievements[ach.id]) continue;
    if (ach.bonus === 'click') { clickBonus += 5; }
    if (ach.bonus === 'bld')   { prodBonus  += 2; }
    if (ach.bonus === 'score') { clickBonus += 1; prodBonus += 1; }
  }
  return { clickMult: 1 + clickBonus / 100, prodMult: 1 + prodBonus / 100 };
}

function achBonusLabel(ach) {
  if (ach.bonus === 'click') return '+5% Klickkraft';
  if (ach.bonus === 'bld')   return '+2% Produktion';
  if (ach.bonus === 'score') return '+1% zu allem';
  return null;
}

// Level-up costs (per level)
function prestigeCostDiscount() {
  // 3% per prestige point, capped at 50%
  return Math.min(0.5, (state.prestige || 0) * 0.03);
}

function getLevelCost(lvl, age) {
  const mult = Math.pow(2, lvl - 1);
  const discount = (1 - prestigeCostDiscount()) * getCharacterBonuses().costMult * getArtifactBonuses().costMult * (activeEvent?.costMult || 1);
  const costs = {};
  const visible = RES_BY_AGE[age] || [];
  if (visible.length >= 1) costs[visible[0]] = Math.floor(100 * mult * discount);
  if (visible.length >= 2) costs[visible[1]] = Math.floor(50 * mult * discount);
  return costs;
};

// ── Game State ────────────────────────────────────────────────────────────────

let state = {
  lvl: 1,
  age: 0,
  score: 0,
  allTimeScore: 0,           // cumulative score across all prestige runs
  clicks: 0,
  clickPower: 2,             // kept for backward compat (= clickPowers[0])
  clickPowers: [2, 1, 0.5],
  clicksBySlot: [0, 0, 0],
  achievements: {},
  weeklyBaseScore: 0,
  weeklyStartTs: null,
  gatherAge: 0, // which age's unique resources the click buttons gather
  prestige: 0,  // accumulated prestige points
  res: Object.fromEntries(Object.keys(RESOURCES).map(k => [k, 0])),
  bld: Object.fromEntries(BUILDINGS.map(b => [b.id, 0])),
  upgradedBlds: {},          // buildings upgraded to remove deprecation penalty
  missions: {},
  characters: {},
  artifacts: {},
  ts: new Date().toISOString(),
};

let token = null;
let username = null;
let autoSaveTimer = null;
let lastTick = Date.now();
let prevAge = 0;
let tickCount = 0;
let currentLbEvent = 'Global';

// ── Random-Event runtime state (not persisted) ────────────────────────────────
let activeEvent   = null; // { pool entry, endTs, prodMult, clickMult, costMult }
let nextEventTs   = 0;    // epoch ms when next event fires

// ── Settings ──────────────────────────────────────────────────────────────────

let settings = { autosaveInterval: 60, offlineCapHours: 8, showNotifications: true, soundEnabled: true, vibrationEnabled: true };
let collapsedGroups = {}; // group.id → true if collapsed
let collapsedBldGroups = {}; // bld group id → true if collapsed
let audioCtx = null;

function loadSettings() {
  try { Object.assign(settings, JSON.parse(localStorage.getItem('game_settings') || '{}')); } catch {}
}

function saveSettings() {
  localStorage.setItem('game_settings', JSON.stringify(settings));
}

function restartAutosave() {
  clearInterval(autoSaveTimer);
  if (settings.autosaveInterval > 0) {
    autoSaveTimer = setInterval(() => saveGame(true), settings.autosaveInterval * 1000);
  }
}



// ── Audio System (Web Audio API — no files needed) ────────────────────────────

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window['webkitAudioContext'])();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(freq, type, vol, dur, delay = 0) {
  const ctx = getAudioCtx();
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.01);
}

function vibrate(pattern) {
  if (!settings.vibrationEnabled) return;
  if (!navigator.vibrate) return;
  navigator.vibrate(pattern);
}

function playSound(type) {
  if (!settings.soundEnabled) return;
  try {
    switch (type) {
      case 'click':
        playTone(660, 'sine', 0.07, 0.07);
        break;
      case 'build':
        playTone(200, 'triangle', 0.12, 0.12);
        playTone(260, 'triangle', 0.08, 0.10, 0.06);
        break;
      case 'sell':
        playTone(330, 'triangle', 0.09, 0.1);
        playTone(220, 'triangle', 0.06, 0.08, 0.07);
        break;
      case 'levelup':
        [523, 659, 784, 1047].forEach((f, i) => playTone(f, 'sine', 0.12, 0.22, i * 0.11));
        break;
      case 'achievement':
        [784, 1047, 1319].forEach((f, i) => playTone(f, 'sine', 0.10, 0.28, i * 0.13));
        break;
      case 'age':
        [261, 329, 392, 523, 659].forEach((f, i) => playTone(f, 'sine', 0.14, 0.5, i * 0.18));
        break;
      case 'save':
        playTone(440, 'sine', 0.06, 0.09);
        playTone(550, 'sine', 0.04, 0.07, 0.09);
        break;
      case 'upgrade':
        playTone(880, 'sine', 0.10, 0.15);
        playTone(1100, 'sine', 0.07, 0.12, 0.10);
        break;
      case 'event':
        playTone(440, 'triangle', 0.10, 0.15);
        playTone(550, 'triangle', 0.08, 0.15, 0.12);
        playTone(660, 'triangle', 0.06, 0.20, 0.24);
        break;
    }
  } catch {}
}

// ── Helper functions ──────────────────────────────────────────────────────────

function getTotalBuildings() {
  return Object.values(state.bld).reduce((a, b) => a + b, 0);
}

// Cost to upgrade a deprecated building to full production (uses current age resources)
function getUpgradeCost(bld) {
  const count = Math.max(1, state.bld[bld.id] || 0);
  const currentAgeRes = RES_BY_AGE[state.age] || RES_BY_AGE[0];
  const base = Math.floor(300 * Math.pow(2, bld.unlockAge) * Math.sqrt(count));
  const costs = {};
  if (currentAgeRes[0]) costs[currentAgeRes[0]] = base;
  if (currentAgeRes[1]) costs[currentAgeRes[1]] = Math.floor(base * 0.5);
  return costs;
}

function upgradeBuilding(id) {
  const bld = BUILDINGS.find(b => b.id === id);
  if (!bld || !isDeprecated(bld)) return;
  if (state.upgradedBlds && state.upgradedBlds[id]) return; // already upgraded
  const cost = getUpgradeCost(bld);
  if (!canAfford(cost)) { notify('Nicht genug Ressourcen für das Upgrade!', 'error'); return; }
  for (const [res, amt] of Object.entries(cost)) {
    state.res[res] = (state.res[res] || 0) - amt;
  }
  if (!state.upgradedBlds) state.upgradedBlds = {};
  state.upgradedBlds[id] = true;
  playSound('upgrade');
  notify(`🔧 ${bld.icon} ${bld.name} upgraded — produziert wieder 100%!`, 'success');
  renderBuildings();
}

// Returns Monday 00:00:00 of the current week as a timestamp
function getWeekStart() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon...6=Sat
  const daysToMon = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMon);
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

// Resets weekly base score if we're in a new week
function checkWeeklyReset() {
  const weekStart = getWeekStart();
  if (!state.weeklyStartTs || state.weeklyStartTs < weekStart) {
    state.weeklyBaseScore = state.score;
    state.weeklyStartTs = weekStart;
  }
}

// ── Utility ───────────────────────────────────────────────────────────────────

function fmt(n) {
  const d = window.innerWidth < 400 ? 1 : 2;
  if (n >= 1e18) return (n / 1e18).toFixed(d) + 'Qi';
  if (n >= 1e15) return (n / 1e15).toFixed(d) + 'Qa';
  if (n >= 1e12) return (n / 1e12).toFixed(d) + 'T';
  if (n >= 1e9)  return (n / 1e9).toFixed(d) + 'B';
  if (n >= 1e6)  return (n / 1e6).toFixed(d) + 'M';
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

function fmtRate(n) {
  if (Math.abs(n) < 0.001) return '';
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '/s';
}

function fmtTime(seconds) {
  if (seconds < 60)    return `${Math.ceil(seconds)}s`;
  if (seconds < 3600)  return `${Math.ceil(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} Std`;
  return `${(seconds / 86400).toFixed(1)} Tage`;
}

function notify(msg, type = 'info') {
  if (!settings.showNotifications) return;
  const el = document.getElementById('notifications');
  const div = document.createElement('div');
  div.className = 'notification';
  div.style.borderColor = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent)';
  div.textContent = msg;
  el.appendChild(div);
  setTimeout(() => div.remove(), 4000);
}

function showFloat(x, y, text) {
  const el = document.createElement('div');
  el.className = 'click-float';
  el.style.left = (x - 20) + 'px';
  el.style.top = (y - 30) + 'px';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

// ── Production calculation ────────────────────────────────────────────────────

function getBuildingCost(bld) {
  const count = state.bld[bld.id] || 0;
  const costMult = getCharacterBonuses().costMult * getArtifactBonuses().costMult * (activeEvent?.costMult || 1);
  const costs = {};
  for (const [res, base] of Object.entries(bld.baseCost)) {
    costs[res] = Math.ceil(base * Math.pow(bld.costScale, count) * costMult);
  }
  return costs;
}

// Total cost of buying n buildings starting at current count (geometric series sum)
function getBuildingCostN(bld, n) {
  if (n <= 0) return {};
  const count = state.bld[bld.id] || 0;
  const s = bld.costScale;
  const costMult = getCharacterBonuses().costMult * getArtifactBonuses().costMult * (activeEvent?.costMult || 1);
  const costs = {};
  for (const [res, base] of Object.entries(bld.baseCost)) {
    const total = base * Math.pow(s, count) * (Math.pow(s, n) - 1) / (s - 1);
    costs[res] = Math.ceil(total * costMult);
  }
  return costs;
}

// How many can the player afford right now? (binary search, capped at 500)
function getMaxAffordable(bld) {
  if (!canAfford(getBuildingCost(bld))) return 0;
  let lo = 1, hi = 500;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    canAfford(getBuildingCostN(bld, mid)) ? (lo = mid) : (hi = mid - 1);
  }
  return lo;
}

function canAfford(costs) {
  for (const [res, amt] of Object.entries(costs)) {
    if ((state.res[res] || 0) < amt) return false;
  }
  return true;
}

function prestigeMultiplier() {
  // Each prestige adds a production bonus (stronger early, log-scaling)
  const p = state.prestige || 0;
  if (p === 0) return 1;
  return 1 + 0.15 * Math.log2(p + 1);
}

function prestigeClickMultiplier() {
  // Each prestige adds a click bonus
  const p = state.prestige || 0;
  if (p === 0) return 1;
  return 1 + 0.05 * Math.log2(p + 1);
}

function getLevelMultiplier() {
  // +2% production & click bonus per level above 1
  return 1 + 0.02 * (state.lvl - 1);
}

const DEPRECATION_FACTOR = 0.2; // buildings from a previous age produce at 20%

function isDeprecated(bld) {
  return bld.unlockAge < state.age;
}

function getTotalProduction() {
  const prod = Object.fromEntries(Object.keys(RESOURCES).map(k => [k, 0]));
  const mult = prestigeMultiplier() * getLevelMultiplier() * getAchievementBonuses().prodMult * getCharacterBonuses().prodMult * getArtifactBonuses().prodMult * (activeEvent?.prodMult || 1);
  for (const bld of BUILDINGS) {
    const count = state.bld[bld.id] || 0;
    if (count === 0) continue;
    const isUpgraded = state.upgradedBlds && state.upgradedBlds[bld.id];
    const ageMult = (isDeprecated(bld) && !isUpgraded) ? DEPRECATION_FACTOR : 1;
    for (const [res, rate] of Object.entries(bld.baseProd)) {
      prod[res] += rate * count * mult * ageMult;
    }
  }
  return prod;
}

// ── Game Loop ─────────────────────────────────────────────────────────────────

function tick() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 60); // cap at 60s to prevent huge offline jumps
  lastTick = now;

  const prod = getTotalProduction();
  let scoreGain = 0;

  for (const [res, rate] of Object.entries(prod)) {
    const gain = rate * dt;
    state.res[res] = (state.res[res] || 0) + gain;
    scoreGain += gain;
  }
  state.score += scoreGain;

  // Check age advancement
  const newAge = getAgeForLevel(state.lvl);
  if (newAge !== prevAge) {
    handleAgeChange(newAge);
  }

  tickCount++;
  updateResourceValues(prod);
  renderLevelProgress();
  renderPrestige();
  renderLevelETA();
  updateTopBar();
  if (tickCount % 5 === 0) updateBuildingButtons(); // every 1s
  if (tickCount % 5 === 0) updateMissionsBtn();    // every 1s (score_gain check)
  if (tickCount % 5 === 0) checkCharacters();      // every 1s
  if (tickCount % 5 === 0) checkArtifacts();       // every 1s
  if (tickCount % 5 === 0) renderClickButtons();   // every 1s (keeps effective power display in sync)
  tickEvents();
  checkAchievements();
}

function offlineProgress(savedTs) {
  const elapsed = Math.min((Date.now() - new Date(savedTs).getTime()) / 1000, (settings.offlineCapHours || 8) * 3600);
  if (elapsed < 10) return;
  // Offline progress requires at least one building
  if (getTotalBuildings() < 1) return;
  const prod = getTotalProduction();
  let scoreGain = 0;
  for (const [res, rate] of Object.entries(prod)) {
    const gain = rate * elapsed;
    state.res[res] = (state.res[res] || 0) + gain;
    scoreGain += gain;
  }
  state.score += scoreGain;
  const mins = Math.floor(elapsed / 60);
  if (mins > 0) notify(`Welcome back! +${fmt(scoreGain)} score while offline (${mins} min)`);
}

// ── Age Change ────────────────────────────────────────────────────────────────

function handleAgeChange(newAge) {
  prevAge = newAge;
  state.age = newAge;
  document.body.dataset.age = newAge;

  const age = AGES[newAge];
  document.getElementById('age-icon').textContent = age.icon;
  document.getElementById('age-name').textContent = age.name;
  document.getElementById('civ-scene').textContent = age.scene;
  document.getElementById('civ-label').textContent = age.label;
  renderClickButtons();
  renderResources(null);
  renderBuildings();
  if (newAge > 0) playSound('age');

  if (newAge > 0) {
    // Show transition overlay
    const overlay = document.getElementById('age-transition');
    document.getElementById('at-icon').textContent = age.icon;
    document.getElementById('at-title').textContent = `New Age: ${age.name}!`;
    document.getElementById('at-desc').textContent = `Your civilization has advanced! New buildings and resources are now available.`;
    overlay.style.display = 'flex';
  }

  // Show character intro after age transition overlay fades (2.2s delay)
  setTimeout(() => triggerCharacterForAge(newAge), 2200);
}

// ── Render ────────────────────────────────────────────────────────────────────

// Lightweight tick update: only patch text nodes, no DOM rebuild
function updateResourceValues(prod) {
  const list = document.getElementById('resources-list');
  // If the DOM isn't built yet (first tick before full render), fall back to full render
  if (!list || !list.querySelector('.res-cell-val')) {
    renderResources(prod);
    return;
  }
  for (const resKey of Object.keys(RESOURCES)) {
    const val = state.res[resKey] || 0;
    const rate = prod ? (prod[resKey] || 0) : 0;
    const valEl = list.querySelector(`.res-cell-val[data-res="${resKey}"]`);
    const rateEl = list.querySelector(`.res-cell-rate[data-res="${resKey}"]`);
    if (valEl) valEl.textContent = fmt(val);
    if (rateEl) rateEl.textContent = rate > 0 ? fmtRate(rate) : '';
  }
  const prod2 = prod || getTotalProduction();
  const totalRate = Object.values(prod2).reduce((a, b) => a + b, 0);
  document.getElementById('production-rate').textContent = totalRate > 0 ? `Gesamt: ${fmtRate(totalRate)}` : '';
}

function renderResources(prod) {
  const list = document.getElementById('resources-list');
  let html = '';

  for (const group of RES_GROUPS) {
    const groupUnlocked = state.age >= group.minAge;
    const isCollapsed = !groupUnlocked || !!collapsedGroups[group.id];

    html += `<div class="res-group">
      <div class="res-group-header${groupUnlocked ? '' : ' locked-group'}" onclick="toggleResGroup('${group.id}')">
        <span class="res-group-label">${group.icon} ${group.label}</span>
        <span class="res-group-arrow">${!groupUnlocked ? '🔒' : (isCollapsed ? '▶' : '▼')}</span>
      </div>`;

    if (!isCollapsed) {
      html += `<div class="res-group-grid">`;
      for (const resKey of group.resources) {
        if (resKey === null) {
          html += `<div class="resource-cell res-cell-locked"><span class="res-cell-icon">—</span></div>`;
          continue;
        }
        const firstAge = RES_FIRST_AGE[resKey] ?? 99;
        const locked = state.age < firstAge;
        if (locked) {
          html += `<div class="resource-cell res-cell-locked">
            <span class="res-cell-icon">🔒</span>
            <span class="res-cell-name">???</span>
          </div>`;
        } else {
          const r = RESOURCES[resKey];
          const val = state.res[resKey] || 0;
          const rate = prod ? (prod[resKey] || 0) : 0;
          html += `<div class="resource-cell">
            <span class="res-cell-icon">${r.icon}</span>
            <span class="res-cell-name">${r.name}</span>
            <span class="res-cell-val" data-res="${resKey}">${fmt(val)}</span>
            <span class="res-cell-rate" data-res="${resKey}">${rate > 0 ? fmtRate(rate) : ''}</span>
          </div>`;
        }
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  list.innerHTML = html;
  const prod2 = prod || getTotalProduction();
  const totalRate = Object.values(prod2).reduce((a, b) => a + b, 0);
  document.getElementById('production-rate').textContent = totalRate > 0 ? `Gesamt: ${fmtRate(totalRate)}` : '';
}

function toggleResGroup(id) {
  const group = RES_GROUPS.find(g => g.id === id);
  if (!group || state.age < group.minAge) return;
  collapsedGroups[id] = !collapsedGroups[id];
  renderResources(null);
}

function renderLevelProgress() {
  const lvl = state.lvl;
  const maxLvl = LEVEL_SCORE.length;
  const isMax = lvl >= maxLvl;

  document.getElementById('lv-current').textContent = lvl;
  document.getElementById('current-level').textContent = lvl;

  if (isMax) {
    document.getElementById('lv-score-display').textContent = 'MAX LEVEL';
    document.getElementById('lv-progress-fill').style.width = '100%';
    document.getElementById('levelup-btn').disabled = true;
    document.getElementById('levelup-text').textContent = 'Max Level';
    document.getElementById('levelup-cost').textContent = '';
    return;
  }

  const threshold = LEVEL_SCORE[lvl] || Infinity;
  const prevThreshold = LEVEL_SCORE[lvl - 1] || 0;
  const progress = Math.min((state.score - prevThreshold) / (threshold - prevThreshold), 1);

  document.getElementById('lv-score-display').textContent = `${fmt(state.score)} / ${fmt(threshold)}`;
  document.getElementById('lv-progress-fill').style.width = (progress * 100) + '%';

  const cost = getLevelCost(lvl, state.age);
  const costStr = Object.entries(cost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.name || r}`).join(', ');
  const scoreReady = state.score >= threshold;
  const canAffordIt = canAfford(cost);
  const ready = scoreReady && canAffordIt;

  document.getElementById('levelup-btn').disabled = !ready;
  document.getElementById('levelup-text').textContent = !scoreReady ? `Score needed` : !canAffordIt ? 'Need resources' : '⬆ Level Up!';
  document.getElementById('levelup-cost').textContent = `Costs: ${costStr}`;
}

const PRESTIGE_MIN_LEVEL = 3; // minimum level required to prestige

function renderPrestige() {
  const p = state.prestige || 0;
  const mult = prestigeMultiplier();
  const canPrestige = state.lvl >= PRESTIGE_MIN_LEVEL;
  const btn = document.getElementById('prestige-btn');
  const info = document.getElementById('prestige-info');
  if (!btn || !info) return;
  btn.disabled = !canPrestige;
  btn.textContent = canPrestige
    ? `✨ Prestige — Alles zurücksetzen & neu starten`
    : `✨ Prestige (ab Level ${PRESTIGE_MIN_LEVEL} verfügbar)`;
  const discount = prestigeCostDiscount();
  const discountStr = discount > 0 ? ` — Levelkosten −${Math.round(discount * 100)}%` : '';
  info.textContent = `Prestige: ${p} — Produktion ×${mult.toFixed(2)}${discountStr}`;
}

function renderLevelETA() {
  const el = document.getElementById('level-eta');
  if (!el) return;

  const lvl = state.lvl;
  if (lvl >= LEVEL_SCORE.length) { el.textContent = ''; return; }

  const prod = getTotalProduction();
  const totalRate = Object.values(prod).reduce((a, b) => a + b, 0);

  if (totalRate <= 0) {
    el.textContent = '⏱ Keine Produktion aktiv';
    return;
  }

  // Time to reach the score threshold
  const threshold = LEVEL_SCORE[lvl] || Infinity;
  let secsNeeded = Math.max(0, threshold - state.score) / totalRate;

  // Time to accumulate missing level-up resources
  const cost = getLevelCost(lvl, state.age);
  for (const [res, needed] of Object.entries(cost)) {
    const missing = Math.max(0, needed - (state.res[res] || 0));
    if (missing <= 0) continue;
    const rate = prod[res] || 0;
    secsNeeded = rate > 0 ? Math.max(secsNeeded, missing / rate) : Infinity;
  }

  if (!isFinite(secsNeeded)) {
    el.textContent = '⏱ Benötigte Ressource wird nicht produziert';
    return;
  }
  if (secsNeeded <= 0) {
    el.textContent = '✅ Level Up bereit!';
    return;
  }
  el.textContent = `⏱ Nächstes Level in ~${fmtTime(secsNeeded)}`;
}

function doPrestige() {
  if (state.lvl < PRESTIGE_MIN_LEVEL) return;
  const p = (state.prestige || 0) + 1;
  const nextMult = (1 + 0.05 * Math.log2(p + 1)).toFixed(2);
  if (!confirm(
    `Prestige sammeln?\n\n` +
    `• Level, Gebäude, Ressourcen & Score werden zurückgesetzt\n` +
    `• Du startest bei Level 1\n` +
    `• Neue Produktionsmultiplikator: ×${nextMult}\n\n` +
    `Prestige-Punkte & Erfolge bleiben erhalten.`
  )) return;

  // Save what persists
  const achievements = state.achievements;
  const weeklyBaseScore = state.weeklyBaseScore;
  const weeklyStartTs = state.weeklyStartTs;
  const characters = state.characters; // quest completions survive prestige
  const artifacts  = state.artifacts;  // artifact unlocks survive prestige
  const allTimeScore = (state.allTimeScore || 0) + state.score;
  const upgradedBlds = state.upgradedBlds; // upgrades survive prestige

  // Full reset
  state.lvl = 1;
  state.age = 0;
  state.score = 0;
  state.allTimeScore = allTimeScore;
  state.clicks = 0;
  state.clickPower = 2;
  state.clickPowers = [2, 1, 0.5];
  state.clicksBySlot = [0, 0, 0];
  state.gatherAge = 0;
  state.prestige = p;
  state.res = Object.fromEntries(Object.keys(RESOURCES).map(k => [k, 0]));
  state.bld = Object.fromEntries(BUILDINGS.map(b => [b.id, 0]));
  state.achievements = achievements;
  state.weeklyBaseScore = weeklyBaseScore;
  state.weeklyStartTs = weeklyStartTs;
  state.characters = characters;
  state.artifacts  = artifacts;
  state.upgradedBlds = upgradedBlds;
  // Reset scoreSnapshot so score-gain missions track from 0 after prestige
  if (state.missions?.scoreSnapshot !== undefined) state.missions.scoreSnapshot = 0;
  incrementMission('prestige', 1);

  prevAge = 0;
  collapsedBldGroups = {};

  playSound('age');
  notify(`✨ Prestige ${p}! Produktion jetzt ×${prestigeMultiplier().toFixed(2)} — Viel Erfolg!`, 'success');

  // Save state without submitting score (score is 0 after reset)
  state.ts = new Date().toISOString();
  localStorage.setItem('game_save', stateToJson());
  if (token) {
    fetch(`${API}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ saveData: stateToJson() }),
    }).catch(() => {});
  }

  // Full re-render
  renderBuildings();
  renderPrestige();
  renderLevelProgress();
  renderClickButtons();
  updateTopBar();
}

function updateBuildingButtons() {
  for (const bld of BUILDINGS) {
    if (bld.unlockAge > state.age) continue;
    const cost1 = getBuildingCost(bld);
    const a1   = canAfford(cost1);
    const a5   = canAfford(getBuildingCostN(bld, 5));
    const a10  = canAfford(getBuildingCostN(bld, 10));
    const maxN = getMaxAffordable(bld);
    const count = state.bld[bld.id] || 0;
    const id = bld.id;

    const patch = (qty, ok) => {
      const btn = document.querySelector(`[data-bld="${id}"][data-qty="${qty}"]`);
      if (!btn) return;
      btn.disabled = !ok;
      btn.classList.toggle('dim', !ok);
    };

    patch('1',  a1);
    patch('5',  a5);
    patch('10', a10);

    const maxBtn = document.querySelector(`[data-bld="${id}"][data-qty="max"]`);
    if (maxBtn) {
      maxBtn.disabled = maxN === 0;
      maxBtn.classList.toggle('dim', maxN === 0);
      maxBtn.textContent = `Max${maxN > 0 ? ` (${maxN})` : ''}`;
    }

    const sellBtn = document.querySelector(`[data-bld="${id}"][data-qty="sell"]`);
    if (sellBtn) sellBtn.disabled = count === 0;
  }
}

function renderBuildings() {
  const list = document.getElementById('buildings-list');
  let html = '';

  for (const group of BLD_GROUPS) {
    const groupUnlocked = state.age >= group.minAge;
    const isCollapsed = !groupUnlocked || !!collapsedBldGroups[group.id];
    const groupBuildings = group.bldIds.map(id => BUILDINGS.find(b => b.id === id)).filter(Boolean);
    const groupCount = groupBuildings.reduce((s, b) => s + (state.bld[b.id] || 0), 0);

    html += `<div class="bld-group">
      <div class="bld-group-header${groupUnlocked ? '' : ' locked-group'}" onclick="toggleBldGroup('${group.id}')">
        <span class="bld-group-label">${group.icon} ${group.label}</span>
        <span class="bld-group-right">
          ${groupCount > 0 ? `<span class="bld-group-count">${groupCount}</span>` : ''}
          <span class="bld-group-arrow">${!groupUnlocked ? '🔒' : (isCollapsed ? '▶' : '▼')}</span>
        </span>
      </div>`;

    if (!isCollapsed) {
      html += `<div class="bld-group-cards">`;
      for (const bld of groupBuildings) {
        const count = state.bld[bld.id] || 0;
        const locked = bld.unlockAge > state.age;
        const cost1 = getBuildingCost(bld);
        const costStr = Object.entries(cost1).map(([r, v]) => `<span>${fmt(v)}</span> ${RESOURCES[r]?.icon || ''} ${RESOURCES[r]?.name || r}`).join(', ');

        let actionsHtml = '';
        if (!locked) {
          const maxN = getMaxAffordable(bld);
          const a1  = canAfford(cost1);
          const a5  = canAfford(getBuildingCostN(bld, 5));
          const a10 = canAfford(getBuildingCostN(bld, 10));
          actionsHtml = `<div class="building-actions">
            <div class="buy-btns">
              <button class="buy-btn${a1  ? '' : ' dim'}" data-bld="${bld.id}" data-qty="1"   onclick="buyBuildingN('${bld.id}',1)"  ${a1  ? '' : 'disabled'}>1×</button>
              <button class="buy-btn${a5  ? '' : ' dim'}" data-bld="${bld.id}" data-qty="5"   onclick="buyBuildingN('${bld.id}',5)"  ${a5  ? '' : 'disabled'}>5×</button>
              <button class="buy-btn${a10 ? '' : ' dim'}" data-bld="${bld.id}" data-qty="10"  onclick="buyBuildingN('${bld.id}',10)" ${a10 ? '' : 'disabled'}>10×</button>
              <button class="buy-btn buy-max${maxN > 0 ? '' : ' dim'}" data-bld="${bld.id}" data-qty="max" onclick="buyBuildingN('${bld.id}',0)" ${maxN > 0 ? '' : 'disabled'}>Max${maxN > 0 ? ` (${maxN})` : ''}</button>
            </div>
            <button class="sell-btn" data-bld="${bld.id}" data-qty="sell" onclick="sellBuilding('${bld.id}')" ${count === 0 ? 'disabled' : ''}
              title="${count > 0 ? 'Rückgabe: ' + Object.entries(getSellRefund(bld)).map(([r,v]) => `${fmt(v)} ${RESOURCES[r]?.name||r}`).join(', ') : ''}">
              ↩ Sell${count > 0 ? ` (${Object.entries(getSellRefund(bld)).map(([r,v]) => `+${fmt(v)} ${RESOURCES[r]?.icon||''}`).join(' ')})` : ''}
            </button>
          </div>`;
        }

        const deprecated = !locked && isDeprecated(bld);
        const isUpgraded = deprecated && state.upgradedBlds && state.upgradedBlds[bld.id];
        let deprecatedHtml = '';
        if (deprecated) {
          if (isUpgraded) {
            deprecatedHtml = `<div class="deprecated-badge upgraded-badge">✅ Modernisiert — 100% Produktion</div>`;
          } else {
            const upgCost = getUpgradeCost(bld);
            const upgCostStr = Object.entries(upgCost).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.icon || ''}`).join(' + ');
            const canUpg = canAfford(upgCost);
            deprecatedHtml = `<div class="deprecated-badge">⚠️ Veraltet — nur ${Math.round(DEPRECATION_FACTOR * 100)}% Produktion
              <button class="upgrade-btn${canUpg ? '' : ' dim'}" onclick="upgradeBuilding('${bld.id}')" ${canUpg ? '' : 'disabled'} title="Kosten: ${upgCostStr}">🔧 Modernisieren (${upgCostStr})</button>
            </div>`;
          }
        }
        html += `<div class="building-card ${locked ? 'locked' : ''} ${deprecated && !isUpgraded ? 'deprecated' : ''}">
          <div class="building-header">
            <span class="building-name">${bld.icon} ${bld.name}</span>
            <span class="building-count">${count}</span>
          </div>
          ${deprecatedHtml}
          <div class="building-desc">${bld.desc}</div>
          <div class="building-cost">${locked ? `🔒 Freischaltbar: ${AGES[bld.unlockAge].icon} ${AGES[bld.unlockAge].name}` : `Cost: ${costStr}`}</div>
          ${actionsHtml}
        </div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  list.innerHTML = html;
}

function toggleBldGroup(id) {
  const group = BLD_GROUPS.find(g => g.id === id);
  if (!group || state.age < group.minAge) return;
  collapsedBldGroups[id] = !collapsedBldGroups[id];
  renderBuildings();
}

function updateTopBar() {
  document.getElementById('total-score').textContent = fmt(state.score);
  const allTimeEl = document.getElementById('all-time-score');
  if (allTimeEl) {
    const allTime = (state.allTimeScore || 0) + state.score;
    allTimeEl.textContent = allTime > state.score ? `Gesamt: ${fmt(allTime)}` : '';
  }
  const rank = getPrestigeRank(state.prestige || 0);
  const nameEl = document.getElementById('player-name');
  nameEl.innerHTML = `<span class="prestige-rank-icon" title="${rank.label} (Prestige ${state.prestige || 0})">${rank.icon}</span>${username || ''}`;
}

function fmtFraction(n) {
  if (n >= 1e6)  return fmt(n);
  if (n >= 1000) return fmt(n);
  if (n >= 100)  return Math.round(n).toString();
  if (n >= 10)   return n.toFixed(1);
  return n.toFixed(2); // zeigt 1.10, 1.21 etc. korrekt an
}

function clickLevelThreshold(lvl) {
  return Math.floor(50 * Math.pow(1.5, lvl));
}

function clickLevelInfo(totalClicks) {
  let lvl = 0, spent = 0;
  while (true) {
    const needed = clickLevelThreshold(lvl);
    if (spent + needed > totalClicks) return { lvl, toNext: needed - (totalClicks - spent) };
    spent += needed;
    lvl++;
  }
}

function renderClickButtons() {
  const container = document.getElementById('click-btns-container');
  if (!container) return;
  const totalBld = getTotalBuildings();
  const clickRes = CLICK_RES_BY_AGE[state.gatherAge] || CLICK_RES_BY_AGE[0];

  function upgInfo(slotIdx) {
    return clickLevelInfo(state.clicksBySlot[slotIdx] || 0);
  }

  // Pre-compute shared multipliers (same for all slots)
  const bonusMult = prestigeClickMultiplier() * getLevelMultiplier() * getAchievementBonuses().clickMult * getCharacterBonuses().clickMult * getArtifactBonuses().clickMult * (activeEvent?.clickMult || 1);

  // Slot 0: primary large button
  const s0 = CLICK_SLOTS[0];
  const res0 = RESOURCES[clickRes[0]];
  const base0 = state.clickPowers[0] || s0.basePower;
  const eff0 = base0 * bonusMult;
  const u0 = upgInfo(0);
  let html = `<button class="click-btn" data-slot="0">
    <span class="click-icon">${res0?.icon || '👆'}</span>
    <span class="click-label">${s0.label} ${res0?.name || ''}</span>
    <span class="click-power">+${fmtFraction(eff0)} ${res0?.name || ''}</span>
    <span class="click-upg-row"><span class="click-upg-lvl">Lvl ${u0.lvl}</span><span class="click-upg-next">⬆ ${u0.toNext}</span></span>
  </button>
  <div class="click-btns-row">`;

  for (let i = 1; i < CLICK_SLOTS.length; i++) {
    const slot = CLICK_SLOTS[i];
    const resKey = clickRes[i];
    const res = resKey ? RESOURCES[resKey] : null;
    const locked = totalBld < slot.unlockBuildings;
    const baseP = state.clickPowers[i] || slot.basePower;
    const effP = baseP * bonusMult;
    const ui = upgInfo(i);
    html += `<button class="click-btn-secondary${locked ? ' slot-locked' : ''}" data-slot="${i}"${locked ? ' disabled' : ''}>
      <span class="click-icon">${locked ? '🔒' : (res?.icon || '⛏️')}</span>
      <span class="click-label">${locked ? slot.unlockBuildings + ' Geb.' : slot.label + ' ' + (res?.name || '')}</span>
      ${locked
        ? `<span class="slot-unlock-hint">bei ${slot.unlockBuildings} Gebäuden</span>`
        : `<span class="click-power">+${fmtFraction(effP)} ${res?.name || ''}</span>
           <span class="click-upg-row"><span class="click-upg-lvl">Lvl ${ui.lvl}</span><span class="click-upg-next">⬆ ${ui.toNext}</span></span>`
      }
    </button>`;
  }
  html += '</div>';
  container.innerHTML = html;
}

// ── Actions ───────────────────────────────────────────────────────────────────

function doClick(e, slotIdx = 0) {
  const slot = CLICK_SLOTS[slotIdx] || CLICK_SLOTS[0];
  const clickRes = CLICK_RES_BY_AGE[state.gatherAge] || CLICK_RES_BY_AGE[0];
  const resKey = clickRes[slotIdx];
  if (!resKey) return;

  const basePower = state.clickPowers[slotIdx] !== undefined ? state.clickPowers[slotIdx] : slot.basePower;
  const power = basePower * prestigeClickMultiplier() * getLevelMultiplier() * getAchievementBonuses().clickMult * getCharacterBonuses().clickMult * getArtifactBonuses().clickMult * (activeEvent?.clickMult || 1);
  state.res[resKey] = (state.res[resKey] || 0) + power;
  state.score += power;
  state.clicks++;
  incrementMission('clicks', 1);
  const prevClicks = state.clicksBySlot[slotIdx] || 0;
  const prevLvl = clickLevelInfo(prevClicks).lvl;
  state.clicksBySlot[slotIdx] = prevClicks + 1;

  if (e) {
    const btn = (e.target && e.target.closest && e.target.closest('[data-slot]')) || e.currentTarget;
    const rect = btn.getBoundingClientRect();
    showFloat(rect.left + rect.width / 2, rect.top, `+${fmtFraction(power)} ${RESOURCES[resKey].icon}`);
  }

  playSound('click');
  vibrate(50);

  // Per-slot click power upgrade on level-up
  const { lvl: newLvl, toNext } = clickLevelInfo(state.clicksBySlot[slotIdx]);
  if (newLvl > prevLvl) {
    state.clickPowers[slotIdx] = +(state.clickPowers[slotIdx] * 1.2).toFixed(4);
    state.clickPower = state.clickPowers[0]; // keep compat field in sync
    renderClickButtons();
    playSound('upgrade');
    notify(`✨ ${RESOURCES[resKey].name} Klickstärke Lvl ${newLvl}: +${fmtFraction(state.clickPowers[slotIdx])} pro Klick`);
  } else {
    // Update only the "toNext" counter in-place without full re-render
    const container = document.getElementById('click-btns-container');
    if (container) {
      const btn = container.querySelector(`[data-slot="${slotIdx}"]`);
      const span = btn && btn.querySelector('.click-upg-next');
      if (span) span.textContent = `⬆ ${toNext}`;
    }
  }
}

// ── Mission System ────────────────────────────────────────────────────────────

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Deterministic pseudo-random pick of 3 missions based on date string
function pickDailyMissions(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = (hash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  const available = MISSION_POOL.map((_, i) => i);
  const picks = [];
  for (let slot = 0; slot < 3; slot++) {
    hash = Math.abs((hash * 1664525 + 1013904223) | 0);
    const idx = hash % available.length;
    picks.push(available.splice(idx, 1)[0]);
  }
  return picks;
}

function initMissions() {
  const today = getTodayStr();
  if (!state.missions) state.missions = {};
  if (state.missions.date !== today) {
    const picks = pickDailyMissions(today);
    state.missions = {
      date: today,
      scoreSnapshot: state.score,
      daily: picks.map(idx => ({ poolId: MISSION_POOL[idx].id, progress: 0, claimed: false })),
    };
  }
}

function getMissionProgress(m) {
  const pool = MISSION_POOL.find(p => p.id === m.poolId);
  if (!pool) return 0;
  if (pool.type === 'score_gain') {
    return Math.max(0, state.score - (state.missions.scoreSnapshot || 0));
  }
  return m.progress || 0;
}

function isMissionComplete(m) {
  const pool = MISSION_POOL.find(p => p.id === m.poolId);
  return pool ? getMissionProgress(m) >= pool.target : false;
}

function incrementMission(type, amount = 1) {
  if (!state.missions || !state.missions.daily) return;
  let changed = false;
  for (const m of state.missions.daily) {
    if (m.claimed) continue;
    const pool = MISSION_POOL.find(p => p.id === m.poolId);
    if (pool && pool.type === type) {
      m.progress = (m.progress || 0) + amount;
      changed = true;
    }
  }
  if (changed) updateMissionsBtn();
}

function claimMission(idx) {
  if (!state.missions || !state.missions.daily) return;
  const m = state.missions.daily[idx];
  if (!m || m.claimed || !isMissionComplete(m)) return;

  const pool = MISSION_POOL.find(p => p.id === m.poolId);
  if (!pool) return;
  m.claimed = true;

  const rewardLines = [];
  for (const [res, amt] of Object.entries(pool.reward)) {
    state.res[res] = (state.res[res] || 0) + amt;
    rewardLines.push(`${RESOURCES[res]?.icon || ''} ${fmt(amt)} ${RESOURCES[res]?.name || res}`);
  }

  playSound('achievement');
  vibrate([60, 40, 120]);
  notify(`✅ Mission abgeschlossen! ${rewardLines.join(', ')} erhalten`, 'success');
  renderMissions();
  updateMissionsBtn();
}

function updateMissionsBtn() {
  const btn = document.getElementById('missions-btn');
  if (!btn || !state.missions || !state.missions.daily) return;
  const claimable = state.missions.daily.filter(m => !m.claimed && isMissionComplete(m)).length;
  const badge = btn.querySelector('.missions-badge');
  if (badge) {
    badge.textContent = claimable || '';
    badge.style.display = claimable > 0 ? 'flex' : 'none';
  }
}

function renderMissions() {
  const grid = document.getElementById('missions-grid');
  if (!grid) return;

  if (!state.missions || !state.missions.daily || !state.missions.daily.length) {
    grid.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:2rem">Lade Missionen...</div>';
    return;
  }

  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const msLeft = midnight - now;
  const hLeft = Math.floor(msLeft / 3600000);
  const mLeft = Math.floor((msLeft % 3600000) / 60000);

  grid.innerHTML = `
    <div class="missions-meta">
      <span>📅 ${state.missions.date}</span>
      <span class="missions-reset">🔄 Reset in ${hLeft}h ${mLeft}m</span>
    </div>
    ${state.missions.daily.map((m, idx) => {
      const pool = MISSION_POOL.find(p => p.id === m.poolId);
      if (!pool) return '';
      const progress = getMissionProgress(m);
      const pct = Math.min(100, Math.floor(progress / pool.target * 100));
      const complete = isMissionComplete(m);
      const rewardStr = Object.entries(pool.reward)
        .map(([r, v]) => `${RESOURCES[r]?.icon || ''} ${fmt(v)} ${RESOURCES[r]?.name || r}`)
        .join(' &nbsp;·&nbsp; ');

      return `
        <div class="mission-card${complete && !m.claimed ? ' mission-ready' : ''}${m.claimed ? ' mission-claimed' : ''}">
          <div class="mission-top">
            <span class="mission-icon">${pool.icon}</span>
            <div class="mission-info">
              <div class="mission-label">${pool.label}</div>
              <div class="mission-sub">${fmt(Math.min(progress, pool.target))} / ${fmt(pool.target)}</div>
            </div>
            ${m.claimed
              ? '<span class="mission-check">✅</span>'
              : complete
                ? `<button class="btn-claim" onclick="claimMission(${idx})">Abholen!</button>`
                : `<span class="mission-pct">${pct}%</span>`}
          </div>
          <div class="mission-bar-wrap">
            <div class="mission-bar-fill${pct >= 100 ? ' mission-bar-full' : ''}" style="width:${pct}%"></div>
          </div>
          <div class="mission-reward">🎁 ${rewardStr}</div>
        </div>`;
    }).join('')}
  `;
}

// ── Random Events ─────────────────────────────────────────────────────────────

function scheduleNextEvent() {
  // 3–8 minutes from now
  nextEventTs = Date.now() + (180 + Math.random() * 300) * 1000;
}

function fireRandomEvent() {
  // Pick eligible events (age <= current age)
  const eligible = EVENT_POOL.filter(e => e.ageIdx <= state.age);
  if (!eligible.length) return;
  const ev = eligible[Math.floor(Math.random() * eligible.length)];

  const prodMult  = ev.effect.type === 'prod_mult'  ? ev.effect.value : 1;
  const clickMult = ev.effect.type === 'click_mult' ? ev.effect.value : 1;
  const costMult  = ev.effect.type === 'cost_mult'  ? ev.effect.value : 1;

  activeEvent = { ev, endTs: Date.now() + ev.duration * 1000, prodMult, clickMult, costMult };

  showEventBanner();
  playSound('event');
  vibrate([50, 30, 100]);
  scheduleNextEvent();
}

function deactivateEvent() {
  activeEvent = null;
  hideEventBanner();
}

function showEventBanner() {
  const banner = document.getElementById('event-banner');
  if (!banner || !activeEvent) return;
  const { ev } = activeEvent;
  banner.querySelector('.ev-icon').textContent = ev.icon;
  banner.querySelector('.ev-name').textContent = ev.name;
  banner.querySelector('.ev-desc').textContent = ev.desc;
  banner.style.display = 'flex';
  // Trigger CSS enter animation by toggling class
  banner.classList.remove('ev-enter');
  requestAnimationFrame(() => banner.classList.add('ev-enter'));
}

function hideEventBanner() {
  const banner = document.getElementById('event-banner');
  if (!banner) return;
  banner.classList.remove('ev-enter');
  // Small delay so CSS transition plays before display:none
  setTimeout(() => { if (!activeEvent) banner.style.display = 'none'; }, 350);
}

function updateEventBanner() {
  const banner = document.getElementById('event-banner');
  if (!banner || !activeEvent) return;
  const secsLeft = Math.max(0, Math.ceil((activeEvent.endTs - Date.now()) / 1000));
  const fill = banner.querySelector('.ev-timer-fill');
  const countdown = banner.querySelector('.ev-countdown');
  if (fill)      fill.style.width = `${(secsLeft / activeEvent.ev.duration * 100).toFixed(1)}%`;
  if (countdown) countdown.textContent = `${secsLeft}s`;
}

function tickEvents() {
  const now = Date.now();
  if (activeEvent && now >= activeEvent.endTs) {
    deactivateEvent();
    return;
  }
  if (!activeEvent && now >= nextEventTs && nextEventTs > 0) {
    fireRandomEvent();
  }
  if (activeEvent) updateEventBanner();
}

// ── Achievements ──────────────────────────────────────────────────────────────

function checkAchievements() {
  for (const ach of ACHIEVEMENTS) {
    if (state.achievements[ach.id]) continue;
    if (ach.check(state)) {
      state.achievements[ach.id] = Date.now();
      playSound('achievement');
      const bonusLabel = achBonusLabel(ach);
      notify(`🏅 Erfolg: ${ach.icon} ${ach.name} — ${ach.desc}${bonusLabel ? ` (${bonusLabel})` : ''}`, 'success');
    }
  }
}

// ── Minimap / Roadmap ─────────────────────────────────────────────────────────

const AGE_MIN_LEVEL = [1, 6, 11, 16, 21, 26, 31, 36];

function setGatherAge(ageIdx) {
  if (ageIdx > state.age) return;
  state.gatherAge = ageIdx;
  renderClickButtons();
  renderGatherAgeBar();
}

function renderGatherAgeBar() {
  const bar = document.getElementById('gather-age-bar');
  if (!bar) return;
  let html = '';
  for (let i = 0; i <= state.age; i++) {
    const age = AGES[i];
    const sel = state.gatherAge === i;
    html += `<button class="gather-age-btn${sel ? ' selected' : ''}" onclick="setGatherAge(${i})" title="${age.name}">
      ${age.icon}
    </button>`;
  }
  bar.innerHTML = html;
}

function renderMinimap() {
  const grid = document.getElementById('minimap-grid');
  if (!grid) return;

  let html = '';
  for (let i = 0; i < AGES.length; i++) {
    const age       = AGES[i];
    const unlocked  = state.age >= i;
    const isCurrent = state.age === i;
    const isGather  = state.gatherAge === i;
    const minLvl    = AGE_MIN_LEVEL[i];
    const maxLvl    = AGE_MIN_LEVEL[i + 1] ? AGE_MIN_LEVEL[i + 1] - 1 : 40;

    let cls = 'minimap-zone';
    if (!unlocked) cls += ' mz-locked';
    else if (isCurrent) cls += ' mz-current mz-unlocked';
    else cls += ' mz-unlocked';
    if (isGather) cls += ' mz-gather';

    html += `<div class="${cls}" ${unlocked ? `onclick="selectMinimapZone(${i})"` : ''}>
      <div class="mz-scene">${unlocked ? age.scene : '🔒'}</div>
      <div class="mz-icon">${unlocked ? age.icon : ''}</div>
      <div class="mz-name">${unlocked ? age.name : '???'}</div>
      <div class="mz-lvlbadge">Lvl ${minLvl}–${maxLvl}</div>
      ${isCurrent ? '<div class="mz-current-badge">Aktuell</div>' : ''}
      ${isGather  ? '<div class="mz-current-badge" style="background:var(--success,#4caf50);margin-top:0.15rem">🌾 Sammeln</div>' : ''}
    </div>`;
  }
  grid.innerHTML = html;

  // Show detail for currently selected gather age
  showMinimapDetail(state.gatherAge);
}

function showMinimapDetail(ageIdx) {
  const detail    = document.getElementById('minimap-detail');
  if (!detail) return;
  detail.style.display = 'block';
  const age       = AGES[ageIdx];
  const minLvl    = AGE_MIN_LEVEL[ageIdx];
  const maxLvl    = AGE_MIN_LEVEL[ageIdx + 1] ? AGE_MIN_LEVEL[ageIdx + 1] - 1 : 40;
  const uniqueRes = UNIQUE_RES_BY_AGE[ageIdx] || [];
  const ageBuilds = BUILDINGS.filter(b => b.unlockAge === ageIdx);
  const isCurrent = state.age === ageIdx;
  const isGather  = state.gatherAge === ageIdx;
  const lvlsDone  = isCurrent ? Math.max(0, state.lvl - minLvl) : state.age > ageIdx ? (maxLvl - minLvl + 1) : 0;
  const lvlsTotal = maxLvl - minLvl + 1;
  const slotLabels = ['immer', '10+ Geb.', '25+ Geb.'];

  detail.innerHTML = `
    <div class="mzd-header">
      <span class="mzd-scene">${age.scene}</span>
      <div style="flex:1">
        <div class="mzd-title">${age.icon} ${age.name}</div>
        <div class="mzd-label">${age.label}</div>
      </div>
      ${isGather ? '<span style="font-size:0.75rem;color:var(--success,#4caf50)">🌾 Aktives Sammel-Zeitalter</span>' : `<button class="btn-primary" style="font-size:0.75rem;padding:0.4rem 0.8rem" onclick="setGatherAge(${ageIdx});renderMinimap()">🌾 Hier sammeln</button>`}
    </div>
    <div class="mzd-section">
      <div class="mzd-section-title">Klick-Ressourcen (${uniqueRes.length} Slot${uniqueRes.length !== 1 ? 's' : ''})</div>
      <div class="mzd-tags">
        ${uniqueRes.map((r, idx) => `<span class="mzd-tag">
          ${RESOURCES[r]?.icon || ''} ${RESOURCES[r]?.name || r}
          <span style="color:var(--text-muted);font-size:0.6rem;margin-left:0.2rem">${slotLabels[idx] ?? '25+ Geb.'}</span>
        </span>`).join('')}
        ${uniqueRes.length < 3
          ? Array(3 - uniqueRes.length).fill('<span class="mzd-tag" style="opacity:0.4">— leer</span>').join('')
          : ''}
      </div>
    </div>
    <div class="mzd-section">
      <div class="mzd-section-title">Gebäude (${ageBuilds.length})</div>
      <div class="mzd-tags">
        ${ageBuilds.length
          ? ageBuilds.map(b => `<span class="mzd-tag">${b.icon} ${b.name}</span>`).join('')
          : '<span style="color:var(--text-muted);font-size:0.75rem">—</span>'}
      </div>
    </div>
    <div class="mzd-progress">
      <span>Lvl ${minLvl}–${maxLvl}</span>
      <div class="progress-bar" style="flex:1;height:7px">
        <div class="progress-fill" style="width:${Math.min(lvlsDone / lvlsTotal * 100, 100).toFixed(0)}%"></div>
      </div>
      <span>${state.age > ageIdx ? '✓ Fertig' : isCurrent ? `Lvl ${state.lvl}` : '🔒'}</span>
    </div>`;
}

function selectMinimapZone(ageIdx) {
  if (ageIdx > state.age) return;
  showMinimapDetail(ageIdx);
  // Highlight selected zone
  document.querySelectorAll('#minimap-grid .minimap-zone').forEach((el, i) => {
    el.classList.toggle('mz-selected', i === ageIdx);
  });
}

function updateAchBonusSummary(tab) {
  const summaryEl = document.getElementById('ach-bonus-summary');
  if (!summaryEl) return;
  if (tab === 'chars') {
    const cb = getCharacterBonuses();
    const charsDone = CHARACTERS.filter(ch => state.characters?.[ch.id]?.questDone).length;
    summaryEl.innerHTML = charsDone === 0
      ? 'Schließe Charakter-Quests ab, um dauerhafte Boni zu erhalten.'
      : `Charakter-Boni: <strong>Klickkraft ×${cb.clickMult.toFixed(2)}</strong> &nbsp;|&nbsp; <strong>Produktion ×${cb.prodMult.toFixed(2)}</strong> &nbsp;|&nbsp; <strong>Kosten ×${cb.costMult.toFixed(2)}</strong>`;
  } else if (tab === 'arts') {
    const ab = getArtifactBonuses();
    const artsDone = ARTIFACTS.filter(a => state.artifacts?.[a.id]).length;
    summaryEl.innerHTML = artsDone === 0
      ? 'Finde Artefakte, um permanente Boni zu erhalten.'
      : `Artefakt-Boni: <strong>Klickkraft ×${ab.clickMult.toFixed(2)}</strong> &nbsp;|&nbsp; <strong>Produktion ×${ab.prodMult.toFixed(2)}</strong> &nbsp;|&nbsp; <strong>Kosten ×${ab.costMult.toFixed(2)}</strong>`;
  } else {
    const done = Object.keys(state.achievements).length;
    const { clickMult, prodMult } = getAchievementBonuses();
    summaryEl.innerHTML = done === 0
      ? 'Schalte Erfolge frei, um Boni zu erhalten.'
      : `Aktive Boni: <strong>Klickkraft ×${clickMult.toFixed(2)}</strong> &nbsp;|&nbsp; <strong>Produktion ×${prodMult.toFixed(2)}</strong>`;
  }
}

function renderArtifacts() {
  const grid = document.getElementById('artifacts-grid');
  if (!grid) return;
  updateAchBonusSummary('arts');

  const total = ARTIFACTS.length;
  const done  = ARTIFACTS.filter(a => state.artifacts?.[a.id]).length;
  document.getElementById('ach-count').textContent = `${done} / ${total}`;

  grid.innerHTML = ARTIFACTS.map(art => {
    const unlocked = !!state.artifacts?.[art.id];
    const locked   = state.age < art.ageIdx && !unlocked;

    if (locked) {
      return `<div class="art-card art-card-locked">
        <div class="art-card-icon">🔒</div>
        <div class="art-card-name">???</div>
        <div class="art-card-era">${AGES[art.ageIdx].icon} ${AGES[art.ageIdx].name}</div>
        <div class="art-card-hint">Zeitalter nicht erreicht</div>
      </div>`;
    }

    if (unlocked) {
      const dateStr = new Date(state.artifacts[art.id]).toLocaleDateString('de-DE');
      return `<div class="art-card art-card-unlocked">
        <div class="art-card-icon">${art.icon}</div>
        <div class="art-card-name">${art.name}</div>
        <div class="art-card-era">${AGES[art.ageIdx].icon} ${AGES[art.ageIdx].name}</div>
        <div class="art-card-bonus">${art.bonusLabel}</div>
        <div class="art-card-desc">✅ ${art.unlockDesc}</div>
        <div class="art-card-date">${dateStr}</div>
      </div>`;
    }

    // Age reached but not yet unlocked — show hint
    return `<div class="art-card art-card-available">
      <div class="art-card-icon art-card-icon-dim">🔍</div>
      <div class="art-card-name">???</div>
      <div class="art-card-era">${AGES[art.ageIdx].icon} ${AGES[art.ageIdx].name}</div>
      <div class="art-card-hint">${art.unlockDesc}</div>
      <div class="art-card-bonus-hint">${art.bonusLabel}</div>
    </div>`;
  }).join('');
}

function renderAchievements() {
  const grid = document.getElementById('achievements-grid');
  if (!grid) return;
  const total = ACHIEVEMENTS.length;
  const done = Object.keys(state.achievements).length;
  document.getElementById('ach-count').textContent = `${done} / ${total}`;
  updateAchBonusSummary('ach');

  grid.innerHTML = ACHIEVEMENTS.map(ach => {
    const unlocked = !!state.achievements[ach.id];
    const dateStr = unlocked ? new Date(state.achievements[ach.id]).toLocaleDateString('de-DE') : '';
    const bonusLabel = achBonusLabel(ach);
    return `<div class="ach-card ${unlocked ? 'unlocked' : 'locked'}">
      <div class="ach-icon">${unlocked ? ach.icon : '🔒'}</div>
      <div class="ach-name">${unlocked ? ach.name : '???'}</div>
      <div class="ach-desc">${unlocked ? ach.desc : 'Noch nicht freigeschaltet'}</div>
      ${bonusLabel ? `<div class="ach-bonus ${unlocked ? 'active' : ''}"> ${unlocked ? '✅' : '🔒'} ${bonusLabel}</div>` : ''}
      ${unlocked ? `<div class="ach-date">${dateStr}</div>` : ''}
    </div>`;
  }).join('');
}

function renderCharacters() {
  const grid = document.getElementById('chars-grid');
  if (!grid) return;
  updateAchBonusSummary('chars');

  const charsDone  = CHARACTERS.filter(ch => state.characters?.[ch.id]?.questDone).length;
  const charsTotal = CHARACTERS.length;
  document.getElementById('ach-count').textContent = `${charsDone} / ${charsTotal}`;

  grid.innerHTML = CHARACTERS.map(ch => {
    const cs = state.characters?.[ch.id] || { met: false, questDone: false };
    const locked    = state.age < ch.ageIdx && !cs.met && !cs.questDone;
    const completed = cs.questDone;

    if (locked) {
      return `<div class="char-card char-card-locked">
        <div class="char-card-avatar">🔒</div>
        <div class="char-card-info">
          <div class="char-card-name">???</div>
          <div class="char-card-era">${AGES[ch.ageIdx].icon} ${AGES[ch.ageIdx].name}</div>
          <div class="char-card-status char-status-locked">Zeitalter noch nicht erreicht</div>
        </div>
      </div>`;
    }

    if (completed) {
      return `<div class="char-card char-card-done">
        <div class="char-card-avatar">${ch.icon}</div>
        <div class="char-card-info">
          <div class="char-card-name">${ch.name}</div>
          <div class="char-card-era">${AGES[ch.ageIdx].icon} ${AGES[ch.ageIdx].name}</div>
          <div class="char-card-quest-done">✅ ${ch.questLabel}</div>
          <div class="char-card-reward">${ch.rewardLabel}</div>
        </div>
      </div>`;
    }

    // Active — show live progress
    const progress = getCharacterQuestProgress(ch);
    const pct = Math.min(100, Math.floor(progress / ch.questTarget * 100));
    return `<div class="char-card char-card-active">
      <div class="char-card-avatar">${ch.icon}</div>
      <div class="char-card-info">
        <div class="char-card-name">${ch.name}</div>
        <div class="char-card-era">${AGES[ch.ageIdx].icon} ${AGES[ch.ageIdx].name}</div>
        <div class="char-card-status char-status-active">⚔️ Quest läuft</div>
        <div class="char-card-quest-label">${ch.questLabel}</div>
        <div class="char-quest-bar-wrap" style="margin-top:0.35rem">
          <div class="char-quest-bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="char-card-sub">${fmt(progress)} / ${fmt(ch.questTarget)} &nbsp;·&nbsp; ${pct}%</div>
        <div class="char-card-reward-hint">${ch.rewardLabel}</div>
      </div>
    </div>`;
  }).join('');
}

function buyBuilding(id) { buyBuildingN(id, 1); }

function buyBuildingN(id, qty) {
  const bld = BUILDINGS.find(b => b.id === id);
  if (!bld || bld.unlockAge > state.age) return;

  const n = qty === 0 ? getMaxAffordable(bld) : qty;
  if (n === 0) { notify('Not enough resources!', 'error'); return; }

  const cost = getBuildingCostN(bld, n);
  if (!canAfford(cost)) { notify('Not enough resources!', 'error'); return; }

  for (const [res, amt] of Object.entries(cost)) {
    state.res[res] = (state.res[res] || 0) - amt;
  }
  state.bld[bld.id] = (state.bld[bld.id] || 0) + n;
  incrementMission('buy_bld', n);

  renderBuildings();
  renderResources(null);
  renderClickButtons(); // slot unlock might change
  playSound('build');
  vibrate([40, 30, 80]);
  notify(`Gebaut: ${n}× ${bld.icon} ${bld.name} (${state.bld[bld.id]} gesamt)`, 'success');
}

// Returns 50% of the actual price paid for the last building
function getSellRefund(bld) {
  const count = state.bld[bld.id] || 0;
  if (count === 0) return {};
  const refund = {};
  for (const [res, base] of Object.entries(bld.baseCost)) {
    const pricePaid = Math.ceil(base * Math.pow(bld.costScale, count - 1));
    refund[res] = Math.floor(pricePaid * 0.5);
  }
  return refund;
}

function sellBuilding(id) {
  const bld = BUILDINGS.find(b => b.id === id);
  const count = state.bld[id] || 0;
  if (!bld || count === 0) return;

  const refund = getSellRefund(bld);

  state.bld[id]--;
  for (const [res, amt] of Object.entries(refund)) {
    state.res[res] = (state.res[res] || 0) + amt;
  }

  const refundStr = Object.entries(refund).map(([r, v]) => `${fmt(v)} ${RESOURCES[r]?.name || r}`).join(', ');
  playSound('sell');
  vibrate([30, 20, 30]);
  notify(`Verkauft: ${bld.icon} ${bld.name} (+${refundStr})`, 'success');
  renderBuildings();
  renderResources(null);
  renderClickButtons();
}

function doLevelUp() {
  const lvl = state.lvl;
  const maxLvl = LEVEL_SCORE.length;
  if (lvl >= maxLvl) return;
  if (state.score < LEVEL_SCORE[lvl]) { notify('Not enough score to level up!', 'error'); return; }

  const cost = getLevelCost(lvl, state.age);
  if (!canAfford(cost)) { notify('Not enough resources to level up!', 'error'); return; }

  for (const [res, amt] of Object.entries(cost)) {
    state.res[res] = (state.res[res] || 0) - amt;
  }

  state.lvl++;
  incrementMission('level_up', 1);
  const newAge = getAgeForLevel(state.lvl);
  if (newAge !== state.age) {
    handleAgeChange(newAge);
  }

  playSound('levelup');
  notify(`🎉 Level ${state.lvl} erreicht!`, 'success');
  renderLevelProgress();
  renderBuildings();
}

// ── Persistence ───────────────────────────────────────────────────────────────

function stateToJson() {
  return JSON.stringify({
    lvl: state.lvl, age: state.age, score: state.score,
    allTimeScore: state.allTimeScore || 0,
    clicks: state.clicks, clickPower: state.clickPowers[0],
    clickPowers: state.clickPowers, clicksBySlot: state.clicksBySlot,
    achievements: state.achievements,
    weeklyBaseScore: state.weeklyBaseScore, weeklyStartTs: state.weeklyStartTs,
    gatherAge: state.gatherAge,
    missions: state.missions,
    characters: state.characters,
    artifacts: state.artifacts,
    upgradedBlds: state.upgradedBlds || {},
    res: state.res, bld: state.bld, ts: new Date().toISOString(),
  });
}

function loadStateFromJson(json) {
  try {
    const s = JSON.parse(json);
    if (!s || typeof s.lvl !== 'number') return false;
    Object.assign(state, s);
    // Backwards-compat defaults for new fields
    if (!state.clickPowers) state.clickPowers = [state.clickPower || 2, 1, 0.5];
    if (!state.clicksBySlot) state.clicksBySlot = [state.clicks || 0, 0, 0];
    if (!state.achievements) state.achievements = {};
    if (state.weeklyBaseScore === undefined) state.weeklyBaseScore = state.score;
    if (!state.weeklyStartTs) state.weeklyStartTs = null;
    if (state.gatherAge === undefined) state.gatherAge = 0;
    else state.gatherAge = Math.min(state.gatherAge, state.age); // clamp to current age
    if (!state.missions) state.missions = {};
    if (!state.characters) state.characters = {};
    if (!state.artifacts) state.artifacts = {};
    if (!state.upgradedBlds) state.upgradedBlds = {};
    if (state.allTimeScore === undefined) state.allTimeScore = state.score;
    return true;
  } catch { return false; }
}

async function saveGame(silent = false) {
  if (!token) return;
  try {
    state.ts = new Date().toISOString();
    const res = await fetch(`${API}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ saveData: stateToJson() }),
    });
    if (res.ok) {
      localStorage.setItem('game_save', stateToJson());
      if (!silent) {
        playSound('save');
        notify('💾 Gespeichert & Score eingereicht!', 'success');
        submitScoreSilent();
        submitWeeklySilent();
      }
    } else {
      if (!silent) notify('Save failed. Check server.', 'error');
    }
  } catch {
    localStorage.setItem('game_save', stateToJson());
    if (!silent) notify('Saved locally (offline mode)');
  }
}

// Prestige-normalized score for fair leaderboard comparison
function prestigeNormalizedScore(rawScore) {
  return Math.floor(rawScore * (1 + (state.prestige || 0) * 0.1));
}

// Silently submits the weekly score delta (score since Monday) — always overwrites
async function submitWeeklySilent() {
  if (!token) return;
  const rawWeekly = Math.max(0, state.score - (state.weeklyBaseScore || 0));
  if (rawWeekly <= 0) return;
  try {
    await fetch(`${API}/leaderboard/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: prestigeNormalizedScore(rawWeekly), ageReached: state.age, eventName: 'Weekly', force: true }),
    });
  } catch {}
}

// Silently submits current all-time score to the Global leaderboard
async function submitScoreSilent() {
  if (!token) return;
  const globalScore = (state.allTimeScore || 0) + state.score;
  if (globalScore <= 0) return;
  try {
    await fetch(`${API}/leaderboard/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: prestigeNormalizedScore(globalScore), ageReached: state.age, eventName: 'Global' }),
    });
  } catch {}
}

async function loadSave() {
  // Try server first
  try {
    const res = await fetch(`${API}/save`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.saveData && loadStateFromJson(data.saveData)) {
        const savedTs = state.ts;
        offlineProgress(savedTs);
        return true;
      }
    }
  } catch {}

  // Fallback: localStorage
  const local = localStorage.getItem('game_save');
  if (local && loadStateFromJson(local)) {
    const savedTs = state.ts;
    offlineProgress(savedTs);
    notify('Loaded from local save (server unavailable)');
    return true;
  }
  return false;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

async function loadLeaderboard(eventName) {
  const list = document.getElementById('lb-list');
  list.innerHTML = '<div class="lb-loading">Loading...</div>';
  try {
    const res = await fetch(`${API}/leaderboard?event=${encodeURIComponent(eventName)}`);
    const data = await res.json();

    if (!data.entries || data.entries.length === 0) {
      list.innerHTML = '<div class="lb-empty">No entries yet. Be the first!</div>';
      return;
    }
    const rankClasses = ['gold', 'silver', 'bronze'];
    list.innerHTML = data.entries.map((e, i) => {
      const pr = getPrestigeRank(e.prestige || 0);
      return `
      <div class="lb-entry">
        <div class="lb-rank ${rankClasses[i] || ''}">${e.rank}</div>
        <div class="lb-name-col">
          <span class="lb-name">
            <span class="lb-prestige-icon" title="${pr.label}">${pr.icon}</span>${e.username}
          </span>
          <span class="lb-age">${e.ageReached}</span>
        </div>
        <div class="lb-score-col">
          <div class="lb-score">${fmt(e.score)}</div>
          <div class="lb-prestige-rank">${pr.label}</div>
        </div>
      </div>`;
    }).join('');
  } catch {
    list.innerHTML = '<div class="lb-empty">Failed to load leaderboard.</div>';
  }
}

async function submitScore() {
  try {
    const res = await fetch(`${API}/leaderboard/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ score: prestigeNormalizedScore(state.score), ageReached: state.age, eventName: currentLbEvent, prestige: state.prestige || 0 }),
    });
    const data = await res.json();
    if (data.ok) {
      notify(data.improved ? '🏆 Score submitted!' : 'Your score is already higher on the board.', 'success');
      loadLeaderboard(currentLbEvent);
    }
  } catch {
    notify('Failed to submit score.', 'error');
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function doLogin(usr, pwd) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usr, password: pwd }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

async function doRegister(usr, pwd, email) {
  const res = await fetch(`${API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: usr, password: pwd, email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Register failed');
  return data;
}

async function startGame(authData) {
  token = authData.token;
  username = authData.username;
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_username', username);

  // Show game screen
  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  // Load save
  await loadSave();
  checkWeeklyReset();
  initMissions();
  // First event fires 1–3 min after login (not immediately)
  nextEventTs = Date.now() + (60 + Math.random() * 120) * 1000;

  // Init age display
  prevAge = state.age;
  document.body.dataset.age = state.age;
  const age = AGES[state.age];
  document.getElementById('age-icon').textContent = age.icon;
  document.getElementById('age-name').textContent = age.name;
  document.getElementById('civ-scene').textContent = age.scene;
  document.getElementById('civ-label').textContent = age.label;
  renderClickButtons();
  renderResources(null);
  renderBuildings();

  // Start loop
  lastTick = Date.now();
  setInterval(tick, TICK_MS);

  // Auto-save (respects settings)
  loadSettings();
  restartAutosave();

  updateMissionsBtn();

  // Show tutorial on first ever login, else check if current age's character needs intro
  if (!localStorage.getItem('tutorial_seen')) {
    setTimeout(() => showTutorial(0), 600);
  } else {
    // Show intro for current age's character if not yet met (covers Stone Age & load after prestige)
    setTimeout(() => triggerCharacterForAge(state.age), 1500);
  }
}

// ── Tutorial ──────────────────────────────────────────────────────────────────

let tutorialStep = 0;
const TUTORIAL_STEPS = 4;

function showTutorial(step = 0) {
  tutorialStep = step;
  openModal(document.getElementById('tutorial-modal'));
  renderTutorialStep();
}

function renderTutorialStep() {
  document.querySelectorAll('.tutorial-step').forEach((el, i) => {
    el.style.display = i === tutorialStep ? 'flex' : 'none';
  });

  const dots = document.getElementById('tutorial-dots');
  dots.innerHTML = Array.from({ length: TUTORIAL_STEPS }, (_, i) =>
    `<span class="tutorial-dot${i === tutorialStep ? ' active' : ''}"></span>`
  ).join('');

  document.getElementById('tutorial-prev').style.visibility = tutorialStep === 0 ? 'hidden' : 'visible';
  document.getElementById('tutorial-next').textContent =
    tutorialStep === TUTORIAL_STEPS - 1 ? '✅ Los geht\'s!' : 'Weiter →';
}

function closeTutorial() {
  closeModal(document.getElementById('tutorial-modal'));
  localStorage.setItem('tutorial_seen', '1');
  // Show Stone Age character intro after tutorial (first login only)
  setTimeout(() => triggerCharacterForAge(state.age), 800);
}

function logout() {
  saveGame(true);
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_username');
  token = null; username = null;
  clearInterval(autoSaveTimer);
  document.getElementById('game-screen').classList.remove('active');
  document.getElementById('auth-screen').classList.add('active');
}

// ── Accessibility ─────────────────────────────────────────────────────────────

const FOCUSABLE_SEL = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

let _modalFocusOrigin = null;

function openModal(el) {
  _modalFocusOrigin = document.activeElement;
  el.style.display = 'flex';
  el.removeAttribute('aria-hidden');
  // Focus the first focusable element (usually the close button)
  const first = el.querySelector(FOCUSABLE_SEL);
  if (first) requestAnimationFrame(() => first.focus());
}

function closeModal(el) {
  el.style.display = 'none';
  el.setAttribute('aria-hidden', 'true');
  if (_modalFocusOrigin) { _modalFocusOrigin.focus(); _modalFocusOrigin = null; }
}

function trapFocus(e, el) {
  if (e.key !== 'Tab') return;
  const nodes = [...el.querySelectorAll(FOCUSABLE_SEL)];
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
  }
}

// Escape closes the topmost open modal
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.modal[style*="flex"]');
  if (!open) return;
  const closeBtn = open.querySelector('.modal-close');
  if (closeBtn) closeBtn.click(); else closeModal(open);
});

// ── Event Listeners ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-form`).classList.add('active');
    });
  });

  // Username check on register
  let checkTimer = null;
  document.getElementById('reg-username').addEventListener('input', (e) => {
    clearTimeout(checkTimer);
    const hint = document.getElementById('username-hint');
    const val = e.target.value.trim();
    if (val.length < 3) { hint.textContent = ''; hint.className = 'field-hint'; return; }
    hint.textContent = 'Checking...'; hint.className = 'field-hint';
    checkTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/check-username/${encodeURIComponent(val)}`);
        const data = await res.json();
        hint.textContent = data.available ? '✓ Available' : '✗ Already taken';
        hint.className = 'field-hint ' + (data.available ? 'ok' : 'err');
      } catch { hint.textContent = ''; }
    }, 500);
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Loading...';
    try {
      const data = await doLogin(
        document.getElementById('login-username').value.trim(),
        document.getElementById('login-password').value,
      );
      await startGame(data);
    } catch (err) {
      document.getElementById('login-error').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Enter the World';
    }
  });

  // Register form
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const data = await doRegister(
        document.getElementById('reg-username').value.trim(),
        document.getElementById('reg-password').value,
        document.getElementById('reg-email').value.trim(),
      );
      await startGame(data);
    } catch (err) {
      document.getElementById('register-error').textContent = err.message;
    } finally {
      btn.disabled = false; btn.textContent = 'Found Your Civilization';
    }
  });

  // Click buttons container — touch fires immediately (no 300ms delay)
  const clickContainer = document.getElementById('click-btns-container');
  clickContainer.addEventListener('touchstart', (e) => {
    const btn = e.target.closest('[data-slot]');
    if (!btn || btn.disabled) return;
    e.preventDefault(); // suppresses the delayed click event that follows
    doClick(e, parseInt(btn.dataset.slot, 10));
  }, { passive: false });
  // Mouse fallback for desktop
  clickContainer.addEventListener('click', (e) => {
    if (e._fromTouch) return; // already handled by touchstart
    const btn = e.target.closest('[data-slot]');
    if (!btn || btn.disabled) return;
    doClick(e, parseInt(btn.dataset.slot, 10));
  });

  // Level up
  document.getElementById('levelup-btn').addEventListener('click', doLevelUp);

  // Prestige
  document.getElementById('prestige-btn').addEventListener('click', doPrestige);

  // Age transition close
  document.getElementById('at-close').addEventListener('click', () => {
    document.getElementById('age-transition').style.display = 'none';
  });

  // Save button
  document.getElementById('save-btn').addEventListener('click', () => saveGame(false));

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Save and logout?')) logout();
  });

  // Leaderboard
  const lbModal = document.getElementById('leaderboard-modal');
  document.getElementById('leaderboard-btn').addEventListener('click', () => {
    openModal(lbModal); loadLeaderboard(currentLbEvent);
  });
  document.getElementById('lb-close').addEventListener('click', () => closeModal(lbModal));
  lbModal.addEventListener('keydown', e => trapFocus(e, lbModal));
  document.querySelectorAll('.lb-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentLbEvent = btn.dataset.event;
      loadLeaderboard(currentLbEvent);
    });
  });
  document.getElementById('lb-submit-btn').addEventListener('click', submitScore);

  // Settings modal
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('settings-btn').addEventListener('click', () => {
    loadSettings();
    document.getElementById('autosave-select').value = String(settings.autosaveInterval);
    document.getElementById('offline-cap-select').value = String(settings.offlineCapHours || 8);
    document.getElementById('notifications-select').value = settings.showNotifications ? '1' : '0';
    document.getElementById('sound-select').value = settings.soundEnabled !== false ? '1' : '0';
    document.getElementById('vibration-select').value = settings.vibrationEnabled !== false ? '1' : '0';
    openModal(settingsModal);
  });
  document.getElementById('settings-close').addEventListener('click', () => closeModal(settingsModal));
  document.getElementById('settings-save-btn').addEventListener('click', () => {
    settings.autosaveInterval = parseInt(document.getElementById('autosave-select').value, 10);
    settings.offlineCapHours = parseInt(document.getElementById('offline-cap-select').value, 10);
    settings.showNotifications = document.getElementById('notifications-select').value === '1';
    settings.soundEnabled = document.getElementById('sound-select').value === '1';
    settings.vibrationEnabled = document.getElementById('vibration-select').value === '1';
    saveSettings();
    restartAutosave();
    closeModal(settingsModal);
    notify(`⚙️ Einstellungen gespeichert!`, 'success');
  });
  settingsModal.addEventListener('keydown', e => trapFocus(e, settingsModal));

  // Minimap (click on civ-visual)
  const minimapModal = document.getElementById('minimap-modal');
  document.getElementById('civ-visual').addEventListener('click', () => {
    renderMinimap(); openModal(minimapModal);
  });
  document.getElementById('minimap-close').addEventListener('click', () => closeModal(minimapModal));
  minimapModal.addEventListener('keydown', e => trapFocus(e, minimapModal));

  // Tutorial modal
  document.getElementById('tutorial-close').addEventListener('click', closeTutorial);
  document.getElementById('tutorial-next').addEventListener('click', () => {
    if (tutorialStep < TUTORIAL_STEPS - 1) {
      tutorialStep++;
      renderTutorialStep();
    } else {
      closeTutorial();
    }
  });
  document.getElementById('tutorial-prev').addEventListener('click', () => {
    if (tutorialStep > 0) { tutorialStep--; renderTutorialStep(); }
  });
  document.getElementById('tutorial-reopen-btn').addEventListener('click', () => {
    closeModal(settingsModal);
    showTutorial(0);
  });
  document.getElementById('tutorial-modal').addEventListener('keydown', e => trapFocus(e, document.getElementById('tutorial-modal')));

  // Achievements modal + Characters tab
  const achModal = document.getElementById('achievements-modal');
  let _achActiveTab = 'ach';

  function switchAchTab(tab) {
    _achActiveTab = tab;
    document.getElementById('achievements-grid').style.display = tab === 'ach'   ? '' : 'none';
    document.getElementById('chars-grid').style.display        = tab === 'chars' ? '' : 'none';
    document.getElementById('artifacts-grid').style.display    = tab === 'arts'  ? '' : 'none';
    ['ach', 'chars', 'arts'].forEach(t => {
      const btn = document.getElementById(`tab-${t}-btn`);
      btn.classList.toggle('active', t === tab);
      btn.setAttribute('aria-selected', String(t === tab));
    });
    if (tab === 'ach')   renderAchievements();
    if (tab === 'chars') renderCharacters();
    if (tab === 'arts')  renderArtifacts();
  }

  document.getElementById('achievements-btn').addEventListener('click', () => {
    switchAchTab(_achActiveTab); openModal(achModal);
  });
  document.getElementById('artifacts-btn').addEventListener('click', () => {
    switchAchTab('arts'); openModal(achModal);
  });
  document.getElementById('tab-ach-btn').addEventListener('click',   () => switchAchTab('ach'));
  document.getElementById('tab-chars-btn').addEventListener('click', () => switchAchTab('chars'));
  document.getElementById('tab-arts-btn').addEventListener('click',  () => switchAchTab('arts'));
  document.getElementById('ach-close').addEventListener('click', () => closeModal(achModal));
  achModal.addEventListener('keydown', e => trapFocus(e, achModal));

  // Character popup
  const charPopup = document.getElementById('char-popup');
  document.getElementById('char-popup-close').addEventListener('click', () => {
    // Dismiss = accept quest (same as "Quest annehmen" for the intro)
    const okBtn = document.getElementById('char-popup-ok');
    if (okBtn && okBtn.onclick) okBtn.onclick();
    else closeCharacterPopup();
  });
  charPopup.addEventListener('keydown', e => trapFocus(e, charPopup));

  // Missions modal
  const missionsModal = document.getElementById('missions-modal');
  document.getElementById('missions-btn').addEventListener('click', () => {
    renderMissions(); openModal(missionsModal);
  });
  document.getElementById('missions-close').addEventListener('click', () => closeModal(missionsModal));
  missionsModal.addEventListener('keydown', e => trapFocus(e, missionsModal));

  // Auto-login from localStorage
  const savedToken = localStorage.getItem('auth_token');
  const savedUsername = localStorage.getItem('auth_username');
  if (savedToken && savedUsername) {
    startGame({ token: savedToken, username: savedUsername });
  }

  // Service Worker registrieren
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .catch(err => console.warn('Service Worker Registrierung fehlgeschlagen:', err));
  }
});
