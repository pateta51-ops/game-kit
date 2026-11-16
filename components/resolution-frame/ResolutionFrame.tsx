// The PC's top page under a Resolution setting: the game in a same-origin <iframe> of the chosen size, scaled to fit the
// window and centred. The route (#/…) and title follow the game; a change of the setting inside the game (the storage
// event) resizes the frame at once. 'window' fills the window unscaled.
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { resolutionSize, type SettingsSchema } from '../settings/schema.ts';
import { fitBox, storedResolution } from './resolution.ts';
import './frame.css';

function useWindowSize(): { w: number; h: number } {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = (): void => {
      setSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('resize', on);
    };
  }, []);
  return size;
}

export function ResolutionFrame({ schema, settingKey, title, children }: { schema: SettingsSchema; settingKey: string; title: string; children?: ReactNode }): ReactElement {
  const [res, setRes] = useState(() => storedResolution(schema, settingKey));
  const win = useWindowSize();
  const ref = useRef<HTMLIFrameElement>(null);
  const [src] = useState(() => `${window.location.pathname}${window.location.search}${window.location.hash}`);

  useEffect(() => {
    const on = (e: StorageEvent): void => {
      if (e.key === null || e.key === schema.storageKey) setRes(storedResolution(schema, settingKey));
    };
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('storage', on);
    };
  }, [schema, settingKey]);

  useEffect(() => {
    const frame = ref.current;
    if (frame === null) return;
    let inner: Window | null = null;
    const titles = new MutationObserver(() => {
      follow();
    });
    const follow = (): void => {
      if (inner === null) return;
      const hash = inner.location.hash;
      if (hash !== window.location.hash) {
        window.history.replaceState(null, '', hash === '' ? `${window.location.pathname}${window.location.search}` : hash);
      }
      if (inner.document.title !== '') document.title = inner.document.title;
    };
    const onLoad = (): void => {
      inner?.removeEventListener('hashchange', follow);
      titles.disconnect();
      inner = frame.contentWindow;
      if (inner === null) return;
      titles.observe(inner.document, { subtree: true, childList: true, characterData: true });
      inner.addEventListener('hashchange', follow);
      follow();
      inner.focus();
    };
    const onOuterHash = (): void => {
      if (inner !== null && inner.location.hash !== window.location.hash) inner.location.hash = window.location.hash;
    };
    // keys always reach the game: a click on the surround or a return to the tab hands focus back
    const refocus = (): void => {
      inner?.focus();
    };
    frame.addEventListener('load', onLoad);
    window.addEventListener('hashchange', onOuterHash);
    window.addEventListener('focus', refocus);
    document.addEventListener('pointerdown', refocus);
    return () => {
      titles.disconnect();
      window.removeEventListener('focus', refocus);
      document.removeEventListener('pointerdown', refocus);
      frame.removeEventListener('load', onLoad);
      window.removeEventListener('hashchange', onOuterHash);
      inner?.removeEventListener('hashchange', follow);
    };
  }, []);

  const size = resolutionSize(res);
  let style = { width: '100%', height: '100%', transform: 'none' };
  if (size !== null) {
    const box = fitBox(size, win);
    style = {
      width: `${String(size.w)}px`,
      height: `${String(size.h)}px`,
      transform: `translate(${String(box.left)}px, ${String(box.top)}px) scale(${String(box.scale)})`,
    };
  }
  return (
    <div className="kit-res-host" data-testid="resolution-frame" data-resolution={res}>
      <iframe ref={ref} title={title} src={src} className="kit-res-frame" style={style} />
      {children === undefined ? null : <div className="kit-res-over">{children}</div>}
    </div>
  );
}
