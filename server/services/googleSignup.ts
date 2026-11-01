import crypto from 'crypto';
import { isValidCategoryId } from '../../src/data/tamilNaduData';
import { hashPassword } from '../auth';
import { sendNotification } from '../db';
import { UserModel } from '../models/User';
import { WorkerModel } from '../models/Worker';
import { validateWorkerLocation, sanitizeServiceAreas } from './workerLocation';
import {
  normalizeIndianMobile,
  toStoredPhone,
  normalizeUserId,
  USER_ID_RULE_TEXT,
  validateNewPassword,
} from './workerIdentity';

// Account creation for a person who signed up with Google. Google proves ONE thing here: that the
// person controls this e-mail address (and which Google account it is). It does NOT prove phone
// ownership and it is NOT admin approval, so:
//   - a worker profile is created only when the person chose "Worker" and filled in every required field,
//     and it starts exactly like a normal registration: verificationStatus 'pending', phoneVerified false;
//   - the role can only ever be 'customer' or 'worker' (never 'admin').

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

export type SignupFailure = { ok: false; status: number; error: string; field?: string };

export interface ParsedSignup {
  role: 'customer' | 'worker';
  worker?: {
    name: string;
    loginId: string;
    phoneNorm: string;
    password: string;
    category: string;
    location: { district: string; taluk: string; areaId?: string; publicArea: string };
    serviceAreas: string[];
    description: string;
    experience: number;
    rate: string;
    profilePhoto: string | null;
    lat: number;
    lng: number;
  };
}

const fail = (status: number, error: string, field?: string): SignupFailure => ({ ok: false, status, error, ...(field ? { field } : {}) });

/** Input validation only (no database). Mirrors the rules of the normal worker registration. */
export function parseGoogleSignupInput(body: any): { ok: true; value: ParsedSignup } | SignupFailure {
  const role = body?.role;
  if (role !== 'customer' && role !== 'worker') return fail(400, 'Please choose whether you are a Customer or a Worker.', 'role');
  if (role === 'customer') return { ok: true, value: { role } };

  const { name, loginId: rawLoginId, phone, password, confirmPassword, consent, category, district, taluk, areaId, publicArea, serviceAreas, description, experience, rate, profilePhoto, lat, lng } = body;
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) return fail(400, 'Please enter your full name', 'name');
  const loginId = normalizeUserId(rawLoginId);
  if (!loginId) return fail(400, USER_ID_RULE_TEXT, 'loginId');
  const phoneNorm = normalizeIndianMobile(phone);
  if (!phoneNorm) return fail(400, 'Please enter a valid 10-digit Indian mobile number', 'phone');
  const pw = validateNewPassword(password, confirmPassword === undefined ? '' : confirmPassword);
  if (!pw.ok) return fail(400, pw.error, pw.field);
  if (consent !== true) return fail(400, 'Please agree to publish your profile details (name, work, area) publicly to continue', 'consent');
  if (!isValidCategoryId(category)) return fail(400, 'Please choose a valid worker category.', 'category');
  const loc = validateWorkerLocation({ district, taluk, areaId, publicArea });
  if (!loc.ok) return fail(400, loc.error, loc.field);
  const svc = sanitizeServiceAreas(serviceAreas, loc.location.publicArea);
  if (!svc.ok) return fail(400, svc.error, 'area');
  if (lat === undefined || lng === undefined) return fail(400, 'Location coordinates are required');
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return fail(400, 'Invalid location coordinates');

  return {
    ok: true,
    value: {
      role: 'worker',
      worker: {
        name: name.trim(),
        loginId,
        phoneNorm,
        password,
        category,
        location: loc.location as any,
        serviceAreas: svc.value,
        description: typeof description === 'string' ? description.slice(0, 2000) : '',
        experience: Number(experience) || 1,
        rate: typeof rate === 'string' && rate ? rate.slice(0, 100) : '₹300 / service',
        profilePhoto: typeof profilePhoto === 'string' && profilePhoto ? profilePhoto : null,
        lat: latNum,
        lng: lngNum,
      },
    },
  };
}

