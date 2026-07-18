(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,18581,(e,r,t)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"useMergedRef",{enumerable:!0,get:function(){return n}});let a=e.r(71645);function n(e,r){let t=(0,a.useRef)(null),n=(0,a.useRef)(null);return(0,a.useCallback)(a=>{if(null===a){let e=t.current;e&&(t.current=null,e());let r=n.current;r&&(n.current=null,r())}else e&&(t.current=i(e,a)),r&&(n.current=i(r,a))},[e,r])}function i(e,r){if("function"!=typeof e)return e.current=r,()=>{e.current=null};{let t=e(r);return"function"==typeof t?t:()=>e(null)}}("function"==typeof t.default||"object"==typeof t.default&&null!==t.default)&&void 0===t.default.__esModule&&(Object.defineProperty(t.default,"__esModule",{value:!0}),Object.assign(t.default,t),r.exports=t.default)},95057,(e,r,t)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0});var a={formatUrl:function(){return o},formatWithValidation:function(){return c},urlObjectKeys:function(){return l}};for(var n in a)Object.defineProperty(t,n,{enumerable:!0,get:a[n]});let i=e.r(90809)._(e.r(98183)),s=/https?|ftp|gopher|file/;function o(e){let{auth:r,hostname:t}=e,a=e.protocol||"",n=e.pathname||"",o=e.hash||"",l=e.query||"",c=!1;r=r?encodeURIComponent(r).replace(/%3A/i,":")+"@":"",e.host?c=r+e.host:t&&(c=r+(~t.indexOf(":")?`[${t}]`:t),e.port&&(c+=":"+e.port)),l&&"object"==typeof l&&(l=String(i.urlQueryToSearchParams(l)));let d=e.search||l&&`?${l}`||"";return a&&!a.endsWith(":")&&(a+=":"),e.slashes||(!a||s.test(a))&&!1!==c?(c="//"+(c||""),n&&"/"!==n[0]&&(n="/"+n)):c||(c=""),o&&"#"!==o[0]&&(o="#"+o),d&&"?"!==d[0]&&(d="?"+d),n=n.replace(/[?#]/g,encodeURIComponent),d=d.replace("#","%23"),`${a}${c}${n}${d}${o}`}let l=["auth","hash","host","hostname","href","path","pathname","port","protocol","query","search","slashes"];function c(e){return o(e)}},73668,(e,r,t)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"isLocalURL",{enumerable:!0,get:function(){return i}});let a=e.r(18967),n=e.r(52817);function i(e){if(!(0,a.isAbsoluteUrl)(e))return!0;try{let r=(0,a.getLocationOrigin)(),t=new URL(e,r);return t.origin===r&&(0,n.hasBasePath)(t.pathname)}catch(e){return!1}}},84508,(e,r,t)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0}),Object.defineProperty(t,"errorOnce",{enumerable:!0,get:function(){return a}});let a=e=>{}},22016,(e,r,t)=>{"use strict";Object.defineProperty(t,"__esModule",{value:!0});var a={default:function(){return f},useLinkStatus:function(){return v}};for(var n in a)Object.defineProperty(t,n,{enumerable:!0,get:a[n]});let i=e.r(90809),s=e.r(43476),o=i._(e.r(71645)),l=e.r(95057),c=e.r(8372),d=e.r(18581),u=e.r(18967),p=e.r(5550);e.r(33525);let x=e.r(88540),m=e.r(91949),g=e.r(73668),b=e.r(9396);function f(r){var t,a;let n,i,f,[v,k]=(0,o.useOptimistic)(m.IDLE_LINK_STATUS),y=(0,o.useRef)(null),{href:w,as:A,children:j,prefetch:_=null,passHref:C,replace:N,shallow:S,scroll:F,onClick:I,onMouseEnter:D,onTouchStart:E,legacyBehavior:$=!1,onNavigate:P,transitionTypes:M,ref:R,unstable_dynamicOnHover:T,...z}=r;n=j,$&&("string"==typeof n||"number"==typeof n)&&(n=(0,s.jsx)("a",{children:n}));let q=o.default.useContext(c.AppRouterContext),L=!1!==_,O=!1!==_?null===(a=_)||"auto"===a?b.FetchStrategy.PPR:b.FetchStrategy.Full:b.FetchStrategy.PPR,U="string"==typeof(t=A||w)?t:(0,l.formatUrl)(t);if($){if(n?.$$typeof===Symbol.for("react.lazy"))throw Object.defineProperty(Error("`<Link legacyBehavior>` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's `<a>` tag."),"__NEXT_ERROR_CODE",{value:"E863",enumerable:!1,configurable:!0});i=o.default.Children.only(n)}let K=$?i&&"object"==typeof i&&i.ref:R,B=o.default.useCallback(e=>(null!==q&&(y.current=(0,m.mountLinkInstance)(e,U,q,O,L,k)),()=>{y.current&&((0,m.unmountLinkForCurrentNavigation)(y.current),y.current=null),(0,m.unmountPrefetchableInstance)(e)}),[L,U,q,O,k]),Y={ref:(0,d.useMergedRef)(B,K),onClick(r){$||"function"!=typeof I||I(r),$&&i.props&&"function"==typeof i.props.onClick&&i.props.onClick(r),!q||r.defaultPrevented||function(r,t,a,n,i,s,l){if("u">typeof window){let c,{nodeName:d}=r.currentTarget;if("A"===d.toUpperCase()&&((c=r.currentTarget.getAttribute("target"))&&"_self"!==c||r.metaKey||r.ctrlKey||r.shiftKey||r.altKey||r.nativeEvent&&2===r.nativeEvent.which)||r.currentTarget.hasAttribute("download"))return;if(!(0,g.isLocalURL)(t)){n&&(r.preventDefault(),location.replace(t));return}if(r.preventDefault(),s){let e=!1;if(s({preventDefault:()=>{e=!0}}),e)return}let{dispatchNavigateAction:u}=e.r(99781);o.default.startTransition(()=>{u(t,n?"replace":"push",!1===i?x.ScrollBehavior.NoScroll:x.ScrollBehavior.Default,a.current,l)})}}(r,U,y,N,F,P,M)},onMouseEnter(e){$||"function"!=typeof D||D(e),$&&i.props&&"function"==typeof i.props.onMouseEnter&&i.props.onMouseEnter(e),q&&L&&(0,m.onNavigationIntent)(e.currentTarget,!0===T)},onTouchStart:function(e){$||"function"!=typeof E||E(e),$&&i.props&&"function"==typeof i.props.onTouchStart&&i.props.onTouchStart(e),q&&L&&(0,m.onNavigationIntent)(e.currentTarget,!0===T)}};return(0,u.isAbsoluteUrl)(U)?Y.href=U:$&&!C&&("a"!==i.type||"href"in i.props)||(Y.href=(0,p.addBasePath)(U)),f=$?o.default.cloneElement(i,Y):(0,s.jsx)("a",{...z,...Y,children:n}),(0,s.jsx)(h.Provider,{value:v,children:f})}e.r(84508);let h=(0,o.createContext)(m.IDLE_LINK_STATUS),v=()=>(0,o.useContext)(h);("function"==typeof t.default||"object"==typeof t.default&&null!==t.default)&&void 0===t.default.__esModule&&(Object.defineProperty(t.default,"__esModule",{value:!0}),Object.assign(t.default,t),r.exports=t.default)},53956,e=>{"use strict";e.s(["apiUrl",0,function(e){let r,t=e.startsWith("/")?e:`/${e}`;return"localhost"===(r=window.location.hostname)||"127.0.0.1"===r?t:`https://agrimarche-ultra-v1.vercel.app${t}`}])},82412,e=>{"use strict";var r=e.i(43476),t=e.i(71645),a=e.i(22016),n=e.i(57951),i=e.i(36393),s=e.i(53956);e.i(36180);var o=e.i(28719),l=e.i(63802),c=e.i(51400),d=e.i(17689),u=e.i(73148);async function p(e){if(i.db)try{let r=(await (0,l.getDoc)((0,d.doc)(i.db,"users",e))).data();if(r?.hasAIAccess&&r?.aiExpiryDate&&(r.aiExpiryDate.toDate?.()||new Date(r.aiExpiryDate))>new Date)return!0}catch(e){console.error("checkAIAccess Firestore:",e)}try{let r=localStorage.getItem("ai_user_id"),t=localStorage.getItem("ai_code_expiry");if(r===e&&t&&Date.now()<parseInt(t,10))return!0}catch{}return!1}async function x(e){if(!i.db)return{used:0,limit:5e5,percentage:0};try{let r=await (0,l.getDoc)((0,d.doc)(i.db,"users",e)),t=r.data()?.aiTokensUsed??0;return{used:t,limit:5e5,percentage:t/5e5*100}}catch{return{used:0,limit:5e5,percentage:0}}}async function m(e,r){if(!i.db||!e)return!1;try{let t=(0,d.doc)(i.db,"users",e);await (0,l.updateDoc)(t,{aiTokensUsed:(0,u.increment)(r),aiLastUsageAt:c.Timestamp.now()});let a=(await (0,l.getDoc)(t)).data();if((a?.aiTokensUsed??0)/5e5>=.8&&!a?.aiAlertSent)return await (0,l.updateDoc)(t,{aiAlertSent:!0}),!0;return!1}catch(e){return console.error("trackTokenUsage error:",e),!1}}function g(e){let r=Math.floor(Math.sqrt(e/100)),t=r*r*100,a=(r+1)*(r+1)*100,n=["Semeur","Cultivateur","Agronome","Expert","Légende"],i=["#22c55e","#16a34a","#00ff87","#f59e0b","#8b5cf6"];return{level:r,title:n[Math.min(r,n.length-1)],progress:Math.min(100,(e-t)/(a-t)*100),nextLevelXP:a,color:i[Math.min(r,i.length-1)]}}let b={Dakar:{lat:14.6937,lon:-17.4441},Thiès:{lat:14.791,lon:-16.9359},"Saint-Louis":{lat:16.0179,lon:-16.4896},Kaolack:{lat:14.1652,lon:-16.0757},Ziguinchor:{lat:12.5606,lon:-16.2719},Louga:{lat:15.6173,lon:-16.2248},Diourbel:{lat:14.656,lon:-16.229},Fatick:{lat:14.339,lon:-16.411},Kaffrine:{lat:14.105,lon:-15.55},Kédougou:{lat:12.5567,lon:-12.1747},Kolda:{lat:12.8979,lon:-14.9502},Matam:{lat:15.6559,lon:-13.2552},Sédhiou:{lat:12.708,lon:-15.557},Tambacounda:{lat:13.7707,lon:-13.6673}},f={61:"⚠️ Pluie légère — Bon moment pour l'irrigation naturelle.",63:"⚠️ Pluie modérée — Surveiller le drainage des parcelles.",65:"🚨 Pluie forte — Risque de ruissellement, protéger les semences.",71:"❄️ Neige légère — Inhabituel, surveiller les températures.",80:"⚠️ Averses — Risque de maladies fongiques sur les cultures.",81:"🚨 Fortes averses — Éviter les épandages d'engrais.",95:"🚨 Orage — Rentrer le matériel agricole, ne pas travailler aux champs."};async function h(e){let{lat:r,lon:t}=b[e]??b.Dakar;try{let a=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${r}&longitude=${t}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=Africa/Dakar&forecast_days=7`),n=await a.json(),i=n.current,s=f[i.weather_code]??"",o=n.daily.et0_fao_evapotranspiration?.reduce((e,r)=>e+r,0)??0,l=n.daily.precipitation_sum?.reduce((e,r)=>e+r,0)??0,c=Math.max(0,o-l).toFixed(1);return[`📍 **M\xe9t\xe9o ${e}** : ${Math.round(i.temperature_2m)}\xb0C, ${{0:"Ciel dégagé ☀️",1:"Peu nuageux 🌤️",2:"Partiellement nuageux ⛅",3:"Couvert ☁️",61:"Pluie légère 🌧️",63:"Pluie modérée 🌧️",65:"Pluie forte 🌧️",80:"Averses 🌦️",81:"Fortes averses 🌧️",95:"Orage ⛈️"}[i.weather_code]??"Variable"}, humidit\xe9 ${i.relative_humidity_2m}%, vent ${Math.round(i.wind_speed_10m)} km/h, pluie ${i.precipitation}mm.`,s?`Alerte agricole : ${s}`:"",`Pr\xe9visions 7 jours : max ${Math.round(n.daily.temperature_2m_max[0])}\xb0C / min ${Math.round(n.daily.temperature_2m_min[0])}\xb0C.`,`Bilan hydrique 7j : ETP=${o.toFixed(1)}mm, pluies=${l.toFixed(1)}mm → d\xe9ficit=${c}mm (besoin irrigation estim\xe9).`].filter(Boolean).join("\n")}catch{return`M\xe9t\xe9o ${e}: donn\xe9es temporairement indisponibles.`}}async function v(){try{if(!i.db)throw Error("no db");let e=(await (0,l.getDocs)((0,l.query)((0,o.collection)(i.db,"products"),(0,l.orderBy)("createdAt","desc"),(0,l.limit)(12)))).docs.map(e=>{let r=e.data();return`- ${r.name} (${r.category??"produit"}): ${r.price?.toLocaleString("fr-FR")} FCFA, stock: ${r.stock}${r.region?`, r\xe9gion: ${r.region}`:""}`});if(e.length)return`🛒 **Catalogue AgriMarch\xe9** (${e.length} produits r\xe9cents):
${e.join("\n")}`}catch{}return"🛒 Catalogue : Maïs hybride 25 000 FCFA, Mil certifié 22 000 FCFA, Engrais NPK 35 000 FCFA, Pesticide bio 18 000 FCFA, Semences arachide 30 000 FCFA."}async function k(){if(i.db)try{let e=await (0,l.getDoc)((0,d.doc)(i.db,"market_prices","latest"));if(e.exists()){let r=e.data(),t=r.prices??{},a=r.updatedAt?.toDate?.(),n=a?a.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}):"date inconnue",i=r.source??"AgriMarché",s=r.isSimulated?" *(données indicatives — vérifiez sur le marché local)*":"",o=e=>null!=e?`${Math.round(e).toLocaleString("fr-FR")} FCFA/kg`:"N/D",l=e=>null!=e?`${Math.round(e).toLocaleString("fr-FR")} FCFA/sac 50kg`:"N/D";return`📈 **Prix march\xe9s S\xe9n\xe9gal** — ${i}, mis \xe0 jour le ${n}${s} :
- Ma\xefs : ${o(t.mais_dakar)} (Dakar) \xb7 ${o(t.mais_kaolack)} (Kaolack)
- Mil : ${o(t.mil)} \xb7 Sorgho : ${o(t.sorgho)}
- Arachide coques : ${o(t.arachide)} \xb7 Ni\xe9b\xe9 : ${o(t.niebe)}
- Riz local : ${o(t.riz_local)} \xb7 Riz import\xe9 : ${o(t.riz_importe)}
- Tomate fra\xeeche : ${o(t.tomate)} \xb7 Oignon : ${o(t.oignon)}
- Engrais ur\xe9e : ${l(t.engrais_uree)} \xb7 NPK : ${l(t.engrais_npk)}`}}catch(e){console.warn("fetchMarketPricesContext Firestore:",e)}let e=Math.floor(new Date().getTime()/6048e5)%10,r=r=>Math.round(r+(e-5)*r*.02);return`📈 **Prix march\xe9s S\xe9n\xe9gal** *(donn\xe9es indicatives — v\xe9rifiez sur le march\xe9 local)* :
- Ma\xefs : ${r(175)} FCFA/kg (Dakar) \xb7 ${r(160)} FCFA/kg (Kaolack)
- Mil : ${r(200)} FCFA/kg \xb7 Sorgho : ${r(185)} FCFA/kg
- Arachide coques : ${r(300)} FCFA/kg \xb7 Ni\xe9b\xe9 : ${r(450)} FCFA/kg
- Riz local : ${r(400)} FCFA/kg \xb7 Riz import\xe9 : ${r(550)} FCFA/kg
- Tomate fra\xeeche : ${r(250)} FCFA/kg \xb7 Oignon : ${r(200)} FCFA/kg
- Engrais ur\xe9e 50kg : ${r(18500)} FCFA \xb7 NPK 50kg : ${r(22e3)} FCFA
*(Prix de r\xe9f\xe9rence — pour des donn\xe9es officielles, consultez la DCA ou PRODA)*`}async function y(e,r,t){let a,n=function(e){let r=e.toLowerCase();if(!/météo|temps|pluie|soleil|climat|température|vent|humidité|orage|irrigation|arroser|eau/.test(r))return null;for(let e of Object.keys(b))if(r.includes(e.toLowerCase()))return e;return"Dakar"}(e),i=(a=e.toLowerCase(),{needsWeather:/météo|temps|pluie|soleil|climat|température|vent|humidité|orage|irrigation|arroser|eau|sécheresse/.test(a),needsProducts:/produit|prix|acheter|vendre|semence|engrais|pesticide|maïs|mil|arachide|catalogue|intrant/.test(a),needsMarketPrices:/prix|marché|vente|cours|kg|tonne|coût|tarif|trend|tendance|hausse|baisse|rentable/.test(a),needsLogistics:/livraison|transport|logistique|camion|collecte|expédier|stocker|frigo|entrepôt|route/.test(a),needsCredit:/crédit|prêt|financement|banque|emprunt|remboursement|taux|intérêt|loan|fonds|capital/.test(a),needsInsurance:/assurance|sinistre|couvrir|garantie|récolte|risque|indemnité|sécheresse|inondation/.test(a),needsLossReduction:/perte|gaspillage|stock|conservation|stockage|silo|mauvaise récolte|moisissure|parasite|ravageur/.test(a)}),o=[];i.needsWeather&&n&&o.push(await h(n)),i.needsProducts&&o.push(await v()),i.needsMarketPrices&&o.push(await k());let l=new Date().toLocaleDateString("fr-FR",{weekday:"long",year:"numeric",month:"long",day:"numeric"}),c=`Tu es **Agri**, l'assistant IA officiel d'AgriMarch\xe9 S\xe9n\xe9gal — la plateforme agricole de r\xe9f\xe9rence au S\xe9n\xe9gal.

**Ta mission principale :**
Rendre l'abonnement AgriMarch\xe9 Premium INDISPENSABLE en apportant une valeur concr\xe8te et mesurable aux agriculteurs sur ces 7 piliers :

---

## 1. 📣 PLUS DE CLIENTS
- Conseille l'agriculteur sur comment optimiser ses annonces AgriMarch\xe9 (photos, description, prix comp\xe9titif)
- Indique les p\xe9riodes de forte demande par culture et r\xe9gion
- Sugg\xe8re des cultures \xe0 fort potentiel commercial selon la saison
- Aide \xe0 r\xe9diger des descriptions de produits attractives
- Exemple de formulation : "Pour vendre plus de ma\xefs \xe0 Dakar, postez vos annonces le lundi matin avec photo et indiquez 'r\xe9colte de la semaine'"

## 2. 💰 MEILLEURS PRIX DE VENTE
- Analyse les prix du march\xe9 en temps r\xe9el et indique le MEILLEUR MOMENT pour vendre
- Compare les prix entre r\xe9gions pour sugg\xe9rer o\xf9 vendre (ex: "Le mil se vend 20% plus cher \xe0 Dakar qu'\xe0 Kaolack en ce moment")
- Conseille de ne pas vendre en p\xe9riode de surplus post-r\xe9colte
- Recommande la vente directe B2B pour \xe9viter les interm\xe9diaires
- Donne toujours les prix en FCFA/kg ET FCFA/tonne
- Si les donn\xe9es sont marqu\xe9es "indicatives", pr\xe9cise-le clairement \xe0 l'utilisateur

## 3. 📉 R\xc9DUCTION DES PERTES
- Conseille sur la conservation post-r\xe9colte : silos, sacs herm\xe9tiques, traitement
- Alerte sur les risques selon la m\xe9t\xe9o actuelle (humidit\xe9 → moisissures, etc.)
- Recommande les bonnes pratiques de stockage par culture
- Indique les signes pr\xe9coces de maladies et ravageurs courants au S\xe9n\xe9gal
- Calcule le co\xfbt estim\xe9 des pertes pour motiver l'action

## 4. 🌤️ INFORMATIONS M\xc9T\xc9O AGRICOLES
- Interpr\xe8te la m\xe9t\xe9o en termes agricoles concrets (pas juste la temp\xe9rature)
- Donne des conseils d'action li\xe9s \xe0 la m\xe9t\xe9o : "Avec 65% d'humidit\xe9, traitez contre les champignons maintenant"
- Indique les meilleures dates de semis, d'\xe9pandage, de r\xe9colte selon les pr\xe9visions
- Alerte sur les \xe9v\xe9nements extr\xeames : s\xe9cheresse, exc\xe8s de pluie, orage
- Fournis le bilan hydrique (ETP vs pr\xe9cipitations) quand disponible

## 5. 🚚 LOGISTIQUE
- Explique comment utiliser la livraison AgriMarch\xe9 pour r\xe9duire les co\xfbts de transport
- Conseil sur les regroupements de commandes entre agriculteurs du m\xeame village
- Calcule le co\xfbt logistique estim\xe9 selon la distance et le volume
- Sugg\xe8re les meilleures solutions de transport selon le produit (r\xe9frig\xe9r\xe9, vrac, ensach\xe9)
- Indique les points de collecte disponibles par r\xe9gion

## 6. 📊 ALERTES DE MARCH\xc9
- Identifie les tendances haussi\xe8res ou baissi\xe8res sur les principales cultures
- Alerte sur les opportunit\xe9s : "La tomate va manquer dans 3 semaines, c'est le bon moment pour planter"
- Indique les \xe9v\xe9nements qui impactent les prix : Tabaski, Korit\xe9, saison des pluies, r\xe9coltes massives
- Compare les marges par culture pour aider les choix de diversification
- Signale les nouveaux acheteurs professionnels actifs sur AgriMarch\xe9

## 7. 💳 ACC\xc8S AU CR\xc9DIT ET \xc0 L'ASSURANCE
- Simule des cr\xe9dits agricoles : montant, dur\xe9e, taux, mensualit\xe9s en FCFA
- Pr\xe9sente les produits financiers adapt\xe9s : BOA S\xe9n\xe9gal, Ecobank, BICIS, CBAO, La Poste, DER/FJ, CNCAS (Caisse Nationale de Cr\xe9dit Agricole du S\xe9n\xe9gal)
- Explique l'assurance r\xe9colte CNAAS (Compagnie Nationale d'Assurance Agricole du S\xe9n\xe9gal)
- Guide pour constituer un dossier de cr\xe9dit solide
- Calcule le ROI d'un investissement agricole (intrants, mat\xe9riel) pour justifier un pr\xeat

**Format de simulation cr\xe9dit :**
Montant : X FCFA | Dur\xe9e : N mois | Taux : 10–14% | Mensualit\xe9 : Y FCFA | Co\xfbt total : Z FCFA

---

**R\xe8gles de r\xe9ponse :**
- R\xe9ponds UNIQUEMENT en fran\xe7ais
- Utilise FCFA pour toutes les valeurs mon\xe9taires (jamais d'euros ou dollars)
- Adapte tes conseils aux 14 r\xe9gions du S\xe9n\xe9gal
- Formatage Markdown : **gras** pour les valeurs cl\xe9s, \xb7 pour les listes
- Sois pr\xe9cis, professionnel et chaleureux — tu es un conseiller de confiance
- Termine TOUJOURS par une action concr\xe8te \xe0 faire maintenant
- Max 350 mots sauf si calcul financier complexe (alors jusqu'\xe0 500)
- Ne jamais dire "je suis une IA" — tu es Agri, le conseiller d'AgriMarch\xe9

**Contexte utilisateur :**
- Nom : ${t}
- Date : ${l}
${o.length?`
**Donn\xe9es temps r\xe9el :**
${o.join("\n\n")}`:""}`,d=[...r.slice(-12).map(e=>({role:e.role,content:e.content})),{role:"user",content:e}],u=await fetch((0,s.apiUrl)("/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({systemPrompt:c,messages:d})});if(!u.ok){let e=await u.json().catch(()=>({}));if("INVALID_API_KEY"===e.error)throw Error("INVALID_API_KEY");if("INSUFFICIENT_BALANCE"===e.error||402===u.status)throw Error("INSUFFICIENT_BALANCE");throw Error(`API error ${u.status}`)}let p=await u.json(),x=p.choices?.[0]?.message?.content??"Désolé, je n'ai pas pu générer une réponse.",m=p.usage?.total_tokens??Math.floor(x.length/4),g=Math.min(30,Math.max(5,Math.floor(x.length/50)));return{text:x,xpGained:g,tokensUsed:m}}let w=[{label:"📣 Plus de clients",q:"Comment vendre plus de produits sur AgriMarché ? Donne-moi des conseils pour attirer plus d'acheteurs."},{label:"💰 Meilleur prix",q:"Quel est le meilleur moment pour vendre mon maïs ? Analyse les prix actuels du marché."},{label:"📉 Réduire les pertes",q:"Comment réduire les pertes post-récolte de mon stock de céréales ? Quelles solutions de conservation ?"},{label:"🌤️ Météo & cultures",q:"Quelle est la météo à Dakar aujourd'hui et comment ça impacte mes cultures ?"},{label:"🚚 Logistique",q:"Comment utiliser la livraison AgriMarché pour réduire mes coûts de transport ?"},{label:"📊 Alertes marché",q:"Quelles sont les tendances du marché agricole cette semaine ? Y a-t-il des opportunités à saisir ?"},{label:"💳 Crédit agricole",q:"Simule un prêt de 500 000 FCFA sur 18 mois pour acheter des intrants. Quelles banques me conseilles-tu ?"}];function A({xp:e,visible:t}){return(0,r.jsxs)("div",{className:`xp-toast ${t?"xp-toast--visible":""}`,"aria-live":"polite",children:["+",e," XP ⚡"]})}function j({visible:e,percentage:t}){if(!e)return null;let a=t>=95;return(0,r.jsxs)("div",{className:`token-alert ${a?"token-alert--critical":"token-alert--warn"}`,role:"alert",children:[(0,r.jsx)("span",{children:"⚠️"}),a?"CRITIQUE : Vos crédits IA sont presque épuisés ! Contactez le support pour recharger.":`Consommation IA : ${Math.round(t)}% — Pensez \xe0 recharger bient\xf4t (690 FCFA / 30 j).`]})}function _(){return(0,r.jsxs)("div",{className:"msg-row msg-row--bot",children:[(0,r.jsx)("div",{className:"avatar-bubble",children:"🌿"}),(0,r.jsxs)("div",{className:"bubble bubble--bot bubble--typing",children:[(0,r.jsx)("span",{className:"dot"}),(0,r.jsx)("span",{className:"dot"}),(0,r.jsx)("span",{className:"dot"}),(0,r.jsx)("span",{className:"typing-label",children:"Agri analyse…"})]})]})}function C({msg:e}){let t,a="user"===e.sender;return(0,r.jsxs)("div",{className:`msg-row ${a?"msg-row--user":"msg-row--bot"}`,children:[!a&&(0,r.jsx)("div",{className:"avatar-bubble",children:"🌿"}),(0,r.jsxs)("div",{className:`bubble ${a?"bubble--user":"bubble--bot"}`,children:[a?(0,r.jsx)("span",{className:"bubble__text",children:e.text}):(0,r.jsx)("span",{className:"bubble__text",children:(t=e.text.split("\n")).map((e,a)=>{let n=e.split(/(\*\*[^*]+\*\*)/g).map((e,t)=>e.startsWith("**")&&e.endsWith("**")?(0,r.jsx)("strong",{className:"md-bold",children:e.slice(2,-2)},t):e);return(0,r.jsxs)("span",{children:[n,a<t.length-1?(0,r.jsx)("br",{}):null]},a)})}),(0,r.jsxs)("div",{className:"bubble__meta",children:[(0,r.jsx)("span",{className:"meta-time",children:e.timestamp.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}),!a&&e.model&&(0,r.jsx)("span",{className:"meta-tag meta-tag--model",children:e.model}),!a&&e.xpGained&&(0,r.jsxs)("span",{className:"meta-tag meta-tag--xp",children:["+",e.xpGained," XP"]}),!a&&e.tokensUsed&&(0,r.jsxs)("span",{className:"meta-tag meta-tag--tokens",children:["🔄 ",e.tokensUsed," tokens"]})]})]})]})}let N=`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #060e09;
    --surface:      #0d1a10;
    --surface-alt:  #0a1610;
    --border:       #1a2e1e;
    --green:        #00ff87;
    --green-dim:    #00c96b;
    --cyan:         #00bcd4;
    --text:         #e8f5e9;
    --text-muted:   #6b8a71;
    --radius-lg:    20px;
    --radius-md:    14px;
    --radius-sm:    10px;
  }

  .chat-root {
    min-height: 100vh;
    background: var(--bg);
    font-family: 'DM Sans', system-ui, sans-serif;
    color: var(--text);
    display: flex;
    flex-direction: column;
  }

  .fullscreen-center {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 24px;
    font-family: 'DM Sans', system-ui, sans-serif;
  }

  .spinner {
    width: 56px; height: 56px;
    border-radius: 50%;
    border: 3px solid var(--green);
    border-top-color: transparent;
    animation: spin .8s linear infinite;
  }
  .loading-label { color: var(--green); font-size: 15px; letter-spacing: .5px; }

  .locked-icon {
    width: 80px; height: 80px; border-radius: 50%;
    background: linear-gradient(135deg, #1a2e1e, var(--surface));
    border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center; font-size: 36px;
  }
  .locked-title { font-size: 20px; font-weight: 700; color: var(--text); }
  .locked-body { font-size: 14px; color: var(--text-muted); text-align: center; max-width: 320px; line-height: 1.65; }
  .locked-price { color: var(--green); }
  .locked-cta {
    display: flex; align-items: center; justify-content: center;
    padding: 14px 36px;
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg); font-weight: 700; font-size: 15px;
    border-radius: 50px; text-decoration: none;
    box-shadow: 0 4px 24px rgba(0,255,135,.3);
    transition: transform .18s;
  }
  .locked-cta:hover { transform: translateY(-2px); }
  .locked-back { color: var(--text-muted); font-size: 13px; text-decoration: none; transition: color .2s; }
  .locked-back:hover { color: var(--text); }

  .xp-toast {
    position: fixed; top: 80px; right: 24px; z-index: 9999;
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg); font-weight: 700; font-size: 13px;
    padding: 10px 18px; border-radius: 50px;
    box-shadow: 0 4px 24px rgba(0,255,135,.4);
    pointer-events: none;
    transform: translateY(-20px) scale(.9); opacity: 0;
    transition: all .35s cubic-bezier(.22,.68,0,1.2);
  }
  .xp-toast--visible { transform: translateY(0) scale(1); opacity: 1; }

  .token-alert {
    position: fixed; top: 80px; left: 50%; transform: translateX(-50%); z-index: 9999;
    font-weight: 700; font-size: 13px;
    padding: 10px 20px; border-radius: 50px;
    display: flex; align-items: center; gap: 8px;
    animation: fadeUp .3s ease-out; white-space: nowrap;
  }
  .token-alert--warn     { background: rgba(245,158,11,.92); color: #fff; }
  .token-alert--critical { background: rgba(239,68,68,.92);  color: #fff; }

  .chat-header {
    position: sticky; top: 0; z-index: 50;
    background: rgba(13,26,16,.92);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
  }
  .header-inner {
    max-width: 900px; margin: 0 auto;
    height: 68px; padding: 0 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }

  .agent-id { display: flex; align-items: center; gap: 14px; }
  .agent-avatar {
    position: relative;
    width: 46px; height: 46px; border-radius: 50%;
    background: linear-gradient(135deg, var(--green), var(--cyan));
    display: flex; align-items: center; justify-content: center; font-size: 22px;
    box-shadow: 0 0 20px rgba(0,255,135,.22); flex-shrink: 0;
  }
  .online-dot {
    position: absolute; bottom: 1px; right: 1px;
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--green); border: 2px solid var(--surface);
    box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite;
  }
  .agent-info { display: flex; flex-direction: column; gap: 2px; }
  .agent-name-row { display: flex; align-items: center; gap: 8px; }
  .agent-name { font-weight: 700; font-size: 17px; letter-spacing: -.2px; }
  .agent-badge {
    font-size: 11px; font-weight: 600; letter-spacing: .4px;
    background: rgba(0,255,135,.12); color: var(--green);
    padding: 2px 8px; border-radius: 20px; border: 1px solid rgba(0,255,135,.25);
  }
  .agent-sub { font-size: 12px; color: var(--text-muted); }

  .header-controls { display: flex; align-items: center; gap: 20px; }

  .xp-widget { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .xp-widget__top { display: flex; align-items: center; gap: 6px; }
  .xp-level-title { font-size: 12px; font-weight: 600; }
  .xp-level-badge { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
  .xp-count { font-size: 10px; color: var(--text-muted); }

  .token-widget { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .token-widget__label { font-size: 10px; color: var(--text-muted); }
  .token-widget__pct { font-size: 9px; color: var(--text-muted); }

  .progress-track { height: 4px; border-radius: 4px; background: var(--border); overflow: hidden; }
  .xp-widget .progress-track   { width: 120px; }
  .token-widget .progress-track { width: 80px; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width .6s cubic-bezier(.22,.68,0,1.2); }

  .close-btn {
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--border); display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 15px; text-decoration: none;
    transition: background .2s; flex-shrink: 0;
  }
  .close-btn:hover { background: #253028; color: var(--text); }

  .chat-messages {
    flex: 1; max-width: 900px; width: 100%; margin: 0 auto;
    padding: 28px 16px 240px;
    display: flex; flex-direction: column; gap: 22px;
  }

  .error-banner {
    display: flex; align-items: flex-start; gap: 10px;
    border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 4px;
    animation: fadeUp .3s ease-out;
  }
  .error-banner--warn     { background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.2); }
  .error-banner--critical { background: rgba(239,68,68,.08);  border: 1px solid rgba(239,68,68,.2); }
  .error-banner--warn     .error-banner__text { color: #f59e0b; }
  .error-banner--critical .error-banner__text { color: #f87171; }
  .error-banner__text { font-size: 13px; line-height: 1.5; flex: 1; }
  .error-banner__close { margin-left: auto; background: none; border: none; color: #f87171; cursor: pointer; font-size: 14px; padding: 0; flex-shrink: 0; }

  .msg-row { display: flex; align-items: flex-end; gap: 12px; animation: fadeUp .28s ease-out; }
  .msg-row--user { flex-direction: row-reverse; }
  .msg-row--bot  { flex-direction: row; }

  .avatar-bubble {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, var(--green), var(--cyan));
    display: flex; align-items: center; justify-content: center; font-size: 18px;
    box-shadow: 0 0 16px rgba(0,255,135,.18);
  }

  .bubble { max-width: 72%; padding: 14px 18px; line-height: 1.65; font-size: 14.5px; }
  .bubble--user {
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg);
    border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
    box-shadow: 0 4px 20px rgba(0,255,135,.28);
  }
  .bubble--bot {
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
    box-shadow: 0 2px 12px rgba(0,0,0,.3);
  }
  .bubble--typing { display: flex; align-items: center; gap: 6px; padding: 16px 20px; }

  .bubble__text { display: block; }
  .md-bold { color: var(--green); font-weight: 700; }

  .bubble__meta {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
    margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(26,46,30,.8);
  }
  .bubble--user .bubble__meta { border-top-color: rgba(0,0,0,.12); }
  .meta-time { font-size: 11px; color: var(--text-muted); }
  .bubble--user .meta-time { color: rgba(0,0,0,.5); }
  .meta-tag { font-size: 11px; padding: 1px 7px; border-radius: 8px; }
  .meta-tag--model  { color: var(--cyan);       background: rgba(0,188,212,.14); }
  .meta-tag--xp     { color: var(--green);      background: rgba(0,255,135,.1); }
  .meta-tag--tokens { color: var(--text-muted); background: var(--border); }

  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); opacity: .7; animation: bounce 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: .2s; }
  .dot:nth-child(3) { animation-delay: .4s; }
  .typing-label { font-size: 12px; color: var(--text-muted); margin-left: 4px; }

  .input-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
    background: rgba(13,26,16,.94);
    backdrop-filter: blur(24px);
    border-top: 1px solid var(--border);
  }

  .quick-row {
    max-width: 900px; margin: 0 auto;
    padding: 12px 16px 0;
    display: flex; gap: 8px;
    overflow-x: auto; scrollbar-width: none;
  }
  .quick-row::-webkit-scrollbar { display: none; }

  .quick-btn {
    flex-shrink: 0; padding: 6px 14px;
    background: rgba(0,255,135,.08); border: 1px solid rgba(0,255,135,.22);
    color: var(--green); border-radius: 20px; font-size: 12px; font-weight: 500;
    cursor: pointer; white-space: nowrap; font-family: inherit;
    transition: background .18s, border-color .18s;
  }
  .quick-btn:hover { background: rgba(0,255,135,.18); border-color: var(--green); }

  .composer {
    max-width: 900px; margin: 0 auto;
    padding: 12px 16px 18px;
    display: flex; align-items: center; gap: 10px;
  }

  .mic-btn {
    width: 46px; height: 46px; border-radius: 50%;
    background: var(--border); border: 1px solid var(--border);
    color: var(--text-muted); font-size: 18px; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; transition: all .2s;
  }
  .mic-btn--active {
    background: #ef4444; border-color: #ef4444; color: #fff;
    box-shadow: 0 0 20px rgba(239,68,68,.4); animation: pulse 1s infinite;
  }

  .composer__input {
    flex: 1; height: 46px;
    background: var(--surface-alt); border: 1.5px solid var(--border);
    border-radius: var(--radius-md); padding: 0 16px;
    color: var(--text); font-size: 14.5px; font-family: inherit; outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .composer__input:focus { border-color: rgba(0,255,135,.5); box-shadow: 0 0 0 3px rgba(0,255,135,.07); }
  .composer__input::placeholder { color: #2e4733; }

  .send-btn {
    height: 46px; padding: 0 22px; border-radius: var(--radius-md); border: none;
    background: var(--border); color: var(--text-muted);
    font-weight: 700; font-size: 14px; cursor: not-allowed; flex-shrink: 0;
    font-family: inherit; transition: all .18s;
  }
  .send-btn--active {
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg); cursor: pointer; box-shadow: 0 4px 16px rgba(0,255,135,.38);
  }
  .send-btn--active:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(0,255,135,.45); }
  .send-btn--active:active { transform: translateY(0); }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  @media (max-width: 600px) {
    .header-inner  { padding: 0 16px; gap: 10px; }
    .agent-sub     { display: none; }
    .xp-widget .progress-track { width: 90px; }
    .token-widget  { display: none; }
    .chat-messages { padding: 20px 12px 220px; }
    .composer      { padding: 10px 12px 16px; }
    .quick-row     { padding: 10px 12px 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner, .online-dot, .dot, .mic-btn--active { animation: none; }
    .xp-toast, .send-btn--active, .locked-cta, .progress-fill { transition: none; }
  }
`;e.s(["default",0,function(){let{user:e,profile:s,loading:u}=(0,n.useAuth)(),[b,f]=(0,t.useState)([]),[h,v]=(0,t.useState)([]),[k,S]=(0,t.useState)(""),[F,I]=(0,t.useState)(!1),[D,E]=(0,t.useState)(!1),[$,P]=(0,t.useState)(0),[M,R]=(0,t.useState)(g(0)),[T,z]=(0,t.useState)({value:0,visible:!1}),[q,L]=(0,t.useState)(!1),[O,U]=(0,t.useState)(!1),[K,B]=(0,t.useState)(!0),[Y,X]=(0,t.useState)(""),[Q,V]=(0,t.useState)(0),[W,J]=(0,t.useState)(!1),G=(0,t.useRef)(null),H=(0,t.useRef)(null),Z=(0,t.useRef)(null),ee=(0,t.useRef)(()=>Promise.resolve()),er=(0,t.useRef)(!1);(0,t.useEffect)(()=>(er.current=!0,L(!0),()=>{er.current=!1}),[]),(0,t.useEffect)(()=>{if(!u){if(!e?.uid){U(!1),B(!1);return}Promise.all([p(e.uid),x(e.uid)]).then(([e,r])=>{U(e),V(r.percentage),J(r.percentage>=80),B(!1)})}},[e,u]),(0,t.useEffect)(()=>{q&&(async()=>{let r=parseInt(localStorage.getItem("agri_xp")||"0",10);if(e&&i.db)try{let t=await (0,l.getDoc)((0,d.doc)(i.db,"users",e.uid));t.exists()&&"number"==typeof t.data()?.xp&&(r=t.data().xp,localStorage.setItem("agri_xp",r.toString()))}catch(e){console.error("XP load:",e)}P(r),R(g(r))})()},[q,e]),(0,t.useEffect)(()=>{if(!q)return;let r=new Date().getHours(),t=s?.displayName||e?.email?.split("@")[0]||"cher agriculteur";f([{id:"welcome",text:`${r<12?"Bonjour":r<18?"Bon après-midi":"Bonsoir"}, **${t}** 👋

Je suis **Agri**, votre conseiller IA d'AgriMarch\xe9 S\xe9n\xe9gal.

Je suis ici pour vous aider \xe0 :
\xb7 📣 **Trouver plus de clients** et booster vos ventes
\xb7 💰 **Vendre au meilleur prix** gr\xe2ce aux donn\xe9es march\xe9 en temps r\xe9el
\xb7 📉 **R\xe9duire vos pertes** post-r\xe9colte
\xb7 🌤️ **Anticiper la m\xe9t\xe9o** et ses impacts sur vos cultures
\xb7 🚚 **Optimiser votre logistique** de livraison
\xb7 📊 **Recevoir des alertes march\xe9** sur les opportunit\xe9s
\xb7 💳 **Acc\xe9der au cr\xe9dit et \xe0 l'assurance** agricole

Quelle est votre situation aujourd'hui ?`,sender:"bot",timestamp:new Date,model:"deepseek-chat"}])},[q]);let et=(0,t.useCallback)(async r=>{let t=(void 0!==r?r:k).trim();if(!t||F)return;if(!O)return void X("Accès IA requis. Abonnez-vous pour 690 FCFA / 30 jours.");void 0===r&&S(""),X("");let a={id:Date.now().toString(),text:t,sender:"user",timestamp:new Date};f(e=>[...e,a]),I(!0),e&&i.db&&(0,l.addDoc)((0,o.collection)(i.db,"users",e.uid,"chatMessages"),{text:t,sender:"user",timestamp:c.Timestamp.fromDate(a.timestamp)}).catch(e=>console.error("Firestore write (user):",e));try{let r=s?.displayName||e?.email?.split("@")[0]||"Agriculteur",{text:a,xpGained:n,tokensUsed:u}=await y(t,h,r);if(e?.uid){let r=await m(e.uid,u),t=await x(e.uid);V(t.percentage),(r||t.percentage>=80)&&(J(!0),setTimeout(()=>J(!1),6e3))}if(v(e=>[...e,{role:"user",content:t},{role:"assistant",content:a}].slice(-20)),P(r=>{let t=r+n;return localStorage.setItem("agri_xp",t.toString()),R(g(t)),e&&i.db&&(0,l.setDoc)((0,d.doc)(i.db,"users",e.uid),{xp:t},{merge:!0}).catch(e=>console.error("XP sync:",e)),t}),z({value:n,visible:!0}),setTimeout(()=>z(e=>({...e,visible:!1})),2200),!er.current)return;let p={id:(Date.now()+1).toString(),text:a,sender:"bot",timestamp:new Date,xpGained:n,model:"deepseek-chat",tokensUsed:u};f(e=>[...e,p]),e&&i.db&&(0,l.addDoc)((0,o.collection)(i.db,"users",e.uid,"chatMessages"),{text:a,sender:"bot",xpGained:n,model:"deepseek-chat",tokensUsed:u,timestamp:c.Timestamp.fromDate(p.timestamp)}).catch(e=>console.error("Firestore write (bot):",e))}catch(e){console.error("DeepSeek error:",e),X(e?.message==="INVALID_API_KEY"?"Configuration API DeepSeek invalide. Contactez l'administrateur.":e?.message==="INSUFFICIENT_BALANCE"?"⚠️ **CRÉDITS DEEPSEEK ÉPUISÉS**\n\nLe service IA est temporairement suspendu. Contactez l'administrateur pour recharger le compte.":"Connexion IA temporairement indisponible. Réessayez dans un instant."),f(r=>[...r,{id:(Date.now()+2).toString(),text:e?.message==="INSUFFICIENT_BALANCE"?"⚠️ **Crédits IA épuisés**\n\nLe service IA est temporairement suspendu. Contactez l'administrateur pour recharger le compte DeepSeek.":"⚠️ **Service temporairement indisponible**\n\nRéessayez dans quelques instants.",sender:"bot",timestamp:new Date}])}finally{er.current&&I(!1)}},[k,e,h,s,F,O]);if((0,t.useEffect)(()=>{ee.current=et},[et]),(0,t.useEffect)(()=>{let e=window.webkitSpeechRecognition||window.SpeechRecognition;if(!e)return;let r=new e;r.lang="fr-FR",r.continuous=!1,r.onresult=e=>{let r=e.results[0][0].transcript;S(r),ee.current(r),E(!1)},r.onerror=()=>E(!1),r.onend=()=>E(!1),Z.current=r},[]),(0,t.useEffect)(()=>{G.current?.scrollIntoView({behavior:"smooth"})},[b,F]),!q||u||K)return(0,r.jsxs)("div",{className:"fullscreen-center",children:[(0,r.jsx)("div",{className:"spinner"}),(0,r.jsx)("p",{className:"loading-label",children:"Initialisation IA…"}),(0,r.jsx)("style",{children:N})]});if(!O)return(0,r.jsxs)("div",{className:"fullscreen-center",children:[(0,r.jsx)("div",{className:"locked-icon",children:"🔒"}),(0,r.jsx)("p",{className:"locked-title",children:"Accès IA Premium requis"}),(0,r.jsxs)("p",{className:"locked-body",children:["Débloquez l'assistant IA DeepSeek pour seulement"," ",(0,r.jsx)("strong",{className:"locked-price",children:"690 FCFA"})," — 500 000 tokens inclus."]}),(0,r.jsx)(a.default,{href:"/main/unlock-ia",className:"locked-cta",children:"Débloquer l'IA Premium — 690 FCFA"}),(0,r.jsx)(a.default,{href:"/main",className:"locked-back",children:"← Retour à l'accueil"}),(0,r.jsx)("style",{children:N})]});let ea=k.trim()&&!F;return(0,r.jsxs)("div",{className:"chat-root",children:[(0,r.jsx)(A,{xp:T.value,visible:T.visible}),(0,r.jsx)(j,{visible:W,percentage:Q}),(0,r.jsx)("header",{className:"chat-header",children:(0,r.jsxs)("div",{className:"header-inner",children:[(0,r.jsxs)("div",{className:"agent-id",children:[(0,r.jsxs)("div",{className:"agent-avatar",children:["🌿",(0,r.jsx)("span",{className:"online-dot","aria-label":"En ligne"})]}),(0,r.jsxs)("div",{className:"agent-info",children:[(0,r.jsxs)("div",{className:"agent-name-row",children:[(0,r.jsx)("span",{className:"agent-name",children:"Agri"}),(0,r.jsx)("span",{className:"agent-badge",children:"DeepSeek"})]}),(0,r.jsx)("span",{className:"agent-sub",children:"AgriMarché Sénégal · IA en ligne"})]})]}),(0,r.jsxs)("div",{className:"header-controls",children:[(0,r.jsxs)("div",{className:"xp-widget",children:[(0,r.jsxs)("div",{className:"xp-widget__top",children:[(0,r.jsx)("span",{className:"xp-level-title",style:{color:M.color},children:M.title}),(0,r.jsxs)("span",{className:"xp-level-badge",style:{color:M.color,background:`${M.color}22`},children:["Niv. ",M.level]})]}),(0,r.jsx)("div",{className:"progress-track",children:(0,r.jsx)("div",{className:"progress-fill",style:{width:`${M.progress}%`,background:`linear-gradient(90deg, ${M.color}, #00ff87)`}})}),(0,r.jsxs)("span",{className:"xp-count",children:[$," / ",M.nextLevelXP," XP"]})]}),(0,r.jsxs)("div",{className:"token-widget",title:`${Math.round(Q)}% des tokens utilis\xe9s`,children:[(0,r.jsx)("span",{className:"token-widget__label",style:{color:Q>80?"#f59e0b":void 0},children:"Tokens"}),(0,r.jsx)("div",{className:"progress-track",children:(0,r.jsx)("div",{className:"progress-fill",style:{width:`${Q}%`,background:Q>90?"#ef4444":Q>80?"#f59e0b":"#00ff87"}})}),(0,r.jsxs)("span",{className:"token-widget__pct",style:{color:Q>80?"#f59e0b":void 0},children:[Math.round(Q),"%"]})]}),(0,r.jsx)(a.default,{href:"/main",className:"close-btn","aria-label":"Fermer",children:"✕"})]})]})}),(0,r.jsxs)("main",{className:"chat-messages",children:[Y&&(0,r.jsxs)("div",{className:`error-banner ${Y.includes("CRÉDITS")?"error-banner--critical":"error-banner--warn"}`,children:[(0,r.jsx)("span",{children:"⚠️"}),(0,r.jsx)("span",{className:"error-banner__text",children:Y}),(0,r.jsx)("button",{className:"error-banner__close",onClick:()=>X(""),"aria-label":"Fermer",children:"✕"})]}),b.map(e=>(0,r.jsx)(C,{msg:e},e.id)),F&&(0,r.jsx)(_,{}),(0,r.jsx)("div",{ref:G})]}),(0,r.jsxs)("div",{className:"input-bar",children:[(0,r.jsx)("div",{className:"quick-row",children:w.map(({label:e,q:t})=>(0,r.jsx)("button",{className:"quick-btn",onClick:()=>et(t),children:e},t))}),(0,r.jsxs)("div",{className:"composer",children:[(0,r.jsx)("button",{className:`mic-btn ${D?"mic-btn--active":""}`,onClick:()=>{Z.current&&(D?(Z.current.stop(),E(!1)):(E(!0),Z.current.start()))},"aria-label":D?"Arrêter l'écoute":"Parler",title:D?"Arrêter":"Parler",children:"🎙️"}),(0,r.jsx)("input",{ref:H,className:"composer__input",type:"text",value:k,onChange:e=>S(e.target.value),onKeyDown:e=>"Enter"===e.key&&!e.shiftKey&&!F&&et(),placeholder:D?"🎙️ Écoute en cours…":"Posez votre question à Agri…","aria-label":"Message à Agri"}),(0,r.jsx)("button",{className:`send-btn ${ea?"send-btn--active":""}`,onClick:()=>et(),disabled:!ea,"aria-label":"Envoyer",children:F?"⏳":"Envoyer"})]})]}),(0,r.jsx)("style",{children:N})]})}])}]);