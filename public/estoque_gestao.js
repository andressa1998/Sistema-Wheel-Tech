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
        // DIÂMETROS AGORA SÃO TEXT COM VALIDAÇÃO DE NÚMERO E VÍRGULA
        { nome: "diametroint", label: "Diâmetro Interno", tipo: "text", placeholder: "Ex: 15 ou 15,5", obrigatorio: true, validacao: "numero_virgula" },
        { nome: "diametroext", label: "Diâmetro Externo", tipo: "text", placeholder: "Ex: 26 ou 26,5", obrigatorio: true, validacao: "numero_virgula" },
        { nome: "largura", label: "Largura", tipo: "number", placeholder: "Ex: 7", obrigatorio: true },
        { nome: "aplicaçao", label: "Aplicação", tipo: "select", opcoes: ["Cubo", "Caixa de Direção", "Movimento Central", "Outros"] },
        // Os campos "Ângulo interno" e "Ângulo externo" serão injetados dinamicamente via JS
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

    const buscaInput = document.getElementById('buscaEstoqueInput');
    if (buscaInput) {
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
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-danger">Erro ao carregar produtos. Consulte o console.</td></tr>';
    }
}

function filtrarProdutosEstoque() {
    const termo = document.getElementById('buscaEstoqueInput').value.toLowerCase().trim();
    if (!termo) {
        renderizarTabelaProdutos(produtosEstoque);
        return;
    }
    const produtosFiltrados = produtosEstoque.filter(prod => {
        if (prod.nome && prod.nome.toLowerCase().includes(termo)) return true;
        if (prod.sku && prod.sku.toLowerCase().includes(termo)) return true;
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

function renderizarTabelaProdutos(produtosParaRenderizar = null) {
    const tbody = document.getElementById('produtosEstoqueBody');
    if (!tbody) return;
    const produtos = produtosParaRenderizar || produtosEstoque;
    if (produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum produto encontrado.</td></tr>';
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
        // Se for Rolamento e tiver ângulos, preencher
        if (produto.categoria === 'Rolamentos') {
            const anguloInt = document.getElementById('campo_angulo_interno');
            const anguloExt = document.getElementById('campo_angulo_externo');
            if (anguloInt && dadosExtra.angulo_interno) anguloInt.value = dadosExtra.angulo_interno;
            if (anguloExt && dadosExtra.angulo_externo) anguloExt.value = dadosExtra.angulo_externo;
            // Verificar se deve mostrar os campos
            const aplicacao = document.getElementById('campo_aplicaçao');
            if (aplicacao && aplicacao.value === 'Caixa de Direção') {
                document.getElementById('camposAngulosRolamento').style.display = 'block';
            }
        }
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
        gerarCamposDinamicos('');
    }

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

// ===== FUNÇÃO CORRIGIDA PARA CONFIGURAR EVENTOS DO MODO BULK =====
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

    // Remove eventos antigos para evitar duplicidade
    const newToggle = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);

    // Função que cria uma nova linha completa (com SKU)
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

    // Configurar botão "Adicionar outra linha"
    if (addRowBtn) {
        const newAddRow = addRowBtn.cloneNode(true);
        addRowBtn.parentNode.replaceChild(newAddRow, addRowBtn);
        newAddRow.onclick = adicionarNovaLinha;
    }

    // Botão toggle do modo múltiplo
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

// ===== GERAR CAMPOS DINÂMICOS (COM INTEGRAÇÃO DO MODO BULK E CAMPOS CONDICIONAIS) =====
function gerarCamposDinamicos(categoria) {
    const container = document.getElementById('camposDinamicos');
    if (!container) return;
    container.innerHTML = '';

    const campos = camposPorCategoria[categoria];
    if (!campos || campos.length === 0) {
        container.innerHTML = '<div class="alert alert-info">Nenhum campo específico para esta categoria.</div>';
        const bulkSection = document.getElementById('bulkAddSection');
        if (bulkSection) bulkSection.style.display = 'none';
        return;
    }

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';
    grid.style.marginTop = '10px';

    // Guardar referência para campos condicionais de Rolamento
    let aplicacaoSelect = null;
    let angulosContainer = null;

    campos.forEach(campo => {
        const div = document.createElement('div');
        div.className = 'campo-dinamico';

        const label = document.createElement('label');
        label.style.fontWeight = '600';
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        label.textContent = `${campo.label} ${campo.obrigatorio ? '*' : ''}`;
        div.appendChild(label);

        // --- TRATAMENTO ESPECIAL PARA DIÂMETROS (Rolamento) ---
        if (campo.validacao === 'numero_virgula') {
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `campo_${campo.nome}`;
            input.className = 'form-control';
            if (campo.placeholder) input.placeholder = campo.placeholder;
            if (campo.obrigatorio) input.required = true;
            // Filtro em tempo real: apenas dígitos e vírgula
            input.addEventListener('input', function(e) {
                this.value = this.value.replace(/[^0-9,]/g, '');
            });
            // Validação no blur: se não for vazio e não for número com vírgula válido
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

        // --- SELECT ---
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
            // --- PARA ROLAMENTOS: guardar referência do select de aplicação ---
            if (categoria === 'Rolamentos' && campo.nome === 'aplicaçao') {
                aplicacaoSelect = select;
                // Inicialmente esconder os campos de ângulo
                setTimeout(() => {
                    const angulosDiv = document.getElementById('camposAngulosRolamento');
                    if (angulosDiv) angulosDiv.style.display = 'none';
                }, 50);
            }
            div.appendChild(select);
            grid.appendChild(div);
            return;
        }

        // --- CHECKBOX ---
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

        // --- TEXTAREA ---
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

        // --- INPUT GENÉRICO (number, text, etc) ---
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

    // =========================================================
    //  CAMPOS CONDICIONAIS PARA ROLAMENTO "Caixa de Direção"
    // =========================================================
    if (categoria === 'Rolamentos') {
        // Cria um container extra fora do grid para os campos de ângulo
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

        // Função para mostrar/ocultar os campos de ângulo
        function toggleAngulos(valorAplicacao) {
            if (!angulosDiv) return;
            const shouldShow = (valorAplicacao === 'Caixa de Direção');
            angulosDiv.style.display = shouldShow ? 'block' : 'none';
            // Tornar os campos obrigatórios ou não
            const angInt = document.getElementById('campo_angulo_interno');
            const angExt = document.getElementById('campo_angulo_externo');
            if (angInt) angInt.required = shouldShow;
            if (angExt) angExt.required = shouldShow;
        }

        // Se o select já existe, adicionar evento
        if (aplicacaoSelect) {
            aplicacaoSelect.addEventListener('change', function(e) {
                toggleAngulos(e.target.value);
            });
            // Verificar valor inicial
            setTimeout(() => {
                toggleAngulos(aplicacaoSelect.value);
            }, 100);
        }

        // Aplicar validação de números e vírgula também nos campos de ângulo
        setTimeout(() => {
            ['campo_angulo_interno', 'campo_angulo_externo'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener('input', function() {
                        this.value = this.value.replace(/[^0-9,]/g, '');
                    });
                }
            });
        }, 150);
    }

    // --- CONFIGURAR MODO BULK (Raios) ---
    const bulkSection = document.getElementById('bulkAddSection');
    const isEditing = document.getElementById('produtoId').value !== '';
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

// Evento para preenchimento automático de SKUs (opcional)
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

// =========================================================
// VALIDAÇÃO DO CAMPO MLB_CODES (formato rígido)
// =========================================================
function validarMLBCodes(texto) {
    if (!texto || texto.trim() === '') return true; // campo opcional
    const partes = texto.split(',').map(s => s.trim()).filter(s => s !== '');
    if (partes.length === 0) return true;
    // Cada parte deve ter 13 caracteres, começar com MLB e o restante dígitos
    const regex = /^MLB\d{10}$/;
    for (let p of partes) {
        if (!regex.test(p)) {
            return false;
        }
    }
    return true;
}

// ===== SALVAR PRODUTO (COM SUPORTE A MODO BULK E VALIDAÇÕES) =====
async function salvarProdutoEstoque() {
    const id = document.getElementById('produtoId').value;
    const nome = document.getElementById('produtoNome').value.trim();
    const preco = parseFloat(document.getElementById('produtoPreco').value) || 0;
    const descricao = document.getElementById('produtoDescricao').value.trim();
    const categoria = document.getElementById('produtoCategoria').value;

    if (!nome || !categoria) {
        if (window.showToast) showToast('Nome e Categoria são obrigatórios', 'warning');
        return;
    }

    // Coletar dados extras da categoria (atributos comuns)
    const dadosExtra = {};
    const campos = camposPorCategoria[categoria] || [];
    for (const campo of campos) {
        const el = document.getElementById(`campo_${campo.nome}`);
        if (el) {
            if (campo.tipo === 'checkbox') {
                dadosExtra[campo.nome] = el.checked;
            } else if (campo.nome === 'mlb_codes' && el.value.trim()) {
                // VALIDAÇÃO MLB CODES
                const mlbText = el.value.trim();
                if (!validarMLBCodes(mlbText)) {
                    showToast(`Formato inválido para MLB Codes. Use: "MLB1496273494, MLB4220545731" (cada um com 13 caracteres, separados por ", ")`, 'error');
                    el.focus();
                    return;
                }
                const valores = mlbText.split(',').map(v => v.trim()).filter(v => v);
                dadosExtra[campo.nome] = valores;
            } else {
                let valor = el.value;
                if (campo.tipo === 'number' && valor !== '') valor = parseFloat(valor);
                // Validação para campos de diâmetro (número e vírgula)
                if (campo.validacao === 'numero_virgula' && valor !== '') {
                    if (!/^[0-9]+(,[0-9]+)?$/.test(valor)) {
                        showToast(`O campo "${campo.label}" deve conter apenas números e vírgula (ex: 15 ou 15,5)`, 'warning');
                        el.focus();
                        return;
                    }
                }
                dadosExtra[campo.nome] = valor;
            }
        }
    }

    // --- Capturar campos de ângulo (Rolamento) se estiverem visíveis ---
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

    // --- MODO BULK (apenas para Raios, produto novo e painel ativo) ---
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

            if (!tamanho) {
                showToast('Todos os tamanhos devem ser preenchidos', 'warning');
                return;
            }
            if (!sku) {
                showToast('Todos os SKUs devem ser preenchidos', 'warning');
                return;
            }
            if (tamanhosSet.has(tamanho)) {
                showToast(`Tamanho ${tamanho} duplicado na lista`, 'warning');
                return;
            }
            if (skusSet.has(sku)) {
                showToast(`SKU ${sku} duplicado na lista`, 'warning');
                return;
            }
            tamanhosSet.add(tamanho);
            skusSet.add(sku);
            bulkItems.push({ tamanho, quantidade, sku });
        }

        if (bulkItems.length === 0) {
            showToast('Adicione pelo menos um tamanho na tabela', 'warning');
            return;
        }

        if (!confirm(`Deseja criar ${bulkItems.length} produto(s) com os SKUs informados?`)) return;

        let created = 0;
        let errors = [];

        for (let item of bulkItems) {
            // Verifica se SKU já existe no banco
            const { data: existing } = await window.supabaseClient
                .from('produtos_estoque')
                .select('id')
                .eq('sku', item.sku)
                .maybeSingle();

            if (existing) {
                errors.push(`${item.sku} (SKU já existe)`);
                continue;
            }

            const produtoDadosExtra = { ...dadosExtra };
            produtoDadosExtra.tamanhoraio = item.tamanho;

            const produtoData = {
                nome: nome,
                sku: item.sku,
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
                errors.push(`${item.sku}: ${err.message}`);
                console.error(err);
            }
        }

        if (created > 0) showToast(`✅ ${created} produto(s) criado(s) em massa!`, 'success');
        if (errors.length) showToast(`⚠️ Erros: ${errors.join(', ')}`, 'error');

        fecharModalProdutoEstoque();
        await carregarProdutosEstoque();
        return;
    }

    // --- MODO NORMAL (um produto) ---
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

// ===== SINCRONIZAÇÃO COM MERCADO LIVRE =====
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

/**
 * Analisa um SKU que pode conter múltiplas partes separadas por "."
 * Ex: "03600000RARIJ280PTN_KSI.03600000RARIJ275PTN_KSI"
 * Retorna um array de objetos: { quantidadePorKit, tamanho }
 */
function parseMultiSkuVariation(skuString) {
    if (!skuString || typeof skuString !== 'string') return null;
    
    const partes = skuString.split('.');
    const resultados = [];
    
    for (const parte of partes) {
        // Extrai todos os grupos de 2 ou 3 dígitos
        const grupos = parte.match(/\d{2,3}/g);
        if (!grupos || grupos.length < 2) continue;
        
        // 1) Quantidade: primeiro grupo que seja > 0 (ignorar zeros à esquerda)
        let quantidade = null;
        for (let i = 0; i < grupos.length; i++) {
            const num = parseInt(grupos[i], 10);
            if (num > 0) {
                quantidade = num;
                break;
            }
        }
        if (quantidade === null) quantidade = parseInt(grupos[0], 10); // fallback
        
        // 2) Tamanho: último grupo de 3 dígitos (assumindo que seja o tamanho)
        let tamanho = null;
        for (let i = grupos.length - 1; i >= 0; i--) {
            if (grupos[i].length === 3) {
                tamanho = parseInt(grupos[i], 10);
                break;
            }
        }
        
        if (quantidade && tamanho) {
            resultados.push({ 
                quantidadePorKit: quantidade, 
                tamanho: tamanho.toString() 
            });
        }
    }
    
    return resultados.length ? resultados : null;
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

                if (item.variations && item.variations.length > 0) {
                    let variacaoAlvo = encontrarVariacaoPorSKU(item, skuProduto);
                    if (variacaoAlvo) {
                        skuAnuncio = extrairSkuDaVariacao(variacaoAlvo);
                    } else {
                        for (let v of item.variations) {
                            let testSku = extrairSkuDaVariacao(v);
                            if (testSku && testSku.match(/\d/)) {
                                skuAnuncio = testSku;
                                break;
                            }
                        }
                    }
                } else {
                    skuAnuncio = extrairSkuDoItem(item);
                }

                if (!skuAnuncio) {
                    const matchId = item.id.match(/\d+$/);
                    if (matchId) skuAnuncio = matchId[0];
                }
                console.log(`🔎 SKU encontrado no anúncio: "${skuAnuncio}"`);

                const isMultiSku = skuAnuncio && skuAnuncio.includes('.');
                let kitsPossiveis = 0;

                if (isMultiSku) {
                    const partes = parseMultiSkuVariation(skuAnuncio);
                    if (!partes || partes.length === 0) {
                        console.warn("⚠️ Não foi possível parsear o multi-SKU.");
                        quantidadeParaEnviar = 0;
                    } else {
                        console.log(`📦 Kit com ${partes.length} tamanhos:`, partes);
                        let kitsPorTamanho = [];
                        for (const parte of partes) {
                            const produtoTamanho = produtosEstoque.find(p =>
                                p.categoria === 'Raios' &&
                                p.dados_extra?.marca === marcaProduto &&
                                p.dados_extra?.modelo === modeloProduto &&
                                p.dados_extra?.cabeçaraio === produto.dados_extra?.cabeçaraio &&
                                p.dados_extra?.tamanhoraio == parte.tamanho
                            );
                            if (!produtoTamanho) {
                                console.warn(`⚠️ Produto com tamanho ${parte.tamanho} não encontrado no estoque.`);
                                kitsPorTamanho.push(0);
                            } else {
                                const estoqueUnidades = produtoTamanho.quantidade;
                                const kits = Math.floor(estoqueUnidades / parte.quantidadePorKit);
                                console.log(`   Tamanho ${parte.tamanho}: ${estoqueUnidades} un. → ${kits} kits (${parte.quantidadePorKit} un/kit)`);
                                kitsPorTamanho.push(kits);
                            }
                        }
                        const minKits = Math.min(...kitsPorTamanho);
                        kitsPossiveis = minKits > 0 ? minKits : 0;
                        console.log(`📊 Kits possíveis (limitado pelo menor estoque): ${kitsPossiveis}`);
                    }
                } else {
                    const raiosPorKit = extrairUnidadesPorKit(skuAnuncio);
                    console.log(`📦 Raios por kit (normal): ${raiosPorKit}`);
                    kitsPossiveis = Math.floor(quantidadeReal / raiosPorKit);
                    if (kitsPossiveis < 0) kitsPossiveis = 0;
                    console.log(`📊 Estoque real: ${quantidadeReal} raios → ${kitsPossiveis} kits possíveis`);
                }

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
    
    // Encontra todos os grupos de 2 ou 3 dígitos
    const grupos = skuAnuncio.match(/\d{2,3}/g);
    if (!grupos) return 1;
    
    // Procura o primeiro grupo que seja maior que zero
    for (let grupo of grupos) {
        const valor = parseInt(grupo, 10);
        if (valor > 0) {
            console.log(`✅ Quantidade por kit extraída: ${valor} (do grupo "${grupo}")`);
            return valor;
        }
    }
    
    // Se todos forem zero, retorna 1 (fallback seguro)
    console.warn(`⚠️ Nenhum dígito positivo encontrado, usando 1`);
    return 1;
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