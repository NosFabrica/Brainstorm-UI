/**
 * Does the user have Trusted Lists their 10040 doesn't point to? The lists are
 * published by their Brainstorm assistant; the server's /setup "30392" row says
 * which key and relay. Found there and not named in the 10040 → the user is
 * asked to publish their Treasure Map again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSetupRows = vi.fn<(pk: string) => Promise<string[][]>>();
vi.mock("./api", () => ({ apiClient: { getSetupRows: (pk: string) => getSetupRows(pk) } }));
const fetchTrustProviderList = vi.fn(async (): Promise<{ tags: string[][] } | undefined> => undefined);
vi.mock("./nostr", () => ({
  fetchTrustProviderList: () => fetchTrustProviderList(),
  getNip85RelayUrl: () => "wss://nip85.example",
}));
const requestAll = vi.fn(async (..._a: unknown[]): Promise<Array<{ kind: number; tags: string[][] }>> => []);
vi.mock("@/lib/relayRequest", () => ({ requestAll: (...a: unknown[]) => requestAll(...a) }));

import { checkUserLists, listsToName } from "./trustLists";
import { listRows } from "@/lib/nip85Declaration";
import { queryClient } from "@/lib/queryClient";

const ME = "a".repeat(64);
const TA = "b".repeat(64);
const LIST_KEY = "c".repeat(64);
const LIST_RELAY = "wss://nip85-staging.example";
const list = (tags: string[][] = [["d", "tl-tag-x"]]) => ({ kind: 30392, tags });

describe("checkUserLists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSetupRows.mockResolvedValue([["30382:rank", TA, "wss://nip85.example"], ["30392", LIST_KEY, LIST_RELAY]]);
    fetchTrustProviderList.mockResolvedValue({ tags: [["30382:rank", TA, "wss://nip85.example"]] });
    requestAll.mockResolvedValue([]);
  });

  it("finds the lists where /setup says, and calls them missing when the 10040 doesn't name them", async () => {
    requestAll.mockResolvedValue([list()]);

    const res = await checkUserLists(ME, TA);

    expect(res).toEqual({ status: "missing", designation: { key: LIST_KEY, relay: LIST_RELAY } });
    expect(requestAll).toHaveBeenCalledWith(
      [LIST_RELAY],
      expect.objectContaining({ kinds: [30392, 30393, 30394], authors: [LIST_KEY] }),
      expect.any(Number),
    );
  });

  it("with no lists on the relay, there's nothing to add", async () => {
    expect((await checkUserLists(ME, TA)).status).toBe("none");
  });

  it("lists that were all retracted don't count", async () => {
    requestAll.mockResolvedValue([list([["d", "tl-tag-x"], ["status", "retracted"]])]);
    expect((await checkUserLists(ME, TA)).status).toBe("none");
  });

  it("a 10040 that already names them is declared", async () => {
    fetchTrustProviderList.mockResolvedValue({ tags: [["30382:rank", TA, "wss://nip85.example"], ...listRows({ key: LIST_KEY, relay: LIST_RELAY })] });
    expect((await checkUserLists(ME, TA)).status).toBe("declared");
  });

  it("without a 30392 row, looks for the user's own assistant on the NIP-85 relay", async () => {
    getSetupRows.mockResolvedValue([["30382:rank", TA, "wss://nip85.example"]]);
    requestAll.mockResolvedValue([list()]);

    const res = await checkUserLists(ME, TA);

    expect(res.designation).toEqual({ key: TA, relay: "wss://nip85.example" });
    expect(requestAll.mock.calls[0][0]).toEqual(["wss://nip85.example"]);
  });
});

/**
 * What a 10040 about to be signed should say about lists. Every activation
 * surface asks this — the dashboard modal used to skip it and cost people a
 * second signature.
 */
describe("listsToName", () => {
  const DESIGNATION = { key: LIST_KEY, relay: LIST_RELAY };

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    getSetupRows.mockResolvedValue([["30382:rank", TA, "wss://nip85.example"], ["30392", LIST_KEY, LIST_RELAY]]);
    fetchTrustProviderList.mockResolvedValue({ tags: [["30382:rank", TA, "wss://nip85.example"]] });
    requestAll.mockResolvedValue([list()]);
  });

  it("names the lists the user has", async () => {
    expect(await listsToName(ME, TA)).toEqual(DESIGNATION);
  });

  it("answers from what the app already knows, without asking the relays again", async () => {
    queryClient.setQueryData(["trust-lists-status", ME, TA], { status: "missing", designation: DESIGNATION });

    expect(await listsToName(ME, TA)).toEqual(DESIGNATION);
    expect(getSetupRows).not.toHaveBeenCalled();
    expect(requestAll).not.toHaveBeenCalled();
  });

  it("names nothing when the 10040 already says it, or there are no lists", async () => {
    queryClient.setQueryData(["trust-lists-status", ME, TA], { status: "declared", designation: DESIGNATION });
    expect(await listsToName(ME, TA)).toBeNull();

    queryClient.setQueryData(["trust-lists-status", ME, TA], { status: "none", designation: null });
    expect(await listsToName(ME, TA)).toBeNull();
  });

  it("never fails the publish it's preparing", async () => {
    queryClient.clear();
    getSetupRows.mockRejectedValue(new Error("server down"));
    fetchTrustProviderList.mockRejectedValue(new Error("relays down"));

    expect(await listsToName(ME, TA)).toBeNull();
  });
});
