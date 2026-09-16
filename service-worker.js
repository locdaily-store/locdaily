// Build: 27.9.0-v28.16.3 Fast Page Navigation & Session Handoff FINAL
"use strict";

importScripts("./js/app-version.js");
const APP_VERSION=String(self.LDM_APP_VERSION||"runtime-version-missing");
const CACHE_PREFIX="ldm-";
const SHELL_CACHE=`${CACHE_PREFIX}${APP_VERSION}-shell`;
const RUNTIME_CACHE=`${CACHE_PREFIX}${APP_VERSION}-runtime`;
const SUPABASE_CDN="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0";

const APP_SHELL=[
    "./","./homepage.html","./index.html","./demo-login.html","./demo-app.html","./dashboard.html","./kasir.html","./barang.html","./absensi.html","./master-shift.html","./ketidakhadiran.html","./attendance-exception.html","./Purchase-Order.html","./goods.receipt.html","./multi-store.html",
    "./pwa-settings.html","./pages-health-check.html","./penyimpanan.html","./setup-awal.html","./printer-scanner-setup.html","./monitoring-error.html","./support-center.html","./privacy-center.html","./account-management.html","./device-management.html","./panduan.html","./owner-control-center.html","./recovery-center.html","./qa-security-performance.html","./license.html","./license-v2.html","./developer-license.html","./developer-license-v2.html","./developer-incident-support.html","./developer-contact-settings.html","./offline.html","./manifest.json","./icon.png",
    "./assets/icons/icon-192.png","./assets/icons/icon-512.png","./assets/brand/locdailymar-logo.png","./assets/icons/maskable-512.png","./locdailymar-logo.png",
    "./style.css","./css/global-responsive-navigation.css","./css/system-dashboard-ui.css","./css/developer-navigation.css","./css/privacy-center.css","./css/peripheral-setup-embedded.css","./css/help-center.css","./css/support-center-v21.css","./css/multi-store-dashboard-theme.css","./css/central-catalog-control.css","./setting.js","./employee-id.js",
    "./js/app-version.js","./js/navigation-performance.js","./js/pwa-manager.js","./js/ui-copy-cleanup-v2861.js","./js/demo-account-runtime.js","./js/system-theme-sync-v2824.js","./js/customer-safe-copy-v2828.js","./js/public-contact-config-v2835.js","./js/homepage-feedback-contact-v2835.js","./js/customer-refund-v2825.js","./js/local-time.js","./js/developer-navigation.js","./js/developer-contact-settings-v2835.js","./js/peripheral-setup.js","./js/peripheral-setup-embedded.js","./js/receipt-customizer-embedded.js","./js/onboarding-service.js","./js/onboarding-wizard.js","./js/onboarding-dashboard.js","./js/error-monitor.js","./js/error-monitor-admin.js","./js/support-center.js","./js/privacy-center.js","./js/license-quota-sync-v2841.js","./js/user-guide.js","./js/storage-engine.js","./js/storage-quota-guard.js","./js/storage-health-monitor.js","./js/security-hardening.js","./js/qa-runtime.js","./js/recovery-service.js","./js/global-system-navigation.js","./js/primary-owner-service.js","./js/central-catalog-control.js",
    "./js/license-v2-config.js","./js/license-v2-client.js","./js/license-checkout-v2.js","./js/license-renewal-upgrade-v2880.js","./js/license-v2-guard.js","./js/license-v2-admin-config.js","./js/license-v2-admin.js",
    "./js/offline-queue.js","./js/supabase-config.js","./js/supabase-client.js","./js/edge-function-client.js","./js/storage-retention.js","./js/account-service.js","./js/account-management-page-v2829.js","./js/device-service.js",
    "./js/cloud-auth.js","./js/cloud-session.js","./js/role-access-guard-v28120.js","./js/cloud-session-guard.js",
    "./js/unit-conversion.js","./js/promo-pricing.js","./js/multi-store-service.js","./js/store-mode.js","./js/product-visuals.js","./css/store-modes.css","./js/products-service.js","./js/products-bootstrap.js",
    "./js/procurement-service.js","./js/procurement-bootstrap.js","./js/transactions-service.js","./js/reporting-service.js","./js/dashboard-report-source.js","./js/attendance-workforce-service.js","./js/attendance-workforce-ui.js","./js/master-shift-ui.js","./js/ketidakhadiran-ui.js","./js/attendance-service.js","./js/attendance-bootstrap.js","./css/attendance-workforce.css","./css/workforce-dashboard-pages.css",
    SUPABASE_CDN
];

