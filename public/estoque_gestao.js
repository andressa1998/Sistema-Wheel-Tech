// ============================================
// GESTÃO DE ESTOQUE - VERSÃO COMPLETA COM CATEGORIAS, MLB E SINCRONIZAÇÃO ML
// ============================================

let produtosEstoque = [];

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
        { nome: "diametroint", label: "Diâmetro Interno", tipo: "number", placeholder: "Ex: 15" },
        { nome: "diametroext", label: "Diâmetro Externo", tipo: "number", placeholder: "Ex: 26" },
        { nome: "largura", label: "Largura", tipo: "number", placeholder: "Ex: 7" },
        { nome: "aplicaçao", label: "Aplicação", tipo: "select", opcoes: ["Cubo", "Caixa de Direção", "Movimento Central", "Outros"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    Raios: [
        { nome: "marca", label: "Marca", tipo: "select", opcoes: ["Sapim", "Pillar", "Mavic", "Richman", "Green", "Dt Swiss", "Crank Brothers", "VeloForce", "Zincado", "Titânio", "T-Head"] },
        { nome: "modelo", label: "Modelo", tipo: "select", opcoes: [] },
        { nome: "cabeçaraio", label: "Cabeça do Raio", tipo: "select", opcoes: ["SP", "J"] },
        { nome: "tamanhoraio", label: "Tamanho Raio", tipo: "number", placeholder: "Ex: 284"},
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

    // Formato "marca|modelo"

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

    // Formato apenas marca (vale para todos os modelos daquela marca)

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

    // Esconder outros sistemas
    const sistemas = ['mainSystem', 'salesSystem', 'reembolsosSystem', 'caixaSystem', 
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

    // Atualizar cabeçalho
    const userNameEl = document.getElementById('estoqueGestaoUserName');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    const userAvatarEl = document.getElementById('estoqueGestaoUserAvatar');
    if (userAvatarEl) userAvatarEl.textContent = currentUser.avatar;
    const userRoleEl = document.getElementById('estoqueGestaoUserRole');
    if (userRoleEl) userRoleEl.textContent = currentUser.role;

    carregarProdutosEstoque();

    // Dentro de abrirGestaoEstoque, após carregarProdutosEstoque():
    const buscaInput = document.getElementById('buscaEstoqueInput');
    if (buscaInput) {
    // Remove evento anterior para evitar duplicidade
    buscaInput.removeEventListener('input', filtrarProdutosEstoque);
    buscaInput.addEventListener('input', filtrarProdutosEstoque);
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
        renderizarTabelaProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        if (window.showToast) showToast('Erro ao carregar produtos', 'error');
        const tbody = document.getElementById('produtosEstoqueBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-danger">Erro ao carregar produtos. Consulte o console.穷</td></tr>';
    }
}

// Filtra produtos com base no termo digitado (nome, SKU, MLB)
function filtrarProdutosEstoque() {
    const termo = document.getElementById('buscaEstoqueInput').value.toLowerCase().trim();
    if (!termo) {
        // Se campo vazio, mostra todos
        renderizarTabelaProdutos(produtosEstoque);
        return;
    }
    
    const produtosFiltrados = produtosEstoque.filter(prod => {
        // Busca por nome
        if (prod.nome && prod.nome.toLowerCase().includes(termo)) return true;
        // Busca por SKU
        if (prod.sku && prod.sku.toLowerCase().includes(termo)) return true;
        // Busca por MLB codes (dentro de dados_extra)
        if (prod.dados_extra && prod.dados_extra.mlb_codes) {
            let mlbArray = prod.dados_extra.mlb_codes;
            if (typeof mlbArray === 'string') mlbArray = mlbArray.split(',').map(s => s.trim());
            if (Array.isArray(mlbArray)) {
                return mlbArray.some(code => code.toLowerCase().includes(termo));
            }
        }
        return false;
    });
    
    renderizarTabelaProdutos(produtosFiltrados);
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

// ===== RENDERIZAR TABELA =====
// Renderiza a tabela com produtos (opcionalmente filtrados)
function renderizarTabelaProdutos(produtosParaRenderizar = null) {
    const tbody = document.getElementById('produtosEstoqueBody');
    if (!tbody) return;
    
    // Se recebeu uma lista filtrada, usa ela; senão usa a lista global já ordenada
    const produtos = produtosParaRenderizar || produtosEstoque;
    
    if (produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum produto encontrado.穷</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    produtos.forEach(prod => {
        const row = document.createElement('tr');
        let atributosResumo = '';
        if (prod.dados_extra) {
            const keys = Object.keys(prod.dados_extra).slice(0, 2);
            atributosResumo = keys.map(k => `${k}: ${prod.dados_extra[k]}`).join(', ');
            if (Object.keys(prod.dados_extra).length > 2) atributosResumo += '...';
        }
        // Botões de ação
        let botoes = `
    <button class="btn btn-sm btn-info" onclick="editarProdutoEstoque(${prod.id})"><i class="fas fa-edit"></i></button>
    <button class="btn btn-sm btn-warning" onclick="abrirModalMovimentacaoEstoque(${prod.id}, '${escapeHtml(prod.nome)}')"><i class="fas fa-exchange-alt"></i></button>
    <button class="btn btn-sm btn-secondary" onclick="verHistoricoMovimentacoes(${prod.id})" title="Histórico"><i class="fas fa-history"></i></button>
    <button class="btn btn-sm btn-danger" onclick="excluirProdutoEstoque(${prod.id})"><i class="fas fa-trash"></i></button>
`;
        const mlbCodes = prod.dados_extra?.mlb_codes;
        if (mlbCodes && ((Array.isArray(mlbCodes) && mlbCodes.length > 0) || (typeof mlbCodes === 'string' && mlbCodes.trim() !== ''))) {
            botoes += `<button class="btn btn-sm btn-primary" onclick="sincronizarProdutoML(${prod.id})" title="Sincronizar estoque com ML"><i class="fab fa-mercadolibre"></i></button>`;
        }
        row.innerHTML = `
            <td>${prod.id}</td>
            <td><strong>${escapeHtml(prod.nome)}</strong><br><small class="text-muted">${escapeHtml(prod.categoria || 'sem categoria')}</small></td>
            <td>${escapeHtml(prod.sku)}</td>
            <td class="${prod.quantidade <= 5 ? 'text-danger fw-bold' : ''}">${prod.quantidade}</td>
            <td><span title="${escapeHtml(atributosResumo)}" class="badge bg-info">${Object.keys(prod.dados_extra || {}).length} atributos</span></td>
            <td>${botoes}</td>
        `;
        tbody.appendChild(row);
    });
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

// ===== MODAL PRODUTO (COM CATEGORIA E CAMPOS DINÂMICOS) =====
function abrirModalProdutoEstoque(produto = null) {
    const modal = document.getElementById('modalProdutoEstoque');
    if (!modal) return;
    const title = document.getElementById('modalProdutoTitle');
    const idInput = document.getElementById('produtoId');
    const nomeInput = document.getElementById('produtoNome');
    const skuInput = document.getElementById('produtoSKU');
    const qtdInput = document.getElementById('produtoQuantidade');
    const precoInput = document.getElementById('produtoPreco');
    const descInput = document.getElementById('produtoDescricao');
    const categoriaSelect = document.getElementById('produtoCategoria');

    if (produto) {
        // MODO EDIÇÃO
        title.textContent = 'Editar Produto';
        idInput.value = produto.id;
        nomeInput.value = produto.nome;
        skuInput.value = produto.sku;
        qtdInput.value = produto.quantidade;
        qtdInput.readOnly = true;
        qtdInput.classList.add('bg-light');
        precoInput.value = produto.preco || 0;
        descInput.value = produto.descricao || '';
        categoriaSelect.value = produto.categoria || '';

        // Gera os campos dinâmicos baseados na categoria salva
        gerarCamposDinamicos(produto.categoria);
        
        const dadosExtra = produto.dados_extra || {};
        // Preenche os dados extras
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

        // Lógica especial para Raios
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
    } else {
        // MODO CRIAÇÃO
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
        gerarCamposDinamicos('');
    }

    // Evento de mudança de categoria (com confirmação)
    categoriaSelect.onchange = function() {
        const novaCategoria = categoriaSelect.value;
        if (produto && produto.categoria && novaCategoria !== produto.categoria) {
            if (!confirm('Alterar a categoria limpará os atributos específicos. Deseja continuar?')) {
                categoriaSelect.value = produto.categoria;
                return;
            }
        }
        gerarCamposDinamicos(novaCategoria);
    };

    modal.classList.remove('hidden');
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

    if (!toggleBtn || !panel) return;

    // Alternar exibição do painel
    toggleBtn.onclick = () => {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            toggleBtn.innerHTML = '<i class="fas fa-times-circle"></i> Desativar modo múltiplo';
            // Oculta o campo de tamanho simples e o campo de quantidade (original)
            const simpleTamanho = document.getElementById('campo_tamanhoraio');
            const simpleQuantidade = document.getElementById('produtoQuantidade');
            if (simpleTamanho) simpleTamanho.closest('.campo-dinamico').style.display = 'none';
            if (simpleQuantidade) simpleQuantidade.closest('.form-group').style.display = 'none';
        } else {
            panel.style.display = 'none';
            toggleBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Ativar modo múltiplo';
            if (simpleTamanho) simpleTamanho.closest('.campo-dinamico').style.display = '';
            if (simpleQuantidade) simpleQuantidade.closest('.form-group').style.display = '';
        }
    };

    // Adicionar nova linha
    if (addRowBtn) {
        addRowBtn.onclick = () => {
            const newRow = document.createElement('tr');
            newRow.innerHTML = `
                <td><input type="number" class="form-control form-control-sm bulk-tamanho" placeholder="ex: 284"></td>
                <td><input type="number" class="form-control form-control-sm bulk-quantidade" value="0" min="0"></td>
                <td><button type="button" class="btn btn-sm btn-danger remove-bulk-row"><i class="fas fa-trash"></i></button></td>
            `;
            tbody.appendChild(newRow);
            attachRemoveEvent(newRow);
        };
    }

    // Remover linha (event delegation)
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
        // Oculta a seção bulk quando não há campos ou categoria diferente de Raios
        const bulkSection = document.getElementById('bulkAddSection');
        if (bulkSection) bulkSection.style.display = 'none';
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
        } 
        else if (campo.tipo === 'checkbox') {
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
        } 
        else if (campo.tipo === 'textarea') {
            const textarea = document.createElement('textarea');
            textarea.id = `campo_${campo.nome}`;
            textarea.className = 'form-control';
            textarea.rows = campo.rows || 2;
            if (campo.placeholder) textarea.placeholder = campo.placeholder;
            div.appendChild(textarea);
        } 
        else {
            const input = document.createElement('input');
            input.type = campo.tipo;
            input.id = `campo_${campo.nome}`;
            input.className = 'form-control';
            if (campo.step) input.step = campo.step;
            if (campo.min) input.min = campo.min;
            if (campo.placeholder) input.placeholder = campo.placeholder;
            if (campo.obrigatorio) input.required = true;
            div.appendChild(input);
        }

        grid.appendChild(div);
    });

    container.appendChild(grid);

    // --- BULK MODE para categoria Raios e apenas em modo criação (sem id) ---
    const bulkSection = document.getElementById('bulkAddSection');
    const isEditing = document.getElementById('produtoId').value !== '';
    if (categoria === 'Raios' && !isEditing) {
        if (bulkSection) bulkSection.style.display = 'block';
        configurarBulkModeEvents();   // Configura os eventos do modo bulk
    } else {
        if (bulkSection) bulkSection.style.display = 'none';
    }
}

function atualizarModelosPorMarca(marcaSelecionada) {
    const selectModelo = document.getElementById('campo_modelo');
    if (!selectModelo) return;

    // Limpa as opções atuais
    selectModelo.innerHTML = '';

    // Opção padrão vazia
    const optionPadrao = document.createElement('option');
    optionPadrao.value = '';
    optionPadrao.textContent = '-- Selecione um modelo --';
    selectModelo.appendChild(optionPadrao);

    // Obtém modelos da marca (se não existir, array vazio)
    const modelos = modelosPorMarca[marcaSelecionada] || [];
    modelos.forEach(modelo => {
        const option = document.createElement('option');
        option.value = modelo;
        option.textContent = modelo;
        selectModelo.appendChild(option);
    });
}

// ===== SALVAR PRODUTO (COM DADOS EXTRAS E SINCRONIZAÇÃO ML) =====
async function salvarProdutoEstoque() {
    const id = document.getElementById('produtoId').value;
    const nome = document.getElementById('produtoNome').value.trim();
    const skuSimples = document.getElementById('produtoSKU').value.trim();
    const preco = parseFloat(document.getElementById('produtoPreco').value) || 0;
    const descricao = document.getElementById('produtoDescricao').value.trim();
    const categoria = document.getElementById('produtoCategoria').value;

    if (!nome || !categoria) {
        if (window.showToast) showToast('Nome e Categoria são obrigatórios', 'warning');
        return;
    }

    // Coletar dados extras da categoria (comuns para todos os produtos em bulk)
    const dadosExtra = {};
    const campos = camposPorCategoria[categoria] || [];
    for (const campo of campos) {
        const el = document.getElementById(`campo_${campo.nome}`);
        if (el) {
            if (campo.tipo === 'checkbox') {
                dadosExtra[campo.nome] = el.checked;
            } else if (campo.nome === 'mlb_codes' && el.value.trim()) {
                const valores = el.value.split(',').map(v => v.trim()).filter(v => v);
                dadosExtra[campo.nome] = valores;
            } else {
                let valor = el.value;
                if (campo.tipo === 'number' && valor !== '') valor = parseFloat(valor);
                dadosExtra[campo.nome] = valor;
            }
        }
    }

    // --- MODO BULK (apenas para Raios, novo produto, e painel ativo) ---
    const bulkPanel = document.getElementById('bulkModePanel');
    const isBulkMode = (categoria === 'Raios' && !id && bulkPanel && bulkPanel.style.display === 'block');

    if (isBulkMode) {
        const rows = document.querySelectorAll('#bulkTamanhosBody tr');
        const bulkItems = [];
        for (let row of rows) {
            const tamanho = row.querySelector('.bulk-tamanho')?.value;
            const quantidade = parseInt(row.querySelector('.bulk-quantidade')?.value) || 0;
            if (!tamanho || tamanho === '') {
                showToast('Todos os tamanhos devem ser preenchidos', 'warning');
                return;
            }
            bulkItems.push({ tamanho: String(tamanho), quantidade });
        }

        const skuBase = document.getElementById('bulkSkuBase')?.value.trim();
        if (!skuBase) {
            showToast('SKU base é obrigatório no modo múltiplo', 'warning');
            return;
        }

        if (!confirm(`Deseja criar ${bulkItems.length} produtos com os atributos comuns?`)) return;

        let created = 0;
        let errors = [];
        for (let item of bulkItems) {
            // Copia os dados extras e força o campo "tamanhoraio"
            const produtoDadosExtra = { ...dadosExtra };
            produtoDadosExtra.tamanhoraio = item.tamanho;
            const novoSKU = `${skuBase}-${item.tamanho}`;

            const produtoData = {
                nome: nome,
                sku: novoSKU,
                quantidade: item.quantidade,
                preco: preco,
                descricao: descricao,
                categoria: categoria,
                dados_extra: produtoDadosExtra
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
                errors.push(`${novoSKU}: ${err.message}`);
                console.error(err);
            }
        }

        if (created > 0) showToast(`✅ ${created} produto(s) criado(s) em massa!`, 'success');
        if (errors.length) showToast(`⚠️ Erros: ${errors.join(', ')}`, 'error');

        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();
        return;
    }

    // --- MODO NORMAL (um produto só, com SKU e quantidade comuns) ---
    const sku = document.getElementById('produtoSKU').value.trim();
    if (!sku) {
        showToast('SKU é obrigatório', 'warning');
        return;
    }
    const quantidade = parseInt(document.getElementById('produtoQuantidade').value) || 0;

    const produtoData = {
        nome,
        sku,
        quantidade,
        preco,
        descricao,
        categoria,
        dados_extra: dadosExtra
    };

    try {
        let produtoSalvo;
        if (id) {
            const { data, error } = await window.supabaseClient
                .from('produtos_estoque')
                .update(produtoData)
                .eq('id', id)
                .select();
            if (error) throw error;
            produtoSalvo = data[0];
            // Não registrar movimentação por edição (já existente)
            showToast('Produto atualizado!', 'success');
        } else {
            const { data, error } = await window.supabaseClient
                .from('produtos_estoque')
                .insert([produtoData])
                .select();
            if (error) throw error;
            produtoSalvo = data[0];
            if (quantidade > 0) {
                await registrarMovimentacao(produtoSalvo.id, 'entrada', quantidade, 'Criação do produto', 'nova');
            }
            showToast('Produto adicionado!', 'success');
        }

        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();

        if (produtoSalvo && produtoSalvo.dados_extra?.mlb_codes?.length) {
            setTimeout(() => sincronizarEstoqueML(produtoSalvo), 500);
        }
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showToast('Erro: ' + error.message, 'error');
    }
}

// ===== EDITAR, EXCLUIR =====
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

// ===== MOVIMENTAÇÃO DE ESTOQUE =====
let produtoMovimentacaoAtual = null;

function abrirModalMovimentacaoEstoque(id, nome) {
    produtoMovimentacaoAtual = id;
    document.getElementById('movProdutoId').value = id;
    document.getElementById('movProdutoNome').textContent = nome;
    document.getElementById('movQuantidade').value = '1';
    document.getElementById('movTipo').value = 'entrada';
    document.getElementById('movNumeroDocumento').value = '';   // limpar campo
    document.getElementById('movTipoEntrada').value = 'nova';   // padrão
    toggleTipoEntradaField();   // mostrar/esconder conforme tipo
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

// ===== SINCRONIZAÇÃO FINAL COM MERCADO LIVRE =====
function encontrarVariacaoPorSKU(item, skuProduto) {
    if (!item.variations || item.variations.length === 0) return null;

    const skuAlvo = (skuProduto || '').toLowerCase().trim();
    console.log(`🔍 Buscando variação para SKU alvo: "${skuAlvo}"`);

    const normalizar = (str) => (str || '').toLowerCase().trim().replace(/^0+/, '');
    const skuAlvoNorm = normalizar(skuAlvo);

    for (const v of item.variations) {
        let identificador = extrairSkuDaVariacao(v);
        console.log(`   Testando variação ${v.id}: "${identificador}"`);
        if (identificador) {
            let idNorm = normalizar(identificador);
            // Remove prefixo de 3 dígitos
            if (/^\d{3}/.test(idNorm)) {
                const semPrefixo = idNorm.replace(/^\d{3}/, '');
                if (semPrefixo === skuAlvoNorm) {
                    console.log(`✅ Match após remover prefixo: ${identificador}`);
                    return v;
                }
            }
            if (idNorm === skuAlvoNorm) {
                console.log(`✅ Match exato: ${identificador}`);
                return v;
            }
            if (idNorm.includes(skuAlvoNorm) || skuAlvoNorm.includes(idNorm)) {
                console.log(`✅ Match por inclusão: ${identificador}`);
                return v;
            }
        }
    }
    console.warn(`⚠️ Nenhuma variação compatível.`);
    return null;
}

function extrairSkuDaVariacao(variacao) {
    // Para variações
    if (variacao.seller_custom_field) return variacao.seller_custom_field;
    if (variacao.attributes && Array.isArray(variacao.attributes)) {
        const skuAttr = variacao.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
    if (variacao.sku) return variacao.sku;
    return null;
}

// NOVA FUNÇÃO: extrair SKU do item principal (sem variações)
function extrairSkuDoItem(item) {
    if (item.seller_custom_field) return item.seller_custom_field;
    if (item.attributes && Array.isArray(item.attributes)) {
        const skuAttr = item.attributes.find(attr => attr.id === 'SELLER_SKU');
        if (skuAttr && skuAttr.value_name) return skuAttr.value_name;
    }
    if (item.sku) return item.sku;
    return null;
}

async function sincronizarEstoqueML(produto) {
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

    for (const codigo of codigos) {
        const itemId = codigo.startsWith('MLB') ? codigo : `MLB${codigo}`;
        const apiUrl = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(apiUrl)}&token=${encodeURIComponent(token)}`;

        try {
            console.log(`\n🔍 Obtendo ${itemId}...`);
            const getRes = await fetch(proxyUrl);
            if (!getRes.ok) throw new Error(`GET falhou: ${getRes.status}`);
            const item = await getRes.json();

            // Buscar detalhes de cada variação
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
                                price: varDetails.price || v.price
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

            if (item.tags?.includes('has_price_by_rule')) {
                console.warn(`⚠️ Item ${itemId} tem preço automático.`);
                results.push({ codigo: itemId, success: false, reason: 'oferta_ativa' });
                continue;
            }

            // ------------------- CÁLCULO DA QUANTIDADE A ENVIAR -------------------
            let quantidadeParaEnviar = quantidadeReal;

            if (categoria === 'Eixos') {
                let precoAnuncio = 0;
                if (item.variations && item.variations.length > 0) {
                    const variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
                    if (variacaoAlvo) precoAnuncio = variacaoAlvo.price || 0;
                    else precoAnuncio = item.price || 0;
                } else {
                    precoAnuncio = item.price || 0;
                }
                const limite = precoAnuncio > 100 ? 2 : 10;
                quantidadeParaEnviar = Math.min(quantidadeReal, limite);
                console.log(`📊 Regra Eixos: preço=R$ ${precoAnuncio}, limite=${limite}, enviando=${quantidadeParaEnviar}`);
            }
            else if (categoria === 'Raios') {
    console.log(`\n===== PROCESSANDO RAIOS =====`);
    console.log(`Produto: ${produto.nome}, SKU: ${skuProduto}`);
    console.log(`Marca: ${marcaProduto}, Modelo: ${modeloProduto}`);
    console.log(`Estoque real (unidades): ${quantidadeReal}`);

    let skuAnuncio = null;

    // 1. Se há variações, busca a variação correspondente
    if (item.variations && item.variations.length > 0) {
        console.log(`📦 Item possui ${item.variations.length} variação(ões).`);
        let variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
        if (variacaoAlvo) {
            skuAnuncio = extrairSkuDaVariacao(variacaoAlvo);
            console.log(`🔎 Variação alvo (ID ${variacaoAlvo.id}): SKU = "${skuAnuncio}"`);
        } else {
            console.warn(`⚠️ Nenhuma variação compatível. Buscando em todas...`);
            for (let v of item.variations) {
                let testSku = extrairSkuDaVariacao(v);
                if (testSku && testSku.match(/\d/)) {
                    skuAnuncio = testSku;
                    console.log(`🔎 Usando SKU da variação ${v.id}: "${skuAnuncio}"`);
                    break;
                }
            }
        }
    } else {
        // 2. Item sem variação: extrai SKU diretamente do item principal
        skuAnuncio = extrairSkuDoItem(item);
        console.log(`🔎 Item sem variação. SKU encontrado: "${skuAnuncio}"`);
    }

    // 3. Fallback: se nada funcionar, tenta o seller_custom_field do item principal (já tentamos acima) ou ID
    if (!skuAnuncio) {
        // Tenta pegar o ID numérico do anúncio (não recomendado, mas como último recurso)
        const matchId = item.id.match(/\d+$/);
        if (matchId) {
            skuAnuncio = matchId[0];
            console.log(`⚠️ Nenhum SKU encontrado. Usando ID do anúncio: "${skuAnuncio}" (isso pode levar a cálculos errados!)`);
        }
    }

    // 4. Extrai a quantidade de raios por kit
    const raiosPorKit = extrairUnidadesPorKit(skuAnuncio);
    console.log(`📦 Raios por kit calculado: ${raiosPorKit}`);

    // 5. Calcula kits possíveis
    let kitsPossiveis = Math.floor(quantidadeReal / raiosPorKit);
    if (kitsPossiveis < 0) kitsPossiveis = 0;
    console.log(`📊 Estoque real: ${quantidadeReal} raios → ${kitsPossiveis} kits possíveis`);

    // 6. Aplica regra de limite
    const regra = obterRegraRaios(marcaProduto, modeloProduto);
    let kitsEnviar = kitsPossiveis;
    if (regra && regra.max_kits !== undefined) {
        kitsEnviar = Math.min(kitsPossiveis, regra.max_kits);
        console.log(`🏷️ Regra ${marcaProduto}|${modeloProduto}: limite ${regra.max_kits} kits → enviando ${kitsEnviar}`);
    } else {
        console.log(`🏷️ Sem regra específica. Enviando ${kitsEnviar} kits`);
    }

    quantidadeParaEnviar = kitsEnviar;
    console.log(`✅ Quantidade final enviada ao ML: ${quantidadeParaEnviar} kits`);
}

            // --- FULL (inventory_id) ---
            const isFulfillment = item.tags?.includes('fulfillment') || 
                      item.shipping?.logistic_type === 'fulfillment' ||
                      item.logistic_type === 'fulfillment';

            if (item.inventory_id && isFulfillment) {
                console.log(`📦 FULL inventory ${item.inventory_id}`);
                const invUrl = `https://api.mercadolibre.com/inventories/${item.inventory_id}/stock`;
                const invProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(invUrl)}&token=${encodeURIComponent(token)}`;
                const invRes = await fetch(invProxy, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ total: { available_quantity: quantidadeParaEnviar } })
                });
                if (invRes.ok) {
                    console.log(`✅ FULL atualizado para ${quantidadeParaEnviar}`);
                    results.push({ codigo: itemId, success: true, method: 'inventory' });
                } else {
                    const errorText = await invRes.text();
                    console.error(`❌ FULL falhou: ${invRes.status} - ${errorText}`);
                    results.push({ codigo: itemId, success: false, error: `FULL ${invRes.status}` });
                }
                continue;
            } else if (item.inventory_id && !isFulfillment) {
                console.log(`⚠️ inventory_id presente, mas item não é FULL.`);
            }

            // --- COM VARIAÇÕES ---
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
                console.log(`📡 Resposta (status ${putRes.status}):`, responseText);
                
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
            // --- SEM VARIAÇÃO ---
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
    return { success: falhas === 0, results };
}

window.sincronizarProdutoML = async function(produtoId) {
    const produto = produtosEstoque.find(p => p.id == produtoId);
    if (!produto) {
        if (window.showToast) showToast('Produto não encontrado', 'error');
        return;
    }
    if (window.showToast) showToast(`🔄 Sincronizando estoque (${produto.quantidade}) com ML...`, 'info');
    await sincronizarEstoqueML(produto);
};

function extrairUnidadesPorKit(skuAnuncio) {
    console.log(`🔍 extrairUnidadesPorKit recebeu: "${skuAnuncio}" (tipo: ${typeof skuAnuncio})`);
    if (!skuAnuncio || typeof skuAnuncio !== 'string') return 1;

    // Tenta capturar 2 ou 3 dígitos logo no início
    let match = skuAnuncio.match(/^(\d{2,3})/);
    if (match) {
        let val = parseInt(match[1], 10);
        console.log(`✅ Prefixo encontrado (início): ${val}`);
        return val;
    }

    // Tenta capturar 2 ou 3 dígitos em qualquer posição (ex: "RAIO064")
    match = skuAnuncio.match(/(\d{2,3})/);
    if (match) {
        let val = parseInt(match[1], 10);
        console.log(`✅ Prefixo encontrado (qualquer posição): ${val}`);
        return val;
    }

    console.warn(`❌ Nenhum dígito encontrado, usando 1`);
    return 1;
}

// ===== UTILITÁRIOS =====
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Gera número único para movimentação: MOV-YYYYMMDD-XXXX
async function gerarNumeroMovimentacao() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    const prefixo = `${ano}${mes}${dia}`;
    
    // Consulta o último número do dia
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

// ===== INICIALIZAÇÃO (verifica tabela) =====
document.addEventListener('DOMContentLoaded', () => {
    const buscaInput = document.getElementById('buscaEstoqueInput');
    if (buscaInput) {
        buscaInput.addEventListener('input', filtrarProdutosEstoque);
    }
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