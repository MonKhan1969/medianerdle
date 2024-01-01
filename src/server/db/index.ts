import { Client } from "@planetscale/database";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import { Redis } from "@upstash/redis";
import { Lock } from "@upstash/lock";

import { env } from "@/env";
import * as schema from "./schema";

export const db = drizzle(
  new Client({
    url: env.DATABASE_URL,
  }).connection(),
  { schema },
);

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const lock = new Lock({
  id: "lock:room",
  redis,
});
