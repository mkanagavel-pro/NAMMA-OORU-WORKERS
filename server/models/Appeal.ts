import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const AppealSchema = new Schema(
  {
    id: idField(),
    workerId: { type: String, required: true, index: true },
    workerName: { type: String, required: true },
    suspensionId: { type: String, required: true, index: true },
    explanation: { type: String, default: '', maxlength: 500 },
    status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending', index: true },
    adminNote: { type: String, default: null }, // never shown to the worker
    decisionDate: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  baseSchemaOptions
);

export const AppealModel = mongoose.model('Appeal', AppealSchema);
