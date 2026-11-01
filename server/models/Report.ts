import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

// NOTE: this list intentionally has 7 reasons, no "Other" - this matches
// the actual pre-existing route validation in reports.ts and two earlier
// specs that explicitly required no "Other" option. A later instruction
// listed "Other" as a valid reason, but that contradicts what's actually
// implemented and what was explicitly required twice before, so I kept the
// existing behavior rather than silently changing validated business logic.
// Flag this to me if "Other" should really be added.
export const VALID_REPORT_REASONS = [
  'Fake profile',
  'Wrong information',
  'Misbehavior',
  'Spam',
  'Fraud/Scam',
  'Harassment',
  'Inappropriate content',
];
export const VALID_REPORT_STATUSES = ['Pending', 'Under Review', 'Resolved', 'Rejected'];

const ReportSchema = new Schema(
  {
    id: idField(),
    customerId: { type: String, required: true }, // 'guest_user' for unauthenticated reports
    customerEmail: { type: String, required: true }, // internal only - never exposed to the reported worker
    workerId: { type: String, required: true, index: true },
    workerName: { type: String, required: true },
    reason: { type: String, enum: VALID_REPORT_REASONS, required: true },
    description: { type: String, default: '', maxlength: 1000 },
    status: { type: String, enum: VALID_REPORT_STATUSES, default: 'Pending', index: true },
    adminAction: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ReportModel = mongoose.model('Report', ReportSchema);
