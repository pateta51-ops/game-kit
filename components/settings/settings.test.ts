import { describe, expect, expectTypeOf, it } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { createSettingsStore, defaults, layoutSetting, readSettings, resolutionSetting, resolutionSize, type SettingsSchema, type Values } from './index';

const SCHEMA = {
  storageKey: 'test.settings.v1',
  sections: [
    {
      id: 'play',
      title: 'Play',
      settings: [
        { kind: 'toggle', key: 'flagA', label: 'Flag A', default: true },
        { kind: 'choice', key: 'mode', label: 'Mode', default: 'two', options: [{ value: 'one', label: 'One' }, { value: 'two', label: 'Two' }, { value: 'three', label: 'Three' }] },
        { kind: 'choice', key: 'size', label: 'Size', default: 1, options: [{ value: 1, label: '1' }, { value: 2, label: '2' }] },
      ],
    },
    { id: 'dev', title: 'Dev', settings: [{ kind: 'toggle', key: 'flagB', label: 'Flag B', default: false, dev: true }] },
  ],
} as const satisfies SettingsSchema;

const memory = (init: Record<string, string> = {}): StateStorage & { data: Record<string, string> } => {
  const data = { ...init };
  return {
    data,
    getItem: (n) => data[n] ?? null,
    setItem: (n, v) => {
      data[n] = v;
    },
    removeItem: (n) => {
      delete data[n];
    },
  };
};

describe('settings schema', () => {
  it('types the values from the schema and gives the defaults', () => {
    const d = defaults(SCHEMA);
    expectTypeOf(d).toEqualTypeOf<{ flagA: boolean; mode: 'one' | 'two' | 'three'; size: 1 | 2; flagB: boolean }>();
    expect(d).toEqual({ flagA: true, mode: 'two', size: 1, flagB: false });
  });

  it('keeps stored values of the right kind and defaults the rest', () => {
    expect(readSettings(SCHEMA, { flagA: false, mode: 'four', size: 2, flagB: 'yes', stray: 1 })).toEqual({ flagA: false, mode: 'two', size: 2, flagB: false });
    expect(readSettings(SCHEMA, null)).toEqual(defaults(SCHEMA));
    expect(readSettings(SCHEMA, 'junk')).toEqual(defaults(SCHEMA));
  });

  it('builds the Layout and Resolution choices', () => {
    const l = layoutSetting('layout', 'Layout', { auto: 'A', phone: 'P', desk: 'D' });
    expect(l.options.map((o) => o.value)).toEqual(['auto', 'phone', 'desk']);
    expect(l.default).toBe('auto');
    const r = resolutionSetting('res', 'Resolution', 'Window');
    expect(r.select).toBe(true);
    expect(r.options.at(-1)).toEqual({ value: 'window', label: 'Window' });
    expect(r.options[0]?.label).toBe('1280 × 720');
    expect(resolutionSize('1920x1080')).toEqual({ w: 1920, h: 1080 });
    expect(resolutionSize('window')).toBeNull();
  });
});

describe('settings store', () => {
  it('persists changes, reads them back validated, and resets', () => {
    const s = memory();
    const a = createSettingsStore(SCHEMA, s);
    a.getState().set('mode', 'three');
    a.getState().set('flagA', false);
    expect(JSON.parse(s.data['test.settings.v1'] ?? '{}')).toMatchObject({ state: { values: { mode: 'three', flagA: false } } });
    const b = createSettingsStore(SCHEMA, s);
    expect(b.getState().values).toEqual({ flagA: false, mode: 'three', size: 1, flagB: false });
    b.getState().reset(['mode']);
    expect(b.getState().values.mode).toBe('two');
    expect(b.getState().values.flagA).toBe(false);
    b.getState().reset();
    expect(b.getState().values).toEqual(defaults(SCHEMA));
  });

  it('a stored file with wrong values or wrong shape falls back to defaults', () => {
    const s = memory({ 'test.settings.v1': JSON.stringify({ state: { values: { mode: 7, size: 2 } }, version: 1 }) });
    expect(createSettingsStore(SCHEMA, s).getState().values).toEqual({ flagA: true, mode: 'two', size: 2, flagB: false });
    const t = memory({ 'test.settings.v1': '{not json' });
    expect(createSettingsStore(SCHEMA, t).getState().values).toEqual(defaults(SCHEMA));
  });

  it('works with no storage at all', () => {
    const throwing: StateStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    };
    const st = createSettingsStore(SCHEMA, throwing);
    expect(st.getState().values).toEqual(defaults(SCHEMA));
    expectTypeOf(st.getState().values).toEqualTypeOf<Values<typeof SCHEMA>>();
  });

  it('range keeps a stored number only inside min..max', () => {
    const s = { storageKey: 'r', sections: [{ id: 'a', title: 'A', settings: [{ kind: 'range', key: 'v', label: 'V', min: 0, max: 10, default: 5 }] }] } as const satisfies SettingsSchema;
    expect(readSettings(s, { v: 7 }).v).toBe(7);
    expect(readSettings(s, { v: 11 }).v).toBe(5);
    expect(readSettings(s, { v: '7' }).v).toBe(5);
  });
});
