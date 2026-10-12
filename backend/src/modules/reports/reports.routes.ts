import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { asyncHandler } from '../../utils/http';
import { BadRequestError } from '../../utils/errors';
import {
  aiInsights,
  exportExcel,
  formAnswers,
  interviewsOverview,
  marketVisits,
  priceComparison,
  productAvailability,
  salesOverview,
  weeklySalesOverview,
  customersOverview,
  productsOverview,
  competitorIntelReport,
  kpiPerformance,
} from './reports.service';
import { getReportsForRole, getEmbedToken, isReportIdKnown } from '../../integrations/powerbi';

const router = Router();
router.use(requireAuth);

router.get(
  '/sales',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    console.log('[DEBUG] /sales request:', { 
      dataScope: req.scope!.dataScope, 
      userId: req.user!.userId, 
      regionId: req.query.regionId 
    });
    const result = await salesOverview({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
    });
    res.json(result);
  })
);

router.get(
  '/price-comparison',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await priceComparison({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
      category: req.query.category as string | undefined,
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/market-visits',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await marketVisits({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(result);
  })
);

router.get(
  '/forms/answers',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await formAnswers({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      formId: req.query.formId ? Number(req.query.formId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/availability',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await productAvailability({
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/interviews',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await interviewsOverview({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/weekly-sales',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await weeklySalesOverview({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
      businessGroupId: req.query.businessGroupId ? Number(req.query.businessGroupId) : undefined,
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/customers',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await customersOverview({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
      businessGroupId: req.query.businessGroupId ? Number(req.query.businessGroupId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/products',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await productsOverview({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      businessGroupId: req.query.businessGroupId ? Number(req.query.businessGroupId) : undefined,
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/competitor-intel',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await competitorIntelReport({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
      competitorId: req.query.competitorId ? Number(req.query.competitorId) : undefined,
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/kpi-performance',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await kpiPerformance({
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
      frequency: req.query.frequency as string | undefined,
      regionId: req.query.regionId ? Number(req.query.regionId) : undefined,
    });
    res.json(result);
  })
);

router.get(
  '/export/:kind',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const { filename, buffer } = await exportExcel(req.params.kind);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  })
);

// Rule-based statistical summary (no ML).
router.get(
  '/ai-insights',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await aiInsights({
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      colorId: req.query.colorId ? Number(req.query.colorId) : undefined,
      dataScope: req.scope!.dataScope,
      userId: req.user!.userId,
    });
    res.json(result);
  })
);

// --- Power BI integration (Integration Design 6) ----------------------------
router.get(
  '/powerbi/views',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const reports = await getReportsForRole(req.user!.role);
    res.json({ items: reports });
  })
);

router.get(
  '/powerbi/embed/:reportId',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    if (!isReportIdKnown(req.params.reportId)) {
      throw new BadRequestError('Unknown report', 'UNKNOWN_REPORT');
    }
    const token = await getEmbedToken(req.params.reportId, req.user!.role);
    res.json(token);
  })
);

export { router as reportsRouter };
