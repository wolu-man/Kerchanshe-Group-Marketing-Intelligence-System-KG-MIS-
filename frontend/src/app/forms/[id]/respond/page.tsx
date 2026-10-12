'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/Toast';
import { FormRenderer } from '@/components/forms/FormRenderer';
import type { Answers } from '@/lib/types';

function RespondInner({ templateId }: { templateId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<{
    version?: { VersionID: number; VersionNumber: number; SchemaJSON: string };
    template?: { TemplateID: number; Title: string; Description?: string; AccessMode: string; GDPRConsentRequired: boolean; GDPRConsentText?: string; GDPRConsentVersion: number; MaxResponses?: number; ExpireAt?: string; PublishAt?: string; Status: string; ResponseCount: number };
    existingResponse?: { ResponseID: number; Status: string; AnswersJSON: string; DraftSavedAt?: string } | null;
  } | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [showConsent, setShowConsent] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [password, setPassword] = useState('');
  const [resumeToken, setResumeToken] = useState<string | null>(null);

  useEffect(() => {
    async function loadForm() {
      setLoading(true);
      try {
        const versionRes = await api<{ VersionID: number; VersionNumber: number; SchemaJSON: string }>(`/forms/${templateId}/versions/published`);
        const templateRes = await api<{ TemplateID: number; Title: string; Description?: string; AccessMode: string; GDPRConsentRequired: boolean; GDPRConsentText?: string; GDPRConsentVersion: number; MaxResponses?: number; ExpireAt?: string; PublishAt?: string; Status: string; ResponseCount: number }>(`/forms/${templateId}`);

        let existingResponse = null;
        const resumeTok = searchParams.get('resume');
        if (resumeTok) {
          const resumeRes = await api<{ ResponseID: number; Status: string; AnswersJSON: string; DraftSavedAt?: string } | null>(`/forms/${templateId}/responses/resume?token=${resumeTok}`);
          if (resumeRes) existingResponse = resumeRes;
        }

        setFormData({ version: versionRes, template: templateRes, existingResponse });

        if (existingResponse?.AnswersJSON) {
          setAnswers(JSON.parse(existingResponse.AnswersJSON));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadForm();
  }, [templateId, searchParams]);

  const handleSubmit = async (isDraft = false) => {
    if (!formData?.version) return;

    const schema = formData.version.SchemaJSON ? JSON.parse(formData.version.SchemaJSON) : null;
    if (schema) {
      for (const element of schema.elements) {
        if (element.required) {
          const value = answers[element.key];
          const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
          if (empty) {
            toast.error(`"${element.label}" is required`);
            return;
          }
        }
      }
    }

    if (formData.template?.GDPRConsentRequired && !consentGiven) {
      setShowConsent(true);
      return;
    }

    if (formData.template?.AccessMode === 'Password' && !password) {
      toast.error('Please enter the form password');
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => v !== undefined)),
        consentGiven: consentGiven || undefined,
        password: formData.template?.AccessMode === 'Password' ? password : undefined,
        isDraft,
        resumeToken: resumeToken || undefined,
      };

      const res = await api<{ resumeToken?: string; responseId?: number }>(`/forms/${templateId}/responses`, {
        method: 'POST',
        body,
      });

      if (res.resumeToken) {
        setResumeToken(res.resumeToken);
      }

      if (!isDraft) {
        toast.success('Response submitted successfully!');
        router.push(`/forms/${templateId}`);
      } else {
        toast.info('Draft saved. You can resume later.');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => handleSubmit(true);

  if (loading) return <Loading />;
  if (!formData?.version || !formData?.template) return <Empty icon="file-circle-x" message="Form not found" />;

  const { version, template, existingResponse } = formData;
  const schema = version.SchemaJSON ? JSON.parse(version.SchemaJSON) : { elements: [] };
  const isPublished = template.Status === 'Published';
  const isExpired = template.ExpireAt && new Date(template.ExpireAt) < new Date();
  const isFuture = template.PublishAt && new Date(template.PublishAt) > new Date();

  if (!isPublished || isExpired || isFuture) {
    return (
      <Card title={template.Title}>
        <div className="empty">
          <Icon name="circle-exclamation" />
          <div>{isExpired ? 'This form has expired.' : isFuture ? 'This form is not yet open.' : 'This form is not available.'}</div>
        </div>
      </Card>
    );
  }

  if (template.MaxResponses && template.ResponseCount >= template.MaxResponses) {
    return (
      <Card title={template.Title}>
        <div className="empty">
          <Icon name="circle-exclamation" />
          <div>This form has reached its maximum response limit.</div>
        </div>
      </Card>
    );
  }

  if (existingResponse && existingResponse.Status === 'Submitted') {
    return (
      <Card title={template.Title}>
        <div className="empty">
          <Icon name="circle-check" />
          <div>You have already submitted this form.</div>
          <div className="hint">Status: {existingResponse.Status}</div>
          {existingResponse.DraftSavedAt && <div className="hint">Draft saved: {new Date(existingResponse.DraftSavedAt).toLocaleString()}</div>}
        </div>
      </Card>
    );
  }

  return (
    <>
      <TourTrigger tourId="form-respond" className="respond-tour-trigger" />
      <FormRenderer
        envelope={schema}
        branding={schema.branding}
        answers={answers}
        setAnswers={setAnswers}
        consentRequired={template.GDPRConsentRequired}
        consent={consentGiven}
      setConsent={setConsentGiven}
      consentText={template.GDPRConsentText}
      editable={isPublished}
      aiAssist={{ mode: 'auth' }}
      topSlot={
        <Card title={template.Title} style={{ marginBottom: 16 }}>
          {template.Description && <p className="hint" style={{ marginBottom: 16 }}>{template.Description}</p>}

          {template.AccessMode === 'Password' && (
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--primary-soft)', border: '1px solid var(--primary)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Password protected</div>
              <div className="hint" style={{ marginBottom: 8 }}>Enter the form password to continue.</div>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Form password"
                autoComplete="current-password"
              />
            </div>
          )}

          {template.GDPRConsentRequired && !consentGiven && (
            <div style={{ marginBottom: 16, padding: 12, background: 'var(--warning-soft)', border: '1px solid var(--warning)', borderRadius: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Consent Required</div>
              <div className="hint" style={{ marginBottom: 12 }}>{template.GDPRConsentText ?? 'By submitting this form, you consent to the processing of your personal data as described in our privacy policy.'}</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={consentGiven} onChange={(e) => setConsentGiven(e.target.checked)} />
                <span>I consent to the processing of my data</span>
              </label>
            </div>
          )}
        </Card>
      }
      bottomSlot={
        <div className="form-layout__actions">
          <Button variant="ghost" onClick={handleSaveDraft} disabled={submitting}>Save as draft</Button>
          <Button onClick={() => handleSubmit(false)} busy={submitting} disabled={!isPublished}>
            Submit
          </Button>
        </div>
      }
      />
    </>
  );
}

export default function FormRespondPage() {
  const params = useParams<{ id: string }>();
  const templateId = Number(params.id);
  return (
    <Guard>
      <RespondInner templateId={Number.isFinite(templateId) ? templateId : 0} />
    </Guard>
  );
}
