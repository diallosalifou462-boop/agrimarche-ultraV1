import { NextRequest, NextResponse } from 'next/server';
import { agent } from '@/lib/ai/agent';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const result = await agent.processMessage(
      body.userId || 'anonymous',
      body.message || ''
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'AI route error' },
      { status: 500 }
    );
  }
}