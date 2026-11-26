// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const fetchReportsForPubkey = vi.fn();
const fetchProfiles = vi.fn();
vi.mock("@/services/nostr", () => ({
  eventStore: { getReplaceable: () => undefined },
  fetchProfiles: (...a: unknown[]) => fetchProfiles(...a),
  fetchReportsForPubkey: (...a: unknown[]) => fetchReportsForPubkey(...a),
  fetchReportsByPubkey: vi.fn(async () => []),
  fetchMuteListTimestamp: vi.fn(async () => null),
}));

import { expandProfileAttempted, expandProfileCache } from "@/services/profilePageCache";
import { useSectionRows } from "./useSectionRows";

const SUBJECT = "5".repeat(64);
const R1 = "1".repeat(64);
const R2 = "2".repeat(64);

beforeEach(() => {
  fetchReportsForPubkey.mockReset();
  fetchProfiles.mockReset();
});

describe("useSectionRows", () => {
  it("asks a report section's reports once per profile and reads each reporter's latest", async () => {
    fetchReportsForPubkey.mockResolvedValue([
      { reporterPubkey: R1, targetPubkey: SUBJECT, reportType: "spam", timestamp: 10 },
      { reporterPubkey: R1, targetPubkey: SUBJECT, reportType: "nudity", timestamp: 20 },
      { reporterPubkey: R2, targetPubkey: SUBJECT, reportType: "other", timestamp: 5 },
    ]);
    const bump = vi.fn();
    const { result } = renderHook(() => useSectionRows(SUBJECT, null, bump));

    await act(() => result.current.fetchSectionMetadata("reported_by"));
    await act(() => result.current.fetchSectionMetadata("reported_by"));
    expect(fetchReportsForPubkey).toHaveBeenCalledTimes(1);
    expect(result.current.reportMetadataLoading.reported_by).toBe(false);
    expect(result.current.getReportForPubkey("reported_by", R1)?.reportType).toBe("nudity");
    expect(result.current.getReportForPubkey("reported_by", R2)?.reportType).toBe("other");
    expect(result.current.getReportForPubkey("muted_by", R1)).toBeUndefined();

    // A new profile asks again.
    act(() => result.current.resetSectionRows());
    await act(() => result.current.fetchSectionMetadata("reported_by"));
    expect(fetchReportsForPubkey).toHaveBeenCalledTimes(2);
  });

  it("fetches the visible batch's profiles, marks them attempted and prefetches the next batch", async () => {
    const pks = Array.from({ length: 15 }, (_, i) => i.toString(16).padStart(64, "c"));
    fetchProfiles.mockImplementation(async (batch: string[], onProfile: (pk: string, p: object) => void) => {
      for (const p of batch) onProfile(p, { name: `n-${p.slice(-2)}` });
    });
    const { result } = renderHook(() => useSectionRows(SUBJECT, null, vi.fn()));
    await act(() => result.current.fetchSectionProfiles("followed_by", pks));

    expect(fetchProfiles).toHaveBeenNthCalledWith(1, pks.slice(0, 10), expect.any(Function));
    expect(fetchProfiles).toHaveBeenNthCalledWith(2, pks.slice(10), expect.any(Function));
    expect(expandProfileCache.get(pks[0])).toEqual({ name: `n-${pks[0].slice(-2)}` });
    expect(expandProfileAttempted.has(pks[9])).toBe(true);
    expect(result.current.prefetchedRef.current.has(pks[12])).toBe(true);
  });
});
