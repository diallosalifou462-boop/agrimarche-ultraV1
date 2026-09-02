'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, Lock, Eye, Trash2, Mail, Phone } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-900 pt-12 pb-8 px-5">
        <Link href="/" className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4">
          <ArrowLeft size={20} />
          Retour
        </Link>
        <h1 className="text-white text-3xl font-semibold tracking-tight">Politique de confidentialité</h1>
        <p className="text-gray-400 text-sm mt-2">Dernière mise à jour : 2 juin 2026</p>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 space-y-6">
        {/* Introduction */}
        <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={22} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Protection de vos données personnelles</h2>
          </div>
          <p className="text-gray-600 leading-relaxed">
            AgriMarche attache une importance particulière à la protection de vos informations personnelles. 
            Cette politique décrit les modalités de collecte, d'utilisation et de conservation de vos données.
          </p>
        </div>

        {/* Informations collectées */}
        <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <Eye size={22} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Données collectées</h2>
          </div>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span><strong className="font-medium text-gray-800">Informations d'inscription :</strong> nom, adresse e-mail, numéro de téléphone</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span><strong className="font-medium text-gray-800">Données de commande :</strong> produits commandés, adresse de livraison, historique d'achats</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span><strong className="font-medium text-gray-800">Données de navigation :</strong> pages consultées, durée des sessions</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span><strong className="font-medium text-gray-800">Données de localisation :</strong> uniquement avec votre consentement explicite</span>
            </li>
          </ul>
        </div>

        {/* Utilisation des données */}
        <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <Lock size={22} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Finalités du traitement</h2>
          </div>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span>Traitement et acheminement de vos commandes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span>Notifications relatives au suivi de commandes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span>Amélioration continue de nos services</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-400">—</span>
              <span>Envoi d'offres commerciales (sous réserve de votre consentement)</span>
            </li>
          </ul>
        </div>

        {/* Sécurité et conservation */}
        <div className="bg-white rounded-lg p-8 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <Trash2 size={22} className="text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Sécurité et durée de conservation</h2>
          </div>
          <p className="text-gray-600 leading-relaxed mb-3">
            Vos données sont hébergées sur des serveurs sécurisés et font l'objet de mesures de protection techniques appropriées. 
            AgriMarche ne commercialise aucune donnée personnelle.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Vous pouvez à tout moment demander la suppression de vos données en nous contactant.
          </p>
        </div>

        {/* Vos droits */}
        <div className="bg-gray-50 rounded-lg p-8 border border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">Vos droits</h2>
          <p className="text-gray-600 text-sm mb-4">
            Conformément au Règlement Général sur la Protection des Données (RGPD) et à la réglementation en vigueur, 
            vous bénéficiez d'un droit d'accès, de rectification, d'opposition et d'effacement de vos données.
          </p>
          <p className="text-gray-700 text-sm font-medium mb-3">
            Pour exercer ces droits, veuillez nous contacter :
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-600">
              <Mail size={15} />
              <span className="text-sm">support@agrimarche.com</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Phone size={15} />
              <span className="text-sm">+221 77 97 47 073</span>
            </div>
          </div>
        </div>

        {/* Mentions légales */}
        <div className="border-t border-gray-200 pt-6 text-center">
          <p className="text-gray-400 text-xs">
            © 2026 AgriMarche — Tous droits réservés
          </p>
        </div>
      </div>
    </div>
  );
}
