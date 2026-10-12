'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

// Friendly labels for known specification keys. Unknown keys are humanized.
export const SPEC_LABELS: Record<string, string> = {
  // Overview / market
  brand: 'Brand',
  model: 'Model',
  segment: 'Segment',
  marketRole: 'Market Role',
  versions: 'Versions',
  modelYear: 'Model Year',
  engineType: 'Engine Type',
  bodyType: 'Body Type',
  drivetrain: 'Drivetrain',
  // Pricing notes
  priceIndicative: 'Indicative Price (ETB)',
  priceBasis: 'Price Note',
  // Performance
  driveType: 'Drive Type',
  motorPower: 'Motor Power',
  maxTorque: 'Max Torque',
  topSpeed: 'Top Speed',
  acceleration0to100: '0-100 km/h',
  // Battery & charging
  batteryType: 'Battery Type',
  batteryCapacity: 'Battery Capacity',
  drivingRange: 'Driving Range',
  rangeKm: 'Range (km)',
  energyConsumption: 'Energy Consumption',
  dcFastCharge: 'DC Fast Charge (30-80%)',
  chargingTime: 'Charging Time',
  // Chassis & dimensions
  dimensions: 'Dimensions (L x W x H)',
  wheelbase: 'Wheelbase',
  groundClearance: 'Ground Clearance',
  suspension: 'Suspension (Front / Rear)',
  brakes: 'Brakes (Front / Rear)',
  parkBrake: 'Parking Brake',
  wheels: 'Wheels',
  // Practical
  seats: 'Seats',
  seatingCapacity: 'Seating Capacity',
  doors: 'Doors',
  warranty: 'Warranty (Vehicle / Battery)',
  // Equipment
  adas360: 'ADAS + 360 Camera',
  touchscreen: 'Touch Screen',
  instrumentCluster: 'Instrument Cluster',
  upholstery: 'Upholstery',
  // Physical
  color: 'Color(s)',
  colors: 'Color(s)',
  size: 'Size',
  weightKg: 'Weight (kg)',
};

// Section layout: battery/range/power first, notes last.
export const SPEC_SECTIONS: { title: string; keys: string[] }[] = [
  { title: 'Overview', keys: ['brand', 'model', 'segment', 'marketRole', 'versions', 'modelYear', 'engineType', 'bodyType', 'drivetrain'] },
  { title: 'Pricing', keys: ['priceIndicative', 'priceBasis'] },
  { title: 'Performance & Battery', keys: ['driveType', 'batteryType', 'batteryCapacity', 'drivingRange', 'rangeKm', 'motorPower', 'maxTorque', 'topSpeed', 'acceleration0to100', 'energyConsumption', 'dcFastCharge', 'chargingTime'] },
  { title: 'Dimensions & Chassis', keys: ['dimensions', 'wheelbase', 'groundClearance', 'seats', 'seatingCapacity', 'doors', 'suspension', 'brakes', 'parkBrake', 'wheels'] },
  { title: 'Equipment & Warranty', keys: ['adas360', 'touchscreen', 'instrumentCluster', 'upholstery', 'warranty'] },
  { title: 'Physical Attributes', keys: ['color', 'colors', 'size', 'weightKg'] },
];

export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function getSpecLabel(key: string): string {
  return SPEC_LABELS[key] ?? humanizeKey(key);
}

export function isSpecEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return true;
    if (/^not specified in pdf$/i.test(s)) return true;
  }
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function isHexColor(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

export function formatSpecValue(value: unknown): ReactNode {
  if (value == null) return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    if (value.every((v) => typeof v === 'string' && isHexColor(v))) {
      return (
        <span style={{ display: 'inline-flex', gap: 4, verticalAlign: 'middle' }}>
          {value.map((v, i) => (
            <span key={i} title={String(v)} style={{ width: 14, height: 14, borderRadius: '50%', background: String(v), border: '1px solid var(--border)', display: 'inline-block' }} />
          ))}
        </span>
      );
    }
    return value.map((v) => String(v)).join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface SpecRow {
  key: string;
  label: string;
  value: unknown;
  wide: boolean;
}

// Flatten specs into ordered rows (known sections first, leftovers humanized).
export function collectSpecRows(data: Record<string, unknown>): SpecRow[] {
  const rows: SpecRow[] = [];
  const seen = new Set<string>();
  for (const section of SPEC_SECTIONS) {
    for (const key of section.keys) {
      if (seen.has(key)) continue;
      const value = data[key];
      if (isSpecEmpty(value)) continue;
      seen.add(key);
      rows.push({ key, label: getSpecLabel(key), value, wide: key === 'priceBasis' });
    }
  }
  for (const key of Object.keys(data)) {
    if (seen.has(key) || isSpecEmpty(data[key])) continue;
    seen.add(key);
    rows.push({ key, label: getSpecLabel(key), value: data[key], wide: key.toLowerCase().includes('note') });
  }
  return rows;
}

function SpecList({ rows }: { rows: SpecRow[] }) {
  return (
    <dl className="spec-list">
      {rows.map((row) => (
        <div key={row.key} className={row.wide ? 'spec-row spec-row--wide' : 'spec-row'}>
          <dt>{row.label}</dt>
          <dd title={typeof row.value === 'string' ? row.value : undefined}>{formatSpecValue(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Inline structured specification list (label: value).
 * Used on catalogue cards; optionally collapsible with a "Show all" toggle.
 */
export function ProductSpecs({ data, maxRows, collapsible = false }: {
  data: Record<string, unknown> | string | null | undefined;
  maxRows?: number;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;
  let parsed: Record<string, unknown>;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch { return <pre className="spec-raw">{data}</pre>; }
  } else {
    parsed = data;
  }
  const rows = collectSpecRows(parsed);
  if (rows.length === 0) return null;

  const limited = collapsible && !expanded && maxRows != null;
  const shown = limited ? rows.slice(0, maxRows) : rows;

  return (
    <div className="spec-list-wrap">
      <SpecList rows={shown} />
      {collapsible && rows.length > (maxRows ?? 0) && (
        <button type="button" className="spec-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Show all (${rows.length} specs)`}
        </button>
      )}
    </div>
  );
}
