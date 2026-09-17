/**
 * Liveness probe. No auth, no database: it must answer even when Postgres is
 * down, otherwise a deploy check cannot tell "Worker broken" from "db broken".
 * Add a separate /health/deep later if you need a db round trip.
 */

import { Hono } from 'hono';
import { appConfig } from '../env';
import type { AppEnv } from '../types/app';
import type { HealthResponse } from '../types/contract';

export const healthRouter = new Hono<AppEnv>().get('/', (c) => {
  const { apiVersion } = appConfig(c.env);
  const body: HealthResponse = {
    status: 'ok',
    version: apiVersion,
    time: new Date().toISOString(),
  };
  // Plain c.json: there is no cost data in a health payload.
  return c.json(body);
});
