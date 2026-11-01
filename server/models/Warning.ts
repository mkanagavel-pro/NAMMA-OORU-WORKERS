import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const WarningSchema = new Schema(
  {
    id: idField(),
    workerId: { type: String, required: true, index: true },
    reason: { type: String, required: true },
    source: { type: String, enum: ['report', 'manual'], default: 'manual' },
    active: { type: Boolean, default: true, index: true },
    issuedBy: { type: String, required: true }, // admin email - internal only
    issuedAt: { type: String, required: true },
    resetAt: { type: String, default: null },
  },
  baseSchemaOptions
);

export const WarningModel = mongoose.model('Warning', WarningSchema);
