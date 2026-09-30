import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

/* ── Edition ──
   Clients get an F&O-only view; iCatalyst staff open ?view=icatalyst once (remembered per browser).
   This is a convenience switch, not access control: fit/gap writes are checked server-side. */
function readEdition(){
  let ed="client";
  try{
    const v=new URLSearchParams(window.location.search).get("view");
    if(v==="icatalyst"||v==="client") localStorage.setItem("catalogue.view",v);
    ed=localStorage.getItem("catalogue.view")||"client";
  }catch(_){}
  return ed==="icatalyst"?"vendor":"client";
}
export const EDITION = readEdition();
export const IS_CLIENT = EDITION==="client";

/* ── Scoping vocabulary ── */
export const SCOPES = [
  {v:"in",    label:"In scope",    color:"#14F032", bg:"rgba(20,240,50,0.12)"},
  {v:"later", label:"Later phase", color:"#F5B83D", bg:"rgba(245,184,61,0.12)"},
  {v:"out",   label:"Out of scope",color:"#8a9ab0", bg:"rgba(138,154,176,0.14)"},
];
export const PRIORITIES = [
  {v:"must",label:"Must have",ado:1},{v:"should",label:"Should have",ado:2},
  {v:"could",label:"Could have",ado:3},{v:"wont",label:"Won't have (now)",ado:4},
];
export const FITS = [
  {v:"standard", label:"Standard",      color:"#14F032", bg:"rgba(20,240,50,0.12)"},
  {v:"config",   label:"Configuration", color:"#14BEF0", bg:"rgba(20,190,240,0.12)"},
  {v:"extension",label:"Extension",     color:"#F5B83D", bg:"rgba(245,184,61,0.12)"},
  {v:"isv",      label:"ISV solution",  color:"#a78bfa", bg:"rgba(167,139,250,0.14)"},
  {v:"gap",      label:"Gap",           color:"#F16320", bg:"rgba(241,99,32,0.12)"},
];
const byV = list => Object.fromEntries(list.map(x=>[x.v,x]));
export const SCOPE_BY=byV(SCOPES), PRIORITY_BY=byV(PRIORITIES), FIT_BY=byV(FITS);

export function l3Of(code){ return code.split(".").slice(0,3).join(".")+".000"; }

/* ── Local settings ── */
function store(key,value){
  try{
    if(value===undefined) return localStorage.getItem(key)||"";
    if(value) localStorage.setItem(key,value); else localStorage.removeItem(key);
  }catch(_){ return ""; }
}
export const getVendorKey = () => store("catalogue.vendorKey");
export const setVendorKey = k => store("catalogue.vendorKey",k||null);

function projectSlugFromUrl(){
  try{ return new URLSearchParams(window.location.search).get("project")||""; }catch(_){ return ""; }
}

async function api(path,{method="GET",body}={}){
  const headers={"content-type":"application/json"};
  const key=getVendorKey(); if(key) headers["x-vendor-key"]=key;
  const res=await fetch(`/api/${path}`,{method,headers,body:body?JSON.stringify(body):undefined});
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
  return data;
}
export const listProjects  = () => api("projects");
export const createProject = (name,prefix,copyFrom) => api("projects",{method:"POST",body:{name,prefix,copyFrom}});
export const setProjectPrefix = (slug,prefix) => api(`projects/${encodeURIComponent(slug)}`,{method:"PATCH",body:{prefix}});

/* ── Project context ── */
const ProjectCtx=createContext(null);
export const useProject=()=>useContext(ProjectCtx);

