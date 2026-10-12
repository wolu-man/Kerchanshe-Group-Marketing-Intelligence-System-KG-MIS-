'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

export default function ExportOpportunitiesPage() {
  return (
    <Guard>
      <OpportunitiesExplorer
        preset={{
          title: 'Export Opportunities',
          subtitle: 'Opportunities outside Ethiopia (Country ≠ Ethiopia).',
          exportOnly: true,
          showDashboard: false,
        }}
      />
    </Guard>
  );
}
