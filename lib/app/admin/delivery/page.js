"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AdminDeliveryDashboard;
const react_1 = require("react");
const useAuth_1 = require("@/hooks/useAuth");
const navigation_1 = require("next/navigation");
const firebase_1 = require("@/lib/firebase/firebase");
const firestore_1 = require("firebase/firestore");
const lucide_react_1 = require("lucide-react");
// ─── Color palette for multiple drivers ──────────────────────────────────────
const DRIVER_COLORS = [
    { primary: '#f97316', light: '#fed7aa', dark: '#9a3412', gradient: 'from-orange-500 to-orange-600' },
    { primary: '#6366f1', light: '#c7d2fe', dark: '#3730a3', gradient: 'from-indigo-500 to-indigo-600' },
    { primary: '#ec4899', light: '#fbcfe8', dark: '#9d174d', gradient: 'from-pink-500 to-pink-600' },
    { primary: '#14b8a6', light: '#99f6e4', dark: '#0f766e', gradient: 'from-teal-500 to-teal-600' },
    { primary: '#eab308', light: '#fef08a', dark: '#854d0e', gradient: 'from-yellow-500 to-yellow-600' },
    { primary: '#8b5cf6', light: '#ddd6fe', dark: '#5b21b6', gradient: 'from-violet-500 to-violet-600' },
    { primary: '#ef4444', light: '#fecaca', dark: '#7f1d1d', gradient: 'from-red-500 to-red-600' },
    { primary: '#06b6d4', light: '#a5f3fc', dark: '#155e75', gradient: 'from-cyan-500 to-cyan-600' },
];
function getDriverColor(uid) {
    let hash = 0;
    for (const c of uid)
        hash = (hash * 31 + c.charCodeAt(0)) % DRIVER_COLORS.length;
    return DRIVER_COLORS[hash];
}
// ─── Admin Map Component ──────────────────────────────────────────────────────
function AdminMap({ orders, selectedOrderId, onSelectOrder }) {
    const mapRef = (0, react_1.useRef)(null);
    const mapInstanceRef = (0, react_1.useRef)(null);
    const markersRef = (0, react_1.useRef)({});
    (0, react_1.useEffect)(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            document.head.appendChild(link);
        }
        const initMap = () => {
            var _a;
            if (!mapRef.current || mapInstanceRef.current)
                return;
            const L = window.L;
            if (!L)
                return;
            const firstDriver = orders.find(o => { var _a; return (_a = o.tracking) === null || _a === void 0 ? void 0 : _a.currentLocation; });
            const center = ((_a = firstDriver === null || firstDriver === void 0 ? void 0 : firstDriver.tracking) === null || _a === void 0 ? void 0 : _a.currentLocation) || { lat: 14.7167, lng: -17.4677 };
            const map = L.map(mapRef.current, {
                center: [center.lat, center.lng],
                zoom: 12,
                zoomControl: false,
                attributionControl: false,
            });
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19,
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            }).addTo(map);
            L.control.zoom({ position: 'topright' }).addTo(map);
            mapInstanceRef.current = map;
        };
        if (window.L)
            initMap();
        else {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            script.onload = initMap;
            document.head.appendChild(script);
        }
        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);
    (0, react_1.useEffect)(() => {
        var _a;
        const L = window.L;
        if (!L || !mapInstanceRef.current)
            return;
        const map = mapInstanceRef.current;
        Object.values(markersRef.current).forEach((m) => m.remove());
        markersRef.current = {};
        orders.forEach((order) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            const { primary: color, light: lightColor } = getDriverColor(((_a = order.tracking) === null || _a === void 0 ? void 0 : _a.deliveryUserId) || order.id);
            const isSelected = order.id === selectedOrderId;
            if ((_b = order.tracking) === null || _b === void 0 ? void 0 : _b.currentLocation) {
                const { lat, lng } = order.tracking.currentLocation;
                const driverIcon = L.divIcon({
                    html: `
            <div style="position:relative;width:${isSelected ? 52 : 44}px;height:${isSelected ? 52 : 44}px">
              ${isSelected ? `<div style="position:absolute;inset:-4px;border-radius:50%;background:${color}30;animation:ripple 1.5s ease-out infinite"></div>` : ''}
              <div style="
                position:absolute;inset:0;border-radius:50%;
                background:linear-gradient(135deg,${color},${color}cc);
                border:3px solid #fff;
                box-shadow:0 4px 16px ${color}80;
                display:flex;align-items:center;justify-content:center;
                font-size:${isSelected ? 20 : 18}px;
                cursor:pointer;
              ">🛵</div>
              ${((_c = order.tracking) === null || _c === void 0 ? void 0 : _c.speed) ? `<div style="position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);background:#1e293b;color:${color};font-size:8px;font-weight:700;padding:2px 6px;border-radius:20px;white-space:nowrap;">${Math.round(((_d = order.tracking.speed) !== null && _d !== void 0 ? _d : 0) * 3.6)} km/h</div>` : ''}
            </div>
            <style>@keyframes ripple{0%{transform:scale(0.8);opacity:1}100%{transform:scale(2.2);opacity:0}}</style>
          `,
                    className: '',
                    iconSize: [isSelected ? 52 : 44, isSelected ? 52 : 44],
                    iconAnchor: [isSelected ? 26 : 22, isSelected ? 26 : 22],
                });
                const marker = L.marker([lat, lng], { icon: driverIcon })
                    .addTo(map)
                    .bindPopup(`
            <div style="font-family:system-ui;min-width:180px;padding:4px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <div style="width:32px;height:32px;border-radius:50%;background:${color}20;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:16px">🛵</div>
                <div>
                  <b style="color:${color}">Commande #${order.orderNumber || order.id.slice(-6).toUpperCase()}</b>
                  <div style="color:#666;font-size:11px">${order.userName || '—'}</div>
                </div>
              </div>
              ${order.totalAmount ? `<div style="font-size:12px;color:#333">💰 ${order.totalAmount.toLocaleString()} FCFA</div>` : ''}
              ${((_e = order.customerLocation) === null || _e === void 0 ? void 0 : _e.address) ? `<div style="font-size:11px;color:#888;margin-top:4px">📍 ${order.customerLocation.address.slice(0, 40)}</div>` : ''}
              <button onclick="window.selectOrder('${order.id}')" style="margin-top:8px;width:100%;padding:6px;background:${color};border:none;border-radius:8px;color:#fff;font-size:11px;cursor:pointer">Voir détails</button>
            </div>
          `);
                marker.on('click', () => onSelectOrder(order.id));
                markersRef.current[`driver-${order.id}`] = marker;
            }
            if (((_f = order.customerLocation) === null || _f === void 0 ? void 0 : _f.lat) && ((_g = order.customerLocation) === null || _g === void 0 ? void 0 : _g.lng)) {
                const destIcon = L.divIcon({
                    html: `<div style="width:32px;height:32px;border-radius:50%;background:${color}22;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px ${color}40">📍</div>`,
                    className: '', iconSize: [32, 32], iconAnchor: [16, 16],
                });
                const destMarker = L.marker([order.customerLocation.lat, order.customerLocation.lng], { icon: destIcon })
                    .addTo(map)
                    .bindPopup(`<div style="font-family:system-ui;font-size:12px"><b>${order.userName}</b><br>${order.customerLocation.address || ''}</div>`);
                markersRef.current[`dest-${order.id}`] = destMarker;
                if ((_h = order.tracking) === null || _h === void 0 ? void 0 : _h.currentLocation) {
                    const line = L.polyline([[order.tracking.currentLocation.lat, order.tracking.currentLocation.lng],
                        [order.customerLocation.lat, order.customerLocation.lng]], { color, weight: 2.5, dashArray: '6,10', opacity: isSelected ? 0.9 : 0.4 }).addTo(map);
                    markersRef.current[`line-${order.id}`] = line;
                }
            }
        });
        if (selectedOrderId) {
            const order = orders.find(o => o.id === selectedOrderId);
            if ((_a = order === null || order === void 0 ? void 0 : order.tracking) === null || _a === void 0 ? void 0 : _a.currentLocation) {
                map.setView([order.tracking.currentLocation.lat, order.tracking.currentLocation.lng], 14);
            }
        }
    }, [orders, selectedOrderId]);
    return <div ref={mapRef} style={{ width: '100%', height: '100%' }}/>;
}
// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, trend, color, bg }) {
    return (<div className={`bg-white rounded-xl p-5 border-l-4 ${bg}`} style={{ borderLeftColor: color }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`} style={{ color }}>
            {icon}
          </div>
          <div>
            <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
          </div>
        </div>
        {trend && (<div className={`text-xs font-semibold ${trend.positive ? 'text-green-600' : 'text-red-600'} bg-${trend.positive ? 'green' : 'red'}-50 px-2 py-1 rounded-full`}>
            {trend.positive ? '+' : ''}{trend.value}%
          </div>)}
      </div>
    </div>);
}
// ─── Order Card ───────────────────────────────────────────────────────────────
function OrderCard({ order, isSelected, onSelect }) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const { primary: color, light: lightColor, gradient } = getDriverColor(((_a = order.tracking) === null || _a === void 0 ? void 0 : _a.deliveryUserId) || order.id);
    const lastUp = (_d = (_c = (_b = order.tracking) === null || _b === void 0 ? void 0 : _b.lastUpdate) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c);
    const secAgo = lastUp ? Math.round((Date.now() - lastUp.getTime()) / 1000) : null;
    const isLive = secAgo !== null && secAgo < 30;
    const speed = ((_e = order.tracking) === null || _e === void 0 ? void 0 : _e.speed) ? Math.round(((_f = order.tracking.speed) !== null && _f !== void 0 ? _f : 0) * 3.6) : null;
    return (<div onClick={onSelect} className={`group rounded-xl p-4 cursor-pointer transition-all duration-200 ${isSelected ? 'ring-2' : 'hover:shadow-md'}`} style={{
            background: isSelected ? `linear-gradient(135deg, ${color}08, ${color}04)` : '#fff',
            border: `1px solid ${isSelected ? color : '#e2e8f0'}`,
            boxShadow: isSelected ? `0 0 0 2px ${color}` : 'none',
        }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg ${isSelected ? 'shadow-md' : ''}`} style={{ background: `${color}15` }}>
            🛵
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-bold text-gray-800">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</p>
              {isLive && (<div className="flex items-center gap-1 px-1.5 py-0.5 bg-green-100 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"/>
                  <span className="text-[9px] font-semibold text-green-600">LIVE</span>
                </div>)}
            </div>
            <p className="text-sm text-gray-600">{order.userName}</p>
          </div>
        </div>
        {order.totalAmount && (<p className="font-bold text-gray-800">{order.totalAmount.toLocaleString()} FCFA</p>)}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <lucide_react_1.MapPin size={12} className="text-gray-400"/>
          <span className="truncate max-w-[150px]">{((_h = (_g = order.customerLocation) === null || _g === void 0 ? void 0 : _g.address) === null || _h === void 0 ? void 0 : _h.slice(0, 35)) || '—'}</span>
        </div>
        {speed && (<div className="flex items-center gap-1">
            <lucide_react_1.Truck size={12} className="text-gray-400"/>
            <span>{speed} km/h</span>
          </div>)}
        {secAgo !== null && (<div className="flex items-center gap-1">
            <lucide_react_1.Clock size={12} className="text-gray-400"/>
            <span>MAJ {secAgo < 60 ? `${secAgo}s` : `${Math.round(secAgo / 60)}m`}</span>
          </div>)}
      </div>

      {order.userPhone && (<div className="mt-3 flex gap-2">
          <a href={`tel:${order.userPhone}`} className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200">
            <lucide_react_1.Phone size={10}/> Appeler
          </a>
          <a href={`https://wa.me/${order.userPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-600 rounded-lg text-xs hover:bg-green-100">
            <lucide_react_1.MessageCircle size={10}/> WhatsApp
          </a>
        </div>)}
    </div>);
}
// ─── Main Component ───────────────────────────────────────────────────────────
function AdminDeliveryDashboard() {
    var _a, _b, _c, _d, _e, _f;
    const { user, profile, loading: authLoading } = (0, useAuth_1.useAuth)();
    const router = (0, navigation_1.useRouter)();
    const [activeOrders, setActiveOrders] = (0, react_1.useState)([]);
    const [recentDelivered, setRecentDelivered] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [selectedOrderId, setSelectedOrderId] = (0, react_1.useState)(null);
    const [tab, setTab] = (0, react_1.useState)('map');
    const [searchTerm, setSearchTerm] = (0, react_1.useState)('');
    const [showNotifications, setShowNotifications] = (0, react_1.useState)(false);
    const [lastRefresh, setLastRefresh] = (0, react_1.useState)(new Date());
    // Auth guard
    (0, react_1.useEffect)(() => {
        if (!authLoading && (!user || (profile === null || profile === void 0 ? void 0 : profile.role) !== 'admin'))
            router.push('/');
    }, [authLoading, user, profile, router]);
    // Live active orders
    (0, react_1.useEffect)(() => {
        if (!user)
            return;
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'orders'), (0, firestore_1.where)('status', '==', 'expediee'));
        const unsub = (0, firestore_1.onSnapshot)(q, (snap) => {
            const data = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            setActiveOrders(data);
            setLoading(false);
            setLastRefresh(new Date());
            if (!selectedOrderId && data.length > 0)
                setSelectedOrderId(data[0].id);
        });
        return () => unsub();
    }, [user]);
    // Recent delivered
    (0, react_1.useEffect)(() => {
        if (!user)
            return;
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'orders'), (0, firestore_1.where)('status', '==', 'livree'));
        const unsub = (0, firestore_1.onSnapshot)(q, (snap) => {
            const data = snap.docs
                .map(d => (Object.assign({ id: d.id }, d.data())))
                .sort((a, b) => { var _a, _b; return (((_a = b.deliveredAt) === null || _a === void 0 ? void 0 : _a.seconds) || 0) - (((_b = a.deliveredAt) === null || _b === void 0 ? void 0 : _b.seconds) || 0); })
                .slice(0, 10);
            setRecentDelivered(data);
        });
        return () => unsub();
    }, [user]);
    const filteredOrders = activeOrders.filter(order => (order.orderNumber || order.id).toLowerCase().includes(searchTerm.toLowerCase()) ||
        (order.userName || '').toLowerCase().includes(searchTerm.toLowerCase()));
    const liveDrivers = activeOrders.filter(o => {
        var _a, _b, _c;
        const lu = (_c = (_b = (_a = o.tracking) === null || _a === void 0 ? void 0 : _a.lastUpdate) === null || _b === void 0 ? void 0 : _b.toDate) === null || _c === void 0 ? void 0 : _c.call(_b);
        return lu && (Date.now() - lu.getTime()) < 60000;
    });
    const todayRevenue = recentDelivered
        .filter(o => {
        var _a, _b;
        const d = (_b = (_a = o.deliveredAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
        return d && new Date().toDateString() === d.toDateString();
    })
        .reduce((s, o) => s + (o.totalAmount || 0), 0);
    const avgSpeed = activeOrders
        .map(o => { var _a; return ((_a = o.tracking) === null || _a === void 0 ? void 0 : _a.speed) || 0; })
        .reduce((a, b) => a + b, 0) / (activeOrders.length || 1);
    const selectedOrder = activeOrders.find(o => o.id === selectedOrderId);
    const { primary: selectedColor } = selectedOrder ? getDriverColor(((_a = selectedOrder.tracking) === null || _a === void 0 ? void 0 : _a.deliveryUserId) || selectedOrder.id) : { primary: '#6366f1' };
    if (authLoading || loading) {
        return (<div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
          <p className="text-gray-500">Chargement du dashboard...</p>
        </div>
      </div>);
    }
    if (!user || (profile === null || profile === void 0 ? void 0 : profile.role) !== 'admin')
        return null;
    return (<div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 flex items-center justify-center shadow-md">
                <lucide_react_1.Truck size={20} className="text-white"/>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">Dashboard Livraisons</h1>
                <p className="text-xs text-gray-500">Suivi en temps réel des livreurs</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Refresh indicator */}
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <lucide_react_1.RefreshCw size={12} className={loading ? 'animate-spin' : ''}/>
                <span>MAJ {lastRefresh.toLocaleTimeString()}</span>
              </div>

              {/* Notifications */}
              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className="relative w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition">
                  <lucide_react_1.Bell size={18} className="text-gray-600"/>
                  {liveDrivers.length > 0 && (<span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
                      {liveDrivers.length}
                    </span>)}
                </button>
                {showNotifications && (<div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-100 z-20">
                    <div className="p-3 border-b border-gray-100">
                      <p className="font-semibold text-gray-800">Notifications</p>
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {liveDrivers.map(driver => (<div key={driver.id} className="p-3 border-b border-gray-50 hover:bg-gray-50">
                          <p className="text-sm text-gray-700">
                            🛵 Livraison #{driver.orderNumber || driver.id.slice(-6)} en cours
                          </p>
                          <p className="text-xs text-gray-400">{driver.userName}</p>
                        </div>))}
                      {liveDrivers.length === 0 && (<div className="p-4 text-center text-gray-400 text-sm">
                          Aucune notification
                        </div>)}
                    </div>
                  </div>)}
              </div>

              {/* User */}
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                  {((_b = profile === null || profile === void 0 ? void 0 : profile.displayName) === null || _b === void 0 ? void 0 : _b.charAt(0)) || 'A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-6">
          <StatCard icon={<lucide_react_1.Truck size={18}/>} label="Livraisons en cours" value={activeOrders.length} trend={{ value: 12, positive: true }} color="#f97316" bg="bg-orange-50"/>
          <StatCard icon={<lucide_react_1.CheckCircle size={18}/>} label="Livrées aujourd'hui" value={recentDelivered.filter(o => {
            var _a, _b;
            const d = (_b = (_a = o.deliveredAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
            return d && new Date().toDateString() === d.toDateString();
        }).length} trend={{ value: 8, positive: true }} color="#10b981" bg="bg-green-50"/>
          <StatCard icon={<lucide_react_1.TrendingUp size={18}/>} label="CA aujourd'hui" value={`${(todayRevenue / 1000).toFixed(0)}k FCFA`} trend={{ value: 5, positive: true }} color="#6366f1" bg="bg-indigo-50"/>
          <StatCard icon={<lucide_react_1.Users size={18}/>} label="Livreurs actifs" value={new Set(activeOrders.map(o => { var _a; return (_a = o.tracking) === null || _a === void 0 ? void 0 : _a.deliveryUserId; }).filter(Boolean)).size} color="#ec4899" bg="bg-pink-50"/>
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
          <div className="bg-white rounded-xl p-4 flex items-center justify-between border border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Vitesse moyenne</p>
              <p className="text-xl font-bold text-gray-800">{Math.round(avgSpeed * 3.6)} km/h</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <lucide_react_1.Zap size={18} className="text-blue-500"/>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 flex items-center justify-between border border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Précision GPS moyenne</p>
              <p className="text-xl font-bold text-gray-800">
                {Math.round(activeOrders.reduce((a, o) => { var _a; return a + (((_a = o.tracking) === null || _a === void 0 ? void 0 : _a.accuracy) || 50); }, 0) / (activeOrders.length || 1))} m
              </p>
            </div>
            <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center">
              <lucide_react_1.Target size={18} className="text-purple-500"/>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 flex items-center justify-between border border-gray-100">
            <div>
              <p className="text-xs text-gray-500">Taux de réussite</p>
              <p className="text-xl font-bold text-gray-800">98.5%</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <lucide_react_1.Award size={18} className="text-emerald-500"/>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
            {['map', 'list'].map(t => (<button key={t} onClick={() => setTab(t)} className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'map' ? '🗺️ Vue carte' : '📋 Vue liste'}
              </button>))}
          </div>

          {/* Search */}
          <div className="relative">
            <lucide_react_1.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input type="text" placeholder="Rechercher commande..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:border-emerald-400"/>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Orders List */}
          <div className="lg:col-span-1 space-y-3 max-h-[600px] overflow-y-auto pr-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                En cours · {filteredOrders.length}
              </p>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
                <span className="text-xs text-gray-400">{liveDrivers.length} actifs</span>
              </div>
            </div>

            {filteredOrders.length === 0 ? (<div className="bg-white rounded-xl p-8 text-center border border-gray-100">
                <lucide_react_1.Package size={40} className="text-gray-300 mx-auto mb-3"/>
                <p className="text-gray-500">Aucune livraison en cours</p>
              </div>) : (filteredOrders.map(order => (<OrderCard key={order.id} order={order} isSelected={selectedOrderId === order.id} onSelect={() => setSelectedOrderId(order.id)}/>)))}

            {/* Delivered section */}
            {recentDelivered.length > 0 && (<div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Récemment livrées · {recentDelivered.length}
                </p>
                <div className="space-y-2">
                  {recentDelivered.slice(0, 5).map(order => (<div key={order.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center justify-between opacity-70">
                      <div>
                        <p className="text-sm font-semibold text-gray-700">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</p>
                        <p className="text-xs text-gray-500">{order.userName}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                        <lucide_react_1.CheckCircle size={10}/> Livrée
                      </span>
                    </div>))}
                </div>
              </div>)}
          </div>

          {/* Right Panel - Map or List View */}
          <div className="lg:col-span-2">
            {tab === 'map' ? (<div className="bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: '600px' }}>
                <AdminMap orders={activeOrders} selectedOrderId={selectedOrderId} onSelectOrder={setSelectedOrderId}/>
              </div>) : (<div className="grid grid-cols-1 gap-4 max-h-[600px] overflow-y-auto">
                {filteredOrders.map(order => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                const { primary: color } = getDriverColor(((_a = order.tracking) === null || _a === void 0 ? void 0 : _a.deliveryUserId) || order.id);
                const lu = (_d = (_c = (_b = order.tracking) === null || _b === void 0 ? void 0 : _b.lastUpdate) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c);
                const sec = lu ? Math.round((Date.now() - lu.getTime()) / 1000) : null;
                const live = sec !== null && sec < 30;
                const speed = ((_e = order.tracking) === null || _e === void 0 ? void 0 : _e.speed) ? Math.round(((_f = order.tracking.speed) !== null && _f !== void 0 ? _f : 0) * 3.6) : null;
                return (<div key={order.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm hover:shadow-md transition">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: `${color}15` }}>🛵</div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-gray-800">#{order.orderNumber || order.id.slice(-6).toUpperCase()}</p>
                              {live && <span className="text-[9px] font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-full">LIVE</span>}
                            </div>
                            <p className="text-sm text-gray-600">{order.userName}</p>
                          </div>
                        </div>
                        {order.totalAmount && <p className="font-bold text-emerald-600">{order.totalAmount.toLocaleString()} FCFA</p>}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <lucide_react_1.MapPin size={14} className="text-gray-400"/>
                          <span className="truncate">{((_h = (_g = order.customerLocation) === null || _g === void 0 ? void 0 : _g.address) === null || _h === void 0 ? void 0 : _h.slice(0, 30)) || '—'}</span>
                        </div>
                        {speed && (<div className="flex items-center gap-2 text-gray-500">
                            <lucide_react_1.Truck size={14} className="text-gray-400"/>
                            <span>{speed} km/h</span>
                          </div>)}
                      </div>

                      {order.userPhone && (<div className="mt-3 flex gap-2 pt-2 border-t border-gray-100">
                          <a href={`tel:${order.userPhone}`} className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 rounded-lg text-xs text-gray-600 hover:bg-gray-200">
                            <lucide_react_1.Phone size={12}/> Appeler
                          </a>
                          <a href={`https://wa.me/${order.userPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-50 text-green-600 rounded-lg text-xs hover:bg-green-100">
                            <lucide_react_1.MessageCircle size={12}/> WhatsApp
                          </a>
                        </div>)}
                    </div>);
            })}
              </div>)}
          </div>
        </div>

        {/* Selected order detail overlay (for map view) */}
        {tab === 'map' && selectedOrder && (<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 w-[90%] max-w-lg">
            <div className="bg-white rounded-2xl shadow-2xl border-l-4 overflow-hidden" style={{ borderLeftColor: selectedColor }}>
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl" style={{ background: `${selectedColor}15` }}>🛵</div>
                    <div>
                      <p className="font-bold text-gray-800">#{selectedOrder.orderNumber || selectedOrder.id.slice(-6).toUpperCase()}</p>
                      <p className="text-sm text-gray-600">{selectedOrder.userName}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedOrderId(null)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                    <lucide_react_1.X size={14}/>
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <lucide_react_1.MapPin size={14} className="text-gray-400 mx-auto mb-1"/>
                    <p className="text-xs text-gray-600 truncate">{((_d = (_c = selectedOrder.customerLocation) === null || _c === void 0 ? void 0 : _c.address) === null || _d === void 0 ? void 0 : _d.slice(0, 20)) || '—'}</p>
                  </div>
                  {((_e = selectedOrder.tracking) === null || _e === void 0 ? void 0 : _e.speed) && (<div className="bg-gray-50 rounded-lg p-2 text-center">
                      <lucide_react_1.Truck size={14} className="text-gray-400 mx-auto mb-1"/>
                      <p className="text-xs font-semibold text-gray-700">{Math.round(((_f = selectedOrder.tracking.speed) !== null && _f !== void 0 ? _f : 0) * 3.6)} km/h</p>
                    </div>)}
                  <div className="bg-gray-50 rounded-lg p-2 text-center">
                    <lucide_react_1.Clock size={14} className="text-gray-400 mx-auto mb-1"/>
                    <p className="text-xs text-gray-600">
                      {(() => {
                var _a, _b, _c;
                const lu = (_c = (_b = (_a = selectedOrder.tracking) === null || _a === void 0 ? void 0 : _a.lastUpdate) === null || _b === void 0 ? void 0 : _b.toDate) === null || _c === void 0 ? void 0 : _c.call(_b);
                if (!lu)
                    return '—';
                const s = Math.round((Date.now() - lu.getTime()) / 1000);
                return s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
            })()}
                    </p>
                  </div>
                </div>

                {selectedOrder.userPhone && (<div className="mt-3 flex gap-2">
                    <a href={`tel:${selectedOrder.userPhone}`} className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium">
                      <lucide_react_1.Phone size={14}/> Appeler
                    </a>
                    <a href={`https://wa.me/${selectedOrder.userPhone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg text-sm font-medium">
                      <lucide_react_1.MessageCircle size={14}/> WhatsApp
                    </a>
                  </div>)}
              </div>
            </div>
          </div>)}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .animate-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>);
}
