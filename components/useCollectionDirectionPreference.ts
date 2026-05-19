"use client";

import { useEffect, useState } from "react";

export type CollectionDirection = "horizontal" | "vertical";

export function useCollectionDirectionPreference(
  collectionId: number,
  initialDirection: CollectionDirection
) {
  const [direction, setDirectionState] = useState<CollectionDirection>(initialDirection);

  useEffect(() => {
    setDirectionState(initialDirection);
  }, [initialDirection]);

  function setDirection(nextDirection: CollectionDirection) {
    setDirectionState(nextDirection);
    void fetch(`/api/collections/${collectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayDirection: nextDirection }),
    });
  }

  return [direction, setDirection] as const;
}
