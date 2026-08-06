// ============================================
// GESTÃO DE ESTOQUE - VERSÃO COMPLETA COM CATEGORIAS, MLB E SINCRONIZAÇÃO ML
// ============================================

let produtosEstoque = [];
// ===== VARIÁVEIS DE PAGINAÇÃO =====
let paginaAtualEstoque = 1;
let itensPorPaginaEstoque = 20;
let produtosFiltradosAtuais = [];
// ===== VARIÁVEIS PARA MODAL FULL DETECTADOS =====
let fullDetectados = [];
let fullConfirmados = new Set();

// ===== VARIÁVEIS DE ORDENAÇÃO =====
let ordemColunaEstoque = { coluna: 'id', direcao: 'asc' };

// ===== USUÁRIOS AUTORIZADOS A MODIFICAR SINCRONIZAÇÃO =====
const usuariosAutorizadosSync = ['andressamiotto', 'ronald', 'bruna', 'arthur'];

// ===== USUÁRIOS QUE PODEM VER CUSTOS =====
const usuariosVerCusto = ['andressamiotto', 'ronald'];

// ===== USUÁRIOS ADMIN =====
const usuariosAdmin = ['andressamiotto', 'ronald', 'leticia'];

// ===== USUÁRIOS AUTORIZADOS A MODIFICAR REGRAS =====
const usuariosRegraEstoque = ['andressamiotto', 'ronald', 'bruna', 'arthur'];

// =========================================================
// REGRAS DE ESTOQUE CONDICIONAIS (VALOR DO ANÚNCIO + QUANTIDADE)
// =========================================================

const regrasEstoquePadrao = {
    'Eixos': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'Parafusos': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'Rolamentos': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'Raios': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'Arruelas': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'Porcas': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'CapacetesEPartes': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    },
    'outros': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 2 },
            { operador: 'padrao', estoque_maximo: 10 }
        ]
    }
};

let regrasEstoqueAtuais = {};
let regrasEstoqueIndividuais = {};
let categoriasCustomizadas = {};

// ===== PERSISTÊNCIA DE FILTROS E PAGINAÇÃO =====
let estadoFiltrosEstoque = {
    termo: '',
    categoria: '',
    pagina: 1,
    itensPorPagina: 20,
    colunaOrdem: 'id',
    direcaoOrdem: 'asc'
};

// =========================================================
// FUNÇÕES PARA VERIFICAÇÃO DE DUPLICIDADE POR 5 PRIMEIROS CARACTERES
// =========================================================

function verificarDuplicidadeSKU(novoSKU, idIgnorar = null) {
    if (!novoSKU) return { duplicado: false };
    
    const prefixo = novoSKU.trim().substring(0, 5).toUpperCase();
    if (prefixo.length < 5) return { duplicado: false };
    
    const existente = produtosEstoque.find(p => {
        if (idIgnorar && p.id == idIgnorar) return false;
        const pSku = (p.sku || '').trim().toUpperCase();
        return pSku.substring(0, 5) === prefixo;
    });
    
    if (existente) {
        return {
            duplicado: true,
            produto: existente,
            mensagem: `Já existe um produto com o prefixo "${prefixo}" (SKU: ${existente.sku} - ${existente.nome})`
        };
    }
    
    return { duplicado: false };
}

// =========================================================
// FUNÇÕES PARA CATEGORIAS CUSTOMIZADAS
// =========================================================

function getCamposPorCategoria(categoria) {
    // Verifica se é uma categoria customizada
    if (categoriasCustomizadas[categoria]) {
        return categoriasCustomizadas[categoria].campos || [];
    }
    // Verifica se é uma categoria padrão
    if (camposPorCategoria[categoria]) {
        return camposPorCategoria[categoria];
    }
    return camposPorCategoria['outros'] || [];
}

