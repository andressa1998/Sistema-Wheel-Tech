// ============================================
// SHIPPING MANAGER - Gerenciamento de Custos de Frete ML
// ============================================

// Tabela de custos baseada em https://www.mercadolivre.com.br/ajuda/40538
// Estrutura: cada linha representa uma combinação de faixa de preço e faixa de peso.
// Os valores são os custos para vendedores MercadoLíder, reputação verde ou sem reputação.

const SHIPPING_COST_TABLE = [
    // Faixa de preço: R$ 0,00 a R$ 18,99
    { priceMin: 0.00, priceMax: 18.99, weightMin: 0.00, weightMax: 0.30, cost: 5.65 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 0.30, weightMax: 0.50, cost: 5.95 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 0.50, weightMax: 1.00, cost: 6.05 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 1.00, weightMax: 1.50, cost: 6.15 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 1.50, weightMax: 2.00, cost: 6.25 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 2.00, weightMax: 3.00, cost: 6.35 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 3.00, weightMax: 4.00, cost: 6.45 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 4.00, weightMax: 5.00, cost: 6.55 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 5.00, weightMax: 6.00, cost: 6.65 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 6.00, weightMax: 7.00, cost: 6.75 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 7.00, weightMax: 8.00, cost: 6.85 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 8.00, weightMax: 9.00, cost: 6.95 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 9.00, weightMax: 11.00, cost: 7.05 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 11.00, weightMax: 13.00, cost: 7.15 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 13.00, weightMax: 15.00, cost: 7.25 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 15.00, weightMax: 17.00, cost: 7.35 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 17.00, weightMax: 20.00, cost: 7.45 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 20.00, weightMax: 25.00, cost: 7.65 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 25.00, weightMax: 30.00, cost: 7.75 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 30.00, weightMax: 40.00, cost: 7.85 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 40.00, weightMax: 50.00, cost: 7.95 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 50.00, weightMax: 60.00, cost: 8.05 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 60.00, weightMax: 70.00, cost: 8.15 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 70.00, weightMax: 80.00, cost: 8.25 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 80.00, weightMax: 90.00, cost: 8.35 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 90.00, weightMax: 100.00, cost: 8.45 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 100.00, weightMax: 125.00, cost: 8.55 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 125.00, weightMax: 150.00, cost: 8.65 },
    { priceMin: 0.00, priceMax: 18.99, weightMin: 150.00, weightMax: Infinity, cost: 8.75 },

    // Faixa de preço: R$ 19,00 a R$ 48,99
    { priceMin: 19.00, priceMax: 48.99, weightMin: 0.00, weightMax: 0.30, cost: 6.55 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 0.30, weightMax: 0.50, cost: 6.65 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 0.50, weightMax: 1.00, cost: 6.75 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 1.00, weightMax: 1.50, cost: 6.85 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 1.50, weightMax: 2.00, cost: 6.95 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 2.00, weightMax: 3.00, cost: 7.95 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 3.00, weightMax: 4.00, cost: 8.15 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 4.00, weightMax: 5.00, cost: 8.35 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 5.00, weightMax: 6.00, cost: 8.55 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 6.00, weightMax: 7.00, cost: 8.75 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 7.00, weightMax: 8.00, cost: 8.95 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 8.00, weightMax: 9.00, cost: 9.15 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 9.00, weightMax: 11.00, cost: 9.55 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 11.00, weightMax: 13.00, cost: 9.95 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 13.00, weightMax: 15.00, cost: 10.15 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 15.00, weightMax: 17.00, cost: 10.35 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 17.00, weightMax: 20.00, cost: 10.55 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 20.00, weightMax: 25.00, cost: 10.95 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 25.00, weightMax: 30.00, cost: 11.15 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 30.00, weightMax: 40.00, cost: 11.35 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 40.00, weightMax: 50.00, cost: 11.55 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 50.00, weightMax: 60.00, cost: 11.75 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 60.00, weightMax: 70.00, cost: 11.95 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 70.00, weightMax: 80.00, cost: 12.15 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 80.00, weightMax: 90.00, cost: 12.35 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 90.00, weightMax: 100.00, cost: 12.55 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 100.00, weightMax: 125.00, cost: 12.75 },
    { priceMin: 19.00, priceMax: 48.99, weightMin: 125.00, weightMax: 150.00, cost: 12.75 }, // tabela repete 12,75 para 125-150? Confirmar
    { priceMin: 19.00, priceMax: 48.99, weightMin: 150.00, weightMax: Infinity, cost: 12.95 },

    // Faixa de preço: R$ 49,00 a R$ 78,99
    { priceMin: 49.00, priceMax: 78.99, weightMin: 0.00, weightMax: 0.30, cost: 7.75 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 0.30, weightMax: 0.50, cost: 7.85 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 0.50, weightMax: 1.00, cost: 7.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 1.00, weightMax: 1.50, cost: 8.05 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 1.50, weightMax: 2.00, cost: 8.15 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 2.00, weightMax: 3.00, cost: 8.55 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 3.00, weightMax: 4.00, cost: 8.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 4.00, weightMax: 5.00, cost: 9.75 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 5.00, weightMax: 6.00, cost: 9.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 6.00, weightMax: 7.00, cost: 10.15 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 7.00, weightMax: 8.00, cost: 10.35 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 8.00, weightMax: 9.00, cost: 10.55 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 9.00, weightMax: 11.00, cost: 10.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 11.00, weightMax: 13.00, cost: 11.35 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 13.00, weightMax: 15.00, cost: 11.55 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 15.00, weightMax: 17.00, cost: 11.75 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 17.00, weightMax: 20.00, cost: 11.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 20.00, weightMax: 25.00, cost: 12.15 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 25.00, weightMax: 30.00, cost: 12.35 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 30.00, weightMax: 40.00, cost: 12.55 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 40.00, weightMax: 50.00, cost: 12.75 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 50.00, weightMax: 60.00, cost: 12.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 60.00, weightMax: 70.00, cost: 13.15 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 70.00, weightMax: 80.00, cost: 13.35 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 80.00, weightMax: 90.00, cost: 13.55 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 90.00, weightMax: 100.00, cost: 13.75 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 100.00, weightMax: 125.00, cost: 13.95 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 125.00, weightMax: 150.00, cost: 14.15 },
    { priceMin: 49.00, priceMax: 78.99, weightMin: 150.00, weightMax: Infinity, cost: 14.35 },

    // Faixa de preço: R$ 79,00 a R$ 99,99
    { priceMin: 79.00, priceMax: 99.99, weightMin: 0.00, weightMax: 0.30, cost: 12.35 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 0.30, weightMax: 0.50, cost: 13.25 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 0.50, weightMax: 1.00, cost: 13.85 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 1.00, weightMax: 1.50, cost: 14.15 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 1.50, weightMax: 2.00, cost: 14.45 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 2.00, weightMax: 3.00, cost: 15.75 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 3.00, weightMax: 4.00, cost: 17.05 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 4.00, weightMax: 5.00, cost: 18.45 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 5.00, weightMax: 6.00, cost: 25.45 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 6.00, weightMax: 7.00, cost: 27.05 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 7.00, weightMax: 8.00, cost: 28.85 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 8.00, weightMax: 9.00, cost: 29.65 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 9.00, weightMax: 11.00, cost: 41.25 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 11.00, weightMax: 13.00, cost: 42.15 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 13.00, weightMax: 15.00, cost: 45.05 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 15.00, weightMax: 17.00, cost: 48.55 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 17.00, weightMax: 20.00, cost: 54.75 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 20.00, weightMax: 25.00, cost: 64.05 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 25.00, weightMax: 30.00, cost: 65.95 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 30.00, weightMax: 40.00, cost: 67.75 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 40.00, weightMax: 50.00, cost: 70.25 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 50.00, weightMax: 60.00, cost: 74.95 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 60.00, weightMax: 70.00, cost: 80.25 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 70.00, weightMax: 80.00, cost: 83.95 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 80.00, weightMax: 90.00, cost: 93.25 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 90.00, weightMax: 100.00, cost: 106.55 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 100.00, weightMax: 125.00, cost: 119.25 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 125.00, weightMax: 150.00, cost: 126.55 },
    { priceMin: 79.00, priceMax: 99.99, weightMin: 150.00, weightMax: Infinity, cost: 166.15 },

    // Faixa de preço: R$ 100,00 a R$ 119,99
    { priceMin: 100.00, priceMax: 119.99, weightMin: 0.00, weightMax: 0.30, cost: 14.35 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 0.30, weightMax: 0.50, cost: 15.45 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 0.50, weightMax: 1.00, cost: 16.15 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 1.00, weightMax: 1.50, cost: 16.45 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 1.50, weightMax: 2.00, cost: 16.85 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 2.00, weightMax: 3.00, cost: 18.35 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 3.00, weightMax: 4.00, cost: 19.85 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 4.00, weightMax: 5.00, cost: 21.55 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 5.00, weightMax: 6.00, cost: 28.55 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 6.00, weightMax: 7.00, cost: 31.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 7.00, weightMax: 8.00, cost: 33.65 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 8.00, weightMax: 9.00, cost: 34.55 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 9.00, weightMax: 11.00, cost: 48.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 11.00, weightMax: 13.00, cost: 49.25 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 13.00, weightMax: 15.00, cost: 52.45 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 15.00, weightMax: 17.00, cost: 56.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 17.00, weightMax: 20.00, cost: 63.85 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 20.00, weightMax: 25.00, cost: 75.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 25.00, weightMax: 30.00, cost: 75.45 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 30.00, weightMax: 40.00, cost: 78.95 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 40.00, weightMax: 50.00, cost: 81.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 50.00, weightMax: 60.00, cost: 86.45 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 60.00, weightMax: 70.00, cost: 92.95 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 70.00, weightMax: 80.00, cost: 97.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 80.00, weightMax: 90.00, cost: 107.45 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 90.00, weightMax: 100.00, cost: 123.95 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 100.00, weightMax: 125.00, cost: 138.05 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 125.00, weightMax: 150.00, cost: 146.15 },
    { priceMin: 100.00, priceMax: 119.99, weightMin: 150.00, weightMax: Infinity, cost: 192.45 },

    // Faixa de preço: R$ 120,00 a R$ 149,99
    { priceMin: 120.00, priceMax: 149.99, weightMin: 0.00, weightMax: 0.30, cost: 16.45 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 0.30, weightMax: 0.50, cost: 17.65 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 0.50, weightMax: 1.00, cost: 18.45 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 1.00, weightMax: 1.50, cost: 18.85 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 1.50, weightMax: 2.00, cost: 19.25 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 2.00, weightMax: 3.00, cost: 21.05 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 3.00, weightMax: 4.00, cost: 22.65 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 4.00, weightMax: 5.00, cost: 24.65 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 5.00, weightMax: 6.00, cost: 32.65 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 6.00, weightMax: 7.00, cost: 36.05 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 7.00, weightMax: 8.00, cost: 38.45 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 8.00, weightMax: 9.00, cost: 39.55 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 9.00, weightMax: 11.00, cost: 54.95 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 11.00, weightMax: 13.00, cost: 56.25 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 13.00, weightMax: 15.00, cost: 59.95 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 15.00, weightMax: 17.00, cost: 63.55 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 17.00, weightMax: 20.00, cost: 72.95 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 20.00, weightMax: 25.00, cost: 84.75 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 25.00, weightMax: 30.00, cost: 85.55 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 30.00, weightMax: 40.00, cost: 88.95 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 40.00, weightMax: 50.00, cost: 92.05 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 50.00, weightMax: 60.00, cost: 98.15 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 60.00, weightMax: 70.00, cost: 105.05 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 70.00, weightMax: 80.00, cost: 109.85 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 80.00, weightMax: 90.00, cost: 122.05 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 90.00, weightMax: 100.00, cost: 139.55 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 100.00, weightMax: 125.00, cost: 156.05 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 125.00, weightMax: 150.00, cost: 165.65 },
    { priceMin: 120.00, priceMax: 149.99, weightMin: 150.00, weightMax: Infinity, cost: 217.55 },

    // Faixa de preço: R$ 150,00 a R$ 199,99
    { priceMin: 150.00, priceMax: 199.99, weightMin: 0.00, weightMax: 0.30, cost: 18.45 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 0.30, weightMax: 0.50, cost: 19.85 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 0.50, weightMax: 1.00, cost: 20.75 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 1.00, weightMax: 1.50, cost: 21.15 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 1.50, weightMax: 2.00, cost: 21.65 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 2.00, weightMax: 3.00, cost: 23.65 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 3.00, weightMax: 4.00, cost: 25.55 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 4.00, weightMax: 5.00, cost: 27.75 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 5.00, weightMax: 6.00, cost: 35.75 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 6.00, weightMax: 7.00, cost: 40.05 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 7.00, weightMax: 8.00, cost: 43.25 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 8.00, weightMax: 9.00, cost: 44.45 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 9.00, weightMax: 11.00, cost: 61.75 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 11.00, weightMax: 13.00, cost: 63.25 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 13.00, weightMax: 15.00, cost: 67.45 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 15.00, weightMax: 17.00, cost: 70.75 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 17.00, weightMax: 20.00, cost: 82.05 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 20.00, weightMax: 25.00, cost: 95.35 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 25.00, weightMax: 30.00, cost: 96.25 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 30.00, weightMax: 40.00, cost: 99.15 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 40.00, weightMax: 50.00, cost: 102.55 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 50.00, weightMax: 60.00, cost: 109.35 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 60.00, weightMax: 70.00, cost: 117.15 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 70.00, weightMax: 80.00, cost: 122.45 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 80.00, weightMax: 90.00, cost: 136.05 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 90.00, weightMax: 100.00, cost: 155.55 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 100.00, weightMax: 125.00, cost: 173.95 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 125.00, weightMax: 150.00, cost: 184.65 },
    { priceMin: 150.00, priceMax: 199.99, weightMin: 150.00, weightMax: Infinity, cost: 242.55 },

    // Faixa de preço: R$ 200,00 ou mais
    { priceMin: 200.00, priceMax: Infinity, weightMin: 0.00, weightMax: 0.30, cost: 20.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 0.30, weightMax: 0.50, cost: 22.55 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 0.50, weightMax: 1.00, cost: 23.65 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 1.00, weightMax: 1.50, cost: 24.65 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 1.50, weightMax: 2.00, cost: 24.65 }, // tabela repete 24,65 para 1,5-2 e 2-3? Confirmar
    { priceMin: 200.00, priceMax: Infinity, weightMin: 2.00, weightMax: 3.00, cost: 26.25 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 3.00, weightMax: 4.00, cost: 28.35 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 4.00, weightMax: 5.00, cost: 30.75 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 5.00, weightMax: 6.00, cost: 39.75 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 6.00, weightMax: 7.00, cost: 44.05 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 7.00, weightMax: 8.00, cost: 48.05 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 8.00, weightMax: 9.00, cost: 49.35 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 9.00, weightMax: 11.00, cost: 68.65 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 11.00, weightMax: 13.00, cost: 70.25 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 13.00, weightMax: 15.00, cost: 74.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 15.00, weightMax: 17.00, cost: 78.65 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 17.00, weightMax: 20.00, cost: 91.15 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 20.00, weightMax: 25.00, cost: 105.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 25.00, weightMax: 30.00, cost: 106.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 30.00, weightMax: 40.00, cost: 107.05 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 40.00, weightMax: 50.00, cost: 110.75 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 50.00, weightMax: 60.00, cost: 118.15 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 60.00, weightMax: 70.00, cost: 126.55 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 70.00, weightMax: 80.00, cost: 132.25 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 80.00, weightMax: 90.00, cost: 146.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 90.00, weightMax: 100.00, cost: 167.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 100.00, weightMax: 125.00, cost: 187.95 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 125.00, weightMax: 150.00, cost: 199.45 },
    { priceMin: 200.00, priceMax: Infinity, weightMin: 150.00, weightMax: Infinity, cost: 261.95 }
];