async function cacheOne(cache,url){
    try{
        const response=await fetch(url,{cache:"reload"});
        if(response.ok||response.type==="opaque")await cache.put(url,response.clone());
    }catch(error){}
}

self.addEventListener("install",event=>{
    event.waitUntil((async()=>{
        const cache=await caches.open(SHELL_CACHE);
        await Promise.allSettled(APP_SHELL.map(url=>cacheOne(cache,url)));
    })());
});

self.addEventListener("activate",event=>{
    event.waitUntil((async()=>{
        const keys=await caches.keys();
        await Promise.all(
            keys
                .filter(key=>key.startsWith(CACHE_PREFIX)&&![SHELL_CACHE,RUNTIME_CACHE].includes(key))
                .map(key=>caches.delete(key))
        );
        await self.clients.claim();
    })());
});

function isSupabaseApi(url){
    return /\.supabase\.co$/i.test(url.hostname);
}

async function cacheMatchExactThenPath(request){
    const exact=await caches.match(request);
    if(exact)return exact;

    try{
        const url=new URL(request.url);
        if(url.origin===self.location.origin && url.search){
            const clean=new Request(url.origin+url.pathname,{
                method:"GET",
                headers:request.headers,
                mode:"same-origin",
                credentials:"same-origin"
            });
            return await caches.match(clean);
        }
    }catch(error){}

    return null;
}

function runtimeCacheKey(request,stripSearch=false){
    try{
        const url=new URL(request.url);
        if(stripSearch && url.origin===self.location.origin){
            return `${url.origin}${url.pathname}`;
        }
    }catch(error){}
    return request;
}

async function updateRuntime(request,options={},stripSearch=false){
    const response=await fetch(request,options);
    if(response && response.ok){
        const cache=await caches.open(RUNTIME_CACHE);
        await cache.put(
            runtimeCacheKey(request,stripSearch),
            response.clone()
        );
    }
    return response;
}

async function staleWhileRevalidateNavigation(event,request){
    const cached=await caches.match(request,{ignoreSearch:true});
    const networkPromise=updateRuntime(request,{cache:"no-cache"},true).catch(()=>null);

    if(cached){
        event.waitUntil(networkPromise);
        return cached;
    }

    const network=await networkPromise;
    if(network)return network;

    return (await caches.match("./offline.html",{ignoreSearch:true})) || new Response(
        "Halaman belum tersedia offline.",
        {status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}}
    );
}

async function staleWhileRevalidateAsset(event,request){
    const cached=await cacheMatchExactThenPath(request);
    const networkPromise=updateRuntime(request,{cache:"no-cache"},true).catch(()=>null);

    if(cached){
        event.waitUntil(networkPromise);
        return cached;
    }

    const network=await networkPromise;
    if(network)return network;

    return new Response("Resource aplikasi belum tersedia.",{status:503});
}

async function cacheFirst(request){
    const cached=await cacheMatchExactThenPath(request);
    if(cached)return cached;

    const response=await fetch(request);
    if(response.ok||response.type==="opaque"){
        const cache=await caches.open(RUNTIME_CACHE);
        await cache.put(request,response.clone());
    }
    return response;
}

self.addEventListener("fetch",event=>{
    const request=event.request;
    const url=new URL(request.url);

    if(request.method!=="GET"||isSupabaseApi(url))return;

    if(request.mode==="navigate"){
        event.respondWith(staleWhileRevalidateNavigation(event,request));
        return;
    }

    if(
        url.origin===self.location.origin &&
        /\.(?:js|css|json)$/i.test(url.pathname)
    ){
        event.respondWith(staleWhileRevalidateAsset(event,request));
        return;
    }

    if(url.origin===self.location.origin || url.hostname==="cdn.jsdelivr.net"){
        event.respondWith(cacheFirst(request));
    }
});

self.addEventListener("sync",event=>{
    if(event.tag!=="ldm-offline-sales-v16")return;
    event.waitUntil((async()=>{
        const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
        clients.forEach(client=>client.postMessage({type:"LDM_SYNC_REQUEST"}));
    })());
});

self.addEventListener("message",event=>{
    const data=event.data||{};
    if(data.type==="LDM_SKIP_WAITING")self.skipWaiting();
    if(data.type==="LDM_GET_VERSION"&&event.source){
        event.source.postMessage({type:"LDM_SW_VERSION",version:APP_VERSION});
    }
});
