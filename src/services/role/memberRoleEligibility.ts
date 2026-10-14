import type { APIGuildMember } from "discord-api-types/v10";
import type { MemberRoleScanSummary, UpdateMemberRolesRequest } from "../../shared/apiTypes";

export const emptyMemberRoleScanSummary = (): MemberRoleScanSummary => ({
  pagesRead: 0, bots: 0, excludedByRole: 0, noChangeNeeded: 0,
});

export const memberRoleSkipReason = (member: APIGuildMember, request: UpdateMemberRolesRequest) => {
  if (!member.user?.id) throw new Error("Discord returned a member without a user ID.");
  if (member.user.bot) return "bots" as const;
  if (request.userIds !== undefined && !request.userIds.includes(member.user.id)) {
    throw new Error("Discord returned a member outside the requested user list.");
  }
  if (request.excludedRoleIds.some(id => member.roles.includes(id))) return "excludedByRole" as const;
  if (request.action === "add" ? member.roles.includes(request.roleId) : !member.roles.includes(request.roleId)) {
    return "noChangeNeeded" as const;
  }
  return null;
};
