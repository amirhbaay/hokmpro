// src/advisor.js — Analysis + Coach. BOTH reuse the exact Decision Engine
// (decision.js + positions.js) over the exact knowledge layer (knowledge.js).
import { playable } from './rules.js';
import { decide, explain } from './decision.js';
import { decideByPosition } from './positions.js';

function decisionTimeView(Gnow, trickSnapshot, position) {
  const s = JSON.parse(JSON.stringify(trickSnapshot));
  for (let i = 0; i < position; i++) {
    const e = s.trickStartEntries[i];
    const h = s.players[e.player].hand;
    const hi = h.findIndex((x) => x.suit === e.card.suit && x.rank === e.card.rank);
    if (hi > -1) h.splice(hi, 1);
    s.trick.push({ player: e.player, card: e.card });
    if (s.trick.length === 1) s.leadSuit = e.card.suit;
    s.memory.played.push({ ...e.card });
    if (s.leadSuit && e.card.suit !== s.leadSuit) {
      if (!s.memory.voids[e.player]) s.memory.voids[e.player] = [];
      if (!s.memory.voids[e.player].includes(s.leadSuit)) s.memory.voids[e.player].push(s.leadSuit);
    }
  }
  delete s.trickStartEntries;
  return s;
}

export function gradeMove(Gnow, trickSnapshots, trickNum, position, pid, playedCard) {
  const snap = trickSnapshots[trickNum];
  if (!snap) return null;
  const s = decisionTimeView(Gnow, snap, position);
  const legal = playable(s, pid);
  const chosen = legal.find((c) => c.suit === playedCard.suit && c.rank === playedCard.rank);
  if (!chosen) return null;
  const d = decide(s, pid, () => 0);
  const posD = decideByPosition(s, pid);
  if (!d) return null;
  const top = posD && posD.pick ? posD.pick : d.top;
  const pick = d.ranked.find((x) => x.card.suit === chosen.suit && x.card.rank === chosen.rank);
  const isPosPick = posD && posD.card.suit === chosen.suit && posD.card.rank === chosen.rank;
  const gap = isPosPick ? 0 : Math.max(0, top.score - (pick ? pick.score : -Infinity));
  let quality;
  if (isPosPick || (pick && pick.card === top.card) || gap <= 0.0001) quality = 'excellent';
  else if (gap <= 1.5) quality = 'good';
  else if (gap <= 4) quality = 'improvable';
  else quality = 'mistake';
  const better = quality === 'excellent' ? null : top;
  const rawGoals = isPosPick && posD.goals ? [...posD.goals, ...(pick ? pick.goals : [])] : (pick ? pick.goals : []);
  const tactics = [...new Set(rawGoals)].filter((g) => TACTIC_GOALS.has(g));
  return {
    quality, gap,
    played: playedCard,
    better: better ? better.card : null,
    reason: better ? (posD ? posD.reason : explain(top)) : (isPosPick && posD ? posD.reason : explain(pick)),
    tactics,
    tacticLabels: tactics.map((g) => TACTIC_LABELS[g] || g),
    outcomeNote: null,
  };
}

const TACTIC_GOALS = new Set([
  'THIRD_SEAT_MAX_PRESSURE', 'THIRD_MAX_PRESSURE', 'FORCE_OPPONENT_PREMIUM_RESPONSE',
  'ESTABLISH_SECONDARY_HONOR', 'TRUMP_CONTROL', 'ANTI_KOT',
  'PARTNER_CONTINUATION_SIGNAL', 'FORCE_EXPENSIVE_RESPONSE',
  'CASH_SIDE_ACE', 'FINESSE', 'SECOND_HAND_LOW', 'FOURTH_TAKE_CHEAPEST',
  'RUFF_CHEAPEST', 'PRESSURE_LEAD', 'PARTNER_SIGNAL_LEAD',
]);
const TACTIC_LABELS = {
  THIRD_SEAT_MAX_PRESSURE: 'قاعده دست سوم بالا',
  THIRD_MAX_PRESSURE: 'قاعده دست سوم بالا',
  FORCE_OPPONENT_PREMIUM_RESPONSE: 'تحمیل خرج کارت سر به حریف',
  ESTABLISH_SECONDARY_HONOR: 'سر کردن شاه/بیبی جانبی',
  TRUMP_CONTROL: 'حفظ کنترل حکم',
  ANTI_KOT: 'استراتژی ضد کوت',
  PARTNER_CONTINUATION_SIGNAL: 'سیگنال ادامه به یار',
  FORCE_EXPENSIVE_RESPONSE: 'پاسخ گران برای حریف',
  CASH_SIDE_ACE: 'نقد کردن آس جانبی',
  FINESSE: 'تکنیک فینس (Finesse)',
  SECOND_HAND_LOW: 'قاعده دست دوم پایین',
  FOURTH_TAKE_CHEAPEST: 'دست چهارم ارزان ببر',
  RUFF_CHEAPEST: 'برش بهینه با کمترین حکم',
  PRESSURE_LEAD: 'لید فشاری در خال خالی',
  PARTNER_SIGNAL_LEAD: 'پاس به سیگنال یار',
};

export function coachHint(Gnow, pid) {
  const d = decide(Gnow, pid);
  const posD = decideByPosition(Gnow, pid);
  if (!d) return null;
  const bestCard = posD ? posD.card : d.top.card;
  const bestReason = posD ? posD.reason : explain(d.top);
  const altEntry = d.ranked.find((x) => !(x.card.suit === bestCard.suit && x.card.rank === bestCard.rank));
  const second = altEntry && altEntry.score >= d.top.score - 3.5 ? altEntry : null;
  return {
    best: bestCard, bestReason,
    alt: second ? second.card : null, altReason: second ? explain(second) : null,
  };
}

export function snapshotTrickStart(G) {
  return {
    players: JSON.parse(JSON.stringify(G.players)),
    trump: G.trump, trumpMode: G.trumpMode, trickNum: G.trickNum,
    starter: G.starter, tricksWon: { ...G.tricksWon },
    score: { ...G.score }, hakem: G.hakem,
    memory: JSON.parse(JSON.stringify(G.memory)),
    trick: [], leadSuit: null,
    trickStartEntries: [],
  };
}

export function appendToSnapshot(snap, entry) {
  snap.trickStartEntries.push({ player: entry.player, card: entry.card });
}
