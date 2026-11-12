import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { MemberRole } from '@prisma/client';
import { config } from '../config.js';
import { prisma } from '../lib/prisma.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';

export const AUTH_COOKIE = 'qa_token';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: string; tokenVersion?: string }) {
  return jwt.sign({ sub: user.id }, config.JWT_SECRET, { expiresIn: TOKEN_TTL_SECONDS });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: TOKEN_TTL_SECONDS * 1000,
    path: '/',
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, { path: '/' });
}

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return req.cookies?.[AUTH_COOKIE];
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { sub: string; iat: number };
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, updatedAt: true, passwordChangedAt: true },
    });
    if (!user) return next(unauthorized());
    // Tokens issued before a password change are invalid
    if (user.passwordChangedAt && payload.iat * 1000 < user.passwordChangedAt.getTime() - 1000) {
      return next(unauthorized('Session expired, please sign in again'));
    }
    req.user = { id: user.id, email: user.email, name: user.name };
    next();
  } catch {
    next(unauthorized('Invalid or expired session'));
  }
}

const roleRank: Record<MemberRole, number> = { VIEWER: 0, EDITOR: 1, OWNER: 2 };

/** Ensures the current user is a member of the project with at least `minRole`. */
export async function assertProjectAccess(projectId: string, userId: string, minRole: MemberRole = 'VIEWER') {
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!membership) throw notFound('Project');
  if (roleRank[membership.role] < roleRank[minRole]) {
    throw forbidden(`This action requires the ${minRole.toLowerCase()} role`);
  }
  return membership;
}
