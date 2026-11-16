import { describe, expect, it } from 'vitest';
import { beatsFor, camera, dualFraming, earnedStories, framing, keyAction, moveMs, panelProblems, readerStart, readerStep, splashAutoCloseMs, splashFor, type PanelSheet } from './index';

const page = { w: 1000, h: 1000 };
const sheet: PanelSheet = { id: 'p', picture: { note: 'n', ...page }, beats: [{ rect: { x: 0, y: 0, w: 100, h: 100 } }, { rect: { x: 800, y: 800, w: 200, h: 100 }, wideOnly: true }, { rect: { x: 100, y: 100, w: 50, h: 50 }, narrowOnly: true }] };

describe('panel framing (K154)', () => {
  it('keeps the area aspect, the margin, and stays inside the picture', () => {
    const f = framing({ x: 0, y: 0, w: 100, h: 100 }, { w: 200, h: 100 }, page);
    expect(f.w / f.h).toBeCloseTo(2);
    expect(f.x).toBe(0); expect(f.y).toBe(0);
    const g = framing({ x: 900, y: 900, w: 100, h: 100 }, { w: 100, h: 100 }, page);
    expect(g.x + g.w).toBeLessThanOrEqual(1000.0001);
    expect(framing({ x: 0, y: 0, w: 1000, h: 1000 }, { w: 200, h: 100 }, page).w).toBeLessThanOrEqual(1000);
  });
  it('one rectangle gives a wide and a phone framing', () => {
    const d = dualFraming({ x: 400, y: 400, w: 100, h: 100 }, { wide: { w: 1440, h: 705 }, narrow: { w: 390, h: 680 } }, page);
    expect(d.wide.w / d.wide.h).toBeCloseTo(1440 / 705);
    expect(d.narrow.w / d.narrow.h).toBeCloseTo(390 / 680);
  });
  it('camera maps the region to the area', () => {
    const c = camera(sheet.beats[0]!, { w: 400, h: 400 }, page);
    expect(c.region.x * c.scale + c.tx).toBeCloseTo(0);
    expect(c.region.w * c.scale).toBeCloseTo(400);
  });
  it('wide-only and phone-only beats', () => {
    expect(beatsFor(sheet.beats, 'wide')).toHaveLength(2);
    expect(beatsFor(sheet.beats, 'narrow')).toHaveLength(2);
  });
  it('reduced motion is a cut', () => { expect(moveMs(true)).toBe(0); expect(moveMs(false)).toBeGreaterThan(0); });
});

describe('reader steps and keys', () => {
  it('next, back, skip, end', () => {
    let r = readerStart();
    r = readerStep(r, 2, 'back'); expect(r.i).toBe(0);
    r = readerStep(r, 2, 'next'); expect(r).toEqual({ i: 1, done: false });
    r = readerStep(r, 2, 'next'); expect(r.done).toBe(true);
    expect(readerStep(readerStart(), 5, 'skip').done).toBe(true);
    expect(keyAction('ArrowRight')).toBe('next'); expect(keyAction('ArrowLeft')).toBe('back'); expect(keyAction('Escape')).toBe('skip'); expect(keyAction('x')).toBeNull();
  });
  it('earned stories and problems', () => {
    expect(earnedStories([{ achievement: 'a', sheet }, { achievement: 'b', sheet }], ['a']).map((s) => s.open)).toEqual([true, false]);
    expect(panelProblems(sheet)).toEqual([]);
    expect(panelProblems({ ...sheet, beats: [{ rect: { x: 950, y: 0, w: 100, h: 10 } }] })).toHaveLength(1);
  });
});

describe('event splash (K155)', () => {
  const lookup = (e: { type: string }) => (e.type === 'stage' ? { line: { text: 'Now!' } } : undefined);
  it('opens once per event, only where the story has a line', () => {
    const ev = [{ type: 'draw', id: 1 }, { type: 'stage', id: 2 }];
    const r = splashFor(ev, lookup, new Set());
    expect(r?.key).toBe('stage:2');
    expect(splashFor(ev, lookup, new Set([r!.key]))).toBeNull();
    expect(splashFor([{ type: 'stage' }], lookup, new Set())).toBeNull();
    expect(splashFor([{ type: 'stage' }], lookup, new Set(), () => 'k')?.key).toBe('k');
  });
  it('4 s, none under reduced motion', () => { expect(splashAutoCloseMs(false)).toBe(4000); expect(splashAutoCloseMs(true)).toBeNull(); });
});
