'use client';

import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Icon } from '@/components/ui';
import {
  FIELD_TYPES,
  FIELD_CATEGORIES,
  type FieldMeta,
  type FieldCategory,
  type FieldType,
} from './FormBuilderState';

// ---------------------------------------------------------------------------
// Draggable field card in the library
// ---------------------------------------------------------------------------
function FieldCard({ field, onAdd }: { field: FieldMeta; onAdd: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${field.type}`,
    data: { fromPalette: true, fieldType: field.type },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className="blib-card"
      style={{ opacity: isDragging ? 0.4 : 1 }}
      onClick={onAdd}
      title={field.description}
      aria-label={`Add ${field.label} field`}
    >
      <span className="blib-card-icon">
        <Icon name={field.icon} />
      </span>
      <span className="blib-card-label">{field.label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Collapsible category section
// ---------------------------------------------------------------------------
function CategorySection({
  category,
  fields,
  onAdd,
  defaultOpen = true,
}: {
  category: { id: FieldCategory; label: string };
  fields: FieldMeta[];
  onAdd: (type: FieldType) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (fields.length === 0) return null;

  return (
    <div className="blib-category">
      <button
        className="blib-category-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} />
        <span>{category.label}</span>
        <span className="blib-category-count">{fields.length}</span>
      </button>
      {open && (
        <div className="blib-category-grid">
          {fields.map((f) => (
            <FieldCard key={f.type} field={f} onAdd={() => onAdd(f.type)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main field library panel
// ---------------------------------------------------------------------------
export function FieldLibrary({ onAdd }: { onAdd: (type: FieldType) => void }) {
  const [query, setQuery] = useState('');
  const [recentTypes, setRecentTypes] = useState<FieldType[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('kgmis_recent_fields') || '[]');
    } catch { return []; }
  });

  const filteredByQuery = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return FIELD_TYPES.filter(
      (f) => f.label.toLowerCase().includes(q) || f.type.toLowerCase().includes(q) || f.description.toLowerCase().includes(q)
    );
  }, [query]);

  const handleAdd = (type: FieldType) => {
    onAdd(type);
    setRecentTypes((prev) => {
      const next = [type, ...prev.filter((t) => t !== type)].slice(0, 8);
      try { localStorage.setItem('kgmis_recent_fields', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  const recentFields = recentTypes
    .map((t) => FIELD_TYPES.find((f) => f.type === t))
    .filter(Boolean) as FieldMeta[];

  return (
    <div className="blib">
      <div className="blib-search">
        <Icon name="magnifying-glass" className="blib-search-icon" />
        <input
          className="input blib-search-input"
          placeholder="Search fields…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search fields"
        />
        {query && (
          <button className="blib-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="xmark" />
          </button>
        )}
      </div>

      {filteredByQuery ? (
        <div className="blib-results">
          {filteredByQuery.length === 0 ? (
            <div className="blib-empty">
              <Icon name="magnifying-glass" />
              <span>No fields match &ldquo;{query}&rdquo;</span>
            </div>
          ) : (
            <div className="blib-category-grid">
              {filteredByQuery.map((f) => (
                <FieldCard key={f.type} field={f} onAdd={() => handleAdd(f.type)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="blib-categories">
          {recentFields.length > 0 && (
            <div className="blib-category">
              <div className="blib-category-head blib-recent-head">
                <Icon name="clock-rotate-left" />
                <span>Recently used</span>
                <button
                  className="blib-recent-clear"
                  title="Clear recently used"
                  aria-label="Clear recently used fields"
                  onClick={() => {
                    setRecentTypes([]);
                    try { localStorage.removeItem('kgmis_recent_fields'); } catch { /* noop */ }
                  }}
                >
                  <Icon name="trash-can" />
                </button>
              </div>
              <div className="blib-category-grid">
                {recentFields.map((f) => (
                  <FieldCard key={f.type} field={f} onAdd={() => handleAdd(f.type)} />
                ))}
              </div>
            </div>
          )}

          {FIELD_CATEGORIES.map((cat) => (
            <CategorySection
              key={cat.id}
              category={cat}
              fields={FIELD_TYPES.filter((f) => f.category === cat.id)}
              onAdd={handleAdd}
              defaultOpen={cat.id === 'text' || cat.id === 'choice'}
            />
          ))}
        </div>
      )}
    </div>
  );
}
