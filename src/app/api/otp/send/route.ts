// src/app/api/otp/send/route.ts
//
// ⚠️ FIX (26/09) : route DÉSACTIVÉE (410 Gone). L'ancien flux OTP maison
// (Free/Expresso) était vulnérable : code généré avec Math.random() et
// stocké en clair, compteur de tentatives non transactionnel (force brute
// possible en parallèle), et /api/otp/verify émettait un customToken →
// prise de contrôle de n'importe quel compte à partir de son seul numéro.
// L'application ne passe plus par ici : la connexion se fait par mot de
// passe et l'OTP Free/Expresso passe par les Cloud Functions
// (lib/registrationActions.ts). On garde OPTIONS (CORS) pour que les
// anciennes versions de l'app reçoivent un message lisible plutôt qu'une
// erreur réseau opaque. Toute la logique dangereuse a été retirée.
export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST() {
  return NextResponse.json(
    { error: "Cette méthode de connexion n'est plus disponible. Mettez à jour l'application." },
    { status: 410, headers: CORS_HEADERS }
  );
}
