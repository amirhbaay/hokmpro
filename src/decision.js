// src/decision.js — the Decision Engine shared by AI seats, Analysis and Coach.
import { SUITS, RANKS, PARTNER, cardVal, cmpCards, playable } from './rules.js';
import {
  buildMemory, classifyPlay, stillToAct, futureValue, beatersFor, suitCountRange,
  signalScore, antiKotActive, isBossOfSuit, ckey,
} from './knowledge.js';
import { riskAppetite, endgameWeights } from './risk.js';

export const GOALS = [
  'WIN_TRICK', 'PROTECT_PARTNER', 'FORCE_TRUMP', 'DRAW_TRUMPS', 'CREATE_VOID',
  'PRESERVE_HIGH_CARD', 'PARTNER_SUPPORT', 'BLEED_LOW_CARD', 'FORCE_EXPENSIVE_RESPONSE',
  'THIRD_SEAT_MAX_PRESSURE', 'FORCE_OPPONENT_PREMIUM_RESPONSE', 'ESTABLISH_SECONDARY_HONOR',
  'TRUMP_CONTROL', 'ANTI_KOT', 'PARTNER_CONTINUATION_SIGNAL', 'CASH_SIDE_ACE', 'FINESSE',
  'SECOND_HAND_LOW',
];

function shortnessBonus(M, pid, c) {
  if (M.mode !== 'normal' || c.suit === M.trump) return 0;
  const n = M.own.filter((x) => x.suit === c.suit).length;
  if (n === 1) return 0.55;
  if (n === 2) return 0.25;
  return 0;
}

function drawTrumpsBonus(M, pid, c) {
  if (M.mode !== 'normal' || !M.trump || c.suit !== M.trump) return 0;
  const opps = M.opponentsOf(pid);
  const bothVoidTrump = opps.length === 2 && opps.every((p) => M.voids[p].includes(M.trump));
  if (bothVoidTrump) return 0.6;
  const myTrumps = M.own.filter((x) => x.suit === M.trump);
  const maxMyTrumpVal = Math.max(0, ...myTrumps.map((x) => cardVal(x, 'normal')));
  if (cardVal(c, 'normal') < maxMyTrumpVal) return 0;

  const liveDesc = RANKS.slice().sort((a, b) => RANKS.indexOf(b) - RANKS.indexOf(a))
    .filter((r) => !M.playedSet.has(ckey({ suit: M.trump, rank: r })));
  let run = 0;
  for (const r of liveDesc) {
    if (M.own.some((x) => x.suit === M.trump && x.rank === r)) run++;
    else break;
  }
  if (run >= 3) return 0.55;
  if (run >= 2 && myTrumps.length >= 4) return 0.45;
  if (run >= 1 && myTrumps.length >= 5) return 0.4;
  return 0;
}

function expensiveResponseBonus(M, pid, card, cls) {
  if (!cls.iWin) return 0;
  let b = 0;
  for (const p of M.opponentsOf(pid).filter((q) => stillToAct(M, pid).includes(q))) {
    const bs = beatersFor(M, p, card, cls.lead);
    if (!bs.length) continue;
    const top = Math.max(...bs.map((x) => cardVal(x.card, M.mode)));
    const ruffBeat = M.mode === 'normal' && bs.some((x) => x.card.suit === M.trump && card.suit !== M.trump);
    if (top >= 12 || ruffBeat) b += 0.35;
  }
  return b;
}

function trumpControlPair(M) {
  if (M.mode !== 'normal' || !M.trump) return false;
  const t = M.own.filter((x) => x.suit === M.trump);
  return t.some((x) => x.rank === 'A') && t.some((x) => x.rank === 'K');
}

function legalPool(M, pid) {
  const lead = M.leadSuit;
  const must = lead && M.own.some((x) => x.suit === lead);
  return must ? M.own.filter((x) => x.suit === lead) : M.own;
}

