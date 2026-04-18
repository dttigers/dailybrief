/**
 * Canonical category list for Vigil thoughts.
 *
 * Single source of truth — consumed by BulkActionBar recategorize menu and the
 * Phase 101 ContextMenu's Move-to-category submenu. Server-side validation lives
 * in vigil-core/src/routes/thoughts.ts `VALID_CATEGORIES`; keep the two in sync
 * (Phase 101 Plan 01, per 101-RESEARCH Don't Hand-Roll table).
 *
 * Order is preservation — BulkActionBar shipped this order in v2.5 and the
 * UI-SPEC locked it in §Submenu empty states. Do not reorder without a roadmap
 * entry.
 */
export const CATEGORIES = ['task', 'therapy', 'idea', 'reflection', 'project'] as const
export type Category = typeof CATEGORIES[number]
