(function(){
    "use strict";
    let contextCache=null;
    let contextPromise=null;

    function client(){
        if(!window.LDMSupabase?.createClient)throw new Error("Layanan Cloud belum siap.");
        return window.LDMSupabase.createClient();
    }
    async function auth(){
        if(!window.LDMCloudSession)throw new Error("Cloud Session belum tersedia.");
        return window.LDMCloudSession.ensureAuthenticated({registerDevice:false});
    }
    async function rpc(name,args={}){
        await auth();
        const {data,error}=await client().rpc(name,args);
        if(error)throw error;
        return data;
    }
    async function context(force=false){
        if(contextCache&&!force)return contextCache;
        if(contextPromise&&!force)return contextPromise;
        contextPromise=(async()=>{
            const data=await rpc("ldm_primary_owner_context");
            const row=Array.isArray(data)?data[0]:data;
            contextCache=row||{is_primary_owner:false};
            window.LDM_PRIMARY_OWNER_CONTEXT=contextCache;
            window.dispatchEvent(new CustomEvent("ldm-primary-owner-ready",{detail:contextCache}));
            return contextCache;
        })();
        try{return await contextPromise}finally{contextPromise=null}
    }
    function isPrimaryOwner(){
        return contextCache?.is_primary_owner===true;
    }
    function currentPage(){
        return String(location.pathname.split("/").pop()||"").trim().toLowerCase();
    }
    function currentRole(){
        return String(
            localStorage.getItem("userRole")
            || localStorage.getItem("role")
            || ""
        ).trim().toLowerCase();
    }
    function isProcurementOwner(){
        return currentRole()==="owner" && [
            "purchase-order.html",
            "goods.receipt.html"
        ].includes(currentPage());
    }
    async function report({storeId=null,dateFrom,dateTo,limit=500}={}){
        const args={p_store_id:storeId||null,p_date_from:dateFrom,p_date_to:dateTo,p_detail_limit:Number(limit)||500};
        try{
            return await rpc("ldm_primary_owner_network_report_v2",args);
        }catch(error){
            const message=String(error?.message||error||"");
            if(!/ldm_primary_owner_network_report_v2|function .* does not exist|PGRST202/i.test(message))throw error;
            return rpc("ldm_primary_owner_network_report",args);
        }
    }
    async function accounts(){return rpc("ldm_primary_owner_accounts")}
    async function canManageCatalog(){
        const data=await rpc("ldm_can_manage_central_catalog");
        return data===true;
    }
    async function catalogStatus(){
        return rpc("ldm_primary_owner_catalog_status");
    }
    async function syncCatalog({storeId,enableAutoSync=true}={}){
        if(!storeId)throw new Error("Cabang tujuan belum dipilih.");
        return rpc("ldm_primary_owner_sync_catalog",{
            p_store_id:storeId,
            p_enable_auto_sync:Boolean(enableAutoSync)
        });
    }
    async function syncAllCatalog({enableAutoSync=true}={}){
        return rpc("ldm_primary_owner_sync_all_catalog",{
            p_enable_auto_sync:Boolean(enableAutoSync)
        });
    }
    async function setCatalogSync({storeId,enabled}={}){
        if(!storeId)throw new Error("Cabang tujuan belum dipilih.");
        return rpc("ldm_primary_owner_set_catalog_sync",{
            p_store_id:storeId,
            p_enabled:Boolean(enabled)
        });
    }
    async function branchCatalog(storeId){
        if(!storeId)throw new Error("Cabang tujuan belum dipilih.");
        return rpc("ldm_primary_owner_branch_catalog",{p_store_id:storeId});
    }
    async function saveCatalogProduct({storeId,product}={}){
        if(!storeId)throw new Error("Toko tujuan belum dipilih.");
        if(!product||typeof product!=="object")throw new Error("Data item belum lengkap.");
        return rpc("ldm_primary_owner_upsert_catalog_product",{
            p_store_id:storeId,p_product:product
        });
    }
    async function deleteCatalogProduct({storeId,productId}={}){
        if(!storeId||!productId)throw new Error("Item yang akan dihapus belum dipilih.");
        return rpc("ldm_primary_owner_delete_catalog_product",{
            p_store_id:storeId,p_product_id:productId
        });
    }
    async function catalogRequests({status="PENDING",limit=200}={}){
        return rpc("ldm_primary_owner_catalog_requests",{
            p_status:status,p_limit:Number(limit)||200
        });
    }
    async function reviewCatalogRequest({requestId,decision,product={},reviewNote=""}={}){
        if(!requestId)throw new Error("Pengajuan belum dipilih.");
        return rpc("ldm_primary_owner_review_catalog_request",{
            p_request_id:requestId,
            p_decision:String(decision||"").toUpperCase(),
            p_product:product||{},
            p_review_note:String(reviewNote||"").trim()||null
        });
    }
    async function updateAccount(value={}){
        return rpc("ldm_primary_owner_update_account",{
            p_user_id:value.userId,p_store_id:value.storeId,
            p_username:String(value.username||"").trim(),
            p_display_name:String(value.displayName||"").trim()||null,
            p_role:String(value.role||"kasir").toLowerCase(),
            p_active:Boolean(value.active)
        });
    }

    function addPrivacyStyle(){
        if(document.getElementById("ldmPrimaryOwnerPrivacy"))return;
        const style=document.createElement("style");
        style.id="ldmPrimaryOwnerPrivacy";
        style.textContent=`
        html[data-ldm-primary-owner="false"] .owner-unit-cost,
        html[data-ldm-primary-owner="false"] .profit-text,
        html[data-ldm-primary-owner="false"] .card.profit,
        html[data-ldm-primary-owner="false"] [data-sensitive-finance],
        html[data-ldm-primary-owner="false"] [data-primary-owner-only],
        html[data-ldm-primary-owner="false"] #monthlyProfit,
        html[data-ldm-primary-owner="false"] #ownerProfit,
        html[data-ldm-primary-owner="false"] #profitBersih,
        html[data-ldm-primary-owner="false"] #inputHargaBeliPO,
        html[data-ldm-primary-owner="false"] #inputHargaBeliGR{display:none!important}
        .ldm-finance-restricted{display:none!important}
        `;
        document.head.appendChild(style);
    }
    function hideSensitiveFields(root=document){
        if(isPrimaryOwner())return;
        const procurementOwner=isProcurementOwner();
        const scope=root&&root.nodeType?root:document;
        const candidates=[];
        if(scope===document){
            candidates.push(...document.querySelectorAll("#hargaBeli,#editHargaBeli,#inputHargaBeliPO,#inputHargaBeliGR"));
        }else if(scope.nodeType===Node.ELEMENT_NODE){
            if(["hargaBeli","editHargaBeli","inputHargaBeliPO","inputHargaBeliGR"].includes(scope.id))candidates.push(scope);
            candidates.push(...scope.querySelectorAll?.("#hargaBeli,#editHargaBeli,#inputHargaBeliPO,#inputHargaBeliGR")||[]);
        }
        candidates.forEach(node=>{
            node.disabled=true;
            const wrapper=node.closest(".field,.form-group,.input-group,.form-row")||node;
            wrapper.classList.add("ldm-finance-restricted");
        });

        const inspect=[];
        if(scope===document){
            inspect.push(...document.querySelectorAll("th,label,h2,h3,h4,strong,span"));
        }else if(scope.nodeType===Node.ELEMENT_NODE){
            if(scope.matches?.("th,label,h2,h3,h4,strong,span"))inspect.push(scope);
            inspect.push(...scope.querySelectorAll?.("th,label,h2,h3,h4,strong,span")||[]);
        }else if(scope.nodeType===Node.TEXT_NODE&&scope.parentElement){
            inspect.push(scope.parentElement);
        }
        inspect.forEach(node=>{
            const text=String(node.textContent||"").trim().toLowerCase();
            if(text.startsWith("harga beli") || text==="harga estimasi" || /^(hpp|profit bersih|profit setelah hpp|margin keuntungan|subtotal|subtotal estimasi|total nilai|total estimasi)$/.test(text)){
                const target=node.closest("th,.field,.form-group,.card,.summary-item")||node;
                target.classList.add("ldm-finance-restricted");
            }
        });
    }
    function sanitizeKnownCaches(){
        let keys=[
            "dataBarang","dataPurchaseOrder","dataGoodsReceipt","dataStockOpname",
            "laporan","dataLaporan","riwayatTransaksi","laporanHistory"
        ];
        const procurementOwner=isProcurementOwner();
        if(procurementOwner){
            // Master Barang tetap tersedia sebagai sumber kalkulasi internal.
            // Input harga disembunyikan dan harga yang dikirim akan diverifikasi server.
            keys=keys.filter(key=>key!=="dataBarang");
        }
        const sensitive=new Set([
            "purchase_price","package_purchase_price","purchase_price_before",
            "cost_price_snapshot","unit_cost_snapshot","nominal_snapshot",
            "hargaBeli","hargaBeliDasar","hargaBeliSebelum",
            "purchasePrice","unitCostSnapshot","hargaModal","hpp","grossProfit","netProfit",
            "profitBersih","profitSetelahHpp"
        ]);
        ["line_subtotal","total_value","subtotal","totalNilai"].forEach(key=>sensitive.add(key));
        const clean=value=>{
            if(Array.isArray(value))return value.map(clean);
            if(!value||typeof value!=="object")return value;
            Object.keys(value).forEach(key=>{
                if(sensitive.has(key))value[key]=0;
                else value[key]=clean(value[key]);
            });
            return value;
        };
        keys.forEach(key=>{
            try{
                const raw=localStorage.getItem(key);
                if(!raw)return;
                localStorage.setItem(key,JSON.stringify(clean(JSON.parse(raw))));
            }catch(error){}
        });
        localStorage.removeItem("ldmPurchasePriceHistory");
        localStorage.removeItem("ldmPurchasePriceHistoryEnabled");
    }
    function applyPrivacy(ctx){
        addPrivacyStyle();
        const allowed=ctx?.is_primary_owner===true;
        document.documentElement.dataset.ldmPrimaryOwner=String(allowed);
        document.documentElement.dataset.ldmProcurementOwner=String(isProcurementOwner());
        if(!allowed){
            sanitizeKnownCaches();
            hideSensitiveFields(document);
            const pending=new Set();
            let scheduled=false;
            const flush=()=>{
                scheduled=false;
                for(const node of [...pending]){
                    pending.delete(node);
                    if(node.isConnected!==false)hideSensitiveFields(node);
                }
            };
            const schedule=()=>{
                if(scheduled)return;
                scheduled=true;
                if("requestIdleCallback" in window)requestIdleCallback(flush,{timeout:80});
                else setTimeout(flush,0);
            };
            const observer=new MutationObserver(records=>{
                for(const record of records){
                    for(const node of record.addedNodes){
                        const target=node.nodeType===Node.TEXT_NODE?node.parentElement:node;
                        if(!target)continue;
                        let covered=false;
                        for(let parent=target.parentElement;parent;parent=parent.parentElement){
                            if(pending.has(parent)){covered=true;break;}
                        }
                        if(covered)continue;
                        if(target.nodeType===Node.ELEMENT_NODE){
                            for(const queued of [...pending])if(target.contains?.(queued))pending.delete(queued);
                        }
                        pending.add(target);
                    }
                }
                if(pending.size)schedule();
            });
            observer.observe(document.documentElement,{subtree:true,childList:true});
            setTimeout(()=>observer.disconnect(),15000);
        }
    }
    async function initialize(){
        try{const ctx=await context();applyPrivacy(ctx);return ctx}
        catch(error){
            document.documentElement.dataset.ldmPrimaryOwner="false";
            document.documentElement.dataset.ldmProcurementOwner=String(isProcurementOwner());
            addPrivacyStyle();hideSensitiveFields();
            console.warn("Konteks Owner Utama belum tersedia:",error);
            return {is_primary_owner:false,error:error.message||String(error)};
        }
    }

    window.LDMPrimaryOwner=Object.freeze({
        context,isPrimaryOwner,report,accounts,updateAccount,
        canManageCatalog,catalogStatus,syncCatalog,syncAllCatalog,setCatalogSync,
        branchCatalog,saveCatalogProduct,deleteCatalogProduct,catalogRequests,reviewCatalogRequest,
        applyPrivacy,initialize
    });
})();
