// Hokm Royal SPA Controller — wires DOM to the pure engine (src/game.js).
import { SYMBOLS, sortHand, mulberry32 } from './rules.js';
import { createGame } from './game.js';
import { coachHint, gradeMove } from './advisor.js';
import * as storage from './storage.js';

const $ = (id) => document.getElementById(id);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const lz = window.LZString;

const THEME_KEY = 'hokm_theme_v1';
const FAN_KEY = 'hokm_fan_v1';

let soundOn = storage && localStorage.getItem(storage.SOUND_KEY) !== '0';
let analysisOn = localStorage.getItem('hokm_analysis_v1') !== '0';
let coachOn = localStorage.getItem('hokm_coach_v1') === '1';
let currentTheme = localStorage.getItem(THEME_KEY) || 'navy';
let fanMode = false; // Normal non-overlapping layout by default for crystal-clear cards

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function playTone(freq, duration, type, gainVal, delayFromNow) {
  if (!soundOn) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + (delayFromNow || 0);
    gain.gain.setValueAtTime(gainVal || 0.14, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  } catch (e) { /* ignore */ }
}
const SFX = {
  cardPlay: () => playTone(520, 0.07, 'triangle', 0.09, 0),
  trickWinUs: () => { playTone(660, 0.1, 'sine', 0.13, 0); playTone(880, 0.14, 'sine', 0.13, 0.09); },
  trickWinThem: () => playTone(340, 0.14, 'sine', 0.1, 0),
  kotUs: () => { playTone(523, 0.12, 'sine', 0.15, 0); playTone(659, 0.12, 'sine', 0.15, 0.1); playTone(784, 0.22, 'sine', 0.15, 0.2); },
  kotThem: () => { playTone(300, 0.16, 'sawtooth', 0.09, 0); playTone(220, 0.22, 'sawtooth', 0.09, 0.12); },
  bam: () => { playTone(523, 0.1, 'sine', 0.17, 0); playTone(659, 0.1, 'sine', 0.17, 0.09); playTone(784, 0.1, 'sine', 0.17, 0.18); playTone(1047, 0.32, 'sine', 0.17, 0.27); },
  win: () => { playTone(523, 0.12, 'sine', 0.16, 0); playTone(659, 0.12, 'sine', 0.16, 0.1); playTone(784, 0.12, 'sine', 0.16, 0.2); playTone(1047, 0.3, 'sine', 0.16, 0.3); },
  lose: () => { playTone(320, 0.2, 'sawtooth', 0.1, 0); playTone(210, 0.3, 'sawtooth', 0.1, 0.14); },
  tap: () => playTone(300, 0.04, 'square', 0.05, 0),
};

// ---------- View Implementation ----------
let aceDrawTimer = null;
const view = {
  delay,
  sfx: (name) => SFX[name] && SFX[name](),
  clearTable: () => { for (let i = 1; i <= 4; i++) $(`slot${i}`).innerHTML = ''; },
  renderTableCard: (pid, c) => {
    const slot = $(`slot${pid}`);
    slot.innerHTML = '';
    slot.appendChild(createCardEl(c, 'table-card enter'));
  },
  renderHand,
  updateUI,
  onAceDraw: (seq, hakemPid) => {
    const banner = $('aceDrawBanner');
    const cardsBox = $('aceDrawCards');
    const txt = $('aceDrawText');
    if (!banner || !cardsBox || !txt) return;
    const names = { 1: 'شما', 2: 'حریف ۱', 3: 'یار شما', 4: 'حریف ۲' };
    txt.textContent = `آس‌کشی رسمی: اولین آس به «${names[hakemPid]}» رسید (حاکم اول)`;
    cardsBox.innerHTML = seq.map((item) => `
      <div class="ace-mini-chip${item.isAce ? ' winner' : ''}">
        <span>${names[item.player]}</span>
        <b>${SYMBOLS[item.card.suit]}${item.card.rank}</b>
      </div>
    `).join('');
    banner.classList.remove('hidden');
    if (aceDrawTimer) clearTimeout(aceDrawTimer);
    aceDrawTimer = setTimeout(() => { banner.classList.add('hidden'); }, 3500);
  },
  showPopup: (t) => { const p = $('winnerPopup'); p.textContent = t; p.classList.add('show'); },
  hidePopup: () => $('winnerPopup').classList.remove('show'),
  showTrumpPicker: (cards) => {
    const cont = $('previewCards');
    cont.innerHTML = '';
    for (const c of cards) cont.appendChild(createCardEl(c));
    $('trumpModal').classList.add('show');
  },
  showKot: (msg) => { $('kotMsg').textContent = msg; $('kotModal').classList.add('show'); },
  showRound: (title, html, tone) => {
    const t = $('roundTitle');
    t.textContent = title;
    t.className = `modal-title ${tone === 'us' ? 'us' : 'them'}`;
    $('roundMsg').innerHTML = html;
    $('roundMsg').className = `modal-msg ${tone === 'us' ? 'us' : 'them'}`;
    $('roundModal').classList.add('show');
  },
  showEnd: (title, html, w) => {
    const t = $('endTitle');
    t.textContent = title;
    t.className = `modal-title ${w === 'A' ? 'us' : 'them'}`;
    $('endMsg').innerHTML = html;
    renderHistory();
    const s = storage.updateStatsOnGameEnd(localStorage, w, G);
    const pct = Math.round((s.gamesWon / s.gamesPlayed) * 100);
    $('statsSummary').textContent = `کارنامه کل شما: ${s.gamesWon} برد از ${s.gamesPlayed} مسابقه (٪${pct})`;
    storage.clearSave(localStorage);
    $('endModal').classList.add('show');
  },
};

