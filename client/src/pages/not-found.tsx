import { useEffect, useRef } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

export default function NotFound() {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const RECT_W = 480;
    const RECT_H = 320;
    const RECT_RADIUS = 50;

    function resize() {
      if (!canvas || !scene) return;
      canvas.width = scene.offsetWidth;
      canvas.height = scene.offsetHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const waves: Wave[] = [];
    let lastTime: number | null = null;

    const SPEED = 80;
    const SPACING = 180;

    function getWaveIntensityAtPoint(x: number, y: number, thickness: number = 40): number {
      if (!canvas) return 0;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      let maxIntensity = 0;

      for (const wave of waves) {
        const diff = Math.abs(wave.radius - dist);
        if (diff < thickness) {
          const intensity = (1 - diff / thickness) * wave.opacity;
          maxIntensity = Math.max(maxIntensity, intensity);
        }
      }

      return maxIntensity;
    }

    class Wave {
      radius: number;
      constructor() { this.radius = 0; }
      update(dt: number) { this.radius += (SPEED * dt) / 1000; }
      get opacity() {
        const maxR = Math.hypot(RECT_W, RECT_H) / 2;
        return Math.max(0, 1 - this.radius / maxR);
      }
      draw(cx: number, cy: number) {
        if (this.opacity <= 0 || !ctx) return;
        ctx.save();
        ctx.shadowBlur = 25;
        ctx.shadowColor = `rgba(0, 255, 100, ${this.opacity * 0.6})`;
        ctx.beginPath();
        ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 100, ${this.opacity})`;
        ctx.lineWidth = 20;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(180, 255, 210, ${this.opacity * 0.7})`;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.restore();
      }
      isDone() {
        return this.radius > Math.hypot(RECT_W, RECT_H) / 2 + 20;
      }
    }

    function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
      if (!ctx) return;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    }

    function animate(now: number) {
      if (!canvas || !ctx) return;
      if (!lastTime) lastTime = now;
      const dt = Math.min(now - lastTime, 100);
      lastTime = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      const rx = cx - RECT_W / 2;
      const ry = cy - RECT_H / 2;

      ctx.save();
      roundedRectPath(rx, ry, RECT_W, RECT_H, RECT_RADIUS);
      ctx.clip();

      if (waves.length === 0 || waves[waves.length - 1].radius >= SPACING) {
        waves.push(new Wave());
      }

      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].update(dt);
        waves[i].draw(cx, cy);
        if (waves[i].isDone()) waves.splice(i, 1);
      }

      ctx.restore();

      animateText();
      requestAnimationFrame(animate);
    }

    function animateText() {
      const textCanvas = textCanvasRef.current;
      if (!textCanvas || !canvas) return;
      const textCtx = textCanvas.getContext('2d');
      if (!textCtx) return;

      textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);

      const text = '404';
      const fontSize = 140;
      textCtx.font = `${fontSize}px 'Bebas Neue', sans-serif`;
      textCtx.textBaseline = 'middle';
      textCtx.textAlign = 'center';

      const textX = textCanvas.width / 2;
      const textY = textCanvas.height / 2;

      const metrics = textCtx.measureText(text);
      const textWidth = metrics.width;

      const radarCenterX = canvas.width / 2;
      const radarCenterY = canvas.height / 2;

      const numSamples = 20;
      for (let i = 0; i < numSamples; i++) {
        const localX = textX - textWidth / 2 + (textWidth / (numSamples - 1)) * i;
        
        const globalX = radarCenterX + (localX - textCanvas.width / 2);
        const globalY = radarCenterY + (textY - textCanvas.height / 2);
        
        const intensity = getWaveIntensityAtPoint(globalX, globalY, 60);

        if (intensity > 0.01) {
          const segmentWidth = textWidth / numSamples;
          const x1 = textX - textWidth / 2 + (textWidth / numSamples) * i;

          textCtx.save();
          textCtx.beginPath();
          textCtx.rect(x1 - 5, textY - fontSize, segmentWidth + 10, fontSize * 2);
          textCtx.clip();

          textCtx.strokeStyle = `rgba(0, 255, 100, ${intensity * 0.85})`;
          textCtx.lineWidth = 4;
          textCtx.shadowBlur = 25 * intensity;
          textCtx.shadowColor = `rgba(0, 255, 100, ${intensity * 0.9})`;
          textCtx.strokeText(text, textX, textY);

          textCtx.restore();
        }
      }

      textCtx.shadowBlur = 0;
      textCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      textCtx.lineWidth = 1.5;
      textCtx.strokeText(text, textX, textY);
    }

    const animationId = requestAnimationFrame(animate);

    const textCanvas = textCanvasRef.current;
    if (textCanvas) {
      textCanvas.width = RECT_W;
      textCanvas.height = RECT_H;
    }

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Bebas+Neue&display=swap');

        .radar-scene {
          position: relative;
          width: 100%;
          height: 500px;
          background: #0a0a0a;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 12px;
        }

        #radar-canvas {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          z-index: 1;
        }

        .glass-wrapper {
          position: absolute;
          z-index: 2;
          width: 480px;
          height: 320px;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }

        .glass-box {
          width: 100%;
          height: 100%;
          border-radius: 50px;
          background: rgba(217, 217, 217, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
          backdrop-filter: blur(18px) saturate(80%);
          -webkit-backdrop-filter: blur(18px) saturate(80%);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .glass-box::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 100%);
          border-radius: 50px 50px 0 0;
          pointer-events: none;
        }

        .error-code {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 4;
          width: 480px;
          height: 320px;
          pointer-events: none;
        }

        .error-label {
          font-family: 'Share Tech Mono', monospace;
          font-size: 13px;
          letter-spacing: 4px;
          color: rgba(0,255,100,0.75);
          text-transform: uppercase;
          position: absolute;
          top: 65%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 1;
        }

        .error-sub {
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          letter-spacing: 2px;
          color: rgba(255,255,255,0.28);
          position: absolute;
          top: 75%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 1;
          white-space: nowrap;
        }

        .scan-line {
          position: absolute;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(0,255,100,0.25), transparent);
          animation: scan 4s linear infinite;
          z-index: 3;
        }

        @keyframes scan {
          0%   { top: 0%;   opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0a]">
        <div className="radar-scene" ref={sceneRef}>
          <canvas id="radar-canvas" ref={canvasRef}></canvas>
          <div className="glass-wrapper">
            <div className="glass-box">
              <div className="scan-line"></div>
              <canvas className="error-code" ref={textCanvasRef}></canvas>
              <div className="error-label">{t.notFound.signalLost}</div>
              <div className="error-sub">{t.notFound.pageNotFound}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
