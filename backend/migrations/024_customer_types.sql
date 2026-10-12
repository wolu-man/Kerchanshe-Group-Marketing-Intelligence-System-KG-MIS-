-- 024: Customer type cleanup
-- 1. Rename Shop/Wholesaler -> Own Shop
-- 2. Merge Distributor into Agent/Distributor, delete Distributor
-- Wholesale and VanSale already exist

-- 1. Rename Shop/Wholesaler -> Own Shop
UPDATE dbo.CustomerType SET Name = 'Own Shop', UpdatedAt = SYSUTCDATETIME() WHERE Name = 'Shop/Wholesaler';

-- 2. Merge Distributor into Agent/Distributor
DECLARE @DistributorID INT = (SELECT CustomerTypeID FROM dbo.CustomerType WHERE Name = 'Distributor');
DECLARE @AgentDistID INT = (SELECT CustomerTypeID FROM dbo.CustomerType WHERE Name = 'Agent/Distributor');

IF @DistributorID IS NOT NULL AND @AgentDistID IS NOT NULL
BEGIN
  -- Reassign Customer records
  UPDATE dbo.Customer SET CustomerTypeID = @AgentDistID WHERE CustomerTypeID = @DistributorID;

  -- Reassign ProductPrice records (delete duplicates first)
  DELETE pp FROM dbo.ProductPrice pp
    INNER JOIN dbo.ProductPrice pp2 ON pp.ProductID = pp2.ProductID AND pp2.CustomerTypeID = @AgentDistID
    WHERE pp.CustomerTypeID = @DistributorID;
  UPDATE dbo.ProductPrice SET CustomerTypeID = @AgentDistID WHERE CustomerTypeID = @DistributorID;

  -- Reassign CompetitorPrice records
  UPDATE dbo.CompetitorPrice SET CustomerTypeID = @AgentDistID WHERE CustomerTypeID = @DistributorID;

  -- Delete Distributor type
  DELETE FROM dbo.CustomerType WHERE CustomerTypeID = @DistributorID;
END
GO
