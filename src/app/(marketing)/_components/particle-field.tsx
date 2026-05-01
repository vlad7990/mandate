/**
 * Hero background particles — 14 small dots drifting slowly across the
 * canvas. Pure CSS via positioned spans + per-particle keyframe
 * variants. Server-rendered (no JS state), animation is GPU-friendly
 * (transform + opacity only). Hidden on mobile via the .m-particles
 * media query in marketing.css.
 */

const PARTICLES: Array<{
  left: string;
  top: string;
  size: number;
  duration: number;
  delay: number;
  variant: 1 | 2 | 3 | 4;
}> = [
  { left: "8%", top: "22%", size: 3, duration: 22, delay: 0, variant: 1 },
  { left: "18%", top: "68%", size: 2, duration: 28, delay: 4, variant: 2 },
  { left: "24%", top: "12%", size: 4, duration: 26, delay: 8, variant: 3 },
  { left: "32%", top: "84%", size: 2, duration: 32, delay: 2, variant: 1 },
  { left: "44%", top: "30%", size: 3, duration: 24, delay: 12, variant: 4 },
  { left: "48%", top: "78%", size: 2, duration: 30, delay: 6, variant: 2 },
  { left: "56%", top: "16%", size: 3, duration: 28, delay: 9, variant: 3 },
  { left: "64%", top: "60%", size: 2, duration: 26, delay: 1, variant: 1 },
  { left: "72%", top: "26%", size: 4, duration: 34, delay: 14, variant: 4 },
  { left: "78%", top: "82%", size: 2, duration: 22, delay: 3, variant: 2 },
  { left: "84%", top: "44%", size: 3, duration: 30, delay: 7, variant: 3 },
  { left: "92%", top: "20%", size: 2, duration: 28, delay: 11, variant: 1 },
  { left: "12%", top: "48%", size: 2, duration: 36, delay: 5, variant: 4 },
  { left: "88%", top: "70%", size: 3, duration: 26, delay: 13, variant: 2 },
];

export function ParticleField() {
  return (
    <div className="m-particles" aria-hidden>
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={`m-particles__dot m-particles__dot--v${p.variant}`}
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
