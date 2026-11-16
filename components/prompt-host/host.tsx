// K123: the screen piece that shows the engine's open question. Base: Rome src/ui/prompts/PromptHost.tsx and parts.tsx
// (a Record over the prompt kind, one component per kind; rule ids stripped before a widget sees text; option buttons that
// show why when barred; the multi-pick with a count and Done; the amount stepper). Grafts: STCC src/ui/prompts/OrderPrompt.tsx
// (order by clicks, the rest follow in the engine's order), Jarl src/ui/prompts/autoAnswer.ts (`auto`). Unstyled: class
// names come from `look.cls`, words and card faces from `look.label`.
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { seatKey, type KernelOption, type KernelPrompt } from '../engine-core/index.ts';
import type { PromptSource } from '../prompt-source/index.ts';
import { defaultLook } from './look.ts';
import { warnLook } from './lookCheck.ts';

export type Kinded = KernelPrompt & { readonly kind: string; readonly source?: PromptSource };
/** `promptId`: the prompt the picks answer (the host always sends it); a store drops an answer whose prompt is no longer open. */
export type Answer = (picks: readonly string[], promptId?: number) => void;

/** How widgets draw: the game's class names and words. Every field has an unstyled default (`defaultLook`). */
export interface Look<P extends Kinded = Kinded> {
  cls(part: string): string;
  /** An option's face: its words, or a card face (render prop). Default: the option id. */
  label(o: KernelOption, p: P): ReactNode;
  /** Text from the engine (`why`, `idle`) before it is drawn: pass plain-text's `ids.strip` so rule ids never show. */
  text(s: string): string;
  count(n: number, p: P): ReactNode;
  readonly done: ReactNode;
  readonly less: ReactNode;
  readonly more: ReactNode;
  readonly confirm: ReactNode;
  readonly cancel: ReactNode;
}

export interface WidgetProps<P extends Kinded, V> {
  readonly prompt: P;
  /** The player's own view (never the full state): what an opponent may see is all a widget gets. */
  readonly view: V;
  readonly answer: Answer;
  readonly look: Look<P>;
}

/** One widget per prompt kind: a kind with no widget (or a widget for no kind) fails to compile. */
export type Widgets<P extends Kinded, V> = { readonly [K in P['kind']]: ComponentType<WidgetProps<PromptOf<P, K>, V>> };

/** The prompt of one kind: that member of a union, else the prompt type with its kind narrowed. */
export type PromptOf<P extends Kinded, K extends P['kind']> = [Extract<P, { readonly kind: K }>] extends [never] ? P & { readonly kind: K } : Extract<P, { readonly kind: K }>;

export interface HostProps<P extends Kinded, V> {
  readonly widgets: Widgets<P, V>;
  /** The open prompt of the player's own view, or null. */
  readonly prompt: P | null;
  readonly view: V;
  readonly answer: Answer;
  /** False when the open prompt is another seat's: `waiting` shows and no option does. */
  readonly mine?: boolean;
  /** K222: this screen's seat; with no `mine`, the prompt is mine when its `seat` is unset or equal (`seatKey`: 0 and '0' are one seat). */
  readonly seat?: string | number;
  readonly waiting?: ReactNode;
  /** The picks to send without asking (e.g. `(p) => autoAnswer(p, setting, NEVER)`), or null to ask. */
  readonly auto?: (p: P) => readonly string[] | null;
  /** The question's words. Default: the source's printed clause when a card asks (prompt-source), else nothing. */
  readonly title?: (p: P) => ReactNode;
  readonly look?: Partial<Look<P>>;
}

export function PromptHost<P extends Kinded, V>({ widgets, prompt, view, answer, seat, mine = seat === undefined || prompt?.seat === undefined || seatKey(prompt.seat) === seatKey(seat), waiting = null, auto, title, look: part }: HostProps<P, V>) {
  const look = { ...(defaultLook as Look<P>), ...part };
  warnLook(part);
  const id = prompt?.id ?? null;
  const open = useRef(id);
  const sent = useRef<number | null>(null);
  const [tried, setTried] = useState<number | null>(null);
  const picks = prompt !== null && mine && tried !== prompt.id ? (auto?.(prompt) ?? null) : null;
  useEffect(() => {
    open.current = id;
    if (id === null || picks === null) return;
    if (sent.current !== id) {
      sent.current = id;
      answer(picks, id);
    }
    // a refused or dropped auto-answer: the prompt is still open after it, so the widget shows
    queueMicrotask(() => setTried(id));
  }, [id, picks, answer]);
  if (prompt === null || picks !== null) return null;
  if (!mine) return <>{waiting}</>;
  const W = widgets[prompt.kind as P['kind']] as ComponentType<WidgetProps<P, V>>;
  const head = title ? title(prompt) : prompt.source?.card !== undefined ? look.text(prompt.source.clause) : null;
  const send: Answer = (p) => {
    if (open.current === prompt.id) answer(p, prompt.id);
  };
  return (
    <section className={look.cls('host')} data-testid="prompt" data-kind={prompt.kind}>
      {head === null || head === '' ? null : <h2 className={look.cls('title')}>{head}</h2>}
      <W key={prompt.id} prompt={prompt} view={view} answer={send} look={look} />
    </section>
  );
}

// K226: keys 1-9 for ui-helpers bindPromptKeys; picked-state's data-picked (nothing before the first pick)
const key = (i: number): number | undefined => (i < 9 ? i + 1 : undefined);
const mark = (picks: readonly string[], id: string): 'picked' | 'unpicked' | undefined => (picks.length === 0 ? undefined : picks.includes(id) ? 'picked' : 'unpicked');

