// scripts/build-capacitor.js
//
// Le build statique (output: 'export') ne supporte pas les routes API
// dynamiques (POST, accès à request.json(), secrets serveur, etc.).
// Ce script déplace temporairement le dossier api/ en dehors de app/
// le temps du build mobile, puis le remet en place juste après —
// que le build réussisse ou échoue.
//
// Les routes API restent inchangées et continuent de tourner normalement
// sur le déploiement Vercel classique (qui n'utilise pas ce script).
//
// Supporte les deux structures possibles d'un projet Next.js :
//   - app/api            (structure "à la racine")
//   - src/app/api         (structure "src/")

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');

// Détection automatique : src/app/api en priorité si src/ existe, sinon app/api
const candidateDirs = [
  path.join(projectRoot, 'src', 'app', 'api'),
  path.join(projectRoot, 'app', 'api'),
];

const apiDir = candidateDirs.find((dir) => fs.existsSync(dir));

if (!apiDir) {
  throw new Error(
    `❌ Dossier "api" introuvable. Emplacements testés :\n` +
    candidateDirs.map((d) => `  - ${d}`).join('\n') +
    `\nVérifie où se trouve réellement ton dossier app/ (à la racine ou dans src/).`
  );
}

const tempDir = path.join(projectRoot, '_api_excluded_from_capacitor_build');
const nextCacheDir = path.join(projectRoot, '.next');

console.log('→ Racine du projet détectée :', projectRoot);
console.log('→ Dossier api détecté :', apiDir);

function cleanNextCache() {
  if (fs.existsSync(nextCacheDir)) {
    fs.rmSync(nextCacheDir, { recursive: true, force: true });
    console.log('→ Cache .next supprimé (évite les conflits avec un build précédent)');
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function copyThenDeleteWithRetry(from, to, attempts = 5, delayMs = 800) {
  for (let i = 1; i <= attempts; i++) {
    try {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
      return;
    } catch (err) {
      if (i === attempts) {
        throw new Error(
          `❌ Impossible de déplacer "${from}" après ${attempts} tentatives (verrouillé par un autre programme).\n` +
          `Ferme tout processus node.exe restant (Gestionnaire des tâches) et/ou redémarre le PC, puis relance.\n` +
          `Détail technique : ${err.message}`
        );
      }
      console.log(`→ Dossier verrouillé, nouvelle tentative (${i}/${attempts})...`);
      // Nettoyage d'une copie partielle avant de réessayer
      if (fs.existsSync(to)) fs.rmSync(to, { recursive: true, force: true });
      sleep(delayMs);
    }
  }
}

function moveOut() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  copyThenDeleteWithRetry(apiDir, tempDir);
  console.log('→ api/ mis de côté temporairement (non inclus dans l\'app mobile)');
}

function moveBack() {
  if (fs.existsSync(tempDir)) {
    if (fs.existsSync(apiDir)) {
      fs.rmSync(apiDir, { recursive: true, force: true });
    }
    copyThenDeleteWithRetry(tempDir, apiDir);
    console.log('→ api/ restauré');
  }
}

try {
  cleanNextCache();
  moveOut();
  execSync('next build', {
    stdio: 'inherit',
    cwd: projectRoot,
    env: { ...process.env, CAPACITOR_BUILD: 'true' },
  });
  console.log('✅ Build mobile terminé avec succès.');
} finally {
  // Toujours restaurer api/, même si le build a échoué
  moveBack();
}
