import type { Client } from "discord.js";
import type { Request, Response } from "express";

import type { InactiveScanStatus, ScanStatus } from "../../models/types";
import type { ScanCancellationController } from "../../utils/cancellationController";

export type WorkflowRouteDependencies = {
  activeCancellationByGuild: Map<string, ScanCancellationController>;
  client: Client;
  formatElapsedDuration: (startedAtMs: number, finishedAtMs: number) => string;
  getInactiveStatus: (activeGuildId: string) => InactiveScanStatus;
  getScanStatus: (activeGuildId: string) => ScanStatus;
  inactiveCancellationByGuild: Map<string, ScanCancellationController>;
  isChannelArchiveProcessingByGuild: Map<string, boolean>;
  isInactiveProcessingByGuild: Map<string, boolean>;
  isKickProcessingByGuild: Map<string, boolean>;
  isProcessingByGuild: Map<string, boolean>;
  isRoleCleanupProcessingByGuild: Map<string, boolean>;
  kickCancellationByGuild: Map<string, ScanCancellationController>;
  parseMaxMessagesPerChannel: (value: unknown) => number | undefined;
  requireAuthenticatedDiscordUserId: (
    req: Request,
    res: Response,
  ) => string | null;
  requireSelectedGuildId: (req: Request, res: Response) => string | null;
  updateInactiveStatus: (
    activeGuildId: string,
    partial: Partial<InactiveScanStatus>,
  ) => void;
  updateScanStatus: (
    activeGuildId: string,
    partial: Partial<ScanStatus>,
  ) => void;
  waitForProcessingToStop: (
    isProcessing: Map<string, boolean>,
    activeGuildId: string,
  ) => Promise<boolean>;
};
