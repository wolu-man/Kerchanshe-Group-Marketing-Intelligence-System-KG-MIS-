'use client';

// =============================================================================
// Shared emoji picker — full Unicode emoji set (9 groups, ~1900 emoji) vendored
// in `lib/emoji-data.json` (from github.com/muan/unicode-emoji-json, MIT) and
// loaded on demand so it never weighs on the initial bundle. Reused by the
// form builder rich-text toolbar and the AI assistant composer.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';

type EmojiData = Record<string, string[][]>;

/** Short tab labels for each Unicode group (data file keys are full names). */
const CATEGORY_LABELS: Record<string, string> = {
  'Smileys & Emotion': 'Smileys',
  'People & Body': 'People',
  'Animals & Nature': 'Animals',
  'Food & Drink': 'Food',
  'Travel & Places': 'Travel',
  'Activities': 'Activities',
  'Objects': 'Objects',
  'Symbols': 'Symbols',
  'Flags': 'Flags',
};

const MAX_RESULTS = 180;

export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [data, setData] = useState<EmojiData | null>(null);
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState('Smileys & Emotion');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    void import('@/lib/emoji-data.json')
      .then((raw) => {
        const mod = raw as unknown as EmojiData & { default?: EmojiData };
        if (alive) setData(mod.default ?? mod);
      })
      .catch(() => {
        if (alive) setData({});
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const list = useMemo(() => {
    if (!data) return [] as string[][];
    const q = query.trim().toLowerCase();
    if (q) {
      const hits: string[][] = [];
      for (const pairs of Object.values(data)) {
        for (const pair of pairs) {
          if (pair[1].includes(q)) hits.push(pair);
          if (hits.length >= MAX_RESULTS) return hits;
        }
      }
      return hits;
    }
    return data[activeGroup] ?? [];
  }, [data, query, activeGroup]);

  const groups = useMemo(() => (data ? Object.keys(data) : []), [data]);

  return (
    <div ref={ref} className="rte-emoji-picker">
      <div className="rte-emoji-search">
        <input
          className="input"
          type="search"
          placeholder="Search emoji…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search emoji"
        />
      </div>
      {!query && (
        <div className="rte-emoji-cats">
          {groups.map((g) => (
            <button
              key={g}
              className={`rte-emoji-cat ${activeGroup === g ? 'active' : ''}`}
              onClick={() => setActiveGroup(g)}
              type="button"
            >
              {CATEGORY_LABELS[g] ?? g}
            </button>
          ))}
        </div>
      )}
      <div className="rte-emoji-grid">
        {!data && <span className="rte-emoji-loading">Loading emoji…</span>}
        {data && list.length === 0 && <span className="rte-emoji-loading">No emoji found.</span>}
        {list.map(([emoji, name]) => (
          <button
            key={`${emoji}-${name}`}
            className="rte-emoji-btn"
            title={name}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            type="button"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
