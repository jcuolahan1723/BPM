import { useState, useMemo, useRef, useEffect } from "react";
import { IS_CLIENT, useProject, ScopeBadge, ScopeEditor, ProjectBar, ScopeSummary, ProjectsPanel,
  CustomBadge, AddNodeButton, CustomNodePanel } from "./project.jsx";
import { SUMMARY, PER_L1, SP_INDEX, TC_INDEX, FAM_INDEX, TOTALS, APP_FAMILIES, CATALOGUE_INFO } from "./catalogue-data.js";


const LCFG = {
  1:{label:"L1 — End to End (EPIC)",  short:"L1",color:"#14BEF0",bg:"rgba(20,190,240,0.12)",border:"rgba(20,190,240,0.3)"},
  2:{label:"L2 — Process Area",        short:"L2",color:"#0E94A8",bg:"rgba(14,148,168,0.12)", border:"rgba(14,148,168,0.3)"},
  3:{label:"L3 — Business Process",    short:"L3",color:"#1377F0",bg:"rgba(19,119,240,0.12)", border:"rgba(19,119,240,0.3)"},
  4:{label:"L4 — Scenario",            short:"L4",color:"#F16320",bg:"rgba(241,99,32,0.12)", border:"rgba(241,99,32,0.3)"},
  5:{label:"L5 — System Process",      short:"L5",color:"#0E94A8",bg:"rgba(114,216,246,0.12)", border:"rgba(114,216,246,0.3)"},
  6:{label:"L6 — Test Case / Config",  short:"L6",color:"#14F032",bg:"rgba(20,240,50,0.12)",border:"rgba(20,240,50,0.3)"},
};

function getPrefix(seq){ return seq.split(".")[0]; }
function getL4Parent(seq){ return seq.split(".").slice(0,4).join("."); }
function getL5Parent(seq){ return seq.split(".").slice(0,5).join("."); }

function fitInfo(f=""){
  const fl=(f||"").toLowerCase();
  if(fl.includes("fit")&&!fl.includes("gap")) return {label:"Fit",        color:"#0E94A8",bg:"rgba(14,148,168,0.12)"};
  if(fl.includes("gap"))                       return {label:"Gap",        color:"#F16320",bg:"rgba(241,99,32,0.12)"};
  if(fl.includes("partial"))                   return {label:"Partial Fit",color:"#F16320",bg:"rgba(241,99,32,0.12)"};
  return                                               {label:"Unspecified",color:"#6b7a90",bg:"rgba(107,114,128,0.12)"};
}
function hasProduct(item,prod){
  return !prod||(item.p||"").split(";").map(s=>s.trim()).includes(prod);
}


/* ── L5 DESCRIPTION PARSER ── */
function parseL5Desc(raw) {
  if (!raw || !raw.trim()) return { nav: null, steps: [], hasSteps: false };

  // Normalise wrapped lines within steps
  let text = raw.replace(/\n\s+/g, ' ').replace(/\n+/g, '\n').trim();

  // Format A: numbered  1. step  2. step
  if (/^\s*1\./m.test(text)) {
    const parts = text.split(/\n?\s*\d+\.\s+/).filter(s => s.trim());
    let nav = null;
    const steps = parts.map(s => {
      s = s.trim().replace(/;$/, '').replace(/\.$/, '');
      const nm = s.match(/navigate to\s+([^;.]+)/i);
      if (nm && !nav) {
        nav = nm[1].trim().replace(/[;>]\s*$/, '').replace(/\s+/g, ' ');
        const after = s.slice(nm.index + nm[0].length).replace(/^[;.\s]+/, '').trim();
        return after.length > 3
          ? { nav, action: after }
          : { nav: null, action: 'Navigate to ' + nav };
      }
      return { nav: null, action: s.replace(/\s+/g, ' ') };
    });
    return { nav, steps, hasSteps: true };
  }

  // Format B: semicolon-separated
  if (text.includes(';')) {
    const parts = text.split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    let nav = null;
    const steps = [];
    for (const p of parts) {
      const nm = p.match(/navigate to\s+([^;>]+(?:>[^;>]+)*)/i);
      if (nm && !nav) {
        nav = nm[1].trim().replace(/[;.>\s]+$/, '').replace(/\s+/g, ' ');
        const after = p.slice(nm.index + nm[0].length).replace(/^[;.\s]+/, '').trim();
        if (after && after.length > 3) steps.push({ nav, action: after });
        else steps.push({ nav: null, action: 'Navigate to ' + nav });
      } else {
        const clean = p.replace(/^[;.]+/, '').replace(/[;.]+$/, '').trim();
        if (clean && clean.length > 2) steps.push({ nav: null, action: clean });
      }
    }
    return { nav, steps, hasSteps: true };
  }

  // Format C: prose only
  const nm = text.match(/navigate to\s+([^.;]+)/i);
  return { nav: nm ? nm[1].trim() : null, steps: [], hasSteps: false };
}

function parseNavPath(nav) {
  if (!nav) return [];
  return nav.split('>').map(s => s.trim()).filter(Boolean);
}


/* ── PRIMITIVES ── */
function LBadge({level,style={}}){
  const c=LCFG[level]||{};
  return <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.7px",textTransform:"uppercase",
    padding:"2px 9px",borderRadius:20,background:c.bg,color:c.color,border:`1px solid ${c.border}`,...style}}>{c.short}</span>;
}
function Chip({text,color,bg}){
  return <span style={{fontSize:11,padding:"2px 9px",borderRadius:20,
    background:bg||"rgba(107,114,128,0.12)",color:color||"#e8edf4",fontWeight:500,whiteSpace:"nowrap"}}>{text}</span>;
}
function StatCard({label,value,color}){
  return <div style={{background:"#13151f",border:"1px solid #0e0f14",borderRadius:10,
    padding:"12px 16px",flex:1,minWidth:80}}>
    <div style={{fontSize:10,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:4}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,color:color||"#e8edf4",letterSpacing:"-0.5px"}}>
      {typeof value==="number"?value.toLocaleString():value}
    </div>
  </div>;
}
function Breadcrumb({items}){
  return <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13,flexWrap:"wrap"}}>
    {items.map((item,i)=>(
      <span key={i} style={{display:"flex",alignItems:"center",gap:6}}>
        {i>0&&<span style={{color:"#e8edf4"}}>›</span>}
        {item.onClick
          ?<span onClick={item.onClick} style={{color:"#14BEF0",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
              onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{item.label}</span>
          :<span style={{color:"#6b7a90"}}>{item.label}</span>}
      </span>
    ))}
  </div>;
}

/* ── OVERVIEW PANEL ── */
function OverviewPanel({item,stats,onClose,famFilter}){
  if(!item) return (
    <div style={{width:290,minWidth:290,background:"#13151f",borderLeft:"1px solid #0e0f14",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      padding:24,color:"#e8edf4",textAlign:"center",gap:10}}>
      <div style={{fontSize:28,opacity:0.25}}>◎</div>
      <div style={{fontSize:12,lineHeight:1.6}}>Select any item to see<br/>its overview here</div>
    </div>
  );
  const lc=LCFG[item.l]||{};
  const fi=item.l===4?fitInfo(item.f):null;
  const prods=(item.p||"").split(";").map(s=>s.trim()).filter(Boolean);
  const refs=(item.r||"").split(/\n|,(?=https?)/).map(s=>s.trim()).filter(Boolean);
  return (
    <div style={{width:290,minWidth:290,background:"#13151f",borderLeft:"1px solid #0e0f14",
      display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>
      <div style={{padding:"13px 14px 11px",borderBottom:"1px solid #0e0f14",
        background:"linear-gradient(135deg,#0e1828,#111d2e)",
        position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7}}>
          <LBadge level={item.l}/>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#e8edf4",
            fontSize:18,cursor:"pointer",lineHeight:1,padding:0}}
            onMouseEnter={e=>e.currentTarget.style.color="#14BEF0"}
            onMouseLeave={e=>e.currentTarget.style.color="#8a9ab0"}>×</button>
        </div>
        <div style={{fontFamily:"monospace",fontSize:10,color:"#e8edf4",marginBottom:4}}>{item.q}</div>
        <div style={{fontSize:13,fontWeight:700,color:"#e8edf4",lineHeight:1.4}}>{item.t}</div>
      </div>
      <div style={{padding:"14px",flex:1}}>
        {item.custom&&<CustomNodePanel key={"n"+item.q} item={item} productOptions={familyProductOptions(famFilter)} onDeleted={onClose}/>}
        <ScopeEditor key={item.q} item={item}/>
        {item.d
          ?<p style={{fontSize:12,color:"#e8edf4",lineHeight:1.75,margin:"0 0 14px 0"}}>{item.d}</p>
          :<p style={{fontSize:12,color:"#e8edf4",lineHeight:1.6,margin:"0 0 14px 0",fontStyle:"italic"}}>No description available.</p>
        }
        {stats&&stats.length>0&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>At a glance</div>
          <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:14}}>
            {stats.map(s=>(
              <div key={s.label} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"6px 10px",background:"#13151f",borderRadius:7,border:"1px solid #0e0f14"}}>
                <span style={{fontSize:11,color:"#6b7a90"}}>{s.label}</span>
                <span style={{fontSize:13,fontWeight:700,color:s.color||"#e8edf4"}}>
                  {typeof s.value==="number"?s.value.toLocaleString():s.value}
                </span>
              </div>
            ))}
          </div>
        </>}
        {prods.length>0&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>Products</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:14}}>
            {prods.map(p=><Chip key={p} text={p} color="#8a9ab0" bg="rgba(255,255,255,0.06)"/>)}
          </div>
        </>}
        {fi&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>Fit / Gap Status</div>
          <div style={{marginBottom:14}}><Chip text={fi.label} color={fi.color} bg={fi.bg}/></div>
        </>}
        {refs.length>0&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>Microsoft Docs</div>
          {refs.map((r,i)=>r.startsWith("http")
            ?<div key={i} style={{marginBottom:5}}>
               <a href={r} target="_blank" rel="noreferrer"
                 style={{color:"#14BEF0",fontSize:11,wordBreak:"break-all",lineHeight:1.4,display:"block"}}
                 onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
                 onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                 ↗ {r.replace(/https:\/\/learn\.microsoft\.com\/en-us\/dynamics365\//,"").replace("https://","")}
               </a>
             </div>
            :<div key={i} style={{fontSize:11,color:"#6b7a90",marginBottom:3}}>{r}</div>
          )}
        </>}
        <a href={`https://learn.microsoft.com/en-us/search/?terms=${encodeURIComponent(`Dynamics 365 ${item.t}`)}`}
          target="_blank" rel="noreferrer" style={{display:"inline-block",color:"#14BEF0",fontSize:11,margin:"4px 0 14px"}}>
          ↗ Search Microsoft Learn for this</a>
        {(item.m||item.mi)&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>D365 menu</div>
          {item.m&&<div style={{fontSize:11,color:"#e8edf4",lineHeight:1.5,marginBottom:4}}>{item.m.split(">").map(s=>s.trim()).join(" › ")}</div>}
          {item.mi&&<div style={{fontSize:11,color:"#8a9ab0",marginBottom:14}}>Menu item: <code style={{color:"#14BEF0"}}>{item.mi}</code></div>}
        </>}
        {(item.apqc||item.bpf)&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>References</div>
          {item.bpf&&<div style={{marginBottom:5}}><a href="https://aka.ms/businessprocessflow" target="_blank" rel="noreferrer"
            style={{color:"#14BEF0",fontSize:11}}>↗ Microsoft process flow available</a></div>}
          {item.apqc&&<div style={{fontSize:11,color:"#8a9ab0",marginBottom:14}}>APQC ID: {item.apqc}</div>}
        </>}
        {item.pr&&<>
          <div style={{fontSize:10,fontWeight:600,color:"#6b7a90",textTransform:"uppercase",letterSpacing:"0.8px",marginBottom:7}}>Partner references</div>
          {item.pr.split(/\s*\n\s*|,(?=\s*https?)/).filter(Boolean).map((r,i)=>r.startsWith("http")
            ?<div key={i} style={{marginBottom:5}}><a href={r} target="_blank" rel="noreferrer" style={{color:"#14BEF0",fontSize:11,wordBreak:"break-all"}}>↗ {r.replace("https://","")}</a></div>
            :<div key={i} style={{fontSize:11,color:"#6b7a90",marginBottom:3}}>{r}</div>)}
        </>}
      </div>
    </div>
  );
}

