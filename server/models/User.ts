import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const UserSchema = new Schema(
  {
    id: idField(),
    // Optional since V6 (workers may register without email). Never store ''
    // or null here - leave the field unset - because uniqueness is enforced
    // by the partial index declared below (only documents that HAVE a string
    // email take part). See server/services/authIndexes.ts for how an older
    // non-partial email_1 index is replaced safely.
    email: { type: String, required: false, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'worker', 'admin'], required: true, index: true },
    authProviders: { type: [String], default: ['local'] },
    // Google account id (OpenID `sub`). Unique when present: see the partial unique index below.
    // Left UNSET (never null/'') for accounts without Google.
    googleId: { type: String },
    googleLinkedAt: { type: String },
    emailVerified: { type: Boolean, default: false },
    favourites: { type: [String], default: [] }, // array of Worker.id
    status: { type: String, enum: ['active', 'restricted'], default: 'active', index: true },
    tokenVersion: { type: Number, default: 1 },
    workerId: { type: String, default: null, index: true }, // set only for role: 'worker'
    // Worker login handle ("User ID") and normalized 10-digit phone. Both are
    // login identifiers that resolve to this same account. Unset (never null)
    // for customers/admins and for legacy workers until the migration runs.
    loginId: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    // Per-account brute-force protection for worker login (in addition to the IP limiter).
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Number, default: null },
    lastFailedAt: { type: Number, default: null },
    requiresPasswordChange: { type: Boolean, default: false }, // seeded admin bootstrap flag
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseSchemaOptions
);

UserSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
UserSchema.index({ googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } });

export const UserModel = mongoose.model('User', UserSchema);
