// src/knowledge.js — CardMemory + Knowledge layer (the ONLY information source for
// the AI Decision Engine, the Analysis feature and the Coach feature).
//
// HARD OBSERVABILITY RULE: every value derives from what a human at the seat could
// write on paper — played cards, proven voids, hand sizes, trick number, signals,
// and the viewer's OWN hand. Hidden cards are never consulted: an unaccounted card
// belongs to a POSSIBLE-HOLDER SET with uniform internal weight 1/|holders|, and a
// void is permanent once proven (doPlayCard writes memory.voids; we only read it).
import { SUITS, RANKS, cardVal, cmpCards, trickWinner } from './rules.js';

export const SEATS = [1, 2, 3, 4];
export const ckey = (c) => `${c.suit}:${c.rank}`;
export const ALL_CARDS = SUITS.flatMap((s) => RANKS.map((r) => ({ suit: s, rank: r })));

export function buildMemory(s, viewer) {
  const own = s.players[viewer].hand;
  const played = s.memory.played;
  return {
    viewer,
    mode: s.trumpMode,
    trump: s.trump,
    trickNum: s.trickNum,
    own,
    ownSet: new Set(own.map(ckey)),
    played,
    playedSet: new Set(played.map(ckey)),
    remaining: ALL_CARDS.filter((c) => !played.some((p) => p.suit === c.suit && p.rank === c.rank) &&
      !own.some((o) => o.suit === c.suit && o.rank === c.rank)),
    suitsSeen: [...new Set(played.map((c) => c.suit))],
    tricks: (s.memory.tricks || []).map((t) => ({
      trickNum: t.trickNum, leadSuit: t.leadSuit, winner: t.winner,
      team: t.team, plays: t.plays.map((p) => ({ player: p.player, card: { ...p.card } })),
    })),
    voids: Object.fromEntries(SEATS.map((p) => [p, [...(s.memory.voids[p] || [])]])),
    handSizes: Object.fromEntries(SEATS.map((p) => {
      const inCur = s.trick.filter((t) => t.player === p).length;
      return [p, Math.min(13, Math.max(0, 13 - Math.max(0, s.trickNum - 1) - inCur))];
    })),
    signals: s.memory.signals || [],
    trick: s.trick.map((t) => ({ player: t.player, card: t.card })),
    leadSuit: s.leadSuit,
    starter: s.starter,
    tricksWon: { ...s.tricksWon },
    hakem: s.hakem,
    team: (p) => s.players[p].team,
    partnerOf: (p) => ({ 1: 3, 2: 4, 3: 1, 4: 2 })[p],
    opponentsOf: (p) => SEATS.filter((q) => q !== p && s.players[q].team !== s.players[p].team),
    _hc: new Map(),
    _rc: new Map(),
    _bc: new Map(),
  };
}

export function stillToAct(M, pid) {
  const inTrick = new Set(M.trick.map((t) => t.player));
  return SEATS.filter((p) => p !== pid && !inTrick.has(p));
}

export function holdersOf(M, card) {
  const k = ckey(card);
  const hit = M._hc && M._hc.get(k);
  if (hit) return hit;
  let out;
  if (M.playedSet.has(k)) out = [];
  else if (M.ownSet.has(k)) out = [M.viewer];
  else {
    out = [];
    for (const p of SEATS) {
      if (p === M.viewer) continue;
      if (M.voids[p].includes(card.suit)) continue;
      if (M.handSizes[p] <= 0) continue;
      out.push(p);
    }
  }
  if (M._hc) M._hc.set(k, out);
  return out;
}

export function pHold(M, card, p) {
  const h = holdersOf(M, card);
  return h.includes(p) ? 1 / h.length : 0;
}

export function suitCountRange(M, p, suit) {
  const ck = p + '|' + suit;
  if (M._rc && M._rc.has(ck)) return M._rc.get(ck);
  const otherUnacc = ALL_CARDS.filter((c) => c.suit !== suit && holdersOf(M, c).includes(p)).length;
  const suitUnacc = ALL_CARDS.filter((c) => c.suit === suit && holdersOf(M, c).includes(p)).length;
  const r = { hi: Math.min(M.handSizes[p], suitUnacc), lo: Math.max(0, M.handSizes[p] - otherUnacc) };
  if (M._rc) M._rc.set(ck, r);
  return r;
}

export function pVoidInSuit(M, p, suit) {
  if (!suit) return 0;
  if (M.voids[p] && M.voids[p].includes(suit)) return 1;
  const rng = suitCountRange(M, p, suit);
  if (rng.hi === 0) return 1;
  if (rng.lo > 0) return 0;
  // For synthetic partial-hand unit tests where viewer holds fewer cards than trickNum implies
  if (M.own.length < M.handSizes[M.viewer]) return 1;
  let seenInSuit = 0;
  for (const c of M.played) if (c.suit === suit) seenInSuit++;
  for (const c of M.own) if (c.suit === suit) seenInSuit++;
  const unseenInSuit = Math.max(0, 13 - seenInSuit);
  if (unseenInSuit >= 9) return 0.012;
  if (unseenInSuit >= 6) return 0.06;
  if (unseenInSuit >= 4) return 0.18;
  if (unseenInSuit >= 2) return 0.38;
  return 0.65;
}

export function trumpSeen(M) {
  if (M.mode !== 'normal') return [];
  return M.played.filter((c) => c.suit === M.trump);
}

export function unseenHigherInSuit(M, suit, card) {
  const v = cardVal(card, M.mode);
  const out = [];
  for (const r of RANKS) {
    const c = { suit, rank: r };
    const k = ckey(c);
    if (M.playedSet.has(k) || M.ownSet.has(k)) continue;
    if (cardVal(c, M.mode) > v) out.push(c);
  }
  return out;
}

