/** Treat spacing, dash variants, and casing as the same protected role name. */
export const isProtectedMemberRoleName = (name: string): boolean => {
  const normalized = name.normalize("NFKC").toLowerCase()
    .replace(/[\s\p{Pd}_\u200B-\u200D\uFEFF]/gu, "");
  return normalized === "limited" || normalized === "inbetween";
};

export const memberRoleExclusions = (
  selectedIds: readonly string[], roles: Iterable<{ id: string; name: string }>,
): string[] => [...new Set([
  ...Array.from(roles).filter(role => isProtectedMemberRoleName(role.name)).map(role => role.id),
  ...selectedIds,
])];
