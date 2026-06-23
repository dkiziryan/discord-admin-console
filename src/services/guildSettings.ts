import { Prisma } from "@prisma/client";
import {
  canUseConfiguredInactiveCategories,
  normalizeInactiveCategoryDefaults,
  readInactiveCategoryDefaults,
} from "../config/inactiveCategories";
import {
  readConfiguredChannelNames,
} from "../config/targetChannels";
import { getPrismaClient } from "../utils/prismaClient";
import { toStringArray } from "../utils/prismaJson";

export type GuildSettingsRecord = {
  discordGuildId: string;
  inactiveExcludedCategories: string[];
  defaultTargetChannels: string[];
};

export type UpdateGuildSettingsInput = {
  defaultTargetChannels?: unknown;
  inactiveExcludedCategories?: unknown;
};

export const normalizeGuildSettingsList = (value: unknown): string[] => {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const items: string[] = [];

  for (const item of rawItems) {
    if (typeof item !== "string") {
      continue;
    }

    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(trimmed);
  }

  return items;
};

const mapGuildSettings = (record: {
  discordGuildId: string;
  inactiveExcludedCategories: Prisma.JsonValue;
  defaultTargetChannels: Prisma.JsonValue;
}): GuildSettingsRecord => ({
  discordGuildId: record.discordGuildId,
  inactiveExcludedCategories: normalizeInactiveCategoryDefaults(
    normalizeGuildSettingsList(toStringArray(record.inactiveExcludedCategories)),
  ),
  defaultTargetChannels: normalizeGuildSettingsList(
    toStringArray(record.defaultTargetChannels),
  ),
});

export const ensureGuildSettings = async (
  guildId: string,
): Promise<GuildSettingsRecord> => {
  const prisma = await getPrismaClient();
  const defaultTargetChannels = await readConfiguredChannelNames(guildId);
  const inactiveExcludedCategories = await readInactiveCategoryDefaults(guildId);

  const settings = await prisma.guildSettings.upsert({
    where: { discordGuildId: guildId },
    update: {},
    create: {
      discordGuildId: guildId,
      defaultTargetChannels,
      inactiveExcludedCategories,
    },
  });

  return mapGuildSettings(settings);
};

export const readGuildSettings = async (
  guildId: string,
): Promise<GuildSettingsRecord> => {
  const prisma = await getPrismaClient();
  const settings = await prisma.guildSettings.findUnique({
    where: { discordGuildId: guildId },
  });

  if (!settings) {
    return ensureGuildSettings(guildId);
  }

  return mapGuildSettings(settings);
};

export const updateGuildSettings = async (
  guildId: string,
  input: UpdateGuildSettingsInput,
): Promise<GuildSettingsRecord> => {
  const prisma = await getPrismaClient();
  const existing = await readGuildSettings(guildId);
  const defaultTargetChannels =
    input.defaultTargetChannels === undefined
      ? existing.defaultTargetChannels
      : normalizeGuildSettingsList(input.defaultTargetChannels);
  const inactiveExcludedCategories =
    input.inactiveExcludedCategories === undefined
      ? existing.inactiveExcludedCategories
      : normalizeInactiveCategoryDefaults(
          normalizeGuildSettingsList(input.inactiveExcludedCategories),
        );

  const settings = await prisma.guildSettings.upsert({
    where: { discordGuildId: guildId },
    update: {
      defaultTargetChannels,
      inactiveExcludedCategories,
    },
    create: {
      discordGuildId: guildId,
      defaultTargetChannels,
      inactiveExcludedCategories,
    },
  });

  return mapGuildSettings(settings);
};

export const readScopedEnvInactiveCategories = (guildId: string): string[] => {
  if (!canUseConfiguredInactiveCategories(guildId)) {
    return [];
  }

  return normalizeInactiveCategoryDefaults(
    (process.env.INACTIVE_EXCLUDED_CATEGORIES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
};

export const collectInactiveExcludedCategories = async (
  guildId: string,
  extra: string[] = [],
): Promise<string[]> => {
  const settings = await readGuildSettings(guildId);
  const envCategories = readScopedEnvInactiveCategories(guildId);

  return normalizeInactiveCategoryDefaults([
    ...settings.inactiveExcludedCategories,
    ...extra,
    ...envCategories,
  ]);
};
