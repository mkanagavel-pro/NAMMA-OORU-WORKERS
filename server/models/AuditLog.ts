import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const AuditLogSchema = new Schema(
  {
    id: idField(),
    actor: { type: String, required: true }, // admin email, or 'System'
    action: { type: String, required: true },
    entity: { type: String, required: true },
    targetId: { type: String, required: true },
    oldValue: { type: Schema.Types.Mixed, default: null },
    newValue: { type: Schema.Types.Mixed, default: null },
    timestamp: { type: String, required: true },
  },
  baseSchemaOptions
);

AuditLogSchema.index({ entity: 1, targetId: 1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLogModel = mongoose.model('AuditLog', AuditLogSchema);
