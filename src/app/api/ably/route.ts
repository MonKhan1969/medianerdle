import Ably from "ably/promises";

import { env } from "@/env";
import { getServerAuthSession } from "@/server/auth";

export async function GET() {
  const session = await getServerAuthSession();

  if (!session) return Response.json({ error: "No session" }, { status: 401 });

  const client = new Ably.Realtime(env.ABLY_API_KEY);

  const tokenRequestData = await client.auth.createTokenRequest({
    clientId: session.user.id,
  });

  console.log("tokenRequestData", tokenRequestData);

  return Response.json(tokenRequestData);
}
