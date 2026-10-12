'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

export default function TradeIntelligencePage() {
  return (
    <Guard>
      <OpportunitiesExplorer
        preset={{
          title: 'Trade Intelligence',
          subtitle: 'Import/export records and shipment signals.',
          type: 'TRADE_INTELLIGENCE',
          showDashboard: false,
        }}
      />
    </Guard>
  );
}
