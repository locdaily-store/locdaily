(function(){
    "use strict";

    const $=id=>document.getElementById(id);
    const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
    const MODE_LABELS={retail:"Toko Ritel",cafe:"Kafe",warung:"Warung"};
    const ROLE_LABELS={owner:"Owner Cabang",admin:"Admin",kasir:"Kasir"};
    const TEMPLATES={
        supervisor:{label:"Supervisor Cabang",base:"admin",modes:["retail","cafe","warung"],permissions:["dashboard.view","attendance.use","absence.view","pos.use","inventory.view","stock_card.view","stock_opname.use","multi_store.use","reports.view","finance.revenue.view","expenses.manage","shift_closing.use","support.use","privacy.view","license.view"]},
        kepala:{label:"Kepala Toko",base:"owner",modes:["retail","cafe","warung"],permissions:["dashboard.view","attendance.use","master_shift.manage","absence.view","pos.use","inventory.view","stock_card.view","stock_opname.use","multi_store.use","suppliers.use","purchase_order.use","goods_receipt.use","returns.use","reports.view","finance.revenue.view","expenses.manage","shift_closing.use","eod.use","backup_restore.use","accounts.manage","devices.manage","app_update.use","storage.manage","recovery.use","qa_security.view","support.use","privacy.view","license.view"]},
        kasirSenior:{label:"Kasir Senior",base:"kasir",modes:["retail","cafe","warung"],permissions:["dashboard.view","attendance.use","absence.view","pos.use","inventory.view","stock_card.view","stock_opname.use","returns.use","reports.view","app_update.use","recovery.use","support.use","privacy.view","license.view"]},
        barista:{label:"Barista",base:"kasir",modes:["cafe"],permissions:["dashboard.view","attendance.use","pos.use","inventory.view","returns.use","support.use","privacy.view","license.view"]},
        gudang:{label:"Staf Gudang",base:"admin",modes:["retail","warung"],permissions:["dashboard.view","attendance.use","inventory.view","stock_card.view","stock_opname.use","suppliers.use","purchase_order.use","goods_receipt.use","reports.view","support.use","privacy.view","license.view"]}
    };

    const state={catalog:[],roles:[],stores:[],assignments:[],audit:[],selectedId:null,editing:null,context:null,permissionSearch:"",permissionFilter:"all",expandedModules:new Set()};
    const MODULE_ICONS={dashboard:"📊",attendance:"🕒",master_shift:"🗓️",absence:"📋",pos:"🧾",inventory:"📦",stock_card:"🗂️",stock_opname:"📏",multi_store:"🏬",suppliers:"🚚",purchase_order:"📝",goods_receipt:"📥",returns:"↩️",reports:"📈",expenses:"💸",shift_closing:"🔐",eod:"🌙",accounts:"👥",devices:"💻",storage:"🗄️",recovery:"🛟",support:"💬",privacy:"🔒",license:"🔑"};

    function api(){
        if(!window.LDMEmployeePermissions)throw new Error("Fitur belum siap. Muat ulang halaman.");
        return window.LDMEmployeePermissions;
    }
    function setStatus(message,type=""){
        const node=$("jrStatus"); if(!node)return;
        node.textContent=message; node.className=`jr-status ${type}`.trim();
    }
    function reportError(context,error){
        try{console.error(`[Jabatan & Hak Akses] ${context}`,error);}catch(_error){}
    }
    function actionError(message,context,error){
        reportError(context,error);
        setStatus(message,"error");
    }
    function publicText(value){
        return String(value??"")
            .replace(/role sistem/gi,"tingkat akun")
            .replace(/custom/gi,"tambahan")
            .replace(/scope/gi,"cakupan")
            .replace(/permission/gi,"hak akses")
            .replace(/server/gi,"sistem")
            .replace(/mask(?:ing|ed)?/gi,"sembunyikan")
            .replace(/RPC/gi,"layanan");
    }
    function publicPermissionLabel(item){
        const map={
            "finance.revenue.view":"Pendapatan & Omzet",
            "finance.profit.view":"Laba",
            "hpp.view":"Harga Pokok (HPP)"
        };
        return map[item?.code]||publicText(item?.label||"Fitur");
    }
    function publicPermissionDescription(item){
        const map={
            "finance.revenue.view":"Menampilkan nilai penjualan, pembayaran, dan omzet pada bagian yang berkaitan.",
            "finance.profit.view":"Menampilkan laba. Pendapatan dan Harga Pokok juga perlu diaktifkan.",
            "hpp.view":"Menampilkan harga pokok atau harga beli pada bagian yang berkaitan."
        };
        return map[item?.code]||publicText(item?.description||"Atur apakah fitur ini dapat digunakan oleh jabatan ini.");
    }
    function setBusy(value){document.querySelectorAll("[data-jr-action]").forEach(btn=>btn.disabled=Boolean(value));}
    function roleById(id){return state.roles.find(role=>role.id===id)||null;}
    function clone(value){return JSON.parse(JSON.stringify(value));}
    function defaultPermissions(base){
        return state.catalog.filter(item=>item.active!==false&&!item.primary_owner_only&&item.allowed_system_roles?.includes(base)&&(item.mandatory||item.default_enabled_roles?.includes(base))).map(item=>item.code);
    }
    function blankRole(){return {id:null,name:"",description:"",base_system_role:"admin",scope_all_stores:true,allowed_modes:["retail","cafe","warung"],active:true,permissions:defaultPermissions("admin"),limits:{"pos.discount.max_percent":100},store_ids:[],assigned_count:0,assigned_store_count:0};}

    function showTab(name){
        document.querySelectorAll(".jr-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===name));
        document.querySelectorAll(".jr-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===name));
    }

    function renderRoles(){
        const list=$("jrRoleList");
        if(!state.roles.length){list.innerHTML='<div class="jr-empty">Belum ada jabatan tambahan. Buat jabatan pertama untuk memulai.</div>';return;}
        list.innerHTML=state.roles.map(role=>`<button type="button" class="jr-role-card ${state.selectedId===role.id?'active':''} ${role.active?'':'inactive'}" data-role-id="${esc(role.id)}"><div class="jr-role-name"><span>${esc(role.name)}</span><span class="jr-pill ${role.active?'green':'warn'}">${role.active?'AKTIF':'NONAKTIF'}</span></div><div class="jr-role-meta">${esc(ROLE_LABELS[role.base_system_role]||role.base_system_role)} · ${Number(role.assigned_count||0)} karyawan · ${Number(role.assigned_store_count||0)} cabang<br>${role.scope_all_stores?'Semua cabang':`${(role.store_ids||[]).length} cabang`} · ${(role.allowed_modes||[]).map(m=>MODE_LABELS[m]||m).join(', ')}</div></button>`).join("");
        list.querySelectorAll("[data-role-id]").forEach(btn=>btn.addEventListener("click",()=>selectRole(btn.dataset.roleId)));
    }

    function editorDraft(){return state.editing||blankRole();}
    function permissionAllowedForBase(item,base){return Array.isArray(item.allowed_system_roles)&&item.allowed_system_roles.includes(base);}
    const SENSITIVE_CODES=["finance.revenue.view","finance.profit.view","hpp.view"];
    function hasPermission(code){return (state.editing?.permissions||[]).includes(code);}
    function setPermission(code,enabled){
        const set=new Set(state.editing?.permissions||[]);
        const item=state.catalog.find(entry=>entry.code===code);
        if(enabled){
            set.add(code);
            if(item?.parent_permission_code)set.add(item.parent_permission_code);
        }else{
            set.delete(code);
            if(!item?.parent_permission_code){
                state.catalog.filter(entry=>entry.parent_permission_code===code).forEach(child=>set.delete(child.code));
            }
        }
        if(code==="finance.profit.view"&&enabled){set.add("finance.revenue.view");set.add("hpp.view");}
        if((code==="finance.revenue.view"||code==="hpp.view")&&!enabled)set.delete("finance.profit.view");
        state.editing.permissions=[...set];
    }
    function renderSensitivePermissions(){
        const wrap=$("jrSensitivePermissions"); if(!wrap)return;
        const draft=editorDraft();
        const cards=SENSITIVE_CODES.map(code=>state.catalog.find(item=>item.code===code)).filter(Boolean);
        wrap.innerHTML=cards.map(item=>{
            const baseAllowed=permissionAllowedForBase(item,draft.base_system_role);
            const checked=baseAllowed&&hasPermission(item.code);
            const icon=item.code==="finance.revenue.view"?"💰":item.code==="finance.profit.view"?"📈":"🏷️";
            const hint=publicPermissionDescription(item);
            return `<label class="jr-sensitive-card ${checked?'active':''} ${baseAllowed?'':'disabled'}">
                <span class="jr-sensitive-icon">${icon}</span>
                <span class="jr-sensitive-copy"><strong>${esc(publicPermissionLabel(item))}</strong><small>${esc(hint)}</small></span>
                <span class="jr-switch"><input type="checkbox" data-sensitive="${esc(item.code)}" ${checked?'checked':''} ${baseAllowed?'':'disabled'}><i></i></span>
            </label>`;
        }).join("");
        wrap.querySelectorAll("[data-sensitive]").forEach(input=>input.addEventListener("change",()=>{
            setPermission(input.dataset.sensitive,input.checked);
            renderSensitivePermissions(); renderPermissions(); renderImpact();
        }));
    }
    function moduleChildren(parentCode){
        const draft=editorDraft();
        return state.catalog.filter(item=>
            item.active!==false &&
            !item.primary_owner_only &&
            item.parent_permission_code===parentCode &&
            permissionAllowedForBase(item,draft.base_system_role)
        );
    }
    function modulePanelId(code){
        return `jrModulePanel-${String(code||"module").replace(/[^a-zA-Z0-9_-]+/g,"-")}`;
    }
    function hideDropdown(parentCode){
        if(parentCode){
            state.expandedModules.delete(parentCode);
            const section=document.querySelector(`[data-access-module="${CSS.escape(parentCode)}"]`);
            if(section){
                section.classList.remove("expanded");
                const toggle=section.querySelector("[data-module-toggle]");
                toggle?.setAttribute("aria-expanded","false");
                toggle?.setAttribute("aria-label","Tampilkan fitur");
                const panel=section.querySelector("[data-module-panel]");
                panel?.setAttribute("aria-hidden","true");
                panel?.setAttribute("inert","");
            }
            return;
        }
        state.expandedModules.clear();
        document.querySelectorAll("[data-access-module].expanded").forEach(section=>{
            section.classList.remove("expanded");
            const toggle=section.querySelector("[data-module-toggle]");
            toggle?.setAttribute("aria-expanded","false");
            toggle?.setAttribute("aria-label","Tampilkan fitur");
            const panel=section.querySelector("[data-module-panel]");
            panel?.setAttribute("aria-hidden","true");
            panel?.setAttribute("inert","");
        });
    }
    function showDropdown(anchor,parentCode){
        if(!anchor||!parentCode)return;
        const section=anchor.closest("[data-access-module]");
        if(!section)return;
        const opening=!section.classList.contains("expanded");
        section.classList.toggle("expanded",opening);
        anchor.setAttribute("aria-expanded",opening?"true":"false");
        anchor.setAttribute("aria-label",opening?"Sembunyikan fitur":"Tampilkan fitur");
        const panel=section.querySelector("[data-module-panel]");
        if(panel){
            panel.setAttribute("aria-hidden",opening?"false":"true");
            if(opening)panel.removeAttribute("inert");else panel.setAttribute("inert","");
        }
        if(opening)state.expandedModules.add(parentCode);else state.expandedModules.delete(parentCode);
    }
    window.showDropdown=showDropdown;
    window.hideDropdown=hideDropdown;

    function renderPermissions(){
        const draft=editorDraft();
        const container=$("jrPermissionGroups");
        const query=String(state.permissionSearch||"").trim().toLowerCase();
        const filter=state.permissionFilter||"all";
        const pages=state.catalog.filter(item=>
            item.active!==false &&
            !SENSITIVE_CODES.includes(item.code) &&
            !item.primary_owner_only &&
            !item.parent_permission_code &&
            item.permission_kind!=="data"
        );
        const modules=[];
        pages.forEach(parent=>{
            if(!permissionAllowedForBase(parent,draft.base_system_role))return;
            let children=moduleChildren(parent.code);
            const parentSelected=hasPermission(parent.code)||parent.mandatory===true;
            const anySelected=parentSelected||children.some(child=>hasPermission(child.code));
            if(filter==="selected"&&!anySelected)return;
            if(filter==="sensitive"){
                children=children.filter(child=>child.risk_level==="sensitive"||child.risk_level==="critical");
                if(!children.length)return;
            }
            if(query){
                const parentHay=`${parent.label||""} ${parent.description||""} ${parent.category||""}`.toLowerCase();
                const matchingChildren=children.filter(child=>`${child.label||""} ${child.description||""} ${child.category||""}`.toLowerCase().includes(query));
                if(!parentHay.includes(query)&&!matchingChildren.length)return;
                if(!parentHay.includes(query))children=matchingChildren;
            }
            modules.push({parent,children,parentSelected,anySelected});
        });
        if(!modules.length){container.innerHTML='<div class="jr-access-empty">Tidak ada akses yang cocok dengan pencarian atau filter.</div>';return;}
        container.innerHTML=modules.map(({parent,children,parentSelected,anySelected})=>{
            const mandatory=parent.mandatory===true;
            const icon=MODULE_ICONS[parent.module_key]||"◻️";
            const allChildren=moduleChildren(parent.code);
            const activeCount=allChildren.filter(child=>hasPermission(child.code)||child.mandatory===true).length;
            const forcedOpen=Boolean(query)||filter==="sensitive";
            const expanded=allChildren.length>0&&(forcedOpen||state.expandedModules.has(parent.code));
            const panelId=modulePanelId(parent.code);
            const discountItem=allChildren.find(item=>item.code==="pos.discount.apply");
            const discountEnabled=Boolean(discountItem&&(hasPermission(discountItem.code)||discountItem.mandatory===true));
            const rawLimit=Number(draft?.limits?.["pos.discount.max_percent"]);
            const discountLimit=Number.isFinite(rawLimit)?Math.max(0,Math.min(100,rawLimit)):100;
            const actionsMarkup=children.length?`<div class="jr-access-actions">${children.map(child=>{
                const selected=hasPermission(child.code);
                const required=child.mandatory===true;
                const risk=child.risk_level||"normal";
                const riskBadge=risk==="critical"?'<span class="jr-risk-badge critical">Sangat penting</span>':risk==="sensitive"?'<span class="jr-risk-badge sensitive">Aksi penting</span>':'';
                return `<label class="jr-access-action ${selected?'active':''} ${required?'locked':''}"><input type="checkbox" data-action-permission="${esc(child.code)}" ${selected||required?'checked':''} ${required?'disabled':''}><span><strong>${esc(publicPermissionLabel(child))}${riskBadge}</strong><small>${esc(publicPermissionDescription(child))}</small></span></label>`;
            }).join("")}</div>`:'<div class="jr-access-empty">Halaman ini tidak memiliki tindakan tambahan yang dapat diatur.</div>';
            const discountMarkup=discountItem?`<div class="jr-module-limit ${discountEnabled?'':'disabled'}"><div><strong>Batas diskon transaksi</strong><small>Tentukan diskon manual maksimum yang boleh diberikan oleh jabatan ini.</small></div><label><input type="number" min="0" max="100" step="0.01" inputmode="decimal" data-inline-discount value="${esc(discountLimit)}" ${discountEnabled?'':'disabled'}><b>%</b></label></div>`:"";
            return `<section class="jr-access-module ${anySelected?'selected':''} ${expanded?'expanded':''}" data-access-module="${esc(parent.code)}">
              <div class="jr-access-module-head"><label>
                <input type="checkbox" data-page-permission="${esc(parent.code)}" ${parentSelected?'checked':''} ${mandatory?'disabled':''}>
                <span><strong>${icon} ${esc(publicPermissionLabel(parent))}${mandatory?' <span class="jr-pill green">Diperlukan</span>':''}</strong><small>${esc(publicPermissionDescription(parent))}</small></span>
              </label><div class="jr-access-module-tools"><span class="jr-pill">${activeCount}/${allChildren.length} tindakan</span>${allChildren.length?`<button type="button" class="jr-module-toggle" data-module-toggle data-module-code="${esc(parent.code)}" aria-expanded="${expanded?'true':'false'}" aria-controls="${panelId}" aria-label="${expanded?'Sembunyikan':'Tampilkan'} fitur ${esc(publicPermissionLabel(parent))}"><span class="jr-chevron" aria-hidden="true">▼</span></button>`:""}</div></div>
              ${allChildren.length?`<div class="jr-access-collapse" id="${panelId}" data-module-panel aria-hidden="${expanded?'false':'true'}" ${expanded?'':'inert'}><div class="jr-access-collapse-inner">${actionsMarkup}${discountMarkup}</div></div>`:""}
            </section>`;
        }).join("");
        container.querySelectorAll("[data-page-permission]").forEach(input=>input.addEventListener("change",()=>{setPermission(input.dataset.pagePermission,input.checked);refreshPermissionEditor();}));
        container.querySelectorAll("[data-action-permission]").forEach(input=>input.addEventListener("change",()=>{setPermission(input.dataset.actionPermission,input.checked);refreshPermissionEditor();}));
        container.querySelectorAll("[data-module-toggle]").forEach(button=>button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();showDropdown(button,button.dataset.moduleCode);}));
        container.querySelectorAll("[data-inline-discount]").forEach(input=>input.addEventListener("input",event=>{
            const value=Number(event.target.value);
            const normalized=Number.isFinite(value)?Math.max(0,Math.min(100,value)):100;
            if(!state.editing.limits)state.editing.limits={};
            state.editing.limits["pos.discount.max_percent"]=normalized;
            event.target.value=String(normalized);
            renderLimitSettings();
        }));
    }

    function renderLimitSettings(){
        const input=$("jrDiscountLimit"); if(!input)return;
        const available=permissionAllowedForBase(state.catalog.find(item=>item.code==="pos.discount.apply")||{},editorDraft().base_system_role);
        const enabled=hasPermission("pos.discount.apply");
        const raw=Number(editorDraft()?.limits?.["pos.discount.max_percent"]);
        input.value=String(Number.isFinite(raw)?Math.max(0,Math.min(100,raw)):100);
        input.disabled=!available||!enabled;
        const card=input.closest(".jr-limit-card"); if(card)card.classList.toggle("disabled",input.disabled);
    }

    function renderStores(){
        const draft=editorDraft();
        const wrap=$("jrStoreList");
        wrap.hidden=draft.scope_all_stores;
        wrap.innerHTML=state.stores.map(store=>`<label class="jr-store-option"><input type="checkbox" data-store-id="${esc(store.id)}" ${(draft.store_ids||[]).includes(store.id)?'checked':''}><span><strong>${store.is_primary?'⭐ ':''}${esc(store.name)}</strong><br><small>${esc(store.code)} · ${esc(MODE_LABELS[store.operational_mode]||store.operational_mode)}</small></span></label>`).join("");
        wrap.querySelectorAll("[data-store-id]").forEach(input=>input.addEventListener("change",()=>{
            const set=new Set(state.editing.store_ids||[]);
            if(input.checked)set.add(input.dataset.storeId);else set.delete(input.dataset.storeId);
            state.editing.store_ids=[...set];
        }));
    }

    function renderImpact(){
        const draft=editorDraft();
        const role=roleById(draft.id);
        $("jrImpactUsers").textContent=String(role?.assigned_count||0);
        $("jrImpactStores").textContent=String(role?.assigned_store_count||0);
        const effective=new Set((draft.permissions||[]).filter(code=>{
            const item=state.catalog.find(x=>x.code===code);return item&&!item.primary_owner_only&&permissionAllowedForBase(item,draft.base_system_role);
        }));
        state.catalog.filter(item=>item.mandatory&&permissionAllowedForBase(item,draft.base_system_role)&&!item.primary_owner_only).forEach(item=>effective.add(item.code));
        $("jrImpactPermissions").textContent=String(effective.size);
        $("jrPermissionCountText").textContent=`${effective.size} akses aktif`;
    }

    function renderEditor(){
        const draft=editorDraft();
        $("jrEditorTitle").textContent=draft.id?`Edit ${draft.name}`:"Buat Jabatan Baru";
        $("jrEditorHint").textContent=draft.id?"Perubahan akan diterapkan pada semua karyawan yang memakai jabatan ini.":"Isi informasi jabatan, lalu pilih akses yang sesuai dengan tugasnya.";
        $("jrName").value=draft.name||"";
        $("jrDescription").value=draft.description||"";
        $("jrBaseRole").value=draft.base_system_role||"admin";
        $("jrAllStores").checked=draft.scope_all_stores!==false;
        document.querySelectorAll("[data-mode]").forEach(input=>{input.checked=(draft.allowed_modes||[]).includes(input.dataset.mode);});
        $("jrSaveRole").textContent=draft.id?"Simpan Perubahan":"Buat Jabatan";
        $("jrDuplicateRole").hidden=!draft.id;
        $("jrToggleActive").hidden=!draft.id;
        $("jrDeleteRole").hidden=!draft.id;
        $("jrToggleActive").textContent=draft.active?"Nonaktifkan":"Aktifkan";
        $("jrToggleActive").className=`jr-btn ${draft.active?'red-outline':'green'}`;
        renderStores();renderSensitivePermissions();renderPermissions();renderLimitSettings();renderImpact();
    }

    function selectRole(id){
        const role=roleById(id); if(!role)return;
        state.selectedId=id; state.editing=clone(role); renderRoles(); renderEditor();
    }
    function newRole(){state.selectedId=null;state.editing=blankRole();renderRoles();renderEditor();$("jrName").focus();}

    function applyTemplate(key){
        const t=TEMPLATES[key]; if(!t)return;
        const draft=blankRole();
        draft.name=t.label;draft.base_system_role=t.base;draft.allowed_modes=[...t.modes];
        const chosen=new Set(t.permissions);
        state.catalog.filter(item=>item.parent_permission_code&&chosen.has(item.parent_permission_code)&&item.default_enabled_roles?.includes(t.base)&&permissionAllowedForBase(item,t.base)&&!item.primary_owner_only).forEach(item=>chosen.add(item.code));
        state.catalog.filter(item=>item.mandatory&&permissionAllowedForBase(item,t.base)&&!item.primary_owner_only).forEach(item=>chosen.add(item.code));
        draft.permissions=[...chosen];draft.limits={"pos.discount.max_percent":100};
        state.selectedId=null;state.editing=draft;renderRoles();renderEditor();setStatus(`Contoh ${t.label} sudah diterapkan. Sesuaikan pengaturannya, lalu simpan.`);
    }

    function readEditor(){
        const draft=state.editing||blankRole();
        draft.name=$("jrName").value.trim();
        draft.description=$("jrDescription").value.trim();
        draft.base_system_role=$("jrBaseRole").value;
        draft.scope_all_stores=$("jrAllStores").checked;
        draft.allowed_modes=[...document.querySelectorAll("[data-mode]:checked")].map(input=>input.dataset.mode);
        const mandatory=state.catalog.filter(item=>item.mandatory&&permissionAllowedForBase(item,draft.base_system_role)&&!item.primary_owner_only).map(item=>item.code);
        draft.permissions=[...new Set([...(draft.permissions||[]).filter(code=>{
            const item=state.catalog.find(x=>x.code===code);return item&&!item.primary_owner_only&&permissionAllowedForBase(item,draft.base_system_role);
        }),...mandatory])];
        const discountInput=$("jrDiscountLimit");
        const discountValue=Number(discountInput?.value);
        draft.limits={...(draft.limits||{}),"pos.discount.max_percent":Number.isFinite(discountValue)?Math.max(0,Math.min(100,discountValue)):100};
        if(draft.scope_all_stores)draft.store_ids=[];
        state.editing=draft;
        return draft;
    }

    async function saveRole(){
        const draft=readEditor();
        if(draft.name.length<2){setStatus("Nama jabatan minimal 2 karakter.","error");return;}
        if(!draft.allowed_modes.length){setStatus("Pilih minimal satu jenis usaha.","error");return;}
        if(!draft.scope_all_stores&&!draft.store_ids.length){setStatus("Pilih minimal satu cabang atau gunakan Semua Cabang.","error");return;}
        setBusy(true);setStatus("Menyimpan jabatan…");
        try{
            const result=await api().saveRole({id:draft.id||null,name:draft.name,description:draft.description||null,base_system_role:draft.base_system_role,scope_all_stores:draft.scope_all_stores,allowed_modes:draft.allowed_modes,store_ids:draft.store_ids,permissions:draft.permissions,limits:draft.limits,active:draft.active!==false});
            await reloadAll(false);
            state.selectedId=result?.role_id||state.selectedId;
            const saved=roleById(state.selectedId);state.editing=saved?clone(saved):blankRole();
            renderRoles();renderEditor();setStatus("Jabatan berhasil disimpan. Karyawan yang menggunakan jabatan ini akan memakai pengaturan terbaru.","ok");
        }catch(error){actionError("Jabatan belum dapat disimpan. Periksa pilihan yang diisi lalu coba lagi.","saveRole",error);}
        finally{setBusy(false);}
    }

    async function toggleActive(){
        const draft=readEditor();if(!draft.id)return;
        const next=!draft.active;
        const label=next?"mengaktifkan":"menonaktifkan";
        if(!next&&!confirm(`Nonaktifkan ${draft.name}? Karyawan yang memakai jabatan ini sementara hanya menggunakan akses dasar yang diperlukan sampai jabatan diaktifkan kembali atau diganti.`))return;
        setBusy(true);setStatus(`Sedang ${label} jabatan…`);
        try{await api().setActive(draft.id,next);await reloadAll(false);selectRole(draft.id);setStatus(`Jabatan berhasil ${next?'diaktifkan':'dinonaktifkan'}.`,"ok");}
        catch(error){actionError(`Jabatan belum dapat ${next?"diaktifkan":"dinonaktifkan"}. Coba lagi.`,"toggleActive",error);}
        finally{setBusy(false);}
    }

    function duplicateRole(){
        const draft=readEditor();if(!draft.id)return;
        const copy=clone(draft);copy.id=null;copy.name=`${copy.name} - Salinan`;copy.assigned_count=0;copy.assigned_store_count=0;copy.active=true;
        state.selectedId=null;state.editing=copy;renderRoles();renderEditor();setStatus("Salinan jabatan siap diedit. Periksa nama dan pilihan akses, lalu simpan.");
    }

    async function deleteRole(){
        const draft=readEditor();if(!draft.id)return;
        const role=roleById(draft.id)||draft;
        const assigned=Number(role.assigned_count||0);
        if(assigned>0){
            setStatus(`Jabatan ${role.name} masih digunakan oleh ${assigned} karyawan. Ganti jabatan karyawan tersebut terlebih dahulu sebelum menghapus.`,"error");
            showTab("assignments");
            return;
        }
        if(!window.confirm(`Hapus jabatan ${role.name}?\n\nJabatan akan dihapus dari daftar. Akun karyawan tidak ikut terhapus.`))return;
        setBusy(true);setStatus("Menghapus jabatan…");
        try{
            await api().deleteRole(role.id);
            state.selectedId=null;state.editing=blankRole();
            await reloadAll(true);
            setStatus("Jabatan berhasil dihapus.","ok");
        }catch(error){actionError("Jabatan belum dapat dihapus. Pastikan jabatan tidak sedang digunakan, lalu coba lagi.","deleteRole",error);}
        finally{setBusy(false);}
    }

    function roleAppliesToEmployee(role,employee){
        if(!role||!role.active||role.base_system_role!==employee.system_role)return false;
        if(!role.allowed_modes?.includes(employee.store_mode))return false;
        if(role.scope_all_stores)return true;
        return role.store_ids?.includes(employee.store_id);
    }

    function renderAssignments(){
        const tbody=$("jrAssignmentRows");
        if(!state.assignments.length){tbody.innerHTML='<tr><td colspan="8" class="jr-empty">Belum ada karyawan yang dapat ditampilkan.</td></tr>';return;}
        tbody.innerHTML=state.assignments.map(emp=>{
            if(emp.is_primary_owner)return `<tr><td><strong>${esc(emp.display_name)}</strong><br><small>${esc(emp.username)}</small></td><td>${esc(emp.store_name)}</td><td>${esc(ROLE_LABELS[emp.system_role]||emp.system_role)}</td><td><span class="jr-pill green">Pemilik Utama</span></td><td>Akses penuh</td><td>—</td><td><span class="jr-pill">Tetap</span></td></tr>`;
            const options=state.roles.filter(role=>roleAppliesToEmployee(role,emp));
            const current=emp.job_role_id||"";
            const invalid=current&&!options.some(role=>role.id===current);
            const jobStatus=!current
                ? '<span class="jr-pill">Akses standar</span>'
                : emp.job_role_active===false
                    ? '<span class="jr-pill warn">Jabatan Nonaktif</span>'
                    : emp.scope_valid===false||invalid
                        ? '<span class="jr-pill warn">Perlu disesuaikan</span>'
                        : '<span class="jr-pill green">Jabatan Aktif</span>';
            return `<tr><td><strong>${esc(emp.display_name)}</strong><br><small>${esc(emp.employee_id||emp.username)}</small></td><td>${esc(emp.store_name)}<br><small>${esc(MODE_LABELS[emp.store_mode]||emp.store_mode)}</small></td><td>${esc(ROLE_LABELS[emp.system_role]||emp.system_role)}</td><td>${emp.job_role_name?`<strong>${esc(emp.job_role_name)}</strong>`:'<span class="jr-pill">Akses standar</span>'}</td><td>${jobStatus}</td><td>${emp.active?'<span class="jr-pill green">Aktif</span>':'<span class="jr-pill warn">Nonaktif</span>'}</td><td><select data-assignment-select="${esc(emp.user_id)}"><option value="">Akses standar</option>${options.map(role=>`<option value="${esc(role.id)}" ${role.id===current?'selected':''}>${esc(role.name)}</option>`).join('')}</select></td><td><button class="jr-btn soft" type="button" data-save-assignment="${esc(emp.user_id)}">Terapkan</button></td></tr>`;
        }).join("");
        tbody.querySelectorAll("[data-save-assignment]").forEach(btn=>btn.addEventListener("click",()=>saveAssignment(btn.dataset.saveAssignment)));
    }

    async function saveAssignment(userId){
        const select=document.querySelector(`[data-assignment-select="${CSS.escape(userId)}"]`); if(!select)return;
        setBusy(true);setStatus("Menerapkan jabatan…");
        try{
            if(select.value)await api().assign(userId,select.value);else await api().unassign(userId);
            await reloadAll(false);renderAssignments();renderRoles();setStatus("Jabatan karyawan berhasil diperbarui.","ok");
        }catch(error){actionError("Jabatan karyawan belum dapat diperbarui. Coba lagi.","saveAssignment",error);}
        finally{setBusy(false);}
    }

    function auditText(item){
        const names={CREATE_ROLE:"Membuat jabatan",UPDATE_ROLE:"Mengubah jabatan",ACTIVATE_ROLE:"Mengaktifkan jabatan",DEACTIVATE_ROLE:"Menonaktifkan jabatan",DELETE_ROLE:"Menghapus jabatan",ASSIGN_ROLE:"Menetapkan jabatan",UNASSIGN_ROLE:"Melepas jabatan",UPDATE_LIMITS:"Mengubah batas tindakan"};
        return names[item.action]||"Perubahan jabatan";
    }
    function renderAudit(){
        const wrap=$("jrAuditList");
        wrap.innerHTML=state.audit.length?state.audit.map(item=>`<article class="jr-audit-item"><strong>${esc(auditText(item))}${item.role_name?` · ${esc(item.role_name)}`:''}</strong><p>${item.target_name?`Akun: ${esc(item.target_name)} · `:''}Oleh ${esc(item.actor_name||'Aplikasi')} · ${new Date(item.created_at).toLocaleString('id-ID')}</p></article>`).join(""):'<div class="jr-empty">Belum ada riwayat perubahan.</div>';
    }

    function updateSummary(){
        const activeRoles=state.roles.filter(role=>role.active!==false).length;
        const assignedUsers=state.assignments.filter(emp=>Boolean(emp.job_role_id)).length;
        const availableFeatures=state.catalog.filter(item=>item.active!==false&&!item.primary_owner_only).length;
        if($("jrSummaryRoles"))$("jrSummaryRoles").textContent=String(activeRoles);
        if($("jrSummaryUsers"))$("jrSummaryUsers").textContent=String(assignedUsers);
        if($("jrSummaryStores"))$("jrSummaryStores").textContent=String(state.stores.length);
        if($("jrSummaryFeatures"))$("jrSummaryFeatures").textContent=String(availableFeatures);
    }

    async function reloadAll(render=true){
        const [catalog,roles,stores,assignments,audit]=await Promise.all([api().catalog(),api().roles(),api().stores(),api().assignments(),api().audit(120)]);
        state.catalog=catalog;state.roles=roles;state.stores=stores;state.assignments=assignments;state.audit=audit;updateSummary();
        if(render){
            if(state.selectedId&&roleById(state.selectedId))state.editing=clone(roleById(state.selectedId));
            else if(!state.editing)state.editing=blankRole();
            renderRoles();renderEditor();renderAssignments();renderAudit();
        }
    }

    async function boot(){
        try{
            const primary=await window.LDMPrimaryOwner?.context?.(true);
            if(!primary?.is_primary_owner){const blocked=$("jrBlocked");$("jrBlockedText").textContent="Halaman Jabatan & Hak Akses hanya dapat dikelola oleh Pemilik Utama.";blocked.classList.add("show");blocked.setAttribute("aria-hidden","false");return;}
            state.context=await api().context(true,window.LDM_CLOUD_CONTEXT||null);
            await reloadAll(true);
            setStatus("Data siap digunakan.","ok");
        }catch(error){
            reportError("boot",error);
            const blocked=$("jrBlocked");
            $("jrBlockedText").textContent="Halaman belum dapat dibuka. Pastikan akun memiliki akses dan koneksi internet tersedia.";
            blocked.classList.add("show");
            blocked.setAttribute("aria-hidden","false");
        }
    }

    document.querySelectorAll(".jr-tab").forEach(btn=>btn.addEventListener("click",()=>showTab(btn.dataset.tab)));
    $("jrNewRole").addEventListener("click",newRole);
    $("jrSaveRole").addEventListener("click",saveRole);
    $("jrDuplicateRole").addEventListener("click",duplicateRole);
    $("jrToggleActive").addEventListener("click",toggleActive);
    $("jrDeleteRole").addEventListener("click",deleteRole);
    $("jrReload").addEventListener("click",async()=>{setBusy(true);try{await reloadAll(true);setStatus("Data berhasil diperbarui.","ok");}catch(error){actionError("Data belum dapat diperbarui. Periksa koneksi internet lalu coba lagi.","reload",error);}finally{setBusy(false);}});
    $("jrTemplate").addEventListener("change",event=>{if(event.target.value){applyTemplate(event.target.value);event.target.value="";}});
    $("jrBaseRole").addEventListener("change",event=>{state.editing.base_system_role=event.target.value;state.editing.permissions=defaultPermissions(event.target.value);state.editing.limits={"pos.discount.max_percent":100};renderSensitivePermissions();renderPermissions();renderLimitSettings();renderImpact();});
    $("jrAllStores").addEventListener("change",event=>{state.editing.scope_all_stores=event.target.checked;renderStores();});
    document.querySelectorAll("[data-mode]").forEach(input=>input.addEventListener("change",()=>{state.editing.allowed_modes=[...document.querySelectorAll('[data-mode]:checked')].map(x=>x.dataset.mode);}));
    $("jrPermissionSearch")?.addEventListener("input",event=>{state.permissionSearch=event.target.value;renderPermissions();});
    $("jrPermissionFilter")?.addEventListener("change",event=>{state.permissionFilter=event.target.value;renderPermissions();});
    $("jrDiscountLimit")?.addEventListener("input",event=>{const value=Number(event.target.value);if(!state.editing.limits)state.editing.limits={};state.editing.limits["pos.discount.max_percent"]=Number.isFinite(value)?Math.max(0,Math.min(100,value)):100;});
    $("jrName").addEventListener("input",event=>{state.editing.name=event.target.value;});
    $("jrDescription").addEventListener("input",event=>{state.editing.description=event.target.value;});
    document.addEventListener("keydown",event=>{if(event.key==="Escape")hideDropdown();});

    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
