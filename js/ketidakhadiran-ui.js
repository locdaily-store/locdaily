(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const role=()=>String(window.LDM_VERIFIED_ROLE||localStorage.getItem("userRole")||localStorage.getItem("role")||"").trim().toLowerCase();
  const roleLabel=value=>({owner:"Owner",admin:"Admin",kasir:"Kasir"}[String(value||"").toLowerCase()]||value||"-");
  const reasonLabel=value=>({
    SAKIT_KONDISI:"Sakit / kondisi kesehatan",
    KEPERLUAN_KELUARGA:"Keperluan keluarga mendesak",
    KENDALA_TRANSPORTASI:"Kendala transportasi / perjalanan",
    KENDALA_SISTEM:"Kendala perangkat, jaringan, atau sistem absensi",
    LUPA_KELALAIAN:"Lupa / kelalaian melakukan absensi",
    KEADAAN_DARURAT:"Keadaan darurat",
    LAINNYA:"Lainnya"
  }[value]||value||"-");
  const caseLabel=value=>({
    PENDING_CONFIRMATION:"Menunggu Konfirmasi",
    EXPLANATION_SUBMITTED:"Konfirmasi Dikirim",
    REVIEWED:"Sudah Ditinjau",
    ABSENT_NO_CONFIRMATION:"Tidak Hadir · Tanpa Konfirmasi",
    RESOLVED_ATTENDED:"Selesai · Ada Presensi",
    RESOLVED_EXEMPT:"Dikecualikan · Libur/Cuti"
  }[value]||value||"-");
  const caseClass=value=>({
    PENDING_CONFIRMATION:"pending",
    EXPLANATION_SUBMITTED:"submitted",
    REVIEWED:"reviewed",
    ABSENT_NO_CONFIRMATION:"danger"
  }[value]||"");
  const dateID=value=>{
    if(!value)return "-";
    const date=new Date(`${String(value).slice(0,10)}T00:00:00Z`);
    return new Intl.DateTimeFormat("id-ID",{dateStyle:"long",timeZone:"UTC"}).format(date);
  };
  const time=value=>value?String(value).slice(0,5):"-";
  const dateTime=value=>{
    if(!value)return "-";
    const d=new Date(value);
    if(Number.isNaN(d.getTime()))return "-";
    return new Intl.DateTimeFormat("id-ID",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Makassar"}).format(d)+" WITA";
  };
  const remaining=value=>{
    const ms=new Date(value).getTime()-Date.now();
    if(!Number.isFinite(ms)||ms<=0)return "Batas waktu berakhir";
    const minutes=Math.ceil(ms/60000);
    if(minutes<60)return `${minutes} menit tersisa`;
    const hours=Math.floor(minutes/60), mins=minutes%60;
    if(hours<48)return `${hours} jam${mins?` ${mins} menit`:""} tersisa`;
    return `${Math.floor(hours/24)} hari ${hours%24} jam tersisa`;
  };

  let candidateRows=[];
  let myRows=[];
  let ownerStores=[];

  function message(text,type=""){
    const box=$("absenceMessage");
    if(!box)return;
    box.className=`wf-notice ${type}`.trim();
    box.textContent=text;
  }

  function updateStats(){
    $("absenceCandidateCount").textContent=candidateRows.length;
    $("absenceSubmittedCount").textContent=myRows.filter(row=>row.case_status==="EXPLANATION_SUBMITTED").length;
    $("absenceReviewedCount").textContent=myRows.filter(row=>row.case_status==="REVIEWED").length;
    $("absenceFinalAbsentCount").textContent=myRows.filter(row=>row.case_status==="ABSENT_NO_CONFIRMATION").length;
    $("absenceRole").textContent=roleLabel(role());
  }

  async function refreshMenuState(){
    if(window.LDMGlobalNavigation?.syncAbsenceMenuState){
      await window.LDMGlobalNavigation.syncAbsenceMenuState(true);
    }
  }

  async function loadCandidates(){
    candidateRows=await window.LDMWorkforce.explanationCandidates(62);
    const select=$("absenceDate");
    select.innerHTML=candidateRows.map(row=>`<option value="${esc(row.attendance_date)}">${esc(dateID(row.attendance_date))} · ${esc(row.shift_label||"-")} ${esc(time(row.planned_start_time))}-${esc(time(row.planned_end_time))} · ${esc(remaining(row.confirmation_deadline_at))}</option>`).join("");
    const available=candidateRows.length>0;
    $("absenceSubmit").disabled=!available;
    $("absenceDeadlineBox").hidden=!available;
    if(available){
      showSelectedDeadline();
      message(`${candidateRows.length} jadwal kerja terlewat memerlukan konfirmasi sebelum batas waktunya.`);
    }else{
      $("absenceDeadlineText").textContent="-";
      message("Tidak ada ketidakhadiran yang perlu dikonfirmasi. Hari Libur, Cuti Tahunan, dan hari dengan presensi valid tidak dimasukkan.");
    }
    updateStats();
  }

  function showSelectedDeadline(){
    const row=candidateRows.find(item=>item.attendance_date===$("absenceDate").value)||candidateRows[0];
    if(!row)return;
    $("absenceDeadlineText").textContent=`Konfirmasi paling lambat ${dateTime(row.confirmation_deadline_at)} · ${remaining(row.confirmation_deadline_at)}.`;
  }

  async function loadMine(){
    myRows=await window.LDMWorkforce.myExplanations();
    $("absenceMine").innerHTML=myRows.length?myRows.map(row=>{
      const hasExplanation=Boolean(row.explanation);
      return `<article class="wf-item"><div class="wf-item-head"><div><h3>${esc(dateID(row.attendance_date))}</h3><small>${esc(row.shift_label||"-")} ${esc(time(row.planned_start_time))}-${esc(time(row.planned_end_time))}</small></div><span class="wf-tag ${esc(caseClass(row.case_status))}">${esc(caseLabel(row.case_status))}</span></div><div class="wf-tags"><span class="wf-tag">Batas: ${esc(dateTime(row.confirmation_deadline_at))}</span>${row.reason_category?`<span class="wf-tag">${esc(reasonLabel(row.reason_category))}</span>`:""}</div>${hasExplanation?`<p>${esc(row.explanation)}</p>`:"<p>Konfirmasi tidak dikirim sampai batas waktu. Catatan ini dinyatakan Tidak Hadir dan bukan Cuti atau Libur.</p>"}${row.review_note?`<p><strong>Catatan Owner:</strong> ${esc(row.review_note)}</p>`:""}</article>`;
    }).join(""):'<div class="wf-empty">Belum ada riwayat ketidakhadiran.</div>';
    updateStats();
  }

  async function submit(event){
    event.preventDefault();
    const button=$("absenceSubmit");
    button.disabled=true;
    try{
      await window.LDMWorkforce.submitExplanation({date:$("absenceDate").value,reason:$("absenceReason").value,explanation:$("absenceText").value});
      $("absenceText").value="";
      message("Konfirmasi ketidakhadiran berhasil dikirim sebelum batas waktu.","success");
      await Promise.all([loadCandidates(),loadMine()]);
      if(role()==="owner")await loadInbox();
      await refreshMenuState();
    }catch(error){message(error.message||String(error),"danger");await Promise.allSettled([loadCandidates(),loadMine(),refreshMenuState()]);}
    finally{button.disabled=!$("absenceDate").value;}
  }

  async function loadOwnerStores(){
    if(role()!=="owner")return;
    $("absenceOwnerInbox").hidden=false;
    ownerStores=await window.LDMWorkforce.stores();
    const select=$("absenceStore");
    const all=ownerStores.length>1?'<option value="">Semua cabang</option>':"";
    select.innerHTML=all+ownerStores.map(store=>`<option value="${esc(store.store_id)}">${esc(store.store_name)} (${esc(store.store_code)})${store.is_primary?" · Pusat":""}</option>`).join("");
    if(ownerStores.length===1){
      select.value=ownerStores[0].store_id;
      $("absenceScope").textContent="Cabang Ini";
    }else{
      $("absenceScope").textContent="Semua Cabang";
    }
    await loadInbox();
  }

  async function loadInbox(){
    if(role()!=="owner")return;
    const storeId=$("absenceStore").value||null;
    try{
      const rows=await window.LDMWorkforce.explanationInbox({storeId});
      $("absenceInbox").innerHTML=rows.length?rows.map(row=>{
        const status=caseLabel(row.case_status);
        const body=row.explanation
          ?`<p>${esc(row.explanation)}</p>`
          :row.case_status==="PENDING_CONFIRMATION"
            ?`<p>Belum ada konfirmasi dari karyawan. Deadline ${esc(dateTime(row.confirmation_deadline_at))}.</p>`
            :`<p>Tidak ada konfirmasi sampai deadline. Sistem menetapkan catatan ini sebagai Tidak Hadir.</p>`;
        const review=row.case_status==="EXPLANATION_SUBMITTED"&&row.explanation_id
          ?`<div class="wf-actions" style="margin-top:10px"><button class="wf-btn primary" type="button" data-review="${esc(row.explanation_id)}">Tandai Ditinjau</button></div>`:"";
        return `<article class="wf-item"><div class="wf-item-head"><div><h3>${esc(row.display_name||row.username)} · ${esc(row.store_name)}</h3><small>${esc(dateID(row.attendance_date))} · ${esc(row.shift_label||"-")} ${esc(time(row.planned_start_time))}-${esc(time(row.planned_end_time))}</small></div><span class="wf-tag ${esc(caseClass(row.case_status))}">${esc(status)}</span></div><div class="wf-tags"><span class="wf-tag">Deadline: ${esc(dateTime(row.confirmation_deadline_at))}</span><span class="wf-tag">${esc(roleLabel(row.role))}</span><span class="wf-tag">${esc(row.store_code)}</span>${row.reason_category?`<span class="wf-tag">${esc(reasonLabel(row.reason_category))}</span>`:""}</div>${body}${row.review_note?`<p><strong>Catatan review:</strong> ${esc(row.review_note)}</p>`:""}${review}</article>`;
      }).join(""):'<div class="wf-empty">Tidak ada kasus ketidakhadiran pada cakupan cabang ini.</div>';
      $("absenceInbox").querySelectorAll("[data-review]").forEach(button=>button.addEventListener("click",()=>review(button.dataset.review)));
    }catch(error){$("absenceInbox").innerHTML=`<div class="wf-notice danger">${esc(error.message||String(error))}</div>`;}
  }

  async function review(id){
    const note=window.prompt("Catatan review Owner (opsional):","");
    if(note===null)return;
    try{
      await window.LDMWorkforce.reviewExplanation({id,note});
      await Promise.all([loadInbox(),loadMine()]);
      await refreshMenuState();
    }catch(error){window.alert(error.message||String(error));}
  }

  let booting=false;
  let bound=false;
  let retryTimer=null;
  async function boot(){
    if(booting)return;
    if(!window.LDMWorkforce){scheduleRetry();return;}
    booting=true;
    try{
      await window.LDMWorkforce.context();
      if(!bound){
        $("absenceForm").addEventListener("submit",submit);
        $("absenceDate").addEventListener("change",showSelectedDeadline);
        $("absenceReload").addEventListener("click",loadInbox);
        $("absenceStore").addEventListener("change",()=>{loadInbox();$("absenceScope").textContent=$("absenceStore").value?"Cabang Dipilih":"Semua Cabang";});
        bound=true;
      }
      await Promise.all([loadCandidates(),loadMine()]);
      await loadOwnerStores();
      await refreshMenuState();
    }catch(error){
      message("Halaman Ketidakhadiran belum dapat dimuat. "+(error.message||String(error)),"danger");
      scheduleRetry();
    }finally{booting=false;}
  }
  function scheduleRetry(){
    if(retryTimer)return;
    retryTimer=window.setTimeout(()=>{retryTimer=null;boot();},900);
  }
  window.addEventListener("ldm-cloud-auth-ready",boot);
  window.addEventListener("online",boot);
  window.addEventListener("focus",()=>{if(!document.hidden)boot();});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
