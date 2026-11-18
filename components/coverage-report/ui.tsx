import type { CoverageReport } from './index.ts';

/** Unstyled report page: one table row per construct used, then the unused, unhandled and empty lists. */
export function CoverageReportView({ report, title }: { report: CoverageReport; title?: string }) {
  return (
    <section data-coverage-report>
      <h2>{title ?? 'Coverage'}</h2>
      <table>
        <thead><tr><th>Construct</th><th>Uses</th><th>Cards</th><th>Handler</th></tr></thead>
        <tbody>
          {report.used.map((u) => (
            <tr key={u.construct} data-construct={u.construct} data-handled={String(u.handled)}>
              <td>{u.construct}</td><td>{u.count}</td><td>{u.cards.join(', ')}</td><td>{u.handled === null ? '-' : u.handled ? 'yes' : 'missing'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p data-unused>Unused ({report.unused.length}): {report.unused.join(', ') || 'none'}</p>
      <p data-unhandled>Without handler ({report.unhandled.length}): {report.unhandled.map((u) => `${u.construct} (${u.cards.join(', ')})`).join('; ') || 'none'}</p>
      <p data-empty>Cards with no construct ({report.empty.length}): {report.empty.join(', ') || 'none'}</p>
    </section>
  );
}
