import dynamic from "next/dynamic";

const BattleClient = dynamic(() => import("./battle-client"), {
  ssr: false,
});

export default function BattlePage() {
  return <BattleClient />;
}
