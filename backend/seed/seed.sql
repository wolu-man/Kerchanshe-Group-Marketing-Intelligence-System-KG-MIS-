-- =============================================================================
-- KG-MIS  Seed data (v2)
-- Reference data for local Dev / UAT. Dev logins are created by scripts/seed.js
-- (which sets the shared dev password hash via bcrypt).
-- =============================================================================
USE KG_MIS;
GO

-- ---------------------------------------------------------------------------
-- Roles (stable IDs 1-5, referenced throughout)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Role)
BEGIN
    SET IDENTITY_INSERT dbo.Role ON;
    INSERT INTO dbo.Role (RoleID, RoleName) VALUES
        (1, 'Administrator'),
        (2, 'Marketing Manager'),
        (3, 'Marketing Analyst'),
        (4, 'Field Officer'),
        (5, 'Viewer');
    SET IDENTITY_INSERT dbo.Role OFF;
END
GO

-- CUAS claim -> internal role mapping (Integration Design 4.2). Placeholder
-- claim values; confirmed with the CUAS team during integration build.
IF NOT EXISTS (SELECT 1 FROM dbo.RoleMapping)
BEGIN
    INSERT INTO dbo.RoleMapping (CUASClaim, RoleID) VALUES
        ('KG-MIS-Admin',    1),
        ('KG-MIS-Manager',  2),
        ('KG-MIS-Analyst',  3),
        ('KG-MIS-Field',    4),
        ('KG-MIS-Viewer',   5);
END
GO

-- ---------------------------------------------------------------------------
-- Geography
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Region)
BEGIN
    SET IDENTITY_INSERT dbo.Region ON;
    INSERT INTO dbo.Region (RegionID, RegionName, Country) VALUES
        (1, 'Addis Ababa', 'Ethiopia'),
        (2, 'Oromia',      'Ethiopia'),
        (3, 'Amhara',      'Ethiopia'),
        (4, 'SNNPR',       'Ethiopia'),
        (5, 'Tigray',      'Ethiopia');
    SET IDENTITY_INSERT dbo.Region OFF;

    SET IDENTITY_INSERT dbo.Outlet ON;
    INSERT INTO dbo.Outlet (OutletID, RegionID, OutletName, City) VALUES
        (1, 1, 'Shola Retail',             'Addis Ababa'),
        (2, 1, 'Merkato Wholesale',        'Addis Ababa'),
        (3, 1, 'Bole Distributor',         'Addis Ababa'),
        (4, 2, 'Adama Market',             'Adama'),
        (5, 2, 'Sebeta Grocery',           'Sebeta'),
        (6, 3, 'Bahir Dar Retail',         'Bahir Dar'),
        (7, 3, 'Gondar Distributor',       'Gondar'),
        (8, 4, 'Hawassa Supermarket',      'Hawassa'),
        (9, 5, 'Mekelle Wholesale',        'Mekelle'),
        (10, 2, 'Jimma Agro Shop',         'Jimma');
    SET IDENTITY_INSERT dbo.Outlet OFF;
END
GO

