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

    const state={catalog:[],roles:[],stores:[],assignments:[],audit:[],selectedId:null,editing:null,context:null};

    function api(){
        if(!window.LDMEmployeePermissions)throw new Error("Modul Jabatan & Hak Akses belum siap.");
        return window.LDMEmployeePermissions;
    }
    function setStatus(message,type=""){
        const node=$("jrStatus"); if(!node)return;
        node.textContent=message; node.className=`jr-status ${type}`.trim();
    }
    function setBusy(value){document.querySelectorAll("[data-jr-action]").forEach(btn=>btn.disabled=Boolean(value));}
    function roleById(id){return state.roles.find(role=>role.id===id)||null;}
    function clone(value){return JSON.parse(JSON.stringify(value));}
    function defaultPermissions(base){
        return state.catalog.filter(item=>item.active!==false&&!item.primary_owner_only&&item.allowed_system_roles?.includes(base)&&(item.mandatory||item.default_enabled_roles?.includes(base))).map(item=>item.code);
    }
    function blankRole(){return {id:null,name:"",description:"",base_system_role:"admin",scope_all_stores:true,allowed_modes:["retail","cafe","warung"],active:true,permissions:defaultPermissions("admin"),store_ids:[],assigned_count:0,assigned_store_count:0};}

    function showTab(name){
        document.querySelectorAll(".jr-tab").forEach(btn=>btn.classList.toggle("active",btn.dataset.tab===name));
        document.querySelectorAll(".jr-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===name));
    }

    function renderRoles(){
        const list=$("jrRoleList");
        if(!state.roles.length){list.innerHTML='<div class="jr-empty">Belum ada jabatan custom. Buat jabatan pertama untuk memulai.</div>';return;}
        list.innerHTML=state.roles.map(role=>`<button type="button" class="jr-role-card ${state.selectedId===role.id?'active':''} ${role.active?'':'inactive'}" data-role-id="${esc(role.id)}"><div class="jr-role-name"><span>${esc(role.name)}</span><span class="jr-pill ${role.active?'green':'warn'}">${role.active?'AKTIF':'NONAKTIF'}</span></div><div class="jr-role-meta">${esc(ROLE_LABELS[role.base_system_role]||role.base_system_role)} · ${Number(role.assigned_count||0)} akun · ${Number(role.assigned_store_count||0)} cabang<br>${role.scope_all_stores?'Semua cabang':`${(role.store_ids||[]).length} cabang dipilih`} · ${(role.allowed_modes||[]).map(m=>MODE_LABELS[m]||m).join(', ')}</div></button>`).join("");
        list.querySelectorAll("[data-role-id]").forEach(btn=>btn.addEventListener("click",()=>selectRole(btn.dataset.roleId)));
    }

    function editorDraft(){return state.editing||blankRole();}
    function permissionAllowedForBase(item,base){return Array.isArray(item.allowed_system_roles)&&item.allowed_system_roles.includes(base);}
    const SENSITIVE_CODES=["finance.revenue.view","finance.profit.view","hpp.view"];
    function hasPermission(code){return (state.editing?.permissions||[]).includes(code);}
    function setPermission(code,enabled){
        const set=new Set(state.editing?.permissions||[]);
        if(enabled)set.add(code);else set.delete(code);
        if(code==="finance.profit.view"&&enabled){
            set.add("finance.revenue.view");
            set.add("hpp.view");
        }
        if((code==="finance.revenue.view"||code==="hpp.view")&&!enabled){
            set.delete("finance.profit.view");
        }
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
            const hint=item.code==="finance.profit.view"
                ?"Jika diaktifkan, Pendapatan/Omzet dan HPP otomatis ikut aktif karena Profit membutuhkan keduanya."
                :item.code==="hpp.view"
                    ?"Menampilkan harga beli/HPP dan modal barang. Data ini tetap dimask dari server jika sakelar mati."
                    :"Menampilkan nilai omzet, penjualan bersih, pembayaran, dan nominal transaksi pada Dashboard/Laporan.";
            return `<label class="jr-sensitive-card ${checked?'active':''} ${baseAllowed?'':'disabled'}">
                <span class="jr-sensitive-icon">${icon}</span>
                <span class="jr-sensitive-copy"><strong>${esc(item.label)}</strong><small>${esc(hint)}</small></span>
                <span class="jr-switch"><input type="checkbox" data-sensitive="${esc(item.code)}" ${checked?'checked':''} ${baseAllowed?'':'disabled'}><i></i></span>
            </label>`;
        }).join("");
        wrap.querySelectorAll("[data-sensitive]").forEach(input=>input.addEventListener("change",()=>{
            setPermission(input.dataset.sensitive,input.checked);
            renderSensitivePermissions(); renderPermissions(); renderImpact();
        }));
    }
    function renderPermissions(){
        const draft=editorDraft();
        const container=$("jrPermissionGroups");
        const generalCatalog=state.catalog.filter(item=>!SENSITIVE_CODES.includes(item.code));
        const groups=[...new Set(generalCatalog.map(item=>item.category))];
        container.innerHTML=groups.map(group=>{
            const items=generalCatalog.filter(item=>item.category===group);
            return `<section class="jr-permission-group"><h3>${esc(group)}</h3><div class="jr-permission-list">${items.map(item=>{
                const baseAllowed=permissionAllowedForBase(item,draft.base_system_role);
                const protectedItem=item.primary_owner_only===true;
                const mandatory=item.mandatory===true&&baseAllowed;
                const checked=protectedItem?false:(mandatory||((draft.permissions||[]).includes(item.code)&&baseAllowed));
                const disabled=protectedItem||mandatory||!baseAllowed;
                const cls=protectedItem?'protected':disabled?'locked':'';
                let badge='';
                if(protectedItem)badge='<span class="jr-pill warn">Owner Pusat</span>';
                else if(mandatory)badge='<span class="jr-pill green">Wajib</span>';
                else if(!baseAllowed)badge='<span class="jr-pill">Di luar role dasar</span>';
                return `<label class="jr-permission ${cls}"><input type="checkbox" data-permission="${esc(item.code)}" ${checked?'checked':''} ${disabled?'disabled':''}><span><strong>${esc(item.label)} ${badge}</strong><small>${esc(item.description)}</small></span></label>`;
            }).join("")}</div></section>`;
        }).join("");
        container.querySelectorAll("[data-permission]").forEach(input=>input.addEventListener("change",()=>{
            const code=input.dataset.permission;
            const set=new Set(state.editing.permissions||[]);
            if(input.checked)set.add(code);else set.delete(code);
            state.editing.permissions=[...set];
            renderImpact();
        }));
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
        const selected=(draft.permissions||[]).filter(code=>{
            const item=state.catalog.find(x=>x.code===code); return item&&!item.primary_owner_only&&permissionAllowedForBase(item,draft.base_system_role);
        }).length;
        const mandatory=state.catalog.filter(item=>item.mandatory&&permissionAllowedForBase(item,draft.base_system_role)&&!item.primary_owner_only).length;
        $("jrImpactPermissions").textContent=String(new Set([...(draft.permissions||[]),...state.catalog.filter(i=>i.mandatory&&permissionAllowedForBase(i,draft.base_system_role)).map(i=>i.code)]).size);
        $("jrPermissionCountText").textContent=`${selected} pilihan + ${mandatory} hak wajib`;
    }

    function renderEditor(){
        const draft=editorDraft();
        $("jrEditorTitle").textContent=draft.id?`Edit ${draft.name}`:"Buat Jabatan Baru";
        $("jrEditorHint").textContent=draft.id?"Perubahan otomatis berlaku pada semua akun yang memakai jabatan ini.":"Mulai dari template atau atur sendiri dengan pilihan yang sederhana.";
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
        $("jrToggleActive").className=`jr-btn ${draft.active?'red':'green'}`;
        renderStores();renderSensitivePermissions();renderPermissions();renderImpact();
    }

    function selectRole(id){
        const role=roleById(id); if(!role)return;
        state.selectedId=id; state.editing=clone(role); renderRoles(); renderEditor();
    }
    function newRole(){state.selectedId=null;state.editing=blankRole();renderRoles();renderEditor();$("jrName").focus();}

    function applyTemplate(key){
        const t=TEMPLATES[key]; if(!t)return;
        const draft=blankRole();
        draft.name=t.label;draft.base_system_role=t.base;draft.allowed_modes=[...t.modes];draft.permissions=[...t.permissions];
        state.selectedId=null;state.editing=draft;renderRoles();renderEditor();setStatus(`Template ${t.label} diterapkan. Sesuaikan bila diperlukan.`);
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
        if(draft.scope_all_stores)draft.store_ids=[];
        state.editing=draft;
        return draft;
    }

    async function saveRole(){
        const draft=readEditor();
        if(draft.name.length<2){setStatus("Nama jabatan minimal 2 karakter.","error");return;}
        if(!draft.allowed_modes.length){setStatus("Pilih minimal satu mode operasional.","error");return;}
        if(!draft.scope_all_stores&&!draft.store_ids.length){setStatus("Pilih minimal satu cabang atau gunakan Semua Cabang.","error");return;}
        setBusy(true);setStatus("Menyimpan jabatan…");
        try{
            const result=await api().saveRole({id:draft.id||null,name:draft.name,description:draft.description||null,base_system_role:draft.base_system_role,scope_all_stores:draft.scope_all_stores,allowed_modes:draft.allowed_modes,store_ids:draft.store_ids,permissions:draft.permissions,active:draft.active!==false});
            await reloadAll(false);
            state.selectedId=result?.role_id||state.selectedId;
            const saved=roleById(state.selectedId);state.editing=saved?clone(saved):blankRole();
            renderRoles();renderEditor();setStatus("Jabatan berhasil disimpan. Semua akun yang memakai jabatan ini langsung mengikuti konfigurasi terbaru.","ok");
        }catch(error){setStatus(`Gagal menyimpan jabatan: ${error.message||error}`,"error");}
        finally{setBusy(false);}
    }

    async function toggleActive(){
        const draft=readEditor();if(!draft.id)return;
        const next=!draft.active;
        const label=next?"mengaktifkan":"menonaktifkan";
        if(!next&&!confirm(`Nonaktifkan ${draft.name}? Akun yang masih memakai jabatan ini hanya mempertahankan hak wajib sampai jabatan diaktifkan atau diganti.`))return;
        setBusy(true);setStatus(`Sedang ${label} jabatan…`);
        try{await api().setActive(draft.id,next);await reloadAll(false);selectRole(draft.id);setStatus(`Jabatan berhasil ${next?'diaktifkan':'dinonaktifkan'}.`,"ok");}
        catch(error){setStatus(`Gagal ${label} jabatan: ${error.message||error}`,"error");}
        finally{setBusy(false);}
    }

    function duplicateRole(){
        const draft=readEditor();if(!draft.id)return;
        const copy=clone(draft);copy.id=null;copy.name=`${copy.name} - Salinan`;copy.assigned_count=0;copy.assigned_store_count=0;copy.active=true;
        state.selectedId=null;state.editing=copy;renderRoles();renderEditor();setStatus("Salinan jabatan dibuat sebagai draft. Simpan setelah nama dan hak akses sesuai.");
    }

    async function deleteRole(){
        const draft=readEditor();if(!draft.id)return;
        const role=roleById(draft.id)||draft;
        const assigned=Number(role.assigned_count||0);
        if(assigned>0){
            setStatus(`Jabatan ${role.name} masih dipakai ${assigned} akun. Lepaskan atau ganti jabatan akun tersebut terlebih dahulu sebelum menghapus.`,"error");
            showTab("assignments");
            return;
        }
        if(!window.confirm(`Hapus jabatan ${role.name}?\n\nJabatan akan dihapus dari daftar aktif dan dicatat ke riwayat audit. Tindakan ini tidak menghapus akun karyawan.`))return;
        setBusy(true);setStatus("Menghapus jabatan…");
        try{
            await api().deleteRole(role.id);
            state.selectedId=null;state.editing=blankRole();
            await reloadAll(true);
            setStatus("Jabatan berhasil dihapus. Akun karyawan dan histori audit tetap aman.","ok");
        }catch(error){setStatus(`Gagal menghapus jabatan: ${error.message||error}`,"error");}
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
        if(!state.assignments.length){tbody.innerHTML='<tr><td colspan="7" class="jr-empty">Belum ada akun pada jaringan.</td></tr>';return;}
        tbody.innerHTML=state.assignments.map(emp=>{
            if(emp.is_primary_owner)return `<tr><td><strong>${esc(emp.display_name)}</strong><br><small>${esc(emp.username)}</small></td><td>${esc(emp.store_name)}</td><td>${esc(ROLE_LABELS[emp.system_role]||emp.system_role)}</td><td><span class="jr-pill green">Owner Pusat</span></td><td>Semua hak pusat</td><td>—</td><td><span class="jr-pill">Dikunci</span></td></tr>`;
            const options=state.roles.filter(role=>roleAppliesToEmployee(role,emp));
            const current=emp.job_role_id||"";
            const invalid=current&&!options.some(role=>role.id===current);
            return `<tr><td><strong>${esc(emp.display_name)}</strong><br><small>${esc(emp.employee_id||emp.username)}</small></td><td>${esc(emp.store_name)}<br><small>${esc(MODE_LABELS[emp.store_mode]||emp.store_mode)}</small></td><td>${esc(ROLE_LABELS[emp.system_role]||emp.system_role)}</td><td>${emp.job_role_name?`<strong>${esc(emp.job_role_name)}</strong>${invalid?'<br><span class="jr-pill warn">Scope tidak cocok</span>':''}`:'<span class="jr-pill">Default role sistem</span>'}</td><td>${emp.active?'<span class="jr-pill green">Aktif</span>':'<span class="jr-pill warn">Nonaktif</span>'}</td><td><select data-assignment-select="${esc(emp.user_id)}"><option value="">Default role sistem</option>${options.map(role=>`<option value="${esc(role.id)}" ${role.id===current?'selected':''}>${esc(role.name)}</option>`).join('')}</select></td><td><button class="jr-btn soft" type="button" data-save-assignment="${esc(emp.user_id)}">Terapkan</button></td></tr>`;
        }).join("");
        tbody.querySelectorAll("[data-save-assignment]").forEach(btn=>btn.addEventListener("click",()=>saveAssignment(btn.dataset.saveAssignment)));
    }

    async function saveAssignment(userId){
        const select=document.querySelector(`[data-assignment-select="${CSS.escape(userId)}"]`); if(!select)return;
        setBusy(true);setStatus("Menerapkan jabatan ke akun…");
        try{
            if(select.value)await api().assign(userId,select.value);else await api().unassign(userId);
            await reloadAll(false);renderAssignments();renderRoles();setStatus("Jabatan akun berhasil diperbarui.","ok");
        }catch(error){setStatus(`Gagal menetapkan jabatan: ${error.message||error}`,"error");}
        finally{setBusy(false);}
    }

    function auditText(item){
        const names={CREATE_ROLE:"Membuat jabatan",UPDATE_ROLE:"Mengubah jabatan",ACTIVATE_ROLE:"Mengaktifkan jabatan",DEACTIVATE_ROLE:"Menonaktifkan jabatan",DELETE_ROLE:"Menghapus jabatan",ASSIGN_ROLE:"Menetapkan jabatan",UNASSIGN_ROLE:"Melepas jabatan"};
        return names[item.action]||item.action;
    }
    function renderAudit(){
        const wrap=$("jrAuditList");
        wrap.innerHTML=state.audit.length?state.audit.map(item=>`<article class="jr-audit-item"><strong>${esc(auditText(item))}${item.role_name?` · ${esc(item.role_name)}`:''}</strong><p>${item.target_name?`Akun: ${esc(item.target_name)} · `:''}Oleh ${esc(item.actor_name||'Sistem')} · ${new Date(item.created_at).toLocaleString('id-ID')}</p></article>`).join(""):'<div class="jr-empty">Belum ada riwayat perubahan.</div>';
    }

    async function reloadAll(render=true){
        const [catalog,roles,stores,assignments,audit]=await Promise.all([api().catalog(),api().roles(),api().stores(),api().assignments(),api().audit(120)]);
        state.catalog=catalog;state.roles=roles;state.stores=stores;state.assignments=assignments;state.audit=audit;
        if(render){
            if(state.selectedId&&roleById(state.selectedId))state.editing=clone(roleById(state.selectedId));
            else if(!state.editing)state.editing=blankRole();
            renderRoles();renderEditor();renderAssignments();renderAudit();
        }
    }

    async function boot(){
        try{
            const primary=await window.LDMPrimaryOwner?.context?.(true);
            if(!primary?.is_primary_owner){$("jrBlocked").classList.add("show");return;}
            state.context=await api().context(true,window.LDM_CLOUD_CONTEXT||null);
            await reloadAll(true);
            setStatus("Siap. Perubahan jabatan akan diwariskan otomatis ke akun yang menggunakannya.","ok");
        }catch(error){
            const blocked=$("jrBlocked");$("jrBlockedText").textContent=error.message||String(error);blocked.classList.add("show");
        }
    }

    document.querySelectorAll(".jr-tab").forEach(btn=>btn.addEventListener("click",()=>showTab(btn.dataset.tab)));
    $("jrNewRole").addEventListener("click",newRole);
    $("jrSaveRole").addEventListener("click",saveRole);
    $("jrDuplicateRole").addEventListener("click",duplicateRole);
    $("jrToggleActive").addEventListener("click",toggleActive);
    $("jrDeleteRole").addEventListener("click",deleteRole);
    $("jrReload").addEventListener("click",async()=>{setBusy(true);try{await reloadAll(true);setStatus("Data berhasil diperbarui.","ok");}catch(error){setStatus(error.message||String(error),"error");}finally{setBusy(false);}});
    $("jrTemplate").addEventListener("change",event=>{if(event.target.value){applyTemplate(event.target.value);event.target.value="";}});
    $("jrBaseRole").addEventListener("change",event=>{state.editing.base_system_role=event.target.value;state.editing.permissions=defaultPermissions(event.target.value);renderSensitivePermissions();renderPermissions();renderImpact();});
    $("jrAllStores").addEventListener("change",event=>{state.editing.scope_all_stores=event.target.checked;renderStores();});
    document.querySelectorAll("[data-mode]").forEach(input=>input.addEventListener("change",()=>{state.editing.allowed_modes=[...document.querySelectorAll('[data-mode]:checked')].map(x=>x.dataset.mode);}));
    $("jrName").addEventListener("input",event=>{state.editing.name=event.target.value;});
    $("jrDescription").addEventListener("input",event=>{state.editing.description=event.target.value;});

    if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
