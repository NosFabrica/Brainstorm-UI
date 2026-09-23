import { ReactElement, ReactNode } from "react";
import { afterEach } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * A setter for the process timezone, restored after each test in the enclosing
 * describe. Node re-reads `process.env.TZ` on every Date operation, so a call
 * takes effect immediately.
 *
 * Restoring has to DELETE an originally-unset zone: assigning `undefined` back
 * stores the string "undefined", which Node resolves to UTC and would silently
 * pin the rest of the run.
 */
export function timeZoneSetter(): (tz: string) => void {
  const original = process.env.TZ;
  afterEach(() => {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  });
  return (tz: string) => {
    process.env.TZ = tz;
  };
}

/**
 * Render a component with a fresh React Query client (retry off) per test.
 * The providers go in as a `wrapper`, so the returned `rerender` keeps them —
 * and keeps the same client — across re-renders.
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), queryClient };
}

/**
 * The same provider, for `renderHook`. The client is created once per call —
 * building it inside the wrapper would make a new one on every render and loop
 * the provider.
 */
export function queryWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
