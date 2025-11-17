// Aplicação principal - Gerencia os produtos
class AppAnuncios {
    constructor() {
        this.products = [];
        this.apiUrl = '/api/products';
        this.init();
    }

    async init() {
        await this.loadProducts();
        this.setupEventListeners();
    }

    // Carrega produtos da API
    async loadProducts() {
        try {
            const response = await fetch(this.apiUrl);
            if (!response.ok) {
                throw new Error('Erro ao carregar produtos');
            }
            this.products = await response.json();
            this.renderProducts();
        } catch (error) {
            console.error('Erro:', error);
            this.showError('Erro ao carregar produtos. Verifique se a API está rodando.');
        }
    }

    // Renderiza produtos na tela
    renderProducts(filteredProducts = null) {
        const productsToRender = filteredProducts || this.products;
        const productsList = document.getElementById('productsList');
        
        if (!productsList) return;

        if (productsToRender.length === 0) {
            productsList.innerHTML = '<p class="no-products">Nenhum produto encontrado.</p>';
            return;
        }

        productsList.innerHTML = productsToRender.map(product => `
            <div class="product-card" data-category="${product.category}">
                <h3>${product.name}</h3>
                <div class="product-price">R$ ${product.price.toFixed(2)}</div>
                <span class="product-category">${product.category}</span>
                <p class="product-description">${product.description}</p>
                <div class="product-image">
                    <img src="${product.image || '/logo.png'}" alt="${product.name}" style="max-width: 100px;">
                </div>
            </div>
        `).join('');
    }

    // Configura event listeners
    setupEventListeners() {
        // Formulário de novo produto
        const productForm = document.getElementById('productForm');
        if (productForm) {
            productForm.addEventListener('submit', (e) => this.handleAddProduct(e));
        }

        // Filtro de busca
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterProducts());
        }

        // Filtro de categoria
        const categoryFilter = document.getElementById('categoryFilter');
        if (categoryFilter) {
            categoryFilter.addEventListener('change', (e) => this.filterProducts());
        }
    }

    // Filtra produtos
    filterProducts() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase();
        const category = document.getElementById('categoryFilter').value;

        const filtered = this.products.filter(product => {
            const matchesSearch = product.name.toLowerCase().includes(searchTerm) ||
                                product.description.toLowerCase().includes(searchTerm);
            const matchesCategory = !category || product.category === category;
            return matchesSearch && matchesCategory;
        });

        this.renderProducts(filtered);
    }

    // Adiciona novo produto
    async handleAddProduct(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('productName').value,
            price: parseFloat(document.getElementById('productPrice').value),
            category: document.getElementById('productCategory').value,
            description: document.getElementById('productDescription').value
        };

        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                throw new Error('Erro ao adicionar produto');
            }

            const newProduct = await response.json();
            this.products.push(newProduct);
            this.renderProducts();
            this.resetForm();
            this.showSuccess('Produto adicionado com sucesso!');
            
        } catch (error) {
            console.error('Erro:', error);
            this.showError('Erro ao adicionar produto. Tente novamente.');
        }
    }

    // Reseta o formulário
    resetForm() {
        document.getElementById('productForm').reset();
    }

    // Mostra mensagem de sucesso
    showSuccess(message) {
        alert(message); // Pode ser substituído por um toast mais elegante
    }

    // Mostra mensagem de erro
    showError(message) {
        alert('Erro: ' + message); // Pode ser substituído por um toast mais elegante
    }
}

// Inicializa a aplicação quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', () => {
    new AppAnuncios();
});