/* ── L5 SYSTEM PROCESS ROW ── */
function SysProcessRow({item, onSelect, selected}){
  const prefix = getPrefix(item.q);
  const tcList = (TC_INDEX[prefix]||{})[item.q]||[];
  const [open, setOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const isSelected = selected?.q===item.q;

  const parsed = useMemo(()=>parseL5Desc(item.d||''),[item.d]);
  // The catalogue's own menu path wins over one parsed from the description text.
  const navParts = useMemo(()=>parseNavPath(item.m||parsed.nav),[item.m,parsed.nav]);

  return (
    <div style={{marginBottom:6}}>
      {/* L5 header row */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",
        background:isSelected?"#1e2a38":"#0e1520",borderRadius:8,
        border:`1px solid ${isSelected?"#72D8F6":"rgba(114,216,246,0.35)"}`,transition:"all 0.12s"}}
        onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#c4e6f6"}}
        onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="#0e1520"}}>
        <span onClick={()=>onSelect({...item,l:5})} style={{fontFamily:"monospace",fontSize:10,
          color:"#6b7a90",minWidth:100,cursor:"pointer",paddingTop:1}}>{item.q}</span>
        <span onClick={()=>onSelect({...item,l:5})} style={{fontSize:12,
          color:isSelected?"#14BEF0":"#e8edf4",flex:1,lineHeight:1.4,
          cursor:"pointer",fontWeight:isSelected?500:400}}>{item.t}</span>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          {(parsed.hasSteps||navParts.length>0)&&(
            <button onClick={e=>{e.stopPropagation();setStepsOpen(o=>!o);}}
              title={parsed.hasSteps?"View step-by-step guide":"View D365 navigation path"}
              style={{fontSize:10,padding:"2px 8px",borderRadius:20,cursor:"pointer",
                fontFamily:"inherit",fontWeight:500,transition:"all 0.12s",whiteSpace:"nowrap",
                background:stepsOpen?"#0E94A8":"rgba(14,148,168,0.1)",
                color:stepsOpen?"white":"#0E94A8",
                border:`1px solid ${stepsOpen?"#0E94A8":"rgba(14,148,168,0.3)"}`}}>
              {stepsOpen?"▾ ":"▸ "}{parsed.hasSteps?"Steps":"Menu"}
            </button>
          )}
          {tcList.length>0&&(
            <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}}
              style={{fontSize:10,padding:"2px 8px",borderRadius:20,cursor:"pointer",
                fontFamily:"inherit",fontWeight:500,transition:"all 0.12s",whiteSpace:"nowrap",
                background:open?"#14F032":"rgba(20,240,50,0.1)",
                color:open?"#e8edf4":"#14F032",
                border:`1px solid ${open?"#14F032":"rgba(20,240,50,0.35)"}`}}>
              {open?"▾":"▸"} {tcList.length} test{tcList.length!==1?"s":""}
            </button>
          )}
        </div>
      </div>

      {/* Steps panel */}
      {stepsOpen&&(
        <div style={{margin:"4px 0 4px 12px",padding:"14px 16px",
          background:"#13151f",borderRadius:8,
          border:"1px solid rgba(14,148,168,0.25)",
          borderLeft:"3px solid #0E94A8"}}>

          {/* Nav path breadcrumb */}
          {navParts.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.7px",
                textTransform:"uppercase",color:"#6b7a90",marginBottom:6}}>Navigation path</div>
              <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:4,
                padding:"7px 10px",background:"#0e0f14",borderRadius:7,
                border:"1px solid rgba(20,190,240,0.2)"}}>
                {navParts.map((part,i)=>(
                  <span key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                    {i>0&&<span style={{color:"#5a6a80",fontSize:12}}>›</span>}
                    <span style={{fontSize:11,fontWeight:i===navParts.length-1?500:400,
                      color:i===navParts.length-1?"#14BEF0":"#3d3738"}}>{part}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Step cards */}
          {parsed.steps.length>0?(
            <>
              <div style={{fontSize:10,fontWeight:500,letterSpacing:"0.7px",
                textTransform:"uppercase",color:"#6b7a90",marginBottom:8}}>Steps</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {parsed.steps.map((step,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,
                    padding:"8px 11px",background:"#0e0f14",borderRadius:7,
                    border:"1px solid rgba(20,190,240,0.15)"}}>
                    <div style={{width:22,height:22,minWidth:22,borderRadius:"50%",
                      background:"rgba(20,190,240,0.15)",color:"#0E94A8",
                      fontSize:11,fontWeight:500,display:"flex",alignItems:"center",
                      justifyContent:"center",marginTop:1}}>{i+1}</div>
                    <div style={{flex:1}}>
                      {step.nav&&i===0&&(
                        <div style={{fontSize:10,color:"#5a6a80",marginBottom:2,
                          fontFamily:"monospace",lineHeight:1.4}}>
                          {step.nav}
                        </div>
                      )}
                      <div style={{fontSize:13,color:"#e8edf4",lineHeight:1.5,
                        fontWeight:step.action.toLowerCase().startsWith("click")||
                                   step.action.toLowerCase().startsWith("save")||
                                   step.action.toLowerCase().startsWith("navigate")?400:400}}>
                        {step.action}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ):(
            parsed.nav&&(
              <p style={{fontSize:13,color:"#8a9ab0",lineHeight:1.6,margin:0}}>{item.d}</p>
            )
          )}

          {/* MS Learn link */}
          {item.r&&item.r.startsWith("http")&&(
            <a href={item.r} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",gap:9,marginTop:12,
                padding:"9px 12px",background:"#0e0f14",borderRadius:8,
                border:"1px solid rgba(20,190,240,0.25)",textDecoration:"none",
                transition:"border-color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#14BEF0"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(20,190,240,0.25)"}>
              <div style={{width:22,height:22,minWidth:22,borderRadius:5,
                background:"rgba(20,190,240,0.15)",display:"flex",alignItems:"center",
                justifyContent:"center",fontSize:13}}>★</div>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:500,color:"#14BEF0"}}>Microsoft Learn</div>
                <div style={{fontSize:10,color:"#5a6a80",marginTop:1,wordBreak:"break-all"}}>
                  {item.r.replace("https://learn.microsoft.com/en-us/dynamics365/","dynamics365/")
                          .replace("https://learn.microsoft.com/en-us/","")
                          .replace("https://","")
                          .slice(0,80)}
                </div>
              </div>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="#96898C" style={{flexShrink:0}}>
                <path d="M8 0v2H2v12h12v-6h2v8H0V0h8zm6 0v6h-2V3.4L5.7 9.7 4.3 8.3 10.6 2H8V0h6z"/>
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Test cases */}
      {open&&tcList.length>0&&(
        <div style={{marginLeft:16,marginTop:4,paddingLeft:10,background:"#edf8fd",
          borderRadius:8,padding:10,borderLeft:"3px solid #72D8F6"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.8px",
            textTransform:"uppercase",color:"#72D8F6",marginBottom:7,
            display:"flex",alignItems:"center",gap:6}}>
            <span>L6 — Test Cases</span>
          </div>
          {tcList.map(tc=>(
            <div key={tc.q} onClick={()=>onSelect({...tc,l:6})}
              style={{display:"flex",alignItems:"flex-start",gap:8,padding:"7px 10px",
                background:selected?.q===tc.q?"#0e2018":"#0e1a12",borderRadius:6,
                marginBottom:3,cursor:"pointer",
                border:`1px solid ${selected?.q===tc.q?"#14F032":"transparent"}`,
                transition:"all 0.12s"}}
              onMouseEnter={e=>{if(selected?.q!==tc.q)e.currentTarget.style.background="#c8f5d8"}}
              onMouseLeave={e=>{if(selected?.q!==tc.q)e.currentTarget.style.background="#0e1a12"}}>
              <span style={{fontFamily:"monospace",fontSize:9,color:"#6b7a90",
                minWidth:108,paddingTop:1}}>{tc.q}</span>
              <span style={{fontSize:12,color:selected?.q===tc.q?"#14F032":"#8a9ab0",
                flex:1,lineHeight:1.4,fontWeight:selected?.q===tc.q?500:400}}>{tc.t}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ── SCENARIO SECTION (L4 + L5 + L6 drill-down) ── */
function ScenarioSection({item, onSelect, selected}){
  const prefix = getPrefix(item.q);
  const spList = (SP_INDEX[prefix]||{})[item.q]||[];
  const fi = fitInfo(item.f);
  const prods = (item.p||"").split(";").map(s=>s.trim()).filter(Boolean).slice(0,2);
  const isSelected = selected?.q===item.q;
  const [spOpen, setSpOpen] = useState(false);
  const project = useProject();
  const projectFit = project?.active && project.items[item.q]?.fit; // iCatalyst assessment replaces the catalogue default

  // Count total TCs for this scenario
  const totalTc = useMemo(()=>
    spList.reduce((a,sp)=>a+((TC_INDEX[prefix]||{})[sp.q]||[]).length,0),
  [spList,prefix]);

  return (
    <div style={{marginBottom:5}} data-code={item.q}>
      {/* L4 row */}
      <div style={{display:"flex",alignItems:"flex-start",gap:8,padding:"9px 12px",
        background:isSelected?"#1e1208":"#1a1208",borderRadius:8,cursor:"pointer",
        border:`1px solid ${isSelected?"#F16320":"transparent"}`,transition:"all 0.12s"}}
        onMouseEnter={e=>{if(!isSelected)e.currentTarget.style.background="#fac8b0"}}
        onMouseLeave={e=>{if(!isSelected)e.currentTarget.style.background="#1a1208"}}>
        <span onClick={()=>onSelect(item)} style={{fontFamily:"monospace",fontSize:10,
          color:"#e8edf4",minWidth:88,paddingTop:2}}>{item.q}</span>
        <div style={{flex:1}} onClick={()=>onSelect(item)}>
          <div style={{fontSize:13,color:isSelected?"#F16320":"#e8edf4",marginBottom:3,
            lineHeight:1.4,fontWeight:isSelected?600:400}}>{item.t}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:5,alignItems:"center"}}>
            {prods.map(p=><span key={p} style={{fontSize:10,color:"#8a9ab0"}}>{p}</span>)}
            {prods.length>0&&<span style={{fontSize:10,color:"#e8edf4"}}>·</span>}
            {!projectFit&&!item.custom&&<Chip text={fi.label} color={fi.color} bg={fi.bg}/>}
            <CustomBadge item={item}/>
            <ScopeBadge code={item.q}/>
          </div>
        </div>
        {/* L5/L6 drill toggle */}
        {spList.length>0&&(
          <button onClick={e=>{e.stopPropagation();setSpOpen(o=>!o);}}
            title="View system processes and test cases"
            style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,
              padding:"3px 8px",borderRadius:7,border:`1px solid ${spOpen?"#0E94A8":"rgba(20,190,240,0.2)"}`,
              background:spOpen?"rgba(114,216,246,0.08)":"transparent",
              cursor:"pointer",transition:"all 0.12s",flexShrink:0}}>
            <span style={{fontSize:10,color:spOpen?"#0E94A8":"#3d3738",fontWeight:600,whiteSpace:"nowrap"}}>
              {spOpen?"▾":"▸"} {spList.length} sys
            </span>
            {totalTc>0&&<span style={{fontSize:9,color:spOpen?"#14F032":"#8a9ab0",whiteSpace:"nowrap"}}>
              {totalTc} tests
            </span>}
          </button>
        )}
      </div>

      {/* L5/L6 expansion */}
      {spOpen&&spList.length>0&&(
        <div style={{marginLeft:14,marginTop:5,paddingLeft:10,
          borderLeft:"2px solid rgba(96,165,250,0.2)"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",
            color:"#0E94A8",marginBottom:7,display:"flex",alignItems:"center",gap:6}}>
            <span>L5 — System Processes</span>
            <span style={{fontWeight:400,color:"#e8edf4"}}>click ▸ to expand test cases</span>
          </div>
          {spList.map(sp=><SysProcessRow key={sp.q} item={sp} onSelect={onSelect} selected={selected}/>)}
        </div>
      )}
    </div>
  );
}


/* ── L3 DIAGRAM COMPONENTS ───────────────────────────────────────────────── */

/* Product colour mapping for diagram nodes */
const PROD_COLORS = {
  'Finance':                    {fill:'#e8f0fd',stroke:'#1377F0',text:'#1377F0'},
  'Business Central':           {fill:'#0e1828',stroke:'#0E94A8',text:'#14BEF0'},
  'Supply Chain Management':    {fill:'#0a1e2a',stroke:'#14BEF0',text:'#14BEF0'},
  'Field Service':              {fill:'#1a1208',stroke:'#F16320',text:'#F16320'},
  'Project Operations':         {fill:'#f0f4ff',stroke:'#4361ee',text:'#2d47c7'},
  'Sales':                      {fill:'#1a1208',stroke:'#F16320',text:'#F16320'},
  'Customer Service':           {fill:'#fff0f5',stroke:'#d4537e',text:'#993556'},
  'Human Resources':            {fill:'#f5f0fd',stroke:'#7c3aed',text:'#5b21b6'},
  'Commerce':                   {fill:'#fef9e8',stroke:'#d97706',text:'#92400e'},
  'Microsoft 365':              {fill:'#e8f5e9',stroke:'#16a34a',text:'#166534'},
  'default':                    {fill:'#f4f5f7',stroke:'#96898C',text:'#3d3738'},
};

function getProdColor(products) {
  if (!products) return PROD_COLORS.default;
  const first = products.split(';')[0].trim();
  return PROD_COLORS[first] || PROD_COLORS.default;
}

/* Auto-generate a horizontal flow diagram from L3 data */
// Direct mapping of Application Family → the product tags that belong to it.
// This is the source of truth for diagram node filtering.
const FAMILY_PRODUCTS = {
  'Business Central':       new Set(['Business Central']),
  'Finance and Operations': new Set(['Finance','Supply Chain Management','Field Service','Project Operations','Human Resources']),
  'Customer Engagement':    new Set(['Sales','Customer Service','Customer Insights Journey','Customer Insights Data','Customer Voice']),
  'Azure':                  new Set(['Azure']),
};

const CLIENT_FAMILY = 'Finance and Operations';

// Does a search result belong to the selected application family?
function inFamily(item,fam){
  if(!fam||item.custom) return true;
  const idx=FAM_INDEX[fam]; if(!idx) return true;
  if(item.l===1) return idx.l1.includes(getPrefix(item.q));
  if(item.l===2) return idx.l2.includes(item.q);
  const l3=item.q.split(".").slice(0,3).join(".")+".000";
  if(!idx.l3.includes(l3)) return false;
  if(item.l>=4&&item.p) return item.p.split(";").some(p=>FAMILY_PRODUCTS[fam].has(p.trim()));
  return true;
}

// Several families selected at once: merge their indexes under a combined key (e.g. "A + B"),
// so everything that looks up FAM_INDEX / FAMILY_PRODUCTS by famFilter keeps working.
const FAMILY_SEP = " + ";
function familyKey(fams){
  const list=[...fams].sort(); const key=list.join(FAMILY_SEP);
  if(list.length>1&&!FAM_INDEX[key]){
    const merge=lvl=>[...new Set(list.flatMap(f=>FAM_INDEX[f]?.[lvl]||[]))];
    FAM_INDEX[key]={l1:merge("l1"),l2:merge("l2"),l3:merge("l3")};
    FAMILY_PRODUCTS[key]=new Set(list.flatMap(f=>[...(FAMILY_PRODUCTS[f]||[])]));
  }
  return key;
}
const familiesOf = famFilter => famFilter?famFilter.split(FAMILY_SEP):[];

// Product index derived the same way as FAM_INDEX: a process belongs to a product when any of its
// scenarios is tagged with it (processes without scenarios use their own tags). A product index built
// from process-level tags would miss most Project Operations and Human Resources processes.
const PRODUCT_INDEX = (()=>{
  const tags=i=>(i.p||"").split(";").map(s=>s.trim()).filter(Boolean);
  const l3Of=q=>q.split(".").slice(0,3).join(".")+".000";
  const byProduct={}; const withScenarios=new Set();
  const add=(prod,q)=>{
    const s=q.split(".");
    const e=byProduct[prod]||(byProduct[prod]={l1:new Set(),l2:new Set(),l3:new Set()});
    e.l1.add(s[0]); e.l2.add(`${s[0]}.${s[1]}.000.000`); e.l3.add(l3Of(q));
  };
  const all=Object.values(PER_L1).flat();
  for(const i of all) if(i.l===4){ withScenarios.add(l3Of(i.q)); tags(i).forEach(p=>add(p,i.q)); }
  for(const i of all) if(i.l===3&&!withScenarios.has(i.q)) tags(i).forEach(p=>add(p,i.q));
  const out={};
  for(const [p,e] of Object.entries(byProduct)) out[p]={l1:[...e.l1],l2:[...e.l2],l3:[...e.l3]};
  return out;
})();

/* Custom processes (level 3) and scenarios (level 4) from the open project — the iCatalyst library
   plus the client's own — are merged into the catalogue data in place, so every view, filter and
   search sees them. Re-running replaces the previous merge. */
const BASE_SUMMARY_COUNTS = SUMMARY.map(s=>({l3:s.l3,l4:s.l4}));
let mergedCodes = new Set();
function applyCustomNodes(nodes){
  const strip=a=>a.filter(c=>!mergedCodes.has(c));
  for(const k of Object.keys(PER_L1)) PER_L1[k]=PER_L1[k].filter(i=>!i.custom);
  for(const idx of [...Object.values(FAM_INDEX),...Object.values(PRODUCT_INDEX)]) idx.l3=strip(idx.l3);
  for(const key of Object.keys(FAM_INDEX)) if(key.includes(FAMILY_SEP)){ delete FAM_INDEX[key]; delete FAMILY_PRODUCTS[key]; }
  SUMMARY.forEach((s,i)=>Object.assign(s,BASE_SUMMARY_COUNTS[i]));
  mergedCodes=new Set();

  for(const n of nodes){
    const k=getPrefix(n.code), s=n.code.split(".");
    if(!PER_L1[k]) continue;
    PER_L1[k].push({q:n.code,t:n.title,l:n.level,d:n.description,p:n.products,custom:n.source,sp:0,tc:0});
    mergedCodes.add(n.code);
    const sum=SUMMARY.find(x=>getPrefix(x.q)===k); if(sum) sum[n.level===3?"l3":"l4"]++;
    if(n.level!==3) continue;
    const area=`${s[0]}.${s[1]}.000.000`;
    // A custom process shows under every family its process area belongs to, and under its products.
    for(const idx of Object.values(FAM_INDEX)) if(idx.l2.includes(area)) idx.l3.push(n.code);
    for(const prod of (n.products||"").split(";").map(x=>x.trim()).filter(Boolean)){
      const e=PRODUCT_INDEX[prod]||(PRODUCT_INDEX[prod]={l1:[],l2:[],l3:[]});
      if(!e.l1.includes(k)) e.l1.push(k);
      if(!e.l2.includes(area)) e.l2.push(area);
      e.l3.push(n.code);
    }
  }
  for(const k of Object.keys(PER_L1)) PER_L1[k].sort((a,b)=>a.q<b.q?-1:a.q>b.q?1:0);
}
const familyProductOptions = famFilter => [...new Set(
  (famFilter?familiesOf(famFilter):APP_FAMILIES).flatMap(f=>[...(FAMILY_PRODUCTS[f]||[])]))].sort();

// Does a search result belong to the selected product?
function inProduct(item,prod){
  if(!prod) return true;
  const idx=PRODUCT_INDEX[prod]; if(!idx) return false;
  if(item.l===1) return idx.l1.includes(getPrefix(item.q));
  if(item.l===2) return idx.l2.includes(item.q);
  if(item.l===3) return idx.l3.includes(item.q);
  return hasProduct(item,prod);
}

/* Search: every word must match (any order); "*" matches any run of characters within a word,
   e.g. "vend* invoice" or "60.30". */
function searchTerms(q){
  const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  return q.trim().split(/\s+/).filter(t=>t.replace(/\*/g,"")).map(t=>t.split("*").map(esc).join("[^\\s]*"));
}
function escapeHtml(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function matchesSearch(item,terms){
  const text=`${item.q} ${item.t} ${item.d||""}`;
  return terms.every(t=>new RegExp(t,"i").test(text));
}

function AutoDiagram({ l3item, l1key, famFilter }) {
  const all = PER_L1[l1key] || [];
  const pfx = l3item.q.split('.').slice(0, 3).join('.') + '.';

  const scenarios = useMemo(() => {
    const all4 = all.filter(x => x.l === 4 && x.q.startsWith(pfx));
    if (!famFilter) return all4;
    const allowed = FAMILY_PRODUCTS[famFilter];
    if (!allowed) return all4;
    // Keep only nodes whose product tag overlaps with the selected family's products
    return all4.filter(s => {
      if (s.custom) return true; // custom scenarios always belong to their process
      if (!s.p) return false;
      return s.p.split(';').map(p => p.trim()).some(p => allowed.has(p));
    });
  }, [l3item.q, l1key, famFilter]);

  const sysprocs = useMemo(() =>
    scenarios.map(s => ({
      seq: s.q,
      steps: (SP_INDEX[l1key] || {})[s.q] || [],
    })),
  [scenarios, l1key]);

  if (!scenarios.length) return (
    <div style={{padding:'24px',textAlign:'center',color:'#96898C',fontSize:13,
      fontStyle:'italic'}}>No scenario data available for auto-diagram.</div>
  );

  /* Layout constants */
  const NODE_W    = 200;
  const NODE_H    = 64;
  const GAP_X     = 48;
  const STEP_H    = 32;
  const STEP_GAP  = 5;
  const START_X   = 40;
  const START_Y   = 60;
  const ARROW_Y   = START_Y + NODE_H / 2;

  const svgW = START_X + scenarios.length * (NODE_W + GAP_X) + 40;

  /* Trim long titles for display */
  function trimTitle(t, max = 34) {
    // Strip trailing "in Dynamics 365 XXXX" / "using XXXX"
    let s = t.replace(/\s+(in|using|with)\s+Dynamics\s+365\s+\w[\w\s]*/i, '')
             .replace(/\s+(in|using|with)\s+Microsoft\s+\w[\w\s]*/i, '').trim();
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function wrapText(text, maxChars = 26) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length > maxChars && cur) {
        lines.push(cur.trim());
        cur = w;
      } else {
        cur = (cur + ' ' + w).trim();
      }
    }
    if (cur) lines.push(cur.trim());
    return lines.slice(0, 3);
  }

  /* Calculate max steps for SVG height */
  const maxSteps = Math.max(...sysprocs.map(sp => sp.steps.length), 0);
  const stepsAreaH = maxSteps > 0 ? maxSteps * (STEP_H + STEP_GAP) + 40 : 0;
  const svgH = START_Y + NODE_H + 20 + stepsAreaH + 40;

  return (
    <div style={{overflowX:'auto',overflowY:'visible'}}>
      <svg width={svgW} height={svgH} style={{minWidth:svgW,display:'block'}}>
        <defs>
          <marker id="dArrow" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#14BEF0"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
          <marker id="sArrow" viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M2 1L8 5L2 9" fill="none" stroke="#96898C"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </marker>
        </defs>

        {/* Process title */}
        <text x={START_X} y={22} fontSize={13} fontWeight={500}
          fill="#e8edf4" fontFamily="system-ui,sans-serif">{l3item.t}</text>
        <text x={START_X} y={40} fontSize={11} fill="#96898C"
          fontFamily="system-ui,sans-serif">{l3item.q} · auto-generated</text>

        {/* Connecting arrows between scenario nodes */}
        {scenarios.slice(0, -1).map((_, i) => {
          const x1 = START_X + i * (NODE_W + GAP_X) + NODE_W;
          const x2 = x1 + GAP_X;
          return (
            <line key={i} x1={x1+2} y1={ARROW_Y} x2={x2-4} y2={ARROW_Y}
              stroke="#14BEF0" strokeWidth={1.5}
              markerEnd="url(#dArrow)"/>
          );
        })}

        {/* Scenario nodes (L4) */}
        {scenarios.map((s, i) => {
          const x = START_X + i * (NODE_W + GAP_X);
          const y = START_Y;
          const c = getProdColor(s.p);
          const title = trimTitle(s.t);
          const lines = wrapText(title);
          const lineH = 16;
          const totalTextH = lines.length * lineH;
          const textStartY = y + (NODE_H - totalTextH) / 2 + lineH * 0.8;
          const prod = (s.p || '').split(';')[0].trim().replace('Supply Chain Management','SCM');
          const steps = sysprocs[i]?.steps || [];

          return (
            <g key={s.q}>
              {/* Scenario box */}
              <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={8}
                fill={c.fill} stroke={c.stroke} strokeWidth={1.5}/>
              {/* Sequence ID */}
              <text x={x+8} y={y+13} fontSize={9} fill={c.stroke}
                fontFamily="monospace">{s.q}</text>
              {/* Title lines */}
              {lines.map((line, li) => (
                <text key={li}
                  x={x + NODE_W / 2} y={textStartY + li * lineH}
                  fontSize={12} fontWeight={500} fill={c.text}
                  textAnchor="middle" fontFamily="system-ui,sans-serif">
                  {line}
                </text>
              ))}
              {/* Product pill */}
              <rect x={x + NODE_W - prod.length * 5.8 - 10} y={y + NODE_H - 16}
                width={prod.length * 5.8 + 8} height={13} rx={6}
                fill={c.stroke} opacity={0.15}/>
              <text x={x + NODE_W - prod.length * 5.8 / 2 - 6}
                y={y + NODE_H - 6} fontSize={8} fill={c.stroke}
                textAnchor="middle" fontFamily="system-ui,sans-serif"
                fontWeight={500}>{prod}</text>

              {/* L5 system process steps below */}
              {steps.length > 0 && (
                <>
                  {/* Connector line down */}
                  <line x1={x + NODE_W/2} y1={y + NODE_H}
                    x2={x + NODE_W/2} y2={y + NODE_H + 14}
                    stroke="#96898C" strokeWidth={1}
                    markerEnd="url(#sArrow)"/>

                  {/* Step boxes */}
                  {steps.map((sp, si) => {
                    const sy = y + NODE_H + 20 + si * (STEP_H + STEP_GAP);
                    const spTitle = sp.t.length > 28 ? sp.t.slice(0,27)+'…' : sp.t;
                    return (
                      <g key={sp.q}>
                        {si > 0 && (
                          <line x1={x + NODE_W/2}
                            y1={sy - STEP_GAP}
                            x2={x + NODE_W/2}
                            y2={sy}
                            stroke="#96898C" strokeWidth={0.8}
                            strokeDasharray="3 2"/>
                        )}
                        <rect x={x+2} y={sy} width={NODE_W-4} height={STEP_H}
                          rx={6} fill="#0e0f14"
                          stroke="rgba(114,216,246,0.4)" strokeWidth={1}/>
                        <text x={x+10} y={sy+11} fontSize={8.5}
                          fill="#96898C" fontFamily="monospace">{sp.q}</text>
                        <text x={x + (NODE_W-4)/2 + 2} y={sy + STEP_H/2 + 4}
                          fontSize={11} fill="#3d3738" textAnchor="middle"
                          fontFamily="system-ui,sans-serif">{spTitle}</text>
                      </g>
                    );
                  })}
                </>
              )}
            </g>
          );
        })}

        {/* Legend */}
        {(() => {
          const prods = [...new Set(scenarios.map(s =>
            (s.p || '').split(';')[0].trim()).filter(Boolean))];
          return prods.map((p, i) => {
            const c = getProdColor(p);
            return (
              <g key={p}>
                <rect x={START_X + i * 160} y={svgH - 22}
                  width={12} height={12} rx={3}
                  fill={c.fill} stroke={c.stroke} strokeWidth={1.5}/>
                <text x={START_X + i * 160 + 16} y={svgH - 12}
                  fontSize={11} fill="#5a5255"
                  fontFamily="system-ui,sans-serif">{p}</text>
              </g>
            );
          });
        })()}
      </svg>
    </div>
  );
}

/* PNG/JPG image viewer with lightbox */
function ImageViewer({ seq, ext }) {
  const [zoomed, setZoomed] = useState(false);
  const url = `/diagrams/${seq}.${ext}`;
  return (
    <div>
      <div style={{background:"#fafbfc",borderRadius:8,
        border:"1px solid rgba(20,190,240,0.2)",overflow:"hidden",
        cursor:"zoom-in"}} onClick={()=>setZoomed(true)}>
        <img src={url} alt={seq}
          style={{width:"100%",height:"auto",display:"block",
            maxHeight:460,objectFit:"contain",padding:8}}/>
        <div style={{textAlign:"right",padding:"4px 10px",
          fontSize:10,color:"#0E94A8"}}>Click to enlarge</div>
      </div>
      <div style={{marginTop:6,textAlign:"right"}}>
        <a href={url} target="_blank" rel="noreferrer"
          style={{fontSize:11,color:"#14BEF0",textDecoration:"none"}}>
          Open full size ↗
        </a>
      </div>
      {zoomed&&(
        <div onClick={()=>setZoomed(false)}
          style={{position:"fixed",inset:0,zIndex:9998,
            background:"rgba(35,31,32,0.88)",
            display:"flex",alignItems:"center",justifyContent:"center",
            padding:20,cursor:"zoom-out"}}>
          <div onClick={e=>e.stopPropagation()}
            style={{position:"relative",maxWidth:"95vw",maxHeight:"92vh",
              background:"#13151f",borderRadius:12,overflow:"hidden"}}>
            <div style={{padding:"10px 16px",
              borderBottom:"1px solid rgba(20,190,240,0.2)",
              display:"flex",alignItems:"center",
              justifyContent:"space-between",
              background:"linear-gradient(135deg,#0e1520,#111d2a)"}}>
              <span style={{fontSize:11,fontFamily:"monospace",
                color:"#0E94A8"}}>{seq}</span>
              <div style={{display:"flex",alignItems:"center",gap:14}}>
                <a href={url} target="_blank" rel="noreferrer"
                  style={{fontSize:11,color:"#14BEF0",textDecoration:"none"}}>
                  Open full size ↗
                </a>
                <button onClick={()=>setZoomed(false)}
                  style={{background:"none",border:"none",cursor:"pointer",
                    color:"#5a6a80",fontSize:20,lineHeight:1,padding:0}}>
                  ×
                </button>
              </div>
            </div>
            <div style={{overflow:"auto",maxHeight:"calc(92vh - 46px)"}}>
              <img src={url} alt={seq}
                style={{display:"block",maxWidth:"90vw",height:"auto"}}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* L3 Diagram Panel — checks for PNG/JPG, falls back to auto-generated */
function L3DiagramPanel({ l3item, l1key, famFilter }) {
  const [mode, setMode]     = useState("diagram");
  const [imgExt, setImgExt] = useState(null); // null=checking | "png"|"jpg" | false

  useEffect(() => {
    let cancelled = false;
    async function checkImage() {
      for (const ext of ["png","PNG","jpg","JPG","jpeg"]) {
        try {
          const r = await fetch(`/diagrams/${l3item.q}.${ext}`,{method:"HEAD"});
          if (r.ok && !cancelled) { setImgExt(ext); return; }
        } catch(_) {}
      }
      if (!cancelled) setImgExt(false);
    }
    checkImage();
    return () => { cancelled = true; };
  }, [l3item.q]);

  const hasImg    = imgExt && imgExt !== false;
  const checking  = imgExt === null;

  return (
    <div style={{background:"#13151f",borderRadius:10,
      border:"1px solid rgba(20,190,240,0.2)",
      overflow:"hidden",marginBottom:16}}>

      {/* Header */}
      <div style={{padding:"10px 16px",
        borderBottom:"1px solid rgba(20,190,240,0.15)",
        display:"flex",alignItems:"center",
        justifyContent:"space-between",
        background:"linear-gradient(135deg,#0e1520,#111d2a)"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,fontWeight:500,letterSpacing:".7px",
            textTransform:"uppercase",color:"#14BEF0"}}>
            L3 Process Diagram
          </span>
          <HelpTip position="bottom" text="Auto-generated flow diagram of L4 Scenarios for this process. Box colour = product. When a Family filter is active, only that family's nodes are shown. Switch to Scenarios tab for a list view."/>
          {checking&&<span style={{fontSize:10,color:"#5a6a80"}}>…</span>}
          {hasImg&&(
            <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,
              background:"rgba(14,148,168,0.1)",color:"#0E94A8",
              border:"1px solid rgba(14,148,168,0.3)"}}>process map</span>
          )}
          {imgExt===false&&(
            <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,
              background:"rgba(150,137,140,0.1)",color:"#5a6a80",
              border:"1px solid rgba(150,137,140,0.25)"}}>auto-generated</span>
          )}
        </div>
        {/* Toggle */}
        <div style={{display:"flex",gap:1,
          background:"rgba(20,190,240,0.08)",borderRadius:20,padding:2}}>
          {["diagram","scenarios"].map(m=>(
            <button key={m} onClick={()=>setMode(m)}
              style={{fontSize:11,padding:"3px 12px",borderRadius:18,
                cursor:"pointer",fontFamily:"inherit",
                border:"none",transition:"all .15s",
                fontWeight:mode===m?500:400,
                background:mode===m?"#14BEF0":"transparent",
                color:mode===m?"white":"#5a5255"}}>
              {m==="diagram"?"Diagram":"Scenarios"}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{padding:"16px",minHeight:80}}>
        {mode==="diagram"&&(
          checking
            ? <div style={{textAlign:"center",color:"#5a6a80",
                fontSize:13,padding:"20px 0"}}>Checking for process map…</div>
            : hasImg
              ? <ImageViewer seq={l3item.q} ext={imgExt}/>
              : <AutoDiagram l3item={l3item} l1key={l1key} famFilter={famFilter}/>
        )}
        {mode==="scenarios"&&(
          <ScenarioStepsList l3item={l3item} l1key={l1key}/>
        )}
      </div>
    </div>
  );
}

/* Compact scenario list for the "Scenarios" tab in the diagram panel */
function ScenarioStepsList({ l3item, l1key }) {
  const all = PER_L1[l1key] || [];
  const pfx = l3item.q.split('.').slice(0,3).join('.') + '.';
  const scenarios = all.filter(x => x.l===4 && x.q.startsWith(pfx));

  if (!scenarios.length) return (
    <div style={{fontSize:13,color:'#96898C',fontStyle:'italic'}}>No scenarios recorded.</div>
  );

  return (
    <div style={{display:'flex',flexDirection:'column',gap:6}}>
      {scenarios.map((s,i)=>{
        const c = getProdColor(s.p);
        const prod = (s.p||'').split(';')[0].trim();
        return (
          <div key={s.q} style={{display:'flex',alignItems:'flex-start',gap:10,
            padding:'9px 12px',background:c.fill,borderRadius:8,
            border:`1px solid ${c.stroke}33`}}>
            <div style={{width:22,height:22,minWidth:22,borderRadius:'50%',
              background:c.stroke,color:'white',fontSize:11,fontWeight:500,
              display:'flex',alignItems:'center',justifyContent:'center',
              marginTop:1}}>{i+1}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontFamily:'monospace',
                color:'#96898C',marginBottom:2}}>{s.q}</div>
              <div style={{fontSize:13,color:'#e8edf4',lineHeight:1.4}}>{s.t}</div>
              {prod&&<span style={{fontSize:10,color:c.text,marginTop:3,
                display:'inline-block'}}>{prod}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}


/* ── L3 ACCORDION ── */
function L3Accordion({item,l1key,onSelect,selected,prodFilter,famFilter,focus}){
  const [open,setOpen]=useState(false);
  // Opened from search: expand this process when the target is it or one of its scenarios.
  const l3pfx=item.q.split(".").slice(0,3).join(".")+".";
  useEffect(()=>{ const q=focus?.q; if(q&&(q===item.q||q.startsWith(l3pfx))) setOpen(true); },[focus]);
  const isSelected=selected?.q===item.q;
  const allowedFamProds=useMemo(()=>famFilter?FAMILY_PRODUCTS[famFilter]:null,[famFilter]);
  const allScenarios=useMemo(()=>{
    if(!open) return [];
    const pfx=item.q.split(".").slice(0,3).join(".")+".";
    return (PER_L1[l1key]||[]).filter(x=>x.l===4&&x.q.startsWith(pfx));
  },[open,item.q,l1key]);
  const scenarios=useMemo(()=>{
    let s=allScenarios;
    if(prodFilter) s=s.filter(x=>x.custom&&!x.p||hasProduct(x,prodFilter));
    if(allowedFamProds) s=s.filter(x=>{
      if(x.custom) return true; // custom scenarios always show under their process
      if(!x.p) return false;
      return x.p.split(';').map(p=>p.trim()).some(p=>allowedFamProds.has(p));
    });
    return s;
  },[allScenarios,prodFilter,allowedFamProds]);
  // Dim this L3 if it's not in the family's L3 list (when famFilter active)
  const dimmedByFam=famFilter&&!(FAM_INDEX[famFilter]?.l3||[]).includes(item.q);
  const dimmedByProd=prodFilter&&!(PRODUCT_INDEX[prodFilter]?.l3||[]).includes(item.q);
  const dimmed=dimmedByFam||dimmedByProd;

  return <div style={{background:"#13151f",
    border:`1px solid ${isSelected?"#F16320":dimmed?"#0b0c11":"rgba(20,190,240,0.2)"}`,
    borderLeft:`3px solid ${isSelected?"#F16320":dimmed?"rgba(20,190,240,0.2)":"#F16320"}`,
    borderRadius:10,overflow:"hidden",marginBottom:7,opacity:dimmed?0.3:1,transition:"all 0.15s"}} data-code={item.q}>
    <div style={{padding:"11px 14px",display:"flex",alignItems:"center",gap:10,
      background:open||isSelected?"#1a1d2a":"#13151f",transition:"background 0.1s"}}
      onMouseEnter={e=>{if(!dimmed)e.currentTarget.style.background="#1a1d2a"}}
      onMouseLeave={e=>e.currentTarget.style.background=open||isSelected?"#1a1d2a":"transparent"}>
      <span onClick={()=>!dimmed&&onSelect(item)} style={{fontFamily:"monospace",fontSize:10,
        color:"#8a9ab0",minWidth:90,cursor:"pointer"}}>{item.q}</span>
      <span onClick={()=>!dimmed&&onSelect(item)} style={{fontSize:13,fontWeight:600,flex:1,
        color:isSelected?"#F16320":"#e8edf4",lineHeight:1.3,cursor:"pointer"}}>{item.t}</span>
      <div style={{display:"flex",gap:5,flexShrink:0,alignItems:"center"}}>
        <CustomBadge item={item}/>
        <ScopeBadge code={item.q}/>
        {item.sc>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
          background:"rgba(241,99,32,0.1)",color:"#F16320",fontWeight:600}}>
          {(prodFilter||famFilter)&&open?`${scenarios.length}/${item.sc}`:`${item.sc}`} scen
        </span>}
        {item.sp>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
          background:"rgba(114,216,246,0.1)",color:"#0E94A8",fontWeight:600}}>{item.sp} sys</span>}
        {item.tc>0&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:10,
          background:"rgba(20,240,80,0.12)",color:"#14F032",fontWeight:600}}>{item.tc} tests</span>}
      </div>
      {!dimmed&&<span onClick={()=>setOpen(o=>!o)}
        style={{color:"#8a9ab0",fontSize:11,transform:open?"rotate(90deg)":"none",
          transition:"transform 0.2s",flexShrink:0,cursor:"pointer",padding:"0 2px"}}>▶</span>}
    </div>
    {open&&!dimmed&&<div style={{padding:"12px 14px 14px",borderTop:"1px solid #0e0f14"}}>
      <L3DiagramPanel l3item={item} l1key={l1key} famFilter={famFilter}/>
      {item.d&&<p style={{fontSize:13,color:"#e8edf4",lineHeight:1.65,marginBottom:12}}>{item.d}</p>}
      {scenarios.length>0
        ?<>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"1px",textTransform:"uppercase",
            color:"#F16320",marginBottom:8}}>
            L4 — Scenarios ({scenarios.length}{(prodFilter||famFilter)&&scenarios.length!==item.sc?` of ${item.sc}`:""})
            {item.sp>0&&<span style={{color:"#0E94A8",marginLeft:8}}>· expand ▸ for system processes & tests</span>}
          </div>
          {scenarios.map(s=><ScenarioSection key={s.q} item={s} onSelect={onSelect} selected={selected}/>)}
        </>
        :<div style={{fontSize:13,color:"#8a9ab0",fontStyle:"italic"}}>
          {(prodFilter||famFilter)?"No scenarios match this filter.":"No scenarios recorded."}
        </div>
      }
      <AddNodeButton level={4} parent={item.q} productOptions={familyProductOptions(famFilter)}/>
    </div>}
  </div>;
}

