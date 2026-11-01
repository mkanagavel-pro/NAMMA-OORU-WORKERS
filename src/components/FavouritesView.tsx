import React, { useState, useEffect } from 'react';
import { Heart, Phone, MessageCircle, Star, Trash2 } from 'lucide-react';
import { Worker } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { WorkerCard } from './WorkerCard';

interface FavouritesViewProps {
  onViewProfile: (worker: Worker) => void;
  onRateClick: (worker: Worker) => void;
  onCall: (worker: Worker) => void;
  onWhatsApp: (worker: Worker) => void;
  onBackHome: () => void;
}

export const FavouritesView: React.FC<FavouritesViewProps> = ({
  onViewProfile,
  onRateClick,
  onCall,
  onWhatsApp,
  onBackHome,
}) => {
  const { user, token, guestFavourites, toggleFavourite } = useAuth();
  const { t } = useLanguage();
  const [favouriteWorkers, setFavouriteWorkers] = useState<Worker[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchFavourites = async () => {
    setIsLoading(true);
    try {
      if (user && token) {
        const res = await fetch('/api/customer/favourites', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setFavouriteWorkers(data);
        }
      } else {
        // Guest favourites from IDs
        if (guestFavourites.length === 0) {
          setFavouriteWorkers([]);
          setIsLoading(false);
          return;
        }
        const res = await fetch('/api/workers');
        if (res.ok) {
          const data = await res.json();
          const filtered = data.workers.filter((w: Worker) => guestFavourites.includes(w.id));
          setFavouriteWorkers(filtered);
        }
      }
    } catch (e) {
      console.error('Failed to load favourites:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFavourites();
  }, [user, guestFavourites]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between pb-4 border-b border-[#176B4D]/10 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#26332D] flex items-center gap-2">
            <Heart className="w-6 h-6 text-[#D64545] fill-current" />
            <span>{t('favourites_title')}</span>
          </h1>
          <p className="text-xs text-[#586B63] mt-0.5">
            {t('favourites_subtitle')} ({favouriteWorkers.length})
          </p>
        </div>

        <button
          onClick={onBackHome}
          className="text-xs font-bold text-[#176B4D] hover:underline"
        >
          ← {t('nav_home')}
        </button>
      </div>

      {isLoading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-4 border-[#176B4D] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-500">{t('loading_saved')}</p>
        </div>
      ) : favouriteWorkers.length === 0 ? (
        <div className="text-center py-16 bg-white/60 rounded-3xl border border-[#176B4D]/10 p-6 max-w-md mx-auto">
          <Heart className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#26332D]">{t('favourites_empty')}</h3>
          <p className="text-xs text-[#586B63] mt-1 mb-4">{t('favourites_empty_hint')}</p>
          <button
            onClick={onBackHome}
            className="px-5 py-2.5 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition"
          >
            {t('action_search')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {favouriteWorkers.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              onViewProfile={onViewProfile}
              onRateClick={onRateClick}
              onCall={onCall}
              onWhatsApp={onWhatsApp}
            />
          ))}
        </div>
      )}
    </div>
  );
};
