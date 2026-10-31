"use client";

import React, { useEffect, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion } from "framer-motion";

export interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  format?: (n: number) => string;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  format,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const shouldReduceMotion = useReducedMotion();
  const motionVal = useMotionValue(value);
  const spring = useSpring(motionVal, {
    mass: 0.6,
    stiffness: 85,
    damping: 18,
  });

  const spanRef = useRef<HTMLSpanElement>(null);

  const formatNumber = (n: number): string => {
    if (format) return format(n);
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    if (shouldReduceMotion) {
      if (spanRef.current) {
        spanRef.current.textContent = `${prefix}${formatNumber(value)}${suffix}`;
      }
      return;
    }

    const unsubscribe = spring.on("change", (latest) => {
      if (spanRef.current) {
        spanRef.current.textContent = `${prefix}${formatNumber(latest)}${suffix}`;
      }
    });

    return () => unsubscribe();
  }, [spring, value, decimals, prefix, suffix, shouldReduceMotion]);

  return (
    <span ref={spanRef} className={className}>
      {prefix}
      {formatNumber(value)}
      {suffix}
    </span>
  );
}
