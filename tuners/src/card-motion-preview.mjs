/* global document */
import { createElement, Fragment } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Pile } from '../../components/card-pile/Pile.tsx';
import { MarketRow } from '../../components/market-row/MarketRow.tsx';

export { EDGE_CAP, edgesFor, stepFor, totalMs } from '../../components/card-pile/fan.ts';
export { DEAL_MS, SLIDE_MS, STAGGER_MS } from '../../components/market-row/deal.ts';

function artwork(id) {
  const back = id === 'back';
  const index = Number(id);
  return {
    className: back ? 'card-art card-back' : 'card-art',
    style: { '--hue': (index * 53 + 150) % 360 },
    children: [back ? '◇' : ['✦', '△', '◈', '○'][index % 4], back ? '' : String(index)],
  };
}

export function art(id) {
  const { className, style, children } = artwork(id);
  const node = document.createElement('div');
  node.className = className;
  node.style.setProperty('--hue', style['--hue']);
  const icon = document.createElement('b');
  icon.textContent = children[0];
  node.append(icon, children[1]);
  return node;
}

export function flipArt(node) {
  node.classList.add('flip-art');
  return node;
}

function face(id) {
  const { children: [icon, label], ...props } = artwork(id);
  return createElement('div', props, createElement('b', null, icon), label);
}

let root;
export function clear() {
  root?.unmount();
  root = undefined;
}

function draw(stage, child) {
  root ??= createRoot(stage);
  flushSync(() => root.render(child));
}

export function pile(stage, { count, speed, landscape, fanUnit }, browse, play, key) {
  const cards = Array.from({ length: count }, (_, i) => String(i + 1));
  draw(stage, createElement(Pile, {
    key, label: 'Pile', testId: 'preview-pile', host: stage, view: { count, cards }, face, back: () => face('back'), browse, speed, landscape,
    ...(fanUnit ? { unit: () => fanUnit } : {}),
  }));
  if (play) stage.querySelector('[data-part="stack-hit"]')?.click();
}

export function market(stage, speed, play, key, flip) {
  const row = { decks: { deck: 12 }, slots: ['1', '2', '3'] };
  const render = (view) => draw(stage, createElement(Fragment, { key }, createElement(MarketRow, {
    name: 'market', label: 'Market', row: view, face, deck: () => face('back'), speed, flip,
  })));
  render(row);
  if (play) render({ ...row, slots: ['4', '5', '1'] });
}
