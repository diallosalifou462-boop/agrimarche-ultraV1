export class RecommendationEngine {
  async getPersonalizedRecommendations(userId: string) {
    return [
      {
        id: 'demo-product',
        name: 'Mangues Bio',
        score: 0.95,
      },
    ];
  }

  async findSimilarProducts(productId: string) {
    return [];
  }
}

export const recommendationEngine = new RecommendationEngine();
