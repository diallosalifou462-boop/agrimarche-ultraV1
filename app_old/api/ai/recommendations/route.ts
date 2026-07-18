import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { cart, viewed, category } = await req.json();

    const context = `
Contexte de l'utilisateur sur AgriMarché (marketplace agricole sénégalaise):
- Produits dans le panier: ${JSON.stringify(cart?.slice(0, 5) ?? [])}
- Derniers produits consultés: ${JSON.stringify(viewed?.slice(0, 5) ?? [])}
- Catégorie actuelle: ${category ?? 'non définie'}

Génère 4 recommandations de produits agricoles sénégalais pertinents.
Réponds UNIQUEMENT avec ce JSON (sans backticks):
{
  "recommendations": [
    {"name": "Nom du produit", "emoji": "🥭", "reason": "courte raison (max 8 mots)", "category": "Fruits"},
    ...
  ]
}`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        messages: [{ role: 'user', content: context }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ recommendations: [] });
  }
}
