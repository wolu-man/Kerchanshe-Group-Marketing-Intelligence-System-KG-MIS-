-- ===========================================================================
-- KG-MIS - Reference / seed data
-- Users are seeded by database/scripts/seed.js (bcrypt password hashes).
-- ===========================================================================
USE KG_MIS;
GO

-- --- Roles (SDD 2.5, TDS 3.1) ---
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleName = 'Administrator')
INSERT INTO dbo.Role (RoleName) VALUES ('Administrator');
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleName = 'Marketing Manager')
INSERT INTO dbo.Role (RoleName) VALUES ('Marketing Manager');
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleName = 'Marketing Analyst')
INSERT INTO dbo.Role (RoleName) VALUES ('Marketing Analyst');
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleName = 'Field Officer')
INSERT INTO dbo.Role (RoleName) VALUES ('Field Officer');
IF NOT EXISTS (SELECT 1 FROM dbo.Role WHERE RoleName = 'Viewer')
INSERT INTO dbo.Role (RoleName) VALUES ('Viewer');
GO

-- --- CUAS -> internal role mapping defaults (FDS EPIC-04 / Integration Design 4.2) ---
DECLARE @AdminRoleID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Administrator');
DECLARE @ManagerRoleID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Marketing Manager');
DECLARE @AnalystRoleID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Marketing Analyst');
DECLARE @FieldRoleID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Field Officer');
DECLARE @ViewerRoleID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Viewer');

IF NOT EXISTS (SELECT 1 FROM dbo.RoleMapping WHERE CUASClaim = 'KG-MIS-Administrator')
INSERT INTO dbo.RoleMapping (CUASClaim, RoleID) VALUES ('KG-MIS-Administrator', @AdminRoleID);
IF NOT EXISTS (SELECT 1 FROM dbo.RoleMapping WHERE CUASClaim = 'KG-MIS-MarketingManager')
INSERT INTO dbo.RoleMapping (CUASClaim, RoleID) VALUES ('KG-MIS-MarketingManager', @ManagerRoleID);
IF NOT EXISTS (SELECT 1 FROM dbo.RoleMapping WHERE CUASClaim = 'KG-MIS-MarketingAnalyst')
INSERT INTO dbo.RoleMapping (CUASClaim, RoleID) VALUES ('KG-MIS-MarketingAnalyst', @AnalystRoleID);
IF NOT EXISTS (SELECT 1 FROM dbo.RoleMapping WHERE CUASClaim = 'KG-MIS-FieldOfficer')
INSERT INTO dbo.RoleMapping (CUASClaim, RoleID) VALUES ('KG-MIS-FieldOfficer', @FieldRoleID);
IF NOT EXISTS (SELECT 1 FROM dbo.RoleMapping WHERE CUASClaim = 'KG-MIS-Viewer')
INSERT INTO dbo.RoleMapping (CUASClaim, RoleID) VALUES ('KG-MIS-Viewer', @ViewerRoleID);
GO

-- --- Regions (country -> region) ---
IF NOT EXISTS (SELECT 1 FROM dbo.Region WHERE RegionName = 'Addis Ababa')
INSERT INTO dbo.Region (RegionName, Country) VALUES ('Addis Ababa', 'Ethiopia');
IF NOT EXISTS (SELECT 1 FROM dbo.Region WHERE RegionName = 'Oromia')
INSERT INTO dbo.Region (RegionName, Country) VALUES ('Oromia', 'Ethiopia');
IF NOT EXISTS (SELECT 1 FROM dbo.Region WHERE RegionName = 'Amhara')
INSERT INTO dbo.Region (RegionName, Country) VALUES ('Amhara', 'Ethiopia');
IF NOT EXISTS (SELECT 1 FROM dbo.Region WHERE RegionName = 'SNNPR')
INSERT INTO dbo.Region (RegionName, Country) VALUES ('SNNPR', 'Ethiopia');
GO

-- --- Outlets ---
DECLARE @AA INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'Addis Ababa');
DECLARE @OR INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'Oromia');
DECLARE @AM INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'Amhara');
DECLARE @SN INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'SNNPR');

