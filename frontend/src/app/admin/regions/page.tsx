'use client';

import { useState, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Modal, Field, Icon } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import type { Region, Outlet } from '@/lib/types';

/* ─── Region Modal ─────────────────────────────────────────────────── */

function RegionModal({ region, onClose, onDone }: {
  region: Region | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(region?.RegionName ?? '');
  const [country, setCountry] = useState(region?.Country ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) { toast.error('Region name is required'); return; }
    if (!country.trim()) { toast.error('Country is required'); return; }
    setBusy(true);
    try {
      const body = { name: name.trim(), country: country.trim() };
      if (region) {
        await api(`/admin/regions/${region.RegionID}`, { method: 'PUT', body });
        toast.success('Region updated');
      } else {
        await api('/admin/regions', { method: 'POST', body });
        toast.success('Region created');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Field label="Name" required>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Addis Ababa" />
      </Field>
      <Field label="Country" required>
        <input className="input" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Ethiopia" />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} busy={busy}>{region ? 'Save changes' : 'Create'}</Button>
      </div>
    </div>
  );
}

/* ─── Outlet Modal ─────────────────────────────────────────────────── */

function OutletModal({ outlet, regions, onClose, onDone }: {
  outlet: Outlet | null;
  regions: Region[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: outlet?.OutletName ?? '',
    city: outlet?.City ?? '',
    regionId: outlet?.RegionID ?? 0,
    isActive: true,
  });
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    if (!form.name.trim()) { toast.error('Outlet name is required'); return; }
    if (!form.city.trim()) { toast.error('City is required'); return; }
    if (!form.regionId) { toast.error('Region is required'); return; }
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        city: form.city.trim(),
        regionId: Number(form.regionId),
        isActive: form.isActive,
      };
      if (outlet) {
        await api(`/admin/outlets/${outlet.OutletID}`, { method: 'PUT', body });
        toast.success('Outlet updated');
      } else {
        await api('/admin/outlets', { method: 'POST', body });
        toast.success('Outlet created');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Field label="Name" required>
        <input className="input" value={form.name} onChange={set('name')} placeholder="e.g. Central Store" />
      </Field>
      <Field label="City" required>
        <input className="input" value={form.city} onChange={set('city')} placeholder="e.g. Addis Ababa" />
      </Field>
      <Field label="Region" required>
        <select className="select" value={form.regionId} onChange={(e) => setForm((f) => ({ ...f, regionId: Number(e.target.value) }))}>
          <option value={0}>— select —</option>
          {regions.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
      </Field>
      {outlet && (
        <Field label="Status">
          <label className="checkbox-check" style={{ marginTop: 28 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            <span>Active</span>
          </label>
        </Field>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} busy={busy}>{outlet ? 'Save changes' : 'Create'}</Button>
      </div>
    </div>
  );
}

/* ─── Inner page ───────────────────────────────────────────────────── */

function RegionsInner() {
  const { user } = useAuth();

  /* ── state ── */
  const [regionModal, setRegionModal] = useState<{ open: boolean; region?: Region }>({ open: false });
  const [outletModal, setOutletModal] = useState<{ open: boolean; outlet?: Outlet }>({ open: false });

  /* ── data ── */
  const { data: regionsData, loading: regionsLoading, error: regionsError, reload: reloadRegions } = useFetch<{ items: Region[] }>('/admin/regions');
  const { data: outletsData, loading: outletsLoading, error: outletsError, reload: reloadOutlets } = useFetch<{ items: Outlet[] }>('/admin/outlets');
  const { data: refRegions } = useFetch<{ items: Region[] }>('/reference/regions');

  /* ── region actions ── */
  async function deleteRegion(id: number, name: string) {
    if (!window.confirm(`Delete region "${name}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/regions/${id}`, { method: 'DELETE' });
      toast.success('Region deleted');
      void reloadRegions();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  /* ── outlet actions ── */
  async function deleteOutlet(id: number, name: string) {
    if (!window.confirm(`Delete outlet "${name}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/outlets/${id}`, { method: 'DELETE' });
      toast.success('Outlet deleted');
      void reloadOutlets();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  /* ── derived ── */
  const regions = regionsData?.items ?? [];
  const outlets = outletsData?.items ?? [];
  const refRegionList = refRegions?.items ?? [];

  /* ── helper: outlet count per region ── */
  const outletCount = (regionId: number) => outlets.filter((o) => o.RegionID === regionId).length;

  return (
    <>
      {/* ── Page head ── */}
      <div className="page-head">
        <div>
          <h1>Regions &amp; Outlets</h1>
            <div className="sub">Manage geographic regions and outlet locations.</div>
          </div>
          <div className="actions">
            <TourTrigger tourId="admin-regions" />
          </div>
        </div>

      {/* ═══════════════════════════════════════════════════════════════
          REGIONS
          ═══════════════════════════════════════════════════════════════ */}
      <Card
        title={`Regions (${regions.length})`}
        actions={<Button size="sm" onClick={() => setRegionModal({ open: true })}><Icon name="plus" /> New Region</Button>}
        flush
      >
        {regionsLoading ? <Loading /> : regionsError ? (
          <div className="alert alert-error">{regionsError}</div>
        ) : regions.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Country</th>
                  <th>Outlet Count</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.RegionID}>
                    <td><b>{r.RegionName}</b></td>
                    <td>{r.Country}</td>
                    <td><Badge tone="info">{outletCount(r.RegionID)}</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setRegionModal({ open: true, region: r })}><Icon name="pen" /></Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => void deleteRegion(r.RegionID, r.RegionName)}><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="map" message="No regions yet" action={<Button onClick={() => setRegionModal({ open: true })}><Icon name="plus" /> New Region</Button>} />
        )}
      </Card>

      {/* ═══════════════════════════════════════════════════════════════
          OUTLETS
          ═══════════════════════════════════════════════════════════════ */}
      <Card
        title={`Outlets (${outlets.length})`}
        actions={<Button size="sm" onClick={() => setOutletModal({ open: true })}><Icon name="plus" /> New Outlet</Button>}
        flush
        style={{ marginTop: 16 }}
      >
        {outletsLoading ? <Loading /> : outletsError ? (
          <div className="alert alert-error">{outletsError}</div>
        ) : outlets.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>City</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map((o) => (
                  <tr key={o.OutletID}>
                    <td><b>{o.OutletName}</b></td>
                    <td>{o.City}</td>
                    <td>{o.RegionName}</td>
                    <td><Badge tone="success">Active</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setOutletModal({ open: true, outlet: o })}><Icon name="pen" /></Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => void deleteOutlet(o.OutletID, o.OutletName)}><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="map-pin" message="No outlets yet" action={<Button onClick={() => setOutletModal({ open: true })}><Icon name="plus" /> New Outlet</Button>} />
        )}
      </Card>

      {/* ── Region Modal ── */}
      {regionModal.open ? (
        <Modal
          open
          onClose={() => setRegionModal({ open: false })}
          title={regionModal.region ? `Edit: ${regionModal.region.RegionName}` : 'New Region'}
          footer={<Button variant="ghost" onClick={() => setRegionModal({ open: false })}>Cancel</Button>}
        >
          <RegionModal
            region={regionModal.region ?? null}
            onClose={() => setRegionModal({ open: false })}
            onDone={() => { setRegionModal({ open: false }); void reloadRegions(); }}
          />
        </Modal>
      ) : null}

      {/* ── Outlet Modal ── */}
      {outletModal.open ? (
        <Modal
          open
          onClose={() => setOutletModal({ open: false })}
          title={outletModal.outlet ? `Edit: ${outletModal.outlet.OutletName}` : 'New Outlet'}
          footer={<Button variant="ghost" onClick={() => setOutletModal({ open: false })}>Cancel</Button>}
        >
          <OutletModal
            outlet={outletModal.outlet ?? null}
            regions={refRegionList}
            onClose={() => setOutletModal({ open: false })}
            onDone={() => { setOutletModal({ open: false }); void reloadOutlets(); }}
          />
        </Modal>
      ) : null}
    </>
  );
}

/* ─── Page wrapper ─────────────────────────────────────────────────── */

export default function RegionsPage() {
  return (
    <Guard>
      <RegionsInner />
    </Guard>
  );
}
