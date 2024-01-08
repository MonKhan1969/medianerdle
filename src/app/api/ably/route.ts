import { withAxiom, type AxiomRequest } from "next-axiom";

import { getServerAuthSession } from "@/server/auth";
import { ablyClient } from "@/server/ably";

export const GET = withAxiom(async (req: AxiomRequest) => {
  const session = await getServerAuthSession();

  if (!session) return Response.json({ error: "No session" }, { status: 401 });

  const tokenRequestData = await ablyClient.auth.createTokenRequest({
    clientId: session.user.id,
  });

  req.log.info("tokenRequestData", { tokenRequestData });

  return Response.json(tokenRequestData);
});
