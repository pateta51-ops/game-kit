// An end-to-end helper: plays a script through the game's screen (a Playwright page, or anything with the two calls),
// waiting for each step on the panel's `data-step`, pressing the panel's Next on Next and auto steps, and handing a
// move step to the game's own `answer` (how its controls are pressed is the game's).
import type { TutorialScript, TutorialStep } from './script.ts';
import { PANEL_WORDS } from './words.ts';

/** The two Playwright `Page` calls the helper uses. */
export interface TutorialPage {
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  click(selector: string, options?: { timeout?: number }): Promise<void>;
}

export interface TutorialE2E<P extends TutorialPage> {
  /** Press the controls that give the step's answer (the script's refs, as `do.choose`). */
  readonly answer: (page: P, choose: readonly string[], step: TutorialStep, stepNo: number) => Promise<void>;
  /** Before a step is answered, e.g. a screenshot (1-based `stepNo`). */
  readonly before?: (page: P, step: TutorialStep, stepNo: number) => Promise<void>;
  /** Wait for each step this long (default 30 s: the table may play paced steps first). */
  readonly timeout?: number;
  /** The panel's words after the last step (default `PANEL_WORDS.over`); false skips the check. */
  readonly over?: string | false;
  /** Start at this step (1-based, default 1), e.g. a resumed game. */
  readonly from?: number;
}

export const PANEL = '[data-tutorial-panel]';
export const stepSelector = (stepNo: number): string => `${PANEL}[data-step="${String(stepNo)}"]`;
export const NEXT = `${PANEL} [data-tutorial-next]`;

export async function playTutorialE2E<P extends TutorialPage>(page: P, script: TutorialScript, o: TutorialE2E<P>): Promise<void> {
  const timeout = o.timeout ?? 30_000;
  for (const [i, step] of script.steps.entries()) {
    if (i + 1 < (o.from ?? 1)) continue;
    await page.waitForSelector(stepSelector(i + 1), { timeout });
    await o.before?.(page, step, i + 1);
    if (step.do.kind === 'move') await o.answer(page, step.do.choose, step, i + 1);
    else await page.click(NEXT, { timeout });
  }
  const over = o.over ?? PANEL_WORDS.over;
  if (over !== false) await page.waitForSelector(`${PANEL} >> text=${over}`, { timeout });
}
