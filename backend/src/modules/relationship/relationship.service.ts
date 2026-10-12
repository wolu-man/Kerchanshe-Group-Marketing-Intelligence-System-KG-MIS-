import sql from 'mssql';
import { db } from '../../db/pool';
import { NotFoundError, BadRequestError } from '../../utils/errors';

export interface RelationshipConfiguration {
  ConfigurationID: number;
  ParentEntity: string;
  ChildEntity: string;
  RelationshipType: string;
  IsActive: boolean;
  Required: boolean;
  DisplayOrder: number;
}

export interface RelationshipItem {
  ItemID: number;
  ConfigurationID: number;
  ParentEntityValue: string;  // format: 'EntityType:ID' e.g. 'BusinessGroup:1'
  ChildEntity: string;
  ChildEntityID: number;
  DisplayName?: string;
  DisplayOrder: number;
  IsActive: boolean;
}

/**
 * List all relationship configurations
 */
export async function listConfigurations(): Promise<RelationshipConfiguration[]> {
  const result = await db.request().query(
    `SELECT ConfigurationID, ParentEntity, ChildEntity, RelationshipType, IsActive, Required, DisplayOrder, CreatedAt, UpdatedAt
     FROM dbo.RelationshipConfiguration ORDER BY DisplayOrder, ParentEntity, ChildEntity`
  );
  return result.recordset;
}

/**
 * Get a single configuration by ID
 */
export async function getConfiguration(id: number): Promise<RelationshipConfiguration> {
  const result = await db.request()
    .input('Id', sql.Int, id)
    .query(`SELECT ConfigurationID, ParentEntity, ChildEntity, RelationshipType, IsActive, Required, DisplayOrder, CreatedAt, UpdatedAt
            FROM dbo.RelationshipConfiguration WHERE ConfigurationID = @Id`);

  if (result.recordset.length === 0) throw new NotFoundError('Relationship configuration not found');
  return result.recordset[0];
}

/**
 * Create a new relationship configuration
 */
export async function createConfiguration(data: {
  ParentEntity: string;
  ChildEntity: string;
  RelationshipType: string;
  IsActive?: boolean;
  Required?: boolean;
  DisplayOrder?: number;
}): Promise<RelationshipConfiguration> {
  const result = await db.request()
    .input('ParentEntity', sql.VarChar(100), data.ParentEntity.trim())
    .input('ChildEntity', sql.VarChar(100), data.ChildEntity.trim())
    .input('RelationshipType', sql.VarChar(20), data.RelationshipType.trim())
    .input('IsActive', sql.Bit, data.IsActive ?? true)
    .input('Required', sql.Bit, data.Required ?? true)
    .input('DisplayOrder', sql.Int, data.DisplayOrder ?? 0)
    .query(
      `INSERT INTO dbo.RelationshipConfiguration (ParentEntity, ChildEntity, RelationshipType, IsActive, Required, DisplayOrder)
       OUTPUT INSERTED.ConfigurationID, INSERTED.ParentEntity, INSERTED.ChildEntity, INSERTED.RelationshipType, INSERTED.IsActive, INSERTED.Required, INSERTED.DisplayOrder
       VALUES (@ParentEntity, @ChildEntity, @RelationshipType, @IsActive, @Required, @DisplayOrder)`
  );

  if (result.recordset.length === 0) throw new BadRequestError('Failed to create relationship configuration');
  return result.recordset[0];
}

/**
 * Update an existing relationship configuration
 */
export async function updateConfiguration(id: number, data: {
  ParentEntity?: string;
  ChildEntity?: string;
  RelationshipType?: string;
  IsActive?: boolean;
  Required?: boolean;
  DisplayOrder?: number;
}): Promise<void> {
  const request = db.request().input('Id', sql.Int, id);

  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.ParentEntity !== undefined) {
    sets.push('ParentEntity = @ParentEntity');
    request.input('ParentEntity', sql.VarChar(100), data.ParentEntity!.trim());
  }
  if (data.ChildEntity !== undefined) {
    sets.push('ChildEntity = @ChildEntity');
    request.input('ChildEntity', sql.VarChar(100), data.ChildEntity!.trim());
  }
  if (data.RelationshipType !== undefined) {
    sets.push('RelationshipType = @RelationshipType');
    request.input('RelationshipType', sql.VarChar(20), data.RelationshipType!.trim());
  }
  if (data.IsActive !== undefined) {
    sets.push('IsActive = @IsActive');
    request.input('IsActive', sql.Bit, data.IsActive);
  }
  if (data.Required !== undefined) {
    sets.push('Required = @Required');
    request.input('Required', sql.Bit, data.Required);
  }
  if (data.DisplayOrder !== undefined) {
    sets.push('DisplayOrder = @DisplayOrder');
    request.input('DisplayOrder', sql.Int, data.DisplayOrder!);
  }

  if (sets.length <= 1) return; // nothing to update

  await request.query(`UPDATE dbo.RelationshipConfiguration SET ${sets.join(', ')} WHERE ConfigurationID = @Id`);
}

