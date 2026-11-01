import { UserModel } from '../models/User';
import { RecoveryRequestModel } from '../models/RecoveryRequest';
import { GoogleAuthStateModel } from '../models/GoogleAuthState';
import { GoogleAuthTicketModel } from '../models/GoogleAuthTicket';
import { emailIndexNeedsRebuild, googleIdIndexNeedsRebuild, type IndexInfo } from './authIndexPlan';

export interface AuthIndexReport {
  rebuiltEmailIndex: boolean;
  needed: boolean;
  rebuiltGoogleIdIndex: boolean;
  /** Google ids shared by more than one user. While any exist the unique index is NOT created (nothing is deleted or merged). */
  duplicateGoogleIds: string[];
}

/**
 * Index-only, idempotent, touches no documents. Older databases have a plain
 * unique index on users.email, which would allow only ONE worker without an
 * email. Replaces it with the partial unique index declared in User.ts.
 * Same idea for users.googleId (was a plain sparse index; Google sign-in now needs it UNIQUE).
 */
export async function ensureAuthIndexes(opts: { apply: boolean } = { apply: true }): Promise<AuthIndexReport> {
  let existing: IndexInfo[] = [];
  try {
    existing = (await UserModel.collection.indexes()) as IndexInfo[];
  } catch {
    existing = []; // collection does not exist yet - nothing legacy to fix
  }
  const needed = emailIndexNeedsRebuild(existing);
  const googleNeeded = googleIdIndexNeedsRebuild(existing);

  // Never create a unique index over existing duplicates, and never delete or merge users to "fix" them.
  let duplicateGoogleIds: string[] = [];
  try {
    const dups: any[] = await UserModel.aggregate([
      { $match: { googleId: { $type: 'string' } } },
      { $group: { _id: '$googleId', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]);
    duplicateGoogleIds = dups.map((d) => String(d._id));
  } catch {
    duplicateGoogleIds = [];
  }
  const googleSafe = duplicateGoogleIds.length === 0;

  if (needed && opts.apply) {
    const legacy = existing.find((i) => i.key && i.key.email === 1 && !i.partialFilterExpression)!;
    await UserModel.collection.dropIndex(legacy.name as string);
  }
  if (googleNeeded && googleSafe && opts.apply) {
    const legacy = existing.find((i) => i.key && Object.keys(i.key).length === 1 && i.key.googleId === 1)!;
    await UserModel.collection.dropIndex(legacy.name as string);
  }
  if (opts.apply) {
    try {
      await UserModel.createIndexes();
    } catch (e) {
      // With duplicate Google ids the unique googleId index cannot be built; everything else still is.
      if (googleSafe) throw e;
    }
    await RecoveryRequestModel.createIndexes();
    await GoogleAuthStateModel.createIndexes();
    await GoogleAuthTicketModel.createIndexes();
  }
  return {
    rebuiltEmailIndex: needed && opts.apply,
    needed,
    rebuiltGoogleIdIndex: googleNeeded && googleSafe && opts.apply,
    duplicateGoogleIds,
  };
}
