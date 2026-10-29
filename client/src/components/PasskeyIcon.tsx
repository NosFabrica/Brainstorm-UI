import { Fingerprint, ScanFace, type LucideProps } from "lucide-react";

import { passkeyMethod } from "@/accounts/passkey";

/** The face for Face ID, a fingerprint for everything else a passkey asks for. */
export function PasskeyIcon(props: LucideProps) {
  return passkeyMethod().label === "Face ID" ? <ScanFace {...props} /> : <Fingerprint {...props} />;
}

/** The same choice as a component type, for props that take an icon (`Chip`). */
export function passkeyIconComponent(): typeof ScanFace {
  return passkeyMethod().label === "Face ID" ? ScanFace : Fingerprint;
}
