import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const TASKS = ["Decode the transmission", "Identify the antidote", "Unlock the control panel", "Trace the ventilation route", "Enter the release code"];
const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = id => document.getElementById(id);
const screens = ["landing","playerApp"];
let currentTeam = null, game = {}, tickHandle = null;
function show(id){ screens.forEach(x => $(x).classList.toggle("hidden", x !== id)); }
function toast(message){ $("toast").textContent=message; $("toast").classList.remove("hidden"); setTimeout(()=>$("toast").classList.add("hidden"),3500); }
function cleanTeamName(s){ return s.trim().replace(/\s+/g," "); }

$("hostageNav").onclick=()=>switchTab("hostage"); $("missionsNav").onclick=()=>switchTab("missions");
function switchTab(name){ $("hostageTab").classList.toggle("hidden",name!=="hostage"); $("missionsTab").classList.toggle("hidden",name!=="missions"); $("hostageNav").classList.toggle("active",name==="hostage"); $("missionsNav").classList.toggle("active",name==="missions"); }

$("registerBtn").onclick=async()=>{
  const teamName=cleanTeamName($("teamName").value); if(!teamName) return toast("Enter a team name.");
  try { const cred=auth.currentUser?.isAnonymous ? {user:auth.currentUser} : await signInAnonymously(auth); const ref=doc(db,"teams",cred.user.uid); const snap=await getDoc(ref);
    if(!snap.exists()) await setDoc(ref,{name:teamName,ownerUid:cred.user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),submissions:{},solved:{}});
    currentTeam=(await getDoc(ref)).data(); openPlayer(cred.user.uid);
  } catch(e){ toast(friendly(e)); }
};

function startClock(){ clearInterval(tickHandle); updateClock(); tickHandle=setInterval(updateClock,1000); }
function secondsLeft(){if(game.status!=="running"||!game.startedAt)return game.durationSeconds||3600; return Math.max(0,(game.durationSeconds||3600)-Math.floor((Date.now()-game.startedAt.toMillis())/1000));}
function updateClock(){const running=game.status==="running";const left=secondsLeft(),m=String(Math.floor(left/60)).padStart(2,"0"),s=String(left%60).padStart(2,"0");$("playerTimer").textContent=`${m}:${s}`;$("gasBar").style.width=running?`${100-(left/3600*100)}%`:"0%";$("waitingOverlay").classList.toggle("hidden",running);$("gasStatus").textContent=running?(left?"RISING":"CRITICAL"):"STANDBY";const video=$("hostageVideo");if(running){video.play().catch(()=>{});}else{video.pause();video.currentTime=0;}}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function friendly(e){console.error(e);return e.message?.replace("Firebase: ","")||"Something went wrong.";}
onAuthStateChanged(auth,async user=>{if(!user)return; if(user.isAnonymous){const s=await getDoc(doc(db,"teams",user.uid));if(s.exists()){currentTeam=s.data();openPlayer(user.uid);}}});
