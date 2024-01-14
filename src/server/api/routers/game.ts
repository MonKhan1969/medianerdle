import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

import { TMDB } from "tmdb-ts";
import { env } from "@/env";
import { TRPCError } from "@trpc/server";
import {
  type PersonLink,
  getIsJobValid,
  getIsPlayerTurn,
  boardStateSchema,
} from "@/lib/game-state";

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
      if (!input.answer) return { success: false };

      const roomCode = z
        .string()
        .nullable()
        .parse(await ctx.redis.get(`player:${ctx.session.user.id}:room-code`));

      if (!roomCode)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Room code not found",
        });

      const tx1 = ctx.redis.pipeline();

      tx1.lrange(`room:${roomCode}:board-state`, 0, -1);

      tx1.lrange(`room:${roomCode}:players`, 0, -1);

      tx1.get(`room:${roomCode}:current-credits`);

      const [boardState, players, currentCredits] = z
        .tuple([
          boardStateSchema.nullable(),
          z.array(z.string()).nullable(),
          z.array(z.number()).nullable(),
        ])
        .parse(await tx1.exec());

      if (!boardState || !players || !currentCredits) {
        console.log(
          "Board state or players not found:",
          `boardState.length = ${boardState?.length ?? 0},`,
          `players.length = ${players?.length ?? 0}`,
          `currentCredits.length = ${currentCredits?.length ?? 0}`,
        );
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Board, players, or initial id not found",
        });
      }

      if (!getIsPlayerTurn(players, boardState.length, ctx.session.user.id))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not user's turn",
        });

      const isMediaAlreadyPlayed = Boolean(
        boardState.find((item) => item.key === input.answer?.key),
      );

      if (isMediaAlreadyPlayed)
        return {
          success: false,
          message: "This media has already been played",
        };

      const links = [] as PersonLink[];
      const peopleIds = new Set<number>();

      function addLink(person: PersonLink) {
        const isLink = currentCredits?.includes(person.id) ?? false;
        const isDuplicate = Boolean(
          links.find((link) => link.id === person.id),
        );

        if (isLink && !isDuplicate) {
          links.push({ id: person.id, name: person.name });
        }
      }

      if (input.answer.mediaType === "movie") {
        const credits = await tmdb.movies.credits(input.answer.id);

        for (const person of credits.cast) {
          peopleIds.add(person.id);
          addLink(person);
        }

        for (const person of credits.crew) {
          if (!getIsJobValid(person.job)) continue;

          peopleIds.add(person.id);
          addLink(person);
        }
      } else if (input.answer.mediaType === "tv") {
        const credits = await tmdb.tvShows.aggregateCredits(input.answer.id);

        for (const person of credits.cast) {
          peopleIds.add(person.id);
          addLink(person);
        }

        for (const person of credits.crew) {
          const isJobValid = person.jobs.some((job) => getIsJobValid(job.job));
          if (!isJobValid) continue;

          peopleIds.add(person.id);
          addLink(person);
        }
      } else {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Unknown media type "${input.answer.mediaType}"`,
        });
      }

      if (links.length === 0)
        return { success: false, message: "No links found" };

      const newMedia = {
        key: input.answer.key,
        label: input.answer.label,
        links,
      };

      const tx2 = ctx.redis.pipeline();

      tx2.set(`room:${roomCode}:current-credits`, Array.from(peopleIds));

      tx2.lpush(`room:${roomCode}:board-state`, newMedia);

      await tx2.exec();

      const channel = ctx.ablyClient.channels.get(roomCode);
      await channel.publish("update", newMedia);

      return { success: true };
    }),
  getBoardState: protectedProcedure.query(async ({ ctx }) => {
    const roomCode = z
      .string()
      .nullable()
      .parse(await ctx.redis.get(`player:${ctx.session.user.id}:room-code`));

    if (!roomCode) return { state: [] };

    const boardState = boardStateSchema
      .nullable()
      .parse(await ctx.redis.lrange(`room:${roomCode}:board-state`, 0, -1));

    if (!boardState) return { state: [] };

    return { state: boardState };
  }),
});
