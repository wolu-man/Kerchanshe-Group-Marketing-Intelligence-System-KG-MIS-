// =============================================================================
// Unit tests for AI Renewal feature.
// Run with: npx tsx src/modules/ai/ai-renewal.test.ts
// =============================================================================

import { DotEnvConfigStore } from '../../config/config-store';
import { AI_CONFIG_KEYS } from '../../config/config-store';
import fs from 'fs';
import path from 'path';
import os from 'os';

// --- Minimal test runner ---
let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

async function assertAsync(promise: Promise<boolean>, message: string): Promise<void> {
  try {
    const result = await promise;
    assert(result, message);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${message} — ${(err as Error).message}`);
  }
}

async function describe(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n${name}:`);
  try {
    await fn();
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name} setup failed — ${(err as Error).message}`);
  }
}

async function runTests(): Promise<void> {
  // --- Tests ---

  await describe('DotEnvConfigStore', async () => {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kgmis-test-'));
    const testEnvPath = path.join(testDir, '.env');

    const store = new DotEnvConfigStore();
    (store as any).envPath = testEnvPath;

    const testKey = 'TEST_API_KEY';
    const testValue = 'test-value-123';
    const testValue2 = 'updated-value-456';

    const cleanup = () => {
      try { fs.unlinkSync(testEnvPath); } catch {}
      try { fs.rmdirSync(testDir); } catch {}
    };

    await assertAsync(
      (async () => {
        const result = await store.get(testKey);
        return result === null;
      })(),
      'get returns null for non-existent key'
    );

    await assertAsync(
      (async () => {
        await store.set(testKey, testValue);
        const result = await store.get(testKey);
        return result === testValue;
      })(),
      'set and get works'
    );

    await assertAsync(
      (async () => {
        await store.set(testKey, testValue2);
        const result = await store.get(testKey);
        return result === testValue2;
      })(),
      'overwrite existing key works'
    );

    await assertAsync(
      (async () => {
        await store.set('OTHER_KEY', 'other-value');
        const all = await store.getAll();
        return all[testKey] === testValue2 && all['OTHER_KEY'] === 'other-value';
      })(),
      'preserves other keys'
    );

    await assertAsync(
      (async () => {
        const testDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'kgmis-test2-'));
        const testEnvPath2 = path.join(testDir2, '.env');
        fs.writeFileSync(testEnvPath2, '# Comment line\nEXISTING_KEY=existing-value\n# Another comment\n');

        const store2 = new DotEnvConfigStore();
        (store2 as any).envPath = testEnvPath2;

        await store2.set('NEW_KEY', 'new-value');

        const content = fs.readFileSync(testEnvPath2, 'utf8');
        const hasComment = content.includes('# Comment line');
        const hasExisting = content.includes('EXISTING_KEY=existing-value');
        const hasNew = content.includes('NEW_KEY=new-value');

        try { fs.unlinkSync(testEnvPath2); } catch {}
        try { fs.rmdirSync(testDir2); } catch {}

        return hasComment && hasExisting && hasNew;
      })(),
      'preserves comments and formatting'
    );

    cleanup();
  });

  await describe('AI_CONFIG_KEYS', async () => {
    assert(
      AI_CONFIG_KEYS.GEMINI_API_KEY === 'GEMINI_API_KEY',
      'GEMINI_API_KEY constant correct'
    );
    assert(
      AI_CONFIG_KEYS.GROQ_API_KEY === 'GROQ_API_KEY',
      'GROQ_API_KEY constant correct'
    );
    assert(
      AI_CONFIG_KEYS.ROTATION_ENABLED === 'ai.rotation.enabled',
      'ROTATION_ENABLED constant correct'
    );
    assert(
      AI_CONFIG_KEYS.ROTATION_INTERVAL_DAYS === 'ai.rotation.intervalDays',
      'ROTATION_INTERVAL_DAYS constant correct'
    );
    assert(
      AI_CONFIG_KEYS.ROTATION_NEXT_RUN === 'ai.rotation.nextRun',
      'ROTATION_NEXT_RUN constant correct'
    );
    assert(
      AI_CONFIG_KEYS.ROTATION_PROVIDER === 'ai.rotation.provider',
      'ROTATION_PROVIDER constant correct'
    );
    assert(
      AI_CONFIG_KEYS.ROTATION_DUE === 'ai.rotation.due',
      'ROTATION_DUE constant correct'
    );
  });

  await describe('Config key validation', async () => {
    const RENEWABLE_PROVIDERS = ['gemini', 'groq'];

    assert(
      RENEWABLE_PROVIDERS.includes('gemini'),
      'gemini is renewable'
    );
    assert(
      RENEWABLE_PROVIDERS.includes('groq'),
      'groq is renewable'
    );
    assert(
      !RENEWABLE_PROVIDERS.includes('ollama'),
      'ollama is not renewable (no API key)'
    );
    assert(
      !RENEWABLE_PROVIDERS.includes('invalid'),
      'invalid provider is not renewable'
    );
  });

  await describe('AIProvider.status({ probeKey })', async () => {
    const { GeminiProvider } = await import('./providers/gemini');
    const { GroqProvider } = await import('./providers/groq');
    const { env } = await import('../../config/env');

    const geminiModel = env.ai.gemini.model || 'gemini-flash-latest';
    const groqModel = env.ai.groq.model || 'llama-3.3-70b-versatile';

    const originalFetch = globalThis.fetch;
    let lastUrl = '';
    let lastInit: RequestInit | undefined;

    const stubFetch = (status: number, bodyJson: unknown): void => {
      globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
        lastUrl = String(url);
        lastInit = init;
        return {
          ok: status >= 200 && status < 300,
          status,
          text: async () => JSON.stringify(bodyJson),
        } as unknown as Response;
      }) as typeof fetch;
    };

    try {
      stubFetch(200, {
        models: [{ name: `models/${geminiModel}`, supportedGenerationMethods: ['generateContent'] }],
      });
      const ok = await new GeminiProvider().status({ probeKey: 'submitted-gemini-key' });
      assert(ok.available === true, 'gemini: valid probeKey → available=true');
      assert(lastUrl.includes('submitted-gemini-key'), 'gemini: submitted key is used in the probe request');

      stubFetch(401, { error: { message: 'API key not valid. Please pass a valid API key.' } });
      const bad = await new GeminiProvider().status({ probeKey: 'bad-key' });
      assert(bad.available === false, 'gemini: 401 probeKey → available=false');
      assert(
        (bad.detail ?? '').toLowerCase().includes('rejected'),
        'gemini: 401 probeKey → rejected message'
      );

      stubFetch(200, { data: [{ id: groqModel }] });
      const gOk = await new GroqProvider().status({ probeKey: 'submitted-groq-key' });
      assert(gOk.available === true, 'groq: valid probeKey → available=true');
      const authHeader = ((lastInit?.headers as Record<string, string> | undefined) ?? {})['Authorization'];
      assert(
        authHeader === 'Bearer submitted-groq-key',
        'groq: submitted key is used in the Authorization header'
      );

      stubFetch(401, { error: { message: 'Invalid API Key' } });
      const gBad = await new GroqProvider().status({ probeKey: 'bad-key' });
      assert(gBad.available === false, 'groq: 401 probeKey → available=false');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- Summary ---
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

runTests();