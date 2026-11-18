export const seventhInning = {
  arcMove: { bank: 1 / 5, lean: 0.2, apex: 0.55 },
  glow: {
    colour: 'var(--red)',
    hold: 0.7,
    shadows: ['0 0 0 calc(30px * var(--fx-k,1))', '0 0 calc(120px * var(--fx-k,1)) calc(50px * var(--fx-k,1))'],
  },
  flip: { squash: false },
  shakeGroup: { selector: '.score-grid .tin-plate, .board-grid .tin-plate', amplitude: 6, crossAmplitude: 1, frames: 9 },
  unroll: { axis: 'y', origin: 'top' },
  hideSource: 'step',
  look: {
    red: '#bd3e2e',
    chalk: '#f3efdc',
    board: '#163a25',
  },
} as const;