export function ProjectProvider({children}){
  const [slug]=useState(projectSlugFromUrl);
  const [project,setProject]=useState(null);
  const [items,setItems]=useState({});
  const [status,setStatus]=useState(slug?"loading":"none"); // none|loading|ready|error
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(0);
  const [nodes,setNodes]=useState([]);        // custom processes/scenarios in this project
  const [lastAdded,setLastAdded]=useState(null);

  useEffect(()=>{
    if(!slug) return;
    api(`projects/${encodeURIComponent(slug)}`)
      .then(d=>{ setProject(d.project); setItems(d.items||{}); setNodes(d.nodes||[]); setStatus("ready"); })
      .catch(e=>{ setError(e.message); setStatus("error"); });
  },[slug]);

  const nodeApi=useCallback(async(fn)=>{
    setSaving(n=>n+1); setError("");
    try{ return await fn(); }
    catch(e){ setError(e.message); throw e; }
    finally{ setSaving(n=>n-1); }
  },[]);
  const base=`projects/${encodeURIComponent(slug)}/nodes`;
  const addNode=useCallback(fields=>nodeApi(async()=>{
    const {node}=await api(base,{method:"POST",body:fields});
    setNodes(cur=>[...cur,node].sort((a,b)=>a.code<b.code?-1:1)); setLastAdded({code:node.code});
    return node;
  }),[base,nodeApi]);
  const updateNode=useCallback((code,fields)=>nodeApi(async()=>{
    const {node}=await api(`${base}/${code}`,{method:"PUT",body:fields});
    setNodes(cur=>cur.map(n=>n.code===code?node:n));
  }),[base,nodeApi]);
  const deleteNode=useCallback(code=>nodeApi(async()=>{
    await api(`${base}/${code}`,{method:"DELETE"});
    setNodes(cur=>cur.filter(n=>n.code!==code));
    setItems(cur=>{ const {[code]:_,...rest}=cur; return rest; });
  }),[base,nodeApi]);

  const save=useCallback(async(code,fields)=>{
    let previous;
    setItems(cur=>{ previous=cur[code]; return {...cur,[code]:{...(cur[code]||{}),...fields}}; });
    setSaving(n=>n+1); setError("");
    try{
      const d=await api(`projects/${encodeURIComponent(slug)}/items/${code}`,{method:"PUT",body:fields});
      setItems(cur=>({...cur,[code]:d.item}));
    }catch(e){
      setItems(cur=>({...cur,[code]:previous}));
      setError(e.message);
    }finally{ setSaving(n=>n-1); }
  },[slug]);

  const vendor=!IS_CLIENT&&!!getVendorKey();
  const value=useMemo(()=>({
    slug,project,items,status,error,saving:saving>0,save,
    nodes,addNode,updateNode,deleteNode,lastAdded,
    active:status==="ready",
    isMaster:!!project?.is_master,
    canEditFit:vendor,
    // Clients manage what they added; library (master-sourced) nodes need the iCatalyst key.
    canEditNode:node=>node.source==="client"||vendor,
    canAddNodes:status==="ready"&&(project?.is_master?vendor:!!project?.prefix),
  }),[slug,project,items,status,error,saving,save,nodes,addNode,updateNode,deleteNode,lastAdded,vendor]);
  return <ProjectCtx.Provider value={value}>{children}</ProjectCtx.Provider>;
}

/* Ancestors of a code, nearest first: scenario → process → process area → end-to-end. */
function ancestors(code){
  const s=code.split(".");
  return [...new Set([l3Of(code),`${s[0]}.${s[1]}.000.000`,`${s[0]}.00.000.000`])].filter(c=>isAncestor(c,code));
}
function isAncestor(a,code){
  const [a0,a1,a2]=a.split("."), [c0,c1,c2]=code.split(".");
  if(a===code||a0!==c0) return false;
  if(a1==="00") return true;                        // end-to-end (L1)
  if(a1!==c1) return false;
  if(a2==="000") return code.split(".")[2]!=="000"; // process area (L2) over processes/scenarios
  return a2===c2&&a===l3Of(code);                   // process (L3) over its scenarios
}
const LEVEL_NAMES={1:"end-to-end process",2:"process area",3:"process"};
const levelOf=code=>{ const s=code.split("."); return s[1]==="00"?1:s[2]==="000"?2:s.length===4&&s[3]==="000"?3:4; };

/* Effective decision for a code: the nearest decision up the hierarchy applies unless overridden. */
export function effectiveScope(items,code){
  const own=items[code]?.scope;
  if(own) return {scope:own,inherited:false};
  for(const a of ancestors(code)) if(items[a]?.scope) return {scope:items[a].scope,inherited:true,from:LEVEL_NAMES[levelOf(a)]};
  return {scope:"",inherited:false};
}

/* ── Small UI pieces ── */
const label={fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:6};
const inputStyle={width:"100%",boxSizing:"border-box",background:"#0e0f14",border:"1px solid rgba(20,190,240,0.2)",
  borderRadius:7,color:"#e8edf4",fontSize:12,padding:"6px 8px",fontFamily:"inherit",outline:"none"};

function Pill({text,color,bg,faded,title}){
  return <span title={title} style={{fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap",
    color,background:bg,opacity:faded?0.55:1,border:faded?`1px dashed ${color}`:"1px solid transparent"}}>{text}</span>;
}

export function ScopeBadge({code}){
  const p=useProject();
  if(!p?.active) return null;
  const {scope,inherited,from}=effectiveScope(p.items,code);
  const fit=FIT_BY[p.items[code]?.fit];
  const s=SCOPE_BY[scope];
  return <>
    {s&&<Pill text={s.label} color={s.color} bg={s.bg} faded={inherited} title={inherited?`Inherited from the ${from}`:undefined}/>}
    {fit&&<Pill text={fit.label} color={fit.color} bg={fit.bg} title="iCatalyst fit/gap assessment"/>}
  </>;
}

