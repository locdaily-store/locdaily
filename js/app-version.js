(function(root){
    "use strict";
    const INFO=Object.freeze({
        appVersion:"27.9.0-v28.18.1",
        buildVersion:"V28.18.1",
        buildName:"Product Permission Compatibility Hotfix"
    });
    root.LDM_VERSION_INFO=INFO;
    root.LDM_APP_VERSION=INFO.appVersion;
    root.LDM_BUILD_VERSION=INFO.buildVersion;
    root.LDM_BUILD_INFO=INFO;
})(typeof globalThis!=="undefined"?globalThis:this);