const seedParam = new URLSearchParams((typeof location !== 'undefined' && location && location.search) || '').get('seed');
const gameRng = seedParam ? mulberry32(Number(seedParam) >>> 0) : Math.random;

const game = createGame(view, gameRng, null);
const G = game.G;

// ---------- Classic Crystal-Clear Card Element (حالت معمولی و کاملاً واضح) ----------
function createCardEl(c, sizeClass = '') {
  const el = document.createElement('div');
  const isTrump = G.trumpMode === 'normal' && c.suit === G.trump;
  el.className = `card suit-${c.suit}${isTrump ? ' trump' : ''}${sizeClass ? ' ' + sizeClass : ''}`;
  el.dataset.card = `${c.suit}:${c.rank}`;
  el.innerHTML = `<span class="card-rank">${c.rank}</span>
    <span class="card-suit-center">${SYMBOLS[c.suit]}</span>
    <span class="card-rank bottom">${c.rank}</span>`;
  return el;
}

function renderHand() {
  const cont = $('handCards');
  cont.innerHTML = '';
  cont.classList.toggle('fan-mode', fanMode);
  cont.classList.toggle('grid-mode', !fanMode);
  const h = sortHand(G.players[1].hand, G.trump, G.trumpMode);
  G.players[1].hand = h;
  const can = game.playable(1);
  const myTurn = G.phase === 'play' && G.current === 1 && !G.processing;

  const hintEl = $('turnHintText');
  if (hintEl) {
    if (myTurn) {
      hintEl.textContent = G.selectedCard ? 'برای بازی کردن کارت، دوباره لمس کنید' : 'نوبت شماست — یک کارت انتخاب کنید';
    } else if (G.phase === 'trump') {
      hintEl.textContent = 'در حال تعیین حکم...';
    } else {
      const curName = G.current && G.players[G.current] ? G.players[G.current].name : '...';
      hintEl.textContent = `نوبت ${curName}`;
    }
  }

  for (let idx = 0; idx < h.length; idx++) {
    const c = h[idx];
    const el = createCardEl(c);
    const ok = myTurn && can.some((x) => x.suit === c.suit && x.rank === c.rank);
    if (!ok) el.classList.add('disabled');
    if (ok) el.onclick = () => selectCard(c);
    const isSel = G.selectedCard && G.selectedCard.suit === c.suit && G.selectedCard.rank === c.rank;
    if (isSel) el.classList.add('selected');
    cont.appendChild(el);
  }
  applyCoach(cont, myTurn);
}

function applyCoach(cont, myTurn) {
  const bar = $('coachBar');
  if (!coachOn || !myTurn || !G.players[1].hand.length) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  const hint = coachHint(G, 1);
  if (!hint) { bar.classList.add('hidden'); return; }
  const key = (c) => `${c.suit}:${c.rank}`;
  const sym = SYMBOLS[hint.best.suit];
  for (const el of cont.children) {
    if (el.dataset.card === key(hint.best)) el.classList.add('coach-best');
    if (hint.alt && el.dataset.card === key(hint.alt)) el.classList.add('coach-alt');
  }
  const sym2 = hint.alt ? SYMBOLS[hint.alt.suit] : null;
  bar.classList.remove('hidden');
  bar.innerHTML = `<span class="coach-line">🎓 پیشنهاد مربی: <b>${sym}${hint.best.rank}</b> — ${hint.bestReason}</span>` +
    (hint.alt ? `<span class="coach-line alt">گزینه جایگزین: <b>${sym2}${hint.alt.rank}</b> — ${hint.altReason}</span>` : '');
}

