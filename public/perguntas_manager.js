// ============================================
// PERGUNTAS MANAGER - COM PERSISTÊNCIA NO SUPABASE
// ============================================

console.log('perguntas_manager.js carregado');

// Variáveis globais
let perguntas = [];
let currentPerguntaFilter = 'todas';
let perguntasPagination = { offset: 0, limit: 20, total: 0 };
let municipiosCache = null; // cache da base de municípios

// Cache de compras por comprador (id ML -> array de vendas de vendas_nfe_cache).
window._comprasPorCompradorId = window._comprasPorCompradorId || new Map();

// Mapeamento de código UF para sigla (IBGE)
const codigoUfParaSigla = {
    11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO',
    21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
    31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP',
    41: 'PR', 42: 'SC', 43: 'RS',
    50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF'
};

// ============================================
// FUNÇÃO PRINCIPAL PARA ABRIR O SISTEMA
// ============================================
window.abrirSistemaPerguntas = async function() {
    console.log('abrirSistemaPerguntas chamada');
    
    if (typeof currentUser === 'undefined' || !currentUser) {
        showToast('⚠️ Faça login primeiro', 'warning');
        return;
    }
    
    if (typeof esconderTodosOsSistemas === 'function') {
        esconderTodosOsSistemas('perguntasSystem');
    } else {
        const menuSystem = document.getElementById('menuSystem');
        if (menuSystem) menuSystem.classList.add('hidden');
    }

    const perguntasSystem = document.getElementById('perguntasSystem');
    if (perguntasSystem) {
        perguntasSystem.classList.remove('hidden');
    } else {
        console.error('Elemento perguntasSystem não encontrado');
        showToast('Erro: Sistema de perguntas não encontrado', 'error');
        return;
    }
    
    const userNameEl = document.getElementById('perguntasUserName');
    const userAvatarEl = document.getElementById('perguntasUserAvatar');
    const userRoleEl = document.getElementById('perguntasUserRole');
    if (userNameEl) userNameEl.textContent = currentUser.name;
    if (userAvatarEl) userAvatarEl.textContent = currentUser.avatar;
    if (userRoleEl) userRoleEl.textContent = currentUser.role;
    
    await carregarPerguntasDoBanco();
    await sincronizarPerguntasComML();
    
    showToast('📢 Sistema de Perguntas carregado', 'info');
};

// ============================================
// CARREGAR PERGUNTAS DO SUPABASE
// ============================================
async function carregarPerguntasDoBanco() {
    if (!window.supabaseClient) {
        console.warn('Supabase não disponível');
        return;
    }
    try {
        // .select() sozinho trunca em 1000 linhas (limite padrão do
        // Supabase) — com a tabela passando disso, as perguntas mais
        // antigas nunca chegavam a entrar na memória. Pagina em blocos.
        const tamanhoPagina = 1000;
        let inicio = 0;
        let todasPerguntas = [];
        let continuar = true;

        while (continuar) {
            const fim = inicio + tamanhoPagina - 1;

            const { data, error } = await window.supabaseClient
                .from('perguntas_ml')
                .select('*')
                .order('data_pergunta', { ascending: false })
                .range(inicio, fim);

            if (error) throw error;

            const lote = data || [];
            todasPerguntas.push(...lote);

            if (lote.length < tamanhoPagina) {
                continuar = false;
            } else {
                inicio += tamanhoPagina;
            }
        }

        if (todasPerguntas.length > 0) {
            perguntas = todasPerguntas;
            perguntasPagination.total = perguntas.filter(p => !p.excluida).length;
            renderizarPerguntas();
            atualizarPaginacao();
            console.log(`📦 ${perguntas.length} perguntas carregadas do Supabase`);
            carregarComprasCompradoresPerguntas();
        }
    } catch (error) {
        console.error('Erro ao carregar perguntas do banco:', error);
    }
}

// ============================================
// COMPRAS DE CADA COMPRADOR (cruza com vendas_nfe_cache pelo ID
// numérico do ML — pra mostrar "já é cliente" e o perfil completo)
// ============================================
async function carregarComprasCompradoresPerguntas() {
    if (!window.supabaseClient) return;

    const idsUnicos = [...new Set(perguntas.filter(p => p.comprador_id).map(p => p.comprador_id))];
    const novos = idsUnicos.filter(id => !window._comprasPorCompradorId.has(id));
    if (!novos.length) return;

    try {
        const { data, error } = await window.supabaseClient
            .from('vendas_nfe_cache')
            .select('id_venda_ml, venda_json')
            .in('venda_json->buyer->>id', novos);

        if (error) throw error;

        novos.forEach(id => window._comprasPorCompradorId.set(id, []));

        (data || []).forEach(row => {
            const buyerId = String(row.venda_json?.buyer?.id || '');
            if (window._comprasPorCompradorId.has(buyerId)) {
                window._comprasPorCompradorId.get(buyerId).push(row);
            }
        });

        renderizarPerguntas();

    } catch (error) {
        console.warn('Erro ao carregar compras dos compradores:', error);
    }
}

