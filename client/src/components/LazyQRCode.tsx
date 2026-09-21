import { Suspense, lazy } from "react";

// Plain `lazy`, not the route loader: a failed chunk here must not reload the
// page and throw away a live pairing or a fetched invoice.
const QRCodeSVG = lazy(() => import("qrcode.react").then((m) => ({ default: m.QRCodeSVG })));

interface LazyQRCodeProps {
  value: string;
  /** Reserves the box, so the dialog doesn't resize when the code lands. */
  size?: number;
  className?: string;
  bgColor?: string;
  fgColor?: string;
  level?: "L" | "M" | "Q" | "H";
}

/** A QR code, fetched the first time a dialog shows one. */
export function LazyQRCode({ size, className, ...props }: LazyQRCodeProps) {
  const placeholder = size ? (
    <div style={{ width: size, height: size }} />
  ) : (
    <div className={className ?? "aspect-square w-full"} />
  );
  return (
    <Suspense fallback={placeholder}>
      <QRCodeSVG size={size} className={className} {...props} />
    </Suspense>
  );
}
