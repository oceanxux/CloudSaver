// filepath: /D:/code/CloudDiskDown/backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { ApiResponse } from "../core/ApiResponse";
import { config } from "../config";

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: number;
  };
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  if (req.path.endsWith("/user/login") || req.path.endsWith("/health")) {
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return res.status(401).json(ApiResponse.error("未提供 token", 401));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;

    req.user = {
      userId: String(decoded.userId || ""),
      role: Number(decoded.role || 0),
    };
    next();
  } catch (error) {
    res.status(401).json(ApiResponse.error("无效的 token", 401));
  }
};