/* ── L2 VIEW ── */
function L2View({l1idx,l2q,onBack,onL1,onSelect,selected,prodFilter,famFilter,focus}){
  const l1=SUMMARY[l1idx]; const l1key=getPrefix(l1.q);
  const all=PER_L1[l1key]||[];
  const l2=all.find(i=>i.q===l2q);
  const l2prefix=l2q.split(".").slice(0,2).join(".");
  const l3s=useMemo(()=>all.filter(i=>i.l===3&&i.q.startsWith(l2prefix+".")),[l2q,l1key]);
  const allowedL3s=useMemo(()=>famFilter?new Set(FAM_INDEX[famFilter]?.l3||[]):null,[famFilter]);
  const l3sWithCount=useMemo(()=>l3s.map(l3=>{
    const pfx=l3.q.split(".").slice(0,3).join(".")+".";
    const sc=all.filter(x=>x.l===4&&x.q.startsWith(pfx)).length;
    return {...l3,sc};
  }),[l3s]);
  const visibleL3s=useMemo(()=>l3sWithCount.filter(l3=>
    (!prodFilter||(PRODUCT_INDEX[prodFilter]?.l3||[]).includes(l3.q))&&
    (!allowedL3s||allowedL3s.has(l3.q))
  ),[l3sWithCount,prodFilter,allowedL3s]);
  const l4c=l3sWithCount.reduce((a,x)=>a+x.sc,0);
  if(!l2) return null;

  return <div style={{padding:22}}>
    <Breadcrumb items={[{label:"Home",onClick:onBack},{label:l1.t,onClick:()=>onL1(l1idx)},{label:l2.t}]}/>
    <div onClick={()=>onSelect(l2)}
      style={{background:"linear-gradient(135deg,#0e1828,#111d2e)",
        border:`1px solid ${selected?.q===l2.q?"#0E94A8":"rgba(20,190,240,0.2)"}`,
        borderRadius:12,padding:18,marginBottom:16,cursor:"pointer",transition:"border-color 0.15s",
        position:"relative",overflow:"hidden"}}
      onMouseEnter={e=>{if(selected?.q!==l2.q)e.currentTarget.style.borderColor="#14BEF0"}}
      onMouseLeave={e=>{if(selected?.q!==l2.q)e.currentTarget.style.borderColor="rgba(20,190,240,0.2)"}}>
      <div style={{position:"absolute",top:"-40%",right:"-5%",width:180,height:180,
        background:"radial-gradient(circle,rgba(20,190,240,0.06) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <LBadge level={2} style={{marginBottom:7,display:"inline-block"}}/>
      <div style={{fontSize:16,fontWeight:700,color:"#e8edf4",lineHeight:1.3,marginBottom:3}}>{l2.t}</div>
      <div style={{fontFamily:"monospace",fontSize:10,color:"#e8edf4"}}>{l2.q} · click to view overview →</div>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <StatCard label="Processes" value={(famFilter||prodFilter)?`${visibleL3s.length}/${l3s.length}`:l3s.length} color="#F16320"/>
      <StatCard label="Scenarios" value={l4c} color="#F16320"/>
      <StatCard label="Sys Procs" value={l3sWithCount.reduce((a,x)=>a+(x.sp||0),0)} color="#0E94A8"/>
      <StatCard label="Test Cases" value={l3sWithCount.reduce((a,x)=>a+(x.tc||0),0)} color="#14F032"/>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:11}}>
      <LBadge level={3}/>
      <span style={{fontSize:13,fontWeight:600,color:"#e8edf4"}}>Business Processes</span>
      <HelpTip position="top" text="L3 Processes — each has a unique code, description, and scenarios. Click the title to preview details. Click ▶ to expand and view L4 Scenarios inline."/>
      <span style={{fontSize:11,color:"#8a9ab0"}}>{visibleL3s.length} · click title to preview · ▶ to expand scenarios</span>
    </div>
    {visibleL3s.length===0
      ?<div style={{fontSize:13,color:"#8a9ab0",fontStyle:"italic",padding:"20px 0"}}>No processes match the selected filter.</div>
      :visibleL3s.map(l3=><L3Accordion key={l3.q} item={l3} l1key={l1key} onSelect={onSelect} selected={selected} prodFilter={prodFilter} famFilter={famFilter} focus={focus}/>)
    }
    <AddNodeButton level={3} parent={l2q} productOptions={familyProductOptions(famFilter)}/>
  </div>;
}

