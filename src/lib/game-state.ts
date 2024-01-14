import { z } from "zod";

export function getIsPlayerTurn(
  players: string[] | undefined,
  boardLength: number | undefined,
  player: string | undefined,
) {
  if (!players || !boardLength || !player) return false;
  return players[boardLength % 2] === player;
}

export function getIsJobValid(job: string) {
  return (
    job === "Director" ||
    job === "Writer" ||
    job === "Director of Photography" ||
    job.includes("Composer")
  );
}

export const personLinkSchema = z.object({
  id: z.number(),
  name: z.string(),
});

export type PersonLink = z.infer<typeof personLinkSchema>;

export const boardItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  links: z.array(z.object({ id: z.number(), name: z.string() })),
});

export type BoardItem = z.infer<typeof boardItemSchema>;

export const boardStateSchema = z.array(boardItemSchema);

export type BoardState = z.infer<typeof boardStateSchema>;

export enum GameState {
  Waiting = "WAITING",
  Playing = "PLAYING",
  GameOver = "GAME_OVER",
}
