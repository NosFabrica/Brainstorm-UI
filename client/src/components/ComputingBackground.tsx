const floatingNodes = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  x: 8 + Math.random() * 84,
  y: 8 + Math.random() * 84,
  size: Math.random() * 3 + 2,
  duration: 10 + Math.random() * 8,
  delay: i * 1.2,
}));

const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 11],
  [9, 12], [10, 13], [0, 6], [2, 8], [4, 10], [1, 7], [5, 11],
];

const calculations = [
  "npub1qx3f...verified",
  "trust_score: 0.94",
  "follows: 847",
  "wot_rank: #127",
  "relay: wss://nos.lol",
  "kind:3 → follows",
  "sig: schnorr✓",
  "hops: 2 → 0.73",
  "confidence: 0.87",
];

export function ComputingBackground({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const isDark = variant === "dark";

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{`
        @keyframes cbFloatNode {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          15% { transform: translateY(-8px) scale(1); opacity: 0.35; }
          35% { transform: translateY(-20px) scale(1.15); opacity: 0.45; }
          50% { transform: translateY(-28px) scale(1.2); opacity: 0.4; }
          70% { transform: translateY(-18px) scale(1); opacity: 0.28; }
          85% { transform: translateY(-6px) scale(0.8); opacity: 0.12; }
          100% { transform: translateY(0) scale(0.5); opacity: 0; }
        }
        @keyframes cbLineDraw {
          0% { stroke-dashoffset: 100%; opacity: 0; }
          10% { opacity: 0; }
          25% { opacity: 0.22; }
          40% { stroke-dashoffset: 0%; opacity: 0.28; }
          60% { stroke-dashoffset: 0%; opacity: 0.25; }
          80% { opacity: 0.1; }
          100% { stroke-dashoffset: -100%; opacity: 0; }
        }
        @keyframes cbCalcFade {
          0% { opacity: 0; transform: translateY(4px); }
          20% { opacity: 0.35; transform: translateY(0); }
          40% { opacity: 0.42; transform: translateY(-6px); }
          60% { opacity: 0.35; transform: translateY(-10px); }
          80% { opacity: 0.15; transform: translateY(-14px); }
          100% { opacity: 0; transform: translateY(-18px); }
        }
        @keyframes cbGlowOrb1 {
          0%, 100% { opacity: 0.08; transform: scale(1) translateX(0); }
          50% { opacity: 0.18; transform: scale(1.2) translateX(20px); }
        }
        @keyframes cbGlowOrb2 {
          0%, 100% { opacity: 0.06; transform: scale(1) translateY(0); }
          50% { opacity: 0.15; transform: scale(1.3) translateY(-15px); }
        }
        @keyframes cbGlowOrb3 {
          0%, 100% { opacity: 0.04; transform: scale(1); }
          50% { opacity: 0.12; transform: scale(1.4); }
        }
      `}</style>

      {isDark ? (
        <>
          <div className="absolute inset-0 bg-slate-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[#F8FAFC]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.4]" />
          <div className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/40 blur-[120px]" />
          <div className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/30 blur-[140px]" />
        </>
      )}

      <div
        className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full blur-3xl"
        style={{
          background: isDark ? 'rgba(79,70,229,0.05)' : 'rgba(79,70,229,0.03)',
          animation: 'cbGlowOrb1 12s ease-in-out infinite',
        }}
      />
      <div
        className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full blur-3xl"
        style={{
          background: isDark ? 'rgba(124,58,237,0.05)' : 'rgba(124,58,237,0.03)',
          animation: 'cbGlowOrb2 15s ease-in-out infinite 3s',
        }}
      />
      <div
        className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full blur-2xl"
        style={{
          background: isDark ? 'rgba(59,130,246,0.05)' : 'rgba(59,130,246,0.03)',
          animation: 'cbGlowOrb3 10s ease-in-out infinite 5s',
        }}
      />

      <svg className="absolute inset-0 w-full h-full">
        {connectionPairs.map(([a, b], i) => (
          <line
            key={i}
            x1={`${floatingNodes[a].x}%`}
            y1={`${floatingNodes[a].y}%`}
            x2={`${floatingNodes[b].x}%`}
            y2={`${floatingNodes[b].y}%`}
            stroke={isDark ? `url(#cbLineGrad)` : `url(#cbLineGradLight)`}
            strokeWidth={isDark ? "0.5" : "1.2"}
            strokeDasharray="6 4"
            style={{
              animation: `cbLineDraw ${10 + (i % 4) * 2}s ease-in-out infinite ${i * 1.1}s`,
            }}
          />
        ))}
        <defs>
          <linearGradient id="cbLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#818cf8" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="cbLineGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>

      {floatingNodes.map((node) => (
        <div
          key={node.id}
          className="absolute rounded-full"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size + 3,
            height: node.size + 3,
            background: isDark
              ? 'radial-gradient(circle, rgba(129,140,248,0.45) 0%, rgba(129,140,248,0.1) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, rgba(99,102,241,0.08) 60%, transparent 100%)',
            boxShadow: isDark
              ? '0 0 5px 1px rgba(129,140,248,0.15)'
              : '0 0 4px 1px rgba(99,102,241,0.1)',
            animation: `cbFloatNode ${node.duration}s ease-in-out infinite ${node.delay}s`,
          }}
        />
      ))}

      {calculations.map((calc, i) => (
        <div
          key={i}
          className={`absolute text-[11px] font-mono pointer-events-none select-none hidden md:block tracking-wide ${
            isDark ? 'text-indigo-200/45' : 'text-indigo-900/30'
          }`}
          style={{
            left: `${4 + (i % 5) * 20}%`,
            top: `${8 + Math.floor(i / 5) * 45 + (i % 3) * 12}%`,
            animation: `cbCalcFade ${8 + (i % 3) * 2}s ease-in-out infinite ${i * 1.8}s`,
          }}
        >
          {calc}
        </div>
      ))}
    </div>
  );
}
