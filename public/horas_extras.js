// ================================================================
// HORAS EXTRAS — WHEEL TECH
// ================================================================
//
// Administradores definem o salário base de cada pessoa e vão
// lançando as horas extras; cada pessoa vê quanto tem a receber.
//
// Salário é sigiloso: cada um vê SÓ o próprio. Isso é garantido no
// banco (ver horas_extras.sql), não na tela — as tabelas ficam
// trancadas e tudo passa por funções he_* que exigem um token. O
// token é emitido no login (usuário + senha) e guardado aqui; se ele
// faltar ou vencer, a tela pede a senha de novo.
// ================================================================

(() => {
    'use strict';

    const CHAVE_TOKEN = 'wheeltech_he_token';
    const VALIDADE_TOKEN_MS = 12 * 60 * 60 * 1000 - 5 * 60 * 1000; // um pouco antes do banco
    const ERRO_SESSAO = 'SESSAO_HE_INVALIDA';
    const PERCENTUAIS = [
        { valor: 50, texto: '50% — dia útil' },
        { valor: 100, texto: '100% — domingo / feriado' }
    ];

    let resumoHe = null;      // he_meu_resumo
    let painelHe = [];        // he_admin_painel
    let abaHe = 'minhas';     // 'minhas' | 'equipe'
    let filtroMesHe = '';
    let pessoaAbertaHe = null;
    let lancamentosPessoaHe = [];

    // ============================================================
    // HELPERS
    // ============================================================

    function sb() { return window.supabaseClient || null; }

    function escHe(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function usernameHe() {
        return String(window.currentUser?.username || '').trim().toLowerCase();
    }

    function toastHe(msg, tipo) {
        if (window.showToast) window.showToast(msg, tipo || 'info');
    }

    const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    function brl(v) { return fmtBRL.format(Number(v) || 0); }

    function fmtMinutos(min) {
        const m = Math.round(Number(min) || 0);
        const h = Math.floor(m / 60);
        const r = m % 60;
        return r ? `${h}h${String(r).padStart(2, '0')}` : `${h}h`;
    }

    // Aceita "2:30", "2h30", "2h", "2,5", "2.5", "45min"
    function lerMinutos(texto) {
        const t = String(texto || '').trim().toLowerCase().replace(/\s+/g, '');
        if (!t) return 0;
        let m = t.match(/^(\d+)(?:[:h](\d{1,2})?)?(?:m|min)?$/);
        if (m && (t.includes(':') || t.includes('h'))) return Number(m[1]) * 60 + Number(m[2] || 0);
        m = t.match(/^(\d+)(?:m|min)$/);
        if (m) return Number(m[1]);
        const n = Number(t.replace(',', '.'));
        return Number.isFinite(n) ? Math.round(n * 60) : 0;
    }

    function fmtData(iso) {
        if (!iso) return '—';
        const [a, m, d] = String(iso).slice(0, 10).split('-');
        return `${d}/${m}/${a}`;
    }

    function nomeMes(chave) {
        const [a, m] = chave.split('-');
        const nome = new Date(Number(a), Number(m) - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        return nome.charAt(0).toUpperCase() + nome.slice(1);
    }

    function hojeIso() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // ============================================================
    // TOKEN
    // ============================================================

    function lerTokenHe() {
        try {
            const t = JSON.parse(localStorage.getItem(CHAVE_TOKEN) || 'null');
            if (t && t.token && t.username === usernameHe() && t.expiraEm > Date.now()) return t.token;
        } catch (_) { /* sem storage */ }
        return null;
    }

    function salvarTokenHe(token, username) {
        try {
            localStorage.setItem(CHAVE_TOKEN, JSON.stringify({
                token,
                username: String(username || '').trim().toLowerCase(),
                expiraEm: Date.now() + VALIDADE_TOKEN_MS
            }));
        } catch (_) { /* sem storage */ }
    }

    function limparTokenHe() {
        try { localStorage.removeItem(CHAVE_TOKEN); } catch (_) { /* segue */ }
    }

    // Chamado pelo handleLogin logo após entrar (a senha só existe ali).
    window.horasExtrasAbrirSessao = async function (username, senha) {
        if (!sb() || typeof window.wtHashSenha !== 'function') return false;
        const hash = await window.wtHashSenha(username, senha);
        const { data, error } = await sb().rpc('he_abrir_sessao', {
            p_username: String(username || '').trim().toLowerCase(),
            p_senha_hash: hash
        });
        if (error || !data) return false;
        salvarTokenHe(data, username);
        return true;
    };

    // Chamado no logout.
    window.horasExtrasEncerrarSessao = function () {
        let token = null;
        try { token = (JSON.parse(localStorage.getItem(CHAVE_TOKEN) || 'null') || {}).token; } catch (_) { /* segue */ }
        limparTokenHe();
        resumoHe = null;
        painelHe = [];
        if (token && sb()) sb().rpc('he_encerrar_sessao', { p_token: token }).then(() => {}, () => {});
    };

    async function rpcHe(nome, params) {
        const token = lerTokenHe();
        if (!token) throw new Error(ERRO_SESSAO);
        const { data, error } = await sb().rpc(nome, { p_token: token, ...(params || {}) });
        if (error) {
            if (String(error.message || '').includes(ERRO_SESSAO)) {
                limparTokenHe();
                throw new Error(ERRO_SESSAO);
            }
            if (/could not find the function|schema cache/i.test(error.message || '')) {
                throw new Error('O módulo ainda não foi instalado no banco. Rode o arquivo horas_extras.sql no Supabase.');
            }
            throw error;
        }
        return data;
    }

    // ============================================================
    // CARREGAR
    // ============================================================

    async function carregarHe() {
        const alvo = document.getElementById('heConteudo');
        if (!alvo) return;

        if (!lerTokenHe()) {
            renderizarDesbloqueioHe();
            return;
        }

        alvo.innerHTML = `<div class="text-center py-5 text-muted"><div class="spinner"></div> Carregando...</div>`;

        try {
            resumoHe = await rpcHe('he_meu_resumo');
            if (!resumoHe.eh_admin) abaHe = 'minhas';
            if (abaHe === 'equipe') painelHe = await rpcHe('he_admin_painel');
            renderizarHe();
        } catch (e) {
            if (e.message === ERRO_SESSAO) {
                renderizarDesbloqueioHe();
                return;
            }
            console.error('❌ [Horas Extras] Erro ao carregar:', e);
            alvo.innerHTML = `<div class="card text-center py-5 text-danger">Erro ao carregar: ${escHe(e.message)}</div>`;
        }
    }
    window.__carregarHorasExtras = carregarHe;

    function renderizarDesbloqueioHe() {
        const alvo = document.getElementById('heConteudo');
        if (!alvo) return;
        document.getElementById('heAbas')?.classList.add('hidden');

        alvo.innerHTML = `
            <div class="card he-desbloqueio">
                <i class="fas fa-lock he-desbloqueio-icone"></i>
                <h3>Área protegida</h3>
                <p class="text-muted">Por segurança, confirme sua senha para ver seus valores.</p>
                <form id="heFormDesbloqueio" autocomplete="off">
                    <input type="password" id="heSenhaDesbloqueio" class="form-control" placeholder="Sua senha" autocomplete="current-password" required>
                    <button type="submit" class="btn btn-primary" id="heBtnDesbloqueio"><i class="fas fa-unlock"></i> Entrar</button>
                </form>
            </div>
        `;

        const form = document.getElementById('heFormDesbloqueio');
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const btn = document.getElementById('heBtnDesbloqueio');
            const senha = document.getElementById('heSenhaDesbloqueio').value;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            let ok = false;
            try { ok = await window.horasExtrasAbrirSessao(usernameHe(), senha); } catch (_) { ok = false; }
            if (ok) {
                carregarHe();
            } else {
                toastHe('❌ Senha incorreta (ou o módulo ainda não foi instalado no banco).', 'error');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-unlock"></i> Entrar';
            }
        });
        setTimeout(() => document.getElementById('heSenhaDesbloqueio')?.focus(), 50);
    }

    // ============================================================
    // TELA
    // ============================================================

    function renderizarHe() {
        const abas = document.getElementById('heAbas');
        if (abas) {
            abas.classList.toggle('hidden', !resumoHe?.eh_admin);
            abas.querySelectorAll('[data-he-aba]').forEach(b => {
                b.classList.toggle('active', b.dataset.heAba === abaHe);
            });
        }
        if (abaHe === 'equipe') renderizarEquipeHe();
        else renderizarMinhasHe();
    }

    window.trocarAbaHorasExtras = function (aba) {
        abaHe = aba;
        carregarHe();
    };

    // ---------- MINHAS HORAS ----------

    function renderizarMinhasHe() {
        const alvo = document.getElementById('heConteudo');
        const sal = resumoHe?.salario;
        const lanc = resumoHe?.lancamentos || [];

        const aReceber = lanc.filter(l => !l.pago).reduce((s, l) => s + Number(l.valor), 0);
        const minPendentes = lanc.filter(l => !l.pago).reduce((s, l) => s + Number(l.minutos), 0);
        const recebido = lanc.filter(l => l.pago).reduce((s, l) => s + Number(l.valor), 0);
        const valorHora = sal ? Number(sal.salario_base) / Number(sal.carga_horaria_mensal) : 0;

        const meses = [...new Set(lanc.map(l => String(l.data).slice(0, 7)))].sort().reverse();
        if (filtroMesHe && !meses.includes(filtroMesHe)) filtroMesHe = '';
        const filtrados = filtroMesHe ? lanc.filter(l => String(l.data).startsWith(filtroMesHe)) : lanc;

        alvo.innerHTML = `
            ${sal ? '' : `
                <div class="card he-aviso">
                    <i class="fas fa-info-circle"></i> Seu salário base ainda não foi cadastrado. Assim que um administrador cadastrar, seus valores aparecem aqui.
                </div>
            `}

            <div class="he-cards">
                <div class="he-card he-card-destaque">
                    <div class="he-card-rotulo">A receber</div>
                    <div class="he-card-valor">${brl(aReceber)}</div>
                    <div class="he-card-sub">${fmtMinutos(minPendentes)} em horas extras</div>
                </div>
                <div class="he-card">
                    <div class="he-card-rotulo">Já recebido</div>
                    <div class="he-card-valor">${brl(recebido)}</div>
                </div>
                <div class="he-card">
                    <div class="he-card-rotulo">Salário base</div>
                    <div class="he-card-valor">${sal ? brl(sal.salario_base) : '—'}</div>
                    <div class="he-card-sub">${sal ? `${Number(sal.carga_horaria_mensal)}h por mês` : ''}</div>
                </div>
                <div class="he-card">
                    <div class="he-card-rotulo">Valor da sua hora</div>
                    <div class="he-card-valor">${sal ? brl(valorHora) : '—'}</div>
                    <div class="he-card-sub">${sal ? `Hora extra 50%: ${brl(valorHora * 1.5)}` : ''}</div>
                </div>
            </div>

            <div class="card">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                    <h3 style="margin:0;"><i class="fas fa-list"></i> Minhas horas extras</h3>
                    ${meses.length ? `
                        <select class="form-control form-control-sm" style="width:200px;" onchange="window.filtrarMesHorasExtras(this.value)">
                            <option value="">Todos os meses</option>
                            ${meses.map(m => `<option value="${m}" ${m === filtroMesHe ? 'selected' : ''}>${escHe(nomeMes(m))}</option>`).join('')}
                        </select>
                    ` : ''}
                </div>
                ${tabelaLancamentosHe(filtrados, false)}
            </div>
        `;
    }

    window.filtrarMesHorasExtras = function (mes) {
        filtroMesHe = mes || '';
        renderizarMinhasHe();
    };

    function tabelaLancamentosHe(lista, modoAdmin) {
        if (!lista.length) {
            return `<div class="text-center py-4 text-muted"><i class="fas fa-business-time fa-2x mb-2" style="opacity:.4;"></i><br>Nenhuma hora extra lançada.</div>`;
        }

        const totalMin = lista.reduce((s, l) => s + Number(l.minutos), 0);
        const totalValor = lista.reduce((s, l) => s + Number(l.valor), 0);

        return `
            <div class="he-tabela-wrap">
                <table class="he-tabela">
                    <thead>
                        <tr>
                            ${modoAdmin ? '<th style="width:28px;"><input type="checkbox" onchange="window.selecionarTodosHorasExtras(this.checked)"></th>' : ''}
                            <th>Data</th>
                            <th>Horas</th>
                            <th>Adicional</th>
                            <th>Valor</th>
                            <th>Status</th>
                            <th>Observação</th>
                            ${modoAdmin ? '<th></th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(l => `
                            <tr>
                                ${modoAdmin ? `<td><input type="checkbox" class="he-sel" value="${l.id}"></td>` : ''}
                                <td>${fmtData(l.data)}</td>
                                <td>${fmtMinutos(l.minutos)}</td>
                                <td>${Number(l.percentual)}%</td>
                                <td><strong>${brl(l.valor)}</strong></td>
                                <td>${l.pago
                                    ? `<span class="he-badge he-badge-pago" title="${l.pago_em ? 'Pago em ' + escHe(new Date(l.pago_em).toLocaleDateString('pt-BR')) : ''}">Pago</span>`
                                    : '<span class="he-badge he-badge-pendente">A receber</span>'}</td>
                                <td class="he-obs">${escHe(l.observacao || '')}</td>
                                ${modoAdmin ? `<td><button class="btn btn-sm btn-outline-danger" title="Excluir" onclick="window.excluirLancamentoHorasExtras(${l.id})"><i class="fas fa-trash"></i></button></td>` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            ${modoAdmin ? '<td></td>' : ''}
                            <td>Total</td>
                            <td>${fmtMinutos(totalMin)}</td>
                            <td></td>
                            <td><strong>${brl(totalValor)}</strong></td>
                            <td colspan="${modoAdmin ? 3 : 2}"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
    }

    // ---------- EQUIPE (ADMIN) ----------

    function renderizarEquipeHe() {
        const alvo = document.getElementById('heConteudo');
        const totalAReceber = painelHe.reduce((s, p) => s + Number(p.a_receber), 0);
        const semSalario = painelHe.filter(p => p.salario_base == null).length;

        alvo.innerHTML = `
            <div class="he-cards">
                <div class="he-card he-card-destaque">
                    <div class="he-card-rotulo">Total a pagar (equipe)</div>
                    <div class="he-card-valor">${brl(totalAReceber)}</div>
                </div>
                <div class="he-card">
                    <div class="he-card-rotulo">Pessoas sem salário cadastrado</div>
                    <div class="he-card-valor">${semSalario}</div>
                </div>
            </div>

            <div class="card">
                <h3 style="margin-top:0;"><i class="fas fa-users"></i> Equipe</h3>
                <div class="he-tabela-wrap">
                    <table class="he-tabela">
                        <thead>
                            <tr>
                                <th>Pessoa</th>
                                <th>Salário base</th>
                                <th>Valor hora</th>
                                <th>Horas a receber</th>
                                <th>A receber</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${painelHe.map(p => {
                                const temSal = p.salario_base != null;
                                const vh = temSal ? Number(p.salario_base) / Number(p.carga_horaria_mensal) : 0;
                                const u = escHe(p.username);
                                return `
                                    <tr>
                                        <td><strong>${escHe(p.nome)}</strong><br><small class="text-muted">@${u}</small></td>
                                        <td>${temSal ? brl(p.salario_base) : '<span class="text-muted">não cadastrado</span>'}</td>
                                        <td>${temSal ? brl(vh) : '—'}</td>
                                        <td>${fmtMinutos(p.minutos_pendentes)}</td>
                                        <td><strong>${brl(p.a_receber)}</strong></td>
                                        <td class="he-acoes">
                                            <button class="btn btn-sm btn-outline-primary" onclick="window.abrirSalarioHorasExtras('${u}')"><i class="fas fa-money-bill"></i> Salário</button>
                                            <button class="btn btn-sm btn-success" ${temSal ? '' : 'disabled title="Cadastre o salário primeiro"'} onclick="window.abrirLancamentoHorasExtras('${u}')"><i class="fas fa-plus"></i> Lançar horas</button>
                                            <button class="btn btn-sm btn-secondary" onclick="window.abrirPessoaHorasExtras('${u}')"><i class="fas fa-list"></i> Lançamentos</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function pessoaHe(username) {
        return painelHe.find(p => p.username === username) || null;
    }

    function abrirModalHe(id, larguraMax, html) {
        document.getElementById(id)?.remove();
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.innerHTML = `<div class="modal-content" style="max-width:${larguraMax}px;">${html}</div>`;
        document.body.appendChild(modal);
        return modal;
    }

    // ---------- SALÁRIO ----------

    window.abrirSalarioHorasExtras = function (username) {
        const p = pessoaHe(username);
        if (!p) return;

        abrirModalHe('heModalSalario', 440, `
            <h3 style="margin-top:0;"><i class="fas fa-money-bill"></i> Salário base — ${escHe(p.nome)}</h3>
            <div class="form-group">
                <label>Salário base (R$) *</label>
                <input type="text" id="heSalValor" class="form-control" inputmode="decimal" placeholder="Ex.: 2500,00" value="${p.salario_base != null ? String(Number(p.salario_base).toFixed(2)).replace('.', ',') : ''}">
            </div>
            <div class="form-group">
                <label>Horas por mês <small class="text-muted">(220 = 44h semanais, padrão CLT)</small></label>
                <input type="number" id="heSalCarga" class="form-control" min="1" step="1" value="${p.carga_horaria_mensal != null ? Number(p.carga_horaria_mensal) : 220}">
            </div>
            <div class="text-muted" style="font-size:12px;">Mudar o salário vale para as próximas horas lançadas. As que já foram lançadas mantêm o valor da época.</div>
            <div class="d-flex justify-content-end gap-2 mt-3">
                <button class="btn btn-secondary" onclick="document.getElementById('heModalSalario').remove()">Cancelar</button>
                <button class="btn btn-primary" id="heBtnSalvarSal" onclick="window.salvarSalarioHorasExtras('${escHe(p.username)}')"><i class="fas fa-save"></i> Salvar</button>
            </div>
        `);
        setTimeout(() => document.getElementById('heSalValor')?.focus(), 50);
    };

    function lerValorBR(texto) {
        let t = String(texto || '').trim().replace(/[R$\s]/g, '');
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        const n = Number(t);
        return Number.isFinite(n) ? n : NaN;
    }

    window.salvarSalarioHorasExtras = async function (username) {
        const salario = lerValorBR(document.getElementById('heSalValor').value);
        const carga = Number(document.getElementById('heSalCarga').value);
        if (!(salario > 0)) { toastHe('Informe um salário válido.', 'warning'); return; }
        if (!(carga > 0)) { toastHe('Informe as horas por mês.', 'warning'); return; }

        const btn = document.getElementById('heBtnSalvarSal');
        btn.disabled = true;
        try {
            await rpcHe('he_admin_definir_salario', {
                p_username: username, p_salario_base: salario, p_carga_horaria_mensal: carga
            });
            toastHe('✅ Salário salvo!', 'success');
            document.getElementById('heModalSalario')?.remove();
            await carregarHe();
        } catch (e) {
            tratarErroHe(e, 'salvar o salário');
            btn.disabled = false;
        }
    };

    // ---------- LANÇAR HORAS ----------

    window.abrirLancamentoHorasExtras = function (username) {
        const p = pessoaHe(username);
        if (!p || p.salario_base == null) return;

        abrirModalHe('heModalLancamento', 460, `
            <h3 style="margin-top:0;"><i class="fas fa-business-time"></i> Lançar horas — ${escHe(p.nome)}</h3>
            <div class="form-group">
                <label>Data *</label>
                <input type="date" id="heLanData" class="form-control" value="${hojeIso()}">
            </div>
            <div class="form-group">
                <label>Horas extras * <small class="text-muted">(ex.: 2:30, 1h45, 1,5)</small></label>
                <input type="text" id="heLanHoras" class="form-control" placeholder="2:00" oninput="window.atualizarPreviaHorasExtras()">
            </div>
            <div class="form-group">
                <label>Adicional</label>
                <select id="heLanPercSel" class="form-control" onchange="window.atualizarPreviaHorasExtras()">
                    ${PERCENTUAIS.map(o => `<option value="${o.valor}">${o.texto}</option>`).join('')}
                    <option value="outro">Outro…</option>
                </select>
                <input type="number" id="heLanPercOutro" class="form-control mt-1 hidden" min="0" step="1" placeholder="Percentual (%)" oninput="window.atualizarPreviaHorasExtras()">
            </div>
            <div class="form-group">
                <label>Observação</label>
                <input type="text" id="heLanObs" class="form-control" placeholder="Opcional — ex.: inventário, evento">
            </div>
            <div id="heLanPrevia" class="he-previa"></div>
            <div class="d-flex justify-content-end gap-2 mt-3">
                <button class="btn btn-secondary" onclick="document.getElementById('heModalLancamento').remove()">Cancelar</button>
                <button class="btn btn-success" id="heBtnLancar" onclick="window.salvarLancamentoHorasExtras('${escHe(p.username)}')"><i class="fas fa-plus"></i> Lançar</button>
            </div>
        `).dataset.username = p.username;

        window.atualizarPreviaHorasExtras();
        setTimeout(() => document.getElementById('heLanHoras')?.focus(), 50);
    };

    function percentualLancamentoHe() {
        const sel = document.getElementById('heLanPercSel');
        const outro = document.getElementById('heLanPercOutro');
        outro.classList.toggle('hidden', sel.value !== 'outro');
        return sel.value === 'outro' ? Number(outro.value) : Number(sel.value);
    }

    window.atualizarPreviaHorasExtras = function () {
        const modal = document.getElementById('heModalLancamento');
        const previa = document.getElementById('heLanPrevia');
        if (!modal || !previa) return;
        const p = pessoaHe(modal.dataset.username);
        const minutos = lerMinutos(document.getElementById('heLanHoras').value);
        const perc = percentualLancamentoHe();
        if (!p || !(minutos > 0) || !(perc >= 0)) {
            previa.innerHTML = '';
            return;
        }
        const vh = Number(p.salario_base) / Number(p.carga_horaria_mensal);
        const valor = minutos / 60 * vh * (1 + perc / 100);
        previa.innerHTML = `${fmtMinutos(minutos)} × ${brl(vh)} + ${perc}% = <strong>${brl(valor)}</strong>`;
    };

    window.salvarLancamentoHorasExtras = async function (username) {
        const data = document.getElementById('heLanData').value;
        const minutos = lerMinutos(document.getElementById('heLanHoras').value);
        const perc = percentualLancamentoHe();
        const obs = document.getElementById('heLanObs').value.trim();

        if (!data) { toastHe('Informe a data.', 'warning'); return; }
        if (!(minutos > 0) || minutos > 24 * 60) { toastHe('Informe as horas (ex.: 2:30).', 'warning'); return; }
        if (!(perc >= 0)) { toastHe('Informe o percentual.', 'warning'); return; }

        const btn = document.getElementById('heBtnLancar');
        btn.disabled = true;
        try {
            await rpcHe('he_admin_lancar', {
                p_username: username, p_data: data, p_minutos: minutos,
                p_percentual: perc, p_observacao: obs || null
            });
            toastHe('✅ Horas lançadas!', 'success');
            document.getElementById('heModalLancamento')?.remove();
            await carregarHe();
        } catch (e) {
            tratarErroHe(e, 'lançar as horas');
            btn.disabled = false;
        }
    };

    // ---------- LANÇAMENTOS DE UMA PESSOA ----------

    window.abrirPessoaHorasExtras = async function (username) {
        const p = pessoaHe(username);
        if (!p) return;
        pessoaAbertaHe = p;

        abrirModalHe('heModalPessoa', 860, `<div id="hePessoaConteudo"><div class="text-center py-4 text-muted"><div class="spinner"></div> Carregando...</div></div>`);
        await recarregarPessoaHe();
    };

    async function recarregarPessoaHe() {
        const alvo = document.getElementById('hePessoaConteudo');
        if (!alvo || !pessoaAbertaHe) return;
        try {
            lancamentosPessoaHe = await rpcHe('he_admin_lancamentos', { p_username: pessoaAbertaHe.username });
        } catch (e) {
            tratarErroHe(e, 'carregar os lançamentos');
            return;
        }
        const aReceber = lancamentosPessoaHe.filter(l => !l.pago).reduce((s, l) => s + Number(l.valor), 0);

        alvo.innerHTML = `
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                <div>
                    <h3 style="margin:0;"><i class="fas fa-list"></i> ${escHe(pessoaAbertaHe.nome)}</h3>
                    <div class="text-muted" style="font-size:13px;">A receber: <strong>${brl(aReceber)}</strong></div>
                </div>
                <button class="btn btn-secondary btn-sm" onclick="document.getElementById('heModalPessoa').remove()">Fechar</button>
            </div>
            ${lancamentosPessoaHe.length ? `
                <div class="d-flex gap-2 flex-wrap mb-2">
                    <button class="btn btn-sm btn-success" onclick="window.marcarPagoHorasExtras(true)"><i class="fas fa-check"></i> Marcar selecionados como pagos</button>
                    <button class="btn btn-sm btn-outline-secondary" onclick="window.marcarPagoHorasExtras(false)"><i class="fas fa-undo"></i> Voltar para "a receber"</button>
                </div>
            ` : ''}
            ${tabelaLancamentosHe(lancamentosPessoaHe, true)}
        `;
    }

    window.selecionarTodosHorasExtras = function (marcado) {
        document.querySelectorAll('#hePessoaConteudo .he-sel').forEach(c => { c.checked = marcado; });
    };

    window.marcarPagoHorasExtras = async function (pago) {
        const ids = [...document.querySelectorAll('#hePessoaConteudo .he-sel:checked')].map(c => Number(c.value));
        if (!ids.length) { toastHe('Selecione ao menos um lançamento.', 'warning'); return; }
        try {
            await rpcHe('he_admin_marcar_pago', { p_ids: ids, p_pago: pago });
            toastHe(pago ? '✅ Marcado como pago.' : '↩️ Voltou para "a receber".', 'success');
            await recarregarPessoaHe();
            await carregarHe();
        } catch (e) {
            tratarErroHe(e, 'atualizar o pagamento');
        }
    };

    window.excluirLancamentoHorasExtras = async function (id) {
        const l = lancamentosPessoaHe.find(x => x.id === id);
        if (!l) return;
        if (!confirm(`Excluir o lançamento de ${fmtMinutos(l.minutos)} em ${fmtData(l.data)} (${brl(l.valor)})?`)) return;
        try {
            await rpcHe('he_admin_excluir_lancamento', { p_id: id });
            toastHe('🗑️ Lançamento excluído.', 'success');
            await recarregarPessoaHe();
            await carregarHe();
        } catch (e) {
            tratarErroHe(e, 'excluir');
        }
    };

    function tratarErroHe(e, acao) {
        if (e.message === ERRO_SESSAO) {
            document.querySelectorAll('#heModalSalario, #heModalLancamento, #heModalPessoa').forEach(m => m.remove());
            toastHe('🔒 Sua sessão do módulo expirou. Confirme a senha.', 'warning');
            renderizarDesbloqueioHe();
            return;
        }
        if (String(e.message || '').includes('SEM_PERMISSAO_HE')) {
            toastHe('🔒 Apenas administradores podem fazer isso.', 'warning');
            return;
        }
        console.error(`❌ [Horas Extras] Erro ao ${acao}:`, e);
        toastHe(`Erro ao ${acao}: ${e.message}`, 'error');
    }

    // ============================================================
    // CSS
    // ============================================================

    function injetarCssHe() {
        if (document.getElementById('horasExtrasCSS')) return;
        const style = document.createElement('style');
        style.id = 'horasExtrasCSS';
        style.textContent = `
            .he-abas { display: flex; gap: 6px; }
            .he-abas .btn.active { background: #082b5b; color: #fff; border-color: #082b5b; }
            .he-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-bottom: 16px; }
            .he-card { background: #fff; border: 1px solid #e9ecef; border-radius: 10px; padding: 14px 16px; }
            .he-card-destaque { background: #eef6ff; border-color: #bdd9ff; }
            .he-card-rotulo { font-size: 12px; color: #6c757d; text-transform: uppercase; letter-spacing: .03em; }
            .he-card-valor { font-size: 24px; font-weight: 700; color: #082b5b; margin-top: 4px; font-variant-numeric: tabular-nums; }
            .he-card-sub { font-size: 12px; color: #6c757d; margin-top: 2px; }
            .he-aviso { background: #fff3cd; border-color: #ffe69c; color: #664d03; margin-bottom: 16px; }
            .he-tabela-wrap { overflow-x: auto; }
            .he-tabela { width: 100%; border-collapse: collapse; font-size: 13px; }
            .he-tabela th { text-align: left; font-size: 11px; text-transform: uppercase; color: #6c757d; padding: 8px; border-bottom: 2px solid #e9ecef; white-space: nowrap; }
            .he-tabela td { padding: 8px; border-bottom: 1px solid #f1f3f5; vertical-align: middle; font-variant-numeric: tabular-nums; }
            .he-tabela tfoot td { font-weight: 700; border-top: 2px solid #e9ecef; border-bottom: none; }
            .he-obs { color: #6c757d; max-width: 260px; }
            .he-acoes { white-space: nowrap; text-align: right; }
            .he-acoes .btn { margin-left: 4px; }
            .he-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
            .he-badge-pendente { background: #fff3cd; color: #856404; }
            .he-badge-pago { background: #d1e7dd; color: #0f5132; }
            .he-previa { background: #f8f9fa; border-radius: 8px; padding: 10px 12px; font-size: 13px; min-height: 18px; }
            .he-previa:empty { display: none; }
            .he-desbloqueio { max-width: 380px; margin: 40px auto; text-align: center; }
            .he-desbloqueio-icone { font-size: 32px; color: #082b5b; opacity: .7; margin-bottom: 8px; }
            .he-desbloqueio form { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        `;
        document.head.appendChild(style);
    }

    function criarTelaHe() {
        if (document.getElementById('horasExtrasSystem')) return;

        const div = document.createElement('div');
        div.id = 'horasExtrasSystem';
        div.className = 'hidden';
        div.innerHTML = `
            <header class="main-header">
                <div class="container">
                    <div class="header-content">
                        <h1 style="display:flex; align-items:center; gap:10px;">
                            <img src="logo.png" alt="Wheel Tech" style="height:35px; width:auto;">
                            Horas Extras
                        </h1>
                    </div>
                </div>
            </header>

            <div class="container">
                <div class="card mb-3">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div id="heAbas" class="he-abas hidden">
                            <button class="btn btn-outline-primary" data-he-aba="minhas" onclick="window.trocarAbaHorasExtras('minhas')"><i class="fas fa-user"></i> Minhas horas</button>
                            <button class="btn btn-outline-primary" data-he-aba="equipe" onclick="window.trocarAbaHorasExtras('equipe')"><i class="fas fa-users"></i> Gerenciar equipe</button>
                        </div>
                        <div class="d-flex gap-2" style="margin-left:auto;">
                            <button class="btn btn-secondary" onclick="voltarParaMenu()"><i class="fas fa-arrow-left"></i> Voltar</button>
                            <button class="btn btn-info" onclick="window.__carregarHorasExtras()"><i class="fas fa-sync-alt"></i> Atualizar</button>
                        </div>
                    </div>
                </div>

                <div id="heConteudo"></div>
            </div>
        `;
        document.body.appendChild(div);
    }

    window.abrirSistemaHorasExtras = async function () {
        if (!window.currentUser) {
            toastHe('⚠️ Faça login primeiro', 'warning');
            return;
        }

        injetarCssHe();
        criarTelaHe();

        if (typeof esconderTodosOsSistemas === 'function') {
            esconderTodosOsSistemas('horasExtrasSystem');
        }
        document.getElementById('horasExtrasSystem')?.classList.remove('hidden');

        await carregarHe();
    };

})();
