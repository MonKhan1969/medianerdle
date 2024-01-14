"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Ably from "ably/promises";
import { AblyProvider, useChannel } from "ably/react";
import { useSession } from "next-auth/react";
import { useCombobox } from "downshift";
import { useAutoAnimate } from "@formkit/auto-animate/react";

import { api } from "@/trpc/react";
import {
  getIsPlayerTurn,
  boardItemSchema,
  GameState,
  type PersonLink,
} from "@/lib/game-state";
import { Input } from "@/app/_components/ui/input";
import { Button, buttonVariants } from "@/app/_components/ui/button";
import { cn } from "@/lib/utils";

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

// FIX: flashes with previous game when starting new game from home page

// FIX: board state disappears when game is ended sometimes

function BattlePage() {
  const [gameState, setGameState] = useState(GameState.Waiting);

  const utils = api.useUtils();

  const room = api.room.join.useQuery(undefined, {
    enabled: gameState === GameState.Waiting,
  });

  useEffect(() => {
    if (gameState === GameState.Waiting && room.data?.isGamePlaying === true) {
      setGameState(GameState.Playing);
    } else if (
      gameState === GameState.Playing &&
      room.data?.isGamePlaying === false
    ) {
      setGameState(GameState.Waiting);
    }
  }, [room.data?.isGamePlaying, room.dataUpdatedAt]);

  const channelParams = {
    channelName: room.data?.code ?? "",
    skip: !room.data?.code,
  };

  useChannel(channelParams, "join", () => {
    console.log("join event");
    setGameState(GameState.Playing);
  });

  useChannel(channelParams, "update", (message) => {
    async function handler() {
      console.log("update event");
      await utils.game.getBoardState.cancel();

      const parsedMessage = boardItemSchema.parse(message.data);

      utils.game.getBoardState.setData(undefined, (oldData) => {
        if (!oldData?.state) return;

        return {
          state: [parsedMessage, ...oldData.state],
        };
      });
    }

    void handler();
  });

  useChannel(channelParams, "end", () => {
    console.log("end event");
    setGameState(GameState.GameOver);
  });

  return (
    <>
      <MenuButtons gameState={gameState} setGameState={setGameState} />
      <PlayerNames gameState={gameState} />
      <PlayerTurn gameState={gameState} />
      <Board gameState={gameState} setGameState={setGameState} />
      {process.env.NODE_ENV === "development" && (
        <>
          <div className="w-full py-28" />
          <DebugPanel gameState={gameState} />
        </>
      )}
    </>
  );
}

function DebugPanel(props: { gameState: GameState }) {
  const room = api.room.join.useQuery(undefined, {
    enabled: props.gameState === GameState.Waiting,
  });

  const players = api.room.getPlayers.useQuery(undefined, {
    enabled: props.gameState === GameState.Playing,
  });

  return (
    <div className="fixed bottom-0 left-0 z-10 w-full bg-slate-200 p-5 font-mono">
      <div>Debug Values:</div>
      <div>
        Room Code: {JSON.stringify(room.data?.code)}{" "}
        {`(updated ${room.dataUpdatedAt % 100000})`}
      </div>
      <div>Is Game Playing?: {JSON.stringify(room.data?.isGamePlaying)}</div>
      <div>Game State: {props.gameState}</div>
      <div>Players: {JSON.stringify(players.data?.ids)}</div>
    </div>
  );
}

function MenuButtons(props: {
  gameState: GameState;
  setGameState: (gameState: GameState) => void;
}) {
  const router = useRouter();

  const quit = api.room.quit.useMutation();

  return (
    <div className="flex justify-between">
      {props.gameState === GameState.GameOver ? (
        <NewGameButton setGameState={props.setGameState} />
      ) : (
        <Button
          onClick={() => {
            quit.mutate();

            const currentGameState = props.gameState;
            props.setGameState(GameState.GameOver);

            if (currentGameState === GameState.Waiting) router.push("/");
          }}
        >
          Quit Game
        </Button>
      )}
      <Button onClick={() => alert("How to Play\nTODO: implement")}>
        Help
      </Button>
    </div>
  );
}

function NewGameButton(props: {
  setGameState: (gameState: GameState) => void;
}) {
  const utils = api.useUtils();

  return (
    <Button
      onClick={() => {
        props.setGameState(GameState.Waiting);
        utils.room.getPlayers.setData(undefined, () => ({ ids: [] }));
      }}
    >
      New Game
    </Button>
  );
}

function PlayerNames(props: { gameState: GameState }) {
  const { data: session } = useSession({ required: true });

  const opponent = api.room.getOpponent.useQuery(undefined, {
    enabled: props.gameState === GameState.Playing,
  });

  if (props.gameState === GameState.Waiting)
    return <div>Waiting for an opponent...</div>;

  return (
    <div className="flex">
      <div className="w-1/3 text-left">{session?.user.name ?? "You"}</div>
      <div className="w-1/3 text-center">vs</div>
      <div className="w-1/3 text-right">
        {opponent.data?.name ?? "Error fetching opponent's username"}
      </div>
    </div>
  );
}

