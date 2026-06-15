'use client';

import { useEffect, useState } from 'react';

interface Rec { name: string; emoji: string; reason: string; category: string; }

export function AIRecommendations({ cart = [], viewed = [], category = '' }: {
  cart?: string[]; viewed?: string[]; category?: string;
}) {
  const [recs, setRecs] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart, viewed, category }),
    })
      .then(r => r.json())
      .then(d => { setRecs(d.recommendations ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100">
      <p className="text-xs text-green-600 font-semibold mb-3">🤖 IA recommande pour vous…</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[1,2,3,4].map(i => (
          <div key={i} className="flex-shrink-0 w-28 h-20 bg-white/60 rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );

  if (!recs.length) return null;

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-4 border border-green-100">
      <p className="text-xs text-green-700 font-bold mb-3 flex items-center gap-1.5">
        <span className="w-4 h-4 bg-green-600 rounded-full flex items-center justify-center text-white text-[9px]">AI</span>
        Recommandé pour vous
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {recs.map((rec, i) => (
          <div key={i} className="flex-shrink-0 bg-white rounded-xl p-3 w-32 border border-green-100 hover:border-green-300 hover:shadow-md transition cursor-pointer">
            <div className="text-2xl mb-1">{rec.emoji}</div>
            <p className="text-xs font-semibold text-gray-800 leading-tight">{rec.name}</p>
            <p className="text-[10px] text-green-600 mt-0.5">{rec.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
