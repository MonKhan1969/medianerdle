import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { Redis } from "@upstash/redis";
import { Lock } from "@upstash/lock";
import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";

import { env } from "@/env";

export const roomRouter = createTRPCRouter({
  join: protectedProcedure.query(async () => {
    const redis = new Redis({
      url: env.REDIS_URL,
      token: env.REDIS_TOKEN,
    });

    const lock = new Lock({
      id: createId(),
      redis,
    });

    let result;

    if (await lock.acquire()) {
      const roomCode = await redis.get("roomCode");

      if (typeof roomCode !== "string") {
        const code = createId();

        await redis.set("roomCode", code);

        result = { waiting: true, code };
      } else {
        result = { waiting: false, code: roomCode };
      }

      await lock.release();

      return result;
    } else {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Lock error",
      });
    }
  }),
});
