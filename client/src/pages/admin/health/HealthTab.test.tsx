// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { HealthTab, type HealthEndpoints } from "./HealthTab";
import type { RelayLatencyState } from "./useRelayLatency";

const relays = {
  relayLatencies: [],
  relayCheckRunning: false,
  runRelayCheck: () => {},
} as unknown as RelayLatencyState;
const idle = { isSuccess: false, isLoading: false, isError: false };
const ok = { isSuccess: true, isLoading: false, isError: false };
const failed = { isSuccess: false, isLoading: false, isError: true };
const loading = { isSuccess: false, isLoading: true, isError: false };

const row = (name: string) => screen.getByTestId(`health-ep-${name.replace(/[/*]/g, "-")}`);

afterEach(cleanup);

describe("HealthTab's API rows", () => {
  it("call an endpoint healthy only once a fetch of it has succeeded", () => {
    const endpoints: HealthEndpoints = { grapeRank: ok, users: failed, activity: idle };
    render(<HealthTab endpoints={endpoints} relays={relays} />);
    expect(row("/user/graperankResult")).toHaveTextContent("Healthy");
    expect(row("/admin/users")).toHaveTextContent("Error");
    // Never fetched (the Activity tab's log only runs on that tab): not known yet.
    expect(row("/admin/activity")).not.toHaveTextContent("Healthy");
    expect(row("/admin/activity")).toHaveTextContent("Unknown");
  });

  it("say checking while the first fetch is out", () => {
    render(<HealthTab endpoints={{ grapeRank: loading, users: loading, activity: loading }} relays={relays} />);
    expect(row("/admin/activity")).toHaveTextContent("Checking");
    expect(row("/admin/users")).toHaveTextContent("Checking");
  });

  it("don't call an endpoint that was never asked an error", () => {
    render(<HealthTab endpoints={{ grapeRank: idle, users: idle, activity: ok }} relays={relays} />);
    expect(row("/admin/users")).toHaveTextContent("Unknown");
    expect(row("/admin/activity")).toHaveTextContent("Healthy");
  });
});
