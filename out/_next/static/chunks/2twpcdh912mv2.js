(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,69439,e=>{"use strict";var t=e.i(43476),r=e.i(71645),i=e.i(22016),a=e.i(18566),o=e.i(5539),n=e.i(54338);e.i(36180);var s=e.i(28719),l=e.i(63802),d=e.i(51400),c=e.i(17689),p=e.i(73148),g=e.i(36393),m=e.i(63448),x=e.i(48161),h=e.i(67363),u=e.i(20865),y=e.i(96315),f=e.i(1279),v=e.i(58796),b=e.i(11241),j=e.i(56420);let k=(0,j.default)("credit-card",[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]]);var S=e.i(78344),w=e.i(32781),z=e.i(67927),F=e.i(82625);let A=(0,j.default)("smartphone",[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]]);var N=e.i(84449),D=e.i(89664),C=e.i(99847),M=e.i(82954),T=e.i(6537),L=e.i(75387);let I=(0,j.default)("receipt",[["path",{d:"M12 17V7",key:"pyj7ub"}],["path",{d:"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8",key:"1elt7d"}],["path",{d:"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",key:"ycz6yz"}]]),P=async e=>{let t=(0,c.doc)(g.db,"orders",e),r={pending:{completed:!0,timestamp:new Date},preparing:{completed:!1,timestamp:null},ready:{completed:!1,timestamp:null},picked_up:{completed:!1,timestamp:null},in_transit:{completed:!1,timestamp:null},arrived:{completed:!1,timestamp:null},delivered:{completed:!1,timestamp:null}};return await (0,l.updateDoc)(t,{deliveryStatus:"pending",deliverySteps:r}),!0},E=e=>{let t=new Date(e);return t.setDate(t.getDate()+3),t};var B=e.i(51769);let W=`
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
`,R={wave:{id:"wave",name:"Wave",description:"Paiement instantané, sécurisé",icon:(0,t.jsx)(A,{size:17}),fee:0,paymentLink:e=>"https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/",minAmount:100,maxAmount:1e6},orange_money:{id:"orange_money",name:"Orange Money",description:"Paiement mobile Orange",icon:(0,t.jsx)(A,{size:17}),fee:0,paymentLink:null,merchantPhone:"77 974 70 73",minAmount:100,maxAmount:1e6}};function _({method:e,amount:i,remainingAmount:a,onConfirm:o,onBack:n}){let s=e.paymentLink?e.paymentLink(i):null;(0,r.useEffect)(()=>{"wave"===e.id&&s&&(sessionStorage.setItem("wave_pending",JSON.stringify({paymentMethod:"wave",ts:Date.now()})),window.location.href=s)},[]);let l=()=>{o()};return(0,t.jsxs)("div",{className:"modal-card",style:{maxWidth:460},children:[(0,t.jsxs)("div",{className:"modal-header",style:{padding:"24px 28px",borderBottom:"1px solid var(--border)",textAlign:"center"},children:[(0,t.jsx)("div",{style:{width:56,height:56,borderRadius:"50%",background:"linear-gradient(135deg, var(--gold-lt), var(--gold))",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px"},children:e.icon}),(0,t.jsxs)("h3",{className:"serif",style:{fontSize:22,fontWeight:400,color:"var(--ink)"},children:["Acompte ",e.name]}),(0,t.jsxs)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:6},children:["Acompte (25%) : ",(0,t.jsxs)("strong",{children:[i.toLocaleString()," FCFA"]})]}),(0,t.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:4},children:["Solde à régler à la livraison : ",a.toLocaleString()," FCFA"]})]}),(0,t.jsxs)("div",{style:{padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,textAlign:"center"},children:["wave"===e.id?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px",textAlign:"center"},children:[(0,t.jsx)("p",{style:{fontSize:14,color:"var(--ink)",marginBottom:12},children:"Vous allez être redirigé vers Wave pour effectuer le paiement de l'acompte (25%)."}),(0,t.jsxs)("div",{style:{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginTop:16},children:[(0,t.jsx)(M.Shield,{size:16,style:{color:"var(--gold)"}}),(0,t.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)"},children:"Paiement sécurisé"})]})]}),(0,t.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,t.jsx)(x.CheckCircle,{size:16}),"J'ai payé l'acompte, confirmer ma commande"]})]}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:12,padding:"20px"},children:[(0,t.jsx)("p",{style:{fontSize:13,color:"var(--ink-md)",marginBottom:12},children:"Envoyez l'acompte (25%) à :"}),(0,t.jsxs)("div",{style:{fontSize:20,fontWeight:700,color:"var(--gold)",letterSpacing:"0.08em",marginBottom:8},children:["+221 ",e.merchantPhone]}),(0,t.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"via Orange Money"}),(0,t.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)",marginTop:10},children:["Solde de ",a.toLocaleString()," FCFA à régler à la livraison"]})]}),(0,t.jsxs)("button",{onClick:l,className:"cta-btn",children:[(0,t.jsx)(x.CheckCircle,{size:16}),"J'ai payé l'acompte, confirmer ma commande"]})]}),(0,t.jsx)("button",{onClick:n,style:{fontSize:11,color:"var(--ink-lt)",background:"none",border:"none",cursor:"pointer",marginTop:8},children:"← Annuler"})]})]})}e.s(["default",0,function(){let e=(0,a.useRouter)(),{user:j}=(0,n.useAuth)(),{cart:A,clearCart:M}=(0,o.useCart)(),{location:$,loading:O,detectLocation:q}=function(){let[e,t]=(0,r.useState)({city:"Chargement...",region:"",country:"",lat:0,lng:0,detected:!1,isDefault:!1}),[i,a]=(0,r.useState)(!0),[o,n]=(0,r.useState)(""),s=(0,r.useCallback)(async()=>{a(!0),n("");try{let e=await fetch("https://ipapi.co/json/");if(e.ok){let r=await e.json();if(r.latitude&&r.longitude){let e=r.city||"Dakar",i=r.region||e,o=r.country_name||"Sénégal",n={city:e,region:i,country:o,lat:r.latitude,lng:r.longitude,detected:!0,address:`${e}, ${i}`,isDefault:!1};return console.log(`📍 Localisation d\xe9tect\xe9e par IP : ${e}`),t(n),localStorage.setItem("user_location",JSON.stringify(n)),a(!1),n}}return new Promise(e=>{if(!navigator.geolocation){let r={city:"📍 Ville non détectée",region:"",country:"Sénégal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};n("📍 Activez la localisation pour une géolocalisation précise"),t(r),a(!1),e(r);return}navigator.geolocation.getCurrentPosition(async r=>{let{latitude:i,longitude:o}=r.coords;try{let r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${i}&lon=${o}&addressdetails=1&accept-language=fr&zoom=18`);if(r.ok){let n=await r.json(),s=n.address?.city||n.address?.town||n.address?.village||"Dakar",l=n.address?.state||n.address?.region||s,d=n.address?.country||"Sénégal",c={city:s,region:l,country:d,lat:i,lng:o,detected:!0,address:`${s}, ${l}`,isDefault:!1};console.log(`📍 Localisation GPS : ${s}`),t(c),localStorage.setItem("user_location",JSON.stringify(c)),a(!1),e(c)}else throw Error("Erreur API")}catch(s){console.error("Erreur reverse geocoding:",s);let r={city:"📍 Position approximative",region:"",country:"Sénégal",lat:i,lng:o,detected:!0,isDefault:!0};n("📍 Position approximative - activez la localisation pour plus de précision"),t(r),a(!1),e(r)}},()=>{let r={city:"📍 Position approximative",region:"",country:"Sénégal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};n("📍 Position approximative - activez la localisation pour plus de précision"),t(r),a(!1),e(r)},{enableHighAccuracy:!0,timeout:1e4,maximumAge:0})})}catch(r){console.error("Erreur détection localisation:",r);let e={city:"📍 Position approximative",region:"",country:"Sénégal",lat:14.7167,lng:-17.4677,detected:!1,isDefault:!0};return n("📍 Position approximative - activez la localisation"),t(e),a(!1),e}},[]);return(0,r.useEffect)(()=>{let e=localStorage.getItem("user_location"),r=e?JSON.parse(e):null;r?.lat&&r?.lng?(t(r),a(!1)):s()},[s]),{location:e,loading:i,error:o,detectLocation:s}}(),[V,G]=(0,r.useState)(!1),[U,J]=(0,r.useState)(!1),[H,Y]=(0,r.useState)(""),[K,Q]=(0,r.useState)(0),[X,Z]=(0,r.useState)(!1),[ee,et]=(0,r.useState)("wave"),[er,ei]=(0,r.useState)(!1),[ea,eo]=(0,r.useState)(null),[en,es]=(0,r.useState)(!1),[el,ed]=(0,r.useState)(""),[ec,ep]=(0,r.useState)(!1);(0,r.useEffect)(()=>{let e=sessionStorage.getItem("wave_pending");if(e)try{let t=JSON.parse(e);"wave"===t.paymentMethod&&(et("wave"),ep(!0),sessionStorage.removeItem("wave_pending"))}catch{sessionStorage.removeItem("wave_pending")}},[]);let eg=(0,r.useMemo)(()=>A?.items||[],[A]),em=(0,r.useMemo)(()=>A?.total||0,[A]),ex=em>=5e3,eh=(0,r.useMemo)(()=>{if(ex)return 0;if(!$?.lat||!$?.lng)return 1e3;let e=111*Math.sqrt(Math.pow($.lat-14.7167,2)+Math.pow($.lng+17.4677,2));return e<=10||e<=30?1e3:e<=100?1500:2e3},[$,ex]),eu=em+eh,ey=Math.round(.25*eu*1.02),ef=eu-ey,ev=(0,r.useMemo)(()=>{if(ex)return"24 – 48 h (Express)";if(!$?.lat||!$?.lng)return"À confirmer";let e=111*Math.sqrt(Math.pow($.lat-14.7167,2)+Math.pow($.lng+17.4677,2));return e<=10?"24 h":e<=30?"24 – 48 h":e<=100?"48 – 72 h":"3 – 5 jours"},[$,ex]),eb=(0,r.useCallback)(()=>{let e=new Date,t=e.getFullYear(),r=String(e.getMonth()+1).padStart(2,"0"),i=String(e.getDate()).padStart(2,"0"),a=Math.floor(1e4*Math.random()).toString().padStart(4,"0");return`AGR-${t}${r}${i}-${a}`},[]),ej=async()=>{if(0===eg.length)return ed("Votre panier est vide"),!1;if(!j)return ed("Session expirée, reconnecte-toi pour continuer."),es(!1),e.push("/auth/login?redirect=/checkout"),!1;es(!0),ed("");try{let t=new Map;for(let e of eg){let r=e?.product?.sellerId||j?.uid||"agrimarche-official";t.has(r)||t.set(r,[]),t.get(r).push(e)}let r=[...t.entries()],i=r.length>1,a=eb(),o=[];for(let e=0;e<r.length;e++){let t,[n,m]=r[e],x=m[0],h=i?`${a}-${String.fromCharCode(65+e)}`:a,u=n||j?.uid||"agrimarche-official",y=x?.product?.sellerName||"AgriMarché",f=x?.product?.sellerPhone||"221779747073",v=x?.product?.region||"Dakar, Sénégal",b=14.7167,k=-17.4677,S="Dakar, Sénégal";if(u&&"agrimarche-official"!==u)try{let e=await (0,l.getDoc)((0,c.doc)(g.db,"users",u));if(e.exists()){let t=e.data();b=t?.latitude||t?.lat||14.7167,k=t?.longitude||t?.lng||-17.4677,S=t?.address||t?.city||"Dakar, Sénégal"}}catch{}let w=m.reduce((e,t)=>e+(t?.product?.price||0)*(t?.quantity||1),0),z=e===r.length-1;if(i)if(z)t=eh-o.reduce((e,t)=>e+t.deliveryFee,0);else{let e=em>0?w/em:1/r.length;t=Math.round(eh*e)}else t=eh;let F=w+t,A=Math.round(.25*F*1.02),N=F-A,D=R[ee],C={id:h,sellerId:u,sellerName:y,sellerPhone:f,sellerRegion:v,userId:j.uid,userName:j?.displayName||"Client AgriMarché",userEmail:j?.email||"",userPhone:j?.phoneNumber||"",sellerLocation:{lat:b,lng:k,address:S},customerLocation:{lat:$?.lat||null,lng:$?.lng||null,address:$?.address||$?.city||"Adresse non détectée"},date:new Date().toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),timestamp:new Date().toISOString(),status:"en_attente",statusLabel:"En attente de validation - Acompte à vérifier",orderGroupId:a,isMultiVendorGroup:i,subtotal:w,deliveryFee:t,isFreeDelivery:ex,total:F,depositRate:.25,depositAmount:A,remainingAmount:N,balanceDueAtDelivery:N,paymentMethod:ee,paymentMethodName:D?.name,paymentStatus:"acompte_en_attente_verification",items:m.map(e=>({productId:e?.product?.id||"unknown",productName:e?.product?.name||"Produit inconnu",productPrice:e?.product?.price||0,quantity:e?.quantity||1,unit:e?.product?.unit||"kg",total:(e?.product?.price||0)*(e?.quantity||1),image:e?.product?.images?.[0]||null,category:e?.product?.category||"Autres"})),deliveryTime:ev,createdAt:d.Timestamp.now(),updatedAt:d.Timestamp.now()},M=await (0,l.addDoc)((0,s.collection)(g.db,"orders"),C);await (0,l.updateDoc)((0,c.doc)(g.db,"orders",M.id),{firestoreId:M.id,orderNumber:h,estimatedDelivery:d.Timestamp.fromDate(E(new Date))}),await P(M.id);try{await (0,l.setDoc)((0,c.doc)(g.db,"seller_orders",M.id),{...C,orderId:M.id,orderNumber:h,firestoreId:M.id,sellerRead:!1,sellerStatus:"nouvelle",notifiedAt:d.Timestamp.now()})}catch(e){console.error("seller_orders",e)}for(let e of(u&&"agrimarche-official"!==u&&(0,B.notifyUser)({userId:u,type:"order",title:"🛒 Nouvelle commande !",body:`${j?.displayName||"Un client"} vient de commander \xb7 ${F.toLocaleString("fr-FR")} FCFA`,link:"/seller/orders",priority:"high"}),m))if(e?.product?.id)try{await (0,l.updateDoc)((0,c.doc)(g.db,"products",e.product.id),{stock:(0,p.increment)(-(e.quantity||1))})}catch{}o.push({docRefId:M.id,orderNumber:h,deliveryFee:t,remainingAmount:N})}return M(),Y(i?a:o[0].orderNumber),Q(o.reduce((e,t)=>e+t.remainingAmount,0)),Z(i),J(!0),setTimeout(()=>{e.push(i?"/account/orders":"/account/orders?order="+o[0].docRefId)},3e3),!0}catch(e){return console.error(e),ed("Une erreur est survenue. Veuillez réessayer."),!1}finally{es(!1)}},ek=async()=>{ei(!1),await ej()};(0,r.useEffect)(()=>{ec&&0!==eg.length&&j&&(ep(!1),ej())},[ec,eg.length,j]);let eS=async()=>{if(!j)return void e.push("/auth/login?redirect=/checkout");if(0===eg.length)return void ed("Votre panier est vide");let t=R[ee];t&&(eo(t),ei(!0))};return en||ec?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("style",{children:W}),(0,t.jsx)("div",{className:"success-root checkout-root",children:(0,t.jsxs)("div",{className:"success-card",children:[(0,t.jsx)("div",{style:{width:60,height:60,borderRadius:"50%",border:"4px solid var(--gold)",borderTopColor:"transparent",animation:"spin 0.8s linear infinite",margin:"0 auto 24px"}}),(0,t.jsx)("p",{className:"serif",style:{fontSize:26,fontWeight:300,color:"var(--ink)",textAlign:"center"},children:"Traitement en cours\\u2026"}),(0,t.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",textAlign:"center",marginTop:8},children:"Votre commande est en cours de confirmation."})]})}),(0,t.jsx)("style",{children:"@keyframes spin { to { transform: rotate(360deg); } }"})]}):U?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("style",{children:W}),(0,t.jsx)("div",{className:"success-root checkout-root",children:(0,t.jsxs)("div",{className:"success-card animate-enter",children:[(0,t.jsx)("div",{className:"success-icon-ring",children:(0,t.jsx)(x.CheckCircle,{size:36,style:{color:"var(--gold)"}})}),(0,t.jsxs)("p",{className:"serif",style:{fontSize:32,fontWeight:300,color:"var(--ink)",lineHeight:1.2},children:["Commande",(0,t.jsx)("br",{}),(0,t.jsx)("em",{children:"confirmée"})]}),(0,t.jsx)("p",{style:{fontSize:13,color:"var(--ink-lt)",marginTop:8},children:"Merci pour votre confiance"}),(0,t.jsx)("div",{className:"success-order-badge",children:H}),X&&(0,t.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:-16,marginBottom:16},children:"Votre panier contenait des produits de plusieurs vendeurs — il a été scindé en plusieurs livraisons, visibles séparément dans « Mes commandes »."}),(0,t.jsxs)("div",{style:{background:"var(--ivory)",borderRadius:16,padding:"16px 20px",border:"1px solid var(--border)",textAlign:"left",marginBottom:28},children:[(0,t.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,t.jsx)(h.Truck,{size:14,style:{color:"var(--gold)"}}),(0,t.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Livraison estimée"})]}),(0,t.jsx)("p",{style:{fontSize:15,color:"var(--ink)",fontWeight:400},children:ev}),ex&&(0,t.jsxs)("span",{className:"tag tag-green",style:{marginTop:8},children:[(0,t.jsx)(F.Gift,{size:10})," Livraison offerte"]})]}),(0,t.jsxs)("div",{style:{background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:16,padding:"16px 20px",border:"1.5px solid var(--gold-lt)",textAlign:"left",marginBottom:28},children:[(0,t.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:6},children:[(0,t.jsx)(N.Banknote,{size:14,style:{color:"var(--gold)"}}),(0,t.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.10em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Solde à régler à la livraison"})]}),(0,t.jsxs)("p",{style:{fontSize:18,color:"var(--ink)",fontWeight:600},children:[K.toLocaleString()," ",(0,t.jsx)("span",{style:{fontSize:13,fontWeight:400,color:"var(--ink-lt)"},children:"FCFA"})]}),(0,t.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)",marginTop:4},children:"Acompte de 25% déjà réglé. Le solde est à remettre au livreur."})]}),(0,t.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:10},children:[(0,t.jsx)(i.default,{href:"/account/orders",className:"cta-btn",style:{textDecoration:"none",borderRadius:14},children:"Mes commandes"}),(0,t.jsx)(i.default,{href:"/main/products",style:{textDecoration:"none",textAlign:"center",fontSize:12,color:"var(--ink-lt)",letterSpacing:"0.08em",textTransform:"uppercase",padding:"12px",display:"block"},children:"Continuer mes achats"})]})]})})]}):(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)("style",{children:W}),(0,t.jsx)("div",{className:"checkout-root",children:(0,t.jsxs)("div",{style:{maxWidth:1160,margin:"0 auto",padding:"40px 20px"},children:[(0,t.jsxs)("div",{className:"animate-enter",style:{display:"flex",alignItems:"center",gap:16,marginBottom:40},children:[(0,t.jsx)("button",{onClick:()=>e.back(),style:{width:40,height:40,borderRadius:"50%",border:"1px solid var(--border)",background:"var(--white)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--ink-md)",flexShrink:0,transition:"all 0.2s"},children:(0,t.jsx)(b.ArrowLeft,{size:18})}),(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{style:{fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--ink-lt)",marginBottom:2},children:"AgriMarché"}),(0,t.jsx)("h1",{className:"serif",style:{fontSize:28,fontWeight:400,color:"var(--ink)",lineHeight:1},children:"Validation de commande"})]}),(0,t.jsxs)("div",{style:{marginLeft:"auto",display:"flex",alignItems:"center",gap:6},children:[(0,t.jsx)(T.Lock,{size:12,style:{color:"var(--gold)"}}),(0,t.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement sécurisé"})]})]}),(0,t.jsxs)("div",{style:{display:"grid",gridTemplateColumns:"1fr",gap:28},className:"checkout-grid",children:[(0,t.jsx)("style",{children:"@media(min-width:1024px){.checkout-grid{grid-template-columns:1fr 400px !important;}}"}),(0,t.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:20},children:[(0,t.jsxs)("div",{className:"card animate-enter delay-1",children:[(0,t.jsxs)("div",{className:"card-header",children:[(0,t.jsx)("div",{className:"card-header-dot"}),(0,t.jsx)(h.Truck,{size:14,style:{color:"var(--ink-lt)"}}),(0,t.jsx)("span",{className:"card-header-title",children:"Adresse de livraison"})]}),(0,t.jsxs)("div",{className:"card-body",children:[(0,t.jsxs)("button",{className:"location-btn",onClick:q,children:[(0,t.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:14},children:[(0,t.jsx)("div",{className:"icon-circle",children:(0,t.jsx)(S.Navigation,{size:16})}),(0,t.jsxs)("div",{style:{textAlign:"left"},children:[(0,t.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:"Utiliser ma position GPS"}),O?(0,t.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"Détection en cours…"}):$?.city?(0,t.jsxs)("p",{style:{fontSize:12,color:"var(--gold)"},children:[$.city,$.region?`, ${$.region}`:""]}):(0,t.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:"Cliquez pour détecter automatiquement"})]})]}),(0,t.jsx)(z.ChevronRight,{size:16,style:{color:"var(--gold)",flexShrink:0}})]}),$?.address&&(0,t.jsxs)("div",{style:{marginTop:12,padding:"12px 16px",background:"var(--ivory)",borderRadius:10,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:8},children:[(0,t.jsx)(u.MapPin,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,t.jsx)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:$.address})]})]})]}),(0,t.jsxs)("div",{className:"card animate-enter delay-2",children:[(0,t.jsxs)("div",{className:"card-header",children:[(0,t.jsx)("div",{className:"card-header-dot"}),(0,t.jsx)(f.User,{size:14,style:{color:"var(--ink-lt)"}}),(0,t.jsx)("span",{className:"card-header-title",children:"Informations de contact"})]}),(0,t.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:[{icon:(0,t.jsx)(f.User,{size:15}),label:"Nom complet",value:j?.displayName||"Client AgriMarché"},{icon:(0,t.jsx)(y.Mail,{size:15}),label:"Adresse e-mail",value:j?.email||"Non renseigné"},{icon:(0,t.jsx)(L.Phone,{size:15}),label:"Téléphone",value:j?.phoneNumber||"À renseigner"}].map(e=>(0,t.jsxs)("div",{className:"info-row",children:[(0,t.jsx)("div",{className:"icon-circle",style:{width:34,height:34},children:e.icon}),(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"info-row-label",children:e.label}),(0,t.jsx)("p",{className:"info-row-value",children:e.value})]})]},e.label))})]}),(0,t.jsxs)("div",{className:"card animate-enter delay-3",children:[(0,t.jsxs)("div",{className:"card-header",children:[(0,t.jsx)("div",{className:"card-header-dot"}),(0,t.jsx)(k,{size:14,style:{color:"var(--ink-lt)"}}),(0,t.jsx)("span",{className:"card-header-title",children:"Moyen de paiement"})]}),(0,t.jsx)("div",{className:"card-body",style:{display:"flex",flexDirection:"column",gap:10},children:Object.values(R).map(e=>(0,t.jsxs)("label",{className:`pay-option${ee===e.id?" selected":""}`,onClick:()=>et(e.id),children:[(0,t.jsx)("input",{type:"radio",name:"paymentMethod",value:e.id,readOnly:!0,checked:ee===e.id}),(0,t.jsx)("div",{className:"pay-radio",children:(0,t.jsx)("div",{className:"pay-radio-dot"})}),(0,t.jsx)("div",{className:"icon-circle",style:{width:36,height:36},children:e.icon}),(0,t.jsxs)("div",{style:{flex:1},children:[(0,t.jsx)("p",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e.name}),(0,t.jsx)("p",{style:{fontSize:12,color:"var(--ink-lt)"},children:e.description})]}),ee===e.id&&(0,t.jsxs)("span",{className:"tag tag-gold",children:[(0,t.jsx)(D.Check,{size:10})," Sélectionné"]})]},e.id))})]})]}),(0,t.jsx)("div",{style:{position:"sticky",top:24,alignSelf:"start"},className:"animate-enter delay-4",children:(0,t.jsxs)("div",{className:"card",children:[(0,t.jsxs)("div",{style:{background:"var(--ink)",padding:"20px 28px",display:"flex",alignItems:"center",gap:10},children:[(0,t.jsx)(m.ShoppingBag,{size:16,style:{color:"var(--gold)"}}),(0,t.jsx)("span",{className:"serif",style:{fontSize:18,fontWeight:400,color:"var(--white)",letterSpacing:"0.02em"},children:"Récapitulatif"}),(0,t.jsxs)("span",{style:{marginLeft:"auto",fontSize:12,color:"rgba(255,255,255,0.4)",letterSpacing:"0.06em"},children:[eg.length," article",eg.length>1?"s":""]})]}),(0,t.jsxs)("div",{className:"card-body",children:[(0,t.jsx)("div",{style:{maxHeight:280,overflowY:"auto",marginBottom:16},children:eg.map((e,r)=>(0,t.jsxs)("div",{className:"cart-item",children:[(0,t.jsx)("div",{className:"cart-thumb",children:(0,t.jsx)(v.Leaf,{size:18,style:{color:"#2D7A4E"}})}),(0,t.jsxs)("div",{style:{flex:1},children:[(0,t.jsx)("p",{style:{fontSize:13,fontWeight:500,color:"var(--ink)",marginBottom:2},children:e?.product?.name}),(0,t.jsxs)("p",{style:{fontSize:11,color:"var(--ink-lt)"},children:[e?.quantity," × ",(e?.product?.price||0).toLocaleString()," FCFA"]})]}),(0,t.jsxs)("p",{style:{fontSize:13,fontWeight:600,color:"var(--ink)",flexShrink:0},children:[((e?.product?.price||0)*(e?.quantity||0)).toLocaleString()," ",(0,t.jsx)("span",{style:{fontSize:10,color:"var(--ink-lt)"},children:"FCFA"})]})]},r))}),(0,t.jsxs)("div",{style:{display:"flex",flexDirection:"column",gap:8},children:[(0,t.jsxs)("div",{className:"total-row",children:[(0,t.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Sous-total"}),(0,t.jsxs)("span",{style:{fontSize:13,color:"var(--ink)"},children:[em.toLocaleString()," FCFA"]})]}),(0,t.jsxs)("div",{className:"total-row",children:[(0,t.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:13},children:"Livraison"}),(0,t.jsx)("span",{style:{fontSize:13,color:ex?"#1E7A44":"var(--ink)"},children:ex?"Offerte":`${eh.toLocaleString()} FCFA`})]}),ex&&(0,t.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:6,padding:"8px 12px",background:"#F0FAF4",borderRadius:8,border:"1px solid #A8E6C0"},children:[(0,t.jsx)(F.Gift,{size:12,style:{color:"#1E7A44"}}),(0,t.jsx)("span",{style:{fontSize:11,color:"#1E7A44",letterSpacing:"0.04em"},children:"Livraison offerte dès 5 000 FCFA"})]}),(0,t.jsxs)("div",{className:"total-row grand",children:[(0,t.jsx)("span",{style:{fontSize:14,fontWeight:500,color:"var(--ink)",letterSpacing:"0.04em"},children:"Total TTC"}),(0,t.jsxs)("span",{className:"serif",style:{fontSize:24,fontWeight:500,color:"var(--ink)"},children:[eu.toLocaleString()," ",(0,t.jsx)("span",{style:{fontSize:14,fontWeight:400},children:"FCFA"})]})]})]}),(0,t.jsxs)("div",{style:{marginTop:16,padding:"16px 18px",background:"linear-gradient(135deg, #FFFDF9, #FDF5E4)",borderRadius:14,border:"1.5px solid var(--gold-lt)"},children:[(0,t.jsxs)("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:10},children:[(0,t.jsx)(I,{size:14,style:{color:"var(--gold)"}}),(0,t.jsx)("span",{style:{fontSize:11,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase",color:"var(--ink-md)"},children:"Paiement en 2 fois"})]}),(0,t.jsxs)("div",{className:"total-row",style:{marginBottom:6},children:[(0,t.jsx)("span",{style:{color:"var(--ink)",fontSize:13,fontWeight:500},children:"Acompte à régler maintenant (25%)"}),(0,t.jsxs)("span",{style:{fontSize:15,color:"var(--gold)",fontWeight:700},children:[ey.toLocaleString()," FCFA"]})]}),(0,t.jsxs)("div",{className:"total-row",children:[(0,t.jsx)("span",{style:{color:"var(--ink-lt)",fontSize:12},children:"Solde à régler à la livraison (75%)"}),(0,t.jsxs)("span",{style:{fontSize:13,color:"var(--ink-md)"},children:[ef.toLocaleString()," FCFA"]})]})]}),(0,t.jsxs)("div",{style:{marginTop:16,padding:"12px 16px",background:"var(--ivory)",borderRadius:12,border:"1px solid var(--border)",display:"flex",alignItems:"center",gap:10},children:[(0,t.jsx)(h.Truck,{size:14,style:{color:"var(--gold)",flexShrink:0}}),(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em",textTransform:"uppercase",marginBottom:2},children:"Livraison estimée"}),(0,t.jsx)("p",{style:{fontSize:13,color:"var(--ink)",fontWeight:500},children:ev})]})]}),el&&(0,t.jsxs)("div",{className:"err-box",style:{marginTop:14},children:[(0,t.jsx)(C.AlertCircle,{size:14}),el]}),(0,t.jsx)("button",{onClick:eS,disabled:en||0===eg.length,className:"cta-btn",style:{marginTop:20},children:en?(0,t.jsxs)(t.Fragment,{children:[(0,t.jsx)(w.Loader2,{size:16,style:{animation:"spin 1s linear infinite"}})," Traitement…"]}):(0,t.jsxs)(t.Fragment,{children:["Payer l'acompte · ",ey.toLocaleString()," FCFA →"]})}),(0,t.jsxs)("div",{style:{marginTop:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8},children:[(0,t.jsx)(T.Lock,{size:11,style:{color:"var(--ink-lt)"}}),(0,t.jsx)("span",{style:{fontSize:11,color:"var(--ink-lt)",letterSpacing:"0.06em"},children:"Paiement 100% sécurisé · Livraison garantie"})]})]})]})})]})]})}),er&&ea&&(0,t.jsx)("div",{className:"modal-overlay",children:(0,t.jsx)(_,{method:ea,amount:ey,remainingAmount:ef,onConfirm:ek,onBack:()=>ei(!1)})})]})}],69439)}]);