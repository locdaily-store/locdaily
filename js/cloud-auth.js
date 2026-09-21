(function(){
    "use strict";

    const VERSION="28.21.1";
    const DEVICE_KEY="ldmCloudDeviceId";
    const FAST_CONTEXT_KEY="ldmFastCloudContextV28163";
    const FAST_DEVICE_ACCESS_KEY="ldmFastDeviceAccessV28163";
    const FAST_DEVICE_REGISTER_KEY="ldmFastDeviceRegisterV28163";

    // Cache ini hanya hidup di tab yang sama. Data backend tetap dilindungi RLS/RPC.
    const CONTEXT_TTL_MS=12000;
    const DEVICE_ACCESS_TTL_MS=10000;
    const DEVICE_REGISTER_TTL_MS=120000;
    const NAV_HANDOFF_MAX_SOURCE_AGE_MS=60000;

    function getClient(){
        if(!window.LDMSupabase || typeof window.LDMSupabase.createClient!=="function"){
            throw new Error("Layanan login Cloud belum siap.");
        }
        return window.LDMSupabase.createClient();
    }

    function now(){ return Date.now(); }

    function safeSessionRead(key){
        try{
            const raw=sessionStorage.getItem(key);
            return raw ? JSON.parse(raw) : null;
        }catch(error){
            return null;
        }
    }

    function safeSessionWrite(key,value){
        try{
            sessionStorage.setItem(key,JSON.stringify(value));
            return true;
        }catch(error){
            return false;
        }
    }

    function safeSessionRemove(key){
        try{ sessionStorage.removeItem(key); }catch(error){}
    }

    function invalidateFastCache(){
        [FAST_CONTEXT_KEY,FAST_DEVICE_ACCESS_KEY,FAST_DEVICE_REGISTER_KEY]
            .forEach(safeSessionRemove);
    }

    function getOrCreateDeviceId(){
        let id=localStorage.getItem(DEVICE_KEY);
        if(id) return id;

        if(window.crypto && typeof window.crypto.randomUUID==="function"){
            id=window.crypto.randomUUID();
        }else{
            const bytes=new Uint8Array(16);
            window.crypto.getRandomValues(bytes);
            id=Array.from(bytes).map(value=>value.toString(16).padStart(2,"0")).join("");
        }

        localStorage.setItem(DEVICE_KEY,id);
        return id;
    }

    function getDeviceName(){
        const platform=navigator.userAgentData?.platform || navigator.platform || "Browser";
        return `LocDaily - ${platform}`;
    }

    function getPlatformInfo(){
        return (navigator.userAgent || navigator.platform || "Unknown").slice(0,500);
    }

    function cachedIdentityMatches(record,userId){
        if(!record || String(record.userId||"")!==String(userId||"")) return false;

        const localUser=String(localStorage.getItem("ldmCloudUserId")||"");
        const localStore=String(localStorage.getItem("ldmCloudStoreId")||"");
        const localDevice=String(localStorage.getItem(DEVICE_KEY)||"");

        if(localUser && localUser!==String(record.userId||"")) return false;
        if(localStore && record.storeId && localStore!==String(record.storeId||"")) return false;
        if(localDevice && record.deviceId && localDevice!==String(record.deviceId||"")) return false;
        return true;
    }

    async function getLocalSessionUser(client=getClient()){
        const {data,error}=await client.auth.getSession();
        if(error) throw error;
        return data?.session?.user || null;
    }

    async function invokeLoginResolver(body){
        const client=getClient();
        const {data,error}=await client.functions.invoke("ldm-login-resolver",{body});
        if(error){
            let message=String(data?.error||"").trim();
            try{
                const response=error?.context;
                if(!message && response && typeof response.clone==="function"){
                    const payload=await response.clone().json();
                    message=String(payload?.error||"").trim();
                }
            }catch(_error){}
            throw new Error(message || "Login belum dapat diproses. Coba kembali.");
        }
        if(data?.error) throw new Error(String(data.error));
        return data||{};
    }

    async function signIn(identifier,password,storeCode=""){
        const normalizedIdentifier=String(identifier||"").trim();
        if(!normalizedIdentifier) throw new Error("Email atau NIK Karyawan wajib diisi.");
        if(!password) throw new Error("Password wajib diisi.");

        const isEmail=normalizedIdentifier.includes("@");
        const normalizedStore=String(storeCode||"").trim().toUpperCase();
        if(!isEmail && !normalizedStore){
            throw new Error("Kode Toko diperlukan untuk login menggunakan NIK Karyawan.");
        }

        invalidateFastCache();
        const client=getClient();

        // Email tidak memerlukan resolver. Jalur langsung ini menjaga login email
        // tetap tersedia meskipun Edge Function resolver NIK sedang bermasalah.
        if(isEmail){
            const {data,error}=await client.auth.signInWithPassword({
                email:normalizedIdentifier.toLowerCase(),
                password:String(password)
            });
            if(error || !data?.session || !data?.user){
                throw new Error("Email atau password tidak valid.");
            }
            return data;
        }

        let result;
        try{
            result=await invokeLoginResolver({
                action:"sign_in",
                identifier:normalizedIdentifier,
                password:String(password),
                store_code:normalizedStore
            });
        }catch(error){
            console.error("Login NIK resolver gagal:",error);
            const raw=String(error?.message||"").trim();
            if(raw && !/Login belum dapat diproses/i.test(raw)) throw error;
            throw new Error("Layanan login NIK sedang tidak tersedia. Gunakan email akun untuk masuk sementara atau coba kembali beberapa saat lagi.");
        }

        if(!result?.session?.access_token || !result?.session?.refresh_token){
            throw new Error("NIK atau password tidak valid.");
        }

        const {data,error}=await client.auth.setSession({
            access_token:result.session.access_token,
            refresh_token:result.session.refresh_token
        });
        if(error) throw error;
        if(!data?.user) throw new Error("Sesi akun belum dapat dibuat. Coba login ulang.");
        return data;
    }

    async function requestPasswordReset(identifier,storeCode="",redirectTo=""){
        const normalizedIdentifier=String(identifier||"").trim();
        if(!normalizedIdentifier) throw new Error("Email atau NIK Karyawan wajib diisi.");
        const isEmail=normalizedIdentifier.includes("@");
        const normalizedStore=String(storeCode||"").trim().toUpperCase();
        if(!isEmail && !normalizedStore){
            throw new Error("Kode Toko diperlukan untuk reset password menggunakan NIK Karyawan.");
        }

        // Reset menggunakan email juga tidak perlu melalui resolver NIK.
        if(isEmail){
            const client=getClient();
            const options={};
            const target=String(redirectTo||"").trim();
            if(target) options.redirectTo=target;
            await client.auth.resetPasswordForEmail(normalizedIdentifier.toLowerCase(),options);
            return {
                ok:true,
                message:"Jika data akun cocok, tautan reset password akan dikirim ke email yang terhubung."
            };
        }

        try{
            return await invokeLoginResolver({
                action:"reset_password",
                identifier:normalizedIdentifier,
                store_code:normalizedStore,
                redirect_to:String(redirectTo||"")
            });
        }catch(error){
            console.error("Reset password NIK resolver gagal:",error);
            const raw=String(error?.message||"").trim();
            if(raw && !/Login belum dapat diproses/i.test(raw)) throw error;
            throw new Error("Layanan reset password melalui NIK sedang tidak tersedia. Gunakan email akun sementara atau coba kembali beberapa saat lagi.");
        }
    }

    async function signOut(){
        invalidateFastCache();
        const client=getClient();
        const {error}=await client.auth.signOut();
        if(error) throw error;
        return true;
    }

    async function getUser(){
        const client=getClient();
        const {data,error}=await client.auth.getUser();
        if(error) throw error;
        return data?.user || null;
    }

    function saveFastContext(user,profile){
        if(!user?.id || !profile) return;
        safeSessionWrite(FAST_CONTEXT_KEY,{
            version:VERSION,
            checkedAt:now(),
            userId:String(user.id),
            storeId:String(profile.store_id||""),
            deviceId:getOrCreateDeviceId(),
            profile
        });
    }

    async function getContext(options={}){
        const client=getClient();
        const forceRemote=options.forceRemote===true;

        if(!forceRemote){
            const localUser=await getLocalSessionUser(client);
            if(!localUser) return null;

            const cached=safeSessionRead(FAST_CONTEXT_KEY);
            const fresh=Boolean(
                cached &&
                Number(cached.checkedAt||0)>0 &&
                now()-Number(cached.checkedAt||0)<=CONTEXT_TTL_MS &&
                cachedIdentityMatches(cached,localUser.id) &&
                cached.profile
            );

            if(fresh){
                return {
                    user:localUser,
                    profile:cached.profile,
                    _ldmFastHandoff:true,
                    _ldmFastCheckedAt:Number(cached.checkedAt||0)
                };
            }
        }

        const {data:userData,error:userError}=await client.auth.getUser();
        if(userError) throw userError;
        const user=userData?.user || null;
        if(!user) return null;

        const {data,error}=await client.rpc("ldm_my_context");
        if(error) throw error;

        const context=Array.isArray(data)?data[0]:data;
        if(!context){
            throw new Error("Login berhasil, tetapi profil akun belum tersedia. Hubungi Tim Support.");
        }

        saveFastContext(user,context);

        return {
            user,
            profile:context,
            _ldmFastHandoff:false,
            _ldmFastCheckedAt:now()
        };
    }

    async function registerCurrentDevice(options={}){
        const force=options.force===true;
        const clientDeviceId=getOrCreateDeviceId();
        const userId=String(localStorage.getItem("ldmCloudUserId")||"");
        const storeId=String(localStorage.getItem("ldmCloudStoreId")||"");

        if(!force){
            const cached=safeSessionRead(FAST_DEVICE_REGISTER_KEY);
            if(
                cached &&
                now()-Number(cached.checkedAt||0)<=DEVICE_REGISTER_TTL_MS &&
                String(cached.deviceId||"")===clientDeviceId &&
                (!userId || String(cached.userId||"")===userId) &&
                (!storeId || String(cached.storeId||"")===storeId)
            ){
                return {
                    id:cached.id||null,
                    clientDeviceId,
                    cached:true
                };
            }
        }

        const client=getClient();
        const {data,error}=await client.rpc("ldm_register_device",{
            p_client_device_id:clientDeviceId,
            p_device_name:getDeviceName(),
            p_platform:getPlatformInfo()
        });
        if(error) throw error;

        safeSessionWrite(FAST_DEVICE_REGISTER_KEY,{
            checkedAt:now(),
            userId,
            storeId,
            deviceId:clientDeviceId,
            id:data||null
        });

        return {id:data,clientDeviceId,cached:false};
    }

    async function listDevices(){
        const client=getClient();
        const {data,error}=await client.rpc("ldm_my_devices");
        if(error) throw error;
        return Array.isArray(data)?data:[];
    }

    async function getCurrentDeviceAccess(options={}){
        const force=options.force===true;
        const clientDeviceId=getOrCreateDeviceId();
        const userId=String(localStorage.getItem("ldmCloudUserId")||"");
        const storeId=String(localStorage.getItem("ldmCloudStoreId")||"");

        if(!force){
            const cached=safeSessionRead(FAST_DEVICE_ACCESS_KEY);
            if(
                cached &&
                now()-Number(cached.checkedAt||0)<=DEVICE_ACCESS_TTL_MS &&
                String(cached.deviceId||"")===clientDeviceId &&
                (!userId || String(cached.userId||"")===userId) &&
                (!storeId || String(cached.storeId||"")===storeId) &&
                cached.access
            ){
                return {
                    ...cached.access,
                    _ldmFastHandoff:true,
                    _ldmFastCheckedAt:Number(cached.checkedAt||0)
                };
            }
        }

        const client=getClient();
        const {data,error}=await client.rpc("ldm_current_device_access",{
            p_client_device_id:clientDeviceId
        });
        if(error) throw error;

        const access=(Array.isArray(data)?data[0]:data) || {
            client_device_id:clientDeviceId,
            status:"unknown"
        };

        safeSessionWrite(FAST_DEVICE_ACCESS_KEY,{
            checkedAt:now(),
            userId,
            storeId,
            deviceId:clientDeviceId,
            access
        });

        return {
            ...access,
            _ldmFastHandoff:false,
            _ldmFastCheckedAt:now()
        };
    }

    function primeNavigationHandoff(context=window.LDM_CLOUD_CONTEXT,deviceAccess=window.LDM_CURRENT_DEVICE_ACCESS){
        try{
            const contextCheckedAt=Number(context?._ldmFastCheckedAt||0);
            const deviceCheckedAt=Number(deviceAccess?._ldmFastCheckedAt||0);
            const contextFresh=Boolean(
                context?.user?.id &&
                context?.profile &&
                contextCheckedAt>0 &&
                now()-contextCheckedAt<=NAV_HANDOFF_MAX_SOURCE_AGE_MS
            );
            const deviceFresh=Boolean(
                deviceAccess &&
                String(deviceAccess.status||"").toLowerCase()==="active" &&
                deviceCheckedAt>0 &&
                now()-deviceCheckedAt<=NAV_HANDOFF_MAX_SOURCE_AGE_MS
            );

            if(!contextFresh || !deviceFresh){
                return false;
            }

            saveFastContext(context.user,context.profile);

            safeSessionWrite(FAST_DEVICE_ACCESS_KEY,{
                checkedAt:now(),
                userId:String(context.user.id||""),
                storeId:String(context.profile.store_id||""),
                deviceId:getOrCreateDeviceId(),
                access:deviceAccess
            });

            return true;
        }catch(error){
            return false;
        }
    }

    function watchAuth(callback){
        const client=getClient();
        const {data}=client.auth.onAuthStateChange(function(event,session){
            if(["SIGNED_OUT","USER_UPDATED","PASSWORD_RECOVERY"].includes(String(event||""))){
                invalidateFastCache();
            }
            if(typeof callback==="function") callback(event,session);
        });
        return data?.subscription || null;
    }

    window.LDMCloudAuth=Object.freeze({
        version:VERSION,
        getClient,
        signIn,
        requestPasswordReset,
        signOut,
        getUser,
        getContext,
        registerCurrentDevice,
        listDevices,
        getCurrentDeviceAccess,
        getOrCreateDeviceId,
        watchAuth,
        invalidateFastCache,
        primeNavigationHandoff,
        fastCacheTtlMs:Object.freeze({
            context:CONTEXT_TTL_MS,
            deviceAccess:DEVICE_ACCESS_TTL_MS,
            deviceRegister:DEVICE_REGISTER_TTL_MS,
            navigationSourceMaxAge:NAV_HANDOFF_MAX_SOURCE_AGE_MS
        })
    });
})();
