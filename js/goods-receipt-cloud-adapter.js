(function(){
    "use strict";

    function service(){
        if(!window.LDMProcurement){
            throw new Error("Layanan Penerimaan Barang belum siap.");
        }
        return window.LDMProcurement;
    }

    async function confirmCloud(title,message,okText="Lanjutkan"){
        if(window.ldmDialog && typeof window.ldmDialog.confirm === "function"){
            return await window.ldmDialog.confirm(title,message,"question",{okText});
        }
        return window.confirm(message);
    }

    globalThis.konfirmasiSimpanGoodsReceipt = async function(){
        if(!requirePermission("goodsreceipt.create")) return;
        if(daftarBarangGoodsReceipt.length === 0){
            tampilkanNotifikasi("Belum Ada Barang","Tambahkan minimal satu barang ke lembar Goods Receipt.");
            return;
        }
        const supplier = sanitizeSimpleText(document.getElementById("inputSupplier").value,80);
        const suratJalan = sanitizeSimpleText(document.getElementById("inputSuratJalan").value,50);
        if(!supplier){
            tampilkanNotifikasi("Supplier Wajib Diisi","Pilih supplier dari daftar Supplier.");
            return;
        }
        if(!suratJalan){
            tampilkanNotifikasi("Surat Jalan Wajib Diisi","Masukkan nomor surat jalan dari supplier.");
            return;
        }
        const session = requireLogin();
        if(!session) return;
        const ok = await confirmCloud(
            session.role === "admin" ? "Ajukan Goods Receipt" : "Simpan Goods Receipt",
            session.role === "admin"
                ? "Penerimaan dari Admin akan menunggu persetujuan Owner. Stok belum berubah sampai disetujui. Lanjutkan?"
                : "Penerimaan barang akan memperbarui stok. Lanjutkan?",
            session.role === "admin" ? "Ajukan" : "Terima"
        );
        if(!ok) return;
        await globalThis.simpanGoodsReceipt();
    };

    globalThis.simpanGoodsReceipt = async function(){
        if(!requirePermission("goodsreceipt.create")) return;
        const session = requireLogin();
        if(!session) return;

        const nomorGR = document.getElementById("inputNomorGR").value || buatNomorGoodsReceipt();
        const supplier = sanitizeSimpleText(document.getElementById("inputSupplier").value,80);
        const suratJalan = sanitizeSimpleText(document.getElementById("inputSuratJalan").value,50);
        const catatan = sanitizeSimpleText(document.getElementById("inputCatatanGR").value,250);

        try{
            const result = await service().submitGoodsReceipt({
                grNumber:nomorGR,
                businessDate:document.getElementById("inputTanggalGR").value || tanggalHariIniLocal(),
                supplier,
                deliveryNote:suratJalan,
                purchaseOrderId:currentSourcePOId || null,
                note:catatan,
                items:daftarBarangGoodsReceipt.map(item => ({...item}))
            });

            hapusAutoDraftGR();
            daftarBarangGoodsReceipt = [];
            renderDraftGoodsReceipt();
            renderRiwayatGoodsReceipt();
            renderApprovedPurchaseOrderInbox();

            const status = result && result.status ? result.status : (session.role === "admin" ? "PendingApproval" : "Accepted");
            if(status === "PendingApproval"){
                tampilkanNotifikasi("Dikirim ke Owner",`${nomorGR} tersimpan dan menunggu persetujuan. Stok belum berubah.`);
            }else{
                tampilkanNotifikasi("Goods Receipt Diterima",`${nomorGR} berhasil disimpan dan stok telah diperbarui.`);
                if(result && result.id && hasPermission("goodsreceipt.print")){
                    try{ cetakGoodsReceiptById(result.id); }catch(error){}
                }
            }
            setTimeout(resetDokumenGoodsReceipt,250);
        }catch(error){
            console.error("Cloud Goods Receipt gagal:",error);
            tampilkanNotifikasi("Penerimaan Gagal","Penerimaan barang belum dapat disimpan. Periksa koneksi lalu coba lagi.");
        }
    };

    globalThis.acceptPendingGoodsReceipt = async function(id){
        if(!requirePermission("goodsreceipt.approve")) return;
        const receipt = safeReadArray("dataGoodsReceipt").find(gr => String(gr.id) === String(id));
        if(!receipt) return;
        const ok = await confirmCloud(
            "Setujui Penerimaan",
            `Setujui ${receipt.nomorGR}? Stok dan jumlah barang diterima pada Purchase Order akan diperbarui.`,
            "Setujui"
        );
        if(!ok) return;
        try{
            await service().approveGoodsReceipt(id);
            renderRiwayatGoodsReceipt();
            renderApprovedPurchaseOrderInbox();
            try{ tutupModal("modalDetailGR"); }catch(error){}
            tampilkanNotifikasi("Goods Receipt Diterima",`${receipt.nomorGR} telah disetujui dan stok diperbarui.`);
        }catch(error){
            tampilkanNotifikasi("Persetujuan Gagal","Penerimaan barang belum dapat disetujui. Coba lagi.");
        }
    };

    globalThis.konfirmasiHapusGoodsReceipt = async function(id){
        if(!requirePermission("goodsreceipt.cancel")) return;
        const receipt = safeReadArray("dataGoodsReceipt").find(gr => String(gr.id) === String(id));
        if(!receipt) return;
        const ok = await confirmCloud(
            receipt.status === "Accepted" ? "Batalkan Penerimaan" : "Batalkan Penerimaan",
            receipt.status === "Accepted"
                ? `Batalkan ${receipt.nomorGR}? Stok akan dikembalikan ke kondisi sebelum penerimaan bila persediaan masih memungkinkan.`
                : `Batalkan ${receipt.nomorGR}?`,
            "Batalkan"
        );
        if(!ok) return;
        await globalThis.hapusGoodsReceiptDanRollback(id);
    };

    globalThis.hapusGoodsReceiptDanRollback = async function(id){
        if(!requirePermission("goodsreceipt.cancel")) return;
        const receipt = safeReadArray("dataGoodsReceipt").find(gr => String(gr.id) === String(id));
        if(!receipt) return;
        try{
            await service().cancelGoodsReceipt(id,"Dibatalkan melalui Goods Receipt UI");
            renderRiwayatGoodsReceipt();
            renderApprovedPurchaseOrderInbox();
            tampilkanNotifikasi(
                "Goods Receipt Dibatalkan",
                `${receipt.nomorGR} berhasil dibatalkan. Penyesuaian stok telah diterapkan sesuai kondisi barang.`
            );
        }catch(error){
            tampilkanNotifikasi("Pembatalan Gagal","Penerimaan barang belum dapat dibatalkan. Pastikan stok masih memenuhi syarat lalu coba lagi.");
        }
    };

    window.addEventListener("ldm-procurement-cache-updated",event => {
        if(!event.detail) return;
        if(["goodsReceipts","purchaseOrders","suppliers"].includes(event.detail.section)){
            try{ renderRiwayatGoodsReceipt(); }catch(error){}
            try{ renderApprovedPurchaseOrderInbox(); }catch(error){}
        }
    });
})();
