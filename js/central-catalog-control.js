(function(){
    "use strict";

    const VERSION="27.9.0-v28.18.0";
    const byId=id=>document.getElementById(id);
    const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[char]);
    const number=value=>Number(value||0).toLocaleString("id-ID");
    const money=value=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(value||0));
    const date=value=>value?new Date(value).toLocaleString("id-ID"):"Belum pernah";
    const modeLabel=value=>({retail:"🛒 Toko Ritel",cafe:"☕ Kafe",warung:"🍜 Warung"})[String(value||"retail").toLowerCase()]||"🛒 Toko Ritel";

    let busy=false;
    let statusData={};
    let pendingRequests=[];
    let activeCatalog=null;
    let activeStoreId=null;
    let activeRequestId=null;
    let editingProductId=null;

    function setMessage(message,error=false){
        const node=byId("catalogControlStatus");
        if(!node)return;
        node.textContent=message;
        node.classList.toggle("error",Boolean(error));
    }
    function setBusy(value){
        busy=Boolean(value);
        const panel=byId("catalogControlPanel");
        if(panel)panel.classList.toggle("catalog-working",busy);
        document.querySelectorAll("[data-catalog-manager-action]").forEach(n=>n.disabled=busy);
    }
    function requestCount(storeId){return pendingRequests.filter(r=>String(r.store_id)===String(storeId)&&r.status==="PENDING").length}

    function render(data={}){
        statusData=data||{};
        const rows=Array.isArray(data.branches)?data.branches:[];
        const compatible=rows.filter(row=>row.mode_compatible!==false);
        byId("catalogPrimaryCount").textContent=number(data.primary_product_count);
        byId("catalogBranchCount").textContent=`${number(compatible.length)} / ${number(rows.length)}`;
        byId("catalogAutoCount").textContent=number(compatible.filter(row=>row.enabled).length);

        const body=byId("catalogBranchRows");
        body.innerHTML=rows.length?rows.map(row=>{
            const result=row.last_result||{};
            const same=row.mode_compatible!==false;
            const reqCount=requestCount(row.store_id);
            const detail=same
                ? (row.last_synced_at?`Terakhir: ${date(row.last_synced_at)} · ${number(result.processed||0)} diproses`:"Belum pernah disinkronkan")
                : "Katalog khusus cabang, tetapi master tetap dikendalikan Owner Pusat";
            const action=same
                ? `<button class="cc-btn soft" data-catalog-sync="${esc(row.store_id)}">Sinkronkan</button>${reqCount?` <button class="cc-btn soft" data-catalog-manage="${esc(row.store_id)}">Pengajuan (${reqCount})</button>`:""}`
                : `<button class="cc-btn green" data-catalog-manage="${esc(row.store_id)}">Kelola Katalog${reqCount?` · ${reqCount} pengajuan`:""}</button>`;
            return `<tr>
                <td><strong>${esc(row.store_name)}</strong><br><small>${esc(row.store_code)}</small></td>
                <td><span class="cc-badge ${same?"on":"independent"}">${esc(modeLabel(row.operational_mode))}</span><span class="catalog-sync-detail">${same?"Mode sama dengan pusat":"Mode berbeda dari pusat"}</span></td>
                <td>${number(row.product_count)} barang<span class="catalog-sync-detail">${same?`${number(row.linked_count)} tertaut ke pusat`:"Master dikelola Owner Pusat khusus cabang ini"}</span></td>
                <td><span class="cc-badge ${same?(row.enabled?"on":"off"):"independent"}">${same?(row.enabled?"OTOMATIS":"MANUAL"):"KHUSUS CABANG"}</span><span class="catalog-sync-detail">${esc(detail)}</span></td>
                <td>${same?`<label class="catalog-auto-control"><input type="checkbox" data-catalog-auto="${esc(row.store_id)}" ${row.enabled?"checked":""}> Ikuti pusat</label>`:'<span class="catalog-sync-detail">Dikelola dari panel pusat</span>'}</td>
                <td>${action}</td>
            </tr>`;
        }).join(""):'<tr><td class="cc-empty" colspan="6">Belum ada cabang lain pada jaringan toko ini.</td></tr>';
    }

    async function reload(){
        if(!window.LDMPrimaryOwner?.catalogStatus)return;
        setMessage("Memuat status katalog cabang…");
        try{
            const [data,reqs]=await Promise.all([
                window.LDMPrimaryOwner.catalogStatus(),
                window.LDMPrimaryOwner.catalogRequests({status:"PENDING",limit:500}).catch(()=>[])
            ]);
            pendingRequests=Array.isArray(reqs)?reqs:[];
            render(data||{});
            setMessage(`Status katalog diperbarui. ${number(pendingRequests.length)} pengajuan item menunggu keputusan.`);
        }catch(error){setMessage("Status katalog gagal dimuat: "+(error.message||String(error)),true)}
    }

    async function syncOne(storeId){
        if(busy)return;
        setBusy(true);setMessage("Menyinkronkan master barang dan harga ke cabang…");
        try{
            const autoInput=[...(byId("catalogBranchRows")?.querySelectorAll("[data-catalog-auto]")||[])].find(input=>input.dataset.catalogAuto===storeId);
            const result=await window.LDMPrimaryOwner.syncCatalog({storeId,enableAutoSync:autoInput?.checked!==false});
            await reload();
            setMessage(`Sinkron selesai: ${number(result.processed)} barang diproses, ${number(result.inserted)} baru, ${number(result.updated)} diperbarui. Stok cabang tidak berubah.`);
        }catch(error){setMessage("Sinkron gagal: "+(error.message||String(error)),true)}finally{setBusy(false)}
    }
    async function toggleAuto(input){
        if(busy)return;
        const enabled=input.checked;setBusy(true);
        try{
            await window.LDMPrimaryOwner.setCatalogSync({storeId:input.dataset.catalogAuto,enabled});
            await reload();
            setMessage(enabled?"Sinkron otomatis aktif untuk cabang mode sama.":"Sinkron otomatis dinonaktifkan. Data terakhir tetap tersimpan.");
        }catch(error){input.checked=!enabled;setMessage("Pengaturan gagal disimpan: "+(error.message||String(error)),true)}finally{setBusy(false)}
    }
    async function syncAll(){
        if(busy)return;
        if(!window.confirm("Sinkronkan master barang dari Toko Pusat ke semua cabang yang memiliki mode sama? Cabang beda mode tidak akan ditimpa."))return;
        setBusy(true);setMessage("Menyinkronkan katalog ke seluruh cabang kompatibel…");
        try{
            const result=await window.LDMPrimaryOwner.syncAllCatalog({enableAutoSync:true});
            await reload();
            setMessage(`${number(result.count)} cabang kompatibel selesai disinkronkan.${Number(result.skipped_count||0)>0?` ${number(result.skipped_count)} cabang beda mode tetap memakai katalog khusus yang dikelola Owner Pusat.`:""}`);
        }catch(error){setMessage("Sinkron seluruh cabang gagal: "+(error.message||String(error)),true)}finally{setBusy(false)}
    }

    function ensureManager(){
        if(byId("catalogManagerModal"))return;
        const modal=document.createElement("div");
        modal.id="catalogManagerModal";modal.className="catalog-manager-modal";
        modal.innerHTML=`<div class="catalog-manager-card"><div class="catalog-manager-head"><div><span class="cc-kicker">OWNER PUSAT</span><h2 id="catalogManagerTitle">Kelola Katalog Cabang</h2><p id="catalogManagerSubtitle">Memuat…</p></div><button class="catalog-manager-close" type="button" id="catalogManagerClose">✕</button></div>
        <div class="catalog-manager-grid">
          <section class="catalog-manager-form-wrap" id="catalogManagerFormWrap"><h3 id="catalogFormTitle">Tambah Item</h3><div class="catalog-manager-form">
            <input type="hidden" id="catalogProductId"><div class="cc-field full"><label>Nama item / menu</label><input id="catalogProductName" maxlength="180"></div>
            <div class="cc-field"><label>Barcode (opsional)</label><input id="catalogProductBarcode" maxlength="100"></div><div class="cc-field"><label>Kategori</label><input id="catalogProductCategory" maxlength="100" placeholder="General"></div>
            <div class="cc-field"><label>Satuan dasar</label><input id="catalogProductUnit" maxlength="40" value="Pcs"></div><div class="cc-field"><label>Satuan beli</label><input id="catalogProductPurchaseUnit" maxlength="40" value="Pcs"></div>
            <div class="cc-field"><label>Konversi beli</label><input id="catalogProductFactor" type="number" min="0.001" step="0.001" value="1"></div><div class="cc-field"><label>Stok awal</label><input id="catalogProductStock" type="number" min="0" step="0.001" value="0"></div>
            <div class="cc-field"><label>Harga beli / HPP</label><input id="catalogProductPurchase" type="number" min="0" step="1" value="0"></div><div class="cc-field"><label>Harga jual</label><input id="catalogProductSale" type="number" min="0" step="1" value="0"></div>
            <div class="cc-field full"><label>Catatan review (opsional)</label><textarea id="catalogReviewNote" rows="2" maxlength="1000"></textarea></div>
          </div><div class="catalog-manager-actions"><button class="cc-btn soft" data-catalog-manager-action id="catalogProductReset" type="button">Reset</button><button class="cc-btn red" data-catalog-manager-action id="catalogRequestReject" type="button" hidden>Tolak Pengajuan</button><button class="cc-btn green" data-catalog-manager-action id="catalogProductSave" type="button">Simpan Item</button></div><div class="cc-status" id="catalogManagerMessage">Siap.</div></section>
          <section><div class="catalog-manager-section-head"><h3>Item Cabang</h3><span class="cc-badge" id="catalogProductCount">0 item</span></div><div class="catalog-manager-products" id="catalogManagerProducts"></div></section>
        </div>
        <section class="catalog-request-queue"><div class="catalog-manager-section-head"><div><h3>Pengajuan Owner Cabang</h3><p>Pengajuan tidak pernah berisi harga beli/HPP. Owner Pusat melengkapi biaya sebelum menyetujui.</p></div><span class="cc-badge" id="catalogRequestCount">0 pending</span></div><div id="catalogRequestQueue" class="catalog-request-list"></div></section>
        </div>`;
        document.body.appendChild(modal);
        byId("catalogManagerClose").onclick=closeManager;
        modal.onclick=e=>{if(e.target===modal)closeManager()};
        byId("catalogProductReset").onclick=resetProductForm;
        byId("catalogProductSave").onclick=saveProduct;
        byId("catalogRequestReject").onclick=rejectRequest;
        byId("catalogManagerProducts").onclick=e=>{
            const edit=e.target.closest("[data-product-edit]");const del=e.target.closest("[data-product-delete]");
            if(edit)editProduct(edit.dataset.productEdit);
            if(del)deleteProduct(del.dataset.productDelete);
        };
        byId("catalogRequestQueue").onclick=e=>{
            const review=e.target.closest("[data-request-review]");
            if(review)reviewRequest(review.dataset.requestReview);
        };
    }

    function managerMessage(text,error=false){const n=byId("catalogManagerMessage");if(n){n.textContent=text;n.classList.toggle("error",error)}}
    function currentBranchRow(){return (statusData.branches||[]).find(r=>String(r.store_id)===String(activeStoreId))||null}
    function branchRequests(){return pendingRequests.filter(r=>String(r.store_id)===String(activeStoreId)&&r.status==="PENDING")}

    async function openManager(storeId){
        if(busy)return;
        ensureManager();activeStoreId=storeId;activeRequestId=null;editingProductId=null;
        byId("catalogManagerModal").classList.add("open");
        managerMessage("Memuat katalog cabang…");
        try{
            setBusy(true);
            activeCatalog=await window.LDMPrimaryOwner.branchCatalog(storeId);
            renderManager();resetProductForm();
            managerMessage("Katalog cabang siap dikelola.");
        }catch(error){managerMessage(error.message||String(error),true)}finally{setBusy(false)}
    }
    function closeManager(){byId("catalogManagerModal")?.classList.remove("open");activeCatalog=null;activeStoreId=null;activeRequestId=null;editingProductId=null}

    function renderManager(){
        if(!activeCatalog)return;
        const store=activeCatalog.store||{};
        const products=Array.isArray(activeCatalog.products)?activeCatalog.products:[];
        const editable=store.catalog_policy==="PRIMARY_OWNER_MANAGED_BRANCH";
        byId("catalogManagerTitle").textContent=`${store.name||"Cabang"} · ${modeLabel(store.operational_mode)}`;
        byId("catalogManagerSubtitle").textContent=editable
            ? "Mode berbeda dari pusat. Katalog khusus cabang ini hanya dapat dibuat/diubah Owner Pusat."
            : "Mode sama dengan pusat. Master mengikuti Toko Pusat; panel ini dipakai untuk meninjau pengajuan cabang.";
        byId("catalogManagerFormWrap").classList.toggle("catalog-direct-locked",!editable&&!activeRequestId);
        byId("catalogProductCount").textContent=`${products.filter(p=>p.active!==false&& !p.deleted_at).length} item`;
        byId("catalogManagerProducts").innerHTML=products.length?products.map(p=>`<div class="catalog-product-row ${p.active===false||p.deleted_at?"inactive":""}"><div><strong>${esc(p.name)}</strong><small>${esc(p.barcode||"Tanpa barcode")} · ${esc(p.category||"General")} · ${money(p.sale_price)}<br>HPP: ${money(p.purchase_price)} · Stok: ${number(p.legacy_stock_snapshot)} ${esc(p.unit||"Pcs")}</small></div>${editable&&p.active!==false&&!p.deleted_at?`<div class="catalog-row-actions"><button class="cc-btn soft" data-product-edit="${esc(p.id)}">Edit</button><button class="cc-btn red" data-product-delete="${esc(p.id)}">Hapus</button></div>`:""}</div>`).join(""):'<div class="cc-empty">Belum ada item pada cabang ini.</div>';
        renderRequestQueue();
    }

    function renderRequestQueue(){
        const rows=branchRequests();
        byId("catalogRequestCount").textContent=`${rows.length} pending`;
        byId("catalogRequestQueue").innerHTML=rows.length?rows.map(r=>`<div class="catalog-request-row"><div><strong>${esc(r.requested_name)}</strong><small>${esc(r.request_code)} · ${esc(r.requester_name||"Owner Cabang")} · ${esc(r.request_scope==="PRIMARY_CATALOG"?"Masuk katalog pusat":"Khusus cabang")}<br>${r.proposed_sale_price!=null?`Saran harga jual: ${money(r.proposed_sale_price)} · `:""}${esc(r.note||"Tanpa catatan")}</small></div><button class="cc-btn green" data-request-review="${esc(r.id)}">Tinjau</button></div>`).join(""):'<div class="cc-empty">Tidak ada pengajuan yang menunggu.</div>';
    }

    function resetProductForm(){
        activeRequestId=null;editingProductId=null;
        ["catalogProductId","catalogProductName","catalogProductBarcode","catalogProductCategory","catalogReviewNote"].forEach(id=>{if(byId(id))byId(id).value=""});
        byId("catalogProductUnit").value="Pcs";byId("catalogProductPurchaseUnit").value="Pcs";byId("catalogProductFactor").value="1";byId("catalogProductStock").value="0";byId("catalogProductPurchase").value="0";byId("catalogProductSale").value="0";
        byId("catalogFormTitle").textContent="Tambah Item";byId("catalogProductSave").textContent="Simpan Item";byId("catalogRequestReject").hidden=true;
        const editable=activeCatalog?.store?.catalog_policy==="PRIMARY_OWNER_MANAGED_BRANCH";
        byId("catalogManagerFormWrap")?.classList.toggle("catalog-direct-locked",!editable);
    }
    function fillProduct(p){
        byId("catalogProductId").value=p.id||"";byId("catalogProductName").value=p.name||"";byId("catalogProductBarcode").value=p.barcode||"";byId("catalogProductCategory").value=p.category||"General";byId("catalogProductUnit").value=p.unit||"Pcs";byId("catalogProductPurchaseUnit").value=p.purchase_unit||p.unit||"Pcs";byId("catalogProductFactor").value=Number(p.purchase_unit_factor||1);byId("catalogProductStock").value=Number(p.legacy_stock_snapshot||0);byId("catalogProductPurchase").value=Number(p.purchase_price||0);byId("catalogProductSale").value=Number(p.sale_price||0);
    }
    function editProduct(id){
        const p=(activeCatalog?.products||[]).find(x=>String(x.id)===String(id));if(!p)return;
        editingProductId=id;activeRequestId=null;fillProduct(p);byId("catalogFormTitle").textContent="Edit Item Cabang";byId("catalogProductSave").textContent="Simpan Perubahan";byId("catalogRequestReject").hidden=true;byId("catalogManagerFormWrap").classList.remove("catalog-direct-locked");
    }
    function reviewRequest(id){
        const r=pendingRequests.find(x=>String(x.id)===String(id));if(!r)return;
        activeRequestId=id;editingProductId=null;
        fillProduct({name:r.requested_name,barcode:r.requested_barcode,category:r.requested_category||"General",unit:r.requested_unit||"Pcs",purchase_unit:r.requested_unit||"Pcs",purchase_unit_factor:1,legacy_stock_snapshot:0,purchase_price:0,sale_price:r.proposed_sale_price||0});
        byId("catalogReviewNote").value="";byId("catalogFormTitle").textContent=`Tinjau ${r.request_code}`;byId("catalogProductSave").textContent="Setujui & Buat Item";byId("catalogRequestReject").hidden=false;byId("catalogManagerFormWrap").classList.remove("catalog-direct-locked");managerMessage("Lengkapi Harga Beli/HPP dan Harga Jual, lalu setujui. Data biaya tidak pernah dikirim ke Owner Cabang.");
    }
    function productPayload(){
        return {id:byId("catalogProductId").value||null,name:byId("catalogProductName").value.trim(),barcode:byId("catalogProductBarcode").value.trim()||null,category:byId("catalogProductCategory").value.trim()||"General",unit:byId("catalogProductUnit").value.trim()||"Pcs",purchase_unit:byId("catalogProductPurchaseUnit").value.trim()||byId("catalogProductUnit").value.trim()||"Pcs",purchase_unit_factor:Number(byId("catalogProductFactor").value||1),legacy_stock_snapshot:Number(byId("catalogProductStock").value||0),purchase_price:Number(byId("catalogProductPurchase").value||0),sale_price:Number(byId("catalogProductSale").value||0),active:true};
    }
    async function saveProduct(){
        if(busy)return;const product=productPayload();if(!product.name){managerMessage("Nama item wajib diisi.",true);return}
        try{
            setBusy(true);managerMessage(activeRequestId?"Menyetujui pengajuan dan membuat item…":"Menyimpan item cabang…");
            if(activeRequestId){
                await window.LDMPrimaryOwner.reviewCatalogRequest({requestId:activeRequestId,decision:"APPROVE",product,reviewNote:byId("catalogReviewNote").value});
            }else{
                await window.LDMPrimaryOwner.saveCatalogProduct({storeId:activeStoreId,product});
            }
            await reload();activeCatalog=await window.LDMPrimaryOwner.branchCatalog(activeStoreId);renderManager();resetProductForm();managerMessage("Perubahan katalog berhasil disimpan.");
        }catch(error){managerMessage(error.message||String(error),true)}finally{setBusy(false)}
    }
    async function rejectRequest(){
        if(!activeRequestId||busy)return;
        const note=byId("catalogReviewNote").value.trim();
        if(!confirm("Tolak pengajuan item ini?"))return;
        try{setBusy(true);await window.LDMPrimaryOwner.reviewCatalogRequest({requestId:activeRequestId,decision:"REJECT",product:{},reviewNote:note});await reload();activeCatalog=await window.LDMPrimaryOwner.branchCatalog(activeStoreId);renderManager();resetProductForm();managerMessage("Pengajuan ditolak.");}catch(error){managerMessage(error.message||String(error),true)}finally{setBusy(false)}
    }
    async function deleteProduct(id){
        if(busy||!confirm("Hapus item ini dari katalog cabang? Stok historis dan transaksi lama tidak ikut dihapus."))return;
        try{setBusy(true);await window.LDMPrimaryOwner.deleteCatalogProduct({storeId:activeStoreId,productId:id});activeCatalog=await window.LDMPrimaryOwner.branchCatalog(activeStoreId);renderManager();await reload();managerMessage("Item berhasil dinonaktifkan.");}catch(error){managerMessage(error.message||String(error),true)}finally{setBusy(false)}
    }

    function boot(){
        const panel=byId("catalogControlPanel");if(!panel)return;
        ensureManager();
        byId("catalogReload")?.addEventListener("click",reload);
        byId("catalogSyncAll")?.addEventListener("click",syncAll);
        byId("catalogBranchRows")?.addEventListener("click",event=>{
            const sync=event.target.closest("[data-catalog-sync]");if(sync)return syncOne(sync.dataset.catalogSync);
            const manage=event.target.closest("[data-catalog-manage]");if(manage)return openManager(manage.dataset.catalogManage);
        });
        byId("catalogBranchRows")?.addEventListener("change",event=>{const input=event.target.closest("[data-catalog-auto]");if(input)toggleAuto(input)});
        window.addEventListener("ldm-primary-owner-ready",event=>{if(event.detail?.is_primary_owner)reload()},{once:true});
        if(window.LDM_PRIMARY_OWNER_CONTEXT?.is_primary_owner)reload();
    }

    window.LDMCentralCatalog=Object.freeze({version:VERSION,reload,openManager});
    document.addEventListener("DOMContentLoaded",boot);
})();
