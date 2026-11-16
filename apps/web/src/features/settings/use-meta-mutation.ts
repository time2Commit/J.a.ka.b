"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";

/** Statuses, labels and people are shown on the cards: a settings change refreshes those too. */
export function useRefreshSettingsData() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["meta", "cards", "projects"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** A settings change: says so when it worked and refreshes what the board shows of it. */
export function useMetaMutation<T>(fn: (input: T) => Promise<unknown>, successMessage?: string) {
  const refresh = useRefreshSettingsData();
  const common = useTranslations("Common");
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (successMessage) toast.success(successMessage);
      refresh();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? error.message : common("error"),
      ),
  });
}
