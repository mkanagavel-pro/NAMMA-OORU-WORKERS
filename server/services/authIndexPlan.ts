// Pure (no mongoose import) so it can be unit-tested without a database driver.
export interface IndexInfo { name?: string; key?: Record<string, number>; unique?: boolean; sparse?: boolean; partialFilterExpression?: unknown }

/** True when an email index exists that would reject a second user with no email. */
export function emailIndexNeedsRebuild(indexes: IndexInfo[]): boolean {
  const idx = indexes.find((i) => i.key && Object.keys(i.key).length === 1 && i.key.email === 1);
  if (!idx) return false;
  return Boolean(idx.unique) && !idx.partialFilterExpression && !idx.sparse;
}


/** True when users.googleId has an index that is not the partial UNIQUE one (the old one was a plain sparse index). */
export function googleIdIndexNeedsRebuild(indexes: IndexInfo[]): boolean {
  const idx = indexes.find((i) => i.key && Object.keys(i.key).length === 1 && i.key.googleId === 1);
  if (!idx) return false;
  return !(idx.unique && idx.partialFilterExpression);
}
