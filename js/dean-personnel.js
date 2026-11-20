/* ==================================================================
   Dean · Member management. Two charts on top (members by role, heaviest
   teaching loads), then the members table in the shared card style with
   the icon toolbar (add, search, sort, direction, group by, export).
   Add Professor and Appoint Coordinator open as themed dialogs.
   ================================================================== */
const DeanPersonnel=(()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const read=key=>DB.read(key,[]);
  const NORMAL_LOAD=24;
  const initials=(first,last)=>`${String(first||'')[0]||''}${String(last||'')[0]||''}`.toUpperCase();
  async function api(path,body){const token=sessionStorage.getItem('serverSessionToken'),response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw new Error(data.error||'The personnel change was rejected.');return data;}
  function loadFor(id){const offerings=read('sectionSubjects').flatMap(record=>(record.assignments||[]).map(item=>({...item,sectionId:record.sectionId}))).filter(item=>item.facultyId===id);return offerings.reduce((sum,item)=>sum+(AcademicWorkflowService.unitRecord(item.subjectCode)?.units||0),0);}
  function people(){const appointed=read('coordinators'),ids=new Set(appointed.map(item=>item.id||item.username)),faculty=read('faculty'),facultyIds=new Set(faculty.map(p=>p.id));
    // Faculty Coordinators who are not also in the faculty records are listed too (no teaching load of their own).
    const coordinatorRows=appointed.filter(c=>!facultyIds.has(c.id||c.username)&&c.status!=='disabled'&&c.disabled!==true).map(c=>({id:c.id||c.username,first:c.first||'',last:c.last||c.username,program:c.program||c.college||'CICS',displayRole:'Faculty Coordinator',load:null}));
    return[...faculty.map(person=>({...person,displayRole:ids.has(person.id)?'Faculty Coordinator':'Professor',load:loadFor(person.id)})),...coordinatorRows];}

  function charts(rows){
    const P=typeof CoordinatorPages!=='undefined'?CoordinatorPages:null;if(!P)return'';
    const professors=rows.filter(p=>p.displayRole==='Professor').length,coordinators=rows.length-professors;
    const donut=P.donut([{label:'Professors',value:professors,color:'var(--role-shell-role)'},{label:'Faculty Coordinators',value:coordinators,color:'#2f8d83'}],'members');
    const top=rows.filter(p=>p.load!==null).slice().sort((a,b)=>b.load-a.load).slice(0,8).map(p=>({label:`${p.last}, ${p.first}`,pct:Math.min(100,p.load/NORMAL_LOAD*100),text:`${p.load}/${NORMAL_LOAD}`,tone:p.load>NORMAL_LOAD?'over':p.load>=NORMAL_LOAD*.9?'high':'',title:`${p.last}, ${p.first}: ${p.load} of ${NORMAL_LOAD} units`}));
    return P.insights(P.card('Members by role',`${rows.length} people in the college`,donut),P.card('Heaviest teaching loads',`Units against the normal load of ${NORMAL_LOAD}`,P.bars(top)));
  }

  function row(person){
    const pct=Math.min(100,person.load/NORMAL_LOAD*100),tone=person.load>NORMAL_LOAD?'over':person.load>=NORMAL_LOAD*.9?'high':'';
    const coordinator=person.displayRole==='Faculty Coordinator';
    return`<tr data-id="${esc(person.id)}"><td><span class="ck-person"><span class="ck-avatar">${esc(initials(person.first,person.last))}</span><span>${esc(`${person.last||''}, ${person.first||''}`)}</span></span></td><td>${esc(person.id)}</td><td><span class="dp-pill${coordinator?' gold':''}">${esc(person.displayRole)}</span></td><td>${esc(person.program||'CICS')}</td><td>${person.load===null?'<span class="dp-muted">No teaching load</span>':`<span class="dp-load">${person.load}/${NORMAL_LOAD} units</span><i class="ck-mini"><b class="${tone}" style="width:${pct}%"></b></i>`}</td><td>${coordinator?'<span class="dp-muted">Active appointment</span>':`<button type="button" class="dp-row-action" data-appoint="${esc(person.id)}">Appoint coordinator</button>`}</td></tr>`;
  }

  /* ---------- Members tabs: College members · Role assignments ---------- */
  let tab='members';
  const tabsNav=()=>{const n=(typeof RoleAccess!=='undefined'?RoleAccess.assignments().length:0);return`<nav class="dp-tabs" role="tablist" aria-label="Members"><button type="button" role="tab" data-dp-tab="members" class="${tab==='members'?'active':''}" aria-selected="${tab==='members'}">College members</button><button type="button" role="tab" data-dp-tab="roles" class="${tab==='roles'?'active':''}" aria-selected="${tab==='roles'}">Role assignments<span>${n}</span></button></nav>`;};
  function bindTabs(host){host.querySelectorAll('[data-dp-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.dpTab;render();});}
  function renderRoles(host){
    const RA=RoleAccess,list=RA.assignments().slice().sort((a,b)=>String(b.assignedAt).localeCompare(String(a.assignedAt)));
    const byRole=RA.roles().map(r=>[r.name,list.filter(a=>a.roleId===r.id).length,r.color]);
    const P=typeof CoordinatorPages!=='undefined'?CoordinatorPages:null;
    const charts=P?P.insights(P.card('Assignments by role',`${list.length} assignment${list.length===1?'':'s'}`,P.donut(byRole.filter(r=>r[1]).map(([label,value,color])=>({label,value,color})),'assigned')),P.card('How roles work','',`<ul class="dp-howto"><li><b>Administrator</b> defines roles and their permissions.</li><li><b>You</b> give a role to a person for one subject or all subjects.</li><li><b>Faculty Coordinators</b> can request a role for a Professor; it appears in Approvals.</li><li><b>Exam maker</b> lets a person create exams in that subject. <b>Intern</b> lets them view the Professor workspace without editing.</li></ul>`)):'';
    host.innerHTML=`${tabsNav()}${charts}<section class="dp-table-card"><header class="dp-table-head"><div><h3>Role assignments</h3><p>Who holds which role, and in which subject</p></div><div class="dp-tools" id="deanRoleTools"></div></header><div class="dp-table-scroll"><table class="dp-table" id="deanRoleTable"><thead><tr><th>Person</th><th>Role</th><th>Subject</th><th>Given by</th><th>Date</th><th>Action</th></tr></thead><tbody>${list.map(a=>{const r=RA.roleById(a.roleId),name=RA.nameOf(a.username);return`<tr data-ra="${esc(a.id)}"><td><span class="ck-person"><span class="ck-avatar">${esc(name.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase())}</span><span>${esc(name)}<small class="dp-muted"> · ${esc(a.username)}</small></span></span></td><td><span class="ra-pill" style="--c:${esc(r?.color||'#888')}">${esc(r?.name||a.roleId)}</span></td><td><span class="ra-subject">${esc(RA.subjectName(a.subjectCode))}</span></td><td>${esc(a.via==='request'?`${a.assignedBy} · approved request`:a.assignedBy)}</td><td>${esc(new Date(a.assignedAt).toLocaleDateString())}</td><td><button type="button" class="dp-row-action" data-ra-remove="${esc(a.id)}">Remove</button></td></tr>`;}).join('')||'<tr><td colspan="6" class="dp-muted">No roles assigned yet. Use + to give someone a role.</td></tr>'}</tbody></table></div></section><div id="deanPersonnelForm"></div>`;
    bindTabs(host);
    if(typeof AdminTableTools!=='undefined')AdminTableTools.mount('dean-roles',document.getElementById('deanRoleTable'),document.getElementById('deanRoleTools'),{exportName:'role-assignments',add:{label:'Assign a role',onClick:showAssign}});
    host.querySelectorAll('[data-ra-remove]').forEach(b=>b.onclick=async()=>{if(typeof confirmDialog==='function'&&!await confirmDialog({title:'Remove this role?',message:'The person loses the role in that subject right away.',confirmLabel:'Remove',danger:true}))return;RoleAccess.unassign(b.dataset.raRemove);notify('Role removed.','success');render();});
  }
  function showAssign(){
    const RA=RoleAccess,people=read('users').filter(u=>u.role!=='admin').map(u=>({id:u.username,name:RA.nameOf(u.username),role:u.role})),subjects=read('subjects');
    const roleLabel={faculty:'Professor',coordinator:'Faculty Coordinator',dean:'Dean',student:'Student'};
    dialog('Assign a role',`<label>Role<select name="roleId" required>${RA.roles().map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label><label>Subject<select name="subjectCode"><option value="*">All subjects</option>${subjects.map(s=>`<option value="${esc(s.code)}">${esc(s.code)} — ${esc(s.name)}</option>`).join('')}</select></label><label class="dp-wide">Person<input name="person" list="dpPeople" required placeholder="Type a name or ID"><datalist id="dpPeople">${people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(roleLabel[p.role]||p.role)}</option>`).join('')}</datalist></label>`,'Any account can hold any role. The role applies only in the chosen subject (or every subject).','Assign role',async values=>{const person=people.find(p=>p.id===values.person.trim()||p.name.toLowerCase()===values.person.trim().toLowerCase());if(!person)throw new Error('Pick a person from the list.');RA.assign({username:person.id,roleId:values.roleId,subjectCode:values.subjectCode});document.getElementById('deanPersonnelForm').innerHTML='';notify(`${person.name} now has the ${RA.roleById(values.roleId)?.name} role.`,'success');render();});
  }

  function render(){
    const host=document.getElementById('deanPersonnelRoot');if(!host)return;
    host.closest('section')?.classList.add('dp-page');
    if(tab==='roles'&&typeof RoleAccess!=='undefined')return renderRoles(host);
    const rows=people();
    host.innerHTML=`${typeof RoleAccess!=='undefined'?tabsNav():''}${charts(rows)}<section class="dp-table-card"><header class="dp-table-head"><div><h3>College members</h3><p>${rows.filter(p=>p.displayRole==='Professor').length} Professors · ${rows.filter(p=>p.displayRole!=='Professor').length} Faculty Coordinators</p></div><div class="dp-tools" id="deanPersonnelTools"></div></header><div class="dp-table-scroll"><table class="dp-table" id="deanPersonnelTable"><thead><tr><th>Name</th><th>ID</th><th>Role</th><th>Program</th><th>Load</th><th>Action</th></tr></thead><tbody>${rows.map(row).join('')||'<tr><td colspan="6" class="dp-muted">No personnel yet.</td></tr>'}</tbody></table></div></section><div id="deanPersonnelForm"></div>`;
    if(typeof AdminTableTools!=='undefined')AdminTableTools.mount('dean-members',document.getElementById('deanPersonnelTable'),document.getElementById('deanPersonnelTools'),{exportName:'college-members',add:{label:'Add Professor',onClick:showHire}});
    host.querySelectorAll('[data-appoint]').forEach(button=>button.onclick=event=>{event.stopPropagation();showAppointment(button.dataset.appoint);});
    bindTabs(host);
  }

  /* ---------- dialogs (themed prompt look) ---------- */
  function dialog(title,fields,note,submit,onSubmit){
    const holder=document.getElementById('deanPersonnelForm');if(!holder)return;
    holder.innerHTML=`<div class="modal-bg confirm-bg dp-dialog" style="display:flex" role="dialog" aria-modal="true" aria-label="${esc(title)}"><form class="confirm-box dp-form"><h3>${esc(title)}</h3><div class="dp-form-grid">${fields}</div>${note?`<p class="dp-form-note">${esc(note)}</p>`:''}<div class="confirm-actions"><button type="button" class="confirm-cancel" data-cancel>Cancel</button><button type="submit" class="confirm-ok">${esc(submit)}</button></div></form></div>`;
    const form=holder.querySelector('form'),close=()=>{holder.innerHTML='';};
    form.querySelector('[data-cancel]').onclick=close;
    holder.querySelector('.dp-dialog').addEventListener('click',event=>{if(event.target.classList.contains('dp-dialog'))close();});
    form.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    form.onsubmit=async event=>{event.preventDefault();try{await onSubmit(Object.fromEntries(new FormData(form)));}catch(error){notify(error.message,'error');}};
    form.querySelector('input')?.focus();
  }
  const today=()=>new Date().toISOString().slice(0,10);
  function showHire(){
    dialog('Add Professor',`<label>Institutional ID<input name="username" required></label><label>Program<input name="program" required value="BSCS"></label><label>First name<input name="first" required></label><label>Last name<input name="last" required></label><label>Initial password<input name="password" type="password" minlength="8" required></label><label>Effective date<input name="effectiveDate" type="date" required value="${today()}"></label>`,'','Create Professor',async values=>{await api('/api/personnel/professors',values);await refresh('Professor account created.');});
  }
  function showAppointment(id){
    const person=read('faculty').find(item=>item.id===id);
    dialog(`Appoint ${person?.first||id} as Faculty Coordinator`,`<label>Program responsibility<input name="program" required value="${esc(person?.program||'BSCS')}"></label><label>Effective date<input name="effectiveDate" type="date" required value="${today()}"></label>`,'The server enforces the appointment authority configured by the Administrator.','Confirm appointment',async values=>{await api(`/api/personnel/${encodeURIComponent(id)}/appoint-coordinator`,values);await refresh('Faculty Coordinator appointed.');});
  }
  async function refresh(message){if(typeof sqliteBootstrap==='function')sqliteBootstrap();notify(message,'success');render();}
  return{render,showHire,showAppointment,showAssign,tab:t=>{tab=t;render();}};
})();
if(typeof window!=='undefined')window.DeanPersonnel=DeanPersonnel;
