(function(){
    "use strict";

    const VERSION="27.9.0-v28.18.1";
    let running=false;
    let ready=false;
    let retryTimer=null;
    let pendingRetryReason="";
    let attempt=0;

    const PRODUCT_PAGES=new Set([
        "purchase-order.html",
        "backup & restore.html",
        "barang.html",
        "dashboard.html",
        "goods.receipt.html",
        "kartu-stok.html",
        "kasir.html",
        "laporan.html",
        "retur.html",
        "shift-closing.html",
        "stock-opname.html"
    ]);

    function currentPage(){
        try{
            return decodeURIComponent(String(window.location.pathname.split("/").pop()||"")).trim().toLowerCase();
        }catch(_error){
            return String(window.location.pathname.split("/").pop()||"").trim().toLowerCase();
        }
    }

    function pageNeedsProducts(){
        const explicit=document.documentElement?.getAttribute("data-requires-products");
        if(explicit==="true") return true;
        if(explicit==="false") return false;
        return PRODUCT_PAGES.has(currentPage());
    }

    function apiReady(){
        return Boolean(window.LDMProducts && typeof window.LDMProducts.bootstrap === "function");
    }

    function retryDelay(){
        return Math.min(8000, 700 * Math.pow(2, Math.min(Math.max(attempt,1),4)));
    }

    function scheduleRetry(reason="retry"){
        if(ready) return;
        pendingRetryReason=reason || pendingRetryReason || "retry";
        if(running || retryTimer) return;
        const delay=retryDelay();
        retryTimer=window.setTimeout(()=>{
            retryTimer=null;
            const nextReason=pendingRetryReason || "automatic-retry";
            pendingRetryReason="";
            boot(nextReason);
        },delay);
    }

    async function boot(trigger="initial"){
        if(ready) return;
        if(!pageNeedsProducts()){
            ready=true;
            attempt=0;
            pendingRetryReason="";
            return;
        }
        if(running){
            pendingRetryReason=trigger || pendingRetryReason || "retry-after-running";
            return;
        }

        running=true;
        let failed=false;
        try{
            if(!apiReady()) throw new Error("products-service.js belum termuat.");

            const result=await window.LDMProducts.bootstrap();
            ready=true;
            attempt=0;
            pendingRetryReason="";
            if(retryTimer){
                window.clearTimeout(retryTimer);
                retryTimer=null;
            }

            window.dispatchEvent(new CustomEvent("ldm-products-ready",{
                detail:Object.assign({},result||{},{trigger,version:VERSION})
            }));
        }catch(error){
            failed=true;
            attempt+=1;
            pendingRetryReason="automatic-retry";
            console.warn("Cloud Products bootstrap:",error);
            window.dispatchEvent(new CustomEvent("ldm-products-bootstrap-error",{
                detail:{trigger,attempt,version:VERSION,message:error?.message||String(error)}
            }));
        }finally{
            running=false;
            if(!ready && (failed || pendingRetryReason)) scheduleRetry(pendingRetryReason || "automatic-retry");
        }
    }

    function requestBoot(trigger){
        if(ready) return;
        if(running){
            pendingRetryReason=trigger || pendingRetryReason || "event-retry";
            return;
        }
        boot(trigger);
    }

    if(document.readyState==="loading"){
        document.addEventListener("DOMContentLoaded",()=>requestBoot("dom-ready"),{once:true});
    }else{
        requestBoot("script-ready");
    }

    window.addEventListener("ldm-cloud-auth-ready",()=>requestBoot("cloud-auth-ready"));
    window.addEventListener("ldm-cloud-auth-offline-ready",()=>requestBoot("cloud-offline-ready"));
    window.addEventListener("online",()=>requestBoot("browser-online"));
    document.addEventListener("visibilitychange",()=>{
        if(!document.hidden && !ready) requestBoot("page-visible");
    });
    window.setTimeout(()=>requestBoot("delayed-safety-net"),1500);

    window.LDMBootstrapState=window.LDMBootstrapState||{};
    window.LDMBootstrapState["LDMProducts"]={
        version:VERSION,
        isReady:()=>ready,
        isRunning:()=>running,
        attempts:()=>attempt,
        retry:()=>{
            ready=false;
            attempt=0;
            pendingRetryReason="manual-retry";
            if(retryTimer){ window.clearTimeout(retryTimer); retryTimer=null; }
            requestBoot("manual-retry");
        }
    };
})();
