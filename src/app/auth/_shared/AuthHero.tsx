'use client';

import Image from 'next/image';
import { displayFont } from './fonts';

// ─── Palette "Terroir du matin" ───────────────────────────
// Grounded dans le sujet (marketplace agricole sénégalaise) plutôt que
// dans un kit SaaS générique : indigo nuit (bazin/wax teint à l'indigo),
// terre cuite, or du mil à maturité, crème parcheminé — les couleurs
// d'un lever de jour sur un champ, pas d'un dashboard.
export const authPalette = {
  ink: '#14172E',
  inkLight: '#232750',
  terracotta: '#C6572A',
  gold: '#E7A73C',
  cream: '#F7F0E2',
  leaf: '#4E7A52',
};

type Variant = 'welcome' | 'signal' | 'sprout' | 'bloom';

function Furrows({ tint = authPalette.cream }: { tint?: string }) {
  // Six sillons qui remontent vers un horizon flou — le motif "terre
  // labourée" qui ancre chaque écran dans le même champ, plus net (plus
  // opaque) au premier plan, qui se fond dans la nuit en s'éloignant.
  const rows = [
    { y: 246, dip: 8, o: 0.5 },
    { y: 231, dip: 7, o: 0.4 },
    { y: 217, dip: 6, o: 0.32 },
    { y: 204, dip: 5, o: 0.24 },
    { y: 192, dip: 4, o: 0.17 },
    { y: 181, dip: 3, o: 0.11 },
  ];
  return (
    <g>
      {rows.map((r, i) => (
        <path
          key={i}
          d={`M -20 ${r.y} Q 200 ${r.y - r.dip} 420 ${r.y + 2}`}
          fill="none"
          stroke={tint}
          strokeWidth={1.25}
          opacity={r.o}
        />
      ))}
    </g>
  );
}

function Motif({ variant }: { variant: Variant }) {
  const cx = 200;
  const cy = 152;

  if (variant === 'signal') {
    // Le soleil cède la place à trois arcs qui montent, comme le signal
    // qui apporte le code — écho du motif "soleil" sans le répéter.
    return (
      <g stroke={authPalette.gold} fill="none" strokeLinecap="round">
        <circle cx={cx} cy={cy + 18} r={3.5} fill={authPalette.gold} stroke="none" />
        {[18, 32, 46].map((r, i) => (
          <path
            key={r}
            d={`M ${cx - r} ${cy + 18} A ${r} ${r} 0 0 1 ${cx + r} ${cy + 18}`}
            strokeWidth={2}
            opacity={1 - i * 0.28}
          />
        ))}
      </g>
    );
  }

  if (variant === 'sprout' || variant === 'bloom') {
    // Une jeune pousse : le mot de passe qu'on replante. `bloom` l'ouvre
    // en bourgeon pour marquer la réussite — même tige, geste terminé.
    return (
      <g>
        <path
          d={`M ${cx} 186 C ${cx - 4} 170, ${cx + 6} 160, ${cx} 142`}
          fill="none"
          stroke={authPalette.leaf}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx} 168 C ${cx - 18} 164, ${cx - 24} 152, ${cx - 16} 140`}
          fill="none"
          stroke={authPalette.leaf}
          strokeWidth={2.25}
          strokeLinecap="round"
        />
        <path
          d={`M ${cx + 1} 158 C ${cx + 19} 154, ${cx + 25} 144, ${cx + 17} 132`}
          fill="none"
          stroke={authPalette.leaf}
          strokeWidth={2.25}
          strokeLinecap="round"
        />
        {variant === 'bloom' ? (
          <g>
            {[0, 72, 144, 216, 288].map((deg) => {
              const rad = (deg * Math.PI) / 180;
              const px = cx + Math.cos(rad) * 9;
              const py = 140 + Math.sin(rad) * 9;
              return <circle key={deg} cx={px} cy={py} r={6} fill={authPalette.gold} opacity={0.9} />;
            })}
            <circle cx={cx} cy={140} r={5} fill={authPalette.terracotta} />
          </g>
        ) : (
          <circle cx={cx} cy={140} r={4.5} fill={authPalette.gold} />
        )}
      </g>
    );
  }

  // 'welcome' — lever de soleil : le début d'une session, comme le début
  // d'une journée de marché.
  return (
    <g>
      <circle cx={cx} cy={cy} r={46} fill={authPalette.gold} opacity={0.16} />
      <circle cx={cx} cy={cy} r={30} fill="url(#sunGradient)" />
      {[[-26, -8], [-14, -26], [4, -32], [22, -22]].map(([dx, dy], i) => (
        <line
          key={i}
          x1={cx + dx * 0.7}
          y1={cy + dy * 0.7}
          x2={cx + dx * 1.15}
          y2={cy + dy * 1.15}
          stroke={authPalette.gold}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.85}
        />
      ))}
    </g>
  );
}

export function AuthHero({
  variant,
  title,
  subtitle,
  compact = false,
}: {
  variant: Variant;
  title: string;
  subtitle: string;
  compact?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden ${compact ? 'pt-10 pb-16' : 'pt-14 pb-20'}`} style={{ background: authPalette.ink }}>
      <svg
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={authPalette.ink} />
            <stop offset="100%" stopColor={authPalette.inkLight} />
          </linearGradient>
          <radialGradient id="sunGradient" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={authPalette.gold} />
            <stop offset="100%" stopColor={authPalette.terracotta} />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={400} height={260} fill="url(#skyGradient)" />
        <Motif variant={variant} />
        <Furrows />
      </svg>

      <div className="relative flex flex-col items-center px-6 text-center">
        <div className="mb-5 h-16 w-16 overflow-hidden rounded-full ring-2 ring-[#E7A73C]/40 shadow-lg">
          <Image src="/logo.png" alt="AgriMarché" width={64} height={64} className="h-full w-full object-cover" />
        </div>
        <h1
          className={`${displayFont.className} text-[1.7rem] leading-tight text-[#F7F0E2]`}
          style={{ fontStyle: 'normal' }}
        >
          {title}
        </h1>
        <p className="mt-2 max-w-[19rem] text-sm text-[#F7F0E2]/70">{subtitle}</p>
      </div>
    </div>
  );
}
