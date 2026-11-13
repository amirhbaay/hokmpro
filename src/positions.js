// src/positions.js — Position Policies (spec §4).
import { playable, cmpCards, cardVal, SYMBOLS } from './rules.js';
import {
  buildMemory, stillToAct, ckey,
  unseenHigherInSuit, unseenBetweenInSuit, isBossOfSuit,
} from './knowledge.js';
import { scoreMoves, explain } from './decision.js';

export const LEADER = 'LEADER';
export const SECOND = 'SECOND';
export const THIRD = 'THIRD';
export const FOURTH = 'FOURTH';

export function positionOf(s, pid) {
  const n = s.trick.filter((t) => t.player !== pid).length;
  return [LEADER, SECOND, THIRD, FOURTH][n] || LEADER;
}

function winnerOfTrick(M) {
  if (!M.trick.length) return null;
  let w = M.trick[0];
  for (const t of M.trick.slice(1)) {
    if (cmpCards(t.card, w.card, M.leadSuit, M.mode, M.trump) > 0) w = t;
  }
  return w;
}

const valOf = (M, c) => cardVal(c, M.mode);

function beats(M, c, winnerCard) {
  return cmpCards(c, winnerCard, M.leadSuit, M.mode, M.trump) > 0;
}

function cheapestBeater(M, cards, winnerCard) {
  return cards
    .filter((c) => beats(M, c, winnerCard))
    .sort((a, b) => valOf(M, a) - valOf(M, b))[0] || null;
}

const nm = (c) => `${SYMBOLS[c.suit]}${c.rank}`;

function isUnprotectedKingOrQueen(M, c) {
  if (M.mode !== 'normal' && M.mode !== 'sers') return false;
  if (c.rank !== 'K' && c.rank !== 'Q') return false;
  if (isBossOfSuit(M, c)) return false;
  const hasK = M.own.some((x) => x.suit === c.suit && x.rank === 'K');
  const hasQ = M.own.some((x) => x.suit === c.suit && x.rank === 'Q');
  if (hasK && hasQ) return false;
  return true;
}

function selectThirdHandAttack(M, candidates, currentWinnerCard) {
  const sortedDesc = candidates.slice().sort((a, b) => valOf(M, b) - valOf(M, a));
  const top = sortedDesc[0];
  if (!top) return null;

  if (sortedDesc.length >= 2 && isBossOfSuit(M, top)) {
    const second = sortedDesc[1];
    const gap = unseenBetweenInSuit(M, top.suit, second, top);
    if (gap.length === 1 && valOf(M, second) >= 11 &&
        (!currentWinnerCard || beats(M, second, currentWinnerCard))) {
      return { card: second, isFinesse: true };
    }
  }

  let chosen = top;
  for (let i = 1; i < sortedDesc.length; i++) {
    const cand = sortedDesc[i];
    if (unseenBetweenInSuit(M, top.suit, cand, chosen).length === 0 &&
        (!currentWinnerCard || beats(M, cand, currentWinnerCard))) {
      chosen = cand;
    } else {
      break;
    }
  }
  return { card: chosen, isFinesse: false };
}

export function leaderPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const opponents = M.opponentsOf(pid);

  const bothOppVoidTrump = M.mode === 'normal' && M.trump &&
    opponents.every((p) => M.voids[p].includes(M.trump));
  const pressure = [];
  for (const c of M.own) {
    if (M.mode === 'normal' && c.suit === M.trump) continue;
    if (pressure.some((x) => x.suit === c.suit)) continue;
    const bothVoidSuit = opponents.length === 2 && opponents.every((p) => M.voids[p].includes(c.suit));
    const safeSingleVoid = bothOppVoidTrump && opponents.some((p) => M.voids[p].includes(c.suit));
    if (bothVoidSuit || safeSingleVoid) pressure.push(c);
  }
  if (pressure.length) {
    const inPressure = scored.filter((m) => pressure.some((p) => p.suit === m.card.suit));
    if (inPressure.length) {
      const pick = inPressure[0];
      return ok(pick, `لید فشاری ${nm(pick.card)} — حریفان در این خال خالی هستند`, 'PRESSURE_LEAD');
    }
  }

  for (const m of scored) {
    const sig = M.signals.filter((g) => g.player === M.partnerOf(pid) && g.suit === m.card.suit)
      .reduce((a, g) => a + g.weight, 0);
    if (sig >= 2 && !(M.mode === 'normal' && m.card.suit === M.trump) &&
        !isUnprotectedKingOrQueen(M, m.card)) {
      return ok(m, `پاس به سیگنال قوی یار در خال ${SYMBOLS[m.card.suit]} (${nm(m.card)})`, 'PARTNER_SIGNAL_LEAD');
    }
  }

  const safeCandidates = scored.filter((m) => {
    const isTrump = M.mode === 'normal' && M.trump && m.card.suit === M.trump;
    if (isTrump && !m.goals.includes('DRAW_TRUMPS') && !isBossOfSuit(M, m.card)) return false;
    if (isUnprotectedKingOrQueen(M, m.card)) return false;
    return true;
  });

  if (safeCandidates.length > 0) {
    const pick = safeCandidates[0];
    return ok(pick, explain(pick), rankedGoals(pick));
  }

  const nonTrump = (M.mode === 'normal' && M.trump)
    ? scored.find((m) => m.card.suit !== M.trump)
    : null;
  const pick = nonTrump || scored[0];
  return ok(pick, explain(pick), rankedGoals(pick));
}

