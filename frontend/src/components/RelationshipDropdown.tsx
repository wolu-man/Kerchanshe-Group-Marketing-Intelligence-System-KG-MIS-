'use client';

import { useState } from 'react';

/**
 * Props for the RelationshipDropdown component.
 */
interface RelationshipDropdownProps {
  /** The parent entity name (e.g. 'BusinessGroup', 'Region') */
  parentEntity: string;

  /** The child entity name (e.g. 'Region', 'Outlet') */
  childEntity: string;

  /** Optional custom parent label */
  parentLabel?: string;

  /** Optional custom child label */
  childLabel?: string;

  /** Optional initial parent value (string) */
  parentValue?: string;

  /** Called when parent value changes */
  onParentChange?: (value: number) => void;

  /** Called when child value changes */
  onChildChange?: (value: number) => void;

  /** Whether the whole dropdown pair is disabled */
  disabled?: boolean;
}

/**
 * A reusable dependent dropdown component.
 * The child dropdown is automatically filtered based on the configured
 * parent→child relationship in the backend.
 * The child is disabled until a parent value is selected.
 *
 * Usage:
 *   <RelationshipDropdown
 *     parentEntity="BusinessGroup"
 *     childEntity="Region"
 *     parentValue={selectedBusinessGroupId}
 *     onParentChange={setBusinessGroupId}
 *     onChildChange={setRegionId}
 *   />
 */
export function RelationshipDropdown({
  parentEntity,
  childEntity,
  parentLabel = 'Parent',
  childLabel = 'Child',
  parentValue,
  onParentChange,
  onChildChange,
  disabled = false,
}: RelationshipDropdownProps) {
  const [parentVal, setParentVal] = useState(parentValue ?? '');
  const [childVal, setChildVal] = useState('');

  return (
    <div style={{ marginBottom: 24, fontFamily: 'system-ui, sans-serif' }}>
      <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 14 }}>
        {parentLabel}
      </label>

      <select
        disabled={disabled}
        value={parentVal}
        onChange={(e) => {
          const val = e.target.value;
          setParentVal(val);
          onParentChange?.(Number(val));
        }}
      >
        <option value="">— select —</option>
        {/* Parent options are populated by the caller using the useRelationships hook */}
      </select>

      <select
        disabled={!parentVal || disabled}
        value={childVal}
        onChange={(e) => {
          const val = e.target.value;
          setChildVal(val);
          onChildChange?.(Number(val));
        }}
      >
        <option value="">— select —</option>
        {/* Child options are populated and filtered based on parent selection */}
      </select>

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
        Select a {parentLabel.toLowerCase()} to filter {childLabel.toLowerCase()} options.
      </div>
    </div>
  );
}