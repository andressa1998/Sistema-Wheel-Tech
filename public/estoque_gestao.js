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

// ===== USUÁRIOS QUE PODEM GERENCIAR CATEGORIAS (BRUNA E ARTHUR INCLUÍDOS) =====
const usuariosGerenciarCategorias = ['andressamiotto', 'ronald', 'leticia', 'bruna', 'arthur'];

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

// =========================================================
// REGRAS FIXAS DE TIPO DE ANÚNCIO DO MERCADO LIVRE
// =========================================================

let regrasFixasTipoAnuncioML = {
    classico: [],
    premium: []
};

let regrasFixasTipoAnuncioMLCarregadas = false;

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
    
    const prefixo = novoSKU.trim().substring(0, 8).toUpperCase();
    if (prefixo.length < 8) return { duplicado: false };
    
    const existente = produtosEstoque.find(p => {
        if (idIgnorar && p.id == idIgnorar) return false;
        const pSku = (p.sku || '').trim().toUpperCase();
        return pSku.substring(0, 8) === prefixo;
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

// =========================================================
// CARREGAR CATEGORIAS CUSTOMIZADAS
// E ATUALIZAR TODOS OS SELECTS
// =========================================================

async function carregarCategoriasCustomizadas() {

    try {

        console.log(
            '🔄 Carregando categorias customizadas...'
        );


        // =================================================
        // SEM SUPABASE
        // =================================================

        if (
            !window.supabaseClient
        ) {

            const localData =
                localStorage.getItem(
                    'categorias_customizadas'
                );


            if (
                localData
            ) {

                try {

                    categoriasCustomizadas =
                        JSON.parse(
                            localData
                        ) || {};

                } catch (error) {

                    console.error(
                        '❌ Erro lendo categorias do localStorage:',
                        error
                    );


                    categoriasCustomizadas =
                        {};

                }

            }


            console.log(
                '✅ Categorias customizadas carregadas do localStorage:',
                Object.keys(
                    categoriasCustomizadas
                )
            );


            // =============================================
            // IMPORTANTE
            // =============================================

            atualizarSelectCategorias();


            preencherListaCategorias();


            if (
                typeof preencherListaCategoriasGerenciamento ===
                'function'
            ) {

                const modalGerenciar =
                    document.getElementById(
                        'modalGerenciarCategorias'
                    );


                if (
                    modalGerenciar &&
                    modalGerenciar.style.display ===
                    'flex'
                ) {

                    preencherListaCategoriasGerenciamento();

                }

            }


            return categoriasCustomizadas;

        }


        // =================================================
        // SUPABASE
        // =================================================

        const {
            data,
            error
        } =
            await window.supabaseClient
                .from(
                    'configuracoes_sistema'
                )
                .select('*')
                .eq(
                    'chave',
                    'categorias_customizadas'
                )
                .maybeSingle();


        if (
            error
        ) {

            console.error(
                '❌ Erro ao carregar categorias customizadas:',
                error
            );


            return categoriasCustomizadas;

        }


        // =================================================
        // CARREGAR OBJETO
        // =================================================

        if (
            data &&
            data.valor
        ) {

            if (
                typeof data.valor ===
                'string'
            ) {

                try {

                    categoriasCustomizadas =
                        JSON.parse(
                            data.valor
                        ) || {};

                } catch (error) {

                    console.error(
                        '❌ JSON das categorias inválido:',
                        error
                    );


                    categoriasCustomizadas =
                        {};

                }

            } else {

                categoriasCustomizadas =
                    data.valor || {};

            }

        } else {

            categoriasCustomizadas =
                {};

        }


        // =================================================
        // FALLBACK LOCAL
        // =================================================

        localStorage.setItem(

            'categorias_customizadas',

            JSON.stringify(
                categoriasCustomizadas
            )

        );


        console.log(
            `✅ ${Object.keys(categoriasCustomizadas).length} categoria(s) customizada(s) carregada(s):`,
            Object.keys(
                categoriasCustomizadas
            )
        );


        // =================================================
        // ESSA PARTE ESTAVA FALTANDO
        // =================================================

        atualizarSelectCategorias();


        preencherListaCategorias();


        if (
            typeof preencherListaCategoriasGerenciamento ===
            'function'
        ) {

            const modalGerenciar =
                document.getElementById(
                    'modalGerenciarCategorias'
                );


            if (
                modalGerenciar &&
                modalGerenciar.style.display ===
                'flex'
            ) {

                preencherListaCategoriasGerenciamento();

            }

        }


        return categoriasCustomizadas;


    } catch (error) {

        console.error(
            '❌ Erro ao carregar categorias customizadas:',
            error
        );


        categoriasCustomizadas =
            {};


        atualizarSelectCategorias();


        return categoriasCustomizadas;

    }
}

// ===== ABRIR MODAL DE CATEGORIAS =====
function abrirModalCategorias() {
    const username = currentUser?.username?.toLowerCase() || '';
    const isAuthorized = usuariosGerenciarCategorias.includes(username);
    
    if (!isAuthorized) {
        showToast('⚠️ Apenas usuários autorizados podem gerenciar categorias.', 'warning');
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

// =========================================================
// ATUALIZAR TODOS OS SELECTS DE CATEGORIAS
// PADRÃO + CUSTOMIZADAS
// =========================================================

function atualizarSelectCategorias() {

    console.log(
        '🔄 [CATEGORIAS] Atualizando selects...',
        Object.keys(categoriasCustomizadas || {})
    );


    // =====================================================
    // CATEGORIAS PADRÃO
    //
    // value = valor salvo no banco
    // label = nome mostrado para usuário
    // =====================================================

    const categoriasPadrao = [

        {
            value: 'Eixos',
            label: 'Eixos Passantes'
        },

        {
            value: 'Parafusos',
            label: 'Parafusos'
        },

        {
            value: 'Rolamentos',
            label: 'Rolamentos'
        },

        {
            value: 'Raios',
            label: 'Raios'
        },

        {
            value: 'Arruelas',
            label: 'Arruelas'
        },

        {
            value: 'CapacetesEPartes',
            label: 'Capacetes e Partes'
        },

        {
            value: 'Porcas',
            label: 'Porcas'
        }

    ];


    // =====================================================
    // CATEGORIAS CUSTOMIZADAS
    // =====================================================

    const categoriasCustom =
        Object.keys(
            categoriasCustomizadas || {}
        )
        .filter(Boolean)
        .sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    'pt-BR'
                )
        );


    // =====================================================
    // SELECTS EXISTENTES
    // =====================================================

    const selects = [

        document.getElementById(
            'filtroCategoriaEstoque'
        ),

        document.getElementById(
            'produtoCategoria'
        ),

        // Importador de produtos que estamos criando
        document.getElementById(
            'categoriaCadastroInicialSelecionada'
        )

    ].filter(Boolean);


    selects.forEach(
        select => {

            const valorAtual =
                select.value;


            const isFiltro =
                select.id ===
                'filtroCategoriaEstoque';


            const isImportador =
                select.id ===
                'categoriaCadastroInicialSelecionada';


            // Limpa
            select.innerHTML = '';


            // =================================================
            // PRIMEIRA OPÇÃO
            // =================================================

            const primeira =
                document.createElement(
                    'option'
                );


            primeira.value = '';


            if (isFiltro) {

                primeira.textContent =
                    'Todas as categorias';

            } else if (isImportador) {

                primeira.textContent =
                    'Selecione a categoria para importação...';

            } else {

                primeira.textContent =
                    'Selecione uma categoria';

            }


            select.appendChild(
                primeira
            );


            // =================================================
            // PADRÃO
            // =================================================

            categoriasPadrao.forEach(
                categoria => {

                    const option =
                        document.createElement(
                            'option'
                        );


                    option.value =
                        categoria.value;


                    option.textContent =
                        categoria.label;


                    select.appendChild(
                        option
                    );

                }
            );


            // =================================================
            // CUSTOMIZADAS
            // =================================================

            categoriasCustom.forEach(
                nome => {

                    // Evita uma categoria customizada
                    // duplicando uma padrão
                    const jaExiste =
                        categoriasPadrao.some(
                            padrao =>
                                padrao.value === nome
                        );


                    if (jaExiste) {
                        return;
                    }


                    const option =
                        document.createElement(
                            'option'
                        );


                    option.value =
                        nome;


                    option.textContent =
                        `${nome} ★`;


                    option.dataset.customizada =
                        'true';


                    select.appendChild(
                        option
                    );

                }
            );


            // =================================================
            // OUTROS
            // =================================================

            const optionOutros =
                document.createElement(
                    'option'
                );


            optionOutros.value =
                'outros';


            optionOutros.textContent =
                'Outros';


            select.appendChild(
                optionOutros
            );


            // =================================================
            // RESTAURAR VALOR ANTERIOR
            // =================================================

            if (
                valorAtual &&
                Array.from(
                    select.options
                ).some(
                    option =>
                        option.value ===
                        valorAtual
                )
            ) {

                select.value =
                    valorAtual;

            }


            console.log(
                `✅ [CATEGORIAS] ${select.id}: ${select.options.length} opções`
            );

        }
    );
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

    // =========================================================
    // GARANTIR BOTÃO DE IMPORTAÇÃO
    // =========================================================

    setTimeout(adicionarBotaoImportarPlanilhaML, 300);
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
// APLICAR FILTROS E ORDENAÇÃO - COM PESQUISA EM ATRIBUTOS
// =========================================================

function aplicarFiltrosEOrdenacao() {
    let filtrados = produtosEstoque;

    // Filtro por categoria
    if (estadoFiltrosEstoque.categoria && estadoFiltrosEstoque.categoria !== '') {
        filtrados = filtrados.filter(prod => prod.categoria === estadoFiltrosEstoque.categoria);
    }

    // Filtro por termo de busca (incluindo atributos específicos)
    if (estadoFiltrosEstoque.termo) {
        const termo = estadoFiltrosEstoque.termo.toLowerCase();
        
        filtrados = filtrados.filter(prod => {
            // ===== BUSCA EM CAMPOS PADRÃO =====
            if (prod.nome && prod.nome.toLowerCase().includes(termo)) return true;
            if (prod.sku && prod.sku.toLowerCase().includes(termo)) return true;
            if (prod.categoria && prod.categoria.toLowerCase().includes(termo)) return true;
            
            // ===== BUSCA EM MLB CODES =====
            if (prod.mlb_codes) {
                let mlbArray = prod.mlb_codes;
                if (typeof mlbArray === 'string') mlbArray = mlbArray.split(',').map(s => s.trim());
                if (Array.isArray(mlbArray)) {
                    if (mlbArray.some(code => code.toLowerCase().includes(termo))) return true;
                }
            }
            
            // ===== BUSCA EM ATRIBUTOS ESPECÍFICOS (dados_extra) =====
            if (prod.dados_extra && typeof prod.dados_extra === 'object') {
                for (const [chave, valor] of Object.entries(prod.dados_extra)) {
                    // Ignorar campos especiais
                    if (chave === 'mlb_codes' || chave === 'historico_custos' || chave === 'bloquear_sync_ml') continue;
                    
                    // Se o valor é string e contém o termo
                    if (typeof valor === 'string' && valor.toLowerCase().includes(termo)) return true;
                    
                    // Se o valor é número, converter para string e verificar
                    if (typeof valor === 'number' && String(valor).includes(termo)) return true;
                    
                    // Se o valor é array (ex: opções de seleção múltipla)
                    if (Array.isArray(valor)) {
                        if (valor.some(item => typeof item === 'string' && item.toLowerCase().includes(termo))) return true;
                    }
                    
                    // Se o valor é objeto (caso aninhado)
                    if (typeof valor === 'object' && valor !== null) {
                        const valorString = JSON.stringify(valor).toLowerCase();
                        if (valorString.includes(termo)) return true;
                    }
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
        
        // Mostrar prefixo do SKU (8 primeiros caracteres)
        const skuPrefix = prod.sku ? prod.sku.substring(0, 8).toUpperCase() : '-';
        
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
// HISTÓRICO DE MOVIMENTAÇÕES
// COM FILTRO POR PERÍODO
// =========================================================

async function verHistoricoMovimentacoes(produtoId) {

    const produto = produtosEstoque.find(
        p => p.id == produtoId
    );


    if (!produto) {

        showToast(
            'Produto não encontrado',
            'error'
        );

        return;
    }


    try {

        // =================================================
        // BUSCAR TODO O HISTÓRICO UMA ÚNICA VEZ
        // =================================================

        const { data, error } =
            await window.supabaseClient
                .from('estoque_movimentacoes')
                .select('*')
                .eq(
                    'produto_id',
                    produtoId
                )
                .order(
                    'data_hora',
                    {
                        ascending: true
                    }
                );


        if (error) {

            console.error(error);

            showToast(
                'Erro ao carregar histórico',
                'error'
            );

            return;
        }


        // =================================================
        // SALVAR DADOS EM MEMÓRIA
        // =================================================

        window._historicoEstoqueProduto =
            produto;


        window._historicoEstoqueDados =
            Array.isArray(data)
                ? data
                : [];


        window._historicoEstoqueProdutoId =
            produtoId;


        // =================================================
        // REMOVER MODAL ANTERIOR
        // =================================================

        const modalAnterior =
            document.getElementById(
                'modalHistoricoEstoque'
            );


        if (modalAnterior) {

            modalAnterior.remove();

        }


        // =================================================
        // CRIAR MODAL
        // =================================================

        const modal =
            document.createElement('div');


        modal.id =
            'modalHistoricoEstoque';


        modal.className =
            'modal';


        modal.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0,0,0,0.5);
            z-index: 99999;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
        `;


        modal.innerHTML = `

            <div
                class="modal-content"
                style="
                    max-width: 95%;
                    width: 100%;
                    max-height: 92vh;
                    overflow-y: auto;
                    background: white;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                "
            >

                <!-- ====================================== -->
                <!-- CABEÇALHO -->
                <!-- ====================================== -->

                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                        border-bottom: 2px solid #f1f3f5;
                        padding-bottom: 10px;
                    "
                >

                    <h3
                        style="
                            margin: 0;
                            color: #00ADEE;
                            font-size: 18px;
                        "
                    >

                        <i class="fas fa-history"></i>

                        Histórico de Movimentações

                    </h3>


                    <button
                        onclick="fecharHistoricoEstoque()"
                        style="
                            background: none;
                            border: none;
                            font-size: 22px;
                            cursor: pointer;
                            color: #6c757d;
                        "
                    >
                        &times;
                    </button>

                </div>


                <!-- ====================================== -->
                <!-- PRODUTO -->
                <!-- ====================================== -->

                <div
                    style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                        flex-wrap: wrap;
                        gap: 10px;
                    "
                >

                    <div>

                        <h3
                            style="
                                margin: 0;
                                color: #00ADEE;
                            "
                        >

                            <i class="fas fa-box"></i>

                            ${escapeHtml(produto.nome)}

                        </h3>


                        <p
                            style="
                                margin: 5px 0 0;
                                color: #6c757d;
                                font-size: 13px;
                            "
                        >

                            <strong>SKU:</strong>
                            ${escapeHtml(produto.sku)}

                            &bull;

                            <strong>Categoria:</strong>
                            ${escapeHtml(
                                produto.categoria ||
                                'sem categoria'
                            )}

                        </p>

                    </div>


                    <div
                        style="
                            background: #f8f9fa;
                            padding: 10px 20px;
                            border-radius: 8px;
                            text-align: center;
                            border: 1px solid #e9ecef;
                        "
                    >

                        <div
                            style="
                                font-size: 12px;
                                color: #6c757d;
                            "
                        >
                            Estoque Atual
                        </div>


                        <div
                            style="
                                font-size: 28px;
                                font-weight: bold;
                                color: ${
                                    produto.quantidade > 0
                                        ? '#28a745'
                                        : '#dc3545'
                                };
                            "
                        >

                            ${produto.quantidade}

                            <span
                                style="
                                    font-size: 14px;
                                    font-weight: normal;
                                    color: #6c757d;
                                "
                            >
                                unidades
                            </span>

                        </div>

                    </div>

                </div>


                <!-- ====================================== -->
                <!-- FILTRO DE PERÍODO -->
                <!-- ====================================== -->

                <div
                    style="
                        background: #f8f9fa;
                        border: 1px solid #dee2e6;
                        border-radius: 8px;
                        padding: 12px 15px;
                        margin-bottom: 18px;
                    "
                >

                    <div
                        style="
                            display: flex;
                            align-items: flex-end;
                            gap: 10px;
                            flex-wrap: wrap;
                        "
                    >

                        <div>

                            <label
                                style="
                                    display: block;
                                    font-size: 11px;
                                    font-weight: 600;
                                    color: #495057;
                                    margin-bottom: 4px;
                                "
                            >
                                Data inicial
                            </label>


                            <input
                                type="date"
                                id="historicoDataInicio"
                                class="form-control form-control-sm"
                                style="width: 160px;"
                            >

                        </div>


                        <div>

                            <label
                                style="
                                    display: block;
                                    font-size: 11px;
                                    font-weight: 600;
                                    color: #495057;
                                    margin-bottom: 4px;
                                "
                            >
                                Data final
                            </label>


                            <input
                                type="date"
                                id="historicoDataFim"
                                class="form-control form-control-sm"
                                style="width: 160px;"
                            >

                        </div>


                        <button
                            class="btn btn-primary btn-sm"
                            onclick="aplicarFiltroHistoricoEstoque()"
                        >
                            <i class="fas fa-filter"></i>
                            Aplicar
                        </button>


                        <div
                            style="
                                width: 1px;
                                height: 30px;
                                background: #dee2e6;
                                margin: 0 3px;
                            "
                        ></div>


                        <button
                            class="btn btn-outline-secondary btn-sm"
                            onclick="definirPeriodoHistoricoEstoque('hoje')"
                        >
                            Hoje
                        </button>


                        <button
                            class="btn btn-outline-secondary btn-sm"
                            onclick="definirPeriodoHistoricoEstoque(7)"
                        >
                            7 dias
                        </button>


                        <button
                            class="btn btn-outline-secondary btn-sm"
                            onclick="definirPeriodoHistoricoEstoque(30)"
                        >
                            30 dias
                        </button>


                        <button
                            class="btn btn-outline-secondary btn-sm"
                            onclick="definirPeriodoHistoricoEstoque('mes')"
                        >
                            Este mês
                        </button>


                        <button
                            class="btn btn-outline-secondary btn-sm"
                            onclick="definirPeriodoHistoricoEstoque('tudo')"
                        >
                            Tudo
                        </button>

                    </div>


                    <div
                        id="historicoPeriodoSelecionado"
                        style="
                            margin-top: 8px;
                            color: #6c757d;
                            font-size: 11px;
                        "
                    >

                        <i class="fas fa-calendar-alt"></i>
                        Exibindo todo o histórico

                    </div>

                </div>


                <!-- ====================================== -->
                <!-- CONTEÚDO DINÂMICO -->
                <!-- ====================================== -->

                <div id="historicoEstoqueConteudo"></div>

            </div>
        `;


        document.body.appendChild(
            modal
        );


        // =================================================
        // MOSTRAR TODO O HISTÓRICO INICIALMENTE
        // =================================================

        renderizarHistoricoEstoqueFiltrado();


    } catch (error) {

        console.error(
            'Erro ao carregar histórico:',
            error
        );


        showToast(
            'Erro ao carregar histórico',
            'error'
        );

    }
}

// =========================================================
// FECHAR HISTÓRICO
// =========================================================

function fecharHistoricoEstoque() {

    const modal =
        document.getElementById(
            'modalHistoricoEstoque'
        );


    if (modal) {
        modal.remove();
    }


    if (
        window._graficoHistoricoMovimentacoesInstance
    ) {

        window
            ._graficoHistoricoMovimentacoesInstance
            .destroy();


        window
            ._graficoHistoricoMovimentacoesInstance =
            null;
    }
}


// =========================================================
// FORMATAR DATA PARA INPUT YYYY-MM-DD
// =========================================================

function formatarDataInputHistorico(data) {

    const ano =
        data.getFullYear();


    const mes =
        String(
            data.getMonth() + 1
        ).padStart(2, '0');


    const dia =
        String(
            data.getDate()
        ).padStart(2, '0');


    return `${ano}-${mes}-${dia}`;
}


// =========================================================
// FORMATAR YYYY-MM-DD PARA DD/MM/YYYY
// =========================================================

function formatarDataHistoricoBR(valor) {

    if (!valor) return '';


    const partes =
        String(valor).split('-');


    if (
        partes.length !== 3
    ) {
        return valor;
    }


    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


// =========================================================
// PERÍODOS RÁPIDOS
// =========================================================

function definirPeriodoHistoricoEstoque(periodo) {

    const campoInicio =
        document.getElementById(
            'historicoDataInicio'
        );


    const campoFim =
        document.getElementById(
            'historicoDataFim'
        );


    if (
        !campoInicio ||
        !campoFim
    ) {
        return;
    }


    // =====================================================
    // TUDO
    // =====================================================

    if (
        periodo === 'tudo'
    ) {

        campoInicio.value = '';
        campoFim.value = '';

        aplicarFiltroHistoricoEstoque();

        return;
    }


    const hoje =
        new Date();


    const fim =
        new Date(
            hoje.getFullYear(),
            hoje.getMonth(),
            hoje.getDate()
        );


    let inicio =
        new Date(fim);


    // =====================================================
    // HOJE
    // =====================================================

    if (
        periodo === 'hoje'
    ) {

        inicio =
            new Date(fim);

    }

    // =====================================================
    // ESTE MÊS
    // =====================================================

    else if (
        periodo === 'mes'
    ) {

        inicio =
            new Date(
                hoje.getFullYear(),
                hoje.getMonth(),
                1
            );

    }

    // =====================================================
    // X DIAS
    // =====================================================

    else {

        const dias =
            parseInt(periodo);


        if (
            !isNaN(dias) &&
            dias > 0
        ) {

            inicio.setDate(
                inicio.getDate() -
                (dias - 1)
            );

        }

    }


    campoInicio.value =
        formatarDataInputHistorico(
            inicio
        );


    campoFim.value =
        formatarDataInputHistorico(
            fim
        );


    aplicarFiltroHistoricoEstoque();
}


// =========================================================
// APLICAR FILTRO
// =========================================================

function aplicarFiltroHistoricoEstoque() {

    const inicio =
        document.getElementById(
            'historicoDataInicio'
        )?.value || '';


    const fim =
        document.getElementById(
            'historicoDataFim'
        )?.value || '';


    // =====================================================
    // SE PREENCHER UMA DATA, PRECISA PREENCHER AS DUAS
    // =====================================================

    if (
        (inicio && !fim) ||
        (!inicio && fim)
    ) {

        showToast(
            'Informe a data inicial e a data final.',
            'warning'
        );

        return;
    }


    if (
        inicio &&
        fim &&
        inicio > fim
    ) {

        showToast(
            'A data inicial não pode ser maior que a data final.',
            'warning'
        );

        return;
    }


    renderizarHistoricoEstoqueFiltrado(
        inicio,
        fim
    );
}


// =========================================================
// CALCULAR SALDOS DAS MOVIMENTAÇÕES
// =========================================================

function prepararMovimentosHistoricoComSaldo(dados) {

    if (
        !Array.isArray(dados)
    ) {
        return [];
    }


    let saldoFallback = 0;


    return dados.map(
        mov => {

            const quantidade =
                Number(
                    mov.quantidade
                ) || 0;


            let saldoApos;


            // =================================================
            // PREFERIR SALDO GRAVADO NO BANCO
            // =================================================

            if (
                mov.saldo_apos !== null &&
                mov.saldo_apos !== undefined &&
                mov.saldo_apos !== '' &&
                !isNaN(
                    Number(
                        mov.saldo_apos
                    )
                )
            ) {

                saldoApos =
                    Number(
                        mov.saldo_apos
                    );

            } else {

                // Fallback para registros antigos

                if (
                    mov.tipo === 'entrada'
                ) {

                    saldoFallback +=
                        quantidade;

                } else {

                    saldoFallback -=
                        quantidade;

                }


                saldoApos =
                    saldoFallback;

            }


            saldoFallback =
                saldoApos;


            return {

                ...mov,

                quantidade:
                    quantidade,

                saldo_apos:
                    saldoApos

            };

        }
    );
}


// =========================================================
// FILTRAR E RENDERIZAR HISTÓRICO
// =========================================================

function renderizarHistoricoEstoqueFiltrado(
    dataInicio = '',
    dataFim = ''
) {

    const container =
        document.getElementById(
            'historicoEstoqueConteudo'
        );


    const produto =
        window._historicoEstoqueProduto;


    const dadosBrutos =
        window._historicoEstoqueDados ||
        [];


    if (
        !container ||
        !produto
    ) {
        return;
    }


    // =====================================================
    // PREPARAR SALDO DE TODO O HISTÓRICO
    //
    // Fazemos isso ANTES do filtro para preservar o saldo
    // correto mesmo quando o período começa no meio.
    // =====================================================

    const todosMovimentos =
        prepararMovimentosHistoricoComSaldo(
            dadosBrutos
        );


    // =====================================================
    // DATAS LIMITE
    // =====================================================

    let inicioData = null;
    let fimData = null;


    if (
        dataInicio &&
        dataFim
    ) {

        inicioData =
            new Date(
                `${dataInicio}T00:00:00-03:00`
            );


        fimData =
            new Date(
                `${dataFim}T23:59:59.999-03:00`
            );

    }


    // =====================================================
    // FILTRAR
    // =====================================================

    const movimentos =
        todosMovimentos.filter(
            mov => {

                if (
                    !inicioData ||
                    !fimData
                ) {
                    return true;
                }


                const dataMov =
                    new Date(
                        mov.data_hora
                    );


                return (
                    dataMov >= inicioData &&
                    dataMov <= fimData
                );

            }
        );


    // =====================================================
    // TEXTO DO PERÍODO
    // =====================================================

    const periodoInfo =
        document.getElementById(
            'historicoPeriodoSelecionado'
        );


    if (periodoInfo) {

        if (
            dataInicio &&
            dataFim
        ) {

            periodoInfo.innerHTML = `

                <i class="fas fa-calendar-alt"></i>

                Período:

                <strong>
                    ${formatarDataHistoricoBR(dataInicio)}
                </strong>

                até

                <strong>
                    ${formatarDataHistoricoBR(dataFim)}
                </strong>

                &bull;

                ${movimentos.length}
                movimentação(ões)

            `;

        } else {

            periodoInfo.innerHTML = `

                <i class="fas fa-calendar-alt"></i>

                Exibindo

                <strong>todo o histórico</strong>

                &bull;

                ${movimentos.length}
                movimentação(ões)

            `;

        }

    }


    // =====================================================
    // ESTATÍSTICAS DO PERÍODO
    // =====================================================

    const totalEntradas =
        movimentos
            .filter(
                m =>
                    m.tipo ===
                    'entrada'
            )
            .reduce(
                (soma, m) =>
                    soma +
                    Number(
                        m.quantidade
                    ),
                0
            );


    const totalSaidas =
        movimentos
            .filter(
                m =>
                    m.tipo ===
                    'saida'
            )
            .reduce(
                (soma, m) =>
                    soma +
                    Number(
                        m.quantidade
                    ),
                0
            );


    const movimentacoesVenda =
        movimentos.filter(
            m =>
                m.tipo_entrada ===
                'venda'
        );


    const totalVendas =
        movimentacoesVenda
            .reduce(
                (soma, m) =>
                    soma +
                    Number(
                        m.quantidade
                    ),
                0
            );


    // =====================================================
    // SALDO NO COMEÇO DO PERÍODO
    // =====================================================

    let saldoInicialPeriodo =
        null;


    if (
        movimentos.length > 0
    ) {

        const primeiraMov =
            movimentos[0];


        const qtd =
            Number(
                primeiraMov.quantidade
            ) || 0;


        if (
            primeiraMov.tipo ===
            'entrada'
        ) {

            saldoInicialPeriodo =
                primeiraMov.saldo_apos -
                qtd;

        } else {

            saldoInicialPeriodo =
                primeiraMov.saldo_apos +
                qtd;

        }

    }


    // =====================================================
    // DADOS DO GRÁFICO
    // =====================================================

    const dadosGrafico =
        prepararDadosGraficoHistorico(
            movimentos
        );


    // =====================================================
    // HTML
    // =====================================================

    let html = `

        <!-- ============================================== -->
        <!-- CARDS -->
        <!-- ============================================== -->

        <div
            style="
                display: grid;
                grid-template-columns:
                    repeat(
                        auto-fit,
                        minmax(140px, 1fr)
                    );
                gap: 10px;
                margin-bottom: 20px;
            "
        >

            <div
                style="
                    background: #d4edda;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                    border-left: 4px solid #28a745;
                "
            >

                <div
                    style="
                        font-size: 11px;
                        color: #155724;
                    "
                >
                    Entradas no período
                </div>

                <div
                    style="
                        font-size: 20px;
                        font-weight: bold;
                        color: #28a745;
                    "
                >
                    +${totalEntradas}
                </div>

            </div>


            <div
                style="
                    background: #f8d7da;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                    border-left: 4px solid #dc3545;
                "
            >

                <div
                    style="
                        font-size: 11px;
                        color: #721c24;
                    "
                >
                    Saídas no período
                </div>

                <div
                    style="
                        font-size: 20px;
                        font-weight: bold;
                        color: #dc3545;
                    "
                >
                    -${totalSaidas}
                </div>

            </div>


            <div
                style="
                    background: #fff3cd;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                    border-left: 4px solid #ffc107;
                "
            >

                <div
                    style="
                        font-size: 11px;
                        color: #856404;
                    "
                >
                    Vendas realizadas
                </div>

                <div
                    style="
                        font-size: 20px;
                        font-weight: bold;
                        color: #856404;
                    "
                >
                    ${movimentacoesVenda.length}
                </div>

            </div>


            <div
                style="
                    background: #cce5ff;
                    padding: 10px;
                    border-radius: 8px;
                    text-align: center;
                    border-left: 4px solid #007bff;
                "
            >

                <div
                    style="
                        font-size: 11px;
                        color: #004085;
                    "
                >
                    Unidades vendidas
                </div>

                <div
                    style="
                        font-size: 20px;
                        font-weight: bold;
                        color: #004085;
                    "
                >
                    ${totalVendas}
                </div>

            </div>

        </div>


        <!-- ============================================== -->
        <!-- GRÁFICO -->
        <!-- ============================================== -->

        <div
            style="
                background: white;
                border-radius: 8px;
                border: 1px solid #e9ecef;
                padding: 15px;
                margin-bottom: 20px;
            "
        >

            <div
                style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                "
            >

                <div>

                    <h4
                        style="
                            margin: 0;
                            font-size: 14px;
                            color: #495057;
                        "
                    >

                        <i
                            class="fas fa-chart-line"
                            style="color: #00ADEE;"
                        ></i>

                        Movimentações no Período

                    </h4>


                    <div
                        style="
                            color: #6c757d;
                            font-size: 10px;
                            margin-top: 3px;
                        "
                    >

                        Vendas x movimentação geral
                        (entradas + saídas)

                    </div>

                </div>


                <span
                    style="
                        font-size: 11px;
                        color: #6c757d;
                    "
                >
                    ${dadosGrafico.length}
                    dia(s) com movimentação
                </span>

            </div>


            <div
                style="
                    height: 240px;
                    position: relative;
                "
            >

                <canvas
                    id="graficoHistoricoEstoque"
                    style="
                        width: 100% !important;
                        height: 100% !important;
                    "
                ></canvas>

            </div>

        </div>


        <!-- ============================================== -->
        <!-- TABELA -->
        <!-- ============================================== -->

        <div
            style="
                overflow-x: auto;
                border-radius: 8px;
                border: 1px solid #e9ecef;
                max-height: 420px;
                overflow-y: auto;
            "
        >

            <table
                style="
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                    min-width: 850px;
                "
            >

                <thead
                    style="
                        background: #f8f9fa;
                        border-bottom: 2px solid #dee2e6;
                        position: sticky;
                        top: 0;
                        z-index: 5;
                    "
                >

                    <tr>

                        <th style="padding: 8px 10px; text-align: left;">
                            Data/Hora
                        </th>

                        <th style="padding: 8px 10px; text-align: left;">
                            Tipo
                        </th>

                        <th style="padding: 8px 10px; text-align: center;">
                            Qtd
                        </th>

                        <th style="padding: 8px 10px; text-align: center;">
                            Saldo
                        </th>

                        <th style="padding: 8px 10px; text-align: left;">
                            Documento
                        </th>

                        <th style="padding: 8px 10px; text-align: left;">
                            Origem
                        </th>

                        <th style="padding: 8px 10px; text-align: left;">
                            Usuário
                        </th>

                    </tr>

                </thead>

                <tbody>
    `;


    // =====================================================
    // SEM MOVIMENTAÇÕES
    // =====================================================

    if (
        movimentos.length === 0
    ) {

        html += `

            <tr>

                <td
                    colspan="7"
                    style="
                        text-align: center;
                        padding: 35px;
                        color: #6c757d;
                    "
                >

                    <i
                        class="fas fa-search"
                        style="
                            font-size: 22px;
                            display: block;
                            margin-bottom: 8px;
                        "
                    ></i>

                    Nenhuma movimentação encontrada
                    neste período.

                </td>

            </tr>
        `;

    }


    // =====================================================
    // MOVIMENTAÇÕES MAIS RECENTES PRIMEIRO
    // =====================================================

    const movimentosReversos =
        [...movimentos].reverse();


    movimentosReversos.forEach(
        (mov, index) => {

            const dataHora =
                new Date(
                    mov.data_hora
                )
                    .toLocaleString(
                        'pt-BR',
                        {
                            timeZone:
                                'America/Sao_Paulo',

                            day:
                                '2-digit',

                            month:
                                '2-digit',

                            year:
                                'numeric',

                            hour:
                                '2-digit',

                            minute:
                                '2-digit'
                        }
                    );


            // =================================================
            // TIPO
            // =================================================

            let tipoDisplay = '';

            let bgColor = '';

            let textColor = '';

            let iconClass = '';


            if (
                mov.tipo ===
                'entrada'
            ) {

                if (
                    mov.tipo_entrada ===
                    'nova'
                ) {

                    tipoDisplay =
                        'Compra';

                    bgColor =
                        '#d4edda';

                    textColor =
                        '#155724';

                    iconClass =
                        'fa-shopping-cart';

                }

                else if (
                    mov.tipo_entrada ===
                    'devolucao'
                ) {

                    tipoDisplay =
                        'Devolução';

                    bgColor =
                        '#cce5ff';

                    textColor =
                        '#004085';

                    iconClass =
                        'fa-undo';

                }

                else {

                    tipoDisplay =
                        'Entrada';

                    bgColor =
                        '#d4edda';

                    textColor =
                        '#155724';

                    iconClass =
                        'fa-plus-circle';

                }

            }

            else {

                if (
                    mov.tipo_entrada ===
                    'venda'
                ) {

                    tipoDisplay =
                        '🛒 Venda';

                    bgColor =
                        '#fff3cd';

                    textColor =
                        '#856404';

                    iconClass =
                        'fa-shopping-bag';

                }

                else if (
                    mov.tipo_entrada ===
                    'reversao'
                ) {

                    tipoDisplay =
                        'Reversão';

                    bgColor =
                        '#f8d7da';

                    textColor =
                        '#721c24';

                    iconClass =
                        'fa-undo-alt';

                }

                else {

                    tipoDisplay =
                        'Saída';

                    bgColor =
                        '#f8d7da';

                    textColor =
                        '#721c24';

                    iconClass =
                        'fa-minus-circle';

                }

            }


            // =================================================
            // ORIGEM
            // =================================================

            let origemBadge = '';


            if (
                mov.tipo_entrada ===
                'venda'
            ) {

                origemBadge = `
                    <span
                        style="
                            background: #ffc107;
                            color: #212529;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                            font-weight: 600;
                        "
                    >
                        🛒 Venda ML
                    </span>
                `;

            }

            else if (
                mov.tipo_entrada ===
                'nova'
            ) {

                origemBadge = `
                    <span
                        style="
                            background: #28a745;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                            font-weight: 600;
                        "
                    >
                        Nova
                    </span>
                `;

            }

            else if (
                mov.tipo_entrada ===
                'devolucao'
            ) {

                origemBadge = `
                    <span
                        style="
                            background: #17a2b8;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                        "
                    >
                        Devolução
                    </span>
                `;

            }

            else if (
                mov.tipo_entrada ===
                'reversao'
            ) {

                origemBadge = `
                    <span
                        style="
                            background: #dc3545;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                        "
                    >
                        Reversão
                    </span>
                `;

            }

            else {

                origemBadge = `
                    <span
                        style="
                            background: #6c757d;
                            color: white;
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 10px;
                        "
                    >
                        ${escapeHtml(
                            mov.tipo_entrada ||
                            '-'
                        )}
                    </span>
                `;

            }


            // =================================================
            // QUANTIDADE
            // =================================================

            const qtdDisplay =
                mov.tipo === 'entrada'

                    ? `<span style="color: #28a745; font-weight: bold;">+${mov.quantidade}</span>`

                    : `<span style="color: #dc3545; font-weight: bold;">-${mov.quantidade}</span>`;


            // =================================================
            // SALDO
            // =================================================

            const saldoColor =
                mov.saldo_apos > 0

                    ? '#28a745'

                    : mov.saldo_apos === 0

                        ? '#6c757d'

                        : '#dc3545';


            const saldoBg =
                mov.saldo_apos > 0

                    ? '#d4edda'

                    : mov.saldo_apos === 0

                        ? '#e9ecef'

                        : '#f8d7da';


            const rowBg =
                index % 2 === 0

                    ? '#ffffff'

                    : '#f8f9fa';


            html += `

                <tr
                    style="
                        background: ${rowBg};
                        border-bottom: 1px solid #f1f3f5;
                    "
                >

                    <td
                        style="
                            padding: 8px 10px;
                            white-space: nowrap;
                            color: #495057;
                            font-size: 11px;
                        "
                    >
                        ${dataHora}
                    </td>


                    <td
                        style="
                            padding: 8px 10px;
                        "
                    >

                        <span
                            style="
                                background: ${bgColor};
                                color: ${textColor};
                                padding: 3px 10px;
                                border-radius: 20px;
                                font-size: 11px;
                                font-weight: 600;
                                display: inline-flex;
                                align-items: center;
                                gap: 5px;
                                white-space: nowrap;
                            "
                        >

                            <i
                                class="fas ${iconClass}"
                            ></i>

                            ${tipoDisplay}

                        </span>

                    </td>


                    <td
                        style="
                            padding: 8px 10px;
                            text-align: center;
                            font-size: 13px;
                        "
                    >
                        ${qtdDisplay}
                    </td>


                    <td
                        style="
                            padding: 8px 10px;
                            text-align: center;
                        "
                    >

                        <span
                            style="
                                background: ${saldoBg};
                                color: ${saldoColor};
                                padding: 3px 10px;
                                border-radius: 20px;
                                font-weight: bold;
                                font-size: 13px;
                            "
                        >
                            ${mov.saldo_apos}
                        </span>

                    </td>


                    <td
                        style="
                            padding: 8px 10px;
                            color: #495057;
                            font-size: 11px;
                        "
                    >
                        ${escapeHtml(
                            mov.numero_documento ||
                            '-'
                        )}
                    </td>


                    <td
                        style="
                            padding: 8px 10px;
                        "
                    >
                        ${origemBadge}
                    </td>


                    <td
                        style="
                            padding: 8px 10px;
                            color: #495057;
                            font-size: 11px;
                            white-space: nowrap;
                        "
                    >

                        <i
                            class="fas fa-user"
                            style="
                                color: #6c757d;
                                font-size: 10px;
                            "
                        ></i>

                        ${escapeHtml(
                            mov.usuario ||
                            'sistema'
                        )}

                    </td>

                </tr>
            `;

        }
    );


    // =====================================================
    // SALDO INICIAL DO PERÍODO
    // =====================================================

    if (
        saldoInicialPeriodo !== null
    ) {

        html += `

            <tr
                style="
                    background: #e9ecef;
                    border-top: 2px solid #dee2e6;
                "
            >

                <td
                    style="
                        padding: 8px 10px;
                        font-weight: 600;
                        color: #495057;
                    "
                >
                    📦 Início do período
                </td>


                <td
                    style="
                        padding: 8px 10px;
                    "
                >

                    <span
                        style="
                            background: #6c757d;
                            color: white;
                            padding: 3px 10px;
                            border-radius: 20px;
                            font-size: 11px;
                        "
                    >
                        Inicial
                    </span>

                </td>


                <td
                    style="
                        padding: 8px 10px;
                        text-align: center;
                    "
                >
                    -
                </td>


                <td
                    style="
                        padding: 8px 10px;
                        text-align: center;
                    "
                >

                    <strong>
                        ${saldoInicialPeriodo}
                    </strong>

                </td>


                <td
                    style="
                        padding: 8px 10px;
                        color: #6c757d;
                    "
                >
                    Saldo antes da primeira movimentação
                </td>


                <td></td>

                <td
                    style="
                        padding: 8px 10px;
                        color: #6c757d;
                    "
                >
                    Sistema
                </td>

            </tr>
        `;

    }


    html += `

                </tbody>

            </table>

        </div>


        <!-- ============================================== -->
        <!-- RODAPÉ -->
        <!-- ============================================== -->

        <div
            style="
                margin-top: 15px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            "
        >

            <div
                style="
                    font-size: 12px;
                    color: #6c757d;
                "
            >

                <strong>
                    ${movimentos.length}
                </strong>

                movimentações

                &bull;

                <span
                    style="color: #28a745;"
                >
                    +${totalEntradas}
                </span>

                entradas

                &bull;

                <span
                    style="color: #dc3545;"
                >
                    -${totalSaidas}
                </span>

                saídas

                &bull;

                <span
                    style="color: #856404;"
                >
                    🛒
                    ${movimentacoesVenda.length}
                </span>

                vendas

            </div>


            <button
                class="btn btn-secondary btn-sm"
                onclick="fecharHistoricoEstoque()"
            >

                <i class="fas fa-times"></i>

                Fechar

            </button>

        </div>
    `;


    container.innerHTML =
        html;


    // =====================================================
    // RENDERIZAR GRÁFICO
    // =====================================================

    setTimeout(
        () => {

            renderizarGraficoHistoricoMovimentacoes(
                dadosGrafico,
                produto.nome
            );

        },
        50
    );
}

// =========================================================
// PREPARAR DADOS DO GRÁFICO
//
// AGREGA AS MOVIMENTAÇÕES POR DIA:
//
// vendas
// movimentacaoGeral
// entradas
// saidas
// =========================================================

function prepararDadosGraficoHistorico(movimentos) {

    if (
        !Array.isArray(movimentos) ||
        movimentos.length === 0
    ) {
        return [];
    }


    const mapa =
        new Map();


    // =====================================================
    // FUNÇÃO PARA PEGAR DATA DE SÃO PAULO
    // =====================================================

    function obterPartesData(iso) {

        const formatador =
            new Intl.DateTimeFormat(
                'pt-BR',
                {
                    timeZone:
                        'America/Sao_Paulo',

                    day:
                        '2-digit',

                    month:
                        '2-digit',

                    year:
                        'numeric'
                }
            );


        const partes =
            formatador.formatToParts(
                new Date(iso)
            );


        const valores = {};


        partes.forEach(
            parte => {

                if (
                    parte.type !==
                    'literal'
                ) {

                    valores[
                        parte.type
                    ] =
                        parte.value;

                }

            }
        );


        return {

            dia:
                valores.day,

            mes:
                valores.month,

            ano:
                valores.year

        };
    }


    // =====================================================
    // AGRUPAR
    // =====================================================

    movimentos.forEach(
        mov => {

            const partes =
                obterPartesData(
                    mov.data_hora
                );


            const chave =
                `${partes.ano}-${partes.mes}-${partes.dia}`;


            if (
                !mapa.has(chave)
            ) {

                mapa.set(
                    chave,
                    {
                        chave:
                            chave,

                        data:
                            `${partes.dia}/${partes.mes}/${String(partes.ano).slice(-2)}`,

                        dataCompleta:
                            `${partes.dia}/${partes.mes}/${partes.ano}`,

                        vendas:
                            0,

                        entradas:
                            0,

                        saidas:
                            0,

                        movimentacaoGeral:
                            0
                    }
                );

            }


            const registro =
                mapa.get(chave);


            const quantidade =
                Number(
                    mov.quantidade
                ) || 0;


            // =================================================
            // MOVIMENTAÇÃO GERAL
            //
            // É VOLUME MOVIMENTADO:
            //
            // entrada 5 + saída 3 = 8 movimentadas
            // =================================================

            registro.movimentacaoGeral +=
                quantidade;


            // =================================================
            // ENTRADAS / SAÍDAS
            // =================================================

            if (
                mov.tipo ===
                'entrada'
            ) {

                registro.entradas +=
                    quantidade;

            } else {

                registro.saidas +=
                    quantidade;

            }


            // =================================================
            // VENDAS
            // =================================================

            if (
                mov.tipo_entrada ===
                'venda'
            ) {

                registro.vendas +=
                    quantidade;

            }

        }
    );


    return Array.from(
        mapa.values()
    );
}

// =========================================================
// GRÁFICO DO HISTÓRICO
//
// LINHA 1 = VENDAS
// LINHA 2 = MOVIMENTAÇÃO GERAL
// =========================================================

function renderizarGraficoHistoricoMovimentacoes(
    dados,
    nomeProduto
) {

    const canvas =
        document.getElementById(
            'graficoHistoricoEstoque'
        );


    if (!canvas) {

        console.warn(
            'Canvas do gráfico não encontrado'
        );

        return;
    }


    // =====================================================
    // SEM DADOS
    // =====================================================

    if (
        !dados ||
        dados.length === 0
    ) {

        const container =
            canvas.parentElement;


        if (container) {

            container.innerHTML = `

                <div
                    style="
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: #6c757d;
                        font-size: 13px;
                    "
                >

                    <div
                        style="
                            text-align: center;
                        "
                    >

                        <i
                            class="fas fa-chart-line"
                            style="
                                display: block;
                                font-size: 24px;
                                margin-bottom: 8px;
                                opacity: 0.5;
                            "
                        ></i>

                        Nenhuma movimentação
                        neste período

                    </div>

                </div>
            `;

        }


        return;
    }


    // =====================================================
    // CARREGAR CHART.JS
    // =====================================================

    if (
        typeof Chart ===
        'undefined'
    ) {

        console.warn(
            'Chart.js não carregado. Carregando...'
        );


        const script =
            document.createElement(
                'script'
            );


        script.src =
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';


        script.onload =
            function() {

                setTimeout(
                    () =>
                        renderizarGraficoHistoricoMovimentacoes(
                            dados,
                            nomeProduto
                        ),
                    100
                );

            };


        document.head.appendChild(
            script
        );


        return;
    }


    // =====================================================
    // DESTRUIR GRÁFICO ANTERIOR
    // =====================================================

    if (
        window
            ._graficoHistoricoMovimentacoesInstance
    ) {

        window
            ._graficoHistoricoMovimentacoesInstance
            .destroy();


        window
            ._graficoHistoricoMovimentacoesInstance =
            null;

    }


    const ctx =
        canvas.getContext(
            '2d'
        );


    const labels =
        dados.map(
            d => d.data
        );


    const vendas =
        dados.map(
            d => d.vendas
        );


    const movimentacaoGeral =
        dados.map(
            d =>
                d.movimentacaoGeral
        );


    // =====================================================
    // CRIAR GRÁFICO
    // =====================================================

    window
        ._graficoHistoricoMovimentacoesInstance =
        new Chart(
            ctx,
            {

                type:
                    'line',


                data: {

                    labels:
                        labels,


                    datasets: [

                        // =================================
                        // VENDAS
                        // =================================

                        {

                            label:
                                'Vendas',

                            data:
                                vendas,

                            borderColor:
                                '#ffc107',

                            backgroundColor:
                                'rgba(255, 193, 7, 0.10)',

                            borderWidth:
                                3,

                            tension:
                                0.3,

                            fill:
                                false,

                            pointRadius:
                                4,

                            pointHoverRadius:
                                7,

                            pointBackgroundColor:
                                '#ffc107',

                            pointBorderColor:
                                '#ffffff',

                            pointBorderWidth:
                                2

                        },


                        // =================================
                        // MOVIMENTAÇÃO GERAL
                        // =================================

                        {

                            label:
                                'Movimentação geral',

                            data:
                                movimentacaoGeral,

                            borderColor:
                                '#00ADEE',

                            backgroundColor:
                                'rgba(0, 173, 238, 0.10)',

                            borderWidth:
                                3,

                            tension:
                                0.3,

                            fill:
                                false,

                            pointRadius:
                                4,

                            pointHoverRadius:
                                7,

                            pointBackgroundColor:
                                '#00ADEE',

                            pointBorderColor:
                                '#ffffff',

                            pointBorderWidth:
                                2

                        }

                    ]

                },


                options: {

                    responsive:
                        true,

                    maintainAspectRatio:
                        false,


                    interaction: {

                        intersect:
                            false,

                        mode:
                            'index'

                    },


                    plugins: {

                        // =============================
                        // LEGENDA
                        // =============================

                        legend: {

                            display:
                                true,

                            position:
                                'top',

                            labels: {

                                font: {

                                    size:
                                        11,

                                    weight:
                                        '600'

                                },

                                color:
                                    '#495057',

                                usePointStyle:
                                    true,

                                pointStyle:
                                    'circle'

                            }

                        },


                        // =============================
                        // TOOLTIP
                        // =============================

                        tooltip: {

                            callbacks: {

                                title:
                                    function(context) {

                                        if (
                                            !context ||
                                            context.length === 0
                                        ) {
                                            return '';
                                        }


                                        const index =
                                            context[0]
                                                .dataIndex;


                                        const dado =
                                            dados[index];


                                        return dado
                                            ?.dataCompleta ||
                                            '';

                                    },


                                label:
                                    function(context) {

                                        const index =
                                            context.dataIndex;


                                        const dado =
                                            dados[index];


                                        if (!dado) {
                                            return '';
                                        }


                                        // =====================
                                        // VENDAS
                                        // =====================

                                        if (
                                            context.datasetIndex ===
                                            0
                                        ) {

                                            return `Vendas: ${dado.vendas} unidade(s)`;

                                        }


                                        // =====================
                                        // MOVIMENTAÇÃO GERAL
                                        // =====================

                                        return [

                                            `Movimentação geral: ${dado.movimentacaoGeral} unidade(s)`,

                                            `Entradas: +${dado.entradas}`,

                                            `Saídas: -${dado.saidas}`

                                        ];

                                    }

                            }

                        }

                    },


                    scales: {

                        // =============================
                        // EIXO X
                        // =============================

                        x: {

                            grid: {
                                display:
                                    false
                            },


                            ticks: {

                                font: {
                                    size:
                                        9
                                },

                                maxTicksLimit:
                                    20,

                                color:
                                    '#6c757d'

                            }

                        },


                        // =============================
                        // EIXO Y
                        // =============================

                        y: {

                            beginAtZero:
                                true,


                            grid: {

                                color:
                                    'rgba(0,0,0,0.05)',

                                drawBorder:
                                    false

                            },


                            ticks: {

                                precision:
                                    0,

                                font: {
                                    size:
                                        10
                                },

                                color:
                                    '#6c757d'

                            },


                            title: {

                                display:
                                    true,

                                text:
                                    'Unidades',

                                color:
                                    '#6c757d',

                                font: {
                                    size:
                                        11
                                }

                            }

                        }

                    }

                }

            }
        );


    console.log(
        `✅ Gráfico de vendas/movimentações renderizado para ${nomeProduto}`
    );
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
        { nome: "material", label: "Material", tipo: "text", placeholder: "Ex: Titânio" },
        { nome: "tipochave", label: "Tipo de Chave", tipo: "text", placeholder: "Ex: Allen" },
        { nome: "cabeça", label: "Cabeça", tipo: "select", opcoes: ["Abaulada", "Reta", "Enflexada", "Cônica"] },
        { nome: "cor", label: "Cor", tipo: "select", opcoes: ["Preto", "Dourado", "Rainbow", "Natural", "Verde", "Cinza", "Multicolor"] },
        { nome: "mlb_codes", label: "Códigos MLB", tipo: "textarea", placeholder: "MLB separados por vírgula", rows: 2 }
    ],
    Rolamentos: [
        { nome: "diametroint", label: "Diâmetro Interno", tipo: "text", placeholder: "Ex: 15 ou 15,5", obrigatorio: true, validacao: "numero_virgula" },
        { nome: "diametroext", label: "Diâmetro Externo", tipo: "text", placeholder: "Ex: 26 ou 26,5", obrigatorio: true, validacao: "numero_virgula" },
        { nome: "largura", label: "Largura", tipo: "number", placeholder: "Ex: 7", obrigatorio: true },
        { nome: "aplicaçao", label: "Aplicação", tipo: "select", opcoes: ["Caixa de Direção", "Cubo/Movimento Central", "Outros"] },
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
            const shouldShow = (valorAplicacao === 'Caixa de Direção');
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
// AJUSTAR TIPO DO ANÚNCIO PELO ESTOQUE
//
// REGRA:
// - Se QUALQUER produto do MLB estiver com estoque = 1
//   → CLÁSSICO (gold_special)
//
// - Se nenhum estiver com 1 e houver estoque > 1
//   → PREMIUM (gold_pro)
//
// - Se todos estiverem com estoque 0
//   → não altera o tipo
//
// IMPORTANTE:
// O listing_type pertence ao MLB inteiro, e não à variação.
// Por isso verificamos TODOS os produtos existentes no anúncio.
// =========================================================

async function ajustarTipoAnuncioPorEstoqueML(
    item,
    produtoDisparador,
    token,
    WORKER_URL
) {
    try {

        if (!item || !item.id) {
            return {
                success: false,
                reason: 'item_invalido'
            };
        }

        // =========================================================
// REGRA FIXA DO MLB - PRIORIDADE MÁXIMA
// =========================================================

const regraFixa =
    await obterRegraFixaTipoAnuncioML(
        item.id
    );


if (
    regraFixa
) {

    console.log(
        `🔒 [TIPO ANÚNCIO] ${item.id} possui REGRA FIXA: ${regraFixa.nome}`
    );


    const tipoAtual =
        item.listing_type_id || '';


    // Já está correto
    if (
        tipoAtual ===
        regraFixa.tipo
    ) {

        console.log(
            `✅ [TIPO ANÚNCIO] ${item.id} já está ${regraFixa.nome} conforme regra fixa.`
        );


        return {
            success: true,
            skipped: true,
            regra_fixa: true,
            tipo:
                regraFixa.tipo,
            nome:
                regraFixa.nome
        };

    }


    // ===============================================
    // ALTERAR PARA O TIPO FIXO
    // ===============================================

    const apiUrl =
        `https://api.mercadolibre.com/items/${item.id}/listing_type`;


    const proxyUrl =
        `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(
            apiUrl
        )}&token=${encodeURIComponent(
            token
        )}`;


    console.log(
        `🔒 [TIPO ANÚNCIO] Aplicando regra fixa ${regraFixa.nome} em ${item.id}`
    );


    const response =
        await fetch(
            proxyUrl,
            {

                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json',
                    'Accept':
                        'application/json'
                },

                body:
                    JSON.stringify({
                        id:
                            regraFixa.tipo
                    })

            }
        );


    const texto =
        await response.text();


    let dados;


    try {

        dados =
            texto
                ? JSON.parse(texto)
                : {};

    } catch (e) {

        dados = {
            raw: texto
        };

    }


    if (
        !response.ok
    ) {

        console.error(
            `❌ Não foi possível aplicar regra fixa ${regraFixa.nome} em ${item.id}:`,
            dados
        );


        return {

            success: false,

            regra_fixa: true,

            tipo:
                regraFixa.tipo,

            nome:
                regraFixa.nome,

            status:
                response.status,

            details:
                dados

        };

    }


    // Atualizar objeto local
    item.listing_type_id =
        regraFixa.tipo;


    console.log(
        `✅ ${item.id} alterado para ${regraFixa.nome} pela REGRA FIXA.`
    );


    return {

        success: true,

        changed: true,

        regra_fixa: true,

        tipo:
            regraFixa.tipo,

        nome:
            regraFixa.nome

    };

}


        // =================================================
        // TIPO ATUAL DO ANÚNCIO
        // =================================================

        const tipoAtual = item.listing_type_id || '';


        console.log(
            `📣 [TIPO ANÚNCIO] ${item.id} | Tipo atual: ${tipoAtual}`
        );


        // =================================================
        // SEGURANÇA:
        //
        // Só vamos gerenciar automaticamente anúncios que
        // já sejam Clássico ou Premium.
        //
        // Isso evita transformar sem querer anúncios
        // Grátis / Ouro / Prata / outros em Premium.
        // =================================================

        const tiposGerenciados = [
            'gold_special',
            'gold_pro'
        ];


        if (
            tipoAtual &&
            !tiposGerenciados.includes(tipoAtual)
        ) {

            console.log(
                `ℹ️ [TIPO ANÚNCIO] ${item.id} possui tipo "${tipoAtual}". Não será alterado automaticamente.`
            );


            return {
                success: true,
                skipped: true,
                reason: 'tipo_nao_gerenciado',
                tipoAtual: tipoAtual
            };
        }


        // =================================================
        // FUNÇÃO LOCAL PARA EXTRAIR SKU
        // =================================================

        function extrairSkuVariacaoLocal(variacao) {

            if (!variacao) return null;


            if (variacao.seller_custom_field) {
                return variacao.seller_custom_field;
            }


            if (
                variacao.attributes &&
                Array.isArray(variacao.attributes)
            ) {

                const skuAttr =
                    variacao.attributes.find(
                        attr =>
                            attr.id === 'SELLER_SKU'
                    );


                if (
                    skuAttr &&
                    skuAttr.value_name
                ) {
                    return skuAttr.value_name;
                }

            }


            if (variacao.sku) {
                return variacao.sku;
            }


            return null;
        }


        // =================================================
        // EXTRAIR SKU DO ITEM SEM VARIAÇÕES
        // =================================================

        function extrairSkuItemLocal(itemLocal) {

            if (!itemLocal) return null;


            if (itemLocal.seller_custom_field) {
                return itemLocal.seller_custom_field;
            }


            if (
                itemLocal.attributes &&
                Array.isArray(itemLocal.attributes)
            ) {

                const skuAttr =
                    itemLocal.attributes.find(
                        attr =>
                            attr.id === 'SELLER_SKU'
                    );


                if (
                    skuAttr &&
                    skuAttr.value_name
                ) {
                    return skuAttr.value_name;
                }

            }


            if (itemLocal.sku) {
                return itemLocal.sku;
            }


            return null;
        }


        // =================================================
        // BASE DE 8 CARACTERES DO SKU DO SISTEMA
        // =================================================

        function extrairBaseLocal(sku) {

            if (!sku) return '';


            return String(sku)
                .trim()
                .substring(0, 8)
                .toUpperCase();
        }


        // =================================================
        // ENCONTRAR PRODUTO DO NOSSO ESTOQUE
        //
        // IMPORTANTE:
        // primeiro tenta o código completo.
        //
        // Assim:
        //
        // 032RIJ255PT
        //
        // NÃO será interpretado automaticamente como:
        //
        // quantidade 032 + RIJ255PT
        // =================================================

        function encontrarProdutoLocal(parteSku) {

            if (
                !parteSku ||
                !Array.isArray(produtosEstoque)
            ) {
                return null;
            }


            const codigo =
                String(parteSku)
                    .trim()
                    .toUpperCase();


            if (!codigo) {
                return null;
            }


            // =================================================
            // 1. SKU EXATO
            // =================================================

            let encontrado =
                produtosEstoque.find(
                    p =>
                        String(p.sku || '')
                            .trim()
                            .toUpperCase() === codigo
                );


            if (encontrado) {
                return encontrado;
            }


            // =================================================
            // 2. TESTAR PREFIXO DE QUANTIDADE
            //
            // Ex:
            // 002032RIJ255PT
            //
            // quantidade 2
            // SKU 032RIJ255PT
            // =================================================

            const matchPrefixo =
                codigo.match(
                    /^(\d{3})(.+)$/
                );


            if (matchPrefixo) {

                const semPrefixo =
                    String(matchPrefixo[2])
                        .trim()
                        .toUpperCase();


                // SKU exato sem prefixo
                encontrado =
                    produtosEstoque.find(
                        p =>
                            String(p.sku || '')
                                .trim()
                                .toUpperCase() === semPrefixo
                    );


                if (encontrado) {
                    return encontrado;
                }


                // Base 8 sem prefixo
                const baseSemPrefixo =
                    extrairBaseLocal(
                        semPrefixo
                    );


                encontrado =
                    produtosEstoque.find(
                        p =>
                            extrairBaseLocal(
                                p.sku
                            ) ===
                            baseSemPrefixo
                    );


                if (encontrado) {
                    return encontrado;
                }

            }


            // =================================================
            // 3. FALLBACK PELA BASE DE 8
            // =================================================

            const base =
                extrairBaseLocal(
                    codigo
                );


            encontrado =
                produtosEstoque.find(
                    p =>
                        extrairBaseLocal(
                            p.sku
                        ) ===
                        base
                );


            return encontrado || null;
        }


        // =================================================
        // PRODUTOS ENCONTRADOS DENTRO DO MLB
        // =================================================

        const produtosRelacionados =
            new Map();


        function adicionarProduto(produto) {

            if (!produto) return;


            const chave =
                produto.id !== undefined &&
                produto.id !== null

                    ? `ID:${produto.id}`

                    : `SKU:${String(
                        produto.sku || ''
                    ).toUpperCase()}`;


            produtosRelacionados.set(
                chave,
                produto
            );
        }


        // =================================================
        // SEMPRE ADICIONA O PRODUTO QUE DISPAROU A SYNC
        // =================================================

        if (produtoDisparador) {

            // Tenta pegar versão mais atual no array local
            const produtoAtualizado =
                produtosEstoque.find(
                    p =>
                        p.id == produtoDisparador.id
                );


            adicionarProduto(
                produtoAtualizado ||
                produtoDisparador
            );

        }


        // =================================================
        // ANÚNCIO COM VARIAÇÕES
        // =================================================

        if (
            item.variations &&
            item.variations.length > 0
        ) {

            console.log(
                `📣 [TIPO ANÚNCIO] Verificando ${item.variations.length} variações de ${item.id}...`
            );


            for (
                const variacao
                of item.variations
            ) {

                const codigoVariacao =
                    extrairSkuVariacaoLocal(
                        variacao
                    );


                if (!codigoVariacao) {
                    continue;
                }


                console.log(
                    `   🔍 Variação ${variacao.id}: ${codigoVariacao}`
                );


                // =========================================
                // O KIT PODE TER VÁRIOS SKUS
                //
                // Ex:
                //
                // 032RIJ260PT.032RIJ255PT
                // =========================================

                const partes =
                    String(codigoVariacao)
                        .split('.')
                        .map(
                            p => p.trim()
                        )
                        .filter(Boolean);


                for (
                    const parte
                    of partes
                ) {

                    const produtoEncontrado =
                        encontrarProdutoLocal(
                            parte
                        );


                    if (produtoEncontrado) {

                        adicionarProduto(
                            produtoEncontrado
                        );


                        console.log(
                            `      ✅ ${parte} → ${produtoEncontrado.sku} | estoque ${produtoEncontrado.quantidade}`
                        );

                    } else {

                        console.log(
                            `      ⚠️ SKU não localizado no estoque: ${parte}`
                        );

                    }

                }

            }

        }

        // =================================================
        // ANÚNCIO SEM VARIAÇÕES
        // =================================================

        else {

            const codigoItem =
                extrairSkuItemLocal(
                    item
                );


            if (codigoItem) {

                const partes =
                    String(codigoItem)
                        .split('.')
                        .map(
                            p => p.trim()
                        )
                        .filter(Boolean);


                for (
                    const parte
                    of partes
                ) {

                    const produtoEncontrado =
                        encontrarProdutoLocal(
                            parte
                        );


                    if (produtoEncontrado) {

                        adicionarProduto(
                            produtoEncontrado
                        );

                    }

                }

            }

        }


        // =================================================
        // LISTA FINAL DOS PRODUTOS RELACIONADOS
        // =================================================

        const listaProdutos =
            Array.from(
                produtosRelacionados.values()
            );


        if (
            listaProdutos.length === 0
        ) {

            console.warn(
                `⚠️ [TIPO ANÚNCIO] Nenhum produto localizado para ${item.id}.`
            );


            return {
                success: false,
                reason: 'nenhum_produto_encontrado'
            };
        }


        console.log(
            `📦 [TIPO ANÚNCIO] Produtos relacionados ao ${item.id}:`
        );


        listaProdutos.forEach(
            p => {

                console.log(
                    `   - ${p.sku}: ${p.quantidade} unidade(s)`
                );

            }
        );


        // =================================================
        // REGRA PRINCIPAL
        // =================================================

        const existeProdutoComUmaUnidade =
            listaProdutos.some(
                p =>
                    Number(
                        p.quantidade
                    ) === 1
            );


        const existeProdutoComMaisDeUma =
            listaProdutos.some(
                p =>
                    Number(
                        p.quantidade
                    ) > 1
            );


        let tipoDesejado =
            null;


        // =========================================
        // QUALQUER PRODUTO COM 1
        // → CLÁSSICO
        // =========================================

        if (
            existeProdutoComUmaUnidade
        ) {

            tipoDesejado =
                'gold_special';

        }

        // =========================================
        // NENHUM COM 1 E EXISTE ESTOQUE > 1
        // → PREMIUM
        // =========================================

        else if (
            existeProdutoComMaisDeUma
        ) {

            tipoDesejado =
                'gold_pro';

        }

        // =========================================
        // TODOS COM ZERO
        // → NÃO ALTERA
        // =========================================

        else {

            console.log(
                `ℹ️ [TIPO ANÚNCIO] ${item.id}: todos os produtos estão sem estoque. Tipo não será alterado.`
            );


            return {
                success: true,
                skipped: true,
                reason: 'estoque_zero'
            };

        }


        const nomeTipoDesejado =
            tipoDesejado === 'gold_special'

                ? 'CLÁSSICO'

                : 'PREMIUM';


        console.log(
            `📣 [TIPO ANÚNCIO] ${item.id}: desejado = ${nomeTipoDesejado} (${tipoDesejado})`
        );


        // =================================================
        // JÁ ESTÁ CORRETO
        // =================================================

        if (
            tipoAtual ===
            tipoDesejado
        ) {

            console.log(
                `✅ [TIPO ANÚNCIO] ${item.id} já está como ${nomeTipoDesejado}.`
            );


            return {
                success: true,
                skipped: true,
                reason: 'ja_esta_correto',
                listing_type_id:
                    tipoDesejado
            };

        }


        // =================================================
        // ALTERAR TIPO DE PUBLICAÇÃO
        //
        // POST
        // /items/{ITEM_ID}/listing_type
        // =================================================

        const apiUrl =
            `https://api.mercadolibre.com/items/${item.id}/listing_type`;


        const proxyUrl =
            `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(
                apiUrl
            )}&token=${encodeURIComponent(
                token
            )}`;


        console.log(
            `🔄 [TIPO ANÚNCIO] Alterando ${item.id}: ${tipoAtual} → ${tipoDesejado}`
        );


        const response =
            await fetch(
                proxyUrl,
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json',
                        'Accept':
                            'application/json'
                    },

                    body:
                        JSON.stringify({
                            id:
                                tipoDesejado
                        })
                }
            );


        const responseText =
            await response.text();


        let responseData;


        try {

            responseData =
                responseText
                    ? JSON.parse(
                        responseText
                    )
                    : {};

        } catch (e) {

            responseData = {
                raw:
                    responseText
            };

        }


        // =================================================
        // ERRO
        //
        // NÃO interrompe sincronização de estoque.
        // =================================================

        if (!response.ok) {

            console.error(
                `❌ [TIPO ANÚNCIO] Erro ao alterar ${item.id} para ${nomeTipoDesejado}:`,
                response.status,
                responseData
            );


            if (
                window.showToast
            ) {

                showToast(
                    `⚠️ Estoque será sincronizado, mas não foi possível alterar ${item.id} para ${nomeTipoDesejado}.`,
                    'warning'
                );

            }


            return {
                success: false,

                status:
                    response.status,

                tipoAtual:
                    tipoAtual,

                tipoDesejado:
                    tipoDesejado,

                details:
                    responseData
            };

        }


        // =================================================
        // SUCESSO
        // =================================================

        console.log(
            `✅ [TIPO ANÚNCIO] ${item.id} alterado para ${nomeTipoDesejado}!`,
            responseData
        );


        // Atualiza o objeto que já está em memória
        item.listing_type_id =
            tipoDesejado;


        if (
            window.showToast
        ) {

            showToast(
                `📣 ${item.id}: anúncio alterado para ${nomeTipoDesejado}`,
                'success'
            );

        }


        return {
            success: true,

            changed: true,

            tipoAnterior:
                tipoAtual,

            tipoNovo:
                tipoDesejado,

            nome:
                nomeTipoDesejado,

            response:
                responseData
        };


    } catch (error) {

        console.error(
            '❌ [TIPO ANÚNCIO] Erro inesperado:',
            error
        );


        // Muito importante:
        // não jogar o erro para cima.
        //
        // Se falhar o tipo de anúncio,
        // o estoque ainda precisa ser sincronizado.

        return {
            success: false,
            error:
                error.message
        };

    }
}

// =========================================================
// NORMALIZAR CÓDIGO MLB
// =========================================================

function normalizarMLBRegraFixa(valor) {

    if (!valor) return '';

    let texto = String(valor)
        .trim()
        .toUpperCase();

    if (!texto) return '';


    // Aceita inclusive link contendo MLB123456
    const matchMLB = texto.match(/MLB[\s\-]*(\d+)/i);

    if (matchMLB) {
        return `MLB${matchMLB[1]}`;
    }


    // Se digitou somente os números
    if (/^\d+$/.test(texto)) {
        return `MLB${texto}`;
    }


    return texto;
}


// =========================================================
// CONVERTER TEXTO DO MODAL EM LISTA DE MLBs
//
// Aceita:
// MLB123, MLB456
//
// ou:
//
// MLB123
// MLB456
//
// ou:
// MLB123; MLB456
// =========================================================

function converterTextoParaListaMLB(texto) {

    if (!texto) return [];

    const lista = String(texto)
        .split(/[\n,;]+/)
        .map(item => normalizarMLBRegraFixa(item))
        .filter(Boolean);


    return [...new Set(lista)];
}


// =========================================================
// CARREGAR REGRAS FIXAS DO SUPABASE
// =========================================================

async function carregarRegrasFixasTipoAnuncioML() {

    try {

        console.log(
            '🔄 [TIPO ML] Carregando regras fixas de Clássico/Premium...'
        );


        // =================================================
        // SEM SUPABASE
        // =================================================

        if (!window.supabaseClient) {

            const localData =
                localStorage.getItem(
                    'regras_fixas_tipo_anuncio_ml'
                );


            if (localData) {

                regrasFixasTipoAnuncioML =
                    JSON.parse(localData);

            } else {

                regrasFixasTipoAnuncioML = {
                    classico: [],
                    premium: []
                };

            }


            regrasFixasTipoAnuncioMLCarregadas = true;

            console.log(
                '✅ [TIPO ML] Regras fixas carregadas do localStorage:',
                regrasFixasTipoAnuncioML
            );

            return regrasFixasTipoAnuncioML;
        }


        // =================================================
        // SUPABASE
        // =================================================

        const { data, error } =
            await window.supabaseClient
                .from('configuracoes_sistema')
                .select('*')
                .eq(
                    'chave',
                    'regras_fixas_tipo_anuncio_ml'
                )
                .single();


        if (
            error &&
            error.code !== 'PGRST116'
        ) {
            throw error;
        }


        if (
            data &&
            data.valor
        ) {

            let valor = data.valor;


            if (
                typeof valor === 'string'
            ) {

                valor =
                    JSON.parse(valor);

            }


            regrasFixasTipoAnuncioML = {

                classico:
                    Array.isArray(valor.classico)
                        ? valor.classico
                            .map(normalizarMLBRegraFixa)
                            .filter(Boolean)
                        : [],

                premium:
                    Array.isArray(valor.premium)
                        ? valor.premium
                            .map(normalizarMLBRegraFixa)
                            .filter(Boolean)
                        : []

            };


        } else {

            regrasFixasTipoAnuncioML = {
                classico: [],
                premium: []
            };

        }


        // Remover duplicados
        regrasFixasTipoAnuncioML.classico =
            [...new Set(
                regrasFixasTipoAnuncioML.classico
            )];


        regrasFixasTipoAnuncioML.premium =
            [...new Set(
                regrasFixasTipoAnuncioML.premium
            )];


        // Fallback local
        localStorage.setItem(
            'regras_fixas_tipo_anuncio_ml',
            JSON.stringify(
                regrasFixasTipoAnuncioML
            )
        );


        regrasFixasTipoAnuncioMLCarregadas = true;


        console.log(
            '✅ [TIPO ML] Regras fixas carregadas:',
            regrasFixasTipoAnuncioML
        );


        return regrasFixasTipoAnuncioML;


    } catch (error) {

        console.error(
            '❌ [TIPO ML] Erro ao carregar regras fixas:',
            error
        );


        // =================================================
        // FALLBACK
        // =================================================

        try {

            const localData =
                localStorage.getItem(
                    'regras_fixas_tipo_anuncio_ml'
                );


            if (localData) {

                regrasFixasTipoAnuncioML =
                    JSON.parse(localData);

            }

        } catch (e) {

            console.warn(
                '⚠️ Erro ao carregar fallback das regras fixas',
                e
            );

        }


        regrasFixasTipoAnuncioMLCarregadas = true;


        return regrasFixasTipoAnuncioML;

    }
}


// =========================================================
// GARANTIR QUE AS REGRAS ESTEJAM CARREGADAS
// =========================================================

async function garantirRegrasFixasTipoAnuncioMLCarregadas() {

    if (
        regrasFixasTipoAnuncioMLCarregadas
    ) {
        return;
    }


    await carregarRegrasFixasTipoAnuncioML();
}


// =========================================================
// CONSULTAR REGRA FIXA DE UM MLB
//
// RETORNA:
//
// gold_special = Clássico
// gold_pro     = Premium
// null         = sem regra fixa
// =========================================================

async function obterRegraFixaTipoAnuncioML(itemId) {

    await garantirRegrasFixasTipoAnuncioMLCarregadas();


    const mlb =
        normalizarMLBRegraFixa(
            itemId
        );


    if (!mlb) {
        return null;
    }


    // =====================================================
    // CLÁSSICO
    // =====================================================

    if (
        regrasFixasTipoAnuncioML.classico
            .includes(mlb)
    ) {

        return {
            encontrado: true,
            mlb: mlb,
            tipo: 'gold_special',
            nome: 'CLÁSSICO'
        };

    }


    // =====================================================
    // PREMIUM
    // =====================================================

    if (
        regrasFixasTipoAnuncioML.premium
            .includes(mlb)
    ) {

        return {
            encontrado: true,
            mlb: mlb,
            tipo: 'gold_pro',
            nome: 'PREMIUM'
        };

    }


    return null;
}


// =========================================================
// SALVAR REGRAS FIXAS
// =========================================================

async function salvarRegrasFixasTipoAnuncioML(
    novasRegras
) {

    try {

        const classico =
            [...new Set(
                (novasRegras.classico || [])
                    .map(normalizarMLBRegraFixa)
                    .filter(Boolean)
            )];


        const premium =
            [...new Set(
                (novasRegras.premium || [])
                    .map(normalizarMLBRegraFixa)
                    .filter(Boolean)
            )];


        // =================================================
        // NÃO PERMITIR O MESMO MLB NAS DUAS LISTAS
        // =================================================

        const conflitos =
            classico.filter(
                mlb =>
                    premium.includes(mlb)
            );


        if (
            conflitos.length > 0
        ) {

            throw new Error(
                `Os seguintes MLBs estão simultaneamente em Clássico e Premium: ${conflitos.join(', ')}`
            );

        }


        const regrasLimpas = {
            classico,
            premium
        };


        // =================================================
        // LOCAL STORAGE
        // =================================================

        localStorage.setItem(
            'regras_fixas_tipo_anuncio_ml',
            JSON.stringify(
                regrasLimpas
            )
        );


        // =================================================
        // SUPABASE
        // =================================================

        if (
            window.supabaseClient
        ) {

            const { error } =
                await window.supabaseClient
                    .from(
                        'configuracoes_sistema'
                    )
                    .upsert({

                        chave:
                            'regras_fixas_tipo_anuncio_ml',

                        valor:
                            JSON.stringify(
                                regrasLimpas
                            ),

                        atualizado_em:
                            new Date()
                                .toISOString(),

                        atualizado_por:
                            currentUser?.name ||
                            'sistema'

                    }, {
                        onConflict: 'chave'
                    });


            if (error) {
                throw error;
            }

        }


        regrasFixasTipoAnuncioML =
            regrasLimpas;


        regrasFixasTipoAnuncioMLCarregadas =
            true;


        console.log(
            '✅ [TIPO ML] Regras fixas salvas:',
            regrasFixasTipoAnuncioML
        );


        return {
            success: true,
            regras: regrasFixasTipoAnuncioML
        };


    } catch (error) {

        console.error(
            '❌ [TIPO ML] Erro ao salvar regras fixas:',
            error
        );


        return {
            success: false,
            error: error.message
        };

    }
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
// BUSCAR PRODUTO DO ESTOQUE PELO SKU REAL
// =========================================================
function encontrarProdutoEstoquePorSkuReal(skuReal) {
    if (!skuReal || !Array.isArray(produtosEstoque)) return null;

    const skuNormalizado = String(skuReal).trim().toUpperCase();

    // Primeiro tenta o SKU completo.
    // Isso evita interpretar, por exemplo, 032RIJ255PT
    // como quantidade 032 + SKU RIJ255PT.
    const exato = produtosEstoque.find(p =>
        String(p.sku || '').trim().toUpperCase() === skuNormalizado
    );

    if (exato) return exato;

    // Fallback: mantém a regra do sistema pelos 8 primeiros caracteres.
    const base = extrairSkuBaseSistema(skuNormalizado);

    if (!base) return null;

    return produtosEstoque.find(p =>
        extrairSkuBaseSistema(p.sku) === base
    ) || null;
}


// =========================================================
// INTERPRETAR UMA PARTE DO SKU DO ANÚNCIO
//
// Exemplos:
//
// 032RIJ255PT
// -> SKU real 032RIJ255PT
// -> quantidade 1
//
// 001032RIJ255PT
// -> SKU real 032RIJ255PT
// -> quantidade 1
//
// 002032RIJ255PT
// -> SKU real 032RIJ255PT
// -> quantidade 2
//
// A função PRIMEIRO verifica se o SKU inteiro existe.
// Só depois tenta interpretar os 3 primeiros dígitos
// como quantidade.
// =========================================================
function interpretarParteSkuAnuncio(parte) {

    const original = String(parte || '').trim();

    if (!original) {
        return {
            original: '',
            skuReal: '',
            quantidadePorKit: 1,
            produtoEstoque: null,
            usouPrefixoQuantidade: false
        };
    }

    // =====================================================
    // 1. TENTA O SKU COMPLETO
    // =====================================================

    const produtoDireto = encontrarProdutoEstoquePorSkuReal(original);

    if (produtoDireto) {

        return {
            original: original,
            skuReal: original,
            quantidadePorKit: 1,
            produtoEstoque: produtoDireto,
            usouPrefixoQuantidade: false
        };

    }


    // =====================================================
    // 2. TENTA INTERPRETAR 3 PRIMEIROS DÍGITOS COMO QUANTIDADE
    // =====================================================

    const matchPrefixo = original.match(/^(\d{3})(.+)$/);

    if (matchPrefixo) {

        const quantidade = parseInt(matchPrefixo[1], 10) || 1;

        const semPrefixo = matchPrefixo[2].trim();

        const produtoSemPrefixo =
            encontrarProdutoEstoquePorSkuReal(semPrefixo);


        if (produtoSemPrefixo) {

            return {
                original: original,
                skuReal: semPrefixo,
                quantidadePorKit: quantidade,
                produtoEstoque: produtoSemPrefixo,
                usouPrefixoQuantidade: true
            };

        }
    }


    // =====================================================
    // 3. NÃO CONSEGUIU INTERPRETAR
    // =====================================================

    return {
        original: original,
        skuReal: original,
        quantidadePorKit: 1,
        produtoEstoque: null,
        usouPrefixoQuantidade: false
    };
}


// =========================================================
// VERIFICAR SE UMA PARTE DO SKU DA VARIAÇÃO
// CORRESPONDE AO PRODUTO QUE ESTAMOS SINCRONIZANDO
// =========================================================
function parteSkuCorrespondeAoProduto(parte, skuProduto) {

    if (!parte || !skuProduto) return false;


    const alvoNormalizado =
        String(skuProduto)
            .trim()
            .toUpperCase();


    const baseAlvo =
        extrairSkuBaseSistema(alvoNormalizado);


    const info =
        interpretarParteSkuAnuncio(parte);


    // =====================================================
    // SE CONSEGUIU IDENTIFICAR O PRODUTO NO ESTOQUE
    // =====================================================

    if (info.produtoEstoque) {

        const skuInterpretado =
            String(info.skuReal || '')
                .trim()
                .toUpperCase();


        if (skuInterpretado === alvoNormalizado) {
            return true;
        }


        if (
            extrairSkuBaseSistema(skuInterpretado) === baseAlvo
        ) {
            return true;
        }


        return false;
    }


    // =====================================================
    // FALLBACK
    // =====================================================

    const original =
        String(parte)
            .trim()
            .toUpperCase();


    if (original === alvoNormalizado) {
        return true;
    }


    if (
        extrairSkuBaseSistema(original) === baseAlvo
    ) {
        return true;
    }


    // =====================================================
    // TENTA SEM PREFIXO DE QUANTIDADE
    // =====================================================

    const matchPrefixo =
        original.match(/^(\d{3})(.+)$/);


    if (matchPrefixo) {

        const semPrefixo =
            matchPrefixo[2]
                .trim()
                .toUpperCase();


        if (semPrefixo === alvoNormalizado) {
            return true;
        }


        if (
            extrairSkuBaseSistema(semPrefixo) === baseAlvo
        ) {
            return true;
        }

    }


    return false;
}


// =========================================================
// ENCONTRAR TODAS AS VARIAÇÕES QUE CONTÊM O SKU
//
// ESTA É A PRINCIPAL CORREÇÃO.
//
// Antes:
// encontrou uma -> return.
//
// Agora:
// percorre TODAS as variações.
//
// Também divide por "." para procurar o SKU
// em qualquer posição do KIT.
// =========================================================
function encontrarVariacoesPorSKU(item, skuProduto) {

    if (
        !item ||
        !item.variations ||
        item.variations.length === 0
    ) {
        return [];
    }


    const encontradas = [];


    console.log(
        `🔍 Procurando TODAS as variações que contêm o SKU "${skuProduto}"...`
    );


    for (const variacao of item.variations) {

        const identificador =
            extrairSkuDaVariacao(variacao);


        if (!identificador) {
            continue;
        }


        // =================================================
        // IMPORTANTE:
        // quebra KIT por ponto
        //
        // Ex:
        // 032RIJ260PT.032RIJ255PT
        //
        // vira:
        //
        // 032RIJ260PT
        // 032RIJ255PT
        // =================================================

        const partes =
            String(identificador)
                .split('.')
                .map(p => p.trim())
                .filter(Boolean);


        const contemSku =
            partes.some(parte =>
                parteSkuCorrespondeAoProduto(
                    parte,
                    skuProduto
                )
            );


        console.log(
            `   Variação ${variacao.id}: "${identificador}" -> ${
                contemSku
                    ? '✅ CONTÉM'
                    : '❌ NÃO CONTÉM'
            } ${skuProduto}`
        );


        if (contemSku) {

            encontradas.push(
                variacao
            );

        }

    }


    console.log(
        `✅ Total de variações encontradas para ${skuProduto}: ${encontradas.length}`
    );


    return encontradas;
}

function encontrarVariacaoPorSKU(item, skuProduto) {

    const encontradas =
        encontrarVariacoesPorSKU(
            item,
            skuProduto
        );


    return encontradas.length > 0
        ? encontradas[0]
        : null;
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
// CALCULAR QUANTIDADE COM REGRAS
// VERSÃO PARA MÚLTIPLAS VARIAÇÕES / KITS
// =========================================================
function calcularQuantidadeComRegras(
    quantidadeBase,
    categoria,
    item,
    skuProduto,
    marcaProduto,
    modeloProduto,
    produto,
    skusFilhos,
    skuAnuncio
) {

    console.log(
        `📊 [calcularQuantidadeComRegras] SKU: ${skuProduto}, Estoque: ${quantidadeBase}, Categoria: ${categoria}`
    );

    console.log(
        `📊 SKU do anúncio/variação: ${skuAnuncio}`
    );


    let quantidadeFinal = 0;


    const ehKit =
        !!(
            skuAnuncio &&
            String(skuAnuncio).includes('.')
        );


    console.log(
        `📊 É um KIT? ${
            ehKit
                ? '✅ SIM'
                : '❌ NÃO'
        }`
    );


    // =====================================================
    // KIT
    // =====================================================

    if (ehKit) {

        console.log(
            '📊 PROCESSANDO COMO KIT...'
        );


        const partes =
            String(skuAnuncio)
                .split('.')
                .map(p => p.trim())
                .filter(Boolean);


        // =================================================
        // AGRUPAR NECESSIDADE POR SKU
        //
        // Isso também resolve um SKU aparecendo duas vezes
        // dentro do mesmo kit.
        // =================================================

        const necessidadePorSku =
            new Map();


        for (const parte of partes) {

            const info =
                interpretarParteSkuAnuncio(
                    parte
                );


            if (!info.produtoEstoque) {

                console.error(
                    `❌ SKU do kit não encontrado no estoque: "${parte}"`
                );

                return 0;
            }


            const chave =
                String(
                    info.produtoEstoque.sku ||
                    info.skuReal
                )
                    .trim()
                    .toUpperCase();


            const atual =
                necessidadePorSku.get(chave) ||
                {
                    produto: info.produtoEstoque,
                    quantidadeNecessaria: 0,
                    partes: []
                };


            atual.quantidadeNecessaria +=
                Math.max(
                    1,
                    Number(
                        info.quantidadePorKit
                    ) || 1
                );


            atual.partes.push(
                parte
            );


            necessidadePorSku.set(
                chave,
                atual
            );


            console.log(
                `📦 Parte "${parte}" -> SKU ${info.produtoEstoque.sku} | qtd por kit: ${info.quantidadePorKit}`
            );

        }


        // =================================================
        // CALCULAR QUANTOS KITS COMPLETOS PODEM SER VENDIDOS
        // =================================================

        let kitsPossiveis =
            Infinity;


        for (
            const [, necessidade]
            of necessidadePorSku
        ) {

            const estoque =
                Number(
                    necessidade.produto.quantidade
                ) || 0;


            const precisa =
                Math.max(
                    1,
                    necessidade.quantidadeNecessaria
                );


            const kitsDoProduto =
                Math.floor(
                    estoque / precisa
                );


            console.log(
                `📊 ${necessidade.produto.sku}: estoque ${estoque} / precisa ${precisa} = ${kitsDoProduto} kit(s)`
            );


            kitsPossiveis =
                Math.min(
                    kitsPossiveis,
                    kitsDoProduto
                );

        }


        quantidadeFinal =
            kitsPossiveis === Infinity
                ? 0
                : kitsPossiveis;


        console.log(
            `📦 Total de kits completos possíveis: ${quantidadeFinal}`
        );

    }

    // =====================================================
    // PRODUTO NORMAL
    // =====================================================

    else {

        console.log(
            '📊 PROCESSANDO COMO PRODUTO NORMAL...'
        );


        const codigo =
            skuAnuncio ||
            skuProduto;


        const info =
            interpretarParteSkuAnuncio(
                codigo
            );


        const produtoEstoque =
            info.produtoEstoque ||
            encontrarProdutoEstoquePorSkuReal(
                skuProduto
            ) ||
            produto ||
            null;


        if (!produtoEstoque) {

            console.warn(
                `⚠️ Produto não encontrado no estoque para cálculo: ${codigo}`
            );

            quantidadeFinal = 0;

        } else {

            const divisor =
                Math.max(
                    1,
                    Number(
                        info.quantidadePorKit
                    ) || 1
                );


            const estoque =
                Number(
                    produtoEstoque.quantidade
                ) || 0;


            quantidadeFinal =
                Math.floor(
                    estoque / divisor
                );


            console.log(
                `📊 ${produtoEstoque.sku}: estoque ${estoque} / quantidade por anúncio ${divisor} = ${quantidadeFinal}`
            );

        }

    }


    // =====================================================
    // PREÇO DA VARIAÇÃO
    // =====================================================

    let precoAnuncio = 0;


    if (
        item.variations &&
        item.variations.length > 0
    ) {

        const variacaoAlvo =
            encontrarVariacaoPorSKU(
                item,
                skuProduto
            );


        if (variacaoAlvo) {

            precoAnuncio =
                variacaoAlvo.price ||
                item.price ||
                0;

        } else {

            precoAnuncio =
                item.variations[0]?.price ||
                item.price ||
                0;

        }

    } else {

        precoAnuncio =
            item.price || 0;

    }


    console.log(
        `📊 Preço usado na regra: R$ ${precoAnuncio}`
    );


    // =====================================================
    // REGRA DE ESTOQUE MÁXIMO
    // =====================================================

    const estoqueMaximo =
        calcularEstoqueMaximo({

            preco: precoAnuncio,

            categoria:
                categoria,

            sku:
                skuProduto

        });


    console.log(
        `📊 Estoque máximo permitido: ${estoqueMaximo}`
    );


    if (
        quantidadeFinal >
        estoqueMaximo
    ) {

        console.log(
            `📊 Aplicando limite: ${quantidadeFinal} -> ${estoqueMaximo}`
        );


        quantidadeFinal =
            estoqueMaximo;

    }


    // =====================================================
    // REGRA ESPECÍFICA PARA RAIOS
    // =====================================================

    if (
        categoria === 'Raios'
    ) {

        const regra =
            obterRegraRaios(
                marcaProduto,
                modeloProduto
            );


        if (
            regra &&
            regra.max_kits !== undefined
        ) {

            console.log(
                `📊 Aplicando regra de Raios: ${quantidadeFinal} -> ${regra.max_kits}`
            );


            quantidadeFinal =
                Math.min(
                    quantidadeFinal,
                    regra.max_kits
                );

        }

    }


    quantidadeFinal =
        Math.max(
            0,
            quantidadeFinal
        );


    console.log(
        `✅ Quantidade final desta variação: ${quantidadeFinal}`
    );


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

// =========================================================
// AJUSTAR CLÁSSICO / PREMIUM CONFORME ESTOQUE
// =========================================================

try {

    const resultadoTipoAnuncio =
        await ajustarTipoAnuncioPorEstoqueML(
            item,
            produto,
            token,
            WORKER_URL
        );


    console.log(
        `📣 Resultado tipo do anúncio ${itemId}:`,
        resultadoTipoAnuncio
    );


} catch (erroTipoAnuncio) {

    // Nunca impedir a sincronização do estoque
    // caso a alteração Clássico/Premium falhe.

    console.error(
        `⚠️ Erro ao ajustar tipo de anúncio ${itemId}:`,
        erroTipoAnuncio
    );

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
console.log(
    `📦 Item ${itemId} é NORMAL (não é FULL).`
);


// =========================================================
// ANÚNCIO COM PREÇO AUTOMÁTICO
// =========================================================
if (
    item.tags?.includes(
        'has_price_by_rule'
    )
) {

    console.warn(
        `⚠️ Item ${itemId} tem preço automático.`
    );

    results.push({
        codigo: itemId,
        success: false,
        reason: 'oferta_ativa'
    });

    continue;
}


// =========================================================
// ANÚNCIO COM VARIAÇÕES
// =========================================================
if (
    item.variations &&
    item.variations.length > 0
) {

    // =====================================================
    // CORREÇÃO PRINCIPAL
    //
    // BUSCA TODAS AS VARIAÇÕES.
    //
    // Não existe mais:
    //
    // "achei uma -> parei"
    // =====================================================

    const variacoesAlvo =
        encontrarVariacoesPorSKU(
            item,
            skuProduto
        );


    if (
        variacoesAlvo.length === 0
    ) {

        console.warn(
            `⚠️ Nenhuma variação de ${itemId} contém o SKU ${skuProduto}`
        );


        results.push({

            codigo:
                itemId,

            success:
                false,

            reason:
                'sem_variacao',

            sku:
                skuProduto

        });


        continue;
    }


    console.log(
        `📦 ${itemId}: ${variacoesAlvo.length} variação(ões) precisam ser sincronizadas para ${skuProduto}`
    );


    // =====================================================
    // PERCORRE TODAS AS VARIAÇÕES ENCONTRADAS
    // =====================================================

    for (
        const variacaoAlvo
        of variacoesAlvo
    ) {

        const varId =
            variacaoAlvo.id;


        const skuVariacao =
            extrairSkuDaVariacao(
                variacaoAlvo
            );


        console.log(
            `🔄 Processando variação ${varId}: "${skuVariacao}"`
        );


        // =================================================
        // Cria um item temporário contendo somente
        // a variação atual.
        //
        // Isso garante que o preço/regra usados sejam
        // justamente os desta variação.
        // =================================================

        const itemDaVariacao = {

            ...item,

            variations: [
                variacaoAlvo
            ]

        };


        // =================================================
        // CALCULAR ESTOQUE DESTA VARIAÇÃO
        // =================================================

        const quantidadeParaEnviar =
            calcularQuantidadeComRegras(

                quantidadeReal,

                categoria,

                itemDaVariacao,

                skuProduto,

                marcaProduto,

                modeloProduto,

                produto,

                skusFilhos,

                skuVariacao
            );


        console.log(
            `📊 ${itemId} / variação ${varId} -> estoque calculado: ${quantidadeParaEnviar}`
        );


        // =================================================
        // ENDPOINT DA VARIAÇÃO
        // =================================================

        const targetUrl =
            `https://api.mercadolibre.com/items/${itemId}/variations/${varId}`;


        const putProxy =
            `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(targetUrl)}&token=${encodeURIComponent(token)}`;


        console.log(
            `📦 Atualizando ${itemId} / variação ${varId} / SKU "${skuVariacao}" -> ${quantidadeParaEnviar}`
        );


        try {

            const putRes =
                await fetch(
                    putProxy,
                    {

                        method:
                            'PUT',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body:
                            JSON.stringify({

                                available_quantity:
                                    quantidadeParaEnviar

                            })

                    }
                );


            const responseText =
                await putRes.text();


            let respData;


            try {

                respData =
                    JSON.parse(
                        responseText
                    );

            } catch (e) {

                respData = {
                    raw: responseText
                };

            }


            // =================================================
            // SUCESSO
            // =================================================

            if (putRes.ok) {

                let newQty =
                    null;


                if (
                    Array.isArray(
                        respData
                    )
                ) {

                    const updatedVar =
                        respData.find(
                            v =>
                                v.id == varId
                        );


                    if (
                        updatedVar
                    ) {

                        newQty =
                            updatedVar.available_quantity;

                    }

                } else {

                    newQty =
                        respData.available_quantity;

                }


                // Algumas respostas do ML não retornam
                // available_quantity.
                //
                // Se o PUT foi aceito, consideramos sucesso
                // quando não existir quantidade na resposta.

                const confirmouQuantidade =

                    newQty === null ||

                    newQty === undefined ||

                    Number(
                        newQty
                    ) ===
                    Number(
                        quantidadeParaEnviar
                    );


                if (
                    confirmouQuantidade
                ) {

                    console.log(
                        `✅ Variação ${varId} sincronizada para ${quantidadeParaEnviar}`
                    );


                    results.push({

                        codigo:
                            itemId,

                        success:
                            true,

                        variation_id:
                            varId,

                        sku_variacao:
                            skuVariacao,

                        estoque_enviado:
                            quantidadeParaEnviar

                    });

                } else {

                    console.warn(
                        `⚠️ Variação ${varId}: esperado ${quantidadeParaEnviar}, recebido ${newQty}`
                    );


                    results.push({

                        codigo:
                            itemId,

                        success:
                            false,

                        variation_id:
                            varId,

                        sku_variacao:
                            skuVariacao,

                        reason:
                            'estoque_ignorado',

                        esperado:
                            quantidadeParaEnviar,

                        recebido:
                            newQty,

                        details:
                            respData

                    });

                }

            }

            // =================================================
            // ERRO HTTP
            // =================================================

            else {

                console.error(
                    `❌ Falha ao atualizar variação ${varId}: ${putRes.status} - ${responseText}`
                );


                results.push({

                    codigo:
                        itemId,

                    success:
                        false,

                    variation_id:
                        varId,

                    sku_variacao:
                        skuVariacao,

                    error:
                        `HTTP ${putRes.status}`,

                    details:
                        respData

                });

            }

        }

        // =====================================================
        // ERRO DA VARIAÇÃO
        // =====================================================

        catch (
            erroVariacao
        ) {

            console.error(
                `❌ Erro ao atualizar ${itemId} / variação ${varId}:`,
                erroVariacao
            );


            results.push({

                codigo:
                    itemId,

                success:
                    false,

                variation_id:
                    varId,

                sku_variacao:
                    skuVariacao,

                error:
                    erroVariacao.message

            });

        }


        // =====================================================
        // PEQUENO INTERVALO ENTRE PUTS
        // =====================================================

        await new Promise(
            r =>
                setTimeout(
                    r,
                    100
                )
        );

    }

}

// =========================================================
// ANÚNCIO SEM VARIAÇÕES
// =========================================================
else {

    const skuAnuncioLocal =
        extrairSkuDoItem(item) ||
        skuProduto;


    const quantidadeParaEnviar =
        calcularQuantidadeComRegras(

            quantidadeReal,

            categoria,

            item,

            skuProduto,

            marcaProduto,

            modeloProduto,

            produto,

            skusFilhos,

            skuAnuncioLocal

        );


    console.log(
        `📦 Atualizando item principal ${itemId} para ${quantidadeParaEnviar}`
    );


    const putRes =
        await fetch(
            proxyUrl,
            {

                method:
                    'PUT',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body:
                    JSON.stringify({

                        available_quantity:
                            quantidadeParaEnviar

                    })

            }
        );


    const responseText =
        await putRes.text();


    let respData;


    try {

        respData =
            JSON.parse(
                responseText
            );

    } catch (e) {

        respData = {
            raw:
                responseText
        };

    }


    if (
        putRes.ok
    ) {

        const recebido =
            respData.available_quantity;


        const confirmouQuantidade =

            recebido === undefined ||

            recebido === null ||

            Number(
                recebido
            ) ===
            Number(
                quantidadeParaEnviar
            );


        if (
            confirmouQuantidade
        ) {

            console.log(
                `✅ Item ${itemId} atualizado`
            );


            results.push({

                codigo:
                    itemId,

                success:
                    true,

                estoque_enviado:
                    quantidadeParaEnviar

            });

        } else {

            console.warn(
                `⚠️ Item ${itemId}: esperado ${quantidadeParaEnviar}, recebido ${recebido}`
            );


            results.push({

                codigo:
                    itemId,

                success:
                    false,

                reason:
                    'estoque_ignorado',

                esperado:
                    quantidadeParaEnviar,

                recebido:
                    recebido,

                details:
                    respData

            });

        }

    } else {

        console.warn(
            `⚠️ Falha item ${itemId}: ${putRes.status}`
        );


        results.push({

            codigo:
                itemId,

            success:
                false,

            error:
                `HTTP ${putRes.status}`,

            details:
                respData

        });

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
// COM DESCRIÇÃO / OBSERVAÇÕES
// =========================================================

function exportarEstoqueExcel() {
    const produtos = produtosFiltradosAtuais || produtosEstoque;
    
    if (!produtos || produtos.length === 0) {
        showToast('⚠️ Nenhum produto para exportar.', 'warning');
        return;
    }
    
    const podeVerCusto = currentUser && (
        currentUser.username === 'andressamiotto' ||
        currentUser.username === 'ronald'
    );
    
    const dados = [];
    
    // =====================================================
    // CABEÇALHO
    // =====================================================
    
    const cabecalho = [
        'ID',
        'Nome',
        'SKU',
        'Prefixo (5 chars)',
        'Categoria',
        'Quantidade',
        'Preço Venda'
    ];
    
    if (podeVerCusto) {
        cabecalho.push(
            'Último Custo',
            'Custo Médio'
        );
    }
    
    // 🔥 NOVA COLUNA
    cabecalho.push(
        'Descrição / Observações',
        'Atributos',
        'MLB Codes',
        'Sync ML Bloqueado'
    );
    
    dados.push(cabecalho);
    
    
    // =====================================================
    // PRODUTOS
    // =====================================================
    
    produtos.forEach(prod => {
        
        // =================================================
        // ATRIBUTOS
        // =================================================
        
        const atributos = prod.dados_extra
            ? Object.entries(prod.dados_extra)
                .filter(([key]) =>
                    key !== 'mlb_codes' &&
                    key !== 'historico_custos' &&
                    key !== 'bloquear_sync_ml' &&
                    key !== 'observacoes_adicionais'
                )
                .map(([key, value]) => {
                    
                    // Array
                    if (Array.isArray(value)) {
                        return `${key}: ${value.join(', ')}`;
                    }
                    
                    // Objeto
                    if (
                        typeof value === 'object' &&
                        value !== null
                    ) {
                        return `${key}: ${JSON.stringify(value)}`;
                    }
                    
                    return `${key}: ${value}`;
                })
                .join('; ')
            : '';
        
        
        // =================================================
        // OBSERVAÇÕES
        // =================================================
        
        const observacoes = [];
        
        // Campo principal "Descrição / Observações"
        if (
            prod.descricao &&
            String(prod.descricao).trim()
        ) {
            observacoes.push(
                String(prod.descricao).trim()
            );
        }
        
        // Também verifica o campo dinâmico observacoes_adicionais
        if (
            prod.dados_extra?.observacoes_adicionais &&
            String(prod.dados_extra.observacoes_adicionais).trim()
        ) {
            const obsAdicional =
                String(
                    prod.dados_extra.observacoes_adicionais
                ).trim();
            
            // Evita duplicar caso os dois tenham exatamente
            // o mesmo conteúdo
            if (!observacoes.includes(obsAdicional)) {
                observacoes.push(obsAdicional);
            }
        }
        
        const observacoesString =
            observacoes.join(' | ');
        
        
        // =================================================
        // MLB
        // =================================================
        
        const mlbCodes =
            prod.mlb_codes ||
            prod.dados_extra?.mlb_codes;
        
        const mlbString =
            mlbCodes && Array.isArray(mlbCodes)
                ? mlbCodes.join(', ')
                : (mlbCodes || '');
        
        
        // =================================================
        // SINCRONIZAÇÃO
        // =================================================
        
        const syncBloqueado =
            prod.bloquear_sync_ml ||
            prod.dados_extra?.bloquear_sync_ml ||
            false;
        
        
        // =================================================
        // PREFIXO
        // =================================================
        
        const prefixo =
            prod.sku
                ? prod.sku
                    .substring(0, 5)
                    .toUpperCase()
                : '-';
        
        
        // =================================================
        // LINHA
        // =================================================
        
        const linha = [
            prod.id || '',
            prod.nome || '',
            prod.sku || '',
            prefixo,
            prod.categoria || '',
            prod.quantidade || 0,
            prod.preco || 0
        ];
        
        
        // =================================================
        // CUSTOS
        // =================================================
        
        if (podeVerCusto) {
            
            const ultimoCusto =
                prod.ultimo_custo ||
                prod.dados_extra?.ultimo_custo ||
                0;
            
            const custoMedio =
                prod.custo_medio ||
                prod.dados_extra?.custo_medio ||
                0;
            
            linha.push(
                ultimoCusto,
                custoMedio
            );
        }
                
        // =================================================
        // DEMAIS CAMPOS
        // =================================================
        
        linha.push(
            observacoesString,
            atributos,
            mlbString,
            syncBloqueado ? 'Sim' : 'Não'
        );
        
        dados.push(linha);
    });
        
    // =====================================================
    // CRIAR EXCEL
    // =====================================================
    
    const wb = XLSX.utils.book_new();   
    const ws = XLSX.utils.aoa_to_sheet(dados);
       
    // =====================================================
    // LARGURA DAS COLUNAS
    // =====================================================
    
    const colunas = [
        { wch: 8 },   // ID
        { wch: 35 },  // Nome
        { wch: 25 },  // SKU
        { wch: 15 },  // Prefixo
        { wch: 18 },  // Categoria
        { wch: 12 },  // Quantidade
        { wch: 12 }   // Preço
    ];
       
    if (podeVerCusto) {
        colunas.push(
            { wch: 14 }, // Último Custo
            { wch: 14 }  // Custo Médio
        );
    }
    
    colunas.push(
        { wch: 50 }, // 🔥 Descrição / Observações
        { wch: 45 }, // Atributos
        { wch: 30 }, // MLB
        { wch: 18 }  // Sync
    );
    
    
    ws['!cols'] = colunas;
    
    
    // =====================================================
    // ADICIONAR PLANILHA
    // =====================================================
    
    XLSX.utils.book_append_sheet(
        wb,
        ws,
        'Estoque'
    );
    
    
    // =====================================================
    // NOME DO ARQUIVO
    // =====================================================
    
    const data = new Date();
    
    const dataStr =
        `${data.getFullYear()}-${String(
            data.getMonth() + 1
        ).padStart(2, '0')}-${String(
            data.getDate()
        ).padStart(2, '0')}`;
    
    const filename =
        `estoque_${dataStr}.xlsx`;
    
    
    // =====================================================
    // BAIXAR
    // =====================================================
    
    XLSX.writeFile(
        wb,
        filename
    );
    showToast(
        `✅ ${produtos.length} produtos exportados com observações!`,
        'success'
    );
}

async function abrirModalRegrasEstoque() {

    const username =
        currentUser?.username
            ?.toLowerCase() || '';


    const isAuthorized =
        usuariosRegraEstoque.includes(
            username
        ) ||
        usuariosAdmin.includes(
            username
        );


    if (!isAuthorized) {

        showToast(
            '⚠️ Apenas administradores podem modificar as regras de estoque.',
            'warning'
        );

        return;
    }


    // =====================================================
    // CARREGAR REGRAS FIXAS
    // =====================================================

    await garantirRegrasFixasTipoAnuncioMLCarregadas();


    let modal =
        document.getElementById(
            'modalRegrasEstoque'
        );


    if (!modal) {

        modal =
            criarModalRegrasEstoque();

    }


    // Regras normais
    preencherModalRegras();


    // Regras Clássico/Premium
    preencherCamposRegrasFixasTipoAnuncioML();


    modal.classList.remove(
        'hidden'
    );


    modal.style.display =
        'flex';
}

async function salvarRegrasFixasTipoAnuncioMLDoModal() {

    const campoClassico =
        document.getElementById(
            'mlbsFixosClassico'
        );


    const campoPremium =
        document.getElementById(
            'mlbsFixosPremium'
        );


    const listaClassico =
        converterTextoParaListaMLB(
            campoClassico?.value || ''
        );


    const listaPremium =
        converterTextoParaListaMLB(
            campoPremium?.value || ''
        );


    // =====================================================
    // VERIFICAR CONFLITOS
    // =====================================================

    const conflitos =
        listaClassico.filter(
            mlb =>
                listaPremium.includes(
                    mlb
                )
        );


    if (
        conflitos.length > 0
    ) {

        showToast(
            `❌ MLB presente simultaneamente em Clássico e Premium: ${conflitos.join(', ')}`,
            'error'
        );


        return {
            success: false,
            error: 'conflito'
        };

    }


    const resultado =
        await salvarRegrasFixasTipoAnuncioML({

            classico:
                listaClassico,

            premium:
                listaPremium

        });


    if (!resultado.success) {

        showToast(
            `❌ Erro ao salvar regras fixas: ${resultado.error}`,
            'error'
        );


        return resultado;

    }


    atualizarResumoRegrasFixasTipoAnuncioML();


    return {
        success: true
    };
}

function criarModalRegrasEstoque() {

    const modal =
        document.createElement('div');


    modal.id =
        'modalRegrasEstoque';


    modal.className =
        'modal hidden';


    modal.style.cssText =
        'display: none; align-items: center; justify-content: center; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 99999;';


    modal.innerHTML = `

        <div
            class="modal-content"
            style="
                max-width: 1000px;
                background: white;
                padding: 30px;
                border-radius: 12px;
                max-height: 90vh;
                overflow-y: auto;
            "
        >

            <!-- ========================================== -->
            <!-- CABEÇALHO -->
            <!-- ========================================== -->

            <div
                style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                "
            >

                <h3>
                    <i
                        class="fas fa-sliders-h"
                        style="color: #00ADEE;"
                    ></i>

                    Regras de Estoque e Mercado Livre
                </h3>


                <button
                    onclick="fecharModalRegrasEstoque()"
                    style="
                        background: none;
                        border: none;
                        font-size: 24px;
                        cursor: pointer;
                        color: #6c757d;
                    "
                >
                    &times;
                </button>

            </div>


            <!-- ========================================== -->
            <!-- REGRAS FIXAS CLÁSSICO / PREMIUM -->
            <!-- ========================================== -->

            <div
                style="
                    border: 2px solid #3483fa;
                    border-radius: 10px;
                    padding: 20px;
                    margin-bottom: 25px;
                    background: #f7faff;
                "
            >

                <h4
                    style="
                        margin-top: 0;
                        margin-bottom: 10px;
                        color: #3483fa;
                        font-size: 17px;
                    "
                >
                    <i class="fab fa-mercadolibre"></i>
                    Regras Fixas de Tipo de Anúncio
                </h4>


                <div
                    style="
                        background: #fff3cd;
                        padding: 12px 15px;
                        border-radius: 6px;
                        margin-bottom: 15px;
                        border-left: 4px solid #ffc107;
                        font-size: 13px;
                    "
                >

                    <strong>Prioridade máxima.</strong>

                    <br>

                    Um MLB cadastrado abaixo ficará sempre no tipo escolhido,
                    independentemente da quantidade em estoque.

                    <br><br>

                    MLB sem regra fixa continuará usando:

                    <strong>
                        estoque = 1 → Clássico |
                        estoque > 1 → Premium
                    </strong>

                </div>


                <div
                    style="
                        display: grid;
                        grid-template-columns:
                            repeat(
                                auto-fit,
                                minmax(300px, 1fr)
                            );
                        gap: 20px;
                    "
                >

                    <!-- ================================== -->
                    <!-- CLÁSSICO -->
                    <!-- ================================== -->

                    <div>

                        <label
                            style="
                                display: block;
                                margin-bottom: 7px;
                                font-weight: 600;
                            "
                        >

                            Sempre CLÁSSICO

                        </label>


                        <textarea
                            id="mlbsFixosClassico"
                            class="form-control"
                            rows="8"
                            placeholder="Ex:
MLB123456789
MLB987654321

Pode separar por linha, vírgula ou ponto e vírgula."
                        ></textarea>


                        <small
                            style="
                                color: #6c757d;
                                display: block;
                                margin-top: 5px;
                            "
                        >

                            Esses anúncios permanecerão
                            Clássico mesmo com estoque maior
                            que 1.

                        </small>

                    </div>


                    <!-- ================================== -->
                    <!-- PREMIUM -->
                    <!-- ================================== -->

                    <div>

                        <label
                            style="
                                display: block;
                                margin-bottom: 7px;
                                font-weight: 600;
                            "
                        >

                            Sempre PREMIUM

                        </label>


                        <textarea
                            id="mlbsFixosPremium"
                            class="form-control"
                            rows="8"
                            placeholder="Ex:
MLB111111111
MLB222222222

Pode separar por linha, vírgula ou ponto e vírgula."
                        ></textarea>


                        <small
                            style="
                                color: #6c757d;
                                display: block;
                                margin-top: 5px;
                            "
                        >

                            Esses anúncios permanecerão
                            Premium mesmo quando o estoque
                            ficar em 1.

                        </small>

                    </div>

                </div>


                <div
                    id="resumoRegrasFixasML"
                    style="
                        margin-top: 12px;
                        font-size: 13px;
                        color: #6c757d;
                    "
                >
                </div>

            </div>


            <!-- ========================================== -->
            <!-- REGRAS NORMAIS DE ESTOQUE -->
            <!-- ========================================== -->

            <div
                style="
                    background: #fff3cd;
                    padding: 12px 15px;
                    border-radius: 6px;
                    margin-bottom: 20px;
                    border-left: 4px solid #ffc107;
                "
            >

                <i class="fas fa-info-circle"></i>

                <strong>
                    Regras de estoque máximo:
                </strong>

                as regras abaixo são baseadas no
                <strong>preço do anúncio</strong>
                do produto.

                <br>

                Exemplo:
                Se preço > R$ 100,00 →
                estoque máximo = 10 unidades.

            </div>


            <div
                id="regrasEstoqueContainer"
            >
                <!-- preenchido dinamicamente -->
            </div>


            <!-- ========================================== -->
            <!-- BOTÕES -->
            <!-- ========================================== -->

            <div
                style="
                    margin-top: 20px;
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    border-top: 1px solid #dee2e6;
                    padding-top: 20px;
                "
            >

                <button
                    class="btn btn-secondary"
                    onclick="fecharModalRegrasEstoque()"
                >
                    Cancelar
                </button>


                <button
                    class="btn btn-success"
                    onclick="salvarRegrasEstoqueModal()"
                >

                    <i class="fas fa-save"></i>

                    Salvar Regras

                </button>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    return modal;
}

function preencherCamposRegrasFixasTipoAnuncioML() {

    const campoClassico =
        document.getElementById(
            'mlbsFixosClassico'
        );


    const campoPremium =
        document.getElementById(
            'mlbsFixosPremium'
        );


    if (campoClassico) {

        campoClassico.value =
            (
                regrasFixasTipoAnuncioML.classico ||
                []
            ).join('\n');

    }


    if (campoPremium) {

        campoPremium.value =
            (
                regrasFixasTipoAnuncioML.premium ||
                []
            ).join('\n');

    }


    atualizarResumoRegrasFixasTipoAnuncioML();
}


// =========================================================
// RESUMO
// =========================================================

function atualizarResumoRegrasFixasTipoAnuncioML() {

    const resumo =
        document.getElementById(
            'resumoRegrasFixasML'
        );


    if (!resumo) return;


    const qtdClassico =
        regrasFixasTipoAnuncioML
            .classico
            ?.length || 0;


    const qtdPremium =
        regrasFixasTipoAnuncioML
            .premium
            ?.length || 0;


    resumo.innerHTML = `

        <strong>${qtdClassico}</strong>
        MLB(s) fixo(s) em Clássico

        &nbsp; | &nbsp;

        <strong>${qtdPremium}</strong>
        MLB(s) fixo(s) em Premium

    `;
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
        'CapacetesEPartes': 'Capacetes e Partes'
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

    // =========================================================
// SALVAR REGRAS FIXAS CLÁSSICO / PREMIUM
// =========================================================

const resultadoRegrasFixas =
    await salvarRegrasFixasTipoAnuncioMLDoModal();


if (
    !resultadoRegrasFixas.success
) {

    // Não fecha o modal se houver conflito
    return;

}
    
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
    
atualizarSelectCategorias();

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
    const isAdmin = usuariosAdmin.includes(username); // NÃO ALTERADO
    const podeModificarSync = usuariosAutorizadosSync.includes(username) || isAdmin;
    const podeVerCusto = usuariosVerCusto.includes(username) || isAdmin;
    const podeGerenciarCategorias = usuariosGerenciarCategorias.includes(username);

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
            if (aplicacao && aplicacao.value === 'Caixa de Direção') {
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
    setTimeout(carregarRegrasFixasTipoAnuncioML, 1300);
    setTimeout(adicionarBotaoImportacaoCadastroInicial, 1800);
    
    const btnCategorias = document.getElementById('btnGerenciarCategorias');
    if (btnCategorias) {
        btnCategorias.onclick = abrirModalCategorias;
    }
    
    // ===== ADICIONAR BOTÃO "CRIAR CATEGORIA" =====
    setTimeout(adicionarBotaoCriarCategoria, 1500);
    setTimeout(adicionarBotaoNoModalCategorias, 2000);
    setTimeout(adicionarBotaoImportarPlanilhaML, 1700);
    setTimeout(adicionarBotaoImportacaoCadastroInicial, 400);
    
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
window.sincronizarEstoqueML = sincronizarEstoqueML;
window.alterarItensPorPaginaEstoque = alterarItensPorPaginaEstoque;
window.abrirModalFullDetectados = abrirModalFullDetectados;
window.confirmarFullDetectado = confirmarFullDetectado;
window.fecharModalFullDetectados = fecharModalFullDetectados;
window.atualizarProgressoFull = atualizarProgressoFull;
window.abrirImportacaoPlanilhaML = abrirImportacaoPlanilhaML;
window.processarArquivoImportacaoML = processarArquivoImportacaoML;
window.baixarRelatorioImportacaoML = baixarRelatorioImportacaoML;
window.fecharRelatorioImportacaoML = fecharRelatorioImportacaoML;

// ===== ADICIONAR BOTÃO "CRIAR CATEGORIA" NA TELA =====
function adicionarBotaoCriarCategoria() {
    console.log('🔧 [adicionarBotaoCriarCategoria] Tentando adicionar botão...');
    
    const filtrosContainer = document.querySelector('#estoqueGestaoSystem .card-header .d-flex.gap-2');
    if (!filtrosContainer) {
        setTimeout(adicionarBotaoCriarCategoria, 500);
        return;
    }
    
    if (document.getElementById('btnCriarCategoria')) return;
    
    const username = currentUser?.username?.toLowerCase() || '';
    const isAuthorized = usuariosGerenciarCategorias.includes(username);
    
    const btn = document.createElement('button');
    btn.id = 'btnCriarCategoria';
    btn.className = 'btn btn-purple';
    btn.innerHTML = '<i class="fas fa-plus-circle"></i> Criar Categoria';
    btn.title = 'Criar nova categoria personalizada com campos específicos';
    btn.onclick = abrirModalCriarCategoria;
    
    // Se não for autorizado, desabilitar (mas ainda mostra o botão)
    if (!isAuthorized) {
        btn.disabled = true;
        btn.title = '🔒 Apenas usuários autorizados podem criar categorias';
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
    }
    
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
    const isAuthorized = usuariosGerenciarCategorias.includes(username);
    
    if (!isAuthorized) {
        showToast('⚠️ Apenas usuários autorizados podem criar categorias.', 'warning');
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
    const isAuthorized = usuariosGerenciarCategorias.includes(username);
    
    if (!isAuthorized) {
        showToast('⚠️ Apenas usuários autorizados podem editar categorias.', 'warning');
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
    const isAuthorized = usuariosGerenciarCategorias.includes(username);
    
    if (!isAuthorized) {
        showToast('⚠️ Apenas usuários autorizados podem gerenciar categorias.', 'warning');
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
    const isAuthorized = usuariosGerenciarCategorias.includes(username);
    
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
                    ${isCustom && isAuthorized ? `
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
salvarCategoriasCustomizadas =
    async function() {

        await _salvarCategoriasCustomizadasOriginal();


        // =================================================
        // ATUALIZAR TODOS OS SELECTS IMEDIATAMENTE
        // =================================================

        atualizarSelectCategorias();


        // =================================================
        // LISTA ANTIGA
        // =================================================

        if (
            typeof preencherListaCategorias ===
            'function'
        ) {

            preencherListaCategorias();

        }


        // =================================================
        // MODAL NOVO DE GERENCIAMENTO
        // =================================================

        const modal =
            document.getElementById(
                'modalGerenciarCategorias'
            );


        if (
            modal &&
            modal.style.display ===
            'flex'
        ) {

            preencherListaCategoriasGerenciamento();

        }


        console.log(
            '✅ Categorias salvas e todos os selects atualizados.'
        );
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
// IMPORTADOR DE PLANILHA DE ANÚNCIOS DO MERCADO LIVRE
// =========================================================
//
// REGRAS:
//
// 1) Lê a planilha original exportada pelo Mercado Livre.
//
// 2) Localiza automaticamente:
//    ITEM_ID
//    SKU
//    TITLE
//    VARIATION_ID
//
// 3) SKU DO MERCADO LIVRE:
//    00100103ROL-152670000
//
//    ignora os 3 primeiros caracteres
//    usa SOMENTE os próximos 8 para localizar o cadastro.
//
// 4) KIT:
//    001SKU_A....002SKU_B....
//
//    cria/verifica:
//
//    A -> B
//    B -> A
//
// 5) Não cria produtos automaticamente.
//
// 6) Não remove MLB automaticamente.
//
// 7) Não remove relações de KIT automaticamente.
//
// 8) Quando houver dúvida ou conflito:
//    NÃO ALTERA.
//    Apenas registra no relatório.
//
// =========================================================


// Resultado da última importação
let resultadoImportacaoPlanilhaML = null;


// =========================================================
// NORMALIZAR TEXTO
// =========================================================

function normalizarTextoImportacaoML(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {
        return '';
    }


    return String(valor)
        .trim()
        .normalize('NFD')
        .replace(
            /[\u0300-\u036f]/g,
            ''
        )
        .toUpperCase();
}


// =========================================================
// NORMALIZAR MLB
// =========================================================

function normalizarMLBImportacao(valor) {

    const texto =
        normalizarTextoImportacaoML(
            valor
        );


    const match =
        texto.match(
            /MLB\s*[-]?\s*(\d+)/
        );


    if (!match) {
        return '';
    }


    return `MLB${match[1]}`;
}


// =========================================================
// NORMALIZAR ARRAY DE MLB DO CADASTRO
// =========================================================

function obterMLBsProdutoImportacao(produto) {

    if (!produto) {
        return [];
    }


    let valor =
        produto.dados_extra?.mlb_codes ??
        produto.mlb_codes ??
        [];


    if (
        typeof valor === 'string'
    ) {

        valor =
            valor.split(
                /[,;\n]+/
            );

    }


    if (
        !Array.isArray(valor)
    ) {

        return [];

    }


    return [
        ...new Set(

            valor
                .map(
                    normalizarMLBImportacao
                )
                .filter(Boolean)

        )
    ];
}


// =========================================================
// EXTRAIR BASE DO SKU DO CADASTRO
//
// CADASTRO:
// 00103ROL-152670000
//
// BASE:
// 00103ROL
// =========================================================

function extrairBaseSkuCadastroImportacao(
    sku
) {

    if (!sku) {
        return '';
    }


    return String(sku)
        .trim()
        .substring(
            0,
            8
        )
        .toUpperCase();
}


// =========================================================
// INTERPRETAR UM COMPONENTE DE SKU DO MERCADO LIVRE
//
// ML:
// 00100103ROL-152670000
//
// PREFIXO:
// 001
//
// BASE:
// 00103ROL
//
// =========================================================

function interpretarComponenteSkuMLImportacao(
    componente
) {

    const original =
        String(
            componente || ''
        ).trim();


    if (!original) {

        return {
            valido: false,
            ignorar: true,
            original: '',
            erro: 'SKU vazio'
        };

    }


    // Linha estrutural do relatório do ML
    if (
        original === '22'
    ) {

        return {
            valido: false,
            ignorar: true,
            original,
            erro: null
        };

    }


    // =====================================================
    // PRECISA TER:
    //
    // 3 caracteres extras
    // +
    // pelo menos 8 caracteres de SKU
    //
    // Total mínimo = 11
    // =====================================================

    if (
        original.length < 11
    ) {

        return {

            valido: false,

            ignorar: false,

            original,

            erro:
                'SKU possui menos de 11 caracteres; não é possível ignorar 3 e ler os próximos 8.'

        };

    }


    // =====================================================
    // 3 PRIMEIROS PRECISAM SER NUMÉRICOS
    // =====================================================

    const prefixo =
        original.substring(
            0,
            3
        );


    if (
        !/^\d{3}$/.test(
            prefixo
        )
    ) {

        return {

            valido: false,

            ignorar: false,

            original,

            erro:
                `Os 3 primeiros caracteres "${prefixo}" não são numéricos.`

        };

    }


    // =====================================================
    // BASE DO CADASTRO
    // =====================================================

    const base =
        original.substring(
            3,
            11
        ).toUpperCase();


    const quantidade =
        parseInt(
            prefixo,
            10
        );


    return {

        valido: true,

        ignorar: false,

        original,

        prefixo,

        base,

        quantidade,

        quantidadeValida:
            Number.isFinite(
                quantidade
            ) &&
            quantidade > 0

    };
}


// =========================================================
// LOCALIZAR ABA + CABEÇALHO DO ARQUIVO DO ML
// =========================================================

function localizarEstruturaPlanilhaML(
    workbook
) {

    if (
        !workbook ||
        !Array.isArray(
            workbook.SheetNames
        )
    ) {
        return null;
    }


    // =====================================================
    // ALIASES DE CABEÇALHO
    // =====================================================

    const aliasesItem = [
        'ITEM_ID',
        'CODIGO DO ANUNCIO',
        'CODIGO ANUNCIO'
    ];


    const aliasesSku = [
        'SKU',
        'SELLER_SKU'
    ];


    const aliasesTitulo = [
        'TITLE',
        'TITULO'
    ];


    const aliasesVariation = [
        'VARIATION_ID',
        'NUMERO DA VARIACAO'
    ];


    // =====================================================
    // PRIORIZAR ABA "ANÚNCIOS"
    // =====================================================

    const nomesOrdenados =
        [...workbook.SheetNames]
            .sort(
                (a, b) => {

                    const aAnuncios =
                        normalizarTextoImportacaoML(a)
                            .includes('ANUNC');

                    const bAnuncios =
                        normalizarTextoImportacaoML(b)
                            .includes('ANUNC');


                    if (
                        aAnuncios &&
                        !bAnuncios
                    ) {
                        return -1;
                    }


                    if (
                        !aAnuncios &&
                        bAnuncios
                    ) {
                        return 1;
                    }


                    return 0;

                }
            );


    for (
        const nomeAba
        of nomesOrdenados
    ) {

        const sheet =
            workbook.Sheets[
                nomeAba
            ];


        if (!sheet) {
            continue;
        }


        const linhas =
            XLSX.utils.sheet_to_json(
                sheet,
                {

                    header: 1,

                    defval: null,

                    raw: false

                }
            );


        if (
            !Array.isArray(linhas) ||
            linhas.length === 0
        ) {
            continue;
        }


        // =================================================
        // PROCURAR CABEÇALHO NAS PRIMEIRAS 15 LINHAS
        // =================================================

        const limite =
            Math.min(
                linhas.length,
                15
            );


        for (
            let i = 0;
            i < limite;
            i++
        ) {

            const linha =
                linhas[i] || [];


            const normalizada =
                linha.map(
                    normalizarTextoImportacaoML
                );


            const indiceItem =
                normalizada.findIndex(
                    valor =>
                        aliasesItem.includes(
                            valor
                        )
                );


            const indiceSku =
                normalizada.findIndex(
                    valor =>
                        aliasesSku.includes(
                            valor
                        )
                );


            if (
                indiceItem === -1 ||
                indiceSku === -1
            ) {
                continue;
            }


            const indiceTitulo =
                normalizada.findIndex(
                    valor =>
                        aliasesTitulo.includes(
                            valor
                        )
                );


            const indiceVariation =
                normalizada.findIndex(
                    valor =>
                        aliasesVariation.includes(
                            valor
                        )
                );


            return {

                nomeAba,

                sheet,

                linhas,

                linhaCabecalho:
                    i,

                indiceItem,

                indiceSku,

                indiceTitulo,

                indiceVariation

            };

        }

    }


    return null;
}


// =========================================================
// CRIAR ÍNDICE DOS PRODUTOS DO SISTEMA
//
// BASE 8 -> [produtos]
// =========================================================

function criarIndiceProdutosImportacaoML() {

    const indice =
        new Map();


    for (
        const produto
        of produtosEstoque || []
    ) {

        const base =
            extrairBaseSkuCadastroImportacao(
                produto.sku
            );


        if (!base) {
            continue;
        }


        if (
            !indice.has(base)
        ) {

            indice.set(
                base,
                []
            );

        }


        indice
            .get(base)
            .push(produto);

    }


    return indice;
}


// =========================================================
// CARREGAR TODOS OS RELACIONAMENTOS DE KIT
// =========================================================

async function carregarRelacionamentosKitImportacaoML() {

    if (
        !window.supabaseClient
    ) {
        return [];
    }


    const { data, error } =
        await window.supabaseClient
            .from(
                'produto_skus_kit'
            )
            .select(
                'sku_pai, sku_filho, quantidade'
            );


    if (error) {
        throw error;
    }


    return data || [];
}


// =========================================================
// CRIAR CHAVE DO RELACIONAMENTO
// =========================================================

function criarChaveKitImportacaoML(
    skuPai,
    skuFilho
) {

    return (
        String(skuPai || '')
            .trim()
            .toUpperCase()
        +
        '|||'
        +
        String(skuFilho || '')
            .trim()
            .toUpperCase()
    );
}


// =========================================================
// ADICIONAR ERRO AO RELATÓRIO
// =========================================================

function adicionarErroImportacaoML(
    resultado,
    dados
) {

    resultado.erros.push({

        linha:
            dados.linha || '',

        tipo:
            dados.tipo || 'ERRO',

        mlb:
            dados.mlb || '',

        skuPlanilha:
            dados.skuPlanilha || '',

        componente:
            dados.componente || '',

        base:
            dados.base || '',

        descricao:
            dados.descricao || '',

        acao:
            dados.acao ||
            'Nenhuma alteração realizada'

    });
}


// =========================================================
// ADICIONAR AVISO
// =========================================================

function adicionarAvisoImportacaoML(
    resultado,
    dados
) {

    resultado.avisos.push({

        linha:
            dados.linha || '',

        tipo:
            dados.tipo || 'AVISO',

        mlb:
            dados.mlb || '',

        sku:
            dados.sku || '',

        descricao:
            dados.descricao || ''

    });
}


// =========================================================
// ANALISAR PLANILHA DO MERCADO LIVRE
// =========================================================

async function analisarPlanilhaMercadoLivre(
    arquivo
) {

    if (!arquivo) {

        throw new Error(
            'Nenhum arquivo selecionado.'
        );

    }


    if (
        typeof XLSX ===
        'undefined'
    ) {

        throw new Error(
            'Biblioteca XLSX não está carregada no sistema.'
        );

    }


    if (
        !window.supabaseClient
    ) {

        throw new Error(
            'Supabase não está disponível.'
        );

    }


    // =====================================================
    // GARANTIR PRODUTOS ATUALIZADOS
    // =====================================================

    if (
        !Array.isArray(
            produtosEstoque
        ) ||
        produtosEstoque.length === 0
    ) {

        await carregarProdutosEstoque();

    }


    // =====================================================
    // LER ARQUIVO
    // =====================================================

    const arrayBuffer =
        await arquivo.arrayBuffer();


    const workbook =
        XLSX.read(
            arrayBuffer,
            {
                type: 'array'
            }
        );


    // =====================================================
    // IDENTIFICAR FORMATO
    // =====================================================

    const estrutura =
        localizarEstruturaPlanilhaML(
            workbook
        );


    if (!estrutura) {

        throw new Error(
            'Não encontrei as colunas ITEM_ID e SKU na planilha. Use a planilha original exportada pelo Mercado Livre.'
        );

    }


    console.log(
        '📊 Estrutura encontrada:',
        estrutura.nomeAba,
        'cabeçalho linha',
        estrutura.linhaCabecalho + 1
    );


    // =====================================================
    // RELACIONAMENTOS EXISTENTES
    // =====================================================

    const relacionamentosExistentes =
        await carregarRelacionamentosKitImportacaoML();


    const indiceRelacionamentos =
        new Map();


    for (
        const rel
        of relacionamentosExistentes
    ) {

        indiceRelacionamentos.set(

            criarChaveKitImportacaoML(
                rel.sku_pai,
                rel.sku_filho
            ),

            rel

        );

    }


    // =====================================================
    // ÍNDICE DOS PRODUTOS
    // =====================================================

    const indiceProdutos =
        criarIndiceProdutosImportacaoML();


    // =====================================================
    // RESULTADO
    // =====================================================

    const resultado = {

        arquivo:
            arquivo.name,

        aba:
            estrutura.nomeAba,

        dataAnalise:
            new Date()
                .toISOString(),

        resumo: {

            linhasArquivo:
                estrutura.linhas.length,

            linhasAnalisadas:
                0,

            linhasIgnoradas:
                0,

            mlbsUnicos:
                0,

            linhasKit:
                0,

            produtosEncontrados:
                0,

            basesNaoEncontradas:
                0,

            basesAmbiguas:
                0,

            mlbsAdicionar:
                0,

            kitsAdicionar:
                0,

            kitsAtualizar:
                0,

            erros:
                0,

            avisos:
                0

        },


        erros: [],

        avisos: [],

        ajustesMLB: [],

        ajustesKit: [],

        aplicados: [],

        errosAplicacao: [],

        produtosSemPlanilha: []

    };


    // =====================================================
    // MAPAS DA ANÁLISE
    // =====================================================

    const mlbsEsperadosPorProduto =
        new Map();


    const produtosEncontrados =
        new Map();


    const mlbsUnicos =
        new Set();


    const basesNaoEncontradas =
        new Set();


    const basesAmbiguas =
        new Set();


    // =====================================================
    // RELACIONAMENTOS ESPERADOS
    //
    // key:
    // pai|||filho
    //
    // value:
    // {
    //   pai,
    //   filho,
    //   quantidades: Set,
    //   fontes: []
    // }
    // =====================================================

    const kitsEsperados =
        new Map();


    // =====================================================
    // PROCESSAR LINHAS
    // =====================================================

    const inicioDados =
        estrutura.linhaCabecalho +
        1;


    for (
        let indexLinha = inicioDados;
        indexLinha <
        estrutura.linhas.length;
        indexLinha++
    ) {

        const linha =
            estrutura.linhas[
                indexLinha
            ] || [];


        const numeroLinha =
            indexLinha + 1;


        const mlb =
            normalizarMLBImportacao(
                linha[
                    estrutura.indiceItem
                ]
            );


        const skuPlanilha =
            String(
                linha[
                    estrutura.indiceSku
                ] || ''
            ).trim();


        const titulo =
            estrutura.indiceTitulo !== -1
                ? String(
                    linha[
                        estrutura.indiceTitulo
                    ] || ''
                ).trim()
                : '';


        // =================================================
        // IGNORAR LINHAS ESTRUTURAIS
        //
        // Na planilha real do ML existem linhas:
        //
        // SKU = 22
        //
        // que representam o agrupador da publicação.
        // =================================================

        if (
            !mlb ||
            !skuPlanilha ||
            skuPlanilha === '22'
        ) {

            resultado.resumo
                .linhasIgnoradas++;

            continue;

        }


        resultado.resumo
            .linhasAnalisadas++;


        mlbsUnicos.add(
            mlb
        );


        const partes =
            skuPlanilha
                .split('.')
                .map(
                    parte =>
                        parte.trim()
                )
                .filter(Boolean);


        if (
            partes.length > 1
        ) {

            resultado.resumo
                .linhasKit++;

        }


        // =================================================
        // COMPONENTES RESOLVIDOS
        // =================================================

        const componentesEncontrados =
            [];


        for (
            const parte
            of partes
        ) {

            const interpretado =
                interpretarComponenteSkuMLImportacao(
                    parte
                );


            if (
                interpretado.ignorar
            ) {
                continue;
            }


            // =================================================
            // SKU MALFORMADO
            // =================================================

            if (
                !interpretado.valido
            ) {

                adicionarErroImportacaoML(
                    resultado,
                    {

                        linha:
                            numeroLinha,

                        tipo:
                            'SKU_INVALIDO',

                        mlb,

                        skuPlanilha,

                        componente:
                            parte,

                        descricao:
                            interpretado.erro,

                        acao:
                            'SKU não alterado. Verificar manualmente no Mercado Livre.'

                    }
                );


                continue;

            }


            const base =
                interpretado.base;


            const candidatos =
                indiceProdutos.get(
                    base
                ) || [];


            // =================================================
            // NÃO ENCONTROU
            // =================================================

            if (
                candidatos.length === 0
            ) {

                basesNaoEncontradas.add(
                    base
                );


                adicionarErroImportacaoML(
                    resultado,
                    {

                        linha:
                            numeroLinha,

                        tipo:
                            'SKU_NAO_ENCONTRADO',

                        mlb,

                        skuPlanilha,

                        componente:
                            parte,

                        base,

                        descricao:
                            `Nenhum produto do sistema possui os 8 primeiros caracteres "${base}".`,

                        acao:
                            'Produto não criado automaticamente.'

                    }
                );


                continue;

            }


            // =================================================
            // MAIS DE UM CADASTRO COM MESMA BASE
            // =================================================

            if (
                candidatos.length > 1
            ) {

                basesAmbiguas.add(
                    base
                );


                adicionarErroImportacaoML(
                    resultado,
                    {

                        linha:
                            numeroLinha,

                        tipo:
                            'SKU_AMBIGUO',

                        mlb,

                        skuPlanilha,

                        componente:
                            parte,

                        base,

                        descricao:
                            `Existem ${candidatos.length} produtos no sistema com a mesma base "${base}": ${candidatos.map(p => p.sku).join(', ')}`,

                        acao:
                            'Nenhum cadastro foi alterado para evitar associação incorreta.'

                    }
                );


                continue;

            }


            // =================================================
            // ENCONTROU EXATAMENTE UM
            // =================================================

            const produto =
                candidatos[0];


            produtosEncontrados.set(
                String(
                    produto.id
                ),
                produto
            );


            componentesEncontrados.push({

                produto,

                base,

                quantidade:
                    interpretado.quantidade,

                quantidadeValida:
                    interpretado
                        .quantidadeValida,

                componenteOriginal:
                    parte

            });


            // =================================================
            // MLB ESPERADO PARA ESSE PRODUTO
            // =================================================

            const chaveProduto =
                String(
                    produto.id
                );


            if (
                !mlbsEsperadosPorProduto
                    .has(
                        chaveProduto
                    )
            ) {

                mlbsEsperadosPorProduto
                    .set(
                        chaveProduto,
                        {

                            produto,

                            mlbs:
                                new Set(),

                            fontes:
                                []

                        }
                    );

            }


            const registro =
                mlbsEsperadosPorProduto
                    .get(
                        chaveProduto
                    );


            registro.mlbs.add(
                mlb
            );


            registro.fontes.push({

                linha:
                    numeroLinha,

                mlb,

                titulo,

                skuPlanilha

            });

        }


        // =================================================
        // RELACIONAMENTOS DE KIT
        //
        // Exemplo:
        //
        // A.B
        //
        // cria/verifica:
        //
        // A -> B
        // B -> A
        //
        // Para 3 componentes:
        //
        // A -> B
        // A -> C
        // B -> A
        // B -> C
        // C -> A
        // C -> B
        //
        // =================================================

        if (
            partes.length > 1 &&
            componentesEncontrados.length >= 2
        ) {

            // =================================================
            // AGRUPAR COMPONENTES DO MESMO PRODUTO
            // =================================================

            const agrupados =
                new Map();


            for (
                const comp
                of componentesEncontrados
            ) {

                const idProduto =
                    String(
                        comp.produto.id
                    );


                if (
                    !agrupados.has(
                        idProduto
                    )
                ) {

                    agrupados.set(
                        idProduto,
                        {

                            produto:
                                comp.produto,

                            quantidade:
                                0,

                            quantidadeValida:
                                true,

                            componentes:
                                []

                        }
                    );

                }


                const grupo =
                    agrupados.get(
                        idProduto
                    );


                grupo.componentes.push(
                    comp.componenteOriginal
                );


                if (
                    !comp.quantidadeValida
                ) {

                    grupo.quantidadeValida =
                        false;

                } else {

                    grupo.quantidade +=
                        comp.quantidade;

                }

            }


            const componentesUnicos =
                Array.from(
                    agrupados.values()
                );


            // =================================================
            // CRIAR RELAÇÃO NOS DOIS SENTIDOS
            // =================================================

            for (
                const pai
                of componentesUnicos
            ) {

                for (
                    const filho
                    of componentesUnicos
                ) {

                    if (
                        pai.produto.id ==
                        filho.produto.id
                    ) {
                        continue;
                    }


                    // =========================================
                    // QUANTIDADE DO FILHO PRECISA SER VÁLIDA
                    // =========================================

                    if (
                        !filho.quantidadeValida ||
                        filho.quantidade <= 0
                    ) {

                        adicionarErroImportacaoML(
                            resultado,
                            {

                                linha:
                                    numeroLinha,

                                tipo:
                                    'QUANTIDADE_KIT_INVALIDA',

                                mlb,

                                skuPlanilha,

                                componente:
                                    filho.componentes
                                        .join('.'),

                                base:
                                    extrairBaseSkuCadastroImportacao(
                                        filho.produto.sku
                                    ),

                                descricao:
                                    `Não foi possível determinar uma quantidade válida para ${filho.produto.sku}.`,

                                acao:
                                    `Relacionamento ${pai.produto.sku} → ${filho.produto.sku} não alterado.`

                            }
                        );


                        continue;

                    }


                    const chave =
                        criarChaveKitImportacaoML(

                            pai.produto.sku,

                            filho.produto.sku

                        );


                    if (
                        !kitsEsperados.has(
                            chave
                        )
                    ) {

                        kitsEsperados.set(
                            chave,
                            {

                                skuPai:
                                    pai.produto.sku,

                                skuFilho:
                                    filho.produto.sku,

                                quantidades:
                                    new Set(),

                                fontes:
                                    []

                            }
                        );

                    }


                    const esperado =
                        kitsEsperados.get(
                            chave
                        );


                    esperado.quantidades.add(
                        filho.quantidade
                    );


                    esperado.fontes.push({

                        linha:
                            numeroLinha,

                        mlb,

                        skuPlanilha,

                        quantidade:
                            filho.quantidade

                    });

                }

            }

        }

    }


    // =====================================================
    // COMPARAR MLB DO CADASTRO X PLANILHA
    // =====================================================

    for (
        const registro
        of mlbsEsperadosPorProduto.values()
    ) {

        const produto =
            registro.produto;


        const cadastrados =
            obterMLBsProdutoImportacao(
                produto
            );


        const esperados =
            [...registro.mlbs];


        const faltantes =
            esperados.filter(
                mlb =>
                    !cadastrados.includes(
                        mlb
                    )
            );


        const extras =
            cadastrados.filter(
                mlb =>
                    !esperados.includes(
                        mlb
                    )
            );


        // =================================================
        // MLB FALTANDO NO CADASTRO
        // =================================================

        if (
            faltantes.length > 0
        ) {

            const listaFinal =
                [
                    ...new Set(
                        [
                            ...cadastrados,
                            ...faltantes
                        ]
                    )
                ];


            resultado
                .ajustesMLB
                .push({

                    produtoId:
                        produto.id,

                    sku:
                        produto.sku,

                    nome:
                        produto.nome,

                    antes:
                        cadastrados,

                    adicionar:
                        faltantes,

                    depois:
                        listaFinal,

                    produto

                });

        }


        // =================================================
        // MLB EXTRA NO CADASTRO
        //
        // NÃO REMOVER AUTOMATICAMENTE.
        // =================================================

        if (
            extras.length > 0
        ) {

            adicionarAvisoImportacaoML(
                resultado,
                {

                    tipo:
                        'MLB_EXTRA_CADASTRO',

                    sku:
                        produto.sku,

                    descricao:
                        `O cadastro possui MLB(s) que não apareceram nas linhas desta planilha para o produto: ${extras.join(', ')}. Nada foi removido automaticamente.`

                }
            );

        }

    }


    // =====================================================
    // COMPARAR KITS
    // =====================================================

    for (
        const esperado
        of kitsEsperados.values()
    ) {

        const quantidades =
            [...esperado.quantidades];


        // =================================================
        // CONFLITO:
        //
        // mesma relação apareceu com quantidades diferentes.
        //
        // NÃO ALTERAR.
        // =================================================

        if (
            quantidades.length > 1
        ) {

            adicionarErroImportacaoML(
                resultado,
                {

                    tipo:
                        'CONFLITO_QUANTIDADE_KIT',

                    descricao:
                        `A relação ${esperado.skuPai} → ${esperado.skuFilho} apareceu na planilha com quantidades diferentes: ${quantidades.join(', ')}.`,

                    acao:
                        'Relacionamento não alterado automaticamente.'

                }
            );


            continue;

        }


        const quantidadeEsperada =
            quantidades[0];


        const chave =
            criarChaveKitImportacaoML(

                esperado.skuPai,

                esperado.skuFilho

            );


        const existente =
            indiceRelacionamentos.get(
                chave
            );


        // =================================================
        // RELACIONAMENTO NÃO EXISTE
        // =================================================

        if (!existente) {

            resultado
                .ajustesKit
                .push({

                    acao:
                        'ADICIONAR',

                    skuPai:
                        esperado.skuPai,

                    skuFilho:
                        esperado.skuFilho,

                    quantidade:
                        quantidadeEsperada,

                    quantidadeAnterior:
                        null,

                    fontes:
                        esperado.fontes

                });


            continue;

        }


        // =================================================
        // QUANTIDADE DIFERENTE
        // =================================================

        if (
            Number(
                existente.quantidade
            ) !==
            Number(
                quantidadeEsperada
            )
        ) {

            resultado
                .ajustesKit
                .push({

                    acao:
                        'ATUALIZAR',

                    skuPai:
                        esperado.skuPai,

                    skuFilho:
                        esperado.skuFilho,

                    quantidade:
                        quantidadeEsperada,

                    quantidadeAnterior:
                        Number(
                            existente.quantidade
                        ),

                    fontes:
                        esperado.fontes

                });

        }

    }


    // =====================================================
    // PRODUTOS SEM NENHUMA OCORRÊNCIA NA PLANILHA
    // =====================================================

    for (
        const produto
        of produtosEstoque
    ) {

        if (
            !produtosEncontrados.has(
                String(
                    produto.id
                )
            )
        ) {

            resultado
                .produtosSemPlanilha
                .push({

                    id:
                        produto.id,

                    sku:
                        produto.sku,

                    nome:
                        produto.nome

                });

        }

    }


    // =====================================================
    // RESUMO
    // =====================================================

    resultado.resumo.mlbsUnicos =
        mlbsUnicos.size;


    resultado.resumo.produtosEncontrados =
        produtosEncontrados.size;


    resultado.resumo.basesNaoEncontradas =
        basesNaoEncontradas.size;


    resultado.resumo.basesAmbiguas =
        basesAmbiguas.size;


    resultado.resumo.mlbsAdicionar =
        resultado.ajustesMLB
            .reduce(
                (
                    soma,
                    ajuste
                ) =>
                    soma +
                    ajuste.adicionar.length,
                0
            );


    resultado.resumo.kitsAdicionar =
        resultado.ajustesKit
            .filter(
                a =>
                    a.acao ===
                    'ADICIONAR'
            )
            .length;


    resultado.resumo.kitsAtualizar =
        resultado.ajustesKit
            .filter(
                a =>
                    a.acao ===
                    'ATUALIZAR'
            )
            .length;


    resultado.resumo.erros =
        resultado.erros.length;


    resultado.resumo.avisos =
        resultado.avisos.length;


    console.log(
        '✅ Análise da planilha concluída:',
        resultado
    );


    return resultado;
}


// =========================================================
// APLICAR AJUSTES SEGUROS AUTOMATICAMENTE
// =========================================================

async function aplicarAjustesSegurosPlanilhaML(
    resultado
) {

    if (!resultado) {

        throw new Error(
            'Resultado da análise não disponível.'
        );

    }


    const aplicados = [];

    const errosAplicacao = [];


    // =====================================================
    // MLBs
    // =====================================================

    for (
        let i = 0;
        i <
        resultado.ajustesMLB.length;
        i++
    ) {

        const ajuste =
            resultado.ajustesMLB[i];


        try {

            const produtoAtual =
                produtosEstoque.find(
                    p =>
                        p.id ==
                        ajuste.produtoId
                ) ||
                ajuste.produto;


            if (!produtoAtual) {

                throw new Error(
                    'Produto não encontrado na memória.'
                );

            }


            // =================================================
            // REVALIDAR MLB ATUAL ANTES DE GRAVAR
            // =================================================

            const mlbsAtuais =
                obterMLBsProdutoImportacao(
                    produtoAtual
                );


            const listaFinal =
                [
                    ...new Set(
                        [
                            ...mlbsAtuais,
                            ...ajuste.adicionar
                        ]
                    )
                ];


            const dadosExtraNovos = {

                ...(
                    produtoAtual
                        .dados_extra ||
                    {}
                ),

                mlb_codes:
                    listaFinal

            };


            const { error } =
                await window.supabaseClient
                    .from(
                        'produtos_estoque'
                    )
                    .update({

                        dados_extra:
                            dadosExtraNovos

                    })
                    .eq(
                        'id',
                        ajuste.produtoId
                    );


            if (error) {
                throw error;
            }


            // Atualiza memória
            produtoAtual.dados_extra =
                dadosExtraNovos;


            aplicados.push({

                tipo:
                    'MLB_ADICIONADO',

                sku:
                    ajuste.sku,

                descricao:
                    `Adicionado(s): ${ajuste.adicionar.join(', ')}`,

                resultado:
                    'SUCESSO'

            });


        } catch (error) {

            console.error(
                `❌ Erro adicionando MLB ao ${ajuste.sku}:`,
                error
            );


            errosAplicacao.push({

                tipo:
                    'ERRO_APLICAR_MLB',

                sku:
                    ajuste.sku,

                descricao:
                    error.message

            });

        }

    }


    // =====================================================
    // RELACIONAMENTOS DE KIT
    // =====================================================

    for (
        let i = 0;
        i <
        resultado.ajustesKit.length;
        i++
    ) {

        const ajuste =
            resultado.ajustesKit[i];


        try {

            const { error } =
                await window.supabaseClient
                    .from(
                        'produto_skus_kit'
                    )
                    .upsert({

                        sku_pai:
                            ajuste.skuPai,

                        sku_filho:
                            ajuste.skuFilho,

                        quantidade:
                            ajuste.quantidade

                    }, {

                        onConflict:
                            'sku_pai, sku_filho'

                    });


            if (error) {
                throw error;
            }


            aplicados.push({

                tipo:
                    ajuste.acao ===
                    'ADICIONAR'
                        ? 'KIT_ADICIONADO'
                        : 'KIT_ATUALIZADO',

                sku:
                    ajuste.skuPai,

                descricao:
                    ajuste.acao ===
                    'ADICIONAR'

                        ? `${ajuste.skuPai} → ${ajuste.skuFilho} | quantidade ${ajuste.quantidade}`

                        : `${ajuste.skuPai} → ${ajuste.skuFilho} | quantidade ${ajuste.quantidadeAnterior} → ${ajuste.quantidade}`,

                resultado:
                    'SUCESSO'

            });


        } catch (error) {

            console.error(
                `❌ Erro ajustando kit ${ajuste.skuPai} -> ${ajuste.skuFilho}:`,
                error
            );


            errosAplicacao.push({

                tipo:
                    'ERRO_APLICAR_KIT',

                sku:
                    ajuste.skuPai,

                descricao:
                    `${ajuste.skuPai} → ${ajuste.skuFilho}: ${error.message}`

            });

        }

    }


    resultado.aplicados =
        aplicados;


    resultado.errosAplicacao =
        errosAplicacao;


    resultado.resumo.ajustesAplicados =
        aplicados.length;


    resultado.resumo.errosAplicacao =
        errosAplicacao.length;


    // =====================================================
    // RECARREGAR CADASTROS
    // =====================================================

    try {

        await carregarProdutosEstoque();

    } catch (e) {

        console.warn(
            '⚠️ Não foi possível recarregar produtos após importação:',
            e
        );

    }


    return resultado;
}


// =========================================================
// ESCAPE LOCAL PARA RELATÓRIO
// =========================================================

function escapeImportacaoML(valor) {

    if (
        valor === null ||
        valor === undefined
    ) {
        return '';
    }


    return String(valor)
        .replace(
            /&/g,
            '&amp;'
        )
        .replace(
            /</g,
            '&lt;'
        )
        .replace(
            />/g,
            '&gt;'
        )
        .replace(
            /"/g,
            '&quot;'
        );
}


// =========================================================
// RENDERIZAR RELATÓRIO
// =========================================================

function renderizarRelatorioImportacaoPlanilhaML(
    resultado
) {

    resultadoImportacaoPlanilhaML =
        resultado;


    const anterior =
        document.getElementById(
            'modalRelatorioImportacaoML'
        );


    if (anterior) {
        anterior.remove();
    }


    const resumo =
        resultado.resumo;


    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalRelatorioImportacaoML';


    modal.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.55);
        z-index: 100000;
    `;


    // =====================================================
    // TABELA DE ERROS
    // =====================================================

    let htmlErros = '';


    if (
        resultado.erros.length === 0
    ) {

        htmlErros = `

            <div
                style="
                    padding: 25px;
                    text-align: center;
                    color: #28a745;
                "
            >
                <i class="fas fa-check-circle"></i>
                Nenhum erro de cadastro encontrado.
            </div>

        `;

    } else {

        htmlErros = `

            <div
                style="
                    overflow: auto;
                    max-height: 330px;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                "
            >

                <table
                    style="
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 11px;
                        min-width: 1000px;
                    "
                >

                    <thead
                        style="
                            position: sticky;
                            top: 0;
                            background: #f8d7da;
                            z-index: 2;
                        "
                    >

                        <tr>

                            <th style="padding: 8px;">Linha</th>
                            <th style="padding: 8px;">Tipo</th>
                            <th style="padding: 8px;">MLB</th>
                            <th style="padding: 8px;">SKU planilha</th>
                            <th style="padding: 8px;">Base</th>
                            <th style="padding: 8px;">Descrição</th>
                            <th style="padding: 8px;">Ação</th>

                        </tr>

                    </thead>

                    <tbody>

        `;


        resultado.erros.forEach(
            erro => {

                htmlErros += `

                    <tr
                        style="
                            border-bottom: 1px solid #eee;
                        "
                    >

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(erro.linha)}
                        </td>

                        <td style="padding: 7px;">
                            <strong style="color:#dc3545;">
                                ${escapeImportacaoML(erro.tipo)}
                            </strong>
                        </td>

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(erro.mlb)}
                        </td>

                        <td
                            style="
                                padding: 7px;
                                max-width: 240px;
                                word-break: break-all;
                            "
                        >
                            ${escapeImportacaoML(erro.skuPlanilha)}
                        </td>

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(erro.base)}
                        </td>

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(erro.descricao)}
                        </td>

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(erro.acao)}
                        </td>

                    </tr>

                `;

            }
        );


        htmlErros += `

                    </tbody>

                </table>

            </div>
        `;

    }


    // =====================================================
    // AJUSTES APLICADOS
    // =====================================================

    let htmlAjustes = '';


    if (
        resultado.aplicados.length === 0
    ) {

        htmlAjustes = `

            <div
                style="
                    padding: 25px;
                    text-align: center;
                    color: #6c757d;
                "
            >

                Nenhum ajuste foi necessário/aplicado.

            </div>

        `;

    } else {

        htmlAjustes = `

            <div
                style="
                    overflow: auto;
                    max-height: 330px;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                "
            >

                <table
                    style="
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 11px;
                    "
                >

                    <thead
                        style="
                            position: sticky;
                            top: 0;
                            background: #d4edda;
                            z-index: 2;
                        "
                    >

                        <tr>

                            <th style="padding: 8px;">Tipo</th>
                            <th style="padding: 8px;">SKU</th>
                            <th style="padding: 8px;">Alteração</th>
                            <th style="padding: 8px;">Resultado</th>

                        </tr>

                    </thead>

                    <tbody>

        `;


        resultado.aplicados.forEach(
            ajuste => {

                htmlAjustes += `

                    <tr
                        style="
                            border-bottom: 1px solid #eee;
                        "
                    >

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(ajuste.tipo)}
                        </td>

                        <td style="padding: 7px;">
                            <strong>
                                ${escapeImportacaoML(ajuste.sku)}
                            </strong>
                        </td>

                        <td style="padding: 7px;">
                            ${escapeImportacaoML(ajuste.descricao)}
                        </td>

                        <td
                            style="
                                padding: 7px;
                                color: #28a745;
                                font-weight: bold;
                            "
                        >
                            ${escapeImportacaoML(ajuste.resultado)}
                        </td>

                    </tr>

                `;

            }
        );


        htmlAjustes += `

                    </tbody>

                </table>

            </div>

        `;

    }


    // =====================================================
    // MODAL
    // =====================================================

    modal.innerHTML = `

        <div
            style="
                width: 96%;
                max-width: 1400px;
                max-height: 94vh;
                overflow-y: auto;
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 20px 60px rgba(0,0,0,.3);
            "
        >

            <!-- ========================================== -->
            <!-- CABEÇALHO -->
            <!-- ========================================== -->

            <div
                style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                    border-bottom: 1px solid #dee2e6;
                    padding-bottom: 12px;
                "
            >

                <div>

                    <h3
                        style="
                            margin: 0;
                            color: #00ADEE;
                        "
                    >

                        <i class="fas fa-file-excel"></i>

                        Relatório da Planilha Mercado Livre

                    </h3>

                    <div
                        style="
                            color: #6c757d;
                            font-size: 12px;
                            margin-top: 4px;
                        "
                    >
                        ${escapeImportacaoML(resultado.arquivo)}
                        &bull;
                        Aba ${escapeImportacaoML(resultado.aba)}
                    </div>

                </div>


                <button
                    onclick="fecharRelatorioImportacaoML()"
                    style="
                        border: none;
                        background: transparent;
                        font-size: 25px;
                        cursor: pointer;
                    "
                >
                    &times;
                </button>

            </div>


            <!-- ========================================== -->
            <!-- CARDS -->
            <!-- ========================================== -->

            <div
                style="
                    display: grid;
                    grid-template-columns:
                        repeat(
                            auto-fit,
                            minmax(140px, 1fr)
                        );
                    gap: 10px;
                    margin-bottom: 20px;
                "
            >

                ${criarCardResumoImportacaoML(
                    'Linhas analisadas',
                    resumo.linhasAnalisadas,
                    '#007bff'
                )}

                ${criarCardResumoImportacaoML(
                    'MLBs únicos',
                    resumo.mlbsUnicos,
                    '#6f42c1'
                )}

                ${criarCardResumoImportacaoML(
                    'Produtos encontrados',
                    resumo.produtosEncontrados,
                    '#28a745'
                )}

                ${criarCardResumoImportacaoML(
                    'Linhas de kit',
                    resumo.linhasKit,
                    '#17a2b8'
                )}

                ${criarCardResumoImportacaoML(
                    'MLBs adicionados',
                    resumo.mlbsAdicionar,
                    '#20c997'
                )}

                ${criarCardResumoImportacaoML(
                    'Kits adicionados',
                    resumo.kitsAdicionar,
                    '#00ADEE'
                )}

                ${criarCardResumoImportacaoML(
                    'Kits corrigidos',
                    resumo.kitsAtualizar,
                    '#ffc107'
                )}

                ${criarCardResumoImportacaoML(
                    'Erros',
                    resultado.erros.length,
                    '#dc3545'
                )}

            </div>


            <!-- ========================================== -->
            <!-- OBSERVAÇÃO -->
            <!-- ========================================== -->

            <div
                style="
                    background: #e7f3ff;
                    border-left: 4px solid #007bff;
                    padding: 10px 14px;
                    border-radius: 6px;
                    margin-bottom: 18px;
                    font-size: 12px;
                "
            >

                <strong>Importação segura:</strong>

                o sistema adicionou/corrigiu apenas associações
                que conseguiu comprovar pela planilha.

                MLBs e relacionamentos existentes
                <strong>não foram apagados automaticamente</strong>.

            </div>


            <!-- ========================================== -->
            <!-- AJUSTES -->
            <!-- ========================================== -->

            <h4
                style="
                    font-size: 15px;
                    color: #28a745;
                    margin-bottom: 8px;
                "
            >
                <i class="fas fa-check-circle"></i>
                Ajustes realizados
                (${resultado.aplicados.length})
            </h4>

            ${htmlAjustes}


            <!-- ========================================== -->
            <!-- ERROS -->
            <!-- ========================================== -->

            <h4
                style="
                    font-size: 15px;
                    color: #dc3545;
                    margin-top: 22px;
                    margin-bottom: 8px;
                "
            >
                <i class="fas fa-exclamation-triangle"></i>
                Erros / pendências
                (${resultado.erros.length})
            </h4>

            ${htmlErros}


            <!-- ========================================== -->
            <!-- ERROS DE GRAVAÇÃO -->
            <!-- ========================================== -->

            ${
                resultado.errosAplicacao.length
                    ? `

                        <div
                            style="
                                background: #f8d7da;
                                margin-top: 15px;
                                border-radius: 6px;
                                padding: 12px;
                                color: #721c24;
                                font-size: 12px;
                            "
                        >

                            <strong>
                                Erros ao gravar no banco:
                            </strong>

                            <br>

                            ${resultado.errosAplicacao
                                .map(
                                    e =>
                                        `${escapeImportacaoML(e.sku)}: ${escapeImportacaoML(e.descricao)}`
                                )
                                .join('<br>')}

                        </div>

                    `
                    : ''
            }


            <!-- ========================================== -->
            <!-- BOTÕES -->
            <!-- ========================================== -->

            <div
                style="
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 20px;
                    border-top: 1px solid #dee2e6;
                    padding-top: 15px;
                "
            >

                <button
                    class="btn btn-success"
                    onclick="baixarRelatorioImportacaoML()"
                >

                    <i class="fas fa-file-excel"></i>

                    Baixar Relatório Excel

                </button>


                <button
                    class="btn btn-secondary"
                    onclick="fecharRelatorioImportacaoML()"
                >

                    Fechar

                </button>

            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );
}


// =========================================================
// CARD DO RELATÓRIO
// =========================================================

function criarCardResumoImportacaoML(
    titulo,
    valor,
    cor
) {

    return `

        <div
            style="
                border: 1px solid #e9ecef;
                border-left: 4px solid ${cor};
                border-radius: 8px;
                padding: 10px;
                background: #fff;
            "
        >

            <div
                style="
                    color: #6c757d;
                    font-size: 10px;
                "
            >
                ${titulo}
            </div>


            <div
                style="
                    color: ${cor};
                    font-size: 22px;
                    font-weight: bold;
                "
            >
                ${valor || 0}
            </div>

        </div>

    `;
}


// =========================================================
// FECHAR RELATÓRIO
// =========================================================

function fecharRelatorioImportacaoML() {

    const modal =
        document.getElementById(
            'modalRelatorioImportacaoML'
        );


    if (modal) {
        modal.remove();
    }
}


// =========================================================
// BAIXAR RELATÓRIO EM EXCEL
// =========================================================

function baixarRelatorioImportacaoML() {

    const resultado =
        resultadoImportacaoPlanilhaML;


    if (!resultado) {

        showToast(
            'Nenhum relatório disponível.',
            'warning'
        );

        return;

    }


    if (
        typeof XLSX ===
        'undefined'
    ) {

        showToast(
            'Biblioteca XLSX não disponível.',
            'error'
        );

        return;

    }


    const wb =
        XLSX.utils.book_new();


    // =====================================================
    // RESUMO
    // =====================================================

    const resumo = [

        [
            'Campo',
            'Valor'
        ],

        [
            'Arquivo',
            resultado.arquivo
        ],

        [
            'Aba',
            resultado.aba
        ],

        [
            'Linhas do arquivo',
            resultado.resumo.linhasArquivo
        ],

        [
            'Linhas analisadas',
            resultado.resumo.linhasAnalisadas
        ],

        [
            'Linhas ignoradas',
            resultado.resumo.linhasIgnoradas
        ],

        [
            'MLBs únicos',
            resultado.resumo.mlbsUnicos
        ],

        [
            'Produtos encontrados',
            resultado.resumo.produtosEncontrados
        ],

        [
            'Linhas de kit',
            resultado.resumo.linhasKit
        ],

        [
            'MLBs adicionados',
            resultado.resumo.mlbsAdicionar
        ],

        [
            'Kits adicionados',
            resultado.resumo.kitsAdicionar
        ],

        [
            'Kits corrigidos',
            resultado.resumo.kitsAtualizar
        ],

        [
            'Erros encontrados',
            resultado.erros.length
        ],

        [
            'Ajustes aplicados',
            resultado.aplicados.length
        ],

        [
            'Erros de gravação',
            resultado.errosAplicacao.length
        ]

    ];


    const wsResumo =
        XLSX.utils.aoa_to_sheet(
            resumo
        );


    XLSX.utils.book_append_sheet(
        wb,
        wsResumo,
        'Resumo'
    );


    // =====================================================
    // AJUSTES
    // =====================================================

    const ajustes =
        resultado.aplicados.map(
            item => ({

                Tipo:
                    item.tipo,

                SKU:
                    item.sku,

                Alteração:
                    item.descricao,

                Resultado:
                    item.resultado

            })
        );


    const wsAjustes =
        XLSX.utils.json_to_sheet(
            ajustes.length
                ? ajustes
                : [
                    {
                        Tipo:
                            'Nenhum ajuste necessário'
                    }
                ]
        );


    XLSX.utils.book_append_sheet(
        wb,
        wsAjustes,
        'Ajustes'
    );


    // =====================================================
    // ERROS
    // =====================================================

    const erros =
        resultado.erros.map(
            item => ({

                Linha:
                    item.linha,

                Tipo:
                    item.tipo,

                MLB:
                    item.mlb,

                'SKU Planilha':
                    item.skuPlanilha,

                Componente:
                    item.componente,

                Base:
                    item.base,

                Descrição:
                    item.descricao,

                Ação:
                    item.acao

            })
        );


    const wsErros =
        XLSX.utils.json_to_sheet(
            erros.length
                ? erros
                : [
                    {
                        Resultado:
                            'Nenhum erro encontrado'
                    }
                ]
        );


    XLSX.utils.book_append_sheet(
        wb,
        wsErros,
        'Erros'
    );


    // =====================================================
    // AVISOS
    // =====================================================

    const avisos =
        resultado.avisos.map(
            item => ({

                Linha:
                    item.linha,

                Tipo:
                    item.tipo,

                MLB:
                    item.mlb,

                SKU:
                    item.sku,

                Descrição:
                    item.descricao

            })
        );


    const wsAvisos =
        XLSX.utils.json_to_sheet(
            avisos.length
                ? avisos
                : [
                    {
                        Resultado:
                            'Nenhum aviso'
                    }
                ]
        );


    XLSX.utils.book_append_sheet(
        wb,
        wsAvisos,
        'Avisos'
    );


    // =====================================================
    // PRODUTOS SEM OCORRÊNCIA NA PLANILHA
    // =====================================================

    const wsSemPlanilha =
        XLSX.utils.json_to_sheet(

            resultado
                .produtosSemPlanilha
                .map(
                    p => ({

                        SKU:
                            p.sku,

                        Produto:
                            p.nome,

                        ID:
                            p.id

                    })
                )

        );


    XLSX.utils.book_append_sheet(
        wb,
        wsSemPlanilha,
        'Sem ocorrência'
    );


    const agora =
        new Date();


    const dataNome =
        `${agora.getFullYear()}-${String(
            agora.getMonth() + 1
        ).padStart(2, '0')}-${String(
            agora.getDate()
        ).padStart(2, '0')}`;


    XLSX.writeFile(

        wb,

        `relatorio_importacao_ml_${dataNome}.xlsx`

    );
}


// =========================================================
// MODAL DE PROCESSAMENTO
// =========================================================

function mostrarProcessamentoImportacaoML(
    mensagem
) {

    let modal =
        document.getElementById(
            'modalProcessandoImportacaoML'
        );


    if (!modal) {

        modal =
            document.createElement(
                'div'
            );


        modal.id =
            'modalProcessandoImportacaoML';


        modal.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.55);
            z-index: 100001;
            display: flex;
            align-items: center;
            justify-content: center;
        `;


        modal.innerHTML = `

            <div
                style="
                    background: white;
                    padding: 30px 40px;
                    border-radius: 12px;
                    min-width: 350px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,.25);
                "
            >

                <div
                    style="
                        font-size: 34px;
                        color: #00ADEE;
                        margin-bottom: 12px;
                    "
                >
                    <i class="fas fa-spinner fa-spin"></i>
                </div>


                <div
                    id="textoProcessamentoImportacaoML"
                    style="
                        font-size: 14px;
                        color: #495057;
                    "
                >
                    Processando...
                </div>

            </div>

        `;


        document.body.appendChild(
            modal
        );

    }


    const texto =
        document.getElementById(
            'textoProcessamentoImportacaoML'
        );


    if (texto) {

        texto.textContent =
            mensagem ||
            'Processando...';

    }
}


// =========================================================
// FECHAR PROCESSAMENTO
// =========================================================

function fecharProcessamentoImportacaoML() {

    const modal =
        document.getElementById(
            'modalProcessandoImportacaoML'
        );


    if (modal) {
        modal.remove();
    }
}


// =========================================================
// RECEBER O ARQUIVO
// =========================================================

async function processarArquivoImportacaoML(
    input
) {

    const arquivo =
        input?.files?.[0];


    if (!arquivo) {
        return;
    }


    try {

        mostrarProcessamentoImportacaoML(
            'Lendo a planilha original do Mercado Livre...'
        );


        // =================================================
        // ANALISAR
        // =================================================

        const resultado =
            await analisarPlanilhaMercadoLivre(
                arquivo
            );


        mostrarProcessamentoImportacaoML(
            `Análise concluída. Aplicando ${resultado.resumo.mlbsAdicionar + resultado.resumo.kitsAdicionar + resultado.resumo.kitsAtualizar} ajuste(s) seguro(s)...`
        );


        // =================================================
        // APLICAR AUTOMATICAMENTE
        // =================================================

        await aplicarAjustesSegurosPlanilhaML(
            resultado
        );


        resultadoImportacaoPlanilhaML =
            resultado;


        fecharProcessamentoImportacaoML();


        // =================================================
        // RELATÓRIO
        // =================================================

        renderizarRelatorioImportacaoPlanilhaML(
            resultado
        );


        if (
            resultado.erros.length > 0
        ) {

            showToast(
                `⚠️ Importação concluída: ${resultado.aplicados.length} ajuste(s) realizado(s) e ${resultado.erros.length} pendência(s).`,
                'warning'
            );

        } else {

            showToast(
                `✅ Importação concluída: ${resultado.aplicados.length} ajuste(s) realizado(s).`,
                'success'
            );

        }


    } catch (error) {

        console.error(
            '❌ Erro ao importar planilha ML:',
            error
        );


        fecharProcessamentoImportacaoML();


        showToast(
            `❌ Erro ao importar planilha: ${error.message}`,
            'error'
        );

    } finally {

        // Permite selecionar novamente
        // o mesmo arquivo depois.

        if (input) {
            input.value = '';
        }

    }
}


// =========================================================
// ABRIR SELETOR DO ARQUIVO
// =========================================================

function abrirImportacaoPlanilhaML() {

    let input =
        document.getElementById(
            'inputImportacaoPlanilhaML'
        );


    if (!input) {

        input =
            document.createElement(
                'input'
            );


        input.id =
            'inputImportacaoPlanilhaML';


        input.type =
            'file';


        input.accept =
            '.xlsx,.xls';


        input.style.display =
            'none';


        input.onchange =
            function() {

                processarArquivoImportacaoML(
                    this
                );

            };


        document.body.appendChild(
            input
        );

    }


    input.click();
}


// =========================================================
// ADICIONAR BOTÃO "IMPORTAR PLANILHA ML"
// VERSÃO CORRIGIDA
// =========================================================

function adicionarBotaoImportarPlanilhaML() {

    console.log(
        '🔧 [IMPORTAÇÃO ML] Tentando adicionar botão...'
    );


    // =====================================================
    // JÁ EXISTE?
    // =====================================================

    if (
        document.getElementById(
            'btnImportarPlanilhaML'
        )
    ) {

        console.log(
            '✅ [IMPORTAÇÃO ML] Botão já existe.'
        );

        return;
    }


    // =====================================================
    // LOCALIZAR A BARRA DE BOTÕES
    //
    // Primeiro tenta encontrar pelo botão Categorias
    // através do onclick, já que ele NÃO possui ID.
    // =====================================================

    let btnCategorias =
        document.querySelector(
            '#estoqueGestaoSystem button[onclick*="abrirModalGerenciarCategorias"]'
        );


    // =====================================================
    // FALLBACK:
    // procurar botão que abre abrirModalCategorias
    // =====================================================

    if (!btnCategorias) {

        btnCategorias =
            document.querySelector(
                '#estoqueGestaoSystem button[onclick*="abrirModalCategorias"]'
            );

    }


    // =====================================================
    // LOCALIZAR CONTAINER
    // =====================================================

    let container =
        btnCategorias?.parentElement ||
        null;


    // =====================================================
    // FALLBACK 2:
    // pegar diretamente a barra do cabeçalho
    // =====================================================

    if (!container) {

        container =
            document.querySelector(
                '#estoqueGestaoSystem .card-header .d-flex.gap-2.align-items-center'
            );

    }


    // =====================================================
    // FALLBACK 3:
    // seletor um pouco mais genérico
    // =====================================================

    if (!container) {

        container =
            document.querySelector(
                '#estoqueGestaoSystem .card-header .d-flex'
            );

    }


    // =====================================================
    // NÃO ENCONTROU
    // =====================================================

    if (!container) {

        console.error(
            '❌ [IMPORTAÇÃO ML] Não foi possível localizar a barra de botões da Gestão de Estoque.'
        );

        return;
    }


    console.log(
        '✅ [IMPORTAÇÃO ML] Barra de botões encontrada:',
        container
    );


    // =====================================================
    // CRIAR BOTÃO
    // =====================================================

    const botao =
        document.createElement(
            'button'
        );


    botao.id =
        'btnImportarPlanilhaML';


    botao.type =
        'button';


    botao.className =
        'btn btn-primary';


    botao.style.cssText = `
        background: #007bff;
        color: #ffffff;
        border: none;
        font-weight: 600;
        white-space: nowrap;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 38px;
    `;


    botao.innerHTML = `
        <i class="fas fa-file-import"></i>
        Importar Planilha ML
    `;


    botao.title =
        'Importar planilha original de anúncios do Mercado Livre';


    botao.onclick =
        function() {

            console.log(
                '📊 [IMPORTAÇÃO ML] Abrindo seletor de arquivo...'
            );


            abrirImportacaoPlanilhaML();

        };


    // =====================================================
    // POSICIONAR O BOTÃO
    //
    // Queremos:
    //
    // Categorias
    // Importar Planilha ML
    // Novo Produto
    // Regras
    // ...
    // =====================================================

    if (
        btnCategorias &&
        btnCategorias.parentElement === container
    ) {

        btnCategorias.insertAdjacentElement(
            'afterend',
            botao
        );

    } else {

        // Se não encontrou Categorias,
        // tenta colocar antes de Novo Produto.

        const btnNovoProduto =
            Array.from(
                container.querySelectorAll(
                    'button'
                )
            ).find(
                btn =>
                    String(
                        btn.textContent || ''
                    )
                        .trim()
                        .toLowerCase()
                        .includes(
                            'novo produto'
                        )
            );


        if (btnNovoProduto) {

            container.insertBefore(
                botao,
                btnNovoProduto
            );

        } else {

            container.appendChild(
                botao
            );

        }

    }


    console.log(
        '✅ [IMPORTAÇÃO ML] Botão "Importar Planilha ML" adicionado com sucesso!'
    );
}

// =========================================================
// IMPORTADOR TEMPORÁRIO DE CADASTRO INICIAL DE PRODUTOS
// =========================================================

// IMPORTANTE:
// A coluna G da planilha não possui cabeçalho.
// Deixe FALSE até confirmar que ela representa custo.
const IMPORTAR_COLUNA_G_COMO_CUSTO = false;

let resultadoImportacaoCadastroInicial = null;
let arquivoCadastroInicialSelecionado = null;
let workbookCadastroInicialSelecionado = null;


// =========================================================
// VERIFICAR SE O IMPORTADOR ESTÁ HABILITADO
// =========================================================

async function importadorCadastroInicialEstaAtivo() {

    try {

        if (!window.supabaseClient) {
            return true;
        }

        const { data, error } =
            await window.supabaseClient
                .from('configuracoes_sistema')
                .select('valor')
                .eq(
                    'chave',
                    'importador_cadastro_inicial_ativo'
                )
                .maybeSingle();


        if (error) {

            console.warn(
                '⚠️ Não foi possível verificar configuração do importador:',
                error
            );

            return true;
        }


        // Se nunca configurou, começa habilitado.
        if (!data) {
            return true;
        }


        let valor = data.valor;


        if (typeof valor === 'string') {

            const texto =
                valor
                    .trim()
                    .toLowerCase();


            if (
                texto === 'false' ||
                texto === '0'
            ) {
                return false;
            }


            if (
                texto === 'true' ||
                texto === '1'
            ) {
                return true;
            }


            try {

                valor =
                    JSON.parse(valor);

            } catch (e) {
                return true;
            }

        }


        return valor !== false;


    } catch (error) {

        console.error(
            '❌ Erro verificando importador:',
            error
        );

        return true;
    }
}


// =========================================================
// CONVERTER VALOR DA PLANILHA EM NÚMERO
// =========================================================

function converterNumeroCadastroInicial(valor) {

    if (
        valor === null ||
        valor === undefined ||
        valor === ''
    ) {
        return 0;
    }


    if (
        typeof valor === 'number'
    ) {

        return Number.isFinite(valor)
            ? valor
            : 0;
    }


    let texto =
        String(valor)
            .trim();


    if (!texto) {
        return 0;
    }


    // Ex:
    // 1.234,56
    if (
        texto.includes(',')
    ) {

        texto =
            texto
                .replace(/\./g, '')
                .replace(',', '.');
    }


    texto =
        texto.replace(
            /[^0-9.\-]/g,
            ''
        );


    const numero =
        parseFloat(texto);


    return Number.isFinite(numero)
        ? numero
        : 0;
}


// =========================================================
// BASE DE 8 CARACTERES
// =========================================================

function baseSkuCadastroInicial(sku) {

    if (!sku) {
        return '';
    }


    return String(sku)
        .trim()
        .substring(0, 8)
        .toUpperCase();
}


function analisarPlanilhaCadastroInicial(
    workbook,
    nomeArquivo,
    categoriaSelecionada
) {

    if (
        !workbook ||
        !workbook.SheetNames ||
        workbook.SheetNames.length === 0
    ) {

        throw new Error(
            'A planilha não possui nenhuma aba.'
        );
    }


    if (!categoriaSelecionada) {

        throw new Error(
            'Nenhuma categoria foi selecionada.'
        );
    }


    const nomeAba =
        workbook.SheetNames[0];


    const sheet =
        workbook.Sheets[
            nomeAba
        ];


    const linhas =
        XLSX.utils.sheet_to_json(
            sheet,
            {

                header: 1,

                defval: null,

                raw: true

            }
        );


    const resultado = {

        nomeArquivo,

        nomeAba,

        // Agora existe UMA categoria escolhida
        categoriaSelecionada,

        produtos: [],

        validos: [],

        duplicadosSistema: [],

        duplicadosPlanilha: [],

        erros: [],

        categoriasNovas: [],

        categoriasEncontradas: [
            categoriaSelecionada
        ]

    };


    const basesPlanilha =
        new Map();


    // =====================================================
    // INDEXAR PRODUTOS JÁ CADASTRADOS
    // =====================================================

    const produtosPorBase =
        new Map();


    for (
        const produto
        of produtosEstoque || []
    ) {

        const base =
            baseSkuCadastroInicial(
                produto.sku
            );


        if (!base) {
            continue;
        }


        if (
            !produtosPorBase.has(
                base
            )
        ) {

            produtosPorBase.set(
                base,
                []
            );

        }


        produtosPorBase
            .get(base)
            .push(
                produto
            );

    }


    // =====================================================
    // LER PLANILHA
    // =====================================================

    for (
        let i = 0;
        i < linhas.length;
        i++
    ) {

        const linha =
            linhas[i] || [];


        const numeroLinha =
            i + 1;


        // =================================================
        // IGNORAR LINHA "Categoria : ..."
        // =================================================

        const colunaA =
            linha[0] !== null &&
            linha[0] !== undefined

                ? String(
                    linha[0]
                ).trim()

                : '';


        if (
            /^categoria\s*:/i.test(
                colunaA
            )
        ) {

            continue;

        }


        // =================================================
        // SUA PLANILHA:
        //
        // C = EAN
        // D = SKU
        // E = NOME
        // F = UNIDADE
        // G = VALOR
        // H = QUANTIDADE
        // =================================================

        const ean =
            linha[2] !== null &&
            linha[2] !== undefined

                ? String(
                    linha[2]
                ).trim()

                : '';


        const sku =
            linha[3] !== null &&
            linha[3] !== undefined

                ? String(
                    linha[3]
                ).trim()

                : '';


        const nome =
            linha[4] !== null &&
            linha[4] !== undefined

                ? String(
                    linha[4]
                ).trim()

                : '';


        const unidade =
            linha[5] !== null &&
            linha[5] !== undefined

                ? String(
                    linha[5]
                ).trim()

                : '';


        const valorPlanilha =
            converterNumeroCadastroInicial(
                linha[6]
            );


        const quantidade =
            Math.max(
                0,

                Math.trunc(

                    converterNumeroCadastroInicial(
                        linha[7]
                    )

                )
            );


        // =================================================
        // NÃO É LINHA DE PRODUTO
        // =================================================

        if (
            !sku &&
            !nome
        ) {

            continue;

        }


        const produto = {

            linha:
                numeroLinha,

            sku,

            base:
                baseSkuCadastroInicial(
                    sku
                ),

            nome,

            // =============================================
            // SEMPRE A CATEGORIA ESCOLHIDA
            // =============================================

            categoria:
                categoriaSelecionada,

            ean,

            unidade,

            valorPlanilha,

            quantidade,

            status:
                'OK',

            mensagem:
                ''

        };


        resultado.produtos.push(
            produto
        );


        // =================================================
        // SKU
        // =================================================

        if (!sku) {

            produto.status =
                'ERRO';


            produto.mensagem =
                'SKU vazio.';


            resultado.erros.push(
                produto
            );


            continue;

        }


        if (
            sku.length < 8
        ) {

            produto.status =
                'ERRO';


            produto.mensagem =
                'SKU possui menos de 8 caracteres.';


            resultado.erros.push(
                produto
            );


            continue;

        }


        // =================================================
        // NOME
        // =================================================

        if (!nome) {

            produto.status =
                'ERRO';


            produto.mensagem =
                'Nome do produto vazio.';


            resultado.erros.push(
                produto
            );


            continue;

        }


        // =================================================
        // DUPLICIDADE DENTRO DA PLANILHA
        // =================================================

        if (
            basesPlanilha.has(
                produto.base
            )
        ) {

            const anterior =
                basesPlanilha.get(
                    produto.base
                );


            produto.status =
                'DUPLICADO_PLANILHA';


            produto.mensagem =
                `Mesma base de 8 caracteres da linha ${anterior.linha}: ${anterior.sku}`;


            resultado
                .duplicadosPlanilha
                .push(
                    produto
                );


            continue;

        }


        basesPlanilha.set(
            produto.base,
            produto
        );


        // =================================================
        // DUPLICIDADE NO SISTEMA
        // =================================================

        const existentes =
            produtosPorBase.get(
                produto.base
            ) || [];


        if (
            existentes.length > 0
        ) {

            produto.status =
                'JA_EXISTE';


            produto.mensagem =
                `Já cadastrado: ${existentes.map(p => p.sku).join(', ')}`;


            resultado
                .duplicadosSistema
                .push(
                    produto
                );


            continue;

        }


        // =================================================
        // PRONTO PARA CADASTRAR
        // =================================================

        resultado.validos.push(
            produto
        );

    }


    return resultado;
}


// =========================================================
// PROCESSAR ARQUIVO SELECIONADO
// =========================================================

async function processarArquivoCadastroInicial(
    input
) {

    const arquivo =
        input?.files?.[0];


    if (!arquivo) {
        return;
    }


    try {

        if (
            typeof XLSX ===
            'undefined'
        ) {

            throw new Error(
                'Biblioteca XLSX não está carregada.'
            );

        }


        // Sempre atualizar estoque antes da análise.
        await carregarProdutosEstoque();


        const buffer =
            await arquivo.arrayBuffer();


        const workbook =
            XLSX.read(
                buffer,
                {
                    type: 'array'
                }
            );


        const resultado =
            analisarPlanilhaCadastroInicial(
                workbook,
                arquivo.name
            );


        resultadoImportacaoCadastroInicial =
            resultado;


        mostrarPreviaCadastroInicial(
            resultado
        );


    } catch (error) {

        console.error(
            '❌ Erro lendo cadastro inicial:',
            error
        );


        showToast(
            `❌ Erro ao ler planilha: ${error.message}`,
            'error'
        );

    } finally {

        if (input) {

            input.value = '';

        }

    }
}


function abrirImportacaoCadastroInicial() {

    let input =
        document.getElementById(
            'inputCadastroInicialProdutos'
        );


    if (!input) {

        input =
            document.createElement(
                'input'
            );


        input.id =
            'inputCadastroInicialProdutos';


        input.type =
            'file';


        input.accept =
            '.xlsx,.xls';


        input.style.display =
            'none';


        input.onchange =
            async function() {

                await prepararArquivoCadastroInicial(
                    this
                );

            };


        document.body.appendChild(
            input
        );

    }


    input.click();
}

async function prepararArquivoCadastroInicial(
    input
) {

    const arquivo =
        input?.files?.[0];


    if (!arquivo) {
        return;
    }


    try {

        if (
            typeof XLSX ===
            'undefined'
        ) {

            throw new Error(
                'Biblioteca XLSX não está carregada.'
            );

        }


        // Atualizar produtos/categorias antes da importação
        await carregarProdutosEstoque();

        await carregarCategoriasCustomizadas();


        const buffer =
            await arquivo.arrayBuffer();


        const workbook =
            XLSX.read(
                buffer,
                {
                    type: 'array'
                }
            );


        arquivoCadastroInicialSelecionado =
            arquivo;


        workbookCadastroInicialSelecionado =
            workbook;


        // =====================================================
        // ABRIR ESCOLHA DA CATEGORIA
        // =====================================================

        abrirModalEscolherCategoriaImportacao(
            arquivo.name
        );


    } catch (error) {

        console.error(
            '❌ Erro lendo planilha:',
            error
        );


        showToast(
            `❌ Erro ao ler planilha: ${error.message}`,
            'error'
        );

    } finally {

        // Permite escolher o mesmo arquivo novamente
        if (input) {
            input.value = '';
        }

    }
}

function abrirModalEscolherCategoriaImportacao(
    nomeArquivo
) {

    const anterior =
        document.getElementById(
            'modalCategoriaImportacaoInicial'
        );


    if (anterior) {
        anterior.remove();
    }


    // =====================================================
    // CATEGORIAS PADRÃO EXISTENTES
    // =====================================================

    const categoriasPadrao = [
        'Eixos',
        'Parafusos',
        'Rolamentos',
        'Raios',
        'Arruelas',
        'Porcas',
        'CapacetesEPartes'
    ];


    // =====================================================
    // CATEGORIAS PERSONALIZADAS EXISTENTES
    // =====================================================

    const categoriasCustom =
        Object.keys(
            categoriasCustomizadas || {}
        );


    // =====================================================
    // JUNTA SEM DUPLICAR
    // =====================================================

    const categorias =
        [
            ...new Set([
                ...categoriasPadrao,
                ...categoriasCustom
            ])
        ]
        .sort(
            (a, b) =>
                a.localeCompare(
                    b,
                    'pt-BR'
                )
        );


    let options = `

        <option value="">
            Selecione uma categoria...
        </option>

    `;


    categorias.forEach(
        categoria => {

            options += `

                <option
                    value="${escaparImportacaoCadastroInicial(
                        categoria
                    )}"
                >
                    ${escaparImportacaoCadastroInicial(
                        categoria
                    )}
                </option>

            `;

        }
    );


    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalCategoriaImportacaoInicial';


    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.55);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100010;
    `;


    modal.innerHTML = `

        <div
            style="
                background: white;
                width: 90%;
                max-width: 550px;
                border-radius: 12px;
                padding: 25px;
                box-shadow: 0 20px 60px rgba(0,0,0,.3);
            "
        >

            <h3
                style="
                    margin-top: 0;
                    color: #00ADEE;
                "
            >

                <i class="fas fa-box-open"></i>

                Importar Produtos

            </h3>


            <div
                style="
                    background: #f8f9fa;
                    padding: 12px;
                    border-radius: 7px;
                    margin-bottom: 20px;
                    font-size: 12px;
                "
            >

                <strong>Arquivo:</strong>

                ${escaparImportacaoCadastroInicial(
                    nomeArquivo
                )}

            </div>


            <label
                style="
                    display: block;
                    font-weight: 600;
                    margin-bottom: 6px;
                "
            >

                Categoria para os produtos

            </label>


            <select
                id="categoriaCadastroInicialSelecionada"
                class="form-control"
                style="
                    width: 100%;
                    margin-bottom: 12px;
                "
            >

                ${options}

            </select>


            <div
                style="
                    background: #e7f3ff;
                    border-left: 4px solid #007bff;
                    padding: 10px 12px;
                    font-size: 12px;
                    margin-bottom: 20px;
                "
            >

                Todos os produtos desta planilha serão
                cadastrados na categoria escolhida acima.

                <br><br>

                As categorias existentes dentro da própria
                planilha serão ignoradas.

            </div>


            <div
                style="
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                "
            >

                <button
                    class="btn btn-secondary"
                    onclick="fecharModalCategoriaImportacaoInicial()"
                >
                    Cancelar
                </button>


                <button
                    class="btn btn-primary"
                    onclick="continuarImportacaoCadastroInicial()"
                >

                    <i class="fas fa-search"></i>

                    Analisar Planilha

                </button>

            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );
}

function fecharModalCategoriaImportacaoInicial() {

    document
        .getElementById(
            'modalCategoriaImportacaoInicial'
        )
        ?.remove();
}

function continuarImportacaoCadastroInicial() {

    const select =
        document.getElementById(
            'categoriaCadastroInicialSelecionada'
        );


    const categoria =
        select?.value?.trim() ||
        '';


    if (!categoria) {

        showToast(
            '⚠️ Selecione a categoria dos produtos.',
            'warning'
        );

        return;
    }


    if (
        !workbookCadastroInicialSelecionado ||
        !arquivoCadastroInicialSelecionado
    ) {

        showToast(
            '❌ A planilha não está mais disponível. Selecione novamente.',
            'error'
        );

        return;
    }


    // =====================================================
    // FECHA SELEÇÃO
    // =====================================================

    fecharModalCategoriaImportacaoInicial();


    // =====================================================
    // ANALISA USANDO A CATEGORIA ESCOLHIDA
    // =====================================================

    const resultado =
        analisarPlanilhaCadastroInicial(

            workbookCadastroInicialSelecionado,

            arquivoCadastroInicialSelecionado.name,

            categoria

        );


    resultadoImportacaoCadastroInicial =
        resultado;


    mostrarPreviaCadastroInicial(
        resultado
    );
}


// =========================================================
// ESCAPE
// =========================================================

function escaparImportacaoCadastroInicial(
    valor
) {

    return String(
        valor ?? ''
    )
        .replace(
            /&/g,
            '&amp;'
        )
        .replace(
            /</g,
            '&lt;'
        )
        .replace(
            />/g,
            '&gt;'
        )
        .replace(
            /"/g,
            '&quot;'
        );
}


// =========================================================
// MOSTRAR PRÉVIA
// =========================================================

function mostrarPreviaCadastroInicial(
    resultado
) {

    const anterior =
        document.getElementById(
            'modalPreviaCadastroInicial'
        );


    if (anterior) {

        anterior.remove();

    }


    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalPreviaCadastroInicial';


    modal.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,.55);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100010;
    `;


    let linhasHtml = '';


    resultado.produtos.forEach(
        produto => {

            let cor =
                '#28a745';


            let textoStatus =
                'PRONTO';


            if (
                produto.status ===
                'JA_EXISTE'
            ) {

                cor =
                    '#ffc107';

                textoStatus =
                    'JÁ EXISTE';

            }


            else if (
                produto.status ===
                'DUPLICADO_PLANILHA'
            ) {

                cor =
                    '#fd7e14';

                textoStatus =
                    'DUPLICADO';

            }


            else if (
                produto.status ===
                'ERRO'
            ) {

                cor =
                    '#dc3545';

                textoStatus =
                    'ERRO';

            }


            linhasHtml += `

                <tr
                    style="
                        border-bottom: 1px solid #eee;
                    "
                >

                    <td style="padding:7px;">
                        ${produto.linha}
                    </td>


                    <td style="padding:7px;">
                        ${escaparImportacaoCadastroInicial(
                            produto.categoria
                        )}
                    </td>


                    <td style="padding:7px;">
                        <code>
                            ${escaparImportacaoCadastroInicial(
                                produto.sku
                            )}
                        </code>
                    </td>


                    <td style="padding:7px;">
                        ${escaparImportacaoCadastroInicial(
                            produto.nome
                        )}
                    </td>


                    <td
                        style="
                            padding:7px;
                            text-align:center;
                        "
                    >
                        ${produto.quantidade}
                    </td>


                    <td style="padding:7px;">

                        <span
                            style="
                                background:${cor};
                                color:white;
                                border-radius:15px;
                                padding:3px 9px;
                                font-size:10px;
                                font-weight:600;
                            "
                        >
                            ${textoStatus}
                        </span>

                    </td>


                    <td
                        style="
                            padding:7px;
                            font-size:11px;
                            color:#6c757d;
                        "
                    >
                        ${escaparImportacaoCadastroInicial(
                            produto.mensagem
                        )}
                    </td>

                </tr>

            `;

        }
    );


    modal.innerHTML = `

        <div
            style="
                background:white;
                width:96%;
                max-width:1400px;
                max-height:94vh;
                overflow-y:auto;
                border-radius:12px;
                padding:22px;
            "
        >

            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    border-bottom:1px solid #ddd;
                    padding-bottom:12px;
                    margin-bottom:15px;
                "
            >

                <div>

                    <h3
                        style="
                            margin:0;
                            color:#00ADEE;
                        "
                    >
                        <i class="fas fa-file-import"></i>
                        Prévia do Cadastro Inicial
                    </h3>


                    <div
                        style="
                            margin-top:4px;
                            color:#6c757d;
                            font-size:12px;
                        "
                    >
                        ${escaparImportacaoCadastroInicial(
                            resultado.nomeArquivo
                        )}
                    </div>

                </div>


                <button
                    onclick="fecharPreviaCadastroInicial()"
                    style="
                        background:none;
                        border:none;
                        font-size:25px;
                        cursor:pointer;
                    "
                >
                    &times;
                </button>

            </div>


            <div
                style="
                    display:grid;
                    grid-template-columns:
                        repeat(
                            auto-fit,
                            minmax(150px,1fr)
                        );
                    gap:10px;
                    margin-bottom:15px;
                "
            >

                ${cardCadastroInicial(
                    'Produtos encontrados',
                    resultado.produtos.length,
                    '#007bff'
                )}


                ${cardCadastroInicial(
                    'Prontos para cadastrar',
                    resultado.validos.length,
                    '#28a745'
                )}


                ${cardCadastroInicial(
                    'Já cadastrados',
                    resultado.duplicadosSistema.length,
                    '#ffc107'
                )}


                ${cardCadastroInicial(
                    'Duplicados na planilha',
                    resultado.duplicadosPlanilha.length,
                    '#fd7e14'
                )}


                ${cardCadastroInicial(
                    'Erros',
                    resultado.erros.length,
                    '#dc3545'
                )}

            </div>

            <div
    style="
        background:#e7f3ff;
        border-left:4px solid #007bff;
        padding:12px 15px;
        border-radius:6px;
        margin-bottom:15px;
    "
>

    <strong>
        Categoria selecionada:
    </strong>

    <span
        style="
            background:#007bff;
            color:white;
            border-radius:15px;
            padding:4px 12px;
            margin-left:5px;
            font-weight:600;
        "
    >

        ${escaparImportacaoCadastroInicial(
            resultado.categoriaSelecionada
        )}

    </span>


    <div
        style="
            margin-top:8px;
            font-size:11px;
            color:#6c757d;
        "
    >

        Todos os produtos aptos desta planilha serão cadastrados
        nesta categoria.

    </div>

</div>
            <div
                style="
                    background:#fff3cd;
                    border-left:4px solid #ffc107;
                    padding:10px 13px;
                    margin-bottom:15px;
                    font-size:12px;
                "
            >

                <strong>Importação segura:</strong>

                produtos que já existem pela base dos
                <strong>8 primeiros caracteres do SKU</strong>
                serão ignorados.

                Nenhum produto existente será sobrescrito.

            </div>


            <div
                style="
                    overflow:auto;
                    max-height:460px;
                    border:1px solid #dee2e6;
                    border-radius:8px;
                "
            >

                <table
                    style="
                        width:100%;
                        min-width:1100px;
                        border-collapse:collapse;
                        font-size:11px;
                    "
                >

                    <thead
                        style="
                            position:sticky;
                            top:0;
                            background:#f8f9fa;
                            z-index:2;
                        "
                    >

                        <tr>

                            <th style="padding:8px;">
                                Linha
                            </th>

                            <th style="padding:8px;">
                                Categoria
                            </th>

                            <th style="padding:8px;">
                                SKU
                            </th>

                            <th style="padding:8px;">
                                Produto
                            </th>

                            <th style="padding:8px;">
                                Estoque
                            </th>

                            <th style="padding:8px;">
                                Status
                            </th>

                            <th style="padding:8px;">
                                Observação
                            </th>

                        </tr>

                    </thead>


                    <tbody>

                        ${linhasHtml}

                    </tbody>

                </table>

            </div>


            <div
                style="
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                    gap:10px;
                    flex-wrap:wrap;
                    margin-top:18px;
                    border-top:1px solid #ddd;
                    padding-top:15px;
                "
            >

                <button
                    class="btn btn-outline-danger"
                    onclick="desativarImportadorCadastroInicial()"
                >
                    <i class="fas fa-power-off"></i>
                    Desativar Importador
                </button>


                <div
                    style="
                        display:flex;
                        gap:10px;
                    "
                >

                    <button
                        class="btn btn-secondary"
                        onclick="fecharPreviaCadastroInicial()"
                    >
                        Cancelar
                    </button>


                    <button
                        class="btn btn-success"
                        onclick="confirmarImportacaoCadastroInicial()"
                        ${
                            resultado.validos.length === 0
                                ? 'disabled'
                                : ''
                        }
                    >

                        <i class="fas fa-check"></i>

                        Cadastrar
                        ${resultado.validos.length}
                        Produto(s)

                    </button>

                </div>

            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );
}


// =========================================================
// CARD
// =========================================================

function cardCadastroInicial(
    titulo,
    valor,
    cor
) {

    return `

        <div
            style="
                border:1px solid #dee2e6;
                border-left:4px solid ${cor};
                border-radius:8px;
                padding:10px;
            "
        >

            <div
                style="
                    color:#6c757d;
                    font-size:10px;
                "
            >
                ${titulo}
            </div>


            <div
                style="
                    color:${cor};
                    font-size:22px;
                    font-weight:bold;
                "
            >
                ${valor}
            </div>

        </div>

    `;
}


// =========================================================
// FECHAR PRÉVIA
// =========================================================

function fecharPreviaCadastroInicial() {

    document
        .getElementById(
            'modalPreviaCadastroInicial'
        )
        ?.remove();
}


// =========================================================
// INSERIR PRODUTOS
// =========================================================

async function confirmarImportacaoCadastroInicial() {

    const resultado =
        resultadoImportacaoCadastroInicial;


    if (
        !resultado ||
        resultado.validos.length === 0
    ) {

        showToast(
            'Nenhum produto válido para cadastrar.',
            'warning'
        );

        return;
    }


    if (
        !confirm(
            `Cadastrar ${resultado.validos.length} produto(s) no estoque?`
        )
    ) {
        return;
    }


    const botao =
        document.querySelector(
            '#modalPreviaCadastroInicial .btn-success'
        );


    if (botao) {

        botao.disabled =
            true;

        botao.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Cadastrando...';

    }


    let cadastrados =
        0;


    const erros =
        [];


    try {


        // =================================================
        // CADASTRAR PRODUTOS UM POR UM
        //
        // É proposital nesta primeira carga:
        // se 1 linha der erro, as demais continuam.
        // =================================================

        for (
            let i = 0;
            i < resultado.validos.length;
            i++
        ) {

            const item =
                resultado.validos[i];


            try {

                // =========================================
                // REVALIDAR DUPLICIDADE NO MOMENTO DA GRAVAÇÃO
                // =========================================

                const base =
                    baseSkuCadastroInicial(
                        item.sku
                    );


                const duplicadoAgora =
                    produtosEstoque.find(
                        produto =>
                            baseSkuCadastroInicial(
                                produto.sku
                            ) ===
                            base
                    );


                if (
                    duplicadoAgora
                ) {

                    erros.push({

                        sku:
                            item.sku,

                        erro:
                            `Já existe no sistema: ${duplicadoAgora.sku}`

                    });


                    continue;
                }


                const custo =
                    IMPORTAR_COLUNA_G_COMO_CUSTO

                        ? item.valorPlanilha

                        : 0;


                const dadosExtra = {

                    ean:
                        item.ean || '',

                    unidade:
                        item.unidade || '',

                    categoria_origem:
                        item.categoria || '',

                    valor_planilha_original:
                        item.valorPlanilha || 0,

                    mlb_codes:
                        [],

                    bloquear_sync_ml:
                        false

                };


                const produtoData = {

                    nome:
                        item.nome,

                    sku:
                        item.sku,

                    quantidade:
                        item.quantidade,

                    preco:
                        0,

                    descricao:
                        '',

                    categoria:
                        item.categoria,

                    dados_extra:
                        dadosExtra,

                    ultimo_custo:
                        custo,

                    custo_medio:
                        custo,

                    historico_custos:
                        [],

                    bloquear_sync_ml:
                        false

                };


                const {
                    data,
                    error
                } =
                    await window.supabaseClient
                        .from(
                            'produtos_estoque'
                        )
                        .insert([
                            produtoData
                        ])
                        .select();


                if (error) {
                    throw error;
                }


                const produtoSalvo =
                    data?.[0];


                if (!produtoSalvo) {

                    throw new Error(
                        'Produto não retornado pelo Supabase.'
                    );

                }


                // =========================================
                // REGISTRAR ESTOQUE INICIAL NO HISTÓRICO
                // =========================================

                if (
                    item.quantidade > 0
                ) {

                    await registrarMovimentacao(

                        produtoSalvo.id,

                        'entrada',

                        item.quantidade,

                        'Importação Inicial de Estoque',

                        'nova'

                    );

                }


                // Coloca em memória para impedir duplicidade
                // durante a própria importação.
                produtosEstoque.push(
                    produtoSalvo
                );


                cadastrados++;


                if (botao) {

                    botao.innerHTML =
                        `<i class="fas fa-spinner fa-spin"></i> ${i + 1}/${resultado.validos.length}`;

                }


            } catch (error) {

                console.error(
                    `❌ Erro cadastrando ${item.sku}:`,
                    error
                );


                erros.push({

                    sku:
                        item.sku,

                    erro:
                        error.message

                });

            }

        }


        // =================================================
        // FINAL
        // =================================================

        await carregarProdutosEstoque();


        fecharPreviaCadastroInicial();


        mostrarRelatorioCadastroInicial({

            cadastrados,

            ignorados:
                resultado.duplicadosSistema.length +
                resultado.duplicadosPlanilha.length,

            erros,

            categoriasCriadas:
                resultado.categoriasNovas

        });


    } catch (error) {

        console.error(
            '❌ Erro geral na importação:',
            error
        );


        showToast(
            `Erro durante importação: ${error.message}`,
            'error'
        );


        if (botao) {

            botao.disabled =
                false;

            botao.innerHTML =
                'Tentar novamente';

        }

    }
}


// =========================================================
// RELATÓRIO FINAL
// =========================================================

function mostrarRelatorioCadastroInicial(
    dados
) {

    const modal =
        document.createElement(
            'div'
        );


    modal.id =
        'modalResultadoCadastroInicial';


    modal.style.cssText = `
        position:fixed;
        inset:0;
        background:rgba(0,0,0,.55);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:100020;
    `;


    const errosHtml =
        dados.erros.length

            ? `

                <div
                    style="
                        margin-top:15px;
                        max-height:250px;
                        overflow:auto;
                        border:1px solid #f5c6cb;
                        border-radius:6px;
                    "
                >

                    ${dados.erros
                        .map(
                            item => `

                            <div
                                style="
                                    padding:8px 10px;
                                    border-bottom:1px solid #eee;
                                    font-size:12px;
                                "
                            >

                                <strong>
                                    ${escaparImportacaoCadastroInicial(item.sku)}
                                </strong>

                                <br>

                                <span style="color:#dc3545;">
                                    ${escaparImportacaoCadastroInicial(item.erro)}
                                </span>

                            </div>

                        `
                        )
                        .join('')}

                </div>

            `

            : '';


    modal.innerHTML = `

        <div
            style="
                background:white;
                padding:25px;
                border-radius:12px;
                width:90%;
                max-width:700px;
            "
        >

            <h3
                style="
                    color:#28a745;
                    margin-top:0;
                "
            >
                <i class="fas fa-check-circle"></i>
                Importação concluída
            </h3>


            <div
                style="
                    display:grid;
                    grid-template-columns:
                        repeat(3,1fr);
                    gap:10px;
                "
            >

                ${cardCadastroInicial(
                    'Cadastrados',
                    dados.cadastrados,
                    '#28a745'
                )}


                ${cardCadastroInicial(
                    'Ignorados',
                    dados.ignorados,
                    '#ffc107'
                )}


                ${cardCadastroInicial(
                    'Erros',
                    dados.erros.length,
                    '#dc3545'
                )}

            </div>


            ${
                dados.categoriasCriadas.length
                    ? `

                    <div
                        style="
                            margin-top:15px;
                            font-size:12px;
                        "
                    >

                        <strong>
                            Categorias criadas:
                        </strong>

                        ${dados.categoriasCriadas
                            .map(
                                escaparImportacaoCadastroInicial
                            )
                            .join(', ')}

                    </div>

                    `
                    : ''
            }


            ${errosHtml}


            <div
                style="
                    text-align:right;
                    margin-top:20px;
                "
            >

                <button
                    class="btn btn-primary"
                    onclick="
                        document
                            .getElementById('modalResultadoCadastroInicial')
                            ?.remove()
                    "
                >
                    Fechar
                </button>

            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );
}