// ===== FUNÇÃO PARA SALVAR CATEGORIAS CUSTOMIZADAS =====
async function salvarCategoriasCustomizadas() {
    try {
        if (!window.supabaseClient) {
            localStorage.setItem('categorias_customizadas', JSON.stringify(categoriasCustomizadas));
            showToast('✅ Categorias salvas no localStorage!', 'success');
            return;
        }
        
        const { error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .upsert({
                chave: 'categorias_customizadas',
                valor: JSON.stringify(categoriasCustomizadas),
                atualizado_em: new Date().toISOString(),
                atualizado_por: currentUser?.name || 'sistema'
            }, { onConflict: 'chave' });
        
        if (error) throw error;
        showToast('✅ Categorias customizadas salvas!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar categorias customizadas:', error);
        showToast('Erro ao salvar categorias: ' + error.message, 'error');
    }
}

// ===== FUNÇÃO PARA CARREGAR CATEGORIAS CUSTOMIZADAS =====
async function carregarCategoriasCustomizadas() {
    try {
        if (!window.supabaseClient) {
            const localData = localStorage.getItem('categorias_customizadas');
            if (localData) {
                categoriasCustomizadas = JSON.parse(localData);
                console.log('✅ Categorias customizadas carregadas do localStorage');
            }
            return;
        }
        
        const { data, error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .select('*')
            .eq('chave', 'categorias_customizadas')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Erro ao carregar categorias customizadas:', error);
            return;
        }
        
        if (data && data.valor) {
            categoriasCustomizadas = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
            console.log('✅ Categorias customizadas carregadas:', Object.keys(categoriasCustomizadas).length);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar categorias customizadas:', error);
        categoriasCustomizadas = {};
    }
}

// ===== ABRIR MODAL DE CATEGORIAS =====
function abrirModalCategorias() {
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    
    if (!isAdmin) {
        showToast('⚠️ Apenas administradores podem gerenciar categorias.', 'warning');
        return;
    }
    
    let modal = document.getElementById('modalCategorias');
    if (!modal) {
        modal = criarModalCategorias();
    }
    
    preencherListaCategorias();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

// ===== CRIAR MODAL DE CATEGORIAS =====
function criarModalCategorias() {
    const modal = document.createElement('div');
    modal.id = 'modalCategorias';
    modal.className = 'modal hidden';
    modal.style.cssText = 'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999;';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; background: white; padding: 30px; border-radius: 12px; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3><i class="fas fa-tags" style="color: #00ADEE;"></i> Gerenciar Categorias</h3>
                <button onclick="fecharModalCategorias()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">&times;</button>
            </div>
            
            <div style="background: #fff3cd; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <i class="fas fa-info-circle"></i> 
                <strong>Categorias customizadas</strong> - Crie novas categorias com campos específicos.
                <br>O campo <strong>mlb_codes</strong> é obrigatório para TODAS as categorias.
            </div>
            
            <!-- Formulário de nova categoria -->
            <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #fafafa;">
                <h4 style="margin-top: 0;"><i class="fas fa-plus-circle"></i> Nova Categoria</h4>
                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Nome da Categoria *</label>
                            <input type="text" id="novaCategoriaNome" class="form-control" placeholder="Ex: Freios, Pneus, etc.">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Tipo de Variação *</label>
                            <select id="novaCategoriaTipo" class="form-control" onchange="toggleCamposNovaCategoria()">
                                <option value="texto">Texto</option>
                                <option value="numero">Número</option>
                                <option value="selecao">Seleção (lista)</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="form-group" id="novaCategoriaOpcoesGroup" style="display: none;">
                    <label>Opções (separadas por vírgula) *</label>
                    <input type="text" id="novaCategoriaOpcoes" class="form-control" placeholder="Ex: Shimano, Sram, Campagnolo">
                    <small class="text-muted">Separe as opções por vírgula</small>
                </div>
                <div class="form-group">
                    <label>Nome do Campo</label>
                    <input type="text" id="novaCategoriaCampoNome" class="form-control" placeholder="Ex: marca, tamanho, cor" value="atributo">
                </div>
                <button class="btn btn-success" onclick="adicionarCategoriaCustomizada()">
                    <i class="fas fa-plus"></i> Adicionar Categoria
                </button>
            </div>
            
            <!-- Lista de categorias -->
            <h4><i class="fas fa-list"></i> Categorias Existentes</h4>
            <div id="listaCategoriasContainer">
                <!-- Lista será preenchida dinamicamente -->
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #dee2e6; padding-top: 20px;">
                <button class="btn btn-secondary" onclick="fecharModalCategorias()">Fechar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

// ===== TOGGLE CAMPOS DA NOVA CATEGORIA =====
function toggleCamposNovaCategoria() {
    const tipo = document.getElementById('novaCategoriaTipo').value;
    const opcoesGroup = document.getElementById('novaCategoriaOpcoesGroup');
    if (tipo === 'selecao') {
        opcoesGroup.style.display = 'block';
    } else {
        opcoesGroup.style.display = 'none';
    }
}

// ===== ADICIONAR CATEGORIA CUSTOMIZADA =====
function adicionarCategoriaCustomizada() {
    const nome = document.getElementById('novaCategoriaNome').value.trim();
    const tipo = document.getElementById('novaCategoriaTipo').value;
    const campoNome = document.getElementById('novaCategoriaCampoNome').value.trim() || 'atributo';
    const opcoesText = document.getElementById('novaCategoriaOpcoes').value.trim();
    
    if (!nome) {
        showToast('⚠️ Informe o nome da categoria', 'warning');
        return;
    }
    
    // Verificar se já existe
    if (categoriasCustomizadas[nome] || camposPorCategoria[nome]) {
        showToast(`⚠️ A categoria "${nome}" já existe`, 'warning');
        return;
    }
    
    const campo = {
        nome: campoNome,
        label: campoNome.charAt(0).toUpperCase() + campoNome.slice(1),
        tipo: tipo,
        obrigatorio: false
    };
    
    if (tipo === 'selecao') {
        if (!opcoesText) {
            showToast('⚠️ Informe as opções para a seleção', 'warning');
            return;
        }
        campo.opcoes = opcoesText.split(',').map(s => s.trim()).filter(s => s);
        if (campo.opcoes.length === 0) {
            showToast('⚠️ Informe pelo menos uma opção', 'warning');
            return;
        }
    }
    
    if (tipo === 'number' || tipo === 'numero') {
        campo.tipo = 'number';
        campo.step = '0.01';
        campo.min = '0';
    }
    
    // Adicionar mlb_codes obrigatório para todas as categorias
    const campos = [campo];
    
    // Adicionar campo mlb_codes (obrigatório para todas)
    campos.push({
        nome: 'mlb_codes',
        label: 'Códigos MLB',
        tipo: 'textarea',
        placeholder: 'MLB separados por vírgula (ex: MLB123, MLB456)',
        obrigatorio: false,
        rows: 2
    });
    
    categoriasCustomizadas[nome] = {
        campos: campos,
        criado_por: currentUser?.name || 'sistema',
        criado_em: new Date().toISOString()
    };

    // ===== ADICIONAR REGRAS PADRÃO PARA A NOVA CATEGORIA =====
    if (!regrasEstoqueAtuais[nome]) {
        regrasEstoqueAtuais[nome] = {
            condicoes: [
                { operador: 'padrao', estoque_maximo: 30 }
            ]
        };
        salvarRegrasEstoque(regrasEstoqueAtuais);
    }
    
    salvarCategoriasCustomizadas();
    preencherListaCategorias();
    atualizarSelectCategorias();
    
    // Limpar formulário
    document.getElementById('novaCategoriaNome').value = '';
    document.getElementById('novaCategoriaCampoNome').value = 'atributo';
    document.getElementById('novaCategoriaOpcoes').value = '';
    document.getElementById('novaCategoriaTipo').value = 'texto';
    document.getElementById('novaCategoriaOpcoesGroup').style.display = 'none';
    
    showToast(`✅ Categoria "${nome}" adicionada com sucesso!`, 'success');
}

// ===== EXCLUIR CATEGORIA CUSTOMIZADA =====
function excluirCategoriaCustomizada(nome) {
    if (!confirm(`Excluir a categoria "${nome}"? Esta ação não pode ser desfeita.`)) return;
    
    // Verificar se há produtos usando esta categoria
    const produtosNaCategoria = produtosEstoque.filter(p => p.categoria === nome);
    if (produtosNaCategoria.length > 0) {
        if (!confirm(`Atenção: ${produtosNaCategoria.length} produto(s) usam esta categoria. Deseja excluir mesmo assim?`)) return;
    }
    
    delete categoriasCustomizadas[nome];
    salvarCategoriasCustomizadas();
    preencherListaCategorias();
    atualizarSelectCategorias();
    showToast(`🗑️ Categoria "${nome}" excluída`, 'success');
}

// ===== PREENCHER LISTA DE CATEGORIAS =====
function preencherListaCategorias() {
    const container = document.getElementById('listaCategoriasContainer');
    if (!container) return;
    
    const todasCategorias = {
        ...camposPorCategoria,
        ...categoriasCustomizadas
    };
    
    // Remover 'outros' da lista de exibição (é padrão)
    const categoriasParaExibir = Object.keys(todasCategorias).filter(c => c !== 'outros');
    
    if (categoriasParaExibir.length === 0) {
        container.innerHTML = `<p class="text-muted">Nenhuma categoria customizada criada.</p>`;
        return;
    }
    
    let html = `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px;">`;
    
    categoriasParaExibir.forEach(nome => {
        const isCustom = !!categoriasCustomizadas[nome];
        const campos = getCamposPorCategoria(nome);
        const numCampos = campos ? campos.length : 0;
        
        html += `
            <div style="border: 1px solid ${isCustom ? '#00ADEE' : '#dee2e6'}; border-radius: 8px; padding: 15px; background: ${isCustom ? '#f0f8ff' : 'white'};">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${nome}</strong>
                    ${isCustom ? '<span class="badge badge-info" style="font-size: 10px;">Custom</span>' : '<span class="badge badge-secondary" style="font-size: 10px;">Padrão</span>'}
                </div>
                <div style="font-size: 12px; color: #6c757d; margin-top: 5px;">
                    ${numCampos} campo(s) • ${isCustom ? 'Editável' : 'Sistema'}
                </div>
                ${isCustom ? `
                    <button class="btn btn-sm btn-danger mt-2" onclick="excluirCategoriaCustomizada('${nome}')" style="font-size: 11px;">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                ` : ''}
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// ===== ATUALIZAR SELECT DE CATEGORIAS =====
function atualizarSelectCategorias() {
    const selects = document.querySelectorAll('#produtoCategoria, #filtroCategoriaEstoque');
    const todasCategorias = {
        ...camposPorCategoria,
        ...categoriasCustomizadas
    };
    
    const categoriasLista = Object.keys(todasCategorias).filter(c => c !== 'outros');
    
    selects.forEach(select => {
        if (!select) return;
        const valorAtual = select.value;
        
        // Preservar a opção "Selecione" ou "Todas"
        const firstOption = select.options[0];
        const isFilter = select.id === 'filtroCategoriaEstoque';
        
        select.innerHTML = '';
        
        if (isFilter) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Todas as categorias';
            select.appendChild(option);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Selecione uma categoria';
            select.appendChild(option);
        }
        
        // Adicionar categorias padrão
        const categoriasPadrao = ['Eixos', 'Parafusos', 'Rolamentos', 'Raios', 'Arruelas', 'Porcas', 'CapacetesEPartes'];
        categoriasPadrao.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            select.appendChild(option);
        });
        
        // Adicionar categorias customizadas
        Object.keys(categoriasCustomizadas).forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = `${cat} ⭐`;
            option.style.color = '#00ADEE';
            select.appendChild(option);
        });
        
        // Adicionar "outros"
        const optionOutros = document.createElement('option');
        optionOutros.value = 'outros';
        optionOutros.textContent = 'Outros';
        select.appendChild(optionOutros);
        
        // Restaurar valor
        if (valorAtual && select.querySelector(`option[value="${valorAtual}"]`)) {
            select.value = valorAtual;
        }
    });
}

// ===== FECHAR MODAL DE CATEGORIAS =====
function fecharModalCategorias() {
    const modal = document.getElementById('modalCategorias');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// =========================================================
// FUNÇÕES DE ABERTURA DO SISTEMA
// =========================================================

window.abrirGestaoEstoque = function() {
    if (!currentUser) {
        if (window.showToast) showToast('⚠️ Faça login primeiro', 'warning');
        else alert('Faça login primeiro');
        return;
    }

    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 'promocoesSystem',
                      'reviewsSystem', 'folgasSystem', 'shippingSystem', 'estoqueSystem', 'menuSystem', 'perguntasSystem'];
    sistemas.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const gestaoSystem = document.getElementById('estoqueGestaoSystem');
    if (!gestaoSystem) {
        console.error('Elemento #estoqueGestaoSystem não encontrado');
        if (window.showToast) showToast('Erro: sistema de estoque não configurado', 'error');
        return;
    }
    gestaoSystem.classList.remove('hidden');

    const userNameEl = document.getElementById('estoqueGestaoUserName');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    const userAvatarEl = document.getElementById('estoqueGestaoUserAvatar');
    if (userAvatarEl) userAvatarEl.textContent = currentUser.avatar;
    const userRoleEl = document.getElementById('estoqueGestaoUserRole');
    if (userRoleEl) userRoleEl.textContent = currentUser.role;

    carregarProdutosEstoque();
    carregarRegrasEstoque();
    carregarCategoriasCustomizadas();

    const buscaInput = document.getElementById('buscaEstoqueInput');
    if (buscaInput) {
        buscaInput.removeEventListener('input', filtrarProdutosEstoque);
        buscaInput.addEventListener('input', filtrarProdutosEstoque);
    }

    const categoriaFilter = document.getElementById('filtroCategoriaEstoque');
    if (categoriaFilter) {
        categoriaFilter.removeEventListener('change', filtrarProdutosEstoque);
        categoriaFilter.addEventListener('change', filtrarProdutosEstoque);
    }
    
    // Botão para gerenciar categorias
    const btnCategorias = document.getElementById('btnGerenciarCategorias');
    if (btnCategorias) {
        btnCategorias.onclick = abrirModalCategorias;
    }
};

// =========================================================
// CARREGAR PRODUTOS DO SUPABASE COM PERSISTÊNCIA DE FILTROS
// =========================================================

async function carregarProdutosEstoque() {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não inicializado');
        const { data, error } = await window.supabaseClient
            .from('produtos_estoque')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        produtosEstoque = data || [];
        
        // Restaurar estado dos filtros e paginação
        const termo = document.getElementById('buscaEstoqueInput');
        const categoria = document.getElementById('filtroCategoriaEstoque');
        
        if (termo) termo.value = estadoFiltrosEstoque.termo || '';
        if (categoria) categoria.value = estadoFiltrosEstoque.categoria || '';
        
        aplicarFiltrosEOrdenacao();
        console.log(`✅ ${produtosEstoque.length} produtos carregados`);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        if (window.showToast) showToast('Erro ao carregar produtos', 'error');
        const tbody = document.getElementById('produtosEstoqueBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-danger">Erro ao carregar produtos. Consulte o console.</td></tr>';
    }
}

// =========================================================
// FILTRAR PRODUTOS COM PERSISTÊNCIA
// =========================================================

function filtrarProdutosEstoque() {
    const termo = document.getElementById('buscaEstoqueInput').value.toLowerCase().trim();
    const categoriaSelecionada = document.getElementById('filtroCategoriaEstoque')?.value || '';

    estadoFiltrosEstoque.termo = termo;
    estadoFiltrosEstoque.categoria = categoriaSelecionada;
    estadoFiltrosEstoque.pagina = 1;

    aplicarFiltrosEOrdenacao();
}

// =========================================================
// APLICAR FILTROS E ORDENAÇÃO
// =========================================================

function aplicarFiltrosEOrdenacao() {
    let filtrados = produtosEstoque;

    if (estadoFiltrosEstoque.categoria && estadoFiltrosEstoque.categoria !== '') {
        filtrados = filtrados.filter(prod => prod.categoria === estadoFiltrosEstoque.categoria);
    }

    if (estadoFiltrosEstoque.termo) {
        const termo = estadoFiltrosEstoque.termo;
        filtrados = filtrados.filter(prod => {
            if (prod.nome && prod.nome.toLowerCase().includes(termo)) return true;
            if (prod.sku && prod.sku.toLowerCase().includes(termo)) return true;
            if (prod.mlb_codes) {
                let mlbArray = prod.mlb_codes;
                if (typeof mlbArray === 'string') mlbArray = mlbArray.split(',').map(s => s.trim());
                if (Array.isArray(mlbArray)) {
                    return mlbArray.some(code => code.toLowerCase().includes(termo));
                }
            }
            return false;
        });
    }

    produtosFiltradosAtuais = filtrados;
    paginaAtualEstoque = estadoFiltrosEstoque.pagina;
    itensPorPaginaEstoque = estadoFiltrosEstoque.itensPorPagina;
    ordemColunaEstoque.coluna = estadoFiltrosEstoque.colunaOrdem;
    ordemColunaEstoque.direcao = estadoFiltrosEstoque.direcaoOrdem;

    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

// =========================================================
// LIMPAR FILTROS
// =========================================================

function limparFiltrosEstoque() {
    estadoFiltrosEstoque = {
        termo: '',
        categoria: '',
        pagina: 1,
        itensPorPagina: 20,
        colunaOrdem: 'id',
        direcaoOrdem: 'asc'
    };
    
    const termoInput = document.getElementById('buscaEstoqueInput');
    const categoriaSelect = document.getElementById('filtroCategoriaEstoque');
    
    if (termoInput) termoInput.value = '';
    if (categoriaSelect) categoriaSelect.value = '';
    
    paginaAtualEstoque = 1;
    itensPorPaginaEstoque = 20;
    ordemColunaEstoque = { coluna: 'id', direcao: 'asc' };
    
    aplicarFiltrosEOrdenacao();
    if (window.showToast) showToast('🧹 Filtros limpos!', 'info');
}

// =========================================================
// ORDENAR ESTOQUE
// =========================================================

function ordenarEstoquePor(coluna) {
    if (ordemColunaEstoque.coluna === coluna) {
        ordemColunaEstoque.direcao = ordemColunaEstoque.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordemColunaEstoque.coluna = coluna;
        ordemColunaEstoque.direcao = 'asc';
    }
    
    estadoFiltrosEstoque.colunaOrdem = ordemColunaEstoque.coluna;
    estadoFiltrosEstoque.direcaoOrdem = ordemColunaEstoque.direcao;
    
    document.querySelectorAll('#produtosEstoqueTable thead th').forEach(th => {
        const icon = th.querySelector('.ordenacao-icon');
        if (icon) {
            const col = th.dataset.coluna;
            if (col === coluna) {
                icon.className = `fas fa-sort-${ordemColunaEstoque.direcao === 'asc' ? 'up' : 'down'} ordenacao-icon`;
                icon.style.color = '#00ADEE';
            } else {
                icon.className = 'fas fa-sort ordenacao-icon';
                icon.style.color = '#adb5bd';
            }
        }
    });
    
    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

// =========================================================
// RENDERIZAR TABELA DE PRODUTOS
// =========================================================

function renderizarTabelaProdutos(produtosParaRenderizar = null) {
    console.log('🔍 [renderizarTabelaProdutos] Iniciando renderização...');
    
    const tbody = document.getElementById('produtosEstoqueBody');
    if (!tbody) {
        console.error('❌ Elemento #produtosEstoqueBody não encontrado');
        return;
    }
    
    const todosProdutos = produtosParaRenderizar || produtosEstoque;
    produtosFiltradosAtuais = todosProdutos;
    
    if (todosProdutos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum produto encontrado.</td></tr>';
        atualizarPaginacaoEstoque(todosProdutos.length);
        return;
    }

    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    const podeModificarSync = usuariosAutorizadosSync.includes(username) || isAdmin;
    const podeVerCusto = usuariosVerCusto.includes(username) || isAdmin;

    const produtosOrdenados = [...todosProdutos];
    const coluna = ordemColunaEstoque.coluna;
    const direcao = ordemColunaEstoque.direcao;
    
    produtosOrdenados.sort((a, b) => {
        let valorA, valorB;
        
        switch(coluna) {
            case 'id':
                valorA = a.id || 0;
                valorB = b.id || 0;
                break;
            case 'nome':
                valorA = (a.nome || '').toLowerCase();
                valorB = (b.nome || '').toLowerCase();
                break;
            case 'sku':
                valorA = (a.sku || '').toLowerCase();
                valorB = (b.sku || '').toLowerCase();
                break;
            case 'quantidade':
                valorA = a.quantidade || 0;
                valorB = b.quantidade || 0;
                break;
            case 'preco_custo':
                valorA = a.ultimo_custo || a.dados_extra?.ultimo_custo || 0;
                valorB = b.ultimo_custo || b.dados_extra?.ultimo_custo || 0;
                break;
            case 'preco_medio':
                valorA = a.custo_medio || a.dados_extra?.custo_medio || 0;
                valorB = b.custo_medio || b.dados_extra?.custo_medio || 0;
                break;
            case 'categoria':
                valorA = (a.categoria || '').toLowerCase();
                valorB = (b.categoria || '').toLowerCase();
                break;
            default:
                valorA = a.id || 0;
                valorB = b.id || 0;
        }
        
        if (typeof valorA === 'string') {
            return direcao === 'asc' ? valorA.localeCompare(valorB) : valorB.localeCompare(valorA);
        } else {
            return direcao === 'asc' ? (valorA - valorB) : (valorB - valorA);
        }
    });

    const totalPaginas = Math.ceil(produtosOrdenados.length / itensPorPaginaEstoque);
    if (paginaAtualEstoque > totalPaginas) paginaAtualEstoque = totalPaginas;
    if (paginaAtualEstoque < 1) paginaAtualEstoque = 1;
    
    const inicio = (paginaAtualEstoque - 1) * itensPorPaginaEstoque;
    const fim = Math.min(inicio + itensPorPaginaEstoque, produtosOrdenados.length);
    const produtosPagina = produtosOrdenados.slice(inicio, fim);
    
    tbody.innerHTML = '';
    
    produtosPagina.forEach(prod => {
        const row = document.createElement('tr');
        let atributosResumo = '';
        if (prod.dados_extra) {
            const keys = Object.keys(prod.dados_extra).slice(0, 2);
            atributosResumo = keys.map(k => `${k}: ${prod.dados_extra[k]}`).join(', ');
            if (Object.keys(prod.dados_extra).length > 2) atributosResumo += '...';
        }
        
        const mlbCodes = prod.mlb_codes || prod.dados_extra?.mlb_codes;
        const temMLB = mlbCodes && ((Array.isArray(mlbCodes) && mlbCodes.length > 0) || (typeof mlbCodes === 'string' && mlbCodes.trim() !== ''));
        
        const ultimoCusto = prod.ultimo_custo || prod.dados_extra?.ultimo_custo || 0;
        const custoMedio = prod.custo_medio || prod.dados_extra?.custo_medio || 0;
        
        const syncBloqueado = prod.bloquear_sync_ml || prod.dados_extra?.bloquear_sync_ml || false;
        const syncStatusHtml = syncBloqueado 
            ? '<span class="sync-status-badge bloqueado"><i class="fas fa-lock"></i> Bloqueado</span>'
            : '<span class="sync-status-badge ativo"><i class="fas fa-check-circle"></i> Ativo</span>';
        
        const isExcesso = verificarExcessoEstoque(prod);
        const maximoPermitido = calcularEstoqueMaximo(prod);
        const precoUnitario = prod.preco || 0;
        
        let excessoTooltip = '';
        if (isExcesso) {
            excessoTooltip = `Preço: R$ ${precoUnitario.toFixed(2)} | Estoque máximo: ${maximoPermitido} | Atual: ${prod.quantidade}`;
        }
        
        let quantidadeHtml = `${prod.quantidade}`;
        if (isExcesso) {
            quantidadeHtml += ` <span class="badge badge-danger" title="${excessoTooltip}"><i class="fas fa-exclamation-triangle"></i> EXCESSO (máx: ${maximoPermitido})</span>`;
        } else if (prod.quantidade <= 5) {
            quantidadeHtml = `<span class="text-danger fw-bold">${prod.quantidade}</span>`;
        }
        
        const descricaoRegra = getDescricaoRegra(prod);
        const excessoInfo = isExcesso ? `<br><span class="badge badge-danger mt-1" title="${descricaoRegra}">⚠️ Excesso (máx: ${maximoPermitido})</span>` : '';
        
        let botoes = `
        <button class="btn btn-sm btn-info" onclick="editarProdutoEstoque(${prod.id})" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-warning" onclick="abrirModalMovimentacaoEstoque(${prod.id}, '${escapeHtml(prod.nome)}')" title="Movimentar"><i class="fas fa-exchange-alt"></i></button>
        <button class="btn btn-sm btn-secondary" onclick="verHistoricoMovimentacoes(${prod.id})" title="Histórico"><i class="fas fa-history"></i></button>
        <button class="btn btn-sm btn-purple" onclick="abrirModalRegraIndividual('${escapeHtml(prod.sku)}')" title="Regra individual de estoque">
        <i class="fas fa-sliders-h"></i>
        </button>
        `;
        
        if (isAdmin) {
            botoes += `<button class="btn btn-sm btn-danger" onclick="excluirProdutoEstoque(${prod.id})" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }
        
        if (temMLB && podeModificarSync) {
            botoes += `<button class="btn btn-sm btn-primary" onclick="sincronizarProdutoML(${prod.id})" title="Sincronizar estoque com ML"><i class="fab fa-mercadolibre"></i></button>`;
        } else if (temMLB && !podeModificarSync) {
            botoes += `<button class="btn btn-sm btn-secondary" disabled title="Apenas administradores podem sincronizar"><i class="fab fa-mercadolibre"></i></button>`;
        }
        
        // Mostrar prefixo do SKU (5 primeiros caracteres)
        const skuPrefix = prod.sku ? prod.sku.substring(0, 5).toUpperCase() : '-';
        
        let rowHtml = `
            <td>${prod.id}</td>
            <td><strong>${escapeHtml(prod.nome)}</strong><br><small class="text-muted">${escapeHtml(prod.categoria || 'sem categoria')}</small></td>
            <td><code>${escapeHtml(prod.sku)}</code><br><small class="text-muted" style="font-size: 10px; color: #6c757d;">Prefixo: ${skuPrefix}</small></td>
            <td>${quantidadeHtml}</td>
        `;
        
        if (podeVerCusto) {
            rowHtml += `
                <td>${ultimoCusto > 0 ? `R$ ${parseFloat(ultimoCusto).toFixed(2)}` : '-'}</td>
                <td>${custoMedio > 0 ? `R$ ${parseFloat(custoMedio).toFixed(2)}` : '-'}</td>
            `;
        }
        
        rowHtml += `
            <td>${syncStatusHtml}</td>
            <td>
                <span title="${escapeHtml(atributosResumo)}" class="badge bg-info">${Object.keys(prod.dados_extra || {}).length} atributos</span>
                ${temMLB ? `<span class="badge bg-success"><i class="fab fa-mercadolibre"></i> ${Array.isArray(mlbCodes) ? mlbCodes.length : 1}</span>` : ''}
                ${excessoInfo}
            </td>
            <td><div class="d-flex flex-wrap gap-1">${botoes}</div></td>
        `;
        
        row.innerHTML = rowHtml;
        tbody.appendChild(row);
    });
    
    atualizarPaginacaoEstoque(produtosOrdenados.length);
    console.log('✅ [renderizarTabelaProdutos] Renderização concluída!');
}

// =========================================================
// PAGINAÇÃO
// =========================================================

function atualizarPaginacaoEstoque(totalItens) {
    const paginationContainer = document.getElementById('paginacaoEstoque');
    if (!paginationContainer) {
        console.error('❌ #paginacaoEstoque não encontrado');
        return;
    }
    
    if (totalItens === 0) {
        paginationContainer.innerHTML = '';
        paginationContainer.style.display = 'none';
        return;
    }
    
    if (totalItens <= itensPorPaginaEstoque) {
        paginationContainer.innerHTML = `
            <div style="text-align: center; color: #6c757d; padding: 5px 0; font-size: 14px;">
                <i class="fas fa-list"></i> Total: <strong>${totalItens}</strong> produtos
            </div>
        `;
        paginationContainer.style.display = 'block';
        return;
    }
    
    paginationContainer.style.display = 'block';
    paginationContainer.style.padding = '15px 20px';
    paginationContainer.style.borderTop = '1px solid #dee2e6';
    paginationContainer.style.background = '#f8f9fa';
    paginationContainer.style.borderRadius = '0 0 8px 8px';
    
    const totalPaginas = Math.ceil(totalItens / itensPorPaginaEstoque);
    const inicio = (paginaAtualEstoque - 1) * itensPorPaginaEstoque + 1;
    const fim = Math.min(paginaAtualEstoque * itensPorPaginaEstoque, totalItens);
    
    let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
            <div style="color: #6c757d; font-size: 14px;">
                <i class="fas fa-list"></i> 
                Mostrando <strong>${inicio}</strong> - <strong>${fim}</strong> de <strong>${totalItens}</strong> produtos
                <span style="background: #6c757d; color: white; padding: 2px 10px; border-radius: 20px; font-size: 12px; margin-left: 8px;">
                    ${totalPaginas} página(s)
                </span>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
                <button class="btn btn-sm btn-outline-secondary" onclick="irParaPaginaEstoque(1)" ${paginaAtualEstoque === 1 ? 'disabled' : ''}>
                    <i class="fas fa-angle-double-left"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="irParaPaginaEstoque(${paginaAtualEstoque - 1})" ${paginaAtualEstoque === 1 ? 'disabled' : ''}>
                    <i class="fas fa-angle-left"></i>
                </button>
                <span style="background: #00ADEE; color: white; padding: 5px 15px; border-radius: 4px; font-size: 14px; min-width: 60px; text-align: center;">
                    ${paginaAtualEstoque} / ${totalPaginas}
                </span>
                <button class="btn btn-sm btn-outline-secondary" onclick="irParaPaginaEstoque(${paginaAtualEstoque + 1})" ${paginaAtualEstoque === totalPaginas ? 'disabled' : ''}>
                    <i class="fas fa-angle-right"></i>
                </button>
                <button class="btn btn-sm btn-outline-secondary" onclick="irParaPaginaEstoque(${totalPaginas})" ${paginaAtualEstoque === totalPaginas ? 'disabled' : ''}>
                    <i class="fas fa-angle-double-right"></i>
                </button>
            </div>
            <div style="display: flex; gap: 5px; align-items: center;">
                <label style="font-size: 13px; color: #6c757d; margin: 0;">Itens:</label>
                <select style="padding: 3px 8px; border-radius: 4px; border: 1px solid #ced4da; font-size: 13px;" onchange="alterarItensPorPaginaEstoque(this.value)">
                    <option value="10" ${itensPorPaginaEstoque === 10 ? 'selected' : ''}>10</option>
                    <option value="20" ${itensPorPaginaEstoque === 20 ? 'selected' : ''}>20</option>
                    <option value="50" ${itensPorPaginaEstoque === 50 ? 'selected' : ''}>50</option>
                    <option value="100" ${itensPorPaginaEstoque === 100 ? 'selected' : ''}>100</option>
                    <option value="999999" ${itensPorPaginaEstoque === 999999 ? 'selected' : ''}>Todos</option>
                </select>
            </div>
        </div>
    `;
    
    paginationContainer.innerHTML = html;
}

function irParaPaginaEstoque(pagina) {
    const totalPaginas = Math.ceil(produtosFiltradosAtuais.length / itensPorPaginaEstoque);
    if (pagina < 1 || pagina > totalPaginas) return;
    paginaAtualEstoque = pagina;
    estadoFiltrosEstoque.pagina = pagina;
    renderizarTabelaProdutos(produtosFiltradosAtuais);
    const tableContainer = document.querySelector('.card.mb-4');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function alterarItensPorPaginaEstoque(valor) {
    itensPorPaginaEstoque = parseInt(valor);
    estadoFiltrosEstoque.itensPorPagina = itensPorPaginaEstoque;
    estadoFiltrosEstoque.pagina = 1;
    paginaAtualEstoque = 1;
    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

// =========================================================
// FUNÇÕES DE MOVIMENTAÇÃO COM SALDO
// =========================================================

async function registrarMovimentacao(produtoId, tipo, quantidade, numeroDocumento, tipoEntrada = null) {
    const numero = await gerarNumeroMovimentacao();
    const usuario = (typeof currentUser !== 'undefined' && currentUser?.name) 
                ? currentUser.name 
                : localStorage.getItem('userName') || 'sistema';
    
    // Buscar saldo atual do produto
    const produto = produtosEstoque.find(p => p.id == produtoId);
    const saldoAtual = produto ? produto.quantidade : 0;
    
    // Calcular novo saldo
    let novoSaldo = saldoAtual;
    if (tipo === 'entrada') {
        novoSaldo += quantidade;
    } else {
        novoSaldo -= quantidade;
    }
    
    const { error } = await window.supabaseClient
        .from('estoque_movimentacoes')
        .insert([{
            produto_id: produtoId,
            tipo: tipo,
            quantidade: quantidade,
            usuario: usuario,
            numero_movimentacao: numero,
            numero_documento: numeroDocumento,
            tipo_entrada: tipoEntrada,
            data_hora: new Date().toISOString(),
            saldo_apos: novoSaldo
        }]);
    if (error) {
        console.error('❌ Erro ao registrar movimentação:', error);
        if (window.showToast) showToast('Erro ao registrar movimentação', 'error');
    } else {
        console.log(`✅ Movimentação ${numero} registrada: ${tipo} de ${quantidade}, saldo: ${novoSaldo}`);
    }
}

// =========================================================
// HISTÓRICO DE MOVIMENTAÇÕES - VERSÃO COMPLETA CORRIGIDA
// =========================================================

async function verHistoricoMovimentacoes(produtoId) {
    const produto = produtosEstoque.find(p => p.id == produtoId);
    if (!produto) {
        showToast('Produto não encontrado', 'error');
        return;
    }
    
    try {
        const { data, error } = await window.supabaseClient
            .from('estoque_movimentacoes')
            .select('*')
            .eq('produto_id', produtoId)
            .order('data_hora', { ascending: true });
        
        if (error) {
            console.error(error);
            showToast('Erro ao carregar histórico', 'error');
            return;
        }
        
        // ===== CALCULAR ESTOQUE INICIAL =====
        let saldoAcumulado = 0;
        let movimentosComSaldo = [];
        
        if (data && data.length > 0) {
            // Calcular saldo a partir da primeira movimentação
            for (const mov of data) {
                if (mov.tipo === 'entrada') {
                    saldoAcumulado += mov.quantidade;
                } else {
                    saldoAcumulado -= mov.quantidade;
                }
                movimentosComSaldo.push({
                    ...mov,
                    saldo_apos: saldoAcumulado
                });
            }
            
            // ===== CALCULAR ESTOQUE INICIAL =====
            // O estoque inicial é o saldo antes da primeira movimentação
            const primeiraMov = movimentosComSaldo[0];
            const estoqueInicial = primeiraMov ? (primeiraMov.saldo_apos - (primeiraMov.tipo === 'entrada' ? primeiraMov.quantidade : -primeiraMov.quantidade)) : 0;
            
            // Adicionar uma linha de "Estoque Inicial" no início
            const dataInicial = data[0]?.data_hora ? new Date(data[0].data_hora).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            }) : 'Data desconhecida';
            
            // Inserir linha de estoque inicial no início do array
            movimentosComSaldo.unshift({
                id: 'inicial',
                tipo: 'inicial',
                quantidade: estoqueInicial,
                saldo_apos: estoqueInicial,
                data_hora: data[0]?.data_hora || new Date().toISOString(),
                numero_documento: 'Estoque Inicial',
                tipo_entrada: 'inicial',
                usuario: 'Sistema',
                is_initial: true
            });
        } else {
            // Se não há movimentações, mostrar apenas o estoque atual
            movimentosComSaldo = [{
                id: 'inicial',
                tipo: 'inicial',
                quantidade: produto.quantidade || 0,
                saldo_apos: produto.quantidade || 0,
                data_hora: new Date().toISOString(),
                numero_documento: 'Estoque Atual',
                tipo_entrada: 'inicial',
                usuario: 'Sistema',
                is_initial: true
            }];
        }
        
        // Inverter para mostrar do mais recente primeiro
        const movimentosReversos = [...movimentosComSaldo].reverse();
        
        // ===== DADOS PARA O GRÁFICO =====
        const dadosGrafico = movimentosComSaldo.filter(m => !m.is_initial).map(mov => ({
            data: new Date(mov.data_hora).toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }),
            saldo: mov.saldo_apos,
            tipo: mov.tipo,
            quantidade: mov.quantidade
        }));
        
        // ===== ESTATÍSTICAS =====
        const movimentosReais = movimentosComSaldo.filter(m => !m.is_initial);
        const totalEntradas = movimentosReais.filter(m => m.tipo === 'entrada').reduce((sum, m) => sum + m.quantidade, 0);
        const totalSaidas = movimentosReais.filter(m => m.tipo === 'saida').reduce((sum, m) => sum + m.quantidade, 0);
        const movimentacoesVenda = movimentosReais.filter(m => m.tipo_entrada === 'venda');
        const totalVendas = movimentacoesVenda.reduce((sum, m) => sum + m.quantidade, 0);
        
        // ===== VERIFICAR SE O SALDO BATE =====
        const saldoCalculado = totalEntradas - totalSaidas;
        const saldoAtual = produto.quantidade || 0;
        const saldoBate = saldoCalculado === saldoAtual;
        
        // ===== MONTAR HTML =====
        let html = `
        <div style="max-width: 100%;">
            <!-- Cabeçalho do Produto -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                <div>
                    <h3 style="margin: 0; color: #00ADEE;">
                        <i class="fas fa-box"></i> ${escapeHtml(produto.nome)}
                    </h3>
                    <p style="margin: 5px 0 0 0; color: #6c757d; font-size: 14px;">
                        <strong>SKU:</strong> ${escapeHtml(produto.sku)} &bull; 
                        <strong>Categoria:</strong> ${escapeHtml(produto.categoria || 'sem categoria')}
                    </p>
                </div>
                <div style="background: #f8f9fa; padding: 10px 20px; border-radius: 8px; text-align: center; border: 1px solid #e9ecef;">
                    <div style="font-size: 12px; color: #6c757d;">Estoque Atual</div>
                    <div style="font-size: 28px; font-weight: bold; color: ${produto.quantidade > 0 ? '#28a745' : '#dc3545'};">
                        ${produto.quantidade} <span style="font-size: 14px; font-weight: normal; color: #6c757d;">unidades</span>
                    </div>
                    ${!saldoBate ? `<div style="font-size: 12px; color: #dc3545; margin-top: 4px;">⚠️ Inconsistência no saldo!</div>` : ''}
                </div>
            </div>
            
            <!-- Cards de Estatísticas -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 20px;">
                <div style="background: #d4edda; padding: 10px; border-radius: 8px; text-align: center; border-left: 4px solid #28a745;">
                    <div style="font-size: 11px; color: #155724;">Total Entradas</div>
                    <div style="font-size: 20px; font-weight: bold; color: #28a745;">+${totalEntradas}</div>
                </div>
                <div style="background: #f8d7da; padding: 10px; border-radius: 8px; text-align: center; border-left: 4px solid #dc3545;">
                    <div style="font-size: 11px; color: #721c24;">Total Saídas</div>
                    <div style="font-size: 20px; font-weight: bold; color: #dc3545;">-${totalSaidas}</div>
                </div>
                <div style="background: #fff3cd; padding: 10px; border-radius: 8px; text-align: center; border-left: 4px solid #ffc107;">
                    <div style="font-size: 11px; color: #856404;">Vendas Realizadas</div>
                    <div style="font-size: 20px; font-weight: bold; color: #856404;">${movimentacoesVenda.length}</div>
                </div>
                <div style="background: #cce5ff; padding: 10px; border-radius: 8px; text-align: center; border-left: 4px solid #007bff;">
                    <div style="font-size: 11px; color: #004085;">Total Vendido</div>
                    <div style="font-size: 20px; font-weight: bold; color: #004085;">${totalVendas}</div>
                </div>
            </div>
            
            <!-- GRÁFICO -->
            <div style="background: white; border-radius: 8px; border: 1px solid #e9ecef; padding: 15px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; font-size: 14px; color: #495057;">
                        <i class="fas fa-chart-line" style="color: #00ADEE;"></i> Evolução do Estoque
                    </h4>
                    <span style="font-size: 11px; color: #6c757d;">${dadosGrafico.length} movimentações</span>
                </div>
                <div style="height: 180px; position: relative;">
                    <canvas id="graficoHistoricoEstoque" style="width: 100% !important; height: 100% !important;"></canvas>
                </div>
            </div>
            
            <!-- Tabela de Movimentações -->
            <div style="overflow-x: auto; border-radius: 8px; border: 1px solid #e9ecef;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; min-width: 700px;">
                    <thead style="background: #f8f9fa; border-bottom: 2px solid #dee2e6; position: sticky; top: 0; z-index: 5;">
                        <tr>
                            <th style="padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap;">Data/Hora</th>
                            <th style="padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap;">Tipo</th>
                            <th style="padding: 8px 10px; text-align: center; font-weight: 600; white-space: nowrap;">Qtd</th>
                            <th style="padding: 8px 10px; text-align: center; font-weight: 600; white-space: nowrap;">Saldo</th>
                            <th style="padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap;">Documento</th>
                            <th style="padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap;">Origem</th>
                            <th style="padding: 8px 10px; text-align: left; font-weight: 600; white-space: nowrap;">Usuário</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        movimentosReversos.forEach((mov, index) => {
            const dataHora = mov.is_initial ? '---' : new Date(mov.data_hora).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            // ===== LINHA DE ESTOQUE INICIAL =====
            if (mov.is_initial) {
                const estoqueInicial = mov.quantidade || 0;
                html += `
                    <tr style="background: #e9ecef; border-bottom: 2px solid #dee2e6;">
                        <td style="padding: 8px 10px; font-weight: 600; color: #495057;">📦 Estoque Inicial</td>
                        <td style="padding: 8px 10px;">
                            <span style="background: #6c757d; color: white; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                <i class="fas fa-box"></i> Inicial
                            </span>
                        </td>
                        <td style="padding: 8px 10px; text-align: center; font-weight: bold; color: #6c757d;">
                            ${estoqueInicial}
                        </td>
                        <td style="padding: 8px 10px; text-align: center;">
                            <span style="background: #6c757d; color: white; padding: 3px 10px; border-radius: 20px; font-weight: bold; font-size: 13px;">
                                ${estoqueInicial}
                            </span>
                        </td>
                        <td style="padding: 8px 10px; color: #6c757d; font-style: italic;">Saldo inicial</td>
                        <td style="padding: 8px 10px;"></td>
                        <td style="padding: 8px 10px; color: #6c757d;">Sistema</td>
                    </tr>
                `;
                return;
            }
            
            // ===== DEFINIR CORES E ÍCONES =====
            let tipoDisplay = '';
            let bgColor = '';
            let textColor = '';
            let iconClass = '';
            
            if (mov.tipo === 'entrada') {
                if (mov.tipo_entrada === 'nova') {
                    tipoDisplay = 'Compra';
                    bgColor = '#d4edda';
                    textColor = '#155724';
                    iconClass = 'fa-shopping-cart';
                } else if (mov.tipo_entrada === 'devolucao') {
                    tipoDisplay = 'Devolução';
                    bgColor = '#cce5ff';
                    textColor = '#004085';
                    iconClass = 'fa-undo';
                } else {
                    tipoDisplay = 'Entrada';
                    bgColor = '#d4edda';
                    textColor = '#155724';
                    iconClass = 'fa-plus-circle';
                }
            } else {
                if (mov.tipo_entrada === 'venda') {
                    tipoDisplay = '🛒 Venda';
                    bgColor = '#fff3cd';
                    textColor = '#856404';
                    iconClass = 'fa-shopping-bag';
                } else if (mov.tipo_entrada === 'reversao') {
                    tipoDisplay = 'Reversão';
                    bgColor = '#f8d7da';
                    textColor = '#721c24';
                    iconClass = 'fa-undo-alt';
                } else {
                    tipoDisplay = 'Saída';
                    bgColor = '#f8d7da';
                    textColor = '#721c24';
                    iconClass = 'fa-minus-circle';
                }
            }
            
            // Cor do saldo
            const saldoColor = mov.saldo_apos > 0 ? '#28a745' : mov.saldo_apos === 0 ? '#6c757d' : '#dc3545';
            const saldoBg = mov.saldo_apos > 0 ? '#d4edda' : mov.saldo_apos === 0 ? '#e9ecef' : '#f8d7da';
            
            // Cor da linha
            const rowBg = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
            
            // Badge de origem
            let origemBadge = '';
            if (mov.tipo_entrada === 'venda') {
                origemBadge = '<span style="background: #ffc107; color: #212529; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">🛒 Venda ML</span>';
            } else if (mov.tipo_entrada === 'nova') {
                origemBadge = '<span style="background: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">Nova</span>';
            } else if (mov.tipo_entrada === 'devolucao') {
                origemBadge = '<span style="background: #17a2b8; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">Devolução</span>';
            } else if (mov.tipo_entrada === 'reversao') {
                origemBadge = '<span style="background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">Reversão</span>';
            } else {
                origemBadge = `<span style="background: #6c757d; color: white; padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600;">${mov.tipo_entrada || '-'}</span>`;
            }
            
            // Quantidade com sinal
            const qtdDisplay = mov.tipo === 'entrada' 
                ? `<span style="color: #28a745; font-weight: bold;">+${mov.quantidade}</span>`
                : `<span style="color: #dc3545; font-weight: bold;">-${mov.quantidade}</span>`;
            
            // Número do documento
            const docDisplay = mov.numero_documento || '-';
            
            html += `
                <tr style="background: ${rowBg}; border-bottom: 1px solid #f1f3f5;">
                    <td style="padding: 8px 10px; white-space: nowrap; color: #495057; font-size: 11px;">
                        ${dataHora}
                    </td>
                    <td style="padding: 8px 10px;">
                        <span style="background: ${bgColor}; color: ${textColor}; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;">
                            <i class="fas ${iconClass}"></i> ${tipoDisplay}
                        </span>
                    </td>
                    <td style="padding: 8px 10px; text-align: center; font-size: 13px;">
                        ${qtdDisplay}
                    </td>
                    <td style="padding: 8px 10px; text-align: center;">
                        <span style="background: ${saldoBg}; color: ${saldoColor}; padding: 3px 10px; border-radius: 20px; font-weight: bold; font-size: 13px;">
                            ${mov.saldo_apos}
                        </span>
                    </td>
                    <td style="padding: 8px 10px; color: #495057; font-size: 11px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        ${docDisplay}
                    </td>
                    <td style="padding: 8px 10px;">
                        ${origemBadge}
                    </td>
                    <td style="padding: 8px 10px; color: #495057; font-size: 11px; white-space: nowrap;">
                        <i class="fas fa-user" style="color: #6c757d; font-size: 10px;"></i> ${mov.usuario || 'sistema'}
                    </td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            
            <!-- Rodapé -->
            <div style="margin-top: 15px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding-bottom: 5px;">
                <div style="font-size: 12px; color: #6c757d;">
                    <i class="fas fa-info-circle"></i> 
                    <strong>${movimentosReais.length}</strong> movimentações
                    &bull; <span style="color: #28a745;">+${totalEntradas}</span> entradas
                    &bull; <span style="color: #dc3545;">-${totalSaidas}</span> saídas
                    &bull; <span style="color: #856404;">🛒 ${movimentacoesVenda.length}</span> vendas
                    ${!saldoBate ? `&bull; <span style="color: #dc3545;">⚠️ Saldo inconsistente! (calculado: ${saldoCalculado})</span>` : ''}
                </div>
                <button onclick="this.closest('.modal').remove()" style="background: #6c757d; color: white; border: none; padding: 6px 16px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
        </div>
        `;
        
        // ===== CRIAR MODAL =====
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.cssText = 'display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 99999; position: fixed; top: 0; left: 0; width: 100%; height: 100%;';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 95%; max-height: 90vh; overflow-y: auto; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #f1f3f5; padding-bottom: 10px; flex-shrink: 0;">
                    <h3 style="margin: 0; color: #00ADEE; font-size: 18px;">
                        <i class="fas fa-history"></i> Histórico de Movimentações
                    </h3>
                    <button onclick="this.closest('.modal').remove()" style="background: none; border: none; font-size: 22px; cursor: pointer; color: #6c757d; padding: 0 5px;">&times;</button>
                </div>
                ${html}
            </div>
        `;
        document.body.appendChild(modal);
        
        // ===== RENDERIZAR GRÁFICO =====
        setTimeout(() => {
            renderizarGraficoHistorico(dadosGrafico, produto.nome);
        }, 300);
        
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        showToast('Erro ao carregar histórico', 'error');
    }
}

// =========================================================
// FUNÇÃO PARA RENDERIZAR O GRÁFICO
// =========================================================

function renderizarGraficoHistorico(dados, nomeProduto) {
    const canvas = document.getElementById('graficoHistoricoEstoque');
    if (!canvas) {
        console.warn('Canvas do gráfico não encontrado');
        return;
    }
    
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js não carregado. Tentando carregar...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = function() {
            console.log('Chart.js carregado, renderizando gráfico...');
            setTimeout(() => renderizarGraficoHistorico(dados, nomeProduto), 200);
        };
        document.head.appendChild(script);
        return;
    }
    
    if (window._graficoHistoricoInstance) {
        window._graficoHistoricoInstance.destroy();
        window._graficoHistoricoInstance = null;
    }
    
    const ctx = canvas.getContext('2d');
    
    const labels = dados.map(d => d.data);
    const saldos = dados.map(d => d.saldo);
    
    const pointColors = dados.map(d => {
        if (d.tipo === 'entrada') return '#28a745';
        return '#dc3545';
    });
    
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 173, 238, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 173, 238, 0.05)');
    
    window._graficoHistoricoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Saldo em Estoque',
                data: saldos,
                borderColor: '#00ADEE',
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 8,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 11, weight: '600' },
                        color: '#495057',
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const dado = dados[index];
                            if (!dado) return '';
                            return [
                                `Saldo: ${dado.saldo} unidades`,
                                `${dado.tipo === 'entrada' ? '➕ Entrada' : '➖ Saída'}: ${dado.quantidade} unidades`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { size: 9 },
                        maxTicksLimit: 15,
                        color: '#6c757d'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: { size: 10 },
                        color: '#6c757d',
                        stepSize: Math.max(1, Math.ceil(Math.max(...saldos) / 8))
                    },
                    title: {
                        display: true,
                        text: 'Quantidade',
                        color: '#6c757d',
                        font: { size: 11 }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
    
    console.log('✅ Gráfico do histórico renderizado com sucesso!');
}

// =========================================================
// REGISTRAR VENDAS DE NF-e NO HISTÓRICO (SEM BAIXAR ESTOQUE)
// VERSÃO ATUALIZADA - COMPARAÇÃO POR 8 CARACTERES
// =========================================================

window.registrarVendasNFesEmitidas = async function() {
    console.log('📦 Registrando vendas de NF-e no histórico (sem baixar estoque)...');
    
    try {
        if (!window.supabaseClient) {
            showToast('⚠️ Supabase não disponível', 'warning');
            return { totalVendas: 0, totalErros: 1, error: 'Supabase não disponível' };
        }
        
        showToast('🔄 Registrando vendas no histórico...', 'info');
        
        // Buscar NF-e emitidas
        const { data: nfes, error } = await window.supabaseClient
            .from('nfe_emitidas')
            .select('*')
            .order('data_emissao', { ascending: false })
            .limit(200);
        
        if (error) {
            console.error('❌ Erro ao buscar NF-e:', error);
            showToast('❌ Erro ao buscar NF-e: ' + error.message, 'error');
            return { totalVendas: 0, totalErros: 1, error: error.message };
        }
        
        if (!nfes || nfes.length === 0) {
            console.log('✅ Nenhuma NF-e encontrada.');
            showToast('✅ Nenhuma NF-e para processar.', 'info');
            return { totalVendas: 0, totalErros: 0 };
        }
        
        console.log(`📦 Processando ${nfes.length} NF-e...`);
        
        let totalVendas = 0;
        let totalErros = 0;
        let detalhes = [];
        let nfesProcessadas = 0;
        let todosSkusEncontrados = [];
        let todosSkusNaoEncontrados = [];
        
        // ===== FUNÇÃO PARA EXTRAIR OS 8 CARACTERES PRINCIPAIS DO SKU =====
        function extrairSkuBase(sku) {
            if (!sku) return '';
            
            let skuLimpo = sku.trim();
            
            // Remove o prefixo de 3 dígitos (quantidade) se existir
            if (/^\d{3}/.test(skuLimpo)) {
                skuLimpo = skuLimpo.replace(/^\d{3}/, '');
            }
            
            // Retorna apenas os 8 primeiros caracteres
            return skuLimpo.substring(0, 8).toUpperCase();
        }
        
        // =========================================================
// FUNÇÃO EXTRAIR SKUS DO CÓDIGO - VERSÃO CORRIGIDA
// =========================================================
function extrairSkusDoCodigo(codigo) {
    if (!codigo) return [];
    
    console.log(`🔍 Processando código: "${codigo}"`);
    
    if (codigo.includes('.')) {
        const partes = codigo.split('.');
        console.log(`📦 ${partes.length} partes encontradas (separadas por ponto)`);
        
        const skusExtraidos = [];
        for (const parte of partes) {
            let skuReal = parte;
            let quantidadePrefixo = 1;
            
            // 🔥 REMOVE 3 DÍGITOS DO SKU DO ANÚNCIO
            const match = parte.match(/^(\d{3})(.+)$/);
            if (match) {
                quantidadePrefixo = parseInt(match[1]) || 1;
                skuReal = match[2];
                console.log(`  🔹 Parte com prefixo: "${parte}" → Prefixo: ${quantidadePrefixo}, SKU Real: "${skuReal}"`);
            } else {
                console.log(`  🔹 Parte sem prefixo: "${parte}"`);
                skuReal = parte;
            }
            
            // 🔥 USA extrairSkuBaseSistema (NÃO REMOVE NADA) - porque já removemos o prefixo
            const skuBase = extrairSkuBaseSistema(skuReal);
            console.log(`  🔹 Base: "${skuBase}"`);
            
            skusExtraidos.push({
                sku: skuReal,
                skuBase: skuBase,
                quantidadePorKit: quantidadePrefixo || 1
            });
        }
        return skusExtraidos;
    } else {
        let skuReal = codigo;
        let quantidadePrefixo = 1;
        
        // 🔥 REMOVE 3 DÍGITOS DO SKU DO ANÚNCIO
        const match = codigo.match(/^(\d{3})(.+)$/);
        if (match) {
            quantidadePrefixo = parseInt(match[1]) || 1;
            skuReal = match[2];
            console.log(`  🔹 SKU com prefixo: "${codigo}" → Prefixo: ${quantidadePrefixo}, SKU Real: "${skuReal}"`);
        } else {
            console.log(`  🔹 SKU sem prefixo: "${codigo}"`);
            skuReal = codigo;
        }
        
        // 🔥 USA extrairSkuBaseSistema (NÃO REMOVE NADA) - porque já removemos o prefixo
        const skuBase = extrairSkuBaseSistema(skuReal);
        console.log(`  🔹 Base: "${skuBase}"`);
        
        return [{
            sku: skuReal,
            skuBase: skuBase,
            quantidadePorKit: quantidadePrefixo || 1
        }];
    }
}
        
        // ===== BUSCAR PRODUTO POR BASE DE 8 CARACTERES =====
        async function buscarProdutoPorBase(skuBase) {
            if (!skuBase) return null;
            
            // Busca todos os produtos (cache local)
            if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
                const encontrado = produtosEstoque.find(p => {
                    const baseSistema = extrairSkuBase(p.sku);
                    return baseSistema === skuBase;
                });
                if (encontrado) return encontrado;
            }
            
            // Fallback: busca no Supabase
            try {
                const { data: produtos, error: prodsError } = await window.supabaseClient
                    .from('produtos_estoque')
                    .select('id, quantidade, nome, sku');
                
                if (prodsError) return null;
                
                const encontrado = produtos.find(p => {
                    const baseSistema = extrairSkuBase(p.sku);
                    return baseSistema === skuBase;
                });
                return encontrado || null;
            } catch (e) {
                console.warn('⚠️ Erro ao buscar produtos no Supabase:', e);
                return null;
            }
        }
        
        for (const nfe of nfes) {
            try {
                const chave = nfe.chave_acesso || nfe.id || 'SEM_CHAVE';
                console.log(`\n📄 Processando NF-e: ${chave.substring(0, 20)}...`);
                
                let skusParaProcessar = [];
                
                // ===== EXTRAIR DO XML =====
                if (nfe.xml_assinado) {
                    try {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(nfe.xml_assinado, 'application/xml');
                        const dets = xmlDoc.querySelectorAll('det');
                        
                        console.log(`🔍 Encontrados ${dets.length} produtos no XML`);
                        
                        dets.forEach(det => {
                            const prod = det.querySelector('prod');
                            if (prod) {
                                const cProd = prod.querySelector('cProd')?.textContent || '';
                                const xProd = prod.querySelector('xProd')?.textContent || '';
                                const qCom = parseFloat(prod.querySelector('qCom')?.textContent || '0');
                                
                                let codigoOriginal = cProd;
                                
                                const infAdProd = prod.querySelector('infAdProd')?.textContent || '';
                                if (infAdProd) {
                                    const skuMatch = infAdProd.match(/SKU[:\s]*([A-Za-z0-9\-_.]+)/i);
                                    if (skuMatch) {
                                        codigoOriginal = skuMatch[1];
                                        console.log(`🔍 SKU encontrado em infAdProd: ${codigoOriginal}`);
                                    }
                                }
                                
                                console.log(`📦 Produto: Código="${codigoOriginal}", Nome="${xProd}", Quantidade=${qCom}`);
                                
                                const skusExtraidos = extrairSkusDoCodigo(codigoOriginal);
                                
                                for (const skuInfo of skusExtraidos) {
                                    if (skuInfo.sku && skuInfo.sku !== 'SEM_SKU' && skuInfo.sku !== 'N/A' && skuInfo.sku !== '') {
                                        skusParaProcessar.push({
                                            sku: skuInfo.sku,
                                            skuBase: skuInfo.skuBase,
                                            quantidade: qCom * skuInfo.quantidadePorKit,
                                            nome: xProd || 'Produto',
                                            codigoOriginal: codigoOriginal
                                        });
                                    }
                                }
                            }
                        });
                        
                        console.log(`📦 ${skusParaProcessar.length} SKUs extraídos para processar`);
                        
                    } catch (e) {
                        console.warn('⚠️ Erro ao extrair produtos do XML:', e);
                    }
                }
                
                // ===== SE NÃO TEM SKUS, CONTINUA =====
                if (skusParaProcessar.length === 0) {
                    console.warn(`⚠️ Nenhum SKU encontrado na NF-e ${chave.substring(0, 15)}`);
                    detalhes.push(`NF-e ${chave.substring(0, 15)}: Nenhum SKU encontrado`);
                    totalErros++;
                    continue;
                }
                
                // ===== REGISTRAR CADA SKU NO HISTÓRICO (SEM BAIXAR ESTOQUE) =====
                let itensRegistrados = 0;
                let erros = [];
                
                for (const item of skusParaProcessar) {
                    console.log(`🔍 Buscando SKU: "${item.sku}" (base: "${item.skuBase}") no estoque...`);
                    
                    if (!item.sku || item.sku === 'SEM_SKU' || item.sku === 'N/A' || item.sku === '') {
                        erros.push(`SKU vazio para ${item.nome}`);
                        continue;
                    }
                    
                    // ===== 1ª TENTATIVA: BUSCAR PELA BASE DE 8 CARACTERES =====
                    let produto = null;
                    
                    if (item.skuBase) {
                        produto = await buscarProdutoPorBase(item.skuBase);
                        if (produto) {
                            console.log(`✅ Produto encontrado pela BASE de 8 caracteres: "${item.skuBase}" → ${produto.sku}`);
                        }
                    }
                    
                    // ===== 2ª TENTATIVA: BUSCAR DIRETAMENTE PELO SKU COMPLETO =====
                    if (!produto) {
                        const skuLimpo = item.sku.trim();
                        const formasBusca = [
                            skuLimpo,
                            skuLimpo.replace(/^0+/, ''),
                            skuLimpo.padStart(6, '0'),
                            skuLimpo.toLowerCase(),
                            skuLimpo.toUpperCase()
                        ];
                        
                        for (const skuBusca of [...new Set(formasBusca)]) {
                            if (!skuBusca || skuBusca === '') continue;
                            
                            const { data: prod, error: prodError } = await window.supabaseClient
                                .from('produtos_estoque')
                                .select('id, quantidade, nome, sku')
                                .eq('sku', skuBusca)
                                .maybeSingle();
                            
                            if (!prodError && prod) {
                                produto = prod;
                                console.log(`✅ Produto encontrado com SKU "${skuBusca}": ${prod.sku}`);
                                break;
                            }
                        }
                    }
                    
                    // ===== 3ª TENTATIVA: BUSCA PARCIAL (ILIKE) =====
                    if (!produto && item.skuBase) {
                        const { data: prods, error: prodsError } = await window.supabaseClient
                            .from('produtos_estoque')
                            .select('id, quantidade, nome, sku')
                            .ilike('sku', `%${item.skuBase}%`)
                            .limit(5);
                        
                        if (!prodsError && prods && prods.length > 0) {
                            // Verifica qual tem a base correspondente
                            const encontrado = prods.find(p => {
                                const baseSistema = extrairSkuBase(p.sku);
                                return baseSistema === item.skuBase;
                            });
                            if (encontrado) {
                                produto = encontrado;
                                console.log(`✅ Produto encontrado por ILIKE com base correspondente: ${produto.sku}`);
                            } else {
                                produto = prods[0];
                                console.log(`⚠️ Produto encontrado por ILIKE (possível incompatibilidade): ${produto.sku}`);
                            }
                        }
                    }
                    
                    if (produto) {
                        const quantidadeVenda = Math.ceil(item.quantidade || 1);
                        itensRegistrados++;
                        todosSkusEncontrados.push(produto.sku);
                        
                        // ===== REGISTRAR NO HISTÓRICO SEM BAIXAR ESTOQUE =====
                        try {
                            const { error: movError } = await window.supabaseClient
                                .from('estoque_movimentacoes')
                                .insert([{
                                    produto_id: produto.id,
                                    tipo: 'saida',
                                    quantidade: quantidadeVenda,
                                    usuario: 'Sistema (NF-e antiga)',
                                    numero_documento: `NFE-${chave.substring(0, 10)}`,
                                    tipo_entrada: 'venda',
                                    data_hora: nfe.data_emissao || new Date().toISOString(),
                                }]);
                            
                            if (movError) {
                                erros.push(`Erro ao registrar venda de ${produto.sku}: ${movError.message}`);
                                console.warn(`⚠️ Erro ao registrar venda de ${produto.sku}:`, movError);
                            } else {
                                console.log(`✅ Venda registrada no histórico: ${produto.sku} (${produto.nome}) - ${quantidadeVenda} un (sem baixar estoque)`);
                            }
                        } catch (movErr) {
                            erros.push(`Erro ao registrar venda de ${produto.sku}: ${movErr.message}`);
                            console.warn(`⚠️ Erro ao registrar venda:`, movErr);
                        }
                    } else {
                        const msg = `SKU "${item.sku}" (base: "${item.skuBase}") não encontrado no estoque (original: ${item.codigoOriginal})`;
                        erros.push(msg);
                        todosSkusNaoEncontrados.push(item.sku);
                        console.warn(`❌ ${msg}`);
                    }
                }
                
                if (itensRegistrados > 0) {
                    nfesProcessadas++;
                    totalVendas += itensRegistrados;
                    
                    // Marcar como processada
                    try {
                        await window.supabaseClient
                            .from('nfe_emitidas')
                            .update({ 
                                processada: true,
                                processada_em: new Date().toISOString(),
                                registrada_historico: true
                            })
                            .eq('id', nfe.id);
                    } catch (e) {
                        console.warn('⚠️ Não foi possível marcar NF-e como processada:', e);
                    }
                }
                
                if (erros.length > 0) {
                    totalErros += erros.length;
                    detalhes.push(`NF-e ${chave.substring(0, 15)}: ${erros.join('; ')}`);
                }
                
            } catch (err) {
                console.error(`❌ Erro ao processar NF-e ${nfe.id}:`, err);
                totalErros++;
                detalhes.push(`NF-e ${nfe.id}: ${err.message}`);
            }
        }
        
        // ===== RESUMO FINAL =====
        console.log('\n📊 ===== RESUMO FINAL =====');
        console.log(`✅ Vendas registradas no histórico: ${totalVendas}`);
        console.log(`❌ Erros: ${totalErros}`);
        console.log(`📄 NF-e processadas: ${nfesProcessadas}`);
        if (todosSkusEncontrados.length > 0) {
            console.log(`🔍 SKUs encontrados: ${todosSkusEncontrados.length}`);
        }
        if (todosSkusNaoEncontrados.length > 0) {
            console.log(`❓ SKUs NÃO encontrados (${todosSkusNaoEncontrados.length}): ${todosSkusNaoEncontrados.join(', ')}`);
        }
        
        let mensagem = `✅ ${totalVendas} venda(s) registradas no histórico de estoque!`;
        if (totalErros > 0) {
            mensagem += ` ⚠️ ${totalErros} erro(s) encontrados.`;
        }
        if (nfesProcessadas === 0 && totalVendas === 0) {
            mensagem = 'ℹ️ Nenhuma NF-e pendente para registrar.';
        }
        showToast(mensagem, totalErros > 0 ? 'warning' : 'success');
        
        return { totalVendas, totalErros, detalhes, nfesProcessadas, todosSkusEncontrados, todosSkusNaoEncontrados };
        
    } catch (error) {
        console.error('❌ Erro ao registrar vendas de NF-e:', error);
        showToast('❌ Erro ao registrar vendas: ' + error.message, 'error');
        return { totalVendas: 0, totalErros: 1, error: error.message };
    }
};

console.log('✅ Função registrarVendasNFesEmitidas registrada (versão com comparação por 8 caracteres)');

// =========================================================
// REVERTER ESTOQUE DAS NF-e (VERSÃO ATUALIZADA)
// COMPARAÇÃO POR 8 CARACTERES
// =========================================================

window.reverterEstoqueNFes = async function() {
    console.log('🔄 Iniciando reversão de estoque das NF-e (compara por 8 caracteres)...');
    
    try {
        if (!window.supabaseClient) {
            showToast('⚠️ Supabase não disponível', 'warning');
            return;
        }
        
        if (!confirm('⚠️ Isso vai REVERTER o estoque das NF-e que foram baixadas incorretamente.\n\nA comparação será feita pelos 8 primeiros caracteres do SKU.\n\nDeseja continuar?')) {
            return;
        }
        
        showToast('🔄 Revertendo estoque...', 'info');
        
        // Buscar TODAS as NF-e
        const { data: nfes, error } = await window.supabaseClient
            .from('nfe_emitidas')
            .select('*')
            .order('data_emissao', { ascending: false })
            .limit(200);
        
        if (error) {
            console.error('❌ Erro ao buscar NF-e:', error);
            showToast('❌ Erro ao buscar NF-e: ' + error.message, 'error');
            return;
        }
        
        if (!nfes || nfes.length === 0) {
            console.log('✅ Nenhuma NF-e encontrada.');
            showToast('✅ Nenhuma NF-e para reverter.', 'info');
            return;
        }
        
        console.log(`📦 Processando ${nfes.length} NF-e...`);
        
        let totalRevertido = 0;
        let totalErros = 0;
        let nfesRevertidas = 0;
        let detalhes = [];
        let produtosRevertidosList = [];
        
        // ===== FUNÇÃO PARA EXTRAIR OS 8 CARACTERES PRINCIPAIS DO SKU =====
        function extrairSkuBase(sku) {
            if (!sku) return '';
            
            let skuLimpo = sku.trim();
            
            // Remove o prefixo de 3 dígitos (quantidade) se existir
            if (/^\d{3}/.test(skuLimpo)) {
                skuLimpo = skuLimpo.replace(/^\d{3}/, '');
            }
            
            // Retorna apenas os 8 primeiros caracteres
            return skuLimpo.substring(0, 8).toUpperCase();
        }
        
        function extrairSkusDoCodigo(codigo) {
    if (!codigo) return [];
    
    console.log(`🔍 Processando código: "${codigo}"`);
    
    // Remove prefixo de 3 dígitos se existir
    let skuReal = codigo;
    let quantidadePrefixo = 1;
    
    const match = codigo.match(/^(\d{3})(.+)$/);
    if (match) {
        quantidadePrefixo = parseInt(match[1]) || 1;
        skuReal = match[2];
        console.log(`  🔹 Prefixo: ${quantidadePrefixo}, SKU Real: "${skuReal}"`);
    } else {
        console.log(`  🔹 Sem prefixo: "${codigo}"`);
        skuReal = codigo;
    }
    
    const skuBase = extrairSkuBase(skuReal);
    return [{
        sku: skuReal,
        skuBase: skuBase,
        quantidadePorKit: quantidadePrefixo || 1
    }];
}
        
        // =========================================================
// FUNÇÃO BUSCAR PRODUTO POR BASE - VERSÃO CORRIGIDA
// =========================================================
async function buscarProdutoPorBase(skuBase) {
    if (!skuBase) return null;
    
    console.log(`🔍 Buscando produto com base: "${skuBase}"`);
    
    // Busca no cache local
    if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque) && produtosEstoque.length > 0) {
        const encontrado = produtosEstoque.find(p => {
            // 🔥 USA extrairSkuBaseSistema (NÃO REMOVE NADA)
            const baseSistema = extrairSkuBaseSistema(p.sku);
            return baseSistema === skuBase;
        });
        if (encontrado) {
            console.log(`✅ Produto encontrado no cache: ${encontrado.sku}`);
            return encontrado;
        }
    }
    
    // Fallback: busca no Supabase
    try {
        if (!window.supabaseClient) return null;
        
        const { data: produtos, error: prodsError } = await window.supabaseClient
            .from('produtos_estoque')
            .select('id, quantidade, nome, sku, dados_extra, preco, categoria');
        
        if (prodsError) {
            console.warn('⚠️ Erro ao buscar produtos no Supabase:', prodsError);
            return null;
        }
        
        const encontrado = produtos.find(p => {
            const baseSistema = extrairSkuBaseSistema(p.sku);
            return baseSistema === skuBase;
        });
        
        if (encontrado) {
            console.log(`✅ Produto encontrado no Supabase: ${encontrado.sku}`);
            return encontrado;
        }
        
        console.log(`❌ Produto não encontrado para base: "${skuBase}"`);
        return null;
    } catch (e) {
        console.warn('⚠️ Erro ao buscar produtos no Supabase:', e);
        return null;
    }
}
        
        for (const nfe of nfes) {
            try {
                const chave = nfe.chave_acesso || nfe.id || 'SEM_CHAVE';
                console.log(`\n📄 Processando NF-e: ${chave.substring(0, 20)}...`);
                
                let skusParaReverter = [];
                
                // ===== EXTRAIR DO XML =====
                if (nfe.xml_assinado) {
                    try {
                        const parser = new DOMParser();
                        const xmlDoc = parser.parseFromString(nfe.xml_assinado, 'application/xml');
                        const dets = xmlDoc.querySelectorAll('det');
                        
                        dets.forEach(det => {
                            const prod = det.querySelector('prod');
                            if (prod) {
                                const cProd = prod.querySelector('cProd')?.textContent || '';
                                const qCom = parseFloat(prod.querySelector('qCom')?.textContent || '0');
                                
                                let codigoOriginal = cProd;
                                
                                const infAdProd = prod.querySelector('infAdProd')?.textContent || '';
                                if (infAdProd) {
                                    const skuMatch = infAdProd.match(/SKU[:\s]*([A-Za-z0-9\-_.]+)/i);
                                    if (skuMatch) {
                                        codigoOriginal = skuMatch[1];
                                    }
                                }
                                
                                const skusExtraidos = extrairSkusDoCodigo(codigoOriginal);
                                
                                for (const skuInfo of skusExtraidos) {
                                    if (skuInfo.sku && skuInfo.sku !== 'SEM_SKU' && skuInfo.sku !== 'N/A' && skuInfo.sku !== '') {
                                        skusParaReverter.push({
                                            sku: skuInfo.sku,
                                            skuBase: skuInfo.skuBase,
                                            quantidade: qCom * skuInfo.quantidadePorKit
                                        });
                                    }
                                }
                            }
                        });
                        
                        console.log(`📦 ${skusParaReverter.length} SKUs extraídos para reverter`);
                        
                    } catch (e) {
                        console.warn('⚠️ Erro ao extrair produtos do XML:', e);
                    }
                }
                
                // Se não tem SKUs no XML, tentar extrair do campo produtos
                if (skusParaReverter.length === 0 && nfe.produtos) {
                    try {
                        let produtosData = nfe.produtos;
                        if (typeof produtosData === 'string') {
                            produtosData = JSON.parse(produtosData);
                        }
                        if (Array.isArray(produtosData) && produtosData.length > 0) {
                            for (const p of produtosData) {
                                const sku = p.sku || p.cProd || 'SEM_SKU';
                                const qtd = p.quantidade || p.qCom || 1;
                                const skusExtraidos = extrairSkusDoCodigo(sku);
                                for (const skuInfo of skusExtraidos) {
                                    if (skuInfo.sku && skuInfo.sku !== 'SEM_SKU') {
                                        skusParaReverter.push({
                                            sku: skuInfo.sku,
                                            skuBase: skuInfo.skuBase,
                                            quantidade: qtd * skuInfo.quantidadePorKit
                                        });
                                    }
                                }
                            }
                            console.log(`📦 ${skusParaReverter.length} SKUs extraídos do campo produtos`);
                        }
                    } catch (e) {
                        console.warn('⚠️ Erro ao extrair do campo produtos:', e);
                    }
                }
                
                if (skusParaReverter.length === 0) {
                    console.warn(`⚠️ Nenhum SKU encontrado na NF-e ${chave.substring(0, 15)}`);
                    continue;
                }
                
                // ===== REVERTER CADA SKU =====
                let itensRevertidos = 0;
                let erros = [];
                let produtosRevertidos = [];
                
                for (const item of skusParaReverter) {
                    if (!item.sku || item.sku === 'SEM_SKU' || item.sku === 'N/A') continue;
                    
                    console.log(`🔍 Buscando SKU: "${item.sku}" (base: "${item.skuBase}") para reverter...`);
                    
                    // ===== 1ª TENTATIVA: BUSCAR PELA BASE DE 8 CARACTERES =====
                    let produto = null;
                    
                    if (item.skuBase) {
                        produto = await buscarProdutoPorBase(item.skuBase);
                        if (produto) {
                            console.log(`✅ Produto encontrado pela BASE de 8 caracteres: "${item.skuBase}" → ${produto.sku}`);
                        }
                    }
                    
                    // ===== 2ª TENTATIVA: BUSCAR DIRETAMENTE PELO SKU COMPLETO =====
                    if (!produto) {
                        const skuLimpo = item.sku.trim();
                        const formasBusca = [
                            skuLimpo,
                            skuLimpo.replace(/^0+/, ''),
                            skuLimpo.padStart(6, '0'),
                            skuLimpo.toLowerCase(),
                            skuLimpo.toUpperCase()
                        ];
                        
                        for (const skuBusca of [...new Set(formasBusca)]) {
                            if (!skuBusca || skuBusca === '') continue;
                            
                            const { data: prod, error: prodError } = await window.supabaseClient
                                .from('produtos_estoque')
                                .select('id, quantidade, nome, sku')
                                .eq('sku', skuBusca)
                                .maybeSingle();
                            
                            if (!prodError && prod) {
                                produto = prod;
                                console.log(`✅ Produto encontrado com SKU "${skuBusca}": ${prod.sku}`);
                                break;
                            }
                        }
                    }
                    
                    // ===== 3ª TENTATIVA: BUSCA PARCIAL (ILIKE) =====
                    if (!produto && item.skuBase) {
                        const { data: prods, error: prodsError } = await window.supabaseClient
                            .from('produtos_estoque')
                            .select('id, quantidade, nome, sku')
                            .ilike('sku', `%${item.skuBase}%`)
                            .limit(5);
                        
                        if (!prodsError && prods && prods.length > 0) {
                            const encontrado = prods.find(p => {
                                const baseSistema = extrairSkuBase(p.sku);
                                return baseSistema === item.skuBase;
                            });
                            if (encontrado) {
                                produto = encontrado;
                                console.log(`✅ Produto encontrado por ILIKE com base correspondente: ${produto.sku}`);
                            } else {
                                produto = prods[0];
                                console.log(`⚠️ Produto encontrado por ILIKE (possível incompatibilidade): ${produto.sku}`);
                            }
                        }
                    }
                    
                    if (produto) {
                        // ===== ADICIONAR DE VOLTA AO ESTOQUE =====
                        const quantidadeReverter = Math.ceil(item.quantidade || 1);
                        const novaQuantidade = (produto.quantidade || 0) + quantidadeReverter;
                        
                        const { error: updateError } = await window.supabaseClient
                            .from('produtos_estoque')
                            .update({ 
                                quantidade: novaQuantidade,
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', produto.id);
                        
                        if (updateError) {
                            erros.push(`Erro ao reverter ${produto.sku}: ${updateError.message}`);
                            console.error(`❌ Erro ao reverter ${produto.sku}:`, updateError);
                        } else {
                            itensRevertidos++;
                            produtosRevertidos.push({
                                sku: produto.sku,
                                quantidade: quantidadeReverter,
                                novaQuantidade: novaQuantidade
                            });
                            produtosRevertidosList.push({
                                sku: produto.sku,
                                quantidade: quantidadeReverter,
                                nfe: chave.substring(0, 10)
                            });
                            console.log(`✅ Estoque revertido: ${produto.sku} +${quantidadeReverter} (agora: ${novaQuantidade})`);
                        }
                    } else {
                        erros.push(`SKU "${item.sku}" (base: "${item.skuBase}") não encontrado`);
                        console.warn(`❌ SKU não encontrado: "${item.sku}" (base: "${item.skuBase}")`);
                    }
                }
                
                if (itensRevertidos > 0) {
                    totalRevertido += itensRevertidos;
                    nfesRevertidas++;
                    
                    // Registrar no histórico a reversão
                    for (const prod of produtosRevertidos) {
                        try {
                            const { data: prodData } = await window.supabaseClient
                                .from('produtos_estoque')
                                .select('id')
                                .eq('sku', prod.sku)
                                .single();
                            
                            if (prodData) {
                                await window.supabaseClient
                                    .from('estoque_movimentacoes')
                                    .insert([{
                                        produto_id: prodData.id,
                                        tipo: 'entrada',
                                        quantidade: prod.quantidade,
                                        usuario: 'Sistema (Reversão NF-e)',
                                        numero_documento: `REV-${chave.substring(0, 10)}`,
                                        tipo_entrada: 'reversao',
                                        data_hora: new Date().toISOString()
                                    }]);
                            }
                        } catch (e) {
                            console.warn('⚠️ Erro ao registrar movimentação de reversão:', e);
                        }
                    }
                }
                
                if (erros.length > 0) {
                    totalErros += erros.length;
                    detalhes.push(`NF-e ${chave.substring(0, 15)}: ${erros.join('; ')}`);
                }
                
            } catch (err) {
                console.error(`❌ Erro ao reverter NF-e ${nfe.id}:`, err);
                totalErros++;
                detalhes.push(`NF-e ${nfe.id}: ${err.message}`);
            }
        }
        
        // Atualizar estoque local
        if (totalRevertido > 0 && typeof window.carregarProdutosEstoque === 'function') {
            await window.carregarProdutosEstoque();
        }
        
        console.log('\n📊 ===== REVERSÃO CONCLUÍDA =====');
        console.log(`✅ NF-e revertidas: ${nfesRevertidas}`);
        console.log(`✅ Itens revertidos: ${totalRevertido}`);
        console.log(`❌ Erros: ${totalErros}`);
        
        if (produtosRevertidosList.length > 0) {
            console.log('📦 Produtos revertidos:');
            produtosRevertidosList.forEach(p => {
                console.log(`  - ${p.sku}: +${p.quantidade} (NF: ${p.nfe})`);
            });
        }
        
        let mensagem = `✅ ${totalRevertido} item(ns) revertidos em ${nfesRevertidas} NF-e!`;
        if (totalErros > 0) {
            mensagem += ` ⚠️ ${totalErros} erro(s) encontrados.`;
        }
        if (totalRevertido === 0) {
            mensagem = 'ℹ️ Nenhum item foi revertido. Verifique se as NF-e já foram processadas.';
        }
        showToast(mensagem, totalErros > 0 ? 'warning' : 'success');
        
        return { totalRevertido, totalErros, nfesRevertidas, detalhes, produtosRevertidos: produtosRevertidosList };
        
    } catch (error) {
        console.error('❌ Erro ao reverter estoque:', error);
        showToast('❌ Erro ao reverter estoque: ' + error.message, 'error');
        return { totalRevertido: 0, totalErros: 1, error: error.message };
    }
};

console.log('✅ Função reverterEstoqueNFes registrada (versão com comparação por 8 caracteres)');

// =========================================================
// REGISTRAR VENDA NO ESTOQUE (CHAMADO PELA EMISSÃO DE NF-E)
// =========================================================

async function registrarVendaEstoque(produtoId, quantidade, numeroVenda, usuario) {
    try {
        if (!window.supabaseClient) {
            console.warn('Supabase não disponível para registrar venda');
            return { success: false, error: 'Supabase não disponível' };
        }
        
        // Buscar produto atual
        const { data: produto, error: errProd } = await window.supabaseClient
            .from('produtos_estoque')
            .select('quantidade, sku, nome')
            .eq('id', produtoId)
            .single();
        
        if (errProd) throw errProd;
        
        if (!produto) {
            return { success: false, error: 'Produto não encontrado' };
        }
        
        // Verificar se há estoque suficiente
        if ((produto.quantidade || 0) < quantidade) {
            return { 
                success: false, 
                error: `Estoque insuficiente! Disponível: ${produto.quantidade}, Vendido: ${quantidade}` 
            };
        }
        
        const novaQuantidade = (produto.quantidade || 0) - quantidade;
        
        // Atualizar estoque
        const { error: errUpdate } = await window.supabaseClient
            .from('produtos_estoque')
            .update({ quantidade: novaQuantidade })
            .eq('id', produtoId);
        
        if (errUpdate) throw errUpdate;
        
        // Registrar movimentação como VENDA
        const numeroMov = await gerarNumeroMovimentacao();
        const { error: errMov } = await window.supabaseClient
            .from('estoque_movimentacoes')
            .insert([{
                produto_id: produtoId,
                tipo: 'saida',
                quantidade: quantidade,
                usuario: usuario || currentUser?.name || 'sistema',
                numero_movimentacao: numeroMov,
                numero_documento: `NFE-${numeroVenda}`,
                tipo_entrada: 'venda',
                data_hora: new Date().toISOString(),
                saldo_apos: novaQuantidade
            }]);
        
        if (errMov) throw errMov;
        
        // Atualizar o produto localmente
        const produtoLocal = produtosEstoque.find(p => p.id == produtoId);
        if (produtoLocal) {
            produtoLocal.quantidade = novaQuantidade;
        }
        
        console.log(`✅ Venda registrada: ${quantidade} unidade(s) de ${produto.sku} (${produto.nome})`);
        return { 
            success: true, 
            novaQuantidade: novaQuantidade,
            produto: produto.sku
        };
        
    } catch (error) {
        console.error('❌ Erro ao registrar venda:', error);
        return { success: false, error: error.message };
    }
}

// Expor função global
window.registrarVendaEstoque = registrarVendaEstoque;

// =========================================================
// FUNÇÃO PARA RENDERIZAR O GRÁFICO DO HISTÓRICO
// =========================================================

function renderizarGraficoHistorico(dados, nomeProduto) {
    const canvas = document.getElementById('graficoHistoricoEstoque');
    if (!canvas) {
        console.warn('Canvas do gráfico não encontrado');
        return;
    }
    
    // Verificar se o Chart.js está disponível
    if (typeof Chart === 'undefined') {
        console.warn('Chart.js não carregado. Tentando carregar...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = function() {
            console.log('Chart.js carregado, renderizando gráfico...');
            setTimeout(() => renderizarGraficoHistorico(dados, nomeProduto), 200);
        };
        document.head.appendChild(script);
        return;
    }
    
    // Destruir gráfico existente se houver
    if (window._graficoHistoricoInstance) {
        window._graficoHistoricoInstance.destroy();
        window._graficoHistoricoInstance = null;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Preparar dados para o gráfico
    const labels = dados.map(d => d.data);
    const saldos = dados.map(d => d.saldo);
    
    // Cores baseadas no tipo de movimentação
    const pointColors = dados.map(d => {
        if (d.tipo === 'entrada') return '#28a745';
        return '#dc3545';
    });
    
    // Criar dataset com gradiente
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(0, 173, 238, 0.3)');
    gradient.addColorStop(1, 'rgba(0, 173, 238, 0.05)');
    
    window._graficoHistoricoInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Saldo em Estoque',
                data: saldos,
                borderColor: '#00ADEE',
                backgroundColor: gradient,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: pointColors,
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 8,
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 11,
                            weight: '600'
                        },
                        color: '#495057',
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const dado = dados[index];
                            return [
                                `Saldo: ${dado.saldo} unidades`,
                                `${dado.tipo === 'entrada' ? '➕ Entrada' : '➖ Saída'}: ${dado.quantidade} unidades`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: {
                            size: 9
                        },
                        maxTicksLimit: 15,
                        color: '#6c757d'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0,0,0,0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        font: {
                            size: 10
                        },
                        color: '#6c757d',
                        stepSize: Math.max(1, Math.ceil(Math.max(...saldos) / 8))
                    },
                    title: {
                        display: true,
                        text: 'Quantidade',
                        color: '#6c757d',
                        font: {
                            size: 11
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    });
    
    console.log('✅ Gráfico do histórico renderizado com sucesso!');
}

// =========================================================
// GERAR NÚMERO DE MOVIMENTAÇÃO
// =========================================================

async function gerarNumeroMovimentacao() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const prefixo = `${ano}${mes}${dia}`;
    const { data, error } = await window.supabaseClient
        .from('estoque_movimentacoes')
        .select('numero_movimentacao')
        .ilike('numero_movimentacao', `MOV-${prefixo}-%`)
        .order('numero_movimentacao', { ascending: false })
        .limit(1);
    let sequencial = 1;
    if (data && data.length > 0) {
        const ultimo = data[0].numero_movimentacao;
        const match = ultimo.match(/\d{4}$/);
        if (match) sequencial = parseInt(match[0]) + 1;
    }
    return `MOV-${prefixo}-${String(sequencial).padStart(4, '0')}`;
}

// =========================================================
// FUNÇÕES DE SALVAR PRODUTO COM VERIFICAÇÃO DE DUPLICIDADE
// =========================================================

async function salvarProdutoEstoque() {
    const id = document.getElementById('produtoId').value;
    const nome = document.getElementById('produtoNome').value.trim();
    const preco = parseFloat(document.getElementById('produtoPreco').value) || 0;
    const descricao = document.getElementById('produtoDescricao').value.trim();
    const categoria = document.getElementById('produtoCategoria').value;
    const toggleSync = document.getElementById('bloquearSyncML');
    
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    const podeModificarSync = usuariosAutorizadosSync.includes(username) || isAdmin;
    
    let bloquearSync = false;
    if (podeModificarSync && toggleSync) {
        bloquearSync = toggleSync.checked;
    } else if (id) {
        const produtoExistente = produtosEstoque.find(p => p.id == id);
        if (produtoExistente) {
            bloquearSync = produtoExistente.bloquear_sync_ml || produtoExistente.dados_extra?.bloquear_sync_ml || false;
        }
    }

    if (!nome || !categoria) {
        if (window.showToast) showToast('Nome e Categoria são obrigatórios', 'warning');
        return;
    }

    // ===== VERIFICAÇÃO DE DUPLICIDADE POR 5 PRIMEIROS CARACTERES =====
    const sku = document.getElementById('produtoSKU').value.trim();
    if (!sku) {
        showToast('SKU é obrigatório', 'warning');
        return;
    }
    
    const duplicidade = verificarDuplicidadeSKU(sku, id || null);
    if (duplicidade.duplicado) {
        showToast(`❌ ${duplicidade.mensagem}`, 'error');
        document.getElementById('produtoSKU').focus();
        document.getElementById('produtoSKU').style.borderColor = '#dc3545';
        setTimeout(() => {
            document.getElementById('produtoSKU').style.borderColor = '';
        }, 3000);
        return;
    }

    // Coletar dados extra
    const dadosExtra = {};
    const campos = getCamposPorCategoria(categoria);
    
    for (const campo of campos) {
        const el = document.getElementById(`campo_${campo.nome}`);
        if (el) {
            if (campo.tipo === 'checkbox') {
                dadosExtra[campo.nome] = el.checked;
            } else if (campo.nome === 'mlb_codes' && el.value.trim()) {
                const mlbText = el.value.trim();
                if (!validarMLBCodes(mlbText)) {
                    showToast(`Formato inválido para MLB Codes. Use: "MLB1496273494, MLB4220545731"`, 'error');
                    el.focus();
                    return;
                }
                const valores = mlbText.split(',').map(v => v.trim()).filter(v => v);
                dadosExtra[campo.nome] = valores;
            } else {
                let valor = el.value;
                if (campo.tipo === 'number' && valor !== '') valor = parseFloat(valor);
                if (campo.validacao === 'numero_virgula' && valor !== '') {
                    if (!/^[0-9]+(,[0-9]+)?$/.test(valor)) {
                        showToast(`O campo "${campo.label}" deve conter apenas números e vírgula`, 'warning');
                        el.focus();
                        return;
                    }
                }
                dadosExtra[campo.nome] = valor;
            }
        }
    }

    if (podeModificarSync) {
        dadosExtra.bloquear_sync_ml = bloquearSync;
    } else {
        delete dadosExtra.bloquear_sync_ml;
    }

    // Ângulos para Rolamentos
    if (categoria === 'Rolamentos') {
        const anguloInt = document.getElementById('campo_angulo_interno');
        const anguloExt = document.getElementById('campo_angulo_externo');
        const angulosDiv = document.getElementById('camposAngulosRolamento');
        if (angulosDiv && angulosDiv.style.display !== 'none') {
            if (anguloInt && anguloInt.value.trim() !== '') {
                const val = anguloInt.value.trim();
                if (!/^[0-9]+(,[0-9]+)?$/.test(val)) {
                    showToast('Ângulo interno deve conter apenas números e vírgula', 'warning');
                    anguloInt.focus();
                    return;
                }
                dadosExtra.angulo_interno = val;
            }
            if (anguloExt && anguloExt.value.trim() !== '') {
                const val = anguloExt.value.trim();
                if (!/^[0-9]+(,[0-9]+)?$/.test(val)) {
                    showToast('Ângulo externo deve conter apenas números e vírgula', 'warning');
                    anguloExt.focus();
                    return;
                }
                dadosExtra.angulo_externo = val;
            }
        }
    }

    // SKUs do kit
    let skusKit = [];
    const tbody = document.getElementById('kitSkusBody');
    if (tbody) {
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row) => {
            const isMuted = row.querySelector('.text-muted');
            if (isMuted) return;
            
            const skuFilhoInput = row.querySelector('.kit-sku-filho');
            const quantidadeInput = row.querySelector('.kit-quantidade');
            
            if (skuFilhoInput && quantidadeInput) {
                const skuFilho = skuFilhoInput.value.trim();
                const quantidade = parseInt(quantidadeInput.value) || 1;
                if (skuFilho) {
                    skusKit.push({ sku_filho: skuFilho, quantidade });
                }
            }
        });
    }

        // Bulk mode para Raios
    // ===== BULK MODE PARA RAIOS =====
    const bulkPanel = document.getElementById('bulkModePanel');
    const isBulkMode = (categoria === 'Raios' && !id && bulkPanel && bulkPanel.style.display === 'block');

    if (isBulkMode) {
        const rows = document.querySelectorAll('#bulkTamanhosBody tr');
        const bulkItems = [];
        const tamanhosSet = new Set();
        const skusSet = new Set();

        for (let row of rows) {
            const tamanho = row.querySelector('.bulk-tamanho')?.value?.trim();
            const skuItem = row.querySelector('.bulk-sku')?.value?.trim();
            const quantidade = parseInt(row.querySelector('.bulk-quantidade')?.value) || 0;

            if (!tamanho || !skuItem) {
                showToast('Todos os tamanhos e SKUs devem ser preenchidos', 'warning');
                return;
            }
            
            // Verificar duplicidade de cada SKU no bulk
            const dupBulk = verificarDuplicidadeSKU(skuItem);
            if (dupBulk.duplicado) {
                showToast(`❌ SKU "${skuItem}" duplicado - ${dupBulk.mensagem}`, 'error');
                return;
            }
            
            if (tamanhosSet.has(tamanho)) {
                showToast(`Tamanho ${tamanho} duplicado`, 'warning');
                return;
            }
            if (skusSet.has(skuItem)) {
                showToast(`SKU ${skuItem} duplicado`, 'warning');
                return;
            }
            tamanhosSet.add(tamanho);
            skusSet.add(skuItem);
            bulkItems.push({ tamanho, quantidade, sku: skuItem });
        }

        if (bulkItems.length === 0) {
            showToast('Adicione pelo menos um tamanho', 'warning');
            return;
        }

        if (!confirm(`Criar ${bulkItems.length} produto(s) com as mesmas informações de marca/modelo/cabeça?`)) return;

        let created = 0;
        let errors = [];

        // ===== PEGAR MLB CODES DO CAMPO =====
        const mlbField = document.getElementById('campo_mlb_codes');
        let mlbCodes = [];
        if (mlbField && mlbField.value.trim()) {
            const mlbText = mlbField.value.trim();
            if (!validarMLBCodes(mlbText)) {
                showToast(`Formato inválido para MLB Codes. Use: "MLB1496273494, MLB4220545731"`, 'error');
                mlbField.focus();
                return;
            }
            mlbCodes = mlbText.split(',').map(v => v.trim()).filter(v => v);
        }

        for (const item of bulkItems) {
            // Verificar se já existe no banco
            const { data: existing } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id')
                .eq('sku', item.sku)
                .maybeSingle();

            if (existing) {
                errors.push(`${item.sku} (já existe)`);
                continue;
            }

            // Criar uma cópia dos dados extra para este item
            const produtoDadosExtra = { ...dadosExtra };
            produtoDadosExtra.tamanhoraio = item.tamanho;
            
            // Adicionar MLB codes
            if (mlbCodes.length > 0) {
                produtoDadosExtra.mlb_codes = mlbCodes;
            }
            
            if (podeModificarSync) {
                produtoDadosExtra.bloquear_sync_ml = bloquearSync;
            }

            const produtoData = {
                nome: nome,
                sku: item.sku,
                quantidade: item.quantidade,
                preco: preco,
                descricao: descricao,
                categoria: categoria,
                dados_extra: produtoDadosExtra,
                ultimo_custo: 0,
                custo_medio: 0,
                historico_custos: [],
                bloquear_sync_ml: podeModificarSync ? bloquearSync : false
            };

            try {
                const { data, error } = await window.supabaseClient
                    .from('produtos_estoque')
                    .insert([produtoData])
                    .select();
                if (error) throw error;
                created++;
                if (item.quantidade > 0) {
                    await registrarMovimentacao(data[0].id, 'entrada', item.quantidade, 'Criação em massa - Raios', 'nova');
                }
            } catch (err) {
                errors.push(`${item.sku}: ${err.message}`);
            }
        }

        let msg = `✅ ${created} produto(s) criado(s)!`;
        if (errors.length) {
            msg += ` ⚠️ Erros: ${errors.join(', ')}`;
        }
        showToast(msg, errors.length > 0 ? 'warning' : 'success');

        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();
        return;
    }

    // Modo normal (single)
    const quantidade = parseInt(document.getElementById('produtoQuantidade').value) || 0;

    let ultimoCusto = 0;
    let custoMedio = 0;
    let historicoCustos = [];
    let bloquearSyncExistente = false;
    
    if (id) {
        const produtoExistente = produtosEstoque.find(p => p.id == id);
        if (produtoExistente) {
            ultimoCusto = produtoExistente.ultimo_custo || produtoExistente.dados_extra?.ultimo_custo || 0;
            custoMedio = produtoExistente.custo_medio || produtoExistente.dados_extra?.custo_medio || 0;
            historicoCustos = produtoExistente.historico_custos || [];
            bloquearSyncExistente = produtoExistente.bloquear_sync_ml || produtoExistente.dados_extra?.bloquear_sync_ml || false;
        }
    }

    const produtoData = {
        nome,
        sku,
        quantidade,
        preco,
        descricao,
        categoria,
        dados_extra: dadosExtra,
        ultimo_custo: ultimoCusto,
        custo_medio: custoMedio,
        historico_custos: historicoCustos,
        bloquear_sync_ml: podeModificarSync ? bloquearSync : bloquearSyncExistente
    };

    try {
        let produtoSalvo;

        const idValido = id && id !== 'undefined' && id !== 'null' && id.trim() !== '';

        if (idValido) {
            const { data, error } = await window.supabaseClient
                .from('produtos_estoque')
                .update(produtoData)
                .eq('id', parseInt(id))
                .select();
            if (error) throw error;
            produtoSalvo = data && data[0] ? data[0] : null;
            if (produtoSalvo) {
                showToast('Produto atualizado!', 'success');
            } else {
                showToast('Erro: produto não encontrado para edição.', 'error');
                return;
            }
        } else {
            const { data, error } = await window.supabaseClient
                .from('produtos_estoque')
                .insert([produtoData])
                .select();
            if (error) throw error;
            produtoSalvo = data && data[0] ? data[0] : null;
            if (produtoSalvo) {
                if (quantidade > 0) {
                    await registrarMovimentacao(produtoSalvo.id, 'entrada', quantidade, 'Criação do produto', 'nova');
                }
                showToast('Produto adicionado!', 'success');
            } else {
                showToast('Erro ao criar produto.', 'error');
                return;
            }
        }

        if (sku && skusKit.length > 0) {
            const result = await salvarSkusKit(sku, skusKit);
            if (!result.success) {
                console.error('Erro ao salvar SKUs do kit:', result.error);
                showToast('Erro ao salvar composição do kit: ' + result.error, 'warning');
            }
        } else if (sku) {
            await excluirSkusKit(sku);
        }

        if (!entradaEmProcessamento) {
            fecharModalProdutoEstoque();
        }

        await carregarProdutosEstoque();

        const syncBloqueado = produtoSalvo?.bloquear_sync_ml || produtoSalvo?.dados_extra?.bloquear_sync_ml || false;
        
        if (produtoSalvo && produtoSalvo.dados_extra?.mlb_codes?.length && !syncBloqueado) {
            console.log(`🔄 Sincronizando produto ${produtoSalvo.sku} com ML (sincronização ATIVA)`);
            setTimeout(() => {
                sincronizarEstoqueML(produtoSalvo);
            }, 500);
        } else if (produtoSalvo && produtoSalvo.dados_extra?.mlb_codes?.length && syncBloqueado) {
            console.log(`🔒 Produto ${produtoSalvo.sku} com sincronização BLOQUEADA. Não será sincronizado.`);
            if (podeModificarSync) {
                showToast(`🔒 Sincronização com ML bloqueada para este produto`, 'info');
            }
        }

    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showToast('Erro: ' + error.message, 'error');
    }
}

// =========================================================
// FUNÇÕES AUXILIARES DE CATEGORIAS E CAMPOS
// =========================================================

// Definição dos campos específicos por categoria (organizados em grade)
const camposPorCategoria = {
    Eixos: [
        { nome: "tamanho", label: "Tamanho Eixo", tipo: "text", obrigatorio: true, placeholder: "Ex: 175" },
        { nome: "passo", label: "Passo da rosca", tipo: "number", obrigatorio: true, placeholder: "Ex: 1.5" },
        { nome: "posição", label: "Posição", tipo: "select", opcoes: ["Dianteiro", "Traseiro"] },
        { nome: "tipodarosca", label: "Tipo da Rosca", tipo: "select", opcoes: ["Doublelead", "Singlelead"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula (ex: MLB123, MLB456, MLB789)", obrigatorio: false, rows: 2}
    ],
    Parafusos: [
        { nome: "tamanhocabeça", label: "Diâmetro Cabeça", tipo: "text", obrigatorio: true, placeholder: "Ex: M6" },
        { nome: "tamanhorosca", label: "Tamanho Rosca", tipo: "text", placeholder: "Ex: 30mm" },
        { nome: "material", label: "Material", tipo: "text", opcoes: ["Titânio", "Aço"] },
        { nome: "cabeça", label: "Cabeça", tipo: "select", opcoes: ["Abaulada", "Reta", "Enflexada", "Cônica"] },
        { nome: "cor", label: "Cor", tipo: "select", opcoes: ["Preto", "Dourado", "Rainbow", "Natural"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    Rolamentos: [
        { nome: "diametroint", label: "Diâmetro Interno", tipo: "text", placeholder: "Ex: 15 ou 15,5", obrigatorio: true, validacao: "numero_virgula" },
        { nome: "diametroext", label: "Diâmetro Externo", tipo: "text", placeholder: "Ex: 26 ou 26,5", obrigatorio: true, validacao: "numero_virgula" },
        { nome: "largura", label: "Largura", tipo: "number", placeholder: "Ex: 7", obrigatorio: true },
        { nome: "aplicaçao", label: "Aplicação", tipo: "select", opcoes: ["Cubo/Caixa de Direção", "Movimento Central", "Outros"] },
        { nome: "marca", label: "Marca", tipo: "text", placeholder: "Enduro" },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    Raios: [
        { nome: "marca", label: "Marca", tipo: "select", opcoes: ["Sapim", "Pillar", "Mavic", "Richman", "Green", "Dt Swiss", "Crank Brothers", "VeloForce", "Zincado", "Titânio", "T-Head"] },
        { nome: "modelo", label: "Modelo", tipo: "select", opcoes: [] },
        { nome: "cabeçaraio", label: "Cabeça do Raio", tipo: "select", opcoes: ["SP", "J"] },
        { nome: "tamanhoraio", label: "Tamanho Raio", tipo: "number", placeholder: "Ex: 284"},
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    Porcas: [
        { nome: "tamanho", label: "Tamanho", tipo: "text", placeholder: "Ex: 1mm ou 2mm" },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],  
    Arruelas: [
        { nome: "tamanho", label: "Tamanho", tipo: "text", placeholder: "Ex: 1mm ou 2mm" },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],   
    CapacetesEPartes: [
        { nome: "tamanhopadrao", label: "Tamanho Padrão", tipo: "select", opcoes: ["P", "M", "G", "P/M", "M/G", "U"] },
        { nome: "tamanhonumerico", label: "Tamanho Númerico", tipo: "number" },
        { nome: "cor", label: "Cor", tipo: "text", placeholder: "Ex: Preto" },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ], 
    outros: [
        { nome: "observacoes_adicionais", label: "Observações", tipo: "textarea", rows: 2 },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ]
};

function gerarCamposDinamicos(categoria) {
    const container = document.getElementById('camposDinamicos');
    if (!container) return;
    container.innerHTML = '';

    const campos = getCamposPorCategoria(categoria);
    
    if (!campos || campos.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum campo específico para esta categoria.</div>';
        const bulkSection = document.getElementById('bulkAddSection');
        if (bulkSection) bulkSection.style.display = 'none';
        
        const kitContainer = document.getElementById('kitComposicaoContainer');
        if (kitContainer) {
            kitContainer.style.display = 'block';
            configurarEventosKit();
        }
        return;
    }

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';
    grid.style.marginTop = '10px';

    campos.forEach(campo => {
        const div = document.createElement('div');
        div.className = 'campo-dinamico';

        const label = document.createElement('label');
        label.style.fontWeight = '600';
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        label.textContent = `${campo.label} ${campo.obrigatorio ? '*' : ''}`;
        div.appendChild(label);

        if (campo.validacao === 'numero_virgula') {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `campo_${campo.nome}`;
            input.className = 'form-control';
            if (campo.placeholder) input.placeholder = campo.placeholder;
            if (campo.obrigatorio) input.required = true;
            input.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^0-9,]/g, '');
            });
            input.addEventListener('blur', function(e) {
                const val = this.value.trim();
                if (val !== '' && !/^[0-9]+(,[0-9]+)?$/.test(val)) {
                    showToast('Digite apenas números e vírgula (ex: 15 ou 15,5)', 'warning');
                    this.focus();
                }
            });
            div.appendChild(input);
            grid.appendChild(div);
            return;
        }

        if (campo.tipo === 'select') {
            const select = document.createElement('select');
            select.id = `campo_${campo.nome}`;
            select.className = 'form-control';
            if (campo.obrigatorio) select.required = true;
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Selecione...';
            select.appendChild(defaultOption);
            if (campo.opcoes && campo.opcoes.length > 0) {
                campo.opcoes.forEach(op => {
                    const option = document.createElement('option');
                    option.value = op;
                    option.textContent = op;
                    select.appendChild(option);
                });
            }
            if (categoria === 'Raios' && campo.nome === 'marca') {
                select.addEventListener('change', (e) => {
                    atualizarModelosPorMarca(e.target.value);
                });
            }
            div.appendChild(select);
            grid.appendChild(div);
            return;
        }

        if (campo.tipo === 'checkbox') {
            const wrapper = document.createElement('div');
            wrapper.className = 'form-check';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `campo_${campo.nome}`;
            checkbox.className = 'form-check-input';
            const checkLabel = document.createElement('label');
            checkLabel.className = 'form-check-label';
            checkLabel.htmlFor = `campo_${campo.nome}`;
            checkLabel.textContent = campo.label;
            wrapper.appendChild(checkbox);
            wrapper.appendChild(checkLabel);
            div.appendChild(wrapper);
            grid.appendChild(div);
            return;
        }

        if (campo.tipo === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = `campo_${campo.nome}`;
            textarea.className = 'form-control';
            textarea.rows = campo.rows || 2;
            if (campo.placeholder) textarea.placeholder = campo.placeholder;
            div.appendChild(textarea);
            grid.appendChild(div);
            return;
        }

        const input = document.createElement('input');
        input.type = campo.tipo || 'text';
        input.id = `campo_${campo.nome}`;
        input.className = 'form-control';
        if (campo.step) input.step = campo.step;
        if (campo.min) input.min = campo.min;
        if (campo.placeholder) input.placeholder = campo.placeholder;
        if (campo.obrigatorio) input.required = true;
        div.appendChild(input);
        grid.appendChild(div);
    });

    container.appendChild(grid);

    // Campos de ângulos para Rolamentos
    if (categoria === 'Rolamentos') {
        let angulosDiv = document.getElementById('camposAngulosRolamento');
        if (!angulosDiv) {
            angulosDiv = document.createElement('div');
            angulosDiv.id = 'camposAngulosRolamento';
            angulosDiv.style.display = 'none';
            angulosDiv.style.marginTop = '10px';
            angulosDiv.style.borderTop = '1px solid #dee2e6';
            angulosDiv.style.paddingTop = '10px';
            angulosDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div class="campo-dinamico">
                        <label style="font-weight:600;display:block;margin-bottom:5px;">Ângulo interno *</label>
                        <input type="text" id="campo_angulo_interno" class="form-control" placeholder="Ex: 45" required>
                    </div>
                    <div class="campo-dinamico">
                        <label style="font-weight:600;display:block;margin-bottom:5px;">Ângulo externo *</label>
                        <input type="text" id="campo_angulo_externo" class="form-control" placeholder="Ex: 45" required>
                    </div>
                </div>
                <small class="text-muted">Preencha os ângulos internos e externos (apenas números e vírgula).</small>
            `;
            container.appendChild(angulosDiv);
        }

        function toggleAngulos(valorAplicacao) {
            if (!angulosDiv) return;
            const shouldShow = (valorAplicacao === 'Cubo/Caixa de Direção');
            angulosDiv.style.display = shouldShow ? 'block' : 'none';
            const angInt = document.getElementById('campo_angulo_interno');
            const angExt = document.getElementById('campo_angulo_externo');
            if (angInt) angInt.required = shouldShow;
            if (angExt) angExt.required = shouldShow;
            
            if (!shouldShow) {
                if (angInt) angInt.value = '';
                if (angExt) angExt.value = '';
            }
        }

        const selectAplicacao = document.getElementById('campo_aplicaçao');
        if (selectAplicacao) {
            const novoSelect = selectAplicacao.cloneNode(true);
            selectAplicacao.parentNode.replaceChild(novoSelect, selectAplicacao);
            
            novoSelect.addEventListener('change', function(e) {
                toggleAngulos(e.target.value);
            });
            
            setTimeout(() => {
                toggleAngulos(novoSelect.value);
            }, 300);
        }
    }

    // ===== CONFIGURAR BULK MODE PARA RAIOS =====
    const bulkSection = document.getElementById('bulkAddSection');
    const kitContainer = document.getElementById('kitComposicaoContainer');
    const isEditing = document.getElementById('produtoId').value !== '';
    
    if (kitContainer) {
        kitContainer.style.display = 'block';
        configurarEventosKit();
    }

    // Se for categoria Raios e NÃO for edição, mostrar o bulk
    if (categoria === 'Raios' && !isEditing) {
        if (bulkSection) {
            bulkSection.style.display = 'block';
            configurarBulkModeEvents();
        }
    } else {
        if (bulkSection) bulkSection.style.display = 'none';
    }
}

// ===== FUNÇÃO PARA LIMPAR LINHAS DO BULK =====
function limparBulkRows() {
    if (!confirm('Remover todos os tamanhos do modo múltiplo?')) return;
    const tbody = document.getElementById('bulkTamanhosBody');
    if (tbody) {
        tbody.innerHTML = '';
    }
}

// =========================================================
// VALIDAR MLB CODES
// =========================================================

function validarMLBCodes(texto) {
    if (!texto || texto.trim() === '') return true;
    const partes = texto.split(',').map(s => s.trim()).filter(s => s !== '');
    if (partes.length === 0) return true;
    const regex = /^MLB\d{10}$/;
    for (let p of partes) {
        if (!regex.test(p)) {
            return false;
        }
    }
    return true;
}

// =========================================================
// FUNÇÕES DE MODELOS POR MARCA (RAIOS)
// =========================================================

const modelosPorMarca = {
    "Sapim": ["Laser", "Leader", "Cx-Ray", "Race"],
    "Pillar": ["Butted 1.8 Preto", "Butted 1.8 Vermelho", "Butted 1.7", "Butted 1.5", "Trefilado 1.6", "Achatado", "Reforçado 2.0"],
    "Mavic": ["Crossride", "Crossmax", "Crossride Light", "Crossride Fts", "Aksium Ksyrium"],
    "Richman": ["Preto", "Fino Silver", "Grosso Silver"],
    "Green": ["Silver", "Pro", "Aero"],
    "Dt Swiss": ["Aero", "Competition", "Revolution", "Competition Especial", "Champion Preto", "Champion Prata", "Aero Comp"],
    "Crank Brothers": ["Preto"],
    "VeloForce": ["Preto", "Prata"],
    "Zincado": ["Prata"],
    "Titânio": ["Preto"],
    "T-Head": ["Revolution", "Competition", "AeroLite"]
};

function atualizarModelosPorMarca(marcaSelecionada) {
    const selectModelo = document.getElementById('campo_modelo');
    if (!selectModelo) return;
    selectModelo.innerHTML = '';
    const optionPadrao = document.createElement('option');
    optionPadrao.value = '';
    optionPadrao.textContent = '-- Selecione um modelo --';
    selectModelo.appendChild(optionPadrao);
    const modelos = modelosPorMarca[marcaSelecionada] || [];
    modelos.forEach(modelo => {
        const option = document.createElement('option');
        option.value = modelo;
        option.textContent = modelo;
        selectModelo.appendChild(option);
    });
}

async function carregarRegrasEstoque() {
    try {
        console.log('🔄 [carregarRegrasEstoque] Iniciando carregamento...');
        
        if (!window.supabaseClient) {
            console.log('⚠️ Supabase não disponível, usando localStorage');
            const localData = localStorage.getItem('regras_estoque_condicionais');
            if (localData) {
                regrasEstoqueAtuais = JSON.parse(localData);
                console.log('✅ Regras carregadas do localStorage:', regrasEstoqueAtuais);
            } else {
                regrasEstoqueAtuais = JSON.parse(JSON.stringify(regrasEstoquePadrao));
                localStorage.setItem('regras_estoque_condicionais', JSON.stringify(regrasEstoqueAtuais));
                console.log('✅ Regras padrão carregadas do código:', regrasEstoqueAtuais);
            }
            return;
        }
        
        // Buscar regras do Supabase
        const { data, error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .select('*')
            .eq('chave', 'regras_estoque_condicionais')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('❌ Erro ao carregar regras do Supabase:', error);
            return;
        }
        
        if (data && data.valor) {
            // Se veio do Supabase como string, converte
            if (typeof data.valor === 'string') {
                regrasEstoqueAtuais = JSON.parse(data.valor);
            } else {
                regrasEstoqueAtuais = data.valor;
            }
            console.log('✅ Regras carregadas do Supabase:', regrasEstoqueAtuais);
            
            // 🔥 SALVAR TAMBÉM NO LOCALSTORAGE PARA FALBACK
            localStorage.setItem('regras_estoque_condicionais', JSON.stringify(regrasEstoqueAtuais));
        } else {
            // Se não tem no Supabase, usa o padrão
            regrasEstoqueAtuais = JSON.parse(JSON.stringify(regrasEstoquePadrao));
            await salvarRegrasEstoque(regrasEstoqueAtuais);
            console.log('✅ Regras padrão salvas no Supabase:', regrasEstoqueAtuais);
        }
        
        // Atualizar modal se estiver aberto
        if (document.getElementById('modalRegrasEstoque')) {
            preencherModalRegras();
        }
        
        console.log('✅ [carregarRegrasEstoque] Finalizado com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao carregar regras:', error);
        // Fallback para localStorage
        const localData = localStorage.getItem('regras_estoque_condicionais');
        if (localData) {
            regrasEstoqueAtuais = JSON.parse(localData);
            console.log('✅ Regras carregadas do localStorage (fallback):', regrasEstoqueAtuais);
        } else {
            regrasEstoqueAtuais = JSON.parse(JSON.stringify(regrasEstoquePadrao));
            console.log('✅ Regras padrão carregadas (fallback):', regrasEstoqueAtuais);
        }
    }
}

async function salvarRegrasEstoque(regras) {
    try {
        console.log('🔄 [salvarRegrasEstoque] Salvando regras...');
        
        // 🔥 CORREÇÃO: Limpar regras inválidas antes de salvar
        const regrasLimpias = {};
        
        for (const [categoria, dados] of Object.entries(regras)) {
            if (!dados || !dados.condicoes || dados.condicoes.length === 0) {
                // Se não tem condições, pular
                console.log(`⚠️ Categoria ${categoria} sem condições, pulando...`);
                continue;
            }
            
            // Limpar cada condição
            const condicoesLimpias = dados.condicoes.map(cond => {
                const condLimpa = {};
                
                // Operador (obrigatório)
                condLimpa.operador = cond.operador || 'padrao';
                
                // Valor (se não for padrão)
                if (condLimpa.operador !== 'padrao') {
                    condLimpa.valor = typeof cond.valor === 'number' ? cond.valor : 0;
                }
                
                // Estoque máximo (obrigatório)
                condLimpa.estoque_maximo = typeof cond.estoque_maximo === 'number' ? cond.estoque_maximo : 30;
                
                return condLimpa;
            });
            
            // Filtrar condições duplicadas ou inválidas
            const condicoesFiltradas = condicoesLimpias.filter((cond, index, self) => {
                // Se for padrão, manter apenas a primeira
                if (cond.operador === 'padrao') {
                    return self.findIndex(c => c.operador === 'padrao') === index;
                }
                return true;
            });
            
            // Garantir que tem pelo menos a condição padrão
            const temPadrao = condicoesFiltradas.some(c => c.operador === 'padrao');
            if (!temPadrao) {
                condicoesFiltradas.push({ operador: 'padrao', estoque_maximo: 30 });
            }
            
            regrasLimpias[categoria] = {
                condicoes: condicoesFiltradas
            };
        }
        
        console.log('📊 Regras limpas para salvar:', regrasLimpias);
        
        if (!window.supabaseClient) {
            localStorage.setItem('regras_estoque_condicionais', JSON.stringify(regrasLimpias));
            regrasEstoqueAtuais = regrasLimpias;
            showToast('✅ Regras salvas no localStorage!', 'success');
            renderizarTabelaProdutos(produtosFiltradosAtuais);
            return;
        }
        
        const { error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .upsert({
                chave: 'regras_estoque_condicionais',
                valor: JSON.stringify(regrasLimpias),
                atualizado_em: new Date().toISOString(),
                atualizado_por: currentUser?.name || 'sistema'
            }, { onConflict: 'chave' });
        
        if (error) throw error;
        
        regrasEstoqueAtuais = regrasLimpias;
        console.log('✅ Regras salvas com sucesso!');
        showToast('✅ Regras de estoque atualizadas!', 'success');
        renderizarTabelaProdutos(produtosFiltradosAtuais);
        
    } catch (error) {
        console.error('❌ Erro ao salvar regras:', error);
        showToast('Erro ao salvar regras: ' + error.message, 'error');
    }
}

function calcularEstoqueMaximo(produto) {
    console.log(`📊 [calcularEstoqueMaximo] INICIANDO - SKU: ${produto.sku}, Preço: ${produto.preco}, Categoria: ${produto.categoria}`);
    
    if (!produto) {
        console.log('📊 Produto vazio, retornando 30');
        return 30;
    }
    
    const sku = produto.sku || '';
    const categoria = produto.categoria || '';
    const precoUnitario = produto.preco || 0;
    
    console.log(`📊 Regras disponíveis no sistema:`, Object.keys(regrasEstoqueAtuais));
    
    // ===== REGRA INDIVIDUAL (prioridade máxima) =====
    const regraIndividual = regrasEstoqueIndividuais[sku];
    if (regraIndividual && regraIndividual.condicoes && regraIndividual.condicoes.length > 0) {
        console.log(`📊 Regra INDIVIDUAL encontrada para SKU: ${sku}`);
        for (const condicao of regraIndividual.condicoes) {
            console.log(`📊 Avaliando condição individual:`, condicao);
            if (condicao.operador === 'padrao') {
                console.log(`📊 Retornando regra individual padrão: ${condicao.estoque_maximo}`);
                return condicao.estoque_maximo || 30;
            }
            if (condicao.operador === 'maior_que' && precoUnitario > condicao.valor) {
                console.log(`📊 Retornando regra individual (preço > ${condicao.valor}): ${condicao.estoque_maximo}`);
                return condicao.estoque_maximo || 30;
            }
            if (condicao.operador === 'menor_que' && precoUnitario < condicao.valor) {
                console.log(`📊 Retornando regra individual (preço < ${condicao.valor}): ${condicao.estoque_maximo}`);
                return condicao.estoque_maximo || 30;
            }
            if (condicao.operador === 'igual_a' && precoUnitario === condicao.valor) {
                console.log(`📊 Retornando regra individual (preço = ${condicao.valor}): ${condicao.estoque_maximo}`);
                return condicao.estoque_maximo || 30;
            }
        }
        // Se não encontrou nenhuma condição, busca o padrão
        const padrao = regraIndividual.condicoes.find(c => c.operador === 'padrao');
        if (padrao) {
            console.log(`📊 Retornando regra individual padrão (fallback): ${padrao.estoque_maximo}`);
            return padrao.estoque_maximo || 30;
        }
    }
    
    // ===== REGRA DA CATEGORIA =====
    console.log(`📊 Buscando regra para categoria: "${categoria}"`);
    console.log(`📊 regrasEstoqueAtuais:`, regrasEstoqueAtuais);
    
    // 🔥 FIX: Verificar se a categoria existe nas regras
    let regrasCategoria = regrasEstoqueAtuais[categoria];
    if (!regrasCategoria) {
        console.log(`📊 Categoria "${categoria}" não encontrada nas regras. Usando 'outros'`);
        regrasCategoria = regrasEstoqueAtuais['outros'] || regrasEstoquePadrao['outros'];
    }
    
    if (!regrasCategoria || !regrasCategoria.condicoes) {
        console.log(`📊 Nenhuma condição encontrada para categoria. Retornando 30`);
        return 30;
    }
    
    console.log(`📊 Condições da categoria "${categoria}":`, regrasCategoria.condicoes);
    
    // Percorre as condições da categoria
    for (const condicao of regrasCategoria.condicoes) {
        console.log(`📊 Avaliando condição:`, condicao);
        
        if (condicao.operador === 'padrao') {
            console.log(`📊 Retornando regra PADRÃO: ${condicao.estoque_maximo}`);
            return condicao.estoque_maximo || 30;
        }
        
        if (condicao.operador === 'maior_que' && precoUnitario > condicao.valor) {
            console.log(`📊 Retornando regra (preço > ${condicao.valor}): ${condicao.estoque_maximo}`);
            return condicao.estoque_maximo || 30;
        }
        
        if (condicao.operador === 'menor_que' && precoUnitario < condicao.valor) {
            console.log(`📊 Retornando regra (preço < ${condicao.valor}): ${condicao.estoque_maximo}`);
            return condicao.estoque_maximo || 30;
        }
        
        if (condicao.operador === 'igual_a' && precoUnitario === condicao.valor) {
            console.log(`📊 Retornando regra (preço = ${condicao.valor}): ${condicao.estoque_maximo}`);
            return condicao.estoque_maximo || 30;
        }
    }
    
    // Se chegou aqui, usa o padrão (última condição ou 30)
    const ultimaCondicao = regrasCategoria.condicoes[regrasCategoria.condicoes.length - 1];
    if (ultimaCondicao) {
        console.log(`📊 Usando última condição como fallback: ${ultimaCondicao.estoque_maximo}`);
        return ultimaCondicao.estoque_maximo || 30;
    }
    
    console.log('📊 Nenhuma regra encontrada, retornando 30');
    return 30;
}

function verificarExcessoEstoque(produto) {
    if (!produto) return false;
    const estoqueMaximo = calcularEstoqueMaximo(produto);
    return produto.quantidade > estoqueMaximo;
}

function getDescricaoRegra(produto) {
    if (!produto || !produto.categoria) return 'Sem regra definida';
    
    const regrasCategoria = regrasEstoqueAtuais[produto.categoria] || regrasEstoquePadrao['outros'];
    if (!regrasCategoria || !regrasCategoria.condicoes) return 'Sem regra definida';
    
    const precoUnitario = produto.preco || 0;
    const regrasAplicadas = [];
    
    for (const condicao of regrasCategoria.condicoes) {
        if (condicao.operador === 'padrao') {
            regrasAplicadas.push(`Padrão: ${condicao.estoque_maximo} unidades`);
            continue;
        }
        
        const operadorTexto = condicao.operador === 'maior_que' ? '>' : 
                             condicao.operador === 'menor_que' ? '<' : '=';
        
        let aplicado = false;
        if (condicao.operador === 'maior_que' && precoUnitario > condicao.valor) aplicado = true;
        else if (condicao.operador === 'menor_que' && precoUnitario < condicao.valor) aplicado = true;
        else if (condicao.operador === 'igual_a' && precoUnitario === condicao.valor) aplicado = true;
        
        const prefixo = aplicado ? '✅' : '⏭️';
        regrasAplicadas.push(`${prefixo} Se preço ${operadorTexto} R$ ${condicao.valor.toFixed(2)} → ${condicao.estoque_maximo} unid.`);
    }
    
    return regrasAplicadas.join('\n');
}

// =========================================================
// REGRAS INDIVIDUAIS
// =========================================================

async function carregarRegrasIndividuais() {
    try {
        if (!window.supabaseClient) {
            const localData = localStorage.getItem('regras_estoque_individuais');
            if (localData) {
                regrasEstoqueIndividuais = JSON.parse(localData);
                console.log('✅ Regras individuais carregadas do localStorage');
            }
            return;
        }
        
        const { data, error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .select('*')
            .eq('chave', 'regras_estoque_individuais')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Erro ao carregar regras individuais:', error);
            return;
        }
        
        if (data && data.valor) {
            regrasEstoqueIndividuais = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
            console.log('✅ Regras individuais carregadas:', Object.keys(regrasEstoqueIndividuais).length);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar regras individuais:', error);
        regrasEstoqueIndividuais = {};
    }
}

async function salvarRegrasIndividuais(regras) {
    try {
        if (!window.supabaseClient) {
            localStorage.setItem('regras_estoque_individuais', JSON.stringify(regras));
            regrasEstoqueIndividuais = regras;
            showToast('✅ Regras individuais salvas no localStorage!', 'success');
            return;
        }
        
        const { error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .upsert({
                chave: 'regras_estoque_individuais',
                valor: JSON.stringify(regras),
                atualizado_em: new Date().toISOString(),
                atualizado_por: currentUser?.name || 'sistema'
            }, { onConflict: 'chave' });
        
        if (error) throw error;
        
        regrasEstoqueIndividuais = regras;
        console.log('✅ Regras individuais salvas!');
        showToast('✅ Regras individuais atualizadas!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao salvar regras individuais:', error);
        showToast('Erro ao salvar regras individuais: ' + error.message, 'error');
    }
}

// =========================================================
// FUNÇÕES DE KIT
// =========================================================

function configurarEventosKit() {
    const addBtn = document.getElementById('addKitSkuBtn');
    const clearBtn = document.getElementById('clearKitSkusBtn');
    
    if (addBtn) {
        addBtn.onclick = function() {
            const tbody = document.getElementById('kitSkusBody');
            const emptyRow = tbody.querySelector('.text-muted');
            if (emptyRow) emptyRow.remove();
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    <input type="text" class="form-control form-control-sm kit-sku-filho" placeholder="SKU filho">
                </td>
                <td>
                    <input type="number" class="form-control form-control-sm kit-quantidade" value="1" min="1" step="1">
                </td>
                <td>
                    <button type="button" class="btn btn-sm btn-danger remove-kit-sku">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
            
            row.querySelector('.remove-kit-sku').addEventListener('click', function() {
                row.remove();
                if (document.querySelectorAll('#kitSkusBody tr').length === 0) {
                    document.getElementById('kitSkusBody').innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum SKU adicionado ao kit.</td></tr>';
                }
            });
        };
    }
    
    if (clearBtn) {
        clearBtn.onclick = function() {
            if (confirm('Remover todos os SKUs do kit?')) {
                document.getElementById('kitSkusBody').innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum SKU adicionado ao kit.</td></tr>';
            }
        };
    }
}

async function carregarSkusKit(skuPai) {
    if (!skuPai || !window.supabaseClient) return [];
    try {
        const { data, error } = await window.supabaseClient
            .from('produto_skus_kit')
            .select('*')
            .eq('sku_pai', skuPai);
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao carregar SKUs do kit:', error);
        return [];
    }
}

async function salvarSkusKit(skuPai, skusFilhos) {
    if (!skuPai || !window.supabaseClient) {
        return { success: false, error: 'Dados inválidos' };
    }
    try {
        const { data: existentes, error: fetchError } = await window.supabaseClient
            .from('produto_skus_kit')
            .select('sku_filho, quantidade')
            .eq('sku_pai', skuPai);
        
        if (fetchError) throw fetchError;
        
        const skusExistentes = existentes.map(item => item.sku_filho);
        const skusNovos = skusFilhos.map(item => item.sku_filho);
        const skusParaRemover = skusExistentes.filter(sku => !skusNovos.includes(sku));
        
        for (const sku of skusParaRemover) {
            const { error: delError } = await window.supabaseClient
                .from('produto_skus_kit')
                .delete()
                .eq('sku_pai', skuPai)
                .eq('sku_filho', sku);
            if (delError) throw delError;
        }
        
        for (const item of skusFilhos) {
            if (!item.sku_filho) continue;
            const { error: upsertError } = await window.supabaseClient
                .from('produto_skus_kit')
                .upsert({
                    sku_pai: skuPai,
                    sku_filho: item.sku_filho,
                    quantidade: item.quantidade || 1
                }, { onConflict: 'sku_pai, sku_filho' });
            if (upsertError) throw upsertError;
        }
        
        return { success: true };
    } catch (error) {
        console.error('Erro ao salvar SKUs do kit:', error);
        return { success: false, error: error.message };
    }
}

async function excluirSkusKit(skuPai) {
    if (!skuPai || !window.supabaseClient) return { success: false, error: 'Dados inválidos' };
    try {
        const { error } = await window.supabaseClient
            .from('produto_skus_kit')
            .delete()
            .eq('sku_pai', skuPai);
        if (error) throw error;
        return { success: true };
    } catch (error) {
        console.error('Erro ao excluir SKUs do kit:', error);
        return { success: false, error: error.message };
    }
}

function calcularKitsDisponiveis(skusFilhos, produtosEstoque, skuAnuncio = null) {
    if (!skusFilhos || skusFilhos.length === 0) return 0;
    
    // 🔥 Extrair quantidade por kit do SKU do anúncio
    let quantidadePorKit = 1;
    if (skuAnuncio) {
        quantidadePorKit = extrairUnidadesPorKit(skuAnuncio);
        console.log(`📊 Quantidade por kit para cálculo: ${quantidadePorKit}`);
    }
    
    let kitsPossiveis = Infinity;
    
    for (const item of skusFilhos) {
        // Buscar o produto filho no estoque pelo SKU
        const produto = produtosEstoque.find(p => p.sku === item.sku_filho);
        if (!produto) {
            console.log(`⚠️ SKU filho não encontrado: ${item.sku_filho}`);
            return 0;
        }
        
        // 🔥 Cada item do kit pode ter uma quantidade específica (ex: 2 parafusos por kit)
        const quantidadeNecessaria = item.quantidade || 1;
        const kitsDoProduto = Math.floor(produto.quantidade / (quantidadeNecessaria * quantidadePorKit));
        console.log(`📊 ${item.sku_filho}: tem ${produto.quantidade}, precisa ${quantidadeNecessaria} por kit → ${kitsDoProduto} kits`);
        kitsPossiveis = Math.min(kitsPossiveis, kitsDoProduto);
    }
    
    console.log(`📊 Total de kits completos possíveis: ${kitsPossiveis}`);
    return kitsPossiveis === Infinity ? 0 : kitsPossiveis;
}

function extrairUnidadesPorKit(skuAnuncio) {
    if (!skuAnuncio || typeof skuAnuncio !== 'string') return 1;
    skuAnuncio = skuAnuncio.trim();
    
    console.log(`📊 [extrairUnidadesPorKit] Analisando SKU: "${skuAnuncio}"`);
    
    // 🔥 Caso 1: SKU com ponto - pegar o primeiro prefixo
    if (skuAnuncio.includes('.')) {
        const partes = skuAnuncio.split('.');
        console.log(`📊 SKU com ponto, partes: ${partes.length}`);
        
        let totalQuantidade = 0;
        for (const parte of partes) {
            const match = parte.match(/^(\d{3})/);
            if (match) {
                const valor = parseInt(match[1], 10);
                if (valor > 0) {
                    totalQuantidade += valor;
                    console.log(`📊 Parte "${parte}" → quantidade: ${valor}`);
                }
            }
        }
        if (totalQuantidade > 0) {
            console.log(`📊 Total quantidade por kit: ${totalQuantidade}`);
            return totalQuantidade;
        }
    }
    
    // 🔥 Caso 2: SKU sem ponto, mas com prefixo de 3 dígitos
    const match = skuAnuncio.match(/^(\d{3})/);
    if (match) {
        const valor = parseInt(match[1], 10);
        if (valor > 0 && valor < 1000) {
            console.log(`📊 Prefixo encontrado: ${valor}`);
            return valor;
        }
    }
    
    console.log(`📊 Nenhum prefixo encontrado, usando 1`);
    return 1;
}

function configurarBulkModeEvents() {
    const toggleBtn = document.getElementById('toggleBulkModeBtn');
    const panel = document.getElementById('bulkModePanel');
    const addRowBtn = document.getElementById('addBulkRowBtn');
    const tbody = document.getElementById('bulkTamanhosBody');
    const simpleTamanho = document.getElementById('campo_tamanhoraio');
    const simpleQuantidade = document.getElementById('produtoQuantidade');
    const mainSkuField = document.getElementById('produtoSKU');
    const mainSkuContainer = mainSkuField?.closest('.form-group');
    const mlbField = document.getElementById('campo_mlb_codes');

    if (!toggleBtn || !panel) return;

    // Remove eventos antigos clonando
    const newToggle = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);

    function adicionarNovaLinha() {
        const novaLinha = document.createElement('tr');
        novaLinha.innerHTML = `
            <td><input type="number" class="form-control form-control-sm bulk-tamanho" placeholder="ex: 284" step="1" min="1"></td>
            <td><input type="text" class="form-control form-control-sm bulk-sku" placeholder="SKU"></td>
            <td><input type="number" class="form-control form-control-sm bulk-quantidade" value="0" min="0" step="1"></td>
            <td><button type="button" class="btn btn-sm btn-danger remove-bulk-row"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(novaLinha);
        attachRemoveEvent(novaLinha);
    }

    if (addRowBtn) {
        const newAddRow = addRowBtn.cloneNode(true);
        addRowBtn.parentNode.replaceChild(newAddRow, addRowBtn);
        newAddRow.onclick = adicionarNovaLinha;
    }

    newToggle.onclick = () => {
        const isActive = panel.style.display !== 'none';
        if (!isActive) {
            // Ativar bulk mode
            panel.style.display = 'block';
            newToggle.innerHTML = '<i class="fas fa-times-circle"></i> Desativar modo múltiplo';
            
            // Ocultar campos individuais
            if (simpleTamanho) {
                const parent = simpleTamanho.closest('.campo-dinamico');
                if (parent) parent.style.display = 'none';
            }
            if (simpleQuantidade) {
                const parent = simpleQuantidade.closest('.form-group');
                if (parent) parent.style.display = 'none';
            }
            if (mainSkuContainer) {
                mainSkuContainer.style.display = 'none';
                if (mainSkuField) mainSkuField.required = false;
            }
            
            // Mostrar aviso sobre MLB codes
            if (mlbField) {
                const helpText = mlbField.closest('.form-group')?.querySelector('small');
                if (helpText) {
                    helpText.innerHTML = '<i class="fas fa-info-circle"></i> Os MLB codes serão aplicados a TODOS os produtos criados em massa.';
                    helpText.style.color = '#6f42c1';
                    helpText.style.fontWeight = '500';
                }
            }
            
            // Adicionar primeira linha se vazio
            if (tbody.children.length === 0) adicionarNovaLinha();
        } else {
            // Desativar bulk mode
            panel.style.display = 'none';
            newToggle.innerHTML = '<i class="fas fa-plus-circle"></i> Ativar modo múltiplo';
            
            // Reexibir campos individuais
            if (simpleTamanho) {
                const parent = simpleTamanho.closest('.campo-dinamico');
                if (parent) parent.style.display = '';
            }
            if (simpleQuantidade) {
                const parent = simpleQuantidade.closest('.form-group');
                if (parent) parent.style.display = '';
            }
            if (mainSkuContainer) {
                mainSkuContainer.style.display = '';
                const isEditing = document.getElementById('produtoId').value !== '';
                if (!isEditing && mainSkuField) mainSkuField.required = true;
            }
            
            // Restaurar ajuda do MLB
            if (mlbField) {
                const helpText = mlbField.closest('.form-group')?.querySelector('small');
                if (helpText) {
                    helpText.innerHTML = '<i class="fas fa-info-circle"></i> MLB separados por vírgula (ex: MLB123, MLB456)';
                    helpText.style.color = '';
                    helpText.style.fontWeight = '';
                }
            }
        }
    };

    function attachRemoveEvent(row) {
        const removeBtn = row.querySelector('.remove-bulk-row');
        if (removeBtn) {
            removeBtn.onclick = () => {
                if (tbody.children.length > 1) row.remove();
                else showToast('Mantenha pelo menos uma linha', 'warning');
            };
        }
    }
    document.querySelectorAll('#bulkTamanhosBody tr').forEach(row => attachRemoveEvent(row));
}

// =========================================================
// SINCRONIZAR ESTOQUE COM MERCADO LIVRE - VERSÃO CORRIGIDA
// =========================================================

async function sincronizarEstoqueML(produto) {
    console.log('🚀 [sincronizarEstoqueML] INICIANDO para produto:', produto.sku);
    
    let mlbCodes = produto.dados_extra?.mlb_codes;
    if (!mlbCodes || (Array.isArray(mlbCodes) && mlbCodes.length === 0)) {
        console.log('ℹ️ Produto sem MLB cadastrado.');
        return { success: true, results: [] };
    }
    let codigos = Array.isArray(mlbCodes) ? mlbCodes : mlbCodes.split(',').map(s => s.trim()).filter(c => c);
    if (codigos.length === 0) return { success: true, results: [] };

    let token = localStorage.getItem('ml_access_token');
    if (!token) {
        showToast('❌ Token ML não encontrado.', 'error');
        return { success: false, error: 'Token não disponível' };
    }

    const WORKER_URL = window.WORKER_URL || 'https://purple-bonus-3b1c.andmiotto1998.workers.dev';
    const results = [];
    const quantidadeReal = produto.quantidade;
    const skuProduto = produto.sku;
    const categoria = produto.categoria;
    const marcaProduto = produto.dados_extra?.marca || '';
    const modeloProduto = produto.dados_extra?.modelo || '';

    // ===== FUNÇÃO PARA EXTRAIR OS 8 CARACTERES PRINCIPAIS DO SKU =====
    function extrairSkuBase(sku) {
        if (!sku) return '';
        
        let skuLimpo = sku.trim();
        
        // Remove os 3 primeiros dígitos (prefixo de quantidade do ML)
        let skuReal = skuLimpo;
        const match = skuLimpo.match(/^\d{3}(.+)$/);
        if (match) {
            skuReal = match[1];
        }
        
        // Retorna os 8 primeiros caracteres
        return skuReal.substring(0, 8).toUpperCase();
    }

    // =========================================================
// FUNÇÃO PARA EXTRAIR SKU DA VARIAÇÃO
// =========================================================
function extrairSkuDaVariacao(variacao) {
    if (variacao.seller_custom_field) return variacao.seller_custom_field;
    if (variacao.attributes && Array.isArray(variacao.attributes)) {
        const skuAttr = variacao.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
    if (variacao.sku) return variacao.sku;
    return null;
}

// FUNÇÃO PARA EXTRAIR SKU DO ITEM
// =========================================================
function extrairSkuDoItem(item) {
    if (item.seller_custom_field) return item.seller_custom_field;
    if (item.attributes && Array.isArray(item.attributes)) {
        const skuAttr = item.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
    if (item.sku) return item.sku;
    return null;
}

    // =========================================================
// FUNÇÃO ENCONTRAR VARIAÇÃO POR SKU - VERSÃO CORRIGIDA
// =========================================================
function encontrarVariacaoPorSKU(item, skuProduto) {
    if (!item.variations || item.variations.length === 0) return null;
    
    // 🔥 USA extrairSkuBaseSistema (NÃO REMOVE NADA)
    const skuBase = extrairSkuBaseSistema(skuProduto);
    if (!skuBase) return null;
    
    console.log(`🔍 Buscando variação com base: "${skuBase}"`);
    
    for (const v of item.variations) {
        let identificador = extrairSkuDaVariacao(v);
        if (identificador) {
            // 🔥 USA extrairSkuBaseAnuncio (REMOVE 3 DÍGITOS)
            const variacaoBase = extrairSkuBaseAnuncio(identificador);
            console.log(`   Comparando: "${variacaoBase}" vs "${skuBase}"`);
            if (variacaoBase === skuBase) {
                console.log(`✅ Variação encontrada: ${identificador}`);
                return v;
            }
        }
    }
    
    // Fallback: busca por SKU exato (comparação direta)
    const skuExato = skuProduto ? skuProduto.trim().toUpperCase() : '';
    if (skuExato) {
        for (const v of item.variations) {
            let identificador = extrairSkuDaVariacao(v);
            if (identificador && identificador.toUpperCase() === skuExato) {
                console.log(`✅ Variação encontrada por SKU exato: ${identificador}`);
                return v;
            }
        }
    }
    
    console.log(`⚠️ Nenhuma variação encontrada para base: "${skuBase}"`);
    return null;
}

    // ===== OBTER SKU DO ANÚNCIO =====
    function obterSkuAnuncio(item, skuProduto) {
        let skuAnuncio = null;
        
        if (item.variations && item.variations.length > 0) {
            const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
            if (variacaoAlvo) {
                skuAnuncio = extrairSkuDaVariacao(variacaoAlvo);
            } else {
                for (const v of item.variations) {
                    const testSku = extrairSkuDaVariacao(v);
                    if (testSku && testSku.match(/\d/)) {
                        skuAnuncio = testSku;
                        break;
                    }
                }
            }
        } else {
            skuAnuncio = extrairSkuDoItem(item);
        }
        
        return skuAnuncio;
    }

// =========================================================
// FUNÇÃO PARA EXTRAIR BASE DO SKU DO SISTEMA (NÃO REMOVE NADA)
// =========================================================
function extrairSkuBaseSistema(sku) {
    if (!sku) return '';
    // 🔥 NÃO REMOVE NADA, SÓ PEGA OS 8 PRIMEIROS CARACTERES
    const base = sku.trim().substring(0, 8).toUpperCase();
    console.log(`📊 [SISTEMA] SKU: "${sku}" → Base: "${base}"`);
    return base;
}

// =========================================================
// FUNÇÃO PARA EXTRAIR BASE DO SKU DO ANÚNCIO (REMOVE 3 DÍGITOS)
// =========================================================
function extrairSkuBaseAnuncio(sku) {
    if (!sku) return '';
    
    let skuLimpo = sku.trim();
    let skuReal = skuLimpo;
    
    // 🔥 REMOVE APENAS OS 3 PRIMEIROS DÍGITOS (prefixo de quantidade do ML)
    const match = skuLimpo.match(/^\d{3}(.+)$/);
    if (match) {
        skuReal = match[1];
        console.log(`📊 [ANÚNCIO] SKU: "${skuLimpo}" → remove 3 dígitos → "${skuReal}"`);
    } else {
        console.log(`📊 [ANÚNCIO] SKU sem prefixo: "${skuLimpo}"`);
    }
    
    // 🔥 EXTRAI OS 8 PRIMEIROS CARACTERES
    const base = skuReal.substring(0, 8).toUpperCase();
    console.log(`📊 [ANÚNCIO] Base: "${base}"`);
    return base;
}

// =========================================================
// FUNÇÃO CALCULAR QUANTIDADE COM REGRAS - VERSÃO CORRIGIDA
// =========================================================
function calcularQuantidadeComRegras(quantidadeBase, categoria, item, skuProduto, marcaProduto, modeloProduto, produto, skusFilhos, skuAnuncio) {
    console.log(`📊 [calcularQuantidadeComRegras] SKU: ${skuProduto}, Estoque: ${quantidadeBase}, Categoria: ${categoria}`);
    console.log(`📊 SKU do anúncio: ${skuAnuncio}`);
    
    // 🔥 USA extrairSkuBaseSistema (NÃO REMOVE NADA)
    const skuBaseSistema = extrairSkuBaseSistema(skuProduto);
    console.log(`📊 Base do SKU do sistema (8 caracteres): "${skuBaseSistema}"`);
    
    let quantidadeFinal = 0;
    
    // 🔥 VERIFICA SE É KIT PELO SKU DO ANÚNCIO (tem ponto)
    const ehKit = skuAnuncio && skuAnuncio.includes('.');
    console.log(`📊 É um KIT? ${ehKit ? '✅ SIM' : '❌ NÃO'}`);
    
    // 🔥 SE FOR KIT (tem ponto no SKU do anúncio)
    if (ehKit) {
        console.log(`📊 PROCESSANDO COMO KIT...`);
        
        const skusDoKit = skuAnuncio.split('.');
        console.log(`📊 SKUs do kit:`, skusDoKit);
        
        let kitsPossiveis = Infinity;
        const quantidadesPorKit = [];
        
        for (const skuComPrefixo of skusDoKit) {
            // 🔥 REMOVE 3 DÍGITOS DO SKU DO ANÚNCIO
            let skuReal = skuComPrefixo;
            let prefixo = 1;
            
            const match = skuComPrefixo.match(/^(\d{3})(.+)$/);
            if (match) {
                prefixo = parseInt(match[1]) || 1;
                skuReal = match[2];
                console.log(`📊 Produto: "${skuComPrefixo}" → Prefixo: ${prefixo}, SKU Real: "${skuReal}"`);
            } else {
                console.log(`📊 Produto sem prefixo: "${skuComPrefixo}"`);
                skuReal = skuComPrefixo;
            }
            
            // 🔥 USA extrairSkuBaseAnuncio (REMOVE 3 DÍGITOS) - MAS O SKU JÁ FOI LIMPO
            // Usamos extrairSkuBaseSistema porque já removemos o prefixo
            const skuBaseReal = extrairSkuBaseSistema(skuReal);
            console.log(`📊 Base do SKU real (8 caracteres): "${skuBaseReal}"`);
            
            // 🔥 COMPARA PELA BASE DE 8 CARACTERES
            let produtoEstoque = null;
            if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
                produtoEstoque = produtosEstoque.find(p => {
                    const baseSistema = extrairSkuBaseSistema(p.sku);
                    return baseSistema === skuBaseReal;
                });
            }
            
            if (!produtoEstoque) {
                console.log(`❌ Produto não encontrado no estoque: ${skuReal} (base: ${skuBaseReal})`);
                // Tenta buscar pelo SKU completo
                if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
                    const fallback = produtosEstoque.find(p => p.sku === skuReal);
                    if (fallback) {
                        console.log(`✅ Produto encontrado por SKU completo: ${fallback.sku}`);
                        const kitsDoProduto = Math.floor(fallback.quantidade / prefixo);
                        quantidadesPorKit.push({
                            sku: fallback.sku,
                            estoque: fallback.quantidade,
                            prefixo: prefixo,
                            kits: kitsDoProduto
                        });
                        if (kitsDoProduto < kitsPossiveis) {
                            kitsPossiveis = kitsDoProduto;
                        }
                        continue;
                    }
                }
                return 0;
            }
            
            console.log(`📊 ${skuReal} → ${produtoEstoque.sku} tem ${produtoEstoque.quantidade} unidades em estoque`);
            
            const kitsDoProduto = Math.floor(produtoEstoque.quantidade / prefixo);
            console.log(`📊 ${produtoEstoque.sku} → ${produtoEstoque.quantidade} / ${prefixo} = ${kitsDoProduto} kits`);
            
            quantidadesPorKit.push({
                sku: produtoEstoque.sku,
                estoque: produtoEstoque.quantidade,
                prefixo: prefixo,
                kits: kitsDoProduto
            });
            
            if (kitsDoProduto < kitsPossiveis) {
                kitsPossiveis = kitsDoProduto;
            }
        }
        
        console.log(`📊 Total de kits completos possíveis: ${kitsPossiveis}`);
        quantidadeFinal = kitsPossiveis;
        
        console.log(`📊 RESUMO DO KIT:`);
        quantidadesPorKit.forEach(q => {
            console.log(`  - ${q.sku}: ${q.estoque} uni. → ${q.prefixo} por kit → ${q.kits} kits`);
        });
        console.log(`  📦 Total de kits completos: ${quantidadeFinal}`);
    } 
    // 🔥 PRODUTO NORMAL (sem ponto no SKU)
    else {
        console.log(`📊 PRODUTO NORMAL (não é kit)`);
        
        // 🔥 REMOVE 3 DÍGITOS DO SKU DO ANÚNCIO
        let skuReal = skuAnuncio || skuProduto;
        let prefixo = 1;
        
        const match = skuAnuncio ? skuAnuncio.match(/^(\d{3})(.+)$/) : null;
        if (match) {
            prefixo = parseInt(match[1]) || 1;
            skuReal = match[2];
            console.log(`📊 SKU com prefixo: Prefixo: ${prefixo}, SKU Real: ${skuReal}`);
        } else {
            console.log(`📊 Sem prefixo, usando SKU original: ${skuReal}`);
        }
        
        // 🔥 USA extrairSkuBaseSistema (NÃO REMOVE NADA) - porque já removemos o prefixo
        const skuBaseReal = extrairSkuBaseSistema(skuReal);
        console.log(`📊 Base do SKU real (8 caracteres): "${skuBaseReal}"`);
        
        // 🔥 COMPARA PELA BASE DE 8 CARACTERES
        let produtoEstoque = null;
        if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
            produtoEstoque = produtosEstoque.find(p => {
                const baseSistema = extrairSkuBaseSistema(p.sku);
                return baseSistema === skuBaseReal;
            });
        }
        
        if (produtoEstoque) {
            const quantidadeCalculada = Math.floor(produtoEstoque.quantidade / prefixo);
            console.log(`📊 ${produtoEstoque.sku} → ${produtoEstoque.quantidade} / ${prefixo} = ${quantidadeCalculada}`);
            quantidadeFinal = quantidadeCalculada;
        } else {
            // Tenta buscar pelo SKU completo
            if (typeof produtosEstoque !== 'undefined' && Array.isArray(produtosEstoque)) {
                const fallback = produtosEstoque.find(p => p.sku === skuReal);
                if (fallback) {
                    console.log(`✅ Produto encontrado por SKU completo: ${fallback.sku}`);
                    const quantidadeCalculada = Math.floor(fallback.quantidade / prefixo);
                    quantidadeFinal = quantidadeCalculada;
                } else {
                    console.log(`⚠️ Produto não encontrado: ${skuReal} (base: ${skuBaseReal})`);
                    quantidadeFinal = 0;
                }
            } else {
                console.log(`⚠️ Produto não encontrado: ${skuReal} (base: ${skuBaseReal})`);
                quantidadeFinal = 0;
            }
        }
    }
    
    // ===== OBTER PREÇO DO ANÚNCIO =====
    let precoAnuncio = 0;
    if (item.variations && item.variations.length > 0) {
        const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
        if (variacaoAlvo) {
            precoAnuncio = variacaoAlvo.price || 0;
        } else {
            precoAnuncio = item.variations[0]?.price || item.price || 0;
        }
    } else {
        precoAnuncio = item.price || 0;
    }
    console.log(`📊 Preço do anúncio: R$ ${precoAnuncio}`);
    
    // ===== CALCULAR ESTOQUE MÁXIMO PERMITIDO PELA REGRA DA CATEGORIA =====
    const estoqueMaximo = calcularEstoqueMaximo({ 
        preco: precoAnuncio, 
        categoria: categoria,
        sku: skuProduto
    });
    console.log(`📊 Estoque máximo permitido (regra do modal): ${estoqueMaximo}`);
    
    // ===== APLICAR LIMITE MÁXIMO =====
    if (quantidadeFinal > estoqueMaximo) {
        console.log(`📊 Aplicando limite do modal: ${quantidadeFinal} → ${estoqueMaximo}`);
        quantidadeFinal = estoqueMaximo;
    }
    
    // ===== REGRA ESPECÍFICA PARA RAIOS =====
    if (categoria === 'Raios') {
        const regra = obterRegraRaios(marcaProduto, modeloProduto);
        if (regra && regra.max_kits !== undefined) {
            console.log(`📊 Aplicando regra de Raios: ${quantidadeFinal} → ${regra.max_kits}`);
            quantidadeFinal = Math.min(quantidadeFinal, regra.max_kits);
        }
    }
    
    // ===== GARANTIR QUE RESPEITA O ESTOQUE MÁXIMO =====
    if (quantidadeFinal > estoqueMaximo) {
        console.log(`📊 Reforçando limite: ${quantidadeFinal} → ${estoqueMaximo}`);
        quantidadeFinal = estoqueMaximo;
    }
    
    // ===== GARANTIR QUE NUNCA SEJA NEGATIVO =====
    quantidadeFinal = Math.max(0, quantidadeFinal);
    
    console.log(`✅ Quantidade final: ${quantidadeFinal}`);
    return quantidadeFinal;
}

    // ===== ATUALIZAR ESTOQUE FULL COM CONVIVÊNCIA =====
    async function atualizarEstoqueFullConvivio(itemId, userProductId, quantidade, token, workerUrl, item) {
        try {
            console.log(`📦 [FULL] Atualizando estoque do item ${itemId} para ${quantidade} unidades`);
            
            if (!userProductId) {
                console.warn('⚠️ userProductId vazio, tentando obter do item...');
                if (item && item.user_product_id) {
                    userProductId = item.user_product_id;
                } else {
                    return { success: false, error: 'user_product_id não disponível' };
                }
            }
            
            // Método 1: /items/{item_id}/stock
            try {
                const stockUrl = `https://api.mercadolibre.com/items/${itemId}/stock`;
                const stockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(stockUrl)}&token=${encodeURIComponent(token)}`;
                
                const getStockRes = await fetch(stockProxy);
                if (getStockRes.ok) {
                    const stockData = await getStockRes.json();
                    const requestBody = { available_quantity: quantidade };
                    
                    const updateRes = await fetch(stockProxy, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    if (updateRes.status === 200 || updateRes.status === 204) {
                        console.log(`✅ [FULL] Estoque atualizado para ${quantidade} (${itemId}) via /items/stock`);
                        return { success: true, method: 'items_stock' };
                    }
                }
            } catch (e) {
                console.warn('⚠️ Método /items/stock falhou:', e.message);
            }
            
            // Método 2: /user-products/{userProductId}/stock
            try {
                const userStockUrl = `https://api.mercadolibre.com/user-products/${userProductId}/stock`;
                const userStockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(userStockUrl)}&token=${encodeURIComponent(token)}`;
                
                const getUserStockRes = await fetch(userStockProxy);
                if (getUserStockRes.ok) {
                    const stockData = await getUserStockRes.json();
                    const locations = stockData.locations || [];
                    const updatedLocations = locations.map(loc => {
                        if (loc.type === 'seller_warehouse' || loc.type === 'selling_address') {
                            return { ...loc, quantity: quantidade };
                        }
                        return loc;
                    });
                    
                    const requestBody = { locations: updatedLocations };
                    
                    const updateRes = await fetch(userStockProxy, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    if (updateRes.status === 200 || updateRes.status === 204) {
                        console.log(`✅ [FULL] Estoque atualizado via user-products para ${quantidade}`);
                        return { success: true, method: 'user_products_stock' };
                    }
                }
            } catch (e) {
                console.warn('⚠️ Método /user-products/stock falhou:', e.message);
            }
            
            // Método 3: item principal
            try {
                const itemUrl = `https://api.mercadolibre.com/items/${itemId}`;
                const itemProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${encodeURIComponent(token)}`;
                
                const getItemRes = await fetch(itemProxy);
                if (!getItemRes.ok) {
                    return { success: false, error: `GET item ${getItemRes.status}` };
                }
                
                const itemData = await getItemRes.json();
                const xVersion = getItemRes.headers.get('x-version');
                
                const updateBody = { available_quantity: quantidade };
                const headers = { 'Content-Type': 'application/json' };
                if (xVersion) headers['x-version'] = xVersion;
                
                const putItemRes = await fetch(itemProxy, {
                    method: 'PUT',
                    headers: headers,
                    body: JSON.stringify(updateBody)
                });
                
                if (putItemRes.ok) {
                    console.log(`✅ [FULL] Item principal atualizado para ${quantidade}`);
                    return { success: true, method: 'item_principal' };
                } else {
                    const errorText = await putItemRes.text();
                    if (errorText.includes('not_modifiable') || errorText.includes('field_not_updatable')) {
                        return { 
                            success: false, 
                            error: 'FULL - atualize manualmente no ML',
                            tipo: 'full_puro'
                        };
                    }
                    return { success: false, error: `item ${putItemRes.status}` };
                }
            } catch (e) {
                console.warn('⚠️ Método item principal falhou:', e.message);
                return { success: false, error: e.message };
            }
            
        } catch (error) {
            console.error(`❌ [FULL] Erro:`, error);
            return { success: false, error: error.message };
        }
    }

    // ===== OBTER REGRA PARA RAIOS =====
    function obterRegraRaios(marca, modelo) {
        const regrasRaiosPorMarca = {
            "Sapim|Laser": { max_kits: 2 },
            "Sapim|Leader": { max_kits: 2 },
            "Sapim|Cx-Ray": { max_kits: 10 },
            "Sapim|Race": { max_kits: 10 },
            "Pillar|Butted 1.8 Preto": { max_kits: 2 },
            "Pillar|Butted 1.8 Vermelho": { max_kits: 2 },
            "Pillar|Butted 1.7": { max_kits: 2 },
            "Pillar|Butted 1.5": { max_kits: 2 },
            "Pillar|Trefilado 1.6": { max_kits: 2 },
            "Pillar|Achatado": { max_kits: 10 },
            "Pillar|Reforçado 2.0": { max_kits: 10 },
            "Dt Swiss|Aero": { max_kits: 2 },
            "Dt Swiss|Champion Preto": { max_kits: 10 },
            "Dt Swiss|Champion Prata": { max_kits: 2 },
            "Dt Swiss|Competition": { max_kits: 10 },
            "Dt Swiss|Revolution": { max_kits: 10 },
            "Dt Swiss|Competition Especial": { max_kits: 2 },
            "Dt Swiss|Aero Comp": { max_kits: 2 },
            "Mavic": { max_kits: 10 },
            "Richman": { max_kits: 2 },
            "Green": { max_kits: 2 },
            "Crank Brothers": { max_kits: 2 },
            "VeloForce": { max_kits: 10 },
            "Zincado": { max_kits: 2 },
            "Titânio": { max_kits: 2 },
            "T-Head": { max_kits: 10 }
        };
        
        const chaveExata = `${marca}|${modelo}`;
        if (regrasRaiosPorMarca[chaveExata]) return regrasRaiosPorMarca[chaveExata];
        if (regrasRaiosPorMarca[marca]) return regrasRaiosPorMarca[marca];
        return null;
    }

    // =========================================================
    // INÍCIO DO LOOP PRINCIPAL
    // =========================================================

    for (const codigo of codigos) {
        const itemId = codigo.startsWith('MLB') ? codigo : `MLB${codigo}`;
        const apiUrl = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;

        try {
            console.log(`\n🔍 Obtendo ${itemId}...`);
            const getRes = await fetch(proxyUrl);
            if (!getRes.ok) throw new Error(`GET falhou: ${getRes.status}`);
            const item = await getRes.json();

            // Buscar detalhes das variações
            if (item.variations && item.variations.length > 0) {
                console.log(`📦 Buscando detalhes de ${item.variations.length} variações...`);
                for (let i = 0; i < item.variations.length; i++) {
                    const v = item.variations[i];
                    try {
                        const variationUrl = `https://api.mercadolibre.com/items/${item.id}/variations/${v.id}?include_attributes=all`;
                        const varProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(variationUrl)}&token=${encodeURIComponent(token)}`;
                        const varRes = await fetch(varProxy);
                        if (varRes.ok) {
                            const varDetails = await varRes.json();
                            item.variations[i] = {
                                ...v,
                                seller_custom_field: varDetails.seller_custom_field || v.seller_custom_field,
                                attributes: varDetails.attributes || v.attributes,
                                attribute_combinations: varDetails.attribute_combinations || v.attribute_combinations,
                                price: varDetails.price || v.price,
                                user_product_id: varDetails.user_product_id || v.user_product_id
                            };
                            const skuExtraido = extrairSkuDaVariacao(item.variations[i]);
                            if (skuExtraido) console.log(`   Variação ${v.id}: SKU = ${skuExtraido}, Preço = ${item.variations[i].price}`);
                        } else {
                            console.warn(`   ⚠️ Não foi possível obter detalhes da variação ${v.id}`);
                        }
                    } catch (err) {
                        console.warn(`   ⚠️ Erro ao buscar variação ${v.id}:`, err);
                    }
                    await new Promise(r => setTimeout(r, 100));
                }
            }

            const isFulfillment = item.shipping?.logistic_type === 'fulfillment' || 
                                  item.logistic_type === 'fulfillment' ||
                                  item.tags?.includes('fulfillment');

            const hasSelfService = item.tags?.includes('self_service_in') || 
                                   item.shipping?.tags?.includes('self_service_in');

            console.log(`📦 Item ${itemId}: isFulfillment=${isFulfillment}, hasSelfService=${hasSelfService}`);

            const skuAnuncio = obterSkuAnuncio(item, skuProduto);
            const skusFilhos = await carregarSkusKit(skuProduto);
            const isKitPai = skusFilhos && skusFilhos.length > 0;

            if (isKitPai) {
                console.log(`📦 Produto ${skuProduto} é um KIT pai com ${skusFilhos.length} SKUs filhos`);
            }

            // ===== FULL COM CONVIVÊNCIA =====
            if (isFulfillment && hasSelfService) {
                console.log(`📦 Item ${itemId} é FULL com CONVIVÊNCIA (Full+Flex)`);
                
                let userProductId = null;
                
                // Tenta extrair user_product_id
                if (item.variations && item.variations.length > 0) {
                    const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
                    if (variacaoAlvo && variacaoAlvo.user_product_id) {
                        userProductId = variacaoAlvo.user_product_id;
                    }
                    if (!userProductId) {
                        for (const v of item.variations) {
                            if (v.user_product_id) {
                                userProductId = v.user_product_id;
                                break;
                            }
                        }
                    }
                } else {
                    userProductId = item.user_product_id;
                }
                
                if (!userProductId) {
                    console.warn(`⚠️ user_product_id não encontrado para ${itemId}. Pulando.`);
                    results.push({ codigo: itemId, success: false, reason: 'sem_user_product_id' });
                    continue;
                }

                let quantidadeParaEnviar = calcularQuantidadeComRegras(
                    quantidadeReal, categoria, item, skuProduto, 
                    marcaProduto, modeloProduto, produto, skusFilhos,
                    skuAnuncio
                );

                console.log(`📊 [FULL] Quantidade a ser enviada: ${quantidadeParaEnviar}`);

                const resultado = await atualizarEstoqueFullConvivio(
                    itemId, userProductId, quantidadeParaEnviar, token, WORKER_URL, item
                );

                if (resultado.success) {
                    results.push({ 
                        codigo: itemId, 
                        success: true, 
                        method: resultado.method || 'full_convivio' 
                    });
                } else {
                    results.push({ 
                        codigo: itemId, 
                        success: false, 
                        error: resultado.error,
                        tipo: resultado.tipo || 'full_convivio',
                        link: `https://www.mercadolivre.com.br/anuncios/${itemId}/modificar/`,
                        estoque: quantidadeParaEnviar,
                        nome: produto.nome || 'Produto'
                    });
                }
                continue;
            }

            // ===== FULL PURO =====
            if (isFulfillment && !hasSelfService) {
                console.log(`📦 Item ${itemId} é FULL PURO (sem convivência)`);
                const skuAnuncioLocal = obterSkuAnuncio(item, skuProduto);
                
                results.push({ 
                    codigo: itemId, 
                    success: false, 
                    error: 'FULL puro - atualize manualmente no ML',
                    tipo: 'full_puro',
                    ignorado: true,
                    sku: skuAnuncioLocal,
                    link: `https://www.mercadolivre.com.br/item/${itemId}`,
                    estoque: quantidadeReal,
                    nome: produto.nome || 'Produto'
                });
                continue;
            }

            // ===== ITEM NORMAL =====
            console.log(`📦 Item ${itemId} é NORMAL (não é FULL).`);

            if (item.tags?.includes('has_price_by_rule')) {
                console.warn(`⚠️ Item ${itemId} tem preço automático.`);
                results.push({ codigo: itemId, success: false, reason: 'oferta_ativa' });
                continue;
            }

            const skuAnuncioLocal = obterSkuAnuncio(item, skuProduto);

            let quantidadeParaEnviar = calcularQuantidadeComRegras(
                quantidadeReal, categoria, item, skuProduto, 
                marcaProduto, modeloProduto, produto, skusFilhos,
                skuAnuncioLocal
            );

            if (item.variations && item.variations.length > 0) {
                const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
                if (!variacaoAlvo) {
                    console.warn(`⚠️ Nenhuma variação para ${itemId}`);
                    results.push({ codigo: itemId, success: false, reason: 'sem_variacao' });
                    continue;
                }
                const varId = variacaoAlvo.id;
                const targetUrl = `https://api.mercadolibre.com/items/${itemId}/variations/${varId}`;
                const putProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(targetUrl)}&token=${encodeURIComponent(token)}`;
                console.log(`📦 Atualizando variação ${varId} para ${quantidadeParaEnviar}`);
                
                const putRes = await fetch(putProxy, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ available_quantity: quantidadeParaEnviar })
                });
                const responseText = await putRes.text();
                let respData;
                try { respData = JSON.parse(responseText); } catch(e) { respData = { raw: responseText }; }
                
                if (putRes.ok) {
                    let newQty = null;
                    if (Array.isArray(respData)) {
                        const updatedVar = respData.find(v => v.id == varId);
                        if (updatedVar) newQty = updatedVar.available_quantity;
                    } else {
                        newQty = respData.available_quantity;
                    }
                    if (newQty === quantidadeParaEnviar) {
                        console.log(`✅ Variação ${varId} atualizada para ${newQty}`);
                        results.push({ codigo: itemId, success: true, variation_id: varId });
                    } else {
                        console.warn(`⚠️ Estoque não mudou. Esperado: ${quantidadeParaEnviar}, Recebido: ${newQty}`);
                        results.push({ codigo: itemId, success: false, reason: 'estoque_ignorado', details: respData });
                    }
                } else {
                    console.error(`❌ Falha: ${putRes.status} - ${responseText}`);
                    results.push({ codigo: itemId, success: false, error: `HTTP ${putRes.status}` });
                }
            }
            else {
                console.log(`📦 Atualizando item principal para ${quantidadeParaEnviar}`);
                const putRes = await fetch(proxyUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ available_quantity: quantidadeParaEnviar })
                });
                const responseText = await putRes.text();
                let respData;
                try { respData = JSON.parse(responseText); } catch(e) { respData = { raw: responseText }; }
                if (putRes.ok && respData.available_quantity === quantidadeParaEnviar) {
                    console.log(`✅ Item ${itemId} atualizado`);
                    results.push({ codigo: itemId, success: true });
                } else {
                    console.warn(`⚠️ Falha item: ${putRes.status}`);
                    results.push({ codigo: itemId, success: false, reason: 'estoque_ignorado', details: respData });
                }
            }

        } catch (error) {
            console.error(`❌ Erro ${itemId}:`, error);
            results.push({ codigo: itemId, success: false, error: error.message });
        }
    }

    // ===== RESULTADOS FINAIS =====
    const sucessos = results.filter(r => r.success).length;
    const falhas = results.filter(r => !r.success).length;
    
    if (sucessos) showToast(`✅ ${sucessos} anúncio(s) sincronizado(s)`, 'success');
    if (falhas) showToast(`⚠️ ${falhas} anúncio(s) falharam. Verifique console.`, 'warning');

    const fullDetectadosLista = results.filter(r => {
        const isFull = r.tipo === 'full_puro' || 
                       (r.error && (r.error.includes('FULL') || r.error.includes('not_modifiable') || r.error.includes('field_not_updatable')));
        return isFull;
    });

    if (fullDetectadosLista.length > 0) {
        const fullItems = fullDetectadosLista.map(r => ({
            codigo: r.codigo || r.itemId,
            link: r.link || `https://www.mercadolivre.com.br/item/${r.codigo || r.itemId}`,
            erro: r.error || 'FULL - atualize manualmente',
            estoque: r.estoque || quantidadeReal,
            nome: r.nome || produto.nome || 'Produto'
        }));
        
        setTimeout(() => {
            if (typeof window.abrirModalFullDetectados === 'function') {
                window.abrirModalFullDetectados(fullItems);
            } else {
                alert(`🔴 ${fullItems.length} anúncio(s) FULL detectados!\nAtualize manualmente no Mercado Livre.\n\n${fullItems.map(i => `${i.codigo} - ${i.link}`).join('\n')}`);
            }
        }, 800);
    }

    return { success: falhas === 0, results };
}
// =========================================================
// MODAL PARA ANÚNCIOS FULL DETECTADOS - VERSÃO MELHORADA
// =========================================================

