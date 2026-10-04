"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Subscribes to the server-sent board events and refreshes the cached data on every change. */
export function useBoardEvents() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource("/api/events");
    source.addEventListener("board", () => {
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      void queryClient.invalidateQueries({ queryKey: ["meta"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    });
    return () => source.close();
  }, [queryClient]);
}
