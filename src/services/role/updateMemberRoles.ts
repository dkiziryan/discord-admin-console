import { Routes, type APIGuildMember } from "discord-api-types/v10";
import { PermissionFlagsBits, type Client } from "discord.js";
import { isProtectedMemberRoleName, memberRoleExclusions } from "../../shared/memberRolePolicy";
import { emptyMemberRoleScanSummary, memberRoleSkipReason } from "./memberRoleEligibility";
import { MEMBER_ROLE_BATCH_SIZE, processMemberRoleBatches } from "./memberRoleBatches";
import type { MemberRoleProgress, MemberRoleOption, UpdateMemberRolesRequest, UpdateMemberRolesResponse } from "../../shared/apiTypes";

export class RoleUpdateError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export const parseRoleUpdateRequest = (body: unknown): UpdateMemberRolesRequest => {
  const value = body as Partial<UpdateMemberRolesRequest> | null;
  if (!value || !["add", "remove"].includes(value.action ?? "") ||
      typeof value.roleId !== "string" || !/^\d{1,20}$/.test(value.roleId) ||
      !Array.isArray(value.excludedRoleIds) || value.excludedRoleIds.length > 250 ||
      !value.excludedRoleIds.every(id => typeof id === "string" && /^\d{1,20}$/.test(id)) ||
      (value.dryRun !== undefined && typeof value.dryRun !== "boolean")) {
    throw new RoleUpdateError("Select an action, a role, and valid excluded roles.");
  }
  if (value.excludedRoleIds.includes(value.roleId)) {
    throw new RoleUpdateError("The target role cannot also be an excluded role.");
  }
  if (value.userIds !== undefined && (!Array.isArray(value.userIds) ||
      value.userIds.length === 0 || value.userIds.length > 100 ||
      !value.userIds.every(id => typeof id === "string" && /^[1-9]\d{0,19}$/.test(id)))) {
    throw new RoleUpdateError("Enter between 1 and 100 valid Discord user IDs, or omit the user list to target all members.");
  }
  return { ...(value.userIds === undefined ? {} : { userIds: [...new Set(value.userIds)] }), action: value.action!, roleId: value.roleId, excludedRoleIds: [...new Set(value.excludedRoleIds)], dryRun: value.dryRun !== false };
};

const roleContext = async (client: Client, guildId: string, actorId: string) => {
  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();
  const actor = await guild.members.fetch({ user: actorId, force: true });
  const bot = await guild.members.fetchMe({ force: true });
  if (!actor.permissions.has(PermissionFlagsBits.ManageRoles) || !bot.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new RoleUpdateError("You and the bot both need Manage Roles permission.", 403);
  }
  const canUpdate = (id: string) => {
    const role = roles.get(id);
    return !!role && role.id !== guild.id && !role.managed && role.editable &&
      (actor.id === guild.ownerId || actor.roles.highest.comparePositionTo(role) > 0);
  };
  return { guild, roles, canUpdate };
};

