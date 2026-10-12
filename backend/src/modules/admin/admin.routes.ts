import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/http';
import { audit } from '../../db/audit';
import { getKpiSummary, getOfficerRanking, getOfficerDetail, getKpiTrends } from './kpi.service';
import {
  listPlans, getPlanDetail, createPlan, updatePlan, deletePlan,
  listActivities, createActivity, updateActivity, deleteActivity,
  getPlanningSummary,
} from './planning.service';
import {
  listKpiDefs, getKpiDef, createKpiDef, updateKpiDef, deleteKpiDef,
  upsertKpiResult, listKpiResults, getKpiRanking, getPlannedVsAchieved,
  upsertMeasurement, listMeasurement, getVerificationQueue, verifyMeasurements,
} from './kpi-config.service';
import { importKpiWorkbook } from './kpi-import.service';
import {
  listTasks as listCorpTasks,
  updateTask as updateCorpTask,
  verifyTasks as verifyCorpTasks,
  getTaskSummary as getCorpTaskSummary,
  listEvents as listCorpEvents,
  updateEvent as updateCorpEvent,
  getRoles as getCorpRoles,
} from './corp-marketing.service';
import { importCorpMarketingWorkbook } from './corp-import.service';
import {
  listRoleMappings,
  upsertRoleMapping,
  deleteRoleMapping,
  listNotificationConfig,
  listEventTypes,
  listChannels,
  upsertNotificationConfig,
  deleteNotificationConfig,
  listUsers,
  listRoles,
  updateUserRole,
  assignRegion,
  removeRegion,
  createUser,
  updateUser,
  toggleUserActive,
  listAudit,
  listAuditTotal,
  listReportSchedules,
  upsertReportSchedule,
  deleteReportSchedule,
  listBusinessGroups,
  getBusinessGroup,
  createBusinessGroup,
  updateBusinessGroup,
  deleteBusinessGroup,
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  updateProductBusinessGroup,
  updateProductPhoto,
  listConfigurations,
  getConfiguration,
  createConfiguration,
  updateConfiguration,
  deleteConfiguration,
  listItems,
  createItem,
  listCustomerTypes,
  createCustomerType,
  updateCustomerType,
  toggleCustomerTypeActive,
  listRegions,
  createRegion,
  updateRegion,
  deleteRegion,
  listOutlets,
  createOutlet,
  updateOutlet,
  deleteOutlet,
  listProductPrices,
  saveProductPrices,
  listLookups,
  createLookup,
  updateLookup,
  deleteLookup,
  exportAuditExcel,
  exportAuditCsv,
  exportAuditPdf,
} from './admin.service';

import type { Request } from 'express';

function logAudit(req: Request, entry: { userId: number | null; action: string; entity: string; entityId?: number | null; detail?: Record<string, unknown> | null }) {
  return audit({ ...entry, ipAddress: req.ip });
}

const router = Router();
router.use(requireAuth);

// Product photo upload config
const productPhotoDir = path.resolve('uploads/products');
fs.mkdirSync(productPhotoDir, { recursive: true });
const productPhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, productPhotoDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// KPI evidence upload config
const kpiEvidenceDir = path.resolve('uploads/kpi-evidence');
fs.mkdirSync(kpiEvidenceDir, { recursive: true });
const kpiEvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, kpiEvidenceDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 12);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(pdf|xlsx|xls|docx|doc|csv|jpg|jpeg|png|webp)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Unsupported evidence file type'));
  },
});

// KPI workbook import upload config (xlsx only, parsed in memory)
const kpiImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only .xlsx workbooks are supported'));
  },
});

// --- CUAS role mapping (Security Matrix 3.6) --------------------------------
router.get(
  '/role-mapping',
  can('admin.roleMapping'),
  asyncHandler(async (_req, res) => {
    const items = await listRoleMappings();
    res.json({ items });
  })
);

