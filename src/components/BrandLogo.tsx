// Logo Sunu Mëñëf — SVG inline (aucun fichier image requis).
// variant="full" : feuille + "SUNU / MËÑËF" (pages d'accueil, auth)
// variant="mark" : feuille seule, pour les petites tailles (header, navbar)

type BrandLogoProps = {
  size?: number;
  variant?: 'full' | 'mark';
  className?: string;
  title?: string;
};

export default function BrandLogo({
  size = 96,
  variant = 'full',
  className = '',
  title = 'Sunu Mëñëf',
}: BrandLogoProps) {
  const serif = "Georgia, 'Times New Roman', 'DejaVu Serif', serif";
  const isMark = variant === 'mark';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <circle cx="100" cy="100" r="95" fill="#EDE9EE" stroke="#A8E0CC" strokeWidth="6" />

      {isMark ? (
        <g>
          <line x1="100" y1="112" x2="100" y2="160" stroke="#6E776C" strokeWidth="5" strokeLinecap="round" />
          <path d="M100 36 C136 50 140 92 100 116 C60 92 64 50 100 36 Z" fill="#3F8F37" />
          <path d="M100 50 L100 104" stroke="#6DB45F" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          <line x1="100" y1="66" x2="100" y2="114" stroke="#6E776C" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M100 24 C121 32 124 56 100 70 C76 56 79 32 100 24 Z" fill="#3F8F37" />
          <path d="M100 32 L100 64" stroke="#6DB45F" strokeWidth="1.6" strokeLinecap="round" />
          <text x="100" y="144" textAnchor="middle" fontFamily={serif} fontWeight={700} fontSize="28" letterSpacing="2" fill="#4B504B">
            SUNU
          </text>
          <text x="100" y="164" textAnchor="middle" fontFamily={serif} fontWeight={700} fontSize="12" letterSpacing="3" fill="#6B706B">
            MËÑËF
          </text>
        </g>
      )}
    </svg>
  );
}
