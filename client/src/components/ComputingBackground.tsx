const clusterA = {
  nodes: [
    { label: "npub1qx3f...verified", x: 8, y: 10 },
    { label: "trust_score: 0.94", x: 34, y: 16 },
    { label: "follows: 847", x: 18, y: 34 },
    { label: "verified: true", x: 40, y: 36 },
  ],
  lines: [[0, 1], [1, 3], [0, 2], [2, 3], [1, 2]] as [number, number][],
};

const clusterB = {
  nodes: [
    { label: "wot_rank: #127", x: 62, y: 8 },
    { label: "relay: wss://nos.lol", x: 90, y: 16 },
    { label: "kind:3 → follows", x: 72, y: 32 },
    { label: "pubkey: a1b2c3...", x: 56, y: 28 },
  ],
  lines: [[0, 1], [0, 3], [1, 2], [3, 2], [0, 2]] as [number, number][],
};

const clusterC = {
  nodes: [
    { label: "sig: schnorr✓", x: 8, y: 58 },
    { label: "confidence: 0.87", x: 36, y: 64 },
    { label: "hops: 2 → 0.73", x: 20, y: 80 },
    { label: "attest: positive", x: 42, y: 82 },
  ],
  lines: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2]] as [number, number][],
};

const clusterD = {
  nodes: [
    { label: "influence: 0.61", x: 58, y: 55 },
    { label: "mutes: 12", x: 88, y: 60 },
    { label: "depth: 3", x: 68, y: 76 },
    { label: "context: global", x: 86, y: 80 },
  ],
  lines: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 2]] as [number, number][],
};

const CYCLE_A = 52;
const CYCLE_B = 60;

const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 2.5 + 1.5,
  duration: 16 + Math.random() * 12,
  delay: 5 + i * 2.5,
}));

function buildClusterKeyframes(
  cluster: typeof clusterA,
  prefix: string,
  cycle: number,
  startDelay: number,
) {
  const kf: string[] = [];
  const p = (sec: number) => {
    const val = ((startDelay + sec) / cycle) * 100;
    return Math.min(val, 99.9).toFixed(2);
  };

  const nodeCount = cluster.nodes.length;
  const lineCount = cluster.lines.length;

  const firstLineArrival: number[] = new Array(nodeCount).fill(Infinity);
  cluster.lines.forEach(([a, b], li) => {
    const lineArrives = 2 + li * 3 + 6;
    firstLineArrival[a] = Math.min(firstLineArrival[a], lineArrives);
    firstLineArrival[b] = Math.min(firstLineArrival[b], lineArrives);
  });

  cluster.nodes.forEach((_, ni) => {
    const appearAt = ni * 1.2;
    const fadeAt = firstLineArrival[ni] === Infinity ? 12 : firstLineArrival[ni];
    kf.push(`
      @keyframes ${prefix}T${ni} {
        0% { opacity: 0; transform: translateY(3px); }
        ${p(appearAt)}% { opacity: 0; transform: translateY(3px); }
        ${p(appearAt + 2)}% { opacity: 0.22; transform: translateY(0); }
        ${p(fadeAt - 1)}% { opacity: 0.2; transform: translateY(0); }
        ${p(fadeAt + 1.5)}% { opacity: 0; transform: translateY(-2px); }
        100% { opacity: 0; transform: translateY(-2px); }
      }
    `);
  });

  cluster.lines.forEach((_, li) => {
    const lineStart = 2 + li * 3;
    kf.push(`
      @keyframes ${prefix}L${li} {
        0% { stroke-dashoffset: 1; opacity: 0; }
        ${p(lineStart)}% { stroke-dashoffset: 1; opacity: 0; }
        ${p(lineStart + 1)}% { stroke-dashoffset: 0.85; opacity: 0.12; }
        ${p(lineStart + 3)}% { stroke-dashoffset: 0.45; opacity: 0.14; }
        ${p(lineStart + 6)}% { stroke-dashoffset: 0; opacity: 0.1; }
        ${p(lineStart + 14)}% { stroke-dashoffset: 0; opacity: 0.07; }
        ${p(lineStart + 18)}% { stroke-dashoffset: 0; opacity: 0; }
        100% { stroke-dashoffset: 0; opacity: 0; }
      }
    `);
    void lineCount;
  });

  cluster.nodes.forEach((_, ni) => {
    const dotAppear = ni * 1.0;
    kf.push(`
      @keyframes ${prefix}D${ni} {
        0% { opacity: 0; transform: scale(0); }
        ${p(dotAppear)}% { opacity: 0; transform: scale(0); }
        ${p(dotAppear + 1)}% { opacity: 0.35; transform: scale(1.4); }
        ${p(dotAppear + 2.5)}% { opacity: 0.25; transform: scale(1); }
        ${p(22)}% { opacity: 0.18; transform: scale(1); }
        ${p(26)}% { opacity: 0; transform: scale(0.3); }
        100% { opacity: 0; transform: scale(0); }
      }
    `);
  });

  return kf;
}

