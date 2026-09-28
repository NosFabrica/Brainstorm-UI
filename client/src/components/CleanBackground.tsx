export function CleanBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true" data-testid="bg-clean">
      {/* Base surface */}
      <div className="absolute inset-0 bg-[#F8FAFC] dark:bg-slate-950" />

      {/* Soft indigo aurora wash from the top — the enterprise centerpiece */}
      <div className="absolute -top-[35%] left-1/2 h-[80%] w-[140%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,_rgb(var(--brand-primary)/0.12),_transparent_70%)] blur-3xl" />

      {/* Quiet color depth at the lower corners */}
      <div className="absolute -bottom-[25%] -left-[15%] h-[60%] w-[60%] rounded-full bg-brand-primary/20 blur-[150px] dark:bg-brand-primary/15" />
      <div className="absolute -right-[20%] top-[15%] h-[55%] w-[55%] rounded-full bg-brand-accent/20 blur-[150px]" />

      {/* Gentle bottom fade to keep content grounded */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/70 dark:to-slate-950/70" />
    </div>
  );
}
