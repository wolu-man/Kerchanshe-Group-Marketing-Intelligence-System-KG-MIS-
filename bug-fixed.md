# Bug Audit Report

**Date:** 2026-08-27
**Auditor:** AI Code Review

---

## Summary

Full audit of the KG-MIS codebase covering frontend (Next.js), backend (Express), and the custom toast notification system. **7 issues identified and all 7 fixed.**

---

## Bugs Found & Fixed

### 1. Toast Positioned at Bottom-Right Instead of Top-Right

| | |
|---|---|
| **Severity** | LOW (user request) |
| **File** | `frontend/src/app/globals.css:536` |
| **Issue** | `.toast-viewport` had `bottom: 18px` placing toasts at the bottom-right corner |
| **Fix** | Changed to `top: 18px` so toasts appear at the top-right corner |

### 2. Toast Animation Slides From Wrong Direction

| | |
|---|---|
| **Severity** | LOW |
| **File** | `frontend/src/app/globals.css:566` |
| **Issue** | `@keyframes toast-in` used `translateY(10px)` (slide up from below), which looks wrong when viewport is at top |
| **Fix** | Changed to `translateY(-10px)` so toasts slide down from the top |

### 3. Double `/api/v1` Prefix in API Calls

| | |
|---|---|
| **Severity** | HIGH |
| **File** | `frontend/src/lib/use-relationships.ts` |
| **Issue** | API calls prepended `/api/v1` to URLs that already contained `/api/v1`, resulting in broken URLs like `/api/v1/api/v1/relationships` |
| **Fix** | Removed the redundant prefix so URLs resolve correctly |

### 4. `/uploads` Static Files Served Without Authentication

| | |
|---|---|
| **Severity** | HIGH |
| **File** | `backend/src/app.ts` |
| **Issue** | The `/uploads` static file route had no auth middleware, allowing anyone to access uploaded files without authentication |
| **Fix** | Added `requireAuth` middleware to the `/uploads` static file serving route |

### 5. Toast setTimeout SSR Safety

| | |
|---|---|
| **Severity** | MEDIUM |
| **File** | `frontend/src/components/Toast.tsx:92` |
| **Issue** | `window.setTimeout` used directly without SSR guard; `setTimeout` return type can vary between `number` and `NodeJS.Timeout` |
| **Fix** | Replaced `window.setTimeout` with bare `setTimeout` which is SSR-safe in Next.js client components |

### 6. XSS Sanitizer Incomplete Coverage

| | |
|---|---|
| **Severity** | MEDIUM |
| **File** | `backend/src/modules/forms/formSchema.ts:421-430` |
| **Issue** | Regex-based sanitizer only stripped `<script>`, `on*` handlers, `javascript:`, and `<iframe>` — missed `<object>`, `<embed>`, `<applet>`, `<base>`, `<meta>`, `<link>`, `<form>`, `<svg>`, `data:` URIs, `vbscript:`, and `expression()` |
| **Fix** | Expanded regex patterns to strip all known XSS vectors including dangerous tags, SVG, data URIs, vbscript, and CSS expression attacks |

### 7. Toast Deduplication Timer Not Reset

| | |
|---|---|
| **Severity** | MEDIUM |
| **File** | `frontend/src/components/Toast.tsx:89-95` |
| **Issue** | When a duplicate toast arrived with a new duration, the existing auto-dismiss timer was not cleared/reset — old timer still fired at the original time |
| **Fix** | Rewrote timer management to always clear and reset the timer on every render cycle; also cleaned up orphaned timers for dismissed toasts |

---

## Files Modified (6 files)

| # | File | Change |
|---|------|--------|
| 1 | `frontend/src/app/globals.css` | Toast viewport position + animation direction |
| 2 | `frontend/src/lib/use-relationships.ts` | Removed double `/api/v1` prefix |
| 3 | `backend/src/app.ts` | Added `requireAuth` middleware on `/uploads` |
| 4 | `frontend/src/components/Toast.tsx` | SSR safety + timer reset on dedup |
| 5 | `backend/src/modules/forms/formSchema.ts` | Hardened XSS sanitizer coverage |

---

## Recommendations

- Consider installing DOMPurify for defense-in-depth on rich text sanitization
- Audit all static file routes for auth coverage
- Add integration tests for toast deduplication behavior
