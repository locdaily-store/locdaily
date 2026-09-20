(function(){
    "use strict";
    const VERSION="28.20.0-final";
    const LEGACY=Object.freeze({
        "dashboard.view":"dashboard.view",
        "supplier.view":"suppliers.use","retur.view":"returns.use","pengeluaran.view":"expenses.manage","endofday.view":"eod.use","backup.view":"backup_restore.use",
        "barang.view":"inventory.view","barang.add":"inventory.product.create","barang.edit":"inventory.product.update","barang.delete":"inventory.product.delete","barang.price":"inventory.price.update",
        "kasir.access":"pos.use","kasir.create":"pos.transaction.create","kasir.discount":"pos.discount.apply","kasir.void":"reports.transaction.delete","kasir.reprint":"pos.receipt.reprint",
        "laporan.view":"reports.view","laporan.delete":"reports.transaction.delete","laporan.export":"reports.export","laporan.print":"reports.print",
        "stockopname.view":"stock_opname.use","stockopname.create":"stock_opname.create","stockopname.approve":"stock_opname.approve","stockopname.reject":"stock_opname.reject","stockopname.cancel":"stock_opname.cancel","stockopname.delete":"stock_opname.delete",
        "absensi.view":"attendance.use","absensi.submit":"attendance.submit","absensi.history":"attendance.history.view","absensi.delete":"attendance.delete",
        "closing.view":"shift_closing.use","closing.create":"shift_closing.create","closing.cash":"shift_closing.cash_movement.manage","closing.reopen":"shift_closing.reopen","closing.approve":"shift_closing.reopen","closing.credentials":"shift_closing.credentials.manage","closing.print":"shift_closing.print",
        "akun.view":"accounts.manage","akun.manage":"accounts.manage","settings.view":"privacy.view",
        "purchaseorder.view":"purchase_order.use","purchaseorder.create":"purchase_order.create","purchaseorder.edit":"purchase_order.update","purchaseorder.approve":"purchase_order.approve","purchaseorder.cancel":"purchase_order.cancel","purchaseorder.delete":"purchase_order.delete","purchaseorder.print":"purchase_order.print",
        "goodsreceipt.view":"goods_receipt.use","goodsreceipt.create":"goods_receipt.create","goodsreceipt.approve":"goods_receipt.approve","goodsreceipt.cancel":"goods_receipt.cancel","goodsreceipt.delete":"goods_receipt.cancel","goodsreceipt.print":"goods_receipt.print"
    });
    const FN_MAP=Object.freeze({
        "holdTransaksi":"pos.hold.use","recallTransaksi":"pos.hold.use","ulangCetakStruk":"pos.receipt.reprint",
        "tambahBarang":"inventory.product.create","simpanEditBarang":"inventory.product.update","hapusBarang":"inventory.product.delete","simpanTambahStok":"inventory.stock.adjust","simpanPromoBarang":"inventory.price.update","hapusPromoBarang":"inventory.price.update","cetakLabelPriceTerpilih":"inventory.label.print",
        "saveExpense":"expenses.create","deleteExpense":"expenses.delete",
        "exportDataCSV":"reports.export","downloadSemuaLaporanCloud":"reports.export","cetakStruk":"reports.print",
        "exportStockCardCSV":"stock_card.export","printStockCard":"stock_card.export",
        "cetakPO":"purchase_order.print","cetakGoodsReceiptById":"goods_receipt.print",
        "submitAbsensi":"attendance.submit","hapusAbsensi":"attendance.delete",
        "prosesSubmitClosing":"shift_closing.create","tambahMutasiKasShift":"shift_closing.cash_movement.manage","hapusMutasiKasShift":"shift_closing.cash_movement.manage","bukaModalPassClosing":"shift_closing.credentials.manage","simpanPasswordClosingShift":"shift_closing.credentials.manage","cetakLaporanLog":"shift_closing.print",
        "saveEOD":"eod.run","deleteEOD":"eod.reopen","printEOD":"eod.print",
        "createReturn":"returns.create","rejectReturn":"returns.reject","cancelReturn":"returns.cancel","deleteReturnPermanent":"returns.delete",
        "editSupplier":"suppliers.update","toggleSupplier":"suppliers.update","deleteSupplier":"suppliers.delete","importFromPO":"suppliers.create"
    });
    function normalize(code){
        const key=String(code||"").trim().toLowerCase();
        return LEGACY[key]||key;
    }
    function api(){return window.LDMEmployeePermissions||null;}
    function can(code){
        const normalized=normalize(code);
        if(!normalized)return true;
        const svc=api();
        if(!svc||typeof svc.can!=="function")return true;
        return svc.can(normalized);
    }
    function limit(code,fallback=null){
        const svc=api();
        if(!svc||typeof svc.limit!=="function")return fallback;
        return svc.limit(code,fallback);
    }
    function showDenied(){
        const text="Akun ini tidak memiliki akses untuk melakukan tindakan tersebut.";
        try{
            if(typeof window.showAlert==="function"){window.showAlert("Akses Dibatasi",text,"warning");return;}
            if(typeof window.notify==="function"){window.notify("Akses Dibatasi",text);return;}
            if(typeof window.alertBox==="function"){window.alertBox(text,"bad");return;}
        }catch(_error){}
        let node=document.getElementById("ldmActionPermissionNotice");
        if(!node){
            node=document.createElement("div");node.id="ldmActionPermissionNotice";node.setAttribute("role","status");
            node.style.cssText="position:fixed;right:16px;bottom:16px;z-index:2147483001;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:12px;background:#0d2240;color:#fff;box-shadow:0 12px 30px rgba(15,23,42,.25);font:600 13px/1.5 Arial,sans-serif";
            document.body.appendChild(node);
        }
        node.textContent=text;node.hidden=false;clearTimeout(node.__timer);node.__timer=setTimeout(()=>{node.hidden=true;},4200);
    }
    function requirePermission(code){if(can(code))return true;showDenied();return false;}
    function hasLegacy(code){return can(normalize(code));}
    function applyElement(el){
        if(!(el instanceof Element))return;
        const raw=el.getAttribute("data-ldm-permission")||el.getAttribute("data-permission");
        if(!raw)return;
        const mapped=normalize(raw);
        if(raw===mapped && !raw.includes("."))return;
        const allowed=can(mapped);
        el.dataset.ldmPermissionResolved=mapped;
        if(el.getAttribute("data-ldm-permission-mode")==="disable"){
            if("disabled" in el)el.disabled=!allowed;
            el.setAttribute("aria-disabled",allowed?"false":"true");
        }else{
            el.hidden=!allowed;
            if(!allowed)el.style.setProperty("display","none","important");
            else if(el.style.getPropertyValue("display")==="none"&&el.style.getPropertyPriority("display")==="important")el.style.removeProperty("display");
        }
    }
    function apply(root=document){
        const nodes=[];
        if(root instanceof Element&&(root.hasAttribute("data-ldm-permission")||root.hasAttribute("data-permission")))nodes.push(root);
        if(root.querySelectorAll)nodes.push(...root.querySelectorAll("[data-ldm-permission],[data-permission]"));
        nodes.forEach(applyElement);
        applyDiscountControl();
    }
    function applyDiscountControl(){
        const input=document.getElementById("inputDiskon");
        if(!input)return;
        const allowed=can("pos.discount.apply");
        input.disabled=!allowed;
        input.setAttribute("aria-disabled",allowed?"false":"true");
        if(!allowed){input.value="";}
        let note=document.getElementById("ldmDiscountPermissionNote");
        if(!note){
            note=document.createElement("small");note.id="ldmDiscountPermissionNote";note.style.cssText="display:block;margin-top:5px;font-size:.66rem;opacity:.78";input.insertAdjacentElement("afterend",note);
        }
        const max=Math.max(0,Math.min(100,Number(limit("pos.discount.max_percent",100))||0));
        note.textContent=allowed?`Batas diskon jabatan: maksimal ${max}% per transaksi.`:"Diskon manual tidak tersedia untuk jabatan ini.";
    }
    function discountWithinLimit(){
        if(!can("pos.discount.apply")){
            const input=document.getElementById("inputDiskon");
            if(input&&String(input.value||"").trim()){showDenied();return false;}
            return true;
        }
        const input=document.getElementById("inputDiskon");
        if(!input)return true;
        const raw=String(input.value||"").trim();
        if(!raw)return true;
        const max=Math.max(0,Math.min(100,Number(limit("pos.discount.max_percent",100))||0));
        let percent=0;
        if(raw.endsWith("%"))percent=Number.parseFloat(raw.replace("%",""))||0;
        else{
            const amount=Number(String(raw).replace(/[^0-9]/g,""))||0;
            const subtotal=Number(window.subtotalBelanja||0);
            percent=subtotal>0?(amount*100/subtotal):0;
        }
        if(percent>max+0.0001){
            const msg=`Diskon melebihi batas jabatan. Maksimal ${max}% per transaksi.`;
            try{if(typeof window.showAlert==="function")window.showAlert("Batas Diskon",msg,"warning");else alert(msg);}catch(_error){}
            return false;
        }
        return true;
    }
    function wrapFunction(name,permission){
        const original=window[name];
        if(typeof original!=="function"||original.__ldmPermissionWrapped)return;
        const wrapped=function(...args){if(!requirePermission(permission))return;return original.apply(this,args);};
        wrapped.__ldmPermissionWrapped=true;wrapped.__ldmPermissionOriginal=original;
        try{window[name]=wrapped;}catch(_error){}
    }
    function wrapKnownFunctions(){
        Object.entries(FN_MAP).forEach(([name,permission])=>wrapFunction(name,permission));
        const supplierSave=window.saveSupplier;
        if(typeof supplierSave==="function"&&!supplierSave.__ldmPermissionWrapped){
            const wrapped=function(...args){
                const editing=Boolean(window.editingSupplierId||document.getElementById("supplierId")?.value);
                if(!requirePermission(editing?"suppliers.update":"suppliers.create"))return;
                return supplierSave.apply(this,args);
            };
            wrapped.__ldmPermissionWrapped=true;window.saveSupplier=wrapped;
        }
        const returnCreate=window.createReturn;
        if(typeof returnCreate==="function"&&!returnCreate.__ldmPermissionWrapped){
            const wrapped=function(directApprove,...args){
                if(!requirePermission("returns.create"))return;
                if(directApprove&&!requirePermission("returns.approve"))return;
                return returnCreate.apply(this,[directApprove,...args]);
            };
            wrapped.__ldmPermissionWrapped=true;window.createReturn=wrapped;
        }
        ["prosesBayar","prosesBayarQris"].forEach(name=>{
            const original=window[name];
            if(typeof original!=="function"||original.__ldmPermissionWrapped)return;
            const wrapped=function(...args){
                if(!requirePermission("pos.transaction.create"))return;
                if(!discountWithinLimit())return;
                return original.apply(this,args);
            };
            wrapped.__ldmPermissionWrapped=true;window[name]=wrapped;
        });
    }
    document.addEventListener("click",event=>{
        const el=event.target?.closest?.("[data-ldm-permission]");
        if(!el)return;
        if(can(el.getAttribute("data-ldm-permission")))return;
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();showDenied();
    },true);
    function refresh(){apply(document);wrapKnownFunctions();try{if(typeof window.terapkanPermissionUI==="function")window.terapkanPermissionUI();}catch(_error){}}
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",refresh,{once:true});else queueMicrotask(refresh);
    window.addEventListener("ldm-employee-permissions-ready",refresh);
    window.addEventListener("ldm-role-access-ready",refresh);
    const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)apply(node);});
    if(document.documentElement)observer.observe(document.documentElement,{childList:true,subtree:true});
    window.LDMActionPermissions=Object.freeze({version:VERSION,mapLegacy:normalize,can,hasLegacy,require:requirePermission,limit,apply,refresh,discountWithinLimit});
})();
