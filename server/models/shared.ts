import { Schema } from 'mongoose';

// Every model uses an explicit string `id` field (not Mongoose's ObjectId
// `_id`) because the entire existing frontend reads `.id` everywhere
// (worker.id, report.id, notification.id, ...). This keeps every API
// response shape byte-for-byte identical to the old JSON-file version, so
// no frontend component needs to change for the migration.
//
// toJSON/toObject strip `_id` and `__v` so consumers never see Mongo's
// internal fields mixed in with the application's own `id`.
export const baseSchemaOptions = {
  timestamps: false as const, // most collections manage their own createdAt/updatedAt strings to match existing shapes
  toJSON: {
    transform(_doc: unknown, ret: any) {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
  toObject: {
    transform(_doc: unknown, ret: any) {
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
};

export function idField() {
  return { type: String, required: true, unique: true, index: true };
}