function selectCard(c) {
  if (G.selectedCard && G.selectedCard.suit === c.suit && G.selectedCard.rank === c.rank) {
    G.selectedCard = null;
    game.playHuman(c);
  } else {
    SFX.tap();
    G.selectedCard = c;
    renderHand();
  }
}

// ---------- HUD & Cross-Table Updates ----------
function updateUI() {
  $('scoreA').textContent = G.score.A;
  $('scoreB').textContent = G.score.B;
  $('tricksA').textContent = G.tricksWon.A;
  $('tricksB').textContent = G.tricksWon.B;
  $('trickNum').textContent = G.trickNum;

  let td = '-';
  if (G.trump || G.trumpMode !== 'normal') {
    if (G.trumpMode === 'normal') td = SYMBOLS[G.trump];
    else if (G.trumpMode === 'ners') td = '(2) نرس';
    else if (G.trumpMode === 'asners') td = '(A2) آس‌نرس';
    else td = '(A) سرس';
  }
  $('trumpDisplay').textContent = td;
  const centerEmblem = $('tableCenterTrump');
  if (centerEmblem) centerEmblem.textContent = G.trumpMode === 'normal' && G.trump ? SYMBOLS[G.trump] : '👑';

  for (let i = 1; i <= 4; i++) {
    const box = $(`player${i}Box`);
    if (box) box.classList.toggle('active', G.current === i);
    $(`crown${i}`).classList.add('hidden');
    $(`trumpBadge${i}`).classList.add('hidden');

    if (i >= 2) {
      const cntEl = $(`count${i}`);
      if (cntEl && G.players[i]) cntEl.textContent = `${G.players[i].hand.length} برگ`;
    }
    const vEl = $(`voids${i}`);
    if (vEl) {
      const vs = (G.memory && G.memory.voids && G.memory.voids[i]) || [];
      vEl.innerHTML = vs.map((su) => `<span class="void-tag" title="خالی در ${SYMBOLS[su]}">∅${SYMBOLS[su]}</span>`).join('');
    }
  }

  if (G.hakem) {
    $(`crown${G.hakem}`).classList.remove('hidden');
    if (G.trump || G.trumpMode !== 'normal') {
      const b = $(`trumpBadge${G.hakem}`);
      b.classList.remove('hidden');
      b.textContent = G.trumpMode === 'normal' ? SYMBOLS[G.trump] : (G.trumpMode === 'ners' ? '2' : G.trumpMode === 'asners' ? 'A2' : 'A');
    }
  }
  if (G.phase !== 'idle') storage.saveGame(lz, localStorage, G);
}

function renderHistory() {
  const cont = $('historyList');
  if (!G.roundHistory.length) { cont.classList.add('hidden'); cont.innerHTML = ''; return; }
  cont.classList.remove('hidden');
  cont.innerHTML = G.roundHistory.map((r, i) => `
    <div class="history-row">
      <span class="history-round">دست ${i + 1}</span>
      <span>${r.trump}</span>
      <span>${r.tricksA}-${r.tricksB}</span>
      <span class="history-winner ${r.winner === 'A' ? 'us' : 'them'}">${r.winner === 'A' ? 'ما' : 'آنها'} +${r.pts}${r.bam ? ' 🏆بام' : (r.kot ? ' کوت' : '')}</span>
    </div>`).join('');
}

// ---------- Last Trick & Analysis ----------
const QUALITY_LABEL = {
  excellent: ['عالی', 'good'],
  good: ['خوب', 'good'],
  improvable: ['قابل بهبود', 'warn'],
  mistake: ['اشتباه تاکتیکی', 'bad'],
};

