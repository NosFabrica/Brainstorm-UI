import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { getCurrentUser, logout, type NostrUser } from '@/services/nostr';
import { Footer } from '@/components/Footer';
import { WotBackground } from '@/components/whatiswot/WotBackground';
import { WotNav } from '@/components/whatiswot/WotNav';
import { WotHero } from '@/components/whatiswot/WotHero';
import { ControlCard } from '@/components/whatiswot/ControlCard';
import { ParameterTuning } from '@/components/whatiswot/ParameterTuning';
import { ShowVsTell } from '@/components/whatiswot/ShowVsTell';
import { FaqSection } from '@/components/whatiswot/FaqSection';
import { CtaSection } from '@/components/whatiswot/CtaSection';
import { ComputationDivider, GalaxyDivider, DotsDivider } from '@/components/whatiswot/WotDividers';
import type { UserMode } from '@/components/whatiswot/data';

export default function WhatIsWoT() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<UserMode>('normal');
  const [user, setUser] = useState<NostrUser | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    if (u) setUser(u);
  }, []);

  const handleLogout = () => {
    logout();
    setLocation('/');
  };

  const calcDone =
    typeof window !== "undefined" &&
    window.localStorage.getItem("brainstorm_calc_completed") === "true";

  return (
    <div className="min-h-screen bg-slate-950 relative overflow-hidden">
      <WotBackground />
      <div className="relative z-10">
        <WotNav
          user={user}
          mode={mode}
          setMode={setMode}
          onLogout={handleLogout}
          calcDone={calcDone}
          setLocation={setLocation}
        />

        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <WotHero mode={mode} />

          <ControlCard mode={mode} />

          <ComputationDivider />

          {mode === 'power' && <ParameterTuning />}

          <ShowVsTell mode={mode} />

          <GalaxyDivider />

          <FaqSection mode={mode} />

          <DotsDivider />

          <CtaSection mode={mode} setLocation={setLocation} />

        </div>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
