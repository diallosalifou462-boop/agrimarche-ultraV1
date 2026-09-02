// ============================================================
// AgriBot IA — Powered by Claude (Anthropic)
// ============================================================

import { apiUrl } from '@/lib/api-config';

export interface AgentResponse {
  response: string;
  intent: 'product_search' | 'price_check' | 'recommendation' | 'order_help' | 'seller_advice' | 'general';
  entities: Record<string, string>;
  sentiment: 'positive' | 'neutral' | 'negative';
  suggestions?: string[];
}

export class IntelligentAgent {
  private systemPrompt = `Tu es AgriBot, l'assistant IA expert d'AgriMarché — la marketplace agricole du Sénégal.

Ton rôle :
- Aider les acheteurs à trouver des produits frais (légumes, fruits, céréales, épices sénégalaises)
- Conseiller les vendeurs agriculteurs sur leurs ventes, prix et stratégie
- Répondre aux questions sur les commandes, livraisons, paiements
- Donner des conseils nutritionnels et agricoles adaptés au contexte sénégalais

Produits typiques : tomates, mangues, mil, oignons, arachides, bissap, piments, patate douce, manioc, gombo, igname, sorgho...
Régions : Dakar, Thiès, Saint-Louis, Kaolack, Ziguinchor, Louga, Tambacounda...
Paiements : Wave, Orange Money, Free Money, paiement à la livraison

Règles :
- Réponds TOUJOURS en français, de façon chaleureuse et professionnelle
- Sois concis (3-5 phrases max sauf si l'utilisateur demande plus)
- Utilise des emojis agricoles avec modération 🌱
- Si tu ne sais pas, oriente vers le support
- Adapte ton langage au contexte africain (FCFA, unités locales, saisons)

Format JSON de ta réponse :
{
  "response": "ta réponse textuelle",
  "intent": "product_search|price_check|recommendation|order_help|seller_advice|general",
  "entities": {"produit": "...", "region": "...", "prix": "..."},
  "sentiment": "positive|neutral|negative",
  "suggestions": ["question rapide 1", "question rapide 2", "question rapide 3"]
}`;

  async processMessage(userId: string, message: string, history: Array<{role: string, content: string}> = []): Promise<AgentResponse> {
    try {
      const messages = [
        ...history.slice(-6).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
        { role: 'user' as const, content: message }
      ];

      const res = await fetch(apiUrl('/api/ai/agribot'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, systemPrompt: this.systemPrompt }),
      });

      if (!res.ok) throw new Error('API error');
      const data = await res.json();
      return data;
    } catch {
      return {
        response: "Désolé, je rencontre une difficulté technique. Réessayez dans quelques instants. 🌱",
        intent: 'general',
        entities: {},
        sentiment: 'neutral',
        suggestions: ["Trouver des produits frais", "Contacter un vendeur", "Voir mes commandes"],
      };
    }
  }
}

export const agent = new IntelligentAgent();