/** Creates the account(s). Duplicate identities are rejected (the unique indexes are the real guard against races). */
export async function createGoogleAccount(
  identity: GoogleIdentity,
  parsed: ParsedSignup,
  guestFavourites: unknown
): Promise<{ ok: true; user: any; worker: any | null } | SignupFailure> {
  const email = identity.email.toLowerCase();
  if (await UserModel.exists({ googleId: identity.sub })) return fail(409, 'This Google account is already registered. Please sign in with Google.');
  if (await UserModel.exists({ email })) {
    return fail(409, 'An account with this email already exists. Sign in with your existing method, then link Google from the account menu.', 'email');
  }

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const base = {
    id: userId,
    email,
    emailVerified: true, // Google verified the e-mail address; this is NOT phone verification or admin approval
    googleId: identity.sub,
    googleLinkedAt: now,
    status: 'active',
    tokenVersion: 1,
    createdAt: now,
    updatedAt: now,
  };

  if (parsed.role === 'customer') {
    const favs = Array.isArray(guestFavourites) ? guestFavourites.filter((f) => typeof f === 'string').slice(0, 200) : [];
    try {
      const user = await UserModel.create({
        ...base,
        // Customers have no password until they choose one via "Forgot password"; a random hash keeps the field valid and unusable.
        passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
        role: 'customer',
        authProviders: ['google'],
        favourites: favs,
      });
      return { ok: true, user, worker: null };
    } catch (e: any) {
      if (e?.code === 11000) return fail(409, 'This Google account or email is already registered.');
      throw e;
    }
  }

  const w = parsed.worker!;
  if (await UserModel.exists({ loginId: w.loginId })) return fail(409, 'This User ID is already taken. Please choose another.', 'loginId');
  if (await UserModel.exists({ phone: w.phoneNorm })) return fail(409, 'This phone number is already registered. Sign in with your existing account, then link Google from the account menu.', 'phone');

  const workerId = `w_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  let user: any;
  try {
    user = await UserModel.create({
      ...base,
      loginId: w.loginId,
      phone: w.phoneNorm,
      passwordHash: hashPassword(w.password),
      role: 'worker',
      authProviders: ['google', 'local'],
      favourites: [],
      workerId,
    });
  } catch (e: any) {
    if (e?.code === 11000) return fail(409, 'This User ID, phone number, email or Google account is already registered.');
    throw e;
  }

  let worker: any;
  try {
    worker = await WorkerModel.create({
      id: workerId,
      userId,
      name: w.name,
      email,
      phone: toStoredPhone(w.phoneNorm),
      phoneVerified: false, // Google does not verify phone ownership; an admin must
      consentPublicAt: now,
      category: w.category,
      district: w.location.district,
      taluk: w.location.taluk,
      areaId: w.location.areaId,
      publicArea: w.location.publicArea,
      serviceAreas: w.serviceAreas,
      description: w.description,
      experience: w.experience,
      rate: w.rate,
      profilePhoto: w.profilePhoto,
      coordinates: { lat: w.lat, lng: w.lng },
      availability: 'Available',
      verificationStatus: 'pending', // Google e-mail verification is NOT admin approval
      isSuspended: false,
      suspensionInfo: null,
      warningCount: 0,
      ratingSummary: { averageRating: 0, totalRatings: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    await UserModel.deleteOne({ id: userId }).catch(() => {}); // no orphan login without a profile
    throw e;
  }

  await sendNotification(
    'admin',
    'verification',
    'New Worker Registration',
    `${w.name} has registered (Google sign-up) as a ${w.category} in ${w.location.publicArea}, ${w.location.taluk} taluk, ${w.location.district}. Pending verification review.`
  );
  return { ok: true, user, worker };
}