// =========================================================
// DESATIVAR IMPORTADOR DEPOIS QUE TERMINAR TUDO
// =========================================================

async function desativarImportadorCadastroInicial() {

    const confirmar =
        confirm(
            'Desativar o Importador de Produtos?\n\nFaça isso somente depois que terminar toda a carga inicial. O botão desaparecerá da Gestão de Estoque.'
        );


    if (!confirmar) {
        return;
    }


    try {

        const {
            error
        } =
            await window.supabaseClient
                .from(
                    'configuracoes_sistema'
                )
                .upsert({

                    chave:
                        'importador_cadastro_inicial_ativo',

                    valor:
                        JSON.stringify(
                            false
                        ),

                    atualizado_em:
                        new Date()
                            .toISOString(),

                    atualizado_por:
                        currentUser?.name ||
                        'sistema'

                }, {

                    onConflict:
                        'chave'

                });


        if (error) {
            throw error;
        }


        document
            .getElementById(
                'btnImportarCadastroInicial'
            )
            ?.remove();


        fecharPreviaCadastroInicial();


        showToast(
            '✅ Importador de cadastro inicial desativado.',
            'success'
        );


    } catch (error) {

        console.error(
            'Erro desativando importador:',
            error
        );


        showToast(
            `Erro ao desativar importador: ${error.message}`,
            'error'
        );

    }
}


