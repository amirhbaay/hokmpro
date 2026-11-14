// Hokm game flow controller.
import {
  SUITS, NEXT, PARTNER, SYMBOLS, makeDeck, shuffle, sortHand, trickWinner,
  getKotPoints, cardVal, cmpCards, playable, recordSignal,
} from './rules.js';
import { aiPick, pickAiTrump } from './ai.js';
import { snapshotTrickStart, appendToSnapshot } from './advisor.js';

export function createState() {
  return {
    players: {
      1: { name: 'شما', hand: [], team: 'A' },
      2: { name: 'حریف ۱', hand: [], team: 'B' },
      3: { name: 'یار', hand: [], team: 'A' },
      4: { name: 'حریف ۲', hand: [], team: 'B' },
    },
    hakem: null, trump: null, trumpMode: 'normal',
    trick: [], leadSuit: null, current: null, starter: null,
    tricksWon: { A: 0, B: 0 }, score: { A: 0, B: 0 },
    trickNum: 0, phase: 'idle', processing: false,
    selectedCard: null, deck: [],
    memory: { played: [], voids: {}, aces: {}, kings: {}, signals: [], tricks: [] },
    kotTeam: null, kotPoints: 0, bamMode: false, roundHistory: [], lastTrick: null,
    aceDrawHistory: [],
  };
}

