import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { products, orders, earnings } = await req.json();

    const prompt = `Tu es un expert en agribusiness sénégalais. Analyse ces données d'un vendeur sur AgriMarché:

Produits: ${JSON.stringify(products?.slice(0, 10) ?? [])}
Commandes récentes: ${JSON.stringify(orders?.slice(0, 5) ?? [])}
Revenus: ${JSON.stringify(earnings ?? {})}

Génère des insights actionnables. Réponds UNIQUEMENT avec ce JSON (sans backticks):
{
  "insights": [
    {"type": "opportunity|warning|tip|trend", "title": "titre court", "description": "explication 1-2 phrases", "action": "action concrète à faire", "impact": "high|medium|low"},
    ...
  ],
  "score": 75,
  "scoreLabel": "Bon",
  "topAdvice": "conseil principal en 1 phrase"
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
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ insights: [], score: 0, scoreLabel: '-', topAdvice: '' });
  }
}
