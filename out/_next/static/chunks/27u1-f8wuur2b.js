(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,18581,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return n}});let a=e.r(71645);function n(e,t){let r=(0,a.useRef)(null),n=(0,a.useRef)(null);return(0,a.useCallback)(a=>{if(null===a){let e=r.current;e&&(r.current=null,e());let t=n.current;t&&(n.current=null,t())}else e&&(r.current=o(e,a)),t&&(n.current=o(t,a))},[e,t])}function o(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},95057,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0});var a={formatUrl:function(){return s},formatWithValidation:function(){return c},urlObjectKeys:function(){return l}};for(var n in a)Object.defineProperty(r,n,{enumerable:!0,get:a[n]});let o=e.r(90809)._(e.r(98183)),i=/https?|ftp|gopher|file/;function s(e){let{auth:t,hostname:r}=e,a=e.protocol||"",n=e.pathname||"",s=e.hash||"",l=e.query||"",c=!1;t=t?encodeURIComponent(t).replace(/%3A/i,":")+"@":"",e.host?c=t+e.host:r&&(c=t+(~r.indexOf(":")?`[${r}]`:r),e.port&&(c+=":"+e.port)),l&&"object"==typeof l&&(l=String(o.urlQueryToSearchParams(l)));let d=e.search||l&&`?${l}`||"";return a&&!a.endsWith(":")&&(a+=":"),e.slashes||(!a||i.test(a))&&!1!==c?(c="//"+(c||""),n&&"/"!==n[0]&&(n="/"+n)):c||(c=""),s&&"#"!==s[0]&&(s="#"+s),d&&"?"!==d[0]&&(d="?"+d),n=n.replace(/[?#]/g,encodeURIComponent),d=d.replace("#","%23"),`${a}${c}${n}${d}${s}`}let l=["auth","hash","host","hostname","href","path","pathname","port","protocol","query","search","slashes"];function c(e){return s(e)}},73668,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"isLocalURL",{enumerable:!0,get:function(){return o}});let a=e.r(18967),n=e.r(52817);function o(e){if(!(0,a.isAbsoluteUrl)(e))return!0;try{let t=(0,a.getLocationOrigin)(),r=new URL(e,t);return r.origin===t&&(0,n.hasBasePath)(r.pathname)}catch(e){return!1}}},84508,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"errorOnce",{enumerable:!0,get:function(){return a}});let a=e=>{}},22016,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0});var a={default:function(){return g},useLinkStatus:function(){return v}};for(var n in a)Object.defineProperty(r,n,{enumerable:!0,get:a[n]});let o=e.r(90809),i=e.r(43476),s=o._(e.r(71645)),l=e.r(95057),c=e.r(8372),d=e.r(18581),p=e.r(18967),u=e.r(5550);e.r(33525);let f=e.r(88540),x=e.r(91949),b=e.r(73668),h=e.r(9396);function g(t){var r,a;let n,o,g,[v,y]=(0,s.useOptimistic)(x.IDLE_LINK_STATUS),_=(0,s.useRef)(null),{href:j,as:w,children:k,prefetch:N=null,passHref:A,replace:z,shallow:S,scroll:C,onClick:E,onMouseEnter:T,onTouchStart:R,legacyBehavior:P=!1,onNavigate:O,transitionTypes:I,ref:D,unstable_dynamicOnHover:M,...U}=t;n=k,P&&("string"==typeof n||"number"==typeof n)&&(n=(0,i.jsx)("a",{children:n}));let L=s.default.useContext(c.AppRouterContext),F=!1!==N,B=!1!==N?null===(a=N)||"auto"===a?h.FetchStrategy.PPR:h.FetchStrategy.Full:h.FetchStrategy.PPR,$="string"==typeof(r=w||j)?r:(0,l.formatUrl)(r);if(P){if(n?.$$typeof===Symbol.for("react.lazy"))throw Object.defineProperty(Error("`<Link legacyBehavior>` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's `<a>` tag."),"__NEXT_ERROR_CODE",{value:"E863",enumerable:!1,configurable:!0});o=s.default.Children.only(n)}let V=P?o&&"object"==typeof o&&o.ref:D,X=s.default.useCallback(e=>(null!==L&&(_.current=(0,x.mountLinkInstance)(e,$,L,B,F,y)),()=>{_.current&&((0,x.unmountLinkForCurrentNavigation)(_.current),_.current=null),(0,x.unmountPrefetchableInstance)(e)}),[F,$,L,B,y]),W={ref:(0,d.useMergedRef)(X,V),onClick(t){P||"function"!=typeof E||E(t),P&&o.props&&"function"==typeof o.props.onClick&&o.props.onClick(t),!L||t.defaultPrevented||function(t,r,a,n,o,i,l){if("u">typeof window){let c,{nodeName:d}=t.currentTarget;if("A"===d.toUpperCase()&&((c=t.currentTarget.getAttribute("target"))&&"_self"!==c||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey||t.nativeEvent&&2===t.nativeEvent.which)||t.currentTarget.hasAttribute("download"))return;if(!(0,b.isLocalURL)(r)){n&&(t.preventDefault(),location.replace(r));return}if(t.preventDefault(),i){let e=!1;if(i({preventDefault:()=>{e=!0}}),e)return}let{dispatchNavigateAction:p}=e.r(99781);s.default.startTransition(()=>{p(r,n?"replace":"push",!1===o?f.ScrollBehavior.NoScroll:f.ScrollBehavior.Default,a.current,l)})}}(t,$,_,z,C,O,I)},onMouseEnter(e){P||"function"!=typeof T||T(e),P&&o.props&&"function"==typeof o.props.onMouseEnter&&o.props.onMouseEnter(e),L&&F&&(0,x.onNavigationIntent)(e.currentTarget,!0===M)},onTouchStart:function(e){P||"function"!=typeof R||R(e),P&&o.props&&"function"==typeof o.props.onTouchStart&&o.props.onTouchStart(e),L&&F&&(0,x.onNavigationIntent)(e.currentTarget,!0===M)}};return(0,p.isAbsoluteUrl)($)?W.href=$:P&&!A&&("a"!==o.type||"href"in o.props)||(W.href=(0,u.addBasePath)($)),g=P?s.default.cloneElement(o,W):(0,i.jsx)("a",{...U,...W,children:n}),(0,i.jsx)(m.Provider,{value:v,children:g})}e.r(84508);let m=(0,s.createContext)(x.IDLE_LINK_STATUS),v=()=>(0,s.useContext)(m);("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},10013,e=>{"use strict";var t=e.i(43476),r=e.i(71645),a=e.i(22016),n=e.i(57951);e.i(36180);var o=e.i(17689),i=e.i(63802),s=e.i(51400),l=e.i(36393);async function c(t){if(!l.db)return{valid:!1,days:0,reason:"db_unavailable"};try{let{doc:r,getDoc:a}=await e.A(27510),n=await a(r(l.db,"accessCodes",t));if(!n.exists())return{valid:!1,days:0,reason:"not_found"};let o=n.data();if(o.used)return{valid:!1,days:0,reason:"already_used"};if(o.expiresAt&&o.expiresAt.toDate()<new Date)return{valid:!1,days:0,reason:"expired"};return{valid:!0,days:o.days??30}}catch(e){return console.error("verifyCodeFirestore:",e),{valid:!1,days:0,reason:"error"}}}async function d(t,r){if(l.db)try{let{doc:a,updateDoc:n,Timestamp:o}=await e.A(27510);await n(a(l.db,"accessCodes",t),{used:!0,usedBy:r,usedAt:o.now()})}catch(e){console.error("markCodeUsed:",e)}}async function p(e,t){if(!l.db)return;let r=new Date;r.setDate(r.getDate()+t),await (0,i.setDoc)((0,o.doc)(l.db,"users",e),{hasAIAccess:!0,aiExpiryDate:s.Timestamp.fromDate(r),aiUnlockedAt:s.Timestamp.now(),aiTokensUsed:0,aiTokensLimit:5e5,aiAlertSent:!1,aiLastUsageAt:null},{merge:!0}),localStorage.setItem("ai_user_id",e),localStorage.setItem("ai_code_expiry",r.getTime().toString()),localStorage.setItem("ai_tokens_limit","500000")}let u={not_found:"Code introuvable. Vérifiez le code reçu ou contactez-nous.",already_used:"Ce code a déjà été utilisé. Contactez-nous si c'est une erreur.",expired:"Ce code a expiré. Contactez-nous pour en obtenir un nouveau.",db_unavailable:"Service temporairement indisponible. Réessayez dans un instant.",error:"Erreur de vérification. Vérifiez votre connexion et réessayez."},f=[{icon:"🌤️",label:"Météo temps réel par région"},{icon:"💰",label:"Simulation financement & crédit"},{icon:"🛒",label:"Prix live depuis le catalogue"},{icon:"🌱",label:"Conseils agronomiques IA"},{icon:"📈",label:"Prévisions de marché"},{icon:"🎙️",label:"Reconnaissance vocale"},{icon:"📊",label:`${5e5.toLocaleString()} tokens inclus`}],x=["Assistant IA DeepSeek débloqué","Météo temps réel par région","Simulation financement","Conseils agronomiques personnalisés",`${5e5.toLocaleString()} tokens inclus (500k)`];function b(){return(0,t.jsx)("div",{className:"spinner"})}function h(){return(0,t.jsxs)("svg",{width:"22",height:"22",viewBox:"0 0 32 32",fill:"none","aria-hidden":"true",children:[(0,t.jsx)("circle",{cx:"16",cy:"16",r:"16",fill:"#fff"}),(0,t.jsx)("path",{d:"M8 16c0-4.4 3.6-8 8-8s8 3.6 8 8",stroke:"#1e90e6",strokeWidth:"2.5",strokeLinecap:"round"}),(0,t.jsx)("path",{d:"M10.5 18.5c0-3 2.5-5.5 5.5-5.5s5.5 2.5 5.5 5.5",stroke:"#1e90e6",strokeWidth:"2",strokeLinecap:"round"}),(0,t.jsx)("circle",{cx:"16",cy:"20",r:"2",fill:"#1e90e6"})]})}let g=`
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
`;e.s(["default",0,function(){let{user:e,loading:s}=(0,n.useAuth)(),[m,v]=(0,r.useState)("pay"),[y,_]=(0,r.useState)(""),[j,w]=(0,r.useState)(""),[k,N]=(0,r.useState)(!1),[A,z]=(0,r.useState)(0),[S,C]=(0,r.useState)(!1),[E,T]=(0,r.useState)(30),R=(0,r.useRef)(null);(0,r.useEffect)(()=>{C(!0)},[]),(0,r.useEffect)(()=>{S&&!s&&e?.uid&&l.db&&(async()=>{try{let t=(await (0,i.getDoc)((0,o.doc)(l.db,"users",e.uid))).data();if(t?.hasAIAccess&&t?.aiExpiryDate){let e=t.aiExpiryDate.toDate?.()||new Date(t.aiExpiryDate);e>new Date&&(v("success"),T(Math.ceil((e.getTime()-Date.now())/864e5)))}}catch{}})()},[S,s,e]),(0,r.useEffect)(()=>()=>{R.current&&clearInterval(R.current)},[]);let P=async()=>{let t=y.trim().toUpperCase();if(!t)return void w("Veuillez entrer votre code de confirmation.");if(!e?.uid)return void w("Vous devez être connecté pour activer l'accès.");N(!0),w("");try{let{valid:r,days:a,reason:n}=await c(t);if(r){await p(e.uid,a),await d(t,e.uid),T(a),v("success");return}w(u[n??"error"]??u.error)}catch(e){console.error("handleVerify:",e),w("Erreur inattendue. Réessayez dans un instant.")}finally{N(!1)}};return!S||s?(0,t.jsxs)("div",{className:"unlock-root",children:[(0,t.jsx)(b,{}),(0,t.jsx)("style",{children:g})]}):e?(0,t.jsxs)("div",{className:"unlock-root",children:[(0,t.jsx)("div",{className:"ambient-glow"}),(0,t.jsxs)("div",{className:"card-wrap",children:[(0,t.jsx)("div",{className:`progress-bar progress-bar--${m}`}),(0,t.jsxs)("div",{className:"steps-nav",children:[["pay","code","success"].map((e,r)=>(0,t.jsx)("div",{className:`step-dot ${m===e?"step-dot--active":""} ${"code"===m&&0===r||"success"===m?"step-dot--done":""}`,children:(0,t.jsx)("span",{className:"step-dot__num",children:r+1})},e)),(0,t.jsx)("div",{className:"steps-nav__line"})]}),(0,t.jsxs)("div",{className:"card-body",children:["pay"===m&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{className:"step-header",children:[(0,t.jsx)("div",{className:"avatar avatar--gradient-purple",children:"🤖"}),(0,t.jsx)("h1",{className:"step-header__title",children:"IA Premium"}),(0,t.jsx)("p",{className:"step-header__sub",children:"Assistant IA AgriMarché propulsé par DeepSeek — conseils, météo, financement, marché."})]}),(0,t.jsxs)("div",{className:"price-box",children:[(0,t.jsx)("div",{className:"price-box__label",children:"Accès 30 jours"}),(0,t.jsxs)("div",{className:"price-box__amount",children:["690 ",(0,t.jsx)("span",{className:"price-box__currency",children:"FCFA"})]}),(0,t.jsx)("div",{className:"price-box__sub",children:"Paiement sécurisé via Wave"})]}),(0,t.jsx)("ul",{className:"feature-list",children:f.map(({icon:e,label:r})=>(0,t.jsxs)("li",{className:"feature-list__item",children:[(0,t.jsx)("span",{className:"feature-list__icon",children:e}),(0,t.jsx)("span",{className:"feature-list__label",children:r}),(0,t.jsx)("span",{className:"feature-list__check",children:"✓"})]},r))}),(0,t.jsxs)("button",{className:"btn-wave",onClick:()=>{v("code"),z(5),R.current=setInterval(()=>{z(e=>e<=1?(R.current&&clearInterval(R.current),0):e-1)},1e3),window.open("https://pay.wave.com/m/M_sn_G4vyn-BvhQxV/c/sn/","_blank")},children:[(0,t.jsx)(h,{}),"Payer 690 FCFA avec Wave"]}),(0,t.jsxs)("div",{className:"info-box info-box--green",children:[(0,t.jsx)("strong",{className:"info-box__heading",children:"Comment ça marche :"}),(0,t.jsxs)("ol",{className:"info-box__steps",children:[(0,t.jsx)("li",{children:'Cliquez sur "Payer avec Wave" ci-dessus'}),(0,t.jsx)("li",{children:"Effectuez le paiement de 690 FCFA"}),(0,t.jsx)("li",{children:"Nous vous envoyons un code d'activation"}),(0,t.jsx)("li",{children:"Revenez ici et entrez ce code pour débloquer l'IA"})]})]}),(0,t.jsx)(a.default,{href:"/main",className:"back-link",children:"← Retour à l'accueil"})]}),"code"===m&&(0,t.jsxs)(t.Fragment,{children:[(0,t.jsxs)("div",{className:"step-header",children:[(0,t.jsx)("div",{className:"avatar avatar--gradient-blue",children:"📩"}),(0,t.jsx)("h2",{className:"step-header__title",children:"Entrez votre code"}),(0,t.jsx)("p",{className:"step-header__sub",children:"Entrez le code d'activation reçu après votre paiement Wave."})]}),(0,t.jsxs)("div",{className:"info-box info-box--blue",children:[(0,t.jsx)("span",{className:"info-box__icon",children:"💡"}),(0,t.jsxs)("p",{children:["Nous vous envoyons votre code par SMS ou WhatsApp."," ","Format : ",(0,t.jsx)("strong",{className:"code-format",children:"AGRI-XXXXXXXX"})]})]}),(0,t.jsxs)("div",{className:"field",children:[(0,t.jsx)("label",{className:"field__label",children:"CODE D'ACTIVATION"}),(0,t.jsx)("input",{className:`field__input ${j?"field__input--error":""}`,type:"text",value:y,onChange:e=>{_(e.target.value.toUpperCase()),w("")},onKeyDown:e=>"Enter"===e.key&&!k&&0===A&&P(),placeholder:"Ex : AGRI-A1B2C3D4",autoFocus:!0})]}),j&&(0,t.jsxs)("div",{className:"error-box",children:[(0,t.jsx)("span",{children:"⚠️"}),(0,t.jsx)("span",{children:j})]}),(0,t.jsx)("button",{className:`btn-verify ${k||A>0||!y.trim()?"btn-verify--disabled":""}`,onClick:P,disabled:k||A>0||!y.trim(),children:k?"⏳ Vérification…":A>0?`Patienter ${A}s…`:"✓ Activer l'accès IA"}),(0,t.jsxs)("div",{className:"info-box info-box--purple",style:{textAlign:"center"},children:["Vous n'avez pas reçu votre code ?",(0,t.jsx)("br",{}),(0,t.jsx)("strong",{style:{color:"#b8a4f0"},children:"Contactez-nous sur WhatsApp"})," en indiquant votre numéro Wave."]}),(0,t.jsx)("div",{style:{display:"flex",justifyContent:"center",marginTop:4},children:(0,t.jsx)("button",{className:"back-btn",onClick:()=>{v("pay"),_(""),w("")},children:"← Retour au paiement"})})]}),"success"===m&&(0,t.jsxs)("div",{className:"success-wrap",children:[(0,t.jsx)("div",{className:"success-icon",children:"✅"}),(0,t.jsx)("h2",{className:"success-title",children:"Accès activé !"}),(0,t.jsxs)("p",{className:"success-sub",children:["Bienvenue dans l'IA Premium AgriMarché.",(0,t.jsx)("br",{}),"Votre accès est valide"," ",(0,t.jsxs)("strong",{style:{color:"#e8f5e9"},children:[E," jours"]}),"."]}),(0,t.jsx)("ul",{className:"success-features",children:x.map(e=>(0,t.jsxs)("li",{className:"success-features__item",children:[(0,t.jsx)("span",{className:"success-features__check",children:"✓"}),e]},e))}),(0,t.jsx)(a.default,{href:"/main/ai-assistant",className:"cta cta--purple",children:"🤖 Accéder à l'IA Premium"}),(0,t.jsx)(a.default,{href:"/main",className:"back-link",style:{marginTop:14},children:"Retour à l'accueil"})]})]})]}),(0,t.jsxs)("footer",{className:"unlock-footer",children:[(0,t.jsx)("span",{children:"🔒"}),(0,t.jsx)("span",{children:"Paiement sécurisé · Données chiffrées · AgriMarché Sénégal"})]}),(0,t.jsx)("style",{children:g})]}):(0,t.jsxs)("div",{className:"unlock-root",children:[(0,t.jsxs)("div",{className:"auth-gate",children:[(0,t.jsx)("span",{className:"auth-gate__icon",children:"🔐"}),(0,t.jsx)("p",{className:"auth-gate__title",children:"Connexion requise"}),(0,t.jsx)("p",{className:"auth-gate__body",children:"Connectez-vous pour débloquer l'accès IA Premium AgriMarché."}),(0,t.jsx)(a.default,{href:"/auth/login",className:"cta cta--green",children:"Se connecter"})]}),(0,t.jsx)("style",{children:g})]})}])},27510,e=>{e.v(t=>Promise.all(["static/chunks/327tupnqz1x7w.js"].map(t=>e.l(t))).then(()=>t(48323)))}]);