/* ── L1 VIEW ── */
function L1View({l1idx,onL2,onBack,onSelect,selected,prodFilter,famFilter}){
  const l1=SUMMARY[l1idx]; const l1key=getPrefix(l1.q);
  const all=PER_L1[l1key]||[];
  const l2s=all.filter(i=>i.l===2);
  const allowedL2s=useMemo(()=>famFilter?new Set(FAM_INDEX[famFilter]?.l2||[]):null,[famFilter]);
  const l2Cards=useMemo(()=>l2s.map(l2=>{
    const l2prefix=l2.q.split(".").slice(0,2).join(".");
    const l3c=all.filter(x=>x.l===3&&x.q.startsWith(l2prefix+".")).length;
    const l4c=all.filter(x=>x.l===4&&x.q.startsWith(l2prefix+".")).length;
    const matchesProd=!prodFilter||(PRODUCT_INDEX[prodFilter]?.l2||[]).includes(l2.q);
    const matchesFam=!allowedL2s||allowedL2s.has(l2.q);
    return {...l2,l3c,l4c,matchesProd,matchesFam};
  }),[l2s,prodFilter,allowedL2s]);
  const visible=l2Cards.filter(x=>(!prodFilter||x.matchesProd)&&(!allowedL2s||x.matchesFam));
  const l1Item=all.find(i=>i.l===1)||{...l1};

  return <div style={{padding:22}}>
    <Breadcrumb items={[{label:"Home",onClick:onBack},{label:l1.t}]}/>
    <div onClick={()=>onSelect(l1Item)}
      style={{background:"linear-gradient(135deg,#0e1828,#111d2e)",
        border:`1px solid ${selected?.q===l1.q?"#14BEF0":"rgba(20,190,240,0.2)"}`,
        borderRadius:12,padding:18,marginBottom:16,cursor:"pointer",transition:"border-color 0.15s",
        position:"relative",overflow:"hidden"}}
      onMouseEnter={e=>{if(selected?.q!==l1.q)e.currentTarget.style.borderColor="#14BEF0"}}
      onMouseLeave={e=>{if(selected?.q!==l1.q)e.currentTarget.style.borderColor="rgba(20,190,240,0.2)"}}>
      <div style={{position:"absolute",top:"-40%",right:"-5%",width:200,height:200,
        background:"radial-gradient(circle,rgba(20,190,240,0.08) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <LBadge level={1} style={{marginBottom:7,display:"inline-block"}}/>
      <div style={{fontSize:16,fontWeight:700,color:"#e8edf4",lineHeight:1.3,marginBottom:3}}>{l1.t}</div>
      <div style={{fontFamily:"monospace",fontSize:10,color:"#e8edf4"}}>{l1.q} · click to view overview →</div>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <StatCard label="Process Areas" value={famFilter?`${visible.length}/${l2s.length}`:l1.l2} color="#0E94A8"/>
      <StatCard label="Processes"     value={l1.l3} color="#F16320"/>
      <StatCard label="Scenarios"     value={l1.l4} color="#F16320"/>
      <StatCard label="Sys Procs"     value={l1.l5} color="#0E94A8"/>
      <StatCard label="Test Cases"    value={l1.l6} color="#14F032"/>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:11}}>
      <LBadge level={2}/>
      <span style={{fontSize:13,fontWeight:600,color:"#e8edf4"}}>Process Areas</span>
      <HelpTip position="top" text="L2 Process Areas group related processes within this EPIC. Click a card title to drill in, or click the card body to preview in the right panel."/>
      <span style={{fontSize:11,color:"#8a9ab0"}}>{visible.length}{(famFilter||prodFilter)&&visible.length<l2s.length?` of ${l2s.length}`:""} — click title to drill down</span>
    </div>
    {visible.length===0
      ?<div style={{fontSize:13,color:"#8a9ab0",fontStyle:"italic",padding:"20px 0"}}>No process areas match the selected filter.</div>
      :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
        {visible.map(l2=><AreaCard key={l2.q} item={l2} selected={selected} onSelect={onSelect} onDrill={()=>onL2(l1idx,l2.q)}/>)}
      </div>
    }
  </div>;
}

