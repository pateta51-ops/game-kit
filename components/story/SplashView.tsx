import './story.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { splashAutoCloseMs, type Splash } from './splash.ts';
import { pictureView } from './story.ts';
import { prefersReduced } from './panels.ts';

export type SplashViewProps = { splash: Splash; onClose: () => void; reduced?: boolean; fileExists?: (file: string) => boolean; renderFile?: (file: string) => ReactNode };

// Closes on a tap, any key, or after 4 s; never by itself under reduced motion.
export function SplashView({ splash, onClose, reduced = prefersReduced(), fileExists = () => false, renderFile = (f) => <img src={f} alt="" /> }: SplashViewProps) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const f = () => close.current();
    const ms = splashAutoCloseMs(reduced);
    const t = ms === null ? undefined : setTimeout(f, ms);
    window.addEventListener('keydown', f);
    return () => { if (t) clearTimeout(t); window.removeEventListener('keydown', f); };
  }, [splash, reduced]);
  const v = splash.picture ? pictureView(splash.picture, fileExists) : null;
  return (
    <div className="kit-splash" onClick={onClose}>
      {splash.title && <div className="kit-splash-title">{splash.title}</div>}
      {v && (v.kind === 'file' ? <div className="kit-story-pic">{renderFile(v.file)}</div> : <div className="kit-story-pic kit-story-note">{v.note}</div>)}
      <p className="kit-splash-line">{splash.line.text}</p>
      {splash.note && <p className="kit-splash-note">{splash.note}</p>}
    </div>
  );
}
