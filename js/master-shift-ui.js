(function(){
  "use strict";
  const $=id=>document.getElementById(id);
  const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const role=()=>String(localStorage.getItem("userRole")||localStorage.getItem("role")||"").trim().toLowerCase();
  const nowParts=()=>{
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Makassar",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    return Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  };
  const monthNow=()=>{const p=nowParts();return `${p.year}-${p.month}`;};
  const dayName=date=>new Intl.DateTimeFormat("id-ID",{weekday:"short",day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(`${date}T00:00:00Z`));
  const formatWindow=minutes=>{
    const value=Math.max(30,Number(minutes)||1440);
    if(value%1440===0)return `${value/1440} hari`;
    const hours=value/60;
    return `${Number.isInteger(hours)?hours:Number(hours.toFixed(1))} jam`;
  };

  let stores=[];
  let accounts=[];
  let selectedAccount=null;
  let scheduleRows=[];
  let requestId=0;

  function notify(text,type=""){
    const box=$("masterMessage");
    if(!box)return;
    box.className=`wf-notice ${type}`.trim();
    box.textContent=text;
  }

  function deny(){
    document.body.innerHTML='<main class="wf-shell wf-access-denied"><section class="wf-card"><h2>🔒 Akses Owner Diperlukan</h2><p>Master Shift hanya dapat dibuka oleh role Owner.</p><a class="wf-link-btn soft" href="dashboard.html">Kembali ke Dashboard</a></section></main>';
  }

  function daysInMonth(month){
    const [year,monthNumber]=String(month||"").split("-").map(Number);
    return year&&monthNumber?new Date(Date.UTC(year,monthNumber,0)).getUTCDate():0;
  }

  function rowDefault(date,status="OFF",shift="Shift 1",start="08:00",end="16:00",grace=30,note=""){
    return {date,status,shift:status==="WORK"?shift:null,start:status==="WORK"?start:null,end:status==="WORK"?end:null,grace:Number(grace)||0,note:note||""};
  }

  function updateStats(){
    const work=scheduleRows.filter(r=>r.status==="WORK").length;
    const off=scheduleRows.filter(r=>r.status==="OFF").length;
    const leave=scheduleRows.filter(r=>r.status==="ANNUAL_LEAVE").length;
    $("statWork").textContent=work;
    $("statOff").textContent=off;
    $("statLeave").textContent=leave;
    $("statLeaveRight").textContent=Number(selectedAccount?.entitled_days)||0;
    $("statLeaveRemain").textContent=Number(selectedAccount?.remaining_leave_days)||0;
  }

  function renderRows(){
    const body=$("masterScheduleBody");
    if(!scheduleRows.length){
      body.innerHTML='<tr><td colspan="5">Belum ada jadwal. Gunakan Template Cepat untuk membuat jadwal satu bulan.</td></tr>';
      updateStats();
      return;
    }
    body.innerHTML=scheduleRows.map((row,index)=>{
      const work=row.status==="WORK";
      const cls=row.status==="OFF"?"is-off":row.status==="ANNUAL_LEAVE"?"is-leave":"";
      return `<tr class="${cls}" data-row="${index}">
        <td class="wf-date"><strong>${esc(String(row.date).slice(8,10))}</strong><small>${esc(dayName(row.date))}</small></td>
        <td><select data-field="status"><option value="WORK" ${row.status==="WORK"?"selected":""}>Kerja</option><option value="OFF" ${row.status==="OFF"?"selected":""}>Libur</option><option value="ANNUAL_LEAVE" ${row.status==="ANNUAL_LEAVE"?"selected":""}>Cuti Tahunan</option></select></td>
        <td><select data-field="shift" ${work?"":"disabled"}><option ${row.shift==="Shift 1"?"selected":""}>Shift 1</option><option ${row.shift==="Shift 2"?"selected":""}>Shift 2</option><option ${row.shift==="Full Day"?"selected":""}>Full Day</option></select></td>
        <td><div class="wf-time-pair"><input data-field="start" type="time" value="${esc(row.start||"")}" ${work?"":"disabled"}><span>–</span><input data-field="end" type="time" value="${esc(row.end||"")}" ${work?"":"disabled"}></div></td>
        <td><input data-field="note" maxlength="180" value="${esc(row.note||"")}" placeholder="Opsional"></td>
      </tr>`;
    }).join("");

    body.querySelectorAll("tr[data-row]").forEach(tr=>{
      const index=Number(tr.dataset.row);
      tr.querySelectorAll("[data-field]").forEach(input=>input.addEventListener("change",()=>{
        const field=input.dataset.field;
        scheduleRows[index][field]=input.value;
        if(field==="status"){
          if(input.value!=="WORK"){
            scheduleRows[index].shift=null;
            scheduleRows[index].start=null;
            scheduleRows[index].end=null;
          }else{
            scheduleRows[index].shift=scheduleRows[index].shift||$("masterTemplateShift").value;
            scheduleRows[index].start=scheduleRows[index].start||$("masterTemplateStart").value;
            scheduleRows[index].end=scheduleRows[index].end||$("masterTemplateEnd").value;
            scheduleRows[index].grace=Number($("masterTemplateGrace").value)||30;
          }
          renderRows();
        }else{
          updateStats();
        }
      }));
    });
    updateStats();
  }

  function syncAbsenceUnitLimits(convert=false){
    const unit=$("masterAbsenceUnit").value;
    const input=$("masterAbsenceWindow");
    const previous=input.dataset.unit||unit;
    let value=Number(input.value);
    if(convert&&previous!==unit){
      if(previous==="days"&&unit==="hours")value=(Number.isFinite(value)?value:1)*24;
      if(previous==="hours"&&unit==="days")value=Math.ceil((Number.isFinite(value)?value:24)/24);
    }
    if(unit==="days"){
      input.min="1"; input.max="7"; input.step="1";
      input.value=String(Math.max(1,Math.min(7,Math.round(value)||1)));
    }else{
      input.min="0.5"; input.max="168"; input.step="0.5";
      input.value=String(Math.max(0.5,Math.min(168,Number.isFinite(value)?value:24)));
    }
    input.dataset.unit=unit;
  }

  async function loadAbsencePolicy(){
    const box=$("masterAbsenceInfo");
    const storeId=$("masterStore").value;
    if(!storeId||!box)return;
    box.className="wf-notice";
    box.textContent="Memuat batas konfirmasi...";
    try{
      const data=await window.LDMWorkforce.absenceSettings({storeId});
      const minutes=Math.max(30,Number(data.confirmation_window_minutes)||1440);
      if(minutes%1440===0){
        $("masterAbsenceUnit").value="days";
        $("masterAbsenceWindow").value=String(minutes/1440);
      }else{
        $("masterAbsenceUnit").value="hours";
        $("masterAbsenceWindow").value=String(Number((minutes/60).toFixed(1)));
      }
      $("masterAbsenceWindow").dataset.unit=$("masterAbsenceUnit").value;
      syncAbsenceUnitLimits();
      const store=stores.find(item=>item.store_id===storeId);
      box.textContent=`Aktif${store?` untuk ${store.store_name}`:""}: ${formatWindow(minutes)} setelah jam masuk + toleransi.`;
    }catch(error){
      box.className="wf-notice danger";
      box.textContent="Batas konfirmasi belum dapat dimuat. "+(error.message||String(error));
    }
  }

  async function saveAbsencePolicy(event){
    event.preventDefault();
    const storeId=$("masterStore").value;
    if(!storeId)return;
    const unit=$("masterAbsenceUnit").value;
    const value=Number($("masterAbsenceWindow").value);
    const box=$("masterAbsenceInfo");
    const valid=unit==="days"
      ? Number.isInteger(value)&&value>=1&&value<=7
      : Number.isFinite(value)&&value>=0.5&&value<=168;
    if(!valid){
      box.className="wf-notice danger";
      box.textContent=unit==="days"?"Batas hari harus 1 sampai 7 hari.":"Batas jam harus 0,5 sampai 168 jam.";
      return;
    }
    const minutes=Math.round(value*(unit==="days"?1440:60));
    const button=$("masterAbsenceSave");
    button.disabled=true;
    try{
      const result=await window.LDMWorkforce.updateAbsenceSettings({
        storeId,minutes,applyToOpen:$("masterAbsenceApplyOpen").checked
      });
      box.className="wf-notice success";
      box.textContent=result?.applied_to_open
        ?`Disimpan: ${formatWindow(minutes)}. ${Number(result.open_cases_updated)||0} kasus yang masih menunggu ikut diperbarui.`
        :`Disimpan: ${formatWindow(minutes)}. Berlaku untuk kasus baru; kasus yang sudah menunggu tetap memakai deadline sebelumnya.`;
      $("masterAbsenceApplyOpen").checked=false;
    }catch(error){
      box.className="wf-notice danger";
      box.textContent=error.message||String(error);
    }finally{button.disabled=false;}
  }

  async function loadStores(){
    stores=await window.LDMWorkforce.stores();
    const select=$("masterStore");
    select.innerHTML=stores.map(store=>`<option value="${esc(store.store_id)}">${esc(store.store_name)} (${esc(store.store_code)})${store.is_primary?" · Pusat":""}</option>`).join("");
    const current=localStorage.getItem("ldmCloudStoreId");
    if(current&&stores.some(store=>store.store_id===current))select.value=current;
    await Promise.all([loadAccounts(),loadAbsencePolicy()]);
  }

  async function loadAccounts(preferredUserId=""){
    const storeId=$("masterStore").value;
    if(!storeId)return;
    const year=Number(String($("masterMonth").value||monthNow()).slice(0,4));
    $("masterLeaveYear").value=String(year);
    accounts=await window.LDMWorkforce.accounts({storeId,year});
    const select=$("masterUser");
    select.innerHTML=accounts.map(account=>`<option value="${esc(account.user_id)}">${esc(account.display_name||account.username)} · ${esc(account.role)}${account.is_primary_owner?" · Owner Pusat":""}</option>`).join("");
    if(preferredUserId&&accounts.some(account=>account.user_id===preferredUserId))select.value=preferredUserId;
    await selectAccount(true);
  }

  async function selectAccount(loadSchedule=true){
    selectedAccount=accounts.find(account=>account.user_id===$("masterUser").value)||null;
    if(!selectedAccount){
      scheduleRows=[];
      renderRows();
      $("masterLeaveSummary").textContent="Tidak ada akun aktif pada cabang ini.";
      return;
    }
    $("masterLeaveDays").value=Number(selectedAccount.entitled_days)||0;
    $("masterLeaveSummary").textContent=`Hak ${Number(selectedAccount.entitled_days)||0} hari · terpakai ${Number(selectedAccount.used_leave_days)||0} hari · sisa ${Number(selectedAccount.remaining_leave_days)||0} hari.`;
    $("masterClear").hidden=!selectedAccount.is_primary_owner;
    updateStats();
    notify(selectedAccount.is_primary_owner?"Jadwal akun Owner Pusat bersifat opsional. Bila diisi, aturan shift tetap diberlakukan.":"Jadwal akun ini wajib lengkap untuk seluruh tanggal pada bulan yang dipilih.",selectedAccount.is_primary_owner?"warning":"");
    if(loadSchedule)await loadScheduleMonth();
  }

  async function loadScheduleMonth(){
    if(!selectedAccount)return;
    const currentRequest=++requestId;
    try{
      const rows=await window.LDMWorkforce.scheduleMonth({storeId:$("masterStore").value,userId:selectedAccount.user_id,month:$("masterMonth").value});
      if(currentRequest!==requestId)return;
      scheduleRows=rows.map(row=>({
        date:row.schedule_date,status:row.schedule_status,shift:row.shift_label,
        start:row.planned_start_time?String(row.planned_start_time).slice(0,5):null,
        end:row.planned_end_time?String(row.planned_end_time).slice(0,5):null,
        grace:Number(row.grace_minutes)||30,note:row.note||""
      }));
      renderRows();
      notify(scheduleRows.length?`Jadwal ${scheduleRows.length} tanggal berhasil dimuat.`:(selectedAccount.is_primary_owner?"Belum ada jadwal. Untuk Owner Pusat ini diperbolehkan.":"Belum ada jadwal. Gunakan Template Cepat lalu simpan."),scheduleRows.length?"success":"warning");
    }catch(error){notify(error.message||String(error),"danger");}
  }

  function applyTemplate(){
    if(!selectedAccount){notify("Pilih akun terlebih dahulu.","danger");return;}
    const month=$("masterMonth").value;
    const start=$("masterTemplateStart").value;
    const end=$("masterTemplateEnd").value;
    if(!month||!start||!end){notify("Bulan, jam masuk, dan jam keluar wajib diisi.","danger");return;}
    const checked=new Set([...$("masterWeekdays").querySelectorAll('input[type="checkbox"]:checked')].map(input=>Number(input.value)));
    const shift=$("masterTemplateShift").value;
    const grace=Number($("masterTemplateGrace").value)||0;
    const total=daysInMonth(month);
    scheduleRows=[];
    for(let day=1;day<=total;day++){
      const date=`${month}-${String(day).padStart(2,"0")}`;
      const weekDay=new Date(`${date}T00:00:00Z`).getUTCDay();
      scheduleRows.push(rowDefault(date,checked.has(weekDay)?"WORK":"OFF",shift,start,end,grace,""));
    }
    renderRows();
    notify("Template selesai dibuat. Ubah tanggal khusus bila ada Libur atau Cuti, lalu Simpan Jadwal Bulan.","success");
  }

  function payloadRows(){
    return scheduleRows.map(row=>({
      date:row.date,status:row.status,
      shift:row.status==="WORK"?row.shift:null,
      start:row.status==="WORK"?row.start:null,
      end:row.status==="WORK"?row.end:null,
      grace:row.status==="WORK"?Number(row.grace)||Number($("masterTemplateGrace").value)||0:0,
      note:row.note||""
    }));
  }

  async function saveSchedule(){
    if(!selectedAccount)return;
    const expected=daysInMonth($("masterMonth").value);
    if(!selectedAccount.is_primary_owner&&scheduleRows.length!==expected){notify(`Jadwal wajib lengkap ${expected} tanggal untuk bulan ini.`,"danger");return;}
    const invalid=scheduleRows.find(row=>row.status==="WORK"&&(!row.shift||!row.start||!row.end));
    if(invalid){notify(`Tanggal ${invalid.date}: shift, jam masuk, dan jam keluar wajib lengkap.`,"danger");return;}
    const button=$("masterSave");button.disabled=true;
    try{
      const result=await window.LDMWorkforce.saveMonth({storeId:$("masterStore").value,userId:selectedAccount.user_id,month:$("masterMonth").value,rows:payloadRows()});
      notify(`Jadwal tersimpan: ${result.rows} tanggal. Sisa cuti tahunan ${result.leave_remaining} hari.`,"success");
      await loadAccounts(selectedAccount.user_id);
    }catch(error){notify(error.message||String(error),"danger");}
    finally{button.disabled=false;}
  }

  async function saveLeave(){
    if(!selectedAccount)return;
    const button=$("masterSaveLeave");button.disabled=true;
    try{
      const result=await window.LDMWorkforce.setLeaveEntitlement({storeId:$("masterStore").value,userId:selectedAccount.user_id,year:Number($("masterLeaveYear").value),days:Number($("masterLeaveDays").value)});
      notify(`Hak cuti disimpan: ${result.entitled_days} hari · terpakai ${result.used_days} · sisa ${result.remaining_days}.`,"success");
      await loadAccounts(selectedAccount.user_id);
    }catch(error){notify(error.message||String(error),"danger");}
    finally{button.disabled=false;}
  }

  async function clearSchedule(){
    if(!selectedAccount?.is_primary_owner)return;
    if(!window.confirm("Kosongkan jadwal akun Owner Pusat untuk bulan ini?"))return;
    try{
      await window.LDMWorkforce.saveMonth({storeId:$("masterStore").value,userId:selectedAccount.user_id,month:$("masterMonth").value,rows:[]});
      scheduleRows=[];renderRows();notify("Jadwal Owner Pusat dikosongkan untuk bulan ini.","success");
    }catch(error){notify(error.message||String(error),"danger");}
  }

  function bind(){
    $("masterStore").addEventListener("change",()=>Promise.all([loadAccounts(),loadAbsencePolicy()]).catch(error=>notify(error.message||String(error),"danger")));
    $("masterMonth").addEventListener("change",()=>loadAccounts(selectedAccount?.user_id||"").catch(error=>notify(error.message||String(error),"danger")));
    $("masterUser").addEventListener("change",()=>selectAccount(true));
    $("masterReload").addEventListener("click",()=>loadStores().catch(error=>notify(error.message||String(error),"danger")));
    $("masterAbsenceUnit").addEventListener("change",()=>syncAbsenceUnitLimits(true));
    $("masterAbsencePolicyForm").addEventListener("submit",saveAbsencePolicy);
    $("masterApplyTemplate").addEventListener("click",applyTemplate);
    $("masterSave").addEventListener("click",saveSchedule);
    $("masterSaveLeave").addEventListener("click",saveLeave);
    $("masterClear").addEventListener("click",clearSchedule);
  }

  let booting=false;
  let bound=false;
  let retryTimer=null;
  async function boot(){
    if(booting)return;
    if(!window.LDMWorkforce){ scheduleRetry(); return; }
    booting=true;
    $("masterMonth").value=$("masterMonth").value||monthNow();
    $("masterLeaveYear").value=$("masterLeaveYear").value||monthNow().slice(0,4);
    try{
      await window.LDMWorkforce.context();
      if(role()!=="owner"){deny();return;}
      if(!bound){bind();bound=true;}
      await loadStores();
    }catch(error){
      if(/OWNER_REQUIRED|FORBIDDEN|role Owner/i.test(String(error?.message||error))){deny();return;}
      notify("Master Shift belum dapat dimuat. "+(error.message||String(error)),"danger");
      scheduleRetry();
    }finally{booting=false;}
  }
  function scheduleRetry(){
    if(retryTimer)return;
    retryTimer=window.setTimeout(()=>{retryTimer=null;boot();},900);
  }
  window.addEventListener("ldm-cloud-auth-ready",boot);
  window.addEventListener("online",boot);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
