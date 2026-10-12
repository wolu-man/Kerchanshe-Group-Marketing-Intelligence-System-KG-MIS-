'use client';

import { useState, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Icon, Modal, Field, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { SpecificationsModal } from '@/components/SpecificationsModal';
import type { Product, BusinessGroup, CustomerType, ProductPrice, ColorInfo } from '@/lib/types';

function PricingModal({ productId, productName, onClose, onDone }: {
  productId: number;
  productName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: typesData } = useFetch<{ items: CustomerType[] }>('/admin/customer-types');
  const { data: pricesData, loading, reload } = useFetch<{ items: ProductPrice[] }>(`/admin/products/${productId}/prices`);
  const types = typesData?.items ?? [];
  const existingPrices = pricesData?.items ?? [];
  const [prices, setPrices] = useState<{ customerTypeId: number; unitPrice: string }[]>(
    existingPrices.map((p) => ({ customerTypeId: p.CustomerTypeID, unitPrice: String(p.UnitPrice) }))
  );
  const [saving, setSaving] = useState(false);

  // Initialize when data loads
  if (existingPrices.length > 0 && prices.length === 0) {
    setPrices(existingPrices.map((p) => ({ customerTypeId: p.CustomerTypeID, unitPrice: String(p.UnitPrice) })));
  }

  function addPriceRow() {
    const usedIds = prices.map((p) => p.customerTypeId);
    const available = types.find((t) => !usedIds.includes(t.CustomerTypeID));
    if (available) {
      setPrices([...prices, { customerTypeId: available.CustomerTypeID, unitPrice: '' }]);
    }
  }

  function removePriceRow(index: number) {
    setPrices(prices.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const valid = prices.filter((p) => p.unitPrice !== '');
    setSaving(true);
    try {
      await api(`/admin/products/${productId}/prices`, {
        method: 'PUT',
        body: {
          prices: valid.map((p) => ({
            customerTypeId: p.customerTypeId,
            unitPrice: Number(p.unitPrice),
          })),
        },
      });
      toast.success('Prices saved');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to save prices');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {loading ? <Loading /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prices.map((row, idx) => {
            const typeName = types.find((t) => t.CustomerTypeID === row.customerTypeId)?.Name ?? '';
            return (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  className="select"
                  value={row.customerTypeId}
                  onChange={(e) => {
                    const updated = [...prices];
                    updated[idx].customerTypeId = Number(e.target.value);
                    setPrices(updated);
                  }}
                  style={{ flex: 1 }}
                >
                  <option value={0}>— select type —</option>
                  {types.map((t) => (
                    <option key={t.CustomerTypeID} value={t.CustomerTypeID}>{t.Name}</option>
                  ))}
                </select>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  value={row.unitPrice}
                  onChange={(e) => {
                    const updated = [...prices];
                    updated[idx].unitPrice = e.target.value;
                    setPrices(updated);
                  }}
                  placeholder="Price (ETB)"
                  style={{ width: 140 }}
                />
                <Button size="sm" variant="danger-ghost" onClick={() => removePriceRow(idx)}>
                  <Icon name="trash" />
                </Button>
              </div>
            );
          })}
          {prices.length < types.length && (
            <Button size="sm" variant="ghost" onClick={addPriceRow}>
              <Icon name="plus" /> Add price row
            </Button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void handleSave()} busy={saving}>{saving ? 'Saving...' : 'Save prices'}</Button>
      </div>
    </div>
  );
}

function ProductModal({ product, groups, onClose, onDone }: {
  product: Product | null;
  groups: BusinessGroup[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { data: colorsData } = useFetch<{ items: ColorInfo[] }>('/reference/colors');
  const allColors = colorsData?.items ?? [];
  const initialColors = product?.colors ?? (product?.Color ? product.Color.split(',').map((c) => c.trim()).filter(Boolean) : []);
  const [form, setForm] = useState({
    productCode: product?.ProductCode ?? '',
    name: product?.Name ?? '',
    category: product?.Category ?? '',
    unitPrice: product?.UnitPrice != null ? String(product.UnitPrice) : '',
    businessGroupID: product?.BusinessGroupID ?? 0,
    colors: initialColors,
    size: product?.Size ?? '',
    weightKg: product?.WeightKg != null ? String(product.WeightKg) : '',
    specifications: product?.Specifications ? JSON.stringify(product.Specifications, null, 2) : '',
  });
  const [busy, setBusy] = useState(false);

  function toggleColor(name: string) {
    setForm({
      ...form,
      colors: form.colors.includes(name) ? form.colors.filter((c) => c !== name) : [...form.colors, name],
    });
  }

  async function submit() {
    if (!form.productCode.trim()) { toast.error('Product code is required'); return; }
    if (!form.name.trim()) { toast.error('Product name is required'); return; }
    setBusy(true);
    let specifications: Record<string, unknown> | null = null;
    if (form.specifications.trim()) {
      try {
        specifications = JSON.parse(form.specifications);
      } catch {
        toast.error('Specifications must be valid JSON');
        setBusy(false);
        return;
      }
    }
    const body = {
      productCode: form.productCode.trim(),
      name: form.name.trim(),
      category: form.category.trim() || '',
      unitPrice: form.unitPrice ? Number(form.unitPrice) : null,
      businessGroupId: form.businessGroupID || null,
      color: form.colors.length ? form.colors.join(', ') : null,
      size: form.size || null,
      weightKg: form.weightKg ? Number(form.weightKg) : null,
      specifications,
    };
    try {
      if (product) {
        await api(`/admin/products/${product.ProductID}`, { method: 'PUT', body });
        toast.success('Product updated');
      } else {
        await api('/admin/products', { method: 'POST', body });
        toast.success('Product created');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="form-row">
        <Field label="Product Code" required>
          <input className="input" value={form.productCode} onChange={(e) => setForm({ ...form, productCode: e.target.value })} placeholder="e.g. PRD-001" disabled={!!product} />
        </Field>
        <Field label="Name" required>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Category">
          <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Buna Plate" />
        </Field>
        <Field label="Base Unit Price">
          <input className="input" type="number" step="0.01" min="0" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} placeholder="0.00" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Colors">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {allColors.map((c) => {
              const selected = form.colors.includes(c.Name);
              return (
                <button
                  key={c.ColorID}
                  type="button"
                  onClick={() => toggleColor(c.Name)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    border: selected ? '1px solid #0047AB' : '1px solid var(--border, #ddd)',
                    borderRadius: 14, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
                    background: selected ? 'rgba(0,71,171,0.08)' : 'transparent',
                    color: 'inherit', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.HexCode ?? '#999', border: '1px solid rgba(0,0,0,0.25)' }} />
                  {c.Name}
                </button>
              );
            })}
            {allColors.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading colors...</span>}
          </div>
          <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {form.colors.length ? `${form.colors.length} color(s) selected` : 'Optional — no color selected'}
          </small>
        </Field>
        <Field label="Size">
          <input className="input" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g. Large" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Weight (Kg)">
          <input className="input" type="number" step="0.001" min="0" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} placeholder="0.000" />
        </Field>
        <Field label="Business Group">
          <select className="select" value={form.businessGroupID} onChange={(e) => setForm({ ...form, businessGroupID: Number(e.target.value) })}>
            <option value={0}>— none —</option>
            {groups.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name} ({g.Code})</option>)}
          </select>
        </Field>
      </div>
      <div className="form-row" style={{ gridColumn: '1 / -1' }}>
        <Field label="Specifications (JSON)">
          <textarea
            className="input"
            style={{ minHeight: 120, fontFamily: 'monospace', fontSize: 12 }}
            value={form.specifications}
            onChange={(e) => setForm({ ...form, specifications: e.target.value })}
            placeholder='{ "modelYear": 2024, "engineType": "Electric", "batteryCapacity": "60.2 kWh", "rangeKm": 450, "chargingTime": "30min (DC fast) / 8h (AC)", "drivetrain": "FWD", "bodyType": "SUV", "seatingCapacity": 5, "motorPower": "150 kW (204 PS)", "topSpeed": 170, "acceleration0to100": "7.9s" }'
          />
          <small style={{ color: 'var(--text-muted)', fontSize: 12 }}>Enter product specifications as JSON. Leave empty for no specifications.</small>
        </Field>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void submit()} busy={busy}>{busy ? 'Saving...' : product ? 'Save changes' : 'Create'}</Button>
      </div>
    </div>
  );
}

