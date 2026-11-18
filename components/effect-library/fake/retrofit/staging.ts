import { cameraPull, cameraPush, cameraScaleAt, createAmbience, drawDriftCloud, drawPlasmaOrb, letterboxBanner, pileLift, plasmaSwellAt } from '../../index.ts';

const params = new URLSearchParams(location.search);
if (params.has('staging')) {
  document.documentElement.classList.add('staging-only');
  const el = (id: string) => document.getElementById(id)!;
  const frame = params.get('frame');
  const art = document.createElement('canvas');
  art.width = art.height = 160;
  const brush = art.getContext('2d')!;
  brush.fillStyle = '#c3b6d8';
  brush.fillRect(0, 0, 160, 160);
  brush.strokeStyle = '#625778';
  brush.lineWidth = 12;
  for (let k = -160; k < 160; k += 30) {
    brush.beginPath();
    brush.moveTo(k, 0);
    brush.lineTo(k + 160, 160);
    brush.stroke();
  }
  const clock = (t: number) => frame === null ? t : Number(frame);
  const orb = createAmbience({
    target: () => el('orb-sample'), speed: () => 1,
    draw: (c, t, w, h) => drawPlasmaOrb(c, w / 2, h * 0.55, h * 0.17, clock(t), false, plasmaSwellAt(clock(t) - 500)),
  });
  const cloud = createAmbience({
    target: () => el('cloud-sample'), speed: () => 1,
    draw: (c, t, w, h) => {
      const now = clock(t);
      drawDriftCloud(c, {
        w, h, u: h / 70, now, scale: 1, empty: false,
        cohorts: [{ id: 'a', born: -2400 }, { id: 'b', born: -1100 }, { id: 'c', born: -3300 }],
        art: () => ({ img: art, w: 160, h: 160 }),
        settings: { pieceCount: 7, emberColour: '#e5dafa' },
      });
    },
  });
  let stop = (): void => {};
  const play = (): void => {
    stop();
    const camera = el('camera-root');
    const dim = el('camera-dim');
    const root = el('letterbox-root');
    const pull = cameraPull(camera, dim, { scale: 0.82, dim: 0.45, pullMs: 1300, dimMs: 850 });
    const push = cameraPush(root);
    const banner = letterboxBanner(root, {
      barHeight: root.clientHeight * 0.17, vignetteColour: '#c5bce155', barBackground: '#171521',
      lineColour: '#b2a6d3', lineWidth: 2, text: 'Sample', textOut: [1000, 1500],
      textStyle: { letterSpacing: '0.22em' },
    });
    const pile = pileLift(el('pile-sample'), { lift: '-2% -19%', scale: 1.1, liftMs: 350, settleMs: 450 });
    let animation = 0;
    let settle: Animation | undefined;
    let releasing = false;
    const start = performance.now();
    const tick = (now: number): void => {
      const t = clock(now - start);
      if (t >= 900) settle ??= pile.settle();
      const scale = cameraScaleAt(t, 0, 2000, { scale: 1.12 });
      const focus = [root.clientWidth / 2, root.clientHeight / 2] as const;
      banner.frame(t, 0, 2000, { scale, focus });
      push.frame(scale, focus);
      if (frame !== null) {
        for (const a of [...camera.getAnimations(), ...dim.getAnimations({ subtree: true }), ...(pile.lift ? [pile.lift] : []), ...(settle ? [settle] : [])]) {
          a.pause();
          a.currentTime = a === settle ? t - 900 : t;
        }
        if (t >= 2000) stop();
        return;
      }
      if (t >= 1500 && !releasing) {
        releasing = true;
        void pull.release();
      }
      if (t < 2000) animation = requestAnimationFrame(tick);
      else stop();
    };
    stop = () => {
      cancelAnimationFrame(animation);
      pull();
      push.end();
      banner.end();
      pile.end();
    };
    animation = requestAnimationFrame(tick);
  };
  document.querySelector('button')?.addEventListener('click', play);
  window.addEventListener('pagehide', () => {
    stop();
    orb.destroy();
    cloud.destroy();
  }, { once: true });
  play();
}
