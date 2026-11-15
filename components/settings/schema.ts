// Settings declared as data: toggles and choices in titled sections. readSettings keeps a stored value only when it is
// of the right kind (a boolean, one of the options); anything else, or a missing key, is the default.
export interface Toggle<K extends string = string> {
  readonly kind: 'toggle';
  readonly key: K;
  readonly default: boolean;
  readonly label: string;
  readonly hint?: string;
  readonly dev?: boolean;
}

export interface Option<V extends string | number = string | number> {
  readonly value: V;
  readonly label: string;
  readonly line?: string;
}

export interface Choice<K extends string = string, V extends string | number = string | number> {
  readonly kind: 'choice';
  readonly key: K;
  readonly options: readonly Option<V>[];
  readonly default: V;
  readonly label: string;
  readonly hint?: string;
  readonly dev?: boolean;
  /** Drawn as a drop-down instead of radio buttons. */
  readonly select?: boolean;
}

export type SettingDef = Toggle | Choice;

export interface Section {
  readonly id: string;
  readonly title: string;
  readonly settings: readonly SettingDef[];
}

export interface SettingsSchema {
  /** The localStorage key. */
  readonly storageKey: string;
  readonly version?: number;
  readonly sections: readonly Section[];
}

type Defs<S extends SettingsSchema> = S['sections'][number]['settings'][number];

export type Values<S extends SettingsSchema> = {
  -readonly [D in Defs<S> as D['key']]: D extends Toggle ? boolean : D extends Choice<string, infer V> ? V : never;
};

export const settingDefs = (s: SettingsSchema): SettingDef[] => s.sections.flatMap((x) => x.settings);

export function defaults<S extends SettingsSchema>(s: S): Values<S> {
  return Object.fromEntries(settingDefs(s).map((d) => [d.key, d.default])) as Values<S>;
}

export function isValid(d: SettingDef, v: unknown): boolean {
  return d.kind === 'toggle' ? typeof v === 'boolean' : d.options.some((o) => o.value === v);
}

export function readSettings<S extends SettingsSchema>(s: S, raw: unknown): Values<S> {
  const stored = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return Object.fromEntries(
    settingDefs(s).map((d) => [d.key, isValid(d, stored[d.key]) ? stored[d.key] : d.default]),
  ) as Values<S>;
}

export type LayoutValue = 'auto' | 'phone' | 'desk';

/** A Layout choice with the values phone-mode's layoutModeFor reads (auto, phone, desk); the words are the game's. */
export const layoutSetting = <K extends string>(
  key: K,
  label: string,
  words: Readonly<Record<LayoutValue, string>>,
  def: LayoutValue = 'auto',
): Choice<K, LayoutValue> => ({
  kind: 'choice',
  key,
  label,
  default: def,
  options: (['auto', 'phone', 'desk'] as const).map((value) => ({ value, label: words[value] })),
});

/** Screen sizes for a Resolution choice. */
export const RESOLUTIONS = ['1280x720', '1366x768', '1600x900', '1920x1080', '2560x1440', '3440x1440', '3840x2160', '5120x2880'] as const;

/** A Resolution choice (a drop-down): sizes 'WxH' labelled 'W × H', then 'window' (no scaling) with the game's word. */
export const resolutionSetting = <K extends string>(
  key: K,
  label: string,
  windowWord: string,
  def = '3840x2160',
  sizes: readonly string[] = RESOLUTIONS,
): Choice<K, string> => ({
  kind: 'choice',
  key,
  label,
  default: def,
  select: true,
  options: [...sizes.map((value) => ({ value, label: value.replace('x', ' × ') })), { value: 'window', label: windowWord }],
});

/** The width and height of a resolution value, or null for 'window' (or anything not 'WxH'). */
export function resolutionSize(v: string): { w: number; h: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(v);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}
