// src/svg.js — Bespoke Persian & Royal Playing Card SVG generator (100% offline, zero external assets).
// Generates rich court illustrations (King/Shah, Queen/Bibi, Jack/Sarbaz), Ornate Aces,
// Pip layouts, Persian Girih card backs, and table medallions.

const SUIT_PATH = {
  spades: 'M12 2C7 8 4 11.5 4 14.5C4 17.2 6.1 19 8.5 19C10 19 11.2 18.2 11.7 17.3L10.3 22H13.7L12.3 17.3C12.8 18.2 14 19 15.5 19C17.9 19 20 17.2 20 14.5C20 11.5 17 8 12 2Z',
  hearts: 'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z',
  diamonds: 'M12 2L20 12L12 22L4 12L12 2Z',
  clubs: 'M12 3C9.8 3 8 4.8 8 7C8 8.5 8.8 9.8 10 10.5C7.2 10.8 5 13.1 5 16C5 18.2 6.8 20 9 20C10.5 20 11.8 19.2 12.5 18L11 22H13L11.5 18C12.2 19.2 13.5 20 15 20C17.2 20 19 18.2 19 16C19 13.1 16.8 10.8 14 10.5C15.2 9.8 16 8.5 16 7C16 4.8 14.2 3 12 3Z',
};

const SUIT_COLOR = {
  spades: '#172542',
  clubs: '#133a2e',
  hearts: '#b8253b',
  diamonds: '#c94a1a',
};

const SUIT_ACCENT = {
  spades: '#4a78c2',
  clubs: '#2ea87e',
  hearts: '#e85d75',
  diamonds: '#f08c3a',
};

export function renderCardCenterSvg(card, isTrump = false) {
  const suit = card.suit;
  const rank = card.rank;
  const mainColor = SUIT_COLOR[suit] || '#172542';
  const accentColor = SUIT_ACCENT[suit] || '#4a78c2';
  const gold = '#d4a238';
  const pipPath = SUIT_PATH[suit] || SUIT_PATH.spades;

  if (rank === 'A') {
    // Ornate Royal Persian Shamsa (8-pointed star medallion) around the Ace pip
    return `<svg class="card-art-svg" viewBox="0 0 80 100" aria-hidden="true">
      <g opacity="0.22" stroke="${gold}" stroke-width="1.2" fill="none">
        <rect x="6" y="8" width="68" height="84" rx="6"/>
        <circle cx="40" cy="50" r="28" stroke-dasharray="3 2"/>
        <polygon points="40,18 48,40 70,50 48,60 40,82 32,60 10,50 32,40" fill="${accentColor}" fill-opacity="0.12"/>
        <polygon points="20,28 40,36 60,28 52,50 60,72 40,64 20,72 28,50"/>
      </g>
      <circle cx="40" cy="50" r="19" fill="${accentColor}" fill-opacity="0.1" stroke="${gold}" stroke-width="1.4"/>
      <g transform="translate(22, 32) scale(1.5)">
        <path d="${pipPath}" fill="${mainColor}" stroke="${gold}" stroke-width="0.7"/>
      </g>
      ${isTrump ? `<circle cx="40" cy="15" r="3" fill="${gold}"/>` : ''}
    </svg>`;
  }

  if (rank === 'K') {
    // Shah (King): Kiani Crown, Royal Mantle, Shamshir & Suit Medallion
    return `<svg class="card-art-svg court-svg" viewBox="0 0 80 100" aria-hidden="true">
      <rect x="6" y="7" width="68" height="86" rx="6" fill="${accentColor}" fill-opacity="0.08" stroke="${gold}" stroke-width="1.3"/>
      <path d="M12 86 C14 66 26 58 40 58 C54 58 66 66 68 86 Z" fill="${mainColor}" opacity="0.9"/>
      <path d="M22 63 L40 82 L58 63" fill="none" stroke="${gold}" stroke-width="2"/>
      <circle cx="40" cy="43" r="12" fill="#f7e4c8" stroke="${gold}" stroke-width="1.4"/>
      <path d="M31 46 C31 53 49 53 49 46 L47 54 L33 54 Z" fill="${mainColor}" opacity="0.85"/>
      <!-- Royal Kiani Crown -->
      <path d="M24 33 L28 19 L35 27 L40 15 L45 27 L52 19 L56 33 Z" fill="${gold}" stroke="${mainColor}" stroke-width="1"/>
      <circle cx="40" cy="22" r="2.2" fill="${mainColor}"/>
      <circle cx="31" cy="26" r="1.6" fill="#e85d75"/>
      <circle cx="49" cy="26" r="1.6" fill="#2ea87e"/>
      <g transform="translate(32.8, 66) scale(0.6)">
        <path d="${pipPath}" fill="${gold}"/>
      </g>
    </svg>`;
  }

  if (rank === 'Q') {
    // Bibi (Queen): Persian Diadem, Lotus Motif & Royal Robe
    return `<svg class="card-art-svg court-svg" viewBox="0 0 80 100" aria-hidden="true">
      <rect x="6" y="7" width="68" height="86" rx="6" fill="${accentColor}" fill-opacity="0.08" stroke="${gold}" stroke-width="1.3"/>
      <path d="M15 86 C18 67 27 59 40 59 C53 59 62 67 65 86 Z" fill="${mainColor}" opacity="0.88"/>
      <path d="M26 62 Q40 76 54 62" fill="none" stroke="${gold}" stroke-width="1.8"/>
      <circle cx="40" cy="44" r="11.5" fill="#fae9d2" stroke="${gold}" stroke-width="1.3"/>
      <!-- Queen Tiara / Diadem -->
      <path d="M26 35 Q40 17 54 35 L50 37 L30 37 Z" fill="${gold}" stroke="${mainColor}" stroke-width="0.9"/>
      <polygon points="40,21 44,29 40,33 36,29" fill="${accentColor}"/>
      <g transform="translate(32.8, 66) scale(0.6)">
        <path d="${pipPath}" fill="${gold}"/>
      </g>
    </svg>`;
  }

  if (rank === 'J') {
    // Sarbaz (Jack): Persian Knight Helmet, Shield & Lance
    return `<svg class="card-art-svg court-svg" viewBox="0 0 80 100" aria-hidden="true">
      <rect x="6" y="7" width="68" height="86" rx="6" fill="${accentColor}" fill-opacity="0.08" stroke="${gold}" stroke-width="1.3"/>
      <path d="M16 86 C19 67 28 60 40 60 C52 60 61 67 64 86 Z" fill="${mainColor}" opacity="0.85"/>
      <polygon points="40,59 50,72 40,84 30,72" fill="${gold}" opacity="0.9"/>
      <circle cx="40" cy="44" r="11" fill="#f5e0c4" stroke="${gold}" stroke-width="1.3"/>
      <!-- Pointed Persian Knight Khud (Helmet) -->
      <path d="M27 36 C28 24 36 18 40 13 C44 18 52 24 53 36 Z" fill="${gold}" stroke="${mainColor}" stroke-width="1"/>
      <line x1="40" y1="13" x2="40" y2="36" stroke="${mainColor}" stroke-width="1.1"/>
      <g transform="translate(34, 65) scale(0.5)">
        <path d="${pipPath}" fill="${mainColor}"/>
      </g>
    </svg>`;
  }

  // Number cards (2..10): Crisp geometric frame + stylized suit pip constellation
  const n = parseInt(rank, 10) || 2;
  const coords = getPipCoordinates(n);
  const scale = n <= 3 ? 0.92 : n <= 6 ? 0.76 : 0.66;
  const pipsHtml = coords.map(([cx, cy, flip]) => {
    const tf = `translate(${cx}, ${cy}) ${flip ? 'rotate(180)' : ''} scale(${scale}) translate(-12, -12)`;
    return `<g transform="${tf}"><path d="${pipPath}" fill="${mainColor}"/></g>`;
  }).join('');

  return `<svg class="card-art-svg pip-svg" viewBox="0 0 80 100" aria-hidden="true">
    <rect x="7" y="8" width="66" height="84" rx="5" fill="none" stroke="${gold}" stroke-opacity="0.22" stroke-width="1"/>
    ${pipsHtml}
  </svg>`;
}

