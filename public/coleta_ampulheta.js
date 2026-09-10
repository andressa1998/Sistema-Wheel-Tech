/* =========================================================
 * AMPULHETA DA COLETA
 *
 * Widget fixo no topo, visível em todas as abas.
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

    // 0 = domingo ... 6 = sábado. null = sem coleta nesse dia.
    // Padrão baseado no depósito Araucária (ajustável no widget).
    var DEFAULT_SCHEDULE = {
        '0': null,
        '1': null,
        '2': '13:30',
        '3': '13:30',
        '4': '13:30',
        '5': '13:30',
        '6': '11:30'
    };

    // Janela visual: a areia esvazia ao longo das últimas 12h.
    var JANELA_MS = 12 * 60 * 60 * 1000;

    var DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    var elWrap = null;
    var elSandTop = null;
    var elSandBot = null;
    var elMain = null;
    var elSub = null;
    var timer = null;
    var schedule = null;

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

    function normalizarSchedule(s) {
        var out = {};
        for (var d = 0; d < 7; d++) {
            var v = s ? s[String(d)] : undefined;
            if (typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v.trim())) {
                var p = v.trim().split(':');
                var hh = Math.min(23, parseInt(p[0], 10));
                var mm = Math.min(59, parseInt(p[1], 10));
                out[String(d)] =
                    (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
            } else {
                out[String(d)] = null;
            }
        }
        return out;
    }

    // ---------- cálculo do prazo ----------

    function proximoCorteAgendado() {
        if (!schedule) return null;

        var agora = new Date();

        for (var i = 0; i < 8; i++) {
            var alvo = new Date(agora);
            alvo.setDate(agora.getDate() + i);
            var dia = alvo.getDay();
            var horario = schedule[String(dia)];
            if (!horario) continue;

            var p = horario.split(':');
            alvo.setHours(parseInt(p[0], 10), parseInt(p[1], 10), 0, 0);

            if (alvo.getTime() > agora.getTime()) {
                return alvo.getTime();
            }
        }
        return null;
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

    function calcularPrazo() {
        var a = proximoCorteAgendado();
        var b = prazoManuseio();
        var agora = Date.now();

        var candidatos = [];
        if (a && a > agora - 6 * 60 * 60 * 1000) candidatos.push(a);
        if (b && b > agora - 6 * 60 * 60 * 1000) candidatos.push(b);

        if (candidatos.length === 0) return null;
        return Math.min.apply(null, candidatos);
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

    // ---------- render ----------

    function loginAtivo() {
        var b = document.body;
        if (!b) return true;
        if (b.classList.contains('login-active')) return true;
        var login = document.getElementById('loginScreen');
        if (login && !login.classList.contains('hidden')) return true;
        return false;
    }

    function criar() {
        if (elWrap) return;

        elWrap = document.createElement('div');
        elWrap.id = 'wtColetaWidget';
        elWrap.setAttribute('role', 'status');
        elWrap.title = 'Próxima coleta — clique para configurar os horários';
        elWrap.addEventListener('click', abrirConfig);

        elWrap.innerHTML = [
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

        var style = document.createElement('style');
        style.textContent = [
            '#wtColetaWidget{position:fixed;top:14px;right:18px;z-index:99990;',
            'display:flex;align-items:center;gap:9px;padding:7px 13px 7px 10px;',
            'background:#ffffff;border:1px solid #dbe4f0;border-radius:12px;',
            'box-shadow:0 6px 20px rgba(0,28,80,.12);color:#1f6feb;cursor:pointer;',
            'font-family:inherit;font-size:.8rem;line-height:1.1;',
            'transition:color .3s,border-color .3s,background .3s}',
            '#wtColetaWidget.wt-coleta-hidden{display:none}',
            '#wtColetaWidget svg{flex:0 0 auto;display:block}',
            '#wtColetaWidget .wt-coleta-copy{display:flex;flex-direction:column;gap:2px}',
            '#wtColetaWidget .wt-coleta-main{font-size:.9rem;font-weight:800;white-space:nowrap}',
            '#wtColetaWidget .wt-coleta-sub{font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:#8895ab;white-space:nowrap}',
            '#wtColetaWidget .wt-hg-sand-top,#wtColetaWidget .wt-hg-sand-bot{transition:y .9s linear,height .9s linear}',
            '#wtColetaWidget .wt-hg-stream{opacity:0}',
            '#wtColetaWidget.wt-coleta-correndo .wt-hg-stream{opacity:1;animation:wtHgStream 1s linear infinite}',
            '@keyframes wtHgStream{to{stroke-dashoffset:-8}}',
            '#wtColetaWidget.wt-coleta-correndo .wt-hg-stream{stroke-dasharray:1 3}',
            '#wtColetaWidget.wt-coleta-ok{color:#1f9d55;border-color:#c4ead2}',
            '#wtColetaWidget.wt-coleta-atencao{color:#c77700;border-color:#f3dcae;background:#fffaf0}',
            '#wtColetaWidget.wt-coleta-urgente{color:#d21f1f;border-color:#f2c2c2;background:#fff5f5;',
            'animation:wtColetaPulse 1.4s ease-in-out infinite}',
            '#wtColetaWidget.wt-coleta-urgente .wt-hg-stream{animation-duration:.45s}',
            '@keyframes wtColetaPulse{0%,100%{box-shadow:0 6px 20px rgba(210,31,31,.18)}',
            '50%{box-shadow:0 6px 26px rgba(210,31,31,.42)}}',
            '@media(max-width:640px){#wtColetaWidget{top:8px;right:8px;padding:5px 9px;font-size:.72rem}',
            '#wtColetaWidget .wt-coleta-sub{display:none}}',
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
            '.wt-coleta-modal .acoes{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}',
            '.wt-coleta-modal button{padding:8px 16px;border-radius:9px;border:0;cursor:pointer;font:inherit;font-weight:600}',
            '.wt-coleta-modal .salvar{background:#1f6feb;color:#fff}',
            '.wt-coleta-modal .cancelar{background:#eef1f6;color:#41506b}'
        ].join('');

        document.head.appendChild(style);
        (document.body || document.documentElement).appendChild(elWrap);

        elSandTop = elWrap.querySelector('.wt-hg-sand-top');
        elSandBot = elWrap.querySelector('.wt-hg-sand-bot');
        elMain = elWrap.querySelector('.wt-coleta-main');
        elSub = elWrap.querySelector('.wt-coleta-sub');
    }

    function aplicarAreia(frac) {
        if (!elSandTop) return;
        frac = Math.max(0, Math.min(1, frac));
        var max = 15;
        var alturaTopo = max * frac;
        elSandTop.setAttribute('y', (17 - alturaTopo).toFixed(2));
        elSandTop.setAttribute('height', alturaTopo.toFixed(2));

        if (elSandBot) {
            var alturaBaixo = max * (1 - frac);
            elSandBot.setAttribute('y', (32 - alturaBaixo).toFixed(2));
            elSandBot.setAttribute('height', alturaBaixo.toFixed(2));
        }
    }

    function render() {
        criar();
        if (!elWrap) return;

        if (loginAtivo()) {
            elWrap.classList.add('wt-coleta-hidden');
            return;
        }
        elWrap.classList.remove('wt-coleta-hidden');

        elWrap.classList.remove(
            'wt-coleta-ok',
            'wt-coleta-atencao',
            'wt-coleta-urgente',
            'wt-coleta-correndo'
        );

        var prazo = calcularPrazo();

        if (!prazo) {
            elMain.textContent = 'Sem coleta';
            if (elSub) elSub.textContent = 'configurar';
            aplicarAreia(1);
            elWrap.classList.add('wt-coleta-ok');
            return;
        }

        var agora = Date.now();
        var restante = prazo - agora;

        aplicarAreia(restante / JANELA_MS);

        if (restante > 0) elWrap.classList.add('wt-coleta-correndo');

        if (restante <= 0) {
            elMain.textContent = 'Estourou';
            if (elSub) elSub.textContent = 'coleta ' + formatarHora(prazo);
        } else {
            elMain.textContent = formatarRestante(restante);
            if (elSub) {
                elSub.textContent = mesmoDia(agora, prazo)
                    ? 'coleta hoje ' + formatarHora(prazo)
                    : 'coleta ' + DIAS[new Date(prazo).getDay()] + ' ' + formatarHora(prazo);
            }
        }

        if (restante <= 0 || restante <= 60 * 60 * 1000) {
            elWrap.classList.add('wt-coleta-urgente');
        } else if (restante <= 3 * 60 * 60 * 1000) {
            elWrap.classList.add('wt-coleta-atencao');
        } else {
            elWrap.classList.add('wt-coleta-ok');
        }
    }

    // ---------- config ----------

    function abrirConfig(ev) {
        if (ev) ev.stopPropagation();
        if (document.querySelector('.wt-coleta-modal')) return;

        var atual = schedule || DEFAULT_SCHEDULE;

        var linhas = '';
        for (var d = 0; d < 7; d++) {
            linhas +=
                '<div class="linha"><span>' + DIAS[d] + '</span>' +
                '<input type="time" data-dia="' + d + '" value="' +
                (atual[String(d)] || '') + '"></div>';
        }

        var modal = document.createElement('div');
        modal.className = 'wt-coleta-modal';
        modal.innerHTML =
            '<div class="box">' +
            '<h3>Horários de coleta</h3>' +
            '<p>Horário limite de cada dia (deixe em branco quando não há coleta). ' +
            'Igual "Meus horários de coleta" do Mercado Livre.</p>' +
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
            modal.querySelectorAll('input[data-dia]').forEach(function (inp) {
                nova[inp.getAttribute('data-dia')] = inp.value || null;
            });
            schedule = normalizarSchedule(nova);
            salvarScheduleLocal(schedule);
            salvarScheduleSupabase(schedule);
            modal.remove();
            render();
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
