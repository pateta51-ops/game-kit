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
  const [nested, setNested] = useState(false);
  const [sheet, setSheet] = useState(false);
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
    return () => { unprompt(); unplay(); };
  }, []);
  return <>
    <main>
      <h1>Keyboard ownership fixture</h1>
      <div ref={panel}>
        <button data-shortcut="1" onClick={() => setNumbers((n) => n + 1)}>Numbered action</button>
        <button onClick={() => pick.tap('card')}>Arm board pick</button>
      </div>
      <button onClick={() => setModal(true)}>Open modal</button>
      <button tabIndex={2} onClick={() => setOrdered(true)}>Open ordered modal</button>
      <button onClick={() => setSheet(true)}>Open sheet</button>
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
          { key: 'label', node: <label>Toggle attachment<input type="checkbox" onChange={() => setChildActions((n) => n + 1)} /></label> }]}
        onRead={() => setReads((n) => n + 1)} />
    </main>
    {sheet && <Sheet title="Board sheet" slideMs={0} onClose={() => setSheet(false)}>
      <button onClick={() => setModal(true)}>Modal above sheet</button>
    </Sheet>}
    <Modal open={modal} title="Board decision" speed={0} onClose={() => setModal(false)}
      actions={<button onClick={() => setModal(false)}>Close modal</button>}>
      <fieldset disabled><button data-autofocus>Unavailable fieldset action</button></fieldset>
      <label>Decision note <input aria-label="Decision note" data-autofocus /></label>
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
  </>;
}

const root = document.createElement('div');
document.body.append(root);
createRoot(root).render(<Board />);
