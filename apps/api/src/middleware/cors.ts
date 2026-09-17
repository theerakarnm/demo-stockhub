/**
 * CORS for the browser app.
 *
 * The allow-list comes from the CORS_ORIGINS var, so production never has to
 * ship `*`. It is built per request because `c.env` only exists there.
 *
 * `x-demo-role` / `x-demo-org` must be in allowHeaders, otherwise the browser
 * preflight strips the demo role and every call falls back to the default role.
 */

import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { appConfig } from '../env';
import type { AppEnv } from '../types/app';
import { DEMO_ORG_HEADER, DEMO_ROLE_HEADER, DEMO_USER_HEADER } from './auth';

export const corsMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const { corsOrigins } = appConfig(c.env);
  const handler = cors({
    origin: (origin) => (corsOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'content-type',
      'x-request-id',
      DEMO_ROLE_HEADER,
      DEMO_ORG_HEADER,
      DEMO_USER_HEADER,
    ],
    exposeHeaders: ['x-request-id'],
    maxAge: 600,
  });
  return handler(c, next);
});
