import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { addAuditLog, sendNotification } from '../db';
import { AuthRequest, requireAuth } from '../auth';
import { profileUpdateLimiter } from '../middleware/rateLimit';
import { WorkerModel } from '../models/Worker';
import { LOCATION_CONFIGURED_DISTRICTS } from '../../src/data/salemLocations';
import { validateWorkerLocation, sanitizeServiceAreas, cleanAreaText, type WorkerLocation } from '../services/workerLocation';
import {
  parseSearchQuery, searchWorkers, type SearchParams, toMongoFilter, buildFilter, dbSortSpec,
  getEnabledDistricts, describeEnabledDistricts, type SearchRepo,
} from '../services/workerSearch';
import { isValidCategoryId } from '../../src/data/tamilNaduData';
import { getAiSearchService } from '../services/aiSearch';
import { SuspensionModel } from '../models/Suspension';
import { AppealModel } from '../models/Appeal';
import { NotificationModel } from '../models/Notification';
import { UserModel } from '../models/User';
import { RecoveryRequestModel } from '../models/RecoveryRequest';
import { verifyPassword } from '../auth';
import { normalizeIndianMobile } from '../services/workerIdentity';
import { generateReference, identifierKey, OPEN_STATUSES } from '../services/recoveryToken';

const router = express.Router();

// Public-safe worker projection - NEVER include phone, coordinates,
// warningCount, or any other internal/private field. Every route that
// returns a worker to a customer-facing (non-owner, non-admin) context
// goes through this.
function toPublicWorker(w: any, distanceCategory: 'Nearby' | 'Moderate distance' | 'Far' | null = null) {
  return {
    id: w.id,
    name: w.name,
    category: w.category,
    district: w.district,
    taluk: w.taluk ?? null,
    publicArea: w.publicArea,
    serviceAreas: w.serviceAreas,
    description: w.description,
    experience: w.experience,
    rate: w.rate,
    profilePhoto: w.profilePhoto,
    availability: w.availability,
    verificationStatus: w.verificationStatus,
    isSuspended: w.isSuspended,
    // "Phone Number Verified" (admin-confirmed ownership) - separate from verificationStatus (profile approved).
    phoneVerified: w.phoneVerified === true,
    ratingSummary: w.ratingSummary,
    distanceCategory,
    canContact: !w.isSuspended,
    createdAt: w.createdAt,
  };
}

// 1. Public Worker Search & Discovery
//
// All filtering (launch-district scope, area, category, availability,
// visibility, radius) and ordering happens server-side - see
// server/services/workerSearch.ts for the rules and their unit tests.
const SEARCH_FIELDS =
  '-_id id name category district taluk publicArea serviceAreas description experience rate profilePhoto ' +
  'availability verificationStatus isSuspended ratingSummary createdAt coordinates';