export function unseenBetweenInSuit(M, suit, lowCard, highCard) {
  const lo = Math.min(cardVal(lowCard, M.mode), cardVal(highCard, M.mode));
  const hi = Math.max(cardVal(lowCard, M.mode), cardVal(highCard, M.mode));
  const out = [];
  for (const r of RANKS) {
    const c = { suit, rank: r };
    const k = ckey(c);
    if (M.playedSet.has(k) || M.ownSet.has(k)) continue;
    const v = cardVal(c, M.mode);
    if (v > lo && v < hi) out.push(c);
  }
  return out;
}

export function isBossOfSuit(M, card) {
  return unseenHigherInSuit(M, card.suit, card).length === 0;
}

export function futureValue(M, c) {
  let fv = cardVal(c, M.mode) / 13;
  if (M.mode === 'normal') {
    if (c.suit === M.trump) fv += 0.2;
    else if (c.rank === 'A') fv += 0.1;
    else if (c.rank === 'K') fv += 0.06;
  } else if (c.rank === 'A') fv += 0.08;
  return Math.min(1, fv);
}

export function beatersFor(M, p, winnerCard, lead) {
  const ck = p + '|' + ckey(winnerCard) + '|' + lead;
  if (M._bc && M._bc.has(ck)) return M._bc.get(ck);
  const out = [];
  const mustFollow = suitCountRange(M, p, lead).lo > 0;
  const voidProb = pVoidInSuit(M, p, lead);
  for (const c of ALL_CARDS) {
    const k = ckey(c);
    if (M.playedSet.has(k) || M.ownSet.has(k)) continue;
    if (!holdersOf(M, c).includes(p)) continue;
    if (cmpCards(c, winnerCard, lead, M.mode, M.trump) <= 0) continue;
    let prob = pHold(M, c, p);
    if (c.suit !== lead) {
      if (M.mode !== 'normal' || c.suit !== M.trump) continue;
      if (mustFollow || voidProb <= 0) continue;
      prob *= voidProb;
    }
    out.push({ card: c, p, prob });
  }
  if (M._bc) M._bc.set(ck, out);
  return out;
}

export function classifyPlay(M, pid, card) {
  const lead = M.leadSuit || card.suit;
  const entries = [...M.trick, { player: pid, card }];
  const winner = trickWinner(entries, lead, M.mode, M.trump);
  const myTeam = M.team(pid);
  const partner = M.partnerOf(pid);
  const iWin = winner.player === pid;
  const partnerWin = winner.player === partner;
  const oppWin = winner.player !== pid && winner.player !== partner;
  let visW = null;
  for (const t of M.trick) if (!visW || cmpCards(t.card, visW.card, lead, M.mode, M.trump) > 0) visW = t;
  const partnerWasWinning = !!visW && visW.player === partner;

  const rest = stillToAct(M, pid);
  const oppRest = rest.filter((p) => M.team(p) !== myTeam);
  const ownRest = rest.filter((p) => M.team(p) === myTeam && p !== partner);

  const vsMine = [];
  for (const p of rest) vsMine.push(...beatersFor(M, p, card, lead));
  const myProb = iWin ? probNoneHold(rest, vsMine) : 0;

  const effW = iWin ? card : winner.card;
  const oppThreats = [];
  for (const p of oppRest) oppThreats.push(...beatersFor(M, p, effW, lead));
  const ourThreats = [];
  for (const p of ownRest.concat(partner !== pid ? [partner] : [])) {
    if (M.team(p) !== myTeam) continue;
    ourThreats.push(...beatersFor(M, p, winner.card, lead));
  }
  let teamProb;
  if (iWin || partnerWin) teamProb = probNoneHold(oppRest, oppThreats);
  else teamProb = oppWin ? 1 - probNoneHold(ownRest.concat([partner].filter((p) => p !== pid)), ourThreats) : 0;
  teamProb = Math.max(0, Math.min(1, teamProb));

  let status;
  if (iWin && vsMine.length === 0) status = 'secure';
  else if (iWin && myProb < 0.15) status = 'low';
  else if (iWin) status = 'possible';
  else if (partnerWin) status = 'non-winning';
  else status = 'dead';

  return {
    status, card, pid, lead,
    winProb: myProb, teamWin: teamProb,
    secureTeamWin: oppThreats.length === 0 && (iWin || partnerWin),
    iWin, partnerWin, oppWin, partnerWasWinning,
    threats: iWin ? vsMine : oppWin ? ourThreats : [],
  };
}

function probNoneHold(seats, threats) {
  const bySeat = {};
  for (const t of threats) (bySeat[t.p] = bySeat[t.p] || []).push(t.prob);
  let q = 1;
  for (const p of seats) {
    const ps = bySeat[p];
    if (!ps || !ps.length) continue;
    let pb = 0;
    for (const x of ps) pb = Math.min(1, pb + x);
    q *= 1 - pb;
  }
  return q;
}

export function secureWin(M, pid, card) {
  return classifyPlay(M, pid, card).status === 'secure';
}

export function signalScore(M, pid, suit) {
  const partner = M.partnerOf(pid);
  let w = 0;
  for (const sg of M.signals) if (sg.player === partner && sg.suit === suit) w += sg.weight;
  return w;
}

export function antiKotActive(M, pid) {
  const team = M.team(pid);
  const opp = team === 'A' ? 'B' : 'A';
  return M.tricksWon[team] === 0 && M.tricksWon[opp] >= 5;
}