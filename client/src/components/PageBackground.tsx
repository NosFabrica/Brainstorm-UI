const floatingNodes = Array.from({ length: 6 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 2 + 1.5,
  duration: Math.random() * 30 + 25,
  delay: Math.random() * 8,
}));

const connectionPairs: [number, number][] = [
  [0, 2], [1, 3], [2, 4], [3, 5], [0, 4],
];

const decorativeText = [
  "WOT(u) = f(G, seeds)",
  "G = (V, E)",
  "score = f(hops)",
  "compute(trust)",
];

export default function PageBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.18] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/25 blur-[150px]"
          style={{ animation: "pageBlobA 35s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/15 blur-[160px]"
          style={{ animation: "pageBlobB 40s ease-in-out infinite 3s" }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/10 blur-[120px]"
          style={{ animation: "pageBlobC 30s ease-in-out infinite 6s" }}
        />
      </div>

      <div className="absolute top-0 left-0 right-0 h-[500px] overflow-hidden pointer-events-none z-0">
        <svg className="absolute inset-0 w-full h-full">
          {connectionPairs.map(([a, b], i) => (
            <line
              key={i}
              x1={`${floatingNodes[a].x}%`}
              y1={`${floatingNodes[a].y}%`}
              x2={`${floatingNodes[b].x}%`}
              y2={`${floatingNodes[b].y}%`}
              stroke="url(#pageBgLineGrad)"
              strokeWidth="0.75"
              className="opacity-0"
              style={{ animation: `pageLineFlash 14s ease-in-out infinite ${i * 2}s` }}
            />
          ))}
          <defs>
            <linearGradient id="pageBgLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.15" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white/60 border border-indigo-100/40"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: node.size + 4,
              height: node.size + 4,
              animation: `pageNodeFloat ${node.duration}s ease-in-out infinite ${node.delay}s`,
            }}
          />
        ))}

        {decorativeText.map((calc, i) => (
          <div
            key={i}
            className="absolute text-xs font-mono text-indigo-300/15 select-none hidden md:block"
            style={{
              left: `${10 + (i % 2) * 40}%`,
              top: `${25 + Math.floor(i / 2) * 35}%`,
              animation: `pageCalcFloat 12s ease-in-out infinite ${i * 2.5}s`,
            }}
          >
            {calc}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pageBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(12px) scale(1.02); }
        }
        @keyframes pageBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-15px) scale(1.03); }
        }
        @keyframes pageBlobC {
          0%, 100% { transform: translateY(0); opacity: 0.1; }
          50% { transform: translateY(-20px); opacity: 0.2; }
        }
        @keyframes pageLineFlash {
          0%, 100% { opacity: 0; }
          40%, 60% { opacity: 0.12; }
        }
        @keyframes pageNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.06; }
          50% { transform: translateY(-20px); opacity: 0.18; }
        }
        @keyframes pageCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          40%, 60% { opacity: 0.15; transform: translateY(-8px); }
        }
      `}</style>
    </>
  );
}
