"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SellerDashboardLayout;
const link_1 = __importDefault(require("next/link"));
const navigation_1 = require("next/navigation");
const NAV_ITEMS = [
    { href: '/dashboard/seller/dashboard', icon: '📊', label: 'Vue d\'ensemble' },
    { href: '/dashboard/seller/products', icon: '📦', label: 'Mes produits' },
    { href: '/dashboard/seller/orders', icon: '🧾', label: 'Commandes' },
    { href: '/dashboard/seller/earnings', icon: '💰', label: 'Revenus' },
];
function SellerDashboardLayout({ children }) {
    const pathname = (0, navigation_1.usePathname)();
    return (<div className="min-h-screen bg-gray-50 flex">

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 sticky top-14 h-[calc(100vh-3.5rem)] flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dashboard Vendeur</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href;
            return (<link_1.default key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${active
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}>
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </link_1.default>);
        })}
        </nav>
        <div className="px-3 py-4 border-t border-gray-100">
          <link_1.default href="/main/products" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition">
            <span>←</span>
            <span>Retour à la boutique</span>
          </link_1.default>
        </div>
      </aside>

      {/* ── CONTENU PRINCIPAL ── */}
      <div className="flex-1 min-w-0">
        {/* Nav mobile dashboard */}
        <div className="md:hidden flex overflow-x-auto bg-white border-b border-gray-200 px-2 py-2 gap-1 sticky top-14 z-30">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href;
            return (<link_1.default key={item.href} href={item.href} className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition ${active ? 'bg-green-50 text-green-700' : 'text-gray-600'}`}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </link_1.default>);
        })}
        </div>

        {children}
      </div>
    </div>);
}
