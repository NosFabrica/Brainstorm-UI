/**
 * The OpenRouter callback hands the key it traded for to the AI model view, for the
 * account that is signed in, and only if the user is still there to receive it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const complete = vi.fn();
const navigate = vi.fn();
vi.mock("@/services/openRouterOAuth", () => ({ completeOpenRouterConnect: (...a: unknown[]) => complete(...a) }));
vi.mock("@/accounts/signing", () => ({ activeAccount: () => ({ pubkey: "aa".repeat(32) }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/settings/openrouter", navigate] }));

import { clearHandoff, peekHandoff } from "@/lib/openRouterOAuth";
import OpenRouterCallbackPage from "./OpenRouterCallbackPage";

beforeEach(() => {
  vi.clearAllMocks();
  clearHandoff();
});
afterEach(() => clearHandoff());

describe("OpenRouterCallbackPage", () => {
  it("hands the key to the signed-in account and goes to the AI model view", async () => {
    complete.mockResolvedValue({ key: "sk-or-v1-x" });
    render(<OpenRouterCallbackPage />);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    expect(peekHandoff("aa".repeat(32))).toEqual({ key: "sk-or-v1-x" });
  });

  it("keeps nothing when the user left before the exchange finished", async () => {
    let settle: (v: unknown) => void = () => {};
    complete.mockReturnValue(new Promise((r) => (settle = r)));
    const view = render(<OpenRouterCallbackPage />);
    view.unmount();
    settle({ key: "sk-or-v1-late" });
    await new Promise((r) => setTimeout(r, 0));
    expect(peekHandoff("aa".repeat(32))).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});