export function createGame(view, rng = Math.random, storage = null) {
  const G = createState();
  const trickSnaps = {};

  function dealOrder(hakem) {
    const seq = [];
    let p = hakem;
    for (let i = 0; i < 3; i++) { p = NEXT[p]; seq.push(p); }
    seq.push(hakem);
    return seq;
  }

  async function doPlayCard(pid, c, recommended = null) {
    view.sfx('cardPlay');
    const h = G.players[pid].hand;
    const i = h.findIndex((x) => x.suit === c.suit && x.rank === c.rank);
    if (i > -1) h.splice(i, 1);
    const necessary = false;

    let forcedFollow = false;
    if (G.leadSuit && c.suit === G.leadSuit) {
      const same = h.filter((x) => x.suit === G.leadSuit);
      forcedFollow = same.every((x) => cardVal(x, G.trumpMode) >= cardVal(c, G.trumpMode));
    }

    let contSignal = false;
    if (G.trick.length && G.leadSuit && c.suit === G.leadSuit) {
      let w = G.trick[0];
      for (const t of G.trick) if (cmpCards(t.card, w.card, G.leadSuit, G.trumpMode, G.trump) > 0) w = t;
      if (w.player === PARTNER[pid] &&
          cardVal(c, G.trumpMode) < cardVal(w.card, G.trumpMode) &&
          h.some((x) => x.suit === c.suit && cardVal(x, G.trumpMode) > cardVal(c, G.trumpMode))) {
        contSignal = true;
      }
    }
    G.trick.push({ player: pid, card: c, necessary, recommended, forcedFollow, contSignal });
    if (G.trick.length === 1) G.leadSuit = c.suit;
    if (trickSnaps[G.trickNum]) appendToSnapshot(trickSnaps[G.trickNum], { player: pid, card: c });
    G.memory.played.push({ ...c });
    if (c.rank === 'A') G.memory.aces[c.suit] = true;
    if (c.rank === 'K') G.memory.kings[c.suit] = true;
    if (G.leadSuit && c.suit !== G.leadSuit) {
      if (!G.memory.voids[pid]) G.memory.voids[pid] = [];
      if (!G.memory.voids[pid].includes(G.leadSuit)) G.memory.voids[pid].push(G.leadSuit);
    }
    view.renderTableCard(pid, c, necessary);
    if (pid === 1) view.renderHand();
  }

  async function nextTurn() {
    if (G.trick.length === 4) { await endTrick(); return; }
    G.current = NEXT[G.current];
    view.updateUI();
    if (G.current !== 1) {
      await view.delay(480);
      await doPlayCard(G.current, aiPick(G, G.current));
      await nextTurn();
    } else {
      G.processing = false;
      G.selectedCard = null;
      view.renderHand();
    }
  }

  async function endTrick() {
    G.phase = 'trickEnd';
    const w = trickWinner(G.trick, G.leadSuit, G.trumpMode, G.trump);
    G.lastTrick = {
      entries: G.trick.map((t) => ({
        player: t.player, card: t.card, necessary: t.necessary,
        recommended: t.recommended, forcedFollow: t.forcedFollow,
      })),
      winner: w.player, trickNum: G.trickNum,
    };

    const leaderEntry = G.trick[0];
    if (G.trickNum === 1 && leaderEntry.player === G.hakem && G.trumpMode === 'normal' && leaderEntry.card.suit !== G.trump) {
      recordSignal(G, leaderEntry.player, leaderEntry.card.suit, 2);
    }
    for (const t of G.trick) {
      if (t.player === leaderEntry.player) continue;
      if (t.card.suit !== G.leadSuit) continue;
      if (t.player === w.player) continue;
      if (cardVal(t.card, G.trumpMode) >= 7) {
        recordSignal(G, t.player, t.card.suit, t.forcedFollow ? 1 : 2);
      }
    }
    for (const t of G.trick) {
      if (t.contSignal && w.player === PARTNER[t.player]) {
        recordSignal(G, t.player, t.card.suit, 2);
      }
    }

    G.tricksWon[G.players[w.player].team]++;
    if (!G.memory.tricks) G.memory.tricks = [];
    G.memory.tricks.push({
      trickNum: G.trickNum,
      leadSuit: G.leadSuit,
      winner: w.player,
      team: G.players[w.player].team,
      plays: G.trick.map((t) => ({ player: t.player, card: { ...t.card } })),
    });
    view.sfx(G.players[w.player].team === 'A' ? 'trickWinUs' : 'trickWinThem');
    view.updateUI();
    view.showPopup(`${G.players[w.player].name} دست را برد!`);
    await view.delay(850);
    view.hidePopup();
    G.starter = w.player;

    if (G.bamMode) {
      if (G.tricksWon[G.kotTeam] === 13) {
        G.score[G.kotTeam] = Math.max(7, G.score[G.kotTeam]);
        logRound({ tricksA: G.tricksWon.A, tricksB: G.tricksWon.B, winner: G.kotTeam, pts: 7, trump: currentTrumpLabel(), kot: true, bam: true });
        showEnd(G.kotTeam, true);
        return;
      }
      if (G.trickNum === 13) { await endRound(); return; }
      await startTrick();
      return;
    }

    if (G.tricksWon.A === 7 && G.tricksWon.B === 0) { await handleKot('A'); return; }
    if (G.tricksWon.B === 7 && G.tricksWon.A === 0) { await handleKot('B'); return; }
    if (G.tricksWon.A >= 7 || G.tricksWon.B >= 7) { await endRound(); return; }
    if (G.trickNum === 13) { await endRound(); return; }
    await startTrick();
  }

  function currentTrumpLabel() {
    if (G.trumpMode === 'normal') return G.trump ? SYMBOLS[G.trump] : '-';
    if (G.trumpMode === 'ners') return '(2) نرس';
    if (G.trumpMode === 'asners') return '(A2) آس‌نرس';
    return '(A) سرس';
  }

  function logRound(entry) { G.roundHistory.push(entry); }

  async function handleKot(team) {
    G.kotTeam = team;
    G.kotPoints = getKotPoints(G, team);
    if (team === 'A') {
      view.sfx('kotUs');
      view.showKot(`کوت کردید! (+${G.kotPoints} امتیاز)`);
    } else {
      view.sfx('kotThem');
      G.score[team] += G.kotPoints;
      view.updateUI();
      if (rng() < 0.15) {
        G.bamMode = true;
        view.showPopup('حریف درخواست بام داد!');
        await view.delay(1200);
        view.hidePopup();
        await startTrick();
      } else {
        logRound({ tricksA: G.tricksWon.A, tricksB: G.tricksWon.B, winner: team, pts: G.kotPoints, trump: currentTrumpLabel(), kot: true, bam: false });
        const hTeam2 = G.players[G.hakem].team;
        if (team !== hTeam2) G.hakem = NEXT[G.hakem];
        if (checkGameEnd()) return;
        view.showRound('کوت شدید!', `+${G.kotPoints} امتیاز برای حریف<br><br>نتیجه کل: ${G.score.A} - ${G.score.B}`, 'them');
      }
    }
  }

  async function endRound() {
    G.phase = 'roundEnd';
    let winner = null, pts = 0;
    if (G.tricksWon.A >= 7) { winner = 'A'; pts = 1; G.score.A += 1; }
    else if (G.tricksWon.B >= 7) { winner = 'B'; pts = 1; G.score.B += 1; }
    logRound({ tricksA: G.tricksWon.A, tricksB: G.tricksWon.B, winner, pts, trump: currentTrumpLabel(), kot: !!G.kotTeam, bam: false });
    view.updateUI();
    const hTeam = G.players[G.hakem].team;
    if (winner && winner !== hTeam) G.hakem = NEXT[G.hakem];
    if (checkGameEnd()) return;
    view.showRound(winner === 'A' ? 'برنده این دست شدید!' : 'این دست را واگذار کردید', `دست‌های گرفته‌شده: ${G.tricksWon.A} - ${G.tricksWon.B}<br>امتیاز دریافتی: +${pts}<br><br>امتیاز کل: ${G.score.A} - ${G.score.B}`, winner === 'A' ? 'us' : 'them');
  }

  function checkGameEnd() {
    if (G.score.A >= 7) { showEnd('A', false); return true; }
    if (G.score.B >= 7) { showEnd('B', false); return true; }
    return false;
  }

  function showEnd(w, isBam) {
    let title, msg;
    if (isBam) {
      title = w === 'A' ? '🎉 بام! پیروزی مقتدرانه!' : '💀 بام! شکست در بازی!';
      msg = 'با گرفتن هر ۱۳ دست، بازی یکجا تمام شد!';
      view.sfx(w === 'A' ? 'bam' : 'lose');
    } else {
      title = w === 'A' ? '🎉 پیروزی در مسابقه!' : 'پایان بازی — برد حریف';
      msg = `${G.score.A} - ${G.score.B}`;
      view.sfx(w === 'A' ? 'win' : 'lose');
    }
    view.showEnd(title, msg, w);
    if (storage) storage.onGameEnd(w, G);
    if (storage) storage.clearSave();
  }

  async function startTrick() {
    G.trickNum++;
    G.trick = [];
    G.leadSuit = null;
    G.phase = 'play';
    G.processing = false;
    G.selectedCard = null;
    trickSnaps[G.trickNum] = snapshotTrickStart(G);
    view.clearTable();
    if (G.trickNum === 1) G.starter = G.hakem;
    G.current = G.starter;
    view.updateUI();
    view.renderHand();
    if (G.current !== 1) {
      G.processing = true;
      await view.delay(480);
      await doPlayCard(G.current, aiPick(G, G.current));
      await nextTurn();
    }
  }

  async function dealRest() {
    const order = dealOrder(G.hakem);
    let i = 0;
    for (let r = 0; r < 4; r++) {
      for (const pid of order) {
        G.players[pid].hand.push(G.deck[20 + i++]);
      }
    }
    for (let r = 0; r < 4; r++) {
      for (const pid of order) {
        G.players[pid].hand.push(G.deck[20 + i++]);
      }
    }
    for (let p = 1; p <= 4; p++) G.players[p].hand = sortHand(G.players[p].hand, G.trump, G.trumpMode);
    view.renderHand();
    await view.delay(250);
    await startTrick();
  }

  function setTrump(mode, suit) {
    G.trumpMode = mode;
    G.trump = suit;
    view.updateUI();
  }

  async function selectTrump() {
    G.phase = 'trump';
    if (G.hakem === 1) {
      view.showTrumpPicker(sortHand(G.players[1].hand.slice(0, 5), null, 'normal'));
    } else {
      await view.delay(550);
      setTrump('normal', pickAiTrump(G.players[G.hakem].hand.slice(0, 5), G));
      await dealRest();
    }
  }

  async function dealFirst() {
    G.phase = 'deal';
    G.deck = shuffle(makeDeck(), rng);
    const order = dealOrder(G.hakem);
    let i = 0;
    for (let r = 0; r < 5; r++) {
      for (const pid of order) {
        G.players[pid].hand.push(G.deck[i++]);
      }
    }
    view.renderHand();
    await selectTrump();
  }

  async function startRound() {
    G.tricksWon = { A: 0, B: 0 };
    G.trickNum = 0;
    G.trump = null;
    G.trumpMode = 'normal';
    G.trick = [];
    G.leadSuit = null;
    G.kotTeam = null;
    G.kotPoints = 0;
    G.bamMode = false;
    G.lastTrick = null;
    G.processing = false;
    G.selectedCard = null;
    G.memory = { played: [], voids: {}, aces: {}, kings: {}, signals: [], tricks: [] };
    for (let i = 1; i <= 4; i++) G.players[i].hand = [];
    view.updateUI();
    view.clearTable();
    await dealFirst();
  }

  function buildAceDrawSequence(targetHakem) {
    const order = [1, 4, 3, 2];
    const nonAces = [
      { suit: 'clubs', rank: '7' }, { suit: 'diamonds', rank: '10' },
      { suit: 'hearts', rank: 'K' }, { suit: 'spades', rank: '9' },
      { suit: 'diamonds', rank: 'Q' }, { suit: 'clubs', rank: 'J' },
      { suit: 'hearts', rank: '8' },
    ];
    const seq = [];
    let idx = 0;
    for (let step = 0; step < 8; step++) {
      const pid = order[step % 4];
      if (step >= 3 && pid === targetHakem) {
        const aceSuits = ['spades', 'hearts', 'diamonds', 'clubs'];
        seq.push({ player: pid, card: { suit: aceSuits[targetHakem - 1], rank: 'A' }, isAce: true });
        break;
      } else {
        seq.push({ player: pid, card: nonAces[idx++ % nonAces.length], isAce: false });
      }
    }
    return seq;
  }

  function startGame() {
    if (storage) storage.clearSave();
    G.score = { A: 0, B: 0 };
    G.roundHistory = [];
    G.hakem = Math.floor(rng() * 4) + 1;
    G.aceDrawHistory = buildAceDrawSequence(G.hakem);
    if (view.onAceDraw) view.onAceDraw(G.aceDrawHistory, G.hakem);
    return startRound();
  }

  async function playHuman(c) {
    G.processing = true;
    const recommended = aiPick(G, 1);
    await doPlayCard(1, c, recommended);
    await nextTurn();
  }

  async function humanChoseTrump(mode, suit) {
    setTrump(mode, suit);
    await dealRest();
  }

  async function continueFrom(loaded) {
    Object.assign(G, createState());
    G.players = loaded.players; G.hakem = loaded.hakem; G.trump = loaded.trump;
    G.trumpMode = loaded.trumpMode; G.trick = loaded.trick; G.leadSuit = loaded.leadSuit;
    G.current = loaded.current; G.starter = loaded.starter; G.tricksWon = loaded.tricksWon;
    G.score = loaded.score; G.trickNum = loaded.trickNum; G.phase = loaded.phase;
    G.processing = false; G.selectedCard = null;
    G.deck = loaded.deck || [];
    G.memory = loaded.memory || { played: [], voids: {}, aces: {}, kings: {}, signals: [], tricks: [] };
    if (!G.memory.signals) G.memory.signals = [];
    G.kotTeam = loaded.kotTeam; G.kotPoints = loaded.kotPoints; G.bamMode = loaded.bamMode;
    G.roundHistory = loaded.roundHistory || []; G.lastTrick = loaded.lastTrick || null;
    view.clearTable();
    for (const t of G.trick) view.renderTableCard(t.player, t.card, t.necessary);
    view.renderHand();
    view.updateUI();
    if (G.current !== 1 && G.phase === 'play') {
      G.processing = true;
      await view.delay(480);
      await doPlayCard(G.current, aiPick(G, G.current));
      await nextTurn();
    }
  }

  async function bamAccept() {
    G.score[G.kotTeam] += G.kotPoints;
    view.updateUI();
    G.bamMode = true;
    await startTrick();
  }
  async function bamDecline() {
    G.score[G.kotTeam] += G.kotPoints;
    view.updateUI();
    logRound({ tricksA: G.tricksWon.A, tricksB: G.tricksWon.B, winner: G.kotTeam, pts: G.kotPoints, trump: currentTrumpLabel(), kot: true, bam: false });
    const hTeam = G.players[G.hakem].team;
    if (G.kotTeam !== hTeam) G.hakem = NEXT[G.hakem];
    if (checkGameEnd()) return;
    view.showRound('کوت کردید!', `+${G.kotPoints} امتیاز<br><br>امتیاز کل: ${G.score.A} - ${G.score.B}`, 'us');
  }

  return {
    G, playable: (pid) => playable(G, pid), doPlayCard, nextTurn, startTrick, endTrick,
    startGame, startRound, playHuman, humanChoseTrump, continueFrom, bamAccept, bamDecline,
    currentTrumpLabel, checkGameEnd,
    trickSnaps,
  };
}
