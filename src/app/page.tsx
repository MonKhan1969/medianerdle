import Link from "next/link";
import { buttonVariants } from "@/app/_components/ui/button";

export default async function Home() {
  return (
    <Link className={buttonVariants()} href="/battle">
      Find Battle
    </Link>
  );
}
