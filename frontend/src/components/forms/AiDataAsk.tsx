'use client';

// =============================================================================
// Data intelligence chat — natural-language questions over authorized MIS
// data. The server picks and runs a read-only query from a fixed catalogue;
// every answer carries the "Data used" block so the numbers behind a
// conclusion are visible. Shared by the AI drawer ("Data" tab) and the
// Reports page ("Ask AI" tab).
// =============================================================================

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { EmojiPicker } from '@/components/EmojiPicker';
import { friendlyAiError } from '@/lib/ai-error';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { toast } from '@/components/Toast';
import {
  AI_PROVIDER_CHOICES,
  type AiAskResponse,
  type AiProviderChoice,
} from '@/lib/ai-types';
import { useAiPageContext } from '@/lib/ai-context';
import { askData, useAiProviders } from './use-ai';
import { useSpeechInput } from './useSpeech';

/** Per-user voice-reply preference (written replies are the default). */
const voiceKey = (userId: number) => `kgmis_ai_voice_${userId}`;

/** Chat attachment limits — mirrored by POST /ai/attachments server-side. */
const ATTACHMENT_MAX_MB = 10;
const ATTACHMENT_EXT = /\.(csv|xlsx|xls|txt|md|json|log|pdf|docx|png|jpg|jpeg|gif|webp)$/i;

interface PendingAttachment {
  /** Set once POST /ai/attachments succeeds. */
  id?: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  kind?: 'document' | 'image';
  uploading: boolean;
}

interface AttachmentUploadResponse {
  attachmentId: string;
  filename: string;
  sizeBytes: number;
  mimeType: string;
  kind: 'document' | 'image';
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Citations are noise when spoken aloud. */
const stripForSpeech = (text: string) =>
  text
    .replace(/\(?\bsource:\s*[^)\n]+\)?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SUGGESTIONS: Record<string, string[]> = {
  tenders: [
    'How many opportunities do we have in total?',
    'Which opportunities close in the next 14 days?',
    'How many export opportunities (outside Ethiopia) are there?',
    'Which sources collect the most tenders?',
  ],
  default: [
    'How many responses did the latest survey get?',
    'Which region sold the most last month?',
    'How do our prices compare with the competition?',
    'Summarise interview satisfaction by region.',
  ],
};

const HINTS: Record<string, string> = {
  tenders:
    'Ask about opportunities, tenders, RFQs, buyer leads, deadlines, relevance or saved items.',
  default: 'Ask about sales, pricing, customers, surveys…',
};

const EMPTY_COPY: Record<string, string> = {
  tenders:
    'Ask a question about the opportunity pipeline — tenders, RFQs, buyer leads, deadlines, relevance, sources or your saved list. Every answer shows the data it used, and the assistant can only read from a fixed set of queries.',
  default:
    'Ask a question about KG-MIS data — products, customers, competitors, regions, pricing, sales, interviews or surveys. Every answer shows the data it used, and the assistant can only read from a fixed set of queries.',
};

interface ThreadMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: AiAskResponse['sources'];
  provider?: string | null;
  model?: string | null;
  durationMs?: number;
  error?: boolean;
  /** 📎 chip on user messages sent with a file. */
  attachmentName?: string;
  /** Honest server-side notes (unreadable file, image not viewed, …). */
  warnings?: string[];
}

let seq = 0;
function nextId(): string {
  seq += 1;
  return `ask-${Date.now()}-${seq}`;
}

function SourceList({ sources }: { sources: NonNullable<ThreadMessage['sources']> }) {
  if (sources.length === 0) return null;
  return (
    <div className="aiask-sources">
      {sources.map((s, i) => (
        <details key={`${s.name}-${i}`} className="aiask-source">
          <summary>
            <Icon name="database" /> {s.label} · {s.rowCount} row{s.rowCount === 1 ? '' : 's'}
          </summary>
          <div className="aiask-source-args">
            {Object.keys(s.args).length === 0 ? (
              <span className="aiassist-chip">no filters</span>
            ) : (
              Object.entries(s.args).map(([k, v]) => (
                <span key={k} className="aiassist-chip">
                  {k}: {String(v)}
                </span>
              ))
            )}
          </div>
          <pre className="aiask-source-data">{JSON.stringify(s.data, null, 2)}</pre>
        </details>
      ))}
    </div>
  );
}

