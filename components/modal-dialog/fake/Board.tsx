import { useState } from 'react';
import { ConfirmDialog, Modal } from '../ui.tsx';

export function Board({ closeOnBackdrop = true }: { closeOnBackdrop?: boolean }) {
  const [open, setOpen] = useState<'details' | 'reset' | null>(null);
  const [moves, setMoves] = useState(3);
  const close = () => setOpen(null);

  return (
    <main>
      <h1>Practice board</h1>
      <p>Moves played: {moves}</p>
      <button type="button" onClick={() => setOpen('details')}>Turn summary</button>{' '}
      <button type="button" onClick={() => setOpen('reset')}>Reset board</button>
      <div className="fake-board" />
      <Modal open={open === 'details'} onClose={close} title="Turn summary"
        closeOnBackdrop={closeOnBackdrop}
        actions={<button type="button" className="kc-modal-button" onClick={close}>Back to board</button>}
      >
        You played {moves} moves this turn.
      </Modal>
      <ConfirmDialog open={open === 'reset'} title="Reset this board?"
        message="All moves played this turn will be cleared." confirmLabel="Reset moves"
        cancelLabel="Keep playing" danger onCancel={close}
        onConfirm={() => { setMoves(0); close(); }}
      />
    </main>
  );
}
