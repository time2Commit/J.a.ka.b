/**
 * Prisma data that replaces the labels and/or members of a card or project with the given ids.
 * A list that is not given is left as it is.
 */
export function replaceRelations(input: { labelIds?: string[]; memberIds?: string[] }) {
  const { labelIds, memberIds } = input;
  return {
    ...(labelIds && {
      labels: { deleteMany: {}, create: labelIds.map((labelId) => ({ labelId })) },
    }),
    ...(memberIds && {
      members: { deleteMany: {}, create: memberIds.map((userId) => ({ userId })) },
    }),
  };
}
