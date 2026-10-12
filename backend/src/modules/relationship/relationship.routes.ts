import { Router } from 'express';
import type { Request } from 'express';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { asyncHandler } from '../../utils/http';
import { audit } from '../../db/audit';
import { BadRequestError } from '../../utils/errors';
import {
  listConfigurations,
  getConfiguration,
  createConfiguration,
  updateConfiguration,
  deleteConfiguration,
  listItems,
  createItem,
  resolveDependentOptions,
  validateParentChild,
} from './relationship.service';
import { relationshipConfigSchema, relationshipItemSchema, resolveOptionsSchema, validateParentChildSchema } from './relationship.validation';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

/**
 * GET /api/v1/configurations/relationships
 * List all relationship configurations (admin only)
 */
router.get(
  '/',
  can('admin.relationshipConfig'),
  asyncHandler(async (_req, res) => {
    const items = await listConfigurations();
    res.json({ items });
  })

);

/**
 * GET /api/v1/configurations/relationship-configurations
 * List all relationship configurations (admin only) - alias for /
 */
router.get(
  '/relationship-configurations',
  can('admin.relationshipConfig'),
  asyncHandler(async (_req, res) => {
    const items = await listConfigurations();
    res.json({ items });
  })
);

/**
 * GET /api/v1/configurations/relationships/:id
 * Get a single configuration (admin only)
 */
router.get(
  '/:id',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const item = await getConfiguration(id);
    res.json({ item });
  })
);

/**
 * POST /api/v1/configurations/relationships
 * Create a new relationship configuration (admin only)
 */
router.post(
  '/',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const parsed = relationshipConfigSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Invalid configuration data', 'VALIDATION_ERROR');

    const created = await createConfiguration(parsed.data);
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'CREATE',
      entity: 'RelationshipConfiguration',
      detail: parsed.data,
    });
    res.status(201).json({ item: created });
  })
);

/**
 * PUT /api/v1/configurations/relationships/:id
 * Update a relationship configuration (admin only)
 */
router.put(
  '/:id',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parsed = relationshipConfigSchema.safeParse({ ...req.body, ConfigurationID: id });
    if (!parsed.success) throw new BadRequestError('Invalid configuration data', 'VALIDATION_ERROR');

    await updateConfiguration(id, parsed.data);
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'RelationshipConfiguration',
      detail: parsed.data,
    });
    res.json({ ok: true });
  })
);

/**
 * DELETE /api/v1/configurations/relationships/:id
 * Delete a relationship configuration (admin only)
 * Fails if dependent items exist
 */
router.delete(
  '/:id',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await deleteConfiguration(id);
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'DELETE',
      entity: 'RelationshipConfiguration',
      detail: { id },
    });
    res.json({ ok: true });
  })
);

/**
 * GET /api/v1/configurations/relationships/:configurationId/items
 * List all relationship items for a configuration (admin only)
 */
router.get(
  '/:configurationId/items',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const configurationId = Number(req.params.configurationId);
    const items = await listItems(configurationId);
    res.json({ items });
  })
);

/**
 * POST /api/v1/configurations/relationships/:configurationId/items
 * Create a new relationship item (admin only)
 */
router.post(
  '/:configurationId/items',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const configurationId = Number(req.params.configurationId);

    // Validate parentEntityValue format: 'EntityType:ID'
    const { ParentEntityValue } = relationshipItemSchema.parse({
      ...req.body,
      ConfigurationID: configurationId,
    });

    // Basic format validation: should contain a colon
    if (!ParentEntityValue.includes(':')) {
      throw new BadRequestError('ParentEntityValue must be in format "EntityType:ID" (e.g. "BusinessGroup:1")', 'VALIDATION_ERROR');
    }

    const created = await createItem({
      ConfigurationID: configurationId,
      ParentEntityValue: req.body.ParentEntityValue,
      ChildEntity: req.body.ChildEntity,
      ChildEntityID: req.body.ChildEntityID,
      DisplayName: req.body.DisplayName,
      DisplayOrder: req.body.DisplayOrder,
    });

    await logAudit(req,{
      userId: req.user!.userId,
      action: 'CREATE',
      entity: 'RelationshipItem',
      detail: { ...req.body, ConfigurationID: configurationId },
    });
    res.status(201).json({ item: created });
  })
);

/**
 * GET /api/v1/configurations/relationships/resolve/options
 * Resolve dependent options for a parent entity/ID.
 * Used by frontend dropdowns to fetch filtered child options.
 * Query params: ?parentEntity=BusinessGroup&parentId=5
 */
router.get(
  '/resolve/options',
  can('multimedia.view'), // reuse existing multimedia view permission, or create 'admin.relationshipResolve'
  asyncHandler(async (req, res) => {
    const parsed = resolveOptionsSchema.safeParse({
      parentEntity: req.query.parentEntity as string,
      parentId: Number(req.query.parentId),
    });

    if (!parsed.success) throw new BadRequestError('parentEntity and parentId query parameters required', 'VALIDATION_ERROR');

    const options = await resolveDependentOptions(parsed.data.parentEntity, parsed.data.parentId);
    res.json({ options });
  })
);

/**
 * POST /api/v1/configurations/relationships/validate
 * Validate a parent/child combination.
 * Returns { valid: boolean; reason?: string }
 * Used by backend form validation to prevent invalid submissions.
 */
router.post(
  '/validate',
  can('multimedia.view'),
  asyncHandler(async (req, res) => {
    const parsed = validateParentChildSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError('Invalid validation request', 'VALIDATION_ERROR');

    const result = await validateParentChild(
      parsed.data.parentEntity,
      parsed.data.parentId,
      parsed.data.childEntity,
      parsed.data.childId
    );
    res.json(result);
  })
);

export { router as relationshipRouter };