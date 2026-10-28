import React, { useState, useEffect } from "react";
import { Zap, Wifi, Battery } from "lucide-react";

interface MobileFrameProps {
  children: React.ReactNode;
}

export function MobileFrame({ children }: MobileFrameProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      setTime(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-[100dvh] bg-slate-900 flex items-center justify-center p-0 md:p-6 lg:p-8 font-sans overflow-hidden">
      {/* Background ambient circular glow */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full md:max-w-md h-[100dvh] md:h-[820px] bg-[#0A0A0B] text-[#F4F4F5] md:rounded-[48px] shadow-2xl relative border-0 md:border-[10px] border-[#18181b] flex flex-col overflow-hidden transition-all duration-300">
        
        {/* Dynamic Mobile OS Status Bar (Only visible on desktop/mock view) */}
        <div className="hidden md:flex w-full h-11 bg-[#0A0A0B] text-[#F4F4F5] items-center justify-between px-6 pt-1 select-none z-50 shrink-0 border-b border-[#18181b]">
          <span className="text-xs font-black tracking-wider font-mono text-emerald-500">{time}</span>
          
          {/* Simulated Screen Notch */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-32 h-6 bg-[#0A0A0B] rounded-b-2xl flex items-center justify-center">
            <div className="w-3 h-3 bg-black rounded-full border border-zinc-800 absolute right-6" />
            <div className="w-12 h-1 bg-zinc-850 rounded-full" />
          </div>

          <div className="flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-[10px] font-black tracking-wider text-emerald-500">5G</span>
            <Battery className="w-4 h-4 text-emerald-500 fill-emerald-500" />
          </div>
        </div>

        {/* Content Container */}
        <div className="flex-1 flex flex-col overflow-hidden relative bg-[#0A0A0B]">
          {children}
        </div>

        {/* Mobile OS Home indicator bar */}
        <div className="hidden md:flex w-full h-4 bg-[#0A0A0B] items-center justify-center pb-1 z-50 shrink-0 select-none border-t border-[#18181b]">
          <div className="w-32 h-1 bg-zinc-800 rounded-full" />
        </div>
      </div>
    </div>
  );
}
