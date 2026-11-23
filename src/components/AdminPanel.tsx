import { formatWorkerLocation } from '../data/salemLocations';
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Ban,
  RotateCcw,
  Flag,
  FileText,
  Sliders,
  Sparkles,
  Phone,
  Trash2,
  Edit,
  Eye,
  Send,
} from 'lucide-react';
import { Modal } from './Modal';
import { AdminRecoveryTab } from './AdminRecoveryTab';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { Worker, Appeal, AuditLog } from '../types';
import { WORKER_CATEGORIES, TN_DISTRICTS } from '../data/tamilNaduData';
import { localizePlace, localizeTaluk, localizeDistrict } from '../i18n/locationNames';
import { useLocationNames } from '../i18n/useLocationNames';

// Small reusable Prev/Next pagination control shared by all 5 paginated
// admin lists (workers, appeals, reports, customers, audit logs).
const AdminPager: React.FC<{ page: number; totalPages: number; onChange: (p: number) => void }> = ({
  page,
  totalPages,
  onChange,
}) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-xs">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="px-3 py-1.5 rounded-lg border border-stone-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-100 min-h-[36px]"
      >
        Prev
      </button>
      <span className="text-stone-500 font-semibold">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-3 py-1.5 rounded-lg border border-stone-300 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-100 min-h-[36px]"
      >
        Next
      </button>
    </div>
  );
};