function ProductsInner() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  // Deep-link support: /admin/products?search=Geely (set post-mount to avoid hydration mismatch)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('search');
    if (q) setSearch(q);
  }, []);
  const [businessGroupFilter, setBusinessGroupFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modal, setModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [pricingModal, setPricingModal] = useState<{ productId: number; name: string } | null>(null);
  const [specsModal, setSpecsModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [prodPage, setProdPage] = useState(1);
  const PROD_PAGE_SIZE = 20;

  const filterParams = [
    search ? `search=${encodeURIComponent(search)}` : '',
    businessGroupFilter ? `businessGroupId=${businessGroupFilter}` : '',
    colorFilter ? `color=${encodeURIComponent(colorFilter)}` : '',
    sizeFilter ? `size=${encodeURIComponent(sizeFilter)}` : '',
    categoryFilter ? `category=${encodeURIComponent(categoryFilter)}` : '',
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: Product[] }>(
    `/admin/products${filterParams ? `?${filterParams}` : ''}`,
    [search, businessGroupFilter, colorFilter, sizeFilter, categoryFilter]
  );
  const groups = useFetch<{ items: BusinessGroup[] }>('/reference/business-groups');
  const colors = useFetch<{ items: ColorInfo[] }>('/reference/colors');

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete product "${name}"?`)) return;
    try {
      await api(`/admin/products/${id}`, { method: 'DELETE' });
      toast.success('Product deleted');
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
    }
  }

  async function updateBusinessGroup(product: Product, businessGroupId: number | null) {
    try {
      await api(`/admin/products/${product.ProductID}/business-group`, { method: 'PUT', body: { businessGroupId } });
      toast.success(`Business group ${businessGroupId ? 'assigned' : 'removed'}`);
      void reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Update failed');
    }
  }

  const filteredData = data?.items ?? [];
  const pagedData = filteredData.slice((prodPage - 1) * PROD_PAGE_SIZE, prodPage * PROD_PAGE_SIZE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
            <div className="sub">Manage products, business group assignment, and per-type pricing.</div>
          </div>
          <TourTrigger tourId="admin-products" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> Add Product</Button>
      </div>

      <div className="filters">
        <input className="input" placeholder="Search by name or code..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 250 }} />
        <select className="select" value={businessGroupFilter} onChange={(e) => setBusinessGroupFilter(e.target.value)}>
          <option value="">All business groups</option>
          <option value="null">Unassigned</option>
          {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name} ({g.Code})</option>)}
        </select>
        <select className="select" value={colorFilter} onChange={(e) => setColorFilter(e.target.value)} style={{ minWidth: 140 }}>
          <option value="">All colors</option>
          {colors.data?.items.map((c) => <option key={c.ColorID} value={c.Name}>{c.Name}</option>)}
        </select>
        <input className="input" placeholder="Filter by size..." value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)} style={{ minWidth: 120 }} />
        <input className="input" placeholder="Filter by category..." value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ minWidth: 160 }} />
        {(search || businessGroupFilter || colorFilter || sizeFilter || categoryFilter) && (
          <Button variant="ghost" onClick={() => { setSearch(''); setBusinessGroupFilter(''); setColorFilter(''); setSizeFilter(''); setCategoryFilter(''); }}>Clear</Button>
        )}
      </div>

      <Card title={`Products (${filteredData.length})`} flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : filteredData.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Category</th><th>Color</th><th>Size</th>
                   <th>Weight (Kg)</th><th>Unit Price</th><th>Per-Type Prices</th>
                  <th>Specs</th><th>Business Group</th><th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedData.map((p) => (
                  <tr key={p.ProductID}>
                    <td><Badge tone="primary">{p.ProductCode}</Badge></td>
                    <td><b>{p.Name}</b></td>
                    <td>{p.Category || '—'}</td>
                    <td>
                      <div className="cell-color">
                        {p.Color ? (
                          p.Color.split(',').map((c, i) => (
                            <span key={i} style={{ fontSize: 10, padding: '2px 6px' }}><Badge tone="accent">{c.trim()}</Badge></span>
                          ))
                        ) : '—'}
                      </div>
                    </td>
                    <td>{p.Size || '—'}</td>
                    <td>{p.WeightKg != null ? `${p.WeightKg} Kg` : '—'}</td>
                    <td>{p.UnitPrice != null ? `${p.UnitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB` : '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 280 }}>
                      {p.Prices ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {p.Prices.split(', ').map((entry, i) => {
                            const [type, price] = entry.split(': ');
                            return <span key={i} style={{ fontSize: 11 }}><Badge tone="info">{type}: {price}</Badge></span>;
                          })}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      {p.Specifications ? (
                        <button
                          type="button"
                          className="spec-badge-btn"
                          onClick={() => setSpecsModal({ open: true, product: p })}
                          title="View specifications"
                        >
                          <Badge tone="success"><span style={{ fontSize: 10 }}><Icon name="cog" /></span> Specs</Badge>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td>
                      <select
                        className="select"
                        value={p.BusinessGroupID ?? 0}
                        onChange={(e) => void updateBusinessGroup(p, Number(e.target.value) || null)}
                        style={{ minWidth: 140, fontSize: 12 }}
                      >
                        <option value={0}>— unassign —</option>
                        {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name} ({g.Code})</option>)}
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Button variant="ghost" size="sm" onClick={() => setPricingModal({ productId: p.ProductID, name: p.Name })} title="Per-type pricing"><Icon name="money-bill" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setSpecsModal({ open: true, product: p })} title="View details"><Icon name="eye" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, product: p })}><Icon name="pen" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleDelete(p.ProductID, p.Name)}><Icon name="trash" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="box" message="No products found" />
        )}
      </Card>

      <Pagination page={prodPage} total={filteredData.length} pageSize={PROD_PAGE_SIZE} onPageChange={setProdPage} />

      {modal.open ? (
        <Modal open onClose={() => setModal({ open: false })} title={modal.product ? `Edit: ${modal.product.Name}` : 'New product'} wide footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Cancel</Button>}>
          {groups.loading ? <Loading /> : (
            <ProductModal
              key={modal.product?.ProductID ?? 'new'}
              product={modal.product ?? null}
              groups={groups.data?.items ?? []}
              onClose={() => setModal({ open: false })}
              onDone={() => { setModal({ open: false }); void reload(); }}
            />
          )}
        </Modal>
      ) : null}

      {pricingModal ? (
        <Modal open onClose={() => setPricingModal(null)} title={`Per-Type Pricing — ${pricingModal.name}`} wide>
          <PricingModal
            productId={pricingModal.productId}
            productName={pricingModal.name}
            onClose={() => setPricingModal(null)}
            onDone={() => { setPricingModal(null); void reload(); }}
          />
        </Modal>
      ) : null}

      {specsModal.open && specsModal.product ? (
        <SpecificationsModal
          open={specsModal.open}
          onClose={() => setSpecsModal({ open: false })}
          product={specsModal.product}
        />
      ) : null}
    </>
  );
}

export default function ProductsPage() {
  return (
    <Guard>
      <ProductsInner />
    </Guard>
  );
}