export const listMemberRoles = async (client: Client, guildId: string, actorId: string): Promise<MemberRoleOption[]> => {
  const { guild, roles, canUpdate } = await roleContext(client, guildId, actorId);
  return [...roles.values()].filter(role => role.id !== guild.id)
    .map(role => ({ id: role.id, name: role.name, canUpdate: canUpdate(role.id) && !isProtectedMemberRoleName(role.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const updateMemberRoles = async (
  client: Client, guildId: string, actorId: string, request: UpdateMemberRolesRequest,
  onProgress: (progress: MemberRoleProgress) => void = () => undefined,
): Promise<UpdateMemberRolesResponse> => {
  const scanSummary = emptyMemberRoleScanSummary();
  const progress: MemberRoleProgress = {
    scanSummary,
    phase: "preparing", checkedCount: 0, matchedCount: 0, processedCount: 0,
    updatedCount: 0, skippedCount: 0, failedCount: 0,
    batchNumber: 0, totalBatches: 0, batchSize: MEMBER_ROLE_BATCH_SIZE,
  };
  const report = () => onProgress({ ...progress, scanSummary: { ...scanSummary } });
  report();
  const { guild, roles, canUpdate } = await roleContext(client, guildId, actorId);
  if (isProtectedMemberRoleName(roles.get(request.roleId)?.name ?? "")) {
    throw new RoleUpdateError("Limited and in-between roles are protected and cannot be targets in this bulk workflow.");
  }
  request = { ...request, excludedRoleIds: memberRoleExclusions(request.excludedRoleIds, roles.values()) };
  if (!canUpdate(request.roleId)) throw new RoleUpdateError("The selected role cannot be managed by you and the bot.", 403);
  if (request.excludedRoleIds.some(id => !roles.has(id) || id === guildId)) {
    throw new RoleUpdateError("An excluded role no longer exists. Reload the role list.");
  }
  progress.phase = "scanning";
  report();
  // Read every page before writing, so an incomplete member scan cannot cause partial changes.
  const candidates: APIGuildMember[] = [];
  let after: string | undefined;
  let totalMembers = 0;
  const seen = new Set<string>();
  const inspect = (member: APIGuildMember) => {
    const reason = memberRoleSkipReason(member, request);
    const id = member.user!.id;
    if (seen.has(id)) throw new Error("Discord returned duplicate members. No roles were changed; rerun the preview.");
    seen.add(id);
    totalMembers++;
    if (reason) scanSummary[reason]++;
    else candidates.push(member);
  };
  if (request.userIds !== undefined) {
    // Resolve the entire explicit list before writing. Never fall back to all members.
    for (const id of request.userIds) {
      let member: APIGuildMember;
      try {
        member = await client.rest.get(Routes.guildMember(guildId, id)) as APIGuildMember;
      } catch {
        throw new RoleUpdateError(`Could not load user ${id} in this server. No roles were changed.`);
      }
      if (!member?.user || member.user.id !== id) {
        throw new RoleUpdateError(`Could not load user ${id} in this server. No roles were changed.`);
      }
      scanSummary.pagesRead++;
      inspect(member);
      progress.checkedCount = totalMembers;
      progress.matchedCount = candidates.length;
      report();
    }
  } else while (true) {
    const query = new URLSearchParams({ limit: "1000" });
    if (after) query.set("after", after);
    const batch = await client.rest.get(Routes.guildMembers(guildId), { query }) as APIGuildMember[];
    if (!Array.isArray(batch)) throw new Error("Discord returned an invalid member list.");
    scanSummary.pagesRead++;
    for (const member of batch) inspect(member);
    progress.checkedCount = totalMembers;
    progress.matchedCount = candidates.length;
    report();
    if (batch.length < 1000) break;
    const lastId = batch.at(-1)?.user?.id;
    if (!lastId || (after && BigInt(lastId) <= BigInt(after))) throw new Error("Could not finish reading server members.");
    after = lastId;
  }
  const data: UpdateMemberRolesResponse["data"] = {
    guildName: guild.name, roleName: roles.get(request.roleId)!.name, scanSummary,
    totalMembers, matchedCount: candidates.length, updatedCount: 0, skippedCount: 0,
    previewNames: candidates.slice(0, 10).map(member => member.nick ?? member.user!.username), failures: [],
  };
  if (request.dryRun === false) {
    progress.totalBatches = Math.ceil(candidates.length / MEMBER_ROLE_BATCH_SIZE);
    await processMemberRoleBatches(candidates, async candidate => {
      const id = candidate.user!.id;
      try {
        // Recheck exclusions immediately before each single-role mutation.
        const current = await client.rest.get(Routes.guildMember(guildId, id)) as APIGuildMember;
        if (memberRoleSkipReason(current, request)) { data.skippedCount++; return; }
        const route = Routes.guildMemberRole(guildId, id, request.roleId);
        const options = { reason: `Server Admin Console: ${request.action} role requested by ${actorId}` };
        if (request.action === "add") await client.rest.put(route, options);
        else await client.rest.delete(route, options);
        data.updatedCount++;
      } catch (error) {
        data.failures.push(`${candidate.user!.username} (${id}): ${(error as Error).message}`);
      } finally {
        progress.processedCount++;
        progress.updatedCount = data.updatedCount;
        progress.skippedCount = data.skippedCount;
        progress.failedCount = data.failures.length;
        report();
      }
    }, (batchNumber, pausing) => {
      progress.batchNumber = batchNumber;
      progress.phase = pausing ? "pausing" : "updating";
      report();
    });
  }
  progress.phase = "completed";
  report();
  return { message: request.dryRun !== false
    ? `Dry run: ${data.matchedCount} member(s) match this role update. No roles were changed.`
    : `Updated ${data.updatedCount} of ${data.matchedCount} matching member(s); skipped ${data.skippedCount} during recheck; failed ${data.failures.length}.${data.failures.length ? " Completed with errors. Preview remaining members before retrying." : ""}`, data };
};
