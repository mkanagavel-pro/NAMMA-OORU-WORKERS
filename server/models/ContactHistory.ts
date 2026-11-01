import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const ContactHistorySchema = new Schema(
  {
    id: idField(),
    customerId: { type: String, required: true, index: true },
    workerId: { type: String, required: true, index: true },
    method: { type: String, enum: ['Call', 'WhatsApp'], required: true },
    timestamp: { type: String, required: true },
  },
  baseSchemaOptions
);

export const ContactHistoryModel = mongoose.model('ContactHistory', ContactHistorySchema);
