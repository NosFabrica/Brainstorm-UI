const floatingNodes = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  x: 8 + Math.random() * 84,
  y: 8 + Math.random() * 84,
  size: Math.random() * 2.5 + 1.5,
  popDelay: i * 1.2 + Math.random() * 2,
  floatDuration: Math.random() * 20 + 22,
  floatDelay: Math.random() * 6,
}));

const connectionPairs: [number, number][] = [
  [0, 3], [1, 4], [2, 5], [3, 7], [4, 8],
  [5, 9], [0, 6], [1, 7], [2, 8], [6, 9],
];

const decorativeText = [
  "WOT(u) = f(G, seeds)",
  "G = (V, E)",
  "score = f(hops)",
  "compute(trust)",
  "verify(sig)",
  "relay: wss://...",
];

function estimateLineLength(a: number, b: number): number {
  const dx = (floatingNodes[a].x - floatingNodes[b].x);
  const dy = (floatingNodes[a].y - floatingNodes[b].y);
  return Math.sqrt(dx * dx + dy * dy) * 12;
}

export default function PageBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.28] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/30 blur-[130px]"
          style={{ animation: "pageBlobA 28s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/20 blur-[150px]"
          style={{ animation: "pageBlobB 32s ease-in-out infinite 2s" }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/15 blur-[110px]"
          style={{ animation: "pageBlobC 24s ease-in-out infinite 5s" }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-[600px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute inset-0 w-full h-full">
          {connectionPairs.map(([a, b], i) => {
            const len = estimateLineLength(a, b);
            const drawDelay = i * 1.8 + 0.5;
            return (
              <line
                key={i}
                x1={`${floatingNodes[a].x}%`}
                y1={`${floatingNodes[a].y}%`}
                x2={`${floatingNodes[b].x}%`}
                y2={`${floatingNodes[b].y}%`}
                stroke="url(#pageBgLineGrad)"
                strokeWidth="1"
                strokeDasharray={len}
                strokeDashoffset={len}
                style={{
                  ["--dash" as string]: len,
                  animation: `pageLineDraw ${3 + (i % 3)}s ease-out ${drawDelay}s forwards, pageLinePulse 8s ease-in-out ${drawDelay + 3}s infinite`,
                } as React.CSSProperties}
              />
            );
          })}
          <defs>
            <linearGradient id="pageBgLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white border border-indigo-200/60 shadow-sm"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: node.size + 5,
              height: node.size + 5,
              opacity: 0,
              transform: "scale(0)",
              animation: `pageNodePop 0.6s ease-out ${node.popDelay}s forwards, pageNodeFloat ${node.floatDuration}s ease-in-out ${node.popDelay + 0.6}s infinite`,
            }}
          />
        ))}

        {decorativeText.map((calc, i) => (
          <div
            key={i}
            className="absolute text-xs font-mono text-indigo-400/30 select-none hidden md:block"
            style={{
              left: `${6 + (i % 3) * 32}%`,
              top: `${18 + Math.floor(i / 3) * 40}%`,
              opacity: 0,
              animation: `pageCalcFloat 8s ease-in-out ${i * 2.5 + 3}s infinite`,
            }}
          >
            {calc}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pageBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(15px) scale(1.03); }
        }
        @keyframes pageBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-20px) scale(1.05); }
        }
        @keyframes pageBlobC {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-25px); opacity: 0.35; }
        }
        @keyframes pageLineDraw {
          0% { stroke-dashoffset: var(--dash); opacity: 0.15; }
          15% { opacity: 0.3; }
          100% { stroke-dashoffset: 0; opacity: 0.22; }
        }
        @keyframes pageLinePulse {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.28; }
        }
        @keyframes pageNodePop {
          0% { opacity: 0; transform: scale(0); }
          60% { opacity: 0.4; transform: scale(1.3); }
          100% { opacity: 0.3; transform: scale(1); }
        }
        @keyframes pageNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.25; }
          50% { transform: translateY(-18px); opacity: 0.4; }
        }
        @keyframes pageCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          30%, 70% { opacity: 0.25; transform: translateY(-8px); }
        }
      `}</style>
    </>
  );
}
