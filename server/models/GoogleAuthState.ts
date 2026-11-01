import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './shared';

// One row per "Continue with Google" attempt, created when the browser is sent to Google and
// consumed (atomically, once) by the callback. Only HASHES of the state and of the browser-binding
// secret are stored. The nonce and PKCE verifier are short-lived and useless without the matching
// authorization code, and the whole row disappears by itself (TTL index) after a few minutes.
const GoogleAuthStateSchema = new Schema(
  {
    stateHash: { type: String, required: true, unique: true },
    bindingHash: { type: String, required: true },
    nonce: { type: String, required: true },
    codeVerifier: { type: String, required: true },
    intent: { type: String, enum: ['login', 'link'], required: true },
    linkUserId: { type: String, default: null }, // only for intent 'link' (an already signed-in user)
    usedAt: { type: Number, default: null },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  baseSchemaOptions
);
GoogleAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GoogleAuthStateModel = mongoose.model('GoogleAuthState', GoogleAuthStateSchema);
