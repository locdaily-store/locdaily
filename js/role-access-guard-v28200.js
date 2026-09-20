(function(){
    "use strict";
    if(window.LDM_PUBLIC_GUIDE_MODE===true)return;

    const VERSION="28.20.0-final";
    const ALL=Object.freeze(["owner","admin","kasir"]);
    const POLICY=Object.freeze({
        "dashboard.html":Object.freeze({roles:ALL,permission:"dashboard.view"}),
        "absensi.html":Object.freeze({roles:ALL,permission:"attendance.use"}),
        "master-shift.html":Object.freeze({roles:Object.freeze(["owner"]),permission:"master_shift.manage"}),
        "ketidakhadiran.html":Object.freeze({roles:ALL,permission:"absence.view"}),
        "kasir.html":Object.freeze({roles:ALL,permission:"pos.use"}),
        "barang.html":Object.freeze({roles:ALL,permission:"inventory.view"}),
        "kartu-stok.html":Object.freeze({roles:ALL,permission:"stock_card.view"}),
        "stock-opname.html":Object.freeze({roles:ALL,permission:"stock_opname.use"}),
        "multi-store.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"multi_store.use"}),
        "supplier.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"suppliers.use"}),
        "purchase-order.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"purchase_order.use"}),
        "goods.receipt.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"goods_receipt.use"}),
        "retur.html":Object.freeze({roles:ALL,permission:"returns.use"}),
        "laporan.html":Object.freeze({roles:ALL,permission:"reports.view"}),
        "owner-control-center.html":Object.freeze({roles:Object.freeze(["owner"]),primaryOwnerOnly:true,permission:"central_control.view"}),
        "jabatan-hak-akses.html":Object.freeze({roles:Object.freeze(["owner"]),primaryOwnerOnly:true,permission:"job_roles.manage"}),
        "pengeluaran.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"expenses.manage"}),
        "shift-closing.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"shift_closing.use"}),
        "eod.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"eod.use"}),
        "backup & restore.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"backup_restore.use"}),
        "account-management.html":Object.freeze({roles:Object.freeze(["owner"]),permission:"accounts.manage"}),
        "device-management.html":Object.freeze({roles:Object.freeze(["owner"]),permission:"devices.manage"}),
        "pwa-settings.html":Object.freeze({roles:ALL,permission:"app_update.use"}),
        "penyimpanan.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"storage.manage"}),
        "recovery-center.html":Object.freeze({roles:ALL,permission:"recovery.use"}),
        "qa-security-performance.html":Object.freeze({roles:Object.freeze(["owner"]),permission:"qa_security.view"}),
        "pages-health-check.html":Object.freeze({roles:Object.freeze(["owner"]),permission:"qa_security.view"}),
        "setup-awal.html":Object.freeze({roles:Object.freeze(["owner"])}),
        "support-center.html":Object.freeze({roles:ALL,permission:"support.use"}),
        "privacy-center.html":Object.freeze({roles:ALL,permission:"privacy.view"}),
        "panduan.html":Object.freeze({roles:ALL,permission:"support.use"}),
        "cloud-control-center.html":Object.freeze({roles:Object.freeze(["owner","admin"]),permission:"recovery.use"}),
        "device-access.html":Object.freeze({roles:ALL,permission:"privacy.view"})
    });

    function normalizePage(value){
        let page=String(value||"").split("#")[0].split("?")[0];
        try{page=decodeURIComponent(page)}catch(error){}
        return page.split("/").pop().trim().toLowerCase();
    }
    function currentPage(){return normalizePage(location.pathname)||"dashboard.html";}
    function normalizeRole(value){
        const role=String(value||"").trim().toLowerCase();
        if(role==="administrator")return "admin";
        if(role==="cashier")return "kasir";
        return role;
    }
    function policyFor(page=currentPage()){return POLICY[normalizePage(page)]||null;}
    function canAccessPage(page,role){
        const policy=policyFor(page);
        if(!policy)return false;
        return policy.roles.includes(normalizeRole(role));
    }
    function addPendingStyle(){
        if(document.getElementById("ldmRoleAccessPendingStyle"))return;
        const style=document.createElement("style");
        style.id="ldmRoleAccessPendingStyle";
        style.textContent="html.ldm-role-access-pending body{visibility:hidden!important;}";
        document.head.appendChild(style);
    }
    function setPending(){
        document.documentElement.classList.add("ldm-role-access-pending");
        addPendingStyle();
    }
    function clearPending(){document.documentElement.classList.remove("ldm-role-access-pending");}
    function compatibilityRole(role){
        window.LDM_VERIFIED_ROLE=role;
        document.documentElement.dataset.ldmVerifiedRole=role;
        document.documentElement.dataset.ldmRole=role;
        try{
            localStorage.setItem("userRole",role);
            localStorage.setItem("role",role);
        }catch(error){}
    }
    function accessLabel(page){
        const labels={
            "master-shift.html":"Master Shift",
            "multi-store.html":"Multi-Toko & Transfer",
            "supplier.html":"Supplier",
            "purchase-order.html":"Purchase Order",
            "goods.receipt.html":"Goods Receipt",
            "owner-control-center.html":"Kontrol Pusat",
            "jabatan-hak-akses.html":"Jabatan & Hak Akses",
            "pengeluaran.html":"Pengeluaran",
            "shift-closing.html":"Closing Shift",
            "eod.html":"End of Day",
            "backup & restore.html":"Backup & Restore",
            "account-management.html":"Management Akun",
            "device-management.html":"Perangkat Toko",
            "penyimpanan.html":"Penyimpanan & Retensi",
            "qa-security-performance.html":"Pemeriksaan Sistem & Keamanan",
            "pages-health-check.html":"Pemeriksaan Ketersediaan Aplikasi",
            "setup-awal.html":"Setup Awal",
            "cloud-control-center.html":"Kontrol Cloud"
        };
        return labels[page]||"halaman tersebut";
    }
    function storeNotice(message){
        try{sessionStorage.setItem("ldmRoleAccessNotice",String(message||"Akses halaman dibatasi untuk akun ini."));}catch(error){}
    }
    function redirectDenied(message){
        if(window.__LDM_ROLE_ACCESS_REDIRECTING)return;
        window.__LDM_ROLE_ACCESS_REDIRECTING=true;
        storeNotice(message);
        clearPending();
        const page=currentPage();
        if(page==="dashboard.html")return;
        location.replace("dashboard.html?accessDenied=1");
    }
    function showStoredNotice(){
        let message="";
        try{
            message=sessionStorage.getItem("ldmRoleAccessNotice")||"";
            sessionStorage.removeItem("ldmRoleAccessNotice");
        }catch(error){}
        if(!message)return;
        const render=()=>{
            if(document.getElementById("ldmRoleAccessNotice"))return;
            const node=document.createElement("div");
            node.id="ldmRoleAccessNotice";
            node.setAttribute("role","status");
            node.style.cssText="position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:min(420px,calc(100vw - 32px));padding:12px 14px;border-radius:12px;background:#0d2240;color:#fff;box-shadow:0 12px 30px rgba(15,23,42,.25);font:600 13px/1.5 Arial,sans-serif";
            node.textContent=message;
            document.body.appendChild(node);
            window.setTimeout(()=>node.remove(),5200);
        };
        if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",render,{once:true});
        else render();
    }
    async function waitForPrimaryOwnerApi(){
        if(window.LDMPrimaryOwner?.context)return window.LDMPrimaryOwner;
        for(let i=0;i<30;i+=1){
            await new Promise(resolve=>setTimeout(resolve,100));
            if(window.LDMPrimaryOwner?.context)return window.LDMPrimaryOwner;
        }
        return null;
    }
    async function verifyPrimaryOwner(){
        try{
            const api=await waitForPrimaryOwnerApi();
            if(!api)return false;
            const context=await api.context(true);
            return context?.is_primary_owner===true;
        }catch(error){
            console.warn("Role Access Guard: verifikasi Owner Pusat gagal.",error);
            return false;
        }
    }

    function refreshRoleSensitiveUi(){
        const calls=[
            "terapkanPermissionUI",
            "renderRiwayatPO",
            "renderRiwayatGoodsReceipt",
            "renderApprovedPurchaseOrderInbox"
        ];
        for(const name of calls){
            try{
                if(typeof window[name]==="function") window[name]();
            }catch(error){
                console.warn(`Role Access Guard: refresh ${name} gagal.`,error);
            }
        }
    }
    async function authorize(context){
        const page=currentPage();
        const policy=policyFor(page);
        if(!policy){
            clearPending();
            return true;
        }
        const role=normalizeRole(context?.profile?.role||context?.role||context?.user?.role);
        if(!ALL.includes(role)){
            redirectDenied("Sesi akun tidak memiliki hak akses yang valid.");
            return false;
        }
        compatibilityRole(role);
        if(!policy.roles.includes(role)){
            redirectDenied(`Hak akses akun ini tidak mengizinkan membuka ${accessLabel(page)}.`);
            return false;
        }
        if(policy.primaryOwnerOnly){
            const primary=await verifyPrimaryOwner();
            if(!primary){
                redirectDenied(`${accessLabel(page)} hanya tersedia untuk Owner Pusat.`);
                return false;
            }
        }
        let permissionContext=null;
        if(policy.permission){
            if(!window.LDMEmployeePermissions||typeof window.LDMEmployeePermissions.context!=="function"){
                redirectDenied("Modul Jabatan & Hak Akses belum siap. Muat ulang aplikasi.");
                return false;
            }
            try{
                permissionContext=await window.LDMEmployeePermissions.context(false,context||window.LDM_CLOUD_CONTEXT||null);
            }catch(error){
                console.warn("Role Access Guard: verifikasi jabatan gagal.",error);
                redirectDenied("Hak akses jabatan belum dapat diverifikasi. Muat ulang aplikasi lalu coba kembali.");
                return false;
            }
            if(!Array.isArray(permissionContext?.permissions)||!permissionContext.permissions.includes(policy.permission)){
                const jobName=permissionContext?.job_role_name||"jabatan akun ini";
                redirectDenied(`${jobName} tidak memiliki hak akses untuk membuka ${accessLabel(page)}.`);
                return false;
            }
        }
        window.LDM_CLOUD_CONTEXT=context||window.LDM_CLOUD_CONTEXT||null;
        window.LDM_EMPLOYEE_PERMISSION_CONTEXT=permissionContext||window.LDM_EMPLOYEE_PERMISSION_CONTEXT||null;
        window.dispatchEvent(new CustomEvent("ldm-role-access-ready",{detail:{version:VERSION,page,role,permission:policy.permission||null,jobRoleName:permissionContext?.job_role_name||null,primaryOwnerOnly:Boolean(policy.primaryOwnerOnly),context:window.LDM_CLOUD_CONTEXT,permissionContext}}));
        refreshRoleSensitiveUi();
        clearPending();
        if(page==="dashboard.html")showStoredNotice();
        return true;
    }

    const page=currentPage();
    if(POLICY[page])setPending();

    let resolved=false;
    function handle(context){
        if(resolved)return;
        resolved=true;
        authorize(context).catch(error=>{
            console.error("Role Access Guard:",error);
            redirectDenied("Hak akses halaman tidak dapat diverifikasi. Silakan kembali ke Dashboard.");
        });
    }
    window.addEventListener("ldm-cloud-auth-ready",event=>handle(event?.detail||null),{once:true});
    if(window.LDM_CLOUD_CONTEXT)queueMicrotask(()=>handle(window.LDM_CLOUD_CONTEXT));

    window.LDMRoleAccess=Object.freeze({
        version:VERSION,
        policy:POLICY,
        normalizePage,
        currentPage,
        policyFor,
        rolesForPage:pageName=>(policyFor(pageName)?.roles||[]).slice(),
        permissionForPage:pageName=>policyFor(pageName)?.permission||null,
        canAccessPage:(pageName,role)=>canAccessPage(pageName,role),
        verifiedRole:()=>normalizeRole(window.LDM_VERIFIED_ROLE||"")
    });
})();
