// The words, the error line and the download of the crash screen (Crash.tsx).
export type SaveData = string | Uint8Array | Blob;

export interface CrashWords {
  failed: string;
  exportSave: string;
  exporting: string;
  exported: string;
  exportFailed: string;
  noSave: string;
  reload: string;
  retry: string;
}

export const CRASH_WORDS: CrashWords = {
  failed: 'Something went wrong.',
  exportSave: 'Download the save',
  exporting: 'Saving…',
  exported: 'The save was downloaded.',
  exportFailed: 'The save could not be downloaded.',
  noSave: 'There is no save to download.',
  reload: 'Reload the page',
  retry: 'Try again',
};

/** The first line of an error's message, short enough for the page; the error's name when it has none. */
export function errorWords(error: Error | null | undefined, max = 200): string {
  const line = (String(error?.message ?? '').split('\n')[0] ?? '').trim();
  return line === '' ? String(error?.name ?? 'Error') : line.length > max ? `${line.slice(0, max)}…` : line;
}

/** The address is freed after revokeMs: freeing it at once cancels the download in some browsers. */
export function downloadSave(data: SaveData, fileName: string, revokeMs = 10000): void {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([typeof data === 'string' ? data : data.slice()], { type: 'application/octet-stream' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, revokeMs);
  }
}
