(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[8279],{7147:(e,t,r)=>{"use strict";r.d(t,{Z:()=>i});let a=new Set(["functions/unavailable","functions/deadline-exceeded","functions/internal","functions/resource-exhausted"]);async function i(e,t=3){let r;for(let i=1;i<=t;i++)try{return await e()}catch(s){r=s;let e=i===t;if(!function(e){let t=e?.code||"";return!!(a.has(t)||"u">typeof navigator&&!navigator.onLine)}(s)||e)throw s;let n=500*2**(i-1),o=250*Math.random();await function(e){return new Promise(t=>setTimeout(t,e))}(n+o)}throw r}},17641:(e,t,r)=>{"use strict";r.d(t,{A:()=>n});var a=r(95155);let i=(0,r(37206).default)(()=>Promise.all([r.e(6648),r.e(1761),r.e(2351)]).then(r.bind(r,32351)),{loadableGenerated:{webpack:()=>[32351]},ssr:!1,loading:()=>(0,a.jsxs)("div",{className:"h-[260px] w-full bg-gray-100 rounded-2xl flex items-center justify-center",children:[(0,a.jsx)("div",{className:"w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"}),(0,a.jsx)("span",{className:"text-sm text-gray-400 ml-2",children:"Chargement de la carte..."})]})});function n(e){return(0,a.jsx)(i,{...e})}},27155:(e,t,r)=>{"use strict";r.d(t,{DT:()=>d,J1:()=>s,Vb:()=>o,jS:()=>l});var a=r(77805);function i(e){let t=e.coords;return{coords:{latitude:t.latitude,longitude:t.longitude,accuracy:t.accuracy,altitude:t.altitude??null,altitudeAccuracy:t.altitudeAccuracy??null,heading:t.heading??null,speed:t.speed??null},timestamp:e.timestamp??Date.now()}}function n(e){let t=String(e?.message||e||"").toLowerCase();return t.includes("denied")||t.includes("permission")?{code:1,message:e?.message||"Permission refus\xe9e."}:t.includes("timeout")?{code:3,message:e?.message||"D\xe9lai d\xe9pass\xe9."}:{code:2,message:e?.message||"Position indisponible."}}async function o(){if(a.Ii.isNativePlatform()){let{Geolocation:e}=await r.e(3245).then(r.bind(r,43245)),t=await e.checkPermissions();return"granted"===t.location||"granted"===t.coarseLocation?"granted":"denied"===t.location&&"denied"===t.coarseLocation?"denied":"prompt"}if("u">typeof navigator&&"permissions"in navigator)try{return(await navigator.permissions.query({name:"geolocation"})).state}catch{}return"prompt"}function s(e){let t={enableHighAccuracy:!0,timeout:1e4,maximumAge:0,...e};return a.Ii.isNativePlatform()?r.e(3245).then(r.bind(r,43245)).then(({Geolocation:e})=>e.getCurrentPosition(t).then(i).catch(e=>{throw n(e)})):new Promise((e,r)=>{"u"<typeof navigator||!navigator.geolocation?r({code:2,message:"G\xe9olocalisation non support\xe9e par ce navigateur."}):navigator.geolocation.getCurrentPosition(t=>e(i(t)),e=>r({code:e.code,message:e.message}),t)})}async function l(e,t){let o={enableHighAccuracy:!0,timeout:15e3,...e};if(a.Ii.isNativePlatform()){let{Geolocation:e}=await r.e(3245).then(r.bind(r,43245));return e.watchPosition(o,(e,r)=>{r?t(null,n(r)):e&&t(i(e),null)})}return"u"<typeof navigator||!navigator.geolocation?(t(null,{code:2,message:"G\xe9olocalisation non support\xe9e par ce navigateur."}),-1):navigator.geolocation.watchPosition(e=>t(i(e),null),e=>t(null,{code:e.code,message:e.message}),{...o,maximumAge:0})}async function d(e){if(null!==e){if(a.Ii.isNativePlatform()){let{Geolocation:t}=await r.e(3245).then(r.bind(r,43245));await t.clearWatch({id:String(e)});return}"number"==typeof e&&"u">typeof navigator&&navigator.geolocation&&navigator.geolocation.clearWatch(e)}}},27907:(e,t,r)=>{"use strict";r.d(t,{CartProvider:()=>x,_:()=>f});var a=r(95155),i=r(12115),n=r(42623),o=r(91531),s=r(54894);let l={items:[],total:0,itemCount:0};async function d(e,t=1){try{var r,a;return await (r=(0,o.getDoc)((0,o.doc)(s.db,"carts",e)),a=`getDoc carts (essai ${t})`,Promise.race([r,new Promise((e,t)=>setTimeout(()=>t(Error(`[useCart] Timeout (8000ms) sur ${a}`)),8e3))]))}catch(r){if((r?.code==="unavailable"||/offline/i.test(r?.message??""))&&t<8){let r=Math.min(1e3*2**t,8e3);return(0,s.uP)("PANIER",`getDoc carts hors-ligne, nouvel essai dans ${r}ms... (essai ${t})`),await new Promise(e=>setTimeout(e,r)),d(e,t+1)}throw r}}let c="agrimarche_cart_guest";function u(e){let t=e.reduce((e,t)=>e+t.product.price*t.quantity,0),r=e.reduce((e,t)=>e+t.quantity,0);return{items:e,total:t,itemCount:r}}function p(e){return Array.isArray(e)?e.filter(e=>null!==e&&"object"==typeof e&&"number"==typeof e.quantity&&e.quantity>0&&null!==e.product&&"object"==typeof e.product&&"string"==typeof e.product.id&&"number"==typeof e.product.price):[]}function g(e){return JSON.parse(JSON.stringify(e))}function m(e){try{let t=localStorage.getItem(e);if(!t)return[];let r=JSON.parse(t);if(r?.items)return p(r.items);if(Array.isArray(r))return p(r);return[]}catch{try{localStorage.removeItem(e)}catch{}return[]}}let h=(0,i.createContext)(null);function x({children:e}){let{user:t,loading:r}=(0,n.A)(),f=t?.uid||"guest",y=`agrimarche_cart_${f}`,[v,b]=(0,i.useState)(l),[j,S]=(0,i.useState)(!0),k=(0,i.useRef)([]),w=(0,i.useRef)(y),A=(0,i.useRef)(f);w.current=y,A.current=f,(0,i.useEffect)(()=>{if(r)return;let e=!1;return S(!0),(0,s.uP)("PANIER",`hydratation d\xe9marr\xe9e — user=${t?.uid??"guest"}`),(async()=>{let r=m(c);if(t)try{(0,s.uP)("PANIER","attente waitForFirestoreReady() avant getDoc carts"),await (0,s.T6)();let a=await d(t.uid);(0,s.uP)("PANIER","getDoc carts r\xe9solu");let i=a.exists()?p(a.data().items):[],n=m(y);if(n.length&&n.forEach(e=>{let t=i.find(t=>t.product.id===e.product.id);t?t.quantity=Math.max(t.quantity,e.quantity):i.push(e)}),r.length){r.forEach(e=>{let t=i.find(t=>t.product.id===e.product.id);t?t.quantity=Math.min(t.quantity+e.quantity,t.product.stock||999):i.push(e)});try{localStorage.removeItem(c)}catch{}}if(e)return;if(k.current=i,b(u(i)),r.length||n.length){let e=u(i);try{localStorage.setItem(y,JSON.stringify(e))}catch{}(0,o.BN)((0,o.doc)(s.db,"carts",t.uid),g(e),{merge:!0}).catch(console.error)}}catch(r){console.error(r),(0,s.uP)("PANIER","\xc9CHEC getDoc carts — repli sur le panier local",r?.message||r);let t=m(y);e||(k.current=t,b(u(t)))}else e||(k.current=r,b(u(r)));e||((0,s.uP)("PANIER","hydratation termin\xe9e — isLoading=false"),S(!1))})(),()=>{e=!0}},[t?.uid,r,y]);let z=(0,i.useCallback)(e=>{k.current=e;let t=u(e);b(t);try{localStorage.setItem(w.current,JSON.stringify(t))}catch{}navigator.onLine&&"guest"!==A.current&&(0,o.BN)((0,o.doc)(s.db,"carts",A.current),g(t),{merge:!0}).catch(console.error)},[]),N=(0,i.useCallback)((e,t=1)=>{let r=k.current,a=r.find(t=>t.product.id===e.id);if(0>=(e.stock||0))return;let i=e.minOrder||1;z(a?r.map(r=>r.product.id===e.id?{...r,quantity:Math.min(r.quantity+t,e.stock||0)}:r):[...r,{product:e,quantity:Math.min(Math.max(t,i),e.stock||0)}])},[z]),C=(0,i.useCallback)(e=>{z(k.current.filter(t=>t.product.id!==e))},[z]),F=(0,i.useCallback)((e,t)=>{t<=0?C(e):z(k.current.map(r=>{if(r.product.id!==e)return r;let a=Math.max(t,r.product.minOrder||1);return{...r,quantity:Math.min(a,r.product.stock||0)}}))},[z,C]),P=(0,i.useCallback)(()=>{z([])},[z]);return(0,a.jsx)(h.Provider,{value:{cart:v,isLoading:j,addToCart:N,removeFromCart:C,updateQuantity:F,clearCart:P},children:e})}function f(){let e=(0,i.useContext)(h);if(!e)throw Error("useCart() doit \xeatre utilis\xe9 \xe0 l'int\xe9rieur de <CartProvider>. V\xe9rifie que CartProvider entoure bien l'app dans app/layout.tsx.");return e}},37417:(e,t,r)=>{"use strict";r.d(t,{Ln:()=>c,X2:()=>u,Yy:()=>g,bc:()=>m,iD:()=>l,rr:()=>h,sG:()=>p});var a=r(15103),i=r(96905),n=r(54894),o=r(7147);let s=(0,a.Uz)(n.yA,"us-central1");class l extends Error{constructor(e,t){super(t),this.code=e}}function d(e){let t=e?.code||"unknown";return new l(t,{"functions/failed-precondition":e?.message||"Cette commande a chang\xe9 d'\xe9tat entre-temps.","functions/permission-denied":e?.message||"Vous n'avez pas acc\xe8s \xe0 cette commande.","functions/not-found":"Commande introuvable.","functions/unauthenticated":"Votre session a expir\xe9, reconnectez-vous.","functions/invalid-argument":e?.message||"Code incorrect.","functions/resource-exhausted":e?.message||"Trop de tentatives — r\xe9essayez plus tard."}[t]??"\uD83D\uDE0A Petit souci technique — r\xe9essayez dans un instant.")}async function c(e){try{let t=(0,a.Qg)(s,"claimOrder");await (0,o.Z)(()=>t({orderId:e}))}catch(e){throw d(e)}}async function u(e,t){try{let r=(0,a.Qg)(s,"startGuestCheckoutSession"),l=await (0,o.Z)(()=>r({phone:e,name:t}));return await (0,i.p)(n.j2,l.data.customToken),l.data.guestPhone}catch(e){throw d(e)}}async function p(e,t){try{let r=(0,a.Qg)(s,"confirmDeliveryWithCode");await r({orderId:e,code:t})}catch(e){throw d(e)}}async function g(e){try{let t=(0,a.Qg)(s,"getDeliveryCode");return(await (0,o.Z)(()=>t({orderId:e}))).data.code}catch(e){throw d(e)}}async function m(e){try{let t=(0,a.Qg)(s,"findGuestOrders");return(await t({phone:e})).data.orders}catch(e){throw d(e)}}async function h(e,t){try{let r=(0,a.Qg)(s,"claimGuestOrderSession"),o=await r({orderId:e,phone:t});await (0,i.p)(n.j2,o.data.customToken)}catch(e){throw d(e)}}},42623:(e,t,r)=>{"use strict";r.d(t,{A:()=>a.A});var a=r(95390)},58147:(e,t,r)=>{"use strict";r.d(t,{Rt:()=>c,hc:()=>u});let a="https://nominatim.openstreetmap.org",i=new Map,n=new Map;function o(e){return Math.round(1e4*e)/1e4}function s(e){return e?.city||e?.town||e?.village||e?.county}function l(e){return e?.state||e?.region}async function d(e,t={}){let r=e.trim();if(!r)return[];let n=`${r.toLowerCase()}|${t.limit??5}|${t.countryCodes??"sn"}`;if(i.has(n))return i.get(n);let o=new URLSearchParams({q:r,format:"jsonv2",addressdetails:"1",limit:String(t.limit??5)}),c=null===t.countryCodes?void 0:t.countryCodes??"sn";c&&o.set("countrycodes",c);try{let e=await fetch(`${a}/search?${o.toString()}`,{headers:{Accept:"application/json"}});if(!e.ok)throw Error(`Nominatim ${e.status}`);let t=(await e.json()).map(e=>({latitude:parseFloat(e.lat),longitude:parseFloat(e.lon),displayName:e.display_name,address:e.address?.road,city:s(e.address),region:l(e.address),country:e.address?.country,postalCode:e.address?.postcode}));return i.set(n,t),t}catch(e){return console.warn("[geo] geocodeAddress a \xe9chou\xe9 :",e),[]}}async function c(e,t,r={}){let i=`${o(e)},${o(t)}`;if(n.has(i))return n.get(i);let d=new URLSearchParams({lat:String(e),lon:String(t),format:"jsonv2",addressdetails:"1",zoom:"16"});try{let e=await fetch(`${a}/reverse?${d.toString()}`,{headers:{Accept:"application/json"},signal:r.signal});if(!e.ok)throw Error(`Nominatim ${e.status}`);let t=await e.json(),o={displayName:t.display_name,address:t.address?.road,neighborhood:t.address?.neighbourhood||t.address?.suburb||t.address?.quarter,city:s(t.address),region:l(t.address),country:t.address?.country,countryCode:t.address?.country_code,postalCode:t.address?.postcode};return n.set(i,o),o}catch(e){return console.warn("[geo] reverseGeocode a \xe9chou\xe9 :",e),null}}async function u(e,t=6){return d(e,{limit:t})}},66182:(e,t,r)=>{Promise.resolve().then(r.bind(r,77698))},77698:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>V});var a=r(95155),i=r(12115),n=r(98500),o=r.n(n),s=r(73321),l=r(27907),d=r(42623),c=r(27155),u=r(58147),p=r(54894),g=r(94982);function m(e){return{city:e.city||"",region:e.region||"",country:e.country||"",lat:e.lat,lng:e.lng,detected:e.detected??!0,address:e.address,isDefault:e.isDefault}}var h=r(17641),x=r(91531),f=r(95e3),y=r(16369),v=r(34018),b=r(57983),j=r(13488),S=r(17007),k=r(65079),w=r(31966),A=r(5736),z=r(66295),N=r(76721),C=r(67033),F=r(35484),P=r(93744),D=r(75796),T=r(71019),E=r(64577),I=r(16720),M=r(87973),L=r(95097),O=r(92571);let R=async e=>{let t=(0,x.doc)(p.db,"orders",e),r={pending:{completed:!0,timestamp:new Date},preparing:{completed:!1,timestamp:null},ready:{completed:!1,timestamp:null},picked_up:{completed:!1,timestamp:null},in_transit:{completed:!1,timestamp:null},arrived:{completed:!1,timestamp:null},delivered:{completed:!1,timestamp:null}};return await (0,x.updateDoc)(t,{deliveryStatus:"pending",deliverySteps:r}),!0},$=e=>{let t=new Date(e);return t.setDate(t.getDate()+3),t};var _=r(91e3),G=r(85978),W=r(37417);let q=`
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap');

  :root {
    --ivory:   #FAFAF8;
    --white:   #FFFFFF;
    --gold:    #C9A96E;
    --gold-lt: #E8D5B0;
    --ink:     #1A1A1A;
    --ink-md:  #4A4A4A;
    --ink-lt:  #9A9A9A;
    --border:  rgba(201,169,110,0.18);
    --shadow:  0 4px 40px rgba(26,26,26,0.06);
    --shadow-lg: 0 16px 64px rgba(26,26,26,0.10);
  }

  .checkout-root * { font-family: 'DM Sans', sans-serif; }
  .checkout-root { background: var(--ivory); min-height: 100vh; }

  .serif { font-family: 'Cormorant Garamond', Georgia, serif; }

  .card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 20px;
    box-shadow: var(--shadow);
    overflow: hidden;
    transition: box-shadow 0.3s ease;
  }
  .card:hover { box-shadow: var(--shadow-lg); }

  .card-header {
    padding: 20px 28px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .card-header-title {
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-md);
  }
  .card-header-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--gold);
    flex-shrink: 0;
  }

  .card-body { padding: 24px 28px; }

  .info-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--ivory);
    border-radius: 12px;
    border: 1px solid transparent;
    transition: border-color 0.2s;
  }
  .info-row:hover { border-color: var(--border); }
  .info-row-label { font-size: 11px; color: var(--ink-lt); letter-spacing: 0.06em; text-transform: uppercase; }
  .info-row-value { font-size: 14px; color: var(--ink); font-weight: 500; margin-top: 2px; }

  .icon-circle {
    width: 38px; height: 38px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold-lt), var(--gold));
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    color: white;
  }

  .pay-option {
    display: flex; align-items: center; gap: 16px;
    padding: 18px 20px;
    border-radius: 14px;
    border: 1.5px solid var(--border);
    cursor: pointer;
    transition: all 0.25s ease;
    background: var(--white);
    position: relative;
  }
  .pay-option:hover { border-color: var(--gold); background: #FFFDF9; }
  .pay-option.selected {
    border-color: var(--gold);
    background: linear-gradient(135deg, #FFFDF9, #FDF8EE);
    box-shadow: 0 0 0 4px rgba(201,169,110,0.08);
  }
  .pay-option input[type="radio"] { display: none; }
  .pay-radio {
    width: 18px; height: 18px;
    border-radius: 50%;
    border: 2px solid var(--border);
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: border-color 0.2s;
  }
  .pay-option.selected .pay-radio { border-color: var(--gold); }
  .pay-radio-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--gold);
    opacity: 0;
    transform: scale(0);
    transition: all 0.2s cubic-bezier(0.34,1.56,0.64,1);
  }
  .pay-option.selected .pay-radio-dot { opacity: 1; transform: scale(1); }

  .location-btn {
    width: 100%;
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px;
    border-radius: 14px;
    background: linear-gradient(135deg, #FFFDF9, #FDF5E4);
    border: 1.5px solid var(--gold-lt);
    cursor: pointer;
    transition: all 0.25s;
  }
  .location-btn:hover { border-color: var(--gold); box-shadow: 0 4px 20px rgba(201,169,110,0.12); }

  .cta-btn {
    width: 100%;
    padding: 18px;
    border-radius: 14px;
    background: var(--ink);
    color: var(--white);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    border: none;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  .cta-btn::before {
    content: '';
    position: absolute; inset: 0;
    background: linear-gradient(135deg, var(--gold), #A07840);
    opacity: 0;
    transition: opacity 0.3s;
  }
  .cta-btn:hover::before { opacity: 1; }
  .cta-btn > * { position: relative; z-index: 1; }
  .cta-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .cta-btn:disabled::before { display: none; }

  .sep { height: 1px; background: var(--border); margin: 16px 0; }

  .cart-item {
    display: flex; align-items: center; gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .cart-item:last-child { border-bottom: none; }
  .cart-thumb {
    width: 46px; height: 46px;
    border-radius: 10px;
    background: linear-gradient(135deg, #F0FAF4, #D4F0E0);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  .total-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px;
  }
  .total-row.grand {
    padding-top: 14px;
    margin-top: 6px;
    border-top: 1px solid var(--border);
  }

  .err-box {
    display: flex; align-items: center; gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    background: #FFF5F5;
    border: 1px solid #FFD5D5;
    color: #C0392B;
    font-size: 13px;
  }

  .success-root {
    min-height: 100vh;
    background: var(--ivory);
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
  }
  .success-card {
    max-width: 480px; width: 100%;
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 28px;
    box-shadow: var(--shadow-lg);
    padding: 52px 44px;
    text-align: center;
  }
  .success-icon-ring {
    width: 88px; height: 88px;
    border-radius: 50%;
    border: 1.5px solid var(--gold-lt);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 28px;
    animation: ring-pulse 2s ease infinite;
  }
  @keyframes ring-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(201,169,110,0.3); }
    50% { box-shadow: 0 0 0 12px rgba(201,169,110,0); }
  }
  .success-order-badge {
    display: inline-block;
    padding: 8px 20px;
    border-radius: 999px;
    background: linear-gradient(135deg, #FFFDF9, #FDF5E4);
    border: 1px solid var(--gold-lt);
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    color: var(--gold);
    font-weight: 600;
    letter-spacing: 0.08em;
    margin: 10px 0 24px;
  }

  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(26,26,26,0.55);
    backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    z-index: 50; padding: 16px;
    animation: fade-in 0.2s ease;
  }
  @keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }
  .modal-card {
    background: var(--white);
    border-radius: 24px;
    box-shadow: 0 32px 80px rgba(26,26,26,0.20);
    width: 100%; max-width: 440px;
    overflow: hidden;
    animation: slide-up 0.3s cubic-bezier(0.34,1.2,0.64,1);
  }
  @keyframes slide-up { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

  .input-field {
    width: 100%;
    padding: 14px 18px;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    font-size: 14px;
    color: var(--ink);
    background: var(--white);
    outline: none;
    transition: border-color 0.2s;
    font-family: 'DM Sans', sans-serif;
  }
  .input-field:focus { border-color: var(--gold); }

  .tag {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .tag-gold {
    background: linear-gradient(135deg, #FFFDF9, #FDF5E4);
    border: 1px solid var(--gold-lt);
    color: var(--gold);
  }
  .tag-green {
    background: #F0FAF4;
    border: 1px solid #A8E6C0;
    color: #1E7A44;
  }

  .animate-enter {
    animation: enter 0.5s ease both;
  }
  @keyframes enter { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
  .delay-1 { animation-delay: 0.08s }
  .delay-2 { animation-delay: 0.16s }
  .delay-3 { animation-delay: 0.24s }
  .delay-4 { animation-delay: 0.32s }
`,B={wave:{id:"wave",name:"Wave",description:"Paiement instantan\xe9, s\xe9curis\xe9",icon:(0,a.jsx)(f.A,{size:17}),fee:0,paymentLink:e=>"https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/",minAmount:100,maxAmount:1e6},orange_money:{id:"orange_money",name:"Orange Money",description:"Paiement mobile Orange",icon:(0,a.jsx)(f.A,{size:17}),fee:0,paymentLink:null,merchantPhone:"77 974 70 73",minAmount:100,maxAmount:1e6}};function U({phone:e,setPhone:t,name:r,setName:i,error:n,submitting:o,onContinue:s,onCancel:l}){return(0,a.jsxs)("div",{className:"modal-card",style:{maxWidth:420},children:[(0,a.jsxs)("div",{className:"modal-header",style:{padding:"24px 28px",borderBottom:"1px solid var(--border)",textAlign:"center"},children:[(0,a.jsx)("div",{style:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg, var(--gold-lt), var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},children:(0,a.jsx)(y.A,{size:24,color:"#fff"})}),(0,a.jsx)("h3",{className:"serif",style:{fontSize:20,fontWeight:600,color:"var(--ink)"},children:"Continuer sans compte"}),(0,a.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:6,lineHeight:1.5},children:"Juste votre num\xe9ro — vous en aurez besoin pour retrouver votre commande et votre code de livraison."})]}),(0,a.jsxs)("div",{style:{padding:"24px 28px"},children:[(0,a.jsx)("input",{type:"tel",inputMode:"tel",value:e,onChange:e=>t(e.target.value),placeholder:"Ex. 77 123 45 67",autoFocus:!0,style:{width:"100%",padding:"13px 16px",borderRadius:10,border:"1px solid var(--border)",fontSize:14,marginBottom:10}}),(0,a.jsx)("input",{type:"text",value:r,onChange:e=>i(e.target.value),placeholder:"Votre nom (optionnel)",style:{width:"100%",padding:"13px 16px",borderRadius:10,border:"1px solid var(--border)",fontSize:14,marginBottom:4}}),n&&(0,a.jsx)("p",{style:{color:"#dc2626",fontSize:12.5,marginTop:8,lineHeight:1.4},children:n}),(0,a.jsx)("button",{onClick:s,disabled:o,className:"cta-btn",style:{marginTop:18,width:"100%"},children:o?"Un instant…":"Continuer"}),(0,a.jsx)("button",{onClick:l,style:{marginTop:10,width:"100%",background:"none",border:"none",color:"var(--ink-lt)",fontSize:12.5,cursor:"pointer"},children:"J'ai d\xe9j\xe0 un compte — me connecter"})]})]})}function J({method:e,amount:t,remainingAmount:r,onConfirm:n,onBack:o}){let s=e.paymentLink?e.paymentLink(t):null;(0,i.useEffect)(()=>{"wave"===e.id&&s&&(sessionStorage.setItem("wave_pending",JSON.stringify({paymentMethod:"wave",ts:Date.now()})),window.location.href=s)},[]);let l=()=>{n()};return(0,a.jsxs)("div",{className:"modal-card",style:{maxWidth:460},children:[(0,a.jsxs)("div",{className:"modal-header",style:{padding:"24px 28px",borderBottom:"1px solid var(--border)",textAlign:"center"},children:[(0,a.jsx)("div",{style:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg, var(--gold-lt), var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},children:e.icon}),(0,a.jsxs)("h3",{className:"serif",style:{fontSize:22,fontWeight:400,color:"var(--ink)"},children:["Acompte ",e.name]}),(0,a.jsxs)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:6},children:["Acompte (25%) : ",(0,a.jsxs)("strong",{children:[t.toLocaleString()," FCFA"]})]}),(0,a.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:4},children:["Solde \xe0 r\xe9gler \xe0 la livraison : ",r.toLocaleString()," FCFA"]})]}),(0,a.jsxs)("div",{style:{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,textAlign:"center"},children:["wave"===e.id?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px",textAlign:"center"},children:[(0,a.jsx)("p",{style:{fontSize:14,color:"var(--ink)",marginBottom:12},children:"Vous allez \xeatre redirig\xe9 vers Wave pour effectuer le paiement de l'acompte (25%)."}),(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:16},children:[(0,a.jsx)(v.A,{size:16,style:{color:"var(--gold)"}}),(0,a.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)"},children:"Paiement s\xe9curis\xe9"})]})]}),(0,a.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,a.jsx)(b.A,{size:16}),"J'ai pay\xe9 l'acompte, confirmer ma commande"]})]}):(0,a.jsxs)(a.Fragment,{children:[(0,a.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px"},children:[(0,a.jsx)("p",{style:{fontSize:13,color:"var(--ink-md)",marginBottom:12},children:"Envoyez l'acompte (25%) \xe0 :"}),(0,a.jsxs)("div",{style:{fontSize:20,fontWeight:700,color:"var(--gold)",letterSpacing:"0.08em",marginBottom:8},children:["+221 ",e.merchantPhone]}),(0,a.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"via Orange Money"}),(0,a.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:10},children:["Solde de ",r.toLocaleString()," FCFA \xe0 r\xe9gler \xe0 la livraison"]})]}),(0,a.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,a.jsx)(b.A,{size:16}),"J'ai pay\xe9 l'acompte, confirmer ma commande"]})]}),(0,a.jsx)("button",{onClick:o,style:{fontSize:11,color:"var(--ink-lt)",background:"none",border:"none",cursor:"pointer",marginTop:8},children:"← Annuler"})]})]})}function V(){let e=(0,s.useRouter)(),{user:t,profile:r}=(0,d.A)(),{cart:n,clearCart:f}=(0,l._)(),{location:v,loading:V,detectLocation:H}=function(){let[e,t]=(0,i.useState)({city:"Chargement...",region:"",country:"",lat:0,lng:0,detected:!1,isDefault:!1}),[r,a]=(0,i.useState)(!0),[n,o]=(0,i.useState)(""),s=(0,i.useCallback)(async()=>{a(!0),o("");try{try{(0,p.uP)("GEOLOC","tentative getCurrentPosition (GPS natif/web)...");let e=await (0,c.J1)({enableHighAccuracy:!0,timeout:1e4}),{latitude:r,longitude:i}=e.coords;(0,p.uP)("GEOLOC",`GPS OK — lat=${r.toFixed(4)} lng=${i.toFixed(4)} accuracy=${e.coords.accuracy}`);try{let e=await (0,u.Rt)(r,i);if(!e)throw Error("Erreur API");(0,p.uP)("GEOLOC",`reverse geocoding OK — ${e.city||"?"}`);let n=e.city||"Dakar",o=e.region||n,s=e.country||"S\xe9n\xe9gal",l={city:n,region:o,country:s,lat:r,lng:i,detected:!0,address:`${n}, ${o}`,isDefault:!1};return console.log(`📍 Localisation GPS : ${n}`),t(l),(0,g._R)(l),a(!1),l}catch(n){(0,p.uP)("GEOLOC","reverse geocoding \xc9CHEC (position GPS conserv\xe9e quand m\xeame)",n),console.error("Erreur reverse geocoding:",n);let e={city:"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:r,lng:i,detected:!0,isDefault:!0};return o("\uD83D\uDCCD Position approximative - activez la localisation pour plus de pr\xe9cision"),t(e),a(!1),e}}catch(n){let e=n?.code;(0,p.uP)("GEOLOC",`GPS \xc9CHEC — code=${e} (${1===e?"PERMISSION_DENIED":3===e?"TIMEOUT":"POSITION_UNAVAILABLE"}) message="${n?.message}"`),console.warn("GPS indisponible, repli sur la g\xe9olocalisation IP:",n);try{(0,p.uP)("GEOLOC","tentative repli IP (ipapi.co)...");let e=await fetch("https://ipapi.co/json/");if((0,p.uP)("GEOLOC",`r\xe9ponse ipapi.co : status=${e.status}`),e.ok){let r=await e.json();if(r.latitude&&r.longitude){let e=r.city||"Dakar",i=r.region||e,n=r.country_name||"S\xe9n\xe9gal",s={city:e,region:i,country:n,lat:r.latitude,lng:r.longitude,detected:!0,address:`${e}, ${i}`,isDefault:!0};return console.log(`📍 Localisation d\xe9tect\xe9e par IP (repli) : ${e}`),o("\uD83D\uDCCD Position approximative (IP) - activez la localisation GPS pour plus de pr\xe9cision"),t(s),a(!1),s}}}catch(e){(0,p.uP)("GEOLOC","repli IP \xc9CHEC — fetch a lev\xe9 une exception (r\xe9seau/CSP bloqu\xe9 ?)",e),console.error("Erreur g\xe9olocalisation IP:",e)}(0,p.uP)("GEOLOC","GPS + IP tous deux en \xe9chec → repli sur Dakar par d\xe9faut");let r=n?.code===1,i={city:r?"\uD83D\uDCCD Ville non d\xe9tect\xe9e":"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return o(r?"\uD83D\uDCCD Activez la localisation pour une g\xe9olocalisation pr\xe9cise":"\uD83D\uDCCD Position approximative - activez la localisation pour plus de pr\xe9cision"),t(i),a(!1),i}}catch(r){console.error("Erreur d\xe9tection localisation:",r);let e={city:"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return o("\uD83D\uDCCD Position approximative - activez la localisation"),t(e),a(!1),e}},[]);return(0,i.useEffect)(()=>{let e=(0,g.aV)();if(e&&!(0,g.HC)(e)){t(m(e)),a(!1);return}e&&(t(m(e)),a(!0)),s()},[s]),{location:e,loading:r,error:n,detectLocation:s}}(),[Q,Y]=(0,i.useState)(!1),[K,Z]=(0,i.useState)(null),[X,ee]=(0,i.useState)(!1),[et,er]=(0,i.useState)(null),[ea,ei]=(0,i.useState)(""),[en,eo]=(0,i.useState)([]),[es,el]=(0,i.useState)(!1),ed=K?{...K,city:K.address,region:"",country:"S\xe9n\xe9gal",detected:!0,isDefault:!1}:v;(0,i.useEffect)(()=>{v?.lat&&v.lng&&!et&&er({lat:v.lat,lng:v.lng})},[v,et]),(0,i.useEffect)(()=>{let e=ea.trim();if(e.length<3)return void eo([]);el(!0);let t=setTimeout(()=>{(0,u.hc)(e,5).then(eo).finally(()=>el(!1))},300);return()=>clearTimeout(t)},[ea]);let ec=(0,i.useCallback)(e=>{er({lat:e.latitude,lng:e.longitude}),Z({lat:e.latitude,lng:e.longitude,address:[e.address,e.city].filter(Boolean).join(", ")||e.displayName,source:"MAP_SEARCH"}),ei(""),eo([]),Y(!1)},[]),eu=(0,i.useCallback)(async()=>{if(et){ee(!0);try{let e=await (0,u.Rt)(et.lat,et.lng),t=e?[e.neighborhood,e.city||e.region].filter(Boolean).join(", ")||e.displayName:`${et.lat.toFixed(5)}, ${et.lng.toFixed(5)}`;Z({lat:et.lat,lng:et.lng,address:t,source:"MANUAL_PIN"}),Y(!1)}catch{Z({lat:et.lat,lng:et.lng,address:`${et.lat.toFixed(5)}, ${et.lng.toFixed(5)}`,source:"MANUAL_PIN"}),Y(!1)}finally{ee(!1)}}},[et]),[ep,eg]=(0,i.useState)(!1),[em,eh]=(0,i.useState)(!1),[ex,ef]=(0,i.useState)(""),[ey,ev]=(0,i.useState)(0),[eb,ej]=(0,i.useState)(!1),[eS,ek]=(0,i.useState)("wave"),[ew,eA]=(0,i.useState)(!1),[ez,eN]=(0,i.useState)(null),[eC,eF]=(0,i.useState)(!1),[eP,eD]=(0,i.useState)(""),[eT,eE]=(0,i.useState)(!1),[eI,eM]=(0,i.useState)(!1),[eL,eO]=(0,i.useState)(""),[eR,e$]=(0,i.useState)(""),[e_,eG]=(0,i.useState)(!1),[eW,eq]=(0,i.useState)(""),eB=(0,i.useRef)(!1);(0,i.useEffect)(()=>{let e=sessionStorage.getItem("wave_pending");if(e)try{let t=JSON.parse(e);"wave"===t.paymentMethod&&(ek("wave"),eE(!0),sessionStorage.removeItem("wave_pending"))}catch{sessionStorage.removeItem("wave_pending")}},[]);let eU=(0,i.useMemo)(()=>n?.items||[],[n]),eJ=(0,i.useMemo)(()=>n?.total||0,[n]),eV=eJ>=5e3,eH=(0,i.useMemo)(()=>{if(eV)return 0;if(!ed?.lat||!ed?.lng)return 1e3;let e=111*Math.sqrt(Math.pow(ed.lat-14.7167,2)+Math.pow(ed.lng+17.4677,2));return e<=10||e<=30?1e3:e<=100?1500:2e3},[ed,eV]),eQ=eJ+eH,eY=Math.round(.25*eQ*1.02),eK=eQ-eY,eZ=(0,i.useMemo)(()=>{if(eV)return"24 – 48 h (Express)";if(!ed?.lat||!ed?.lng)return"\xc0 confirmer";let e=111*Math.sqrt(Math.pow(ed.lat-14.7167,2)+Math.pow(ed.lng+17.4677,2));return e<=10?"24 h":e<=30?"24 – 48 h":e<=100?"48 – 72 h":"3 – 5 jours"},[ed,eV]),eX=(0,i.useCallback)(()=>{let e=new Date,t=e.getFullYear(),r=String(e.getMonth()+1).padStart(2,"0"),a=String(e.getDate()).padStart(2,"0"),i=Math.floor(1e4*Math.random()).toString().padStart(4,"0");return`AGR-${t}${r}${a}-${i}`},[]),e0=async()=>{if(0===eU.length)return eD("Votre panier est vide"),!1;if(!t)return eD("Session expir\xe9e, reconnecte-toi pour continuer."),eF(!1),e.push("/auth/login?redirect=/checkout"),!1;eF(!0),eD("");try{let a=new Map;for(let e of eU)e?.product?.id&&a.set(e.product.id,(a.get(e.product.id)||0)+(e.quantity||1));try{await (0,x.c4)(p.db,async e=>{let t=[...a.entries()],r=t.map(([e])=>(0,x.doc)(p.db,"products",e)),i=await Promise.all(r.map(t=>e.get(t))),n=[];if(i.forEach((e,r)=>{let[,a]=t[r];if(!e.exists())return void n.push({name:"Produit indisponible",available:0});let i=e.data(),o=i?.stock;null!=o&&o<a&&n.push({name:i?.name||"Produit",available:Math.max(0,o)})}),n.length>0){let e=n.map(e=>`${e.name} (${e.available} dispo.)`).join(", ");throw Error(`STOCK_INSUFFISANT: ${e}`)}i.forEach((a,i)=>{let n=a.data()?.stock;if(null==n)return;let[,o]=t[i];e.update(r[i],{stock:n-o})})})}catch(t){let e=String(t?.message||"");return e.startsWith("STOCK_INSUFFISANT:")?eD(`Stock insuffisant pour : ${e.replace("STOCK_INSUFFISANT: ","")}. Merci de mettre \xe0 jour votre panier.`):(console.error("stock transaction:",t),eD("Impossible de v\xe9rifier le stock. Veuillez r\xe9essayer.")),eF(!1),!1}for(let[e]of a)fetch((0,G.y)("/api/products/check-stock"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:e})}).catch(()=>{});let i=new Map;for(let e of eU){let r=e?.product?.sellerId||t?.uid||"agrimarche-official";i.has(r)||i.set(r,[]),i.get(r).push(e)}let n=[...i.entries()],o=n.length>1,s=eX(),l=[];for(let e=0;e<n.length;e++){let a,[i,d]=n[e],c=d[0],u=o?`${s}-${String.fromCharCode(65+e)}`:s,g=i||t?.uid||"agrimarche-official",m=c?.product?.sellerName||c?.product?.farmer||"AgriMarch\xe9",h=c?.product?.sellerPhone||"221779747073",f=c?.product?.region||"Dakar",y=14.7167,v=-17.4677,b="Dakar, S\xe9n\xe9gal",j=!0,S=null,k=null;if(g&&"agrimarche-official"!==g)try{let e=await (0,x.getDoc)((0,x.doc)(p.db,"users",g));if(e.exists()){let t=e.data();y=t?.latitude||t?.lat||14.7167,v=t?.longitude||t?.lng||-17.4677,b=t?.locationAddress||t?.address||t?.city||"Dakar, S\xe9n\xe9gal",j=!(t?.latitude||t?.lat),S=t?.locationSource||null,k=t?.locationUpdatedAt||null}}catch{}let w=d.reduce((e,t)=>e+(t?.product?.price||0)*(t?.quantity||1),0),A=e===n.length-1;if(o)if(A)a=eH-l.reduce((e,t)=>e+t.deliveryFee,0);else{let e=eJ>0?w/eJ:1/n.length;a=Math.round(eH*e)}else a=eH;let z=w+a,N=Math.round(.25*z*1.02),C=z-N,F=B[eS],P={sellerId:g,sellerName:m,sellerPhone:h,sellerRegion:f,userId:t.uid,userName:t?.displayName||eR||"Client AgriMarch\xe9",userEmail:t?.email||"",userPhone:r?.phone||eL||t?.phoneNumber||"",...r?.isGuest||eL&&!r?{guestPhone:eL.replace(/[^\d+]/g,"")}:{},sellerLocation:{lat:y,lng:v,address:b,isDefault:j,...S?{locationSource:S}:{},...k?{locationUpdatedAt:k}:{}},customerLocation:{lat:ed?.lat||null,lng:ed?.lng||null,address:ed?.address||ed?.city||"Adresse non d\xe9tect\xe9e",isDefault:ed?.isDefault??!0},date:new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),timestamp:new Date().toISOString(),status:"en_attente",statusLabel:"En attente de validation - Acompte \xe0 v\xe9rifier",orderGroupId:s,isMultiVendorGroup:o,subtotal:w,deliveryFee:a,isFreeDelivery:eV,total:z,depositRate:.25,depositAmount:N,remainingAmount:C,balanceDueAtDelivery:C,paymentMethod:eS,paymentMethodName:F?.name,paymentStatus:"acompte_en_attente_verification",items:d.map(e=>({productId:e?.product?.id||"unknown",productName:e?.product?.name||"Produit inconnu",productPrice:e?.product?.price||0,quantity:e?.quantity||1,unit:e?.product?.unit||"kg",total:(e?.product?.price||0)*(e?.quantity||1),image:e?.product?.images?.[0]||null,category:e?.product?.category||"Autres"})),deliveryTime:eZ,createdAt:x.Timestamp.now(),updatedAt:x.Timestamp.now()},D=await (0,x.gS)((0,x.rJ)(p.db,"orders"),P);await (0,x.updateDoc)((0,x.doc)(p.db,"orders",D.id),{firestoreId:D.id,orderNumber:u,estimatedDelivery:x.Timestamp.fromDate($(new Date))}),await R(D.id);try{await (0,x.BN)((0,x.doc)(p.db,"seller_orders",D.id),{...P,orderId:D.id,orderNumber:u,firestoreId:D.id,sellerRead:!1,sellerStatus:"nouvelle",notifiedAt:x.Timestamp.now()})}catch(e){console.error("seller_orders",e)}g&&"agrimarche-official"!==g&&(0,_.l7)({userId:g,type:"order",title:"\uD83D\uDED2 Nouvelle commande !",body:`${t?.displayName||"Un client"} vient de commander \xb7 ${z.toLocaleString("fr-FR")} FCFA`,link:"/seller/orders",priority:"high"}),l.push({docRefId:D.id,orderNumber:u,deliveryFee:a,remainingAmount:C})}if(t?.uid&&!r?.isGuest&&ed?.lat&&ed?.lng&&(0,x.updateDoc)((0,x.doc)(p.db,"users",t.uid),{lat:ed.lat,lng:ed.lng,locationAddress:ed.address||ed.city||void 0,locationSource:K?K.source:ed.isDefault?"IP_FALLBACK":"GPS",locationUpdatedAt:x.Timestamp.now()}).catch(()=>{}),fetch((0,G.y)("/api/system/periodic-checks"),{method:"POST"}).catch(()=>{}),f(),ef(o?s:l[0].orderNumber),ev(l.reduce((e,t)=>e+t.remainingAmount,0)),ej(o),eh(!0),r?.phone){let e=l.reduce((e,t)=>e+t.deliveryFee+t.remainingAmount,0),t=o?s:l[0].orderNumber;fetch((0,G.y)("/api/send-sms"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:r.phone,message:`AgriMarch\xe9 : commande #${t} confirm\xe9e. Total ${e.toLocaleString("fr-FR")} FCFA. Merci de votre confiance !`})}).catch(e=>console.warn("[checkout] SMS confirmation non envoy\xe9:",e))}return setTimeout(()=>{e.push(o?"/account/orders":"/account/orders?order="+l[0].docRefId)},3e3),!0}catch(e){return console.error(e),eD("Une erreur est survenue. Veuillez r\xe9essayer."),!1}finally{eF(!1)}},e1=async()=>{eA(!1),await e0()};(0,i.useEffect)(()=>{eT&&0!==eU.length&&t&&(eE(!1),e0())},[eT,eU.length,t]);let e2=async()=>{if(!t)return void eM(!0);if(0===eU.length)return void eD("Votre panier est vide");let e=B[eS];e&&(eN(e),eA(!0))};(0,i.useEffect)(()=>{if(t&&eB.current){eB.current=!1;let e=B[eS];e&&(eN(e),eA(!0))}},[t,eS]);let e4=async()=>{if(eL.trim().replace(/\D/g,"").length<8)return void eq("Entrez un num\xe9ro de t\xe9l\xe9phone valide.");eG(!0),eq("");try{await (0,W.X2)(eL,eR.trim()||void 0),eB.current=!0,eM(!1)}catch(e){eq(e instanceof W.iD?e.message:"Erreur de connexion, r\xe9essayez.")}finally{eG(!1)}};return eC||eT?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)("style",{children:q}),(0,a.jsx)("div",{className:"success-root checkout-root",children:(0,a.jsxs)("div",{className:"success-card",children:[(0,a.jsx)("div",{style:{width:60,height:60,borderRadius:"50%",border:"4px solid var(--gold)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite",margin:"0 auto 24px"}}),(0,a.jsx)("p",{className:"serif",style:{fontSize:26,fontWeight:300,color:"var(--ink)",textAlign:"center"},children:"Traitement en cours\\u2026"}),(0,a.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",textAlign:"center",marginTop:8},children:"Votre commande est en cours de confirmation."})]})}),(0,a.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"})]}):em?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)("style",{children:q}),(0,a.jsx)("div",{className:"success-root checkout-root",children:(0,a.jsxs)("div",{className:"success-card animate-enter",children:[(0,a.jsx)("div",{className:"success-icon-ring",children:(0,a.jsx)(b.A,{size:36,style:{color:"var(--gold)"}})}),(0,a.jsxs)("p",{className:"serif",style:{fontSize:32,fontWeight:300,color:"var(--ink)",lineHeight:1.2},children:["Commande",(0,a.jsx)("br",{}),(0,a.jsx)("em",{children:"confirm\xe9e"})]}),(0,a.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:8},children:"Merci pour votre confiance"}),(0,a.jsx)("div",{className:"success-order-badge",children:ex}),eb&&(0,a.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:-16,marginBottom:16},children:"Votre panier contenait des produits de plusieurs vendeurs — il a \xe9t\xe9 scind\xe9 en plusieurs livraisons, visibles s\xe9par\xe9ment dans \xab Mes commandes \xbb."}),(0,a.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:16,padding:"16px 20px",border:"1px solid var(--border)",textAlign:"left",marginBottom:28},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,a.jsx)(j.A,{size:14,style:{color:"var(--gold)"}}),(0,a.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Livraison estim\xe9e"})]}),(0,a.jsx)("p",{style:{fontSize:15,color:"var(--ink)",fontWeight:400},children:eZ}),eV&&(0,a.jsxs)("span",{className:"tag tag-green",style:{marginTop:8},children:[(0,a.jsx)(S.A,{size:10})," Livraison offerte"]})]}),(0,a.jsxs)("div",{style:{background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:16,padding:"16px 20px",border:"1.5px solid var(--gold-lt)",textAlign:"left",marginBottom:28},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,a.jsx)(k.A,{size:14,style:{color:"var(--gold)"}}),(0,a.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Solde \xe0 r\xe9gler \xe0 la livraison"})]}),(0,a.jsxs)("p",{style:{fontSize:18,color:"var(--ink)",fontWeight:600},children:[ey.toLocaleString()," ",(0,a.jsx)("span",{style:{fontSize:13,fontWeight:400,color:"var(--ink-lt)"},children:"FCFA"})]}),(0,a.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:4},children:"Acompte de 25% d\xe9j\xe0 r\xe9gl\xe9. Le solde est \xe0 remettre au livreur."})]}),(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[(0,a.jsx)(o(),{href:"/account/orders",className:"cta-btn",style:{textDecoration:"none",borderRadius:14},children:"Mes commandes"}),(0,a.jsx)(o(),{href:"/main/products",style:{textDecoration:"none",textAlign:"center",fontSize:12,color:"var(--ink-lt)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"12px",display:"block"},children:"Continuer mes achats"})]})]})})]}):(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)("style",{children:q}),(0,a.jsx)("div",{className:"checkout-root",children:(0,a.jsxs)("div",{style:{maxWidth:1160,margin:"0 auto",padding:"40px 20px"},children:[(0,a.jsxs)("div",{className:"animate-enter",style:{display:"flex",alignItems:"center",gap:16,marginBottom:40},children:[(0,a.jsx)("button",{onClick:()=>e.back(),style:{width:40,height:40,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--white)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--ink-md)",flexShrink:0,transition:"all 0.2s"},children:(0,a.jsx)(w.A,{size:18})}),(0,a.jsxs)("div",{children:[(0,a.jsx)("p",{style:{fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--ink-lt)",marginBottom:2},children:"AgriMarch\xe9"}),(0,a.jsx)("h1",{className:"serif",style:{fontSize:28,fontWeight:400,color:"var(--ink)",lineHeight:1},children:"Validation de commande"})]}),(0,a.jsxs)("div",{style:{marginLeft:"auto",display:"flex",alignItems:"center",gap:6},children:[(0,a.jsx)(A.A,{size:12,style:{color:"var(--gold)"}}),(0,a.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement s\xe9curis\xe9"})]})]}),(0,a.jsxs)("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:28},className:"checkout-grid",children:[(0,a.jsx)("style",{children:"@media(min-width:1024px){.checkout-grid{grid-template-columns:1fr 400px !important;}}"}),(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:20},children:[(0,a.jsxs)("div",{className:"card animate-enter delay-1",children:[(0,a.jsxs)("div",{className:"card-header",children:[(0,a.jsx)("div",{className:"card-header-dot"}),(0,a.jsx)(j.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,a.jsx)("span",{className:"card-header-title",children:"Adresse de livraison"})]}),(0,a.jsxs)("div",{className:"card-body",children:[!K&&(0,a.jsxs)("button",{className:"location-btn",onClick:H,children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:14},children:[(0,a.jsx)("div",{className:"icon-circle",children:(0,a.jsx)(z.A,{size:16})}),(0,a.jsxs)("div",{style:{textAlign:"left"},children:[(0,a.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:"Utiliser ma position GPS"}),V?(0,a.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"D\xe9tection en cours…"}):v?.city?(0,a.jsxs)("p",{style:{fontSize:12,color:"var(--gold)"},children:[v.city,v.region?`, ${v.region}`:""]}):(0,a.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"Cliquez pour d\xe9tecter automatiquement"})]})]}),(0,a.jsx)(N.A,{size:16,style:{color:"var(--gold)",flexShrink:0}})]}),K?.address?(0,a.jsxs)("div",{style:{marginTop:12,padding:"12px 16px",background:"rgba(16,185,129,.08)",borderRadius:10,border:"1px solid rgba(16,185,129,.3)",display:"flex",alignItems:"center",gap:8},children:[(0,a.jsx)(C.A,{size:14,style:{color:"#059669",flexShrink:0}}),(0,a.jsxs)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:[K.address," ",(0,a.jsx)("span",{style:{color:"#059669",fontWeight:600},children:"(position corrig\xe9e)"}),(0,a.jsx)("br",{}),(0,a.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)"},children:"\uD83D\uDCCD GPS d\xe9sactiv\xe9 — cette adresse sera utilis\xe9e telle quelle"})]})]}):v?.address&&(0,a.jsxs)("div",{style:{marginTop:12,padding:"12px 16px",background:"var(--ivory)",borderRadius:10,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8},children:[(0,a.jsx)(C.A,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,a.jsx)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:v.address})]}),v?.isDefault&&!V&&!K&&(0,a.jsxs)("div",{style:{marginTop:12,padding:"12px 16px",background:"rgba(217,119,6,.08)",borderRadius:10,border:"1px solid rgba(217,119,6,.25)"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"flex-start",gap:8},children:[(0,a.jsx)(F.A,{size:14,style:{color:"#b45309",flexShrink:0,marginTop:1}}),(0,a.jsx)("span",{style:{fontSize:12,color:"#b45309",lineHeight:1.4},children:"Position approximative — le livreur pourrait ne pas trouver l'adresse exacte. R\xe9essayez la d\xe9tection GPS, ou placez vous-m\xeame le point sur la carte ci-dessous."})]}),(0,a.jsx)("button",{type:"button",onClick:()=>Y(e=>!e),style:{marginTop:10,fontSize:12,fontWeight:600,color:"#b45309",background:"rgba(217,119,6,.12)",border:"1px solid rgba(217,119,6,.35)",borderRadius:8,padding:"7px 12px",cursor:"pointer"},children:Q?"Masquer la carte":"\uD83D\uDCCD Corriger ma position sur la carte"})]}),!V&&!K&&!v?.isDefault&&(v?.lat||et)&&(0,a.jsx)("button",{type:"button",onClick:()=>Y(e=>!e),style:{marginTop:10,fontSize:12,fontWeight:600,color:"var(--gold-dk, #b8935a)",background:"rgba(201,169,110,.12)",border:"1px solid rgba(201,169,110,.35)",borderRadius:8,padding:"7px 12px",cursor:"pointer"},children:Q?"Masquer la carte":"\uD83D\uDCCD Livrer \xe0 une autre adresse"}),Q&&et&&!K&&(0,a.jsxs)("div",{style:{marginTop:12},children:[(0,a.jsxs)("div",{style:{position:"relative",marginBottom:10},children:[(0,a.jsx)("input",{type:"text",value:ea,onChange:e=>ei(e.target.value),placeholder:"Rechercher un lieu (ex : Ecobank UCAD, March\xe9 Sandaga…)",style:{width:"100%",fontSize:13,padding:"9px 12px",borderRadius:8,border:"1px solid var(--border)",outline:"none"}}),es&&(0,a.jsx)("div",{style:{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",width:14,height:14,border:"2px solid #10b981",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}),en.length>0&&(0,a.jsx)("div",{style:{marginTop:4,background:"#fff",border:"1px solid var(--border)",borderRadius:8,overflow:"hidden",boxShadow:"0 4px 14px rgba(0,0,0,.08)"},children:en.map((e,t)=>(0,a.jsx)("button",{type:"button",onClick:()=>ec(e),style:{display:"block",width:"100%",textAlign:"left",padding:"9px 12px",fontSize:12,color:"var(--ink-md)",background:"none",border:"none",borderTop:t>0?"1px solid var(--border)":"none",cursor:"pointer"},children:e.displayName},t))})]}),(0,a.jsx)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginBottom:6},children:"Ou d\xe9placez directement le point sur la carte :"}),(0,a.jsx)(h.A,{lat:et.lat,lng:et.lng,onChange:(e,t)=>er({lat:e,lng:t})}),(0,a.jsx)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:6},children:"D\xe9placez le point exactement \xe0 l'endroit o\xf9 vous voulez \xeatre livr\xe9."}),(0,a.jsx)("button",{type:"button",onClick:eu,disabled:X,style:{marginTop:8,width:"100%",fontSize:13,fontWeight:600,color:"#04140d",background:"#10b981",border:"none",borderRadius:8,padding:"10px 12px",cursor:X?"default":"pointer",opacity:X?.7:1},children:X?"Confirmation…":"Confirmer cette localisation"})]}),K&&(0,a.jsx)("button",{type:"button",onClick:()=>{Z(null),Y(!0)},style:{marginTop:8,fontSize:11,color:"var(--ink-lt)",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",padding:0},children:"Modifier la position corrig\xe9e"})]})]}),(0,a.jsxs)("div",{className:"card animate-enter delay-2",children:[(0,a.jsxs)("div",{className:"card-header",children:[(0,a.jsx)("div",{className:"card-header-dot"}),(0,a.jsx)(P.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,a.jsx)("span",{className:"card-header-title",children:"Informations de contact"})]}),(0,a.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:[{icon:(0,a.jsx)(P.A,{size:15}),label:"Nom complet",value:t?.displayName||"Client AgriMarch\xe9"},{icon:(0,a.jsx)(D.A,{size:15}),label:"Adresse e-mail",value:t?.email||"Non renseign\xe9"},{icon:(0,a.jsx)(y.A,{size:15}),label:"T\xe9l\xe9phone",value:t?.phoneNumber||"\xc0 renseigner"}].map(e=>(0,a.jsxs)("div",{className:"info-row",children:[(0,a.jsx)("div",{className:"icon-circle",style:{width:34,height:34},children:e.icon}),(0,a.jsxs)("div",{children:[(0,a.jsx)("p",{className:"info-row-label",children:e.label}),(0,a.jsx)("p",{className:"info-row-value",children:e.value})]})]},e.label))})]}),(0,a.jsxs)("div",{className:"card animate-enter delay-3",children:[(0,a.jsxs)("div",{className:"card-header",children:[(0,a.jsx)("div",{className:"card-header-dot"}),(0,a.jsx)(T.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,a.jsx)("span",{className:"card-header-title",children:"Moyen de paiement"})]}),(0,a.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:Object.values(B).map(e=>(0,a.jsxs)("label",{className:`pay-option${eS===e.id?" selected":""}`,onClick:()=>ek(e.id),children:[(0,a.jsx)("input",{type:"radio",name:"paymentMethod",value:e.id,readOnly:!0,checked:eS===e.id}),(0,a.jsx)("div",{className:"pay-radio",children:(0,a.jsx)("div",{className:"pay-radio-dot"})}),(0,a.jsx)("div",{className:"icon-circle",style:{width:36,height:36},children:e.icon}),(0,a.jsxs)("div",{style:{flex:1},children:[(0,a.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e.name}),(0,a.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:e.description})]}),eS===e.id&&(0,a.jsxs)("span",{className:"tag tag-gold",children:[(0,a.jsx)(E.A,{size:10})," S\xe9lectionn\xe9"]})]},e.id))})]})]}),(0,a.jsx)("div",{style:{position:"sticky",top:24,alignSelf:"start"},className:"animate-enter delay-4",children:(0,a.jsxs)("div",{className:"card",children:[(0,a.jsxs)("div",{style:{background:"var(--ink)",padding:"20px 28px",display:"flex",alignItems:"center",gap:10},children:[(0,a.jsx)(I.A,{size:16,style:{color:"var(--gold)"}}),(0,a.jsx)("span",{className:"serif",style:{fontSize:18,fontWeight:400,color:"var(--white)",letterSpacing:"0.02em"},children:"R\xe9capitulatif"}),(0,a.jsxs)("span",{style:{marginLeft:"auto",fontSize:12,color:"rgba(255,255,255,0.4)",letterSpacing:"0.06em"},children:[eU.length," article",eU.length>1?"s":""]})]}),(0,a.jsxs)("div",{className:"card-body",children:[(0,a.jsx)("div",{style:{maxHeight:280,overflowY:"auto",marginBottom:16},children:eU.map((e,t)=>(0,a.jsxs)("div",{className:"cart-item",children:[(0,a.jsx)("div",{className:"cart-thumb",children:(0,a.jsx)(M.A,{size:18,style:{color:"#2D7A4E"}})}),(0,a.jsxs)("div",{style:{flex:1},children:[(0,a.jsx)("p",{style:{fontSize:13,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e?.product?.name}),(0,a.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)"},children:[e?.quantity," \xd7 ",(e?.product?.price||0).toLocaleString()," FCFA"]})]}),(0,a.jsxs)("p",{style:{fontSize:13,fontWeight:600,color:"var(--ink)",flexShrink:0},children:[((e?.product?.price||0)*(e?.quantity||0)).toLocaleString()," ",(0,a.jsx)("span",{style:{fontSize:10,color:"var(--ink-lt)"},children:"FCFA"})]})]},t))}),(0,a.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[(0,a.jsxs)("div",{className:"total-row",children:[(0,a.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Sous-total"}),(0,a.jsxs)("span",{style:{fontSize:13,color:"var(--ink)"},children:[eJ.toLocaleString()," FCFA"]})]}),(0,a.jsxs)("div",{className:"total-row",children:[(0,a.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Livraison"}),(0,a.jsx)("span",{style:{fontSize:13,color:eV?"#1E7A44":"var(--ink)"},children:eV?"Offerte":`${eH.toLocaleString()} FCFA`})]}),eV&&(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",background:"#F0FAF4",borderRadius:8,border:"1px solid #A8E6C0"},children:[(0,a.jsx)(S.A,{size:12,style:{color:"#1E7A44"}}),(0,a.jsx)("span",{style:{fontSize:11,color:"#1E7A44",letterSpacing:"0.04em"},children:"Livraison offerte d\xe8s 5 000 FCFA"})]}),(0,a.jsxs)("div",{className:"total-row grand",children:[(0,a.jsx)("span",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",letterSpacing:"0.04em"},children:"Total TTC"}),(0,a.jsxs)("span",{className:"serif",style:{fontSize:24,fontWeight:500,color:"var(--ink)"},children:[eQ.toLocaleString()," ",(0,a.jsx)("span",{style:{fontSize:14,fontWeight:400},children:"FCFA"})]})]})]}),(0,a.jsxs)("div",{style:{marginTop:16,padding:"16px 18px",background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:14,border:"1.5px solid var(--gold-lt)"},children:[(0,a.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10},children:[(0,a.jsx)(L.A,{size:14,style:{color:"var(--gold)"}}),(0,a.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Paiement en 2 fois"})]}),(0,a.jsxs)("div",{className:"total-row",style:{marginBottom:6},children:[(0,a.jsx)("span",{style:{color:"var(--ink)",fontSize:13,fontWeight:500},children:"Acompte \xe0 r\xe9gler maintenant (25%)"}),(0,a.jsxs)("span",{style:{fontSize:15,color:"var(--gold)",fontWeight:700},children:[eY.toLocaleString()," FCFA"]})]}),(0,a.jsxs)("div",{className:"total-row",children:[(0,a.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:12},children:"Solde \xe0 r\xe9gler \xe0 la livraison (75%)"}),(0,a.jsxs)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:[eK.toLocaleString()," FCFA"]})]})]}),(0,a.jsxs)("div",{style:{marginTop:16,padding:"12px 16px",background:"var(--ivory)",borderRadius:12,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10},children:[(0,a.jsx)(j.A,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,a.jsxs)("div",{children:[(0,a.jsx)("p",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2},children:"Livraison estim\xe9e"}),(0,a.jsx)("p",{style:{fontSize:13,color:"var(--ink)",fontWeight:500},children:eZ})]})]}),eP&&(0,a.jsxs)("div",{className:"err-box",style:{marginTop:14},children:[(0,a.jsx)(F.A,{size:14}),eP]}),(0,a.jsx)("button",{onClick:e2,disabled:eC||0===eU.length,className:"cta-btn",style:{marginTop:20},children:eC?(0,a.jsxs)(a.Fragment,{children:[(0,a.jsx)(O.A,{size:16,style:{animation:"spin 1s linear infinite"}})," Traitement…"]}):(0,a.jsxs)(a.Fragment,{children:["Payer l'acompte \xb7 ",eY.toLocaleString()," FCFA →"]})}),(0,a.jsxs)("div",{style:{marginTop:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8},children:[(0,a.jsx)(A.A,{size:11,style:{color:"var(--ink-lt)"}}),(0,a.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement 100% s\xe9curis\xe9 \xb7 Livraison garantie"})]})]})]})})]})]})}),ew&&ez&&(0,a.jsx)("div",{className:"modal-overlay",children:(0,a.jsx)(J,{method:ez,amount:eY,remainingAmount:eK,onConfirm:e1,onBack:()=>eA(!1)})}),eI&&(0,a.jsx)("div",{className:"modal-overlay",children:(0,a.jsx)(U,{phone:eL,setPhone:eO,name:eR,setName:e$,error:eW,submitting:e_,onContinue:e4,onCancel:()=>{eM(!1),e.push("/auth/login?redirect=/checkout")}})})]})}},85978:(e,t,r)=>{"use strict";r.d(t,{y:()=>i});var a=r(77805);function i(e){let t=e.startsWith("/")?e:`/${e}`;return!function(){if(a.Ii.isNativePlatform())return!1;let e=window.location.hostname;return"localhost"===e||"127.0.0.1"===e}()?`https://agrimarche-ultra-v1.vercel.app${t}`:t}},91e3:(e,t,r)=>{"use strict";r.d(t,{J5:()=>i,l7:()=>n,nd:()=>o});var a=r(85978);async function i(e,t,{maxRetries:r=2,baseDelayMs:a=600}={}){for(let i=0;i<=r;i++)try{let n=await fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(n.ok)return{ok:!0,status:n.status};if(i<r){await new Promise(e=>setTimeout(e,a*Math.pow(2,i)));continue}return{ok:!1,status:n.status}}catch(e){if(i<r){await new Promise(e=>setTimeout(e,a*Math.pow(2,i)));continue}throw e}return{ok:!1}}async function n({userId:e,type:t,title:r,body:o,link:s,icon:l="\uD83D\uDD14",priority:d="medium",urgent:c=!1,channels:u=["push"]}){try{let n=await i((0,a.y)("/api/notifications/send"),{userId:e,title:r,body:o,link:s,channels:u,priority:d,urgent:c,type:t,icon:l});n.ok||console.warn("[notifyUser] \xc9chec envoi apr\xe8s retries (statut",n.status,")")}catch(e){console.warn("[notifyUser] Erreur r\xe9seau apr\xe8s retries:",e)}}async function o({type:e,title:t,body:r,link:n,icon:s="\uD83C\uDF3E",priority:l="medium",urgent:d=!1,excludeUserId:c}){try{let o=await i((0,a.y)("/api/broadcast"),{title:t,body:r,link:n,type:e,icon:s,priority:l,urgent:d,excludeUserId:c});o.ok||console.warn("[notifyAllUsers] \xc9chec envoi apr\xe8s retries (statut",o.status,")")}catch(e){console.warn("[notifyAllUsers] Erreur r\xe9seau apr\xe8s retries:",e)}}},94982:(e,t,r)=>{"use strict";r.d(t,{HC:()=>n,_R:()=>o,aV:()=>i});let a="agrimarche_user_location";function i(){try{let e=localStorage.getItem(a);if(!e)return null;let t=JSON.parse(e);if("number"!=typeof t?.lat||"number"!=typeof t?.lng)return null;if("number"!=typeof t.cachedAt)return{...t,cachedAt:0};return t}catch{return null}}function n(e){return!e||!!e.isDefault||Date.now()-e.cachedAt>6e5}function o(e){try{let t={...e,cachedAt:Date.now()};localStorage.setItem(a,JSON.stringify(t))}catch{}}}},e=>{e.O(0,[6047,2539,2301,8116,8500,9143,6910,4894,5390,8441,3794,7358],()=>e(e.s=66182)),_N_E=e.O()}]);