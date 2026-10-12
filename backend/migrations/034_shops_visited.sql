-- 034: Add ShopsVisited (number of shops visited) to a single market visit report.
-- Optional INT; existing rows stay NULL (unknown). Reports read via vw_Report_MarketVisits,
-- so the view must be re-created to expose the column.

IF COL_LENGTH('dbo.MarketVisitReport', 'ShopsVisited') IS NULL
    ALTER TABLE dbo.MarketVisitReport ADD ShopsVisited INT NULL;
GO

IF OBJECT_ID('dbo.vw_Report_MarketVisits', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_MarketVisits;
GO
CREATE VIEW dbo.vw_Report_MarketVisits AS
SELECT
    m.ReportID, m.VisitDate, m.Status, m.VisitType, m.StockLevelObserved,
    m.CompetitorPresenceNoted, m.KeyFindings, m.PhotoVideoRef, m.FollowUpRequired,
    m.ShopsVisited,
    bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    u.UserID AS SubmittedByUserID, u.Name AS SubmittedByName
FROM dbo.MarketVisitReport m
JOIN dbo.Outlet o ON o.OutletID = m.OutletID
JOIN dbo.Region r ON r.RegionID = o.RegionID
JOIN dbo.[User] u ON u.UserID = m.UserID
LEFT JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = m.BusinessGroupID;
GO
