import { useQuery } from "@tanstack/react-query";
import { fetchGitHubAccount, type GitHubAccountFacts } from "@/services/github";

/**
 * What our origin knows about a GitHub account (services/github), for the
 * account's own page only: an HTTP read, so react-query (ADR 0005). Asked
 * once per handle; GitHub's answer doesn't change within a visit.
 */
export function useGitHubAccount(handle: string | null) {
  return useQuery<GitHubAccountFacts | null>({
    queryKey: ["github-account", handle?.toLowerCase() ?? ""],
    queryFn: () => fetchGitHubAccount(handle!),
    enabled: !!handle,
    staleTime: Infinity,
    retry: false,
  });
}
