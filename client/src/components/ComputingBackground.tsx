import { motion } from "framer-motion";

const floatingNodes = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  x: 10 + Math.random() * 80,
  y: 10 + Math.random() * 80,
  size: Math.random() * 3 + 2,
  duration: Math.random() * 20 + 15,
  delay: Math.random() * 5,
}));

const connectionPairs = [
  [0, 3], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 10], [8, 11], [0, 6], [2, 8], [4, 10]
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
];

export const ComputingBackground = () => {
  return (
    <>
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none z-0" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />
      
      <div className="absolute inset-0 bg-[#F8FAFC] pointer-events-none -z-10" />
      
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#E2E8F0_1px,transparent_1px),linear-gradient(to_bottom,#E2E8F0_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.4] pointer-events-none z-0" />
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div 
          className="absolute -top-[20%] -left-[10%] w-[80%] h-[80%] rounded-full bg-slate-200/40 blur-[120px]"
          animate={{ 
            x: [0, 20, 0], 
            scale: [1, 1.05, 1],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute top-[10%] -right-[20%] w-[80%] h-[80%] rounded-full bg-indigo-100/30 blur-[140px]"
          animate={{ 
            x: [0, -30, 0], 
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        
        <motion.div 
          className="absolute bottom-[10%] left-[20%] w-[40%] h-[40%] rounded-full bg-violet-100/20 blur-[100px]"
          animate={{ 
            y: [0, -40, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 5 }}
        />
      </div>

      <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
        {connectionPairs.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={`${floatingNodes[a].x}%`}
            y1={`${floatingNodes[a].y}%`}
            x2={`${floatingNodes[b].x}%`}
            y2={`${floatingNodes[b].y}%`}
            stroke="url(#lineGradient)"
            strokeWidth="1.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0.1, 0.4, 0.1] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeInOut",
            }}
          />
        ))}
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.4" />
          </linearGradient>
        </defs>
      </svg>

      {floatingNodes.map((node) => (
        <motion.div
          key={node.id}
          className="absolute rounded-full bg-white border-2 border-indigo-100 z-0 shadow-sm"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size + 6,
            height: node.size + 6,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0.4, 0.8, 0.4],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: node.duration,
            repeat: Infinity,
            delay: node.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {calculations.map((calc, i) => (
        <motion.div
          key={i}
          className="absolute text-[11px] font-mono text-indigo-900/30 font-semibold pointer-events-none select-none hidden md:block tracking-widest uppercase z-0"
          style={{
            left: `${5 + (i % 4) * 25}%`,
            top: `${10 + Math.floor(i / 4) * 70}%`,
          }}
          animate={{
            opacity: [0.2, 0.6, 0.2],
            y: [0, -20, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            delay: i * 1.5,
            ease: "easeInOut",
          }}
        >
          {calc}
        </motion.div>
      ))}
    </>
  )
}
