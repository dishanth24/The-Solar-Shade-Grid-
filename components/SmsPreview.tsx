"use client";

import React from "react";
import { useSim } from "@/lib/sim-context";
import {
  X,
  Phone,
  Signal,
  Wifi,
  Battery,
  ShieldAlert,
  ChevronLeft,
  SunMedium,
  CheckCircle2,
} from "lucide-react";

export function SmsPreview() {
  const { smsPreview, closeSmsPreview } = useSim();

  if (!smsPreview.isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="SMS Alert Preview"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSmsPreview();
      }}
    >
      <div className="relative flex flex-col items-center">
        {/* Floating Close Button */}
        <button
          onClick={closeSmsPreview}
          aria-label="Close SMS preview"
          className="absolute -top-10 right-0 text-white/70 hover:text-white flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
        >
          <span>Close</span>
          <X className="w-4 h-4" />
        </button>

        {/* Smartphone Shell */}
        <div className="w-[310px] h-[540px] rounded-[2.5rem] border-[6px] border-[#2A3F45] bg-[#0A1618] shadow-2xl flex flex-col overflow-hidden text-white relative">
          {/* Speaker / Camera Notch */}
          <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-4 bg-[#142327] rounded-full flex items-center justify-center gap-2 z-20">
            <div className="w-8 h-1 bg-[#2A3F45] rounded-full" />
            <div className="w-2 h-2 bg-[#1A2E33] rounded-full" />
          </div>

          {/* Status Bar */}
          <div className="pt-3 px-6 pb-2 flex items-center justify-between text-[10px] font-mono text-muted-foreground z-10 shrink-0">
            <span>09:41</span>
            <div className="flex items-center gap-1.5">
              <Signal className="w-2.5 h-2.5" />
              <Wifi className="w-2.5 h-2.5" />
              <Battery className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Message App Header */}
          <div className="px-4 py-2 bg-[#112328] border-b border-[#1E373E] flex flex-col items-center shrink-0">
            <div className="w-full flex items-center justify-between text-xs text-teal-200">
              <div className="flex items-center gap-0.5 text-[11px] text-[#5EB1BF] cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
                <span>Messages</span>
              </div>
              <Phone className="w-3.5 h-3.5 text-[#5EB1BF]" />
            </div>

            <div className="w-10 h-10 rounded-full bg-teal text-amber flex items-center justify-center my-1 shadow-sm">
              <SunMedium className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-xs font-bold text-[#F1F5F4] leading-tight">
              Solar Shade Grid Alert
            </h3>
            <span className="text-[9px] font-mono text-[#8FAAB0]">
              Co-Op Dispatch System
            </span>

            {/* Labelled "Sent via Twilio" only if ok is true, otherwise "Preview (Twilio unavailable)" */}
            {smsPreview.sentViaTwilio ? (
              <div className="mt-1.5 px-2.5 py-0.5 rounded-full bg-green/20 text-green border border-green/40 text-[9px] font-semibold tracking-wide flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Sent via Twilio</span>
              </div>
            ) : (
              <div className="mt-1.5 px-2.5 py-0.5 rounded-full bg-amber/15 text-amber border border-amber/30 text-[9px] font-semibold tracking-wide">
                Preview (Twilio unavailable)
              </div>
            )}
          </div>

          {/* Message Thread Body */}
          <div className="flex-1 p-3 overflow-y-auto flex flex-col justify-end gap-2 text-xs">
            <div className="text-center text-[10px] text-muted-foreground font-mono my-1">
              Today • Automated Alert
            </div>

            {/* SMS Bubble */}
            <div className="flex items-start gap-2 max-w-[90%]">
              <div className="w-6 h-6 rounded-full bg-red/20 text-red flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col gap-1">
                <div className="bg-[#17383F] border border-[#234B54] text-[#E8F3F5] p-3 rounded-2xl rounded-tl-xs shadow-sm text-xs leading-relaxed font-sans">
                  {smsPreview.text}
                </div>
                <div className="text-[9px] text-[#789AA0] font-mono px-1">
                  {smsPreview.sentViaTwilio ? "Delivered via Twilio SMS" : "On-screen preview mode"}
                </div>
              </div>
            </div>
          </div>

          {/* Fake Keyboard Input Footer */}
          <div className="p-2.5 bg-[#112328] border-t border-[#1E373E] flex items-center gap-2 shrink-0">
            <div className="flex-1 h-7 rounded-full bg-[#0A1618] border border-[#1E373E] px-3 flex items-center text-[10px] text-[#5C787E]">
              Text Message
            </div>
            <div className="w-6 h-6 rounded-full bg-teal text-paper flex items-center justify-center text-[10px] font-bold">
              ↑
            </div>
          </div>

          {/* Bottom Home Indicator */}
          <div className="pb-1.5 pt-0.5 flex justify-center shrink-0">
            <div className="w-24 h-1 bg-[#3A5057] rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
