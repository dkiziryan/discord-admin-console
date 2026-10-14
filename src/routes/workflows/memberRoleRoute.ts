import type { Application } from "express";
import { listMemberRoles, parseRoleUpdateRequest, RoleUpdateError, updateMemberRoles } from "../../services/role/updateMemberRoles";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

type Dependencies = Pick<WorkflowRouteDependencies, "client" | "requireSelectedGuildId" | "requireAuthenticatedDiscordUserId">;

export const registerMemberRoleRoutes = (app: Application, dependencies: Dependencies): void => {
  const running = new Set<string>();
  const { client, requireSelectedGuildId, requireAuthenticatedDiscordUserId } = dependencies;
  for (const method of ["get", "post"] as const) {
    app[method]("/api/member-roles", async (req, res) => {
      const guildId = requireSelectedGuildId(req, res);
      if (!guildId) return;
      const actorId = requireAuthenticatedDiscordUserId(req, res);
      if (!actorId) return;
      if (!client.isReady()) { res.status(503).json({ message: "Discord client is not ready yet." }); return; }
      if (method === "post" && running.has(guildId)) {
        res.status(409).json({ message: "A member role update is already running." }); return;
      }
      let locked = false;
      try {
        res.setHeader("Cache-Control", "no-store");
        if (method === "get") res.json({ roles: await listMemberRoles(client, guildId, actorId) });
        else {
          const request = parseRoleUpdateRequest(req.body);
          running.add(guildId);
          locked = true;
          res.json(await updateMemberRoles(client, guildId, actorId, request));
        }
      } catch (error) {
        res.status(error instanceof RoleUpdateError ? error.status : 500).json({ message: (error as Error).message });
      } finally {
        if (locked) running.delete(guildId);
      }
    });
  }
};
