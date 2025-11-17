// API para gerenciar produtos/anúncios
export default function handler(req, res) {
  // Configurar CORS para permitir requisições
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Dados de exemplo para produtos
  const products = [
    { 
      id: 1, 
      name: "Smartphone Samsung", 
      price: 1200.00,
      category: "Eletrônicos",
      description: "Smartphone Samsung Galaxy com 128GB",
      image: "/logo.png"
    },
    { 
      id: 2, 
      name: "Notebook Dell", 
      price: 2500.00,
      category: "Informática",
      description: "Notebook Dell i5 8GB RAM 256GB SSD",
      image: "/logo.png"
    },
    { 
      id: 3, 
      name: "Fone de Ouvido Bluetooth", 
      price: 150.00,
      category: "Áudio",
      description: "Fone sem fio com cancelamento de ruído",
      image: "/logo.png"
    }
  ];

  // GET - Listar todos os produtos
  if (req.method === 'GET') {
    return res.status(200).json(products);
  }

  // POST - Adicionar novo produto
  if (req.method === 'POST') {
    try {
      const newProduct = {
        id: products.length + 1,
        ...req.body,
        createdAt: new Date().toISOString()
      };
      products.push(newProduct);
      return res.status(201).json(newProduct);
    } catch (error) {
      return res.status(400).json({ error: "Dados inválidos" });
    }
  }

  // Método não suportado
  return res.status(405).json({ error: "Método não permitido" });
}