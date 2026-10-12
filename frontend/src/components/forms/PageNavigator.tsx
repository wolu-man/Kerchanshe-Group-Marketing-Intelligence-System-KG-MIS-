'use client';

import { Icon } from '@/components/ui';
import type { FormPage } from '@/lib/types';

// ---------------------------------------------------------------------------
// Page navigator (horizontal tab bar below the canvas)
// ---------------------------------------------------------------------------
export function PageNavigator({
  pages,
  activePage,
  onSelect,
  onAdd,
  onDelete,
  onRename,
}: {
  pages: FormPage[];
  activePage: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}) {
  return (
    <div className="bnav">
      <div className="bnav-pages">
        {pages.map((p, i) => (
          <div
            key={p.id}
            className={`bnav-page ${p.id === activePage ? 'active' : ''}`}
            onClick={() => onSelect(p.id)}
            role="tab"
            aria-selected={p.id === activePage}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p.id); } }}
          >
            <span className="bnav-page-num">{i + 1}</span>
            <span className="bnav-page-title">{p.title || `Page ${i + 1}`}</span>
            {pages.length > 1 && (
              <button
                className="bnav-page-delete"
                title="Delete page"
                aria-label={`Delete ${p.title}`}
                onClick={(e) => { e.stopPropagation(); onDelete(p.id); }}
              >
                <Icon name="xmark" />
              </button>
            )}
          </div>
        ))}
      </div>
      <button className="bnav-add" onClick={onAdd} title="Add page" aria-label="Add page">
        <Icon name="plus" /> Page
      </button>
    </div>
  );
}