function Segmented({options,value,onChange,disabled}){
  return <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
    {options.map(o=>{
      const on=value===o.v;
      return <button key={o.v} disabled={disabled} onClick={()=>onChange(on?"":o.v)}
        style={{fontSize:11,padding:"4px 9px",borderRadius:20,cursor:disabled?"default":"pointer",fontFamily:"inherit",
          border:`1px solid ${on?(o.color||"#14BEF0"):"rgba(20,190,240,0.2)"}`,
          background:on?(o.bg||"rgba(20,190,240,0.12)"):"transparent",
          color:on?(o.color||"#14BEF0"):"#8a9ab0",fontWeight:on?600:400}}>{o.label}</button>;
    })}
  </div>;
}

// Text field that saves when the user leaves it, not on every keystroke.
function BlurField({value,onSave,multiline,placeholder,maxLength}){
  const [draft,setDraft]=useState(value||"");
  useEffect(()=>setDraft(value||""),[value]);
  const Tag=multiline?"textarea":"input";
  return <Tag value={draft} placeholder={placeholder} maxLength={maxLength} rows={multiline?4:undefined}
    onChange={e=>setDraft(e.target.value)}
    onBlur={()=>{ if(draft!==(value||"")) onSave(draft); }}
    style={{...inputStyle,resize:multiline?"vertical":undefined}}/>;
}

