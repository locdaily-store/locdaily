(function(){
    "use strict";

    const VERSION = "28.16.2-final";
    const DANGEROUS_URL = /^\s*(?:javascript|vbscript):/i;

    function escapeHTML(value){
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function escapeAttr(value){
        return escapeHTML(value).replace(/`/g, "&#096;");
    }

    function inlineJsString(value){
        return escapeAttr(JSON.stringify(String(value ?? "")));
    }

    function safeUrl(value, options={}){
        const raw=String(value ?? "").trim();
        if(!raw) return "";
        if(DANGEROUS_URL.test(raw)) return "";
        if(/^data:/i.test(raw)){
            return options.allowImageData && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(raw) ? raw : "";
        }
        if(/^blob:/i.test(raw)) return options.allowBlob ? raw : "";
        try{
            const url=new URL(raw, location.href);
            if(url.protocol === "https:") return raw;
            if(url.protocol === "http:" && ["localhost","127.0.0.1"].includes(url.hostname)) return raw;
            if(url.origin === location.origin) return raw;
        }catch(_error){
            if(/^(?:\.\/|\.\.\/|\/|[A-Za-z0-9_.~-]+(?:\/|$))/.test(raw)) return raw;
        }
        return "";
    }

    function readArray(key, fallback=[]){
        try{
            const raw=localStorage.getItem(String(key||""));
            if(raw===null || raw==="") return Array.isArray(fallback) ? [...fallback] : [];
            const parsed=JSON.parse(raw);
            if(Array.isArray(parsed)) return parsed;
            window.dispatchEvent(new CustomEvent("ldm-data-cache-warning",{
                detail:{key:String(key||""),reason:"not_array"}
            }));
            return Array.isArray(fallback) ? [...fallback] : [];
        }catch(error){
            console.warn(`Cache ${String(key||"")} tidak dapat dibaca:`,error);
            window.dispatchEvent(new CustomEvent("ldm-data-cache-warning",{
                detail:{key:String(key||""),reason:"invalid_json",message:error?.message||String(error)}
            }));
            return Array.isArray(fallback) ? [...fallback] : [];
        }
    }

    function readObject(key, fallback={}){
        try{
            const raw=localStorage.getItem(String(key||""));
            if(raw===null || raw==="") return fallback && typeof fallback==="object" ? {...fallback} : {};
            const parsed=JSON.parse(raw);
            if(parsed && typeof parsed==="object" && !Array.isArray(parsed)) return parsed;
            return fallback && typeof fallback==="object" ? {...fallback} : {};
        }catch(error){
            console.warn(`Cache ${String(key||"")} tidak dapat dibaca:`,error);
            return fallback && typeof fallback==="object" ? {...fallback} : {};
        }
    }

    function stripLegacyCredentialFields(account){
        if(!account || typeof account !== "object") return account;
        const copy={...account};
        delete copy.password;
        delete copy.passwordHash;
        delete copy.password_hash;
        delete copy.pin;
        delete copy.passwordPlaintext;
        return copy;
    }

    function retireLegacyCredentials(){
        try{
            const raw=localStorage.getItem("daftarAkun");
            if(!raw) return {changed:false,count:0};
            const accounts=JSON.parse(raw);
            if(!Array.isArray(accounts)) return {changed:false,count:0};
            let changed=false;
            let count=0;
            const cleaned=accounts.map(account=>{
                if(!account || typeof account !== "object") return account;
                const hasCredential=["password","passwordHash","password_hash","pin","passwordPlaintext"]
                    .some(key=>Object.prototype.hasOwnProperty.call(account,key));
                if(hasCredential){ changed=true; count++; }
                return stripLegacyCredentialFields(account);
            });
            if(changed) localStorage.setItem("daftarAkun",JSON.stringify(cleaned));
            return {changed,count};
        }catch(_error){
            return {changed:false,count:0};
        }
    }

    function ensureReferrerPolicy(){
        if(document.querySelector('meta[name="referrer"]')) return;
        const meta=document.createElement("meta");
        meta.name="referrer";
        meta.content="strict-origin-when-cross-origin";
        document.head.appendChild(meta);
    }

    function hardenExternalLinks(root){
        (root || document).querySelectorAll?.('a[target="_blank"]').forEach(link=>{
            const rel=new Set(String(link.rel || "").split(/\s+/).filter(Boolean));
            rel.add("noopener");
            rel.add("noreferrer");
            link.rel=Array.from(rel).join(" ");
        });
    }

    function hardenForms(root){
        (root || document).querySelectorAll?.('input[type="password"]').forEach(input=>{
            if(!input.autocomplete){
                input.autocomplete=/new|confirm|ulang/i.test(`${input.id} ${input.name}`)
                    ? "new-password" : "current-password";
            }
        });
    }

    function hardenUrls(root){
        const nodes=[];
        if(root?.nodeType===1) nodes.push(root);
        root?.querySelectorAll?.('[href],[src],[action],[formaction]').forEach(node=>nodes.push(node));
        nodes.forEach(node=>{
            ["href","src","action","formaction"].forEach(attr=>{
                if(!node.hasAttribute?.(attr)) return;
                const value=String(node.getAttribute(attr)||"");
                if(DANGEROUS_URL.test(value)) node.removeAttribute(attr);
            });
            if(node.matches?.('iframe[srcdoc],object,embed')) node.remove();
        });
    }

    function observeDynamicDom(){
        if(typeof MutationObserver!=="function" || !document.documentElement) return;
        let pending=[];
        let scheduled=false;
        const flush=()=>{
            scheduled=false;
            const batch=pending;
            pending=[];
            batch.forEach(node=>{
                hardenExternalLinks(node);
                hardenForms(node);
                hardenUrls(node);
            });
        };
        const observer=new MutationObserver(records=>{
            records.forEach(record=>record.addedNodes.forEach(node=>{
                if(node && node.nodeType===1) pending.push(node);
            }));
            if(pending.length && !scheduled){
                scheduled=true;
                queueMicrotask(flush);
            }
        });
        observer.observe(document.documentElement,{childList:true,subtree:true});
    }

    function diagnostics(){
        const cfg=window.LDM_SUPABASE_CONFIG || {};
        const key=String(cfg.publishableKey || "");
        const mixed=Array.from(document.querySelectorAll("script[src],link[href],img[src]"))
            .map(node=>node.src || node.href || "")
            .filter(url=>/^http:\/\//i.test(url));
        let legacyCredentialFieldCount=0;
        try{
            const accounts=JSON.parse(localStorage.getItem("daftarAkun") || "[]");
            if(Array.isArray(accounts)) legacyCredentialFieldCount=accounts.filter(account=>account && ["password","passwordHash","password_hash","pin","passwordPlaintext"].some(key=>Object.prototype.hasOwnProperty.call(account,key))).length;
        }catch(_error){}
        return {
            version:VERSION,
            secureContext:window.isSecureContext || location.hostname === "localhost",
            https:location.protocol === "https:" || location.hostname === "localhost",
            framed:window.top !== window.self,
            referrerPolicy:document.querySelector('meta[name="referrer"]')?.content || "",
            csp:Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')),
            mixedContentCount:mixed.length,
            externalBlankWithoutNoopener:document.querySelectorAll('a[target="_blank"]:not([rel~="noopener"])').length,
            legacyCredentialFieldCount,
            supabaseConfigured:Boolean(cfg.url && key),
            publishableKeyLooksSafe:Boolean(key && (/^sb_publishable_/i.test(key) || /^eyJ/i.test(key))) && !/service_role|secret/i.test(key)
        };
    }

    function boot(){
        retireLegacyCredentials();
        hardenExternalLinks(document);
        hardenForms(document);
        hardenUrls(document);
        observeDynamicDom();
        window.dispatchEvent(new CustomEvent("ldm-security-ready",{detail:diagnostics()}));
    }

    ensureReferrerPolicy();
    window.LDMSecurity=Object.freeze({
        version:VERSION,
        escapeHTML,
        escapeAttr,
        inlineJsString,
        safeUrl,
        readArray,
        readObject,
        stripLegacyCredentialFields,
        retireLegacyCredentials,
        diagnostics,
        hardenExternalLinks,
        hardenForms,
        hardenUrls
    });
    if(typeof globalThis.esc !== "function"){
        globalThis.esc=escapeHTML;
    }
    globalThis.LDMDataSafe=Object.freeze({
        readArray,
        readObject
    });
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
    else boot();
})();
