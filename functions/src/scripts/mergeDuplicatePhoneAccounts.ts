/**
 * mergeDuplicatePhoneAccounts.ts
 * ============================================================
 * SCRIPT DE NETTOYAGE -- A EXECUTER MANUELLEMENT, UNE FOIS
 * ============================================================
 *
 * Probleme : pour certains numeros (surtout Orange), Firebase Auth contient
 * DEUX comptes pour la meme personne :
 *   - le vrai compte, avec email synthetique + mot de passe
 *     (ex : 772851447@agrimarche.sn), mais SANS numero attache ;
 *   - un compte "telephone seul" (+221772851447), VIDE, cree par Firebase
 *     Phone Auth lors d'une connexion ou d'un mot de passe oublie.
 *
 * Ce que fait le script, pour chaque numero :
 *   1. regroupe les comptes du meme numero (numero attache, ou email
 *      synthetique 221XXXXXXXXX / XXXXXXXXX @sunnumenef.sn, @agrimarche.sn
 *      ou @gmail.com) ;
 *   2. garde le compte qui a un MOT DE PASSE (le vrai compte) ;
 *   3. supprime les comptes "telephone seul" UNIQUEMENT s'ils sont vides :
 *      pas de profil reel, aucune commande (client ou vendeur), aucun produit ;
 *   4. attache le numero au vrai compte et met a jour phoneIndex ;
 *   5. attache aussi le numero aux comptes UNIQUES email+mot de passe qui
 *      ne l'ont pas encore (evite de futurs doublons) ;
 *   6. renomme les anciens emails synthetiques @agrimarche.sn (avec ou
 *      sans 221) vers le format actuel 221XXXXXXXXX@sunnumenef.sn.
 *      Le mot de passe ne change pas ; la connexion retrouve l'email toute
 *      seule (/api/auth/check-phone), donc rien a faire pour l'utilisateur.
 *   Tout cas douteux (deux comptes avec mot de passe, doublon avec des
 *   donnees) est seulement SIGNALE, jamais modifie.
 *
 * Usage (depuis le dossier functions/) :
 *   npx ts-node src/scripts/mergeDuplicatePhoneAccounts.ts           # dry-run : affiche seulement
 *   npx ts-node src/scripts/mergeDuplicatePhoneAccounts.ts --apply   # applique
 *
 * Necessite les credentials Admin (GOOGLE_APPLICATION_CREDENTIALS pointant
 * vers une cle de service du projet). NE PAS executer contre l'emulateur.
 */

import * as admin from 'firebase-admin';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();
const DRY_RUN = !process.argv.includes('--apply');

type U = admin.auth.UserRecord;
const hasPassword = (u: U) => u.providerData.some((p) => p.providerId === 'password');

/** 9 chiffres locaux du numero, depuis le telephone ou l'email synthetique. */
function localKey(u: U): string | null {
  const fromPhone = u.phoneNumber?.match(/^\+221(\d{9})$/)?.[1];
  if (fromPhone) return fromPhone;
  const fromEmail = u.email?.toLowerCase().match(/^(?:221)?(\d{9})@(?:sunnumenef\.sn|agrimarche\.sn|gmail\.com)$/)?.[1];
  return fromEmail ?? null;
}

async function isEmpty(u: U): Promise<{ empty: boolean; reason?: string }> {
  if (u.email || hasPassword(u)) return { empty: false, reason: 'a un email ou mot de passe' };
  const profile = await db.collection('users').doc(u.uid).get();
  if (profile.exists) {
    const p = profile.data() || {};
    if (p.role && p.role !== 'client') return { empty: false, reason: `role ${p.role}` };
    if (p.registrationChannel) return { empty: false, reason: 'inscription complete' };
    if ((p.displayName && String(p.displayName).trim()) || (p.name && String(p.name).trim())) {
      return { empty: false, reason: 'profil avec nom' };
    }
  }
  const [buyer, seller, products] = await Promise.all([
    db.collection('orders').where('userId', '==', u.uid).limit(1).get(),
    db.collection('orders').where('sellerId', '==', u.uid).limit(1).get(),
    db.collection('products').where('sellerId', '==', u.uid).limit(1).get(),
  ]);
  if (!buyer.empty) return { empty: false, reason: 'commandes client' };
  if (!seller.empty) return { empty: false, reason: 'commandes vendeur' };
  if (!products.empty) return { empty: false, reason: 'produits' };
  return { empty: true };
}

const canonicalEmail = (local: string) => `221${local}@sunnumenef.sn`;
let renamed = 0;

