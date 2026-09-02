export class PredictionEngine {
  async predictSales(productId: string) {
    return {
      productId,
      prediction: 'stable',
    };
  }
}

export const predictionEngine = new PredictionEngine();