// Tabela opcional para frete grátis e rápido (produtos < R$79)
const SHIPPING_FAST_COST_TABLE = [
    { priceMin: 0.00, priceMax: 78.99, weightMin: 0.00, weightMax: 0.30, cost: 12.35 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 0.30, weightMax: 0.50, cost: 13.25 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 0.50, weightMax: 1.00, cost: 13.85 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 1.00, weightMax: 1.50, cost: 14.15 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 1.50, weightMax: 2.00, cost: 14.45 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 2.00, weightMax: 3.00, cost: 15.75 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 3.00, weightMax: 4.00, cost: 17.05 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 4.00, weightMax: 5.00, cost: 18.45 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 5.00, weightMax: 6.00, cost: 25.45 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 6.00, weightMax: 7.00, cost: 27.05 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 7.00, weightMax: 8.00, cost: 28.85 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 8.00, weightMax: 9.00, cost: 29.65 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 9.00, weightMax: 11.00, cost: 41.25 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 11.00, weightMax: 13.00, cost: 42.15 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 13.00, weightMax: 15.00, cost: 45.05 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 15.00, weightMax: 17.00, cost: 48.55 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 17.00, weightMax: 20.00, cost: 54.75 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 20.00, weightMax: 25.00, cost: 64.05 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 25.00, weightMax: 30.00, cost: 65.95 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 30.00, weightMax: 40.00, cost: 67.75 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 40.00, weightMax: 50.00, cost: 70.25 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 50.00, weightMax: 60.00, cost: 74.95 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 60.00, weightMax: 70.00, cost: 80.25 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 70.00, weightMax: 80.00, cost: 83.95 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 80.00, weightMax: 90.00, cost: 93.25 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 90.00, weightMax: 100.00, cost: 106.55 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 100.00, weightMax: 125.00, cost: 119.25 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 125.00, weightMax: 150.00, cost: 126.55 },
    { priceMin: 0.00, priceMax: 78.99, weightMin: 150.00, weightMax: Infinity, cost: 166.15 }
];

