import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";

interface ImageUploadProps {
  value?: string;
  onChange: (url: string) => void;
  onRemove?: () => void;
  aspect?: "square" | "banner";
  label?: string;
  className?: string;
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(blob);
  });
}

async function uploadToNostrBuild(blob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "image.jpg");

  const response = await fetch("https://nostr.build/api/v2/upload/files", {
    method: "POST",
    body: formData,
  });

  if (response.ok) {
    const data = await response.json();
    const url = data?.data?.[0]?.url;
    if (url) return url;
  }
  throw new Error("nostr.build failed");
}

async function uploadToVoidCat(blob: Blob): Promise<string> {
  const response = await fetch("https://void.cat/upload", {
    method: "POST",
    body: blob,
    headers: {
      "Content-Type": "image/jpeg",
      "V-Content-Type": "image/jpeg",
    },
  });

  if (response.ok) {
    const data = await response.json();
    if (data?.file?.url) return data.file.url;
    if (data?.id) return `https://void.cat/d/${data.id}`;
  }
  throw new Error("void.cat failed");
}

async function uploadImage(blob: Blob): Promise<string> {
  const errors: string[] = [];

  try {
    return await uploadToNostrBuild(blob);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "nostr.build failed");
  }

  try {
    return await uploadToVoidCat(blob);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : "void.cat failed");
  }

  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > 2 * 1024 * 1024) {
    throw new Error("Upload services unavailable and image too large for inline storage");
  }
  return dataUrl;
}

export function ImageUpload({ value, onChange, onRemove, aspect = "square", label, className = "" }: ImageUploadProps) {
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
    if (file.size > MAX_FILE_BYTES) {
      setError("Image must be under 5MB");
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

  const containerClass = isSquare
    ? "w-[72px] h-[72px] rounded-xl"
    : "w-full h-[72px] rounded-xl";

  if (value) {
    return (
      <div className={`relative group ${containerClass} overflow-hidden border border-white/10 ${className}`}>
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

  return (
    <div className={className}>
      <div
        className={`${containerClass} border border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-1 ${
          dragOver
            ? "border-cyan-400 bg-cyan-500/10"
            : "border-white/15 hover:border-cyan-500/40 hover:bg-white/[0.03]"
        }`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid={`upload-${aspect}`}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
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
