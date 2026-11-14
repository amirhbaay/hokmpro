// src/svg.js — Crisp Vector Suit Icons & Subtle Royal SVG Card Effects (100% iOS/Android safe, no OS emoji substitution!).

const SUIT_PATH = {
  spades: 'M12 2C7 8 4 11.5 4 14.5C4 17.2 6.1 19 8.5 19C10 19 11.2 18.2 11.7 17.3L10.3 22H13.7L12.3 17.3C12.8 18.2 14 19 15.5 19C17.9 19 20 17.2 20 14.5C20 11.5 17 8 12 2Z',
  hearts: 'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z',
  diamonds: 'M12 1.5L20.5 12L12 22.5L3.5 12L12 1.5Z',
  clubs: 'M12 2.5C9.6 2.5 7.7 4.4 7.7 6.8C7.7 8.4 8.6 9.8 9.9 10.5C7 10.8 4.7 13.2 4.7 16.2C4.7 18.5 6.6 20.3 8.9 20.3C10.5 20.3 11.8 19.4 12.5 18.2L11 22H13L11.5 18.2C12.2 19.4 13.5 20.3 15.1 20.3C17.4 20.3 19.3 18.5 19.3 16.2C19.3 13.2 17 10.8 14.1 10.5C15.4 9.8 16.3 8.4 16.3 6.8C16.3 4.4 14.4 2.5 12 2.5Z',
};

// Render a pure inline SVG suit icon (prevents iOS Safari from substituting dark 3D Apple Emojis!)
export function renderSuitIconSvg(suit, className = 'suit-svg') {
  const d = SUIT_PATH[suit] || SUIT_PATH.spades;
  return `<svg class="${className} suit-icon-${suit}" viewBox="0 0 24 24" aria-hidden="true">
    <path d="${d}" fill="currentColor"/>
  </svg>`;
}

// Render clean, classic center card graphic with subtle royal SVG effects (crown on A/K/Q/J + golden filigree on trump/honors)
export function renderCardCenterSvg(card, isTrump = false) {
  const suit = card.suit;
  const rank = card.rank;
  const d = SUIT_PATH[suit] || SUIT_PATH.spades;
  const isHonor = rank === 'A' || rank === 'K' || rank === 'Q' || rank === 'J';
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const mainFill = isRed ? '#d41936' : '#111e38';
  const ringStroke = isTrump ? '#d49b27' : (isRed ? '#f06277' : '#4a6999');

  return `<svg class="card-center-svg" viewBox="0 0 64 64" aria-hidden="true">
    ${isHonor ? `
      <circle cx="32" cy="34" r="24" fill="${mainFill}" fill-opacity="0.06" stroke="${ringStroke}" stroke-opacity="0.45" stroke-width="1.2" stroke-dasharray="${rank === 'A' ? '3 2' : 'none'}"/>
      <path d="M21 15 L24.5 8.5 L29.5 13 L32 6.5 L34.5 13 L39.5 8.5 L43 15 Z" fill="#e5a92b" stroke="${mainFill}" stroke-width="0.6" stroke-opacity="0.5"/>
    ` : ''}
    ${isTrump && !isHonor ? `
      <polygon points="32,6 37,24 56,32 37,40 32,58 27,40 8,32 27,24" fill="#e5a92b" fill-opacity="0.10"/>
    ` : ''}
    <g transform="translate(11.6, ${isHonor ? '15.5' : '11.6'}) scale(${isHonor ? '1.7' : '1.7'})">
      <path d="${d}" fill="${mainFill}"/>
    </g>
  </svg>`;
}
