-- 026: Import Own Shops & Van Sales from Excel
-- Source: Docs/Master-data/Kerchanshe Potential Costumers.xlsx - Active Shops(Own) sheet
--
-- CustomerType mapping: Own Shop = 3, VanSale = 9
-- Region mapping: Addis Ababa = 1, Oromia = 2, SNNPR = 4
-- BusinessGroup mapping: Buna Pen = 4, Buna Plate = 5

-- ==========================================
-- OWN SHOPS - Buna Pen (5)
-- ==========================================
IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-ADAMASH-101')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-ADAMASH-101', 'Adama Shop', 'Own Shop', 3, 'Fasika Zawude Chali', '901931777', NULL, 2, NULL, 4, 'Adama', 'Adama', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-SHASHEM-102')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-SHASHEM-102', 'Shashemene Shop', 'Own Shop', 3, 'Melese', '+251 91 972 1729', NULL, 2, NULL, 4, 'Shashemene', 'Shashemene', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-HAWASAS-103')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-HAWASAS-103', 'Hawasa Shop', 'Own Shop', 3, 'Masamo Tesfaye', '926322440', 'masamotesfaye35@gmail.com', 4, NULL, 4, 'Hawassa', 'Hawassa', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-JIMMASK-104')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-JIMMASK-104', 'Jimma Shop', 'Own Shop', 3, 'Leta Gidisa', '902009467', 'letagidisa74@gmail.com', 2, NULL, 4, 'Jimma', 'Jimma', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-MERKATK-105')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-MERKATK-105', 'Merkato Shop', 'Own Shop', 3, 'Shelema Girma', '933000147', 'shelemagirma6@gmail.com', 1, NULL, 4, 'Merkato', 'Addis Ababa', 1);

-- ==========================================
-- OWN SHOPS - Buna Plate (5)
-- ==========================================
IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-ADAMASH-106')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-ADAMASH-106', 'Adama Shop', 'Own Shop', 3, 'Fasika Zawude Chali', '901931777', NULL, 2, NULL, 5, 'Adama', 'Adama', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-SHASHEM-107')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-SHASHEM-107', 'Shashemene Shop', 'Own Shop', 3, 'Melese', '+251 91 972 1729', NULL, 2, NULL, 5, 'Shashemene', 'Shashemene', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-HAWASAS-108')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-HAWASAS-108', 'Hawasa Shop', 'Own Shop', 3, 'Masamo Tesfaye', '926322440', 'masamotesfaye35@gmail.com', 4, NULL, 5, 'Hawassa', 'Hawassa', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-JIMMASK-109')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-JIMMASK-109', 'Jimma Shop', 'Own Shop', 3, 'Leta Gidisa', '902009467', 'letagidisa74@gmail.com', 2, NULL, 5, 'Jimma', 'Jimma', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-MERKATK-110')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-MERKATK-110', 'Merkato Shop', 'Own Shop', 3, 'Tarikuwa Gutema', '+251 96 789 9772', 'tarikgutema12@gmail.com', 1, NULL, 5, 'Merkato', 'Addis Ababa', 1);

-- ==========================================
-- VAN SALES (3)
-- ==========================================
IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-BUNAPEN-111')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-BUNAPEN-111', 'Buna Pen Van Sales', 'Van Sales', 9, 'Kamil Musbah', '913886837', 'kamilmusbah37@gmail.com', 1, NULL, 4, 'Van Sales(Ad-hoc)', 'Addis Ababa', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-BUNAPEN-112')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-BUNAPEN-112', 'Buna Pen Van Sales', 'Van Sales', 9, 'Ahimeddin Shukri', '+251 90 200 3531', NULL, 1, NULL, 4, 'Van Sales(Ad-hoc)', 'Addis Ababa', 1);

IF NOT EXISTS (SELECT 1 FROM dbo.Customer WHERE CustomerCode = 'CUST-BUNAPLA-113')
INSERT INTO dbo.Customer (CustomerCode, Name, CustomerType, CustomerTypeID, ContactPerson, ContactPhone, Email, RegionID, OutletID, BusinessGroupID, Address, Area, IsActive)
VALUES ('CUST-BUNAPLA-113', 'Buna Plate Van Sales', 'Van Sales', 9, 'Samuel Yeshtela', '912461247', NULL, 1, NULL, 5, 'Van Sales(Ad-hoc)', 'Addis Ababa', 1);
GO
