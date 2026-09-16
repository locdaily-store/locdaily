(function(){
    "use strict";
    if(window.LDM_PUBLIC_GUIDE_MODE===true)return;

    const root =
        document.documentElement;

    root.classList.add(
        "ldm-cloud-auth-pending"
    );

    function addPendingStyle(){
        if(
            document.getElementById(
                "ldmCloudAuthPendingStyle"
            )
        ){
            return;
        }

        const style =
            document.createElement(
                "style"
            );

        style.id =
            "ldmCloudAuthPendingStyle";

        style.textContent =
            "html.ldm-cloud-auth-pending body{visibility:hidden!important;}";

        document.head.appendChild(
            style
        );
    }

    addPendingStyle();

    function isJwtIssuedAtFutureError(error){
        const code =
            String(
                error && error.code || ""
            ).toUpperCase();

        const message =
            String(
                error && error.message || error || ""
            );

        return (
            code === "PGRST303" &&
            /jwt\s+issued\s+at\s+future/i.test(message)
        ) || /PGRST303[\s\S]*jwt\s+issued\s+at\s+future/i.test(message);
    }

    function wait(ms){
        return new Promise(
            resolve =>
                window.setTimeout(resolve, ms)
        );
    }

    async function bootWithJwtClockRetry(){
        /*
         * PGRST303 "JWT issued at future" dapat muncul sementara
         * ketika validator PostgREST melihat waktu yang tertinggal
         * dari penerbit token. Jangan refresh token di sini karena
         * token baru justru memiliki iat yang lebih baru. Ulangi
         * request yang sama dengan jeda terbatas.
         */
        const retryDelays = [
            0,
            450,
            1200,
            2500,
            4200
        ];

        let lastError = null;

        for(
            let attempt = 0;
            attempt < retryDelays.length;
            attempt += 1
        ){
            const delay =
                retryDelays[attempt];

            if(delay > 0){
                await wait(delay);
            }

            try{
                return await boot();
            }catch(error){
                lastError = error;

                if(
                    !isJwtIssuedAtFutureError(error) ||
                    attempt === retryDelays.length - 1
                ){
                    throw error;
                }

                console.warn(
                    `Cloud Auth Guard: PGRST303 sementara, retry ${attempt + 1}/${retryDelays.length - 1}.`
                );
            }
        }

        throw lastError || new Error(
            "Pemeriksaan sesi Cloud gagal setelah beberapa percobaan."
        );
    }

    function hasCachedOfflineLease(){
        try{
            const lease = JSON.parse(
                localStorage.getItem("ldmOfflineLeaseV16") || "null"
            );
            return Boolean(
                lease &&
                lease.version === 16 &&
                lease.device_status === "active" &&
                Number(lease.expires_at_ms || 0) > Date.now() &&
                String(lease.user_id || "") === String(localStorage.getItem("ldmCloudUserId") || "") &&
                String(lease.store_id || "") === String(localStorage.getItem("ldmCloudStoreId") || "") &&
                String(lease.client_device_id || "") === String(localStorage.getItem("ldmCloudDeviceId") || "")
            );
        }catch(error){
            return false;
        }
    }

    function failAuth(
        error
    ){
        console.error(
            "Cloud Auth Guard:",
            error
        );

        const retryableNetworkFailure =
            window.LDMOfflineQueue &&
            typeof window.LDMOfflineQueue.isRetryableNetworkError === "function"
                ? window.LDMOfflineQueue.isRetryableNetworkError(error)
                : navigator.onLine === false || /failed to fetch|network|offline|connection|timeout/i.test(String(error && error.message || error || ""));

        const preserveOfflineLease = Boolean(
            retryableNetworkFailure &&
            (
                (
                    window.LDMOfflineQueue &&
                    typeof window.LDMOfflineQueue.validLease === "function" &&
                    window.LDMOfflineQueue.validLease()
                )
                || hasCachedOfflineLease()
            )
        );

        const transientJwtClockFailure =
            isJwtIssuedAtFutureError(error);

        if(
            !preserveOfflineLease &&
            !transientJwtClockFailure
        ){
            try{
                if(
                    window.LDMCloudSession
                ){
                    window.LDMCloudSession
                        .clearCompatibilityCache();
                }
            }catch(cacheError){
                console.warn(
                    cacheError
                );
            }
        }

        const finalMessage =
            transientJwtClockFailure
                ? "Sesi Cloud sedang mengalami gangguan sinkronisasi waktu. Muat ulang halaman beberapa saat lagi. Sesi lokal tidak dihapus."
                : (
                    error && error.message
                        ? error.message
                        : "Session cloud tidak valid."
                );

        const message =
            encodeURIComponent(
                finalMessage
            );

        root.classList.remove(
            "ldm-cloud-auth-pending",
            "secure-page-pending"
        );

        if(preserveOfflineLease){
            window.location.replace(
                "kasir.html?offlineFallback=1"
            );
            return;
        }

        window.location.replace(
            `index.html?cloudAuthError=${message}`
        );
    }


    function publishVerifiedContext(context){
        const role = window.LDMCloudSession && typeof window.LDMCloudSession.normalizeRole === "function"
            ? window.LDMCloudSession.normalizeRole(context?.profile?.role || context?.role || context?.user?.role)
            : String(context?.profile?.role || context?.role || context?.user?.role || "").trim().toLowerCase();
        if(!["owner","admin","kasir"].includes(role)) return "";
        window.LDM_CLOUD_CONTEXT = context;
        window.LDM_VERIFIED_ROLE = role;
        document.documentElement.dataset.ldmVerifiedRole = role;
        document.documentElement.dataset.ldmRole = role;
        return role;
    }
    function patchLogoutFunctions(){
        if(
            !window.LDMCloudSession
        ){
            return;
        }

        const cloudLogout =
            function(){
                return window
                    .LDMCloudSession
                    .logout(
                        "index.html"
                    );
            };

        [
            "secureLogout",
            "logout",
            "logoutSession"
        ].forEach(
            name => {
                if(
                    typeof window[name] ===
                    "function"
                ){
                    window[name] =
                        cloudLogout;
                }
            }
        );
    }

    async function boot(){
        if(
            !window.LDMSupabase ||
            !window.LDMSupabase
                .isConfigured()
        ){
            throw new Error(
                "Layanan Cloud belum dikonfigurasi."
            );
        }

        if(
            !window.LDMCloudSession
        ){
            throw new Error(
                "Cloud Session helper tidak termuat."
            );
        }

        const context =
            await window.LDMCloudSession
                .ensureAuthenticated({
                    registerDevice:
                        true,
                    forceRemote:
                        false
                });

        const role =
            window.LDMCloudSession
                .normalizeRole(
                    context.profile.role
                );

        if(
            ![
                "owner",
                "admin",
                "kasir"
            ].includes(role)
        ){
            throw new Error(
                "Role profile cloud tidak valid."
            );
        }

        const pageName =
            String(
                window.location.pathname
                    .split("/")
                    .pop() || ""
            ).toLowerCase();

        if(
            pageName !== "device-access.html" &&
            window.LDMCloudAuth &&
            typeof window.LDMCloudAuth.getCurrentDeviceAccess ===
                "function"
        ){
            const deviceAccess =
                await window.LDMCloudAuth
                    .getCurrentDeviceAccess({
                        force:false
                    });

            const deviceStatus =
                String(
                    deviceAccess &&
                    deviceAccess.status ||
                    "unknown"
                ).toLowerCase();

            window.LDM_CURRENT_DEVICE_ACCESS=deviceAccess;

            if(deviceStatus !== "active"){
                root.classList.remove(
                    "ldm-cloud-auth-pending",
                    "secure-page-pending"
                );

                window.location.replace(
                    "device-access.html"
                );

                return context;
            }

            if(
                window.LDMOfflineQueue &&
                typeof window.LDMOfflineQueue.rememberVerifiedContext === "function"
            ){
                window.LDMOfflineQueue.rememberVerifiedContext(
                    context,
                    deviceAccess
                );
            }
        }

        publishVerifiedContext(context);
        patchLogoutFunctions();
        installForegroundSecurityHooks();

        root.classList.remove(
            "ldm-cloud-auth-pending",
            "secure-page-pending"
        );

        window.dispatchEvent(
            new CustomEvent(
                "ldm-cloud-auth-ready",
                {
                    detail:
                        context
                }
            )
        );

        scheduleBackgroundSecurityRevalidate(context);

        return context;
    }

    let backgroundSecurityCheckRunning=false;
    const BACKGROUND_VERIFY_KEY="ldmCloudBackgroundVerifyV28163";
    const BACKGROUND_VERIFY_MIN_GAP_MS=3500;

    function lastBackgroundVerify(){
        try{
            return Number(sessionStorage.getItem(BACKGROUND_VERIFY_KEY)||0);
        }catch(error){
            return 0;
        }
    }

    function markBackgroundVerify(){
        try{
            sessionStorage.setItem(BACKGROUND_VERIFY_KEY,String(Date.now()));
        }catch(error){}
    }

    function sameSecurityIdentity(a,b){
        return Boolean(
            a?.user?.id &&
            b?.user?.id &&
            String(a.user.id)===String(b.user.id) &&
            String(a?.profile?.store_id||"")===String(b?.profile?.store_id||"") &&
            String(a?.profile?.role||"").toLowerCase()===String(b?.profile?.role||"").toLowerCase()
        );
    }

    async function backgroundSecurityRevalidate(initialContext){
        if(backgroundSecurityCheckRunning || navigator.onLine===false)return;
        if(Date.now()-lastBackgroundVerify()<BACKGROUND_VERIFY_MIN_GAP_MS)return;

        backgroundSecurityCheckRunning=true;

        try{
            const freshContext=
                await window.LDMCloudSession.ensureAuthenticated({
                    registerDevice:false,
                    forceRemote:true
                });

            const pageName=String(
                window.location.pathname.split("/").pop()||""
            ).toLowerCase();

            if(
                pageName!=="device-access.html" &&
                window.LDMCloudAuth?.getCurrentDeviceAccess
            ){
                const freshDevice=
                    await window.LDMCloudAuth.getCurrentDeviceAccess({
                        force:true
                    });

                window.LDM_CURRENT_DEVICE_ACCESS=freshDevice;

                const status=String(freshDevice?.status||"unknown").toLowerCase();
                if(status!=="active"){
                    root.classList.remove("ldm-cloud-auth-pending","secure-page-pending");
                    window.location.replace("device-access.html");
                    return;
                }
            }

            markBackgroundVerify();

            if(!sameSecurityIdentity(initialContext,freshContext)){
                // Role/store/user berubah di server. Reload sekali agar seluruh
                // role/license guard dibangun ulang dari konteks terbaru.
                window.location.reload();
                return;
            }

            publishVerifiedContext(freshContext);
            window.dispatchEvent(new CustomEvent("ldm-cloud-auth-revalidated",{
                detail:freshContext
            }));
        }catch(error){
            // Handoff hanya mempercepat UI. Semua RPC/data tetap diverifikasi
            // server-side. Gangguan jaringan background tidak menghapus sesi.
            console.warn("Cloud Auth background revalidation:",error);
        }finally{
            backgroundSecurityCheckRunning=false;
        }
    }

    function scheduleBackgroundSecurityRevalidate(context){
        if(!context?._ldmFastHandoff)return;

        const start=()=>backgroundSecurityRevalidate(context);

        if(typeof window.requestIdleCallback==="function"){
            window.requestIdleCallback(start,{timeout:900});
        }else{
            window.setTimeout(start,180);
        }
    }

    let foregroundSecurityHooksInstalled=false;
    function installForegroundSecurityHooks(){
        if(foregroundSecurityHooksInstalled)return;
        foregroundSecurityHooksInstalled=true;

        const revalidateIfVisible=()=>{
            if(document.hidden || navigator.onLine===false)return;
            if(Date.now()-lastBackgroundVerify()<30000)return;
            const context=window.LDM_CLOUD_CONTEXT;
            if(context?.user?.id){
                backgroundSecurityRevalidate(context);
            }
        };

        document.addEventListener("visibilitychange",revalidateIfVisible,{passive:true});
        window.addEventListener("focus",revalidateIfVisible,{passive:true});
        window.addEventListener("online",revalidateIfVisible,{passive:true});
    }

    async function bootWithOfflineFallback(){
        try{
            return await bootWithJwtClockRetry();
        }catch(error){
            const offlineContext =
                window.LDMOfflineQueue &&
                typeof window.LDMOfflineQueue.offlineContextForError === "function"
                    ? window.LDMOfflineQueue.offlineContextForError(error)
                    : null;

            if(!offlineContext){
                throw error;
            }

            publishVerifiedContext(offlineContext);
            patchLogoutFunctions();

            root.classList.remove(
                "ldm-cloud-auth-pending",
                "secure-page-pending"
            );

            window.dispatchEvent(
                new CustomEvent(
                    "ldm-cloud-auth-ready",
                    {
                        detail:offlineContext
                    }
                )
            );

            window.dispatchEvent(
                new CustomEvent(
                    "ldm-cloud-auth-offline-ready",
                    {
                        detail:offlineContext
                    }
                )
            );

            console.warn(
                "LocDailyMar berjalan dalam mode offline terbatas. Data transaksi akan masuk antrean perangkat."
            );

            return offlineContext;
        }
    }

    window.LDMCloudGuard =
        Object.freeze({
            boot,
            patchLogoutFunctions,
            isJwtIssuedAtFutureError,
            backgroundSecurityRevalidate
        });

    /*
     * Mulai sedini mungkin, sebelum DOMContentLoaded.
     * Ini membantu cache kompatibilitas tersedia sebelum
     * guard legacy halaman ikut berjalan.
     */
    bootWithOfflineFallback()
        .then(
            () => {
                if(
                    document.readyState ===
                    "loading"
                ){
                    document.addEventListener(
                        "DOMContentLoaded",
                        patchLogoutFunctions,
                        {
                            once:
                                true
                        }
                    );
                }else{
                    patchLogoutFunctions();
                }

                window.addEventListener(
                    "load",
                    patchLogoutFunctions,
                    {
                        once:
                            true
                    }
                );
            }
        )
        .catch(
            failAuth
        );
})();
