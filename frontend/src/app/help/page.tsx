import Link from 'next/link';
import { Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { HelpBreadcrumbs } from '@/components/help/HelpBreadcrumbs';
import { FaqList } from '@/components/help/FaqList';
import {
  HELP_CATEGORIES,
  HELP_FAQS,
  POPULAR_GUIDES,
  guidesByCategory,
  faqsByCategory,
  type HelpCategoryId,
} from '@/lib/help';

function isCategoryId(v: string | undefined): v is HelpCategoryId {
  return Boolean(v) && HELP_CATEGORIES.some((c) => c.id === v);
}

export default function HelpHomePage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const activeCategory = isCategoryId(searchParams.category) ? searchParams.category : null;
  const category = activeCategory ? HELP_CATEGORIES.find((c) => c.id === activeCategory) : null;

  const guides = activeCategory ? guidesByCategory(activeCategory) : [];
  const faqs = activeCategory ? faqsByCategory(activeCategory) : HELP_FAQS;

  // Group FAQs by category when showing everything.
  const faqGroups = activeCategory
    ? [{ id: activeCategory, title: category!.title, faqs }]
    : HELP_CATEGORIES.map((c) => ({ id: c.id, title: c.title, faqs: faqsByCategory(c.id) })).filter(
        (g) => g.faqs.length > 0
      );

  return (
    <div className="help-home">
      <HelpBreadcrumbs items={[{ label: 'Help Center' }]} />

      <header className="help-home-head">
        <h1>KG-MIS Help Center</h1>
        <p>
          Full workflow documentation for every module — how to access each screen, what to
          enter, what to expect, and which roles can use it. Search above, or browse topics
          on the left.
        </p>
        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <TourTrigger tourId="help" label="Take the Help Center tour" />
          <Link href="/tours" style={{ fontSize: 13 }}>Browse all tours</Link>
        </div>
      </header>

      <section aria-labelledby="cat-title" className="help-cat-section">
        <h2 id="cat-title" className="help-h2">Browse by category</h2>
        <div className="help-cat-grid">
          {HELP_CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/help?category=${c.id}`}
              className={`help-cat-card ${activeCategory === c.id ? 'active' : ''}`}
            >
              <span className="help-cat-icon"><Icon name={c.icon} /></span>
              <span className="help-cat-body">
                <span className="help-cat-title">{c.title}</span>
                <span className="help-cat-desc">{c.desc}</span>
                <span className="help-cat-count">
                  {guidesByCategory(c.id).length} guides · {faqsByCategory(c.id).length} FAQs
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {!activeCategory && (
        <section aria-labelledby="popular-title" className="help-popular-section">
          <h2 id="popular-title" className="help-h2">Popular guides</h2>
          <div className="help-guide-grid">
            {POPULAR_GUIDES.map((g) => (
              <Link key={g.slug} href={`/help/${g.slug}`} className="help-guide-card">
                <span className="help-guide-title">{g.title}</span>
                <span className="help-guide-summary">{g.summary}</span>
                <span className="help-guide-more">Read guide <Icon name="arrow-right" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {activeCategory && category && (
        <section aria-labelledby="cat-guides-title" className="help-popular-section">
          <h2 id="cat-guides-title" className="help-h2">
            <Icon name={category.icon} /> {category.title} guides
          </h2>
          <div className="help-guide-grid">
            {guides.map((g) => (
              <Link key={g.slug} href={`/help/${g.slug}`} className="help-guide-card">
                <span className="help-guide-title">{g.title}</span>
                <span className="help-guide-summary">{g.summary}</span>
                <span className="help-guide-more">Read guide <Icon name="arrow-right" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="faq-title" className="help-faq-section">
        <h2 id="faq-title" className="help-h2">Frequently asked questions</h2>

        {!activeCategory && (
          <div className="help-faq-chips" aria-label="Filter FAQs by category">
            <Link href="/help" className="help-chip active">All</Link>
            {HELP_CATEGORIES.filter((c) => faqsByCategory(c.id).length > 0).map((c) => (
              <Link key={c.id} href={`/help?category=${c.id}`} className="help-chip">{c.title}</Link>
            ))}
          </div>
        )}
        {category && (
          <div className="help-faq-chips">
            <Link href="/help" className="help-chip">All categories</Link>
            <span className="help-chip active">{category.title}</span>
          </div>
        )}

        {faqGroups.map((g) => (
          <div key={g.id} className="help-faq-group">
            {!activeCategory && <h3 className="help-faq-group-title">{g.title}</h3>}
            <FaqList faqs={g.faqs} />
          </div>
        ))}
      </section>
    </div>
  );
}
