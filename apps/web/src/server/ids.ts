/** Ids that still exist, in the given order (templates and clones may point at deleted entries). */
export async function existingIds(
  list: (args: {
    where: { id: { in: string[] } };
    select: { id: true };
  }) => Promise<{ id: string }[]>,
  ids: string[],
) {
  if (ids.length === 0) return [];
  const found = new Set(
    (await list({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
  );
  return ids.filter((id) => found.has(id));
}
