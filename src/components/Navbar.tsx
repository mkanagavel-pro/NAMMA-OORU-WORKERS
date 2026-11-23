import React, { useState, useEffect } from 'react';
import {
  Search,
  MapPin,
  Globe,
  Heart,
  PhoneCall,
  Bell,
  Mail,
  User as UserIcon,
  ShieldCheck,
  Briefcase,
  LogOut,
  Crosshair,
  SlidersHorizontal,
} from 'lucide-react';
import { Logo } from './Logo';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { TN_DISTRICTS } from '../data/tamilNaduData';
import { fetchGoogleEnabled } from '../api/googleAuth';
import { localizePlace, localizeTaluk, localizeDistrict } from '../i18n/locationNames';
import { useLocationNames } from '../i18n/useLocationNames';
import { ConfirmDialog } from './ConfirmDialog';

interface NavbarProps {
  selectedDistrict: string;
  onSelectDistrict: (districtId: string) => void;
  onUseGps: () => void;
  gpsActive: boolean;
  onOpenAuth: (initialRole?: 'customer' | 'worker', initialTab?: 'login' | 'signup') => void;
  onNavigateTab: (tab: 'home' | 'favourites' | 'contacted' | 'worker-dash' | 'admin-panel') => void;
  activeTab: string;
  /** District ids open for public search (from /api/workers/search-config). When omitted, all districts are listed. */
  enabledDistrictIds?: string[];
}