export function secondPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const legal = playable(s, pid);
  const hasSuit = M.leadSuit && legal.some((c) => c.suit === M.leadSuit);
  const w = winnerOfTrick(M);

  if (hasSuit) {
    const inSuit = legal.filter((c) => c.suit === M.leadSuit);
    const sortedAsc = inSuit.slice().sort((a, b) => valOf(M, a) - valOf(M, b));
    const lowest = sortedAsc[0];

    if (w && M.team(w.player) === M.team(pid) && inSuit.length > 1) {
      const under = sortedAsc.find((c) => !beats(M, c, w.card));
      if (under) {
        return ok(scoredFor(scored, under),
          `یار برنده است؛ ${nm(under)} زیر دست یار بازی می‌شود`, 'DUCK_UNDER_PARTNER');
      }
    }

    if (w && M.team(w.player) !== M.team(pid)) {
      const cheap = cheapestBeater(M, inSuit, w.card);
      if (cheap && inSuit.length > 1) {
        const nextHigher = sortedAsc.find((c) => valOf(M, c) > valOf(M, cheap));
        const hasTouchingHonor = nextHigher &&
          unseenBetweenInSuit(M, M.leadSuit, cheap, nextHigher).length === 0;
        const bossCard = isBossOfSuit(M, cheap);
        const cheapSpotOrJack = valOf(M, cheap) <= 10;

        if (cheap === lowest || bossCard || cheapSpotOrJack || hasTouchingHonor) {
          return ok(scoredFor(scored, cheap),
            `${nm(cheap)} ارزان‌ترین کارت کافی برای گرفتن دست در موقعیت دوم است`, 'CHEAPEST_SUFFICIENT_WIN');
        }
        return ok(scoredFor(scored, lowest),
          `قاعده دست دوم پایین: حفظ ${nm(cheap)} در برابر کارت سرِ احتمالی نفر سوم و بازی ${nm(lowest)}`, 'SECOND_HAND_LOW');
      }
      return ok(scoredFor(scored, lowest),
        `امکان برد نیست؛ ${nm(lowest)} کم‌ارزش‌ترین کارت خال لید رد می‌شود`, 'SHED_LOWEST_OF_SUIT');
    }

    const pick = scored[0];
    return ok(pick, explain(pick), rankedGoals(pick));
  }

  const trump = M.mode === 'normal' ? M.trump : null;
  const trumps = trump ? legal.filter((c) => c.suit === trump) : [];
  const oppWinning = w && M.team(w.player) !== M.team(pid);
  const teamWinning = w && M.team(w.player) === M.team(pid);

  if (trumps.length) {
    if (teamWinning) {
      const shed = legal.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
      return ok(scoredFor(scored, shed),
        `یار برنده است؛ از برش بی‌مورد پرهیز شده و ${nm(shed)} رد می‌شود`, 'SHED_KEEP_TRUMP');
    }
    const target = oppWinning ? w.card : null;
    const ruff = target
      ? trumps.slice().sort((a, b) => valOf(M, a) - valOf(M, b)).find((c) => beats(M, c, target)) || null
      : trumps.slice().sort((a, b) => valOf(M, a) - valOf(M, b))[0];

    if (ruff) {
      const partner = M.partnerOf(pid);
      const partnerHasLead = !M.voids[partner] || !M.voids[partner].includes(M.leadSuit);
      const nonTrumps = legal.filter((c) => c.suit !== trump);
      const leaderWeak = w && valOf(M, w.card) <= 6;
      if (leaderWeak && partnerHasLead && trumps.length === 1 && valOf(M, ruff) >= 12 &&
          nonTrumps.length > 0 && M.trickNum <= 6 && M.tricksWon[M.team(w.player)] < 5) {
        const shed = nonTrumps.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
        return ok(scoredFor(scored, shed),
          `لیدر کارت ضعیف بازی کرده؛ حفظ تک‌حکم سنگین و واگذاری دست به یار (رد ${nm(shed)})`, 'SHED_KEEP_TRUMP');
      }
      return ok(scoredFor(scored, ruff),
        `برش بهینه با ${nm(ruff)} — کمترین حکم کافی برای تصاحب دست`, 'RUFF_CHEAPEST');
    }
  }

  const shed = legal.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
  return ok(scoredFor(scored, shed),
    `خال بازی را نداریم؛ ${nm(shed)} به عنوان برگ هرز رد می‌شود`, 'SHED_LOWEST_FUTURE');
}

