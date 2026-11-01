import React, { useState, useEffect } from 'react';
import { PhoneCall, Phone, MessageCircle, Clock, ArrowRight, User } from 'lucide-react';
import { ContactInteraction, Worker } from '../types';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';

interface ContactedViewProps {
  onViewWorker: (workerId: string) => void;
  onCall: (worker: any) => void;
  onWhatsApp: (worker: any) => void;
  onBackHome: () => void;
}

export const ContactedView: React.FC<ContactedViewProps> = ({
  onViewWorker,
  onCall,
  onWhatsApp,
  onBackHome,
}) => {
  const { user, token } = useAuth();
  const { t } = useLanguage();
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/customer/contact/history', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setHistory(data);
        }
      } catch (e) {
        console.error('Failed to load contact history:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [token]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between pb-4 border-b border-[#176B4D]/10 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[#26332D] flex items-center gap-2">
            <PhoneCall className="w-6 h-6 text-[#176B4D]" />
            <span>{t('contacted_title')}</span>
          </h1>
          <p className="text-xs text-[#586B63] mt-0.5">{t('contacted_subtitle')}</p>
        </div>

        <button
          onClick={onBackHome}
          className="text-xs font-bold text-[#176B4D] hover:underline"
        >
          ← {t('nav_home')}
        </button>
      </div>

      {!user ? (
        <div className="text-center py-16 bg-white/60 rounded-3xl border border-[#176B4D]/10 p-6 max-w-md mx-auto">
          <User className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#26332D]">{t('account_required')}</h3>
          <p className="text-xs text-[#586B63] mt-1 mb-4">
            Sign in to track and view your past Call and WhatsApp interactions with workers across
            Tamil Nadu.
          </p>
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center">
          <div className="w-8 h-8 border-4 border-[#176B4D] border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs text-stone-500">{t('loading_history')}</p>
        </div>
      ) : history.length === 0 ? (
        <div className="text-center py-16 bg-white/60 rounded-3xl border border-[#176B4D]/10 p-6 max-w-md mx-auto">
          <PhoneCall className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#26332D]">{t('contacted_empty')}</h3>
          <p className="text-xs text-[#586B63] mt-1 mb-4">{t('contacted_empty_hint')}</p>
          <button
            onClick={onBackHome}
            className="px-5 py-2.5 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition"
          >
            {t('action_search')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="glass-card rounded-2xl p-4 flex items-center justify-between gap-4 border border-[#176B4D]/10 hover:border-[#176B4D]/30 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl overflow-hidden bg-white border border-stone-200 flex-shrink-0">
                  {item.profilePhoto ? (
                    <img
                      src={item.profilePhoto}
                      alt={item.workerName}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center font-bold text-[#176B4D]">
                      {item.workerName.charAt(0)}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-sm font-bold text-[#26332D]">{item.workerName}</h4>
                  <div className="flex items-center gap-2 text-[11px] text-[#586B63] mt-0.5">
                    <span className="capitalize font-semibold text-[#176B4D]">
                      {item.workerCategory}
                    </span>
                    <span>•</span>
                    <span>{item.workerArea}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      item.method === 'Call'
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-green-50 text-green-800'
                    }`}
                  >
                    {item.method === 'Call' ? (
                      <Phone className="w-3 h-3" />
                    ) : (
                      <MessageCircle className="w-3 h-3" />
                    )}
                    <span>{item.method}</span>
                  </span>
                  <span className="text-[10px] text-stone-400 block mt-0.5">
                    {new Date(item.timestamp).toLocaleDateString()}
                  </span>
                </div>

                <button
                  onClick={() => onViewWorker(item.workerId)}
                  className="p-2 rounded-xl bg-stone-100 hover:bg-[#176B4D] hover:text-white text-[#176B4D] transition"
                  title={t('action_view_profile')}
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
