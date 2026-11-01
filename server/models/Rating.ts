import mongoose, { Schema } from 'mongoose';
import { baseSchemaOptions, idField } from './shared';

const RatingSchema = new Schema(
  {
    id: idField(),
    customerId: { type: String, required: true, index: true },
    workerId: { type: String, required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  baseSchemaOptions
);

// Backend-enforced: exactly one rating per customer per worker. Updates go
// through this same document (findOneAndUpdate/upsert), never a duplicate insert.
RatingSchema.index({ customerId: 1, workerId: 1 }, { unique: true });

export const RatingModel = mongoose.model('Rating', RatingSchema);