function abrirModalFullDetectados(anunciosFull) {
    console.log('🚀 [abrirModalFullDetectados] INICIANDO');
    console.log('📦 [abrirModalFullDetectados] Anúncios recebidos:', anunciosFull);
    
    if (!anunciosFull || anunciosFull.length === 0) {
        console.log('ℹ️ Nenhum anúncio FULL para exibir');
        return;
    }
    
    fullDetectados = anunciosFull || [];
    fullConfirmados = new Set();
    
    // Verifica se o modal já existe, se não, cria
    let modal = document.getElementById('modalFullDetectados');
    if (!modal) {
        console.log('📦 Criando modal FULL...');
        modal = document.createElement('div');
        modal.id = 'modalFullDetectados';
        modal.className = 'modal hidden';
        modal.style.cssText = 'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 99999;';
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 750px; width: 95%; max-height: 90vh; background: white; padding: 0; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;">
                <div style="background: linear-gradient(135deg, #6f42c1, #4B0082); color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0; font-size: 20px;">
                            <i class="fas fa-warehouse"></i> Anúncios FULL Detectados
                        </h3>
                        <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">
                            Os seguintes anúncios estão em FULL e precisam ser atualizados manualmente
                        </p>
                    </div>
                    <!-- Botão de fechar NÃO tem X - só fecha quando todos OK -->
                </div>
                
                <div style="padding: 20px; max-height: 55vh; overflow-y: auto;">
                    <div class="alert alert-warning" style="background: #fff3cd; padding: 12px 15px; border-radius: 6px; margin-bottom: 15px; border-left: 4px solid #ffc107;">
                        <i class="fas fa-exclamation-triangle" style="color: #856404;"></i>
                        <strong>Atenção:</strong> 
                        <br>1. Clique no link para abrir o anúncio no Mercado Livre
                        <br>2. Ajuste o estoque manualmente
                        <br>3. Volte e clique em <strong>"OK"</strong> para confirmar
                        <br><br>
                        <strong>⚠️ O modal só será fechado quando TODOS os anúncios forem confirmados.</strong>
                    </div>
                    
                    <div id="fullDetectadosLista">
                        <!-- Itens serão carregados dinamicamente -->
                    </div>
                    
                    <div style="margin-top: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                            <span style="font-size: 13px; color: #6c757d;">Progresso:</span>
                            <span id="fullProgressText" style="font-size: 13px; font-weight: 600; color: #6c757d;">0 de 0 confirmados</span>
                        </div>
                        <div class="progress" style="height: 10px; background: #e9ecef; border-radius: 5px; overflow: hidden;">
                            <div id="fullProgressBar" class="progress-bar" role="progressbar" style="width: 0%; height: 100%; background: #dc3545; transition: width 0.5s ease;"></div>
                        </div>
                    </div>
                </div>
                
                <div style="background: #f8f9fa; padding: 15px 25px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end; gap: 10px;">
                    <!-- NÃO TEM BOTÃO DE FECHAR -->
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        console.log('✅ Modal FULL criado');
    }
    
    // Preencher a lista
    const lista = document.getElementById('fullDetectadosLista');
    if (!lista) {
        console.error('❌ #fullDetectadosLista não encontrado');
        return;
    }
    
    let html = '';
    fullDetectados.forEach((item, index) => {
        const mlb = item.codigo || item.itemId || item.mlb || `MLB-${index}`;
        const link = item.link || `https://www.mercadolivre.com.br/item/${mlb}`;
        const estoque = item.estoque || item.quantidade || '?';
        const nome = item.nome || item.titulo || 'Produto';
        const erro = item.erro || item.error || 'FULL - atualize manualmente';
        
        // Abrir link em nova aba
        const linkHtml = link ? `<a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary mt-1" style="font-size: 11px; padding: 2px 10px;">
            <i class="fas fa-external-link-alt"></i> Abrir no ML
        </a>` : '';
        
        html += `
            <div class="list-group-item" id="full-item-${index}" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border: 1px solid #e9ecef; border-radius: 6px; margin-bottom: 8px; background: #fff; transition: all 0.3s;">
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 600; font-size: 14px; color: #495057;">
                        <i class="fas fa-tag" style="color: #6f42c1; font-size: 12px;"></i> ${mlb}
                    </div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 2px;">${nome}</div>
                    <div style="font-size: 12px; color: #6c757d; margin-top: 2px;">
                        <span class="badge badge-info" style="background: #17a2b8; color: white; font-size: 10px;">Estoque sugerido: ${estoque} un</span>
                    </div>
                    <div style="font-size: 11px; color: #dc3545; margin-top: 2px;">
                        <i class="fas fa-exclamation-circle"></i> ${erro}
                    </div>
                    ${linkHtml}
                </div>
                <div style="min-width: 80px; text-align: right; margin-left: 15px;">
                    <button class="btn btn-sm btn-success" onclick="confirmarFullDetectado(${index})" id="btn-confirm-${index}" style="font-size: 12px; padding: 4px 16px;">
                        <i class="fas fa-check"></i> OK
                    </button>
                    <span class="badge badge-success" id="badge-confirm-${index}" style="display: none; font-size: 12px; padding: 5px 12px; background: #28a745;">
                        ✅ Confirmado
                    </span>
                </div>
            </div>
        `;
    });
    
    lista.innerHTML = html;
    console.log('✅ Lista FULL renderizada');
    
    // Atualizar barra de progresso
    atualizarProgressoFull();
    
    // Mostrar o modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    console.log('✅ Modal FULL exibido');
}

