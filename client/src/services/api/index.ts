import { authApi } from "./auth";
import { usersApi } from "./users";
import { searchApi } from "./search";
import { shareApi } from "./share";
import { schedulingApi } from "./scheduling";
import { billingApi } from "./billing";
import { grapeRankApi } from "./graperank";
import { adminApi } from "./admin";

// Only the two session facts callers outside this folder read; the transport
// helpers stay internal to the folder rather than becoming public surface.
export { isAuthRedirecting, resumeSession } from "./core";
export * from "./auth";
export * from "./users";
export * from "./search";
export * from "./share";
export * from "./scheduling";
export * from "./billing";
export * from "./graperank";
export * from "./admin";

/**
 * Every domain's calls under the one name 90-odd modules already import.
 * Spread rather than nested, so `apiClient.getUserStats(...)` still reads the
 * same; a caller that wants only one domain can import that module directly.
 */
export const apiClient = {
  ...authApi,
  ...usersApi,
  ...searchApi,
  ...shareApi,
  ...schedulingApi,
  ...billingApi,
  ...grapeRankApi,
  ...adminApi,
};
