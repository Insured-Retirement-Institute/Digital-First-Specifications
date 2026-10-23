/**
 * Migrates all catalog specs from docs/specs/ to docs/specs/src/, removes
 * hand-authored published copies, and rebundles.
 *
 * Modified by Cursor
 */

import * as fs from 'fs';
import { migrateSpecToSrc } from './migrate-spec-to-src.js';
import { listPublishedSpecFiles, publishedSpecPath } from './spec-paths.js';

/** Duplicate of appstatus_4.0.0.yaml — not referenced by api-viewer.html */
const SKIP_MIGRATION = new Set(['appstatusv4.yaml']);

const MIGRATION_ORDER = [
  'fundtransfer_1.0.1.yaml',
  'FundTransfer_2.0.0.yml',
  'onetimewithdrawalquote_1.0.1.yaml',
  'onetimewithdrawalquote_2.0.1.yaml',
  'onetimewithdrawal_1.0.1.yaml',
  'onetimewithdrawal_2.0.1.yaml',
  'systematicwithdrawalprogramsetup_1.0.1.yaml',
  'SystematicProgramSetUp_2.0.0.yml',
  'systematicwithdrawalprogramupdate_1.0.1.yaml',
  'SystematicProgramUpdate_2.0.0.yml',
  'policyinquiry.yaml',
  'policyinquiry_2.1.1.yaml',
  'activatedannuityincome_1.0.1.yaml',
  'beneficiaryreplacement_1.0.0.yaml',
  'producertraining_1.0.1.yaml',
  'paperlessreplacements1.yaml',
  'appstatuspushNotifications_1.1.1.yaml',
  'appstatuspushNotifications_2.0.0.yaml',
  'appstatusv1.yaml',
  'appstatusv2.yaml',
  'appstatus_3.1.0.yaml',
  'appstatus_4.0.0.yaml'
];

async function main(): Promise<void> {
  const published = new Set(listPublishedSpecFiles());
  const toMigrate = MIGRATION_ORDER.filter(f => published.has(f));

  for (const specFile of toMigrate) {
    await migrateSpecToSrc(specFile);
    console.log(`MIGRATED  ${specFile}`);
  }

  for (const specFile of toMigrate) {
    fs.unlinkSync(publishedSpecPath(specFile));
    console.log(`REMOVED   specs/${specFile} (hand-authored)`);
  }

  if (published.has('appstatusv4.yaml')) {
    fs.unlinkSync(publishedSpecPath('appstatusv4.yaml'));
    console.log('REMOVED   specs/appstatusv4.yaml (duplicate of appstatus_4.0.0.yaml)');
  }
}

main().catch(error => {
  console.error('Batch migration failed:', error);
  process.exit(1);
});
