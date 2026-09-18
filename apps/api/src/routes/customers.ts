/**
 * Customer routes - stub reserved by Task 5.
 *
 * Mounted in src/index.ts so the URL space and the middleware chain exist
 * before Task 31 fills the endpoints in. An empty router answers 404
 * with the error envelope, which is the honest answer until then.
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types/app';

export const customersRouter = new Hono<AppEnv>();
