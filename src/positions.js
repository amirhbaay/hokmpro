// src/positions.js — Position Policies (spec §4).
//
// Authentic 4-position Hokm tactical policies:
//   LEADER  (0 played) — Cashing side Aces, drawing trumps only with control, short-suit
//                        leads to create voids, partner signals, and pressure leads.
//   SECOND  (1 played) — Golden Rule "Second Hand Low" (دست دوم پایین), splitting touching
//                        honors, covering with Boss, and smart Ruff vs Discard matrix.
//   THIRD   (2 played) — Golden Rule "Third Hand High" (دست سوم بالا), Finesse (A-Q / K-J),
//                        overtaking vulnerable partner leads (never leaving a 6 or 7 to die
//                        against 4th hand!), and ducking only under a truly strong partner card.
//   FOURTH  (3 played) — Golden Rule "Fourth Hand Cheap" (دست چهارم ارزان ببر), never
//                        overtaking a winning partner, and discarding to create voids.
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

// Select the optimal attacking card in Third Hand (Cheapest of Top Equals or Finesse).
function selectThirdHandAttack(M, candidates, currentWinnerCard) {
  const sortedDesc = candidates.slice().sort((a, b) => valOf(M, b) - valOf(M, a));
  const top = sortedDesc[0];
  if (!top) return null;

  // Finesse check (تکنیک فینس): if we hold Boss (e.g. A) and a second honor (e.g. Q, val>=11)
  // with exactly 1 unseen card between them (K), finesse with the lower honor if it beats currentWinnerCard!
  if (sortedDesc.length >= 2 && isBossOfSuit(M, top)) {
    const second = sortedDesc[1];
    const gap = unseenBetweenInSuit(M, top.suit, second, top);
    if (gap.length === 1 && valOf(M, second) >= 11 &&
        (!currentWinnerCard || beats(M, second, currentWinnerCard))) {
      return { card: second, isFinesse: true };
    }
  }

  // Cheapest of touching equals at the top of our hand (e.g. hold K-Q-J → play J; hold A-K → play K)
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

// ===========================================================================
// LEADER — first to act. Owns the lead-suit decision.
// ===========================================================================
export function leaderPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const opponents = M.opponentsOf(pid);

  // 1. Pressure suit: BOTH opponents are proven void in a non-trump suit, OR an opponent is
  // void in that suit AND opponents have no trumps left to ruff with.
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

  // 2. Partner signal: partner previously signalled strength in a non-trump suit.
  for (const m of scored) {
    const sig = M.signals.filter((g) => g.player === M.partnerOf(pid) && g.suit === m.card.suit)
      .reduce((a, g) => a + g.weight, 0);
    if (sig >= 2 && !(M.mode === 'normal' && m.card.suit === M.trump)) {
      return ok(m, `پاس به سیگنال قوی یار در خال ${SYMBOLS[m.card.suit]} (${nm(m.card)})`, 'PARTNER_SIGNAL_LEAD');
    }
  }

  // 3. Filter out gratuitous trump leads when non-trump suits exist in hand!
  // Never lead a small/medium trump on trick 1 (or early tricks) unless we are intentionally
  // drawing trumps with a Boss trump (DRAW_TRUMPS) or only hold trumps.
  const hasNonTrump = M.mode === 'normal' && M.trump && M.own.some((c) => c.suit !== M.trump);
  if (hasNonTrump) {
    const topScored = scored[0];
    if (topScored.card.suit === M.trump && !topScored.goals.includes('DRAW_TRUMPS') &&
        !isBossOfSuit(M, topScored.card)) {
      const bestNonTrump = scored.find((m) => m.card.suit !== M.trump);
      if (bestNonTrump) {
        return ok(bestNonTrump, explain(bestNonTrump), rankedGoals(bestNonTrump));
      }
    }
  }

  const pick = scored[0];
  return ok(pick, explain(pick), rankedGoals(pick));
}

