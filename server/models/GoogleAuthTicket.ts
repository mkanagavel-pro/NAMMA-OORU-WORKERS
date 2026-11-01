import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './shared';

// A short-lived, single-use hand-over between the server-side OAuth callback and the single-page app.
// The raw ticket travels once, in the URL FRAGMENT (never sent to a server by the browser), and only
// its SHA-256 hash is stored here.
//   kind 'session' : identity already resolved to an existing account -> exchange gives a session.
//   kind 'signup'  : verified Google identity with NO account yet -> the person must still choose a
//                    role and give the details Google cannot supply before anything is created.
const GoogleAuthTicketSchema = new Schema(
  {
    ticketHash: { type: String, required: true, unique: true },
    kind: { type: String, enum: ['session', 'signup'], required: true },
    userId: { type: String, default: null }, // kind 'session'
    googleSub: { type: String, required: true },
    email: { type: String, required: true },
    name: { type: String, default: '' },
    usedAt: { type: Number, default: null },
    createdAt: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
  },
  baseSchemaOptions
);
GoogleAuthTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const GoogleAuthTicketModel = mongoose.model('GoogleAuthTicket', GoogleAuthTicketSchema);
