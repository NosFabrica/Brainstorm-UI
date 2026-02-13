const trustData = [
  { label: "npub1qx3f...verified", x: 12, y: 14 },
  { label: "trust_score: 0.94", x: 72, y: 8 },
  { label: "follows: 847", x: 35, y: 32 },
  { label: "wot_rank: #127", x: 78, y: 28 },
  { label: "relay: wss://nos.lol", x: 55, y: 52 },
  { label: "kind:3 → follows", x: 15, y: 58 },
  { label: "sig: schnorr✓", x: 82, y: 62 },
  { label: "confidence: 0.87", x: 28, y: 78 },
  { label: "hops: 2 → 0.73", x: 65, y: 82 },
];

const STEP_DURATION = 4;
const TOTAL_CYCLE = trustData.length * STEP_DURATION;
const INITIAL_WAIT = 3;

const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 2.5 + 1.5,
  duration: 14 + Math.random() * 10,
  delay: 4 + i * 2,
}));

export function ComputingBackground({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const isDark = variant === "dark";

  const textKeyframes = trustData.map((_, i) => {
    const startPct = ((i * STEP_DURATION) / TOTAL_CYCLE) * 100;
    const fadeInPct = ((i * STEP_DURATION + STEP_DURATION * 0.15) / TOTAL_CYCLE) * 100;
    const holdPct = ((i * STEP_DURATION + STEP_DURATION * 0.6) / TOTAL_CYCLE) * 100;
    const fadeOutPct = ((i * STEP_DURATION + STEP_DURATION * 0.9) / TOTAL_CYCLE) * 100;

    return `
      @keyframes cbText${i} {
        0% { opacity: 0; }
        ${startPct.toFixed(1)}% { opacity: 0; }
        ${fadeInPct.toFixed(1)}% { opacity: 0.35; }
        ${holdPct.toFixed(1)}% { opacity: 0.3; }
        ${fadeOutPct.toFixed(1)}% { opacity: 0; }
        100% { opacity: 0; }
      }
    `;
  }).join('\n');

  const lineKeyframes = trustData.map((_, i) => {
    const next = (i + 1) % trustData.length;
    const startPct = ((i * STEP_DURATION + STEP_DURATION * 0.1) / TOTAL_CYCLE) * 100;
    const drawnPct = ((i * STEP_DURATION + STEP_DURATION * 0.5) / TOTAL_CYCLE) * 100;
    const holdPct = ((i * STEP_DURATION + STEP_DURATION * 0.7) / TOTAL_CYCLE) * 100;
    const fadePct = ((i * STEP_DURATION + STEP_DURATION * 0.95) / TOTAL_CYCLE) * 100;
    void next;

    return `
      @keyframes cbConn${i} {
        0% { stroke-dashoffset: 2000; opacity: 0; }
        ${startPct.toFixed(1)}% { stroke-dashoffset: 2000; opacity: 0; }
        ${((startPct + drawnPct) / 2).toFixed(1)}% { stroke-dashoffset: 1000; opacity: 0.04; }
        ${drawnPct.toFixed(1)}% { stroke-dashoffset: 0; opacity: 0.07; }
        ${holdPct.toFixed(1)}% { stroke-dashoffset: 0; opacity: 0.05; }
        ${fadePct.toFixed(1)}% { stroke-dashoffset: 0; opacity: 0; }
        100% { stroke-dashoffset: 0; opacity: 0; }
      }
    `;
  }).join('\n');

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{`
        @keyframes cbFloatNode {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateY(-8px) scale(1); opacity: 0.2; }
          40% { transform: translateY(-18px) scale(1.1); opacity: 0.3; }
          60% { transform: translateY(-22px) scale(1.05); opacity: 0.25; }
          80% { transform: translateY(-10px) scale(0.9); opacity: 0.1; }
          100% { transform: translateY(0) scale(0.5); opacity: 0; }
        }
        @keyframes cbGlowOrb1 {
          0%, 100% { opacity: 0.06; transform: scale(1) translateX(0); }
          50% { opacity: 0.15; transform: scale(1.2) translateX(20px); }
        }
        @keyframes cbGlowOrb2 {
          0%, 100% { opacity: 0.05; transform: scale(1) translateY(0); }
          50% { opacity: 0.12; transform: scale(1.3) translateY(-15px); }
        }
        @keyframes cbGlowOrb3 {
          0%, 100% { opacity: 0.03; transform: scale(1); }
          50% { opacity: 0.1; transform: scale(1.4); }
        }
        @keyframes cbNodePulse {
          0% { transform: scale(0); opacity: 0; }
          20% { transform: scale(1.3); opacity: 0.5; }
          50% { transform: scale(1); opacity: 0.35; }
          80% { transform: scale(0.8); opacity: 0.1; }
          100% { transform: scale(0); opacity: 0; }
        }
        ${textKeyframes}
        ${lineKeyframes}
      `}</style>

      {isDark ? (
        <>
          <div className="absolute inset-0 bg-slate-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/15 via-slate-950 to-slate-950" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff06_1px,transparent_1px),linear-gradient(to_bottom,#ffffff06_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
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
          background: isDark ? 'rgba(37,99,235,0.04)' : 'rgba(79,70,229,0.03)',
          animation: 'cbGlowOrb1 14s ease-in-out infinite 2s',
        }}
      />
      <div
        className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full blur-3xl"
        style={{
          background: isDark ? 'rgba(59,130,246,0.04)' : 'rgba(124,58,237,0.03)',
          animation: 'cbGlowOrb2 18s ease-in-out infinite 5s',
        }}
      />
      <div
        className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full blur-2xl"
        style={{
          background: isDark ? 'rgba(96,165,250,0.03)' : 'rgba(59,130,246,0.03)',
          animation: 'cbGlowOrb3 12s ease-in-out infinite 8s',
        }}
      />

      <svg className="absolute inset-0 w-full h-full">
        {trustData.map((item, i) => {
          const next = trustData[(i + 1) % trustData.length];
          return (
            <line
              key={`conn-${i}`}
              x1={`${item.x}%`}
              y1={`${item.y}%`}
              x2={`${next.x}%`}
              y2={`${next.y}%`}
              stroke={isDark ? 'url(#cbLineGrad)' : 'url(#cbLineGradLight)'}
              strokeWidth={isDark ? "0.3" : "0.7"}
              strokeLinecap="round"
              strokeDasharray="2000"
              strokeDashoffset="2000"
              style={{
                opacity: 0,
                animation: `cbConn${i} ${TOTAL_CYCLE}s ease-in-out infinite ${INITIAL_WAIT}s`,
              }}
            />
          );
        })}

        {trustData.map((item, i) => (
          <circle
            key={`dot-${i}`}
            cx={`${item.x}%`}
            cy={`${item.y}%`}
            r="2"
            fill={isDark ? 'rgba(96,165,250,0.25)' : 'rgba(99,102,241,0.2)'}
            style={{
              transformOrigin: `${item.x}% ${item.y}%`,
              opacity: 0,
              animation: `cbNodePulse ${STEP_DURATION}s ease-in-out infinite ${INITIAL_WAIT + i * STEP_DURATION}s`,
            }}
          />
        ))}

        <defs>
          <linearGradient id="cbLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="cbLineGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
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
            width: node.size + 2,
            height: node.size + 2,
            background: isDark
              ? 'radial-gradient(circle, rgba(96,165,250,0.25) 0%, rgba(96,165,250,0.05) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, rgba(99,102,241,0.05) 60%, transparent 100%)',
            boxShadow: isDark
              ? '0 0 4px 1px rgba(96,165,250,0.06)'
              : '0 0 4px 1px rgba(99,102,241,0.06)',
            animation: `cbFloatNode ${node.duration}s ease-in-out infinite ${node.delay}s`,
          }}
        />
      ))}

      {trustData.map((item, i) => (
        <div
          key={`text-${i}`}
          className={`absolute text-[10px] font-mono pointer-events-none select-none hidden md:block tracking-wide ${
            isDark ? 'text-blue-300/50' : 'text-indigo-900/30'
          }`}
          style={{
            left: `${item.x}%`,
            top: `${item.y + 1.5}%`,
            opacity: 0,
            animation: `cbText${i} ${TOTAL_CYCLE}s ease-in-out infinite ${INITIAL_WAIT}s`,
          }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
