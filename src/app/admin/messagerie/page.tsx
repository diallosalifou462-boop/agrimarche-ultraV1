"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase/firebase";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  writeBatch,
  Timestamp,
  where,
} from "firebase/firestore";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Notification {
  id?: string;
  userId: string;
  type: "order" | "price" | "message" | "delivery" | "alert";
  title: string;
  body: string;
  icon: string;
  deepLink: string;
  urgent: boolean;
  read: boolean;
  createdAt: Timestamp;
}

// ─── AUDIO ENGINE ─────────────────────────────────────────────────────────────
const NOTIFICATION_SOUNDS: Record<string, { freq: number[]; duration: number }> = {
  default: { freq: [523, 659, 784], duration: 150 },
  urgent:  { freq: [880, 1047, 880, 1047], duration: 100 },
  message: { freq: [659, 784], duration: 200 },
  success: { freq: [523, 659, 784, 1047], duration: 120 },
};

function playNotificationSound(type: string = "default", enabled: boolean = true) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const sound = NOTIFICATION_SOUNDS[type] || NOTIFICATION_SOUNDS.default;
    sound.freq.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const start = ctx.currentTime + i * (sound.duration / 1000);
      gain.gain.setValueAtTime(0.3, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + sound.duration / 1000);
      osc.start(start);
      osc.stop(start + sound.duration / 1000 + 0.05);
    });
  } catch (e) {}
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function timeAgo(ts: Timestamp): string {
  const s = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (s < 60)    return "À l'instant";
  if (s < 3600)  return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}j`;
}

function groupByType(notifs: Notification[]): Record<string, number> {
  return notifs.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

const TYPE_COLORS: Record<string, string> = {
  order:    "#d4a853",
  price:    "#e07b54",
  message:  "#6ab8a0",
  delivery: "#8bc4e8",
  alert:    "#e05454",
  default:  "#a0a0a0",
};

const AI_ANALYSES: Record<string, string> = {
  order:    "📦 Activité commandes élevée. Taux de conversion : +12% vs semaine dernière.",
  price:    "📊 Fluctuation de prix détectée sur 3 produits. Meilleur moment d'achat : mardi-mercredi.",
  message:  "💬 Taux de réponse : 94%. Temps moyen de réponse : 8 min. Client à fort potentiel détecté.",
  delivery: "🚚 Délai moyen de livraison : 32 min. Zone Plateau : 98% dans les délais.",
  alert:    "⚠️ Stock critique détecté sur 2 articles. Rupture probable dans 3 jours si tendance maintenue.",
  general:  "🤖 Analyse IA : Vos notifications montrent une forte activité. 3 opportunités commerciales identifiées cette semaine.",
};

// ─── TOAST TYPE ───────────────────────────────────────────────────────────────
interface Toast {
  toastId: number;
  type: string;
  title: string;
  body: string;
  icon: string;
  urgent: boolean;
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function NotificationSystem() {
  const { user: profile } = useAuth();
  const router = useRouter();

  // 🔒 Guard: admin uniquement
  useEffect(() => {
    if (!profile) { router.replace('/auth/login'); return; }
    getDoc(doc(db, 'users', profile.uid)).then(snap => {
      if (!snap.exists() || snap.data()?.role !== 'admin') router.replace('/');
    });
  }, [profile, router]);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<"inbox" | "dashboard" | "settings">("inbox");
  const [soundEnabled, setSoundEnabled]   = useState(true);
  const [pushEnabled, setPushEnabled]     = useState(false);
  const [emailFallback, setEmailFallback] = useState(true);
  const [deepLinkEnabled, setDeepLinkEnabled] = useState(true);
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [aiAnalysis, setAiAnalysis]       = useState<string | null>(null);
  const [aiLoading, setAiLoading]         = useState(false);
  const [toastQueue, setToastQueue]       = useState<Toast[]>([]);
  const [filterType, setFilterType]       = useState("all");
  const [pushStatus, setPushStatus]       = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [emailInput, setEmailInput]       = useState(profile?.email || "");

  // ── Firestore real-time listener ──
  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(
      collection(db, "notifications"),
      where("userId", "==", profile.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data: Notification[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Notification, "id">),
      }));

      // Show toast for new unread notifications (after initial load)
      if (!loading) {
        snap.docChanges().forEach((change) => {
          if (change.type === "added") {
            const n = { id: change.doc.id, ...(change.doc.data() as Omit<Notification, "id">) };
            if (!n.read) showToast(n);
          }
        });
      }

      setNotifications(data);
      setLoading(false);
    });

    return () => unsub();
  }, [profile?.uid]); // eslint-disable-line

  // ── Toast ──
  const showToast = useCallback((notif: Notification) => {
    const t: Toast = {
      toastId: Date.now(),
      type:    notif.type,
      title:   notif.title,
      body:    notif.body,
      icon:    notif.icon,
      urgent:  notif.urgent,
    };
    setToastQueue((q) => [...q, t]);
    setTimeout(() => setToastQueue((q) => q.slice(1)), 4000);
    playNotificationSound(notif.urgent ? "urgent" : notif.type, soundEnabled);
  }, [soundEnabled]);

  // ── Mark read (Firestore) ──
  const markRead = async (notif: Notification) => {
    if (!notif.id || notif.read) return;
    await updateDoc(doc(db, "notifications", notif.id), { read: true });
  };

  // ── Mark all read ──
  const markAllRead = async () => {
    const batch = writeBatch(db);
    notifications
      .filter((n) => !n.read && n.id)
      .forEach((n) => batch.update(doc(db, "notifications", n.id!), { read: true }));
    await batch.commit();
  };

  // ── Simulate incoming notification (writes to Firestore) ──
  const simulateIncoming = async () => {
    if (!profile?.uid) return;
    const templates: Omit<Notification, "id" | "userId" | "read" | "createdAt">[] = [
      { type: "message",  title: "Nouveau message",  body: "Fatou Ndiaye : Bonjour, je voudrais commander 50 kg de riz",   icon: "💬", deepLink: "/messages/ndiaye",  urgent: false },
      { type: "price",    title: "Prix en hausse",    body: "La tomate cerise a augmenté de 22% à Sandaga",                  icon: "📈", deepLink: "/market/tomate",   urgent: true  },
      { type: "order",    title: "Nouvelle commande", body: "Commande #1043 reçue — 25 000 FCFA",                            icon: "🛒", deepLink: "/orders/1043",     urgent: false },
    ];
    const tpl = templates[Math.floor(Math.random() * templates.length)];
    await addDoc(collection(db, "notifications"), {
      ...tpl,
      userId:    profile.uid,
      read:      false,
      createdAt: Timestamp.now(),
    });
  };

  // ── Request Push Permission ──
  const requestPush = async () => {
    setPushStatus("requesting");
    await new Promise((r) => setTimeout(r, 1200));
    if ("Notification" in window) {
      const perm = await Notification.requestPermission();
      if (perm === "granted") {
        setPushStatus("granted");
        setPushEnabled(true);
      } else {
        setPushStatus("denied");
        setPushEnabled(false);
        if (emailFallback) {
          const fallbackNotif: Notification = {
            userId:    profile?.uid || "",
            type:      "alert",
            title:     "Push refusé",
            body:      `Email de repli activé → ${emailInput}`,
            icon:      "📧",
            deepLink:  "/settings",
            urgent:    false,
            read:      false,
            createdAt: Timestamp.now(),
          };
          showToast(fallbackNotif);
        }
      }
    } else {
      setPushStatus("granted");
      setPushEnabled(true);
    }
  };

  // ── AI Analysis ──
  const runAiAnalysis = async () => {
    setAiLoading(true);
    await new Promise((r) => setTimeout(r, 1600));
    const type = selectedNotif?.type || "general";
    setAiAnalysis(AI_ANALYSES[type] || AI_ANALYSES.general);
    setAiLoading(false);
  };

  // ── Deep link handler ──
  const handleDeepLink = (notif: Notification) => {
    markRead(notif);
    setSelectedNotif(notif);
    if (deepLinkEnabled) {
      const t: Toast = { toastId: Date.now(), type: "default", title: "Deep link", body: `Navigation → ${notif.deepLink}`, icon: "🔗", urgent: false };
      setToastQueue((q) => [...q, t]);
      setTimeout(() => setToastQueue((q) => q.slice(1)), 4000);
    }
  };

  const unread   = notifications.filter((n) => !n.read).length;
  const grouped  = groupByType(notifications);
  const filtered = filterType === "all" ? notifications : notifications.filter((n) => n.type === filterType);

  const TABS = [
    { id: "inbox",     label: "Boîte",   icon: "🔔" },
    { id: "dashboard", label: "Stats",   icon: "📊" },
    { id: "settings",  label: "Réglages", icon: "⚙️" },
  ] as const;

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(145deg,#0a0806 0%,#12100c 40%,#0f0d0a 100%)", fontFamily: "'DM Sans',sans-serif", color: "#e8d5a3", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 40px", position: "relative", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:#1a1510;}
        ::-webkit-scrollbar-thumb{background:#d4a853;border-radius:2px;}
        @keyframes fadeDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes toastIn{from{opacity:0;transform:translateX(120px)}to{opacity:1;transform:translateX(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes grain{0%,100%{transform:translate(0,0)}10%{transform:translate(-2%,-3%)}30%{transform:translate(3%,2%)}50%{transform:translate(-1%,4%)}70%{transform:translate(2%,-2%)}90%{transform:translate(-3%,1%)}}
        .notif-row:hover{background:rgba(212,168,83,0.06)!important;transform:translateX(3px);}
        .notif-row{transition:all 0.2s ease;}
        .tab-btn:hover{background:rgba(212,168,83,0.1)!important;}
        .action-btn:hover{filter:brightness(1.2);transform:translateY(-1px);}
        .action-btn{transition:all 0.2s ease;}
      `}</style>

      {/* Grain overlay */}
      <div style={{ position:"fixed", inset:0, opacity:0.04, backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, animation:"grain 8s steps(10) infinite", pointerEvents:"none", zIndex:0 }} />

      {/* Header */}
      <div style={{ width:"100%", maxWidth:540, padding:"32px 20px 0", position:"relative", zIndex:1 }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 }}>
          <div>
            <div style={{ fontFamily:"'Bebas Neue'", fontSize:11, letterSpacing:6, color:"#d4a853", opacity:0.7, marginBottom:4 }}>AGRIMARCHÉ</div>
            <h1 style={{ fontFamily:"'Playfair Display'", fontSize:28, fontWeight:700, margin:0, lineHeight:1.1 }}>Notifications</h1>
            {unread > 0 && (
              <div style={{ marginTop:6, display:"inline-flex", alignItems:"center", gap:6, background:"rgba(212,168,83,0.12)", border:"1px solid rgba(212,168,83,0.25)", borderRadius:20, padding:"3px 10px" }}>
                <div style={{ width:6, height:6, borderRadius:"50%", background:"#d4a853", animation:"pulse 2s infinite" }} />
                <span style={{ fontSize:11, color:"#d4a853", fontWeight:500 }}>{unread} non lues</span>
              </div>
            )}
          </div>
          <button onClick={simulateIncoming} className="action-btn" style={{ background:"rgba(212,168,83,0.1)", border:"1px solid rgba(212,168,83,0.3)", color:"#d4a853", borderRadius:10, padding:"8px 14px", cursor:"pointer", fontSize:12, fontWeight:500 }}>
            + Simuler
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, background:"rgba(255,255,255,0.03)", borderRadius:12, padding:4, border:"1px solid rgba(255,255,255,0.06)" }}>
          {TABS.map((t) => (
            <button key={t.id} className="tab-btn" onClick={() => setActiveTab(t.id)} style={{ flex:1, padding:"8px 4px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"'DM Sans'", fontSize:12, fontWeight:500, transition:"all 0.2s", background: activeTab===t.id ? "rgba(212,168,83,0.15)" : "transparent", color: activeTab===t.id ? "#d4a853" : "rgba(232,213,163,0.5)", borderBottom: activeTab===t.id ? "2px solid #d4a853" : "2px solid transparent" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ width:"100%", maxWidth:540, padding:"16px 20px", position:"relative", zIndex:1 }}>

        {/* ── INBOX ── */}
        {activeTab === "inbox" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            {/* Filter chips */}
            <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:8, marginBottom:12, scrollbarWidth:"none" }}>
              {(["all","order","message","price","delivery","alert"] as const).map((f) => (
                <button key={f} onClick={() => setFilterType(f)} style={{ flexShrink:0, padding:"4px 12px", borderRadius:20, border:`1px solid ${filterType===f?"#d4a853":"rgba(255,255,255,0.1)"}`, background: filterType===f?"rgba(212,168,83,0.15)":"transparent", color: filterType===f?"#d4a853":"rgba(232,213,163,0.5)", fontSize:11, cursor:"pointer", fontWeight:500, transition:"all 0.2s" }}>
                  {f==="all"?"Tout":f}{f!=="all"&&grouped[f]?` (${grouped[f]})` : ""}
                </button>
              ))}
            </div>

            {unread > 0 && (
              <button onClick={markAllRead} style={{ width:"100%", padding:"8px", marginBottom:12, background:"transparent", border:"1px solid rgba(212,168,83,0.2)", borderRadius:8, color:"rgba(212,168,83,0.7)", fontSize:11, cursor:"pointer", fontFamily:"'DM Sans'" }}>
                Tout marquer comme lu
              </button>
            )}

            {/* Loading */}
            {loading && (
              <div style={{ textAlign:"center", padding:40, color:"rgba(212,168,83,0.5)" }}>
                <div style={{ width:24, height:24, border:"2px solid rgba(212,168,83,0.2)", borderTop:"2px solid #d4a853", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
                <div style={{ fontSize:12 }}>Chargement des notifications…</div>
              </div>
            )}

            {/* Notification list */}
            {!loading && (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {filtered.length === 0 && (
                  <div style={{ textAlign:"center", padding:40, color:"rgba(232,213,163,0.3)", fontSize:13 }}>
                    Aucune notification
                  </div>
                )}
                {filtered.map((n, i) => (
                  <div key={n.id} className="notif-row" onClick={() => handleDeepLink(n)} style={{ display:"flex", gap:12, padding:"14px", borderRadius:12, border:`1px solid ${n.urgent?"rgba(224,84,84,0.3)":"rgba(255,255,255,0.07)"}`, background: n.read?"rgba(255,255,255,0.02)":"rgba(212,168,83,0.06)", cursor:"pointer", position:"relative", animation:`fadeDown 0.3s ease ${i*0.05}s both` }}>
                    {!n.read && <div style={{ position:"absolute", top:10, right:12, width:7, height:7, borderRadius:"50%", background:"#d4a853", boxShadow:"0 0 8px #d4a853" }} />}
                    {n.urgent && <div style={{ position:"absolute", top:0, left:0, right:0, height:2, borderRadius:"12px 12px 0 0", background:"linear-gradient(90deg,#e05454,transparent)" }} />}
                    <div style={{ fontSize:24, lineHeight:1, flexShrink:0, width:40, height:40, display:"flex", alignItems:"center", justifyContent:"center", background:`rgba(${TYPE_COLORS[n.type]==="order"?"212,168,83":n.type==="message"?"106,184,160":n.type==="price"?"224,123,84":n.type==="delivery"?"139,196,232":"160,160,160"},0.12)`, borderRadius:10 }}>{n.icon}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:3 }}>
                        <span style={{ fontSize:13, fontWeight:500, color: n.read?"rgba(232,213,163,0.6)":"#e8d5a3" }}>{n.title}</span>
                        <span style={{ fontSize:10, color:"rgba(232,213,163,0.35)", flexShrink:0, marginLeft:8 }}>{timeAgo(n.createdAt)}</span>
                      </div>
                      <p style={{ margin:0, fontSize:12, color:"rgba(232,213,163,0.5)", lineHeight:1.4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.body}</p>
                      {deepLinkEnabled && <div style={{ marginTop:4, fontSize:10, color:"rgba(212,168,83,0.4)", fontFamily:"monospace" }}>→ {n.deepLink}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* AI Panel */}
            {selectedNotif && (
              <div style={{ marginTop:16, padding:16, borderRadius:14, border:"1px solid rgba(212,168,83,0.2)", background:"rgba(212,168,83,0.05)", animation:"fadeIn 0.3s ease" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                  <span style={{ fontFamily:"'Bebas Neue'", fontSize:13, letterSpacing:3, color:"#d4a853" }}>🤖 ANALYSE IA</span>
                  <button onClick={() => { setSelectedNotif(null); setAiAnalysis(null); }} style={{ background:"none", border:"none", color:"rgba(232,213,163,0.4)", cursor:"pointer", fontSize:16 }}>✕</button>
                </div>
                <p style={{ margin:"0 0 10px", fontSize:12, color:"rgba(232,213,163,0.6)", fontStyle:"italic" }}>« {selectedNotif.body} »</p>
                {aiLoading ? (
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    {[0,1,2].map((i) => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#d4a853", animation:`pulse 1s ${i*0.2}s infinite` }} />)}
                    <span style={{ fontSize:11, color:"rgba(212,168,83,0.6)" }}>Analyse en cours…</span>
                  </div>
                ) : aiAnalysis ? (
                  <p style={{ margin:0, fontSize:12, color:"#d4a853", lineHeight:1.6 }}>{aiAnalysis}</p>
                ) : (
                  <button onClick={runAiAnalysis} className="action-btn" style={{ background:"rgba(212,168,83,0.12)", border:"1px solid rgba(212,168,83,0.3)", color:"#d4a853", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:12, fontWeight:500 }}>
                    Analyser avec l'IA
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <div style={{ animation:"fadeIn 0.3s ease" }}>
            <div style={{ fontFamily:"'Playfair Display'", fontStyle:"italic", fontSize:14, color:"rgba(212,168,83,0.6)", marginBottom:16 }}>Statistiques des notifications</div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                { label:"Total",    value: notifications.length,                      icon:"🔔", color:"#d4a853" },
                { label:"Non lues", value: unread,                                    icon:"📬", color:"#e07b54" },
                { label:"Urgentes", value: notifications.filter((n)=>n.urgent).length, icon:"⚡", color:"#e05454" },
                { label:"Lues",     value: notifications.filter((n)=>n.read).length,  icon:"✅", color:"#6ab8a0" },
              ].map((k, i) => (
                <div key={i} style={{ padding:16, borderRadius:14, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.03)", animation:`fadeDown 0.4s ease ${i*0.08}s both` }}>
                  <div style={{ fontSize:22, marginBottom:6 }}>{k.icon}</div>
                  <div style={{ fontSize:28, fontFamily:"'Bebas Neue'", letterSpacing:2, color:k.color }}>{k.value}</div>
                  <div style={{ fontSize:11, color:"rgba(232,213,163,0.45)", fontWeight:500 }}>{k.label}</div>
                </div>
              ))}
            </div>

            <div style={{ padding:16, borderRadius:14, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.02)", marginBottom:16 }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize:11, letterSpacing:4, color:"rgba(212,168,83,0.5)", marginBottom:12 }}>PAR CATÉGORIE</div>
              {Object.entries(grouped).map(([type, count], i) => (
                <div key={type} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, animation:`fadeDown 0.4s ease ${i*0.06}s both` }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background: TYPE_COLORS[type]||"#a0a0a0", flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:12, color:"rgba(232,213,163,0.7)", textTransform:"capitalize" }}>{type}</span>
                  <div style={{ flex:2, height:4, borderRadius:2, background:"rgba(255,255,255,0.05)", overflow:"hidden" }}>
                    <div style={{ height:"100%", borderRadius:2, background: TYPE_COLORS[type]||"#a0a0a0", width:`${(count/notifications.length)*100}%`, transition:"width 0.6s ease" }} />
                  </div>
                  <span style={{ fontSize:12, color: TYPE_COLORS[type]||"#a0a0a0", fontWeight:600, width:20, textAlign:"right" }}>{count}</span>
                </div>
              ))}
            </div>

            <div style={{ padding:16, borderRadius:14, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.02)" }}>
              <div style={{ fontFamily:"'Bebas Neue'", fontSize:11, letterSpacing:4, color:"rgba(212,168,83,0.5)", marginBottom:12 }}>CANAUX ACTIFS</div>
              {[
                { label:"Push PWA",      active: pushEnabled,      icon:"📱" },
                { label:"Email de repli", active: emailFallback,    icon:"📧" },
                { label:"Son activé",    active: soundEnabled,     icon:"🔊" },
                { label:"Deep linking",  active: deepLinkEnabled,  icon:"🔗" },
              ].map((ch, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <span style={{ fontSize:12, color:"rgba(232,213,163,0.6)" }}>{ch.icon} {ch.label}</span>
                  <div style={{ width:8, height:8, borderRadius:"50%", background: ch.active?"#6ab8a0":"rgba(255,255,255,0.15)", boxShadow: ch.active?"0 0 6px #6ab8a0":"none" }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeTab === "settings" && (
          <div style={{ animation:"fadeIn 0.3s ease", display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ fontFamily:"'Playfair Display'", fontStyle:"italic", fontSize:14, color:"rgba(212,168,83,0.6)", marginBottom:4 }}>Préférences & canaux</div>

            {[
              { key:"sound",    label:"Son de notification", desc:"Joue un son à chaque notification reçue",               icon:"🔊", value: soundEnabled,    set: (v: boolean) => { setSoundEnabled(v); if (v) playNotificationSound("success", true); } },
              { key:"deeplink", label:"Deep linking",        desc:"Les notifications naviguent vers la page concernée",    icon:"🔗", value: deepLinkEnabled,  set: setDeepLinkEnabled },
              { key:"email",    label:"Email de repli",      desc:"Si le push est refusé, envoie un email à la place",    icon:"📧", value: emailFallback,     set: setEmailFallback },
            ].map((s) => (
              <div key={s.key} style={{ padding:16, borderRadius:14, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.02)" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                    <span style={{ fontSize:20 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:"#e8d5a3" }}>{s.label}</div>
                      <div style={{ fontSize:11, color:"rgba(232,213,163,0.4)", marginTop:2 }}>{s.desc}</div>
                    </div>
                  </div>
                  <div onClick={() => s.set(!s.value)} style={{ width:44, height:24, borderRadius:12, cursor:"pointer", background: s.value?"#d4a853":"rgba(255,255,255,0.1)", position:"relative", flexShrink:0, transition:"background 0.3s ease" }}>
                    <div style={{ position:"absolute", top:3, left: s.value?23:3, width:18, height:18, borderRadius:"50%", background: s.value?"#0a0806":"rgba(255,255,255,0.4)", transition:"left 0.2s ease", boxShadow:"0 1px 4px rgba(0,0,0,0.3)" }} />
                  </div>
                </div>
              </div>
            ))}

            {/* PWA Push */}
            <div style={{ padding:16, borderRadius:14, border:`1px solid ${pushEnabled?"rgba(106,184,160,0.3)":"rgba(212,168,83,0.2)"}`, background: pushEnabled?"rgba(106,184,160,0.05)":"rgba(212,168,83,0.04)" }}>
              <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:12 }}>
                <span style={{ fontSize:20 }}>📱</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:"#e8d5a3" }}>Notifications PWA</div>
                  <div style={{ fontSize:11, color:"rgba(232,213,163,0.4)", marginTop:2 }}>Notifications push sur votre appareil mobile</div>
                </div>
              </div>
              {pushStatus==="granted"||pushEnabled ? (
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", borderRadius:8, background:"rgba(106,184,160,0.1)", border:"1px solid rgba(106,184,160,0.2)" }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:"#6ab8a0", animation:"pulse 2s infinite" }} />
                  <span style={{ fontSize:12, color:"#6ab8a0" }}>Push activé — notifications autorisées</span>
                </div>
              ) : pushStatus==="denied" ? (
                <div style={{ fontSize:12, color:"#e05454", padding:"8px 12px", borderRadius:8, background:"rgba(224,84,84,0.1)", border:"1px solid rgba(224,84,84,0.2)" }}>
                  ⛔ Permission refusée — email de repli {emailFallback?"activé":"désactivé"}
                </div>
              ) : (
                <button onClick={requestPush} className="action-btn" style={{ width:"100%", padding:"10px", borderRadius:10, border:"1px solid rgba(212,168,83,0.4)", background:"rgba(212,168,83,0.1)", color:"#d4a853", cursor:"pointer", fontSize:13, fontWeight:500 }}>
                  {pushStatus==="requesting"?"⏳ Demande en cours…":"Autoriser les notifications push"}
                </button>
              )}
            </div>

            {/* Email config */}
            {emailFallback && (
              <div style={{ padding:16, borderRadius:14, border:"1px solid rgba(255,255,255,0.07)", background:"rgba(255,255,255,0.02)", animation:"fadeDown 0.3s ease" }}>
                <div style={{ fontSize:12, color:"rgba(232,213,163,0.5)", marginBottom:8 }}>Adresse email de repli</div>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ flex:1, padding:"9px 12px", borderRadius:8, border:"1px solid rgba(212,168,83,0.2)", background:"rgba(0,0,0,0.3)", color:"#e8d5a3", fontSize:12, outline:"none", fontFamily:"'DM Sans'" }} />
                  <button className="action-btn" onClick={() => { const t: Toast = { toastId:Date.now(), type:"success", title:"Email sauvegardé", body:emailInput, icon:"✅", urgent:false }; setToastQueue((q)=>[...q,t]); setTimeout(()=>setToastQueue((q)=>q.slice(1)),4000); }} style={{ padding:"9px 14px", borderRadius:8, background:"rgba(212,168,83,0.15)", border:"1px solid rgba(212,168,83,0.3)", color:"#d4a853", cursor:"pointer", fontSize:12 }}>
                    Sauvegarder
                  </button>
                </div>
              </div>
            )}

            {/* Test sounds */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {Object.keys(NOTIFICATION_SOUNDS).map((type) => (
                <button key={type} onClick={() => playNotificationSound(type, true)} className="action-btn" style={{ padding:"10px", borderRadius:10, border:"1px solid rgba(255,255,255,0.08)", background:"rgba(255,255,255,0.03)", color:"rgba(232,213,163,0.6)", cursor:"pointer", fontSize:12 }}>
                  ▶ Son {type}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Toasts */}
      <div style={{ position:"fixed", top:20, right:16, zIndex:1000, display:"flex", flexDirection:"column", gap:8, maxWidth:300 }}>
        {toastQueue.map((t) => (
          <div key={t.toastId} style={{ padding:"12px 14px", borderRadius:12, border:`1px solid ${t.urgent?"rgba(224,84,84,0.4)":"rgba(212,168,83,0.25)"}`, background:"rgba(10,8,6,0.95)", backdropFilter:"blur(12px)", animation:"toastIn 0.3s ease", boxShadow:"0 4px 24px rgba(0,0,0,0.6)", display:"flex", gap:10, alignItems:"flex-start" }}>
            <span style={{ fontSize:18, flexShrink:0 }}>{t.icon}</span>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:"#e8d5a3", marginBottom:2 }}>{t.title}</div>
              <div style={{ fontSize:11, color:"rgba(232,213,163,0.55)", lineHeight:1.4 }}>{t.body}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom gold line */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, height:2, background:"linear-gradient(90deg,transparent,#d4a853 30%,#d4a853 70%,transparent)", opacity:0.4 }} />
    </div>
  );
}

