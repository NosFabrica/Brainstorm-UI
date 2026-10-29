import { useQueries } from "@tanstack/react-query";
import type { GitHubEvidence } from "@/lib/githubLink";
import { fetchGitHubEvidence } from "@/services/github";

/**
 * What GitHub says about who owns each account (services/github, lib/githubLink), by lowercased
 * handle; an account not yet answered is absent. An HTTP read, so react-query (ADR 0005); asked
 * once per handle a visit.
 */
export function useGitHubEvidence(handles: readonly string[]): Map<string, GitHubEvidence> {
  const results = useQueries({
    queries: handles.map((handle) => ({
      queryKey: ["github-evidence", handle.toLowerCase()],
      queryFn: () => fetchGitHubEvidence(handle),
      staleTime: Infinity,
      retry: false,
    })),
  });
  const out = new Map<string, GitHubEvidence>();
  handles.forEach((handle, i) => {
    const data = results[i]?.data;
    if (data) out.set(handle.toLowerCase(), data);
  });
  return out;
}
