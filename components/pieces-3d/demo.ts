// The demo route: every piece on one plain page, flat dice under the WebGL ones. The game mounts it on a dev route.
import { startDiceLayer, type DiceLayer, type DiceLook } from './diceGl';
import { paintBall, type BallLook } from './ball';

export interface DemoLook { dice?: DiceLook; ball?: BallLook; chip?: string }
const DICE: DiceLook = { body: '#f4efe2', ink: '#1b1b1b', font: '700 54px serif', tilt: (15 * Math.PI) / 180 };

export function mountPiecesDemo(root: HTMLElement, look: DemoLook = {}): { dice: DiceLayer | null; stop: () => void } {
  root.className = 'pieces-demo';
  const die = (kind: string, v: number) => `<span data-p3-die="${kind}" data-v="${String(v)}" style="width:64px;height:64px;margin:12px"><span class="flat">${String(v)}</span></span>`;
  root.innerHTML = `<div data-row="d6">${[1, 2, 3, 4, 5, 6].map((v) => die('d6', v)).join('')}</div>`
    + `<div data-row="d10">${Array.from({ length: 10 }, (_, i) => die('d10', i + 1)).join('')}</div>`
    + `<div data-row="other"><canvas data-ball="" class="p3-ball" width="110" height="110" style="width:110px;height:110px"></canvas>`
    + `<span class="p3-chip"><img alt="" width="80" height="80" src="${look.chip ?? 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22%3E%3Ccircle cx=%2240%22 cy=%2240%22 r=%2238%22 fill=%22%23c33%22/%3E%3C/svg%3E'}"></span>`
    + `<div class="p3-lying-card" style="display:inline-block;width:90px;height:126px;margin:12px;background:#fff"></div><div class="p3-lifted-card" style="display:inline-block;width:90px;height:126px;margin:12px;background:#fff"></div></div>`;
  const ball = root.querySelector<HTMLCanvasElement>('canvas[data-ball]');
  if (ball) paintBall(ball, undefined, look.ball);
  const dice = startDiceLayer(look.dice ?? DICE);
  return { dice, stop: () => { dice?.stop(); root.innerHTML = ''; } };
}
