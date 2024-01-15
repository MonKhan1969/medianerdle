import "@/styles/globals.css";

import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/react";
import { AxiomWebVitals } from "next-axiom";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { HighlightInit } from "@highlight-run/next/client";

import { env } from "@/env";
import { TRPCReactProvider } from "@/trpc/react";
import { getServerAuthSession } from "@/server/auth";
import { buttonVariants } from "@/app/_components/ui/button";
import ClientWrapper from "./client-wrapper";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata = {
  title: "MediaNerdle",
  description: "Cine2Nerdle Battle clone with movies and tv shows",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();

  return (
    <>
      <HighlightInit
        projectId={env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID}
        serviceName="frontend"
        tracingOrigins
        networkRecording={{
          enabled: true,
          recordHeadersAndBody: true,
        }}
      />
      <html lang="en">
        <body className={`font-sans ${inter.variable}`}>
          <TRPCReactProvider cookies={cookies().toString()}>
            <ClientWrapper session={session}>
              <Header />
              <main className="container">{children}</main>
              <TailwindIndicator />
              <Analytics />
              <AxiomWebVitals />
              <SpeedInsights />
            </ClientWrapper>
          </TRPCReactProvider>
        </body>
      </html>
    </>
  );
}

async function Header() {
  const session = await getServerAuthSession();

  return (
    <header className="container flex">
      <Link href="/" className="mr-auto">
        MediaNerdle
      </Link>
      {!!session?.user.name && <div>{session.user.name}</div>}
      <Link
        className={buttonVariants()}
        href={session ? "/api/auth/signout" : "/api/auth/signin"}
      >
        {session ? "Sign Out" : "Sign In"}
      </Link>
    </header>
  );
}

// https://github.com/shadcn-ui/taxonomy/blob/main/components/tailwind-indicator.tsx
function TailwindIndicator() {
  if (env.NODE_ENV === "production") return null;

  return (
    <div className="fixed right-1 top-1 z-50 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 p-3 font-mono text-xs text-white">
      <div className="block sm:hidden">xs</div>
      <div className="hidden sm:block md:hidden lg:hidden xl:hidden 2xl:hidden">
        sm
      </div>
      <div className="hidden md:block lg:hidden xl:hidden 2xl:hidden">md</div>
      <div className="hidden lg:block xl:hidden 2xl:hidden">lg</div>
      <div className="hidden xl:block 2xl:hidden">xl</div>
      <div className="hidden 2xl:block">2xl</div>
    </div>
  );
}
