import { useState, useRef, useCallback, type ReactNode } from "react";
import { Upload, X, Loader2, ImageIcon, Camera } from "lucide-react";
import { signEventLocally, getCurrentUser } from "@/services/nostr";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  aspect?: "square" | "banner";
  label?: string;
  className?: string;
  /**
   * Optional default preview rendered in the empty state (e.g. an initials avatar
   * or a brand-gradient banner). When provided, the dashed "Upload" box is replaced
   * by this default plus an overlay upload control; Remove (on a real value) reverts
   * to it. Purely visual — never published.
   */
  placeholder?: ReactNode;
  /**
   * Overrides the default box size/shape classes in all states. Lets callers request
   * e.g. a tall banner (`w-full h-36 rounded-t-2xl`) or a circular avatar
   * (`h-24 w-24 rounded-full border-4 border-white shadow-lg`). When absent, the
   * default 72px box is used.
   */
  containerClassName?: string;
  /** Display-only: render the image/placeholder with no upload/remove affordances. */
  readOnly?: boolean;
}

const MAX_AVATAR_SIZE = 400;
const MAX_BANNER_WIDTH = 1200;
const MAX_BANNER_HEIGHT = 400;
const JPEG_QUALITY = 0.82;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function resizeImage(file: File, maxW: number, maxH: number, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error("Compression failed")); return; }
          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = URL.createObjectURL(file);
  });
}

// Build an `Authorization: Nostr <base64-signed-event>` header (used by both
// NIP-98 — nostr.build — and Blossom). Signs locally with the in-app key or the
// extension, so uploads work without exposing the key.
async function nostrAuthHeader(template: { kind: number; tags: string[][]; content: string }): Promise<string> {
  const user = getCurrentUser();
  if (!user?.pubkey) throw new Error("Sign in to upload an image.");
  const event = { ...template, created_at: Math.floor(Date.now() / 1000), pubkey: user.pubkey };
  const signed = await signEventLocally(event);
  return `Nostr ${btoa(JSON.stringify(signed))}`;
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// nostr.build v2 now requires a NIP-98 (kind 27235) auth token.
async function uploadToNostrBuild(blob: Blob): Promise<string> {
  const url = "https://nostr.build/api/v2/upload/files";
  const auth = await nostrAuthHeader({ kind: 27235, tags: [["u", url], ["method", "POST"]], content: "" });

  const formData = new FormData();
  formData.append("file", blob, "image.jpg");

  const response = await fetch(url, { method: "POST", headers: { Authorization: auth }, body: formData });
  if (response.ok) {
    const data = await response.json();
    const u = data?.data?.[0]?.url;
    if (u) return u;
  }
  throw new Error("nostr.build failed");
}

// Blossom (BUD-02) fallback: PUT the raw blob with a kind-24242 auth event.
const BLOSSOM_SERVER = "https://blossom.primal.net";
async function uploadToBlossom(blob: Blob): Promise<string> {
  const hash = await sha256Hex(blob);
  const auth = await nostrAuthHeader({
    kind: 24242,
    tags: [["t", "upload"], ["x", hash], ["expiration", String(Math.floor(Date.now() / 1000) + 600)]],
    content: "Upload image",
  });

  const response = await fetch(`${BLOSSOM_SERVER}/upload`, {
    method: "PUT",
    headers: { Authorization: auth, "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (response.ok) {
    const data = await response.json();
    if (data?.url) return data.url as string;
  }
  throw new Error("blossom failed");
}

async function uploadImage(blob: Blob): Promise<string> {
  // Blossom (primal) is the reliable primary; nostr.build is the fallback (it was
  // returning 500s under test even with valid NIP-98 auth). Both are signed.
  try {
    return await uploadToBlossom(blob);
  } catch { /* try the fallback host */ }

  try {
    return await uploadToNostrBuild(blob);
  } catch { /* both hosts failed */ }

  // No data:-URL fallback: an inline base64 avatar is valid in kind-0 but other
  // Nostr clients can't render it, so it shows as "no picture" to everyone else.
  // Fail loudly so the user retries instead of silently shipping a broken avatar.
  throw new Error("Couldn't upload your image right now. Please try again in a moment.");
}

export function ImageUpload({ value, onChange, onRemove, aspect = "square", label, className = "", placeholder, containerClassName, readOnly }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isSquare = aspect === "square";
  const maxW = isSquare ? MAX_AVATAR_SIZE : MAX_BANNER_WIDTH;
  const maxH = isSquare ? MAX_AVATAR_SIZE : MAX_BANNER_HEIGHT;

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError("Image must be under 50MB");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const compressed = await resizeImage(file, maxW, maxH, JPEG_QUALITY);
      const url = await uploadImage(compressed);
      onChange(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onChange, maxW, maxH]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const containerClass = containerClassName ?? (isSquare
    ? "w-[72px] h-[72px] rounded-xl"
    : "w-full h-[72px] rounded-xl");

  // Display-only: show the image (or default placeholder) with no controls.
  if (readOnly) {
    return (
      <div className={`${containerClass} overflow-hidden ${className}`} data-testid={`display-${aspect}`}>
        {value ? (
          <img src={value} alt={label || ""} className="w-full h-full object-cover" />
        ) : (
          placeholder ?? null
        )}
      </div>
    );
  }

  if (value) {
    return (
      <div className={`relative group ${containerClass} overflow-hidden ${containerClassName ? "" : "border border-white/10"} ${className}`}>
        <img src={value} alt={label || "Uploaded"} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0 max-sm:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="p-1 rounded-md bg-white/20 hover:bg-white/30 transition-colors"
            data-testid={`button-change-${aspect}`}
          >
            <Upload className="h-3.5 w-3.5 text-white" />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded-md bg-white/20 hover:bg-red-500/50 transition-colors"
              data-testid={`button-remove-${aspect}`}
            >
              <X className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
    );
  }

  // Default-preview empty state: render the supplied placeholder (initials avatar /
  // brand-gradient banner) with an overlay upload control instead of a dashed box.
  if (placeholder) {
    return (
      <div className={className}>
        <div
          role="button"
          tabIndex={0}
          aria-label={isSquare ? "Upload profile photo" : "Upload banner"}
          className={`relative group ${containerClass} overflow-hidden cursor-pointer transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c86ff]/50 ${
            dragOver ? "ring-2 ring-[#7c86ff]/60" : ""
          }`}
          onClick={() => !uploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!uploading) inputRef.current?.click(); }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          data-testid={`upload-${aspect}`}
        >
          <div className="absolute inset-0">{placeholder}</div>
          <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 sm:opacity-0 max-sm:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
            {uploading ? (
              <Loader2 className="h-4 w-4 text-white animate-spin" />
            ) : (
              <span className="inline-flex items-center gap-1 text-white text-[11px] font-semibold drop-shadow">
                <Camera className="h-3.5 w-3.5" />
                {isSquare ? "Add photo" : "Add banner"}
              </span>
            )}
          </div>
        </div>
        {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className={`${containerClass} border border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-1 ${
          dragOver
            ? "border-[#7c86ff] bg-[#7c86ff]/10"
            : "border-white/15 hover:border-[#7c86ff]/40 hover:bg-white/[0.03]"
        }`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid={`upload-${aspect}`}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 text-[#7c86ff] animate-spin" />
        ) : (
          <>
            <ImageIcon className="h-4 w-4 text-slate-500" />
            <span className="text-[9px] text-slate-500 text-center leading-tight">
              {isSquare ? "Upload" : "Upload banner"}
            </span>
          </>
        )}
      </div>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
    </div>
  );
}
