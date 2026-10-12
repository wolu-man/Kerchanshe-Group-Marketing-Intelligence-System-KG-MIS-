'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, Card, Loading, Empty, Badge, Pagination, Icon, Modal, Field, BarChart, Donut } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { fmtDate, fmtMoney, opportunityTypeLabel } from '@/lib/format';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import type {
  TenderOpportunity,
  TenderDashboard,
  PaginatedResult,
  TenderCreateInput,
  ProductGroup,
  TenderSource,
  BusinessGroupItem,
} from '@/lib/types';

const PAGE_SIZE = 20;
const MANAGE_ROLES = ['Administrator', 'Marketing Manager'];

/** Preset applied by the dedicated routes (plan §18). */
export interface ExplorerPreset {
  title?: string;
  subtitle?: string;
  /** Locked opportunity type for this route. */
  type?: string;
  /** Locked to opportunities outside Ethiopia (Export Opportunities). */
  exportOnly?: boolean;
  /** Locked to the current user's saved list. */
  savedOnly?: boolean;
  /** Dashboard/KPI/charts section (only the root route shows it). */
  showDashboard?: boolean;
}

const TYPE_TONE: Record<string, 'success' | 'warning' | 'neutral' | 'info' | 'primary' | 'accent'> = {
  TENDER: 'neutral',
  RFQ: 'primary',
  BUYER_LEAD: 'accent',
  TRADE_INTELLIGENCE: 'info',
  MARKET_SIGNAL: 'warning',
};

function typeTone(type: string): 'success' | 'warning' | 'neutral' | 'info' | 'primary' | 'accent' {
  return TYPE_TONE[type] ?? 'neutral';
}

const RELEVANCE_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  high: 'success',
  medium: 'warning',
  low: 'neutral',
};

function relevanceTone(score: number | null): 'success' | 'warning' | 'neutral' {
  if (score == null) return 'neutral';
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'neutral';
}

function relevanceLabel(score: number | null): string {
  if (score == null) return '—';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

const DQ_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  Complete: 'success',
  Partial: 'warning',
  Sparse: 'neutral',
};

function dqTone(level: string | null): 'success' | 'warning' | 'neutral' {
  return (level && DQ_TONE[level]) || 'neutral';
}

const BLANK_FORM = {
  Title: '',
  SourceUrl: '',
  Organization: '',
  Country: '',
  Region: '',
  Sector: '',
  SourceReference: '',
  PublicationDate: '',
  DeadlineDate: '',
  EstimatedValue: '',
  Currency: '',
  Description: '',
  OpportunityType: '',
};