IF NOT EXISTS (SELECT 1 FROM dbo.Outlet WHERE OutletName = 'Bole Branch')
INSERT INTO dbo.Outlet (RegionID, OutletName, City) VALUES (@AA, 'Bole Branch', 'Addis Ababa');
IF NOT EXISTS (SELECT 1 FROM dbo.Outlet WHERE OutletName = 'Merkato Branch')
INSERT INTO dbo.Outlet (RegionID, OutletName, City) VALUES (@AA, 'Merkato Branch', 'Addis Ababa');
IF NOT EXISTS (SELECT 1 FROM dbo.Outlet WHERE OutletName = 'Adama Branch')
INSERT INTO dbo.Outlet (RegionID, OutletName, City) VALUES (@OR, 'Adama Branch', 'Adama');
IF NOT EXISTS (SELECT 1 FROM dbo.Outlet WHERE OutletName = 'Bishoftu Branch')
INSERT INTO dbo.Outlet (RegionID, OutletName, City) VALUES (@OR, 'Bishoftu Branch', 'Bishoftu');
IF NOT EXISTS (SELECT 1 FROM dbo.Outlet WHERE OutletName = 'Bahir Dar Branch')
INSERT INTO dbo.Outlet (RegionID, OutletName, City) VALUES (@AM, 'Bahir Dar Branch', 'Bahir Dar');
IF NOT EXISTS (SELECT 1 FROM dbo.Outlet WHERE OutletName = 'Hawassa Branch')
INSERT INTO dbo.Outlet (RegionID, OutletName, City) VALUES (@SN, 'Hawassa Branch', 'Hawassa');
GO

-- --- Products (D365FO cache sample) ---
IF NOT EXISTS (SELECT 1 FROM dbo.Product WHERE ProductCode = 'BUN-ARABICA-1KG')
INSERT INTO dbo.Product (D365FOKey, ProductCode, Name, Category, UnitPrice) VALUES ('P-ARABICA-1', 'BUN-ARABICA-1KG', 'Buna Arabica 1kg', 'Coffee', 1250.00);
IF NOT EXISTS (SELECT 1 FROM dbo.Product WHERE ProductCode = 'BUN-ROBUSTA-500G')
INSERT INTO dbo.Product (D365FOKey, ProductCode, Name, Category, UnitPrice) VALUES ('P-ROBUSTA-1', 'BUN-ROBUSTA-500G', 'Buna Robusta 500g', 'Coffee', 480.00);
IF NOT EXISTS (SELECT 1 FROM dbo.Product WHERE ProductCode = 'TEA-BLACK-250G')
INSERT INTO dbo.Product (D365FOKey, ProductCode, Name, Category, UnitPrice) VALUES ('P-TEA-1', 'TEA-BLACK-250G', 'Black Tea 250g', 'Tea', 320.00);
IF NOT EXISTS (SELECT 1 FROM dbo.Product WHERE ProductCode = 'SUGAR-1KG')
INSERT INTO dbo.Product (D365FOKey, ProductCode, Name, Category, UnitPrice) VALUES ('P-SUGAR-1', 'SUGAR-1KG', 'Sugar 1kg', 'Sugar', 130.00);
IF NOT EXISTS (SELECT 1 FROM dbo.Product WHERE ProductCode = 'SPICE-BERBERE-250G')
INSERT INTO dbo.Product (D365FOKey, ProductCode, Name, Category, UnitPrice) VALUES ('P-BERB-1', 'SPICE-BERBERE-250G', 'Berbere Spice 250g', 'Spices', 220.00);
GO

-- --- Customers (D365FO cache sample) ---
IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUS-0001')
INSERT INTO dbo.Customer (D365FOKey, CustomerCode, Name, CustomerType) VALUES ('C-0001', 'CUS-0001', 'Addis Coffee Distributors', 'Distributor');
IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUS-0002')
INSERT INTO dbo.Customer (D365FOKey, CustomerCode, Name, CustomerType) VALUES ('C-0002', 'CUS-0002', 'Oromia Retail Group', 'Retailer');
IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUS-0003')
INSERT INTO dbo.Customer (D365FOKey, CustomerCode, Name, CustomerType) VALUES ('C-0003', 'CUS-0003', 'Amhara Wholesale PLC', 'Wholesale');
GO

