import type { NextFunction, Request, Response } from "express";

export const isAuthenticatedRequest = (req: Request): boolean => {
  return Boolean(req.session.authUser);
};

export const isAuthorizedRequest = (req: Request): boolean => {
  return Boolean(
    req.session.authUser?.isAuthorized && req.session.authUser.selectedGuildId,
  );
};

export const getSelectedGuildId = (req: Request): string | null => {
  return req.session.authUser?.selectedGuildId ?? null;
};

export const requireAuthenticatedSession = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  next();
};

export const requireAuthorizedSession = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  if (!isAuthenticatedRequest(req)) {
    res.status(401).json({ message: "Authentication required." });
    return;
  }

  if (!isAuthorizedRequest(req)) {
    res.status(403).json({
      message: "Server management permission required.",
    });
    return;
  }

  next();
};
