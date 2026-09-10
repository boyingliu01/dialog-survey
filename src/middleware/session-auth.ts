import type {} from '@fastify/secure-session';

export interface AdminSession {
  userId: string;
  role: 'admin';
  loginTime: number;
  lastActivity: number;
}

export function validateSession(
  session: AdminSession | null | undefined,
  maxAgeSeconds: number
): session is AdminSession {
  if (!session) {
    return false;
  }

  const now = Date.now();
  const maxAgeMs = maxAgeSeconds * 1000;

  if (now - session.lastActivity > maxAgeMs) {
    return false;
  }

  session.lastActivity = now;

  return true;
}