// =========================================================
// CONFIRMAR FULL DETECTADO
// =========================================================

function confirmarFullDetectado(index) {
    console.log(`✅ [confirmarFullDetectado] Confirmando índice ${index}`);
    fullConfirmados.add(index);
    
    // Atualizar UI
    const btn = document.getElementById(`btn-confirm-${index}`);
    const badge = document.getElementById(`badge-confirm-${index}`);
    const item = document.getElementById(`full-item-${index}`);
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        setTimeout(() => {
            btn.style.display = 'none';
        }, 500);
    }
    if (badge) {
        badge.style.display = 'inline-block';
    }
    if (item) {
        item.style.backgroundColor = '#d4edda';
        item.style.borderLeft = '4px solid #28a745';
    }
    
    atualizarProgressoFull();
    
    // Verificar se todos foram confirmados
    if (fullConfirmados.size === fullDetectados.length && fullDetectados.length > 0) {
        console.log('✅ [confirmarFullDetectado] TODOS confirmados!');
        setTimeout(() => {
            showToast('✅ Todos os anúncios FULL foram confirmados!', 'success');
            setTimeout(() => {
                fecharModalFullDetectados();
            }, 1000);
        }, 500);
    }
}

// =========================================================
// ATUALIZAR PROGRESSO DO MODAL FULL
// =========================================================