// =========================================================
// ADICIONAR BOTÃO NA GESTÃO DE ESTOQUE
// =========================================================

async function adicionarBotaoImportacaoCadastroInicial() {

    if (
        document.getElementById(
            'btnImportarCadastroInicial'
        )
    ) {
        return;
    }


    const ativo =
        await importadorCadastroInicialEstaAtivo();


    if (!ativo) {

        console.log(
            'ℹ️ Importador de cadastro inicial está desativado.'
        );

        return;
    }


    // Somente administradores.
    const username =
        currentUser?.username
            ?.toLowerCase() || '';


    if (
        !usuariosAdmin.includes(
            username
        )
    ) {

        return;
    }


    const container =
        document.querySelector(
            '#estoqueGestaoSystem .card-header .d-flex.gap-2'
        );


    if (!container) {

        setTimeout(
            adicionarBotaoImportacaoCadastroInicial,
            500
        );

        return;
    }


    const botao =
        document.createElement(
            'button'
        );


    botao.id =
        'btnImportarCadastroInicial';


    botao.type =
        'button';


    botao.className =
        'btn btn-warning';


    botao.style.cssText = `
        font-weight:600;
        white-space:nowrap;
    `;


    botao.innerHTML = `
        <i class="fas fa-box-open"></i>
        Importar Produtos
    `;


    botao.title =
        'Importação temporária do cadastro inicial de produtos';


    botao.onclick =
        abrirImportacaoCadastroInicial;


    // =====================================================
    // COLOCAR PERTO DE CATEGORIAS
    // =====================================================

    const btnImportarML =
        document.getElementById(
            'btnImportarPlanilhaML'
        );


    if (
        btnImportarML &&
        btnImportarML.parentElement ===
        container
    ) {

        container.insertBefore(
            botao,
            btnImportarML
        );


        return;
    }


    const btnCategorias =
        container.querySelector(
            'button[onclick*="abrirModalGerenciarCategorias"]'
        );


    if (btnCategorias) {

        btnCategorias
            .insertAdjacentElement(
                'afterend',
                botao
            );

    } else {

        container.prepend(
            botao
        );

    }
}

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
window.fecharHistoricoEstoque = fecharHistoricoEstoque;
window.aplicarFiltroHistoricoEstoque = aplicarFiltroHistoricoEstoque;
window.definirPeriodoHistoricoEstoque = definirPeriodoHistoricoEstoque;
window.renderizarHistoricoEstoqueFiltrado = renderizarHistoricoEstoqueFiltrado;
window.renderizarGraficoHistoricoMovimentacoes = renderizarGraficoHistoricoMovimentacoes;
window.abrirImportacaoCadastroInicial = abrirImportacaoCadastroInicial;
window.processarArquivoCadastroInicial = processarArquivoCadastroInicial;
window.confirmarImportacaoCadastroInicial = confirmarImportacaoCadastroInicial;
window.fecharPreviaCadastroInicial = fecharPreviaCadastroInicial;
window.desativarImportadorCadastroInicial = desativarImportadorCadastroInicial;
window.adicionarBotaoImportacaoCadastroInicial = adicionarBotaoImportacaoCadastroInicial;
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
// =========================================================
// SOBRESCREVER CARREGAMENTO DAS CATEGORIAS
// =========================================================

const _carregarCategoriasCustomizadasOriginal =
    carregarCategoriasCustomizadas;


carregarCategoriasCustomizadas =
    async function() {

        // Carregar categorias
        const resultado =
            await _carregarCategoriasCustomizadasOriginal();


        // =================================================
        // GARANTIR SELECTS ATUALIZADOS
        // =================================================

        atualizarSelectCategorias();


        // =================================================
        // INICIALIZAR REGRAS DAS NOVAS CATEGORIAS
        // =================================================

        setTimeout(
            inicializarRegrasCategoriasCustomizadas,
            500
        );


        return resultado;
    };

console.log('📦 Gestão de Estoque carregada com sucesso! (Versão completa com categorias customizadas)');