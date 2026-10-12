'use client';

import { useState, useEffect, useCallback } from 'react';
import { useFetch } from './use-api';

/**
 * Shape of each option returned from the parent/reference dropdown API.
 * e.g. from /reference/business-groups
 */
export interface ParentOption {
  label: string;
  value: number;
}

/** Shape of each option returned from the child/resolve API. */
export interface ChildOption {
  label: string;
  value: number;
  entity: string;
  configurationId: number;
}

/** Full return type of the useRelationships hook. */
export interface UseRelationshipsReturn {
  /** Options for the parent dropdown (e.g. Business Groups). */
  parentOptions: ParentOption[];
  /** Filtered options for the child dropdown (e.g. Regions for the selected BG). */
  childOptions: ChildOption[];
  /** True while any API request is in flight. */
  loading: boolean;
  /** Last error message, if any. */
  error: string | null;
  /** Current selected parent value as a string (e.g. "BusinessGroup:5"). */
  parentValue: string;
  /** Set the parent value (typically from onChange of the parent select). */
  setParentValue: (v: string) => void;
  /** Reload child options (e.g. call after parent changes). */
  reloadChildOptions: () => void;
  /** True when no parent value is selected (child should be disabled). */
  isChildDisabled: boolean;
  /** Clear the child selection. */
  clearChildValue: () => void;
}

/**
 * Hook for dependent dropdown relationships.
 *
 * Usage:
 *   const { parentOptions, childOptions, parentValue, setParentValue,
 *           isChildDisabled, clearChildValue } = useRelationships(
 *     'BusinessGroup', 'Region'
 *   );
 *
 *   // parentOptions: options for the parent dropdown
 *   // childOptions: filtered options for the child dropdown
 *   // isChildDisabled: true until parentValue is selected
 *   // clearChildValue: cleets the child selection
 * );
 */
export function useRelationships(
  parentEntity: string,
  childEntity: string,
  defaultParentValue: string = ''
): UseRelationshipsReturn {
  const [parentValue, setParentValue] = useState(defaultParentValue);
  const [childValue, setChildValue] = useState('');

  // Fetch parent options from reference endpoint
  // e.g. /reference/business-groups, /reference/regions, etc.
  const { data: parentData, error: parentError, loading: parentLoading } = useFetch<{
    items: ParentOption[];
  }>(`/reference/${parentEntity.toLowerCase()}s`);

  // Fetch child options when parent value changes
  // Backend: GET /api/v1/configurations/relationships/resolve/options?parentEntity=X&parentId=Y
  const { data: childData, error: childError, loading: childLoading } = useFetch<{
    items: ChildOption[];
  }>(
    `/configurations/relationships/resolve/options?parentEntity=${parentEntity}&parentId=${parentValue}`,
    [parentValue]
  );

  // When parentValue changes, clear child selection if it no longer matches new options
  useEffect(() => {
    if (parentValue !== defaultParentValue && childValue !== '') {
      const stillValid = childData?.items.some((opt) => opt.value === Number(childValue));
      if (!stillValid) {
        setChildValue('');
      }
    }
  }, [parentValue, childValue, childData]);

  return {
    parentOptions: parentData?.items ?? [],
    childOptions: childData?.items ?? [],
    loading: parentLoading || childLoading,
    error: parentError || childError,
    parentValue,
    setParentValue,
    reloadChildOptions: () => {},
    isChildDisabled: !parentValue,
    clearChildValue: () => setChildValue(''),
  };
}