const floatingNodes = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 2.5 + 1.5,
  duration: Math.random() * 25 + 20,
  delay: Math.random() * 6,
}));

const connectionPairs: [number, number][] = [
  [0, 2], [1, 3], [2, 5], [3, 6], [4, 7], [0, 5], [1, 6],
];

const decorativeText = [
  "WOT(u) = f(G, seeds)",
  "G = (V, E)",
  "score = f(hops)",
  "compute(trust)",
  "verify(sig)",
];

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
              strokeWidth="1"
              className="opacity-0"
              style={{ animation: `pageLineFlash 10s ease-in-out infinite ${i * 1.5}s` }}
            />
          ))}
          <defs>
            <linearGradient id="pageBgLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.25" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white/70 border border-indigo-100/50 shadow-sm"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: node.size + 5,
              height: node.size + 5,
              animation: `pageNodeFloat ${node.duration}s ease-in-out infinite ${node.delay}s`,
            }}
          />
        ))}

        {decorativeText.map((calc, i) => (
          <div
            key={i}
            className="absolute text-xs font-mono text-indigo-400/25 select-none hidden md:block"
            style={{
              left: `${8 + (i % 3) * 30}%`,
              top: `${22 + Math.floor(i / 3) * 35}%`,
              animation: `pageCalcFloat 9s ease-in-out infinite ${i * 1.8}s`,
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
        @keyframes pageLineFlash {
          0%, 100% { opacity: 0; }
          40%, 60% { opacity: 0.2; }
        }
        @keyframes pageNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.1; }
          50% { transform: translateY(-25px); opacity: 0.3; }
        }
        @keyframes pageCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          40%, 60% { opacity: 0.25; transform: translateY(-10px); }
        }
      `}</style>
    </>
  );
}
