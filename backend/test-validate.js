const sql = require('mssql');
const fs = require('fs');

// Replicate the backend validateSchemaEnvelope logic
function normalizeGroup(cond) {
  if (!cond) return undefined;
  if ('rules' in cond && Array.isArray(cond.rules)) return cond;
  return { operator: 'and', rules: [cond] };
}

const FIELD_TYPES = [
  'shorttext', 'longtext', 'number', 'email', 'phone', 'date', 'time',
  'datetime', 'dropdown', 'multiplechoice', 'rating', 'yesno', 'file',
  'image', 'signature', 'slider', 'location', 'matrix', 'richtext',
  'calculated', 'prefill', 'section', 'instructions',
  'heading', 'content-image', 'divider', 'spacer', 'button', 'quote', 'container',
];

function formulaReferences(formula) {
  return [...new Set((formula.match(/[a-z0-9_]+/gi) || []).filter(t => !['if','then','else','and','or','not','true','false'].includes(t)))];
}

function validateSchemaEnvelope(schema) {
  const errors = [];
  const elements = schema.elements;
  const keys = new Set(elements.map((e) => e.key));
  const seen = new Set();
  const order = {};
  const pageIds = new Set(schema.pages.map((p) => p.id));

  if (!Array.isArray(schema.pages) || schema.pages.length === 0) {
    errors.push('Form must define at least one page');
  }
  if (schema.branding) {
    const b = schema.branding;
    if (b.primaryColor !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(b.primaryColor)) errors.push('Branding primaryColor must be a hex color');
    if (b.secondaryColor !== undefined && !/^#[0-9a-fA-F]{3,8}$/.test(b.secondaryColor)) errors.push('Branding secondaryColor must be a hex color');
  }

  const deps = {};
  const orderedKeys = [];

  elements.forEach((e, i) => {
    if (!e.key) errors.push(`Element at position ${i + 1} is missing a key`);
    if (seen.has(e.key)) errors.push(`Duplicate field key: ${e.key}`);
    seen.add(e.key);
    orderedKeys.push(e.key);
    order[e.key] = i;
    if (!FIELD_TYPES.includes(e.type)) errors.push(`Field "${e.key}" has unknown type "${e.type}"`);
    if (e.pageId !== undefined && !pageIds.has(e.pageId)) {
      errors.push(`Field "${e.key}" references unknown page "${e.pageId}"`);
    }
    for (const cond of [e.conditional, e.displayWhen]) {
      if (cond) {
        for (const rule of (normalizeGroup(cond)?.rules ?? [])) {
          if (rule && rule.fieldKey && !keys.has(rule.fieldKey)) {
            errors.push(`Field "${e.key}" conditional references unknown field "${rule.fieldKey}"`);
          }
        }
      }
    }
    if (e.branching) {
      const group = normalizeGroup(e.branching.condition);
      for (const rule of (group?.rules ?? [])) {
        if (rule && rule.fieldKey && !keys.has(rule.fieldKey)) {
          errors.push(`Field "${e.key}" branching references unknown field "${rule.fieldKey}"`);
        }
      }
      if (e.branching.jumpTo && !keys.has(e.branching.jumpTo)) {
        errors.push(`Field "${e.key}" branches to unknown field "${e.branching.jumpTo}"`);
      }
      if (e.branching.jumpTo && order[e.branching.jumpTo] !== undefined && order[e.branching.jumpTo] <= i) {
        errors.push(`Field "${e.key}" branches backwards to "${e.branching.jumpTo}" (circular paths not allowed)`);
      }
    }
    if (e.type === 'matrix') {
      if (!e.matrixRows || e.matrixRows.length === 0) errors.push(`Matrix field "${e.key}" must define rows`);
      if (!e.matrixColumns || e.matrixColumns.length === 0) errors.push(`Matrix field "${e.key}" must define columns`);
    }
    if (e.type === 'calculated') {
      if (!e.formula) errors.push(`Calculated field "${e.key}" must define a formula`);
      else {
        try {
          const refs = formulaReferences(e.formula);
          deps[e.key] = refs;
        } catch (err) {
          errors.push(`Calculated field "${e.key}" has an invalid formula: ${err.message}`);
        }
      }
    }
    if (e.type === 'prefill' && e.prefillSource && !['name', 'email', 'static'].includes(e.prefillSource)) {
      errors.push(`Prefill field "${e.key}" has an invalid prefillSource`);
    }
  });

  return errors;
}

async function main() {
  const pool = await sql.connect({
    server: '127.0.0.1',
    port: 50404,
    database: 'KG_MIS',
    user: 'kgmis_user',
    password: 'KgMis!2026Dev',
    options: { encrypt: false, trustServerCertificate: true }
  });
  
  // Get the real schema (version 273 which has the actual survey)
  const result = await pool.request().query('SELECT SchemaJSON FROM dbo.FormVersion WHERE VersionID = 4386');
  const schema = JSON.parse(result.recordset[0].SchemaJSON);
  console.log('Elements:', schema.elements.length);
  console.log('Pages:', schema.pages.length);
  
  // Validate
  const errors = validateSchemaEnvelope(schema);
  if (errors.length > 0) {
    console.log('VALIDATION ERRORS:');
    errors.forEach(e => console.log('  -', e));
  } else {
    console.log('Schema validation PASSED');
  }
  
  // Also try the version as it would be sent by the frontend (wrapped in { schema: ... })
  const envelope = {
    schemaVersion: schema.schemaVersion ?? 2,
    pages: schema.pages && schema.pages.length > 0 ? schema.pages : [{ id: 'page-1', title: 'Page 1' }],
    elements: schema.elements,
    branding: schema.branding,
  };
  const errors2 = validateSchemaEnvelope(envelope);
  if (errors2.length > 0) {
    console.log('ENVELOPE VALIDATION ERRORS:');
    errors2.forEach(e => console.log('  -', e));
  } else {
    console.log('Envelope validation PASSED');
  }
  
  await pool.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
