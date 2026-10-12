'use client';

// =============================================================================
// Speech input — browser Web Speech API (SpeechRecognition) for the AI
// assistant composer. No dependencies, no backend: the transcript is surfaced
// through callbacks and the chat decides when to auto-send. Hidden entirely in
// browsers without the API (Firefox); microphone errors surface as toasts.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/components/Toast';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Live dictation. `onLive` receives the running transcript while listening
 * (finalized words + interim guess) so the UI can echo it into the input box;
 * `onFinal` fires once when recognition ends with the finished text — the chat
 * uses it to auto-send hands-free.
 */
export function useSpeechInput(handlers: {
  onLive?: (text: string) => void;
  onFinal: (text: string) => void;
}): SpeechInput {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const finalizedRef = useRef('');
  const interimRef = useRef('');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const cleanup = useCallback(() => {
    const rec = recRef.current;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* noop */
      }
    }
    recRef.current = null;
    finalizedRef.current = '';
    interimRef.current = '';
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (recRef.current) return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const r = event.results[i];
        if (r.isFinal) finalizedRef.current += r[0].transcript;
        else interim += r[0].transcript;
      }
      interimRef.current = interim;
      handlersRef.current.onLive?.(`${finalizedRef.current}${interim}`.trim());
    };

    rec.onerror = (event) => {
      const err = event.error ?? '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        toast.error('Microphone access was blocked — allow it in your browser to dictate.');
        cleanup();
      } else if (err === 'audio-capture') {
        toast.error('No microphone was found.');
        cleanup();
      }
      // 'no-speech' / 'aborted' / 'network' fall through to onend.
    };

    rec.onend = () => {
      const text = `${finalizedRef.current}${interimRef.current}`.trim();
      const hadHandler = recRef.current === rec;
      recRef.current = null;
      finalizedRef.current = '';
      interimRef.current = '';
      setListening(false);
      if (hadHandler && text) handlersRef.current.onFinal(text);
    };

    recRef.current = rec;
    finalizedRef.current = '';
    interimRef.current = '';
    setListening(true);
    try {
      rec.start();
    } catch {
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      cleanup();
    }
  }, [cleanup]);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => {
    setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { supported, listening, start, stop, toggle };
}
