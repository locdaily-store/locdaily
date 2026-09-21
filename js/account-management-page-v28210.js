(function(){
  "use strict";

  let currentContext=null;
  let accounts=[];
  let archivedAccounts=[];
  let jobAssignments=[];
  let jobAssignmentsLoaded=false;
  let selected=null;
  let resetTarget=null;
  let currentRole="";
  let refreshPromise=null;
  let realtimeStarted=false;
  let realtimeTimer=null;

  const $=id=>document.getElementById(id);

  function esc(value){
    return String(value??"").replace(/[&<>"']/g,char=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    })[char]);
  }

  function fmt(value){
    if(!value)return "-";
    try{
      return new Intl.DateTimeFormat("id-ID",{
        year:"numeric",month:"2-digit",day:"2-digit",
        hour:"2-digit",minute:"2-digit",
        timeZone:"Asia/Makassar"
      }).format(new Date(value))+" WITA";
    }catch{
      return String(value);
    }
  }

  function maskEmail(value){
    const email=String(value||"").trim();
    const at=email.indexOf("@");
    if(at<=1)return email||"-";
    const name=email.slice(0,at);
    const domain=email.slice(at);
    return name.slice(0,2)+"***"+domain;
  }

  function showMessage(text,type="success"){
    const box=$("message");
    if(!box)return;
    box.style.display="block";
    box.className="card "+(type==="error"?"error":"successbox");
    box.textContent=text;
  }

  function hideMessage(){
    const box=$("message");
    if(box)box.style.display="none";
  }

  function stat(label,value){
    return `<div class="stat"><span>${esc(label)}</span><strong>${esc(value ?? 0)}</strong></div>`;
  }

  function renderHealth(data){
    const host=$("stats");
    if(!host)return;
    const h=data||{};
    host.innerHTML=[
      stat("Total Akun",h.total_profiles),
      stat("Aktif",h.active_profiles),
      stat("Nonaktif",h.inactive_profiles),
      stat("Owner Aktif",h.active_owners),
      stat("Admin Aktif",h.active_admins),
      stat("Kasir Aktif",h.active_cashiers)
    ].join("");
  }

  async function loadUsageLimit(){
    const host=$("usageLimitStats"),note=$("usageLimitNote");
    if(!host||currentRole!=="owner")return;
    host.innerHTML=[stat("Paket","-"),stat("Perangkat","- / -"),stat("Sisa Perangkat","-"),stat("Toko","- / -"),stat("Sisa Toko","-"),stat("Status","Memuat…")].join("");
    if(note)note.textContent="Memuat batas pemakaian…";
    try{
      let q=null;
      if(window.LDMLicenseQuotaSync?.refresh){
        const result=await window.LDMLicenseQuotaSync.refresh({allowSync:true});
        q=result?.quota||null;
      }else{
        const c=window.ldmSupabase||(window.LDMSupabase?.createClient?window.LDMSupabase.createClient():null);
        if(!c)throw new Error("Layanan belum siap.");
        const {data,error}=await c.rpc("ldm_my_license_quota");
        if(error)throw error;
        q=data||null;
      }

      q=q||{};
      const md=Number(q.max_devices||0),ad=Number(q.active_devices||0);
      const ms=Number(q.max_stores||0),as=Number(q.active_stores||0);
      const rd=Math.max(0,md-ad),rs=Math.max(0,ms-as);
      let state="Aktif";
      if(!q.quota_synced)state="Belum siap";
      else if(q.quota_stale)state="Perlu diperbarui";
      else if(q.device_over_limit||q.store_over_limit)state="Melebihi batas";
      else if(q.device_limit_reached||q.store_limit_reached)state="Batas tercapai";

      host.innerHTML=[
        stat("Paket",String(q.plan_code||"").toUpperCase()==="LIFETIME"||/lifetime\s+legacy/i.test(String(q.plan_name||""))?"Lifetime":(q.plan_name||q.plan_code||"-")),
        stat("Perangkat",md?`${ad} / ${md}`:"- / -"),
        stat("Sisa Perangkat",md?rd:"-"),
        stat("Toko",ms?`${as} / ${ms}`:"- / -"),
        stat("Sisa Toko",ms?rs:"-"),
        stat("Status",state)
      ].join("");

      if(note){
        note.textContent=q.quota_synced
          ? "Toko pusat dihitung sebagai satu toko. Perangkat yang menunggu persetujuan belum memakai slot aktif."
          : "Informasi batas pemakaian belum tersedia. Pastikan perangkat terhubung ke internet lalu tekan Refresh.";
      }
    }catch(_){
      host.innerHTML=[stat("Paket","-"),stat("Perangkat","- / -"),stat("Sisa Perangkat","-"),stat("Toko","- / -"),stat("Sisa Toko","-"),stat("Status","Belum tersedia")].join("");
      if(note)note.textContent="Batas pemakaian belum dapat dimuat. Periksa koneksi internet lalu tekan Refresh.";
    }
  }

  function renderHealthUnavailable(){
    const host=$("stats");
    if(!host)return;
    host.innerHTML=[
      stat("Total Akun","-"),
      stat("Aktif","-"),
      stat("Nonaktif","-"),
      stat("Owner Aktif","-"),
      stat("Admin Aktif","-"),
      stat("Kasir Aktif","-")
    ].join("");
  }

  function applyRole(){
    const owner=currentRole==="owner";

    document.querySelectorAll(".owner-only").forEach(element=>{
      if(!owner){
        element.style.display="none";
        return;
      }
      element.style.display=element.classList.contains("card")?"block":"inline-flex";
    });

    const access=$("accessNote");
    if(access){
      access.textContent=owner
        ?"Owner: dapat melihat, membuat, mengedit, menonaktifkan, dan mengaktifkan kembali akun."
        :currentRole==="admin"
          ?"Admin: dapat melihat daftar akun toko. Perubahan akun hanya dapat dilakukan Owner."
          :"Kasir: hanya melihat akun sendiri dan dapat mengganti password sendiri.";
    }

    const note=$("listNote");
    if(note){
      note.textContent=owner
        ?"Memuat daftar akun toko…"
        :currentRole==="admin"
          ?"Memuat daftar akun toko…"
          :"Memuat akun yang sedang digunakan…";
    }
  }

  function setAccountLoading(text="Memuat daftar akun…"){
    const body=$("accountBody");
    const note=$("listNote");
    if(note)note.textContent=text;
    if(body)body.innerHTML=`<tr><td colspan="9" class="muted">${esc(text)}</td></tr>`;
  }

  function setArchivedLoading(text="Memuat akun dinonaktifkan…"){
    const body=$("archivedBody");
    if(body)body.innerHTML=`<tr><td colspan="7" class="muted">${esc(text)}</td></tr>`;
  }

  function accountJobAssignment(account){
    return jobAssignments.find(item=>String(item?.user_id||"")===String(account?.user_id||""))||null;
  }

  function jobRoleState(account){
    if(account?.is_primary_owner===true){
      return {name:"Owner Pusat",status:"Tetap",className:"role",detail:"Hak akses Owner Pusat"};
    }
    if(!jobAssignmentsLoaded){
      return {name:"Belum tersedia",status:"Belum dimuat",className:"warn",detail:"Status Jabatan belum dapat dimuat"};
    }
    const assignment=accountJobAssignment(account);
    if(!assignment?.job_role_id){
      return {name:"Akses standar",status:"Akses standar",className:"role",detail:"Mengikuti tingkat akun"};
    }
    if(assignment.job_role_active===false){
      return {name:assignment.job_role_name||"Jabatan custom",status:"Jabatan Nonaktif",className:"off",detail:"Akses custom sedang dinonaktifkan"};
    }
    if(assignment.scope_valid===false){
      return {name:assignment.job_role_name||"Jabatan custom",status:"Perlu Disesuaikan",className:"warn",detail:"Cabang atau jenis usaha tidak sesuai"};
    }
    return {name:assignment.job_role_name||"Jabatan custom",status:"Jabatan Aktif",className:"on",detail:"Hak akses custom berlaku"};
  }

  function renderAccounts(){
    const body=$("accountBody");
    const note=$("listNote");
    if(!body)return;

    if(!accounts.length){
      body.innerHTML='<tr><td colspan="9" class="muted">Tidak ada akun yang dapat ditampilkan.</td></tr>';
      if(note)note.textContent="0 akun ditemukan.";
      return;
    }

    body.innerHTML=accounts.map((account,index)=>{
      const protectedOwner=account.is_primary_owner===true;
      const actions=currentRole==="owner"
        ? `<div class="row-actions">
             <button onclick="openEdit(${index})">Edit</button>
             <button class="secondary" onclick="sendReset(${index})">Reset</button>
             ${protectedOwner?'<span class="badge role">OWNER PUSAT DILINDUNGI</span>':`<button class="danger" onclick="deleteAt(${index})">Hapus</button>`}
           </div>`
        : '<span class="muted">Hanya lihat</span>';

      const job=jobRoleState(account);
      return `<tr>
        <td><strong>${esc(account.display_name||"Karyawan")}</strong></td>
        <td><strong>${esc(account.employee_id||"-")}</strong></td>
        <td>${esc(account.email||"Disembunyikan")}</td>
        <td><span class="badge role">${esc(String(account.role||"").toUpperCase())}</span></td>
        <td><strong>${esc(job.name)}</strong><br><span class="muted">${esc(job.detail)}</span></td>
        <td><span class="badge ${job.className}">${esc(job.status.toUpperCase())}</span></td>
        <td><span class="badge ${account.active?"on":"off"}">${account.active?"AKTIF":"NONAKTIF"}</span></td>
        <td>${esc(fmt(account.last_sign_in_at))}</td>
        <td>${actions}</td>
      </tr>`;
    }).join("");

    if(note){
      note.textContent=`${accounts.length} akun ditemukan.`;
    }
  }

  function renderAccountError(error){
    const body=$("accountBody");
    const note=$("listNote");
    const message=String(error?.message||error||"Daftar akun gagal dimuat.");
    if(note)note.textContent="Daftar akun belum dapat dimuat.";
    if(body){
      body.innerHTML=`<tr><td colspan="9">
        <div class="notice" style="margin:4px 0">
          <strong>Daftar akun belum dapat dimuat.</strong><br>
          ${esc(message)}<br>
          <button type="button" style="margin-top:8px" onclick="refreshAll()">↻ Coba Lagi</button>
        </div>
      </td></tr>`;
    }
  }

  function renderArchivedAccounts(){
    const body=$("archivedBody");
    const count=$("archivedCount");
    if(count)count.textContent=`${archivedAccounts.length} akun`;
    if(!body)return;

    if(!archivedAccounts.length){
      body.innerHTML='<tr><td colspan="7" class="muted">Tidak ada akun dinonaktifkan yang dapat diaktifkan kembali.</td></tr>';
      return;
    }

    body.innerHTML=archivedAccounts.map((account,index)=>`<tr>
      <td><strong>${esc(account.display_name||"Karyawan")}</strong></td>
      <td><strong>${esc(account.employee_id||"-")}</strong></td>
      <td>${esc(account.email||"-")}</td>
      <td><span class="badge role">${esc(String(account.role||"").toUpperCase())}</span></td>
      <td>${esc(fmt(account.deleted_at))}</td>
      <td><span class="badge ${account.is_banned?"off":"on"}">${account.is_banned?"DIBLOKIR":"TIDAK DIBLOKIR"}</span></td>
      <td><button class="success" onclick="reactivateAt(${index})">Aktifkan Kembali</button></td>
    </tr>`).join("");
  }

  function renderArchivedError(error){
    const body=$("archivedBody");
    if(!body)return;
    body.innerHTML=`<tr><td colspan="7" class="muted">Akun dinonaktifkan belum dapat dimuat. ${esc(error?.message||error||"")}</td></tr>`;
  }

  async function doRefresh(){
    hideMessage();
    setAccountLoading();
    renderHealthUnavailable();

    if($("archivedBody"))setArchivedLoading();

    if(!window.LDMAccounts){
      const error=new Error("Layanan Management Akun belum siap. Muat ulang aplikasi.");
      renderAccountError(error);
      showMessage("❌ "+error.message,"error");
      return;
    }

    try{
      currentContext=await window.LDMAccounts.accountContext();
      currentRole=String(currentContext?.profile?.role||"").toLowerCase();
      applyRole();
      if(currentRole==="owner")loadUsageLimit().catch(()=>undefined);

      const identity=$("identity");
      if(identity){
        identity.textContent=[
          currentContext?.profile?.store_name||"LocDaily",
          currentContext?.profile?.store_code||"-",
          `${currentContext?.profile?.display_name||currentContext?.profile?.employee_id||"Akun"} (${currentRole.toUpperCase()})`
        ].join(" • ");
      }

      const accountPromise=window.LDMAccounts.listAccounts(currentContext);
      const healthPromise=window.LDMAccounts.health(currentContext);
      const archivedPromise=currentRole==="owner"
        ? window.LDMAccounts.listArchivedAccounts(currentContext)
        : Promise.resolve([]);
      const assignmentPromise=currentRole==="owner"&&window.LDMEmployeePermissions?.assignments
        ? window.LDMEmployeePermissions.assignments()
        : Promise.resolve([]);

      const [accountResult,healthResult,archivedResult,assignmentResult]=await Promise.allSettled([
        accountPromise,healthPromise,archivedPromise,assignmentPromise
      ]);

      jobAssignmentsLoaded=assignmentResult.status==="fulfilled"&&Array.isArray(assignmentResult.value);
      jobAssignments=jobAssignmentsLoaded?assignmentResult.value:[];

      if(accountResult.status==="fulfilled"){
        accounts=accountResult.value||[];
        renderAccounts();
      }else{
        accounts=[];
        renderAccountError(accountResult.reason);
        showMessage("❌ "+String(accountResult.reason?.message||accountResult.reason||"Daftar akun gagal dimuat."),"error");
      }

      if(healthResult.status==="fulfilled"){
        renderHealth(healthResult.value);
      }else{
        renderHealthUnavailable();
      }

      if(currentRole==="owner"){
        if(archivedResult.status==="fulfilled"){
          archivedAccounts=archivedResult.value||[];
          renderArchivedAccounts();
        }else{
          archivedAccounts=[];
          renderArchivedError(archivedResult.reason);
        }
      }else{
        archivedAccounts=[];
      }

      if(!realtimeStarted){
        startRealtime().catch(()=>undefined);
      }
    }catch(error){
      accounts=[];
      archivedAccounts=[];
      jobAssignments=[];
      jobAssignmentsLoaded=false;
      renderAccountError(error);
      renderHealthUnavailable();
      const access=$("accessNote");
      if(access)access.textContent="Hak akses belum dapat diverifikasi.";
      showMessage("❌ "+String(error?.message||error),"error");
    }
  }

  async function refreshAll(){
    if(refreshPromise)return refreshPromise;
    refreshPromise=doRefresh().finally(()=>{refreshPromise=null;});
    return refreshPromise;
  }

  async function startRealtime(){
    if(realtimeStarted || !currentContext)return;
    realtimeStarted=true;

    window.addEventListener("ldm-account-realtime-status",event=>{
      const value=String(event?.detail?.status||"").toUpperCase();
      const node=$("realtime");
      if(!node)return;
      if(value==="SUBSCRIBED")node.textContent="Pembaruan langsung: aktif";
      else if(["CHANNEL_ERROR","TIMED_OUT","CLOSED"].includes(value))node.textContent="Pembaruan langsung: terputus";
      else node.textContent="Pembaruan langsung: menyambung…";
    });

    try{
      await window.LDMAccounts.startRealtime(()=>{
        window.clearTimeout(realtimeTimer);
        realtimeTimer=window.setTimeout(()=>refreshAll(),350);
      },currentContext);
    }catch(error){
      realtimeStarted=false;
      const node=$("realtime");
      if(node)node.textContent="Pembaruan langsung: tidak aktif";
    }
  }

  async function createAccount(){
    const button=$("btnCreate");
    if(button)button.disabled=true;
    try{
      const email=$("newEmail").value.trim();
      const displayName=$("newDisplay").value.trim();
      const password=$("newPassword").value;

      if(!email || !email.includes("@"))throw new Error("Email akun wajib diisi dengan format yang valid.");
      if(displayName.length<2)throw new Error("Nama karyawan minimal 2 karakter.");
      if(password.length<8)throw new Error("Password awal minimal 8 karakter.");

      const result=await window.LDMAccounts.createAccount({
        email,
        password,
        displayName,
        role:$("newRole").value
      });

      showMessage(
        `✅ Akun berhasil dibuat.\n`+
        `Nama: ${displayName}\n`+
        `NIK Karyawan: ${result.employee_id||"dibuat otomatis"}\n`+
        `Login dapat menggunakan Email atau NIK Karyawan.`
      );
      ["newEmail","newPassword","newDisplay"].forEach(id=>{$(id).value="";});
      await refreshAll();
    }catch(error){
      showMessage("❌ "+String(error?.message||error),"error");
    }finally{
      if(button)button.disabled=false;
    }
  }

  function openEdit(index){
    selected=accounts[index];
    if(!selected)return;
    $("editEmail").textContent=selected.email||"";
    $("editNik").value=selected.employee_id||"-";
    $("editDisplay").value=selected.display_name||"";
    $("editRole").value=selected.role||"kasir";
    $("editActive").value=selected.active?"true":"false";
    const job=jobRoleState(selected);
    const jobSummary=$("editJobRoleSummary");
    if(jobSummary){
      jobSummary.innerHTML=`<strong>${esc(job.name)}</strong><br><span class="badge ${job.className}" style="margin-top:6px">${esc(job.status.toUpperCase())}</span><br><span class="muted">${esc(job.detail)}</span>`;
    }
    const protectedOwner=selected.is_primary_owner===true;
    $("editRole").disabled=protectedOwner;
    $("editActive").disabled=protectedOwner;
    const deleteButton=$("editDeleteBtn");
    if(deleteButton)deleteButton.hidden=protectedOwner;
    const box=$("editMessage");
    if(box){
      box.style.display=protectedOwner?"block":"none";
      box.className="notice";
      box.textContent=protectedOwner
        ?"Owner Pusat dilindungi: nama tampilan boleh diubah, tetapi tingkat akun, status aktif, dan penghapusan hanya dapat diubah melalui prosedur developer."
        :"";
    }
    $("editModal").classList.add("open");
  }

  function closeEdit(){
    $("editModal").classList.remove("open");
    $("editRole").disabled=false;
    $("editActive").disabled=false;
    const deleteButton=$("editDeleteBtn");if(deleteButton)deleteButton.hidden=false;
    const box=$("editMessage");if(box){box.style.display="none";box.textContent="";}
    const jobSummary=$("editJobRoleSummary");if(jobSummary)jobSummary.textContent="";
    selected=null;
  }

  async function saveEdit(){
    if(!selected)return;
    const displayName=$("editDisplay").value.trim();
    const box=$("editMessage");
    const button=$("editSaveBtn");

    if(displayName.length<2 || displayName.length>80){
      if(box){box.style.display="block";box.className="notice";box.textContent="Nama karyawan harus 2-80 karakter.";}
      return;
    }

    if(button){button.disabled=true;button.textContent="Menyimpan…";}
    if(box){box.style.display="block";box.className="notice";box.textContent="Menyimpan perubahan akun…";}
    try{
      const result=await window.LDMAccounts.updateProfile({
        userId:selected.user_id,
        displayName,
        role:$("editRole").value,
        active:$("editActive").value==="true"
      });
      closeEdit();
      showMessage(result?.job_role_unassigned
        ?"✅ Akun berhasil diperbarui. Jabatan custom lama dilepas karena tidak lagi cocok dengan tingkat akun baru."
        :"✅ Akun berhasil diperbarui.");
      await refreshAll();
    }catch(error){
      const value=String(error?.message||error);
      if(box){box.style.display="block";box.className="notice";box.textContent="Gagal menyimpan: "+value;}
      showMessage("❌ "+value,"error");
    }finally{
      if(button){button.disabled=false;button.textContent="💾 Simpan";}
    }
  }

  function openResetPasswordModal(account){
    if(!account||!account.email){
      showMessage("❌ Email akun tidak tersedia. Reset password tidak dapat dikirim.","error");
      return;
    }
    resetTarget=account;
    $("resetAccountName").textContent=account.display_name||"Karyawan";
    $("resetAccountNik").textContent=account.employee_id||"-";
    $("resetAccountEmail").textContent=maskEmail(account.email);
    $("resetPasswordModal").classList.add("open");
  }

  function closeResetPasswordModal(){
    $("resetPasswordModal").classList.remove("open");
    resetTarget=null;
    const button=$("confirmResetPasswordBtn");
    if(button){button.disabled=false;button.textContent="Kirim Tautan Reset";}
  }

  async function sendReset(index){
    openResetPasswordModal(accounts[index]);
  }

  async function sendResetSelected(){
    if(!selected)return;
    openResetPasswordModal(selected);
  }

  async function confirmResetPassword(){
    if(!resetTarget?.email)return;
    const target={...resetTarget};
    const button=$("confirmResetPasswordBtn");
    if(button){button.disabled=true;button.textContent="Mengirim…";}
    try{
      await window.LDMAccounts.sendPasswordReset(target.email);
      closeResetPasswordModal();
      showMessage(
        `✅ Tautan reset password telah diminta untuk ${target.display_name||"karyawan"}.\n`+
        `Email tujuan: ${maskEmail(target.email)}\n`+
        `Password lama tetap berlaku sampai karyawan berhasil menyimpan password baru. Minta karyawan memeriksa Inbox dan Spam.`
      );
    }catch(error){
      showMessage("❌ "+String(error?.message||error),"error");
      if(button){button.disabled=false;button.textContent="Kirim Tautan Reset";}
    }
  }

  async function deleteAt(index){
    selected=accounts[index];
    await deleteSelected();
    selected=null;
  }

  async function deleteSelected(){
    if(!selected)return;
    if(selected.is_primary_owner===true){
      const box=$("editMessage");
      if(box){box.style.display="block";box.className="notice";box.textContent="Owner Pusat dilindungi dan tidak dapat dihapus dari Management Account.";}
      showMessage("❌ Owner Pusat dilindungi dan tidak dapat dihapus dari Management Account.","error");
      return;
    }
    if(!window.confirm(
      `Hapus akun ${selected.display_name||"karyawan"} (NIK ${selected.employee_id||"-"})?\n\nJika akun mempunyai histori, akses akun akan dinonaktifkan agar histori tetap aman.`
    ))return;

    try{
      const result=await window.LDMAccounts.deleteAccount(selected.user_id);
      closeEdit();
      showMessage(
        result.mode==="hard_deleted"
          ?"✅ Akun berhasil dihapus."
          :"✅ Akses akun dinonaktifkan. Histori lama tetap dipertahankan."
      );
      await refreshAll();
    }catch(error){
      showMessage("❌ "+String(error?.message||error),"error");
    }
  }

  async function reactivateAt(index){
    const target=archivedAccounts[index];
    if(!target)return;

    if(!window.confirm(
      `Aktifkan kembali akun ${target.display_name||"karyawan"} (NIK ${target.employee_id||"-"})?\n\nHistori lama tetap dipertahankan. Perangkat perlu disetujui kembali oleh Owner.`
    ))return;

    try{
      await window.LDMAccounts.reactivateAccount(target.user_id);
      showMessage("✅ Akun berhasil diaktifkan kembali. Setujui ulang perangkat melalui menu Perangkat Toko.");
      await refreshAll();
    }catch(error){
      showMessage("❌ "+String(error?.message||error),"error");
    }
  }

  async function changePassword(){
    const password=$("ownPassword").value;
    const confirmation=$("ownPassword2").value;
    if(password!==confirmation){
      showMessage("❌ Konfirmasi password tidak sama.","error");
      return;
    }

    try{
      await window.LDMAccounts.changeOwnPassword(password);
      $("ownPassword").value="";
      $("ownPassword2").value="";
      showMessage("✅ Password akun berhasil diubah.");
    }catch(error){
      showMessage("❌ "+String(error?.message||error),"error");
    }
  }

  Object.assign(window,{
    refreshAll,createAccount,openEdit,closeEdit,saveEdit,
    sendReset,sendResetSelected,confirmResetPassword,closeResetPasswordModal,
    deleteAt,deleteSelected,reactivateAt,changePassword
  });

  let lifecycleRetryTimer=null;
  const lifecycleRefresh=()=>{
    window.clearTimeout(lifecycleRetryTimer);
    lifecycleRetryTimer=window.setTimeout(()=>refreshAll().catch(()=>undefined),120);
  };
  window.addEventListener("ldm-cloud-auth-ready",lifecycleRefresh);
  window.addEventListener("online",lifecycleRefresh);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)lifecycleRefresh();});

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",refreshAll,{once:true});
  }else{
    refreshAll();
  }
})();
