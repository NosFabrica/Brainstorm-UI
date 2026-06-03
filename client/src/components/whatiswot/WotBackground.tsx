import { motion } from 'framer-motion';
import { floatingNodes, connectionPairs, calculations } from './data';

export function WotBackground() {
  return (
    <>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:32px_32px]" />
      <motion.div
        className="absolute top-[10%] left-[15%] w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl"
        animate={{
          opacity: [0.3, 0.6, 0.3],
          scale: [1, 1.2, 1],
          x: [0, 20, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[20%] right-[10%] w-48 h-48 rounded-full bg-violet-600/5 blur-3xl"
        animate={{
          opacity: [0.2, 0.5, 0.2],
          scale: [1, 1.3, 1],
          y: [0, -15, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      <motion.div
        className="absolute top-[50%] right-[25%] w-32 h-32 rounded-full bg-blue-500/5 blur-2xl"
        animate={{
          opacity: [0.1, 0.4, 0.1],
          scale: [1, 1.4, 1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {connectionPairs.map(([a, b], i) => (
          <motion.line
            key={i}
            x1={`${floatingNodes[a].x}%`}
            y1={`${floatingNodes[a].y}%`}
            x2={`${floatingNodes[b].x}%`}
            y2={`${floatingNodes[b].y}%`}
            stroke="url(#wotLineGradient)"
            strokeWidth="0.5"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.3, 0] }}
            transition={{
              duration: 8,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeInOut",
            }}
          />
        ))}
        <defs>
          <linearGradient id="wotLineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>
      {floatingNodes.map((node) => (
        <motion.div
          key={node.id}
          className="absolute rounded-full bg-indigo-400"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: node.size + 2,
            height: node.size + 2,
          }}
          animate={{
            y: [0, -40, 0],
            opacity: [0.2, 0.7, 0.2],
            scale: [1, 1.5, 1],
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
          className="absolute text-xs font-mono text-indigo-400/60 pointer-events-none select-none hidden md:block"
          style={{
            left: `${5 + (i % 4) * 25}%`,
            top: `${15 + Math.floor(i / 4) * 70}%`,
          }}
          animate={{
            opacity: [0, 0.3, 0],
            y: [0, -15, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            delay: i * 1.2,
            ease: "easeInOut",
          }}
        >
          {calc}
        </motion.div>
      ))}
    </>
  );
}
