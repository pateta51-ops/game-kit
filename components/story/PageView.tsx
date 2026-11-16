import './story.css';
import type { ReactNode } from 'react';
import { pageView, type Node, type Page, type Texts } from './page';

export type PageViewProps = { page: Page; texts: Texts; log: readonly string[]; overlay?: Texts; renderCard?: (card: string) => ReactNode; renderIcon?: (icon: string) => ReactNode };

export function PageView({ page, texts, log, overlay, renderCard = () => null, renderIcon = () => null }: PageViewProps) {
  const draw = (n: Node, k: number): ReactNode => {
    switch (n.t) {
      case 'text': return <p key={k} className={n.changed ? 'kit-page-text kit-page-changed' : 'kit-page-text'}>{n.text}</p>;
      case 'header': { const H = `h${Math.min(6, Math.max(1, n.level ?? 3))}` as 'h3'; return <H key={k} className="kit-page-header">{n.text}</H>; }
      case 'footnote': return <small key={k} className="kit-page-footnote"><sup>{n.n}</sup> {n.text}</small>;
      case 'list': return <ul key={k} className="kit-page-list">{n.items.map((x, i) => <li key={i}>{draw(x, i)}</li>)}</ul>;
      case 'card': return <figure key={k} className="kit-page-card">{renderCard(n.card)}{n.note && <figcaption>{n.note}</figcaption>}</figure>;
      case 'icon': return <span key={k} className="kit-page-icon">{renderIcon(n.icon)}</span>;
      case 'branch': return <div key={k} className="kit-page-branch">{n.cases.map((c, i) => <div key={i} className={c.applied ? 'kit-page-case kit-page-valid' : 'kit-page-case kit-page-invalid'} data-applied={c.applied}>{draw(c.node, i)}</div>)}</div>;
      case 'mod': return <div key={k} className={n.mods.map((m) => `kit-page-${m}`).join(' ')}>{draw(n.node, 0)}</div>;
    }
  };
  return <div className="kit-page" data-page={page.id}>{pageView(page, texts, log, overlay).map(draw)}</div>;
}