function duckUnderPartner(M, pid, c, cls, kotRisk) {
  const out = { score: 0, tags: [] };
  if (cls.status !== 'non-winning' || !cls.partnerWasWinning || M.trick.length < 2) return out;
  const lead = M.leadSuit;
  if (!lead || c.suit !== lead) return out;
  let w = M.trick[0];
  for (const t of M.trick) if (cmpCards(t.card, w.card, lead, M.mode, M.trump) > 0) w = t;
  if (w.player !== M.partnerOf(pid)) return out;
  const rest = stillToAct(M, pid);
  if (rest.length === 1 && cardVal(w.card, M.mode) < 11 && !isBossOfSuit(M, w.card)) {
    return out;
  }
  const higher = legalPool(M, pid).some((x) => cmpCards(x, w.card, lead, M.mode, M.trump) > 0);
  if (!higher) return out;
  if (cardVal(c, M.mode) >= cardVal(w.card, M.mode)) return out;
  if (rest.length === 1 && M.team(rest[0]) !== M.team(pid)) {
    const bs = beatersFor(M, rest[0], w.card, lead);
    const premium = bs.filter((b) => cardVal(b.card, M.mode) >= 13 ||
      (M.mode === 'normal' && b.card.suit === M.trump && w.card.suit !== M.trump));
    if (premium.length) {
      out.score += kotRisk ? 0.2 : 0.7;
      out.tags.push('THIRD_SEAT_MAX_PRESSURE', 'FORCE_OPPONENT_PREMIUM_RESPONSE');
    }
  }
  if (rest.length === 0) { out.score += 0.7; out.tags.push('PARTNER_CONTINUATION_SIGNAL'); }
  return out;
}

function firstTrickLeadAdjust(M, pid, c, kotRisk) {
  const out = { score: 0, tags: [] };
  const isTrump = M.mode === 'normal' && !!M.trump && c.suit === M.trump;
  const trumps = M.mode === 'normal' && M.trump ? M.own.filter((x) => x.suit === M.trump) : [];
  const akPair = trumps.some((x) => x.rank === 'A') && trumps.some((x) => x.rank === 'K');
  if (isTrump) {
    if (akPair) out.tags.push('TRUMP_CONTROL');
    if (c.rank === 'A') {
      const controlOurs = akPair && trumps.length >= 3;
      if (!kotRisk) out.score -= controlOurs ? 1.5 : 6;
    } else if (c.rank === 'K' && akPair && !kotRisk) {
      out.score -= 1.5;
    } else if (!kotRisk) {
      out.score -= 5;
    }
    return out;
  }
  // Cashing a side Ace on Trick 1 when holding a real game hand (>=5 cards) or >=2 cards in the suit
  const suitLen = M.own.filter((x) => x.suit === c.suit).length;
  if (c.rank === 'A' && M.mode === 'normal' && (M.own.length >= 5 || suitLen >= 2)) {
    out.score += 2.2;
    out.tags.push('CASH_SIDE_ACE');
    return out;
  }
  if (kotRisk) return out;
  if (c.rank === 'K' || c.rank === 'Q') {
    const lower = M.own.some((x) => x.suit === c.suit && cardVal(x, M.mode) < cardVal(c, M.mode));
    if (lower) { out.score -= 2; out.tags.push('ESTABLISH_SECONDARY_HONOR'); }
  } else if (M.mode === 'normal' && cardVal(c, 'normal') < 11 &&
             M.own.some((x) => x.suit === c.suit && (x.rank === 'K' || x.rank === 'Q'))) {
    out.score += 0.6; out.tags.push('ESTABLISH_SECONDARY_HONOR');
  }
  return out;
}

function pressureBonus(M, pid, card) {
  const opps = M.opponentsOf(pid);
  const bothVoidSuit = opps.length === 2 && opps.every((p) => suitCountRange(M, p, card.suit).hi === 0);
  if (bothVoidSuit) return 0.5;
  let b = 0;
  for (const p of opps) {
    const r = suitCountRange(M, p, card.suit);
    const voidTrump = M.mode === 'normal' && M.trump && M.voids[p].includes(M.trump);
    if (r.hi === 0 && voidTrump) b += 0.45;
    else if (r.lo === 0 && r.hi <= 2) b += 0.1;
  }
  return Math.min(0.5, b);
}

