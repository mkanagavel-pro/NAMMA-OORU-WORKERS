import React from 'react';
import { X, Mail, Bell, CheckCheck, Clock, ShieldAlert, KeyRound, Copy } from 'lucide-react';
import { useBodyScrollLock } from './Modal';
import { useNotifications } from '../context/NotificationContext';
import { useLanguage } from '../i18n/LanguageContext';

export const NotificationDrawer: React.FC = () => {
  const {
    isDrawerOpen,
    closeDrawer,
    activeDrawerTab,
    openDrawer,
    notifications,
    systemEmails,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const { t } = useLanguage();

  useBodyScrollLock(isDrawerOpen);

  if (!isDrawerOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={closeDrawer} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10 pointer-events-none">
        <div className="pointer-events-auto w-screen max-w-md bg-[#FAF7EF] shadow-2xl border-l border-[#176B4D]/20 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-[#176B4D]/15 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <button
                onClick={() => openDrawer('notifications')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeDrawerTab === 'notifications'
                    ? 'bg-[#176B4D] text-white'
                    : 'text-[#586B63] hover:bg-stone-100'
                }`}
              >
                <Bell className="w-3.5 h-3.5" />
                <span>In-App Alerts ({notifications.length})</span>
              </button>

              <button
                onClick={() => openDrawer('emails')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeDrawerTab === 'emails'
                    ? 'bg-[#176B4D] text-white'
                    : 'text-[#586B63] hover:bg-stone-100'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>System Emails ({systemEmails.length})</span>
              </button>
            </div>

            <button
              onClick={closeDrawer}
              aria-label="Close"
              className="shrink-0 w-10 h-10 flex items-center justify-center rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Subheader info / actions */}
          <div className="px-4 py-2 bg-[#176B4D]/5 flex items-center justify-between text-[11px] text-[#586B63] border-b border-[#176B4D]/10">
            {activeDrawerTab === 'notifications' ? (
              <>
                <span>Real-time platform updates</span>
                <button
                  onClick={markAllAsRead}
                  className="text-[#176B4D] font-bold hover:underline flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              </>
            ) : (
              <>
                <span>Simulated inbox for OTPs & notices</span>
                <span className="text-[#176B4D] font-mono text-[10px]">Instant Dev Preview</span>
              </>
            )}
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeDrawerTab === 'notifications' ? (
              notifications.length === 0 ? (
                <div className="text-center py-16 text-stone-400 text-xs">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>No new notifications</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => markAsRead(n.id)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                      !n.read ? 'bg-white border-[#176B4D]/30 shadow-xs' : 'bg-white/60 border-stone-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-[#26332D] flex items-center gap-1.5">
                        {!n.read && <span className="w-2 h-2 rounded-full bg-[#176B4D]" />}
                        {n.title}
                      </span>
                      <span className="text-[10px] text-stone-400">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-[#586B63] leading-relaxed">{n.message}</p>
                  </div>
                ))
              )
            ) : systemEmails.length === 0 ? (
              <div className="text-center py-16 text-stone-400 text-xs">
                <Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No system emails dispatched yet.</p>
              </div>
            ) : (
              systemEmails.map((email) => {
                // Check if email contains an OTP code
                const otpMatch = email.message.match(/\b\d{6}\b/);
                const otpCode = otpMatch ? otpMatch[0] : null;

                return (
                  <div
                    key={email.id}
                    className="p-4 rounded-2xl bg-white border border-[#176B4D]/20 shadow-xs space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] pb-1 border-b border-stone-100">
                      <span className="font-bold text-[#176B4D] truncate min-w-0">
                        To: {email.recipientId}
                      </span>
                      <span className="text-stone-400 text-[10px] shrink-0">
                        {new Date(email.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-[#26332D]">{email.title}</div>
                    <p className="text-xs text-[#586B63] leading-relaxed bg-stone-50 p-2.5 rounded-xl border border-stone-200">
                      {email.message}
                    </p>

                    {/* Quick OTP Copy Button */}
                    {otpCode && (
                      <div className="flex items-center justify-between bg-emerald-50 p-2 rounded-xl border border-emerald-200 text-xs">
                        <span className="font-mono font-black text-emerald-800 tracking-wider">
                          OTP: {otpCode}
                        </span>
                        <button
                          onClick={() => copyToClipboard(otpCode)}
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:underline"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Code</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
