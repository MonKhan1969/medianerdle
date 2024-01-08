import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { TMDB } from "tmdb-ts";
import { env } from "@/env";
import { TRPCError } from "@trpc/server";
import {
  type PersonLink,
  gameStateSchema,
  getIsJobValid,
  getIsPlayerTurn,
} from "@/lib/game-state";
import { validateRedisSchema } from "@/lib/utils";

const mediaSchema = z.object({
  key: z.string(),
  id: z.number(),
  label: z.string(),
  mediaType: z.string(),
});

type Media = z.infer<typeof mediaSchema>;

const tmdb = new TMDB(env.TMDB_ACCESS_TOKEN);

export const gameRouter = createTRPCRouter({
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input }) => {
      if (!input.query) return { results: [] };

      const { results } = await tmdb.search.multi({ query: input.query });

      const mediaResults = results.reduce((acc, result) => {
        if (acc.length >= 5 || result.media_type === "person") return acc;

        if (result.media_type === "movie") {
          if (!result.release_date) return acc;
          return [
            ...acc,
            {
              key: `${result.media_type}-${result.id}`,
              id: result.id,
              label: `${result.title} (${result.release_date.slice(0, 4)})`,
              mediaType: "movie",
            },
          ];
        }

        if (result.media_type === "tv") {
          if (!result.first_air_date) return acc;
          return [
            ...acc,
            {
              key: `${result.media_type}-${result.id}`,
              id: result.id,
              label: `${result.name} (${result.first_air_date.slice(0, 4)})`,
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
    .input(z.object({ answer: z.union([mediaSchema, z.undefined()]) }))
    .mutation(async ({ ctx, input }) => {
      // TODO: get time and compare to time in redis

      if (!input.answer) return;

      const roomCode = validateRedisSchema(
        await ctx.redis.get(`player:${ctx.session.user.id}:room-code`),
        z.string(),
      );

      if (!roomCode)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Room code not found",
        });

      const gameState = validateRedisSchema(
        await ctx.redis.get(`room:${roomCode}:game-state`),
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

      // TODO: make more robust by using id instead of label
      if (gameState.initialLabel === input.answer.label)
        return {
          success: false,
          message: "This media has already been played",
        };

      const isMediaAlreadyPlayed = gameState.media.find(
        (item) => item.key === input.answer?.key, // don't know why `input.answer` could be undefined
      );

      if (isMediaAlreadyPlayed)
        return {
          success: false,
          message: "This media has already been played",
        };

      // TODO: make more efficient
      let cast: PersonLink[];
      let crew: PersonLink[];

      if (input.answer.mediaType === "movie") {
        const credits = await tmdb.movies.credits(input.answer.id);
        cast = credits.cast.map((person) => ({
          id: person.id,
          name: person.name,
        }));
        crew = credits.crew.reduce((acc, person) => {
          if (getIsJobValid(person.job))
            return [...acc, { id: person.id, name: person.name }];

          return acc;
        }, [] as PersonLink[]);
      } else if (input.answer.mediaType === "tv") {
        const credits = await tmdb.tvShows.aggregateCredits(input.answer.id);
        cast = credits.cast.map((person) => ({
          id: person.id,
          name: person.name,
        }));
        crew = credits.crew.reduce((acc, person) => {
          const isJobValid = person.jobs.some((job) => getIsJobValid(job.job));
          if (isJobValid) return [...acc, { id: person.id, name: person.name }];
          return acc;
        }, [] as PersonLink[]);
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown media type "${input.answer.mediaType}"`,
        });
      }

      const people = [...cast, ...crew];

      const peopleIds: number[] = [];

      const links = people.reduce((acc, person) => {
        peopleIds.push(person.id);

        const found = gameState.currentCredits.find((id) => id === person.id);
        if (typeof found === "undefined") return acc;

        if (acc.find((link) => link.id === person.id)) return acc;

        return [...acc, person];
      }, [] as PersonLink[]);

      if (links.length === 0)
        return { success: false, message: "No links found" };

      gameState.currentCredits = peopleIds;
      gameState.media = [
        {
          key: input.answer.key,
          label: input.answer.label,
          links,
        },
        ...gameState.media,
      ];

      await ctx.redis.set(`room:${roomCode}:game-state`, gameState);

      const channel = ctx.ablyClient.channels.get(roomCode);
      await channel.publish("update", gameState);

      return { success: true };
    }),
});
