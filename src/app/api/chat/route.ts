/**
 * /app/api/chat/route.ts  (ou /pages/api/chat.ts selon votre structure Next.js)
 *
 * Route serveur sécurisée — la clé DeepSeek ne quitte jamais le serveur.
 *
 * Variables d'environnement requises (.env.local) :
 *   DEEPSEEK_API_KEY=sk-...          ← PAS de préfixe NEXT_PUBLIC_
 *
 * Firestore — collections lues par cette route :
 *   users/{uid}                      ← champ aiTokensUsed, aiAlertSent
 *   market_prices                    ← (optionnel) prix mis à jour par l'admin
 *       Document "latest" {
 *         updatedAt: Timestamp,
 *         source: string,            ← ex: "DCA Sénégal"
 *         isSimulated: boolean,      ← true = données de secours
 *         prices: {
 *           mais_dakar:    number,   ← FCFA/kg
 *           mais_kaolack:  number,
 *           mil:           number,
 *           sorgho:        number,
 *           arachide:      number,
 *           niebe:         number,
 *           riz_local:     number,
 *           riz_importe:   number,
 *           tomate:        number,
 *           oignon:        number,
 *           engrais_uree:  number,   ← FCFA/sac 50kg
 *           engrais_npk:   number,
 *         }
 *       }
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Typage du body attendu ───────────────────────────────────────────────────
interface ChatRequestBody {
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

// ─── Handler POST ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Authentification minimale : vérifier que la requête vient bien de notre app
  //    (en production, ajouter une vérification de session Firebase côté serveur)
  const body = (await req.json()) as ChatRequestBody;

  if (!body?.systemPrompt || !Array.isArray(body?.messages)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY manquant dans les variables serveur');
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  // 2. Appel DeepSeek côté serveur uniquement
  try {
    const deepSeekRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: body.systemPrompt },
          ...body.messages,
        ],
        max_tokens: 700,
        temperature: 0.65,
        stream: false,
      }),
    });

    if (!deepSeekRes.ok) {
      const status = deepSeekRes.status;
      if (status === 401 || status === 403) {
        return NextResponse.json({ error: 'INVALID_API_KEY' }, { status: 502 });
      }
      if (status === 402) {
        return NextResponse.json({ error: 'INSUFFICIENT_BALANCE' }, { status: 402 });
      }
      return NextResponse.json({ error: `DeepSeek error ${status}` }, { status: 502 });
    }

    const data = await deepSeekRes.json();
    return NextResponse.json(data);
  } catch (e) {
    console.error('DeepSeek fetch error:', e);
    return NextResponse.json({ error: 'Network error' }, { status: 503 });
  }
}
