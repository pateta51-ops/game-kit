import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { COLORS, drawMarkup, displayPoint, type Markup, type Point } from './model.ts';
import './markup.css';

interface Props {
  original: string;
  items: Markup[];
  onChange: (items: Markup[]) => void;
  onClose: () => void;
  past: Markup[][];
  future: Markup[][];
  setPast: (past: Markup[][]) => void;
  setFuture: (future: Markup[][]) => void;
}

/** Portable screenshot editor: React and the markup model are its only dependencies. */
export function MarkupEditor({
  original,
  items,
  onChange,
  onClose,
  past,
  future,
  setPast,
  setFuture,
}: Props) {
  const [tool, setTool] = useState<Markup['tool']>('pen');
  const [color, setColor] = useState<Markup['color']>(COLORS[0]!);
  const [width, setWidth] = useState(0.003);
  const [note, setNote] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const loaded = useRef(false);
  const [display, setDisplay] = useState({ w: 1, h: 1 });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    done.current?.focus();
    return () => opener?.focus();
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setDisplay({ w: Math.max(1, Math.round(rect.width)), h: Math.max(1, Math.round(rect.height)) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const [draft, setDraft] = useState<Markup | null>(null);
  const active = useRef<{ id: number; item: Markup } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, display.w, display.h);
    drawMarkup(ctx, draft ? [...items, draft] : items, display.w, display.h);
  }, [items, draft, display]);
  const commit = (next: Markup[]) => {
    setPast([...past, items]);
    setFuture([]);
    onChange(next);
  };
  const point = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return displayPoint(event.clientX, event.clientY, rect);
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    const drawing = active.current;
    if (!drawing || drawing.id !== event.pointerId) return;
    const p = point(event);
    if (drawing.item.tool === 'pen') {
      if (drawing.item.points.length < 20000) drawing.item.points.push(p);
    } else drawing.item.points = [drawing.item.points[0]!, p];
    // The active path is private until commit; append in place without copying the path.
    setDraft({ ...drawing.item });
  };
  return (
    <div
      ref={dialog}
      className="markup"
      data-no-capture=""
      role="dialog"
      aria-modal="true"
      aria-label="Mark up screenshot"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Tab') {
          const controls = dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), select, input, [tabindex="0"]',
          );
          const first = controls?.[0],
            last = controls?.[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="markup__tools">
        <strong>Mark up screenshot</strong>
        {(['pen', 'box', 'arrow', 'pin'] as const).map((value) => (
          <button
            type="button"
            className="btn"
            data-testid={`markup-${value}`}
            aria-pressed={tool === value}
            key={value}
            onClick={() => setTool(value)}
          >
            {value === 'pin' ? 'Numbered pin' : value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
        <label>
          Colour{' '}
          <select
            aria-label="Markup colour"
            value={color}
            onChange={(event) => setColor(event.target.value as Markup['color'])}
          >
            {COLORS.map((value, i) => (
              <option key={value} value={value}>
                {['Pink', 'Yellow', 'Cyan', 'Lime'][i]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stroke{' '}
          <select
            aria-label="Stroke width"
            value={width}
            onChange={(event) => setWidth(Number(event.target.value))}
          >
            <option value={0.0015}>Fine</option>
            <option value={0.003}>Medium</option>
            <option value={0.006}>Thick</option>
          </select>
        </label>
        <button
          type="button"
          className="btn"
          disabled={!past.length}
          onClick={() => {
            const previous = past.at(-1)!;
            setPast(past.slice(0, -1));
            setFuture([...future, items]);
            onChange(previous);
          }}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn"
          disabled={!future.length}
          onClick={() => {
            const next = future.at(-1)!;
            setFuture(future.slice(0, -1));
            setPast([...past, items]);
            onChange(next);
          }}
        >
          Redo
        </button>
        <button type="button" className="btn" disabled={!items.length} onClick={() => commit([])}>
          Clear
        </button>
        <button ref={done} type="button" className="btn" data-testid="markup-done" onClick={onClose}>
          Done
        </button>
        {tool === 'pin' && (
          <label className="markup__note">
            Pin note{' '}
            <input
              aria-label="Pin note"
              maxLength={80}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Short note for the next pin"
            />
          </label>
        )}
      </div>
      <div className="markup__workspace">
        <div
          className="markup__image"
          style={{
            aspectRatio: `${size.w} / ${size.h}`,
            width: `min(100cqw, ${String((100 * size.w) / size.h)}cqh)`,
          }}
        >
          <img
            alt="Original screenshot"
            src={`data:image/png;base64,${original}`}
            onLoad={(event) => {
              loaded.current = true;
              setSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
            }}
          />
          <canvas
            ref={canvas}
            width={display.w}
            height={display.h}
            tabIndex={0}
            data-testid="markup-canvas"
            onPointerDown={(event) => {
              if (
                !loaded.current ||
                items.length >= 200 ||
                active.current ||
                (event.pointerType === 'mouse' && event.button !== 0)
              )
                return;
              event.currentTarget.setPointerCapture(event.pointerId);
              const item: Markup = {
                tool,
                color,
                width: Math.min(0.05, Math.max(width, (width * 1000) / size.w)),
                note: tool === 'pin' ? note : '',
                points: [point(event)],
              };
              active.current = { id: event.pointerId, item };
              setDraft(item);
            }}
            onPointerMove={move}
            onPointerUp={(event) => {
              if (active.current?.id !== event.pointerId) return;
              if (tool !== 'pin') move(event);
              const item = active.current.item;
              const first = item.points[0]!,
                last = item.points.at(-1)!;
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                item.tool === 'pen' ||
                item.tool === 'pin' ||
                Math.hypot((last.x - first.x) * rect.width, (last.y - first.y) * rect.height) >= 2
              )
                commit([...items, item]);
              active.current = null;
              setDraft(null);
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              active.current = null;
              setDraft(null);
            }}
            onLostPointerCapture={() => {
              active.current = null;
              setDraft(null);
            }}
          />
        </div>
      </div>
    </div>
  );
}