/** Renomme un ancien email synthetique vers 221XXXXXXXXX@sunnumenef.sn. */
async function renameToCanonical(u: U, local: string): Promise<void> {
  if (!u.email || !hasPassword(u)) return;
  const target = canonicalEmail(local);
  if (u.email.toLowerCase() === target) return;
  // Seuls les emails synthetiques @agrimarche.sn / @sunnumenef.sn sont renommes.
  // Un @gmail.com peut etre une VRAIE adresse (ex : compte livreur cree par l'admin) : on n'y touche pas.
  if (!/^(?:221)?\d{9}@(?:sunnumenef\.sn|agrimarche\.sn)$/i.test(u.email)) return;
  const taken = await admin.auth().getUserByEmail(target).then((x) => x.uid !== u.uid).catch(() => false);
  if (taken) {
    console.log(`⚠️  ${u.email} : ${target} deja utilise par un autre compte — non renomme`);
    return;
  }
  renamed++;
  console.log(`✉️  ${u.email} → ${target}`);
  if (!DRY_RUN) {
    await admin.auth().updateUser(u.uid, { email: target });
    await db.collection('users').doc(u.uid).set({ email: target }, { merge: true });
  }
}

async function main() {
  console.log(`\n=== Fusion des comptes en double par numero ${DRY_RUN ? '(DRY-RUN — aucune ecriture)' : '(APPLICATION REELLE)'} ===\n`);

  const groups = new Map<string, U[]>();
  let pageToken: string | undefined;
  let total = 0;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const u of page.users) {
      total++;
      const key = localKey(u);
      if (!key) continue;
      groups.set(key, [...(groups.get(key) || []), u]);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  let merged = 0;
  let manual = 0;

  let attached = 0;

  for (const [local, users] of groups) {
    const e164 = `+221${local}`;
    if (users.length < 2) {
      // Compte unique avec email + mot de passe mais sans numero attache :
      // on attache le numero pour que la prochaine connexion Orange retombe
      // directement dessus (au lieu de creer un doublon).
      const only = users[0];
      await renameToCanonical(only, local);
      if (hasPassword(only) && !only.phoneNumber) {
        attached++;
        console.log(`📞 ${e164} : numero attache au compte unique ${only.uid} (${only.email})`);
        if (!DRY_RUN) {
          await admin.auth().updateUser(only.uid, { phoneNumber: e164 }).catch((e) => console.log(`   ↳ echec : ${e?.message || e}`));
        }
      }
      continue;
    }
    const withPassword = users.filter(hasPassword);

    if (withPassword.length !== 1) {
      manual++;
      console.log(`⚠️  ${e164} : ${withPassword.length} comptes avec mot de passe (${users.map((u) => u.email || u.phoneNumber || u.uid).join(', ')}) — à traiter à la main`);
      continue;
    }

    const main = withPassword[0];
    const duplicates = users.filter((u) => u.uid !== main.uid);
    let blocked = false;

    for (const dup of duplicates) {
      const check = await isEmpty(dup);
      if (!check.empty) {
        blocked = true;
        console.log(`⚠️  ${e164} : le doublon ${dup.uid} n'est pas vide (${check.reason}) — à traiter à la main`);
        continue;
      }
      console.log(`🧹 ${e164} : suppression du doublon vide ${dup.uid} (${dup.phoneNumber || 'sans numero'}) → garde ${main.uid} (${main.email})`);
      if (!DRY_RUN) {
        await db.recursiveDelete(db.collection('users').doc(dup.uid)).catch(() => {});
        await admin.auth().deleteUser(dup.uid);
      }
    }

    if (blocked) {
      manual++;
      continue;
    }

    await renameToCanonical(main, local);
    if (main.phoneNumber !== e164) {
      console.log(`📞 ${e164} : numero rattache a ${main.uid} (${main.email})`);
      if (!DRY_RUN) {
        await admin.auth().updateUser(main.uid, { phoneNumber: e164 });
      }
    }
    if (!DRY_RUN) {
      await db.collection('users').doc(main.uid).set({ phone: e164, phoneVerified: true }, { merge: true });
      await db.collection('phoneIndex').doc(e164).set({ accountId: main.uid }, { merge: true });
    }
    merged++;
  }

  console.log(`\n--- Rapport ---`);
  console.log(`Comptes analyses        : ${total}`);
  console.log(`Doublons fusionnes      : ${merged}${DRY_RUN ? ' (a corriger avec --apply)' : ''}`);
  console.log(`Numeros attaches seuls  : ${attached}${DRY_RUN ? ' (a corriger avec --apply)' : ''}`);
  console.log(`Emails renommes         : ${renamed}${DRY_RUN ? ' (a corriger avec --apply)' : ''}`);
  console.log(`A traiter manuellement  : ${manual}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Echec du script :', err);
    process.exit(1);
  });
