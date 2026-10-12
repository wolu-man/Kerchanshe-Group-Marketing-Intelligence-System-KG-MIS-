/**
 * Tender Sources Seed Script
 * Creates (or refreshes) the configured tender sources in dbo.TenderSource:
 *   1. e-GP Ethiopia public sourcing API
 *   2. 2merkato free section
 *   3. 2merkato full public listing
 *   4. TenderInfo.org public export API (Ethiopia, keyless)
 *   5. TenderMetro Intelligence REST API (Ethiopia) — created INACTIVE unless
 *      TENDERMETRO_API_KEY is set in .env; the key is never stored in the DB.
 * Idempotent: matches existing rows by Name.
 *
 * The e-GP, 2merkato and TenderInfo hosts are unrestricted by default
 * (authorized public APIs/listings); see TENDERS_RESTRICTED_HOSTS in
 * .env.example.
 *
 * Usage: npm run db:seed:tenders
 *   or:  npx tsx scripts/seed-tender-sources.ts
 */
import { db } from '../src/db/pool';
import { env } from '../src/config/env';
import { listSources, createSource, updateSource } from '../src/modules/tenders/source.service';
import { EGP_SOURCE_NAME, EGP_API_URL, egpApiConfigJson } from '../src/modules/tenders/egp-source';
import {
  TWOMERKATO_FREE_SOURCE,
  TWOMERKATO_FULL_SOURCE,
  twomerkatoApiConfigJson,
} from '../src/modules/tenders/twomerkato-source';
import { TENDERINFO_SOURCE, tenderinfoApiConfigJson } from '../src/modules/tenders/tenderinfo-source';
import { TENDERMETRO_SOURCE, tendermetroApiConfigJson } from '../src/modules/tenders/tendermetro-source';

interface SeedSpec {
  name: string;
  url: string;
  apiConfig: string;
  rateLimitMs: number;
  /** Defaults true. TenderMetro stays inactive until TENDERMETRO_API_KEY is set. */
  isActive?: boolean;
}

async function upsertSource(spec: SeedSpec): Promise<void> {
  const existing = (await listSources()).find((s) => s.Name === spec.name);
  const shared = {
    SourceType: 'api' as const,
    URL: spec.url,
    ApiConfig: spec.apiConfig,
    Schedule: '6h',
    RateLimitMs: spec.rateLimitMs,
    IsActive: spec.isActive ?? true,
  };

  if (existing) {
    await updateSource(existing.TenderSourceID, shared);
    console.log(`Updated tender source #${existing.TenderSourceID}: ${spec.name}`);
  } else {
    const created = await createSource({
      Name: spec.name,
      ...shared,
      RobotsCompliance: true,
    });
    console.log(`Created tender source #${created.TenderSourceID}: ${spec.name}`);
  }
  console.log('URL:', spec.url);
}

async function main(): Promise<void> {
  await db.connect();

  await upsertSource({
    name: EGP_SOURCE_NAME,
    url: EGP_API_URL,
    apiConfig: egpApiConfigJson(),
    rateLimitMs: 1000,
  });
  await upsertSource({
    name: TWOMERKATO_FREE_SOURCE.name,
    url: TWOMERKATO_FREE_SOURCE.url,
    apiConfig: twomerkatoApiConfigJson(TWOMERKATO_FREE_SOURCE),
    rateLimitMs: TWOMERKATO_FREE_SOURCE.rateLimitMs,
  });
  await upsertSource({
    name: TWOMERKATO_FULL_SOURCE.name,
    url: TWOMERKATO_FULL_SOURCE.url,
    apiConfig: twomerkatoApiConfigJson(TWOMERKATO_FULL_SOURCE),
    rateLimitMs: TWOMERKATO_FULL_SOURCE.rateLimitMs,
  });
  await upsertSource({
    name: TENDERINFO_SOURCE.name,
    url: TENDERINFO_SOURCE.url,
    apiConfig: tenderinfoApiConfigJson(),
    rateLimitMs: TENDERINFO_SOURCE.rateLimitMs,
  });
  const hasTenderMetroKey = env.tenders.tenderMetroApiKey.length > 0;
  await upsertSource({
    name: TENDERMETRO_SOURCE.name,
    url: TENDERMETRO_SOURCE.url,
    apiConfig: tendermetroApiConfigJson(),
    rateLimitMs: TENDERMETRO_SOURCE.rateLimitMs,
    isActive: hasTenderMetroKey,
  });
  if (!hasTenderMetroKey) {
    console.log('  ℹ TENDERMETRO_API_KEY not set — TenderMetro source stored INACTIVE (set the key and re-run to activate).');
  }

  console.log('Next: Test from /tenders/sources, then Collect Now.');
}

main()
  .then(() => db.close())
  .catch(async (err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    try {
      await db.close();
    } catch {
      /* pool already closed */
    }
    process.exitCode = 1;
  });
