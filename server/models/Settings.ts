import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions } from './shared';

// Singleton document (there is only ever one settings row).
const SettingsSchema = new Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    autoVerifyWorkers: { type: Boolean, default: false },
    requireEmailVerification: { type: Boolean, default: true },
    activeWarningThreshold: { type: Number, default: 3 },
    warningCleanMonths: { type: Number, default: 6 },
  },
  baseSchemaOptions
);

export const SettingsModel = mongoose.model('Settings', SettingsSchema);

export async function getSettingsSingleton() {
  let doc = await SettingsModel.findOne({ key: 'platform' });
  if (!doc) {
    doc = await SettingsModel.create({ key: 'platform' });
  }
  return doc;
}
