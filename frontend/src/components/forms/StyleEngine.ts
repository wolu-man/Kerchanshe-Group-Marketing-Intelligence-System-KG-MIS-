'use client';

import type { FieldStyle, FormBranding, FormElement, FormTheme } from '@/lib/types';

// ---------------------------------------------------------------------------
// Resolved styles — flat object ready for inline CSS
// ---------------------------------------------------------------------------
export interface ResolvedFieldStyles {
  wrapper: React.CSSProperties;
  label: React.CSSProperties;
  description: React.CSSProperties;
  input: React.CSSProperties;
  required: React.CSSProperties;
  container: React.CSSProperties;
  hideLabel?: boolean;
  hideDescription?: boolean;
  hidePlaceholder?: boolean;
  labelPosition?: 'top' | 'left' | 'right';
  placeholderColor?: string;
  hoverBorderColor?: string;
}

// ---------------------------------------------------------------------------
// Defaults — sensible base values when nothing is overridden
// ---------------------------------------------------------------------------
const DEFAULTS: ResolvedFieldStyles = {
  wrapper: {},
  label: {},
  description: {},
  input: {},
  required: {},
  container: {},
};

// ---------------------------------------------------------------------------
// resolveFieldStyles — merge global theme + per-field overrides
// ---------------------------------------------------------------------------
function cleanStyles(obj: React.CSSProperties): React.CSSProperties {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v as string | number;
  }
  return out as React.CSSProperties;
}

export function resolveFieldStyles(
  el: FormElement,
  theme?: FormTheme,
): ResolvedFieldStyles {
  const s = el.style;
  const t = theme;

  const wrapper: React.CSSProperties = {};
  const label: React.CSSProperties = {};
  const description: React.CSSProperties = {};
  const input: React.CSSProperties = {};
  const required: React.CSSProperties = {};
  const container: React.CSSProperties = {};

  // --- Wrapper (field container) ---
  if (s?.fieldMargin) wrapper.margin = s.fieldMargin;
  if (s?.fieldPadding) wrapper.padding = s.fieldPadding;
  if (s?.width) wrapper.width = s.width;
  if (s?.minHeight) wrapper.minHeight = s.minHeight;
  if (s?.alignSelf) wrapper.alignSelf = s.alignSelf;
  if (s?.justifySelf) wrapper.justifySelf = s.justifySelf;

  // --- Label ---
  if (s?.labelSize || t?.labelSize) label.fontSize = s?.labelSize ?? t?.labelSize;
  if (s?.labelWeight || t?.labelWeight) label.fontWeight = s?.labelWeight ?? t?.labelWeight;
  if (s?.labelColor || t?.labelColor) label.color = s?.labelColor ?? t?.labelColor;
  if (s?.fontFamily || t?.labelFont) label.fontFamily = s?.fontFamily ?? t?.labelFont;

  // --- Description ---
  if (s?.descriptionSize) description.fontSize = s.descriptionSize;
  if (s?.descriptionColor) description.color = s.descriptionColor;

  // --- Input ---
  if (s?.fontFamily || t?.inputFont) input.fontFamily = s?.fontFamily ?? t?.inputFont;
  if (s?.fontSize || t?.inputSize) input.fontSize = s?.fontSize ?? t?.inputSize;
  if (s?.fontWeight || t?.inputWeight) input.fontWeight = s?.fontWeight ?? t?.inputWeight;
  if (s?.fontColor || t?.inputColor) input.color = s?.fontColor ?? t?.inputColor;
  if (s?.inputBg || t?.inputBg) input.backgroundColor = s?.inputBg ?? t?.inputBg;
  if (s?.inputBorder || t?.inputBorder) input.border = s?.inputBorder ?? t?.inputBorder;
  if (s?.inputBorderColor) input.borderColor = s.inputBorderColor;
  if (s?.inputBorderRadius || t?.inputRadius) input.borderRadius = s?.inputBorderRadius ?? t?.inputRadius;
  if (s?.inputShadow) input.boxShadow = s.inputShadow;
  if (s?.inputPaddingH || t?.inputPadding) {
    const pad = s?.inputPaddingH ?? t?.inputPadding;
    input.paddingLeft = pad;
    input.paddingRight = pad;
  }
  if (s?.inputPaddingV) {
    input.paddingTop = s.inputPaddingV;
    input.paddingBottom = s.inputPaddingV;
  }
  if (s?.textAlign) input.textAlign = s.textAlign;

  // --- Required indicator ---
  if (s?.requiredColor) required.color = s.requiredColor;

  // --- Container (for label+input side-by-side layouts) ---
  if (s?.labelGap) container.gap = s.labelGap;

  // --- Boolean/enum flags ---
  const hideLabel = s?.hideLabel ?? false;
  const hideDescription = s?.hideDescription ?? false;
  const hidePlaceholder = s?.hidePlaceholder ?? false;
  const labelPosition = s?.labelPosition ?? 'top';
  const placeholderColor = s?.placeholderColor;
  const hoverBorderColor = s?.hoverBorderColor;

  const resolved = {
    wrapper: cleanStyles(wrapper),
    label: cleanStyles(label),
    description: cleanStyles(description),
    input: cleanStyles(input),
    required: cleanStyles(required),
    container: cleanStyles(container),
    ...(hideLabel ? { hideLabel: true } : {}),
    ...(hideDescription ? { hideDescription: true } : {}),
    ...(hidePlaceholder ? { hidePlaceholder: true } : {}),
    ...(labelPosition !== 'top' ? { labelPosition } : {}),
    ...(placeholderColor ? { placeholderColor } : {}),
    ...(hoverBorderColor ? { hoverBorderColor } : {}),
  };

  return resolved;
}

