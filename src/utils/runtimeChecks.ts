export const getOriginFromUrl = (url: string | undefined): string | null => {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

export const isAllowedBrowserOrigin = (
  origin: string | undefined,
  allowedOrigins: string[] = [],
): boolean => {
  if (!origin) {
    return true;
  }

  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  return allowedOrigins.includes(origin);
};

export const isDatabaseReady = async (): Promise<boolean> => {
  try {
    const { prisma } = require("../lib/prisma");
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
};
