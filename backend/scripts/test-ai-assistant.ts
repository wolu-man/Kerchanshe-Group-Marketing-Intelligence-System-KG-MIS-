// =============================================================================
// AI Form Assistant — verification script (this repo has no test framework).
//
//   npx tsx scripts/test-ai-assistant.ts            action layer + provider status
//   npx tsx scripts/test-ai-assistant.ts --live     also makes one real model call
//
// Sections A/B never touch the database. Section C (live) is opt-in via --live.
// =============================================================================

import {
  applyFormActions,
  buildPreview,
  flattenActions,
  modelResponseSchema,
  requiresConfirmation,
  type FormAction,
  type SchemaEnvelope,
} from '../src/modules/ai/actions';
import { buildFormContext, buildSystemPrompt, FORM_TOOL } from '../src/modules/ai/systemPrompt';
import { providerStatuses, ProviderError } from '../src/modules/ai/providers';

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------
let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`  FAIL ${name} — ${message}`);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

async function checkAsync(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${message}`);
    console.log(`  FAIL ${name} — ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
function sampleSchema(): SchemaEnvelope {
  return {
    schemaVersion: 2,
    pages: [
      { id: 'page-1', title: 'About you' },
      { id: 'page-2', title: 'Feedback' },
    ],
    elements: [
      { key: 'q_name', type: 'shorttext', label: 'Full name', required: true, order: 0, pageId: 'page-1', maxLength: 255 },
      { key: 'q_email', type: 'email', label: 'Email address', required: true, order: 1, pageId: 'page-1' },
      {
        key: 'q_rating',
        type: 'dropdown',
        label: 'Overall satisfaction',
        required: false,
        order: 2,
        pageId: 'page-1',
        options: ['Good', 'Average', 'Poor'],
      },
      { key: 'sec_comments', type: 'section', label: 'Comments', required: false, order: 3, pageId: 'page-2' },
      {
        key: 'q_comment',
        type: 'longtext',
        label: 'Anything else?',
        required: false,
        order: 4,
        pageId: 'page-2',
        displayWhen: { fieldKey: 'q_rating', operator: 'neq', value: 'Poor' },
      },
    ],
  };
}

function firstKey(result: ReturnType<typeof applyFormActions>, predicate: (el: { key: string; type: string }) => boolean): string {
  const el = result.schema.elements.find(predicate);
  assert(el, 'expected an element to exist');
  return el!.key;
}

// ---------------------------------------------------------------------------
// A. Action layer
// ---------------------------------------------------------------------------
function sectionA(): void {
  console.log('\nA. Action layer (validation, application, rollback, preview)');

  check('ADD_FIELD inserts a field with an ai_ prefixed key', () => {
    const result = applyFormActions(sampleSchema(), [
      { type: 'ADD_FIELD', field: { type: 'email', label: 'Work email', pageId: 'page-1', afterKey: 'q_email' } },
    ]);
    assert(result.rejected.length === 0, 'action was rejected');
    const key = firstKey(result, (el) => el.label === 'Work email');
    assert(key.startsWith('ai_'), `expected ai_ prefix, got "${key}"`);
    const index = result.schema.elements.findIndex((e) => e.key === key);
    const anchor = result.schema.elements.findIndex((e) => e.key === 'q_email');
    equal(index, anchor + 1, 'field should follow afterKey');
    equal(result.schema.elements[index].order, index, 'order must be reindexed');
  });

  check('unknown field key is rejected and leaves the schema untouched', () => {
    const before = sampleSchema();
    const result = applyFormActions(before, [
      { type: 'UPDATE_FIELD', fieldKey: 'does_not_exist', patch: { label: 'Nope' } },
    ]);
    equal(result.rejected.length, 1, 'one action should be rejected');
    assert(/Unknown field/.test(result.rejected[0].reason), `unexpected reason: ${result.rejected[0].reason}`);
    equal(result.applied.length, 0, 'nothing should be applied');
    equal(result.schema.elements.length, before.elements.length, 'schema unchanged');
  });

  check('invalid validation range is rejected', () => {
    const result = applyFormActions(sampleSchema(), [
      { type: 'SET_VALIDATION', fieldKey: 'q_name', validation: { minLength: 50, maxLength: 10 } },
    ]);
    assert(result.rejected.length === 1, 'should be rejected');
    assert(/greater than/.test(result.rejected[0].reason), result.rejected[0].reason);

    const numeric = applyFormActions(sampleSchema(), [
      { type: 'SET_VALIDATION', fieldKey: 'q_name', validation: { min: 10, max: 1 } },
    ]);
    assert(numeric.rejected.length === 1, 'min > max should be rejected');
    assert(/min cannot be greater than max/.test(numeric.rejected[0].reason), numeric.rejected[0].reason);
  });

  check('choice field without options falls back to defaults, empty options rejected', () => {
    const ok = applyFormActions(sampleSchema(), [
      { type: 'ADD_FIELD', field: { type: 'dropdown', label: 'Plan tier' } },
    ]);
    assert(ok.rejected.length === 0, ok.rejected[0]?.reason ?? 'rejected');
    const key = firstKey(ok, (el) => el.label === 'Plan tier');
    const created = ok.schema.elements.find((e) => e.key === key)!;
    assert(Array.isArray(created.options) && created.options.length > 0, 'options should be defaulted');

    const bad = applyFormActions(sampleSchema(), [
      { type: 'UPDATE_FIELD', fieldKey: 'q_rating', patch: { options: [] } },
    ]);
    assert(bad.rejected.length === 1, 'empty options must be rejected');
  });

  check('DELETE_FIELD strips conditions that referenced it and warns', () => {
    const result = applyFormActions(sampleSchema(), [{ type: 'DELETE_FIELD', fieldKey: 'q_rating' }]);
    assert(result.rejected.length === 0, result.rejected[0]?.reason ?? 'rejected');
    const comment = result.schema.elements.find((e) => e.key === 'q_comment')!;
    assert(comment.displayWhen === undefined, 'displayWhen should have been stripped');
    assert(
      result.warnings.some((w) => /condition reference/.test(w)),
      `expected a warning, got ${JSON.stringify(result.warnings)}`
    );
  });

  check('IMPROVE_FORM flattens and applies its children', () => {
    const action: FormAction = {
      type: 'IMPROVE_FORM',
      rationale: 'Tighten the survey',
      actions: [
        { type: 'SET_REQUIRED', fieldKeys: ['q_comment'], required: true },
        { type: 'UPDATE_FIELD', fieldKey: 'q_rating', patch: { label: 'How satisfied are you?' } },
      ],
    };
    const flat = flattenActions([action]);
    equal(flat.length, 2, 'flattened count');
    const result = applyFormActions(sampleSchema(), [action]);
    equal(result.rejected.length, 0, 'no rejections');
    assert(
      result.schema.elements.find((e) => e.key === 'q_comment')!.required === true,
      'required flag applied'
    );
    assert(
      result.schema.elements.find((e) => e.key === 'q_rating')!.label === 'How satisfied are you?',
      'label applied'
    );
  });

  check('branching condition references a forward field only', () => {
    const result = applyFormActions(sampleSchema(), [
      {
        type: 'ADD_CONDITION',
        fieldKey: 'q_rating',
        kind: 'branching',
        condition: { fieldKey: 'q_name', operator: 'empty' },
        jumpTo: 'q_comment',
      },
    ]);
    assert(result.rejected.length === 0, result.rejected[0]?.reason ?? 'rejected');
    const el = result.schema.elements.find((e) => e.key === 'q_rating')!;
    assert(el.branching?.jumpTo === 'q_comment', 'branching jump target set');
  });

  check('a condition may not reference the field it is attached to', () => {
    const result = applyFormActions(sampleSchema(), [
      {
        type: 'ADD_CONDITION',
        fieldKey: 'q_rating',
        kind: 'displayWhen',
        condition: { fieldKey: 'q_rating', operator: 'eq', value: 'Poor' },
      },
    ]);
    assert(result.rejected.length === 1, 'self-reference must be rejected');
    assert(/cannot reference itself/.test(result.rejected[0].reason), result.rejected[0].reason);
  });

  check('backward branching is rejected by envelope validation', () => {
    const result = applyFormActions(sampleSchema(), [
      {
        type: 'ADD_CONDITION',
        fieldKey: 'q_comment',
        kind: 'branching',
        condition: { fieldKey: 'q_comment', operator: 'eq', value: 'x' },
        jumpTo: 'q_name',
      },
    ]);
    assert(result.rejected.length === 1, 'backward branch must be rejected');
  });

  check('DB actions are separated from schema actions', () => {
    const result = applyFormActions(sampleSchema(), [
      { type: 'CREATE_CHILD_FORM', title: 'Follow-up interview' },
      { type: 'ADD_FIELD', field: { type: 'phone', label: 'Phone number' } },
    ]);
    equal(result.dbActions.length, 1, 'one db action');
    equal(result.applied.length, 2, 'both accepted');
    assert(
      result.schema.elements.some((e) => e.type === 'phone'),
      'phone field should be applied to schema'
    );
  });

  check('CREATE_FORM rebuilds the form and keeps page references valid', () => {
    const result = applyFormActions(sampleSchema(), [
      {
        type: 'CREATE_FORM',
        title: 'Post-event survey',
        pages: [{ id: 'p1', title: 'Questions' }],
        elements: [
          { type: 'shorttext', label: 'Which event did you attend?' },
          { type: 'rating', label: 'How would you rate it?', pageId: 'p1' },
        ],
      },
    ]);
    assert(result.rejected.length === 0, result.rejected[0]?.reason ?? 'rejected');
    equal(result.schema.pages.length, 1, 'single page');
    equal(result.schema.elements.length, 2, 'two elements');
    assert(
      result.schema.elements.every((e) => e.pageId === 'p1'),
      'elements assigned to the created page'
    );
  });

  check('preview lines are produced for additions, deletions and logic', () => {
    const before = sampleSchema();
    const actions: FormAction[] = [
      { type: 'ADD_FIELD', field: { type: 'email', label: 'Contact email' } },
      { type: 'DELETE_FIELD', fieldKey: 'q_comment' },
      {
        type: 'ADD_CONDITION',
        fieldKey: 'q_rating',
        kind: 'displayWhen',
        condition: { fieldKey: 'q_name', operator: 'empty' },
      },
    ];
    const result = applyFormActions(before, actions);
    const preview = buildPreview(before, result.schema, actions, result.rejected);
    assert(preview.some((l) => l.kind === 'add' && /Contact email/.test(l.text)), 'add line');
    assert(preview.some((l) => l.kind === 'delete' && /Anything else/.test(l.text)), 'delete line');
    assert(preview.some((l) => l.kind === 'logic' && /only when/.test(l.text)), 'logic line');

    const rejectedPreview = buildPreview(before, before, [], [
      { index: 0, type: 'DELETE_FIELD', reason: 'Unknown field "nope"' },
    ]);
    assert(
      rejectedPreview.some((l) => l.kind === 'delete' && /^✕ Rejected DELETE_FIELD/.test(l.text)),
      'rejected line'
    );
  });

  check('requiresConfirmation flags destructive, multi-step and failed actions', () => {
    const oneAdd: FormAction[] = [{ type: 'ADD_FIELD', field: { type: 'email', label: 'A' } }];
    equal(requiresConfirmation(oneAdd, [], []), false, 'single safe action');

    const destructive: FormAction[] = [{ type: 'DELETE_FIELD', fieldKey: 'q_name' }];
    equal(requiresConfirmation(destructive, [], []), true, 'destructive action');

    const multi: FormAction[] = [
      { type: 'ADD_FIELD', field: { type: 'email', label: 'A' } },
      { type: 'ADD_FIELD', field: { type: 'email', label: 'B' } },
    ];
    equal(requiresConfirmation(multi, [], []), true, 'multi-step action');

    equal(
      requiresConfirmation(oneAdd, [{ index: 0, type: 'ADD_FIELD', reason: 'x' }], []),
      true,
      'rejected action forces confirmation'
    );
    equal(requiresConfirmation(oneAdd, [], ['note']), true, 'warnings force confirmation');
    equal(
      requiresConfirmation([{ type: 'ANALYZE_FORM', summary: 'Looks good' }], [], []),
      false,
      'analysis-only turn'
    );
  });

  check('branding is never modified by actions', () => {
    const before = sampleSchema();
    before.branding = { primaryColor: '#123456' };
    const result = applyFormActions(before, [
      { type: 'ADD_FIELD', field: { type: 'email', label: 'Contact' } },
    ]);
    equal(result.schema.branding?.primaryColor, '#123456', 'branding preserved');
  });

  check('modelResponseSchema rejects unknown action types and extra nesting', () => {
    const bad = modelResponseSchema.safeParse({
      reply: 'hi',
      actions: [{ type: 'EXECUTE_SQL', query: 'DROP TABLE x' }],
    });
    assert(!bad.success, 'unknown action type must be rejected');

    const good = modelResponseSchema.safeParse({
      reply: 'Added a field',
      actions: [{ type: 'ADD_FIELD', field: { type: 'email', label: 'Contact email' } }],
    });
    assert(good.success, good.success ? '' : JSON.stringify(good.error.issues[0]));
    assert(good.success && good.data.actions.length === 1, 'action parsed');

    const stripped = modelResponseSchema.safeParse({
      reply: 'ok',
      actions: [{ type: 'ADD_FIELD', field: { type: 'email', label: 'Contact', evil: 'payload' } }],
    });
    assert(stripped.success, 'valid action');
    if (stripped.success) {
      const field = (stripped.data.actions[0] as { field: Record<string, unknown> }).field;
      assert(!('evil' in field), 'unknown properties must be stripped');
    }
  });
}

// ---------------------------------------------------------------------------
// B. Prompt / context
// ---------------------------------------------------------------------------
function sectionB(): void {
  console.log('\nB. System prompt and form context');

  const system = buildSystemPrompt();

  check('system prompt forbids code, SQL and out-of-scope changes', () => {
    assert(/NEVER output executable code/.test(system), 'code ban missing');
    assert(/SQL/.test(system), 'SQL ban missing');
    assert(/preserve existing form functionality/.test(system), 'preservation rule missing');
    assert(/clarification only when/.test(system), 'clarification rule missing');
    assert(/destructive/i.test(system), 'destructive-change rule missing');
    assert(!/\bSELECT\b\s+\*/i.test(system), 'prompt must not contain a runnable query');
  });

  check('system prompt lists every field type and operator', () => {
    const types = ['shorttext', 'dropdown', 'matrix', 'signature', 'container', 'section'];
    for (const t of types) assert(system.includes(t), `missing field type ${t}`);
    for (const op of ['eq', 'neq', 'gte', 'contains', 'not-empty']) assert(system.includes(op), `missing operator ${op}`);
  });

  check('tool spec exposes every action type and requires reply+actions', () => {
    equal(FORM_TOOL.name, 'propose_form_changes', 'tool name');
    const params = FORM_TOOL.parameters as {
      required: string[];
      properties: { actions: { items: { properties: { type: { enum: string[] } } } } };
    };
    assert(params.required.includes('reply') && params.required.includes('actions'), 'required keys');
    const kinds = params.properties.actions.items.properties.type.enum;
    for (const expected of ['ADD_FIELD', 'DELETE_FIELD', 'ANALYZE_FORM', 'CREATE_CHILD_FORM']) {
      assert(kinds.includes(expected), `missing action type ${expected}`);
    }
    assert(kinds.length >= 20, `expected >= 20 action types, got ${kinds.length}`);
  });

  check('form context serialises pages, elements and conditions', () => {
    const ctx = buildFormContext({
      form: { id: 42, title: 'Customer feedback' },
      schema: sampleSchema(),
      intent: 'modify',
    });
    assert(ctx.includes('Form ID: 42'), 'form id');
    assert(ctx.includes('page-2 "Feedback"'), 'page list');
    assert(ctx.includes('key=q_rating'), 'element list');
    assert(ctx.includes('options=['), 'options');
    assert(ctx.includes('displayWhen='), 'condition');
    assert(ctx.includes('Requested operation: modify'), 'intent');
    assert(!/password|secret/i.test(ctx), 'no secrets in context');
  });

  check('context describes an empty form without crashing', () => {
    const ctx = buildFormContext({
      schema: { schemaVersion: 2, pages: [{ id: 'page-1', title: 'Page 1' }], elements: [] },
      intent: 'generate',
    });
    assert(ctx.includes('the form is empty'), 'empty marker');
  });
}

// ---------------------------------------------------------------------------
// C. Provider status (+ optional live call)
// ---------------------------------------------------------------------------
async function sectionC(live: boolean): Promise<void> {
  console.log('\nC. Providers');
  const statuses = await providerStatuses();

  check('status covers all three providers without leaking secrets', () => {
    equal(statuses.length, 3, 'provider count');
    const ids = statuses.map((s) => s.id).sort();
    equal(ids, ['gemini', 'groq', 'ollama'], 'provider ids');
    for (const s of statuses) {
      const blob = JSON.stringify(s);
      assert(!/api[_-]?key/i.test(blob), `${s.id} status mentions a key name`);
      assert(!/Bearer /.test(blob), `${s.id} status contains an Authorization header`);
    }
  });

  for (const s of statuses) {
    console.log(
      `  · ${s.id.padEnd(7)} configured=${String(s.configured).padEnd(5)} available=${String(s.available).padEnd(5)} model=${s.model ?? '-'}${s.detail ? ` — ${s.detail}` : ''}`
    );
  }

  if (!live) {
    console.log('  (run with --live to make one real model call)');
    return;
  }

  console.log('\nD. Live model call');
  const { orchestrate } = await import('../src/modules/ai/orchestrator');

  const available = statuses.find((s) => s.available);
  if (!available) {
    console.log('  SKIP no provider available (start Ollama or add an API key)');
    return;
  }

  await checkAsync('live call returns a validated reply + actions', async () => {
    const result = await orchestrate({
      provider: 'auto',
      intent: 'modify',
      messages: [
        {
          role: 'user',
          content: `${buildFormContext({ schema: sampleSchema(), intent: 'modify' })}\n---\nUSER REQUEST (mode: preview):\nAdd a required phone number field after the email address.`,
        },
      ],
      timeoutMs: 60_000,
    });
    console.log(`  · provider=${result.provider} model=${result.model} ${result.durationMs}ms`);
    console.log(`  · reply: ${result.response.reply.slice(0, 200)}`);
    console.log(`  · actions: ${JSON.stringify(result.response.actions).slice(0, 400)}`);
    assert(result.response.actions.length > 0, 'expected at least one action');
    const applied = applyFormActions(sampleSchema(), result.response.actions);
    assert(applied.rejected.length === 0, `model actions rejected: ${JSON.stringify(applied.rejected)}`);
    assert(
      applied.schema.elements.some((e) => e.type === 'phone'),
      'expected a phone field in the result'
    );
  });
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const live = process.argv.includes('--live');
  sectionA();
  sectionB();
  await sectionC(live);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof ProviderError ? `[${err.category}] ${err.message}` : err);
  process.exitCode = 1;
});
