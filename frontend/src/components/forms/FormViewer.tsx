'use client';

import { useState } from 'react';
import type { Answers, FormBranding, FormElement, FormSchemaEnvelope } from '@/lib/types';
import { api, ApiError } from '@/lib/api';
import { Button, Icon } from '@/components/ui';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { FormRenderer } from '@/components/forms/FormRenderer';

// FormViewer: respondent-facing flow. Renders the envelope via FormRenderer,
// handles file uploads, draft save/resume, consent, scoring result display and
// the branded thank-you screen.
export function FormViewer({
  templateId,
  envelope,
  gdprConsentRequired,
  consentText,
  allowDrafts,
  onSubmitDone,
  title,
  description,
}: {
  templateId: number;
  envelope: FormSchemaEnvelope;
  gdprConsentRequired?: boolean;
  consentText?: string | null;
  allowDrafts?: boolean;
  title: string;
  description?: string | null;
  onSubmitDone: (responseId: number, linked: number | null, totalScore: number | null, scoreMax: number | null) => void;
}) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Answers>({});
  const [files, setFiles] = useState<Record<string, Array<{ fileKey: string; originalName: string; sizeBytes: number; mimeType?: string }>>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const [done, setDone] = useState<{ responseId: number; linked: number | null; totalScore: number | null; scoreMax: number | null } | null>(null);

  const branding: FormBranding | undefined = envelope.branding;
  const thankYou = branding?.thankYou;

  async function uploadViaRaw(fd: FormData) {
    const token = localStorage.getItem('kgmis_token');
    const base = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
    const res = await fetch(`${base}/forms/${templateId}/files`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) throw new ApiError(res.status, 'UPLOAD_FAILED', 'Upload failed');
    const json = await res.json();
    return json as { fileKey: string; originalName: string; sizeBytes: number; mimeType: string };
  }

  async function uploadFieldFile(el: FormElement, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const meta = await uploadViaRaw(fd);
      const nextFiles = { ...files, [el.key]: [...(files[el.key] ?? []), meta] };
      setFiles(nextFiles);
      setAnswers((a) => ({ ...a, [el.key]: nextFiles[el.key].map((x) => x.fileKey) }));
    } catch {
      toast.error('File upload failed. Try again.');
    }
  }

  async function submit() {
    if (gdprConsentRequired && !consent) {
      toast.error('You must consent to data processing to submit.');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ responseId: number; linkedFormTemplateId: number | null; totalScore?: number | null; scoreMax?: number | null }>(`/forms/${templateId}/responses`, {
        method: 'POST',
        body: {
          answers,
          consentGiven: gdprConsentRequired ? consent : undefined,
          files,
        },
      });
      const doneState = {
        responseId: res.responseId,
        linked: res.linkedFormTemplateId ?? null,
        totalScore: res.totalScore ?? null,
        scoreMax: res.scoreMax ?? null,
      };
      setDone(doneState);
      toast.success('Response submitted');
      onSubmitDone(doneState.responseId, doneState.linked, doneState.totalScore, doneState.scoreMax);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details) && err.details.length > 0) {
        const issues = err.details as Array<{ message?: string }>;
        toast.error(issues.map((i) => i.message ?? '').filter(Boolean).join('; '));
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Submission failed');
      }
      setBusy(false);
    }
  }

  function onResumeLinkGenerated(token: string) {
    setResumeToken(token);
    const url = `${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '')}/forms/resume/${token}`;
    toast.success(`Draft saved! Resume link: ${url}`);
  }

  if (done) {
    const ty = thankYou?.title?.trim()
      ? thankYou
      : { title: 'Response submitted', message: `Your response #${done.responseId} was recorded.` };
    return (
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: '36px 28px' }}>
          <div className="icon" style={{ fontSize: 44, color: branding?.primaryColor ?? 'var(--primary)' }}>
            <Icon name="circle-check" />
          </div>
          <h2 style={{ margin: '12px 0 6px' }}>{ty.title}</h2>
          <p style={{ color: 'var(--text-muted)' }}>
            {thankYou?.message?.trim()
              ? thankYou.message
              : ty.message}
          </p>
          {thankYou?.showResponseId !== false ? (
            <p style={{ marginTop: 8 }}>
              <Button variant="ghost" onClick={() => { navigator.clipboard?.writeText(String(done.responseId)); toast.success('Response ID copied'); }}>
                Copy response ID <Icon name="copy" />
              </Button>
            </p>
          ) : null}
          {done.totalScore !== null && done.scoreMax !== null ? (
            <div className="stat-grid" style={{ margin: '16px 0' }}>
              <div className="stat-card" style={{ padding: '14px 20px', border: '1px solid var(--border-strong)', borderRadius: 8 }}>
                <div className="label">Your score</div>
                <div className="value" style={{ fontSize: 30 }}>{done.totalScore}<span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 400 }}> / {done.scoreMax}</span></div>
              </div>
            </div>
          ) : null}
          {done.linked ? (
            <p style={{ color: 'var(--text-muted)' }}>
              A linked follow-up form is available: <a href={`/forms/${done.linked}/respond`}>complete it</a>.
            </p>
          ) : null}
          {thankYou?.redirectUrl ? (
            <div style={{ marginTop: 16 }}>
              <a className="btn btn-primary" href={thankYou.redirectUrl}>Continue</a>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, padding: '4px 18px', background: 'var(--primary-soft)' }}>
        <h2 style={{ color: 'var(--primary)' }}>{title}</h2>
        {description ? <p style={{ color: 'var(--text-muted)', margin: '6px 0 10px' }}>{description}</p> : null}
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>
          Submitting as <b>{user?.name}</b> ({user?.email ?? 'no email'})
        </p>
      </div>

      <FormRenderer
        envelope={envelope}
        answers={answers}
        setAnswers={setAnswers}
        files={files}
        branding={branding}
        consent={consent}
        setConsent={setConsent}
        consentRequired={gdprConsentRequired}
        consentText={consentText}
        allowDrafts={allowDrafts}
        resumeToken={resumeToken}
        onResumeLinkGenerated={allowDrafts ? onResumeLinkGenerated : undefined}
        uploadFieldFile={uploadFieldFile}
        templateId={templateId}
        userLabel={user ? { name: user.name, email: user.email ?? undefined } : null}
      />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button onClick={() => void submit()} busy={busy} size="lg">
          <Icon name="paper-plane" /> Submit response
        </Button>
      </div>

      {gdprConsentRequired && consentText ? (
        <p className="hint" style={{ marginTop: 8, textAlign: 'right' }}>{consentText}</p>
      ) : null}
    </div>
  );
}