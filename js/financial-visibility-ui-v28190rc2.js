(function(){
    "use strict";
    const VERSION="28.19.1-final";
    const HIDDEN_CLASS="ldm-financial-hidden";

    function can(code){
        try{
            return window.LDMEmployeePermissions?.can?.(code)!==false;
        }catch(_error){return false;}
    }
    function state(){
        return Object.freeze({
            revenue:can("finance.revenue.view"),
            profit:can("finance.profit.view"),
            hpp:can("hpp.view"),
            supplierCost:can("supplier_cost.view")
        });
    }
    function hideNode(node,hidden){
        if(!node)return;
        node.classList.toggle(HIDDEN_CLASS,Boolean(hidden));
        node.setAttribute("aria-hidden",hidden?"true":"false");
    }
    function closestCard(id){return document.getElementById(id)?.closest(".card,.stat-card,.detail-box,.monthly-panel,.box-card")||null;}
    function dashboard(s){
        ["totalOmzet","ownerTunai","ownerNonTunai"].forEach(id=>hideNode(closestCard(id),!s.revenue));
        hideNode(document.getElementById("listOmzet")?.closest(".detail-box"),!s.revenue);
        hideNode(closestCard("monthlyOmzet"),!s.revenue);
        ["dateRangeChartBox","salesAssistantFab","salesAssistantDrawer","salesAssistantOverlay"].forEach(id=>hideNode(document.getElementById(id),!s.revenue));

        hideNode(closestCard("totalModal"),!s.hpp);
        hideNode(document.getElementById("listModal")?.closest(".detail-box"),!s.hpp);
        hideNode(closestCard("monthlyModal"),!s.hpp);

        hideNode(closestCard("totalProfit"),!s.profit);
        hideNode(closestCard("monthlyProfit"),!s.profit);
        const profitFormula=document.getElementById("txtProfit")?.closest(".profit-summary,.profit-calc,.profit-box") || document.getElementById("txtProfit")?.parentElement?.parentElement;
        hideNode(profitFormula,!s.profit);
    }
    function laporan(s){
        ["statGross","statReturns","statOmset"].forEach(id=>hideNode(closestCard(id),!s.revenue));
        document.querySelectorAll('[data-ldm-financial="revenue"]').forEach(node=>hideNode(node,!s.revenue));
        document.querySelectorAll('[data-ldm-financial="hpp"]').forEach(node=>hideNode(node,!s.hpp));
        document.querySelectorAll('[data-ldm-financial="profit"]').forEach(node=>hideNode(node,!s.profit));
        const notice=document.getElementById("roleReportNotice");
        if(notice&&!s.revenue){
            notice.textContent="🔒 Jabatan ini boleh membuka Laporan, tetapi nominal pendapatan disembunyikan oleh Owner Pusat.";
        }
    }
    function barang(s){
        document.documentElement.dataset.ldmCanViewHpp=s.hpp?"true":"false";
        document.querySelectorAll('[data-ldm-financial="hpp"]').forEach(node=>hideNode(node,!s.hpp));
    }
    function apply(){
        const s=state();
        document.documentElement.dataset.ldmCanViewRevenue=s.revenue?"true":"false";
        document.documentElement.dataset.ldmCanViewProfit=s.profit?"true":"false";
        document.documentElement.dataset.ldmCanViewHpp=s.hpp?"true":"false";
        const page=(location.pathname.split("/").pop()||"").toLowerCase();
        if(page==="dashboard.html")dashboard(s);
        if(page==="laporan.html")laporan(s);
        if(page==="barang.html")barang(s);
        window.LDM_FINANCIAL_VISIBILITY=s;
        window.dispatchEvent(new CustomEvent("ldm-financial-visibility-ready",{detail:s}));
        return s;
    }
    function boot(){
        if(!document.getElementById("ldmFinancialVisibilityStyle")){const st=document.createElement("style");st.id="ldmFinancialVisibilityStyle";st.textContent=".ldm-financial-hidden{display:none!important}";document.head.appendChild(st);}
        apply();
    }
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
    window.addEventListener("ldm-employee-permissions-ready",apply);
    window.addEventListener("ldm-job-role-assignment-updated",apply);
    window.LDMFinancialVisibility=Object.freeze({version:VERSION,state,apply,canRevenue:()=>state().revenue,canProfit:()=>state().profit,canHpp:()=>state().hpp,canSupplierCost:()=>state().supplierCost});
})();
