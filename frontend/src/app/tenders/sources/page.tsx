'use client';

import { useState } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Modal, Field, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { fmtDateTime } from '@/lib/format';
import { toast } from '@/components/Toast';
import type { TenderSource, CollectionResult, SourceTestResult } from '@/lib/types';

const SOURCE_TYPES = [
  { value: 'api', label: 'Official API' },
  { value: 'rss', label: 'RSS Feed' },
  { value: 'scraping', label: 'Web Scraping' },
] as const;

const SCHEDULES = ['1h', '6h', '12h', '24h'] as const;

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  Success: 'success',
  Failed: 'warning',
  Partial: 'neutral',
};

const MANAGE_ROLES = ['Administrator', 'Marketing Manager'];

function SourcesInner() {
  const { data, loading, error, reload } = useFetch<{ items: TenderSource[] }>('/tenders/sources', []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [collecting, setCollecting] = useState<number | null>(null);
  const [collectingAll, setCollectingAll] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [formTesting, setFormTesting] = useState(false);
  const [testPanel, setTestPanel] = useState<{ title: string; result: SourceTestResult } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<'api' | 'rss' | 'scraping'>('rss');
  const [url, setUrl] = useState('');
  const [apiConfig, setApiConfig] = useState('');
  // Only send ApiConfig when the user actually edited it — otherwise an admin
  // who cannot see the stored config would overwrite it with an empty string.
  const [apiConfigDirty, setApiConfigDirty] = useState(false);
  const [schedule, setSchedule] = useState('6h');
  const [rateLimitMs, setRateLimitMs] = useState('2000');
  const [robotsCompliance, setRobotsCompliance] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [aiAutoEnrich, setAiAutoEnrich] = useState(false);
  const [qualityScore, setQualityScore] = useState('70');
  const [restricted, setRestricted] = useState(false);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setName(''); setSourceType('rss'); setUrl(''); setApiConfig(''); setSchedule('6h');
    setRateLimitMs('2000'); setRobotsCompliance(true); setIsActive(true); setAiAutoEnrich(false); setEditId(null);
    setApiConfigDirty(false); setRestricted(false); setQualityScore('70');
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(source: TenderSource) {
    setEditId(source.TenderSourceID);
    setName(source.Name);
    setSourceType(source.SourceType);
    setUrl(source.URL);
    setApiConfig(source.ApiConfig || '');
    setApiConfigDirty(false);
    setSchedule(source.Schedule);
    setRateLimitMs(String(source.RateLimitMs));
    setRobotsCompliance(source.RobotsCompliance);
    setIsActive(source.IsActive);
    setAiAutoEnrich(source.AiAutoEnrich);
    setQualityScore(String(source.QualityScore ?? 70));
    setRestricted(source.Restricted);
    setModalOpen(true);
  }

  function formBody() {
    const body: Record<string, unknown> = {
      Name: name.trim(),
      SourceType: sourceType,
      URL: url.trim(),
      Schedule: schedule,
      RateLimitMs: Number(rateLimitMs) || 2000,
      RobotsCompliance: robotsCompliance,
      IsActive: isActive,
      AiAutoEnrich: aiAutoEnrich,
      QualityScore: Math.min(100, Math.max(0, Number(qualityScore) || 0)),
    };
    if (apiConfigDirty) body.ApiConfig = apiConfig.trim() || null;
    return body;
  }

  async function save() {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    try {
      const body = formBody();
      if (editId) {
        await api(`/tenders/sources/${editId}`, { method: 'PUT', body });
        toast.success('Source updated');
      } else {
        body.ApiConfig = apiConfig.trim() || null;
        await api('/tenders/sources', { method: 'POST', body });
        toast.success('Source created');
      }
      setModalOpen(false);
      resetForm();
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save source');
    } finally {
      setSaving(false);
    }
  }

  /** Tests the source without saving it and without inserting opportunities. */
  async function testForm() {
    if (!url.trim()) return;
    setFormTesting(true);
    try {
      // Reuse the stored configuration when the editor was left untouched.
      const result = editId && !apiConfigDirty
        ? await api<SourceTestResult>(`/tenders/sources/${editId}/test`, { method: 'POST' })
        : await api<SourceTestResult>('/tenders/sources/test', {
            method: 'POST',
            body: {
              Name: name.trim() || 'Test',
              SourceType: sourceType,
              URL: url.trim(),
              ApiConfig: apiConfig.trim() || null,
              Schedule: schedule,
              RateLimitMs: Number(rateLimitMs) || 2000,
              RobotsCompliance: robotsCompliance,
            },
          });
      setTestPanel({ title: `Test — ${name.trim() || url.trim()}`, result });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Source test failed');
    } finally {
      setFormTesting(false);
    }
  }

  async function testRow(source: TenderSource) {
    setTesting(source.TenderSourceID);
    try {
      const result = await api<SourceTestResult>(`/tenders/sources/${source.TenderSourceID}/test`, { method: 'POST' });
      setTestPanel({ title: `Test — ${source.Name}`, result });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Source test failed');
    } finally {
      setTesting(null);
    }
  }

  async function toggleActive(source: TenderSource) {
    setToggling(source.TenderSourceID);
    try {
      await api(`/tenders/sources/${source.TenderSourceID}`, {
        method: 'PUT',
        body: { IsActive: !source.IsActive },
      });
      toast.success(source.IsActive ? `${source.Name} deactivated` : `${source.Name} activated`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update source status');
    } finally {
      setToggling(null);
    }
  }

  async function toggleAi(source: TenderSource) {
    setToggling(source.TenderSourceID);
    try {
      await api(`/tenders/sources/${source.TenderSourceID}`, {
        method: 'PUT',
        body: { AiAutoEnrich: !source.AiAutoEnrich },
      });
      toast.success(source.AiAutoEnrich
        ? `${source.Name}: AI auto-enrichment off`
        : `${source.Name}: AI auto-enrichment on (new rows only)`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update AI enrichment setting');
    } finally {
      setToggling(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete source "${name}"? Associated opportunities will be preserved.`)) return;
    try {
      await api(`/tenders/sources/${id}`, { method: 'DELETE' });
      toast.success('Source deleted');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete source');
    }
  }

  async function collectOne(id: number) {
    setCollecting(id);
    try {
      const result = await api<CollectionResult>(`/tenders/sources/${id}/collect`, { method: 'POST' });
      const detail = `${result.newCount} new, ${result.duplicateCount} duplicate, ${result.failedCount} failed`;
      if (result.status === 'Failed') {
        toast.error(`Collection failed: ${result.error ?? 'unknown error'} (${detail})`);
      } else {
        toast.success(`Collection ${result.status}: ${result.opportunities.length} fetched, ${detail}${result.error ? ` — ${result.error}` : ''}`);
      }
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Collection failed');
    } finally {
      setCollecting(null);
    }
  }

  async function collectAll() {
    setCollectingAll(true);
    try {
      const result = await api<{ summary: { total: number; success: number; failed: number; totalOpportunities: number; totalFetched: number } }>(`/tenders/sources/collect-all`, { method: 'POST' });
      const s = result.summary;
      toast.success(`Collected from ${s.success}/${s.total} sources — ${s.totalOpportunities} new of ${s.totalFetched} fetched`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Collection failed');
    } finally {
      setCollectingAll(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tender Data Sources</h1>
          <div className="sub">Configure, test and monitor sources for automated tender collection.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <TourTrigger tourId="tenders-sources" />
          <Button variant="ghost" onClick={() => void collectAll()} busy={collectingAll}>
            <Icon name="rotate" /> Collect All
          </Button>
          <Button onClick={openCreate}>
            <Icon name="plus" /> Add Source
          </Button>
        </div>
      </div>

      <Card title={`Data Sources (${data?.items.length ?? 0})`} flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th>Type</th><th>URL</th><th>Schedule</th><th>Rate Limit</th><th>Quality</th>
                  <th>Robots</th><th>Active</th><th>AI</th><th>Last Run</th><th>Last Collected</th><th>Total</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((src) => (
                  <tr key={src.TenderSourceID}>
                    <td>
                      <b>{src.Name}</b>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                        {src.Restricted ? <Badge tone="warning">Restricted</Badge> : null}
                        {!src.IsActive && !src.Restricted ? <Badge tone="neutral">Inactive</Badge> : null}
                      </div>
                    </td>
                    <td><Badge tone={src.SourceType === 'api' ? 'primary' : src.SourceType === 'rss' ? 'success' : 'warning'}>{SOURCE_TYPES.find((t) => t.value === src.SourceType)?.label ?? src.SourceType}</Badge></td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={src.URL}>{src.URL}</td>
                    <td>{src.Schedule}</td>
                    <td>{src.RateLimitMs}ms</td>
                    <td><Badge tone={src.QualityScore >= 70 ? 'success' : src.QualityScore >= 40 ? 'warning' : 'neutral'}>{src.QualityScore}</Badge></td>
                    <td>{src.RobotsCompliance ? <Icon name="shield-check" /> : <Icon name="shield-halved" />}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={src.IsActive}
                        disabled={src.Restricted || toggling === src.TenderSourceID}
                        onChange={() => void toggleActive(src)}
                        title={src.Restricted ? 'This host is restricted and cannot be activated' : src.IsActive ? 'Deactivate' : 'Activate'}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={src.AiAutoEnrich}
                        disabled={toggling === src.TenderSourceID}
                        onChange={() => void toggleAi(src)}
                        title={src.AiAutoEnrich ? 'AI auto-enrichment on — turn off' : 'AI auto-enrichment off — turn on (enriches newly collected rows only)'}
                      />
                    </td>
                    <td>
                      {src.LastCollectionStatus ? <Badge tone={STATUS_TONE[src.LastCollectionStatus] ?? 'neutral'}>{src.LastCollectionStatus}</Badge> : '—'}
                      {src.LastCollectionError ? (
                        <div style={{ maxWidth: 220, marginTop: 4, fontSize: 11, color: 'var(--danger, #b91c1c)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={src.LastCollectionError}>
                          {src.LastCollectionError}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 12 }}>{src.LastCollectedAt ? fmtDateTime(src.LastCollectedAt) : 'Never'}</td>
                    <td>{src.TotalCollected}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => void testRow(src)} busy={testing === src.TenderSourceID} title="Test connection"><Icon name="flask" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void collectOne(src.TenderSourceID)} busy={collecting === src.TenderSourceID} disabled={src.Restricted} title={src.Restricted ? 'Restricted source' : 'Collect Now'}><Icon name="rotate" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(src)} title="Edit"><Icon name="pen" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleDelete(src.TenderSourceID, src.Name)} title="Delete"><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="satellite-dish" message="No data sources configured yet. Click 'Add Source' to create one." />}
      </Card>

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title={editId ? 'Edit Source' : 'Add Data Source'}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
            <Button variant="ghost" onClick={() => void testForm()} busy={formTesting}>Test</Button>
            <Button onClick={() => void save()} busy={saving}>{editId ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {restricted ? (
            <div className="alert alert-warning">
              This host is restricted: the source stays inactive and collection is disabled.
            </div>
          ) : null}
          <Field label="Name" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UN Global Procurement" />
          </Field>
          <Field label="Source Type" required>
            <select className="select" value={sourceType} onChange={(e) => setSourceType(e.target.value as 'api' | 'rss' | 'scraping')}>
              {SOURCE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>
          <Field label="URL" required>
            <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
          </Field>
          <Field label="Adapter Config (JSON)" hint="Field mappings, headers, selectors. Credentials stored server-side only. Leave unchanged to keep the stored configuration.">
            <textarea
              className="input"
              rows={4}
              value={apiConfig}
              onChange={(e) => { setApiConfig(e.target.value); setApiConfigDirty(true); }}
              placeholder='e.g. {"itemsPath":"data.tenders","fields":{"title":"title","sourceUrl":"url"}}'
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          </Field>
          <div className="form-row">
            <Field label="Schedule">
              <select className="select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                {SCHEDULES.map((s) => <option key={s} value={s}>Every {s}</option>)}
              </select>
            </Field>
            <Field label="Rate Limit (ms)">
              <input className="input" type="number" min="0" step="500" value={rateLimitMs} onChange={(e) => setRateLimitMs(e.target.value)} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Quality Score" hint="0-100; feeds relevance scoring (plan §17).">
              <input className="input" type="number" min="0" max="100" value={qualityScore} onChange={(e) => setQualityScore(e.target.value)} />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Robots.txt Compliance">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={robotsCompliance} onChange={(e) => setRobotsCompliance(e.target.checked)} /> Respect robots.txt
              </label>
            </Field>
            <Field label="Active">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: restricted ? 'not-allowed' : 'pointer', opacity: restricted ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={isActive && !restricted}
                  disabled={restricted}
                  onChange={(e) => setIsActive(e.target.checked)}
                /> Source is active
              </label>
            </Field>
          </div>
          <Field label="AI Auto-Enrichment" hint="Opt-in: after collection, newly inserted opportunities from this source get an AI summary + structured extraction. Existing rows and collection itself are never affected by AI.">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={aiAutoEnrich}
                onChange={(e) => setAiAutoEnrich(e.target.checked)}
              /> Automatically enrich new opportunities with AI
            </label>
          </Field>
        </div>
      </Modal>

      {/* Test result modal */}
      <Modal
        open={!!testPanel}
        onClose={() => setTestPanel(null)}
        title={testPanel ? testPanel.title : 'Source Test'}
        wide
        footer={<Button variant="ghost" onClick={() => setTestPanel(null)}>Close</Button>}
      >
        {testPanel ? <TestResultPanel result={testPanel.result} /> : null}
      </Modal>
    </>
  );
}

function TestResultPanel({ result }: { result: SourceTestResult }) {
  if (result.restricted) {
    return <div className="alert alert-warning">This host is restricted. No connection attempt was made.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        {result.ok
          ? <Badge tone="success">Connection OK</Badge>
          : <Badge tone="danger">Connection failed</Badge>}
        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          {result.durationMs}ms · {result.fetched} item{result.fetched === 1 ? '' : 's'}
        </span>
      </div>
      {result.error ? <div className="alert alert-error">{result.error}</div> : null}
      {result.sample.length ? (
        <div>
          <div className="label">Sample items</div>
          <ul style={{ paddingLeft: 18, fontSize: 13 }}>
            {result.sample.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {item.Title}
                {item.DeadlineDate ? <span style={{ color: 'var(--text-muted)' }}> — due {item.DeadlineDate.slice(0, 10)}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="hint">Nothing was saved: test runs do not insert opportunities.</div>
    </div>
  );
}

export default function TendersSourcesPage() {
  return (
    <Guard>
      <RequireRole roles={MANAGE_ROLES}>
        <SourcesInner />
      </RequireRole>
    </Guard>
  );
}