export function AiDataAsk({ className }: { className?: string }) {
  const { providers, providersError } = useAiProviders(true);
  const { user } = useAuth();
  const page = useAiPageContext();
  const [provider, setProvider] = useState<AiProviderChoice>('auto');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const micBaseRef = useRef('');
  const spokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    setTtsSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (!user) return;
    try {
      setVoiceReplies(localStorage.getItem(voiceKey(user.userId)) === '1');
    } catch {
      /* noop */
    }
  }, [user]);

  // Speak each new assistant answer once (only while voice replies are on).
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'assistant' || last.error) return;
    if (spokenIdRef.current === last.id) return;
    spokenIdRef.current = last.id;
    if (!voiceReplies || !ttsSupported) return;
    const text = stripForSpeech(last.content);
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      setSpeaking(false);
    }
  }, [messages, voiceReplies, ttsSupported]);

  // Never leave audio running when the chat unmounts.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  }, []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    if (attachment?.uploading) {
      toast.error('Wait for the file to finish uploading');
      return;
    }

    if (ttsSupported) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
    const sentAttachment = attachment?.id ? attachment : null;
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'user',
        content: question,
        ...(sentAttachment ? { attachmentName: sentAttachment.name } : {}),
      },
    ]);
    setInput('');
    setAttachment(null);
    setBusy(true);

    try {
      const res = await askData({
        provider,
        question,
        context: {
          module: page.module,
          ...(page.label ? { label: page.label } : {}),
          ...(page.recordId ? { recordId: page.recordId } : {}),
          ...(page.filters?.length ? { filters: page.filters } : {}),
        },
        ...(sentAttachment
          ? {
              attachment: {
                id: sentAttachment.id!,
                name: sentAttachment.name,
                sizeBytes: sentAttachment.sizeBytes,
                mimeType: sentAttachment.mimeType,
              },
            }
          : {}),
      });
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: 'assistant',
          content: res.answer,
          sources: res.sources,
          provider: res.provider,
          model: res.model,
          durationMs: res.durationMs,
          ...(res.warnings?.length ? { warnings: res.warnings } : {}),
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'assistant', content: friendlyAiError(err), error: true },
      ]);
    } finally {
      setBusy(false);
    }
  };

  // Upload the picked file immediately so sending never waits on it.
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ATTACHMENT_EXT.test(file.name)) {
      toast.error('Unsupported file type — use CSV, Excel, text, PDF, DOCX or an image');
      return;
    }
    if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
      toast.error(`Attachments are limited to ${ATTACHMENT_MAX_MB} MB`);
      return;
    }
    setAttachment({
      name: file.name,
      sizeBytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      uploading: true,
    });
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api<AttachmentUploadResponse>('/ai/attachments', { method: 'POST', body: form });
      setAttachment({
        id: res.attachmentId,
        name: res.filename,
        sizeBytes: res.sizeBytes,
        mimeType: res.mimeType,
        kind: res.kind,
        uploading: false,
      });
    } catch (err) {
      setAttachment(null);
      toast.error(friendlyAiError(err));
    }
  };

  const empty = messages.length === 0;
  const suggestions = SUGGESTIONS[page.module] ?? SUGGESTIONS.default;
  const hint = HINTS[page.module] ?? HINTS.default;
  const emptyCopy = EMPTY_COPY[page.module] ?? EMPTY_COPY.default;

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? null;
    if (el && start !== null) {
      const end = el.selectionEnd ?? start;
      setInput((cur) => cur.slice(0, start) + emoji + cur.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setInput((cur) => cur + emoji);
    }
  };

  // Dictation: echo the live transcript into the input, auto-send when the
  // microphone closes (hands-free) — text is reviewed live as it is heard.
  const speech = useSpeechInput({
    onLive: (t) => setInput(micBaseRef.current ? `${micBaseRef.current} ${t}` : t),
    onFinal: (t) => {
      const full = micBaseRef.current ? `${micBaseRef.current} ${t}` : t;
      micBaseRef.current = '';
      if (full.trim()) void send(full);
    },
  });

  const onMicClick = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    micBaseRef.current = input.trim();
    speech.start();
  };

  const toggleVoice = () => {
    const next = !voiceReplies;
    setVoiceReplies(next);
    if (!next && ttsSupported) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
    if (user) {
      try {
        localStorage.setItem(voiceKey(user.userId), next ? '1' : '0');
      } catch {
        /* noop */
      }
    }
  };

  return (
    <div className={className ? `aiask ${className}` : 'aiask'}>
      <div className="aiask-topbar">
        <select
          className="select aiassist-provider"
          value={provider}
          onChange={(e) => setProvider(e.target.value as AiProviderChoice)}
          title="AI provider"
          aria-label="AI provider"
        >
          {AI_PROVIDER_CHOICES.map((p) => (
            <option key={p} value={p}>
              {p === 'auto' ? 'Auto (recommended)' : p}
            </option>
          ))}
        </select>
        {providersError && <span className="aiassist-notice aiassist-warn">{providersError}</span>}
        {providers && (
          <div className="aiassist-providers">
            {providers.map((p) => (
              <span
                key={p.id}
                className={`aiassist-chip ${p.available ? 'is-ok' : p.configured ? 'is-warn' : 'is-off'}`}
                title={p.detail ?? p.label}
              >
                <i className="aiassist-dot" aria-hidden="true" />
                {p.label}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`aiassist-tool aiask-voice ${voiceReplies ? 'is-active' : ''} ${speaking ? 'is-speaking' : ''}`}
          onClick={toggleVoice}
          disabled={!ttsSupported}
          title={voiceReplies ? 'Voice replies: on — click to read answers as text only' : 'Voice replies: off — click to hear answers aloud'}
          aria-label="Toggle voice replies"
          aria-pressed={voiceReplies}
        >
          <Icon name={voiceReplies ? 'volume-high' : 'volume-xmark'} />
        </button>
      </div>

      <div className="aiask-body" ref={scrollRef}>
        {empty ? (
          <div className="aiassist-empty">
            <div className="aiassist-empty-icon">
              <Icon name="database" />
            </div>
            <p>{emptyCopy}</p>
            <div className="aiassist-suggestions">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} disabled={busy}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`aiassist-msg ${m.role === 'user' ? 'aiassist-user' : 'aiassist-assistant'}`}>
              {m.role === 'assistant' && (
                <div className="aiassist-avatar" aria-hidden="true">
                  <Icon name="wand-magic-sparkles" />
                </div>
              )}
              <div className="aiassist-bubble-wrap">
                <div className={`aiassist-bubble ${m.error ? 'is-error' : ''}`}>
                  {m.attachmentName && (
                    <span className="aiassist-attach-inline" title={m.attachmentName}>
                      <Icon name="paperclip" /> {m.attachmentName}
                    </span>
                  )}
                  {m.content}
                </div>
                {m.warnings && m.warnings.length > 0 && (
                  <div className="aiassist-notice aiassist-warn">{m.warnings.join(' · ')}</div>
                )}
                {m.sources && m.sources.length > 0 && <SourceList sources={m.sources} />}
                {m.role === 'assistant' && !m.error && (
                  <div className="aiassist-meta">
                    {[m.provider, m.model, m.durationMs ? `${m.durationMs}ms` : null].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {busy && (
          <div className="aiassist-msg aiassist-assistant">
            <div className="aiassist-avatar" aria-hidden="true">
              <Icon name="wand-magic-sparkles" />
            </div>
            <div className="aiassist-bubble aiassist-thinking">
              <span className="aiassist-typing" aria-hidden="true">
                <i /><i /><i />
              </span>
              Reading KG-MIS data…
            </div>
          </div>
        )}
      </div>

      <div className="aiassist-footer">
        {attachment && (
          <div className="aiassist-attach-chip" title={attachment.name}>
            <Icon name={attachment.kind === 'image' ? 'image' : 'file-lines'} />
            <span className="aiassist-attach-name">{attachment.name}</span>
            <small>
              {formatBytes(attachment.sizeBytes)}
              {attachment.uploading ? ' · uploading…' : ''}
            </small>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              disabled={busy}
              title="Remove attachment"
              aria-label="Remove attachment"
            >
              <Icon name="xmark" />
            </button>
          </div>
        )}
        <div className="aiassist-composer">
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".csv,.xlsx,.xls,.txt,.md,.json,.log,.pdf,.docx,.png,.jpg,.jpeg,.gif,.webp"
            onChange={(e) => void onPickFile(e)}
          />
          <button
            type="button"
            className="aiassist-tool"
            onClick={() => fileRef.current?.click()}
            disabled={busy || Boolean(attachment?.uploading)}
            title={`Attach a file (text, PDF, DOCX, spreadsheet or image · max ${ATTACHMENT_MAX_MB} MB)`}
            aria-label="Attach file"
          >
            <Icon name="paperclip" />
          </button>
          <textarea
            ref={inputRef}
            className="aiassist-input"
            rows={2}
            value={input}
            placeholder={speech.listening ? 'Listening… speak now' : hint}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          {speech.supported && (
            <button
              type="button"
              className={`aiassist-tool ${speech.listening ? 'is-listening' : ''}`}
              onClick={onMicClick}
              disabled={busy}
              title={speech.listening ? 'Stop listening (sends what you said)' : 'Speak your question — it sends when you stop'}
              aria-label={speech.listening ? 'Stop dictation' : 'Dictate question'}
              aria-pressed={speech.listening}
            >
              <Icon name="microphone" />
            </button>
          )}
          <div className="aiassist-emoji-wrap">
            <button
              type="button"
              className={`aiassist-tool ${showEmoji ? 'is-active' : ''}`}
              onClick={() => setShowEmoji((v) => !v)}
              title="Emoji"
              aria-label="Insert emoji"
              aria-expanded={showEmoji}
            >
              <Icon name="face-smile" />
            </button>
            {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
          </div>
          <button
            className="aiassist-send"
            onClick={() => void send(input)}
            disabled={busy || input.trim().length === 0 || Boolean(attachment?.uploading)}
            title="Send"
            aria-label="Send"
          >
            <Icon name="paper-plane" />
          </button>
        </div>
        <div className="aiassist-hint">
          Read-only queries · Enter to send{speech.supported ? ' · 🎤 sends when you stop speaking' : ''}
          {attachment?.id ? ' · 📎 sent with your next question' : ''}
        </div>
      </div>
    </div>
  );
}
