'use client';

import { useState, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Modal, Field, Icon, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/format';
import type { WeeklySalesRow, BusinessGroup, Region, Outlet, Product, Customer, CustomerType, ProductPrice, ColorInfo } from '@/lib/types';

function emptyForm() {
  return {
    weekEnding: new Date().toISOString().slice(0, 10),
    businessGroupId: 0,
    productId: 0,
    regionId: 0,
    outletId: 0,
    customerId: 0,
    quantitySold: '',
    unitPrice: '',
    notes: '',
    colorId: 0,
    productSize: '',
    productCategory: '',
    specRows: [] as { key: string; value: string }[],
  };
}

function productColorNames(p?: Product | null): string[] {
  if (!p) return [];
  if (p.colors && p.colors.length) return p.colors;
  if (p.Color) return p.Color.split(',').map((c) => c.trim()).filter(Boolean);
  return [];
}

function parseSpecs(raw: unknown): { key: string; value: string }[] {
  if (!raw) return [];
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v == null ? '' : String(v) }));
    }
  } catch { /* not JSON — treat as empty */ }
  return [];
}

function specsToJson(rows: { key: string; value: string }[]): string | null {
  const entries = rows.filter((r) => r.key.trim() !== '');
  if (entries.length === 0) return null;
  return JSON.stringify(Object.fromEntries(entries.map((r) => [r.key.trim(), r.value])));
}

function SpecsEditor({ rows, onChange }: { rows: { key: string; value: string }[]; onChange: (rows: { key: string; value: string }[]) => void }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="input"
            value={row.key}
            placeholder="Specification"
            onChange={(e) => { const next = [...rows]; next[idx] = { ...next[idx], key: e.target.value }; onChange(next); }}
            style={{ flex: 1 }}
          />
          <input
            className="input"
            value={row.value}
            placeholder="Value"
            onChange={(e) => { const next = [...rows]; next[idx] = { ...next[idx], value: e.target.value }; onChange(next); }}
            style={{ flex: 1.5 }}
          />
          <Button size="sm" variant="danger-ghost" onClick={() => onChange(rows.filter((_, i) => i !== idx))}><Icon name="trash" /></Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" onClick={() => onChange([...rows, { key: '', value: '' }])}><Icon name="plus" /> Add spec</Button>
    </div>
  );
}