function atualizarProgressoFull() {
    const total = fullDetectados.length;
    const confirmados = fullConfirmados.size;
    const porcentagem = total > 0 ? (confirmados / total) * 100 : 100;
    
    const barra = document.getElementById('fullProgressBar');
    const texto = document.getElementById('fullProgressText');
    
    if (barra) {
        barra.style.width = `${porcentagem}%`;
        if (porcentagem === 100) {
            barra.style.background = '#28a745';
        } else {
            barra.style.background = '#dc3545';
        }
    }
    if (texto) {
        texto.textContent = `${confirmados} de ${total} confirmados`;
        if (confirmados === total && total > 0) {
            texto.innerHTML = '<span style="color: #28a745;">✅ Todos confirmados!</span>';
        }
    }
}

// =========================================================
// FECHAR MODAL FULL DETECTADOS
// =========================================================

function fecharModalFullDetectados() {
    console.log('🔚 [fecharModalFullDetectados] Fechando modal...');
    const modal = document.getElementById('modalFullDetectados');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    fullDetectados = [];
    fullConfirmados = new Set();
}

async function atualizarEstoqueFullConvivio(itemId, userProductId, quantidade, token, workerUrl, item) {
    try {
        console.log(`📦 [FULL] Atualizando estoque do item ${itemId} para ${quantidade} unidades`);
        
        // 🔥 VERIFICA SE O USER_PRODUCT_ID É VÁLIDO
        if (!userProductId) {
            console.warn('⚠️ userProductId vazio, tentando obter do item...');
            if (item && item.user_product_id) {
                userProductId = item.user_product_id;
            } else {
                return { success: false, error: 'user_product_id não disponível' };
            }
        }
        
        // Método 1: /items/{item_id}/stock
        const stockUrl = `https://api.mercadolibre.com/items/${itemId}/stock`;
        const stockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(stockUrl)}&token=${encodeURIComponent(token)}`;
        
        try {
            const getStockRes = await fetch(stockProxy);
            if (getStockRes.ok) {
                const stockData = await getStockRes.json();
                const requestBody = { available_quantity: quantidade };
                
                const updateRes = await fetch(stockProxy, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                
                if (updateRes.status === 200 || updateRes.status === 204) {
                    console.log(`✅ [FULL] Estoque atualizado para ${quantidade} (${itemId}) via /items/stock`);
                    return { success: true, method: 'items_stock' };
                }
            }
        } catch (e) {
            console.warn('⚠️ Método /items/stock falhou:', e.message);
        }
        
        // Método 2: /user-products/{userProductId}/stock
        const userStockUrl = `https://api.mercadolibre.com/user-products/${userProductId}/stock`;
        const userStockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(userStockUrl)}&token=${encodeURIComponent(token)}`;
        
        try {
            const getUserStockRes = await fetch(userStockProxy);
            if (getUserStockRes.ok) {
                const stockData = await getUserStockRes.json();
                const locations = stockData.locations || [];
                const updatedLocations = locations.map(loc => {
                    if (loc.type === 'seller_warehouse' || loc.type === 'selling_address') {
                        return { ...loc, quantity: quantidade };
                    }
                    return loc;
                });
                
                const requestBody = { locations: updatedLocations };
                
                const updateRes = await fetch(userStockProxy, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                });
                
                if (updateRes.status === 200 || updateRes.status === 204) {
                    console.log(`✅ [FULL] Estoque atualizado via user-products para ${quantidade}`);
                    return { success: true, method: 'user_products_stock' };
                }
            }
        } catch (e) {
            console.warn('⚠️ Método /user-products/stock falhou:', e.message);
        }
        
        // Método 3: item principal com x-version
        const itemUrl = `https://api.mercadolibre.com/items/${itemId}`;
        const itemProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${encodeURIComponent(token)}`;
        
        try {
            const getItemRes = await fetch(itemProxy);
            if (!getItemRes.ok) {
                return { success: false, error: `GET item ${getItemRes.status}` };
            }
            
            const itemData = await getItemRes.json();
            const xVersion = getItemRes.headers.get('x-version');
            
            // 🔥 VERIFICA SE O ITEM TEM VARIATIONS
            if (itemData.variations && itemData.variations.length > 0) {
                // Tenta encontrar a variação correta
                const skuBase = extrairSkuBase(item.seller_custom_field || '');
                let variacaoEncontrada = null;
                
                for (const v of itemData.variations) {
                    const vSku = v.seller_custom_field || '';
                    const vBase = extrairSkuBase(vSku);
                    if (vBase === skuBase) {
                        variacaoEncontrada = v;
                        break;
                    }
                }
                
                if (variacaoEncontrada) {
                    const varUpdateUrl = `https://api.mercadolibre.com/items/${itemId}/variations/${variacaoEncontrada.id}`;
                    const varProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(varUpdateUrl)}&token=${encodeURIComponent(token)}`;
                    
                    const varUpdateRes = await fetch(varProxy, {
                        method: 'PUT',
                        headers: { 
                            'Content-Type': 'application/json',
                            ...(xVersion && { 'x-version': xVersion })
                        },
                        body: JSON.stringify({ available_quantity: quantidade })
                    });
                    
                    if (varUpdateRes.ok) {
                        console.log(`✅ [FULL] Variação ${variacaoEncontrada.id} atualizada para ${quantidade}`);
                        return { success: true, method: 'variation_update' };
                    }
                }
            }
            
            // Atualiza o item principal
            const updateBody = { available_quantity: quantidade };
            const headers = { 'Content-Type': 'application/json' };
            if (xVersion) headers['x-version'] = xVersion;
            
            const putItemRes = await fetch(itemProxy, {
                method: 'PUT',
                headers: headers,
                body: JSON.stringify(updateBody)
            });
            
            if (putItemRes.ok) {
                console.log(`✅ [FULL] Item principal atualizado para ${quantidade}`);
                return { success: true, method: 'item_principal' };
            } else {
                const errorText = await putItemRes.text();
                if (errorText.includes('not_modifiable') || errorText.includes('field_not_updatable')) {
                    return { 
                        success: false, 
                        error: 'FULL - atualize manualmente no ML',
                        tipo: 'full_puro'
                    };
                }
                return { success: false, error: `item ${putItemRes.status}` };
            }
        } catch (e) {
            console.warn('⚠️ Método item principal falhou:', e.message);
            return { success: false, error: e.message };
        }
        
    } catch (error) {
        console.error(`❌ [FULL] Erro:`, error);
        return { success: false, error: error.message };
    }
}

window.sincronizarProdutoML = async function(produtoId) {
    const produto = produtosEstoque.find(p => p.id == produtoId);
    if (!produto) {
        if (window.showToast) showToast('Produto não encontrado', 'error');
        return;
    }
    
    const syncBloqueado = produto.bloquear_sync_ml || produto.dados_extra?.bloquear_sync_ml || false;
    
    if (syncBloqueado) {
        showToast(`🔒 Sincronização com ML bloqueada para ${produto.nome}`, 'warning');
        return;
    }
    
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    const podeModificarSync = usuariosAutorizadosSync.includes(username) || isAdmin;
    
    if (!podeModificarSync) {
        showToast('⚠️ Apenas administradores podem sincronizar manualmente', 'warning');
        return;
    }
    
    if (window.showToast) showToast(`🔄 Sincronizando estoque (${produto.quantidade}) com ML...`, 'info');
    await sincronizarEstoqueML(produto);
};

// =========================================================
// FUNÇÕES AUXILIARES
// =========================================================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function editarProdutoEstoque(id) {
    const produto = produtosEstoque.find(p => p.id == id);
    if (produto) abrirModalProdutoEstoque(produto);
}

async function excluirProdutoEstoque(id) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        const { error } = await window.supabaseClient
            .from('produtos_estoque')
            .delete()
            .eq('id', id);
        if (error) throw error;
        if (window.showToast) showToast('Produto excluído', 'success');
        await carregarProdutosEstoque();
    } catch (error) {
        console.error(error);
        if (window.showToast) showToast('Erro ao excluir', 'error');
    }
}

let produtoMovimentacaoAtual = null;

function abrirModalMovimentacaoEstoque(id, nome) {
    produtoMovimentacaoAtual = id;
    document.getElementById('movProdutoId').value = id;
    document.getElementById('movProdutoNome').textContent = nome;
    document.getElementById('movQuantidade').value = '1';
    document.getElementById('movTipo').value = 'entrada';
    document.getElementById('movNumeroDocumento').value = '';
    document.getElementById('movTipoEntrada').value = 'nova';
    toggleTipoEntradaField();
    document.getElementById('modalMovimentacaoEstoque').classList.remove('hidden');
}

function fecharModalMovimentacaoEstoque() {
    document.getElementById('modalMovimentacaoEstoque').classList.add('hidden');
    produtoMovimentacaoAtual = null;
}

async function confirmarMovimentacaoEstoque() {
    const id = document.getElementById('movProdutoId').value;
    const tipo = document.getElementById('movTipo').value;
    let quantidade = parseInt(document.getElementById('movQuantidade').value);
    const numeroDocumento = document.getElementById('movNumeroDocumento').value.trim();
    
    if (!numeroDocumento) {
        if (window.showToast) showToast('Número da movimentação é obrigatório!', 'warning');
        return;
    }
    if (isNaN(quantidade) || quantidade <= 0) {
        if (window.showToast) showToast('Quantidade inválida', 'warning');
        return;
    }

    const produto = produtosEstoque.find(p => p.id == id);
    if (!produto) return;

    let novaQuantidade = produto.quantidade;
    let tipoEntrada = null;
    
    if (tipo === 'entrada') {
        novaQuantidade += quantidade;
        tipoEntrada = document.getElementById('movTipoEntrada').value;
    } else {
        if (produto.quantidade < quantidade) {
            if (window.showToast) showToast('Estoque insuficiente!', 'error');
            return;
        }
        novaQuantidade -= quantidade;
        // Verificar se é venda (se o documento for uma venda)
        if (numeroDocumento.toLowerCase().includes('venda') || numeroDocumento.toLowerCase().includes('mlb')) {
            tipoEntrada = 'venda';
        }
    }

    try {
        const { error } = await window.supabaseClient
            .from('produtos_estoque')
            .update({ quantidade: novaQuantidade })
            .eq('id', id);
        if (error) throw error;

        await registrarMovimentacao(id, tipo, quantidade, numeroDocumento, tipoEntrada);

        if (window.showToast) showToast(`Movimentação: ${tipo === 'entrada' ? '+' : '-'}${quantidade}`, 'success');
        fecharModalMovimentacaoEstoque();
        await carregarProdutosEstoque();

        const produtoAtualizado = produtosEstoque.find(p => p.id == id);
        if (produtoAtualizado && produtoAtualizado.dados_extra?.mlb_codes && produtoAtualizado.dados_extra.mlb_codes.length > 0) {
            setTimeout(() => {
                sincronizarEstoqueML(produtoAtualizado);
            }, 500);
        }
    } catch (error) {
        console.error(error);
        if (window.showToast) showToast('Erro ao movimentar', 'error');
    }
}

function toggleTipoEntradaField() {
    const tipo = document.getElementById('movTipo').value;
    const campoTipoEntrada = document.getElementById('campoTipoEntrada');
    if (tipo === 'entrada') {
        campoTipoEntrada.style.display = 'block';
    } else {
        campoTipoEntrada.style.display = 'none';
    }
}

function extrairSkuBase(sku) {
    if (!sku) return '';
    
    let skuLimpo = sku.trim();
    let skuReal = skuLimpo;
    
    // 🔥 REMOVE APENAS OS 3 PRIMEIROS DÍGITOS (prefixo de quantidade do ML)
    // O SKU do sistema JÁ NÃO TEM esses 3 dígitos
    const match = skuLimpo.match(/^\d{3}(.+)$/);
    if (match) {
        skuReal = match[1];
        console.log(`🔍 SKU com prefixo de 3 dígitos: "${skuLimpo}" → real: "${skuReal}"`);
    } else {
        console.log(`🔍 SKU sem prefixo (sistema): "${skuLimpo}"`);
    }
    
    // 🔥 EXTRAI OS 8 PRIMEIROS CARACTERES
    const base = skuReal.substring(0, 8).toUpperCase();
    console.log(`📊 Base extraída (8 caracteres): "${base}"`);
    return base;
}

// =========================================================
// EXPORTAR ESTOQUE PARA EXCEL
// =========================================================

function exportarEstoqueExcel() {
    const produtos = produtosFiltradosAtuais || produtosEstoque;
    
    if (!produtos || produtos.length === 0) {
        showToast('⚠️ Nenhum produto para exportar.', 'warning');
        return;
    }
    
    const podeVerCusto = currentUser && (currentUser.username === 'andressamiotto' || currentUser.username === 'ronald');
    
    const dados = [];
    
    const cabecalho = ['ID', 'Nome', 'SKU', 'Prefixo (5 chars)', 'Categoria', 'Quantidade', 'Preço Venda'];
    if (podeVerCusto) {
        cabecalho.push('Último Custo', 'Custo Médio');
    }
    cabecalho.push('Atributos', 'MLB Codes', 'Sync ML Bloqueado');
    dados.push(cabecalho);
    
    produtos.forEach(prod => {
        const atributos = prod.dados_extra ? Object.entries(prod.dados_extra)
            .filter(([key]) => key !== 'mlb_codes' && key !== 'historico_custos' && key !== 'bloquear_sync_ml')
            .map(([key, value]) => `${key}: ${value}`)
            .join('; ') : '';
        
        const mlbCodes = prod.mlb_codes || prod.dados_extra?.mlb_codes;
        const mlbString = mlbCodes && Array.isArray(mlbCodes) 
            ? mlbCodes.join(', ') 
            : (mlbCodes || '');
        
        const syncBloqueado = prod.bloquear_sync_ml || prod.dados_extra?.bloquear_sync_ml || false;
        const prefixo = prod.sku ? prod.sku.substring(0, 5).toUpperCase() : '-';
        
        const linha = [
            prod.id || '',
            prod.nome || '',
            prod.sku || '',
            prefixo,
            prod.categoria || '',
            prod.quantidade || 0,
            prod.preco || 0
        ];
        
        if (podeVerCusto) {
            const ultimoCusto = prod.ultimo_custo || prod.dados_extra?.ultimo_custo || 0;
            const custoMedio = prod.custo_medio || prod.dados_extra?.custo_medio || 0;
            linha.push(ultimoCusto);
            linha.push(custoMedio);
        }
        
        linha.push(atributos);
        linha.push(mlbString);
        linha.push(syncBloqueado ? 'Sim' : 'Não');
        dados.push(linha);
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(dados);
    
    const colunas = [
        { wch: 8 }, { wch: 35 }, { wch: 25 }, { wch: 12 },
        { wch: 15 }, { wch: 12 }, { wch: 12 }
    ];
    if (podeVerCusto) {
        colunas.push({ wch: 12 }, { wch: 12 });
    }
    colunas.push({ wch: 40 }, { wch: 30 }, { wch: 15 });
    ws['!cols'] = colunas;
    
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    
    const data = new Date();
    const dataStr = `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;
    const filename = `estoque_${dataStr}.xlsx`;
    
    XLSX.writeFile(wb, filename);
    showToast(`✅ ${produtos.length} produtos exportados com sucesso!`, 'success');
}

