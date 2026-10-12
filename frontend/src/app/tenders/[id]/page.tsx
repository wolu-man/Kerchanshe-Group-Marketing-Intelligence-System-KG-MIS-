'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Badge, Field, Icon, Modal } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { fmtDate, fmtMoney, jsonOrNull, opportunityTypeLabel } from '@/lib/format';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import type { TenderOpportunity, TenderEnrichmentResult, ScoreExplanation, AiGapFillData } from '@/lib/types';

const SAVE_STATUSES = ['New', 'Reviewing', 'Interested', 'Applied', 'Won', 'Lost', 'Archived'] as const;

const DQ_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  Complete: 'success',
  Partial: 'warning',
  Sparse: 'neutral',
};

function dqTone(level: string | null): 'success' | 'warning' | 'neutral' {
  return (level && DQ_TONE[level]) || 'neutral';
}

function DetailInner() {
  const params = useParams();
  const id = Number(params.id);
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [status, setStatus] = useState<string>('New');
  const [notes, setNotes] = useState('');
  const [localEnrichment, setLocalEnrichment] = useState<TenderEnrichmentResult | null>(null);
  const [explanation, setExplanation] = useState<ScoreExplanation | null>(null);
  const [explOpen, setExplOpen] = useState(false);
  const [explLoading, setExplLoading] = useState(false);

  const { data: opp, loading, error, reload } = useFetch<TenderOpportunity>(`/tenders/${id}`, [id]);

  // Re-sync the local status whenever the server-side save status changes
  // (initial load, saving, unsaving or status updates triggered elsewhere).
  const savedStatus = opp?.SavedStatus ?? null;
  useEffect(() => {
    setStatus(savedStatus || 'New');
  }, [savedStatus]);

  const structuredData = localEnrichment?.structuredData ?? jsonOrNull(opp?.AiStructuredData) as TenderEnrichmentResult['structuredData'] | null;
  const gapFill = (localEnrichment ? {
    fieldBasis: localEnrichment.fieldBasis,
    businessFit: localEnrichment.businessFit,
    suggestions: localEnrichment.suggestions,
    applied: localEnrichment.applied,
  } : jsonOrNull(opp?.AiGapFill)) as AiGapFillData | null;
  const canEnrich = !!user && ['Administrator', 'Marketing Manager', 'Marketing Analyst'].includes(user.role);
  const canVerify = !!user && ['Administrator', 'Marketing Manager'].includes(user.role);

  async function openExplanation() {
    setExplLoading(true);
    setExplOpen(true);
    try {
      const result = await api<ScoreExplanation>(`/tenders/${id}/relevance-explanation`, { method: 'POST' });
      setExplanation(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load the relevance breakdown');
      setExplOpen(false);
    } finally {
      setExplLoading(false);
    }
  }

  async function toggleSave() {
    if (!opp) return;
    setSaving(true);
    try {
      if (opp.IsSaved) {
        await api(`/tenders/${id}/save`, { method: 'DELETE' });
        toast.success('Removed from saved');
      } else {
        await api(`/tenders/${id}/save`, { method: 'POST', body: { Status: status, Notes: notes || null } });
        toast.success('Saved opportunity');
      }
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus() {
    setSaving(true);
    try {
      await api(`/tenders/${id}/save`, { method: 'PUT', body: { Status: status, Notes: notes || null } });
      toast.success('Status updated');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  async function runEnrichment() {
    setEnriching(true);
    try {
      const result = await api<TenderEnrichmentResult>(`/tenders/${id}/ai-enrich`, { method: 'POST' });
      setLocalEnrichment(result);
      toast.success('AI enrichment completed');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'AI enrichment failed');
    } finally {
      setEnriching(false);
    }
  }

  async function toggleVerification() {
    if (!opp) return;
    try {
      const newStatus = opp.VerificationStatus === 'Verified' ? 'Unverified' : 'Verified';
      await api(`/tenders/${id}/verify`, { method: 'POST', body: { status: newStatus } });
      toast.success(`Marked as ${newStatus}`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update verification');
    }
  }

  if (loading) return <Loading />;
  if (error) return <div className="alert alert-error">{error}</div>;
  if (!opp) return <div className="alert alert-error">Opportunity not found</div>;

  return (
    <>
      <div className="page-head">
        <div>
          <div style={{ marginBottom: 8 }}>
            <Link href="/tenders" style={{ fontSize: 13, color: 'var(--text-muted)' }}>← Back to Tenders</Link>
          </div>
          <h1>{opp.Title}</h1>
          <div className="sub">
            {opp.Organization ?? 'Unknown organization'}
            {opp.SourceName ? <> · Source: {opp.SourceName}</> : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge tone={opp.OpportunityType === 'RFQ' ? 'primary' : opp.OpportunityType === 'BUYER_LEAD' ? 'accent' : opp.OpportunityType === 'MARKET_SIGNAL' ? 'warning' : opp.OpportunityType === 'TRADE_INTELLIGENCE' ? 'info' : 'neutral'}>
            {opportunityTypeLabel(opp.OpportunityType)}
          </Badge>
          {opp.ProductGroupName ? <Badge tone="info">{opp.ProductGroupName}</Badge> : null}
          {opp.Region ? <Badge tone="neutral">{opp.Region}</Badge> : null}
          {opp.Confidence != null ? <Badge tone={opp.Confidence >= 80 ? 'success' : opp.Confidence >= 50 ? 'warning' : 'neutral'}>Confidence: {opp.Confidence}</Badge> : null}
          {opp.DataQuality ? <Badge tone={dqTone(opp.DataQuality)}>{opp.DataQuality}</Badge> : null}
          {opp.VerificationStatus === 'Verified' ? <Badge tone="success">Verified</Badge> : <Badge tone="neutral">Unverified</Badge>}
          {opp.RelevanceScore != null && (
            <Badge tone={opp.RelevanceScore >= 70 ? 'success' : opp.RelevanceScore >= 40 ? 'warning' : 'neutral'}>Relevance: {opp.RelevanceScore}</Badge>
          )}
          <Button size="sm" variant="ghost" onClick={() => void openExplanation()} title="Why is this relevant?">
            <Icon name="circle-question" /> Why?
          </Button>
          <TourTrigger tourId="tenders-detail" />
        </div>
      </div>

      <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Key details */}
          <Card title="Opportunity Details" flush>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td style={{ fontWeight: 600, width: 200 }}>Organization</td><td>{opp.Organization ?? '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Opportunity Type</td><td>{opportunityTypeLabel(opp.OpportunityType)}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Product Group</td><td>{opp.ProductGroupName ?? '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Country</td><td>{opp.Country ?? '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Region</td><td>{opp.Region ?? '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Sector</td><td>{opp.Sector ?? '—'}</td></tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>Data Confidence</td>
                    <td>
                      {opp.Confidence != null ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <b>{opp.Confidence}/100</b>
                          <Badge tone={dqTone(opp.DataQuality)}>{opp.DataQuality ?? 'Unknown'}</Badge>
                          <Button size="sm" variant="ghost" onClick={() => void openExplanation()}>Why relevant?</Button>
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                  <tr><td style={{ fontWeight: 600 }}>Estimated Value</td><td>{opp.EstimatedValue != null ? `${opp.Currency || ''} ${fmtMoney(opp.EstimatedValue)}` : '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Publication Date</td><td>{fmtDate(opp.PublicationDate)}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Deadline</td><td><b style={{ color: 'var(--warning)' }}>{fmtDate(opp.DeadlineDate)}</b></td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Source Reference</td><td>{opp.SourceReference ?? '—'}</td></tr>
                  <tr><td style={{ fontWeight: 600 }}>Source URL</td><td><a href={opp.SourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>{opp.SourceUrl}</a></td></tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Description */}
          {opp.Description ? (
            <Card title="Description" flush>
              <div style={{ padding: 16, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{opp.Description}</div>
            </Card>
          ) : null}

          {/* AI Summary */}
          <Card title="AI Summary & Extraction" flush>
            {opp.AiSummary || localEnrichment ? (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 13, color: 'var(--text-muted)' }}>Summary</div>
                  <div style={{ lineHeight: 1.6 }}>{(localEnrichment?.summary ?? opp.AiSummary)}</div>
                </div>
                {structuredData ? (
                  <div className="table-wrap">
                    <table className="table">
                      <tbody>
                        {structuredData.estimatedValue ? <tr><td style={{ fontWeight: 600, width: 200 }}>Estimated Value</td><td>{structuredData.estimatedValue}</td></tr> : null}
                        {structuredData.eligibility ? <tr><td style={{ fontWeight: 600 }}>Eligibility</td><td>{structuredData.eligibility}</td></tr> : null}
                        {structuredData.requiredDocuments ? <tr><td style={{ fontWeight: 600 }}>Required Documents</td><td>{structuredData.requiredDocuments}</td></tr> : null}
                        {structuredData.contactInfo ? <tr><td style={{ fontWeight: 600 }}>Contact Info</td><td>{structuredData.contactInfo}</td></tr> : null}
                        {structuredData.keyDates ? <tr><td style={{ fontWeight: 600 }}>Key Dates</td><td>{structuredData.keyDates}</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {gapFill ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>Classification &amp; Gap-fill</div>
                    {gapFill.businessFit ? <div style={{ fontSize: 13, lineHeight: 1.5 }}>{gapFill.businessFit}</div> : null}
                    {gapFill.fieldBasis && Object.keys(gapFill.fieldBasis).length ? (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {Object.entries(gapFill.fieldBasis).map(([field, basis]) => (
                          <Badge key={field} tone={basis === 'ai' ? 'primary' : 'neutral'}>{field}: {basis}</Badge>
                        ))}
                      </div>
                    ) : null}
                    {gapFill.applied && (gapFill.applied.typeApplied || gapFill.applied.productGroupApplied) ? (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        AI applied {[gapFill.applied.typeApplied ? 'opportunity type' : null, gapFill.applied.productGroupApplied ? 'product group' : null]
                          .filter(Boolean).join(' and ')}
                        {(() => {
                          const only = [
                            gapFill.suggestions?.opportunityType && !gapFill.applied?.typeApplied ? 'opportunity type' : null,
                            gapFill.suggestions?.productGroup && !gapFill.applied?.productGroupApplied ? 'product group' : null,
                          ].filter(Boolean);
                          return only.length ? ` · suggested only: ${only.join(', ')}` : '';
                        })()}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {opp.AiEnrichedAt ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Enriched: {fmtDate(opp.AiEnrichedAt)}</div> : null}
              </div>
            ) : (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>No AI enrichment yet. Generate a summary and structured extraction.</p>
                {canEnrich ? (
                  <Button onClick={() => void runEnrichment()} busy={enriching} variant="primary">
                    <Icon name="wand-magic-sparkles" /> {enriching ? 'Analyzing...' : 'Run AI Enrichment'}
                  </Button>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Contact an administrator to run AI enrichment.</p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Save & Track */}
          <Card title="Save & Track" flush>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {opp.IsSaved ? (
                <>
                  <Field label="Status">
                    <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                      {SAVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Notes">
                    <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add notes..." />
                  </Field>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="sm" data-tour="td-status" onClick={() => void updateStatus()} busy={saving}>Update</Button>
                    <Button size="sm" variant="ghost" data-tour="td-save" onClick={() => void toggleSave()} busy={saving}>Unsave</Button>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Status">
                    <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                      {SAVE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Notes">
                    <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes..." />
                  </Field>
                  <Button size="sm" data-tour="td-save" onClick={() => void toggleSave()} busy={saving}>
                    <Icon name="bookmark" /> Save Opportunity
                  </Button>
                </>
              )}
            </div>
          </Card>

          {/* Verification */}
          {canVerify ? (
            <Card title="Verification" flush>
              <div style={{ padding: 16 }}>
                <Button size="sm" data-tour="td-verify" variant={opp.VerificationStatus === 'Verified' ? 'ghost' : 'primary'} onClick={() => void toggleVerification()}>
                  {opp.VerificationStatus === 'Verified' ? 'Mark Unverified' : 'Mark Verified'}
                </Button>
              </div>
            </Card>
          ) : null}

          {/* Metadata */}
          <Card title="Metadata" flush>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr><td style={{ fontWeight: 600, fontSize: 13 }}>Created</td><td style={{ fontSize: 13 }}>{fmtDate(opp.CreatedAt)}</td></tr>
                  <tr><td style={{ fontWeight: 600, fontSize: 13 }}>Content Hash</td><td style={{ fontSize: 11, fontFamily: 'monospace' }}>{opp.ContentHash.slice(0, 16)}...</td></tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={explOpen}
        onClose={() => setExplOpen(false)}
        title="Why is this relevant?"
        footer={<Button variant="ghost" onClick={() => setExplOpen(false)}>Close</Button>}
      >
        {explLoading || !explanation ? (
          <Loading />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 14 }}>
              <b>{explanation.total ?? opp.RelevanceScore ?? 0}/100</b>
              {explanation.profileName ? <> · Profile: {explanation.profileName}</> : null}
            </div>
            {explanation.matchedKeywords?.length ? (
              <div style={{ fontSize: 13 }}>
                Matched keywords: {explanation.matchedKeywords.map((k) => (
                  <Badge key={k} tone="success">{k}</Badge>
                ))}
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Component</th><th>Points</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {(explanation.components ?? []).map((c) => (
                    <tr key={c.key}>
                      <td style={{ fontSize: 13 }}>{c.label ?? c.key}</td>
                      <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}><b>{c.points}</b> / {c.max}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.detail ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Scoring profile: {explanation.profileName ?? '—'} · v2 model (11 components, weights sum to 100).
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default function TenderDetailPage() {
  return (
    <Guard>
      <DetailInner />
    </Guard>
  );
}
