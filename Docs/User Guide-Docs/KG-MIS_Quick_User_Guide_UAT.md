# KG-MIS Quick User Guide

**Kerchanshe Group Marketing Intelligence System**

> *Transforming market data into actionable intelligence.*

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Logging In](#2-logging-in)
3. [Dashboard](#3-dashboard)
4. [Market Visits](#4-market-visits)
5. [Interviews](#5-interviews)
6. [Photos & Videos](#6-photos--videos)
7. [Forms & Surveys](#7-forms--surveys)
8. [Competitor Pricing](#8-competitor-pricing)
9. [Weekly Sales](#9-weekly-sales)
10. [Reports & Analytics](#10-reports--analytics)
11. [Notifications](#11-notifications)
12. [Admin Centre](#12-admin-centre)
13. [Roles & Permissions](#13-roles--permissions)
14. [Tips & Troubleshooting](#14-tips--troubleshooting)

---

## 1. System Overview

KG-MIS is an enterprise marketing intelligence platform that helps Kerchanshe Group collect, monitor, analyze, and visualize market and field data for better business decisions.

**What you can do with KG-MIS:**

| Area | Purpose |
|---|---|
| **Dashboard** | See a real-time snapshot of sales, visits, interviews, and alerts |
| **Market Visits** | Log and track visits to retail outlets in the field |
| **Interviews** | Record structured feedback from customers and distributors |
| **Photos & Videos** | Upload and manage field evidence (photos, videos, audio) |
| **Forms & Surveys** | Build custom forms and collect responses from the field |
| **Competitor Pricing** | Track competitor prices and receive gap alerts |
| **Weekly Sales** | Record point-of-sale quantity and revenue data |
| **Reports** | View AI-powered insights, charts, and export data to CSV |
| **Notifications** | Stay informed about system events via email alerts |

---

## 2. Logging In

1. Open your browser and navigate to the **KG-MIS** URL provided by your administrator.
2. Enter your **Username** and **Password**.
3. Click **Sign in**.

> **Note:** In production, KG-MIS uses CUAS Single Sign-On (SSO). In the development environment, local username/password credentials are used.

- Your session stays active for the configured timeout period.
- To log out, click **Sign out** at the bottom of the left sidebar.

---

## 3. Dashboard

**URL:** `/dashboard` | **Access:** All roles

The dashboard is your home screen after logging in. It shows a high-level view of all marketing intelligence data.

### What You See

| Section | Description |
|---|---|
| **KPI Cards** | Seven key metrics: Total Sales, Weekly Sales, Active Price Gaps, Market Visits, Interviews, Availability, and Form Responses |
| **Generated Alerts** | AI-powered alerts ranked by severity (High / Medium / Low) |
| **Recent Notifications** | Your latest 6 notification emails with a "View all" link |
| **Quick Capture** | Eight shortcut tiles to jump directly to any module |
| **Insights & Observations** | AI-generated observations about your market data |
| **Next Steps** | Actionable reminders with links to the relevant modules |

### Quick Actions

- Click any **Quick Capture tile** to navigate directly to that module.
- Click **View all** next to Recent Notifications to see your full notification history.

---

## 4. Market Visits

**URL:** `/visits` | **Access:** Administrator, Marketing Manager, Marketing Analyst, Field Officer

Record and track visits to retail outlets. Each visit captures outlet information, stock levels, competitor presence, and key findings.

### How to Create a Visit Report

1. Navigate to **Market Visits** in the sidebar.
2. Click **New visit report** in the top-right.
3. Fill in the required fields:
   - **Outlet** (required) -- Select from the dropdown
   - **Visit date** (required) -- Defaults to today
   - **Visit type** (required) -- Choose: Routine, Follow-up, New Product Launch, Promotion Check, Compliance, or Other
4. Optionally fill in: Business group, Stock level, Competitor presence, Key findings, Photo/video reference, Follow-up required, Notes.
5. Click **Save**.

### Visit Workflow

```
Draft  -->  Submit  -->  Submitted  -->  Review  -->  Reviewed  -->  Approve  -->  Approved
```

| Step | Who Can Do It |
|---|---|
| Create / Edit | The person who created the report (when status is Draft) |
| Submit for Review | The person who created the report (when status is Draft) |
| Review | Administrator, Marketing Manager |
| Approve | Administrator, Marketing Manager |

### Filtering Visits

Use the dropdown filters at the top of the list to filter by:
- **Status** -- Draft, Submitted, Reviewed, Approved
- **Region** -- Filter by geographic region
- **Business Group** -- Filter by business unit

---

## 5. Interviews

**URL:** `/interviews` | **Access:** All roles (Viewer: read-only)

Capture structured interviews with customers, distributors, retailers, and agents. Record satisfaction scores, sentiment, and key feedback themes.

### How to Create an Interview

1. Navigate to **Interviews** in the sidebar.
2. Click **New interview**.
3. Fill in the required fields:
   - **Respondent name** (required) -- e.g. "Meron Alemu"
   - **Respondent type** (required) -- Customer, Distributor, Retailer, Agent, or Other
   - **Interview date** (required) -- Defaults to today
   - **Business group** (required)
   - **Region** (required)
4. Optionally fill in: Outlet, Satisfaction score (1-5), Sentiment (Positive/Neutral/Negative), Key feedback, Photo/video reference, GPS Location, Notes.
5. Click **Save**.

### Interview Workflow

Same as Market Visits: **Draft --> Submitted --> Reviewed --> Approved**

### Viewing Interview Details

- Click **View** on any row to open the **Detail** tab with full interview information.
- The detail shows satisfaction score (out of 5), sentiment badge, and all recorded fields.

---

## 6. Photos & Videos

**URL:** `/multimedia` | **Access:** All roles (Viewer: read-only; validate: Administrator, Marketing Manager)

Upload, view, and manage photos, videos, and audio recordings captured in the field.

### How to Upload Media

1. Navigate to **Photos & Videos** in the sidebar.
2. Click **Upload** in the top-right.
3. Click the drop zone or drag a file onto it.
4. Select the **Media type** (Photo, Video, or Audio).
5. Set the **Capture date**.
6. Optionally assign: Business group, Region, Outlet, Linked record (Market Visit, Interview, etc.), Tag, Notes.
7. Click **Save**.

### Managing Media

| Action | Who Can Do It |
|---|---|
| View detail | All allowed roles (click on any tile) |
| Validate | Administrator, Marketing Manager |
| Reject | Administrator, Marketing Manager |
| Delete | The person who uploaded it |
| Add transcription | All allowed roles (for Video/Audio) |

### Filtering

Use the dropdown filters to narrow by:
- **Media Type** -- Photos, Videos, Audio
- **Validation Status** -- Pending, Validated, Rejected

---

## 7. Forms & Surveys

**URL:** `/forms` | **Access:** Administrator, Marketing Manager, Marketing Analyst (create/edit); Field Officer (respond)

Build dynamic multi-page forms, publish them, collect field responses, and view aggregated reports.

### For Form Builders (Administrator, Manager, Analyst)

#### Creating a Form

1. Navigate to **Forms & Surveys** in the sidebar.
2. Click **New form**.
3. Enter a **Title** and optional **Description**.
4. Use the **Builder** tab to add fields by clicking elements in the left palette.
5. Drag to reorder fields. Click a field to configure it in the right inspector panel.
6. Switch to the **Settings** tab to configure access mode, GDPR consent, response limits, etc.
7. Click **Save version** to save your progress.
8. When ready, click **Publish** to make the form live.

#### Form Builder Field Types

Short text, Long text, Number, Email, Phone, Date, Time, Dropdown, Multiple choice, Rating, Yes/No, File upload, Image, Signature, Slider, Location, Matrix, Rich text, and more.

#### Form States

| State | Meaning |
|---|---|
| **Draft** | Being built or edited. Can be published or deleted. |
| **Published** | Live and accepting responses. Can be archived. |
| **Archived** | Read-only. No new responses accepted. |

### For Respondents (Field Officer)

1. Navigate to **Forms & Surveys** in the sidebar.
2. Under **"Open forms -- submit a response"**, find the form you need.
3. Click **Fill in** to open the form.
4. Fill in all required fields.
5. Optionally click **Save as draft** to save progress and resume later.
6. Click **Submit** when complete.

---

## 8. Competitor Pricing

**URL:** `/pricing` | **Access:** Administrator, Marketing Manager, Marketing Analyst, Field Officer

Record competitor prices, compare them against your own prices, and receive automatic alerts when price gaps exceed your configured thresholds.

### Tab 1: Price Records

**To record a competitor price:**

1. Navigate to **Competitor Pricing** in the sidebar.
2. Ensure you are on the **Price records** tab.
3. Click **Record price**.
4. Fill in:
   - **Product** (required)
   - **Competitor** (required) -- e.g. "Shola Wholesale"
   - **Price (ETB)** (required)
   - **Region** (required)
   - Recorded date, Outlet (optional)
5. Click **Save**.

> If the competitor price differs from your own price by more than the configured threshold, a **Price Gap Alert** is automatically generated and an email notification is sent.

### Tab 2: Compare

Select a product to see a side-by-side comparison of your price vs. all recorded competitor prices.

### Tab 3: Alerts

View all generated price gap alerts. Filter by status (Active, Resolved, Dismissed). Resolve or dismiss alerts as needed.

### Tab 4: Thresholds

Configure per-category gap thresholds (default: 15%). When a competitor price gap exceeds this percentage, an alert is triggered.

---

## 9. Weekly Sales

**URL:** `/weekly-sales` | **Access:** All roles (Viewer: read-only)

Record weekly point-of-sale data including quantity sold, unit price, and revenue.

### How to Record a Weekly Sale

1. Navigate to **Weekly Sales** in the sidebar.
2. Click **Record weekly sale**.
3. Fill in the required fields:
   - **Week ending** (required) -- Should be a Sunday
   - **Business group** (required)
   - **Product** (required) -- Unit price auto-fills from product master
   - **Region** (required)
   - **Outlet** (required)
   - **Quantity sold** (required)
   - **Unit price (ETB)** (required) -- Auto-filled; editable if needed
4. Optionally select a **Customer** and add **Notes**.
5. Click **Save**.

### Summary Stats

At the top of the page, you'll see three summary KPIs:
- **Entries** -- Total number of records
- **Quantity sold** -- Sum of all quantities
- **Revenue (ETB)** -- Sum of all revenue

---

## 10. Reports & Analytics

**URL:** `/reports` | **Access:** Administrator, Marketing Manager, Marketing Analyst, Viewer

View cross-domain analytics, AI-powered insights, and export data to CSV.

### Available Report Tabs

| Tab | What It Shows |
|---|---|
| **AI Insights** | 8 KPI cards, generated alerts, and AI observations |
| **Sales** | Sales by region (bar chart) and top products table |
| **Price comparison** | Competitor vs. own prices with gap analysis |
| **Interviews** | Interview volume by region and sentiment breakdown |
| **Weekly sales** | Revenue by region and top products |
| **Power BI** | Embedded Power BI dashboards (if configured) |

### Exporting Data

1. Click **Export CSV** in the top-right.
2. Choose the data type: Market visits, Interviews, Multimedia, Weekly sales, or Competitor intelligence.
3. A CSV file will download to your computer.

### Filtering Reports

Most report tabs offer date range filters (From/To), Region filters, and Business Group filters. Use these to narrow down the data shown.

---

## 11. Notifications

**URL:** `/notifications` | **Access:** All roles

View your notification history, track email delivery status, and manage read/unread status.

### Tabs

| Tab | Description |
|---|---|
| **Unread** | Shows unread notifications with a count badge |
| **All** | Complete notification history |

### Key Actions

| Action | How |
|---|---|
| Mark a single notification as read | Click the envelope-open icon on the row |
| Mark all as read | Click **Mark all read** in the toolbar |
| Filter by event type | Use the **Event** dropdown in the toolbar |

### Notification Types

You may receive notifications for events such as:
- New market visit report submitted
- New interview submitted
- Price gap alert triggered
- D365FO sync failure
- Form published / ownership transferred
- Form response submitted / edited
- Response limit warning (80% threshold)

### Delivery Status

Each notification shows its delivery status:
- **Sent** (green) -- Email delivered successfully
- **Failed** (red) -- Email delivery failed
- **Retried** (neutral) -- Delivery failed once, retried, then succeeded

---

## 12. Admin Centre

**URL:** `/admin` | **Access:** Administrator only

Manage users, roles, notification rules, and system configuration.

### Tab 1: Users & Roles

| Action | How |
|---|---|
| Change a user's role | Select a new role from the dropdown in the Role column |
| Assign a region to a user | Click the assign icon, select a region, click Assign |
| Remove a region from a user | Click the X on the region badge |

### Tab 2: Role Mapping

Map CUAS SSO claims to system roles. Add a CUAS claim text and select the corresponding KG-MIS role.

### Tab 3: Notifications

Configure which notification events trigger emails to which roles.

| Action | How |
|---|---|
| Add a notification rule | Select Event, Channel, and Role, then click Add config |
| Remove a rule | Click the delete icon on the row |

### Tab 4: Schedules

Schedule automated Power BI report delivery using cron expressions.

### Tab 5: Audit Log

Read-only view of the last 100 system audit entries showing who did what and when.

---

## 13. Roles & Permissions

KG-MIS has five user roles. Your role determines what you can see and do.

| Role | Description | Key Permissions |
|---|---|---|
| **Administrator** | Full system access | All features + Admin Centre |
| **Marketing Manager** | Manages field operations | Create, review, and approve visits/interviews; manage forms; view reports |
| **Marketing Analyst** | Analyzes data and builds forms | Create visits/interviews; build and publish forms; view reports |
| **Field Officer** | Captures field data | Create visits, interviews, upload media, record pricing/sales, fill forms |
| **Viewer** | Read-only access | View dashboard, interviews, multimedia, weekly sales, reports, notifications |

### What Each Role Can Access

| Feature | Admin | Manager | Analyst | Field Officer | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Dashboard | View | View | View | View | View |
| Market Visits | Full | Full | Create | Create | -- |
| Interviews | Full | Full | Create | Create | View |
| Photos & Videos | Full | Full | Upload | Upload | View |
| Forms & Surveys | Full | Full | Build | Respond | View |
| Competitor Pricing | Full | Full | Create | Create | -- |
| Weekly Sales | Full | Full | Create | Create | View |
| Reports | Full | Full | Full | -- | View |
| Admin Centre | Full | -- | -- | -- | -- |

**Full** = Create, Edit, Review, Approve, Delete

---

## 14. Tips & Troubleshooting

### General Tips

- **Use the Quick Capture tiles** on the Dashboard for fast navigation to any module.
- **Filter your data** -- Every list page has filter dropdowns. Use them to find what you need quickly.
- **Save drafts** -- Visit reports, interviews, and form responses can all be saved as drafts and finished later.
- **Check your notifications** -- The bell icon in the top bar shows unread notifications. Red dot = unread items.

### Common Issues

| Issue | Solution |
|---|---|
| "You do not have permission" | Your role may not have access to this feature. Contact your Administrator. |
| Session expired / redirected to login | Your session timed out. Log in again. |
| Form won't submit | Check that all required fields are filled in. |
| Can't find a product or outlet | Contact your Administrator to add master data. |
| Email notifications not received | Check your Notifications page for delivery status. Contact your Administrator if status shows "Failed". |

### Browser Requirements

- Modern browsers: Chrome, Firefox, Edge, Safari
- JavaScript must be enabled
- For Power BI embedded reports: Microsoft Edge or Chrome recommended

---

## Need Help?

Contact your **System Administrator** for:
- Account creation or password reset
- Role changes or permission requests
- Data imports or master data updates
- System configuration changes

---

*KG-MIS -- Kerchanshe Group Marketing Intelligence System*
*Transforming market data into actionable intelligence.*