export const AdminPanel: React.FC = () => {
  const { language, t } = useLanguage();
  const { token, user } = useAuth();

  const [activeTab, setActiveTab] = useState<
    'overview' | 'workers' | 'appeals' | 'reports' | 'customers' | 'audit' | 'recovery' | 'settings'
  >('overview');

  // Stats
  const [stats, setStats] = useState<any>(null);

  // Workers List & Filters
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Appeals & Reports
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ autoVerifyWorkers: false });

  // Pagination - one page number + total-pages pair per paginated list.
  // Each admin list endpoint now returns { items, total, page, pageSize,
  // totalPages } instead of a raw array/500-cap.
  const ADMIN_PAGE_SIZE = 25;
  const [workersPage, setWorkersPage] = useState(1);
  const [workersTotalPages, setWorkersTotalPages] = useState(1);
  const [appealsPage, setAppealsPage] = useState(1);
  const [appealsTotalPages, setAppealsTotalPages] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [customersPage, setCustomersPage] = useState(1);
  const [customersTotalPages, setCustomersTotalPages] = useState(1);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  // Modals for Actions
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [actionModal, setActionModal] = useState<
    'suspend' | 'modify_suspension' | 'warning' | 'resolve' | null
  >(null);

  // Suspend Form State
  const [suspensionDuration, setSuspensionDuration] = useState('7');
  const [suspensionReason, setSuspensionReason] = useState('Reported misconduct');
  const [suspensionNote, setSuspensionNote] = useState('');

  // Warning Form State
  const [warningReason, setWarningReason] = useState('');

  // Resolution Note
  const [resolutionNote, setResolutionNote] = useState('');

  // Feedback
  const toast = useToast();
  const showSuccess = (msg: string) => toast.success(msg);
  const showError = (msg: string) => toast.error(msg);

  const fetchAdminData = async () => {
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };

      // Stats
      const sRes = await fetch('/api/admin/stats', { headers });
      if (sRes.ok) setStats(await sRes.json());

      // Workers (paginated)
      const wRes = await fetch(`/api/admin/workers?page=${workersPage}&pageSize=${ADMIN_PAGE_SIZE}`, { headers });
      if (wRes.ok) {
        const data = await wRes.json();
        setWorkers(data.items);
        setWorkersTotalPages(data.totalPages);
      }

      // Appeals (paginated)
      const aRes = await fetch(`/api/admin/appeals?page=${appealsPage}&pageSize=${ADMIN_PAGE_SIZE}`, { headers });
      if (aRes.ok) {
        const data = await aRes.json();
        setAppeals(data.items);
        setAppealsTotalPages(data.totalPages);
      }

      // Reports (paginated)
      const rRes = await fetch(`/api/admin/reports?page=${reportsPage}&pageSize=${ADMIN_PAGE_SIZE}`, { headers });
      if (rRes.ok) {
        const data = await rRes.json();
        setReports(data.items);
        setReportsTotalPages(data.totalPages);
      }

      // Settings
      const setRes = await fetch('/api/admin/settings', { headers });
      if (setRes.ok) setSettings(await setRes.json());

      // Audit Logs (paginated)
      const logRes = await fetch(`/api/admin/audit-logs?page=${auditPage}&pageSize=${ADMIN_PAGE_SIZE}`, { headers });
      if (logRes.ok) {
        const data = await logRes.json();
        setAuditLogs(data.items);
        setAuditTotalPages(data.totalPages);
      }

      // Customers (paginated)
      const custRes = await fetch(`/api/admin/customers?page=${customersPage}&pageSize=${ADMIN_PAGE_SIZE}`, { headers });
      if (custRes.ok) {
        const data = await custRes.json();
        setCustomers(data.items);
        setCustomersTotalPages(data.totalPages);
      }
    } catch (e) {
      console.error('Failed to load admin data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, workersPage, appealsPage, reportsPage, customersPage, auditPage]);

  // Action: Verify Worker
  const handleVerifyWorker = async (workerId: string) => {
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/verify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        showSuccess('Worker verified successfully!');
        fetchAdminData();
      }
    } catch {
      showError('Failed to verify worker');
    }
  };

  // Action: Reject Worker
  const handleRejectWorker = async (workerId: string) => {
    const reason = prompt('Enter reason for rejection (optional):') || '';
    try {
      const res = await fetch(`/api/admin/workers/${workerId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        showSuccess('Worker application rejected.');
        fetchAdminData();
      }
    } catch {
      showError('Failed to reject worker');
    }
  };

  // Action: Suspend Worker (Req 30-36)
  const handleSuspendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;

    try {
      const res = await fetch(`/api/admin/workers/${selectedWorker.id}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          durationDays: Number(suspensionDuration),
          reason: suspensionReason,
          note: suspensionNote,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message || 'Worker suspended.');
        setActionModal(null);
        setSelectedWorker(null);
        fetchAdminData();
      } else {
        showError(data.error || 'Failed to suspend');
      }
    } catch {
      showError('Network error');
    }
  };

  // Action: Modify Active Suspension (Req 32 & 49)
  const handleModifySuspension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker) return;

    try {
      const res = await fetch(`/api/admin/workers/${selectedWorker.id}/suspend/modify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          newDurationDays: Number(suspensionDuration),
          newReason: suspensionReason,
          newNote: suspensionNote,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess('Suspension details updated. Old values preserved in audit log.');
        setActionModal(null);
        setSelectedWorker(null);
        fetchAdminData();
      } else {
        showError(data.error || 'Failed to modify suspension');
      }
    } catch {
      showError('Network error');
    }
  };

  // Action: Resolve Suspension Early (Req 32 & 50)
  const handleResolveSuspension = async () => {
    if (!selectedWorker) return;

    try {
      const res = await fetch(`/api/admin/workers/${selectedWorker.id}/suspend/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resolutionNote }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message || 'Suspension resolved early.');
        setActionModal(null);
        setSelectedWorker(null);
        fetchAdminData();
      }
    } catch {
      showError('Failed to resolve suspension');
    }
  };

  // Action: Issue Warning (Req 28: 3 warnings = permanent deletion)
  const handleIssueWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorker || !warningReason.trim()) return;

    try {
      const res = await fetch(`/api/admin/workers/${selectedWorker.id}/warning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: warningReason }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message);
        setActionModal(null);
        setSelectedWorker(null);
        setWarningReason('');
        fetchAdminData();
      } else {
        showError(data.error || 'Failed to issue warning');
      }
    } catch {
      showError('Network error');
    }
  };

  // Action: Appeal Decision (Approve / Reject) (Req 41-48)
  const handleAppealDecision = async (appealId: string, decision: 'Approved' | 'Rejected') => {
    const adminNote =
      prompt(`Enter optional note for ${decision.toUpperCase()} decision (audit logged):`) || '';

    try {
      const res = await fetch(`/api/admin/appeals/${appealId}/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ decision, adminNote }),
      });

      const data = await res.json();
      if (res.ok) {
        showSuccess(data.message);
        fetchAdminData();
      } else {
        showError(data.error || 'Failed to record decision');
      }
    } catch {
      showError('Network error');
    }
  };

  // Action: Toggle Auto-Verify Setting (Req 54 & 75)
  const handleToggleAutoVerify = async () => {
    const nextVal = !settings.autoVerifyWorkers;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ autoVerifyWorkers: nextVal }),
      });
      if (res.ok) {
        setSettings({ ...settings, autoVerifyWorkers: nextVal });
        showSuccess(`Auto-Verify New Workers is now ${nextVal ? 'ON' : 'OFF'}`);
        fetchAdminData();
      }
    } catch {
      showError('Failed to update settings');
    }
  };

  // Action: Delete worker permanently (Req 37)
  const handleDeleteWorker = async (workerId: string, name: string) => {
    if (!confirm(`Are you sure you want to PERMANENTLY delete ${name}? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/workers/${workerId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Admin permanent deletion' }),
      });
      if (res.ok) {
        showSuccess(`Worker ${name} permanently deleted.`);
        fetchAdminData();
      }
    } catch {
      showError('Failed to delete worker');
    }
  };

  // Filtered Workers
  let filteredWorkers = [...workers];
  if (statusFilter === 'verified')
    filteredWorkers = filteredWorkers.filter(
      (w) => w.verificationStatus === 'verified' && !w.isSuspended
    );
  if (statusFilter === 'pending')
    filteredWorkers = filteredWorkers.filter((w) => w.verificationStatus === 'pending');
  if (statusFilter === 'suspended')
    filteredWorkers = filteredWorkers.filter((w) => w.isSuspended);
  if (statusFilter === 'rejected')
    filteredWorkers = filteredWorkers.filter((w) => w.verificationStatus === 'rejected');

  if (categoryFilter !== 'all') {
    filteredWorkers = filteredWorkers.filter((w) => w.category === categoryFilter);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredWorkers = filteredWorkers.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.email || '').toLowerCase().includes(q) ||
        (w.phone || '').toLowerCase().includes(q) ||
        (w.phone && w.phone.includes(q)) ||
        w.publicArea.toLowerCase().includes(q) ||
        (formatWorkerLocation(w).taluk || '').toLowerCase().includes(q)
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-200 min-w-0">
      {/* Admin Panel Header
          ROOT CAUSE OF THE ADMIN-PANEL-WIDE HORIZONTAL OVERFLOW (verified by
          rendering the real component in headless Chromium at 320-768px):
          this header row's flex children had NO min-w-0 anywhere in the
          chain (icon+title+badge+description, then that whole group as a
          sibling of the Auto-Verify toggle). Per the CSS flexbox spec, a
          flex item's default min-width is `auto`, which resolves to its
          content's min-content size - so without min-w-0, the h1/p never
          shrank or wrapped at all and instead rendered at a *fixed* natural
          width (~500-570px on mobile, ~1100px+ once the Auto-Verify toggle
          sat beside it at the sm: breakpoint) regardless of viewport. That
          fixed width propagated up through every unconstrained ancestor
          div, forcing the entire "max-w-7xl mx-auto ..." wrapper - and with
          it every descendant section, including the tabs strip and stats
          grid - wider than the page. Nothing else (tabs, stats cards,
          tables) was independently overflowing; they were riding on this
          one blown-out ancestor. Fix: min-w-0 on every container that
          holds the variable-length title/description, shrink-0 on the
          fixed-size icon badge and the Auto-Verify control, and flex-wrap
          on the outer row as a safety net once real content is long. */}
      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center justify-between gap-4 pb-6 border-b border-[#176B4D]/10 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#176B4D] text-[#FAF7EF] flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#E8B83D]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[#26332D] break-words">
                {t('admin_panel_title')}
              </h1>
              <span className="bg-[#E8B83D] text-[#176B4D] font-black text-[10px] px-2 py-0.5 rounded-full uppercase shrink-0">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-[#586B63] break-words">
              Platform safety, worker verification, moderation, and suspension appeals.
            </p>
          </div>
        </div>

        {/* Live Auto-Verify Banner Indicator */}
        <div className="flex items-center gap-3 bg-white/80 px-4 py-2 rounded-2xl border border-[#176B4D]/15 shadow-2xs shrink-0">
          <span className="text-xs font-bold text-[#176B4D]">Auto-Verify New Workers:</span>
          <button
            onClick={handleToggleAutoVerify}
            className={`px-3 py-1 rounded-full text-xs font-black transition ${
              settings.autoVerifyWorkers
                ? 'bg-emerald-600 text-white'
                : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
            }`}
          >
            {settings.autoVerifyWorkers ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-stone-200 mb-6 gap-2 sm:gap-6 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Overview Stats
        </button>

        <button
          onClick={() => setActiveTab('workers')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'workers'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          <span>Worker Management</span>
          <span className="bg-[#176B4D]/10 text-[#176B4D] text-[10px] px-2 py-0.5 rounded-full font-bold">
            {workers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('appeals')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'appeals'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          <span>Suspension Appeals</span>
          {stats?.pendingAppeals > 0 && (
            <span className="bg-[#D64545] text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
              {stats.pendingAppeals}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'reports'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          <span>Reports Moderation</span>
          {stats?.pendingReports > 0 && (
            <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
              {stats.pendingReports}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('customers')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'customers'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Customers ({customers.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'audit'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Audit Logs
        </button>

        <button
          onClick={() => setActiveTab('recovery')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'recovery'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Recovery Requests
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-2.5 text-xs sm:text-sm font-extrabold transition border-b-2 whitespace-nowrap ${
            activeTab === 'settings'
              ? 'border-[#176B4D] text-[#176B4D]'
              : 'border-transparent text-stone-400 hover:text-stone-700'
          }`}
        >
          Platform Settings
        </button>
      </div>

      {/* TAB 1: OVERVIEW METRICS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="glass-card rounded-2xl p-4 border border-[#176B4D]/15">
              <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold block">
                Total Workers
              </span>
              <span className="text-2xl font-black text-[#176B4D] mt-1 block">
                {stats?.totalWorkers ?? 0}
              </span>
              <span className="text-[11px] text-stone-500 mt-1 block">
                {stats?.verifiedWorkers} Verified • {stats?.pendingWorkers} Pending
              </span>
            </div>

            <div className="glass-card rounded-2xl p-4 border border-red-200 bg-red-50/20">
              <span className="text-[10px] text-red-600 uppercase tracking-wider font-bold block">
                Suspended Workers
              </span>
              <span className="text-2xl font-black text-[#D64545] mt-1 block">
                {stats?.suspendedWorkers ?? 0}
              </span>
              <span className="text-[11px] text-red-700 mt-1 block">Active suspensions</span>
            </div>

            <div className="glass-card rounded-2xl p-4 border border-amber-200 bg-amber-50/20">
              <span className="text-[10px] text-amber-700 uppercase tracking-wider font-bold block">
                Pending Appeals
              </span>
              <span className="text-2xl font-black text-amber-800 mt-1 block">
                {stats?.pendingAppeals ?? 0}
              </span>
              <span className="text-[11px] text-amber-700 mt-1 block">Awaiting review</span>
            </div>

            <div className="glass-card rounded-2xl p-4 border border-[#176B4D]/15">
              <span className="text-[10px] text-stone-500 uppercase tracking-wider font-bold block">
                Customer Reports
              </span>
              <span className="text-2xl font-black text-[#26332D] mt-1 block">
                {stats?.pendingReports ?? 0}
              </span>
              <span className="text-[11px] text-stone-500 mt-1 block">Pending moderation</span>
            </div>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="glass-card rounded-3xl p-5 border border-[#176B4D]/15">
              <h3 className="text-sm font-black text-[#176B4D] mb-1">
                Suspension Appeals Under Review
              </h3>
              <p className="text-xs text-[#586B63] mb-4">
                Workers who have submitted explanations for their active suspensions.
              </p>
              {appeals.filter((a) => a.status === 'Pending').length === 0 ? (
                <p className="text-xs text-stone-400 italic py-2">No pending appeals right now.</p>
              ) : (
                <div className="space-y-2">
                  {appeals
                    .filter((a) => a.status === 'Pending')
                    .slice(0, 3)
                    .map((a) => (
                      <div
                        key={a.id}
                        className="p-3 bg-white rounded-xl border border-amber-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[#26332D] truncate">{a.workerName}</div>
                          <div className="text-[11px] text-stone-500 truncate">
                            "{a.explanation || 'No explanation provided'}"
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveTab('appeals')}
                          className="px-3 py-1 rounded-lg bg-[#176B4D] text-white text-[11px] font-bold shrink-0"
                        >
                          Review
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="glass-card rounded-3xl p-5 border border-[#176B4D]/15">
              <h3 className="text-sm font-black text-[#176B4D] mb-1">Recent User Reports</h3>
              <p className="text-xs text-[#586B63] mb-4">
                Reports filed against workers for safety or guideline violations.
              </p>
              {reports.filter((r) => r.status === 'Pending').length === 0 ? (
                <p className="text-xs text-stone-400 italic py-2">No pending reports.</p>
              ) : (
                <div className="space-y-2">
                  {reports
                    .filter((r) => r.status === 'Pending')
                    .slice(0, 3)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="p-3 bg-white rounded-xl border border-stone-200 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-[#D64545] truncate">{r.reason}</div>
                          <div className="text-[11px] text-stone-600 truncate">
                            Against: {r.workerName} • By: {r.customerEmail}
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveTab('reports')}
                          className="px-3 py-1 rounded-lg bg-[#D64545] text-white text-[11px] font-bold shrink-0"
                        >
                          Moderate
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WORKER MANAGEMENT */}
      {activeTab === 'workers' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="glass-card rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by worker name, phone, area, email..."
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-stone-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#176B4D]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs p-2.5 rounded-xl border border-stone-300 bg-white font-semibold max-w-[150px] truncate"
              >
                <option value="all">All Statuses</option>
                <option value="verified">Verified Only</option>
                <option value="pending">Pending Verification</option>
                <option value="suspended">Suspended Only</option>
                <option value="rejected">Rejected Only</option>
              </select>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="text-xs p-2.5 rounded-xl border border-stone-300 bg-white font-semibold max-w-[150px] truncate"
              >
                <option value="all">All Categories</option>
                {WORKER_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nameEn}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Workers Table */}
          <div className="glass-card rounded-3xl overflow-hidden border border-[#176B4D]/15 shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF7EF] border-b border-[#176B4D]/10 text-[#586B63] font-bold">
                    <th className="py-3.5 px-4">Worker</th>
                    <th className="py-3.5 px-3">Contact (Admin)</th>
                    <th className="py-3.5 px-3">Location & Category</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-3">Warnings</th>
                    <th className="py-3.5 px-4 text-right">Moderation Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#176B4D]/5">
                  {filteredWorkers.map((w) => (
                    <tr
                      key={w.id}
                      className={`hover:bg-white/60 transition ${
                        w.isSuspended ? 'bg-red-50/30' : ''
                      }`}
                    >
                      {/* Name & Photo */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl overflow-hidden bg-[#FAF7EF] border border-[#176B4D]/10 flex-shrink-0">
                            {w.profilePhoto ? (
                              <img
                                src={w.profilePhoto}
                                alt={w.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center font-bold text-[#176B4D]">
                                {w.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-[#26332D]">{w.name}</div>
                            <div className="text-[11px] text-[#586B63]">{w.email || '(no email)'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Phone (Shown to Admin Only) */}
                      <td className="py-3.5 px-3 font-mono text-[11px] text-stone-700">
                        {w.phone}
                        <div className="mt-1 font-sans">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              w.phoneVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {w.phoneVerified ? 'Phone verified' : 'Phone not verified'}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await fetch(`/api/admin/recovery/workers/${w.id}/phone-verified`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                body: JSON.stringify({ verified: !w.phoneVerified }),
                              });
                              if (res.ok) fetchAdminData();
                            }}
                            className="ml-1.5 text-[10px] font-bold text-[#176B4D] underline"
                          >
                            {w.phoneVerified ? 'Unmark' : 'Mark verified after call'}
                          </button>
                        </div>
                      </td>

                      {/* Location & Category */}
                      <td className="py-3.5 px-3">
                        <div className="font-semibold capitalize text-[#176B4D]">{w.category}</div>
                        <div className="text-[11px] text-stone-500 break-words">{localizePlace(w.publicArea, language)}</div>
                        {(() => {
                          const loc = formatWorkerLocation(w);
                          return loc.complete ? (
                            <div className="text-[10px] text-stone-400 break-words capitalize">
                              {t('taluk_with_name', { name: localizeTaluk(loc.taluk, language) })} • {localizeDistrict(loc.district, language)}
                            </div>
                          ) : (
                            <div className="mt-0.5 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                              {t('location_incomplete')} • <span className="capitalize">{localizeDistrict(loc.district, language)}</span>
                            </div>
                          );
                        })()}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        {w.isSuspended ? (
                          <div>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-[#D64545] text-white">
                              Suspended
                            </span>
                            <span className="block text-[10px] text-red-700 font-bold mt-0.5">
                              {w.activeSuspension?.remainingDays ?? 0} days remaining
                            </span>
                          </div>
                        ) : w.verificationStatus === 'verified' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                            Verified
                          </span>
                        ) : w.verificationStatus === 'pending' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600">
                            Rejected
                          </span>
                        )}
                      </td>

                      {/* Warnings Count */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`font-black text-xs ${
                            (w.warningCount || 0) > 0 ? 'text-[#D64545]' : 'text-stone-400'
                          }`}
                        >
                          {w.warningCount || 0} / 3
                        </span>
                      </td>

                      {/* Action Buttons */}
                      <td className="py-3.5 px-4 text-right space-x-1">
                        {/* Verify Button (if not verified) */}
                        {w.verificationStatus !== 'verified' && !w.isSuspended && (
                          <button
                            onClick={() => handleVerifyWorker(w.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700"
                            title="Verify worker"
                          >
                            Verify
                          </button>
                        )}

                        {/* Reject Button (if pending) */}
                        {w.verificationStatus === 'pending' && (
                          <button
                            onClick={() => handleRejectWorker(w.id)}
                            className="px-2 py-1 rounded-lg border border-stone-300 text-stone-600 font-bold text-[11px] hover:bg-stone-100"
                            title="Reject application"
                          >
                            Reject
                          </button>
                        )}

                        {/* Suspension Actions */}
                        {w.isSuspended ? (
                          <>
                            <button
                              onClick={() => {
                                setSelectedWorker(w);
                                setSuspensionDuration(
                                  String(w.activeSuspension?.durationDays || '7')
                                );
                                setSuspensionReason(
                                  w.activeSuspension?.reason || 'Reported misconduct'
                                );
                                setSuspensionNote(w.activeSuspension?.note || '');
                                setActionModal('modify_suspension');
                              }}
                              className="px-2 py-1 rounded-lg bg-amber-500 text-white font-bold text-[11px] hover:bg-amber-600"
                              title="Modify active suspension duration or reason"
                            >
                              Edit Susp.
                            </button>
                            <button
                              onClick={() => {
                                setSelectedWorker(w);
                                setActionModal('resolve');
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold text-[11px] hover:bg-emerald-700"
                              title="Resolve suspension early"
                            >
                              Resolve
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedWorker(w);
                              setActionModal('suspend');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#D64545] text-white font-bold text-[11px] hover:bg-red-700"
                            title="Suspend worker"
                          >
                            Suspend
                          </button>
                        )}

                        {/* Issue Warning Button */}
                        <button
                          onClick={() => {
                            setSelectedWorker(w);
                            setActionModal('warning');
                          }}
                          className="px-2 py-1 rounded-lg border border-[#D64545] text-[#D64545] hover:bg-red-50 font-bold text-[11px]"
                          title="Issue official warning (3 active warnings = permanent deletion)"
                        >
                          Warning
                        </button>

                        {/* Delete Worker */}
                        <button
                          onClick={() => handleDeleteWorker(w.id, w.name)}
                          className="p-1 text-stone-400 hover:text-[#D64545] transition"
                          title="Permanently delete worker account"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPager page={workersPage} totalPages={workersTotalPages} onChange={setWorkersPage} />
          </div>
        </div>
      )}

      {/* TAB 3: SUSPENSION APPEALS (Req 41-48) */}
      {activeTab === 'appeals' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
            <strong>Suspension Appeal Rules:</strong> Approving an appeal immediately removes the
            suspension, restores Available status, and restores Call/WhatsApp and ratings. Rejecting
            an appeal keeps the original suspension duration intact without resetting.
          </div>

          {appeals.length === 0 ? (
            <p className="text-center py-12 text-stone-400 text-xs font-semibold">
              No worker suspension appeals on record.
            </p>
          ) : (
            <div className="space-y-3">
              {appeals.map((appeal) => (
                <div
                  key={appeal.id}
                  className={`p-5 rounded-3xl border transition ${
                    appeal.status === 'Pending'
                      ? 'bg-white border-amber-300 shadow-sm'
                      : appeal.status === 'Approved'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-red-50/50 border-red-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100">
                    <div>
                      <h4 className="text-sm font-black text-[#26332D]">{appeal.workerName}</h4>
                      <p className="text-[11px] text-stone-500">
                        Appeal ID: #{appeal.id.substring(0, 8)} • Submitted:{' '}
                        {new Date(appeal.createdAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black uppercase px-2.5 py-0.5 rounded-full ${
                          appeal.status === 'Pending'
                            ? 'bg-amber-100 text-amber-800'
                            : appeal.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {appeal.status}
                      </span>
                    </div>
                  </div>

                  {/* Worker Explanation (Req 41: Max 500 chars, no attachments) */}
                  <div className="py-3">
                    <span className="text-[11px] font-bold text-[#176B4D] uppercase block mb-1">
                      Worker Statement / Explanation:
                    </span>
                    <p className="text-xs text-[#26332D] bg-stone-50 p-3 rounded-xl border border-stone-200 italic">
                      "{appeal.explanation || 'No statement provided'}"
                    </p>
                  </div>

                  {appeal.status === 'Pending' && (
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => handleAppealDecision(appeal.id, 'Approved')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
                      >
                        Approve Appeal (Restore Worker)
                      </button>
                      <button
                        onClick={() => handleAppealDecision(appeal.id, 'Rejected')}
                        className="px-4 py-2 rounded-xl bg-[#D64545] hover:bg-red-700 text-white font-bold text-xs shadow-xs"
                      >
                        Reject Appeal (Maintain Suspension)
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <AdminPager page={appealsPage} totalPages={appealsTotalPages} onChange={setAppealsPage} />
        </div>
      )}

      {/* TAB 4: REPORTS MODERATION (Req 13) */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-stone-100 text-xs text-stone-700">
            <strong>Customer Reports:</strong> Fixed categories only (Fake profile, Wrong
            information, Misbehavior, Spam, Fraud/Scam, Harassment, Inappropriate content). Reporter
            identity is confidential.
          </div>

          <div className="space-y-3">
            {reports.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-3xl bg-white border border-stone-200 shadow-2xs flex flex-col sm:flex-row justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#D64545] uppercase">{r.reason}</span>
                    <span className="text-[10px] bg-stone-100 text-stone-600 font-bold px-2 py-0.5 rounded-full">
                      Status: {r.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-[#26332D] mt-1">
                    Against: {r.workerName}
                  </h4>
                  {r.description && (
                    <p className="text-xs text-[#586B63] mt-1 italic">"{r.description}"</p>
                  )}
                  <p className="text-[10px] text-stone-400 mt-1">
                    Filed by {r.customerEmail} on {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex sm:flex-col items-end justify-center gap-2">
                  <button
                    onClick={() => {
                      const worker = workers.find((w) => w.id === r.workerId);
                      if (worker) {
                        setSelectedWorker(worker);
                        setWarningReason(`Reported for: ${r.reason}`);
                        setActionModal('warning');
                      } else {
                        showError('Worker not found');
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#D64545] text-white text-xs font-bold"
                  >
                    Issue Warning to Worker
                  </button>
                </div>
              </div>
            ))}
          </div>
          <AdminPager page={reportsPage} totalPages={reportsTotalPages} onChange={setReportsPage} />
        </div>
      )}

      {/* TAB 5: CUSTOMER MANAGEMENT */}
      {activeTab === 'customers' && (
        <div className="glass-card rounded-3xl overflow-hidden border border-stone-200">
          {/* Only this inner wrapper scrolls horizontally on narrow screens -
              the page itself never does. A min-width on the table keeps
              columns readable instead of crushing them illegibly narrow. */}
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="bg-[#FAF7EF] border-b text-stone-600 font-bold">
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-3">Email Verified</th>
                <th className="py-3 px-3">Saved Favourites</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50">
                  <td className="py-3 px-4 font-bold text-[#26332D]">{c.email}</td>
                  <td className="py-3 px-3">
                    {c.emailVerified ? (
                      <span className="text-emerald-600 font-bold">✓ Verified</span>
                    ) : (
                      <span className="text-amber-600 font-bold">Unverified</span>
                    )}
                  </td>
                  <td className="py-3 px-3">{c.favouritesCount} workers</td>
                  <td className="py-3 px-3">
                    <span
                      className={`font-bold uppercase text-[10px] px-2 py-0.5 rounded-full ${
                        c.status === 'restricted'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={async () => {
                        await fetch(`/api/admin/customers/${c.id}/restrict`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        fetchAdminData();
                      }}
                      className="text-xs text-[#176B4D] hover:underline font-bold"
                    >
                      {c.status === 'restricted' ? 'Unrestrict' : 'Restrict'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <AdminPager page={customersPage} totalPages={customersTotalPages} onChange={setCustomersPage} />
        </div>
      )}

      {/* TAB 6: AUDIT LOGS (Req 55) */}
      {activeTab === 'audit' && (
        <div className="glass-card rounded-3xl p-5 border border-stone-200 shadow-xs">
          <h3 className="text-sm font-black text-[#176B4D] mb-1">
            Administrative Audit Trail (Immutable)
          </h3>
          <p className="text-xs text-[#586B63] mb-4">
            Full record of all sensitive actions, suspensions, duration edits, and warnings.
          </p>

          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="p-3 bg-white rounded-xl border border-stone-200 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="min-w-0">
                  <span className="font-bold text-[#176B4D] uppercase tracking-wider text-[10px] bg-[#176B4D]/10 px-1.5 py-0.5 rounded mr-2 inline-block">
                    {log.action}
                  </span>
                  <span className="text-[#26332D] font-semibold break-words">
                    Target: {log.targetType} #{log.targetId.substring(0, 8)}
                  </span>
                  {log.details && (
                    <span className="text-stone-500 block text-[11px] mt-0.5 break-words">
                      {JSON.stringify(log.details)}
                    </span>
                  )}
                </div>
                <div className="text-left sm:text-right text-[10px] text-stone-400 shrink-0">
                  <div className="truncate">Actor: {log.actor}</div>
                  <div>{new Date(log.timestamp).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
          <AdminPager page={auditPage} totalPages={auditTotalPages} onChange={setAuditPage} />
        </div>
      )}

      {/* TAB: PASSWORD RECOVERY / PHONE CHANGE REQUESTS */}
      {activeTab === 'recovery' && <AdminRecoveryTab token={token} />}

      {/* TAB 7: PLATFORM SETTINGS (Req 54 & 75) */}
      {activeTab === 'settings' && (
        <div className="glass-card rounded-3xl p-6 border border-stone-200 space-y-6 max-w-2xl">
          <div className="pb-4 border-b border-stone-100">
            <h3 className="text-base font-black text-[#176B4D]">Platform Configuration</h3>
            <p className="text-xs text-[#586B63]">Manage automated verification workflows.</p>
          </div>

          <div className="p-4 bg-white rounded-2xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-[#26332D]">Auto Verify New Workers</h4>
              <p className="text-xs text-[#586B63] mt-0.5">
                When ON: Workers with verified emails and complete profiles receive verification
                instantly without manual admin approval.
              </p>
            </div>
            <button
              onClick={handleToggleAutoVerify}
              className={`px-4 py-2 rounded-xl text-xs font-black shadow-xs transition ${
                settings.autoVerifyWorkers
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-200 text-stone-700 hover:bg-stone-300'
              }`}
            >
              {settings.autoVerifyWorkers ? 'ENABLED (ON)' : 'DISABLED (OFF)'}
            </button>
          </div>
        </div>
      )}

      {/* MODAL 1: SUSPEND WORKER */}
      {actionModal === 'suspend' && selectedWorker && (
        <Modal onClose={() => setActionModal(null)} showClose={false} widthClass="max-w-md" cardClassName="border border-red-300" bodyClassName="p-6" overlayClassName="bg-black/40">
          <div>
            <h3 className="text-base font-black text-[#D64545] mb-1">
              Suspend Worker Account: {selectedWorker.name}
            </h3>
            <p className="text-xs text-[#586B63] mb-4">
              Direct contacts and new rating submissions will be paused.
            </p>

            <form onSubmit={handleSuspendSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Suspension Duration (Days) *
                </label>
                <select
                  value={suspensionDuration}
                  onChange={(e) => setSuspensionDuration(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                >
                  <option value="1">1 Day</option>
                  <option value="7">7 Days</option>
                  <option value="14">14 Days</option>
                  <option value="30">30 Days</option>
                  <option value="60">60 Days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Reason for Suspension *
                </label>
                <select
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                >
                  <option value="Reported misconduct">Reported misconduct</option>
                  <option value="Fake information">Fake information</option>
                  <option value="Fraud/Scam">Fraud/Scam</option>
                  <option value="Harassment">Harassment</option>
                  <option value="Repeated violations">Repeated violations</option>
                  <option value="Safety concern">Safety concern</option>
                  <option value="Other">Other violation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Admin Internal Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={suspensionNote}
                  onChange={(e) => setSuspensionNote(e.target.value)}
                  placeholder="Details for record..."
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#D64545] text-white text-xs font-bold shadow-xs"
                >
                  Confirm Suspension
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* MODAL 2: MODIFY SUSPENSION (Req 32 & 49: Extend / Reduce duration, edit reason) */}
      {actionModal === 'modify_suspension' && selectedWorker && (
        <Modal onClose={() => setActionModal(null)} showClose={false} widthClass="max-w-md" cardClassName="border border-amber-300" bodyClassName="p-6" overlayClassName="bg-black/40">
          <div>
            <h3 className="text-base font-black text-amber-900 mb-1">
              Modify Suspension: {selectedWorker.name}
            </h3>
            <p className="text-xs text-[#586B63] mb-4">
              Extend or reduce remaining days, or update reason. Changes are recorded in immutable
              audit logs.
            </p>

            <form onSubmit={handleModifySuspension} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  New Total Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={suspensionDuration}
                  onChange={(e) => setSuspensionDuration(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={suspensionReason}
                  onChange={(e) => setSuspensionReason(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Admin Note</label>
                <textarea
                  rows={2}
                  value={suspensionNote}
                  onChange={(e) => setSuspensionNote(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold shadow-xs"
                >
                  Save Modifications
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* MODAL 3: ISSUE WARNING (Req 28: 3 active warnings = permanent deletion) */}
      {actionModal === 'warning' && selectedWorker && (
        <Modal onClose={() => setActionModal(null)} showClose={false} widthClass="max-w-md" cardClassName="border border-red-300" bodyClassName="p-6" overlayClassName="bg-black/40">
          <div>
            <h3 className="text-base font-black text-[#D64545] mb-1">
              Issue Official Warning to {selectedWorker.name}
            </h3>
            <p className="text-xs text-red-900 mb-3">
              Current active warnings:{' '}
              <strong>
                {selectedWorker.warningCount || 0} / 3. Note: The 3rd active warning triggers
                PERMANENT ACCOUNT DELETION.
              </strong>
            </p>

            <form onSubmit={handleIssueWarning} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Warning Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  value={warningReason}
                  onChange={(e) => setWarningReason(e.target.value)}
                  placeholder="State the violation clearly..."
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#D64545] text-white text-xs font-bold shadow-xs"
                >
                  Issue Warning
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* MODAL 4: RESOLVE SUSPENSION EARLY */}
      {actionModal === 'resolve' && selectedWorker && (
        <Modal onClose={() => setActionModal(null)} showClose={false} widthClass="max-w-md" cardClassName="border border-emerald-300" bodyClassName="p-6" overlayClassName="bg-black/40">
          <div>
            <h3 className="text-base font-black text-emerald-900 mb-1">
              Resolve Suspension Early: {selectedWorker.name}
            </h3>
            <p className="text-xs text-[#586B63] mb-4">
              Worker availability will be restored to "Available", Call/WhatsApp buttons re-enabled,
              and ratings resumed.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Resolution Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Resolved upon verification of compliance..."
                  className="w-full text-xs p-2.5 rounded-xl border border-stone-300 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActionModal(null)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResolveSuspension}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs"
                >
                  Confirm Early Resolution
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
