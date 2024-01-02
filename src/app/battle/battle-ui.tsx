"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { type PersonLink } from "@/lib/game-state";

export function MediaWithLinks(props: { label: string; links: PersonLink[] }) {
  return (
    <div className="flex-col">
      <Media label={props.label} />
      <div className="mx-auto h-12 w-1 bg-green-500" />
      <PeopleLinks links={props.links} />
      <div className="mx-auto h-12 w-1 bg-green-500" />
    </div>
  );
}

export function Media(props: { label: string }) {
  return (
    <div className="w-full rounded-lg bg-red-500 p-5 text-center">
      {props.label}
    </div>
  );
}

export function PeopleLinks(props: { links: PersonLink[] }) {
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
