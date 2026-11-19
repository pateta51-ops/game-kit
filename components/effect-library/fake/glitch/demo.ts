import { createGlitch } from '../../glitch.ts';

const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 100'><text x='200' y='76' text-anchor='middle' font-family='sans-serif' font-weight='900' font-size='80'>SIGNAL</text></svg>";
const logo = document.getElementById('logo') as HTMLElement;
let off = false;
const g = createGlitch(logo, { speed: () => (off ? 'instant' : 1), mask: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, colours: ['#e5484d', '#74b9e5'], seed: 7 });
document.getElementById('burst')?.addEventListener('click', () => g.burst());
document.getElementById('tear')?.addEventListener('click', () => g.tear());
document.getElementById('off')?.addEventListener('change', (e) => {
  off = (e.target as HTMLInputElement).checked;
  g.update();
});
(window as unknown as { glitch: typeof g }).glitch = g;
