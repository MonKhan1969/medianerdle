import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const roomRouter = createTRPCRouter({
  join: protectedProcedure.query(async ({ ctx }) => {
    async function createNewRoom() {
      console.log("Getting initial game info");

      const [initialKey, initialLabel, initialCredits] = z
        .tuple([
          z.string().nullable(),
          z.string().nullable(),
          z.array(z.number()).nullable(),
        ])
        .parse(
          await ctx.redis.mget(
            "initial:key",
            "initial:label",
            "initial:credits",
          ),
        );

      if (!initialKey || !initialLabel || !initialCredits) {
        console.log(
          "Initial game info not set:",
          `key = ${initialKey},`,
          `label = ${initialLabel},`,
          `credits.length = ${initialCredits?.length ?? 0}`,
        );

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Initial game info not set",
        });
      }

      console.log("Creating new room");

      const newRoomCode = createId();

      console.log(`New room code: ${newRoomCode}`);

      const tx = ctx.redis.pipeline();

      tx.mset({
        ["open-room-code"]: newRoomCode,
        [`player:${ctx.session.user.id}:room-code`]: newRoomCode,
        [`room:${newRoomCode}:current-credits`]: initialCredits,
      });

      tx.lpush(`room:${newRoomCode}:players`, ctx.session.user.id);

      tx.lpush(`room:${newRoomCode}:board-state`, {
        key: initialKey,
        label: initialLabel,
        links: [],
      });

      await tx.exec();

      console.log("Done creating new room");

      return { code: newRoomCode };
    }

    console.log(
      `Player "${ctx.session.user.name}" (${ctx.session.user.id}) is joining a room`,
    );

    // check if player is already in a room
    const currentRoomCode = z
      .string()
      .nullable()
      .parse(await ctx.redis.get(`player:${ctx.session.user.id}:room-code`));

    if (!!currentRoomCode) {
      // player is already in a room
      console.log(
        `Player "${ctx.session.user.name}" (${ctx.session.user.id}) is already in room ${currentRoomCode}`,
      );

      // check for game state
      const boardState = await ctx.redis.lrange(
        `room:${currentRoomCode}:board-state`,
        0,
        -1,
      );

      if (!!boardState) {
        // game is in progress

        const secondPlayer = z
          .string()
          .nullable()
          .parse(await ctx.redis.lindex(`room:${currentRoomCode}:players`, 1));

        return { code: currentRoomCode, isGamePlaying: !!secondPlayer };
      }

      // board doesn't exist, so delete everything with room code and join new room
      await ctx.redis.del(
        `player:${ctx.session.user.id}:room-code`,
        `room:${currentRoomCode}:players`,
        `room:${currentRoomCode}:current-credits`,
      );
    }

    // player is not in a room
    console.log(
      `Player "${ctx.session.user.name}" (${ctx.session.user.id}) is not in a room`,
    );

    if (await ctx.lock.acquire()) {
      const openRoomCode = z
        .string()
        .nullable()
        .parse(await ctx.redis.get("open-room-code"));

      if (!openRoomCode) {
        // no open room
        // create new room
        const { code } = await createNewRoom();

        await ctx.lock.release();

        return { code, isGamePlaying: false };
      }

      // join open room
      const tx = ctx.redis.pipeline();
      tx.del("open-room-code");
      tx.set(`player:${ctx.session.user.id}:room-code`, openRoomCode);
      if (Math.random() < 0.5) {
        tx.rpush(`room:${openRoomCode}:players`, ctx.session.user.id);
      } else {
        tx.lpush(`room:${openRoomCode}:players`, ctx.session.user.id);
      }
      await tx.exec();

      await ctx.lock.release();

      // send realtime update
      console.log('Publishing "join" event');

      const channel = ctx.ablyClient.channels.get(openRoomCode);
      await channel.publish("join", ctx.session.user.id);

      console.log('Published "join" event');

      console.log("Done joining room");

      return { code: openRoomCode, isGamePlaying: true };
    } else {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Lock error",
      });
    }
  }),
  quit: protectedProcedure.mutation(async ({ ctx }) => {
    if (await ctx.lock.acquire()) {
      const roomCode = z
        .string()
        .nullable()
        .parse(await ctx.redis.get(`player:${ctx.session.user.id}:room-code`));

      if (!roomCode) {
        await ctx.lock.release();
        return;
      }

      await ctx.redis.del(
        `room:${roomCode}:current-credits`,
        `room:${roomCode}:board-state`,
      );

      const openRoomCode = z
        .string()
        .nullable()
        .parse(await ctx.redis.get("open-room-code"));

      if (openRoomCode === roomCode) {
        await ctx.redis.del(
          "open-room-code",
          `player:${ctx.session.user.id}:room-code`,
          `room:${roomCode}:players`,
        );
        await ctx.lock.release();
        return;
      }

      const players = await ctx.redis.lrange(`room:${roomCode}:players`, 0, -1);

      if (!players) {
        await ctx.lock.release();
        return;
      }

      await ctx.redis.del(
        `room:${roomCode}:players`,
        `player:${players[0]}:room-code`,
        `player:${players[1]}:room-code`,
      );

      await ctx.lock.release();

      const channel = ctx.ablyClient.channels.get(roomCode);
      await channel.publish("end", ctx.session.user.id);
    } else {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Lock error",
      });
    }
  }),
  getPlayers: protectedProcedure.query(async ({ ctx }) => {
    const roomCode = z
      .string()
      .nullable()
      .parse(await ctx.redis.get(`player:${ctx.session.user.id}:room-code`));

    if (!roomCode) return { ids: [] };

    const players = await ctx.redis.lrange(`room:${roomCode}:players`, 0, -1);

    if (!players) return { ids: [] };

    return { ids: players };
  }),
  getOpponent: protectedProcedure.query(async ({ ctx }) => {
    const roomCode = z
      .string()
      .nullable()
      .parse(await ctx.redis.get(`player:${ctx.session.user.id}:room-code`));

    if (!roomCode) {
      console.log("\n\ngetOpponent: Room code not found\n\n");
      return { name: undefined };
    }

    const players = await ctx.redis.lrange(`room:${roomCode}:players`, 0, -1);

    if (!players) {
      console.log("\n\ngetOpponent: Players not found\n\n");
      return { name: undefined };
    }

    const opponentId = players.find((player) => player !== ctx.session.user.id);

    if (!opponentId) {
      console.log("\n\ngetOpponent: Opponent id not found\n\n");
      return { name: undefined };
    }

    const opponent = await ctx.db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, opponentId),
      columns: {
        name: true,
      },
    });

    if (!opponent)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Opponent not found in database",
      });

    return { name: opponent.name ?? "Opponent" };
  }),
});
