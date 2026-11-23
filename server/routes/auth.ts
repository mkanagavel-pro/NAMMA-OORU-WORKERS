import { isValidCategoryId } from '../../src/data/tamilNaduData';
import { validateWorkerLocation, sanitizeServiceAreas } from '../services/workerLocation';
import express, { Request, Response } from 'express';
import crypto from 'crypto';
import {
  addAuditLog,
  sendNotification,
  createOtp,
  verifyAndConsumeOtp,
  isOtpResendOnCooldown,
  bumpTokenVersion,
} from '../db';
import {
  hashPassword,
  verifyPassword,
  generateToken,
  AuthRequest,
  requireAuth,
} from '../auth';
import {
  normalizeIndianMobile,
  toStoredPhone,
  normalizeUserId,
  USER_ID_RULE_TEXT,
  validateNewPassword,
  classifyIdentifier,
  isLockedOut,
  registerFailedLogin,
  MAX_PASSWORD_LENGTH,
} from '../services/workerIdentity';
import { loginLimiter, adminLoginLimiter, registerLimiter, otpLimiter } from '../middleware/rateLimit';
import { UserModel } from '../models/User';
import { WorkerModel } from '../models/Worker';
import { SuspensionModel } from '../models/Suspension';
import { WarningModel } from '../models/Warning';
import { AppealModel } from '../models/Appeal';
import { ContactHistoryModel } from '../models/ContactHistory';
import { isEmailConfigured, sendRealEmail } from '../emailProvider';
import { getSettingsSingleton } from '../models/Settings';

