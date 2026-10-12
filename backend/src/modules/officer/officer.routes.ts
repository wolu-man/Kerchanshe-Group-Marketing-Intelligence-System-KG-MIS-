import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { can } from '../../middleware/permission';
import { asyncHandler } from '../../utils/http';
import { getOfficerDetail } from '../admin/kpi.service';
import {
  getOfficerSummary,
  getOfficerTrends,
  getOfficerResults,
  getOfficerPlans,
  getOfficerActivityLog,
} from './officer.service';

const router = Router();
router.use(requireAuth);

// GET /officer/performance/me — own profile + score breakdown + recent activity + trend
router.get(
  '/me',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await getOfficerDetail(req.user!.userId, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    if (!result) return res.status(404).json({ message: 'Officer not found' });
    res.json(result);
  })
);

// GET /officer/performance/summary — own activity counts and completion
router.get(
  '/summary',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await getOfficerSummary(req.user!.userId, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(result);
  })
);

// GET /officer/performance/trends — own monthly activity trends
router.get(
  '/trends',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await getOfficerTrends(req.user!.userId, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
    });
    res.json(result);
  })
);

// GET /officer/performance/results — own KPI results
router.get(
  '/results',
  can('reports.view'),
  asyncHandler(async (_req, res) => {
    const result = await getOfficerResults(_req.user!.userId);
    res.json({ items: result });
  })
);

// GET /officer/performance/plans — plans assigned to the officer
router.get(
  '/plans',
  can('reports.view'),
  asyncHandler(async (_req, res) => {
    const result = await getOfficerPlans(_req.user!.userId);
    res.json({ items: result });
  })
);

// GET /officer/performance/activity — recent activity log
router.get(
  '/activity',
  can('reports.view'),
  asyncHandler(async (req, res) => {
    const result = await getOfficerActivityLog(req.user!.userId, {
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json({ items: result });
  })
);

export { router as officerPerformanceRouter };