function WeeklySalesForm({ groups, regions, outlets, products, customers, customerTypes, row, onDone }: {
  groups: BusinessGroup[];
  regions: Region[];
  outlets: Outlet[];
  products: Product[];
  customers: Customer[];
  customerTypes: CustomerType[];
  row?: WeeklySalesRow;
  onDone: (msg: string) => void;
}) {
  const [form, setForm] = useState(() => {
    if (!row) return emptyForm();
    return {
      weekEnding: row.WeekEnding.slice(0, 10),
      businessGroupId: row.BusinessGroupID ?? 0,
      productId: row.ProductID ?? 0,
      regionId: row.RegionID ?? 0,
      outletId: row.OutletID ?? 0,
      customerId: row.CustomerID ?? 0,
      quantitySold: String(row.QuantitySold ?? ''),
      unitPrice: String(row.UnitPrice ?? ''),
      notes: row.Notes ?? '',
      colorId: row.ColorID ?? 0,
      productSize: row.ProductSize ?? '',
      productCategory: row.ProductCategory ?? '',
      specRows: parseSpecs(row.ProductSpecs),
    };
  });
  const [busy, setBusy] = useState(false);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const { data: colorsData } = useFetch<{ items: ColorInfo[] }>('/reference/colors');
  const allColors = colorsData?.items ?? [];
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const selectedCustomer = customers.find((c) => c.CustomerID === Number(form.customerId));
  const selectedCustomerTypeId = selectedCustomer?.CustomerTypeID ?? 0;
  const selectedProduct = products.find((p) => p.ProductID === Number(form.productId));
  const colorOptions = allColors.filter((c) => productColorNames(selectedProduct).includes(c.Name));

  useEffect(() => {
    if (form.productId && selectedCustomerTypeId) {
      api<{ items: ProductPrice[] }>(`/reference/product-prices?productId=${form.productId}&customerTypeId=${selectedCustomerTypeId}`)
        .then((res) => setPrices(res.items))
        .catch(() => setPrices([]));
    } else {
      setPrices([]);
    }
  }, [form.productId, selectedCustomerTypeId]);

  useEffect(() => {
    if (prices.length > 0) {
      setForm((f) => ({ ...f, unitPrice: String(prices[0].UnitPrice) }));
    }
  }, [prices]);

  function filteredProducts() {
    if (!form.businessGroupId) return products;
    return products.filter((p) => p.BusinessGroupID === Number(form.businessGroupId));
  }

  function filteredCustomers() {
    if (!form.businessGroupId) return customers;
    return customers.filter((c) => c.BusinessGroupID === Number(form.businessGroupId));
  }

  async function submit() {
    if (!form.weekEnding) { toast.error('Select a week ending date'); return; }
    if (!form.businessGroupId) { toast.error('Select a business group'); return; }
    if (!form.productId) { toast.error('Select a product'); return; }
    if (!form.regionId) { toast.error('Select a region'); return; }
    if (!form.outletId) { toast.error('Select an outlet'); return; }
    if (!form.quantitySold || Number(form.quantitySold) <= 0) { toast.error('Enter a positive quantity'); return; }
    if (!form.unitPrice || Number(form.unitPrice) <= 0) { toast.error('Enter a positive unit price'); return; }
    setBusy(true);
    try {
      const body = {
        weekEnding: form.weekEnding,
        businessGroupId: Number(form.businessGroupId),
        productId: Number(form.productId),
        regionId: Number(form.regionId),
        outletId: Number(form.outletId),
        customerId: form.customerId ? Number(form.customerId) : null,
        quantitySold: Number(form.quantitySold),
        unitPrice: Number(form.unitPrice),
        notes: form.notes || null,
        colorId: form.colorId || null,
        productSize: form.productSize || null,
        productCategory: form.productCategory || null,
        productSpecs: specsToJson(form.specRows),
      };
      if (row) {
        await api(`/weekly-sales/${row.WeeklySalesID}`, { method: 'PUT', body });
        onDone('Weekly sales entry updated');
      } else {
        await api('/weekly-sales', { method: 'POST', body });
        onDone('Weekly sales entry created');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="form-row">
        <Field label="Week ending (Sun)" required>
          <input className="input" type="date" value={form.weekEnding} onChange={set('weekEnding')} />
        </Field>
        <Field label="Business group" required>
          <select className="select" value={form.businessGroupId} onChange={(e) => {
            setForm((f) => ({ ...f, businessGroupId: Number(e.target.value), productId: 0, customerId: 0, unitPrice: '', colorId: 0 }));
          }}>
            <option value={0}>— select —</option>
            {groups.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row">
        <Field label="Customer" required>
          <select className="select" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: Number(e.target.value) }))}>
            <option value={0}>— select —</option>
            {filteredCustomers().map((c) => <option key={c.CustomerID} value={c.CustomerID}>{c.Name} ({c.CustomerTypeName || c.CustomerType})</option>)}
          </select>
        </Field>
        {selectedCustomerTypeId > 0 && (
          <div className="field">
            <label className="label">Customer type</label>
            <Badge tone="accent">{selectedCustomer?.CustomerTypeName || '—'}</Badge>
          </div>
        )}
      </div>
      <div className="form-row">
        <Field label="Product" required>
          <select className="select" value={form.productId} onChange={(e) => {
            const id = Number(e.target.value);
            const p = products.find((x) => x.ProductID === id);
            const names = productColorNames(p);
            const ids = names
              .map((n) => allColors.find((c) => c.Name.toLowerCase() === n.toLowerCase())?.ColorID)
              .filter((v): v is number => v != null);
            setForm((f) => ({
              ...f,
              productId: id,
              unitPrice: p?.UnitPrice != null ? String(p.UnitPrice) : '',
              colorId: ids.length === 1 ? ids[0] : 0,
              productSize: p?.Size ?? '',
              productCategory: p?.Category ?? '',
              specRows: parseSpecs(p?.Specifications ?? null),
            }));
          }}>
            <option value={0}>— select —</option>
            {filteredProducts().map((p) => <option key={p.ProductID} value={p.ProductID}>{p.Name} ({p.ProductCode})</option>)}
          </select>
        </Field>
        <Field label="Region" required>
          <select className="select" value={form.regionId} onChange={set('regionId')}>
            <option value={0}>— select —</option>
            {regions.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
          </select>
        </Field>
      </div>
      {form.productId > 0 && (
        <>
          <div className="section-header" style={{ marginTop: 4 }}><h3>Product attributes</h3></div>
          <div className="form-row">
            <Field label="Color">
              <select className="select" value={form.colorId} onChange={(e) => setForm((f) => ({ ...f, colorId: Number(e.target.value) }))}>
                <option value={0}>— none (optional) —</option>
                {colorOptions.map((c) => <option key={c.ColorID} value={c.ColorID}>{c.Name}</option>)}
              </select>
              <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {colorOptions.length ? `Available for ${selectedProduct?.Name ?? 'this product'}` : 'This product has no linked colors'}
              </small>
            </Field>
            <Field label="Size">
              <input className="input" value={form.productSize} onChange={set('productSize')} placeholder="Auto-filled from product" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="Category">
              <input className="input" value={form.productCategory} onChange={set('productCategory')} placeholder="Auto-filled from product" />
            </Field>
            <div />
          </div>
          <Field label="Specifications">
            <SpecsEditor rows={form.specRows} onChange={(rows) => setForm((f) => ({ ...f, specRows: rows }))} />
          </Field>
        </>
      )}
      <div className="form-row">
        <Field label="Outlet" required>
          <select className="select" value={form.outletId} onChange={set('outletId')}>
            <option value={0}>— select —</option>
            {outlets.map((o) => <option key={o.OutletID} value={o.OutletID}>{o.OutletName} ({o.City})</option>)}
          </select>
        </Field>
        <Field label="Quantity sold" required>
          <input className="input" type="number" min="0" step="any" value={form.quantitySold} onChange={set('quantitySold')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Unit price (ETB)" required>
          <input className="input" type="number" min="0" step="0.01" value={form.unitPrice} onChange={set('unitPrice')} />
        </Field>
        <div />
      </div>
      <Field label="Notes">
        <textarea className="textarea" value={form.notes} onChange={set('notes')} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={() => void submit()} busy={busy}>{row ? 'Save changes' : <><Icon name="plus" /> Save entry</>}</Button>
      </div>
    </div>
  );
}

function WeeklySalesInner() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [weekEnding, setWeekEnding] = useState('');
  const [regionId, setRegionId] = useState('');
  const [businessGroupId, setBusinessGroupId] = useState('');
  const [customerTypeId, setCustomerTypeId] = useState('');
  const [status, setStatus] = useState('');
  const [colorId, setColorId] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; row?: WeeklySalesRow }>({ open: false });
  const [detail, setDetail] = useState<number | null>(null);

  const PAGE_SIZE = 20;

  useEffect(() => { setPage(1); }, [weekEnding, regionId, businessGroupId, customerTypeId, status, colorId, search]);

  const filters = [
    weekEnding ? `weekEnding=${encodeURIComponent(weekEnding)}` : '',
    regionId ? `regionId=${encodeURIComponent(regionId)}` : '',
    businessGroupId ? `businessGroupId=${encodeURIComponent(businessGroupId)}` : '',
    customerTypeId ? `customerTypeId=${encodeURIComponent(customerTypeId)}` : '',
    status ? `status=${encodeURIComponent(status)}` : '',
    colorId ? `colorId=${encodeURIComponent(colorId)}` : '',
    `page=${page}`,
    `pageSize=${PAGE_SIZE}`,
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: WeeklySalesRow[]; total: number }>(`/weekly-sales?${filters}`, [weekEnding, regionId, businessGroupId, customerTypeId, status, colorId, page]);
  const detailRow = useFetch<WeeklySalesRow>(detail != null ? `/weekly-sales/${detail}` : null, [detail]);
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const regions = useFetch<{ items: Region[] }>('/reference/regions');
  const outlets = useFetch<{ items: Outlet[] }>('/reference/outlets');
  const products = useFetch<{ items: Product[] }>('/reference/products');
  const customers = useFetch<{ items: Customer[] }>('/reference/customers');
  const customerTypes = useFetch<{ items: CustomerType[] }>('/reference/customer-types');
  const colors = useFetch<{ items: ColorInfo[] }>('/reference/colors');

  const items = data?.items ?? [];
  const filteredItems = search
    ? items.filter((r) =>
        r.ProductName?.toLowerCase().includes(search.toLowerCase()) ||
        r.ProductCode?.toLowerCase().includes(search.toLowerCase()) ||
        r.CustomerName?.toLowerCase().includes(search.toLowerCase()) ||
        r.OutletName?.toLowerCase().includes(search.toLowerCase()) ||
        r.SubmittedByName?.toLowerCase().includes(search.toLowerCase()) ||
        r.Notes?.toLowerCase().includes(search.toLowerCase())
      )
    : items;
  const totalRevenue = items.reduce((s, r) => s + (r.Revenue ?? 0), 0);
  const totalQty = items.reduce((s, r) => s + (r.QuantitySold ?? 0), 0);
  const isFieldOfficer = user?.role === 'Field Officer';

  async function remove(row: WeeklySalesRow) {
    if (!window.confirm(`Delete weekly sales entry for ${row.ProductName} (${fmtDate(row.WeekEnding)})?`)) return;
    try {
      await api(`/weekly-sales/${row.WeeklySalesID}`, { method: 'DELETE' });
      toast.success('Entry deleted');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Weekly Sales</h1>
          <div className="sub">Point-of-sale quantity and revenue captured by field teams each week.</div>
        </div>
        <div className="actions">
          <TourTrigger tourId="weekly-sales" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> Record weekly sale</Button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="card"><div className="stat-card"><div className="label">Entries</div><div className="value">{data?.total ?? 0}</div></div></div>
        <div className="card"><div className="stat-card"><div className="label">Quantity sold</div><div className="value">{totalQty.toLocaleString()}</div></div></div>
        <div className="card"><div className="stat-card"><div className="label">Revenue (ETB)</div><div className="value">{fmtMoney(totalRevenue)}</div></div></div>
      </div>

      <Card title={`Entries (${data?.total ?? 0})`} flush>
        <div className="filters">
          <input className="input" type="search" placeholder="Search product, customer, outlet..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 220 }} />
          <input className="input" type="date" value={weekEnding} onChange={(e) => setWeekEnding(e.target.value)} aria-label="Week ending" />
          <select className="select" value={regionId} onChange={(e) => setRegionId(e.target.value)}>
            <option value="">All regions</option>
            {regions.data?.items.map((r) => <option key={r.RegionID} value={r.RegionID}>{r.RegionName}</option>)}
          </select>
          <select className="select" value={businessGroupId} onChange={(e) => setBusinessGroupId(e.target.value)}>
            <option value="">All business groups</option>
            {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name}</option>)}
          </select>
          <select className="select" value={customerTypeId} onChange={(e) => setCustomerTypeId(e.target.value)}>
            <option value="">All customer types</option>
            {customerTypes.data?.items.map((ct) => <option key={ct.CustomerTypeID} value={ct.CustomerTypeID}>{ct.Name}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="Submitted">Submitted</option>
            <option value="Reconciled">Reconciled</option>
            <option value="Rejected">Rejected</option>
          </select>
          <select className="select" value={colorId} onChange={(e) => setColorId(e.target.value)}>
            <option value="">All colors</option>
            {colors.data?.items.map((c) => <option key={c.ColorID} value={c.ColorID}>{c.Name}</option>)}
          </select>
        </div>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : filteredItems.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Week ending</th><th>Product</th><th>Group</th><th>Region</th><th>Outlet</th>
                  <th>Customer</th><th>Type</th>
                  <th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit price</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th><th>Status</th><th>Submitted by</th><th>Notes</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((r) => (
                  <tr key={r.WeeklySalesID}>
                    <td>{fmtDate(r.WeekEnding)}</td>
                    <td>
                      <div className="cell-product">
                        <b>{r.ProductName}</b>
                        <div className="cell-product-sub">{r.ProductCode} · {r.Category}{r.ProductColor ? ` · ${r.ProductColor}` : ''}{r.ProductSize ? ` · Size ${r.ProductSize}` : ''}</div>
                      </div>
                    </td>
                    <td><Badge tone="accent">{r.BusinessGroupName}</Badge></td>
                    <td>{r.RegionName}</td>
                    <td>{r.OutletName}</td>
                    <td>{r.CustomerName ?? '—'}</td>
                    <td>{r.CustomerTypeName ? <Badge tone="info">{r.CustomerTypeName}</Badge> : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.QuantitySold.toLocaleString()}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(r.UnitPrice)}</td>
                    <td style={{ textAlign: 'right' }}><b>{fmtMoney(r.Revenue)}</b></td>
                    <td><Badge tone={r.Status === 'Submitted' ? 'accent' : r.Status === 'Reconciled' ? 'success' : 'danger'}>{r.Status}</Badge></td>
                    <td>{r.SubmittedByName}</td>
                    <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.Notes ?? '—'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <Button size="sm" variant="ghost" onClick={() => setDetail(r.WeeklySalesID)}>View</Button>
                      {(isFieldOfficer && r.SubmittedBy === user?.userId) || !isFieldOfficer ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setModal({ open: true, row: r })}>Edit</Button>
                          <Button size="sm" variant="danger-ghost" onClick={() => void remove(r)}>Delete</Button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="cash-register" message="No weekly sales recorded yet"
            action={<Button onClick={() => setModal({ open: true })}><Icon name="plus" /> Record weekly sale</Button>} />
        )}
      </Card>

      <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {detail != null ? (
        <Modal open onClose={() => setDetail(null)} title={`Weekly sale #${detail}`} wide
          footer={<Button variant="ghost" onClick={() => setDetail(null)}>Close</Button>}>
          {detailRow.loading ? <Loading /> : detailRow.error ? <div className="alert alert-error">{detailRow.error}</div> : detailRow.data ? (
            (() => {
              const d = detailRow.data;
              const specs = parseSpecs(d.ProductSpecs);
              const typeLabel = d.CustomerTypeName && d.CustomerType && d.CustomerTypeName !== d.CustomerType
                ? `${d.CustomerTypeName} · ${d.CustomerType}`
                : (d.CustomerTypeName ?? d.CustomerType ?? '');
              return (
                <div>
                  <div className="grid-2">
                    <div>
                      <p style={{ marginTop: 0 }}><b>Week ending:</b> {fmtDate(d.WeekEnding)}</p>
                      <p style={{ margin: 0 }}><b>Product:</b> {d.ProductName} ({d.ProductCode})</p>
                      <p style={{ margin: 0 }}><b>Category:</b> {d.Category || '—'}</p>
                      <p style={{ margin: 0 }}><b>Business group:</b> {d.BusinessGroupName}{d.BusinessGroupCode ? ` (${d.BusinessGroupCode})` : ''}</p>
                      <p style={{ margin: 0 }}><b>Region:</b> {d.RegionName}{d.Country ? ` (${d.Country})` : ''}</p>
                      <p style={{ margin: 0 }}><b>Outlet:</b> {d.OutletName} ({d.City})</p>
                      <p style={{ margin: 0 }}><b>Customer:</b> {d.CustomerName ?? '—'}{typeLabel ? ` (${typeLabel})` : ''}</p>
                    </div>
                    <div>
                      <p style={{ marginTop: 0 }}><b>Quantity:</b> {d.QuantitySold.toLocaleString()}</p>
                      <p style={{ margin: 0 }}><b>Unit price:</b> {fmtMoney(d.UnitPrice)}</p>
                      <p style={{ margin: 0 }}><b>Revenue:</b> <b>{fmtMoney(d.Revenue)}</b></p>
                      <p style={{ margin: 0 }}><b>Status:</b> <Badge tone={d.Status === 'Submitted' ? 'accent' : d.Status === 'Reconciled' ? 'success' : 'danger'}>{d.Status}</Badge></p>
                      <p style={{ margin: 0 }}><b>Color:</b> {d.ProductColor ?? '—'}</p>
                      <p style={{ margin: 0 }}><b>Size:</b> {d.ProductSize ?? '—'}</p>
                      <p style={{ margin: 0 }}><b>Category (saved):</b> {d.ProductCategory ?? '—'}</p>
                      <p style={{ margin: 0 }}><b>Created:</b> {fmtDateTime(d.CreatedAt)}</p>
                      <p style={{ margin: 0 }}><b>Last edited:</b> {fmtDateTime(d.UpdatedAt)}</p>
                    </div>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <b>Specifications:</b>
                    {specs.length > 0 ? (
                      <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                        {specs.map((s, i) => (
                          <div key={i} style={{ fontSize: 13 }}><span style={{ color: 'var(--text-muted)' }}>{s.key}:</span> {s.value}</div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}> —</span>
                    )}
                  </div>
                  <p style={{ marginTop: 14, marginBottom: 0 }}><b>Notes:</b> {d.Notes || '—'}</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>Submitted by {d.SubmittedByName}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
                    IDs — sale: {d.WeeklySalesID} · product: {d.ProductID} · business group: {d.BusinessGroupID} · region: {d.RegionID} · outlet: {d.OutletID} · customer: {d.CustomerID ?? '—'} · customer type: {d.CustomerTypeID ?? '—'} · submitter: {d.SubmittedBy}
                  </p>
                </div>
              );
            })()
          ) : null}
        </Modal>
      ) : null}

      <Modal open={modal.open} onClose={() => setModal({ open: false })} title={modal.row ? 'Edit weekly sale' : 'Record weekly sale'} wide
        footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Cancel</Button>}>
        {groups.loading || products.loading ? <Loading /> : (
          <WeeklySalesForm
            key={modal.row?.WeeklySalesID ?? 'new'}
            row={modal.row}
            groups={groups.data?.items ?? []}
            regions={regions.data?.items ?? []}
            outlets={outlets.data?.items ?? []}
            products={products.data?.items ?? []}
            customers={customers.data?.items ?? []}
            customerTypes={customerTypes.data?.items ?? []}
            onDone={(msg) => { toast.success(msg); setModal({ open: false }); void reload(); }}
          />
        )}
      </Modal>
    </>
  );
}

export default function WeeklySalesPage() {
  return (
    <Guard>
      <WeeklySalesInner />
    </Guard>
  );
}
