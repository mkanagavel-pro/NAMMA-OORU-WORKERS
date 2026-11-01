import React from 'react';
import {
  Star,
  MapPin,
  Phone,
  MessageCircle,
  Heart,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Briefcase,
  Share2,
} from 'lucide-react';
import { Worker } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { WORKER_CATEGORIES } from '../data/tamilNaduData';
import { localizePlace, localizeTaluk, localizeDistrict } from '../i18n/locationNames';
import { useLocationNames } from '../i18n/useLocationNames';

interface WorkerCardProps {
  worker: Worker;
  onViewProfile: (worker: Worker) => void;
  onRateClick: (worker: Worker) => void;
  onCall: (worker: Worker) => void;
  onWhatsApp: (worker: Worker) => void;
}

export const WorkerCard: React.FC<WorkerCardProps> = ({
  worker,
  onViewProfile,
  onRateClick,
  onCall,
  onWhatsApp,
}) => {
  const { language, t } = useLanguage();
  const loc = useLocationNames();
  const { isFavourite, toggleFavourite } = useAuth();

  const isFav = isFavourite(worker.id);

  // Category Translation
  const catObj = WORKER_CATEGORIES.find((c) => c.id === worker.category);
  const categoryLabel = catObj
    ? language === 'ta'
      ? catObj.nameTa
      : catObj.nameEn
    : worker.category;

  // Distance category styling
  const distanceBadgeColor = {
    Nearby: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    'Moderate distance': 'bg-amber-50 text-amber-800 border-amber-200',
    Far: 'bg-stone-100 text-stone-700 border-stone-200',
  };

  return (
    <div
      className={`glass-card glass-card-hover rounded-2xl p-2.5 sm:p-5 flex flex-col justify-between relative overflow-hidden min-w-0 transition-all duration-200 ${
        worker.isSuspended ? 'border-red-300/80 bg-red-50/20' : ''
      }`}
    >
      {/* Top Bar: Badges & Favourite */}
      <div className="flex items-start justify-between gap-1 sm:gap-2 mb-2 sm:mb-3">
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 min-w-0">
          {/* 1. Verification / Suspension Badges */}
          {worker.isSuspended ? (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-[#D64545] text-white shadow-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              {t('status_suspended')}
            </span>
          ) : worker.verificationStatus === 'verified' ? (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-[#176B4D] text-[#FAF7EF] shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#E8B83D]" />
              {t('status_verified')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-[#E8B83D]/20 text-[#855D05] border border-[#E8B83D]/40">
              <Clock className="w-3.5 h-3.5" />
              {t('status_pending')}
            </span>
          )}

          {/* 2. Availability Pill */}
          <span
            className={`inline-flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold border ${
              worker.availability === 'Available' && !worker.isSuspended
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                : 'bg-stone-100 text-stone-600 border-stone-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                worker.availability === 'Available' && !worker.isSuspended
                  ? 'bg-emerald-600'
                  : 'bg-stone-400'
              }`}
            />
            {worker.availability === 'Available' && !worker.isSuspended
              ? t('status_available')
              : t('status_offline')}
          </span>

          {/* 3. Distance Category Pill (Req 23: Approximate categories only, NO exact km!) */}
          {worker.distanceCategory && (
            <span
              className={`text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full border ${
                distanceBadgeColor[worker.distanceCategory] || 'bg-stone-50 text-stone-700'
              }`}
            >
              {t(
                worker.distanceCategory === 'Nearby'
                  ? 'distance_nearby'
                  : worker.distanceCategory === 'Moderate distance'
                  ? 'distance_moderate'
                  : 'distance_far'
              )}
            </span>
          )}
        </div>

        {/* Favourite Button */}
        <button
          onClick={() => toggleFavourite(worker.id)}
          className={`w-9 h-9 -mt-1 -mr-1 sm:mt-0 sm:mr-0 shrink-0 flex items-center justify-center rounded-full transition ${
            isFav
              ? 'bg-red-50 text-[#D64545]'
              : 'text-stone-400 hover:text-[#D64545] hover:bg-stone-100'
          }`}
          title={isFav ? t('action_unfavourite') : t('action_favourite')}
        >
          <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Worker Identity Header */}
      <div className="flex flex-col items-start sm:flex-row sm:items-center gap-1.5 sm:gap-3.5 mb-2 sm:mb-3">
        <div
          onClick={() => onViewProfile(worker)}
          className="cursor-pointer relative w-12 h-12 sm:w-16 sm:h-16 rounded-2xl overflow-hidden bg-[#FAF7EF] border border-[#176B4D]/15 flex-shrink-0 shadow-xs"
        >
          {worker.profilePhoto ? (
            <img
              src={worker.profilePhoto}
              alt={worker.name}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-[#176B4D]/10 text-[#176B4D] font-black text-xl">
              {worker.name.charAt(0)}
            </div>
          )}
        </div>

        <div className="w-full sm:w-auto sm:flex-1 min-w-0">
          <h3
            onClick={() => onViewProfile(worker)}
            className="text-sm leading-snug sm:text-lg font-extrabold text-[#26332D] hover:text-[#176B4D] cursor-pointer break-words line-clamp-2 sm:line-clamp-none sm:truncate transition"
          >
            {worker.name}
          </h3>
          <p className="text-[11px] sm:text-xs font-bold text-[#176B4D] flex items-center gap-1 sm:gap-1.5 mt-0.5 min-w-0">
            <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#E8B83D] shrink-0" />
            <span className="truncate min-w-0">{categoryLabel}</span>
          </p>
          <p className="text-[11px] sm:text-xs text-[#586B63] flex items-center gap-1 truncate mt-0.5">
            <MapPin className="w-3 h-3 text-[#E8B83D] flex-shrink-0" />
            <span className="truncate">{loc.place(worker.publicArea)}</span>
          </p>
        </div>
      </div>

      {/* Ratings & Rates Row */}
      <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between py-1.5 sm:py-2 border-y border-[#176B4D]/10 mb-2 sm:mb-3 text-[11px] sm:text-xs">
        {/* Rating stars summary */}
        <div
          onClick={() => onViewProfile(worker)}
          className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
        >
          <div className="flex items-center text-[#E8B83D]">
            <Star className="w-4 h-4 fill-current" />
          </div>
          <span className="font-extrabold text-[#26332D]">
            {worker.ratingSummary.averageRating > 0 ? worker.ratingSummary.averageRating : t('rating_new')}
          </span>
          <span className="text-[#586B63] text-[11px]">
            ({worker.ratingSummary.totalRatings})
          </span>
        </div>

        {/* Experience & Standard Rate */}
        <div className="sm:text-right min-w-0 max-w-full">
          <span className="font-bold text-[#176B4D] break-words">{worker.rate}</span>
          <span className="text-[#586B63] text-[11px] block">
            {worker.experience} {t('profile_experience')}
          </span>
        </div>
      </div>

      {/* Service Areas Tags */}
      {worker.serviceAreas && worker.serviceAreas.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 sm:mb-4">
          {worker.serviceAreas.slice(0, 3).map((area, idx) => (
            <span
              key={idx}
              className={`text-[10px] font-medium bg-[#FAF7EF] text-[#586B63] border border-[#176B4D]/10 px-1.5 sm:px-2 py-0.5 rounded-md max-w-full truncate ${
                idx === 2 ? 'hidden sm:inline-block' : ''
              }`}
            >
              {loc.place(area)}
            </span>
          ))}
          {worker.serviceAreas.length > 3 && (
            <span className="hidden sm:inline text-[10px] text-[#586B63] font-medium self-center">
              {t('more_count', { n: worker.serviceAreas.length - 3 })}
            </span>
          )}
        </div>
      )}

      {/* Action Buttons Row */}
      <div className="pt-1">
        {worker.isSuspended ? (
          // Suspended worker contact disabled (Req 27 & 30)
          <div className="bg-red-50 border border-red-200 rounded-xl p-2.5 text-center">
            <span className="text-xs font-bold text-[#D64545] block">
              {t('profile_suspended_notice')}
            </span>
            <button
              onClick={() => onViewProfile(worker)}
              className="mt-2 text-xs font-semibold text-[#176B4D] hover:underline"
            >
              {t('action_view_profile')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-1.5 sm:gap-2">
            {/* Direct Call Button (Req 26: customer sees Call button, not raw phone number) */}
            <button
              onClick={() => onCall(worker)}
              className="w-full min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-[11px] sm:text-xs shadow-xs transition cursor-pointer"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>{t('action_call')}</span>
            </button>

            {/* Direct WhatsApp Button */}
            <button
              onClick={() => onWhatsApp(worker)}
              className="w-full min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 px-1.5 sm:px-3 rounded-xl bg-[#2E8B57] hover:bg-[#28794c] text-white font-bold text-[11px] sm:text-xs shadow-xs transition cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>{t('action_whatsapp')}</span>
            </button>
          </div>
        )}

        {/* View Details / Rate shortcut */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 mt-2 sm:mt-2.5 pt-2 border-t border-[#176B4D]/5 text-[10px] sm:text-[11px]">
          <button
            onClick={() => onViewProfile(worker)}
            className="text-[#176B4D] hover:underline font-bold"
          >
            {t('action_view_profile')} →
          </button>
          {!worker.isSuspended && (
            <button
              onClick={() => onRateClick(worker)}
              className="text-[#855D05] hover:text-[#176B4D] font-medium flex items-center gap-1"
            >
              <Star className="w-3 h-3 text-[#E8B83D]" />
              {t('action_rate')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
