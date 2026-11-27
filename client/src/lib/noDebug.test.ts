/**
 * The build's stand-in for `debug` (vite.config.ts): applesauce calls a logger
 * and extends it, and neither may throw or write.
 */
import { describe, expect, it, vi } from "vitest";
import createDebug from "./noDebug";

describe("noDebug", () => {
  it("makes loggers that extend and never write", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const relay = createDebug("applesauce").extend("Relay").extend("wss://x");
    expect(relay.namespace).toBe("applesauce:Relay:wss://x");
    expect(relay.enabled).toBe(false);
    relay("Connected", 1);
    createDebug.enable("applesauce*");
    expect(createDebug.enabled("applesauce")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
    spy.mockRestore();
    debugSpy.mockRestore();
  });
});