// `coordinates` is selected ONLY so distance can be computed in the service;
// toPublicSearchWorker() whitelists the response, so it is never sent out.
const mongoSearchRepo: SearchRepo = {
  count: async (f) => await WorkerModel.countDocuments(toMongoFilter(f)).exec(),
  findPage: async (f, sort, skip, limit) =>
    await WorkerModel.find(toMongoFilter(f)).select(SEARCH_FIELDS).sort(sort).skip(skip).limit(limit).lean().exec(),
  findCandidates: async (f, cap) =>
    await WorkerModel.find(toMongoFilter(f)).select(SEARCH_FIELDS).sort(dbSortSpec('default')).limit(cap).lean().exec(),
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = parseSearchQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });

    // AI-assisted interpretation of the search box (dictionary first, Gemini only when
    // needed). It never throws and only yields real category ids; on any failure the
    // plain text search runs exactly as before. The workers still come from MongoDB.
    const intent = parsed.params.text
      ? await getAiSearchService().resolve(parsed.params.text, req.ip || 'anon')
      : null;
    if (intent) {
      parsed.params.aiCategories = intent.categories;
      parsed.params.aiKeywords = intent.keywords;
    }

    const result = await searchWorkers(parsed.params, mongoSearchRepo);
    if (result.truncated) console.warn('worker search: GPS candidate cap reached - add a radius or enable more specific filters');
    // `interpretation` is an additive field; existing clients ignore it.
    res.json(
      intent && intent.source !== 'none'
        ? { ...result, interpretation: { source: intent.source, categories: intent.categories, fallback: intent.source === 'fallback' } }
        : result
    );
  } catch (err) {
    console.error('worker search error:', err);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

// 1b. Search configuration for the UI: which districts are open for public
// search, and the real areas that can be selected in each (configured towns
// plus areas actually used by existing, publicly visible workers).
router.get('/search-config', async (_req: Request, res: Response) => {
  try {
    const enabled = getEnabledDistricts();
    const extra: Record<string, string[]> = {};
    const extraByTaluk: Record<string, string[]> = {};
    for (const d of enabled) {
      const base: SearchParams = {
        districts: [d], outOfScope: false, category: null, area: null, text: null, aiCategories: [], aiKeywords: [], availableOnly: false,
        verifiedOnly: false, sort: 'default', customer: null, radiusKm: null, page: 1, limit: 1, taluk: null,
      };
      const isStr = (a: unknown): a is string => typeof a === 'string';
      extra[d.id] = (await WorkerModel.distinct('publicArea', toMongoFilter(buildFilter(base)))).filter(isStr);
      for (const t of LOCATION_CONFIGURED_DISTRICTS[d.id]?.taluks ?? []) {
        extraByTaluk[t.id] = (
          await WorkerModel.distinct('publicArea', toMongoFilter(buildFilter({ ...base, taluk: t.id })))
        ).filter(isStr);
      }
    }
    res.json({ districts: describeEnabledDistricts(extra, enabled, extraByTaluk) });
  } catch (err) {
    console.error('search config error:', err);
    res.status(500).json({ error: 'Could not load search options.' });
  }
});

// 2. Worker Profile by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const worker = await WorkerModel.findOne({ id: req.params.id });
    if (!worker || worker.verificationStatus === 'rejected') {
      return res.status(404).json({ error: 'Worker not found' });
    }
    res.json(toPublicWorker(worker));
  } catch (err) {
    console.error('worker profile error:', err);
    res.status(500).json({ error: 'Could not load worker profile.' });
  }
});

// 3. Worker Dashboard Data (Private to logged-in worker)
router.get('/dashboard/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    if (userPayload.role !== 'worker') {
      return res.status(403).json({ error: 'Access restricted to worker accounts' });
    }

    const worker = await WorkerModel.findOne({ id: userPayload.workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker profile not found' });
    }

    let suspensionData = null;
    if (worker.isSuspended) {
      const activeSusp = await SuspensionModel.findOne({ workerId: worker.id, status: 'active' });
      if (activeSusp) {
        suspensionData = { ...activeSusp.toObject(), actionBy: 'Namma Ooru Workers Admin' };
      }
    }

    const workerAppeals = await AppealModel.find({ workerId: worker.id }).sort({ createdAt: 1 });
    const latestAppeal = workerAppeals.length > 0 ? workerAppeals[workerAppeals.length - 1] : null;

    const notifications = await NotificationModel.find({
      $or: [{ recipientId: worker.id }, ...(worker.email ? [{ recipientId: worker.email }] : [])],
    }).sort({ createdAt: -1 }).limit(100);

    res.json({ worker, suspensionInfo: suspensionData, latestAppeal, notifications });
  } catch (err) {
    console.error('worker dashboard error:', err);
    res.status(500).json({ error: 'Could not load dashboard.' });
  }
});