export function ComputingBackground({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const isDark = variant === "dark";

  const keyframesA = buildClusterKeyframes(clusterA, 'cA', CYCLE_A, 0);
  const keyframesB = buildClusterKeyframes(clusterB, 'cB', CYCLE_B, 0);
  const keyframesC = buildClusterKeyframes(clusterC, 'cC', CYCLE_A, 24);
  const keyframesD = buildClusterKeyframes(clusterD, 'cD', CYCLE_B, 28);

  const allKf = [...keyframesA, ...keyframesB, ...keyframesC, ...keyframesD].join('\n');

  const renderCluster = (
    cluster: typeof clusterA,
    prefix: string,
    cycle: number,
    initialWait: number,
  ) => (
    <>
      {cluster.lines.map(([a, b], li) => {
        const n1 = cluster.nodes[a];
        const n2 = cluster.nodes[b];
        return (
          <path
            key={`${prefix}-l-${li}`}
            d={`M ${n1.x} ${n1.y} L ${n2.x} ${n2.y}`}
            pathLength={1}
            fill="none"
            stroke={isDark ? 'url(#cbLineGrad)' : 'url(#cbLineGradLight)'}
            strokeWidth={isDark ? "0.12" : "0.18"}
            strokeLinecap="round"
            strokeDasharray="1"
            strokeDashoffset="1"
            style={{
              opacity: 0,
              animation: `${prefix}L${li} ${cycle}s ease-in-out infinite ${initialWait}s`,
            }}
          />
        );
      })}

      {cluster.nodes.map((node, ni) => (
        <circle
          key={`${prefix}-d-${ni}`}
          cx={node.x}
          cy={node.y}
          r="0.4"
          fill={isDark ? 'rgba(96,165,250,0.35)' : 'rgba(99,102,241,0.3)'}
          style={{
            transformOrigin: `${node.x}px ${node.y}px`,
            opacity: 0,
            animation: `${prefix}D${ni} ${cycle}s ease-in-out infinite ${initialWait}s`,
          }}
        />
      ))}
    </>
  );

  const renderClusterText = (
    cluster: typeof clusterA,
    prefix: string,
    cycle: number,
    initialWait: number,
  ) =>
    cluster.nodes.map((node, ni) => (
      <div
        key={`${prefix}-t-${ni}`}
        className={`absolute text-[10px] font-mono pointer-events-none select-none hidden md:block tracking-wide ${
          isDark ? 'text-blue-300/60' : 'text-indigo-800/30'
        }`}
        style={{
          left: `${node.x}%`,
          top: `${node.y + 1.8}%`,
          opacity: 0,
          animation: `${prefix}T${ni} ${cycle}s ease-in-out infinite ${initialWait}s`,
        }}
      >
        {node.label}
      </div>
    ));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{`
        @keyframes cbFloatNode {
          0% { transform: translateY(0) scale(0.5); opacity: 0; }
          20% { transform: translateY(-8px) scale(1); opacity: 0.18; }
          40% { transform: translateY(-18px) scale(1.1); opacity: 0.25; }
          60% { transform: translateY(-22px) scale(1.05); opacity: 0.2; }
          80% { transform: translateY(-10px) scale(0.9); opacity: 0.08; }
          100% { transform: translateY(0) scale(0.5); opacity: 0; }
        }
        @keyframes cbGlowOrb1 {
          0%, 100% { opacity: 0.05; transform: scale(1) translateX(0); }
          50% { opacity: 0.12; transform: scale(1.15) translateX(15px); }
        }
        @keyframes cbGlowOrb2 {
          0%, 100% { opacity: 0.04; transform: scale(1) translateY(0); }
          50% { opacity: 0.1; transform: scale(1.2) translateY(-12px); }
        }
        @keyframes cbGlowOrb3 {
          0%, 100% { opacity: 0.03; transform: scale(1); }
          50% { opacity: 0.08; transform: scale(1.3); }
        }
        ${allKf}
      `}</style>

      {isDark ? (
        <>
          <div className="absolute inset-0 bg-slate-950" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/15 via-slate-950 to-slate-950" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-[#F8FAFC]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.15]" />
          <div className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/40 blur-[120px]" />
          <div className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/30 blur-[140px]" />
        </>
      )}

      <div
        className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full blur-3xl"
        style={{
          background: isDark ? 'rgba(37,99,235,0.04)' : 'rgba(79,70,229,0.03)',
          animation: 'cbGlowOrb1 18s ease-in-out infinite 2s',
        }}
      />
      <div
        className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full blur-3xl"
        style={{
          background: isDark ? 'rgba(59,130,246,0.04)' : 'rgba(124,58,237,0.03)',
          animation: 'cbGlowOrb2 22s ease-in-out infinite 6s',
        }}
      />
      <div
        className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full blur-2xl"
        style={{
          background: isDark ? 'rgba(96,165,250,0.03)' : 'rgba(59,130,246,0.03)',
          animation: 'cbGlowOrb3 16s ease-in-out infinite 10s',
        }}
      />

      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {renderCluster(clusterA, 'cA', CYCLE_A, 4)}
        {renderCluster(clusterB, 'cB', CYCLE_B, 8)}
        {renderCluster(clusterC, 'cC', CYCLE_A, 6)}
        {renderCluster(clusterD, 'cD', CYCLE_B, 12)}

        <defs>
          <linearGradient id="cbLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="cbLineGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.25" />
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
              ? 'radial-gradient(circle, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.04) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.04) 60%, transparent 100%)',
            boxShadow: isDark
              ? '0 0 4px 1px rgba(96,165,250,0.05)'
              : '0 0 4px 1px rgba(99,102,241,0.05)',
            animation: `cbFloatNode ${node.duration}s ease-in-out infinite ${node.delay}s`,
          }}
        />
      ))}

      {renderClusterText(clusterA, 'cA', CYCLE_A, 4)}
      {renderClusterText(clusterB, 'cB', CYCLE_B, 8)}
      {renderClusterText(clusterC, 'cC', CYCLE_A, 6)}
      {renderClusterText(clusterD, 'cD', CYCLE_B, 12)}
    </div>
  );
}
