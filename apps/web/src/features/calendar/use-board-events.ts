"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryRootsFor } from "./board-event-queries";

/** How long to wait before opening the stream again after the server refused it for no reason of the session. */
const RETRY_MS = 5000;

/** What the session route answers for somebody who may keep using the app. */
function canStay(session: unknown) {
  if (typeof session !== "object" || session === null) return false;
  const user = (session as { user?: { deactivatedAt?: unknown; mustChangePassword?: unknown } })
    .user;
  return Boolean(user) && !user?.deactivatedAt && user?.mustChangePassword !== true;
}

/** Subscribes to the server-sent board events and refreshes the cached data a change can affect. */
export function useBoardEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      const stream = new EventSource("/api/events");
      source = stream;
      stream.addEventListener("board", (event) => {
        for (const root of queryRootsFor((event as MessageEvent<string>).data)) {
          void queryClient.invalidateQueries({ queryKey: [root] });
        }
      });
      // While the browser reconnects by itself there is nothing to do. It gives up (CLOSED) when
      // the server refuses the stream: because the session is over (signed out elsewhere,
      // password reset, account deactivated), or because the server could not tell.
      stream.addEventListener("error", () => {
        if (stream.readyState !== EventSource.CLOSED || stopped) return;
        void fetch("/api/auth/get-session")
          .then(async (res) => {
            if (res.ok && !canStay(await res.json())) window.location.assign("/login");
            else retry = setTimeout(open, RETRY_MS);
          })
          .catch(() => {
            // offline: try again later, the page stays as it is
            retry = setTimeout(open, RETRY_MS);
          });
      });
    };
    open();

    return () => {
      stopped = true;
      clearTimeout(retry);
      source?.close();
    };
  }, [queryClient]);
}
