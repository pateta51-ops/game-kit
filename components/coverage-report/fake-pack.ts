import type { CoverageInput } from './index.ts';
export default {
  cards: [{ id: 'a', effect: [{ op: 'gain' }] }, { id: 'b', effect: [{ op: 'warp' }] }, { id: 'c', effect: [] }],
  id: (c: { id: string }) => c.id,
  universe: ['op:gain', 'op:warp', 'op:draw'],
  handlers: ['op:gain'],
} satisfies CoverageInput<{ id: string; effect: { op: string }[] }>;
