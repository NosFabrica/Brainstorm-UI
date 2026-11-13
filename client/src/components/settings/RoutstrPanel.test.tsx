/**
 * The Routstr tile's flow as a reader sees it, with the relays and every node mocked: the
 * node list from the live announcements, a node's prices in sats and its Verified mark,
 * a pasted Cashu token refused as a key, a pasted key checked by its balance, the invoice
 * step, and a Routstr key's card with its balance and low-balance warning.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { NostrEvent } from "nostr-tools";
import announcements from "@/lib/__fixtures__/routstr/announcements.json";
import modelsJson from "@/lib/__fixtures__/routstr/models.json";

const ME = "ab".repeat(32);
vi.mock("@/accounts/signing", () => ({ activeAccount: () => ({ pubkey: ME }) }));
vi.mock("@/lib/relayRequest", () => ({ requestAll: vi.fn(async () => announcements as NostrEvent[]) }));
const updateAgentKeys = vi.fn();
vi.mock("@/services/agentKeys", () => ({
  updateAgentKeys: (...a: unknown[]) => updateAgentKeys(...a),
  agentKeysHold: async () => true,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

import { RoutstrKeyExtras, RoutstrPanel } from "./RoutstrPanel";
import { resetRoutstrCaches } from "@/services/routstr";

/** 2026-11-13, the day the announcements were read. */
const NOW_MS = 1794528000_000;
const OTRTA = "https://routstr.otrta.me";
// routstr.otrta.me's own /v1/info, 2026-11-13: its npub is the key that announced it.
const OTRTA_INFO = {
  name: "thefux",
  description: "Thefux Provider",
  version: "0.5.1+gd980acc",
  npub: "npub18kpn83drge7x9vz4cuhh7xta79sl4tfq55se4e554yj90s8y3f7qa49nps",
  mints: ["https://mint.minibits.cash/Bitcoin"],
  http_url: OTRTA,
  onion_url: "zdnt2juw6htljsu25ftnbvdicgvr4s3ts4ldlx2myjcuyz4woaf4l7id.onion",
};
const KEY = `sk-${"d".repeat(64)}`;
const TOKEN = "cashuBo2FteBpodHRwczovL21pbnQuZXhhbXBsZQ";
const CHANGE = "cashuBchangechangechangechange";

let balanceMsats = 12_000_000;
const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = String(input);
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (url === `${OTRTA}/v1/info`) return ok(OTRTA_INFO);
  if (url === `${OTRTA}/v1/models`) return ok(modelsJson);
  if (url === `${OTRTA}/v1/balance/info`) {
    const auth = (init.headers as Record<string, string>)?.Authorization;
    if (auth !== `Bearer ${KEY}`) {
      return new Response(JSON.stringify({ error: { code: "key_not_found", message: "Key not found" } }), {
        status: 401,
      });
    }
    return ok({ balance: balanceMsats, reserved: 0 });
  }
  if (url === `${OTRTA}/v2/lightning/invoice`) {
    return ok({
      invoice_id: "inv_1",
      bolt11: "lnbc50u1pfake",
      amount_sats: 5000,
      expires_at: Math.floor(Date.now() / 1000) + 600,
      payment_hash: "ff",
    });
  }
  if (url === `${OTRTA}/v1/balance/create`) {
    return ok({ api_key: KEY, balance: 1_000_000, change_token: CHANGE, change_amount: 2, change_unit: "sat" });
  }
  if (url.includes("/v2/lightning/invoice/inv_1/status")) {
    return ok({ status: "pending", amount_sats: 5000, created_at: 0, expires_at: 0 });
  }
  return new Response("{}", { status: 404 });
});