const router = express.Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Stores only a SHA-256 hash of the OTP (see verifyAndConsumeOtp/createOtp
// in db.ts for the brute-force-limited, timing-safe comparison).
//
// SMTP-configured (any environment, including development): ALWAYS uses
// real email delivery whenever SMTP_HOST/SMTP_USER/SMTP_PASSWORD are set -
// this is checked BEFORE looking at NODE_ENV, so a developer who points
// their local .env at a real mailbox gets real emails, not the simulated
// inbox. The plaintext OTP is never stored in the notification feed in
// this path - only a redacted audit-trail entry with no code value.
//
// Not configured + production: fails safely and clearly rather than
// pretending an email was sent.
//
// Not configured + any other environment: the simulated in-app "email"
// notification (visible via the notification drawer) is used as an
// explicit, clearly-labeled development-only fallback so local testing
// works without real credentials.
async function saveAndSendOtp(email: string, purpose: string): Promise<{ sent: boolean; reason?: string }> {
  if (await isOtpResendOnCooldown(email, purpose)) {
    return { sent: false, reason: 'Please wait a moment before requesting another code.' };
  }

  const otp = generateOtp();

  if (isEmailConfigured()) {
    await createOtp(email, purpose, otp);
    try {
      await sendRealEmail(
        email,
        `Your Verification Code: ${otp}`,
        `Use OTP ${otp} to complete your ${purpose.replace('_', ' ')}. This code expires in 15 minutes. Never share this code.`
      );
    } catch (err) {
      console.error('Real email send failed:', err); // never logs the OTP itself
      return { sent: false, reason: 'Could not send the verification email. Please try again shortly.' };
    }

    // Audit-trail copy only - deliberately redacted, no OTP value stored,
    // and never shown as a "here is your code" simulated email once real
    // SMTP is configured.
    await sendNotification(
      email,
      'verification',
      'Verification code sent',
      `A verification code was sent to your email for ${purpose.replace('_', ' ')}.`,
      true
    );

    return { sent: true };
  }

  if (process.env.NODE_ENV === 'production') {
    // Fail safely and clearly - never fake a successful send in production.
    console.error(`OTP send blocked: no email provider configured (purpose=${purpose})`);
    return {
      sent: false,
      reason: 'Email service is not configured on this server. Please contact support.',
    };
  }

  // Development-only fallback (SMTP not configured): simulated email, OTP
  // visible in the notification drawer only.
  await createOtp(email, purpose, otp);
  await sendNotification(
    email,
    'verification',
    `Your Verification Code: ${otp}`,
    `Use OTP ${otp} to complete your ${purpose.replace('_', ' ')}. This code expires in 15 minutes. Never share this code.`,
    true
  );

  return { sent: true };
}

// 1. Customer Register
router.post('/customer/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const pwCheck = validateNewPassword(password);
    if (!pwCheck.ok) {
      return res.status(400).json({ error: pwCheck.error });
    }

    const normalizedEmail = String(email).toLowerCase();
    const existing = await UserModel.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ error: 'Account with this email already exists' });
    }

    const now = new Date().toISOString();
    const newUser = await UserModel.create({
      id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role: 'customer',
      authProviders: ['local'],
      emailVerified: false,
      favourites: [],
      status: 'active',
      tokenVersion: 1,
      createdAt: now,
      updatedAt: now,
    });

    const otpResult = await saveAndSendOtp(normalizedEmail, 'verify_email');

    // SECURITY FIX: no session token is issued here. An unverified account
    // must not receive a normal authenticated session through registration
    // alone - the token is now only generated by POST /verify-email, after
    // the OTP is actually confirmed (see that handler below). Returning
    // `requiresVerification` lets the frontend know to show the OTP screen
    // without ever touching auth state in the meantime.
    res.status(201).json({
      requiresVerification: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        emailVerified: newUser.emailVerified,
        favourites: newUser.favourites,
        status: newUser.status,
      },
      message: otpResult.sent
        ? 'Customer registered. Please verify your email with the OTP sent.'
        : `Customer registered, but the verification email could not be sent: ${otpResult.reason} You can request a new code once email is available.`,
      emailSendFailed: !otpResult.sent,
    });
  } catch (err) {
    console.error('customer/register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// 2. Customer Login
router.post('/customer/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase(), role: 'customer' });

    if (!user || !user.email || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status === 'restricted') {
      return res.status(403).json({ error: 'This customer account has been restricted by administration.' });
    }

    // SECURITY FIX: without this check, a user could close the OTP
    // verification screen after registering and simply log in normally
    // with the same credentials, bypassing email verification entirely -
    // the same underlying gap as the registration flow issuing a session
    // too early, just reached through a different endpoint. Google-auth
    // accounts are unaffected (they're marked emailVerified at creation,
    // since Google itself already verified that email).
    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email before logging in. Check your inbox for the verification code.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: 'customer',
      tokenVersion: user.tokenVersion || 1,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        favourites: user.favourites || [],
        status: user.status,
      },
    });
  } catch (err) {
    console.error('customer/login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// 3. Google sign-in lives in server/routes/googleAuth.ts (mounted at /api/auth/google): authorization-code
// flow with state + PKCE + nonce, server-side ID-token verification and safe account linking. The earlier
// POST /customer/google route was removed: it linked by e-mail to ANY account (including administrators) and,
// when GOOGLE_CLIENT_ID was unset outside production, trusted an e-mail sent by the browser.

// 4. Worker Register
router.post('/worker/register', registerLimiter, async (req: Request, res: Response) => {
  try {
    const {
      email: rawEmail,
      loginId: rawLoginId,
      password,
      confirmPassword,
      consent,
      phone,
      name,
      category,
      district,
      taluk,
      areaId,
      publicArea,
      serviceAreas,
      description,
      experience,
      rate,
      profilePhoto,
      lat,
      lng,
    } = req.body;

    if (!name || !rawLoginId || !password || !phone || !category || !district) {
      return res.status(400).json({
        error: 'Full name, User ID, phone, password, category, and district are mandatory',
      });
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Please enter your full name', field: 'name' });
    }

    // Email is OPTIONAL. When given it must look like an email and will go
    // through the normal OTP verification below; when absent the account
    // simply has no email (and recovers through the admin-assisted flow).
    let email: string | undefined;
    if (rawEmail !== undefined && rawEmail !== null && String(rawEmail).trim() !== '') {
      email = String(rawEmail).trim().toLowerCase();
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address or leave it blank', field: 'email' });
      }
    }

    const loginId = normalizeUserId(rawLoginId);
    if (!loginId) {
      return res.status(400).json({ error: USER_ID_RULE_TEXT, field: 'loginId' });
    }
    const phoneNorm = normalizeIndianMobile(phone);
    if (!phoneNorm) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number', field: 'phone' });
    }
    const pw = validateNewPassword(password, confirmPassword === undefined ? '' : confirmPassword);
    if (!pw.ok) {
      return res.status(400).json({ error: pw.error, field: pw.field });
    }
    if (consent !== true) {
      return res.status(400).json({
        error: 'Please agree to publish your profile details (name, work, area) publicly to continue',
        field: 'consent',
      });
    }

    if (!isValidCategoryId(category)) {
      return res.status(400).json({ error: 'Please choose a valid worker category.', field: 'category' });
    }

    // Location (district -> taluk -> area) is validated against the central
    // configuration; anything outside it (other districts, unknown taluks,
    // areas that belong to another taluk, unsafe text) is rejected.
    const loc = validateWorkerLocation({ district, taluk, areaId, publicArea });
    if (!loc.ok) return res.status(400).json({ error: loc.error, field: loc.field });
    const svc = sanitizeServiceAreas(serviceAreas, loc.location.publicArea);
    if (!svc.ok) return res.status(400).json({ error: svc.error, field: 'area' });

    if (lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Location coordinates are required' });
    }
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ error: 'Invalid location coordinates' });
    }

    // Friendly duplicate checks (the unique indexes remain the real guard
    // against races - see the E11000 handling below).
    if (await UserModel.exists({ loginId })) {
      return res.status(409).json({ error: 'This User ID is already taken. Please choose another.', field: 'loginId' });
    }
    if (await UserModel.exists({ phone: phoneNorm })) {
      return res.status(409).json({ error: 'This phone number is already registered. Try logging in, or use Forgot Password.', field: 'phone' });
    }
    if (email && (await UserModel.exists({ email }))) {
      return res.status(409).json({ error: 'An account with this email already exists', field: 'email' });
    }

    const userId = crypto.randomUUID();
    const workerId = `w_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();

    try {
      await UserModel.create({
        id: userId,
        ...(email ? { email } : {}),
        loginId,
        phone: phoneNorm,
        passwordHash: hashPassword(password), // confirmPassword is never stored
        role: 'worker',
        authProviders: ['local'],
        emailVerified: false, // only true after a real OTP check
        favourites: [],
        status: 'active',
        tokenVersion: 1,
        workerId,
        createdAt: now,
        updatedAt: now,
      });
    } catch (e: any) {
      if (e?.code === 11000) {
        return res.status(409).json({ error: 'This User ID, phone number or email is already registered.' });
      }
      throw e;
    }

    let worker;
    try {
      worker = await WorkerModel.create({
        id: workerId,
        userId,
        name: name.trim(),
        ...(email ? { email } : {}),
        phone: toStoredPhone(phoneNorm), // kept server-side, never exposed in public API - see workers.ts serialization
        phoneVerified: false, // format-valid only; an admin must verify ownership
        consentPublicAt: now,
        category,
        district: loc.location.district,
        taluk: loc.location.taluk,
        areaId: loc.location.areaId,
        publicArea: loc.location.publicArea,
        serviceAreas: svc.value,
        description: description || '',
        experience: Number(experience) || 1,
        rate: rate || '₹300 / service',
        profilePhoto: profilePhoto || null,
        coordinates: { lat: latNum, lng: lngNum },
        availability: 'Available',
        verificationStatus: 'pending',
        isSuspended: false,
        suspensionInfo: null,
        warningCount: 0,
        ratingSummary: { averageRating: 0, totalRatings: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } },
        createdAt: now,
        updatedAt: now,
      });
    } catch (e) {
      // Do not leave an orphan login behind if the profile could not be created.
      await UserModel.deleteOne({ id: userId }).catch(() => {});
      throw e;
    }

    await sendNotification(
      'admin',
      'verification',
      'New Worker Registration',
      `${name} has registered as a ${category} in ${loc.location.publicArea}, ${loc.location.taluk} taluk, ${loc.location.district}. Pending verification review.`
    );

    if (!email) {
      // No email = nothing to verify, so there is no OTP gate. The person
      // has just proven they know the password they chose, exactly as at
      // login, so a session is issued now. The profile is still PENDING
      // admin approval and the phone is NOT marked verified.
      const token = generateToken({
        userId,
        email: loginId,
        role: 'worker',
        workerId,
        tokenVersion: 1,
      });
      return res.status(201).json({
        requiresVerification: false,
        token,
        user: { id: userId, loginId, role: 'worker', emailVerified: false, workerId, favourites: [], status: 'active' },
        worker,
        message: 'Worker registered successfully! Your profile is pending admin approval.',
      });
    }

    const otpResult = await saveAndSendOtp(email, 'verify_email');

    // SECURITY FIX: no session token here either, for the same reason as
    // customer registration above - see POST /verify-email for where the
    // real session now gets created, after OTP success.
    const workerObj = worker.toObject();
    delete (workerObj as any).phone;
    delete (workerObj as any).coordinates;

    res.status(201).json({
      requiresVerification: true,
      user: {
        id: userId,
        email,
        loginId,
        role: 'worker',
        emailVerified: false,
        workerId,
      },
      worker: workerObj,
      message: otpResult.sent
        ? 'Worker registered successfully! Please verify your email with the OTP sent.'
        : `Worker registered, but the verification email could not be sent: ${otpResult.reason} You can request a new code once email is available.`,
      emailSendFailed: !otpResult.sent,
    });
  } catch (err) {
    console.error('worker/register error:', err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Used so a login for an unknown / locked account costs the same CPU as a real one.
let dummyHash: string | null = null;
function burnPasswordCheck(password: string) {
  if (!dummyHash) dummyHash = hashPassword('namma-ooru-timing-equalizer');
  verifyPassword(password, dummyHash);
}
const WORKER_LOGIN_FAIL = 'Invalid credentials, or too many attempts. Please check and try again later.';

// 5. Worker Login - User ID, phone number or (verified) email + password.
// All three resolve to the SAME User document.
router.post('/worker/login', loginLimiter, async (req: Request, res: Response) => {
  try {
    const { identifier, email: legacyEmail, password } = req.body;
    const raw = identifier ?? legacyEmail;
    if (!raw || !password || typeof password !== 'string' || password.length > MAX_PASSWORD_LENGTH) {
      return res.status(400).json({ error: 'User ID or phone number, and password are required' });
    }

    const ident = classifyIdentifier(raw);
    let user: any = null;
    if (ident) {
      const query =
        ident.kind === 'email'
          ? { email: ident.value, role: 'worker' }
          : ident.kind === 'phone'
          ? { phone: ident.value, role: 'worker' }
          : { loginId: ident.value, role: 'worker' };
      user = await UserModel.findOne(query);
    }

    const now = Date.now();
    if (!user || isLockedOut(user, now)) {
      burnPasswordCheck(password);
      return res.status(401).json({ error: WORKER_LOGIN_FAIL });
    }

    if (!verifyPassword(password, user.passwordHash)) {
      const next = registerFailedLogin(user, now);
      await UserModel.updateOne({ id: user.id }, { $set: next });
      return res.status(401).json({ error: WORKER_LOGIN_FAIL });
    }
    if (user.failedLoginCount || user.lockedUntil) {
      await UserModel.updateOne({ id: user.id }, { $set: { failedLoginCount: 0, lockedUntil: null, lastFailedAt: null } });
    }

    if (user.status === 'restricted') {
      return res.status(403).json({ error: 'This worker account has been restricted by administration.' });
    }

    // SECURITY FIX: same bypass as customer login above - without this,
    // closing the OTP screen and simply logging in normally would grant a
    // full session to a worker whose email was never verified. Workers who
    // registered WITHOUT an email have nothing to verify and are not gated.
    if (user.email && !user.emailVerified) {
      return res.status(403).json({
        error: 'Please verify your email before logging in. Check your inbox for the verification code.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const worker = await WorkerModel.findOne({ id: user.workerId });

    const token = generateToken({
      userId: user.id,
      email: user.email || user.loginId || user.id,
      role: 'worker',
      workerId: user.workerId || undefined,
      tokenVersion: user.tokenVersion || 1,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        loginId: user.loginId || null,
        role: user.role,
        emailVerified: user.emailVerified,
        workerId: user.workerId,
      },
      worker,
    });
  } catch (err) {
    console.error('worker/login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// 6. Admin Login
router.post('/admin/login', adminLoginLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    // Reject non-string input (objects/arrays) instead of letting it reach the query or throw a 500.
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await UserModel.findOne({ email: email.trim().toLowerCase(), role: 'admin' });

    if (!user || !user.email || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid administrator credentials' });
    }
    // A restricted administrator gets the same generic failure (and could not use the token anyway:
    // authMiddleware ignores restricted accounts).
    if (user.status === 'restricted') {
      return res.status(401).json({ error: 'Invalid administrator credentials' });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: 'admin',
      tokenVersion: user.tokenVersion || 1,
    });

    await addAuditLog(user.email, 'admin_login', 'auth', user.id);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: 'admin',
        requiresPasswordChange: Boolean(user.requiresPasswordChange),
      },
    });
  } catch (err) {
    console.error('admin/login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// 7. Verify Email with OTP
router.post('/verify-email', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP code are required' });
    }

    const result = await verifyAndConsumeOtp(email, 'verify_email', otp);
    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || !user.email) {
      return res.status(404).json({ error: 'Account not found' });
    }

    user.emailVerified = true;
    user.updatedAt = new Date().toISOString();
    await user.save();

    let workerObj: any = null;
    if (user.role === 'worker') {
      const settings = await getSettingsSingleton();
      const worker = await WorkerModel.findOne({ id: user.workerId });
      if (worker) {
        if (settings.autoVerifyWorkers && worker.verificationStatus === 'pending') {
          worker.verificationStatus = 'verified';
          worker.updatedAt = new Date().toISOString();
          await worker.save();
          await addAuditLog('System', 'auto_verify_worker', 'worker', worker.id, { from: 'pending' }, { to: 'verified' });
          await sendNotification(worker.id, 'verification', 'Worker Verified', 'Your worker profile has been automatically verified!', true);
        }
        workerObj = worker.toObject();
        delete workerObj.phone;
        delete workerObj.coordinates;
      }
    }

    // SECURITY FIX: this is now the ONLY point in the registration flow
    // where a real authenticated session is created - only after the OTP
    // has actually been verified. Registration itself (POST
    // /customer/register, /worker/register) no longer returns a token at
    // all (see those handlers above), so closing the OTP screen without
    // verifying leaves the frontend with no token and no user state,
    // exactly as if registration had never completed.
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as 'customer' | 'worker' | 'admin',
      workerId: user.workerId || undefined,
      tokenVersion: user.tokenVersion || 1,
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        loginId: user.loginId || null,
        role: user.role,
        emailVerified: user.emailVerified,
        favourites: user.favourites || [],
        status: user.status,
        workerId: user.workerId,
      },
      worker: workerObj,
      message: 'Email verified successfully!',
    });
  } catch (err) {
    console.error('verify-email error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// 8. Resend OTP
router.post('/resend-otp', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email, purpose = 'verify_email' } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await saveAndSendOtp(email.toLowerCase(), purpose);
    if (!result.sent) {
      return res.status(429).json({ error: result.reason });
    }
    res.json({ success: true, message: 'Verification code resent successfully!' });
  } catch (err) {
    console.error('resend-otp error:', err);
    res.status(500).json({ error: 'Could not resend code. Please try again.' });
  }
});

// 9. Forgot Password (send OTP)
router.post('/forgot-password', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Checked BEFORE the user lookup, and identically for every request
    // regardless of whether the account exists - if this were only
    // reported for existing accounts, the differing response would itself
    // leak account existence (defeating the generic message below).
    if (process.env.NODE_ENV === 'production' && !isEmailConfigured()) {
      console.error('forgot-password blocked: no email provider configured');
      return res.status(503).json({ error: 'Email service is not configured on this server. Please contact support.' });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || !user.email) {
      // Generic response to avoid email enumeration.
      return res.json({ success: true, message: 'If an account exists, a reset code was sent.' });
    }

    // Workers without a VERIFIED email cannot use email recovery (they use
    // the admin-assisted flow). Same generic answer, so nothing leaks.
    if (user.role === 'worker' && !user.emailVerified) {
      return res.json({ success: true, message: 'If an account exists, a reset code was sent.' });
    }

    await saveAndSendOtp(user.email, 'reset_password');
    res.json({ success: true, message: 'Password reset code sent to your email.' });
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ error: 'Request failed. Please try again.' });
  }
});

// 10. Reset Password (with OTP)
router.post('/reset-password', otpLimiter, async (req: Request, res: Response) => {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }
    const resetPw = validateNewPassword(newPassword);
    if (!resetPw.ok) {
      return res.status(400).json({ error: resetPw.error });
    }

    const result = await verifyAndConsumeOtp(email, 'reset_password', otp);
    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }

    const user = await UserModel.findOne({ email: email.toLowerCase() });
    if (!user || !user.email) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.passwordHash = hashPassword(newPassword);
    user.failedLoginCount = 0;
    user.lockedUntil = null;
    user.updatedAt = new Date().toISOString();
    await user.save();

    await bumpTokenVersion(user.id);
    await addAuditLog(user.email, 'password_reset_otp', 'user', user.id);

    res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
});

// 11. Customer Password Change (Current Password -> New Password)
router.post('/change-password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword, otp } = req.body;
    const userPayload = req.user!;

    const changePw = validateNewPassword(newPassword);
    if (!changePw.ok) {
      return res.status(400).json({ error: changePw.error });
    }

    const user = await UserModel.findOne({ id: userPayload.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Workers with a verified email keep the existing email-OTP confirmation.
    // Workers without one confirm with their CURRENT password instead.
    if (user.role === 'worker' && user.email && user.emailVerified) {
      if (!otp) {
        const sendResult = await saveAndSendOtp(user.email, 'change_password');
        if (!sendResult.sent) {
          return res.status(429).json({ error: sendResult.reason });
        }
        return res.json({ requiresOtp: true, message: 'OTP sent to your email to confirm password change.' });
      }

      const result = await verifyAndConsumeOtp(user.email, 'change_password', otp);
      if (!result.ok) {
        return res.status(400).json({ error: result.reason });
      }

      user.passwordHash = hashPassword(newPassword);
    } else {
      if (!currentPassword || !verifyPassword(currentPassword, user.passwordHash)) {
        return res.status(400).json({ error: 'Incorrect current password' });
      }
      user.passwordHash = hashPassword(newPassword);
    }

    user.updatedAt = new Date().toISOString();
    await user.save();

    await bumpTokenVersion(user.id);
    await addAuditLog(user.email || user.loginId || user.id, 'password_change', 'user', user.id);

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    console.error('change-password error:', err);
    res.status(500).json({ error: 'Password change failed. Please try again.' });
  }
});

// 12. Worker Change Email (Req 37)
router.post('/worker/change-email', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { newEmail, otp } = req.body;
    const userPayload = req.user!;

    if (userPayload.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can use this endpoint' });
    }
    if (!newEmail) {
      return res.status(400).json({ error: 'New email address is required' });
    }

    const existing = await UserModel.findOne({ email: newEmail.toLowerCase(), id: { $ne: userPayload.userId } });
    if (existing) {
      return res.status(400).json({ error: 'This email is already in use by another account' });
    }

    if (!otp) {
      const sendResult = await saveAndSendOtp(newEmail.toLowerCase(), 'change_email');
      if (!sendResult.sent) {
        return res.status(429).json({ error: sendResult.reason });
      }
      return res.json({ requiresOtp: true, message: 'Verification code sent to your new email.' });
    }

    const result = await verifyAndConsumeOtp(newEmail.toLowerCase(), 'change_email', otp);
    if (!result.ok) {
      return res.status(400).json({ error: result.reason });
    }

    const user = await UserModel.findOne({ id: userPayload.userId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const worker = await WorkerModel.findOne({ id: userPayload.workerId });

    const oldEmail = user.email || null;
    const now = new Date().toISOString();
    const updatedEmail = newEmail.toLowerCase();
    user.email = updatedEmail;
    user.emailVerified = true;
    user.updatedAt = now;
    await user.save();

    if (worker) {
      worker.email = updatedEmail;
      worker.updatedAt = now;
      await worker.save();
    }

    await bumpTokenVersion(user.id);
    await addAuditLog(userPayload.email || userPayload.userId, 'worker_change_email', 'worker', userPayload.workerId!, { oldEmail }, { newEmail });

    const token = generateToken({
      userId: user.id,
      email: updatedEmail,
      role: 'worker',
      workerId: user.workerId || undefined,
      tokenVersion: user.tokenVersion,
    });

    res.json({
      success: true,
      token,
      email: updatedEmail,
      message: 'Email address updated successfully! Future notifications will be sent to this address.',
    });
  } catch (err) {
    console.error('worker/change-email error:', err);
    res.status(500).json({ error: 'Email change failed. Please try again.' });
  }
});

// 13. Delete Account (Req 8 & 39)
router.post('/delete-account', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { password, otp } = req.body;
    const userPayload = req.user!;

    const user = await UserModel.findOne({ id: userPayload.userId });
    if (!user) {
      return res.status(404).json({ error: 'User account not found' });
    }

    let authenticated = false;
    if (password && verifyPassword(password, user.passwordHash)) {
      authenticated = true;
    } else if (otp && user.email) {
      // OTP confirmation needs an email address; accounts without one must use their password.
      const result = await verifyAndConsumeOtp(user.email, 'delete_account', otp);
      authenticated = result.ok;
    }

    if (!authenticated) {
      return res.status(400).json({ error: 'Incorrect password or invalid OTP code' });
    }

    if (user.role === 'worker') {
      // Worker account deletion (Req 39: permanently deleted)
      await WorkerModel.deleteOne({ id: user.workerId });
      await SuspensionModel.deleteMany({ workerId: user.workerId });
      await WarningModel.deleteMany({ workerId: user.workerId });
      await AppealModel.deleteMany({ workerId: user.workerId });
    } else {
      // Customer account deletion (Req 8: existing worker ratings submitted
      // by the customer REMAIN - only the account's own private data goes).
      await ContactHistoryModel.deleteMany({ customerId: user.id });
    }

    await UserModel.deleteOne({ id: user.id });
    await addAuditLog(user.email || user.loginId || user.id, 'account_deleted_permanently', user.role, user.id);

    res.json({ success: true, message: 'Account permanently deleted.' });
  } catch (err) {
    console.error('delete-account error:', err);
    res.status(500).json({ error: 'Account deletion failed. Please try again.' });
  }
});

// 14. Current Session Info (/api/auth/me)
router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userPayload = req.user!;
    const user = await UserModel.findOne({ id: userPayload.userId });

    if (!user) {
      return res.status(404).json({ error: 'Session user not found' });
    }

    let worker = null;
    if (user.role === 'worker') {
      worker = await WorkerModel.findOne({ id: user.workerId });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        loginId: user.loginId || null,
        role: user.role,
        emailVerified: user.emailVerified,
        favourites: user.favourites || [],
        status: user.status,
        workerId: user.workerId,
        googleLinked: Boolean(user.googleId),
      },
      worker,
    });
  } catch (err) {
    console.error('/me error:', err);
    res.status(500).json({ error: 'Could not load session. Please try again.' });
  }
});

export default router;