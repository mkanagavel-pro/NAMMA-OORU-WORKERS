import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  Crosshair,
  Sparkles,
  Briefcase,
  Star,
  CheckCircle2,
  Users,
  Shield,
  Heart,
  PhoneCall,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import { Navbar } from './components/Navbar';
import { MobileNav } from './components/MobileNav';
import { WorkerCard } from './components/WorkerCard';
import { WorkerProfileModal } from './components/WorkerProfileModal';
import { RatingModal } from './components/RatingModal';
import { ReportModal } from './components/ReportModal';
import { AuthModal } from './components/AuthModal';
import { WorkerDashboard } from './components/WorkerDashboard';
import { AdminPanel } from './components/AdminPanel';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { AdminLoginPage } from './components/AdminLoginPage';
import { consumeGoogleFragment } from './api/googleAuth';
import { SplashScreen, SPLASH_SHOW_DELAY_MS } from './components/SplashScreen';
import { FavouritesView } from './components/FavouritesView';
import { ContactedView } from './components/ContactedView';
import { NotificationDrawer } from './components/NotificationDrawer';
import { TN_DISTRICTS, getQuickCategories, getMoreCategories } from './data/tamilNaduData';
import { CategoryPicker } from './components/CategoryPicker';
import { Worker } from './types';
import { localizePlace, localizeTaluk, localizeDistrict } from './i18n/locationNames';
import { useLocationNames } from './i18n/useLocationNames';

// The admin dashboard lives at /admin. /admin/login is a separate standalone page (see App()).
const isAdminPath = () => /^\/admin(\/|$)/.test(window.location.pathname);