// ============================================
// FUNÇÕES AUXILIARES
// ============================================

/**
 * Retorna o custo esperado de frete com base no preço e peso do produto.
 * @param {number} price - Preço do produto (unitário)
 * @param {number} weight - Peso em kg
 * @param {boolean} fastShipping - Se true, usa a tabela de frete grátis e rápido (para produtos < R$79)
 * @returns {number|null} Custo esperado ou null se não encontrado
 */
function getExpectedShippingCost(price, weight, fastShipping = false) {
    const table = fastShipping ? SHIPPING_FAST_COST_TABLE : SHIPPING_COST_TABLE;
    
    // Encontra a linha correspondente
    for (const row of table) {
        if (price >= row.priceMin && price <= row.priceMax) {
            if (weight >= row.weightMin && weight <= row.weightMax) {
                let cost = row.cost;
                
                // Regra especial: produtos com preço < R$19 pagam no máximo metade do preço
                if (price < 19 && !fastShipping) {
                    const maxAllowed = price / 2;
                    if (cost > maxAllowed) {
                        cost = maxAllowed;
                    }
                }
                return cost;
            }
        }
    }
    
    // Se não encontrou, retorna null
    console.warn(`Custo não encontrado para price=${price}, weight=${weight}, fastShipping=${fastShipping}`);
    return null;
}

