import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { createId } from "@paralleldrive/cuid2";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createNewGameState,
  gameStateSchema,
  EndGameReason,
} from "@/lib/game-state";

export const roomRouter = createTRPCRouter({
  join: protectedProcedure.query(async ({ ctx }) => {
    async function createNewRoom() {
      console.log("Creating new room");

      const newRoomCode = createId();

      await ctx.redis.mset({
        ["open-room-code"]: newRoomCode,
        [`player:${ctx.session.user.id}:room-code`]: newRoomCode,
      });

      console.log(
        `Set player "${ctx.session.user.id}" to open room ${newRoomCode}`,
      );

      const initialTitle = await ctx.redis.get("initial-title", z.string());
      const currentCredits = await ctx.redis.get(
        "initial-credits",
        z.array(z.number()),
      );

      if (!initialTitle || !currentCredits) {
        console.log(
          `Initial game info not set: title = ${initialTitle}, credits =`,
          currentCredits,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Initial game info not set",
        });
      }

      console.log(`Retrieved initial game info: title = "${initialTitle}"`);

      const newGameState = createNewGameState(
        ctx.session.user.id,
        initialTitle,
        currentCredits,
      );

      await ctx.redis.set(`room:${newRoomCode}:game-state`, newGameState);

      console.log(
        `Finished creating new room. Set game state for room ${newRoomCode}:`,
      );

      return { newRoomCode, newGameState };
    }

    console.log(`Player "${ctx.session.user.id}" joining room`);

    const currentRoomCode = await ctx.redis.get(
      `player:${ctx.session.user.id}:room-code`,
      z.string(),
    );

    // check if player is already in a room
    if (!!currentRoomCode) {
      console.log(
        `Player "${ctx.session.user.id}" is already in room ${currentRoomCode}`,
      );

      const gameState = await ctx.redis.get(
        `room:${currentRoomCode}:game-state`,
        gameStateSchema,
      );

      // check if game state exists
      if (!gameState) {
        console.log(
          `Game state for room ${currentRoomCode} does not exist anymore`,
        );
        // room does not exist anymore, could have expired
        await ctx.redis.del(`room:${currentRoomCode}:game-state`);

        console.log(`Deleted game state for room ${currentRoomCode}`);

        // create new room
        const { newRoomCode, newGameState } = await createNewRoom();

        return { roomCode: newRoomCode, gameState: newGameState };
      }

      console.log(`Game state for room ${currentRoomCode} exists`);

      // room exists
      return { roomCode: currentRoomCode, gameState };
    }

    // check for open room

    console.log("Checking for open room");

    if (await ctx.lock.acquire({ retry: { attempts: 20, delay: 100 } })) {
      const openRoomCode = await ctx.redis.get("open-room-code", z.string());

      if (!openRoomCode) {
        console.log("No open room found");
        // create new room
        const { newRoomCode, newGameState } = await createNewRoom();

        console.log("Releasing lock");
        await ctx.lock.release();
        console.log("Released lock");

        return { roomCode: newRoomCode, gameState: newGameState };
      }

      console.log(`Found open room: ${openRoomCode}`);

      // open room exists
      await ctx.redis.del("open-room-code");
      console.log('Deleted "open-room-code" key');

      // join room
      const gameState = await ctx.redis.get(
        `room:${openRoomCode}:game-state`,
        gameStateSchema,
      );

      console.log(`Retrieved game state for room ${openRoomCode}`);

      if (!gameState) {
        console.log(`Game state for room ${openRoomCode} does not exist`);
        // room does not exist anymore, could have expired
        await ctx.redis.del(`room:${currentRoomCode}:game-state`);

        // create new room
        const { newRoomCode, newGameState } = await createNewRoom();

        console.log("Releasing lock");
        await ctx.lock.release();
        console.log("Released lock");

        return { roomCode: newRoomCode, gameState: newGameState };
      }

      console.log(`Game state for room ${openRoomCode} exists`);

      await ctx.redis.set(
        `player:${ctx.session.user.id}:room-code`,
        openRoomCode,
      );

      // randomize player order
      if (Math.random() < 0.5) {
        console.log(`Player "${ctx.session.user.id}" is second player`);
        gameState.players.push(ctx.session.user.id);
      } else {
        console.log(`Player "${ctx.session.user.id}" is first player`);
        gameState.players.unshift(ctx.session.user.id);
      }

      await ctx.redis.set(`room:${openRoomCode}:game-state`, gameState);
      console.log(`Set game state for room ${openRoomCode}`);

      console.log("Releasing lock");
      await ctx.lock.release();
      console.log("Released lock");

      console.log(`Getting channel ${openRoomCode}`);

      const channel = ctx.realtimeRestClient.channels.get(openRoomCode);

      console.log(`Publishing "update" event to channel ${openRoomCode}`);

      await channel.publish("update", gameState);

      console.log(`Published "update" event to channel ${openRoomCode}`);

      return { roomCode: openRoomCode, gameState };
    } else {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Lock error",
      });
    }
  }),
  leave: protectedProcedure.mutation(async ({ ctx }) => {
    const roomCode = await ctx.redis.get(
      `player:${ctx.session.user.id}:room-code`,
      z.string(),
    );

    if (!roomCode)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Room code not found",
      });

    const gameState = await ctx.redis.get(
      `room:${roomCode}:game-state`,
      gameStateSchema,
    );

    if (!gameState)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Game state not found",
      });

    await ctx.redis.del(
      `player:${gameState.players[0]}:room-code`,
      `player:${gameState.players[1]}:room-code`,
      `room:${roomCode}:game-state`,
    );

    const channel = ctx.realtimeRestClient.channels.get(roomCode);
    await channel.publish("end-game", {
      reason: EndGameReason.PlayerLeft,
      player: ctx.session.user.id,
    });
  }),
  getOpponent: protectedProcedure.query(async ({ ctx }) => {
    const emptyName = { name: "Opponent" };

    const roomCode = await ctx.redis.get(
      `player:${ctx.session.user.id}:room-code`,
      z.string(),
    );

    if (!roomCode) return emptyName;

    const gameState = await ctx.redis.get(
      `room:${roomCode}:game-state`,
      gameStateSchema,
    );

    if (!gameState) return emptyName;

    const opponentId = gameState.players.find(
      (player) => player !== ctx.session.user.id,
    );

    if (!opponentId) return emptyName;

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
