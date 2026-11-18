// Asset paths: a game passes its base URL and folder map, gets URLs for faces, icons, boards.
export const joinBase = (base: string, path: string): string => `${base}${base.endsWith('/') || path === '' ? '' : '/'}${path}`;
/** A `url(...)` for a CSS custom property; relative URLs in custom properties resolve against the stylesheet, so make them absolute against `docBase` (default `document.baseURI`). */
export const cssUrl = (url: string, docBase?: string): string => `url(${new URL(url, docBase ?? document.baseURI).href})`;
export interface AssetFolders {
  readonly face?: string;
  readonly icon?: string;
  readonly board?: string;
  readonly [kind: string]: string | undefined;
}
export interface AssetOptions {
  /** Extension (with dot) by folder kind; default `.webp` for face and board, `.svg` for icon. */
  readonly ext?: Readonly<Record<string, string>>;
  /** Icon code to file name; codes not in it have no icon (`icon` gives null). */
  readonly iconFiles?: Readonly<Record<string, string>>;
}
export function assetPaths(base: string, folders: AssetFolders, opts: AssetOptions = {}) {
  const ext = (k: string) => opts.ext?.[k] ?? (k === 'icon' ? '.svg' : '.webp');
  const of = (kind: string, name: string): string => joinBase(base, `${folders[kind] ?? kind}/${name}${ext(kind)}`);
  return {
    pub: (path: string): string => joinBase(base, path),
    of,
    face: (id: string): string => of('face', id),
    board: (id: string): string => of('board', id),
    /** An icon by code: through `iconFiles` when given (null if the code is not there), else by name. */
    icon: (code: string): string | null => {
      if (opts.iconFiles === undefined) return of('icon', code);
      const f = opts.iconFiles[code];
      return f === undefined ? null : joinBase(base, `${folders.icon ?? 'icon'}/${f}`);
    },
  };
}
