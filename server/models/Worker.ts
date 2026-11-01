import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

// Embedded snapshot of the CURRENT suspension only (or null) - matches the
// existing worker.suspensionInfo shape the frontend already renders.
// Full suspension history lives in the separate Suspension collection.
const SuspensionInfoSchema = new Schema(
  {
    id: String,
    reason: { type: String, default: null },
    note: { type: String, default: null },
    startDate: String,
    endDate: String,
    durationDays: Number,
    remainingDays: Number,
    status: String,
    actionBy: String,
  },
  { _id: false }
);

const RatingSummarySchema = new Schema(
  {
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    breakdown: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const WorkerSchema = new Schema(
  {
    id: idField(),
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: false, lowercase: true, trim: true }, // optional since V6 - unset when the worker has no email
    phone: { type: String, required: true }, // never sent in public API responses - see workers.ts serialization
    // "Phone Number Verified" is a SEPARATE status from verificationStatus
    // (= profile approved). It is only ever set true by an administrator
    // after personally verifying the number, and cleared on every phone change.
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: String, default: null },
    phoneVerifiedBy: { type: String, default: null },
    // When the worker agreed to publish their profile publicly (null for
    // legacy accounts that registered before consent was recorded).
    consentPublicAt: { type: String, default: null },
    category: { type: String, required: true, index: true },
    description: { type: String, default: '' },
    experience: { type: Number, default: 0 },
    rate: { type: String, default: '' },
    profilePhoto: { type: String, default: null },
    district: { type: String, required: true, index: true },
    // Revenue taluk id from src/data/salemLocations.ts. null only for legacy
    // workers registered before taluks existed - they are never auto-assigned one.
    taluk: { type: String, default: null },
    publicArea: { type: String, required: true }, // safe to expose publicly
    // Id of a verified listed area, or null when the worker used the manual
    // "Other area in this taluk" option.
    areaId: { type: String, default: null },
    // Original plain lat/lng shape - kept because ALL existing distance
    // calculation code (calculateDistance() in db.ts, worker registration,
    // profile updates) reads/writes worker.coordinates.lat/.lng directly.
    // Changing every call site to GeoJSON tuple indexing risked breaking
    // working distance/search logic for no functional gain.
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
    },
    // GeoJSON mirror of `coordinates`, kept in sync by a pre-save hook
    // below, purely so MongoDB's 2dsphere index can do efficient $near
    // queries. Application code should keep reading/writing `coordinates`;
    // `location` exists for the database layer only.
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    serviceAreas: { type: [String], default: [] },
    availability: { type: String, enum: ['Available', 'Offline'], default: 'Available', index: true },
    verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', index: true },
    isSuspended: { type: Boolean, default: false, index: true },
    suspensionInfo: { type: SuspensionInfoSchema, default: null },
    warningCount: { type: Number, default: 0 },
    ratingSummary: { type: RatingSummarySchema, default: () => ({}) },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseSchemaOptions
);

WorkerSchema.index({ location: '2dsphere' });
WorkerSchema.index({ category: 1, district: 1, availability: 1 });
WorkerSchema.index({ taluk: 1, category: 1 }); // taluk-scoped customer search

// Keeps the GeoJSON `location` mirror in sync with `coordinates` on every
// save, so the 2dsphere index always reflects the latest position without
// every call site needing to remember to set both fields.
WorkerSchema.pre('save', function (this: any, next: any) {
  const doc = this as any;
  if (doc.coordinates && typeof doc.coordinates.lat === 'number' && typeof doc.coordinates.lng === 'number') {
    doc.location = { type: 'Point', coordinates: [doc.coordinates.lng, doc.coordinates.lat] };
  }
  next();
});

export const WorkerModel = mongoose.model('Worker', WorkerSchema);