/** One option as a button: barred ones stay, say why and never answer; a legal one that does nothing warns (K91 `idle`). */
export function OptionButton<P extends Kinded>({ option: o, prompt, look, onPick, pressed, mark, picked, shortcut }: { option: KernelOption; prompt: P; look: Look<P>; onPick: () => void; pressed?: boolean; mark?: ReactNode; picked?: 'picked' | 'unpicked' | undefined; shortcut?: number | undefined }) {
  return (
    <button
      type="button"
      className={look.cls('option')}
      data-option={o.id}
      aria-disabled={o.enabled ? undefined : 'true'}
      aria-pressed={pressed}
      data-picked={picked}
      data-shortcut={shortcut}
      onClick={() => {
        if (o.enabled) onPick();
      }}
    >
      {mark === undefined ? null : <b className={look.cls('mark')}>{mark}</b>}
      {look.label(o, prompt)}
      {!o.enabled && o.why !== undefined ? <small className={look.cls('why')}>{look.text(o.why)}</small> : null}
      {o.enabled && o.idle !== undefined ? <small className={look.cls('idle')}>{look.text(o.idle)}</small> : null}
    </button>
  );
}

/** Every option a button; a click answers with it. As `May` (yes / no) and `PayCost` (one option per way to pay). */
export function OptionList<P extends Kinded, V>({ prompt, answer, look, part = 'list' }: WidgetProps<P, V> & { part?: string }) {
  return (
    <div className={look.cls(part)}>
      {prompt.options.map((o, i) => (
        <OptionButton key={o.id} option={o} prompt={prompt} look={look} shortcut={key(i)} onPick={() => answer([o.id])} />
      ))}
    </div>
  );
}

export const May = <P extends Kinded, V>(p: WidgetProps<P, V>) => <OptionList {...p} part="may" />;
export const PayCost = <P extends Kinded, V>(p: WidgetProps<P, V>) => <OptionList {...p} part="pay" />;

/** Pick cards (or any options), min..max: options toggle, the count shows, Done answers. min = max = 1 answers on the click unless `confirm`. */
export function PickOptions<P extends Kinded, V>({ prompt, answer, look, confirm = false }: WidgetProps<P, V> & { confirm?: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const one = prompt.min === 1 && prompt.max === 1 && !confirm;
  const toggle = (id: string): void => {
    if (one) answer([id]);
    else if (picked.includes(id)) setPicked(picked.filter((p) => p !== id));
    else if (picked.length < prompt.max) setPicked([...picked, id]);
    else if (prompt.max === 1) setPicked([id]);
  };
  const ready = picked.length >= prompt.min && picked.length <= prompt.max;
  return (
    <div className={look.cls('pick')}>
      {prompt.options.map((o, i) => (
        <OptionButton key={o.id} option={o} prompt={prompt} look={look} pressed={picked.includes(o.id)} picked={mark(picked, o.id)} shortcut={key(i)} onPick={() => toggle(o.id)} />
      ))}
      {one ? null : (
        <>
          <span className={look.cls('count')}>{look.count(picked.length, prompt)}</span>
          <button type="button" className={look.cls('done')} disabled={!ready} onClick={() => answer(picked)}>
            {look.done}
          </button>
        </>
      )}
    </div>
  );
}

/** Pick an amount: the options are the amounts in order; a stepper over them (from `start`, default the first), then Done. */
export function PickAmount<P extends Kinded, V>({ prompt, answer, look, start = 0 }: WidgetProps<P, V> & { start?: number | 'last' }) {
  const n = prompt.options.length;
  const [at, setAt] = useState(start === 'last' ? n - 1 : start);
  const o = prompt.options[at];
  return (
    <div className={look.cls('amount')}>
      <button type="button" className={look.cls('less')} disabled={at <= 0} onClick={() => setAt(at - 1)}>
        {look.less}
      </button>
      <span className={look.cls('value')} data-option={o?.id}>
        {o === undefined ? null : look.label(o, prompt)}
      </span>
      <button type="button" className={look.cls('more')} disabled={at >= n - 1} onClick={() => setAt(at + 1)}>
        {look.more}
      </button>
      <button type="button" className={look.cls('done')} disabled={o?.enabled !== true} onClick={() => o !== undefined && answer([o.id])}>
        {look.done}
      </button>
      {o !== undefined && !o.enabled && o.why !== undefined ? <small className={look.cls('why')}>{look.text(o.why)}</small> : null}
    </div>
  );
}

/** Order: click the options in order (the first click is first); a click on a numbered one takes it and those after it back.
 * The ones not clicked follow in the engine's order; Done answers the whole order. */
export function Order<P extends Kinded, V>({ prompt, answer, look }: WidgetProps<P, V>) {
  const [clicked, setClicked] = useState<string[]>([]);
  const ids = prompt.options.filter((o) => o.enabled).map((o) => o.id);
  // all legal options fit: the ones not clicked follow in the engine's order; else the answer is the clicks alone
  const order = ids.length <= prompt.max ? [...clicked, ...ids.filter((id) => !clicked.includes(id))] : clicked;
  const ready = order.length >= prompt.min && order.length <= prompt.max;
  return (
    <div className={look.cls('order')}>
      {prompt.options.map((o, i) => {
        const at = clicked.indexOf(o.id);
        return (
          <OptionButton
            key={o.id}
            option={o}
            prompt={prompt}
            look={look}
            pressed={at >= 0}
            picked={mark(clicked, o.id)}
            shortcut={key(i)}
            mark={at >= 0 ? at + 1 : undefined}
            onPick={() => {
              if (at >= 0) setClicked(clicked.slice(0, at));
              else if (clicked.length < prompt.max) setClicked([...clicked, o.id]);
            }}
          />
        );
      })}
      <button type="button" className={look.cls('done')} disabled={!ready} onClick={() => answer(order)}>
        {look.done}
      </button>
    </div>
  );
}
