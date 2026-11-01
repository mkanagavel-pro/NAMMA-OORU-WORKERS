import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../i18n/LanguageContext';

// Admin tab: "Password Recovery Requests" (+ phone-change requests).
// Admins can never see passwords. The raw reset link exists only in this
// component's memory after "Generate reset link" - the server stores just a
// hash, and the list endpoint never returns it.

interface Item {
  id: string;
  reference: string;
  type: 'password_reset' | 'phone_change';
  status: 'pending' | 'approved' | 'link_issued' | 'completed' | 'rejected' | 'expired';
  createdAt: number;
  loginId: string | null;
  workerId: string | null;
  workerName: string | null;
  district: string | null;
  publicArea: string | null;
  category: string | null;
  phoneMasked: string;
  newPhoneMasked: string | null;
  phoneVerified: boolean;
  hasVerifiedEmail: boolean;
  identityVerified: boolean;
  adminNote: string;
  decidedBy: string | null;
  tokenExpiresAt: number | null;
}
interface LinkResult { resetUrl: string; waPhone: string; ttlMinutes: number; expiresAt: number; workerName: string }

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  link_issued: 'bg-indigo-100 text-indigo-800',
  completed: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-stone-200 text-stone-700',
};

export const AdminRecoveryTab: React.FC<{ token: string | null }> = ({ token }) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<Item[]>([]);
  const [filter, setFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [phones, setPhones] = useState<Record<string, { phone: string | null; newPhone: string | null }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [idChecked, setIdChecked] = useState<Record<string, boolean>>({});
  const [phoneChecked, setPhoneChecked] = useState<Record<string, boolean>>({});
  const [links, setLinks] = useState<Record<string, LinkResult>>({});
  const [waLang, setWaLang] = useState<'tanglish' | 'ta' | 'en'>('tanglish');

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/recovery?status=${filter}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setItems(data.items || []);
        setError('');
      } else setError(data.error || 'Could not load requests');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, token]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path: string, body: unknown = {}) {
    setError('');
    setInfo('');
    try {
      const res = await fetch(`/api/admin/recovery/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Action failed');
        return null;
      }
      return data;
    } catch {
      setError('Network error');
      return null;
    }
  }

  const showPhone = async (id: string) => {
    const d = await act(`${id}/phone`);
    if (d) setPhones((p) => ({ ...p, [id]: { phone: d.phone, newPhone: d.newPhone } }));
  };
  const approve = async (it: Item) => {
    const d = await act(`${it.id}/approve`, {
      identityVerified: idChecked[it.id] === true,
      phoneVerified: phoneChecked[it.id] === true,
      note: notes[it.id] || '',
    });
    if (d) {
      setInfo(it.type === 'phone_change' ? 'Phone number changed.' : 'Approved. You can now generate the reset link.');
      load();
    }
  };
  const reject = async (it: Item) => {
    if (!window.confirm('Reject this request?')) return;
    const d = await act(`${it.id}/reject`, { note: notes[it.id] || '' });
    if (d) {
      setLinks((l) => {
        const n = { ...l };
        delete n[it.id];
        return n;
      });
      load();
    }
  };
  const generate = async (it: Item) => {
    const d = (await act(`${it.id}/generate-link`)) as LinkResult | null;
    if (d) {
      setLinks((l) => ({ ...l, [it.id]: d }));
      setInfo('Link generated. It is shown only here and works once. Generating another voids this one.');
      load();
    }
  };

  const waMessage = (l: LinkResult) =>
    t(`recovery_wa_message_${waLang}` as any, { link: l.resetUrl, minutes: l.ttlMinutes });
  // wa.me only OPENS WhatsApp with the text pre-filled. The admin must press Send;
  // nothing here can tell whether the message was actually sent or delivered.
  const openWhatsApp = (l: LinkResult) => {
    window.open(`https://wa.me/${l.waPhone}?text=${encodeURIComponent(waMessage(l))}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="glass-card rounded-3xl p-5 border border-stone-200 shadow-xs" data-testid="recovery-tab">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h3 className="text-sm font-black text-[#176B4D]">Password Recovery &amp; Phone Change Requests</h3>
        <div className="flex gap-1">
          {(['open', 'closed', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${filter === f ? 'bg-[#176B4D] text-white border-[#176B4D]' : 'bg-white text-stone-600 border-stone-300'}`}
            >
              {f === 'open' ? 'Open' : f === 'closed' ? 'Closed' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-[#586B63] mb-4">
        Call the worker on their registered number and verify who they are <strong>before</strong> approving. Passwords are never visible. WhatsApp opens with the
        message ready - you must press Send yourself; this app cannot tell whether it was delivered. A request becomes Completed only when the worker actually sets a new password.
      </p>

      <div className="flex items-center gap-2 mb-3 text-xs">
        <label htmlFor="wa-lang" className="font-bold text-[#176B4D]">{t('recovery_wa_lang_label')}:</label>
        <select id="wa-lang" value={waLang} onChange={(e) => setWaLang(e.target.value as any)} className="text-xs p-1.5 rounded-lg border border-stone-300 bg-white">
          <option value="tanglish">Tanglish</option>
          <option value="ta">தமிழ்</option>
          <option value="en">English</option>
        </select>
      </div>

      {error && <div role="alert" className="mb-3 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs font-semibold text-[#D64545]">{error}</div>}
      {info && <div role="status" className="mb-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800">{info}</div>}
      {loading && <p className="text-xs text-stone-500">Loading...</p>}
      {!loading && items.length === 0 && <p className="text-xs text-stone-500">No requests.</p>}

      <div className="space-y-3">
        {items.map((it) => {
          const link = links[it.id];
          const canGenerate = it.type === 'password_reset' && ['approved', 'link_issued', 'expired'].includes(it.status);
          return (
            <div key={it.id} className="p-3.5 bg-white rounded-2xl border border-stone-200 text-xs space-y-2.5" data-testid="recovery-item">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-black text-[#26332D] break-all">{it.reference}</span>
                  <span className="ml-2 text-[10px] font-bold uppercase text-stone-500">{it.type === 'phone_change' ? 'Phone change' : 'Password reset'}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLE[it.status] || ''}`}>{it.status.replace('_', ' ')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-[#26332D]">
                <div>Name: <strong>{it.workerName || '—'}</strong></div>
                <div>User ID: <strong>{it.loginId || '—'}</strong></div>
                <div className="capitalize">Work: {it.category || '—'} • {it.publicArea || ''}{it.district ? `, ${it.district}` : ''}</div>
                <div>Requested: {new Date(it.createdAt).toLocaleString()}</div>
                <div>
                  Phone: <span className="font-mono">{phones[it.id]?.phone || it.phoneMasked}</span>{' '}
                  {phones[it.id]?.phone && <a href={`tel:+91${phones[it.id].phone}`} className="text-[#176B4D] font-bold underline">Call</a>}
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold ${it.phoneVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
                    {it.phoneVerified ? t('badge_phone_verified') : t('badge_phone_unverified')}
                  </span>
                </div>
                {it.type === 'phone_change' && (
                  <div>New phone: <span className="font-mono">{phones[it.id]?.newPhone || it.newPhoneMasked}</span></div>
                )}
                {it.type === 'password_reset' && it.hasVerifiedEmail && (
                  <div className="text-amber-700 font-semibold sm:col-span-2">This worker has a verified email - they can reset by email code instead.</div>
                )}
                {it.adminNote && <div className="sm:col-span-2 text-stone-500 break-words">Note: {it.adminNote}</div>}
                {it.decidedBy && <div className="sm:col-span-2 text-stone-400">Decided by {it.decidedBy}</div>}
                {it.tokenExpiresAt && <div className="sm:col-span-2 text-stone-500">Link {it.status === 'expired' ? 'expired' : 'expires'}: {new Date(it.tokenExpiresAt).toLocaleString()}</div>}
              </div>

              {!['completed', 'rejected'].includes(it.status) && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => showPhone(it.id)} className="px-3 py-1.5 rounded-xl border border-[#176B4D] text-[#176B4D] font-bold">Show phone number</button>
                </div>
              )}

              {it.status === 'pending' && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-[#176B4D]" checked={idChecked[it.id] === true} onChange={(e) => setIdChecked((m) => ({ ...m, [it.id]: e.target.checked }))} />
                    <span>I have personally verified this worker&apos;s identity (call-back on the registered number, or in person).</span>
                  </label>
                  {it.type === 'phone_change' && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0 accent-[#176B4D]" checked={phoneChecked[it.id] === true} onChange={(e) => setPhoneChecked((m) => ({ ...m, [it.id]: e.target.checked }))} />
                      <span>I called the NEW number and confirmed it belongs to this worker (marks it &quot;Phone verified&quot;).</span>
                    </label>
                  )}
                  <input
                    type="text"
                    maxLength={500}
                    placeholder="Note (what you checked) - optional"
                    value={notes[it.id] || ''}
                    onChange={(e) => setNotes((m) => ({ ...m, [it.id]: e.target.value }))}
                    className="w-full text-xs p-2 rounded-xl border border-stone-300"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={idChecked[it.id] !== true} onClick={() => approve(it)} className="px-3 py-1.5 rounded-xl bg-[#176B4D] text-white font-bold disabled:opacity-40">
                      {it.type === 'phone_change' ? 'Approve & change number' : 'Approve'}
                    </button>
                    <button type="button" onClick={() => reject(it)} className="px-3 py-1.5 rounded-xl border border-[#D64545] text-[#D64545] font-bold">Reject</button>
                  </div>
                </div>
              )}

              {canGenerate && (
                <div className="space-y-2 pt-2 border-t border-stone-100">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => generate(it)} className="px-3 py-1.5 rounded-xl bg-[#176B4D] text-white font-bold">
                      {it.status === 'approved' ? 'Generate reset link' : 'Generate a new link (voids the old one)'}
                    </button>
                    <button type="button" onClick={() => reject(it)} className="px-3 py-1.5 rounded-xl border border-[#D64545] text-[#D64545] font-bold">Reject</button>
                  </div>
                  {link && (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2" data-testid="reset-link-box">
                      <div className="text-[11px] text-emerald-900 font-semibold">
                        Valid for {link.ttlMinutes} minutes, single use. Open WhatsApp, check the message, then press Send yourself.
                      </div>
                      <div className="font-mono text-[10px] break-all text-stone-700 select-all">{link.resetUrl}</div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => openWhatsApp(link)} className="px-3 py-1.5 rounded-xl bg-[#25D366] text-white font-bold">Send Reset Link on WhatsApp</button>
                        <button type="button" onClick={() => navigator.clipboard?.writeText(link.resetUrl)} className="px-3 py-1.5 rounded-xl border border-stone-300 text-stone-700 font-bold">Copy link</button>
                      </div>
                    </div>
                  )}
                  {!link && it.status === 'link_issued' && (
                    <p className="text-[11px] text-stone-500">A link was issued earlier. For security it cannot be shown again - generate a new one if the worker needs it.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
