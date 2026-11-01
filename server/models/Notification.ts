import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const NotificationSchema = new Schema(
  {
    id: idField(),
    recipientId: { type: String, required: true, index: true }, // User.id, Worker.id, or 'admin'
    type: { type: String, enum: ['suspension', 'appeal', 'warning', 'verification', 'system'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    isEmail: { type: Boolean, default: false }, // simulated-email inbox flag - see server/db.ts sendNotification()
    createdAt: { type: String, required: true },
  },
  baseSchemaOptions
);

NotificationSchema.index({ recipientId: 1, createdAt: -1 });

export const NotificationModel = mongoose.model('Notification', NotificationSchema);
