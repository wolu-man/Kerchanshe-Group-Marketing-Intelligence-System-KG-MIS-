'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import type { HelpFaq } from '@/lib/help';

function FaqItem({ faq, isOpen, onState }: { faq: HelpFaq; isOpen: boolean; onState: (id: string, open: boolean) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = () => onState(faq.id, el.open);
    el.addEventListener('toggle', handler);
    return () => el.removeEventListener('toggle', handler);
  }, [faq.id, onState]);

  return (
    <details ref={ref} id={`faq-${faq.id}`} className={`help-faq ${isOpen ? 'open' : ''}`} open={isOpen}>
      <summary>
        <span>{faq.question}</span>
        <Icon name="chevron-down" className="help-faq-chev" />
      </summary>
      <div className="help-faq-answer">{faq.answer}</div>
    </details>
  );
}

export function FaqList({ faqs }: { faqs: HelpFaq[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep links: /help#faq-<id> opens and scrolls to the matching question.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (!hash.startsWith('faq-')) return;
      const id = hash.slice(4);
      setOpenId(id);
      window.setTimeout(() => {
        document.getElementById(`faq-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  const handleState = (id: string, open: boolean) => {
    setOpenId(open ? id : null);
  };

  if (faqs.length === 0) return null;

  return (
    <div className="help-faqs">
      {faqs.map((f) => (
        <FaqItem key={f.id} faq={f} isOpen={openId === f.id} onState={handleState} />
      ))}
    </div>
  );
}