/**
 * Obtém o custo real de frete de um shipment via API do Mercado Livre.
 * @param {string|number} shipmentId - ID do envio
 * @returns {Promise<number|null>} Custo real ou null em caso de erro
 */
async function getActualShippingCost(shipmentId) {
    try {
        // Usa o token manager existente
        if (!window.getValidToken) {
            throw new Error('Token manager não disponível');
        }
        
        const tokenData = await window.getValidToken();
        if (!tokenData || !tokenData.access_token) {
            throw new Error('Token inválido');
        }
        
        const url = `https://api.mercadolibre.com/shipments/${shipmentId}/costs`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'x-format-new': 'true'
            }
        });
        
        if (!response.ok) {
            console.error(`Erro API (${response.status}) para shipment ${shipmentId}`);
            return null;
        }
        
        const data = await response.json();
        
        // O custo para o vendedor está em senders[0].cost
        if (data.senders && data.senders.length > 0) {
            return data.senders[0].cost;
        }
        
        // Fallback: se não houver senders, tenta gross_amount (sem descontos)
        if (data.gross_amount !== undefined) {
            return data.gross_amount;
        }
        
        return null;
    } catch (error) {
        console.error(`Erro ao obter custo real do shipment ${shipmentId}:`, error);
        return null;
    }
}

