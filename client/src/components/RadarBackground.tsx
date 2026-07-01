import { useEffect, useRef } from 'react';
import { setWaveData } from '@/lib/waveData';

export function RadarBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Honor reduced-motion: paint one static dark frame and skip the rAF loop
    // entirely (no per-frame main-thread work → better INP for these users).
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return () => window.removeEventListener('resize', resizeCanvas);
    }

    // Cap to ~30 FPS: the ambient waves are slow, so halving the redraw rate
    // frees the main thread for interaction handlers without a visible change.
    const FRAME_INTERVAL = 1000 / 30;

    const centerX = 10;
    const centerY = 10;
    const waves: WaveObj[] = [];

    const getWaveConfig = () => {
      const screenWidth = window.innerWidth;
      const isMobile = screenWidth < 768;
      return {
        maxRadius: Math.max(window.innerWidth, window.innerHeight) * 1.5,
        waveSpeed: isMobile ? 60 : 80,
        waveSpacing: isMobile ? 120 : 180,
        maxWaveWidth: isMobile ? 15 : 22.5,
        shadowBlur: 10
      };
    };

    let config = getWaveConfig();
    let waveCounter = 0;
    let lastFrameTime = performance.now();

    window.addEventListener('resize', () => {
      config = getWaveConfig();
    });

    class WaveObj {
      radius: number;
      opacity: number;
      beat: number;
      constructor(beat: number) {
        this.radius = 0;
        this.opacity = 1;
        this.beat = beat;
      }

      update(deltaTime: number) {
        this.radius += (config.waveSpeed * deltaTime) / 1000;
        this.opacity = Math.max(0, 1 - (this.radius / config.maxRadius));
      }

      draw() {
        if (!ctx || this.opacity <= 0 || this.radius <= 0) return;
        ctx.save();
        ctx.shadowBlur = config.shadowBlur;
        ctx.shadowColor = `rgba(0, 255, 100, ${this.opacity * 0.5})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 100, ${this.opacity})`;
        ctx.lineWidth = config.maxWaveWidth;
        ctx.stroke();
        ctx.restore();
      }

      isFinished() {
        return this.radius > config.maxRadius;
      }
    }

    const createWave = () => {
      if (waves.length === 0 || waves[waves.length - 1].radius >= config.waveSpacing) {
        waves.push(new WaveObj(waveCounter));
        waveCounter++;
      }
    };

    const animate = (currentTime: number) => {
      animationId = requestAnimationFrame(animate);
      const deltaTime = currentTime - lastFrameTime;
      if (deltaTime < FRAME_INTERVAL) return;
      lastFrameTime = currentTime;
      const safeDeltaTime = Math.min(deltaTime, 100);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      createWave();
      for (let i = waves.length - 1; i >= 0; i--) {
        waves[i].update(safeDeltaTime);
        waves[i].draw();
        if (waves[i].isFinished()) {
          waves.splice(i, 1);
        }
      }

      setWaveData(waves.map(w => ({ radius: w.radius, opacity: w.opacity })));

      ctx.save();
      ctx.shadowBlur = config.shadowBlur;
      ctx.shadowColor = 'rgba(0, 255, 100, 0.8)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 255, 200, 0)';
      ctx.fill();
      ctx.restore();
    };

    const startAnimation = () => {
      lastFrameTime = performance.now();
      animationId = requestAnimationFrame(animate);
    };

    startAnimation();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(animationId);
      } else {
        startAnimation();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full z-0 pointer-events-none"
    />
  );
}
