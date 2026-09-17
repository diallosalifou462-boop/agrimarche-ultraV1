"use strict";(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[5460],{35460:(e,t,r)=>{r.r(t),r.d(t,{default:()=>m,formatRelativeAge:()=>c});var n=r(95155),i=r(12115),l=r(69722),o=r.n(l);r(90737),r(78390),r(43516),r(5301);let a={client:"#10b981",seller:"#f97316",delivery:"#6366f1",admin:"#8b5cf6",pickup:"#f97316",dropoff:"#10b981",me:"#06b6d4"},u={client:"\uD83C\uDFE0",seller:"\uD83C\uDFEA",delivery:"\uD83D\uDEF5",admin:"\uD83D\uDEE1️",pickup:"\uD83C\uDFEA",dropoff:"\uD83C\uDFE0",me:"\uD83D\uDCCD"};function s(e){if(!e)return null;if(e instanceof Date)return e;if("number"==typeof e)return new Date(e);if("string"==typeof e){let t=new Date(e);return Number.isNaN(t.getTime())?null:t}return"function"==typeof e.toDate?e.toDate():null}function d(e){let t=s(e);if(!t)return"unknown";let r=Date.now()-t.getTime();return r<6e4?"live":r<9e5?"recent":"stale"}function c(e){let t=s(e);if(!t)return null;let r=Math.round((Date.now()-t.getTime())/1e3);if(r<10)return"\xe0 l'instant";if(r<60)return`il y a ${r}s`;let n=Math.round(r/60);if(n<60)return`il y a ${n} min`;let i=Math.round(n/60);if(i<24)return`il y a ${i} h`;let l=Math.round(i/24);return`il y a ${l} j`}function f(e){let t=e.getChildCount(),r=t<10?34:t<50?40:48;return o().divIcon({className:"fleet-map-cluster",html:`<div style="
        width:${r}px;height:${r}px;border-radius:50%;
        background:#16a34a;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 10px rgba(0,0,0,.4);
        border:3px solid #fff;
        color:#fff;font-weight:700;font-size:${t<100?14:12}px;
      ">${t}</div>`,iconSize:[r,r],iconAnchor:[r/2,r/2]})}function p(e){return e.replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e])}function m({points:e,fallbackCenter:t,height:r=420,selectedId:l}){let s=(0,i.useMemo)(()=>e.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lng)&&e.lat>=-90&&e.lat<=90&&e.lng>=-180&&e.lng<=180),[e]),g=s[0]??t??{lat:14.7167,lng:-17.4677},h=(0,i.useRef)(null),y=(0,i.useRef)(null),v=(0,i.useRef)(null),b=(0,i.useRef)({});return(0,i.useEffect)(()=>{if(!h.current||y.current)return;let e=h.current;e._leaflet_id&&delete e._leaflet_id;let t=o().map(h.current,{center:[g.lat,g.lng],zoom:12,scrollWheelZoom:!0});y.current=t,o().tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(t);let r=o().markerClusterGroup({chunkedLoading:!0,iconCreateFunction:f,maxClusterRadius:50,spiderfyOnMaxZoom:!0,showCoverageOnHover:!1});return r.addTo(t),v.current=r,()=>{t.remove(),y.current=null,v.current=null,b.current={}}},[]),(0,i.useEffect)(()=>{let e=y.current,t=v.current;if(!e||!t)return;t.clearLayers();let r={};if(s.forEach(e=>{var n,i,l;let s,f,m,g,h,y,v=o().marker([e.lat,e.lng],{icon:(n=e.kind,i=e.approximate,l=d(e.updatedAt),s=a[n],f=u[n],m="live"===l?1:"recent"===l?.85:"stale"===l?.55:.3,g=i?Math.min(m,.72):m,h="live"===l?`<div style="position:absolute;inset:-4px;border-radius:50%;border:2px solid ${s};opacity:.6;animation:fleetPulse 1.6s ease-out infinite;"></div>`:"",o().divIcon({className:"fleet-map-marker",html:`<div style="position:relative;">
      ${h}
      <div style="
        width:30px;height:30px;border-radius:50%;
        background:${s};
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,.35);
        border:2px solid #fff;
        font-size:14px;
        opacity:${g};
      ">${f}</div>
      ${i?`<div style="position:absolute;inset:-6px;border-radius:50%;border:2px dashed ${s};opacity:.5;"></div>`:""}
      </div>
      <style>@keyframes fleetPulse{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.6);opacity:0}}</style>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-15]}))});v.bindPopup((y=d(e.updatedAt),`
    <div style="font-size:13px;font-weight:600;">${p(e.label)}</div>
    ${e.sublabel?`<div style="font-size:11px;color:#6b7280;">${p(e.sublabel)}</div>`:""}
    ${e.approximate?`<div style="font-size:10px;color:#9ca3af;margin-top:2px;">📍 Position approximative</div>`:""}
    ${null!=e.updatedAt?`<div style="font-size:10px;margin-top:2px;color:${"live"===y?"#16a34a":"recent"===y?"#d97706":"#9ca3af"};font-weight:${"live"===y?700:400};">${"live"===y?"\uD83D\uDFE2 En direct":`🕓 ${c(e.updatedAt)??""}`}</div>`:""}
  `)),e.onClick&&v.on("click",e.onClick),t.addLayer(v),r[e.id]=v}),b.current=r,1===s.length)e.setView([s[0].lat,s[0].lng],14);else if(s.length>1){let t=o().latLngBounds(s.map(e=>[e.lat,e.lng]));e.fitBounds(t,{padding:[40,40],maxZoom:15})}},[s]),(0,i.useEffect)(()=>{l&&b.current[l]&&b.current[l].openPopup()},[l,s]),(0,n.jsx)("div",{ref:h,style:{height:r,width:"100%",borderRadius:16}})}}}]);