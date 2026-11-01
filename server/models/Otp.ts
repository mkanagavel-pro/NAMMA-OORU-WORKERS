import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './shared';

// OTP is stored as a SHA-256 hash only - never plaintext (see
// server/db.ts hashOtp()/verifyAndConsumeOtp()). A TTL index automatically
// purges expired records so stale OTPs don't accumulate forever.
const OtpSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, index: true },
    purpose: { type: String, required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Number, required: true }, // epoch ms, matches existing Date.now()-based comparisons
    attempts: { type: Number, default: 0 },
    createdAt: { type: Number, required: true }, // epoch ms
    // Mongo TTL indexes need a Date field - this is separate from the
    // application's own epoch-ms expiresAt used for the real expiry check,
    // and only exists so MongoDB itself garbage-collects old documents.
    expireAt: { type: Date, required: true },
  },
  baseSchemaOptions
);

OtpSchema.index({ email: 1, purpose: 1 });
OtpSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = mongoose.model('Otp', OtpSchema);
