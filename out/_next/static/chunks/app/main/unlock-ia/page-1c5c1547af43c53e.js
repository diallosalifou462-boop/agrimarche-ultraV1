(self.webpackChunk_N_E=self.webpackChunk_N_E||[]).push([[1020],{34908:(e,a,t)=>{"use strict";t.r(a),t.d(a,{default:()=>g});var r=t(95155),s=t(12115),i=t(98500),n=t.n(i),o=t(95390),c=t(91531),l=t(54894);async function d(e){if(!l.db)return{valid:!1,days:0,reason:"db_unavailable"};try{let{doc:a,getDoc:r}=await Promise.resolve().then(t.bind(t,91531)),s=await r(a(l.db,"accessCodes",e));if(!s.exists())return{valid:!1,days:0,reason:"not_found"};let i=s.data();if(i.used)return{valid:!1,days:0,reason:"already_used"};if(i.expiresAt&&i.expiresAt.toDate()<new Date)return{valid:!1,days:0,reason:"expired"};return{valid:!0,days:i.days??30}}catch(e){return console.error("verifyCodeFirestore:",e),{valid:!1,days:0,reason:"error"}}}async function p(e,a){if(l.db)try{let{doc:r,updateDoc:s,Timestamp:i}=await Promise.resolve().then(t.bind(t,91531));await s(r(l.db,"accessCodes",e),{used:!0,usedBy:a,usedAt:i.now()})}catch(e){console.error("markCodeUsed:",e)}}async function x(e,a){if(!l.db)return;let t=new Date;t.setDate(t.getDate()+a),await (0,c.BN)((0,c.doc)(l.db,"users",e),{hasAIAccess:!0,aiExpiryDate:c.Timestamp.fromDate(t),aiUnlockedAt:c.Timestamp.now(),aiTokensUsed:0,aiTokensLimit:5e5,aiAlertSent:!1,aiLastUsageAt:null},{merge:!0}),localStorage.setItem("ai_user_id",e),localStorage.setItem("ai_code_expiry",t.getTime().toString()),localStorage.setItem("ai_tokens_limit","500000")}let b={not_found:"Code introuvable. V\xe9rifiez le code re\xe7u ou contactez-nous.",already_used:"Ce code a d\xe9j\xe0 \xe9t\xe9 utilis\xe9. Contactez-nous si c'est une erreur.",expired:"Ce code a expir\xe9. Contactez-nous pour en obtenir un nouveau.",db_unavailable:"Service temporairement indisponible. R\xe9essayez dans un instant.",error:"Erreur de v\xe9rification. V\xe9rifiez votre connexion et r\xe9essayez."},u=[{icon:"\uD83C\uDF24️",label:"M\xe9t\xe9o temps r\xe9el par r\xe9gion"},{icon:"\uD83D\uDCB0",label:"Simulation financement & cr\xe9dit"},{icon:"\uD83D\uDED2",label:"Prix live depuis le catalogue"},{icon:"\uD83C\uDF31",label:"Conseils agronomiques IA"},{icon:"\uD83D\uDCC8",label:"Pr\xe9visions de march\xe9"},{icon:"\uD83C\uDF99️",label:"Reconnaissance vocale"},{icon:"\uD83D\uDCCA",label:`${5e5.toLocaleString()} tokens inclus`}],f=["Assistant IA DeepSeek d\xe9bloqu\xe9","M\xe9t\xe9o temps r\xe9el par r\xe9gion","Simulation financement","Conseils agronomiques personnalis\xe9s",`${5e5.toLocaleString()} tokens inclus (500k)`];function g(){let{user:e,loading:a}=(0,o.A)(),[t,i]=(0,s.useState)("pay"),[g,v]=(0,s.useState)(""),[y,j]=(0,s.useState)(""),[w,k]=(0,s.useState)(!1),[N,A]=(0,s.useState)(0),[z,E]=(0,s.useState)(!1),[S,C]=(0,s.useState)(30),I=(0,s.useRef)(null);(0,s.useEffect)(()=>{E(!0)},[]),(0,s.useEffect)(()=>{z&&!a&&e?.uid&&l.db&&(async()=>{try{let a=(await (0,c.getDoc)((0,c.doc)(l.db,"users",e.uid))).data();if(a?.hasAIAccess&&a?.aiExpiryDate){let e=a.aiExpiryDate.toDate?.()||new Date(a.aiExpiryDate);e>new Date&&(i("success"),C(Math.ceil((e.getTime()-Date.now())/864e5)))}}catch{}})()},[z,a,e]),(0,s.useEffect)(()=>()=>{I.current&&clearInterval(I.current)},[]);let O=async()=>{let a=g.trim().toUpperCase();if(!a)return void j("Veuillez entrer votre code de confirmation.");if(!e?.uid)return void j("Vous devez \xeatre connect\xe9 pour activer l'acc\xe8s.");k(!0),j("");try{let{valid:t,days:r,reason:s}=await d(a);if(t){await x(e.uid,r),await p(a,e.uid),C(r),i("success");return}j(b[s??"error"]??b.error)}catch(e){console.error("handleVerify:",e),j("Erreur inattendue. R\xe9essayez dans un instant.")}finally{k(!1)}};return!z||a?(0,r.jsxs)("div",{className:"unlock-root",children:[(0,r.jsx)(m,{}),(0,r.jsx)("style",{children:_})]}):e?(0,r.jsxs)("div",{className:"unlock-root",children:[(0,r.jsx)("div",{className:"ambient-glow"}),(0,r.jsxs)("div",{className:"card-wrap",children:[(0,r.jsx)("div",{className:`progress-bar progress-bar--${t}`}),(0,r.jsxs)("div",{className:"steps-nav",children:[["pay","code","success"].map((e,a)=>(0,r.jsx)("div",{className:`step-dot ${t===e?"step-dot--active":""} ${"code"===t&&0===a||"success"===t?"step-dot--done":""}`,children:(0,r.jsx)("span",{className:"step-dot__num",children:a+1})},e)),(0,r.jsx)("div",{className:"steps-nav__line"})]}),(0,r.jsxs)("div",{className:"card-body",children:["pay"===t&&(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)("div",{className:"step-header",children:[(0,r.jsx)("div",{className:"avatar avatar--gradient-purple",children:"\uD83E\uDD16"}),(0,r.jsx)("h1",{className:"step-header__title",children:"IA Premium"}),(0,r.jsx)("p",{className:"step-header__sub",children:"Assistant IA AgriMarch\xe9 propuls\xe9 par DeepSeek — conseils, m\xe9t\xe9o, financement, march\xe9."})]}),(0,r.jsxs)("div",{className:"price-box",children:[(0,r.jsx)("div",{className:"price-box__label",children:"Acc\xe8s 30 jours"}),(0,r.jsxs)("div",{className:"price-box__amount",children:["690 ",(0,r.jsx)("span",{className:"price-box__currency",children:"FCFA"})]}),(0,r.jsx)("div",{className:"price-box__sub",children:"Paiement s\xe9curis\xe9 via Wave"})]}),(0,r.jsx)("ul",{className:"feature-list",children:u.map(({icon:e,label:a})=>(0,r.jsxs)("li",{className:"feature-list__item",children:[(0,r.jsx)("span",{className:"feature-list__icon",children:e}),(0,r.jsx)("span",{className:"feature-list__label",children:a}),(0,r.jsx)("span",{className:"feature-list__check",children:"✓"})]},a))}),(0,r.jsxs)("button",{className:"btn-wave",onClick:()=>{i("code"),A(5),I.current=setInterval(()=>{A(e=>e<=1?(I.current&&clearInterval(I.current),0):e-1)},1e3),window.open("https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/","_blank")},children:[(0,r.jsx)(h,{}),"Payer 690 FCFA avec Wave"]}),(0,r.jsxs)("div",{className:"info-box info-box--green",children:[(0,r.jsx)("strong",{className:"info-box__heading",children:"Comment \xe7a marche :"}),(0,r.jsxs)("ol",{className:"info-box__steps",children:[(0,r.jsx)("li",{children:'Cliquez sur "Payer avec Wave" ci-dessus'}),(0,r.jsx)("li",{children:"Effectuez le paiement de 690 FCFA"}),(0,r.jsx)("li",{children:"Nous vous envoyons un code d'activation"}),(0,r.jsx)("li",{children:"Revenez ici et entrez ce code pour d\xe9bloquer l'IA"})]})]}),(0,r.jsx)(n(),{href:"/main",className:"back-link",children:"← Retour \xe0 l'accueil"})]}),"code"===t&&(0,r.jsxs)(r.Fragment,{children:[(0,r.jsxs)("div",{className:"step-header",children:[(0,r.jsx)("div",{className:"avatar avatar--gradient-blue",children:"\uD83D\uDCE9"}),(0,r.jsx)("h2",{className:"step-header__title",children:"Entrez votre code"}),(0,r.jsx)("p",{className:"step-header__sub",children:"Entrez le code d'activation re\xe7u apr\xe8s votre paiement Wave."})]}),(0,r.jsxs)("div",{className:"info-box info-box--blue",children:[(0,r.jsx)("span",{className:"info-box__icon",children:"\uD83D\uDCA1"}),(0,r.jsxs)("p",{children:["Nous vous envoyons votre code par SMS ou WhatsApp."," ","Format\xa0: ",(0,r.jsx)("strong",{className:"code-format",children:"AGRI-XXXXXXXX"})]})]}),(0,r.jsxs)("div",{className:"field",children:[(0,r.jsx)("label",{className:"field__label",children:"CODE D'ACTIVATION"}),(0,r.jsx)("input",{className:`field__input ${y?"field__input--error":""}`,type:"text",value:g,onChange:e=>{v(e.target.value.toUpperCase()),j("")},onKeyDown:e=>"Enter"===e.key&&!w&&0===N&&O(),placeholder:"Ex : AGRI-A1B2C3D4",autoFocus:!0})]}),y&&(0,r.jsxs)("div",{className:"error-box",children:[(0,r.jsx)("span",{children:"⚠️"}),(0,r.jsx)("span",{children:y})]}),(0,r.jsx)("button",{className:`btn-verify ${w||N>0||!g.trim()?"btn-verify--disabled":""}`,onClick:O,disabled:w||N>0||!g.trim(),children:w?"⏳ V\xe9rification…":N>0?`Patienter ${N}s…`:"✓ Activer l'acc\xe8s IA"}),(0,r.jsxs)("div",{className:"info-box info-box--purple",style:{textAlign:"center"},children:["Vous n'avez pas re\xe7u votre code ?",(0,r.jsx)("br",{}),(0,r.jsx)("strong",{style:{color:"#b8a4f0"},children:"Contactez-nous sur WhatsApp"})," en indiquant votre num\xe9ro Wave."]}),(0,r.jsx)("div",{style:{display:"flex",justifyContent:"center",marginTop:4},children:(0,r.jsx)("button",{className:"back-btn",onClick:()=>{i("pay"),v(""),j("")},children:"← Retour au paiement"})})]}),"success"===t&&(0,r.jsxs)("div",{className:"success-wrap",children:[(0,r.jsx)("div",{className:"success-icon",children:"✅"}),(0,r.jsx)("h2",{className:"success-title",children:"Acc\xe8s activ\xe9 !"}),(0,r.jsxs)("p",{className:"success-sub",children:["Bienvenue dans l'IA Premium AgriMarch\xe9.",(0,r.jsx)("br",{}),"Votre acc\xe8s est valide"," ",(0,r.jsxs)("strong",{style:{color:"#e8f5e9"},children:[S," jours"]}),"."]}),(0,r.jsx)("ul",{className:"success-features",children:f.map(e=>(0,r.jsxs)("li",{className:"success-features__item",children:[(0,r.jsx)("span",{className:"success-features__check",children:"✓"}),e]},e))}),(0,r.jsx)(n(),{href:"/main/ai-assistant",className:"cta cta--purple",children:"\uD83E\uDD16 Acc\xe9der \xe0 l'IA Premium"}),(0,r.jsx)(n(),{href:"/main",className:"back-link",style:{marginTop:14},children:"Retour \xe0 l'accueil"})]})]})]}),(0,r.jsxs)("footer",{className:"unlock-footer",children:[(0,r.jsx)("span",{children:"\uD83D\uDD12"}),(0,r.jsx)("span",{children:"Paiement s\xe9curis\xe9 \xb7 Donn\xe9es chiffr\xe9es \xb7 AgriMarch\xe9 S\xe9n\xe9gal"})]}),(0,r.jsx)("style",{children:_})]}):(0,r.jsxs)("div",{className:"unlock-root",children:[(0,r.jsxs)("div",{className:"auth-gate",children:[(0,r.jsx)("span",{className:"auth-gate__icon",children:"\uD83D\uDD10"}),(0,r.jsx)("p",{className:"auth-gate__title",children:"Connexion requise"}),(0,r.jsx)("p",{className:"auth-gate__body",children:"Connectez-vous pour d\xe9bloquer l'acc\xe8s IA Premium AgriMarch\xe9."}),(0,r.jsx)(n(),{href:"/auth/login",className:"cta cta--green",children:"Se connecter"})]}),(0,r.jsx)("style",{children:_})]})}function m(){return(0,r.jsx)("div",{className:"spinner"})}function h(){return(0,r.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 32 32",fill:"none","aria-hidden":"true",children:[(0,r.jsx)("circle",{cx:"16",cy:"16",r:"16",fill:"#fff"}),(0,r.jsx)("path",{d:"M8 16c0-4.4 3.6-8 8-8s8 3.6 8 8",stroke:"#1e90e6",strokeWidth:"2.5",strokeLinecap:"round"}),(0,r.jsx)("path",{d:"M10.5 18.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5",stroke:"#1e90e6",strokeWidth:"2",strokeLinecap:"round"}),(0,r.jsx)("circle",{cx:"16",cy:"20",r:"2",fill:"#1e90e6"})]})}let _=`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── ROOT ─────────────────────────────────────────────────────────────── */
  .unlock-root {
    min-height: 100vh;
    background: radial-gradient(ellipse at 30% 20%, #0a1f0e 0%, #060e09 60%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    font-family: 'DM Sans', system-ui, sans-serif;
    position: relative;
    gap: 20px;
  }

  .ambient-glow {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(ellipse at 70% 80%, rgba(139,92,246,.07) 0%, transparent 55%),
      radial-gradient(ellipse at 10% 10%, rgba(0,255,135,.04) 0%, transparent 50%);
  }

  /* ── CARD ─────────────────────────────────────────────────────────────── */
  .card-wrap {
    position: relative;
    z-index: 1;
    width: 100%;
    max-width: 448px;
    background: #0d1a10;
    border: 1px solid #1a2e1e;
    border-radius: 24px;
    overflow: hidden;
    box-shadow:
      0 48px 96px rgba(0,0,0,.55),
      0 0 0 1px rgba(0,255,135,.04);
  }

  .card-body {
    padding: 32px 32px 40px;
  }

  /* ── PROGRESS BAR ─────────────────────────────────────────────────────── */
  .progress-bar {
    height: 3px;
    transition: background 0.4s;
  }
  .progress-bar--pay {
    background: linear-gradient(90deg, #8b5cf6 0%, #6d28d9 50%, #00ff87 100%);
    width: 33%;
  }
  .progress-bar--code {
    background: linear-gradient(90deg, #1e90e6, #00c8ff);
    width: 66%;
  }
  .progress-bar--success {
    background: linear-gradient(90deg, #00ff87, #00c96b);
    width: 100%;
  }

  /* ── STEP INDICATORS ──────────────────────────────────────────────────── */
  .steps-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: 18px 32px 0;
    position: relative;
  }
  .steps-nav__line {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 160px;
    height: 1px;
    background: #1a2e1e;
    z-index: 0;
    margin-top: 9px;
  }
  .step-dot {
    width: 28px; height: 28px;
    border-radius: 50%;
    border: 1.5px solid #1a2e1e;
    background: #0d1a10;
    display: flex; align-items: center; justify-content: center;
    z-index: 1;
    transition: all 0.3s;
    margin: 0 28px;
  }
  .step-dot--active {
    border-color: #00ff87;
    background: rgba(0,255,135,.1);
    box-shadow: 0 0 0 4px rgba(0,255,135,.1);
  }
  .step-dot--done {
    border-color: #00ff87;
    background: rgba(0,255,135,.15);
  }
  .step-dot__num {
    font-size: 11px;
    font-weight: 700;
    color: #4a6b50;
  }
  .step-dot--active .step-dot__num,
  .step-dot--done .step-dot__num {
    color: #00ff87;
  }

  /* ── STEP HEADER ──────────────────────────────────────────────────────── */
  .step-header {
    text-align: center;
    margin-bottom: 28px;
    margin-top: 8px;
  }
  .avatar {
    width: 72px; height: 72px;
    border-radius: 50%;
    margin: 0 auto 18px;
    display: flex; align-items: center; justify-content: center;
    font-size: 30px;
  }
  .avatar--gradient-purple {
    background: linear-gradient(135deg, #8b5cf6, #00ff87);
    box-shadow: 0 8px 32px rgba(139,92,246,.3);
  }
  .avatar--gradient-blue {
    background: linear-gradient(135deg, #1e90e6, #0070cc);
    box-shadow: 0 8px 24px rgba(30,144,230,.3);
  }
  .step-header__title {
    font-size: 26px;
    font-weight: 800;
    color: #e8f5e9;
    letter-spacing: -0.5px;
    margin-bottom: 8px;
    line-height: 1.2;
  }
  .step-header__sub {
    font-size: 14px;
    color: #6b8a71;
    line-height: 1.65;
    max-width: 300px;
    margin: 0 auto;
  }

  /* ── PRICE BOX ────────────────────────────────────────────────────────── */
  .price-box {
    background: rgba(0,255,135,.04);
    border: 1px solid rgba(0,255,135,.12);
    border-radius: 16px;
    padding: 20px 24px;
    text-align: center;
    margin-bottom: 24px;
  }
  .price-box__label {
    font-size: 12px;
    color: #6b8a71;
    letter-spacing: .4px;
    margin-bottom: 6px;
  }
  .price-box__amount {
    font-size: 44px;
    font-weight: 900;
    color: #00ff87;
    letter-spacing: -2px;
    line-height: 1;
  }
  .price-box__currency {
    font-size: 18px;
    font-weight: 600;
    letter-spacing: 0;
    margin-left: 6px;
  }
  .price-box__sub {
    font-size: 12px;
    color: #4a6b50;
    margin-top: 8px;
  }

  /* ── FEATURE LIST ─────────────────────────────────────────────────────── */
  .feature-list {
    list-style: none;
    margin-bottom: 24px;
  }
  .feature-list__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid rgba(26,46,30,.7);
  }
  .feature-list__item:last-child { border-bottom: none; }
  .feature-list__icon { font-size: 15px; flex-shrink: 0; }
  .feature-list__label { font-size: 13.5px; color: #b2cfb8; flex: 1; }
  .feature-list__check { color: #00ff87; font-size: 12px; margin-left: auto; }

  /* ── WAVE BUTTON ──────────────────────────────────────────────────────── */
  .btn-wave {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    padding: 16px 0;
    background: linear-gradient(135deg, #1e90e6, #0070cc);
    color: #fff;
    font-weight: 700;
    font-size: 15.5px;
    border-radius: 14px;
    border: none;
    cursor: pointer;
    box-shadow: 0 8px 28px rgba(30,144,230,.35);
    transition: transform .18s, box-shadow .18s;
    font-family: inherit;
  }
  .btn-wave:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 40px rgba(30,144,230,.45);
  }
  .btn-wave:active { transform: translateY(0); }

  /* ── INFO BOX ─────────────────────────────────────────────────────────── */
  .info-box {
    border-radius: 12px;
    padding: 14px 16px;
    margin-top: 20px;
    font-size: 12.5px;
    line-height: 1.7;
  }
  .info-box--green {
    background: rgba(0,255,135,.04);
    border: 1px solid rgba(0,255,135,.1);
    color: #6b8a71;
  }
  .info-box--blue {
    background: rgba(30,144,230,.06);
    border: 1px solid rgba(30,144,230,.15);
    color: #7ab8e8;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    margin-top: 0;
    margin-bottom: 22px;
  }
  .info-box--purple {
    background: rgba(139,92,246,.05);
    border: 1px solid rgba(139,92,246,.12);
    color: #9b84e8;
    margin-top: 0;
  }
  .info-box__heading {
    display: block;
    color: #b2cfb8;
    margin-bottom: 4px;
  }
  .info-box__steps {
    padding-left: 16px;
  }
  .info-box__steps li { margin-top: 2px; }
  .info-box__icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
  .code-format {
    color: #a8d4f0;
    font-family: monospace;
    letter-spacing: .5px;
  }

  /* ── FIELD ────────────────────────────────────────────────────────────── */
  .field { margin-bottom: 14px; }
  .field__label {
    display: block;
    font-size: 11px;
    font-weight: 700;
    color: #6b8a71;
    letter-spacing: .6px;
    margin-bottom: 8px;
  }
  .field__input {
    display: block;
    width: 100%;
    height: 52px;
    background: #0a1610;
    border: 1.5px solid #1a2e1e;
    border-radius: 12px;
    padding: 0 16px;
    color: #e8f5e9;
    font-size: 15px;
    font-family: 'DM Mono', monospace;
    letter-spacing: 1.5px;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .field__input:focus {
    border-color: rgba(0,255,135,.45);
    box-shadow: 0 0 0 3px rgba(0,255,135,.07);
  }
  .field__input--error {
    border-color: rgba(239,68,68,.55) !important;
    box-shadow: 0 0 0 3px rgba(239,68,68,.07);
  }
  .field__input::placeholder { color: #2e4733; letter-spacing: 1px; }

  /* ── ERROR BOX ────────────────────────────────────────────────────────── */
  .error-box {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: rgba(239,68,68,.08);
    border: 1px solid rgba(239,68,68,.2);
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-size: 13px;
    color: #f87171;
    line-height: 1.5;
  }

  /* ── VERIFY BUTTON ────────────────────────────────────────────────────── */
  .btn-verify {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 52px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, #00ff87, #00c96b);
    color: #060e09;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 6px 24px rgba(0,255,135,.3);
    transition: transform .18s, box-shadow .18s;
    margin-bottom: 16px;
  }
  .btn-verify:hover:not(.btn-verify--disabled) {
    transform: translateY(-2px);
    box-shadow: 0 10px 32px rgba(0,255,135,.4);
  }
  .btn-verify--disabled {
    background: #1a2e1e;
    color: #6b8a71;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* ── BACK CONTROLS ────────────────────────────────────────────────────── */
  .back-link {
    display: block;
    text-align: center;
    margin-top: 18px;
    font-size: 13px;
    color: #4a6b50;
    text-decoration: none;
    transition: color .2s;
  }
  .back-link:hover { color: #6b8a71; }

  .back-btn {
    background: none;
    border: none;
    color: #6b8a71;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: color .2s;
  }
  .back-btn:hover { color: #b2cfb8; }

  /* ── SUCCESS ──────────────────────────────────────────────────────────── */
  .success-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    text-align: center;
  }
  .success-icon {
    width: 80px; height: 80px;
    border-radius: 50%;
    background: linear-gradient(135deg, #00ff87, #00c96b);
    display: flex; align-items: center; justify-content: center;
    font-size: 34px;
    box-shadow:
      0 0 0 16px rgba(0,255,135,.07),
      0 10px 40px rgba(0,255,135,.35);
    animation: successPop .5s cubic-bezier(.22,.68,0,1.2) forwards;
    margin-bottom: 22px;
  }
  .success-title {
    font-size: 28px;
    font-weight: 800;
    color: #00ff87;
    letter-spacing: -0.5px;
    margin-bottom: 10px;
  }
  .success-sub {
    font-size: 14.5px;
    color: #b2cfb8;
    line-height: 1.75;
    margin-bottom: 28px;
  }
  .success-features {
    list-style: none;
    width: 100%;
    background: rgba(0,255,135,.04);
    border: 1px solid rgba(0,255,135,.13);
    border-radius: 14px;
    padding: 14px 18px;
    margin-bottom: 26px;
    text-align: left;
  }
  .success-features__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid rgba(0,255,135,.07);
    font-size: 13.5px;
    color: #b2cfb8;
  }
  .success-features__item:last-child { border-bottom: none; }
  .success-features__check { color: #00ff87; font-size: 13px; flex-shrink: 0; }

  /* ── CTAs ─────────────────────────────────────────────────────────────── */
  .cta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 16px 0;
    border-radius: 14px;
    font-weight: 700;
    font-size: 15.5px;
    text-decoration: none;
    transition: transform .18s, box-shadow .18s;
  }
  .cta:hover { transform: translateY(-2px); }
  .cta--green {
    background: linear-gradient(135deg, #00ff87, #00c96b);
    color: #060e09;
    box-shadow: 0 8px 28px rgba(0,255,135,.3);
  }
  .cta--purple {
    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
    color: #fff;
    box-shadow: 0 8px 28px rgba(139,92,246,.35);
  }

  /* ── AUTH GATE ────────────────────────────────────────────────────────── */
  .auth-gate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    max-width: 340px;
    text-align: center;
  }
  .auth-gate__icon { font-size: 52px; }
  .auth-gate__title {
    font-size: 20px;
    font-weight: 800;
    color: #e8f5e9;
  }
  .auth-gate__body {
    font-size: 14px;
    color: #6b8a71;
    line-height: 1.65;
    max-width: 280px;
  }

  /* ── SPINNER ──────────────────────────────────────────────────────────── */
  .spinner {
    width: 44px; height: 44px;
    border-radius: 50%;
    border: 3px solid #00ff87;
    border-top-color: transparent;
    animation: spin .8s linear infinite;
  }

  /* ── FOOTER ───────────────────────────────────────────────────────────── */
  .unlock-footer {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #2d4a32;
  }

  /* ── ANIMATIONS ───────────────────────────────────────────────────────── */
  @keyframes successPop {
    from { transform: scale(.6); opacity: 0; }
    to   { transform: scale(1);  opacity: 1; }
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── RESPONSIVE ───────────────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .card-body { padding: 24px 20px 32px; }
    .step-header__title { font-size: 22px; }
    .price-box__amount { font-size: 38px; }
    .steps-nav { padding: 16px 20px 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .success-icon { animation: none; }
    .spinner { animation: none; border-color: #00ff87; }
    .btn-wave, .btn-verify, .cta { transition: none; }
  }
`},48148:(e,a,t)=>{Promise.resolve().then(t.bind(t,34908))},58788:(e,a,t)=>{"use strict";t.d(a,{uo:()=>s});var r=t(77805);t(59458);let s=(0,r.F3)("FirebaseAuthentication",{web:()=>t.e(9206).then(t.bind(t,99206)).then(e=>new e.FirebaseAuthenticationWeb)})},59458:(e,a,t)=>{"use strict";var r,s,i,n;t.d(a,{N:()=>s,y:()=>r}),(i=r||(r={})).IndexedDbLocal="INDEXED_DB_LOCAL",i.InMemory="IN_MEMORY",i.BrowserLocal="BROWSER_LOCAL",i.BrowserSession="BROWSER_SESSION",(n=s||(s={})).APPLE="apple.com",n.FACEBOOK="facebook.com",n.GAME_CENTER="gc.apple.com",n.GITHUB="github.com",n.GOOGLE="google.com",n.MICROSOFT="microsoft.com",n.PLAY_GAMES="playgames.google.com",n.TWITTER="twitter.com",n.YAHOO="yahoo.com",n.PASSWORD="password",n.PHONE="phone"}},e=>{e.O(0,[5226,5863,2301,7805,9804,8500,4894,5390,8441,3794,7358],()=>e(e.s=48148)),_N_E=e.O()}]);