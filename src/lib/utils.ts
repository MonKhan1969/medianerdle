import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { z } from "zod";

export function validateRedisSchema<T>(
  redisResult: unknown,
  schema: z.ZodType<T>,
) {
  const redisSchema = z.union([z.null(), schema]);

  const parsedValue = redisSchema.parse(redisResult);

  return parsedValue;
}
