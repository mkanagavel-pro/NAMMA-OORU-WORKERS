/**
 * Audit (and optionally safely migrate) the location data of EXISTING workers.
 *
 *   npx tsx server/scripts/auditWorkerLocations.ts                 # dry run (default) - writes nothing
 *   npx tsx server/scripts/auditWorkerLocations.ts --csv out.csv   # also export workers needing attention
 *   npx tsx server/scripts/auditWorkerLocations.ts --apply         # apply the ONLY safe automatic fix
 *
 * The one automatic fix: rewrite an already-recognised district spelling to
 * its canonical id (" SALEM " / "Salem" -> "salem"). The script NEVER assigns
 * a taluk or area - a worker with no valid taluk is reported so that the
 * worker (or an admin) chooses one. Nothing is guessed from the free-text area.
 *
 * The CSV deliberately contains no phone/email (only id, name and location).
 */
import 'dotenv/config';
import fs from 'node:fs';
import mongoose from 'mongoose';
import { connectMongo } from '../mongo';
import { WorkerModel } from '../models/Worker';
import { classifyWorkerLocation, type LocationStatus } from '../services/workerLocation';

async function main() {
  const apply = process.argv.includes('--apply');
  const csvIdx = process.argv.indexOf('--csv');
  const csvPath = csvIdx > -1 ? process.argv[csvIdx + 1] : null;

  await connectMongo();
  const counts: Record<string, number> = {};
  const attention: any[] = [];
  let fixes = 0;
  const bump = (k: string) => (counts[k] = (counts[k] || 0) + 1);

  const cursor = WorkerModel.find({}).select('id name district taluk areaId publicArea').lean().cursor();
  for await (const w of cursor as any) {
    const audit = classifyWorkerLocation(w);
    bump(audit.status);
    if (audit.status !== 'complete') {
      attention.push({ id: w.id, name: w.name, district: w.district, taluk: w.taluk ?? '', publicArea: w.publicArea, status: audit.status });
    }
    if (audit.safeFix?.district) {
      fixes++;
      if (apply) await WorkerModel.updateOne({ id: w.id }, { $set: { district: audit.safeFix.district } });
    }
  }

  const order: LocationStatus[] = ['complete', 'missing_taluk', 'invalid_taluk', 'area_missing', 'area_mismatch', 'district_not_launch', 'district_unrecognized'];
  console.log(apply ? 'MODE: APPLY (district spelling fixes only)' : 'MODE: DRY RUN (nothing written)');
  for (const k of order) console.log(`${k.padEnd(22)} ${counts[k] || 0}`);
  console.log(`district spelling fixes ${apply ? 'applied' : 'available'}: ${fixes}`);
  console.log('Workers needing a taluk/area are NOT modified; they are asked to complete it in their dashboard.');

  if (csvPath) {
    const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['id', 'name', 'district', 'taluk', 'publicArea', 'status'].join(',')].concat(
      attention.map((a) => [a.id, a.name, a.district, a.taluk, a.publicArea, a.status].map(q).join(','))
    );
    fs.writeFileSync(csvPath, rows.join('\n') + '\n');
    console.log(`wrote ${attention.length} rows to ${csvPath}`);
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('audit failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
