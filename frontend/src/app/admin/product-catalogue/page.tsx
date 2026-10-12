'use client';

import { useState, useRef, useEffect } from 'react';
import { Guard } from '@/components/Guard';
import { Button, Card, Loading, Empty, Badge, Icon, Modal, Field, Pagination } from '@/components/ui';
import { TourTrigger } from '@/components/tour/TourTrigger';
import { api, ApiError } from '@/lib/api';
import { useFetch } from '@/lib/use-api';
import { toast } from '@/components/Toast';
import { useAuth } from '@/lib/auth-context';
import { SpecificationsModal } from '@/components/SpecificationsModal';
import { ProductSpecs } from '@/components/ProductSpecs';
import type { Product, BusinessGroup, CustomerType, ProductPrice, ColorInfo } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000';

function PhotoUploadModal({ product, onClose, onDone }: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      await api(`/admin/products/${product.ProductID}/photo`, { method: 'PUT', body: formData });
      toast.success('Photo uploaded');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 200, height: 200, border: '2px dashed var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-subtle)' }}>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : product.ImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${API_BASE}${product.ImageUrl}`} alt={product.Name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 48, color: 'var(--text-muted)' }}><Icon name="image" /></span>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ marginBottom: 8, color: 'var(--text-muted)' }}>Select a photo for <b>{product.Name}</b></p>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
          <Button variant="ghost" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" /> Choose Image
          </Button>
          {file && <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>{file.name}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => void handleUpload()} busy={uploading} disabled={!file}>
          {uploading ? 'Uploading...' : 'Upload Photo'}
        </Button>
      </div>
    </div>
  );
}

function CatalogueModal({ product, groups, onClose, onDone }: {
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

function CatalogueInner() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  // Deep-link support: /admin/product-catalogue?search=Geely (set post-mount to avoid hydration mismatch)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('search');
    if (q) setSearch(q);
  }, []);
  const [businessGroupFilter, setBusinessGroupFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [colorFilter, setColorFilter] = useState('');
  const [modal, setModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [photoModal, setPhotoModal] = useState<Product | null>(null);
  const [specsModal, setSpecsModal] = useState<{ open: boolean; product?: Product }>({ open: false });
  const [catPage, setCatPage] = useState(1);
  const CAT_PAGE_SIZE = 12;

  const filterParams = [
    search ? `search=${encodeURIComponent(search)}` : '',
    businessGroupFilter ? `businessGroupId=${businessGroupFilter}` : '',
    categoryFilter ? `category=${encodeURIComponent(categoryFilter)}` : '',
    colorFilter ? `color=${encodeURIComponent(colorFilter)}` : '',
  ].filter(Boolean).join('&');

  const { data, loading, error, reload } = useFetch<{ items: Product[] }>(
    `/admin/products${filterParams ? `?${filterParams}` : ''}`,
    [search, businessGroupFilter, categoryFilter, colorFilter]
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

  const filteredData = data?.items ?? [];
  const pagedData = filteredData.slice((catPage - 1) * CAT_PAGE_SIZE, catPage * CAT_PAGE_SIZE);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Product Catalogue</h1>
            <div className="sub">Browse products with photos. Upload images to showcase each product.</div>
          </div>
          <TourTrigger tourId="admin-catalogue" />
          <Button onClick={() => setModal({ open: true })}><Icon name="plus" /> Add Product</Button>
      </div>

      <div className="filters">
        <input className="input" placeholder="Search by name or code..." value={search} onChange={(e) => { setSearch(e.target.value); setCatPage(1); }} style={{ minWidth: 250 }} />
        <select className="select" value={businessGroupFilter} onChange={(e) => { setBusinessGroupFilter(e.target.value); setCatPage(1); }}>
          <option value="">All business groups</option>
          {groups.data?.items.map((g) => <option key={g.BusinessGroupID} value={g.BusinessGroupID}>{g.Name} ({g.Code})</option>)}
        </select>
        <input className="input" placeholder="Filter by category..." value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCatPage(1); }} style={{ minWidth: 160 }} />
        <select className="select" value={colorFilter} onChange={(e) => { setColorFilter(e.target.value); setCatPage(1); }} style={{ minWidth: 140 }}>
          <option value="">All colors</option>
          {colors.data?.items.map((c) => <option key={c.ColorID} value={c.Name}>{c.Name}</option>)}
        </select>
        {(search || businessGroupFilter || categoryFilter || colorFilter) && (
          <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setBusinessGroupFilter(''); setCategoryFilter(''); setColorFilter(''); setCatPage(1); }}>
            <Icon name="xmark" /> Clear
          </Button>
        )}
      </div>

      <Card title={`Products (${filteredData.length})`} flush>
        {loading ? <Loading /> : error ? <div className="alert alert-error">{error}</div> : filteredData.length ? (
          <>
            <div className="catalogue-grid">
              {pagedData.map((p) => (
                <div key={p.ProductID} className="catalogue-card">
                  <div className="catalogue-card-img">
                    {p.ImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`${API_BASE}${p.ImageUrl}`} alt={p.Name} />
                    ) : (
                      <div className="catalogue-card-placeholder">
                        <Icon name="image" />
                      </div>
                    )}
                    <button className="catalogue-card-photo-btn" onClick={() => setPhotoModal(p)} title="Upload photo">
                      <Icon name="camera" />
                    </button>
                  </div>
                  <div className="catalogue-card-body">
                    <div className="catalogue-card-header">
                      <Badge tone="primary">{p.ProductCode}</Badge>
                      {p.Category && <Badge tone="info">{p.Category}</Badge>}
                    </div>
                    <h3 className="catalogue-card-name">{p.Name}</h3>
                    {p.UnitPrice != null && (
                      <div className="catalogue-card-price">{p.UnitPrice.toLocaleString()} ETB</div>
                    )}
                    <div className="catalogue-card-details">
                      {p.Color && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                          {p.Color.split(',').map((c, i) => (
                            <span key={i} style={{ fontSize: 10, padding: '2px 6px' }}><Badge tone="accent">{c.trim()}</Badge></span>
                          ))}
                        </div>
                      )}
                      {p.WeightKg != null && <span>Weight: {p.WeightKg} Kg</span>}
                      {p.Size && <span>Size: {p.Size}</span>}
                    </div>
                    {/* Specifications display */}
                    {p.Specifications && (
                      <div className="catalogue-card-specs">
                        <div className="catalogue-specs-header">
                          <span style={{ fontSize: 12 }}><Icon name="cog" /></span>
                          <span>Specifications</span>
                        </div>
                        <ProductSpecs data={p.Specifications} maxRows={6} collapsible />
                      </div>
                    )}
                    {p.Prices && (
                      <div className="catalogue-card-prices">
                        {p.Prices.split(', ').map((entry, i) => {
                          const [type, price] = entry.split(': ');
                          return <span key={i}><Badge tone="accent">{type}: {price}</Badge></span>;
                        })}
                      </div>
                    )}
                    {p.BusinessGroupName && (
                      <div className="catalogue-card-bg">{p.BusinessGroupName}</div>
                    )}
                  </div>
                  <div className="catalogue-card-actions">
                    <Button variant="ghost" size="sm" onClick={() => setPhotoModal(p)} title="Upload photo"><Icon name="camera" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setSpecsModal({ open: true, product: p })} title="View details"><Icon name="eye" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setModal({ open: true, product: p })} title="Edit"><Icon name="pen" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => void handleDelete(p.ProductID, p.Name)} title="Delete"><Icon name="trash" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Pagination page={catPage} total={filteredData.length} pageSize={CAT_PAGE_SIZE} onPageChange={setCatPage} />
          </>
        ) : (
          <Empty icon="images" message="No products found" action={<Button onClick={() => setModal({ open: true })}><Icon name="plus" /> Add Product</Button>} />
        )}
      </Card>

      {modal.open ? (
        <Modal open onClose={() => setModal({ open: false })} title={modal.product ? `Edit: ${modal.product.Name}` : 'New product'} wide footer={<Button variant="ghost" onClick={() => setModal({ open: false })}>Cancel</Button>}>
          {groups.loading ? <Loading /> : (
            <CatalogueModal
              key={modal.product?.ProductID ?? 'new'}
              product={modal.product ?? null}
              groups={groups.data?.items ?? []}
              onClose={() => setModal({ open: false })}
              onDone={() => { setModal({ open: false }); void reload(); }}
            />
          )}
        </Modal>
      ) : null}

      {photoModal ? (
        <Modal open onClose={() => setPhotoModal(null)} title={`Upload Photo — ${photoModal.Name}`}>
          <PhotoUploadModal
            product={photoModal}
            onClose={() => setPhotoModal(null)}
            onDone={() => { setPhotoModal(null); void reload(); }}
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

export default function ProductCataloguePage() {
  return (
    <Guard>
      <CatalogueInner />
    </Guard>
  );
}
