'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

export default function SavedOpportunitiesPage() {
  return (
    <Guard>
      <OpportunitiesExplorer
        preset={{
          title: 'Saved Opportunities',
          subtitle: 'Everything you have bookmarked for follow-up.',
          savedOnly: true,
          showDashboard: false,
        }}
      />
    </Guard>
  );
}
