import type { NextFunction, Request, Response } from "express";

const API_KEY = process.env.API_KEY?.trim();

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    next();
    return;
  }

  if (req.path === "/health") {
    next();
    return;
  }

  const headerKey = req.header("x-api-key")?.trim();
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const provided = headerKey || bearer;

  if (provided !== API_KEY) {
    res.status(401).json({ error: "Invalid or missing API key." });
    return;
  }

  next();
}
