export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = payload.length % 4;
    if (pad === 2) payload += "==";
    else if (pad === 3) payload += "=";
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function extractAdminFlag(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  return payload.is_admin === true || payload.admin === true || payload.role === "admin";
}
