import type { NextFunction, Request, Response } from "express";
import {
  extractVaultMediaObjectPath,
  verifyVaultReadToken,
  verifyVaultUploadToken,
} from "../services/vaultMediaAccess.js";

const API_KEY = process.env.API_KEY?.trim();

function vaultMediaTokenAuth(req: Request): boolean {
  const objectPath =
    extractVaultMediaObjectPath(`${req.baseUrl ?? ""}${req.path}`) ??
    extractVaultMediaObjectPath(req.originalUrl.split("?")[0] ?? "");
  if (!objectPath) {
    return false;
  }

  const exp = Number(req.query.exp);
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (req.method === "GET") {
    return verifyVaultReadToken(objectPath, exp, token);
  }
  if (req.method === "PUT") {
    const contentType = req.header("content-type")?.trim() || "image/jpeg";
    return verifyVaultUploadToken(objectPath, contentType, exp, token);
  }
  return false;
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    next();
    return;
  }

  if (req.path === "/health") {
    next();
    return;
  }

  if (vaultMediaTokenAuth(req)) {
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
