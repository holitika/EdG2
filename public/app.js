(function(){
'use strict';

/* ---------- Estado global ---------- */
const LSK='edg-code', LSS='edg-session', LSTAB='edg-tab', LSDEV='edg-device';
let T=null, CFG=null, CODE=null, PROMPT='';
let RAMOS,ORDER,SECS,EXAMS,QD,PNUM,PDF,RESERVED,CLASSES,MISSING,CLSLABEL;
let PLAN=[],PMAP={},QPLAN={},CPLAN={},TOTAL_TASKS=0,PHASES=[],START='',EXAM_DAY='',LAST_STUDY='',NSESS=0;
const state={classes:{},exams:{},tasks:{}};
const SAVEKEYS=['classes','exams','tasks'];
let mode='loading', saveErr=false, authLost=false;
const timers={}, writing={}, dirty={};
let tab='cal', filter='ALL', openKey=null, editing=false;

/* ---------- Utilidades ---------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DOW=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DOWS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MON=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MONL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const pd=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d);};
const fk=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const short=s=>{const d=pd(s);return d.getDate()+' '+MON[d.getMonth()];};
const longD=s=>{const d=pd(s);return DOW[d.getDay()]+' '+d.getDate()+' de '+MONL[d.getMonth()];};
const exLabel=id=>{const [y,m]=id.split('-');return ({'01':'enero','03':'marzo','08':'agosto'})[m]+' '+y;};
const todayKey=()=>fk(new Date());
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function lsDel(k){try{localStorage.removeItem(k);}catch(e){}}
function show(id){['gate','setup','app'].forEach(x=>{$(x).hidden=x!==id;});window.scrollTo({top:0});}
function deviceId(){
  let d=lsGet(LSDEV);
  if(!d||!/^[A-Za-z0-9-]{8,64}$/.test(d)){
    d=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():('d'+Date.now().toString(36)+Math.random().toString(36).slice(2,12));
    lsSet(LSDEV,d);
  }
  return d;
}
async function api(path,body){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({},body,{device:deviceId()}))});
  return r;
}

/* ---------- Generador de plan ---------- */
function normCfg(c){
  const days=(Array.isArray(c.days)&&c.days.length?c.days:[1,2,3,4,5]).map(Number);
  let rec=c.recovery; rec=(rec===null||rec===undefined||rec==='')?null:Number(rec);
  if(rec!==null&&days.includes(rec))rec=null;
  return {start:c.start,exam:c.exam,days:[...new Set(days)].sort((a,b)=>a-b),breaks:(c.breaks||[]).filter(b=>b&&b.from&&b.to),recovery:rec,name:c.name||''};
}
function inBreak(cfg,s){return cfg.breaks.find(b=>s>=b.from&&s<=b.to);}
function availDays(cfg){
  const set=new Set(cfg.days), out=[], last=fk(addD(pd(cfg.exam),-6));
  for(let d=pd(cfg.start);fk(d)<=last;d=addD(d,1)){const s=fk(d);if(set.has(d.getDay())&&!inBreak(cfg,s))out.push(s);}
  return out;
}
function cloneDays(){
  return T.DAYS.map(x=>{
    let n=0;
    const tasks=x.tasks.map(t=>{
      const o=JSON.parse(JSON.stringify(t));
      if(o.k==='clase')o.id='s-'+o.code;
      else if(['materia','extra','tarea','correccion'].includes(o.k)){n++;o.id='d'+x.i+'_'+o.k.charAt(0)+n;}
      return o;
    });
    return {i:x.i,p:x.p,h:x.h,tasks};
  });
}
function compress(days,target){
  const MAXH=7.5;
  while(days.length>target){
    let best=-1,bh=1e9;
    for(let i=0;i<days.length-1;i++){
      if(days[i].p!==1||days[i+1].p!==1)continue;
      const h=days[i].h+days[i+1].h;
      if(h<=MAXH&&h<bh){bh=h;best=i;}
    }
    if(best<0)return false;
    const a=days[best],b=days[best+1];
    days.splice(best,2,{i:a.i,p:1,h:a.h+b.h,tasks:[...a.tasks,...b.tasks]});
  }
  return true;
}
function buildPlan(cfg){
  const avail=availDays(cfg);
  const days=cloneDays();
  const total=days.length;
  if(days.length>avail.length&&!compress(days,avail.length)){
    const probe=cloneDays(); compress(probe,0);
    return {ok:false,avail:avail.length,need:probe.length,total};
  }
  const p1=days.filter(d=>d.p===1), rest=days.filter(d=>d.p!==1);
  const res=[];
  p1.forEach((d,i)=>res.push(Object.assign({},d,{date:avail[i]})));
  const tail=avail.slice(avail.length-rest.length);
  rest.forEach((d,i)=>res.push(Object.assign({},d,{date:tail[i]})));
  res.sort((a,b)=>a.date<b.date?-1:1);
  return {ok:true,plan:res,avail:avail.length,total,merged:total-days.length,slack:avail.length-days.length};
}

/* ---------- Aplicar configuración ---------- */
function applyConfig(cfg){
  CFG=normCfg(cfg);
  const r=buildPlan(CFG);
  if(!r.ok)return r;
  PLAN=r.plan; PMAP={}; QPLAN={}; CPLAN={}; TOTAL_TASKS=0; NSESS=0;
  START=CFG.start; EXAM_DAY=CFG.exam; LAST_STUDY=fk(addD(pd(CFG.exam),-6));
  PLAN.forEach(day=>{
    PMAP[day.date]=day;
    day.tasks.forEach(t=>{
      if(t.k==='h')return;
      TOTAL_TASKS++;
      if(t.k==='clase')NSESS++;
      if(t.k==='resolver'||t.k==='leer'){const key=t.e+'_'+t.r;if(!QPLAN[key])QPLAN[key]={role:t.k==='leer'?'Leer':'Resolver',date:day.date};}
      if(t.k==='simulacro'){ORDER.forEach(r2=>{QPLAN[t.e+'_'+r2]={role:'Simulacro '+t.n,date:day.date};});}
      (t.c||[]).forEach(c=>{if(!CPLAN[c])CPLAN[c]={date:day.date,code:t.code||''};});
    });
  });
  const firstOf={}; PLAN.forEach(d=>{if(!firstOf[d.p])firstOf[d.p]=d.date;});
  const lastOf={}; PLAN.forEach(d=>{lastOf[d.p]=d.date;});
  const ps=[1,2,3,4].filter(n=>firstOf[n]);
  const nSim=PLAN.reduce((a,d)=>a+d.tasks.filter(t=>t.k==='simulacro').length,0);
  const recTxt=CFG.recovery!==null?'El '+DOW[CFG.recovery]+' es para recuperar lo atrasado, o para adelantar si vas al día.':'';
  const txt={
    1:NSESS+' sesiones, cada ramo en el orden de su temario. En cada sesión estudias los temas que indica el plan con tu IA y la carpeta de estudio, y resuelves las preguntas de exámenes anteriores asignadas. Para empezar, pídele a tu IA, por ejemplo: «Sesión DE 1». '+recTxt,
    2:'Un examen completo para ver dónde estás y después secciones con cronómetro: 2 preguntas, 30 minutos y 2 carillas cada una, y corrección con la pauta. Son días intensos de 6 a 7 horas: bloques entre secciones y un repaso intensivo de cada ramo.',
    3:nSim+' exámenes completos en 3 horas: una sección por hora y calculadora no programable, con corrección el mismo día. Una sección cuenta como aprobada solo si pasan sus dos preguntas. Los otros días: refuerzo de la sección más débil y más práctica.',
    4:'Sin preguntas nuevas: repaso de errores, fórmulas y conceptos clave. Los últimos 5 días antes del examen no estudias.'
  };
  const names={1:'Sesiones de estudio',2:'Práctica por sección',3:'Simulacros',4:'Repaso final'};
  PHASES=ps.map((n,i)=>{
    const next=ps[i+1];
    const to=next?fk(addD(pd(firstOf[next]),-1)):EXAM_DAY;
    return {n,from:firstOf[n],to,end:lastOf[n],name:names[n],txt:txt[n]};
  });
  PHASES[0].from=START;
  return {ok:true,info:r};
}
const phaseOf=s=>PHASES.find(p=>s>=p.from&&s<=p.to);

/* ---------- Guardado ---------- */
function cacheLocal(){
  if(!CODE)return;
  lsSet(LSS,JSON.stringify({code:CODE,config:CFG,state:state,template:T,prompt:PROMPT}));
}
const busy=k=>!!timers[k]||!!writing[k]||!!dirty[k];
function queueSave(k){
  cacheLocal();
  if(mode!=='cloud'){updateSave();return;}
  dirty[k]=true; clearTimeout(timers[k]);
  timers[k]=setTimeout(()=>{timers[k]=null;flush(k);},600);
  updateSave();
}
async function flush(k){
  if(writing[k])return;
  writing[k]=true; let tries=0;
  while(dirty[k]){
    dirty[k]=false;
    try{
      const body={code:CODE}; body[k]=k==='config'?CFG:state[k];
      const r=await api('/api/save',body);
      if(r.status===401||r.status===403){authLost=true;break;}
      if(!r.ok)throw new Error('http '+r.status);
      saveErr=false;
    }catch(e){
      if(tries<3){tries++;dirty[k]=true;await new Promise(res=>setTimeout(res,700+Math.random()*900));continue;}
      saveErr=true;break;
    }
  }
  writing[k]=false; updateSave();
}
function updateSave(){
  const el=$('saveStatus'); if(!el)return;
  let cls='', txt='';
  if(mode==='loading'){txt='Cargando tu avance…';}
  else if(authLost){txt='Este código no está activo en este dispositivo: no se puede guardar';cls='bad';}
  else if(mode==='offline'){txt='Sin conexión: guardado solo en este dispositivo';cls='saving';}
  else if(saveErr){txt='No se pudo guardar el último cambio';cls='bad';}
  else if([...SAVEKEYS,'config'].some(busy)){txt='Guardando…';cls='saving';}
  else {txt='Avance guardado en la nube';cls='ok';}
  el.className='save '+cls; el.querySelector('span').textContent=txt;
}

/* ---------- Estado de preguntas y tareas ---------- */
const qst=key=>state.exams[key]||0;
const ST_TXT=['Pendiente','Leída','No pasé','Pasé'];
function taskDone(t){
  if(t.k==='resolver')return qst(t.e+'_'+t.r)>=2;
  if(t.k==='leer')return qst(t.e+'_'+t.r)>=1;
  if(t.k==='simulacro')return ORDER.every(r=>qst(t.e+'_'+r)>=2);
  return !!state.tasks[t.id];
}
function dayStats(day){let tot=0,done=0;day.tasks.forEach(t=>{if(t.k==='h')return;tot++;if(taskDone(t))done++;});return {tot,done};}

/* ---------- Render: cabecera ---------- */
function renderHeader(){
  const tk=todayKey();
  const days=Math.round((pd(EXAM_DAY)-pd(tk))/86400000);
  $('cdN').textContent=days>0?days:(days===0?'Hoy':'–');
  $('cdTxt').textContent=days>0?(days===1?'día para el examen del '+longD(EXAM_DAY):'días para el examen del '+longD(EXAM_DAY)):(days===0?'es el examen. Mucho éxito.':'El examen ya pasó.');
  $('eyebrow').textContent=CFG.name?'Plan de '+CFG.name:'Examen de Grado · Administración';
  $('acctCode').textContent=CODE||'';
  let done=0,late=0; const tk2=tk;
  PLAN.forEach(day=>day.tasks.forEach(t=>{if(t.k==='h')return;const d=taskDone(t);if(d)done++;else if(day.date<tk2)late++;}));
  const clsTot=ORDER.reduce((a,r)=>a+CLASSES[r].length,0), clsDone=Object.keys(state.classes).filter(k=>state.classes[k]&&CLSLABEL[k]).length;
  let res=0,pass=0; Object.keys(state.exams).forEach(k=>{const v=state.exams[k];if(QD[k]&&v>=2){res++;if(v===3)pass++;}});
  const qTot=EXAMS.length*6;
  const pct=TOTAL_TASKS?Math.round(100*done/TOTAL_TASKS):0;
  $('stats').innerHTML=
    stat('Plan completado',`${pct}<small> %</small>`,pct,`${done} de ${TOTAL_TASKS} tareas`)+
    stat('Clases revisadas',`${clsDone}<small> / ${clsTot}</small>`,Math.round(100*clsDone/clsTot))+
    stat('Preguntas resueltas',`${res}<small> / ${qTot}</small>`,Math.round(100*res/qTot),res?`${Math.round(100*pass/res)} % con pase`:'Aún sin resolver')+
    `<div class="stat ${late?'warnb':''}"><div class="k">Tareas atrasadas</div><div class="v">${late}</div><div class="k">${late?'De días que ya pasaron':'Vas al día'}</div></div>`;
  $('foot').textContent=`Plan del ${short(START)} al ${short(LAST_STUDY)}: ${NSESS} sesiones de estudio, práctica intensiva por sección y ${PLAN.reduce((a,d)=>a+d.tasks.filter(t=>t.k==='simulacro').length,0)} simulacros, con ${CFG.recovery!==null?'el '+DOW[CFG.recovery]+' para recuperar':'tu margen para recuperar'}.`;
}
function stat(k,v,p,sub){return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div><div class="bar"><i style="width:${Math.min(100,p)}%"></i></div>${sub?`<div class="k" style="margin-top:4px">${sub}</div>`:''}</div>`;}

/* ---------- Render: tareas ---------- */
const codeTxt=c=>c.replace(/^([A-Z]+)(\d+)$/,'$1 $2');
function rchip(r){return r==='ALL'?'':`<span class="rchip r-${r}">${esc(RAMOS[r].short)}</span>`;}
function clsChips(c){if(!c||!c.length)return '';return `<div class="cls">${c.map(id=>{const on=!!state.classes[id];const cl=CLSLABEL[id];return `<button class="cchip r-${cl.r}" data-act="cls" data-id="${id}" data-fk="cc-${id}" aria-pressed="${on}" title="${esc(cl.l)}">${esc(cl.short)}</button>`;}).join('')}</div>`;}
function sixQ(e){
  return `<div class="sixq">${[1,2,3].map(s=>SECS[s].r.map(r=>{const key=e+'_'+r;const v=qst(key);const p=PNUM[e]&&PNUM[e][r];return `<button class="sq st-${v} r-${r}" data-act="openq" data-key="${key}" data-fk="sq-${key}"><span class="lbl">${p?'P'+p+' · ':''}${esc(RAMOS[r].short)}</span><span class="st st${v}">${ST_TXT[v]}</span></button>`;}).join('')).join('')}</div>`;
}
function secLine(e){return [1,2,3].map(s=>'S'+s+': '+SECS[s].r.map(r=>'P'+PNUM[e][r]+' '+RAMOS[r].short).join(' + ')).join(' · ');}
function corLine(e){return [1,2,3].map(s=>'S'+s+' · '+SECS[s].r.map(r=>{const q=QD[e+'_'+r];return 'P'+PNUM[e][r]+' → '+(q.a?RAMOS[r].man+' R '+q.a:'sin pauta');}).join(', ')).join('  |  ');}
function taskHTML(t){
  if(t.k==='h')return `<div class="tgroup">${esc(t.t)}</div>`;
  const done=taskDone(t);
  if(t.k==='resolver'||t.k==='leer'){
    const key=t.e+'_'+t.r, q=QD[key], v=qst(key);
    const where=q.p?`Manual ${RAMOS[t.r].man} p. ${q.p} · respuesta p. ${q.a}`:'Sin pauta en los manuales';
    let ctl;
    if(t.k==='resolver'){
      ctl=`<button class="qb fail" data-act="q" data-key="${key}" data-val="2" data-fk="qf-${key}" aria-pressed="${v===2}">No pasé</button><button class="qb pass" data-act="q" data-key="${key}" data-val="3" data-fk="qp-${key}" aria-pressed="${v===3}">Pasé</button>`;
    } else {
      ctl=v>=2?`<span class="st st${v}" style="align-self:center">Ya resuelta · ${ST_TXT[v]}</span>`:`<button class="qb read" data-act="q" data-key="${key}" data-val="1" data-fk="qr-${key}" aria-pressed="${v===1}">Leída</button>`;
    }
    return `<div class="task r-${t.r} ${done?'done':''}"><div class="tbody"><div class="tline"><span class="kind">${t.k==='leer'?'Leer':'Resolver'}</span>${rchip(t.r)}<span>${esc(exLabel(t.e))}</span></div><div class="ttitle">${esc(q.topic)}</div><div class="twhere">${esc(where)}</div><div class="qctl">${ctl}</div></div></div>`;
  }
  if(t.k==='clase'){
    const cc=codeTxt(t.code);
    return `<div class="task r-${t.r} ${done?'done':''}"><button class="check" data-act="task" data-id="${t.id}" data-fk="t-${t.id}" aria-pressed="${done}" aria-label="Marcar como hecha la sesión ${cc}"></button><div class="tbody"><div class="tline"><span class="kind">Sesión de estudio</span>${rchip(t.r)}<span class="scode">${cc}</span></div><div class="ttitle">${esc(t.t)}</div>${t.w?`<div class="twhere">${esc(t.w)}</div>`:''}${clsChips(t.c)}<div class="hint">Para empezar, pídele a tu IA: <b>Sesión ${cc}</b></div></div></div>`;
  }
  if(t.k==='simulacro'){
    const title='Simulacro '+t.n+' · examen de '+exLabel(t.e);
    return `<div class="task r-ALL ${done?'done':''}"><div class="tbody"><div class="tline"><span class="kind">Simulacro</span><span>3 horas · 2 carillas por pregunta</span></div><div class="ttitle">${esc(title)}</div><div class="twhere">${esc(secLine(t.e))}</div><div class="twhere">Archivo: ${esc(PDF[t.e])}${t.w?' · '+esc(t.w):''}</div>${sixQ(t.e)}</div></div>`;
  }
  if(t.k==='correccion'){
    return `<div class="task r-ALL ${done?'done':''}"><button class="check" data-act="task" data-id="${t.id}" data-fk="t-${t.id}" aria-pressed="${done}" aria-label="Marcar corrección como hecha"></button><div class="tbody"><div class="tline"><span class="kind">Corrección</span><span>por sección</span></div><div class="ttitle">Corrige el examen de ${esc(exLabel(t.e))} y marca qué preguntas pasaste</div><div class="twhere">${esc(t.w||corLine(t.e))}</div>${sixQ(t.e)}</div></div>`;
  }
  const kind={materia:'Materia',extra:'Extra',tarea:'Tarea'}[t.k];
  return `<div class="task r-${t.r} ${done?'done':''}"><button class="check" data-act="task" data-id="${t.id}" data-fk="t-${t.id}" aria-pressed="${done}" aria-label="Marcar como hecha: ${esc(t.t)}"></button><div class="tbody"><div class="tline"><span class="kind">${kind}</span>${rchip(t.r)}</div><div class="ttitle">${esc(t.t)}</div>${t.w?`<div class="twhere">${esc(t.w)}</div>`:''}${clsChips(t.c)}</div></div>`;
}
function focusChips(day){
  const rs=[...new Set(day.tasks.filter(t=>t.k!=='h'&&t.r&&t.r!=='ALL').map(t=>t.r))];
  if(day.tasks.some(t=>t.k==='simulacro'))return '<span class="rchip r-ALL">Simulacro</span>';
  if(day.tasks.some(t=>t.k==='clase'))return day.tasks.filter(t=>t.k==='clase').map(t=>`<span class="rchip r-${t.r}">${esc(RAMOS[t.r].short)} · ${codeTxt(t.code)}</span>`).join('');
  if(day.tasks.some(t=>t.k==='correccion'))return '<span class="rchip r-ALL">Corrección</span>'+rs.map(rchip).join('');
  if(!rs.length)return '<span class="rchip r-ALL">Repaso</span>';
  return rs.map(rchip).join('');
}
function dayHTML(day,opts){
  opts=opts||{};
  const tk=todayKey();
  const {tot,done}=dayStats(day); const complete=tot>0&&done===tot;
  const isToday=day.date===tk, late=day.date<tk&&!complete;
  const tasks=filter==='ALL'||opts.all?day.tasks:day.tasks.filter(t=>t.k==='h'?false:(t.r===filter||t.k==='simulacro'||t.k==='correccion'));
  const d=pd(day.date);
  return `<article class="day ${isToday?'is-today':''} ${complete?'complete':''}"${opts.noId?'':' id="d-'+day.date+'"'}>
    <header class="dhead"><div class="ddate"><span class="dow">${DOW[d.getDay()]}</span><span class="dn">${short(day.date)}</span></div>
    <div class="dmeta">${focusChips(day)}<span class="hrs">${String(day.h).replace('.',',')} h</span></div>
    <div class="dright">${isToday?'<span class="badge today">Hoy</span>':''}${late?'<span class="badge late">Atrasado</span>':''}${complete?'<span class="badge done">Listo</span>':''}<span class="prog">${done}/${tot}</span></div></header>
    <div class="tasks">${tasks.map(taskHTML).join('')}</div></article>`;
}

/* ---------- Render: calendario ---------- */
function allDates(){const out=[];for(let d=pd(START);fk(d)<=EXAM_DAY;d=addD(d,1))out.push(fk(d));return out;}
function kindOf(s){
  if(s===EXAM_DAY)return 'exam';
  if(s>LAST_STUDY)return 'rest';
  if(PMAP[s])return 'study';
  if(inBreak(CFG,s))return 'brk';
  const wd=pd(s).getDay();
  if(CFG.days.includes(wd))return 'free';
  if(CFG.recovery===wd&&s>PLAN[0].date)return 'catch';
  return 'sat';
}
function pendingBefore(s){const out=[];PLAN.forEach(day=>{if(day.date>=s)return;day.tasks.forEach(t=>{if(t.k==='h'||taskDone(t))return;out.push({t,date:day.date});});});return out;}
function upcomingAfter(s,n){const out=[];for(const day of PLAN){if(day.date<=s)continue;for(const t of day.tasks){if(t.k==='clase'&&!taskDone(t))out.push({t,date:day.date});}if(out.length>=n)break;}return out.slice(0,n);}
function catchHTML(s){
  const pend=pendingBefore(s); let head, items, pre;
  if(pend.length){head=`Tienes ${pend.length} ${pend.length===1?'tarea pendiente':'tareas pendientes'}. Haz primero las 2 sesiones más antiguas.`;items=pend.slice(0,6);pre='Era del';}
  else{head='Vas al día. Si quieres, adelanta las próximas 2 sesiones.';items=upcomingAfter(s,2);pre='Está para el';}
  const d=pd(s), tk=todayKey();
  return `<article class="day catchday ${s===tk?'is-today':''}"><header class="dhead"><div class="ddate"><span class="dow">${DOW[d.getDay()]}</span><span class="dn">${short(s)}</span></div><div class="dmeta"><span class="rchip r-ALL">Recuperación</span><span class="hrs">2 sesiones</span></div><div class="dright">${s===tk?'<span class="badge today">Hoy</span>':''}</div></header><p class="note catchhead">${head}</p><div class="tasks">${items.map(({t,date})=>`<div class="pdate">${pre} ${esc(longD(date))}</div>${taskHTML(t)}`).join('')}</div>${pend.length>6?`<p class="note">Y ${pend.length-6} más en el calendario.</p>`:''}</article>`;
}
function miniCal(){
  const months=[]; for(let y=pd(START).getFullYear(),m=pd(START).getMonth();;){months.push([y,m]);if(y===pd(EXAM_DAY).getFullYear()&&m===pd(EXAM_DAY).getMonth())break;m++;if(m>11){m=0;y++;}}
  const tk=todayKey();
  return `<div class="months">${months.map(([y,m])=>{
    const first=new Date(y,m,1), lead=(first.getDay()+6)%7, n=new Date(y,m+1,0).getDate();
    let cells=['L','M','M','J','V','S','D'].map(w=>`<div class="wd">${w}</div>`).join('');
    for(let i=0;i<lead;i++)cells+='<div></div>';
    for(let dd=1;dd<=n;dd++){
      const s=fk(new Date(y,m,dd));
      if(s<START||s>EXAM_DAY){cells+=`<div class="mc" aria-hidden="true">${dd}</div>`;continue;}
      const k=kindOf(s); let cls='mc '+k; if(s===tk)cls+=' today';
      if(k==='study'){
        const day=PMAP[s],{tot,done}=dayStats(day);
        if(tot&&done===tot)cls+=' done'; else if(s<tk)cls+=' late'; else if(done>0)cls+=' partial';
        const rs=[...new Set(day.tasks.filter(t=>t.k!=='h'&&t.r&&t.r!=='ALL').map(t=>t.r))].slice(0,3);
        const dots=rs.length?rs.map(r=>`<i class="r-${r}"></i>`).join(''):'<i class="r-ALL"></i>';
        cells+=`<button class="${cls}" data-act="goday" data-date="${s}" data-fk="mc-${s}" aria-label="${esc(longD(s))}: ${done} de ${tot} tareas">${dd}<span class="dots">${dots}</span></button>`;
      } else {
        const b=inBreak(CFG,s);
        const lab=k==='exam'?'Examen de Grado':k==='sat'?'Día libre':k==='catch'?'Día de recuperación':k==='brk'?'Pausa'+(b&&b.label?': '+b.label:''):k==='free'?'Sin sesiones':'Descanso';
        cells+=`<div class="${cls}" title="${esc(lab)}">${k==='exam'?'EdG':dd}</div>`;
      }
    }
    return `<div class="month"><h4>${MONL[m]} ${y}</h4><div class="mgrid">${cells}</div></div>`;
  }).join('')}</div>
  <div class="legend"><span><i style="background:var(--ok-soft)"></i>Completo</span><span><i style="background:var(--accent-soft)"></i>En curso</span><span><i style="background:var(--warn-soft)"></i>Atrasado</span><span><i style="background:repeating-linear-gradient(135deg,transparent 0 3px,var(--line) 3px 4px)"></i>Día libre</span><span><i style="border:1.5px dashed var(--accent)"></i>Recuperación</span><span><i style="background:var(--surface-2)"></i>Pausa o descanso</span><span><i style="background:var(--accent)"></i>Examen</span></div>`;
}
function todayPanel(){
  const tk=todayKey();
  const k=tk<START?'before':(tk>EXAM_DAY?'after':kindOf(tk));
  let firstLate=null; for(const day of PLAN){if(day.date>=tk)break;const {tot,done}=dayStats(day);if(done<tot){firstLate=day.date;break;}}
  let lateCount=0; PLAN.forEach(day=>{if(day.date<tk){const s=dayStats(day);lateCount+=s.tot-s.done;}});
  const alert=lateCount?`<div class="alert"><span>Tienes ${lateCount} ${lateCount===1?'tarea atrasada':'tareas atrasadas'} desde el ${esc(longD(firstLate))}.</span><button class="linkbtn" data-act="goday" data-date="${firstLate}" data-fk="golate">Ver la primera</button></div>`:'';
  let title='Hoy', body='';
  if(k==='study'){body=dayHTML(PMAP[tk],{noId:true,all:true});}
  else if(k==='catch'){title='Hoy: día de recuperación';body=catchHTML(tk);}
  else if(k==='exam'){title='Hoy';body='<div class="examrow">Hoy es el Examen de Grado. Mucho éxito.</div>';}
  else{
    const next=PLAN.find(d=>d.date>tk);
    title=k==='before'?'Tu plan parte el '+longD(START):k==='sat'?'Hoy es día libre':k==='brk'?'Hoy es una pausa':(tk>LAST_STUDY&&tk<EXAM_DAY?'Días de descanso antes del examen':'Hoy no hay sesiones');
    body=next?`<p class="note">Lo próximo, el ${esc(longD(next.date))}:</p>`+dayHTML(next,{noId:true,all:true}):'<p class="note">Ya no quedan días de estudio. Descansa.</p>';
  }
  return `<div class="todaywrap"><div><div class="panel-title"><h2>${title}</h2><span class="note">${esc(longD(tk))}</span></div>${alert}${body}</div><div><div class="panel-title"><h2>Mapa del plan</h2></div>${miniCal()}</div></div>`;
}
function renderCal(){
  const el=$('view-cal');
  let html=todayPanel();
  html+=`<h2>Calendario completo</h2><p class="lead">Cada sesión tiene su código (por ejemplo, DE 1): se lo pides a tu IA con la carpeta de estudio cargada. Las preguntas que marcas aquí quedan registradas en Exámenes anteriores, y las clases, en Clases.${CFG.recovery!==null?' El '+DOW[CFG.recovery]+' recuperas lo que quedó pendiente en la semana.':''}</p>`;
  html+=`<div class="filters" role="group" aria-label="Filtrar por ramo">${['ALL',...ORDER].map(r=>`<button class="fchip r-${r}" data-act="filter" data-r="${r}" data-fk="f-${r}" aria-pressed="${filter===r}">${r==='ALL'?'Todos los ramos':esc(RAMOS[r].name)}</button>`).join('')}</div>`;
  let curPhase=null, curWeek=null, open=false;
  allDates().forEach(s=>{
    const k=kindOf(s), d=pd(s);
    if(filter!=='ALL'&&k!=='study')return;
    if(k==='study'&&filter!=='ALL'){const day=PMAP[s];if(!day.tasks.some(t=>t.k!=='h'&&(t.r===filter||t.k==='simulacro'||t.k==='correccion')))return;}
    const ph=phaseOf(s);
    if(ph&&ph!==curPhase){if(open){html+='</div>';open=false;}curPhase=ph;curWeek=null;html+=`<div class="phase"><span class="pn">${ph.n}</span><h3>Fase ${ph.n} · ${esc(ph.name)} <span class="note mono">${short(ph.from)} – ${short(ph.end)}</span></h3><p>${esc(ph.txt)}</p></div>`;}
    const ws=fk(addD(d,-((d.getDay()+6)%7)));
    if(ws!==curWeek){if(open)html+='</div>';curWeek=ws;const we=fk(addD(pd(ws),6));html+=`<div class="week">Semana del ${short(ws)} al ${short(we)}</div><div class="days">`;open=true;}
    if(k==='study')html+=dayHTML(PMAP[s]);
    else if(k==='sat')html+=`<div class="offrow"><b>${DOW[d.getDay()]} ${short(s)}</b><span>Libre</span></div>`;
    else if(k==='rest')html+=`<div class="offrow"><b>${DOW[d.getDay()]} ${short(s)}</b><span>Descanso, sin estudio</span></div>`;
    else if(k==='free')html+=`<div class="offrow"><b>${DOW[d.getDay()]} ${short(s)}</b><span>Sin sesiones: margen del plan</span></div>`;
    else if(k==='catch')html+=`<div class="offrow catchrow" id="d-${s}"><b>${DOW[d.getDay()]} ${short(s)}</b><span>Recuperación: 2 sesiones para ponerte al día, o para adelantar si vas al día</span></div>`;
    else if(k==='brk'){const b=inBreak(CFG,s);html+=`<div class="offrow semrow" id="d-${s}"><b>${DOW[d.getDay()]} ${short(s)}</b><span>Pausa${b&&b.label?': '+esc(b.label):''}. Sin sesiones</span></div>`;}
    else if(k==='exam')html+=`<div class="examrow" id="d-${s}"><span>${esc(longD(s))}</span><span>Examen de Grado: Sección 1 Dirección, Sección 2 Finanzas y Sección 3 Marketing</span></div>`;
  });
  if(open)html+='</div>';
  el.innerHTML=html;
}

/* ---------- Render: exámenes ---------- */
function renderEx(){
  const el=$('view-ex');
  const rs={}; ORDER.forEach(r=>rs[r]={read:0,res:0,pass:0});
  EXAMS.forEach(e=>ORDER.forEach(r=>{const v=qst(e+'_'+r);if(v===1)rs[r].read++;if(v>=2)rs[r].res++;if(v===3)rs[r].pass++;}));
  const RES=new Set(T.RESERVED);
  let html=`<h2>Exámenes anteriores</h2><p class="lead">Las ${EXAMS.length*6} preguntas de los manuales, de marzo de 2009 a agosto de 2026, ordenadas por examen y ramo. Toca una pregunta para ver dónde está y marcar cómo te fue. Los exámenes de 2024 a 2026 son tus simulacros: no abras sus preguntas ni respuestas antes de hacerlos.</p>`;
  html+=`<div class="secstats">${[1,2,3].map(s=>{
    const a=SECS[s].r; const res=a.reduce((x,r)=>x+rs[r].res,0), pass=a.reduce((x,r)=>x+rs[r].pass,0);
    return `<div class="secc s-${s}"><h3>Sección ${s} · ${SECS[s].name}<span class="mono">${res?Math.round(100*pass/res)+' % pase':'sin datos'}</span></h3><div class="rstat">${a.map(r=>`<span>${esc(RAMOS[r].name)}</span><span class="mono">${rs[r].res} resueltas · ${rs[r].res?Math.round(100*rs[r].pass/rs[r].res)+' %':'–'} · ${rs[r].read} leídas</span>`).join('')}</div></div>`;
  }).join('')}</div>`;
  html+=`<div class="slegend"><span><i style="background:var(--surface)"></i>Pendiente</span><span><i style="background:var(--read-soft)"></i>Leída</span><span><i style="background:var(--bad-soft)"></i>Resuelta, no pasé</span><span><i style="background:var(--ok-soft)"></i>Resuelta, pasé</span></div>`;
  html+=`<div class="exhead"><div>Examen</div>${ORDER.map(r=>`<div class="sec r-${r}">S${RAMOS[r].sec} · ${esc(RAMOS[r].short)}</div>`).join('')}</div>`;
  [...EXAMS].reverse().forEach(e=>{
    const secres=[1,2,3].map(s=>{const v=SECS[s].r.map(r=>qst(e+'_'+r));if(v.every(x=>x>=2))return `<span class="${v.every(x=>x===3)?'y':'n'}">S${s} ${v.every(x=>x===3)?'pase':'no'}</span>`;return '';}).join('');
    html+=`<div class="exrow ${RES.has(e)?'reserved':''}"><div class="exlabel"><b>${esc(exLabel(e))}</b>${secres?`<div class="secres">${secres}</div>`:''}</div>${ORDER.map(r=>{
      const key=e+'_'+r,q=QD[key],v=qst(key),pl=QPLAN[key];
      const plan=pl?`${pl.role} · ${short(pl.date)}`:'Extra, sin fecha';
      return `<button class="qcell r-${r} st-${v}" data-act="openq" data-key="${key}" data-fk="qc-${key}" aria-label="${esc(exLabel(e)+', '+RAMOS[r].name+': '+q.topic+'. Estado: '+ST_TXT[v])}"><span class="top1"><span class="code">${esc(RAMOS[r].short)}</span><span class="st st${v}">${ST_TXT[v]}</span></span><span class="topic">${esc(q.topic)}</span><span class="plan">${esc(plan)}</span></button>`;
    }).join('')}</div>`;
  });
  el.innerHTML=html;
}

/* ---------- Render: clases ---------- */
function renderCls(){
  const el=$('view-cls');
  let html=`<h2>Clases por ramo</h2><p class="lead">Todas las clases de la carpeta de estudio, en el orden del temario. Al lado de cada una aparece la sesión y el día en que te toca.</p>`;
  [1,2,3].forEach(s=>{
    html+=`<div class="sech s-${s}"><span class="tag">Sección ${s}</span><h2>${SECS[s].name}</h2></div><div class="clsgrid">`;
    SECS[s].r.forEach(r=>{
      const list=CLASSES[r], done=list.filter(([id])=>state.classes[id]).length;
      html+=`<div class="rcard r-${r}"><header><h3>${esc(RAMOS[r].name)}</h3><span class="mono">${done}/${list.length}</span></header><div class="bar"><i style="width:${Math.round(100*done/list.length)}%"></i></div><ul class="clist">${list.map(([id,l])=>{const on=!!state.classes[id];return `<li class="${on?'on':''}"><button class="check" id="c-${id}" data-act="cls" data-id="${id}" data-fk="cl-${id}" aria-pressed="${on}" aria-label="Marcar ${esc(l)} como revisada"></button><label for="c-${id}">${esc(l)}</label><span class="when">${CPLAN[id]?esc((CPLAN[id].code?codeTxt(CPLAN[id].code)+' · ':'')+short(CPLAN[id].date)):''}</span></li>`;}).join('')}</ul>${MISSING[r]?`<div class="missing">${esc(MISSING[r])}</div>`:''}</div>`;
    });
    html+='</div>';
  });
  el.innerHTML=html;
}

/* ---------- Render: carpeta de estudio ---------- */
let packMsg={t:'',c:''};
function renderPack(){
  const el=$('view-pack');
  el.innerHTML=`<h2>Carpeta de estudio</h2>
  <p class="lead">Una carpeta con todo lo que necesita una IA para ser tu tutor: temario de cada ramo, las clases en orden, el banco de preguntas con las páginas de los manuales, la pauta de corrección y los comandos de cada sesión. Súbela a Claude, ChatGPT, Gemini o la IA que prefieras.</p>
  <div class="card" style="max-width:760px">
    <div class="packstep"><b class="n">1</b><div><b>Descarga la carpeta</b><div class="note">Es un archivo .zip. Descomprímelo en tu computador.</div></div></div>
    <div class="packstep"><b class="n">2</b><div><b>Súbela a tu IA</b><div class="note">Crea un proyecto (o el equivalente en tu IA), pega el prompt como instrucciones y sube los archivos de la carpeta. Trae todo el material en texto: manuales, clases y exámenes. Si tu IA no deja subir todo junto, sube primero los archivos 00 a 05 y los manuales, y después solo las clases del ramo que te toca.</div></div></div>
    <div class="packstep"><b class="n">3</b><div><b>Pega el prompt de inicio</b><div class="note">Está más abajo y también viene en la carpeta, en el archivo 00_prompt_inicio.md. Se pega una sola vez al crear el proyecto.</div></div></div>
    <div class="packstep"><b class="n">4</b><div><b>Cada día, sigue el calendario</b><div class="note">Mira la sesión del día en la pestaña Calendario y pídele a tu IA, por ejemplo: «Sesión DE 1». Marca aquí lo que vas terminando.</div></div></div>
    <div class="acts"><button class="btn" data-act="dlpack" data-fk="dlpack">Descargar carpeta de estudio</button><button class="btn ghost" data-act="dlplan" data-fk="dlplan">Descargar mi plan (CSV)</button></div>
    <div id="packMsg" role="status">${packMsg.t?`<div class="msg ${packMsg.c}">${esc(packMsg.t)}</div>`:''}</div>
  </div>
  <h2>Prompt de inicio</h2>
  <p class="lead">Pégalo como instrucción del proyecto de tu IA. Define cómo debe enseñarte, qué comandos entiende y cómo corregir tus respuestas.</p>
  <div class="acts" style="margin-top:0"><button class="btn sm" data-act="copyprompt" data-fk="copyprompt">Copiar prompt</button></div>
  <pre class="prompt" id="promptBox">${esc(PROMPT)}</pre>`;
}
async function downloadPack(){
  packMsg={t:'Preparando la descarga…',c:''}; renderPack();
  try{
    const r=await api('/api/pack',{code:CODE});
    if(!r.ok)throw new Error('http '+r.status);
    const blob=await r.blob(); const a=document.createElement('a');
    a.href=URL.createObjectURL(blob); a.download='carpeta-estudio-edg.zip'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    packMsg={t:'Descarga lista. Revisa tu carpeta de descargas.',c:'ok'};
  }catch(e){packMsg={t:'No se pudo descargar la carpeta. Inténtalo de nuevo en un momento.',c:'bad'};}
  if(tab==='pack')renderPack();
}
function csvCell(s){s=String(s==null?'':s);return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
function downloadPlan(){
  const rows=[['Fecha','Día','Horas','Tipo','Ramo','Tarea','Detalle']];
  PLAN.forEach(day=>day.tasks.forEach(t=>{
    if(t.k==='h')return;
    let tipo=t.k,tarea='',det='';
    if(t.k==='clase'){tipo='Sesión de estudio';tarea='Sesión '+codeTxt(t.code)+': '+t.t;det=t.w||'';}
    else if(t.k==='resolver'||t.k==='leer'){const q=QD[t.e+'_'+t.r];tipo=t.k==='leer'?'Leer pregunta':'Resolver pregunta';tarea=exLabel(t.e)+' · '+q.topic;det=q.p?'Manual '+RAMOS[t.r].man+' p. '+q.p+' · respuesta p. '+q.a:'Sin pauta en los manuales';}
    else if(t.k==='simulacro'){tipo='Simulacro';tarea='Simulacro '+t.n+' · examen de '+exLabel(t.e);det=PDF[t.e];}
    else if(t.k==='correccion'){tipo='Corrección';tarea='Corrige el examen de '+exLabel(t.e);det=t.w||corLine(t.e);}
    else {tipo={materia:'Materia',extra:'Extra',tarea:'Tarea'}[t.k]||t.k;tarea=t.t||'';det=t.w||'';}
    rows.push([day.date,DOW[pd(day.date).getDay()],String(day.h).replace('.',','),tipo,t.r&&t.r!=='ALL'?RAMOS[t.r].name:'General',tarea,det]);
  }));
  const csv='﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='mi-plan-edg.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),4000);
}

/* ---------- Modal de pregunta ---------- */
function renderModal(){
  const root=$('modalRoot');
  if(!openKey){root.innerHTML='';return;}
  const [e,r]=openKey.split('_'), q=QD[openKey], v=qst(openKey), pl=QPLAN[openKey], p=PNUM[e]&&PNUM[e][r];
  const RES=new Set(T.RESERVED);
  root.innerHTML=`<div class="modal" data-act="close"><div class="sheet r-${r}" role="dialog" aria-modal="true" aria-labelledby="mT" data-stop="1">
    <button class="x" data-act="close" data-fk="mclose" aria-label="Cerrar">×</button>
    <div class="eyebrow">${esc(RAMOS[r].name)} · Sección ${RAMOS[r].sec}</div>
    <h3 id="mT">${esc(exLabel(e))}${p?' · pregunta '+p:''}</h3>
    <p><b>${esc(q.topic)}</b></p>
    <p class="twhere">${q.p?`Pregunta en el manual ${RAMOS[r].man}, p. ${q.p} · respuesta en p. ${q.a}`:'No viene en los manuales: está en el PDF del examen de agosto 2026.'}</p>
    <p class="note">${pl?`En el plan: ${esc(pl.role)} el ${esc(longD(pl.date))}.`:'Esta pregunta no tiene fecha en el plan. Úsala como extra si te sobra tiempo.'}${RES.has(e)?' Es parte de un simulacro: no la abras antes.':''}</p>
    <div class="opts">${[0,1,2,3].map(n=>`<button class="qb ${['none','read','fail','pass'][n]}" data-act="setq" data-key="${openKey}" data-val="${n}" data-fk="m-${n}" aria-pressed="${v===n}">${ST_TXT[n]==='No pasé'?'Resuelta, no pasé':ST_TXT[n]==='Pasé'?'Resuelta, pasé':ST_TXT[n]}</button>`).join('')}</div>
  </div></div>`;
}

/* ---------- Render general ---------- */
let raf=0;
function render(){
  const a=document.activeElement, fkey=a&&a.dataset?a.dataset.fk:null;
  renderHeader();
  ['cal','ex','cls','pack'].forEach(t=>{$('view-'+t).hidden=t!==tab;$('tab-'+t).setAttribute('aria-selected',String(t===tab));});
  if(tab==='cal')renderCal(); else if(tab==='ex')renderEx(); else if(tab==='cls')renderCls(); else renderPack();
  renderModal(); updateSave();
  if(fkey){const n=document.querySelector(`[data-fk="${fkey}"]`);if(n)n.focus({preventScroll:true});}
}
function scheduleRender(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;render();});}

/* ---------- Configuración del plan ---------- */
let draft=null;
function defaultDraft(){
  const t=todayKey();
  return {name:'',start:t<'2026-10-19'?'2026-10-19':t,exam:'2027-01-21',days:[1,2,3,4,5],recovery:0,breaks:[]};
}
function openSetup(first){
  editing=!first;
  draft=first?defaultDraft():JSON.parse(JSON.stringify(CFG));
  if(draft.recovery===undefined)draft.recovery=null;
  $('setupEyebrow').textContent=first?'Paso único':'Ajustes del plan';
  $('setupTitle').textContent=first?'Arma tu plan':'Ajustar tu plan';
  $('setupLead').textContent=first?'Elige tus fechas y los días en que puedes estudiar. El plan se reparte solo y termina seis días antes del examen.':'Cambia tus fechas o tus días de estudio. Tu avance se mantiene: solo se mueven las fechas de las tareas.';
  $('sCancel').hidden=first;
  $('sGo').textContent=first?'Generar mi plan':'Guardar y regenerar';
  $('sName').value=draft.name||''; $('sStart').value=draft.start; $('sExam').value=draft.exam;
  drawSetup(); show('setup');
}
function drawSetup(){
  $('sDays').innerHTML=[1,2,3,4,5,6,0].map(n=>`<button type="button" class="wd-b" data-sd="${n}" aria-pressed="${draft.days.includes(n)}">${DOWS[n]}</button>`).join('');
  const rec=$('sRec'); const opts=[[ '', 'Sin día de recuperación' ],...[0,6,5,4,3,2,1].filter(n=>!draft.days.includes(n)).map(n=>[String(n),DOW[n].charAt(0).toUpperCase()+DOW[n].slice(1)])];
  if(draft.recovery!==null&&draft.days.includes(draft.recovery))draft.recovery=null;
  rec.innerHTML=opts.map(([v,l])=>`<option value="${v}" ${String(draft.recovery===null?'':draft.recovery)===v?'selected':''}>${l}</option>`).join('');
  $('sBreaks').innerHTML=draft.breaks.map((b,i)=>`<div class="brkrow"><div><label class="fl" style="margin-top:0">Desde</label><input class="in" type="date" data-bi="${i}" data-bf="from" value="${esc(b.from)}"></div><div><label class="fl" style="margin-top:0">Hasta</label><input class="in" type="date" data-bi="${i}" data-bf="to" value="${esc(b.to)}"></div><div class="lab"><input class="in" placeholder="Motivo (opcional)" maxlength="40" data-bi="${i}" data-bf="label" value="${esc(b.label||'')}"></div><div class="lab"><button type="button" class="btn ghost sm" data-brm="${i}">Quitar pausa</button></div></div>`).join('');
  updateSummary();
}
function draftValid(){
  if(!draft.start||!draft.exam)return 'Elige la fecha de inicio y la del examen.';
  if(draft.exam<=draft.start)return 'El examen debe ser después del primer día de estudio.';
  if(!draft.days.length)return 'Elige al menos un día de estudio.';
  for(const b of draft.breaks){if(!b.from||!b.to||b.to<b.from)return 'Revisa las fechas de tus pausas: la fecha final no puede ser antes de la inicial.';}
  return null;
}
function updateSummary(){
  const el=$('sSummary'), go=$('sGo');
  const err=draftValid();
  if(err){el.className='msg warn';el.textContent=err;go.disabled=true;return;}
  const cfg=normCfg({...draft,breaks:draft.breaks});
  const r=buildPlan(cfg);
  if(!r.ok){
    el.className='msg bad';
    el.textContent=`Con estas fechas tienes ${r.avail} días de estudio y el plan necesita al menos ${r.need}. Empieza antes, suma más días de la semana o quita pausas.`;
    go.disabled=true;return;
  }
  const last=fk(addD(pd(cfg.exam),-6));
  let t=`Tienes ${r.avail} días de estudio disponibles y el plan usa ${r.avail-r.slack}. Estudias hasta el ${longD(last)} y descansas los 5 días antes del examen.`;
  if(r.merged>0)t+=' Para que quepa, agrupamos algunas sesiones en días más largos (hasta 7,5 horas).';
  if(r.slack>0)t+=` Te sobran ${r.slack} días de margen.`;
  el.className='msg '+(r.merged>0?'warn':'ok'); el.textContent=t; go.disabled=false;
}
function gatherDraft(){if(!draft)return;draft.name=$('sName').value.trim();draft.start=$('sStart').value;draft.exam=$('sExam').value;const rv=$('sRec').value;draft.recovery=rv===''?null:Number(rv);}
document.addEventListener('input',ev=>{
  const t=ev.target;
  if(t.id==='sName'||t.id==='sStart'||t.id==='sExam'||t.id==='sRec'){gatherDraft();updateSummary();return;}
  if(t.dataset&&t.dataset.bi!==undefined){draft.breaks[+t.dataset.bi][t.dataset.bf]=t.value;updateSummary();}
});
async function finishSetup(){
  gatherDraft();
  if(draftValid())return;
  const res=applyConfig(draft);
  if(!res.ok){updateSummary();return;}
  cacheLocal();
  if(mode==='cloud'){dirty.config=true;flush('config');}
  editing=false; show('app'); render();
}

/* ---------- Acceso ---------- */
function showGate(msg,cls){
  show('gate');
  $('gateMsg').innerHTML=msg?`<div class="msg ${cls||'bad'}">${esc(msg)}</div>`:'';
  $('gateBtn').disabled=false; $('gateBtn').textContent='Entrar';
}
async function login(code,auto){
  $('gateBtn').disabled=true; $('gateBtn').textContent='Entrando…';
  try{
    const r=await api('/api/session',{code});
    if(r.status===401){
      lsDel(LSK); lsDel(LSS);
      showGate(auto?'Tu código ya no es válido. Escríbelo de nuevo o pide uno nuevo.':'Ese código no es válido. Revisa que esté bien escrito.');
      return;
    }
    if(r.status===403){
      lsDel(LSK); lsDel(LSS);
      let mx=2; try{const j=await r.json();if(j&&j.max)mx=j.max;}catch(_){}
      showGate('Este código ya está activo en '+mx+' dispositivos, que es el máximo. Escríbele a quien te lo entregó para liberar uno.');
      return;
    }
    if(!r.ok)throw new Error('http '+r.status);
    const d=await r.json();
    CODE=d.code; lsSet(LSK,CODE);
    startApp(d,'cloud');
  }catch(e){
    let c=null; try{c=JSON.parse(lsGet(LSS)||'null');}catch(_){}
    if(c&&c.code&&auto){CODE=c.code;startApp(c,'offline');}
    else showGate('No pude conectar. Revisa tu internet e inténtalo de nuevo.');
  }
}
function loadTemplate(t){
  T=t; RAMOS=t.RAMOS; ORDER=t.ORDER; SECS=t.SECS; EXAMS=t.EXAMS; QD=t.QD; PNUM=t.PNUM; PDF=t.PDF; CLASSES=t.CLASSES; MISSING=t.MISSING;
  CLSLABEL={}; ORDER.forEach(r=>CLASSES[r].forEach(([id,l])=>{CLSLABEL[id]={r,l,short:l.split(' · ')[0]};}));
}
function startApp(d,m){
  mode=m; authLost=false; saveErr=false;
  loadTemplate(d.template); PROMPT=d.prompt||'';
  ['classes','exams','tasks'].forEach(k=>{state[k]=Object.assign({},(d.state&&d.state[k])||{});});
  const saved=lsGet(LSTAB); if(['cal','ex','cls','pack'].includes(saved))tab=saved;
  const h={'#calendario':'cal','#examenes':'ex','#clases':'cls','#carpeta':'pack'}[location.hash]; if(h)tab=h;
  cacheLocal();
  if(d.config&&d.config.start&&d.config.exam){
    const res=applyConfig(d.config);
    if(res.ok){show('app');render();return;}
  }
  openSetup(true);
}
function logout(){
  lsDel(LSK); lsDel(LSS); CODE=null; T=null; CFG=null;
  $('codeIn').value=''; showGate('Cerraste sesión en este dispositivo. Tu avance quedó guardado con tu código.','ok');
}
async function refreshFromCloud(){
  if(mode!=='cloud'||!CODE||[...SAVEKEYS,'config'].some(busy)||editing||openKey)return;
  try{
    const r=await api('/api/session',{code:CODE});
    if(r.status===401||r.status===403){authLost=true;updateSave();return;}
    if(!r.ok)return;
    const d=await r.json();
    if([...SAVEKEYS].some(busy))return;
    ['classes','exams','tasks'].forEach(k=>{state[k]=Object.assign({},d.state[k]||{});});
    if(d.config&&d.config.start){const same=JSON.stringify(normCfg(d.config))===JSON.stringify(CFG);if(!same)applyConfig(d.config);}
    cacheLocal(); scheduleRender();
  }catch(e){}
}

/* ---------- Interacción ---------- */
document.addEventListener('click',async ev=>{
  const t=ev.target;
  const sd=t.closest('[data-sd]');
  if(sd){const n=+sd.dataset.sd;const i=draft.days.indexOf(n);if(i>=0)draft.days.splice(i,1);else draft.days.push(n);gatherDraft();drawSetup();return;}
  const brm=t.closest('[data-brm]');
  if(brm){draft.breaks.splice(+brm.dataset.brm,1);drawSetup();return;}
  if(t.closest('#sAddBreak')){gatherDraft();const base=draft.start||todayKey();draft.breaks.push({from:base,to:base,label:''});drawSetup();return;}
  if(t.closest('#sGo')){finishSetup();return;}
  if(t.closest('#sCancel')){editing=false;show('app');render();return;}
  const sheet=t.closest('[data-stop]');
  const b=t.closest('[data-act]'); if(!b)return;
  const act=b.dataset.act;
  if(act==='close'&&sheet&&b.classList.contains('modal'))return;
  if(act==='tab'){tab=b.dataset.tab;lsSet(LSTAB,tab);render();window.scrollTo({top:0});return;}
  if(act==='task'){const id=b.dataset.id;if(state.tasks[id])delete state.tasks[id];else state.tasks[id]=true;queueSave('tasks');render();return;}
  if(act==='cls'){const id=b.dataset.id;if(state.classes[id])delete state.classes[id];else state.classes[id]=true;queueSave('classes');render();return;}
  if(act==='q'){const k=b.dataset.key,v=+b.dataset.val;if(qst(k)===v)delete state.exams[k];else state.exams[k]=v;queueSave('exams');render();return;}
  if(act==='setq'){const k=b.dataset.key,v=+b.dataset.val;if(v===0)delete state.exams[k];else state.exams[k]=v;queueSave('exams');openKey=null;render();const back=document.querySelector(`[data-fk="qc-${k}"]`)||document.querySelector(`[data-fk="sq-${k}"]`);if(back)back.focus({preventScroll:true});return;}
  if(act==='openq'){openKey=b.dataset.key;render();const f=document.querySelector('[data-fk="mclose"]');if(f)f.focus();return;}
  if(act==='close'){const k=openKey;openKey=null;render();const back=document.querySelector(`[data-fk="qc-${k}"]`)||document.querySelector(`[data-fk="sq-${k}"]`);if(back)back.focus({preventScroll:true});return;}
  if(act==='filter'){filter=b.dataset.r;render();return;}
  if(act==='goday'){const s=b.dataset.date;tab='cal';if(filter!=='ALL')filter='ALL';render();const n=document.getElementById('d-'+s);if(n){const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;n.scrollIntoView({block:'start',behavior:rm?'auto':'smooth'});}return;}
  if(act==='settings'){openSetup(false);return;}
  if(act==='logout'){logout();return;}
  if(act==='dlpack'){downloadPack();return;}
  if(act==='dlplan'){downloadPlan();return;}
  if(act==='copyprompt'){
    try{await navigator.clipboard.writeText(PROMPT);packMsg={t:'Prompt copiado.',c:'ok'};b.textContent='Copiado';setTimeout(()=>{b.textContent='Copiar prompt';},1800);}
    catch(e){const box=$('promptBox');if(box){const rg=document.createRange();rg.selectNodeContents(box);const s=getSelection();s.removeAllRanges();s.addRange(rg);}b.textContent='Selecciona y copia';}
    return;
  }
});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&openKey){openKey=null;render();}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshFromCloud();});
$('gateForm').addEventListener('submit',ev=>{
  ev.preventDefault();
  const v=$('codeIn').value.trim();
  if(!v){showGate('Escribe tu código de acceso.','warn');return;}
  login(v,false);
});

/* ---------- Arranque ---------- */
(function boot(){
  const saved=lsGet(LSK);
  if(saved){show('gate');login(saved,true);}
  else showGate();
})();
})();
