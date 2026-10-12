'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

export default function RfqsPage() {
  return (
    <Guard>
      <OpportunitiesExplorer
        preset={{
          title: 'Requests for Quotation',
          subtitle: 'Live RFQs collected from every configured source.',
          type: 'RFQ',
          showDashboard: false,
        }}
      />
    </Guard>
  );
}