/**
 * Verifica divergência de frete para uma venda.
 * @param {Object} venda - Objeto da venda (deve conter id_venda_ml, id_envio, valor_unitario, quantidade, peso)
 * @returns {Promise<Object|null>} Resultado da verificação ou null se não for possível
 */
async function checkShippingDivergence(venda) {
    if (!venda.id_envio) {
        console.log(`Venda ${venda.id_venda_ml} sem ID de envio`);
        return null;
    }
    
    // Peso deve estar em kg
    const peso = venda.peso || 0;
    if (peso <= 0) {
        console.log(`Venda ${venda.id_venda_ml} sem peso definido`);
        return null;
    }
    
    // Preço unitário do produto (usado para calcular o frete)
    const precoUnitario = venda.valor_unitario || (venda.valor_total / venda.quantidade) || 0;
    
    // Custo real via API
    const custoReal = await getActualShippingCost(venda.id_envio);
    if (custoReal === null) return null;
    
    // Custo esperado (frete normal, não rápido)
    const custoEsperado = getExpectedShippingCost(precoUnitario, peso, false);
    if (custoEsperado === null) return null;
    
    const divergencia = custoReal - custoEsperado;
    const tolerancia = 0.01; // centavos
    const status = Math.abs(divergencia) <= tolerancia ? 'ok' : 'divergente';
    
    return {
        vendaId: venda.id_venda_ml,
        shipmentId: venda.id_envio,
        precoUnitario,
        peso,
        custoReal,
        custoEsperado,
        divergencia,
        status
    };
}