/* ── HOME VIEW ── */
function HomeView({onL1,onSelect,selected,prodFilter,famFilter}){
  const filteredSummary=useMemo(()=>{
    const fam=famFilter?new Set(FAM_INDEX[famFilter]?.l1||[]):null;
    const prod=prodFilter?new Set(PRODUCT_INDEX[prodFilter]?.l1||[]):null;
    return SUMMARY.map((s,i)=>{const p=getPrefix(s.q); return{...s,i,dim:(!!fam&&!fam.has(p))||(!!prod&&!prod.has(p))}});
  },[famFilter,prodFilter]);
  const visibleCount=filteredSummary.filter(s=>!s.dim).length;

  return <div style={{padding:22}}>
    <div style={{background:"linear-gradient(135deg,#0e1828 0%,#111d2e 100%)",
      border:"1px solid #0e0f14",borderRadius:14,padding:22,marginBottom:18,position:"relative",overflow:"hidden"}}>
      <div style={{position:"absolute",top:"-30%",right:"-5%",width:260,height:260,
        background:"radial-gradient(circle,rgba(20,190,240,0.07) 0%,transparent 70%)",pointerEvents:"none"}}/>
      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.8px",textTransform:"uppercase",color:"#14BEF0",
        marginBottom:8,background:"rgba(20,190,240,0.1)",display:"inline-block",padding:"3px 10px",
        borderRadius:20,border:"1px solid rgba(20,190,240,0.3)"}}>iCatalyst · Dynamics Done Differently</div>
      <div style={{fontSize:20,fontWeight:700,letterSpacing:"-0.5px",color:"#e8edf4",marginBottom:3}}>Standard Business Process Catalogue</div>
      <div style={{fontFamily:"monospace",fontSize:11,color:"#e8edf4",marginBottom:10}}>{CATALOGUE_INFO.version} · Microsoft Business Process Catalog</div>
      <p style={{fontSize:12,color:"#e8edf4",lineHeight:1.7,maxWidth:560,margin:0}}>
        Navigate from EPICs through process areas, processes, scenarios, and system processes down to test cases. Click any item to see its overview in the right-hand panel.
      </p>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      {[{label:"EPICs",value:TOTALS.l1,color:"#14BEF0"},
        {label:"Process Areas",value:TOTALS.l2,color:"#0E94A8"},
        {label:"Processes",value:TOTALS.l3,color:"#F16320"},
        {label:"Scenarios",value:TOTALS.l4,color:"#F16320"},
        {label:"Sys Processes",value:TOTALS.l5,color:"#0E94A8"},
        {label:"Test Cases",value:TOTALS.l6,color:"#14F032"},
      ].map(s=><StatCard key={s.label} {...s}/>)}
    </div>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
      {Object.entries(LCFG).map(([k,v])=>(
        <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#6b7a90"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:v.color}}/>{v.label}
        </div>
      ))}
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:11}}>
      <LBadge level={1}/>
      <span style={{fontSize:13,fontWeight:600,color:"#e8edf4"}}>End-to-End Processes</span>
      <span style={{fontSize:11,color:"#8a9ab0"}}>{IS_CLIENT?`${visibleCount} · Finance and Operations${prodFilter?` · ${prodFilter}`:""}`:(famFilter||prodFilter)?`${visibleCount} of ${SUMMARY.length}`:SUMMARY.length}</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
      {filteredSummary.filter(l1=>!(IS_CLIENT&&l1.dim)).map(l1=><EpicCard key={l1.q} item={l1} dim={l1.dim} selected={selected} onSelect={()=>!l1.dim&&onSelect(l1)} onClick={()=>!l1.dim&&onL1(l1.i)}/>)}
    </div>
  </div>;
}