function MainApp() {
  const { language, t } = useLanguage();
  const loc = useLocationNames();
  const { user, token, isLoading: authLoading, refreshUserData, exchangeGoogleTicket } = useAuth();
  const { refreshNotifications } = useNotifications();

  // Navigation State
  const [activeTab, setActiveTab] = useState<
    'home' | 'favourites' | 'contacted' | 'worker-dash' | 'admin-panel'
  >(() => (isAdminPath() ? 'admin-panel' : 'home'));

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  // The server query is debounced so typing never fires a request (or an AI call) per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'proximity' | 'rating' | 'default'>('default');
  const [selectedTaluk, setSelectedTaluk] = useState('all');
  const [selectedArea, setSelectedArea] = useState('all');
  const [radiusKm, setRadiusKm] = useState('any'); // only sent when GPS coordinates exist

  // Districts open for public search + their selectable areas (server-driven).
  const [searchDistricts, setSearchDistricts] = useState<
    { id: string; nameEn: string; nameTa: string; areas: string[]; taluks?: { id: string; nameEn: string; areas: string[] }[] }[]
  >([]);

  // GPS Coordinates State
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsActive, setGpsActive] = useState(false);

  // Workers Data State
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingWorkers, setIsLoadingWorkers] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const searchRequestId = useRef(0); // ignore responses from superseded requests

  // Modals State
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalRole, setAuthModalRole] = useState<'customer' | 'worker'>('customer');
  const [authModalTab, setAuthModalTab] = useState<'login' | 'signup' | undefined>(undefined);

  // Contact notification prompt
  const [contactFeedback, setContactFeedback] = useState<string | null>(null);

  // Fetch Workers from API. All filtering/sorting/pagination is done by the
  // server (GET /api/workers); this only builds the query string.
  // ---- Startup / splash state --------------------------------------------------------
  // The splash is shown only while the app is genuinely initialising: the session check
  // (GET /api/auth/me) and the FIRST worker list. It ends as soon as both settle, with no
  // fixed delay. A failed first load or >20s without finishing shows an error + Retry.
  // After the first successful load it never comes back (later searches use the grid spinner).
  const INITIAL_FETCH_TIMEOUT_MS = 15000;
  const BOOT_GUARD_MS = 20000;
  const [workersInit, setWorkersInit] = useState<'pending' | 'ok' | 'error'>('pending');
  const firstLoadDone = useRef(false);
  const [bootDone, setBootDone] = useState(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const bootStart = useRef(Date.now());
  const appRootRef = useRef<HTMLDivElement>(null);

  const PAGE_SIZE = 24;
  const fetchWorkers = async (pageToLoad = 1) => {
    const requestId = ++searchRequestId.current;
    if (pageToLoad === 1) setIsLoadingWorkers(true);
    else setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.append('query', debouncedQuery.trim());
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (selectedDistrict !== 'all') params.append('district', selectedDistrict);
      if (selectedTaluk !== 'all') params.append('taluk', selectedTaluk);
      if (selectedArea !== 'all') params.append('area', selectedArea);
      if (availableOnly) params.append('available', 'true');
      if (verifiedOnly) params.append('verified', 'true');
      if (sortBy !== 'default') params.append('sort', sortBy);

      if (customerCoords) {
        params.append('lat', String(customerCoords.lat));
        params.append('lng', String(customerCoords.lng));
        if (radiusKm !== 'any') params.append('radius', radiusKm);
      }
      params.append('page', String(pageToLoad));
      params.append('limit', String(PAGE_SIZE));

      // Only the very first load is time-limited, so the splash can never hang forever.
      const isInitial = !firstLoadDone.current;
      const controller = isInitial ? new AbortController() : null;
      const abortTimer = controller ? setTimeout(() => controller.abort(), INITIAL_FETCH_TIMEOUT_MS) : null;
      let res: Response;
      try {
        res = await fetch(`/api/workers?${params.toString()}`, controller ? { signal: controller.signal } : undefined);
      } finally {
        if (abortTimer) clearTimeout(abortTimer);
      }
      if (requestId !== searchRequestId.current) return; // a newer search started
      if (res.ok) {
        const data = await res.json();
        setWorkers((prev) => (pageToLoad === 1 ? data.workers : [...prev, ...data.workers]));
        setTotalCount(data.total);
        setHasMore(Boolean(data.hasMore));
        setPage(pageToLoad);
        firstLoadDone.current = true;
        setWorkersInit('ok');
      } else if (!firstLoadDone.current) {
        setWorkersInit('error');
      }
    } catch (e) {
      console.error('Failed to fetch workers:', e);
      if (requestId === searchRequestId.current && !firstLoadDone.current) setWorkersInit('error');
    } finally {
      if (requestId === searchRequestId.current) {
        setIsLoadingWorkers(false);
        setIsLoadingMore(false);
      }
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 700);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Explicit submit (button / Enter): search now instead of waiting for the debounce.
  const submitSearch = () => {
    const q = searchQuery.trim();
    if (q !== debouncedQuery) setDebouncedQuery(q); // the fetch effect fires
    else fetchWorkers(1);
  };

  useEffect(() => {
    fetchWorkers(1);
  }, [
    debouncedQuery,
    selectedCategory,
    selectedDistrict,
    selectedTaluk,
    selectedArea,
    availableOnly,
    verifiedOnly,
    sortBy,
    customerCoords,
    radiusKm,
  ]);

  // Load the districts that are open for public search and their real areas.
  useEffect(() => {
    fetch('/api/workers/search-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.districts)) setSearchDistricts(data.districts);
      })
      .catch(() => {
        /* search still works without the area list */
      });
  }, []);

  // Splash gate: ready once the session check is done AND (for the public site) the first
  // worker list arrived. The admin dashboard only needs the session check.
  useEffect(() => {
    if (bootDone) return;
    if (!authLoading && (activeTab === 'admin-panel' || workersInit === 'ok')) {
      setBootDone(true);
      // Fade the splash out only if the user actually saw it (it fades in after SPLASH_SHOW_DELAY_MS).
      if (Date.now() - bootStart.current > SPLASH_SHOW_DELAY_MS) {
        setSplashLeaving(true);
        setTimeout(() => setSplashLeaving(false), 260);
      }
    }
  }, [bootDone, authLoading, activeTab, workersInit]);

  // Stuck guard: never leave the user on the splash indefinitely.
  useEffect(() => {
    if (bootDone) return;
    const timer = setTimeout(() => setBootTimedOut(true), BOOT_GUARD_MS);
    return () => clearTimeout(timer);
  }, [bootDone, bootAttempt]);

  // The app behind the splash is not reachable by keyboard / screen reader until it is ready.
  useEffect(() => {
    appRootRef.current?.toggleAttribute('inert', !bootDone);
  }, [bootDone]);

  const retryBoot = () => {
    setBootTimedOut(false);
    setWorkersInit('pending');
    setBootAttempt((n) => n + 1);
    refreshUserData();
    fetchWorkers(1);
  };

  // District whose taluks/areas are selectable right now: the chosen one, or the only enabled one.
  const activeSearchDistrict =
    selectedDistrict !== 'all'
      ? searchDistricts.find((d) => d.id === selectedDistrict)
      : searchDistricts.length === 1
      ? searchDistricts[0]
      : undefined;
  const talukOptions = activeSearchDistrict?.taluks ?? [];
  // Areas: those of the chosen taluk, otherwise the district-wide list.
  const areaOptions: string[] =
    selectedTaluk !== 'all'
      ? talukOptions.find((tk) => tk.id === selectedTaluk)?.areas ?? []
      : activeSearchDistrict?.areas ?? [];

  // Handle GPS Location Click (Req 21 & 23)
  // SECURITY/HONESTY: on denial or error, this must NOT silently substitute
  // a fake coordinate while claiming GPS succeeded - that was the previous
  // behavior here (fell back to a hardcoded Madurai point and still set
  // gpsActive=true). Now it clearly reports failure and leaves the
  // existing manual fallback (the district selector in the Navbar) as the
  // way to search by location instead.
  const handleUseGps = () => {
    if (!navigator.geolocation) {
      alert(
        'Geolocation is not supported by your browser. Please choose your district manually from the location menu instead.'
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCustomerCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setGpsActive(true);
        setSortBy('proximity');
      },
      (error) => {
        console.warn('Geolocation failed or denied:', error);
        setCustomerCoords(null);
        setGpsActive(false);
        alert(
          'Location access was denied or unavailable. Please choose your district manually from the location menu instead.'
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  };

  // Handle Call Worker (Req 10, 26, 27)
  const handleCallWorker = async (worker: Worker) => {
    if (worker.isSuspended) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/customer/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify({ workerId: worker.id, method: 'Call' }),
      });

      const data = await res.json();
      if (res.ok && data.actionUrl) {
        setContactFeedback(`Connecting call to ${worker.name}...`);
        setTimeout(() => setContactFeedback(null), 3000);
        refreshNotifications();
        window.location.href = data.actionUrl;
      }
    } catch (e) {
      console.error('Call failed:', e);
    }
  };

  // Handle WhatsApp Worker (Req 10, 26, 27)
  const handleWhatsAppWorker = async (worker: Worker) => {
    if (worker.isSuspended) return;

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/customer/contact', {
        method: 'POST',
        headers,
        body: JSON.stringify({ workerId: worker.id, method: 'WhatsApp' }),
      });

      const data = await res.json();
      if (res.ok && data.actionUrl) {
        setContactFeedback(`Opening WhatsApp for ${worker.name}...`);
        setTimeout(() => setContactFeedback(null), 3000);
        refreshNotifications();
        window.open(data.actionUrl, '_blank');
      }
    } catch (e) {
      console.error('WhatsApp failed:', e);
    }
  };

  // Rating Update Success
  const handleRatingSuccess = (workerId: string, newSummary: any) => {
    setWorkers((prev) =>
      prev.map((w) => (w.id === workerId ? { ...w, ratingSummary: newSummary } : w))
    );
    if (selectedWorker?.id === workerId) {
      setSelectedWorker((prev) => (prev ? { ...prev, ratingSummary: newSummary } : null));
    }
    setContactFeedback('Your rating was submitted anonymously!');
    setTimeout(() => setContactFeedback(null), 3000);
  };

  // Single district-change handler shared by the desktop navbar chip and the
  // mobile filter-panel select, so both behave identically.
  const handleSelectDistrict = (dist: string) => {
    setSelectedDistrict(dist);
    setSelectedTaluk('all'); // taluks and areas belong to a district
    setSelectedArea('all');
  };

  // /admin guard + URL sync. The REAL protection is server-side (every /api/admin/* route checks
  // the account's role in the database); this only decides what the browser shows. The role comes
  // from GET /api/auth/me, never from the URL or local storage. Anyone who is not a verified
  // administrator is sent to /admin/login.
  useEffect(() => {
    if (activeTab === 'admin-panel') {
      if (authLoading) return;
      if (user?.role !== 'admin') {
        window.location.replace('/admin/login');
        return;
      }
      if (!isAdminPath()) window.history.pushState(null, '', '/admin');
    } else if (isAdminPath()) {
      window.history.replaceState(null, '', '/');
    }
  }, [activeTab, authLoading, user]);

  // Browser Back/Forward between / and /admin.
  useEffect(() => {
    const onPop = () => setActiveTab((cur) => (isAdminPath() ? 'admin-panel' : cur === 'admin-panel' ? 'home' : cur));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Return from "Continue with Google": the server redirects here with a one-time ticket (#google=...) or an error code
  // (#google-error=...) in the URL fragment. The fragment is removed from the address bar immediately.
  const [googleSignup, setGoogleSignup] = useState<{ ticket: string; email: string; name: string } | null>(null);
  const [googleError, setGoogleError] = useState('');
  useEffect(() => {
    const frag = consumeGoogleFragment();
    if (!frag) return;
    const KNOWN = ['cancelled', 'state', 'exchange', 'token', 'email_unverified_google', 'not_allowed', 'restricted', 'google_conflict', 'google_in_use', 'email_unverified_existing', 'ticket', 'server', 'not_configured'];
    const showError = (code?: string) => {
      setGoogleError(t(`google_err_${code && KNOWN.includes(code) ? code : 'server'}` as any));
      setAuthModalRole('customer');
      setIsAuthModalOpen(true);
    };
    if (frag.kind === 'error') {
      showError(frag.code);
    } else if (frag.kind === 'linked') {
      refreshUserData();
      setContactFeedback(t('google_linked_ok'));
      setTimeout(() => setContactFeedback(null), 4000);
    } else {
      exchangeGoogleTicket(frag.ticket).then((r) => {
        if (!r.success) showError(r.code);
        else if (r.signup) {
          setGoogleSignup({ ticket: frag.ticket, email: r.email || '', name: r.name || '' });
          setAuthModalRole('customer');
          setIsAuthModalOpen(true);
        }
        // else: signed in (session already set by the context)
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Back to public login" on /admin/login links to /#login: open the public login modal.
  useEffect(() => {
    if (window.location.hash === '#login') {
      setAuthModalRole('customer');
      setIsAuthModalOpen(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const clearAllFilters = () => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedCategory('all');
    setSelectedDistrict('all');
    setAvailableOnly(false);
    setVerifiedOnly(false);
    setSortBy('default');
    setSelectedTaluk('all');
    setSelectedArea('all');
    setRadiusKm('any');
    setCustomerCoords(null);
    setGpsActive(false);
  };

  return (
    <>
    {(!bootDone || splashLeaving) && (
      <SplashScreen
        status={workersInit === 'error' || bootTimedOut ? 'error' : 'loading'}
        leaving={bootDone && splashLeaving}
        onRetry={retryBoot}
      />
    )}
    <div ref={appRootRef} className="min-h-screen flex flex-col bg-[#FAF7EF] text-[#26332D] pb-16 md:pb-0">
      {/* Top Navbar */}
      <Navbar
        selectedDistrict={selectedDistrict}
        onSelectDistrict={handleSelectDistrict}
        enabledDistrictIds={searchDistricts.length > 0 ? searchDistricts.map((d) => d.id) : undefined}
        onUseGps={handleUseGps}
        gpsActive={gpsActive}
        onOpenAuth={(role = 'customer', tab) => {
          setAuthModalRole(role);
          setAuthModalTab(tab);
          setIsAuthModalOpen(true);
        }}
        onNavigateTab={(tab) => setActiveTab(tab)}
        activeTab={activeTab}
      />

      {/* Contact Trigger Feedback Banner */}
      {contactFeedback && (
        <div className="bg-[#176B4D] text-white text-xs py-2 px-4 text-center font-bold shadow-sm animate-in fade-in">
          {contactFeedback}
        </div>
      )}

      {/* VIEW: WORKER DASHBOARD */}
      {activeTab === 'worker-dash' && <WorkerDashboard />}

      {/* VIEW: ADMIN PANEL */}
      {activeTab === 'admin-panel' &&
        (authLoading ? (
          <div className="py-24 text-center" data-testid="admin-checking">
            <div className="w-10 h-10 border-4 border-[#176B4D] border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : user?.role === 'admin' ? (
          <AdminPanel />
        ) : null)}

      {/* VIEW: FAVOURITES */}
      {activeTab === 'favourites' && (
        <FavouritesView
          onViewProfile={(w) => {
            setSelectedWorker(w);
            setIsProfileModalOpen(true);
          }}
          onRateClick={(w) => {
            setSelectedWorker(w);
            setIsRatingModalOpen(true);
          }}
          onCall={handleCallWorker}
          onWhatsApp={handleWhatsAppWorker}
          onBackHome={() => setActiveTab('home')}
        />
      )}

      {/* VIEW: CONTACTED WORKERS */}
      {activeTab === 'contacted' && (
        <ContactedView
          onViewWorker={async (workerId) => {
            const res = await fetch(`/api/workers/${workerId}`);
            if (res.ok) {
              const data = await res.json();
              setSelectedWorker(data);
              setIsProfileModalOpen(true);
            }
          }}
          onCall={handleCallWorker}
          onWhatsApp={handleWhatsAppWorker}
          onBackHome={() => setActiveTab('home')}
        />
      )}

      {/* VIEW: MAIN WORKER DISCOVERY (HOME) */}
      {activeTab === 'home' && (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Hero Section with Search Input */}
          <section className="glass-card rounded-3xl p-5 sm:p-8 relative overflow-hidden">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[#E8B83D]/20 text-[#855D05] border border-[#E8B83D]/40 mb-3">
                <Sparkles className="w-3.5 h-3.5 text-[#176B4D]" />
                <span>{t('hero_badge')}</span>
              </span>

              <h1 className="text-2xl sm:text-4xl font-black text-[#26332D] tracking-tight leading-tight">
                {t('hero_title')}
              </h1>
              <p className="text-xs sm:text-sm text-[#586B63] mt-2 font-medium">
                {t('hero_subtitle')}
              </p>

              {/* Text Search Bar */}
              <div className="mt-5 relative flex items-center">
                <Search className="w-5 h-5 text-[#176B4D] absolute left-4 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
                  placeholder={t('search_placeholder')}
                  className="w-full text-xs sm:text-sm pl-11 pr-36 sm:pr-44 py-3.5 rounded-2xl bg-white border border-[#176B4D]/25 shadow-xs focus:outline-none focus:ring-2 focus:ring-[#176B4D] text-[#26332D]"
                />
                {/* Clear (X) and Search sit in ONE flex row so they can never overlap,
                    whatever the translated label width is. */}
                <div className="absolute right-2 flex items-center gap-1">
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setDebouncedQuery(''); }}
                      aria-label={t('search_clear')}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={submitSearch}
                    className="px-3.5 py-2 rounded-xl bg-[#176B4D] hover:bg-[#2F8F68] text-white text-xs font-bold transition shadow-2xs whitespace-nowrap"
                  >
                    {t('action_search')}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Worker Categories: quick-access pill bar + searchable "More Categories" popup.
              The pills scroll horizontally on their own; the More button sits outside the
              scroll area so it is always visible, even on narrow phones. */}
          <section className="flex items-start gap-2 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex-1 min-w-0 overflow-x-auto pb-2">
              <div className="flex items-center gap-2 min-w-max">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 ${
                    selectedCategory === 'all'
                      ? 'bg-[#176B4D] text-[#FAF7EF] shadow-xs'
                      : 'bg-white/80 hover:bg-white text-[#26332D] border border-[#176B4D]/15'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>{t('filter_all')}</span>
                </button>

                {getQuickCategories().map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  const label = language === 'ta' ? cat.nameTa : cat.nameEn;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                        isSelected
                          ? 'bg-[#176B4D] text-[#FAF7EF] shadow-xs'
                          : 'bg-white/80 hover:bg-white text-[#26332D] border border-[#176B4D]/15'
                      }`}
                    >
                      <span>{label}</span>
                    </button>
                  );
                })}

                {/* A category picked from the popup stays visible as an active pill. */}
                {(() => {
                  const extra = getMoreCategories().find((c) => c.id === selectedCategory);
                  if (!extra) return null;
                  return (
                    <button
                      key={extra.id}
                      data-selected-extra-category
                      onClick={() => setSelectedCategory(extra.id)}
                      className="px-3.5 py-2 rounded-2xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap bg-[#176B4D] text-[#FAF7EF] shadow-xs"
                    >
                      <span>{language === 'ta' ? extra.nameTa : extra.nameEn}</span>
                    </button>
                  );
                })()}
              </div>
            </div>
            <div className="shrink-0 pb-2">
              <CategoryPicker selectedCategory={selectedCategory} onSelect={setSelectedCategory} />
            </div>
          </section>

          {/* Filter & Sorting Controls Bar */}
          <section className="glass-card rounded-2xl p-2.5 sm:p-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 text-xs min-w-0">
            {/* Phones: tidy 2-column grid. sm+: the original wrapping flex row. */}
            <div className="grid grid-cols-2 gap-x-2 gap-y-2 min-w-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
              {/* Available Only Toggle */}
              <button
                onClick={() => setAvailableOnly(!availableOnly)}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 min-h-[36px] sm:min-h-0 py-1.5 rounded-full font-bold transition border min-w-0 ${
                  availableOnly
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${availableOnly ? 'bg-white' : 'bg-emerald-600'}`}
                />
                <span className="truncate">{t('filter_available_only')}</span>
              </button>

              {/* Verified Only Toggle */}
              <button
                onClick={() => setVerifiedOnly(!verifiedOnly)}
                className={`flex items-center justify-center gap-1.5 px-2 sm:px-3 min-h-[36px] sm:min-h-0 py-1.5 rounded-full font-bold transition border min-w-0 ${
                  verifiedOnly
                    ? 'bg-[#176B4D] text-white border-[#176B4D]'
                    : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-[#E8B83D] shrink-0" />
                <span className="truncate">{t('filter_verified_only')}</span>
              </button>

              {/* Phones only: the header location chip is removed on phones, so the
                  same district selection and "use my location" live here. Both
                  call the exact handlers the navbar chip uses. */}
              <div className="sm:hidden flex flex-col gap-1 text-[#586B63] min-w-0">
                <span className="truncate">{t('select_district')}</span>
                <select
                  data-testid="mobile-district-select"
                  value={selectedDistrict}
                  onChange={(e) => handleSelectDistrict(e.target.value)}
                  className="w-full min-w-0 min-h-[36px] bg-white rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-[#26332D] truncate"
                >
                  <option value="all">{t('all_districts')}</option>
                  {TN_DISTRICTS.filter(
                    (d) => searchDistricts.length === 0 || searchDistricts.some((sd) => sd.id === d.id)
                  ).map((d) => (
                    <option key={d.id} value={d.id}>
                      {language === 'ta' ? d.nameTa : d.nameEn}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:hidden flex flex-col justify-end min-w-0">
                <button
                  type="button"
                  data-testid="mobile-gps-button"
                  onClick={handleUseGps}
                  className={`w-full min-h-[36px] flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg border font-bold transition min-w-0 ${
                    gpsActive
                      ? 'bg-[#176B4D]/10 text-[#176B4D] border-[#176B4D]/40'
                      : 'bg-white text-stone-700 border-stone-300'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#176B4D] shrink-0" />
                  <span className="truncate">{t('use_gps')}</span>
                </button>
              </div>

              {/* Taluk selector (official taluks of the enabled district) */}
              {talukOptions.length > 0 && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5 text-[#586B63] min-w-0">
                  <span className="shrink-0">{t('filter_taluk')}:</span>
                  <select
                    value={selectedTaluk}
                    onChange={(e) => {
                      setSelectedTaluk(e.target.value);
                      setSelectedArea('all'); // areas belong to a taluk
                    }}
                    className="bg-white rounded-lg border border-stone-300 w-full sm:w-auto min-h-[36px] sm:min-h-0 px-2 py-1 text-xs font-semibold text-[#26332D] sm:max-w-[200px] truncate min-w-0"
                  >
                    <option value="all">{t('filter_all_taluks')}</option>
                    {talukOptions.map((tk) => (
                      <option key={tk.id} value={tk.id}>
                        {loc.taluk(tk.id)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Area selector (real configured/used areas of the enabled district) */}
              {areaOptions.length > 0 && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5 text-[#586B63] min-w-0">
                  <span className="shrink-0">{t('filter_area')}:</span>
                  <select
                    value={selectedArea}
                    onChange={(e) => setSelectedArea(e.target.value)}
                    className="bg-white rounded-lg border border-stone-300 w-full sm:w-auto min-h-[36px] sm:min-h-0 px-2 py-1 text-xs font-semibold text-[#26332D] sm:max-w-[200px] truncate min-w-0"
                  >
                    <option value="all">{t('filter_all_areas')}</option>
                    {areaOptions.map((a) => (
                      <option key={a} value={a}>
                        {loc.place(a)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Radius selector - only meaningful (and only shown) once real GPS coordinates exist */}
              {customerCoords && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5 text-[#586B63] min-w-0">
                  <span className="shrink-0">{t('filter_radius')}:</span>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(e.target.value)}
                    className="bg-white rounded-lg border border-stone-300 w-full sm:w-auto min-h-[36px] sm:min-h-0 px-2 py-1 text-xs font-semibold text-[#26332D] sm:max-w-[200px] truncate min-w-0"
                  >
                    <option value="any">{t('filter_any_distance')}</option>
                    <option value="5">{t('km_unit', { n: 5 })}</option>
                    <option value="10">{t('km_unit', { n: 10 })}</option>
                    <option value="25">{t('km_unit', { n: 25 })}</option>
                    <option value="50">{t('km_unit', { n: 50 })}</option>
                  </select>
                </div>
              )}

              {/* Sort selector - ROOT CAUSE FIX: this <select> previously had
                  no width constraint at all. A native <select>'s rendered
                  width is driven by its selected option's text ("Default
                  (Verified & Ratings)" here), and unlike a text input,
                  flex-wrap can move the whole control to its own row but
                  cannot shrink it below that intrinsic content width. On
                  narrow viewports this pushed the control (and the whole
                  section) wider than the card, causing horizontal overflow
                  even though every surrounding container already wraps.
                  max-w + truncate caps the rendered box and ellipsizes the
                  closed-state label if it doesn't fit - the full option
                  list and functionality are unchanged, only the visible
                  label of a long-named option can truncate when closed. */}
              <div className="col-span-2 sm:col-span-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-1.5 text-[#586B63] min-w-0">
                <span className="flex items-center gap-1 shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#176B4D] shrink-0" />
                  {t('filter_sort_by')}:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-white rounded-lg border border-stone-300 w-full sm:w-auto min-h-[36px] sm:min-h-0 px-2 py-1 text-xs font-semibold text-[#26332D] sm:max-w-[220px] truncate min-w-0"
                >
                  <option value="default">{t('sort_default')}</option>
                  <option value="proximity">{t('filter_sort_proximity')}</option>
                  <option value="rating">{t('filter_sort_rating')}</option>
                </select>
              </div>
            </div>

            {/* Results Counter & Clear */}
            <div className="flex items-center justify-between gap-3 min-w-0 sm:justify-start sm:flex-wrap border-t border-[#176B4D]/10 pt-2 sm:border-0 sm:pt-0">
              <span className="text-xs font-bold text-[#176B4D] truncate min-w-0">
                {t(totalCount === 1 ? 'results_found_one' : 'results_found_many', { n: totalCount })}
              </span>

              {(selectedCategory !== 'all' ||
                selectedDistrict !== 'all' ||
                selectedTaluk !== 'all' ||
                selectedArea !== 'all' ||
                radiusKm !== 'any' ||
                availableOnly ||
                verifiedOnly ||
                searchQuery ||
                sortBy !== 'default') && (
                <button
                  onClick={clearAllFilters}
                  className="text-[11px] text-[#D64545] font-bold hover:underline shrink-0 min-h-[32px] sm:min-h-0 px-1"
                >
                  {t('clear_filters')}
                </button>
              )}
            </div>
          </section>

          {/* Workers Grid */}
          <section>
            {isLoadingWorkers ? (
              <div className="py-20 text-center">
                <div className="w-10 h-10 border-4 border-[#176B4D] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs text-[#586B63]">{t('loading_workers')}</p>
              </div>
            ) : workers.length === 0 ? (
              <div className="text-center py-16 bg-white/70 rounded-3xl border border-[#176B4D]/15 p-8 max-w-lg mx-auto">
                <Briefcase className="w-12 h-12 text-stone-300 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-[#26332D]">{t('empty_workers_title')}</h3>
                <p className="text-xs text-[#586B63] mt-1 mb-5">
                  {t('empty_workers_subtitle')}
                </p>
                <button
                  onClick={clearAllFilters}
                  className="px-5 py-2.5 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition"
                >
                  {t('empty_workers_reset')}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-6">
                {workers.map((worker) => (
                  <WorkerCard
                    key={worker.id}
                    worker={worker}
                    onViewProfile={(w) => {
                      setSelectedWorker(w);
                      setIsProfileModalOpen(true);
                    }}
                    onRateClick={(w) => {
                      setSelectedWorker(w);
                      setIsRatingModalOpen(true);
                    }}
                    onCall={handleCallWorker}
                    onWhatsApp={handleWhatsAppWorker}
                  />
                ))}
              </div>
            )}

            {!isLoadingWorkers && hasMore && (
              <div className="flex justify-center pt-6">
                <button
                  onClick={() => fetchWorkers(page + 1)}
                  disabled={isLoadingMore}
                  className="px-5 py-2.5 rounded-2xl bg-white hover:bg-stone-50 text-[#176B4D] border border-[#176B4D]/25 font-bold text-xs shadow-sm transition disabled:opacity-60"
                >
                  {t('load_more_workers')}
                </button>
              </div>
            )}
          </section>
        </main>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-[#176B4D]/15 bg-[#FAF7EF] py-6 px-4 text-center text-xs text-[#586B63]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="font-semibold text-[#176B4D]">
            © {new Date().getFullYear()} Namma Ooru Workers (நம் ஊரு ஒர்க்கர்ஸ்). {t('footer_rights')}
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>{t('footer_privacy')}</span>
            <span>•</span>
            <span>{t('footer_verification')}</span>
            <span>•</span>
            <span>{t('footer_bilingual')}</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        activeTab={activeTab}
        onNavigateTab={(tab) => setActiveTab(tab)}
        onOpenAuth={() => {
          setAuthModalTab('login');
          setIsAuthModalOpen(true);
        }}
      />

      {/* Interactive Modals */}
      <WorkerProfileModal
        worker={selectedWorker}
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onOpenRate={(w) => {
          setSelectedWorker(w);
          setIsRatingModalOpen(true);
        }}
        onOpenReport={(w) => {
          setSelectedWorker(w);
          setIsReportModalOpen(true);
        }}
        onCall={handleCallWorker}
        onWhatsApp={handleWhatsAppWorker}
      />

      <RatingModal
        worker={selectedWorker}
        isOpen={isRatingModalOpen}
        onClose={() => setIsRatingModalOpen(false)}
        onRatingSuccess={handleRatingSuccess}
        onRequireLogin={() => {
          setAuthModalRole('customer');
          setIsAuthModalOpen(true);
        }}
      />

      <ReportModal
        worker={selectedWorker}
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
      />

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setGoogleSignup(null);
          setGoogleError('');
        }}
        initialRole={authModalRole}
        initialTab={authModalTab}
        googleSignup={googleSignup}
        initialError={googleError}
      />

      <NotificationDrawer />
    </div>
    </>
  );
}

export default function App() {
  // Admin-issued reset links open https://<site>/reset-password#token=...
  // That page is standalone: no session, no notifications, no main app shell.
  const cleanPath = window.location.pathname.replace(/\/+$/, '');
  const isResetPage = cleanPath === '/reset-password';
  const isAdminLoginPage = cleanPath === '/admin/login';
  return (
    <LanguageProvider>
      {isResetPage ? (
        <ResetPasswordPage />
      ) : isAdminLoginPage ? (
        <AuthProvider>
          <AdminLoginPage />
        </AuthProvider>
      ) : (
        <AuthProvider>
          <NotificationProvider>
            <MainApp />
          </NotificationProvider>
        </AuthProvider>
      )}
    </LanguageProvider>
  );
}
