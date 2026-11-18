export { REPEATS, SLOWEST, distribution, expectBudgets, formatReport, measure, overBudget, percentile, reportOf, timeGame, type Budgets, type Distribution, type PerfGame, type PerfReport, type Sample, type TimeOptions } from './perf.ts';
export { run, type PerfModule } from './cli.ts';
export { OBSERVE, capture, compare, flatten, formatComparison, isExact, stat, type CaptureOptions, type Change, type CompareOptions, type Comparison, type LoadRun, type PerfCapture, type PerfPage, type Stat } from './capture.ts';
export { runCapture, type CaptureConfig } from './capture-cli.ts';
export { run as runCompare } from './compare-cli.ts';