function showLastTrick() {
  const cont = $('lastTrickCards');
  cont.innerHTML = '';
  if (!G.lastTrick) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'outcome-line';
    emptyMsg.textContent = 'هنوز هیچ دستی در این راند تکمیل نشده است.';
    cont.appendChild(emptyMsg);
    $('lastTrickModal').classList.add('show');
    return;
  }
  for (let pos = 0; pos < G.lastTrick.entries.length; pos++) {
    const entry = G.lastTrick.entries[pos];
    const pid = entry.player;
    const row = document.createElement('div');
    row.className = 'last-trick-row' + (pid === G.lastTrick.winner ? ' winner' : '');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'last-trick-name';
    nameSpan.textContent = G.players[pid].name + (pid === G.lastTrick.winner ? ' 🏆' : '');
    row.appendChild(nameSpan);
    const cardEl = createCardEl(entry.card, 'table-card');
    row.appendChild(cardEl);
    cont.appendChild(row);

    if (analysisOn) {
      const snap = game.trickSnaps[G.lastTrick.trickNum];
      const g = snap && gradeMove(G, game.trickSnaps, G.lastTrick.trickNum, pos, pid, entry.card);
      const box = document.createElement('div');
      box.className = 'analysis-row';
      if (g) {
        const [label, tone] = QUALITY_LABEL[g.quality] || ['?', ''];
        if (tone === 'good') box.classList.add('good');
        if (tone === 'bad') box.classList.add('bad');
        if (tone === 'warn') box.classList.add('warn');
        let html = `<span class="grade ${tone}">${label}</span> <span class="reason">${g.reason}</span>`;
        if (g.better) html += ` <span class="better">حرکت بهتر: ${SYMBOLS[g.better.suit]}${g.better.rank}</span>`;
        if (g.tacticLabels && g.tacticLabels.length) html += ` <span class="tactics">[${g.tacticLabels.join(' · ')}]</span>`;
        box.innerHTML = html;
      }
      if (box.innerHTML) cont.appendChild(box);
    }
  }
  if (analysisOn) {
    const out = document.createElement('p');
    out.className = 'outcome-line';
    out.textContent = `برنده این تریک: ${G.players[G.lastTrick.winner].name}`;
    cont.appendChild(out);
  }
  $('lastTrickModal').classList.add('show');
}

// ---------- Theme & Layout Switching ----------
function applyTheme(theme) {
  currentTheme = theme === 'emerald' ? 'emerald' : 'navy';
  const body = $('appBody');
  if (body) {
    body.classList.toggle('theme-navy', currentTheme === 'navy');
    body.classList.toggle('theme-emerald', currentTheme === 'emerald');
  }
  const navyBtn = $('themeNavyBtn');
  const emBtn = $('themeEmeraldBtn');
  if (navyBtn) navyBtn.classList.toggle('active', currentTheme === 'navy');
  if (emBtn) emBtn.classList.toggle('active', currentTheme === 'emerald');
  const lbl = $('themeLabel');
  if (lbl) lbl.textContent = currentTheme === 'navy' ? 'لاجوردی' : 'زمردی';
  try { localStorage.setItem(THEME_KEY, currentTheme); } catch (e) { /* ignore */ }
}

function toggleFanMode() {
  fanMode = !fanMode;
  const lbl = $('fanModeLabel');
  if (lbl) lbl.textContent = fanMode ? 'فشرده' : 'بادبزنی';
  try { localStorage.setItem(FAN_KEY, fanMode ? '1' : '0'); } catch (e) { /* ignore */ }
  renderHand();
}

function renderStartStats() {
  const el = $('statsLine');
  const s = storage.loadStats(localStorage);
  if (!s.gamesPlayed) { el.textContent = ''; return; }
  const pct = Math.round((s.gamesWon / s.gamesPlayed) * 100);
  el.textContent = `${s.gamesWon} برد از ${s.gamesPlayed} بازی (٪${pct}) · ${s.kots} کوت · ${s.bams} بام`;
}

function hideModals() {
  for (const id of ['trumpModal', 'roundModal', 'endModal', 'kotModal', 'lastTrickModal', 'guideModal', 'settingsModal']) {
    const m = $(id);
    if (m) m.classList.remove('show');
  }
}

function showGame() {
  $('startScreen').classList.add('hidden');
  $('gameWrapper').classList.remove('hidden');
}

// ---------- Wiring ----------
$('startBtn').onclick = () => { storage.clearSave(localStorage); showGame(); hideModals(); game.startGame(); };
$('continueBtn').onclick = () => {
  const saved = storage.loadGame(lz, localStorage);
  if (!saved) { renderStartStats(); return; }
  showGame();
  game.continueFrom(saved);
};
$('nextRoundBtn').onclick = () => { $('roundModal').classList.remove('show'); game.startRound(); };
$('newGameBtn').onclick = () => {
  $('endModal').classList.remove('show');
  G.score = { A: 0, B: 0 };
  G.roundHistory = [];
  G.hakem = Math.floor(gameRng() * 4) + 1;
  game.startRound();
};
$('resetBtn').onclick = () => {
  hideModals();
  G.score = { A: 0, B: 0 };
  G.roundHistory = [];
  if (G.phase === 'idle') { showGame(); game.startGame(); return; }
  G.hakem = Math.floor(gameRng() * 4) + 1;
  game.startRound();
};
$('updateBtn').onclick = async () => {
  try {
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
    if ('serviceWorker' in navigator) await Promise.all((await navigator.serviceWorker.getRegistrations()).map((r) => r.unregister()));
  } catch (e) { /* ignore */ }
  location.reload();
};
$('bamYes').onclick = () => { $('kotModal').classList.remove('show'); game.bamAccept(); };
$('bamNo').onclick = () => { $('kotModal').classList.remove('show'); game.bamDecline(); };
$('lastTrickBtn').onclick = showLastTrick;
$('closeLastTrick').onclick = () => $('lastTrickModal').classList.remove('show');
$('lastTrickModal').onclick = (e) => { if (e && e.target && e.target.id === 'lastTrickModal') $('lastTrickModal').classList.remove('show'); };

