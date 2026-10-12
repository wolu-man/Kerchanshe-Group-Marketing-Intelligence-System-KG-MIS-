-- =============================================================================
-- Migration 043: Drop legacy free-text color columns
--
-- Replaced by the canonical palette model introduced in 042:
--   dbo.Color        — global color lookup (Name unique, HexCode, SortOrder)
--   dbo.ProductColor — product <-> color links (palette membership)
--   WeeklySales.ColorID — captured sale color, FK to dbo.Color, empty allowed
--
-- Preconditions (verified before this file was committed):
--   * 042 applied: palette tables + backfill + all report views altered.
--   * No code path reads or writes Product.Color / WeeklySales.ProductColor
--     (Product.Color is served derived from ProductColor; WeeklySales uses
--     COALESCE(captured ColorID name, palette) — see weeklySales.service.ts).
--   * No view, procedure, default or check constraint depends on the columns
--     (sys.sql_expression_dependencies and sys.default/check_constraints empty).
--   * Legacy writers (import-products.ts, import-master-data.ts) now insert
--     into dbo.ProductColor instead.
--
-- Product.Color and WeeklySales.ProductColor had no defaults/checks/FKs.
-- Keep WeeklySales.ColorID (new in 042) — only the legacy string goes.
-- =============================================================================

ALTER TABLE dbo.Product DROP COLUMN Color;
GO

ALTER TABLE dbo.WeeklySales DROP COLUMN ProductColor;
GO