// FIX: flashes from wrong output when coming from home page

function PlayerTurn(props: { gameState: GameState }) {
  const { data: session } = useSession({ required: true });

  const [query, setQuery] = useState("");

  const board = api.game.getBoardState.useQuery(undefined, {
    enabled: props.gameState === GameState.Playing,
  });

  const players = api.room.getPlayers.useQuery(undefined, {
    enabled: props.gameState === GameState.Playing,
  });

  const isPlayerTurn = getIsPlayerTurn(
    players.data?.ids,
    board.data?.state.length,
    session?.user.id,
  );

  const search = api.game.search.useQuery(
    { query },
    {
      enabled: props.gameState === GameState.Playing && isPlayerTurn,
      keepPreviousData: true,
    },
  );

  const submit = api.game.submitAnswer.useMutation({
    onSuccess: () => {
      setQuery("");
      reset();
    },
  });

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
    defaultSelectedItem: null,
    inputValue: query,
    onStateChange: (e) => {
      if (
        e.type === useCombobox.stateChangeTypes.InputKeyDownEnter ||
        e.type === useCombobox.stateChangeTypes.ItemClick
      ) {
        submit.mutate({ answer: search.data?.results[highlightedIndex] });
      }
    },
  });

  return (
    <div
      className={cn(
        props.gameState !== GameState.Playing && "hidden",
        players.data?.ids.length !== 2 && "hidden",
      )}
    >
      <div
        className={cn(
          "rounded-lg bg-green-500 p-3 text-center",
          isPlayerTurn && "hidden",
        )}
      >
        Opponent's Turn
      </div>
      <div className={cn(!isPlayerTurn && "hidden")}>
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
              "absolute z-10 bg-green-200 w-full",
              !isOpen && "hidden",
              !search.data && "hidden",
              search.data?.results.length === 0 && "hidden",
            ),
          })}
        >
          {search.data?.results.map((item, index) => (
            <li
              {...getItemProps({
                item,
                index,
                className: cn(highlightedIndex === index && "bg-blue-200"),
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
  gameState: GameState;
  setGameState: (gameState: GameState) => void;
}) {
  const [animationParent] = useAutoAnimate();

  const board = api.game.getBoardState.useQuery(undefined, {
    enabled: props.gameState === GameState.Playing,
  });

  if (props.gameState === GameState.Waiting) return null;

  return (
    <div className="flex-col" ref={animationParent}>
      <GameOverCard
        gameState={props.gameState}
        setGameState={props.setGameState}
      />
      {board.data?.state.map((item) => (
        <MediaWithLinks key={item.key} label={item.label} links={item.links} />
      ))}
    </div>
  );
}

function GameOverCard(props: {
  gameState: GameState;
  setGameState: (gameState: GameState) => void;
}) {
  if (props.gameState !== GameState.GameOver) return null;
  return (
    <div className="flex-col">
      <div className="flex-col rounded-lg bg-purple-500 p-5 text-center">
        <div>Game Over</div>
        <div>You Won/Lost</div>
        <div className="flex justify-evenly">
          <Link href="/" className={buttonVariants()}>
            Go Home
          </Link>
          <NewGameButton setGameState={props.setGameState} />
        </div>
      </div>

      <div className="mx-auto h-32 w-1 bg-green-500" />
    </div>
  );
}

function MediaWithLinks(props: { label: string; links: PersonLink[] }) {
  if (props.links.length === 0)
    return (
      <div className="w-full rounded-lg bg-red-500 p-5 text-center">
        {props.label}
      </div>
    );

  return (
    <div className="flex-col">
      <div className="w-full rounded-lg bg-red-500 p-5 text-center">
        {props.label}
      </div>
      <div className="mx-auto h-12 w-1 bg-green-500" />
      <PeopleLinks links={props.links} />
      <div className="mx-auto h-12 w-1 bg-green-500" />
    </div>
  );
}

function PeopleLinks(props: { links: PersonLink[] }) {
  const [showMore, setShowMore] = useState(false);

  return (
    <div className="mx-auto w-3/4 max-w-xs rounded-lg bg-blue-500 text-center">
      <ul
        className={cn(
          "max-h-28 flex-col p-3",
          showMore ? "max-h-44 overflow-auto" : "overflow-hidden",
        )}
      >
        {props.links.map((link) => (
          <li key={link.id} className="flex justify-between text-pretty p-1">
            <div>{link.name}</div>
            <div>⭐⭐⭐</div>
          </li>
        ))}
      </ul>
      {!showMore && props.links.length > 3 && (
        <div onClick={() => setShowMore(true)} className="p-1">
          Show more links
        </div>
      )}
    </div>
  );
}
