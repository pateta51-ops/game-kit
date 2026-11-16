import './story.css';
import type { ReactNode } from 'react';
import { pictureView, sheetView, type Story } from './story.ts';

export type StorySheetProps = {
  story: Story;
  scenarioId: string;
  reached: readonly string[];
  inPlay: readonly string[];
  fileExists?: (file: string) => boolean;
  renderFile?: (file: string) => ReactNode;
};

export function StorySheet({ story, scenarioId, reached, inPlay, fileExists = () => false, renderFile = (f) => <img src={f} alt="" /> }: StorySheetProps) {
  return (
    <div className="kit-story">
      {sheetView(story, scenarioId, reached, inPlay).map((p) => (
        <section key={p.id} className="kit-story-part" data-part={p.id}>
          {p.title && <h3 className="kit-story-title">{p.title}</h3>}
          {p.beats.map((b, i) => (
            <div key={b.id ?? i} className="kit-story-beat">
              {b.picture && (() => {
                const v = pictureView(b.picture, fileExists);
                return v.kind === 'file' ? <div className="kit-story-pic">{renderFile(v.file)}</div> : <div className="kit-story-pic kit-story-note">{v.note}</div>;
              })()}
              {b.lines.map((l, j) => (
                <p key={j} className={l.speaker === 'narrator' ? 'kit-story-line kit-story-narrator' : 'kit-story-line'}>
                  {l.name && <b className="kit-story-name">{l.name}</b>}
                  {l.text}
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