// ---------------------------------------------------------------------------
// resolveFormStyles — convert FormTheme to CSS custom properties
// ---------------------------------------------------------------------------
export function resolveFormStyles(theme?: FormTheme): React.CSSProperties {
  if (!theme) return {};
  const vars: Record<string, string> = {};
  if (theme.fieldRadius) vars['--form-field-radius'] = theme.fieldRadius;
  if (theme.fieldBorder) vars['--form-field-border'] = theme.fieldBorder;
  if (theme.fieldBg) vars['--form-field-bg'] = theme.fieldBg;
  if (theme.labelFont) vars['--form-label-font'] = theme.labelFont;
  if (theme.labelSize) vars['--form-label-size'] = theme.labelSize;
  if (theme.labelWeight) vars['--form-label-weight'] = theme.labelWeight;
  if (theme.labelColor) vars['--form-label-color'] = theme.labelColor;
  if (theme.inputFont) vars['--form-input-font'] = theme.inputFont;
  if (theme.inputSize) vars['--form-input-size'] = theme.inputSize;
  if (theme.inputWeight) vars['--form-input-weight'] = theme.inputWeight;
  if (theme.inputColor) vars['--form-input-color'] = theme.inputColor;
  if (theme.inputBg) vars['--form-input-bg'] = theme.inputBg;
  if (theme.inputBorder) vars['--form-input-border'] = theme.inputBorder;
  if (theme.inputRadius) vars['--form-input-radius'] = theme.inputRadius;
  if (theme.inputPadding) vars['--form-input-padding'] = theme.inputPadding;
  if (theme.focusBorder) vars['--form-focus-border'] = theme.focusBorder;
  if (theme.focusShadow) vars['--form-focus-shadow'] = theme.focusShadow;
  if (theme.sectionBg) vars['--form-section-bg'] = theme.sectionBg;
  if (theme.sectionRadius) vars['--form-section-radius'] = theme.sectionRadius;
  if (theme.gap) vars['--form-gap'] = theme.gap;
  if (theme.contentMaxWidth) vars['--form-max-width'] = theme.contentMaxWidth;
  return vars as React.CSSProperties;
}

// ---------------------------------------------------------------------------
// applyFocusStyles — dynamically apply focus/hover styles to input elements
// ---------------------------------------------------------------------------
export function getInputFocusStyle(el: FormElement): React.CSSProperties {
  const s = el.style;
  if (!s?.focusBorderColor && !s?.focusShadow) return {};
  const style: React.CSSProperties = {};
  if (s.focusBorderColor) style.borderColor = s.focusBorderColor;
  if (s.focusShadow) style.boxShadow = s.focusShadow;
  return style;
}

export function getInputHoverStyle(el: FormElement): React.CSSProperties {
  const s = el.style;
  if (!s?.hoverBorderColor) return {};
  return { borderColor: s.hoverBorderColor };
}
