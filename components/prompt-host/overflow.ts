import { useLayoutEffect, type RefObject } from 'react';

export type OverflowRect = readonly [number, number, number, number];

export interface HostOverflowOpts {
  answers?: string;
  floor: number;
  frac: number;
  stage: readonly [number, number];
  zone: OverflowRect;
  keepOut: readonly OverflowRect[];
  gap?: number;
  rows?: boolean;
}

export type OverflowOpts = HostOverflowOpts &
  { answers: string } &
  ({ find: () => HTMLElement | null; ref?: never } | { ref: RefObject<HTMLElement | null>; find?: never });

function restoreStyle(style: CSSStyleDeclaration, properties: readonly string[]): () => void {
  const previous = properties.map((name) => ({ name, value: style.getPropertyValue(name), priority: style.getPropertyPriority(name) }));
  return () => {
    for (const { name, value, priority } of previous) style.setProperty(name, value, priority);
  };
}

function fit(box: HTMLElement, o: OverflowOpts): (() => void) | undefined {
  const answers = box.querySelector<HTMLElement>(o.answers);
  const fits = () => box.scrollHeight <= box.clientHeight + 1;
  if (!answers) return undefined;
  const cs = getComputedStyle(answers);
  const row = o.rows !== false && cs.display.includes('flex') && cs.flexDirection === 'row';
  if (fits() && !(row && answers.scrollWidth > box.clientWidth + 1)) return undefined;

  if (row) {
    const restoreWrap = restoreStyle(answers.style, ['flex-wrap']);
    const restoreOy = restoreStyle(box.style, ['overflow-y']);
    answers.style.flexWrap = 'wrap';
    if (fits()) return restoreWrap;
    box.dataset['overflow'] = 'rows';
    box.style.overflowY = 'auto';
    const more = () => {
      box.dataset['more'] = box.scrollTop + box.clientHeight < box.scrollHeight - 1 ? '1' : '0';
    };
    more();
    box.addEventListener('scroll', more, { passive: true });
    return () => {
      box.removeEventListener('scroll', more);
      box.removeAttribute('data-overflow');
      box.removeAttribute('data-more');
      restoreWrap();
      restoreOy();
    };
  }

  const restoreFont = restoreStyle(answers.style, ['font-size']);
  let font = parseFloat(getComputedStyle(answers).fontSize);
  while (font > o.floor) {
    font = Math.max(o.floor, font - 1);
    answers.style.fontSize = `${String(font)}px`;
    if (fits()) return restoreFont;
  }

  const restoreBox = restoreStyle(box.style, ['overflow-y', 'position', 'left', 'top', 'width', 'height', 'z-index', 'box-sizing']);
  answers.setAttribute('data-overflow-answers', '');
  box.dataset['overflow'] = 'cols';
  box.style.overflowY = 'auto';

  const more = () => {
    box.dataset['more'] = box.scrollTop + box.clientHeight < box.scrollHeight - 1 ? '1' : '0';
  };
  if (!fits()) {
    const [zx, zy, zw, zh] = o.zone;
    let cap = o.frac * o.stage[1];
    for (const [kx, ky, kw, kh] of o.keepOut) {
      if (kx < zx + zw && kx + kw > zx && ky + kh > zy) cap = Math.min(cap, ky - zy - (o.gap ?? 12));
    }
    if (cap > zh) {
      box.dataset['overflow'] = 'panel';
      const height = Math.min(cap, box.scrollHeight + Math.max(0, box.offsetHeight - box.clientHeight));
      Object.assign(box.style, { position: 'absolute', left: '0', top: '0', width: '100%', zIndex: '50', boxSizing: 'border-box', height: `${String(height)}px` });
    }
    more();
    box.addEventListener('scroll', more, { passive: true });
  }

  return () => {
    box.removeEventListener('scroll', more);
    box.removeAttribute('data-overflow');
    box.removeAttribute('data-more');
    answers.removeAttribute('data-overflow-answers');
    restoreFont();
    restoreBox();
  };
}

const top = (b: HTMLElement) => {
  b.scrollTop = 0;
};

export function useOverflow(o: OverflowOpts | undefined, deps: readonly unknown[]): void {
  useLayoutEffect(() => {
    if (!o) return;
    const box = o.find?.() ?? o.ref?.current;
    if (!box) return;
    top(box);
    let restore = fit(box, o);
    const observer = new MutationObserver(() => {
      restore?.();
      restore = fit(box, o);
    });
    observer.observe(box, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      restore?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
