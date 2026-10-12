'use client';

import { useState, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Modal, Field, Badge, Icon, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import type { Customer, BusinessGroup, Region, Outlet, CustomerType } from '@/lib/types';

function CustomerTypeManager({ types, onClose, onDone }: {
  types: CustomerType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!newName.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      await api('/admin/customer-types', { method: 'POST', body: { name: newName.trim() } });
      toast.success('Type created'); setNewName(''); void onDone();
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function handleUpdate(id: number) {
    if (!editName.trim()) { toast.error('Name is required'); return; }
    setBusy(true);
    try {
      await api(`/admin/customer-types/${id}`, { method: 'PUT', body: { name: editName.trim() } });
      toast.success('Type updated'); setEditingId(null); void onDone();
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed'); }
    finally { setBusy(false); }
  }

  async function handleToggle(id: number) {
    try {
      await api(`/admin/customer-types/${id}/active`, { method: 'PUT' });
      toast.success('Type toggled'); void onDone();
    } catch (err) { toast.error(err instanceof ApiError ? err.message : 'Failed'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New type name..." style={{ flex: 1 }} />
        <Button onClick={() => void handleCreate()} busy={busy}>Add</Button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {types.map((t) => (
          <div key={t.CustomerTypeID} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6 }}>
            {editingId === t.CustomerTypeID ? (
              <>
                <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') void handleUpdate(t.CustomerTypeID); }} />
                <Button size="sm" onClick={() => void handleUpdate(t.CustomerTypeID)} busy={busy}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <span style={{ flex: 1 }}>{t.Name}</span>
                <Badge tone={t.IsActive ? 'success' : 'danger'}>{t.IsActive ? 'Active' : 'Inactive'}</Badge>
                <Button size="sm" variant="ghost" onClick={() => { setEditingId(t.CustomerTypeID); setEditName(t.Name); }}><Icon name="pen" /></Button>
                <Button size="sm" variant={t.IsActive ? 'danger-ghost' : 'success'} onClick={() => void handleToggle(t.CustomerTypeID)}>
                  <Icon name={t.IsActive ? 'ban' : 'check'} />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function CustomerModal({ customer, groups, regions, outlets, types, onClose, onDone }: {
  customer: Customer | null;
  groups: BusinessGroup[];
  regions: Region[];
  outlets: Outlet[];
  types: CustomerType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    customerCode: '',
    name: '',
    customerType: '',
    customerTypeId: 0,
    contactPerson: '',
    contactPhone: '',
    email: '',
    regionId: 0,
    outletId: 0,
    businessGroupId: 0,
    isActive: true,
    address: '',
    area: '',
    starRating: '',
    productInterest: '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (customer && customer.CustomerID) {
      setForm({
        customerCode: customer.CustomerCode,
        name: customer.Name,
        customerType: customer.CustomerType ?? '',
        customerTypeId: customer.CustomerTypeID ?? 0,
        contactPerson: customer.ContactPerson ?? '',
        contactPhone: customer.ContactPhone ?? '',
        email: customer.Email ?? '',
        regionId: customer.RegionID ?? 0,
        outletId: customer.OutletID ?? 0,
        businessGroupId: customer.BusinessGroupID ?? 0,
        isActive: customer.IsActive ?? true,
        address: customer.Address ?? '',
        area: customer.Area ?? '',
        starRating: customer.StarRating ?? '',
        productInterest: customer.ProductInterest ?? '',
      });
    }
  }, [customer]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    if (!form.customerCode.trim() || !form.name.trim()) { toast.error('Customer code and name are required'); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) { toast.error('Invalid email format'); return; }
    setBusy(true);
    try {
      const selectedType = types.find(t => t.CustomerTypeID === Number(form.customerTypeId));
      const body = {
        customerCode: form.customerCode.trim(),
        name: form.name.trim(),
        customerType: selectedType?.Name ?? (form.customerType || null),
        customerTypeId: form.customerTypeId ? Number(form.customerTypeId) : null,
        contactPerson: form.contactPerson || null,
        contactPhone: form.contactPhone || null,
        email: form.email || null,
        regionId: form.regionId ? Number(form.regionId) : null,
        outletId: form.outletId ? Number(form.outletId) : null,
        businessGroupId: form.businessGroupId ? Number(form.businessGroupId) : null,
        isActive: form.isActive,
        address: form.address || null,
        area: form.area || null,
        starRating: form.starRating || null,
        productInterest: form.productInterest || null,
      };
      if (customer) {
        await api(`/admin/customers/${customer.CustomerID}`, { method: 'PUT', body });
        toast.success('Customer updated');
      } else {
        await api('/admin/customers', { method: 'POST', body });
        toast.success('Customer created');
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
      <div className="form-row">
        <Field label="Customer code" required>
          <input className="input" value={form.customerCode} onChange={set('customerCode')} placeholder="C-001" disabled={!!customer} />
        </Field>
        <Field label="Name" required>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Company Name" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Customer type">
          <select className="select" value={form.customerTypeId} onChange={(e) => setForm(f => ({ ...f, customerTypeId: Number(e.target.value) }))}>
            <option value={0}>— select —</option>
            {types.map((t) => <option key={t.CustomerTypeID} value={t.CustomerTypeID}>{t.Name}</option>)}
          </select>
        </Field>
        <Field label="Category">
          <input className="input" value={form.customerType} onChange={set('customerType')} placeholder="e.g. Hotel (5-Star)" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Contact person">
          <input className="input" value={form.contactPerson} onChange={set('contactPerson')} placeholder="Contact person name" />
        </Field>
        <Field label="Status">
          <label className="checkbox-check" style={{ marginTop: 28 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            <span>Active</span>
          </label>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Contact phone">
          <input className="input" value={form.contactPhone} onChange={set('contactPhone')} placeholder="+251911234567" />
        </Field>
        <Field label="Email">
          <input className="input" value={form.email} onChange={set('email')} placeholder="contact@company.com" type="email" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Business group">
          <select className="select" value={form.businessGroupId} onChange={set('businessGroupId')}>
            <option value={0}>— select —</option>
            {groups.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name} ({g.Code})</option>)}
          </select>
        </Field>
        <Field label="Region">
          <select className="select" value={form.regionId} onChange={set('regionId')}>
            <option value={0}>— select —</option>
            {regions.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Outlet">
        <select className="select" value={form.outletId} onChange={set('outletId')}>
          <option value={0}>— select —</option>
          {outlets.map((o) => <option key={o.OutletID} value={o.OutletID}>{o.OutletName} ({o.City})</option>)}
        </select>
      </Field>
      <div className="form-row">
        <Field label="Address">
          <input className="input" value={form.address} onChange={set('address')} placeholder="Street address" />
        </Field>
        <Field label="Area">
          <input className="input" value={form.area} onChange={set('area')} placeholder="Area / Branch" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Star Rating">
          <input className="input" value={form.starRating} onChange={set('starRating')} placeholder="e.g. 5-Star" />
        </Field>
        <Field label="Product Interest">
          <input className="input" value={form.productInterest} onChange={set('productInterest')} placeholder="e.g. Buna Plate" />
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} busy={busy}>{customer ? 'Save changes' : 'Create'}</Button>
      </div>
    </div>
  );
}

function CustomersInner() {
  const { user } = useAuth();
  const [modal, setModal] = useState<{ open: boolean; customer?: Customer }>({ open: false });
  const [typesModal, setTypesModal] = useState(false);
  const [search, setSearch] = useState('');
  const [businessGroupFilter, setBusinessGroupFilter] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [custPage, setCustPage] = useState(1);
  const CUST_PAGE_SIZE = 25;

  const filterParams = [
    search ? `search=${encodeURIComponent(search)}` : '',
    businessGroupFilter ? `businessGroupId=${businessGroupFilter}` : '',
    customerTypeFilter ? `customerTypeId=${customerTypeFilter}` : '',
    regionFilter ? `regionId=${regionFilter}` : '',
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: Customer[] }>(
    `/admin/customers${filterParams ? `?${filterParams}` : ''}`,
    [search, businessGroupFilter, customerTypeFilter, regionFilter]
  );
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const outlets = useFetch<{ items: Outlet[] }>('/reference/outlets');
  const { data: typesData, loading: typesLoading, reload: reloadTypes } = useFetch<{ items: CustomerType[] }>('/admin/customer-types');
  const types = typesData?.items ?? [];

  async function toggleActive(c: Customer) {
    const activate = !c.IsActive;
    const label = activate ? 'activate' : 'deactivate';
    if (!window.confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} customer "${c.Name}"?`)) return;
    try {
      await api(`/admin/customers/${c.CustomerID}`, { method: 'PUT', body: { isActive: activate } });
      toast.success(`Customer ${label}d`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  async function handleDelete(c: Customer) {
    if (!window.confirm(`Delete customer "${c.Name}"? This cannot be undone.`)) return;
    try {
      await api(`/admin/customers/${c.CustomerID}`, { method: 'DELETE' });
      toast.success('Customer deleted');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  const filteredData = data?.items ?? [];
  const pagedData = filteredData.slice((custPage - 1) * CUST_PAGE_SIZE, custPage * CUST_PAGE_SIZE);

  // Summary stats
  const totalActive = filteredData.filter(c => c.IsActive).length;
  const totalInactive = filteredData.filter(c => !c.IsActive).length;

  const hasFilters = search || businessGroupFilter || customerTypeFilter || regionFilter;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Customers</h1>
          <div className="sub">
            {filteredData.length} customer{filteredData.length !== 1 ? 's' : ''}
            {hasFilters ? ' (filtered)' : ''}
            {' '}&mdash; {totalActive} active, {totalInactive} inactive
          </div>
        </div>
        <div className="actions">
          <TourTrigger tourId="admin-customers" />
          <Button variant="ghost" onClick={() => setTypesModal(true)}><Icon name="list" /> Manage Types</Button>
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New customer</Button>
        </div>
      </div>

      <div className="filters" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input
          className="input"
          placeholder="Search name, code, phone, address..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCustPage(1); }}
          style={{ minWidth: 260, flex: '1 1 260px' }}
        />
        <select className="select" value={businessGroupFilter} onChange={(e) => { setBusinessGroupFilter(e.target.value); setCustPage(1); }}>
          <option value="">All Business Groups</option>
          {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
        </select>
        <select className="select" value={customerTypeFilter} onChange={(e) => { setCustomerTypeFilter(e.target.value); setCustPage(1); }}>
          <option value="">All Customer Types</option>
          {types.map((t) => <option key={t.CustomerTypeID} value={t.CustomerTypeID}>{t.Name}</option>)}
        </select>
        <select className="select" value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); setCustPage(1); }}>
          <option value="">All Regions</option>
          {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setBusinessGroupFilter(''); setCustomerTypeFilter(''); setRegionFilter(''); setCustPage(1); }}>
            <Icon name="xmark" /> Clear
          </Button>
        )}
      </div>

      <Card title="Customer List" flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : filteredData.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ minWidth: 100 }}>Code</th>
                  <th style={{ minWidth: 180 }}>Name</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Address / Outlet</th>
                  <th>Contact</th>
                  <th>Business Group</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map((c) => (
                  <tr key={c.CustomerID}>
                    <td><Badge tone="primary">{c.CustomerCode}</Badge></td>
                    <td><b>{c.Name}</b></td>
                    <td style={{ fontSize: 12 }}>{c.CustomerType ?? '—'}</td>
                    <td><Badge tone="info">{c.CustomerTypeName ?? '—'}</Badge></td>
                    <td style={{ fontSize: 12 }}>{c.RegionName ?? '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 180 }}>
                      {c.Address && <div>{c.Address}</div>}
                      {c.Area && <div style={{ color: 'var(--text-muted)' }}>{c.Area}</div>}
                      {c.StarRating && <span style={{ display: 'inline-block', marginTop: 2 }}><Badge tone="warning">{c.StarRating}</Badge></span>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {c.ContactPhone && <div>{c.ContactPhone}</div>}
                      {c.ContactPerson && <div style={{ color: 'var(--text-muted)' }}>{c.ContactPerson}</div>}
                      {c.Email && <div style={{ color: 'var(--text-muted)' }}>{c.Email}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{c.BusinessGroupName ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Button size="sm" variant="ghost" onClick={() => setModal({ open: true, customer: c })} title="Edit"><Icon name="pen" /></Button>
                        <Button
                          size="sm"
                          variant={c.IsActive ? 'danger-ghost' : 'success'}
                          onClick={() => void toggleActive(c)}
                          title={c.IsActive ? 'Deactivate' : 'Activate'}
                        >
                          <Icon name={c.IsActive ? 'ban' : 'check'} />
                        </Button>
                        <Button size="sm" variant="danger-ghost" onClick={() => void handleDelete(c)} title="Delete">
                          <Icon name="trash" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="users" message="No customers found" action={<Button onClick={() => setModal({ open: true })}><Icon name="plus" /> New customer</Button>} />
        )}
      </Card>

      <Pagination page={custPage} total={filteredData.length} pageSize={CUST_PAGE_SIZE} onPageChange={setCustPage} />

      {modal.open ? (
        <Modal open onClose={() => setModal({ open: false })} title={modal.customer ? `Edit: ${modal.customer.Name}` : 'New customer'} wide footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Cancel</Button>}>
          {groups.loading || regions.loading || outlets.loading ? <Loading /> : (
            <CustomerModal
              key={modal.customer?.CustomerID ?? 'new'}
              customer={modal.customer ?? null}
              groups={groups.data?.items ?? []}
              regions={regions.data?.items ?? []}
              outlets={outlets.data?.items ?? []}
              types={types}
              onClose={() => setModal({ open: false })}
              onDone={() => { setModal({ open: false }); void reload(); }}
            />
          )}
        </Modal>
      ) : null}

      {typesModal ? (
        <Modal open onClose={() => setTypesModal(false)} title="Manage Customer Types" wide>
          {typesLoading ? <Loading /> : (
            <CustomerTypeManager types={types} onClose={() => setTypesModal(false)} onDone={() => void reloadTypes()} />
          )}
        </Modal>
      ) : null}
    </>
  );
}

export default function CustomersPage() {
  return (
    <Guard>
      <CustomersInner />
    </Guard>
  );
}