export const Navbar: React.FC<NavbarProps> = ({
  selectedDistrict,
  onSelectDistrict,
  onUseGps,
  gpsActive,
  onOpenAuth,
  onNavigateTab,
  activeTab,
  enabledDistrictIds,
}) => {
  const { language, setLanguage, t } = useLanguage();
  const loc = useLocationNames();
  const { user, workerProfile, logout, guestFavourites, startGoogleLink } = useAuth();
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    fetchGoogleEnabled().then(setGoogleEnabled);
  }, []);
  const { unreadCount, openDrawer } = useNotifications();

  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const currentDistrictObj = TN_DISTRICTS.find((d) => d.id === selectedDistrict);
  const currentDistrictLabel = currentDistrictObj
    ? language === 'ta'
      ? currentDistrictObj.nameTa
      : currentDistrictObj.nameEn
    : t('all_districts');

  const totalFavsCount = user ? (user.favourites || []).length : guestFavourites.length;

  return (
    <header className="sticky top-0 z-40 w-full glass-nav transition-all">
      {/* Top Banner Notice: Earthy Green & Yellow Brand.
          Not shown on phones (display:none below the sm breakpoint, so it takes
          no height, margin or padding there); unchanged from sm upwards. */}
      <div className="hidden sm:flex bg-[#176B4D] text-[#FAF7EF] text-xs py-1.5 px-4 font-medium items-center justify-between border-b border-[#E8B83D]/30">
        <div className="flex items-center gap-2 max-w-4xl truncate">
          <span className="bg-[#E8B83D] text-[#176B4D] font-bold px-1.5 py-0.5 rounded text-[10px] tracking-wide uppercase">
            Tamil Nadu
          </span>
          <span className="truncate">{t('app_tagline')}</span>
        </div>
      </div>

      {/* Main Navbar Bar - wraps into two rows on narrow screens (logo+location
          on the first line, the action toolbar dropping to its own full-width
          line) rather than squeezing every control into one row. */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-3.5 flex flex-wrap items-center justify-between gap-y-1.5 gap-x-2 sm:gap-x-4">
        {/* Brand Logo */}
        <button
          onClick={() => onNavigateTab('home')}
          className="cursor-pointer text-left focus:outline-none"
        >
          <Logo size="md" />
        </button>

        {/* Location & GPS Selector. Phones: this chip is removed from the header;
            the same district / GPS controls live in the filter panel there
            (see App.tsx). From sm upwards it is unchanged. */}
        <div className="relative hidden sm:block">
          <button
            onClick={() => setIsLocationMenuOpen(!isLocationMenuOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
              gpsActive
                ? 'bg-[#176B4D]/10 text-[#176B4D] border-[#176B4D]/30'
                : 'bg-white/80 hover:bg-white text-[#26332D] border-[#176B4D]/15 shadow-2xs'
            }`}
          >
            <MapPin className={`w-3.5 h-3.5 ${gpsActive ? 'text-[#176B4D]' : 'text-[#E8B83D]'}`} />
            <span className="max-w-[110px] sm:max-w-[160px] truncate">{currentDistrictLabel}</span>
          </button>

          {/* Location Dropdown Modal */}
          {isLocationMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[1px]"
                onClick={() => setIsLocationMenuOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-[calc(100vw-2rem)] max-w-72 sm:w-80 sm:max-w-80 bg-[#FAF7EF] rounded-2xl shadow-xl border border-[#176B4D]/20 p-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-[#176B4D]/10 mb-2">
                  <span className="text-xs font-bold text-[#176B4D]">{t('select_district')}</span>
                  <button
                    onClick={() => {
                      onSelectDistrict('all');
                      setIsLocationMenuOpen(false);
                    }}
                    className="text-[11px] text-[#586B63] hover:text-[#176B4D] underline font-medium"
                  >
                    {t('filter_all')}
                  </button>
                </div>

                {/* GPS Trigger Button */}
                <button
                  onClick={() => {
                    onUseGps();
                    setIsLocationMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 mb-2 rounded-xl bg-[#176B4D] hover:bg-[#2F8F68] text-white text-xs font-bold transition shadow-xs"
                >
                  <Crosshair className="w-3.5 h-3.5 text-[#E8B83D]" />
                  {t('use_gps')}
                </button>

                {/* District List */}
                <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                  {TN_DISTRICTS.filter((d) => !enabledDistrictIds || enabledDistrictIds.includes(d.id)).map((dist) => (
                    <button
                      key={dist.id}
                      onClick={() => {
                        onSelectDistrict(dist.id);
                        setIsLocationMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between gap-2 transition ${
                        selectedDistrict === dist.id
                          ? 'bg-[#176B4D]/15 text-[#176B4D] font-bold'
                          : 'hover:bg-white text-[#26332D]'
                      }`}
                    >
                      <span className="truncate min-w-0">{language === 'ta' ? dist.nameTa : dist.nameEn}</span>
                      <span className="text-[10px] text-[#586B63] truncate min-w-0 shrink">
                        {loc.places(dist.towns.slice(0, 2)).join(', ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Actions Toolbar - wraps to its own full-width row on narrow
            screens (see flex-wrap on the parent above) instead of squeezing
            next to the logo/location controls. */}
        <div className="flex items-center gap-1.5 sm:gap-3 w-full sm:w-auto justify-end flex-wrap">
          {/* Language Switcher Toggle (EN / தமிழ்) */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'ta' : 'en')}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold border border-[#176B4D]/20 bg-white/90 hover:bg-white text-[#176B4D] shadow-2xs transition"
            title="Switch Language / மொழி மாற்றவும்"
          >
            <Globe className="w-3.5 h-3.5 text-[#E8B83D]" />
            <span>{language === 'en' ? 'தமிழ்' : 'English'}</span>
          </button>

          {/* System Transactional Emails Drawer Trigger (for testing OTPs & notifications) */}
          <button
            onClick={() => openDrawer('emails')}
            className="relative p-2 rounded-full text-[#586B63] hover:text-[#176B4D] hover:bg-white/80 transition"
            title={t('nav_system_emails')}
          >
            <Mail className="w-4 h-4 text-[#176B4D]" />
            <span className="absolute -top-1 -right-1 bg-[#E8B83D] text-[#176B4D] text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
              ✉
            </span>
          </button>

          {/* In-App Notifications Bell */}
          <button
            onClick={() => openDrawer('notifications')}
            className="relative p-2 rounded-full text-[#586B63] hover:text-[#176B4D] hover:bg-white/80 transition"
            title={t('nav_notifications')}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#D64545] text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Favourites Shortcut (Desktop) */}
          <button
            onClick={() => onNavigateTab('favourites')}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              activeTab === 'favourites'
                ? 'bg-[#176B4D] text-white'
                : 'bg-white/80 hover:bg-white text-[#26332D] border border-[#176B4D]/15'
            }`}
          >
            <Heart className="w-3.5 h-3.5 text-[#D64545]" />
            <span>{t('nav_favourites')}</span>
            {totalFavsCount > 0 && (
              <span className="ml-0.5 bg-[#D64545]/20 text-[#D64545] text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {totalFavsCount}
              </span>
            )}
          </button>

          {/* Contacted History Shortcut (Desktop) */}
          <button
            onClick={() => onNavigateTab('contacted')}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
              activeTab === 'contacted'
                ? 'bg-[#176B4D] text-white'
                : 'bg-white/80 hover:bg-white text-[#26332D] border border-[#176B4D]/15'
            }`}
          >
            <PhoneCall className="w-3.5 h-3.5 text-[#176B4D]" />
            <span>{t('nav_contacted')}</span>
          </button>

          {/* User Account / Login Button */}
          {!user ? (
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0" data-testid="nav-auth">
              <button
                type="button"
                data-testid="nav-signup"
                onClick={() => onOpenAuth('customer', 'signup')}
                className="px-2.5 sm:px-3 py-1.5 rounded-full bg-transparent hover:bg-[#176B4D]/10 text-[#26332D] text-xs font-semibold transition whitespace-nowrap cursor-pointer"
              >
                {t('nav_signup')}
              </button>
              <button
                type="button"
                data-testid="nav-signin"
                onClick={() => onOpenAuth('customer', 'login')}
                className="px-3.5 sm:px-4 py-1.5 rounded-full bg-[#14213D] hover:bg-[#1d2f57] text-white text-xs font-bold transition shadow-xs whitespace-nowrap cursor-pointer"
              >
                {t('nav_signin')}
              </button>
            </div>
          ) : (
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-full bg-white/90 hover:bg-white border border-[#176B4D]/20 shadow-2xs transition"
              >
                <div className="w-6 h-6 rounded-full bg-[#176B4D] text-[#FAF7EF] flex items-center justify-center font-bold text-xs uppercase">
                  {user.role === 'admin' ? 'A' : user.role === 'worker' ? 'W' : 'C'}
                </div>
                <span className="text-xs font-semibold text-[#26332D] max-w-[90px] truncate hidden sm:inline">
                  {(user.email || user.loginId || '').split('@')[0]}
                </span>
              </button>

              {/* Account Dropdown Menu */}
              {isUserMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/5"
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-[#176B4D]/15 p-2 z-50 animate-in fade-in duration-150">
                    <div className="px-3 py-2 border-b border-[#176B4D]/10">
                      <div className="text-xs font-bold text-[#176B4D] truncate">{user.email || user.loginId}</div>
                      <div className="text-[10px] text-[#586B63] capitalize font-medium flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#2E8B57]" />
                        {user.role} account
                      </div>
                    </div>

                    <div className="py-1 space-y-0.5">
                      {user.role === 'worker' && (
                        <button
                          onClick={() => {
                            onNavigateTab('worker-dash');
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-[#176B4D] hover:bg-[#FAF7EF] rounded-xl flex items-center gap-2 transition"
                        >
                          <Briefcase className="w-4 h-4 text-[#E8B83D]" />
                          <span>{t('nav_worker_dashboard')}</span>
                        </button>
                      )}

                      {user.role === 'admin' && (
                        <button
                          onClick={() => {
                            onNavigateTab('admin-panel');
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-3 py-2 text-xs font-semibold text-[#176B4D] hover:bg-[#FAF7EF] rounded-xl flex items-center gap-2 transition"
                        >
                          <ShieldCheck className="w-4 h-4 text-[#176B4D]" />
                          <span>{t('nav_admin_panel')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          onNavigateTab('favourites');
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-[#26332D] hover:bg-[#FAF7EF] rounded-xl flex items-center gap-2 transition"
                      >
                        <Heart className="w-4 h-4 text-[#D64545]" />
                        <span>{t('nav_favourites')}</span>
                      </button>

                      {googleEnabled && user.role !== 'admin' && !user.googleLinked && (
                        <button
                          onClick={() => {
                            startGoogleLink();
                            setIsUserMenuOpen(false);
                          }}
                          data-testid="link-google"
                          className="w-full text-left px-3 py-2 text-xs text-[#26332D] hover:bg-[#FAF7EF] rounded-xl flex items-center gap-2 transition"
                        >
                          <span className="w-4 h-4 shrink-0 rounded-full border border-[#dadce0] bg-white text-[10px] font-bold leading-[14px] text-center text-[#4285F4]">G</span>
                          <span className="min-w-0 truncate">{t('google_link_menu')}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          onNavigateTab('contacted');
                          setIsUserMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs text-[#26332D] hover:bg-[#FAF7EF] rounded-xl flex items-center gap-2 transition"
                      >
                        <PhoneCall className="w-4 h-4 text-[#176B4D]" />
                        <span>{t('nav_contacted')}</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-[#176B4D]/10">
                      <button
                        onClick={() => {
                          // Ask first; the existing logout() runs only after the person confirms.
                          setIsUserMenuOpen(false);
                          setConfirmLogout(true);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-[#D64545] hover:bg-red-50 rounded-xl flex items-center gap-2 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{t('nav_logout')}</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    {confirmLogout && (
        <ConfirmDialog
          message={t('logout_confirm_message')}
          confirmLabel={t('nav_logout')}
          cancelLabel={t('action_cancel')}
          onCancel={() => setConfirmLogout(false)}
          onConfirm={() => {
            setConfirmLogout(false);
            logout();
          }}
        />
      )}
    </header>
  );
};
