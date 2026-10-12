-- =============================================================================
-- KG-MIS  Migration 004 - Seed data corrections & view fixes
-- Reference: KG-MIS_Seed_Data_Collection_Template_v1_2_SRD_Aligned.xlsx
-- Idempotent (safe to re-run).
-- =============================================================================
USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- 1. Fix Product BusinessGroupID seed data
-- ---------------------------------------------------------------------------
UPDATE p SET p.BusinessGroupID = v.BusinessGroupID
FROM dbo.Product p
JOIN (VALUES
    (1, 1),  -- Arabica Coffee 1kg -> KCC
    (2, 1),  -- Roasted Coffee 500g -> KCC
    (3, 1),  -- Black Tea 500g -> KCC
    (4, 1),  -- Green Tea 250g -> KCC
    (5, 2),  -- Tef Grain 50kg -> TRC
    (6, 2),  -- Sorghum 50kg -> TRC
    (7, 3),  -- Berbere Spice 500g -> GLC
    (8, 3)   -- Shiro Powder 500g -> GLC
) v(ProductID, BusinessGroupID) ON v.ProductID = p.ProductID
WHERE p.BusinessGroupID IS NULL OR p.BusinessGroupID <> v.BusinessGroupID;
GO

-- ---------------------------------------------------------------------------
-- 2. Fix Customer BusinessGroupID + contact fields seed data
-- ---------------------------------------------------------------------------
UPDATE c SET 
    c.BusinessGroupID = v.BusinessGroupID,
    c.ContactPerson = v.ContactPerson,
    c.ContactPhone = v.ContactPhone,
    c.Email = v.Email,
    c.RegionID = v.RegionID,
    c.OutletID = v.OutletID
FROM dbo.Customer c
JOIN (VALUES
    (1, 1, 'Samuel Tadesse',   '+251911234567', 'samuel@addisbev.com',   1, 2),
    (2, 1, 'Meron Alemu',      '+251922345678', 'meron@oromiaagro.com',  2, 4),
    (3, 1, 'Abebe Kebede',     '+251933456789', 'abebe@shola.com',       1, 1),
    (4, 2, 'Hana Getachew',    '+251944567890', 'hana@hawassa.com',      4, 8),
    (5, 3, 'Tesfaye Lemma',    '+251955678901', 'tesfaye@bahirdar.com',  3, 6),
    (6, 1, 'Liya Assefa',      '+251966789012', 'liya@citycafe.com',     1, 3)
) v(CustomerID, BusinessGroupID, ContactPerson, ContactPhone, Email, RegionID, OutletID) ON v.CustomerID = c.CustomerID
WHERE c.BusinessGroupID IS NULL OR c.BusinessGroupID <> v.BusinessGroupID;
GO

-- ---------------------------------------------------------------------------
-- 3. Fix Competitor BusinessGroupID (Addis Agro Wholesale -> TRC)
-- ---------------------------------------------------------------------------
UPDATE c SET c.BusinessGroupID = 2
FROM dbo.Competitor c
WHERE c.Name = 'Addis Agro Wholesale' AND (c.BusinessGroupID IS NULL OR c.BusinessGroupID <> 2);
GO

-- ---------------------------------------------------------------------------
-- 4. Add Approved status sample rows
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.MarketVisitReport WHERE Status = 'Approved')
BEGIN
    INSERT INTO dbo.MarketVisitReport (UserID, OutletID, VisitDate, VisitType, StockLevelObserved, CompetitorPresenceNoted, KeyFindings, PhotoVideoRef, FollowUpRequired, Status, BusinessGroupID) VALUES
        (5, 1, '2026-08-18', 'Follow-up', 'In Stock', 'No competitor presence', 'Previous issues resolved; shelf space restored', 'visits/2026-08-18_shola.jpg', 0, 'Approved', 1);
END
GO

IF NOT EXISTS (SELECT 1 FROM dbo.Interview WHERE Status = 'Approved')
BEGIN
    INSERT INTO dbo.Interview (UserID, BusinessGroupID, RegionID, OutletID, InterviewDate, RespondentType, RespondentName, SatisfactionScore, Sentiment, KeyFeedback, Status) VALUES
        (4, 1, 1, 1, '2026-08-16', 'Retailer', 'Abebe Kebede', 5, 'Positive', 'Excellent product quality; customers love the new packaging', 'Approved');
END
GO

-- ---------------------------------------------------------------------------
-- 5. Fix vw_Report_Interviews - add PhotoVideoRef column
-- ---------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_Report_Interviews', 'V') IS NOT NULL DROP VIEW dbo.vw_Report_Interviews;
GO
CREATE VIEW dbo.vw_Report_Interviews AS
SELECT
    i.InterviewID, i.InterviewDate, i.RespondentType, i.RespondentName,
    i.SatisfactionScore, i.Sentiment, i.KeyFeedback, i.Status,
    i.PhotoVideoRef,
    bg.BusinessGroupID, bg.Code AS BusinessGroupCode, bg.Name AS BusinessGroupName,
    r.RegionID, r.RegionName, r.Country,
    o.OutletID, o.OutletName, o.City,
    u.UserID AS InterviewerUserID, u.Name AS InterviewerName
FROM dbo.Interview i
JOIN dbo.BusinessGroup bg ON bg.BusinessGroupID = i.BusinessGroupID
JOIN dbo.Region r ON r.RegionID = i.RegionID
LEFT JOIN dbo.Outlet o ON o.OutletID = i.OutletID
JOIN dbo.[User] u ON u.UserID = i.UserID;
GO

-- ---------------------------------------------------------------------------
-- 6. Register migration
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.__Migrations WHERE Name = '004_seed_corrections.sql')
    INSERT INTO dbo.__Migrations (Name) VALUES ('004_seed_corrections.sql');
GO