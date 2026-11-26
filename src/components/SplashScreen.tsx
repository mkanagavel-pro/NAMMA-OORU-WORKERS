import React from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// The splash fades in only after this delay (matches the CSS animation-delay in index.css),
// so a load that finishes sooner never shows it at all - no flash on fast connections.
export const SPLASH_SHOW_DELAY_MS = 350;

interface SplashScreenProps {
  status: 'loading' | 'error';
  /** true while the splash fades out after the app became ready */
  leaving?: boolean;
  onRetry: () => void;
}

// Full-screen startup screen shown ONLY while the app is genuinely initialising
// (session check + first worker list). It uses the official logo image as supplied
// (/logo-official.png) and never alters it: the glow/pulse is a separate element
// behind it. All motion is plain CSS (see index.css, "Splash screen") and is
// disabled under prefers-reduced-motion.
export const SplashScreen: React.FC<SplashScreenProps> = ({ status, leaving = false, onRetry }) => {
  const { t } = useLanguage();
  const isError = status === 'error';

  return (
    <div
      className={`now-splash ${leaving ? 'now-splash-leaving' : ''}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={!isError}
      data-testid="splash-screen"
      data-status={status}
    >
      <div className="now-splash-inner">
        <div className="now-splash-logo-wrap">
          <span className="now-splash-glow" aria-hidden="true" />
          <img
            src="/logo-official.png"
            alt="Namma Ooru Workers"
            width={300}
            height={299}
            className="now-splash-logo"
            decoding="async"
            fetchPriority="high"
            draggable={false}
          />
        </div>

        <p className="now-splash-title">
          Namma Ooru <span>Workers</span>
        </p>
        <p className="now-splash-subtitle">Trusted Local Workers in Tamil Nadu</p>

        {isError ? (
          <div className="now-splash-status">
            <p className="now-splash-error-title">{t('splash_error_title')}</p>
            <p className="now-splash-text">{t('splash_error_body')}</p>
            <button type="button" onClick={onRetry} className="now-splash-retry" data-testid="splash-retry">
              {t('splash_retry')}
            </button>
          </div>
        ) : (
          <div className="now-splash-status">
            <span className="now-splash-spinner" aria-hidden="true" />
            <p className="now-splash-text">{t('splash_loading')}</p>
          </div>
        )}
      </div>
    </div>
  );
};
