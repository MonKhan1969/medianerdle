import dynamic from "next/dynamic";

const BattleClient = dynamic(() => import("./BattleClient"), {
  ssr: false,
});

export default function BattlePage() {
  return <BattleClient />;
}