// ============================================
// SINCRONIZAR COM MERCADO LIVRE
// ============================================
async function sincronizarPerguntasComML() {
    if (!window.supabaseClient) {
        console.warn('Supabase não disponível, carregando apenas do ML');
        return await carregarPerguntasML(0);
    }
    
    try {
        const tokenData = await getValidToken();
        if (!tokenData || !tokenData.access_token) {
            throw new Error('Token ML não disponível');
        }
        
        const sellerId = ML_CONFIG?.USER_ID || '415176739';
        let offset = 0;
        let total = 0;
        let novasPerguntas = 0;
        
        do {
            const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&offset=${offset}&limit=50&sort=date_desc&api_version=4`;
            const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
            const response = await fetch(proxyUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            if (offset === 0) total = data.paging?.total || 0;
            
            const questions = data.questions || [];
            if (questions.length === 0) break;
            
            for (const q of questions) {
                // Supabase devolve id como texto (bigint), a API do ML devolve
                // como número — comparação por === sempre dava "não existe" e
                // duplicava a pergunta na memória. Precisa normalizar pra String.
                const existe = perguntas.some(p => String(p.id) === String(q.id));
                
                // Buscar dados do comprador (nome e cidade)
                let compradorNome = 'Anônimo';
                let compradorCidade = 'Não informado';
                
                if (q.from?.id) {
                    try {
                        const userUrl = `https://api.mercadolibre.com/users/${q.from.id}`;
                        const userProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(userUrl)}&token=${tokenData.access_token}`;
                        const userRes = await fetch(userProxy);
                        if (userRes.ok) {
                            const userData = await userRes.json();
                            compradorNome = userData.nickname || userData.first_name || userData.email || `Usuário ${q.from.id}`;
                            compradorCidade = userData.address?.city || userData.address?.state || 'Não informado';
                        } else {
                            compradorNome = q.from?.nickname || `Usuário ${q.from.id}`;
                        }
                    } catch (e) {
                        console.warn('Erro ao buscar dados do comprador:', e);
                        compradorNome = q.from?.nickname || `Usuário ${q.from.id}`;
                    }
                } else if (q.from?.nickname) {
                    compradorNome = q.from.nickname;
                }
                
                // Buscar UF da cidade
                const estado = await buscarEstadoPorCidade(compradorCidade);
                
                // Buscar título e imagem do anúncio
                let itemTitulo = 'Produto não encontrado';
                let itemImagem = '';
                if (q.item_id) {
                    try {
                        const itemUrl = `https://api.mercadolibre.com/items/${q.item_id}`;
                        const itemProxy = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(itemUrl)}&token=${tokenData.access_token}`;
                        const itemRes = await fetch(itemProxy);
                        if (itemRes.ok) {
                            const itemData = await itemRes.json();
                            itemTitulo = itemData.title || 'Sem título';
                            itemImagem = (itemData.pictures && itemData.pictures[0] && itemData.pictures[0].url) || '';
                        }
                    } catch (e) {
                        console.warn(`Erro ao buscar item ${q.item_id}:`, e);
                    }
                }
                
                const perguntaData = {
                    id: String(q.id),
                    comprador_id: q.from?.id ? String(q.from.id) : null,
                    item_id: q.item_id,
                    seller_id: sellerId,
                    pergunta: q.text,
                    data_pergunta: q.date_created,
                    status: q.answer ? 'respondida' : 'pendente',
                    resposta: q.answer?.text || null,
                    data_resposta: q.answer?.date_created || null,
                    comprador_nome: compradorNome,
                    comprador_cidade: compradorCidade,
                    comprador_estado: estado,
                    item_titulo: itemTitulo,
                    item_imagem: itemImagem
                };
                
                if (!existe) {
                    const { error } = await window.supabaseClient
                        .from('perguntas_ml')
                        .upsert(perguntaData, { onConflict: 'id' });
                    
                    if (!error) {
                        perguntas.unshift(perguntaData);
                        novasPerguntas++;
                    }
                } else {
                    // Atualizar se resposta mudou ou faltam dados do item
                    const local = perguntas.find(p => String(p.id) === String(q.id));
                    let precisaUpdate = false;
                    const updateData = { updated_at: new Date().toISOString() };
                    
                    if (local.status === 'pendente' && q.answer) {
                        updateData.status = 'respondida';
                        updateData.resposta = q.answer.text;
                        updateData.data_resposta = q.answer.date_created;
                        precisaUpdate = true;
                    }
                    
                    if (!local.item_titulo || !local.item_imagem) {
                        updateData.item_titulo = itemTitulo;
                        updateData.item_imagem = itemImagem;
                        precisaUpdate = true;
                    }

                    if (!local.comprador_id && q.from?.id) {
                        updateData.comprador_id = String(q.from.id);
                        precisaUpdate = true;
                    }

                    if (precisaUpdate) {
                        const { error } = await window.supabaseClient
                            .from('perguntas_ml')
                            .update(updateData)
                            .eq('id', q.id);
                        if (!error) {
                            Object.assign(local, updateData);
                        }
                    }
                }
            }
            
            offset += questions.length;
        } while (offset < total);
        
        if (novasPerguntas > 0) {
            console.log(`✅ ${novasPerguntas} novas perguntas salvas no Supabase`);
            showToast(`📥 ${novasPerguntas} nova(s) pergunta(s) sincronizada(s)`, 'success');
        }
        
        // Reordenar por data (mais recente primeiro)
        perguntas.sort((a, b) => new Date(b.data_pergunta) - new Date(a.data_pergunta));
        perguntasPagination.total = perguntas.filter(p => !p.excluida).length;
        renderizarPerguntas();
        atualizarPaginacao();
        carregarComprasCompradoresPerguntas();

    } catch (error) {
        console.error('Erro na sincronização com ML:', error);
        showToast('Erro ao sincronizar perguntas: ' + error.message, 'error');
    }
}

// ============================================
// CARREGAR PERGUNTAS DIRETO DO ML (FALLBACK)
// ============================================
async function carregarPerguntasML(offset = 0) {
    try {
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) throw new Error('Token não disponível');
        
        const sellerId = ML_CONFIG?.USER_ID || '415176739';
        const url = `https://api.mercadolibre.com/questions/search?seller_id=${sellerId}&offset=${offset}&limit=50&sort=date_desc&api_version=4`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        perguntas = data.questions || [];
        perguntasPagination.total = data.paging?.total || 0;
        perguntasPagination.offset = offset;
        
        await enriquecerPerguntasComDadosComprador();
        renderizarPerguntas();
        atualizarPaginacao();
        
    } catch (error) {
        console.error('Erro ao carregar perguntas ML (fallback):', error);
        showToast('Erro ao carregar perguntas: ' + error.message, 'error');
    }
}

// ============================================
// CARREGAR BASE DE MUNICÍPIOS (IBGE)
// ============================================

async function carregarMunicipios() {
    if (municipiosCache) return municipiosCache;
    try {
        const response = await fetch('municipios.json');
        if (!response.ok) throw new Error('Erro ao carregar municipios.json');
        const data = await response.json();
        if (Array.isArray(data)) {
            const mapa = new Map();
            for (const mun of data) {
                const nomeNorm = mun.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const sigla = codigoUfParaSigla[mun.codigo_uf];
                if (sigla) mapa.set(nomeNorm, sigla);
            }
            municipiosCache = mapa;
            console.log(`✅ ${mapa.size} municípios carregados`);
        } else {
            municipiosCache = new Map();
        }
        return municipiosCache;
    } catch (error) {
        console.error('Erro ao carregar municipios:', error);
        return new Map();
    }
}