export function scoreMoves(s, pid) {
  const M = buildMemory(s, pid);
  const legal = playable(s, pid);
  const lead = M.trick.length === 0;
  const risk = riskAppetite(s, pid);
  const endg = endgameWeights(s);
  const winMult = endg ? endg.winNowMult : 1;
  const futMult = endg ? endg.futureMult : 1;
  const ctrlMult = endg ? endg.controlMult : 1;
  const kotRisk = antiKotActive(M, pid);
  const opps = M.opponentsOf(pid);

  const scored = legal.map((c) => {
    const cls = classifyPlay(M, pid, c);
    const v = cardVal(c, M.mode);
    const fv = futureValue(M, c);
    const goals = [];
    let sc = 0;

    if (cls.status === 'secure') {
      sc += 10 * winMult;
      goals.push('WIN_TRICK');
      sc += expensiveResponseBonus(M, pid, c, cls) * 0.5;
    } else if (cls.status === 'possible') {
      sc += (3.5 + 3 * cls.winProb) * winMult * (risk > 0 ? 1 : 0.6);
      goals.push('WIN_TRICK');
      sc += expensiveResponseBonus(M, pid, c, cls);
    } else if (cls.status === 'low') {
      sc += 0.5 * cls.winProb * Math.max(0, risk);
    } else if (cls.status === 'non-winning') {
      goals.push('PROTECT_PARTNER');
      sc += 8 - 3 * fv;
      if (M.mode === 'normal' && c.suit === M.trump && M.leadSuit !== M.trump) sc -= 4;
    } else {
      goals.push('BLEED_LOW_CARD');
      sc += 5 - 2.5 * fv;
    }

    const suitLen = M.own.filter((x) => x.suit === c.suit).length;
    if (lead && M.mode === 'normal' && c.suit !== M.trump && isBossOfSuit(M, c) &&
        (M.own.length >= 5 || suitLen >= 2)) {
      const oppVoidThisSuit = opps.some((p) => M.voids[p].includes(c.suit) && !M.voids[p].includes(M.trump));
      if (!oppVoidThisSuit) {
        sc += 2.0;
        goals.push('CASH_SIDE_ACE');
      } else {
        sc -= 2.5;
      }
    } else if (cls.iWin && cls.status !== 'secure' && v >= 12 && lead) {
      sc -= 1.2 * futMult;
      goals.push('PRESERVE_HIGH_CARD');
    }

    if (lead) {
      const dt = drawTrumpsBonus(M, pid, c);
      if (dt > 0) { sc += dt * 2.4 * ctrlMult; goals.push('DRAW_TRUMPS'); }
      const sb = shortnessBonus(M, pid, c);
      if (sb > 0) { sc += sb * 2; goals.push('CREATE_VOID'); }
      sc += pressureBonus(M, pid, c) * 1.5;
      const sig = signalScore(M, pid, c.suit);
      if (sig >= 2 && !(M.mode === 'normal' && c.suit === M.trump)) {
        sc += Math.min(3, sig);
        goals.push('PARTNER_SUPPORT');
      }
      if (M.mode === 'normal' && c.suit === M.trump && dt <= 0) {
        sc -= isBossOfSuit(M, c) ? 2.2 : 5.5;
      }
    }

    if (M.mode === 'normal' && M.trump && c.suit === M.trump && cls.iWin &&
        (!M.leadSuit || !M.own.some((x) => x.suit === M.leadSuit && x !== c))) {
      goals.push('FORCE_TRUMP');
      const cheaperWorks = M.own.some((x) => x.suit === M.trump && cardVal(x, 'normal') < v &&
        classifyPlay(M, pid, x).iWin);
      if (cheaperWorks) sc -= 1.5;
      if (cheaperWorks && !kotRisk && trumpControlPair(M) && (c.rank === 'A' || c.rank === 'K')) {
        sc -= 2.5;
        goals.push('TRUMP_CONTROL');
      }
      if (risk <= 0 && !cls.secureTeamWin) sc -= 2.5;
      sc += expensiveResponseBonus(M, pid, c, cls);
    }

    if (endg && cls.status === 'secure') sc += endg.tricksLeft <= 2 ? 3 : 1.5;

    if (cls.partnerWasWinning && cls.iWin) {
      let w = M.trick[0];
      for (const t of M.trick) if (cmpCards(t.card, w.card, M.leadSuit, M.mode, M.trump) > 0) w = t;
      const rest = stillToAct(M, pid);
      const partnerWeakIn3rd = rest.length === 1 && M.team(rest[0]) !== M.team(pid) &&
        cardVal(w.card, M.mode) < 11 && !isBossOfSuit(M, w.card);
      if (partnerWeakIn3rd) {
        sc += 2.5;
        goals.unshift('THIRD_SEAT_MAX_PRESSURE');
      } else {
        sc -= 6;
      }
    }

    const duck = duckUnderPartner(M, pid, c, cls, kotRisk);
    sc += duck.score;
    for (const t of duck.tags) if (!goals.includes(t)) goals.push(t);

    if (kotRisk && (cls.iWin || cls.secureTeamWin)) { sc += 2.5; goals.push('ANTI_KOT'); }
    if (kotRisk && cls.status === 'possible') sc += 1.2 * (1 - cls.winProb);

    if (M.trick.length === 2 && cls.iWin && !cls.partnerWasWinning) {
      const rest = stillToAct(M, pid);
      if (rest.length === 1 && M.team(rest[0]) !== M.team(pid)) {
        const bs = beatersFor(M, rest[0], c, cls.lead);
        if (bs.some((b) => cardVal(b.card, M.mode) >= 13 ||
            (M.mode === 'normal' && b.card.suit === M.trump && c.suit !== M.trump))) {
          sc += 0.7;
          goals.unshift('THIRD_SEAT_MAX_PRESSURE', 'FORCE_OPPONENT_PREMIUM_RESPONSE');
        } else {
          goals.unshift('THIRD_SEAT_MAX_PRESSURE');
        }
      } else {
        goals.unshift('THIRD_SEAT_MAX_PRESSURE');
      }
    }

    if (lead && M.trickNum === 1) {
      const ft = firstTrickLeadAdjust(M, pid, c, kotRisk);
      sc += ft.score;
      for (const t of ft.tags) if (!goals.includes(t)) goals.push(t);
    }

    return { card: c, score: sc, goals: [...new Set(goals)], cls, fv, v };
  });

  scored.sort((a, b) => b.score - a.score || a.fv - b.fv || a.v - b.v);
  return { scored, M, risk, endg };
}