-- ---------------------------------------------------------------------------
-- D365FO cache master data (sample dataset; refreshed by the sync job)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Product)
BEGIN
    SET IDENTITY_INSERT dbo.Product ON;
    INSERT INTO dbo.Product (ProductID, D365FOKey, ProductCode, Name, Category, UnitPrice, BusinessGroupID) VALUES
        -- Kerchanshe Coffee (KCC - BusinessGroupID 1)
        (1,  'KCC-AR-1KG',   'KCC-AR-1KG',   'Arabica Coffee 1kg',         'Coffee',       850.00,   1),
        (2,  'KCC-RO-500G',  'KCC-RO-500G',  'Roasted Coffee 500g',        'Coffee',       480.00,   1),
        (3,  'KCC-GR-1KG',   'KCC-GR-1KG',   'Green Coffee Beans 1kg',     'Coffee',       620.00,   1),
        (4,  'KCC-IN-200G',  'KCC-IN-200G',  'Instant Coffee 200g',        'Coffee',       350.00,   1),
        (5,  'KCC-ESP-250G', 'KCC-ESP-250G', 'Espresso Blend 250g',        'Coffee',       420.00,   1),
        (6,  'KCC-DEC-200G', 'KCC-DEC-200G', 'Decaf Coffee 200g',          'Coffee',       380.00,   1),
        -- Tractor (TRC - BusinessGroupID 2)
        (7,  'TRC-TR50',     'TRC-TR50',     'TR-50 Agricultural Tractor',  'Tractor',      850000.00,  2),
        (8,  'TRC-TR65',     'TRC-TR65',     'TR-65 Utility Tractor',       'Tractor',      1100000.00, 2),
        (9,  'TRC-TR75',     'TRC-TR75',     'TR-75 Heavy Duty Tractor',    'Tractor',      1350000.00, 2),
        (10, 'TRC-PLOW',     'TRC-PLOW',     'Disc Plow 3-Furrow',          'Implement',    85000.00,   2),
        (11, 'TRC-HARROW',   'TRC-HARROW',   'Disc Harrow 24-Disc',         'Implement',    65000.00,   2),
        (12, 'TRC-TRAILER',  'TRC-TRAILER',  'Farm Trailer 5-Ton',          'Trailer',      120000.00,  2),
        -- Geely Car (GLC - BusinessGroupID 3)
        (13, 'GLC-COOLRAY',  'GLC-COOLRAY',  'Geely Coolray',              'SUV',          1850000.00, 3),
        (14, 'GLC-EMGRAND',  'GLC-EMGRAND',  'Geely Emgrand',              'Sedan',        1200000.00, 3),
        (15, 'GLC-AZKARRA',  'GLC-AZKARRA',  'Geely Azkarra',              'SUV',          2100000.00, 3),
        (16, 'GLC-GC6',      'GLC-GC6',      'Geely GC6',                  'Sedan',        950000.00,  3),
        (17, 'GLC-OKAVANGO', 'GLC-OKAVANGO', 'Geely Okavango',             'SUV',          2300000.00, 3),
        -- Buna Pen (BPN - BusinessGroupID 4)
        (18, 'BPN-BLUE',     'BPN-BLUE',     'Blue Pen',                   'Buna Pen',     12.00,      4),
        (19, 'BPN-BLACK',    'BPN-BLACK',    'Black Pen',                  'Buna Pen',     12.00,      4),
        (20, 'BPN-RED',      'BPN-RED',      'Red Pen',                    'Buna Pen',     12.00,      4),
        -- Buna Plate (BPL - BusinessGroupID 5)
        (21, '430023',       '430023',       'BPKB10055BowlPlate',         'Buna Plate',   85.00,      5),
        (22, '430032',       '430032',       'BPKB21105RoundFruitP',       'Buna Plate',   75.00,      5),
        (23, '430053',       '430053',       'BPKB61085FlowerSmall',       'Buna Plate',   65.00,      5),
        (24, '430022',       '430022',       'BPKB10045Bowl',              'Buna Plate',   70.00,      5),
        (25, '430027',       '430027',       'BPKB1107RoundBowl',          'Buna Plate',   55.00,      5),
        (26, '430003',       '430003',       'BPBM1Mug',                   'Buna Plate',   45.00,      5),
        (27, '430028',       '430028',       'BPKB1109RoundPlate',         'Buna Plate',   60.00,      5),
        (28, '430029',       '430029',       'BPKB2006RoundPlate',         'Buna Plate',   60.00,      5),
        (29, '430004',       '430004',       'BPBM2Mug',                   'Buna Plate',   45.00,      5),
        (30, '430026',       '430026',       'BPKB1020Bowl',               'Buna Plate',   50.00,      5),
        -- Bus (BUS - BusinessGroupID 6)
        (31, 'BUS-CITY12',   'BUS-CITY12',   'City Bus 12m',               'Bus',          4500000.00, 6),
        (32, 'BUS-INTER13',  'BUS-INTER13',  'Intercity Bus 13m',          'Bus',          5200000.00, 6),
        (33, 'BUS-MINI',     'BUS-MINI',     'Minibus 30-Seater',          'Bus',          2800000.00, 6),
        (34, 'BUS-SCHOOL',   'BUS-SCHOOL',   'School Bus 45-Seater',       'Bus',          3500000.00, 6),
        (35, 'BUS-LUXURY',   'BUS-LUXURY',   'Luxury Coach 55-Seater',     'Bus',          6800000.00, 6),
        -- Oro Meat (ORM - BusinessGroupID 7)
        (36, 'ORM-BEEF-1KG',  'ORM-BEEF-1KG',  'Premium Beef 1kg',          'Meat',         850.00,     7),
        (37, 'ORM-LAMB-1KG',  'ORM-LAMB-1KG',  'Premium Lamb 1kg',          'Meat',         950.00,     7),
        (38, 'ORM-GOAT-1KG',  'ORM-GOAT-1KG',  'Goat Meat 1kg',             'Meat',         780.00,     7),
        (39, 'ORM-CHIKN-1KG', 'ORM-CHIKN-1KG', 'Whole Chicken 1kg',         'Poultry',      320.00,     7),
        (40, 'ORM-SAUSAGE',   'ORM-SAUSAGE',   'Beef Sausage 500g',         'Processed Meat',180.00,    7),
        (41, 'ORM-BURGER',    'ORM-BURGER',    'Beef Burger Patties 1kg',   'Processed Meat',280.00,    7),
        -- Buna Paints (BPT - BusinessGroupID 8)
        (42, 'BPT-WHT-20L',   'BPT-WHT-20L',   'White Emulsion Paint 20L',  'Paint',        1850.00,    8),
        (43, 'BPT-WHT-4L',    'BPT-WHT-4L',    'White Emulsion Paint 4L',   'Paint',        420.00,     8),
        (44, 'BPT-PRIMER-20L','BPT-PRIMER-20L','Primer Paint 20L',          'Paint',        1650.00,    8),
        (45, 'BPT-Roof-20L',  'BPT-ROOF-20L',  'Roof Paint 20L',            'Paint',        2200.00,    8),
        (46, 'BPT-WEATHER-20L','BPT-WEATHER-20L','Weather Shield 20L',       'Paint',        2400.00,    8),
        (47, 'BPT-ENAMEL-4L', 'BPT-ENAMEL-4L', 'Enamel Paint 4L',           'Paint',        580.00,     8),
        (48, 'BPT-THINNER-5L','BPT-THINNER-5L','Paint Thinner 5L',          'Solvent',      320.00,     8);
    SET IDENTITY_INSERT dbo.Product OFF;

    SET IDENTITY_INSERT dbo.Customer ON;
    INSERT INTO dbo.Customer (CustomerID, D365FOKey, CustomerCode, Name, CustomerType, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID) VALUES
        (1, 'C-001', 'DIST-001', 'Addis Beverages Plc',     'Distributor', 'Samuel Tadesse', '+251911234567', 'samuel@addisbev.com', 1, 2, 1),
        (2, 'C-002', 'DIST-002', 'Oromia Agro Trading',     'Distributor', 'Meron Alemu', '+251922345678', 'meron@oromiaagro.com', 2, 4, 1),
        (3, 'C-003', 'RET-001',  'Shola Retail',            'Retailer',    'Abebe Kebede', '+251933456789', 'abebe@shola.com', 1, 1, 1),
        (4, 'C-004', 'RET-002',  'Hawassa Supermarket',     'Retailer',    'Hana Getachew', '+251944567890', 'hana@hawassa.com', 4, 8, 2),
        (5, 'C-005', 'RET-003',  'Bahir Dar Retail',        'Retailer',    'Tesfaye Lemma', '+251955678901', 'tesfaye@bahirdar.com', 3, 6, 3),
        (6, 'C-006', 'END-001',  'City Cafe Group',         'End User',    'Liya Assefa', '+251966789012', 'liya@citycafe.com', 1, 3, 1);
    SET IDENTITY_INSERT dbo.Customer OFF;

    -- Sample sales (Q1-Q3 2026) for KPI dashboards
    SET IDENTITY_INSERT dbo.SalesRecord ON;
    INSERT INTO dbo.SalesRecord (SalesID, D365FOKey, ProductID, CustomerID, SaleDate, Quantity, Amount, RegionID) VALUES
        (1,  'SO-001', 1, 1, '2026-01-15', 120, 102000.00, 1),
        (2,  'SO-002', 2, 3, '2026-01-20',  80,  38400.00, 1),
        (3,  'SO-003', 3, 2, '2026-02-05',  90,  28800.00, 2),
        (4,  'SO-004', 1, 2, '2026-02-12', 150, 127500.00, 2),
        (5,  'SO-005', 5, 1, '2026-03-03',  40, 104000.00, 1),
        (6,  'SO-006', 4, 4, '2026-03-18',  60,  16800.00, 4),
        (7,  'SO-007', 1, 4, '2026-04-02', 110,  93500.00, 4),
        (8,  'SO-008', 2, 5, '2026-04-22',  95,  45600.00, 3),
        (9,  'SO-009', 6, 2, '2026-05-10',  55, 104500.00, 2),
        (10, 'SO-010', 3, 6, '2026-05-25',  70,  22400.00, 1),
        (11, 'SO-011', 1, 1, '2026-06-08', 135, 114750.00, 1),
        (12, 'SO-012', 7, 3, '2026-06-20', 200,  30000.00, 1),
        (13, 'SO-013', 8, 4, '2026-07-01', 180,  21600.00, 4),
        (14, 'SO-014', 5, 1, '2026-07-15',  60, 156000.00, 1),
        (15, 'SO-015', 2, 2, '2026-08-05',  85,  40800.00, 2);
    SET IDENTITY_INSERT dbo.SalesRecord OFF;
