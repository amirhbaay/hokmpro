// src/svg.js — High-Visibility Bespoke Persian & Royal Playing Card SVG generator.
// Designed specifically for large, eye-friendly mobile readability.

const SUIT_PATH = {
  spades: 'M12 2C7 8 4 11.5 4 14.5C4 17.2 6.1 19 8.5 19C10 19 11.2 18.2 11.7 17.3L10.3 22H13.7L12.3 17.3C12.8 18.2 14 19 15.5 19C17.9 19 20 17.2 20 14.5C20 11.5 17 8 12 2Z',
  hearts: 'M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z',
  diamonds: 'M12 1.5L20.5 12L12 22.5L3.5 12L12 1.5Z',
  clubs: 'M12 3C9.8 3 8 4.8 8 7C8 8.5 8.8 9.8 10 10.5C7.2 10.8 5 13.1 5 16C5 18.2 6.8 20 9 20C10.5 20 11.8 19.2 12.5 18L11 22H13L11.5 18C12.2 19.2 13.5 20 15 20C17.2 20 19 18.2 19 16C19 13.1 16.8 10.8 14 10.5C15.2 9.8 16 8.5 16 7C16 4.8 14.2 3 12 3Z',
};

const SUIT_COLOR = {
  spades: '#121e36',
  clubs: '#0d382a',
  hearts: '#c41e3a',
  diamonds: '#d44212',
};

const SUIT_ACCENT = {
  spades: '#3b6bc4',
  clubs: '#1f9d73',
  hearts: '#ee4b6a',
  diamonds: '#f58220',
};

export function renderCardCenterSvg(card, isTrump = false) {
  const suit = card.suit;
  const rank = card.rank;
  const mainColor = SUIT_COLOR[suit] || '#121e36';
  const accentColor = SUIT_ACCENT[suit] || '#3b6bc4';
  const gold = '#d49b27';
  const pipPath = SUIT_PATH[suit] || SUIT_PATH.spades;

  if (rank === 'A') {
    return `<svg class="card-art-svg" viewBox="0 0 80 100" aria-hidden="true">
      <g opacity="0.28" stroke="${gold}" stroke-width="1.4" fill="none">
        <circle cx="40" cy="50" r="31" stroke-dasharray="3 2"/>
        <polygon points="40,14 49,39 74,50 49,61 40,86 31,61 6,50 31,39" fill="${accentColor}" fill-opacity="0.16"/>
      </g>
      <circle cx="40" cy="50" r="22" fill="${accentColor}" fill-opacity="0.14" stroke="${gold}" stroke-width="1.6"/>
      <g transform="translate(17.5, 27.5) scale(1.88)">
        <path d="${pipPath}" fill="${mainColor}" stroke="${gold}" stroke-width="0.6"/>
      </g>
      ${isTrump ? `<circle cx="40" cy="12" r="3.5" fill="${gold}"/>` : ''}
    </svg>`;
  }

  if (rank === 'K') {
    return `<svg class="card-art-svg court-svg" viewBox="0 0 80 100" aria-hidden="true">
      <rect x="5" y="6" width="70" height="88" rx="7" fill="${accentColor}" fill-opacity="0.10" stroke="${gold}" stroke-width="1.5"/>
      <path d="M10 88 C13 64 25 56 40 56 C55 56 67 64 70 88 Z" fill="${mainColor}"/>
      <path d="M20 61 L40 83 L60 61" fill="none" stroke="${gold}" stroke-width="2.4"/>
      <circle cx="40" cy="41" r="13.5" fill="#f9e6cb" stroke="${gold}" stroke-width="1.6"/>
      <path d="M29 44 C29 53 51 53 51 44 L48 54 L32 54 Z" fill="${mainColor}"/>
      <path d="M21 31 L26 15 L34 25 L40 12 L46 25 L54 15 L59 31 Z" fill="${gold}" stroke="${mainColor}" stroke-width="1.1"/>
      <circle cx="40" cy="20" r="2.5" fill="${mainColor}"/>
      <g transform="translate(30.5, 64) scale(0.8)">
        <path d="${pipPath}" fill="${gold}"/>
      </g>
    </svg>`;
  }

  if (rank === 'Q') {
    return `<svg class="card-art-svg court-svg" viewBox="0 0 80 100" aria-hidden="true">
      <rect x="5" y="6" width="70" height="88" rx="7" fill="${accentColor}" fill-opacity="0.10" stroke="${gold}" stroke-width="1.5"/>
      <path d="M13 88 C16 65 26 57 40 57 C54 57 64 65 67 88 Z" fill="${mainColor}"/>
      <path d="M24 61 Q40 78 56 61" fill="none" stroke="${gold}" stroke-width="2.2"/>
      <circle cx="40" cy="42" r="13" fill="#fbead5" stroke="${gold}" stroke-width="1.6"/>
      <path d="M23 33 Q40 13 57 33 L52 36 L28 36 Z" fill="${gold}" stroke="${mainColor}" stroke-width="1"/>
      <polygon points="40,18 45,27 40,32 35,27" fill="${accentColor}"/>
      <g transform="translate(30.5, 64) scale(0.8)">
        <path d="${pipPath}" fill="${gold}"/>
      </g>
    </svg>`;
  }

  if (rank === 'J') {
    return `<svg class="card-art-svg court-svg" viewBox="0 0 80 100" aria-hidden="true">
      <rect x="5" y="6" width="70" height="88" rx="7" fill="${accentColor}" fill-opacity="0.10" stroke="${gold}" stroke-width="1.5"/>
      <path d="M14 88 C17 65 27 58 40 58 C53 58 63 65 66 88 Z" fill="${mainColor}"/>
      <polygon points="40,57 52,72 40,86 28,72" fill="${gold}"/>
      <circle cx="40" cy="42" r="12.5" fill="#f6e2c8" stroke="${gold}" stroke-width="1.5"/>
      <path d="M25 34 C26 21 35 15 40 10 C45 15 54 21 55 34 Z" fill="${gold}" stroke="${mainColor}" stroke-width="1.1"/>
      <g transform="translate(31.5, 64) scale(0.7)">
        <path d="${pipPath}" fill="${mainColor}"/>
      </g>
    </svg>`;
  }

  // Number cards (2..10): Bold, high-contrast central suit icon + clean pip accents for instant eye recognition
  const n = parseInt(rank, 10) || 2;
  const coords = getPipCoordinates(n);
  const scale = n <= 4 ? 0.96 : n <= 7 ? 0.82 : 0.72;
  const pipsHtml = coords.map(([cx, cy, flip]) => {
    const tf = `translate(${cx}, ${cy}) ${flip ? 'rotate(180)' : ''} scale(${scale}) translate(-12, -12)`;
    return `<g transform="${tf}"><path d="${pipPath}" fill="${mainColor}"/></g>`;
  }).join('');

  return `<svg class="card-art-svg pip-svg" viewBox="0 0 80 100" aria-hidden="true">
    <g transform="translate(18, 28) scale(1.85)" opacity="0.13">
      <path d="${pipPath}" fill="${mainColor}"/>
    </g>
    ${pipsHtml}
  </svg>`;
}

function getPipCoordinates(n) {
  switch (n) {
    case 2: return [[40, 27, false], [40, 73, true]];
    case 3: return [[40, 23, false], [40, 50, false], [40, 77, true]];
    case 4: return [[25, 27, false], [55, 27, false], [25, 73, true], [55, 73, true]];
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
    <polygon points="18,10 26,25 18,40 10,25" fill="#f2c14e" fill-opacity="0.22" stroke="#f2c14e" stroke-width="1"/>
  </svg>`;
}