beforeEach(() => {
  vi.useFakeTimers({ now: NOW_MS, toFake: ["Date"] });
  localStorage.clear();
  resetRoutstrCaches();
  balanceMsats = 12_000_000;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function panel(onSave = vi.fn().mockResolvedValue(true)) {
  render(<RoutstrPanel busy={false} onSave={onSave} onChange={vi.fn()} onBought={vi.fn()} />);
  return onSave;
}

async function openNode(name = "thefux") {
  const rows = await screen.findAllByTestId("routstr-node");
  const row = rows.find((r) => r.textContent?.includes(name));
  expect(row).toBeTruthy();
  fireEvent.click(row!);
  await screen.findByTestId("routstr-node-detail");
}

describe("RoutstrPanel", () => {
  it("lists only this week's nodes a browser can call, fresh first, and the rest behind a button", async () => {
    panel();
    const rows = await screen.findAllByTestId("routstr-node");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("thefux")]);
    expect(rows[0].textContent).toContain("routstr.otrta.me");
    expect(rows[0].textContent).toContain("onion");
    expect(rows[0].textContent).toContain("3 mints");
    fireEvent.click(screen.getByTestId("routstr-show-stale"));
    const all = screen.getAllByTestId("routstr-node");
    expect(all.length).toBe(52);
    // Never an onion-only, fips or IP-literal node.
    expect(all.some((r) => /\.onion|\.fips|140\.245/.test(r.textContent ?? ""))).toBe(false);
    fireEvent.change(screen.getByTestId("routstr-search"), { target: { value: "brrr" } });
    expect(screen.getAllByTestId("routstr-node")).toHaveLength(1);
    // Listing contacted no node.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a node's text models in sats per edition, and Verified when its npub announced it", async () => {
    panel();
    await openNode();
    expect(await screen.findByTestId("routstr-verified")).toBeTruthy();
    const models = await screen.findAllByTestId("routstr-model");
    const ids = models.map((m) => m.textContent ?? "");
    // The embeddings model isn't offered; the writers are, best first.
    expect(ids.some((t) => t.includes("bge-m3"))).toBe(false);
    expect(ids[0]).toContain("claude-sonnet-5.5");
    expect(within(models[0]).getByTestId("routstr-model-sats").textContent).toMatch(/^≈ [\d,]+ sats$/);
    expect(models[0].textContent).toMatch(/needs 4,307 sats/);
  });

  it("refuses a pasted Cashu token as a key and offers to turn it into one", async () => {
    const onSave = panel();
    await openNode();
    fireEvent.click(screen.getByTestId("routstr-have-key"));
    fireEvent.change(screen.getByTestId("routstr-paste-key"), { target: { value: TOKEN } });
    expect(screen.getByTestId("routstr-paste-cashu").textContent).toMatch(/Cashu token, not a key/);
    expect(screen.getByTestId("routstr-paste-save")).toBeDisabled();
    // The token was never sent anywhere as a Bearer.
    expect(fetchMock.mock.calls.some(([, init]) => JSON.stringify(init ?? {}).includes(TOKEN))).toBe(false);
    fireEvent.click(screen.getByTestId("routstr-paste-convert"));
    expect((screen.getByTestId("routstr-cashu-token") as HTMLTextAreaElement).value).toBe(TOKEN);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("checks a pasted key by its balance before Save", async () => {
    const onSave = panel();
    await openNode();
    fireEvent.click(screen.getByTestId("routstr-have-key"));
    fireEvent.change(screen.getByTestId("routstr-paste-key"), { target: { value: "sk-wrongwrongwrongwrong" } });
    await waitFor(() => expect(screen.getByTestId("routstr-paste-result").textContent).toMatch(/isn't on this node/), {
      timeout: 3000,
    });
    expect(screen.getByTestId("routstr-paste-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("routstr-paste-key"), { target: { value: KEY } });
    await waitFor(() => expect(screen.getByTestId("routstr-paste-result").textContent).toBe("Works · 12,000 sats"), {
      timeout: 3000,
    });
    fireEvent.click(screen.getByTestId("routstr-paste-save"));
    expect(onSave).toHaveBeenCalledWith({ key: KEY, url: `${OTRTA}/v1` });
  });

  it("makes an invoice kept on this device, then shows it with a QR, Copy and a lightning: link", async () => {
    panel();
    await openNode();
    fireEvent.click(screen.getByTestId("routstr-get-key"));
    fireEvent.click(screen.getByTestId("routstr-amount-5000"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("routstr-make-invoice"));
    });
    await screen.findByTestId("routstr-invoice");
    expect(localStorage.getItem(`routstr:pending:${ME}`)).toContain("lnbc50u1pfake");
    expect(screen.getByTestId("routstr-qr")).toBeTruthy();
    expect(screen.getByTestId("routstr-open-wallet").getAttribute("href")).toBe("lightning:lnbc50u1pfake");
    expect(screen.getByTestId("routstr-copy-invoice")).toBeTruthy();
    expect(screen.getByTestId("routstr-invoice-status").textContent).toMatch(/Waiting for payment/);
    const body = JSON.parse(
      fetchMock.mock.calls.find(([u]) => String(u).endsWith("/v2/lightning/invoice"))![1]!.body as string,
    );
    expect(body).toEqual({ amount_sats: 5000, purpose: "create" });
  });
});

describe("Cashu change in the buy step (round-2 audit)", () => {
  it('"I\'ve put it in my wallet" lets the change go from this device too', async () => {
    updateAgentKeys.mockResolvedValue({ success: true });
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => {}) } });
    vi.stubGlobal("isSecureContext", true);
    panel();
    await openNode();
    fireEvent.click(screen.getByTestId("routstr-get-key"));
    fireEvent.click(screen.getByTestId("routstr-method-cashu"));
    fireEvent.change(screen.getByTestId("routstr-cashu-token"), { target: { value: TOKEN } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("routstr-redeem"));
    });
    await screen.findByTestId("routstr-change");
    expect(localStorage.getItem(`routstr:pending:${ME}`)).toContain(CHANGE);
    await act(async () => {
      fireEvent.click(screen.getByTestId("routstr-change-copy"));
    });
    await waitFor(() => expect(screen.getByTestId("routstr-change-taken")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("routstr-change-taken"));
    expect(localStorage.getItem(`routstr:pending:${ME}`) ?? "").not.toContain(CHANGE);
  });
});

describe("RoutstrKeyExtras", () => {
  it("shows a Routstr key's balance in sats with Top up", async () => {
    render(<RoutstrKeyExtras entry={{ key: KEY, url: `${OTRTA}/v1` }} />);
    expect(await screen.findByText("12,000 sats")).toBeTruthy();
    expect(screen.getByTestId("routstr-top-up")).toBeTruthy();
    expect(screen.queryByTestId("routstr-low-balance")).toBeNull();
  });

  it("warns when the balance is under the model's max_cost", async () => {
    balanceMsats = 1_000_000;
    render(<RoutstrKeyExtras entry={{ key: KEY, url: `${OTRTA}/v1` }} />);
    const warning = await screen.findByTestId("routstr-low-balance");
    expect(warning.textContent).toMatch(/Too low for a paper with claude-sonnet-5\.5: top up 3,307 sats/);
  });

  it("says nothing for a key that isn't a Routstr node's, and asks no one", async () => {
    const { container } = render(
      <RoutstrKeyExtras entry={{ key: "sk-or-v1-x", url: "https://openrouter.ai/api/v1" }} />,
    );
    await act(async () => {});
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
