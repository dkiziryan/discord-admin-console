import type { Application, Request, Response } from "express";
import { listMemberRoles, parseRoleUpdateRequest, RoleUpdateError } from "../../services/role/updateMemberRoles";
import { createMemberRoleJobs } from "../../services/role/memberRoleJobs";
import type { WorkflowRouteDependencies } from "./workflowRouteTypes";

type Dependencies = Pick<WorkflowRouteDependencies, "client" | "requireSelectedGuildId" | "requireAuthenticatedDiscordUserId">;

export const registerMemberRoleRoutes = (app: Application, dependencies: Dependencies): void => {
  const { client, requireSelectedGuildId, requireAuthenticatedDiscordUserId } = dependencies;
  const jobs = createMemberRoleJobs(client);
  const context = (req: Request, res: Response) => {
    const guildId = requireSelectedGuildId(req, res);
    if (!guildId) return null;
    const actorId = requireAuthenticatedDiscordUserId(req, res);
    if (!actorId) return null;
    res.setHeader("Cache-Control", "no-store");
    return { guildId, actorId };
  };
  const handleError = (res: Response, error: unknown) => {
    res.status(error instanceof RoleUpdateError ? error.status : 500).json({ message: (error as Error).message });
  };

  app.get("/api/member-roles/status", (req, res) => {
    const active = context(req, res);
    if (active) res.json({ job: jobs.get(active.guildId) });
  });

  app.get("/api/member-roles", async (req, res) => {
    const active = context(req, res);
    if (!active) return;
    if (!client.isReady()) { res.status(503).json({ message: "Discord client is not ready yet." }); return; }
    try { res.json({ roles: await listMemberRoles(client, active.guildId, active.actorId) }); }
    catch (error) { handleError(res, error); }
  });

  app.post("/api/member-roles", (req, res) => {
    const active = context(req, res);
    if (!active) return;
    if (!client.isReady()) { res.status(503).json({ message: "Discord client is not ready yet." }); return; }
    try {
      const request = parseRoleUpdateRequest(req.body);
      res.status(202).json({ job: jobs.start(active.guildId, active.actorId, request) });
    } catch (error) { handleError(res, error); }
  });
};