// 4. Worker Update Profile (Req 20: no admin approval required for normal edits)
router.put('/profile', requireAuth, profileUpdateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    if (userPayload.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can update their profile' });
    }

    const { name, phone, category, district, taluk, areaId, publicArea, serviceAreas, description, experience, rate, profilePhoto } = req.body;

    const worker = await WorkerModel.findOne({ id: userPayload.workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker profile not found' });
    }

    // The phone number is no longer directly editable: it is used for login
    // and for admin identity checks, so changing it without verification
    // would let someone take over another worker's recovery path. A changed
    // number must go through POST /api/workers/phone-change (admin-assisted).
    // Re-sending the CURRENT number (unchanged form value) is accepted and ignored.
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      const submitted = normalizeIndianMobile(phone);
      const current = normalizeIndianMobile(worker.phone);
      const sameAsStored = String(phone).trim() === String(worker.phone).trim();
      if (!sameAsStored && (!submitted || submitted !== current)) {
        return res.status(400).json({
          error: 'Phone number cannot be changed here. Use "Request phone number change" so an administrator can verify it.',
          field: 'phone',
        });
      }
    }
    if (description !== undefined && String(description).length > 2000) {
      return res.status(400).json({ error: 'Description must be 2000 characters or fewer' });
    }
    if (experience !== undefined && (isNaN(Number(experience)) || Number(experience) < 0 || Number(experience) > 80)) {
      return res.status(400).json({ error: 'Experience must be a number of years between 0 and 80' });
    }
    if (rate !== undefined && String(rate).length > 100) {
      return res.status(400).json({ error: 'Rate text must be 100 characters or fewer' });
    }

    // Location is only touched when the client sends any location field, and
    // then the WHOLE district -> taluk -> area triple must validate against the
    // central configuration. (Legacy workers with no taluk can still edit
    // other fields; they are asked to complete their location.)
    const locationSent = [district, taluk, areaId, publicArea].some((v) => v !== undefined);
    let newLocation: WorkerLocation | null = null;
    if (locationSent) {
      const loc = validateWorkerLocation({ district, taluk, areaId, publicArea });
      if (!loc.ok) return res.status(400).json({ error: loc.error, field: loc.field });
      newLocation = loc.location;
    }
    const areaForServiceAreas = newLocation ? newLocation.publicArea : worker.publicArea;
    let newServiceAreas: string[] | null = null;
    if (serviceAreas !== undefined || newLocation) {
      const svc = sanitizeServiceAreas(
        serviceAreas !== undefined ? serviceAreas : (worker.serviceAreas || []).filter((a: string) => a !== worker.publicArea && cleanAreaText(a) !== null),
        areaForServiceAreas
      );
      if (!svc.ok) return res.status(400).json({ error: svc.error, field: 'area' });
      newServiceAreas = svc.value;
    }

    if (category !== undefined && category !== null && category !== '' && !isValidCategoryId(category)) {
      return res.status(400).json({ error: 'Please choose a valid worker category.', field: 'category' });
    }

    if (name) worker.name = name;
    if (category) worker.category = category;
    if (newLocation) {
      worker.district = newLocation.district;
      (worker as any).taluk = newLocation.taluk;
      (worker as any).areaId = newLocation.areaId;
      worker.publicArea = newLocation.publicArea;
    }
    if (newServiceAreas) worker.serviceAreas = newServiceAreas;
    if (description !== undefined) worker.description = description;
    if (experience !== undefined) worker.experience = Number(experience) || worker.experience;
    if (rate !== undefined) worker.rate = rate;
    if (profilePhoto !== undefined) worker.profilePhoto = profilePhoto;

    worker.updatedAt = new Date().toISOString();
    await worker.save();

    await addAuditLog(userPayload.email || userPayload.userId, 'worker_profile_update', 'worker', worker.id);

    res.json({ success: true, worker, message: 'Profile updated successfully!' });
  } catch (err) {
    console.error('worker profile update error:', err);
    res.status(500).json({ error: 'Profile update failed. Please try again.' });
  }
});

// 4b. Worker requests a phone number change (admin-assisted verification).
// Requires the current password so a stolen session cannot silently redirect
// the account's recovery phone. Nothing changes until an admin approves; the
// new number is NEVER treated as verified before that.
router.post('/phone-change', requireAuth, profileUpdateLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    if (userPayload.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can request a phone change' });
    }
    const { newPhone, password } = req.body;
    const user = await UserModel.findOne({ id: userPayload.userId });
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.passwordHash)) {
      return res.status(403).json({ error: 'Incorrect password' });
    }
    const n = normalizeIndianMobile(newPhone);
    if (!n) return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number', field: 'phone' });
    if (n === user.phone) return res.status(400).json({ error: 'This is already your registered number', field: 'phone' });
    if (await UserModel.exists({ phone: n })) {
      return res.status(409).json({ error: 'This phone number is already registered to another account', field: 'phone' });
    }
    const open = await RecoveryRequestModel.findOne({ userId: user.id, type: 'phone_change', status: { $in: OPEN_STATUSES } });
    if (open) {
      return res.json({ success: true, reference: open.reference, message: 'You already have a phone change request waiting for admin review.' });
    }
    const now = Date.now();
    const reference = generateReference();
    await RecoveryRequestModel.create({
      id: crypto.randomUUID(),
      reference,
      type: 'phone_change',
      status: 'pending',
      userId: user.id,
      identifierKey: identifierKey('phone_change', user.id),
      identifierKind: 'phone',
      newPhone: n,
      createdAt: now,
      updatedAt: now,
    });
    await addAuditLog(userPayload.email || userPayload.userId, 'phone_change_requested', 'user', user.id);
    await sendNotification('admin', 'verification', 'Phone change request', 'A worker has requested a phone number change. Review it under Recovery Requests.');
    res.status(201).json({
      success: true,
      reference,
      message: 'Request sent. An administrator will call the new number to verify it before it is changed.',
    });
  } catch (err) {
    console.error('phone-change request error:', err);
    res.status(500).json({ error: 'Could not submit the request. Please try again.' });
  }
});

