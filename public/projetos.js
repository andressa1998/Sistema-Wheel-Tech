// ================================================================
// PROJETOS / TAREFAS — WHEEL TECH
// ================================================================
//
// Administradores criam projetos e designam um destinatário. Só o
// destinatário define o prazo (máx. 2 meses a partir de hoje),
// preenche o checklist de passo a passo e os custos (previsto x
// final), e decide se o projeto é público (todos veem, só ele
// edita) ou particular (só administradores veem). Só "ronald" e
// "andressamiotto" podem excluir um projeto.
//
// Quando ronald ou andressamiotto entram no sistema, um aviso
// piscando em vermelho aparece no menu principal avisando que há
// projetos em andamento pra verificar — com um "x" pra dispensar.
// ================================================================

(() => {
    'use strict';

    const CFG_PROJ = {
        tabela: 'projetos_tarefas',
        tabelaCategorias: 'projetos_categorias'
    };

    const STATUS_PROJ = {
        pendente_prazo: { texto: 'Aguardando prazo', icone: '⏳', classe: 'proj-status-pendente' },
        em_andamento: { texto: 'Em andamento', icone: '🔵', classe: 'proj-status-andamento' },
        concluido: { texto: 'Concluído', icone: '✅', classe: 'proj-status-concluido' }
    };

    let projetosCache = [];
    let categoriasCache = [];
    let filtroStatusProj = 'ativos';
    let filtroCategoriaProj = '';
    let filtroBuscaProj = '';

    // ============================================================
    // USUÁRIO / PERMISSÃO
    // ============================================================

    function usuarioAtualProj() {
        return window.currentUser || null;
    }

    function usernameProj(usuario = usuarioAtualProj()) {
        if (!usuario) return '';
        return String(usuario.username || usuario.name || '').trim().toLowerCase();
    }

    function ehAdminProj() {
        const u = usuarioAtualProj();
        return !!u && u.role === 'Administrador';
    }

    // Usuários com permissão de exclusão de projetos e que recebem o
    // aviso piscando no menu principal.
    const USUARIOS_SUPERVISAO_PROJ = ['ronald', 'andressamiotto'];

    function ehRonaldProj() {
        return USUARIOS_SUPERVISAO_PROJ.includes(usernameProj());
    }

    function ehDestinatarioProj(projeto) {
        return !!projeto && projeto.destinatario === usernameProj();
    }

    function podeVerProjeto(projeto) {
        if (!projeto) return false;
        if (projeto.visibilidade !== 'particular') return true;
        return ehAdminProj() || ehDestinatarioProj(projeto);
    }

    function podeEditarProjeto(projeto) {
        return ehDestinatarioProj(projeto);
    }

    function nomeExibicaoUsuarioProj(username) {
        const alvo = String(username || '').trim().toLowerCase();
        const achado = obterColaboradoresProj().find(u => u.username === alvo);
        return achado ? achado.name : (username || '—');
    }

    function obterColaboradoresProj() {
        const mapear = u => ({
            username: String(u.username || '').trim().toLowerCase(),
            name: u.name || u.username,
            avatar: u.avatar || (u.name || u.username || 'U').charAt(0).toUpperCase(),
            avatarFoto: u.avatarFoto || u.avatar_foto || null
        });

        if (Array.isArray(window.SYSTEM_USERS) && window.SYSTEM_USERS.length) {
            return window.SYSTEM_USERS.map(mapear).filter(u => u.username)
                .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
        }
        try {
            if (typeof SYSTEM_USERS !== 'undefined' && Array.isArray(SYSTEM_USERS)) {
                return SYSTEM_USERS.map(mapear).filter(u => u.username)
                    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
            }
        } catch (e) {}
        return [];
    }

    function renderizarAvatarUsuarioProj(username) {
        const colaborador = obterColaboradoresProj().find(u => u.username === username);
        const nome = colaborador ? colaborador.name : nomeExibicaoUsuarioProj(username);
        const letra = (colaborador?.avatar || nome || 'U').charAt(0).toUpperCase();

        if (colaborador?.avatarFoto) {
            return `<div class="proj-avatar"><img src="${colaborador.avatarFoto}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;"></div>`;
        }
        return `<div class="proj-avatar">${escProj(letra)}</div>`;
    }

    // ============================================================
    // HELPERS
    // ============================================================

    function escProj(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function hojeIsoProj() {
        return new Date().toISOString().slice(0, 10);
    }

    function prazoMaximoProj() {
        const d = new Date();
        d.setMonth(d.getMonth() + 2);
        return d.toISOString().slice(0, 10);
    }

    function fmtDataProj(iso) {
        if (!iso) return '—';
        const [ano, mes, dia] = String(iso).split('T')[0].split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function fmtMoedaProj(valor) {
        if (valor == null || valor === '') return '—';
        return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
    }

    function cfgStatusProj(status) {
        return STATUS_PROJ[status] || { texto: status || 'Desconhecido', icone: '❔', classe: 'proj-status-pendente' };
    }

    // ============================================================
    // CATEGORIAS (GERENCIADAS NO FRONT-END)
    // ============================================================

    async function carregarCategoriasProj() {
        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_PROJ.tabelaCategorias)
                .select('*')
                .order('nome', { ascending: true });
            if (error) throw error;
            categoriasCache = data || [];
        } catch (error) {
            console.warn('⚠️ [Projetos] Erro ao carregar categorias:', error);
            categoriasCache = [];
        }
    }

    function popularSelectCategoriasProj(selectEl, valorAtual = '') {
        if (!selectEl) return;
        selectEl.innerHTML =
            '<option value="">Selecione uma categoria...</option>' +
            categoriasCache.map(c => `<option value="${escProj(c.nome)}" ${c.nome === valorAtual ? 'selected' : ''}>${escProj(c.nome)}</option>`).join('');
    }

    window.abrirModalGerenciarCategoriasProj = function () {
        if (!ehAdminProj()) {
            showToast('🔒 Apenas administradores podem gerenciar categorias.', 'warning');
            return;
        }

        let modal = document.getElementById('modalCategoriasProj');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modalCategoriasProj';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:440px;">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <h3 style="margin:0;"><i class="fas fa-tags"></i> Categorias de Projetos</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalCategoriasProj').remove()">Fechar</button>
                </div>
                <div class="d-flex gap-2 mb-3">
                    <input type="text" id="projNovaCategoriaInput" class="form-control" placeholder="Nome da nova categoria">
                    <button class="btn btn-success" onclick="window.adicionarCategoriaProj()"><i class="fas fa-plus"></i></button>
                </div>
                <div id="projListaCategorias"></div>
            </div>
        `;
        document.body.appendChild(modal);
        renderizarListaCategoriasProj();
    };

    function renderizarListaCategoriasProj() {
        const container = document.getElementById('projListaCategorias');
        if (!container) return;
        if (!categoriasCache.length) {
            container.innerHTML = '<p class="text-muted text-center py-3">Nenhuma categoria cadastrada ainda.</p>';
            return;
        }
        container.innerHTML = categoriasCache.map(c => `
            <div class="d-flex justify-content-between align-items-center" style="padding:8px 10px; border-bottom:1px solid #eef2f7;">
                <span>${escProj(c.nome)}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="window.excluirCategoriaProj(${c.id})"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
    }

    window.adicionarCategoriaProj = async function () {
        const input = document.getElementById('projNovaCategoriaInput');
        const nome = input.value.trim();
        if (!nome) {
            showToast('Digite o nome da categoria.', 'warning');
            return;
        }
        try {
            const { error } = await window.supabaseClient
                .from(CFG_PROJ.tabelaCategorias)
                .insert([{ nome, criado_por: usernameProj() }]);
            if (error) throw error;
            input.value = '';
            await carregarCategoriasProj();
            renderizarListaCategoriasProj();
            showToast('✅ Categoria adicionada!', 'success');
        } catch (error) {
            showToast('Erro ao adicionar categoria: ' + error.message, 'error');
        }
    };

    window.excluirCategoriaProj = async function (id) {
        if (!confirm('Excluir esta categoria?')) return;
        try {
            const { error } = await window.supabaseClient
                .from(CFG_PROJ.tabelaCategorias)
                .delete()
                .eq('id', id);
            if (error) throw error;
            await carregarCategoriasProj();
            renderizarListaCategoriasProj();
        } catch (error) {
            showToast('Erro ao excluir categoria: ' + error.message, 'error');
        }
    };

    // ============================================================
    // CARREGAR PROJETOS
    // ============================================================

    async function carregarProjetosProj() {
        const lista = document.getElementById('projLista');
        if (lista) {
            lista.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner"></div> Carregando...</div>`;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_PROJ.tabela)
                .select('*')
                .order('criado_em', { ascending: false });

            if (error) throw error;

            projetosCache = (data || []).filter(podeVerProjeto);
            renderizarListaProjetosProj();
            atualizarResumoProj();

        } catch (error) {
            console.error('❌ [Projetos] Erro ao carregar:', error);
            if (lista) lista.innerHTML = `<div class="text-center py-5 text-danger">Erro ao carregar projetos: ${escProj(error.message)}</div>`;
        }
    }

    function atualizarResumoProj() {
        const pendentes = projetosCache.filter(p => p.status === 'pendente_prazo').length;
        const andamento = projetosCache.filter(p => p.status === 'em_andamento').length;
        const concluidos = projetosCache.filter(p => p.status === 'concluido').length;

        const el = document.getElementById('projResumo');
        if (el) {
            el.innerHTML = `
                <span class="badge" style="background:#ffc107;color:#212529;">${pendentes} aguardando prazo</span>
                <span class="badge" style="background:#0875ee;color:#fff;">${andamento} em andamento</span>
                <span class="badge badge-success">${concluidos} concluído(s)</span>
            `;
        }
    }

    // ============================================================
    // FILTROS + LISTA
    // ============================================================

    function projetosFiltradosProj() {
        let lista = [...projetosCache];

        if (filtroStatusProj === 'ativos') {
            lista = lista.filter(p => p.status !== 'concluido');
        } else if (filtroStatusProj !== 'todos') {
            lista = lista.filter(p => p.status === filtroStatusProj);
        }

        if (filtroCategoriaProj) {
            lista = lista.filter(p => p.categoria === filtroCategoriaProj);
        }

        if (filtroBuscaProj) {
            const termo = filtroBuscaProj.toLowerCase();
            lista = lista.filter(p =>
                (p.titulo || '').toLowerCase().includes(termo) ||
                (p.descricao || '').toLowerCase().includes(termo) ||
                nomeExibicaoUsuarioProj(p.destinatario).toLowerCase().includes(termo)
            );
        }

        return lista;
    }

    function renderizarListaProjetosProj() {
        const container = document.getElementById('projLista');
        if (!container) return;

        const lista = projetosFiltradosProj();

        if (!lista.length) {
            container.innerHTML = `<div class="text-center py-5 text-muted"><i class="fas fa-folder-open fa-2x mb-2" style="opacity:.4;"></i><br>Nenhum projeto encontrado.</div>`;
            return;
        }

        container.innerHTML = `<div class="proj-grid">${lista.map(renderizarCardProjetoProj).join('')}</div>`;
    }

    function renderizarCardProjetoProj(p) {
        const st = cfgStatusProj(p.status);
        const hoje = hojeIsoProj();
        const atrasado = p.status !== 'concluido' && p.prazo && p.prazo < hoje;
        const checklist = Array.isArray(p.checklist) ? p.checklist : [];
        const concluidosChecklist = checklist.filter(i => i.concluido).length;

        return `
            <div class="proj-card ${atrasado ? 'proj-card-atrasado' : ''}" onclick="window.abrirDetalhesProjeto(${p.id})">
                <div class="proj-card-topo">
                    <span class="proj-badge-status ${st.classe}">${st.icone} ${escProj(st.texto)}</span>
                    ${p.visibilidade === 'particular' ? '<span class="proj-badge-particular" title="Particular — só administradores veem"><i class="fas fa-lock"></i></span>' : ''}
                </div>
                <h4 class="proj-card-titulo">${escProj(p.titulo)}</h4>
                ${p.categoria ? `<span class="proj-badge-categoria">${escProj(p.categoria)}</span>` : ''}
                <div class="proj-card-destinatario">
                    ${renderizarAvatarUsuarioProj(p.destinatario)}
                    <span>${escProj(nomeExibicaoUsuarioProj(p.destinatario))}</span>
                </div>
                <div class="proj-card-rodape">
                    <span><i class="fas fa-calendar"></i> ${p.prazo ? fmtDataProj(p.prazo) : 'Prazo não definido'} ${atrasado ? '<strong style="color:#dc3545;">(atrasado)</strong>' : ''}</span>
                    ${checklist.length ? `<span><i class="fas fa-list-check"></i> ${concluidosChecklist}/${checklist.length}</span>` : ''}
                </div>
            </div>
        `;
    }

    window.filtrarProjetos = function () {
        filtroStatusProj = document.getElementById('projFiltroStatus')?.value || 'ativos';
        filtroCategoriaProj = document.getElementById('projFiltroCategoria')?.value || '';
        filtroBuscaProj = String(document.getElementById('projBusca')?.value || '').trim().toLowerCase();
        renderizarListaProjetosProj();
    };

    // ============================================================
    // MODAL: NOVO PROJETO (ADMIN)
    // ============================================================

    function criarModalNovoProjeto() {
        if (document.getElementById('modalNovoProjeto')) return;

        const modal = document.createElement('div');
        modal.id = 'modalNovoProjeto';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:560px;">
                <h3 style="margin-top:0;"><i class="fas fa-diagram-project"></i> Novo Projeto</h3>

                <div class="form-group">
                    <label>Título *</label>
                    <input type="text" id="projFormTitulo" class="form-control" placeholder="Ex.: Reformar embalagens de envio">
                </div>

                <div class="form-group">
                    <label>Descrição</label>
                    <textarea id="projFormDescricao" class="form-control" rows="3" placeholder="Detalhes do projeto"></textarea>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Categoria <a href="#" onclick="window.abrirModalGerenciarCategoriasProj();return false;" style="font-size:11px;margin-left:6px;">gerenciar</a></label>
                            <select id="projFormCategoria" class="form-control"></select>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Visibilidade</label>
                            <select id="projFormVisibilidade" class="form-control">
                                <option value="publico">Público (todos veem)</option>
                                <option value="particular">Particular (só administradores veem)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>Destinatário (quem vai executar) *</label>
                    <select id="projFormDestinatario" class="form-control"></select>
                    <small class="text-muted">O prazo, o checklist e os custos são preenchidos pelo destinatário depois.</small>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="window.fecharModalNovoProjeto()">Cancelar</button>
                    <button class="btn btn-primary" id="projBtnSalvar" onclick="window.salvarNovoProjeto()">
                        <i class="fas fa-save"></i> Criar Projeto
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    window.abrirModalNovoProjeto = function () {
        if (!ehAdminProj()) {
            showToast('🔒 Apenas administradores podem criar projetos.', 'warning');
            return;
        }
        criarModalNovoProjeto();
        document.getElementById('projFormTitulo').value = '';
        document.getElementById('projFormDescricao').value = '';
        document.getElementById('projFormVisibilidade').value = 'publico';
        popularSelectCategoriasProj(document.getElementById('projFormCategoria'));

        const selectDestinatario = document.getElementById('projFormDestinatario');
        selectDestinatario.innerHTML = obterColaboradoresProj()
            .map(u => `<option value="${u.username}">${escProj(u.name)}</option>`).join('');

        document.getElementById('modalNovoProjeto').classList.remove('hidden');
    };

    window.fecharModalNovoProjeto = function () {
        document.getElementById('modalNovoProjeto')?.classList.add('hidden');
    };

    window.salvarNovoProjeto = async function () {
        const titulo = document.getElementById('projFormTitulo').value.trim();
        const descricao = document.getElementById('projFormDescricao').value.trim();
        const categoria = document.getElementById('projFormCategoria').value;
        const visibilidade = document.getElementById('projFormVisibilidade').value;
        const destinatario = document.getElementById('projFormDestinatario').value;

        if (!titulo) {
            showToast('Informe o título do projeto.', 'warning');
            return;
        }
        if (!destinatario) {
            showToast('Selecione o destinatário.', 'warning');
            return;
        }

        const btn = document.getElementById('projBtnSalvar');
        const htmlOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const { error } = await window.supabaseClient
                .from(CFG_PROJ.tabela)
                .insert([{
                    titulo,
                    descricao: descricao || null,
                    categoria: categoria || null,
                    visibilidade,
                    destinatario,
                    designado_por: usernameProj(),
                    status: 'pendente_prazo',
                    checklist: [],
                    criado_por: usernameProj(),
                    criado_em: new Date().toISOString(),
                    atualizado_em: new Date().toISOString()
                }]);

            if (error) throw error;

            showToast('✅ Projeto criado! Aguardando o destinatário definir o prazo.', 'success');
            window.fecharModalNovoProjeto();
            await carregarProjetosProj();

        } catch (error) {
            console.error('❌ [Projetos] Erro ao salvar:', error);
            showToast('Erro ao salvar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    };

    // ============================================================
    // DETALHES DO PROJETO
    // ============================================================

    window.abrirDetalhesProjeto = async function (id) {
        const projeto = projetosCache.find(p => p.id === id);
        if (!projeto) return;

        let modal = document.getElementById('modalDetalhesProjeto');
        if (modal) modal.remove();

        modal = document.createElement('div');
        modal.id = 'modalDetalhesProjeto';
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content" style="max-width:700px; max-height:88vh; overflow-y:auto;" id="projDetalhesConteudo"></div>`;
        document.body.appendChild(modal);

        renderizarDetalhesProjeto(projeto);
    };

    function renderizarDetalhesProjeto(p) {
        const container = document.getElementById('projDetalhesConteudo');
        if (!container) return;

        const st = cfgStatusProj(p.status);
        const podeEditar = podeEditarProjeto(p);
        const podeExcluir = ehRonaldProj();
        const checklist = Array.isArray(p.checklist) ? p.checklist : [];
        const hoje = hojeIsoProj();
        const atrasado = p.status !== 'concluido' && p.prazo && p.prazo < hoje;

        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-2">
                <h3 style="margin:0;"><i class="fas fa-diagram-project"></i> ${escProj(p.titulo)}</h3>
                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalDetalhesProjeto').remove()">Fechar</button>
            </div>

            <div class="d-flex flex-wrap gap-2 mb-3">
                <span class="proj-badge-status ${st.classe}">${st.icone} ${escProj(st.texto)}</span>
                ${p.categoria ? `<span class="proj-badge-categoria">${escProj(p.categoria)}</span>` : ''}
                <span class="proj-badge-categoria">${p.visibilidade === 'particular' ? '🔒 Particular' : '🌐 Público'}</span>
                ${atrasado ? '<span class="proj-badge-status" style="background:#f8d7da;color:#721c24;">⚠️ Atrasado</span>' : ''}
            </div>

            ${p.descricao ? `<p style="color:#495057;">${escProj(p.descricao)}</p>` : ''}

            <div class="d-flex flex-wrap gap-3 mb-3" style="font-size:13px;">
                <div><strong>Destinatário:</strong> ${escProj(nomeExibicaoUsuarioProj(p.destinatario))}</div>
                <div><strong>Designado por:</strong> ${escProj(nomeExibicaoUsuarioProj(p.designado_por))}</div>
                <div><strong>Criado em:</strong> ${new Date(p.criado_em).toLocaleDateString('pt-BR')}</div>
            </div>

            <hr>

            <div class="form-group">
                <label><i class="fas fa-calendar"></i> Prazo (máx. 2 meses a partir de hoje)</label>
                <div class="d-flex gap-2 align-items-center">
                    <input type="date" id="projDetPrazo" class="form-control" style="max-width:200px;"
                        value="${p.prazo || ''}" min="${hojeIsoProj()}" max="${prazoMaximoProj()}"
                        ${podeEditar ? '' : 'disabled'}>
                    ${podeEditar ? `<button class="btn btn-sm btn-primary" onclick="window.salvarPrazoProjeto(${p.id})">Salvar prazo</button>` : ''}
                </div>
                ${!podeEditar && !p.prazo ? '<small class="text-muted">Aguardando o destinatário definir o prazo.</small>' : ''}
            </div>

            <div class="form-group">
                <label><i class="fas fa-list-check"></i> Checklist</label>
                <div id="projChecklistLista">${renderizarChecklistProj(checklist, p.id, podeEditar)}</div>
                ${podeEditar ? `
                    <div class="d-flex gap-2 mt-2">
                        <input type="text" id="projNovoItemChecklist" class="form-control" placeholder="Novo passo do projeto...">
                        <button class="btn btn-sm btn-success" onclick="window.adicionarItemChecklistProjeto(${p.id})"><i class="fas fa-plus"></i></button>
                    </div>
                ` : ''}
            </div>

            <div class="row">
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Custo previsto</label>
                        <input type="number" step="0.01" id="projDetCustoPrevisto" class="form-control" value="${p.custo_previsto ?? ''}" ${podeEditar ? '' : 'disabled'}>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="form-group">
                        <label>Custo final</label>
                        <input type="number" step="0.01" id="projDetCustoFinal" class="form-control" value="${p.custo_final ?? ''}" ${podeEditar ? '' : 'disabled'}>
                    </div>
                </div>
            </div>
            ${podeEditar ? `<button class="btn btn-sm btn-outline-primary" onclick="window.salvarCustosProjeto(${p.id})"><i class="fas fa-save"></i> Salvar custos</button>` : ''}

            ${podeEditar ? `
                <div class="form-group mt-3">
                    <label>Visibilidade</label>
                    <select id="projDetVisibilidade" class="form-control" style="max-width:280px;">
                        <option value="publico" ${p.visibilidade === 'publico' ? 'selected' : ''}>Público (todos veem)</option>
                        <option value="particular" ${p.visibilidade === 'particular' ? 'selected' : ''}>Particular (só administradores veem)</option>
                    </select>
                    <button class="btn btn-sm btn-outline-primary mt-1" onclick="window.salvarVisibilidadeProjeto(${p.id})"><i class="fas fa-save"></i> Salvar visibilidade</button>
                </div>
            ` : ''}

            <div class="d-flex justify-content-between align-items-center mt-4" style="border-top:1px solid #eef2f7; padding-top:14px;">
                <div>
                    ${podeExcluir ? `<button class="btn btn-outline-danger btn-sm" onclick="window.excluirProjeto(${p.id})"><i class="fas fa-trash"></i> Excluir projeto</button>` : ''}
                </div>
                <div>
                    ${podeEditar && p.status !== 'concluido' ? `<button class="btn btn-success" onclick="window.concluirProjetoAcao(${p.id})"><i class="fas fa-check-circle"></i> Concluir Projeto</button>` : ''}
                    ${podeEditar && p.status === 'concluido' ? `<button class="btn btn-outline-secondary btn-sm" onclick="window.reabrirProjetoAcao(${p.id})"><i class="fas fa-undo"></i> Reabrir</button>` : ''}
                </div>
            </div>
        `;
    }

    function renderizarChecklistProj(checklist, projetoId, podeEditar) {
        if (!checklist.length) {
            return '<p class="text-muted" style="font-size:13px;">Nenhum passo cadastrado ainda.</p>';
        }
        return checklist.map(item => `
            <div class="proj-checklist-item">
                <input type="checkbox" ${item.concluido ? 'checked' : ''} ${podeEditar ? '' : 'disabled'}
                    onchange="window.alternarItemChecklistProjeto(${projetoId}, '${item.id}', this.checked)">
                <span class="${item.concluido ? 'proj-checklist-riscado' : ''}">${escProj(item.texto)}</span>
                ${podeEditar ? `<button class="proj-checklist-remover" onclick="window.removerItemChecklistProjeto(${projetoId}, '${item.id}')" title="Remover"><i class="fas fa-times"></i></button>` : ''}
            </div>
        `).join('');
    }

    async function atualizarProjetoCampoProj(id, campos) {
        const { error } = await window.supabaseClient
            .from(CFG_PROJ.tabela)
            .update({ ...campos, atualizado_em: new Date().toISOString() })
            .eq('id', id);
        if (error) throw error;

        const idx = projetosCache.findIndex(p => p.id === id);
        if (idx !== -1) Object.assign(projetosCache[idx], campos);
        return projetosCache.find(p => p.id === id);
    }

    window.salvarPrazoProjeto = async function (id) {
        const input = document.getElementById('projDetPrazo');
        const prazo = input.value;
        if (!prazo) {
            showToast('Selecione uma data.', 'warning');
            return;
        }
        if (prazo > prazoMaximoProj()) {
            showToast('O prazo não pode passar de 2 meses a partir de hoje.', 'warning');
            return;
        }
        try {
            const projeto = projetosCache.find(p => p.id === id);
            const novoStatus = projeto.status === 'pendente_prazo' ? 'em_andamento' : projeto.status;
            const atualizado = await atualizarProjetoCampoProj(id, {
                prazo,
                prazo_definido_em: new Date().toISOString(),
                status: novoStatus
            });
            showToast('✅ Prazo salvo!', 'success');
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
            atualizarResumoProj();
        } catch (error) {
            showToast('Erro ao salvar prazo: ' + error.message, 'error');
        }
    };

    window.adicionarItemChecklistProjeto = async function (id) {
        const input = document.getElementById('projNovoItemChecklist');
        const texto = input.value.trim();
        if (!texto) return;

        const projeto = projetosCache.find(p => p.id === id);
        const checklist = Array.isArray(projeto.checklist) ? [...projeto.checklist] : [];
        checklist.push({ id: String(Date.now()), texto, concluido: false });

        try {
            const atualizado = await atualizarProjetoCampoProj(id, { checklist });
            input.value = '';
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
        } catch (error) {
            showToast('Erro ao adicionar item: ' + error.message, 'error');
        }
    };

    window.alternarItemChecklistProjeto = async function (id, itemId, concluido) {
        const projeto = projetosCache.find(p => p.id === id);
        const checklist = (Array.isArray(projeto.checklist) ? projeto.checklist : []).map(item =>
            item.id === itemId ? { ...item, concluido } : item
        );
        try {
            const atualizado = await atualizarProjetoCampoProj(id, { checklist });
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
        } catch (error) {
            showToast('Erro ao atualizar item: ' + error.message, 'error');
        }
    };

    window.removerItemChecklistProjeto = async function (id, itemId) {
        const projeto = projetosCache.find(p => p.id === id);
        const checklist = (Array.isArray(projeto.checklist) ? projeto.checklist : []).filter(item => item.id !== itemId);
        try {
            const atualizado = await atualizarProjetoCampoProj(id, { checklist });
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
        } catch (error) {
            showToast('Erro ao remover item: ' + error.message, 'error');
        }
    };

    window.salvarCustosProjeto = async function (id) {
        const custoPrevisto = document.getElementById('projDetCustoPrevisto').value;
        const custoFinal = document.getElementById('projDetCustoFinal').value;
        try {
            const atualizado = await atualizarProjetoCampoProj(id, {
                custo_previsto: custoPrevisto === '' ? null : Number(custoPrevisto),
                custo_final: custoFinal === '' ? null : Number(custoFinal)
            });
            showToast('✅ Custos salvos!', 'success');
            renderizarDetalhesProjeto(atualizado);
        } catch (error) {
            showToast('Erro ao salvar custos: ' + error.message, 'error');
        }
    };

    window.salvarVisibilidadeProjeto = async function (id) {
        const visibilidade = document.getElementById('projDetVisibilidade').value;
        try {
            const atualizado = await atualizarProjetoCampoProj(id, { visibilidade });
            showToast('✅ Visibilidade atualizada!', 'success');
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
        } catch (error) {
            showToast('Erro ao salvar visibilidade: ' + error.message, 'error');
        }
    };

    window.concluirProjetoAcao = async function (id) {
        if (!confirm('Marcar este projeto como concluído?')) return;
        try {
            const atualizado = await atualizarProjetoCampoProj(id, {
                status: 'concluido',
                concluido_em: new Date().toISOString()
            });
            showToast('✅ Projeto concluído!', 'success');
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
            atualizarResumoProj();
        } catch (error) {
            showToast('Erro ao concluir projeto: ' + error.message, 'error');
        }
    };

    window.reabrirProjetoAcao = async function (id) {
        try {
            const atualizado = await atualizarProjetoCampoProj(id, {
                status: 'em_andamento',
                concluido_em: null
            });
            showToast('↩️ Projeto reaberto.', 'success');
            renderizarDetalhesProjeto(atualizado);
            renderizarListaProjetosProj();
            atualizarResumoProj();
        } catch (error) {
            showToast('Erro ao reabrir projeto: ' + error.message, 'error');
        }
    };

    window.excluirProjeto = async function (id) {
        if (!ehRonaldProj()) {
            showToast('🔒 Você não tem permissão para excluir projetos.', 'warning');
            return;
        }
        const projeto = projetosCache.find(p => p.id === id);
        if (!confirm(`Excluir permanentemente o projeto "${projeto?.titulo}"?`)) return;

        try {
            const { error } = await window.supabaseClient
                .from(CFG_PROJ.tabela)
                .delete()
                .eq('id', id);
            if (error) throw error;

            showToast('🗑️ Projeto excluído.', 'success');
            document.getElementById('modalDetalhesProjeto')?.remove();
            await carregarProjetosProj();
            await atualizarAlertaProjetosDashboard();

        } catch (error) {
            showToast('Erro ao excluir: ' + error.message, 'error');
        }
    };

    // ============================================================
    // CSS
    // ============================================================

    function injetarCssProj() {
        if (document.getElementById('projetosCSS')) return;
        const style = document.createElement('style');
        style.id = 'projetosCSS';
        style.textContent = `
            .proj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
            .proj-card { background: #fff; border: 1px solid #e9ecef; border-radius: 12px; padding: 16px; cursor: pointer; transition: .15s; box-shadow: 0 2px 8px rgba(8,43,91,.05); }
            .proj-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(8,43,91,.1); border-color: #bdd9ff; }
            .proj-card.proj-card-atrasado { border-left: 4px solid #dc3545; }
            .proj-card-topo { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .proj-card-titulo { margin: 0 0 6px; font-size: 15px; color: #102449; }
            .proj-card-destinatario { display: flex; align-items: center; gap: 8px; margin: 10px 0; font-size: 12px; color: #495057; }
            .proj-card-rodape { display: flex; justify-content: space-between; font-size: 11px; color: #6c757d; flex-wrap: wrap; gap: 6px; }
            .proj-avatar { width: 26px; height: 26px; border-radius: 50%; background: #0875ee; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; overflow: hidden; flex-shrink: 0; }
            .proj-badge-status { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
            .proj-status-pendente { background: #fff3cd; color: #856404; }
            .proj-status-andamento { background: #cfe2ff; color: #084298; }
            .proj-status-concluido { background: #d1e7dd; color: #0f5132; }
            .proj-badge-categoria { display: inline-block; background: #e9ecef; color: #495057; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
            .proj-badge-particular { color: #856404; }
            .proj-checklist-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f1f3f5; }
            .proj-checklist-item input { width: 17px; height: 17px; cursor: pointer; }
            .proj-checklist-riscado { text-decoration: line-through; color: #6c757d; }
            .proj-checklist-remover { margin-left: auto; background: none; border: none; color: #dc3545; cursor: pointer; padding: 2px 6px; }
            @keyframes projAlertaPiscar { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
            #projAlertaDashboard { animation: projAlertaPiscar 1.1s infinite; background: #dc3545; color: #fff; border-radius: 12px; padding: 14px 18px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; box-shadow: 0 8px 22px rgba(220,53,69,.35); }
            #projAlertaDashboard strong { font-size: 13px; letter-spacing: .03em; }
            #projAlertaDashboard .proj-alerta-fechar { background: rgba(255,255,255,.25); border: none; color: #fff; width: 26px; height: 26px; border-radius: 50%; cursor: pointer; font-size: 14px; flex-shrink: 0; }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // TELA
    // ============================================================

    function criarTelaProjetosProj() {
        if (document.getElementById('projetosSystem')) return;

        const div = document.createElement('div');
        div.id = 'projetosSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Projetos / Tarefas
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <h3 style="margin:0;"><i class="fas fa-diagram-project"></i> Projetos</h3>
                            <div id="projResumo" class="mt-2 d-flex gap-2 flex-wrap"></div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-secondary" onclick="voltarParaMenu()">
                                <i class="fas fa-arrow-left"></i> Voltar
                            </button>
                            <button class="btn btn-info" onclick="window.__carregarProjetosModulo()">
                                <i class="fas fa-sync-alt"></i> Atualizar
                            </button>
                            <button class="btn btn-outline-primary" id="projBtnCategorias" onclick="window.abrirModalGerenciarCategoriasProj()">
                                <i class="fas fa-tags"></i> Categorias
                            </button>
                            <button class="btn btn-success" id="projBtnNovo" onclick="window.abrirModalNovoProjeto()">
                                <i class="fas fa-plus"></i> Novo Projeto
                            </button>
                        </div>
                    </div>
                </div>

                <div class="card mb-3">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select id="projFiltroStatus" class="form-control form-control-sm" style="width:170px;" onchange="window.filtrarProjetos()">
                            <option value="ativos">Ativos (não concluídos)</option>
                            <option value="pendente_prazo">Aguardando prazo</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="concluido">Concluídos</option>
                            <option value="todos">Todos</option>
                        </select>
                        <select id="projFiltroCategoria" class="form-control form-control-sm" style="width:180px;" onchange="window.filtrarProjetos()">
                            <option value="">Todas as categorias</option>
                        </select>
                        <input type="text" id="projBusca" class="form-control form-control-sm" placeholder="🔍 Buscar projeto..." style="flex:1; min-width:200px;" oninput="window.filtrarProjetos()">
                    </div>
                </div>

                <div id="projLista"></div>
            </div>
        `;
        document.body.appendChild(div);

        const filtroCategoria = document.getElementById('projFiltroCategoria');
        if (filtroCategoria) {
            filtroCategoria.innerHTML = '<option value="">Todas as categorias</option>' +
                categoriasCache.map(c => `<option value="${escProj(c.nome)}">${escProj(c.nome)}</option>`).join('');
        }

        if (!ehAdminProj()) {
            document.getElementById('projBtnNovo')?.remove();
            document.getElementById('projBtnCategorias')?.remove();
        }
    }

    window.__carregarProjetosModulo = carregarProjetosProj;

    window.abrirSistemaProjetos = async function () {
        const usuario = usuarioAtualProj();
        if (!usuario) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        injetarCssProj();
        await carregarCategoriasProj();
        criarTelaProjetosProj();
        criarModalNovoProjeto();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('projetosSystem');
        }
        document.getElementById('projetosSystem')?.classList.remove('hidden');

        await carregarProjetosProj();
    };

    // ============================================================
    // ALERTA NO MENU PRINCIPAL (RONALD E ANDRESSAMIOTTO)
    // ============================================================

    async function atualizarAlertaProjetosDashboard() {
        if (!ehRonaldProj()) return;

        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_PROJ.tabela)
                .select('id')
                .neq('status', 'concluido');

            if (error) throw error;

            const total = (data || []).length;
            const card = document.getElementById('wtNoticesToday') || document.body;
            let alerta = document.getElementById('projAlertaDashboard');

            const dismissedCount = Number(localStorage.getItem('proj_alerta_dismissed_count') || '-1');

            if (total === 0 || dismissedCount === total) {
                alerta?.remove();
                return;
            }

            if (!alerta) {
                alerta = document.createElement('div');
                alerta.id = 'projAlertaDashboard';
                const menuSystem = document.getElementById('menuSystem');
                const alvo = document.querySelector('#menuSystem .wt-main .container, #menuSystem .wt-main') || menuSystem;
                const topbar = document.querySelector('#menuSystem .wt-topbar');
                if (topbar && topbar.parentElement) {
                    topbar.parentElement.insertBefore(alerta, topbar.nextSibling);
                } else if (alvo) {
                    alvo.prepend(alerta);
                }
            }

            alerta.innerHTML = `
                <div onclick="window.abrirSistemaProjetos()" style="flex:1; display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-triangle-exclamation"></i>
                    <strong>PROJETOS EM ANDAMENTO PARA VERIFICAR (${total})</strong>
                </div>
                <button class="proj-alerta-fechar" onclick="event.stopPropagation(); window.dispensarAlertaProjetosDashboard(${total})" title="Dispensar">
                    <i class="fas fa-times"></i>
                </button>
            `;

        } catch (error) {
            console.warn('⚠️ [Projetos] Erro ao atualizar alerta do dashboard:', error);
        }
    }

    window.dispensarAlertaProjetosDashboard = function (total) {
        localStorage.setItem('proj_alerta_dismissed_count', String(total));
        document.getElementById('projAlertaDashboard')?.remove();
    };

    window.atualizarAlertaProjetosDashboard = atualizarAlertaProjetosDashboard;

    const menuSystemProj = document.getElementById('menuSystem');
    function agendarChecagemAlertaProj() {
        injetarCssProj();
        if (!document.getElementById('menuSystem')?.classList.contains('hidden')) {
            atualizarAlertaProjetosDashboard();
        }
    }
    const observadorMenuProj = document.getElementById('menuSystem');
    if (observadorMenuProj) {
        new MutationObserver(agendarChecagemAlertaProj).observe(observadorMenuProj, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('load', () => setTimeout(agendarChecagemAlertaProj, 1500));
    window.setInterval(agendarChecagemAlertaProj, 60000);

})();
