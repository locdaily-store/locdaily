(function(){
    "use strict";

    function service(){
        if(!window.LDMProcurement){
            throw new Error("Layanan Purchase Order belum siap.");
        }
        return window.LDMProcurement;
    }

    async function confirmCloud(title,message,okText="Lanjutkan"){
        if(window.ldmDialog && typeof window.ldmDialog.confirm === "function"){
            return await window.ldmDialog.confirm(title,message,"question",{okText});
        }
        return window.confirm(message);
    }

    globalThis.konfirmasiOrderPO = async function(){
        if(!requirePermission(editingPOId ? "purchaseorder.edit" : "purchaseorder.create")) return;
        if(!validasiHeaderPO()) return;
        const session = requireLogin();
        if(!session) return;
        const adminMode = session.role === "admin";
        const ok = await confirmCloud(
            adminMode ? "Ajukan Purchase Order" : "Pesan ke Supplier",
            adminMode
                ? "Purchase Order dari Admin akan dikirim sebagai PENDING dan menunggu persetujuan Owner. Lanjutkan?"
                : "Purchase Order Owner akan langsung berstatus ORDERED dan siap diproses melalui Goods Receipt. Lanjutkan?",
            adminMode ? "Ajukan" : "Pesan"
        );
        if(!ok) return;
        await globalThis.simpanPurchaseOrder(adminMode ? "PendingApproval" : "Ordered");
    };

    globalThis.simpanPurchaseOrder = async function(status="Draft"){
        if(!requirePermission(editingPOId ? "purchaseorder.edit" : "purchaseorder.create")) return;
        if(!validasiHeaderPO()) return;
        const session = requireLogin();
        if(!session) return;

        const nomorPO = document.getElementById("inputNomorPO").value || buatNomorPO();
        const supplier = cleanText(document.getElementById("inputSupplierPO").value,80);

        try{
            const existing = editingPOId
                ? safeReadArray("dataPurchaseOrder").find(po => String(po.id) === String(editingPOId))
                : null;

            const result = await service().savePurchaseOrder({
                id:editingPOId || null,
                clientId:existing && existing._cloud ? existing._cloud.clientId : null,
                poNumber:nomorPO,
                orderDate:document.getElementById("inputTanggalPO").value || tanggalHariIni(),
                estimatedArrival:document.getElementById("inputEstimasiTiba").value || null,
                supplier,
                supplierContact:cleanText(document.getElementById("inputKontakSupplier").value,50),
                reference:cleanText(document.getElementById("inputReferensiPO").value,60),
                note:cleanText(document.getElementById("inputCatatanPO").value,250),
                status,
                items:draftPO.map(item => ({...item}))
            });

            hapusAutoDraftPO();
            renderRiwayatPO();

            const finalStatus = result && result.status ? result.status : status;
            notify(
                finalStatus === "PendingApproval" ? "Dikirim ke Owner" : (finalStatus === "Ordered" ? "Purchase Order Dipesan" : "Draft Tersimpan"),
                `${nomorPO} berhasil disimpan ke cloud dengan status ${finalStatus}.`
            );

            if(finalStatus === "Ordered" && result && result.id && hasPermission("purchaseorder.print")){
                try{ cetakPO(result.id); }catch(error){}
            }
            setTimeout(resetDokumenPO,200);
        }catch(error){
            console.error("Cloud PO save gagal:",error);
            notify("Purchase Order Gagal","Purchase Order belum dapat disimpan. Periksa koneksi lalu coba lagi.");
        }
    };

    globalThis.acceptPendingPO = async function(id){
        if(!requirePermission("purchaseorder.approve")) return;
        const target = safeReadArray("dataPurchaseOrder").find(po => String(po.id) === String(id));
        if(!target) return;
        const ok = await confirmCloud(
            "Accept Purchase Order",
            `Setujui ${target.nomorPO} dan ubah status menjadi ORDERED?`,
            "Accept"
        );
        if(!ok) return;
        try{
            await service().approvePurchaseOrder(id);
            renderRiwayatPO();
            try{ tutupModal("modalDetailPO"); }catch(error){}
            notify("Purchase Order Disetujui",`${target.nomorPO} sekarang tersedia untuk Goods Receipt di semua device.`);
        }catch(error){
            notify("Persetujuan PO Gagal","Purchase Order belum dapat disetujui. Coba lagi.");
        }
    };

    globalThis.konfirmasiBatalkanPO = async function(id){
        if(!requirePermission("purchaseorder.cancel")) return;
        const po = safeReadArray("dataPurchaseOrder").find(row => String(row.id) === String(id));
        if(!po) return;
        const ok = await confirmCloud("Batalkan Purchase Order",`Batalkan ${po.nomorPO}?`,`Batalkan`);
        if(!ok) return;
        try{
            await service().cancelPurchaseOrder(id,"Dibatalkan melalui Purchase Order UI");
            renderRiwayatPO();
            notify("PO Dibatalkan",`${po.nomorPO} berstatus Cancelled di cloud.`);
        }catch(error){
            notify("Pembatalan PO Gagal","Purchase Order belum dapat dibatalkan. Coba lagi.");
        }
    };

    globalThis.konfirmasiHapusPO = async function(id){
        if(!requirePermission("purchaseorder.delete")) return;
        const po = safeReadArray("dataPurchaseOrder").find(row => String(row.id) === String(id));
        if(!po) return;
        const ok = await confirmCloud(
            "Hapus Purchase Order",
            `Hapus draft ${po.nomorPO}? Penghapusan hanya dapat dilakukan jika Purchase Order masih memenuhi syarat.`,
            "Hapus"
        );
        if(!ok) return;
        try{
            await service().deletePurchaseOrder(id);
            renderRiwayatPO();
            notify("PO Dihapus",`${po.nomorPO} berhasil dihapus dari daftar aktif.`);
        }catch(error){
            notify("PO Tidak Dihapus","Purchase Order belum dapat dihapus. Pastikan statusnya masih dapat dihapus lalu coba lagi.");
        }
    };

    window.addEventListener("ldm-procurement-cache-updated",event => {
        if(!event.detail) return;
        if(["purchaseOrders","suppliers"].includes(event.detail.section)){
            try{ renderRiwayatPO(); }catch(error){}
        }
    });
})();
