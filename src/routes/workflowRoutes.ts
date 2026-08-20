import type { Application } from "express";

import { registerChannelArchiveRoute } from "./workflows/channelArchiveRoute";
import { registerInactiveScanRoute } from "./workflows/inactiveScanRoute";
import { registerKickFromCsvRoute } from "./workflows/kickFromCsvRoute";
import { registerRoleCleanupRoute } from "./workflows/roleCleanupRoute";
import { registerThreadRemovalRoute } from "./workflows/threadRemovalRoute";
import {
  registerZeroMessageRoute,
  resolveZeroMessageTargetChannels,
} from "./workflows/zeroMessageRoute";
import type { WorkflowRouteDependencies } from "./workflows/workflowRouteTypes";

export const registerWorkflowRoutes = (
  app: Application,
  dependencies: WorkflowRouteDependencies,
): void => {
  registerRoleCleanupRoute(app, dependencies);
  registerChannelArchiveRoute(app, dependencies);
  registerThreadRemovalRoute(app, dependencies);
  registerZeroMessageRoute(app, dependencies);
  registerInactiveScanRoute(app, dependencies);
  registerKickFromCsvRoute(app, dependencies);
};

export { resolveZeroMessageTargetChannels };
