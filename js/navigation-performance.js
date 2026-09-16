(function(){
    "use strict";

    const VERSION="27.9.0-v28.16.3";
    const PREFETCHED=new Set();

    function injectStyle(){
        if(document.getElementById("ldmNavigationPerformanceStyle"))return;
        const style=document.createElement("style");
        style.id="ldmNavigationPerformanceStyle";
        style.textContent=`
            #ldmNavigationProgress{
                position:fixed;left:0;top:0;width:0;height:3px;
                z-index:2147483646;pointer-events:none;
                background:linear-gradient(90deg,#0F9D58,#2C3E50);
                opacity:0;transition:width .16s ease,opacity .12s ease;
            }
            html.ldm-nav-leaving #ldmNavigationProgress{
                width:72%;opacity:1;
            }
            html.ldm-nav-leaving body{
                cursor:progress!important;
            }
        `;
        document.head.appendChild(style);
    }

    function progressNode(){
        let node=document.getElementById("ldmNavigationProgress");
        if(!node){
            node=document.createElement("div");
            node.id="ldmNavigationProgress";
            node.setAttribute("aria-hidden","true");
            (document.body||document.documentElement).appendChild(node);
        }
        return node;
    }

    function routeUrl(anchor){
        if(!anchor || anchor.target==="_blank" || anchor.hasAttribute("download"))return null;
        const href=anchor.getAttribute("href");
        if(!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:"))return null;

        let url;
        try{ url=new URL(href,location.href); }catch(error){ return null; }

        if(url.origin!==location.origin)return null;
        if(!/\.html$/i.test(url.pathname) && !url.pathname.endsWith("/"))return null;
        if(url.pathname===location.pathname && url.search===location.search)return null;
        return url;
    }

    function prefetch(anchor){
        const url=routeUrl(anchor);
        if(!url)return;
        // Prefetch only the static path. Query parameters may contain
        // return/status information and are not needed to warm GitHub Pages HTML.
        const key=`${url.origin}${url.pathname}`;
        if(PREFETCHED.has(key))return;
        PREFETCHED.add(key);

        const link=document.createElement("link");
        link.rel="prefetch";
        link.href=key;
        document.head.appendChild(link);
    }

    function onIntent(event){
        const anchor=event.target?.closest?.("a[href]");
        if(anchor)prefetch(anchor);
    }

    function onClick(event){
        if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
        const anchor=event.target?.closest?.("a[href]");
        const url=routeUrl(anchor);
        if(!url)return;

        prefetch(anchor);

        try{
            window.LDMCloudAuth?.primeNavigationHandoff?.(
                window.LDM_CLOUD_CONTEXT,
                window.LDM_CURRENT_DEVICE_ACCESS
            );
        }catch(error){}

        injectStyle();
        progressNode();
        document.documentElement.classList.add("ldm-nav-leaving");

        try{
            sessionStorage.setItem("ldmLastNavigationIntentV28163",JSON.stringify({
                at:Date.now(),
                from:location.pathname,
                to:url.pathname
            }));
        }catch(error){}
    }

    function clearLeaving(){
        document.documentElement.classList.remove("ldm-nav-leaving");
        const bar=document.getElementById("ldmNavigationProgress");
        if(bar){
            bar.style.width="100%";
            window.setTimeout(()=>{
                bar.style.opacity="0";
                bar.style.width="0";
            },80);
        }
    }

    function idleWarm(){
        const run=()=>{
            const anchors=[...document.querySelectorAll("a[href]")];
            let warmed=0;
            for(const anchor of anchors){
                if(warmed>=6)break;
                if(routeUrl(anchor)){
                    prefetch(anchor);
                    warmed+=1;
                }
            }
        };
        if(typeof requestIdleCallback==="function")requestIdleCallback(run,{timeout:1400});
        else setTimeout(run,700);
    }

    injectStyle();

    document.addEventListener("pointerover",onIntent,{passive:true,capture:true});
    document.addEventListener("focusin",onIntent,true);
    document.addEventListener("touchstart",onIntent,{passive:true,capture:true});
    document.addEventListener("click",onClick,true);

    window.addEventListener("pageshow",clearLeaving);
    window.addEventListener("load",()=>{
        clearLeaving();
        idleWarm();
    },{once:true});
    window.addEventListener("ldm-global-navigation-rendered",idleWarm);

    window.LDMNavigationPerformance=Object.freeze({
        version:VERSION,
        prefetchAnchor:prefetch,
        clearLeaving
    });
})();
