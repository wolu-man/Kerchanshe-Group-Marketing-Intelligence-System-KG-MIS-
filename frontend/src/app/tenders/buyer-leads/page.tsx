'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

export default function BuyerLeadsPage() {
  return (
    <Guard>
      <OpportunitiesExplorer
        preset={{
          title: 'Buyer Leads',
          subtitle: 'Buyer-side leads identified across sources.',
          type: 'BUYER_LEAD',
          showDashboard: false,
        }}
      />
    </Guard>
  );
}
