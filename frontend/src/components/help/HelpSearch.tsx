'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { searchHelp, type HelpSearchResult } from '@/lib/help';

function resultHref(r: HelpSearchResult): string {
  if (r.kind === 'faq') return `/help#faq-${r.faqId}`;
  return `/help/${r.slug}`;
}

export function HelpSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchHelp(query), [query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const go = (r: HelpSearchResult) => {
    setOpen(false);
    setQuery('');
    router.push(resultHref(r));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="help-search" ref={boxRef}>
      <Icon name="magnifying-glass" className="help-search-icon" />
      <input
        type="search"
        className="input help-search-input"
        placeholder="Search guides and FAQs…"
        aria-label="Search help articles and FAQs"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {query && (
        <button type="button" className="help-search-clear" aria-label="Clear search" onClick={() => { setQuery(''); setOpen(false); }}>
          <Icon name="xmark" />
        </button>
      )}

      {open && query.trim() !== '' && (
        <div className="help-search-results" role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <div className="help-search-empty">
              <Icon name="magnifying-glass" />
              <span>No results for &ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.kind}-${r.slug}-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`help-search-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
              >
                <Icon name={r.kind === 'faq' ? 'circle-question' : 'book-open'} />
                <span className="help-search-item-text">
                  <span className="help-search-item-title">{r.title}</span>
                  <span className="help-search-item-sub">{r.categoryTitle} · {r.kind === 'faq' ? 'FAQ' : 'Guide'}</span>
                </span>
                <Icon name="arrow-right" className="help-search-item-go" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
