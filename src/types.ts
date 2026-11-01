export type UserRole = 'customer' | 'worker' | 'admin';

export type WorkerAvailability = 'Available' | 'Offline';
export type WorkerVerificationStatus = 'verified' | 'pending' | 'rejected';
export type DistanceCategory = 'Nearby' | 'Moderate distance' | 'Far';

export type ReportReason =
  | 'Fake profile'
  | 'Wrong information'
  | 'Misbehavior'
  | 'Spam'
  | 'Fraud/Scam'
  | 'Harassment'
  | 'Inappropriate content';

export type ReportStatus = 'Pending' | 'Under Review' | 'Resolved' | 'Rejected';

export type SuspensionStatus = 'active' | 'expired' | 'resolved' | 'appealed';

export type AppealStatus = 'Pending' | 'Approved' | 'Rejected';

export interface RatingSummary {
  averageRating: number;
  totalRatings: number;
  breakdown: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export interface SuspensionInfo {
  id: string;
  reason: string;
  note?: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  remainingDays: number;
  status: SuspensionStatus;
  actionBy: string; // e.g. "Namma Ooru Workers Admin"
}

export interface Worker {
  id: string;
  userId: string;
  name: string;
  email?: string; // optional since V6
  phone?: string; // Private, omitted in public responses
  phoneVerified?: boolean; // admin-confirmed phone ownership (separate from verificationStatus)
  category: string;
  description: string;
  experience: number;
  rate: string;
  profilePhoto?: string | null;
  district: string;
  taluk?: string | null; // revenue taluk id; null/absent on legacy workers
  areaId?: string | null; // verified area id, or null for a manually entered locality
  publicArea: string;
  coordinates?: {
    lat: number;
    lng: number;
  }; // Private exact coordinates
  serviceAreas: string[];
  availability: WorkerAvailability;
  verificationStatus: WorkerVerificationStatus;
  isSuspended: boolean;
  suspensionInfo?: SuspensionInfo | null;
  activeSuspension?: Suspension | null;
  warningCount: number;
  ratingSummary: RatingSummary;
  distanceCategory?: DistanceCategory | null;
  canContact: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email?: string; // optional: workers may register without one
  loginId?: string | null; // worker User ID (login handle)
  role: UserRole;
  authProviders: ('local' | 'google')[];
  googleId?: string;
  googleLinked?: boolean; // true when a Google account is linked (the Google id itself is never sent to the browser)
  emailVerified: boolean;
  favourites: string[];
  status: 'active' | 'restricted';
  workerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Rating {
  id: string;
  customerId: string;
  workerId: string;
  rating: number; // 1 to 5
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  customerId: string;
  workerId: string;
  workerName?: string;
  reason: ReportReason;
  description?: string;
  status: ReportStatus;
  adminAction?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Warning {
  id: string;
  workerId: string;
  reason: string;
  source: 'report' | 'manual';
  active: boolean;
  issuedBy: string;
  issuedAt: string;
  resetAt?: string | null;
}

export interface Suspension {
  id: string;
  workerId: string;
  workerName?: string;
  reason: string;
  note?: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  remainingDays: number;
  status: SuspensionStatus;
  createdBy: string;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Appeal {
  id: string;
  workerId: string;
  workerName?: string;
  suspensionId: string;
  explanation?: string;
  status: AppealStatus;
  adminNote?: string;
  decisionDate?: string | null;
  createdAt: string;
}

export interface ContactHistoryItem {
  id: string;
  customerId: string;
  workerId: string;
  workerName: string;
  workerCategory: string;
  workerArea: string;
  method: 'Call' | 'WhatsApp';
  timestamp: string;
}

export type ContactInteraction = ContactHistoryItem;

export interface AppNotification {
  id: string;
  recipientId: string;
  type: 'suspension' | 'appeal' | 'warning' | 'verification' | 'system' | 'email_simulated';
  title: string;
  message: string;
  read: boolean;
  isEmail?: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  entity: string;
  targetId: string;
  targetType?: string;
  details?: any;
  oldValue?: any;
  newValue?: any;
  timestamp: string;
}

export interface PlatformSettings {
  autoVerifyWorkers: boolean;
  requireEmailVerification: boolean;
  activeWarningThreshold: number;
  warningCleanMonths: number;
}
