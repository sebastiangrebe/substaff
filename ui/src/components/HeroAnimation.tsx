import { useEffect, useRef } from "react";

/**
 * HeroAnimation — Professional animated background.
 *
 * A structured grid with animated light pulses flowing along the lines,
 * suggesting data orchestration and AI coordination.
 * Clean, premium SaaS aesthetic — not space, not particles.
 */

interface Pulse {
  // Grid coordinate (which line)
  horizontal: boolean;
  lineIndex: number;
  position: number; // 0..1 along the line
  speed: number;
  length: number; // fraction of the line
  hue: number;
  brightness: number;
}

export function HeroAnimation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let running = true;
    let pulses: Pulse[] = [];
    let gridSpacing = 0;
    let cols = 0;
    let rows = 0;
    let offsetX = 0;
    let offsetY = 0;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;

      gridSpacing = Math.max(40, Math.min(60, Math.min(w, h) / 16));
      cols = Math.ceil(w / gridSpacing) + 1;
      rows = Math.ceil(h / gridSpacing) + 1;
      offsetX = (w - (cols - 1) * gridSpacing) / 2;
      offsetY = (h - (rows - 1) * gridSpacing) / 2;

      // Regenerate pulses
      pulses = [];
      const totalLines = cols + rows;
      const pulseCount = Math.floor(totalLines * 0.6);
      for (let i = 0; i < pulseCount; i++) {
        pulses.push(makePulse());
      }
    }

    function makePulse(): Pulse {
      const horizontal = Math.random() < 0.5;
      const maxIndex = horizontal ? rows : cols;
      return {
        horizontal,
        lineIndex: Math.floor(Math.random() * maxIndex),
        position: Math.random(),
        speed: (0.0004 + Math.random() * 0.0008) * (Math.random() < 0.5 ? 1 : -1),
        length: 0.06 + Math.random() * 0.12,
        hue: 235 + Math.random() * 30,
        brightness: 0.4 + Math.random() * 0.6,
      };
    }

    // Radial fade factor — 1 at center, 0 at edges
    function fadeFactor(x: number, y: number): number {
      const dx = (x - w * 0.5) / (w * 0.55);
      const dy = (y - h * 0.45) / (h * 0.55);
      const d = Math.sqrt(dx * dx + dy * dy);
      return Math.max(0, 1 - d);
    }

    function render(time: number) {
      if (!running) return;
      animRef.current = requestAnimationFrame(render);
      if (w === 0 || h === 0) return;

      const t = time * 0.001;
      ctx!.save();
      ctx!.scale(dpr, dpr);

      // Background
      ctx!.fillStyle = "#08090f";
      ctx!.fillRect(0, 0, w, h);

      // Gradient mesh — soft color zones
      const g1 = ctx!.createRadialGradient(w * 0.7, h * 0.2, 0, w * 0.7, h * 0.2, w * 0.6);
      g1.addColorStop(0, "rgba(99, 102, 241, 0.06)");
      g1.addColorStop(1, "transparent");
      ctx!.fillStyle = g1;
      ctx!.fillRect(0, 0, w, h);

      const g2 = ctx!.createRadialGradient(w * 0.2, h * 0.75, 0, w * 0.2, h * 0.75, w * 0.5);
      g2.addColorStop(0, "rgba(129, 140, 248, 0.04)");
      g2.addColorStop(1, "transparent");
      ctx!.fillStyle = g2;
      ctx!.fillRect(0, 0, w, h);

      // Draw grid lines
      ctx!.lineWidth = 0.5;
      for (let r = 0; r < rows; r++) {
        const y = offsetY + r * gridSpacing;
        const startFade = fadeFactor(0, y);
        const midFade = fadeFactor(w * 0.5, y);
        const endFade = fadeFactor(w, y);
        if (startFade < 0.01 && midFade < 0.01 && endFade < 0.01) continue;

        const grad = ctx!.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(99, 102, 241, ${startFade * 0.07})`);
        grad.addColorStop(0.5, `rgba(99, 102, 241, ${midFade * 0.07})`);
        grad.addColorStop(1, `rgba(99, 102, 241, ${endFade * 0.07})`);
        ctx!.strokeStyle = grad;
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }
      for (let c = 0; c < cols; c++) {
        const x = offsetX + c * gridSpacing;
        const startFade = fadeFactor(x, 0);
        const midFade = fadeFactor(x, h * 0.5);
        const endFade = fadeFactor(x, h);
        if (startFade < 0.01 && midFade < 0.01 && endFade < 0.01) continue;

        const grad = ctx!.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(99, 102, 241, ${startFade * 0.07})`);
        grad.addColorStop(0.5, `rgba(99, 102, 241, ${midFade * 0.07})`);
        grad.addColorStop(1, `rgba(99, 102, 241, ${endFade * 0.07})`);
        ctx!.strokeStyle = grad;
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }

      // Grid intersection dots
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = offsetX + c * gridSpacing;
          const y = offsetY + r * gridSpacing;
          const f = fadeFactor(x, y);
          if (f < 0.05) continue;

          const pulse = Math.sin(t * 0.5 + c * 0.4 + r * 0.3) * 0.5 + 0.5;
          const alpha = f * (0.06 + pulse * 0.06);
          ctx!.fillStyle = `rgba(129, 140, 248, ${alpha})`;
          ctx!.beginPath();
          ctx!.arc(x, y, 1 + pulse * 0.5, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      // Animated pulses flowing along grid lines
      for (const pulse of pulses) {
        pulse.position += pulse.speed;
        // Wrap around
        if (pulse.position > 1 + pulse.length) {
          pulse.position = -pulse.length;
        } else if (pulse.position < -pulse.length) {
          pulse.position = 1 + pulse.length;
        }

        const tailT = pulse.position - pulse.length;
        const headT = pulse.position;

        if (pulse.horizontal) {
          const y = offsetY + pulse.lineIndex * gridSpacing;
          const x0 = tailT * w;
          const x1 = headT * w;

          const mx = (x0 + x1) / 2;
          const f = fadeFactor(mx, y);
          if (f < 0.03) continue;

          const grad = ctx!.createLinearGradient(x0, 0, x1, 0);
          const baseAlpha = f * pulse.brightness;
          if (pulse.speed > 0) {
            grad.addColorStop(0, `hsla(${pulse.hue}, 60%, 65%, 0)`);
            grad.addColorStop(0.7, `hsla(${pulse.hue}, 60%, 65%, ${baseAlpha * 0.15})`);
            grad.addColorStop(1, `hsla(${pulse.hue}, 70%, 75%, ${baseAlpha * 0.35})`);
          } else {
            grad.addColorStop(0, `hsla(${pulse.hue}, 70%, 75%, ${baseAlpha * 0.35})`);
            grad.addColorStop(0.3, `hsla(${pulse.hue}, 60%, 65%, ${baseAlpha * 0.15})`);
            grad.addColorStop(1, `hsla(${pulse.hue}, 60%, 65%, 0)`);
          }
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.moveTo(x0, y);
          ctx!.lineTo(x1, y);
          ctx!.stroke();

          // Head glow
          const hx = pulse.speed > 0 ? x1 : x0;
          const glow = ctx!.createRadialGradient(hx, y, 0, hx, y, gridSpacing * 0.6);
          glow.addColorStop(0, `hsla(${pulse.hue}, 70%, 75%, ${baseAlpha * 0.08})`);
          glow.addColorStop(1, "transparent");
          ctx!.fillStyle = glow;
          ctx!.fillRect(hx - gridSpacing * 0.6, y - gridSpacing * 0.6, gridSpacing * 1.2, gridSpacing * 1.2);

        } else {
          const x = offsetX + pulse.lineIndex * gridSpacing;
          const y0 = tailT * h;
          const y1 = headT * h;

          const my = (y0 + y1) / 2;
          const f = fadeFactor(x, my);
          if (f < 0.03) continue;

          const grad = ctx!.createLinearGradient(0, y0, 0, y1);
          const baseAlpha = f * pulse.brightness;
          if (pulse.speed > 0) {
            grad.addColorStop(0, `hsla(${pulse.hue}, 60%, 65%, 0)`);
            grad.addColorStop(0.7, `hsla(${pulse.hue}, 60%, 65%, ${baseAlpha * 0.15})`);
            grad.addColorStop(1, `hsla(${pulse.hue}, 70%, 75%, ${baseAlpha * 0.35})`);
          } else {
            grad.addColorStop(0, `hsla(${pulse.hue}, 70%, 75%, ${baseAlpha * 0.35})`);
            grad.addColorStop(0.3, `hsla(${pulse.hue}, 60%, 65%, ${baseAlpha * 0.15})`);
            grad.addColorStop(1, `hsla(${pulse.hue}, 60%, 65%, 0)`);
          }
          ctx!.strokeStyle = grad;
          ctx!.lineWidth = 1.5;
          ctx!.beginPath();
          ctx!.moveTo(x, y0);
          ctx!.lineTo(x, y1);
          ctx!.stroke();

          // Head glow
          const hy = pulse.speed > 0 ? y1 : y0;
          const glow = ctx!.createRadialGradient(x, hy, 0, x, hy, gridSpacing * 0.6);
          glow.addColorStop(0, `hsla(${pulse.hue}, 70%, 75%, ${baseAlpha * 0.08})`);
          glow.addColorStop(1, "transparent");
          ctx!.fillStyle = glow;
          ctx!.fillRect(x - gridSpacing * 0.6, hy - gridSpacing * 0.6, gridSpacing * 1.2, gridSpacing * 1.2);
        }
      }

      // Ambient glow at center — soft focus point
      const centerGlow = ctx!.createRadialGradient(w * 0.5, h * 0.43, 0, w * 0.5, h * 0.43, Math.min(w, h) * 0.3);
      const glowPulse = Math.sin(t * 0.3) * 0.5 + 0.5;
      centerGlow.addColorStop(0, `rgba(99, 102, 241, ${0.02 + glowPulse * 0.015})`);
      centerGlow.addColorStop(1, "transparent");
      ctx!.fillStyle = centerGlow;
      ctx!.fillRect(0, 0, w, h);

      // Top accent line
      const accentGrad = ctx!.createLinearGradient(0, 0, w, 0);
      accentGrad.addColorStop(0, "transparent");
      accentGrad.addColorStop(0.3, "rgba(99, 102, 241, 0.15)");
      accentGrad.addColorStop(0.5, "rgba(129, 140, 248, 0.25)");
      accentGrad.addColorStop(0.7, "rgba(99, 102, 241, 0.15)");
      accentGrad.addColorStop(1, "transparent");
      ctx!.fillStyle = accentGrad;
      ctx!.fillRect(0, 0, w, 1);

      ctx!.restore();
    }

    resize();
    animRef.current = requestAnimationFrame(render);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    const onVis = () => {
      if (document.visibilityState !== "hidden" && running) {
        animRef.current = requestAnimationFrame(render);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
      style={{ display: "block" }}
    />
  );
}
