'use client';

import { useEffect, useState } from 'react';
import { Guard } from '@/components/Guard';
import { Icon } from '@/components/ui';
import { HelpSearch } from './HelpSearch';
import { HelpTree } from './HelpTree';

function HelpLayout({ children }: { children: React.ReactNode }) {
  const [treeOpen, setTreeOpen] = useState(false);

  // On mobile the topic tree starts collapsed; desktop ignores this state.
  useEffect(() => {
    setTreeOpen(window.innerWidth > 900);
  }, []);

  return (
    <div className="help-shell">
      <div className="help-toolbar">
        <button
          type="button"
          className="btn btn-ghost btn-sm help-browse-toggle"
          aria-expanded={treeOpen}
          onClick={() => setTreeOpen((v) => !v)}
        >
          <Icon name={treeOpen ? 'xmark' : 'bars'} />
          {treeOpen ? 'Hide topics' : 'Browse topics'}
        </button>
        <HelpSearch />
      </div>

      <div className="help-body">
        <aside className={`help-side ${treeOpen ? 'open' : ''}`}>
          <HelpTree />
        </aside>
        <div className="help-main">{children}</div>
      </div>
    </div>
  );
}

export function HelpShell({ children }: { children: React.ReactNode }) {
  return (
    <Guard>
      <HelpLayout>{children}</HelpLayout>
    </Guard>
  );
}