/**
 * Delete a relationship configuration
 * Fails if dependent items exist
 */
export async function deleteConfiguration(id: number): Promise<void> {
  // Check for dependent items
  const check = await db.request()
    .input('Id', sql.Int, id)
    .query(`SELECT COUNT(*) AS Cnt FROM dbo.RelationshipItem WHERE ConfigurationID = @Id`);

  if (check.recordset[0].Cnt > 0) {
    throw new BadRequestError('Cannot delete: dependent relationship items exist', 'HAS_DEPENDENTS');
  }

  const result = await db.request()
    .input('Id', sql.Int, id)
    .query(`DELETE FROM dbo.RelationshipConfiguration WHERE ConfigurationID = @Id`);

  if (result.rowsAffected[0] === 0) throw new NotFoundError('Relationship configuration not found');
}

/**
 * List all relationship items for a configuration
 */
export async function listItems(configurationId: number): Promise<RelationshipItem[]> {
  const result = await db.request()
    .input('ConfigurationID', sql.Int, configurationId)
    .query(
      `SELECT ItemID, ConfigurationID, ParentEntityValue, ChildEntity, ChildEntityID, DisplayName, DisplayOrder, IsActive, CreatedAt, UpdatedAt
       FROM dbo.RelationshipItem WHERE ConfigurationID = @ConfigurationID ORDER BY DisplayOrder, ChildEntity`
  );
  return result.recordset;
}

/**
 * Create a new relationship item (maps a specific parent ID to child options)
 */
export async function createItem(data: {
  ConfigurationID: number;
  ParentEntityValue: string;  // e.g. 'BusinessGroup:1'
  ChildEntity: string;
  ChildEntityID: number;
  DisplayName?: string;
  DisplayOrder?: number;
}): Promise<RelationshipItem> {
  const result = await db.request()
    .input('ConfigurationID', sql.Int, data.ConfigurationID)
    .input('ParentEntityValue', sql.VarChar(100), data.ParentEntityValue)
    .input('ChildEntity', sql.VarChar(100), data.ChildEntity)
    .input('ChildEntityID', sql.Int, data.ChildEntityID)
    .input('DisplayName', sql.NVarChar(255), data.DisplayName ?? null)
    .input('DisplayOrder', sql.Int, data.DisplayOrder ?? 0)
    .query(
      `INSERT INTO dbo.RelationshipItem (ConfigurationID, ParentEntityValue, ChildEntity, ChildEntityID, DisplayName, DisplayOrder)
       OUTPUT INSERTED.ItemID, INSERTED.ConfigurationID, INSERTED.ParentEntityValue, INSERTED.ChildEntity, INSERTED.ChildEntityID, INSERTED.DisplayName, INSERTED.DisplayOrder, INSERTED.IsActive
       VALUES (@ConfigurationID, @ParentEntityValue, @ChildEntity, @ChildEntityID, @DisplayName, @DisplayOrder)`
  );

  if (result.recordset.length === 0) throw new BadRequestError('Failed to create relationship item');
  return result.recordset[0];
}

/**
 * Update a relationship item
 */