export function ScopeEditor({item}){
  const p=useProject();
  const level=item.l??levelOf(item.q); // home-screen EPIC cards carry no level field
  if(!p?.active||!(level>=1&&level<=4)) return null;
  const rec=p.items[item.q]||{};
  const {scope,inherited,from}=effectiveScope(p.items,item.q);
  const set=f=>p.save(item.q,f);
  const fit=FIT_BY[rec.fit];

  return <div style={{margin:"0 0 16px",padding:12,borderRadius:10,background:"#0e1828",border:"1px solid rgba(20,190,240,0.25)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <span style={{fontSize:11,fontWeight:700,color:"#14BEF0"}}>Project scoping</span>
      <span style={{fontSize:10,color:p.error?"#F16320":"#6b7a90"}}>{p.error||(p.saving?"Saving…":"Saved")}</span>
    </div>

    <div style={label}>Scope</div>
    <Segmented options={SCOPES} value={rec.scope||""} onChange={v=>set({scope:v})}/>
    {inherited&&<div style={{fontSize:10,color:"#6b7a90",marginTop:5}}>
      Following the {from}: {SCOPE_BY[scope].label.toLowerCase()}. Choose an option to override it here.</div>}
    {level<=2&&<div style={{fontSize:10,color:"#6b7a90",marginTop:5}}>
      Applies to everything beneath this {LEVEL_NAMES[level]} unless set lower down.</div>}

    <div style={{...label,marginTop:12}}>Priority</div>
    <select value={rec.priority||""} onChange={e=>set({priority:e.target.value})} style={inputStyle}>
      <option value="">Not set</option>
      {PRIORITIES.map(o=><option key={o.v} value={o.v}>{o.label}</option>)}
    </select>

    <div style={{...label,marginTop:12}}>Process owner</div>
    <BlurField value={rec.owner} onSave={v=>set({owner:v})} placeholder="Name or role" maxLength={120}/>

    <div style={{...label,marginTop:12}}>Notes</div>
    <BlurField value={rec.notes} onSave={v=>set({notes:v})} multiline placeholder="How your business runs this today, variations, questions…" maxLength={4000}/>

    <div style={{...label,marginTop:14,display:"flex",justifyContent:"space-between"}}>
      <span>Fit / gap</span><span style={{textTransform:"none",letterSpacing:0,fontWeight:400}}>set by iCatalyst</span>
    </div>
    {p.canEditFit
      ?<>
        <Segmented options={FITS} value={rec.fit||""} onChange={v=>set({fit:v})}/>
        <div style={{marginTop:8}}>
          <BlurField value={rec.fit_notes} onSave={v=>set({fit_notes:v})} multiline placeholder="Fit/gap reasoning, proposed solution…" maxLength={4000}/>
        </div>
      </>
      :<div style={{fontSize:12,color:"#8a9ab0"}}>
        {fit?<Pill text={fit.label} color={fit.color} bg={fit.bg}/>:"Not yet assessed"}
        {rec.fit_notes&&<p style={{margin:"8px 0 0",lineHeight:1.6,color:"#e8edf4",whiteSpace:"pre-wrap"}}>{rec.fit_notes}</p>}
      </div>}
  </div>;
}

/* ── Top bar: project name + summary button ── */
export function ProjectBar({onSummary,onProjects}){
  const p=useProject();
  const btn={background:"rgba(20,190,240,0.1)",border:"1px solid rgba(20,190,240,0.25)",borderRadius:8,color:"#14BEF0",
    cursor:"pointer",fontSize:11,fontWeight:700,height:30,padding:"0 12px",fontFamily:"inherit",flexShrink:0};
  return <>
    {p?.status==="loading"&&<span style={{fontSize:11,color:"#6b7a90"}}>Loading project…</span>}
    {p?.status==="error"&&<span style={{fontSize:11,color:"#F16320"}}>Project link not valid</span>}
    {p?.active&&<>
      <span style={{fontSize:12,color:p.isMaster?"#14BEF0":"#e8edf4",fontWeight:600,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
        title={p.isMaster?"Editing the master library: changes apply to client projects created from now on":p.project.name}>
        {p.isMaster?"✎ ":""}{p.project.name}</span>
      <button style={btn} onClick={onSummary}>Scope summary</button>
    </>}
    {!IS_CLIENT&&<button style={btn} onClick={onProjects}>Projects</button>}
  </>;
}

/* ── Scope summary + exports ── */
const SOURCE_LABEL={microsoft:"Microsoft",master:"iCatalyst library",client:"Client-specific"};
function csvCell(v){ const s=String(v??""); return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function downloadCsv(filename,rows){
  const text="﻿"+rows.map(r=>r.map(csvCell).join(",")).join("\r\n"); // BOM so Excel reads UTF-8
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
  a.download=filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
const fileBase=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");

export function ScopeSummary({summary,perL1,famIndex,famFilter,inFamily,onOpenL1}){
  const p=useProject();
  const allowedL3=useMemo(()=>famFilter?new Set(famIndex[famFilter]?.l3||[]):null,[famFilter,famIndex]);

  // Every catalogue item by code, and the L3s shown in the current edition.
  const {byCode,l3s}=useMemo(()=>{
    const byCode={}; const l3s=[];
    for(const list of Object.values(perL1)) for(const it of list){
      byCode[it.q]=it;
      if(it.l===3&&(!allowedL3||allowedL3.has(it.q))) l3s.push(it);
    }
    return {byCode,l3s};
  },[perL1,allowedL3]);

  if(!p?.active) return null;
  const items=p.items;
  // Hierarchy above a code (the code itself counts at its own level, nothing below it).
  const parentsOf=code=>{
    const s=code.split("."), lvl=levelOf(code);
    return {l1:byCode[`${s[0]}.00.000.000`],l2:lvl>=2?byCode[`${s[0]}.${s[1]}.000.000`]:undefined,l3:lvl>=3?byCode[l3Of(code)]:undefined};
  };

  const rows=summary.map((l1,i)=>{
    const mine=l3s.filter(x=>x.q.startsWith(l1.q.split(".")[0]+"."));
    const count=v=>mine.filter(x=>effectiveScope(items,x.q).scope===v).length;
    return {l1,i,total:mine.length,in:count("in"),later:count("later"),out:count("out"),open:count("")};
  }).filter(r=>r.total>0);
  const tot=rows.reduce((a,r)=>({total:a.total+r.total,in:a.in+r.in,later:a.later+r.later,out:a.out+r.out,open:a.open+r.open}),
    {total:0,in:0,later:0,out:0,open:0});
  const decided=tot.total-tot.open;
  const fitCounts=FITS.map(f=>({...f,n:Object.entries(items).filter(([c,r])=>r.fit===f.v&&effectiveScope(items,c).scope==="in").length}));

  function exportDecisions(){
    const header=["Code","Level","Source","End-to-end (L1)","Process area (L2)","Process (L3)","Title","Description","Products","Scope","Inherited","Priority","Owner","Notes","Fit/gap","Fit/gap notes","Last updated"];
    // Every decision, plus custom processes even when nothing has been decided on them yet.
    const codes=[...new Set([...Object.keys(items),...p.nodes.map(n=>n.code)])].filter(c=>byCode[c]).sort();
    const out=[header];
    for(const c of codes){
      const it=byCode[c], r=items[c]||{}, par=parentsOf(c), eff=effectiveScope(items,c);
      out.push([c,`L${it.l}`,SOURCE_LABEL[it.custom||"microsoft"],par.l1?.t,par.l2?.t,par.l3?.t,it.t,it.custom?it.d:"",it.custom?it.p:"",SCOPE_BY[eff.scope]?.label||"",eff.inherited?"Yes":"",
        PRIORITY_BY[r.priority]?.label||"",r.owner,r.notes,FIT_BY[r.fit]?.label||"",r.fit_notes,r.updated_at]);
    }
    downloadCsv(`${fileBase(p.project.name)}-scope.csv`,out);
  }

  // Azure DevOps CSV import (tree format): Epic = L1, Feature = L2, User Story = in-scope L3.
  function exportAdo(){
    const out=[["ID","Work Item Type","Title 1","Title 2","Title 3","Priority","Tags","Description"]];
    const inL3=l3s.filter(x=>effectiveScope(items,x.q).scope==="in").sort((a,b)=>a.q.localeCompare(b.q));
    let lastL1="",lastL2="";
    for(const l3 of inL3){
      const par=parentsOf(l3.q), r=items[l3.q]||{};
      if(par.l1&&par.l1.q!==lastL1){ out.push(["","Epic",`${par.l1.q} ${par.l1.t}`,"","","","",par.l1.d||""]); lastL1=par.l1.q; lastL2=""; }
      if(par.l2&&par.l2.q!==lastL2){ out.push(["","Feature","",`${par.l2.q} ${par.l2.t}`,"","","",par.l2.d||""]); lastL2=par.l2.q; }
      const pfx=l3.q.split(".").slice(0,3).join(".")+".";
      const scen=Object.values(byCode).filter(x=>x.l===4&&x.q.startsWith(pfx)&&effectiveScope(items,x.q).scope==="in"
        &&inFamily(x,famFilter)).sort((a,b)=>a.q.localeCompare(b.q));
      const desc=[
        l3.d,
        r.owner&&`<b>Process owner:</b> ${r.owner}`,
        r.notes&&`<b>Client notes:</b> ${r.notes}`,
        r.fit&&`<b>Fit/gap:</b> ${FIT_BY[r.fit].label}${r.fit_notes?` — ${r.fit_notes}`:""}`,
        scen.length&&`<b>In-scope scenarios:</b><ul>${scen.map(s=>`<li>${s.q} ${s.t}</li>`).join("")}</ul>`,
      ].filter(Boolean).join("<br/><br/>");
      const tags=["BPC",l3.custom&&SOURCE_LABEL[l3.custom],r.fit&&`Fit: ${FIT_BY[r.fit].label}`].filter(Boolean).join("; ");
      out.push(["","User Story","","",`${l3.q} ${l3.t}`,PRIORITY_BY[r.priority]?.ado||"",tags,desc]);
    }
    downloadCsv(`${fileBase(p.project.name)}-azure-devops.csv`,out);
  }

  const th={textAlign:"left",fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.6px",padding:"8px 10px",borderBottom:"1px solid rgba(20,190,240,0.15)"};
  const td={fontSize:12,padding:"8px 10px",borderBottom:"1px solid #0e0f14"};
  const num=(v,color)=><td style={{...td,textAlign:"right",color:v?color:"#3b4556",fontVariantNumeric:"tabular-nums"}}>{v}</td>;
  const btn={background:"rgba(20,190,240,0.1)",border:"1px solid rgba(20,190,240,0.3)",borderRadius:8,color:"#14BEF0",
    cursor:"pointer",fontSize:12,fontWeight:600,padding:"7px 14px",fontFamily:"inherit"};

  return <div style={{padding:22,maxWidth:980}}>
    <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",color:"#14BEF0",marginBottom:6}}>Scope summary</div>
    <div style={{fontSize:20,fontWeight:700,color:"#e8edf4",marginBottom:4}}>{p.project.name}</div>
    <div style={{fontSize:12,color:"#8a9ab0",marginBottom:16}}>
      {decided} of {tot.total} processes decided ({tot.total?Math.round(decided/tot.total*100):0}%).
      Open a process and use <b>Project scoping</b> in the right-hand panel to record decisions.
    </div>

    <div style={{height:8,borderRadius:4,background:"#0e0f14",display:"flex",overflow:"hidden",marginBottom:18}}>
      {[["in","#14F032"],["later","#F5B83D"],["out","#8a9ab0"]].map(([k,c])=>
        <div key={k} style={{width:`${tot.total?tot[k]/tot.total*100:0}%`,background:c}}/>)}
    </div>

    <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
      <button style={btn} onClick={exportDecisions}>⬇ Export decisions (Excel CSV)</button>
      <button style={btn} onClick={exportAdo}>⬇ Export for Azure DevOps</button>
    </div>

    <table style={{width:"100%",borderCollapse:"collapse",marginBottom:22}}>
      <thead><tr>
        <th style={th}>End-to-end process</th>
        <th style={{...th,textAlign:"right"}}>Processes</th><th style={{...th,textAlign:"right"}}>In scope</th>
        <th style={{...th,textAlign:"right"}}>Later</th><th style={{...th,textAlign:"right"}}>Out</th>
        <th style={{...th,textAlign:"right"}}>Undecided</th>
      </tr></thead>
      <tbody>
        {rows.map(r=><tr key={r.l1.q} onClick={()=>onOpenL1(r.i)} style={{cursor:"pointer"}}
          onMouseEnter={e=>e.currentTarget.style.background="#0e1828"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <td style={{...td,color:"#e8edf4"}}><span style={{fontFamily:"monospace",fontSize:10,color:"#6b7a90",marginRight:8}}>{r.l1.q.slice(0,2)}</span>{r.l1.t}</td>
          {num(r.total,"#e8edf4")}{num(r.in,"#14F032")}{num(r.later,"#F5B83D")}{num(r.out,"#8a9ab0")}{num(r.open,"#e8edf4")}
        </tr>)}
        <tr style={{fontWeight:700}}>
          <td style={{...td,color:"#e8edf4"}}>Total</td>
          {num(tot.total,"#e8edf4")}{num(tot.in,"#14F032")}{num(tot.later,"#F5B83D")}{num(tot.out,"#8a9ab0")}{num(tot.open,"#e8edf4")}
        </tr>
      </tbody>
    </table>

    <div style={label}>Fit / gap of in-scope items (iCatalyst assessment)</div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {fitCounts.map(f=><div key={f.v} style={{padding:"8px 12px",borderRadius:8,background:f.bg,minWidth:90}}>
        <div style={{fontSize:18,fontWeight:700,color:f.color}}>{f.n}</div>
        <div style={{fontSize:11,color:"#8a9ab0"}}>{f.label}</div>
      </div>)}
    </div>
  </div>;
}

/* ── iCatalyst: manage projects ── */
export function ProjectsPanel({open,onClose}){
  const [key,setKey]=useState(getVendorKey());
  const [projects,setProjects]=useState(null);
  const [name,setName]=useState("");
  const [initials,setInitials]=useState("");
  const [error,setError]=useState("");
  const [copied,setCopied]=useState("");

  const load=useCallback(()=>{
    if(!getVendorKey()) return;
    setError("");
    listProjects().then(d=>setProjects(d.projects)).catch(e=>{ setError(e.message); setProjects(null); });
  },[]);
  useEffect(()=>{ if(open) load(); },[open,load]);
  if(!open) return null;

  const linkFor=slug=>`${window.location.origin}/?project=${slug}`;
  const run=async fn=>{ setError(""); try{ await fn(); load(); }catch(e){ setError(e.message); } };
  const create=()=>name.trim()&&run(async()=>{ await createProject(name.trim(),initials.trim()); setName(""); setInitials(""); });
  function duplicate(pr){
    const newName=window.prompt(`New client name (starts with a copy of "${pr.name}"):`,"");
    if(!newName?.trim()) return;
    const pfx=window.prompt("Client initials (2–4 letters, used in the codes of processes they add):","");
    if(!pfx?.trim()) return;
    run(()=>createProject(newName.trim(),pfx.trim(),pr.slug));
  }
  function setPrefix(pr){
    const pfx=window.prompt(`Initials for ${pr.name} (2–4 letters). They become part of the codes of processes this client adds, so they can't be changed later.`,"");
    if(pfx?.trim()) run(()=>setProjectPrefix(pr.slug,pfx.trim()));
  }
  function copy(slug){
    navigator.clipboard?.writeText(linkFor(slug)).then(()=>{ setCopied(slug); setTimeout(()=>setCopied(""),1500); });
  }
  const btn={background:"rgba(20,190,240,0.12)",border:"1px solid rgba(20,190,240,0.3)",borderRadius:7,color:"#14BEF0",
    cursor:"pointer",fontSize:11,fontWeight:600,padding:"6px 10px",fontFamily:"inherit",whiteSpace:"nowrap"};
  const master=projects?.find(p=>p.is_master);
  const clients=projects?.filter(p=>!p.is_master)||[];
  const plural=(n,w)=>`${n} ${w}${n===1?"":"s"}`;
  const stats=pr=>`${plural(pr.decisions,"decision")} · ${pr.custom_nodes} custom${pr.last_updated?` · updated ${pr.last_updated.slice(0,10)}`:""}`;

  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:300,display:"flex",justifyContent:"flex-end"}}>
    <div onClick={e=>e.stopPropagation()} style={{width:460,maxWidth:"100%",height:"100%",background:"#13151f",
      borderLeft:"1px solid rgba(20,190,240,0.2)",padding:20,overflowY:"auto",boxSizing:"border-box"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <span style={{fontSize:15,fontWeight:700,color:"#e8edf4"}}>Projects</span>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#e8edf4",fontSize:20,cursor:"pointer"}}>×</button>
      </div>

      <div style={label}>iCatalyst key</div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        <input type="password" value={key} onChange={e=>setKey(e.target.value)} placeholder="Paste the iCatalyst key" style={inputStyle}/>
        <button style={btn} onClick={()=>{ setVendorKey(key.trim()); load(); }}>Save</button>
      </div>
      <div style={{fontSize:11,color:"#6b7a90",margin:"-12px 0 18px"}}>Stored in this browser only. It lets you manage projects, the master library and fit/gap. Reload an open project after saving it.</div>

      {error&&<div style={{fontSize:12,color:"#F16320",marginBottom:12}}>{error}</div>}

      {master&&<div style={{padding:"12px",borderRadius:8,background:"rgba(20,190,240,0.08)",border:"1px solid rgba(20,190,240,0.3)",marginBottom:18}}>
        <div style={{fontSize:13,fontWeight:700,color:"#14BEF0"}}>{master.name}</div>
        <div style={{fontSize:11,color:"#8a9ab0",margin:"3px 0 8px",lineHeight:1.5}}>
          iCatalyst processes (codes with “i”) and default decisions. Every new client project starts with a copy. {stats(master)}</div>
        <a href={linkFor(master.slug)} style={{...btn,textDecoration:"none"}}>Open master library</a>
      </div>}

      {projects&&<>
        <div style={label}>New client project</div>
        <div style={{display:"flex",gap:6,marginBottom:4}}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Client name" style={inputStyle}/>
          <input value={initials} onChange={e=>setInitials(e.target.value.toUpperCase().replace(/[^A-Z]/g,"").slice(0,4))}
            onKeyDown={e=>e.key==="Enter"&&create()} placeholder="Initials" style={{...inputStyle,width:80,flexShrink:0}}/>
          <button style={btn} onClick={create}>Create</button>
        </div>
        <div style={{fontSize:11,color:"#6b7a90",marginBottom:18}}>Starts from a copy of the master library. Initials (2–4 letters) prefix the codes of processes the client adds, e.g. ACM → 10.05.ACM010.000.</div>

        <div style={label}>Client projects ({clients.length})</div>
        {clients.length===0&&<div style={{fontSize:12,color:"#8a9ab0"}}>No client projects yet.</div>}
        {clients.map(pr=><div key={pr.slug} style={{padding:"10px 12px",borderRadius:8,background:"#0e0f14",marginBottom:6}}>
          <div style={{fontSize:13,fontWeight:600,color:"#e8edf4"}}>{pr.name}
            {pr.prefix&&<span style={{marginLeft:8,fontFamily:"monospace",fontSize:11,color:"#F5B83D"}}>{pr.prefix}</span>}</div>
          <div style={{fontSize:11,color:"#6b7a90",margin:"2px 0 8px"}}>{stats(pr)}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <a href={linkFor(pr.slug)} style={{...btn,textDecoration:"none"}}>Open</a>
            <button style={btn} onClick={()=>copy(pr.slug)}>{copied===pr.slug?"Copied":"Copy client link"}</button>
            <button style={btn} onClick={()=>duplicate(pr)}>Duplicate</button>
            {!pr.prefix&&<button style={{...btn,color:"#F5B83D",borderColor:"rgba(245,184,61,0.4)"}} onClick={()=>setPrefix(pr)}>Set initials</button>}
          </div>
        </div>)}
      </>}
    </div>
  </div>;
}

/* ── Custom processes and scenarios ── */
export function CustomBadge({item}){
  if(!item.custom) return null;
  const master=item.custom==="master";
  return <span title={master?"From the iCatalyst library":"Added for this client"}
    style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap",
      color:master?"#14BEF0":"#F5B83D",background:master?"rgba(20,190,240,0.12)":"rgba(245,184,61,0.12)"}}>
    {master?"iCatalyst":"Client"}</span>;
}

function NodeForm({initial={},productOptions,onSubmit,onCancel,submitLabel}){
  const [title,setTitle]=useState(initial.title||"");
  const [description,setDescription]=useState(initial.description||"");
  const [products,setProducts]=useState((initial.products||"").split(";").map(s=>s.trim()).filter(Boolean));
  const [busy,setBusy]=useState(false);
  const toggle=p=>setProducts(cur=>cur.includes(p)?cur.filter(x=>x!==p):[...cur,p]);
  async function submit(){
    if(!title.trim()||busy) return;
    setBusy(true);
    try{ await onSubmit({title:title.trim(),description:description.trim(),products:products.join("; ")}); }
    catch(_){ /* error shown by the project context */ }
    finally{ setBusy(false); }
  }
  return <div onClick={e=>e.stopPropagation()} style={{padding:12,borderRadius:10,background:"#0e1828",border:"1px solid rgba(20,190,240,0.25)",margin:"6px 0"}}>
    <input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title" maxLength={200}
      onKeyDown={e=>e.key==="Enter"&&submit()} style={{...inputStyle,marginBottom:8}}/>
    <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optional)" rows={3}
      maxLength={8000} style={{...inputStyle,resize:"vertical",marginBottom:8}}/>
    {productOptions?.length>0&&<>
      <div style={label}>Products</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:10}}>
        {productOptions.map(p=>{ const on=products.includes(p); return <button key={p} onClick={()=>toggle(p)}
          style={{fontSize:10.5,padding:"3px 8px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
            border:`1px solid ${on?"#14BEF0":"rgba(20,190,240,0.2)"}`,background:on?"rgba(20,190,240,0.14)":"transparent",
            color:on?"#14BEF0":"#8a9ab0"}}>{p}</button>; })}
      </div>
    </>}
    <div style={{display:"flex",gap:6}}>
      <button onClick={submit} disabled={!title.trim()||busy} style={{fontSize:11,fontWeight:700,padding:"6px 12px",borderRadius:7,cursor:"pointer",
        fontFamily:"inherit",border:"1px solid #14BEF0",background:"rgba(20,190,240,0.18)",color:"#14BEF0",opacity:title.trim()?1:0.5}}>
        {busy?"Saving…":submitLabel}</button>
      <button onClick={onCancel} style={{fontSize:11,padding:"6px 12px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
        border:"1px solid rgba(138,154,176,0.3)",background:"transparent",color:"#8a9ab0"}}>Cancel</button>
    </div>
  </div>;
}

// "+ Add process" (level 3, parent = process area) or "+ Add scenario" (level 4, parent = process).
export function AddNodeButton({level,parent,productOptions}){
  const p=useProject();
  const [open,setOpen]=useState(false);
  if(!p?.canAddNodes) return null;
  const what=level===3?"process":"scenario";
  if(!open) return <button onClick={e=>{e.stopPropagation();setOpen(true);}}
    style={{fontSize:11,fontWeight:600,padding:"6px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",margin:"4px 0 8px",
      border:"1px dashed rgba(20,190,240,0.4)",background:"transparent",color:"#14BEF0"}}>
    + Add {p.isMaster?"iCatalyst ":""}{what}</button>;
  return <NodeForm productOptions={productOptions} submitLabel={`Add ${what}`} onCancel={()=>setOpen(false)}
    onSubmit={async f=>{ await p.addNode({level,parent,...f}); setOpen(false); }}/>;
}

// Shown in the details panel for a custom item: where it came from, edit and remove.
export function CustomNodePanel({item,productOptions,onDeleted}){
  const p=useProject();
  const [editing,setEditing]=useState(false);
  const node=p?.nodes.find(n=>n.code===item.q);
  if(!p?.active||!node) return null;
  const editable=p.canEditNode(node);
  const master=node.source==="master";
  async function remove(){
    if(!window.confirm(`Remove "${node.title}" and any decisions recorded against it?`)) return;
    try{ await p.deleteNode(node.code); onDeleted?.(); }catch(_){}
  }
  return <div style={{margin:"0 0 14px",padding:"10px 12px",borderRadius:10,
    background:master?"rgba(20,190,240,0.06)":"rgba(245,184,61,0.06)",border:`1px solid ${master?"rgba(20,190,240,0.25)":"rgba(245,184,61,0.3)"}`}}>
    <div style={{fontSize:11,color:master?"#14BEF0":"#F5B83D",fontWeight:700,marginBottom:4}}>
      {master?"iCatalyst library process":"Added for this client"}</div>
    <div style={{fontSize:11,color:"#8a9ab0",lineHeight:1.5,marginBottom:editable?8:0}}>
      {master?"Part of iCatalyst's standard library, not Microsoft's catalogue.":"Specific to this client; not part of Microsoft's catalogue."}
      {!editable&&" Only iCatalyst can change it."}</div>
    {editable&&!editing&&<div style={{display:"flex",gap:6}}>
      <button onClick={()=>setEditing(true)} style={{fontSize:11,padding:"4px 10px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
        border:"1px solid rgba(20,190,240,0.3)",background:"transparent",color:"#14BEF0"}}>Edit</button>
      <button onClick={remove} style={{fontSize:11,padding:"4px 10px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",
        border:"1px solid rgba(241,99,32,0.3)",background:"transparent",color:"#F16320"}}>Remove</button>
    </div>}
    {editing&&<NodeForm initial={node} productOptions={productOptions} submitLabel="Save" onCancel={()=>setEditing(false)}
      onSubmit={async f=>{ await p.updateNode(node.code,f); setEditing(false); }}/>}
    {p.error&&<div style={{fontSize:11,color:"#F16320",marginTop:6}}>{p.error}</div>}
  </div>;
}
