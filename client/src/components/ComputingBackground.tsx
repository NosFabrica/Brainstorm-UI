const clusters = [
  {
    nodes: [
      { label: "npub1qx3f...verified", x: 10, y: 12 },
      { label: "trust_score: 0.94", x: 38, y: 22 },
      { label: "follows: 847", x: 24, y: 38 },
    ],
    lines: [[0, 1], [1, 2], [0, 2]],
  },
  {
    nodes: [
      { label: "wot_rank: #127", x: 68, y: 10 },
      { label: "relay: wss://nos.lol", x: 88, y: 28 },
      { label: "kind:3 → follows", x: 72, y: 42 },
    ],
    lines: [[0, 1], [1, 2], [0, 2]],
  },
  {
    nodes: [
      { label: "sig: schnorr✓", x: 14, y: 62 },
      { label: "confidence: 0.87", x: 42, y: 72 },
      { label: "hops: 2 → 0.73", x: 28, y: 86 },
    ],
    lines: [[0, 1], [1, 2], [0, 2]],
  },
  {
    nodes: [
      { label: "influence: 0.61", x: 62, y: 58 },
      { label: "mutes: 12", x: 85, y: 68 },
      { label: "depth: 3", x: 72, y: 82 },
    ],
    lines: [[0, 1], [1, 2], [0, 2]],
  },
];

const CLUSTER_DURATION = 8;
const TOTAL_CYCLE = clusters.length * CLUSTER_DURATION;
const INITIAL_WAIT = 3;

const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 2.5 + 1.5,
  duration: 14 + Math.random() * 10,
  delay: 4 + i * 2,
}));

function pct(clusterIdx: number, offsetSec: number) {
  return (((clusterIdx * CLUSTER_DURATION + offsetSec) / TOTAL_CYCLE) * 100).toFixed(1);
}

export function ComputingBackground({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const isDark = variant === "dark";

  const allKeyframes: string[] = [];

  clusters.forEach((cluster, ci) => {
    cluster.nodes.forEach((_, ni) => {
      const name = `cbT${ci}_${ni}`;
      const stagger = ni * 0.6;
      allKeyframes.push(`
        @keyframes ${name} {
          0% { opacity: 0; }
          ${pct(ci, 0.3 + stagger)}% { opacity: 0; }
          ${pct(ci, 0.8 + stagger)}% { opacity: 0.35; }
          ${pct(ci, 5.5)}% { opacity: 0.3; }
          ${pct(ci, 7.0)}% { opacity: 0; }
          100% { opacity: 0; }
        }
      `);
    });

    cluster.lines.forEach(([a, b], li) => {
      const name = `cbL${ci}_${li}`;
      const lineStart = 1.0 + li * 1.2;
      allKeyframes.push(`
        @keyframes ${name} {
          0% { stroke-dashoffset: 2000; opacity: 0; }
          ${pct(ci, lineStart)}% { stroke-dashoffset: 2000; opacity: 0; }
          ${pct(ci, lineStart + 0.3)}% { stroke-dashoffset: 1500; opacity: 0.15; }
          ${pct(ci, lineStart + 1.0)}% { stroke-dashoffset: 800; opacity: 0.25; }
          ${pct(ci, lineStart + 1.8)}% { stroke-dashoffset: 0; opacity: 0.2; }
          ${pct(ci, 5.5)}% { stroke-dashoffset: 0; opacity: 0.15; }
          ${pct(ci, 7.0)}% { stroke-dashoffset: 0; opacity: 0; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
      `);
      void b; void a;
    });

    cluster.nodes.forEach((_, ni) => {
      const name = `cbD${ci}_${ni}`;
      const stagger = ni * 0.5;
      allKeyframes.push(`
        @keyframes ${name} {
          0% { opacity: 0; transform: scale(0); }
          ${pct(ci, 0.2 + stagger)}% { opacity: 0; transform: scale(0); }
          ${pct(ci, 0.6 + stagger)}% { opacity: 0.4; transform: scale(1.2); }
          ${pct(ci, 1.2 + stagger)}% { opacity: 0.3; transform: scale(1); }
          ${pct(ci, 5.5)}% { opacity: 0.2; transform: scale(1); }
          ${pct(ci, 7.0)}% { opacity: 0; transform: scale(0.5); }
          100% { opacity: 0; transform: scale(0); }
        }
      `);
    });
  });

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
        ${allKeyframes.join('\n')}
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
        {clusters.map((cluster, ci) =>
          cluster.lines.map(([a, b], li) => (
            <line
              key={`l-${ci}-${li}`}
              x1={`${cluster.nodes[a].x}%`}
              y1={`${cluster.nodes[a].y}%`}
              x2={`${cluster.nodes[b].x}%`}
              y2={`${cluster.nodes[b].y}%`}
              stroke={isDark ? 'url(#cbLineGrad)' : 'url(#cbLineGradLight)'}
              strokeWidth={isDark ? "0.8" : "1"}
              strokeLinecap="round"
              strokeDasharray="2000"
              strokeDashoffset="2000"
              style={{
                opacity: 0,
                animation: `cbL${ci}_${li} ${TOTAL_CYCLE}s ease-in-out infinite ${INITIAL_WAIT}s`,
              }}
            />
          ))
        )}

        {clusters.map((cluster, ci) =>
          cluster.nodes.map((node, ni) => (
            <circle
              key={`d-${ci}-${ni}`}
              cx={`${node.x}%`}
              cy={`${node.y}%`}
              r="2"
              fill={isDark ? 'rgba(96,165,250,0.2)' : 'rgba(99,102,241,0.15)'}
              style={{
                transformOrigin: `${node.x}% ${node.y}%`,
                opacity: 0,
                animation: `cbD${ci}_${ni} ${TOTAL_CYCLE}s ease-in-out infinite ${INITIAL_WAIT}s`,
              }}
            />
          ))
        )}

        <defs>
          <linearGradient id="cbLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id="cbLineGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.35" />
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

      {clusters.map((cluster, ci) =>
        cluster.nodes.map((node, ni) => (
          <div
            key={`t-${ci}-${ni}`}
            className={`absolute text-[10px] font-mono pointer-events-none select-none hidden md:block tracking-wide ${
              isDark ? 'text-blue-300/50' : 'text-indigo-900/30'
            }`}
            style={{
              left: `${node.x}%`,
              top: `${node.y + 1.8}%`,
              opacity: 0,
              animation: `cbT${ci}_${ni} ${TOTAL_CYCLE}s ease-in-out infinite ${INITIAL_WAIT}s`,
            }}
          >
            {node.label}
          </div>
        ))
      )}
    </div>
  );
}