export function OpportunitiesExplorer({ preset }: { preset?: ExplorerPreset }) {
  const { user } = useAuth();
  const showDashboard = preset?.showDashboard !== false;
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('');
  const [relevanceMin, setRelevanceMin] = useState('');
  const [opportunityType, setOpportunityType] = useState(preset?.type ?? '');
  const [productGroup, setProductGroup] = useState('');
  const [savedOnly, setSavedOnly] = useState(preset?.savedOnly ?? false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  // Advanced filters (plan §19).
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [organization, setOrganization] = useState('');
  const [businessGroup, setBusinessGroup] = useState('');
  const [confidenceMin, setConfidenceMin] = useState('');
  const [dataQuality, setDataQuality] = useState('');
  const [fromPublication, setFromPublication] = useState('');
  const [toPublication, setToPublication] = useState('');
  const [fromDeadline, setFromDeadline] = useState('');
  const [toDeadline, setToDeadline] = useState('');
  const [exportOnly, setExportOnly] = useState(preset?.exportOnly ?? false);

  useEffect(() => {
    setPage(1);
  }, [search, country, sector, verificationStatus, relevanceMin, opportunityType, productGroup, savedOnly,
      sourceId, organization, businessGroup, confidenceMin, dataQuality, fromPublication, toPublication, fromDeadline, toDeadline, exportOnly]);

  const filterParams = [
    `page=${page}`,
    `pageSize=${PAGE_SIZE}`,
    search ? `search=${encodeURIComponent(search)}` : '',
    country ? `country=${encodeURIComponent(country)}` : '',
    sector ? `sector=${encodeURIComponent(sector)}` : '',
    verificationStatus ? `verificationStatus=${verificationStatus}` : '',
    relevanceMin ? `relevanceMin=${relevanceMin}` : '',
    opportunityType ? `type=${opportunityType}` : '',
    productGroup ? `productGroup=${encodeURIComponent(productGroup)}` : '',
    savedOnly ? 'savedOnly=true' : '',
    sourceId ? `sourceId=${sourceId}` : '',
    organization ? `organization=${encodeURIComponent(organization)}` : '',
    businessGroup ? `businessGroup=${encodeURIComponent(businessGroup)}` : '',
    confidenceMin ? `confidenceMin=${confidenceMin}` : '',
    dataQuality ? `dataQuality=${dataQuality}` : '',
    fromPublication ? `fromPublication=${fromPublication}` : '',
    toPublication ? `toPublication=${toPublication}` : '',
    fromDeadline ? `fromDeadline=${fromDeadline}` : '',
    toDeadline ? `toDeadline=${toDeadline}` : '',
    exportOnly ? 'exportOnly=true' : '',
  ].filter(Boolean).join('&');

  const filterDeps = [search, country, sector, verificationStatus, relevanceMin, opportunityType, productGroup, savedOnly,
    sourceId, organization, businessGroup, confidenceMin, dataQuality, fromPublication, toPublication, fromDeadline, toDeadline, exportOnly, page];
  const list = useFetch<PaginatedResult<TenderOpportunity>>(`/tenders?${filterParams}`, filterDeps);
  const dashboard = useFetch<TenderDashboard>(showDashboard ? '/tenders/dashboard' : null, []);
  const countries = useFetch<{ items: string[] }>('/tenders/countries', []);
  const sectors = useFetch<{ items: string[] }>('/tenders/sectors', []);
  const productGroups = useFetch<{ items: ProductGroup[] }>('/tenders/product-groups', []);
  const sources = useFetch<{ items: TenderSource[] }>('/tenders/sources', []);
  const businessGroups = useFetch<{ items: BusinessGroupItem[] }>('/tenders/business-groups', []);

  async function toggleSave(opp: TenderOpportunity) {
    try {
      if (opp.IsSaved) {
        await api(`/tenders/${opp.TenderOpportunityID}/save`, { method: 'DELETE' });
        toast.success('Removed from saved');
      } else {
        await api(`/tenders/${opp.TenderOpportunityID}/save`, { method: 'POST', body: { Status: 'New' } });
        toast.success('Saved opportunity');
      }
      void list.reload();
      void dashboard.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save opportunity');
    }
  }

  const hasFilters = !!(search || country || sector || verificationStatus || relevanceMin || opportunityType ||
    productGroup || savedOnly || sourceId || organization || businessGroup || confidenceMin || dataQuality ||
    fromPublication || toPublication || fromDeadline || toDeadline || exportOnly);
  const canManage = !!user && MANAGE_ROLES.includes(user.role);

  function clearFilters() {
    setSearch(''); setCountry(''); setSector(''); setVerificationStatus(''); setRelevanceMin('');
    setOpportunityType(preset?.type ?? ''); setProductGroup(''); setSavedOnly(preset?.savedOnly ?? false);
    setSourceId(''); setOrganization(''); setBusinessGroup(''); setConfidenceMin(''); setDataQuality('');
    setFromPublication(''); setToPublication(''); setFromDeadline(''); setToDeadline('');
    setExportOnly(preset?.exportOnly ?? false);
  }

  function setField(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function saveTender() {
    if (!form.Title.trim()) { toast.error('Title is required'); return; }
    if (!form.SourceUrl.trim()) { toast.error('Source URL is required'); return; }
    let estimated: number | undefined;
    if (form.EstimatedValue.trim()) {
      estimated = Number(form.EstimatedValue.replace(/,/g, ''));
      if (!Number.isFinite(estimated)) { toast.error('Estimated value must be a number'); return; }
    }
    setCreating(true);
    try {
      const body: TenderCreateInput = {
        Title: form.Title.trim(),
        SourceUrl: form.SourceUrl.trim(),
        Organization: form.Organization.trim() || null,
        Country: form.Country.trim() || null,
        Sector: form.Sector.trim() || null,
        Description: form.Description.trim() || null,
        SourceReference: form.SourceReference.trim() || null,
        PublicationDate: form.PublicationDate.trim() || null,
        DeadlineDate: form.DeadlineDate.trim() || null,
        EstimatedValue: estimated ?? null,
        Currency: form.Currency.trim() || null,
        Region: form.Region.trim() || null,
        ...(form.OpportunityType ? { OpportunityType: form.OpportunityType } : {}),
      };
      await api('/tenders', { method: 'POST', body });
      toast.success('Tender created');
      setCreateOpen(false);
      setForm(BLANK_FORM);
      void list.reload();
      void dashboard.reload();
      void countries.reload();
      void sectors.reload();
      void productGroups.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create tender');
    } finally {
      setCreating(false);
    }
  }

  const d = dashboard.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{preset?.title ?? 'Tenders & Opportunities'}</h1>
          <div className="sub">
            {preset?.subtitle ?? (
              <>
                Discover, track, and act on tender and business opportunities.
                {canManage ? (
                  <> Manage <Link href="/tenders/sources">data sources</Link> and <Link href="/tenders/interest-profiles">interest profiles</Link>.</>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="actions" style={{ display: 'flex', gap: 8 }}>
          {canManage ? (
            <>
              <Link href="/tenders/import" className="btn btn-ghost">
                <Icon name="file-import" /> Import
              </Link>
              <Button onClick={() => setCreateOpen(true)}>
                <Icon name="plus" /> Add Tender
              </Button>
            </>
          ) : null}
          <TourTrigger tourId="tenders" />
        </div>
      </div>

      {/* KPI cards (plan §20: baseline + type/export KPIs) */}
      {d ? (
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <Card>
            <div className="stat-card">
              <div className="label">Total Opportunities</div>
              <div className="value">{d.totalOpportunities}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">New This Week</div>
              <div className="value">{d.newThisWeek}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">Deadlines Soon</div>
              <div className="value" style={{ color: 'var(--warning)' }}>{d.deadlineSoon}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">High Relevance</div>
              <div className="value" style={{ color: 'var(--success)' }}>{d.highRelevance}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">Saved</div>
              <div className="value">{d.savedCount}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">RFQs</div>
              <div className="value">{d.rfqCount}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">Buyer Leads</div>
              <div className="value">{d.buyerLeadCount}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">Export (non-Ethiopia)</div>
              <div className="value" style={{ color: 'var(--info)' }}>{d.exportCount}</div>
            </div>
          </Card>
          <Card>
            <div className="stat-card">
              <div className="label">Trade Intel</div>
              <div className="value">{d.tradeCount}</div>
            </div>
          </Card>
        </div>
      ) : null}

      {/* Upcoming deadlines */}
      {d && d.upcomingDeadlines.length > 0 ? (
        <Card title="Upcoming Deadlines" flush style={{ marginBottom: 16 }}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Organization</th><th>Deadline</th><th>Relevance</th><th></th></tr></thead>
              <tbody>
                {d.upcomingDeadlines.map((opp) => (
                  <tr key={opp.TenderOpportunityID}>
                    <td><Link href={`/tenders/${opp.TenderOpportunityID}`}><b>{opp.Title}</b></Link></td>
                    <td>{opp.Organization ?? '—'}</td>
                    <td><b style={{ color: 'var(--warning)' }}>{fmtDate(opp.DeadlineDate)}</b></td>
                    <td><Badge tone={relevanceTone(opp.RelevanceScore)}>{relevanceLabel(opp.RelevanceScore)}</Badge></td>
                    <td><Button size="sm" variant="ghost" onClick={() => void toggleSave(opp)}><Icon name="bookmark" type={opp.IsSaved ? 'solid' : 'regular'} /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Breakdown charts (plan §20) */}
      {d && (
        (d.byCountry.length || d.bySector.length || d.byType.length || d.bySource.length ||
         d.byProductGroup.length || d.relevanceBuckets.length || d.deadlineTrend.length) ? (
        <div style={{ marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {d.byCountry.length > 0 ? (
            <Card title="By Country" flush>
              <div style={{ padding: '12px 16px' }}>
                <BarChart data={d.byCountry.slice(0, 12).map((c) => ({ label: c.country, value: c.count }))} />
              </div>
            </Card>
          ) : null}
          {d.bySector.length > 0 ? (
            <Card title="By Sector" flush>
              <div style={{ padding: '12px 16px' }}>
                <BarChart data={d.bySector.slice(0, 12).map((s) => ({ label: s.sector, value: s.count }))} color="var(--success)" />
              </div>
            </Card>
          ) : null}
          {d.byType.length > 0 ? (
            <Card title="By Type" flush>
              <div style={{ padding: '12px 16px' }}>
                <BarChart data={d.byType.map((t) => ({ label: opportunityTypeLabel(t.type), value: t.count }))} color="var(--accent)" />
              </div>
            </Card>
          ) : null}
          {d.bySource.length > 0 ? (
            <Card title="By Source" flush>
              <div style={{ padding: '12px 16px' }}>
                <BarChart data={d.bySource.map((s) => ({ label: s.source, value: s.count }))} color="var(--info)" />
              </div>
            </Card>
          ) : null}
          {d.byProductGroup.length > 0 ? (
            <Card title="By Product Group" flush>
              <div style={{ padding: '12px 16px' }}>
                <BarChart data={d.byProductGroup.map((g) => ({ label: g.group, value: g.count }))} color="var(--warning)" />
              </div>
            </Card>
          ) : null}
          {d.relevanceBuckets.some((b) => b.count > 0) ? (
            <Card title="Relevance Distribution" flush>
              <div style={{ padding: '16px' }}>
                <Donut data={d.relevanceBuckets.filter((b) => b.count > 0).map((b) => ({ label: b.label, value: b.count }))} />
              </div>
            </Card>
          ) : null}
          {d.deadlineTrend.length > 0 ? (
            <Card title="Deadlines per Week (next 8 weeks)" flush>
              <div style={{ padding: '12px 16px' }}>
                <BarChart data={d.deadlineTrend.map((w) => ({ label: w.label, value: w.count }))} color="var(--warning)" />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null)}

      {/* Main opportunity list */}
      <Card title={`Opportunities (${list.data?.total ?? 0})`} flush>
        <div className="filters">
          <input className="input" placeholder="Search title, description, organization..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {(countries.data?.items ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="select" value={sector} onChange={(e) => setSector(e.target.value)}>
            <option value="">All sectors</option>
            {(sectors.data?.items ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={opportunityType} onChange={(e) => setOpportunityType(e.target.value)} disabled={!!preset?.type}>
            <option value="">All types</option>
            {['TENDER', 'RFQ', 'BUYER_LEAD', 'TRADE_INTELLIGENCE', 'MARKET_SIGNAL'].map((t) => (
              <option key={t} value={t}>{opportunityTypeLabel(t)}</option>
            ))}
          </select>
          <select className="select" value={productGroup} onChange={(e) => setProductGroup(e.target.value)}>
            <option value="">All product groups</option>
            {(productGroups.data?.items ?? []).map((g) => <option key={g.ProductGroupID} value={g.Code}>{g.Name}</option>)}
          </select>
          <select className="select" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)}>
            <option value="">All verification</option>
            <option value="Verified">Verified</option>
            <option value="Unverified">Unverified</option>
          </select>
          <select className="select" value={relevanceMin} onChange={(e) => setRelevanceMin(e.target.value)}>
            <option value="">Any relevance</option>
            <option value="70">High (≥70)</option>
            <option value="40">Medium (≥40)</option>
          </select>
          {!preset?.savedOnly ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} />
              Saved only
            </label>
          ) : null}
          <Button variant="ghost" onClick={() => setAdvancedOpen((v) => !v)}>
            <Icon name="filter" /> More filters {advancedOpen ? '▴' : '▾'}
          </Button>
          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>Clear</Button>
          )}
        </div>
        {advancedOpen ? (
          <div className="filters" style={{ borderTop: '1px solid var(--surface-3)', paddingTop: 12 }}>
            <select className="select" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">All sources</option>
              {(sources.data?.items ?? []).map((s) => <option key={s.TenderSourceID} value={s.TenderSourceID}>{s.Name}</option>)}
            </select>
            <input className="input" placeholder="Buyer / organization..." value={organization} onChange={(e) => setOrganization(e.target.value)} style={{ minWidth: 180 }} />
            <select className="select" value={businessGroup} onChange={(e) => setBusinessGroup(e.target.value)}>
              <option value="">All business groups</option>
              {(businessGroups.data?.items ?? []).map((b) => <option key={b.Code} value={b.Code}>{b.Name} ({b.ProductGroupCount})</option>)}
            </select>
            <select className="select" value={confidenceMin} onChange={(e) => setConfidenceMin(e.target.value)}>
              <option value="">Any confidence</option>
              <option value="70">Confidence ≥70</option>
              <option value="40">Confidence ≥40</option>
            </select>
            <select className="select" value={dataQuality} onChange={(e) => setDataQuality(e.target.value)}>
              <option value="">Any data quality</option>
              <option value="Complete">Complete</option>
              <option value="Partial">Partial</option>
              <option value="Sparse">Sparse</option>
            </select>
            <input className="input" type="date" title="Published from" value={fromPublication} onChange={(e) => setFromPublication(e.target.value)} />
            <input className="input" type="date" title="Published to" value={toPublication} onChange={(e) => setToPublication(e.target.value)} />
            <input className="input" type="date" title="Deadline from" value={fromDeadline} onChange={(e) => setFromDeadline(e.target.value)} />
            <input className="input" type="date" title="Deadline to" value={toDeadline} onChange={(e) => setToDeadline(e.target.value)} />
            {!preset?.exportOnly ? (
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={exportOnly} onChange={(e) => setExportOnly(e.target.checked)} />
                Export only
              </label>
            ) : null}
          </div>
        ) : null}
        {list.loading ? <Loading /> : list.error ? <div className="alert alert-error">{list.error}</div> : list.data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Title</th><th>Organization</th><th>Country</th><th>Sector</th><th>Type</th><th>Deadline</th><th>Value</th><th>Relevance</th><th>Confidence</th><th>Verified</th><th></th></tr></thead>
              <tbody>
                {list.data.items.map((opp) => (
                  <tr key={opp.TenderOpportunityID}>
                    <td><Link href={`/tenders/${opp.TenderOpportunityID}`}><b>{opp.Title}</b></Link></td>
                    <td>{opp.Organization ?? '—'}</td>
                    <td>
                      {opp.Country ?? '—'}
                      {opp.Region ? <div style={{ marginTop: 2, fontSize: 11, color: 'var(--text-muted)' }}>{opp.Region}</div> : null}
                    </td>
                    <td>
                      {opp.Sector ?? '—'}
                      {opp.ProductGroupName ? (
                        <div style={{ marginTop: 4 }}><Badge tone="info">{opp.ProductGroupName}</Badge></div>
                      ) : null}
                    </td>
                    <td><Badge tone={typeTone(opp.OpportunityType)}>{opportunityTypeLabel(opp.OpportunityType)}</Badge></td>
                    <td>{opp.DeadlineDate ? <span style={{ color: new Date(opp.DeadlineDate) <= new Date(Date.now() + 7 * 86400000) ? 'var(--warning)' : 'inherit' }}>{fmtDate(opp.DeadlineDate)}</span> : '—'}</td>
                    <td>{opp.EstimatedValue != null ? `${opp.Currency || ''} ${fmtMoney(opp.EstimatedValue)}` : '—'}</td>
                    <td><Badge tone={relevanceTone(opp.RelevanceScore)}>{relevanceLabel(opp.RelevanceScore)}</Badge></td>
                    <td>
                      {opp.Confidence != null ? (
                        <span title={`Data quality: ${opp.DataQuality ?? '—'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <b>{opp.Confidence}</b>
                          <Badge tone={dqTone(opp.DataQuality)}>{opp.DataQuality ?? '—'}</Badge>
                        </span>
                      ) : '—'}
                    </td>
                    <td>{opp.VerificationStatus === 'Verified' ? <Badge tone="success">Verified</Badge> : <Badge tone="neutral">Unverified</Badge>}</td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => void toggleSave(opp)}>
                        <Icon name="bookmark" type={opp.IsSaved ? 'solid' : 'regular'} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="briefcase" message="No opportunities found. Try adjusting filters or collecting from data sources." />}
      </Card>
      <Pagination page={page} total={list.data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {/* Manual tender entry */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Tender"
        wide
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveTender()} busy={creating}>Create</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Title" required>
            <input className="input" value={form.Title} onChange={(e) => setField('Title', e.target.value)} placeholder="e.g. Supply of laboratory equipment" />
          </Field>
          <Field label="Source URL" required hint="Link to the tender notice.">
            <input className="input" value={form.SourceUrl} onChange={(e) => setField('SourceUrl', e.target.value)} placeholder="https://..." />
          </Field>
          <div className="form-row">
            <Field label="Organization">
              <input className="input" value={form.Organization} onChange={(e) => setField('Organization', e.target.value)} placeholder="Procuring entity" />
            </Field>
            <Field label="Country">
              <input className="input" value={form.Country} onChange={(e) => setField('Country', e.target.value)} placeholder="Ethiopia" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Sector">
              <input className="input" value={form.Sector} onChange={(e) => setField('Sector', e.target.value)} placeholder="Health, Construction…" />
            </Field>
            <Field label="Source Reference">
              <input className="input" value={form.SourceReference} onChange={(e) => setField('SourceReference', e.target.value)} placeholder="Tender number" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Publication Date" hint="YYYY-MM-DD">
              <input className="input" value={form.PublicationDate} onChange={(e) => setField('PublicationDate', e.target.value)} placeholder="2026-01-15" />
            </Field>
            <Field label="Deadline Date" hint="YYYY-MM-DD">
              <input className="input" value={form.DeadlineDate} onChange={(e) => setField('DeadlineDate', e.target.value)} placeholder="2026-02-20" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Estimated Value">
              <input className="input" type="number" min="0" step="1000" value={form.EstimatedValue} onChange={(e) => setField('EstimatedValue', e.target.value)} placeholder="1500000" />
            </Field>
            <Field label="Currency" hint="e.g. ETB">
              <input className="input" value={form.Currency} onChange={(e) => setField('Currency', e.target.value)} maxLength={10} placeholder="ETB" />
            </Field>
          </div>
          <Field label="Region" hint="Macro-geography when the source provides one, e.g. Africa, Global.">
            <input className="input" value={form.Region} onChange={(e) => setField('Region', e.target.value)} placeholder="Africa" />
          </Field>
          <Field label="Description">
            <textarea className="textarea" rows={4} value={form.Description} onChange={(e) => setField('Description', e.target.value)} placeholder="Scope, requirements, contact details…" />
          </Field>
          <Field label="Opportunity Type" hint="Auto-detect classifies from the title and description unless a type is chosen.">
            <select className="select" value={form.OpportunityType} onChange={(e) => setField('OpportunityType', e.target.value)}>
              <option value="">Auto-detect</option>
              {['TENDER', 'RFQ', 'BUYER_LEAD', 'TRADE_INTELLIGENCE', 'MARKET_SIGNAL'].map((t) => (
                <option key={t} value={t}>{opportunityTypeLabel(t)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
