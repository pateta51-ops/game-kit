import { createGlitch } from '../../glitch.ts';

const logo = document.getElementById('logo') as HTMLElement;
let off = false;
const g = createGlitch(logo, { speed: () => (off ? 'instant' : 1), colours: ['#e5484d', '#74b9e5'], seed: 7 });
document.getElementById('burst')?.addEventListener('click', () => g.burst());
document.getElementById('tear')?.addEventListener('click', () => g.tear());
document.getElementById('off')?.addEventListener('change', (e) => {
  off = (e.target as HTMLInputElement).checked;
  g.update();
});
(window as unknown as { glitch: typeof g }).glitch = g;
