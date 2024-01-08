import Ably from "ably/promises";
import { env } from "@/env";

export const ablyClient = new Ably.Rest(env.ABLY_API_KEY);
