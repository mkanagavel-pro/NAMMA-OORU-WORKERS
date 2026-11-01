import React from 'react';
import { Home, Heart, PhoneCall, User, ShieldCheck, Briefcase } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';

interface MobileNavProps {
  activeTab: string;
  onNavigateTab: (tab: 'home' | 'favourites' | 'contacted' | 'worker-dash' | 'admin-panel') => void;
  onOpenAuth: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  activeTab,
  onNavigateTab,
  onOpenAuth,
}) => {
  const { t } = useLanguage();
  const { user, guestFavourites } = useAuth();

  const totalFavsCount = user ? (user.favourites || []).length : guestFavourites.length;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAF7EF]/95 backdrop-blur-lg border-t border-[#176B4D]/15 px-3 py-1.5 shadow-lg">
      <div className="flex items-center justify-around">
        {/* Home / Workers */}
        <button
          onClick={() => onNavigateTab('home')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'home' ? 'text-[#176B4D] font-bold' : 'text-[#586B63]'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">{t('nav_home')}</span>
        </button>

        {/* Favourites */}
        <button
          onClick={() => onNavigateTab('favourites')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-xl relative transition ${
            activeTab === 'favourites' ? 'text-[#176B4D] font-bold' : 'text-[#586B63]'
          }`}
        >
          <Heart className="w-5 h-5 mb-0.5 text-[#D64545]" />
          <span className="text-[10px]">{t('nav_favourites')}</span>
          {totalFavsCount > 0 && (
            <span className="absolute top-0 right-2 bg-[#D64545] text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {totalFavsCount}
            </span>
          )}
        </button>

        {/* Contacted */}
        <button
          onClick={() => onNavigateTab('contacted')}
          className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
            activeTab === 'contacted' ? 'text-[#176B4D] font-bold' : 'text-[#586B63]'
          }`}
        >
          <PhoneCall className="w-5 h-5 mb-0.5 text-[#176B4D]" />
          <span className="text-[10px]">{t('nav_contacted')}</span>
        </button>

        {/* Account / Portal */}
        {user ? (
          user.role === 'worker' ? (
            <button
              onClick={() => onNavigateTab('worker-dash')}
              className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
                activeTab === 'worker-dash' ? 'text-[#176B4D] font-bold' : 'text-[#586B63]'
              }`}
            >
              <Briefcase className="w-5 h-5 mb-0.5 text-[#E8B83D]" />
              <span className="text-[10px]">{t('nav_worker_dashboard')}</span>
            </button>
          ) : user.role === 'admin' ? (
            <button
              onClick={() => onNavigateTab('admin-panel')}
              className={`flex flex-col items-center py-1 px-2.5 rounded-xl transition ${
                activeTab === 'admin-panel' ? 'text-[#176B4D] font-bold' : 'text-[#586B63]'
              }`}
            >
              <ShieldCheck className="w-5 h-5 mb-0.5 text-[#176B4D]" />
              <span className="text-[10px]">{t('nav_admin_panel')}</span>
            </button>
          ) : (
            <button
              onClick={() => onNavigateTab('home')}
              className="flex flex-col items-center py-1 px-2.5 text-[#586B63]"
            >
              <User className="w-5 h-5 mb-0.5 text-[#176B4D]" />
              <span className="text-[10px]">{t('role_customer_short')}</span>
            </button>
          )
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex flex-col items-center py-1 px-2.5 text-[#176B4D] font-bold"
          >
            <User className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">{t('nav_signin')}</span>
          </button>
        )}
      </div>
    </nav>
  );
};
