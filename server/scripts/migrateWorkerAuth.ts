// One-time, ADDITIVE migration for V6 worker authentication.
//
//   npm run migrate:worker-auth                 -> DRY RUN (default): prints the plan, writes nothing
//   npm run migrate:worker-auth -- --apply      -> applies the plan
//   npm run migrate:worker-auth -- --fix-indexes (with or without --apply) -> also repairs the users.email index
//
// What it does: gives every existing worker account a unique User ID, copies
// each worker's phone (normalized) into the login field when unambiguous,
// and sets phoneVerified=false where unset. What it NEVER does: delete data,
// change passwords or emails, mark anything verified, or guess an owner for a
// phone number shared by several accounts. Take a database backup first.
import 'dotenv/config';
import { connectMongo } from '../mongo';
import { UserModel } from '../models/User';
import { WorkerModel } from '../models/Worker';
import { ensureAuthIndexes } from '../services/authIndexes';
import { planWorkerAuthMigration } from '../services/workerAuthMigration';
import mongoose from 'mongoose';

async function main() {
  const apply = process.argv.includes('--apply');
  const fixIndexes = process.argv.includes('--fix-indexes') || apply;
  await connectMongo();

  const idx = await ensureAuthIndexes({ apply: fixIndexes });
  console.log(`index check: legacy users.email index ${idx.needed ? (idx.rebuiltEmailIndex ? 'REPLACED' : 'needs replacing (run with --fix-indexes)') : 'ok'}`);

  const users = (await UserModel.find({ role: 'worker' }).lean()) as any[];
  const workers = (await WorkerModel.find({}).select('id name phone phoneVerified').lean()) as any[];
  const allUsers = (await UserModel.find({}).select('id role loginId phone').lean()) as any[];
  const plan = planWorkerAuthMigration(
    allUsers.map((u) => (u.role === 'worker' ? users.find((x) => x.id === u.id) : u)),
    workers
  );

  console.log(JSON.stringify(plan.summary, null, 2));
  for (const i of plan.issues) console.log(`  issue [${i.kind}] worker ${i.workerId}: ${i.detail}`);

  if (!apply) {
    console.log('\nDRY RUN - nothing was written. Re-run with --apply after taking a backup.');
  } else {
    for (const p of plan.userPatches) await UserModel.updateOne({ id: p.userId }, { $set: p.set });
    for (const p of plan.workerPatches) await WorkerModel.updateOne({ id: p.workerId }, { $set: p.set });
    console.log(`\nAPPLIED: ${plan.userPatches.length} user(s), ${plan.workerPatches.length} worker(s) updated.`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('migration failed:', e?.message || e);
  process.exit(1);
});
