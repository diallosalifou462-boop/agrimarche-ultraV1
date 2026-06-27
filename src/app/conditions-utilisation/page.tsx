import Link from 'next/link';

export const metadata = {
  title: "Conditions d'utilisation — Agrimarché",
  description: "Conditions d'utilisation de la plateforme Agrimarché : éligibilité, responsabilités, règles de publication, limitation de responsabilité et suspension de compte.",
};

export default function ConditionsUtilisationPage() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 80px', color: '#1f2a22', lineHeight: 1.65 }}>
      <Link href="/" style={{ fontSize: 13, color: '#25894A', textDecoration: 'none', fontWeight: 600 }}>
        ← Retour à l&apos;accueil
      </Link>

      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '20px 0 4px' }}>Conditions d&apos;utilisation</h1>
      <p style={{ fontSize: 13, color: '#6b7a70', marginBottom: 32 }}>
        Dernière mise à jour : 24 juin 2026
      </p>

      <p>
        Les présentes conditions d&apos;utilisation (les « Conditions ») régissent l&apos;accès et
        l&apos;utilisation de la plateforme Agrimarché (le « Service »), qui met en relation des
        agriculteurs, des commerçants, des transporteurs et des acheteurs au Sénégal. En créant un
        compte ou en utilisant le Service, vous acceptez d&apos;être lié par ces Conditions.
      </p>

      <h2 style={sectionTitle}>1. Qui peut utiliser Agrimarché</h2>
      <ul style={list}>
        <li>Le Service est ouvert à toute personne physique ou morale âgée d&apos;au moins 18 ans, résidant ou opérant au Sénégal ou y exerçant une activité agricole, commerciale ou de transport.</li>
        <li>L&apos;inscription nécessite la fourniture d&apos;informations exactes (identité, numéro de téléphone, localisation) et leur mise à jour en cas de changement.</li>
        <li>Chaque utilisateur ne peut détenir qu&apos;un seul compte par numéro de téléphone, sauf autorisation expresse d&apos;Agrimarché.</li>
        <li>Agrimarché peut demander une vérification d&apos;identité (notamment pour les vendeurs) avant d&apos;autoriser la publication de produits.</li>
        <li>Agrimarché se réserve le droit de refuser ou de limiter l&apos;accès au Service à toute personne ne respectant pas ces conditions d&apos;éligibilité.</li>
      </ul>

      <h2 style={sectionTitle}>2. Responsabilités des agriculteurs, commerçants et transporteurs</h2>
      <p>Chaque catégorie d&apos;utilisateur professionnel s&apos;engage à respecter les obligations suivantes :</p>
      <h3 style={subTitle}>Agriculteurs et producteurs</h3>
      <ul style={list}>
        <li>Garantir l&apos;exactitude des informations sur les produits proposés (origine, quantité, qualité, prix, disponibilité réelle en stock).</li>
        <li>Respecter les normes sanitaires et phytosanitaires en vigueur applicables à leurs produits.</li>
        <li>Honorer les commandes confirmées dans les délais convenus avec l&apos;acheteur.</li>
      </ul>
      <h3 style={subTitle}>Commerçants</h3>
      <ul style={list}>
        <li>Afficher des prix clairs, exacts et non trompeurs.</li>
        <li>Ne revendre que des produits dont ils ont la disposition légale et la traçabilité.</li>
        <li>Traiter les réclamations des acheteurs avec diligence et de bonne foi.</li>
      </ul>
      <h3 style={subTitle}>Transporteurs</h3>
      <ul style={list}>
        <li>Assurer un transport soigné des marchandises confiées, dans des conditions adaptées à leur nature (notamment les denrées périssables).</li>
        <li>Respecter les délais de livraison annoncés et informer rapidement l&apos;acheteur et le vendeur en cas de retard ou d&apos;incident.</li>
        <li>Disposer des autorisations et assurances requises par la réglementation applicable au transport de marchandises.</li>
      </ul>
      <p>
        Agrimarché agit comme intermédiaire technique mettant en relation ces utilisateurs ; elle n&apos;est
        partie à aucun contrat de vente, d&apos;achat ou de transport conclu entre eux.
      </p>

      <h2 style={sectionTitle}>3. Règles de publication des produits</h2>
      <ul style={list}>
        <li>Chaque annonce doit décrire fidèlement le produit : nom, catégorie, prix, unité, quantité disponible et, si pertinent, la localisation et le producteur.</li>
        <li>Les photographies publiées doivent représenter le produit réellement proposé à la vente ; les images trompeuses, génériques ou appartenant à des tiers sans autorisation sont interdites.</li>
        <li>Sont strictement interdits : les produits illicites ou réglementés sans autorisation, les annonces frauduleuses, les doublons abusifs, et tout contenu injurieux, discriminatoire ou portant atteinte aux droits d&apos;un tiers.</li>
        <li>Le vendeur est seul responsable de la mise à jour de son stock et du retrait d&apos;une annonce dès qu&apos;un produit n&apos;est plus disponible.</li>
        <li>Agrimarché peut modérer, suspendre ou supprimer toute annonce non conforme à ces règles, sans préavis si la situation l&apos;exige.</li>
      </ul>

      <h2 style={sectionTitle}>4. Limitations de responsabilité</h2>
      <ul style={list}>
        <li>Agrimarché fournit une plateforme de mise en relation et ne garantit ni la qualité, ni la conformité, ni la livraison effective des produits échangés entre utilisateurs.</li>
        <li>Agrimarché n&apos;est pas responsable des litiges entre acheteurs, vendeurs et transporteurs, ni des pertes financières, dommages directs ou indirects résultant d&apos;une transaction conclue via le Service.</li>
        <li>Le Service est fourni « en l&apos;état » et « selon disponibilité » ; Agrimarché ne garantit pas un fonctionnement ininterrompu ou exempt d&apos;erreurs (notamment pour les fonctions de géolocalisation).</li>
        <li>Dans la mesure permise par la loi sénégalaise, la responsabilité d&apos;Agrimarché envers un utilisateur est limitée aux dommages directs et prévisibles, à l&apos;exclusion de tout préjudice indirect (perte de profit, perte de récolte, etc.).</li>
        <li>Ces limitations ne s&apos;appliquent pas en cas de faute lourde ou intentionnelle d&apos;Agrimarché, ni lorsqu&apos;une disposition légale impérative l&apos;interdit.</li>
      </ul>

      <h2 style={sectionTitle}>5. Conditions de suspension d&apos;un compte</h2>
      <p>Agrimarché peut suspendre ou résilier l&apos;accès d&apos;un utilisateur au Service, temporairement ou définitivement, notamment en cas de :</p>
      <ul style={list}>
        <li>Fourniture d&apos;informations fausses ou trompeuses lors de l&apos;inscription ou de la publication d&apos;une annonce ;</li>
        <li>Non-respect répété des règles de publication des produits ;</li>
        <li>Comportement frauduleux, abusif ou portant atteinte à d&apos;autres utilisateurs (non-livraison répétée, non-paiement, harcèlement, etc.) ;</li>
        <li>Utilisation du Service à des fins illégales ou contraires à ces Conditions ;</li>
        <li>Réception de plusieurs signalements fondés émanant d&apos;autres utilisateurs.</li>
      </ul>
      <p>
        Sauf urgence ou obligation légale, l&apos;utilisateur concerné est informé du motif de la suspension
        et peut présenter ses observations. Un compte suspendu peut être réactivé si les motifs ayant
        justifié la mesure ont été corrigés, à la discrétion d&apos;Agrimarché.
      </p>

      <h2 style={sectionTitle}>6. Modification des Conditions</h2>
      <p>
        Agrimarché peut modifier ces Conditions à tout moment pour refléter une évolution du Service ou
        de la réglementation applicable. Toute modification substantielle sera communiquée aux
        utilisateurs ; la poursuite de l&apos;utilisation du Service après publication vaut acceptation des
        nouvelles Conditions.
      </p>

      <h2 style={sectionTitle}>7. Contact</h2>
      <p>
        Pour toute question relative à ces Conditions, vous pouvez nous contacter via WhatsApp au
        numéro affiché dans l&apos;application, ou depuis la rubrique « Mon compte ».
      </p>
    </main>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  margin: '32px 0 10px',
  color: '#15321f',
};

const subTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  margin: '16px 0 6px',
  color: '#25894A',
};

const list: React.CSSProperties = {
  paddingLeft: 20,
  margin: '0 0 12px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
