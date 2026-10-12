'use client';

import { useState } from 'react';
import { Guard, RequireRole } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Modal, Field, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { fmtDateTime } from '@/lib/format';
import { toast } from '@/components/Toast';
import type { TenderInterestProfile } from '@/lib/types';

const MANAGE_ROLES = ['Administrator', 'Marketing Manager'];
const ALL_TYPES = ['TENDER', 'RFQ', 'BUYER_LEAD', 'TRADE_INTELLIGENCE', 'MARKET_SIGNAL'];

function parseList(value: string): string[] | null {
  const items = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

function joinList(value: string[] | null | undefined): string {
  return (value ?? []).join(', ');
}

function InterestProfilesInner() {
  const { data, loading, error, reload } = useFetch<{ items: TenderInterestProfile[] }>('/tenders/interest-profiles', []);
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [sectors, setSectors] = useState('');
  const [keywords, setKeywords] = useState('');
  const [countries, setCountries] = useState('');
  const [minValue, setMinValue] = useState('');
  const [maxValue, setMaxValue] = useState('');
  const [currency, setCurrency] = useState('ETB');
  const [organizations, setOrganizations] = useState('');
  const [productGroupCodes, setProductGroupCodes] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [businessGroupCodes, setBusinessGroupCodes] = useState('');
  const [isActive, setIsActive] = useState(true);

  function resetForm() {
    setName(''); setSectors(''); setKeywords(''); setCountries('');
    setMinValue(''); setMaxValue(''); setCurrency('ETB'); setIsActive(true); setEditId(null);
    setOrganizations(''); setProductGroupCodes(''); setTypes([]); setBusinessGroupCodes('');
  }

  function toggleType(type: string) {
    setTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]));
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
  }

  function openEdit(profile: TenderInterestProfile) {
    setEditId(profile.InterestProfileID);
    setName(profile.Name);
    setSectors(joinList(profile.Sectors));
    setKeywords(joinList(profile.Keywords));
    setCountries(joinList(profile.Countries));
    setMinValue(profile.MinValue != null ? String(profile.MinValue) : '');
    setMaxValue(profile.MaxValue != null ? String(profile.MaxValue) : '');
    setCurrency(profile.Currency || 'ETB');
    setOrganizations(joinList(profile.Organizations));
    setProductGroupCodes(joinList(profile.ProductGroupCodes));
    setTypes(profile.Types ?? []);
    setBusinessGroupCodes(joinList(profile.BusinessGroupCodes));
    setIsActive(profile.IsActive);
    setModalOpen(true);
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = {
        Name: name.trim(),
        Sectors: parseList(sectors),
        Keywords: parseList(keywords),
        Countries: parseList(countries),
        MinValue: minValue.trim() ? Number(minValue) : null,
        MaxValue: maxValue.trim() ? Number(maxValue) : null,
        Currency: currency.trim() || null,
        Organizations: parseList(organizations),
        ProductGroupCodes: parseList(productGroupCodes),
        Types: types.length ? types : null,
        BusinessGroupCodes: parseList(businessGroupCodes),
        IsActive: isActive,
      };
      if (editId) {
        await api(`/tenders/interest-profiles/${editId}`, { method: 'PUT', body });
        toast.success('Profile updated — relevance scores recalculating in the background');
      } else {
        await api('/tenders/interest-profiles', { method: 'POST', body });
        toast.success('Profile created — relevance scores recalculating in the background');
      }
      setModalOpen(false);
      resetForm();
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(profile: TenderInterestProfile) {
    if (!window.confirm(`Delete profile "${profile.Name}"? Existing scores are kept until the next recalculation.`)) return;
    try {
      await api(`/tenders/interest-profiles/${profile.InterestProfileID}`, { method: 'DELETE' });
      toast.success('Profile deleted — relevance scores recalculating in the background');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete profile');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Interest Profiles</h1>
          <div className="sub">
            Define the sectors, keywords, countries, budget ranges, organizations, product groups, types and business
            units the organisation targets. Changes trigger a background relevance re-scoring of stored opportunities.
          </div>
        </div>
        <TourTrigger tourId="tenders-interest-profiles" />
        <Button onClick={openCreate}>
          <Icon name="plus" /> Add Profile
        </Button>
      </div>

      <Card title={`Profiles (${data?.items.length ?? 0})`} flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : data?.items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th><th>Sectors</th><th>Keywords</th><th>Countries</th>
                  <th>Budget Range</th><th>Types &amp; Units</th><th>Status</th><th>Updated</th><th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((profile) => (
                  <tr key={profile.InterestProfileID}>
                    <td><b>{profile.Name}</b></td>
                    <td>{profile.Sectors.length ? profile.Sectors.join(', ') : '—'}</td>
                    <td>{profile.Keywords.length ? profile.Keywords.join(', ') : '—'}</td>
                    <td>{profile.Countries.length ? profile.Countries.join(', ') : '—'}</td>
                    <td>
                      {profile.MinValue != null || profile.MaxValue != null
                        ? `${profile.Currency ?? ''} ${profile.MinValue ?? '—'} – ${profile.MaxValue ?? '—'}`.trim()
                        : '—'}
                    </td>
                    <td>
                      {(profile.Types?.length || profile.ProductGroupCodes?.length || profile.BusinessGroupCodes?.length || profile.Organizations?.length) ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 260 }}>
                          {(profile.Types ?? []).map((t) => <Badge key={t} tone="info">{t}</Badge>)}
                          {(profile.ProductGroupCodes ?? []).map((c) => <Badge key={c} tone="primary">{c}</Badge>)}
                          {(profile.BusinessGroupCodes ?? []).map((c) => <Badge key={c} tone="accent">{c}</Badge>)}
                          {(profile.Organizations ?? []).length ? (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }} title={(profile.Organizations ?? []).join(', ')}>
                              {(profile.Organizations ?? []).length} org{(profile.Organizations ?? []).length === 1 ? '' : 's'}
                            </span>
                          ) : null}
                        </div>
                      ) : '—'}
                    </td>
                    <td>{profile.IsActive ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}</td>
                    <td style={{ fontSize: 12 }}>{profile.UpdatedAt ? fmtDateTime(profile.UpdatedAt) : profile.CreatedAt ? fmtDateTime(profile.CreatedAt) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(profile)} title="Edit"><Icon name="pen" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleDelete(profile)} title="Delete"><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="bullseye" message="No interest profiles yet. Add one to start scoring opportunities against your targets." />}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => { setModalOpen(false); resetForm(); }}
        title={editId ? 'Edit Interest Profile' : 'Add Interest Profile'}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setModalOpen(false); resetForm(); }}>Cancel</Button>
            <Button onClick={() => void save()} busy={saving}>{editId ? 'Update' : 'Create'}</Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Name" required>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Construction tenders — East Africa" />
          </Field>
          <Field label="Sectors" hint="Comma-separated. Matches the Sector column of an opportunity.">
            <input className="input" value={sectors} onChange={(e) => setSectors(e.target.value)} placeholder="Construction, Road Construction" />
          </Field>
          <Field label="Keywords" hint="Comma-separated. Matched against title and description.">
            <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="bridge, highway, rehabilitation" />
          </Field>
          <Field label="Countries" hint="Comma-separated.">
            <input className="input" value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="Ethiopia, Kenya" />
          </Field>
          <Field label="Organizations" hint="Comma-separated buyer/organization names (matched in either direction).">
            <input className="input" value={organizations} onChange={(e) => setOrganizations(e.target.value)} placeholder="Addis Procurement, Ethiopian Airlines" />
          </Field>
          <Field label="Product Groups" hint="Comma-separated codes from the product taxonomy, e.g. COFFEE, PENS_STATIONERY.">
            <input className="input" value={productGroupCodes} onChange={(e) => setProductGroupCodes(e.target.value)} placeholder="COFFEE, PENS_STATIONERY" />
          </Field>
          <Field label="Opportunity Types" hint="Leave all unchecked to score every type equally.">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ALL_TYPES.map((t) => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={types.includes(t)} onChange={() => toggleType(t)} /> {t}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Business Units" hint="Comma-separated business group codes, e.g. KCC, BPN, BPL. Mapped via the product group.">
            <input className="input" value={businessGroupCodes} onChange={(e) => setBusinessGroupCodes(e.target.value)} placeholder="KCC, BPN" />
          </Field>
          <div className="form-row">
            <Field label="Min Value">
              <input className="input" type="number" min="0" step="1000" value={minValue} onChange={(e) => setMinValue(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Max Value">
              <input className="input" type="number" min="0" step="1000" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} placeholder="Any" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Currency">
              <input className="input" value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="ETB" maxLength={10} />
            </Field>
            <Field label="Active">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Include in scoring
              </label>
            </Field>
          </div>
        </div>
      </Modal>
    </>
  );
}

export default function TendersInterestProfilesPage() {
  return (
    <Guard>
      <RequireRole roles={MANAGE_ROLES}>
        <InterestProfilesInner />
      </RequireRole>
    </Guard>
  );
}
