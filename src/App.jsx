import { useState, useRef, useEffect } from "react";
import { saveState, listenState } from "./firebase";

// API key is handled server-side in /api/football.js

// Map football-data.org team names to our app team names
const TEAM_NAME_MAP = {
  "France":"France","Spain":"Spain","England":"England","Brazil":"Brazil",
  "Portugal":"Portugal","Netherlands":"Netherlands","Argentina":"Argentina","Germany":"Germany",
  "Norway":"Norway","Belgium":"Belgium","Senegal":"Senegal","Turkey":"Türkiye","Türkiye":"Türkiye",
  "Morocco":"Morocco","Colombia":"Colombia","Uruguay":"Uruguay","Ecuador":"Ecuador",
  "Switzerland":"Switzerland","Croatia":"Croatia","Ivory Coast":"Ivory Coast","Côte d'Ivoire":"Ivory Coast",
  "Cote d'Ivoire":"Ivory Coast","Cote dIvoire":"Ivory Coast",
  "Japan":"Japan","Sweden":"Sweden","United States":"USA","United States of America":"USA","USA":"USA",
  "Austria":"Austria","Mexico":"Mexico",
  "Algeria":"Algeria","Scotland":"Scotland","Paraguay":"Paraguay","Czechia":"Czechia","Czech Republic":"Czechia",
  "Canada":"Canada","Korea Republic":"South Korea","South Korea":"South Korea","Republic of Korea":"South Korea",
  "DR Congo":"Congo DR","Congo DR":"Congo DR","DRC":"Congo DR","Democratic Republic of the Congo":"Congo DR",
  "Australia":"Australia","Egypt":"Egypt","Uzbekistan":"Uzbekistan","Ghana":"Ghana",
  "Bosnia and Herzegovina":"Bosnia & Herz","Bosnia & Herzegovina":"Bosnia & Herz",
  "Bosnia-Herzegovina":"Bosnia & Herz","Bosnia":"Bosnia & Herz","BIH":"Bosnia & Herz",
  "Panama":"Panama","Iran":"Iran","IR Iran":"Iran","Islamic Republic of Iran":"Iran",
  "Jordan":"Jordan","Tunisia":"Tunisia",
  "New Zealand":"New Zealand","Haiti":"Haiti","Saudi Arabia":"Saudi Arabia","Iraq":"Iraq",
  "South Africa":"South Africa","Cape Verde":"Cape Verde","Cabo Verde":"Cape Verde",
  "Curaçao":"Curaçao","Curacao":"Curaçao","Qatar":"Qatar",
};

// Normalize a string for fuzzy matching — lowercase, strip accents/punctuation
function normalizeTeamName(name) {
  return (name || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]/g, ""); // strip spaces/punctuation
}

// Build a normalized lookup of our 48 team names for fallback matching
function buildNormalizedLookup(teams) {
  const lookup = {};
  teams.forEach(t => { lookup[normalizeTeamName(t.name)] = t.name; });
  return lookup;
}

function resolveTeamName(apiName, normalizedLookup) {
  if (TEAM_NAME_MAP[apiName]) return TEAM_NAME_MAP[apiName];
  const normalized = normalizeTeamName(apiName);
  if (normalizedLookup[normalized]) return normalizedLookup[normalized];
  // Try partial match — API name contains our team name or vice versa
  for (const [norm, ourName] of Object.entries(normalizedLookup)) {
    if (normalized.includes(norm) || norm.includes(normalized)) return ourName;
  }
  return apiName; // fallback — won't match any of our teams, harmless
}

async function fetchWCResults() {
  try {
    // Call our Vercel proxy — avoids CORS issues
    const endpoint = encodeURIComponent("competitions/WC/matches?status=FINISHED");
    const res = await fetch(`/api/football?endpoint=${endpoint}`);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data.matches || [];
  } catch (err) {
    console.error("API fetch error:", err);
    return null;
  }
}


// Map API round names to our stage names
const ROUND_STAGE_MAP = {
  "GROUP_STAGE":           "Groups",
  "ROUND_OF_16":           "R16",
  "QUARTER_FINALS":        "QF",
  "SEMI_FINALS":           "SF",
  "THIRD_PLACE":           "SF",
  "FINAL":                 "Final",
};

