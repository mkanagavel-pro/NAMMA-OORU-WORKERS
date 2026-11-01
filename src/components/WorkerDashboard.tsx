import React, { useState, useEffect } from 'react';
import { LOCATION_CONFIGURED_DISTRICTS, OTHER_AREA_ID, formatWorkerLocation } from '../data/salemLocations';
import { WorkerLocationFields, resolveAreaPayload } from './WorkerLocationFields';
import {
  Briefcase,
  AlertTriangle,
  Clock,
  Shield,
  Save,
  CheckCircle2,
  Calendar,
  Layers,
  Send,
  Bell,
  Trash2,
  KeyRound,
  Mail,
  ToggleLeft,
  ToggleRight,
  Sparkles,
} from 'lucide-react';
import { Worker, Suspension, Appeal, AppNotification } from '../types';
import { useLanguage } from '../i18n/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { WORKER_CATEGORIES, TN_DISTRICTS } from '../data/tamilNaduData';
import { localizePlace, localizeTaluk, localizeDistrict } from '../i18n/locationNames';
import { useLocationNames } from '../i18n/useLocationNames';

export const WorkerDashboard: React.FC = () => {
  const { language, t } = useLanguage();
  const { user, token, workerProfile, updateWorkerProfileState, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<'profile' | 'suspension' | 'notifications' | 'security'>(
    'profile'
  );

  // Worker live data
  const [worker, setWorker] = useState<Worker | null>(workerProfile);
  const [suspensionInfo, setSuspensionInfo] = useState<Suspension | null>(null);
  const [latestAppeal, setLatestAppeal] = useState<Appeal | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit Profile Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [district, setDistrict] = useState('');
  const [taluk, setTaluk] = useState('');
  const [areaChoice, setAreaChoice] = useState('');
  const [publicArea, setPublicArea] = useState(''); // manual "other area" text
  const [serviceAreas, setServiceAreas] = useState('');
  const [description, setDescription] = useState('');
  const [experience, setExperience] = useState('5');
  const [rate, setRate] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');

  // Phone-change request (admin-assisted) and password change state
  const [showPhoneReq, setShowPhoneReq] = useState(false);
  const [newPhoneReq, setNewPhoneReq] = useState('');
  const [phoneReqPassword, setPhoneReqPassword] = useState('');
  const [passNeedsOtp, setPassNeedsOtp] = useState(false);

  // Appeal form state
  const [appealExplanation, setAppealExplanation] = useState('');
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);

  // Status feedback
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Security Modals state
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [passOtp, setPassOtp] = useState('');
  const [passOtpSent, setPassOtpSent] = useState(false);

  const fetchDashboardData = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/workers/dashboard/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setWorker(data.worker);
        updateWorkerProfileState(data.worker);
        setSuspensionInfo(data.suspensionInfo);
        setLatestAppeal(data.latestAppeal);
        setNotifications(data.notifications || []);

        // Sync form state
        if (data.worker) {
          setName(data.worker.name);
          setPhone(data.worker.phone);
          setCategory(data.worker.category);
          setDistrict(data.worker.district);
          setTaluk(data.worker.taluk || '');
          // listed area -> its id; manual locality -> "other" + the stored text; legacy -> nothing chosen
          setAreaChoice(data.worker.areaId || (data.worker.taluk ? OTHER_AREA_ID : ''));
          setPublicArea(data.worker.areaId ? '' : data.worker.taluk ? data.worker.publicArea : '');
          setServiceAreas((data.worker.serviceAreas || []).join(', '));
          setDescription(data.worker.description || '');
          setExperience(String(data.worker.experience));
          setRate(data.worker.rate);
          setProfilePhoto(data.worker.profilePhoto || '');
        }

        // If currently suspended, direct attention to suspension tab
        if (data.worker?.isSuspended) {
          setActiveTab('suspension');
        }
      }
    } catch (e) {
      console.error('Failed to load worker dashboard:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token]);

  // Toggle Availability ('Available' | 'Offline') (Req 24)
  const handleToggleAvailability = async () => {
    if (!worker) return;
    const newStatus = worker.availability === 'Available' ? 'Offline' : 'Available';

    try {
      const res = await fetch('/api/workers/availability', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ availability: newStatus }),
      });
      if (res.ok) {
        setWorker((prev) => (prev ? { ...prev, availability: newStatus } : null));
        setStatusMessage(`Status updated to ${newStatus}`);
        setTimeout(() => setStatusMessage(''), 2500);
      }
    } catch {
      setErrorMessage('Failed to update availability');
    }
  };

  // Profile Save (Req 20: Direct edit without admin approval)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    setErrorMessage('');

    // Location is sent only when the worker actually changed it (or is
    // completing a legacy record) - never silently re-sent or guessed.
    let locationPatch: Record<string, unknown> = {};
    if (taluk) {
      const place = resolveAreaPayload({ district, taluk, areaChoice, customArea: publicArea });
      if (!place.ok) {
        setErrorMessage(place.error === 'area' ? 'Please select your area (or choose "Other area in this taluk" and enter it).' : 'Please select your taluk.');
        return;
      }
      const changed =
        district !== worker?.district ||
        taluk !== (worker?.taluk || '') ||
        place.publicArea !== worker?.publicArea ||
        place.areaId !== (worker?.areaId ?? null);
      if (changed) locationPatch = { district, taluk: place.taluk, areaId: place.areaId, publicArea: place.publicArea };
    }

    try {
      const res = await fetch('/api/workers/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          phone,
          category,
          ...locationPatch,
          serviceAreas,
          description,
          experience: Number(experience) || 1,
          rate,
          profilePhoto,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setWorker(data.worker);
        updateWorkerProfileState(data.worker);
        setStatusMessage('Profile updated successfully!');
        setTimeout(() => setStatusMessage(''), 3000);
      } else {
        setErrorMessage(data.error || 'Failed to update profile');
      }
    } catch {
      setErrorMessage('Network error');
    }
  };

  const handlePhoneChangeRequest = async () => {
    setStatusMessage('');
    setErrorMessage('');
    try {
      const res = await fetch('/api/workers/phone-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPhone: newPhoneReq, password: phoneReqPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatusMessage(t('profile_phone_request_sent'));
        setShowPhoneReq(false);
        setNewPhoneReq('');
        setPhoneReqPassword('');
      } else {
        setErrorMessage(data.error || 'Could not submit the request');
      }
    } catch {
      setErrorMessage('Network error');
    }
  };

  // Real password change (this button used to only show a success message
  // without calling the server). Workers with a verified email confirm with
  // an emailed code; workers without email confirm with their current password.
  const handleChangePassword = async () => {
    setStatusMessage('');
    setErrorMessage('');
    if (newPass.length < 6) {
      setErrorMessage('Password must be at least 6 characters');
      return;
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass, ...(passNeedsOtp ? { otp: passOtp } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.requiresOtp) {
        setPassNeedsOtp(true);
        setStatusMessage(data.message || 'A confirmation code was sent to your email.');
      } else if (res.ok) {
        // The server revokes every session on password change, including this one.
        alert('Password updated. Please log in again with your new password.');
        logout();
      } else {
        setErrorMessage(data.error || 'Could not change the password');
      }
    } catch {
      setErrorMessage('Network error');
    }
  };

  // Submit Suspension Review Request / Appeal (Req 41-48)
  const handleSubmitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAppeal(true);
    setStatusMessage('');
    setErrorMessage('');

    try {
      const res = await fetch('/api/workers/appeal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          explanation: appealExplanation,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLatestAppeal(data.appeal);
        setAppealExplanation('');
        setStatusMessage('Your appeal has been submitted to administration for review.');
      } else {
        setErrorMessage(data.error || 'Failed to submit appeal');
      }
    } catch {
      setErrorMessage('Network error submitting appeal');
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="w-10 h-10 border-4 border-[#176B4D] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-[#586B63]">Loading worker dashboard...</p>
      </div>
    );
  }

  if (!worker) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <p className="text-sm font-bold text-stone-600">No worker profile found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-200">
      {/* Top Banner: Verification & Suspension Alert */}
      {worker.isSuspended ? (
        <div className="mb-6 p-4 sm:p-5 rounded-3xl bg-red-50 border-2 border-red-300 shadow-md">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#D64545] text-white flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-[#D64545]">
                  {t('suspension_banner_title')}
                </h2>
                <p className="text-xs text-red-900 mt-0.5">
                  Reason: <strong>{suspensionInfo?.reason || 'Administrative Review'}</strong> •{' '}
                  <span className="font-bold">
                    {t('suspension_remaining_days', {
                      days: suspensionInfo?.remainingDays ?? 'N/A',
                    })}
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('suspension')}
              className="px-4 py-2 rounded-xl bg-[#D64545] text-white text-xs font-bold shadow-xs hover:bg-red-700 transition"
            >
              {t('suspension_appeal_btn')}
            </button>
          </div>
        </div>
      ) : worker.verificationStatus === 'verified' ? (
        <div className="mb-6 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 text-xs text-emerald-900 font-semibold min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="break-words">
              Your profile is <strong className="text-emerald-700">Verified</strong> and fully
              discoverable across Tamil Nadu.
            </span>
          </div>
          <span className="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full shrink-0">
            Active
          </span>
        </div>
      ) : (
        <div className="mb-6 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-center">
          <div className="flex items-center gap-2.5 text-xs text-amber-900 font-semibold min-w-0">
            <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="break-words">
              Status: <strong className="text-amber-800">Verification Pending</strong>. Your card is
              publicly visible and customers can contact you!
            </span>
          </div>
        </div>
      )}

      {/* Main Header & Availability Toggle */}
      <div className="glass-card rounded-3xl p-5 sm:p-7 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-white border border-[#176B4D]/20 shadow-xs flex-shrink-0">
            {worker.profilePhoto ? (
              <img
                src={worker.profilePhoto}
                alt={worker.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#176B4D]/10 text-[#176B4D] font-black text-2xl">
                {worker.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#26332D]">{worker.name}</h1>
            <p className="text-xs font-bold text-[#176B4D] capitalize mt-0.5">
              {worker.category} • {formatWorkerLocation(worker).taluk ? `${t('taluk_with_name', { name: localizeTaluk(formatWorkerLocation(worker).taluk, language) })}, ` : ''}{t('district_with_name', { name: localizeDistrict(worker.district, language) })}
            </p>
            <p className="text-xs text-[#586B63] mt-0.5">{worker.email || '(no email)'}</p>
            <p className="text-xs text-[#586B63] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                {t('profile_user_id')}: <strong className="text-[#26332D] select-all">{user?.loginId || '—'}</strong>
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  worker.phoneVerified
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-stone-100 text-stone-600 border-stone-200'
                }`}
              >
                {worker.phoneVerified ? t('badge_phone_verified') : t('badge_phone_unverified')}
              </span>
            </p>
          </div>
        </div>

        {/* Availability Toggle (Req 24: Available / Offline only) */}
        <div className="flex flex-col items-start sm:items-end gap-1.5 w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-[#176B4D]/10">
          <span className="text-[11px] font-bold text-[#586B63] uppercase tracking-wider">
            {t('status_available')} / {t('status_offline')}
          </span>
          <button
            onClick={handleToggleAvailability}
            disabled={worker.isSuspended}
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl font-bold text-xs shadow-xs transition ${
              worker.isSuspended
                ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                : worker.availability === 'Available'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                worker.availability === 'Available' && !worker.isSuspended
                  ? 'bg-white'
                  : 'bg-stone-500'
              }`}
            />
            <span>
              {worker.isSuspended
                ? 'Suspended'
                : worker.availability === 'Available'
                ? t('status_available')
                : t('status_offline')}
            </span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-stone-200 mb-6 gap-2 sm:gap-4 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'profile'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          {t('worker_profile_tab')}
        </button>

        {worker.isSuspended && (
          <button
            onClick={() => setActiveTab('suspension')}
            className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
              activeTab === 'suspension'
                ? 'border-[#D64545] text-[#D64545]'
                : 'border-transparent text-[#D64545]/70 hover:text-[#D64545]'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>{t('suspension_banner_title')}</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'notifications'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>{t('worker_notifications_tab')}</span>
          {notifications.length > 0 && (
            <span className="bg-[#176B4D]/15 text-[#176B4D] text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {notifications.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'security'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          {t('worker_security_tab')}
        </button>
      </div>

      {/* Messages */}
      {statusMessage && (
        <div className="mb-5 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-5 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-[#D64545]">
          {errorMessage}
        </div>
      )}

      {/* TAB 1: Profile Editor (Req 20: No admin approval required) */}
      {activeTab === 'profile' && (
        <div className="glass-card rounded-3xl p-5 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#176B4D]/10 mb-5">
            <div>
              <h3 className="text-base font-black text-[#26332D]">{t('profile_about')}</h3>
              <p className="text-xs text-[#586B63]">
                Changes to your profile take effect immediately without requiring admin review.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            {!worker.taluk && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="font-bold">{t('location_incomplete')}</div>
                <div className="mt-0.5">{t('location_incomplete_help')}</div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_name')} *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_phone')} *
                </label>
                <input
                  type="tel"
                  readOnly
                  aria-readonly="true"
                  value={phone}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-200 bg-stone-100 text-stone-600 focus:outline-none"
                />
                <p className="text-[10px] text-[#586B63] mt-1">{t('profile_phone_locked')}</p>
                <button
                  type="button"
                  onClick={() => setShowPhoneReq(!showPhoneReq)}
                  className="mt-1.5 text-[11px] font-bold text-[#176B4D] hover:underline"
                >
                  {t('profile_phone_request_btn')}
                </button>
                {showPhoneReq && (
                  <div className="mt-2 p-3 rounded-2xl border border-stone-200 bg-white space-y-2" data-testid="phone-change-form">
                    <label className="block text-[11px] font-bold text-[#176B4D]">{t('profile_phone_new_label')}</label>
                    <input
                      type="tel"
                      value={newPhoneReq}
                      onChange={(e) => setNewPhoneReq(e.target.value)}
                      placeholder="10-digit mobile"
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                    />
                    <label className="block text-[11px] font-bold text-[#176B4D]">{t('profile_phone_password_label')}</label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={phoneReqPassword}
                      onChange={(e) => setPhoneReqPassword(e.target.value)}
                      className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                    />
                    <button
                      type="button"
                      onClick={handlePhoneChangeRequest}
                      className="px-4 py-2 rounded-xl bg-[#176B4D] text-white text-xs font-bold"
                    >
                      {t('profile_phone_request_btn')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_category')} *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                >
                  {WORKER_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {language === 'ta' ? c.nameTa : c.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_district')} *
                </label>
                <select
                  value={district}
                  onChange={(e) => {
                    setDistrict(e.target.value);
                    setTaluk('');
                    setAreaChoice('');
                    setPublicArea('');
                  }}
                  className="w-full min-w-0 text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                >
                  {!(district in LOCATION_CONFIGURED_DISTRICTS) && district && (
                    <option value={district} disabled>
                      {district}
                    </option>
                  )}
                  {TN_DISTRICTS.filter((d) => d.id in LOCATION_CONFIGURED_DISTRICTS).map((d) => (
                    <option key={d.id} value={d.id}>
                      {language === 'ta' ? d.nameTa : d.nameEn}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 min-w-0">
                <WorkerLocationFields
                  required={Boolean(worker.taluk) || Boolean(taluk)}
                  value={{ district, taluk, areaChoice, customArea: publicArea }}
                  onChange={(patch) => {
                    if (patch.taluk !== undefined) setTaluk(patch.taluk);
                    if (patch.areaChoice !== undefined) setAreaChoice(patch.areaChoice);
                    if (patch.customArea !== undefined) setPublicArea(patch.customArea);
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_service_areas')} (Comma separated)
                </label>
                <input
                  type="text"
                  value={serviceAreas}
                  onChange={(e) => setServiceAreas(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_experience')} (Years)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  {t('profile_rate')}
                </label>
                <input
                  type="text"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#176B4D] mb-1">
                  Profile Photo URL
                </label>
                <input
                  type="url"
                  value={profilePhoto}
                  onChange={(e) => setProfilePhoto(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#176B4D] mb-1">
                {t('profile_about')}
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="flex items-center gap-2 py-2.5 px-6 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Profile Changes</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 2: Suspension & Appeal Dashboard (Req 34 & 35 & 41-48) */}
      {activeTab === 'suspension' && (
        <div className="space-y-6">
          {/* Suspension Status Card */}
          <div className="glass-card rounded-3xl p-5 sm:p-7 border-2 border-red-200 bg-red-50/20 shadow-sm">
            <div className="flex items-center gap-3 pb-4 border-b border-red-200/60 mb-5">
              <div className="w-10 h-10 rounded-2xl bg-[#D64545] text-white flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-[#D64545]">
                  {t('suspension_banner_title')}
                </h3>
                <p className="text-xs text-stone-600">
                  {t('suspension_action_by')}
                </p>
              </div>
            </div>

            {/* Suspension Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-white p-3.5 rounded-2xl border border-red-200">
                <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">
                  {t('suspension_reason_title')}
                </span>
                <span className="text-sm font-black text-[#D64545] mt-0.5 block">
                  {suspensionInfo?.reason || 'Guideline violation'}
                </span>
                {suspensionInfo?.note && (
                  <p className="text-xs text-stone-600 mt-1 italic">
                    Note: "{suspensionInfo.note}"
                  </p>
                )}
              </div>

              <div className="bg-white p-3.5 rounded-2xl border border-red-200">
                <span className="text-[10px] text-stone-500 font-bold uppercase tracking-wider block">
                  Duration & Timeline
                </span>
                <span className="text-sm font-black text-[#176B4D] mt-0.5 block">
                  {t('suspension_remaining_days', {
                    days: suspensionInfo?.remainingDays ?? 0,
                  })}
                </span>
                <p className="text-[11px] text-stone-500 mt-1">
                  Start: {new Date(suspensionInfo?.startDate || '').toLocaleDateString()} • End:{' '}
                  {new Date(suspensionInfo?.endDate || '').toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Restrictions Box */}
            <div className="p-4 rounded-2xl bg-white border border-red-100 mb-6">
              <h4 className="text-xs font-black text-stone-800 uppercase tracking-wide mb-2">
                Active Restrictions:
              </h4>
              <ul className="text-xs text-stone-700 space-y-1.5 list-disc list-inside">
                <li>Direct Call and WhatsApp buttons are disabled for customers.</li>
                <li>Your profile is displayed at the bottom of search results.</li>
                <li>New rating submissions are temporarily paused.</li>
              </ul>
            </div>

            {/* Appeal / Review Section (Req 41-48) */}
            <div className="p-5 rounded-2xl bg-white border border-[#176B4D]/20 shadow-2xs">
              <h4 className="text-sm font-black text-[#176B4D] mb-1 flex items-center gap-2">
                <Send className="w-4 h-4 text-[#E8B83D]" />
                <span>{t('appeal_modal_title')}</span>
              </h4>
              <p className="text-xs text-[#586B63] mb-4">
                If you believe this action was applied in error or have addressed the issue, you may
                submit an explanation to administration.
              </p>

              {/* Show Status of Existing Appeal if Any */}
              {latestAppeal && (
                <div
                  className={`p-4 rounded-2xl mb-4 border text-xs ${
                    latestAppeal.status === 'Pending'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : latestAppeal.status === 'Approved'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    <span className="capitalize">{t('appeal_status_label')}:</span>
                    <span className="px-2 py-0.5 rounded-full font-black uppercase text-[11px] bg-white shadow-2xs">
                      {latestAppeal.status}
                    </span>
                  </div>
                  {latestAppeal.status === 'Pending' && (
                    <p className="mt-1">
                      Your appeal is currently under review by our administration. You will be
                      notified as soon as a decision is made.
                    </p>
                  )}
                  {latestAppeal.status === 'Rejected' && (
                    <p className="mt-1">
                      Your appeal was reviewed on{' '}
                      {new Date(latestAppeal.decisionDate || '').toLocaleDateString()} and was not
                      approved. The suspension remains active until its scheduled expiry.
                    </p>
                  )}
                </div>
              )}

              {/* Appeal Form (Disabled if an appeal is currently Pending, Req 43) */}
              {latestAppeal?.status === 'Pending' ? (
                <p className="text-xs text-stone-500 italic">
                  You already have an appeal under review. Only one pending appeal is allowed at a
                  time.
                </p>
              ) : (
                <form onSubmit={handleSubmitAppeal} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-[#176B4D] mb-1">
                      {t('appeal_explanation_label')} (Max 500 characters, no attachments)
                    </label>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={appealExplanation}
                      onChange={(e) => setAppealExplanation(e.target.value)}
                      placeholder={t('appeal_explanation_placeholder')}
                      className="w-full text-xs p-3 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
                      required
                    />
                    <span className="text-[10px] text-stone-400 block text-right">
                      {appealExplanation.length}/500
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmittingAppeal || !appealExplanation.trim()}
                      className="py-2.5 px-5 rounded-2xl bg-[#176B4D] hover:bg-[#2F8F68] text-white font-bold text-xs shadow-md transition disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingAppeal ? 'Submitting...' : t('appeal_submit_btn')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Notifications & Warnings History */}
      {activeTab === 'notifications' && (
        <div className="glass-card rounded-3xl p-5 sm:p-7 shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-[#176B4D]/10 mb-5">
            <div>
              <h3 className="text-base font-black text-[#26332D]">
                {t('worker_notifications_tab')}
              </h3>
              <p className="text-xs text-[#586B63]">
                Official alerts, verification notices, warnings, and suspension updates.
              </p>
            </div>
            {/* Warning Count Alert (Req 28: 3 active warnings = permanent deletion) */}
            <div className="text-right">
              <span className="text-[10px] text-stone-500 uppercase tracking-wide font-bold block">
                Active Warnings
              </span>
              <span
                className={`text-sm font-black ${
                  (worker.warningCount || 0) > 0 ? 'text-[#D64545]' : 'text-emerald-700'
                }`}
              >
                {worker.warningCount || 0} / 3
              </span>
            </div>
          </div>

          {notifications.length === 0 ? (
            <p className="text-center text-xs text-stone-500 py-8">
              No recent notifications or warnings. Your record is clean!
            </p>
          ) : (
            <div className="space-y-3">
              {notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-3.5 rounded-2xl border transition ${
                    notif.type === 'suspension' || notif.type === 'warning'
                      ? 'bg-red-50/80 border-red-200 text-red-900'
                      : notif.type === 'appeal'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                      : 'bg-white border-[#176B4D]/15 text-[#26332D]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-bold">{notif.title}</span>
                    <span className="text-[10px] text-stone-400">
                      {new Date(notif.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed opacity-90">{notif.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Account & Security */}
      {activeTab === 'security' && (
        <div className="glass-card rounded-3xl p-5 sm:p-7 shadow-xs space-y-6">
          <div className="pb-4 border-b border-[#176B4D]/10">
            <h3 className="text-base font-black text-[#26332D]">{t('worker_security_tab')}</h3>
            <p className="text-xs text-[#586B63]">Manage credentials and account safety.</p>
          </div>

          {/* Change Password Card */}
          <div className="bg-white p-4 rounded-2xl border border-stone-200">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-xs font-black text-[#176B4D]">Password & Authentication</h4>
                <p className="text-[11px] text-stone-500">
                  Secured with encrypted scrypt-hash tokens.
                </p>
              </div>
              <button
                onClick={() => setShowChangePass(!showChangePass)}
                className="px-3 py-1.5 rounded-xl border border-[#176B4D] text-[#176B4D] text-xs font-bold hover:bg-[#176B4D]/10 transition shrink-0"
              >
                Change Password
              </button>
            </div>

            {showChangePass && (
              <div className="mt-4 pt-4 border-t border-stone-100 space-y-3">
                <input
                  type="password"
                  placeholder="Current password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
                <input
                  type="password"
                  placeholder="New password (min 6 characters)"
                  value={newPass}
                  onChange={(e) => setNewPass(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
                {passNeedsOtp && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6-digit code sent to your email"
                    value={passOtp}
                    onChange={(e) => setPassOtp(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                  />
                )}
                <button
                  type="button"
                  onClick={handleChangePassword}
                  className="px-4 py-2 rounded-xl bg-[#176B4D] text-white text-xs font-bold"
                >
                  {passNeedsOtp ? 'Confirm with code' : 'Save New Password'}
                </button>
              </div>
            )}
          </div>

          {/* Logout Shortcut */}
          <div className="pt-2 flex justify-between items-center">
            <span className="text-xs text-stone-500">End your current session:</span>
            <button
              onClick={logout}
              className="px-4 py-2 rounded-xl border border-[#D64545] text-[#D64545] hover:bg-red-50 text-xs font-bold transition"
            >
              Sign Out of Worker Account
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
