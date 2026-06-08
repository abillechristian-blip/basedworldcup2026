import { useState, useRef, useEffect } from "react";
import { saveState, listenState } from "./firebase";

// ── 2026 TEAMS (ESPN Rankings) ────────────────────────────────────────────────
const WC2026_TEAMS = [
  // Pot 1 — Elite (ESPN Top 8)
  { name:"France",        flag:"🇫🇷", pot:"pot1" },
  { name:"Spain",         flag:"🇪🇸", pot:"pot1" },
  { name:"England",       flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", pot:"pot1" },
  { name:"Brazil",        flag:"🇧🇷", pot:"pot1" },
  { name:"Portugal",      flag:"🇵🇹", pot:"pot1" },
  { name:"Netherlands",   flag:"🇳🇱", pot:"pot1" },
  { name:"Argentina",     flag:"🇦🇷", pot:"pot1" },
  { name:"Germany",       flag:"🇩🇪", pot:"pot1" },
  // Pot 2 — Strong (ESPN #9-16)
  { name:"Norway",        flag:"🇳🇴", pot:"pot2" },
  { name:"Belgium",       flag:"🇧🇪", pot:"pot2" },
  { name:"Senegal",       flag:"🇸🇳", pot:"pot2" },
  { name:"Türkiye",       flag:"🇹🇷", pot:"pot2" },
  { name:"Morocco",       flag:"🇲🇦", pot:"pot2" },
  { name:"Colombia",      flag:"🇨🇴", pot:"pot2" },
  { name:"Uruguay",       flag:"🇺🇾", pot:"pot2" },
  { name:"Ecuador",       flag:"🇪🇨", pot:"pot2" },
  // Pot 3 — Mid-Tier (ESPN #17-24)
  { name:"Switzerland",   flag:"🇨🇭", pot:"pot3" },
  { name:"Croatia",       flag:"🇭🇷", pot:"pot3" },
  { name:"Ivory Coast",   flag:"🇨🇮", pot:"pot3" },
  { name:"Japan",         flag:"🇯🇵", pot:"pot3" },
  { name:"Sweden",        flag:"🇸🇪", pot:"pot3" },
  { name:"USA",           flag:"🇺🇸", pot:"pot3" },
  { name:"Austria",       flag:"🇦🇹", pot:"pot3" },
  { name:"Mexico",        flag:"🇲🇽", pot:"pot3" },
  // Pot 4 — Contenders (ESPN #25-32)
  { name:"Algeria",       flag:"🇩🇿", pot:"pot4" },
  { name:"Scotland",      flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿", pot:"pot4" },
  { name:"Paraguay",      flag:"🇵🇾", pot:"pot4" },
  { name:"Czechia",       flag:"🇨🇿", pot:"pot4" },
  { name:"Canada",        flag:"🇨🇦", pot:"pot4" },
  { name:"South Korea",   flag:"🇰🇷", pot:"pot4" },
  { name:"Congo DR",      flag:"🇨🇩", pot:"pot4" },
  { name:"Australia",     flag:"🇦🇺", pot:"pot4" },
  // Pot 5 — Underdogs (ESPN #33-40)
  { name:"Egypt",         flag:"🇪🇬", pot:"pot5" },
  { name:"Uzbekistan",    flag:"🇺🇿", pot:"pot5" },
  { name:"Ghana",         flag:"🇬🇭", pot:"pot5" },
  { name:"Bosnia & Herz", flag:"🇧🇦", pot:"pot5" },
  { name:"Panama",        flag:"🇵🇦", pot:"pot5" },
  { name:"Iran",          flag:"🇮🇷", pot:"pot5" },
  { name:"Jordan",        flag:"🇯🇴", pot:"pot5" },
  { name:"Tunisia",       flag:"🇹🇳", pot:"pot5" },
  // Pot 6 — Sleepers (ESPN #41-48)
  { name:"New Zealand",   flag:"🇳🇿", pot:"pot6" },
  { name:"Haiti",         flag:"🇭🇹", pot:"pot6" },
  { name:"Saudi Arabia",  flag:"🇸🇦", pot:"pot6" },
  { name:"Iraq",          flag:"🇮🇶", pot:"pot6" },
  { name:"South Africa",  flag:"🇿🇦", pot:"pot6" },
  { name:"Cape Verde",    flag:"🇨🇻", pot:"pot6" },
  { name:"Curaçao",       flag:"🇨🇼", pot:"pot6" },
  { name:"Qatar",         flag:"🇶🇦", pot:"pot6" },
];

const POT_META = {
  pot1:{ label:"Pot 1", color:"#f0c040", bg:"rgba(240,192,64,0.12)",  badge:"P1" },
  pot2:{ label:"Pot 2", color:"#7ec8e3", bg:"rgba(126,200,227,0.12)", badge:"P2" },
  pot3:{ label:"Pot 3", color:"#a3e635", bg:"rgba(163,230,53,0.12)",  badge:"P3" },
  pot4:{ label:"Pot 4", color:"#fb923c", bg:"rgba(251,146,60,0.12)",  badge:"P4" },
  pot5:{ label:"Pot 5", color:"#c084fc", bg:"rgba(192,132,252,0.12)", badge:"P5" },
  pot6:{ label:"Pot 6", color:"#f87171", bg:"rgba(248,113,113,0.12)", badge:"P6" },
};

const STAGE_COLOR = {
  Winner:"#f0c040", Final:"#9ca3af", SF:"#fb923c",
  QF:"#a3e635", R16:"#60a5fa", Groups:"#6b7a99",
};

const STAGES = ["Groups","R16","QF","SF","Final","Winner"];

// Default all teams to 0 pts / Groups
const DEFAULT_POINTS = {};
WC2026_TEAMS.forEach(t => {
  DEFAULT_POINTS[t.name] = { pts:0, stage:"Groups", champ:false };
});

const getTeam = (name) => WC2026_TEAMS.find(t => t.name === name);

// Sample draw — 8 players × 6 pots
const SAMPLE_PLAYERS = [
  { name:"Christian", teams:[] },
  { name:"Teon",      teams:[] },
  { name:"Beto",      teams:[] },
  { name:"Bird",      teams:[] },
  { name:"Luis",      teams:[] },
  { name:"Roger",     teams:[] },
  { name:"Dro",       teams:[] },
  { name:"Pancho",    teams:[] },
];

const TAB_DESCRIPTIONS = {
  draw:        "See who drew which teams. Drag and drop team badges to swap teams between players.",
  leaderboard: "Live standings with automatic tiebreakers. Tap any team to edit their points.",
  scoring:     "Every win = +3pts, draw = +1pt, champion bonus = +6pts. Tiebreakers also explained here.",
  teams:       "All 48 teams across 6 pots, ranked by ESPN pre-tournament ratings.",
};

export default function App() {
  const [tab, setTab]                 = useState("draw");
  const [activeDesc, setActiveDesc]   = useState("draw");
  const [draftName, setDraftName]     = useState("");
  const [draftTeams, setDraftTeams]   = useState([]);
  const [players, setPlayers]         = useState(SAMPLE_PLAYERS.map(p => ({ ...p })));
  const [teamPoints, setTeamPoints]   = useState({ ...DEFAULT_POINTS });
  const [editingTeam, setEditingTeam] = useState(null);
  const [manualPts, setManualPts]     = useState("");
  const [manualStage, setManualStage] = useState("Groups");
  const [manualChamp, setManualChamp] = useState(false);
  const [openBreakdown, setOpenBreakdown]       = useState(null);
  const [editingResultsFor, setEditingResultsFor] = useState(null);
  const dragTeam = useRef(null);
  const dragFrom = useRef(null);

  // ── FIREBASE SYNC ──────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      listenState((data) => {
        try {
          if (data.players && Array.isArray(data.players) && data.players.length > 0) {
            // Ensure every player has a teams array
            const safePlayers = data.players.map(p => ({
              ...p,
              teams: Array.isArray(p.teams) ? p.teams : [],
            }));
            setPlayers(safePlayers);
          }
          if (data.teamPoints && typeof data.teamPoints === "object") {
            setTeamPoints(prev => ({ ...prev, ...data.teamPoints }));
          }
        } catch (err) {
          console.error("Firebase data parse error:", err);
        }
      });
    } catch (err) {
      console.error("Firebase listener error:", err);
    }
  }, []);

  // Save to Firebase whenever state changes (skip first render)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    try {
      saveState(players, teamPoints);
    } catch (err) {
      console.error("Firebase save error:", err);
    }
  }, [players, teamPoints]);

  const assignedTeams = new Set(players.flatMap(p => p.teams));

  const toggleTeam = (name) => {
    if (assignedTeams.has(name)) return;
    setDraftTeams(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]);
  };
  const addPlayer = () => {
    if (!draftName.trim() || draftTeams.length === 0) return;
    setPlayers(prev => [...prev, { name: draftName.trim(), teams: draftTeams }]);
    setDraftName(""); setDraftTeams([]);
  };
  const removePlayer = (i) => setPlayers(prev => prev.filter((_, idx) => idx !== i));

  // drag & drop
  const onDragStart = (e, pi, tname) => { dragTeam.current = tname; dragFrom.current = pi; e.dataTransfer.effectAllowed = "move"; };
  const onDrop = (e, toIdx) => {
    e.preventDefault();
    const fromIdx = dragFrom.current; const tname = dragTeam.current;
    if (fromIdx === toIdx || fromIdx === null) return;
    setPlayers(prev => {
      const next = prev.map(p => ({ ...p, teams: [...p.teams] }));
      next[fromIdx].teams = next[fromIdx].teams.filter(t => t !== tname);
      next[toIdx].teams.push(tname);
      return next;
    });
    dragTeam.current = null; dragFrom.current = null;
  };
  const onDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  // manual edit
  const [manualW, setManualW] = useState(0);
  const [manualD, setManualD] = useState(0);
  const [manualL, setManualL] = useState(0);

  const openEdit = (tname) => {
    const curr = teamPoints[tname] || { pts:0, stage:"Groups", champ:false, w:0, d:0, l:0 };
    setManualPts(String(curr.pts));
    setManualStage(curr.stage);
    setManualChamp(curr.champ || false);
    setManualW(curr.w || 0);
    setManualD(curr.d || 0);
    setManualL(curr.l || 0);
    setEditingTeam(tname);
  };
  const saveEdit = () => {
    setTeamPoints(prev => ({ ...prev, [editingTeam]: { pts: parseInt(manualPts)||0, stage: manualStage, champ: manualChamp, w: parseInt(manualW)||0, d: parseInt(manualD)||0, l: parseInt(manualL)||0 } }));
    setEditingTeam(null);
  };

  const getTeamPts  = (name) => teamPoints[name]?.pts ?? 0;
  const getStage    = (name) => teamPoints[name]?.stage ?? "Groups";
  const getChamp    = (name) => teamPoints[name]?.champ ?? false;
  const getPlayerTotal    = (p) => p.teams.reduce((s, t) => s + getTeamPts(t), 0);
  const getPlayerKOWins   = (p) => p.teams.reduce((s, t) => s + ({"R16":1,"QF":2,"SF":3,"Final":4,"Winner":5}[getStage(t)]||0), 0);
  const getPlayerGroupWins= (p) => p.teams.reduce((s, t) => {
    const koPts = {"R16":3,"QF":6,"SF":9,"Final":12,"Winner":18}[getStage(t)]||0;
    return s + Math.floor(Math.max(0, getTeamPts(t) - koPts) / 3);
  }, 0);

  const getPlayerRecord = (p) => ({
    w: p.teams.reduce((s, t) => s + (teamPoints[t]?.w || 0), 0),
    d: p.teams.reduce((s, t) => s + (teamPoints[t]?.d || 0), 0),
    l: p.teams.reduce((s, t) => s + (teamPoints[t]?.l || 0), 0),
  });

  const leaderboard = [...players]
    .map((p, origIdx) => ({ ...p, origIdx, total: getPlayerTotal(p), koWins: getPlayerKOWins(p), groupWins: getPlayerGroupWins(p), record: getPlayerRecord(p) }))
    .sort((a, b) => b.total !== a.total ? b.total - a.total : b.koWins !== a.koWins ? b.koWins - a.koWins : b.groupWins - a.groupWins);

  const medalColor = (i) => ["#c8a951","#9ca3af","#cd7f32"][i] || "#1a2540";

  const toggleBreakdown = (pi, tname) => {
    if (openBreakdown?.pi===pi && openBreakdown?.tname===tname) setOpenBreakdown(null);
    else { setOpenBreakdown({ pi, tname }); setEditingResultsFor(null); }
  };

  const handleTabClick = (id) => {
    setTab(id); setActiveDesc(id);
  };

  const renderBreakdown = (tname) => {
    const t     = getTeam(tname);
    const pts   = getTeamPts(tname);
    const stage = getStage(tname);
    const champ = getChamp(tname);
    const color = STAGE_COLOR[stage] || "#6b7a99";
    return (
      <div style={{ borderTop:"1px solid #1a2540", background:"#060a10", padding:"16px 18px", animation:"fadeDown 0.2s ease" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
          <span style={{ fontSize:28 }}>{t?.flag}</span>
          <div>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, fontWeight:800 }}>{tname}</div>
            <div style={{ fontSize:11, color:"#4a5880" }}>Every win = +3pts · Draw = +1pt · Champion = +6 bonus</div>
          </div>
          <div style={{ marginLeft:"auto", textAlign:"right" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:900, color:"#c8a951" }}>{pts}</div>
            <div style={{ fontSize:10, color:"#4a5880" }}>total pts</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:8, background:"#0a0f1c", border:`1px solid ${color}33`, marginBottom:8 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />
          <span style={{ flex:1, fontSize:13, fontWeight:600, color }}>Stage Reached: {stage}</span>
          {champ && <span style={{ fontSize:12, color:"#f0c040", fontWeight:700 }}>🏆 +6 Champion bonus included</span>}
        </div>
        <button onClick={() => openEdit(tname)}
          style={{ width:"100%", background:"#0d1424", border:"1px dashed #2a3a5a", borderRadius:8, color:"#7ec8e3", fontFamily:"'Mulish',sans-serif", fontSize:11, fontWeight:600, letterSpacing:1, textTransform:"uppercase", padding:"8px", cursor:"pointer", marginTop:4 }}>
          ✏️ Edit Points for {tname}
        </button>
      </div>
    );
  };

  // Manual edit modal
  const ManualModal = () => {
    if (!editingTeam) return null;
    const t = getTeam(editingTeam);
    return (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div style={{ background:"#0d1424", border:"1px solid #c8a951", borderRadius:16, padding:24, width:"100%", maxWidth:380 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <span style={{ fontSize:28 }}>{t?.flag}</span>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, fontWeight:800 }}>{editingTeam}</div>
          </div>
          <div style={{ fontSize:11, color:"#4a5880", marginBottom:20 }}>Type in the total points earned by this team</div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", color:"#4a5880", marginBottom:8 }}>Total Points</div>
            <input type="number" min="0" value={manualPts} onChange={e => setManualPts(e.target.value)} placeholder="e.g. 24"
              style={{ background:"#060a10", border:"1px solid #c8a951", borderRadius:8, color:"#c8a951", fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:900, padding:"10px 16px", width:"100%", textAlign:"center", outline:"none" }} />
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", color:"#4a5880", marginBottom:8 }}>Match Record</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
              {[["Wins","w",manualW,setManualW,"#34d399"],["Draws","d",manualD,setManualD,"#facc15"],["Losses","l",manualL,setManualL,"#f87171"]].map(([label,key,val,setter,color]) => (
                <div key={key} style={{ textAlign:"center" }}>
                  <div style={{ fontSize:10, fontWeight:600, color, letterSpacing:1, marginBottom:4 }}>{label}</div>
                  <input type="number" min="0" value={val} onChange={e => setter(parseInt(e.target.value)||0)}
                    style={{ background:"#060a10", border:`1px solid ${color}55`, borderRadius:8, color, fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:800, padding:"8px", width:"100%", textAlign:"center", outline:"none" }} />
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", color:"#4a5880", marginBottom:8 }}>Stage Reached</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6 }}>
              {STAGES.map(s => (
                <button key={s} onClick={() => setManualStage(s)}
                  style={{ padding:"8px 6px", borderRadius:8, border:`1px solid ${manualStage===s ? STAGE_COLOR[s]||"#c8a951" : "#1a2540"}`,
                    background: manualStage===s ? (STAGE_COLOR[s]||"#c8a951")+"22" : "#060a10",
                    color: manualStage===s ? STAGE_COLOR[s]||"#c8a951" : "#4a5880",
                    fontFamily:"'Mulish',sans-serif", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#060a10", borderRadius:8, border:"1px solid #f0c04044", marginBottom:20 }}>
            <span style={{ flex:1, fontSize:13, fontWeight:500, color:"#e8eaf0" }}>Won the World Cup? (+6 bonus)</span>
            <button onClick={() => setManualChamp(c => !c)}
              style={{ padding:"6px 16px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"'Mulish',sans-serif", fontWeight:700, fontSize:13,
                background: manualChamp ? "#f0c040" : "#1a2540", color: manualChamp ? "#080c14" : "#6b7a99" }}>
              {manualChamp ? "🏆 YES" : "No"}
            </button>
          </div>

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setEditingTeam(null)}
              style={{ flex:1, padding:"10px", borderRadius:8, border:"1px solid #2a3a5a", background:"none", color:"#6b7a99", cursor:"pointer", fontFamily:"'Mulish',sans-serif", fontWeight:600 }}>
              Cancel
            </button>
            <button onClick={saveEdit}
              style={{ flex:2, padding:"10px", borderRadius:8, border:"none", background:"#c8a951", color:"#080c14", cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:800, letterSpacing:1 }}>
              SAVE
            </button>
          </div>
        </div>
      </div>
    );
  };

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800;900&family=Mulish:wght@400;500;600;700&display=swap');
    *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Mulish',sans-serif; background:#080c14; color:#e8eaf0; min-height:100vh; }
    @keyframes slideIn  { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
    @keyframes fadeDown { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes descIn   { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
    .tab-btn { background:none; border:none; font-family:'Mulish',sans-serif; font-size:11px; font-weight:700; letter-spacing:2px; text-transform:uppercase; color:#4a5880; padding:12px 14px; cursor:pointer; border-bottom:2px solid transparent; transition:all 0.2s; white-space:nowrap; }
    .tab-btn:hover { color:#c8c8c8; }
    .tab-btn.active { color:#c8a951; border-bottom-color:#c8a951; }
    .tab-desc-bar { animation:descIn 0.2s ease; background:#0a0f1c; border-bottom:1px solid #1a2540; padding:10px 20px; font-size:12px; color:#6b7a99; text-align:center; }
    .team-chip { display:flex; align-items:center; gap:6px; padding:7px 10px; border-radius:7px; cursor:pointer; border:1px solid #1a2540; background:#060a10; transition:all 0.15s; font-size:12px; font-weight:500; user-select:none; }
    .team-chip:hover { border-color:#2a3a5a; background:#0d1424; }
    .team-chip.selected { border-color:#c8a951; background:rgba(200,169,81,0.1); }
    .team-chip.assigned { opacity:0.3; cursor:not-allowed; pointer-events:none; }
    .team-pill { display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:20px; font-size:12px; font-weight:500; border:1px solid #1a2540; background:#060a10; cursor:pointer; transition:all 0.15s; }
    .team-pill:hover { border-color:#c8a951; }
    .team-pill.open { border-color:#c8a951; background:rgba(200,169,81,0.1); }
    .draggable-team { display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:20px; font-size:12px; font-weight:500; border:1px solid #1a2540; background:#060a10; cursor:grab; transition:all 0.15s; user-select:none; }
    .draggable-team:hover { border-color:#c8a951; background:rgba(200,169,81,0.06); }
    .draggable-team:active { cursor:grabbing; opacity:0.7; }
    .drop-zone { transition:border-color 0.2s, background 0.2s; }
    .drop-zone.drag-over { border-color:#c8a951 !important; background:rgba(200,169,81,0.04) !important; }
    .edit-pill { display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:20px; font-size:11px; font-weight:600; border:1px dashed #2a3a5a; cursor:pointer; transition:all 0.15s; color:#4a5880; }
    .edit-pill:hover { border-color:#7ec8e3; color:#7ec8e3; }
    ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#060a10} ::-webkit-scrollbar-thumb{background:#1a2540;border-radius:4px}
  `;

  const tabs = [
    { id:"draw",        label:"🎲 Draw Results" },
    { id:"leaderboard", label:"🏆 Leaderboard"  },
    { id:"scoring",     label:"⚙️ Scoring"      },
    { id:"teams",       label:"🌍 Teams"         },
  ];

  return (
    <>
      <style>{css}</style>
      <ManualModal />
      <div style={{ minHeight:"100vh" }}>

        {/* HEADER */}
        <div style={{ background:"linear-gradient(180deg,#0d1424,#080c14)", borderBottom:"1px solid #1a2540", padding:"28px 20px 0", textAlign:"center" }}>
          <div style={{ fontSize:10, letterSpacing:4, textTransform:"uppercase", color:"#8b4513", background:"#3d1a00", border:"1px solid #8b4513", display:"inline-block", padding:"3px 12px", borderRadius:20, marginBottom:8 }}>
            USA · Canada · Mexico · June–July 2026
          </div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:"clamp(30px,7vw,56px)", fontWeight:900, letterSpacing:2, lineHeight:1, color:"#fff" }}>
            Based World Cup <span style={{ color:"#c8a951" }}>2026</span>
          </div>
          <div style={{ fontSize:11, color:"#4a5880", letterSpacing:2, marginTop:4, marginBottom:14 }}>
            Fantasy Draw · 8 Players · 48 Teams · 6 Pots · ESPN Rankings
          </div>
          <div style={{ display:"flex", justifyContent:"center", borderBottom:"1px solid #1a2540", overflowX:"auto" }}>
            {tabs.map(({ id, label }) => (
              <button key={id} className={`tab-btn ${tab===id?"active":""}`} onClick={() => handleTabClick(id)}>
                {label}
              </button>
            ))}
          </div>
          {/* Description bar — shows on tab re-click */}
          {activeDesc && (
            <div className="tab-desc-bar">{TAB_DESCRIPTIONS[activeDesc]}</div>
          )}
        </div>

        <div style={{ maxWidth:960, margin:"0 auto", padding:"24px 16px" }}>

          {/* ── DRAW RESULTS TAB ── */}
          {tab === "draw" && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:20 }}>

              {/* Teams by pot — drag from here */}
              <div style={{ background:"#0d1424", border:"1px solid #1a2540", borderRadius:14, overflow:"hidden" }}>
                <div style={{ padding:"14px 18px", borderBottom:"1px solid #1a2540", fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"#c8a951" }}>
                  🎲 Available Teams
                </div>
                <div style={{ padding:16 }}>
                  <div style={{ fontSize:11, color:"#4a5880", marginBottom:14, padding:"8px 12px", background:"#060a10", borderRadius:8, border:"1px solid #1a2540" }}>
                    💡 As each team is drawn, drag their badge onto the player who drew them.
                  </div>
                  <div style={{ maxHeight:500, overflowY:"auto", paddingRight:4 }}>
                    {["pot1","pot2","pot3","pot4","pot5","pot6"].map(pot => (
                      <div key={pot} style={{ marginBottom:14 }}>
                        <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:POT_META[pot].color, marginBottom:6 }}>{POT_META[pot].label}</div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                          {WC2026_TEAMS.filter(t => t.pot===pot).map(t => {
                            const isAssigned = assignedTeams.has(t.name);
                            return (
                              <div
                                key={t.name}
                                className={`draggable-team ${isAssigned?"assigned":""}`}
                                draggable={!isAssigned}
                                onDragStart={e => { dragTeam.current = t.name; dragFrom.current = -1; e.dataTransfer.effectAllowed = "move"; }}
                                title={isAssigned ? "Already assigned" : "Drag onto a player"}
                                style={{ opacity: isAssigned ? 0.3 : 1, cursor: isAssigned ? "not-allowed" : "grab" }}
                              >
                                <span style={{ fontSize:9, fontWeight:700, padding:"1px 4px", borderRadius:4, background:POT_META[t.pot].color+"22", color:POT_META[t.pot].color }}>{POT_META[t.pot].badge}</span>
                                <span style={{ fontSize:13 }}>{t.flag}</span>
                                <span style={{ fontSize:11 }}>{t.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Players — drop targets */}
              <div style={{ background:"#0d1424", border:"1px solid #1a2540", borderRadius:14, overflow:"hidden" }}>
                <div style={{ padding:"14px 18px", borderBottom:"1px solid #1a2540", fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"#c8a951" }}>
                  👥 Players · {players.length}/8
                </div>
                <div style={{ padding:16 }}>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {players.map((p, i) => (
                      <div key={i} className="drop-zone"
                        style={{ background:"#060a10", border:"1px solid #1a2540", borderRadius:10, overflow:"hidden" }}
                        onDragOver={onDragOver}
                        onDrop={e => {
                          e.preventDefault();
                          const tname = dragTeam.current;
                          const fromIdx = dragFrom.current;
                          if (!tname) return;
                          if (fromIdx === i) return;
                          setPlayers(prev => {
                            const next = prev.map(p => ({ ...p, teams: [...p.teams] }));
                            if (fromIdx >= 0) next[fromIdx].teams = next[fromIdx].teams.filter(t => t !== tname);
                            if (!next[i].teams.includes(tname)) next[i].teams.push(tname);
                            return next;
                          });
                          dragTeam.current = null; dragFrom.current = null;
                        }}
                        onDragEnter={e => e.currentTarget.classList.add("drag-over")}
                        onDragLeave={e => e.currentTarget.classList.remove("drag-over")}
                      >
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:"#0d1424", borderBottom:"1px solid #1a2540" }}>
                          <span style={{ fontWeight:600, fontSize:14 }}>{p.name}</span>
                          <span style={{ fontSize:11, color: p.teams.length === 6 ? "#34d399" : "#4a5880" }}>
                            {p.teams.length}/6 teams
                          </span>
                        </div>
                        <div style={{ padding:"10px 14px", minHeight:44, display:"flex", flexWrap:"wrap", gap:5 }}>
                          {p.teams.length === 0 ? (
                            <span style={{ fontSize:11, color:"#2a3550", fontStyle:"italic" }}>Drop teams here...</span>
                          ) : (
                            p.teams.map(tname => {
                              const t = getTeam(tname);
                              return t ? (
                                <div key={tname} className="draggable-team" draggable onDragStart={e => onDragStart(e, i, tname)} title="Drag to move">
                                  <span style={{ fontSize:9, fontWeight:700, padding:"1px 4px", borderRadius:4, background:POT_META[t.pot].color+"22", color:POT_META[t.pot].color }}>{POT_META[t.pot].badge}</span>
                                  <span style={{ fontSize:13 }}>{t.flag}</span>
                                  <span style={{ fontSize:11 }}>{tname}</span>
                                </div>
                              ) : null;
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ── LEADERBOARD TAB ── */}
          {tab === "leaderboard" && (
            <>
              {leaderboard.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 20px", color:"#2a3550" }}>Add players in the Draw Results tab first.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {leaderboard.map((p, i) => {
                    const bc = medalColor(i);
                    const isEditingResults = editingResultsFor === p.origIdx;
                    const tiedAbove = i > 0 && leaderboard[i-1].total === p.total;
                    return (
                      <div key={p.origIdx} style={{ background:"#0d1424", border:`1px solid ${bc}`, borderRadius:14, overflow:"hidden" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderBottom:"1px solid #1a2540" }}>
                          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:900, color:bc, minWidth:36 }}>#{i+1}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:16, fontWeight:700 }}>{i===0?"👑 ":""}{p.name}</div>
                            <div style={{ fontSize:11, color:"#4a5880", marginTop:2 }}>
                              <span style={{ color:"#34d399" }}>{p.record.w}W</span>
                              {" · "}
                              <span style={{ color:"#facc15" }}>{p.record.d}D</span>
                              {" · "}
                              <span style={{ color:"#f87171" }}>{p.record.l}L</span>
                              {" combined"}
                            </div>

                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:34, fontWeight:900, color:"#c8a951" }}>{p.total}</div>
                            <div style={{ fontSize:10, color:"#4a5880", letterSpacing:1, textTransform:"uppercase" }}>total pts</div>
                          </div>
                        </div>
                        <div style={{ padding:"10px 18px 12px", display:"flex", flexWrap:"wrap", gap:5 }}>
                          {p.teams.map(tname => {
                            const t     = getTeam(tname);
                            const pts   = getTeamPts(tname);
                            const stage = getStage(tname);
                            const color = STAGE_COLOR[stage] || "#6b7a99";
                            const potColor = t ? POT_META[t.pot].color : "#fff";
                            const isOpen = openBreakdown?.pi===p.origIdx && openBreakdown?.tname===tname;
                            return t ? (
                              <div key={tname} className={`team-pill ${isOpen?"open":""}`} onClick={() => toggleBreakdown(p.origIdx, tname)}>
                                <span style={{ fontSize:9, fontWeight:700, padding:"1px 4px", borderRadius:4, background:potColor+"22", color:potColor }}>{POT_META[t.pot].badge}</span>
                                <span style={{ fontSize:13 }}>{t.flag}</span>
                                <span style={{ fontSize:11 }}>{tname}</span>
                                <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:6, background:color+"22", color }}>{stage}</span>
                                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, color:"#c8a951", fontWeight:800 }}>{pts}pt</span>
                              </div>
                            ) : null;
                          })}
                          <div className="edit-pill" onClick={() => setEditingResultsFor(isEditingResults ? null : p.origIdx)}>✏️ Edit</div>
                        </div>

                        {openBreakdown?.pi===p.origIdx && openBreakdown?.tname && renderBreakdown(openBreakdown.tname)}

                        {isEditingResults && (
                          <div style={{ background:"#060a10", borderTop:"1px solid #1a2540", padding:"14px 18px", animation:"fadeDown 0.2s ease" }}>
                            <div style={{ fontSize:11, fontWeight:600, letterSpacing:"1.5px", textTransform:"uppercase", color:"#4a5880", marginBottom:10 }}>Edit Points — {p.name}'s Teams</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                              {p.teams.map(tname => {
                                const t = getTeam(tname);
                                return t ? (
                                  <div key={tname} style={{ display:"flex", alignItems:"center", gap:10 }}>
                                    <span style={{ fontSize:16 }}>{t.flag}</span>
                                    <span style={{ flex:1, fontSize:13, fontWeight:500 }}>{tname}</span>
                                    <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, color:"#c8a951", minWidth:40, textAlign:"right" }}>{getTeamPts(tname)}pt</span>
                                    <button onClick={() => openEdit(tname)}
                                      style={{ background:"#1a2540", border:"1px solid #2a3a5a", borderRadius:6, color:"#7ec8e3", fontFamily:"'Mulish',sans-serif", fontSize:11, fontWeight:600, padding:"5px 12px", cursor:"pointer" }}>
                                      Edit
                                    </button>
                                  </div>
                                ) : null;
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── SCORING TAB ── */}
          {tab === "scoring" && (
            <>
              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, fontWeight:700, letterSpacing:2, textTransform:"uppercase", marginBottom:16 }}>⚙️ Point System</div>
              <div style={{ background:"#0d1424", border:"1px solid #c8a95133", borderRadius:12, padding:"16px 18px", marginBottom:20, fontSize:13, color:"#4a5880", lineHeight:2 }}>
                <strong style={{ color:"#e8eaf0", fontSize:14 }}>Simple rule:</strong> Every win = <strong style={{ color:"#34d399" }}>+3 pts</strong>. Every draw = <strong style={{ color:"#facc15" }}>+1 pt</strong>. Group stage or Final — a win is always +3. Win the World Cup = <strong style={{ color:"#f0c040" }}>+6 bonus</strong> on top.
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
                {[
                  ["Win any match","+ 3 pts","#34d399","Group stage or knockout — same value every time"],
                  ["Draw any match","+ 1 pt","#facc15","Group stage only — no draws in knockout rounds"],
                  ["Lose any match","0 pts","#6b7a99","No points for losing"],
                  ["Win the World Cup 🏆","+ 6 bonus","#f0c040","Added on top of all your match points"],
                ].map(([label, pts, color, note]) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:14, background:"#0d1424", border:`1px solid ${color}33`, borderRadius:10, padding:"12px 16px" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{label}</div>
                      <div style={{ fontSize:11, color:"#4a5880", marginTop:2 }}>{note}</div>
                    </div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:800, color }}>{pts}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, fontWeight:700, letterSpacing:3, textTransform:"uppercase", color:"#4a5880", marginBottom:10 }}>Tiebreaker Rules</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
                {[
                  ["1st Tiebreaker","Most Knockout Wins","#fb923c","Whoever's teams won more knockout matches"],
                  ["2nd Tiebreaker","Most Group Stage Wins","#60a5fa","Whoever's teams won more group games"],
                ].map(([label, rule, color, note]) => (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:14, background:"#0d1424", border:`1px solid ${color}33`, borderRadius:10, padding:"12px 16px" }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:600 }}>{rule}</div>
                      <div style={{ fontSize:11, color:"#4a5880", marginTop:2 }}>{note}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:8, background:color+"22", color }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Argentina 2022 example — kept as reference */}
              <div style={{ background:"#0a0e1a", border:"1px solid #c8a95133", borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:14, fontWeight:700, letterSpacing:2, color:"#c8a951", marginBottom:4, textTransform:"uppercase" }}>🏆 Example — Argentina (2022 World Cup Winners)</div>
                <div style={{ fontSize:11, color:"#4a5880", marginBottom:12 }}>How 24 points are earned from start to finish</div>
                {[
                  ["Group Stage — 2 wins, 1 loss",           "+6 pts", "#6b7a99"],
                  ["Won Round of 16 (vs Australia)",          "+3 pts", "#60a5fa"],
                  ["Won Quarter-Final (vs Netherlands)",      "+3 pts", "#a3e635"],
                  ["Won Semi-Final (vs Croatia)",             "+3 pts", "#fb923c"],
                  ["Won the Final (vs France)",               "+3 pts", "#f87171"],
                  ["Champion Bonus 🏆",                       "+6 pts", "#f0c040"],
                ].map(([label, pts, color]) => (
                  <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #141e30" }}>
                    <span style={{ fontSize:13, color }}>{label}</span>
                    <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:16, fontWeight:800, color }}>{pts}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", paddingTop:10, marginTop:4 }}>
                  <span style={{ fontSize:14, fontWeight:600, color:"#e8eaf0" }}>Total</span>
                  <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:24, fontWeight:900, color:"#c8a951" }}>24 pts</span>
                </div>
              </div>
            </>
          )}

          {/* ── TEAMS TAB ── */}
          {tab === "teams" && (
            <>
              {["pot1","pot2","pot3","pot4","pot5","pot6"].map(pot => (
                <div key={pot} style={{ marginBottom:20 }}>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:13, fontWeight:700, letterSpacing:3, textTransform:"uppercase", color:POT_META[pot].color, marginBottom:10 }}>{POT_META[pot].label}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:7 }}>
                    {WC2026_TEAMS.filter(t => t.pot===pot).map(t => (
                      <div key={t.name} style={{ background:"#0d1424", border:`1px solid ${POT_META[pot].color}33`, borderRadius:10, padding:"9px 12px", display:"flex", alignItems:"center", gap:9 }}>
                        <span style={{ fontSize:20 }}>{t.flag}</span>
                        <span style={{ fontSize:12, fontWeight:600, flex:1 }}>{t.name}</span>
                        <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:8, background:POT_META[pot].bg, color:POT_META[pot].color }}>{POT_META[pot].badge}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

        </div>
      </div>
    </>
  );
}
