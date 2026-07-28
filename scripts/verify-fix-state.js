#!/usr/bin/env node
/**
 * verify-fix-state.js
 * ============================================================
 * AUDIT AUTOMATIQUE DE L'ÉTAT RÉEL DU PROJET
 * ============================================================
 *
 * Pourquoi ce script existe :
 * Au fil de cette session de debug, plusieurs fichiers censés être
 * corrigés sont revenus à un état antérieur sans qu'on comprenne
 * pourquoi (orderActions.ts vidé, enforceAppCheck repassé à true,
 * un fichier fantôme jamais routé qui a fait perdre du temps). Ce
 * script ne corrige rien — il CONSTATE l'état réel de chaque fichier
 * qui compte pour les deux fonctionnalités (transitions de statut de
 * commande, soumission d'avis), pour remplacer "envoie-moi une
 * capture d'écran et on devine" par une réponse binaire et fiable.
 *
 * Usage (depuis la racine du projet, celle qui contient src/ et
 * functions/) :
 *
 *   node scripts/verify-fix-state.js
 *
 * Aucune dépendance npm requise — uniquement le module `fs` intégré
 * à Node. Fonctionne tel quel avec le Node déjà installé sur ta
 * machine (pas besoin d'être dans functions/ ni d'avoir fait npm
 * install pour lancer CE script précis).
 *
 * Sortie : un rapport [OK]/[FAIL] par vérification, et un code de
 * sortie (exit code) 0 si tout est bon, 1 sinon — utilisable plus
 * tard dans un hook pre-commit ou une CI si tu veux vraiment blinder
 * ça pour de bon.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
let failures = 0;
let warnings = 0;

function readFile(relPath) {
  const full = path.join(ROOT, relPath);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, 'utf8');
}

function check(label, condition, detail) {
  if (condition) {
    console.log(`[OK]   ${label}`);
  } else {
    console.log(`[FAIL] ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

function warn(label, detail) {
  console.log(`[WARN] ${label}${detail ? ' — ' + detail : ''}`);
  warnings++;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

// ------------------------------------------------------------------
console.log('Audit de l\'etat reel du projet — commandes & avis');
console.log(`Racine analysee : ${ROOT}`);

// ------------------------------------------------------------------
section('1. Cloud Functions — fichiers sources');

const orderFn = readFile('functions/src/orderStatusTransitions.ts');
const reviewFn = readFile('functions/src/reviewSubmission.ts');

check(
  'functions/src/orderStatusTransitions.ts existe et n\'est pas vide',
  orderFn !== null && orderFn.trim().length > 100,
  orderFn === null ? 'fichier introuvable' : 'fichier vide ou quasi-vide',
);
check(
  'functions/src/reviewSubmission.ts existe et n\'est pas vide',
  reviewFn !== null && reviewFn.trim().length > 100,
  reviewFn === null ? 'fichier introuvable' : 'fichier vide ou quasi-vide',
);

if (orderFn) {
  const m = orderFn.match(/enforceAppCheck:\s*(true|false)/);
  check(
    'orderStatusTransitions.ts : enforceAppCheck === false (Option 1, Etape 0)',
    m && m[1] === 'false',
    m ? `trouve enforceAppCheck: ${m[1]}` : 'ligne enforceAppCheck introuvable',
  );
  const region = orderFn.match(/region:\s*'([a-z0-9-]+)'/);
  check(
    'orderStatusTransitions.ts : region === us-central1',
    region && region[1] === 'us-central1',
    region ? `trouve region: ${region[1]}` : 'ligne region introuvable',
  );
}

if (reviewFn) {
  const m = reviewFn.match(/enforceAppCheck:\s*(true|false)/);
  check(
    'reviewSubmission.ts : enforceAppCheck === false (Option 1, Etape 0)',
    m && m[1] === 'false',
    m ? `trouve enforceAppCheck: ${m[1]}` : 'ligne enforceAppCheck introuvable',
  );
  const region = reviewFn.match(/region:\s*'([a-z0-9-]+)'/);
  check(
    'reviewSubmission.ts : region === us-central1',
    region && region[1] === 'us-central1',
    region ? `trouve region: ${region[1]}` : 'ligne region introuvable',
  );
}

// ------------------------------------------------------------------
section('2. functions/package.json');

const pkgRaw = readFile('functions/package.json');
if (pkgRaw) {
  try {
    const pkg = JSON.parse(pkgRaw);
    const dep = (pkg.dependencies && pkg.dependencies['firebase-functions']) || '';
    const major = parseInt((dep.match(/(\d+)/) || [])[1] || '0', 10);
    check(
      `functions/package.json : firebase-functions >= 7 (trouve "${dep}")`,
      major >= 7,
    );
    const hasRulesUnitTesting = pkg.devDependencies && pkg.devDependencies['@firebase/rules-unit-testing'];
    check(
      'functions/package.json : @firebase/rules-unit-testing absent (evite de trainer tout le SDK web Firebase)',
      !hasRulesUnitTesting,
      'present — va probablement re-casser npm ci comme precedemment',
    );
  } catch (e) {
    check('functions/package.json : JSON valide', false, e.message);
  }
} else {
  check('functions/package.json existe', false);
}

// ------------------------------------------------------------------
section('3. Client — helpers d\'appel des Cloud Functions');

const orderActions = readFile('src/lib/orderActions.ts');
const reviewActions = readFile('src/lib/reviewActions.ts');
const callWithRetry = readFile('src/lib/callWithRetry.ts');

check(
  'src/lib/orderActions.ts existe et n\'est pas vide',
  orderActions !== null && orderActions.trim().length > 100,
);
check(
  'src/lib/reviewActions.ts existe et n\'est pas vide',
  reviewActions !== null && reviewActions.trim().length > 100,
);
check(
  'src/lib/callWithRetry.ts existe et n\'est pas vide',
  callWithRetry !== null && callWithRetry.trim().length > 100,
);

if (orderActions) {
  const region = orderActions.match(/getFunctions\(app,\s*'([a-z0-9-]+)'\)/);
  check(
    'orderActions.ts : getFunctions region === us-central1',
    region && region[1] === 'us-central1',
    region ? `trouve: ${region[1]}` : 'appel getFunctions introuvable',
  );
}
if (reviewActions) {
  const region = reviewActions.match(/getFunctions\(app,\s*'([a-z0-9-]+)'\)/);
  check(
    'reviewActions.ts : getFunctions region === us-central1',
    region && region[1] === 'us-central1',
    region ? `trouve: ${region[1]}` : 'appel getFunctions introuvable',
  );
}

// ------------------------------------------------------------------
section('4. Bug de l\'ID de commande ecrase (spread-order)');

// Le champ 'id' ne doit plus jamais etre ecrit a la creation de la commande.
const checkoutPage = readFile('src/app/checkout/page.tsx');
if (checkoutPage) {
  const hasBadIdField = /\bid:\s*orderNumber\b/.test(checkoutPage);
  check(
    'checkout/page.tsx : le champ id:orderNumber a bien ete retire du document commande',
    !hasBadIdField,
    'toujours present — la cause racine n\'est pas corrigee',
  );
} else {
  warn('checkout/page.tsx introuvable — impossible de verifier la cause racine');
}

// Les 9 fichiers qui lisent des commandes : `id` doit venir APRES le spread.
const orderReaderFiles = [
  'src/app/account/page.tsx',
  'src/app/main/account/page.tsx',
  'src/app/account/orders/page.tsx',
  'src/app/orders/page.tsx',
  'src/app/admin/delivery/page.tsx',
  'src/app/delivery/dashboard/page.tsx',
  'src/app/admin/admin-dashboard-page.tsx', // peut etre absent (fichier fantome supprime) — c'est OK
  'src/app/admin/assign-delivery/page.tsx',
];

// Pattern dangereux : id (ou id: d.id / doc.id) suivi d'un spread de
// d.data()/doc.data() APRES. On exclut explicitement les lignes castees
// vers un type connu SANS rapport avec les commandes (DeliveryPerson,
// Product, etc. — ces collections n'ont jamais eu le champ `id` polluant,
// le meme pattern y est inoffensif). Approche par exclusion plutot que
// par inclusion d'un cast "as Order" : certains fichiers sains (ex.
// account/page.tsx) n'ont aucun cast explicite sur cette ligne — exiger
// "as Order" les aurait rendus invisibles a une regression future.
const DANGEROUS_LINE = /\{\s*id:\s*(?:d|doc)\.id\s*,\s*\.\.\.(?:d|doc)\.data\(\)/;
const SAFE_OTHER_TYPE = /\bas\s+(DeliveryPerson|Product|UserProfile|Loan|AppNotification|AccessCode|Review|RecommendedProduct|ProductData)\b/;

for (const relPath of orderReaderFiles) {
  const content = readFile(relPath);
  if (content === null) {
    // admin-dashboard-page.tsx supprime = attendu et sain (fichier fantome, jamais route par Next.js).
    if (relPath.includes('admin-dashboard-page.tsx')) {
      console.log(`[OK]   ${relPath} : absent (fichier fantome non route par Next.js — normal s'il a ete supprime)`);
    } else {
      warn(`${relPath} introuvable`, 'chemin different chez toi ? verifier manuellement');
    }
    continue;
  }

  const lines = content.split('\n');
  const badLines = [];
  lines.forEach((line, idx) => {
    if (DANGEROUS_LINE.test(line) && !SAFE_OTHER_TYPE.test(line)) {
      badLines.push(idx + 1);
    }
  });

  check(
    `${relPath} : id place apres le spread pour tous les objets Order`,
    badLines.length === 0,
    badLines.length > 0 ? `pattern dangereux sur la/les ligne(s) ${badLines.join(', ')}` : undefined,
  );
}

// ------------------------------------------------------------------
section('Resume');

if (failures === 0 && warnings === 0) {
  console.log('Tout est conforme. Aucune action requise.');
} else {
  console.log(`${failures} probleme(s) bloquant(s), ${warnings} avertissement(s).`);
  console.log('Corrige les lignes [FAIL] ci-dessus avant de retester dans l\'app.');
}

process.exit(failures > 0 ? 1 : 0);