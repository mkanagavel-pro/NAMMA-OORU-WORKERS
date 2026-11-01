import React, { useEffect, useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Logo } from './Logo';
import { useLanguage } from '../i18n/LanguageContext';
import { checkResetToken, resetWithToken } from '../api/recovery';

// Dedicated page for admin-issued, single-use reset links:
//   https://<site>/reset-password#token=<token>
// The token lives in the URL FRAGMENT, so it is never sent to any server in
// the page request or in Referer headers. It is read once, removed from the
// address bar, and only ever sent in a POST body.
function readTokenFromHash(): string {
  const m = /(?:^#|&)token=([^&]+)/.exec(window.location.hash || '');
  try {
    return m ? decodeURIComponent(m[1]) : '';
  } catch {
    return '';
  }
}

type Phase = 'checking' | 'ready' | 'invalid' | 'used' | 'expired' | 'done';

export const ResetPasswordPage: React.FC = () => {
  const { t, language, setLanguage } = useLanguage();
  const [token, setToken] = useState(readTokenFromHash);
  const [phase, setPhase] = useState<Phase>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // If a different reset link is opened in this same tab (the address changes
  // only by its #fragment), start over with the new token instead of keeping
  // the previous link's state.
  useEffect(() => {
    const onHash = () => {
      const next = readTokenFromHash();
      if (!next) return;
      setToken(next);
      setPhase('checking');
      setPassword('');
      setConfirm('');
      setError('');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    // Keep the secret out of the address bar / history once it is in memory.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setPhase('invalid');
      return;
    }
    let cancelled = false;
    checkResetToken(token).then((r) => {
      if (cancelled) return;
      setPhase(r.valid ? 'ready' : r.reason === 'used' ? 'used' : r.reason === 'expired' ? 'expired' : 'invalid');
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError(t('reg_password_min'));
    if (password !== confirm) return setError('Password and Confirm Password do not match');
    setBusy(true);
    const r = await resetWithToken(token, password, confirm);
    setBusy(false);
    if (r.success) {
      setPassword('');
      setConfirm('');
      setPhase('done');
    } else if (r.reason === 'used' || r.reason === 'expired' || r.reason === 'invalid') {
      setPhase(r.reason as Phase);
    } else {
      setError(r.error || 'Reset failed');
    }
  };

  const problem =
    phase === 'invalid' ? t('reset_invalid') : phase === 'used' ? t('reset_used') : phase === 'expired' ? t('reset_expired') : '';

  return (
    <div className="min-h-[100dvh] bg-[#FAF7EF] flex items-start sm:items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-lg border border-stone-200 p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3 mb-5">
          <Logo size="sm" />
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'ta' : 'en')}
            className="text-xs font-bold text-[#176B4D] border border-[#176B4D]/30 rounded-full px-3 py-1.5"
          >
            {language === 'en' ? 'தமிழ்' : 'English'}
          </button>
        </div>

        <h1 className="text-lg font-black text-[#26332D] mb-3">{t('reset_title')}</h1>

        {phase === 'checking' && <p className="text-xs text-[#586B63]">{t('reset_checking')}</p>}

        {problem && (
          <div role="alert" className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-[#D64545]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{problem}</span>
          </div>
        )}

        {phase === 'done' && (
          <div role="status" className="flex items-start gap-2 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="min-w-0 break-words">{t('reset_success')}</span>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={submit} className="space-y-3.5">
            {error && (
              <div role="alert" className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-[#D64545]">
                {error}
              </div>
            )}
            <div>
              <label htmlFor="rp-new" className="block text-xs font-bold text-[#176B4D] mb-1">{t('reset_new_password')}</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  id="rp-new"
                  type={show ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm pl-9 pr-10 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                />
                <button type="button" aria-label="Show or hide password" onClick={() => setShow(!show)} className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-[#586B63] mt-1">{t('reg_password_min')}</p>
            </div>
            <div>
              <label htmlFor="rp-confirm" className="block text-xs font-bold text-[#176B4D] mb-1">{t('reset_confirm_password')}</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                <input
                  id="rp-confirm"
                  type={show ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full text-sm pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition disabled:opacity-50"
            >
              {busy ? '...' : t('reset_submit')}
            </button>
          </form>
        )}

        {phase !== 'checking' && phase !== 'ready' && (
          <a
            href="/"
            className="mt-4 block w-full text-center py-3 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition"
          >
            {t('reset_go_login')}
          </a>
        )}
      </div>
    </div>
  );
};