-- --- Sample sales records (used by Power BI KPIs) ---
DECLARE @AA INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'Addis Ababa');
DECLARE @OR INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'Oromia');
DECLARE @AM INT = (SELECT RegionID FROM dbo.Region WHERE RegionName = 'Amhara');
DECLARE @ProdArabica INT = (SELECT ProductID FROM dbo.Product WHERE ProductCode = 'BUN-ARABICA-1KG');
DECLARE @ProdRobusta INT = (SELECT ProductID FROM dbo.Product WHERE ProductCode = 'BUN-ROBUSTA-500G');
DECLARE @ProdTea INT = (SELECT ProductID FROM dbo.Product WHERE ProductCode = 'TEA-BLACK-250G');
DECLARE @Cust1 INT = (SELECT CustomerID FROM dbo.Customer WHERE CustomerCode = 'CUS-0001');
DECLARE @Cust2 INT = (SELECT CustomerID FROM dbo.Customer WHERE CustomerCode = 'CUS-0002');

IF NOT EXISTS (SELECT 1 FROM dbo.SalesRecord WHERE D365FOKey = 'SO-2026-0001')
INSERT INTO dbo.SalesRecord (D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount, RegionID)
VALUES ('SO-2026-0001', @ProdArabica, @Cust1, '2026-06-01', 500, 625000.00, @AA);
IF NOT EXISTS (SELECT 1 FROM dbo.SalesRecord WHERE D365FOKey = 'SO-2026-0002')
INSERT INTO dbo.SalesRecord (D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount, RegionID)
VALUES ('SO-2026-0002', @ProdRobusta, @Cust1, '2026-06-15', 800, 384000.00, @OR);
IF NOT EXISTS (SELECT 1 FROM dbo.SalesRecord WHERE D365FOKey = 'SO-2026-0003')
INSERT INTO dbo.SalesRecord (D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount, RegionID)
VALUES ('SO-2026-0003', @ProdArabica, @Cust2, '2026-07-05', 300, 375000.00, @AA);
IF NOT EXISTS (SELECT 1 FROM dbo.SalesRecord WHERE D365FOKey = 'SO-2026-0004')
INSERT INTO dbo.SalesRecord (D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount, RegionID)
VALUES ('SO-2026-0004', @ProdTea, @Cust2, '2026-07-20', 1200, 384000.00, @AM);
GO

-- --- Price gap thresholds (FDS EPIC-02 business rule: configurable per category) ---
IF NOT EXISTS (SELECT 1 FROM dbo.PriceGapThreshold WHERE ProductCategory = 'Coffee')
INSERT INTO dbo.PriceGapThreshold (ProductCategory, ThresholdPercent) VALUES ('Coffee', 10.00);
IF NOT EXISTS (SELECT 1 FROM dbo.PriceGapThreshold WHERE ProductCategory = 'Tea')
INSERT INTO dbo.PriceGapThreshold (ProductCategory, ThresholdPercent) VALUES ('Tea', 8.00);
IF NOT EXISTS (SELECT 1 FROM dbo.PriceGapThreshold WHERE ProductCategory = 'Sugar')
INSERT INTO dbo.PriceGapThreshold (ProductCategory, ThresholdPercent) VALUES ('Sugar', 5.00);
IF NOT EXISTS (SELECT 1 FROM dbo.PriceGapThreshold WHERE ProductCategory = 'Spices')
INSERT INTO dbo.PriceGapThreshold (ProductCategory, ThresholdPercent) VALUES ('Spices', 12.00);
GO

-- --- Notification configuration defaults (Integration Design 5.2) ---
DECLARE @MgrID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Marketing Manager');
DECLARE @AnalystID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Marketing Analyst');
DECLARE @FieldID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Field Officer');
DECLARE @AdminID INT = (SELECT RoleID FROM dbo.Role WHERE RoleName = 'Administrator');

IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'NewReport' AND Channel = 'Email' AND RoleID = @MgrID)
INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES ('NewReport', 'Email', @MgrID, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'SurveyPublished' AND Channel = 'Email' AND RoleID = @FieldID)
INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES ('SurveyPublished', 'Email', @FieldID, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'PriceGapAlert' AND Channel = 'Email' AND RoleID = @AnalystID)
INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES ('PriceGapAlert', 'Email', @AnalystID, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'PriceGapAlert' AND Channel = 'SMS' AND RoleID = @MgrID)
INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES ('PriceGapAlert', 'SMS', @MgrID, 1);
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig WHERE TriggerEvent = 'SyncFailure' AND Channel = 'Email' AND RoleID = @AdminID)
INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES ('SyncFailure', 'Email', @AdminID, 1);
GO
