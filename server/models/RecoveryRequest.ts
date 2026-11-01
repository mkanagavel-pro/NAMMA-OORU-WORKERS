import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';
import { RECOVERY_STATUSES } from '../services/recoveryToken';

// One collection for both admin-assisted workflows:
//  - type 'password_reset' : worker without email asks for help
//  - type 'phone_change'   : worker asks to change their phone number
// Only the SHA-256 HASH of a reset token is stored (never the raw token).
const RecoveryRequestSchema = new Schema(
  {
    id: idField(),
    reference: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['password_reset', 'phone_change'], required: true, index: true },
    status: { type: String, enum: RECOVERY_STATUSES, default: 'pending', index: true },
    // Internal User.id of the target account; null for decoy ("no_match") records.
    userId: { type: String, default: null, index: true },
    // sha256(kind:value) of what the requester typed - merges duplicates without keeping the raw identifier.
    identifierKey: { type: String, required: true, index: true },
    identifierKind: { type: String, default: null },
    newPhone: { type: String, default: null }, // normalized 10-digit, phone_change only
    identityVerified: { type: Boolean, default: false },
    adminNote: { type: String, default: '' },
    decidedBy: { type: String, default: null },
    decidedAt: { type: Number, default: null },
    tokenHash: { type: String, default: null, index: true, sparse: true },
    tokenExpiresAt: { type: Number, default: null },
    tokenUsedAt: { type: Number, default: null },
    linkIssuedBy: { type: String, default: null },
    linkIssuedAt: { type: Number, default: null },
    linkIssueCount: { type: Number, default: 0 },
    completedAt: { type: Number, default: null },
    createdAt: { type: Number, required: true, index: true },
    updatedAt: { type: Number, required: true },
    // Decoy records are garbage-collected by MongoDB automatically.
    expireAt: { type: Date, default: null },
  },
  baseSchemaOptions
);

RecoveryRequestSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
RecoveryRequestSchema.index({ identifierKey: 1, status: 1 });

export const RecoveryRequestModel = mongoose.model('RecoveryRequest', RecoveryRequestSchema);
