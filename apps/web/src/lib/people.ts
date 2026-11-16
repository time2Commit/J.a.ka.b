/**
 * The people a picker offers: active accounts, plus the deactivated ones that are already chosen,
 * so that they stay visible and can be removed. A deactivated account is never offered anew.
 */
export function assignablePeople<T extends { id: string; deactivatedAt: string | null }>(
  users: T[],
  selectedIds: readonly string[] = [],
): T[] {
  return users.filter((u) => u.deactivatedAt === null || selectedIds.includes(u.id));
}
