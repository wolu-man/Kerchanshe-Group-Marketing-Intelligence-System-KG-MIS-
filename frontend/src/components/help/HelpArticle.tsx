import Link from 'next/link';
import { Badge, Icon } from '@/components/ui';
import { HelpBreadcrumbs } from './HelpBreadcrumbs';
import { FaqList } from './FaqList';
import { getCategory, faqsForGuide, getGuides } from '@/lib/help';
import type { HelpGuide, HelpBlock } from '@/lib/help';

const ALL_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst', 'Field Officer', 'Viewer'];

function roleBadges(roles: string[] | 'all') {
  const list = roles === 'all' ? ALL_ROLES : roles;
  return list.map((r) => (
    <Badge key={r} tone={r === 'Administrator' ? 'primary' : 'neutral'}>{r}</Badge>
  ));
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.kind) {
    case 'p':
      return <p>{block.text}</p>;
    case 'steps':
      return (
        <ol className="help-steps">
          {block.items.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      );
    case 'bullets':
      return (
        <ul className="help-bullets">
          {block.items.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      );
    case 'note':
      return (
        <div className={`help-note help-note--${block.tone ?? 'info'}`} role="note">
          <Icon name={block.tone === 'warning' ? 'triangle-exclamation' : 'circle-info'} />
          <span>{block.text}</span>
        </div>
      );
    case 'table':
      return (
        <div className="table-wrap">
          <table className="table help-table">
            <thead>
              <tr>{block.head.map((h) => <th key={h}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'links':
      return (
        <div className="help-inline-links">
          {block.items.map((l) => (
            <Link key={l.slug} href={`/help/${l.slug}`} className="help-inline-link">
              <Icon name="arrow-right" /> {l.label}
            </Link>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export function HelpArticle({ guide }: { guide: HelpGuide }) {
  const category = getCategory(guide.category);
  const faqs = faqsForGuide(guide);
  const related = getGuides(guide.related);

  return (
    <article className="help-article">
      <HelpBreadcrumbs items={[
        { label: 'Help Center', href: '/help' },
        { label: category?.title ?? guide.category, href: `/help?category=${guide.category}` },
        { label: guide.title },
      ]} />

      <header className="help-article-head">
        <div className="help-article-kicker">
          <Icon name={category?.icon ?? 'book'} />
          {category?.title}
        </div>
        <h1>{guide.title}</h1>
        <p className="help-article-summary">{guide.summary}</p>
        <div className="help-article-roles" aria-label="Roles with access">
          {roleBadges(guide.roles)}
        </div>
      </header>

      <section className="help-meta" aria-label="Quick facts">
        <div className="help-meta-item">
          <h3><Icon name="door-open" /> How to access</h3>
          <p>{guide.access}</p>
        </div>
        {guide.inputs && guide.inputs.length > 0 && (
          <div className="help-meta-item">
            <h3><Icon name="pen-to-square" /> Required inputs</h3>
            <ul>{guide.inputs.map((i) => <li key={i}>{i}</li>)}</ul>
          </div>
        )}
        {guide.result && (
          <div className="help-meta-item">
            <h3><Icon name="circle-check" /> Expected result</h3>
            <p>{guide.result}</p>
          </div>
        )}
      </section>

      {guide.restrictions && (
        <div className="help-note help-note--warning" role="note">
          <Icon name="triangle-exclamation" />
          <span><b>Role restrictions:</b> {guide.restrictions}</span>
        </div>
      )}

      <div className="help-body-blocks">
        {guide.body.map((b, i) => <Block key={i} block={b} />)}
      </div>

      {related.length > 0 && (
        <section className="help-related" aria-labelledby="related-title">
          <h2 id="related-title"><Icon name="link" /> Related help</h2>
          <div className="help-related-grid">
            {related.map((r) => (
              <Link key={r.slug} href={`/help/${r.slug}`} className="help-related-card">
                <span className="help-related-title">{r.title}</span>
                <span className="help-related-summary">{r.summary}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="help-faq-section" aria-labelledby="faq-title">
          <h2 id="faq-title"><Icon name="circle-question" /> Frequently asked questions</h2>
          <FaqList faqs={faqs} />
        </section>
      )}
    </article>
  );
}
