'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, Lock, Eye, Trash2, Mail, Phone } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#f0faf4]">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-500 pt-12 pb-8 px-5">
        <Link href="/" className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4">
          <ArrowLeft size={20} />
          Retour
        </Link>
        <h1 className="text-white text-2xl font-bold">Politique de confidentialité</h1>
        <p className="text-white/70 text-sm mt-1">Dernière mise à jour : 02/06/2026</p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Introduction */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={24} className="text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-800">Protection de vos données</h2>
          </div>
          <p className="text-gray-600 leading-relaxed">
            Chez AgriMarche, nous accordons une importance capitale à la protection de vos informations personnelles. 
            Cette politique de confidentialité explique comment nous collectons, utilisons et protégeons vos données.
          </p>
        </div>

        {/* Informations collectées */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Eye size={24} className="text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-800">Informations que nous collectons</h2>
          </div>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">•</span>
              <span><strong>Informations d'inscription :</strong> Nom, email, numéro de téléphone</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">•</span>
              <span><strong>Données de commande :</strong> Produits achetés, adresse de livraison, historique d'achat</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">•</span>
              <span><strong>Données de navigation :</strong> Pages visitées, temps passé sur l'application</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">•</span>
              <span><strong>Localisation :</strong> Uniquement si vous utilisez les fonctionnalités de géolocalisation</span>
            </li>
          </ul>
        </div>

        {/* Utilisation des données */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Lock size={24} className="text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-800">Comment nous utilisons vos données</h2>
          </div>
          <ul className="space-y-3 text-gray-600">
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">✓</span>
              <span>Traiter vos commandes et gérer les livraisons</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">✓</span>
              <span>Vous envoyer des notifications sur l'état de vos commandes</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">✓</span>
              <span>Améliorer nos services et personnaliser votre expérience</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-emerald-600">✓</span>
              <span>Vous informer des offres spéciales et nouveaux produits (avec votre consentement)</span>
            </li>
          </ul>
        </div>

        {/* Protection des données */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <Trash2 size={24} className="text-emerald-600" />
            <h2 className="text-xl font-bold text-gray-800">Protection et conservation</h2>
          </div>
          <p className="text-gray-600 leading-relaxed mb-3">
            Vos données sont hébergées sur des serveurs sécurisés et protégées par chiffrement. 
            Nous ne vendons jamais vos informations personnelles à des tiers.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Vous pouvez à tout moment demander la suppression de vos données en nous contactant.
          </p>
        </div>

        {/* Vos droits */}
        <div className="bg-emerald-50 rounded-2xl p-6 border border-emerald-100">
          <h2 className="text-lg font-bold text-emerald-800 mb-3">Vos droits</h2>
          <p className="text-emerald-700 text-sm mb-3">
            Conformément à la réglementation, vous disposez d'un droit d'accès, de rectification, 
            d'opposition et de suppression de vos données personnelles.
          </p>
          <p className="text-emerald-700 text-sm">
            Pour exercer ces droits, contactez-nous à :
          </p>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 text-emerald-600">
              <Mail size={16} />
              <span className="text-sm">contact@agrimarche.sn</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-600">
              <Phone size={16} />
              <span className="text-sm">+221 78 123 45 67</span>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
          <p className="text-gray-500 text-sm">
            © 2026 AgriMarche - Tous droits réservés
          </p>
        </div>
      </div>
    </div>
  );
}
