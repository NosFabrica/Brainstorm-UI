/**
 * What an expanded connection list on the analytics profile needs beyond its
 * rows: the people's kind-0 profiles (from the store, else asked in batches of
 * ten with the next ten prefetched), and for the report and mute sections the
 * reports and mute-list times behind each row. Both land in the module caches
 * of services/profilePageCache; `bumpRerender` repaints the panels as they do.
 */
import { useCallback, useRef, useState } from "react";
import { getProfileContent, isValidProfile } from "applesauce-core/helpers/profile";
import {
  eventStore,
  fetchMuteListTimestamp,
  fetchProfiles,
  fetchReportsByPubkey,
  fetchReportsForPubkey,
  type ReportMetadata,
} from "@/services/nostr";
import { toPubkeys } from "@/services/graphHelpers";
import {
  expandProfileAttempted,
  expandProfileCache,
  muteMetadataCache,
  reportMetadataCache,
} from "@/services/profilePageCache";
import { getSection, type ProfileResultData } from "./connectionModel";

export function useSectionRows(hexPubkey: string, profileResult: ProfileResultData | null, bumpRerender: () => void) {
  const [reportMetadataLoading, setReportMetadataLoading] = useState<Record<string, boolean>>({});
  const fetchAbortRef = useRef<number>(0);
  const prefetchedRef = useRef<Set<string>>(new Set());
  const metadataFetchedRef = useRef<Set<string>>(new Set());

  const fetchSectionProfiles = useCallback(
    async (key: string, pubkeys: string[], startIdx = 0, count = 10) => {
      const fetchId = ++fetchAbortRef.current;
      const toFetch = pubkeys.slice(startIdx, startIdx + count).filter((pk) => !expandProfileCache.has(pk));
      if (toFetch.length === 0) return;
      const missingProfiles: string[] = [];
      for (const pk of toFetch) {
        const event = eventStore.getReplaceable(0, pk);
        if (event) {
          if (isValidProfile(event)) expandProfileCache.set(pk, getProfileContent(event));
        } else {
          missingProfiles.push(pk);
        }
      }
      if (fetchAbortRef.current !== fetchId) return;
      if (missingProfiles.length > 0) {
        bumpRerender();
      }
      await Promise.allSettled([
        ...(missingProfiles.length > 0
          ? [
              fetchProfiles(missingProfiles, (pubkey, profile) => {
                expandProfileCache.set(pubkey, profile);
                bumpRerender();
              }),
            ]
          : []),
      ]);
      if (fetchAbortRef.current !== fetchId) return;
      // Every pubkey in this batch has now had a fetch attempt (eventStore hit or
      // a settled relay request). Mark them so rows with no resolvable kind-0
      // profile fall back to the npub instead of a skeleton forever.
      toFetch.forEach((pk) => expandProfileAttempted.set(pk, true));
      bumpRerender();
      const nextStart = startIdx + count;
      if (nextStart < pubkeys.length) {
        const nextBatch = pubkeys
          .slice(nextStart, nextStart + count)
          .filter((pk) => !expandProfileCache.has(pk) && !eventStore.getReplaceable(0, pk));
        if (nextBatch.length > 0) {
          nextBatch.forEach((pk) => prefetchedRef.current.add(pk));
          void fetchProfiles(nextBatch, (pubkey, profile) => {
            expandProfileCache.set(pubkey, profile);
          });
        }
      }
    },
    [bumpRerender],
  );

  const fetchSectionMetadata = useCallback(
    async (sectionKey: string, extraPubkeys?: string[]) => {
      if (!hexPubkey) return;
      const cacheKey = `${sectionKey}:${hexPubkey}`;

      if (sectionKey === "reported_by" || sectionKey === "reporting") {
        if (metadataFetchedRef.current.has(cacheKey)) return;
        metadataFetchedRef.current.add(cacheKey);
      }

      if (sectionKey === "muting") {
        if (muteMetadataCache.has(hexPubkey)) return;
      }

      setReportMetadataLoading((prev) => ({ ...prev, [sectionKey]: true }));

      try {
        if (sectionKey === "reported_by") {
          const reports = await fetchReportsForPubkey(hexPubkey);
          reportMetadataCache.set(cacheKey, reports);
        } else if (sectionKey === "reporting") {
          const reports = await fetchReportsByPubkey(hexPubkey);
          reportMetadataCache.set(cacheKey, reports);
        } else if (sectionKey === "muted_by") {
          const pubkeysToFetch = extraPubkeys || toPubkeys(getSection(profileResult, sectionKey)).slice(0, 50);
          const unfetched = pubkeysToFetch.filter((pk) => !muteMetadataCache.has(pk));
          if (unfetched.length > 0) {
            const results = await Promise.allSettled(unfetched.map((pk) => fetchMuteListTimestamp(pk)));
            for (const r of results) {
              if (r.status === "fulfilled" && r.value) {
                muteMetadataCache.set(r.value.muterPubkey, r.value);
              }
            }
          }
        } else if (sectionKey === "muting") {
          const result = await fetchMuteListTimestamp(hexPubkey);
          if (result) {
            muteMetadataCache.set(hexPubkey, result);
          }
        }
      } catch {}

      setReportMetadataLoading((prev) => ({ ...prev, [sectionKey]: false }));
      bumpRerender();
    },
    [hexPubkey, profileResult, bumpRerender],
  );

  const getReportForPubkey = useCallback(
    (sectionKey: string, pubkey: string): ReportMetadata | undefined => {
      const cacheKey = `${sectionKey}:${hexPubkey}`;
      const reports = reportMetadataCache.get(cacheKey);
      if (!reports) return undefined;
      const matching =
        sectionKey === "reported_by"
          ? reports.filter((r) => r.reporterPubkey === pubkey)
          : sectionKey === "reporting"
            ? reports.filter((r) => r.targetPubkey === pubkey)
            : [];
      if (matching.length === 0) return undefined;
      return matching.reduce((latest, r) => (r.timestamp > latest.timestamp ? r : latest), matching[0]);
    },
    [hexPubkey],
  );

  /** A new profile: forget which sections' metadata was asked and which profiles were prefetched. */
  const resetSectionRows = useCallback(() => {
    setReportMetadataLoading({});
    metadataFetchedRef.current.clear();
    prefetchedRef.current.clear();
  }, []);

  return {
    reportMetadataLoading,
    prefetchedRef,
    fetchSectionProfiles,
    fetchSectionMetadata,
    getReportForPubkey,
    resetSectionRows,
  };
}
