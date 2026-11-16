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
    // The server ends the stream of somebody whose session is over (signed out elsewhere,
    // password reset, account deactivated) and refuses the reconnection: the browser then gives
    // up (CLOSED). While it is still reconnecting by itself there is nothing to do.
    source.addEventListener("error", () => {
      if (source.readyState !== EventSource.CLOSED) return;
      void fetch("/api/auth/get-session")
        .then((res) => (res.ok ? (res.json() as Promise<unknown>) : undefined))
        .then((session) => {
          if (session === null) window.location.assign("/login");
        })
        .catch(() => {
          // offline: the page stays as it is
        });
    });
    return () => source.close();
  }, [queryClient]);
}
