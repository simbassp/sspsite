import { GameSessionPage } from "@/components/game/GameSessionPage";
import { isGameModeId } from "@/lib/game-modes";
import { redirect } from "next/navigation";

type GameModePageProps = {
  params: Promise<{ modeId: string }>;
};

export default async function GameModePage({ params }: GameModePageProps) {
  const { modeId } = await params;
  if (!isGameModeId(modeId)) {
    redirect("/game");
  }
  return <GameSessionPage modeId={modeId} />;
}
