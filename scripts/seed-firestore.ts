/**
 * SCRIPT SEED FIRESTORE — Agrimarche
 * ─────────────────────────────────────────────────────────────────────
 * Peuple Firestore avec des produits réels sénégalais.
 *
 * COMMENT L'UTILISER :
 *   1. npm install -g tsx   (ou: npx tsx scripts/seed-firestore.ts)
 *   2. Définir les variables d'environnement Firebase dans .env.local
 *   3. Exécuter : npx tsx scripts/seed-firestore.ts
 * ─────────────────────────────────────────────────────────────────────
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc, getDocs,
  query, limit, serverTimestamp, writeBatch, doc,
} from 'firebase/firestore';

// ── Config Firebase (copier depuis .env.local) ──
const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY    || 'AIzaSyD9HHxhbNvOQizx7Qbp4JVSThFW1OyTO_A',
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'agrimarche-24e37.firebaseapp.com',
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID  || 'agrimarche-24e37',
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'agrimarche-24e37.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '21462709831',
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:21462709831:web:e82e3b09279ac7584ba362',
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── Données produits réels du Sénégal ──
const SEED_PRODUCTS = [
  // ── LÉGUMES ──
  {
    name: 'Tomates fraîches de Casamance',
    description: 'Tomates mûres à point, cultivées sans pesticides en Casamance. Idéales pour les sauces thiébou djeun.',
    price: 800, originalPrice: 1000, category: 'Légumes', categoryId: 'legumes',
    stock: 150, unit: 'kg', location: 'Ziguinchor',
    isOrganic: true, minOrder: 2,
    tags: ['frais', 'local', 'saison', 'casamance'],
    images: ['https://images.unsplash.com/photo-1546470427-e26264be0b0b?w=400&q=80'],
    rating: 4.7, reviewCount: 23, sellerName: 'Ferme Badji', sellerRating: 4.8, status: 'active',
  },
  {
    name: 'Oignons violets de Podor',
    description: 'Oignons violets sucrés, produits dans la vallée du fleuve Sénégal. Conservation longue durée.',
    price: 500, category: 'Légumes', categoryId: 'legumes',
    stock: 500, unit: 'kg', location: 'Podor',
    isOrganic: false, minOrder: 5,
    tags: ['stockage', 'local', 'fleuve'],
    images: ['https://images.unsplash.com/photo-1508747703725-719777637510?w=400&q=80'],
    rating: 4.5, reviewCount: 41, sellerName: 'Coopérative Walo', sellerRating: 4.6, status: 'active',
  },
  {
    name: 'Gombo frais',
    description: 'Gombo tendre et frais, récolté chaque matin. Parfait pour les sauces traditionnelles.',
    price: 600, category: 'Légumes', categoryId: 'legumes',
    stock: 80, unit: 'kg', location: 'Dakar',
    isOrganic: true, minOrder: 1,
    tags: ['frais', 'bio', 'cuisine sénégalaise'],
    images: ['https://images.unsplash.com/photo-1628452435369-393e29e1a0ad?w=400&q=80'],
    rating: 4.3, reviewCount: 12, sellerName: 'Maraîcher Ndiaye', sellerRating: 4.4, status: 'active',
  },
  {
    name: 'Piments Doni-Doni',
    description: 'Piments rouges forts, séchés traditionnellement. Incontournables pour le thiébou djeun et le yassa.',
    price: 1200, category: 'Épices', categoryId: 'epices',
    stock: 30, unit: 'kg', location: 'Saint-Louis',
    isOrganic: true, minOrder: 0.5,
    tags: ['piment', 'épice', 'fort', 'séché'],
    images: ['https://images.unsplash.com/photo-1618998274237-3cde9c5e5c3d?w=400&q=80'],
    rating: 4.8, reviewCount: 35, sellerName: 'Épices du Fleuve', sellerRating: 4.9, status: 'active',
  },

  // ── FRUITS ──
  {
    name: 'Mangues Kent de Thiès',
    description: 'Mangues Kent juteuses et sucrées. Récoltées à maturité optimale dans les vergers de Thiès.',
    price: 700, originalPrice: 900, category: 'Fruits', categoryId: 'fruits',
    stock: 200, unit: 'kg', location: 'Thiès',
    isOrganic: true, minOrder: 3,
    tags: ['mangue', 'tropical', 'saison', 'export'],
    images: ['https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&q=80'],
    rating: 4.9, reviewCount: 67, sellerName: 'Verger Diallo', sellerRating: 4.9, status: 'active',
  },
  {
    name: 'Pastèques du Sine-Saloum',
    description: 'Pastèques sucrées, chair rouge vif. Cultivées dans les terres argileuses du Sine-Saloum.',
    price: 400, category: 'Fruits', categoryId: 'fruits',
    stock: 50, unit: 'pièce', location: 'Fatick',
    isOrganic: false, minOrder: 2,
    tags: ['pastèque', 'rafraîchissant', 'saison chaude'],
    images: ['https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&q=80'],
    rating: 4.4, reviewCount: 18, sellerName: 'Ferme Saloum', sellerRating: 4.5, status: 'active',
  },
  {
    name: 'Citrons verts de Casamance',
    description: 'Citrons verts acides et parfumés. Essentiels pour le thiébou djeun et les boissons fraîches.',
    price: 300, category: 'Fruits', categoryId: 'fruits',
    stock: 100, unit: 'kg', location: 'Ziguinchor',
    isOrganic: true, minOrder: 1,
    tags: ['citron', 'acidité', 'frais'],
    images: ['https://images.unsplash.com/photo-1587132137056-bfbf0166836e?w=400&q=80'],
    rating: 4.2, reviewCount: 9, sellerName: 'Jardins de Casamance', sellerRating: 4.3, status: 'active',
  },

  // ── CÉRÉALES ──
  {
    name: 'Mil souna de Kaolack',
    description: 'Mil souna traditionnel, grain long et savoureux. Cultivé sans intrants chimiques à Kaolack.',
    price: 350, category: 'Céréales', categoryId: 'cereales',
    stock: 1000, unit: 'kg', location: 'Kaolack',
    isOrganic: true, minOrder: 10,
    tags: ['mil', 'traditionnel', 'bassin arachidier', 'bio'],
    images: ['https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80'],
    rating: 4.6, reviewCount: 52, sellerName: 'Groupement Sérère', sellerRating: 4.7, status: 'active',
  },
  {
    name: 'Riz paddy de Casamance',
    description: 'Riz paddy à grains longs cultivé dans les rizières de Casamance. Non décortiqué, complet.',
    price: 280, category: 'Céréales', categoryId: 'cereales',
    stock: 2000, unit: 'kg', location: 'Bignona',
    isOrganic: false, minOrder: 25,
    tags: ['riz', 'paddy', 'casamance', 'complet'],
    images: ['https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&q=80'],
    rating: 4.5, reviewCount: 31, sellerName: 'Rizière Diémé', sellerRating: 4.6, status: 'active',
  },
  {
    name: 'Maïs jaune de Tambacounda',
    description: 'Maïs grain jaune, séché et propre. Idéal pour la farine, la polenta ou l\'alimentation animale.',
    price: 220, category: 'Céréales', categoryId: 'cereales',
    stock: 800, unit: 'kg', location: 'Tambacounda',
    isOrganic: false, minOrder: 20,
    tags: ['maïs', 'grain', 'orient sénégal'],
    images: ['https://images.unsplash.com/photo-1601593346740-925612772716?w=400&q=80'],
    rating: 4.1, reviewCount: 14, sellerName: 'Ferme Tamba', sellerRating: 4.2, status: 'active',
  },

  // ── LÉGUMINEUSES ──
  {
    name: 'Niébé blanc (Thiébou niébé)',
    description: 'Niébé blanc sélectionné, sans impuretés. Ingrédient principal du thiébou niébé.',
    price: 900, category: 'Légumineuses', categoryId: 'legumineuses',
    stock: 300, unit: 'kg', location: 'Louga',
    isOrganic: true, minOrder: 5,
    tags: ['niébé', 'protéines', 'légumineuse'],
    images: ['https://images.unsplash.com/photo-1515543904379-3d757afe72e4?w=400&q=80'],
    rating: 4.4, reviewCount: 28, sellerName: 'Ferme Louga', sellerRating: 4.5, status: 'active',
  },

  // ── TUBERCULES ──
  {
    name: 'Patates douces orangées',
    description: 'Patates douces à chair orangée, riches en vitamines. Cultivées dans les Niayes.',
    price: 450, category: 'Tubercules', categoryId: 'tubercules',
    stock: 400, unit: 'kg', location: 'Niayes',
    isOrganic: true, minOrder: 5,
    tags: ['patate', 'vitamines', 'niayes', 'bio'],
    images: ['https://images.unsplash.com/photo-1596097635121-14b63b7a0c19?w=400&q=80'],
    rating: 4.6, reviewCount: 19, sellerName: 'Maraîchers des Niayes', sellerRating: 4.7, status: 'active',
  },
  {
    name: 'Manioc frais (Baobab)',
    description: 'Manioc tendre, pelé et lavé. Prêt à cuisiner pour le couscous ou bouilli.',
    price: 300, category: 'Tubercules', categoryId: 'tubercules',
    stock: 200, unit: 'kg', location: 'Kolda',
    isOrganic: false, minOrder: 3,
    tags: ['manioc', 'féculent', 'afrique'],
    images: ['https://images.unsplash.com/photo-1632649847025-f6a8eee3e9d7?w=400&q=80'],
    rating: 4.0, reviewCount: 7, sellerName: 'Agriculteur Diatta', sellerRating: 4.1, status: 'active',
  },
];

async function seedFirestore() {
  console.log('🌱 Démarrage du seed Firestore — Agrimarche\n');

  // Vérifier si des produits existent déjà
  const existing = await getDocs(query(collection(db, 'products'), limit(1)));
  if (!existing.empty) {
    console.log('⚠️  Des produits existent déjà dans Firestore.');
    console.log('   Pour re-seeder, supprimez d\'abord la collection "products".');
    console.log('   Ou passez --force pour forcer l\'ajout.\n');
    if (!process.argv.includes('--force')) {
      process.exit(0);
    }
    console.log('🔄 --force détecté. Ajout en cours quand même…\n');
  }

  // Insérer en batch
  const BATCH_SIZE = 10;
  let added = 0;

  for (let i = 0; i < SEED_PRODUCTS.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = SEED_PRODUCTS.slice(i, i + BATCH_SIZE);

    for (const product of chunk) {
      const ref = doc(collection(db, 'products'));
      batch.set(ref, {
        ...product,
        sellerId: 'seed-seller',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      added++;
    }

    await batch.commit();
    console.log(`✅ Lot ${Math.floor(i / BATCH_SIZE) + 1} : ${chunk.length} produits ajoutés`);
  }

  console.log(`\n🎉 Seed terminé ! ${added} produits ajoutés dans Firestore.`);
  console.log('   Vous pouvez maintenant tester votre marketplace avec de vraies données.\n');
  process.exit(0);
}

seedFirestore().catch(err => {
  console.error('❌ Erreur seed :', err);
  process.exit(1);
});
