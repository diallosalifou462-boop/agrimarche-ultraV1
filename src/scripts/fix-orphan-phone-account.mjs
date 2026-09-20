import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const phoneArg = process.argv[2];
if (!phoneArg) {
  console.error('Usage: node fix-orphan-phone-account.mjs +221XXXXXXXXX');
  process.exit(1);
}

function toE164Senegal(raw) {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('221')) digits = '+' + digits;
    else if (digits.length === 9) digits = '+221' + digits;
    else digits = '+' + digits;
  }
  return /^\+221\d{9}$/.test(digits) ? digits : null;
}

function canonicalSyntheticEmail(e164) {
  return e164.replace(/\D/g, '') + '@sunumenef.sn';
}

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

async function main() {
  const e164 = toE164Senegal(phoneArg);
  if (!e164) {
    console.error('Numero invalide : ' + phoneArg);
    process.exit(1);
  }

  const user = await auth.getUserByPhoneNumber(e164).catch(function () { return null; });
  if (!user) {
    console.error('Aucun compte Firebase Auth trouve pour ' + e164);
    process.exit(1);
  }

  console.log('Compte trouve : uid=' + user.uid + ', email actuel=' + (user.email || '(aucun)'));

  if (user.email) {
    console.log('Ce compte a deja un email - il n est probablement pas orphelin. Rien a faire.');
    console.log('Si la personne ne peut toujours pas se connecter, verifie plutot qu un mot de passe est bien defini (Firebase Console -> Authentication -> cet utilisateur).');
    return;
  }

  const email = canonicalSyntheticEmail(e164);
  await auth.updateUser(user.uid, { email: email, emailVerified: true });
  console.log('Email synthetique attache : ' + email);

  await db.collection('users').doc(user.uid).set({ phone: e164, phoneVerified: true }, { merge: true });
  await db.collection('phoneIndex').doc(e164).set({ accountId: user.uid }, { merge: true });
  console.log('Profil Firestore mis a jour (users/' + user.uid + ', phoneIndex/' + e164 + ').');

  console.log('');
  console.log('Compte repare. La personne peut maintenant :');
  console.log('   - aller sur Mot de passe oublie, entrer ' + e164);
  console.log('   - recevoir un code, le valider, et definir un nouveau mot de passe');
  console.log('   - se connecter normalement ensuite.');
}

main().catch(function (err) {
  console.error('Echec :', err);
  process.exit(1);
});
