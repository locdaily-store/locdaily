(function(){
    "use strict";

    const VERSION="27.9.0-v28.18.0";
    const $=id=>document.getElementById(id);
    const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"})[c]);
    let context=null;
    let requests=[];
    let busy=false;

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
    async function getContext(){
        context=await rpc("ldm_branch_catalog_request_context");
        return context||{};
    }
    async function list(){
        requests=await rpc("ldm_branch_catalog_my_requests",{p_limit:50});
        if(!Array.isArray(requests))requests=[];
        return requests;
    }
    async function create(value={}){
        return rpc("ldm_branch_catalog_request_create",{
            p_name:String(value.name||"").trim(),
            p_barcode:String(value.barcode||"").trim()||null,
            p_category:String(value.category||"").trim()||null,
            p_unit:String(value.unit||"Pcs").trim()||"Pcs",
            p_proposed_sale_price:value.salePrice===""||value.salePrice==null?null:Number(value.salePrice),
            p_note:String(value.note||"").trim()||null
        });
    }
    async function cancel(requestId){
        return rpc("ldm_branch_catalog_request_cancel",{p_request_id:requestId});
    }

    function installStyle(){
        if($("ldmCatalogRequestStyle"))return;
        const style=document.createElement("style");
        style.id="ldmCatalogRequestStyle";
        style.textContent=`
        #catalogRequestPanel{display:none;margin:0 0 14px;padding:14px;border:1px solid #bbd7c6;border-radius:14px;background:#f3fbf6;color:#173e29}
        html[data-ldm-catalog-requester="true"] #catalogRequestPanel{display:block}
        .ldm-cr-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
        .ldm-cr-head strong{display:block;font-size:.86rem}.ldm-cr-head p{margin:4px 0 0;font-size:.72rem;line-height:1.55;color:#557060}
        .ldm-cr-btn{border:0;border-radius:10px;padding:9px 12px;background:#0f9d58;color:#fff;font-weight:800;cursor:pointer}
        .ldm-cr-btn.soft{background:#e7efe9;color:#294536}.ldm-cr-list{display:grid;gap:7px;margin-top:10px}
        .ldm-cr-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;background:#fff;border:1px solid #dce9e0;border-radius:10px;padding:9px 10px;font-size:.7rem}
        .ldm-cr-row small{display:block;color:#667085;margin-top:3px}.ldm-cr-badge{display:inline-flex;padding:3px 7px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:.6rem;font-weight:800}
        .ldm-cr-badge.APPROVED{background:#dcfce7;color:#166534}.ldm-cr-badge.REJECTED,.ldm-cr-badge.CANCELLED{background:#fee2e2;color:#991b1b}
        .ldm-cr-modal{position:fixed;inset:0;z-index:2147482600;background:rgba(9,24,42,.7);display:none;align-items:center;justify-content:center;padding:16px}.ldm-cr-modal.open{display:flex}
        .ldm-cr-card{width:min(560px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:18px;color:#172033}
        .ldm-cr-card h3{margin:0 0 4px}.ldm-cr-card>p{margin:0 0 14px;color:#667085;font-size:.72rem;line-height:1.55}
        .ldm-cr-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ldm-cr-field{display:flex;flex-direction:column;gap:5px}.ldm-cr-field.full{grid-column:1/-1}.ldm-cr-field label{font-size:.68rem;font-weight:800;color:#475467}.ldm-cr-field input,.ldm-cr-field select,.ldm-cr-field textarea{width:100%;border:1px solid #cfd7e3;border-radius:10px;padding:9px 10px;font:inherit;font-size:.76rem;background:#fff;color:#172033}.ldm-cr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        @media(max-width:620px){.ldm-cr-form{grid-template-columns:1fr}.ldm-cr-field.full{grid-column:auto}.ldm-cr-actions{display:grid}.ldm-cr-actions button{width:100%}}
        `;
        document.head.appendChild(style);
    }

    function installUI(){
        if($("catalogRequestPanel"))return;
        const notice=$("catalogAuthorityNotice");
        if(!notice)return;
        const panel=document.createElement("section");
        panel.id="catalogRequestPanel";
        panel.innerHTML=`<div class="ldm-cr-head"><div><strong>📨 Butuh item atau menu baru?</strong><p>Owner Cabang dapat mengajukan item. Harga beli, HPP, supplier cost, dan aktivasi master tetap dikendalikan Owner Pusat.</p></div><button type="button" class="ldm-cr-btn" id="catalogRequestOpen">+ Ajukan Item Baru</button></div><div id="catalogRequestList" class="ldm-cr-list"></div>`;
        notice.insertAdjacentElement("afterend",panel);

        const modal=document.createElement("div");
        modal.id="catalogRequestModal";
        modal.className="ldm-cr-modal";
        modal.innerHTML=`<div class="ldm-cr-card"><h3>Ajukan Item Baru</h3><p>Isi kebutuhan operasional. Anda tidak perlu dan tidak dapat mengisi harga beli/HPP.</p><div class="ldm-cr-form"><div class="ldm-cr-field full"><label>Nama item / menu</label><input id="catalogReqName" maxlength="180" placeholder="Contoh: Matcha Latte"></div><div class="ldm-cr-field"><label>Barcode (opsional)</label><input id="catalogReqBarcode" maxlength="100" placeholder="Kosongkan untuk menu tanpa barcode"></div><div class="ldm-cr-field"><label>Kategori</label><input id="catalogReqCategory" maxlength="100" placeholder="Minuman"></div><div class="ldm-cr-field"><label>Satuan</label><input id="catalogReqUnit" maxlength="40" value="Pcs"></div><div class="ldm-cr-field"><label>Saran harga jual (opsional)</label><input id="catalogReqSale" type="number" min="0" step="1" placeholder="22000"></div><div class="ldm-cr-field full"><label>Catatan kebutuhan</label><textarea id="catalogReqNote" rows="3" maxlength="1000" placeholder="Contoh: banyak pelanggan meminta menu ini."></textarea></div></div><div id="catalogReqMessage" style="margin-top:10px;font-size:.7rem;color:#667085"></div><div class="ldm-cr-actions"><button type="button" class="ldm-cr-btn soft" id="catalogReqClose">Batal</button><button type="button" class="ldm-cr-btn" id="catalogReqSubmit">Kirim Pengajuan</button></div></div>`;
        document.body.appendChild(modal);

        $("catalogRequestOpen").onclick=()=>modal.classList.add("open");
        $("catalogReqClose").onclick=()=>modal.classList.remove("open");
        modal.onclick=e=>{if(e.target===modal)modal.classList.remove("open")};
        $("catalogReqSubmit").onclick=submit;
        $("catalogRequestList").onclick=async e=>{
            const b=e.target.closest("[data-cancel-request]");
            if(!b||busy)return;
            if(!confirm("Batalkan pengajuan item ini?"))return;
            try{busy=true;await cancel(b.dataset.cancelRequest);await refresh();}
            catch(error){alert(error.message||String(error))}finally{busy=false}
        };
    }

    function render(){
        const box=$("catalogRequestList");
        if(!box)return;
        if(!requests.length){box.innerHTML='<div style="font-size:.68rem;color:#667085">Belum ada pengajuan item dari akun ini.</div>';return;}
        box.innerHTML=requests.slice(0,8).map(r=>`<div class="ldm-cr-row"><div><strong>${esc(r.requested_name)}</strong><small>${esc(r.request_code)} · ${new Date(r.created_at).toLocaleString("id-ID")} · ${esc(r.review_note||"")}</small></div><div style="display:flex;gap:6px;align-items:center"><span class="ldm-cr-badge ${esc(r.status)}">${esc(r.status)}</span>${r.status==="PENDING"?`<button type="button" class="ldm-cr-btn soft" data-cancel-request="${esc(r.id)}">Batalkan</button>`:""}</div></div>`).join("");
    }

    async function submit(){
        if(busy)return;
        const name=$("catalogReqName").value.trim();
        if(!name){$("catalogReqMessage").textContent="Nama item wajib diisi.";return;}
        const btn=$("catalogReqSubmit");
        try{
            busy=true;btn.disabled=true;$("catalogReqMessage").textContent="Mengirim pengajuan…";
            await create({name,barcode:$("catalogReqBarcode").value,category:$("catalogReqCategory").value,unit:$("catalogReqUnit").value,salePrice:$("catalogReqSale").value,note:$("catalogReqNote").value});
            $("catalogReqMessage").textContent="Pengajuan berhasil dikirim ke Owner Pusat.";
            ["catalogReqName","catalogReqBarcode","catalogReqCategory","catalogReqSale","catalogReqNote"].forEach(id=>$(id).value="");
            $("catalogReqUnit").value="Pcs";
            await list();render();
            setTimeout(()=>$("catalogRequestModal").classList.remove("open"),450);
        }catch(error){$("catalogReqMessage").textContent=error.message||String(error)}finally{busy=false;btn.disabled=false}
    }

    async function refresh(){await list();render();}

    async function init(){
        installStyle();installUI();
        document.documentElement.dataset.ldmCatalogRequester="false";
        try{
            const ctx=await getContext();
            const can=ctx?.can_request===true;
            document.documentElement.dataset.ldmCatalogRequester=String(can);
            if(can){
                const notice=$("catalogAuthorityNotice");
                if(notice)notice.innerHTML="<strong>Master barang dikelola Owner Pusat.</strong><br>Owner Cabang tidak menerima harga beli/HPP. Jika membutuhkan item atau menu baru, gunakan <b>Ajukan Item Baru</b> di bawah ini.";
                await refresh();
            }
        }catch(error){console.warn("Catalog request context:",error)}
    }

    window.LDMCatalogRequests=Object.freeze({version:VERSION,getContext,list,create,cancel,refresh,init});
    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
