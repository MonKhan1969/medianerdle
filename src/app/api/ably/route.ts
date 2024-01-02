import Ably from "ably/promises";
import { withAxiom, type AxiomRequest } from "next-axiom";

import { env } from "@/env";
import { getServerAuthSession } from "@/server/auth";

export const GET = withAxiom(async (req: AxiomRequest) => {
  const session = await getServerAuthSession();

  if (!session) return Response.json({ error: "No session" }, { status: 401 });

  const client = new Ably.Rest(env.ABLY_API_KEY);

  const tokenRequestData = await client.auth.createTokenRequest({
    clientId: session.user.id,
  });

  req.log.info("tokenRequestData", { tokenRequestData });

  return Response.json(tokenRequestData);
});
