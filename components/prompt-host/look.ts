import type { Look } from './host.tsx';

export const defaultLook: Look = {
  cls: (part) => `kp-${part}`,
  label: (o) => o.id,
  text: (s) => s,
  count: (n, p) => `${String(n)} / ${p.min === p.max ? String(p.min) : `${String(p.min)}-${String(p.max)}`}`,
  done: 'Done',
  less: '-',
  more: '+',
  confirm: 'Confirm',
  cancel: 'Cancel',
};
