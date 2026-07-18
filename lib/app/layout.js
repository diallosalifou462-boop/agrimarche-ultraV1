"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
exports.default = RootLayout;
const link_1 = __importDefault(require("next/link"));
require("./globals.css");
const AuthContext_1 = require("@/contexts/AuthContext");
const NotificationProvider_1 = require("@/components/NotificationProvider");
const NotificationBell_1 = require("@/components/NotificationBell");
exports.metadata = {
    title: 'AgriMarché - Votre marché agricole',
    description: 'Achetez et vendez des produits agricoles frais au Sénégal',
};
function RootLayout({ children, }) {
    return (<html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthContext_1.AuthProvider>
          <NotificationProvider_1.NotificationProvider>
            {/* ✅ Le header est À L'INTÉRIEUR du NotificationProvider */}
            <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
              <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
                <link_1.default href="/" className="flex items-center gap-2 hover:opacity-80 transition">
                  <span className="text-2xl">🌾</span>
                  <span className="font-bold text-emerald-700 text-lg">AgriMarché</span>
                </link_1.default>
                <div className="flex items-center gap-4">
                  <link_1.default href="/cart" className="text-gray-600 hover:text-emerald-600 transition">
                    🛒 Panier
                  </link_1.default>
                  <NotificationBell_1.NotificationBell />
                  <link_1.default href="/account" className="text-gray-600 hover:text-emerald-600 transition">
                    👤 Compte
                  </link_1.default>
                </div>
              </div>
            </header>
            <main>{children}</main>
          </NotificationProvider_1.NotificationProvider>
        </AuthContext_1.AuthProvider>
      </body>
    </html>);
}