// KO points per stage (cumulative — same as app scoring)
const KO_PTS_MAP = { Groups:0, R16:3, QF:6, SF:9, Final:12, Winner:15 };

// Stage rank for comparison
const STAGE_RANK = { Groups:0, R16:1, QF:2, SF:3, Final:4, Winner:5 };

function processMatches(matches, currentTeamPoints) {
  const normalizedLookup = buildNormalizedLookup(WC2026_TEAMS);
  const teamStats   = {}; // W/D/L per team
  const teamStages  = {}; // furthest stage reached per team
  const champSet    = new Set(); // teams that won the final

  matches.forEach(match => {
    const homeRaw  = match.homeTeam?.name;
    const awayRaw  = match.awayTeam?.name;
    const home     = resolveTeamName(homeRaw, normalizedLookup);
    const away     = resolveTeamName(awayRaw, normalizedLookup);
    const hScore   = match.score?.fullTime?.home;
    const aScore   = match.score?.fullTime?.away;
    const round    = match.stage || match.matchday;
    const stage    = ROUND_STAGE_MAP[round] || "Groups";

    if (hScore === null || hScore === undefined) return;

    [home, away].forEach(t => {
      if (!teamStats[t]) teamStats[t] = { w:0, d:0, l:0 };
      // Track furthest stage reached for both teams
      if (!teamStages[t] || STAGE_RANK[stage] > STAGE_RANK[teamStages[t] || "Groups"]) {
        teamStages[t] = stage;
      }
    });

    if (hScore > aScore) {
      teamStats[home].w++; teamStats[away].l++;
      if (stage === "Final") champSet.add(home);
    } else if (hScore < aScore) {
      teamStats[away].w++; teamStats[home].l++;
      if (stage === "Final") champSet.add(away);
    } else {
      // Penalties — winner determined by penalties score
      const homePen = match.score?.penalties?.home;
      const awayPen = match.score?.penalties?.away;
      if (homePen !== null && homePen !== undefined) {
        if (homePen > awayPen) { teamStats[home].w++; teamStats[away].l++; }
        else { teamStats[away].w++; teamStats[home].l++; }
      } else {
        teamStats[home].d++; teamStats[away].d++;
      }
    }
  });

  // Build updated teamPoints
  const updated = { ...currentTeamPoints };

  Object.entries(teamStats).forEach(([team, record]) => {
    const groupPts = record.w * 3 + record.d;
    const stage    = teamStages[team] || "Groups";
    const isChamp  = champSet.has(team);
    const finalStage = isChamp ? "Winner" : stage;
    const koPts    = KO_PTS_MAP[finalStage] || 0;
    const bonus    = isChamp ? 6 : 0;
    const total    = groupPts + koPts + bonus;

    updated[team] = {
      pts:   total,
      stage: finalStage,
      champ: isChamp,
      w:     record.w,
      d:     record.d,
      l:     record.l,
    };
  });

  return updated;
}

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

// Flag color theme per Pot 1 nation -- used to tint each player's leaderboard card
const POT1_FLAG_COLORS = {
  France:        ["#274690", "#cc3333"],
  Spain:         ["#c8a951", "#a32d2d"],
  England:       ["#a32d2d", "#e8eaf0"],
  Brazil:        ["#1d9e75", "#facc15"],
  Portugal:      ["#1d9e75", "#a32d2d"],
  Netherlands:   ["#e8602a", "#274690"],
  Argentina:     ["#7ec8e3", "#facc15"],
  Germany:       ["#2a2a2a", "#facc15"],
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
  { name:"Chan", teams:[] },
  { name:"Teon",      teams:[] },
  { name:"Beto",      teams:[] },
  { name:"Bird",      teams:[] },
  { name:"Luis",      teams:[] },
  { name:"Roger",     teams:[] },
  { name:"Dro",       teams:[] },
  { name:"Pancho",    teams:[] },
];

