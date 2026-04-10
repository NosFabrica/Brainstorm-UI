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

async function uploadToNostrBuild(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("https://nostr.build/api/v2/upload/files", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed (${response.status})`);
  }

  const data = await response.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error("No URL returned from upload");
  return url;
}

export function ImageUpload({ value, onChange, onRemove, aspect = "square", label, className = "" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const url = await uploadToNostrBuild(file);
      onChange(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [onChange]);

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

  const isSquare = aspect === "square";
  const containerClass = isSquare
    ? "w-28 h-28 rounded-2xl"
    : "w-full h-32 rounded-xl";

  if (value) {
    return (
      <div className={`relative group ${containerClass} overflow-hidden border border-white/10 ${className}`}>
        <img src={value} alt={label || "Uploaded"} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 sm:opacity-0 max-sm:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            data-testid={`button-change-${aspect}`}
          >
            <Upload className="h-4 w-4 text-white" />
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-lg bg-white/20 hover:bg-red-500/50 transition-colors"
              data-testid={`button-remove-${aspect}`}
            >
              <X className="h-4 w-4 text-white" />
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
        className={`${containerClass} border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-1.5 ${
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
          <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
        ) : (
          <>
            <ImageIcon className="h-5 w-5 text-slate-500" />
            <span className="text-[10px] text-slate-500 text-center px-2">
              {isSquare ? "Drop or click" : "Drop banner or click to browse"}
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
