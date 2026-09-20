(function(){
    "use strict";

    const VERSION="28.19.1-final";
    const CACHE_KEY="ldmEmployeePermissionContextV28190";
    const CACHE_TTL=5*60*1000;
    let contextCache=null;
    let contextPromise=null;

    function client(){
        if(!window.LDMSupabase||typeof window.LDMSupabase.createClient!=="function"){
            throw new Error("Layanan hak akses belum siap. Muat ulang aplikasi.");
        }
        return window.LDMSupabase.createClient();
    }

    function normalizeRole(value){
        const role=String(value||"").trim().toLowerCase();
        if(role==="administrator")return "admin";
        if(role==="cashier")return "kasir";
        return role;
    }

    function readCache(){
        try{
            const parsed=JSON.parse(sessionStorage.getItem(CACHE_KEY)||"null");
            if(!parsed||!parsed.saved_at||Date.now()-parsed.saved_at>CACHE_TTL)return null;
            if(!Array.isArray(parsed.permissions))return null;
            return parsed;
        }catch(_error){return null;}
    }

    function writeCache(data){
        const next={...(data||{}),permissions:Array.isArray(data?.permissions)?data.permissions:[],saved_at:Date.now()};
        contextCache=next;
        try{sessionStorage.setItem(CACHE_KEY,JSON.stringify(next));}catch(_error){}
        return next;
    }

    function clearCache(){
        contextCache=null;
        contextPromise=null;
        try{sessionStorage.removeItem(CACHE_KEY);}catch(_error){}
    }

    async function rpc(name,params){
        const query=params===undefined?client().rpc(name):client().rpc(name,params);
        const {data,error}=await query;
        if(error)throw error;
        return data;
    }

    async function context(force=false,cloudContext=null){
        if(!force){
            if(contextCache)return contextCache;
            const stored=readCache();
            if(stored){contextCache=stored;return stored;}
            if(contextPromise)return contextPromise;
        }
        contextPromise=(async()=>{
            if(!cloudContext&&window.LDMCloudSession?.ensureAuthenticated){
                await window.LDMCloudSession.ensureAuthenticated({registerDevice:false});
            }
            const data=await rpc("ldm_employee_permission_context_v28190");
            const normalized={
                ...(data||{}),
                system_role:normalizeRole(data?.system_role),
                permissions:Array.isArray(data?.permissions)?data.permissions.map(String):[],
                is_primary_owner:data?.is_primary_owner===true,
                scope_valid:data?.scope_valid!==false,
                job_role_active:data?.job_role_active!==false
            };
            const saved=writeCache(normalized);
            window.LDM_EMPLOYEE_PERMISSION_CONTEXT=saved;
            document.documentElement.dataset.ldmJobRole=saved.job_role_name||"";
            window.dispatchEvent(new CustomEvent("ldm-employee-permissions-ready",{detail:saved}));
            return saved;
        })();
        try{return await contextPromise;}finally{contextPromise=null;}
    }

    function current(){return contextCache||readCache()||window.LDM_EMPLOYEE_PERMISSION_CONTEXT||null;}

    function can(permissionCode){
        const code=String(permissionCode||"").trim().toLowerCase();
        if(!code)return true;
        const ctx=current();
        if(!ctx)return true; // Guard halaman melakukan verifikasi async sebelum membuka halaman.
        return Array.isArray(ctx.permissions)&&ctx.permissions.includes(code);
    }

    async function requirePermission(permissionCode,cloudContext=null){
        const ctx=await context(false,cloudContext);
        if(!Array.isArray(ctx.permissions)||!ctx.permissions.includes(String(permissionCode||"").trim().toLowerCase())){
            const error=new Error("Jabatan akun ini tidak memiliki hak akses untuk fitur tersebut.");
            error.code="JOB_PERMISSION_DENIED";
            throw error;
        }
        return ctx;
    }

    async function catalog(){const data=await rpc("ldm_job_permission_catalog_v28190");return Array.isArray(data)?data:[];}
    async function roles(){const data=await rpc("ldm_job_roles_manage_list_v28190");return Array.isArray(data)?data:[];}
    async function stores(){const data=await rpc("ldm_job_role_stores_v28190");return Array.isArray(data)?data:[];}
    async function assignments(){const data=await rpc("ldm_job_role_assignments_manage_v28190");return Array.isArray(data)?data:[];}
    async function audit(limit=100){const data=await rpc("ldm_job_role_audit_v28190",{p_limit:Math.max(1,Math.min(Number(limit)||100,500))});return Array.isArray(data)?data:[];}

    async function saveRole(payload){
        const data=await rpc("ldm_job_role_save_v28190",{p_payload:payload||{}});
        clearCache();
        window.dispatchEvent(new CustomEvent("ldm-job-roles-updated",{detail:data||{}}));
        return data;
    }

    async function setActive(roleId,active){
        const data=await rpc("ldm_job_role_set_active_v28190",{p_role_id:roleId,p_active:Boolean(active)});
        clearCache();
        window.dispatchEvent(new CustomEvent("ldm-job-roles-updated",{detail:data||{}}));
        return data;
    }

    async function deleteRole(roleId){
        const data=await rpc("ldm_job_role_delete_v28191",{p_role_id:String(roleId||"")});
        clearCache();
        window.dispatchEvent(new CustomEvent("ldm-job-roles-updated",{detail:data||{}}));
        return data;
    }

    async function assign(userId,roleId){
        const data=await rpc("ldm_job_role_assign_v28190",{p_user_id:userId,p_role_id:roleId});
        clearCache();
        window.dispatchEvent(new CustomEvent("ldm-job-role-assignment-updated",{detail:data||{}}));
        return data;
    }

    async function unassign(userId){
        const data=await rpc("ldm_job_role_unassign_v28190",{p_user_id:userId});
        clearCache();
        window.dispatchEvent(new CustomEvent("ldm-job-role-assignment-updated",{detail:data||{}}));
        return data;
    }

    window.addEventListener("ldm-cloud-session-ready",()=>clearCache());
    window.addEventListener("ldm-cloud-accounts-updated",()=>clearCache());

    window.LDMEmployeePermissions=Object.freeze({
        version:VERSION,
        context,current,can,requirePermission,clearCache,
        catalog,roles,stores,assignments,audit,saveRole,setActive,deleteRole,assign,unassign
    });
})();
