"use client";

import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { ErrorBoundary as HighlightErrorBoundary } from "@highlight-run/next/client";

export default function ClientWrapper({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}): React.ReactNode {
  return (
    <HighlightErrorBoundary showDialog>
      <SessionProvider session={session}>{children}</SessionProvider>
    </HighlightErrorBoundary>
  );
}
