import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Modal } from '../../components/modal-dialog/ui.tsx';
import { Sheet } from '../../components/phone-mode/ui.ts';
import { HostStack } from '../../components/card-attachments/ui.ts';
import { useBoardPick } from '../../components/prompt-host/ui.ts';
import { bindPlayKeys, bindPromptKeys } from '../../components/ui-helpers/index.ts';

const prompt = { id: 1, kind: 'move', min: 1, max: 1, options: [{ id: 'card', enabled: true }] };

function Board() {
  const [modal, setModal] = useState(false);
  const [ordered, setOrdered] = useState(false);
  const [native, setNative] = useState<'radio' | 'disclosure' | 'shared-radio' | 'frame' | 'first-frame' | 'ordered-frame' | 'adjacent-frames' | 'scroll' | null>(null);
  const [nested, setNested] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [childOwner, setChildOwner] = useState<'Modal' | 'Sheet' | null>(null);
  const [childKeys, setChildKeys] = useState<string[]>([]);
  const [childCloses, setChildCloses] = useState(0);
  const [ancestorKeys, setAncestorKeys] = useState<string[]>([]);
  const [backgroundKeys, setBackgroundKeys] = useState<string[]>([]);
  const [numbers, setNumbers] = useState(0);
  const [phases, setPhases] = useState(0);
  const [clears, setClears] = useState(0);
  const [answers, setAnswers] = useState(0);
  const [reads, setReads] = useState(0);
  const [childActions, setChildActions] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const pick = useBoardPick(prompt, () => setAnswers((n) => n + 1));
  useEffect(() => {
    const unprompt = bindPromptKeys(document, { open: () => true, panel: () => panel.current,
      clear: () => { setClears((n) => n + 1); return true; } });
    const unplay = bindPlayKeys(document, { panel: () => panel.current,
      board: { e: () => { setPhases((n) => n + 1); return true; } } });
    const background = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') setBackgroundKeys((keys) => [...keys, event.key]);
    };
    document.addEventListener('keydown', background);
    return () => { unprompt(); unplay(); document.removeEventListener('keydown', background); };
  }, []);
  const closeChildOwner = () => { setChildCloses((n) => n + 1); setChildOwner(null); };
  const childControls = <>
    <button>Child fallback</button>
    <button onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); setChildKeys((keys) => [...keys, 'stopped']); }
    }}>Child stops Escape</button>
    <textarea aria-label="Child editor" onKeyDown={(event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        setChildKeys((keys) => [...keys, event.key]);
      }
    }} />
  </>;
  return <>
    <main>
      <h1>Keyboard ownership fixture</h1>
      <div ref={panel}>
        <button data-shortcut="1" onClick={() => setNumbers((n) => n + 1)}>Numbered action</button>
        <button onClick={() => pick.tap('card')}>Arm board pick</button>
      </div>
      <button onClick={() => setModal(true)}>Open modal</button>
      <button tabIndex={2} onClick={() => setOrdered(true)}>Open ordered modal</button>
      <button onClick={() => setNative('radio')}>Open radio modal</button>
      <button onClick={() => setNative('disclosure')}>Open disclosure modal</button>
      <button onClick={() => setNative('shared-radio')}>Open shared radio modal</button>
      <button onClick={() => setNative('frame')}>Open frame modal</button>
      <button onClick={() => setNative('first-frame')}>Open frame-first modal</button>
      <button tabIndex={3} onClick={() => setNative('ordered-frame')}>Open ordered frame modal</button>
      <button onClick={() => setNative('adjacent-frames')}>Open adjacent frames</button>
      <button onClick={() => setNative('scroll')}>Open scrolling modal</button>
      <button onClick={() => setSheet(true)}>Open sheet</button>
      <button onClick={() => setChildOwner('Modal')}>Open child Modal</button>
      <button onClick={() => setChildOwner('Sheet')}>Open child Sheet</button>
      <span data-testid="child-keys">{childKeys.join(',')}</span>
      <span data-testid="child-closes">{childCloses}</span>
      <span data-testid="child-ancestor-keys">{ancestorKeys.join(',')}</span>
      <span data-testid="child-background-keys">{backgroundKeys.join(',')}</span>
      <label>Background choice <input type="radio" name="shared-choice" defaultChecked /></label>
      <details><summary>Board disclosure</summary>Board explanation</details>
      <label>Board note <input aria-label="Board note" /></label>
      <output data-testid="numbers">{numbers}</output>
      <output data-testid="phases">{phases}</output>
      <output data-testid="clears">{clears}</output>
      <output data-testid="answers">{answers}</output>
      <output data-testid="armed">{pick.armed ?? 'none'}</output>
      <output data-testid="reads">{reads}</output>
      <output data-testid="child-actions">{childActions}</output>
      <HostStack host={<strong>Host</strong>} w={120} h={160} mode="fan" fanStep={0.4} ms={0}
        attachments={[{ key: 'read', node: <span>Readable attachment</span> },
          { key: 'child', node: <button onClick={() => setChildActions((n) => n + 1)}>Attachment action</button> },
          { key: 'label', node: <label>Toggle attachment<input type="checkbox" onChange={() => setChildActions((n) => n + 1)} /></label> },
          { key: 'disclosure', node: <details><summary>Attachment details</summary>Details</details> }]}
        onRead={() => setReads((n) => n + 1)} />
    </main>
    {sheet && <Sheet title="Board sheet" slideMs={0} onClose={() => setSheet(false)}>
      <button onClick={() => setModal(true)}>Modal above sheet</button>
      <section role="dialog" aria-modal="false" aria-label="Sheet support"><button>Sheet support action</button></section>
    </Sheet>}
    <Modal open={modal} title="Board decision" speed={0} onClose={() => setModal(false)}
      actions={<button onClick={() => setModal(false)}>Close modal</button>}>
      <fieldset disabled><button data-autofocus>Unavailable fieldset action</button></fieldset>
      <label>Decision note <input aria-label="Decision note" data-autofocus /></label>
      {sheet && <button onClick={() => setSheet(false)}>Dismiss underlying sheet</button>}
      <button hidden>Hidden choice</button><button disabled>Disabled choice</button>
      <button onClick={() => setNested(true)}>Open nested dialog</button>
      <fieldset disabled>
        <legend><button>Legend action</button></legend>
        <legend><button>Unavailable second legend action</button></legend>
      </fieldset>
      <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Editable decision note">Editable note</div>
    </Modal>
    <Modal open={nested} title="Nested decision" speed={0} onClose={() => setNested(false)}>
      <button data-autofocus onClick={() => setNested(false)}>Close nested dialog</button>
    </Modal>
    <Modal open={ordered} title="Ordered decision" speed={0} onClose={() => setOrdered(false)}>
      <h3 data-autofocus tabIndex={-1}>Review introduction</h3>
      <button>Default action</button>
      <button tabIndex={3}>Third priority</button>
      <section role="dialog" aria-modal="false" aria-label="Supporting choices">
        <button tabIndex={1}>First priority</button>
      </section>
    </Modal>
    <Modal open={native !== null} title="Native controls" speed={0} onClose={() => setNative(null)}>
      {native === 'radio' ? <>
        <label>First choice <input type="radio" name="modal-choice" defaultChecked /></label>
        <label>Second choice <input type="radio" name="modal-choice" /></label>
      </> : native === 'shared-radio' ? <>
        <button>Local action</button>
        <label>Local choice <input type="radio" name="shared-choice" /></label>
      </> : native === 'frame' ? <>
        <button>Before frame</button>
        <iframe title="Embedded controls" srcDoc="<button>Frame action</button>" />
      </> : native === 'first-frame' || native === null ? <>
        <iframe title="First focus frame" srcDoc="<button>First focus action</button>" />
        <button>After first focus frame</button>
      </> : native === 'ordered-frame' || native === 'adjacent-frames' ? <>
        <button tabIndex={1}>First frame action</button>
        <iframe tabIndex={2} title="Ranked controls" srcDoc="<button>Frame start</button><button>Frame end</button>" />
        {native === 'adjacent-frames' &&
          <iframe tabIndex={4} title="Next ranked controls" srcDoc="<button>Frame start</button><button>Frame end</button>" />}
        <button>Last frame action</button>
      </> : native === 'scroll' ? <>
        <button tabIndex={1}>First scroll action</button>
        <div style={{ height: 700 }} />
        <button tabIndex={2}>Last scroll action</button>
      </> : <details><summary>Show explanation</summary><button>Hidden action</button></details>}
    </Modal>
    <div onKeyDown={(event) => {
      if (event.key === 'Escape' || event.key === 'Tab') setAncestorKeys((keys) => [...keys, event.key]);
    }}>
      <Modal open={childOwner === 'Modal'} title="Modal child keys" speed={0} onClose={closeChildOwner}>
        {childControls}
      </Modal>
      {childOwner === 'Sheet' && <Sheet title="Sheet child keys" slideMs={0} onClose={closeChildOwner}>
        {childControls}
      </Sheet>}
    </div>
  </>;
}

const root = document.createElement('div');
document.body.append(root);
createRoot(root).render(<Board />);
