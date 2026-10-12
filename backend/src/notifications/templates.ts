// =============================================================================
// Email templates — KG-MIS branded HTML templates for all notification
// events. Uses the official logo, brand color palette, Nyala font, and
// responsive layout with animated accents.
// =============================================================================
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Brand palette (extracted from MIS-Logo1.png)
// ---------------------------------------------------------------------------

const C = {
  /** Primary blue — KG-MIS text, globe, header, buttons */
  blue:       '#003366',
  /** Green — chart icon, "INTELLIGENCE", success */
  green:      '#006B3F',
  /** Bronze — search icon, "MARKETING", warnings */
  bronze:     '#8B5E3C',
  /** Accent blue — links, secondary elements */
  accentBlue: '#1A5276',
  /** Light background for cards */
  lightBg:    '#F0F4F8',
  /** Border color */
  border:     '#D5DDE5',
  /** Dark text */
  textDark:   '#1A2332',
  /** Body text */
  textMid:    '#4A5568',
  /** Muted text */
  textLight:  '#718096',
  /** Error red (complementary for failures) */
  red:        '#C0392B',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderedEmail {
  html: string;
  text: string;
}

interface TemplateData {
  title: string;
  preheader: string;
  detailsUrl: string;
  detailsUrlLabel: string;
  badgeColor: string;
  badgeLabel: string;
  rows: Array<{ label: string; value: string }>;
}

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

function buildDetailsUrl(event: string, payload: Record<string, unknown>): string {
  const base = env.appBaseUrl;
  switch (event) {
    case 'NewReport':
      return `${base}/visits?detail=${payload.reportId}`;
    case 'ReportApproved':
      return `${base}/visits?detail=${payload.reportId}`;
    case 'ReportRejected':
      return `${base}/visits?detail=${payload.reportId}`;
    case 'NewInterview':
      return `${base}/interviews?detail=${payload.interviewId}`;
    case 'InterviewApproved':
      return `${base}/interviews?detail=${payload.interviewId}`;
    case 'InterviewRejected':
      return `${base}/interviews?detail=${payload.interviewId}`;
    case 'PriceGapAlert':
      return `${base}/pricing`;
    case 'SyncFailure':
      return `${base}/dashboard`;
    case 'FORM_PUBLISHED':
    case 'OWNERSHIP_TRANSFERRED':
    case 'SUBMISSION_CONFIRMED':
    case 'NEW_RESPONSE_RECEIVED':
    case 'RESPONSE_LIMIT_WARNING':
    case 'RESPONSE_EDITED':
      return `${base}/forms/${payload.templateId}`;
    case 'PARENT_FORM_UPDATED':
      return `${base}/forms/${payload.childFormId}`;
    case 'FORM_ASSIGNED':
    case 'FORM_INVITE':
      return `${base}/forms/${payload.templateId}/respond`;
    case 'NEW_PLAN_CREATED':
      return `${base}/admin/kpi`;
    case 'TENDER_DEADLINE_REMINDER':
      return `${base}/tenders/${payload.tenderOpportunityId}`;
    case 'TENDER_NEW_MATCH':
      return `${base}/tenders`;
    default:
      return `${base}/dashboard`;
  }
}

// ---------------------------------------------------------------------------
// Per-event data extractors
// ---------------------------------------------------------------------------

function templateDataFor(event: string, payload: Record<string, unknown>, recipientName: string): TemplateData {
  const url = buildDetailsUrl(event, payload);

  switch (event) {
    case 'NewReport':
      return {
        title: 'New Market Visit Report',
        preheader: `A new market visit report was submitted for ${payload.outlet ?? 'an outlet'}.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Report',
        badgeColor: C.green,
        badgeLabel: 'New Report',
        rows: [
          { label: 'Outlet', value: String(payload.outlet ?? '—') },
          { label: 'Status', value: String(payload.status ?? 'Submitted') },
          { label: 'Report ID', value: String(payload.reportId ?? '—') },
        ],
      };

    case 'ReportApproved':
      return {
        title: 'Visit Report Approved',
        preheader: `Your market visit report for ${payload.outlet ?? 'an outlet'} has been approved.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Report',
        badgeColor: C.green,
        badgeLabel: 'Approved',
        rows: [
          { label: 'Outlet', value: String(payload.outlet ?? '—') },
          { label: 'Status', value: 'Approved' },
          { label: 'Report ID', value: String(payload.reportId ?? '—') },
        ],
      };

    case 'ReportRejected':
      return {
        title: 'Visit Report Rejected',
        preheader: `Your market visit report for ${payload.outlet ?? 'an outlet'} has been rejected.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Report',
        badgeColor: C.red,
        badgeLabel: 'Rejected',
        rows: [
          { label: 'Outlet', value: String(payload.outlet ?? '—') },
          { label: 'Status', value: 'Rejected' },
          { label: 'Reason', value: String(payload.reason ?? '—') },
          { label: 'Report ID', value: String(payload.reportId ?? '—') },
        ],
      };

    case 'SyncFailure':
      return {
        title: 'D365FO Sync Failure',
        preheader: 'One or more D365FO sync jobs completed with errors.',
        detailsUrl: url,
        detailsUrlLabel: 'View Dashboard',
        badgeColor: C.red,
        badgeLabel: 'Failure',
        rows: (() => {
          const entities = payload.entities as Array<{ entity: string; errorCount: number; recordsProcessed: number }> | undefined;
          if (entities && entities.length > 0) {
            return entities.map((e) => ({
              label: e.entity,
              value: `${e.recordsProcessed} processed, ${e.errorCount} errors`,
            }));
          }
          return [{ label: 'Details', value: 'One or more sync jobs failed. Check the sync log for details.' }];
        })(),
      };

    case 'PriceGapAlert':
      return {
        title: 'Price Gap Alert',
        preheader: `A competitor price gap of ${payload.gapPercent ?? '—'}% was recorded.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Pricing',
        badgeColor: C.bronze,
        badgeLabel: 'Alert',
        rows: [
          { label: 'Product ID', value: String(payload.productId ?? '—') },
          { label: 'Competitor', value: String(payload.competitorName ?? '—') },
          { label: 'Gap', value: `${Number(payload.gapPercent ?? 0).toFixed(2)}%` },
        ],
      };

    case 'NewInterview':
      return {
        title: 'New Customer Interview',
        preheader: `A new interview with ${payload.respondent ?? 'a customer'} was submitted.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Interview',
        badgeColor: C.blue,
        badgeLabel: 'New Interview',
        rows: [
          { label: 'Respondent', value: String(payload.respondent ?? '—') },
          { label: 'Status', value: String(payload.status ?? 'Submitted') },
          { label: 'Interview ID', value: String(payload.interviewId ?? '—') },
        ],
      };

    case 'InterviewApproved':
      return {
        title: 'Interview Approved',
        preheader: `Your interview with ${payload.respondent ?? 'a customer'} has been approved.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Interview',
        badgeColor: C.green,
        badgeLabel: 'Approved',
        rows: [
          { label: 'Respondent', value: String(payload.respondent ?? '—') },
          { label: 'Status', value: 'Approved' },
          { label: 'Interview ID', value: String(payload.interviewId ?? '—') },
        ],
      };

    case 'InterviewRejected':
      return {
        title: 'Interview Rejected',
        preheader: `Your interview with ${payload.respondent ?? 'a customer'} has been rejected.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Interview',
        badgeColor: C.red,
        badgeLabel: 'Rejected',
        rows: [
          { label: 'Respondent', value: String(payload.respondent ?? '—') },
          { label: 'Status', value: 'Rejected' },
          { label: 'Reason', value: String(payload.reason ?? '—') },
          { label: 'Interview ID', value: String(payload.interviewId ?? '—') },
        ],
      };

    case 'FORM_PUBLISHED':
      return {
        title: 'Form Published',
        preheader: 'A form was published and is now open for responses.',
        detailsUrl: url,
        detailsUrlLabel: 'View Form',
        badgeColor: C.green,
        badgeLabel: 'Published',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
        ],
      };

    case 'FORM_INVITE':
      return {
        title: 'You\'re Invited to Respond',
        preheader: `You've been invited to fill out "${payload.formTitle ?? 'a form'}".`,
        detailsUrl: url,
        detailsUrlLabel: 'Open Form',
        badgeColor: C.green,
        badgeLabel: 'Invitation',
        rows: [
          { label: 'Form', value: String(payload.formTitle ?? '—') },
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
        ],
      };

    case 'OWNERSHIP_TRANSFERRED':
      return {
        title: 'Form Ownership Transferred',
        preheader: `A form has been transferred to you, ${recipientName}.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Form',
        badgeColor: C.blue,
        badgeLabel: 'Transferred',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
        ],
      };

    case 'PARENT_FORM_UPDATED':
      return {
        title: 'Parent Form Updated',
        preheader: 'A parent form was updated. Your child form has been updated to match.',
        detailsUrl: url,
        detailsUrlLabel: 'View Child Form',
        badgeColor: C.bronze,
        badgeLabel: 'Updated',
        rows: [
          { label: 'Parent Form ID', value: String(payload.parentFormId ?? '—') },
          { label: 'Child Form ID', value: String(payload.childFormId ?? '—') },
        ],
      };

    case 'SUBMISSION_CONFIRMED':
      return {
        title: 'Response Submitted',
        preheader: 'Your form response was submitted successfully.',
        detailsUrl: url,
        detailsUrlLabel: 'View Form',
        badgeColor: C.green,
        badgeLabel: 'Confirmed',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
          { label: 'Response ID', value: String(payload.responseId ?? '—') },
        ],
      };

    case 'NEW_RESPONSE_RECEIVED':
      return {
        title: 'New Response Received',
        preheader: 'A new response was submitted to a form.',
        detailsUrl: url,
        detailsUrlLabel: 'View Responses',
        badgeColor: C.blue,
        badgeLabel: 'New Response',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
          { label: 'Response ID', value: String(payload.responseId ?? '—') },
        ],
      };

    case 'RESPONSE_LIMIT_WARNING':
      return {
        title: 'Response Limit Warning',
        preheader: `A form has reached 80% of its maximum response limit.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Form',
        badgeColor: C.red,
        badgeLabel: 'Warning',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
          { label: 'Current Count', value: String(payload.count ?? '—') },
          { label: 'Maximum', value: String(payload.max ?? '—') },
        ],
      };

    case 'FORM_ASSIGNED':
      return {
        title: 'Follow-up Form Assigned',
        preheader: 'A follow-up form has been assigned to you.',
        detailsUrl: url,
        detailsUrlLabel: 'Respond Now',
        badgeColor: C.blue,
        badgeLabel: 'Action Required',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
          { label: 'Linked Form ID', value: String(payload.linkedFormTemplateId ?? '—') },
        ],
      };

    case 'RESPONSE_EDITED':
      return {
        title: 'Response Edited',
        preheader: 'A submitted form response was edited.',
        detailsUrl: url,
        detailsUrlLabel: 'View Responses',
        badgeColor: C.bronze,
        badgeLabel: 'Edited',
        rows: [
          { label: 'Form ID', value: String(payload.templateId ?? '—') },
          { label: 'Response ID', value: String(payload.responseId ?? '—') },
          { label: 'Revision ID', value: String(payload.revisionId ?? '—') },
        ],
      };

    case 'NEW_PLAN_CREATED':
      return {
        title: 'New Plan Created',
        preheader: `A new ${payload.planType ?? 'plan'} has been created for ${payload.year ?? 'next period'}.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Plan',
        badgeColor: C.blue,
        badgeLabel: 'New Plan',
        rows: [
          { label: 'Plan Name', value: String(payload.planName ?? '—') },
          { label: 'Type', value: String(payload.planType ?? '—') },
          { label: 'Period', value: String(payload.startDate && payload.endDate ? `${payload.startDate} to ${payload.endDate}` : payload.year ?? '—') },
          { label: 'Assigned Officer', value: String(payload.assignedTo ?? '—') },
        ],
      };

    case 'TENDER_DEADLINE_REMINDER':
      return {
        title: 'Tender Deadline Approaching',
        preheader: `The tender "${payload.title ?? 'a saved opportunity'}" has a deadline in ${payload.daysUntil ?? 'a few'} day(s).`,
        detailsUrl: url,
        detailsUrlLabel: 'View Opportunity',
        badgeColor: C.bronze,
        badgeLabel: 'Deadline',
        rows: [
          { label: 'Title', value: String(payload.title ?? '—') },
          { label: 'Days Until Deadline', value: String(payload.daysUntil ?? '—') },
          { label: 'Deadline Date', value: payload.deadlineDate ? new Date(String(payload.deadlineDate)).toUTCString() : '—' },
          { label: 'Your Status', value: String(payload.savedStatus ?? '—') },
        ],
      };

    case 'TENDER_NEW_MATCH':
      return {
        title: 'New High-Relevance Tender Match',
        preheader: `Source "${payload.sourceName ?? 'a source'}" collected ${payload.newCount ?? 0} new opportunities with ${Array.isArray(payload.highRelevanceIds) ? payload.highRelevanceIds.length : 0} high-relevance matches.`,
        detailsUrl: url,
        detailsUrlLabel: 'View Tenders',
        badgeColor: C.green,
        badgeLabel: 'New Match',
        rows: [
          { label: 'Source', value: String(payload.sourceName ?? '—') },
          { label: 'New Opportunities', value: String(payload.newCount ?? '—') },
          { label: 'High Relevance', value: String(Array.isArray(payload.highRelevanceIds) ? payload.highRelevanceIds.length : '—') },
          { label: 'Threshold', value: `≥ ${payload.threshold ?? '—'}` },
        ],
      };

    default:
      return {
        title: 'KG-MIS Notification',
        preheader: 'You have a new notification from KG-MIS.',
        detailsUrl: url,
        detailsUrlLabel: 'View Details',
        badgeColor: C.accentBlue,
        badgeLabel: 'Notification',
        rows: [],
      };
  }
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Base HTML layout — KG-MIS branded, responsive, animated
// ---------------------------------------------------------------------------

function baseLayout(contentHtml: string, preheader: string): string {
  const logoUrl = 'https://drive.google.com/uc?export=view&id=1803_w6VX_ZSemESU3Emp8BxMIg5hhSIm';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>KG-MIS Notification</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    /* Nyala font with fallbacks */
    @font-face {
      font-family: 'Nyala';
      src: local('Nyala'), local('Nyala Regular');
      font-weight: normal;
      font-style: normal;
    }

    /* Animated shimmer accent bar */
    @keyframes misShimmer {
      0%   { background-position: -200% center; }
      100% { background-position: 200% center; }
    }

    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

    /* Responsive */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .center-on-narrow { text-align: center !important; display: block !important; margin-left: auto !important; margin-right: auto !important; float: none !important; }
      .pad-mobile { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#E8ECF1;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;color:#E8ECF1;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>

  <!-- Full-width wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#E8ECF1;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,51,102,0.08);">

          <!-- ====== HEADER ====== -->
          <tr>
            <td style="background-color:${C.blue};padding:28px 32px;text-align:center;">
              <!--[if mso]>
              <table role="presentation" width="180" cellpadding="0" cellspacing="0"><tr><td>
              <![endif]-->
              <img src="${logoUrl}" width="180" alt="KG-MIS" style="display:block;margin:0 auto 8px;width:180px;max-width:100%;height:auto;" />
              <!--[if mso]>
              </td></tr></table>
              <![endif]-->
            </td>
          </tr>

          <!-- ====== ANIMATED ACCENT BAR ====== -->
          <tr>
            <td style="padding:0;">
              <!--[if !mso]><!-->
              <div style="height:4px;background:linear-gradient(90deg,${C.blue},${C.green},${C.bronze},${C.blue});background-size:200% 100%;animation:misShimmer 4s linear infinite;"></div>
              <!--<![endif]-->
              <!--[if mso]>
              <table role="presentation" width="100%" height="4" cellpadding="0" cellspacing="0"><tr>
                <td width="34%" style="background-color:${C.blue};font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" style="background-color:${C.green};font-size:0;line-height:0;">&nbsp;</td>
                <td width="33%" style="background-color:${C.bronze};font-size:0;line-height:0;">&nbsp;</td>
              </tr></table>
              <![endif]-->
            </td>
          </tr>

          <!-- ====== CONTENT ====== -->
          <tr>
            <td class="pad-mobile" style="padding:36px 32px 32px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- ====== FOOTER ====== -->
          <tr>
            <td style="background-color:${C.blue};padding:28px 32px;text-align:center;">
              <p style="margin:0 0 6px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:15px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">KG-MIS</p>
              <p style="margin:0 0 12px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:12px;color:rgba(255,255,255,0.7);letter-spacing:1.5px;text-transform:uppercase;">Marketing Intelligence System</p>
              <table role="presentation" width="80" cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                <tr>
                  <td style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:13px;font-style:italic;color:#ffffff;letter-spacing:0.2px;">&ldquo;Innovation and Integrity at Every Step&rdquo;</p>
              <p style="margin:0 0 12px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:11px;color:rgba(255,255,255,0.5);letter-spacing:2px;">INSIGHT &bull; ANALYZE &bull; GROW</p>
              <p style="margin:0;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:10px;color:rgba(255,255,255,0.4);">This is an automated notification. Do not reply to this email.</p>
            </td>
          </tr>

        </table>
        <!-- / Email container -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function renderNotification(
  event: string,
  payload: Record<string, unknown>,
  recipientName: string,
): RenderedEmail {
  const data = templateDataFor(event, payload, recipientName);

  // --- Build detail rows ---
  const detailRowsHtml = data.rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;width:150px;vertical-align:top;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:13px;color:${C.textLight};border-bottom:1px solid ${C.border};">${escapeHtml(r.label)}</td>
        <td style="padding:10px 0;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:13px;color:${C.textDark};font-weight:600;border-bottom:1px solid ${C.border};">${escapeHtml(r.value)}</td>
      </tr>`,
    )
    .join('');

  const detailRowsText = data.rows.map((r) => `  ${r.label}: ${r.value}`).join('\n');

  // --- Assemble HTML content ---
  const contentHtml = `
    <!-- Badge -->
    <div style="margin-bottom:20px;">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background-color:${data.badgeColor};border-radius:20px;padding:6px 16px;">
            <span style="font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:11px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(data.badgeLabel)}</span>
          </td>
        </tr>
      </table>
    </div>

    <!-- Title -->
    <h1 style="margin:0 0 8px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:22px;font-weight:700;color:${C.blue};line-height:1.3;">${escapeHtml(data.title)}</h1>

    <!-- Greeting -->
    <p style="margin:0 0 20px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:14px;color:${C.textMid};">Hello ${escapeHtml(recipientName)},</p>

    <!-- Description -->
    <p style="margin:0 0 28px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:14px;color:${C.textDark};line-height:1.7;">${escapeHtml(data.preheader)}</p>

    ${data.rows.length > 0 ? `
    <!-- Detail card -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border-radius:8px;border:1px solid ${C.border};overflow:hidden;">
      <tr>
        <td style="background-color:${C.lightBg};padding:4px 0 0 0;border-left:4px solid ${C.blue};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:12px 16px 4px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:11px;font-weight:700;color:${C.blue};text-transform:uppercase;letter-spacing:1px;">Details</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:0 16px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${detailRowsHtml}
          </table>
        </td>
      </tr>
    </table>` : ''}

    <!-- CTA Button -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="border-radius:8px;background-color:${C.blue};box-shadow:0 2px 8px rgba(0,51,102,0.25);">
          <a href="${escapeHtml(data.detailsUrl)}" target="_blank" style="display:inline-block;padding:14px 36px;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.3px;">${escapeHtml(data.detailsUrlLabel)} &rarr;</a>
        </td>
      </tr>
    </table>

    <!-- Fallback link -->
    <p style="margin:0;font-family:'Nyala','Segoe UI',Tahoma,Geneva,Verdana,sans-serif;font-size:12px;color:${C.textLight};line-height:1.6;">If the button doesn&rsquo;t work, copy and paste this link into your browser:<br><a href="${escapeHtml(data.detailsUrl)}" style="color:${C.accentBlue};word-break:break-all;text-decoration:underline;">${escapeHtml(data.detailsUrl)}</a></p>
  `;

  // --- Assemble plain text ---
  const text = `KG-MIS -- Kerchanshe Group Marketing Intelligence System
${'='.repeat(48)}

${data.title.toUpperCase()}
${'-'.repeat(data.title.length)}

Hello ${recipientName},

${data.preheader}

${detailRowsText}

${data.detailsUrlLabel}: ${data.detailsUrl}

---
"Innovation and Integrity at Every Step"
KG-MIS -- Kerchanshe Group Marketing Intelligence System
Insight . Analyze . Grow

This is an automated notification.`;

  return {
    html: baseLayout(contentHtml, data.preheader),
    text,
  };
}
