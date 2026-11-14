// BUILD_PLAN §9.10, PHONE-MODE-PLAN P0 and §1: a bug report carries the device's measurements (viewport, visual
// viewport, screen, pixel ratio, safe-area insets, Home Screen display mode, touch pointer, orientation), so a report
// filed from the owner's iPhone 16e settles the plan's [VERIFY] values.
import 'fake-indexeddb/auto';
import './test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectReport, deviceFacts } from './collect';
import { parseReport } from './report';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const media = (on: string[]) => (query: string) =>
  ({ matches: on.includes(query), media: query }) as unknown as MediaQueryList;

describe('§9.10 PHONE P0: device facts in a bug report', () => {
  it('§9.10 PHONE P0: reads the viewport, screen, ratio, display mode, pointer and orientation', () => {
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 651);
    vi.stubGlobal('devicePixelRatio', 3);
    vi.stubGlobal('visualViewport', { width: 390, height: 651, scale: 1 });
    vi.spyOn(window.screen, 'width', 'get').mockReturnValue(390);
    vi.spyOn(window.screen, 'height', 'get').mockReturnValue(844);
    vi.stubGlobal('matchMedia', media(['(pointer: coarse)']));
    const d = deviceFacts();
    expect(d.viewport).toEqual({ width: 390, height: 651 });
    expect(d.visualViewport).toEqual({ width: 390, height: 651, scale: 1 });
    expect(d.screen).toEqual({ width: 390, height: 844 });
    expect(d.ratio).toBe(3);
    expect(d.coarsePointer).toBe(true);
    expect(d.standalone).toBe(false);
    expect(d.orientation).toBe('portrait');
    // jsdom has no env(): the insets read as 0, never NaN
    expect(d.safeArea).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    // the probe element is removed again
    expect(document.body.children).toHaveLength(0);
  });

  it('§9.10 PHONE P0: a Home Screen app in landscape, without visualViewport', () => {
    vi.stubGlobal('innerWidth', 844);
    vi.stubGlobal('innerHeight', 390);
    vi.stubGlobal('visualViewport', null);
    vi.stubGlobal('matchMedia', media(['(display-mode: standalone)', '(pointer: coarse)']));
    const d = deviceFacts();
    expect(d.orientation).toBe('landscape');
    expect(d.standalone).toBe(true);
    expect(d.visualViewport).toBeNull();
  });

  it('§9.10 PHONE P0: the report holds details.device and still parses as a report', () => {
    const report = collectReport('on the phone', null);
    expect(report.details.device?.ratio).toBe(window.devicePixelRatio);
    const parsed = parseReport(JSON.stringify(report));
    expect(parsed.ok).toBe(true);
    // a report filed before P0 (no device) still parses
    const old = structuredClone(report) as { details: Record<string, unknown> };
    delete old.details['device'];
    expect(parseReport(JSON.stringify(old)).ok).toBe(true);
  });
});