export function thirdPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const legal = playable(s, pid);
  const w = winnerOfTrick(M);
  const last = stillToAct(M, pid)[0] || null;
  const lastIsOpp = last && M.team(last) !== M.team(pid);
  const hasSuit = M.leadSuit && legal.some((c) => c.suit === M.leadSuit);

  if (w && M.team(w.player) === M.team(pid)) {
    const pool = hasSuit ? legal.filter((c) => c.suit === M.leadSuit) : legal;
    const beatersInSuit = hasSuit ? pool.filter((c) => beats(M, c, w.card)) : [];

    const partnerRuffed = M.mode === 'normal' && M.trump && w.card.suit === M.trump && M.leadSuit !== M.trump;
    const partnerIsBoss = isBossOfSuit(M, w.card);
    const partnerHighHonor = valOf(M, w.card) >= 11;
    const fourthCannotBeatInSuit = lastIsOpp && M.voids[last] && M.voids[last].includes(M.leadSuit) &&
      (M.mode !== 'normal' || !M.trump || M.voids[last].includes(M.trump));
    const topBeater = beatersInSuit.slice().sort((a, b) => valOf(M, b) - valOf(M, a))[0] || null;
    const noUnseenGap = topBeater && unseenBetweenInSuit(M, M.leadSuit, w.card, topBeater).length === 0;

    const partnerCardIsSafe = !lastIsOpp || partnerRuffed || partnerIsBoss ||
      partnerHighHonor || fourthCannotBeatInSuit || !topBeater || noUnseenGap;

    if (!partnerCardIsSafe && hasSuit && beatersInSuit.length > 0) {
      const attack = selectThirdHandAttack(M, beatersInSuit, w.card);
      if (attack) {
        const tag = attack.isFinesse ? 'FINESSE' : 'THIRD_MAX_PRESSURE';
        const reasonText = attack.isFinesse
          ? `فینس در دست سوم با ${nm(attack.card)} برای حفاظت از لید ضعیف یار (${nm(w.card)})`
          : `قاعده دست سوم بالا: لید یار (${nm(w.card)}) در برابر نفر چهارم آسیب‌پذیر است؛ بازی ${nm(attack.card)}`;
        return ok(scoredFor(scored, attack.card), reasonText, tag);
      }
    }

    const duck = pool.filter((c) => !beats(M, c, w.card)).sort((a, b) => valOf(M, a) - valOf(M, b))[0];
    if (duck) {
      const stillHigher = pool.some((c) => beats(M, c, w.card) && c !== duck);
      if (lastIsOpp && stillHigher) {
        return ok(scoredFor(scored, duck),
          `${nm(duck)} زیر کارت قوی یار (${nm(w.card)}) — نفر چهارم مجبور به خرج کارت سنگین است`, 'THIRD_MAX_PRESSURE');
      }
      return ok(scoredFor(scored, duck),
        `${nm(duck)} زیر دست برنده یار (${nm(w.card)}) بازی می‌شود`, 'DUCK_UNDER_PARTNER');
    }
    const shed = pool.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
    return ok(scoredFor(scored, shed),
      `دست در اختیار یار است؛ ${nm(shed)} رد می‌شود`, 'SHED_KEEP_TRUMP');
  }

  if (w && M.team(w.player) !== M.team(pid)) {
    const pool = hasSuit ? legal.filter((c) => c.suit === M.leadSuit) : legal;
    const trump = M.mode === 'normal' ? M.trump : null;

    if (hasSuit) {
      const beaters = pool.filter((c) => beats(M, c, w.card));
      if (beaters.length > 0) {
        const cheap = cheapestBeater(M, pool, w.card);
        if (!lastIsOpp || M.mode !== 'normal' || valOf(M, cheap) >= 10 ||
            beaters.length === 1 || isBossOfSuit(M, cheap)) {
          const tag = lastIsOpp ? 'THIRD_MAX_PRESSURE' : 'CHEAPEST_SUFFICIENT_WIN';
          return ok(scoredFor(scored, cheap),
            `${nm(cheap)} برنده فعلی را با کمترین هزینه می‌زند`, tag);
        }
        const attack = selectThirdHandAttack(M, beaters, w.card);
        if (attack) {
          return ok(scoredFor(scored, attack.card),
            `قاعده دست سوم بالا: ${nm(attack.card)} برای جلوگیری از برد ارزان نفر چهارم`, 'THIRD_MAX_PRESSURE');
        }
      }
    } else if (trump && pool.some((c) => c.suit === trump)) {
      const cheapRuff = pool
        .filter((c) => c.suit === trump)
        .sort((a, b) => valOf(M, a) - valOf(M, b))
        .find((c) => beats(M, c, w.card)) || null;
      if (cheapRuff) {
        const tag = lastIsOpp ? 'THIRD_MAX_PRESSURE' : 'CHEAPEST_SUFFICIENT_WIN';
        return ok(scoredFor(scored, cheapRuff),
          `برش در دست سوم با ${nm(cheapRuff)} برای گرفتن دست از حریف`, tag);
      }
    }
  }

  const shed = legal.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
  return ok(scoredFor(scored, shed),
    `امکان برد این دست نیست؛ ${nm(shed)} دفاعی رد می‌شود`, 'DISCARD_DEFENSE');
}