// ============================================
// BUSCAR ESTADO (UF) A PARTIR DO NOME DA CIDADE
// ============================================
async function buscarEstadoPorCidade(cidade) {
    if (!cidade || cidade === 'Não informado') return 'UF não informada';
    const mapa = await carregarMunicipios();
    const cidadeNorm = cidade.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let uf = mapa.get(cidadeNorm);
    if (!uf) {
        for (let [nome, sigla] of mapa.entries()) {
            if (nome.includes(cidadeNorm) || cidadeNorm.includes(nome)) {
                uf = sigla;
                break;
            }
        }
    }
    return uf || 'UF não informada';
}

// Buscar título e imagem principal do anúncio
async function buscarDetalhesItem(itemId, token) {
    if (!itemId) return { titulo: 'Produto não encontrado', imagem: '' };
    try {
        const url = `https://api.mercadolibre.com/items/${itemId}`;
        const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${token}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const titulo = data.title || 'Sem título';
        const imagem = (data.pictures && data.pictures[0] && data.pictures[0].url) || '';
        return { titulo, imagem };
    } catch (error) {
        console.error(`Erro ao buscar item ${itemId}:`, error);
        return { titulo: 'Erro ao carregar', imagem: '' };
    }
}

// ============================================
// ENRIQUECER PERGUNTAS COM NOME E CIDADE/ESTADO
// ============================================
async function enriquecerPerguntasComDadosComprador() {
    for (let pergunta of perguntas) {
        // Se já temos os dados completos, apenas garante o estado
        if (pergunta.comprador_nome && pergunta.comprador_nome !== 'Anônimo' &&
            pergunta.comprador_cidade && pergunta.comprador_cidade !== 'Não informado') {
            if (!pergunta.comprador_estado) {
                pergunta.comprador_estado = await buscarEstadoPorCidade(pergunta.comprador_cidade);
            }
            continue;
        }
        
        const userId = pergunta.from?.id;
        let nome = pergunta.from?.nickname;
        let cidade = 'Não informado';
        
        if (userId) {
            try {
                const tokenData = await getValidToken();
                if (tokenData?.access_token) {
                    const userUrl = `https://api.mercadolibre.com/users/${userId}`;
                    const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(userUrl)}&token=${tokenData.access_token}`;
                    const userRes = await fetch(proxyUrl);
                    if (userRes.ok) {
                        const userData = await userRes.json();
                        nome = userData.nickname || userData.first_name || userData.email || `Usuário ${userId}`;
                        cidade = userData.address?.city || userData.address?.state || 'Não informado';
                    } else {
                        nome = pergunta.from?.nickname || `Usuário ${userId}`;
                    }
                } else {
                    nome = pergunta.from?.nickname || `Usuário ${userId}`;
                }
            } catch (e) {
                console.warn(`Erro ao buscar dados do comprador ${userId}:`, e);
                nome = pergunta.from?.nickname || `Usuário ${userId}`;
            }
        } else if (!nome) {
            nome = 'Anônimo';
        }
        
        pergunta.comprador_nome = nome;
        pergunta.comprador_cidade = cidade;
        pergunta.comprador_estado = await buscarEstadoPorCidade(cidade);
        
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

// ============================================
// RENDERIZAR TABELA (COM CIDADE/ESTADO)
// ============================================
window.exportarPerguntasExcel = function() {
    if (!Array.isArray(perguntas) || perguntas.length === 0) {
        showToast('Nenhuma pergunta para exportar', 'warning');
        return;
    }
    const dados = perguntas.map(p => ({
        'Comprador': p.comprador_nome || '',
        'Cidade/UF': [p.comprador_cidade, p.comprador_estado].filter(Boolean).join(' / '),
        'Pergunta': p.pergunta || '',
        'Resposta': p.resposta || '',
        'Anúncio': p.item_titulo || '',
        'MLB': p.item_id || '',
        'Status': p.status === 'respondida' ? 'Respondida' : 'Aguardando',
        'Data': p.data_pergunta || ''
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Perguntas');
    XLSX.writeFile(wb, `perguntas_ml_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(`✅ ${dados.length} registro(s) exportado(s)!`, 'success');
};

function renderizarPerguntas() {
    const tbody = document.getElementById('perguntasTableBody');
    if (!tbody) return;
    
    let perguntasFiltradas;

    if (currentPerguntaFilter === 'excluidas') {
        perguntasFiltradas = perguntas.filter(p => p.excluida);
    } else {
        perguntasFiltradas = perguntas.filter(p => !p.excluida);

        if (currentPerguntaFilter === 'nao_respondidas') {
            perguntasFiltradas = perguntasFiltradas.filter(p => p.status === 'pendente');
        } else if (currentPerguntaFilter === 'respondidas') {
            perguntasFiltradas = perguntasFiltradas.filter(p => p.status === 'respondida');
        }
    }
    
    // Agrupar perguntas por comprador + item
    const grupos = agruparPerguntas(perguntasFiltradas);
    
    if (grupos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <i class="fas fa-question-circle fa-3x mb-3" style="color: #6c757d; opacity: 0.5;"></i>
                    <h4 style="color: #6c757d;">Nenhuma pergunta encontrada</h4>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = grupos.map(grupo => {
        const p = grupo.ultima_pergunta; // última pergunta do grupo
        const dataPergunta = new Date(p.data_pergunta);
        const dataFormatada = dataPergunta.toLocaleDateString('pt-BR') + ' ' + 
                             dataPergunta.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        
        const statusBadge = p.status === 'respondida' 
            ? '<span class="badge badge-success"><i class="fas fa-check-circle"></i> Respondida</span>'
            : '<span class="badge badge-warning"><i class="fas fa-hourglass-half"></i> Aguardando</span>';
        
        const tempoResposta = tempoRespostaPergunta(p);
        const respostaPreview = p.resposta
            ? `<div style="font-size: 12px; color: #28a745; margin-top: 5px; border-left: 2px solid #28a745; padding-left: 8px;">
                   <i class="fas fa-reply"></i> ${escapeHtml(p.resposta.substring(0, 100))}${p.resposta.length > 100 ? '...' : ''}
                   ${tempoResposta ? `<br><span style="color:#6c757d;"><i class="fas fa-stopwatch"></i> Respondida em ${tempoResposta}</span>` : ''}
               </div>`
            : '';

        const compras = p.comprador_id ? (window._comprasPorCompradorId.get(p.comprador_id) || []) : [];
        const jaEhClienteBadge = compras.length > 0
            ? `<div style="margin-bottom: 4px;">
                   <span class="badge badge-success" style="font-size: 11px; padding: 4px 8px;">
                       <i class="fas fa-shopping-bag"></i> JÁ É CLIENTE · ${compras.length} compra${compras.length > 1 ? 's' : ''}
                   </span>
               </div>`
            : '';

        let localizacao = '';
        if (p.comprador_cidade && p.comprador_cidade !== 'Não informado') {
            localizacao = `${escapeHtml(p.comprador_cidade)}`;
            if (p.comprador_estado && p.comprador_estado !== 'UF não informada') {
                localizacao += ` / ${escapeHtml(p.comprador_estado)}`;
            }
        } else {
            localizacao = 'Local não informado';
        }
        
        // Link do produto
        let itemNumero = p.item_id;
        if (itemNumero && itemNumero.toUpperCase().startsWith('MLB')) {
            itemNumero = itemNumero.substring(3);
        }
        const linkProduto = itemNumero ? `https://produto.mercadolivre.com.br/MLB-${itemNumero}` : '#';
        
        return `
            <tr class="pergunta-item" data-id="${p.id}">
                <td>
                    ${jaEhClienteBadge}
                    <strong>${escapeHtml(p.comprador_nome || 'Anônimo')}</strong><br>
                    <small class="text-muted">
                        <i class="fas fa-map-marker-alt"></i> ${localizacao}
                    </small>
                    ${grupo.total > 1 ? `<br><small class="text-info"><i class="fas fa-comments"></i> ${grupo.total} perguntas</small>` : ''}
                </td>
                <td>${escapeHtml(p.pergunta)}${respostaPreview}</td>
                <td style="min-width: 200px;">
                    <a href="${linkProduto}" target="_blank" rel="noopener noreferrer" 
                       style="display: flex; align-items: center; gap: 8px; text-decoration: none; color: #333;">
                        ${p.item_imagem ? 
                            `<img src="${p.item_imagem}" style="width: 40px; height: 40px; object-fit: cover; border-radius: 4px;" alt="foto">` : 
                            `<i class="fas fa-image" style="font-size: 24px; color: #ccc;"></i>`
                        }
                        <span style="font-size: 13px; font-weight: 500;">${escapeHtml(p.item_titulo || 'Ver anúncio')}</span>
                    </a>
                 </td>
                <td>${dataFormatada}</td>
                <td>${statusBadge}</td>
                <td>
                    ${p.excluida ? `
                        <div style="font-size: 11px; color: #6c757d; margin-bottom: 6px;">
                            <i class="fas fa-trash"></i> Excluída por ${escapeHtml(p.excluida_por || '-')}<br>
                            em ${p.excluida_em ? new Date(p.excluida_em).toLocaleString('pt-BR') : '-'}
                        </div>
                        <button class="btn btn-sm btn-outline-success" onclick="restaurarPergunta('${p.id}')" title="Restaurar esta pergunta pra lista principal">
                            <i class="fas fa-undo"></i> Restaurar
                        </button>
                    ` : `
                        <button class="btn btn-sm btn-primary" onclick="abrirModalResponderPergunta('${p.id}')" ${p.status === 'respondida' ? 'disabled' : ''}>
                            <i class="fas fa-reply"></i> Responder
                        </button>
                        ${grupo.total > 1 ?
                            `<button class="btn btn-sm btn-info" onclick="abrirHistoricoPerguntas('${escapeHtml(p.comprador_nome)}', '${p.item_id}')" title="Ver todas as perguntas deste comprador neste anúncio">
                                <i class="fas fa-history"></i> Histórico (${grupo.total})
                            </button>` :
                            ''
                        }
                        ${p.resposta ? `<button class="btn btn-sm btn-info" onclick="verRespostaPergunta('${p.id}')"><i class="fas fa-eye"></i> Ver resposta</button>` : ''}
                    `}
                    <button class="btn btn-sm btn-secondary" onclick="abrirPerfilComprador('${escapeHtml(p.comprador_nome)}', ${p.comprador_id ? `'${p.comprador_id}'` : 'null'})" title="Perfil completo: compras e todas as perguntas deste comprador">
                        <i class="fas fa-id-card"></i> Perfil
                    </button>
                    ${!p.excluida ? `
                        <button class="btn btn-sm btn-danger" onclick="excluirPergunta('${p.id}')" title="Excluir esta pergunta da lista">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                 </td>
             </tr>
        `;
    }).join('');
}

// ============================================
// AGRUPAR PERGUNTAS (uma linha por comprador+item)
// ============================================
function agruparPerguntas(perguntasLista) {
    const grupos = new Map(); // chave: `${comprador_nome}|${item_id}`

    // Rede de segurança contra duplicata em memória (mesmo id em dois
    // objetos, ex: um vindo como texto do banco e outro como número da
    // API do ML antes da normalização acima).
    const vistos = new Set();
    const listaSemDuplicata = perguntasLista.filter(p => {
        const chaveId = String(p.id);
        if (vistos.has(chaveId)) return false;
        vistos.add(chaveId);
        return true;
    });

    for (const p of listaSemDuplicata) {
        const chave = `${p.comprador_nome}|${p.item_id}`;
        if (!grupos.has(chave)) {
            grupos.set(chave, {
                comprador_nome: p.comprador_nome,
                comprador_cidade: p.comprador_cidade,
                comprador_estado: p.comprador_estado,
                item_id: p.item_id,
                item_titulo: p.item_titulo,
                item_imagem: p.item_imagem,
                ultima_pergunta: p, // a mais recente (já que a lista vem ordenada)
                total: 1,
                todas: [p]
            });
        } else {
            const grupo = grupos.get(chave);
            grupo.total++;
            grupo.todas.push(p);
            // Atualizar última pergunta (a mais recente, que é a primeira do array)
            if (new Date(p.data_pergunta) > new Date(grupo.ultima_pergunta.data_pergunta)) {
                grupo.ultima_pergunta = p;
            }
        }
    }
    
    // Retorna array com um objeto por grupo, ordenado pela data da última pergunta
    return Array.from(grupos.values()).sort((a, b) => 
        new Date(b.ultima_pergunta.data_pergunta) - new Date(a.ultima_pergunta.data_pergunta)
    );
}

// ============================================
// ABRIR MODAL COM HISTÓRICO DE PERGUNTAS
// ============================================
window.abrirHistoricoPerguntas = function(compradorNome, itemId) {
    // Filtrar todas as perguntas desse comprador e item (sem as excluídas —
    // essas ficam só no Perfil completo do comprador)
    const perguntasDoGrupo = perguntas.filter(p =>
        p.comprador_nome === compradorNome && p.item_id === itemId && !p.excluida
    ).sort((a, b) => new Date(a.data_pergunta) - new Date(b.data_pergunta)); // ordem cronológica
    
    if (perguntasDoGrupo.length === 0) {
        showToast('Nenhuma pergunta encontrada para este comprador.', 'warning');
        return;
    }
    
    const content = document.getElementById('historicoPerguntasContent');
    const tituloItem = perguntasDoGrupo[0].item_titulo || 'Anúncio';
    
    // Montar HTML do histórico
    let html = `
        <div style="margin-bottom: 20px; padding: 10px; background: #f8f9fa; border-radius: 8px;">
            <strong><i class="fas fa-user"></i> Comprador:</strong> ${escapeHtml(compradorNome)}<br>
            <strong><i class="fas fa-box"></i> Produto:</strong> ${escapeHtml(tituloItem)}<br>
            <strong><i class="fas fa-comments"></i> Total de perguntas:</strong> ${perguntasDoGrupo.length}
        </div>
        <div class="timeline-historico">
    `;
    
    for (const p of perguntasDoGrupo) {
        const dataPergunta = new Date(p.data_pergunta).toLocaleString('pt-BR');
        const status = p.status === 'respondida' ? 'Respondida' : 'Não respondida';
        const tempoResposta = tempoRespostaPergunta(p);
        const respostaHtml = p.resposta ? `
            <div style="margin-top: 8px; padding: 8px; background: #e8f5e9; border-radius: 6px;">
                <i class="fas fa-reply" style="color: #28a745;"></i>
                <strong>Resposta:</strong> ${escapeHtml(p.resposta)}<br>
                <small>${new Date(p.data_resposta).toLocaleString('pt-BR')}${tempoResposta ? ` · tempo de resposta: ${tempoResposta}` : ''}</small>
            </div>
        ` : '';
        
        html += `
            <div class="historico-item" style="border-left: 3px solid ${p.status === 'respondida' ? '#28a745' : '#ffc107'}; padding: 12px; margin-bottom: 15px; background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                    <strong style="color: #495057;">📅 ${dataPergunta}</strong>
                    <span class="badge ${p.status === 'respondida' ? 'badge-success' : 'badge-warning'}">${status}</span>
                </div>
                <div style="margin-bottom: 8px;">
                    <strong>Pergunta:</strong> ${escapeHtml(p.pergunta)}
                </div>
                ${respostaHtml}
            </div>
        `;
    }
    
    html += `</div>`;
    content.innerHTML = html;
    
    document.getElementById('modalHistoricoPerguntas').classList.remove('hidden');
};

window.fecharModalHistorico = function() {
    document.getElementById('modalHistoricoPerguntas').classList.add('hidden');
};

// ============================================
// MODAL PARA RESPONDER
// ============================================
window.abrirModalResponderPergunta = function(questionId) {
    const pergunta = perguntas.find(p => p.id == questionId);
    if (!pergunta) {
        showToast('Pergunta não encontrada', 'error');
        return;
    }
    if (pergunta.status === 'respondida') {
        showToast('Esta pergunta já foi respondida', 'warning');
        return;
    }
    
    const modal = document.getElementById('modalResponderPergunta');
    if (!modal) return;
    
    document.getElementById('responderQuestionId').value = questionId;
    document.getElementById('responderPerguntaText').innerHTML = `<strong>Pergunta:</strong> ${escapeHtml(pergunta.pergunta)}`;
    document.getElementById('respostaTexto').value = '';
    modal.classList.remove('hidden');
};

window.fecharModalResponder = function() {
    const modal = document.getElementById('modalResponderPergunta');
    if (modal) modal.classList.add('hidden');
};

window.enviarRespostaPergunta = async function() {
    const questionId = document.getElementById('responderQuestionId').value;
    const resposta = document.getElementById('respostaTexto').value.trim();
    if (!resposta) {
        showToast('Digite uma resposta', 'warning');
        return;
    }
    
    const pergunta = perguntas.find(p => p.id == questionId);
    if (!pergunta) {
        showToast('Pergunta não encontrada', 'error');
        return;
    }
    
    const btn = document.querySelector('#modalResponderPergunta .btn-success');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Enviando...';
    btn.disabled = true;
    
    try {
        const tokenData = await getValidToken();
        if (!tokenData || !tokenData.access_token) throw new Error('Token não disponível');
        
        const answerUrl = `https://api.mercadolibre.com/answers`;
        const response = await fetch(`${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(answerUrl)}&token=${tokenData.access_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question_id: questionId,
                text: resposta
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao enviar resposta');
        }
        
        if (window.supabaseClient) {
            await window.supabaseClient
                .from('perguntas_ml')
                .update({
                    status: 'respondida',
                    resposta: resposta,
                    data_resposta: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', questionId);
        }
        
        pergunta.status = 'respondida';
        pergunta.resposta = resposta;
        pergunta.data_resposta = new Date().toISOString();
        
        showToast('✅ Resposta enviada com sucesso!', 'success');
        fecharModalResponder();
        renderizarPerguntas();
        
    } catch (error) {
        console.error('Erro ao responder:', error);
        showToast('Erro ao enviar resposta: ' + error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

// ============================================
// FILTROS E PAGINAÇÃO
// ============================================
window.filtrarPerguntas = function(filtro) {
    currentPerguntaFilter = filtro;
    renderizarPerguntas();
    
    document.querySelectorAll('#perguntasSystem .btn-group .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.querySelector(`#perguntasSystem .btn-group .btn[onclick*="${filtro}"]`);
    if (activeBtn) activeBtn.classList.add('active');
};

window.paginarPerguntas = function(direcao) {
    let newOffset = perguntasPagination.offset;
    if (direcao === 'anterior') {
        newOffset = Math.max(0, newOffset - perguntasPagination.limit);
    } else if (direcao === 'proxima') {
        newOffset = newOffset + perguntasPagination.limit;
        if (newOffset >= perguntasPagination.total) return;
    }
    perguntasPagination.offset = newOffset;
    renderizarPerguntas();
    atualizarPaginacao();
};

function atualizarPaginacao() {
    const inicio = perguntasPagination.offset + 1;
    const fim = Math.min(perguntasPagination.offset + perguntas.length, perguntasPagination.total);
    const info = document.getElementById('perguntasInfo');
    if (info) info.textContent = `Mostrando ${inicio}-${fim} de ${perguntasPagination.total}`;
    
    const btnAnterior = document.getElementById('btnPerguntasAnterior');
    const btnProxima = document.getElementById('btnPerguntasProxima');
    if (btnAnterior) btnAnterior.disabled = perguntasPagination.offset === 0;
    if (btnProxima) btnProxima.disabled = (perguntasPagination.offset + perguntasPagination.limit) >= perguntasPagination.total;
}

// ============================================
// UTILITÁRIOS
// ============================================
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.verRespostaPergunta = function(questionId) {
    const pergunta = perguntas.find(p => p.id == questionId);
    if (!pergunta || !pergunta.resposta) return;
    const tempo = tempoRespostaPergunta(pergunta);
    alert(`Resposta:\n\n${pergunta.resposta}\n\nEnviada em: ${new Date(pergunta.data_resposta).toLocaleString('pt-BR')}${tempo ? `\nTempo de resposta: ${tempo}` : ''}`);
};

// ============================================
// TEMPO DE RESPOSTA REAL
// ============================================
function formatarDuracaoPergunta(ms) {
    if (!Number.isFinite(ms) || ms < 0) return null;
    const minutos = Math.floor(ms / 60000);
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const minutosRestantes = minutos % 60;
    if (horas < 24) return `${horas}h ${minutosRestantes}min`;
    const dias = Math.floor(horas / 24);
    const horasRestantes = horas % 24;
    return `${dias}d ${horasRestantes}h`;
}

function tempoRespostaPergunta(p) {
    if (!p.resposta || !p.data_resposta || !p.data_pergunta) return null;
    const ms = new Date(p.data_resposta) - new Date(p.data_pergunta);
    return formatarDuracaoPergunta(ms);
}

// ============================================
// EXCLUIR PERGUNTA (soft delete — fica salva pro histórico)
// ============================================
window.excluirPergunta = async function(id) {
    const pergunta = perguntas.find(p => String(p.id) === String(id));
    if (!pergunta) {
        showToast('Pergunta não encontrada', 'error');
        return;
    }

    if (!confirm(`Excluir esta pergunta da lista?\n\n"${pergunta.pergunta}"\n\nEla some da lista principal, mas continua salva no perfil do comprador.`)) {
        return;
    }

    const nomeUsuario = (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.name || currentUser.username) : 'Sistema';
    const agora = new Date().toISOString();

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error } = await window.supabaseClient
            .from('perguntas_ml')
            .update({
                excluida: true,
                excluida_por: nomeUsuario,
                excluida_em: agora
            })
            .eq('id', id);

        if (error) throw error;

        pergunta.excluida = true;
        pergunta.excluida_por = nomeUsuario;
        pergunta.excluida_em = agora;

        perguntasPagination.total = perguntas.filter(p => !p.excluida).length;

        showToast('🗑️ Pergunta excluída (continua salva no perfil do comprador).', 'success');
        renderizarPerguntas();
        atualizarPaginacao();

    } catch (error) {
        console.error('Erro ao excluir pergunta:', error);
        showToast('Erro ao excluir: ' + error.message, 'error');
    }
};

window.restaurarPergunta = async function(id) {
    const pergunta = perguntas.find(p => String(p.id) === String(id));
    if (!pergunta) {
        showToast('Pergunta não encontrada', 'error');
        return;
    }

    try {
        if (!window.supabaseClient) throw new Error('Supabase não conectado');

        const { error } = await window.supabaseClient
            .from('perguntas_ml')
            .update({ excluida: false, excluida_por: null, excluida_em: null })
            .eq('id', id);

        if (error) throw error;

        pergunta.excluida = false;
        pergunta.excluida_por = null;
        pergunta.excluida_em = null;

        perguntasPagination.total = perguntas.filter(p => !p.excluida).length;

        showToast('✅ Pergunta restaurada pra lista principal.', 'success');
        renderizarPerguntas();
        atualizarPaginacao();

    } catch (error) {
        console.error('Erro ao restaurar pergunta:', error);
        showToast('Erro ao restaurar: ' + error.message, 'error');
    }
};

// ============================================
// VERIFICAR PENDENTES ANTIGAS
//
// Uma pergunta "pendente" no nosso banco pode, na verdade, já não
// estar mais pendente de verdade no Mercado Livre: ou alguém
// respondeu por lá (fora do nosso sistema) e a sincronização normal
// não pegou, ou o ML removeu a pergunta (denúncia, conta do
// comprador excluída, etc — nesses casos a API devolve 404). Essa
// checagem confere pergunta por pergunta contra o ML de verdade e
// corrige os dois casos.
// ============================================
window.verificarPerguntasPendentesAntigas = async function() {
    if (!window.supabaseClient) {
        showToast('Erro: Supabase não conectado', 'error');
        return;
    }

    const pendentes = perguntas.filter(p => p.status === 'pendente' && !p.excluida);

    if (pendentes.length === 0) {
        showToast('Nenhuma pergunta pendente pra verificar.', 'info');
        return;
    }

    const btn = document.querySelector('button[onclick="verificarPerguntasPendentesAntigas()"]');
    const htmlOriginal = btn ? btn.innerHTML : null;
    if (btn) {
        btn.disabled = true;
    }

    let verificadas = 0;
    let removidasDoML = 0;
    let respondidasForaDoSistema = 0;
    let inativasNoML = 0;
    const nomeUsuario = 'Sistema (verificação automática)';

    try {
        const tokenData = await getValidToken();
        if (!tokenData?.access_token) throw new Error('Token ML não disponível');

        for (const pergunta of pendentes) {
            if (btn) btn.innerHTML = `<span class="spinner"></span> Verificando ${verificadas + 1}/${pendentes.length}...`;

            try {
                const url = `https://api.mercadolibre.com/questions/${pergunta.id}`;
                const proxyUrl = `${WORKER_URL}/api/ml/proxy?url=${encodeURIComponent(url)}&token=${tokenData.access_token}`;
                const res = await fetch(proxyUrl);

                if (res.status === 404) {
                    // Sumiu do Mercado Livre — não existe mais como pendente de verdade.
                    const agora = new Date().toISOString();
                    const { error } = await window.supabaseClient
                        .from('perguntas_ml')
                        .update({ excluida: true, excluida_por: nomeUsuario, excluida_em: agora })
                        .eq('id', pergunta.id);

                    if (!error) {
                        pergunta.excluida = true;
                        pergunta.excluida_por = nomeUsuario;
                        pergunta.excluida_em = agora;
                        removidasDoML++;
                    }

                } else if (res.ok) {
                    const data = await res.json();

                    if (data.answer?.text) {
                        // Foi respondida no Mercado Livre (provavelmente direto por lá),
                        // mas nosso sync não tinha pego ainda.
                        const updateData = {
                            status: 'respondida',
                            resposta: data.answer.text,
                            data_resposta: data.answer.date_created,
                            updated_at: new Date().toISOString()
                        };

                        const { error } = await window.supabaseClient
                            .from('perguntas_ml')
                            .update(updateData)
                            .eq('id', pergunta.id);

                        if (!error) {
                            Object.assign(pergunta, updateData);
                            respondidasForaDoSistema++;
                        }

                    } else if (data.status && data.status !== 'UNANSWERED') {
                        // ML tirou a pergunta de circulação por conta própria
                        // (banida, desabilitada, etc) — não é mais uma
                        // pendência de verdade, mesmo sem resposta.
                        const agora = new Date().toISOString();
                        const { error } = await window.supabaseClient
                            .from('perguntas_ml')
                            .update({
                                excluida: true,
                                excluida_por: `Sistema (status no ML: ${data.status})`,
                                excluida_em: agora
                            })
                            .eq('id', pergunta.id);

                        if (!error) {
                            pergunta.excluida = true;
                            pergunta.excluida_por = `Sistema (status no ML: ${data.status})`;
                            pergunta.excluida_em = agora;
                            inativasNoML++;
                        }
                    }
                }

            } catch (erroItem) {
                console.warn(`Erro verificando pergunta ${pergunta.id}:`, erroItem);
            }

            verificadas++;
            await new Promise(resolve => setTimeout(resolve, 250));
        }

        perguntasPagination.total = perguntas.filter(p => !p.excluida).length;
        renderizarPerguntas();
        atualizarPaginacao();

        showToast(
            `🔍 ${verificadas} verificada(s): ${respondidasForaDoSistema} já tinham resposta no ML, ${removidasDoML} não existem mais lá, ${inativasNoML} banidas/inativas no ML (essas duas últimas foram movidas pra Excluídas).`,
            'success'
        );

    } catch (error) {
        console.error('Erro ao verificar pendentes antigas:', error);
        showToast('Erro ao verificar: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    }
};

// ============================================
// PERFIL DO COMPRADOR (compras + todas as perguntas + excluídas)
// ============================================
function extrairResumoCompraVendaJson(venda) {
    const v = venda?.venda_json || {};
    const itens = Array.isArray(v.order_items) ? v.order_items : [];
    const titulo = itens.map(it => it.item?.title).filter(Boolean).join(', ') || v.mlb || 'Produto';
    const dataVenda = v.data_venda || (v.date_created ? String(v.date_created).slice(0, 10) : null);
    return {
        titulo,
        valor: Number(v.total_amount || v.paid_amount || 0),
        data: dataVenda,
        status: v.ml_status || v.status || '',
        cancelada: !!v.venda_cancelada,
        id: venda.id_venda_ml
    };
}

function criarModalPerfilComprador() {
    const modal = document.createElement('div');
    modal.id = 'modalPerfilComprador';
    modal.className = 'modal hidden';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 800px; max-height: 85vh; padding: 0;">
            <div style="background: linear-gradient(135deg, #00ADEE, #80D6F7); color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0;"><i class="fas fa-id-card"></i> Perfil do Comprador</h3>
                <button onclick="fecharModalPerfilComprador()" style="background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            <div id="perfilCompradorConteudo" style="padding: 20px; max-height: 65vh; overflow-y: auto;"></div>
            <div style="padding: 15px; text-align: right; border-top: 1px solid #e9ecef;">
                <button class="btn btn-secondary" onclick="fecharModalPerfilComprador()">Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    return modal;
}

window.fecharModalPerfilComprador = function() {
    document.getElementById('modalPerfilComprador')?.classList.add('hidden');
};

window.abrirPerfilComprador = async function(compradorNome, compradorId) {
    let modal = document.getElementById('modalPerfilComprador');
    if (!modal) modal = criarModalPerfilComprador();

    modal.classList.remove('hidden');
    const conteudo = document.getElementById('perfilCompradorConteudo');
    conteudo.innerHTML = `<div class="text-center py-5"><span class="spinner"></span> Carregando perfil...</div>`;

    const pertenceAoComprador = p =>
        compradorId ? String(p.comprador_id) === String(compradorId) : p.comprador_nome === compradorNome;

    const todasPerguntas = perguntas
        .filter(pertenceAoComprador)
        .sort((a, b) => new Date(b.data_pergunta) - new Date(a.data_pergunta));

    const perguntasAtivas = todasPerguntas.filter(p => !p.excluida);
    const perguntasExcluidas = todasPerguntas.filter(p => p.excluida);

    let compras = compradorId ? (window._comprasPorCompradorId.get(compradorId) || []) : [];

    if (compradorId && window.supabaseClient) {
        try {
            const { data, error } = await window.supabaseClient
                .from('vendas_nfe_cache')
                .select('id_venda_ml, venda_json')
                .eq('venda_json->buyer->>id', compradorId);
            if (!error) {
                compras = data || [];
                window._comprasPorCompradorId.set(compradorId, compras);
            }
        } catch (error) {
            console.warn('Erro ao buscar compras do comprador:', error);
        }
    }

    renderizarPerfilComprador(compradorNome, compras, perguntasAtivas, perguntasExcluidas);
};

function renderizarPerfilComprador(compradorNome, compras, perguntasAtivas, perguntasExcluidas) {
    const conteudo = document.getElementById('perfilCompradorConteudo');
    if (!conteudo) return;

    const comprasResumo = compras.map(extrairResumoCompraVendaJson);
    const comprasValidas = comprasResumo.filter(c => !c.cancelada);
    const valorTotal = comprasValidas.reduce((soma, c) => soma + (c.valor || 0), 0);

    const tempos = perguntasAtivas.map(tempoRespostaPergunta).filter(Boolean);

    const clienteBadge = compras.length > 0
        ? `<span class="badge badge-success"><i class="fas fa-check-circle"></i> Já é cliente</span>`
        : `<span class="badge badge-secondary"><i class="fas fa-user-clock"></i> Ainda não comprou</span>`;

    let html = `
        <div style="margin-bottom: 20px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
            <div style="display:flex; justify-content: space-between; align-items:center; flex-wrap: wrap; gap: 8px;">
                <div><strong><i class="fas fa-user"></i> ${escapeHtml(compradorNome)}</strong></div>
                ${clienteBadge}
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin-top: 12px; font-size: 13px;">
                <div><i class="fas fa-shopping-bag"></i> ${compras.length} compra${compras.length === 1 ? '' : 's'}</div>
                <div><i class="fas fa-dollar-sign"></i> R$ ${valorTotal.toFixed(2)} em compras válidas</div>
                <div><i class="fas fa-comments"></i> ${perguntasAtivas.length} pergunta${perguntasAtivas.length === 1 ? '' : 's'}</div>
                <div><i class="fas fa-stopwatch"></i> ${tempos.length ? tempos[0] + ' (última)' : 'sem resposta ainda'}</div>
            </div>
        </div>

        <h4 style="font-size: 15px;"><i class="fas fa-shopping-bag"></i> Compras</h4>
    `;

    if (comprasResumo.length === 0) {
        html += `<p class="text-muted" style="font-size: 13px;">Nenhuma compra encontrada pra este comprador.</p>`;
    } else {
        html += `<div style="margin-bottom: 20px;">`;
        comprasResumo.forEach(c => {
            html += `
                <div style="border-left: 3px solid ${c.cancelada ? '#dc3545' : '#28a745'}; padding: 10px 12px; margin-bottom: 8px; background: white; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 13px;">
                    <div style="display:flex; justify-content: space-between;">
                        <strong>${escapeHtml(c.titulo)}</strong>
                        <span>R$ ${c.valor.toFixed(2)}</span>
                    </div>
                    <div class="text-muted">
                        ${c.data ? new Date(c.data).toLocaleDateString('pt-BR') : '-'} · Venda ${escapeHtml(c.id)}
                        ${c.cancelada ? ' · <span style="color:#dc3545;">Cancelada</span>' : ''}
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    html += `<h4 style="font-size: 15px;"><i class="fas fa-comments"></i> Todas as perguntas</h4>`;

    if (perguntasAtivas.length === 0) {
        html += `<p class="text-muted" style="font-size: 13px;">Nenhuma pergunta ativa.</p>`;
    } else {
        html += `<div style="margin-bottom: 12px;">`;
        perguntasAtivas.forEach(p => {
            const tempo = tempoRespostaPergunta(p);
            html += `
                <div style="border-left: 3px solid ${p.status === 'respondida' ? '#28a745' : '#ffc107'}; padding: 10px 12px; margin-bottom: 8px; background: white; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 13px;">
                    <div style="display:flex; justify-content: space-between;">
                        <span class="text-muted">${new Date(p.data_pergunta).toLocaleString('pt-BR')}</span>
                        <span class="badge ${p.status === 'respondida' ? 'badge-success' : 'badge-warning'}">${p.status === 'respondida' ? 'Respondida' : 'Não respondida'}</span>
                    </div>
                    <div style="margin: 6px 0;"><strong>${escapeHtml(p.pergunta)}</strong></div>
                    <div class="text-muted" style="font-size: 12px;">${escapeHtml(p.item_titulo || p.item_id || '')}</div>
                    ${p.resposta ? `
                        <div style="margin-top: 6px; padding: 6px 8px; background: #e8f5e9; border-radius: 4px;">
                            <i class="fas fa-reply" style="color:#28a745;"></i> ${escapeHtml(p.resposta)}
                            ${tempo ? `<br><span style="color:#6c757d;">Respondida em ${tempo}</span>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        });
        html += `</div>`;
    }

    if (perguntasExcluidas.length > 0) {
        html += `
            <details style="margin-top: 10px;">
                <summary style="cursor: pointer; font-weight: 600; color: #6c757d; font-size: 13px;">
                    <i class="fas fa-trash"></i> Perguntas excluídas (${perguntasExcluidas.length})
                </summary>
                <div style="margin-top: 10px;">
        `;
        perguntasExcluidas.forEach(p => {
            html += `
                <div style="border-left: 3px solid #adb5bd; padding: 8px 12px; margin-bottom: 6px; background: #f8f9fa; border-radius: 6px; font-size: 12px; color: #6c757d;">
                    <div>${escapeHtml(p.pergunta)}</div>
                    <div>${new Date(p.data_pergunta).toLocaleString('pt-BR')} · excluída por ${escapeHtml(p.excluida_por || '-')} em ${p.excluida_em ? new Date(p.excluida_em).toLocaleString('pt-BR') : '-'}</div>
                </div>
            `;
        });
        html += `</div></details>`;
    }

    conteudo.innerHTML = html;
}

console.log('perguntas_manager.js - pronto');

window.buscarEstadoPorCidade = buscarEstadoPorCidade;