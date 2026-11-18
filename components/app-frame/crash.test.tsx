import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppFrame, CrashScreen, downloadSave, errorWords, type SaveData } from './ui.ts';

const boom = new Error('boom\nat somewhere');
const click = async (id: string, waitMs = 0) => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(id));
    await new Promise((r) => setTimeout(r, waitMs));
  });
};
const state = () => screen.getByTestId('crash-export-state').getAttribute('data-state');

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('errorWords', () => {
  it('gives the first line, cut to the limit, or the name of an error without a message', () => {
    expect(errorWords(boom)).toBe('boom');
    expect(errorWords(new Error('x'.repeat(300)))).toBe(`${'x'.repeat(200)}…`);
    expect(errorWords(new Error('abcdef'), 3)).toBe('abc…');
    expect(errorWords(new TypeError(''))).toBe('TypeError');
    expect(errorWords(new Error('  \nsecond'))).toBe('Error');
    expect(errorWords(null)).toBe('Error');
    expect(errorWords(undefined)).toBe('Error');
  });
});

describe('CrashScreen', () => {
  it('downloads the save the game gives and says so', async () => {
    const download = vi.fn();
    render(<CrashScreen error={boom} getSave={() => '{"turn":3}'} fileName="tavern-save.json" download={download} words={{ exportSave: 'Keep my game', exported: 'Kept.' }} />);
    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(screen.getByTestId('crash-error').textContent).toBe('boom');
    expect(screen.queryByTestId('crash-export-state')).toBeNull();
    expect(screen.queryByTestId('crash-retry')).toBeNull();
    expect(screen.getByTestId('crash-export').textContent).toBe('Keep my game');
    await click('crash-export');
    expect(download).toHaveBeenCalledWith('{"turn":3}', 'tavern-save.json');
    expect(screen.getByTestId('crash-export-state').textContent).toBe('Kept.');
  });

  it('waits for a save that comes later, as bytes', async () => {
    const download = vi.fn();
    const bytes = new Uint8Array([1, 2, 3]);
    render(<CrashScreen error={boom} getSave={() => new Promise<SaveData>((r) => setTimeout(() => r(bytes), 5))} download={download} />);
    await click('crash-export');
    await waitFor(() => expect(download).toHaveBeenCalledWith(bytes, 'save.json'), { timeout: 5000 });
    await waitFor(() => expect(state()).toBe('saved'), { timeout: 5000 });
  });

  it('says there is no save when the game has none', async () => {
    const download = vi.fn();
    render(<CrashScreen error={boom} getSave={() => null} download={download} />);
    await click('crash-export');
    expect(download).not.toHaveBeenCalled();
    expect(state()).toBe('none');
    expect(screen.getByTestId('crash-export-state').textContent).toBe('There is no save to download.');
  });

  it.each<[string, () => SaveData | Promise<SaveData>, boolean]>([
    [
      'getSave throws',
      () => {
        throw new Error('store gone');
      },
      false,
    ],
    ['getSave rejects', () => Promise.reject(new Error('disk refused')), false],
    ['the download throws', () => 'data', true],
  ])('stays up and says the export failed when %s; a second try can work', async (_name, getSave, badDownload) => {
    let tries = 0;
    const download = vi.fn(() => {
      if (badDownload && tries === 1) throw new Error('blocked');
    });
    render(<CrashScreen error={boom} getSave={() => (++tries === 1 ? getSave() : 'data')} download={download} />);
    await click('crash-export', 5);
    expect(state()).toBe('failed');
    expect(screen.getByTestId('crash-export-state').textContent).toBe('The save could not be downloaded.');
    expect(screen.getByTestId('crash')).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>('crash-export').disabled).toBe(false);
    await click('crash-export', 5);
    expect(state()).toBe('saved');
    expect(download).toHaveBeenLastCalledWith('data', 'save.json');
  });

  it('keeps the default of a word given as undefined', () => {
    render(<CrashScreen error={boom} words={{ reload: undefined as unknown as string, failed: 'Oh no' }} />);
    expect(screen.getByTestId('crash-reload').textContent).toBe('Reload the page');
    expect(screen.getByRole('alert').textContent).toContain('Oh no');
  });

  it('does nothing more when it is taken down during an export', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const download = vi.fn();
    const { unmount } = render(<CrashScreen error={boom} getSave={() => new Promise<SaveData>((r) => setTimeout(() => r('late'), 10))} download={download} />);
    fireEvent.click(screen.getByTestId('crash-export'));
    unmount();
    await new Promise((r) => setTimeout(r, 40));
    expect(download).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
  });

  it('gives up on a save that never comes', async () => {
    const download = vi.fn();
    render(<CrashScreen error={boom} getSave={() => new Promise<SaveData>(() => undefined)} download={download} timeoutMs={10} />);
    fireEvent.click(screen.getByTestId('crash-export'));
    expect(state()).toBe('busy');
    expect(screen.getByTestId<HTMLButtonElement>('crash-export').disabled).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(state()).toBe('failed');
    expect(download).not.toHaveBeenCalled();
  });

  it('reloads, retries, and has no export button without getSave', () => {
    const reload = vi.fn();
    const retry = vi.fn();
    render(
      <CrashScreen error={boom} reload={reload} retry={retry} words={{ reload: 'Start again' }}>
        <p>extra words</p>
      </CrashScreen>,
    );
    expect(screen.queryByTestId('crash-export')).toBeNull();
    expect(screen.getByText('extra words')).toBeTruthy();
    fireEvent.click(screen.getByText('Start again'));
    expect(reload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('crash-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('is the fallback of the frame', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const download = vi.fn();
    const Broken = (): never => {
      throw new Error('table fell');
    };
    render(<AppFrame routes={{ home: { screen: Broken } }} home="home" fallback={(error, retry) => <CrashScreen error={error} retry={retry} getSave={() => 'save'} download={download} />} />);
    expect(screen.getByTestId('crash-error').textContent).toBe('table fell');
    await click('crash-export');
    expect(download).toHaveBeenCalledWith('save', 'save.json');
  });
});

describe('downloadSave', () => {
  it('clicks a link to the data under the file name and frees the address later', async () => {
    const made: Blob[] = [];
    const freed: string[] = [];
    const u = URL as unknown as { createObjectURL: unknown; revokeObjectURL: unknown };
    const before = [u.createObjectURL, u.revokeObjectURL];
    u.createObjectURL = (b: Blob) => {
      made.push(b);
      return 'blob:made';
    };
    u.revokeObjectURL = (s: string) => freed.push(s);
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(`${this.download} ${this.href}`);
    });
    try {
      downloadSave('abc', 'a.json', 5);
      downloadSave(new Uint8Array([1, 2]), 'b.bin', 5);
      const blob = new Blob(['x']);
      downloadSave(blob, 'c.bin', 5);
      expect(names).toEqual(['a.json blob:made', 'b.bin blob:made', 'c.bin blob:made']);
      expect(made.map((b) => b.size)).toEqual([3, 2, 1]);
      expect(made[2]).toBe(blob);
      expect(freed).toHaveLength(0);
      await new Promise((r) => setTimeout(r, 40));
      expect(freed).toEqual(['blob:made', 'blob:made', 'blob:made']);
    } finally {
      [u.createObjectURL, u.revokeObjectURL] = before;
    }
  });
});
