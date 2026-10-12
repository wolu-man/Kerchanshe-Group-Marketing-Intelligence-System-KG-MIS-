'use client';

import type { FormElement } from '@/lib/types';

// ---------------------------------------------------------------------------
// Layout Row — a group of elements that sit side-by-side in a CSS Grid row
// ---------------------------------------------------------------------------
export interface LayoutRow {
  id: string;
  elements: FormElement[];
  gap: number;
  totalUnits: number;
}

// ---------------------------------------------------------------------------
// groupIntoRows — converts a flat ordered element list into layout rows
//
// Rules:
//  1. Elements without `layout.columnWidth` default to 4 (full width).
//  2. Elements accumulate in the current row until totalUnits > MAX_UNITS (4).
//  3. If `layout.forceRowBreak` is true, start a new row BEFORE that element.
//  4. If adding an element would exceed 4 units, start a new row for it.
//  5. Row gap defaults to `defaultGap` (can be overridden per-row via layout.rowGap).
// ---------------------------------------------------------------------------
const MAX_UNITS = 4;

export function groupIntoRows(
  elements: FormElement[],
  defaultGap: number = 12,
): LayoutRow[] {
  if (elements.length === 0) return [];

  const rows: LayoutRow[] = [];
  let current: FormElement[] = [];
  let currentUnits = 0;
  let rowId = 0;

  function flushRow(gap?: number) {
    if (current.length === 0) return;
    rows.push({
      id: `row-${++rowId}`,
      elements: [...current],
      gap: gap ?? defaultGap,
      totalUnits: currentUnits,
    });
    current = [];
    currentUnits = 0;
  }

  for (const el of elements) {
    const units = Math.min(Math.max(el.layout?.columnWidth ?? 4, 1), 4);

    // Force row break before this element
    if (el.layout?.forceRowBreak && current.length > 0) {
      flushRow(el.layout?.rowGap);
    }

    // Would exceed row capacity
    if (current.length > 0 && currentUnits + units > MAX_UNITS) {
      flushRow(defaultGap);
    }

    current.push(el);
    currentUnits += units;
  }

  // Flush remaining elements
  if (current.length > 0) {
    flushRow(defaultGap);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// getRowGap — extract the row gap from a row's first element or default
// ---------------------------------------------------------------------------
export function getRowGap(row: LayoutRow, defaultGap: number = 12): number {
  return row.elements[0]?.layout?.rowGap ?? row.gap ?? defaultGap;
}

// ---------------------------------------------------------------------------
// getColumnWidthPercent — convert columnWidth units to CSS percentage
// ---------------------------------------------------------------------------
export function getColumnWidthPercent(columnWidth: number | undefined): string {
  const units = Math.min(Math.max(columnWidth ?? 4, 1), 4);
  return `${(units / MAX_UNITS) * 100}%`;
}

// ---------------------------------------------------------------------------
// getColumnTemplate — generate CSS grid-template-columns for a row
// ---------------------------------------------------------------------------
export function getColumnTemplate(row: LayoutRow): string {
  return row.elements
    .map((el) => getColumnWidthPercent(el.layout?.columnWidth))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Responsive column width — override based on device breakpoint
// ---------------------------------------------------------------------------
export function getResponsiveColumnWidth(
  el: FormElement,
  breakpoint: 'tablet' | 'mobile',
): number {
  return el.style?.responsive?.[breakpoint]?.columnWidth ?? el.layout?.columnWidth ?? 4;
}