router.put(
  '/role-mapping',
  can('admin.roleMapping'),
  validate(z.object({ cuasClaim: z.string().min(1).max(150), roleId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    await upsertRoleMapping(req.body.cuasClaim, req.body.roleId);
    await logAudit(req,{ userId: req.user!.userId, action: 'ROLE_MAPPING_UPSERTED', entity: 'RoleMapping', detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/role-mapping/:mappingId',
  can('admin.roleMapping'),
  asyncHandler(async (req, res) => {
    await deleteRoleMapping(Number(req.params.mappingId));
    res.json({ ok: true });
  })
);

// --- Notification configuration (Security Matrix 3.7) -----------------------
router.get(
  '/notification-config',
  can('admin.notificationConfig'),
  asyncHandler(async (_req, res) => {
    const items = await listNotificationConfig();
    const events = await listEventTypes();
    const channels = await listChannels();
    res.json({ items, events, channels });
  })
);

router.put(
  '/notification-config',
  can('admin.notificationConfig'),
  validate(z.object({
    triggerEvent: z.string().min(1),
    channel: z.string().min(1),
    roleId: z.number().int().positive(),
    enabled: z.boolean().default(true),
  })),
  asyncHandler(async (req, res) => {
    await upsertNotificationConfig({
      TriggerEvent: req.body.triggerEvent,
      Channel: req.body.channel,
      RoleID: req.body.roleId,
      Enabled: req.body.enabled,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'NOTIFICATION_CONFIG_UPSERTED', entity: 'NotificationConfig', detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/notification-config/:configId',
  can('admin.notificationConfig'),
  asyncHandler(async (req, res) => {
    await deleteNotificationConfig(Number(req.params.configId));
    res.json({ ok: true });
  })
);

// --- Users & region assignments (Security Matrix 4) --------------------------
router.get(
  '/users',
  can('admin.users'),
  asyncHandler(async (_req, res) => {
    const items = await listUsers();
    const roles = await listRoles();
    res.json({ items, roles });
  })
);

router.put(
  '/users/:userId/role',
  can('admin.users'),
  validate(z.object({ roleId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    await updateUserRole(Number(req.params.userId), req.body.roleId);
    await logAudit(req,{ userId: req.user!.userId, action: 'USER_ROLE_UPDATED', entity: 'User', entityId: Number(req.params.userId), detail: { roleId: req.body.roleId } });
    res.json({ ok: true });
  })
);

router.post(
  '/users/:userId/regions',
  can('admin.users'),
  validate(z.object({ regionId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    await assignRegion(Number(req.params.userId), req.body.regionId);
    res.json({ ok: true });
  })
);

router.delete(
  '/users/:userId/regions/:regionId',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    await removeRegion(Number(req.params.userId), Number(req.params.regionId));
    res.json({ ok: true });
  })
);

router.post(
  '/users',
  can('admin.users'),
  validate(
    z.object({
      cuasId: z.string().min(3).max(100),
      name: z.string().min(1).max(150),
      email: z.string().email().max(200),
      roleId: z.number().int().positive(),
      password: z.string().min(6).max(200),
    })
  ),
  asyncHandler(async (req, res) => {
    const userId = await createUser(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'USER_CREATED', entity: 'User', entityId: userId, detail: { cuasId: req.body.cuasId } });
    res.status(201).json({ ok: true, userId });
  })
);

router.put(
  '/users/:userId',
  can('admin.users'),
  validate(
    z.object({
      name: z.string().min(1).max(150).optional(),
      email: z.string().email().max(200).optional(),
      roleId: z.number().int().positive().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    await updateUser(Number(req.params.userId), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'USER_UPDATED', entity: 'User', entityId: Number(req.params.userId), detail: req.body });
    res.json({ ok: true });
  })
);

router.put(
  '/users/:userId/active',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await toggleUserActive(Number(req.params.userId));
    await logAudit(req,{ userId: req.user!.userId, action: result.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED', entity: 'User', entityId: Number(req.params.userId) });
    res.json({ ok: true, isActive: result.isActive });
  })
);

// --- Audit log (Security Matrix Section 7) ----------------------------------
router.get(
  '/audit',
  can('admin.audit'),
  asyncHandler(async (req, res) => {
    const opts = {
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      entity: req.query.entity as string | undefined,
      action: req.query.action as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      ipAddress: req.query.ipAddress as string | undefined,
      search: req.query.search as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    };
    const items = await listAudit(opts);
    const total = await listAuditTotal(opts);
    res.json({ items, total });
  })
);

// --- Audit log export (PDF / Excel / CSV) -----------------------------------
router.get(
  '/audit/export',
  can('admin.audit'),
  asyncHandler(async (req, res) => {
    const format = (req.query.format as string) || 'xlsx';
    const opts = {
      userId: req.query.userId ? Number(req.query.userId) : undefined,
      entity: req.query.entity as string | undefined,
      action: req.query.action as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      ipAddress: req.query.ipAddress as string | undefined,
      search: req.query.search as string | undefined,
    };
    try {
      if (format === 'csv') {
        const { filename, content } = await exportAuditCsv(opts);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
      } else if (format === 'pdf') {
        const { filename, buffer } = await exportAuditPdf(opts);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      } else {
        const { filename, buffer } = await exportAuditExcel(opts);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
      }
    } catch (err) {
      console.error('[AUDIT EXPORT ERROR]', format, err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'EXPORT_ERROR', message: (err as Error).message });
      }
    }
  })
);

// --- Power BI report schedules ----------------------------------------------
router.get(
  '/report-schedules',
  can('admin.reportSchedules'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listReportSchedules() });
  })
);

router.put(
  '/report-schedules',
  can('admin.reportSchedules'),
  validate(z.object({
    id: z.string().optional(),
    reportId: z.string().min(1),
    cron: z.string().min(1),
    recipients: z.array(z.string().email()).optional(),
    enabled: z.boolean().default(true),
  })),
  asyncHandler(async (req, res) => {
    const schedule = upsertReportSchedule({
      id: req.body.id,
      reportId: req.body.reportId,
      cron: req.body.cron,
      recipients: req.body.recipients ?? [],
      enabled: req.body.enabled,
    });
    res.status(201).json(schedule);
  })
);

router.delete(
  '/report-schedules/:id',
  can('admin.reportSchedules'),
  asyncHandler(async (req, res) => {
    deleteReportSchedule(req.params.id);
    res.json({ ok: true });
  })
);

// --- BusinessGroup management (admin.businessGroups) --------------------------
router.get(
  '/business-groups',
  can('admin.businessGroups'),
  asyncHandler(async (_req, res) => {
    res.json({ items: await listBusinessGroups() });
  })
);

router.get(
  '/business-groups/:id',
  can('admin.businessGroups'),
  asyncHandler(async (req, res) => {
    res.json(await getBusinessGroup(Number(req.params.id)));
  })
);

router.post(
  '/business-groups',
  can('admin.businessGroups'),
  validate(z.object({
    code: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/),
    name: z.string().min(1).max(150),
    description: z.string().max(1000).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const id = await createBusinessGroup(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'BusinessGroup', entityId: id });
    res.status(201).json({ businessGroupId: id });
  })
);

router.put(
  '/business-groups/:id',
  can('admin.businessGroups'),
  validate(z.object({
    code: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/).optional(),
    name: z.string().min(1).max(150).optional(),
    description: z.string().max(1000).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    await updateBusinessGroup(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'BusinessGroup', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/business-groups/:id',
  can('admin.businessGroups'),
  asyncHandler(async (req, res) => {
    await deleteBusinessGroup(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'BusinessGroup', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// --- Customer management (admin.customers) ------------------------------------
router.get(
  '/customers',
  can('admin.customers'),
  asyncHandler(async (req, res) => {
    res.json({ items: await listCustomers({
      search: req.query.search as string | undefined,
      businessGroupId: req.query.businessGroupId ? Number(req.query.businessGroupId) : undefined,
      customerTypeId: req.query.customerTypeId ? Number(req.query.customerTypeId) : undefined,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
    }) });
  })
);

router.get(
  '/customers/:id',
  can('admin.customers'),
  asyncHandler(async (req, res) => {
    res.json(await getCustomer(Number(req.params.id)));
  })
);

router.post(
  '/customers',
  can('admin.customers'),
  validate(z.object({
    customerCode: z.string().min(1).max(50),
    name: z.string().min(1).max(150),
    customerType: z.string().max(50).optional().nullable(),
    customerTypeId: z.number().int().positive().optional().nullable(),
    contactPerson: z.string().max(150).optional().nullable(),
    contactPhone: z.string().max(30).optional().nullable(),
    email: z.string().email().max(200).optional().nullable(),
    regionId: z.number().int().positive().optional().nullable(),
    outletId: z.number().int().positive().optional().nullable(),
    businessGroupId: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional(),
    address: z.string().max(500).optional().nullable(),
    area: z.string().max(200).optional().nullable(),
    starRating: z.string().max(50).optional().nullable(),
    productInterest: z.string().max(200).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const id = await createCustomer(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'Customer', entityId: id });
    res.status(201).json({ customerId: id });
  })
);

router.put(
  '/customers/:id',
  can('admin.customers'),
  validate(z.object({
    customerCode: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(150).optional(),
    customerType: z.string().max(50).optional().nullable(),
    customerTypeId: z.number().int().positive().optional().nullable(),
    contactPerson: z.string().max(150).optional().nullable(),
    contactPhone: z.string().max(30).optional().nullable(),
    email: z.string().email().max(200).optional().nullable(),
    regionId: z.number().int().positive().optional().nullable(),
    outletId: z.number().int().positive().optional().nullable(),
    businessGroupId: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional(),
    address: z.string().max(500).optional().nullable(),
    area: z.string().max(200).optional().nullable(),
    starRating: z.string().max(50).optional().nullable(),
    productInterest: z.string().max(200).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    await updateCustomer(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'Customer', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/customers/:id',
  can('admin.customers'),
  asyncHandler(async (req, res) => {
    await deleteCustomer(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'Customer', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// --- Product management (admin.products) ------------------------------------
router.get(
  '/products',
  can('admin.products'),
  asyncHandler(async (req, res) => {
    res.json({ items: await listProducts({
      search: req.query.search as string | undefined,
      businessGroupId: req.query.businessGroupId ? Number(req.query.businessGroupId) : undefined,
      color: req.query.color as string | undefined,
      size: req.query.size as string | undefined,
      category: req.query.category as string | undefined,
    }) });
  })
);

router.get(
  '/products/:id',
  can('admin.products'),
  asyncHandler(async (req, res) => {
    res.json(await getProduct(Number(req.params.id)));
  })
);

router.post(
  '/products',
  can('admin.products'),
  validate(z.object({
    productCode: z.string().min(1).max(50),
    name: z.string().min(1).max(200),
    category: z.string().max(100).optional().nullable(),
    unitPrice: z.number().positive().optional().nullable(),
    businessGroupId: z.number().int().positive().optional().nullable(),
    color: z.string().max(100).optional().nullable(),
    size: z.string().max(50).optional().nullable(),
    weightKg: z.number().min(0).optional().nullable(),
    imageUrl: z.string().max(500).optional().nullable(),
    specifications: z.record(z.unknown()).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const id = await createProduct(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'Product', entityId: id });
    res.status(201).json({ productId: id });
  })
);

router.put(
  '/products/:id',
  can('admin.products'),
  validate(z.object({
    productCode: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(200).optional(),
    category: z.string().max(100).optional().nullable(),
    unitPrice: z.number().positive().optional().nullable(),
    businessGroupId: z.number().int().positive().optional().nullable(),
    isActive: z.boolean().optional(),
    color: z.string().max(100).optional().nullable(),
    size: z.string().max(50).optional().nullable(),
    weightKg: z.number().min(0).optional().nullable(),
    imageUrl: z.string().max(500).optional().nullable(),
    specifications: z.record(z.unknown()).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    await updateProduct(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'Product', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/products/:id',
  can('admin.products'),
  asyncHandler(async (req, res) => {
    await deleteProduct(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'Product', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// --- Product BusinessGroup assignment (admin.products) ------------------------
router.put(
  '/products/:id/business-group',
  can('admin.products'),
  validate(z.object({
    businessGroupId: z.number().int().positive().optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    await updateProductBusinessGroup(Number(req.params.id), req.body.businessGroupId ?? null);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'Product', entityId: Number(req.params.id), detail: { businessGroupId: req.body.businessGroupId } });
    res.json({ ok: true });
  })
);

// --- Product photo upload (admin.products) ------------------------------------
router.put(
  '/products/:id/photo',
  can('admin.products'),
  (req, res, next) => {
    productPhotoUpload.single('photo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'NO_FILE', message: 'No photo uploaded' });
    const imageUrl = `/uploads/products/${req.file.filename}`;
    await updateProductPhoto(Number(req.params.id), imageUrl);
    await logAudit(req,{ userId: req.user!.userId, action: 'PHOTO_UPLOADED', entity: 'Product', entityId: Number(req.params.id), detail: { imageUrl } });
    res.json({ ok: true, imageUrl });
  })
);

// --- Relationship configuration (Relationship & Dropdown Configuration) ------
router.get(
  '/relationship-configurations',
  can('admin.relationshipConfig'),
  asyncHandler(async (_req, res) => {
    res.json({ items: await listConfigurations() });
  })
);

router.get(
  '/relationship-configurations/:id',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    res.json(await getConfiguration(Number(req.params.id)));
  })
);

router.post(
  '/relationship-configurations',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const created = await createConfiguration(req.body);
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'CREATE',
      entity: 'RelationshipConfiguration',
      detail: req.body,
    });
    res.status(201).json({ item: created });
  })
);

router.put(
  '/relationship-configurations/:id',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await updateConfiguration(id, req.body);
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'RelationshipConfiguration',
      detail: req.body,
    });
    res.json({ ok: true });
  })
);

router.delete(
  '/relationship-configurations/:id',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    await deleteConfiguration(Number(req.params.id));
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'DELETE',
      entity: 'RelationshipConfiguration',
      detail: { id: Number(req.params.id) },
    });
    res.json({ ok: true });
  })
);

router.get(
  '/relationship-configurations/:configurationId/items',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const items = await listItems(Number(req.params.configurationId));
    res.json({ items });
  })
);

router.post(
  '/relationship-configurations/:configurationId/items',
  can('admin.relationshipConfig'),
  asyncHandler(async (req, res) => {
    const created = await createItem({
      configurationId: Number(req.params.configurationId),
      parentEntityValue: req.body.ParentEntityValue,
      childEntity: req.body.ChildEntity,
      childEntityId: req.body.ChildEntityID,
      displayName: req.body.DisplayName,
      displayOrder: req.body.DisplayOrder,
    });
    await logAudit(req,{
      userId: req.user!.userId,
      action: 'CREATE',
      entity: 'RelationshipItem',
      detail: { ...req.body, ConfigurationID: Number(req.params.configurationId) },
    });
    res.status(201).json({ item: created });
  })
);

// --- CUAS role mapping (Security Matrix 3.6) --------------------------------
// (already defined above)

// --- Notification configuration (Security Matrix 3.7) -----------------------
// (already defined above)

// --- Users & region assignments (Security Matrix 4) --------------------------
// (already defined above)

// --- Audit log (Security Matrix Section 7) ----------------------------------
// (already defined above)

// --- Power BI report schedules ----------------------------------------------
// (already defined above)

// --- BusinessGroup management (admin.businessGroups) --------------------------
// (already defined above)

// --- Customer management (admin.customers) ------------------------------------
// (already defined above)

// --- Product BusinessGroup assignment (admin.products) ------------------------
// (already defined above)

// --- Relationship configuration API routes (at /api/v1/configurations) ------
// The relationship module handles routes at /api/v1/configurations/*
// The admin UI references these via useFetch('/configurations/...')

// --- CustomerType management (admin.customerTypes) ---------------------------
router.get(
  '/customer-types',
  can('admin.customers'),
  asyncHandler(async (_req, res) => {
    const items = await listCustomerTypes();
    res.json({ items });
  })
);

router.post(
  '/customer-types',
  can('admin.customers'),
  validate(z.object({ name: z.string().min(1).max(50) })),
  asyncHandler(async (req, res) => {
    const id = await createCustomerType(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CUSTOMER_TYPE_CREATED', entity: 'CustomerType', entityId: id, detail: req.body });
    res.status(201).json({ ok: true, id });
  })
);

router.put(
  '/customer-types/:id',
  can('admin.customers'),
  validate(z.object({ name: z.string().min(1).max(50) })),
  asyncHandler(async (req, res) => {
    await updateCustomerType(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CUSTOMER_TYPE_UPDATED', entity: 'CustomerType', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.put(
  '/customer-types/:id/active',
  can('admin.customers'),
  asyncHandler(async (req, res) => {
    const result = await toggleCustomerTypeActive(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: result.isActive ? 'CUSTOMER_TYPE_ACTIVATED' : 'CUSTOMER_TYPE_DEACTIVATED', entity: 'CustomerType', entityId: Number(req.params.id) });
    res.json({ ok: true, isActive: result.isActive });
  })
);

// --- Region management (admin.regions) --------------------------------------
router.get(
  '/regions',
  can('admin.regions'),
  asyncHandler(async (_req, res) => {
    const items = await listRegions();
    res.json({ items });
  })
);

router.post(
  '/regions',
  can('admin.regions'),
  validate(z.object({ name: z.string().min(1).max(100), country: z.string().min(1).max(100) })),
  asyncHandler(async (req, res) => {
    const id = await createRegion(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'REGION_CREATED', entity: 'Region', entityId: id, detail: req.body });
    res.status(201).json({ ok: true, id });
  })
);

router.put(
  '/regions/:id',
  can('admin.regions'),
  validate(z.object({ name: z.string().min(1).max(100).optional(), country: z.string().min(1).max(100).optional() })),
  asyncHandler(async (req, res) => {
    await updateRegion(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'REGION_UPDATED', entity: 'Region', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/regions/:id',
  can('admin.regions'),
  asyncHandler(async (req, res) => {
    await deleteRegion(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'REGION_DELETED', entity: 'Region', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// --- Outlet management (admin.outlets) --------------------------------------
router.get(
  '/outlets',
  can('admin.regions'),
  asyncHandler(async (_req, res) => {
    const items = await listOutlets();
    res.json({ items });
  })
);

router.post(
  '/outlets',
  can('admin.regions'),
  validate(z.object({ name: z.string().min(1).max(150), city: z.string().min(1).max(100), regionId: z.number().int().positive() })),
  asyncHandler(async (req, res) => {
    const id = await createOutlet(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'OUTLET_CREATED', entity: 'Outlet', entityId: id, detail: req.body });
    res.status(201).json({ ok: true, id });
  })
);

router.put(
  '/outlets/:id',
  can('admin.regions'),
  validate(z.object({ name: z.string().min(1).max(150).optional(), city: z.string().min(1).max(100).optional(), regionId: z.number().int().positive().optional(), isActive: z.boolean().optional() })),
  asyncHandler(async (req, res) => {
    await updateOutlet(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'OUTLET_UPDATED', entity: 'Outlet', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/outlets/:id',
  can('admin.regions'),
  asyncHandler(async (req, res) => {
    await deleteOutlet(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'OUTLET_DELETED', entity: 'Outlet', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// --- Product per-type pricing (admin.products) -------------------------------
router.get(
  '/products/:id/prices',
  can('admin.products'),
  asyncHandler(async (req, res) => {
    const items = await listProductPrices(Number(req.params.id));
    res.json({ items });
  })
);

router.put(
  '/products/:id/prices',
  can('admin.products'),
  validate(z.object({ prices: z.array(z.object({ customerTypeId: z.number().int().positive(), unitPrice: z.number().min(0) })) })),
  asyncHandler(async (req, res) => {
    await saveProductPrices(Number(req.params.id), req.body.prices);
    await logAudit(req,{ userId: req.user!.userId, action: 'PRODUCT_PRICES_SAVED', entity: 'Product', entityId: Number(req.params.id), detail: { count: req.body.prices.length } });
    res.json({ ok: true });
  })
);

// --- LookupOption management (admin.configurations) ---------------------------
router.get(
  '/lookups',
  can('admin.configurations'),
  asyncHandler(async (req, res) => {
    const items = await listLookups(req.query.category as string | undefined);
    res.json({ items });
  })
);

router.post(
  '/lookups',
  can('admin.configurations'),
  validate(z.object({ category: z.string().min(1).max(50), value: z.string().min(1).max(100), sortOrder: z.number().int().optional() })),
  asyncHandler(async (req, res) => {
    const id = await createLookup(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'LookupOption', entityId: id, detail: req.body });
    res.status(201).json({ ok: true, id });
  })
);

router.put(
  '/lookups/:id',
  can('admin.configurations'),
  validate(z.object({ value: z.string().min(1).max(100) }).partial()),
  asyncHandler(async (req, res) => {
    await updateLookup(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'LookupOption', entityId: Number(req.params.id), detail: req.body });
    res.json({ ok: true });
  })
);

router.delete(
  '/lookups/:id',
  can('admin.configurations'),
  asyncHandler(async (req, res) => {
    await deleteLookup(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'LookupOption', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// KPI & Performance
// ---------------------------------------------------------------------------
const planSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional().nullable(),
  frequency: z.enum(['Annual', 'Quarterly', 'Monthly', 'Weekly']).default('Monthly'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedSubmissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  responsibleUserId: z.number().int().positive().optional().nullable(),
  responsibleTeam: z.string().max(100).optional().nullable(),
  regionId: z.number().int().positive().optional().nullable(),
  mainFocus: z.string().max(200).optional().nullable(),
  keyDeliverable: z.string().max(10000).optional().nullable(),
  remarks: z.string().max(10000).optional().nullable(),
  parentPlanId: z.number().int().positive().optional().nullable(),
});

const activitySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).optional().nullable(),
  detailedActivity: z.string().max(10000).optional().nullable(),
  frequency: z.string().max(20).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  plannedSubmissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['Not Started', 'In Progress', 'Under Review', 'Completed', 'Delayed', 'Ongoing', 'Planned']).default('Not Started'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
  responsibleUserId: z.number().int().positive().optional().nullable(),
  responsibleTeam: z.string().max(100).optional().nullable(),
  regionId: z.number().int().positive().optional().nullable(),
  productId: z.number().int().positive().optional().nullable(),
  mainFocus: z.string().max(200).optional().nullable(),
  activityType: z.string().max(100).optional().nullable(),
  expectedDeliverable: z.string().max(10000).optional().nullable(),
  target: z.string().max(100).optional().nullable(),
  unit: z.string().max(50).optional().nullable(),
  remarks: z.string().max(10000).optional().nullable(),
});

const kpiDefSchema = z.object({
  kpiCode: z.string().min(1).max(50),
  kpiName: z.string().min(1).max(200),
  description: z.string().max(10000).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  measurementUnit: z.enum(['Count', 'Percentage', 'Amount', 'Completion']).default('Count'),
  targetValue: z.number().optional().nullable(),
  weight: z.number().min(0).max(100).default(1.0),
  frequency: z.enum(['Weekly', 'Monthly', 'Quarterly', 'Annual']).default('Monthly'),
  direction: z.enum(['HigherIsBetter', 'LowerIsBetter']).default('HigherIsBetter'),
  thresholdExcellent: z.number().optional().nullable(),
  thresholdGood: z.number().optional().nullable(),
  thresholdAverage: z.number().optional().nullable(),
  applicableRole: z.string().max(50).optional().nullable(),
  applicableRegionId: z.number().int().positive().optional().nullable(),
  applicableProductId: z.number().int().positive().optional().nullable(),
  strategicObjective: z.string().max(200).optional().nullable(),
  businessUnitId: z.number().int().positive().optional().nullable(),
  kpiOwnerName: z.string().max(100).optional().nullable(),
  kpiOwnerUserId: z.number().int().positive().optional().nullable(),
  dataSource: z.string().max(50).optional().nullable(),
  collectionMethod: z.string().max(50).optional().nullable(),
  alertThresholdText: z.string().max(50).optional().nullable(),
  alertThresholdPercent: z.number().min(0).max(1000).optional().nullable(),
  evidenceRequired: z.boolean().optional().nullable(),
  verificationRole: z.string().max(100).optional().nullable(),
  dashboardGroup: z.string().max(100).optional().nullable(),
  systemModule: z.string().max(100).optional().nullable(),
  integrationMethod: z.string().max(100).optional().nullable(),
  targetText: z.string().max(300).optional().nullable(),
  unitOfMeasure: z.string().max(50).optional().nullable(),
  sourceRef: z.string().max(20).optional().nullable(),
});

const kpiResultSchema = z.object({
  kpiDefId: z.number().int().positive(),
  userId: z.number().int().positive(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  frequency: z.enum(['Weekly', 'Monthly', 'Quarterly', 'Annual']),
  actualValue: z.number(),
  targetValue: z.number().optional().nullable(),
  dataSource: z.string().max(50).optional().nullable(),
  regionId: z.number().int().positive().optional().nullable(),
  productId: z.number().int().positive().optional().nullable(),
  remarks: z.string().max(10000).optional().nullable(),
});

// Monthly measurement entry: actual only, efficiency/status computed server-side.
const measurementSchema = z.object({
  kpiDefId: z.number().int().positive(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actualValue: z.number().nullable().optional(),
  statusOverride: z.enum(['On Track', 'At Risk', 'Off Track']).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  evidenceReference: z.string().max(500).nullable().optional(),
});

const verifySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500),
  decision: z.enum(['Verified', 'Rejected']),
  note: z.string().max(500).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Corporate Marketing Activities Plan
// ---------------------------------------------------------------------------
const corpTaskUpdateSchema = z.object({
  responsiblePerson: z.string().max(200).nullable().optional(),
  completionPercent: z.number().min(0).max(100).nullable().optional(),
  evidenceRemarks: z.string().max(2000).nullable().optional(),
});

const corpEventUpdateSchema = z.object({
  category: z.string().max(100).nullable().optional(),
  eventName: z.string().max(300).nullable().optional(),
  businessUnit: z.string().max(100).nullable().optional(),
  responsiblePerson: z.string().max(200).nullable().optional(),
  responsibleRole: z.string().max(200).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(['Planned', 'In Progress', 'Completed', 'Cancelled']).optional(),
  plannedParticipants: z.number().int().min(0).nullable().optional(),
  actualParticipants: z.number().int().min(0).nullable().optional(),
  leadsGenerated: z.number().int().min(0).nullable().optional(),
  conversions: z.number().int().min(0).nullable().optional(),
  plannedRevenue: z.number().min(0).nullable().optional(),
  actualRevenue: z.number().min(0).nullable().optional(),
  approvedBudget: z.number().min(0).nullable().optional(),
  actualCost: z.number().min(0).nullable().optional(),
  reachImpressions: z.number().int().min(0).nullable().optional(),
  engagements: z.number().int().min(0).nullable().optional(),
  satisfactionScore: z.number().min(0).max(100).nullable().optional(),
  kpiTarget: z.string().max(500).nullable().optional(),
  kpiActual: z.string().max(500).nullable().optional(),
  evidenceLink: z.string().max(500).nullable().optional(),
  remarks: z.string().max(2000).nullable().optional(),
});

router.get(
  '/kpi/summary',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getKpiSummary({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(result);
  })
);

router.get(
  '/kpi/officers',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getOfficerRanking({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      regionId: req.query.regionId as string | undefined,
      category: req.query.category as string | undefined,
      search: req.query.search as string | undefined,
      sort: req.query.sort as string | undefined,
    });
    res.json({ items: result });
  })
);

router.get(
  '/kpi/officers/:userId',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getOfficerDetail(Number(req.params.userId), {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    if (!result) return res.status(404).json({ message: 'Officer not found' });
    res.json(result);
  })
);

router.get(
  '/kpi/trends',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getKpiTrends({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json({ items: result });
  })
);

// ---------------------------------------------------------------------------
// Planning & Plans
// ---------------------------------------------------------------------------
router.get(
  '/plans',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listPlans({
      frequency: req.query.frequency as string | undefined,
      status: req.query.status as string | undefined,
      parentId: req.query.parentId as string | undefined,
      responsibleUserId: req.query.responsibleUserId as string | undefined,
      regionId: req.query.regionId as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/plans/:id',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getPlanDetail(Number(req.params.id));
    if (!result) return res.status(404).json({ message: 'Plan not found' });
    res.json(result);
  })
);

router.post(
  '/plans',
  can('admin.users'),
  validate(planSchema),
  asyncHandler(async (req, res) => {
    const result = await createPlan({
      ...req.body,
      createdBy: req.user!.userId,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'Plan', entityId: result.planId });
    res.json(result);
  })
);

router.put(
  '/plans/:id',
  can('admin.users'),
  validate(planSchema.partial()),
  asyncHandler(async (req, res) => {
    await updatePlan(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'Plan', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

router.delete(
  '/plans/:id',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    await deletePlan(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'Plan', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Plan Activities
// ---------------------------------------------------------------------------
router.get(
  '/plans/:planId/activities',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listActivities(Number(req.params.planId), {
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      responsibleUserId: req.query.responsibleUserId as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.post(
  '/plans/:planId/activities',
  can('admin.users'),
  validate(activitySchema),
  asyncHandler(async (req, res) => {
    const result = await createActivity(Number(req.params.planId), {
      ...req.body,
      createdBy: req.user!.userId,
    });
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'PlanActivity', entityId: result.activityId });
    res.json(result);
  })
);

router.put(
  '/activities/:id',
  can('admin.users'),
  validate(activitySchema.partial()),
  asyncHandler(async (req, res) => {
    await updateActivity(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'PlanActivity', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

router.delete(
  '/activities/:id',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    await deleteActivity(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'PlanActivity', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// KPI Definitions
// ---------------------------------------------------------------------------
router.get(
  '/kpi/definitions',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listKpiDefs({
      category: req.query.category as string | undefined,
      frequency: req.query.frequency as string | undefined,
      isActive: req.query.isActive as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/kpi/definitions/:id',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getKpiDef(Number(req.params.id));
    if (!result) return res.status(404).json({ message: 'KPI definition not found' });
    res.json(result);
  })
);

router.post(
  '/kpi/definitions',
  can('admin.users'),
  validate(kpiDefSchema),
  asyncHandler(async (req, res) => {
    const result = await createKpiDef(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'CREATE', entity: 'KpiDefinition', entityId: result.kpiDefId });
    res.json(result);
  })
);

router.put(
  '/kpi/definitions/:id',
  can('admin.users'),
  validate(kpiDefSchema.partial()),
  asyncHandler(async (req, res) => {
    await updateKpiDef(Number(req.params.id), req.body);
    await logAudit(req,{ userId: req.user!.userId, action: 'UPDATE', entity: 'KpiDefinition', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

router.delete(
  '/kpi/definitions/:id',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    await deleteKpiDef(Number(req.params.id));
    await logAudit(req,{ userId: req.user!.userId, action: 'DELETE', entity: 'KpiDefinition', entityId: Number(req.params.id) });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// KPI Results & Ranking
// ---------------------------------------------------------------------------
router.get(
  '/kpi/results',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listKpiResults({
      kpiDefId: req.query.kpiDefId as string | undefined,
      userId: req.query.userId as string | undefined,
      frequency: req.query.frequency as string | undefined,
      regionId: req.query.regionId as string | undefined,
      periodFrom: req.query.periodFrom as string | undefined,
      periodTo: req.query.periodTo as string | undefined,
      recordType: req.query.recordType as string | undefined,
      verificationStatus: req.query.verificationStatus as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.post(
  '/kpi/results',
  can('admin.users'),
  validate(kpiResultSchema),
  asyncHandler(async (req, res) => {
    const result = await upsertKpiResult(req.body);
    await logAudit(req,{ userId: req.user!.userId, action: result.action === 'created' ? 'CREATE' : 'UPDATE', entity: 'KpiResult', entityId: result.kpiResultId });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Monthly Measurement Entry (workbook workflow)
// ---------------------------------------------------------------------------
router.get(
  '/kpi/measurement',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listMeasurement({
      year: req.query.year as string | undefined,
      month: req.query.month as string | undefined,
      category: req.query.category as string | undefined,
      businessUnitId: req.query.businessUnitId as string | undefined,
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    });
    res.json(result);
  })
);

router.post(
  '/kpi/measurement',
  can('admin.users'),
  validate(measurementSchema),
  asyncHandler(async (req, res) => {
    const result = await upsertMeasurement(req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: result.action === 'created' ? 'CREATE' : 'UPDATE',
      entity: 'KpiMeasurement',
      entityId: result.kpiResultId,
      detail: { kpiDefId: req.body.kpiDefId, periodStart: req.body.periodStart },
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Verification workflow
// ---------------------------------------------------------------------------
router.get(
  '/kpi/verification',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getVerificationQueue({
      status: req.query.status as string | undefined,
      category: req.query.category as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.post(
  '/kpi/verify',
  can('admin.users'),
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const result = await verifyMeasurements({
      ...req.body,
      reviewerUserId: req.user!.userId,
    });
    await logAudit(req, {
      userId: req.user!.userId,
      action: `VERIFY_${req.body.decision.toUpperCase()}`,
      entity: 'KpiMeasurement',
      detail: { count: req.body.ids.length, decision: req.body.decision },
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Workbook import & evidence upload
// ---------------------------------------------------------------------------
router.post(
  '/kpi/import',
  can('admin.users'),
  (req, res, next) => {
    kpiImportUpload.single('file')(req, res, (err: unknown) => {
      if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: (err as Error).message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const year = req.body.year ? Number(req.body.year) : undefined;
    const stats = await importKpiWorkbook(req.file.buffer, year);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'IMPORT',
      entity: 'KpiWorkbook',
      detail: {
        definitionsCreated: stats.definitionsCreated,
        definitionsUpdated: stats.definitionsUpdated,
        measurementsUpserted: stats.measurementsUpserted,
        measurementsSkipped: stats.measurementsSkipped,
      },
    });
    res.json(stats);
  })
);

router.post(
  '/kpi/evidence',
  can('admin.users'),
  (req, res, next) => {
    kpiEvidenceUpload.single('file')(req, res, (err: unknown) => {
      if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: (err as Error).message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    res.json({ url: `/uploads/kpi-evidence/${req.file.filename}`, name: req.file.originalname });
  })
);

router.get(
  '/kpi/ranking',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getKpiRanking({
      frequency: req.query.frequency as string | undefined,
      regionId: req.query.regionId as string | undefined,
      periodFrom: req.query.periodFrom as string | undefined,
      periodTo: req.query.periodTo as string | undefined,
      search: req.query.search as string | undefined,
      sort: req.query.sort as string | undefined,
    });
    res.json({ items: result });
  })
);

router.get(
  '/kpi/planned-vs-achieved',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getPlannedVsAchieved({
      frequency: req.query.frequency as string | undefined,
      regionId: req.query.regionId as string | undefined,
      userId: req.query.userId as string | undefined,
      periodFrom: req.query.periodFrom as string | undefined,
      periodTo: req.query.periodTo as string | undefined,
    });
    res.json({ items: result });
  })
);

// ---------------------------------------------------------------------------
// Planning Dashboard Summary
// ---------------------------------------------------------------------------
router.get(
  '/planning/summary',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getPlanningSummary({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// Corporate Marketing Activities Plan (workbook: KG Corporate Marketing_Plan_and_Activities.xlsx)
// ---------------------------------------------------------------------------
const corpImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Only .xlsx workbooks are supported'));
  },
});

router.get(
  '/corp-marketing/tasks',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listCorpTasks({
      year: req.query.year as string | undefined,
      month: req.query.month as string | undefined,
      role: req.query.role as string | undefined,
      status: req.query.status as string | undefined,
      parentCode: req.query.parentCode as string | undefined,
      search: req.query.search as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/corp-marketing/roles',
  can('admin.users'),
  asyncHandler(async (_req, res) => {
    res.json({ items: await getCorpRoles() });
  })
);

router.get(
  '/corp-marketing/summary',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await getCorpTaskSummary({
      year: req.query.year as string | undefined,
      month: req.query.month as string | undefined,
    });
    res.json(result);
  })
);

router.put(
  '/corp-marketing/tasks/:id',
  can('admin.users'),
  validate(corpTaskUpdateSchema),
  asyncHandler(async (req, res) => {
    const result = await updateCorpTask(Number(req.params.id), req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'CorpMarketingTask',
      entityId: Number(req.params.id),
      detail: req.body,
    });
    res.json(result);
  })
);

router.post(
  '/corp-marketing/verify',
  can('admin.users'),
  validate(verifySchema),
  asyncHandler(async (req, res) => {
    const result = await verifyCorpTasks({
      ...req.body,
      reviewerUserId: req.user!.userId,
    });
    await logAudit(req, {
      userId: req.user!.userId,
      action: `VERIFY_${req.body.decision.toUpperCase()}`,
      entity: 'CorpMarketingTask',
      detail: { count: req.body.ids.length, decision: req.body.decision },
    });
    res.json(result);
  })
);

router.get(
  '/corp-marketing/events',
  can('admin.users'),
  asyncHandler(async (req, res) => {
    const result = await listCorpEvents({
      status: req.query.status as string | undefined,
      search: req.query.search as string | undefined,
    });
    res.json(result);
  })
);

router.put(
  '/corp-marketing/events/:id',
  can('admin.users'),
  validate(corpEventUpdateSchema),
  asyncHandler(async (req, res) => {
    const result = await updateCorpEvent(Number(req.params.id), req.body);
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'UPDATE',
      entity: 'CorpMarketingEvent',
      entityId: Number(req.params.id),
      detail: { eventCode: result.EventCode, ...req.body },
    });
    res.json(result);
  })
);

router.post(
  '/corp-marketing/import',
  can('admin.users'),
  (req, res, next) => {
    corpImportUpload.single('file')(req, res, (err: unknown) => {
      if (err) return res.status(400).json({ error: 'UPLOAD_ERROR', message: (err as Error).message });
      next();
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const stats = await importCorpMarketingWorkbook(req.file.buffer, {
      year: req.body.year ? Number(req.body.year) : undefined,
    });
    await logAudit(req, {
      userId: req.user!.userId,
      action: 'IMPORT',
      entity: 'CorpMarketingPlan',
      detail: { ...stats },
    });
    res.json(stats);
  })
);

export { router as adminRouter };