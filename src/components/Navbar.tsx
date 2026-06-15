"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";

import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";

// Désactive SSR
const Navbar = dynamic(
  () =>
    Promise.resolve(function NavbarComponent() {
      return <NavbarContent />;
    }),
  {
    ssr: false,
  }
);

export { Navbar };

function NavbarContent() {

  const router = useRouter();

  const pathname = usePathname();

  const { user, logout } = useAuth();

  const { cart } = useCart();

  const [menuOpen, setMenuOpen] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {

    setMounted(true);

  }, []);

  if (!mounted) {

    return null;

  }

  // Cache navbar sur pages auth
  if (
    pathname?.startsWith("/auth") ||
    pathname === "/home"
  ) {

    return null;

  }

  const handleLogout = async () => {

    try {

      await logout();

      router.push("/auth/login");

    } catch (error) {

      console.error(error);

    }

  };

  const isActive = (path: string) =>

    pathname === path
      ? "text-green-600 font-semibold"
      : "text-gray-600 hover:text-green-600";

  return (

    <>

      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">

        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">

          {/* LOGO */}
          <Link
            href="/main/products"
            className="flex items-center gap-2 flex-shrink-0"
          >

            <Image
              src="/logo.png"
              alt="Logo"
              width={40}
              height={40}
            />

            <span className="font-bold text-green-700 text-lg hidden sm:block tracking-tight">
              AgriMarché
            </span>

          </Link>

          {/* NAV DESKTOP */}
          <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">

            <Link
              href="/main/products"
              className={`px-3 py-1.5 rounded-lg text-sm transition ${isActive(
                "/main/products"
              )}`}
            >
              Produits
            </Link>

            <Link
              href="/orders"
              className={`px-3 py-1.5 rounded-lg text-sm transition ${isActive(
                "/orders"
              )}`}
            >
              Commandes
            </Link>

          </nav>

          <div className="flex-1 md:flex-none" />

          {/* PANIER */}
          <Link
            href="/cart"
            className="relative p-2.5 rounded-xl bg-gray-50 hover:bg-green-50 transition"
          >

            <span className="text-xl">
              🛒
            </span>

            {cart?.itemCount > 0 && (

              <span className="absolute -top-1 -right-1 bg-green-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">

                {cart.itemCount > 9
                  ? "9+"
                  : cart.itemCount}

              </span>

            )}

          </Link>

          {/* USER */}
          {user ? (

            <div className="hidden md:flex items-center gap-2">

              <Link
                href="/account"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition"
              >

                <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center overflow-hidden text-sm">

                  {user.photoURL ? (

                    <img
                      src={user.photoURL}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />

                  ) : (

                    "👤"

                  )}

                </div>

                <span className="text-sm text-gray-700 max-w-[100px] truncate">

                  {user.displayName || "Profil"}

                </span>

              </Link>

              <button
                onClick={handleLogout}
                className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5 rounded-lg hover:bg-red-50 transition"
              >
                Déconnexion
              </button>

            </div>

          ) : (

            <Link
              href="/auth/login"
              className="hidden md:block text-sm font-medium text-green-700 hover:text-green-800 px-3 py-1.5 rounded-xl border border-green-200 hover:bg-green-50 transition"
            >
              Connexion
            </Link>

          )}

          {/* MENU MOBILE */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition"
          >

            <span className="text-xl">

              {menuOpen ? "✕" : "☰"}

            </span>

          </button>

        </div>

        {/* MOBILE MENU */}
        {menuOpen && (

          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-3 space-y-1">

            <MobileLink
              href="/main/products"
              label="Produits"
              onClick={() => setMenuOpen(false)}
              active={pathname === "/main/products"}
            />

            <MobileLink
              href="/cart"
              label={`Panier${
                cart?.itemCount > 0
                  ? ` (${cart.itemCount})`
                  : ""
              }`}
              onClick={() => setMenuOpen(false)}
              active={pathname === "/cart"}
            />

            <MobileLink
              href="/orders"
              label="Mes commandes"
              onClick={() => setMenuOpen(false)}
              active={pathname === "/orders"}
            />

            <MobileLink
              href="/account"
              label="Mon profil"
              onClick={() => setMenuOpen(false)}
              active={pathname === "/account"}
            />

            {user ? (

              <button
                onClick={() => {
                  setMenuOpen(false);
                  handleLogout();
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-red-600 hover:bg-red-50 transition text-sm font-medium"
              >
                Déconnexion
              </button>

            ) : (

              <MobileLink
                href="/auth/login"
                label="Connexion"
                onClick={() => setMenuOpen(false)}
                active={false}
              />

            )}

          </div>

        )}

      </header>

      {/* ESPACE BAS MOBILE */}
      <div className="md:hidden h-14" />

    </>

  );

}

function MobileLink({
  href,
  label,
  onClick,
  active,
}: {
  href: string;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {

  return (

    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition ${
        active
          ? "bg-green-50 text-green-700"
          : "text-gray-700 hover:bg-gray-50"
      }`}
    >

      <span>
        {label}
      </span>

    </Link>

  );

}