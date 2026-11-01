import rateLimit from 'express-rate-limit';

// Route-specific limits. A single global limiter is not enough protection
// on its own (spec section 9) - auth/OTP endpoints get much tighter limits
// than general API traffic.

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again in a few minutes.' },
});

export const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // admin auth gets the tightest limit of all
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin login attempts. Please try again later.' },
});

export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8, // per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

export const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8, // covers verify-email, resend-otp, forgot-password, reset-password
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests. Please wait before trying again.' },
});

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10, // per IP per hour - prevents report-spam against workers
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reports submitted. Please try again later.' },
});

export const ratingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20, // generous, since updating your own rating repeatedly is legitimate
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many rating submissions. Please slow down.' },
});

export const profileUpdateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many profile update requests. Please slow down.' },
});

// Admin-assisted recovery (worker without email). Tight, because each request
// costs a human admin a phone call.
export const recoveryRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6, // per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many recovery requests. Please try again later.' },
});
export const recoveryLookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // status checks + reset-link validity checks
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});
export const recoveryResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

export const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many contact requests. Please slow down.' },
});

export const adminActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60, // generous for legitimate admin workflows, still bounds abuse of a compromised admin session
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many admin actions in a short time. Please slow down.' },
});

// General fallback for the whole /api surface - a safety net, not the
// primary defense (the route-specific limiters above are).
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

// "Continue with Google": start/callback are browser navigations, exchange/complete are API calls.
const googleLimiter = (max: number, message: string) =>
  rateLimit({ windowMs: 15 * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { error: message } });
export const googleStartLimiter = googleLimiter(30, 'Too many Google sign-in attempts. Please try again in a few minutes.');
export const googleCallbackLimiter = googleLimiter(30, 'Too many Google sign-in attempts. Please try again in a few minutes.');
export const googleExchangeLimiter = googleLimiter(30, 'Too many attempts. Please try again in a few minutes.');
export const googleCompleteLimiter = googleLimiter(20, 'Too many registration attempts. Please try again in a few minutes.');
