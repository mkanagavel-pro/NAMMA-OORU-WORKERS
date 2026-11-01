import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Logo } from './Logo';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

// Dedicated administrator sign-in at /admin/login.
//
// This page is only a door. It grants nothing by itself: the session comes from
// POST /api/auth/admin/login (the existing endpoint), and every /api/admin/* call
// is still authorised on the server from the account's real role. The page never
// reads a role from the URL, the form, or local storage.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const AdminLoginPage: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const { user, isLoading, loginAdmin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Already a verified administrator (the session was validated by GET /api/auth/me):
  // go straight to the dashboard. Workers/customers stay here and can sign in as admin.
  useEffect(() => {
    if (!isLoading && user?.role === 'admin') {
      window.location.replace('/admin');
    }
  }, [isLoading, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError(t('admin_login_required'));
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setError(t('admin_login_email_invalid'));
      return;
    }
    setError('');
    setIsSubmitting(true);
    const res = await loginAdmin(cleanEmail, password);
    if (res.success) {
      // Full navigation: the dashboard then re-validates the new token with the server.
      window.location.replace('/admin');
      return;
    }
    setIsSubmitting(false);
    setPassword('');
    if (res.network) setError(t('admin_login_network_error'));
    else if (res.status === 401 || res.status === 400) setError(t('admin_login_invalid'));
    else if (res.status === 429) setError(t('admin_login_rate_limited'));
    else setError(t('admin_login_server_error'));
  };

  return (
    <div className="min-h-screen bg-[#FAF7EF] text-[#26332D] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm min-w-0">
        <div className="flex justify-center mb-6">
          <Logo size="lg" />
        </div>

        <div className="glass-card rounded-3xl p-5 sm:p-7 shadow-sm" data-testid="admin-login-card">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 shrink-0 rounded-2xl bg-[#176B4D]/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#176B4D]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-[#26332D] leading-tight">
                {t('admin_login_title')}
              </h1>
              <p className="text-xs text-[#586B63]">{t('admin_login_subtitle')}</p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-xs text-[#586B63] py-6 text-center">{t('admin_login_checking')}</p>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4" autoComplete="on">
              {error && (
                <div
                  role="alert"
                  data-testid="admin-login-error"
                  className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-[#D64545]"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span className="min-w-0 break-words">{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="admin-email" className="block text-xs font-bold text-[#586B63] mb-1">
                  {t('admin_login_email')}
                </label>
                <input
                  id="admin-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#176B4D]/40"
                />
              </div>

              <div>
                <label htmlFor="admin-password" className="block text-xs font-bold text-[#586B63] mb-1">
                  {t('admin_login_password')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#E8B83D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full min-h-[44px] pl-9 pr-11 rounded-xl border border-stone-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#176B4D]/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t('admin_login_hide_password') : t('admin_login_show_password')}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-stone-500 hover:text-[#176B4D]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] rounded-xl bg-[#176B4D] hover:bg-[#2F8F68] disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold text-sm shadow-xs transition flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{t('admin_login_loading')}</span>
                  </>
                ) : (
                  <span>{t('admin_login_submit')}</span>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 mt-4 text-xs">
          <a
            href="/#login"
            className="inline-flex items-center gap-1 font-bold text-[#176B4D] hover:underline min-h-[36px]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {t('admin_login_back')}
          </a>
          {(
            <button
              type="button"
              onClick={() => setLanguage(language === 'ta' ? 'en' : 'ta')}
              className="font-semibold text-[#586B63] hover:text-[#176B4D] min-h-[36px] px-2"
            >
              {language === 'ta' ? 'English' : 'தமிழ்'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