// =========================================================
// MODAL DE REGRAS
// =========================================================

function abrirModalRegrasEstoque() {
    const username = currentUser?.username?.toLowerCase() || '';
    const isAuthorized = usuariosRegraEstoque.includes(username) || usuariosAdmin.includes(username);
    
    if (!isAuthorized) {
        showToast('⚠️ Apenas administradores podem modificar as regras de estoque.', 'warning');
        return;
    }
    
    let modal = document.getElementById('modalRegrasEstoque');
    if (!modal) {
        modal = criarModalRegrasEstoque();
    }
    
    preencherModalRegras();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function criarModalRegrasEstoque() {
    const modal = document.createElement('div');
    modal.id = 'modalRegrasEstoque';
    modal.className = 'modal hidden';
    modal.style.cssText = 'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999;';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; background: white; padding: 30px; border-radius: 12px; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3><i class="fas fa-sliders-h" style="color: #00ADEE;"></i> Regras de Estoque Máximo</h3>
                <button onclick="fecharModalRegrasEstoque()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">&times;</button>
            </div>
            <div style="background: #fff3cd; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <i class="fas fa-info-circle"></i> 
                <strong>Como funciona:</strong> As regras são baseadas no <strong>preço do anúncio</strong> do produto.
                <br>Exemplo: Se preço > R$ 100,00 → estoque máximo = 10 unidades. Senão → estoque máximo = 50 unidades.
            </div>
            <div id="regrasEstoqueContainer">
                <!-- Campos serão preenchidos dinamicamente -->
            </div>
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #dee2e6; padding-top: 20px;">
                <button class="btn btn-secondary" onclick="fecharModalRegrasEstoque()">Cancelar</button>
                <button class="btn btn-success" onclick="salvarRegrasEstoqueModal()">
                    <i class="fas fa-save"></i> Salvar Regras
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

function preencherModalRegras() {
    const container = document.getElementById('regrasEstoqueContainer');
    if (!container) return;
    
    // Obter todas as categorias (padrão + customizadas)
    const todasCategorias = {
        ...camposPorCategoria,
        ...categoriasCustomizadas
    };
    
    const categoriasLista = Object.keys(todasCategorias).filter(c => c !== 'outros');
    categoriasLista.push('outros');
    
    const labels = {
        'Eixos': 'Eixos Passantes',
        'Parafusos': 'Parafusos',
        'Rolamentos': 'Rolamentos',
        'Raios': 'Raios',
        'Arruelas': 'Arruelas',
        'Porcas': 'Porcas',
        'CapacetesEPartes': 'Capacetes e Partes',
        'outros': 'Outros'
    };
    
    const operadores = [
        { value: 'maior_que', label: '>' },
        { value: 'menor_que', label: '<' },
        { value: 'igual_a', label: '=' },
        { value: 'padrao', label: 'Padrão' }
    ];
    
    let html = '';
    
    categoriasLista.forEach((cat) => {
        // Verificar se é customizada
        const isCustom = !!categoriasCustomizadas[cat];
        
        // Garantir que a categoria existe nas regras
        if (!regrasEstoqueAtuais[cat]) {
            regrasEstoqueAtuais[cat] = {
                condicoes: [{ operador: 'padrao', estoque_maximo: 30 }]
            };
        }
        
        const regras = regrasEstoqueAtuais[cat];
        const condicoes = regras.condicoes || [];
        
        // Se não tem condições, adicionar uma padrão
        if (condicoes.length === 0) {
            condicoes.push({ operador: 'padrao', estoque_maximo: 30 });
        }
        
        // Label da categoria
        let labelCategoria = labels[cat] || cat;
        if (isCustom) {
            labelCategoria += ' ⭐ (Customizada)';
        }
        
        html += `
            <div style="border: 1px solid ${isCustom ? '#6f42c1' : '#dee2e6'}; 
                        border-radius: 8px; 
                        padding: 15px; 
                        margin-bottom: 15px; 
                        background: ${isCustom ? '#f8f0ff' : '#fafafa'};
                        border-left: 4px solid ${isCustom ? '#6f42c1' : '#00ADEE'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; font-size: 16px; color: ${isCustom ? '#6f42c1' : '#00ADEE'};">
                        ${labelCategoria}
                    </h4>
                    <button class="btn btn-sm btn-primary" onclick="adicionarCondicaoRegra('${cat}')">
                        <i class="fas fa-plus"></i> Adicionar Condição
                    </button>
                </div>
                <div id="condicoes_${cat}" style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        condicoes.forEach((condicao, idx) => {
            const isPadrao = condicao.operador === 'padrao';
            // 🔥 CORREÇÃO: Garantir que valor existe
            const displayValor = (condicao.valor !== undefined && condicao.valor !== null) ? condicao.valor : 0;
            const displayMax = (condicao.estoque_maximo !== undefined && condicao.estoque_maximo !== null) ? condicao.estoque_maximo : 30;
            
            html += `
                <div style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #e9ecef;" id="condicao_${cat}_${idx}">
                    <span style="font-weight: 600; font-size: 13px; color: #495057; min-width: 60px;">Se preço</span>
                    <select class="form-control form-control-sm" style="width: 100px;" onchange="atualizarCondicaoRegra('${cat}', ${idx}, 'operador', this.value)">
                        ${operadores.map(op => `
                            <option value="${op.value}" ${condicao.operador === op.value ? 'selected' : ''}>${op.label}</option>
                        `).join('')}
                    </select>
                    ${!isPadrao ? `
                        <span style="color: #6c757d; font-size: 13px;">R$</span>
                        <input type="number" class="form-control form-control-sm" style="width: 100px;" 
                               value="${displayValor}" step="0.01" min="0"
                               onchange="atualizarCondicaoRegra('${cat}', ${idx}, 'valor', parseFloat(this.value) || 0)"
                               placeholder="Valor">
                        <span style="color: #6c757d; font-size: 13px;">→</span>
                    ` : ''}
                    <span style="color: #6c757d; font-size: 13px;">Estoque máx.:</span>
                    <input type="number" class="form-control form-control-sm" style="width: 80px;" 
                           value="${displayMax}" step="1" min="0"
                           onchange="atualizarCondicaoRegra('${cat}', ${idx}, 'estoque_maximo', parseInt(this.value) || 0)"
                           placeholder="Máx">
                    <span style="color: #6c757d; font-size: 12px;">unidades</span>
                    ${!isPadrao ? `
                        <button class="btn btn-sm btn-danger" onclick="removerCondicaoRegra('${cat}', ${idx})" title="Remover condição">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : `
                        <span class="badge badge-secondary" style="font-size: 11px;">Padrão (senão)</span>
                    `}
                </div>
                ${!isPadrao ? `
                    <div style="font-size: 11px; color: #6c757d; padding-left: 15px; margin-top: -4px;">
                        <i class="fas fa-info-circle"></i> Exemplo: Se preço ${condicao.operador === 'maior_que' ? '>' : condicao.operador === 'menor_que' ? '<' : '='} R$ ${displayValor} → estoque máximo = ${displayMax} unidades
                    </div>
                ` : ''}
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function adicionarCondicaoRegra(categoria) {
    if (!regrasEstoqueAtuais[categoria]) {
        regrasEstoqueAtuais[categoria] = { condicoes: [] };
    }
    
    const condicoes = regrasEstoqueAtuais[categoria].condicoes;
    const padraoIndex = condicoes.findIndex(c => c.operador === 'padrao');
    
    const novaCondicao = { operador: 'maior_que', valor: 100, estoque_maximo: 10 };
    
    if (padraoIndex !== -1) {
        condicoes.splice(padraoIndex, 0, novaCondicao);
    } else {
        condicoes.push(novaCondicao);
    }
    
    preencherModalRegras();
}

function removerCondicaoRegra(categoria, index) {
    if (!regrasEstoqueAtuais[categoria]) return;
    
    const condicoes = regrasEstoqueAtuais[categoria].condicoes;
    if (condicoes[index] && condicoes[index].operador === 'padrao') {
        showToast('Não é possível remover a condição padrão (senão).', 'warning');
        return;
    }
    
    if (condicoes.length <= 1) {
        showToast('Mantenha pelo menos a condição padrão.', 'warning');
        return;
    }
    
    condicoes.splice(index, 1);
    preencherModalRegras();
}

function atualizarCondicaoRegra(categoria, index, campo, valor) {
    if (!regrasEstoqueAtuais[categoria]) return;
    
    const condicoes = regrasEstoqueAtuais[categoria].condicoes;
    if (!condicoes[index]) return;
    
    condicoes[index][campo] = valor;
    
    if (campo === 'operador' && valor === 'padrao') {
        delete condicoes[index].valor;
    }
    
    clearTimeout(window._saveTimeout);
    window._saveTimeout = setTimeout(() => {
        salvarRegrasEstoque(regrasEstoqueAtuais);
    }, 1000);
}

async function salvarRegrasEstoqueModal() {
    console.log('🔄 [salvarRegrasEstoqueModal] Iniciando salvamento...');
    
    // Obter todas as categorias (padrão + customizadas)
    const todasCategorias = {
        ...camposPorCategoria,
        ...categoriasCustomizadas
    };
    
    const categoriasLista = Object.keys(todasCategorias).filter(c => c !== 'outros');
    categoriasLista.push('outros');
    
    // 🔥 IMPORTANTE: Garantir que todas as categorias tenham pelo menos a condição padrão
    let valido = true;
    let categoriasSemRegra = [];
    
    for (const cat of categoriasLista) {
        // Se a categoria não existe nas regras, criar com padrão
        if (!regrasEstoqueAtuais[cat]) {
            regrasEstoqueAtuais[cat] = {
                condicoes: [
                    { operador: 'padrao', estoque_maximo: 30 }
                ]
            };
            console.log(`✅ Regra padrão criada para: ${cat}`);
            continue;
        }
        
        const regras = regrasEstoqueAtuais[cat];
        
        // Garantir que condicoes existe
        if (!regras.condicoes || regras.condicoes.length === 0) {
            regras.condicoes = [{ operador: 'padrao', estoque_maximo: 30 }];
            console.log(`✅ Condição padrão adicionada para: ${cat}`);
            continue;
        }
        
        // 🔥 CORREÇÃO: Garantir que todas as condições tenham os campos necessários
        for (let i = 0; i < regras.condicoes.length; i++) {
            const cond = regras.condicoes[i];
            
            // Garantir que operador existe
            if (!cond.operador) {
                cond.operador = 'padrao';
            }
            
            // Se não for padrão, garantir que valor existe
            if (cond.operador !== 'padrao' && (cond.valor === undefined || cond.valor === null)) {
                cond.valor = 0;
                console.log(`⚠️ Valor definido como 0 para condição ${i} de ${cat}`);
            }
            
            // Garantir que estoque_maximo existe
            if (cond.estoque_maximo === undefined || cond.estoque_maximo === null) {
                cond.estoque_maximo = 30;
                console.log(`⚠️ Estoque máximo definido como 30 para condição ${i} de ${cat}`);
            }
        }
        
        // Verificar se tem condição padrão
        const temPadrao = regras.condicoes.some(c => c.operador === 'padrao');
        if (!temPadrao) {
            // Adicionar condição padrão no final
            regras.condicoes.push({ operador: 'padrao', estoque_maximo: 30 });
            console.log(`✅ Condição padrão adicionada para: ${cat}`);
        }
    }
    
    console.log('📊 Regras a serem salvas:', JSON.stringify(regrasEstoqueAtuais, null, 2));
    
    // Salvar
    await salvarRegrasEstoque(regrasEstoqueAtuais);
    
    // Fechar modal
    fecharModalRegrasEstoque();
    
    // Recarregar tabela para aplicar as regras
    renderizarTabelaProdutos(produtosFiltradosAtuais);
    
    showToast('✅ Regras de estoque salvas com sucesso!', 'success');
}

function fecharModalRegrasEstoque() {
    const modal = document.getElementById('modalRegrasEstoque');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// =========================================================
// MODAL REGRA INDIVIDUAL
// =========================================================

function abrirModalRegraIndividual(sku) {
    let modal = document.getElementById('modalRegraIndividual');
    if (!modal) {
        modal = criarModalRegraIndividual();
    }
    
    const skuInput = document.getElementById('regraSku');
    const skuDisplay = document.getElementById('regraSkuDisplay');
    
    if (skuInput) skuInput.value = sku || '';
    if (skuDisplay) skuDisplay.textContent = sku || 'SKU';
    
    const container = document.getElementById('regraIndividuaisContainer');
    if (container) {
        container.innerHTML = '';
        const regra = regrasEstoqueIndividuais[sku] || { condicoes: [] };
        if (regra.condicoes.length === 0) {
            adicionarCondicaoIndividual();
        } else {
            regra.condicoes.forEach((cond, idx) => {
                adicionarCondicaoIndividual(cond, idx);
            });
        }
    }
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function criarModalRegraIndividual() {
    const modal = document.createElement('div');
    modal.id = 'modalRegraIndividual';
    modal.className = 'modal hidden';
    modal.style.cssText = 'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999;';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; background: white; padding: 30px; border-radius: 12px; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="margin: 0;">
                    <i class="fas fa-sliders-h" style="color: #00ADEE;"></i> 
                    Regra Individual - <span id="regraSkuDisplay" style="color: #00ADEE;">SKU</span>
                </h3>
                <button onclick="fecharModalRegraIndividual()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">&times;</button>
            </div>
            
            <input type="hidden" id="regraSku">
            
            <div style="background: #fff3cd; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                <i class="fas fa-info-circle"></i> 
                <strong>Regra individual para este produto.</strong> 
                <br>Se definida, <strong>sobrescreve</strong> a regra da categoria.
                <br>Deixe vazio para usar a regra da categoria.
            </div>
            
            <div id="regraIndividuaisContainer" style="margin-bottom: 10px;">
                <!-- Condições serão adicionadas aqui -->
            </div>
            
            <div style="margin-top: 10px; margin-bottom: 15px;">
                <button class="btn btn-sm btn-primary" onclick="adicionarCondicaoIndividual()">
                    <i class="fas fa-plus"></i> Adicionar Condição
                </button>
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #dee2e6; padding-top: 20px;">
                <button class="btn btn-danger" onclick="removerRegraIndividual()" id="btnRemoverRegraIndividual">
                    <i class="fas fa-trash"></i> Remover Regra
                </button>
                <button class="btn btn-secondary" onclick="fecharModalRegraIndividual()">Cancelar</button>
                <button class="btn btn-success" onclick="salvarRegraIndividual()">
                    <i class="fas fa-save"></i> Salvar Regra
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

function fecharModalRegraIndividual() {
    const modal = document.getElementById('modalRegraIndividual');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

function adicionarCondicaoIndividual(condicaoExistente = null, idx = null) {
    const container = document.getElementById('regraIndividuaisContainer');
    if (!container) return;
    
    const index = idx !== null ? idx : container.children.length;
    
    const div = document.createElement('div');
    div.className = 'condicao-individual';
    div.style.cssText = 'display: flex; align-items: center; gap: 8px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid #e9ecef; margin-bottom: 8px; flex-wrap: wrap;';
    div.id = `condicao_indiv_${index}`;
    
    const condicao = condicaoExistente || { operador: 'maior_que', valor: 100, estoque_maximo: 10 };
    const isPadrao = condicao.operador === 'padrao';
    
    div.innerHTML = `
        <span style="font-weight: 600; font-size: 13px; min-width: 60px;">Se preço</span>
        <select class="form-control form-control-sm" style="width: 100px;" onchange="atualizarCondicaoIndividual(${index}, 'operador', this.value)">
            <option value="maior_que" ${condicao.operador === 'maior_que' ? 'selected' : ''}>></option>
            <option value="menor_que" ${condicao.operador === 'menor_que' ? 'selected' : ''}><</option>
            <option value="igual_a" ${condicao.operador === 'igual_a' ? 'selected' : ''}>=</option>
            <option value="padrao" ${isPadrao ? 'selected' : ''}>Padrão</option>
        </select>
        ${!isPadrao ? `
            <span style="color: #6c757d; font-size: 13px;">R$</span>
            <input type="number" class="form-control form-control-sm" style="width: 100px;" 
                   value="${condicao.valor || 0}" step="0.01" min="0"
                   onchange="atualizarCondicaoIndividual(${index}, 'valor', parseFloat(this.value) || 0)"
                   placeholder="Valor">
            <span style="color: #6c757d; font-size: 13px;">→</span>
        ` : ''}
        <span style="color: #6c757d; font-size: 13px;">Máx.:</span>
        <input type="number" class="form-control form-control-sm" style="width: 80px;" 
               value="${condicao.estoque_maximo || 0}" step="1" min="0"
               onchange="atualizarCondicaoIndividual(${index}, 'estoque_maximo', parseInt(this.value) || 0)"
               placeholder="Máx">
        <span style="color: #6c757d; font-size: 12px;">unid.</span>
        ${!isPadrao ? `
            <button class="btn btn-sm btn-danger" onclick="removerCondicaoIndividual(${index})" title="Remover condição">
                <i class="fas fa-times"></i>
            </button>
        ` : `
            <span class="badge badge-secondary" style="font-size: 11px;">Padrão</span>
        `}
    `;
    
    if (idx === null) {
        container.appendChild(div);
    } else {
        const existing = document.getElementById(`condicao_indiv_${idx}`);
        if (existing) {
            existing.replaceWith(div);
        } else {
            container.appendChild(div);
        }
    }
    
    reindexarCondicoesIndividuais();
}

function reindexarCondicoesIndividuais() {
    const container = document.getElementById('regraIndividuaisContainer');
    const children = container.children;
    for (let i = 0; i < children.length; i++) {
        children[i].id = `condicao_indiv_${i}`;
        const selects = children[i].querySelectorAll('select');
        const inputs = children[i].querySelectorAll('input');
        const btns = children[i].querySelectorAll('button');
        
        selects.forEach(el => {
            const oldOnchange = el.getAttribute('onchange');
            if (oldOnchange) {
                el.setAttribute('onchange', oldOnchange.replace(/\d+/g, i));
            }
        });
        inputs.forEach(el => {
            const oldOnchange = el.getAttribute('onchange');
            if (oldOnchange) {
                el.setAttribute('onchange', oldOnchange.replace(/\d+/g, i));
            }
        });
        btns.forEach(el => {
            const oldOnclick = el.getAttribute('onclick');
            if (oldOnclick) {
                el.setAttribute('onclick', oldOnclick.replace(/\d+/g, i));
            }
        });
    }
}

function atualizarCondicaoIndividual(index, campo, valor) {
    console.log(`Condição ${index} - ${campo} = ${valor}`);
}

function removerCondicaoIndividual(index) {
    const container = document.getElementById('regraIndividuaisContainer');
    const children = container.children;
    if (children.length <= 1) {
        showToast('Mantenha pelo menos a condição padrão.', 'warning');
        return;
    }
    const el = document.getElementById(`condicao_indiv_${index}`);
    if (el) {
        el.remove();
        reindexarCondicoesIndividuais();
    }
}

function salvarRegraIndividual() {
    const sku = document.getElementById('regraSku').value;
    if (!sku) {
        showToast('SKU não informado', 'warning');
        return;
    }
    
    const container = document.getElementById('regraIndividuaisContainer');
    const children = container.children;
    const condicoes = [];
    
    for (let i = 0; i < children.length; i++) {
        const div = children[i];
        const operador = div.querySelector('select')?.value || 'padrao';
        const inputs = div.querySelectorAll('input');
        let valor = 0;
        let estoque_maximo = 0;
        
        if (operador !== 'padrao') {
            const valorInput = inputs[0];
            if (valorInput) valor = parseFloat(valorInput.value) || 0;
            const maxInput = inputs[inputs.length - 1];
            if (maxInput) estoque_maximo = parseInt(maxInput.value) || 0;
        } else {
            const maxInput = inputs[0];
            if (maxInput) estoque_maximo = parseInt(maxInput.value) || 0;
        }
        
        condicoes.push({ operador, valor, estoque_maximo });
    }
    
    const temPadrao = condicoes.some(c => c.operador === 'padrao');
    if (!temPadrao) {
        showToast('Adicione uma condição padrão (senão).', 'warning');
        return;
    }
    
    regrasEstoqueIndividuais[sku] = { condicoes };
    salvarRegrasIndividuais(regrasEstoqueIndividuais);
    
    fecharModalRegraIndividual();
    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

function removerRegraIndividual() {
    const sku = document.getElementById('regraSku').value;
    if (!sku) return;
    
    if (!confirm(`Remover regra individual para ${sku}?`)) return;
    
    delete regrasEstoqueIndividuais[sku];
    salvarRegrasIndividuais(regrasEstoqueIndividuais);
    
    fecharModalRegraIndividual();
    renderizarTabelaProdutos(produtosFiltradosAtuais);
    showToast(`✅ Regra removida para ${sku}`, 'success');
}

// =========================================================
// ABRIR MODAL PRODUTO ESTOQUE
// =========================================================

function abrirModalProdutoEstoque(produto = null) {
    console.log('🚪 [abrirModalProdutoEstoque] Abrindo modal para:', produto?.sku || 'NOVO PRODUTO');
    
    const modal = document.getElementById('modalProdutoEstoque');
    if (!modal) {
        console.error('❌ Modal #modalProdutoEstoque não encontrado!');
        showToast('Erro: Modal não encontrado', 'error');
        return;
    }
    
    const title = document.getElementById('modalProdutoTitle');
    const idInput = document.getElementById('produtoId');
    const nomeInput = document.getElementById('produtoNome');
    const skuInput = document.getElementById('produtoSKU');
    const qtdInput = document.getElementById('produtoQuantidade');
    const precoInput = document.getElementById('produtoPreco');
    const descInput = document.getElementById('produtoDescricao');
    const categoriaSelect = document.getElementById('produtoCategoria');
    const toggleSync = document.getElementById('bloquearSyncML');
    const syncStatusLabel = document.getElementById('mlSyncStatusLabel');

    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    const podeModificarSync = usuariosAutorizadosSync.includes(username) || isAdmin;
    const podeVerCusto = usuariosVerCusto.includes(username) || isAdmin;

    if (toggleSync) {
        if (!podeModificarSync) {
            toggleSync.disabled = true;
            toggleSync.title = '🔒 Apenas administradores podem modificar a sincronização com o ML';
            toggleSync.parentElement.style.opacity = '0.6';
            toggleSync.parentElement.style.cursor = 'not-allowed';
        } else {
            toggleSync.disabled = false;
            toggleSync.title = 'Clique para alternar a sincronização com o ML';
            toggleSync.parentElement.style.opacity = '1';
            toggleSync.parentElement.style.cursor = 'pointer';
        }
    }

    const adminOnlyMsg = document.getElementById('mlSyncAdminOnly');
    if (adminOnlyMsg) {
        adminOnlyMsg.style.display = podeModificarSync ? 'none' : 'block';
    }

    const helpText = document.getElementById('mlSyncHelpText');
    if (helpText) {
        if (podeModificarSync) {
            helpText.textContent = 'Quando ativado, o estoque NÃO será sincronizado automaticamente com o ML';
        } else {
            helpText.textContent = 'Esta configuração é gerenciada por administradores';
        }
    }

    if (!title || !idInput || !nomeInput || !skuInput || !qtdInput || !precoInput || !descInput || !categoriaSelect) {
        console.error('❌ Elementos do modal não encontrados!');
        showToast('Erro: Elementos do modal não encontrados', 'error');
        return;
    }

    if (produto && produto.id) {
        title.textContent = 'Editar Produto';
        idInput.value = produto.id;
        nomeInput.value = produto.nome || '';
        skuInput.value = produto.sku || '';
        qtdInput.value = produto.quantidade || 0;
        qtdInput.readOnly = true;
        qtdInput.classList.add('bg-light');
        precoInput.value = produto.preco || 0;
        descInput.value = produto.descricao || '';
        categoriaSelect.value = produto.categoria || '';
        
        const syncBloqueado = produto.bloquear_sync_ml || produto.dados_extra?.bloquear_sync_ml || false;
        if (toggleSync) {
            toggleSync.checked = syncBloqueado;
            atualizarStatusSyncLabel(toggleSync.checked);
        }
        
        console.log('📦 [abrirModalProdutoEstoque] Editando produto:', produto.sku);
        console.log('🔒 Sync ML bloqueado?', syncBloqueado);
        
        gerarCamposDinamicos(produto.categoria);
        
        const dadosExtra = produto.dados_extra || {};
        Object.keys(dadosExtra).forEach(chave => {
            const campo = document.getElementById(`campo_${chave}`);
            if (campo) {
                if (campo.type === 'checkbox') {
                    campo.checked = dadosExtra[chave];
                } else if (chave === 'mlb_codes' && Array.isArray(dadosExtra[chave])) {
                    campo.value = dadosExtra[chave].join(', ');
                } else {
                    campo.value = dadosExtra[chave];
                }
            }
        });
        
        if (produto.categoria === 'Raios') {
            const marcaField = document.getElementById('campo_marca');
            if (marcaField && marcaField.value) {
                atualizarModelosPorMarca(marcaField.value);
                const modeloField = document.getElementById('campo_modelo');
                if (modeloField && dadosExtra.modelo) {
                    modeloField.value = dadosExtra.modelo;
                }
            }
        }
        
        if (produto.categoria === 'Rolamentos') {
            const anguloInt = document.getElementById('campo_angulo_interno');
            const anguloExt = document.getElementById('campo_angulo_externo');
            if (anguloInt && dadosExtra.angulo_interno) anguloInt.value = dadosExtra.angulo_interno;
            if (anguloExt && dadosExtra.angulo_externo) anguloExt.value = dadosExtra.angulo_externo;
            const aplicacao = document.getElementById('campo_aplicaçao');
            if (aplicacao && aplicacao.value === 'Cubo/Caixa de Direção') {
                const angulosDiv = document.getElementById('camposAngulosRolamento');
                if (angulosDiv) angulosDiv.style.display = 'block';
            }
        }
        
        setTimeout(async () => {
            const skuAtual = document.getElementById('produtoSKU').value;
            if (skuAtual) {
                try {
                    const skus = await carregarSkusKit(skuAtual);
                    renderizarSkusKit(skus);
                } catch (error) {
                    console.error('❌ Erro ao carregar SKUs do kit:', error);
                    renderizarSkusKit([]);
                }
            }
        }, 500);
        
    } else {
        title.textContent = 'Novo Produto';
        idInput.value = '';
        nomeInput.value = '';
        skuInput.value = '';
        qtdInput.value = '0';
        qtdInput.readOnly = false;
        qtdInput.classList.remove('bg-light');
        precoInput.value = '0';
        descInput.value = '';
        categoriaSelect.value = '';
        
        if (toggleSync) {
            toggleSync.checked = false;
            atualizarStatusSyncLabel(false);
        }
        
        gerarCamposDinamicos('');
        renderizarSkusKit([]);
    }

    if (toggleSync) {
        toggleSync.onchange = function() {
            atualizarStatusSyncLabel(this.checked);
        };
    }

    categoriaSelect.onchange = function() {
        const novaCategoria = categoriaSelect.value;
        const produtoAtual = document.getElementById('produtoId').value;
        if (produtoAtual && produto && produto.categoria && novaCategoria !== produto.categoria) {
            if (!confirm('Alterar a categoria limpará os atributos específicos. Deseja continuar?')) {
                categoriaSelect.value = produto.categoria || '';
                return;
            }
        }
        gerarCamposDinamicos(novaCategoria);
    };

    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.7)';
    modal.style.zIndex = '99999';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.classList.remove('hidden');
    
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.backgroundColor = 'white';
        modalContent.style.position = 'relative';
        modalContent.style.zIndex = '100000';
    }
    
    console.log('✅ Modal exibido com sucesso!');
}

function atualizarStatusSyncLabel(bloqueado) {
    const label = document.getElementById('mlSyncStatusLabel');
    if (!label) return;
    
    if (bloqueado) {
        label.innerHTML = '<i class="fas fa-circle" style="font-size: 10px; color: #dc3545;"></i> Bloqueado';
        label.style.color = '#dc3545';
    } else {
        label.innerHTML = '<i class="fas fa-circle" style="font-size: 10px; color: #28a745;"></i> Ativo';
        label.style.color = '#28a745';
    }
}

function fecharModalProdutoEstoque() {
    const modal = document.getElementById('modalProdutoEstoque');
    if (modal) modal.classList.add('hidden');
}

function renderizarSkusKit(skus) {
    const tbody = document.getElementById('kitSkusBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!skus || skus.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum SKU adicionado ao kit.</td></tr>';
        return;
    }
    
    skus.forEach((item) => {
        const row = document.createElement('tr');
        const skuFilho = typeof item === 'string' ? item : (item.sku_filho || '');
        const quantidade = typeof item === 'string' ? 1 : (item.quantidade || 1);
        
        row.innerHTML = `
            <td>
                <input type="text" class="form-control form-control-sm kit-sku-filho" value="${escapeHtml(skuFilho)}" placeholder="SKU filho">
            </td>
            <td>
                <input type="number" class="form-control form-control-sm kit-quantidade" value="${quantidade}" min="1" step="1">
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-danger remove-kit-sku">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
        
        row.querySelector('.remove-kit-sku').addEventListener('click', function() {
            row.remove();
            const rows = document.querySelectorAll('#kitSkusBody tr:not(.text-muted)');
            if (rows.length === 0) {
                document.getElementById('kitSkusBody').innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum SKU adicionado ao kit.</td></tr>';
            }
        });
    });
}

// =========================================================
// INICIALIZAÇÃO
// =========================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Inicializando Gestão de Estoque com Categorias Dinâmicas...');
    
    const buscaInput = document.getElementById('buscaEstoqueInput');
    if (buscaInput) {
        buscaInput.addEventListener('input', filtrarProdutosEstoque);
    }
    
    const categoriaFilter = document.getElementById('filtroCategoriaEstoque');
    if (categoriaFilter) {
        categoriaFilter.addEventListener('change', filtrarProdutosEstoque);
    }
    
    configurarEventosKit();
    
    paginaAtualEstoque = 1;
    itensPorPaginaEstoque = 20;
    produtosFiltradosAtuais = [];
    
    setTimeout(carregarRegrasEstoque, 1000);
    setTimeout(carregarCategoriasCustomizadas, 1100);
    setTimeout(carregarRegrasIndividuais, 1200);
    setTimeout(adicionarSecaoCategorias, 2500);
    
    const btnCategorias = document.getElementById('btnGerenciarCategorias');
    if (btnCategorias) {
        btnCategorias.onclick = abrirModalCategorias;
    }
    
    // ===== ADICIONAR BOTÃO "CRIAR CATEGORIA" =====
    setTimeout(adicionarBotaoCriarCategoria, 1500);
    setTimeout(adicionarBotaoNoModalCategorias, 2000);
    
    setTimeout(async () => {
        if (!window.supabaseClient) return;
        try {
            const { error } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id')
                .limit(1);
            if (error && error.message.includes('does not exist')) {
                console.warn('Tabela produtos_estoque não existe. Execute o SQL de criação.');
            }
        } catch(e) {}
    }, 2000);
});

// =========================================================
// EXPORTAR FUNÇÕES PARA USO GLOBAL
// =========================================================

window.abrirGestaoEstoque = window.abrirGestaoEstoque;
window.carregarProdutosEstoque = carregarProdutosEstoque;
window.filtrarProdutosEstoque = filtrarProdutosEstoque;
window.limparFiltrosEstoque = limparFiltrosEstoque;
window.ordenarEstoquePor = ordenarEstoquePor;
window.abrirModalProdutoEstoque = abrirModalProdutoEstoque;
window.salvarProdutoEstoque = salvarProdutoEstoque;
window.editarProdutoEstoque = editarProdutoEstoque;
window.excluirProdutoEstoque = excluirProdutoEstoque;
window.abrirModalMovimentacaoEstoque = abrirModalMovimentacaoEstoque;
window.confirmarMovimentacaoEstoque = confirmarMovimentacaoEstoque;
window.fecharModalMovimentacaoEstoque = fecharModalMovimentacaoEstoque;
window.verHistoricoMovimentacoes = verHistoricoMovimentacoes;
window.exportarEstoqueExcel = exportarEstoqueExcel;
window.abrirModalRegrasEstoque = abrirModalRegrasEstoque;
window.abrirModalRegraIndividual = abrirModalRegraIndividual;
window.abrirModalCategorias = abrirModalCategorias;
window.sincronizarProdutoML = window.sincronizarProdutoML;
window.irParaPaginaEstoque = irParaPaginaEstoque;
window.alterarItensPorPaginaEstoque = alterarItensPorPaginaEstoque;
window.abrirModalFullDetectados = abrirModalFullDetectados;
window.confirmarFullDetectado = confirmarFullDetectado;
window.fecharModalFullDetectados = fecharModalFullDetectados;
window.atualizarProgressoFull = atualizarProgressoFull;

// =========================================================
// FUNÇÕES DE CATEGORIAS DINÂMICAS - CRIAR CATEGORIA COM CAMPOS PERSONALIZADOS
// =========================================================

// ===== ADICIONAR BOTÃO "CRIAR CATEGORIA" NA TELA =====
function adicionarBotaoCriarCategoria() {
    console.log('🔧 [adicionarBotaoCriarCategoria] Tentando adicionar botão...');
    
    const filtrosContainer = document.querySelector('#estoqueGestaoSystem .card-header .d-flex.gap-2');
    if (!filtrosContainer) {
        setTimeout(adicionarBotaoCriarCategoria, 500);
        return;
    }
    
    if (document.getElementById('btnCriarCategoria')) return;
    
    const btn = document.createElement('button');
    btn.id = 'btnCriarCategoria';
    btn.className = 'btn btn-purple';
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Categoria';
    btn.title = 'Criar nova categoria personalizada com campos específicos';
    btn.onclick = abrirModalCriarCategoria;
    
    const novoProdutoBtn = filtrosContainer.querySelector('.btn-success');
    if (novoProdutoBtn) {
        filtrosContainer.insertBefore(btn, novoProdutoBtn);
    } else {
        filtrosContainer.appendChild(btn);
    }
    console.log('✅ Botão "Criar Categoria" adicionado!');
}

// ===== ABRIR MODAL DE CRIAÇÃO DE CATEGORIA =====
function abrirModalCriarCategoria() {
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    
    if (!isAdmin) {
        showToast('⚠️ Apenas administradores podem criar categorias.', 'warning');
        return;
    }
    
    let modal = document.getElementById('modalCriarCategoria');
    if (!modal) {
        modal = criarModalCriarCategoria();
    }
    
    document.getElementById('novaCategoriaNome').value = '';
    document.getElementById('novaCategoriaNome').disabled = false;
    document.getElementById('novaCategoriaCampos').innerHTML = '';
    
    adicionarCampoPadraoMLB();
    
    const btnSalvar = document.querySelector('#modalCriarCategoria .btn-success');
    if (btnSalvar) {
        btnSalvar.textContent = 'Criar Categoria';
        btnSalvar.onclick = salvarNovaCategoria;
    }
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

// ===== CRIAR MODAL DE CRIAÇÃO DE CATEGORIA =====
function criarModalCriarCategoria() {
    const modal = document.createElement('div');
    modal.id = 'modalCriarCategoria';
    modal.className = 'modal hidden';
    modal.style.cssText = 'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999;';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 850px; background: white; padding: 30px; border-radius: 12px; max-height: 90vh; overflow-y: auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3><i class="fas fa-tag" style="color: #6f42c1;"></i> Criar Nova Categoria</h3>
                <button onclick="fecharModalCriarCategoria()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6c757d;">&times;</button>
            </div>
            
            <div style="background: #e8d5f5; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px; border-left: 4px solid #6f42c1;">
                <i class="fas fa-info-circle" style="color: #6f42c1;"></i> 
                <strong>Crie sua própria categoria</strong> com campos personalizados.
                <br>O campo <strong>mlb_codes</strong> é obrigatório e será adicionado automaticamente.
            </div>
            
            <div class="form-group">
                <label>Nome da Categoria *</label>
                <input type="text" id="novaCategoriaNome" class="form-control" placeholder="Ex: Freios, Pneus, Aros, etc.">
                <small class="text-muted">Use um nome único e descritivo</small>
            </div>
            
            <div style="border-top: 1px solid #dee2e6; margin-top: 15px; padding-top: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0;"><i class="fas fa-list"></i> Campos da Categoria</h4>
                    <button type="button" class="btn btn-sm btn-primary" onclick="adicionarCampoDinamico()">
                        <i class="fas fa-plus"></i> Adicionar Campo
                    </button>
                </div>
                <div id="novaCategoriaCampos"></div>
                <small class="text-muted">Os campos definidos aqui aparecerão ao criar/editar produtos desta categoria</small>
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #dee2e6; padding-top: 20px;">
                <button class="btn btn-secondary" onclick="fecharModalCriarCategoria()">Cancelar</button>
                <button class="btn btn-success" onclick="salvarNovaCategoria()">
                    <i class="fas fa-save"></i> Criar Categoria
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

// ===== FECHAR MODAL =====
function fecharModalCriarCategoria() {
    const modal = document.getElementById('modalCriarCategoria');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// ===== ADICIONAR CAMPO MLB CODES (FIXO) =====
function adicionarCampoPadraoMLB() {
    const container = document.getElementById('novaCategoriaCampos');
    if (!container) return;
    if (container.querySelector('.campo-mlb-codes')) return;
    
    const div = document.createElement('div');
    div.className = 'campo-dinamico campo-mlb-codes';
    div.style.cssText = 'background: #f0f8ff; border: 2px dashed #00ADEE; border-radius: 8px; padding: 15px; margin-bottom: 15px;';
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600; color: #00ADEE;"><i class="fas fa-code"></i> MLB Codes (obrigatório)</span>
            <span class="badge badge-info">Fixado</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr; gap: 10px;">
            <div>
                <label style="font-weight: 500; font-size: 13px;">Tipo</label>
                <select class="form-control campo-tipo" disabled style="background: #e9ecef;">
                    <option value="textarea">Texto Longo</option>
                </select>
            </div>
            <div>
                <label style="font-weight: 500; font-size: 13px;">Label</label>
                <input type="text" class="form-control campo-label" value="Códigos MLB" disabled style="background: #e9ecef;">
            </div>
            <div>
                <label style="font-weight: 500; font-size: 13px;">Placeholder</label>
                <input type="text" class="form-control campo-placeholder" value="MLB separados por vírgula" disabled style="background: #e9ecef;">
            </div>
        </div>
        <input type="hidden" class="campo-obrigatorio" value="false">
        <input type="hidden" class="campo-nome" value="mlb_codes">
        <input type="hidden" class="campo-rows" value="2">
    `;
    container.appendChild(div);
}

// ===== ADICIONAR CAMPO PERSONALIZADO =====
function adicionarCampoDinamico(campoExistente = null) {
    const container = document.getElementById('novaCategoriaCampos');
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'campo-dinamico';
    div.style.cssText = 'border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #fafafa; position: relative;';
    
    const index = container.querySelectorAll('.campo-dinamico:not(.campo-mlb-codes)').length;
    
    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-weight: 600;">Campo #${index + 1}</span>
            <button type="button" class="btn btn-sm btn-danger" onclick="removerCampoDinamico(this)" title="Remover campo">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div>
                <label style="font-weight: 500; font-size: 13px;">Nome do Campo (identificador) *</label>
                <input type="text" class="form-control campo-nome" placeholder="Ex: diametroint, marca, etc." value="${campoExistente?.nome || ''}">
                <small style="color: #6c757d; font-size: 10px;">Usado internamente (sem espaços)</small>
            </div>
            <div>
                <label style="font-weight: 500; font-size: 13px;">Label (exibido) *</label>
                <input type="text" class="form-control campo-label" placeholder="Ex: Diâmetro Interno" value="${campoExistente?.label || ''}">
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
            <div>
                <label style="font-weight: 500; font-size: 13px;">Tipo do Campo *</label>
                <select class="form-control campo-tipo" onchange="toggleOpcoesCampo(this)">
                    <option value="text" ${campoExistente?.tipo === 'text' ? 'selected' : ''}>Texto</option>
                    <option value="number" ${campoExistente?.tipo === 'number' ? 'selected' : ''}>Número</option>
                    <option value="select" ${campoExistente?.tipo === 'select' ? 'selected' : ''}>Seleção (lista)</option>
                    <option value="textarea" ${campoExistente?.tipo === 'textarea' ? 'selected' : ''}>Texto Longo</option>
                    <option value="checkbox" ${campoExistente?.tipo === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                </select>
            </div>
            <div>
                <label style="font-weight: 500; font-size: 13px;">Obrigatório</label>
                <select class="form-control campo-obrigatorio">
                    <option value="true" ${campoExistente?.obrigatorio ? 'selected' : ''}>Sim</option>
                    <option value="false" ${!campoExistente?.obrigatorio ? 'selected' : ''}>Não</option>
                </select>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
            <div>
                <label style="font-weight: 500; font-size: 13px;">Placeholder</label>
                <input type="text" class="form-control campo-placeholder" placeholder="Ex: 15 ou 15,5" value="${campoExistente?.placeholder || ''}">
            </div>
            <div class="campo-opcoes-container" style="${campoExistente?.tipo === 'select' ? '' : 'display: none;'}">
                <label style="font-weight: 500; font-size: 13px;">Opções (separadas por vírgula) *</label>
                <input type="text" class="form-control campo-opcoes" placeholder="Ex: Opção1, Opção2, Opção3" value="${campoExistente?.opcoes?.join(', ') || ''}">
                <small style="color: #6c757d; font-size: 10px;">Separe as opções por vírgula</small>
            </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
            <div>
                <label style="font-weight: 500; font-size: 13px;">Validação</label>
                <select class="form-control campo-validacao">
                    <option value="">Nenhuma</option>
                    <option value="numero_virgula" ${campoExistente?.validacao === 'numero_virgula' ? 'selected' : ''}>Número com vírgula</option>
                    <option value="email">E-mail</option>
                    <option value="url">URL</option>
                </select>
            </div>
            <div>
                <label style="font-weight: 500; font-size: 13px;">Rows (para Texto Longo)</label>
                <input type="number" class="form-control campo-rows" value="${campoExistente?.rows || 2}" min="1" max="10">
            </div>
        </div>
    `;
    
    container.appendChild(div);
}

// ===== REMOVER CAMPO =====
function removerCampoDinamico(btn) {
    const div = btn.closest('.campo-dinamico');
    if (div.classList.contains('campo-mlb-codes')) {
        showToast('⚠️ O campo MLB Codes não pode ser removido.', 'warning');
        return;
    }
    if (confirm('Remover este campo?')) {
        div.remove();
        const container = document.getElementById('novaCategoriaCampos');
        const campos = container.querySelectorAll('.campo-dinamico:not(.campo-mlb-codes)');
        campos.forEach((campo, idx) => {
            const span = campo.querySelector('span[style*="font-weight: 600;"]');
            if (span) span.textContent = `Campo #${idx + 1}`;
        });
    }
}

// ===== TOGGLE OPÇÕES =====
function toggleOpcoesCampo(select) {
    const container = select.closest('.campo-dinamico');
    const opcoesContainer = container.querySelector('.campo-opcoes-container');
    opcoesContainer.style.display = select.value === 'select' ? 'block' : 'none';
}

// ===== SALVAR NOVA CATEGORIA =====
function salvarNovaCategoria() {
    const nome = document.getElementById('novaCategoriaNome').value.trim();
    if (!nome) {
        showToast('⚠️ Informe o nome da categoria', 'warning');
        return;
    }
    
    if (categoriasCustomizadas[nome]) {
        showToast(`⚠️ A categoria "${nome}" já existe`, 'warning');
        return;
    }
    
    const categoriasPadrao = ['Eixos', 'Parafusos', 'Rolamentos', 'Raios', 'Arruelas', 'Porcas', 'CapacetesEPartes', 'outros'];
    if (categoriasPadrao.includes(nome)) {
        showToast(`⚠️ "${nome}" é uma categoria padrão do sistema`, 'warning');
        return;
    }
    
    const container = document.getElementById('novaCategoriaCampos');
    const campos = [];
    const camposDinamicos = container.querySelectorAll('.campo-dinamico:not(.campo-mlb-codes)');
    let temCampoValido = false;
    
    for (const div of camposDinamicos) {
        const nomeCampo = div.querySelector('.campo-nome')?.value?.trim();
        const label = div.querySelector('.campo-label')?.value?.trim();
        const tipo = div.querySelector('.campo-tipo')?.value || 'text';
        const obrigatorio = div.querySelector('.campo-obrigatorio')?.value === 'true';
        const placeholder = div.querySelector('.campo-placeholder')?.value?.trim() || '';
        const validacao = div.querySelector('.campo-validacao')?.value || '';
        const rows = parseInt(div.querySelector('.campo-rows')?.value) || 2;
        
        let opcoes = [];
        if (tipo === 'select') {
            const opcoesInput = div.querySelector('.campo-opcoes');
            if (opcoesInput) {
                opcoes = opcoesInput.value.split(',').map(s => s.trim()).filter(s => s);
            }
            if (opcoes.length === 0) {
                showToast(`⚠️ O campo "${label}" precisa de opções`, 'warning');
                return;
            }
        }
        
        if (!nomeCampo || !label) {
            showToast('⚠️ Todos os campos precisam de Nome e Label', 'warning');
            return;
        }
        
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nomeCampo)) {
            showToast(`⚠️ O nome "${nomeCampo}" deve conter apenas letras, números e underline`, 'warning');
            return;
        }
        
        temCampoValido = true;
        const campo = { nome: nomeCampo, label, tipo, obrigatorio, placeholder, validacao };
        if (tipo === 'select') campo.opcoes = opcoes;
        if (tipo === 'textarea') campo.rows = rows;
        if (tipo === 'number') { campo.step = '0.01'; campo.min = '0'; }
        campos.push(campo);
    }
    
    if (!temCampoValido) {
        showToast('⚠️ Adicione pelo menos um campo personalizado', 'warning');
        return;
    }
    
    campos.push({
        nome: 'mlb_codes',
        label: 'Códigos MLB',
        tipo: 'textarea',
        placeholder: 'MLB separados por vírgula',
        obrigatorio: false,
        rows: 2
    });
    
    categoriasCustomizadas[nome] = {
        campos: campos,
        criado_por: currentUser?.name || 'sistema',
        criado_em: new Date().toISOString()
    };

    // ===== ADICIONAR REGRAS PADRÃO PARA A NOVA CATEGORIA =====
    if (!regrasEstoqueAtuais[nome]) {
        regrasEstoqueAtuais[nome] = {
            condicoes: [
                { operador: 'padrao', estoque_maximo: 30 }
            ]
        };
        salvarRegrasEstoque(regrasEstoqueAtuais);
    }
    
    salvarCategoriasCustomizadas();
    fecharModalCriarCategoria();
    atualizarSelectCategorias();
    preencherListaCategorias();
    
    showToast(`✅ Categoria "${nome}" criada com ${campos.length} campos!`, 'success');
}

// ===== EDITAR CATEGORIA EXISTENTE =====
function editarCategoriaCustomizada(nome) {
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    
    if (!isAdmin) {
        showToast('⚠️ Apenas administradores podem editar categorias.', 'warning');
        return;
    }
    
    if (!categoriasCustomizadas[nome]) {
        showToast('⚠️ Categoria não encontrada', 'error');
        return;
    }
    
    abrirModalCriarCategoria();
    document.getElementById('novaCategoriaNome').value = nome;
    document.getElementById('novaCategoriaNome').disabled = true;
    
    const container = document.getElementById('novaCategoriaCampos');
    container.innerHTML = '';
    adicionarCampoPadraoMLB();
    
    const campos = categoriasCustomizadas[nome].campos || [];
    campos.forEach(campo => {
        if (campo.nome === 'mlb_codes') return;
        adicionarCampoDinamico(campo);
    });
    
    const btn = document.querySelector('#modalCriarCategoria .btn-success');
    if (btn) {
        btn.textContent = 'Atualizar Categoria';
        btn.onclick = function() {
            atualizarCategoriaExistente(nome);
        };
    }
}

// ===== ATUALIZAR CATEGORIA EXISTENTE =====
function atualizarCategoriaExistente(nomeAntigo) {
    const nome = document.getElementById('novaCategoriaNome').value.trim();
    if (!nome) {
        showToast('⚠️ Informe o nome da categoria', 'warning');
        return;
    }
    
    const container = document.getElementById('novaCategoriaCampos');
    const campos = [];
    const camposDinamicos = container.querySelectorAll('.campo-dinamico:not(.campo-mlb-codes)');
    let temCampoValido = false;
    
    for (const div of camposDinamicos) {
        const nomeCampo = div.querySelector('.campo-nome')?.value?.trim();
        const label = div.querySelector('.campo-label')?.value?.trim();
        const tipo = div.querySelector('.campo-tipo')?.value || 'text';
        const obrigatorio = div.querySelector('.campo-obrigatorio')?.value === 'true';
        const placeholder = div.querySelector('.campo-placeholder')?.value?.trim() || '';
        const validacao = div.querySelector('.campo-validacao')?.value || '';
        const rows = parseInt(div.querySelector('.campo-rows')?.value) || 2;
        
        let opcoes = [];
        if (tipo === 'select') {
            const opcoesInput = div.querySelector('.campo-opcoes');
            if (opcoesInput) {
                opcoes = opcoesInput.value.split(',').map(s => s.trim()).filter(s => s);
            }
            if (opcoes.length === 0) {
                showToast(`⚠️ O campo "${label}" precisa de opções`, 'warning');
                return;
            }
        }
        
        if (!nomeCampo || !label) {
            showToast('⚠️ Todos os campos precisam de Nome e Label', 'warning');
            return;
        }
        
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(nomeCampo)) {
            showToast(`⚠️ O nome "${nomeCampo}" deve conter apenas letras, números e underline`, 'warning');
            return;
        }
        
        temCampoValido = true;
        const campo = { nome: nomeCampo, label, tipo, obrigatorio, placeholder, validacao };
        if (tipo === 'select') campo.opcoes = opcoes;
        if (tipo === 'textarea') campo.rows = rows;
        if (tipo === 'number') { campo.step = '0.01'; campo.min = '0'; }
        campos.push(campo);
    }
    
    if (!temCampoValido) {
        showToast('⚠️ Adicione pelo menos um campo personalizado', 'warning');
        return;
    }
    
    campos.push({
        nome: 'mlb_codes',
        label: 'Códigos MLB',
        tipo: 'textarea',
        placeholder: 'MLB separados por vírgula',
        obrigatorio: false,
        rows: 2
    });
    
    if (nome !== nomeAntigo) {
        if (categoriasCustomizadas[nome]) {
            showToast(`⚠️ Já existe uma categoria com o nome "${nome}"`, 'warning');
            return;
        }
        categoriasCustomizadas[nome] = {
            ...categoriasCustomizadas[nomeAntigo],
            campos: campos,
            atualizado_em: new Date().toISOString(),
            atualizado_por: currentUser?.name || 'sistema'
        };
        delete categoriasCustomizadas[nomeAntigo];
    } else {
        categoriasCustomizadas[nome] = {
            ...categoriasCustomizadas[nome],
            campos: campos,
            atualizado_em: new Date().toISOString(),
            atualizado_por: currentUser?.name || 'sistema'
        };
    }
    
    salvarCategoriasCustomizadas();
    fecharModalCriarCategoria();
    atualizarSelectCategorias();
    preencherListaCategorias();
    
    const btn = document.querySelector('#modalCriarCategoria .btn-success');
    if (btn) {
        btn.textContent = 'Criar Categoria';
        btn.onclick = salvarNovaCategoria;
    }
    document.getElementById('novaCategoriaNome').disabled = false;
    
    showToast(`✅ Categoria "${nome}" atualizada!`, 'success');
}

// =========================================================
// ADICIONAR BOTÃO NO MODAL DE CATEGORIAS EXISTENTE
// =========================================================

// Esta função modifica o modal de categorias existente para adicionar o botão "Criar Nova Categoria"
function adicionarBotaoNoModalCategorias() {
    const modal = document.getElementById('modalCategorias');
    if (!modal) return;
    
    const footer = modal.querySelector('.modal-content > div:last-child');
    if (!footer) return;
    
    if (footer.querySelector('.btn-criar-categoria-modal')) return;
    
    const btn = document.createElement('button');
    btn.className = 'btn btn-purple btn-criar-categoria-modal';
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Nova Categoria';
    btn.onclick = function() {
        fecharModalCategorias();
        setTimeout(abrirModalCriarCategoria, 300);
    };
    
    const fecharBtn = footer.querySelector('.btn-secondary');
    if (fecharBtn) {
        footer.insertBefore(btn, fecharBtn);
    } else {
        footer.appendChild(btn);
    }
}

window.abrirModalCriarCategoria = abrirModalCriarCategoria;
window.salvarNovaCategoria = salvarNovaCategoria;
window.editarCategoriaCustomizada = editarCategoriaCustomizada;
window.fecharModalCriarCategoria = fecharModalCriarCategoria;
window.adicionarCampoDinamico = adicionarCampoDinamico;
window.removerCampoDinamico = removerCampoDinamico;
window.toggleOpcoesCampo = toggleOpcoesCampo;
window.adicionarBotaoCriarCategoria = adicionarBotaoCriarCategoria;

// =========================================================
// GERENCIAR CATEGORIAS - MODAL COM LISTA PARA EDIÇÃO
// =========================================================

// ===== ABRIR MODAL GERENCIAR CATEGORIAS =====
function abrirModalGerenciarCategorias() {
    console.log('📂 [abrirModalGerenciarCategorias] Abrindo modal...');
    
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    
    if (!isAdmin) {
        showToast('⚠️ Apenas administradores podem gerenciar categorias.', 'warning');
        return;
    }
    
    let modal = document.getElementById('modalGerenciarCategorias');
    if (!modal) {
        modal = criarModalGerenciarCategorias();
    }
    
    // Preencher a lista
    preencherListaCategoriasGerenciamento();
    
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

// ===== CRIAR MODAL GERENCIAR CATEGORIAS =====
function criarModalGerenciarCategorias() {
    const modal = document.createElement('div');
    modal.id = 'modalGerenciarCategorias';
    modal.className = 'modal hidden';
    modal.style.cssText = 'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999;';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; background: white; padding: 0; border-radius: 12px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column;">
            <!-- Cabeçalho -->
            <div style="background: linear-gradient(135deg, #6f42c1, #4B0082); color: white; padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                <div>
                    <h3 style="margin: 0; font-size: 20px;">
                        <i class="fas fa-tags"></i> Gerenciar Categorias
                    </h3>
                    <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">
                        Gerencie as categorias do sistema. Categorias customizadas podem ser editadas ou excluídas.
                    </p>
                </div>
                <button onclick="fecharModalGerenciarCategorias()" style="background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; color: white; font-size: 20px; display: flex; align-items: center; justify-content: center;">
                    &times;
                </button>
            </div>
            
            <!-- Corpo -->
            <div style="padding: 20px; overflow-y: auto; flex: 1; max-height: 60vh;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <span class="badge badge-info" id="contadorCategoriasModal">0 categorias</span>
                    </div>
                    <button class="btn btn-sm btn-purple" onclick="fecharModalGerenciarCategorias(); setTimeout(abrirModalCriarCategoria, 300);">
                        <i class="fas fa-plus-circle"></i> Criar Nova Categoria
                    </button>
                </div>
                
                <div id="listaCategoriasGerenciamento" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px;">
                    <!-- Lista será preenchida dinamicamente -->
                    <div style="text-align: center; padding: 40px; color: #6c757d; grid-column: 1 / -1;">
                        <i class="fas fa-spinner fa-spin"></i> Carregando categorias...
                    </div>
                </div>
            </div>
            
            <!-- Rodapé -->
            <div style="background: #f8f9fa; padding: 15px 25px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
                <button class="btn btn-secondary" onclick="fecharModalGerenciarCategorias()">Fechar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    return modal;
}

// ===== FECHAR MODAL GERENCIAR CATEGORIAS =====
function fecharModalGerenciarCategorias() {
    const modal = document.getElementById('modalGerenciarCategorias');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

// ===== PREENCHER LISTA DE CATEGORIAS NO MODAL =====
function preencherListaCategoriasGerenciamento() {
    const container = document.getElementById('listaCategoriasGerenciamento');
    if (!container) return;
    
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    
    const todasCategorias = {
        ...camposPorCategoria,
        ...categoriasCustomizadas
    };
    
    const categoriasParaExibir = Object.keys(todasCategorias).filter(c => c !== 'outros');
    
    // Atualizar contador
    const contador = document.getElementById('contadorCategoriasModal');
    if (contador) contador.textContent = `${categoriasParaExibir.length} categorias`;
    
    if (categoriasParaExibir.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d; grid-column: 1 / -1;">
                <i class="fas fa-tags fa-3x mb-3" style="opacity: 0.3;"></i>
                <p>Nenhuma categoria cadastrada.</p>
                <button class="btn btn-purple" onclick="fecharModalGerenciarCategorias(); setTimeout(abrirModalCriarCategoria, 300);">
                    <i class="fas fa-plus-circle"></i> Criar primeira categoria
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    
    categoriasParaExibir.forEach(nome => {
        const isCustom = !!categoriasCustomizadas[nome];
        const campos = getCamposPorCategoria(nome);
        const numCampos = campos ? campos.length : 0;
        const criadoPor = categoriasCustomizadas[nome]?.criado_por || 'Sistema';
        const criadoEm = categoriasCustomizadas[nome]?.criado_em ? new Date(categoriasCustomizadas[nome].criado_em).toLocaleDateString() : '-';
        const atualizadoPor = categoriasCustomizadas[nome]?.atualizado_por || '-';
        
        // Lista de campos
        const listaCampos = campos ? campos.map(c => 
            `<span style="background: #e9ecef; padding: 2px 8px; border-radius: 4px; font-size: 10px; margin: 2px;">${c.label}${c.obrigatorio ? ' *' : ''}</span>`
        ).join(' ') : '';
        
        html += `
            <div style="border: 1px solid ${isCustom ? '#6f42c1' : '#dee2e6'}; 
                        border-radius: 10px; 
                        padding: 15px; 
                        background: ${isCustom ? '#f8f0ff' : 'white'};
                        transition: all 0.3s;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                
                <!-- Cabeçalho do card -->
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 16px; display: flex; align-items: center; gap: 8px;">
                            ${nome}
                            ${isCustom ? '<span style="background: #6f42c1; color: white; font-size: 9px; padding: 2px 10px; border-radius: 12px;">Customizada</span>' : '<span style="background: #6c757d; color: white; font-size: 9px; padding: 2px 10px; border-radius: 12px;">Padrão</span>'}
                        </div>
                    </div>
                    ${isCustom && isAdmin ? `
                        <div style="display: flex; gap: 5px; flex-shrink: 0; margin-left: 10px;">
                            <button class="btn btn-sm" style="background: #6f42c1; color: white; font-size: 11px; padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;" 
                                    onclick="editarCategoriaCustomizada('${nome}')" title="Editar categoria">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn btn-sm" style="background: #dc3545; color: white; font-size: 11px; padding: 4px 12px; border: none; border-radius: 4px; cursor: pointer;" 
                                    onclick="excluirCategoriaCustomizada('${nome}')" title="Excluir categoria">
                                <i class="fas fa-trash"></i> Excluir
                            </button>
                        </div>
                    ` : ''}
                </div>
                
                <!-- Informações -->
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 8px;">
                    <span>📋 ${numCampos} campo(s)</span>
                    ${isCustom ? `• 👤 ${criadoPor} • 📅 ${criadoEm}` : ''}
                    ${isCustom && atualizadoPor !== '-' ? `• ✏️ ${atualizadoPor}` : ''}
                </div>
                
                <!-- Lista de campos -->
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px;">
                    ${listaCampos || '<span style="color: #6c757d; font-size: 12px;">Nenhum campo definido</span>'}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// =========================================================
// SOBRESCREVER FUNÇÕES PARA ATUALIZAR O MODAL
// =========================================================

// Guardar referência da função original
const _salvarCategoriasCustomizadasOriginal = salvarCategoriasCustomizadas;

// Sobrescrever para atualizar o modal também
salvarCategoriasCustomizadas = async function() {
    await _salvarCategoriasCustomizadasOriginal();
    // Se o modal estiver aberto, atualizar a lista
    const modal = document.getElementById('modalGerenciarCategorias');
    if (modal && modal.style.display === 'flex') {
        preencherListaCategoriasGerenciamento();
    }
};

// Guardar referência da função original de exclusão
const _excluirCategoriaCustomizadaOriginal = excluirCategoriaCustomizada;

// Sobrescrever para atualizar o modal também
excluirCategoriaCustomizada = function(nome) {
    _excluirCategoriaCustomizadaOriginal(nome);
    // Se o modal estiver aberto, atualizar a lista
    const modal = document.getElementById('modalGerenciarCategorias');
    if (modal && modal.style.display === 'flex') {
        setTimeout(preencherListaCategoriasGerenciamento, 500);
    }
};

// =========================================================
// EXPORTAR FUNÇÕES GLOBAIS
// =========================================================

window.abrirModalGerenciarCategorias = abrirModalGerenciarCategorias;
window.fecharModalGerenciarCategorias = fecharModalGerenciarCategorias;
window.preencherListaCategoriasGerenciamento = preencherListaCategoriasGerenciamento;

// =========================================================
// ATUALIZAR CATEGORIAS NO MODAL DE REGRAS
// =========================================================

// ===== FUNÇÃO PARA ATUALIZAR O SELECT DE CATEGORIAS NO MODAL DE REGRAS =====
function atualizarCategoriasNoModalRegras() {
    console.log('🔄 [atualizarCategoriasNoModalRegras] Atualizando categorias no modal de regras...');
    
    const container = document.getElementById('regrasEstoqueContainer');
    if (!container) return;
    
    // Verificar se o modal de regras está aberto
    const modal = document.getElementById('modalRegrasEstoque');
    if (!modal || modal.style.display !== 'flex') return;
    
    // Recarregar o conteúdo do modal de regras
    preencherModalRegras();
    console.log('✅ Modal de regras atualizado com novas categorias!');
}

// ===== SOBRESCREVER FUNÇÃO DE SALVAR CATEGORIAS =====
// Guardar referência da função original de salvar categorias
const _salvarCategoriasCustomizadasRegras = salvarCategoriasCustomizadas;

// Sobrescrever para atualizar o modal de regras também
salvarCategoriasCustomizadas = async function() {
    await _salvarCategoriasCustomizadasRegras();
    
    // Atualizar select de categorias
    atualizarSelectCategorias();
    
    // Atualizar lista no modal de gerenciamento
    const modalGerenciar = document.getElementById('modalGerenciarCategorias');
    if (modalGerenciar && modalGerenciar.style.display === 'flex') {
        preencherListaCategoriasGerenciamento();
    }
    
    // Atualizar modal de regras se estiver aberto
    const modalRegras = document.getElementById('modalRegrasEstoque');
    if (modalRegras && modalRegras.style.display === 'flex') {
        preencherModalRegras();
    }
};

// ===== SOBRESCREVER FUNÇÃO DE EXCLUIR CATEGORIA =====
const _excluirCategoriaCustomizadaRegras = excluirCategoriaCustomizada;

excluirCategoriaCustomizada = function(nome) {
    _excluirCategoriaCustomizadaRegras(nome);
    
    // Atualizar select de categorias
    atualizarSelectCategorias();
    
    // Atualizar lista no modal de gerenciamento
    const modalGerenciar = document.getElementById('modalGerenciarCategorias');
    if (modalGerenciar && modalGerenciar.style.display === 'flex') {
        setTimeout(preencherListaCategoriasGerenciamento, 500);
    }
    
    // Atualizar modal de regras se estiver aberto
    const modalRegras = document.getElementById('modalRegrasEstoque');
    if (modalRegras && modalRegras.style.display === 'flex') {
        setTimeout(preencherModalRegras, 500);
    }
};

// =========================================================
// FUNÇÃO PARA ABRIR MODAL DE REGRAS (ATUALIZADA)
// =========================================================

// Guardar referência da função original
const _abrirModalRegrasEstoqueOriginal = abrirModalRegrasEstoque;

// Sobrescrever para garantir que as categorias estejam atualizadas
abrirModalRegrasEstoque = function() {
    // Chamar a função original
    _abrirModalRegrasEstoqueOriginal();
    
    // Garantir que o modal seja preenchido com as categorias mais recentes
    setTimeout(() => {
        const modal = document.getElementById('modalRegrasEstoque');
        if (modal && modal.style.display === 'flex') {
            preencherModalRegras();
        }
    }, 200);
};

// =========================================================
// EXPORTAR FUNÇÕES
// =========================================================

window.atualizarCategoriasNoModalRegras = atualizarCategoriasNoModalRegras;
window.preencherModalRegras = preencherModalRegras;

// =========================================================
// INICIALIZAR REGRAS PARA CATEGORIAS CUSTOMIZADAS
// =========================================================

function inicializarRegrasCategoriasCustomizadas() {
    console.log('🔄 Inicializando regras para categorias customizadas...');
    
    const categoriasCustom = Object.keys(categoriasCustomizadas);
    let alterado = false;
    
    categoriasCustom.forEach(cat => {
        if (!regrasEstoqueAtuais[cat]) {
            regrasEstoqueAtuais[cat] = {
                condicoes: [
                    { operador: 'padrao', estoque_maximo: 30 }
                ]
            };
            alterado = true;
            console.log(`✅ Regras padrão criadas para categoria: ${cat}`);
        } else {
            // Verificar se tem condição padrão
            const temPadrao = regrasEstoqueAtuais[cat].condicoes.some(c => c.operador === 'padrao');
            if (!temPadrao) {
                regrasEstoqueAtuais[cat].condicoes.push({ operador: 'padrao', estoque_maximo: 30 });
                alterado = true;
                console.log(`✅ Condição padrão adicionada para: ${cat}`);
            }
        }
    });
    
    if (alterado) {
        // Salvar automaticamente
        salvarRegrasEstoque(regrasEstoqueAtuais);
        console.log('✅ Regras de categorias customizadas inicializadas!');
    }
}

// =========================================================
// SOBRESCREVER FUNÇÃO DE CARREGAR CATEGORIAS
// =========================================================

// Guardar referência da função original
const _carregarCategoriasCustomizadasOriginal = carregarCategoriasCustomizadas;

// Sobrescrever para inicializar regras após carregar
carregarCategoriasCustomizadas = async function() {
    await _carregarCategoriasCustomizadasOriginal();
    
    // Inicializar regras para categorias customizadas
    setTimeout(inicializarRegrasCategoriasCustomizadas, 500);
};

console.log('📦 Gestão de Estoque carregada com sucesso! (Versão completa com categorias customizadas)');