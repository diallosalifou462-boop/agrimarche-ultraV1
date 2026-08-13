(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[8279],{27155:(e,t,r)=>{"use strict";r.d(t,{DT:()=>d,J1:()=>s,Vb:()=>n,jS:()=>l});var i=r(77805);function a(e){let t=e.coords;return{coords:{latitude:t.latitude,longitude:t.longitude,accuracy:t.accuracy,altitude:t.altitude??null,altitudeAccuracy:t.altitudeAccuracy??null,heading:t.heading??null,speed:t.speed??null},timestamp:e.timestamp??Date.now()}}function o(e){let t=String(e?.message||e||"").toLowerCase();return t.includes("denied")||t.includes("permission")?{code:1,message:e?.message||"Permission refus\xe9e."}:t.includes("timeout")?{code:3,message:e?.message||"D\xe9lai d\xe9pass\xe9."}:{code:2,message:e?.message||"Position indisponible."}}async function n(){if(i.Ii.isNativePlatform()){let{Geolocation:e}=await r.e(3245).then(r.bind(r,43245)),t=await e.checkPermissions();return"granted"===t.location||"granted"===t.coarseLocation?"granted":"denied"===t.location&&"denied"===t.coarseLocation?"denied":"prompt"}if("u">typeof navigator&&"permissions"in navigator)try{return(await navigator.permissions.query({name:"geolocation"})).state}catch{}return"prompt"}function s(e){let t={enableHighAccuracy:!0,timeout:1e4,maximumAge:0,...e};return i.Ii.isNativePlatform()?r.e(3245).then(r.bind(r,43245)).then(({Geolocation:e})=>e.getCurrentPosition(t).then(a).catch(e=>{throw o(e)})):new Promise((e,r)=>{"u"<typeof navigator||!navigator.geolocation?r({code:2,message:"G\xe9olocalisation non support\xe9e par ce navigateur."}):navigator.geolocation.getCurrentPosition(t=>e(a(t)),e=>r({code:e.code,message:e.message}),t)})}async function l(e,t){let n={enableHighAccuracy:!0,timeout:15e3,...e};if(i.Ii.isNativePlatform()){let{Geolocation:e}=await r.e(3245).then(r.bind(r,43245));return e.watchPosition(n,(e,r)=>{r?t(null,o(r)):e&&t(a(e),null)})}return"u"<typeof navigator||!navigator.geolocation?(t(null,{code:2,message:"G\xe9olocalisation non support\xe9e par ce navigateur."}),-1):navigator.geolocation.watchPosition(e=>t(a(e),null),e=>t(null,{code:e.code,message:e.message}),{...n,maximumAge:0})}async function d(e){if(null!==e){if(i.Ii.isNativePlatform()){let{Geolocation:t}=await r.e(3245).then(r.bind(r,43245));await t.clearWatch({id:String(e)});return}"number"==typeof e&&"u">typeof navigator&&navigator.geolocation&&navigator.geolocation.clearWatch(e)}}},27907:(e,t,r)=>{"use strict";r.d(t,{CartProvider:()=>x,_:()=>f});var i=r(95155),a=r(12115),o=r(42623),n=r(85303),s=r(54894);let l={items:[],total:0,itemCount:0};async function d(e,t=1){try{var r,i;return await (r=(0,n.getDoc)((0,n.doc)(s.db,"carts",e)),i=`getDoc carts (essai ${t})`,Promise.race([r,new Promise((e,t)=>setTimeout(()=>t(Error(`[useCart] Timeout (8000ms) sur ${i}`)),8e3))]))}catch(r){if((r?.code==="unavailable"||/offline/i.test(r?.message??""))&&t<8){let r=Math.min(1e3*2**t,8e3);return(0,s.uP)("PANIER",`getDoc carts hors-ligne, nouvel essai dans ${r}ms... (essai ${t})`),await new Promise(e=>setTimeout(e,r)),d(e,t+1)}throw r}}let c="agrimarche_cart_guest";function p(e){let t=e.reduce((e,t)=>e+t.product.price*t.quantity,0),r=e.reduce((e,t)=>e+t.quantity,0);return{items:e,total:t,itemCount:r}}function u(e){return Array.isArray(e)?e.filter(e=>null!==e&&"object"==typeof e&&"number"==typeof e.quantity&&e.quantity>0&&null!==e.product&&"object"==typeof e.product&&"string"==typeof e.product.id&&"number"==typeof e.product.price):[]}function g(e){return JSON.parse(JSON.stringify(e))}function m(e){try{let t=localStorage.getItem(e);if(!t)return[];let r=JSON.parse(t);if(r?.items)return u(r.items);if(Array.isArray(r))return u(r);return[]}catch{try{localStorage.removeItem(e)}catch{}return[]}}let h=(0,a.createContext)(null);function x({children:e}){let{user:t,loading:r}=(0,o.A)(),f=t?.uid||"guest",y=`agrimarche_cart_${f}`,[v,b]=(0,a.useState)(l),[j,S]=(0,a.useState)(!0),k=(0,a.useRef)([]),w=(0,a.useRef)(y),A=(0,a.useRef)(f);w.current=y,A.current=f,(0,a.useEffect)(()=>{if(r)return;let e=!1;return S(!0),(0,s.uP)("PANIER",`hydratation d\xe9marr\xe9e — user=${t?.uid??"guest"}`),(async()=>{let r=m(c);if(t)try{(0,s.uP)("PANIER","attente waitForFirestoreReady() avant getDoc carts"),await (0,s.T6)();let i=await d(t.uid);(0,s.uP)("PANIER","getDoc carts r\xe9solu");let a=i.exists()?u(i.data().items):[],o=m(y);if(o.length&&o.forEach(e=>{let t=a.find(t=>t.product.id===e.product.id);t?t.quantity=Math.max(t.quantity,e.quantity):a.push(e)}),r.length){r.forEach(e=>{let t=a.find(t=>t.product.id===e.product.id);t?t.quantity=Math.min(t.quantity+e.quantity,t.product.stock||999):a.push(e)});try{localStorage.removeItem(c)}catch{}}if(e)return;if(k.current=a,b(p(a)),r.length||o.length){let e=p(a);try{localStorage.setItem(y,JSON.stringify(e))}catch{}(0,n.BN)((0,n.doc)(s.db,"carts",t.uid),g(e),{merge:!0}).catch(console.error)}}catch(r){console.error(r),(0,s.uP)("PANIER","\xc9CHEC getDoc carts — repli sur le panier local",r?.message||r);let t=m(y);e||(k.current=t,b(p(t)))}else e||(k.current=r,b(p(r)));e||((0,s.uP)("PANIER","hydratation termin\xe9e — isLoading=false"),S(!1))})(),()=>{e=!0}},[t?.uid,r,y]);let F=(0,a.useCallback)(e=>{k.current=e;let t=p(e);b(t);try{localStorage.setItem(w.current,JSON.stringify(t))}catch{}navigator.onLine&&"guest"!==A.current&&(0,n.BN)((0,n.doc)(s.db,"carts",A.current),g(t),{merge:!0}).catch(console.error)},[]),z=(0,a.useCallback)((e,t=1)=>{let r=k.current,i=r.find(t=>t.product.id===e.id);0>=(e.stock||0)||F(i?r.map(r=>r.product.id===e.id?{...r,quantity:Math.min(r.quantity+t,e.stock||0)}:r):[...r,{product:e,quantity:Math.min(t,e.stock||0)}])},[F]),N=(0,a.useCallback)(e=>{F(k.current.filter(t=>t.product.id!==e))},[F]),C=(0,a.useCallback)((e,t)=>{t<=0?N(e):F(k.current.map(r=>r.product.id!==e?r:{...r,quantity:Math.min(t,r.product.stock||0)}))},[F,N]),D=(0,a.useCallback)(()=>{F([])},[F]);return(0,i.jsx)(h.Provider,{value:{cart:v,isLoading:j,addToCart:z,removeFromCart:N,updateQuantity:C,clearCart:D},children:e})}function f(){let e=(0,a.useContext)(h);if(!e)throw Error("useCart() doit \xeatre utilis\xe9 \xe0 l'int\xe9rieur de <CartProvider>. V\xe9rifie que CartProvider entoure bien l'app dans app/layout.tsx.");return e}},42623:(e,t,r)=>{"use strict";r.d(t,{A:()=>i.A});var i=r(79509)},66182:(e,t,r)=>{Promise.resolve().then(r.bind(r,77698))},77698:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>O});var i=r(95155),a=r(12115),o=r(98500),n=r.n(o),s=r(73321),l=r(27907),d=r(42623),c=r(27155),p=r(85303),u=r(54894),g=r(95e3),m=r(34018),h=r(57983),x=r(13488),f=r(17007),y=r(65079),v=r(31966),b=r(5736),j=r(66295),S=r(76721),k=r(67033),w=r(93744),A=r(75796),F=r(16369),z=r(71019),N=r(64577),C=r(16720),D=r(87973),P=r(95097),I=r(35484),T=r(92571);let E=async e=>{let t=(0,p.doc)(u.db,"orders",e),r={pending:{completed:!0,timestamp:new Date},preparing:{completed:!1,timestamp:null},ready:{completed:!1,timestamp:null},picked_up:{completed:!1,timestamp:null},in_transit:{completed:!1,timestamp:null},arrived:{completed:!1,timestamp:null},delivered:{completed:!1,timestamp:null}};return await (0,p.updateDoc)(t,{deliveryStatus:"pending",deliverySteps:r}),!0},M=e=>{let t=new Date(e);return t.setDate(t.getDate()+3),t};var L=r(91e3),R=r(85978);let _=`
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
`,W={wave:{id:"wave",name:"Wave",description:"Paiement instantan\xe9, s\xe9curis\xe9",icon:(0,i.jsx)(g.A,{size:17}),fee:0,paymentLink:e=>"https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/",minAmount:100,maxAmount:1e6},orange_money:{id:"orange_money",name:"Orange Money",description:"Paiement mobile Orange",icon:(0,i.jsx)(g.A,{size:17}),fee:0,paymentLink:null,merchantPhone:"77 974 70 73",minAmount:100,maxAmount:1e6}};function $({method:e,amount:t,remainingAmount:r,onConfirm:o,onBack:n}){let s=e.paymentLink?e.paymentLink(t):null;(0,a.useEffect)(()=>{"wave"===e.id&&s&&(sessionStorage.setItem("wave_pending",JSON.stringify({paymentMethod:"wave",ts:Date.now()})),window.location.href=s)},[]);let l=()=>{o()};return(0,i.jsxs)("div",{className:"modal-card",style:{maxWidth:460},children:[(0,i.jsxs)("div",{className:"modal-header",style:{padding:"24px 28px",borderBottom:"1px solid var(--border)",textAlign:"center"},children:[(0,i.jsx)("div",{style:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg, var(--gold-lt), var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},children:e.icon}),(0,i.jsxs)("h3",{className:"serif",style:{fontSize:22,fontWeight:400,color:"var(--ink)"},children:["Acompte ",e.name]}),(0,i.jsxs)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:6},children:["Acompte (25%) : ",(0,i.jsxs)("strong",{children:[t.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:4},children:["Solde \xe0 r\xe9gler \xe0 la livraison : ",r.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("div",{style:{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,textAlign:"center"},children:["wave"===e.id?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px",textAlign:"center"},children:[(0,i.jsx)("p",{style:{fontSize:14,color:"var(--ink)",marginBottom:12},children:"Vous allez \xeatre redirig\xe9 vers Wave pour effectuer le paiement de l'acompte (25%)."}),(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:16},children:[(0,i.jsx)(m.A,{size:16,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)"},children:"Paiement s\xe9curis\xe9"})]})]}),(0,i.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,i.jsx)(h.A,{size:16}),"J'ai pay\xe9 l'acompte, confirmer ma commande"]})]}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px"},children:[(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-md)",marginBottom:12},children:"Envoyez l'acompte (25%) \xe0 :"}),(0,i.jsxs)("div",{style:{fontSize:20,fontWeight:700,color:"var(--gold)",letterSpacing:"0.08em",marginBottom:8},children:["+221 ",e.merchantPhone]}),(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"via Orange Money"}),(0,i.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:10},children:["Solde de ",r.toLocaleString()," FCFA \xe0 r\xe9gler \xe0 la livraison"]})]}),(0,i.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,i.jsx)(h.A,{size:16}),"J'ai pay\xe9 l'acompte, confirmer ma commande"]})]}),(0,i.jsx)("button",{onClick:n,style:{fontSize:11,color:"var(--ink-lt)",background:"none",border:"none",cursor:"pointer",marginTop:8},children:"← Annuler"})]})]})}function O(){let e=(0,s.useRouter)(),{user:t,profile:r}=(0,d.A)(),{cart:o,clearCart:g}=(0,l._)(),{location:m,loading:O,detectLocation:q}=function(){let[e,t]=(0,a.useState)({city:"Chargement...",region:"",country:"",lat:0,lng:0,detected:!1,isDefault:!1}),[r,i]=(0,a.useState)(!0),[o,n]=(0,a.useState)(""),s=(0,a.useCallback)(async()=>{i(!0),n("");try{try{let{latitude:e,longitude:r}=(await (0,c.J1)({enableHighAccuracy:!0,timeout:1e4})).coords;try{let a=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e}&lon=${r}&addressdetails=1&accept-language=fr&zoom=18`);if(!a.ok)throw Error("Erreur API");let o=await a.json(),n=o.address?.city||o.address?.town||o.address?.village||"Dakar",s=o.address?.state||o.address?.region||n,l=o.address?.country||"S\xe9n\xe9gal",d={city:n,region:s,country:l,lat:e,lng:r,detected:!0,address:`${n}, ${s}`,isDefault:!1};return console.log(`📍 Localisation GPS : ${n}`),t(d),localStorage.setItem("user_location",JSON.stringify(d)),i(!1),d}catch(o){console.error("Erreur reverse geocoding:",o);let a={city:"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:e,lng:r,detected:!0,isDefault:!0};return n("\uD83D\uDCCD Position approximative - activez la localisation pour plus de pr\xe9cision"),t(a),i(!1),a}}catch(a){console.warn("GPS indisponible, repli sur la g\xe9olocalisation IP:",a);try{let e=await fetch("https://ipapi.co/json/");if(e.ok){let r=await e.json();if(r.latitude&&r.longitude){let e=r.city||"Dakar",a=r.region||e,o=r.country_name||"S\xe9n\xe9gal",s={city:e,region:a,country:o,lat:r.latitude,lng:r.longitude,detected:!0,address:`${e}, ${a}`,isDefault:!0};return console.log(`📍 Localisation d\xe9tect\xe9e par IP (repli) : ${e}`),n("\uD83D\uDCCD Position approximative (IP) - activez la localisation GPS pour plus de pr\xe9cision"),t(s),localStorage.setItem("user_location",JSON.stringify(s)),i(!1),s}}}catch(e){console.error("Erreur g\xe9olocalisation IP:",e)}let e=a?.code===1,r={city:e?"\uD83D\uDCCD Ville non d\xe9tect\xe9e":"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return n(e?"\uD83D\uDCCD Activez la localisation pour une g\xe9olocalisation pr\xe9cise":"\uD83D\uDCCD Position approximative - activez la localisation pour plus de pr\xe9cision"),t(r),i(!1),r}}catch(r){console.error("Erreur d\xe9tection localisation:",r);let e={city:"\uD83D\uDCCD Position approximative",region:"",country:"S\xe9n\xe9gal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return n("\uD83D\uDCCD Position approximative - activez la localisation"),t(e),i(!1),e}},[]);return(0,a.useEffect)(()=>{let e=localStorage.getItem("user_location"),r=e?JSON.parse(e):null;r?.lat&&r?.lng?(t(r),i(!1)):s()},[s]),{location:e,loading:r,error:o,detectLocation:s}}(),[B,J]=(0,a.useState)(!1),[G,V]=(0,a.useState)(!1),[H,U]=(0,a.useState)(""),[Y,Q]=(0,a.useState)(0),[K,X]=(0,a.useState)(!1),[Z,ee]=(0,a.useState)("wave"),[et,er]=(0,a.useState)(!1),[ei,ea]=(0,a.useState)(null),[eo,en]=(0,a.useState)(!1),[es,el]=(0,a.useState)(""),[ed,ec]=(0,a.useState)(!1);(0,a.useEffect)(()=>{let e=sessionStorage.getItem("wave_pending");if(e)try{let t=JSON.parse(e);"wave"===t.paymentMethod&&(ee("wave"),ec(!0),sessionStorage.removeItem("wave_pending"))}catch{sessionStorage.removeItem("wave_pending")}},[]);let ep=(0,a.useMemo)(()=>o?.items||[],[o]),eu=(0,a.useMemo)(()=>o?.total||0,[o]),eg=eu>=5e3,em=(0,a.useMemo)(()=>{if(eg)return 0;if(!m?.lat||!m?.lng)return 1e3;let e=111*Math.sqrt(Math.pow(m.lat-14.7167,2)+Math.pow(m.lng+17.4677,2));return e<=10||e<=30?1e3:e<=100?1500:2e3},[m,eg]),eh=eu+em,ex=Math.round(.25*eh*1.02),ef=eh-ex,ey=(0,a.useMemo)(()=>{if(eg)return"24 – 48 h (Express)";if(!m?.lat||!m?.lng)return"\xc0 confirmer";let e=111*Math.sqrt(Math.pow(m.lat-14.7167,2)+Math.pow(m.lng+17.4677,2));return e<=10?"24 h":e<=30?"24 – 48 h":e<=100?"48 – 72 h":"3 – 5 jours"},[m,eg]),ev=(0,a.useCallback)(()=>{let e=new Date,t=e.getFullYear(),r=String(e.getMonth()+1).padStart(2,"0"),i=String(e.getDate()).padStart(2,"0"),a=Math.floor(1e4*Math.random()).toString().padStart(4,"0");return`AGR-${t}${r}${i}-${a}`},[]),eb=async()=>{if(0===ep.length)return el("Votre panier est vide"),!1;if(!t)return el("Session expir\xe9e, reconnecte-toi pour continuer."),en(!1),e.push("/auth/login?redirect=/checkout"),!1;en(!0),el("");try{let i=new Map;for(let e of ep){let r=e?.product?.sellerId||t?.uid||"agrimarche-official";i.has(r)||i.set(r,[]),i.get(r).push(e)}let a=[...i.entries()],o=a.length>1,n=ev(),s=[];for(let e=0;e<a.length;e++){let i,[l,d]=a[e],c=d[0],g=o?`${n}-${String.fromCharCode(65+e)}`:n,h=l||t?.uid||"agrimarche-official",x=c?.product?.sellerName||"AgriMarch\xe9",f=c?.product?.sellerPhone||"221779747073",y=c?.product?.region||"Dakar, S\xe9n\xe9gal",v=14.7167,b=-17.4677,j="Dakar, S\xe9n\xe9gal";if(h&&"agrimarche-official"!==h)try{let e=await (0,p.getDoc)((0,p.doc)(u.db,"users",h));if(e.exists()){let t=e.data();v=t?.latitude||t?.lat||14.7167,b=t?.longitude||t?.lng||-17.4677,j=t?.address||t?.city||"Dakar, S\xe9n\xe9gal"}}catch{}let S=d.reduce((e,t)=>e+(t?.product?.price||0)*(t?.quantity||1),0),k=e===a.length-1;if(o)if(k)i=em-s.reduce((e,t)=>e+t.deliveryFee,0);else{let e=eu>0?S/eu:1/a.length;i=Math.round(em*e)}else i=em;let w=S+i,A=Math.round(.25*w*1.02),F=w-A,z=W[Z],N={sellerId:h,sellerName:x,sellerPhone:f,sellerRegion:y,userId:t.uid,userName:t?.displayName||"Client AgriMarch\xe9",userEmail:t?.email||"",userPhone:r?.phone||t?.phoneNumber||"",sellerLocation:{lat:v,lng:b,address:j},customerLocation:{lat:m?.lat||null,lng:m?.lng||null,address:m?.address||m?.city||"Adresse non d\xe9tect\xe9e"},date:new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),timestamp:new Date().toISOString(),status:"en_attente",statusLabel:"En attente de validation - Acompte \xe0 v\xe9rifier",orderGroupId:n,isMultiVendorGroup:o,subtotal:S,deliveryFee:i,isFreeDelivery:eg,total:w,depositRate:.25,depositAmount:A,remainingAmount:F,balanceDueAtDelivery:F,paymentMethod:Z,paymentMethodName:z?.name,paymentStatus:"acompte_en_attente_verification",items:d.map(e=>({productId:e?.product?.id||"unknown",productName:e?.product?.name||"Produit inconnu",productPrice:e?.product?.price||0,quantity:e?.quantity||1,unit:e?.product?.unit||"kg",total:(e?.product?.price||0)*(e?.quantity||1),image:e?.product?.images?.[0]||null,category:e?.product?.category||"Autres"})),deliveryTime:ey,createdAt:p.Timestamp.now(),updatedAt:p.Timestamp.now()},C=await (0,p.gS)((0,p.rJ)(u.db,"orders"),N);await (0,p.updateDoc)((0,p.doc)(u.db,"orders",C.id),{firestoreId:C.id,orderNumber:g,estimatedDelivery:p.Timestamp.fromDate(M(new Date))}),await E(C.id);try{await (0,p.BN)((0,p.doc)(u.db,"seller_orders",C.id),{...N,orderId:C.id,orderNumber:g,firestoreId:C.id,sellerRead:!1,sellerStatus:"nouvelle",notifiedAt:p.Timestamp.now()})}catch(e){console.error("seller_orders",e)}for(let e of(h&&"agrimarche-official"!==h&&(0,L.l)({userId:h,type:"order",title:"\uD83D\uDED2 Nouvelle commande !",body:`${t?.displayName||"Un client"} vient de commander \xb7 ${w.toLocaleString("fr-FR")} FCFA`,link:"/seller/orders",priority:"high"}),d))if(e?.product?.id){try{await (0,p.updateDoc)((0,p.doc)(u.db,"products",e.product.id),{stock:(0,p.GV)(-(e.quantity||1))})}catch{}fetch((0,R.y)("/api/products/check-stock"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({productId:e.product.id})}).catch(()=>{})}s.push({docRefId:C.id,orderNumber:g,deliveryFee:i,remainingAmount:F})}if(fetch((0,R.y)("/api/system/periodic-checks"),{method:"POST"}).catch(()=>{}),g(),U(o?n:s[0].orderNumber),Q(s.reduce((e,t)=>e+t.remainingAmount,0)),X(o),V(!0),r?.phone){let e=s.reduce((e,t)=>e+t.deliveryFee+t.remainingAmount,0),t=o?n:s[0].orderNumber;fetch((0,R.y)("/api/send-sms"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:r.phone,message:`AgriMarch\xe9 : commande #${t} confirm\xe9e. Total ${e.toLocaleString("fr-FR")} FCFA. Merci de votre confiance !`})}).catch(e=>console.warn("[checkout] SMS confirmation non envoy\xe9:",e))}return setTimeout(()=>{e.push(o?"/account/orders":"/account/orders?order="+s[0].docRefId)},3e3),!0}catch(e){return console.error(e),el("Une erreur est survenue. Veuillez r\xe9essayer."),!1}finally{en(!1)}},ej=async()=>{er(!1),await eb()};(0,a.useEffect)(()=>{ed&&0!==ep.length&&t&&(ec(!1),eb())},[ed,ep.length,t]);let eS=async()=>{if(!t)return void e.push("/auth/login?redirect=/checkout");if(0===ep.length)return void el("Votre panier est vide");let r=W[Z];r&&(ea(r),er(!0))};return eo||ed?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("style",{children:_}),(0,i.jsx)("div",{className:"success-root checkout-root",children:(0,i.jsxs)("div",{className:"success-card",children:[(0,i.jsx)("div",{style:{width:60,height:60,borderRadius:"50%",border:"4px solid var(--gold)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite",margin:"0 auto 24px"}}),(0,i.jsx)("p",{className:"serif",style:{fontSize:26,fontWeight:300,color:"var(--ink)",textAlign:"center"},children:"Traitement en cours\\u2026"}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",textAlign:"center",marginTop:8},children:"Votre commande est en cours de confirmation."})]})}),(0,i.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"})]}):G?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("style",{children:_}),(0,i.jsx)("div",{className:"success-root checkout-root",children:(0,i.jsxs)("div",{className:"success-card animate-enter",children:[(0,i.jsx)("div",{className:"success-icon-ring",children:(0,i.jsx)(h.A,{size:36,style:{color:"var(--gold)"}})}),(0,i.jsxs)("p",{className:"serif",style:{fontSize:32,fontWeight:300,color:"var(--ink)",lineHeight:1.2},children:["Commande",(0,i.jsx)("br",{}),(0,i.jsx)("em",{children:"confirm\xe9e"})]}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:8},children:"Merci pour votre confiance"}),(0,i.jsx)("div",{className:"success-order-badge",children:H}),K&&(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:-16,marginBottom:16},children:"Votre panier contenait des produits de plusieurs vendeurs — il a \xe9t\xe9 scind\xe9 en plusieurs livraisons, visibles s\xe9par\xe9ment dans \xab Mes commandes \xbb."}),(0,i.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:16,padding:"16px 20px",border:"1px solid var(--border)",textAlign:"left",marginBottom:28},children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,i.jsx)(x.A,{size:14,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Livraison estim\xe9e"})]}),(0,i.jsx)("p",{style:{fontSize:15,color:"var(--ink)",fontWeight:400},children:ey}),eg&&(0,i.jsxs)("span",{className:"tag tag-green",style:{marginTop:8},children:[(0,i.jsx)(f.A,{size:10})," Livraison offerte"]})]}),(0,i.jsxs)("div",{style:{background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:16,padding:"16px 20px",border:"1.5px solid var(--gold-lt)",textAlign:"left",marginBottom:28},children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,i.jsx)(y.A,{size:14,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Solde \xe0 r\xe9gler \xe0 la livraison"})]}),(0,i.jsxs)("p",{style:{fontSize:18,color:"var(--ink)",fontWeight:600},children:[Y.toLocaleString()," ",(0,i.jsx)("span",{style:{fontSize:13,fontWeight:400,color:"var(--ink-lt)"},children:"FCFA"})]}),(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:4},children:"Acompte de 25% d\xe9j\xe0 r\xe9gl\xe9. Le solde est \xe0 remettre au livreur."})]}),(0,i.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[(0,i.jsx)(n(),{href:"/account/orders",className:"cta-btn",style:{textDecoration:"none",borderRadius:14},children:"Mes commandes"}),(0,i.jsx)(n(),{href:"/main/products",style:{textDecoration:"none",textAlign:"center",fontSize:12,color:"var(--ink-lt)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"12px",display:"block"},children:"Continuer mes achats"})]})]})})]}):(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)("style",{children:_}),(0,i.jsx)("div",{className:"checkout-root",children:(0,i.jsxs)("div",{style:{maxWidth:1160,margin:"0 auto",padding:"40px 20px"},children:[(0,i.jsxs)("div",{className:"animate-enter",style:{display:"flex",alignItems:"center",gap:16,marginBottom:40},children:[(0,i.jsx)("button",{onClick:()=>e.back(),style:{width:40,height:40,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--white)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--ink-md)",flexShrink:0,transition:"all 0.2s"},children:(0,i.jsx)(v.A,{size:18})}),(0,i.jsxs)("div",{children:[(0,i.jsx)("p",{style:{fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--ink-lt)",marginBottom:2},children:"AgriMarch\xe9"}),(0,i.jsx)("h1",{className:"serif",style:{fontSize:28,fontWeight:400,color:"var(--ink)",lineHeight:1},children:"Validation de commande"})]}),(0,i.jsxs)("div",{style:{marginLeft:"auto",display:"flex",alignItems:"center",gap:6},children:[(0,i.jsx)(b.A,{size:12,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement s\xe9curis\xe9"})]})]}),(0,i.jsxs)("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:28},className:"checkout-grid",children:[(0,i.jsx)("style",{children:"@media(min-width:1024px){.checkout-grid{grid-template-columns:1fr 400px !important;}}"}),(0,i.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:20},children:[(0,i.jsxs)("div",{className:"card animate-enter delay-1",children:[(0,i.jsxs)("div",{className:"card-header",children:[(0,i.jsx)("div",{className:"card-header-dot"}),(0,i.jsx)(x.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{className:"card-header-title",children:"Adresse de livraison"})]}),(0,i.jsxs)("div",{className:"card-body",children:[(0,i.jsxs)("button",{className:"location-btn",onClick:q,children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:14},children:[(0,i.jsx)("div",{className:"icon-circle",children:(0,i.jsx)(j.A,{size:16})}),(0,i.jsxs)("div",{style:{textAlign:"left"},children:[(0,i.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:"Utiliser ma position GPS"}),O?(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"D\xe9tection en cours…"}):m?.city?(0,i.jsxs)("p",{style:{fontSize:12,color:"var(--gold)"},children:[m.city,m.region?`, ${m.region}`:""]}):(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"Cliquez pour d\xe9tecter automatiquement"})]})]}),(0,i.jsx)(S.A,{size:16,style:{color:"var(--gold)",flexShrink:0}})]}),m?.address&&(0,i.jsxs)("div",{style:{marginTop:12,padding:"12px 16px",background:"var(--ivory)",borderRadius:10,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8},children:[(0,i.jsx)(k.A,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,i.jsx)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:m.address})]})]})]}),(0,i.jsxs)("div",{className:"card animate-enter delay-2",children:[(0,i.jsxs)("div",{className:"card-header",children:[(0,i.jsx)("div",{className:"card-header-dot"}),(0,i.jsx)(w.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{className:"card-header-title",children:"Informations de contact"})]}),(0,i.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:[{icon:(0,i.jsx)(w.A,{size:15}),label:"Nom complet",value:t?.displayName||"Client AgriMarch\xe9"},{icon:(0,i.jsx)(A.A,{size:15}),label:"Adresse e-mail",value:t?.email||"Non renseign\xe9"},{icon:(0,i.jsx)(F.A,{size:15}),label:"T\xe9l\xe9phone",value:t?.phoneNumber||"\xc0 renseigner"}].map(e=>(0,i.jsxs)("div",{className:"info-row",children:[(0,i.jsx)("div",{className:"icon-circle",style:{width:34,height:34},children:e.icon}),(0,i.jsxs)("div",{children:[(0,i.jsx)("p",{className:"info-row-label",children:e.label}),(0,i.jsx)("p",{className:"info-row-value",children:e.value})]})]},e.label))})]}),(0,i.jsxs)("div",{className:"card animate-enter delay-3",children:[(0,i.jsxs)("div",{className:"card-header",children:[(0,i.jsx)("div",{className:"card-header-dot"}),(0,i.jsx)(z.A,{size:14,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{className:"card-header-title",children:"Moyen de paiement"})]}),(0,i.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:Object.values(W).map(e=>(0,i.jsxs)("label",{className:`pay-option${Z===e.id?" selected":""}`,onClick:()=>ee(e.id),children:[(0,i.jsx)("input",{type:"radio",name:"paymentMethod",value:e.id,readOnly:!0,checked:Z===e.id}),(0,i.jsx)("div",{className:"pay-radio",children:(0,i.jsx)("div",{className:"pay-radio-dot"})}),(0,i.jsx)("div",{className:"icon-circle",style:{width:36,height:36},children:e.icon}),(0,i.jsxs)("div",{style:{flex:1},children:[(0,i.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e.name}),(0,i.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:e.description})]}),Z===e.id&&(0,i.jsxs)("span",{className:"tag tag-gold",children:[(0,i.jsx)(N.A,{size:10})," S\xe9lectionn\xe9"]})]},e.id))})]})]}),(0,i.jsx)("div",{style:{position:"sticky",top:24,alignSelf:"start"},className:"animate-enter delay-4",children:(0,i.jsxs)("div",{className:"card",children:[(0,i.jsxs)("div",{style:{background:"var(--ink)",padding:"20px 28px",display:"flex",alignItems:"center",gap:10},children:[(0,i.jsx)(C.A,{size:16,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{className:"serif",style:{fontSize:18,fontWeight:400,color:"var(--white)",letterSpacing:"0.02em"},children:"R\xe9capitulatif"}),(0,i.jsxs)("span",{style:{marginLeft:"auto",fontSize:12,color:"rgba(255,255,255,0.4)",letterSpacing:"0.06em"},children:[ep.length," article",ep.length>1?"s":""]})]}),(0,i.jsxs)("div",{className:"card-body",children:[(0,i.jsx)("div",{style:{maxHeight:280,overflowY:"auto",marginBottom:16},children:ep.map((e,t)=>(0,i.jsxs)("div",{className:"cart-item",children:[(0,i.jsx)("div",{className:"cart-thumb",children:(0,i.jsx)(D.A,{size:18,style:{color:"#2D7A4E"}})}),(0,i.jsxs)("div",{style:{flex:1},children:[(0,i.jsx)("p",{style:{fontSize:13,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e?.product?.name}),(0,i.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)"},children:[e?.quantity," \xd7 ",(e?.product?.price||0).toLocaleString()," FCFA"]})]}),(0,i.jsxs)("p",{style:{fontSize:13,fontWeight:600,color:"var(--ink)",flexShrink:0},children:[((e?.product?.price||0)*(e?.quantity||0)).toLocaleString()," ",(0,i.jsx)("span",{style:{fontSize:10,color:"var(--ink-lt)"},children:"FCFA"})]})]},t))}),(0,i.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[(0,i.jsxs)("div",{className:"total-row",children:[(0,i.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Sous-total"}),(0,i.jsxs)("span",{style:{fontSize:13,color:"var(--ink)"},children:[eu.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("div",{className:"total-row",children:[(0,i.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Livraison"}),(0,i.jsx)("span",{style:{fontSize:13,color:eg?"#1E7A44":"var(--ink)"},children:eg?"Offerte":`${em.toLocaleString()} FCFA`})]}),eg&&(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",background:"#F0FAF4",borderRadius:8,border:"1px solid #A8E6C0"},children:[(0,i.jsx)(f.A,{size:12,style:{color:"#1E7A44"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"#1E7A44",letterSpacing:"0.04em"},children:"Livraison offerte d\xe8s 5 000 FCFA"})]}),(0,i.jsxs)("div",{className:"total-row grand",children:[(0,i.jsx)("span",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",letterSpacing:"0.04em"},children:"Total TTC"}),(0,i.jsxs)("span",{className:"serif",style:{fontSize:24,fontWeight:500,color:"var(--ink)"},children:[eh.toLocaleString()," ",(0,i.jsx)("span",{style:{fontSize:14,fontWeight:400},children:"FCFA"})]})]})]}),(0,i.jsxs)("div",{style:{marginTop:16,padding:"16px 18px",background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:14,border:"1.5px solid var(--gold-lt)"},children:[(0,i.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10},children:[(0,i.jsx)(P.A,{size:14,style:{color:"var(--gold)"}}),(0,i.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Paiement en 2 fois"})]}),(0,i.jsxs)("div",{className:"total-row",style:{marginBottom:6},children:[(0,i.jsx)("span",{style:{color:"var(--ink)",fontSize:13,fontWeight:500},children:"Acompte \xe0 r\xe9gler maintenant (25%)"}),(0,i.jsxs)("span",{style:{fontSize:15,color:"var(--gold)",fontWeight:700},children:[ex.toLocaleString()," FCFA"]})]}),(0,i.jsxs)("div",{className:"total-row",children:[(0,i.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:12},children:"Solde \xe0 r\xe9gler \xe0 la livraison (75%)"}),(0,i.jsxs)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:[ef.toLocaleString()," FCFA"]})]})]}),(0,i.jsxs)("div",{style:{marginTop:16,padding:"12px 16px",background:"var(--ivory)",borderRadius:12,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10},children:[(0,i.jsx)(x.A,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,i.jsxs)("div",{children:[(0,i.jsx)("p",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2},children:"Livraison estim\xe9e"}),(0,i.jsx)("p",{style:{fontSize:13,color:"var(--ink)",fontWeight:500},children:ey})]})]}),es&&(0,i.jsxs)("div",{className:"err-box",style:{marginTop:14},children:[(0,i.jsx)(I.A,{size:14}),es]}),(0,i.jsx)("button",{onClick:eS,disabled:eo||0===ep.length,className:"cta-btn",style:{marginTop:20},children:eo?(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(T.A,{size:16,style:{animation:"spin 1s linear infinite"}})," Traitement…"]}):(0,i.jsxs)(i.Fragment,{children:["Payer l'acompte \xb7 ",ex.toLocaleString()," FCFA →"]})}),(0,i.jsxs)("div",{style:{marginTop:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8},children:[(0,i.jsx)(b.A,{size:11,style:{color:"var(--ink-lt)"}}),(0,i.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement 100% s\xe9curis\xe9 \xb7 Livraison garantie"})]})]})]})})]})]})}),et&&ei&&(0,i.jsx)("div",{className:"modal-overlay",children:(0,i.jsx)($,{method:ei,amount:ex,remainingAmount:ef,onConfirm:ej,onBack:()=>er(!1)})})]})}},85978:(e,t,r)=>{"use strict";r.d(t,{y:()=>a});var i=r(77805);function a(e){let t=e.startsWith("/")?e:`/${e}`;return!function(){if(i.Ii.isNativePlatform())return!1;let e=window.location.hostname;return"localhost"===e||"127.0.0.1"===e}()?`https://agrimarche-ultra-v1.vercel.app${t}`:t}},91e3:(e,t,r)=>{"use strict";r.d(t,{l:()=>a,n:()=>o});var i=r(85978);async function a({userId:e,type:t,title:r,body:o,link:n,icon:s="\uD83D\uDD14",priority:l="medium",urgent:d=!1,channels:c=["push"]}){try{let a=await fetch((0,i.y)("/api/notifications/send"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:e,title:r,body:o,link:n,channels:c,priority:l,urgent:d,type:t,icon:s})});a.ok||console.warn("[notifyUser] \xc9chec envoi (statut",a.status,")")}catch(e){console.warn("[notifyUser] Erreur r\xe9seau:",e)}}async function o({type:e,title:t,body:r,link:a,icon:n="\uD83C\uDF3E",priority:s="medium",urgent:l=!1,excludeUserId:d}){try{let o=await fetch((0,i.y)("/api/broadcast"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:t,body:r,link:a,type:e,icon:n,priority:s,urgent:l,excludeUserId:d})});o.ok||console.warn("[notifyAllUsers] \xc9chec envoi (statut",o.status,")")}catch(e){console.warn("[notifyAllUsers] Erreur r\xe9seau:",e)}}}},e=>{e.O(0,[8017,5167,2301,7805,692,8500,8971,4894,9509,8441,3794,7358],()=>e(e.s=66182)),_N_E=e.O()}]);