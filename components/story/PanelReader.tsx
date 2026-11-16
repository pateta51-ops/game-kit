import './story.css';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { camera, beatsFor, keyAction, prefersReduced, moveMs, readerStart, readerStep, type Aspect, type PanelSheet, type ReaderAction, type Size } from './panels';
import { pictureView, speakerName, type Story } from './story';

export type PanelReaderProps = {
  sheet: PanelSheet;
  area: Size;
  aspect?: Aspect;
  story?: Story;
  reduced?: boolean;
  fileExists?: (file: string) => boolean;
  renderFile?: (file: string) => ReactNode;
  onDone: () => void;
  labels?: { next: string; back: string; skip: string };
};

export function PanelReader({ sheet, area, aspect = 'wide', story, reduced = prefersReduced(), fileExists = () => false, renderFile = (f) => <img src={f} alt="" />, onDone, labels = { next: 'Next', back: 'Back', skip: 'Skip' } }: PanelReaderProps) {
  const beats = beatsFor(sheet.beats, aspect);
  const [r, setR] = useState(readerStart);
  const act = (a: ReaderAction) => setR((x) => readerStep(x, beats.length, a));
  const actRef = useRef(act), doneRef = useRef(onDone);
  useEffect(() => { actRef.current = act; doneRef.current = onDone; });
  useEffect(() => { if (r.done) doneRef.current(); }, [r.done]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { const a = keyAction(e.key); if (a) actRef.current(a); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const beat = beats[r.i];
  if (!beat) return null;
  const c = camera(beat, area, sheet.picture);
  const v = pictureView(sheet.picture, fileExists);
  const ms = moveMs(reduced);
  return (
    <div className="kit-panel" data-beat={r.i} onClick={() => act('next')}>
      <div className="kit-panel-view" style={{ width: area.w, height: area.h }}>
        <div className="kit-panel-page" style={{ width: sheet.picture.w, height: sheet.picture.h, transformOrigin: '0 0', transform: `translate(${c.tx}px, ${c.ty}px) scale(${c.scale})`, transition: ms ? `transform ${ms}ms ease` : 'none' }}>
          {v.kind === 'file' ? renderFile(v.file) : <div className="kit-story-note">{v.note}</div>}
        </div>
      </div>
      {beat.caption && <div className="kit-panel-caption">{beat.caption}</div>}
      {beat.lines?.map((l, j) => <p key={j} className="kit-panel-line">{l.speaker && story ? <b className="kit-story-name">{speakerName(story, l.speaker)}</b> : null}{l.text}</p>)}
      {beat.sfx && <div className="kit-panel-sfx">{beat.sfx}</div>}
      {sheet.credit && <div className="kit-panel-credit">{sheet.credit}</div>}
      <div className="kit-panel-bar" onClick={(e) => e.stopPropagation()}>
        <button className="kit-panel-back" disabled={r.i === 0} onClick={() => act('back')}>{labels.back}</button>
        <button className="kit-panel-skip" onClick={() => act('skip')}>{labels.skip}</button>
        <button className="kit-panel-next" onClick={() => act('next')}>{labels.next}</button>
      </div>
    </div>
  );
}
