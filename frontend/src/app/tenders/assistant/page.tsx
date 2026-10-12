'use client';

import { useEffect } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { AiDataAsk } from '@/components/forms/AiDataAsk';
import { useSetAiPageContext } from '@/lib/ai-context';
import { TourTrigger } from '@/components/tour/TourTrigger';

const ASSISTANT_ROLES = ['Administrator', 'Marketing Manager', 'Marketing Analyst'];

/** Plan §18/§8 — AI Assistant for the tender domain (reuses the shared chat). */
export default function TenderAssistantPage() {
  const setContext = useSetAiPageContext();

  useEffect(() => {
    setContext({ module: 'tenders', label: 'Tender AI Assistant' });
    return () => setContext(null);
  }, [setContext]);

  return (
    <Guard>
      <RequireRole roles={ASSISTANT_ROLES}>
        <div className="page-head">
          <div>
            <h1>AI Assistant</h1>
            <div className="sub">
              Ask questions about tenders, opportunities, sources, and saved items. Answers cite the data they were drawn from.
            </div>
          </div>
          <div className="actions">
            <TourTrigger tourId="tenders-assistant" />
          </div>
        </div>
        <AiDataAsk className="aiask-standalone" />
      </RequireRole>
    </Guard>
  );
}
