import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface ProKeyword {
  id: number;
  keyword: string;
}

/**
 * Mots-clés de campagne (« commente GUIDE ») du compte Instagram affiché.
 * Scopés PAR COMPTE via `accountUsername` (résolution serveur fiable, cf.
 * circle-stats). L'extension récupère cette liste et matche les commentaires
 * EN LOCAL.
 */
export function useProKeywords(accountUsername?: string) {
  return useQuery<ProKeyword[]>({
    queryKey: ["pro-keywords", accountUsername || ""],
    queryFn: async () => {
      const qs = accountUsername ? `?accountUsername=${encodeURIComponent(accountUsername)}` : "";
      const res = await fetch(`/api/extension/pro-keywords${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch keywords");
      const data = await res.json();
      return Array.isArray(data.keywords) ? data.keywords : [];
    },
    staleTime: 30_000,
  });
}

/** Ajoute un mot-clé au compte affiché. Renvoie la liste à jour. */
export function useAddProKeyword(accountUsername?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (keyword: string) => {
      const res = await fetch(`/api/extension/pro-keywords`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keyword, accountUsername }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to add keyword");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pro-keywords", accountUsername || ""] });
    },
  });
}

/** Supprime un mot-clé du compte affiché. */
export function useDeleteProKeyword(accountUsername?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const qs = accountUsername ? `?accountUsername=${encodeURIComponent(accountUsername)}` : "";
      const res = await fetch(`/api/extension/pro-keywords/${id}${qs}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to delete keyword");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pro-keywords", accountUsername || ""] });
    },
  });
}