export function decide(s, pid, rng) {
  void rng;
  const { scored } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const pick = scored[0];
  return {
    card: pick.card, pick, top: pick, second: scored[1] || null, ranked: scored,
    goals: pick.goals, reason: explain(pick),
  };
}

const SYM = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
export function explain(mv) {
  const c = mv.card, sym = SYM[c.suit], g = mv.goals[0] || 'BLEED_LOW_CARD';
  const t = Math.round((mv.cls.winProb || 0) * 100);
  switch (g) {
    case 'CASH_SIDE_ACE':
      return `نقد کردن آس جانبی (${sym}${c.rank}) پیش از خالی شدن دست حریفان.`;
    case 'WIN_TRICK':
      return mv.cls.status === 'secure'
        ? `${sym}${c.rank} برد قطعی است — هیچ کارت بالاتری در دست رقبا نیست.`
        : `${sym}${c.rank} با شانس بالا (≈${t}٪) دست را می‌گیرد.`;
    case 'PROTECT_PARTNER':
      return `دست در اختیار یار است؛ کم‌ارزش‌ترین کارت (${sym}${c.rank}) رد می‌شود.`;
    case 'FORCE_TRUMP':
      return `برش حساب‌شده با ${sym}${c.rank} برای تصاحب دست.`;
    case 'DRAW_TRUMPS':
      return `حکم‌کشی با ${sym}${c.rank} برای خلع سلاح حریفان و کنترل بازی.`;
    case 'CREATE_VOID':
      return `تک‌برگ‌زدایی از ${sym} برای ایجاد خال خالی و برش در دورهای بعد.`;
    case 'PRESERVE_HIGH_CARD':
      return `ذخیره کارت سر برای تریک‌های کلیدی‌تر.`;
    case 'PARTNER_SUPPORT':
      return `پاس به سیگنال یار در خال ${sym}.`;
    case 'BLEED_LOW_CARD':
      return `این دست قابل بردن نیست؛ رد دادن کم‌ارزش‌ترین کارت (${sym}${c.rank}).`;
    case 'FORCE_EXPENSIVE_RESPONSE':
      return `وادار کردن حریف به خرج کردن کارت سر یا حکم.`;
    case 'THIRD_SEAT_MAX_PRESSURE':
      return `قاعده دست سوم بالا (${sym}${c.rank}) — اعمال فشار حداکثری روی نفر چهارم.`;
    case 'FORCE_OPPONENT_PREMIUM_RESPONSE':
      return `مجبور کردن نفر چهارم به سوزاندن آس/شاه یا حکم.`;
    case 'ESTABLISH_SECONDARY_HONOR':
      return `بازی کارت پایین برای خارج کردن آس حریف و سر کردن شاه/بیبی.`;
    case 'PARTNER_CONTINUATION_SIGNAL':
      return `سیگنال ادامه به یار برای حفظ کنترل خال ${sym}.`;
    case 'TRUMP_CONTROL':
      return `حفظ جفت کنترلی آس و شاه حکم.`;
    case 'ANTI_KOT':
      return `تلاش فوری برای گرفتن دست و جلوگیری از کوت شدن.`;
    case 'FINESSE':
      return `تکنیک فینس با ${sym}${c.rank} در دست سوم برای غافلگیر کردن حریف.`;
    case 'SECOND_HAND_LOW':
      return `قاعده دست دوم پایین (${sym}${c.rank}) — حفظ کارت سر و واگذاری به یار.`;
    default:
      return `امتیاز تاکتیکی ${mv.score.toFixed(1)}`;
  }
}