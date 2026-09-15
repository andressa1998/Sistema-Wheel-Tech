/* =========================================================
 * AMPULHETA DA COLETA
 *
 * Widget embutido nas sidebars (a global #wtGlobalSidebar e a do
 * menu principal #menuSystem), em cima do nome/foto do usuário.
 * Se por algum motivo nenhuma sidebar existir na página, cai de
 * volta pro cartão flutuante no canto (comportamento antigo).
 *
 * Conta o tempo até a próxima coleta e a areia vai "caindo".
 * Fica amarela abaixo de 3h e vermelha/piscando abaixo de 1h
 * ou quando o prazo estoura.
 *
 * Prazo = o MENOR entre:
 *   1. o próximo horário de coleta da semana (configurável -
 *      igual "Meus horários de coleta" do Mercado Livre)
 *   2. o menor prazo de manuseio das vendas pendentes
 *      (localStorage "wt_proxima_coleta", escrito por
 *      nfe_manager.js)
 *
 * Clique no widget para configurar os horários por dia.
 * ========================================================= */

(function () {
    'use strict';

    var KEY_HANDLING = 'wt_proxima_coleta';
    var KEY_SCHEDULE = 'wt_coleta_horarios';
    var CONFIG_CHAVE = 'coleta_horarios';
    var CONFIG_CHAVE_DIA = 'coleta_confirmacao_dia';

    // 0 = domingo ... 6 = sábado. Cada dia tem 2 horários:
    // "normal" (coleta comum) e "full" (coleta FULL — nem sempre
    // existe, por isso costuma ficar null). null = sem coleta.
    // Padrão baseado no depósito Araucária (ajustável no widget).
    var DEFAULT_SCHEDULE = {
        '0': { normal: null, full: null },
        '1': { normal: null, full: null },
        '2': { normal: '13:30', full: null },
        '3': { normal: '13:30', full: null },
        '4': { normal: '13:30', full: null },
        '5': { normal: '13:30', full: null },
        '6': { normal: '11:30', full: null }
    };

    // Janela visual: a areia esvazia ao longo das últimas 12h.
    var JANELA_MS = 12 * 60 * 60 * 1000;

    var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    var instancias = [];   // um item por lugar onde o widget é mostrado
    var timer = null;
    var schedule = null;

    // ---------- confirmação diária (1º usuário do dia) ----------
    // { data: 'YYYY-MM-DD', normal: 'HH:MM'|null, full: 'HH:MM'|null, confirmado_por: 'Nome' }
    // Guardado em configuracoes_sistema, igual o schedule semanal.
    // Só o PRIMEIRO usuário a acessar o sistema em cada dia vê o
    // modal; depois que ele confirma, os demais não veem mais.
    var confirmacaoDiaria = null;
    var verificacaoDiariaEmAndamento = false;
    var confirmacaoDiariaResolvida = false;

    // ---------- schedule ----------

    function lerScheduleLocal() {
        try {
            var raw = localStorage.getItem(KEY_SCHEDULE);
            if (!raw) return null;
            var s = JSON.parse(raw);
            if (s && typeof s === 'object') return s;
        } catch (e) {}
        return null;
    }

    function salvarScheduleLocal(s) {
        try {
            localStorage.setItem(KEY_SCHEDULE, JSON.stringify(s));
        } catch (e) {}
    }

    function salvarScheduleSupabase(s) {
        try {
            if (!window.supabaseClient) return;
            window.supabaseClient
                .from('configuracoes_sistema')
                .upsert(
                    { chave: CONFIG_CHAVE, valor: s },
                    { onConflict: 'chave' }
                )
                .then(function () {}, function () {});
        } catch (e) {}
    }

    function carregarScheduleSupabase() {
        try {
            if (!window.supabaseClient) return;
            window.supabaseClient
                .from('configuracoes_sistema')
                .select('valor')
                .eq('chave', CONFIG_CHAVE)
                .maybeSingle()
                .then(function (res) {
                    var v = res && res.data && res.data.valor;
                    if (v && typeof v === 'object') {
                        schedule = normalizarSchedule(v);
                        salvarScheduleLocal(schedule);
                        render();
                    }
                }, function () {});
        } catch (e) {}
    }

    function normalizarHorario(v) {
        if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) {
            var p = v.trim().split(':');
            var hh = Math.min(23, parseInt(p[0], 10));
            var mm = Math.min(59, parseInt(p[1], 10));
            return (hh < 10 ? '0' + hh : String(hh)) + ':' + (mm < 10 ? '0' + mm : String(mm));
        }
        return null;
    }

    function normalizarSchedule(s) {
        var out = {};
        for (var d = 0; d < 7; d++) {
            var v = s ? s[String(d)] : undefined;
            if (v && typeof v === 'object') {
                out[String(d)] = { normal: normalizarHorario(v.normal), full: normalizarHorario(v.full) };
            } else {
                // Formato antigo (um horário só por dia, como string) —
                // migra automaticamente pra "normal", sem coleta FULL.
                out[String(d)] = { normal: normalizarHorario(v), full: null };
            }
        }
        return out;
    }

    // ---------- cálculo do prazo ----------

    function adicionarCandidatoCorte(lista, diaBase, horario, tipo) {
        if (!horario) return;
        var p = horario.split(':');
        var t = new Date(diaBase);
        t.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);
        lista.push({ tempo: t.getTime(), tipo: tipo });
    }

    // Retorna { tempo, tipo: 'normal'|'full' } do próximo corte
    // agendado (o mais próximo entre os dois horários de cada dia),
    // ou null se não houver nenhum configurado nos próximos 8 dias.
    function proximoCorteAgendado() {
        if (!schedule) return null;

        var agora = new Date();
        var candidatos = [];

        for (var i = 0; i < 8; i++) {
            var alvo = new Date(agora);
            alvo.setDate(agora.getDate() + i);
            var dia = alvo.getDay();
            var horarios = schedule[String(dia)] || { normal: null, full: null };
            var normal = horarios.normal;
            var full = horarios.full;

            // Se for HOJE e o primeiro usuário do dia já confirmou
            // horários específicos, eles sobrepõem o padrão semanal.
            if (i === 0 && confirmacaoDiaria && confirmacaoDiaria.data === hojeISO()) {
                normal = confirmacaoDiaria.normal;
                full = confirmacaoDiaria.full;
            }

            adicionarCandidatoCorte(candidatos, alvo, normal, 'normal');
            adicionarCandidatoCorte(candidatos, alvo, full, 'full');
        }

        var futuros = candidatos.filter(function (c) { return c.tempo > agora.getTime(); });
        if (!futuros.length) return null;

        futuros.sort(function (a, b) { return a.tempo - b.tempo; });
        return futuros[0];
    }

    function prazoManuseio() {
        try {
            var raw = localStorage.getItem(KEY_HANDLING);
            if (!raw) return null;
            var d = JSON.parse(raw);
            if (!d || !d.prazo) return null;
            var t = new Date(d.prazo).getTime();
            return isFinite(t) ? t : null;
        } catch (e) {
            return null;
        }
    }

    // Retorna { tempo, tipo } — tipo é 'normal', 'full' ou null
    // (quando o prazo vem do manuseio das vendas, não da agenda).
    function calcularPrazo() {
        var agendado = proximoCorteAgendado();
        var manuseio = prazoManuseio();
        var agora = Date.now();

        var candidatos = [];
        if (agendado && agendado.tempo > agora - 6 * 60 * 60 * 1000) candidatos.push(agendado);
        if (manuseio && manuseio > agora - 6 * 60 * 60 * 1000) candidatos.push({ tempo: manuseio, tipo: null });

        if (candidatos.length === 0) return null;
        candidatos.sort(function (a, b) { return a.tempo - b.tempo; });
        return candidatos[0];
    }

    // ---------- formatação ----------

    function formatarRestante(ms) {
        if (ms <= 0) return 'Estourou';
        var totalMin = Math.floor(ms / 60000);
        var h = Math.floor(totalMin / 60);
        var m = totalMin % 60;
        if (h >= 24) {
            var dd = Math.floor(h / 24);
            return dd + 'd ' + (h % 24) + 'h';
        }
        if (h >= 1) return h + 'h ' + m + 'min';
        return m + 'min';
    }

    function formatarHora(t) {
        try {
            return new Date(t).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return '';
        }
    }

    function mesmoDia(a, b) {
        var da = new Date(a), db = new Date(b);
        return da.getFullYear() === db.getFullYear() &&
            da.getMonth() === db.getMonth() &&
            da.getDate() === db.getDate();
    }

    function hojeISO() {
        var d = new Date();
        var mm = String(d.getMonth() + 1);
        var dd = String(d.getDate());
        if (mm.length < 2) mm = '0' + mm;
        if (dd.length < 2) dd = '0' + dd;
        return d.getFullYear() + '-' + mm + '-' + dd;
    }

    function horarioPadraoHoje() {
        var s = schedule || DEFAULT_SCHEDULE;
        return s[String(new Date().getDay())] || { normal: null, full: null };
    }

    // ---------- criação (embutido nas sidebars, com fallback fixo) ----------

    function loginAtivo() {
        var b = document.body;
        if (!b) return true;
        if (b.classList.contains('login-active')) return true;
        var login = document.getElementById('loginScreen');
        if (login && !login.classList.contains('hidden')) return true;
        return false;
    }

    function garantirEstiloColeta() {
        if (document.getElementById('wtColetaEstilo')) return;

        var style = document.createElement('style');
        style.id = 'wtColetaEstilo';
        style.textContent = [
            '.wt-coleta-widget{display:flex;align-items:center;gap:9px;cursor:pointer;',
            'font-family:inherit;font-size:.8rem;line-height:1.1;',
            'transition:color .3s,border-color .3s,background .3s}',
            '.wt-coleta-widget.wt-coleta-hidden{display:none}',
            '.wt-coleta-widget svg{flex:0 0 auto;display:block}',
            '.wt-coleta-widget .wt-coleta-copy{display:flex;flex-direction:column;gap:2px;min-width:0}',
            '.wt-coleta-widget .wt-coleta-main{font-size:.9rem;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.wt-coleta-widget .wt-coleta-sub{font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
            '.wt-coleta-widget .wt-hg-sand-top,.wt-coleta-widget .wt-hg-sand-bot{transition:y .9s linear,height .9s linear}',
            '.wt-coleta-widget .wt-hg-stream{opacity:0}',
            '.wt-coleta-widget.wt-coleta-correndo .wt-hg-stream{opacity:1;animation:wtHgStream 1s linear infinite;stroke-dasharray:1 3}',
            '@keyframes wtHgStream{to{stroke-dashoffset:-8}}',
            '.wt-coleta-widget.wt-coleta-urgente .wt-hg-stream{animation-duration:.45s}',
            '@keyframes wtColetaPulse{0%,100%{box-shadow:0 6px 20px rgba(210,31,31,.18)}',
            '50%{box-shadow:0 6px 26px rgba(210,31,31,.42)}}',

            /* -------- versão FIXA (fallback, sem sidebar na página) -------- */
            '.wt-coleta-widget.wt-coleta-fixed{position:fixed;bottom:18px;right:18px;z-index:99990;',
            'padding:7px 13px 7px 10px;background:#ffffff;border:1px solid #dbe4f0;border-radius:12px;',
            'box-shadow:0 6px 20px rgba(0,28,80,.12);color:#1f6feb}',
            '.wt-coleta-widget.wt-coleta-fixed .wt-coleta-sub{color:#8895ab}',
            '.wt-coleta-widget.wt-coleta-fixed.wt-coleta-ok{color:#1f9d55;border-color:#c4ead2}',
            '.wt-coleta-widget.wt-coleta-fixed.wt-coleta-atencao{color:#c77700;border-color:#f3dcae;background:#fffaf0}',
            '.wt-coleta-widget.wt-coleta-fixed.wt-coleta-urgente{color:#d21f1f;border-color:#f2c2c2;background:#fff5f5;',
            'animation:wtColetaPulse 1.4s ease-in-out infinite}',
            '@media(max-width:640px){.wt-coleta-widget.wt-coleta-fixed{bottom:10px;right:10px;padding:5px 9px;font-size:.72rem}',
            '.wt-coleta-widget.wt-coleta-fixed .wt-coleta-sub{display:none}}',

            /* -------- versão EMBUTIDA na sidebar (em cima do usuário) -------- */
            '.wt-coleta-widget.wt-coleta-embed{width:100%;box-sizing:border-box;margin:0 0 10px;',
            'padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.07);',
            'border:1px solid rgba(255,255,255,.14);color:#dce6ff}',
            '.wt-coleta-widget.wt-coleta-embed .wt-coleta-sub{color:rgba(220,230,255,.62)}',
            '.wt-coleta-widget.wt-coleta-embed.wt-coleta-ok{color:#8ee6ad;border-color:rgba(142,230,173,.32);background:rgba(142,230,173,.09)}',
            '.wt-coleta-widget.wt-coleta-embed.wt-coleta-ok .wt-coleta-sub{color:rgba(142,230,173,.65)}',
            '.wt-coleta-widget.wt-coleta-embed.wt-coleta-atencao{color:#ffcf7a;border-color:rgba(255,207,122,.35);background:rgba(255,207,122,.1)}',
            '.wt-coleta-widget.wt-coleta-embed.wt-coleta-atencao .wt-coleta-sub{color:rgba(255,207,122,.7)}',
            '.wt-coleta-widget.wt-coleta-embed.wt-coleta-urgente{color:#ff9d9d;border-color:rgba(255,140,140,.45);background:rgba(255,70,70,.14);',
            'animation:wtColetaPulseEmbed 1.4s ease-in-out infinite}',
            '.wt-coleta-widget.wt-coleta-embed.wt-coleta-urgente .wt-coleta-sub{color:rgba(255,157,157,.75)}',
            '@keyframes wtColetaPulseEmbed{0%,100%{background:rgba(255,70,70,.14)}50%{background:rgba(255,70,70,.26)}}',
            /* a sidebar global fica só com ícones até passar o mouse — some o texto igual ao nome do usuário */
            '#wtGlobalSidebar .wt-coleta-embed .wt-coleta-copy{opacity:0;visibility:hidden;transition:opacity .14s ease}',
            '#wtGlobalSidebar:hover .wt-coleta-embed .wt-coleta-copy,#wtGlobalSidebar:focus-within .wt-coleta-embed .wt-coleta-copy{opacity:1;visibility:visible}',

            /* modal de config */
            '.wt-coleta-modal{position:fixed;inset:0;z-index:99991;display:flex;',
            'align-items:center;justify-content:center;background:rgba(15,28,60,.45)}',
            '.wt-coleta-modal .box{background:#fff;border-radius:14px;padding:22px 24px;',
            'width:min(360px,92vw);box-shadow:0 20px 60px rgba(0,20,60,.35);font-size:.85rem;color:#26324a}',
            '.wt-coleta-modal h3{margin:0 0 4px;font-size:1rem}',
            '.wt-coleta-modal p{margin:0 0 14px;color:#6b7890;font-size:.78rem}',
            '.wt-coleta-modal .linha{display:flex;align-items:center;justify-content:space-between;',
            'padding:6px 0;border-bottom:1px solid #eef2f7}',
            '.wt-coleta-modal input{width:96px;padding:6px 8px;border:1px solid #d3dceb;border-radius:8px;font:inherit}',
            /* linha com 2 colunas (Normal / FULL) */
            '.wt-coleta-modal .linha.wt-coleta-2col{display:grid;grid-template-columns:52px 1fr 1fr;gap:8px}',
            '.wt-coleta-modal .wt-coleta-col-label{font-size:.64rem;text-transform:uppercase;letter-spacing:.05em;',
            'color:#8895ab;text-align:center}',
            '.wt-coleta-modal .wt-coleta-2col input{width:100%;box-sizing:border-box}',
            '.wt-coleta-modal .acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
            '.wt-coleta-modal button{padding:8px 16px;border-radius:9px;border:0;cursor:pointer;font:inherit;font-weight:600}',
            '.wt-coleta-modal .salvar{background:#1f6feb;color:#fff}',
            '.wt-coleta-modal .cancelar{background:#eef1f6;color:#41506b}'
        ].join('');

        document.head.appendChild(style);
    }

    function markupWidget() {
        return [
            '<svg viewBox="0 0 24 34" width="26" height="36" aria-hidden="true">',
            '  <path d="M4 2 H20 M4 32 H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
            '  <path d="M4 2 L4 5 Q4 12 12 17 Q20 12 20 5 L20 2 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
            '  <path d="M4 32 L4 29 Q4 22 12 17 Q20 22 20 29 L20 32 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
            '  <clipPath id="wtHgTop"><path d="M4 2 L4 5 Q4 12 12 17 Q20 12 20 5 L20 2 Z"/></clipPath>',
            '  <clipPath id="wtHgBot"><path d="M4 32 L4 29 Q4 22 12 17 Q20 22 20 29 L20 32 Z"/></clipPath>',
            '  <rect class="wt-hg-sand-top" x="3" y="2" width="18" height="15" clip-path="url(#wtHgTop)" fill="currentColor"/>',
            '  <rect class="wt-hg-sand-bot" x="3" y="32" width="18" height="0" clip-path="url(#wtHgBot)" fill="currentColor"/>',
            '  <line class="wt-hg-stream" x1="12" y1="14" x2="12" y2="22" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
            '</svg>',
            '<span class="wt-coleta-copy">',
            '  <strong class="wt-coleta-main">--</strong>',
            '  <span class="wt-coleta-sub">coleta</span>',
            '</span>'
        ].join('');
    }

    function criarInstancia(target, embed) {
        var wrap = document.createElement('div');
        wrap.className = 'wt-coleta-widget ' + (embed ? 'wt-coleta-embed' : 'wt-coleta-fixed');
        wrap.setAttribute('role', 'status');
        wrap.title = 'Próxima coleta — clique para configurar os horários';
        wrap.addEventListener('click', abrirConfig);
        wrap.innerHTML = markupWidget();

        if (embed) {
            var userRow = target.querySelector('.wt-user-row');
            if (userRow) target.insertBefore(wrap, userRow);
            else target.insertBefore(wrap, target.firstChild);
        } else {
            target.appendChild(wrap);
        }

        return {
            wrap: wrap,
            sandTop: wrap.querySelector('.wt-hg-sand-top'),
            sandBot: wrap.querySelector('.wt-hg-sand-bot'),
            main: wrap.querySelector('.wt-coleta-main'),
            sub: wrap.querySelector('.wt-coleta-sub')
        };
    }

    function criar() {
        if (instancias.length) return;
        garantirEstiloColeta();

        var rodapes = document.querySelectorAll('.wt-sidebar-footer');
        if (rodapes.length) {
            rodapes.forEach(function (footer) {
                instancias.push(criarInstancia(footer, true));
            });
        } else {
            // sem sidebar na página (não deveria acontecer) -> volta pro cartão flutuante
            instancias.push(criarInstancia(document.body || document.documentElement, false));
        }
    }

    function aplicarAreia(frac) {
        frac = Math.max(0, Math.min(1, frac));
        var max = 15;
        var alturaTopo = max * frac;
        var alturaBaixo = max * (1 - frac);

        instancias.forEach(function (inst) {
            if (!inst.sandTop) return;
            inst.sandTop.setAttribute('y', (17 - alturaTopo).toFixed(2));
            inst.sandTop.setAttribute('height', alturaTopo.toFixed(2));
            if (inst.sandBot) {
                inst.sandBot.setAttribute('y', (32 - alturaBaixo).toFixed(2));
                inst.sandBot.setAttribute('height', alturaBaixo.toFixed(2));
            }
        });
    }

    function render() {
        criar();
        verificarConfirmacaoDiaria();
        if (!instancias.length) return;

        if (loginAtivo()) {
            instancias.forEach(function (inst) { inst.wrap.classList.add('wt-coleta-hidden'); });
            return;
        }
        instancias.forEach(function (inst) { inst.wrap.classList.remove('wt-coleta-hidden'); });

        instancias.forEach(function (inst) {
            inst.wrap.classList.remove(
                'wt-coleta-ok',
                'wt-coleta-atencao',
                'wt-coleta-urgente',
                'wt-coleta-correndo'
            );
        });

        var resultado = calcularPrazo();

        if (!resultado) {
            instancias.forEach(function (inst) {
                inst.main.textContent = 'Sem coleta';
                if (inst.sub) inst.sub.textContent = 'configurar';
                inst.wrap.classList.add('wt-coleta-ok');
            });
            aplicarAreia(1);
            return;
        }

        var prazo = resultado.tempo;
        var prefixoTipo = resultado.tipo === 'full' ? 'FULL · ' : '';
        var agora = Date.now();
        var restante = prazo - agora;

        aplicarAreia(restante / JANELA_MS);

        var estadoTexto, subTexto, classeEstado;

        if (restante <= 0) {
            estadoTexto = 'Estourou';
            subTexto = prefixoTipo + 'coleta ' + formatarHora(prazo);
        } else {
            estadoTexto = formatarRestante(restante);
            subTexto = mesmoDia(agora, prazo)
                ? prefixoTipo + 'coleta hoje ' + formatarHora(prazo)
                : prefixoTipo + 'coleta ' + DIAS[new Date(prazo).getDay()] + ' ' + formatarHora(prazo);
        }

        if (restante <= 0 || restante <= 60 * 60 * 1000) {
            classeEstado = 'wt-coleta-urgente';
        } else if (restante <= 3 * 60 * 60 * 1000) {
            classeEstado = 'wt-coleta-atencao';
        } else {
            classeEstado = 'wt-coleta-ok';
        }

        instancias.forEach(function (inst) {
            inst.main.textContent = estadoTexto;
            if (inst.sub) inst.sub.textContent = subTexto;
            if (restante > 0) inst.wrap.classList.add('wt-coleta-correndo');
            inst.wrap.classList.add(classeEstado);
        });
    }

    // ---------- config ----------

    function abrirConfig(ev) {
        if (ev) ev.stopPropagation();
        if (document.querySelector('.wt-coleta-modal')) return;

        var atual = schedule || DEFAULT_SCHEDULE;

        var linhas =
            '<div class="linha wt-coleta-2col"><span></span>' +
            '<span class="wt-coleta-col-label">Normal</span>' +
            '<span class="wt-coleta-col-label">FULL</span></div>';

        for (var d = 0; d < 7; d++) {
            var v = atual[String(d)] || { normal: null, full: null };
            linhas +=
                '<div class="linha wt-coleta-2col"><span>' + DIAS[d] + '</span>' +
                '<input type="time" data-dia="' + d + '" data-tipo="normal" value="' + (v.normal || '') + '">' +
                '<input type="time" data-dia="' + d + '" data-tipo="full" value="' + (v.full || '') + '">' +
                '</div>';
        }

        var modal = document.createElement('div');
        modal.className = 'wt-coleta-modal';
        modal.innerHTML =
            '<div class="box">' +
            '<h3>Horários de coleta</h3>' +
            '<p>Horário limite de cada dia (deixe em branco quando não há coleta). ' +
            'A coluna FULL é opcional — nem todo dia tem coleta FULL.</p>' +
            linhas +
            '<div class="acoes">' +
            '<button class="cancelar">Cancelar</button>' +
            '<button class="salvar">Salvar</button>' +
            '</div></div>';

        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
            if (e.target === modal || e.target.classList.contains('cancelar')) {
                modal.remove();
            }
        });

        modal.querySelector('.salvar').addEventListener('click', function () {
            var nova = {};
            for (var d2 = 0; d2 < 7; d2++) nova[String(d2)] = { normal: null, full: null };
            modal.querySelectorAll('input[data-dia]').forEach(function (inp) {
                var dia = inp.getAttribute('data-dia');
                var tipo = inp.getAttribute('data-tipo');
                nova[dia][tipo] = inp.value || null;
            });
            schedule = normalizarSchedule(nova);
            salvarScheduleLocal(schedule);
            salvarScheduleSupabase(schedule);
            modal.remove();
            render();
        });
    }

    // ---------- confirmação diária (1º usuário do dia) ----------

    function verificarConfirmacaoDiaria() {
        if (confirmacaoDiariaResolvida) return;
        if (verificacaoDiariaEmAndamento) return;
        if (loginAtivo()) return;
        if (!window.currentUser) return;
        if (!window.supabaseClient) return;

        verificacaoDiariaEmAndamento = true;

        window.supabaseClient
            .from('configuracoes_sistema')
            .select('valor')
            .eq('chave', CONFIG_CHAVE_DIA)
            .maybeSingle()
            .then(function (res) {
                verificacaoDiariaEmAndamento = false;
                var v = res && res.data && res.data.valor;

                if (v && v.data === hojeISO()) {
                    // Alguém já confirmou hoje — guarda o horário (pra
                    // sobrepor o padrão semanal na ampulheta) e não
                    // mostra o modal.
                    confirmacaoDiaria = v;
                    confirmacaoDiariaResolvida = true;
                    render();
                    return;
                }

                // Ninguém confirmou ainda hoje: este é (até onde
                // sabemos) o primeiro usuário — mostra o modal.
                // Não marca confirmacaoDiariaResolvida ainda, pra
                // tentar de novo depois se o usuário não confirmar
                // (ex.: recarregar a página).
                abrirConfirmacaoDiaria();
            }, function () {
                verificacaoDiariaEmAndamento = false;
            });
    }

    function abrirConfirmacaoDiaria() {
        if (document.querySelector('.wt-coleta-dia-modal')) return;

        var padrao = horarioPadraoHoje();

        var modal = document.createElement('div');
        modal.className = 'wt-coleta-modal wt-coleta-dia-modal';
        modal.innerHTML =
            '<div class="box">' +
            '<h3>Horário de coleta de hoje</h3>' +
            '<p>Você é o primeiro a entrar no sistema hoje. Confirme (ou ajuste) os ' +
            'horários de coleta de hoje — a coluna FULL pode ficar em branco quando não ' +
            'há coleta FULL nesse dia. Isso só aparece uma vez por dia, pro primeiro usuário.</p>' +
            '<div class="linha wt-coleta-2col"><span></span>' +
            '<span class="wt-coleta-col-label">Normal</span>' +
            '<span class="wt-coleta-col-label">FULL</span></div>' +
            '<div class="linha wt-coleta-2col"><span>Hoje</span>' +
            '<input type="time" id="wtColetaDiaNormal" value="' + (padrao.normal || '') + '">' +
            '<input type="time" id="wtColetaDiaFull" value="' + (padrao.full || '') + '">' +
            '</div>' +
            '<div class="acoes"><button class="salvar">Confirmar</button></div>' +
            '</div>';

        // Propositalmente SEM botão de cancelar/fechar e sem fechar ao
        // clicar fora — a confirmação é obrigatória pro 1º usuário.
        document.body.appendChild(modal);

        modal.querySelector('.salvar').addEventListener('click', function () {
            var btn = modal.querySelector('.salvar');
            var normal = (document.getElementById('wtColetaDiaNormal') || {}).value || null;
            var full = (document.getElementById('wtColetaDiaFull') || {}).value || null;
            var valor = {
                data: hojeISO(),
                normal: normal,
                full: full,
                confirmado_por: (window.currentUser && (window.currentUser.name || window.currentUser.username)) || null
            };

            btn.disabled = true;
            btn.textContent = 'Salvando...';

            window.supabaseClient
                .from('configuracoes_sistema')
                .upsert({ chave: CONFIG_CHAVE_DIA, valor: valor }, { onConflict: 'chave' })
                .then(function () {
                    confirmacaoDiaria = valor;
                    confirmacaoDiariaResolvida = true;
                    modal.remove();
                    render();
                    if (window.showToast) window.showToast('✅ Horários de coleta de hoje confirmados.', 'success');
                }, function (err) {
                    btn.disabled = false;
                    btn.textContent = 'Confirmar';
                    if (window.showToast) window.showToast('❌ Erro ao salvar: ' + (err && err.message ? err.message : 'tente de novo'), 'error');
                });
        });
    }

    // ---------- init ----------

    function iniciar() {
        schedule = normalizarSchedule(lerScheduleLocal() || DEFAULT_SCHEDULE);
        criar();
        render();
        carregarScheduleSupabase();

        if (timer) clearInterval(timer);
        timer = setInterval(render, 30000);

        window.addEventListener('wt-proxima-coleta', render);
        window.addEventListener('storage', function (e) {
            if (!e || e.key === KEY_HANDLING || e.key === KEY_SCHEDULE || e.key === null) {
                schedule = normalizarSchedule(lerScheduleLocal() || DEFAULT_SCHEDULE);
                render();
            }
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) render();
        });

        window.configurarColetaNFE = abrirConfig;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
