export const getPrismaClient = async () => {
  const { prisma } = require("../lib/prisma");
  return prisma;
};
