import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  console.log('✅ API appelée');
  return NextResponse.json({ success: true, message: 'API fonctionne' });
}

export async function GET() {
  return NextResponse.json({ message: 'API est en ligne. Utilisez POST.' });
}