/* ── SEARCH VIEW ── */
function SearchView({q,prod,famFilter,onSelect}){
  const terms=useMemo(()=>searchTerms(q),[q]);
  const results=useMemo(()=>{
    if(!terms.length&&!prod) return [];
    const out=[];
    for(const [key,items] of Object.entries(PER_L1)){
      for(const item of items){
        if(matchesSearch(item,terms)&&inProduct(item,prod)&&inFamily(item,famFilter)){
          const l1=SUMMARY.find(s=>getPrefix(s.q)===key)||{t:""};
          out.push({...item,l1t:l1.t}); if(out.length>=120) return out; }
      }
    }
    return out;
  },[terms,prod,famFilter]);
  function hl(text){
    if(!text) return "";
    if(!terms.length) return escapeHtml(text);
    // Split on matches (odd parts), escaping every piece so data text is never parsed as markup.
    return text.split(new RegExp(`(${terms.join("|")})`,"gi")).map((part,i)=>i%2
      ?`<mark style='background:rgba(20,190,240,0.25);color:#a78bfa;border-radius:2px;padding:0 1px'>${escapeHtml(part)}</mark>`
      :escapeHtml(part)).join("");
  }
  if(!q&&!prod) return <div style={{padding:"60px 22px",textAlign:"center",color:"#8a9ab0"}}>Start typing to search</div>;
  if(!results.length) return <div style={{padding:"60px 22px",textAlign:"center",color:"#8a9ab0"}}>No results found</div>;
  return <div style={{padding:"18px 22px"}}>
    <div style={{fontSize:12,color:"#8a9ab0",marginBottom:12}}>
      {results.length}{results.length>=120?"+":""} result{results.length!==1?"s":""}
      {q?<> for <span style={{color:"#e8edf4"}}>"{q}"</span></>:null}
      {prod?<> in <span style={{color:"#e8edf4"}}>{prod}</span></>:null}
      <span style={{color:"#e8edf4"}}> · click to open</span>
    </div>
    {results.map(item=>(
      <div key={item.q} onClick={()=>onSelect(item)}
        style={{background:"#0e0f14",border:"1px solid #0e0f14",borderRadius:10,
          padding:"11px 14px",marginBottom:6,cursor:"pointer",transition:"background 0.1s"}}
        onMouseEnter={e=>e.currentTarget.style.background="#0e1828"}
        onMouseLeave={e=>e.currentTarget.style.background="#0e0f14"}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
          <LBadge level={item.l}/>
          <span style={{fontSize:13,fontWeight:600,color:"#e8edf4"}}
            dangerouslySetInnerHTML={{__html:hl(item.t)}}/>
        </div>
        <div style={{fontSize:11,color:"#e8edf4",marginBottom:item.d?3:0}}>{item.l1t} · {item.q}</div>
        {item.d&&<div style={{fontSize:12,color:"#8a9ab0",lineHeight:1.5}}
          dangerouslySetInnerHTML={{__html:hl(item.d.slice(0,140))+(item.d.length>140?"…":"")}}/>}
      </div>
    ))}
  </div>;
}

