// /app/admin/logistics/page.tsx
//
// Tableau de bord "Performance logistique" — exploite les horodatages
// posés par le parcours de suivi hybride (voir functions/src/index.ts et
// delivery/dashboard/page.tsx) : createdAt, enPreparationAt,
// tracking.{assignedAt,enRouteAt,approachingAt,arrivedAt}, deliveredAt.
//
// ⚠️ Choix assumé : agrégation calculée CÔTÉ CLIENT sur une fenêtre bornée
// (7/30/90 jours), en lecture ponctuelle (getDocs, pas onSnapshot) plutôt
// qu'un pipeline de pré-agrégation planifié côté serveur. Pour le volume
// d'une marketplace régionale, lire quelques centaines à quelques milliers
// de commandes sur 90 jours reste largement dans les clous ; si le volume
// grossit d'un ordre de grandeur, la suite logique est une Cloud Function
// planifiée qui pré-calcule des agrégats quotidiens dans une collection
// dédiée (`analytics/daily/{date}`) plutôt que de tout relire à chaque
// ouverture de cette page.

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import {
  ArrowLeft, RefreshCw, Package, Clock, Truck, XCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from 'recharts';

// ── Types ────────────────────────────────────────────────────────────────
interface OrderDoc {
  id: string;
  orderNumber?: string;
  sellerId?: string;
  sellerName?: string;
  delivererId?: string;
  delivererName?: string;
  status: string;
  amount?: number;
  createdAt?: Timestamp;
  enPreparationAt?: Timestamp;
  deliveredAt?: Timestamp;
  cancelledAt?: Timestamp;
  cancelledBy?: string;
  tracking?: {
    assignedAt?: Timestamp;
    enRouteAt?: Timestamp;
    approachingAt?: Timestamp;
    arrivedAt?: Timestamp;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function diffMinutes(a?: Timestamp, b?: Timestamp): number | null {
  if (!a || !b) return null;
  const ms = b.toMillis() - a.toMillis();
  return ms > 0 ? ms / 60000 : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h${m > 0 ? ` ${m.toString().padStart(2, '0')}` : ''}`;
}

// Seuil "livraison dans les temps" — hypothèse assumée faute de SLA
// contractuel connu, facilement ajustable ici. Un trajet (en_route →
// livré) de moins de 45 min est considéré ponctuel.
const SLA_TRAJET_MINUTES = 45;

const RANGES = [
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours' },
];

export default function LogisticsAnalyticsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rangeDays, setRangeDays] = useState(30);
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) {
      router.push('/');
    }
  }, [authLoading, user, profile, router]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const cutoff = Timestamp.fromMillis(Date.now() - rangeDays * 24 * 60 * 60 * 1000);
      const snap = await getDocs(
        query(collection(db, 'orders'), where('createdAt', '>=', cutoff))
      );
      setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setLastFetchedAt(new Date());
    } catch (err) {
      console.error('[logistics] échec de chargement des commandes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile?.role === 'admin') fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, rangeDays]);

  // ── Agrégats globaux ─────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = orders.length;
    const delivered = orders.filter((o) => o.status === 'livre');
    const cancelled = orders.filter((o) => o.status === 'annule');

    const prepTimes = orders
      .map((o) => diffMinutes(o.createdAt, o.enPreparationAt))
      .filter((v): v is number => v !== null);

    const transitTimes = delivered
      .map((o) => diffMinutes(o.tracking?.enRouteAt, o.deliveredAt))
      .filter((v): v is number => v !== null);

    const totalTimes = delivered
      .map((o) => diffMinutes(o.createdAt, o.deliveredAt))
      .filter((v): v is number => v !== null);

    const onTimeCount = transitTimes.filter((t) => t <= SLA_TRAJET_MINUTES).length;

    return {
      total,
      deliveredCount: delivered.length,
      cancelledCount: cancelled.length,
      deliveryRate: total > 0 ? (delivered.length / total) * 100 : null,
      cancellationRate: total > 0 ? (cancelled.length / total) * 100 : null,
      avgPrepMinutes: average(prepTimes),
      avgTransitMinutes: average(transitTimes),
      avgTotalMinutes: average(totalTimes),
      onTimeRate: transitTimes.length > 0 ? (onTimeCount / transitTimes.length) * 100 : null,
    };
  }, [orders]);

  // ── Commandes par jour (graphique) ──────────────────────────────────
  const dailyData = useMemo(() => {
    const byDay = new Map<string, number>();
    orders.forEach((o) => {
      if (!o.createdAt) return;
      const key = o.createdAt.toDate().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    });
    return [...byDay.entries()]
      .map(([day, count]) => ({ day, count }))
      .slice(-30); // ne montre jamais plus de 30 barres, même sur la fenêtre 90j
  }, [orders]);

  // ── Performance par vendeur ──────────────────────────────────────────
  const sellerStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; cancelled: number; prepTimes: number[] }>();
    orders.forEach((o) => {
      if (!o.sellerId) return;
      const entry = map.get(o.sellerId) ?? { name: o.sellerName || 'Vendeur', count: 0, cancelled: 0, prepTimes: [] };
      entry.count++;
      if (o.status === 'annule' && o.cancelledBy === 'seller') entry.cancelled++;
      const pt = diffMinutes(o.createdAt, o.enPreparationAt);
      if (pt !== null) entry.prepTimes.push(pt);
      map.set(o.sellerId, entry);
    });
    return [...map.entries()]
      .map(([id, v]) => ({
        id, name: v.name, count: v.count,
        cancellationRate: v.count > 0 ? (v.cancelled / v.count) * 100 : 0,
        avgPrepMinutes: average(v.prepTimes),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [orders]);

  // ── Performance par livreur ───────────────────────────────────────────
  const delivererStats = useMemo(() => {
    const map = new Map<string, { name: string; count: number; transitTimes: number[]; reactionTimes: number[] }>();
    orders.filter((o) => o.status === 'livre' && o.delivererId).forEach((o) => {
      const entry = map.get(o.delivererId!) ?? { name: o.delivererName || 'Livreur', count: 0, transitTimes: [], reactionTimes: [] };
      entry.count++;
      const tt = diffMinutes(o.tracking?.enRouteAt, o.deliveredAt);
      if (tt !== null) entry.transitTimes.push(tt);
      // Temps de réaction : entre l'attribution et le départ réel (premier
      // point GPS) — un proxy de réactivité du livreur, indépendant du
      // trajet lui-même (qui dépend surtout de la distance).
      const rt = diffMinutes(o.tracking?.assignedAt, o.tracking?.enRouteAt);
      if (rt !== null) entry.reactionTimes.push(rt);
      map.set(o.delivererId!, entry);
    });
    return [...map.entries()]
      .map(([id, v]) => {
        const onTime = v.transitTimes.filter((t) => t <= SLA_TRAJET_MINUTES).length;
        return {
          id, name: v.name, count: v.count,
          avgTransitMinutes: average(v.transitTimes),
          avgReactionMinutes: average(v.reactionTimes),
          onTimeRate: v.transitTimes.length > 0 ? (onTime / v.transitTimes.length) * 100 : null,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [orders]);

  if (authLoading || !user || profile?.role !== 'admin') return null;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0c10', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        .glass-card { background:linear-gradient(135deg,rgba(17,19,23,.95),rgba(10,12,16,.98)); border:1px solid rgba(255,255,255,0.08); border-radius:20px; }
        .kpi-value { font-size:26px; font-weight:700; line-height:1.1; }
        .kpi-label { font-size:12px; color:#9ca3af; margin-top:4px; }
        table.perf-table { width:100%; border-collapse:collapse; font-size:13px; }
        table.perf-table th { text-align:left; color:#6b7280; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.03em; padding:8px 10px; border-bottom:1px solid rgba(255,255,255,0.08); }
        table.perf-table td { padding:10px; border-bottom:1px solid rgba(255,255,255,0.04); }
      `}</style>

      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/admin')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ArrowLeft size={18} /> Retour
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>📊 Performance logistique</h1>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {lastFetchedAt ? `Actualisé à ${lastFetchedAt.toLocaleTimeString('fr-FR')}` : '—'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, background: '#111317', borderRadius: 12, padding: 4 }}>
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRangeDays(r.days)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: rangeDays === r.days ? '#10b981' : 'transparent',
                color: rangeDays === r.days ? '#fff' : '#9ca3af',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button onClick={fetchOrders} disabled={loading} style={{ background: '#1f2127', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '8px 12px', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Actualiser
        </button>
      </div>

      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {loading && orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>
            <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            Chargement des commandes sur {rangeDays} jours…
          </div>
        ) : orders.length === 0 ? (
          <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Aucune commande sur cette période.
          </div>
        ) : (
          <>
            {/* ── KPI cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <div className="glass-card" style={{ padding: 18 }}>
                <Package size={16} color="#8b5cf6" />
                <div className="kpi-value">{stats.total}</div>
                <div className="kpi-label">Commandes ({rangeDays}j)</div>
              </div>
              <div className="glass-card" style={{ padding: 18 }}>
                <CheckCircle2 size={16} color="#10b981" />
                <div className="kpi-value">{stats.deliveryRate !== null ? `${stats.deliveryRate.toFixed(0)}%` : '—'}</div>
                <div className="kpi-label">Taux de livraison</div>
              </div>
              <div className="glass-card" style={{ padding: 18 }}>
                <XCircle size={16} color="#ef4444" />
                <div className="kpi-value">{stats.cancellationRate !== null ? `${stats.cancellationRate.toFixed(0)}%` : '—'}</div>
                <div className="kpi-label">Taux d'annulation</div>
              </div>
              <div className="glass-card" style={{ padding: 18 }}>
                <Clock size={16} color="#f59e0b" />
                <div className="kpi-value">{formatDuration(stats.avgPrepMinutes)}</div>
                <div className="kpi-label">Préparation moyenne</div>
              </div>
              <div className="glass-card" style={{ padding: 18 }}>
                <Truck size={16} color="#06b6d4" />
                <div className="kpi-value">{formatDuration(stats.avgTransitMinutes)}</div>
                <div className="kpi-label">Trajet moyen</div>
              </div>
              <div className="glass-card" style={{ padding: 18 }}>
                <Clock size={16} color="#9ca3af" />
                <div className="kpi-value">{formatDuration(stats.avgTotalMinutes)}</div>
                <div className="kpi-label">Délai total moyen</div>
              </div>
              <div className="glass-card" style={{ padding: 18 }}>
                <CheckCircle2 size={16} color="#10b981" />
                <div className="kpi-value">{stats.onTimeRate !== null ? `${stats.onTimeRate.toFixed(0)}%` : '—'}</div>
                <div className="kpi-label">Ponctualité (≤{SLA_TRAJET_MINUTES}min)</div>
              </div>
            </div>

            {/* ── Graphique commandes/jour ── */}
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#e5e7eb' }}>Commandes par jour</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2127" vertical={false} />
                    <XAxis dataKey="day" stroke="#6b7280" fontSize={11} />
                    <YAxis stroke="#6b7280" fontSize={11} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: '#111317', border: '1px solid #1f2127', borderRadius: 8 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                      {dailyData.map((_, i) => <Cell key={i} fill="#10b981" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Performance vendeurs ── */}
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#e5e7eb' }}>Fiabilité des vendeurs</h3>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>Triés par volume — top 10 sur la période.</p>
              <div style={{ overflowX: 'auto' }}>
                <table className="perf-table">
                  <thead>
                    <tr>
                      <th>Vendeur</th>
                      <th>Commandes</th>
                      <th>Préparation moyenne</th>
                      <th>Taux d'annulation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sellerStats.map((s) => (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.name}</td>
                        <td>{s.count}</td>
                        <td>{formatDuration(s.avgPrepMinutes)}</td>
                        <td style={{ color: s.cancellationRate > 15 ? '#ef4444' : s.cancellationRate > 5 ? '#f59e0b' : '#10b981' }}>
                          {s.cancellationRate.toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Performance livreurs ── */}
            <div className="glass-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#e5e7eb' }}>Performance des livreurs</h3>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
                Temps de réaction = attribution → premier point GPS. Ponctualité = trajets ≤ {SLA_TRAJET_MINUTES} min.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table className="perf-table">
                  <thead>
                    <tr>
                      <th>Livreur</th>
                      <th>Livraisons</th>
                      <th>Temps de réaction</th>
                      <th>Trajet moyen</th>
                      <th>Ponctualité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delivererStats.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 600 }}>{d.name}</td>
                        <td>{d.count}</td>
                        <td>{formatDuration(d.avgReactionMinutes)}</td>
                        <td>{formatDuration(d.avgTransitMinutes)}</td>
                        <td style={{ color: (d.onTimeRate ?? 0) >= 80 ? '#10b981' : (d.onTimeRate ?? 0) >= 50 ? '#f59e0b' : '#ef4444' }}>
                          {d.onTimeRate !== null ? `${d.onTimeRate.toFixed(0)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Limites connues, affichées plutôt que cachées ── */}
            <div style={{ fontSize: 11, color: '#4b5563', padding: '0 4px', lineHeight: 1.6 }}>
              ⚠️ Les commandes créées avant l'ajout du parcours de suivi horodaté n'ont pas de <code>tracking.enRouteAt</code>/<code>enPreparationAt</code> et sont donc exclues des moyennes de temps (mais comptées dans le total). Le seuil de ponctualité ({SLA_TRAJET_MINUTES} min) est une hypothèse par défaut, pas un SLA contractuel — à ajuster dans le code selon vos engagements réels.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
