import { useMemo } from "react";
import { cn } from "../lib/utils";

interface CompanyPatternIconProps {
  companyName: string;
  brandColor?: string | null;
  className?: string;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Generate a deterministic hue from a company name when no brand color is set. */
function nameToHue(name: string): number {
  return hashString(name) % 360;
}

/** Convert a hex color like "#3b82f6" to an HSL hue value. */
function hexToHue(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

function getBgColor(companyName: string, brandColor?: string | null): string {
  if (brandColor) return brandColor;
  const hue = nameToHue(companyName.trim().toLowerCase());
  return `hsl(${hue} 65% 45%)`;
}

export function CompanyPatternIcon({ companyName, brandColor, className }: CompanyPatternIconProps) {
  const initial = companyName.trim().charAt(0).toUpperCase() || "?";
  const bgColor = useMemo(() => getBgColor(companyName, brandColor), [companyName, brandColor]);

  return (
    <div
      className={cn(
        "relative flex items-center justify-center w-11 h-11 text-base font-semibold text-white overflow-hidden",
        className,
      )}
      style={{ backgroundColor: bgColor }}
    >
      <span className="relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
        {initial}
      </span>
    </div>
  );
}
