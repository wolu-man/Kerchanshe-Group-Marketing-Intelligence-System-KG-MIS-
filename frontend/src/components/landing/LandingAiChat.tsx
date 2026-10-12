'use client';

// =============================================================================
// Public landing-page assistant — anonymous floating chat (FAB + panel).
//
// Answers come from the backend's static site knowledge only: no auth, no
// database, no page context. Conversation history lives in component state
// for the session and is capped before it is ever sent (8 turns x 800 chars).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { EmojiPicker } from '@/components/EmojiPicker';
import { friendlyAiError } from '@/lib/ai-error';
import { askPublicChat } from '@/components/forms/use-ai';
import type { AiChatTurn } from '@/lib/ai-types';

interface LandingMsg {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What is KG-MIS?',
  'Which modules are included?',
  'How do I get access?',
] as const;

const HISTORY_TURNS = 8;
const HISTORY_CHARS = 800;
const QUESTION_MAX = 500;

const GREETING =
  "Hi! I'm the KG-MIS site assistant. Ask me anything about this website — what the platform does, its modules, roles, or how to get access.";
const DISCLAIMER =
  "Public assistant · answers come from this website's content only — no access to KG-MIS data.";

export function LandingAiChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<LandingMsg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{ role: 'assistant', content: GREETING }]);
    }
  }, [open, messages.length]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open, error]);

  const send = useCallback(
    async (text?: string) => {
      const question = (text ?? input).trim();
      if (!question || busy) return;
      setEmojiOpen(false);
      setError(null);
      setInput('');
      const history: AiChatTurn[] = messages
        .slice(-HISTORY_TURNS)
        .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CHARS) }));
      const next: LandingMsg[] = [...messages, { role: 'user', content: question }];
      setMessages(next);
      setBusy(true);
      try {
        const res = await askPublicChat({
          provider: 'auto',
          question: question.slice(0, QUESTION_MAX),
          history,
        });
        setMessages([...next, { role: 'assistant', content: res.answer }]);
      } catch (err) {
        setError(friendlyAiError(err));
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy, input, messages]
  );

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div className="lp-ai">
      {open && (
        <div className="lp-ai-panel" role="dialog" aria-label="KG-MIS site assistant">
          <header className="lp-ai-head">
            <span className="lp-ai-avatar" aria-hidden="true">
              <i className="fa-solid fa-wand-magic-sparkles" />
            </span>
            <div className="lp-ai-title">
              <strong>KG-MIS Assistant</strong>
              <small>Public site helper</small>
            </div>
            <button
              type="button"
              className="lp-ai-close"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </header>

          <div className="lp-ai-list" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`lp-ai-msg lp-ai-msg--${m.role}`}>
                {m.content}
              </div>
            ))}

            {busy && (
              <div className="lp-ai-msg lp-ai-msg--assistant lp-ai-typing" aria-label="Assistant is typing">
                <span /><span /><span />
              </div>
            )}

            {messages.length <= 1 && !busy && (
              <div className="lp-ai-chips">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="lp-ai-chip"
                    onClick={() => void send(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="lp-ai-error" role="alert">
                {error}
              </div>
            )}
          </div>

          <div className="lp-ai-composer">
            <div className="lp-ai-emoji-wrap">
              <button
                type="button"
                className="lp-ai-emoji-btn"
                aria-label="Insert emoji"
                aria-expanded={emojiOpen}
                title="Insert emoji"
                onClick={() => setEmojiOpen((v) => !v)}
              >
                <i className="fa-regular fa-face-smile" />
              </button>
              {emojiOpen && (
                <EmojiPicker
                  onSelect={(emoji) => setInput((v) => v + emoji)}
                  onClose={() => setEmojiOpen(false)}
                />
              )}
            </div>
            <textarea
              ref={inputRef}
              className="lp-ai-input"
              rows={1}
              value={input}
              maxLength={QUESTION_MAX}
              placeholder="Ask about KG-MIS…"
              aria-label="Message the KG-MIS site assistant"
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onComposerKeyDown}
            />
            <button
              type="button"
              className="lp-ai-send"
              aria-label="Send message"
              disabled={busy || !input.trim()}
              onClick={() => void send()}
            >
              <i className="fa-solid fa-paper-plane" />
            </button>
          </div>

          <footer className="lp-ai-foot">{DISCLAIMER}</footer>
        </div>
      )}

      <button
        type="button"
        className="lp-ai-fab"
        aria-expanded={open}
        aria-label={open ? 'Close KG-MIS assistant' : 'Ask the KG-MIS site assistant'}
        onClick={() => setOpen((v) => !v)}
      >
        <i className={open ? 'fa-solid fa-xmark' : 'fa-solid fa-comment-dots'} />
        {!open && <span className="lp-ai-fab-tip">Ask me about KG-MIS</span>}
      </button>
    </div>
  );
}