const TAB_DESCRIPTIONS = {
  leaderboard: "Live standings with automatic tiebreakers. Tap any team to edit their points.",
  scoring:     "How points are calculated. Admin sync button at the bottom.",
  teams:       "All 48 teams across 6 pots, ranked by ESPN pre-tournament ratings.",
  draw:        "See who drew which teams. Drag and drop team badges to swap teams between players.",
};

export default function App() {
  const [tab, setTab]                 = useState("leaderboard");
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
  const [syncing, setSyncing]     = useState(false);

  // ── DRAW REVEAL STATE ─────────────────────────────────────────────────────
  const [drawMode, setDrawMode]         = useState("setup"); // setup | reveal | done
  const [drawAssignments, setDrawAssignments] = useState({}); // { "France": "Chan", ... }
  const [revealedCards, setRevealedCards]     = useState(new Set());
  const [currentPot, setCurrentPot]           = useState(0); // 0-5
  const [flippingCard, setFlippingCard]       = useState(null);

  const POTS_ORDER = ["pot6","pot5","pot4","pot3","pot2","pot1"]; // Revealed in reverse — builds tension

  const [cardOrder, setCardOrder] = useState({});  // { pot: [teamName, ...] } shuffled display order
  const [pot1CardIndex, setPot1CardIndex] = useState(0);

  const [locked, setLocked] = useState(false); // witness confirms before reveal starts



  function shuffleArr(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const randomizeDraw = () => {
    const playerNames = players.map(p => p.name);
    const newAssignments = {};
    const newCardOrder = {};

    POTS_ORDER.forEach(pot => {
      const potTeams = [...WC2026_TEAMS.filter(t => t.pot === pot)];
      // Shuffle for assignments
      const shuffledForAssign = shuffleArr(potTeams);
      const shuffledPlayers = shuffleArr([...playerNames]);
      shuffledForAssign.forEach((team, idx) => {
        newAssignments[team.name] = shuffledPlayers[idx];
      });
      // Separately shuffle card display order so positions are also random
      newCardOrder[pot] = shuffleArr(potTeams).map(t => t.name);
    });

    setDrawAssignments(newAssignments);
    setCardOrder(newCardOrder);
    setRevealedCards(new Set());
    setCurrentPot(0);
    setLocked(false);
    setPot1CardIndex(0);
    setDrawMode("reveal");
  };

  const resetDraw = () => {
    setDrawAssignments({});
    setRevealedCards(new Set());
    setCurrentPot(0);
    setPot1CardIndex(0);
    setDrawMode("setup");
  };

  const flipCard = (teamName) => {
    if (flippingCard || revealedCards.has(teamName)) return;
    setFlippingCard(teamName);
    setTimeout(() => {
      setRevealedCards(prev => new Set([...prev, teamName]));
      setFlippingCard(null);
    }, 250);
  };

  const finalizeDraw = () => {
    // Apply draw assignments to players state
    const newPlayers = players.map(p => ({ ...p, teams: [] }));
    Object.entries(drawAssignments).forEach(([teamName, playerName]) => {
      const idx = newPlayers.findIndex(p => p.name === playerName);
      if (idx >= 0) newPlayers[idx].teams.push(teamName);
    });
    setPlayers(newPlayers);
    setDrawMode("done");
  };

  const currentPotTeams = drawMode === "reveal"
    ? (() => {
        const pot = POTS_ORDER[currentPot];
        const order = cardOrder[pot];
        if (order) return order.map(name => WC2026_TEAMS.find(t => t.name === name)).filter(Boolean);
        return WC2026_TEAMS.filter(t => t.pot === pot);
      })()
    : [];
  const currentPotAllRevealed = currentPotTeams.length > 0 &&
    currentPotTeams.every(t => revealedCards.has(t.name));
  const [syncMsg, setSyncMsg]     = useState("");


  const syncResults = async () => {
    setSyncing(true);
    setSyncMsg("Fetching latest results...");
    const matches = await fetchWCResults();
    if (!matches) {
      setSyncMsg("❌ API unavailable — update manually");
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 4000);
      return;
    }
    if (matches.length === 0) {
      setSyncMsg("No finished matches yet");
      setSyncing(false);
      setTimeout(() => setSyncMsg(""), 3000);
      return;
    }
    const updated = processMatches(matches, teamPoints);
    // Count how many of our 48 teams were actually found in the results
    const ourTeams = WC2026_TEAMS.map(t => t.name);
    const updatedTeams = ourTeams.filter(name => updated[name]?.pts > 0 || updated[name]?.w > 0);
    setTeamPoints(updated);
    setSyncMsg(`✅ ${matches.length} matches · ${updatedTeams.length} teams updated`);
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 4000);
  };
  const [editingResultsFor, setEditingResultsFor] = useState(null);
  const dragTeam = useRef(null);
  const dragFrom = useRef(null);

  // ── FIREBASE SYNC ──────────────────────────────────────────────────────────
  const loaded = useRef(false);

  useEffect(() => {
    try {
      listenState((data) => {
        try {
          if (!data) return; // null/empty — skip

          // Only update players if Firebase has valid non-empty player data
          if (data.players && Array.isArray(data.players) && data.players.length === 8) {
            const safePlayers = data.players.map(p => ({
              name: p.name || "",
              teams: Array.isArray(p.teams) ? p.teams.filter(t => typeof t === "string") : [],
            }));
            setPlayers(safePlayers);
          }

          // Only update teamPoints if it's a real object with keys
          if (data.teamPoints && typeof data.teamPoints === "object" && Object.keys(data.teamPoints).length > 0) {
            setTeamPoints(prev => ({ ...prev, ...data.teamPoints }));
          }

          loaded.current = true;
        } catch (err) {
          console.error("Firebase data parse error:", err);
        }
      });
    } catch (err) {
      console.error("Firebase listener error:", err);
    }
  }, []);

  // Save to Firebase only after first load, with a small debounce
  const isFirstRender = useRef(true);
  const saveTimer = useRef(null);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    // Debounce saves by 500ms to avoid rapid fire writes
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        saveState(players, teamPoints);
      } catch (err) {
        console.error("Firebase save error:", err);
      }
    }, 500);
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

  // Find a player's Pot 1 team and its flag color theme
  const getPlayerPot1 = (p) => {
    const pot1Name = p.teams.find(tname => getTeam(tname)?.pot === "pot1");
    if (!pot1Name) return null;
    return { team: getTeam(pot1Name), colors: POT1_FLAG_COLORS[pot1Name] || ["#c8a951","#1a2540"] };
  };

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
    body { font-family:'Mulish',sans-serif; background:#080c14; color:#e8eaf0; min-height:100vh; cursor:default; }
    div, span, p { cursor:default; }
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
    { id:"leaderboard", label:"🏆 Leaderboard"  },
    { id:"scoring",     label:"⚙️ Scoring"      },
    { id:"teams",       label:"🌍 Nations"       },
    { id:"draw",        label:"🎲 Draw Results" },
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
            <div>

              {/* SETUP */}
              {drawMode === "setup" && (
                <div style={{ textAlign:"center", maxWidth:480, margin:"0 auto", paddingTop:20 }}>
                  <div style={{ fontSize:64, marginBottom:16 }}>🎱</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:900, letterSpacing:3, color:"#e8eaf0", marginBottom:10 }}>DRAW NIGHT</div>
                  <div style={{ fontSize:13, color:"#4a5880", lineHeight:1.8, marginBottom:16 }}>
                    48 teams · 8 players · 6 pots. Hit Begin Draw to randomize and start the reveal from Pot 6.
                  </div>
                  <div style={{ background:"#0d1424", border:"1px solid #1a2540", borderRadius:12, padding:"12px 16px", marginBottom:28, fontSize:12, color:"#6b7a99" }}>
                    <strong style={{ color:"#c8a951" }}>Players: </strong>{players.map(p => p.name).join(" · ")}
                  </div>
                  <button onClick={randomizeDraw}
                    style={{ background:"linear-gradient(135deg,#c8a951,#e8c96a)", border:"none", borderRadius:12, color:"#080c14", fontFamily:"'Barlow Condensed',sans-serif", fontSize:22, fontWeight:900, letterSpacing:3, padding:"16px 48px", cursor:"pointer", boxShadow:"0 8px 32px rgba(200,169,81,0.4)", width:"100%" }}>
                    🎲 BEGIN DRAW
                  </button>
                </div>
              )}

              {/* REVEAL */}
              {drawMode === "reveal" && (() => {
                const pot = POTS_ORDER[currentPot];
                const potColor = POT_META[pot].color;
                const allRevealed = currentPotTeams.every(t => revealedCards.has(t.name));
                const isLastPot = currentPot === POTS_ORDER.length - 1;

                const reshufflePot = () => {
                  // Re-randomize just this pot's assignments
                  const potTeams = WC2026_TEAMS.filter(t => t.pot === pot);
                  const playerNames = players.map(p => p.name);
                  const shuffledPlayers = [...playerNames].sort(() => Math.random() - 0.5);
                  const newAssignments = { ...drawAssignments };
                  const newOrder = [...potTeams].sort(() => Math.random() - 0.5);
                  newOrder.forEach((team, i) => { newAssignments[team.name] = shuffledPlayers[i]; });
                  setDrawAssignments(newAssignments);
                  // Reset revealed for this pot
                  const newRevealed = new Set(revealedCards);
                  potTeams.forEach(t => newRevealed.delete(t.name));
                  setRevealedCards(newRevealed);
                  // Reshuffle card order
                  setCardOrder(prev => ({ ...prev, [pot]: [...potTeams].sort(() => Math.random() - 0.5).map(t => t.name) }));
                  if (pot === "pot1") { setPot1CardIndex(0); setPot1Flipped(false); }
                };

                return (
                  <div>
                    {/* Pot nav pills */}
                    <div style={{ display:"flex", gap:6, marginBottom:14, flexWrap:"wrap" }}>
                      {POTS_ORDER.map((p, idx) => {
                        const teams = WC2026_TEAMS.filter(t => t.pot === p);
                        const done = teams.every(t => revealedCards.has(t.name));
                        const active = idx === currentPot;
                        return (
                          <button key={p} onClick={() => setCurrentPot(idx)}
                            style={{ padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer",
                              background: done ? POT_META[p].color+"22" : active ? "#1a2540" : "#060a10",
                              border:`1px solid ${active ? POT_META[p].color : done ? POT_META[p].color+"44" : "#1a2540"}`,
                              color: done ? POT_META[p].color : active ? POT_META[p].color : "#2a3550" }}>
                            {done ? "✓ " : ""}{POT_META[p].label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Pot header with re-randomize */}
                    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", background:"#0d1424", border:`1px solid ${potColor}44`, borderRadius:10, marginBottom:16 }}>
                      <div style={{ flex:1, fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:800, color:potColor, letterSpacing:1 }}>
                        {POT_META[pot].label} — Tap cards to reveal
                      </div>
                      <div style={{ fontSize:11, color:"#4a5880" }}>{currentPotTeams.filter(t => revealedCards.has(t.name)).length}/{currentPotTeams.length}</div>
                      <button onClick={reshufflePot}
                        style={{ background:"none", border:"1px solid #2a3550", borderRadius:8, color:"#4a5880", fontFamily:"'Mulish',sans-serif", fontSize:11, fontWeight:600, padding:"5px 12px", cursor:"pointer", whiteSpace:"nowrap" }}>
                        ↺ Re-randomize
                      </button>
                    </div>

                    {/* Pot 1 — big single card reveal one by one */}
                    {pot === "pot1" ? (() => {
                      const [pot1Idx, setPot1Idx] = [pot1CardIndex, setPot1CardIndex];
                      const teamName = currentPotTeams[pot1Idx]?.name;
                      const team = currentPotTeams[pot1Idx];
                      const playerName = drawAssignments[teamName];
                      const isFlipping = flippingCard === teamName;
                      const isRevealed = revealedCards.has(teamName);
                      const isLast = pot1Idx === 7;

                      return (
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", marginBottom:20 }}>
                          {/* Progress dots */}
                          <div style={{ display:"flex", gap:6, marginBottom:14 }}>
                            {currentPotTeams.map((t, idx) => (
                              <div key={t.name} style={{ width: idx === pot1Idx ? 24 : 8, height:8, borderRadius:4, transition:"width 0.3s",
                                background: revealedCards.has(t.name) ? potColor+"88" : idx === pot1Idx ? potColor : "#1a2540" }} />
                            ))}
                          </div>

                          {/* Big card */}
                          <div style={{ width:"100%", maxWidth:300, marginBottom:16 }}
                            onClick={() => {
                              if (isRevealed) {
                                // Advance to next
                                if (!isLast) setPot1CardIndex(i => i + 1);
                              } else {
                                flipCard(teamName);
                              }
                            }}
                            style={{ cursor:"pointer", width:"100%", maxWidth:300, marginBottom:16 }}>
                            <div style={{ position:"relative", height:200, transformStyle:"preserve-3d",
                              transition: isFlipping ? "transform 0.25s ease-in" : isRevealed ? "transform 0.25s ease-out" : "none",
                              transform: isRevealed ? "rotateY(180deg)" : "rotateY(0deg)" }}>
                              {/* Face — player name */}
                              <div style={{ position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
                                background:"linear-gradient(135deg,#0d1424,#1a2540)", border:`2px solid ${potColor}55`, borderRadius:18,
                                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10 }}>
                                <div style={{ fontSize:10, fontWeight:700, color:potColor, letterSpacing:2, padding:"2px 10px", borderRadius:20, background:potColor+"22" }}>P1</div>
                                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:900, color:"#e8eaf0", letterSpacing:1 }}>{playerName}</div>
                                <div style={{ fontSize:11, color:"#2a3550" }}>Tap to reveal nation</div>
                              </div>
                              {/* Back — country */}
                              <div style={{ position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
                                transform:"rotateY(180deg)",
                                background:`linear-gradient(135deg,${potColor}20,${potColor}08)`, border:`2px solid ${potColor}`, borderRadius:18,
                                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10,
                                boxShadow:`0 0 50px ${potColor}33` }}>
                                <div style={{ fontSize:64 }}>{team?.flag}</div>
                                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:26, fontWeight:900, color:"#e8eaf0" }}>{teamName}</div>
                                <div style={{ fontSize:12, fontWeight:600, color:potColor, padding:"3px 12px", borderRadius:20, background:potColor+"22" }}>
                                  {playerName} draws {teamName}!
                                </div>
                                {!isLast && <div style={{ fontSize:10, color:"#4a5880" }}>Tap to continue →</div>}
                              </div>
                            </div>
                          </div>

                          {/* Already revealed list */}
                          {pot1Idx > 0 && (
                            <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center", maxWidth:500 }}>
                              {currentPotTeams.slice(0, pot1Idx).filter(t => revealedCards.has(t.name)).map(t => (
                                <div key={t.name} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:600, background:potColor+"15", border:`1px solid ${potColor}33`, color:potColor }}>
                                  {t.flag} {t.name} → <strong>{drawAssignments[t.name]}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                    /* Pots 2-6 — 4x2 grid */
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                      {currentPotTeams.map(team => {
                        const isRevealed = revealedCards.has(team.name);
                        const isFlipping = flippingCard === team.name;
                        const playerName = drawAssignments[team.name];
                        return (
                          <div key={team.name} onClick={() => flipCard(team.name)}
                            style={{ cursor: isRevealed ? "default" : "pointer" }}>
                            <div style={{ position:"relative", height:115, transformStyle:"preserve-3d",
                              transition: isFlipping ? "transform 0.25s ease-in" : isRevealed ? "transform 0.25s ease-out" : "none",
                              transform: isRevealed ? "rotateY(180deg)" : "rotateY(0deg)" }}>
                              <div style={{ position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
                                background:"linear-gradient(135deg,#0d1424,#1a2540)", border:`1px solid ${potColor}44`, borderRadius:12,
                                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6 }}>
                                <div style={{ fontSize:10, fontWeight:700, color:potColor, letterSpacing:2 }}>{POT_META[team.pot].badge}</div>
                                <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, fontWeight:900, color:"#e8eaf0" }}>{playerName}</div>
                                <div style={{ fontSize:9, color:"#2a3550" }}>Tap to reveal</div>
                              </div>
                              <div style={{ position:"absolute", inset:0, backfaceVisibility:"hidden", WebkitBackfaceVisibility:"hidden",
                                transform:"rotateY(180deg)",
                                background:`linear-gradient(135deg,${potColor}18,${potColor}05)`, border:`1px solid ${potColor}66`, borderRadius:12,
                                display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:5 }}>
                                <div style={{ fontSize:30 }}>{team.flag}</div>
                                <div style={{ fontSize:12, fontWeight:700, color:"#e8eaf0", textAlign:"center" }}>{team.name}</div>
                                <div style={{ fontSize:10, fontWeight:600, color:potColor }}>{playerName}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    )}

                    {/* Next pot button */}
                    {allRevealed && !isLastPot && (
                      <div style={{ textAlign:"center" }}>
                        <button onClick={() => setCurrentPot(p => p + 1)}
                          style={{ background:"linear-gradient(135deg,#c8a951,#e8c96a)", border:"none", borderRadius:12, color:"#080c14", fontFamily:"'Barlow Condensed',sans-serif", fontSize:18, fontWeight:900, letterSpacing:2, padding:"12px 36px", cursor:"pointer", boxShadow:"0 4px 20px rgba(200,169,81,0.3)" }}>
                          NEXT → {POT_META[POTS_ORDER[currentPot + 1]]?.label}
                        </button>
                      </div>
                    )}

                    {/* Lock In — only after ALL pots done */}
                    {isLastPot && allRevealed && (
                      <div style={{ textAlign:"center" }}>
                        <button onClick={finalizeDraw}
                          style={{ background:"linear-gradient(135deg,#c8a951,#e8c96a)", border:"none", borderRadius:12, color:"#080c14", fontFamily:"'Barlow Condensed',sans-serif", fontSize:20, fontWeight:900, letterSpacing:2, padding:"14px 40px", cursor:"pointer", boxShadow:"0 6px 24px rgba(200,169,81,0.4)" }}>
                          🔒 LOCK IN THE DRAW
                        </button>

                      </div>
                    )}
                  </div>
                );
              })()}

              {/* DONE */}
              {drawMode === "done" && (
                <div>
                  <div style={{ textAlign:"center", marginBottom:24 }}>
                    <div style={{ fontSize:48, marginBottom:8 }}>🏆</div>
                    <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:28, fontWeight:900, color:"#c8a951", letterSpacing:2 }}>DRAW COMPLETE</div>
                    <div style={{ fontSize:12, color:"#4a5880", marginTop:4 }}>Saved to Firebase · Everyone can see their teams</div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {players.map((p, i) => (
                      <div key={i} style={{ background:"#0d1424", border:"1px solid #1a2540", borderRadius:12, overflow:"hidden" }}>
                        <div style={{ padding:"10px 16px", borderBottom:"1px solid #1a2540", background:"#0a0f1c", fontWeight:700, fontSize:14 }}>{p.name}</div>
                        <div style={{ padding:"10px 16px", display:"flex", flexWrap:"wrap", gap:6 }}>
                          {p.teams.map(tname => {
                            const t = getTeam(tname);
                            return t ? (
                              <span key={tname} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, fontSize:12, fontWeight:500, background:POT_META[t.pot].color+"15", border:`1px solid ${POT_META[t.pot].color}44`, color:POT_META[t.pot].color }}>
                                <span style={{ fontSize:9 }}>{POT_META[t.pot].badge}</span>
                                {t.flag} {tname}
                              </span>
                            ) : null;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ── LEADERBOARD TAB ── */}
          {tab === "leaderboard" && (
            <>
              {/* Prize Pool */}
              <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                <div style={{ flex:1, background:"linear-gradient(135deg,#c8a95122,#c8a95108)", border:"1px solid #c8a95155", borderRadius:12, padding:"14px 18px", textAlign:"center" }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"#c8a951", marginBottom:4 }}>🥇 Winner</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:900, color:"#c8a951" }}>$140</div>
                </div>
                <div style={{ flex:1, background:"linear-gradient(135deg,#9ca3af22,#9ca3af08)", border:"1px solid #9ca3af55", borderRadius:12, padding:"14px 18px", textAlign:"center" }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase", color:"#9ca3af", marginBottom:4 }}>🥈 Runner-Up</div>
                  <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:36, fontWeight:900, color:"#9ca3af" }}>$20</div>
                </div>
              </div>

              {leaderboard.length === 0 ? (
                <div style={{ textAlign:"center", padding:"60px 20px", color:"#2a3550" }}>Add players in the Draw Results tab first.</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                  {leaderboard.map((p, i) => {
                    const bc = medalColor(i);
                    const isEditingResults = editingResultsFor === p.origIdx;
                    const tiedAbove = i > 0 && leaderboard[i-1].total === p.total;
                    const pot1Info = getPlayerPot1(p);
                    const flagColors = pot1Info?.colors || ["#1a2540","#0d1424"];
                    const isFirst = i === 0;
                    const isSecond = i === 1;
                    const borderWidth = isFirst ? 3 : isSecond ? 2 : 1;
                    const borderColor = isFirst ? "#f0c040" : isSecond ? "#c0c4cc" : "#1a2540";
                    const cardBg = `linear-gradient(135deg, ${flagColors[0]}26, ${flagColors[1]}1a, #0d1424 70%)`;
                    return (
                      <div key={p.origIdx} style={{
                        background: cardBg,
                        border:`${borderWidth}px solid ${borderColor}`,
                        borderRadius:14, overflow:"hidden",
                        boxShadow: isFirst ? "0 0 24px rgba(240,192,64,0.25)" : isSecond ? "0 0 16px rgba(192,196,204,0.15)" : "none",
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderBottom:"1px solid rgba(255,255,255,0.08)" }}>
                          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontSize:30, fontWeight:900, color:bc, minWidth:36 }}>#{i+1}</span>
                          <span style={{ fontSize:30, lineHeight:1 }}>{pot1Info?.team?.flag || "🏳️"}</span>
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
              <div style={{ background:"#0a0e1a", border:"1px solid #c8a95133", borderRadius:12, padding:"16px 18px", marginBottom:24 }}>
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

              {/* Admin Only — Sync Results */}
              <div style={{ marginTop:32, borderTop:"1px solid #1a2540", paddingTop:24 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                  <div style={{ fontSize:10, fontWeight:700, letterSpacing:2, textTransform:"uppercase", padding:"3px 10px", borderRadius:20, background:"#f8717122", border:"1px solid #f8717155", color:"#f87171" }}>
                    🔒 Admin Only
                  </div>
                  <div style={{ fontSize:11, color:"#2a3550" }}>Do not touch unless you are Chan</div>
                </div>
                <div style={{ background:"#0a0608", border:"1px solid #f8717133", borderRadius:12, padding:"16px 18px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#e8eaf0" }}>Sync Live Results</div>
                    <div style={{ fontSize:11, color:"#4a5880", marginTop:2 }}>
                      {syncMsg || "Pull latest World Cup match results from football-data.org and update everyone's scores automatically."}
                    </div>
                  </div>
                  <button onClick={syncResults} disabled={syncing}
                    style={{ background: syncing ? "#1a2540" : "linear-gradient(135deg,#c8a951,#e8c96a)", border:"none", borderRadius:8, color: syncing ? "#4a5880" : "#080c14", fontFamily:"'Barlow Condensed',sans-serif", fontSize:15, fontWeight:800, letterSpacing:1, padding:"12px 24px", cursor: syncing ? "not-allowed" : "pointer", whiteSpace:"nowrap", boxShadow: syncing ? "none" : "0 4px 16px rgba(200,169,81,0.3)" }}>
                    {syncing ? "⏳ Syncing..." : "🔄 Sync Results"}
                  </button>
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
