"use client";

import { useState } from "react";
import Link from "next/link";
import * as Ably from "ably";
import { AblyProvider, useChannel } from "ably/react";
import { useSession } from "next-auth/react";
import { type UseComboboxStateChangeTypes, useCombobox } from "downshift";
import { useAutoAnimate } from "@formkit/auto-animate/react";

import { api } from "@/trpc/react";
import {
  gameStateSchema,
  type GameState,
  getIsPlayerTurn,
  // endGameSchema,
} from "@/lib/game-state";
import { Input } from "@/app/_components/ui/input";
import { Button, buttonVariants } from "@/app/_components/ui/button";
import { cn } from "@/lib/utils";
import { Media, MediaWithLinks } from "./battle-ui";

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
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameState, setGameState] = useState<GameState>();

  const { data: session } = useSession({ required: true });

  const room = api.room.join.useQuery(undefined, {
    enabled: !isGameOver,
    onSuccess: (data) => {
      setGameState(data.gameState);
    },
  });

  const opponent = api.room.getOpponent.useQuery(undefined, {
    enabled: !isGameOver,
  });

  const isOpponentPresent = gameState?.players.length === 2;

  const channelParams = {
    channelName: room.data?.roomCode ?? "",
    skip: !room.data?.roomCode,
  };

  useChannel(channelParams, "update", (message) => {
    console.log("channel update message", message);

    const parsedMessage = gameStateSchema.parse(message.data);
    setGameState(parsedMessage);
  });

  useChannel(channelParams, "end-game", (message) => {
    console.log("channel end-game message", message);
    // const parsedMessage = endGameSchema.parse(message.data);
    setIsGameOver(true);
  });

  return (
    <>
      <div>Room Code: {!!room.data ? room.data?.roomCode : "loading..."}</div>
      <MenuButtons isGameOver={isGameOver} setIsGameOver={setIsGameOver} />
      <PlayerNames
        isGameOver={isGameOver}
        isOpponentPresent={isOpponentPresent}
        player={session?.user.name}
        opponent={opponent.data?.name}
      />
      <PlayerTurn
        isGameOver={isGameOver}
        isOpponentPresent={isOpponentPresent}
        isPlayerTurn={getIsPlayerTurn(gameState, session?.user.id)}
      />
      <Board
        gameState={gameState}
        isOpponentPresent={isOpponentPresent}
        isGameOver={isGameOver}
        setIsGameOver={setIsGameOver}
      />
    </>
  );
}

function MenuButtons(props: {
  isGameOver: boolean;
  setIsGameOver: (isGameOver: boolean) => void;
}) {
  const quit = api.room.leave.useMutation();

  return (
    <div className="flex justify-between">
      {props.isGameOver ? (
        <NewGameButton setIsGameOver={props.setIsGameOver} />
      ) : (
        <Button
          onClick={() => {
            quit.mutate();
            props.setIsGameOver(true);
          }}
        >
          Quit Game
        </Button>
      )}
      <Button
        onClick={() => {
          alert("How to Play\nTODO: implement");
        }}
      >
        How to Play
      </Button>
    </div>
  );
}

function NewGameButton(props: {
  setIsGameOver: (isGameOver: boolean) => void;
}) {
  return (
    <Button
      onClick={() => {
        props.setIsGameOver(false);
      }}
    >
      New Game
    </Button>
  );
}

function PlayerNames(props: {
  isGameOver: boolean;
  isOpponentPresent: boolean;
  player: string | null | undefined;
  opponent: string | null | undefined;
}) {
  if (!props.isGameOver && !props.isOpponentPresent)
    return <div>Waiting for an opponent...</div>;

  return (
    <div className="flex">
      <div className="w-1/3">{props.player ?? "You"}</div>
      <div className="w-1/3 text-center">vs</div>
      <div className="w-1/3 text-right">{props.opponent ?? "Opponent"}</div>
    </div>
  );
}

function PlayerTurn(props: {
  isGameOver: boolean;
  isOpponentPresent: boolean;
  isPlayerTurn: boolean;
}) {
  const [query, setQuery] = useState("");

  const search = api.game.search.useQuery(
    { query },
    {
      enabled:
        !props.isGameOver && props.isOpponentPresent && props.isPlayerTurn,
      keepPreviousData: true,
    },
  );

  const submit = api.game.submitAnswer.useMutation();

  const {
    isOpen,
    highlightedIndex,
    getInputProps,
    getMenuProps,
    getItemProps,
    reset,
  } = useCombobox({
    items: search.data?.results ?? [],
    itemToString: (item) => item?.label ?? "",
    defaultHighlightedIndex: 0,
    inputValue: query,
    defaultSelectedItem: null,
    onStateChange: (e) => {
      const InputKeyDownEnter =
        "__input_keydown_enter__" as UseComboboxStateChangeTypes.InputKeyDownEnter;
      const ItemClick =
        "__item_click__" as UseComboboxStateChangeTypes.ItemClick;

      if (e.type === InputKeyDownEnter || e.type === ItemClick) {
        console.log("onStateChange", e);
        submit.mutate({ answer: search.data?.results[highlightedIndex] });
        setQuery("");
        reset();
      }
    },
  });

  return (
    <div
      className={cn((props.isGameOver || !props.isOpponentPresent) && "hidden")}
    >
      <div
        className={cn(
          "rounded-lg bg-green-500 p-3 text-center",
          props.isPlayerTurn && "hidden",
        )}
      >
        Opponent's Turn
      </div>
      <div className={cn(!props.isPlayerTurn && "hidden")}>
        <Input
          {...getInputProps({
            type: "search",
            placeholder: "Movie or TV Show",
            value: query,
            onChange: (e) => {
              setQuery(e.currentTarget.value);
            },
          })}
        />
        <ul
          {...getMenuProps({
            className: cn(
              "absolute z-10 bg-green-100 w-full",
              (!isOpen || !search.data || search.data.results.length === 0) &&
                "hidden",
            ),
          })}
        >
          {search.data?.results.map((item, index) => (
            <li
              {...getItemProps({
                item,
                index,
                className: cn(highlightedIndex === index && "bg-blue-100"),
              })}
              key={item.key}
            >
              {item.mediaType === "tv" ? "📺" : "🎥"} {item.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Board(props: {
  isOpponentPresent: boolean;
  isGameOver: boolean;
  setIsGameOver: (isGameOver: boolean) => void;
  gameState: GameState | undefined;
}) {
  const [animationParent] = useAutoAnimate();

  if (!props.gameState || !props.isOpponentPresent) return null;

  return (
    <div className="flex-col" ref={animationParent}>
      <GameOverCard
        isGameOver={props.isGameOver}
        setIsGameOver={props.setIsGameOver}
      />
      {props.gameState.media.map((media) => (
        <MediaWithLinks
          key={media.key}
          label={media.label}
          links={media.links}
        />
      ))}
      <Media label={props.gameState.initialLabel} />
    </div>
  );
}

function GameOverCard(props: {
  isGameOver: boolean;
  setIsGameOver: (isGameOver: boolean) => void;
}) {
  if (!props.isGameOver) return null;

  return (
    <div className="flex-col">
      <div className="w-full flex-col rounded-lg bg-purple-500 p-5 text-center">
        <div>Game Over</div>
        <div>You Won/Lost</div>
        <div className="flex justify-evenly">
          <Link className={buttonVariants()} href="/">
            Go Home
          </Link>
          <NewGameButton setIsGameOver={props.setIsGameOver} />
        </div>
      </div>
      <div className="mx-auto h-32 w-1 bg-green-500" />
    </div>
  );
}