export function fourthPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const legal = playable(s, pid);
  const w = winnerOfTrick(M);
  const hasSuit = M.leadSuit && legal.some((c) => c.suit === M.leadSuit);
  const pool = hasSuit ? legal.filter((c) => c.suit === M.leadSuit) : legal;
  const team = M.team(pid);

  const canBeat = w ? pool.filter((c) => beats(M, c, w.card)) : pool;

  if (w && team === M.team(w.player)) {
    const ducks = pool.filter((c) => !beats(M, c, w.card));
    const pick = (ducks.length ? ducks : pool).slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
    return ok(scoredFor(scored, pick),
      `یار برنده این دست است؛ ${nm(pick)} بدون قاپیدن دست یار رد می‌شود`, 'DO_NOT_OVERTAKE_PARTNER');
  }

  if (w && canBeat.length) {
    const cheap = canBeat.slice().sort((a, b) => valOf(M, a) - valOf(M, b))[0];
    return ok(scoredFor(scored, cheap),
      `قاعده دست چهارم ارزان ببر: تصاحب قطعی دست با ${nm(cheap)}`, 'FOURTH_TAKE_CHEAPEST');
  }

  const shed = pool.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
  return ok(scoredFor(scored, shed),
    `امکان زدن کارت برنده نیست؛ ${nm(shed)} کم‌ارزش‌ترین کارت رد می‌شود`, 'FOURTH_DISCARD_LOW');
}

export function decideByPosition(s, pid) {
  const pos = positionOf(s, pid);
  const fn = { LEADER: leaderPolicy, SECOND: secondPolicy, THIRD: thirdPolicy, FOURTH: fourthPolicy }[pos];
  const out = fn(s, pid);
  if (!out) return null;
  return { ...out, position: pos };
}

function shedCost(M, c) {
  let v = valOf(M, c);
  if (M.mode === 'normal' && c.suit === M.trump) v += 20;
  const suitLen = M.own ? M.own.filter((x) => x.suit === c.suit).length : 0;
  return v + suitLen * 0.01;
}

function scoredFor(scored, card) {
  return scored.find((m) => ckey(m.card) === ckey(card)) || { card, score: 0, goals: [] };
}

function ok(scoredEntry, reason, goal) {
  const goals = scoredEntry.goals || [];
  return {
    card: scoredEntry.card,
    pick: scoredEntry,
    reason,
    goals: goal && !goals.includes(goal) ? [goal, ...goals] : goals,
  };
}
const rankedGoals = (m) => m.goals && m.goals.length ? m.goals[0] : null;
