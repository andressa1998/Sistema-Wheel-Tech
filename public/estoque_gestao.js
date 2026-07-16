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

// Estrutura padrão das regras por categoria
// Cada categoria pode ter múltiplas condições
const regrasEstoquePadrao = {
    'Eixos': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 10 },
            { operador: 'padrao', estoque_maximo: 50 }
        ]
    },
    'Parafusos': {
        condicoes: [
            { operador: 'maior_que', valor: 80, estoque_maximo: 15 },
            { operador: 'padrao', estoque_maximo: 30 }
        ]
    },
    'Rolamentos': {
        condicoes: [
            { operador: 'maior_que', valor: 150, estoque_maximo: 10 },
            { operador: 'padrao', estoque_maximo: 40 }
        ]
    },
    'Raios': {
        condicoes: [
            { operador: 'maior_que', valor: 200, estoque_maximo: 20 },
            { operador: 'padrao', estoque_maximo: 60 }
        ]
    },
    'Arruelas': {
        condicoes: [
            { operador: 'maior_que', valor: 50, estoque_maximo: 20 },
            { operador: 'padrao', estoque_maximo: 50 }
        ]
    },
    'Porcas': {
        condicoes: [
            { operador: 'maior_que', valor: 50, estoque_maximo: 20 },
            { operador: 'padrao', estoque_maximo: 50 }
        ]
    },
    'outros': {
        condicoes: [
            { operador: 'maior_que', valor: 100, estoque_maximo: 15 },
            { operador: 'padrao', estoque_maximo: 30 }
        ]
    }
};

let regrasEstoqueAtuais = {};

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
    outros: [
        { nome: "observacoes_adicionais", label: "Observações", tipo: "textarea", rows: 2 },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ]
};

// Mapeamento de modelos disponíveis por marca (para a categoria Raios)
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

// Regras de limite de KITS por marca (categoria Raios)
const regrasRaiosPorMarca = {
    "Sapim|Laser": { max_kits: 2 },
    "Sapim|Leader": { max_kits: 2 },
    "Sapim|Cx-Ray": {max_kits: 10},
    "Sapim|Race": {max_kits: 10},
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
    "VeloForce": {max_kits: 10},
    "Zincado": { max_kits: 2 },
    "Titânio": { max_kits: 2 },
    "T-Head": { max_kits: 10 }
};

// ===== ABRIR SISTEMA =====
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
};

