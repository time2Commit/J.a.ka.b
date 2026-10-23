"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryRootsFor } from "./board-event-queries";

/** Subscribes to the server-sent board events and refreshes the cached data a change can affect. */
export function useBoardEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("board", (event) => {
      for (const root of queryRootsFor((event as MessageEvent<string>).data)) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    });
    return () => source.close();
  }, [queryClient]);
}
