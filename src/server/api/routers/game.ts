import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { env } from "@/env";
import { TMDB } from "tmdb-ts";
import { TRPCError } from "@trpc/server";
import { gameStateSchema, getIsPlayerTurn } from "@/lib/game-state";

const mediaSchema = z.object({
  id: z.number(),
  title: z.string(),
  mediaType: z.string(),
  year: z.string(),
});

type Media = z.infer<typeof mediaSchema>;

const tmdb = new TMDB(env.TMDB_ACCESS_TOKEN);

export const gameRouter = createTRPCRouter({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      const { results } = await tmdb.search.multi({ query: input.query });

      const mediaResults = results.reduce((acc, result) => {
        if (acc.length >= 5 || result.media_type === "person") return acc;

        if (result.media_type === "movie") {
          return [
            ...acc,
            {
              id: result.id,
              title: result.title,
              year: result.release_date.slice(0, 4) || "N/A",
              mediaType: "movie",
            },
          ];
        }

        if (result.media_type === "tv") {
          return [
            ...acc,
            {
              id: result.id,
              title: result.name,
              year: result.first_air_date.slice(0, 4) || "N/A",
              mediaType: "tv",
            },
          ];
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Unknown media type",
        });
      }, [] as Media[]);

      return { results: mediaResults };
    }),
  submitAnswer: protectedProcedure
    .input(z.object({ answer: mediaSchema }))
    .mutation(async ({ ctx, input }) => {
      // TODO: check to make sure it isnt the same as the last one
      // TODO: get time and compare to time in redis

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

      const isPlayerTurn = getIsPlayerTurn(gameState, ctx.session.user.id);

      if (!isPlayerTurn)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not user's turn",
        });

      const credits = await tmdb[
        input.answer.mediaType === "movie" ? "movies" : "tvShows"
      ].credits(input.answer.id);

      const people = [
        ...credits.cast,
        ...credits.crew.filter(
          (person) =>
            person.job === "Director" ||
            person.job === "Writer" ||
            person.job === "Director of Photography" ||
            person.job.includes("Composer"),
        ),
      ];

      const peopleIds: number[] = [];

      const links = people.reduce(
        (acc, person) => {
          peopleIds.push(person.id);

          const found = gameState.currentCredits.find((id) => id === person.id);
          if (typeof found === "undefined") return acc;

          if (acc.find((link) => link.id === person.id)) return acc;

          return [...acc, { id: person.id, name: person.name }];
        },
        [] as { id: number; name: string }[],
      );

      if (links.length === 0) return { success: false };

      gameState.currentCredits = peopleIds;
      gameState.media = [
        {
          title: `${input.answer.title} (${input.answer.year})`,
          links,
        },
        ...gameState.media,
      ];

      await ctx.redis.set(`room:${roomCode}:game-state`, gameState);

      const channel = ctx.realtimeRestClient.channels.get(roomCode);
      await channel.publish("update", gameState);

      return { success: true };
    }),
});