END
GO

-- ---------------------------------------------------------------------------
-- Price gap thresholds (per product category; FR-02.4 / FDS 4.3)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.PriceGapThreshold)
BEGIN
    INSERT INTO dbo.PriceGapThreshold (ProductCategory, ThresholdPercent) VALUES
        ('Buna Plate',     15.00),
        ('Buna Pen',       20.00),
        ('Coffee',         15.00),
        ('Tractor',        10.00),
        ('Implement',      10.00),
        ('Trailer',        10.00),
        ('SUV',            12.00),
        ('Sedan',          12.00),
        ('Bus',             8.00),
        ('Meat',           15.00),
        ('Poultry',        15.00),
        ('Processed Meat', 15.00),
        ('Paint',          12.00),
        ('Solvent',        15.00);
END
GO

-- ---------------------------------------------------------------------------
-- Competitor catalogue (MI-AN-03) - reference list of known competitors
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.Competitor)
BEGIN
    INSERT INTO dbo.Competitor (Name, ProductsCovered, RegionsActiveIn, Notes, BusinessGroupID) VALUES
        ('Tracon Trading', 'Washed Coffee, Natural Coffee', 'Oromia, SNNPR', 'Main regional coffee competitor', 1),
        ('Des', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('Antiline', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('BY', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('STAR', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('HUADA', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('Camel', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('ITAI', 'Dining Plate', 'All Regions', 'Dining plate competitor', 5),
        ('BIC', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4),
        ('Lexi', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4),
        ('Radius', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4),
        ('Nano', 'Writing Instruments', 'All Regions', 'Writing instruments competitor', 4);
END
GO

-- ---------------------------------------------------------------------------
-- Users: Map existing dev users to real Kerchanshe Group staff.
-- Update existing rows (preserves FK references) and insert any missing users.
-- ---------------------------------------------------------------------------
UPDATE dbo.[User] SET CUAS_ID = 'woluman.urgesa@kerchanshe.net',  Name = 'Woluman Urgesa',          Email = 'woluman.urgesa@kerchanshe.net',  RoleID = 1 WHERE UserID = 1;
UPDATE dbo.[User] SET CUAS_ID = 'habtamu.ayele@kerchanshe.com',    Name = 'Habtamu Ayele',           Email = 'habtamu.ayele@kerchanshe.com',   RoleID = 2 WHERE UserID = 2;
UPDATE dbo.[User] SET CUAS_ID = 'tsegaye.nigusie@kerchanshe.net',  Name = 'Tsegaye Nigusie Balcha',  Email = 'tsegaye.nigusie@kerchanshe.net', RoleID = 3 WHERE UserID = 3;
UPDATE dbo.[User] SET CUAS_ID = 'mekdes.tilahun@kerchanshe.com',   Name = 'Mekdes Tilahun Hailamariam', Email = 'mekdes.tilahun@kerchanshe.com', RoleID = 5 WHERE UserID = 4;
UPDATE dbo.[User] SET CUAS_ID = 'shalama.girma@kerchanshegroup.com', Name = 'Shelema Girma Dechasa', Email = 'shalama.girma@kerchanshegroup.com', RoleID = 4 WHERE UserID = 5;
UPDATE dbo.[User] SET CUAS_ID = 'efrem.tilahun@kerchanshe.net',    Name = 'Efrem Tilahun',           Email = 'efrem.tilahun@kerchanshe.net',   RoleID = 4 WHERE UserID = 6;

-- Insert remaining field officers (IDs 7-10) if not already present
SET IDENTITY_INSERT dbo.[User] ON;
IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserID = 7)
    INSERT INTO dbo.[User] (UserID, CUAS_ID, Name, Email, RoleID) VALUES (7, 'duskane.gelan@kerchanshegroup.com', 'Duskane Gelan', 'duskane.gelan@kerchanshegroup.com', 4);
IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserID = 8)
    INSERT INTO dbo.[User] (UserID, CUAS_ID, Name, Email, RoleID) VALUES (8, 'fasika.zewdie@kerchanshegroup.com', 'Fasika Zawude Chali', 'fasika.zewdie@kerchanshegroup.com', 4);
IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserID = 9)
    INSERT INTO dbo.[User] (UserID, CUAS_ID, Name, Email, RoleID) VALUES (9, 'masamo.tesfaye@kerchanshegroup.com', 'Masamo Tesfaye Haso', 'masamo.tesfaye@kerchanshegroup.com', 4);
IF NOT EXISTS (SELECT 1 FROM dbo.[User] WHERE UserID = 10)
    INSERT INTO dbo.[User] (UserID, CUAS_ID, Name, Email, RoleID) VALUES (10, 'leta.gidisa@kerchanshegroup.com', 'Leta Gidisa', 'leta.gidisa@kerchanshegroup.com', 4);
SET IDENTITY_INSERT dbo.[User] OFF;

-- Assigned regions (row-level data scope): Field Officers only
-- Adama -> Oromia(2), Hawasa -> SNNPR(4), Jimma -> Oromia(2)
DELETE FROM dbo.UserRegionAssignment;
INSERT INTO dbo.UserRegionAssignment (UserID, RegionID) VALUES
    (5, 1), (5, 2),     -- Shelema -> Addis Ababa + Oromia(Adama)
    (6, 1),              -- Efrem -> Addis Ababa
    (7, 1),              -- Duskane -> Addis Ababa
    (8, 2),              -- Fasika -> Oromia(Adama)
    (9, 4),              -- Masamo -> SNNPR(Hawasa)
    (10, 2);             -- Leta -> Oromia(Jimma)
GO

-- ---------------------------------------------------------------------------
-- Notification configuration defaults (Integration Design 5.2 + 5.3)
-- Channels: Email / SMS / WhatsApp only this release (FDS EPIC-05).
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.NotificationConfig)
BEGIN
    INSERT INTO dbo.NotificationConfig (TriggerEvent, Channel, RoleID, Enabled) VALUES
        -- EPIC-05 trigger events
        ('NewReport',       'Email', 2, 1),
        ('PriceGapAlert',   'Email', 2, 1),
        ('PriceGapAlert',   'SMS',   2, 1),
        ('PriceGapAlert',   'Email', 3, 1),
        ('PriceGapAlert',   'SMS',   3, 1),
        ('SyncFailure',     'Email', 1, 1),
        -- Form lifecycle events (FDS EPIC-01 / Integration Design 5.3)
        ('FORM_ASSIGNED',           'Email', 4, 1),
        ('FORM_REMINDER',           'Email', 4, 1),
        ('SUBMISSION_CONFIRMED',    'Email', 4, 1),
        ('NEW_RESPONSE_RECEIVED',   'Email', 3, 1),
        ('NEW_RESPONSE_RECEIVED',   'Email', 2, 1),
        ('RESPONSE_LIMIT_WARNING',  'Email', 3, 1),
        ('RESPONSE_LIMIT_WARNING',  'Email', 2, 1),
        ('FORM_PUBLISHED',          'Email', 3, 1),
        ('OWNERSHIP_TRANSFERRED',   'Email', 3, 1),
        ('ACCESS_DENIED',           'Email', 1, 1),
        -- Phase 2 (depth) lifecycle events
        ('PARENT_FORM_UPDATED',     'Email', 3, 1),
        ('PARENT_FORM_UPDATED',     'Email', 2, 1),
        ('PARENT_PROPAGATED',       'Email', 3, 1),
        ('FORM_RESUME',             'Email', 4, 1),
        ('REPORT_SHARED',           'Email', 2, 1),
        ('REPORT_SHARED',           'Email', 3, 1),
        ('RESPONSE_EDITED',         'Email', 2, 1),
        ('RESPONSE_EDITED',         'Email', 3, 1),
        ('ANOMALY_FLAGGED',         'Email', 2, 1),
        ('ANOMALY_FLAGGED',         'Email', 3, 1),
        ('CONSENT_VERSION_BUMPED',  'Email', 1, 1);
END
GO
