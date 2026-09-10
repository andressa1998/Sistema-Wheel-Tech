/* ============================================================
   WHEEL TECH · Gestão de usuários
   ------------------------------------------------------------
   - "Lista de usuários" na engrenagem (ativos / pendentes /
     recusados / bloqueados)
   - Aprovar / recusar cadastros
   - Bloquear / desbloquear funcionário
   - Trocar cargo
   - Colocar foto no avatar
   - Sininho de "cadastro pendente" para administradores

   O login em si e o carregamento inicial de SYSTEM_USERS ficam
   no script.js. Este arquivo cuida só da parte visual/gestão.
   ============================================================ */
(function () {
    'use strict';

    const SALT = 'wheeltech-2026';
    const CARGOS_SUGERIDOS = [
        'Administrador', 'Comercial', 'Fotógrafa', 'Midia',
        'Assistente', 'Assistente 2', 'Assistente 3', 'Assistente 4'
    ];

    let cacheUsuarios = [];
    let abaAtual = 'pendentes';
    let timerSino = null;

    // ---------------------------------------------------------
    // BÁSICO
    // ---------------------------------------------------------
    function sb() {
        return window.supabaseClient || null;
    }

    function ehAdmin() {
        const r = (window.currentUser && window.currentUser.role) || '';
        return String(r).toLowerCase() === 'administrador';
    }

    function nomeAdminAtual() {
        return (window.currentUser && (window.currentUser.name || window.currentUser.username)) || 'admin';
    }

    async function hashSenha(username, senha) {
        if (typeof window.wtHashSenha === 'function') {
            return window.wtHashSenha(username, senha);
        }
        const texto = String(username || '').trim().toLowerCase() + ':' + String(senha || '') + ':' + SALT;
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(msg, tipo) {
        if (typeof window.showToast === 'function') window.showToast(msg, tipo || 'info');
        else console.log('[usuarios]', msg);
    }

    function formatarData(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        } catch (e) { return '—'; }
    }

    // ---------------------------------------------------------
    // DADOS
    // ---------------------------------------------------------
    async function carregar() {
        const cli = sb();
        if (!cli) return [];
        const { data, error } = await cli
            .from('usuarios')
            .select('id, username, nome, avatar, avatar_foto, role, status, email, criado_em, aprovado_por, aprovado_em')
            .order('criado_em', { ascending: true });
        if (error) {
            console.warn('[usuarios] erro ao carregar:', error);
            return cacheUsuarios;
        }
        cacheUsuarios = data || [];
        return cacheUsuarios;
    }

    async function atualizarUsuario(id, campos) {
        const cli = sb();
        if (!cli) { toast('Sem conexão com o banco.', 'error'); return false; }
        campos.atualizado_em = new Date().toISOString();
        const { error } = await cli.from('usuarios').update(campos).eq('id', id);
        if (error) {
            console.error('[usuarios] update falhou:', error);
            toast('Não foi possível salvar. ' + (error.message || ''), 'error');
            return false;
        }
        return true;
    }

    async function recarregarSystemUsers() {
        if (typeof window.carregarUsuariosDoBanco === 'function') {
            try { await window.carregarUsuariosDoBanco(); } catch (e) { /* ignora */ }
        }
    }

    // ---------------------------------------------------------
    // AÇÕES
    // ---------------------------------------------------------
    async function aprovar(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        const ok = await atualizarUsuario(id, {
            status: 'ativo',
            aprovado_por: nomeAdminAtual(),
            aprovado_em: new Date().toISOString()
        });
        if (ok) {
            toast('✅ ' + u.nome + ' liberado para entrar no sistema.', 'success');
            await carregar();
            await recarregarSystemUsers();
            render();
            atualizarSino();
        }
    }

    async function recusar(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        if (!confirm('Recusar o cadastro de "' + u.nome + '"?')) return;
        const ok = await atualizarUsuario(id, { status: 'recusado', aprovado_por: nomeAdminAtual() });
        if (ok) {
            toast('Cadastro de ' + u.nome + ' recusado.', 'info');
            await carregar(); render(); atualizarSino();
        }
    }

    async function bloquear(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        if (!confirm('Bloquear "' + u.nome + '"? A pessoa não vai mais conseguir entrar no sistema.')) return;
        const ok = await atualizarUsuario(id, { status: 'bloqueado', aprovado_por: nomeAdminAtual() });
        if (ok) {
            toast('🚫 ' + u.nome + ' foi bloqueado.', 'warning');
            await carregar(); await recarregarSystemUsers(); render();
        }
    }

    async function desbloquear(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        const ok = await atualizarUsuario(id, {
            status: 'ativo',
            aprovado_por: nomeAdminAtual(),
            aprovado_em: new Date().toISOString()
        });
        if (ok) {
            toast('✅ ' + u.nome + ' liberado novamente.', 'success');
            await carregar(); await recarregarSystemUsers(); render();
        }
    }

    async function reenviarParaPendente(id) {
        const ok = await atualizarUsuario(id, { status: 'pendente', aprovado_por: null, aprovado_em: null });
        if (ok) { await carregar(); render(); atualizarSino(); }
    }

    async function trocarCargo(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        const atual = u.role || '';
        const novo = prompt(
            'Cargo de ' + u.nome + '\n\nSugestões: ' + CARGOS_SUGERIDOS.join(', ') +
            '\n\n(escreva "Administrador" para dar acesso de administrador)',
            atual
        );
        if (novo == null) return;
        const limpo = novo.trim();
        if (!limpo || limpo === atual) return;
        const ok = await atualizarUsuario(id, { role: limpo });
        if (ok) {
            toast('Cargo de ' + u.nome + ' alterado para "' + limpo + '".', 'success');
            await carregar(); await recarregarSystemUsers(); render();
        }
    }

    async function redefinirSenha(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        const nova = prompt('Nova senha para ' + u.nome + ' (mínimo 4 caracteres):', '');
        if (nova == null) return;
        if (nova.trim().length < 4) { toast('Senha muito curta.', 'warning'); return; }
        const hash = await hashSenha(u.username, nova.trim());
        const ok = await atualizarUsuario(id, { senha_hash: hash });
        if (ok) toast('Senha de ' + u.nome + ' redefinida.', 'success');
    }

    // ---------------------------------------------------------
    // FOTO DO AVATAR
    // ---------------------------------------------------------
    function escolherFoto(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) { toast('Imagem muito grande (máx 8 MB).', 'warning'); return; }
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = async () => {
                    const base64 = redimensionar(img, 160);
                    const ok = await atualizarUsuario(id, {
                        avatar_foto: base64,
                        avatar: (u.nome || u.username || 'U').charAt(0).toUpperCase()
                    });
                    if (ok) {
                        toast('📷 Foto de ' + u.nome + ' atualizada.', 'success');
                        await carregar();
                        await recarregarSystemUsers();
                        // se for a própria pessoa logada, troca o avatar da tela
                        if (window.currentUser && window.currentUser.username === u.username) {
                            window.currentUser.avatarFoto = base64;
                            try {
                                const s = JSON.parse(localStorage.getItem('wheeltech_user') || '{}');
                                s.avatarFoto = base64;
                                localStorage.setItem('wheeltech_user', JSON.stringify(s));
                            } catch (e) { /* ignora */ }
                            if (typeof window.atualizarTodosAvatares === 'function') window.atualizarTodosAvatares();
                        }
                        render();
                    }
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    async function removerFoto(id) {
        const u = cacheUsuarios.find(x => x.id === id);
        if (!u) return;
        const ok = await atualizarUsuario(id, { avatar_foto: null });
        if (ok) {
            toast('Foto removida.', 'info');
            await carregar();
            await recarregarSystemUsers();
            if (window.currentUser && window.currentUser.username === u.username) {
                window.currentUser.avatarFoto = null;
                try {
                    const s = JSON.parse(localStorage.getItem('wheeltech_user') || '{}');
                    delete s.avatarFoto;
                    localStorage.setItem('wheeltech_user', JSON.stringify(s));
                } catch (e) { /* ignora */ }
                if (typeof window.atualizarTodosAvatares === 'function') window.atualizarTodosAvatares();
            }
            render();
        }
    }

    function redimensionar(img, lado) {
        const canvas = document.createElement('canvas');
        canvas.width = lado;
        canvas.height = lado;
        const ctx = canvas.getContext('2d');
        const escala = Math.max(lado / img.width, lado / img.height);
        const w = img.width * escala;
        const h = img.height * escala;
        ctx.drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
        return canvas.toDataURL('image/jpeg', 0.82);
    }

    // ---------------------------------------------------------
    // MODAL
    // ---------------------------------------------------------
    function garantirEstilo() {
        if (document.getElementById('wtUsuariosEstilo')) return;
        const st = document.createElement('style');
        st.id = 'wtUsuariosEstilo';
        st.textContent = `
            #wtUsuariosOverlay{position:fixed;inset:0;background:rgba(15,23,42,.55);
                display:flex;align-items:flex-start;justify-content:center;z-index:99999;
                padding:40px 16px;overflow:auto}
            #wtUsuariosOverlay.hidden{display:none}
            #wtUsuariosModal{background:#fff;border-radius:16px;width:100%;max-width:760px;
                box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;font-size:14px}
            #wtUsuariosModal .u-head{display:flex;align-items:center;justify-content:space-between;
                padding:18px 22px;border-bottom:1px solid #eef0f4}
            #wtUsuariosModal .u-head h3{margin:0;font-size:17px;display:flex;gap:8px;align-items:center}
            #wtUsuariosModal .u-fechar{background:none;border:none;font-size:22px;cursor:pointer;color:#64748b;line-height:1}
            #wtUsuariosModal .u-tabs{display:flex;gap:6px;padding:14px 22px 0;flex-wrap:wrap}
            #wtUsuariosModal .u-tab{border:1px solid #d9dee7;background:#f6f7f9;border-radius:999px;
                padding:6px 14px;cursor:pointer;font-size:13px;color:#475569}
            #wtUsuariosModal .u-tab.ativa{background:#7c3aed;border-color:#7c3aed;color:#fff;font-weight:600}
            #wtUsuariosModal .u-tab .cnt{display:inline-block;min-width:18px;text-align:center;
                background:rgba(0,0,0,.12);border-radius:999px;padding:0 5px;margin-left:6px;font-size:11px}
            #wtUsuariosModal .u-corpo{padding:16px 22px 24px;max-height:60vh;overflow:auto}
            #wtUsuariosModal .u-item{display:flex;gap:12px;align-items:center;padding:12px;
                border:1px solid #eef0f4;border-radius:12px;margin-bottom:10px}
            #wtUsuariosModal .u-av{width:44px;height:44px;border-radius:50%;background:#7c3aed;color:#fff;
                display:flex;align-items:center;justify-content:center;font-weight:700;overflow:hidden;flex-shrink:0}
            #wtUsuariosModal .u-av img{width:100%;height:100%;object-fit:cover}
            #wtUsuariosModal .u-info{flex:1;min-width:0}
            #wtUsuariosModal .u-nome{font-weight:600}
            #wtUsuariosModal .u-sub{color:#64748b;font-size:12px;margin-top:2px}
            #wtUsuariosModal .u-acoes{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
            #wtUsuariosModal .u-acoes button{border:none;border-radius:8px;padding:6px 10px;font-size:12px;cursor:pointer}
            #wtUsuariosModal .b-ok{background:#dcfce7;color:#166534}
            #wtUsuariosModal .b-no{background:#fee2e2;color:#991b1b}
            #wtUsuariosModal .b-neutro{background:#e2e8f0;color:#334155}
            #wtUsuariosModal .u-vazio{text-align:center;color:#94a3b8;padding:30px 10px}
            #wtSenhaOverlay{position:fixed;inset:0;background:rgba(15,23,42,.55);
                display:flex;align-items:flex-start;justify-content:center;z-index:100000;
                padding:60px 16px;overflow:auto}
            #wtSenhaOverlay.hidden{display:none}
            #wtSenhaModal{background:#fff;border-radius:16px;width:100%;max-width:420px;
                box-shadow:0 24px 60px rgba(0,0,0,.28);overflow:hidden;font-size:14px}
            #wtSenhaModal .u-head{display:flex;align-items:center;justify-content:space-between;
                padding:16px 20px;border-bottom:1px solid #eef0f4}
            #wtSenhaModal .u-head h3{margin:0;font-size:16px;display:flex;gap:8px;align-items:center}
            #wtSenhaModal .u-fechar{background:none;border:none;font-size:22px;cursor:pointer;color:#64748b;line-height:1}
            #wtSenhaModal .s-corpo{padding:18px 20px 20px;display:flex;flex-direction:column;gap:12px}
            #wtSenhaModal label{display:flex;flex-direction:column;gap:5px;font-weight:600;font-size:13px;color:#334155}
            #wtSenhaModal label small{font-weight:400;color:#94a3b8}
            #wtSenhaModal input{border:1px solid #d9dee7;border-radius:8px;padding:9px 11px;font-size:14px}
            #wtSenhaModal .s-erro{color:#b91c1c;font-size:12.5px;min-height:16px}
            #wtSenhaModal .s-acoes{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
            #wtSenhaModal .s-acoes button{border:none;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer}
            #wtSenhaModal .b-ok{background:#7c3aed;color:#fff}
            #wtSenhaModal .b-neutro{background:#e2e8f0;color:#334155}
            .wt-gear-dropdown{position:absolute;top:calc(100% + 8px);right:0;min-width:214px;
                background:#fff;border:1px solid #e2e8f0;border-radius:10px;
                box-shadow:0 14px 36px rgba(0,0,0,.17);overflow:hidden;z-index:100050;padding:4px}
            .wt-gear-dropdown.hidden{display:none}
            .wt-gear-item{display:flex;align-items:center;gap:10px;width:100%;border:none;background:none;
                padding:10px 12px;font-size:13.5px;color:#334155;cursor:pointer;border-radius:7px;text-align:left}
            .wt-gear-item:hover{background:#f1f5f9}
            .wt-gear-item i{width:16px;text-align:center;color:#7c3aed}
            #wtUsuariosNotifBtn{position:relative}
            #wtUsuariosNotifBtn .u-badge{position:absolute;top:-4px;right:-4px;background:#ef4444;color:#fff;
                border-radius:999px;font-size:10px;min-width:16px;height:16px;line-height:16px;text-align:center;padding:0 3px}
        `;
        document.head.appendChild(st);
    }

    function garantirOverlay() {
        let ov = document.getElementById('wtUsuariosOverlay');
        if (ov) return ov;
        garantirEstilo();
        ov = document.createElement('div');
        ov.id = 'wtUsuariosOverlay';
        ov.className = 'hidden';
        ov.innerHTML = `
            <div id="wtUsuariosModal" role="dialog" aria-modal="true">
                <div class="u-head">
                    <h3><i class="fas fa-users"></i> Lista de usuários</h3>
                    <button type="button" class="u-fechar" aria-label="Fechar">&times;</button>
                </div>
                <div class="u-tabs"></div>
                <div class="u-corpo"></div>
            </div>`;
        ov.addEventListener('click', (e) => { if (e.target === ov) fechar(); });
        ov.querySelector('.u-fechar').addEventListener('click', fechar);
        document.body.appendChild(ov);
        return ov;
    }

    function fechar() {
        const ov = document.getElementById('wtUsuariosOverlay');
        if (ov) ov.classList.add('hidden');
    }

    function contar(status) {
        return cacheUsuarios.filter(u => (u.status || 'pendente') === status).length;
    }

    function render() {
        const ov = document.getElementById('wtUsuariosOverlay');
        if (!ov || ov.classList.contains('hidden')) return;

        const tabs = ov.querySelector('.u-tabs');
        const corpo = ov.querySelector('.u-corpo');
        const defs = [
            ['ativos', 'Ativos', 'ativo'],
            ['pendentes', 'Pendentes', 'pendente'],
            ['recusados', 'Recusados', 'recusado'],
            ['bloqueados', 'Bloqueados', 'bloqueado']
        ];

        tabs.innerHTML = defs.map(([chave, rotulo, status]) => `
            <button type="button" class="u-tab ${abaAtual === chave ? 'ativa' : ''}" data-aba="${chave}">
                ${rotulo}<span class="cnt">${contar(status)}</span>
            </button>`).join('');
        tabs.querySelectorAll('.u-tab').forEach(b => {
            b.addEventListener('click', () => { abaAtual = b.dataset.aba; render(); });
        });

        const statusAlvo = (defs.find(d => d[0] === abaAtual) || defs[1])[2];
        const lista = cacheUsuarios
            .filter(u => (u.status || 'pendente') === statusAlvo)
            .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));

        if (!lista.length) {
            corpo.innerHTML = `<div class="u-vazio">Nenhum usuário nesta lista.</div>`;
            return;
        }

        corpo.innerHTML = lista.map(u => {
            const av = u.avatar_foto
                ? `<img src="${esc(u.avatar_foto)}" alt="">`
                : esc((u.avatar || (u.nome || 'U').charAt(0)).toUpperCase());
            const sub = statusAlvo === 'pendente'
                ? `${esc(u.email || 'sem e-mail')} · solicitado ${formatarData(u.criado_em)}`
                : `@${esc(u.username)} · ${esc(u.role || '—')}` +
                  (u.aprovado_por ? ` · por ${esc(u.aprovado_por)}` : '');

            let acoes = '';
            if (statusAlvo === 'pendente') {
                acoes = `
                    <button class="b-ok" data-acao="aprovar">Aceitar</button>
                    <button class="b-no" data-acao="recusar">Recusar</button>`;
            } else if (statusAlvo === 'ativo') {
                acoes = `
                    <button class="b-neutro" data-acao="foto">Foto</button>
                    ${u.avatar_foto ? `<button class="b-neutro" data-acao="tirarfoto">Tirar foto</button>` : ''}
                    <button class="b-neutro" data-acao="cargo">Cargo</button>
                    <button class="b-neutro" data-acao="senha">Senha</button>
                    <button class="b-no" data-acao="bloquear">Bloquear</button>`;
            } else if (statusAlvo === 'bloqueado') {
                acoes = `<button class="b-ok" data-acao="desbloquear">Desbloquear</button>`;
            } else if (statusAlvo === 'recusado') {
                acoes = `
                    <button class="b-ok" data-acao="aprovar">Aceitar assim mesmo</button>
                    <button class="b-neutro" data-acao="pendente">Voltar p/ pendentes</button>`;
            }

            return `
                <div class="u-item" data-id="${u.id}">
                    <div class="u-av">${av}</div>
                    <div class="u-info">
                        <div class="u-nome">${esc(u.nome)}</div>
                        <div class="u-sub">${sub}</div>
                    </div>
                    <div class="u-acoes">${acoes}</div>
                </div>`;
        }).join('');

        corpo.querySelectorAll('.u-item').forEach(item => {
            const id = item.dataset.id;
            item.querySelectorAll('button[data-acao]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const a = btn.dataset.acao;
                    if (a === 'aprovar') aprovar(id);
                    else if (a === 'recusar') recusar(id);
                    else if (a === 'bloquear') bloquear(id);
                    else if (a === 'desbloquear') desbloquear(id);
                    else if (a === 'pendente') reenviarParaPendente(id);
                    else if (a === 'cargo') trocarCargo(id);
                    else if (a === 'senha') redefinirSenha(id);
                    else if (a === 'foto') escolherFoto(id);
                    else if (a === 'tirarfoto') removerFoto(id);
                });
            });
        });
    }

    async function abrir(aba) {
        if (!ehAdmin()) {
            toast('🔒 Apenas administradores podem ver a lista de usuários.', 'warning');
            return;
        }
        if (aba) abaAtual = aba;
        garantirOverlay().classList.remove('hidden');
        const corpo = document.querySelector('#wtUsuariosOverlay .u-corpo');
        if (corpo) corpo.innerHTML = `<div class="u-vazio">Carregando…</div>`;
        await carregar();
        render();
    }

    // ---------------------------------------------------------
    // SININHO DE PENDENTES
    // ---------------------------------------------------------
    function pontoDeAncoragem() {
        return document.getElementById('wtMenuSettingsBtn')
            || document.getElementById('chamadosNotificacaoWrap')
            || document.querySelector('#menuSystem .user-info')
            || document.querySelector('#menuSystem .wt-user-info');
    }

    function garantirBotaoSino() {
        if (document.getElementById('wtUsuariosNotifBtn')) return document.getElementById('wtUsuariosNotifBtn');
        const ancora = pontoDeAncoragem();
        if (!ancora) return null;
        garantirEstilo();
        const btn = document.createElement('button');
        btn.id = 'wtUsuariosNotifBtn';
        btn.type = 'button';
        btn.className = 'wt-icon-button btn btn-sm btn-secondary';
        btn.title = 'Solicitações de cadastro';
        btn.style.display = 'none';
        btn.innerHTML = `<i class="fas fa-user-plus"></i><span class="u-badge" style="display:none">0</span>`;
        btn.addEventListener('click', (e) => { e.stopPropagation(); abrir('pendentes'); });
        if (ancora.parentElement) ancora.parentElement.insertBefore(btn, ancora);
        else ancora.appendChild(btn);
        return btn;
    }

    // Monta o menu (dropdown) da engrenagem no botão #wtMenuSettingsBtn.
    // A engrenagem passa a aparecer para TODO MUNDO; o conteúdo é que muda
    // conforme o cargo.
    function montarMenuEngrenagem() {
        const btn = document.getElementById('wtMenuSettingsBtn');
        if (!btn) return;

        btn.style.display = 'grid';           // visível para todos
        btn.title = 'Configurações';

        let dd = document.getElementById('wtGearDropdown');
        if (!dd) {
            garantirEstilo();
            dd = document.createElement('div');
            dd.id = 'wtGearDropdown';
            dd.className = 'wt-gear-dropdown hidden';
            const host = btn.parentElement || document.body;
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.appendChild(dd);
            document.addEventListener('click', (e) => {
                if (!dd.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                    dd.classList.add('hidden');
                }
            });
        }

        btn.onclick = (e) => {
            e.stopPropagation();
            preencherMenuEngrenagem(dd);
            dd.classList.toggle('hidden');
        };
    }

    function preencherMenuEngrenagem(dd) {
        const admin = ehAdmin();
        const itens = [];
        if (admin) itens.push(['fa-eye', 'Gerenciar visualização',
            () => window.abrirGerenciarVisualizacaoMenu && window.abrirGerenciarVisualizacaoMenu()]);
        itens.push(['fa-key', 'Alterar senha', () => abrirTrocarSenha()]);
        if (admin) itens.push(['fa-camera', 'Alterar foto do avatar', () => alterarMinhaFoto()]);
        if (admin) itens.push(['fa-users', 'Usuários', () => abrir('ativos')]);

        dd.innerHTML = '';
        itens.forEach(([ic, txt, fn]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'wt-gear-item';
            b.innerHTML = `<i class="fas ${ic}"></i> <span>${txt}</span>`;
            b.addEventListener('click', () => { dd.classList.add('hidden'); fn(); });
            dd.appendChild(b);
        });
    }

    // Troca a foto do avatar da PRÓPRIA pessoa logada
    function alterarMinhaFoto() {
        const eu = window.currentUser;
        if (!eu || !eu.username) { toast('Entre no sistema primeiro.', 'warning'); return; }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = () => {
            const file = input.files && input.files[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) { toast('Imagem muito grande (máx 8 MB).', 'warning'); return; }
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = async () => {
                    const base64 = redimensionar(img, 160);
                    const cli = sb();
                    if (!cli) { toast('Sem conexão com o banco.', 'error'); return; }
                    const { error } = await cli.from('usuarios')
                        .update({
                            avatar_foto: base64,
                            avatar: (eu.name || eu.username || 'U').charAt(0).toUpperCase(),
                            atualizado_em: new Date().toISOString()
                        })
                        .eq('username', eu.username);
                    if (error) { toast('Não foi possível salvar a foto. ' + (error.message || ''), 'error'); return; }
                    eu.avatarFoto = base64;
                    window.currentUser = eu;
                    try {
                        const s = JSON.parse(localStorage.getItem('wheeltech_user') || '{}');
                        s.avatarFoto = base64;
                        localStorage.setItem('wheeltech_user', JSON.stringify(s));
                    } catch (e) { /* ignora */ }
                    if (typeof window.atualizarTodosAvatares === 'function') window.atualizarTodosAvatares();
                    if (typeof window.carregarUsuariosDoBanco === 'function') window.carregarUsuariosDoBanco().catch(() => {});
                    toast('📷 Sua foto foi atualizada.', 'success');
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }

    async function atualizarSino() {
        const btn = garantirBotaoSino();
        montarMenuEngrenagem();
        if (window.currentUser && !timerSino) iniciarPolling();
        if (!btn) return;
        if (!ehAdmin()) { btn.style.display = 'none'; return; }

        const cli = sb();
        if (!cli) return;
        let qtd = 0;
        try {
            const { count } = await cli
                .from('usuarios')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'pendente');
            qtd = count || 0;
        } catch (e) { return; }

        const badge = btn.querySelector('.u-badge');
        if (qtd > 0) {
            btn.style.display = '';
            badge.style.display = '';
            badge.textContent = qtd > 99 ? '99+' : String(qtd);
            btn.title = qtd === 1
                ? 'Nova solicitação de cadastro de usuário pendente'
                : qtd + ' solicitações de cadastro pendentes';
            if (!btn.dataset.avisou || Number(btn.dataset.avisou) < qtd) {
                toast('🔔 ' + btn.title, 'info');
            }
            btn.dataset.avisou = String(qtd);
        } else {
            badge.style.display = 'none';
            btn.style.display = 'none';
            btn.dataset.avisou = '0';
        }
    }

    function iniciarPolling() {
        if (timerSino) clearInterval(timerSino);
        timerSino = setInterval(atualizarSino, 60000);
        atualizarSino();
    }

    // ---------------------------------------------------------
    // TROCAR A PRÓPRIA SENHA
    // ---------------------------------------------------------
    function garantirOverlaySenha() {
        let ov = document.getElementById('wtSenhaOverlay');
        if (ov) return ov;
        garantirEstilo();
        ov = document.createElement('div');
        ov.id = 'wtSenhaOverlay';
        ov.className = 'hidden';
        ov.innerHTML = `
            <div id="wtSenhaModal" role="dialog" aria-modal="true">
                <div class="u-head">
                    <h3><i class="fas fa-key"></i> Trocar minha senha</h3>
                    <button type="button" class="u-fechar" aria-label="Fechar">&times;</button>
                </div>
                <div class="s-corpo">
                    <label>Senha atual
                        <input type="password" id="wtSenhaAtual" autocomplete="current-password">
                    </label>
                    <label>Nova senha <small>(mínimo 6 caracteres)</small>
                        <input type="password" id="wtSenhaNova" autocomplete="new-password">
                    </label>
                    <label>Repita a nova senha
                        <input type="password" id="wtSenhaNova2" autocomplete="new-password">
                    </label>
                    <div class="s-erro" id="wtSenhaErro"></div>
                    <div class="s-acoes">
                        <button type="button" class="b-neutro" id="wtSenhaCancelar">Cancelar</button>
                        <button type="button" class="b-ok" id="wtSenhaSalvar">Salvar nova senha</button>
                    </div>
                </div>
            </div>`;
        ov.addEventListener('click', (e) => { if (e.target === ov) fecharSenha(); });
        ov.querySelector('.u-fechar').addEventListener('click', fecharSenha);
        ov.querySelector('#wtSenhaCancelar').addEventListener('click', fecharSenha);
        ov.querySelector('#wtSenhaSalvar').addEventListener('click', salvarNovaSenha);
        ov.querySelector('#wtSenhaNova2').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') salvarNovaSenha();
        });
        document.body.appendChild(ov);
        return ov;
    }

    function fecharSenha() {
        const ov = document.getElementById('wtSenhaOverlay');
        if (ov) ov.classList.add('hidden');
    }

    async function salvarNovaSenha() {
        const erro = document.getElementById('wtSenhaErro');
        const btn = document.getElementById('wtSenhaSalvar');
        const atual = (document.getElementById('wtSenhaAtual').value || '');
        const nova = (document.getElementById('wtSenhaNova').value || '');
        const nova2 = (document.getElementById('wtSenhaNova2').value || '');
        erro.textContent = '';

        const eu = window.currentUser;
        if (!eu || !eu.username) { erro.textContent = 'Sessão não encontrada. Entre de novo.'; return; }
        if (!atual) { erro.textContent = 'Digite sua senha atual.'; return; }
        if (nova.length < 6) { erro.textContent = 'A nova senha precisa ter pelo menos 6 caracteres.'; return; }
        if (nova !== nova2) { erro.textContent = 'As duas senhas novas não são iguais.'; return; }
        if (nova === atual) { erro.textContent = 'A nova senha tem que ser diferente da atual.'; return; }

        btn.disabled = true;
        const textoOrig = btn.textContent;
        btn.textContent = 'Salvando…';

        try {
            // confere a senha atual pelo mesmo caminho do login
            let confere = null;
            if (typeof window.autenticarUsuarioWheelTech === 'function') {
                confere = await window.autenticarUsuarioWheelTech(eu.username, atual);
            } else {
                const cli = sb();
                const hAtual = await hashSenha(eu.username, atual);
                const { data } = await cli.rpc('verificar_login', {
                    p_username: eu.username, p_senha_hash: hAtual
                });
                confere = Array.isArray(data) ? data[0] : data;
            }
            if (!confere) { erro.textContent = 'Senha atual incorreta.'; return; }

            const cli = sb();
            if (!cli) { erro.textContent = 'Sem conexão com o banco.'; return; }
            const novoHash = await hashSenha(eu.username, nova);
            const { error } = await cli
                .from('usuarios')
                .update({ senha_hash: novoHash, atualizado_em: new Date().toISOString() })
                .eq('username', eu.username);
            if (error) { erro.textContent = 'Não foi possível salvar. ' + (error.message || ''); return; }

            fecharSenha();
            toast('✅ Senha alterada com sucesso.', 'success');
        } catch (e) {
            console.error('[usuarios] trocar senha:', e);
            erro.textContent = 'Erro ao trocar a senha. Tente de novo.';
        } finally {
            btn.disabled = false;
            btn.textContent = textoOrig;
        }
    }

    function abrirTrocarSenha() {
        if (!window.currentUser) { toast('Entre no sistema primeiro.', 'warning'); return; }
        const ov = garantirOverlaySenha();
        ['wtSenhaAtual', 'wtSenhaNova', 'wtSenhaNova2'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('wtSenhaErro').textContent = '';
        ov.classList.remove('hidden');
        setTimeout(() => { document.getElementById('wtSenhaAtual').focus(); }, 60);
    }

    // ---------------------------------------------------------
    // START
    // ---------------------------------------------------------
    function start() {
        garantirEstilo();
        montarMenuEngrenagem();
        // tenta instalar o sino / entrada da engrenagem por alguns segundos
        // (esses elementos são criados por outros módulos após o login)
        let tentativas = 0;
        const it = setInterval(() => {
            tentativas++;
            garantirBotaoSino();
            montarMenuEngrenagem();
            if (window.currentUser) { iniciarPolling(); clearInterval(it); }
            if (tentativas > 40) clearInterval(it);
        }, 1500);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && window.currentUser && ehAdmin()) atualizarSino();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }

    // ---------------------------------------------------------
    // API PÚBLICA
    // ---------------------------------------------------------
    window.WTUsuarios = {
        hashSenha,
        carregar,
        ehAdmin,
        atualizarSino,
        abrir,
        abrirTrocarSenha,
        alterarMinhaFoto
    };
    window.abrirListaUsuarios = abrir;
    window.abrirTrocarSenha = abrirTrocarSenha;
    window.alterarMinhaFoto = alterarMinhaFoto;
})();
