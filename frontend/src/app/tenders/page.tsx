'use client';

import { Guard } from '@/components/Guard';
import { OpportunitiesExplorer } from '@/components/tenders/OpportunitiesExplorer';

export default function TendersPage() {
  return (
    <Guard>
      <OpportunitiesExplorer />
    </Guard>
  );
}