// ===== CARREGAR PRODUTOS DO SUPABASE =====
async function carregarProdutosEstoque() {
    try {
        if (!window.supabaseClient) throw new Error('Supabase não inicializado');
        const { data, error } = await window.supabaseClient
            .from('produtos_estoque')
            .select('*')
            .order('nome', { ascending: true });
        if (error) throw error;
        produtosEstoque = data || [];
        produtosFiltradosAtuais = produtosEstoque;
        paginaAtualEstoque = 1;
        renderizarTabelaProdutos();
        console.log(`✅ ${produtosEstoque.length} produtos carregados`);
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        if (window.showToast) showToast('Erro ao carregar produtos', 'error');
        const tbody = document.getElementById('produtosEstoqueBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-danger">Erro ao carregar produtos. Consulte o console.</td></tr>';
    }
}

// ===== FILTRAR PRODUTOS (COM CATEGORIA) =====
function filtrarProdutosEstoque() {
    const termo = document.getElementById('buscaEstoqueInput').value.toLowerCase().trim();
    const categoriaSelecionada = document.getElementById('filtroCategoriaEstoque')?.value || '';

    let filtrados = produtosEstoque;

    if (categoriaSelecionada && categoriaSelecionada !== '') {
        filtrados = filtrados.filter(prod => prod.categoria === categoriaSelecionada);
    }

    if (termo) {
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
    paginaAtualEstoque = 1;
    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

// ===== FUNÇÃO PARA ORDENAR POR COLUNA =====
function ordenarEstoquePor(coluna) {
    if (ordemColunaEstoque.coluna === coluna) {
        ordemColunaEstoque.direcao = ordemColunaEstoque.direcao === 'asc' ? 'desc' : 'asc';
    } else {
        ordemColunaEstoque.coluna = coluna;
        ordemColunaEstoque.direcao = 'asc';
    }
    
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

function obterRegraRaios(marca, modelo) {
    const chaveExata = `${marca}|${modelo}`;
    if (regrasRaiosPorMarca[chaveExata]) return regrasRaiosPorMarca[chaveExata];
    if (regrasRaiosPorMarca[marca]) return regrasRaiosPorMarca[marca];
    const chaveCoringa = `${marca}|*`;
    if (regrasRaiosPorMarca[chaveCoringa]) return regrasRaiosPorMarca[chaveCoringa];
    return null;
}

async function verHistoricoMovimentacoes(produtoId) {
    const produto = produtosEstoque.find(p => p.id == produtoId);
    if (!produto) return;
    const { data, error } = await window.supabaseClient
        .from('estoque_movimentacoes')
        .select('*')
        .eq('produto_id', produtoId)
        .order('data_hora', { ascending: false });
    if (error) {
        console.error(error);
        showToast('Erro ao carregar histórico', 'error');
        return;
    }
    if (!data || data.length === 0) {
        showToast(`Nenhuma movimentação registrada para ${produto.nome}`, 'warning');
        return;
    }
    let html = `
        <div style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
            <h4>Histórico de movimentações - ${escapeHtml(produto.nome)}</h4>
            <table class="table table-sm">
                <thead>
                    <tr><th>Data/Hora</th><th>Tipo</th><th>Quantidade</th><th>Nº Documento</th><th>Tipo Entrada</th><th>Usuário</th></tr>
                </thead>
                <tbody>
    `;
    data.forEach(mov => {
        const dataHora = new Date(mov.data_hora).toLocaleString('pt-BR');
        const tipoMov = mov.tipo === 'entrada' ? '➕ Entrada' : '➖ Saída';
        const tipoEntrada = mov.tipo_entrada === 'nova' ? 'Nova' : (mov.tipo_entrada === 'devolucao' ? 'Devolução' : '-');
        html += `<tr>
            <td>${dataHora}</td>
            <td>${tipoMov}</td>
            <td>${mov.quantidade}</td>
            <td>${mov.numero_documento || '-'}</td>
            <td>${tipoEntrada}</td>
            <td>${mov.usuario}</td>
        </tr>`;
    });
    html += `</tbody></table></div>`;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = 'display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); z-index: 2000;';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 90%; max-height: 90%; overflow: auto;">
            <div style="display: flex; justify-content: space-between;">
                <h3>Histórico de movimentações</h3>
                <button onclick="this.closest('.modal').remove()" style="background:none; border:none; font-size:24px;">&times;</button>
            </div>
            ${html}
        </div>
    `;
    document.body.appendChild(modal);
}

// ===== RENDERIZAR TABELA DE PRODUTOS =====
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

    // ===== VERIFICAÇÃO DE USUÁRIOS =====
    const username = currentUser?.username?.toLowerCase() || '';
    const isAdmin = usuariosAdmin.includes(username);
    const podeModificarSync = usuariosAutorizadosSync.includes(username) || isAdmin;
    const podeVerCusto = usuariosVerCusto.includes(username) || isAdmin;

    // ===== ORDENAR PRODUTOS =====
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

    // Atualizar o cabeçalho da tabela com os ícones de ordenação
    const thead = document.querySelector('#produtosEstoqueTable thead tr');
    if (thead) {
        let headerHtml = `
            <th data-coluna="id" style="cursor: pointer;" onclick="ordenarEstoquePor('id')">
                ID <i class="fas fa-sort ordenacao-icon" style="font-size: 11px; margin-left: 5px; color: ${coluna === 'id' ? '#00ADEE' : '#adb5bd'};"></i>
            </th>
            <th data-coluna="nome" style="cursor: pointer;" onclick="ordenarEstoquePor('nome')">
                Nome / Categoria <i class="fas fa-sort ordenacao-icon" style="font-size: 11px; margin-left: 5px; color: ${coluna === 'nome' ? '#00ADEE' : '#adb5bd'};"></i>
            </th>
            <th data-coluna="sku" style="cursor: pointer;" onclick="ordenarEstoquePor('sku')">
                SKU <i class="fas fa-sort ordenacao-icon" style="font-size: 11px; margin-left: 5px; color: ${coluna === 'sku' ? '#00ADEE' : '#adb5bd'};"></i>
            </th>
            <th data-coluna="quantidade" style="cursor: pointer;" onclick="ordenarEstoquePor('quantidade')">
                Quantidade <i class="fas fa-sort ordenacao-icon" style="font-size: 11px; margin-left: 5px; color: ${coluna === 'quantidade' ? '#00ADEE' : '#adb5bd'};"></i>
            </th>
        `;
        if (podeVerCusto) {
            headerHtml += `
                <th data-coluna="preco_custo" style="cursor: pointer;" onclick="ordenarEstoquePor('preco_custo')">
                    Último Custo <i class="fas fa-sort ordenacao-icon" style="font-size: 11px; margin-left: 5px; color: ${coluna === 'preco_custo' ? '#00ADEE' : '#adb5bd'};"></i>
                </th>
                <th data-coluna="preco_medio" style="cursor: pointer;" onclick="ordenarEstoquePor('preco_medio')">
                    Custo Médio <i class="fas fa-sort ordenacao-icon" style="font-size: 11px; margin-left: 5px; color: ${coluna === 'preco_medio' ? '#00ADEE' : '#adb5bd'};"></i>
                </th>
            `;
        }
        headerHtml += `
            <th>Sync ML</th>
            <th>Atributos</th>
            <th>Ações</th>
        `;
        thead.innerHTML = headerHtml;
    }

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
        
        // ===== VERIFICAR EXCESSO DE ESTOQUE (baseado no preço unitário) =====
        const isExcesso = verificarExcessoEstoque(prod);
        const maximoPermitido = calcularEstoqueMaximo(prod);
        const precoUnitario = prod.preco || 0;
        
        // ===== MONTAR TOOLTIP COM INFORMAÇÕES DA REGRA =====
        let excessoTooltip = '';
        if (isExcesso) {
            excessoTooltip = `Preço: R$ ${precoUnitario.toFixed(2)} | Estoque máximo: ${maximoPermitido} | Atual: ${prod.quantidade}`;
        }
        
        // ===== MONTAR QUANTIDADE COM INDICADORES =====
        let quantidadeHtml = `${prod.quantidade}`;
        if (isExcesso) {
            quantidadeHtml += ` <span class="badge badge-danger" title="${excessoTooltip}"><i class="fas fa-exclamation-triangle"></i> EXCESSO (máx: ${maximoPermitido})</span>`;
        } else if (prod.quantidade <= 5) {
            quantidadeHtml = `<span class="text-danger fw-bold">${prod.quantidade}</span>`;
        }
        
        // ===== DESCRIÇÃO DA REGRA APLICADA =====
        const descricaoRegra = getDescricaoRegra(prod);
        const excessoInfo = isExcesso ? `<br><span class="badge badge-danger mt-1" title="${descricaoRegra}">⚠️ Excesso (máx: ${maximoPermitido})</span>` : '';
        
        // ===== BOTÕES DE AÇÃO =====
        let botoes = `
            <button class="btn btn-sm btn-info" onclick="editarProdutoEstoque(${prod.id})" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-warning" onclick="abrirModalMovimentacaoEstoque(${prod.id}, '${escapeHtml(prod.nome)}')" title="Movimentar"><i class="fas fa-exchange-alt"></i></button>
            <button class="btn btn-sm btn-secondary" onclick="verHistoricoMovimentacoes(${prod.id})" title="Histórico"><i class="fas fa-history"></i></button>
        `;
        
        if (isAdmin) {
            botoes += `<button class="btn btn-sm btn-danger" onclick="excluirProdutoEstoque(${prod.id})" title="Excluir"><i class="fas fa-trash"></i></button>`;
        }
        
        if (temMLB && podeModificarSync) {
            botoes += `<button class="btn btn-sm btn-primary" onclick="sincronizarProdutoML(${prod.id})" title="Sincronizar estoque com ML"><i class="fab fa-mercadolibre"></i></button>`;
        } else if (temMLB && !podeModificarSync) {
            botoes += `<button class="btn btn-sm btn-secondary" disabled title="Apenas administradores podem sincronizar"><i class="fab fa-mercadolibre"></i></button>`;
        }
        
        let rowHtml = `
            <td>${prod.id}</td>
            <td><strong>${escapeHtml(prod.nome)}</strong><br><small class="text-muted">${escapeHtml(prod.categoria || 'sem categoria')}</small></td>
            <td>${escapeHtml(prod.sku)}</td>
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

function atualizarPaginacaoEstoque(totalItens) {
    const paginationContainer = document.getElementById('paginacaoEstoque');
    if (!paginationContainer) {
        console.error('❌ #paginacaoEstoque não encontrado');
        return;
    }
    
    console.log('🔍 [atualizarPaginacaoEstoque] Total de itens:', totalItens);
    console.log('🔍 [atualizarPaginacaoEstoque] Itens por página:', itensPorPaginaEstoque);
    console.log('🔍 [atualizarPaginacaoEstoque] Página atual:', paginaAtualEstoque);
    
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
    
    console.log(`📊 Página ${paginaAtualEstoque} de ${totalPaginas}, mostrando ${inicio}-${fim}`);
    
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
    console.log('✅ Paginação renderizada com sucesso!');
}

function irParaPaginaEstoque(pagina) {
    const totalPaginas = Math.ceil(produtosFiltradosAtuais.length / itensPorPaginaEstoque);
    if (pagina < 1 || pagina > totalPaginas) return;
    paginaAtualEstoque = pagina;
    renderizarTabelaProdutos(produtosFiltradosAtuais);
    const tableContainer = document.querySelector('.card.mb-4');
    if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function alterarItensPorPaginaEstoque(valor) {
    itensPorPaginaEstoque = parseInt(valor);
    paginaAtualEstoque = 1;
    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

// Função para atualizar a lista após filtro
function atualizarListaEstoque() {
    const termo = document.getElementById('buscaEstoqueInput').value.toLowerCase().trim();
    const categoriaSelecionada = document.getElementById('filtroCategoriaEstoque')?.value || '';

    let filtrados = produtosEstoque;

    if (categoriaSelecionada && categoriaSelecionada !== '') {
        filtrados = filtrados.filter(prod => prod.categoria === categoriaSelecionada);
    }

    if (termo) {
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
    paginaAtualEstoque = 1;
    renderizarTabelaProdutos(produtosFiltradosAtuais);
}

async function registrarMovimentacao(produtoId, tipo, quantidade, numeroDocumento, tipoEntrada = null) {
    const numero = await gerarNumeroMovimentacao();
    const usuario = (typeof currentUser !== 'undefined' && currentUser?.name) 
                ? currentUser.name 
                : localStorage.getItem('userName') || 'sistema';
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
            data_hora: new Date().toISOString()
        }]);
    if (error) {
        console.error('❌ Erro ao registrar movimentação:', error);
        if (window.showToast) showToast('Erro ao registrar movimentação', 'error');
    } else {
        console.log(`✅ Movimentação ${numero} registrada: ${tipo} de ${quantidade}`);
    }
}

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

function configurarBulkModeEvents() {
    const toggleBtn = document.getElementById('toggleBulkModeBtn');
    const panel = document.getElementById('bulkModePanel');
    const addRowBtn = document.getElementById('addBulkRowBtn');
    const tbody = document.getElementById('bulkTamanhosBody');
    const simpleTamanho = document.getElementById('campo_tamanhoraio');
    const simpleQuantidade = document.getElementById('produtoQuantidade');
    const mainSkuField = document.getElementById('produtoSKU');
    const mainSkuContainer = mainSkuField?.closest('.form-group');

    if (!toggleBtn || !panel) return;

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
            panel.style.display = 'block';
            newToggle.innerHTML = '<i class="fas fa-times-circle"></i> Desativar modo múltiplo';
            if (simpleTamanho) simpleTamanho.closest('.campo-dinamico').style.display = 'none';
            if (simpleQuantidade) simpleQuantidade.closest('.form-group').style.display = 'none';
            if (mainSkuContainer) {
                mainSkuContainer.style.display = 'none';
                mainSkuField.required = false;
            }
            if (tbody.children.length === 0) adicionarNovaLinha();
        } else {
            panel.style.display = 'none';
            newToggle.innerHTML = '<i class="fas fa-plus-circle"></i> Ativar modo múltiplo';
            if (simpleTamanho) simpleTamanho.closest('.campo-dinamico').style.display = '';
            if (simpleQuantidade) simpleQuantidade.closest('.form-group').style.display = '';
            if (mainSkuContainer) {
                mainSkuContainer.style.display = '';
                const isEditing = document.getElementById('produtoId').value !== '';
                if (!isEditing) mainSkuField.required = true;
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

function gerarCamposDinamicos(categoria) {
    const container = document.getElementById('camposDinamicos');
    if (!container) return;
    container.innerHTML = '';

    const campos = camposPorCategoria[categoria];
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

    let aplicacaoSelect = null;

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
            if (categoria === 'Rolamentos' && campo.nome === 'aplicaçao') {
                aplicacaoSelect = select;
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
        } else {
            setTimeout(() => {
                const selectAplicacaoRetry = document.getElementById('campo_aplicaçao');
                if (selectAplicacaoRetry) {
                    selectAplicacaoRetry.addEventListener('change', function(e) {
                        toggleAngulos(e.target.value);
                    });
                    toggleAngulos(selectAplicacaoRetry.value);
                }
            }, 500);
        }

        setTimeout(() => {
            ['campo_angulo_interno', 'campo_angulo_externo'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', function() {
                        this.value = this.value.replace(/[^0-9,]/g, '');
                    });
                    el.addEventListener('blur', function() {
                        const val = this.value.trim();
                        if (val !== '' && !/^[0-9]+(,[0-9]+)?$/.test(val)) {
                            showToast('Digite apenas números e vírgula (ex: 45 ou 45,5)', 'warning');
                            this.focus();
                        }
                    });
                }
            });
        }, 300);
    }

    const bulkSection = document.getElementById('bulkAddSection');
    const kitContainer = document.getElementById('kitComposicaoContainer');
    const isEditing = document.getElementById('produtoId').value !== '';
    
    if (kitContainer) {
        kitContainer.style.display = 'block';
        configurarEventosKit();
    }

    if (categoria === 'Raios' && !isEditing) {
        if (bulkSection) bulkSection.style.display = 'block';
        configurarBulkModeEvents();
    } else {
        if (bulkSection) bulkSection.style.display = 'none';
    }
}       

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

document.addEventListener('DOMContentLoaded', () => {
    const autoFillBtn = document.getElementById('autoFillSkusBtn');
    if (autoFillBtn) {
        autoFillBtn.addEventListener('click', function() {
            const skuBase = prompt("Digite o SKU base (ex: RAIOSAPIMLASER):");
            if (!skuBase) return;
            const rows = document.querySelectorAll('#bulkTamanhosBody tr');
            rows.forEach(row => {
                const tamanho = row.querySelector('.bulk-tamanho')?.value;
                const skuInput = row.querySelector('.bulk-sku');
                if (tamanho && skuInput) {
                    skuInput.value = `${skuBase}-${tamanho}`;
                }
            });
            showToast('SKUs gerados automaticamente!', 'success');
        });
    }
});

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

    const dadosExtra = {};
    const campos = camposPorCategoria[categoria] || [];
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

    const bulkPanel = document.getElementById('bulkModePanel');
    const isBulkMode = (categoria === 'Raios' && !id && bulkPanel && bulkPanel.style.display === 'block');

    if (isBulkMode) {
        const rows = document.querySelectorAll('#bulkTamanhosBody tr');
        const bulkItems = [];
        const tamanhosSet = new Set();
        const skusSet = new Set();

        for (let row of rows) {
            const tamanho = row.querySelector('.bulk-tamanho')?.value?.trim();
            const sku = row.querySelector('.bulk-sku')?.value?.trim();
            const quantidade = parseInt(row.querySelector('.bulk-quantidade')?.value) || 0;

            if (!tamanho || !sku) {
                showToast('Todos os tamanhos e SKUs devem ser preenchidos', 'warning');
                return;
            }
            if (tamanhosSet.has(tamanho)) {
                showToast(`Tamanho ${tamanho} duplicado`, 'warning');
                return;
            }
            if (skusSet.has(sku)) {
                showToast(`SKU ${sku} duplicado`, 'warning');
                return;
            }
            tamanhosSet.add(tamanho);
            skusSet.add(sku);
            bulkItems.push({ tamanho, quantidade, sku });
        }

        if (bulkItems.length === 0) {
            showToast('Adicione pelo menos um tamanho', 'warning');
            return;
        }

        if (!confirm(`Criar ${bulkItems.length} produto(s)?`)) return;

        let created = 0;
        let errors = [];

        for (const item of bulkItems) {
            const { data: existing } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id')
                .eq('sku', item.sku)
                .maybeSingle();

            if (existing) {
                errors.push(`${item.sku} (já existe)`);
                continue;
            }

            const produtoDadosExtra = { ...dadosExtra };
            produtoDadosExtra.tamanhoraio = item.tamanho;
            
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
                    await registrarMovimentacao(data[0].id, 'entrada', item.quantidade, 'Criação em massa', 'nova');
                }
            } catch (err) {
                errors.push(`${item.sku}: ${err.message}`);
            }
        }

        if (created > 0) showToast(`✅ ${created} produto(s) criado(s)!`, 'success');
        if (errors.length) showToast(`⚠️ Erros: ${errors.join(', ')}`, 'error');

        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();
        return;
    }

    const sku = document.getElementById('produtoSKU').value.trim();
    if (!sku) {
        showToast('SKU é obrigatório', 'warning');
        return;
    }
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

