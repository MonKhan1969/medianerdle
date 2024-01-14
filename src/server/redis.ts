import { Redis } from "@upstash/redis";
import { Lock } from "@upstash/lock";

import { env } from "@/env";

export const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

export const lock = new Lock({
  id: "lock:room",
  redis,
});
