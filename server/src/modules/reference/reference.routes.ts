import { Router } from 'express';
import { z } from 'zod';
import sql from 'mssql';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { writeAudit } from '../../db/audit';
import { getPool } from '../../db/pool';
import { ROLES } from '../../types';

const router = Router();

/** Regions (country -> region) with their outlets. */
router.get(
  '/regions',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT r.RegionID, r.RegionName, r.Country,
             (SELECT COUNT(*) FROM dbo.Outlet o WHERE o.RegionID = r.RegionID) AS OutletCount
      FROM dbo.Region r
      ORDER BY r.Country, r.RegionName
    `);
    res.json(result.recordset);
  }),
);

/** Outlets, optionally filtered by region. */
router.get(
  '/outlets',
  requireAuth,
  validate({
    query: z.object({ regionId: z.coerce.number().int().positive().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const request = pool.request();
    let where = 'WHERE o.IsActive = 1';
    if (req.query.regionId) {
      where += ' AND o.RegionID = @regionId';
      request.input('regionId', sql.Int, Number(req.query.regionId));
    }
    const result = await request.query(`
      SELECT o.OutletID, o.RegionID, r.RegionName, o.OutletName, o.City
      FROM dbo.Outlet o
      JOIN dbo.Region r ON r.RegionID = o.RegionID
      ${where}
      ORDER BY o.OutletName
    `);
    res.json(result.recordset);
  }),
);

/** Active products (cached from D365FO) for price entry and comparisons. */
router.get(
  '/products',
  requireAuth,
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT ProductID, ProductCode, Name, Category, UnitPrice
      FROM dbo.Product
      WHERE IsActive = 1
      ORDER BY Name
    `);
    res.json(result.recordset);
  }),
);

/** Users with roles (admin). */
router.get(
  '/users',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR),
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT u.UserID, u.CUAS_ID, u.Name, u.Email, u.IsActive, r.RoleID, r.RoleName
      FROM dbo.[User] u
      JOIN dbo.Role r ON r.RoleID = u.RoleID
      ORDER BY u.Name
    `);
    res.json(result.recordset);
  }),
);

/** Current CUAS -> internal role mapping (admin). */
router.get(
  '/role-mappings',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR),
  asyncHandler(async (_req, res) => {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT m.MappingID, m.CUASClaim, m.RoleID, r.RoleName
      FROM dbo.RoleMapping m
      JOIN dbo.Role r ON r.RoleID = m.RoleID
      ORDER BY m.CUASClaim
    `);
    res.json(result.recordset);
  }),
);

/** Update the CUAS role mapping for a claim (takes effect on next login). */
router.put(
  '/role-mappings/:id',
  requireAuth,
  requireRole(ROLES.ADMINISTRATOR),
  validate({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ roleId: z.coerce.number().int().positive() }),
  }),
  asyncHandler(async (req, res) => {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, Number(req.params.id))
      .input('roleId', sql.Int, req.body.roleId)
      .query(`
        UPDATE dbo.RoleMapping SET RoleID = @roleId, UpdatedAt = SYSUTCDATETIME()
        WHERE MappingID = @id;
        SELECT @@ROWCOUNT AS Affected;
      `);
    const affected = Number(result.recordset[0].Affected);
    if (affected === 0) {
      res.status(404).json({ message: 'Role mapping not found' });
      return;
    }
    await writeAudit({
      userId: req.user!.userId,
      action: 'UPDATE_ROLE_MAPPING',
      entity: 'RoleMapping',
      entityId: Number(req.params.id),
    });
    res.json({ message: 'Role mapping updated. Changes take effect on next login.' });
  }),
);

export default router;
