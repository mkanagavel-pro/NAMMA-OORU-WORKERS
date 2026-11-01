import React, { useState, useEffect } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Phone,
  Briefcase,
  MapPin,
  Eye,
  EyeOff,
  CheckCircle2,
  Shield,
  KeyRound,
} from 'lucide-react';
import { GoogleButton } from './GoogleButton';
import { Modal } from './Modal';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { WORKER_CATEGORIES, TN_DISTRICTS } from '../data/tamilNaduData';
import { LOCATION_CONFIGURED_DISTRICTS, SALEM_DISTRICT_ID } from '../data/salemLocations';
import { WorkerLocationFields, resolveAreaPayload } from './WorkerLocationFields';
import { requestRecovery, getRecoveryStatus } from '../api/recovery';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRole?: 'customer' | 'worker';
  /** Which tab to show when the modal opens (navbar Sign Up / Sign In). Omit to keep the current tab. */
  initialTab?: 'login' | 'signup';
  /** Set when a person returns from Google with a verified identity but no account yet: the modal becomes the sign-up completion form. */
  googleSignup?: { ticket: string; email: string; name: string } | null;
  /** Message to show when the modal opens (e.g. a Google sign-in problem). */
  initialError?: string;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialRole = 'customer',
  initialTab,
  googleSignup = null,
  initialError = '',
}) => {
  const { language, t } = useLanguage();
  const {
    loginCustomer,
    registerCustomer,
    loginWorker,
    registerWorker,
    completeGoogleSignup,
    verifyEmailOtp,
    resendOtp,
    forgotPassword,
    resetPassword,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'otp' | 'forgot'>('login');
  const [userRole, setUserRole] = useState<'customer' | 'worker'>('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState(WORKER_CATEGORIES[0].id);
  // Worker registration is limited to districts that have a verified taluk
  // configuration (Salem). The backend enforces the same rule.
  const [district, setDistrict] = useState(SALEM_DISTRICT_ID);
  const [taluk, setTaluk] = useState('');
  const [areaChoice, setAreaChoice] = useState('');
  const [publicArea, setPublicArea] = useState(''); // manual "other area" text
  const [serviceAreas, setServiceAreas] = useState('');
  const [description, setDescription] = useState('');
  const [experience, setExperience] = useState('5');
  const [rate, setRate] = useState('₹350 / visit');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'email' | 'reset'>('email');
  // V6 worker auth: User ID (login handle), login identifier, confirm password, consent
  const [loginId, setLoginId] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [consent, setConsent] = useState(false);
  // Forgot password for workers: email code, or admin-assisted request (no email)
  const [recoveryMode, setRecoveryMode] = useState<'email' | 'admin'>('email');
  const [recoveryIdentifier, setRecoveryIdentifier] = useState('');
  const [recoveryRef, setRecoveryRef] = useState('');
  const [recoveryStatusText, setRecoveryStatusText] = useState('');

  // SECURITY: the previous "Quick Demo Login" feature has been removed - it
  // called loginAdmin() with a hardcoded administrator password embedded
  // directly in this file, which ships to every visitor's browser as plain
  // JavaScript. That is a critical credential-exposure vulnerability
  // regardless of environment. Use the login form normally with the
  // dev-only seeded accounts printed in the server console on startup.

  // "Continue with Google" is a plain redirect flow handled by the server (see GoogleButton / server/routes/googleAuth.ts):
  // no Google script runs in this page. When the person comes back with a verified Google identity but no account yet,
  // App opens this modal in "Google sign-up" mode (googleSignup prop): the e-mail is fixed (Google verified it) and the
  // person chooses Customer / Worker and supplies what Google cannot (User ID, phone, password, work details...).
  useEffect(() => {
    if (!isOpen) return;
    if (googleSignup) {
      setActiveTab('signup');
      setEmail(googleSignup.email);
      setName(googleSignup.name || '');
    }
    else if (initialTab) setActiveTab(initialTab);
    if (initialError) setErrorMessage(initialError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, googleSignup?.ticket, initialError, initialTab]);

  // All hooks are above this line. Early return must come AFTER every hook
  // so the hook order is identical whether the modal is open or closed.
  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    if (activeTab === 'login') {
      let res;
      // Administrators do NOT sign in here: they use the dedicated /admin/login page.
      if (userRole === 'worker') {
        res = await loginWorker(identifier, password);
      } else {
        res = await loginCustomer(email, password);
      }

      setIsSubmitting(false);
      if (res.success) {
        onClose();
      } else if ('requiresVerification' in res && res.requiresVerification && res.email) {
        // The account exists and the password was correct, but the backend
        // correctly refused to log them in because email verification was
        // never completed (requirement D/F: closing the OTP screen must
        // not be a backdoor into an authenticated session via Login
        // either). Route them back to the OTP screen so they can resume
        // verification, with a clear explanation of why.
        setEmail(res.email);
        setErrorMessage('');
        setSuccessMessage('Email verification is required to continue. Please enter the OTP sent to your email, or resend a new code below.');
        setActiveTab('otp');
      } else {
        setErrorMessage(res.error || 'Invalid credentials');
      }
    } else if (activeTab === 'signup') {
      if (googleSignup && userRole === 'customer') {
        // Google already verified the e-mail; no password or OTP step. The server re-reads the verified identity from its ticket.
        const res = await completeGoogleSignup(googleSignup.ticket, { role: 'customer' });
        setIsSubmitting(false);
        if (res.success) onClose();
        else setErrorMessage(res.error || t('google_err_server'));
      } else if (userRole === 'customer') {
        const res = await registerCustomer(email, password);
        setIsSubmitting(false);
        if (res.success) {
          // Open OTP screen
          setActiveTab('otp');
          setSuccessMessage('Account created! A 6-digit OTP has been dispatched to your email.');
        } else {
          setErrorMessage(res.error || 'Registration failed');
        }
      } else {
        // Worker Registration - real GPS capture (Req: GPS + manual fallback).
        // Tries the browser's actual location first; if permission is
        // denied, unavailable, or times out, falls back to the selected
        // district's own center coordinates (TN_DISTRICTS already carries
        // real per-district lat/lng) rather than a single fixed point for
        // the whole state. Either way, the worker is told which happened.
        if (password.length < 6) {
          setIsSubmitting(false);
          setErrorMessage(t('reg_password_min'));
          return;
        }
        if (password !== confirmPassword) {
          setIsSubmitting(false);
          setErrorMessage('Password and Confirm Password do not match');
          return;
        }
        if (!consent) {
          setIsSubmitting(false);
          setErrorMessage(t('reg_consent'));
          return;
        }
        const place = resolveAreaPayload({ district, taluk, areaChoice, customArea: publicArea });
        if (!place.ok) {
          setIsSubmitting(false);
          setErrorMessage(place.error === 'taluk' ? 'Please select your taluk.' : 'Please select your area (or choose "Other area in this taluk" and enter it).');
          return;
        }
        const districtObj = TN_DISTRICTS.find((d) => d.id === district) || TN_DISTRICTS[0];

        const coordinates = await new Promise<{ lat: number; lng: number; usedGps: boolean }>((resolve) => {
          if (!navigator.geolocation) {
            resolve({ lat: districtObj.lat, lng: districtObj.lng, usedGps: false });
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({ lat: position.coords.latitude, lng: position.coords.longitude, usedGps: true });
            },
            () => {
              // Denied, unavailable, or timed out - use the district center
              // as an honest, still-reasonably-accurate manual fallback.
              resolve({ lat: districtObj.lat, lng: districtObj.lng, usedGps: false });
            },
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
          );
        });

        const workerData = {
          name,
          // Email is optional. Left out entirely when blank (the server never stores '').
          ...(email.trim() ? { email: email.trim() } : {}),
          loginId,
          password,
          confirmPassword, // validated server-side, never stored
          consent,
          phone,
          category,
          district,
          taluk: place.taluk,
          areaId: place.areaId,
          publicArea: place.publicArea,
          serviceAreas: serviceAreas
            ? serviceAreas.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          description,
          experience: Number(experience) || 1,
          rate: rate || '₹300 / service',
          profilePhoto:
            profilePhoto ||
            'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=400&auto=format&fit=crop&q=80',
          // ROOT CAUSE FIX: the backend (server/routes/auth.ts, POST
          // /worker/register) reads flat top-level `lat`/`lng` fields from
          // the request body - it does NOT read a nested `coordinates`
          // object. Sending `coordinates: {lat, lng}` here meant
          // req.body.lat/.lng were always undefined server-side, so every
          // registration was rejected with "Location coordinates are
          // required" regardless of whether GPS succeeded or the district
          // fallback was used. The backend itself nests these into
          // Worker.coordinates when saving to MongoDB - that's an internal
          // storage detail, not the wire format this endpoint expects.
          lat: coordinates.lat,
          lng: coordinates.lng,
        };

        const res: { success: boolean; error?: string; loggedIn?: boolean } = googleSignup
          // Identity comes from the server's ticket, never from the form.
          ? await completeGoogleSignup(googleSignup.ticket, { role: 'worker', ...workerData, email: undefined }).then((r) => ({ ...r, loggedIn: r.success }))
          : await registerWorker(workerData);
        setIsSubmitting(false);
        if (res.success && res.loggedIn) {
          // No email given -> nothing to verify; session already established.
          onClose();
        } else if (res.success) {
          setActiveTab('otp');
          setSuccessMessage(
            coordinates.usedGps
              ? 'Worker profile registered using your current location! Please enter the 6-digit verification OTP.'
              : `Worker profile registered using ${districtObj.nameEn}'s approximate location (location access wasn't granted - you can fine-tune this later from your profile). Please enter the 6-digit verification OTP.`
          );
        } else {
          setErrorMessage(res.error || 'Registration failed');
        }
      }
    } else if (activeTab === 'otp') {
      const res = await verifyEmailOtp(email, otp);
      setIsSubmitting(false);
      if (res.success) {
        setSuccessMessage('Email verified successfully!');
        setTimeout(() => onClose(), 1200);
      } else {
        setErrorMessage(res.error || 'Invalid or expired OTP');
      }
    } else if (activeTab === 'forgot') {
      if (userRole === 'worker' && recoveryMode === 'admin') {
        // Admin-assisted recovery (worker has no email). Neutral response either way.
        const r = await requestRecovery(recoveryIdentifier);
        setIsSubmitting(false);
        if (r.success) {
          setRecoveryRef(r.reference || '');
          setRecoveryStatusText('');
          setSuccessMessage(r.message || '');
        } else {
          setErrorMessage(r.error || 'Request failed');
        }
        return;
      }
      if (forgotStep === 'email') {
        const res = await forgotPassword(email);
        setIsSubmitting(false);
        if (res.success) {
          setForgotStep('reset');
          setSuccessMessage(res.message || 'If an account exists for this email, a reset code was sent.');
        } else {
          setErrorMessage(res.error || 'Request failed');
        }
      } else {
        // forgotStep === 'reset'
        if (newPassword.length < 6) {
          setIsSubmitting(false);
          setErrorMessage('Password must be at least 6 characters');
          return;
        }
        if (newPassword !== confirmNewPassword) {
          setIsSubmitting(false);
          setErrorMessage('Passwords do not match');
          return;
        }
        // Does NOT log the user in (requirement: no auto-login before
        // reset completes) - resetPassword() only updates the password
        // hash server-side and invalidates other existing sessions. The
        // user logs in normally afterward, below.
        const res = await resetPassword(email, otp, newPassword);
        setIsSubmitting(false);
        if (res.success) {
          setActiveTab('login');
          setForgotStep('email');
          setOtp('');
          setNewPassword('');
          setConfirmNewPassword('');
          setSuccessMessage('Password reset successful! Please log in with your new password.');
        } else {
          setErrorMessage(res.error || 'Password reset failed');
        }
      }
    }
  };

  return (
    <Modal
      onClose={onClose}
      closeOnOverlay={false}
      widthClass="max-w-lg"
      bodyClassName="p-5 sm:p-7 pt-14 sm:pt-14"
      ariaLabel="Login / Register"
      onCloseButton={() => {
            // Requirement D: closing the OTP screen without verifying must
            // never authenticate the user (fixed at the auth-state layer -
            // see AuthContext.registerCustomer/registerWorker, which no
            // longer set a session here at all). This just adds the
            // explicit, user-facing explanation for why they're being
            // returned to a logged-out state.
            if (activeTab === 'otp') {
              alert('Email verification is required to continue. Your account has been created but is not yet active - sign in again any time to resume verification.');
            }
            onClose();
      }}
    >
      <div>

        {/* Quick Demo Fill Pill removed: it shipped hardcoded admin/worker/
            customer credentials directly in the browser bundle, which is a
            critical credential-exposure vulnerability. Anyone could read
            these out of the compiled JS and log in as an administrator.
            For local testing, use the demo accounts seeded in
            server/db.ts (development only - they are never seeded in
            production) by typing the credentials in manually. */}
        {activeTab !== 'otp' && activeTab !== 'forgot' && (
          <div className="flex rounded-2xl bg-stone-200/70 p-1 mb-5 mr-11 sm:mr-12 gap-1">
            <button
              type="button"
              onClick={() => setUserRole('customer')}
              className={`flex-1 min-w-0 py-2 text-xs font-bold rounded-xl transition truncate ${
                userRole === 'customer'
                  ? 'bg-white text-[#176B4D] shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t('auth_role_customer')}
            </button>
            <button
              type="button"
              onClick={() => setUserRole('worker')}
              className={`flex-1 min-w-0 py-2 text-xs font-bold rounded-xl transition truncate ${
                userRole === 'worker'
                  ? 'bg-white text-[#176B4D] shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {t('auth_role_worker')}
            </button>
          </div>
        )}

        {googleSignup && activeTab === 'signup' && (
          <div className="mb-4 p-3 rounded-2xl bg-[#176B4D]/5 border border-[#176B4D]/15" data-testid="google-signup-banner">
            <p className="text-xs font-extrabold text-[#176B4D]">{t('google_signup_title')}</p>
            <p className="text-[11px] text-[#586B63] mt-1 leading-snug">{t('google_signup_hint')}</p>
          </div>
        )}

        {/* Login / Sign Up Tabs */}
        {activeTab !== 'otp' && activeTab !== 'forgot' && !googleSignup && (
          <div className="flex border-b border-stone-200 mb-5">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setErrorMessage('');
              }}
              className={`pb-2 text-sm font-extrabold transition border-b-2 mr-6 ${
                activeTab === 'login'
                  ? 'border-[#176B4D] text-[#176B4D]'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              {t('auth_login_tab')}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('signup');
                setErrorMessage('');
              }}
              className={`pb-2 text-sm font-extrabold transition border-b-2 ${
                activeTab === 'signup'
                  ? 'border-[#176B4D] text-[#176B4D]'
                  : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              {t('auth_signup_tab')}
            </button>
          </div>
        )}

        {/* Notifications & Error messages */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-[#D64545]">
            {errorMessage}
          </div>
        )}
        {successMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="min-w-0 flex-1 break-words">{successMessage}</span>
            {/* Dismiss button - a normal flex sibling (not absolutely
                positioned) so it can never overlap the message text: flex
                items never occupy the same space. w-10 h-10 gives a real
                40px touch target instead of relying on icon+padding sizing. */}
            <button
              type="button"
              onClick={() => setSuccessMessage('')}
              aria-label="Dismiss"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-emerald-700 hover:bg-emerald-100 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Forms */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* OTP Verification Screen */}
          {activeTab === 'otp' && (
            <div className="text-center py-2 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                <KeyRound className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-[#26332D]">
                  {t('auth_verify_email_title')}
                </h4>
                <p className="text-xs text-[#586B63] mt-1">
                  We sent a 6-digit verification code to{' '}
                  <strong className="text-[#176B4D]">{email}</strong>. Please check your email
                  inbox (and spam folder) for the code.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="• • • • • •"
                  className="w-48 mx-auto text-center text-2xl tracking-[0.5em] font-black py-2.5 px-4 rounded-2xl border-2 border-[#176B4D]/30 focus:border-[#176B4D] focus:outline-none bg-white"
                  required
                />
              </div>

              <div className="flex items-center justify-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={async () => {
                    await resendOtp(email, 'verify_email');
                    setSuccessMessage('New OTP sent! Please check your email inbox.');
                  }}
                  className="text-[#176B4D] hover:underline font-bold"
                >
                  {t('auth_resend_otp')}
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || otp.length < 6}
                  className="w-full py-3 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying...' : t('auth_submit_otp')}
                </button>
              </div>
            </div>
          )}

          {/* Forgot Password Screen - two steps: request a code, then set a
              new password. Does not establish a session at any point here;
              success returns the user to the normal Login tab (see
              handleSubmit's 'forgot' branch) so they log in the ordinary
              way with their new password. */}
          {activeTab === 'forgot' && (
            <div className="space-y-4">
              <div className="text-center py-1">
                <div className="w-12 h-12 rounded-2xl bg-[#176B4D]/10 text-[#176B4D] flex items-center justify-center mx-auto mb-3">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h4 className="text-base font-black text-[#26332D]">{t('auth_forgot_password')}</h4>
                <p className="text-xs text-[#586B63] mt-1">
                  {forgotStep === 'email'
                    ? 'Enter your registered email and we will send you a reset code.'
                    : `Enter the 6-digit code sent to ${email} and choose a new password.`}
                </p>
              </div>

              {userRole === 'worker' && (
                <div className="flex rounded-2xl bg-stone-200/70 p-1 gap-1" role="tablist">
                  {(['email', 'admin'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="tab"
                      aria-selected={recoveryMode === m}
                      onClick={() => {
                        setRecoveryMode(m);
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className={`flex-1 min-w-0 py-2 px-2 text-xs font-bold rounded-xl transition ${
                        recoveryMode === m ? 'bg-white text-[#176B4D] shadow-xs' : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {m === 'email' ? t('forgot_mode_email') : t('forgot_mode_admin')}
                    </button>
                  ))}
                </div>
              )}

              {userRole === 'worker' && recoveryMode === 'admin' ? (
                <div className="space-y-3" data-testid="recovery-admin-block">
                  <p className="text-xs text-[#586B63]">{t('recovery_intro')}</p>
                  {!recoveryRef ? (
                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">{t('recovery_identifier_label')}</label>
                      <input
                        type="text"
                        required
                        autoComplete="username"
                        value={recoveryIdentifier}
                        onChange={(e) => setRecoveryIdentifier(e.target.value)}
                        placeholder={t('login_identifier_placeholder')}
                        className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                      />
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                      <div className="text-[11px] font-bold text-emerald-800">{t('recovery_reference')}</div>
                      <div className="text-lg font-black tracking-wider text-[#176B4D] break-all select-all" data-testid="recovery-ref">{recoveryRef}</div>
                      <p className="text-[11px] text-[#586B63] mt-1">{t('recovery_keep_ref')}</p>
                      <button
                        type="button"
                        onClick={async () => {
                          const r = await getRecoveryStatus(recoveryRef);
                          setRecoveryStatusText(r.success && r.status ? t(`recovery_status_${r.status}` as any) : r.error || '');
                        }}
                        className="mt-2 text-xs font-bold text-[#176B4D] hover:underline"
                      >
                        {t('recovery_check_status')}
                      </button>
                      {recoveryStatusText && <p className="text-xs font-semibold text-[#26332D] mt-1.5">{recoveryStatusText}</p>}
                    </div>
                  )}
                </div>
              ) : forgotStep === 'email' ? (
                <div>
                  <label className="block text-xs font-bold text-[#176B4D] mb-1">{t('auth_email')}</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <input
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="• • • • • •"
                      className="w-48 mx-auto block text-center text-2xl tracking-[0.5em] font-black py-2.5 px-4 rounded-2xl border-2 border-[#176B4D]/30 focus:border-[#176B4D] focus:outline-none bg-white"
                      required
                    />
                  </div>
                  <div className="flex items-center justify-center text-xs">
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await forgotPassword(email);
                        setSuccessMessage(res.message || 'A new code has been sent to your email.');
                      }}
                      className="text-[#176B4D] hover:underline font-bold"
                    >
                      {t('auth_resend_otp')}
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">New Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full text-xs pl-9 pr-10 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">Confirm Password</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (userRole === 'worker' && recoveryMode === 'admin' ? recoveryRef !== '' : forgotStep === 'reset' && otp.length < 6)
                  }
                  className={`w-full py-3 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition disabled:opacity-50 ${
                    userRole === 'worker' && recoveryMode === 'admin' && recoveryRef ? 'hidden' : ''
                  }`}
                >
                  {isSubmitting
                    ? 'Processing...'
                    : userRole === 'worker' && recoveryMode === 'admin'
                    ? t('recovery_submit')
                    : forgotStep === 'email'
                    ? 'Send Reset Code'
                    : 'Reset Password'}
                </button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setForgotStep('email');
                    setErrorMessage('');
                    setOtp('');
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setRecoveryRef('');
                    setRecoveryStatusText('');
                    setRecoveryIdentifier('');
                  }}
                  className="text-xs text-stone-500 hover:text-stone-800 font-semibold"
                >
                  &larr; Back to {t('auth_login_tab')}
                </button>
              </div>
            </div>
          )}

          {/* Standard Fields (Login / Signup) */}
          {(activeTab === 'login' || activeTab === 'signup') && (
            <>
              {/* Worker Extra Registration Fields */}
              {activeTab === 'signup' && userRole === 'worker' && (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">
                      {t('profile_name')} *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. S. Kannan (எஸ். கண்ணன்)"
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">{t('reg_userid_label')}</label>
                    <input
                      type="text"
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={20}
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="kannan_mason"
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                    />
                    <p className="text-[10px] text-[#586B63] mt-1">{t('reg_userid_hint')}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">
                        {t('profile_category')} *
                      </label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                      >
                        {WORKER_CATEGORIES.map((c) => (
                          <option key={c.id} value={c.id}>
                            {language === 'ta' ? c.nameTa : c.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">
                        {t('profile_district')} *
                      </label>
                      <select
                        value={district}
                        onChange={(e) => {
                          setDistrict(e.target.value);
                          setTaluk('');
                          setAreaChoice('');
                          setPublicArea('');
                        }}
                        className="w-full min-w-0 text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                      >
                        {TN_DISTRICTS.filter((d) => d.id in LOCATION_CONFIGURED_DISTRICTS).map((d) => (
                          <option key={d.id} value={d.id}>
                            {language === 'ta' ? d.nameTa : d.nameEn}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">
                        {t('profile_phone')} *
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit mobile"
                        autoComplete="tel"
                        className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                      />
                      <p className="text-[10px] text-[#586B63] mt-1">{t('reg_phone_hint')}</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">
                        {t('profile_experience')} (Yrs)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <WorkerLocationFields
                    value={{ district, taluk, areaChoice, customArea: publicArea }}
                    onChange={(patch) => {
                      if (patch.taluk !== undefined) setTaluk(patch.taluk);
                      if (patch.areaChoice !== undefined) setAreaChoice(patch.areaChoice);
                      if (patch.customArea !== undefined) setPublicArea(patch.customArea);
                    }}
                  />

                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">
                      {t('profile_service_areas')} (Comma separated)
                    </label>
                    <input
                      type="text"
                      value={serviceAreas}
                      onChange={(e) => setServiceAreas(e.target.value)}
                      
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">
                        {t('profile_rate')}
                      </label>
                      <input
                        type="text"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        placeholder="e.g. ₹350 / visit"
                        className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#176B4D] mb-1">
                        Profile Photo URL
                      </label>
                      <input
                        type="url"
                        value={profilePhoto}
                        onChange={(e) => setProfilePhoto(e.target.value)}
                        placeholder="https://..."
                        className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">
                      {t('profile_about')}
                    </label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Brief description of skills and expertise..."
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Worker login: User ID or phone (the server decides which) */}
              {activeTab === 'login' && userRole === 'worker' && (
                <div>
                  <label className="block text-xs font-bold text-[#176B4D] mb-1">{t('login_identifier_label')}</label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={t('login_identifier_placeholder')}
                    className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                  />
                </div>
              )}

              {/* Email Field (optional for worker registration, hidden for worker login) */}
              {!(activeTab === 'login' && userRole === 'worker') && (
              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {googleSignup ? t('google_email_verified') : activeTab === 'signup' && userRole === 'worker' ? t('reg_email_optional') : t('auth_email')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    required={!(activeTab === 'signup' && userRole === 'worker')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={Boolean(googleSignup)}
                    placeholder="name@example.com"
                    className={`w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 focus:outline-none focus:ring-1 focus:ring-[#176B4D] ${googleSignup ? 'bg-stone-100 text-stone-600 cursor-not-allowed' : 'bg-white'}`}
                  />
                </div>
                {activeTab === 'signup' && userRole === 'worker' && !googleSignup && (
                  <p className="text-[10px] text-[#586B63] mt-1">{t('reg_email_hint')}</p>
                )}
              </div>
              )}

              {/* Password Field - registration uses its own label/placeholder
                  keys (auth_password_create*); login keeps the original
                  auth_password label and dot placeholder unchanged.
                  Not needed for a Google customer sign-up (Google verified the e-mail). */}
              {!(googleSignup && userRole === 'customer') && (
              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {activeTab === 'signup' ? t('auth_password_create') : t('auth_password')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={activeTab === 'signup' ? t('auth_password_create_placeholder') : '••••••••'}
                    className="w-full text-xs pl-9 pr-10 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {activeTab === 'login' && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('forgot');
                        setForgotStep('email');
                        setErrorMessage('');
                        setSuccessMessage('');
                      }}
                      className="text-[11px] text-[#176B4D] hover:underline font-bold"
                    >
                      {t('auth_forgot_password')}
                    </button>
                  </div>
                )}
              </div>
              )}

              {activeTab === 'signup' && userRole === 'worker' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">{t('reg_confirm_password')}</label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                      />
                    </div>
                    <p className="text-[10px] text-[#586B63] mt-1">{t('reg_password_min')}</p>
                  </div>
                  <label className="flex items-start gap-2 text-[11px] text-[#26332D] leading-snug cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 w-4 h-4 shrink-0 accent-[#176B4D]"
                    />
                    <span className="min-w-0 break-words">{t('reg_consent')}</span>
                  </label>
                </>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting
                    ? 'Processing...'
                    : activeTab === 'login'
                    ? t('auth_login_btn')
                    : googleSignup
                    ? t('google_complete_btn')
                    : t('auth_signup_btn')}
                </button>
              </div>

              {/* Continue with Google: login AND registration, Customer and Worker. It is a redirect to Google
                  handled by the server; a person with no account is brought back to finish sign-up (role, User ID,
                  phone ...). Hidden while that completion form is open. */}
              {(activeTab === 'login' || activeTab === 'signup') && !googleSignup && (
                <div className="pt-2">
                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-stone-200"></div>
                    <span className="flex-shrink mx-3 text-[10px] text-stone-400 font-semibold uppercase">
                      {t('auth_or_divider')}
                    </span>
                    <div className="flex-grow border-t border-stone-200"></div>
                  </div>
                  <GoogleButton />
                </div>
              )}
            </>
          )}
        </form>
      </div>
    </Modal>
  );
};
