import { z } from 'zod';

/** Schema for creating/updating a RelationshipConfiguration */
export const relationshipConfigSchema = z.object({
  ConfigurationID: z.number().int().positive().optional(),
  ParentEntity: z.string().min(1).max(100),
  ChildEntity: z.string().min(1).max(100),
  RelationshipType: z.string().min(1).max(20),
  IsActive: z.boolean().default(true),
  Required: z.boolean().default(true),
  DisplayOrder: z.number().int().default(0),
});

/** Schema for creating/updating a RelationshipItem */
export const relationshipItemSchema = z.object({
  ItemID: z.number().int().positive().optional(),
  ConfigurationID: z.number().int().positive(),
  ParentEntityValue: z.string().min(1).max(100),
  ChildEntity: z.string().min(1).max(100),
  ChildEntityID: z.number().int().positive(),
  DisplayName: z.string().max(255).optional(),
  DisplayOrder: z.number().int().default(0),
});

/** Schema for resolving dependent options (query params) */
export const resolveOptionsSchema = z.object({
  parentEntity: z.string().min(1),
  parentId: z.number().int().positive(),
});

/** Schema for validating a parent/child combination */
export const validateParentChildSchema = z.object({
  parentEntity: z.string().min(1),
  parentId: z.number().int().positive(),
  childEntity: z.string().min(1),
  childId: z.number().int().positive(),
});