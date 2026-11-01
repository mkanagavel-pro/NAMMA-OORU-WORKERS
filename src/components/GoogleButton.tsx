import React, { useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchGoogleEnabled, GOOGLE_START_URL } from '../api/googleAuth';

// "Continue with Google" following Google's sign-in branding guidelines: white surface, thin neutral border,
// the standard multi-colour "G" (unmodified), dark-grey label with the exact wording "Continue with Google".
// It is a plain link: the whole sign-in happens by redirect, so there is no popup, no third-party script and no
// Google code running inside our page. When the deployment has no Google credentials the button is shown
// disabled (never faked).
const GoogleG: React.FC = () => (
  <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true" focusable="false" className="shrink-0">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

const base =
  'w-full min-h-[44px] px-3 rounded-xl border bg-white flex items-center justify-center gap-2.5 text-sm font-medium min-w-0 select-none';

export const GoogleButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetchGoogleEnabled().then((v) => alive && setEnabled(v));
    return () => {
      alive = false;
    };
  }, []);

  if (enabled) {
    return (
      <a
        href={GOOGLE_START_URL}
        data-testid="google-continue"
        className={`${base} border-[#dadce0] text-[#3c4043] hover:bg-[#f8f9fa] hover:border-[#d2e3fc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4285F4] ${className}`}
      >
        <GoogleG />
        <span className="truncate min-w-0">{t('google_continue')}</span>
      </a>
    );
  }
  return (
    <button
      type="button"
      disabled
      data-testid="google-continue-disabled"
      title={t('google_not_configured')}
      className={`${base} border-[#dadce0] text-[#3c4043]/50 cursor-not-allowed opacity-70 ${className}`}
    >
      <GoogleG />
      <span className="truncate min-w-0">{t('google_continue')}</span>
    </button>
  );
};
