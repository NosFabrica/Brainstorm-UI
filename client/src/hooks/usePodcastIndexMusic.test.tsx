// @vitest-environment jsdom
/**
 * The Music tab's view of the V4V lists: nothing while it is not the Music
 * tab, loading then the lists once it is.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const song = { id: "podcastindex:s1", eventId: "s1", title: "Step Into the Light", artist: "Torcon 7", audio: "https://mp3s.podcastindex.org/x.mp3", source: "podcastindex" as const };
const fetchMock = vi.fn(async () => ({ songs: [song], musicians: [] }));
vi.mock("@/services/dlists", () => ({ fetchPodcastIndexMusic: () => fetchMock() }));

import { usePodcastIndexMusic } from "./usePodcastIndexMusic";

beforeEach(() => vi.clearAllMocks());

describe("usePodcastIndexMusic", () => {
  it("does nothing while disabled", () => {
    const { result } = renderHook(() => usePodcastIndexMusic(false));
    expect(result.current).toEqual({ songs: [], musicians: [], loading: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads the two lists when enabled — loading first, then the answer", async () => {
    const { result } = renderHook(() => usePodcastIndexMusic(true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.songs).toEqual([song]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an empty answer settles empty", async () => {
    fetchMock.mockResolvedValueOnce({ songs: [], musicians: [] });
    const { result } = renderHook(() => usePodcastIndexMusic(true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.songs).toEqual([]);
  });
});