export async function updateItem(id: number, data: {
  ChildEntity?: string;
  ChildEntityID?: number;
  DisplayName?: string;
  DisplayOrder?: number;
  IsActive?: boolean;
}): Promise<void> {
  const request = db.request().input('Id', sql.Int, id);

  const sets: string[] = ['UpdatedAt = SYSUTCDATETIME()'];
  if (data.ChildEntity !== undefined) {
    sets.push('ChildEntity = @ChildEntity');
    request.input('ChildEntity', sql.VarChar(100), data.ChildEntity!);
  }
  if (data.ChildEntityID !== undefined) {
    sets.push('ChildEntityID = @ChildEntityID');
    request.input('ChildEntityID', sql.Int, data.ChildEntityID!);
  }
  if (data.DisplayName !== undefined) {
    sets.push('DisplayName = @DisplayName');
    request.input('DisplayName', sql.NVarChar(255), data.DisplayName!);
  }
  if (data.DisplayOrder !== undefined) {
    sets.push('DisplayOrder = @DisplayOrder');
    request.input('DisplayOrder', sql.Int, data.DisplayOrder!);
  }
  if (data.IsActive !== undefined) {
    sets.push('IsActive = @IsActive');
    request.input('IsActive', sql.Bit, data.IsActive);
  }

  if (sets.length <= 1) return;
  await request.query(`UPDATE dbo.RelationshipItem SET ${sets.join(', ')} WHERE ItemID = @Id`);
}

/**
 * Delete a relationship item
 */
export async function deleteItem(id: number): Promise<void> {
  const result = await db.request()
    .input('Id', sql.Int, id)
    .query(`DELETE FROM dbo.RelationshipItem WHERE ItemID = @Id`);

  if (result.rowsAffected[0] === 0) throw new NotFoundError('Relationship item not found');
}

/**
 * Resolve dependent options for a given parent entity and parent ID
 * Used by frontend dropdowns to fetch filtered child options
 */
export async function resolveDependentOptions(parentEntity: string, parentId: number): Promise<{ label: string; value: number; entity: string; configurationId: number }[]> {
  if (!parentEntity || parentId === undefined) throw new BadRequestError('parentEntity and parentId required');

  // 1. Find all configurations where ParentEntity matches
  const configs = await db.request()
    .input('ParentEntity', sql.VarChar(100), parentEntity)
    .query(`SELECT ConfigurationID FROM dbo.RelationshipConfiguration WHERE ParentEntity = @ParentEntity AND IsActive = 1`);

  const allOptions: any[] = [];

  // 2. For each config, get items matching the parent value format 'EntityType:ID'
  for (const config of configs.recordset) {
    const parentValue = `${parentEntity}:${parentId}`;
    const items = await db.request()
      .input('ConfigurationID', sql.Int, config.ConfigurationID)
      .input('ParentValue', sql.VarChar(100), parentValue)
      .query(`SELECT ChildEntityID AS ID, DisplayName FROM dbo.RelationshipItem WHERE ConfigurationID = @ConfigurationID AND ParentEntityValue = @ParentValue AND IsActive = 1 ORDER BY DisplayOrder`);

    for (const item of items.recordset) {
      allOptions.push({
        label: item.DisplayName || `${item.ChildEntity} #${item.ID}`,
        value: item.ID,
        entity: item.ChildEntity,
        configurationId: config.ConfigurationID
      });
    }
  }

  return allOptions;
}

/**
 * Validate a parent/child combination
 * Returns { valid: boolean; reason?: string }
 */
export async function validateParentChild(
  parentEntity: string,
  parentId: number,
  childEntity: string,
  childId: number
): Promise<{ valid: boolean; reason?: string }> {
  if (!parentEntity || parentId === undefined || !childEntity || childId === undefined) {
    throw new BadRequestError('parentEntity, parentId, childEntity, childId required');
  }

  // Check if there's a configured relationship linking parentEntity → childEntity
  const config = await db.request()
    .input('ParentEntity', sql.VarChar(100), parentEntity)
    .input('ChildEntity', sql.VarChar(100), childEntity)
    .query(`SELECT ConfigurationID FROM dbo.RelationshipConfiguration WHERE ParentEntity = @ParentEntity AND ChildEntity = @ChildEntity AND IsActive = 1`);

  if (config.recordset.length === 0) {
    return { valid: false, reason: 'No configured relationship between these entities' };
  }

  // Check if the specific parentId → childId combination exists in RelationshipItem
  const parentValue = `${parentEntity}:${parentId}`;
  const item = await db.request()
    .input('ParentEntityValue', sql.VarChar(100), parentValue)
    .input('ChildEntityID', sql.Int, childId)
    .input('ChildEntity', sql.VarChar(100), childEntity)
    .query(`SELECT COUNT(*) AS Cnt FROM dbo.RelationshipItem WHERE ParentEntityValue = @ParentEntityValue AND ChildEntity = @ChildEntity AND ChildEntityID = @ChildEntityID AND IsActive = 1`);

  return { valid: item.recordset[0].Cnt > 0 };
}