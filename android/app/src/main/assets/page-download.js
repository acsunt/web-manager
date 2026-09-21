(function () {
    if (window.__wmDlBound) return true;
    window.__wmDlBound = true;

    var CHUNK = 256 * 1024;
    var blobs = window.__wmDlBlobs || Object.create(null);
    window.__wmDlBlobs = blobs;
    function hookUrl(api) {
        if (!api || typeof api.createObjectURL !== 'function') return;
        var origCreate = api.createObjectURL.bind(api);
        var origRevoke = typeof api.revokeObjectURL === 'function' ? api.revokeObjectURL.bind(api) : function () {};
        api.createObjectURL = function (obj) {
            var url = origCreate(obj);
            try { blobs[url] = obj; } catch (e) {}
            return url;
        };
        api.revokeObjectURL = function (url) {
            try { origRevoke(url); } catch (e) {}
            setTimeout(function () {
                try { delete blobs[url]; } catch (e) {}
            }, 8000);
        };
    }
    hookUrl(URL);
    hookUrl(window.webkitURL);

    function native() {
        return window.WebManagerChrome || window.Android;
    }

    function toB64(u8) {
        var s = '';
        for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
        return btoa(s);
    }

    function saveBytes(u8, mime, name) {
        var n = native();
        if (!n) return false;
        if (typeof n.beginDownloadFile === 'function') {
            try {
                n.beginDownloadFile(mime || '', name || '');
                for (var i = 0; i < u8.length; i += CHUNK) {
                    var part = u8.subarray(i, Math.min(i + CHUNK, u8.length));
                    if (n.appendDownloadFile(toB64(part)) === false) throw new Error('append');
                }
                n.finishDownloadFile();
                return true;
            } catch (e) {
                try { n.cancelDownloadFile(); } catch (x) {}
            }
        }
        if (typeof n.saveBlobDownload === 'function') {
            var mimePart = mime || 'application/octet-stream';
            n.saveBlobDownload('data:' + mimePart + ';base64,' + toB64(u8), mimePart, name || '');
            return true;
        }
        return false;
    }

    function saveBlob(blob, name) {
        if (!blob) return false;
        if (typeof blob.arrayBuffer === 'function') {
            blob.arrayBuffer().then(function (buf) {
                saveBytes(new Uint8Array(buf), blob.type || '', name);
            }).catch(function () {
                var reader = new FileReader();
                reader.onload = function () {
                    var n = native();
                    if (n && typeof n.saveBlobDownload === 'function') {
                        n.saveBlobDownload(String(reader.result || ''), blob.type || '', name || '');
                    }
                };
                reader.readAsDataURL(blob);
            });
            return true;
        }
        var reader = new FileReader();
        reader.onload = function () {
            var n = native();
            if (n && typeof n.saveBlobDownload === 'function') {
                n.saveBlobDownload(String(reader.result || ''), blob.type || '', name || '');
            }
        };
        reader.readAsDataURL(blob);
        return true;
    }

    function filenameFrom(a, href) {
        var name = '';
        try { name = (a && (a.download || (a.getAttribute && a.getAttribute('download')))) || ''; } catch (e) {}
        if (name) return name;
        try {
            var path = String(href || '').split('?')[0].split('#')[0];
            var last = path.substring(path.lastIndexOf('/') + 1);
            if (last && last.indexOf('.') > 0) return decodeURIComponent(last);
        } catch (e) {}
        return '';
    }

    function interceptHref(href, name) {
        if (!href) return false;
        if (href.indexOf('blob:') === 0) {
            if (blobs[href]) return saveBlob(blobs[href], name);
            try {
                fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
                    saveBlob(b, name);
                }).catch(function () {});
                return true;
            } catch (e) {
                return false;
            }
        }
        if (href.indexOf('data:') === 0) {
            var n = native();
            if (n && typeof n.saveBlobDownload === 'function') {
                n.saveBlobDownload(href, '', name || '');
                return true;
            }
        }
        return false;
    }

    function interceptAnchor(a) {
        if (!a) return false;
        var href = '';
        try { href = a.href || a.getAttribute('href') || ''; } catch (e) {}
        if (href.indexOf('blob:') !== 0 && href.indexOf('data:') !== 0) return false;
        return interceptHref(href, filenameFrom(a, href));
    }

    var origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (interceptAnchor(this)) return;
        return origClick.apply(this, arguments);
    };

    var origDispatch = HTMLAnchorElement.prototype.dispatchEvent;
    HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
        if (ev && ev.type === 'click' && interceptAnchor(this)) return true;
        return origDispatch.apply(this, arguments);
    };

    document.addEventListener('click', function (ev) {
        var t = ev.target;
        while (t && t.nodeType === 1 && t.tagName !== 'A') t = t.parentElement;
        if (t && t.tagName === 'A' && interceptAnchor(t)) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
        }
    }, true);

    return true;
})();
