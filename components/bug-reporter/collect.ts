// Bug reports: what a report holds: the explanation, the screenshot, the game's snapshot (config.ts), the build, the browser and the screen.
import { bugConfig, type GameSnapshot } from './config.ts';
import { LOG_LINES, newReportId, type BugReport, type DeviceFacts } from './report.ts';

/** A CSS length in px, or 0 when the browser gives none (jsdom, or `env()` unsupported). */
const px = (v: string): number => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const matches = (query: string): boolean =>
  typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

/** What the device really measures (the iPhone's viewport and safe-area insets, Home Screen or Safari). */
export function deviceFacts(): DeviceFacts {
  const vv = window.visualViewport;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  const cs = window.getComputedStyle(probe);
  const safeArea = {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
  probe.remove();
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    visualViewport: vv ? { width: vv.width, height: vv.height, scale: vv.scale } : null,
    screen: { width: window.screen.width, height: window.screen.height },
    ratio: window.devicePixelRatio,
    safeArea,
    standalone: matches('(display-mode: standalone)'),
    coarsePointer: matches('(pointer: coarse)'),
    orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
  };
}

export function collectReport(explanation: string, screenshot: string | null, now = new Date()): BugReport {
  let snap: GameSnapshot = { contentHash: null, replay: null, round: null, prompt: null, actions: 0, log: [] };
  let replay: BugReport['replay'] = null;
  try {
    snap = bugConfig().snapshot();
    const r = snap.replay === null ? null : (structuredClone(snap.replay) as { saveVersion?: number; version?: unknown });
    if (r !== null && r.saveVersion === undefined && typeof r.version === 'number') r.saveVersion = r.version;
    replay = r as BugReport['replay'];
  } catch {
    // the report goes out without the snapshot
  }
  return {
    format: `${bugConfig().id}-bug-report`,
    version: 1,
    id: newReportId(now),
    createdAt: now.toISOString(),
    explanation,
    details: {
      buildSha: bugConfig().buildSha,
      contentHash: snap.contentHash,
      browser: navigator.userAgent,
      screen: { width: window.innerWidth, height: window.innerHeight, ratio: window.devicePixelRatio },
      device: deviceFacts(),
      ...(snap.theme === undefined ? {} : { theme: snap.theme }),
      time: now.toISOString(),
      round: snap.round,
      route: window.location.hash === '' ? '#/' : window.location.hash,
      prompt: snap.prompt,
      actions: snap.actions,
      log: snap.log.slice(-LOG_LINES),
    },
    replay,
    screenshot: screenshot === null ? null : { mime: 'image/png', base64: screenshot },
  };
}
