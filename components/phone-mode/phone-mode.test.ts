import { describe, expect, it } from 'vitest';
import { defineMachine, edgesOf, IllegalTransitionError, transition } from '../state-machines/machine';
import {
  applyFit,
  createSheetStore,
  fitZoom,
  foldMachine,
  layoutAttr,
  layoutModeFor,
  needsFit,
  secondTap,
  VIEWPORT_MACHINE,
  type LayoutSetting,
} from './index';

const at = (w: number, h: number, coarse: boolean, setting: LayoutSetting = 'auto', autoPhone = true) =>
  layoutModeFor({ w, h, coarse, setting, autoPhone });

describe('layoutModeFor', () => {
  it('a phone upright and sideways, in the browser and as a Home Screen app', () => {
    expect(at(390, 651, true)).toBe('phonePortrait');
    expect(at(390, 844, true)).toBe('phonePortrait');
    expect(at(726, 340, true)).toBe('phoneLandscape');
    expect(at(844, 390, true)).toBe('phoneLandscape');
  });
  it('4K is desk; a laptop is fitted with or without touch; a mouse at phone size is not a phone', () => {
    expect(at(3840, 2160, false)).toBe('desk');
    expect(at(5120, 2880, false)).toBe('desk');
    expect(at(1920, 1080, false)).toBe('fitted');
    expect(at(1920, 1080, true)).toBe('fitted');
    expect(at(390, 844, false)).toBe('fitted');
  });
  it('the setting forces either; a forced phone with a mouse stays upright', () => {
    expect(at(3840, 2160, false, 'phone')).toBe('phonePortrait');
    expect(at(844, 390, true, 'phone')).toBe('phoneLandscape');
    expect(at(1000, 1600, false, 'phone')).toBe('phonePortrait');
    expect(at(390, 844, true, 'desk')).toBe('fitted');
    expect(at(3840, 2160, true, 'desk')).toBe('desk');
  });
  it('autoPhone off keeps the fitted screens; the short side and design size are options', () => {
    expect(at(390, 844, true, 'auto', false)).toBe('fitted');
    expect(layoutModeFor({ w: 600, h: 900, coarse: true, setting: 'auto', shortSide: 700 })).toBe('phonePortrait');
    expect(layoutModeFor({ w: 1920, h: 1080, coarse: false, setting: 'auto', deskW: 1920, deskH: 1080 })).toBe('desk');
  });
  it('data-layout names the family', () => {
    expect(layoutAttr('phonePortrait')).toBe('phone');
    expect(layoutAttr('phoneLandscape')).toBe('phone');
    expect(layoutAttr('desk')).toBe('desk');
    expect(layoutAttr('fitted')).toBe('fitted');
  });
});

describe('kit.viewport and fit', () => {
  it('every pair of modes is an edge; a self-event is illegal', () => {
    const edges = edgesOf(VIEWPORT_MACHINE);
    for (const a of VIEWPORT_MACHINE.stateNames)
      for (const b of VIEWPORT_MACHINE.stateNames) if (a !== b) expect(edges.some((e) => e.from === a && e.to === b)).toBe(true);
    expect(() => transition(VIEWPORT_MACHINE, 'desk', 'toDesk')).toThrow(IllegalTransitionError);
  });
  it('fitted zooms; a phone zooms only a location with no phone screen, never sideways', () => {
    const screens = (h: string) => h === '#/game';
    expect(needsFit('fitted', '#/game', screens)).toBe(true);
    expect(needsFit('desk', '#/x', screens)).toBe(false);
    expect(needsFit('phonePortrait', '#/game', screens)).toBe(false);
    expect(needsFit('phonePortrait', '#/x', screens)).toBe(true);
    expect(needsFit('phoneLandscape', '#/x', screens)).toBe(false);
    expect(needsFit('phonePortrait', '#/x')).toBe(false);
  });
  it('fitZoom and applyFit', () => {
    expect(fitZoom(3840, 2160)).toBe(1);
    expect(fitZoom(1920, 1080)).toBe(0.5);
    expect(fitZoom(390, 844)).toBeCloseTo(390 / 3840);
    expect(fitZoom(0, 0)).toBe(1);
    expect(fitZoom(960, 540, 1920, 1080)).toBe(0.5);
    // a stand-in element: jsdom's style object does not keep the non-standard zoom property
    const el = { style: { zoom: '' } } as unknown as HTMLElement;
    applyFit(el, { w: 1920, h: 1080 });
    expect(el.style.zoom).toBe('0.5');
    applyFit(el, null);
    expect(el.style.zoom).toBe('');
  });
});

describe('fold, sheet store, second tap', () => {
  it('foldMachine: open and fold only', () => {
    const m = foldMachine('test.fold', 'folded', { purpose: 'test', source: 'components/phone-mode/phone-mode.test.ts' });
    expect(transition(m, 'folded', 'open')).toBe('open');
    expect(transition(m, 'open', 'fold')).toBe('folded');
    expect(() => transition(m, 'open', 'open')).toThrow(IllegalTransitionError);
  });
  it('createSheetStore: one sheet at a time; data kept while the state holds it; sendIfCan', () => {
    const m = defineMachine<'none' | 'card' | 'log', 'openCard' | 'openLog' | 'close'>({
      id: 'test.sheet',
      initial: 'none',
      states: {
        none: { on: { openCard: 'card', openLog: 'log' } },
        card: { on: { openCard: 'card', close: 'none' } },
        log: { on: { openCard: 'card', close: 'none' } },
      },
      describe: { purpose: 'test', source: 'components/phone-mode/phone-mode.test.ts' },
    });
    const s = createSheetStore<'none' | 'card' | 'log', 'openCard' | 'openLog' | 'close', string>(m, (st) => st === 'card');
    s.getState().send('openLog');
    expect(s.getState()).toMatchObject({ state: 'log', data: null });
    s.getState().send('openCard', 'c1');
    expect(s.getState()).toMatchObject({ state: 'card', data: 'c1' });
    s.getState().send('openCard');
    expect(s.getState().data).toBe('c1');
    s.getState().send('close');
    expect(s.getState()).toMatchObject({ state: 'none', data: null });
    s.getState().sendIfCan('close');
    expect(s.getState().state).toBe('none');
    expect(() => s.getState().send('close')).toThrow(IllegalTransitionError);
  });
  it('secondTap: arm, re-arm another, commit the armed one', () => {
    expect(secondTap(null, 'a')).toEqual({ armed: 'a', commit: false });
    expect(secondTap('a', 'b')).toEqual({ armed: 'b', commit: false });
    expect(secondTap('b', 'b')).toEqual({ armed: null, commit: true });
  });
});