// ===========================================================================
// SECOND — one card on the table (دست دوم).
// ===========================================================================
export function secondPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const legal = playable(s, pid);
  const hasSuit = M.leadSuit && legal.some((c) => c.suit === M.leadSuit);
  const w = winnerOfTrick(M);

  // --- Case 1: must follow the led suit ---
  if (hasSuit) {
    const inSuit = legal.filter((c) => c.suit === M.leadSuit);
    const sortedAsc = inSuit.slice().sort((a, b) => valOf(M, a) - valOf(M, b));
    const lowest = sortedAsc[0];

    // If partner is winning (e.g. synthetic 2-card test state), duck under partner.
    if (w && M.team(w.player) === M.team(pid) && inSuit.length > 1) {
      const under = sortedAsc.find((c) => !beats(M, c, w.card));
      if (under) {
        return ok(scoredFor(scored, under),
          `یار برنده است؛ ${nm(under)} زیر دست یار بازی می‌شود`, 'DUCK_UNDER_PARTNER');
      }
    }

    // Opponent led `w.card`: apply "Second Hand Low" vs "Cheapest Sufficient Win"
    if (w && M.team(w.player) !== M.team(pid)) {
      const cheap = cheapestBeater(M, inSuit, w.card);
      if (cheap && inSuit.length > 1) {
        // When should Second Hand climb up with `cheap`?
        // 1. All our cards in this suit beat w.card anyway (cheap === lowest)
        // 2. `cheap` is the Boss of the suit (e.g. Ace, or King when Ace is gone)
        // 3. `cheap` is a spot card / J (val <= 10), so we win/push cheaply without risking a bare K/Q
        // 4. We hold touching honors (e.g. K-Q) where splitting equals is mandatory
        const nextHigher = sortedAsc.find((c) => valOf(M, c) > valOf(M, cheap));
        const hasTouchingHonor = nextHigher &&
          unseenBetweenInSuit(M, M.leadSuit, cheap, nextHigher).length === 0;
        const bossCard = isBossOfSuit(M, cheap);
        const cheapSpotOrJack = valOf(M, cheap) <= 10;

        if (cheap === lowest || bossCard || cheapSpotOrJack || hasTouchingHonor) {
          return ok(scoredFor(scored, cheap),
            `${nm(cheap)} ارزان‌ترین کارت کافی برای گرفتن دست در موقعیت دوم است`, 'CHEAPEST_SUFFICIENT_WIN');
        }
        // Otherwise: Leader led a low/mid card and our only beater is a vulnerable bare K or Q
        // while the Ace is still out! Golden Rule: Second Hand Low (دست دوم پایین).
        return ok(scoredFor(scored, lowest),
          `قاعده دست دوم پایین: حفظ ${nm(cheap)} در برابر کارت سرِ احتمالی نفر سوم و بازی ${nm(lowest)}`, 'SECOND_HAND_LOW');
      }
      return ok(scoredFor(scored, lowest),
        `امکان برد نیست؛ ${nm(lowest)} کم‌ارزش‌ترین کارت خال لید رد می‌شود`, 'SHED_LOWEST_OF_SUIT');
    }

    const pick = scored[0];
    return ok(pick, explain(pick), rankedGoals(pick));
  }

  // --- Case 2: void in the led suit — Ruff vs Discard Matrix ---
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
      // Matrix check: if opponent led a very weak card (2..7) early in the game, partner (4th hand)
      // is NOT void in the led suit, and our ONLY trump is the Ace/King while we have worthless
      // off-suit cards to discard, leave the trick to partner in 4th hand!
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

