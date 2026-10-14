import type { MemberRoleJobStatus, MemberRoleOption, UpdateMemberRolesRequest } from "../../models/types";
import { apiJson } from "../apiClient";

export const fetchMemberRoles = () => apiJson<{ roles: MemberRoleOption[] }>("/api/member-roles", {
  errorMessage: "Failed to load server roles.",
});

export const requestMemberRoleUpdate = (json: UpdateMemberRolesRequest) =>
  apiJson<{ job: MemberRoleJobStatus }>("/api/member-roles", {
    method: "POST", json, errorMessage: "Failed to start member role update.",
    signal: AbortSignal.timeout(10_000),
  });

export const fetchMemberRoleStatus = () =>
  apiJson<{ job: MemberRoleJobStatus | null }>("/api/member-roles/status", {
    errorMessage: "Could not refresh role update progress.", cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
