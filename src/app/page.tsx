import Link from "next/link";
import { buttonVariants } from "@/app/_components/ui/button";

export default async function Home() {
  return (
    <main>
      <Link className={buttonVariants()} href="/battle">
        Find Battle
      </Link>
    </main>
  );
}
