(function(){
    "use strict";
    const VERSION="27.9.0-v28.18.0";
    const OLD_NAME="LocDaily"+"Mar";
    const NEW_NAME="LocDaily";

    function migrateJson(key,mutate){
        try{
            const raw=localStorage.getItem(key);if(!raw)return false;
            const value=JSON.parse(raw);if(!value||typeof value!=="object")return false;
            const changed=mutate(value)===true;
            if(changed)localStorage.setItem(key,JSON.stringify(value));
            return changed;
        }catch(_error){return false}
    }

    function migrate(){
        let changed=false;
        changed=migrateJson("headerConfig",cfg=>{
            let c=false;
            if(String(cfg.judul||"").trim()===OLD_NAME){cfg.judul=NEW_NAME;c=true}
            if(String(cfg.subJudul||"").trim()===OLD_NAME+" POS & Management"){cfg.subJudul=NEW_NAME+" POS & Management";c=true}
            return c;
        })||changed;
        changed=migrateJson("strukConfig",cfg=>{
            let c=false;
            if(String(cfg.namaToko||"").trim()===OLD_NAME+" POS"){cfg.namaToko=NEW_NAME+" POS";c=true}
            return c;
        })||changed;
        changed=migrateJson("receiptConfig",cfg=>{
            let c=false;
            if(String(cfg.namaToko||"").trim()===OLD_NAME+" POS"){cfg.namaToko=NEW_NAME+" POS";c=true}
            return c;
        })||changed;
        try{
            const value=localStorage.getItem("ldmCloudStoreName");
            if(value===OLD_NAME){localStorage.setItem("ldmCloudStoreName",NEW_NAME);changed=true}
        }catch(_error){}
        try{localStorage.setItem("ldmBrandMigrationV28180","done")}catch(_error){}
        if(changed)window.dispatchEvent(new CustomEvent("ldm-brand-migrated",{detail:{version:VERSION,name:NEW_NAME}}));
    }

    window.LDMBrand=Object.freeze({version:VERSION,name:NEW_NAME,migrate});
    migrate();
})(typeof globalThis!=="undefined"?globalThis:window);
