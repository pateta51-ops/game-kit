import { afterEach, describe, expect, it, vi } from 'vitest';
import { bugConfig } from './config';
import * as index from './index';
import * as ui from './ui';
import './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('entry files', () => {
  it('index and ui export what a game imports', () => {
    for (const name of ['configureBugReporter', 'collectReport', 'queueText', 'useQueue', 'readToken', 'useToken', 'useBugDialog', 'openBugReport', 'sendAllQueued'])
      expect(index, name).toHaveProperty(name);
    for (const name of ['BugReportHost', 'FloatingBugButton', 'BugSettings', 'QueueBar', 'BugButton']) expect(ui, name).toHaveProperty(name);
  });
});

describe('token storage is read on first use', () => {
  it('importing reads no storage and needs no configuration; the first use sees a token stored since', async () => {
    vi.resetModules();
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const token = await import('./token');
    expect(get).not.toHaveBeenCalled();
    expect(() => token.useToken.getState()).toThrow('configureBugReporter was not called.');
    (await import('./config')).configureBugReporter({ ...bugConfig(), id: 'lazy' });
    window.localStorage.setItem('lazy:github-token:v1', 'stored');
    expect(token.useToken.getState().has).toBe(true);
    token.useToken.getState().forget();
    expect(token.useToken.getState().has).toBe(false);
    expect(window.localStorage.getItem('lazy:github-token:v1')).toBeNull();
  });

  const KEY = 'lazy:github-token:v1';
  const fresh = async () => {
    const config = bugConfig();
    vi.resetModules();
    (await import('./config')).configureBugReporter({ ...config, id: 'lazy' });
    return (await import('./token')).useToken;
  };

  it('the hook, used first, sees a token already in storage, without notifying anyone', async () => {
    window.localStorage.setItem(KEY, 'stored');
    const useToken = await fresh();
    const { renderHook } = await import('@testing-library/react');
    const error = vi.spyOn(console, 'error');
    expect(renderHook(() => useToken((s) => s.has)).result.current).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it('the hook, used first with no token, says none', async () => {
    const useToken = await fresh();
    const { renderHook } = await import('@testing-library/react');
    expect(renderHook(() => useToken((s) => s.has)).result.current).toBe(false);
  });

  it('subscribe, used first, does the first read: the listener is not told about it, and hears later changes', async () => {
    window.localStorage.setItem(KEY, 'stored');
    const useToken = await fresh();
    const heard: boolean[] = [];
    const stop = useToken.subscribe((s) => heard.push(s.has));
    expect(heard).toEqual([]);
    expect(useToken.getState().has).toBe(true);
    useToken.getState().forget();
    expect(heard).toEqual([false]);
    stop();
  });

  it('setState before the first read is not overwritten by it', async () => {
    const useToken = await fresh();
    useToken.setState({ has: true });
    expect(useToken.getState().has).toBe(true);
    window.localStorage.setItem(KEY, 'stored');
    const other = await fresh();
    other.setState({ has: false });
    expect(other.getState().has).toBe(false);
  });

  it('save before the first read keeps the token', async () => {
    const useToken = await fresh();
    expect(useToken.getState().save('typed')).toBe(true);
    expect(useToken.getState().has).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('typed');
  });
});
