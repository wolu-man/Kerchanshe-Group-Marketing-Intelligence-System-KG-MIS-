'use client';

// =============================================================================
// Global AI launcher — permission-gated floating button + side sheet present
// on every MIS page (Shell). Hosts the shared read-only data chat and shows
// the automatic page context chip so the user knows what the assistant sees.
// =============================================================================

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { AiWaves } from '@/components/AiWaves';
import { useAuth } from '@/lib/auth-context';
import { useAiPageContext } from '@/lib/ai-context';
import { AiDataAsk } from '@/components/forms/AiDataAsk';

/** Mirrors the backend `forms.aiAssistant` capability (Admin / Manager / Analyst). */
const AI_ROLES = new Set(['Administrator', 'Marketing Manager', 'Marketing Analyst']);

/** First-time welcome flag, per user (mirrors `kgmis_sidebar_open_${userId}`). */
const welcomeKey = (userId: number) => `kgmis_ai_welcome_seen_${userId}`;

export function GlobalAiLauncher() {
  const { user } = useAuth();
  const page = useAiPageContext();
  const [open, setOpen] = useState(false);
  // Assume seen until checked so SSR/first paint never flashes the popup.
  const [welcomeSeen, setWelcomeSeen] = useState(true);

  useEffect(() => {
    if (!user) return;
    try {
      setWelcomeSeen(localStorage.getItem(welcomeKey(user.userId)) === '1');
    } catch {
      setWelcomeSeen(true);
    }
  }, [user]);

  if (!user || !AI_ROLES.has(user.role)) return null;

  const contextBits = [`${page.module}${page.recordId ? ` #${page.recordId}` : ''}`];
  if (page.label) contextBits.push(page.label);
  for (const f of page.filters ?? []) contextBits.push(`${f.k}=${f.v}`);

  const markWelcomeSeen = () => {
    try {
      localStorage.setItem(welcomeKey(user.userId), '1');
    } catch {
      /* noop */
    }
    setWelcomeSeen(true);
  };

  return (
    <>
      {!welcomeSeen && (
        <div className="ai-welcome" role="dialog" aria-label="Welcome to the MIS AI Assistant">
          <button
            className="ai-welcome-close"
            onClick={markWelcomeSeen}
            aria-label="Dismiss welcome message"
          >
            <Icon name="xmark" />
          </button>
          <div className="ai-welcome-title">MIS AI Assistant</div>
          <p className="ai-welcome-text">
            Hi there! 👋 I&rsquo;m your MIS AI Assistant. I&rsquo;m here to help you find
            information, understand reports, analyze your data, and get things done faster.
            Is there anything you&rsquo;d like help with today?
          </p>
          <button
            className="ai-welcome-cta"
            onClick={() => {
              markWelcomeSeen();
              setOpen(true);
            }}
          >
            Let&rsquo;s talk
          </button>
        </div>
      )}
      <button
        className="ai-launcher-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open AI assistant"
        title="Ask KG-MIS AI"
        aria-expanded={open}
      >
        <AiWaves />
        <Icon name="wand-magic-sparkles" />
      </button>
      {open && (
        <div className="ai-launcher-sheet" role="dialog" aria-label="KG-MIS AI assistant">
          <div className="ai-launcher-head">
            <span className="ai-launcher-title">
              <span className="ai-orb"><AiWaves /><Icon name="wand-magic-sparkles" /></span> KG-MIS AI
            </span>
            <span className="aiassist-chip ai-launcher-chip" title="Automatic page context">
              Context: {contextBits.join(' · ')}
            </span>
            <button
              className="ai-launcher-close"
              onClick={() => setOpen(false)}
              aria-label="Close AI assistant"
            >
              <Icon name="xmark" />
            </button>
          </div>
          <AiDataAsk className="ai-launcher-body" />
        </div>
      )}
    </>
  );
}
