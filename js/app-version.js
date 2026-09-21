(function(root){
    "use strict";
    const INFO=Object.freeze({
        appVersion:"27.9.0-v28.21.0-final",
        displayVersion:"LocDaily 28.21.0",
        buildVersion:"28.21.0",
        buildName:"Email/NIK Login & Transfer Identity Hardening"
    });
    root.LDM_VERSION_INFO=INFO;
    root.LDM_APP_VERSION=INFO.appVersion;
    root.LDM_DISPLAY_VERSION=INFO.displayVersion;
    root.LDM_BUILD_VERSION=INFO.buildVersion;
    root.LDM_BUILD_INFO=INFO;
})(typeof globalThis!=="undefined"?globalThis:this);
