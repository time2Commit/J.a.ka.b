"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

/** A settings change: says so when it worked and refreshes what the board shows of it. */
export function useMetaMutation<T>(fn: (input: T) => Promise<unknown>, successMessage?: string) {
  const queryClient = useQueryClient();
  const common = useTranslations("Common");
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (successMessage) toast.success(successMessage);
      // Statuses, labels and people are shown on the cards: refresh those too.
      for (const key of ["meta", "cards", "projects"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? error.message : common("error"),
      ),
  });
}