// ===========================================================================
// THIRD — two cards on the table (دست سوم / یار لیدر).
// ===========================================================================
export function thirdPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const legal = playable(s, pid);
  const w = winnerOfTrick(M);
  const last = stillToAct(M, pid)[0] || null; // FOURTH seat
  const lastIsOpp = last && M.team(last) !== M.team(pid);
  const hasSuit = M.leadSuit && legal.some((c) => c.suit === M.leadSuit);

  // --- Case 1: Partner is currently winning the 2-card trick on the table ---
  if (w && M.team(w.player) === M.team(pid)) {
    const pool = hasSuit ? legal.filter((c) => c.suit === M.leadSuit) : legal;
    const beatersInSuit = hasSuit ? pool.filter((c) => beats(M, c, w.card)) : [];

    // CRITICAL FIX: Is Partner's winning card ACTUALLY safe against the 4th seat (opponent)?
    // If Partner led a weak/medium spot card (like ♠6!) and 2nd hand played ♠2, Partner's ♠6
    // is NOT safe at all — 4th hand will easily beat ♠6 with ♠7!
    // Partner's card is only safe to duck under if:
    //  1. Partner's card is already the Boss of the suit (no unseen higher card exists), OR
    //  2. Partner's card is a high honor (Q, K, A -> val >= 11), OR
    //  3. Partner ruffed with trump, OR
    //  4. 4th seat is proven void in leadSuit AND proven void in trump, OR
    //  5. Every higher card we hold is touching Partner's card with 0 unseen cards between them.
    const partnerRuffed = M.mode === 'normal' && M.trump && w.card.suit === M.trump && M.leadSuit !== M.trump;
    const partnerIsBoss = isBossOfSuit(M, w.card);
    const partnerHighHonor = valOf(M, w.card) >= 11; // Q, K, A (or top-3 in ners/asners)
    const fourthCannotBeatInSuit = lastIsOpp && M.voids[last] && M.voids[last].includes(M.leadSuit) &&
      (M.mode !== 'normal' || !M.trump || M.voids[last].includes(M.trump));
    const topBeater = beatersInSuit.slice().sort((a, b) => valOf(M, b) - valOf(M, a))[0] || null;
    const noUnseenGap = topBeater && unseenBetweenInSuit(M, M.leadSuit, w.card, topBeater).length === 0;

    const partnerCardIsSafe = !lastIsOpp || partnerRuffed || partnerIsBoss ||
      partnerHighHonor || fourthCannotBeatInSuit || !topBeater || noUnseenGap;

    if (!partnerCardIsSafe && hasSuit && beatersInSuit.length > 0) {
      // Partner led a vulnerable card (e.g. 6♠) and we hold stronger cards that cover unseen threats!
      // Apply Golden Rule: "Third Hand High" (دست سوم بالا) or Finesse!
      const attack = selectThirdHandAttack(M, beatersInSuit, w.card);
      if (attack) {
        const tag = attack.isFinesse ? 'FINESSE' : 'THIRD_MAX_PRESSURE';
        const reasonText = attack.isFinesse
          ? `فینس در دست سوم با ${nm(attack.card)} برای حفاظت از لید ضعیف یار (${nm(w.card)})`
          : `قاعده دست سوم بالا: لید یار (${nm(w.card)}) در برابر نفر چهارم آسیب‌پذیر است؛ بازی ${nm(attack.card)}`;
        return ok(scoredFor(scored, attack.card), reasonText, tag);
      }
    }

    // Partner's card IS genuinely strong/safe (e.g. A, K, Q, or Boss): duck under Partner!
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

  // --- Case 2: An opponent is currently winning ---
  if (w && M.team(w.player) !== M.team(pid)) {
    const pool = hasSuit ? legal.filter((c) => c.suit === M.leadSuit) : legal;
    const trump = M.mode === 'normal' ? M.trump : null;

    if (hasSuit) {
      const beaters = pool.filter((c) => beats(M, c, w.card));
      if (beaters.length > 0) {
        const cheap = cheapestBeater(M, pool, w.card);
        // If cheap beater is already an honor (J, Q, K, A -> val >= 10), or in special modes,
        // or is Boss, or is our only beater, play `cheap`!
        // Otherwise, if cheap is a small spot card (e.g. 7 or 8) and 4th seat is an opponent
        // and we hold a much higher card with unseen cards in between, play Third Hand High!
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
      // Void in led suit: ruff with cheapest sufficient trump
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

  // Nothing can win: discard lowest future value, keeping trump.
  const shed = legal.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
  return ok(scoredFor(scored, shed),
    `امکان برد این دست نیست؛ ${nm(shed)} دفاعی رد می‌شود`, 'DISCARD_DEFENSE');
}

// ===========================================================================
// FOURTH — last to act, three cards on the table (دست چهارم / کامل‌کننده تریک).
// ===========================================================================
export function fourthPolicy(s, pid) {
  const { scored, M } = scoreMoves(s, pid);
  if (!scored.length) return null;
  const legal = playable(s, pid);
  const w = winnerOfTrick(M);
  const hasSuit = M.leadSuit && legal.some((c) => c.suit === M.leadSuit);
  const pool = hasSuit ? legal.filter((c) => c.suit === M.leadSuit) : legal;
  const team = M.team(pid);

  const canBeat = w ? pool.filter((c) => beats(M, c, w.card)) : pool;

  // Partner is already winning: NEVER overtake partner!
  if (w && team === M.team(w.player)) {
    const ducks = pool.filter((c) => !beats(M, c, w.card));
    const pick = (ducks.length ? ducks : pool).slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
    return ok(scoredFor(scored, pick),
      `یار برنده این دست است؛ ${nm(pick)} بدون قاپیدن دست یار رد می‌شود`, 'DO_NOT_OVERTAKE_PARTNER');
  }

  // Opponent is winning and we CAN beat them in 4th seat: ALWAYS win with the cheapest beater!
  if (w && canBeat.length) {
    const cheap = canBeat.slice().sort((a, b) => valOf(M, a) - valOf(M, b))[0];
    return ok(scoredFor(scored, cheap),
      `قاعده دست چهارم ارزان ببر: تصاحب قطعی دست با ${nm(cheap)}`, 'FOURTH_TAKE_CHEAPEST');
  }

  // Cannot beat the current winner: discard lowest future value
  const shed = pool.slice().sort((a, b) => shedCost(M, a) - shedCost(M, b))[0];
  return ok(scoredFor(scored, shed),
    `امکان زدن کارت برنده نیست؛ ${nm(shed)} کم‌ارزش‌ترین کارت رد می‌شود`, 'FOURTH_DISCARD_LOW');
}

// ===========================================================================
// Dispatcher
// ===========================================================================
export function decideByPosition(s, pid) {
  const pos = positionOf(s, pid);
  const fn = { LEADER: leaderPolicy, SECOND: secondPolicy, THIRD: thirdPolicy, FOURTH: fourthPolicy }[pos];
  const out = fn(s, pid);
  if (!out) return null;
  return { ...out, position: pos };
}

// ---------- internals ----------

// Shed cost: lowest rank first, never trump when non-trump exists, and on equal rank
// prefer discarding from a shorter suit to create a void for future ruffs!
function shedCost(M, c) {
  let v = valOf(M, c);
  if (M.mode === 'normal' && c.suit === M.trump) v += 20;
  // Tie-break equal ranks by suit length (0.01 per card in suit) so singletons are shed first
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
