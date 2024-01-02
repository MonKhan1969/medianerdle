import NextAuth from "next-auth";
import { withAxiom } from "next-axiom";

import { authOptions } from "@/server/auth";

// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
const handler = withAxiom(NextAuth(authOptions));
export { handler as GET, handler as POST };
