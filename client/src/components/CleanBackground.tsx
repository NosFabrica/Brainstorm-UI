export function CleanBackground() {
  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      data-testid="bg-clean"
    >
      {/* Base surface */}
      <div className="absolute inset-0 bg-[#F8FAFC]" />

      {/* Soft indigo aurora wash from the top — the enterprise centerpiece */}
      <div className="absolute -top-[35%] left-1/2 -translate-x-1/2 w-[140%] h-[80%] rounded-[50%] bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.12),_transparent_70%)] blur-3xl" />

      {/* Quiet color depth at the lower corners */}
      <div className="absolute -bottom-[25%] -left-[15%] w-[60%] h-[60%] rounded-full bg-indigo-200/25 blur-[150px]" />
      <div className="absolute top-[15%] -right-[20%] w-[55%] h-[55%] rounded-full bg-violet-200/20 blur-[150px]" />

      {/* Gentle bottom fade to keep content grounded */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/70" />
    </div>
  );
}
