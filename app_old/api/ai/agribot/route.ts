import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { messages, systemPrompt } = await req.json();

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
        system: systemPrompt + '\n\nIMPORTANT: Réponds UNIQUEMENT avec un JSON valide, sans backticks ni markdown.',
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Claude API error:', err);
      return NextResponse.json({ error: 'API error' }, { status: 502 });
    }

    const data = await res.json();
    const text = data.content?.[0]?.text ?? '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {
        response: text,
        intent: 'general',
        entities: {},
        sentiment: 'neutral',
        suggestions: [],
      };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error('AgriBot route error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
