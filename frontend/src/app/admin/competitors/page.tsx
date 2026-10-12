'use client';

import { useState, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Icon, Modal, Field, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { fmtDate, fmtDateTime, fmtMoney, fmtPct } from '@/lib/format';
import { humanizeKey, formatSpecValue } from '@/components/ProductSpecs';
import type { CompetitorProductRow, CompetitorCatalogueRow, Product } from '@/lib/types';

const STATUS_TONES: Record<string, 'success' | 'warning' | 'neutral'> = {
  Active: 'success',
  Inactive: 'neutral',
  Expired: 'warning',
};

function gapClass(v: number | null): string {
  if (v == null) return 'gap-neutral';
  return v > 0 ? 'gap-positive' : v < 0 ? 'gap-negative' : 'gap-neutral';
}

function parseSpecs(raw: string | null): { key: string; value: string }[] {
  if (!raw) return [];
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      return Object.entries(obj as Record<string, unknown>).map(([key, value]) => ({
        key,
        value: value == null ? '' : String(value),
      }));
    }
  } catch { /* fall through */ }
  return [];
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

function ViewModal({ row, onClose }: { row: CompetitorProductRow; onClose: () => void }) {
  const specs = parseSpecs(row.Specifications);
  const rows: Array<[string, React.ReactNode]> = [
    ['Competitor', <b key="c">{row.CompetitorName}</b>],
    ['Product / model', <b key="p">{row.CompetitorProduct}</b>],
    ['Category', row.Category],
    ['Our product', row.OurProductName ? `${row.ProductCode} — ${row.OurProductName}` : '—'],
    ['Own price', fmtMoney(row.OwnPrice)],
    ['Competitor price', row.PriceMax != null ? `${fmtMoney(row.Price)} – ${fmtMoney(row.PriceMax)}` : fmtMoney(row.Price)],
    ['Price difference', row.PriceDifference != null ? <span key="d" className={gapClass(row.PriceDifference)}>{fmtMoney(row.PriceDifference)}</span> : '—'],
    ['Difference %', row.PriceDifferencePct != null ? <span key="pct" className={gapClass(row.PriceDifferencePct)}>{fmtPct(row.PriceDifferencePct)}</span> : '—'],
    ['Effective date', fmtDate(row.EffectiveDate)],
    ['Status', <Badge key="s" tone={STATUS_TONES[row.Status] ?? 'neutral'}>{row.Status}</Badge>],
    ['Notes', row.Notes || '—'],
    ['Created', fmtDateTime(row.CreatedAt)],
    ['Updated', row.UpdatedAt ? fmtDateTime(row.UpdatedAt) : '—'],
  ];
  return (
    <Modal open onClose={onClose} title={`${row.CompetitorProduct} — ${row.CompetitorName}`} wide
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '8px 16px', margin: 0 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'contents' }}>
            <dt style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: 13 }}>{value}</dd>
          </div>
        ))}
      </dl>
      {specs.length ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Specifications</div>
          <dl style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: '6px 16px', margin: 0 }}>
            {specs.map((s, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <dt style={{ color: 'var(--text-muted)', fontSize: 13 }}>{humanizeKey(s.key)}</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>{formatSpecValue(s.value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {row.Specifications ? (
        <details style={{ marginTop: 12 }}>
          <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>Raw JSON</summary>
          <pre style={{ fontSize: 11, background: 'var(--bg-secondary)', padding: 10, borderRadius: 6, overflow: 'auto' }}>{row.Specifications}</pre>
        </details>
      ) : null}
    </Modal>
  );
}

function ProductModal({ row, competitors, categories, onClose, onDone }: {
  row: CompetitorProductRow | null;
  competitors: CompetitorCatalogueRow[];
  categories: string[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    competitorId: row?.CompetitorID ?? 0,
    productName: row?.CompetitorProduct ?? '',
    category: row?.Category ?? '',
    ourProductId: row?.OurProductID ?? 0,
    price: row?.Price != null ? String(row.Price) : '',
    priceMax: row?.PriceMax != null ? String(row.PriceMax) : '',
    effectiveDate: row?.EffectiveDate ? row.EffectiveDate.slice(0, 10) : '',
    status: row?.Status ?? 'Active',
    notes: row?.Notes ?? '',
  });
  const [specs, setSpecs] = useState(() => parseSpecs(row?.Specifications ?? null));
  const [busy, setBusy] = useState(false);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [competitorBusy, setCompetitorBusy] = useState(false);
  const allCompetitors = useFetch<{ items: CompetitorCatalogueRow[] }>('/competitors?includeInactive=1');
  // Fresh product list on every modal open (page-level fetch may be stale or failed).
  const productFetch = useFetch<{ items: Product[] }>('/reference/products');
  const allProducts = productFetch.data?.items ?? [];
  const sameCategory = allProducts.filter((p) => p.Category === form.category);
  const otherProducts = allProducts.filter((p) => p.Category !== form.category);

  function productOption(p: Product) {
    return <option key={p.ProductID} value={p.ProductID}>{p.ProductCode} — {p.Name}</option>;
  }

  async function addCompetitor() {
    const name = newCompetitor.trim();
    if (!name) { toast.error('Enter competitor name'); return; }
    setCompetitorBusy(true);
    try {
      const res = await api<{ competitorId: number }>('/competitors', { method: 'POST', body: { name } });
      setForm((f) => ({ ...f, competitorId: res.competitorId }));
      setNewCompetitor('');
      setAddingCompetitor(false);
      toast.success('Competitor added');
      void allCompetitors.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to add competitor');
    } finally {
      setCompetitorBusy(false);
    }
  }

  async function submit() {
    if (!form.competitorId) { toast.error('Select a competitor'); return; }
    if (!form.productName.trim()) { toast.error('Product/model is required'); return; }
    if (!form.category.trim()) { toast.error('Category is required'); return; }
    if (!form.price || !(Number(form.price) > 0)) { toast.error('Enter a valid price'); return; }
    if (form.priceMax && Number(form.priceMax) < Number(form.price)) { toast.error('Price max must be ≥ price'); return; }
    const specifications: Record<string, unknown> | null = specs.length
      ? Object.fromEntries(specs.filter((s) => s.key.trim()).map((s) => [s.key.trim(), s.value]))
      : null;
    if (specs.length && !Object.keys(specifications ?? {}).length) { toast.error('Specs need at least one key'); return; }
    const body = {
      competitorId: form.competitorId,
      productName: form.productName.trim(),
      category: form.category.trim(),
      ourProductId: form.ourProductId || null,
      price: Number(form.price),
      priceMax: form.priceMax ? Number(form.priceMax) : null,
      effectiveDate: form.effectiveDate || null,
      status: form.status,
      notes: form.notes.trim() || null,
      specifications,
    };
    setBusy(true);
    try {
      const res = row
        ? await api<{ priceDifferencePct: number | null; alertCreated: boolean }>(`/competitors/products/${row.CompetitorProductID}`, { method: 'PUT', body })
        : await api<{ priceDifferencePct: number | null; alertCreated: boolean }>('/competitors/products', { method: 'POST', body });
      const gapNote = res.priceDifferencePct != null ? ` Gap: ${fmtPct(res.priceDifferencePct)}.` : '';
      const alertNote = res.alertCreated ? ' Gap alert created.' : '';
      onDone(`${row ? 'Competitor product updated' : 'Competitor product created'}.${gapNote}${alertNote}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="form-row">
        <Field label="Competitor" required>
          {addingCompetitor ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="input" value={newCompetitor} onChange={(e) => setNewCompetitor(e.target.value)} placeholder="New competitor name" autoFocus />
              <Button size="sm" busy={competitorBusy} onClick={() => void addCompetitor()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setAddingCompetitor(false); setNewCompetitor(''); }}>×</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <select className="select" value={form.competitorId} onChange={(e) => setForm({ ...form, competitorId: Number(e.target.value) })}>
                <option value={0}>— select —</option>
                {(allCompetitors.data?.items ?? competitors).map((c) => (
                  <option key={c.CompetitorID} value={c.CompetitorID}>{c.Name}{c.IsActive ? '' : ' (inactive)'}</option>
                ))}
              </select>
              <Button size="sm" variant="ghost" title="New competitor" onClick={() => setAddingCompetitor(true)}><Icon name="plus" /></Button>
            </div>
          )}
        </Field>
        <Field label="Product / model" required>
          <input className="input" value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} placeholder="e.g. E2" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Category" required>
          <input className="input" list="cp-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Electric Vehicle" />
          <datalist id="cp-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Our product (drives gap)" hint="Leave empty if no matching product">
          {productFetch.loading ? (
            <Loading label="Loading products…" />
          ) : productFetch.error ? (
            <div className="alert alert-error">
              Failed to load products: {productFetch.error}{' '}
              <Button size="sm" variant="ghost" onClick={() => void productFetch.reload()}>Retry</Button>
            </div>
          ) : (
            <select className="select" value={form.ourProductId} onChange={(e) => setForm({ ...form, ourProductId: Number(e.target.value) })}>
              <option value={0}>— none —</option>
              {sameCategory.length > 0 ? (
                <optgroup label={`Same category (${sameCategory.length})`}>{sameCategory.map(productOption)}</optgroup>
              ) : null}
              {otherProducts.length > 0 ? (
                <optgroup label={sameCategory.length > 0 ? `All other products (${otherProducts.length})` : `All products (${otherProducts.length})`}>
                  {otherProducts.map(productOption)}
                </optgroup>
              ) : null}
            </select>
          )}
        </Field>
      </div>
      <div className="form-row">
        <Field label="Competitor price (ETB)" required>
          <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        <Field label="Price max (ETB)" hint="Upper bound for price ranges">
          <input className="input" type="number" min="0" step="0.01" value={form.priceMax} onChange={(e) => setForm({ ...form, priceMax: e.target.value })} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Effective date">
          <input className="input" type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} />
        </Field>
        <Field label="Status">
          <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'Active' | 'Inactive' | 'Expired' })}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
            <option value="Expired">Expired</option>
          </select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea className="input" style={{ minHeight: 60 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
      </Field>
      <Field label="Specifications">
        <SpecsEditor rows={specs} onChange={setSpecs} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} busy={busy}>{busy ? 'Saving...' : row ? 'Save changes' : 'Create'}</Button>
      </div>
    </div>
  );
}

function CompetitorsInner() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get('search');
    const c = q.get('category');
    if (s) setSearch(s);
    if (c) setCategory(c);
  }, []);
  const [competitorId, setCompetitorId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<{ open: boolean; row?: CompetitorProductRow }>({ open: false });
  const [viewRow, setViewRow] = useState<CompetitorProductRow | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkProductId, setBulkProductId] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => { setPage(1); }, [search, competitorId, category, status]);
  // Selection is scoped to the visible page (you only bulk-link what you see).
  useEffect(() => { setSelected(new Set()); }, [page]);

  const filterParams = [
    search ? `search=${encodeURIComponent(search)}` : '',
    competitorId ? `competitorId=${competitorId}` : '',
    category ? `category=${encodeURIComponent(category)}` : '',
    status ? `status=${status}` : '',
    `page=${page}`,
    `pageSize=${PAGE_SIZE}`,
  ].filter(Boolean).join('&');

  const list = useFetch<{ items: CompetitorProductRow[]; total: number }>(
    `/competitors/products?${filterParams}`,
    [search, competitorId, category, status, page]
  );
  const competitors = useFetch<{ items: CompetitorCatalogueRow[] }>('/competitors?includeInactive=1');
  const categories = useFetch<{ items: string[] }>('/competitors/products/categories');
  const products = useFetch<{ items: Product[] }>('/reference/products');

  async function handleDelete(row: CompetitorProductRow) {
    if (!window.confirm(`Delete "${row.CompetitorProduct}" (${row.CompetitorName})?`)) return;
    try {
      await api(`/competitors/products/${row.CompetitorProductID}`, { method: 'DELETE' });
      toast.success('Competitor product deleted');
      void list.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  const items = list.data?.items ?? [];

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPage(checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of items) {
        if (checked) next.add(r.CompetitorProductID);
        else next.delete(r.CompetitorProductID);
      }
      return next;
    });
  }

  const selectedRows = items.filter((r) => selected.has(r.CompetitorProductID));
  const selectedCategories = new Set(selectedRows.map((r) => r.Category));
  const allProducts = products.data?.items ?? [];
  const bulkSameCategory = allProducts.filter((p) => selectedCategories.has(p.Category));
  const bulkOtherProducts = allProducts.filter((p) => !selectedCategories.has(p.Category));

  function bulkProductOption(p: Product) {
    return <option key={p.ProductID} value={p.ProductID}>{p.ProductCode} — {p.Name}</option>;
  }

  async function bulkSetLink(ourProductId: number | null) {
    const ids = [...selected];
    const verb = ourProductId == null ? 'Unlink' : 'Link';
    const target = ourProductId != null ? allProducts.find((p) => p.ProductID === ourProductId) : null;
    const message = ourProductId == null
      ? `Remove the our-product link from ${ids.length} row(s)?`
      : `Link ${ids.length} row(s) to ${target ? `${target.ProductCode} — ${target.Name}` : 'the selected product'}?`;
    if (!window.confirm(message)) return;
    try {
      const res = await api<{ updated: number }>('/competitors/products/link', {
        method: 'PUT',
        body: { competitorProductIds: ids, ourProductId },
      });
      toast.success(`${verb}ed ${res.updated} row(s)`);
      setSelected(new Set());
      setBulkProductId(0);
      void list.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Bulk ${verb.toLowerCase()} failed`);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Competitors</h1>
            <div className="sub">Master data for competitor products, pricing and gap analysis.</div>
          </div>
          <TourTrigger tourId="admin-competitors" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> Add competitor product</Button>
      </div>

      <div className="filters">
        <input className="input" placeholder="Search competitor, product, category..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 240 }} />
        <select className="select" value={competitorId} onChange={(e) => setCompetitorId(e.target.value)}>
          <option value="">All competitors</option>
          {(competitors.data?.items ?? []).map((c) => (
            <option key={c.CompetitorID} value={c.CompetitorID}>{c.Name}{c.IsActive ? '' : ' (inactive)'}</option>
          ))}
        </select>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {(categories.data?.items ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Expired">Expired</option>
        </select>
        {(search || competitorId || category || status) && (
          <Button variant="ghost" onClick={() => { setSearch(''); setCompetitorId(''); setCategory(''); setStatus(''); }}>Clear</Button>
        )}
      </div>

      {selected.size > 0 ? (
        <div className="filters" style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
          <b style={{ fontSize: 13 }}>{selected.size} selected</b>
          <select className="select" value={bulkProductId} onChange={(e) => setBulkProductId(Number(e.target.value))}>
            <option value={0}>— select our product —</option>
            {bulkSameCategory.length > 0 ? (
              <optgroup label={`Same category (${bulkSameCategory.length})`}>{bulkSameCategory.map(bulkProductOption)}</optgroup>
            ) : null}
            <optgroup label={bulkSameCategory.length > 0 ? `All other products (${bulkOtherProducts.length})` : `All products (${bulkOtherProducts.length})`}>
              {bulkOtherProducts.map(bulkProductOption)}
            </optgroup>
          </select>
          <Button size="sm" disabled={!bulkProductId} onClick={() => void bulkSetLink(bulkProductId)} title="Link selected rows">
            <Icon name="link" /> Link
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void bulkSetLink(null)} title="Remove link from selected rows">
            <Icon name="link-slash" /> Unlink
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      ) : null}

      <Card title={`Competitor products (${list.data?.total ?? 0})`} flush>
        {list.loading ? <Loading /> : list.error ? <div className="alert alert-error">{list.error}</div> : items.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input
                      type="checkbox"
                      checked={items.length > 0 && items.every((r) => selected.has(r.CompetitorProductID))}
                      onChange={(e) => toggleAllPage(e.target.checked)}
                      aria-label="Select all rows on this page"
                    />
                  </th>
                  <th>Competitor</th><th>Product / model</th><th>Category</th><th>Our product</th>
                  <th>Own price</th><th>Competitor price</th><th>Price difference</th><th>Diff %</th>
                  <th>Effective</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.CompetitorProductID}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(r.CompetitorProductID)}
                        onChange={() => toggleRow(r.CompetitorProductID)}
                        aria-label={`Select ${r.CompetitorProduct}`}
                      />
                    </td>
                    <td><b>{r.CompetitorName}</b></td>
                    <td>{r.CompetitorProduct}</td>
                    <td>{r.Category}</td>
                    <td>
                      {r.OurProductName ? (
                        <><Badge tone="primary">{r.ProductCode}</Badge> {r.OurProductName}</>
                      ) : (
                        <span onClick={() => setModal({ open: true, row: r })} title="Link our product" style={{ cursor: 'pointer' }}>
                          <Badge tone="warning">Not linked</Badge>
                        </span>
                      )}
                    </td>
                    <td>{fmtMoney(r.OwnPrice)}</td>
                    <td>{r.PriceMax != null ? `${fmtMoney(r.Price)} – ${fmtMoney(r.PriceMax)}` : fmtMoney(r.Price)}</td>
                    <td>{r.PriceDifference != null ? <b className={gapClass(r.PriceDifference)}>{fmtMoney(r.PriceDifference)}</b> : '—'}</td>
                    <td>{r.PriceDifferencePct != null ? <b className={gapClass(r.PriceDifferencePct)}>{fmtPct(r.PriceDifferencePct)}</b> : '—'}</td>
                    <td>{fmtDate(r.EffectiveDate)}</td>
                    <td><Badge tone={STATUS_TONES[r.Status] ?? 'neutral'}>{r.Status}</Badge></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Button variant="ghost" size="sm" onClick={() => setViewRow(r)} title="View"><Icon name="eye" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, row: r })}><Icon name="pen" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(r)}><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty icon="chess-knight" message="No competitor products found" />}
      </Card>

      <Pagination page={page} total={list.data?.total ?? 0} pageSize={PAGE_SIZE} onPageChange={setPage} />

      {modal.open ? (
        <Modal open onClose={() => setModal({ open: false })} title={modal.row ? `Edit: ${modal.row.CompetitorProduct}` : 'New competitor product'} wide
          footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Cancel</Button>}>
          {competitors.loading || categories.loading ? <Loading /> : (
            <ProductModal
              key={modal.row?.CompetitorProductID ?? 'new'}
              row={modal.row ?? null}
              competitors={competitors.data?.items ?? []}
              categories={categories.data?.items ?? []}
              onClose={() => setModal({ open: false })}
              onDone={(msg) => { setModal({ open: false }); toast.success(msg); void list.reload(); }}
            />
          )}
        </Modal>
      ) : null}

      {viewRow ? <ViewModal row={viewRow} onClose={() => setViewRow(null)} /> : null}
    </>
  );
}

export default function CompetitorsPage() {
  return (
    <Guard>
      <CompetitorsInner />
    </Guard>
  );
}
