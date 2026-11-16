// Optional entry: axe on the page as it is now. The game passes its own `AxeBuilder` (default export of `@axe-core/playwright`),
// so a game that does not test accessibility never installs or loads axe.
import { finishAnimations, type EvalPage, type Info } from './index';

export interface Violation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}
export type Axe<P> = new (options: { page: P }) => { withTags(tags: string[]): { analyze(): Promise<{ violations: Violation[] }> } };

export const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Finishes the animations first (a card still fading in reads lighter than it is), fails on a serious or critical violation,
// attaches the rest to the report.
export async function expectAccessible<P extends EvalPage>(Builder: Axe<P>, page: P, testInfo: Info, where: string, tags: string[] = WCAG_AA): Promise<void> {
  await finishAnimations(page);
  const { violations } = await new Builder({ page }).withTags(tags).analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const rest = violations.filter((v) => !bad.includes(v));
  if (rest.length) await testInfo.attach(`axe-minor-${where}`, { body: JSON.stringify(rest, null, 2), contentType: 'application/json' });
  if (bad.length)
    throw new Error(
      `axe on ${where}:\n${bad
        .map(
          (v) =>
            `${v.id} (${String(v.impact)}): ${v.help}\n${v.nodes
              .slice(0, 5)
              .map((n) => `  ${n.target.join(' ')}: ${n.failureSummary ?? ''}`)
              .join('\n')}`,
        )
        .join('\n')}`,
    );
}
