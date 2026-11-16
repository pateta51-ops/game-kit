// K100: a console line for debug edits. The game sends the action through its store (so it is recorded like an answer).
import { useState } from 'react';
import type { DebugAction } from '../engine-core/index.ts';
import { parseDebug, type DebugParams } from './parse.ts';
import './debug.css';

export interface DebugConsoleProps {
  /** `debugVerbs(game)`. */
  verbs: readonly string[];
  params?: DebugParams;
  /** Applies the edit; returns the refusal words (the IllegalActionError message), or nothing when done. */
  send: (action: DebugAction) => string | undefined;
  className?: string;
}

/** One input; Enter parses and sends; the last lines and refusals above it; Up recalls the last command. */
export function DebugConsole({ verbs, params, send, className }: DebugConsoleProps) {
  const [text, setText] = useState('');
  const [lines, setLines] = useState<{ text: string; error: boolean }[]>([]);
  const enter = () => {
    const a = parseDebug(text, verbs, params);
    const why = 'error' in a ? a.error : send(a);
    setLines((l) => [...l.slice(-49), { text, error: false }, ...(why === undefined ? [] : [{ text: why, error: true }])]);
    if (why === undefined) setText('');
  };
  return (
    <div className={className ? `kit-dbg ${className}` : 'kit-dbg'} data-testid="debug-console">
      <ul className="kit-dbg-lines">
        {lines.map((l, i) => (
          <li key={i} className={l.error ? 'kit-dbg-error' : undefined}>{l.error ? l.text : `> ${l.text}`}</li>
        ))}
      </ul>
      <input
        aria-label="Debug command"
        placeholder={verbs.map((v) => `/${v}`).join(' ')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') enter();
          else if (e.key === 'ArrowUp') setText([...lines].reverse().find((l) => !l.error)?.text ?? text);
        }}
      />
    </div>
  );
}
