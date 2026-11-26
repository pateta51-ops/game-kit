import { hiddenAcceptance } from '../tests/hidden-acceptance.ts';
const report = hiddenAcceptance();
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.problems.length ? 1 : 0;