function getPipCoordinates(n) {
  switch (n) {
    case 2: return [[40, 26, false], [40, 74, true]];
    case 3: return [[40, 23, false], [40, 50, false], [40, 77, true]];
    case 4: return [[25, 26, false], [55, 26, false], [25, 74, true], [55, 74, true]];
    case 5: return [[25, 26, false], [55, 26, false], [40, 50, false], [25, 74, true], [55, 74, true]];
    case 6: return [[25, 24, false], [55, 24, false], [25, 50, false], [55, 50, false], [25, 76, true], [55, 76, true]];
    case 7: return [[25, 23, false], [55, 23, false], [40, 36, false], [25, 50, false], [55, 50, false], [25, 77, true], [55, 77, true]];
    case 8: return [[25, 22, false], [55, 22, false], [40, 35, false], [25, 49, false], [55, 49, false], [40, 65, true], [25, 78, true], [55, 78, true]];
    case 9: return [[24, 21, false], [56, 21, false], [24, 41, false], [56, 41, false], [40, 50, false], [24, 60, true], [56, 60, true], [24, 79, true], [56, 79, true]];
    case 10: return [[24, 20, false], [56, 20, false], [40, 31, false], [24, 42, false], [56, 42, false], [24, 58, true], [56, 58, true], [40, 69, true], [24, 80, true], [56, 80, true]];
    default: return [[40, 50, false]];
  }
}

export function renderCardBackMiniSvg() {
  return `<svg class="card-back-svg" viewBox="0 0 36 50" aria-hidden="true">
    <rect x="1.5" y="1.5" width="33" height="47" rx="5" fill="#102544" stroke="#f2c14e" stroke-width="1.5"/>
    <rect x="4.5" y="4.5" width="27" height="41" rx="3" fill="none" stroke="#f2c14e" stroke-opacity="0.45" stroke-width="0.9"/>
    <polygon points="18,10 26,25 18,40 10,25" fill="#f2c14e" fill-opacity="0.18" stroke="#f2c14e" stroke-width="1"/>
    <circle cx="18" cy="25" r="4.5" fill="#f2c14e" fill-opacity="0.4"/>
  </svg>`;
}
