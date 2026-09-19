(function () {
    if (window.__wmPassBound) return true;
    window.__wmPassBound = true;
    var box = null;
    var activeInput = null;

    function css() {
        if (document.getElementById('wm-pass-style')) return;
        var style = document.createElement('style');
        style.id = 'wm-pass-style';
        style.textContent = '.wm-pass-suggest{position:fixed;z-index:2147483647;min-width:180px;max-width:min(90vw,360px);max-height:220px;overflow:auto;background:#fff;color:#222;border:1px solid rgba(0,0,0,.18);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}'
            + '.wm-pass-suggest button{display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:transparent;color:inherit;cursor:pointer;}'
            + '.wm-pass-suggest button:active,.wm-pass-suggest button:hover{background:#f2f4f6;}'
            + '.wm-pass-suggest small{display:block;color:#667;font-size:12px;margin-top:2px;}';
        (document.head || document.documentElement).appendChild(style);
    }

    function visible(el) {
        if (!el || el.disabled) return false;
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    }

    function usernameLike(el) {
        var blob = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.autocomplete || '') + ' ' + (el.placeholder || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
        return /user|email|login|account|phone|alias|账号|用户|邮箱|手机|会员/.test(blob);
    }

    function findUsername(passwordInput) {
        var form = passwordInput && passwordInput.form;
        var nodes = form ? form.querySelectorAll('input') : document.querySelectorAll('input');
        var fallback = null;
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            if (el === passwordInput) break;
            if (!visible(el)) continue;
            var type = (el.type || 'text').toLowerCase();
            if (type === 'password' || type === 'hidden' || type === 'submit' || type === 'button' || type === 'checkbox' || type === 'radio' || type === 'file') continue;
            if (type === 'email' || usernameLike(el)) return el;
            if (!fallback && (type === 'text' || type === 'tel' || type === '')) fallback = el;
        }
        return fallback;
    }

    function pairFor(el) {
        if (!el) return null;
        var type = (el.type || '').toLowerCase();
        if (type === 'password') {
            return { username: findUsername(el), password: el };
        }
        var form = el.form;
        var pwd = form ? form.querySelector('input[type="password"]') : document.querySelector('input[type="password"]');
        if (!pwd) return null;
        if (el === findUsername(pwd) || usernameLike(el) || type === 'email') {
            return { username: el, password: pwd };
        }
        return null;
    }

    function hideBox() {
        if (box && box.parentNode) box.parentNode.removeChild(box);
        box = null;
    }

    function nativeSet(el, value) {
        if (!el) return;
        var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function fill(item) {
        var pair = pairFor(activeInput) || {};
        if (pair.username) nativeSet(pair.username, item.username || '');
        if (pair.password) nativeSet(pair.password, item.password || '');
        hideBox();
    }

    function showBox(input, items) {
        css();
        hideBox();
        if (!items || !items.length) return;
        box = document.createElement('div');
        box.className = 'wm-pass-suggest';
        items.forEach(function (item) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = '<span></span><small></small>';
            btn.querySelector('span').textContent = item.username || '(无账号)';
            btn.querySelector('small').textContent = item.website || '';
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); fill(item); });
            box.appendChild(btn);
        });
        document.documentElement.appendChild(box);
        var rect = input.getBoundingClientRect();
        var top = rect.bottom + 4;
        var left = rect.left;
        box.style.minWidth = Math.max(180, rect.width) + 'px';
        box.style.left = Math.max(8, Math.min(left, window.innerWidth - box.offsetWidth - 8)) + 'px';
        box.style.top = Math.min(top, window.innerHeight - box.offsetHeight - 8) + 'px';
    }

    function query(input) {
        var pair = pairFor(input);
        if (!pair) { hideBox(); return; }
        activeInput = input;
        var typed = pair.username && input === pair.username ? (input.value || '') : '';
        var raw = '[]';
        try { raw = WebManagerChrome.queryPasswords(location.href, typed); } catch (e) { raw = '[]'; }
        var items = [];
        try { items = JSON.parse(raw || '[]'); } catch (e) { items = []; }
        showBox(input, items);
    }

    function capture(formOrInput) {
        var pwd = null;
        if (formOrInput && formOrInput.querySelector) pwd = formOrInput.querySelector('input[type="password"]');
        if (!pwd && formOrInput && (formOrInput.type || '').toLowerCase() === 'password') pwd = formOrInput;
        if (!pwd || !pwd.value) return;
        var user = findUsername(pwd);
        if (!user || !user.value) return;
        try {
            WebManagerChrome.saveLogin(JSON.stringify({
                url: location.href,
                title: document.title || '',
                username: user.value,
                password: pwd.value
            }));
        } catch (e) {}
    }

    document.addEventListener('focusin', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT') return;
        if (pairFor(el)) query(el);
    }, true);
    document.addEventListener('input', function (e) {
        var el = e.target;
        if (!el || el.tagName !== 'INPUT') return;
        if (activeInput === el && pairFor(el)) query(el);
    }, true);
    document.addEventListener('focusout', function (e) {
        var el = e.target;
        if (el && (el.type || '').toLowerCase() === 'password') capture(el);
        setTimeout(function () {
            if (!box) return;
            if (document.activeElement && box.contains(document.activeElement)) return;
            hideBox();
        }, 120);
    }, true);
    document.addEventListener('submit', function (e) {
        capture(e.target);
    }, true);
    window.addEventListener('scroll', hideBox, true);
    window.addEventListener('resize', hideBox);
    return true;
})();
