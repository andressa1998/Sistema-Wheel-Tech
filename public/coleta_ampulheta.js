/* =========================================================
 * AMPULHETA DA COLETA
 *
 * Widget fixo no topo, visível em todas as abas.
 * Mostra quanto falta para o prazo de coleta mais próximo
 * (menor estimated_handling_limit entre as vendas pendentes).
 *
 * A areia vai "caindo" conforme o tempo passa e o widget
 * fica vermelho quando está perto de estourar.
 *
 * A fonte do prazo é o localStorage "wt_proxima_coleta",
 * atualizado por nfe_manager.js (atualizarProximaColetaNFE).
 * ========================================================= */

(function () {
    'use strict';

    var STORAGE_KEY = 'wt_proxima_coleta';

    // Janela visual: a areia esvazia ao longo das últimas 24h.
    var JANELA_MS = 24 * 60 * 60 * 1000;

    var elWrap = null;
    var elSand = null;
    var elStream = null;
    var elTexto = null;
    var elSub = null;
    var timer = null;

    function lerPrazo() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var dados = JSON.parse(raw);
            if (!dados || !dados.prazo) return null;
            var t = new Date(dados.prazo).getTime();
            if (!isFinite(t)) return null;
            return { prazo: t, calculadoEm: dados.calculado_em || null };
        } catch (e) {
            return null;
        }
    }

    function formatarRestante(ms) {
        if (ms <= 0) return 'Prazo estourado';
        var totalMin = Math.floor(ms / 60000);
        var h = Math.floor(totalMin / 60);
        var m = totalMin % 60;
        if (h >= 24) {
            var d = Math.floor(h / 24);
            var hr = h % 24;
            return d + 'd ' + hr + 'h';
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
        var da = new Date(a);
        var db = new Date(b);
        return da.getFullYear() === db.getFullYear() &&
            da.getMonth() === db.getMonth() &&
            da.getDate() === db.getDate();
    }

    function criar() {
        if (elWrap) return;

        elWrap = document.createElement('div');
        elWrap.id = 'wtColetaWidget';
        elWrap.setAttribute('role', 'status');
        elWrap.title = 'Prazo de coleta mais próximo';

        elWrap.innerHTML = [
            '<svg viewBox="0 0 24 34" width="26" height="36" aria-hidden="true">',
            '  <path d="M4 2 H20 M4 32 H20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
            '  <path d="M4 2 L4 5 Q4 12 12 17 Q20 12 20 5 L20 2 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
            '  <path d="M4 32 L4 29 Q4 22 12 17 Q20 22 20 29 L20 32 Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
            '  <clipPath id="wtHgTop"><path d="M4 2 L4 5 Q4 12 12 17 Q20 12 20 5 L20 2 Z"/></clipPath>',
            '  <clipPath id="wtHgBot"><path d="M4 32 L4 29 Q4 22 12 17 Q20 22 20 29 L20 32 Z"/></clipPath>',
            '  <rect class="wt-hg-sand-top" x="3" y="2" width="18" height="15" clip-path="url(#wtHgTop)" fill="currentColor"/>',
            '  <rect class="wt-hg-sand-bot" x="3" y="17" width="18" height="15" clip-path="url(#wtHgBot)" fill="currentColor"/>',
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
            'box-shadow:0 6px 20px rgba(0,28,80,.12);color:#1f6feb;',
            'font-family:inherit;font-size:.8rem;line-height:1.1;pointer-events:auto;',
            'transition:color .3s,border-color .3s,background .3s}',
            '#wtColetaWidget.wt-coleta-hidden{display:none}',
            '#wtColetaWidget svg{flex:0 0 auto;display:block}',
            '#wtColetaWidget .wt-coleta-copy{display:flex;flex-direction:column;gap:2px}',
            '#wtColetaWidget .wt-coleta-main{font-size:.9rem;font-weight:800;white-space:nowrap}',
            '#wtColetaWidget .wt-coleta-sub{font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:#8895ab}',
            '#wtColetaWidget .wt-hg-sand-top{transition:y .8s linear,height .8s linear}',
            '#wtColetaWidget .wt-hg-sand-bot{transition:y .8s linear,height .8s linear}',
            '#wtColetaWidget .wt-hg-stream{opacity:0}',
            '#wtColetaWidget.wt-coleta-correndo .wt-hg-stream{opacity:1;animation:wtHgStream 1s linear infinite}',
            '@keyframes wtHgStream{0%{stroke-dasharray:1 3;stroke-dashoffset:0}100%{stroke-dashoffset:-8}}',
            /* estados */
            '#wtColetaWidget.wt-coleta-ok{color:#1f9d55;border-color:#c4ead2}',
            '#wtColetaWidget.wt-coleta-atencao{color:#c77700;border-color:#f3dcae;background:#fffaf0}',
            '#wtColetaWidget.wt-coleta-urgente{color:#d21f1f;border-color:#f2c2c2;background:#fff5f5;',
            'animation:wtColetaPulse 1.4s ease-in-out infinite}',
            '#wtColetaWidget.wt-coleta-urgente .wt-hg-stream{animation-duration:.45s}',
            '@keyframes wtColetaPulse{0%,100%{box-shadow:0 6px 20px rgba(210,31,31,.18)}',
            '50%{box-shadow:0 6px 26px rgba(210,31,31,.42)}}',
            '@media(max-width:640px){#wtColetaWidget{top:8px;right:8px;padding:5px 9px;font-size:.72rem}',
            '#wtColetaWidget .wt-coleta-sub{display:none}}'
        ].join('');

        document.head.appendChild(style);
        (document.body || document.documentElement).appendChild(elWrap);

        elSand = elWrap.querySelector('.wt-hg-sand-top');
        elStream = elWrap.querySelector('.wt-hg-stream');
        elTexto = elWrap.querySelector('.wt-coleta-main');
        elSub = elWrap.querySelector('.wt-coleta-sub');
    }

    function loginAtivo() {
        var b = document.body;
        if (!b) return true;
        if (b.classList.contains('login-active')) return true;
        var login = document.getElementById('loginScreen');
        if (login && !login.classList.contains('hidden')) return true;
        return false;
    }

    function render() {
        criar();
        if (!elWrap) return;

        if (loginAtivo()) {
            elWrap.classList.add('wt-coleta-hidden');
            return;
        }
        elWrap.classList.remove('wt-coleta-hidden');

        var info = lerPrazo();

        elWrap.classList.remove(
            'wt-coleta-ok',
            'wt-coleta-atencao',
            'wt-coleta-urgente',
            'wt-coleta-correndo'
        );

        if (!info) {
            elTexto.textContent = 'Sem coleta';
            if (elSub) elSub.textContent = 'pendente';
            // ampulheta cheia, parada
            aplicarAreia(1);
            elWrap.classList.add('wt-coleta-ok');
            return;
        }

        var agora = Date.now();
        var restante = info.prazo - agora;

        var frac = Math.max(0, Math.min(1, restante / JANELA_MS));
        aplicarAreia(frac);

        if (restante > 0) {
            elWrap.classList.add('wt-coleta-correndo');
        }

        // texto
        if (restante <= 0) {
            elTexto.textContent = 'Estourou';
            if (elSub) elSub.textContent = 'coleta ' + formatarHora(info.prazo);
        } else {
            elTexto.textContent = formatarRestante(restante);
            if (elSub) {
                elSub.textContent = mesmoDia(agora, info.prazo)
                    ? 'coleta hoje ' + formatarHora(info.prazo)
                    : 'coleta ' + formatarHora(info.prazo);
            }
        }

        // cor
        if (restante <= 0 || restante <= 60 * 60 * 1000) {
            elWrap.classList.add('wt-coleta-urgente');
        } else if (restante <= 3 * 60 * 60 * 1000) {
            elWrap.classList.add('wt-coleta-atencao');
        } else {
            elWrap.classList.add('wt-coleta-ok');
        }
    }

    // frac = 1 -> areia cheia em cima; 0 -> tudo embaixo
    function aplicarAreia(frac) {
        if (!elSand) return;
        // câmara de cima ocupa y 2..17 (altura 15)
        var alturaMax = 15;
        var altura = alturaMax * frac;
        var y = 17 - altura;
        elSand.setAttribute('y', y.toFixed(2));
        elSand.setAttribute('height', altura.toFixed(2));

        var bot = elWrap.querySelector('.wt-hg-sand-bot');
        if (bot) {
            // câmara de baixo ocupa y 17..32; enche de baixo pra cima
            var alturaBot = alturaMax * (1 - frac);
            bot.setAttribute('y', (32 - alturaBot).toFixed(2));
            bot.setAttribute('height', alturaBot.toFixed(2));
        }
    }

    function iniciar() {
        criar();
        render();
        if (timer) clearInterval(timer);
        timer = setInterval(render, 30000);

        window.addEventListener('wt-proxima-coleta', render);
        window.addEventListener('storage', function (e) {
            if (!e || e.key === STORAGE_KEY || e.key === null) render();
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) render();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();
