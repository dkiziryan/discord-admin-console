import type { MemberRoleOption, UpdateMemberRolesRequest, UpdateMemberRolesResponse } from "../../models/types";
import { apiJson } from "../apiClient";

export const fetchMemberRoles = () => apiJson<{ roles: MemberRoleOption[] }>("/api/member-roles", {
  errorMessage: "Failed to load server roles.",
});

export const requestMemberRoleUpdate = (json: UpdateMemberRolesRequest) =>
  apiJson<UpdateMemberRolesResponse>("/api/member-roles", {
    method: "POST", json, errorMessage: "Failed to update member roles.",
  });
