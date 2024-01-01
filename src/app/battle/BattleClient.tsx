"use client";

import * as Ably from "ably";
import { AblyProvider, useChannel } from "ably/react";
import { useEffect, useState } from "react";
import { type UseComboboxStateChangeTypes, useCombobox } from "downshift";
import { useSession } from "next-auth/react";
import { useAutoAnimate } from "@formkit/auto-animate/react";

import { api } from "@/trpc/react";
import {
  gameStateSchema,
  type GameState,
  getIsPlayerTurn,
  // endGameSchema,
} from "@/lib/game-state";
import { useDebounce } from "@/lib/useDebounce";
import { cn } from "@/lib/utils";
import { Media, MediaWithLinks } from "./battle-ui";
import { Input } from "@/app/_components/ui/input";
import { Button } from "@/app/_components/ui/button";

const client = new Ably.Realtime.Promise({
  authUrl: "/api/ably",
});

export default function BattleClient() {
  return (
    <AblyProvider client={client}>
      <BattlePage />
    </AblyProvider>
  );
}

function BattlePage() {
  const [isGameOver, setIsGameOver] = useState(false); // TODO: don't query room code if game is over

  const room = api.room.join.useQuery(undefined, { enabled: !isGameOver });

  const quit = api.room.leave.useMutation();

  const isOpponentPresent = room.data?.gameState.players.length === 2;

  return (
    <>
      {!isGameOver && !isOpponentPresent && (
        <div>Waiting for an opponent...</div>
      )}
      <div>Room Code: {room.data?.roomCode}</div>

      {isGameOver && (
        <div>
          <div>Game Over</div>
          <Button
            onClick={() => {
              setIsGameOver(false);
            }}
          >
            New Game
          </Button>
        </div>
      )}

      {!isGameOver && (
        <Button
          onClick={() => {
            quit.mutate();
          }}
        >
          Quit Game
        </Button>
      )}

      {!!room.data && (
        <Battle
          initialChannelName={room.data.roomCode}
          initialGameState={room.data.gameState}
          isGameOver={isGameOver}
          setIsGameOver={setIsGameOver}
        />
      )}
    </>
  );
}

function Battle({
  initialChannelName,
  initialGameState,
  isGameOver,
  setIsGameOver,
}: {
  initialChannelName: string;
  initialGameState: GameState;
  isGameOver: boolean;
  setIsGameOver: (isGameOver: boolean) => void;
}) {
  const [channelName, setChannelName] = useState(initialChannelName);
  useEffect(() => {
    setChannelName(initialChannelName);
  }, [initialChannelName]);

  const [gameState, setGameState] = useState(initialGameState);
  useEffect(() => {
    setGameState(initialGameState);
  }, [initialGameState]);

  const isOpponentPresent = gameState.players.length === 2;

  const [animationParent] = useAutoAnimate();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query);

  const { data: session } = useSession({ required: true });
  const isPlayerTurn = getIsPlayerTurn(gameState, session?.user.id);

  const opponent = api.room.getOpponent.useQuery(undefined, {
    enabled: !isGameOver,
  });

  const search = api.game.search.useQuery(
    { query: debouncedQuery },
    { enabled: !!debouncedQuery && !isGameOver, keepPreviousData: true },
  );

  const submitAnswer = api.game.submitAnswer.useMutation();

  useChannel(channelName, "update", (message) => {
    console.log("channel update message", message);

    const parsedMessage = gameStateSchema.parse(message.data);
    setGameState(parsedMessage);
  });

  useChannel(channelName, "end-game", (message) => {
    console.log("channel end-game message", message);
    // const parsedMessage = endGameSchema.parse(message.data);
    setIsGameOver(true);
  });

  const {
    isOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    selectedItem,
    selectItem,
  } = useCombobox({
    defaultHighlightedIndex: 0,
    items: search.data?.results ?? [],
    itemToString: (item) => item?.title ?? "",
    inputValue: query,
    onStateChange: (e) => {
      // TODO: answer isn't submitted on enter keypress, need to fix

      if (
        (e.type ===
          ("__input_keydown_enter__" as UseComboboxStateChangeTypes.InputKeyDownEnter) ||
          e.type ===
            ("__item_click__" as UseComboboxStateChangeTypes.ItemClick)) &&
        !!e.selectedItem
      ) {
        console.log("onStateChange", e);
        setQuery("");
        submitAnswer.mutate({ answer: e.selectedItem });
      }
    },
  });

  return (
    <div className={cn(!isOpponentPresent && "hidden")}>
      <div className="flex">
        <div className="w-1/3">{session?.user.name ?? "You"}</div>
        <div className="w-1/3 text-center">vs</div>
        <div className="w-1/3 text-right">
          {opponent.data?.name ?? "Opponent"}
        </div>
      </div>
      {!isGameOver && !isPlayerTurn && <div>Opponent's Turn</div>}

      <form
        onSubmit={(e) => {
          console.log("form onSubmit");
          e.preventDefault();
          setQuery("");
          if (!selectedItem) return;
          submitAnswer.mutate({ answer: selectedItem });
          selectItem(null);
        }}
        className={cn((!isPlayerTurn || isGameOver) && "hidden")}
      >
        <div className="flex">
          <Input
            {...getInputProps({
              type: "text",
              placeholder: "Movie or TV Show",
              value: query,
              onChange: (e) => {
                setQuery(e.currentTarget.value);
              },
            })}
          />
          <Button type="submit">Submit</Button>
        </div>
        <ul
          {...getMenuProps({
            className: cn(
              "absolute z-10 bg-green-100 w-full",
              (!isOpen || !search.data || search.data.results.length === 0) &&
                "hidden",
            ),
          })}
        >
          {isOpen &&
            search.data?.results.map((item, index) => {
              return (
                <li
                  key={item.id}
                  {...getItemProps({
                    item,
                    index,
                    className: cn(highlightedIndex === index && "bg-blue-300"),
                  })}
                >{`${item.title} (${item.year})`}</li>
              );
            })}
        </ul>
      </form>

      <div className="flex-col" ref={animationParent}>
        {gameState.media.map((media) => (
          <MediaWithLinks
            key={media.id}
            title={media.title}
            links={media.links}
          />
        ))}
        <Media title={gameState.initialTitle} />
      </div>
    </div>
  );
}