/* ── CARD COMPONENTS ── */
function EpicCard({item,dim,selected,onSelect,onClick}){
  const isSelected=selected?.q===item.q;
  const [hov,setHov]=useState(false);
  return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    style={{background:hov&&!dim?"#1a2a38":"#0e1520",opacity:dim?0.25:1,
      border:`1px solid ${isSelected?"#14BEF0":dim?"#0b0c11":"rgba(20,190,240,0.2)"}`,
      borderTop:`3px solid ${isSelected?"#14BEF0":dim?"rgba(20,190,240,0.2)":"#14BEF0"}`,
      borderRadius:10,padding:14,cursor:dim?"default":"pointer",transition:"all 0.13s",
      transform:hov&&!dim?"translateY(-1px)":"none"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:6,marginBottom:4}}>
      <span style={{fontFamily:"monospace",fontSize:10,color:"#e8edf4"}}>{item.q}</span>
      <span style={{display:"flex",gap:4}}><ScopeBadge code={item.q}/></span>
    </div>
    <div onClick={onClick} style={{fontSize:13,fontWeight:600,color:isSelected?"#14BEF0":"#e8edf4",
      marginBottom:5,lineHeight:1.35,cursor:"pointer"}}
      onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
      onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{item.t}</div>
    <div style={{fontSize:11,color:"#8a9ab0",marginBottom:8}}>{item.l2} areas · {item.l3} processes</div>
    <button onClick={e=>{e.stopPropagation();onSelect(item);}}
      style={{fontSize:10,padding:"2px 9px",borderRadius:20,border:`1px solid ${isSelected?"#14BEF0":"rgba(20,190,240,0.2)"}`,
        background:isSelected?"rgba(20,190,240,0.15)":"transparent",color:isSelected?"#14BEF0":"#3d3738",
        cursor:"pointer",fontFamily:"inherit",transition:"all 0.12s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor="#14BEF0";e.currentTarget.style.color="#14BEF0"}}
      onMouseLeave={e=>{if(!isSelected){e.currentTarget.style.borderColor="rgba(20,190,240,0.2)";e.currentTarget.style.color="#3d3738"}}}>
      {isSelected?"◉ Overview":"○ Overview"}
    </button>
  </div>;
}
function AreaCard({item,selected,onSelect,onDrill}){
  const isSelected=selected?.q===item.q;
  const [hov,setHov]=useState(false);
  return <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
    style={{background:hov?"#0e2030":"#0e1520",border:`1px solid ${isSelected?"#0E94A8":"rgba(14,148,168,0.2)"}`,
      borderTop:"3px solid #2dd4bf",borderRadius:10,padding:14,transition:"all 0.13s",
      transform:hov?"translateY(-1px)":"none"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:6,marginBottom:4}}>
      <span style={{fontFamily:"monospace",fontSize:10,color:"#e8edf4"}}>{item.q}</span>
      <span style={{display:"flex",gap:4}}><ScopeBadge code={item.q}/></span>
    </div>
    <div onClick={onDrill} style={{fontSize:13,fontWeight:600,color:isSelected?"#14BEF0":"#e8edf4",
      marginBottom:5,lineHeight:1.35,cursor:"pointer"}}
      onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
      onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{item.t}</div>
    <div style={{fontSize:11,color:"#8a9ab0",marginBottom:8}}>{item.l3c} processes · {item.l4c} scenarios</div>
    <button onClick={e=>{e.stopPropagation();onSelect(item);}}
      style={{fontSize:10,padding:"2px 9px",borderRadius:20,border:`1px solid ${isSelected?"#0E94A8":"rgba(20,190,240,0.2)"}`,
        background:isSelected?"rgba(14,148,168,0.12)":"transparent",color:isSelected?"#0E94A8":"#3d3738",
        cursor:"pointer",fontFamily:"inherit",transition:"all 0.12s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor="#0E94A8";e.currentTarget.style.color="#0E94A8"}}
      onMouseLeave={e=>{if(!isSelected){e.currentTarget.style.borderColor="rgba(20,190,240,0.2)";e.currentTarget.style.color="#3d3738"}}}>
      {isSelected?"◉ Overview":"○ Overview"}
    </button>
  </div>;
}

/* ── SIDEBAR ── */
function Sidebar({l1idx,onL1,famFilter,setFamFilter,prodFilter,setProdFilter}){
  const filteredPrefixes=useMemo(()=>{
    if(!famFilter&&!prodFilter) return null;
    const fam=famFilter?new Set(FAM_INDEX[famFilter]?.l1||[]):null;
    const prod=prodFilter?new Set(PRODUCT_INDEX[prodFilter]?.l1||[]):null;
    return new Set(SUMMARY.map(s=>getPrefix(s.q)).filter(p=>(!fam||fam.has(p))&&(!prod||prod.has(p))));
  },[famFilter,prodFilter]);
  const selectedFams=familiesOf(famFilter);

  // Families can be combined; the product filter lists the products of the selected families.
  function toggleFamily(fam){
    const next=selectedFams.includes(fam)?selectedFams.filter(f=>f!==fam):[...selectedFams,fam];
    const key=next.length?familyKey(next):"";
    setFamFilter(key);
    if(prodFilter&&key&&!FAMILY_PRODUCTS[key].has(prodFilter)) setProdFilter("");
  }
  const productOptions=useMemo(()=>{
    const fams=selectedFams.length?selectedFams:APP_FAMILIES;
    return [...new Set(fams.flatMap(f=>[...(FAMILY_PRODUCTS[f]||[])]))]
      .filter(p=>PRODUCT_INDEX[p]).sort();
  },[famFilter]);

  // Family button colours
  const FAM_COLORS = {
    'Business Central':     {color:'#2dd4bf',bg:'rgba(14,148,168,0.12)', border:'rgba(14,148,168,0.35)'},
    'Finance and Operations':{color:'#14BEF0',bg:'rgba(20,190,240,0.12)',border:'rgba(20,190,240,0.4)'},
    'Customer Engagement':  {color:'#fb923c',bg:'rgba(241,99,32,0.12)', border:'rgba(241,99,32,0.35)'},
    'Azure':                {color:'#60a5fa',bg:'rgba(114,216,246,0.12)', border:'rgba(114,216,246,0.35)'},
  };

  return <div style={{width:238,minWidth:238,background:"#0b0c11",borderRight:"1px solid rgba(20,190,240,0.1)",display:"flex",flexDirection:"column",flexShrink:0}}>

    {/* Application Family Filter */}
      <div style={{padding:"7px 12px 11px",borderBottom:"1px solid rgba(20,190,240,0.1)",flexShrink:0}}>
      <div style={{fontSize:10,fontWeight:600,letterSpacing:"1px",color:"#6b7a90",textTransform:"uppercase",marginBottom:9,display:"flex",alignItems:"center"}}>
        Application Family
        <HelpTip position="right" text="Filter the entire catalogue to a specific D365 product area. Affects EPICs, Process Areas, Processes, Scenarios, and diagrams at every level."/>
      </div>
      {IS_CLIENT?<div style={{fontSize:12,fontWeight:600,color:"#14BEF0",padding:"7px 10px",borderRadius:8,
        background:"rgba(20,190,240,0.12)",border:"1px solid rgba(20,190,240,0.4)"}}>Finance and Operations</div>:
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {APP_FAMILIES.map(fam=>{
          const active=selectedFams.includes(fam);
          const fc=FAM_COLORS[fam]||{color:"#e8edf4",bg:"rgba(107,114,128,0.12)",border:"rgba(107,114,128,0.3)"};
          const l1count = FAM_INDEX[fam]?.l1?.length||0;
          const l3count = FAM_INDEX[fam]?.l3?.length||0;
          return <button key={fam} onClick={()=>toggleFamily(fam)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",
              width:"100%",padding:"7px 10px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",
              transition:"all 0.13s",textAlign:"left",
              background:active?fc.bg:"transparent",
              border:`1px solid ${active?fc.border:"rgba(20,190,240,0.2)"}`,
              color:active?fc.color:"#6b7a90",
              fontWeight:active?600:400}}>
            <span style={{fontSize:12}}>{fam}</span>
            <span style={{fontSize:10,opacity:0.7}}>{l1count} EPICs · {l3count} procs</span>
          </button>;
        })}
        {(famFilter||prodFilter)&&<button onClick={()=>{setFamFilter("");setProdFilter("");}}
          style={{fontSize:11,padding:"4px 10px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
            background:"rgba(241,99,32,0.08)",color:"#F16320",border:"1px solid rgba(241,99,32,0.25)",
            fontWeight:600,marginTop:2}}>✕ Clear filters</button>}
      </div>}
      <div style={{fontSize:10,fontWeight:600,letterSpacing:"1px",color:"#6b7a90",textTransform:"uppercase",margin:"12px 0 7px"}}>
        Product</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
        {productOptions.map(p=>{
          const on=prodFilter===p;
          return <button key={p} onClick={()=>setProdFilter(on?"":p)} title={`${PRODUCT_INDEX[p].l3.length} processes`}
            style={{fontSize:10.5,padding:"3px 8px",borderRadius:20,cursor:"pointer",fontFamily:"inherit",
              border:`1px solid ${on?"#14BEF0":"rgba(20,190,240,0.2)"}`,background:on?"rgba(20,190,240,0.14)":"transparent",
              color:on?"#14BEF0":"#8a9ab0",fontWeight:on?600:400}}>{p}</button>;
        })}
      </div>
    </div>

    {/* EPIC list */}
    <div style={{overflowY:"auto",flex:1,padding:"7px 0"}}>
      <div style={{padding:"7px 12px 5px",fontSize:10,fontWeight:600,letterSpacing:"1px",color:"#6b7a90",textTransform:"uppercase",display:"flex",alignItems:"center"}}>
        End-to-End Processes
        <HelpTip position="right" text="The 15 top-level EPICs covering the full D365 process landscape. Click any EPIC to drill into its Process Areas."/>
        {famFilter&&!IS_CLIENT&&<span style={{marginLeft:6,color:"#14BEF0",fontWeight:400}}>
          ({filteredPrefixes?.size||0}/{SUMMARY.length})
        </span>}
      </div>
      {SUMMARY.map((l1,i)=>{
        const active=l1idx===i; const prefix=getPrefix(l1.q);
        const dim=!!filteredPrefixes&&!filteredPrefixes.has(prefix);
        if(IS_CLIENT&&dim) return null;
        return <div key={l1.q} onClick={()=>!dim&&onL1(i)}
          style={{display:"flex",alignItems:"center",gap:7,padding:"7px 12px",cursor:dim?"default":"pointer",
            borderLeft:`3px solid ${active?"#14BEF0":"transparent"}`,
            background:active?"rgba(20,190,240,0.1)":"transparent",opacity:dim?0.22:1,transition:"all 0.1s"}}
          onMouseEnter={e=>{if(!active&&!dim)e.currentTarget.style.background="#0e1828"}}
          onMouseLeave={e=>{if(!active)e.currentTarget.style.background=active?"rgba(20,190,240,0.12)":"transparent"}}>
          <span style={{fontFamily:"monospace",fontSize:9,color:"#e8edf4",minWidth:18}}>{String(i+1).padStart(2,"0")}</span>
          <span style={{fontSize:11,color:active?"#14BEF0":"#8a9ab0",flex:1,lineHeight:1.35}}>{l1.t}</span>
          <span style={{fontSize:9,color:"#e8edf4",background:"#0b0c11",borderRadius:10,padding:"1px 5px",flexShrink:0}}>{l1.l3}</span>
        </div>;
      })}
    </div>
  </div>;
}

/* ── TOP BAR ── */

/* ══════════════════════════════════════════════════════════
   HELP SYSTEM — Tooltip + Sliding Panel
   ══════════════════════════════════════════════════════════ */

/* ── Contextual ? tooltip ── */
function HelpTip({text,position="top"}){
  const [show,setShow]=useState(false);
  const ref=useRef();
  const [coords,setCoords]=useState({top:0,left:0});

  function handleEnter(){
    if(ref.current){
      const r=ref.current.getBoundingClientRect();
      const pos={};
      if(position==="top"||position==="bottom"){
        pos.left=r.left+r.width/2;
        pos.top=position==="top"?r.top-8:r.bottom+8;
      } else if(position==="left"){
        pos.left=r.left-8;
        pos.top=r.top+r.height/2;
      } else {
        pos.left=r.right+8;
        pos.top=r.top+r.height/2;
      }
      setCoords(pos);
    }
    setShow(true);
  }

  const transformMap={
    top:"translate(-50%,-100%)",
    bottom:"translate(-50%,0%)",
    left:"translate(-100%,-50%)",
    right:"translate(0%,-50%)",
  };

  return <>
    <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={()=>setShow(false)}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
        width:14,height:14,borderRadius:"50%",background:"rgba(20,190,240,0.18)",
        color:"#14BEF0",fontSize:9,fontWeight:700,cursor:"help",flexShrink:0,
        border:"1px solid rgba(20,190,240,0.35)",lineHeight:1,userSelect:"none",
        marginLeft:5,verticalAlign:"middle"}}>?</span>
    {show&&<div style={{position:"fixed",zIndex:9999,
      top:coords.top,left:coords.left,
      transform:transformMap[position]||"translate(-50%,-100%)",
      background:"#0b0c11",border:"1px solid rgba(20,190,240,0.4)",
      borderRadius:8,padding:"8px 12px",maxWidth:260,fontSize:11,
      color:"#e8edf4",lineHeight:1.55,pointerEvents:"none",
      boxShadow:"0 4px 24px rgba(0,0,0,0.6)"}}>
      <div style={{position:"absolute",width:6,height:6,background:"#0b0c11",
        border:"1px solid rgba(20,190,240,0.4)",
        ...(position==="top"?{bottom:-4,left:"50%",transform:"translateX(-50%) rotate(45deg)",borderTop:"none",borderLeft:"none"}:
           position==="bottom"?{top:-4,left:"50%",transform:"translateX(-50%) rotate(45deg)",borderBottom:"none",borderRight:"none"}:
           position==="right"?{left:-4,top:"50%",transform:"translateY(-50%) rotate(45deg)",borderRight:"none",borderTop:"none"}:
           {right:-4,top:"50%",transform:"translateY(-50%) rotate(45deg)",borderLeft:"none",borderBottom:"none"})
      }}/>
      {text}
    </div>}
  </>;
}

/* ── Full sliding help panel ── */
const HELP_SECTIONS=[
  { id:"overview", icon:"📋", title:"Overview",
    content:[
      {type:"p",text:"The D365 Process Catalogue organises Microsoft Dynamics 365 business processes into a four-level hierarchy, helping consultants and project teams locate, understand, and communicate processes across all D365 application families."},
    ]
  },
  { id:"hierarchy", icon:"🏗️", title:"Process Hierarchy",
    content:[
      {type:"p",text:"Every process has a unique numeric code reflecting its position in the hierarchy:"},
      {type:"levels",items:[
        {badge:"L1",color:"#0E94A8",label:"EPIC",example:"10.00.000.000",desc:"Top-level end-to-end process group (e.g. Inventory to deliver)"},
        {badge:"L2",color:"#2BB8D0",label:"Process Area",example:"10.10.000.000",desc:"Logical grouping of related processes within an EPIC"},
        {badge:"L3",color:"#F16320",label:"Process",example:"10.10.010.000",desc:"An individual business process with defined steps and outcomes"},
        {badge:"L4",color:"#C44D10",label:"Scenario",example:"10.10.010.100",desc:"A specific execution variant tied to a product"},
      ]},
      {type:"tip",text:"Example: 60.30.010.000 = EPIC 60 (Inventory to deliver) → Area 60.30 (Process inbound goods) → Process 60.30.010 (Receive goods)"},
    ]
  },
  { id:"filter", icon:"🔍", title:"Application Family Filter",
    content:[
      {type:"p",text:"The sidebar filter scopes the entire catalogue to a specific D365 product area. When active, filtering applies at every level — EPICs, Process Areas, Processes, Scenarios, and the auto-generated diagram."},
      {type:"families",items:[
        {name:"Finance and Operations",products:"Finance, Supply Chain Management, Field Service, Project Operations, Human Resources"},
        {name:"Business Central",products:"Business Central"},
        {name:"Customer Engagement",products:"Sales, Customer Service, Customer Insights, Customer Voice"},
        {name:"Azure",products:"Azure"},
      ]},
      {type:"tip",text:"Click Clear Filter in the sidebar to return to the full catalogue view."},
    ]
  },
  { id:"navigation", icon:"🧭", title:"Navigation",
    content:[
      {type:"p",text:"Navigate the catalogue by drilling down through levels:"},
      {type:"steps",items:[
        "Click an EPIC card on the home screen to enter the EPIC view (L1)",
        "Click a Process Area card title to drill into the Process Area (L2)",
        "Click any Process row title to preview details in the right panel",
        "Click ▶ on a Process row to expand and view Scenarios inline",
        "Use the breadcrumb trail at the top to jump back to any level",
      ]},
    ]
  },
  { id:"diagram", icon:"📊", title:"Process Diagrams",
    content:[
      {type:"p",text:"Expanding a Process (L3) shows an auto-generated flow diagram of its L4 Scenarios. Each box represents a scenario — colour-coded by product. Arrows show the typical execution sequence."},
      {type:"tip",text:"Switch between Diagram and Scenarios tabs inside any expanded L3 process. When a Family filter is active, only nodes for that family's products appear in the diagram."},
    ]
  },
  { id:"panel", icon:"📌", title:"Detail Panel",
    content:[
      {type:"p",text:"Clicking any item opens its details in the right-hand panel. The panel shows the description, counts, and — for L3 processes — tabs for Diagram, Scenarios, System Processes, and Test Cases."},
    ]
  },
  { id:"search", icon:"🔎", title:"Search",
    content:[
      {type:"p",text:"Use the search bar (top right) to find processes across the whole catalogue by keyword or code fragment. Results are grouped by level and scoped to the active Application Family filter."},
      {type:"tip",text:'Search "60.30" to find all processes in the Inventory to deliver → Process inbound goods area.'},
    ]
  },
];

function HelpPanel({open,onClose}){
  const [activeSection,setActiveSection]=useState("overview");
  const sectionRefs=useRef({});

  function scrollTo(id){
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  return <>
    {/* Backdrop */}
    {open&&<div onClick={onClose}
      style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,
        backdropFilter:"blur(2px)"}}/>}

    {/* Panel */}
    <div style={{position:"fixed",top:0,right:0,height:"100vh",width:420,
      background:"#0e0f14",borderLeft:"1px solid rgba(20,190,240,0.2)",
      zIndex:201,display:"flex",flexDirection:"column",
      transform:open?"translateX(0)":"translateX(100%)",
      transition:"transform 0.28s cubic-bezier(0.4,0,0.2,1)",
      boxShadow:open?"-8px 0 40px rgba(0,0,0,0.6)":"none"}}>

      {/* Header */}
      <div style={{padding:"14px 18px",borderBottom:"1px solid rgba(20,190,240,0.15)",
        display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <span style={{fontSize:18}}>💡</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:"#e8edf4"}}>Help & Guide</div>
          <div style={{fontSize:11,color:"#6b7a90"}}>D365 Process Catalogue</div>
        </div>
        <button onClick={onClose}
          style={{background:"rgba(20,190,240,0.1)",border:"1px solid rgba(20,190,240,0.2)",
            borderRadius:6,color:"#8a9ab0",cursor:"pointer",fontSize:16,
            width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",
            lineHeight:1,padding:0}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(20,190,240,0.2)";e.currentTarget.style.color="#14BEF0";}}
          onMouseLeave={e=>{e.currentTarget.style.background="rgba(20,190,240,0.1)";e.currentTarget.style.color="#8a9ab0";}}>×</button>
      </div>

      {/* TOC */}
      <div style={{padding:"10px 12px",borderBottom:"1px solid rgba(20,190,240,0.1)",
        display:"flex",flexWrap:"wrap",gap:5,flexShrink:0}}>
        {HELP_SECTIONS.map(s=>(
          <button key={s.id} onClick={()=>scrollTo(s.id)}
            style={{background:activeSection===s.id?"rgba(20,190,240,0.2)":"rgba(255,255,255,0.04)",
              border:`1px solid ${activeSection===s.id?"rgba(20,190,240,0.5)":"rgba(255,255,255,0.06)"}`,
              borderRadius:6,color:activeSection===s.id?"#14BEF0":"#8a9ab0",
              cursor:"pointer",fontSize:10,padding:"3px 8px",fontWeight:activeSection===s.id?600:400,
              transition:"all 0.15s"}}>
            {s.icon} {s.title}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 0 20px"}}>
        {HELP_SECTIONS.map(s=>(
          <div key={s.id} ref={el=>sectionRefs.current[s.id]=el}
            style={{padding:"16px 18px",borderBottom:"1px solid rgba(255,255,255,0.04)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <span style={{fontSize:16}}>{s.icon}</span>
              <span style={{fontSize:13,fontWeight:700,color:"#14BEF0"}}>{s.title}</span>
            </div>
            {s.content.map((block,bi)=>{
              if(block.type==="p") return(
                <p key={bi} style={{fontSize:12,color:"#8a9ab0",lineHeight:1.65,margin:"0 0 10px"}}>{block.text}</p>
              );
              if(block.type==="tip") return(
                <div key={bi} style={{background:"rgba(20,190,240,0.06)",border:"1px solid rgba(20,190,240,0.2)",
                  borderLeft:"3px solid #14BEF0",borderRadius:6,padding:"8px 10px",marginBottom:10}}>
                  <span style={{fontSize:11,color:"#14BEF0",fontWeight:600}}>💡 Tip  </span>
                  <span style={{fontSize:11,color:"#8a9ab0",lineHeight:1.55}}>{block.text}</span>
                </div>
              );
              if(block.type==="steps") return(
                <ol key={bi} style={{paddingLeft:18,margin:"0 0 10px"}}>
                  {block.items.map((item,i)=>(
                    <li key={i} style={{fontSize:12,color:"#8a9ab0",lineHeight:1.65,marginBottom:4}}>{item}</li>
                  ))}
                </ol>
              );
              if(block.type==="levels") return(
                <div key={bi} style={{display:"flex",flexDirection:"column",gap:6,marginBottom:10}}>
                  {block.items.map((item,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,
                      background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"7px 10px"}}>
                      <span style={{background:item.color,color:"#fff",borderRadius:4,
                        fontSize:10,fontWeight:700,padding:"2px 6px",flexShrink:0,marginTop:1}}>{item.badge}</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"#e8edf4"}}>{item.label}
                          <span style={{fontFamily:"monospace",fontSize:10,color:"#6b7a90",marginLeft:6}}>{item.example}</span>
                        </div>
                        <div style={{fontSize:11,color:"#6b7a90",lineHeight:1.5,marginTop:2}}>{item.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
              if(block.type==="families") return(
                <div key={bi} style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
                  {block.items.map((item,i)=>(
                    <div key={i} style={{background:"rgba(255,255,255,0.03)",borderRadius:6,padding:"7px 10px"}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#e8edf4",marginBottom:2}}>{item.name}</div>
                      <div style={{fontSize:11,color:"#6b7a90"}}>{item.products}</div>
                    </div>
                  ))}
                </div>
              );
              return null;
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{padding:"10px 18px",borderTop:"1px solid rgba(20,190,240,0.1)",
        flexShrink:0,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:10,color:"#6b7a90"}}>iCatalyst · D365 Process Catalogue</span>
        <span style={{fontSize:10,color:"#6b7a90"}}>{CATALOGUE_INFO.version}</span>
      </div>
    </div>
  </>;
}

function TopBar({searchQ,setSearchQ,onHome,onHelp,onSummary,onProjects}){
  const inputRef=useRef();
  return <div style={{background:"#13151f",borderBottom:"1px solid #0e0f14",padding:"0 18px",
    height:50,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100,flexShrink:0}}>
    <div onClick={onHome} style={{display:"flex",alignItems:"center",gap:12,cursor:"pointer",flexShrink:0}}>
      <div style={{background:"#ffffff",borderRadius:6,padding:"3px 8px",display:"flex",alignItems:"center",flexShrink:0}}><img src="/icatalyst-logo.jpg" alt="iCatalyst" style={{height:22,width:"auto",display:"block"}}/></div>
      <div style={{width:1,height:24,background:"rgba(20,190,240,0.2)",flexShrink:0}}/>
      <span style={{fontSize:12,fontWeight:500,color:"#8a9ab0",letterSpacing:"-0.2px"}}>D365 Process Catalogue</span>
      <span style={{fontSize:10,color:"#6b7a90",marginLeft:2}}>{CATALOGUE_INFO.version}</span>
    </div>
    <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:10}}>
      <ProjectBar onSummary={onSummary} onProjects={onProjects}/>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:12,color:"#8a9ab0",pointerEvents:"none"}}>🔍</span>
        <input ref={inputRef} value={searchQ} onChange={e=>setSearchQ(e.target.value)}
          placeholder="Search all levels..."
          style={{background:"#13151f",border:"1px solid rgba(20,190,240,0.2)",borderRadius:8,
            padding:"5px 26px 5px 27px",color:"#e8edf4",fontSize:12,width:220,outline:"none",transition:"border-color 0.15s"}}
          onFocus={e=>e.target.style.borderColor="#14BEF0"}
          onBlur={e=>e.target.style.borderColor="rgba(20,190,240,0.2)"}/>
        {searchQ&&<span onClick={()=>{setSearchQ("");inputRef.current?.focus();}}
          style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",cursor:"pointer",color:"#8a9ab0",fontSize:15,lineHeight:1}}>×</span>}
      </div>
      <button onClick={onHelp}
        style={{background:"rgba(20,190,240,0.1)",border:"1px solid rgba(20,190,240,0.25)",
          borderRadius:8,color:"#14BEF0",cursor:"pointer",fontSize:12,fontWeight:700,
          height:30,padding:"0 12px",display:"flex",alignItems:"center",gap:5,flexShrink:0,
          transition:"all 0.15s"}}
        onMouseEnter={e=>{e.currentTarget.style.background="rgba(20,190,240,0.2)";}}
        onMouseLeave={e=>{e.currentTarget.style.background="rgba(20,190,240,0.1)";}}>
        <span style={{fontSize:13}}>?</span>
        <span style={{fontSize:11}}>Help</span>
      </button>
    </div>
  </div>;
}

/* ── OVERVIEW STATS CALCULATOR ── */
function useOverviewStats(selected){
  return useMemo(()=>{
    if(!selected) return [];
    const prefix=getPrefix(selected.q);
    const all=PER_L1[prefix]||[];
    if(selected.l===1){
      const sum=SUMMARY.find(s=>s.q===selected.q);
      if(!sum) return [];
      return [
        {label:"Process Areas",value:sum.l2,color:"#0E94A8"},
        {label:"Processes",    value:sum.l3,color:"#F16320"},
        {label:"Scenarios",    value:sum.l4,color:"#F16320"},
        {label:"Sys Processes",value:sum.l5,color:"#0E94A8"},
        {label:"Test Cases",   value:sum.l6,color:"#14F032"},
      ];
    }
    if(selected.l===2){
      const l2prefix=selected.q.split(".").slice(0,2).join(".");
      const l3c=all.filter(x=>x.l===3&&x.q.startsWith(l2prefix+".")).length;
      const l4c=all.filter(x=>x.l===4&&x.q.startsWith(l2prefix+".")).length;
      const l3s=all.filter(x=>x.l===3&&x.q.startsWith(l2prefix+"."));
      const sp=l3s.reduce((a,x)=>a+(x.sp||0),0);
      const tc=l3s.reduce((a,x)=>a+(x.tc||0),0);
      return [{label:"Processes",value:l3c,color:"#F16320"},{label:"Scenarios",value:l4c,color:"#F16320"},
              {label:"Sys Procs",value:sp,color:"#0E94A8"},{label:"Test Cases",value:tc,color:"#14F032"}];
    }
    if(selected.l===3){
      const pfx3=selected.q.split(".").slice(0,3).join(".")+".";
      const sc=all.filter(x=>x.l===4&&x.q.startsWith(pfx3)).length;
      return [{label:"Scenarios",value:sc,color:"#F16320"},
              {label:"Sys Procs",value:selected.sp||0,color:"#0E94A8"},
              {label:"Test Cases",value:selected.tc||0,color:"#14F032"}];
    }
    if(selected.l===4){
      const spList=(SP_INDEX[prefix]||{})[selected.q]||[];
      const tcCount=spList.reduce((a,sp)=>a+((TC_INDEX[prefix]||{})[sp.q]||[]).length,0);
      return [{label:"Sys Processes",value:spList.length,color:"#0E94A8"},
              {label:"Test Cases",   value:tcCount,      color:"#14F032"}];
    }
    if(selected.l===5){
      const tcList=(TC_INDEX[prefix]||{})[selected.q]||[];
      return [{label:"Test Cases",value:tcList.length,color:"#14F032"}];
    }
    return [];
  },[selected]);
}

/* ── ROOT ── */
let catalogueRevision = 0;
export default function App(){
  const [view,setView]             = useState("home");
  const [l1idx,setL1idx]           = useState(null);
  const [l2q,setL2q]               = useState(null);
  const [searchQ,setSearchQ]       = useState("");
  const [famFilter,setFamFilter]   = useState(IS_CLIENT?CLIENT_FAMILY:"");
  const [prodFilter,setProdFilter] = useState("");
  const [selected,setSelected]     = useState(null);
  const [showHelp,setShowHelp]     = useState(false);
  const [showProjects,setShowProjects] = useState(false);
  const project = useProject();
  // Merge the project's custom processes into the catalogue; views remount when they change.
  const catalogueVersion = useMemo(()=>{ applyCustomNodes(project?.nodes||[]); return ++catalogueRevision; },[project?.nodes]);
  const isSearching=searchQ.length>=2;
  const overviewStats=useOverviewStats(selected);

  function goHome(){ setView("home"); setL1idx(null); setL2q(null); }
  function goL1(i){  setL1idx(i); setView("l1"); setL2q(null); }
  function goL2(i,q){ setL1idx(i); setL2q(q); setView("l2"); }
  function handleSearch(v){
    setSearchQ(v);
    if(v.length>=2) setView("search");
    else setView(l2q?"l2":l1idx!==null?"l1":"home");
  }

  // Open a search result in the hierarchy: its EPIC or process area, with the process expanded.
  const [focus,setFocus] = useState(null);
  function openItem(item){
    const i=SUMMARY.findIndex(s=>getPrefix(s.q)===getPrefix(item.q));
    setSearchQ(""); setSelected(item);
    if(i<0) return;
    if(item.l===1){ goL1(i); return; }
    const s=item.q.split(".");
    goL2(i,item.l===2?item.q:`${s[0]}.${s[1]}.000.000`);
    setFocus(item.l>=3?{q:item.q}:null); // object so re-opening the same item still triggers
  }
  const findItem = q => (PER_L1[getPrefix(q)]||[]).find(i=>i.q===q);
  useEffect(()=>{ // keep the details panel in step with edits/removals of custom items
    if(selected?.custom) setSelected(findItem(selected.q)||null);
  },[catalogueVersion]);
  useEffect(()=>{ // open what was just added
    const item=project?.lastAdded&&findItem(project.lastAdded.code);
    if(item){ setSelected(item); setFocus({q:item.q}); }
  },[project?.lastAdded]);
  useEffect(()=>{
    if(!focus) return;
    const t=setTimeout(()=>document.querySelector(`[data-code="${focus.q}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}),150);
    return ()=>clearTimeout(t);
  },[focus]);

  return <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:"#13151f",
    color:"#e8edf4",minHeight:"100vh",display:"flex",flexDirection:"column"}}>
    <TopBar searchQ={searchQ} setSearchQ={handleSearch} onHome={goHome} onHelp={()=>setShowHelp(true)}
      onSummary={()=>{ setSearchQ(""); setView("scope"); }} onProjects={()=>setShowProjects(true)}/>
    <div style={{display:"flex",flex:1,overflow:"hidden",height:"calc(100vh - 50px)"}}>
      <Sidebar key={"s"+catalogueVersion} l1idx={l1idx} onL1={goL1} famFilter={famFilter} setFamFilter={setFamFilter}
        prodFilter={prodFilter} setProdFilter={setProdFilter}/>
      <div key={"c"+catalogueVersion} style={{flex:1,overflowY:"auto",minWidth:0}}>
        {isSearching&&<SearchView q={searchQ} prod={prodFilter} famFilter={famFilter} onSelect={openItem}/>}
        {!isSearching&&view==="scope"&&<ScopeSummary summary={SUMMARY} perL1={PER_L1} famIndex={FAM_INDEX}
          famFilter={famFilter} inFamily={inFamily} onOpenL1={goL1}/>}
        {!isSearching&&view==="home"&&<HomeView onL1={goL1} onSelect={setSelected} selected={selected} prodFilter={prodFilter} famFilter={famFilter}/>}
        {!isSearching&&view==="l1"&&l1idx!==null&&<L1View l1idx={l1idx} onL2={goL2} onBack={goHome} onSelect={setSelected} selected={selected} prodFilter={prodFilter} famFilter={famFilter}/>}
        {!isSearching&&view==="l2"&&l1idx!==null&&l2q&&<L2View l1idx={l1idx} l2q={l2q} onBack={goHome} onL1={goL1} onSelect={setSelected} selected={selected} prodFilter={prodFilter} famFilter={famFilter} focus={focus}/>}
      </div>
      <OverviewPanel item={selected} stats={overviewStats} onClose={()=>setSelected(null)} famFilter={famFilter}/>
    </div>
    <HelpPanel open={showHelp} onClose={()=>setShowHelp(false)}/>
    <ProjectsPanel open={showProjects} onClose={()=>setShowProjects(false)}/>
  </div>;
}
