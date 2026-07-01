'use client';

import { useEffect, useState } from 'react';

interface Insight {
  type: 'opportunity' | 'warning' | 'tip' | 'trend';
  title: string;
  description: string;
  action: string;
  impact: 'high' | 'medium' | 'low';
}

interface InsightsData {
  insights: Insight[];
  score: number;
  scoreLabel: string;
  topAdvice: string;
}

const TYPE_CONFIG = {
  opportunity: { icon: '💡', color: 'bg-yellow-50 border-yellow-200 text-yellow-800', badge: 'bg-yellow-100 text-yellow-700' },
  warning: { icon: '⚠️', color: 'bg-red-50 border-red-200 text-red-800', badge: 'bg-red-100 text-red-700' },
  tip: { icon: '🎯', color: 'bg-blue-50 border-blue-200 text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  trend: { icon: '📈', color: 'bg-green-50 border-green-200 text-green-800', badge: 'bg-green-100 text-green-700' },
};

const IMPACT_LABEL = { high: 'Impact fort', medium: 'Impact moyen', low: 'Impact faible' };

export function SellerAIInsights({ products = [], orders = [], earnings = {} }: {
  products?: any[]; orders?: any[]; earnings?: any;
}) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/ai/seller-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products, orders, earnings }),
    })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-green-100 rounded-xl animate-pulse" />
        <div className="h-4 w-40 bg-gray-100 rounded animate-pulse" />
      </div>
      {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-50 rounded-xl mb-2 animate-pulse" />)}
    </div>
  );

  if (!data || !data.insights?.length) return null;

  const scoreColor = data.score >= 75 ? 'text-green-600' : data.score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const scoreBg = data.score >= 75 ? 'bg-green-100' : data.score >= 50 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white font-bold flex items-center gap-2">
              <span className="text-lg">🤖</span> Analyse IA de votre boutique
            </p>
            <p className="text-green-100 text-xs mt-0.5">Powered by Claude · Mis à jour maintenant</p>
          </div>
          <div className={`${scoreBg} rounded-2xl px-4 py-2 text-center`}>
            <p className={`text-2xl font-black ${scoreColor}`}>{data.score}</p>
            <p className={`text-xs font-semibold ${scoreColor}`}>{data.scoreLabel}</p>
          </div>
        </div>

        {data.topAdvice && (
          <div className="mt-3 bg-white/15 rounded-xl px-3 py-2">
            <p className="text-white text-xs font-medium">💬 {data.topAdvice}</p>
          </div>
        )}
      </div>

      {/* Insights */}
      <div className="p-4 space-y-2">
        {data.insights.map((insight, i) => {
          const cfg = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.tip;
          const isOpen = expanded === i;
          return (
            <div
              key={i}
              className={`border rounded-xl overflow-hidden cursor-pointer transition-all ${cfg.color}`}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <div className="px-3.5 py-2.5 flex items-center gap-2.5">
                <span className="text-lg flex-shrink-0">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{insight.title}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                    {IMPACT_LABEL[insight.impact]}
                  </span>
                  <span className="text-xs">{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>
              {isOpen && (
                <div className="px-3.5 pb-3.5 border-t border-current/10 mt-0 pt-2.5 space-y-2">
                  <p className="text-sm opacity-90">{insight.description}</p>
                  <div className="bg-white/50 rounded-lg px-3 py-2">
                    <p className="text-xs font-bold mb-0.5">Action recommandée :</p>
                    <p className="text-xs">{insight.action}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

