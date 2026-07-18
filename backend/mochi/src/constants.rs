pub const MOCHI_PREFIX: &str = "/!!/";
pub const COVER_PREFIX: &str = "/!cover!/";
pub const PART_1: &str = r##"<script>
(function() {
    var _U = window.URL;
    try {
        window.URL = function(u, b) {
            if ((!u || u === "") && !b) return new _U(window.location.href);
            return new _U(u, b);
        };

        if (navigator.serviceWorker) {
            Object.defineProperty(navigator, 'serviceWorker', {
                value: {
                    register: function() { return new Promise(() => {}); }, 
                    ready: new Promise(() => {}),
                    addEventListener: function() {},
                    removeEventListener: function() {},
                    getRegistrations: function() { return Promise.resolve([]); }
                },
                configurable: true
            });
        }
    } catch(e) {}

    try {
        window.URL.prototype = _U.prototype;
        window.URL.createObjectURL = function(o) { return _U.createObjectURL(o); };
        window.URL.revokeObjectURL = function(u) { return _U.revokeObjectURL(u); };
        for (let k in _U) { if (!(k in window.URL)) window.URL[k] = _U[k]; }
        
        const _p = history.pushState;
        const _r = history.replaceState;
        history.pushState = function(s, t, u) { try { _p.call(this, s, t, u); } catch(e) {} };
        history.replaceState = function(s, t, u) { try { _r.call(this, s, t, u); } catch(e) {} };

        const _ae = window.addEventListener;
        window.addEventListener = function(t, l, o) {
            if (t === 'beforeunload') return;
            return _ae.call(this, t, l, o);
        };
        const _re = window.removeEventListener;
        window.removeEventListener = function(t, l, o) {
            if (t === 'beforeunload') return;
            return _re.call(this, t, l, o);
        };
        Object.defineProperty(window, 'onbeforeunload', {
            get: function() { return null; },
            set: function() { },
            configurable: true
        });

        Object.defineProperty(window, 'devicePixelRatio', {
            get: function() { return 1; }
        });
    } catch(e) {}

    window.__MOCHI_PREFIX__="/!!/";
    window.__MOCHI_TARGET__=""##;

pub const PART_2: &str = r##"";
    window.__MOCHI_BASE__ = window.__MOCHI_BASE__ || ((window.location.origin || "") + window.__MOCHI_PREFIX__);
    
    try {
        const baseEl = document.querySelector('base[href]');
        if (baseEl && baseEl.href) {
             window.__MOCHI_TARGET__ = baseEl.href;
        }
    } catch(e) {}

    try {
        if (typeof window.__MOCHI_TARGET__ === 'string' && window.__MOCHI_TARGET__.startsWith('http')) {
            const t = new _U(window.__MOCHI_TARGET__);
            const current = new _U(window.location.href);
            const needsSearch = (!current.search || current.search === '?') && t.search;
            const needsHash = (!current.hash) && t.hash;
            if ((needsSearch || needsHash) && history && typeof history.replaceState === 'function') {
                if (needsSearch) current.search = t.search;
                if (needsHash) current.hash = t.hash;
                history.replaceState(null, '', current.toString());
            }
        }
    } catch(e) {}

    const _MK = 'q7Zx!9pL';
    const __mochiEncode = (url) => {
        try {
            const e = encodeURIComponent(url);
            let x = '';
            for (let i = 0; i < e.length; i++) {
                x += String.fromCharCode(e.charCodeAt(i) ^ _MK.charCodeAt(i % _MK.length));
            }
            return btoa(x).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') + '/';
        } catch(e) { return url; }
    };

    const rewrite = (url) => {
        if (!url) return url;
        if (typeof url !== 'string') return url;
        if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("javascript:")) return url;
        if (url.includes(window.__MOCHI_PREFIX__)) return url;
        
        try {
            const match = document.cookie.match(/(?:^|; )mochi_base=([^;]*)/);
            if (match && url.startsWith('/')) {
                return window.__MOCHI_BASE__ + match[1] + '/!a!' + url;
            }
            const resolved = new _U(url, window.__MOCHI_TARGET__).href;
            return window.__MOCHI_BASE__ + __mochiEncode(resolved);
        } catch (e) {
            return url;
        }
    };

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
        if (input instanceof Request) input = new Request(rewrite(input.url), input);
        else input = rewrite(String(input));
        return originalFetch(input, init)
    };
    
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        return originalOpen.call(this, method, rewrite(String(url)), ...args)
    };
    
    const isDirectWsHost = (hostname) => {
        const h = String(hostname || "").toLowerCase().replace(/^www\./, "");
        if (!h) return false;
        const directHosts = [
            "discord.com",
            "discord.gg",
            "discord.media",
            "discordapp.com",
            "discordapp.net"
        ];
        return directHosts.some((suffix) => h === suffix || h.endsWith("." + suffix));
    };

    const originalWS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        if (!url) return new originalWS(url, protocols);
        let target = url;
        if (!target.startsWith("ws")) {
            try {
                target = new _U(url, window.__MOCHI_TARGET__).href
            } catch (e) {}
            target = target.replace(/^http/, "ws")
        }
        try {
            const targetHost = new _U(target, window.__MOCHI_TARGET__).hostname;
            if (isDirectWsHost(targetHost)) {
                return new originalWS(target, protocols);
            }
        } catch (e) {}
        const proxyUrl = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host + window.__MOCHI_PREFIX__ + "ws/" + encodeURIComponent(target);
        const ws = new originalWS(proxyUrl, protocols);
        ws.binaryType = "arraybuffer";
        return ws
    };
    
    const originalWorker = window.Worker;
    window.Worker = function(scriptURL, options) {
        return new originalWorker(rewrite(String(scriptURL)), options)
    };
    
    const hookProperty = (proto, prop) => {
        try {
            const desc = Object.getOwnPropertyDescriptor(proto, prop);
            if (!desc || !desc.set) return;
            const originalSet = desc.set;
            Object.defineProperty(proto, prop, {
                get: desc.get,
                set: function(val) {
                    return originalSet.call(this, rewrite(String(val)));
                },
                configurable: true,
                enumerable: true
            });
        } catch(e) {}
    };
    hookProperty(HTMLIFrameElement.prototype, "src");
    hookProperty(HTMLImageElement.prototype, "src");
    hookProperty(HTMLScriptElement.prototype, "src");
    hookProperty(HTMLSourceElement.prototype, "src");
    hookProperty(HTMLMediaElement.prototype, "src");
    hookProperty(HTMLEmbedElement.prototype, "src");
    hookProperty(HTMLObjectElement.prototype, "data");
    hookProperty(HTMLLinkElement.prototype, "href");

    const originalSetAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (typeof value === "string" && (name === "src" || name === "href" || name === "poster" || name === "data" || name === "action")) {
            value = rewrite(value);
        }
        return originalSetAttr.call(this, name, value);
    };

    const downloadExts = [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".bz2", ".xz", ".exe", ".msi", ".apk", ".dmg", ".deb", ".rpm", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".iso", ".img", ".bin", ".msix", ".pkg", ".mp3", ".mp4", ".wav", ".flac", ".mkv", ".mov"];
    document.addEventListener("click", function(e) {
        if (e.defaultPrevented) return;
        const a = e.target.closest("a");
        if (!a) return;
        const href = a.getAttribute("data-mochi-orig-href") || a.getAttribute("href");
        if (!href) return;
        if (href.startsWith("javascript:") || href.startsWith("#")) return;
        const lower = href.toLowerCase();
        const hasDownload = a.hasAttribute("download") || downloadExts.some(ext => lower.endsWith(ext));
        const mochied = rewrite(href);
        if (!hasDownload) return;
        e.preventDefault();
        if (a.target === "_blank" || e.ctrlKey || e.metaKey || a.hasAttribute("download")) {
            window.open(mochied, "_blank");
        } else {
            window.location.assign(mochied);
        }
    });

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        try {
            navigator.serviceWorker.controller.postMessage({
                type: "mochi-base",
                base: window.__MOCHI_BASE__
            });
        } catch (e) {}
    }

    if (window.location.href.includes("vidsrc") && window.location.href.includes("/embed/tv")) {
        const doAutoPlay = () => {
            let attempts = 0;
            const autoPlayTimer = setInterval(() => {
                attempts++;
                const activeEp = document.querySelector("#eps .ep_active");
                if (activeEp) {
                    activeEp.click();
                    clearInterval(autoPlayTimer);
                }
                if (attempts > 50) clearInterval(autoPlayTimer);
            }, 40);
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(doAutoPlay, 500));
        } else {
            setTimeout(doAutoPlay, 200);
        }
    }

    window.dataLayer = [];
    window.gtag = function() {};
    window.ga = function() {};
    window.google = window.google || {};
    window.google.ima = window.google.ima || {
        AdsLoader: function() { return { addEventListener: function(){}, contentComplete: function(){}, requestAds: function(){} }; },
        AdDisplayContainer: function() { return { initialize: function(){} }; },
        AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: 'adsManagerLoaded' } },
        AdErrorEvent: { Type: { AD_ERROR: 'adError' } },
        ViewMode: { NORMAL: 'normal' }
    };
    window.__tcfapi = function(a,b,c) { if (typeof c === 'function') c(null, false); };
})()
</script>"##; 