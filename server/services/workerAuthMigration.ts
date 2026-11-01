import crypto from 'crypto';
import { normalizeIndianMobile, normalizeUserId } from './workerIdentity';

// Pure planner for the one-time worker-auth migration. It never touches the
// database: the script feeds it current users/workers and applies (or only
// prints) the resulting plan. Additive only - nothing is deleted, passwords
// and emails are never changed.

export interface MUser { id: string; role: string; email?: string | null; loginId?: string | null; phone?: string | null; workerId?: string | null }
export interface MWorker { id: string; name?: string; phone?: string | null; phoneVerified?: boolean }

export interface UserPatch { userId: string; set: { loginId?: string; phone?: string } }
export interface WorkerPatch { workerId: string; set: { phoneVerified: false } }
export interface MigrationPlan {
  userPatches: UserPatch[];
  workerPatches: WorkerPatch[];
  issues: { workerId: string; kind: 'phone_invalid' | 'phone_duplicate' | 'phone_missing'; detail: string }[];
  summary: { workersTotal: number; loginIdAssigned: number; phoneSet: number; phoneIssues: number; alreadyMigrated: number };
}

/** Readable, unique, rule-compliant ID such as "worker4821" (suffix extended on collision). */
export function makeLoginId(taken: Set<string>, rand: () => number = Math.random): string {
  for (let digits = 4; digits <= 9; digits++) {
    for (let attempt = 0; attempt < 25; attempt++) {
      const n = Math.floor(rand() * 10 ** digits).toString().padStart(digits, '0');
      const id = `worker${n}`;
      if (normalizeUserId(id) && !taken.has(id)) return id;
    }
  }
  return `worker${crypto.randomBytes(5).toString('hex')}`.slice(0, 20);
}

export function planWorkerAuthMigration(users: MUser[], workers: MWorker[], rand: () => number = Math.random): MigrationPlan {
  const workerById = new Map(workers.map((w) => [w.id, w]));
  const workerUsers = users.filter((u) => u.role === 'worker');

  const takenLoginIds = new Set(users.map((u) => (u.loginId || '').toLowerCase()).filter(Boolean));
  const phoneOwners = new Map<string, string[]>(); // normalized phone -> user ids that already hold or want it
  for (const u of users) if (u.phone) phoneOwners.set(u.phone, [...(phoneOwners.get(u.phone) || []), u.id]);

  // Which normalized phones do un-migrated workers want?
  const wanted = new Map<string, string[]>();
  for (const u of workerUsers) {
    if (u.phone) continue;
    const w = u.workerId ? workerById.get(u.workerId) : undefined;
    const n = normalizeIndianMobile(w?.phone);
    if (n) wanted.set(n, [...(wanted.get(n) || []), u.id]);
  }

  const plan: MigrationPlan = { userPatches: [], workerPatches: [], issues: [], summary: { workersTotal: workerUsers.length, loginIdAssigned: 0, phoneSet: 0, phoneIssues: 0, alreadyMigrated: 0 } };

  for (const u of workerUsers) {
    const set: UserPatch['set'] = {};
    const w = u.workerId ? workerById.get(u.workerId) : undefined;

    if (!u.loginId) {
      const id = makeLoginId(takenLoginIds, rand);
      takenLoginIds.add(id);
      set.loginId = id;
      plan.summary.loginIdAssigned++;
    }

    if (!u.phone) {
      const n = normalizeIndianMobile(w?.phone);
      if (!w || w.phone == null || String(w.phone).trim() === '') {
        plan.issues.push({ workerId: u.workerId || u.id, kind: 'phone_missing', detail: 'no phone on worker profile' });
      } else if (!n) {
        plan.issues.push({ workerId: u.workerId || u.id, kind: 'phone_invalid', detail: 'stored phone is not a valid Indian mobile number' });
      } else if ((wanted.get(n) || []).length > 1 || (phoneOwners.get(n) || []).some((id) => id !== u.id)) {
        // Never guess who owns a shared number - none of the accounts gets it until an admin resolves it.
        plan.issues.push({ workerId: u.workerId || u.id, kind: 'phone_duplicate', detail: 'same number is on more than one account; resolve manually' });
      } else {
        set.phone = n;
        plan.summary.phoneSet++;
      }
    }

    if (set.loginId || set.phone) plan.userPatches.push({ userId: u.id, set });
    else plan.summary.alreadyMigrated++;

    if (w && w.phoneVerified === undefined) plan.workerPatches.push({ workerId: w.id, set: { phoneVerified: false } });
  }
  plan.summary.phoneIssues = plan.issues.length;
  return plan;
}