// Latest phone-change request status for the logged-in worker (own records only).
router.get('/phone-change/latest', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    if (userPayload.role !== 'worker') return res.status(403).json({ error: 'Only workers can use this' });
    const r = await RecoveryRequestModel.findOne({ userId: userPayload.userId, type: 'phone_change' }).sort({ createdAt: -1 });
    res.json({ request: r ? { reference: r.reference, status: r.status, createdAt: r.createdAt, adminNote: r.status === 'rejected' ? r.adminNote : '' } : null });
  } catch (err) {
    console.error('phone-change status error:', err);
    res.status(500).json({ error: 'Could not load the request.' });
  }
});

// 5. Worker Toggle Availability ('Available' | 'Offline')
router.put('/availability', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    const { availability } = req.body;

    if (userPayload.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can toggle availability' });
    }
    if (availability !== 'Available' && availability !== 'Offline') {
      return res.status(400).json({ error: 'Availability must be Available or Offline' });
    }

    const worker = await WorkerModel.findOne({ id: userPayload.workerId });
    if (!worker) {
      return res.status(404).json({ error: 'Worker profile not found' });
    }

    worker.availability = availability;
    worker.updatedAt = new Date().toISOString();
    await worker.save();

    res.json({ success: true, availability: worker.availability });
  } catch (err) {
    console.error('worker availability error:', err);
    res.status(500).json({ error: 'Could not update availability.' });
  }
});

// 6. Worker Submit Appeal (Req 41-48)
router.post('/appeal', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    const { explanation } = req.body;

    if (userPayload.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can submit an appeal' });
    }

    const worker = await WorkerModel.findOne({ id: userPayload.workerId });
    if (!worker || !worker.isSuspended) {
      return res.status(400).json({ error: 'Only currently suspended workers can request a review' });
    }

    const activeSusp = await SuspensionModel.findOne({ workerId: worker.id, status: 'active' });
    if (!activeSusp) {
      return res.status(400).json({ error: 'No active suspension found to appeal' });
    }

    // Req 43: only ONE pending appeal per active suspension at a time
    const existingPending = await AppealModel.findOne({
      workerId: worker.id,
      suspensionId: activeSusp.id,
      status: 'Pending',
    });
    if (existingPending) {
      return res.status(400).json({ error: 'You already have a pending review under evaluation.' });
    }

    if (explanation && explanation.length > 500) {
      return res.status(400).json({ error: 'Appeal explanation must not exceed 500 characters' });
    }

    const appeal = await AppealModel.create({
      id: crypto.randomUUID(),
      workerId: worker.id,
      workerName: worker.name,
      suspensionId: activeSusp.id,
      explanation: explanation || '',
      status: 'Pending',
      adminNote: null,
      decisionDate: null,
      createdAt: new Date().toISOString(),
    });

    await sendNotification(worker.id, 'appeal', 'Review Request Submitted', 'Your suspension review request has been received. Our administration will review your statement shortly.', true);
    await sendNotification(worker.id, 'appeal', 'Review Request Submitted', 'Your suspension review request has been received. Our administration will review your statement shortly.', false);
    await sendNotification('admin', 'appeal', 'New Worker Suspension Appeal', `${worker.name} has submitted an appeal for active suspension #${activeSusp.id.substring(0, 8)}.`);

    await addAuditLog(userPayload.email || userPayload.userId, 'appeal_submitted', 'appeal', appeal.id);

    res.status(201).json({ success: true, appeal, message: 'Appeal submitted successfully. Our team will review your request.' });
  } catch (err) {
    console.error('worker appeal error:', err);
    res.status(500).json({ error: 'Appeal submission failed. Please try again.' });
  }
});

export default router;