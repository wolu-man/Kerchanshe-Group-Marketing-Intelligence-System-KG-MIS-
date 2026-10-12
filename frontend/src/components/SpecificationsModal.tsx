'use client';

import { useState } from 'react';
import { Modal, Icon, Badge, Button } from '@/components/ui';
import { SPEC_SECTIONS, collectSpecRows, formatSpecValue, getSpecLabel, isSpecEmpty, humanizeKey } from '@/components/ProductSpecs';
import type { Product } from '@/lib/types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? 'http://localhost:4000';

function fmtEtb(n: number): string {
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2 })} ETB`;
}

function SpecsSection({ title, rows }: { title: string; rows: ReturnType<typeof collectSpecRows> }) {
  if (rows.length === 0) return null;
  return (
    <section className="specs-section">
      <h4 className="specs-section-title">{title}</h4>
      <dl className="spec-list">
        {rows.map((row) => (
          <div key={row.key} className={row.wide ? 'spec-row spec-row--wide' : 'spec-row'}>
            <dt>{row.label}</dt>
            <dd title={typeof row.value === 'string' ? row.value : undefined}>{formatSpecValue(row.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function SpecificationsModal({ open, onClose, product }: {
  open: boolean;
  onClose: () => void;
  product: Product;
}) {
  const [copied, setCopied] = useState(false);
  const raw = product.Specifications;
  const specs: Record<string, unknown> | null =
    typeof raw === 'string' ? safeParse(raw) : (raw as Record<string, unknown> | null);

  const allRows = specs ? collectSpecRows(specs) : [];
  const sectionRows = new Map<string, ReturnType<typeof collectSpecRows>>();
  const knownKeys = new Set<string>();
  for (const section of SPEC_SECTIONS) {
    const rows = allRows.filter((r) => section.keys.includes(r.key));
    rows.forEach((r) => knownKeys.add(r.key));
    sectionRows.set(section.title, rows);
  }
  const otherRows = allRows.filter((r) => !knownKeys.has(r.key));

  const json = specs ? JSON.stringify(specs, null, 2) : '';

  function copyJson() {
    if (!json) return;
    void navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={`Details: ${product.Name}`} wide footer={
      <>
        {json && (
          <Button variant="ghost" onClick={copyJson}>
            <Icon name="copy" /> {copied ? 'Copied!' : 'Copy JSON'}
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </>
    }>
      <div className="specs-modal">
        <div className="specs-header">
          <Badge tone="primary">{product.ProductCode}</Badge>
          <div className="specs-header-main">
            <h3>{product.Name}</h3>
            <div className="specs-header-badges">
              {product.Category && <Badge tone="info">{product.Category}</Badge>}
              {product.BusinessGroupName && <Badge tone="secondary">{product.BusinessGroupName}</Badge>}
              {product.UnitPrice != null && <Badge tone="success">{product.UnitPrice.toLocaleString()} ETB</Badge>}
            </div>
          </div>
        </div>

        <section className="specs-section">
          <h4 className="specs-section-title">Details</h4>
          <dl className="spec-list">
            <div className="spec-row"><dt>Product ID</dt><dd>{product.ProductID}</dd></div>
            <div className="spec-row"><dt>Category</dt><dd>{product.Category || '—'}</dd></div>
            <div className="spec-row"><dt>Color</dt><dd>{product.Color || '—'}</dd></div>
            <div className="spec-row"><dt>Size</dt><dd>{product.Size || '—'}</dd></div>
            <div className="spec-row"><dt>Weight (Kg)</dt><dd>{product.WeightKg != null ? product.WeightKg : '—'}</dd></div>
            <div className="spec-row"><dt>Unit price</dt><dd>{product.UnitPrice != null ? fmtEtb(product.UnitPrice) : '—'}</dd></div>
            <div className="spec-row spec-row--wide">
              <dt>Per-type prices</dt>
              <dd>
                {product.Prices ? (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {product.Prices.split(', ').map((entry, i) => {
                      const [type, price] = entry.split(': ');
                      return <span key={i} style={{ fontSize: 11 }}><Badge tone="info">{type}: {price}</Badge></span>;
                    })}
                  </span>
                ) : '—'}
              </dd>
            </div>
            {product.AgentPriceAfterVat != null && (
              <div className="spec-row"><dt>Agent price (after VAT)</dt><dd>{fmtEtb(product.AgentPriceAfterVat)}</dd></div>
            )}
            {product.WholesalePriceAfterVat != null && (
              <div className="spec-row"><dt>Wholesale price (after VAT)</dt><dd>{fmtEtb(product.WholesalePriceAfterVat)}</dd></div>
            )}
            {product.KeyAccountPriceAfterVat != null && (
              <div className="spec-row"><dt>Key account price (after VAT)</dt><dd>{fmtEtb(product.KeyAccountPriceAfterVat)}</dd></div>
            )}
            {product.BidPriceAfterVat != null && (
              <div className="spec-row"><dt>Bid price (after VAT)</dt><dd>{fmtEtb(product.BidPriceAfterVat)}</dd></div>
            )}
            <div className="spec-row">
              <dt>Business group</dt>
              <dd>{product.BusinessGroupName ? `${product.BusinessGroupName}${product.BusinessGroupCode ? ` (${product.BusinessGroupCode})` : ''}` : '—'}</dd>
            </div>
            <div className="spec-row spec-row--wide">
              <dt>Image</dt>
              <dd>
                {product.ImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${API_BASE}${product.ImageUrl}`} alt={product.Name} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                ) : '—'}
              </dd>
            </div>
          </dl>
        </section>

        {allRows.length > 0 ? (
          <div className="specs-grid">
            {SPEC_SECTIONS.map((section) => (
              <SpecsSection key={section.title} title={section.title} rows={sectionRows.get(section.title) ?? []} />
            ))}
            <SpecsSection title="Additional Details" rows={otherRows} />
          </div>
        ) : (
          <p className="specs-empty">No specifications recorded for this product.</p>
        )}

        {json && (
          <details className="specs-raw-json">
            <summary><Icon name="code" /> Raw JSON</summary>
            <pre>{json}</pre>
          </details>
        )}
      </div>
    </Modal>
  );
}

function safeParse(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Re-exported for consumers that only need a label for a spec key.
export { getSpecLabel, isSpecEmpty, humanizeKey };