function encontrarVariacaoPorSKU(item, skuProduto) {
    if (!item.variations || item.variations.length === 0) return null;
    const skuAlvo = (skuProduto || '').toLowerCase().trim();
    const normalizar = (str) => (str || '').toLowerCase().trim().replace(/^0+/, '');
    const skuAlvoNorm = normalizar(skuAlvo);
    for (const v of item.variations) {
        let identificador = extrairSkuDaVariacao(v);
        if (identificador) {
            let idNorm = normalizar(identificador);
            if (/^\d{3}/.test(idNorm)) {
                const semPrefixo = idNorm.replace(/^\d{3}/, '');
                if (semPrefixo === skuAlvoNorm) return v;
            }
            if (idNorm === skuAlvoNorm) return v;
            if (idNorm.includes(skuAlvoNorm) || skuAlvoNorm.includes(idNorm)) return v;
        }
    }
    return null;
}

function extrairSkuDaVariacao(variacao) {
    if (variacao.seller_custom_field) return variacao.seller_custom_field;
    if (variacao.attributes && Array.isArray(variacao.attributes)) {
        const skuAttr = variacao.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
    if (variacao.sku) return variacao.sku;
    return null;
}

function extrairSkuDoItem(item) {
    if (item.seller_custom_field) return item.seller_custom_field;
    if (item.attributes && Array.isArray(item.attributes)) {
        const skuAttr = item.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
    if (item.sku) return item.sku;
    return null;
}

function parseMultiSkuVariation(skuString) {
    if (!skuString || typeof skuString !== 'string') return null;
    
    const partes = skuString.split('.');
    const resultados = [];
    let quantidadeTotalKit = 0;
    
    for (const parte of partes) {
        const match = parte.match(/^(\d{3})/);
        if (!match) continue;
        
        const quantidade = parseInt(match[1], 10);
        if (quantidade === 0) continue;
        
        const tamanhoMatch = parte.match(/\d{3}(?=[A-Z])/);
        let tamanho = null;
        if (tamanhoMatch) {
            tamanho = tamanhoMatch[0];
        } else {
            const grupos = parte.match(/\d{3}/g);
            if (grupos && grupos.length > 0) {
                tamanho = grupos[grupos.length - 1];
            }
        }
        
        if (quantidade && tamanho) {
            resultados.push({
                quantidadePorKit: quantidade,
                tamanho: tamanho.toString()
            });
            quantidadeTotalKit += quantidade;
        }
    }
    
    if (resultados.length === 0) return null;
    
    return {
        partes: resultados,
        quantidadeTotal: quantidadeTotalKit
    };
}

// =========================================================
// MODAL PARA ANÚNCIOS FULL DETECTADOS
// =========================================================

function abrirModalFullDetectados(anunciosFull) {
    console.log('🚀 [abrirModalFullDetectados] INICIANDO');
    console.log('📦 [abrirModalFullDetectados] Anúncios recebidos:', anunciosFull);
    
    fullDetectados = anunciosFull || [];
    fullConfirmados = new Set();
    
    const modal = document.getElementById('modalFullDetectados');
    if (!modal) {
        console.error('❌ [abrirModalFullDetectados] Modal #modalFullDetectados não encontrado');
        showToast('Erro: Modal FULL não encontrado', 'error');
        return;
    }
    console.log('✅ [abrirModalFullDetectados] Modal encontrado');
    
    const lista = document.getElementById('fullDetectadosLista');
    if (!lista) {
        console.error('❌ [abrirModalFullDetectados] #fullDetectadosLista não encontrado');
        return;
    }
    console.log('✅ [abrirModalFullDetectados] Lista encontrada');
    
    if (fullDetectados.length === 0) {
        console.log('ℹ️ [abrirModalFullDetectados] Nenhum anúncio FULL para exibir');
        return;
    }
    
    let html = `
        <div class="alert alert-warning" style="margin-bottom: 15px;">
            <i class="fas fa-exclamation-triangle"></i>
            <strong>Atenção:</strong> Os anúncios abaixo estão em FULL e não puderam ser atualizados automaticamente.
            <br>Você precisa atualizar o estoque manualmente no Mercado Livre e depois confirmar cada um clicando em "OK".
            <br><br>
            <strong>⚠️ O modal só será fechado quando TODOS os anúncios forem confirmados.</strong>
        </div>
        <div class="list-group">
    `;
    
    fullDetectados.forEach((item, index) => {
        const mlb = item.codigo || item.mlb || item.itemId || `MLB-${index}`;
        const link = item.link || `https://www.mercadolivre.com.br/item/${mlb}`;
        const estoque = item.estoque || item.quantidade || '?';
        const nome = item.nome || item.titulo || 'Produto';
        const erro = item.erro || item.error || 'FULL - atualize manualmente';
        
        html += `
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" id="full-item-${index}">
                <div style="flex:1;">
                    <div><strong>${mlb}</strong></div>
                    <div style="font-size: 12px; color: #6c757d;">${nome}</div>
                    <div style="font-size: 12px; color: #6c757d;">Estoque sugerido: ${estoque} unidades</div>
                    <div style="font-size: 11px; color: #dc3545;">${erro}</div>
                    <a href="${link}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-primary mt-1">
                        <i class="fas fa-external-link-alt"></i> Abrir anúncio para modificar
                    </a>
                </div>
                <div style="min-width: 80px; text-align: right;">
                    <button class="btn btn-sm btn-success" onclick="confirmarFullDetectado(${index})" id="btn-confirm-${index}">
                        <i class="fas fa-check"></i> OK
                    </button>
                    <span class="badge badge-success ml-2" id="badge-confirm-${index}" style="display:none;">✅ Confirmado</span>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    lista.innerHTML = html;
    console.log('✅ [abrirModalFullDetectados] HTML renderizado');
    
    // Atualizar barra de progresso
    atualizarProgressoFull();
    
    // Mostrar o modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    console.log('✅ [abrirModalFullDetectados] Modal exibido');
}

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
    if (badge) badge.style.display = 'inline-block';
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

function atualizarProgressoFull() {
    const total = fullDetectados.length;
    const confirmados = fullConfirmados.size;
    const porcentagem = total > 0 ? (confirmados / total) * 100 : 100;
    
    const barra = document.getElementById('fullProgressBar');
    const texto = document.getElementById('fullProgressText');
    
    if (barra) {
        barra.style.width = `${porcentagem}%`;
        if (porcentagem === 100) {
            barra.classList.remove('bg-danger');
            barra.classList.add('bg-success');
        } else {
            barra.classList.remove('bg-success');
            barra.classList.add('bg-danger');
        }
    }
    if (texto) {
        texto.textContent = `${confirmados} de ${total} confirmados`;
        if (confirmados === total && total > 0) {
            texto.innerHTML = '<span style="color: #28a745;">✅ Todos confirmados! Fechando modal em instantes...</span>';
        }
    }
}

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

// ===== EXPORTAR FUNÇÕES PARA USO GLOBAL =====
window.abrirModalFullDetectados = abrirModalFullDetectados;
window.confirmarFullDetectado = confirmarFullDetectado;
window.fecharModalFullDetectados = fecharModalFullDetectados;

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

    const skusFilhos = await carregarSkusKit(skuProduto);
    const isKitPai = skusFilhos && skusFilhos.length > 0;

    if (isKitPai) {
        console.log(`📦 Produto ${skuProduto} é um KIT pai com ${skusFilhos.length} SKUs filhos`);
    }

    for (const codigo of codigos) {
        const itemId = codigo.startsWith('MLB') ? codigo : `MLB${codigo}`;
        const apiUrl = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;

        try {
            console.log(`\n🔍 Obtendo ${itemId}...`);
            const getRes = await fetch(proxyUrl);
            if (!getRes.ok) throw new Error(`GET falhou: ${getRes.status}`);
            const item = await getRes.json();

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

            function calcularQuantidadeComRegras(quantidadeBase, categoria, item, skuProduto, marcaProduto, modeloProduto, produto, isKitPai, skusFilhos, skuAnuncio) {
                let quantidadeFinal = quantidadeBase;
                
                console.log(`📊 [calcularQuantidadeComRegras] Quantidade base: ${quantidadeBase}`);
                console.log(`📊 [calcularQuantidadeComRegras] Categoria: ${categoria}`);
                console.log(`📊 [calcularQuantidadeComRegras] isKitPai: ${isKitPai}`);
                console.log(`📊 [calcularQuantidadeComRegras] SKU do anúncio: ${skuAnuncio}`);
                
                if (isKitPai && skusFilhos && skusFilhos.length > 0) {
                    const kitsDisponiveis = calcularKitsDisponiveis(skusFilhos, produtosEstoque, skuAnuncio);
                    console.log(`📦 Produto é um KIT. Kits disponíveis: ${kitsDisponiveis}`);
                    quantidadeFinal = kitsDisponiveis;
                    console.log(`📊 [calcularQuantidadeComRegras] Após KIT: ${quantidadeFinal}`);
                } else if (skuAnuncio) {
                    const quantidadePorKit = extrairUnidadesPorKit(skuAnuncio);
                    if (quantidadePorKit > 1) {
                        console.log(`📦 Produto NÃO é kit, mas SKU indica venda em quantidade: ${quantidadePorKit}`);
                        quantidadeFinal = Math.floor(quantidadeBase / quantidadePorKit);
                        console.log(`📊 [calcularQuantidadeComRegras] Estoque ajustado para venda em quantidade: ${quantidadeFinal}`);
                    }
                }
                
                let precoAnuncio = 0;
                if (item.variations && item.variations.length > 0) {
                    const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
                    if (variacaoAlvo) precoAnuncio = variacaoAlvo.price || 0;
                    else precoAnuncio = item.price || 0;
                } else {
                    precoAnuncio = item.price || 0;
                }
                
                // ===== APLICA AS REGRAS CONDICIONAIS =====
                const estoqueMaximo = calcularEstoqueMaximo({ 
                    preco: precoAnuncio, 
                    categoria: categoria 
                });
                
                quantidadeFinal = Math.min(quantidadeFinal, estoqueMaximo);
                console.log(`📊 Regra Condicional: preço=R$ ${precoAnuncio}, estoque máximo=${estoqueMaximo}, enviando=${quantidadeFinal}`);
                
                if (categoria === 'Raios') {
                    const regra = obterRegraRaios(marcaProduto, modeloProduto);
                    if (regra && regra.max_kits !== undefined) {
                        quantidadeFinal = Math.min(quantidadeFinal, regra.max_kits);
                        console.log(`🏷️ Regra Raios ${marcaProduto}|${modeloProduto}: limite ${regra.max_kits} kits → enviando ${quantidadeFinal}`);
                    }
                }
                
                return Math.max(0, quantidadeFinal);
            }

            // =========================================================
            // CASO 1: FULL COM CONVIVÊNCIA (Full + Flex)
            // =========================================================
            if (isFulfillment && hasSelfService) {
                console.log(`📦 Item ${itemId} é FULL com CONVIVÊNCIA (Full+Flex)`);
                
                let userProductId = null;
                
                if (item.variations && item.variations.length > 0) {
                    const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
                    if (variacaoAlvo && variacaoAlvo.user_product_id) {
                        userProductId = variacaoAlvo.user_product_id;
                        console.log(`✅ user_product_id da variação: ${userProductId}`);
                    } else {
                        for (const v of item.variations) {
                            if (v.user_product_id) {
                                userProductId = v.user_product_id;
                                console.log(`✅ user_product_id da primeira variação: ${userProductId}`);
                                break;
                            }
                        }
                    }
                } else {
                    userProductId = item.user_product_id;
                    console.log(`✅ user_product_id do item: ${userProductId}`);
                }
                
                if (!userProductId) {
                    console.warn(`⚠️ user_product_id não encontrado para ${itemId}. Pulando.`);
                    results.push({ codigo: itemId, success: false, reason: 'sem_user_product_id' });
                    continue;
                }

                const skuAnuncio = obterSkuAnuncio(item, skuProduto);
                console.log(`🔍 SKU do anúncio encontrado: "${skuAnuncio}"`);

                let quantidadeParaEnviar = calcularQuantidadeComRegras(
                    quantidadeReal, categoria, item, skuProduto, 
                    marcaProduto, modeloProduto, produto, isKitPai, skusFilhos,
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
                    // ===== VERIFICA SE É FULL PURO (erro de não modificável) =====
                    const isFullPuro = resultado.error && (
                        resultado.error.includes('FULL') || 
                        resultado.error.includes('not_modifiable') ||
                        resultado.error.includes('field_not_updatable') ||
                        resultado.tipo === 'full_puro'
                    );
                    
                    results.push({ 
                        codigo: itemId, 
                        success: false, 
                        error: resultado.error,
                        tipo: isFullPuro ? 'full_puro' : 'full_convivio',
                        link: `https://www.mercadolivre.com.br/anuncios/${itemId}/modificar/`,
                        estoque: quantidadeParaEnviar,
                        nome: produto.nome || 'Produto'
                    });
                    
                    // Se for FULL puro, já adicionamos à lista para o modal
                    if (isFullPuro) {
                        console.log(`🔴 [FULL] Item ${itemId} é FULL PURO detectado!`);
                    }
                }

                continue;
            }

            // =========================================================
            // CASO 2: FULL PURO (sem convivência)
            // =========================================================
            if (isFulfillment && !hasSelfService) {
                console.log(`📦 Item ${itemId} é FULL PURO (sem convivência)`);
                console.log(`⚠️ Itens FULL puros NÃO podem ter estoque atualizado via API.`);
                console.log(`ℹ️ Atualize manualmente no Mercado Livre.`);
                
                const skuAnuncio = obterSkuAnuncio(item, skuProduto);
                
                // ===== ADICIONA DIRETAMENTE À LISTA DE FULL =====
                results.push({ 
                    codigo: itemId, 
                    success: false, 
                    error: 'FULL puro - atualize manualmente no ML',
                    tipo: 'full_puro',
                    ignorado: true,
                    sku: skuAnuncio,
                    link: `https://www.mercadolivre.com.br/item/${itemId}`,
                    estoque: quantidadeReal,
                    nome: produto.nome || 'Produto'
                });
                
                console.log(`🔴 [FULL] Item ${itemId} é FULL PURO detectado!`);
                continue;
            }

            // =========================================================
            // CASO 3: ITEM NORMAL (não é FULL)
            // =========================================================
            console.log(`📦 Item ${itemId} é NORMAL (não é FULL).`);

            if (item.tags?.includes('has_price_by_rule')) {
                console.warn(`⚠️ Item ${itemId} tem preço automático.`);
                results.push({ codigo: itemId, success: false, reason: 'oferta_ativa' });
                continue;
            }

            const skuAnuncio = obterSkuAnuncio(item, skuProduto);
            console.log(`🔍 SKU do anúncio encontrado: "${skuAnuncio}"`);

            let quantidadeParaEnviar = calcularQuantidadeComRegras(
                quantidadeReal, categoria, item, skuProduto, 
                marcaProduto, modeloProduto, produto, isKitPai, skusFilhos,
                skuAnuncio
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

    const sucessos = results.filter(r => r.success).length;
    const falhas = results.filter(r => !r.success).length;
    
    if (sucessos) showToast(`✅ ${sucessos} anúncio(s) sincronizado(s)`, 'success');
    if (falhas) showToast(`⚠️ ${falhas} anúncio(s) falharam. Verifique console.`, 'warning');

    // =========================================================
    // COLETAR ANÚNCIOS FULL DETECTADOS PARA MODAL
    // =========================================================
    console.log('🔍 [FULL] Filtrando resultados FULL...');
    console.log('📊 [FULL] Resultados completos:', results);
    
    const fullDetectadosLista = results.filter(r => {
        const isFull = r.tipo === 'full_puro' || 
                       (r.error && (r.error.includes('FULL') || r.error.includes('not_modifiable') || r.error.includes('field_not_updatable')));
        if (isFull) {
            console.log(`🔴 [FULL] FULL detectado:`, r);
        }
        return isFull;
    });

    console.log(`📊 [FULL] Total de FULL detectados: ${fullDetectadosLista.length}`);

    if (fullDetectadosLista.length > 0) {
        console.log(`📦 ${fullDetectadosLista.length} anúncios FULL detectados. Abrindo modal...`);
        
        const fullItems = fullDetectadosLista.map(r => ({
            codigo: r.codigo || r.itemId,
            link: r.link || `https://www.mercadolivre.com.br/item/${r.codigo || r.itemId}`,
            erro: r.error || 'FULL - atualize manualmente',
            estoque: r.estoque || quantidadeReal,
            nome: r.nome || produto.nome || 'Produto'
        }));
        
        console.log('📦 [FULL] Itens para modal:', fullItems);
        
        // Aguarda um pouco e abre o modal
        setTimeout(() => {
            console.log('🔄 [FULL] Tentando abrir modal...');
            
            if (typeof window.abrirModalFullDetectados === 'function') {
                console.log('✅ [FULL] Chamando abrirModalFullDetectados...');
                window.abrirModalFullDetectados(fullItems);
            } else {
                console.warn('⚠️ [FULL] Função abrirModalFullDetectados não encontrada');
                // Fallback: alert
                alert(`🔴 ${fullItems.length} anúncio(s) FULL detectados!\nAtualize manualmente no Mercado Livre.\n\n${fullItems.map(i => `${i.codigo} - ${i.link}`).join('\n')}`);
            }
        }, 800);
    } else {
        console.log('ℹ️ [FULL] Nenhum anúncio FULL detectado.');
    }

    return { success: falhas === 0, results };
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

function extrairUnidadesPorKit(skuAnuncio) {
    console.log(`🔍 extrairUnidadesPorKit recebeu: "${skuAnuncio}" (tipo: ${typeof skuAnuncio})`);
    if (!skuAnuncio || typeof skuAnuncio !== 'string') return 1;
    
    skuAnuncio = skuAnuncio.trim();
    
    if (skuAnuncio.includes('.')) {
        console.log(`📦 Multi-SKU detectado: ${skuAnuncio}`);
        const partes = skuAnuncio.split('.');
        let totalQuantidade = 0;
        
        for (const parte of partes) {
            const match = parte.match(/^(\d{3})/);
            if (match) {
                const valor = parseInt(match[1], 10);
                if (valor > 0) {
                    totalQuantidade += valor;
                    console.log(`   Parte "${parte}": ${valor} unidades`);
                }
            }
        }
        
        if (totalQuantidade > 0) {
            console.log(`✅ Total de unidades por kit (multi-SKU): ${totalQuantidade}`);
            return totalQuantidade;
        }
    }
    
    const match = skuAnuncio.match(/^(\d{3})/);
    if (match) {
        const valor = parseInt(match[1], 10);
        if (valor > 0) {
            console.log(`✅ Quantidade por kit extraída: ${valor} (dos 3 primeiros dígitos "${match[1]}")`);
            return valor;
        }
    }
    
    const grupos = skuAnuncio.match(/\d{2,3}/g);
    if (grupos) {
        for (let grupo of grupos) {
            const valor = parseInt(grupo, 10);
            if (valor > 0) {
                console.log(`✅ Quantidade por kit extraída (fallback): ${valor} (do grupo "${grupo}")`);
                return valor;
            }
        }
    }
    
    console.warn(`⚠️ Nenhum dígito positivo encontrado, usando 1`);
    return 1;
}

// =========================================================
// EXPORTAR DADOS PARA EXCEL
// =========================================================

function exportarEstoqueExcel() {
    const produtos = produtosFiltradosAtuais || produtosEstoque;
    
    if (!produtos || produtos.length === 0) {
        showToast('⚠️ Nenhum produto para exportar.', 'warning');
        return;
    }
    
    const podeVerCusto = currentUser && (currentUser.username === 'andressamiotto' || currentUser.username === 'ronald');
    
    const dados = [];
    
    const cabecalho = ['ID', 'Nome', 'SKU', 'Categoria', 'Quantidade', 'Preço Venda'];
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
        
        const linha = [
            prod.id || '',
            prod.nome || '',
            prod.sku || '',
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
        { wch: 8 }, { wch: 35 }, { wch: 25 }, { wch: 15 }, 
        { wch: 12 }, { wch: 12 }
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
// REGRAS DE ESTOQUE CONDICIONAIS (VALOR DO ANÚNCIO + QUANTIDADE)
// =========================================================

async function carregarRegrasEstoque() {
    try {
        if (!window.supabaseClient) {
            const localData = localStorage.getItem('regras_estoque_condicionais');
            if (localData) {
                regrasEstoqueAtuais = JSON.parse(localData);
                console.log('✅ Regras carregadas do localStorage');
            } else {
                regrasEstoqueAtuais = JSON.parse(JSON.stringify(regrasEstoquePadrao));
                localStorage.setItem('regras_estoque_condicionais', JSON.stringify(regrasEstoqueAtuais));
                console.log('✅ Regras padrão carregadas');
            }
            return;
        }
        
        const { data, error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .select('*')
            .eq('chave', 'regras_estoque_condicionais')
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Erro ao carregar regras:', error);
            return;
        }
        
        if (data && data.valor) {
            regrasEstoqueAtuais = typeof data.valor === 'string' ? JSON.parse(data.valor) : data.valor;
            console.log('✅ Regras carregadas do Supabase:', regrasEstoqueAtuais);
        } else {
            regrasEstoqueAtuais = JSON.parse(JSON.stringify(regrasEstoquePadrao));
            await salvarRegrasEstoque(regrasEstoqueAtuais);
        }
        
        if (document.getElementById('modalRegrasEstoque')) {
            preencherModalRegras();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar regras:', error);
        regrasEstoqueAtuais = JSON.parse(JSON.stringify(regrasEstoquePadrao));
    }
}

async function salvarRegrasEstoque(regras) {
    try {
        if (!window.supabaseClient) {
            localStorage.setItem('regras_estoque_condicionais', JSON.stringify(regras));
            regrasEstoqueAtuais = regras;
            showToast('✅ Regras salvas no localStorage!', 'success');
            renderizarTabelaProdutos(produtosFiltradosAtuais);
            return;
        }
        
        const { error } = await window.supabaseClient
            .from('configuracoes_sistema')
            .upsert({
                chave: 'regras_estoque_condicionais',
                valor: JSON.stringify(regras),
                atualizado_em: new Date().toISOString(),
                atualizado_por: currentUser?.name || 'sistema'
            }, { onConflict: 'chave' });
        
        if (error) throw error;
        
        regrasEstoqueAtuais = regras;
        console.log('✅ Regras salvas com sucesso!');
        showToast('✅ Regras de estoque atualizadas!', 'success');
        renderizarTabelaProdutos(produtosFiltradosAtuais);
        
    } catch (error) {
        console.error('❌ Erro ao salvar regras:', error);
        showToast('Erro ao salvar regras: ' + error.message, 'error');
    }
}

// ===== CALCULAR ESTOQUE MÁXIMO PERMITIDO (baseado no preço unitário) =====
function calcularEstoqueMaximo(produto) {
    if (!produto || !produto.categoria) return 30;
    
    const regrasCategoria = regrasEstoqueAtuais[produto.categoria] || regrasEstoquePadrao['outros'];
    if (!regrasCategoria || !regrasCategoria.condicoes) return 30;
    
    const precoUnitario = produto.preco || 0;
    
    for (const condicao of regrasCategoria.condicoes) {
        if (condicao.operador === 'padrao') {
            return condicao.estoque_maximo || 30;
        }
        
        if (condicao.operador === 'maior_que' && precoUnitario > condicao.valor) {
            return condicao.estoque_maximo || 30;
        }
        
        if (condicao.operador === 'menor_que' && precoUnitario < condicao.valor) {
            return condicao.estoque_maximo || 30;
        }
        
        if (condicao.operador === 'igual_a' && precoUnitario === condicao.valor) {
            return condicao.estoque_maximo || 30;
        }
    }
    
    return 30;
}

// ===== VERIFICAR EXCESSO =====
function verificarExcessoEstoque(produto) {
    if (!produto) return false;
    const estoqueMaximo = calcularEstoqueMaximo(produto);
    return produto.quantidade > estoqueMaximo;
}

// ===== DESCRIÇÃO DA REGRA APLICADA =====
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

// ===== ABRIR MODAL DE REGRAS =====
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

// ===== CRIAR MODAL DE REGRAS =====
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

// ===== PREENCHER MODAL DE REGRAS =====
function preencherModalRegras() {
    const container = document.getElementById('regrasEstoqueContainer');
    if (!container) return;
    
    const categorias = ['Eixos', 'Parafusos', 'Rolamentos', 'Raios', 'Arruelas', 'Porcas', 'outros'];
    const labels = {
        'Eixos': 'Eixos Passantes',
        'Parafusos': 'Parafusos',
        'Rolamentos': 'Rolamentos',
        'Raios': 'Raios',
        'Arruelas': 'Arruelas',
        'Porcas': 'Porcas',
        'outros': 'Outros'
    };
    
    const operadores = [
        { value: 'maior_que', label: '>' },
        { value: 'menor_que', label: '<' },
        { value: 'igual_a', label: '=' },
        { value: 'padrao', label: 'Padrão' }
    ];
    
    let html = '';
    
    categorias.forEach((cat) => {
        const regras = regrasEstoqueAtuais[cat] || regrasEstoquePadrao[cat] || { condicoes: [] };
        const condicoes = regras.condicoes || [];
        
        html += `
            <div style="border: 1px solid #dee2e6; border-radius: 8px; padding: 15px; margin-bottom: 15px; background: #fafafa;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h4 style="margin: 0; font-size: 16px; color: #00ADEE;">${labels[cat] || cat}</h4>
                    <button class="btn btn-sm btn-primary" onclick="adicionarCondicaoRegra('${cat}')">
                        <i class="fas fa-plus"></i> Adicionar Condição
                    </button>
                </div>
                <div id="condicoes_${cat}" style="display: flex; flex-direction: column; gap: 8px;">
        `;
        
        if (condicoes.length === 0) {
            html += `
                <div style="text-align: center; color: #6c757d; padding: 10px; font-size: 13px; background: white; border-radius: 6px; border: 1px dashed #dee2e6;">
                    Nenhuma condição definida. Clique em "Adicionar Condição".
                </div>
            `;
        } else {
            condicoes.forEach((condicao, idx) => {
                const isPadrao = condicao.operador === 'padrao';
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
                                   value="${condicao.valor || 0}" step="0.01" min="0"
                                   onchange="atualizarCondicaoRegra('${cat}', ${idx}, 'valor', parseFloat(this.value) || 0)"
                                   placeholder="Valor">
                            <span style="color: #6c757d; font-size: 13px;">→</span>
                        ` : ''}
                        <span style="color: #6c757d; font-size: 13px;">Estoque máx.:</span>
                        <input type="number" class="form-control form-control-sm" style="width: 80px;" 
                               value="${condicao.estoque_maximo || 0}" step="1" min="0"
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
                            <i class="fas fa-info-circle"></i> Exemplo: Se preço ${condicao.operador === 'maior_que' ? '>' : condicao.operador === 'menor_que' ? '<' : '='} R$ ${condicao.valor || 0} → estoque máximo = ${condicao.estoque_maximo || 0} unidades
                        </div>
                    ` : ''}
                `;
            });
        }
        
        html += `
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// ===== ADICIONAR CONDIÇÃO =====
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

// ===== REMOVER CONDIÇÃO =====
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

// ===== ATUALIZAR CONDIÇÃO =====
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

// ===== SALVAR REGRAS DO MODAL =====
async function salvarRegrasEstoqueModal() {
    const categorias = ['Eixos', 'Parafusos', 'Rolamentos', 'Raios', 'Arruelas', 'Porcas', 'outros'];
    let valido = true;
    
    for (const cat of categorias) {
        const regras = regrasEstoqueAtuais[cat];
        if (!regras || !regras.condicoes || regras.condicoes.length === 0) {
            showToast(`A categoria "${cat}" não tem nenhuma condição definida.`, 'warning');
            valido = false;
            break;
        }
        
        const temPadrao = regras.condicoes.some(c => c.operador === 'padrao');
        if (!temPadrao) {
            showToast(`A categoria "${cat}" não tem uma condição padrão (senão).`, 'warning');
            valido = false;
            break;
        }
    }
    
    if (!valido) return;
    
    await salvarRegrasEstoque(regrasEstoqueAtuais);
    fecharModalRegrasEstoque();
}

// ===== FECHAR MODAL DE REGRAS =====
function fecharModalRegrasEstoque() {
    const modal = document.getElementById('modalRegrasEstoque');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

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

function renderizarSkusKit(skus) {
    const tbody = document.getElementById('kitSkusBody');
    if (!tbody) {
        console.warn('⚠️ Elemento #kitSkusBody não encontrado');
        return;
    }
    
    tbody.innerHTML = '';
    
    if (!skus || skus.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Nenhum SKU adicionado ao kit.</td></tr>';
        console.log('📭 Nenhum SKU para renderizar');
        return;
    }
    
    console.log(`📦 Renderizando ${skus.length} SKU(s) do kit:`, skus);
    
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

async function atualizarEstoqueFullConvivio(itemId, userProductId, quantidade, token, workerUrl, item) {
    try {
        console.log(`📦 [FULL] Atualizando estoque do item ${itemId} para ${quantidade} unidades`);
        
        // =========================================================
        // MÉTODO 1: Tentar via PUT /items/{item_id}/stock (endpoint Brasil)
        // =========================================================
        console.log(`🔄 [FULL] Tentando via PUT /items/${itemId}/stock...`);
        
        const stockUrl = `https://api.mercadolibre.com/items/${itemId}/stock`;
        const stockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(stockUrl)}&token=${encodeURIComponent(token)}`;
        
        console.log(`🔍 [FULL] Obtendo estoque atual do item...`);
        const getStockRes = await fetch(stockProxy);
        
        if (getStockRes.ok) {
            const stockData = await getStockRes.json();
            console.log(`📊 [FULL] Estoque atual do item:`, JSON.stringify(stockData, null, 2));
            
            const requestBody = { available_quantity: quantidade };
            
            console.log(`📤 [FULL] Corpo da requisição:`, JSON.stringify(requestBody, null, 2));
            
            const updateRes = await fetch(stockProxy, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            if (updateRes.status === 200 || updateRes.status === 204) {
                console.log(`✅ [FULL] Estoque atualizado para ${quantidade} (${itemId}) via /items/stock`);
                return { success: true, method: 'items_stock' };
            } else {
                const errorText = await updateRes.text();
                console.warn(`⚠️ [FULL] Falha /items/stock: ${updateRes.status} - ${errorText}`);
            }
        } else {
            const errText = await getStockRes.text();
            console.warn(`⚠️ [FULL] Falha ao obter stock do item: ${getStockRes.status} - ${errText}`);
        }
        
        // =========================================================
        // MÉTODO 2: Tentar via user-products com o ID completo
        // =========================================================
        console.log(`🔄 [FULL] Tentando via /user-products/${userProductId}/stock...`);
        
        const userStockUrl = `https://api.mercadolibre.com/user-products/${userProductId}/stock`;
        const userStockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(userStockUrl)}&token=${encodeURIComponent(token)}`;
        
        const getUserStockRes = await fetch(userStockProxy);
        if (getUserStockRes.ok) {
            const stockData = await getUserStockRes.json();
            console.log(`📊 [FULL] Estoque user-products:`, JSON.stringify(stockData, null, 2));
            
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
            
            if (updateRes.status === 204) {
                console.log(`✅ [FULL] Estoque atualizado via user-products para ${quantidade}`);
                return { success: true, method: 'user_products_stock' };
            } else {
                const errorText = await updateRes.text();
                console.warn(`⚠️ [FULL] Falha user-products: ${updateRes.status} - ${errorText}`);
            }
        }
        
        // =========================================================
        // MÉTODO 3: Tentar via item principal (último recurso)
        // =========================================================
        console.log(`🔄 [FULL] Último recurso: tentando via item principal...`);
        
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
            console.error(`❌ [FULL] Item principal falhou: ${putItemRes.status} - ${errorText}`);
            
            // ==== DETECTAR QUE É FULL ====
            if (errorText.includes('not_modifiable') || errorText.includes('field_not_updatable')) {
                console.log(`🔴 [FULL] Item ${itemId} é FULL e não pode ser atualizado via API!`);
                return { 
                    success: false, 
                    error: 'FULL - atualize manualmente no ML',
                    tipo: 'full_puro'
                };
            }
            
            return { success: false, error: `item ${putItemRes.status}` };
        }
        
    } catch (error) {
        console.error(`❌ [FULL] Erro:`, error);
        return { success: false, error: error.message };
    }
}

async function atualizarEstoqueFullSellerWarehouse(userProductId, quantidade, token, workerUrl) {
    try {
        console.log(`📦 [FULL] Atualizando via seller_warehouse para ${userProductId}`);
        
        const stockUrl = `https://api.mercadolibre.com/user-products/${userProductId}/stock`;
        const stockProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(stockUrl)}&token=${encodeURIComponent(token)}`;
        
        const getStockRes = await fetch(stockProxy);
        if (!getStockRes.ok) {
            return { success: false, error: `GET stock ${getStockRes.status}` };
        }
        
        const xVersion = getStockRes.headers.get('x-version');
        
        const updateUrl = `https://api.mercadolibre.com/user-products/${userProductId}/stock/type/seller_warehouse`;
        const updateProxy = `${workerUrl}/api/ml/proxy?url=${encodeURIComponent(updateUrl)}&token=${encodeURIComponent(token)}`;
        
        const headers = {
            'Content-Type': 'application/json'
        };
        if (xVersion) {
            headers['x-version'] = xVersion;
        }
        
        const updateRes = await fetch(updateProxy, {
            method: 'PUT',
            headers: headers,
            body: JSON.stringify({ quantity: quantidade })
        });
        
        if (updateRes.status === 204) {
            console.log(`✅ [FULL] seller_warehouse atualizado para ${quantidade}`);
            return { success: true, method: 'seller_warehouse' };
        } else {
            const errorText = await updateRes.text();
            console.error(`❌ [FULL] seller_warehouse falhou: ${updateRes.status} - ${errorText}`);
            return { success: false, error: `seller_warehouse ${updateRes.status}` };
        }
        
    } catch (error) {
        console.error(`❌ [FULL] Erro:`, error);
        return { success: false, error: error.message };
    }
}

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

// ============================================
// FUNÇÕES PARA KIT - CARREGAR, SALVAR E EXCLUIR
// ============================================

async function carregarSkusKit(skuPai) {
    console.log('🔍 [carregarSkusKit] INICIANDO busca para:', skuPai);
    console.log('🔍 [carregarSkusKit] supabaseClient existe?', !!window.supabaseClient);
    
    if (!skuPai || !window.supabaseClient) {
        console.log(`⚠️ [carregarSkusKit] SKU pai "${skuPai}" ou Supabase não disponível`);
        return [];
    }
    
    try {
        console.log(`🔍 [carregarSkusKit] Buscando SKUs para o pai: "${skuPai}"`);
        
        const { data, error } = await window.supabaseClient
            .from('produto_skus_kit')
            .select('*')
            .eq('sku_pai', skuPai);
        
        if (error) {
            console.error(`❌ [carregarSkusKit] Erro na consulta:`, error);
            throw error;
        }
        
        console.log(`📦 [carregarSkusKit] ${data?.length || 0} SKUs encontrados:`, JSON.stringify(data, null, 2));
        return data || [];
        
    } catch (error) {
        console.error(`❌ [carregarSkusKit] Erro completo:`, error);
        return [];
    }
}

async function salvarSkusKit(skuPai, skusFilhos) {
    console.log('💾 [salvarSkusKit] INICIANDO');
    console.log('💾 [salvarSkusKit] skuPai:', skuPai);
    console.log('💾 [salvarSkusKit] skusFilhos:', JSON.stringify(skusFilhos, null, 2));
    console.log('💾 [salvarSkusKit] supabaseClient existe?', !!window.supabaseClient);
    
    if (!skuPai || !window.supabaseClient) {
        console.error('❌ [salvarSkusKit] Dados inválidos', { skuPai, supabase: !!window.supabaseClient });
        return { success: false, error: 'Dados inválidos' };
    }
    
    try {
        console.log(`🔍 [salvarSkusKit] Buscando SKUs existentes para: ${skuPai}`);
        const { data: existentes, error: fetchError } = await window.supabaseClient
            .from('produto_skus_kit')
            .select('sku_filho, quantidade')
            .eq('sku_pai', skuPai);
        
        if (fetchError) {
            console.error('❌ [salvarSkusKit] Erro ao buscar SKUs existentes:', fetchError);
            throw fetchError;
        }
        
        console.log(`📊 [salvarSkusKit] SKUs existentes:`, JSON.stringify(existentes, null, 2));
        
        const skusExistentes = existentes.map(item => item.sku_filho);
        const skusNovos = skusFilhos.map(item => item.sku_filho);
        
        console.log(`📊 [salvarSkusKit] SKUs existentes: ${skusExistentes.length}, SKUs novos: ${skusNovos.length}`);
        console.log(`📊 [salvarSkusKit] skusExistentes:`, skusExistentes);
        console.log(`📊 [salvarSkusKit] skusNovos:`, skusNovos);
        
        const skusParaRemover = skusExistentes.filter(sku => !skusNovos.includes(sku));
        console.log(`🗑️ [salvarSkusKit] Removendo ${skusParaRemover.length} SKUs:`, skusParaRemover);
        
        for (const sku of skusParaRemover) {
            console.log(`🗑️ [salvarSkusKit] Removendo SKU: ${sku}`);
            const { error: delError } = await window.supabaseClient
                .from('produto_skus_kit')
                .delete()
                .eq('sku_pai', skuPai)
                .eq('sku_filho', sku);
            if (delError) {
                console.error(`❌ [salvarSkusKit] Erro ao remover SKU ${sku}:`, delError);
                throw delError;
            }
            console.log(`✅ [salvarSkusKit] SKU ${sku} removido`);
        }
        
        console.log(`📝 [salvarSkusKit] Inserindo/atualizando ${skusFilhos.length} SKUs`);
        for (const item of skusFilhos) {
            if (!item.sku_filho) {
                console.warn('⚠️ [salvarSkusKit] SKU filho vazio, ignorando...');
                continue;
            }
            
            console.log(`📝 [salvarSkusKit] Salvando SKU: ${item.sku_filho}, quantidade: ${item.quantidade || 1}`);
            
            const { error: upsertError } = await window.supabaseClient
                .from('produto_skus_kit')
                .upsert({
                    sku_pai: skuPai,
                    sku_filho: item.sku_filho,
                    quantidade: item.quantidade || 1
                }, { onConflict: 'sku_pai, sku_filho' });
            
            if (upsertError) {
                console.error(`❌ [salvarSkusKit] Erro ao salvar SKU ${item.sku_filho}:`, upsertError);
                throw upsertError;
            }
            console.log(`✅ [salvarSkusKit] SKU ${item.sku_filho} salvo`);
        }
        
        console.log(`🔍 [salvarSkusKit] Verificando se os dados foram salvos...`);
        const { data: verifyData, error: verifyError } = await window.supabaseClient
            .from('produto_skus_kit')
            .select('*')
            .eq('sku_pai', skuPai);
        
        if (verifyError) {
            console.warn('⚠️ [salvarSkusKit] Não foi possível verificar os dados:', verifyError);
        } else {
            console.log(`✅ [salvarSkusKit] Dados salvos verificados:`, JSON.stringify(verifyData, null, 2));
        }
        
        console.log(`✅ [salvarSkusKit] SKUs do kit salvos com sucesso para ${skuPai}`);
        return { success: true };
        
    } catch (error) {
        console.error('❌ [salvarSkusKit] Erro ao salvar SKUs do kit:', error);
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
    console.log(`📦 [calcularKitsDisponiveis] Calculando kits para ${skusFilhos.length} SKUs filhos`);
    console.log(`📦 [calcularKitsDisponiveis] SKU do anúncio: ${skuAnuncio}`);
    
    if (!skusFilhos || skusFilhos.length === 0) {
        console.log(`📦 [calcularKitsDisponiveis] Sem SKUs filhos, estoque ilimitado`);
        return Infinity;
    }
    
    let quantidadePorKit = 1;
    if (skuAnuncio) {
        quantidadePorKit = extrairUnidadesPorKit(skuAnuncio);
        console.log(`📦 [calcularKitsDisponiveis] Quantidade por kit (do SKU): ${quantidadePorKit}`);
    }
    
    let kitsPossiveis = Infinity;
    
    for (const item of skusFilhos) {
        console.log(`📦 [calcularKitsDisponiveis] Verificando SKU: ${item.sku_filho}`);
        
        const produto = produtosEstoque.find(p => p.sku === item.sku_filho);
        if (!produto) {
            console.log(`❌ [calcularKitsDisponiveis] SKU ${item.sku_filho} não encontrado no estoque!`);
            return 0;
        }
        
        const quantidadeNecessaria = quantidadePorKit;
        const kitsDoProduto = Math.floor(produto.quantidade / quantidadeNecessaria);
        console.log(`📦 [calcularKitsDisponiveis] SKU ${item.sku_filho}: estoque=${produto.quantidade}, necessário=${quantidadeNecessaria}, kits=${kitsDoProduto}`);
        
        kitsPossiveis = Math.min(kitsPossiveis, kitsDoProduto);
    }
    
    console.log(`📦 [calcularKitsDisponiveis] Total de kits possíveis: ${kitsPossiveis}`);
    return kitsPossiveis;
}

// ============================================
// INICIALIZAÇÃO
// ============================================

document.addEventListener('DOMContentLoaded', () => {
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