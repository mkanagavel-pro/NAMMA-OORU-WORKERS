import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

export const SUSPENSION_FIXED_REASONS = [
  'Fraud/Scam',
  'Harassment',
  'Fake information',
  'Repeated complaints',
  'Safety concern',
  'Other',
];

const SuspensionSchema = new Schema(
  {
    id: idField(),
    workerId: { type: String, required: true, index: true },
    workerName: { type: String, required: true },
    reason: { type: String, default: null },
    note: { type: String, default: null }, // admin-only, never public
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    durationDays: { type: Number, required: true },
    remainingDays: { type: Number, required: true },
    status: { type: String, enum: ['active', 'resolved', 'appealed', 'expired'], default: 'active', index: true },
    actionBy: { type: String, default: 'Namma Ooru Workers Admin' }, // shown to the worker - never the real admin identity
    createdBy: { type: String, required: true }, // real admin email - internal/audit only
    resolvedBy: { type: String, default: null },
    resolutionNote: { type: String, default: null },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseSchemaOptions
);

export const SuspensionModel = mongoose.model('Suspension', SuspensionSchema);
