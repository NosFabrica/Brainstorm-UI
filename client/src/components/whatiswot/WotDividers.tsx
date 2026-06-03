import { motion } from 'framer-motion';

export function ComputationDivider() {
  return (
    <>
          {/* Computation Divider */}
          <div className="flex items-center justify-center gap-4 my-8">
            <motion.div 
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(to right, transparent, rgba(99, 102, 241, 0.3), rgba(100, 116, 139, 0.5))' }}
              initial={{ scaleX: 0, originX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
            <motion.div 
              className="flex items-center gap-1 px-4 py-2 bg-slate-900/70 border border-indigo-500/20 rounded-full backdrop-blur-sm overflow-hidden"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 300 }}
              style={{ boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)' }}
            >
              {['Σ', '→', 'α', '×', 'T(u)'].map((symbol, i) => (
                <motion.span 
                  key={i}
                  className={`text-[10px] font-mono ${
                    symbol === 'Σ' ? 'text-indigo-400' :
                    symbol === 'α' ? 'text-violet-400' :
                    symbol === 'T(u)' ? 'text-emerald-400' :
                    'text-slate-500'
                  }`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    scale: [1, 1.2, 1],
                  }}
                  transition={{ 
                    opacity: { delay: 0.4 + i * 0.1, duration: 0.3 },
                    y: { delay: 0.4 + i * 0.1, duration: 0.3 },
                    scale: { delay: 0.6 + i * 0.15, duration: 0.4, repeat: Infinity, repeatDelay: 2 }
                  }}
                >
                  {symbol}
                </motion.span>
              ))}
            </motion.div>
            <motion.div 
              className="flex-1 h-px"
              style={{ background: 'linear-gradient(to right, rgba(100, 116, 139, 0.5), rgba(139, 92, 246, 0.3), transparent)' }}
              initial={{ scaleX: 0, originX: 1 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            />
          </div>
    </>
  );
}

export function GalaxyDivider() {
  return (
    <>
          {/* Galaxy Divider */}
          <div className="relative flex items-center justify-center my-10">
            {/* Left nebula trail */}
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-indigo-400/30" />
            
            {/* Central galaxy icon */}
            <div className="relative mx-3 flex items-center justify-center opacity-40">
              <svg 
                viewBox="0 0 64 64" 
                xmlns="http://www.w3.org/2000/svg" 
                className="w-6 h-6"
              >
                <g fill="#818cf8">
                  <path d="m32.81 7.54a2.9 2.9 0 0 0 -.5 3.92c1 1.75 4.79 1.54 4.59-1.5s-2.9-3.56-4.09-2.42zm2.93 2.33a1.37 1.37 0 0 1 -2.51.82 1.59 1.59 0 0 1 .28-2.14c.64-.62 2.11-.34 2.23 1.32zm-29.68 15.63c.21 0 1 .29 1.46-.09s.17-.37.25-1.54a26.66 26.66 0 0 1 1.83-6.62c1-2.13 4.92-6.79 10.38-9.34s11.92-2.62 17.83-1.16 12.09 6.62 15.19 11.66.46 14.92-1.29 18.88-9.71 8.58-15.71 8.83a16.45 16.45 0 0 1 -13.08-6c-2-2.71-3.84-9.46-1.34-14a9.93 9.93 0 0 1 8.63-5c1.75-.13 3.16 1.54 3.54 1.67a1.17 1.17 0 0 0 1.12-1.42c-.2-.92-3.62-3.58-10.7-.21s-6.17 10.25-5.77 13.3 2.08 11.2 12.5 13.12a21.83 21.83 0 0 0 20-6.46c2.25-2.58 5.59-7 5.46-15.62s-2.84-11.25-9.76-16.75-18-5.88-24-3.79-13.6 7.37-15.41 12.37-1.34 8.17-1.13 8.17zm2.88 8.62c-.42-1.79-1.94-2.61-3.34-1.91s-1.2 2.33-.33 3.79 4.08-.09 3.67-1.88zm-2.94 1.03c-.44-.74-.57-1.57.17-1.94a1.21 1.21 0 0 1 1.71 1c.21.9-1.43 1.69-1.88.94zm30.85-3.9c.8-5.71-4.58-5.9-6.79-5.38-5.41 1.29-4.79 6.59-2.71 8.63s8.71 2.5 9.5-3.25zm-6.29 2.54a3 3 0 0 1 -2.41-2.71 3.08 3.08 0 0 1 2.25-3.67c.93-.36 3.37-.12 4.2 1s.38 3.29.38 3.29-.5-.87-.63-.87-.66.17-.62.33a7.45 7.45 0 0 1 .54 1.59c-.08.2-.62.83-.75.66s-1.08-2.79-1.33-2.83-.79 0-.75.21 1.41 2.87 1.21 3.08-.75.38-.88.08-1-2.66-1.12-2.7-.92.2-.84.5.92 2 .75 2.04zm5.84 16.37c-1.42.84-1.88 2.5-1.13 4.55s5.17 2.41 5.79-.75a3.36 3.36 0 0 0 -4.66-3.8zm3.6 3.47c-.4 2-3.23 1.79-3.71.48s-.19-2.37.72-2.91a2.15 2.15 0 0 1 2.99 2.43zm-15.44-18.13c-1.46.71-1.21 2.33-.33 3.79s4.08-.08 3.67-1.88-1.9-2.61-3.34-1.91zm.4 2.94c-.44-.74-.57-1.57.17-1.93a1.2 1.2 0 0 1 1.71 1c.21.89-1.43 1.68-1.84.93zm24.6-18c0-1.88-2-3.16-3.16-2.3a2.25 2.25 0 0 0 -.55 3.25c.88 1.23 3.75.94 3.71-.93zm-2.62-1.37c.57-.43 1.55.21 1.57 1.14s-1.41 1.08-1.84.48a1.11 1.11 0 0 1 .27-1.6zm-31.62 9.24a1.71 1.71 0 0 0 -.41 2.48c.72 1 2.84.72 2.83-.7s-1.38-2.43-2.42-1.78zm1.51 1.68c-.15.73-1.09.88-1.46.36a.87.87 0 0 1 .21-1.27c.46-.35 1.4.18 1.25.91zm22.84 22.75c-1.38 1.09-.8 3 .54 3.71s3.08-.54 2.79-2.54-2-2.26-3.33-1.17zm2.34 2.09c-.29 1.29-1.84 1.36-2.2.41s.63-1.66 1.25-1.58 1.12.47.95 1.17z"/>
                </g>
              </svg>
            </div>
            
            {/* Right nebula trail */}
            <div className="flex-1 h-px bg-gradient-to-r from-indigo-400/30 via-violet-500/20 to-transparent" />
          </div>
    </>
  );
}

export function DotsDivider() {
  return (
    <>
          {/* Simple Dots Divider */}
          <div className="flex items-center justify-center gap-3 my-10">
            <div className="w-1 h-1 rounded-full bg-slate-600" />
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
            <div className="w-1 h-1 rounded-full bg-slate-600" />
          </div>
    </>
  );
}
