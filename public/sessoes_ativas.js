// ============================================================
// SESSÕES ATIVAS — quem está conectado e desconexão pelo admin
// ============================================================
// - Cada navegador logado avisa o banco a cada 30 s (tabela
//   sessoes_ativas) que continua ali.
// - No Histórico de Acessos, a aba "Conectados agora" lista essas
//   sessões e permite desconectar uma pessoa de propósito.
// - Quando o admin desconecta, a sessão é marcada como revogada; no
//   próximo aviso (até 30 s) o navegador da pessoa é deslogado.
// ============================================================

(function () {
    'use strict';

    const TABELA = 'sessoes_ativas';
    const CHAVE_LOCAL = 'wheeltech_session_id';
    const INTERVALO_BATIMENTO_MS = 30 * 1000;
    const ONLINE_ATE_MS = 90 * 1000;              // visto há menos que isso = online
    const JANELA_LISTA_MS = 12 * 60 * 60 * 1000;  // lista quem foi visto nas últimas 12 h
    const ADMINS_DESCONEXAO = ['andressamiotto', 'ronald'];

    let tabelaIndisponivel = false;
    let derrubando = false;
    let batendo = false;
    let temporizadorLista = null;

    function sb() { return window.supabaseClient || null; }
    function usuarioAtual() {
        return String(window.currentUser?.username || '').trim().toLowerCase();
    }
    function esc(v) {
        return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function toast(msg, tipo) {
        if (window.showToast) window.showToast(msg, tipo || 'info');
    }
    function erroDeTabela(erro) {
        return /does not exist|schema cache|relation/i.test(String(erro?.message || erro || ''));
    }

    // ---------- id da sessão deste navegador ----------
    function lerIdLocal() {
        try { return JSON.parse(localStorage.getItem(CHAVE_LOCAL) || 'null'); }
        catch (_) { return null; }
    }
    function novoId() {
        try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (_) { /* sem crypto */ }
        return 's-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }
    // Um id por (navegador, usuário): trocou de usuário = sessão nova.
    function idDestaSessao(criar) {
        const u = usuarioAtual();
        const guardado = lerIdLocal();
        if (guardado && guardado.id && guardado.username === u) return guardado.id;
        if (!criar) return null;
        // Outra pessoa entrou neste navegador: a sessão anterior acabou.
        if (guardado && guardado.id && sb() && !tabelaIndisponivel) {
            sb().from(TABELA).update({ encerrada_em: new Date().toISOString() }).eq('session_id', guardado.id).then(() => {}, () => {});
        }
        const id = novoId();
        try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify({ id, username: u })); } catch (_) { /* sem storage */ }
        return id;
    }
    window.idSessaoAtual = () => (lerIdLocal() || {}).id || null;

    // ---------- lado do usuário: batimento e desconexão forçada ----------
    function derrubarEsteNavegador(por) {
        if (derrubando) return;
        derrubando = true;
        try { if (typeof clearSessionStorage === 'function') clearSessionStorage(); } catch (_) { /* segue */ }
        try { localStorage.removeItem(CHAVE_LOCAL); } catch (_) { /* segue */ }
        toast(`⛔ Você foi desconectado por ${por || 'um administrador'}.`, 'error');
        setTimeout(() => location.reload(), 1800);
    }

    async function encerrarSessaoLocalSeExistir() {
        const guardado = lerIdLocal();
        if (!guardado || !guardado.id || !sb() || tabelaIndisponivel) return;
        try {
            await sb().from(TABELA)
                .update({ encerrada_em: new Date().toISOString() })
                .eq('session_id', guardado.id);
        } catch (_) { /* não atrapalha o logout */ }
        try { localStorage.removeItem(CHAVE_LOCAL); } catch (_) { /* segue */ }
    }

    async function batimento() {
        if (batendo || derrubando || tabelaIndisponivel || !sb()) return;
        batendo = true;
        try {
            const usuario = usuarioAtual();
            if (!usuario) {
                await encerrarSessaoLocalSeExistir();
                return;
            }

            const id = idDestaSessao(true);
            const agora = new Date().toISOString();

            const { data, error } = await sb().from(TABELA)
                .update({ last_seen: agora, encerrada_em: null })
                .eq('session_id', id)
                .select('revogada_em, revogada_por');

            if (error) {
                if (erroDeTabela(error)) tabelaIndisponivel = true;
                return;
            }

            if (data && data.length) {
                if (data[0].revogada_em) derrubarEsteNavegador(data[0].revogada_por);
                return;
            }

            let ip = null;
            try { if (typeof getClientIP === 'function') ip = await getClientIP(); } catch (_) { /* sem ip */ }

            const { error: erroInsert } = await sb().from(TABELA).insert([{
                session_id: id,
                username: usuario,
                user_name: window.currentUser?.name || usuario,
                ip_address: ip,
                user_agent: (navigator.userAgent || '').slice(0, 300),
                login_time: agora,
                last_seen: agora
            }]);
            if (erroInsert && erroDeTabela(erroInsert)) tabelaIndisponivel = true;
        } catch (_) {
            /* offline não derruba ninguém */
        } finally {
            batendo = false;
        }
    }

    setInterval(batimento, INTERVALO_BATIMENTO_MS);
    setTimeout(batimento, 4000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') batimento();
    });

    // ---------- lado do admin ----------
    function podeGerenciar() {
        return ADMINS_DESCONEXAO.includes(usuarioAtual());
    }

    function textoHa(ms) {
        const min = Math.max(0, Math.round(ms / 60000));
        if (min < 1) return 'agora há pouco';
        if (min < 60) return `há ${min} min`;
        const h = Math.floor(min / 60);
        return `há ${h} h ${String(min % 60).padStart(2, '0')} min`;
    }

    function navegadorCurto(ua) {
        const t = String(ua || '');
        const nav = /Edg\//.test(t) ? 'Edge' : /OPR\//.test(t) ? 'Opera' : /Chrome\//.test(t) ? 'Chrome'
            : /Firefox\//.test(t) ? 'Firefox' : /Safari\//.test(t) ? 'Safari' : 'Navegador';
        const so = /Windows/.test(t) ? 'Windows' : /Android/.test(t) ? 'Android'
            : /iPhone|iPad/.test(t) ? 'iOS' : /Mac OS/.test(t) ? 'Mac' : /Linux/.test(t) ? 'Linux' : '';
        return so ? `${nav} · ${so}` : nav;
    }

    window.carregarSessoesConectadas = async function () {
        const corpo = document.getElementById('haSessoesBody');
        if (!corpo) return;

        if (!podeGerenciar()) {
            corpo.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Sem permissão.</td></tr>';
            return;
        }
        if (!sb()) return;

        const desde = new Date(Date.now() - JANELA_LISTA_MS).toISOString();
        const { data, error } = await sb().from(TABELA)
            .select('*')
            .is('revogada_em', null)
            .is('encerrada_em', null)
            .gte('last_seen', desde)
            .order('last_seen', { ascending: false })
            .limit(200);

        if (error) {
            corpo.innerHTML = erroDeTabela(error)
                ? '<tr><td colspan="6" class="text-center text-danger">A tabela <strong>sessoes_ativas</strong> ainda não existe. Rode o arquivo <strong>sessoes_ativas.sql</strong> no Supabase.</td></tr>'
                : `<tr><td colspan="6" class="text-center text-danger">Erro ao carregar: ${esc(error.message)}</td></tr>`;
            return;
        }

        const meuId = (lerIdLocal() || {}).id;
        const agora = Date.now();

        if (!data || !data.length) {
            corpo.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Ninguém conectado no momento.</td></tr>';
            return;
        }

        corpo.innerHTML = data.map(s => {
            const visto = agora - new Date(s.last_seen).getTime();
            const online = visto <= ONLINE_ATE_MS;
            const ehEsta = s.session_id === meuId;
            const botao = ehEsta
                ? '<span class="text-muted" style="font-size:12px;">esta é a sua sessão</span>'
                : `<button type="button" class="btn btn-sm btn-danger" data-desconectar="${esc(s.session_id)}" data-nome="${esc(s.user_name || s.username)}">
                        <i class="fas fa-sign-out-alt"></i> Desconectar
                   </button>`;
            return `
                <tr>
                    <td><strong>${esc(s.user_name || s.username)}</strong><br><small class="text-muted">${esc(s.username)}</small></td>
                    <td>${online
                        ? '<span class="badge badge-success" style="background:#198754;color:#fff;">● Online</span>'
                        : `<span class="badge badge-secondary" style="background:#6c757d;color:#fff;">Inativo</span><br><small class="text-muted">visto ${textoHa(visto)}</small>`}</td>
                    <td>${esc(s.ip_address || '-')}</td>
                    <td>${new Date(s.login_time).toLocaleString('pt-BR')}</td>
                    <td>${esc(navegadorCurto(s.user_agent))}</td>
                    <td>${botao}</td>
                </tr>`;
        }).join('');

        corpo.querySelectorAll('[data-desconectar]').forEach(b => {
            b.addEventListener('click', () => window.desconectarSessaoUsuario(b.dataset.desconectar, b.dataset.nome));
        });
    };

    window.desconectarSessaoUsuario = async function (sessionId, nome) {
        if (!podeGerenciar()) {
            toast('🔒 Só administradores podem desconectar usuários.', 'warning');
            return;
        }
        if (!sessionId || !sb()) return;
        if (sessionId === (lerIdLocal() || {}).id) {
            toast('Você não pode desconectar a própria sessão por aqui. Use "Sair".', 'warning');
            return;
        }
        if (!confirm(`Desconectar ${nome || 'este usuário'} agora?\n\nA pessoa será deslogada em até 30 segundos e precisará entrar de novo.`)) return;

        const { error } = await sb().from(TABELA)
            .update({
                revogada_em: new Date().toISOString(),
                revogada_por: window.currentUser?.name || usuarioAtual()
            })
            .eq('session_id', sessionId);

        if (error) {
            toast('❌ Não foi possível desconectar: ' + error.message, 'error');
            return;
        }

        toast(`✅ ${nome || 'Usuário'} será desconectado(a) em instantes.`, 'success');
        window.carregarSessoesConectadas();
    };

    // Atualiza a lista sozinha enquanto a aba está aberta
    window.iniciarAbaSessoesConectadas = function () {
        window.carregarSessoesConectadas();
        clearInterval(temporizadorLista);
        temporizadorLista = setInterval(() => {
            const aba = document.getElementById('haAbaConectados');
            if (!aba || aba.classList.contains('hidden')) {
                clearInterval(temporizadorLista);
                temporizadorLista = null;
                return;
            }
            window.carregarSessoesConectadas();
        }, 15000);
    };
})();
