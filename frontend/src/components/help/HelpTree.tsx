'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui';
import { HELP_CATEGORIES, guidesByCategory } from '@/lib/help';

export function HelpTree() {
  const pathname = usePathname();
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  const items = useMemo(
    () => HELP_CATEGORIES.map((c) => ({ category: c, guides: guidesByCategory(c.id) })),
    []
  );

  const activeCategory = useMemo(() => {
    for (const { category, guides } of items) {
      if (guides.some((g) => pathname === `/help/${g.slug}`)) return category.id;
    }
    return null;
  }, [items, pathname]);

  const isOpen = (id: string) => openMap[id] ?? id === activeCategory;

  return (
    <nav className="help-tree" aria-label="Help topics">
      <Link
        href="/help"
        className={`help-tree-home ${pathname === '/help' ? 'active' : ''}`}
      >
        <Icon name="house" />
        <span>All topics</span>
      </Link>

      {items.map(({ category, guides }) => (
        <div key={category.id} className="help-tree-group">
          <button
            type="button"
            className="help-tree-head"
            aria-expanded={isOpen(category.id)}
            onClick={() => setOpenMap((m) => ({ ...m, [category.id]: !isOpen(category.id) }))}
          >
            <span className="help-tree-label">
              <Icon name={category.icon} />
              <span>{category.title}</span>
            </span>
            <span className="help-tree-count">{guides.length}</span>
            <Icon name={isOpen(category.id) ? 'chevron-down' : 'chevron-right'} className="help-tree-chev" />
          </button>
          {isOpen(category.id) && (
            <div className="help-tree-items">
              {guides.map((g) => (
                <Link
                  key={g.slug}
                  href={`/help/${g.slug}`}
                  className={pathname === `/help/${g.slug}` ? 'active' : ''}
                >
                  {g.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
