import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/http';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { listReportsForRole, requestEmbedToken } from '../../integrations/powerbi';
import { NotFoundError } from '../../utils/errors';

const router = Router();

/** List available dashboards/reports for the current user's role. */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const reports = await listReportsForRole(req.user!.role);
    res.json(reports);
  }),
);

/** Get a scoped Power BI embed token for the current user. */
router.get(
  '/embed-token',
  requireAuth,
  validate({
    query: z.object({ reportId: z.string().min(1) }),
  }),
  asyncHandler(async (req, res) => {
    const reportId = String(req.query.reportId);
    const available = await listReportsForRole(req.user!.role);
    const report = available.find((r) => r.reportId === reportId);
    if (!report) throw new NotFoundError('Report not available for your role');
    const embed = await requestEmbedToken(reportId);
    res.json({ reportId, embedUrl: report.embedUrl, token: embed.token, expiry: embed.expiry });
  }),
);

export default router;