if ($('themeBtn')) $('themeBtn').onclick = () => applyTheme(currentTheme === 'navy' ? 'emerald' : 'navy');
if ($('themeNavyBtn')) $('themeNavyBtn').onclick = () => applyTheme('navy');
if ($('themeEmeraldBtn')) $('themeEmeraldBtn').onclick = () => applyTheme('emerald');
if ($('fanToggleBtn')) $('fanToggleBtn').onclick = toggleFanMode;
if ($('guideBtn')) $('guideBtn').onclick = () => $('guideModal').classList.add('show');
if ($('openGuideBtn')) $('openGuideBtn').onclick = () => $('guideModal').classList.add('show');
if ($('closeGuideBtn')) $('closeGuideBtn').onclick = () => $('guideModal').classList.remove('show');
if ($('guideModal')) $('guideModal').onclick = (e) => { if (e && e.target && e.target.id === 'guideModal') $('guideModal').classList.remove('show'); };

if ($('settingsNavBtn')) $('settingsNavBtn').onclick = () => $('settingsModal').classList.add('show');
if ($('closeSettingsBtn')) $('closeSettingsBtn').onclick = () => $('settingsModal').classList.remove('show');
if ($('settingsModal')) $('settingsModal').onclick = (e) => { if (e && e.target && e.target.id === 'settingsModal') $('settingsModal').classList.remove('show'); };

function updateCoachQuickBtn() {
  const btn = $('coachQuickBtn');
  if (btn) btn.textContent = coachOn ? 'روشن ✅' : 'خاموش';
}
if ($('coachQuickBtn')) {
  $('coachQuickBtn').onclick = () => {
    coachOn = !coachOn;
    const tc = $('toggleCoach');
    if (tc) tc.checked = coachOn;
    try { localStorage.setItem('hokm_coach_v1', coachOn ? '1' : '0'); } catch (e) {}
    updateCoachQuickBtn();
    renderHand();
  };
}

document.querySelectorAll('.trump-btn').forEach((b) => {
  b.onclick = () => {
    const t = b.dataset.trump;
    $('trumpModal').classList.remove('show');
    game.humanChoseTrump(['ners', 'asners', 'sers'].includes(t) ? t : 'normal', ['ners', 'asners', 'sers'].includes(t) ? null : t);
  };
});

function updateSoundBtnIcon() {
  const b = $('soundBtn');
  if (!b) return;
  b.innerHTML = soundOn ? '<svg class="ic"><use href="#i-sound-on"/></svg>' : '<svg class="ic"><use href="#i-sound-off"/></svg>';
}
$('soundBtn').onclick = () => {
  soundOn = !soundOn;
  try { localStorage.setItem(storage.SOUND_KEY, soundOn ? '1' : '0'); } catch (e) { /* noop */ }
  updateSoundBtnIcon();
  if (soundOn) SFX.tap();
};
updateSoundBtnIcon();
updateCoachQuickBtn();

// ---------- Boot ----------
applyTheme(currentTheme);
renderStartStats();

const ta = $('toggleAnalysis'), tc = $('toggleCoach');
ta.checked = analysisOn; tc.checked = coachOn;
ta.onchange = () => { analysisOn = ta.checked; try { localStorage.setItem('hokm_analysis_v1', analysisOn ? '1' : '0'); } catch (e) {} };
tc.onchange = () => { coachOn = tc.checked; updateCoachQuickBtn(); try { localStorage.setItem('hokm_coach_v1', coachOn ? '1' : '0'); } catch (e) {} };
const saved = storage.loadGame(lz, localStorage);
if (saved && saved.phase === 'play' && saved.players && saved.players[1] && saved.players[1].hand && saved.players[1].hand.length) {
  const cb = $('continueBtn');
  cb.classList.remove('hidden');
}
