(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[8279],{7147:(e,t,r)=>{"use strict";r.d(t,{Z:()=>a});let i=new Set(["functions/unavailable","functions/deadline-exceeded","functions/internal","functions/resource-exhausted"]);async function a(e,t=3){let r;for(let a=1;a<=t;a++)try{return await e()}catch(s){r=s;let e=a===t;if(!function(e){let t=e?.code||"";return!!(i.has(t)||"u">typeof navigator&&!navigator.onLine)}(s)||e)throw s;let n=500*2**(a-1),o=250*Math.random();await function(e){return new Promise(t=>setTimeout(t,e))}(n+o)}throw r}},27155:(e,t,r)=>{"use strict";r.d(t,{DT:()=>c,J1:()=>s,Vb:()=>o,jS:()=>l});var i=r(77805);function a(e){let t=e.coords;return{coords:{latitude:t.latitude,longitude:t.longitude,accuracy:t.accuracy,altitude:t.altitude??null,altitudeAccuracy:t.altitudeAccuracy??null,heading:t.heading??null,speed:t.speed??null},timestamp:e.timestamp??Date.now()}}function n(e){let t=String(e?.message||e||"").toLowerCase();return t.includes("denied")||t.includes("permission")?{code:1,message:e?.message||"Permission refus\xe9e."}:t.includes("timeout")?{code:3,message:e?.message||"D\xe9lai d\xe9pass\xe9."}:{code:2,message:e?.message||"Position indisponible."}}async function o(){if(i.Ii.isNativePlatform()){let{Geolocation:e}=await r.e(3245).then(r.bind(r,43245)),t=await e.checkPermissions();return"granted"===t.location||"granted"===t.coarseLocation?"granted":"denied"===t.location&&"denied"===t.coarseLocation?"denied":"prompt"}if("u">typeof navigator&&"permissions"in navigator)try{return(await navigator.permissions.query({name:"geolocation"})).state}catch{}return"prompt"}function s(e){let t={enableHighAccuracy:!0,timeout:1e4,maximumAge:0,...e};return i.Ii.isNativePlatform()?r.e(3245).then(r.bind(r,43245)).then(({Geolocation:e})=>e.getCurrentPosition(t).then(a).catch(e=>{throw n(e)})):new Promise((e,r)=>{"u"<typeof navigator||!navigator.geolocation?r({code:2,message:"G\xe9olocalisation non support\xe9e par ce navigateur."}):navigator.geolocation.getCurrentPosition(t=>e(a(t)),e=>r({code:e.code,message:e.message}),t)})}async function l(e,t){let o={enableHighAccuracy:!0,timeout:15e3,...e};if(i.Ii.isNativePlatform()){let{Geolocation:e}=await r.e(3245).then(r.bind(r,43245));return e.watchPosition(o,(e,r)=>{r?t(null,n(r)):e&&t(a(e),null)})}return"u"<typeof navigator||!navigator.geolocation?(t(null,{code:2,message:"G\xe9olocalisation non support\xe9e par ce navigateur."}),-1):navigator.geolocation.watchPosition(e=>t(a(e),null),e=>t(null,{code:e.code,message:e.message}),{...o,maximumAge:0})}async function c(e){if(null!==e){if(i.Ii.isNativePlatform()){let{Geolocation:t}=await r.e(3245).then(r.bind(r,43245));await t.clearWatch({id:String(e)});return}"number"==typeof e&&"u">typeof navigator&&navigator.geolocation&&navigator.geolocation.clearWatch(e)}}},27907:(e,t,r)=>{"use strict";r.d(t,{CartProvider:()=>x,_:()=>f});var i=r(95155),a=r(12115),n=r(42623),o=r(91531),s=r(54894);let l={items:[],total:0,itemCount:0};async function c(e,t=1){try{var r,i;return await (r=(0,o.getDoc)((0,o.doc)(s.db,"carts",e)),i=`getDoc carts (essai ${t})`,Promise.race([r,new Promise((e,t)=>setTimeout(()=>t(Error(`[useCart] Timeout (8000ms) sur ${i}`)),8e3))]))}catch(r){if((r?.code==="unavailable"||/offline/i.test(r?.message??""))&&t<8){let r=Math.min(1e3*2**t,8e3);return(0,s.uP)("PANIER",`getDoc carts hors-ligne, nouvel essai dans ${r}ms... (essai ${t})`),await new Promise(e=>setTimeout(e,r)),c(e,t+1)}throw r}}let d="agrimarche_cart_guest";function p(e){let t=e.reduce((e,t)=>e+t.product.price*t.quantity,0),r=e.reduce((e,t)=>e+t.quantity,0);return{items:e,total:t,itemCount:r}}function u(e){return Array.isArray(e)?e.filter(e=>null!==e&&"object"==typeof e&&"number"==typeof e.quantity&&e.quantity>0&&null!==e.product&&"object"==typeof e.product&&"string"==typeof e.product.id&&"number"==typeof e.product.price):[]}function m(e){return JSON.parse(JSON.stringify(e))}function g(e){try{let t=localStorage.getItem(e);if(!t)return[];let r=JSON.parse(t);if(r?.items)return u(r.items);if(Array.isArray(r))return u(r);return[]}catch{try{localStorage.removeItem(e)}catch{}return[]}}let h=(0,a.createContext)(null);function x({children:e}){let{user:t,loading:r}=(0,n.A)(),f=t?.uid||"guest",y=`agrimarche_cart_${f}`,[v,b]=(0,a.useState)(l),[j,S]=(0,a.useState)(!0),k=(0,a.useRef)([]),w=(0,a.useRef)(y),A=(0,a.useRef)(f);w.current=y,A.current=f,(0,a.useEffect)(()=>{if(r)return;let e=!1;return S(!0),(0,s.uP)("PANIER",`hydratation d\xe9marr\xe9e — user=${t?.uid??"guest"}`),(async()=>{let r=g(d);if(t)try{(0,s.uP)("PANIER","attente waitForFirestoreReady() avant getDoc carts"),await (0,s.T6)();let i=await c(t.uid);(0,s.uP)("PANIER","getDoc carts r\xe9solu");let a=i.exists()?u(i.data().items):[],n=g(y);if(n.length&&n.forEach(e=>{let t=a.find(t=>t.product.id===e.product.id);t?t.quantity=Math.max(t.quantity,e.quantity):a.push(e)}),r.length){r.forEach(e=>{let t=a.find(t=>t.product.id===e.product.id);t?t.quantity=Math.min(t.quantity+e.quantity,t.product.stock||999):a.push(e)});try{localStorage.removeItem(d)}catch{}}if(e)return;if(k.current=a,b(p(a)),r.length||n.length){let e=p(a);try{localStorage.setItem(y,JSON.stringify(e))}catch{}(0,o.BN)((0,o.doc)(s.db,"carts",t.uid),m(e),{merge:!0}).catch(console.error)}}catch(r){console.error(r),(0,s.uP)("PANIER","\xc9CHEC getDoc carts — repli sur le panier local",r?.message||r);let t=g(y);e||(k.current=t,b(p(t)))}else e||(k.current=r,b(p(r)));e||((0,s.uP)("PANIER","hydratation termin\xe9e — isLoading=false"),S(!1))})(),()=>{e=!0}},[t?.uid,r,y]);let z=(0,a.useCallback)(e=>{k.current=e;let t=p(e);b(t);try{localStorage.setItem(w.current,JSON.stringify(t))}catch{}navigator.onLine&&"guest"!==A.current&&(0,o.BN)((0,o.doc)(s.db,"carts",A.current),m(t),{merge:!0}).catch(console.error)},[]),F=(0,a.useCallback)((e,t=1)=>{let r=k.current,i=r.find(t=>t.product.id===e.id);if(0>=(e.stock||0))return;let a=e.minOrder||1;z(i?r.map(r=>r.product.id===e.id?{...r,quantity:Math.min(r.quantity+t,e.stock||0)}:r):[...r,{product:e,quantity:Math.min(Math.max(t,a),e.stock||0)}])},[z]),N=(0,a.useCallback)(e=>{z(k.current.filter(t=>t.product.id!==e))},[z]),C=(0,a.useCallback)((e,t)=>{t<=0?N(e):z(k.current.map(r=>{if(r.product.id!==e)return r;let i=Math.max(t,r.product.minOrder||1);return{...r,quantity:Math.min(i,r.product.stock||0)}}))},[z,N]),P=(0,a.useCallback)(()=>{z([])},[z]);return(0,i.jsx)(h.Provider,{value:{cart:v,isLoading:j,addToCart:F,removeFromCart:N,updateQuantity:C,clearCart:P},children:e})}function f(){let e=(0,a.useContext)(h);if(!e)throw Error("useCart() doit \xeatre utilis\xe9 \xe0 l'int\xe9rieur de <CartProvider>. V\xe9rifie que CartProvider entoure bien l'app dans app/layout.tsx.");return e}},37417:(e,t,r)=>{"use strict";r.d(t,{Ln:()=>d,X2:()=>p,Yy:()=>m,bc:()=>g,iD:()=>l,rr:()=>h,sG:()=>u});var i=r(15103),a=r(59997),n=r(54894),o=r(7147);let s=(0,i.Uz)(n.yA,"us-central1");class l extends Error{constructor(e,t){super(t),this.code=e}}function c(e){let t=e?.code||"unknown";return new l(t,{"functions/failed-precondition":e?.message||"Cette commande a chang\xe9 d'\xe9tat entre-temps.","functions/permission-denied":e?.message||"Vous n'avez pas acc\xe8s \xe0 cette commande.","functions/not-found":"Commande introuvable.","functions/unauthenticated":"Votre session a expir\xe9, reconnectez-vous.","functions/invalid-argument":e?.message||"Code incorrect.","functions/resource-exhausted":e?.message||"Trop de tentatives — r\xe9essayez plus tard."}[t]??"\uD83D\uDE0A Petit souci technique — r\xe9essayez dans un instant.")}async function d(e){try{let t=(0,i.Qg)(s,"claimOrder");await (0,o.Z)(()=>t({orderId:e}))}catch(e){throw c(e)}}async function p(e,t){try{let r=(0,i.Qg)(s,"startGuestCheckoutSession"),l=await (0,o.Z)(()=>r({phone:e,name:t}));return await (0,a.p)(n.j2,l.data.customToken),l.data.guestPhone}catch(e){throw c(e)}}async function u(e,t){try{let r=(0,i.Qg)(s,"confirmDeliveryWithCode");await r({orderId:e,code:t})}catch(e){throw c(e)}}async function m(e){try{let t=(0,i.Qg)(s,"getDeliveryCode");return(await (0,o.Z)(()=>t({orderId:e}))).data.code}catch(e){throw c(e)}}async function g(e){try{let t=(0,i.Qg)(s,"findGuestOrders");return(await t({phone:e})).data.orders}catch(e){throw c(e)}}async function h(e,t){try{let r=(0,i.Qg)(s,"claimGuestOrderSession"),o=await r({orderId:e,phone:t});await (0,a.p)(n.j2,o.data.customToken)}catch(e){throw c(e)}}},42623:(e,t,r)=>{"use strict";r.d(t,{A:()=>i.A});var i=r(95390)},66182:(e,t,r)=>{Promise.resolve().then(r.bind(r,77698))},77698:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>B});var i=r(95155),a=r(12115),n=r(98500),o=r.n(n),s=r(73321),l=r(27907),c=r(42623),d=r(27155),p=r(91531),u=r(54894),m=r(95e3),g=r(16369),h=r(34018),x=r(57983),f=r(13488),y=r(17007),v=r(65079),b=r(31966),j=r(5736),S=r(66295),k=r(76721),w=r(67033),A=r(93744),z=r(75796),F=r(71019),N=r(64577),C=r(16720),P=r(87973),D=r(95097),T=r(35484),I=r(92571);let E=async e=>{let t=(0,p.doc)(u.db,"orders",e),r={pending:{completed:!0,timestamp:new Date},preparing:{completed:!1,timestamp:null},ready:{completed:!1,timestamp:null},picked_up:{completed:!1,timestamp:null},in_transit:{completed:!1,timestamp:null},arrived:{completed:!1,timestamp:null},delivered:{completed:!1,timestamp:null}};return await (0,p.updateDoc)(t,{deliveryStatus:"pending",deliverySteps:r}),!0},M=e=>{let t=new Date(e);return t.setDate(t.getDate()+3),t};var L=r(91e3),R=r(85978),_=r(37417);let O=`
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
`,W={wave:{id:"wave",name:"Wave",description:"Paiement instantan\xe9, s\xe9curis\xe9",icon:(0,i.jsx)(m.A,{size:17}),fee:0,paymentLink:e=>"https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/",minAmount:100,maxAmount:1e6},orange_money:{id:"orange_money",name:"Orange Money",description:"Paiement mobile Orange",icon:(0,i.jsx)(m.A,{size:17}),fee:0,paymentLink:null,merchantPhone:"77 974 70 73",minAmount:100,maxAmount:1e6}};function $({phone:e,setPhone:t,name:r,setName:a,error:n,submitting:o,onContinue:s,onCancel:l}){return(0,i.jsxs)("div",{className:"modal-card",style:{maxWidth:420},children:[(0,i.jsxs)("div",{className:"modal-header",style:{padding:"24px 28px",borderBottom:"1px solid var(--border)",textAlign:"center"},children:[(0,i.jsx)("div",{style:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg, var(--gold-lt), var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},children:(0,i.jsx)(g.A,{size:24,color:"#fff"})}),(0,i.jsx)("h3",{className:"serif",style:{fontSize:20,fontWeight:600,color:"var(--ink)"},children:"Continuer sans compte"}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:6,lineHeight:1.5},children:"Juste votre num\xe9ro — vous en aurez besoin pour retrouver votre commande et votre code de livraison."})]}),(0,i.jsxs)("div",{style:{padding:"24px 28px"},children:[(0,i.jsx)("input",{type:"tel",inputMode:"tel",value:e,onChange:e=>t(e.target.value),placeholder:"Ex. 77 123 45 67",autoFocus:!0,style:{width:"100%",padding:"13px 16px",borderRadius:10,border:"1px solid var(--border)",fontSize:14,marginBottom:10}}),(0,i.jsx)("input",{type:"text",value:r,onChange:e=>a(e.target.value),placeholder:"Votre nom (optionnel)",style:{width:"100%",padding:"13px 16px",borderRadius:10,border:"1px solid var(--border)",fontSize:14,marginBottom:4}}),n&&(0,i.jsx)("p",{style:{color:"#dc2626",fontSize:12.5,marginTop:8,lineHeight:1.4},children:n}),(0,i.jsx)("button",{onClick:s,disabled:o,className:"cta-btn",style:{marginTop:18,width:"100%"},children:o?"Un instant…":"Continuer"}),(0,i.jsx)("button",{onClick:l,style:{marginTop:10,width:"100%",background:"none",border:"none",color:"var(--ink-lt)",fontSize:12.5,cursor:"pointer"},children:"J'ai d\xe9j\xe0 un compte — me connecter"})]})]})}function q({method:e,amount:t,remainingAmount:r,onConfirm:n,onBack:o}){let s=e.paymentLink?e.paymentLink(t):null;(0,a.useEffect)(()=>{"wave"===e.id&&s&&(sessionStorage.setItem("wave_pending",JSON.stringify({paymentMethod:"wave",ts:Date.now()})),window.location.href=s)},[]);let l=()=>{n()};return(0,i.jsxs)("div",{className:"modal-card",style:{maxWidth:460},children:[(0,i.jsxs)("div",{className:"modal-header",style:{padding:"24px 28px",borderBottom:"1px solid var(--border)",textAlign:"center"},children:[(0,i.jsx)("div",{style:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg, var(--gold-lt), var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},children:e.icon}),(0,i.jsxs)("h3",{className:"serif",style:{fontSize:22,fontWeight:400,color:"var(--ink)"},children:["Acompte ",e.name]}),(0,i.jsxs)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:6},children:["Acompte (25%) : ",(0,i.jsxs)("strong",{children:[t.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:4},children:["Solde \xe0 r\xe9gler \xe0 la livraison : ",r.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("div",{style:{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,textAlign:"center"},children:["wave"===e.id?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px",textAlign:"center"},children:[(0,i.jsx)("p",{style:{fontSize:14,color:"var(--ink)",marginBottom:12},children:"Vous allez \xeatre redirig\xe9 vers Wave pour effectuer le paiement de l'acompte (25%)."}),(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:16},children:[(0,i.jsx)(h.A,{size:16,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)"},children:"Paiement s\xe9curis\xe9"})]})]}),(0,i.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,i.jsx)(x.A,{size:16}),"J'ai pay\xe9 l'acompte, confirmer ma commande"]})]}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px"},children:[(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-md)",marginBottom:12},children:"Envoyez l'acompte (25%) \xe0 :"}),(0,i.jsxs)("div",{style:{fontSize:20,fontWeight:700,color:"var(--gold)",letterSpacing:"0.08em",marginBottom:8},children:["+221 ",e.merchantPhone]}),(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"via Orange Money"}),(0,i.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:10},children:["Solde de ",r.toLocaleString()," FCFA \xe0 r\xe9gler \xe0 la livraison"]})]}),(0,i.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,i.jsx)(x.A,{size:16}),"J'ai pay\xe9 l'acompte, confirmer ma commande"]})]}),(0,i.jsx)("button",{onClick:o,style:{fontSize:11,color:"var(--ink-lt)",background:"none",border:"none",cursor:"pointer",marginTop:8},children:"← Annuler"})]})]})}function B(){let e=(0,s.useRouter)(),{user:t,profile:r}=(0,c.A)(),{cart:n,clearCart:m}=(0,l._)(),{location:h,loading:B,detectLocation:J}=function(){let[e,t]=(0,a.useState)({city:"Chargement...",region:"",country:"",lat:0,lng:0,detected:!1,isDefault:!1}),[r,i]=(0,a.useState)(!0),[n,o]=(0,a.useState)(""),s=(0,a.useCallback)(async()=>{i(!0),o("");try{try{let{latitude:e,longitude:r}=(await (0,d.J1)({enableHighAccuracy:!0,timeout:1e4})).coords;try{let a=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e}&lon=${r}&addressdetails=1&accept-language=fr&zoom=18`);if(!a.ok)throw Error("Erreur API");let n=await a.json(),o=n.address?.city||n.address?.town||n.address?.village||"Dakar",s=n.address?.state||n.address?.region||o,l=n.address?.country||"S\xe9n\xe9gal",c={city:o,region:s,country:l,lat:e,lng:r,detected:!0,address:`${o}, ${s}`,isDefault:!1};return console.log(`📍 Localisation GPS : ${o}`),t(c),localStorage.setItem("user_location",JSON.stringify(c)),i(!1),c}catch(n){console.error("Erreur reverse geocoding:",n);let a={city:"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:e,lng:r,detected:!0,isDefault:!0};return o("\uD83D\uDCCD Position approximative - activez la localisation pour plus de pr\xe9cision"),t(a),i(!1),a}}catch(a){console.warn("GPS indisponible, repli sur la g\xe9olocalisation IP:",a);try{let e=await fetch("https://ipapi.co/json/");if(e.ok){let r=await e.json();if(r.latitude&&r.longitude){let e=r.city||"Dakar",a=r.region||e,n=r.country_name||"S\xe9n\xe9gal",s={city:e,region:a,country:n,lat:r.latitude,lng:r.longitude,detected:!0,address:`${e}, ${a}`,isDefault:!0};return console.log(`📍 Localisation d\xe9tect\xe9e par IP (repli) : ${e}`),o("\uD83D\uDCCD Position approximative (IP) - activez la localisation GPS pour plus de pr\xe9cision"),t(s),localStorage.setItem("user_location",JSON.stringify(s)),i(!1),s}}}catch(e){console.error("Erreur g\xe9olocalisation IP:",e)}let e=a?.code===1,r={city:e?"\uD83D\uDCCD Ville non d\xe9tect\xe9e":"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return o(e?"\uD83D\uDCCD Activez la localisation pour une g\xe9olocalisation pr\xe9cise":"\uD83D\uDCCD Position approximative - activez la localisation pour plus de pr\xe9cision"),t(r),i(!1),r}}catch(r){console.error("Erreur d\xe9tection localisation:",r);let e={city:"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return o("\uD83D\uDCCD Position approximative - activez la localisation"),t(e),i(!1),e}},[]);return(0,a.useEffect)(()=>{let e=localStorage.getItem("user_location"),r=e?JSON.parse(e):null;r?.lat&&r?.lng?(t(r),i(!1)):s()},[s]),{location:e,loading:r,error:n,detectLocation:s}}(),[G,V]=(0,a.useState)(!1),[U,H]=(0,a.useState)(!1),[Q,Y]=(0,a.useState)(""),[Z,K]=(0,a.useState)(0),[X,ee]=(0,a.useState)(!1),[et,er]=(0,a.useState)("wave"),[ei,ea]=(0,a.useState)(!1),[en,eo]=(0,a.useState)(null),[es,el]=(0,a.useState)(!1),[ec,ed]=(0,a.useState)(""),[ep,eu]=(0,a.useState)(!1),[em,eg]=(0,a.useState)(!1),[eh,ex]=(0,a.useState)(""),[ef,ey]=(0,a.useState)(""),[ev,eb]=(0,a.useState)(!1),[ej,eS]=(0,a.useState)(""),ek=(0,a.useRef)(!1);(0,a.useEffect)(()=>{let e=sessionStorage.getItem("wave_pending");if(e)try{let t=JSON.parse(e);"wave"===t.paymentMethod&&(er("wave"),eu(!0),sessionStorage.removeItem("wave_pending"))}catch{sessionStorage.removeItem("wave_pending")}},[]);let ew=(0,a.useMemo)(()=>n?.items||[],[n]),eA=(0,a.useMemo)(()=>n?.total||0,[n]),ez=eA>=5e3,eF=(0,a.useMemo)(()=>{if(ez)return 0;if(!h?.lat||!h?.lng)return 1e3;let e=111*Math.sqrt(Math.pow(h.lat-14.7167,2)+Math.pow(h.lng+17.4677,2));return e<=10||e<=30?1e3:e<=100?1500:2e3},[h,ez]),eN=eA+eF,eC=Math.round(.25*eN*1.02),eP=eN-eC,eD=(0,a.useMemo)(()=>{if(ez)return"24 – 48 h (Express)";if(!h?.lat||!h?.lng)return"\xc0 confirmer";let e=111*Math.sqrt(Math.pow(h.lat-14.7167,2)+Math.pow(h.lng+17.4677,2));return e<=10?"24 h":e<=30?"24 – 48 h":e<=100?"48 – 72 h":"3 – 5 jours"},[h,ez]),eT=(0,a.useCallback)(()=>{let e=new Date,t=e.getFullYear(),r=String(e.getMonth()+1).padStart(2,"0"),i=String(e.getDate()).padStart(2,"0"),a=Math.floor(1e4*Math.random()).toString().padStart(4,"0");return`AGR-${t}${r}${i}-${a}`},[]),eI=async()=>{if(0===ew.length)return ed("Votre panier est vide"),!1;if(!t)return ed("Session expir\xe9e, reconnecte-toi pour continuer."),el(!1),e.push("/auth/login?redirect=/checkout"),!1;el(!0),ed("");try{let i=new Map;for(let e of ew)e?.product?.id&&i.set(e.product.id,(i.get(e.product.id)||0)+(e.quantity||1));try{await (0,p.c4)(u.db,async e=>{let t=[...i.entries()],r=t.map(([e])=>(0,p.doc)(u.db,"products",e)),a=await Promise.all(r.map(t=>e.get(t))),n=[];if(a.forEach((e,r)=>{let[,i]=t[r];if(!e.exists())return void n.push({name:"Produit indisponible",available:0});let a=e.data(),o=a?.stock;null!=o&&o<i&&n.push({name:a?.name||"Produit",available:Math.max(0,o)})}),n.length>0){let e=n.map(e=>`${e.name} (${e.available} dispo.)`).join(", ");throw Error(`STOCK_INSUFFISANT: ${e}`)}a.forEach((i,a)=>{let n=i.data()?.stock;if(null==n)return;let[,o]=t[a];e.update(r[a],{stock:n-o})})})}catch(t){let e=String(t?.message||"");return e.startsWith("STOCK_INSUFFISANT:")?ed(`Stock insuffisant pour : ${e.replace("STOCK_INSUFFISANT: ","")}. Merci de mettre \xe0 jour votre panier.`):(console.error("stock transaction:",t),ed("Impossible de v\xe9rifier le stock. Veuillez r\xe9essayer.")),el(!1),!1}for(let[e]of i)fetch((0,R.y)("/api/products/check-stock"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:e})}).catch(()=>{});let a=new Map;for(let e of ew){let r=e?.product?.sellerId||t?.uid||"agrimarche-official";a.has(r)||a.set(r,[]),a.get(r).push(e)}let n=[...a.entries()],o=n.length>1,s=eT(),l=[];for(let e=0;e<n.length;e++){let i,[a,c]=n[e],d=c[0],m=o?`${s}-${String.fromCharCode(65+e)}`:s,g=a||t?.uid||"agrimarche-official",x=d?.product?.sellerName||d?.product?.farmer||"AgriMarch\xe9",f=d?.product?.sellerPhone||"221779747073",y=d?.product?.region||"Dakar",v=14.7167,b=-17.4677,j="Dakar, S\xe9n\xe9gal";if(g&&"agrimarche-official"!==g)try{let e=await (0,p.getDoc)((0,p.doc)(u.db,"users",g));if(e.exists()){let t=e.data();v=t?.latitude||t?.lat||14.7167,b=t?.longitude||t?.lng||-17.4677,j=t?.address||t?.city||"Dakar, S\xe9n\xe9gal"}}catch{}let S=c.reduce((e,t)=>e+(t?.product?.price||0)*(t?.quantity||1),0),k=e===n.length-1;if(o)if(k)i=eF-l.reduce((e,t)=>e+t.deliveryFee,0);else{let e=eA>0?S/eA:1/n.length;i=Math.round(eF*e)}else i=eF;let w=S+i,A=Math.round(.25*w*1.02),z=w-A,F=W[et],N={sellerId:g,sellerName:x,sellerPhone:f,sellerRegion:y,userId:t.uid,userName:t?.displayName||ef||"Client AgriMarch\xe9",userEmail:t?.email||"",userPhone:r?.phone||eh||t?.phoneNumber||"",...r?.isGuest||eh&&!r?{guestPhone:eh.replace(/[^\d+]/g,"")}:{},sellerLocation:{lat:v,lng:b,address:j},customerLocation:{lat:h?.lat||null,lng:h?.lng||null,address:h?.address||h?.city||"Adresse non d\xe9tect\xe9e"},date:new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),timestamp:new Date().toISOString(),status:"en_attente",statusLabel:"En attente de validation - Acompte \xe0 v\xe9rifier",orderGroupId:s,isMultiVendorGroup:o,subtotal:S,deliveryFee:i,isFreeDelivery:ez,total:w,depositRate:.25,depositAmount:A,remainingAmount:z,balanceDueAtDelivery:z,paymentMethod:et,paymentMethodName:F?.name,paymentStatus:"acompte_en_attente_verification",items:c.map(e=>({productId:e?.product?.id||"unknown",productName:e?.product?.name||"Produit inconnu",productPrice:e?.product?.price||0,quantity:e?.quantity||1,unit:e?.product?.unit||"kg",total:(e?.product?.price||0)*(e?.quantity||1),image:e?.product?.images?.[0]||null,category:e?.product?.category||"Autres"})),deliveryTime:eD,createdAt:p.Timestamp.now(),updatedAt:p.Timestamp.now()},C=await (0,p.gS)((0,p.rJ)(u.db,"orders"),N);await (0,p.updateDoc)((0,p.doc)(u.db,"orders",C.id),{firestoreId:C.id,orderNumber:m,estimatedDelivery:p.Timestamp.fromDate(M(new Date))}),await E(C.id);try{await (0,p.BN)((0,p.doc)(u.db,"seller_orders",C.id),{...N,orderId:C.id,orderNumber:m,firestoreId:C.id,sellerRead:!1,sellerStatus:"nouvelle",notifiedAt:p.Timestamp.now()})}catch(e){console.error("seller_orders",e)}g&&"agrimarche-official"!==g&&(0,L.l7)({userId:g,type:"order",title:"\uD83D\uDED2 Nouvelle commande !",body:`${t?.displayName||"Un client"} vient de commander \xb7 ${w.toLocaleString("fr-FR")} FCFA`,link:"/seller/orders",priority:"high"}),l.push({docRefId:C.id,orderNumber:m,deliveryFee:i,remainingAmount:z})}if(fetch((0,R.y)("/api/system/periodic-checks"),{method:"POST"}).catch(()=>{}),m(),Y(o?s:l[0].orderNumber),K(l.reduce((e,t)=>e+t.remainingAmount,0)),ee(o),H(!0),r?.phone){let e=l.reduce((e,t)=>e+t.deliveryFee+t.remainingAmount,0),t=o?s:l[0].orderNumber;fetch((0,R.y)("/api/send-sms"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:r.phone,message:`AgriMarch\xe9 : commande #${t} confirm\xe9e. Total ${e.toLocaleString("fr-FR")} FCFA. Merci de votre confiance !`})}).catch(e=>console.warn("[checkout] SMS confirmation non envoy\xe9:",e))}return setTimeout(()=>{e.push(o?"/account/orders":"/account/orders?order="+l[0].docRefId)},3e3),!0}catch(e){return console.error(e),ed("Une erreur est survenue. Veuillez r\xe9essayer."),!1}finally{el(!1)}},eE=async()=>{ea(!1),await eI()};(0,a.useEffect)(()=>{ep&&0!==ew.length&&t&&(eu(!1),eI())},[ep,ew.length,t]);let eM=async()=>{if(!t)return void eg(!0);if(0===ew.length)return void ed("Votre panier est vide");let e=W[et];e&&(eo(e),ea(!0))};(0,a.useEffect)(()=>{if(t&&ek.current){ek.current=!1;let e=W[et];e&&(eo(e),ea(!0))}},[t,et]);let eL=async()=>{if(eh.trim().replace(/\D/g,"").length<8)return void eS("Entrez un num\xe9ro de t\xe9l\xe9phone valide.");eb(!0),eS("");try{await (0,_.X2)(eh,ef.trim()||void 0),ek.current=!0,eg(!1)}catch(e){eS(e instanceof _.iD?e.message:"Erreur de connexion, r\xe9essayez.")}finally{eb(!1)}};return es||ep?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("style",{children:O}),(0,i.jsx)("div",{className:"success-root checkout-root",children:(0,i.jsxs)("div",{className:"success-card",children:[(0,i.jsx)("div",{style:{width:60,height:60,borderRadius:"50%",border:"4px solid var(--gold)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite",margin:"0 auto 24px"}}),(0,i.jsx)("p",{className:"serif",style:{fontSize:26,fontWeight:300,color:"var(--ink)",textAlign:"center"},children:"Traitement en cours\\u2026"}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",textAlign:"center",marginTop:8},children:"Votre commande est en cours de confirmation."})]})}),(0,i.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"})]}):U?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("style",{children:O}),(0,i.jsx)("div",{className:"success-root checkout-root",children:(0,i.jsxs)("div",{className:"success-card animate-enter",children:[(0,i.jsx)("div",{className:"success-icon-ring",children:(0,i.jsx)(x.A,{size:36,style:{color:"var(--gold)"}})}),(0,i.jsxs)("p",{className:"serif",style:{fontSize:32,fontWeight:300,color:"var(--ink)",lineHeight:1.2},children:["Commande",(0,i.jsx)("br",{}),(0,i.jsx)("em",{children:"confirm\xe9e"})]}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:8},children:"Merci pour votre confiance"}),(0,i.jsx)("div",{className:"success-order-badge",children:Q}),X&&(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:-16,marginBottom:16},children:"Votre panier contenait des produits de plusieurs vendeurs — il a \xe9t\xe9 scind\xe9 en plusieurs livraisons, visibles s\xe9par\xe9ment dans \xab Mes commandes \xbb."}),(0,i.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:16,padding:"16px 20px",border:"1px solid var(--border)",textAlign:"left",marginBottom:28},children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,i.jsx)(f.A,{size:14,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Livraison estim\xe9e"})]}),(0,i.jsx)("p",{style:{fontSize:15,color:"var(--ink)",fontWeight:400},children:eD}),ez&&(0,i.jsxs)("span",{className:"tag tag-green",style:{marginTop:8},children:[(0,i.jsx)(y.A,{size:10})," Livraison offerte"]})]}),(0,i.jsxs)("div",{style:{background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:16,padding:"16px 20px",border:"1.5px solid var(--gold-lt)",textAlign:"left",marginBottom:28},children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,i.jsx)(v.A,{size:14,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Solde \xe0 r\xe9gler \xe0 la livraison"})]}),(0,i.jsxs)("p",{style:{fontSize:18,color:"var(--ink)",fontWeight:600},children:[Z.toLocaleString()," ",(0,i.jsx)("span",{style:{fontSize:13,fontWeight:400,color:"var(--ink-lt)"},children:"FCFA"})]}),(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:4},children:"Acompte de 25% d\xe9j\xe0 r\xe9gl\xe9. Le solde est \xe0 remettre au livreur."})]}),(0,i.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[(0,i.jsx)(o(),{href:"/account/orders",className:"cta-btn",style:{textDecoration:"none",borderRadius:14},children:"Mes commandes"}),(0,i.jsx)(o(),{href:"/main/products",style:{textDecoration:"none",textAlign:"center",fontSize:12,color:"var(--ink-lt)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"12px",display:"block"},children:"Continuer mes achats"})]})]})})]}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("style",{children:O}),(0,i.jsx)("div",{className:"checkout-root",children:(0,i.jsxs)("div",{style:{maxWidth:1160,margin:"0 auto",padding:"40px 20px"},children:[(0,i.jsxs)("div",{className:"animate-enter",style:{display:"flex",alignItems:"center",gap:16,marginBottom:40},children:[(0,i.jsx)("button",{onClick:()=>e.back(),style:{width:40,height:40,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--white)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--ink-md)",flexShrink:0,transition:"all 0.2s"},children:(0,i.jsx)(b.A,{size:18})}),(0,i.jsxs)("div",{children:[(0,i.jsx)("p",{style:{fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--ink-lt)",marginBottom:2},children:"AgriMarch\xe9"}),(0,i.jsx)("h1",{className:"serif",style:{fontSize:28,fontWeight:400,color:"var(--ink)",lineHeight:1},children:"Validation de commande"})]}),(0,i.jsxs)("div",{style:{marginLeft:"auto",display:"flex",alignItems:"center",gap:6},children:[(0,i.jsx)(j.A,{size:12,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement s\xe9curis\xe9"})]})]}),(0,i.jsxs)("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:28},className:"checkout-grid",children:[(0,i.jsx)("style",{children:"@media(min-width:1024px){.checkout-grid{grid-template-columns:1fr 400px !important;}}"}),(0,i.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:20},children:[(0,i.jsxs)("div",{className:"card animate-enter delay-1",children:[(0,i.jsxs)("div",{className:"card-header",children:[(0,i.jsx)("div",{className:"card-header-dot"}),(0,i.jsx)(f.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{className:"card-header-title",children:"Adresse de livraison"})]}),(0,i.jsxs)("div",{className:"card-body",children:[(0,i.jsxs)("button",{className:"location-btn",onClick:J,children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:14},children:[(0,i.jsx)("div",{className:"icon-circle",children:(0,i.jsx)(S.A,{size:16})}),(0,i.jsxs)("div",{style:{textAlign:"left"},children:[(0,i.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:"Utiliser ma position GPS"}),B?(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"D\xe9tection en cours…"}):h?.city?(0,i.jsxs)("p",{style:{fontSize:12,color:"var(--gold)"},children:[h.city,h.region?`, ${h.region}`:""]}):(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"Cliquez pour d\xe9tecter automatiquement"})]})]}),(0,i.jsx)(k.A,{size:16,style:{color:"var(--gold)",flexShrink:0}})]}),h?.address&&(0,i.jsxs)("div",{style:{marginTop:12,padding:"12px 16px",background:"var(--ivory)",borderRadius:10,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8},children:[(0,i.jsx)(w.A,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,i.jsx)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:h.address})]})]})]}),(0,i.jsxs)("div",{className:"card animate-enter delay-2",children:[(0,i.jsxs)("div",{className:"card-header",children:[(0,i.jsx)("div",{className:"card-header-dot"}),(0,i.jsx)(A.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{className:"card-header-title",children:"Informations de contact"})]}),(0,i.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:[{icon:(0,i.jsx)(A.A,{size:15}),label:"Nom complet",value:t?.displayName||"Client AgriMarch\xe9"},{icon:(0,i.jsx)(z.A,{size:15}),label:"Adresse e-mail",value:t?.email||"Non renseign\xe9"},{icon:(0,i.jsx)(g.A,{size:15}),label:"T\xe9l\xe9phone",value:t?.phoneNumber||"\xc0 renseigner"}].map(e=>(0,i.jsxs)("div",{className:"info-row",children:[(0,i.jsx)("div",{className:"icon-circle",style:{width:34,height:34},children:e.icon}),(0,i.jsxs)("div",{children:[(0,i.jsx)("p",{className:"info-row-label",children:e.label}),(0,i.jsx)("p",{className:"info-row-value",children:e.value})]})]},e.label))})]}),(0,i.jsxs)("div",{className:"card animate-enter delay-3",children:[(0,i.jsxs)("div",{className:"card-header",children:[(0,i.jsx)("div",{className:"card-header-dot"}),(0,i.jsx)(F.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{className:"card-header-title",children:"Moyen de paiement"})]}),(0,i.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:Object.values(W).map(e=>(0,i.jsxs)("label",{className:`pay-option${et===e.id?" selected":""}`,onClick:()=>er(e.id),children:[(0,i.jsx)("input",{type:"radio",name:"paymentMethod",value:e.id,readOnly:!0,checked:et===e.id}),(0,i.jsx)("div",{className:"pay-radio",children:(0,i.jsx)("div",{className:"pay-radio-dot"})}),(0,i.jsx)("div",{className:"icon-circle",style:{width:36,height:36},children:e.icon}),(0,i.jsxs)("div",{style:{flex:1},children:[(0,i.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e.name}),(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:e.description})]}),et===e.id&&(0,i.jsxs)("span",{className:"tag tag-gold",children:[(0,i.jsx)(N.A,{size:10})," S\xe9lectionn\xe9"]})]},e.id))})]})]}),(0,i.jsx)("div",{style:{position:"sticky",top:24,alignSelf:"start"},className:"animate-enter delay-4",children:(0,i.jsxs)("div",{className:"card",children:[(0,i.jsxs)("div",{style:{background:"var(--ink)",padding:"20px 28px",display:"flex",alignItems:"center",gap:10},children:[(0,i.jsx)(C.A,{size:16,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{className:"serif",style:{fontSize:18,fontWeight:400,color:"var(--white)",letterSpacing:"0.02em"},children:"R\xe9capitulatif"}),(0,i.jsxs)("span",{style:{marginLeft:"auto",fontSize:12,color:"rgba(255,255,255,0.4)",letterSpacing:"0.06em"},children:[ew.length," article",ew.length>1?"s":""]})]}),(0,i.jsxs)("div",{className:"card-body",children:[(0,i.jsx)("div",{style:{maxHeight:280,overflowY:"auto",marginBottom:16},children:ew.map((e,t)=>(0,i.jsxs)("div",{className:"cart-item",children:[(0,i.jsx)("div",{className:"cart-thumb",children:(0,i.jsx)(P.A,{size:18,style:{color:"#2D7A4E"}})}),(0,i.jsxs)("div",{style:{flex:1},children:[(0,i.jsx)("p",{style:{fontSize:13,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e?.product?.name}),(0,i.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)"},children:[e?.quantity," \xd7 ",(e?.product?.price||0).toLocaleString()," FCFA"]})]}),(0,i.jsxs)("p",{style:{fontSize:13,fontWeight:600,color:"var(--ink)",flexShrink:0},children:[((e?.product?.price||0)*(e?.quantity||0)).toLocaleString()," ",(0,i.jsx)("span",{style:{fontSize:10,color:"var(--ink-lt)"},children:"FCFA"})]})]},t))}),(0,i.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[(0,i.jsxs)("div",{className:"total-row",children:[(0,i.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Sous-total"}),(0,i.jsxs)("span",{style:{fontSize:13,color:"var(--ink)"},children:[eA.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("div",{className:"total-row",children:[(0,i.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Livraison"}),(0,i.jsx)("span",{style:{fontSize:13,color:ez?"#1E7A44":"var(--ink)"},children:ez?"Offerte":`${eF.toLocaleString()} FCFA`})]}),ez&&(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",background:"#F0FAF4",borderRadius:8,border:"1px solid #A8E6C0"},children:[(0,i.jsx)(y.A,{size:12,style:{color:"#1E7A44"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"#1E7A44",letterSpacing:"0.04em"},children:"Livraison offerte d\xe8s 5 000 FCFA"})]}),(0,i.jsxs)("div",{className:"total-row grand",children:[(0,i.jsx)("span",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",letterSpacing:"0.04em"},children:"Total TTC"}),(0,i.jsxs)("span",{className:"serif",style:{fontSize:24,fontWeight:500,color:"var(--ink)"},children:[eN.toLocaleString()," ",(0,i.jsx)("span",{style:{fontSize:14,fontWeight:400},children:"FCFA"})]})]})]}),(0,i.jsxs)("div",{style:{marginTop:16,padding:"16px 18px",background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:14,border:"1.5px solid var(--gold-lt)"},children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10},children:[(0,i.jsx)(D.A,{size:14,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Paiement en 2 fois"})]}),(0,i.jsxs)("div",{className:"total-row",style:{marginBottom:6},children:[(0,i.jsx)("span",{style:{color:"var(--ink)",fontSize:13,fontWeight:500},children:"Acompte \xe0 r\xe9gler maintenant (25%)"}),(0,i.jsxs)("span",{style:{fontSize:15,color:"var(--gold)",fontWeight:700},children:[eC.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("div",{className:"total-row",children:[(0,i.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:12},children:"Solde \xe0 r\xe9gler \xe0 la livraison (75%)"}),(0,i.jsxs)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:[eP.toLocaleString()," FCFA"]})]})]}),(0,i.jsxs)("div",{style:{marginTop:16,padding:"12px 16px",background:"var(--ivory)",borderRadius:12,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10},children:[(0,i.jsx)(f.A,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,i.jsxs)("div",{children:[(0,i.jsx)("p",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2},children:"Livraison estim\xe9e"}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink)",fontWeight:500},children:eD})]})]}),ec&&(0,i.jsxs)("div",{className:"err-box",style:{marginTop:14},children:[(0,i.jsx)(T.A,{size:14}),ec]}),(0,i.jsx)("button",{onClick:eM,disabled:es||0===ew.length,className:"cta-btn",style:{marginTop:20},children:es?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(I.A,{size:16,style:{animation:"spin 1s linear infinite"}})," Traitement…"]}):(0,i.jsxs)(i.Fragment,{children:["Payer l'acompte \xb7 ",eC.toLocaleString()," FCFA →"]})}),(0,i.jsxs)("div",{style:{marginTop:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8},children:[(0,i.jsx)(j.A,{size:11,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement 100% s\xe9curis\xe9 \xb7 Livraison garantie"})]})]})]})})]})]})}),ei&&en&&(0,i.jsx)("div",{className:"modal-overlay",children:(0,i.jsx)(q,{method:en,amount:eC,remainingAmount:eP,onConfirm:eE,onBack:()=>ea(!1)})}),em&&(0,i.jsx)("div",{className:"modal-overlay",children:(0,i.jsx)($,{phone:eh,setPhone:ex,name:ef,setName:ey,error:ej,submitting:ev,onContinue:eL,onCancel:()=>{eg(!1),e.push("/auth/login?redirect=/checkout")}})})]})}},85978:(e,t,r)=>{"use strict";r.d(t,{y:()=>a});var i=r(77805);function a(e){let t=e.startsWith("/")?e:`/${e}`;return!function(){if(i.Ii.isNativePlatform())return!1;let e=window.location.hostname;return"localhost"===e||"127.0.0.1"===e}()?`https://agrimarche-ultra-v1.vercel.app${t}`:t}},91e3:(e,t,r)=>{"use strict";r.d(t,{J5:()=>a,l7:()=>n,nd:()=>o});var i=r(85978);async function a(e,t,{maxRetries:r=2,baseDelayMs:i=600}={}){for(let a=0;a<=r;a++)try{let n=await fetch(e,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(n.ok)return{ok:!0,status:n.status};if(a<r){await new Promise(e=>setTimeout(e,i*Math.pow(2,a)));continue}return{ok:!1,status:n.status}}catch(e){if(a<r){await new Promise(e=>setTimeout(e,i*Math.pow(2,a)));continue}throw e}return{ok:!1}}async function n({userId:e,type:t,title:r,body:o,link:s,icon:l="\uD83D\uDD14",priority:c="medium",urgent:d=!1,channels:p=["push"]}){try{let n=await a((0,i.y)("/api/notifications/send"),{userId:e,title:r,body:o,link:s,channels:p,priority:c,urgent:d,type:t,icon:l});n.ok||console.warn("[notifyUser] \xc9chec envoi apr\xe8s retries (statut",n.status,")")}catch(e){console.warn("[notifyUser] Erreur r\xe9seau apr\xe8s retries:",e)}}async function o({type:e,title:t,body:r,link:n,icon:s="\uD83C\uDF3E",priority:l="medium",urgent:c=!1,excludeUserId:d}){try{let o=await a((0,i.y)("/api/broadcast"),{title:t,body:r,link:n,type:e,icon:s,priority:l,urgent:c,excludeUserId:d});o.ok||console.warn("[notifyAllUsers] \xc9chec envoi apr\xe8s retries (statut",o.status,")")}catch(e){console.warn("[notifyAllUsers] Erreur r\xe9seau apr\xe8s retries:",e)}}}},e=>{e.O(0,[5226,5863,2301,7805,9804,8500,9143,9943,4894,5390,8441,3794,7358],()=>e(e.s=66182)),_N_E=e.O()}]);