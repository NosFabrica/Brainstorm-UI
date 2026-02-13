const floatingNodes = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 3 + 2,
  duration: Math.random() * 20 + 15,
  delay: Math.random() * 5,
}));

const connectionPairs: [number, number][] = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8],
  [6, 9], [7, 10], [8, 11], [0, 6], [2, 8], [4, 10],
];

const decorativeText = [
  "WOT(u) = f(G, seeds)",
  "sig = Schnorr(sk, id)",
  "G = (V, E)",
  "score = f(hops)",
  "relay: wss://...",
  "kind:0 metadata",
  "verify(sig)",
  "compute(trust)",
];

export default function PageBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.4] pointer-events-none" />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/40 blur-[120px]"
          style={{ animation: "pageBlobA 20s ease-in-out infinite" }}
        />
        <div
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/30 blur-[140px]"
          style={{ animation: "pageBlobB 25s ease-in-out infinite 2s" }}
        />
        <div
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/20 blur-[100px]"
          style={{ animation: "pageBlobC 18s ease-in-out infinite 5s" }}
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
              strokeWidth="1.5"
              className="opacity-0"
              style={{ animation: `pageLineFlash 8s ease-in-out infinite ${i * 0.8}s` }}
            />
          ))}
          <defs>
            <linearGradient id="pageBgLineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
            </linearGradient>
          </defs>
        </svg>

        {floatingNodes.map((node) => (
          <div
            key={node.id}
            className="absolute rounded-full bg-white border-2 border-indigo-100 shadow-sm"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: node.size + 6,
              height: node.size + 6,
              animation: `pageNodeFloat ${node.duration}s ease-in-out infinite ${node.delay}s`,
            }}
          />
        ))}

        {decorativeText.map((calc, i) => (
          <div
            key={i}
            className="absolute text-xs font-mono text-indigo-400/40 select-none hidden md:block"
            style={{
              left: `${8 + (i % 4) * 22}%`,
              top: `${20 + Math.floor(i / 4) * 40}%`,
              animation: `pageCalcFloat 6s ease-in-out infinite ${i * 1.2}s`,
            }}
          >
            {calc}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pageBlobA {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(20px) scale(1.05); }
        }
        @keyframes pageBlobB {
          0%, 100% { transform: translateX(0) scale(1); }
          50% { transform: translateX(-30px) scale(1.1); }
        }
        @keyframes pageBlobC {
          0%, 100% { transform: translateY(0); opacity: 0.3; }
          50% { transform: translateY(-40px); opacity: 0.6; }
        }
        @keyframes pageLineFlash {
          0%, 100% { opacity: 0; }
          40%, 60% { opacity: 0.3; }
        }
        @keyframes pageNodeFloat {
          0%, 100% { transform: translateY(0); opacity: 0.15; }
          50% { transform: translateY(-40px); opacity: 0.5; }
        }
        @keyframes pageCalcFloat {
          0%, 100% { opacity: 0; transform: translateY(0); }
          40%, 60% { opacity: 0.35; transform: translateY(-15px); }
        }
      `}</style>
    </>
  );
}
