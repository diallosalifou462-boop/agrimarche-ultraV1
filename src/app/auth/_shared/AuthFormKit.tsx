'use client';

import { ReactNode, InputHTMLAttributes, KeyboardEvent, ClipboardEvent } from 'react';
import { uiFont } from './fonts';
import { authPalette } from './AuthHero';

// ─── Carte : feuille crème posée sous le champ (voir AuthHero), coins
// arrondis seulement en haut — un seul rayon marqué dans toute l'écran,
// tout le reste (inputs, bouton) reste discret plutôt que de répéter le
// même arrondi partout. ─────────────────────────────────────────────
export function AuthSheet({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${uiFont.className} relative -mt-7 rounded-t-[1.75rem] px-6 pb-10 pt-7 shadow-[0_-12px_30px_rgba(20,23,46,0.12)]`}
      style={{ background: authPalette.cream }}
    >
      {children}
    </div>
  );
}

export function AuthErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-4 rounded-xl px-4 py-3 text-sm"
      style={{ background: 'rgba(198,87,42,0.1)', color: authPalette.terracotta }}
    >
      {children}
    </div>
  );
}

// ─── Champ "ligne de carnet" : pas de boîte grise, un simple trait qui
// s'accentue au focus — registre carnet de comptes de marché plutôt que
// carte SaaS. ─────────────────────────────────────────────────────────
export function LineField({
  label,
  icon,
  trailing,
  prefix,
  ...inputProps
}: {
  label: string;
  icon: ReactNode;
  trailing?: ReactNode;
  prefix?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.8rem] font-medium" style={{ color: `${authPalette.ink}99` }}>
        {label}
      </span>
      <div
        className="flex items-center gap-2 border-b-[1.5px] pb-2 transition-colors focus-within:border-[#C6572A]"
        style={{ borderColor: `${authPalette.ink}26` }}
      >
        <span style={{ color: authPalette.terracotta }}>{icon}</span>
        {prefix && (
          <span className="text-sm font-medium" style={{ color: `${authPalette.ink}80` }}>
            {prefix}
          </span>
        )}
        <input
          {...inputProps}
          className="flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-[#14172E]/35"
          style={{ color: authPalette.ink }}
        />
        {trailing}
      </div>
    </label>
  );
}

export function PrimaryButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="w-full rounded-xl py-3.5 text-[0.95rem] font-semibold text-[#F7F0E2] transition disabled:opacity-50"
      style={{ background: authPalette.terracotta }}
    >
      {children}
    </button>
  );
}

export function AuthLink({ children, ...props }: { children: ReactNode } & React.ComponentProps<'a'>) {
  return (
    <a {...props} className="font-semibold" style={{ color: authPalette.terracotta }}>
      {children}
    </a>
  );
}

export function BackRow({ onClick, label = 'Retour' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="mb-5 flex items-center gap-1.5 text-sm"
      style={{ color: `${authPalette.ink}80` }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

// ─── Six cases OTP — même geste qu'avant (saisie/backspace/coller),
// recolorées dans la palette "terroir du matin" plutôt qu'en vert générique. ─
export function OtpCells({
  digits,
  refs,
  onChange,
  onKeyDown,
  onPaste,
}: {
  digits: string[];
  refs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onChange: (i: number, val: string) => void;
  onKeyDown: (i: number, e: KeyboardEvent) => void;
  onPaste: (e: ClipboardEvent) => void;
}) {
  return (
    <div className="mb-6 flex justify-center gap-2" onPaste={onPaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => onChange(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          className="h-12 w-10 rounded-xl border-2 text-center text-lg font-semibold outline-none transition-all"
          style={{
            borderColor: digit ? authPalette.terracotta : `${authPalette.ink}22`,
            background: digit ? 'rgba(198,87,42,0.08)' : 'transparent',
            color: authPalette.ink,
          }}
        />
      ))}
    </div>
  );
}
