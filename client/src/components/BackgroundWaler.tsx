import { useRef, useEffect } from 'react';
import { getWaveIntensityAtPoint } from '@/lib/waveData';

export function BackgroundWaler() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const text = 'WALER';
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };

    resize();

    const getFontSize = () => {
      const w = window.innerWidth;
      if (w < 480) return 60;
      if (w < 768) return 90;
      if (w < 1200) return 140;
      return 180;
    };

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const FRAME_INTERVAL = 1000 / 30; // cap to ~30 FPS to keep the main thread free
    let lastDraw = 0;

    const drawFrame = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const fontSize = getFontSize();
      ctx.font = `${fontSize}px Lalezar, cursive`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';

      const textX = w / 2;
      const textY = h * 0.45;

      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;

      const numSamples = 12;
      for (let i = 0; i < numSamples; i++) {
        const sampleX = textX - textWidth / 2 + (textWidth / (numSamples - 1)) * i;
        const intensity = getWaveIntensityAtPoint(sampleX, textY, 50);

        if (intensity > 0.01) {
          const segmentWidth = textWidth / numSamples;
          const x1 = textX - textWidth / 2 + (textWidth / numSamples) * i;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x1 - 2, textY - fontSize, segmentWidth + 4, fontSize * 2);
          ctx.clip();

          ctx.strokeStyle = `rgba(0, 255, 100, ${intensity * 0.7})`;
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 15 * intensity;
          ctx.shadowColor = `rgba(0, 255, 100, ${intensity * 0.8})`;
          ctx.strokeText(text, textX, textY);

          ctx.restore();
        }
      }

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = 1.5;
      ctx.strokeText(text, textX, textY);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
      ctx.lineWidth = 0.5;
      ctx.strokeText(text, textX, textY);
    };

    const tick = (currentTime: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (currentTime - lastDraw < FRAME_INTERVAL) return;
      lastDraw = currentTime;
      drawFrame();
    };

    document.fonts?.ready.then(() => {
      if (prefersReducedMotion) {
        // One static frame of the faint WALER wordmark, no animation loop.
        drawFrame();
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    });

    const handleResize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
      data-testid="background-waler"
    />
  );
}
