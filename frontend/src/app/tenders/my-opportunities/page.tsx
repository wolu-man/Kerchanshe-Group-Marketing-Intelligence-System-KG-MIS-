'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

/** Per plan decision: identical to Saved (both nav items exist, no distinction). */
export default function MyOpportunitiesPage() {
  return (
    <Guard>
      <OpportunitiesExplorer
        preset={{
          title: 'My Opportunities',
          subtitle: 'Opportunities you are tracking.',
          savedOnly: true,
          showDashboard: false,
        }}
      />
    </Guard>
  );
}
