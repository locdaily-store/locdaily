(function(){
  "use strict";

  function client(){
    if(!window.LDMSupabase || typeof window.LDMSupabase.createClient!=="function"){
      throw new Error("Layanan Cloud belum siap.");
    }
    return window.LDMSupabase.createClient();
  }

  async function requireAction(permissionCode){
    const service=window.LDMEmployeePermissions;
    if(service&&typeof service.requirePermission==="function"){
      await service.requirePermission(permissionCode);
    }
  }

  async function auth(){
    if(!window.LDMCloudSession || typeof window.LDMCloudSession.ensureAuthenticated!=="function"){
      throw new Error("Cloud Session belum tersedia.");
    }
    return window.LDMCloudSession.ensureAuthenticated({registerDevice:false});
  }

  async function rpc(name,args={}){
    await auth();
    const {data,error}=await client().rpc(name,args);
    if(error)throw error;
    return data;
  }

  function one(data){
    return Array.isArray(data)?(data[0]||null):(data||null);
  }

  async function stores(){
    const data=await rpc("ldm_workforce_stores");
    return Array.isArray(data)?data:[];
  }

  async function accounts({storeId,year}={}){
    if(!storeId)throw new Error("Cabang wajib dipilih.");
    const data=await rpc("ldm_workforce_accounts",{
      p_store_id:storeId,
      p_year:Number(year)||new Date().getFullYear()
    });
    return Array.isArray(data)?data:[];
  }

  async function scheduleMonth({storeId,userId,month}={}){
    if(!storeId||!userId||!month)throw new Error("Cabang, akun, dan bulan wajib dipilih.");
    const data=await rpc("ldm_workforce_schedule_month",{
      p_store_id:storeId,
      p_user_id:userId,
      p_month:`${String(month).slice(0,7)}-01`
    });
    return Array.isArray(data)?data:[];
  }

  async function saveMonth({storeId,userId,month,rows}={}){
    await requireAction("master_shift.schedule.manage");
    if(!storeId||!userId||!month)throw new Error("Cabang, akun, dan bulan wajib dipilih.");
    return rpc("ldm_workforce_save_month_schedule",{
      p_store_id:storeId,
      p_user_id:userId,
      p_month:`${String(month).slice(0,7)}-01`,
      p_rows:Array.isArray(rows)?rows:[]
    });
  }

  async function setLeaveEntitlement({storeId,userId,year,days,note=""}={}){
    await requireAction("master_shift.leave.manage");
    return rpc("ldm_workforce_set_leave_entitlement",{
      p_store_id:storeId,
      p_user_id:userId,
      p_year:Number(year),
      p_entitled_days:Number(days),
      p_note:String(note||"").trim()||null
    });
  }

  async function scheduleForUser({userId,date}={}){
    if(!userId||!date)throw new Error("User dan tanggal jadwal wajib tersedia.");
    const context=await auth();
    const storeId=String(context?.profile?.store_id||"").trim();
    if(!storeId)throw new Error("Store ID sesi Absensi belum tersedia.");
    const {data,error}=await client().rpc("ldm_attendance_schedule_rule_v28182",{
      p_store_id:storeId,
      p_target_user_id:userId,
      p_date:date
    });
    if(error)throw error;
    return one(data)||{};
  }

  async function expectedStatus({storeId,date}={}){
    if(!storeId||!date)throw new Error("Cabang dan tanggal wajib tersedia.");
    const data=await rpc("ldm_workforce_expected_status",{
      p_store_id:storeId,
      p_date:date
    });
    return Array.isArray(data)?data:[];
  }

  async function menuState(){
    return one(await rpc("ldm_attendance_menu_state"))||{};
  }

  async function explanationCandidates(days=62){
    const data=await rpc("ldm_attendance_confirmation_candidates_v2",{p_days:Number(days)||62});
    return Array.isArray(data)?data:[];
  }

  async function submitExplanation({date,reason,explanation}={}){
    await requireAction("absence.confirm");
    return rpc("ldm_attendance_submit_explanation_v2",{
      p_attendance_date:date,
      p_reason_category:reason,
      p_explanation:String(explanation||"").trim()
    });
  }

  async function myExplanations(){
    const data=await rpc("ldm_attendance_my_absence_cases");
    return Array.isArray(data)?data:[];
  }

  async function explanationInbox({storeId=null}={}){
    const data=await rpc("ldm_attendance_absence_inbox",{p_store_id:storeId||null});
    return Array.isArray(data)?data:[];
  }

  async function absenceSettings({storeId=null}={}){
    return one(await rpc("ldm_attendance_absence_settings",{p_store_id:storeId||null}))||{};
  }

  async function updateAbsenceSettings({storeId=null,minutes,applyToOpen=false}={}){
    await requireAction("master_shift.absence_deadline.manage");
    return rpc("ldm_attendance_update_absence_settings",{
      p_store_id:storeId||null,
      p_confirmation_window_minutes:Number(minutes),
      p_apply_to_open:Boolean(applyToOpen)
    });
  }

  async function reviewExplanation({id,note=""}={}){
    await requireAction("absence.review");
    return rpc("ldm_attendance_review_explanation_v2",{
      p_explanation_id:id,
      p_review_note:String(note||"").trim()||null
    });
  }

  async function context(){
    return auth();
  }

  window.LDMWorkforce=Object.freeze({
    context,stores,accounts,scheduleMonth,saveMonth,setLeaveEntitlement,
    scheduleForUser,expectedStatus,menuState,explanationCandidates,submitExplanation,
    myExplanations,explanationInbox,absenceSettings,updateAbsenceSettings,reviewExplanation
  });
})();
