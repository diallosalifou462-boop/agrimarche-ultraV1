// Page publique « Contact & informations légales » — https://<ton-site>/contact
// Sert aux clients ET à la vérification d'entreprise de Meta (nom, adresse, téléphone identiques
// à ceux déclarés dans Meta Business et à ceux du justificatif).
// ➜ Remplis seulement les deux lignes marquées À REMPLIR, enregistre, puis git push.

import type { Metadata } from 'next';

const NOM_LEGAL = 'Salifou Diallo';                 // doit être identique au nom légal déclaré chez Meta
const NOM_COMMERCIAL = 'SunuMëñëf';
const ADRESSE = 'Tivaoune Diacksao, Thiès, Sénégal'; // identique à la facture Senelec et à Meta
const TELEPHONE = '+221 70 110 43 38';
const WHATSAPP = '221701104338';
const EMAIL = '';                                    // À REMPLIR si tu veux afficher un e-mail (sinon laisse vide)

export const metadata: Metadata = {
  title: `Contact et informations légales — ${NOM_COMMERCIAL}`,
  description: `${NOM_COMMERCIAL}, place de marché agricole au Sénégal. Contact, adresse et informations légales.`,
};

const box: React.CSSProperties = { maxWidth: 720, margin: '0 auto', padding: '40px 20px', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6, color: '#1f2a1f' };
const card: React.CSSProperties = { background: '#f4f8f1', border: '1px solid #dce8d4', borderRadius: 12, padding: '20px 24px', margin: '20px 0' };
const label: React.CSSProperties = { fontSize: 13, color: '#5b6b57', marginBottom: 2 };

export default function ContactPage() {
  return (
    <main style={box}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>{NOM_COMMERCIAL}</h1>
      <p style={{ marginTop: 0, color: '#5b6b57' }}>
        Place de marché agricole sénégalaise : fruits, légumes, céréales et produits de la ferme, livrés au Sénégal.
      </p>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Nous contacter</h2>
        <div style={label}>Téléphone et WhatsApp</div>
        <p style={{ marginTop: 0 }}>
          <a href={`tel:${TELEPHONE.replace(/\s/g, '')}`}>{TELEPHONE}</a>
          {' · '}
          <a href={`https://wa.me/${WHATSAPP}`} rel="noopener noreferrer">Écrire sur WhatsApp</a>
        </p>
        {EMAIL && (<><div style={label}>E-mail</div><p style={{ marginTop: 0 }}><a href={`mailto:${EMAIL}`}>{EMAIL}</a></p></>)}
        <div style={label}>Adresse</div>
        <p style={{ marginTop: 0 }}>{ADRESSE}</p>
      </section>

      <section style={card}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Informations légales</h2>
        <div style={label}>Éditeur et exploitant</div>
        <p style={{ marginTop: 0 }}>{NOM_LEGAL}, exploitant de {NOM_COMMERCIAL}</p>
        <div style={label}>Siège</div>
        <p style={{ marginTop: 0 }}>{ADRESSE}</p>
        <div style={label}>Téléphone</div>
        <p style={{ marginTop: 0 }}>{TELEPHONE}</p>
      </section>

      <p style={{ fontSize: 13, color: '#5b6b57' }}>© {new Date().getFullYear()} {NOM_LEGAL} — {NOM_COMMERCIAL}</p>
    </main>
  );
}