// ============================================
// INTERFACE DA ABA DE FRETE
// ============================================

let vendasParaVerificar = [];
let resultadosVerificacao = [];

/**
 * Carrega as vendas do banco e exibe na tabela da aba de frete.
 */
async function carregarVendasParaVerificacao() {
    try {
        const { data, error } = await supabaseClient
            .from('vendas_ml')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100); // limitar para não sobrecarregar
            
        if (error) throw error;
        
        vendasParaVerificar = data || [];
        exibirVendasTabela(vendasParaVerificar);
    } catch (error) {
        console.error('Erro ao carregar vendas:', error);
        if (window.showToast) {
            window.showToast('Erro ao carregar vendas', 'error');
        }
    }
}

/**
 * Exibe a tabela de vendas com inputs para peso.
 * @param {Array} vendas 
 */
function exibirVendasTabela(vendas) {
    const tbody = document.getElementById('shippingTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!vendas || vendas.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-5">
                    <i class="fas fa-truck fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                    <h4>Nenhuma venda encontrada</h4>
                </td>
            </tr>
        `;
        return;
    }
    
    vendas.forEach(venda => {
        // Verifica se já existe resultado para esta venda
        const resultado = resultadosVerificacao.find(r => r.vendaId === venda.id_venda_ml);
        
        const row = document.createElement('tr');
        
        // Formata valores
        const precoUnitario = venda.valor_unitario || (venda.valor_total / venda.quantidade) || 0;
        
        row.innerHTML = `
            <td>${venda.id_venda_ml}</td>
            <td>${venda.sku || 'N/I'}</td>
            <td>R$ ${precoUnitario.toFixed(2)}</td>
            <td>
                <input type="number" class="peso-input" data-id="${venda.id_venda_ml}" 
                       value="${venda.peso || 0}" step="0.1" min="0" 
                       style="width:80px; padding:4px; border:1px solid #ddd; border-radius:4px;">
            </td>
            <td class="custo-real" data-id="${venda.id_venda_ml}">
                ${resultado ? `R$ ${resultado.custoReal.toFixed(2)}` : '-'}
            </td>
            <td class="custo-esperado" data-id="${venda.id_venda_ml}">
                ${resultado ? `R$ ${resultado.custoEsperado.toFixed(2)}` : '-'}
            </td>
            <td class="divergencia" data-id="${venda.id_venda_ml}">
                ${resultado ? `R$ ${resultado.divergencia.toFixed(2)}` : '-'}
            </td>
            <td class="status" data-id="${venda.id_venda_ml}">
                ${resultado ? (resultado.status === 'ok' 
                    ? '<span class="badge badge-success">OK</span>' 
                    : '<span class="badge badge-danger">Divergente</span>') 
                    : '<span class="badge badge-secondary">Pendente</span>'}
            </td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="shippingManager.verificarVenda('${venda.id_venda_ml}')">
                    <i class="fas fa-check"></i> Verificar
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

/**
 * Atualiza a linha da tabela com os resultados da verificação.
 * @param {string} idVenda 
 * @param {Object} resultado 
 */
function atualizarLinhaResultado(idVenda, resultado) {
    const row = document.querySelector(`.peso-input[data-id="${idVenda}"]`)?.closest('tr');
    if (!row) return;
    
    const cells = row.cells;
    cells[4].innerHTML = `R$ ${resultado.custoReal.toFixed(2)}`;
    cells[5].innerHTML = `R$ ${resultado.custoEsperado.toFixed(2)}`;
    cells[6].innerHTML = `R$ ${resultado.divergencia.toFixed(2)}`;
    cells[7].innerHTML = resultado.status === 'ok' 
        ? '<span class="badge badge-success">OK</span>' 
        : '<span class="badge badge-danger">Divergente</span>';
}

/**
 * Salva o peso da venda no banco de dados.
 * @param {string} idVenda 
 * @param {number} peso 
 */
async function salvarPesoVenda(idVenda, peso) {
    try {
        await supabaseClient
            .from('vendas_ml')
            .update({ peso })
            .eq('id_venda_ml', idVenda);
    } catch (error) {
        console.error('Erro ao salvar peso:', error);
    }
}

/**
 * Verifica uma venda individual.
 * @param {string} idVenda 
 */
async function verificarVenda(idVenda) {
    // Encontra a venda
    const venda = vendasParaVerificar.find(v => v.id_venda_ml === idVenda);
    if (!venda) {
        console.warn('Venda não encontrada:', idVenda);
        return;
    }
    
    // Obtém o peso do input
    const pesoInput = document.querySelector(`.peso-input[data-id="${idVenda}"]`);
    if (!pesoInput) return;
    
    const peso = parseFloat(pesoInput.value);
    if (isNaN(peso) || peso <= 0) {
        if (window.showToast) {
            window.showToast('Informe um peso válido (maior que zero)', 'warning');
        }
        return;
    }
    
    // Atualiza o objeto da venda
    venda.peso = peso;
    
    // Salva o peso no banco (opcional)
    await salvarPesoVenda(idVenda, peso);
    
    // Executa a verificação
    const resultado = await checkShippingDivergence(venda);
    if (!resultado) {
        if (window.showToast) {
            window.showToast('Não foi possível verificar esta venda', 'error');
        }
        return;
    }
    
    // Armazena o resultado
    const index = resultadosVerificacao.findIndex(r => r.vendaId === idVenda);
    if (index >= 0) {
        resultadosVerificacao[index] = resultado;
    } else {
        resultadosVerificacao.push(resultado);
    }
    
    // Atualiza a interface
    atualizarLinhaResultado(idVenda, resultado);
    
    if (window.showToast) {
        window.showToast('Verificação concluída!', 'success');
    }
}

/**
 * Verifica todas as vendas pendentes (que ainda não têm resultado).
 */
async function verificarVendasPendentes() {
    const linhas = document.querySelectorAll('#shippingTableBody tr');
    const idsPendentes = [];
    
    linhas.forEach(row => {
        const statusCell = row.cells[7];
        if (statusCell.textContent.includes('Pendente')) {
            const pesoInput = row.querySelector('.peso-input');
            if (pesoInput && pesoInput.value > 0) {
                idsPendentes.push(pesoInput.dataset.id);
            }
        }
    });
    
    if (idsPendentes.length === 0) {
        if (window.showToast) {
            window.showToast('Nenhuma venda pendente com peso informado', 'info');
        }
        return;
    }
    
    // Mostra um toast informando o início
    if (window.showToast) {
        window.showToast(`Verificando ${idsPendentes.length} vendas...`, 'info');
    }
    
    for (let i = 0; i < idsPendentes.length; i++) {
        const id = idsPendentes[i];
        await verificarVenda(id);
        
        // Aguarda um pouco entre chamadas para não sobrecarregar a API
        await new Promise(resolve => setTimeout(resolve, 600));
    }
    
    if (window.showToast) {
        window.showToast('Verificação em lote concluída!', 'success');
    }
}

/**
 * Exporta os resultados para Excel.
 */
function exportarDivergencias() {
    if (resultadosVerificacao.length === 0) {
        if (window.showToast) {
            window.showToast('Nenhum resultado para exportar', 'warning');
        }
        return;
    }
    
    const dados = resultadosVerificacao.map(r => ({
        'ID Venda': r.vendaId,
        'Shipment ID': r.shipmentId,
        'Preço Unitário': r.precoUnitario,
        'Peso (kg)': r.peso,
        'Custo Real': r.custoReal,
        'Custo Esperado': r.custoEsperado,
        'Diferença': r.divergencia,
        'Status': r.status === 'ok' ? 'OK' : 'Divergente'
    }));
    
    if (window.XLSX) {
        const ws = XLSX.utils.json_to_sheet(dados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Divergências');
        XLSX.writeFile(wb, `divergencias_frete_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
        console.log('Dados para exportação:', dados);
        if (window.showToast) {
            window.showToast('Biblioteca XLSX não disponível', 'error');
        }
    }
}

// ============================================
// EXPORTAÇÃO PÚBLICA
// ============================================

window.shippingManager = {
    carregarVendasParaVerificacao,
    verificarVenda,
    verificarVendasPendentes,
    exportarDivergencias
};