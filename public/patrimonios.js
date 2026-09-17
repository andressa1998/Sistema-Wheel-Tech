// ================================================================
// PATRIMÔNIOS WT — WHEEL TECH
// ================================================================
//
// Controle dos equipamentos/patrimônios da empresa, espelhando a
// planilha usada hoje (nº de série, equipamento, com quem está,
// setor, patrimônio, garantia, data da compra, valor, NF-e, marca,
// localização, status, validado, observações).
//
// A garantia é guardada como data de vencimento — a lista avisa
// com um selo colorido quando está vencendo ou já venceu. O anexo
// da NF-e é salvo em base64 direto na linha (mesmo padrão já usado
// no sistema pra foto de avatar).
// ================================================================

(() => {
    'use strict';

    const CFG_PAT = {
        tabela: 'patrimonios_wt'
    };

    const STATUS_PAT = {
        ativo: { texto: 'Ativo', classe: 'pat-status-ativo' },
        inativo: { texto: 'Inativo', classe: 'pat-status-inativo' },
        manutencao: { texto: 'Em manutenção', classe: 'pat-status-manutencao' },
        baixado: { texto: 'Baixado', classe: 'pat-status-baixado' }
    };

    const DIAS_ALERTA_GARANTIA = 30;
    const TAMANHO_MAX_ANEXO = 8 * 1024 * 1024; // 8MB

    let patrimoniosCache = [];
    let anexoSelecionadoBase64 = null;
    let anexoSelecionadoNome = null;
    let anexoSelecionadoTipo = null;

    let filtroStatusPat = 'todos';
    let filtroGarantiaPat = '';
    let filtroBuscaPat = '';

    // ============================================================
    // HELPERS
    // ============================================================

    function escPat(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function usuarioAtualPat() {
        return window.currentUser || null;
    }

    function usernamePat() {
        const u = usuarioAtualPat();
        if (!u) return '';
        return String(u.username || u.name || '').trim().toLowerCase();
    }

    function fmtDataPat(iso) {
        if (!iso) return '—';
        const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
        return `${dia}/${mes}/${ano}`;
    }

    function fmtMoedaPat(valor) {
        if (valor == null || valor === '') return '—';
        return 'R$ ' + Number(valor).toFixed(2).replace('.', ',');
    }

    function cfgStatusPat(status) {
        return STATUS_PAT[status] || { texto: status || '—', classe: 'pat-status-ativo' };
    }

    function diasAteGarantiaPat(vencimento) {
        if (!vencimento) return null;
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const data = new Date(`${vencimento}T00:00:00`);
        return Math.round((data - hoje) / (1000 * 60 * 60 * 24));
    }

    function infoGarantiaPat(vencimento) {
        const dias = diasAteGarantiaPat(vencimento);
        if (dias == null) return { texto: '—', classe: '', dias: null };
        if (dias < 0) return { texto: `Venceu há ${Math.abs(dias)} dia(s)`, classe: 'pat-garantia-vencida', dias };
        if (dias <= DIAS_ALERTA_GARANTIA) return { texto: `Vence em ${dias} dia(s)`, classe: 'pat-garantia-vencendo', dias };
        return { texto: fmtDataPat(vencimento), classe: 'pat-garantia-ok', dias };
    }

    // ============================================================
    // CARREGAR
    // ============================================================

    async function carregarPatrimoniosPat() {
        const tbody = document.getElementById('patTabelaCorpo');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-muted"><div class="spinner"></div> Carregando...</td></tr>`;
        }

        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_PAT.tabela)
                .select('id, numero_serie, equipamento, esta_com, setor, numero_patrimonio, garantia_vencimento, data_compra, valor, nfe_numero, nfe_arquivo_nome, marca, localizacao, status, validado_em, observacoes')
                .order('id', { ascending: false });

            if (error) throw error;

            patrimoniosCache = data || [];
            renderizarTabelaPat();
            atualizarResumoPat();

        } catch (error) {
            console.error('❌ [Patrimônios] Erro ao carregar:', error);
            if (tbody) tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-danger">Erro ao carregar: ${escPat(error.message)}</td></tr>`;
        }
    }

    function atualizarResumoPat() {
        const vencendo = patrimoniosCache.filter(p => { const d = diasAteGarantiaPat(p.garantia_vencimento); return d != null && d >= 0 && d <= DIAS_ALERTA_GARANTIA; }).length;
        const vencidas = patrimoniosCache.filter(p => { const d = diasAteGarantiaPat(p.garantia_vencimento); return d != null && d < 0; }).length;
        const ativos = patrimoniosCache.filter(p => p.status === 'ativo').length;

        const el = document.getElementById('patResumo');
        if (el) {
            el.innerHTML = `
                <span class="badge badge-success">${ativos} ativo(s)</span>
                <span class="badge" style="background:#fd7e14;color:#fff;">${vencendo} garantia(s) vencendo</span>
                <span class="badge badge-danger">${vencidas} garantia(s) vencida(s)</span>
            `;
        }
    }

    // ============================================================
    // FILTROS + TABELA
    // ============================================================

    function patrimoniosFiltradosPat() {
        let lista = [...patrimoniosCache];

        if (filtroStatusPat !== 'todos') {
            lista = lista.filter(p => p.status === filtroStatusPat);
        }

        if (filtroGarantiaPat) {
            lista = lista.filter(p => {
                const d = diasAteGarantiaPat(p.garantia_vencimento);
                if (filtroGarantiaPat === 'vencendo') return d != null && d >= 0 && d <= DIAS_ALERTA_GARANTIA;
                if (filtroGarantiaPat === 'vencida') return d != null && d < 0;
                return true;
            });
        }

        if (filtroBuscaPat) {
            const termo = filtroBuscaPat.toLowerCase();
            lista = lista.filter(p =>
                [p.numero_serie, p.equipamento, p.esta_com, p.setor, p.numero_patrimonio, p.marca, p.localizacao]
                    .some(campo => String(campo || '').toLowerCase().includes(termo))
            );
        }

        return lista;
    }

    function renderizarTabelaPat() {
        const tbody = document.getElementById('patTabelaCorpo');
        if (!tbody) return;

        const lista = patrimoniosFiltradosPat();

        if (!lista.length) {
            tbody.innerHTML = `<tr><td colspan="14" class="text-center py-4 text-muted">Nenhum patrimônio encontrado.</td></tr>`;
            return;
        }

        tbody.innerHTML = lista.map(p => {
            const st = cfgStatusPat(p.status);
            const garantia = infoGarantiaPat(p.garantia_vencimento);

            return `
                <tr class="pat-linha" onclick="window.abrirDetalhesPatrimonio(${p.id})">
                    <td>${escPat(p.numero_serie || '—')}</td>
                    <td><strong>${escPat(p.equipamento)}</strong></td>
                    <td>${escPat(p.esta_com || '—')}</td>
                    <td>${escPat(p.setor || '—')}</td>
                    <td>${escPat(p.numero_patrimonio || '—')}</td>
                    <td><span class="pat-badge-garantia ${garantia.classe}">${garantia.texto}</span></td>
                    <td>${fmtDataPat(p.data_compra)}</td>
                    <td>${fmtMoedaPat(p.valor)}</td>
                    <td>${p.nfe_arquivo_nome ? `<i class="fas fa-paperclip" title="${escPat(p.nfe_arquivo_nome)}"></i> ${escPat(p.nfe_numero || '')}` : escPat(p.nfe_numero || '—')}</td>
                    <td>${escPat(p.marca || '—')}</td>
                    <td>${escPat(p.localizacao || '—')}</td>
                    <td><span class="pat-badge-status ${st.classe}">${escPat(st.texto)}</span></td>
                    <td>${fmtDataPat(p.validado_em)}</td>
                    <td>${escPat((p.observacoes || '').slice(0, 30))}${(p.observacoes || '').length > 30 ? '…' : ''}</td>
                </tr>
            `;
        }).join('');
    }

    window.filtrarPatrimonios = function () {
        filtroStatusPat = document.getElementById('patFiltroStatus')?.value || 'todos';
        filtroGarantiaPat = document.getElementById('patFiltroGarantia')?.value || '';
        filtroBuscaPat = String(document.getElementById('patBusca')?.value || '').trim().toLowerCase();
        renderizarTabelaPat();
    };

    // ============================================================
    // MODAL: NOVO / EDITAR PATRIMÔNIO
    // ============================================================

    function criarModalPatrimonioPat() {
        if (document.getElementById('modalPatrimonio')) return;

        const modal = document.createElement('div');
        modal.id = 'modalPatrimonio';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:680px; max-height:90vh; overflow-y:auto;">
                <h3 style="margin-top:0;" id="patModalTitulo"><i class="fas fa-boxes-stacked"></i> Novo Patrimônio</h3>
                <input type="hidden" id="patFormId">

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Número de série</label>
                            <input type="text" id="patFormNumeroSerie" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Equipamento *</label>
                            <input type="text" id="patFormEquipamento" class="form-control" placeholder="Ex.: Notebook, Kindle...">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Está com</label>
                            <input type="text" id="patFormEstaCom" class="form-control" placeholder="Nome do colaborador">
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Setor</label>
                            <input type="text" id="patFormSetor" class="form-control">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Nº do patrimônio</label>
                            <input type="text" id="patFormNumeroPatrimonio" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Marca</label>
                            <input type="text" id="patFormMarca" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Localização</label>
                            <input type="text" id="patFormLocalizacao" class="form-control">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Data da compra</label>
                            <input type="date" id="patFormDataCompra" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Vencimento da garantia</label>
                            <input type="date" id="patFormGarantia" class="form-control">
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="form-group">
                            <label>Valor</label>
                            <input type="number" step="0.01" id="patFormValor" class="form-control">
                        </div>
                    </div>
                </div>

                <div class="row">
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Status</label>
                            <select id="patFormStatus" class="form-control">
                                <option value="ativo">Ativo</option>
                                <option value="inativo">Inativo</option>
                                <option value="manutencao">Em manutenção</option>
                                <option value="baixado">Baixado</option>
                            </select>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="form-group">
                            <label>Validado em</label>
                            <input type="date" id="patFormValidado" class="form-control">
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>NF-e (número)</label>
                    <input type="text" id="patFormNfeNumero" class="form-control" placeholder="Número/chave da nota fiscal">
                </div>

                <div class="form-group">
                    <label>Anexar NF-e (PDF ou XML, até 8MB)</label>
                    <input type="file" id="patFormNfeArquivo" class="form-control" accept=".pdf,.xml,application/pdf,text/xml">
                    <div id="patFormNfeArquivoAtual" style="margin-top:6px; font-size:12px;"></div>
                </div>

                <div class="form-group">
                    <label>Observações</label>
                    <textarea id="patFormObservacoes" class="form-control" rows="2"></textarea>
                </div>

                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-secondary" onclick="window.fecharModalPatrimonio()">Cancelar</button>
                    <button class="btn btn-primary" id="patBtnSalvar" onclick="window.salvarPatrimonio()">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('patFormNfeArquivo').addEventListener('change', handleArquivoSelecionadoPat);
    }

    function handleArquivoSelecionadoPat(ev) {
        const arquivo = ev.target.files?.[0];
        anexoSelecionadoBase64 = null;
        anexoSelecionadoNome = null;
        anexoSelecionadoTipo = null;

        if (!arquivo) return;

        if (arquivo.size > TAMANHO_MAX_ANEXO) {
            showToast('⚠️ Arquivo muito grande (máx. 8MB).', 'warning');
            ev.target.value = '';
            return;
        }

        const leitor = new FileReader();
        leitor.onload = () => {
            anexoSelecionadoBase64 = leitor.result;
            anexoSelecionadoNome = arquivo.name;
            anexoSelecionadoTipo = arquivo.type || '';
        };
        leitor.readAsDataURL(arquivo);
    }

    window.abrirModalNovoPatrimonio = function () {
        criarModalPatrimonioPat();
        document.getElementById('patModalTitulo').innerHTML = '<i class="fas fa-boxes-stacked"></i> Novo Patrimônio';
        document.getElementById('patFormId').value = '';
        ['patFormNumeroSerie', 'patFormEquipamento', 'patFormEstaCom', 'patFormSetor', 'patFormNumeroPatrimonio',
         'patFormMarca', 'patFormLocalizacao', 'patFormDataCompra', 'patFormGarantia', 'patFormValor',
         'patFormValidado', 'patFormNfeNumero', 'patFormObservacoes'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('patFormStatus').value = 'ativo';
        document.getElementById('patFormNfeArquivo').value = '';
        document.getElementById('patFormNfeArquivoAtual').textContent = '';
        anexoSelecionadoBase64 = null;
        anexoSelecionadoNome = null;
        anexoSelecionadoTipo = null;

        document.getElementById('modalPatrimonio').classList.remove('hidden');
    };

    window.abrirModalEditarPatrimonio = async function (id) {
        try {
            const { data: p, error } = await window.supabaseClient
                .from(CFG_PAT.tabela)
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;

            criarModalPatrimonioPat();
            document.getElementById('patModalTitulo').innerHTML = '<i class="fas fa-boxes-stacked"></i> Editar Patrimônio';
            document.getElementById('patFormId').value = p.id;
            document.getElementById('patFormNumeroSerie').value = p.numero_serie || '';
            document.getElementById('patFormEquipamento').value = p.equipamento || '';
            document.getElementById('patFormEstaCom').value = p.esta_com || '';
            document.getElementById('patFormSetor').value = p.setor || '';
            document.getElementById('patFormNumeroPatrimonio').value = p.numero_patrimonio || '';
            document.getElementById('patFormMarca').value = p.marca || '';
            document.getElementById('patFormLocalizacao').value = p.localizacao || '';
            document.getElementById('patFormDataCompra').value = p.data_compra || '';
            document.getElementById('patFormGarantia').value = p.garantia_vencimento || '';
            document.getElementById('patFormValor').value = p.valor ?? '';
            document.getElementById('patFormStatus').value = p.status || 'ativo';
            document.getElementById('patFormValidado').value = p.validado_em || '';
            document.getElementById('patFormNfeNumero').value = p.nfe_numero || '';
            document.getElementById('patFormObservacoes').value = p.observacoes || '';
            document.getElementById('patFormNfeArquivo').value = '';
            document.getElementById('patFormNfeArquivoAtual').innerHTML = p.nfe_arquivo_nome
                ? `<i class="fas fa-paperclip"></i> Anexo atual: <a href="#" onclick="window.baixarAnexoPatrimonio(${p.id});return false;">${escPat(p.nfe_arquivo_nome)}</a> <a href="#" onclick="window.removerAnexoPatrimonio(${p.id});return false;" style="color:#dc3545;margin-left:8px;">remover</a>`
                : '<span class="text-muted">Nenhum anexo.</span>';

            anexoSelecionadoBase64 = null;
            anexoSelecionadoNome = null;
            anexoSelecionadoTipo = null;

            document.getElementById('modalPatrimonio').classList.remove('hidden');

        } catch (error) {
            showToast('Erro ao carregar patrimônio: ' + error.message, 'error');
        }
    };

    window.fecharModalPatrimonio = function () {
        document.getElementById('modalPatrimonio')?.classList.add('hidden');
    };

    window.salvarPatrimonio = async function () {
        const id = document.getElementById('patFormId').value;
        const equipamento = document.getElementById('patFormEquipamento').value.trim();

        if (!equipamento) {
            showToast('Informe o equipamento.', 'warning');
            return;
        }

        const dados = {
            numero_serie: document.getElementById('patFormNumeroSerie').value.trim() || null,
            equipamento,
            esta_com: document.getElementById('patFormEstaCom').value.trim() || null,
            setor: document.getElementById('patFormSetor').value.trim() || null,
            numero_patrimonio: document.getElementById('patFormNumeroPatrimonio').value.trim() || null,
            marca: document.getElementById('patFormMarca').value.trim() || null,
            localizacao: document.getElementById('patFormLocalizacao').value.trim() || null,
            data_compra: document.getElementById('patFormDataCompra').value || null,
            garantia_vencimento: document.getElementById('patFormGarantia').value || null,
            valor: document.getElementById('patFormValor').value === '' ? null : Number(document.getElementById('patFormValor').value),
            status: document.getElementById('patFormStatus').value,
            validado_em: document.getElementById('patFormValidado').value || null,
            nfe_numero: document.getElementById('patFormNfeNumero').value.trim() || null,
            observacoes: document.getElementById('patFormObservacoes').value.trim() || null,
            atualizado_em: new Date().toISOString()
        };

        if (anexoSelecionadoBase64) {
            dados.nfe_arquivo_base64 = anexoSelecionadoBase64;
            dados.nfe_arquivo_nome = anexoSelecionadoNome;
            dados.nfe_arquivo_tipo = anexoSelecionadoTipo;
        }

        const btn = document.getElementById('patBtnSalvar');
        const htmlOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            if (id) {
                const { error } = await window.supabaseClient
                    .from(CFG_PAT.tabela)
                    .update(dados)
                    .eq('id', id);
                if (error) throw error;
                showToast('✅ Patrimônio atualizado!', 'success');
            } else {
                dados.criado_por = usernamePat();
                dados.criado_em = new Date().toISOString();
                const { error } = await window.supabaseClient
                    .from(CFG_PAT.tabela)
                    .insert([dados]);
                if (error) throw error;
                showToast('✅ Patrimônio cadastrado!', 'success');
            }

            window.fecharModalPatrimonio();
            await carregarPatrimoniosPat();

        } catch (error) {
            console.error('❌ [Patrimônios] Erro ao salvar:', error);
            showToast('Erro ao salvar: ' + error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = htmlOriginal;
        }
    };

    window.excluirPatrimonio = async function (id) {
        if (!confirm('Excluir este patrimônio?')) return;
        try {
            const { error } = await window.supabaseClient
                .from(CFG_PAT.tabela)
                .delete()
                .eq('id', id);
            if (error) throw error;
            showToast('🗑️ Patrimônio excluído.', 'success');
            document.getElementById('modalDetalhesPatrimonio')?.remove();
            await carregarPatrimoniosPat();
        } catch (error) {
            showToast('Erro ao excluir: ' + error.message, 'error');
        }
    };

    // ============================================================
    // ANEXO DA NF-E
    // ============================================================

    window.baixarAnexoPatrimonio = async function (id) {
        try {
            const { data, error } = await window.supabaseClient
                .from(CFG_PAT.tabela)
                .select('nfe_arquivo_base64, nfe_arquivo_nome')
                .eq('id', id)
                .single();
            if (error) throw error;
            if (!data?.nfe_arquivo_base64) {
                showToast('Sem anexo.', 'warning');
                return;
            }
            const link = document.createElement('a');
            link.href = data.nfe_arquivo_base64;
            link.download = data.nfe_arquivo_nome || 'nfe.pdf';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            showToast('Erro ao baixar anexo: ' + error.message, 'error');
        }
    };

    window.removerAnexoPatrimonio = async function (id) {
        if (!confirm('Remover o anexo da NF-e deste patrimônio?')) return;
        try {
            const { error } = await window.supabaseClient
                .from(CFG_PAT.tabela)
                .update({ nfe_arquivo_base64: null, nfe_arquivo_nome: null, nfe_arquivo_tipo: null, atualizado_em: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;
            showToast('Anexo removido.', 'success');
            document.getElementById('patFormNfeArquivoAtual').innerHTML = '<span class="text-muted">Nenhum anexo.</span>';
            await carregarPatrimoniosPat();
        } catch (error) {
            showToast('Erro ao remover anexo: ' + error.message, 'error');
        }
    };

    // ============================================================
    // DETALHES (VISUALIZAÇÃO RÁPIDA)
    // ============================================================

    window.abrirDetalhesPatrimonio = function (id) {
        const p = patrimoniosCache.find(x => x.id === id);
        if (!p) return;

        let modal = document.getElementById('modalDetalhesPatrimonio');
        if (modal) modal.remove();

        const st = cfgStatusPat(p.status);
        const garantia = infoGarantiaPat(p.garantia_vencimento);

        modal = document.createElement('div');
        modal.id = 'modalDetalhesPatrimonio';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:520px;">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <h3 style="margin:0;"><i class="fas fa-boxes-stacked"></i> ${escPat(p.equipamento)}</h3>
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('modalDetalhesPatrimonio').remove()">Fechar</button>
                </div>
                <div class="d-flex gap-2 mb-3">
                    <span class="pat-badge-status ${st.classe}">${escPat(st.texto)}</span>
                    <span class="pat-badge-garantia ${garantia.classe}">${garantia.texto}</span>
                </div>
                <table class="table table-sm">
                    <tr><td><strong>Nº de série</strong></td><td>${escPat(p.numero_serie || '—')}</td></tr>
                    <tr><td><strong>Está com</strong></td><td>${escPat(p.esta_com || '—')}</td></tr>
                    <tr><td><strong>Setor</strong></td><td>${escPat(p.setor || '—')}</td></tr>
                    <tr><td><strong>Nº patrimônio</strong></td><td>${escPat(p.numero_patrimonio || '—')}</td></tr>
                    <tr><td><strong>Marca</strong></td><td>${escPat(p.marca || '—')}</td></tr>
                    <tr><td><strong>Localização</strong></td><td>${escPat(p.localizacao || '—')}</td></tr>
                    <tr><td><strong>Data da compra</strong></td><td>${fmtDataPat(p.data_compra)}</td></tr>
                    <tr><td><strong>Valor</strong></td><td>${fmtMoedaPat(p.valor)}</td></tr>
                    <tr><td><strong>NF-e</strong></td><td>${escPat(p.nfe_numero || '—')} ${p.nfe_arquivo_nome ? `<a href="#" onclick="window.baixarAnexoPatrimonio(${p.id});return false;"><i class="fas fa-paperclip"></i> ${escPat(p.nfe_arquivo_nome)}</a>` : ''}</td></tr>
                    <tr><td><strong>Validado em</strong></td><td>${fmtDataPat(p.validado_em)}</td></tr>
                    ${p.observacoes ? `<tr><td><strong>Obs.</strong></td><td>${escPat(p.observacoes)}</td></tr>` : ''}
                </table>
                <div class="d-flex justify-content-end gap-2 mt-3">
                    <button class="btn btn-outline-danger btn-sm" onclick="window.excluirPatrimonio(${p.id})"><i class="fas fa-trash"></i> Excluir</button>
                    <button class="btn btn-primary btn-sm" onclick="document.getElementById('modalDetalhesPatrimonio').remove(); window.abrirModalEditarPatrimonio(${p.id});"><i class="fas fa-edit"></i> Editar</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    };

    // ============================================================
    // EXPORTAR EXCEL
    // ============================================================

    window.exportarPatrimoniosExcel = function () {
        const lista = patrimoniosFiltradosPat();
        if (!lista.length) {
            showToast('⚠️ Nenhum patrimônio para exportar.', 'warning');
            return;
        }
        const linhas = lista.map(p => ({
            'Número de Série': p.numero_serie || '',
            'Equipamento': p.equipamento || '',
            'Está com': p.esta_com || '',
            'Setor': p.setor || '',
            'Patrimônio': p.numero_patrimonio || '',
            'Garantia': p.garantia_vencimento ? fmtDataPat(p.garantia_vencimento) : '',
            'Data da Compra': p.data_compra ? fmtDataPat(p.data_compra) : '',
            'Valor': p.valor ?? '',
            'NF-e': p.nfe_numero || '',
            'Marca': p.marca || '',
            'Localização': p.localizacao || '',
            'Status': cfgStatusPat(p.status).texto,
            'Validado': p.validado_em ? fmtDataPat(p.validado_em) : '',
            'Obs': p.observacoes || ''
        }));
        const ws = XLSX.utils.json_to_sheet(linhas);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Patrimônios');
        XLSX.writeFile(wb, `patrimonios_wt_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    // ============================================================
    // CSS
    // ============================================================

    function injetarCssPat() {
        if (document.getElementById('patrimoniosCSS')) return;
        const style = document.createElement('style');
        style.id = 'patrimoniosCSS';
        style.textContent = `
            .pat-linha { cursor: pointer; }
            .pat-linha:hover { background: #f8fbff; }
            .pat-badge-status { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
            .pat-status-ativo { background: #d1e7dd; color: #0f5132; }
            .pat-status-inativo { background: #e9ecef; color: #495057; }
            .pat-status-manutencao { background: #fff3cd; color: #856404; }
            .pat-status-baixado { background: #f8d7da; color: #721c24; }
            .pat-badge-garantia { display: inline-block; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
            .pat-garantia-ok { background: #e9ecef; color: #495057; }
            .pat-garantia-vencendo { background: #fd7e14; color: #fff; }
            .pat-garantia-vencida { background: #dc3545; color: #fff; }
        `;
        document.head.appendChild(style);
    }

    // ============================================================
    // TELA
    // ============================================================

    function criarTelaPatrimoniosPat() {
        if (document.getElementById('patrimoniosSystem')) return;

        const div = document.createElement('div');
        div.id = 'patrimoniosSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Patrimônios WT
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <h3 style="margin:0;"><i class="fas fa-boxes-stacked"></i> Patrimônios</h3>
                            <div id="patResumo" class="mt-2 d-flex gap-2 flex-wrap"></div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-secondary" onclick="voltarParaMenu()"><i class="fas fa-arrow-left"></i> Voltar</button>
                            <button class="btn btn-info" onclick="window.__carregarPatrimoniosModulo()"><i class="fas fa-sync-alt"></i> Atualizar</button>
                            <button class="btn btn-outline-primary" onclick="window.exportarPatrimoniosExcel()"><i class="fas fa-file-excel"></i> Exportar Excel</button>
                            <button class="btn btn-success" onclick="window.abrirModalNovoPatrimonio()"><i class="fas fa-plus"></i> Novo Patrimônio</button>
                        </div>
                    </div>
                </div>

                <div class="card mb-3">
                    <div class="d-flex flex-wrap gap-2 align-items-center">
                        <select id="patFiltroStatus" class="form-control form-control-sm" style="width:170px;" onchange="window.filtrarPatrimonios()">
                            <option value="todos">Todos os status</option>
                            <option value="ativo">Ativo</option>
                            <option value="inativo">Inativo</option>
                            <option value="manutencao">Em manutenção</option>
                            <option value="baixado">Baixado</option>
                        </select>
                        <select id="patFiltroGarantia" class="form-control form-control-sm" style="width:190px;" onchange="window.filtrarPatrimonios()">
                            <option value="">Garantia: todas</option>
                            <option value="vencendo">Vencendo (${DIAS_ALERTA_GARANTIA} dias)</option>
                            <option value="vencida">Vencidas</option>
                        </select>
                        <input type="text" id="patBusca" class="form-control form-control-sm" placeholder="🔍 Buscar por série, equipamento, pessoa..." style="flex:1; min-width:220px;" oninput="window.filtrarPatrimonios()">
                    </div>
                </div>

                <div class="card">
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Nº de Série</th>
                                    <th>Equipamento</th>
                                    <th>Está com</th>
                                    <th>Setor</th>
                                    <th>Patrimônio</th>
                                    <th>Garantia</th>
                                    <th>Data da Compra</th>
                                    <th>Valor</th>
                                    <th>NF-e</th>
                                    <th>Marca</th>
                                    <th>Localização</th>
                                    <th>Status</th>
                                    <th>Validado</th>
                                    <th>Obs.</th>
                                </tr>
                            </thead>
                            <tbody id="patTabelaCorpo"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    window.__carregarPatrimoniosModulo = carregarPatrimoniosPat;

    window.abrirSistemaPatrimonios = async function () {
        if (!usuarioAtualPat()) {
            showToast('⚠️ Faça login primeiro', 'warning');
            return;
        }

        injetarCssPat();
        criarTelaPatrimoniosPat();
        criarModalPatrimonioPat();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('patrimoniosSystem');
        }
        document.getElementById('patrimoniosSystem')?.classList.remove('hidden');

        await carregarPatrimoniosPat();
    };

})();
