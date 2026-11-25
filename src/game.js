/* MIWORU by Wenn & Aber Bike Crew - © 2026 Lars Kröger. Alle Rechte vorbehalten. Kopie, Weitergabe und Weiterverwendung ohne schriftliche Genehmigung untersagt. */
// MIWORU by Wenn & Aber Bike Crew – Spielcode (Stand Prototyp 0.6).
// Noch eine einzige Datei; wird schrittweise in Module aufgeteilt (Strecke, Gelände, Vegetation, Figuren, HUD).
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import './style.css';
import { makeVan } from './van.js';
import { makeGroup, GROUP_COLORS } from './group.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Trainer, ClickPad, HeartRate, BLE_OK } from './ble.js';
import { Rec, downloadTCX } from './strava.js';
import { AUDIO } from './audio.js';
import MITT1 from './routes/mittwochsrunde.json';
import MIW from './routes/miworu.json';
import BUE from './routes/buellberg.json';
import WUP2 from './routes/wuppertal2.json';
import ISE from './routes/iserlohn.json';
import HEM from './routes/hemer.json';
import HAG from './routes/hagen.json';
import DOR from './routes/dortmund.json';
import ALP from './routes/alpen.json';
import IBE from './routes/ibenstein.json';
import DEI from './routes/deikamm.json';
import { LOCKED, hasPass, checkPass, redeem, payConfig, loadPayPal, payCreate, payCapture } from './unlock.js';
const SURF_FILES=import.meta.glob('./routes/*.surf.json');   // Streckendaten werden pro Strecke nachgeladen (nicht mehr alle im Startpaket)
// Strecke: Standard ist die Tour vom 5.10.2022 (komoot-GPX); ?route=mittwoch bzw. ?route=halde nur zum Entwickeln
const ROUTES={mittwoch:{data:MITT1,label:'Mittwochsrunde',surf:'mittwochsrunde',btn:'Mittwochsrunde'},tour2:{data:MIW,label:'MIWORU',surf:'miworu',btn:'MIWORU',nhn0:MIW.nhn0,place:'Bergkamen',dem:'miworu'},wuppertal2:{data:WUP2,label:'Whopperthal',surf:'wuppertal2',btn:'Whopperthal',nhn0:WUP2.nhn0,place:'Whopperthal',dem:'wuppertal'},hagen:{data:HAG,label:'Hagmoor',surf:'hagen',btn:'Hagmoor',nhn0:HAG.nhn0,place:'Hagmoor',dem:'hagen'},iserlohn:{data:ISE,label:'Isehorst',surf:'iserlohn',btn:'Isehorst',nhn0:ISE.nhn0,place:'Isehorst',dem:'iserlohn'},ibenstein:{data:IBE,label:'Bad Ibenstein',surf:'ibenstein',btn:'Bad Ibenstein',nhn0:IBE.nhn0,place:'Bad Ibenstein',dem:'ibenstein'},deikamm:{data:DEI,label:'Deikamm',surf:'deikamm',btn:'Deikamm',nhn0:DEI.nhn0,place:'Deikamm',dem:'deikamm'},hemer:{data:HEM,label:'Hemstein',surf:'hemer',btn:'Hemstein',nhn0:HEM.nhn0,place:'Hemstein',dem:'hemer'},buellberg:{data:BUE,label:'Bölkamp',surf:'buellberg',btn:'Bölkamp',nhn0:BUE.nhn0,place:'Bölkamp',dem:'buellberg'},dortmund:{data:DOR,label:'Dorbach',surf:'dortmund',btn:'Dorbach',nhn0:DOR.nhn0,place:'Dorbach',dem:'dortmund'},alpen:{data:ALP,label:'Sölden',surf:'alpen',btn:'Sölden',nhn0:ALP.nhn0,place:'Sölden',dem:'alpen',alp:true}};
let RKEY=new URLSearchParams(location.search).get('route');
let PAYWALL=null;   // gewuenschte, noch gesperrte Strecke: es startet MIWORU und das Freischalt-Fenster oeffnet sich
if(LOCKED.indexOf(RKEY)>=0&&!(await checkPass())){PAYWALL=RKEY;RKEY=null;}
const GPX_ID=null,CUSTOM=null;   // eigene GPX-Strecken gibt es nicht mehr
const RT=RKEY==='halde'?null:(ROUTES[RKEY]||ROUTES.tour2);   // Standard: die Tour vom 5.10.2022; andere Strecken nur noch per URL (?route=halde|mittwoch) für Entwicklung
const ROUTE=!!RT,MITT=RT?RT.data:MITT1;
const WILD=(['tour2','mittwoch','halde','dortmund','hagen'].indexOf(RKEY)>=0||RKEY==null)?'root':RKEY==='hemer'?'stone':'mix';   // Charakter der Abfahrten: Wurzelstrecke (Halde, Dortmund, Hagen), Steinstrecke (Hemer), sonst gemischt
const W_ROOT=WILD==='root'?1.8:WILD==='stone'?0.85:1.15,W_STONE=WILD==='root'?0.4:WILD==='stone'?1.6:1;
const MW=!!RT&&!RT.custom&&!!RT.dem;   // feste Strecken mit Geländedaten: Feinschliff (Unterwuchs, Wegzustand, Fassaden, Autos, Nightride, Nachbearbeitung)
// Echtes Geländemodell (DGM1 NRW, per npm run terrain erzeugt): Höhenraster in Dezimetern
const TERR=[];   // Gelaendekacheln (fuer die Bodenhoehe der Autos)
const BOOT=(t,p)=>{const m=document.getElementById('bootmsg'),b=document.querySelector('#bootbar i');if(m)m.textContent=t;if(b&&p!==undefined)b.style.width=p+'%';return new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));};
await BOOT('Lade Streckendaten …',5);
const GEL_F=import.meta.glob('./routes/*gelaende.json'),OSM_F=import.meta.glob('./routes/*umgebung.json'),LOD2_F=import.meta.glob('./routes/*.lod2.json'),CAN_F=import.meta.glob('./routes/*.canopy.json'),R1_F=import.meta.glob('./routes/*.dgm1.json'),STR_F=import.meta.glob('./routes/*.strassen.json'),OBJ_F=import.meta.glob('./routes/*.objekte.json'),LIF_F=import.meta.glob('./routes/*.lifte.json'),FERN_F=import.meta.glob('./routes/*.fern.json'),DOP_J=import.meta.glob('./routes/*.dop.json'),DOP_I=import.meta.glob('./routes/*.dop-*.jpg',{eager:true,query:'?url',import:'default'});
const DATA_KEY=(F,_,ext)=>Object.keys(F).find(k=>k.split('/').pop()===((RT&&RT.dem)?RT.dem+'.'+ext:ext));   // Standard: gelaende.json / umgebung.json; eigene Strecken: <name>.gelaende.json / <name>.umgebung.json
const LZ=async(F,ext)=>{const k=DATA_KEY(F,0,ext);if(!k)return null;const m=await F[k]();return m.default||m;};
const _OK=!!RT&&!RT.custom;
const [GEL_RAW,OSM_RAW,LOD2_RAW,CAN_RAW,R1_RAW,OBJ_RAW,DOP_RAW,SURF_RAW,STR_RAW]=await Promise.all([LZ(GEL_F,'gelaende.json'),_OK?LZ(OSM_F,'umgebung.json'):null,_OK?LZ(LOD2_F,'lod2.json'):null,_OK?LZ(CAN_F,'canopy.json'):null,_OK?LZ(R1_F,'dgm1.json'):null,_OK?LZ(OBJ_F,'objekte.json'):null,_OK?LZ(DOP_J,'dop.json'):null,
  (async()=>{if(!RT)return null;const ov=Object.keys(SURF_FILES).find(k=>k.indexOf('/'+RT.surf+'.surf')>=0);if(!ov)return null;const m=await SURF_FILES[ov]();return m.default||m;})(),_OK?LZ(STR_F,'strassen.json'):null]);
const FERN_RAW=(_OK&&RT.alp)?await LZ(FERN_F,'fern.json'):null;   // grobes Fernmodell fuers Bergpanorama
let LIFTS=(_OK?await LZ(LIF_F,'lifte.json'):null)||[];   // Liftfahrten (Index-Bereiche im 2-m-Raster): werden uebersprungen
const GEL=(()=>{
  if(!GEL_RAW)return null;
  const g=GEL_RAW,bin=atob(g.dm),u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return {g:g,h:new Int16Array(u.buffer)};
})();
const CUS=!!RT&&!!RT.custom;   // eigene Strecke: ohne Höhenmodell und ohne OSM-Daten
const useDem=ROUTE&&!!GEL&&!CUS;
function demH(x,z){
  const g=GEL.g,u=Math.max(0,Math.min(g.nx-1.001,(x-g.x0)/g.cell)),v=Math.max(0,Math.min(g.nz-1.001,(z-g.z0)/g.cell));
  const i=Math.floor(u),j=Math.floor(v),fu=u-i,fv=v-j,H=GEL.h,o=j*g.nx+i;
  return ((H[o]*(1-fu)+H[o+1]*fu)*(1-fv)+(H[o+g.nx]*(1-fu)+H[o+g.nx+1]*fu)*fv)/10;
}

// ================= Helfer =================
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const airU=()=>SHK.air?SHK.air.t/SHK.air.T:0,airH=()=>SHK.air?SHK.air.H*4*airU()*(1-airU()):0;
const TABS=[];   // Tables (Sprunghuegel): s0 = Beginn der Anfahrtsrampe, H = Hoehe; Profil: Rampe 3,2 m, Plateau 2,4 m, Landung 3,6 m
const smoothS=u=>u*u*(3-2*u),tabH=s=>{for(let i=0;i<TABS.length;i++){const t=TABS[i],u=s-t.s0;if(u<0)return 0;if(u>t.L)continue;if(t.K)return u<3.2?t.H*smoothS(u/3.2):t.H*(1-smoothS((u-3.2)/0.6));return u<3.6?t.H*smoothS(u/3.6):u<6.0?t.H:t.H*(1-smoothS((u-6.0)/4.2));}return 0;};
const tabD=s=>(tabH(s+0.4)-tabH(s-0.4))/0.8;
const BUMPS=[],FEAT=[],SHK={y:0,vy:0,r:0,vr:0,i:0,fi:0,w:0,wv:0,air:null};   // Stöße (Wurzeln/Steine) -> Cockpit ruppelt
const lerp=(a,b,t)=>a+(b-a)*t;
const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const wrapA=d=>{while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;return d;};
let _seed=20261113;
const rnd=()=>{_seed=(_seed*16807)%2147483647;return _seed/2147483647;};
function hash2(ix,iz){let n=(Math.imul(ix,374761393)+Math.imul(iz,668265263))|0;n=Math.imul(n^(n>>>13),1274126177);n^=n>>>16;return (n>>>0)/4294967296;}
function vn(x,z){const ix=Math.floor(x),iz=Math.floor(z);let fx=x-ix,fz=z-iz;fx=fx*fx*(3-2*fx);fz=fz*fz*(3-2*fz);
  const a=hash2(ix,iz),b=hash2(ix+1,iz),c=hash2(ix,iz+1),d=hash2(ix+1,iz+1);return a+(b-a)*fx+(c-a)*fz+(a-b-c+d)*fx*fz;}
function fbm(x,z){return vn(x,z)*0.5+vn(x*2.1+5.3,z*2.1+1.7)*0.25+vn(x*4.3+9.1,z*4.3+3.3)*0.15+vn(x*8.7,z*8.7)*0.1;}
const C=h=>new THREE.Color(h).convertSRGBToLinear();
const L3=h=>{const c=C(h);return [c.r,c.g,c.b];};
const mix3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];

// ================= Strecke: Halde Großes Holz =================
// Kegelförmige Halde: Fuß bei RBASE, Gipfelplateau bei RTOP, 90 m Höhenunterschied (55,8 -> 145,8 m ü. NHN)
const HTOP=90,RTOP=62,RBASE=340,KR=(RBASE-RTOP)/HTOP,SEG=2,NHN0=(RT&&RT.nhn0!==undefined)?RT.nhn0:55.8;
const TRACK_NAME='Halde Großes Holz · Uphill + Trail „Highway“';
const SECN=ROUTE?['Asphaltweg','Schotterweg','Trail']:['Anfahrt am Haldenfuß','Uphill · Asphalt','Zwischenplateau · Blauer Leuchtmarker','Uphill · Asphalt','Gipfelplateau · 145,8 m ü. NHN','Trail „Highway“'];
const PLACE=ROUTE?RT.label+(((RT.custom?'GPX':(RT.place||'Bergkamen'))===RT.label)?'':' · '+(RT.custom?'GPX':(RT.place||'Bergkamen'))):'Halde Großes Holz · Bergkamen';
const coneH=r=>HTOP*clamp((RBASE-r)/(RBASE-RTOP),0,1);

const raw=[];
// Mittwochsrunde: GPX-Punkte (2 m Raster), x = Ost, z = -Nord, y = Höhe über Halden-Nullpunkt
function buildRouteRaw(){
  const P=MITT.pts;
  for(let i=0;i<P.length;i++)raw.push({x:P[i][0],z:-P[i][1],y:Math.max(0,P[i][2]-NHN0),sec:1});
  const n=raw.length;
  for(let pass=0;pass<10;pass++){          // GPS-Zittern glätten
    const nx=raw.map(r=>r.x),nz=raw.map(r=>r.z);
    for(let i=1;i<n-1;i++){nx[i]=(raw[i-1].x+2*raw[i].x+raw[i+1].x)/4;nz[i]=(raw[i-1].z+2*raw[i].z+raw[i+1].z)/4;}
    for(let i=0;i<n;i++){raw[i].x=nx[i];raw[i].z=nz[i];}
  }
  // Untergrund: 0 Asphalt, 1 Schotter, 2 Trail. Mit OSM-Datei (npm run surfaces) sonst frei aus der Steigung geschätzt.
  if(SURF_RAW){const a=SURF_RAW;for(let i=0;i<n;i++)raw[i].sec=a[Math.min(a.length-1,i)];return;}
  let cls=raw.map((r,i)=>{
    const a=raw[Math.max(0,i-10)],b=raw[Math.min(n-1,i+10)],g=(b.y-a.y)/(Math.hypot(b.x-a.x,b.z-a.z)||1)*100;
    return g<-5.5?2:g<-2?1:g>7?2:g>2?0:1;
  });
  for(let pass=0;pass<2;pass++){          // Mehrheit im 120-m-Fenster
    cls=cls.map((c,i)=>{const k=[0,0,0];for(let j=Math.max(0,i-30);j<=Math.min(n-1,i+30);j++)k[cls[j]]++;return k[0]>=k[1]&&k[0]>=k[2]?0:k[1]>=k[2]?1:2;});
  }
  let a=0;                                // Abschnitte unter 80 m dem Vorgänger zuschlagen
  for(let i=1;i<=n;i++){
    if(i===n||cls[i]!==cls[a]){if(i-a<40&&a>0)for(let j=a;j<i;j++)cls[j]=cls[a-1];a=i;}
  }
  for(let i=0;i<n;i++)raw[i].sec=cls[i];
}
(function buildRaw(){
  if(ROUTE){buildRouteRaw();return;}
  let th=-0.6,r=RBASE,y=0;
  const push=sec=>raw.push({x:r*Math.cos(th),z:r*Math.sin(th),y:y,sec:sec});
  for(let i=0;i<70;i++){push(0);th+=SEG/r;}
  function climb(g,yEnd,sec){
    while(y<yEnd){push(sec);const dy=g*SEG,dr=-dy*KR;const t=Math.sqrt(Math.max(0,SEG*SEG-dy*dy-dr*dr));th+=t/r;r+=dr;y+=dy;}
    y=yEnd;r=RBASE-yEnd*KR;
  }
  climb(0.06,45,1);
  for(let i=0;i<45;i++){push(2);th+=SEG/r;}
  climb(0.07,HTOP,3);
  // Plateau und Trail: Lenk-Integrator auf Wegpunkte
  let px=r*Math.cos(th),pz=r*Math.sin(th),a=th+Math.PI/2;
  function seek(tx,tz,rmin,sec){
    for(let n=0;n<400;n++){
      const dx=tx-px,dz=tz-pz,dist=Math.hypot(dx,dz);
      if(dist<5)break;
      if(n>8&&dx*Math.cos(a)+dz*Math.sin(a)<0&&dist<rmin*2.2)break;
      const d=wrapA(Math.atan2(dz,dx)-a);
      a+=clamp(d,-SEG/rmin,SEG/rmin);
      px+=Math.cos(a)*SEG;pz+=Math.sin(a)*SEG;
      raw.push({x:px,z:pz,y:HTOP,sec:sec});
    }
  }
  const thE=th,thB=thE+3.4;
  seek(12*Math.cos(thE+1.0),12*Math.sin(thE+1.0),10,4);
  seek((RTOP-1)*Math.cos(thB),(RTOP-1)*Math.sin(thB),10,4);
  for(let i=1;i<=12;i++){
    const rr=RTOP+i*29,tt=thB+0.34*Math.sin(i*1.25)+0.03*i;
    seek(rr*Math.cos(tt),rr*Math.sin(tt),9,5);
  }
  for(let p=0;p<8;p++){
    for(let i=1;i<raw.length-1;i++){
      const A=raw[i-1],B=raw[i],Cc=raw[i+1];
      B.nx=(A.x+2*B.x+Cc.x)/4;B.nz=(A.z+2*B.z+Cc.z)/4;B.ny=(A.y+2*B.y+Cc.y)/4;
    }
    for(let i=1;i<raw.length-1;i++){const B=raw[i];B.x=B.nx;B.z=B.nz;B.y=B.ny;}
  }
})();

const cum=[0];
for(let i=1;i<raw.length;i++)cum.push(cum[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].z-raw[i-1].z));
const N=Math.floor(cum[cum.length-1]/SEG),TOTAL=N*SEG;
const PX=new Float32Array(N+1),PY=new Float32Array(N+1),PZ=new Float32Array(N+1);
const SEC=new Array(N+1);
(function(){
  let j=0;
  for(let i=0;i<=N;i++){
    const s=i*SEG;
    while(j<raw.length-2&&cum[j+1]<s)j++;
    const f=clamp((s-cum[j])/((cum[j+1]-cum[j])||1),0,1);
    PX[i]=lerp(raw[j].x,raw[j+1].x,f);PY[i]=lerp(raw[j].y,raw[j+1].y,f);PZ[i]=lerp(raw[j].z,raw[j+1].z,f);
    SEC[i]=raw[j].sec;
  }
})();
// Mit echtem Gelände: Streckenhöhe aus dem Höhenmodell (Median aus Mitte und ±3 m seitlich gegen GPS-Versatz),
// stark geglättet und auf 17 % Steigung begrenzt. So liegt die Strecke auf dem Gelände statt in der Luft.
const OFF=new Float32Array(N+1);
if(useDem){
  const tmp=new Float32Array(N+1);
  for(let i=0;i<=N;i++){
    const i0=Math.max(0,i-2),i1=Math.min(N,i+2),dx=PX[i1]-PX[i0],dz=PZ[i1]-PZ[i0],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
    const a=demH(PX[i],PZ[i]),b=demH(PX[i]+nx*3,PZ[i]+nz*3),c=demH(PX[i]-nx*3,PZ[i]-nz*3);
    tmp[i]=Math.max(Math.min(a,b),Math.min(Math.max(a,b),c));       // Median
  }
  for(let i=0;i<=N;i++)PY[i]=Math.max(0,tmp[i]);
  smoothArr(PY,12);
  for(let it=0;it<80;it++){
    let ch=false;
    for(let i=0;i<N;i++){const d=PY[i+1]-PY[i],mx=0.17*SEG;if(Math.abs(d)>mx){const e=(Math.abs(d)-mx)/2*Math.sign(d);PY[i]+=e;PY[i+1]-=e;ch=true;}}
    if(!ch)break;
  }
  for(let i=0;i<=N;i++){const dh=demH(PX[i],PZ[i])+0.14;PY[i]=dh+clamp(PY[i]-dh,-0.5,0.5);}   // Strecke bleibt dicht am echten Gelaende (kein Damm, kein Einschnitt)
  smoothArr(PY,2);
  for(let i=0;i<=N;i++)OFF[i]=PY[i]-0.14-demH(PX[i],PZ[i]);        // Abweichung Strecke ↔ Gelände
  smoothArr(OFF,8);
}
const iTrail=ROUTE?N+1:SEC.indexOf(5);
const SURF=new Uint8Array(N+1);
for(let i=0;i<=N;i++)SURF[i]=ROUTE?SEC[i]:(SEC[i]===5?2:0);
function surfRuns(cb){let a=0;for(let i=1;i<=N+1;i++){if(i>N||SURF[i]!==SURF[a]){cb(SURF[a],a,Math.min(N,i));a=i;}}}
function smoothArr(arr,passes){
  const n=arr.length,t=new Float32Array(n);
  for(let p=0;p<passes;p++){
    for(let i=0;i<n;i++)t[i]=(arr[Math.max(0,i-1)]+arr[i]+arr[Math.min(n-1,i+1)])/3;
    for(let i=0;i<n;i++)arr[i]=t[i];
  }
}
const HW=new Float32Array(N+1),FLAT=new Float32Array(N+1),OUTR=new Float32Array(N+1);
for(let i=0;i<=N;i++){
  const s=SEC[i];
  if(ROUTE){HW[i]=[2.0,1.5,0.7][s];FLAT[i]=[5,4,2.3][s];OUTR[i]=[14,12,7][s];continue;}
  HW[i]=s===5?0.7:2.0;
  FLAT[i]=s===5?2.3:(s===2?13:5);
  OUTR[i]=s===5?7:(s===2?24:14);
}
if(ROUTE&&!CUS&&OBJ_RAW){   // Asphaltbreite der Strecke aus der naechsten OSM-Strasse (width-Tag oder Typ-Standard)
  const rs=[];OBJ_RAW.lines.forEach(L=>{if(L[0]!=='road')return;const e=L[2]||{};if(e.u||e.br)return;const q=L[1];for(let i=0;i+3<q.length;i+=2)rs.push(q[i],q[i+1],q[i+2],q[i+3],e.w||5);});
  for(let i=0;i<=N;i++){if(SEC[i]!==0)continue;let bd=36,bw=0;const px=PX[i],pz=PZ[i];
    for(let k=0;k<rs.length;k+=5){const ax=rs[k],az=rs[k+1],dx=rs[k+2]-ax,dz=rs[k+3]-az;
      if(Math.abs(ax-px)>60||Math.abs(az-pz)>60)continue;
      const l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((px-ax)*dx+(pz-az)*dz)/l2)),ex=ax+dx*t-px,ez=az+dz*t-pz,d2=ex*ex+ez*ez;
      if(d2<bd){bd=d2;bw=rs[k+4];}}
    if(bw)HW[i]=Math.max(1.5,Math.min(4,bw/2));}
}
let strIn=null;   // liegt ein Punkt auf einer amtlichen Strassenflaeche? (nur wenn Daten vorhanden)
if(ROUTE&&!CUS&&STR_RAW){   // echte Fahrbahnbreite aus den amtlichen Flaechen (ALKIS): quer zur Strecke messen
  const G=24,gm=new Map(),polys=STR_RAW.polys,bbs=polys.map(P=>{let a=1e9,b=1e9,c=-1e9,d=-1e9;for(let i=0;i<P.length;i+=2){a=Math.min(a,P[i]);c=Math.max(c,P[i]);b=Math.min(b,P[i+1]);d=Math.max(d,P[i+1]);}return [a,b,c,d];});
  polys.forEach((P,k)=>{const b=bbs[k];for(let cx=Math.floor(b[0]/G);cx<=Math.floor(b[2]/G);cx++)for(let cz=Math.floor(b[1]/G);cz<=Math.floor(b[3]/G);cz++){const key=cx*100000+cz;(gm.get(key)||gm.set(key,[]).get(key)).push(k);}});
  const inR=(x,z)=>{const l=gm.get(Math.floor(x/G)*100000+Math.floor(z/G));if(!l)return false;
    for(const k of l){const b=bbs[k];if(x<b[0]||x>b[2]||z<b[1]||z>b[3])continue;const P=polys[k];let c=false;for(let u=0,w=P.length-2;u<P.length;w=u,u+=2){if((P[u+1]>z)!==(P[w+1]>z)&&x<(P[w]-P[u])*(z-P[u+1])/(P[w+1]-P[u+1])+P[u])c=!c;}if(c)return true;}return false;};
  strIn=inR;
  let nm=0;
  for(let i=0;i<=N;i++){if(SEC[i]!==0)continue;
    const a=Math.max(0,i-1),b=Math.min(N,i+1),dx=PX[b]-PX[a],dz=PZ[b]-PZ[a],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
    let o0=null;for(let k=0;k<=8&&o0===null;k++){for(const sg of [1,-1]){const o=k*0.5*sg;if(inR(PX[i]+nx*o,PZ[i]+nz*o)){o0=o;break;}}}
    if(o0===null)continue;
    let r=o0,q=o0;while(r<o0+9&&inR(PX[i]+nx*(r+0.5),PZ[i]+nz*(r+0.5)))r+=0.5;while(q>o0-9&&inR(PX[i]+nx*(q-0.5),PZ[i]+nz*(q-0.5)))q-=0.5;
    HW[i]=Math.max(1.5,Math.min(3,(r-q)/2));nm++;}
  window.__strMeasured=nm;
}
smoothArr(HW,10);smoothArr(FLAT,10);smoothArr(OUTR,10);
const RW=new Float32Array(N+1);      // halbe Breite des sichtbaren Wegbandes
for(let i=0;i<=N;i++)RW[i]=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1);

// Räumlicher Hash für "nächster Streckenpunkt"
const CELL=28;
function makeHash(i0,i1){
  const m=new Map();
  for(let i=i0;i<=i1;i++){
    const k=(Math.floor(PX[i]/CELL)+500)*1000+Math.floor(PZ[i]/CELL)+500;
    let a=m.get(k);if(!a){a=[];m.set(k,a);}a.push(i);
  }
  return m;
}
let nI=-1,nD=1e9;
function nearest(m,x,z){
  const cx=Math.floor(x/CELL)+500,cz=Math.floor(z/CELL)+500;let bd=1e12,bi=-1;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const a=m.get((cx+dx)*1000+cz+dz);if(!a)continue;
    for(let k=0;k<a.length;k++){const i=a[k],ex=PX[i]-x,ez=PZ[i]-z,d=ex*ex+ez*ez;if(d<bd){bd=d;bi=i;}}
  }
  nI=bi;nD=Math.sqrt(bd);return bi>=0;
}
// Mittwochsrunde: Gelände aus der Strecke abgeleitet (weiches Höhenfeld aus zwei Gauß-Unschärfen)
function buildField(){
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(let i=0;i<=N;i++){x0=Math.min(x0,PX[i]);x1=Math.max(x1,PX[i]);z0=Math.min(z0,PZ[i]);z1=Math.max(z1,PZ[i]);}
  const M=300,G=12,ox=x0-M,oz=z0-M,nx=Math.ceil((x1-x0+2*M)/G)+1,nz=Math.ceil((z1-z0+2*M)/G)+1;
  const mk=()=>new Float32Array(nx*nz),S1=mk(),T1=mk(),S2=mk(),T2=mk();
  function splat(S,T,sig){
    const R=Math.ceil(2.6*sig/G);
    for(let i=0;i<=N;i+=5){
      const gx=(PX[i]-ox)/G,gz=(PZ[i]-oz)/G,cx=Math.round(gx),cz=Math.round(gz);
      for(let dz=-R;dz<=R;dz++){const zz=cz+dz;if(zz<0||zz>=nz)continue;
        for(let dx=-R;dx<=R;dx++){const xx=cx+dx;if(xx<0||xx>=nx)continue;
          const ex=(xx-gx)*G,ez=(zz-gz)*G,w=Math.exp(-(ex*ex+ez*ez)/(sig*sig));S[zz*nx+xx]+=w;T[zz*nx+xx]+=w*PY[i];}}
    }
  }
  splat(S1,T1,55);splat(S2,T2,220);
  let s1m=0,s2m=0;for(let k=0;k<S1.length;k++){s1m=Math.max(s1m,S1[k]);s2m=Math.max(s2m,S2[k]);}
  return {ox:ox,oz:oz,nx:nx,nz:nz,G:G,S1:S1,T1:T1,S2:S2,T2:T2,s1m:s1m,s2m:s2m};
}
if(LIFTS.length&&LIFTS[0].ax!==undefined){   // Liftbereiche per Lage auf die (geglaettete, etwas kuerzere) Spielstrecke uebertragen
  const R0=Math.max(1,(MITT.pts?MITT.pts.length:N)-1),near=(x,z,y,est)=>{let bi=est,bd=1e12;for(let i=Math.max(0,est-900);i<=Math.min(N,est+900);i++){const dx=PX[i]-x,dz=PZ[i]-z,dy=(PY[i]-y)*0.6,d=dx*dx+dz*dz+dy*dy;if(d<bd){bd=d;bi=i;}}return bi;};
  LIFTS=LIFTS.map(l=>{const a=l.a===0?0:near(l.ax,l.az,l.ay,Math.round(l.a*N/R0)),b=near(l.bx,l.bz,l.by,Math.round(l.b*N/R0));return Object.assign({},l,{a:a,b:Math.max(b,a+10)});});
}
const FG=ROUTE?buildField():null;
function fld(a,x,z){
  const gx=clamp((x-FG.ox)/FG.G,0,FG.nx-1.001),gz=clamp((z-FG.oz)/FG.G,0,FG.nz-1.001),ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz,o=iz*FG.nx+ix;
  return lerp(lerp(a[o],a[o+1],fx),lerp(a[o+FG.nx],a[o+FG.nx+1],fx),fz);
}
function routePresence(x,z){return fld(FG.S2,x,z)/FG.s2m;}
// Landschaft aus OpenStreetMap (npm run osm -> src/routes/umgebung.json): Wald, Felder, Siedlung, Wasser, Gebäude
// Luftbilder (DOP): kommen asynchron; Gelaende- und Dachfarben werden danach nachgefaerbt
const DOPHOOK=[];let dopAt=()=>null;
const RES1=(()=>{if(!R1_RAW)return null;
  const j=R1_RAW,bin=atob(j.d),u=new Int8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i)<<24>>24;return {x0:j.x0,z0:j.z0,w:j.w,h:j.h,c:j.cell,q:j.q,d:u};})();   // 1-m-Gelaende: Abweichung vom 4-m-Raster in Streckennaehe
const resid=(x,z)=>{if(!RES1)return 0;const u=(x-RES1.x0)/RES1.c,v=(z-RES1.z0)/RES1.c;if(u<0||v<0||u>=RES1.w-1.001||v>=RES1.h-1.001)return 0;
  const i=u|0,j=v|0,fu=u-i,fv=v-j,o=j*RES1.w+i,D=RES1.d;return ((D[o]*(1-fu)+D[o+1]*fu)*(1-fv)+(D[o+RES1.w]*(1-fu)+D[o+RES1.w+1]*fu)*fv)*RES1.q;};
let CANK=4;
const CAN=(()=>{if(!CAN_RAW)return null;
  const j=CAN_RAW,bin=atob(j.t),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);CANK=j.k||4;return new Int16Array(u.buffer);})();   // Baeume aus Laserscan: x,z,Hoehe,Kronenradius (dm)
const OSM=ROUTE&&!CUS?OSM_RAW:null;
// Amtliche 3D-Gebaeude LoD2 (npm run lod2 -- <strecke>): echte Dachformen und Hoehen, ersetzen die OSM-Gebaeude
const LOD2=ROUTE&&!CUS&&OSM?LOD2_RAW:null;
const LUC=4,LW=OSM?Math.ceil((FG.nx-1)*FG.G/LUC)+2:0,LH=OSM?Math.ceil((FG.nz-1)*FG.G/LUC)+2:0;
const LU=OSM?{K:new Float32Array(LW*LH),FD:new Float32Array(LW*LH),OP:new Float32Array(LW*LH),UR:new Float32Array(LW*LH),WA:new Float32Array(LW*LH),B:new Uint8Array(LW*LH)}:null;
if(LU){
  const CLS=new Uint8Array(LW*LH);
  const inPoly=(p,x,z)=>{let c=false;for(let a=0,b=p.length-2;a<p.length;b=a,a+=2){if((p[a+1]>z)!==(p[b+1]>z)&&x<(p[b]-p[a])*(z-p[a+1])/(p[b+1]-p[a+1])+p[a])c=!c;}return c;};
  const cells=(p,f,pad)=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(let a=0;a<p.length;a+=2){x0=Math.min(x0,p[a]);x1=Math.max(x1,p[a]);z0=Math.min(z0,p[a+1]);z1=Math.max(z1,p[a+1]);}
    const i0=Math.max(0,Math.floor((x0-pad-FG.ox)/LUC)),i1=Math.min(LW-1,Math.ceil((x1+pad-FG.ox)/LUC)),j0=Math.max(0,Math.floor((z0-pad-FG.oz)/LUC)),j1=Math.min(LH-1,Math.ceil((z1+pad-FG.oz)/LUC));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)f(i,j,FG.ox+i*LUC,FG.oz+j*LUC);};
  const ORDER=[2,3,7,5,1,4];
  ORDER.forEach(k=>OSM.areas.forEach(a=>{if(a.k!==k)return;cells(a.p,(i,j,x,z)=>{if(inPoly(a.p,x,z))CLS[j*LW+i]=k;},0);}));
  OSM.lines.forEach(l=>{for(let a=0;a+3<l.p.length;a+=2){const ax=l.p[a],az=l.p[a+1],bx=l.p[a+2],bz=l.p[a+3],n=Math.ceil(Math.hypot(bx-ax,bz-az)/2)+1;
    for(let t=0;t<=n;t++){const x=ax+(bx-ax)*t/n,z=az+(bz-az)*t/n,r=l.w/2+1;for(let dj=-Math.ceil(r/LUC);dj<=Math.ceil(r/LUC);dj++)for(let di=-Math.ceil(r/LUC);di<=Math.ceil(r/LUC);di++){
      const i=Math.round((x-FG.ox)/LUC)+di,j=Math.round((z-FG.oz)/LUC)+dj;if(i<0||j<0||i>=LW||j>=LH)continue;
      if(Math.hypot(FG.ox+i*LUC-x,FG.oz+j*LUC-z)<=r)CLS[j*LW+i]=4;}}}});
  for(let q=0;q<CLS.length;q++){const k=CLS[q];if(!k)continue;LU.K[q]=1;LU.FD[q]=k===1?0.95:k===5?0.45:k===7?0.2:0;LU.OP[q]=k===2?1:k===7?0.5:0;LU.UR[q]=k===3?1:0;LU.WA[q]=k===4?1:0;}
  OSM.buildings.forEach(b=>cells(b.p,(i,j,x,z)=>{if(inPoly(b.p,x,z)||b.p.some((v,a)=>a%2===0&&Math.hypot(v-x,b.p[a+1]-z)<LUC*1.2))LU.B[j*LW+i]=1;},LUC));
}
function lu(a,x,z){
  const gx=clamp((x-FG.ox)/LUC,0,LW-1.001),gz=clamp((z-FG.oz)/LUC,0,LH-1.001),ix=Math.floor(gx),iz=Math.floor(gz),fx=gx-ix,fz=gz-iz,o=iz*LW+ix;
  return lerp(lerp(a[o],a[o+1],fx),lerp(a[o+LW],a[o+LW+1],fx),fz);
}
const inBuilding=(x,z)=>{if(!LU)return false;const i=Math.round((x-FG.ox)/LUC),j=Math.round((z-FG.oz)/LUC);return i>=0&&j>=0&&i<LW&&j<LH&&LU.B[j*LW+i]===1;};
function baseRoute(x,z){
  const s1=fld(FG.S1,x,z),a=sstep(0.04,0.35,s1/FG.s1m);
  const m1=fld(FG.T1,x,z)/(s1+1e-6),m2=fld(FG.T2,x,z)/(fld(FG.S2,x,z)+0.02*FG.s2m);
  return lerp(m2,m1,a)+(fbm(x/60+11,z/60+7)-0.5)*5*sstep(0.1,0.5,s1/FG.s1m);
}
function baseH(x,z){
  if(useDem){            // echtes Gelände, am Rand weich zur Umland-Ebene auslaufend
    const e=Math.min(x-FG.ox,FG.ox+(FG.nx-1)*FG.G-x,z-FG.oz,FG.oz+(FG.nz-1)*FG.G-z);
    return lerp(-1.2,demH(x,z)+resid(x,z),sstep(0,110,e));
  }
  if(ROUTE)return baseRoute(x,z);
  const r=Math.hypot(x,z),e=Math.max(Math.abs(x),Math.abs(z));
  const m=sstep(RTOP+4,RTOP+50,r)*(1-sstep(RBASE-20,RBASE+90,r));
  let h=coneH(r)+(fbm(x/70+11,z/70+7)-0.5)*9*m;
  h+=(fbm(x/160,z/160)-0.5)*2.5*sstep(RBASE,RBASE+150,r)*(1-sstep(520,640,e));
  return h-1.7*sstep(600,660,e);
}
function ground(m,x,z){
  let h=baseH(x,z);
  if(nearest(m,x,z)){
    if(useDem){
      // Wegbett eben, dann sanft ins echte Gelände; die Höhenabweichung klingt über 28 m ab (keine Wände, keine Brücken)
      if(nD<14){let t=sstep(RW[nI]+0.3,RW[nI]+5.5,nD);t=t*t*(3-2*t);t=t*t*(3-2*t)*0.35+t*0.65;h=lerp(PY[nI]-0.14,h+OFF[nI]*(1-sstep(RW[nI],RW[nI]+7,nD))+(fbm(x/2.6+3,z/2.6)-0.5)*0.34*sstep(RW[nI]+1.2,RW[nI]+5,nD)+(fbm(x/9,z/9+5)-0.5)*0.5*sstep(RW[nI]+2,RW[nI]+9,nD),t);}
    }else if(nD<OUTR[nI]){const w=1-sstep(FLAT[nI],OUTR[nI],nD);h=lerp(h,PY[nI]-0.14,w);}
  }
  return h;
}
// Trailhöhe folgt dem Gelände inkl. Wegbankett des Uphills
const roadHash=makeHash(0,iTrail-1);
if(!ROUTE)for(let i=iTrail;i<=N;i++)PY[i]=ground(roadHash,PX[i],PZ[i])+0.14;
if(!ROUTE)(function(){
  const sub=PY.slice(iTrail-4);
  const first=sub[0];smoothArr(sub,16);sub[0]=first;
  for(let k=1;k<sub.length;k++)PY[iTrail-4+k]=sub[k];
})();
const allHash=makeHash(0,N);
const gnd=(x,z)=>ground(allHash,x,z);

const HS=new Float32Array(N+1),GR=new Float32Array(N+1),KV=new Float32Array(N+1);
for(let i=0;i<N;i++){HS[i]=Math.atan2(PX[i+1]-PX[i],PZ[i+1]-PZ[i]);GR[i]=(PY[i+1]-PY[i])/SEG*100;}
const STEEP=new Float32Array(N+2);   // 0..1: wie ruppig ist die Abfahrt hier (ab ~4 % bergab, voll bei ~12 %)
for(let i=0;i<=N;i++){let a=0,n=0;for(let k=-7;k<=7;k++){const j=i+k;if(j>=0&&j<N){a+=GR[j];n++;}}STEEP[i]=(ROUTE&&SURF[i]===0)?0:Math.max(0,Math.min(1,(-(a/Math.max(1,n))-4)/8));}
HS[N]=HS[N-1];GR[N]=GR[N-1];
for(let i=0;i<N;i++)KV[i]=wrapA(HS[i+1]-HS[i])/SEG;
smoothArr(KV,4);smoothArr(GR,3);

// ================= Renderer & Licht =================
const canvas=document.getElementById('c');
const IOSX=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);   // iPad/iPhone: sparsamer Speicherverbrauch (aeltere Geraete werden sonst vom Browser beendet)
const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:!IOSX});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.95;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;   // Schattenkarte beim Fahren nur jedes 2. Bild neu (sieht man nicht, spart viel)
let shN=0;
const scene=new THREE.Scene();
const HORIZON=new THREE.Color(0.62,0.74,0.86);
scene.background=HORIZON;
scene.fog=new THREE.FogExp2(HORIZON,0.00055);
// ================= Grafik+: Bodennebel, Jahreszeiten (gemeinsame Uniforms + Shader-Patches) =================
const GF={value:new THREE.Vector3(0,0,22)};   // x: Staerke Bodennebel, y: Obergrenze (Welt-y), z: Dicke des Uebergangs
const SEA={aut:{value:0},win:{value:0},snowY:{value:-1e5},snowK:{value:1}};   // Herbst 0..1, Winter 0..1, Schneegrenze (nur Alpen), Schneedeckung
(function(){const C=THREE.ShaderChunk;
  C.fog_pars_vertex='#ifdef USE_FOG\n varying float fogDepth;\n varying float fogWY;\n#endif';
  C.fog_vertex='#ifdef USE_FOG\n fogDepth=-mvPosition.z;\n fogWY=cameraPosition.y+dot(viewMatrix[1].xyz,mvPosition.xyz);\n#endif';
  C.fog_pars_fragment='#ifdef USE_FOG\n uniform vec3 fogColor;uniform vec3 uGF;varying float fogDepth;varying float fogWY;\n #ifdef FOG_EXP2\n uniform float fogDensity;\n #else\n uniform float fogNear;uniform float fogFar;\n #endif\n#endif';
  C.fog_fragment='#ifdef USE_FOG\n #ifdef FOG_EXP2\n float fogFactor=1.0-exp(-fogDensity*fogDensity*fogDepth*fogDepth);\n #else\n float fogFactor=smoothstep(fogNear,fogFar,fogDepth);\n #endif\n'
   +' if(uGF.x>0.0){float lay=uGF.x*clamp((uGF.y-fogWY)/uGF.z,0.0,1.0);fogFactor=1.0-(1.0-fogFactor)*(1.0-lay*(1.0-exp(-fogDepth*0.014)));}\n'
   +' gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,fogFactor);\n#endif';
  THREE.Material.prototype.onBeforeCompile=function(s){s.uniforms.uGF=GF;};
})();
const SEA_SN='float sn=clamp(uWin*smoothstep(uSnowY-60.0,uSnowY+40.0,vWP.y)*(0.8+0.2*sin(vWP.x*0.31)*sin(vWP.z*0.37)),0.0,1.0)*uSnowK;';
// Wege im Winter: Schnee liegt fleckig (mal bedeckt, mal frei), am Rand dichter; zwei duenne braune Fahrspuren und dunkle Matschpfuetzen bleiben frei
const SEA_PATH=(e0,cv,pdk)=>SEA_SN+'float cx=abs(vUv.x-0.5)*2.0,sE=smoothstep('+e0+',0.95,cx),n1=sNz(vWP.xz*0.55)*0.65+sNz(vWP.xz*1.7)*0.35,pd=smoothstep(0.68,0.77,sNz(vWP.xz*0.8+7.0))*'+pdk.toFixed(2)+',rut=smoothstep(0.1,0.0,abs(cx-0.4+(sNz(vWP.xz*0.3)-0.5)*0.1));'
  +'float cov=min(1.0,sn*1.5)*mix(smoothstep(0.4,0.62,n1)*'+cv.toFixed(2)+',0.9,sE)*(1.0-rut*0.85)*(1.0-pd*(1.0-sE));'
  +'diffuseColor.rgb*=1.0-uWin*(0.4*pd*(1.0-sE)+0.18*rut);diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.77,.81,.88),vec3(.9,.93,.97),sE),cov);';
const SEA_CODE={
  leaf:'float sN=sH(vSeed.xz*0.731+vSeed.y);float sL=dot(diffuseColor.rgb,vec3(.3,.55,.15));vec3 sA=sN<.3?vec3(1.0,.64,.14):(sN<.58?vec3(.95,.42,.08):(sN<.8?vec3(.72,.17,.07):vec3(.86,.78,.22)));diffuseColor.rgb=mix(diffuseColor.rgb,sA*sL*1.9,uAut);if(uWin>0.0&&sN<uWin*.88)discard;diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.8,.85,.9),uWin*.4);',
  fir:'float sN=sH(vSeed.xz*0.731+vSeed.y);'+SEA_SN+'diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.9,.95),sn*(.4+.35*sN));',
  grs:SEA_SN+'float sL=dot(diffuseColor.rgb,vec3(.3,.55,.15));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.62,.46,.2)*sL*2.0,uAut*.6);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.76,.79,.84),sn*.85);',
  gnd:SEA_SN+'float sL=dot(diffuseColor.rgb,vec3(.3,.55,.15));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.36,.18)*sL*2.2,uAut*.35);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.82,.89),sn);',
  asp:SEA_PATH(0.3,0.85,0.25),
  gvl:SEA_PATH(0.25,0.8,0.7),
  trl:SEA_PATH(0.3,0.65,1.0)};
function seaPatch(mat,kind,inst){
  mat.onBeforeCompile=function(s){
    s.uniforms.uGF=GF;s.uniforms.uAut=SEA.aut;s.uniforms.uWin=SEA.win;s.uniforms.uSnowY=SEA.snowY;s.uniforms.uSnowK=SEA.snowK;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSeed;varying vec3 vWP;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvSeed='+(inst?'instanceMatrix[3].xyz':'vec3(0.0)')+';vWP=(modelMatrix*'+(inst?'instanceMatrix*':'')+'vec4(transformed,1.0)).xyz;');
    const pre='#include <common>\nuniform float uAut,uWin,uSnowY,uSnowK;varying vec3 vSeed;varying vec3 vWP;\nfloat sH(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}\nfloat sNz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(sH(i),sH(i+vec2(1.0,0.0)),f.x),mix(sH(i+vec2(0.0,1.0)),sH(i+vec2(1.0)),f.x),f.y);}';
    if(kind==='dep')s.fragmentShader=s.fragmentShader.replace('#include <common>',pre).replace('#include <alphatest_fragment>','if(uWin>0.0&&sH(vSeed.xz*0.731+vSeed.y)<uWin*.88)discard;\n#include <alphatest_fragment>');
    else s.fragmentShader=s.fragmentShader.replace('#include <common>',pre).replace('#include <color_fragment>','#include <color_fragment>\n'+SEA_CODE[kind]);
  };
}
const camera=new THREE.PerspectiveCamera(64,16/9,0.4,(RT&&RT.alp)?18000:6000);
const BK=!!RT&&!RT.custom&&!!RT.dem;   // feste Strecken: Sonnenstand nach Uhrzeit, fliegende Voegel
const SUN=new THREE.Vector3(-0.55,0.62,0.42).normalize();
const hemi=new THREE.HemisphereLight(new THREE.Color(0.72,0.84,1.0),new THREE.Color(0.34,0.31,0.22),0.75);scene.add(hemi);
const sun=new THREE.DirectionalLight(new THREE.Color(1.0,0.84,0.64),2.35);   // tiefstehende, warme Herbstsonne
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;
sun.shadow.camera.near=10;sun.shadow.camera.far=520;
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.3;
scene.add(sun);scene.add(sun.target);
let composer=null,FXon=false,FXP=null;
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();if(composer){composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);}}
window.addEventListener('resize',resize);resize();
let HDRTEX=null;const WXB={},PUDH={};
const WXN=['Klar','Nebel','Nieselregen'];let WX=0;const WXS={rain:0,fog:0,day:1};
let NIGHT=false;const NT={emi:[],pools:[],lampPts:[],stars:null,city:null,moon:null,halo:null,lamp:null,lampT:null,flood:null,floodT:null,env:null,bloom:null};   // Nachtfahrt (nur Bergkamen): Taste L
try{const q=new URLSearchParams(location.search).get('nightride')||new URLSearchParams(location.search).get('nacht');NIGHT=MW&&(q==='1'||(q===null&&localStorage.getItem('miworu_night')==='1'));}catch(e){}
var AMB_SUNNY=(()=>{try{const g=k=>localStorage.getItem(k)==='1';return !(g('miworu_wxl')||g('miworu_wxfix')||g('miworu_wxstorm')||g('miworu_wxsnow')||g('miworu_wxaut'));}catch(e){return true;}})();   // Ambiente "Sonnig": immer sonnig und hell, die Tageszeit bestimmt nur Sonnenhoehe und Schatten
let WXLIVE=false,WXLIVEOK=false;   // Wetter: nur Aus oder Live (Open-Meteo zur Strecken-Position); ?wetter=0|1|2 erzwingt festen Zustand (Entwicklung)
try{const q=new URLSearchParams(location.search).get('wetter');if(q!==null&&!isNaN(+q))WX=clamp(+q|0,0,2);else WXLIVE=localStorage.getItem('miworu_wxl')==='1';}catch(e){}
// Qualitaetsstufen (Taste Q): Aufloesung, Schattenkarte
const TILES=[];const TREE_FAR=[0,300,560,950];let GRS=null;   // Sichtweite fuer Baum-/Buschkacheln je Qualitaetsstufe (m)
let DRS=1;   // dynamische Aufloesung: faellt bei zu niedriger Bildrate in kleinen Schritten, steigt wieder, wenn Luft ist
const QN={1:'Niedrig',2:'Mittel',3:'Hoch'};let quality=2;try{quality=clamp(+localStorage.getItem('miworu_q')||2,1,3);}catch(e){}
const QE=()=>quality>1?3:1;   // Mittel und Hoch teilen die Aufloesung/Sichtweite/Schatten der frueheren Stufe Hoch (lief auf dem iPad gut); Hoch fuegt nur die Nachbearbeitung hinzu
function applyQ(){
  const dpr=window.devicePixelRatio||1;
  renderer.setPixelRatio([0,Math.min(dpr,0.7),Math.min(dpr,1.25),IOSX?Math.min(dpr,1.5):Math.max(Math.min(dpr,2),1.5)][QE()]*DRS);   // Niedrig bewusst weich, Hoch mit Supersampling
  scene.fog.density=[0,0.0009,0.00055,0.0004][QE()]*[1,5,2.2][WX]*(STORM()?1.5:1)*(NIGHT?1.35:1)*((RT&&RT.alp)?0.32:1)*(1+SEA.win.value*0.7);                                  // Niedrig: naeher Dunst, spart Fernsicht
  sun.castShadow=quality>1&&!NIGHT&&WX!==2;if(NT.lamp)NT.lamp.castShadow=NIGHT&&quality>1;if(GRS)GRS.visible=quality>1;                                                       // Niedrig: keine Schatten, kein Gras
  const sz=[0,1024,2048,IOSX?2048:4096][QE()];
  if(sun.shadow.mapSize.x!==sz){sun.shadow.mapSize.set(sz,sz);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  resize();
}
applyQ();
const qLabel=()=>quality===3?'Hoch · '+(FPSCAP===30?30:60)+' fps':quality===1&&FPSCAP===30?'Akku · 30 fps':QN[quality];   // Akku = Niedrig (kleine Aufloesung, keine Schatten) + 30 fps   // Stufe 4 = Hoch mit 30 Bildern/s (Akku sparen)
function cycleQ(){if(quality===3&&FPSCAP!==30){FPSCAP=30;}else if(quality===1&&FPSCAP===0){FPSCAP=30;}else{quality=quality%3+1;FPSCAP=quality===3?60:0;}try{localStorage.setItem('miworu_q',quality);localStorage.setItem('miworu_fps',String(FPSCAP));}catch(_){}applyQ();fxSetup();toastEl.textContent='Grafik: '+qLabel();toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1100);}
// Nachbearbeitung (nur Stufe "Hoch"): leichtes Bloom, Filmton, Vignette. ?fx=0 schaltet aus, ?fx=1 erzwingt.
function fxWanted(){let f=null;try{f=new URLSearchParams(location.search).get('fx');}catch(e){}if(f==='0')return false;if(f==='1')return true;if(IOSX)return false;return quality===3&&(MW||BK);}   // iPad: keine Nachbearbeitung (MSAA-Float-Puffer + Bloom sind zu schwer)
function fxSetup(){
  if(!fxWanted()){FXon=false;return;}
  if(!composer){
    const w=window.innerWidth,h=window.innerHeight;
    const rt=new THREE.WebGLMultisampleRenderTarget(w,h,{type:THREE.HalfFloatType,format:THREE.RGBAFormat,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});rt.samples=4;
    composer=new EffectComposer(renderer,rt);composer.addPass(new RenderPass(scene,camera));
    const bl=new UnrealBloomPass(new THREE.Vector2(w/2,h/2),0.14,0.55,0.93);composer.addPass(bl);NT.bloom=bl;if(NIGHT){bl.strength=0.75;bl.threshold=0.7;bl.radius=0.7;}
    FXP=new ShaderPass({uniforms:{tDiffuse:{value:null},exposure:{value:0.95},vig:{value:0.1},spd:{value:0},ray:{value:0},sunUV:{value:new THREE.Vector2(0.5,0.5)},rayCol:{value:new THREE.Color(1.0,0.8,0.52)}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform sampler2D tDiffuse;uniform float exposure,vig,spd,ray;uniform vec2 sunUV;uniform vec3 rayCol;varying vec2 vUv;
        vec3 RRT(vec3 v){vec3 a=v*(v+0.0245786)-0.000090537;vec3 b=v*(0.983729*v+0.4329510)+0.238081;return a/b;}
        void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;
          if(spd>0.05){vec2 d2=vUv-0.5;vec3 ab=c;for(int k=1;k<=2;k++)ab+=texture2D(tDiffuse,vUv-d2*spd*0.04*float(k)).rgb;c=ab/3.0;}
          if(ray>0.001){vec2 dv=sunUV-vUv;vec3 ac=vec3(0.0);float w=1.0;for(int i=0;i<10;i++){vec2 q=vUv+dv*(float(i)+0.5)/10.0*0.9;vec3 sm=texture2D(tDiffuse,q).rgb;float L=dot(sm,vec3(0.33,0.5,0.17));ac+=vec3(smoothstep(0.62,1.0,L))*w;w*=0.9;}c+=rayCol*ac*ray*(1.0-clamp(length(dv),0.0,1.0)*0.5)*0.15;}
          c*=exposure*1.03/0.6;
          c=mat3(vec3(0.59719,0.07600,0.02840),vec3(0.35458,0.90834,0.13383),vec3(0.04823,0.01566,0.83777))*c;c=RRT(c);
          c=mat3(vec3(1.60475,-0.10208,-0.00327),vec3(-0.53108,1.10813,-0.07276),vec3(-0.07367,-0.00605,1.07602))*c;c=clamp(c,0.0,1.0);
          float l=dot(c,vec3(0.2126,0.7152,0.0722));c=mix(vec3(l),c,1.06);c=pow(c,vec3(0.9))+0.01;   // leichte Saettigung und Kontrast
          vec2 d=vUv-0.5;c*=1.0-(vig+spd*0.3)*dot(d,d)*2.2;
          c=mix(pow(clamp(c,0.0,1.0),vec3(0.41666))*1.055-0.055,c*12.92,vec3(lessThanEqual(c,vec3(0.0031308))));
          gl_FragColor=vec4(c,1.0);}`});
    composer.addPass(FXP);composer.setPixelRatio(renderer.getPixelRatio());composer.setSize(w,h);
  }
  FXon=true;
}
fxSetup();

// ================= Himmel =================
const sky=new THREE.Mesh(new THREE.SphereGeometry((RT&&RT.alp)?16000:4500,32,16),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:SUN},time:{value:0},zenCol:{value:new THREE.Vector3(0.10,0.27,0.60)},horCol:{value:new THREE.Vector3(0.62,0.74,0.86)},sunCol:{value:new THREE.Vector3(1.0,0.85,0.6)},cloudTint:{value:new THREE.Vector3(1,1,1)}},
  vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:[
  'uniform vec3 sunDir;uniform float time;uniform vec3 zenCol,horCol,sunCol,cloudTint;varying vec3 vDir;',
  'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}',
  'float fbm(vec2 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=0.5;}return s;}',
  'void main(){',
  ' vec3 d=normalize(vDir);float h=max(d.y,0.0);',
  ' vec3 zen=zenCol,hor=horCol;',
  ' vec3 col=mix(hor,zen,pow(h,0.45));',
  ' float sd=max(dot(d,sunDir),0.0);',
  ' col+=sunCol*(pow(sd,350.0)*6.0+pow(sd,12.0)*0.25+pow(sd,4.0)*0.3*pow(1.0-h,3.0));',
  ' vec2 uv=d.xz/(h+0.12)*0.9+vec2(time*0.004,0.0);',
  ' float c=fbm(uv*1.2);float cov=smoothstep(0.46,0.72,c);',
  ' float sh=fbm(uv*1.2+sunDir.xz*0.15);',
  ' vec3 cc=mix(vec3(0.50,0.56,0.66),vec3(1.25,1.2,1.15),smoothstep(0.3,0.8,1.0-sh*0.9+sd*0.3));',
  ' cc*=cloudTint;col=mix(col,cc,cov*smoothstep(0.0,0.12,d.y)*0.9);',
  ' col=mix(hor,col,smoothstep(-0.02,0.06,d.y));',
  ' gl_FragColor=vec4(col,1.0);',
  ' #include <tonemapping_fragment>',
  ' #include <encodings_fragment>',
  '}'].join('\n')
}));
sky.frustumCulled=false;scene.add(sky);

// ================= Nachtmodus (Bergkamen): Mond, Sterne, Stadtlichter, Kopflampe, leuchtende Fenster und Laternen =================
const radTex=(c0)=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,c0);r.addColorStop(0.35,c0.replace(/[\d.]+\)$/,'0.35)'));r.addColorStop(1,c0.replace(/[\d.]+\)$/,'0)'));g.fillStyle=r;g.fillRect(0,0,128,128);const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;return t;};
NT.poolTex=MW?radTex('rgba(255,214,150,1)'):null;
if(MW){
  const rr=(()=>{let q=424242;return()=>{q=(q*16807)%2147483647;return q/2147483647;};})();
  {const n=1500,P=new Float32Array(n*3),C=new Float32Array(n*3);for(let i=0;i<n;i++){const y=0.03+rr()*0.97,a=rr()*6.2832,r=Math.sqrt(1-y*y),k=4400;P[i*3]=Math.cos(a)*r*k;P[i*3+1]=y*k;P[i*3+2]=Math.sin(a)*r*k;const b=0.35+0.65*Math.pow(rr(),2.2),t=rr();C[i*3]=b*(t<0.3?1:0.85);C[i*3+1]=b*0.9;C[i*3+2]=b*(t<0.3?0.8:1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('color',new THREE.BufferAttribute(C,3));
    NT.stars=new THREE.Points(g,new THREE.PointsMaterial({size:1.7,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:0.95,depthWrite:false,fog:false}));NT.stars.frustumCulled=false;NT.stars.visible=false;scene.add(NT.stars);}
  {const P=[],C=[];for(let c=0;c<26;c++){const az=rr()*6.2832,sp=0.012+rr()*0.07,cnt=40+(rr()*160|0),warm=rr();for(let i=0;i<cnt;i++){const a=az+(rr()+rr()+rr()-1.5)*sp,el=0.0012+Math.pow(rr(),1.8)*0.014,r=Math.cos(el),k=4300;P.push(Math.sin(a)*r*k,Math.sin(el)*k,Math.cos(a)*r*k);const b=0.5+0.5*rr();C.push(b,b*(0.68+0.25*warm),b*(0.4+0.3*warm));}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
    NT.city=new THREE.Points(g,new THREE.PointsMaterial({size:2.2,sizeAttenuation:false,vertexColors:true,transparent:true,opacity:1,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));NT.city.frustumCulled=false;NT.city.visible=false;scene.add(NT.city);}
  NT.moon=new THREE.Mesh(new THREE.CircleGeometry(95,40),new THREE.MeshBasicMaterial({color:0xf3f1e4,fog:false,depthWrite:false}));NT.moon.visible=false;NT.moon.frustumCulled=false;scene.add(NT.moon);
  NT.halo=new THREE.Mesh(new THREE.PlaneGeometry(1100,1100),new THREE.MeshBasicMaterial({map:radTex('rgba(190,205,255,0.5)'),transparent:true,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));NT.halo.visible=false;NT.halo.frustumCulled=false;scene.add(NT.halo);
  NT.lamp=new THREE.SpotLight(0xfff4e2,22,88,0.3,0.6,1);NT.lamp.visible=false;NT.lamp.shadow.mapSize.set(1024,1024);NT.lamp.shadow.camera.near=0.6;NT.lamp.shadow.camera.far=110;NT.lamp.shadow.bias=-0.0006;scene.add(NT.lamp);NT.lampT=new THREE.Object3D();scene.add(NT.lampT);NT.lamp.target=NT.lampT;
  NT.flood=new THREE.SpotLight(0xffecd0,3.4,30,0.9,0.8,1.2);NT.flood.visible=false;scene.add(NT.flood);NT.floodT=new THREE.Object3D();scene.add(NT.floodT);NT.flood.target=NT.floodT;
}
function nightSky(u){   // wird am Ende von applySun aufgerufen: Nacht ueberschreibt Licht, Himmel und Dunst
  if(!MW)return;
  if(scene.environment)NT.env=scene.environment;
  if(!NIGHT){if(NT.env&&scene.environment!==NT.env)scene.environment=NT.env;return;}
  SUN.set(-0.35,0.62,0.7).normalize();
  sun.color.setRGB(0.5,0.6,0.95);sun.intensity=0.2;
  hemi.color.setRGB(0.1,0.13,0.26);hemi.groundColor.setRGB(0.035,0.04,0.06);hemi.intensity=0.55;
  renderer.toneMappingExposure=1.15;
  u.horCol.value.set(0.035,0.055,0.11);u.zenCol.value.set(0.004,0.009,0.032);u.sunCol.value.set(0.55,0.6,0.8);u.cloudTint.value.set(0.05,0.06,0.1);
  scene.fog.color.setRGB(0.025,0.035,0.07);if(scene.background&&scene.background.isColor)scene.background=new THREE.Color(0.025,0.035,0.07);
  scene.environment=null;WXS.day=0.12;
}
function nightApply(){
  document.body.classList.toggle('night',NIGHT);
  [NT.stars,NT.city,NT.moon,NT.halo].forEach(o=>{if(o)o.visible=NIGHT;});
  if(NT.stars)NT.stars.material.opacity=WX?0.15:0.95;if(NT.city)NT.city.material.opacity=WX?0.45:1;
  if(NT.lamp){NT.lamp.visible=NIGHT;NT.lamp.castShadow=NIGHT&&quality>1;NT.flood.visible=NIGHT;}
  NT.emi.forEach(m=>{m.emissiveIntensity=NIGHT?m.userData.nI:m.userData.dI;});
  NT.pools.forEach(p=>{p.visible=NIGHT;});
  if(window.__pudM){const w=window.__pudM;   // Pfuetzen nachts: leicht aufgerauht, damit die Stirnlampe ein breites Glanzlicht erzeugt, und mit schwachem Himmelsschimmer
    w.roughness=NIGHT?0.1:0.015;w.color.setHex(NIGHT?0x2c3340:0x1f1c18);w.emissive.setHex(NIGHT?0x101a2c:0x000000);w.envMapIntensity=NIGHT?4.2:2.4;w.opacity=NIGHT?0.97:0.93;}
  if(NT.bloom){NT.bloom.strength=NIGHT?0.75:0.14;NT.bloom.threshold=NIGHT?0.7:0.93;NT.bloom.radius=NIGHT?0.7:0.55;}
  sun.castShadow=quality>1&&!NIGHT;
  applySun(true);hintHud.k=null;
}
const _nd=new THREE.Vector3();
function nightFrame(){
  if(!NT.lamp)return;
  const cp=camera.position;
  if(NIGHT){   // im Wald deutlich dunkler (Kronendach), in der Stadt heller (Streulicht von Laternen und Fenstern)
    const fd=forestD(cp.x,cp.z),ur=NT.houseNear&&NT.houseNear(cp.x,cp.z,50)?1:0;NT.fd=(NT.fd===undefined?fd:NT.fd+(fd-NT.fd)*0.04);NT.ur=(NT.ur===undefined?ur:NT.ur+(ur-NT.ur)*0.04);
    hemi.intensity=0.16+0.34*(1-NT.fd)+0.24*NT.ur*(1-0.6*NT.fd);sun.intensity=0.06+0.18*(1-NT.fd);
    renderer.toneMappingExposure=1.15+0.1*NT.ur;
    NT.lamp.intensity=22*(1+0.15*NT.fd);}
  NT.stars.position.copy(cp);NT.city.position.copy(cp);
  NT.moon.position.copy(cp).addScaledVector(SUN,4200);NT.moon.lookAt(cp);NT.halo.position.copy(cp).addScaledVector(SUN,4150);NT.halo.lookAt(cp);
  if(!NIGHT)return;
  camera.getWorldDirection(_nd);
  NT.lamp.position.copy(cp);NT.lamp.position.y+=0.05;NT.lampT.position.copy(cp).addScaledVector(_nd,30);NT.lampT.updateMatrixWorld();
  NT.flood.position.copy(NT.lamp.position);NT.floodT.position.copy(cp).addScaledVector(_nd,8);NT.floodT.position.y-=1.2;NT.floodT.updateMatrixWorld();
}
function toggleNight(){if(!MW)return;const want=!NIGHT;   // manuell an/aus; bei Auto-Nacht (Tageszeit Live) schaltet L die Nacht bis zum Tag ab
  if(want){NIGHT_MAN=true;NIGHT_SUP=false;}else{NIGHT_MAN=false;if(NIGHT_AUTO){NIGHT_AUTO=false;NIGHT_SUP=true;}}
  NIGHT=want;try{localStorage.setItem('miworu_night',NIGHT_MAN?'1':'0');}catch(_){}nightApply();toastEl.textContent='Nightride: '+(NIGHT?'an':'aus');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1200);}

// Sonnenstand nach Uhrzeit (nur Bergkamen). Nie dunkler als leichte Daemmerung: unter ~5 Grad Sonnenhoehe bleibt das Licht auf diesem Niveau.
// Test: ?zeit=7.5 (Uhrzeit in Stunden, lokale Zeit)
let _sunMin=-1,TODM=0,TODUTC=null,NIGHT_MAN=NIGHT,NIGHT_AUTO=false,NIGHT_SUP=false;const TODN=['Live','Morgen','Mittag','Abend','Dämmerung'];
function applySun(force){
  if(!BK)return;
  const d=new Date(),mn=Math.floor(d.getTime()/60000);if(!force&&mn===_sunMin)return;_sunMin=mn;
  let utc=d.getUTCHours()+d.getUTCMinutes()/60;
  const zp=new URLSearchParams(location.search).get('zeit');if(zp!==null&&!isNaN(+zp))utc=+zp+d.getTimezoneOffset()/60;if(TODUTC!==null)utc=TODUTC;
  const doy=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/864e5);
  const phi=51.6*Math.PI/180,dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+doy)/365),H=((utc+7.6/15)%24-12)*15*Math.PI/180;
  const sa=Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H),alt=Math.asin(clamp(sa,-1,1));
  let A=Math.acos(clamp((Math.sin(dec)-Math.sin(phi)*sa)/(Math.cos(phi)*Math.cos(alt)+1e-6),-1,1));if(H>0)A=2*Math.PI-A;   // Azimut ab Nord, im Uhrzeigersinn
  const altE=Math.max(alt,((AMB_SUNNY&&TODM===0)?12:2.5)*Math.PI/180),ca=Math.cos(altE);   // Sonnig: Sonne nie unter 12 Grad
  SUN.set(ca*Math.sin(A),Math.sin(altE),-ca*Math.cos(A)).normalize();
  const deg=(AMB_SUNNY&&TODM===0)?Math.max(alt*180/Math.PI,12):alt*180/Math.PI,low=1-sstep(8,40,deg),tw=sstep(-6,9,deg);   // low: tiefe Sonne (warm), tw: 1 = Tag, 0 = Daemmerung
  {   // Tageszeit Live: nach Sonnenuntergang automatisch Nightride-Look (mit Hysterese), morgens zurueck
    let a=NIGHT_AUTO;if(!(TODM===0&&TODUTC===null))a=false;else if(deg>-3){a=false;NIGHT_SUP=false;}else if(deg<-5&&!NIGHT_SUP)a=true;
    if(a!==NIGHT_AUTO){NIGHT_AUTO=a;const n=NIGHT_MAN||NIGHT_AUTO;if(n!==NIGHT){NIGHT=n;nightApply();return;}}}
  const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  let sc=mixc([1.0,0.9,0.78],[1.0,0.46,0.2],low);sc=mixc([0.7,0.4,0.55],sc,tw);
  const inten=(0.95+1.55*sstep(4,30,deg))*(0.72+0.28*tw);
  sun.color.setRGB(sc[0],sc[1],sc[2]);sun.intensity=Math.max(0.85+0.5*tw,inten);
  let hs=mixc([0.72,0.84,1.0],[0.88,0.72,0.66],low*0.7);hs=mixc([0.46,0.52,0.78],hs,tw);
  hemi.color.setRGB(hs[0],hs[1],hs[2]);hemi.groundColor.setRGB(0.34-0.1*(1-tw),0.31-0.1*(1-tw),0.22-0.02*(1-tw));hemi.intensity=0.8*(0.74+0.26*tw);
  renderer.toneMappingExposure=0.95*(1.0+0.12*(1-tw));
  let hor=mixc([0.62,0.74,0.86],[0.96,0.54,0.36],low*0.95);hor=mixc([0.52,0.38,0.6],hor,tw);
  let zen=mixc([0.10,0.27,0.60],[0.14,0.25,0.52],low);zen=mixc([0.10,0.12,0.34],zen,tw);
  const u=sky.material.uniforms;u.horCol.value.set(hor[0],hor[1],hor[2]);u.zenCol.value.set(zen[0],zen[1],zen[2]);u.sunCol.value.set(sc[0],sc[1]*0.95,sc[2]*0.85);
  const ct=mixc([1,0.82,0.7],[1,1,1],1-low);u.cloudTint.value.set(ct[0]*(0.75+0.25*tw),ct[1]*(0.78+0.22*tw),ct[2]*(0.85+0.15*tw));
  scene.fog.color.setRGB(hor[0],hor[1],hor[2]);scene.background=scene.background&&scene.background.isColor?new THREE.Color(hor[0],hor[1],hor[2]):scene.background;
  // Wetter: Nebel/Nieselregen nehmen Sonne und Farbe, Himmel und Dunst werden grau
  WXS.day=tw;WXS.rain=WX===2?1:0;
  if(WX){const g=WX===1?0.74:(STORM()?0.27:0.5),k=WX===1?0.75:0.85,gr=[g*(0.9+0.1*tw),g*(0.92+0.08*tw),g*(0.96+0.04*tw)];
    const gm=(c)=>[c[0]+(gr[0]-c[0])*k,c[1]+(gr[1]-c[1])*k,c[2]+(gr[2]-c[2])*k];
    const h2=gm(hor),z2=gm(WX===1?[gr[0]*0.95,gr[1]*0.97,gr[2]]:[gr[0]*0.7,gr[1]*0.72,gr[2]*0.78]);
    u.horCol.value.set(h2[0],h2[1],h2[2]);u.zenCol.value.set(z2[0],z2[1],z2[2]);u.cloudTint.value.set(gr[0],gr[1],gr[2]);if(WX===2)u.sunCol.value.set(0,0,0);else u.sunCol.value.set(gr[0],gr[1],gr[2]);   // Regen: keine Sonnenscheibe, kein Himmelsglimmen
    scene.fog.color.setRGB(h2[0],h2[1],h2[2]);scene.background=new THREE.Color(h2[0],h2[1],h2[2]);
    if(WX===2){sun.color.setRGB(gr[0],gr[1],gr[2]);sun.intensity=0.1;hemi.intensity=STORM()?hemi.intensity*0.92+0.04:hemi.intensity*1.18+0.1;sun.castShadow=false;}   // Regen: keine Sonne, keine Schatten, nur diffuses Licht
    else{sun.intensity*=0.42;hemi.intensity*=1.15;}
  }
  if(WX!==2&&!NIGHT)sun.castShadow=quality>1;
  if(SEA.win.value&&WX===0){   // Winter/Schneefall: gedaempftes, weissgraues Licht, Himmel verwaschen
    const wk=SEA.win.value*0.55,wh=mixc(hor,[0.80,0.84,0.90],wk),wz=mixc(zen,[0.52,0.58,0.70],wk*0.9);
    u.horCol.value.set(wh[0],wh[1],wh[2]);u.zenCol.value.set(wz[0],wz[1],wz[2]);u.sunCol.value.multiplyScalar(0.5);u.cloudTint.value.set(0.92,0.94,0.98);
    scene.fog.color.setRGB(wh[0],wh[1],wh[2]);scene.background=scene.background&&scene.background.isColor?new THREE.Color(wh[0],wh[1],wh[2]):scene.background;
    sun.intensity*=0.62;hemi.intensity*=1.12;
  }
  if(MW)nightSky(u);
  scene.fog.density=[0,0.0009,0.00055,0.0004][QE()]*[1,5,2.2][WX]*(STORM()?1.5:1)*(NIGHT?1.35:1)*((RT&&RT.alp)?0.32:1)*(1+SEA.win.value*0.7);
  {let mn=1e9,mx=-1e9;for(let i=0;i<=N;i+=4){mn=Math.min(mn,PY[i]);mx=Math.max(mx,PY[i]);}GF.value.y=mn+(mx-mn)*0.35+5;GF.value.z=20;
   GF.value.x=((NIGHT?0.2:(H<0?0.85:0.3)*(1-sstep(2,22,deg)))*(TODM===2?0:1))*(WX===1?0.4:1)+SEA.win.value*0.12;}
  window.__sun={alt:deg,az:A*180/Math.PI,utc:utc};
}
if(BK)applySun(true);

// ================= Foto-Assets (optional; ohne Dateien bleibt alles prozedural) =================
const ASSETS=import.meta.env.BASE_URL+'assets/';
const TL=new THREE.TextureLoader();
function photo(id,karte,srgb,cb){
  TL.load(ASSETS+'textures/'+id+'/'+karte+'.jpg',t=>{
    if(IOSX&&t.image&&t.image.width>1024){try{const c=document.createElement('canvas');c.width=c.height=1024;c.getContext('2d').drawImage(t.image,0,0,1024,1024);t.image=c;}catch(e){}}   // iPad: Texturen auf 1024 verkleinern (spart rund drei Viertel des Speichers)
    t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=IOSX?2:8;if(srgb)t.encoding=THREE.sRGBEncoding;cb(t);},undefined,()=>{});
}
function applyPhoto(mat,id,rx,ry,o){
  o=o||{};
  photo(id,'Diffuse',true,t=>{t.repeat.set(rx,ry);mat.map=t;if(o.color)mat.color.copy(o.color);mat.needsUpdate=true;if(o.onDiffuse)o.onDiffuse();});
  if(o.normal!==false)photo(id,'nor_gl',false,t=>{t.repeat.set(rx,ry);mat.normalMap=t;if(o.normalScale)mat.normalScale.set(o.normalScale,o.normalScale);mat.needsUpdate=true;});
  if(o.arm)photo(id,'arm',false,t=>{t.repeat.set(rx,ry);mat.roughnessMap=t;mat.roughness=1;if(o.ao){mat.aoMap=t;}mat.needsUpdate=true;});
}
// Himmelspanorama: Hintergrund, Umgebungslicht, Sonnenrichtung und Dunstfarbe kommen aus dem HDR
new RGBELoader().load(ASSETS+'hdri/kloofendal_48d_partly_cloudy_puresky.hdr',tex=>{
  const d=tex.image.data,w=tex.image.width,h=tex.image.height;
  let best=-1,bx=0,by=0;
  for(let y=0;y<h/2;y+=2)for(let x=0;x<w;x+=2){const k=(y*w+x)*4,l=Math.max(d[k],d[k+1],d[k+2])*Math.pow(2,d[k+3]-136);if(l>best){best=l;bx=x;by=y;}}
  const v=1-(by+0.5)/h,u=(bx+0.5)/w,lat=(v-0.5)*Math.PI,lon=(u-0.5)*2*Math.PI;
  if(!BK)SUN.set(Math.cos(lon)*Math.cos(lat),Math.max(0.35,Math.sin(lat)),Math.sin(lon)*Math.cos(lat)).normalize();
  let r=0,g=0,b=0,n=0;const yy=Math.floor(h*0.485);
  for(let x=0;x<w;x+=8){const k=(yy*w+x)*4,f=Math.pow(2,d[k+3]-136);r+=d[k]*f;g+=d[k+1]*f;b+=d[k+2]*f;n++;}
  const hc=new THREE.Color(Math.min(1.2,r/n),Math.min(1.2,g/n),Math.min(1.2,b/n));
  if(!BK)scene.fog.color.copy(hc);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  const pm=new THREE.PMREMGenerator(renderer);
  scene.environment=pm.fromEquirectangular(tex).texture;pm.dispose();
  if(!BK){HDRTEX=tex;scene.background=tex;sky.visible=false;}
  hemi.intensity=0.5;if(BK)applySun(true);else{WXB.sun=undefined;applyWXOther();}
  scene.traverse(o=>{const m=o.material;if(m&&m.isMeshStandardMaterial&&!(m.userData&&m.userData.keepEnv))m.envMapIntensity=0.28;});
  window.__hdr={sun:SUN.toArray(),fog:hc.toArray(),best:best};
},undefined,()=>{});

// ================= Texturen (prozedural) =================
function canvasTex(w,h,draw,rep){
  const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.anisotropy=8;
  if(rep){t.wrapS=t.wrapT=THREE.RepeatWrapping;}
  return t;
}
function speckle(g,w,h,n,cols,smin,smax){
  for(let i=0;i<n;i++){g.fillStyle=cols[(rnd()*cols.length)|0];const s=smin+rnd()*(smax-smin);g.fillRect(rnd()*w,rnd()*h,s,s);}
}
const texGround=canvasTex(512,512,(g,w,h)=>{
  g.fillStyle='#d2d2d2';g.fillRect(0,0,w,h);
  for(let i=0;i<260;i++){g.fillStyle='rgba('+(rnd()<0.5?'255,255,255':'90,90,90')+','+(0.05+rnd()*0.08)+')';g.beginPath();g.arc(rnd()*w,rnd()*h,10+rnd()*40,0,7);g.fill();}
  speckle(g,w,h,26000,['#f2f2f2','#b4b4b4','#9a9a9a','#e4e4e4','#c0c0c0'],1,3);
  g.lineWidth=1;
  for(let i=0;i<5000;i++){g.strokeStyle=rnd()<0.5?'rgba(255,255,255,0.35)':'rgba(70,70,70,0.3)';const x=rnd()*w,y=rnd()*h;g.beginPath();g.moveTo(x,y);g.lineTo(x+(rnd()-0.5)*5,y-3-rnd()*6);g.stroke();}
},true);
const texAsphalt=canvasTex(256,512,(g,w,h)=>{
  g.fillStyle='#4b4b4d';g.fillRect(0,0,w,h);
  speckle(g,w,h,16000,['#3b3b3d','#59595b','#666668','#303032','#505052'],1,2.6);
  g.fillStyle='rgba(135,135,130,0.10)';g.fillRect(w*0.2,0,w*0.2,h);g.fillRect(w*0.6,0,w*0.2,h);
  g.fillStyle='rgba(120,108,84,0.45)';g.fillRect(0,0,9,h);g.fillRect(w-9,0,9,h);
  speckle(g,18,h,900,['#7a7260','#8c846e','#5c5648'],1,3);
  g.save();g.translate(w-18,0);speckle(g,18,h,900,['#7a7260','#8c846e','#5c5648'],1,3);g.restore();
  g.strokeStyle='rgba(20,20,20,0.6)';g.lineWidth=1.2;
  for(let i=0;i<7;i++){let x=rnd()*w,y=rnd()*h;g.beginPath();g.moveTo(x,y);for(let k=0;k<9;k++){x+=(rnd()-0.5)*26;y+=rnd()*22;g.lineTo(x,y);}g.stroke();}
},true);
const texDirt=canvasTex(256,512,(g,w,h)=>{
  g.fillStyle='#6a5136';g.fillRect(0,0,w,h);
  const cg=g.createLinearGradient(0,0,w,0);cg.addColorStop(0.2,'rgba(40,28,18,0)');cg.addColorStop(0.5,'rgba(40,28,18,0.55)');cg.addColorStop(0.8,'rgba(40,28,18,0)');
  g.fillStyle=cg;g.fillRect(0,0,w,h);
  speckle(g,w,h,22000,['#735a3e','#59432c','#80684c','#4a3723','#8a7860'],1,2.5);
  g.globalCompositeOperation='destination-in';
  const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'rgba(0,0,0,0)');ag.addColorStop(0.28,'rgba(0,0,0,1)');ag.addColorStop(0.72,'rgba(0,0,0,1)');ag.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=ag;g.fillRect(0,0,w,h);
},true);
const texLeaf=canvasTex(512,512,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  const clumps=[];
  for(let i=0;i<95;i++){const an=rnd()*6.283,rr=Math.sqrt(rnd())*178;clumps.push([256+Math.cos(an)*rr,262+Math.sin(an)*rr*0.92]);}
  clumps.sort((a,b)=>b[1]-a[1]);
  clumps.forEach((c,ci)=>{
    for(let i=0;i<85;i++){
      const an=rnd()*6.283,rr=Math.sqrt(rnd())*34,x=c[0]+Math.cos(an)*rr,y=c[1]+Math.sin(an)*rr*0.8;
      const up=1-(y-(c[1]-28))/56;
      const lt=9+rnd()*9+up*13+(1-c[1]/512)*7;
      g.fillStyle='hsl('+(82+rnd()*30)+','+(30+rnd()*18)+'%,'+lt+'%)';
      g.save();g.translate(x,y);g.rotate(rnd()*6.283);g.beginPath();g.ellipse(0,0,4+rnd()*4,2+rnd()*2,0,0,6.283);g.fill();g.restore();
    }
  });
},false);
const texGrass=canvasTex(128,128,(g,w,h)=>{
  g.clearRect(0,0,w,h);
  for(let i=0;i<110;i++){
    const x=6+rnd()*116,hh=34+rnd()*86,dx=(rnd()-0.5)*(18+hh*0.45),bw=0.9+rnd()*1.5,dry=rnd()<0.18;
    const gr=g.createLinearGradient(0,128,0,128-hh);
    if(dry){gr.addColorStop(0,'hsl(48,28%,28%)');gr.addColorStop(1,'hsl(46,38%,52%)');}
    else{const hu=70+rnd()*28;gr.addColorStop(0,'hsl('+hu+',38%,13%)');gr.addColorStop(1,'hsl('+(hu-6)+',44%,'+(30+rnd()*14)+'%)');}
    g.fillStyle=gr;g.beginPath();g.moveTo(x-bw,128);
    g.quadraticCurveTo(x-bw*0.6+dx*0.15,128-hh*0.55,x+dx,128-hh);
    g.quadraticCurveTo(x+bw*0.6+dx*0.15,128-hh*0.55,x+bw,128);g.closePath();g.fill();
  }
},false);
const texConcrete=canvasTex(256,256,(g,w,h)=>{
  g.fillStyle='#b9b6ae';g.fillRect(0,0,w,h);
  speckle(g,w,h,9000,['#c6c3bb','#aaa79f','#b0ada5','#cfccc4'],1,3);
  g.strokeStyle='rgba(60,60,58,0.7)';g.lineWidth=2;g.strokeRect(1,1,w-2,h-2);g.beginPath();g.moveTo(w/2,0);g.lineTo(w/2,h);g.stroke();
},true);
const texFields=canvasTex(1024,1024,(g,w,h)=>{
  g.fillStyle='#62803a';g.fillRect(0,0,w,h);
  const pal=['#6f8a3c','#8a9a4a','#b8a85a','#7a6a44','#4f7030','#9aa860','#c2b46a','#577a36','#a39a58'];
  for(let i=0;i<170;i++){g.save();g.translate(rnd()*w,rnd()*h);g.rotate((rnd()-0.5)*0.5);g.fillStyle=pal[(rnd()*pal.length)|0];g.fillRect(-60,-40,50+rnd()*130,30+rnd()*90);g.restore();}
  for(let i=0;i<90;i++){g.fillStyle='rgba(38,62,28,0.9)';g.beginPath();g.ellipse(rnd()*w,rnd()*h,8+rnd()*40,6+rnd()*22,rnd()*3,0,6.283);g.fill();}
  speckle(g,w,h,20000,['rgba(255,255,255,0.05)','rgba(0,0,0,0.06)'],2,5);
},true);
function textTex(txt,bg,fg){
  return canvasTex(512,128,(g,w,h)=>{g.fillStyle=bg;g.fillRect(0,0,w,h);g.fillStyle=fg;g.font='bold 76px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText(txt,w/2,h/2+4);},false);
}

await BOOT('Baue Gelände …',25);
// ================= Gelände =================
const cNeedle=L3(0x4d3b27),cLeaf=L3(0x5e4a2e),cMoss=L3(0x4a5a2a),cGrassA=L3(0x5f7d34),cGrassB=L3(0x84903f),cDry=L3(0xa39a5c),cForest=L3(0x3d4a25),cGravel=L3(0x837c6d),cDirt=L3(0x5c4730),cRough=L3(0x2b2019),cLitter=L3(0x4b3a22),cSoil=L3(0x6a4f33),cStoneG=L3(0x77726a),cField=L3(0x6d8a3e),cUrban=L3(0x8f9180),cWater=L3(0x3b5f70);
function forestD(x,z){
  if(ROUTE){
    let f=sstep(0.05,0.2,routePresence(x,z))*(sstep(0.26,0.42,fbm(x/90+3,z/90+9))*0.7+0.3);
    if(LU)f=lerp(f,Math.min(1,lu(LU.FD,x,z)*(0.92+0.2*sstep(0.25,0.55,fbm(x/30+2,z/30+6)))),lu(LU.K,x,z));
    return f*(1-0.6*sstep(40,66,baseH(x,z)));      // oben auf der Halde offener
  }
  const r=Math.hypot(x,z);
  let f=sstep(RTOP+18,RTOP+95,r)*(1-sstep(RBASE+110,RBASE+210,r));
  f*=sstep(0.34,0.5,fbm(x/90+3,z/90+9))*0.85+0.15;
  return f;
}
(function buildTerrain(){
  const G=4,X0=ROUTE?FG.ox:-660,Z0=ROUTE?FG.oz:-660;
  const nx=ROUTE?Math.floor((FG.nx-1)*FG.G/G):330,nz=ROUTE?Math.floor((FG.nz-1)*FG.G/G):330,VX=nx+1,VZ=nz+1;
  const dopM=new Float32Array(VX*VZ).fill(1),pos=new Float32Array(VX*VZ*3),col=new Float32Array(VX*VZ*3),col2=new Float32Array(VX*VZ*3),uv=new Float32Array(VX*VZ*2);
  const put=(x,z,P,C,C2,U,M,vi)=>{
      const r=Math.hypot(x,z);
      const h=gnd(x,z);
      const found=nI>=0&&nD<OUTR[nI]+4,d=nD,i=nI;
      P[vi*3]=x;P[vi*3+1]=h;P[vi*3+2]=z;
      U[vi*2]=x/7;U[vi*2+1]=z/7;
      if(found&&d<HW[i]+3)M[vi]=d<HW[i]+1.2?0.15:0.42;   // Wegnaehe: Luftbild nur schwach (Wegfarbe/Randbewuchs)
      let c=mix3(cGrassA,cGrassB,fbm(x/22+1,z/22+4));
      if(ROUTE){
        c=mix3(c,cDry,0.3*fbm(x/40+8,z/40)+0.35*sstep(38,64,h));
        {const fd=forestD(x,z);   // Waldboden: Laub bzw. Nadelstreu, dazwischen etwas Moos, nur selten Gras
          const n1=fbm(x/3.2+4,z/3.2),n2=fbm(x/11+9,z/11+2),conif=(RT&&['wuppertal','hagen','iserlohn','hemer'].indexOf(RT.dem)>=0)?0.85:0.35;
          let lit=mix3(cLeaf,cNeedle,clamp(conif+(n2-0.5)*0.8,0,1));lit=mix3(lit,cMoss,sstep(0.6,0.75,n1)*0.55);const kk=0.8+0.4*fbm(x/0.9,z/0.9);lit=[lit[0]*kk,lit[1]*kk,lit[2]*kk];
          c=mix3(c,lit,fd*0.9);M[vi]=Math.min(M[vi],1-0.7*fd);}
        c=mix3(c,cField,(1-sstep(0.04,0.22,routePresence(x,z)))*(1-(LU?lu(LU.K,x,z):0)));
        if(LU){c=mix3(c,cField,lu(LU.OP,x,z)*0.75);c=mix3(c,cUrban,lu(LU.UR,x,z)*0.85);c=mix3(c,cWater,lu(LU.WA,x,z)*0.95);}
      }else{
        c=mix3(c,cDry,0.55*(1-sstep(RTOP+30,RTOP+130,r))*sstep(RTOP-2,RTOP+6,r)+0.25*fbm(x/40+8,z/40));
        c=mix3(c,cForest,forestD(x,z)*0.85);
        c=mix3(c,cField,sstep(RBASE+170,RBASE+260,r));
      }
      if(found){
        if(SURF[i]===2)c=mix3(c,cDirt,(1-sstep(HW[i]*0.9,HW[i]+0.9,d))*0.9);   // Trail: schmale Spur (rund 1,5 m)
        else if(ROUTE&&SURF[i]===1)c=mix3(c,cDirt,(1-sstep(HW[i],HW[i]+2.2,d))*0.8);
        else c=mix3(c,cGravel,(1-sstep(HW[i]+0.4,HW[i]+2.8,d))*0.9);
      }
      if(found&&ROUTE&&GR[i]<-12){c=mix3(c,cDirt,(1-sstep(SURF[i]===2?HW[i]*0.9:HW[i]+0.5,SURF[i]===2?HW[i]+0.9:HW[i]+3.4,d))*0.9);M[vi]=Math.min(M[vi],0.12);}   // steile Abfahrt: Weg/Boeschung immer als Erde, nie als gruene Flaeche
      if(found&&STEEP[i]>0.02){   // steile Abfahrt: Laubstreu, nackte Erde, Steinflecken statt einheitlich dunkel
        const wR=STEEP[i]*(1-sstep(HW[i]*(SURF[i]===2?0.8:0.9),HW[i]+(SURF[i]===2?1.0:3.4),d));
        const n1=fbm(x/0.8+5,z/0.8),n2=fbm(x/2.4,z/2.4+7),n3=fbm(x/0.35,z/0.35);
        let b=mix3(cLitter,cSoil,sstep(0.35,0.62,n2));
        b=mix3(b,cStoneG,sstep(0.52,0.68,n1)*0.85);
        const k=0.78+0.5*n3;b=[b[0]*k,b[1]*k,b[2]*k];
        c=mix3(c,b,Math.min(1,wR*(0.8+0.3*n2)));
      }
      C2[vi*3]=Math.min(1.6,c[0]/0.50);C2[vi*3+1]=Math.min(1.6,c[1]/0.42);C2[vi*3+2]=Math.min(1.6,c[2]/0.20);
      C[vi*3]=c[0];C[vi*3+1]=c[1];C[vi*3+2]=c[2];
  };
  for(let iz=0;iz<VZ;iz++)for(let ix=0;ix<VX;ix++)put(X0+ix*G,Z0+iz*G,pos,col,col2,uv,dopM,iz*VX+ix);
  const idx=new Uint32Array(nx*nz*6);let k=0;
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
    const a=iz*VX+ix,b=a+1,c2=a+VX,d2=c2+1;
    idx[k++]=a;idx[k++]=c2;idx[k++]=b;idx[k++]=b;idx[k++]=c2;idx[k++]=d2;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(new THREE.BufferAttribute(idx,1));
  g.computeVertexNormals();
  const slopeDirt=(g,pos,col,col2,dopM,cnt)=>{   // steile Hänge: Erde/Geröll statt Rasen (Böschungen wirken gewachsen statt tapeziert)
    const nr=g.attributes.normal.array;
    for(let v=0;v<cnt;v++){
      const ny=nr[v*3+1],t=sstep(0.93,0.8,ny)*0.7*(0.6+0.8*fbm(pos[v*3]/3,pos[v*3+2]/3));
      dopM[v]=Math.min(dopM[v],1-Math.min(1,t*2));
      if(t<=0.01)continue;
      const e=mix3([col[v*3],col[v*3+1],col[v*3+2]],cDirt,Math.min(1,t));
      col[v*3]=e[0];col[v*3+1]=e[1];col[v*3+2]=e[2];
      col2[v*3]=Math.min(1.6,e[0]/0.50);col2[v*3+1]=Math.min(1.6,e[1]/0.42);col2[v*3+2]=Math.min(1.6,e[2]/0.20);
    }
    g.attributes.color.needsUpdate=true;
  };
  slopeDirt(g,pos,col,col2,dopM,VX*VZ);
  const tm=new THREE.MeshStandardMaterial({map:texGround,vertexColors:true,roughness:1,metalness:0});seaPatch(tm,'gnd',false);
  // In Kacheln zerlegt (je 40x40 Zellen = 160 m), damit nur sichtbare Gelaendestuecke gezeichnet werden (Frustum-Culling)
  const CH=40,chunks=[],col2A=new THREE.BufferAttribute(col2,3),FINES=[];
  const dopApply=(pos,col,col2,M,cnt)=>{   // Luftbild: Farbton vom Foto, Helligkeit/Struktur bleiben vom Spiel
    for(let v=0;v<cnt;v++){
      if(M[v]<=0.02)continue;
      const s=dopAt(pos[v*3],pos[v*3+2],M[v]<0.9?1:2);if(!s)continue;
      const lt=0.3*col[v*3]+0.59*col[v*3+1]+0.11*col[v*3+2],ld=0.3*s[0]+0.59*s[1]+0.11*s[2]+1e-3,k=Math.max(0.6,Math.min(1.6,lt/ld));
      const e=mix3([col[v*3],col[v*3+1],col[v*3+2]],[s[0]*k,s[1]*k,s[2]*k],0.55*M[v]);
      col[v*3]=e[0];col[v*3+1]=e[1];col[v*3+2]=e[2];
      col2[v*3]=Math.min(1.6,e[0]/0.50);col2[v*3+1]=Math.min(1.6,e[1]/0.42);col2[v*3+2]=Math.min(1.6,e[2]/0.20);
    }
  };
  DOPHOOK.push(()=>{
    dopApply(pos,col,col2,dopM,VX*VZ);g.attributes.color.needsUpdate=true;col2A.needsUpdate=true;
    FINES.forEach(f=>{dopApply(f.P,f.C,f.C2,f.M,f.cnt);f.ca.needsUpdate=true;f.c2a.needsUpdate=true;});
  });
  // Feines Netz (2 m statt 4 m) in Streckennaehe (nur Bergkamen): Wegraender, Boeschungen, Rinnen werden schaerfer
  const GF=2,SUB=10,FINE=ROUTE&&!CUS&&useDem,fineMemo=new Map();
  const isFine=(sx,sz)=>{      // Teilkachel (10x10 Zellen = 40 m) liegt nahe der Strecke?
    const key=sx+','+sz;if(fineMemo.has(key))return fineMemo.get(key);
    let f=false;
    if(FINE&&sx>=0&&sz>=0&&sx*SUB<nx&&sz*SUB<nz){
      for(let a=0;a<=2&&!f;a++)for(let b=0;b<=2&&!f;b++){const x=X0+(sx*SUB+a*SUB/2)*G,z=Z0+(sz*SUB+b*SUB/2)*G;if(nearest(allHash,x,z)&&nD<30)f=true;}
    }
    fineMemo.set(key,f);return f;
  };
  const addChunk=(cg,c2a)=>{chunks.push({g:cg,c2:c2a});const m=new THREE.Mesh(cg,tm);m.receiveShadow=true;scene.add(m);TERR.push(m);};
  const coarseChunk=(cx,cz,ex,ez)=>{
    const ia=new Uint32Array((ex-cx)*(ez-cz)*6);let kk=0,y0=1e9,y1=-1e9;
    for(let iz=cz;iz<ez;iz++)for(let ix=cx;ix<ex;ix++){const a=iz*VX+ix,b=a+1,c2=a+VX,d2=c2+1;ia[kk++]=a;ia[kk++]=c2;ia[kk++]=b;ia[kk++]=b;ia[kk++]=c2;ia[kk++]=d2;}
    for(let iz=cz;iz<=ez;iz+=4)for(let ix=cx;ix<=ex;ix+=4){const y=pos[(iz*VX+ix)*3+1];if(y<y0)y0=y;if(y>y1)y1=y;}
    const cg=new THREE.BufferGeometry();cg.setAttribute('position',g.attributes.position);cg.setAttribute('normal',g.attributes.normal);cg.setAttribute('color',g.attributes.color);cg.setAttribute('uv',g.attributes.uv);
    cg.setIndex(new THREE.BufferAttribute(ia,1));
    const mx=X0+(cx+ex)/2*G,mz=Z0+(cz+ez)/2*G,my=(y0+y1)/2,rad=Math.hypot((ex-cx)*G/2,(ez-cz)*G/2,(y1-y0)/2+4);
    cg.boundingSphere=new THREE.Sphere(new THREE.Vector3(mx,my,mz),rad);cg.boundingBox=new THREE.Box3(new THREE.Vector3(X0+cx*G,y0-2,Z0+cz*G),new THREE.Vector3(X0+ex*G,y1+2,Z0+ez*G));
    addChunk(cg,col2A);
  };
  const fineChunk=(sx,sz,cx,cz,ex,ez)=>{
    const n=(ex-cx)*G/GF,m=(ez-cz)*G/GF,V=(n+1)*(m+1),P=new Float32Array(V*3),C=new Float32Array(V*3),C2=new Float32Array(V*3),U=new Float32Array(V*2),M=new Float32Array(V).fill(1);
    const wx=X0+cx*G,wz=Z0+cz*G;
    for(let j=0;j<=m;j++)for(let i=0;i<=n;i++)put(wx+i*GF,wz+j*GF,P,C,C2,U,M,j*(n+1)+i);
    // Rand zu groeberen Nachbarn: Mittelpunkte auf die gerade Linie zwischen den Grobpunkten legen (keine Risse)
    const sm=(vi,va,vb)=>{P[vi*3+1]=(P[va*3+1]+P[vb*3+1])/2;};
    if(!isFine(sx-1,sz))for(let j=1;j<m;j+=2)sm(j*(n+1),(j-1)*(n+1),(j+1)*(n+1));
    if(!isFine(sx+1,sz))for(let j=1;j<m;j+=2)sm(j*(n+1)+n,(j-1)*(n+1)+n,(j+1)*(n+1)+n);
    if(!isFine(sx,sz-1))for(let i=1;i<n;i+=2)sm(i,i-1,i+1);
    if(!isFine(sx,sz+1))for(let i=1;i<n;i+=2)sm(m*(n+1)+i,m*(n+1)+i-1,m*(n+1)+i+1);
    const ia=new Uint32Array(n*m*6);let kk=0,y0=1e9,y1=-1e9;
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){const a=j*(n+1)+i,b=a+1,c2=a+n+1,d2=c2+1;ia[kk++]=a;ia[kk++]=c2;ia[kk++]=b;ia[kk++]=b;ia[kk++]=c2;ia[kk++]=d2;}
    for(let v=0;v<V;v++){const y=P[v*3+1];if(y<y0)y0=y;if(y>y1)y1=y;}
    const fg=new THREE.BufferGeometry(),ca=new THREE.BufferAttribute(C,3),c2a=new THREE.BufferAttribute(C2,3);
    fg.setAttribute('position',new THREE.BufferAttribute(P,3));fg.setAttribute('color',ca);fg.setAttribute('uv',new THREE.BufferAttribute(U,2));fg.setIndex(new THREE.BufferAttribute(ia,1));
    fg.computeVertexNormals();slopeDirt(fg,P,C,C2,M,V);
    fg.boundingSphere=new THREE.Sphere(new THREE.Vector3(wx+n*GF/2,(y0+y1)/2,wz+m*GF/2),Math.hypot(n*GF/2,m*GF/2,(y1-y0)/2+2));
    fg.boundingBox=new THREE.Box3(new THREE.Vector3(wx,y0-1,wz),new THREE.Vector3(wx+n*GF,y1+1,wz+m*GF));
    FINES.push({P:P,C:C,C2:C2,M:M,cnt:V,ca:ca,c2a:c2a,g:fg});
    addChunk(fg,c2a);
  };
  for(let cz=0;cz<nz;cz+=CH)for(let cx=0;cx<nx;cx+=CH){
    const ex=Math.min(nx,cx+CH),ez=Math.min(nz,cz+CH);
    let any=false;
    if(FINE)for(let sz=cz/SUB;sz<ez/SUB&&!any;sz++)for(let sx=cx/SUB;sx<ex/SUB;sx++)if(isFine(sx,sz)){any=true;break;}
    if(!any){coarseChunk(cx,cz,ex,ez);continue;}
    for(let sz=cz/SUB;sz<Math.ceil(ez/SUB);sz++)for(let sx=cx/SUB;sx<Math.ceil(ex/SUB);sx++){
      const x0=sx*SUB,z0=sz*SUB,x1=Math.min(ex,x0+SUB),z1=Math.min(ez,z0+SUB);
      if(isFine(sx,sz))fineChunk(sx,sz,x0,z0,x1,z1);else coarseChunk(x0,z0,x1,z1);
    }
  }
  window.__fineChunks=FINES.length;
  window.__terrainChunks=chunks.length;
  applyPhoto(tm,'forrest_ground_01',1.75,1.75,{arm:true,normalScale:1.2,onDiffuse:()=>{chunks.forEach(c=>c.g.setAttribute('color',c.c2));}});
})();
// Alpen: grobes Fern-Gelaende (Bergpanorama), nach Hoehe und Neigung gefaerbt: Wald, Alm, Fels, Schnee
if(FERN_RAW&&RT.alp){(function(){
  const g=FERN_RAW,bin=atob(g.dm),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  const H=new Int16Array(u.buffer),nx=g.nx,nz=g.nz,C=g.cell,NH=g.nhn0;
  const mx0=FG.ox-20,mx1=FG.ox+(FG.nx-1)*FG.G+20,mz0=FG.oz-20,mz1=FG.oz+(FG.nz-1)*FG.G+20;   // Bereich des feinen Netzes: dort kein Fernnetz
  const hy=(i,j)=>H[Math.max(0,Math.min(nz-1,j))*nx+Math.max(0,Math.min(nx-1,i))]/10;   // Meter ueber nhn0 (= Spiel-y)
  const pos=new Float32Array(nx*nz*3),col=new Float32Array(nx*nz*3);
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
    const k=j*nx+i,x=g.x0+i*C,z=g.z0+j*C,y=hy(i,j),el=y+NH;
    pos[k*3]=x;pos[k*3+1]=y-7;pos[k*3+2]=z;
    const sl=Math.hypot(hy(i+1,j)-hy(i-1,j),hy(i,j+1)-hy(i,j-1))/(2*C);   // Neigung (Steigung)
    const n=(Math.sin(x*0.011+z*0.007)+Math.sin(x*0.023-z*0.019)*0.6)*0.5;
    let r,gc,b;
    if(el<2050&&sl<0.75){r=0.12+n*0.02;gc=0.2+n*0.03;b=0.1;}                           // Bergwald (Zirben/Fichten)
    else if(el<2450){const t=Math.min(1,sl/0.8);r=0.30+t*0.12+n*0.03;gc=0.34+t*0.0+n*0.03;b=0.17+t*0.1;}   // Almwiese -> Geroell
    else {const t=Math.min(1,sl/0.9);r=0.40+t*0.04+n*0.03;gc=0.38+n*0.03;b=0.35+n*0.02;}     // Fels
    const sn=Math.max(0,Math.min(1,(el-2750+n*120)/260))*Math.max(0,1-sl/1.1);           // Schnee/Gletscher: hoch und nicht zu steil
    r+=(0.93-r)*sn;gc+=(0.95-gc)*sn;b+=(0.98-b)*sn;
    col[k*3]=r;col[k*3+1]=gc;col[k*3+2]=b;
  }
  const idx=[];
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){
    const cx=g.x0+(i+0.5)*C,cz=g.z0+(j+0.5)*C;if(cx>mx0&&cx<mx1&&cz>mz0&&cz<mz1)continue;
    const a=j*nx+i,b2=a+1,c=a+nx,d=c+1;idx.push(a,c,b2,b2,c,d);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.setIndex(idx);geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({vertexColors:true}));m.frustumCulled=false;scene.add(m);
})();}
// Umland: Felder, Kanal
(function(){
  texFields.repeat.set(5,5);
  const f=new THREE.Mesh(new THREE.PlaneGeometry(10000,10000),new THREE.MeshLambertMaterial({map:texFields}));
  f.rotation.x=-Math.PI/2;f.position.y=-1.5;scene.add(f);
  if(ROUTE){   // Umland-Ebene nie ueber dem Gelaende: sonst schwebt sie als 'gruener See' ueber tiefen Streckenteilen (Halden, Taeler) und man faehrt darunter her
    let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,mn=1e9;for(let i=0;i<N;i++){x0=Math.min(x0,PX[i]);x1=Math.max(x1,PX[i]);z0=Math.min(z0,PZ[i]);z1=Math.max(z1,PZ[i]);}
    for(let x=x0-1500;x<=x1+1500;x+=40)for(let z=z0-1500;z<=z1+1500;z+=40){const h=gnd(x,z);if(h<mn)mn=h;}
    f.position.y=Math.min(-1.5,mn-1.0);
  }
  const w=new THREE.Mesh(new THREE.PlaneGeometry(5000,46),new THREE.MeshStandardMaterial({color:C(0x3b6078),roughness:0.15,metalness:0.1}));
  w.rotation.x=-Math.PI/2;w.position.set(0,-1.35,-930);if(!ROUTE)scene.add(w);
})();

// ================= Wege =================
function ribbon(i0,i1,wScale,mat,vLen,lift){
  const cnt=i1-i0+1,pos=new Float32Array(cnt*6),uv=new Float32Array(cnt*4),cl=new Float32Array(cnt*6),idx=[];
  for(let k=0;k<cnt;k++){
    const i=i0+k,h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),w=HW[i]*wScale;
    pos[k*6]=PX[i]-rx*w;pos[k*6+1]=PY[i]+lift;pos[k*6+2]=PZ[i]-rz*w;
    pos[k*6+3]=PX[i]+rx*w;pos[k*6+4]=PY[i]+lift;pos[k*6+5]=PZ[i]+rz*w;
    if(useDem){      // Wegband liegt auf dem Gelände (kein Schweben über Böschungen oder doppelten Wegen)
      const gl=gnd(pos[k*6],pos[k*6+2])+lift+0.08,gr=gnd(pos[k*6+3],pos[k*6+5])+lift+0.08;
      pos[k*6+1]=Math.min(PY[i]+lift+0.6,Math.max(PY[i]+lift-0.6,gl));pos[k*6+4]=Math.min(PY[i]+lift+0.6,Math.max(PY[i]+lift-0.6,gr));
    }
    uv[k*4]=0;uv[k*4+1]=i*SEG/vLen;uv[k*4+2]=1;uv[k*4+3]=i*SEG/vLen;
    {const sh=1-0.74*STEEP[i];for(let e=0;e<2;e++){cl[k*6+e*3]=sh;cl[k*6+e*3+1]=sh*0.93;cl[k*6+e*3+2]=sh*0.86;}}
    if(k<cnt-1){const a=k*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setAttribute('color',new THREE.BufferAttribute(cl,3));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);return m;
}
const asphaltMat=new THREE.MeshStandardMaterial({map:texAsphalt,roughness:0.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});seaPatch(asphaltMat,'asp',false);
applyPhoto(asphaltMat,'asphalt_02',1,2,{arm:true,color:new THREE.Color(1.1,1.1,1.1)});
if(!ROUTE)ribbon(0,Math.min(N,iTrail+4),1,asphaltMat,8,0.05);
const trailMat=new THREE.MeshStandardMaterial({vertexColors:true,map:texDirt,roughness:1,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});seaPatch(trailMat,'trl',false);
applyPhoto(trailMat,'forest_ground_04',1,1.6,{arm:true,color:new THREE.Color(1.25,1.2,1.15),onDiffuse:()=>{
  trailMat.alphaMap=canvasTex(64,4,(g,w,h)=>{const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'#000');ag.addColorStop(0.2,'#fff');ag.addColorStop(0.8,'#fff');ag.addColorStop(1,'#000');g.fillStyle=ag;g.fillRect(0,0,w,h);},true);
  trailMat.alphaMap.encoding=THREE.LinearEncoding;trailMat.needsUpdate=true;}});
if(!ROUTE)ribbon(iTrail-2,N,1.7,trailMat,5,0.07);
else{
  const gravelMat=new THREE.MeshStandardMaterial({vertexColors:true,map:texDirt,roughness:1,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});seaPatch(gravelMat,'gvl',false);
  applyPhoto(gravelMat,'forest_ground_04',1,1.6,{arm:true,color:new THREE.Color(1.65,1.58,1.45),onDiffuse:()=>{
    gravelMat.alphaMap=canvasTex(64,4,(g,w,h)=>{const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'#000');ag.addColorStop(0.25,'#fff');ag.addColorStop(0.75,'#fff');ag.addColorStop(1,'#000');g.fillStyle=ag;g.fillRect(0,0,w,h);},true);
    gravelMat.alphaMap.encoding=THREE.LinearEncoding;gravelMat.needsUpdate=true;}});
  surfRuns((sf,a,b)=>{ribbon(Math.max(0,a-2),Math.min(N,b+2),sf===0?1:(sf===1?1.5:1.3),sf===0?asphaltMat:(sf===1?gravelMat:trailMat),sf===0?8:5,sf===0?0.05:0.07);});
}

await BOOT('Pflanze Bäume und Büsche …',40);
// ================= Vegetation =================
function cardGeo(quads,nrmFn){
  const pos=[],uv=[],nrm=[],idx=[];
  quads.forEach((qd,qi)=>{
    const UVS=[[0,0],[1,0],[1,1],[0,1]];
    for(let k=0;k<4;k++){const p=qd[k];pos.push(p[0],p[1],p[2]);uv.push(UVS[k][0],UVS[k][1]);const nn=nrmFn(p);nrm.push(nn[0],nn[1],nn[2]);}
    const a=qi*4;idx.push(a,a+1,a+2,a,a+2,a+3,a,a+2,a+1,a,a+3,a+2);
  });
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  g.setIndex(idx);return g;
}
const foliageGeo=(function(){
  const q=[];
  for(let k=0;k<4;k++){const an=k*Math.PI/4+0.2,cx=Math.cos(an)*0.5,cz=Math.sin(an)*0.5;q.push([[-cx,0,-cz],[cx,0,cz],[cx,1,cz],[-cx,1,-cz]]);}
  for(let k=0;k<3;k++){
    const an=k*2.094+0.5,ux=Math.cos(an),uz=Math.sin(an),vx=-uz,vz=ux;
    // geneigte Karte (ca. 50 Grad), Mitte bei y=0.55
    const c=[[-0.5,-0.32],[0.5,-0.32],[0.5,0.32],[-0.5,0.32]].map(p=>[ux*p[0]*0.95+vx*p[1]*0.75,0.55+p[1]*0.9,uz*p[0]*0.95+vz*p[1]*0.75]);
    q.push(c);
  }
  return cardGeo(q,p=>{const v=new THREE.Vector3(p[0],(p[1]-0.4)*0.8,p[2]).normalize();v.y+=0.55;v.normalize();return [v.x,v.y,v.z];});
})();
const grassGeo=cardGeo([0,1,2].map(k=>{const a=k*Math.PI/3,cx=Math.cos(a)*0.5,cz=Math.sin(a)*0.5;return [[-cx,0,-cz],[cx,0,cz],[cx,1,cz],[-cx,1,-cz]];}),()=>[0,1,0]);
const leafMat=new THREE.MeshLambertMaterial({map:texLeaf,alphaTest:0.35});
leafMat.emissive=new THREE.Color(0.2,0.3,0.26);leafMat.emissiveMap=texLeaf;leafMat.emissiveIntensity=0;leafMat.userData={nI:0.6,dI:0};NT.emi.push(leafMat);   // Nightride: Kronen bleiben als dunkle Silhouette mit Laub sichtbar, statt im Dunkel zu verschwinden
const leafDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:texLeaf,alphaTest:0.35});seaPatch(leafMat,'leaf',true);seaPatch(leafDepth,'dep',true);
const grassMat=new THREE.MeshLambertMaterial({map:texGrass,alphaTest:0.3});seaPatch(grassMat,'grs',true);
const trunkGeo=new THREE.CylinderGeometry(0.6,1,1,6,1,true);trunkGeo.translate(0,0.5,0);
const trunkMat=new THREE.MeshLambertMaterial({color:C(0x6a5f52)});
applyPhoto(trunkMat,'tree_bark_03',2,7,{normal:false,color:new THREE.Color(0.75,0.72,0.7)});
const DUM=new THREE.Object3D(),TC=new THREE.Color();
// Baumart je Strecke: Wuppertal/Hagen/Iserlohn dichte Fichten (Nadelwald), Bergkamen Birken; andere Strecken wie bisher
const SPEC=(RT&&['wuppertal','hagen','iserlohn','hemer','alpen'].indexOf(RT.dem)>=0)?'fir':(RT===ROUTES.tour2?'birch':null);
const firGeo=(function(){   // dichte Tanne: 8 ueberlappende, unten ausgefranste Aststockwerke plus geschlossener Kern, keine Luecken zwischen den Stockwerken
  const pos=[],nrm=[],uv=[],S=9,T=8;
  const tri=(P,U,N)=>{for(let q=0;q<3;q++){pos.push(P[q][0],P[q][1],P[q][2]);uv.push(U[q][0],U[q][1]);const l=Math.hypot(N[q][0],N[q][1],N[q][2]);nrm.push(N[q][0]/l,N[q][1]/l,N[q][2]/l);}};
  for(let i=0;i<T;i++){
    const yb=i*0.1,hh=0.3,r=0.54*(1-i*0.105),ph=i*0.7;
    for(let k=0;k<S;k++){
      const a0=ph+k/S*6.2832,a1=ph+(k+1)/S*6.2832,am=(a0+a1)/2,j0=(k%2?0.8:1),j1=((k+1)%2?0.8:1);
      const P=[[Math.cos(a0)*r*j0,yb-(k%2?0.03:0),Math.sin(a0)*r*j0],[Math.cos(a1)*r*j1,yb-((k+1)%2?0.03:0),Math.sin(a1)*r*j1],[Math.cos(am)*r*0.05,yb+hh,Math.sin(am)*r*0.05]];
      tri(P,[[k/S*2,i*0.12],[(k+1)/S*2,i*0.12],[(k+0.5)/S*2,i*0.12+0.35]],[[Math.cos(a0),0.55,Math.sin(a0)],[Math.cos(a1),0.55,Math.sin(a1)],[Math.cos(am),0.9,Math.sin(am)]]);
    }
  }
  for(let k=0;k<6;k++){const a0=k/6*6.2832,a1=(k+1)/6*6.2832,am=(a0+a1)/2;   // Kern
    tri([[Math.cos(a0)*0.2,0.05,Math.sin(a0)*0.2],[Math.cos(a1)*0.2,0.05,Math.sin(a1)*0.2],[0,1,0]],[[k/6,0.2],[(k+1)/6,0.2],[(k+0.5)/6,0.6]],[[Math.cos(a0),0.4,Math.sin(a0)],[Math.cos(a1),0.4,Math.sin(a1)],[Math.cos(am),0.9,Math.sin(am)]]);}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  return g;
})();
const texFir=canvasTex(128,128,(g,w,h)=>{
  g.fillStyle='#3c6530';g.fillRect(0,0,w,h);
  for(let i=0;i<520;i++){const x=rnd()*w,y=rnd()*h,l=6+rnd()*14,an=Math.PI/2+(rnd()-0.5)*1.6;
    g.strokeStyle='hsl('+(100+rnd()*28)+','+(28+rnd()*22)+'%,'+(14+rnd()*22)+'%)';g.lineWidth=1+rnd()*1.5;
    g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(an)*l,y+Math.sin(an)*l);g.stroke();}
},true);
const texBirch=canvasTex(64,128,(g,w,h)=>{
  g.fillStyle='#e4e1d8';g.fillRect(0,0,w,h);
  for(let i=0;i<34;i++){const y=rnd()*h,x=rnd()*w,ww=5+rnd()*22;g.fillStyle='rgba(28,26,24,'+(0.5+rnd()*0.4)+')';g.fillRect(x,y,ww,1.5+rnd()*3.5);}
  for(let i=0;i<40;i++){g.fillStyle='rgba(120,115,105,0.22)';g.fillRect(rnd()*w,rnd()*h,2+rnd()*8,1+rnd()*2);}
},true);
texBirch.repeat.set(1,3);
const firMat=new THREE.MeshLambertMaterial({map:texFir,side:THREE.DoubleSide});seaPatch(firMat,'fir',true);
const birchTrunkMat=new THREE.MeshLambertMaterial({map:texBirch});

(function plant(){
  const trees=[],bushes=[],tufts=[];
  function clearOf(x,z,extra){
    if(inBuilding(x,z))return false;
    if(!nearest(allHash,x,z))return true;
    const lim=(ROUTE?SURF[nI]===2:nI>=iTrail-3)?HW[nI]+0.9+extra:FLAT[nI]+1+extra;
    return nD>lim;
  }
  function addTree(x,z,scale){
    let alpK=1;if(RT&&RT.alp){const el=NHN0+gnd(x,z);if(el>2260)return;alpK=1-0.55*sstep(1750,2250,el);}   // Alpen: Baumgrenze bei rund 2250 m, darunter werden die Nadelbaeume (Fichte/Zirbe) mit der Hoehe kleiner
    let H=(7+rnd()*7)*scale,cw=(3.6+rnd()*3.4)*scale,ch=H*(0.5+rnd()*0.18);
    if(SPEC==='fir'){H=(15+rnd()*11)*scale;cw=(3.2+rnd()*2.0)*scale;ch=Math.max(H*0.25,Math.min(H*(0.84+rnd()*0.08),H-8.3));}   // Nadeln erst ab ca. 8 m Hoehe: man faehrt weit unter den Aesten durch
    else if(SPEC==='birch'){H=(9+rnd()*6)*scale;cw=(2.8+rnd()*2.2)*scale;ch=H*(0.5+rnd()*0.15);}
    if(alpK<1){H*=alpK;cw*=0.65+0.35*alpK;ch=Math.max(H*0.25,Math.min(ch,H-Math.min(8.3,H*0.6)));}
    if(SPEC==='fir'&&nearest(allHash,x,z)&&nD<10)cw*=0.7;
    if(nearest(allHash,x,z)&&(ROUTE?SURF[nI]===2:nI>=iTrail-3)&&nD<8){H=Math.max(H,9+rnd()*3);ch=Math.min(ch,H-(SPEC==='fir'?8.8:4.8));}
    trees.push({x:x,y:gnd(x,z)-0.2,z:z,H:H,cw:cw,ch:ch,rad:(SPEC==='birch'?0.07+rnd()*0.07:SPEC==='fir'?0.16+rnd()*0.12:0.11+rnd()*0.14),rot:rnd()*6.283});
  }
  if(!ROUTE)for(let gx=-560;gx<=560;gx+=7)for(let gz=-560;gz<=560;gz+=7){
    const x=gx+(rnd()-0.5)*6,z=gz+(rnd()-0.5)*6,r=Math.hypot(x,z);
    if(r>RBASE+215||r<RTOP+14)continue;
    let f=forestD(x,z);
    if(nearest(allHash,x,z)&&nI>=iTrail&&nD<45)f=Math.max(f,1-nD/45*0.3);
    if(rnd()>f*0.92)continue;
    if(!clearOf(x,z,0))continue;
    addTree(x,z,1);
  }
  if(ROUTE&&CAN){      // echte Baeume (DOM-DGM): Position, Hoehe, Kronenradius wie im Laserscan; Baumart aus Kronenform (+ Infrarot)
    const nv=[];if(CANK>=5)for(let i=4;i<CAN.length;i+=CANK)if(CAN[i]>0)nv.push(CAN[i]);nv.sort((a,b)=>a-b);
    const nMed=nv.length?nv[nv.length>>1]:0;
    for(let i=0;i<CAN.length;i+=CANK){
      const x=CAN[i]/10,z=CAN[i+1]/10,h=CAN[i+2]/10,r=CAN[i+3]/10,nir=CANK>=5?CAN[i+4]:0;
      if(!clearOf(x,z,h<6?0.6:0.3))continue;
      if(h<5.5){if(rnd()<0.85)bushes.push({x:x,y:gnd(x,z)-0.1,z:z,w:Math.max(0.9,r*1.7),h:Math.max(0.7,h*0.75)});continue;}
      const ratio=h/Math.max(1,r),dark=nMed>0&&nir>0&&nir<nMed*0.8;
      const bright=nMed>0&&nir>nMed*1.12,fir=SPEC==='fir'?!(bright&&ratio<5.5):(h>9&&((ratio>6.5)||(dark&&ratio>3.6)));   // schmal und hoch (und im Infrarot dunkel) = Nadelbaum
      if(fir){trees.push({sp:'f',x:x,y:gnd(x,z)-0.2,z:z,H:h,cw:Math.max(2,r*2.1),ch:Math.max(h*0.3,Math.min(h*(0.82+rnd()*0.08),h-4.3)),rad:0.16+rnd()*0.1,rot:rnd()*6.283});continue;}
      const ch=h*(0.5+rnd()*0.15);
      trees.push({sp:'b',x:x,y:gnd(x,z)-0.2,z:z,H:h,cw:Math.max(1.6,r*1.55),ch:Math.min(ch,h-2.2),rad:0.07+rnd()*0.07,rot:rnd()*6.283});
    }
  }
  const thin=new Map(),tk=(x,z)=>Math.floor(x/6)+','+Math.floor(z/6);   // Laserscan-Baeume sind duenn gesaet: Luecken im OSM-Wald auffuellen
  if(CAN)trees.forEach(t=>{thin.set(tk(t.x,t.z),1);});
  if(ROUTE&&LU&&(!CAN||true)){       // Wälder aus OpenStreetMap auch abseits der Strecke
    for(let gx=FG.ox+20;gx<FG.ox+(FG.nx-1)*FG.G-20;gx+=7)for(let gz=FG.oz+20;gz<FG.oz+(FG.nz-1)*FG.G-20;gz+=7){
      const x=gx+(rnd()-0.5)*6,z=gz+(rnd()-0.5)*6,f=lu(LU.FD,x,z);
      if(f<0.15||rnd()>Math.min(1,f*1.1))continue;
      if(nearest(allHash,x,z)&&nD<(CAN?14:70))continue;
      if(CAN){const kx=Math.floor(x/6),kz=Math.floor(z/6);let near=false;if(thin.has(kx+','+kz))near=true;if(near||f<0.5)continue;}
      if(!clearOf(x,z,0))continue;
      addTree(x,z,0.85+rnd()*0.35);if(CAN)thin.set(tk(x,z),1);
      if(rnd()<0.1){const bx=x+(rnd()-0.5)*4,bz=z+(rnd()-0.5)*4;if(clearOf(bx,bz,0.4))bushes.push({x:bx,y:gnd(bx,bz)-0.1,z:bz,w:0.9+rnd()*1.5,h:0.5+rnd()*1.0});}
    }
  }
  // Trail-Korridor: dichte junge Bäume, Unterwuchs
  for(let i=iTrail+6;i<N&&!ROUTE;i++){
    const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
    if(Math.hypot(PX[i],PZ[i])>RTOP+16){
      for(let k=0;k<2;k++){
        if(rnd()<0.45)continue;
        const o=(1.7+rnd()*8)*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5)*2,z=PZ[i]+rz*o+(rnd()-0.5)*2;
        if(clearOf(x,z,0.2))addTree(x,z,0.75);
      }
    }
    for(let k=0;k<2;k++){
      const o=(HW[i]+1.3+rnd()*6)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;
      if(rnd()<0.6&&clearOf(x,z,0.4))bushes.push({x:x,y:gnd(x,z)-0.1,z:z,w:0.8+rnd()*1.1,h:0.45+rnd()*0.7});
    }
    for(let k=0;k<5;k++){
      const o=(HW[i]+0.25+rnd()*4.5)*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5),z=PZ[i]+rz*o+(rnd()-0.5);
      tufts.push({x:x,y:gnd(x,z)-0.05,z:z,w:0.35+rnd()*0.45,h:0.18+rnd()*0.3,dry:0.1});
    }
  }
  // Bergkamen: Unterwuchs entlang der Strecke (Farn, Brombeeren, Gras), im Wald dichter
  if(MW){for(let i=2;i<N-2;i++){
    const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),fd=forestD(PX[i],PZ[i]),open=SURF[i]===0?0.35:1;
    const nt=Math.round((fd*3.2+0.5)*open*(1+rnd()*0.6));
    for(let k=0;k<nt;k++){
      const o=(HW[i]+0.2+rnd()*(1.2+fd*3.2))*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5),z=PZ[i]+rz*o+(rnd()-0.5);
      if(clearOf(x,z,0.1))tufts.push({x:x,y:gnd(x,z)-0.05,z:z,w:0.45+rnd()*0.55,h:0.25+rnd()*0.5+fd*0.25,dry:0.15+rnd()*0.55});   // Farn/Gras, im Herbst teils verbraunt
    }
    if(SURF[i]===0&&i%11===0&&[-9,9,-16,16].some(q=>inBuilding(PX[i]+rx*q,PZ[i]+rz*q))){const o=(HW[i]+2.7)*((i/11|0)%2?1:-1),x=PX[i]+rx*o,z=PZ[i]+rz*o;if(clearOf(x,z,0.6))addTree(x,z,0.8);}   // Strassenbaeume in bebauten Abschnitten
    if(fd>0.3&&rnd()<0.1*open){const o=(HW[i]+1.4+rnd()*4.5)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;if(clearOf(x,z,0.4))bushes.push({x:x,y:gnd(x,z)-0.1,z:z,w:0.9+rnd()*1.4,h:0.6+rnd()*1.0});}   // Brombeere/Hasel
  }}
  // OSM-Einzelbaeume (natural=tree, tree_row) auf allen Strecken
  if(typeof OBJ_RAW!=='undefined'&&OBJ_RAW&&ROUTE&&!CUS)OBJ_RAW.nodes.forEach(n=>{if(n[0]!=='tree')return;const x=n[1],z=n[2];if(clearOf(x,z,0.3))addTree(x,z,0.8+rnd()*0.35);});
  // Wegränder Uphill
  for(let i=0;i<iTrail&&!ROUTE;i++){
    const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
    for(let k=0;k<4;k++){
      const o=(HW[i]+0.5+rnd()*8)*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5),z=PZ[i]+rz*o+(rnd()-0.5);
      if(Math.hypot(x,z)<33)continue;
      tufts.push({x:x,y:gnd(x,z)-0.05,z:z,w:0.35+rnd()*0.5,h:0.16+rnd()*0.3,dry:rnd()*0.8});
    }
    if(rnd()<0.14){
      const o=(FLAT[i]+1+rnd()*6)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;
      if(Math.hypot(x,z)>RTOP+3)bushes.push({x:x,y:gnd(x,z)-0.1,z:z,w:1.6+rnd()*2.2,h:1.0+rnd()*1.6});
    }
  }
  // Offene Kuppe: trockenes Gras, Sträucher
  for(let k=0;k<(ROUTE?0:4200);k++){
    const an=rnd()*6.283,r=34+Math.sqrt(rnd())*150,x=Math.cos(an)*r,z=Math.sin(an)*r;
    if(!clearOf(x,z,-0.6))continue;
    tufts.push({x:x,y:gnd(x,z)-0.05,z:z,w:0.4+rnd()*0.5,h:0.18+rnd()*0.32,dry:0.3+rnd()*0.7});
  }
  for(let k=0;k<(ROUTE?0:420);k++){
    const an=rnd()*6.283,r=RTOP+4+rnd()*110,x=Math.cos(an)*r,z=Math.sin(an)*r;
    if(!clearOf(x,z,1))continue;
    bushes.push({x:x,y:gnd(x,z)-0.15,z:z,w:1.5+rnd()*2.6,h:1.0+rnd()*2.0});
  }
  if(ROUTE){          // Bewuchs entlang der Strecke
    for(let i=4;i<N-2;i++){
      const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
      for(let k=0;k<5;k++){
        if(rnd()<0.2)continue;
        const o=(HW[i]+1.8+Math.pow(rnd(),1.5)*75)*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5)*3,z=PZ[i]+rz*o+(rnd()-0.5)*3;
        if(!CAN&&!(rnd()>forestD(x,z)*(SPEC==='fir'?2.1:1.5)||!clearOf(x,z,SPEC==='fir'?1.4:0.3)))addTree(x,z,0.85+rnd()*0.3);
      }
      if(rnd()<0.4){
        const o=(HW[i]+1.3+rnd()*7)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;
        if(clearOf(x,z,0.4))bushes.push({x:x,y:gnd(x,z)-0.1,z:z,w:0.9+rnd()*1.4,h:0.5+rnd()*1.0});
      }
      for(let k=0;k<10;k++){
        const o=(HW[i]+0.2+Math.pow(rnd(),1.6)*6)*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5),z=PZ[i]+rz*o+(rnd()-0.5);
        if(!clearOf(x,z,0.1))continue;
        tufts.push({x:x,y:gnd(x,z)-0.06,z:z,w:0.3+rnd()*0.5,h:0.14+rnd()*0.3+(k<2?0.25:0),dry:SURF[i]===2?0.1:rnd()*0.7});
      }
    }
  }
  // Instanzen in Kacheln (150 m) aufteilen: pro Kachel ein Mesh mit eigener Hüllkugel, damit nur Sichtbares gezeichnet wird
  function tiled(items,geo,mat,fill,shadow,depthMat){
    const T=150,map=new Map();
    items.forEach(it=>{const k=Math.floor(it.x/T)+','+Math.floor(it.z/T);let a=map.get(k);if(!a)map.set(k,a=[]);a.push(it);});
    map.forEach((arr,k)=>{
      const kk=k.split(',').map(Number),cx=(kk[0]+0.5)*T,cz=(kk[1]+0.5)*T;
      const g=new THREE.BufferGeometry();g.setIndex(geo.index);for(const n in geo.attributes)g.setAttribute(n,geo.attributes[n]);
      let y0=1e9,y1=-1e9;arr.forEach(it=>{const y=it.y===undefined?0:it.y;if(y<y0)y0=y;if(y>y1)y1=y;});if(y0>y1){y0=0;y1=0;}   // Huellkugel an die echte Hoehe der Baeume anpassen (Alpen: Haenge bis +/-1000 m, sonst werden Baeume beim Annaehern weggeschnitten)
      g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,(y0+y1)/2+15,0),Math.hypot(T*0.75+50,(y1-y0)/2+30));
      const m=new THREE.InstancedMesh(g,mat,arr.length);m.position.set(cx,0,cz);
      arr.forEach((it,i)=>fill(it,i,m,cx,cz));
      m.castShadow=shadow;m.receiveShadow=true;if(depthMat)m.customDepthMaterial=depthMat;m.frustumCulled=true;scene.add(m);
      TILES.push({m:m,x:cx,z:cz,sh:shadow});
    });
  }
  trees.forEach(t=>{t.rad=Math.max(t.rad,0.05+t.H*0.0075);});   // hohe Baeume bekommen kraeftigere Staemme (keine Stangen)
  if(ROUTE){   // Kopffreiheit: Kronen ueber dem Fahrbereich beginnen erst hoch ueber dem Boden, Baeume im Fahrbereich entfallen
    for(let i=trees.length-1;i>=0;i--){const t=trees[i];
      if(!nearest(allHash,t.x,t.z))continue;
      const reach=t.cw*0.62+(HW[nI]||2)+1.3,base=nD<reach?5.0:(nD<reach+3?4.0:3.2);
      if(nD<(HW[nI]||2)+0.6){trees.splice(i,1);continue;}
      if(t.H-t.ch<base){if(t.H<base+2.5&&nD<reach){trees.splice(i,1);continue;}t.ch=Math.max(2,t.H-base);}
    }
  }
  const trF=trees.filter(t=>t.sp==='f'),trB=trees.filter(t=>t.sp!=='f');
  if(trF.length){
    tiled(trF,firGeo,firMat,(t,i,m,cx,cz)=>{DUM.rotation.set(0,t.rot,0);DUM.position.set(t.x-cx,t.y+t.H-t.ch,t.z-cz);DUM.scale.set(t.cw,t.ch,t.cw);DUM.updateMatrix();m.setMatrixAt(i,DUM.matrix);
      const tb=1.1+rnd()*0.6;m.setColorAt(i,TC.setRGB(tb*(0.85+rnd()*0.2),tb,tb*(0.8+rnd()*0.2)));},true,null);
    tiled(trF,trunkGeo,trunkMat,(t,i,m,cx,cz)=>{DUM.rotation.set(0,t.rot,0);DUM.position.set(t.x-cx,t.y,t.z-cz);DUM.scale.set(t.rad,t.H-t.ch*0.45,t.rad);DUM.updateMatrix();m.setMatrixAt(i,DUM.matrix);
      const tg=0.65+rnd()*0.6;m.setColorAt(i,TC.setRGB(tg,tg*0.97,tg*0.92));},true,null);
  }
  const SPB=(CAN&&SPEC==='fir')?null:SPEC;   // Laubbaeume in Nadelwald-Strecken: normale Laubdarstellung
  tiled(trB,SPB==='fir'?firGeo:foliageGeo,SPB==='fir'?firMat:leafMat,(t,i,m,cx,cz)=>{
    DUM.rotation.set(0,t.rot,0);DUM.position.set(t.x-cx,t.y+t.H-t.ch,t.z-cz);DUM.scale.set(t.cw,t.ch,t.cw);DUM.updateMatrix();m.setMatrixAt(i,DUM.matrix);
    if(SPB==='fir'){const tb=1.1+rnd()*0.6;m.setColorAt(i,TC.setRGB(tb*(0.85+rnd()*0.2),tb,tb*(0.8+rnd()*0.2)));}
    else if(SPB==='birch'){const tb=0.95+rnd()*0.4;m.setColorAt(i,TC.setRGB(tb*1.08,tb*1.12,tb*0.6));}
    else{const tb=0.8+rnd()*0.45;m.setColorAt(i,TC.setRGB(tb*(0.85+rnd()*0.35),tb,tb*(0.7+rnd()*0.25)));}
  },true,SPB==='fir'?null:leafDepth);
  tiled(trB,trunkGeo,SPB==='birch'?birchTrunkMat:trunkMat,(t,i,m,cx,cz)=>{
    DUM.rotation.set(0,t.rot,0);DUM.position.set(t.x-cx,t.y,t.z-cz);DUM.scale.set(t.rad,t.H-t.ch*0.45,t.rad);DUM.updateMatrix();m.setMatrixAt(i,DUM.matrix);
    const tg=SPB==='birch'?0.85+rnd()*0.25:0.65+rnd()*0.6;m.setColorAt(i,TC.setRGB(tg,tg*0.97,tg*0.92));
  },true,null);
  tiled(bushes,foliageGeo,leafMat,(b,i,m,cx,cz)=>{
    DUM.rotation.set(0,rnd()*6.283,0);DUM.position.set(b.x-cx,b.y,b.z-cz);DUM.scale.set(b.w,b.h,b.w);DUM.updateMatrix();m.setMatrixAt(i,DUM.matrix);
    const bb=0.75+rnd()*0.4;m.setColorAt(i,TC.setRGB(bb,bb*1.05,bb*0.7));
  },true,leafDepth);
  const grs=new THREE.InstancedMesh(grassGeo,grassMat,tufts.length);
  tufts.forEach((t,i)=>{
    DUM.rotation.set(0,rnd()*6.283,0);DUM.position.set(t.x,t.y,t.z);DUM.scale.set(t.w,t.h,t.w);DUM.updateMatrix();grs.setMatrixAt(i,DUM.matrix);
    grs.setColorAt(i,TC.setRGB(0.5+t.dry*0.4,0.55+t.dry*0.25,0.4+t.dry*0.08));
  });
  grs.receiveShadow=true;grs.frustumCulled=false;scene.add(grs);GRS=grs;grs.visible=quality>1;
  // Bergab: Untergrund wird wurzelig und steinig (je steiler, desto mehr), Wurzeln queren den Weg, Steine liegen drauf und daneben
  {
    const rootG=(function(){   // knorrige Wurzel: taucht an beiden Enden in den Boden, in der Mitte gewoelbt, unregelmaessig dick
      const SG=10,RD=7,pos=[],uv=[],idx=[];
      for(let a=0;a<=SG;a++){
        const t=a/SG,x=t-0.5,pr=Math.pow(Math.sin(Math.PI*Math.min(0.99,Math.max(0.01,t))),0.95)*(1.15-0.45*t);   // laeuft zu den Enden spitz zu, am Stammende dicker
        const cy=-0.8+1.15*Math.pow(Math.sin(Math.PI*t),0.9)+0.12*Math.sin(t*13),cz=0.35*Math.sin(t*5.3+1.3)+0.25*Math.sin(t*2.3);
        const bulge=1+0.18*Math.sin(t*17+0.7)+0.12*Math.sin(t*5);
        for(let b=0;b<=RD;b++){
          const ang=b/RD*6.2832,rr=pr*bulge*(0.85+0.3*Math.sin(ang*3+t*9));
          pos.push(x,cy+Math.sin(ang)*rr*0.5,cz+Math.cos(ang)*rr*1.1);uv.push(t*3,b/RD);   // flacher Querschnitt: Wurzelkamm statt Wurst
        }
      }
      for(let a=0;a<SG;a++)for(let b=0;b<RD;b++){const i0=a*(RD+1)+b,i1=i0+RD+1;idx.push(i0,i1,i0+1,i1,i1+1,i0+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
    })();
    const barkTex=canvasTex(128,64,(g,w,h)=>{g.fillStyle='#5a4631';g.fillRect(0,0,w,h);
      for(let i=0;i<260;i++){const x=rnd()*w,y=rnd()*h,l=8+rnd()*26;g.strokeStyle='hsl('+(24+rnd()*10)+','+(22+rnd()*18)+'%,'+(10+rnd()*24)+'%)';g.lineWidth=1+rnd()*1.6;g.beginPath();g.moveTo(x,y);g.lineTo(x+l,y+(rnd()-0.5)*3);g.stroke();}
      for(let i=0;i<40;i++){g.fillStyle='rgba(70,95,45,'+(0.12+rnd()*0.2)+')';g.fillRect(rnd()*w,rnd()*h,3+rnd()*9,2+rnd()*4);}   // Moos
    },true);
    const stoneG=(function(){const g=new THREE.DodecahedronGeometry(1,0),p=g.attributes.position;
      for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),h=Math.sin(Math.round(x*7)*12.9898+Math.round(y*7)*78.233+Math.round(z*7)*37.719)*43758.5453,f=0.82+0.36*(h-Math.floor(h));p.setXYZ(i,x*f,y*f*0.85,z*f);}
      g.computeVertexNormals();return g;})();
    const roots=[],stones=[],jumps=[],edges=[],hw0=i=>HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7);
    for(let i=(ROUTE?0:iTrail);i<N;i++){
      if(ROUTE&&SURF[i]===0)continue;
      const dn=-GR[i];if(dn<2)continue;
      const stp=STEEP[i],pr=clamp((dn-2)/7,0,1)*(ROUTE&&SURF[i]===1?0.85:1),h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
      if(WILD==='root'&&rnd()<Math.min(1,pr*(0.35+0.5*stp))){   // Laengswurzel: zieht sich ein paar Meter am/auf dem Weg entlang
        const hw=hw0(i),o=(rnd()*2-1)*hw*0.8,x=PX[i]+rx*o,z=PZ[i]+rz*o,rr=0.035+rnd()*0.05+stp*0.03,L=2+rnd()*3.2;
        BUMPS.push({s:i*SEG,o0:o-0.25,o1:o+0.25,a:0.25+rr*2});roots.push({x:x,y:gnd(x,z)+rr*0.4,z:z,L:L,r:rr,a:Math.atan2(-rz,rx)+Math.PI/2+(rnd()-0.5)*0.35,t:rnd()});
      }
      for(let wq=0,nw=1+(stp>0.35&&rnd()<stp*0.9?1:0)+(stp>0.7&&rnd()<0.5?1:0)+(W_ROOT>1.5&&rnd()<0.45?1:0);wq<nw;wq++)if(rnd()<Math.min(1,pr*(0.8+1.0*stp)*W_ROOT)){
        const hw=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7)*0.9,o0=-hw*(0.7+rnd()*0.3),o1=hw*(0.7+rnd()*0.3),Lf=o1-o0,L=Lf*(0.45+rnd()*0.5),oc=rnd()<0.5?o0+L/2:o1-L/2,sk=(rnd()-0.5)*0.9;
        const x=PX[i]+rx*oc,z=PZ[i]+rz*oc;
        const rr=0.04+rnd()*0.05+stp*(0.03+rnd()*0.07);BUMPS.push({s:i*SEG,o0:o0-0.1,o1:o1+0.1,a:0.45+rnd()*0.35+rr*1.5});roots.push({x:x,y:gnd(x,z)+rr*0.4,z:z,L:L/Math.cos(sk),r:rr,a:Math.atan2(-rz,rx)+sk,t:rnd()});
        if(rnd()<0.4+0.4*stp){const x2=x+Math.sin(h)*0.5,z2=z+Math.cos(h)*0.5;roots.push({x:x2,y:gnd(x2,z2)+0.03,z:z2,L:L*0.6,r:0.025+rnd()*0.03+stp*0.05,a:Math.atan2(-rz,rx)+sk+(rnd()-0.5)*0.6,t:rnd()});}
        if(stp>0.4&&rnd()<0.55){   // Wurzelverzweigung: kurzer dicker Ast längs/schräg zum Weg
          const ob=(rnd()*2-1)*hw*0.6,x3=PX[i]+rx*ob,z3=PZ[i]+rz*ob,rb=0.04+rnd()*0.08*stp+0.03;
          roots.push({x:x3,y:gnd(x3,z3)+rb*0.4,z:z3,L:0.5+rnd()*1.1,r:rb,a:Math.atan2(-rz,rx)+Math.PI/2+(rnd()-0.5)*1.1,t:rnd()});
        }
      }
      if(rnd()<pr*(0.55+1.0*stp)*W_ROOT){   // duenne Wurzelstraenge und ab und zu eine dicke Wurzel zusaetzlich zu den Querwurzeln
        const hw=hw0(i);
        for(let q=0,nq=1+(rnd()*3|0)+Math.round(stp*2);q<nq;q++){const o=(rnd()*2-1)*hw*1.15,x=PX[i]+rx*o,z=PZ[i]+rz*o,rr=0.010+rnd()*0.02;roots.push({x:x,y:gnd(x,z)+rr*0.3,z:z,L:0.7+rnd()*1.9,r:rr,a:Math.atan2(-rz,rx)+(rnd()-0.5)*2.6,t:rnd()});}
        if(rnd()<0.2+0.55*stp){const o=(rnd()*2-1)*hw*0.8,x=PX[i]+rx*o,z=PZ[i]+rz*o,rr=0.075+rnd()*0.07+stp*0.07;BUMPS.push({s:i*SEG,o0:o-0.9,o1:o+0.9,a:0.55+rnd()*0.3});roots.push({x:x,y:gnd(x,z)+rr*0.35,z:z,L:1.0+rnd()*1.5,r:rr,a:Math.atan2(-rz,rx)+(rnd()-0.5)*1.0,t:rnd()});}
      }
      if(dn>=3.5&&rnd()<0.012*Math.min(1,dn/10)*(1+2.5*stp)*W_STONE){   // Absprungstein: schraege, halb eingegrabene Felsplatte, die wie eine kleine Rampe nach oben zeigt
        const hw=hw0(i),o=(rnd()*2-1)*hw*0.55,x=PX[i]+rx*o,z=PZ[i]+rz*o,w=0.4+rnd()*0.4+stp*0.25,hh=0.12+rnd()*0.1+stp*0.08;
        BUMPS.push({s:i*SEG,o0:o-w-0.1,o1:o+w+0.1,a:0.6+rnd()*0.3});
        stones.push({x:x,y:gnd(x,z)+hh*(-0.1+rnd()*0.2),z:z,w:w,hh:hh,zl:0.7+rnd()*0.5,t:0.55+rnd()*0.4,k:{p:Math.atan(dn/100)-(0.28+rnd()*0.2),y:h,r:(rnd()-0.5)*0.2}});
      }
      if(ROUTE&&SURF[i]>=1&&dn>=5&&(FEAT.length===0||i*SEG-FEAT[FEAT.length-1].s>(FEAT[FEAT.length-1].k==='j'?120:22))){   // Abfahrten: Kanten, kleine Drops und ab und zu ein Sprung
        const kv=Math.abs(KV[i]),r=rnd(),pd=Math.min(1,dn/12);
        const t1=TABS.length===0&&SURF[i]>=1&&dn>=6&&dn<=22&&kv<0.05;   // erste Table gleich am ersten Downhill (Testpunkt)
        if(((kv<0.03&&SURF[i]>=1&&dn<=18&&dn>=3.5&&r<0.085*pd&&(TABS.length===0||i*SEG-TABS[TABS.length-1].s0>150))||t1)&&i*SEG>40){const K=TABS.length>0&&rnd()<0.45,H=(K?0.5:0.65)+rnd()*0.15,s0=i*SEG;TABS.push({s0:s0,H:H,K:K,L:K?3.8:10.2});FEAT.push({s:s0+(K?3.2:6.0),k:'j',a:1});}   // Table: Anfahrt, Plateau, Landung
        else if(r<(0.012*pd+0.004)*(1+1.2*stp)){const big=rnd()<0.3,a=big?1.5+rnd()*0.8:0.7+rnd()*0.6;FEAT.push({s:i*SEG,k:'e',a:a});   // Kante/Drop: quer liegende Steinplatte oder Absatz
          const hh=HS[i],ox=(rnd()-0.5)*hw0(i)*0.5,x=PX[i]-Math.cos(hh)*ox,z=PZ[i]+Math.sin(hh)*ox;edges.push({x:x,y:gnd(x,z),z:z,h:hh,w:big?1.3:0.8});}
      }
      const ns=Math.round(pr*(3+rnd()*6)*(1+1.6*stp)*W_STONE);
      if(stp>0.3&&rnd()<0.28*stp*W_STONE){   // Steinfeld: einzelne grosse Brocken in steilen Abfahrten
        const hw=hw0(i),o=(rnd()*2-1)*hw*0.85,x=PX[i]+rx*o,z=PZ[i]+rz*o,w=0.2+rnd()*0.32,hh=w*(0.45+rnd()*0.35);
        BUMPS.push({s:i*SEG,o0:o-w-0.2,o1:o+w+0.2,a:0.5+w*1.3});stones.push({x:x,y:gnd(x,z)+hh*(-0.25+rnd()*0.25),z:z,w:w,hh:hh,t:rnd()});
      }
      for(let k=0;k<ns;k++){
        const hw=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7),o=(rnd()*2-1)*hw*(rnd()<0.7?0.95:1.6),x=PX[i]+rx*o+Math.sin(h)*(rnd()-0.5)*SEG,z=PZ[i]+rz*o+Math.cos(h)*(rnd()-0.5)*SEG;
        const w=0.05+Math.pow(rnd(),2.4)*0.17*(1+0.9*stp);
        if(w>0.07)BUMPS.push({s:i*SEG+(rnd()-0.5)*SEG*0.8,o0:o-0.3-w,o1:o+0.3+w,a:0.15+w*3});
        const hh=w*(0.35+rnd()*0.3);stones.push({x:x,y:gnd(x,z)+hh*(-0.4+rnd()*0.38),z:z,w:w*(0.8+rnd()*0.6),hh:hh,t:rnd()});   // etwa zur Haelfte im Boden eingegraben
        if(w>0.11&&rnd()<0.6){for(let q=0;q<1+(rnd()*2|0);q++){const ax=x+(rnd()-0.5)*0.5,az=z+(rnd()-0.5)*0.5,w2=w*(0.3+rnd()*0.4),h2=w2*(0.4+rnd()*0.3);stones.push({x:ax,y:gnd(ax,az)+h2*(-0.4+rnd()*0.3),z:az,w:w2,hh:h2,t:rnd()});}}   // kleine Begleitsteine
      }
    }
    const rm=new THREE.InstancedMesh(rootG,new THREE.MeshStandardMaterial({roughness:1,color:0xffffff,map:barkTex,side:THREE.DoubleSide}),Math.max(1,roots.length));rm.count=roots.length;
    roots.forEach((r,i)=>{DUM.rotation.set(0,r.a,0);DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.L,r.r*1.3,r.r*1.3);DUM.updateMatrix();rm.setMatrixAt(i,DUM.matrix);rm.setColorAt(i,TC.setRGB(0.36+r.t*0.4,0.32+r.t*0.32,0.28+r.t*0.24));});
    rm.castShadow=false;rm.receiveShadow=true;rm.frustumCulled=false;scene.add(rm);
    const sm=new THREE.InstancedMesh(stoneG,new THREE.MeshStandardMaterial({roughness:0.95,color:0xffffff,flatShading:true}),Math.max(1,stones.length));sm.count=stones.length;
    stones.forEach((r,i)=>{if(r.k){DUM.rotation.order='YXZ';DUM.rotation.set(r.k.p,r.k.y,r.k.r);}else{DUM.rotation.order='XYZ';DUM.rotation.set((rnd()-0.5)*0.5,rnd()*6.283,(rnd()-0.5)*0.5);}DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.w,r.hh,r.zl||r.w*(0.6+rnd()*0.6));DUM.updateMatrix();sm.setMatrixAt(i,DUM.matrix);const q=(r.t*977)%1,c=0.12+Math.pow(r.t,1.3)*0.34;DUM.rotation.order='XYZ';sm.setColorAt(i,q<0.3?TC.setRGB(c*0.97,c*0.98,c*1.04):q<0.55?TC.setRGB(c*1.03,c*1.0,c*0.96):TC.setRGB(c,c,c));});   // Steine grau, jeder in einem anderen Grauton
    sm.castShadow=true;sm.receiveShadow=true;sm.frustumCulled=false;scene.add(sm);
    {   // Feingut auf und neben dem Weg: kleine Steine, Tannennadeln, Zweige, Zapfen (ueberall, wo der Untergrund Erde/Waldweg ist)
      const pebs=[],ndl=[],twg=[],cns=[],conifer=(SPEC==='fir'||CAN);
      for(let i=(ROUTE?0:iTrail);i<N;i++){
        if(ROUTE&&SURF[i]===0)continue;
        const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),hw=hw0(i),dn=Math.max(0,-GR[i]),fd=forestD(PX[i],PZ[i]),at=()=>{const o=(rnd()*2-1)*hw*(rnd()<0.75?1.1:1.9),al=(rnd()-0.5)*SEG;return [PX[i]+rx*o+Math.sin(h)*al,PZ[i]+rz*o+Math.cos(h)*al];};
        const np=Math.round((2+dn*0.9)*(0.6+rnd()*0.8)*(SURF[i]>=2?1.3:1)*(0.6+0.4*W_STONE));
        for(let k=0;k<np;k++){const q=at(),w=0.012+Math.pow(rnd(),2)*0.03;pebs.push({x:q[0],y:gnd(q[0],q[1])+w*(-0.2+rnd()*0.3),z:q[1],w:w,t:rnd()});}
        if(fd>0.25){
          for(let k=0,n=2+(rnd()*3|0);k<n;k++){const q=at();ndl.push({x:q[0],z:q[1],s:0.25+rnd()*0.5,r:rnd()*6.283,t:rnd()});}
          if(rnd()<0.8)for(let k=0,n=1+(rnd()*2|0);k<n;k++){const q=at();twg.push({x:q[0],z:q[1],L:0.15+Math.pow(rnd(),1.5)*0.7,r:0.005+rnd()*0.01,a:rnd()*6.283,t:rnd()});}
          if(rnd()<(conifer?0.35:0.08)){const q=at();cns.push({x:q[0],z:q[1],s:0.035+rnd()*0.03,a:rnd()*6.283});}
        }
      }
      const pm=new THREE.InstancedMesh(stoneG,new THREE.MeshStandardMaterial({roughness:0.95,color:0xffffff,flatShading:true}),Math.max(1,pebs.length));pm.count=pebs.length;
      pebs.forEach((r,i)=>{DUM.rotation.set(rnd()*6.283,rnd()*6.283,rnd()*6.283);DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.w,r.w*(0.55+rnd()*0.3),r.w*(0.8+rnd()*0.4));DUM.updateMatrix();pm.setMatrixAt(i,DUM.matrix);const c=0.13+r.t*0.3,q=(r.t*613)%1;pm.setColorAt(i,q<0.35?TC.setRGB(c*1.03,c*1.0,c*0.96):TC.setRGB(c,c,c*1.02));});
      pm.receiveShadow=true;pm.frustumCulled=false;scene.add(pm);
      const nt=canvasTex(64,64,(g,w,h)=>{g.clearRect(0,0,w,h);for(let i=0;i<150;i++){const x=rnd()*w,y=rnd()*h,a=rnd()*3.14,l=5+rnd()*8;g.strokeStyle='hsl('+(22+rnd()*14)+','+(35+rnd()*25)+'%,'+(22+rnd()*22)+'%)';g.lineWidth=1;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}},true);
      const ng=new THREE.PlaneGeometry(1,1);ng.rotateX(-Math.PI/2);
      const nm=new THREE.InstancedMesh(ng,new THREE.MeshLambertMaterial({map:nt,alphaTest:0.35,side:THREE.DoubleSide}),Math.max(1,ndl.length));nm.count=ndl.length;
      const up=new THREE.Vector3(0,1,0),qn=new THREE.Quaternion(),qy=new THREE.Quaternion(),nv=new THREE.Vector3();
      ndl.forEach((r,i)=>{const y0=gnd(r.x,r.z),gx=gnd(r.x+0.4,r.z)-y0,gz=gnd(r.x,r.z+0.4)-y0;nv.set(-gx/0.4,1,-gz/0.4).normalize();qn.setFromUnitVectors(up,nv);qy.setFromAxisAngle(up,r.r);DUM.quaternion.copy(qn).multiply(qy);DUM.position.set(r.x,y0+0.014,r.z);DUM.scale.set(r.s,1,r.s*(0.7+rnd()*0.5));DUM.updateMatrix();nm.setMatrixAt(i,DUM.matrix);const k=0.7+r.t*0.6;nm.setColorAt(i,TC.setRGB(k,k*0.95,k*0.9));});
      nm.receiveShadow=true;nm.frustumCulled=false;scene.add(nm);
      const tg=new THREE.CylinderGeometry(1,0.7,1,5);tg.rotateZ(Math.PI/2);
      const tw=new THREE.InstancedMesh(tg,new THREE.MeshStandardMaterial({roughness:1,color:0xffffff}),Math.max(1,twg.length));tw.count=twg.length;
      twg.forEach((r,i)=>{DUM.rotation.set(0,r.a,(rnd()-0.5)*0.15);DUM.position.set(r.x,gnd(r.x,r.z)+r.r*0.6,r.z);DUM.scale.set(r.L,r.r,r.r);DUM.updateMatrix();tw.setMatrixAt(i,DUM.matrix);const k=0.18+r.t*0.22;tw.setColorAt(i,TC.setRGB(k*1.2,k*0.9,k*0.65));});
      tw.receiveShadow=true;tw.frustumCulled=false;scene.add(tw);
      const cg=new THREE.SphereGeometry(1,6,5),cm=new THREE.InstancedMesh(cg,new THREE.MeshStandardMaterial({roughness:1,color:0x4a3322,flatShading:true}),Math.max(1,cns.length));cm.count=cns.length;
      cns.forEach((r,i)=>{DUM.rotation.set(0,r.a,(rnd()-0.5)*0.6);DUM.position.set(r.x,gnd(r.x,r.z)+r.s*0.4,r.z);DUM.scale.set(r.s*1.6,r.s,r.s);DUM.updateMatrix();cm.setMatrixAt(i,DUM.matrix);});
      cm.receiveShadow=true;cm.frustumCulled=false;scene.add(cm);
      window.__rs=window.__rs||{};window.__rs.fine={pebbles:pebs.length,needles:ndl.length,twigs:twg.length,cones:cns.length};
    }
    BUMPS.sort((a,b)=>a.s-b.s);FEAT.sort((a,b)=>a.s-b.s);
    if(TABS.length){   // Tables als Erdhuegel mit Rampe, Plateau und Landung
      const P=[],U=[],I=[],S={};let vi=0;
      TABS.forEach(t=>{const n=Math.round((t.L+0.2)/0.4);
        for(let k=0;k<=n;k++){const ss=t.s0+k*0.4,hh=tabH(ss);sample(ss,S);const ii=Math.min(N-1,Math.floor(ss/SEG)),hw=Math.max(1.1,Math.min(1.5,HW[ii]*0.9)),rx=-Math.cos(S.h),rz=Math.sin(S.h);
          [[-(hw+0.8),0],[-hw,1],[hw,1],[hw+0.8,0]].forEach(q=>{const x=S.x+rx*q[0],z=S.z+rz*q[0];P.push(x,gnd(x,z)+(q[1]?hh+0.02:-0.04),z);U.push(q[0]/2,ss/2);});
          if(k<n){const b0=vi;for(let c=0;c<3;c++){I.push(b0+c,b0+c+4,b0+c+1,b0+c+1,b0+c+4,b0+c+5);}}
          vi+=4;}
      });
      const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(P,3));tg.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));tg.setIndex(I);tg.computeVertexNormals();
      const tm2=new THREE.Mesh(tg,new THREE.MeshStandardMaterial({map:texGround,color:0x5a4430,roughness:1,side:THREE.DoubleSide}));tm2.receiveShadow=true;tm2.castShadow=false;tm2.frustumCulled=false;scene.add(tm2);
    }
    if(edges.length){const em=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:0.95,color:0x5a5a5c}),edges.length);   // Steinplatte/Absatz quer zum Weg
      edges.forEach((e,i)=>{DUM.rotation.set((rnd()-0.5)*0.12,e.h+Math.PI/2+(rnd()-0.5)*0.4,(rnd()-0.5)*0.12);DUM.position.set(e.x,e.y+0.02,e.z);DUM.scale.set(0.5+rnd()*0.3,0.09+rnd()*0.07,e.w);DUM.updateMatrix();em.setMatrixAt(i,DUM.matrix);});em.receiveShadow=true;em.castShadow=true;em.frustumCulled=false;scene.add(em);}
    window.__rs=Object.assign(window.__rs||{},{roots:roots.length,stones:stones.length});
  }
  // Pfuetzen (spiegeln den Himmel) und Herbstlaub auf/neben dem Weg
  {
    const hwOf=i=>HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7);
    const pud=[],leaves=[],pudW=[];
    for(let i=2;i<N-2;i++){
      const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),hw=hwOf(i),dirt=!ROUTE||SURF[i]>0;
      if(dirt&&Math.abs(GR[i])<3&&rnd()<0.06){
        const o=(rnd()*2-1)*hw*0.55,x=PX[i]+rx*o,z=PZ[i]+rz*o,a=0.9+rnd()*1.6;
        pud.push({x:x,y:gnd(x,z),z:z,a:a,b:a*(0.35+rnd()*0.4),r:-h+(rnd()-0.5)*0.5});
      }
      if(rnd()<(dirt?0.24:0.025)){   // Regenpfuetzen: nur bei Regen sichtbar, auf Trails auch bergab und als Matschlachen
        const o=(rnd()*2-1)*hw*0.6,x=PX[i]+rx*o,z=PZ[i]+rz*o,a=(0.8+rnd()*1.8)*(Math.abs(GR[i])>=3?0.75:1);
        pudW.push({x:x,y:gnd(x,z),z:z,a:a,b:a*(0.4+rnd()*0.4),r:-h+(rnd()-0.5)*0.5,m:dirt&&rnd()<0.7?1:0,w:1});
      }
      const nl=dirt?7:3;
      for(let k=0;k<nl;k++){
        const o=(rnd()<0.6?(rnd()<0.5?-1:1)*(hw*(0.7+rnd()*1.6)):(rnd()*2-1)*hw*1.1),al=(rnd()-0.5)*SEG;
        const x=PX[i]+rx*o+Math.sin(h)*al,z=PZ[i]+rz*o+Math.cos(h)*al;
        leaves.push({x:x,y:0,z:z,s:0.09+Math.pow(rnd(),1.6)*0.28,r:rnd()*6.283,t:rnd()});
      }
    }
    pud.forEach(q=>{const k=Math.floor(q.x/8)+','+Math.floor(q.z/8);(PUDH[k]||(PUDH[k]=[])).push(q);});
    // Pfuetzen: unregelmaessige, weich auslaufende Form; dunkel, Spiegelung entsteht durch den Fresnel-Effekt (flacher Blick = mehr Himmel)
    const blob=(soft)=>canvasTex(128,128,(g,w,h)=>{
      g.fillStyle='#000';g.fillRect(0,0,w,h);
      const ph=[rnd()*6.28,rnd()*6.28,rnd()*6.28,rnd()*6.28];
      for(let k=0;k<soft;k++){
        const sc=1-k*(0.42/soft),al=1/soft*(k===0?1.2:1.15);
        g.fillStyle='rgba(255,255,255,'+Math.min(1,al).toFixed(3)+')';g.beginPath();
        for(let q=0;q<=64;q++){const t=q/64*6.2832,r=sc*(0.62+0.09*Math.sin(2*t+ph[0])+0.07*Math.sin(3*t+ph[1])+0.05*Math.sin(5*t+ph[2])+0.03*Math.sin(8*t+ph[3]))*w*0.5;
          const x=w/2+Math.cos(t)*r,y=h/2+Math.sin(t)*r;q?g.lineTo(x,y):g.moveTo(x,y);}
        g.closePath();g.fill();
      }
    });
    const pg2=new THREE.PlaneGeometry(2,2);pg2.rotateX(-Math.PI/2);
    const mudT=blob(7),watT=blob(5);mudT.encoding=watT.encoding=THREE.LinearEncoding;
    const mudM=new THREE.MeshStandardMaterial({color:0x2a2017,roughness:0.6,alphaMap:mudT,transparent:true,opacity:0.7,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
    const watM=new THREE.MeshStandardMaterial({color:0x1f1c18,roughness:0.015,metalness:0.0,alphaMap:watT,transparent:true,opacity:0.93,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-7,polygonOffsetUnits:-7});
    watM.envMapIntensity=2.4;watM.userData.keepEnv=true;window.__pudM=watM;if(typeof NIGHT!=='undefined'&&NIGHT){watM.roughness=0.1;watM.color.setHex(0x2c3340);watM.emissive.setHex(0x101a2c);watM.envMapIntensity=4.2;watM.opacity=0.97;}
    const mud=new THREE.InstancedMesh(pg2,mudM,Math.max(1,pud.length)),wat=new THREE.InstancedMesh(pg2,watM,Math.max(1,pud.length));
    mud.count=wat.count=pud.length;
    pud.forEach((p,i)=>{
      DUM.rotation.set(0,p.r,0);DUM.position.set(p.x,p.y+0.085,p.z);DUM.scale.set(p.a*1.45,1,p.b*1.45);DUM.updateMatrix();mud.setMatrixAt(i,DUM.matrix);
      DUM.position.y=p.y+0.095;DUM.scale.set(p.a,1,p.b);DUM.updateMatrix();wat.setMatrixAt(i,DUM.matrix);
    });
    mud.frustumCulled=wat.frustumCulled=false;mud.renderOrder=2;wat.renderOrder=3;scene.add(mud);scene.add(wat);
    window.__dryM=[{m:mud,mt:mudM,o:mudM.opacity},{m:wat,mt:watM,o:watM.opacity}];   // die Grundpfuetzen gibt es nur bei feuchtem Wetter
    {   // Regenpfuetzen (Wasser) und Matschlachen: zwei weitere Instanzgruppen, werden per Wetter ein- und ausgeblendet
      const mkW=(list,mat,dy,sc)=>{const m=new THREE.InstancedMesh(pg2,mat,Math.max(1,list.length));m.count=list.length;
        list.forEach((p,i)=>{DUM.rotation.set(0,p.r,0);DUM.position.set(p.x,p.y+dy,p.z);DUM.scale.set(p.a*sc,1,p.b*sc);DUM.updateMatrix();m.setMatrixAt(i,DUM.matrix);});
        m.frustumCulled=false;m.renderOrder=3;m.visible=false;scene.add(m);return m;};
      const m1=watM.clone(),m2=mudM.clone();m2.color.setHex(0x33271a);m2.roughness=0.3;m2.opacity=0.9;m2.alphaMap=watT;
      window.__wetM=[{m:mkW(pudW.filter(p=>!p.m),m1,0.097,1),mt:m1,o:0.93},{m:mkW(pudW.filter(p=>p.m),m2,0.093,1.25),mt:m2,o:0.9}];
      window.PUDW={};pudW.forEach(q=>{const k=Math.floor(q.x/8)+','+Math.floor(q.z/8);(window.PUDW[k]||(window.PUDW[k]=[])).push(q);});
    }
    // Laub: kleine flache Blaetter, Herbstfarben
    const lg=new THREE.PlaneGeometry(1,1);lg.rotateX(-Math.PI/2);
    const lt=canvasTex(64,64,(g,w,h)=>{
      g.clearRect(0,0,w,h);g.translate(w/2,h/2);g.fillStyle='#fff';
      g.beginPath();g.moveTo(0,-26);g.bezierCurveTo(22,-14,22,14,0,26);g.bezierCurveTo(-22,14,-22,-14,0,-26);g.fill();
      g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1.6;g.beginPath();g.moveTo(0,-24);g.lineTo(0,26);for(let k=-16;k<=16;k+=8){g.moveTo(0,k);g.lineTo(9,k-7);g.moveTo(0,k);g.lineTo(-9,k-7);}g.stroke();
    });
    const lm=new THREE.InstancedMesh(lg,new THREE.MeshLambertMaterial({map:lt,alphaTest:0.5,side:THREE.DoubleSide}),Math.max(1,leaves.length));lm.count=leaves.length;
    const LUP=new THREE.Vector3(0,1,0),LNV=new THREE.Vector3(),LQN=new THREE.Quaternion(),LQY=new THREE.Quaternion();
    const PAL=[[0.62,0.26,0.07],[0.72,0.40,0.09],[0.55,0.18,0.06],[0.60,0.50,0.14],[0.38,0.22,0.09],[0.45,0.30,0.10]];
    leaves.forEach((l,i)=>{
      {const y0=gnd(l.x,l.z),gx=gnd(l.x+0.4,l.z)-y0,gz=gnd(l.x,l.z+0.4)-y0;LNV.set(-gx/0.4,1,-gz/0.4).normalize();LQN.setFromUnitVectors(LUP,LNV);LQY.setFromAxisAngle(LUP,l.r);DUM.quaternion.copy(LQN).multiply(LQY);DUM.rotateX((rnd()-0.5)*0.12);DUM.position.set(l.x,y0+0.008+rnd()*0.01,l.z);}   // liegt flach auf dem Boden (an der Neigung ausgerichtet), schwebt nicht
      DUM.scale.set(l.s*0.7,1,l.s);DUM.updateMatrix();lm.setMatrixAt(i,DUM.matrix);
      const c=PAL[(l.t*PAL.length)|0],k=0.75+rnd()*0.5;lm.setColorAt(i,TC.setRGB(c[0]*k,c[1]*k,c[2]*k));
    });
    lm.receiveShadow=true;lm.frustumCulled=false;scene.add(lm);
    window.__fx={puddles:pud.length,leaves:leaves.length,at:pud.slice(0,40).map(p=>[p.x,p.z])};
  }
  window.__counts={trees:trees.length,bushes:bushes.length,tufts:tufts.length};
})();

// ================= Bergkamen: Waldausstattung (Totholz, Baumstuempfe, Holzstapel, Hochsitze) und Spurrillen =================
if(MW){
  const clearOf=(x,z,extra)=>{if(inBuilding(x,z))return false;if(!nearest(allHash,x,z))return true;return nD>HW[nI]+0.9+extra;};
  const LG=[],ST=[],lc=new THREE.Color(),DM=new THREE.Object3D();
  let lastPile=-1e9,lastHs=-1e9;const piles=[],hochs=[];
  for(let i=6;i<N-6;i+=1){
    const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),fd=forestD(PX[i],PZ[i]);
    if(fd>0.35&&rnd()<0.018*fd){const o=(HW[i]+1.2+rnd()*6)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;if(clearOf(x,z,0.3))LG.push({x:x,z:z,L:1.8+rnd()*3.2,r:0.07+rnd()*0.13,a:rnd()*6.283,t:rnd()});}   // liegender Stamm
    if(fd>0.4&&rnd()<0.012*fd){const o=(HW[i]+1+rnd()*5)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;if(clearOf(x,z,0.3))ST.push({x:x,z:z,H:0.25+rnd()*0.6,r:0.12+rnd()*0.18,t:rnd()});}   // Baumstumpf
    const sa=i*SEG;
    if(SURF[i]>=1&&fd>0.3&&sa-lastPile>650&&rnd()<0.02){const o=(HW[i]+1.6)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;if(clearOf(x,z,0.8)){piles.push({x:x,z:z,a:h});lastPile=sa;}}   // Holzpolter am Wegrand
    if(fd>0.28&&fd<0.7&&sa-lastHs>900&&rnd()<0.01&&sa>300){const o=(HW[i]+5+rnd()*3)*(rnd()<0.5?-1:1),x=PX[i]+rx*o,z=PZ[i]+rz*o;if(clearOf(x,z,1.5)){hochs.push({x:x,z:z,a:h+(o>0?Math.PI/2:-Math.PI/2)});lastHs=sa;}}   // Hochsitz am Waldrand
  }
  const mkI=(geo,arr,mat,fn)=>{if(!arr.length)return;const im=new THREE.InstancedMesh(geo,mat,arr.length);arr.forEach((a,k)=>{fn(a);DM.updateMatrix();im.setMatrixAt(k,DM.matrix);lc.setHex(0x6a5237).offsetHSL(0,0,(a.t||0)*0.12-0.06);im.setColorAt(k,lc);});im.castShadow=true;im.receiveShadow=true;im.frustumCulled=false;scene.add(im);};
  const woodM=new THREE.MeshStandardMaterial({color:0xffffff,roughness:1,map:texGround});
  const lgG=new THREE.CylinderGeometry(1,1,1,8);lgG.rotateZ(Math.PI/2);
  mkI(lgG,LG,woodM,a=>{DM.position.set(a.x,gnd(a.x,a.z)+a.r*0.8,a.z);DM.rotation.set(0,a.a,(a.t-0.5)*0.12);DM.scale.set(a.L,a.r,a.r);});
  mkI(new THREE.CylinderGeometry(1,1.18,1,9),ST,woodM,a=>{DM.position.set(a.x,gnd(a.x,a.z)+a.H/2-0.03,a.z);DM.rotation.set(0,a.t*6,0);DM.scale.set(a.r,a.H,a.r);});
  const mTop=new THREE.MeshStandardMaterial({color:0xc9a26a,roughness:1}),mBar=new THREE.MeshStandardMaterial({color:0x5b4630,roughness:1}),mGr=new THREE.MeshStandardMaterial({color:0x6b5a40,roughness:1}),mRf=new THREE.MeshStandardMaterial({color:0x3f4a3a,roughness:1});
  piles.forEach(p=>{const g=new THREE.Group(),y=gnd(p.x,p.z);   // Holzpolter: Stapel aus Stammenden (hell) mit Stuetzpfosten
    for(let r=0;r<5;r++)for(let c=0;c<9;c++){const rad=0.11+((r*7+c*3)%5)*0.012,m=new THREE.Mesh(new THREE.CylinderGeometry(rad,rad,2.6,7),((r+c)%3?mTop:mBar));m.rotation.x=Math.PI/2;m.position.set(-1.7+c*0.42+(r%2)*0.2,0.13+r*0.21,0);g.add(m);}
    [-1.9,1.9].forEach(px=>{const m=new THREE.Mesh(new THREE.BoxGeometry(0.1,1.2,0.1),mGr);m.position.set(px,0.6,1.35);g.add(m);const m2=m.clone();m2.position.z=-1.35;g.add(m2);});
    g.position.set(p.x,y,p.z);g.rotation.y=p.a+Math.PI/2;g.traverse(o=>{if(o.isMesh)o.castShadow=true;});scene.add(g);});
  hochs.forEach(p=>{const g=new THREE.Group(),y=gnd(p.x,p.z),cab=(w,h,d,m,px,py,pz)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(px,py,pz);o.castShadow=true;g.add(o);return o;};
    [[-0.7,-0.7],[0.7,-0.7],[-0.7,0.7],[0.7,0.7]].forEach(q=>cab(0.12,3.4,0.12,mBar,q[0],1.7,q[1]));   // Stuetzen
    cab(1.7,0.1,1.7,mBar,0,3.35,0);                                    // Boden
    cab(1.7,1.0,0.08,mGr,0,3.9,-0.8);cab(0.08,1.0,1.7,mGr,-0.8,3.9,0);cab(0.08,1.0,1.7,mGr,0.8,3.9,0);cab(1.7,0.45,0.08,mGr,0,3.62,0.8);   // Bruestung/Kanzel
    const rf=cab(2.1,0.08,2.1,mRf,0,4.6,0);rf.rotation.x=0.06;
    [[-0.7,0.7],[0.7,0.7]].forEach(q=>{const r=cab(0.07,3.5,0.07,mBar,q[0]*0.5,1.65,q[1]+0.55);r.rotation.x=-0.28;});for(let k=0;k<7;k++)cab(0.9,0.05,0.06,mBar,0,0.4+k*0.45,1.25-k*0.12);   // Leiter
    g.position.set(p.x,y,p.z);g.rotation.y=p.a;scene.add(g);});
  // Strassenlaternen in bebauten Abschnitten (alle ~40 m, wechselseitig), Auslegerkopf zur Fahrbahn
  {const lamps=[];let lastL=-1e9;
    for(let i=4;i<N-4;i++){if(SURF[i]!==0||i*SEG-lastL<38)continue;const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
      if(![-9,9,-16,16].some(q=>inBuilding(PX[i]+rx*q,PZ[i]+rz*q)))continue;
      const side=(lamps.length%2?1:-1),o=(HW[i]+1.5)*side,x=PX[i]+rx*o,z=PZ[i]+rz*o;if(!clearOf(x,z,0.4))continue;lamps.push({x:x,z:z,a:h,side:side});lastL=i*SEG;}
    if(lamps.length){const pm=new THREE.MeshStandardMaterial({color:0x4a4d52,roughness:0.7,metalness:0.4}),hm=new THREE.MeshStandardMaterial({color:0xfff2c0,emissive:0xffe9a8,emissiveIntensity:NIGHT?3.2:0.35,roughness:0.6});hm.userData.dI=0.35;hm.userData.nI=3.2;NT.emi.push(hm);
      const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06,0.09,5.6,8),pm,lamps.length),head=new THREE.InstancedMesh(new THREE.BoxGeometry(0.9,0.14,0.32),hm,lamps.length),arm=new THREE.InstancedMesh(new THREE.BoxGeometry(1.2,0.08,0.08),pm,lamps.length);
      lamps.forEach((l,k)=>{const y=gnd(l.x,l.z),ax=Math.cos(l.a)*l.side*0.55,az=-Math.sin(l.a)*l.side*0.55;   // Richtung zur Fahrbahn = -side * rechts
        DM.rotation.set(0,0,0);DM.scale.set(1,1,1);DM.position.set(l.x,y+2.8,l.z);DM.updateMatrix();pole.setMatrixAt(k,DM.matrix);
        DM.rotation.set(0,l.a+Math.PI/2,0);DM.position.set(l.x+ax,y+5.5,l.z+az);DM.updateMatrix();arm.setMatrixAt(k,DM.matrix);
        DM.position.set(l.x+ax*1.9,y+5.45,l.z+az*1.9);DM.updateMatrix();head.setMatrixAt(k,DM.matrix);NT.lampPts.push([l.x+ax*1.9,l.z+az*1.9]);});
      [pole,arm,head].forEach(m=>{m.castShadow=true;m.frustumCulled=false;scene.add(m);});}}
  // Spurrillen: zwei dunkle Streifen in Schotter- und Trailabschnitten, an den Raendern leicht aufgehellt (Gras in der Mitte)
  {const rp=[],ri=[];let vi=0;
    for(let i=2;i<N-2;i++){if(SURF[i]<1||SURF[i+1]<1){continue;}
      const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),w=SURF[i]===2?0.14:0.11;
      [-0.62,0.62].forEach(o=>{for(let k=0;k<2;k++){const e=k?1:0,j=i+e,hh=HS[j],rx2=-Math.cos(hh),rz2=Math.sin(hh);const ox=Math.min(0.62,HW[j]*0.5)*Math.sign(o);
        [-w,w].forEach(dw=>{const x=PX[j]+rx2*(ox+dw),z=PZ[j]+rz2*(ox+dw);rp.push(x,gnd(x,z)+0.03,z);});}});
      for(let c=0;c<2;c++){const b=vi+c*4;ri.push(b,b+2,b+1,b+1,b+2,b+3);}vi+=8;}
    if(rp.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));g.setIndex(ri);g.computeVertexNormals();
      const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({color:0x24190f,transparent:true,opacity:0.3,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,fog:true,side:THREE.DoubleSide}));m.frustumCulled=false;scene.add(m);}}
}

// ================= Landmarken =================
const UP=new THREE.Vector3(0,1,0),_v=new THREE.Vector3();
const tubeGeo=new THREE.CylinderGeometry(1,1,1,8);
function tube(mat,rad,parent){const m=new THREE.Mesh(tubeGeo,mat);m.scale.set(rad,1,rad);m.castShadow=true;parent.add(m);return m;}
function setTube(m,a,b){_v.subVectors(b,a);const len=_v.length();m.position.copy(a).addScaledVector(_v,0.5);m.quaternion.setFromUnitVectors(UP,_v.normalize());m.scale.y=len;}
const V3=(x,y,z)=>new THREE.Vector3(x,y,z);
// Gipfel: Betonplatte + Leuchtstab
if(!ROUTE)(function(){
  texConcrete.repeat.set(8,8);
  const d=new THREE.Mesh(new THREE.CircleGeometry(31,56),new THREE.MeshStandardMaterial({map:texConcrete,roughness:0.9,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
  d.rotation.x=-Math.PI/2;d.position.y=HTOP+0.02;d.receiveShadow=true;scene.add(d);
  const poleTex=canvasTex(64,1024,(g,w,h)=>{
    const gr=g.createLinearGradient(0,0,w,0);gr.addColorStop(0,'#d9790c');gr.addColorStop(0.5,'#ffc02e');gr.addColorStop(1,'#d9790c');
    g.fillStyle=gr;g.fillRect(0,0,w,h);
    g.fillStyle='rgba(60,30,0,0.75)';for(let y=0;y<h*0.9;y+=46)g.fillRect(0,y,w,4);
    g.fillStyle='#e9e9e4';g.fillRect(0,h*0.9,w,h*0.1);
    g.strokeStyle='#2b6fb8';g.lineWidth=5;g.beginPath();g.moveTo(4,h*0.93);g.bezierCurveTo(30,h*0.9,20,h*0.99,60,h*0.95);g.stroke();
  },false);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,32,20),new THREE.MeshStandardMaterial({map:poleTex,roughness:0.5,emissive:C(0x5a2a00),emissiveIntensity:0.35}));
  pole.position.set(0,HTOP+16,0);pole.castShadow=true;scene.add(pole);
  const rust=new THREE.MeshStandardMaterial({color:C(0x7a4320),roughness:0.9});
  for(let k=0;k<3;k++){
    const an=1.2+k*2.1,g=new THREE.Group();g.position.set(Math.cos(an)*36,HTOP,Math.sin(an)*36);g.rotation.y=-an+Math.PI/2;
    const post=new THREE.Mesh(new THREE.BoxGeometry(0.08,1,0.08),rust);post.position.y=0.5;post.castShadow=true;g.add(post);
    const brd=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.05,0.6),rust);brd.position.y=1.05;brd.rotation.x=0.5;brd.castShadow=true;g.add(brd);
    scene.add(g);
  }
})();
// Zwischenplateau: blauer Leuchtmarker
if(!ROUTE)(function(){
  let i0=SEC.indexOf(2),i1=SEC.lastIndexOf(2);const i=(i0+i1)>>1,h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
  const ra=Math.hypot(PX[i]+rx*8,PZ[i]+rz*8),rb=Math.hypot(PX[i]-rx*8,PZ[i]-rz*8),sg=ra>rb?1:-1;
  const g=new THREE.Group();g.position.set(PX[i]+rx*8*sg,PY[i]-0.15,PZ[i]+rz*8*sg);g.rotation.y=h+0.4;
  const rust=new THREE.MeshStandardMaterial({color:C(0x8a4a1c),roughness:0.85});
  const blue=new THREE.MeshStandardMaterial({color:C(0x2a3fc0),roughness:0.35,emissive:C(0x0a1560),emissiveIntensity:0.4});
  [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(s=>{setTube(tube(rust,0.13,g),V3(s[0]*2.5,0,s[1]*2.5),V3(s[0]*0.75,13.4,s[1]*0.75));});
  const b1=new THREE.Mesh(new THREE.BoxGeometry(3.0,3.4,3.0),blue);b1.position.y=8.4;b1.castShadow=true;g.add(b1);
  const b2=new THREE.Mesh(new THREE.BoxGeometry(2.2,2.4,2.2),blue);b2.position.y=12.4;b2.castShadow=true;g.add(b2);
  scene.add(g);
})();
// Kraftwerk am Horizont
if(!ROUTE)(function(){
  const pp=new THREE.Group();pp.position.set(-1450,-1.5,620);
  const conc=new THREE.MeshLambertMaterial({color:C(0xb9b4a8),side:THREE.DoubleSide});
  const pts=[];for(let i=0;i<=14;i++){const t=i/14;pts.push(new THREE.Vector2(28+24*Math.pow(t-0.75,2)/0.5625,t*130));}
  pp.add(new THREE.Mesh(new THREE.LatheGeometry(pts,28),conc));
  const ch=new THREE.Mesh(new THREE.CylinderGeometry(5,7.5,260,16),new THREE.MeshLambertMaterial({color:C(0xcfccc4)}));ch.position.set(190,130,40);pp.add(ch);
  const b1=new THREE.Mesh(new THREE.BoxGeometry(80,62,55),new THREE.MeshLambertMaterial({color:C(0x6d7f8a)}));b1.position.set(95,31,-10);pp.add(b1);
  const b2=new THREE.Mesh(new THREE.BoxGeometry(42,96,40),new THREE.MeshLambertMaterial({color:C(0x85939b)}));b2.position.set(120,48,-20);pp.add(b2);
  const steam=new THREE.MeshLambertMaterial({color:new THREE.Color(1,1,1),transparent:true,opacity:0.88,emissive:new THREE.Color(0.25,0.25,0.27)});
  const sg=new THREE.SphereGeometry(1,12,8);
  for(let i=0;i<9;i++){const s=new THREE.Mesh(sg,steam);s.position.set(i*36,150+i*15,i*8);s.scale.setScalar(28+i*7);pp.add(s);}
  for(let i=0;i<7;i++){const s=new THREE.Mesh(sg,steam);s.position.set(190+i*22,266+i*6,40+i*4);s.scale.setScalar(7+i*5);pp.add(s);}
  scene.add(pp);
})();
// Start-/Zielbogen, Trail-Schild
function arch(i,img){
  const g=new THREE.Group();g.position.set(PX[i],PY[i],PZ[i]);g.rotation.y=HS[i];
  const w=HW[i]+0.9,mat=new THREE.MeshStandardMaterial({color:C(0x222428),roughness:0.6});
  [-1,1].forEach(s=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,4.4,8),mat);p.position.set(s*w,2.2,0);p.castShadow=true;g.add(p);});
  // Holzschild mit eingefräster Schrift (Bild), beidseitig lesbar
  const bw=w*2+0.2,bh=bw*(img==='schild-start'?251/1312:273/1322);
  const tex=TL.load(ASSETS+'ui/'+img+'.webp');tex.encoding=THREE.sRGBEncoding;tex.anisotropy=8;
  const bm=new THREE.MeshLambertMaterial({map:tex,transparent:true,alphaTest:0.5});
  [0,Math.PI].forEach(ry=>{const b=new THREE.Mesh(new THREE.PlaneGeometry(bw,bh),bm);b.position.set(0,4.3-bh*0.5,ry?-0.02:0.02);b.rotation.y=ry;b.castShadow=ry===0;g.add(b);});
  scene.add(g);
}
arch(6,'schild-start');
arch(N-8,'schild-ziel');
if(!ROUTE)(function(){
  const i=iTrail+3,h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
  const g=new THREE.Group();g.position.set(PX[i]+rx*2.4,PY[i],PZ[i]+rz*2.4);g.rotation.y=h;
  const wood=new THREE.MeshStandardMaterial({color:C(0x6b4a2a),roughness:0.9});
  const p=new THREE.Mesh(new THREE.BoxGeometry(0.1,2,0.1),wood);p.position.y=1;p.castShadow=true;g.add(p);
  const s=new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.45),new THREE.MeshLambertMaterial({map:textTex('HIGHWAY','#3a2a18','#f5d9a0'),side:THREE.DoubleSide}));
  s.position.y=1.8;s.rotation.y=Math.PI;g.add(s);scene.add(g);
})();

await BOOT('Baue Fahrrad …',65);
// ================= Bike & Fahrer =================
const SPH=new THREE.SphereGeometry(1,16,12),BOX=new THREE.BoxGeometry(1,1,1),limbGeos={};
function limb(mat,ra,rb,parent){const k=ra+'_'+rb,geo=limbGeos[k]||(limbGeos[k]=new THREE.CylinderGeometry(rb,ra,1,10));const m=new THREE.Mesh(geo,mat);m.castShadow=true;parent.add(m);return m;}
function ball(mat,parent,x,y,z,sx,sy,sz){const m=new THREE.Mesh(SPH,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
function box(mat,parent,x,y,z,sx,sy,sz){const m=new THREE.Mesh(BOX,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;}
const stdM=(c,r,mt)=>new THREE.MeshStandardMaterial({color:C(c),roughness:r===undefined?0.75:r,metalness:mt||0});
const bike=new THREE.Group();bike.rotation.order='YXZ';scene.add(bike);
const mFrame=stdM(0x1c1f24,0.4,0.5),mAccent=stdM(0x16181c,0.3,0.4),mGold=stdM(0xb8892e,0.3,0.7),mTyre=stdM(0x121212,0.95),mRim=stdM(0x8a8d92,0.4,0.7),mMetal=stdM(0xb8bcc2,0.3,0.8);
const mJersey=stdM(0x3b3f47,0.85),mSleeve=stdM(0x3b3f47,0.85),mShort=stdM(0x4c5058,0.85),mSkin=stdM(0xd9a47c,0.7),mHelmet=stdM(0x141518,0.3),mDark=stdM(0x0e0f11,0.5),mGlove=stdM(0x121315,0.8),mSole=stdM(0xe9e9e6,0.8),mWhite=stdM(0xe6e6e6,0.5),mPad=stdM(0x6e7278,0.6),mShoeR=stdM(0x70757b,0.8);
const wheels=[];
[-0.56,0.6].forEach(z=>{
  const g=new THREE.Group();g.position.set(0,0.36,z);
  const t=new THREE.Mesh(new THREE.TorusGeometry(0.33,0.06,10,30),mTyre);t.rotation.y=Math.PI/2;t.castShadow=true;g.add(t);
  for(let k=0;k<26;k++){const an=k/26*6.283;[-0.03,0,0.03].forEach((ox,oi)=>{const kb=new THREE.Mesh(BOX,mTyre);kb.scale.set(0.022,0.03,0.035);kb.position.set(ox,Math.cos(an+oi*0.12)*0.39,Math.sin(an+oi*0.12)*0.39);kb.rotation.x=an+oi*0.12;g.add(kb);});}
  const r=new THREE.Mesh(new THREE.TorusGeometry(0.282,0.014,6,30),mRim);r.rotation.y=Math.PI/2;g.add(r);
  for(let k=0;k<6;k++){const sp=new THREE.Mesh(BOX,mMetal);sp.scale.set(0.006,0.56,0.006);sp.rotation.x=k*Math.PI/6;g.add(sp);}
  const rot=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.005,18),mMetal);rot.rotation.z=Math.PI/2;rot.position.x=-0.055;g.add(rot);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,0.12,10),mFrame);hub.rotation.z=Math.PI/2;g.add(hub);
  bike.add(g);wheels.push(g);
});
const bR=V3(0,0.36,-0.56),bF=V3(0,0.36,0.6),bBB=V3(0,0.33,-0.08),bS=V3(0,0.96,-0.3),bST=V3(0,0.72,-0.22),bHT=V3(0,0.98,0.4),bHB=V3(0,0.8,0.45);
[[bR,bBB,0.022,mFrame],[bR,bST,0.016,mFrame],[bBB,bS,0.024,mFrame],[bST,bHT,0.028,mAccent],[bBB,bHB,0.036,mAccent],[bHT,bHB,0.032,mFrame],[V3(0,0.62,-0.19),V3(0,0.47,-0.03),0.02,mMetal]]
  .forEach(t=>setTube(tube(t[3],t[2],bike),t[0],t[1]));
[-1,1].forEach(sd=>{setTube(tube(mGold,0.018,bike),V3(sd*0.055,0.78,0.455),V3(sd*0.055,0.58,0.53));setTube(tube(mFrame,0.024,bike),V3(sd*0.055,0.58,0.53),V3(sd*0.055,0.36,0.6));});
box(mFrame,bike,0,0.79,0.455,0.15,0.035,0.05);
setTube(tube(mFrame,0.016,bike),V3(-0.38,1.03,0.38),V3(0.38,1.03,0.38));
setTube(tube(mFrame,0.02,bike),V3(0,0.98,0.4),V3(0,1.03,0.38));
[-1,1].forEach(sd=>setTube(tube(mDark,0.021,bike),V3(sd*0.27,1.03,0.38),V3(sd*0.385,1.03,0.38)));
ball(mShort,bike,0,0.985,-0.3,0.07,0.028,0.14);
const ring=new THREE.Mesh(new THREE.CylinderGeometry(0.085,0.085,0.008,20),mDark);ring.rotation.z=Math.PI/2;ring.position.set(0.06,0.33,-0.08);bike.add(ring);
// Fahrer
const hipC=V3(0,1.02,-0.26),shC=V3(0,1.42,0.1);
const torso=limb(mJersey,0.135,0.17,bike);setTube(torso,hipC,shC);torso.scale.z=0.72;
ball(mJersey,bike,0,1.42,0.1,0.205,0.075,0.1);
ball(mShort,bike,0,1.0,-0.25,0.165,0.11,0.14);
setTube(limb(mSkin,0.05,0.045,bike),V3(0,1.44,0.12),V3(0,1.53,0.18));
const hd=new THREE.Group();hd.position.set(0,1.59,0.2);hd.rotation.x=0.25;bike.add(hd);
ball(mSkin,hd,0,-0.02,0,0.085,0.1,0.095);
ball(mHelmet,hd,0,0.02,-0.005,0.122,0.125,0.142);
box(mHelmet,hd,0,-0.075,0.085,0.15,0.06,0.09);
box(mHelmet,hd,0,0.09,0.15,0.19,0.012,0.13).rotation.x=0.18;
[-0.05,0.05].forEach(x=>box(mWhite,hd,x,0.135,-0.02,0.022,0.012,0.17));
box(mWhite,hd,0,0.03,-0.143,0.12,0.03,0.012);
box(mDark,hd,0,0.01,0.125,0.15,0.05,0.03);
const backTex=canvasTex(512,128,(g,w,h)=>{g.clearRect(0,0,w,h);g.fillStyle='#e8e8e8';g.font='italic bold 58px Arial';g.textAlign='center';g.textBaseline='middle';g.fillText('WENN UND ABER',w/2,h/2);},false);
const backTxt=new THREE.Mesh(new THREE.PlaneGeometry(0.27,0.13),new THREE.MeshLambertMaterial({map:backTex,transparent:true,alphaTest:0.4}));
backTxt.position.set(0,0.2,-0.168);backTxt.rotation.y=Math.PI;torso.add(backTxt);
[-1,1].forEach(sd=>{
  setTube(limb(mSleeve,0.055,0.045,bike),V3(sd*0.2,1.4,0.09),V3(sd*0.275,1.2,0.26));
  ball(mDark,bike,sd*0.275,1.2,0.26,0.052,0.052,0.052);ball(mPad,bike,sd*0.29,1.19,0.25,0.035,0.045,0.04);
  setTube(limb(mDark,0.047,0.04,bike),V3(sd*0.275,1.2,0.26),V3(sd*0.292,1.14,0.31));
  setTube(limb(mSkin,0.04,0.03,bike),V3(sd*0.275,1.2,0.26),V3(sd*0.315,1.07,0.37));
  ball(mGlove,bike,sd*0.318,1.05,0.385,0.04,0.035,0.05);
  box(mWhite,bike,sd*0.168,0.99,-0.2,0.008,0.05,0.16);
});
const legs=[-1,1].map(sd=>{
  const sh=new THREE.Group();bike.add(sh);
  ball(mShoeR,sh,0,0.03,0.02,0.05,0.045,0.13);box(mSole,sh,0,-0.012,0.02,0.09,0.022,0.26);
  return {s:sd,thigh:limb(mShort,0.08,0.06,bike),kn:ball(mDark,bike,0,0,0,0.066,0.066,0.066),shin:limb(mSkin,0.052,0.036,bike),sock:limb(mDark,0.04,0.037,bike),pad:limb(mDark,0.064,0.052,bike),shoe:sh,
    crank:tube(mMetal,0.012,bike),pedal:box(mDark,bike,0,0,0,0.1,0.016,0.07),hip:V3(sd*0.1,1.0,-0.24),knee:V3(0,0,0),foot:V3(0,0,0),t:V3(0,0,0)};
});
function poseLegs(crank){
  legs.forEach(l=>{
    const an=crank+(l.s>0?0:Math.PI),py=0.33+0.17*Math.cos(an),pz=-0.08+0.17*Math.sin(an);
    l.t.set(l.s*0.085,0.33,-0.08);l.foot.set(l.s*0.085,py,pz);setTube(l.crank,l.t,l.foot);
    l.pedal.position.set(l.s*0.13,py,pz);l.shoe.position.set(l.s*0.13,py+0.02,pz+0.02);
    l.foot.set(l.s*0.125,py+0.09,pz-0.04);
    const dy=l.foot.y-l.hip.y,dz=l.foot.z-l.hip.z,len=Math.hypot(dy,dz)||1,dist=Math.min(len,0.87),kk=Math.sqrt(Math.max(0,0.44*0.44-dist*dist/4));
    l.knee.set(l.s*0.125,l.hip.y+dy/2+(dz/len)*kk,l.hip.z+dz/2+(-dy/len)*kk);
    setTube(l.thigh,l.hip,l.knee);setTube(l.shin,l.knee,l.foot);l.kn.position.copy(l.knee);
    l.t.copy(l.knee).lerp(l.foot,0.66);setTube(l.sock,l.t,l.foot);
    l.t.copy(l.knee).lerp(l.foot,0.36);setTube(l.pad,l.knee,l.t);
  });
}
poseLegs(0.6);
bike.traverse(o=>{if(o.isMesh)o.castShadow=true;});

// ================= Joggerinnen (Gegenverkehr auf dem Asphalt) =================
const JOG_LOOKS=[
  {top:0x8a8f96,leg:0x7d8289,hair:0xd9b86a,skin:0xd9a47c,shoe:0x9a9ea4},
  {top:0xd9468a,leg:0x1c1d22,hair:0x5a3a22,skin:0xc98f68,shoe:0xf0f0f0},
  {top:0x2aa39a,leg:0x23304a,hair:0x2a1c14,skin:0xa8714c,shoe:0xe85a2a}
];
const joggers=JOG_LOOKS.map((lk,n)=>{
  const g=new THREE.Group();g.visible=false;scene.add(g);
  const body=new THREE.Group();g.add(body);
  const mTop=stdM(lk.top),mLeg=stdM(lk.leg,0.6),mHair=stdM(lk.hair,0.6),mSk=stdM(lk.skin,0.65),mShoe=stdM(lk.shoe),mLip=stdM(0xa8504a,0.6);
  // Rumpf: Tanktop mit Taille, Leggings mit Bund
  const lo=limb(mTop,0.118,0.125,body);setTube(lo,V3(0,0.99,0),V3(0,1.13,0.005));lo.scale.z=0.8;
  const up=limb(mTop,0.125,0.16,body);setTube(up,V3(0,1.13,0.005),V3(0,1.36,0.015));up.scale.z=0.72;
  ball(mLeg,body,0,0.94,0,0.168,0.125,0.13);
  const wb=limb(mLeg,0.14,0.122,body);setTube(wb,V3(0,0.95,0),V3(0,1.02,0));wb.scale.z=0.82;
  ball(mTop,body,-0.075,1.285,0.095,0.085,0.082,0.078);ball(mTop,body,0.075,1.285,0.095,0.085,0.082,0.078);
  ball(mSk,body,0,1.385,0.005,0.195,0.055,0.095);ball(mSk,body,0,1.36,0.055,0.1,0.05,0.05);
  [-1,1].forEach(sd=>{setTube(tube(mTop,0.014,body),V3(sd*0.085,1.34,0.085),V3(sd*0.075,1.435,0.0));setTube(tube(mTop,0.014,body),V3(sd*0.075,1.435,0.0),V3(sd*0.03,1.33,-0.085));});
  setTube(limb(mSk,0.045,0.04,body),V3(0,1.41,0),V3(0,1.52,0.005));
  // Kopf mit Gesicht und Pferdeschwanz
  ball(mSk,body,0,1.6,0.01,0.09,0.11,0.098);
  [-1,1].forEach(sd=>{ball(mDark,body,sd*0.034,1.615,0.094,0.011,0.009,0.008);box(mHair,body,sd*0.034,1.638,0.097,0.03,0.005,0.006);ball(mSk,body,sd*0.09,1.6,0.0,0.012,0.022,0.014);});
  ball(mSk,body,0,1.59,0.106,0.011,0.014,0.012);box(mLip,body,0,1.562,0.098,0.034,0.008,0.008);
  const hr=new THREE.Mesh(new THREE.SphereGeometry(1,16,12,0,6.283,0,1.85),mHair);hr.scale.set(0.097,0.112,0.108);hr.position.set(0,1.615,-0.012);hr.rotation.x=-0.28;hr.castShadow=true;body.add(hr);
  ball(mHair,body,0,1.68,-0.085,0.04,0.035,0.04);
  const tail=limb(mHair,0.032,0.012,body);
  const L=[-1,1].map(sd=>{
    const sh=new THREE.Group();body.add(sh);
    ball(mShoe,sh,0,0.03,0.035,0.046,0.042,0.12);box(mSole,sh,0,-0.012,0.035,0.086,0.024,0.25);
    return {sd:sd,thigh:limb(mLeg,0.078,0.056,body),kn:ball(mLeg,body,0,0,0,0.056,0.056,0.056),shin:limb(mLeg,0.054,0.035,body),shoe:sh,
      upper:limb(mSk,0.042,0.034,body),el:ball(mSk,body,0,0,0,0.034,0.034,0.034),fore:limb(mSk,0.033,0.025,body),hand:ball(mSk,body,0,0,0,0.028,0.04,0.03),
      watch:sd<0?ball(mSole,body,0,0,0,0.032,0.014,0.032):null};
  });
  g.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  return {g:g,body:body,L:L,tail:tail,s:0,x:-1.2,speed:2.8+n*0.25,phase:n*2,wait:n===0?0:6+n*11,active:false};
});
const jA=V3(0,0,0),jB=V3(0,0,0),jC=V3(0,0,0),jS={x:0,y:0,z:0,h:0};
function poseJogger(j){
  const ph=j.phase;
  j.body.position.y=Math.abs(Math.sin(ph))*0.05;
  j.body.rotation.x=0.07;
  j.L.forEach(l=>{
    const q=ph+(l.sd>0?0:Math.PI),a=Math.sin(q),th=a*0.7,be=0.3+Math.max(0,-a)*1.25+Math.max(0,Math.cos(q))*0.5;
    jA.set(l.sd*0.085,0.92,0);jB.set(l.sd*0.085,0.92-Math.cos(th)*0.43,Math.sin(th)*0.43);
    jC.set(l.sd*0.085,jB.y-Math.cos(th-be)*0.43,jB.z+Math.sin(th-be)*0.43);
    setTube(l.thigh,jA,jB);setTube(l.shin,jB,jC);l.kn.position.copy(jB);
    l.shoe.position.set(jC.x,jC.y-0.03,jC.z);l.shoe.rotation.x=-(th-be)*0.7;
    const al=-a*0.65;
    jA.set(l.sd*0.2,1.385,0);jB.set(l.sd*0.215,1.385-Math.cos(al)*0.27,Math.sin(al)*0.27);
    jC.set(l.sd*0.185,jB.y-Math.cos(al+1.45)*0.24,jB.z+Math.sin(al+1.45)*0.24);
    setTube(l.upper,jA,jB);setTube(l.fore,jB,jC);l.el.position.copy(jB);
    l.hand.position.copy(jC).addScaledVector(jC.clone().sub(jB).normalize(),0.03);
    if(l.watch)l.watch.position.copy(jB).lerp(jC,0.82);
  });
  jA.set(0,1.69,-0.1);jB.set(Math.sin(ph)*0.08,1.43+Math.abs(Math.cos(ph))*0.05,-0.21);setTube(j.tail,jA,jB);
}
// Mixamo-Joggerin: ersetzt die Platzhalter-Figuren, sobald das Modell geladen ist
[['joggerin.glb',n=>n%2===0,1.68],['jogger.glb',n=>n%2===1,1.82]].forEach(([file,pick,hM])=>new GLTFLoader().load(ASSETS+'models/'+file,gltf=>{   // Mixamo-Figuren (Joggerin/Jogger im Wechsel): ersetzen die Platzhalter, sobald geladen
  const fbx=gltf.scene,box=new THREE.Box3().setFromObject(fbx),h=box.max.y-box.min.y||170,k=hM/h;
  const clip=gltf.animations[0];
  console.log(file+' geladen: Hoehe',h.toFixed(1),'Clips',gltf.animations.length,clip?clip.name+' '+clip.duration.toFixed(2)+'s':'-');
  joggers.forEach((j,n)=>{
    if(!pick(n))return;
    const m=SkeletonUtils.clone(fbx);
    m.scale.setScalar(k*(0.97+n*0.03));
    m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
    j.body.visible=false;j.g.add(m);
    j.mixer=new THREE.AnimationMixer(m);
    if(clip){const a=j.mixer.clipAction(clip);a.play();a.time=n*0.37;}
  });
},undefined,e=>console.warn(file+' nicht geladen, Platzhalter bleiben',e&&e.message)));
function resetJoggers(){joggers.forEach((j,n)=>{j.active=false;j.g.visible=false;j.wait=n===0?0.5:6+n*11;});}
function downAt(sPos){   // Abfahrtsstueck? mittleres Gefaelle +-30 m unter -4 %
  const i0=Math.floor(sPos/SEG);let a=0,n=0;for(let i=Math.max(0,i0-15);i<=Math.min(N-1,i0+15);i+=3){a+=GR[i];n++;}return n>0&&a/n<-4;
}
function updateJoggers(dt){
  if(WX===2||NIGHT){joggers.forEach(j=>{if(j.active||j.g.visible){j.active=false;j.g.visible=false;}j.wait=Math.max(j.wait,8);});return;}   // bei Regen und in der Dunkelheit ist niemand joggen
  const sMax=ROUTE?TOTAL-40:(iTrail-30)*SEG;
  joggers.forEach(j=>{
    if(!j.active){
      j.wait-=dt;
      if(j.wait<=0){
        const s=st.pos+170+Math.random()*230;
        if(s<sMax&&SURF[Math.floor(s/SEG)]<2&&!downAt(s)){j.s=s;j.x=-(0.85+Math.random()*0.6);j.active=true;j.g.visible=true;}
        else j.wait=4;
      }
      return;
    }
    j.s-=j.speed*dt;j.phase+=dt*9.5;
    if(j.s<st.pos-30||j.s<4||(ROUTE&&SURF[Math.floor(j.s/SEG)]===2)||downAt(j.s)){j.active=false;j.g.visible=false;j.wait=7+Math.random()*16;return;}
    if(window.__vans&&window.__vans.some(c=>!c.parked&&c.active&&Math.abs(c.s-j.s)<10)){j.active=false;j.g.visible=false;j.wait=6+Math.random()*10;return;}   // nie durch ein Auto laufen
    if(Math.abs(j.s-st.pos)<1.1&&Math.abs(j.x-st.x)<0.55)st.v*=0.4;   // Rempler bremst
    sample(j.s,jS);
    j.g.position.set(jS.x-Math.cos(jS.h)*j.x,jS.y+0.05,jS.z+Math.sin(jS.h)*j.x);
    j.g.rotation.y=jS.h+Math.PI;
    if(j.mixer)j.mixer.update(dt*j.speed/3.0);else poseJogger(j);
  });
}



// ================= Bildschirm dauerhaft an (iPad: kein Ruhezustand während der Fahrt) =================
const WAKE={lock:null,vid:null};
async function wakeOn(){
  try{if('wakeLock' in navigator&&!WAKE.lock){WAKE.lock=await navigator.wakeLock.request('screen');WAKE.lock.addEventListener('release',()=>{WAKE.lock=null;});}}catch(_){}
  try{   // Fallback (aelteres iOS / Bluefy): winziges stummes Video in Endlosschleife haelt das Display wach
    if(!WAKE.vid){const v=document.createElement('video');v.setAttribute('playsinline','');v.setAttribute('muted','');v.muted=true;v.loop=true;v.setAttribute('loop','');v.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';v.src='data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAN0bW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAp50cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAQAAABAAAAAAIWbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAKABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABwW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAYFzdGJsAAAAvXN0c2QAAAAAAAAAAQAAAK1hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAM2F2Y0MBZAAK/+EAGGdkAAqs2UQmwEQAAAMABAAAAwAoPEiWWAEABGjvj8v9+PgAAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAAGEgAABhIAAAAGHN0dHMAAAAAAAAAAQAAAAUAAAgAAAAAFHN0c3MAAAAAAAAAAQAAAAEAAAA4Y3R0cwAAAAAAAAAFAAAAAQAAEAAAAAABAAAoAAAAAAEAABAAAAAAAQAAAAAAAAABAAAIAAAAABxzdHNjAAAAAAAAAAEAAAABAAAABQAAAAEAAAAoc3RzegAAAAAAAAAAAAAABQAAAtcAAAAOAAAADAAAAAwAAAAMAAAAFHN0Y28AAAAAAAAAAQAAA6QAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYwLjE2LjEwMAAAAAhmcmVlAAADEW1kYXQAAAKqBgX//6bcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MSBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MyBtZT1oZXggc3VibWU9MiBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MCA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0wIHRocmVhZHM9MiBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTMgYl9weXJhbWlkPTIgYl9hZGFwdD0xIGJfYmlhcz0wIGRpcmVjdD0xIHdlaWdodGI9MSBvcGVuX2dvcD0wIHdlaWdodHA9MSBrZXlpbnQ9MjUwIGtleWludF9taW49NSBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTEwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAACVliIQAEv/k/wXg/vQ7X3ez/vvHfmmVQnXZBrTT8RDyYsSIbQHnAAAACkGaJBiH//6pnTQAAAAIQZ5CQgh/AscAAAAIAZ5hRD//BMQAAAAIAZ5jRD//BMU=';document.body.appendChild(v);WAKE.vid=v;}
    if(WAKE.vid.paused)await WAKE.vid.play();
  }catch(_){}
}
['pointerdown','touchend','keydown','click'].forEach(ev=>window.addEventListener(ev,wakeOn,{passive:true}));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wakeOn();});
setInterval(()=>{if(document.visibilityState==='visible'&&(!WAKE.lock||(WAKE.vid&&WAKE.vid.paused)))wakeOn();},15000);

// iPad/iPhone: Safari kennt kein Web Bluetooth -> beim ersten Koppelversuch einmalig auf Bluefy hinweisen (in Bluefy selbst erscheint nichts)
const IOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function bleGuard(){
  if(BLE_OK||!IOS)return false;
  let seen=false;try{seen=localStorage.getItem('miworu_bluefy_hint')==='1';}catch(_){}
  if(seen)return false;
  try{localStorage.setItem('miworu_bluefy_hint','1');}catch(_){}
  const d=document.createElement('div');d.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif';
  const bx='padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.08);color:#fff;font:600 15px system-ui;text-decoration:none;text-align:center;cursor:pointer';
  d.innerHTML='<div style="max-width:420px;background:#1b1b1b;color:#fff;border-radius:14px;padding:22px;box-shadow:0 10px 40px #000"><div style="font:700 20px system-ui;margin-bottom:10px">Bluetooth am iPad</div><div style="font-size:15px;line-height:1.45;opacity:.9;margin-bottom:16px">Safari kann am iPad keine Trainer oder Zwift Click koppeln. Installiere dafür einmalig die kostenlose App <b>Bluefy</b> und öffne MIWORU darin: Adresse hier kopieren, in Bluefy einfügen.</div><div style="display:flex;flex-direction:column;gap:8px"><a href="https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055" target="_blank" rel="noopener" style="'+bx+';background:#f5a524;color:#111;border-color:#f5a524">Bluefy im App Store</a><button id="bfCopy" style="'+bx+'">Spiel-Adresse kopieren</button><button id="bfOk" style="'+bx+'">Verstanden</button></div></div>';
  document.body.appendChild(d);
  d.querySelector('#bfOk').onclick=()=>d.remove();
  d.querySelector('#bfCopy').onclick=async e=>{try{await navigator.clipboard.writeText(location.href.split('#')[0]);e.target.textContent='Kopiert ✓';}catch(_){e.target.textContent=location.href.split('#')[0];}};
  return true;
}
await BOOT('Baue Häuser und Gewässer …',72);
// ================= Gebäude und Gewässer (OpenStreetMap) =================
if(OSM){
  // --- Fassaden- und Dachtexturen (im Code erzeugt, Kachel = 5 m breit x 6 m hoch bzw. 1,6 m Ziegelreihen) ---
  const mkTex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tx=new THREE.CanvasTexture(c);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.anisotropy=4;tx.encoding=THREE.sRGBEncoding;return tx;};
  const noise=(x,w,h,n,a)=>{for(let i=0;i<n;i++){const v=Math.random()<0.5?0:255;x.fillStyle='rgba('+v+','+v+','+v+','+(Math.random()*a)+')';x.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);}};
  const FW=[];   // Fensterrechtecke der Fassadenkachel (fuer die Nacht-Leuchtkarte)
  const facadeTex=mkTex(2048,512,(x,w,h)=>{   // Kachel 24 m x 6 m, acht Fensterachsen, zwei Geschosse; Fenster je Achse verschieden, dazu Rollladen, Vorhaenge, Tuer, Balkon, Putzflecken, Regenspuren
    const R=(a,b)=>a+Math.random()*(b-a),px=85;   // Pixel je Meter
    x.fillStyle='#f3efe6';x.fillRect(0,0,w,h);noise(x,w,h,16000,0.06);
    for(let i=0;i<90;i++){const g=x.createRadialGradient(0,0,0,0,0,1);x.save();x.translate(R(0,w),R(0,h));x.scale(R(20,90),R(15,60));x.fillStyle='rgba('+(Math.random()<0.5?'60,55,45':'255,255,250')+','+R(0.02,0.06)+')';x.beginPath();x.arc(0,0,1,0,7);x.fill();x.restore();}   // Putzflecken
    const door=-1;
    for(let b=0;b<8;b++){
      const cx=b*256+128+R(-14,14);
      for(let f=0;f<2;f++){   // f=0 oben (v=0.5..1 liegt unten im Bild, siehe unten): oben im Bild = Obergeschoss
        const ground=f===1,cy=(f?0.75:0.25)*h+R(-4,4);
        if(ground&&b===door){   // Haustuer mit Stufe und Oberlicht
          const dw=1.0*px,dh=2.1*px,y1=h-18;x.fillStyle='#cfc8ba';x.fillRect(cx-dw/2-8,y1-dh-8,dw+16,dh+8);
          x.fillStyle=['#6b4a33','#3f5a49','#4a4e55','#7a2f2a'][(Math.random()*4)|0];x.fillRect(cx-dw/2,y1-dh,dw,dh);
          x.fillStyle='rgba(180,205,220,0.55)';x.fillRect(cx-dw/2+8,y1-dh+10,dw-16,dh*0.3);x.fillStyle='#d9d3c6';x.fillRect(cx-dw/2-12,y1,dw+24,7);continue;}
        const upper=!ground&&Math.random()<0.18,type=upper?3:(Math.random()*5)|0;   // 3 = Balkontuer
        let ww=[1.15,0.75,1.7,1.0,1.2][type]*px*R(0.92,1.08),wh=(type===3?2.0:ground?1.35:1.5)*px*R(0.94,1.06);
        if(type===3)ww=1.0*px;
        const y0=type===3?cy+0.55*px-wh:cy-wh/2;
        x.fillStyle='rgba(120,112,98,0.20)';x.fillRect(cx-ww/2-6,y0-6,ww+12,wh+12);   // Laibung / Schatten
        x.fillStyle=Math.random()<0.8?'#ece8df':'#d4cdbf';x.fillRect(cx-ww/2-4,y0-4,ww+8,wh+8);
        const gr=x.createLinearGradient(0,y0,0,y0+wh),k=R(0,1);gr.addColorStop(0,'rgb('+(95+k*45)+','+(125+k*40)+','+(150+k*35)+')');gr.addColorStop(0.5,'rgb('+(48+k*25)+','+(62+k*22)+','+(80+k*20)+')');gr.addColorStop(1,'rgb(30,40,52)');
        FW.push([cx-ww/2,y0,ww,wh]);x.fillStyle=gr;x.fillRect(cx-ww/2,y0,ww,wh);
        if(Math.random()<0.45){x.fillStyle='rgba(235,225,205,'+R(0.45,0.8)+')';x.fillRect(cx-ww/2,y0,ww*R(0.25,0.4),wh*R(0.7,1));x.fillRect(cx+ww/2-ww*R(0.2,0.35),y0,ww*0.3,wh*R(0.5,0.9));}   // Gardinen
        if(Math.random()<0.2){const hh=wh*R(0.3,0.7);x.fillStyle='#b8b3a6';x.fillRect(cx-ww/2,y0,ww,hh);x.fillStyle='rgba(0,0,0,0.2)';for(let l=3;l<hh;l+=6)x.fillRect(cx-ww/2,y0+l,ww,1.5);}   // Rollladen / Jalousie halb unten
        x.fillStyle='rgba(255,255,255,0.18)';x.beginPath();x.moveTo(cx-ww/2,y0+wh);x.lineTo(cx-ww/2,y0+wh*0.35);x.lineTo(cx-ww/2+ww*0.55,y0);x.lineTo(cx-ww/2+ww*0.8,y0);x.closePath();x.fill();   // Spiegelung
        x.fillStyle='#f7f5ef';const fr=type===1?4:3.5;x.fillRect(cx-ww/2,y0,ww,fr);x.fillRect(cx-ww/2,y0+wh-fr,ww,fr);x.fillRect(cx-ww/2,y0,fr,wh);x.fillRect(cx+ww/2-fr,y0,fr,wh);
        if(type!==1)x.fillRect(cx-1.5,y0,3,wh);if(type===2)x.fillRect(cx-ww/4-1.5,y0,3,wh),x.fillRect(cx+ww/4-1.5,y0,3,wh);
        if(type===0||type===4||type===3&&false)x.fillRect(cx-ww/2,y0+wh*0.35,ww,3);   // Kaempfer
        if(type!==3){x.fillStyle='#bdb6a8';x.fillRect(cx-ww/2-9,y0+wh+4,ww+18,6);x.fillStyle='rgba(0,0,0,0.18)';x.fillRect(cx-ww/2-9,y0+wh+10,ww+18,3);   // Fensterbank mit Schatten
          const sg=x.createLinearGradient(0,y0+wh+10,0,y0+wh+10+R(40,110));sg.addColorStop(0,'rgba(70,62,50,0.16)');sg.addColorStop(1,'rgba(70,62,50,0)');x.fillStyle=sg;x.fillRect(cx-ww/2+4,y0+wh+10,ww-8,120);}   // Regenspur
        else{x.fillStyle='#8d8a84';for(let r=0;r<=9;r++)x.fillRect(cx-ww/2-6+r*(ww+12)/9,y0+wh-0.55*px,3,0.55*px);x.fillRect(cx-ww/2-8,y0+wh-0.55*px,ww+16,4);x.fillRect(cx-ww/2-8,y0+wh,ww+16,5);}   // Balkongelaender
        if(!ground&&type===0&&Math.random()<0.15){x.fillStyle='#5a4636';x.fillRect(cx-ww/2-3,y0+wh+8,ww+6,16);x.fillStyle='#4f7a3b';for(let q=0;q<9;q++)x.fillRect(cx-ww/2+q*ww/9,y0+wh-2+R(-5,3),ww/9+2,12);}   // Blumenkasten
      }
    }
    x.fillStyle='rgba(0,0,0,0.12)';x.fillRect(0,h-7,w,7);   // Sockel
    for(let i=0;i<40;i++){x.fillStyle='rgba(60,55,45,'+R(0.02,0.05)+')';x.fillRect(R(0,w),0,R(1,4),h);}   // feine Putzstreifen
  });
  const plainTex=mkTex(1024,512,(x,w,h)=>{   // Hallen, Garagen, Industrie: Putz bzw. Trapezblech/Betonplatten, kaum Oeffnungen (Kachel 12 m x 6 m)
    const R=(a,b)=>a+Math.random()*(b-a);x.fillStyle='#d9d6cd';x.fillRect(0,0,w,h);noise(x,w,h,9000,0.07);
    x.fillStyle='rgba(60,60,55,0.16)';for(let i=0;i<w;i+=128)x.fillRect(i,0,3,h);   // Plattenfugen alle 1,5 m
    x.fillStyle='rgba(0,0,0,0.05)';for(let i=0;i<w;i+=12)x.fillRect(i,0,5,h);   // Trapezblech-Rippen
    for(let i=0;i<60;i++){x.fillStyle='rgba('+(Math.random()<0.5?'50,48,40':'255,255,250')+','+R(0.02,0.06)+')';x.beginPath();x.ellipse(R(0,w),R(0,h),R(20,90),R(15,60),0,0,7);x.fill();}
    const b=(Math.random()*3)|0,cx=256+b*300;   // hoechstens ein Tor oder Fensterband je Kachel
    if(Math.random()<0.6){x.fillStyle='#6f757a';x.fillRect(cx-110,h-230,220,226);x.fillStyle='rgba(0,0,0,0.25)';for(let y=h-226;y<h-4;y+=22)x.fillRect(cx-110,y,220,2);}   // Rolltor
    if(Math.random()<0.5){x.fillStyle='#4b5560';x.fillRect(120,70,300,46);x.fillStyle='rgba(255,255,255,0.15)';x.fillRect(120,70,300,12);}   // schmales Fensterband
    for(let i=0;i<30;i++){const g=x.createLinearGradient(0,0,0,R(60,200));const xx=R(0,w);g.addColorStop(0,'rgba(60,55,45,0.12)');g.addColorStop(1,'rgba(60,55,45,0)');x.fillStyle=g;x.fillRect(xx,0,R(2,8),220);}   // Regenspuren
    x.fillStyle='rgba(0,0,0,0.12)';x.fillRect(0,h-7,w,7);
  });
  const roofTex=mkTex(128,128,(x,w,h)=>{
    x.fillStyle='#fff';x.fillRect(0,0,w,h);const rows=8,rh=h/rows;
    for(let r=0;r<rows;r++){for(let c=0;c<8;c++){const ox=(r%2)*w/16,v=200+Math.random()*55|0;x.fillStyle='rgb('+v+','+(v-8)+','+(v-14)+')';x.fillRect(c*w/8+ox,r*rh,w/8-1.5,rh-1);}
      x.fillStyle='rgba(0,0,0,0.35)';x.fillRect(0,r*rh+rh-2,w,2);}
    noise(x,w,h,900,0.12);
  });
  const wallC=[0xf0eadc,0xe6dccb,0xd6c3a6,0xc2674f,0xefe9de,0xcfc9bf,0xdcc9a6,0xe9d9b8].map(c=>new THREE.Color(c)),roofC=[0xb5593f,0x9a4a38,0x6a6f75,0x5c5a60,0xa8664a,0x7a3f31].map(c=>new THREE.Color(c));
  const wallG=[],wallP=[],roofG=[];
  const uvWall=(g,plain,tw)=>{const p=g.attributes.position,nr=g.attributes.normal,bt=g.attributes.btop,wuA=g.attributes.wu,wlA=g.attributes.wl,uv=new Float32Array(p.count*2);
    for(let v=0;v<p.count;v++){
      if(plain||Math.abs(nr.getY(v))>0.5){uv[v*2]=0.03;uv[v*2+1]=0.03;continue;}   // Dachflaechen/Kappen: neutraler Fleck der Fassadentextur
      const nx=nr.getX(v),nz=nr.getZ(v),tx=-nz,tz=nx,wl=wlA?wlA.getX(v):0;uv[v*2]=wl>0?((p.getX(v)*tx+p.getZ(v)*tz)-wuA.getX(v))/wl*Math.max(1,Math.round(wl/3))/8:(p.getX(v)*tx+p.getZ(v)*tz)/(tw||24);uv[v*2+1]=bt?1+Math.min(0,(p.getY(v)-bt.getX(v))/6):p.getY(v)/6;}   // Fensterreihen von der Traufe nach unten gezaehlt: nie von der Dachkante abgeschnitten

    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));if(bt)g.deleteAttribute('btop');if(wuA){g.deleteAttribute('wu');g.deleteAttribute('wl');}};
  const setTop=(g,y)=>{const n=g.attributes.position.count,a=new Float32Array(n).fill(y);g.setAttribute('btop',new THREE.BufferAttribute(a,1));};
  const tint=(g,col,sh)=>{const n=g.attributes.position.count,cl=new Float32Array(n*3);for(let v=0;v<n;v++){cl[v*3]=col.r*sh;cl[v*3+1]=col.g*sh;cl[v*3+2]=col.b*sh;}g.setAttribute('color',new THREE.BufferAttribute(cl,3));};
  const hitsRoute=P=>{   // Strecke laeuft durch das Gebaeude (oder dicht an der Wand): entfernen
    if(P.length<6)return false;let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
    for(let i=0;i<P.length;i+=2){x0=Math.min(x0,P[i]);x1=Math.max(x1,P[i]);z0=Math.min(z0,P[i+1]);z1=Math.max(z1,P[i+1]);}
    for(let cx=Math.floor((x0-1)/CELL);cx<=Math.floor((x1+1)/CELL);cx++)for(let cz=Math.floor((z0-1)/CELL);cz<=Math.floor((z1+1)/CELL);cz++){
      const a=allHash.get((cx+500)*1000+cz+500);if(!a)continue;
      for(let k=0;k<a.length;k++){const x=PX[a[k]],z=PZ[a[k]];if(x<x0-1||x>x1+1||z<z0-1||z>z1+1)continue;
        {let c=false;for(let u=0,w=P.length-2;u<P.length;w=u,u+=2){if((P[u+1]>z)!==(P[w+1]>z)&&x<(P[w]-P[u])*(z-P[u+1])/(P[w+1]-P[u+1])+P[u])c=!c;}if(c)return true;}
        for(let i=0;i<P.length;i+=2){const ax=P[i],az=P[i+1],bx=P[(i+2)%P.length],bz=P[(i+3)%P.length],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),ex=ax+dx*t-x,ez=az+dz*t-z;if(ex*ex+ez*ez<0.64)return true;}
      }}
    return false;};
  const buildLod2=()=>{
    const wP=[],wC=[],wT=[],wP2=[],wC2=[],wT2=[],rP=[],rC=[],rU=[],rB=[],wU=[],wLn=[];let curU0=0,curL=0;
    const HX={door:[],step:[],can:[],chim:[],bin:[],hedge:[],mail:[],mailp:[]};   // Haus-Ausstattung (Bergkamen): Tuer, Stufe, Vordach, Schornstein, Tonnen, Hecken
    const ROADSEG=[];if(MW&&OBJ_RAW)OBJ_RAW.lines.forEach(L=>{if(L[0]!=='road')return;const e=L[2]||{};if(e.u||e.br||!/^(residential|tertiary|secondary|unclassified|living_street|service)$/.test(e.h||''))return;const q=L[1];for(let i=0;i+3<q.length;i+=2)ROADSEG.push([q[i],q[i+1],q[i+2],q[i+3]]);});
    const triOf=V=>{
      const n=V.length;let nx=0,ny=0,nz=0;
      for(let i=0;i<n;i++){const a=V[i],b=V[(i+1)%n];nx+=(a[1]-b[1])*(a[2]+b[2]);ny+=(a[2]-b[2])*(a[0]+b[0]);nz+=(a[0]-b[0])*(a[1]+b[1]);}
      const l=Math.hypot(nx,ny,nz)||1;let t;
      if(n===3)t=[[0,1,2]];else if(n===4)t=[[0,1,2],[0,2,3]];
      else{const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
        const pr=ay>=ax&&ay>=az?V.map(v=>new THREE.Vector2(v[0],v[2])):ax>=az?V.map(v=>new THREE.Vector2(v[1],v[2])):V.map(v=>new THREE.Vector2(v[0],v[1]));
        t=THREE.ShapeUtils.triangulateShape(pr,[]);}
      return {t:t,n:[nx/l,ny/l,nz/l]};
    };
    let curTop=0;const pushT=(arr,carr,V,t,col,sh)=>{t.forEach(tr=>tr.forEach(k=>{arr.push(V[k][0],V[k][1],V[k][2]);carr.push(col.r*sh,col.g*sh,col.b*sh);if(arr===wP){wT.push(curTop);wU.push(curU0);wLn.push(curL);}else if(arr===wP2)wT2.push(curTop);}));};
    const flatC=new THREE.Color(0x5f5c59);
    const RSG=new Map(),RK=(x,z)=>Math.floor(x/60)*100000+Math.floor(z/60);ROADSEG.forEach(r=>{const x0=Math.floor((Math.min(r[0],r[2])-60)/60),x1=Math.floor((Math.max(r[0],r[2])+60)/60),z0=Math.floor((Math.min(r[1],r[3])-60)/60),z1=Math.floor((Math.max(r[1],r[3])+60)/60);if((x1-x0+1)*(z1-z0+1)>400)return;for(let a=x0;a<=x1;a++)for(let c=z0;c<=z1;c++){const k=a*100000+c;(RSG.get(k)||RSG.set(k,[]).get(k)).push(r);}});
    const houseExtras=(Hh,pitched)=>{   // Tuer zur Strasse, Stufe, Vordach, Schornstein, Muelltonnen, Vorgartenhecke
      const cx=Hh.cx,cz=Hh.cz;let bx=0,bz=0,bd=60;(window.__hc=window.__hc||[]).push(cx,cz);
      {const f=nearest(allHash,cx,cz);if(f&&nD<bd){bd=nD;bx=PX[nI];bz=PZ[nI];}}
      const RL=RSG.get(RK(cx,cz))||[];for(let i=0;i<RL.length;i++){const r=RL[i],dx=r[2]-r[0],dz=r[3]-r[1],l2=dx*dx+dz*dz||1,t=clamp(((cx-r[0])*dx+(cz-r[1])*dz)/l2,0,1),px=r[0]+dx*t,pz=r[1]+dz*t,d=Math.hypot(cx-px,cz-pz);if(d<bd){bd=d;bx=px;bz=pz;}}
      if(bd>=60)return;
      const vx=(bx-cx)/(bd||1),vz=(bz-cz)/(bd||1);let best=null,bs=0.55;
      Hh.faces.forEach(f=>{const sc=f.nx*vx+f.nz*vz;if(sc>bs&&f.L>=5){bs=sc;best=f;}});
      const gyH=Hh.gy;
      if(best){const f=best,nA=Math.max(1,Math.round(f.L/3)),i0=Math.floor(nA/2),uc=f.u0+(i0+0.5)/nA*f.L,cc=f.cx*f.tx+f.cz*f.tz,px=f.cx+f.tx*(uc-cc),pz=f.cz+f.tz*(uc-cc),ry=Math.atan2(f.nx,f.nz),g0=gnd(px+f.nx*0.4,pz+f.nz*0.4);
        const col=[0x6b4a33,0x3f5a49,0x4a4e55,0x7a2f2a,0x2f3f58,0xd8d4c8][(rnd()*6)|0];
        HX.door.push({x:px+f.nx*0.06,y:gyH+1.05,z:pz+f.nz*0.06,ry:ry,c:col});
        HX.step.push({x:px+f.nx*0.32,y:gyH+0.06,z:pz+f.nz*0.32,ry:ry});
        HX.can.push({x:px+f.nx*0.55,y:gyH+2.42,z:pz+f.nz*0.55,ry:ry});
        const nb=1+((rnd()*2)|0);for(let k=0;k<nb;k++){const sd=(rnd()<0.5?-1:1)*(1.9+k*0.7),qx=px+f.tx*sd+f.nx*0.55,qz=pz+f.tz*sd+f.nz*0.55;if(inBuilding(qx,qz))continue;
          HX.bin.push({x:qx,y:gnd(qx,qz)+0.5,z:qz,ry:ry+(rnd()-0.5)*0.4,c:[0x4a4d52,0x2f5f9a,0xe3c21a,0x6b4a2a][(rnd()*4)|0]});}
        if(rnd()<0.8){const mx=px+f.tx*1.5+f.nx*4.6,mz=pz+f.tz*1.5+f.nz*4.6;if(!inBuilding(mx,mz)){const my=gnd(mx,mz);HX.mailp.push({x:mx,y:my+0.5,z:mz,ry:ry});HX.mail.push({x:mx,y:my+1.08,z:mz,ry:ry,c:[0xe3c21a,0x3f5a6b,0x7a2f2a,0xb8b8b0][(rnd()*4)|0]});}}
        if(rnd()<0.7){   // Vorgartenhecke parallel zur Fassade, Luecke vor der Tuer
          const hd=3.8+rnd()*0.8,halfL=Math.max(1.5,f.L*0.5-0.8);
          [[-1],[1]].forEach(([sg])=>{const a0=1.0,a1=halfL;if(a1-a0<1.2)return;const mid=(a0+a1)/2,len=a1-a0,qx=px+f.tx*sg*mid+f.nx*hd,qz=pz+f.tz*sg*mid+f.nz*hd;
            if(inBuilding(qx,qz))return;const nr=nearest(allHash,qx,qz);if(nr&&nD<(HW[nI]||2)+1.4)return;
            HX.hedge.push({x:qx,y:gnd(qx,qz)+0.4,z:qz,ry:ry+Math.PI/2*0,len:len,tl:Math.atan2(f.tx,f.tz)});});}
      }
      if(pitched&&Hh.top.y>-1e8&&rnd()<0.65){const dx=cx-Hh.top.x,dz=cz-Hh.top.z,dl=Math.hypot(dx,dz)||1;HX.chim.push({x:Hh.top.x+dx/dl*1.3,y:Hh.top.y-0.15,z:Hh.top.z+dz/dl*1.3});}
    };
    LOD2.b.forEach(poly=>{
      {const fp=[];poly.forEach(f=>{if(f[0]==='g'){const q=f[1];for(let i=0;i<q.length/3;i++)fp.push(q[i*3],q[i*3+2]);}});if(ROUTE&&!CUS&&hitsRoute(fp))return;
        {let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,y0=1e9,y1=-1e9;for(let i=0;i<fp.length;i+=2){x0=Math.min(x0,fp[i]);x1=Math.max(x1,fp[i]);z0=Math.min(z0,fp[i+1]);z1=Math.max(z1,fp[i+1]);}poly.forEach(f=>{const q=f[1];for(let i=1;i<q.length;i+=3){y0=Math.min(y0,q[i]);y1=Math.max(y1,q[i]);}});
        if(x1-x0<7.5&&z1-z0<7.5&&y1-y0>16)return;}}   // Strommasten stecken im LoD2 als schlanke Hochhaeuser: weglassen, sie werden als Gittermasten gebaut
      const wc=wallC[(rnd()*wallC.length)|0],rc=roofC[(rnd()*roofC.length)|0],sh=0.92+rnd()*0.14,rb={a:rC.length,b:0,pts:[],sh:sh};
      {let tp=1e9,mx=-1e9;poly.forEach(f=>{if(f[0]!=='w')return;const q=f[1];let m=-1e9;for(let i=1;i<q.length;i+=3)m=Math.max(m,q[i]-NHN0);tp=Math.min(tp,m);mx=Math.max(mx,m);});curTop=tp<1e8?tp:mx;}
      let cwP=wP,cwC=wC;{const gf=poly.find(f=>f[0]==='g');if(gf){const q=gf[1],n=q.length/3;let ar=0,gy=1e9,cx=0,cz=0;for(let i=0;i<n;i++){const j=(i+1)%n;ar+=q[i*3]*q[j*3+2]-q[j*3]*q[i*3+2];gy=Math.min(gy,q[i*3+1]-NHN0);cx+=q[i*3];cz+=q[i*3+2];}ar=Math.abs(ar)/2;cx/=n;cz/=n;const H=curTop-gy,hs=Math.abs(Math.sin(cx*12.9898+cz*78.233)*43758.5453)%1;   // Hallen, Garagen, Gewerbe: ohne Fensterreihen
        if(ar>500||H<3.8||(H<9&&ar>300)||hs<0.2||(H>11&&ar<220&&H>2.2*Math.sqrt(ar))||H>26){cwP=wP2;cwC=wC2;}}}   // Traufhoehe: niedrigste Oberkante der Waende
      const HW_={faces:[],top:{y:-1e9,x:0,z:0},gy:1e9,cx:0,cz:0,n:0};
      poly.forEach(f=>{
        const k=f[0],q=f[1],n=q.length/3,V=[];curL=0;curU0=0;
        for(let i=0;i<n;i++)V.push([q[i*3],q[i*3+1]-NHN0,q[i*3+2]]);
        if(k==='g'){HW_.n=n;V.forEach(v=>{HW_.cx+=v[0]/n;HW_.cz+=v[2]/n;HW_.gy=Math.min(HW_.gy,v[1]);});   // Grundriss: Sockelwaende bis unter das Gelaende, damit nichts schwebt
          for(let i=0;i<n;i++){const a=V[i],b=V[(i+1)%n],lo=Math.min(gnd(a[0],a[2]),gnd(b[0],b[2]),a[1],b[1])-0.6;
            const Q=[[a[0],a[1],a[2]],[b[0],b[1],b[2]],[b[0],lo,b[2]],[a[0],lo,a[2]]];pushT(cwP,cwC,Q,[[0,1,2],[0,2,3]],wc,sh*0.97);}
          return;
        }
        const T=triOf(V);
        if(k==='w'){
          if(MW&&cwP===wP){const nh=Math.hypot(T.n[0],T.n[2]);if(nh>0.9){const tx=-T.n[2]/nh,tz=T.n[0]/nh;let u0=1e9,u1=-1e9,mx=0,mz=0,gy=1e9;V.forEach(v=>{const u=v[0]*tx+v[2]*tz;u0=Math.min(u0,u);u1=Math.max(u1,u);mx+=v[0];mz+=v[2];gy=Math.min(gy,v[1]);});
            if(u1-u0>2){curU0=u0;curL=u1-u0;HW_.faces.push({nx:T.n[0]/nh,nz:T.n[2]/nh,tx:tx,tz:tz,u0:u0,L:u1-u0,cx:mx/n,cz:mz/n,gy:gy});}}}
          pushT(cwP,cwC,V,T.t,wc,sh);return;}
        if(Math.abs(T.n[1])>0.97){pushT(cwP,cwC,V,T.t,flatC,sh);return;}   // Flachdach: dunkle Kappe
        V.forEach(v=>{if(v[1]>HW_.top.y){HW_.top.y=v[1];HW_.top.x=v[0];HW_.top.z=v[2];}});
        // geneigte Dachflaeche: Ziegel-UV entlang Traufe (u) und Hang (v)
        const hl=Math.hypot(T.n[0],T.n[2])||1,tx=-T.n[2]/hl,tz=T.n[0]/hl,sx=T.n[1]*T.n[0]/hl,sz=T.n[1]*T.n[2]/hl,sy=-hl;
        rb.pts.push(V[0][0],V[0][2]);T.t.forEach(tr=>tr.forEach(i=>{const v=V[i];rP.push(v[0],v[1],v[2]);rC.push(rc.r*sh,rc.g*sh,rc.b*sh);rU.push((v[0]*tx+v[2]*tz)/1.6,(v[0]*sx+v[1]*sy+v[2]*sz)/1.6);}));
      });
      rb.b=rC.length;if(rb.b>rb.a)rB.push(rb);
      if(MW&&cwP===wP&&HW_.faces.length&&HW_.n)houseExtras(HW_,rb.b>rb.a);
    });
    if(wP.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(wP,3));g.setAttribute('color',new THREE.Float32BufferAttribute(wC,3));g.setAttribute('btop',new THREE.Float32BufferAttribute(wT,1));if(MW){g.setAttribute('wu',new THREE.Float32BufferAttribute(wU,1));g.setAttribute('wl',new THREE.Float32BufferAttribute(wLn,1));}g.computeVertexNormals();uvWall(g,false);wallG.push(g);}
    if(MW){window.__hx=HX;}
    if(MW){const IM=(geo,arr,fn)=>{if(!arr.length)return;const m=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9}),arr.length),D=new THREE.Object3D(),cc=new THREE.Color();arr.forEach((a,k)=>{fn(a,D);D.updateMatrix();m.setMatrixAt(k,D.matrix);cc.setHex(a.c!==undefined?a.c:0xffffff);m.setColorAt(k,cc);});m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);};
      IM(new THREE.BoxGeometry(1.0,2.1,0.12),HX.door,(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.ry,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(1.7,0.14,0.6),HX.step.map(a=>({...a,c:0xb7b2a6})),(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.ry,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(1.9,0.09,1.1),HX.can.map(a=>({...a,c:0x4a4d52})),(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.ry,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(0.62,1.0,0.7),HX.bin,(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.ry,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(0.08,1.0,0.08),HX.mailp.map(a=>({...a,c:0x55585c})),(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.ry,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(0.36,0.4,0.22),HX.mail,(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.ry,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(0.7,1.5,0.7),HX.chim.map(a=>({...a,c:0x8a4b3a})),(a,D)=>{D.position.set(a.x,a.y+0.75,a.z);D.rotation.set(0,0,0);D.scale.set(1,1,1);});
      IM(new THREE.BoxGeometry(1,0.85,0.6),HX.hedge.map(a=>({...a,c:[0x3f6b2e,0x4a7a34,0x35602a][(a.x*7|0)%3&3]||0x3f6b2e})),(a,D)=>{D.position.set(a.x,a.y,a.z);D.rotation.set(0,a.tl-Math.PI/2,0);D.scale.set(a.len,1,1);});}
    if(wP2.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(wP2,3));g.setAttribute('color',new THREE.Float32BufferAttribute(wC2,3));g.setAttribute('btop',new THREE.Float32BufferAttribute(wT2,1));g.computeVertexNormals();uvWall(g,false,12);wallP.push(g);}
    if(rP.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(rP,3));g.setAttribute('color',new THREE.Float32BufferAttribute(rC,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(rU,2));g.computeVertexNormals();roofG.push(g);
      DOPHOOK.push(()=>{   // Dachfarbe je Gebaeude aus dem Luftbild
        const ca=g.attributes.color,arr=ca.array;
        rB.forEach(r=>{let R=0,G=0,B=0,c=0;
          for(let i=0;i<r.pts.length;i+=2){const s=dopAt(r.pts[i],r.pts[i+1],1);if(s){R+=s[0];G+=s[1];B+=s[2];c++;}}
          if(!c)return;R/=c;G/=c;B/=c;const m=Math.max(R,G,B,0.01),lift=Math.max(0.8,Math.min(1.7,0.58/m));   // Foto-Schatten ausgleichen: Helligkeit auf mittleres Niveau ziehen
          for(let i=r.a;i<r.b;i+=3){arr[i]=Math.min(1,R*lift)*r.sh;arr[i+1]=Math.min(1,G*lift)*r.sh;arr[i+2]=Math.min(1,B*lift)*r.sh;}
        });ca.needsUpdate=true;
      });}
  };
  if(LOD2)buildLod2();else OSM.buildings.forEach(b=>{
    const n=b.p.length/2;if(n<3)return;if(ROUTE&&!CUS&&hitsRoute(b.p))return;
    let gmin=1e9,gmax=-1e9,area=0;
    for(let a=0;a<n;a++){const x=b.p[a*2],z=b.p[a*2+1],g=gnd(x,z);gmin=Math.min(gmin,g);gmax=Math.max(gmax,g);const a2=(a+1)%n;area+=b.p[a*2]*b.p[a2*2+1]-b.p[a2*2]*b.p[a*2+1];}
    area=Math.abs(area)/2;if(area<12)return;
    const plB=area>500||b.h<3.8||(b.h<9&&area>300)||(b.h>11&&area<220&&b.h>2.2*Math.sqrt(area))||b.h>26||(Math.abs(Math.sin(b.p[0]*12.9898+b.p[1]*78.233)*43758.5453)%1)<0.2,WG=plB?wallP:wallG;   // Hallen/Garagen/Gewerbe: ohne Fensterreihen
    const wc=wallC[(rnd()*wallC.length)|0],rc=b.r?new THREE.Color(0x5d6b6a):roofC[(rnd()*roofC.length)|0],sh=0.92+rnd()*0.14;
    // kleinste umschliessende Rechteck-Ausrichtung (fuer Satteldach)
    let best=null;
    for(let a=0;a<n;a++){const a2=(a+1)%n,dx=b.p[a2*2]-b.p[a*2],dz=b.p[a2*2+1]-b.p[a*2+1],l=Math.hypot(dx,dz);if(l<0.5)continue;const ux=dx/l,uz=dz/l;
      let u0=1e9,u1=-1e9,v0=1e9,v1=-1e9;for(let k=0;k<n;k++){const px=b.p[k*2],pz=b.p[k*2+1],uu=px*ux+pz*uz,vv=-px*uz+pz*ux;u0=Math.min(u0,uu);u1=Math.max(u1,uu);v0=Math.min(v0,vv);v1=Math.max(v1,vv);}
      const A=(u1-u0)*(v1-v0);if(!best||A<best.A)best={A,ux,uz,u0,u1,v0,v1};}
    const gable=!b.r&&best&&n<=10&&area<420&&b.h<14&&area/best.A>0.78&&Math.min(best.u1-best.u0,best.v1-best.v0)>3.2;
    let top;                                       // Traufhoehe
    if(gable){
      const L=best.u1-best.u0,W=best.v1-best.v0,longU=L>=W,half=Math.min(L,W)/2,ridge=Math.min(half*0.62,4.4),eave=Math.max(2.7,b.h-ridge*0.55),oh=0.4;
      top=gmax+eave;
      // lokales Rechteck: Achse e1 (laenger) = Firstrichtung
      const ux=best.ux,uz=best.uz,vx=-uz,vz=ux,cu=(best.u0+best.u1)/2,cv=(best.v0+best.v1)/2;
      const e1=longU?[ux,uz]:[vx,vz],e2=longU?[vx,vz]:[ux,uz],c1=longU?cu:cv,c2=longU?cv:cu,h1=(longU?L:W)/2+oh,h2=(longU?W:L)/2+oh;
      const toXZ=(s,t)=>[e1[0]*(c1+s)+e2[0]*(c2+t),e1[1]*(c1+s)+e2[1]*(c2+t)];
      const yE=top,yR=top+ridge;
      const V=(s,t,y)=>{const q=toXZ(s,t);return [q[0],y,q[1]];};
      // zwei Dachflaechen (Dreiecke) mit Dachziegel-UV (Meter / 1,6 bzw. Hangweite)
      const slope=Math.hypot(h2,ridge),roofPos=[],roofUV=[];
      const quad=(A,B,C,D,uA,vA,uB,vB,uC,vC,uD,vD)=>{roofPos.push(...A,...B,...C,...A,...C,...D);roofUV.push(uA,vA,uB,vB,uC,vC,uA,vA,uC,vC,uD,vD);};
      quad(V(-h1,-h2,yE),V(h1,-h2,yE),V(h1,0,yR),V(-h1,0,yR),-h1/1.6,0,h1/1.6,0,h1/1.6,slope/1.6,-h1/1.6,slope/1.6);
      quad(V(h1,h2,yE),V(-h1,h2,yE),V(-h1,0,yR),V(h1,0,yR),-h1/1.6,0,h1/1.6,0,h1/1.6,slope/1.6,-h1/1.6,slope/1.6);
      const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(roofPos,3));rg.setAttribute('uv',new THREE.Float32BufferAttribute(roofUV,2));rg.computeVertexNormals();
      tint(rg,rc,sh);roofG.push(rg);
      // Giebeldreiecke (Wandmaterial) an beiden Stirnseiten
      const gp=[];[-1,1].forEach(sg=>{const A=V(sg*(h1-oh),-(h2-oh),yE),B=V(sg*(h1-oh),h2-oh,yE),C=V(sg*(h1-oh),0,yR-0.0);gp.push(...(sg>0?[A,B,C]:[B,A,C]).flat());});
      const gg=new THREE.BufferGeometry();gg.setAttribute('position',new THREE.Float32BufferAttribute(gp,3));gg.computeVertexNormals();
      setTop(gg,top);uvWall(gg,false,plB?12:24);tint(gg,wc,sh);WG.push(gg);
      // Schornstein auf manchen Daechern
      if(rnd()<0.45){const cs=(rnd()-0.5)*h1*1.2,q=toXZ(cs,0.35*h2),ch=new THREE.BoxGeometry(0.6,1.7,0.6).toNonIndexed();ch.translate(q[0],yR-ridge*0.12+0.6,q[1]);uvWall(ch,true);tint(ch,new THREE.Color(0x8a5a48),1);WG.push(ch);}
    }else top=gmax+b.h;
    // Wandkoerper (Grundriss extrudiert) + Flachdach-Kappe
    const shp=new THREE.Shape();for(let a=0;a<n;a++){const x=b.p[a*2],y=-b.p[a*2+1];a?shp.lineTo(x,y):shp.moveTo(x,y);}
    const dep=(top-gmin)+0.4,g=new THREE.ExtrudeGeometry(shp,{depth:dep,bevelEnabled:false});
    g.rotateX(-Math.PI/2);g.translate(0,gmin-0.4,0);
    setTop(g,top);uvWall(g,false,plB?12:24);tint(g,wc,sh);
    if(!gable){   // Flachdach: Kappe dunkler (Bitumen/Kies)
      const nr=g.attributes.normal,cl=g.attributes.color,cc=new THREE.Color(b.r?0x5d6b6a:0x5f5c59);for(let v=0;v<nr.count;v++)if(nr.getY(v)>0.5){cl.setXYZ(v,cc.r*sh,cc.g*sh,cc.b*sh);}
    }
    WG.push(g);
  });
  const addMesh=(arr,map)=>{if(!arr.length)return;const mg=BufferGeometryUtils.mergeBufferGeometries(arr);const m=new THREE.Mesh(mg,new THREE.MeshStandardMaterial({map:map,vertexColors:true,roughness:0.88,metalness:0,side:THREE.DoubleSide}));m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);return m;};
  {const fm=addMesh(wallG,facadeTex);
    if(fm&&MW){const emi=mkTex(2048,512,(x,w,h)=>{x.fillStyle='#000';x.fillRect(0,0,w,h);const pal=[[255,214,140],[255,200,120],[246,232,190],[255,224,170],[190,212,255]];
        FW.forEach(r=>{if(Math.random()>0.42)return;const c=pal[(Math.random()*pal.length)|0],k=0.55+Math.random()*0.45,cov=Math.random()<0.3?0.55:1;x.fillStyle='rgb('+(c[0]*k|0)+','+(c[1]*k|0)+','+(c[2]*k|0)+')';x.fillRect(r[0]+3,r[1]+3,(r[2]-6)*cov,r[3]-6);
          if(Math.random()<0.5){x.fillStyle='rgba(0,0,0,0.35)';x.fillRect(r[0]+r[2]*0.48,r[1]+3,3,r[3]-6);}});});
      const mt=fm.material;mt.emissive=new THREE.Color(1,1,1);mt.emissiveMap=emi;mt.userData.dI=0;mt.userData.nI=1.7;mt.emissiveIntensity=NIGHT?1.7:0;NT.emi.push(mt);}}
  addMesh(wallP,plainTex);addMesh(roofG,roofTex);
  const wm=new THREE.MeshStandardMaterial({color:0x3d5a63,roughness:0.2,metalness:0.1,transparent:true,opacity:0.88,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  OSM.areas.forEach(a=>{
    if(a.k!==4)return;const n=a.p.length/2;if(n<4)return;
    let lo=1e9,area=0;for(let i=0;i<n;i++){lo=Math.min(lo,gnd(a.p[i*2],a.p[i*2+1]));const j=(i+1)%n;area+=a.p[i*2]*a.p[j*2+1]-a.p[j*2]*a.p[i*2+1];}
    if(Math.abs(area)/2<120)return;
    const shp=new THREE.Shape();for(let i=0;i<n;i++){const x=a.p[i*2],y=-a.p[i*2+1];i?shp.lineTo(x,y):shp.moveTo(x,y);}
    const g=new THREE.ShapeGeometry(shp);g.rotateX(-Math.PI/2);g.translate(0,lo+0.12,0);scene.add(new THREE.Mesh(g,wm));
  });
  const bm=new THREE.MeshStandardMaterial({color:0x3b4a40,roughness:0.3,metalness:0,transparent:true,opacity:0.62,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,side:THREE.DoubleSide});   // Bach: dunkles, traubes Wasser statt blauem Streifen
  const bed=new THREE.MeshStandardMaterial({color:0x4a4636,roughness:1,transparent:true,opacity:0.7,polygonOffset:true,polygonOffsetFactor:-0.5,polygonOffsetUnits:-0.5,side:THREE.DoubleSide});   // feuchtes Bachbett / Ufer
  OSM.lines.forEach(l=>{   // Baeche: schmal, unregelmaessig in Breite und Lauf, mit nassem Ufersaum
    const n=l.p.length/2;if(n<2)return;
    const mk=(wf,dy,mat)=>{const pos=[],idx=[];
      for(let i=0;i<n;i++){const a=Math.max(0,i-1),b=Math.min(n-1,i+1),dx=l.p[b*2]-l.p[a*2],dz=l.p[b*2+1]-l.p[a*2+1],d=Math.hypot(dx,dz)||1,x0=l.p[i*2],z0=l.p[i*2+1];
        const wob=0.3*Math.sin(x0*0.37+z0*0.23)+0.2*Math.sin(x0*0.9-z0*1.1),w=Math.max(0.35,l.w*wf*(0.7+0.5*(0.5+0.5*Math.sin(x0*0.21+z0*0.33)))),nx=-dz/d,nz=dx/d,x=x0+nx*wob,z=z0+nz*wob,y=gnd(x,z)+dy;
        pos.push(x+nx*w/2,gnd(x+nx*w/2,z+nz*w/2)+dy,z+nz*w/2,x-nx*w/2,gnd(x-nx*w/2,z-nz*w/2)+dy,z-nz*w/2);if(i<n-1){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);};
    mk(1.1,0.04,bed);mk(0.5,0.06,bm);
  });
}
await BOOT('Starte Physik …',88);
// ================= Wetter (Taste W): Klar, Nebel, Nieselregen =================

function applyWXOther(){   // Strecken ohne Sonnenstand-Modell: Himmel/Dunst grau, Sonne schwaecher
  if(BK)return;
  if(WXB.sun===undefined){WXB.sun=sun.intensity;WXB.hemi=hemi.intensity;WXB.fog=scene.fog.color.clone();}
  WXS.rain=WX===2?(WXFIX?0.35:1):0;
  if(WX){const g=WX===1?0.72:0.5,c=new THREE.Color(g,g*1.01,g*1.04);scene.background=c;scene.fog.color.copy(c);sky.visible=false;sun.intensity=WX===2?0.1:WXB.sun*0.42;hemi.intensity=WX===2?WXB.hemi*1.18+0.1:WXB.hemi*1.15;sun.castShadow=false;}
  else{scene.background=HDRTEX||HORIZON;scene.fog.color.copy(WXB.fog);sky.visible=!HDRTEX;sun.intensity=WXB.sun;hemi.intensity=WXB.hemi;sun.castShadow=quality>1&&!NIGHT;}
  scene.fog.density=[0,0.0009,0.00055,0.0004][QE()]*[1,5,2.2][WX];
}
const WXPOS={miworu:[51.62,7.62],hagen:[51.34,7.45],buellberg:[51.38,7.32],dortmund:[51.42,7.47],hemer:[51.36,7.79],iserlohn:[51.36,7.69],ibenstein:[52.17,8.04],deikamm:[52.26,9.47],wuppertal:[51.22,7.11]};
var WXFIX=(()=>{try{return localStorage.getItem('miworu_wxfix')==='1';}catch(_){return false;}})();
var WXSTORM=(()=>{try{return localStorage.getItem('miworu_wxstorm')==='1';}catch(_){return false;}})(),WXLSTORM=false,STORMFX=false;   // Gewitter: Sturm, Starkregen, Blitze, Boeen mit fliegendem Laub (WXLSTORM: Live-Wetter meldet Gewitter)
function STORM(){return !!(WXSTORM||WXLSTORM)&&WX===2;}   // "Schlecht": fester, leichter Nieselregen
let WXSNOWM=false,WXLSNOW=false,WXAUTM=false;try{WXSNOWM=localStorage.getItem('miworu_wxsnow')==='1';WXAUTM=localStorage.getItem('miworu_wxaut')==='1';}catch(_){}   // Wetter "Schnee": Winterlook mit leichtem Schneefall; WXLSNOW: Live-Wetter meldet gerade Schnee
const WXL=()=>WXSNOWM?'Schnee':WXAUTM?'Herbst':WXSTORM?'Gewitter':WXFIX?'Regen':WXLIVE?'Live'+(WXLIVEOK?(WXLSNOW?' · Schnee':WXLSTORM&&WX===2?' · Gewitter':' · '+WXN[WX]):' …'):'Sonnig';
function wxApply(){if(BK)applySun(true);else applyWXOther();applyQ();stormSync();}
async function wxFetch(){
  if(!WXLIVE)return;
  const pos=WXPOS[RT&&RT.dem]||[51.5,7.5];
  try{const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude='+pos[0]+'&longitude='+pos[1]+'&current=weather_code,precipitation',{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json(),c=j.current||{},wc=c.weather_code|0,pr=+c.precipitation||0;
    // WMO-Code: 45/48 Nebel; 51-67 Niesel/Regen; 80-82 Schauer; 95-99 Gewitter; 71-77 Schnee (als Nebel/Dunst); sonst klar
    const snow=(wc>=71&&wc<=77)||wc===85||wc===86;
    let w=0;if(wc===45||wc===48)w=1;if(!snow&&((wc>=51&&wc<=67)||(wc>=80&&wc<=82)||wc>=95||pr>=0.1))w=2;
    if(!WXLIVE)return;WX=w;WXLIVEOK=true;WXLSTORM=!snow&&wc>=95;
    if(snow!==WXLSNOW){WXLSNOW=snow;if(snow)seasonSet(2);else if(SEAS===2)seasonSet(0);}   // echter Schneefall: Winterlook, danach wieder zurueck
    wxApply();hintHud.k=null;}
  catch(e){if(WXLIVE){WX=0;WXLIVEOK=false;wxApply();hintHud.k=null;}}
}
setInterval(()=>{if(WXLIVE)wxFetch();},15*60*1000);
function cycleWX(){   // Aus -> Live -> Schlecht (leichter, dauerhafter Nieselregen) -> Schnee (Winterlook, leichter Schneefall) -> Aus
  const wasSeason=WXSNOWM||WXAUTM||WXLSNOW;
  if(WXSNOWM){WXSNOWM=false;}else if(WXAUTM){WXAUTM=false;WXSNOWM=true;}else if(!WXLIVE&&!WXFIX&&!WXSTORM){WXLIVE=true;}else if(WXLIVE){WXLIVE=false;WXFIX=true;}else if(WXFIX){WXFIX=false;WXSTORM=true;}else{WXSTORM=false;WXAUTM=true;}
  WXLSNOW=false;WXLSTORM=false;
  try{localStorage.setItem('miworu_wxl',WXLIVE?'1':'0');localStorage.setItem('miworu_wxfix',WXFIX?'1':'0');localStorage.setItem('miworu_wxstorm',WXSTORM?'1':'0');localStorage.setItem('miworu_wxsnow',WXSNOWM?'1':'0');localStorage.setItem('miworu_wxaut',WXAUTM?'1':'0');}catch(_){}
  AMB_SUNNY=!(WXLIVE||WXFIX||WXSTORM||WXSNOWM||WXAUTM);
  if(WXSNOWM){WX=0;WXLIVEOK=false;seasonSet(2);wxApply();}else if(WXAUTM){WX=0;WXLIVEOK=false;seasonSet(1);wxApply();}else if(wasSeason&&SEAS!==0)seasonSet(0);
  if(WXSNOWM||WXAUTM){}else if(WXLIVE){WXLIVEOK=false;wxFetch();}else if(WXFIX||WXSTORM){WX=2;WXLIVEOK=false;wxApply();}else{WX=0;WXLIVEOK=false;wxApply();}
  hintHud.k=null;toastEl.textContent='Ambiente: '+(WXSNOWM?'Schnee (leichter Schneefall)':WXAUTM?'Herbst (Laubfarben, fallendes Laub)':WXSTORM?'Gewitter (Sturm, Starkregen, Blitze, Böen mit Laub)':WXFIX?'Regen (leichter Regen)':WXLIVE?'Live (wird geladen …)':'Sonnig (Sonne scheint, je nach Tageszeit)');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1400);
  if(WXLIVE)setTimeout(()=>{if(WXLIVEOK){toastEl.textContent='Wetter live: '+WXN[WX];toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1600);}},1500);}
if(WXLIVE)setTimeout(wxFetch,600);else if(WXFIX||WXSTORM){WX=2;setTimeout(wxApply,600);}

// ================= Zustand, Eingabe, Physik =================
const M=95,CDA=0.38,RHO=1.2,GRAV=9.81,PMAX=300,BRAKE=260;
const keys={};
let running=false,inputMode='keyboard',st;
const trainer=new Trainer(),click=new ClickPad(),hrm=new HeartRate(),REC=new Rec();let paused=false,gear=0,bleMsg='',lastMenu=null;   // gear: virtuelle Schaltung = Widerstand in %-Steigung (+/-)
let gearUsed=false,toastT=0;
const DIFFN={1:'Leicht',2:'Normal',3:'Hardcore',4:'Eskalation'};
let diff=1;try{const v=+localStorage.getItem('miworu_diff');if(v>=1&&v<=4)diff=v;}catch(e){}   // Schwierigkeit: 1 Leicht (Steigungen zählen 40 %), 2 Normal
let FPSCAP=quality===3?60:0;try{if(+localStorage.getItem('miworu_fps')===30&&(quality===3||quality===1))FPSCAP=30;}catch(e){}   // Bildrate: 0 = frei (Bildschirm-Takt), 60 oder 30
let EBIKE=false;try{EBIKE=localStorage.getItem('miworu_ebike')==='1';}catch(e){}   // E-Bike: Motor schiebt bis 26 km/h an (nur beim Treten, bergauf begrenzt), bergab darf man schneller sein
document.body.classList.toggle('ebike',EBIKE);
function toggleEbike(){EBIKE=!EBIKE;try{localStorage.setItem('miworu_ebike',EBIKE?'1':'0');}catch(e){}document.body.classList.toggle('ebike',EBIKE);if(window.__ensureEbHint)window.__ensureEbHint();toastEl.textContent='E-Bike: '+(EBIKE?'an (Motor bis 26 km/h)':'aus');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1400);}
const gearF=()=>(gear<0?Math.pow(1.26,gear):1+gear*0.09)*(diff===1?0.4:(diff===3?1.5:(diff===4?1.2:1)));   // Faktor auf die Steigung: Gang x Schwierigkeit
function setDiff(d){diff=d;try{localStorage.setItem('miworu_diff',d);}catch(e){}gearHud.k=null;hintHud.k=null;toastEl.textContent='Schwierigkeit: '+DIFFN[d];toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1200);}
const gearEl=document.getElementById('gear'),toastEl=document.getElementById('toast'),hintEl=document.getElementById('hint');
function shift(d){
  const ng=clamp(gear+d,-6,5);gearUsed=true;   // 12 Gänge: Stufen -6..5 = Anzeige 1..12
  const n=ng+7;
  if(ng===gear){toastEl.textContent=(d>0?'Schwerster Gang · ':'Leichtester Gang · ')+n;}
  else{gear=ng;AUDIO.gear();SHK.vy+=0.12*d;toastEl.textContent=(d>0?'▲ ':'▼ ')+'Gang '+n+(d>0?' · schwerer':' · leichter');}
  toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),900);
}
function hintHud(){
  const key=diff+'|'+quality+'|'+FPSCAP+'|'+WX+'|'+WXLIVE+'|'+WXLIVEOK+'|'+AUDIO.on+'|'+AUDIO.hub+'|'+NIGHT+'|'+SEAS+'|'+WXSNOWM+'|'+WXLSNOW;if(hintHud.k===key)return;hintHud.k=key;
  hintEl.innerHTML=[1,2,3,4].map(n=>'<button type="button" data-act="d'+n+'"'+(diff===n?' class="on"':'')+'><b>'+n+'</b>'+DIFFN[n]+'</button>').join('')+'<button type="button" data-act="q"><b>Q</b>Grafik '+qLabel()+'</button><button type="button" data-act="n"><b>N</b>Sound '+(AUDIO.on?'an':'aus')+'</button><button type="button" data-act="w"><b>A</b>Ambiente '+WXL()+'</button><button type="button" data-act="v"><b>V</b>Vollbild</button><button type="button" data-act="f"><b>F</b>Freilauf '+(AUDIO.hub?AUDIO.hub:'aus')+'</button>'+(MW?'<button type="button" data-act="l"'+(NIGHT?' class="on"':'')+'><b>L</b>Nightride'+(NIGHT?' an':'')+'</button>':'');
}
function gearHud(){
  hintHud();
  if(!click.devs.length){gearEl.style.display='none';gearHud.k=null;return;}
  gearEl.style.display='block';
  const key=gear+'|'+click.connected+'|'+diff+'|'+quality;if(gearHud.k===key)return;gearHud.k=key;
  let bars='';for(let k=0;k<12;k++)bars+='<i class="'+(k===gear+6?'on':'')+'" style="height:'+(8+k*1.8)+'px"></i>';
  gearEl.innerHTML='<div class="lbl">GANG · <span class="dif d'+diff+'">'+DIFFN[diff].toUpperCase()+'</span>'+(click.connected?' · CLICK ✓':' · CLICK getrennt …')+'</div>'+'<div class="gn">'+(gear+7)+'<small>/ 12</small></div><div class="bars">'+bars+'</div>';
}
click.onShift=shift;click.watch();
setInterval(()=>{if(trainer.connected&&trainer.dev&&trainer.dev.gatt&&!trainer.dev.gatt.connected){trainer.connected=false;trainer.canControl=false;trainer.power=0;trainer.status='Verbindung verloren';trainer.onChange();}},2000);
click.onNote=t=>{toastEl.textContent=t;toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),3500);};
let bleKey='';
const bleChange=()=>{document.body.classList.toggle('trainer',!!trainer.connected);if(trainer.connected)inputMode='trainer';else if(inputMode==='trainer')inputMode='keyboard';const ck=click.connected+'|'+click.devs.length;if(bleKey.indexOf(ck)<0&&bleMsg.indexOf('Click')===0)bleMsg='';const k=trainer.connected+'|'+ck+'|'+bleMsg;if(k===bleKey)return;bleKey=k;if(ov.style.display!=='none'&&lastMenu&&!helpOpen)menu(lastMenu[0],lastMenu[1]);};
trainer.onChange=bleChange;click.onChange=bleChange;   // nur noch Lenkeransicht (Cockpit)
const CK_STAND=[1,3,0,900,30];const COCK=1;
// Neuer Lenker: leichtes Filmkorn ueber dem Lenker und ein sich drehender Stollenreifen (Draufsicht), beides deckungsgleich mit dem Lenkerbild
const CKT=document.createElement('div'),CKG=document.createElement('div'),CKM=document.createElement('div'),CKS=document.createElement('div'),CKD=document.createElement('div'),CKP=document.createElement('div'),CKW=document.createElement('div');
CKW.className='ckfx';CKW.id='ckwrap';CKW.style.display='none';document.getElementById('cockpit').after(CKW);
const CKB=document.createElement('div');CKB.id='ckbike';
const CKB2=document.createElement('div');CKB2.id='ckbike2';
const CKH=document.createElement('div');CKH.id='ckgloves';   // nasse Handschuhe: Handruecken werden dunkler
[CKT,CKM,CKP,CKB,CKB2,CKH,CKS,CKG].forEach(d=>{d.className='ckc';CKW.appendChild(d);});
{// nasse Handschuhe: nur kleine dunkle Tropfen auf dem Handruecken (helle Handschuhflaeche im Lenkerbild), nicht auf Jacke, Unterseite oder Lenker
  const src=new Image();src.onload=()=>{const W=1500,H=364,t=document.createElement('canvas');t.width=W;t.height=H;const tg=t.getContext('2d');tg.drawImage(src,0,0,W,H);const px=tg.getImageData(0,0,W,H).data;
    const c=document.createElement('canvas');c.width=750;c.height=182;const g=c.getContext('2d');
    [[128,268,36,152],[1196,1332,58,186]].forEach(([x0,x1,y0,y1])=>{for(let k=0,n=0;k<4000&&n<150;k++){const x=x0+Math.random()*(x1-x0),y=y0+Math.random()*(y1-y0),i=((y|0)*W+(x|0))*4;
      if(px[i+3]<230||(px[i]+px[i+1]+px[i+2])/3<92)continue;   // nur auf der hellen Handschuh-Oberflaeche
      n++;const s=0.45+Math.pow(Math.random(),2.2)*1.7;
      g.fillStyle='rgba('+(62+Math.random()*13|0)+','+(72+Math.random()*13|0)+','+(93+Math.random()*13|0)+','+(0.4+Math.random()*0.3).toFixed(2)+')';g.beginPath();g.ellipse(x/2,y/2,s,s*(0.8+Math.random()*0.7),Math.random()*3,0,6.3);g.fill();}});
    CKH.style.backgroundImage='url('+c.toDataURL()+')';};
  src.src='/assets/ui/cockpit2.png';}
// Matschspritzer am Rand des Blickfelds: wachsen wie der Dreck am Rad (CKBD), zwei Schichten, nur aussen
const CKE=[0,1].map(L=>{const d=document.createElement('div');d.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2;opacity:0;background-size:100% 100%;background-repeat:no-repeat';
  const W=640,H=360,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');
  for(let k=0,n=0;k<6000&&n<(L?26:16);k++){const x=Math.random(),y=Math.random()*0.8,e=Math.max(Math.abs(x-0.5)*2,Math.abs(y-0.4)*2.5);   // e: 0 Mitte, 1 Rand
    if(e<0.86||Math.random()>(e-0.8)*5)continue;n++;
    const px=x*W,py=y*H,s=(2+Math.pow(Math.random(),2)*9)*(0.7+0.3*e),a=0.55+Math.random()*0.3;
    for(let j=0;j<4;j++){const ox=(Math.random()-0.5)*s*1.6,oy=(Math.random()-0.5)*s*1.2,r=s*(0.35+Math.random()*0.5);g.fillStyle='rgba('+(40+Math.random()*14|0)+','+(31+Math.random()*10|0)+','+(22+Math.random()*8|0)+','+a.toFixed(2)+')';g.beginPath();g.ellipse(px+ox,py+oy,r,r*(0.7+Math.random()*0.5),Math.random()*3,0,6.3);g.fill();}}
  d.style.backgroundImage='url('+c.toDataURL()+')';document.getElementById('wrap').appendChild(d);return d;});
const FORK=document.createElement('img');FORK.id='cockfork';FORK.className='c2';FORK.src='/assets/ui/cockpit2.png';FORK.draggable=false;FORK.style.display='none';document.getElementById('cockpit').after(FORK);
CKT.id='cktire';CKP.id='ckspray';CKG.id='ckgrain';CKM.id='ckmud';CKS.id='cksheen';CKD.id='ckdapple';
{const c=document.createElement('canvas');c.width=20;c.height=14;const g=c.getContext('2d');   // Stollenmuster: dunkle Klotzchen mit heller Kante
  g.fillStyle='rgba(0,0,0,0.62)';g.fillRect(0,0,20,14);g.fillStyle='rgba(205,205,200,0.55)';
  g.fillRect(1,1,8,5);g.fillRect(11,8,8,5);g.fillStyle='rgba(30,30,30,0.7)';g.fillRect(2,5,7,1.5);g.fillRect(12,12,7,1.5);
  CKT.style.backgroundImage='url('+c.toDataURL()+')';}
{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');   // Schlammspritzer fuer den Reifen
  for(let k=0;k<130;k++){const x=Math.random()*64,y=Math.random()*64,r=0.8+Math.random()*2.7;g.fillStyle='rgba('+(60+Math.random()*20|0)+','+(50+Math.random()*18|0)+','+(38+Math.random()*12|0)+','+(0.55+Math.random()*0.45).toFixed(2)+')';g.beginPath();g.ellipse(x,y,r,r*(0.6+Math.random()*0.8),Math.random()*3,0,6.3);g.fill();}
  CKM.style.backgroundImage='url('+c.toDataURL()+')';}
{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,128,128);   // Licht-und-Schatten-Flecken (Blaetterdach)
  for(let k=0;k<26;k++){const x=Math.random()*128,y=Math.random()*128,r=6+Math.random()*16;const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba(0,0,0,0.85)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x-r,y-r,2*r,2*r);}
  CKD.style.backgroundImage='url('+c.toDataURL()+')';}
{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');   // Wassertropfen, die vom Reifen spritzen
  for(let k=0;k<40;k++){const x=Math.random()*64,y=Math.random()*64,r=1+Math.random()*3.4;g.fillStyle='rgba(225,238,248,'+(0.45+Math.random()*0.45).toFixed(2)+')';g.beginPath();g.ellipse(x,y,r*0.8,r*(1.2+Math.random()*1.4),0,0,6.3);g.fill();}
  CKP.style.backgroundImage='url('+c.toDataURL()+')';}
{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');   // Matschspritzer auf Lenker, Gabel und Vorbau
  for(let k=0;k<280;k++){const x=Math.random()*128,y=Math.random()*128,r=0.6+Math.random()*2.6;g.fillStyle='rgba('+(58+Math.random()*18|0)+','+(50+Math.random()*16|0)+','+(38+Math.random()*12|0)+','+(0.6+Math.random()*0.4).toFixed(2)+')';g.beginPath();g.ellipse(x,y,r,r*(0.5+Math.random()*0.9),Math.random()*3,0,6.3);g.fill();
    if(Math.random()<0.35){for(let j=0;j<4;j++){g.beginPath();g.arc(x+(Math.random()-0.5)*14,y+(Math.random()-0.5)*14,0.6+Math.random()*1.3,0,6.3);g.fill();}}}
  CKB.style.backgroundImage=CKB2.style.backgroundImage='url('+c.toDataURL()+')';}
let CKDIRT=0,CKSPR=0,CKBD=0,CKBM=0,CKWET=0;
let GRAINS=[];{for(let k=0;k<4;k++){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),d=g.createImageData(128,128);
  for(let i=0;i<d.data.length;i+=4){const v=Math.random()*255|0;d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}g.putImageData(d,0,0);GRAINS.push('url('+c.toDataURL()+')');}}
let CKPH=0,CKLT=0,CKGT=0,CKGI=0;
let STD=0;   // Fahrer steht auf (0..1): bergab und schnell
const CKENV={gr:0,fd:0,surf:0,pud:false,spike:0,fx:0,fv:0,pvy:0};
// Federgabel: Stoesse (Impuls aus dem Cockpit-Ruckeln) und Bremsen druecken die Gabel zusammen, Lenker taucht ueber der Gabel ab
function forkComp(dt){const d=SHK.vy-CKENV.pvy;CKENV.pvy=SHK.vy;if(Math.abs(d)>0.02)CKENV.fv+=Math.min(1.5,Math.abs(d))*30;CKENV.fv+=(-300*CKENV.fx-11*CKENV.fv)*dt;CKENV.fx+=CKENV.fv*dt;CKENV.fx=Math.max(-0.2,Math.min(1.4,CKENV.fx));return Math.max(0,CKENV.fx+(BRK||0)*0.6);}
function updateCockFx(now,deg){
  const dt=Math.min(0.05,Math.max(0,(now-CKLT)/1000));CKLT=now;
  const tf=cockpitEl.style.transform,v=Math.max(0,st.v||0);
  CKPH=(CKPH+v*dt*34)%1000;   // Stollen laufen mit dem Tempo nach vorn (nach oben im Bild)
  // Dreck am Reifen: Pfuetze = Spritzer, Trail/Schotter und Regen = langsam mehr, Asphalt = trocknet/wird abgeschleudert
  const tgt=CKENV.surf===2?0.55:CKENV.surf===1?0.25:0;
  if(CKENV.pud&&v>1)CKENV.spike=Math.min(1,CKENV.spike+dt*1.8*Math.min(1,v/6));
  CKENV.spike=Math.max(0,CKENV.spike-dt*0.16);
  const want=Math.max(Math.min(1,tgt+WXS.rain*0.2*(CKENV.surf?1:0.5)),CKENV.spike);
  CKDIRT+=(want-CKDIRT)*Math.min(1,dt*(want>CKDIRT?1.6:0.12))*(v>0.5?1:0.2);
  CKSPR+=(((CKENV.pud&&v>1)?Math.min(1,v/7):0)-CKSPR)*Math.min(1,dt*(CKENV.pud?9:3.5));   // Spritzwasser nur waehrend der Pfuetze, klingt schnell ab
  CKP.style.opacity=Math.min(1,CKSPR*1.1).toFixed(2);CKP.style.backgroundPosition=((CKPH*0.37)%64).toFixed(1)+'px '+(-(CKPH*1.6)%64).toFixed(1)+'px';
  CKBD=Math.min(0.1+0.7*Math.min(1,st.pos/TOTAL),CKBD+(CKENV.mud&&v>1?dt*0.046*Math.min(1.7,v/5)*(CKENV.gr<-1?1+Math.min(2,-CKENV.gr/4):(CKBD<0.2?(CKENV.gr>2?0.3:0.55):0)):0));CKBM=Math.max(CKBM,CKBD);   // Matsch sammelt sich an
  // Matsch am Rad geht nie wieder weg: nur mehr, bis zum Maximum; gegen Ende der Tour kommt eine zweite, dichtere Spritzerschicht dazu
  CKE[0].style.opacity=Math.min(0.85,Math.max(0,CKBD-0.12)*1.4).toFixed(2);CKE[1].style.opacity=Math.min(0.85,Math.max(0,CKBD-0.4)*2).toFixed(2);
  CKB.style.opacity=Math.min(1,CKBD*1.15).toFixed(2);CKB2.style.opacity=Math.max(0,Math.min(0.9,(CKBD-0.55)*2.2)).toFixed(2);
  {const wt=WX===2?(WXFIX?0.75:1):0;if(CKENV.pud&&v>1)CKWET=Math.min(Math.max(wt,0.55),CKWET+dt*0.12*Math.min(1,v/6));CKWET+=(wt-CKWET)*Math.min(1,dt*(wt>CKWET?0.05:(WX===0?0.012:0.005)));CKH.style.opacity=Math.min(1,CKWET*1.6).toFixed(3);}   // Regen: nach etwa einer Minute sichtbar nass, trocknet langsam
  const k=Math.max(0.3,1-v/16);                 // bei hohem Tempo weichere, verwischte Stollen
  const bgp='0 '+(-(CKPH%14)*0.11).toFixed(3)+'vw';
  CKW.style.transform=tf;CKW.style.display='block';
  CKT.style.backgroundPosition=bgp;CKT.style.opacity=k.toFixed(2);
  CKM.style.backgroundPosition='0 '+(-(CKPH%64)*0.11*0.5).toFixed(2)+'vw';CKM.style.opacity=Math.min(0.92,CKDIRT*1.35).toFixed(2);
  // Spiegelungen / Licht: Himmelsreflex wandert mit Lenkung und Blickrichtung zur Sonne, Blaetterdach wirft Flecken, Nacht und Nebel daempfen
  camera.getWorldDirection(_sv);
  const sf=Math.max(0,_sv.x*SUN.x+_sv.z*SUN.z)/Math.max(0.001,Math.hypot(SUN.x,SUN.z)),day=WXS.day==null?1:WXS.day;
  const clear=(1-WXS.fog*0.6)*(1-WXS.rain*0.5)*(WX===2?0.15:1),forest=Math.min(1,CKENV.fd||0);
  const gx=50+deg*2.2+Math.sin(now*0.0003)*6,glint=day*clear*(0.18+0.5*sf*sf)*(1-forest*0.55)+WXS.rain*0.14;
  CKS.style.backgroundPosition=gx.toFixed(1)+'% 0';CKS.style.opacity=Math.min(0.85,glint).toFixed(2);
  {
    const fxv=quality>1?'block':'none';if(fxv!==CKENV.fxv){CKENV.fxv=fxv;CKS.style.display=CKG.style.display=fxv;}}
  if(now-CKGT>70){CKGT=now;CKGI=(CKGI+1)%4;CKG.style.backgroundImage=GRAINS[CKGI];CKG.style.backgroundPosition=((Math.random()*128)|0)+'px '+((Math.random()*128)|0)+'px';}
}
function applyCockpit(){const el=document.getElementById('cockpit');el.src='/assets/ui/cockpit2.png';el.classList.add('c2');}
applyCockpit();
const cockpitEl=document.getElementById('cockpit'),glowEl=document.getElementById('glow'),_cd=new THREE.Vector3(),_sv=new THREE.Vector3();
function reset(){SHK.y=SHK.vy=SHK.r=SHK.vr=0;SHK.i=0;SHK.fi=0;SHK.w=SHK.wv=0;SHK.air=null;st={pos:0,v:0,x:0.4,power:0,t:0,crank:0.6,wheel:0,lean:0,bar:0,pitch:0,done:false};REC.reset();resetJoggers();vanWait=12;VANS&&VANS.forEach(v=>{if(!v.parked){v.active=false;v.g.visible=false;}});}
reset();
// Vollbild: Esc beendet es (Browser), auf dem Tablet gibt es dafuer das X oben links
const isFS=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
{let lt=0;document.addEventListener('touchend',e=>{   // Handy/Tablet: schnell doppeltippen schaltet Vollbild an bzw. aus (nicht auf Knoepfen, Karte, Profil und Menue-Feldern)
  const tg=e.target;if(tg&&tg.closest&&tg.closest('button,a,input,select,textarea,#prof,#mini,.panel,.mine'))return;
  const n=performance.now();if(n-lt<320){lt=0;if(e.cancelable)e.preventDefault();toggleFS();}else lt=n;},{passive:false});}
function toggleFS(){
  const d=document,el=d.documentElement;
  try{
    if(isFS()){(d.exitFullscreen||d.webkitExitFullscreen).call(d);}
    else{const rq=el.requestFullscreen||el.webkitRequestFullscreen;if(rq){const r=rq.call(el);if(r&&r.catch)r.catch(()=>{});}else{toastEl.textContent='Vollbild: auf dem iPad „Zum Home-Bildschirm“ nutzen';toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),2200);}}
  }catch(e){}
}
{const x=document.createElement('button');x.id='fsx';x.textContent='✕';x.setAttribute('aria-label','Vollbild beenden');x.onclick=()=>{try{(document.exitFullscreen||document.webkitExitFullscreen).call(document);}catch(e){}};document.body.appendChild(x);
 const sync=()=>{x.style.display=isFS()?'block':'none';};['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,sync));sync();}
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key)>=0)e.preventDefault();
  keys[e.key]=true;
  if(e.key==='r'||e.key==='R')start();
  if(e.key==='Escape')pauseGame();
  if(e.key==='v'||e.key==='V')toggleFS();
  if(e.key==='q'||e.key==='Q')cycleQ();
  if(e.key==='n'||e.key==='N'){AUDIO.toggle();toastEl.textContent='Sound: '+(AUDIO.on?'an':'aus');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1100);}
  if(e.key==='a'||e.key==='A')cycleWX();
  if(e.key==='e'||e.key==='E')toggleEbike();
  if(e.key==='t'||e.key==='T'){todSet((TODM+1)%5);toastMsg('Tageszeit: '+TODN[TODM]);}
  if(e.key==='l'||e.key==='L')toggleNight();
  if(e.key==='f'||e.key==='F'){const h=AUDIO.cycleHub();hintHud.k=null;toastEl.textContent='Freilauf: '+(h?h+' Zähne':'aus');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1200);}
  if(e.key==='s'||e.key==='S')setDiff(diff%4+1);
  if(e.key==='+'||e.key==='PageUp')shift(1);
  if(e.key==='-'||e.key==='PageDown')shift(-1);
});
window.addEventListener('keyup',e=>{keys[e.key]=false;});
// Handy: kleiner Pfeil zum Vorwaertsfahren (gedrueckt halten = treten), sonst blendet die Oberflaeche alles Stoerende aus
{const PH=window.matchMedia&&matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<=520;
 const TOUCH=window.matchMedia&&matchMedia('(pointer:coarse)').matches;   // Handy, iPad, Tablet: Gas- und Bremsknopf
 if(TOUCH){if(PH)document.body.classList.add('phone');document.body.classList.add('touch');const g=document.getElementById('goBtn');
  const on=e=>{e.preventDefault();keys.ArrowUp=true;g.classList.add('on');try{g.setPointerCapture(e.pointerId);}catch(_){}},off=()=>{keys.ArrowUp=false;g.classList.remove('on');};
  g.addEventListener('pointerdown',on);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>g.addEventListener(ev,off));g.addEventListener('contextmenu',e=>e.preventDefault());
  const b=document.getElementById('brkBtn'),bon=e=>{e.preventDefault();keys.ArrowDown=true;b.classList.add('on');try{b.setPointerCapture(e.pointerId);}catch(_){}},boff=()=>{keys.ArrowDown=false;b.classList.remove('on');};
  b.addEventListener('pointerdown',bon);['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,boff));b.addEventListener('contextmenu',e=>e.preventDefault());}}
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});

const liftEl=document.createElement('div');liftEl.id='lift';document.body.appendChild(liftEl);
function startLift(lf){
  st.lift={lf:lf,t:0,jumped:false};st.v=0;st.power=0;
  const mn=Math.floor(lf.sek/60),sc=String(lf.sek%60).padStart(2,'0');
  liftEl.innerHTML='<div class="lt"><span class="li">🚡</span><b>Bergbahn</b><i>▲ +'+lf.hm+' Hm · '+mn+':'+sc+' min</i></div>';
  liftEl.className='on';
}
function updateLift(dt){
  const L=st.lift;L.t+=dt;
  if(inputMode==='trainer'&&trainer.connected)trainer.setGrade(0,0.005,true);   // Rolle entlasten
  if(!L.jumped&&L.t>=1.6){L.jumped=true;st.pos=L.lf.b*SEG;st.x=Math.max(-1,Math.min(1,st.x));st.v=0;resetJoggers();lastSec=-1;}
  if(L.t>=3.4)liftEl.className='out';
  if(L.t>=4.6){liftEl.className='';st.lift=null;st.v=1.5;}
}
function update(dt){
  if(!running){AUDIO.update(dt,{running:false,v:0,surf:0,pedal:0,brake:false,forest:0,rain:WXS.rain,day:WXS.day});return;}
  const kb=true;   // Tastatur geht immer, auch mit gekoppeltem Trainer
  const up=kb&&keys.ArrowUp,down=kb&&keys.ArrowDown,left=kb&&keys.ArrowLeft,right=kb&&keys.ArrowRight;
  if(LIFTS.length){   // Bergbahn: abblenden, kurz fahren lassen, oben wieder einblenden (Zeit zaehlt nicht)
    if(!st.lift){const lf=LIFTS.find(l=>st.pos>=l.a*SEG&&st.pos<l.b*SEG-6);if(lf)startLift(lf);}
    if(st.lift){updateLift(dt);return;}
  }
  const i=Math.min(N-1,Math.floor(st.pos/SEG)),dirt=SURF[i]===2;
  const tr=inputMode==='trainer'&&trainer.connected;
  if(tr)st.power+=(Math.max(trainer.power,up?PMAX:0)-st.power)*Math.min(1,dt*6);else st.power+=((up?PMAX:0)-st.power)*Math.min(1,dt*2.5);
  const gf=gearF();   // Gang x Schwierigkeit: Normal: leichtester Gang x0,25, schwerster x1,3; Leicht: alles x0,4
  const eg=Math.max(0,(GR[i]>0?GR[i]*gf+Math.max(0,gear)*0.25:Math.max(0,gear)*0.25*(GR[i]>-2?1:0))+(GR[i]>-2?(diff===3?0.8:diff===4?0.5:0):0));   // Abfahrten neutral; Hardcore/Eskalation auch auf flachen Stuecken mit etwas Grundlast
  if(tr)trainer.setGrade(eg,(dirt?0.012:SURF[i]===1?0.009:0.005)*(diff===1?0.5:1));
  const climb=eg/100;            // Abfahrten neutral: zählen wie flach
  const v=st.v,vs=Math.max(v,0.55);   // kleine Mindestgeschwindigkeit: auch steile Rampen lassen sich aus dem Stand anfahren
  const dh=GR[i]<-2?Math.min(10,-GR[i]-2)/100*0.2*(GR[i]<-4?1:(-GR[i]-2)/2):0;   // Gefaelle hilft: bergab sind ~30 km/h mit normaler Trittleistung moeglich (Trainer-Widerstand bleibt neutral)
  const fres=M*GRAV*((dirt?0.012:SURF[i]===1?0.009:0.005)+climb-dh*1.2)+0.5*RHO*CDA*v*v+(down?BRAKE:0);
  const pf=[1,1.6,1,0.85,0.83,0.64][diff]||1;   // Schwierigkeit wirkt auf jeder Strecke: Leicht 1,6x Wirkung der Watt, Normal 1,0x (realistisch), Hardcore 0,85x, Eskalation 0,83x (20 % haerter)
  const fmot=(EBIKE&&(st.power>15)&&v>=0)?Math.min(380/vs,220)*Math.max(0,Math.min(1,(7.22-v)/0.7)):0;   // Motor: max. 380 W, Hilfe endet bei 26 km/h, in jedem Gang; bergauf begrenzt die Motorleistung das Tempo
  window.__down=GR[i]<-2;   // fuer das Rehkitz-Rufen bergab (Audio)
  window.__motor=(EBIKE&&(st.power>15||(tr&&trainer.power>15))&&st.v>0.3)?Math.max(0,Math.min(1,(7.6-v)/0.35))*(0.6+0.4*Math.min(1,fmot/90))*(GR[i]>1?1:0.8):0;   // Motor (und Geraeusch) hoeren bei 26 km/h auf   // Motorbrummen beim Treten, bergauf am deutlichsten
  st.v=Math.max(0,v+(Math.min(st.power*pf/vs,420)+fmot-fres)/M*dt);   // Zugkraft am Hinterrad gedeckelt (Traktion)
  if(st.v<0.3&&eg>7&&st.power>15&&st.t-(update.hintT||-9)>7){update.hintT=st.t;toastEl.textContent='Zu steil für diese Leistung · "−" = leichterer Gang';toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),2600);}
  BRK+=((down&&st.v>1.5?1:0)-BRK)*Math.min(1,dt*5);
  {   // Kurventempo: Spitzkehren und enge Kurven nehmen sanft Tempo raus (Rollentrainer hat keine Bremse). Grenze aus Querbeschleunigung je Untergrund und Nässe
    let kmax=0;const la=Math.min(N-1,i+Math.ceil(st.v*1.4/SEG)+2);for(let j=i;j<=la;j++){const a=Math.abs(KV[j]);if(a>kmax)kmax=a;}
    const grip=(SURF[i]===0?4.6:SURF[i]===1?3.4:3.1)*(WX===2?0.8:1)*(WXSNOWM?0.75:1);
    const vc=Math.max(3.0,Math.sqrt(grip/Math.max(kmax,1e-3)));
    if(st.v>vc){st.v-=Math.min((st.v-vc)*0.9,2.2)*dt;}
    update.lat=Math.min(1,st.v*st.v*kmax/grip);
  }
  const off=Math.abs(st.x)>HW[i]+0.15;
  if(off)st.v*=Math.max(0,1-1.3*dt);
  const p0=st.pos;st.pos=Math.max(0,st.pos+st.v*dt);st.t+=dt;
  {   // Aufzeichnung fuer den Strava-Export (ca. 1x pro Sekunde): bewusst OHNE Koordinaten, die hinterlegten Strecken werden nicht herausgegeben
    REC.add(st.t,{d:st.pos,alt:NHN0+PY[Math.min(N,Math.floor(st.pos/SEG))],v:st.v,w:st.power,cad:(tr&&trainer.cadence)||0,hr:hrm.live?hrm.bpm:0});
  }
  // Ruppeln: Wurzeln und Steine unter dem Rad geben Stöße, Schotter/Trail rauschen leicht
  while(SHK.i<BUMPS.length&&BUMPS[SHK.i].s<st.pos){
    const b=BUMPS[SHK.i++];
    if(b.s>=p0-0.01&&st.x>b.o0&&st.x<b.o1&&st.v>0.8&&Math.random()<(b.a>0.6?0.7:0.45)){const f=0.5+0.5*Math.min(1,st.v/7);SHK.vy+=b.a*f*0.75*(rnd()<0.5?1:0.7);if(b.a>0.04)AUDIO.bump(b.a*f,SURF[i]);SHK.vr+=(rnd()-0.5)*b.a*f*4;}   // nur etwa jeder zweite Stein/jede zweite Wurzel gibt einen spuerbaren Stoss, das Fahrwerk schluckt den Rest
  }
  while(SHK.fi<FEAT.length&&FEAT[SHK.fi].s<st.pos){   // Kanten, Drops und Sprung
    const f=FEAT[SHK.fi++];if(!(f.s>=p0-0.01&&st.v>1.8))continue;
    if(f.k==='e'){const a=f.a*(0.55+0.45*Math.min(1,st.v/9));AUDIO.edge(a);SHK.vy+=a;SHK.vr+=(rnd()-0.5)*a*9;SHK.wv+=(rnd()<0.5?-1:1)*a*110;}
    else if(f.k==='j'&&!SHK.air&&st.v>2.5){const vk=clamp(st.v/6,0.55,1);SHK.air={t:0,T:clamp(0.42+st.v*0.03,0.55,0.95)*vk,H:clamp(0.14+st.v*0.018,0.25,0.5)*vk};AUDIO.takeoff();}
  }
  if(SHK.air){SHK.air.t+=dt;if(SHK.air.t>=SHK.air.T){const H=SHK.air.H;SHK.air=null;AUDIO.land(H);SHK.vy-=2.4*Math.min(1,H/0.4);SHK.vr+=(rnd()-0.5)*6;SHK.wv+=(rnd()<0.5?-1:1)*26*Math.min(1,H/0.4);st.v*=0.96;}}
  SHK.wv+=(-900*SHK.w-9*SHK.wv)*dt;SHK.w+=SHK.wv*dt;   // Lenker flattert nach Stoessen
  SHK.w=clamp(SHK.w,-8,8);SHK.wv=clamp(SHK.wv,-140,140);SHK.r=clamp(SHK.r,-0.3,0.3);SHK.vr=clamp(SHK.vr,-5,5);   // Grenzen: der Lenker dreht nie durch
  SHK.vy+=(-420*SHK.y-17*SHK.vy)*dt;SHK.y+=SHK.vy*dt;SHK.vr+=(-380*SHK.r-16*SHK.vr)*dt;SHK.r+=SHK.vr*dt;
  const rough=(ROUTE?[0,0.4,1][SURF[i]]:(i>=iTrail?1:0.2))*(1+Math.max(0,-GR[i])*0.08)*Math.min(1,st.v/6);
  SHK.buzz=rough*(Math.sin(st.pos*9.3)+Math.sin(st.pos*17.9+1.3)*0.7+Math.sin(st.pos*31.7)*0.4);
  if(typeof sun!=='undefined'&&sun){   // Bei Regen scheint keine Sonne: direktes Licht und Schatten werden stark gedaempft
    if(WX!==2)window.__sunRef=sun.intensity;
    else if(window.__sunRef!=null){const cap=window.__sunRef*0.3;if(sun.intensity>cap)sun.intensity=cap;}
  }
  {   // Regen: zusaetzliche Pfuetzen und Matschlachen (auch bergab) erscheinen langsam und trocknen wieder ab
    const wt=WX===2?(WXFIX?0.7:1):0,wp=(window.__wp||0)+(wt-(window.__wp||0))*Math.min(1,dt*0.15);window.__wp=wp;
    if(window.__wetM)for(const w of window.__wetM){w.m.visible=wp>0.03;w.mt.opacity=w.o*Math.min(1,wp*1.6);}
    const df=Math.max(wp,WX===1?0.5:0);window.__df=(window.__df==null?df:window.__df)+(df-(window.__df==null?df:window.__df))*Math.min(1,dt*0.15);   // schoenes Wetter: keine Pfuetzen
    if(window.__dryM)for(const w of window.__dryM){w.m.visible=window.__df>0.03;w.mt.opacity=w.o*Math.min(1,window.__df*1.6);}
  }
  {   // Pfuetze erwischt? Tropfen aufs Bild (nur steigende Flanke, ab 1,5 m/s)
    sample(st.pos,smp);const bwx=smp.x-Math.cos(smp.h)*st.x,bwz=smp.z+Math.sin(smp.h)*st.x,gx=Math.floor(bwx/8),gz=Math.floor(bwz/8);let hit=false;
    for(let a=-1;a<=1&&!hit;a++)for(let b=-1;b<=1&&!hit;b++){const kk=(gx+a)+','+(gz+b),wk=window.__wp>0.3&&window.PUDW&&window.PUDW[kk],bs=window.__df>0.03,L=wk?(bs?(PUDH[kk]||[]).concat(wk):wk):(bs?PUDH[kk]:null);if(!L)continue;
      for(let k=0;k<L.length;k++){const q=L[k],dx=bwx-q.x,dz=bwz-q.z,c=Math.cos(q.r),sn=Math.sin(q.r),lx=(dx*c-dz*sn)/(q.a*0.6),lz=(dx*sn+dz*c)/(q.b*0.6);if(lx*lx+lz*lz<1){hit=true;update.muddy=q.w?!!q.m:true;break;}}}
    if(hit&&!update.inPud&&st.v>1.5){splashDrops(st.v);AUDIO.splash(st.v);}update.inPud=hit;
  }
  if(AUDIO.on&&AUDIO.suspended&&st.t>3&&!update.sndT){update.sndT=1;toastEl.textContent='Sound aktivieren: einmal klicken oder eine Taste drücken';toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),4000);}
  {const fd=forestD(PX[i],PZ[i]);CKENV.fd=fd;CKENV.gr=GR[i];CKENV.surf=SURF[i];CKENV.pud=!!update.inPud;CKENV.mud=!!(update.inPud&&update.muddy);AUDIO.update(dt,{running:true,v:st.v,surf:SHK.air?-1:SURF[i],pedal:st.power>20?1:0,brake:!!down,forest:fd,rain:WXS.rain,day:WXS.day,night:NIGHT,pud:!!update.inPud,lat:update.lat||0});}
  updateJoggers(dt);updateWildlife(dt);updateVans(dt);updateGroup(dt);
  const steer=(right?1:0)-(left?1:0);
  // Automatische Lenkung (Rollentrainer wie D100 oder KICKR können nicht lenken): Lenker und Neigung folgen dem
  // Streckenverlauf, Ausweichen übernimmt das Spiel. Auf Asphalt/Schotter fährt das Rad rechts (Gegenverkehr links),
  // auf dem Trail mittig; vor Hindernissen (Joggerinnen) weicht es rechtzeitig aus.
  const lim=HW[i]-0.35;
  let tx=clamp(SURF[i]===2?0:Math.min(0.5,HW[i]-1.2),-lim,lim);
  joggers.forEach(j=>{
    const ahead=j.s-st.pos;
    if(!j.active||ahead<-1||ahead>32)return;
    const jx=j.x;                                   // gleiche Seitenrichtung wie st.x (negativ = links)
    if(Math.abs(tx-jx)<1.0){const r=jx+1.0,l=jx-1.0;tx=clamp(r<=lim?r:l,-lim,lim);}
  });
  st.x+=(tx-st.x)*Math.min(1,dt*2.2);
  const kA=KV[Math.min(N-1,i+Math.ceil(st.v*0.5/SEG))],kk=KV[i]*0.6+kA*0.4;   // vorausschauend: Lenker und Neigung setzen schon kurz vor der Kurve an
  st.lean+=((clamp((tx-st.x)*0.12,-0.1,0.1)-clamp(kk*st.v*st.v*0.08,-0.35,0.35))-st.lean)*Math.min(1,dt*3.6);
  st.bar+=((clamp((tx-st.x)*6,-6,6)-clamp(kk*600,-17,17))-st.bar)*Math.min(1,dt*4.5);   // Lenkereinschlag in Grad (Cockpit)
  if(tr&&trainer.cadence>5)st.crank+=trainer.cadence*Math.PI/30*dt;else if(st.power>25)st.crank+=9*dt;
  st.wheel+=st.v/0.36*dt;
  offEl.style.display=off?'block':'none';
  if(st.pos>=TOTAL-16){
    st.done=true;clearProg();running=false;trainer.setGrade(0,0.005,true);
    menu('Nochmal fahren','Ziel! '+fmtT(st.t)+' · Ø '+(st.pos/st.t*3.6).toFixed(1)+' km/h');
  }
}
const fmtT=t=>Math.floor(t/60)+':'+('0'+Math.floor(t%60)).slice(-2)+','+Math.floor(t*10%10);

// ================= HUD =================
const grpEl=document.getElementById('grp'),hudBox=document.getElementById('hudbox'),secEl=document.getElementById('sec'),spdEl=document.getElementById('spd'),subEl=document.getElementById('sub'),offEl=document.getElementById('off');
const mini=document.getElementById('mini'),mg=mini.getContext('2d'),prof=document.getElementById('prof'),pg=prof.getContext('2d');
let MS=180/900,MCX=0,MCZ=0;
if(ROUTE){
  let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;
  for(let i=0;i<=N;i++){x0=Math.min(x0,PX[i]);x1=Math.max(x1,PX[i]);z0=Math.min(z0,PZ[i]);z1=Math.max(z1,PZ[i]);}
  MCX=(x0+x1)/2;MCZ=(z0+z1)/2;MS=164/Math.max(x1-x0,z1-z0);
}
const SURFCOL=['#e6e6e6','#d9c27a','#f5a524'],SURFFILL=['rgba(230,230,230,0.8)','rgba(217,194,122,0.85)','rgba(245,165,36,0.9)'];
const miniBase=document.createElement('canvas');miniBase.width=miniBase.height=180;
(function(){
  const g=miniBase.getContext('2d');
  g.fillStyle='rgba(28,40,26,0.82)';g.fillRect(0,0,180,180);
  if(!ROUTE){
    g.fillStyle='rgba(70,96,52,0.9)';g.beginPath();g.arc(90,90,RBASE*MS,0,7);g.fill();
    g.fillStyle='rgba(120,130,84,0.9)';g.beginPath();g.arc(90,90,RTOP*MS,0,7);g.fill();
  }
  g.lineJoin='round';
  surfRuns((sf,a,b)=>{
    g.strokeStyle=SURFCOL[sf];g.lineWidth=sf===0?2.6:2;g.beginPath();
    for(let i=a;i<=b;i+=2)g.lineTo(90+(PX[i]-MCX)*MS,90+(PZ[i]-MCZ)*MS);g.stroke();
  });
  if(!ROUTE){g.fillStyle='#ffd24a';g.beginPath();g.arc(90,90,3,0,7);g.fill();}
})();
// Klick/Ziehen im Hoehenprofil: an diese Stelle der Strecke springen
{const jump=e=>{if(!running)return;const r=prof.getBoundingClientRect();const f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));st.pos=Math.min(TOTAL-10,f*N*SEG);st.x=Math.max(-1,Math.min(1,st.x));resetJoggers();lastSec=-1;};
let dr=false;prof.addEventListener('pointerdown',e=>{dr=true;try{prof.setPointerCapture(e.pointerId);}catch(_){}jump(e);e.preventDefault();});
prof.addEventListener('pointermove',e=>{if(dr)jump(e);});prof.addEventListener('pointerup',()=>{dr=false;});prof.addEventListener('pointercancel',()=>{dr=false;});}
const profBase=document.createElement('canvas');profBase.width=420;profBase.height=64;
let pMin=1e9,pMax=-1e9;for(let i=0;i<N;i++){if(PY[i]<pMin)pMin=PY[i];if(PY[i]>pMax)pMax=PY[i];}
const profY=i=>58-((PY[i]-pMin)/Math.max(20,pMax-pMin))*50;   // Hoehenprofil an die Strecke angepasst, nichts wird abgeschnitten
(function(){
  const g=profBase.getContext('2d');
  g.fillStyle='rgba(0,0,0,0.35)';g.fillRect(0,0,420,64);
  const RGB=[[230,230,230,0.8],[217,194,122,0.85],[245,165,36,0.9]],ST=Math.max(1,Math.floor(N/420));
  for(let i=0;i<N;i+=ST){   // Spaltenweise: Untergrundfarbe, steile Abfahrten zunehmend rot
    let st=0,n=0;for(let k=Math.max(0,i-7);k<Math.min(N,i+ST+7);k++){st+=GR[k];n++;}st=Math.max(0,Math.min(1,(-st/n-6)/6));   // ab ~6 % bergab rot, voll bei ~12 %
    const c=RGB[SURF[Math.min(N-1,i)]||0]||RGB[0],r=Math.round(c[0]+(214-c[0])*st),gg=Math.round(c[1]+(40-c[1])*st),b=Math.round(c[2]+(34-c[2])*st);
    g.fillStyle='rgba('+r+','+gg+','+b+','+(c[3]+(0.95-c[3])*st)+')';
    const x0=i/N*420,y=profY(Math.min(N-1,i+(ST>>1)));g.fillRect(x0,y,ST/N*420+0.6,62-y);
  }
})();
let lastSec=-1;
let hudT=0;
function drawHud(){
  const hn=performance.now();if(hn-hudT<90)return;hudT=hn;   // Anzeigen nur ~11x pro Sekunde neu zeichnen
  const i=Math.min(N-1,Math.floor(st.pos/SEG));
  if(SEC[i]!==lastSec){lastSec=SEC[i];secEl.innerHTML=SECN[lastSec]+'<small>'+PLACE+'</small>';}
  spdEl.firstChild.nodeValue=(st.v*3.6).toFixed(0);
  gearHud();
  subEl.innerHTML='<b>'+Math.round(st.power)+' W</b>'+(hrm.live?' · <b>♥ '+hrm.bpm+'</b>':'')+' · '+(GR[i]>=0?'+':'')+GR[i].toFixed(0)+' %'+(GR[i]>2&&Math.abs(GR[i]*gearF()-GR[i])>0.5?' (fühlt sich an wie '+(GR[i]*gearF()).toFixed(0)+' %)':'')+' · '+(NHN0+PY[i]).toFixed(0)+' m ü. NHN<br>'+(st.pos/1000).toFixed(2)+' / '+(TOTAL/1000).toFixed(2)+' km · '+fmtT(st.t);
  mg.clearRect(0,0,180,180);mg.drawImage(miniBase,0,0);
  const mx=90+(PX[i]-Math.cos(HS[i])*st.x-MCX)*MS,my=90+(PZ[i]+Math.sin(HS[i])*st.x-MCZ)*MS;
  mg.save();mg.translate(mx,my);mg.rotate(Math.atan2(Math.cos(HS[i]),Math.sin(HS[i])));
  mg.fillStyle='#fff';mg.strokeStyle='#111';mg.lineWidth=1.5;mg.beginPath();mg.moveTo(7,0);mg.lineTo(-5,4.5);mg.lineTo(-5,-4.5);mg.closePath();mg.fill();mg.stroke();mg.restore();
  GRP.live().forEach(r=>{const j=Math.min(N-1,Math.max(0,Math.floor(r.d/SEG)));const c=GROUP_COLORS[r.k%8];
    mg.fillStyle=c;mg.strokeStyle='#111';mg.lineWidth=1.5;mg.beginPath();mg.arc(90+(PX[j]-Math.cos(HS[j])*r.x-MCX)*MS,90+(PZ[j]+Math.sin(HS[j])*r.x-MCZ)*MS,4.2,0,7);mg.fill();mg.stroke();});
  pg.clearRect(0,0,420,64);pg.drawImage(profBase,0,0);
  GRP.live().forEach(r=>{const j=Math.min(N-1,Math.max(0,Math.floor(r.d/SEG)));pg.fillStyle=GROUP_COLORS[r.k%8];pg.strokeStyle='#111';pg.lineWidth=1.2;pg.beginPath();pg.arc(j/N*420,profY(j),4,0,7);pg.fill();pg.stroke();});
  const gn=GRP.live().length;grpEl.textContent=GRP_CODE?'Gruppe '+GRP_CODE+' · '+(GRP.peer?(gn?gn+' Mitfahrer':'wartet auf Mitfahrer'):GRP.status):'';
  pg.fillStyle='#fff';pg.fillRect(i/N*420-1,2,2,60);pg.beginPath();pg.arc(i/N*420,profY(i),4,0,7);pg.fill();
}
let HM=90;
if(ROUTE){HM=0;for(let i=0;i<N;i++)HM+=Math.max(0,PY[i+1]-PY[i]);HM=Math.round(HM/10)*10;}
const ov=document.getElementById('overlay');
function routeBtns(){return '';}   // nur eine Strecke im Spiel
function mineHtml(){   // Streckenliste: feste Strecken + eigene GPX-Strecken (Zusatzstrecken)
  const esc=t=>String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const cur=GPX_ID?'gpx_'+GPX_ID:(!ROUTE?'halde':(ROUTES[RKEY]&&!ROUTES[RKEY].custom?RKEY:'tour2'));
  const base=[['tour2','MIWORU'],['wuppertal2','Whopperthal'],['hagen','Hagmoor'],['iserlohn','Isehorst'],['ibenstein','Bad Ibenstein'],['deikamm','Deikamm'],['hemer','Hemstein'],['buellberg','Bölkamp'],['dortmund','Dorbach'],['alpen','Sölden']];
  let h='<div class="mine"><div class="mh">Strecken</div>'+(hasPass()?'':'<div class="mr" style="grid-column:1/-1"><span class="mn">Weitere Strecken<small>mit einem kleinen Support ab 1 € · oder Community-Code</small></span><button class="main" data-unlock="">Supporten</button></div>')+base.map(b=>'<div class="mr'+(b[0]===cur?' cur':'')+'"><span class="mn">'+b[1]+'</span>'+(b[0]===cur?'<span class="act">aktiv</span>':(LOCKED.indexOf(b[0])>=0&&!hasPass()?'<button class="sec" data-unlock="'+b[0]+'">🔒 Supporten</button>':'<button class="sec" data-route="'+b[0]+'">Fahren</button>'))+'</div>').join('');
  return h+'</div>';
}
let helpOpen=false;
function showHelp(){
  helpOpen=true;ov.style.display='flex';
  const sec=(h,rows)=>'<div class="hs"><h3>'+h+'</h3>'+rows.map(r=>'<p>'+r+'</p>').join('')+'</div>';
  ov.innerHTML='<div class="intro"><div class="panel helpP">'+
    '<div class="by">by Wenn &amp; Aber Bike Crew</div><h1 style="font-size:clamp(34px,5vw,56px)">So funktioniert&rsquo;s</h1>'+
    '<div class="hscroll">'+
    sec('Das Spiel',['Du fährst echte Mountainbike-Strecken aus der Lenkersicht. Dein Tempo entsteht nur durch dein Treten, auch bergab: Abfahrten sind neutral. Lenken und Ausweichen laufen automatisch.','Mit einem Smart-Trainer (Bluetooth) trittst du einfach los, ohne Trainer geht es mit der Tastatur.'])+
    sec('Trainer und Zwift-Geräte koppeln',['Für Zwift Cog und Zwift Click müssen <b>beide</b> gekoppelt sein, sonst funktioniert das Schalten nicht. Beide im Menü unter Bluetooth verbinden (Click vorher in den blauen Koppelmodus bringen).','<b>iPad / iPhone:</b> Safari kann kein Bluetooth. Dafür brauchst du einmalig die kostenlose Zusatz-App <b>Bluefy</b>: 1. Bluefy im App Store installieren. 2. MIWORU-Adresse in Safari kopieren. 3. Bluefy öffnen, Adresse in die Adresszeile einfügen. 4. Im Spiel Trainer, Cog und Click koppeln. Das Spiel immer in Bluefy starten, nicht in Safari.'])+
    sec('Fahren',['<b>↑</b> treten · <b>↓</b> bremsen','<b>+</b> / <b>−</b> (oder Bild↑ / Bild↓): Gang schwerer / leichter. Zwift Click: <b>+</b> kurz = schwerer, gedrückt halten oder andere Taste = leichter.','<b>R</b> Neustart · <b>Esc</b> Pause und Menü · <b>V</b> Vollbild (Esc beendet es, auf dem Tablet das ✕ oben links)','Ins <b>Höhenprofil</b> oben klicken oder ziehen: an diese Stelle der Strecke springen.'])+
    sec('Schwierigkeit',['<b>S</b> schaltet die Stufen durch (auch der Knopf oben antippbar):','Leicht: 1,6-fache Wirkung deiner Watt, Steigungen nur zu 40 %','Normal','Hardcore: Steigungen zu 150 %, 0,85-fache Watt','Eskalation: 20 % härter als realistisch'])+
    sec('Anzeige und Sound ein- und ausschalten',['<b>Q</b> Grafik: Niedrig, Mittel, Hoch, Hoch mit 30 Bildern/s (spart Akku, bei ruckelndem Bild eine Stufe tiefer)','<b>V</b> Vollbild an/aus (Esc beendet; auf dem Tablet das ✕ oben links)','<b>T</b> Tageszeit: Live, Morgen, Mittag, Abend, Dämmerung (Nebel in den Senken, Sonnenstrahlen)','Auf Stufe Hoch: Sonnenstrahlen, Randunschärfe bei hohem Tempo, bei Nightride sichtbarer Lichtkegel mit Insekten','<b>A</b> Ambiente: sonnig, Live-Wetter, Regen, Gewitter (Sturm, Blitz und Donner, Böen mit fliegendem Laub), Herbst (Laubfarben, fallendes Laub), Schnee (leichter Schneefall, Schnee auf Boden und Bäumen)','<b>E</b> E-Bike: Motor hilft beim Treten bis 26 km/h, in jedem Gang (bergauf begrenzt, bergab darfst du schneller sein). Ein blauer Blitz steht dann neben km/h','<b>L</b> Nightride: Nachtfahrt an oder aus (nur auf den festen Strecken)','<b>N</b> Sound: alle Geräusche an oder aus','<b>F</b> Freilauf: schaltet durch aus, 16, 32, 56 und 72 Zähne. Weniger Zähne klingen gröber und klickernder, 72 ist das feine Surren. Bei hohem Tempo wird der Freilauf von Wind und Reifenabrollen überdeckt, ganz weg ist er nur auf „aus“.'])+
    sec('Nachtfahrt und Tiere',['Im Nightride fährst du mit Stirnlampe, Mond und Sternen. Nur dort und nur im dunklen Wald tauchen ab und zu Tiere auf: Wildschweine in einer Rotte mit Frischlingen, Hirsche und Rehe.','Du siehst sie nur schemenhaft am Wegrand, ihre Augen reflektieren das Licht deiner Lampe. Vor dem Weggehen rufen sie leise. Kommst du näher als 10 Meter, rennen sie weg und verschwinden in der Dunkelheit.','Ausschalten: <b>L</b> beendet den Nightride, und damit sind auch die Tiere weg. Ihre Rufe sind Teil von <b>N</b> (Sound).'])+
    sec('Strecken und Liftfahrten',['MIWORU bleibt kostenlos. Weitere Strecken schaltest du mit einem kleinen Support ab 1 € oder einem Community-Code frei.','Auf der Strecke in Sölden bringen dich Bergbahnen nach oben: Ein Hinweis zeigt Höhenmeter und Fahrzeit, die Liftzeit zählt nicht zu deiner Fahrzeit.'])+
    sec('Groupride',['Im Menü einen Gruppencode eingeben (alle Freunde denselben, dieselbe Strecke wählen). Mitfahrer erscheinen als farbige Punkte, in Minikarte und Höhenprofil immer.'])+
    sec('Probleme und Fehler',['Etwas läuft nicht rund? Technische Daten werden automatisch angehängt, du schreibst nur kurz, was passiert ist.'])+
    '</div>'+
    '<div class="btns"><button id="hback" class="main">← Zurück</button><button id="hrep" class="sec">Problem melden</button></div>'+
  '</div></div>';
  document.getElementById('hback').onclick=()=>{helpOpen=false;if(lastMenu)menu(lastMenu[0],lastMenu[1]);};
  document.getElementById('hrep').onclick=showReport;
}
function showReport(){   // Problem melden: technische Daten werden automatisch angehaengt, Meldung geht ueber /api/report in eine Tabelle
  helpOpen=true;ov.style.display='flex';
  const rl=(ROUTES[RKEY]||ROUTES.tour2).label;
  ov.innerHTML='<div class="intro"><div class="panel unlock"><div class="by">by Wenn &amp; Aber Bike Crew</div><h1>Problem melden</h1>'+
    '<div class="help">Du hast einen technischen Fehler gefunden? Beschreibe kurz, was passiert ist. Strecke, Streckenposition, Gerät, Grafikstufe und Trainerstatus werden automatisch mitgesendet.</div>'+
    '<div class="ucode"><div class="uh">Art des Problems</div><select id="rcat" class="rsel"><option>Trainer/Bluetooth</option><option>Grafik/Ruckeln</option><option>Strecke/Gelände</option><option>Sound</option><option selected>Sonstiges</option></select></div>'+
    '<div class="ucode"><div class="uh">Nachricht</div><textarea id="rmsg" class="rsel" rows="5" maxlength="2000" placeholder="Was ist passiert? Wo? Was hast du vorher gemacht?"></textarea></div>'+
    '<div class="ucode"><div class="uh">E-Mail für Rückfragen (freiwillig)</div><input id="rmail" type="text" class="rsel" inputmode="email" autocomplete="off" maxlength="120"></div>'+
    '<input id="rhp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">'+
    '<div class="help" style="font-size:12px;opacity:.7">Die Angaben werden nur zur Fehlerbehebung gespeichert, die E-Mail nur für Rückfragen.</div>'+
    '<div class="help" id="rst2"></div>'+
    '<div class="btns"><button id="rsend" class="main">Senden</button><button id="rback" class="sec">← Zurück</button></div></div></div>';
  ['rmsg','rmail','rhp','rcat'].forEach(id=>{const e=document.getElementById(id);e.onkeydown=e.onkeyup=e.onkeypress=ev=>ev.stopPropagation();});
  document.getElementById('rback').onclick=()=>{helpOpen=false;if(lastMenu)menu(lastMenu[0],lastMenu[1]);};
  const sb=document.getElementById('rsend'),stt=document.getElementById('rst2');
  sb.onclick=async()=>{
    const msg=document.getElementById('rmsg').value.trim();
    if(msg.length<10){stt.textContent='Bitte beschreibe das Problem etwas genauer.';return;}
    sb.disabled=true;stt.textContent='Wird gesendet …';
    const meta={route:rl,pos:(st.pos/1000).toFixed(2).replace('.',',')+' km',device:(IOS?'iPad/iPhone':'Desktop')+' · '+(BLE_OK?'Web Bluetooth':'ohne Bluetooth')+' · '+navigator.userAgent.slice(0,110),gfx:QN[quality],trainer:trainer.connected?trainer.name:'nicht verbunden'};
    try{
      const r=await fetch('/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cat:document.getElementById('rcat').value,msg,contact:document.getElementById('rmail').value.trim(),hp:document.getElementById('rhp').value,meta})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Senden fehlgeschlagen.');
      stt.textContent='Danke! Deine Meldung ist angekommen.';document.getElementById('rmsg').value='';setTimeout(()=>{helpOpen=false;if(lastMenu)menu(lastMenu[0],lastMenu[1]);},1600);
    }catch(e){stt.textContent=(e&&e.message)||'Senden fehlgeschlagen.';sb.disabled=false;}
  };
}
function showThanks(code,next){   // nach dem Support: Dank und Freischaltcode zum Notieren (fuer weitere Geraete: unter Community-Code eingeben)
  const c=typeof code==='string'?code:'';
  ov.innerHTML='<div class="intro"><div class="panel unlock"><div class="by">by Wenn &amp; Aber Bike Crew</div><h1>Vielen Dank!</h1>'+
    '<div class="help">Dein Support ist angekommen, alle weiteren Strecken sind jetzt freigeschaltet. Das hilft mir sehr, das Projekt weiterzuentwickeln.</div>'+
    (c?'<div class="ucode"><div class="uh">Dein Freischaltcode</div><div class="urow"><input id="tcode" type="text" readonly value="'+c+'" aria-label="Freischaltcode"><button id="tcp" class="sec">Kopieren</button></div></div>'+
    '<div class="help">Bitte notieren: Auf einem anderen Gerät oder nach dem Löschen der Browserdaten gibst du ihn im Support-Fenster bei „Community-Code" ein, dann sind die Strecken wieder frei.</div>':'')+
    '<div class="btns"><button id="tgo" class="main">Los geht\'s</button></div></div></div>';
  const ti=document.getElementById('tcode');if(ti){ti.onclick=()=>ti.select();ti.onkeydown=ti.onkeyup=ti.onkeypress=e=>e.stopPropagation();}
  const cp=document.getElementById('tcp');if(cp)cp.onclick=()=>{try{navigator.clipboard.writeText(c);cp.textContent='Kopiert';}catch(e){ti.select();}};
  document.getElementById('tgo').onclick=next;
}
function showUnlock(want){   // Support-Fenster: Betrag ab 1 EUR, kurze Geschichte zum Projekt, PayPal. Ein Support schaltet alle weiteren Strecken frei (Pruefung auf dem Server)
  helpOpen=true;ov.style.display='flex';menuBtn.style.display='none';
  const wname=want&&ROUTES[want]?ROUTES[want].label:'';
  ov.innerHTML='<div class="intro"><div class="panel unlock">'+
    '<div class="by">by Wenn &amp; Aber Bike Crew</div><h1>Support &amp; weitere Strecken</h1>'+
    '<div class="help">'+(wname?'<b>'+wname+'</b> gehört zu den weiteren Strecken. ':'')+'MIWORU bleibt kostenlos. Wer weitere Strecken fahren möchte, kann mich gern mit einem kleinen Betrag supporten: <b>ab 1 €</b>, den Betrag bestimmst du selbst. Damit sind Whopperthal, Hagmoor, Isehorst,Bad Ibenstein, Deikamm, Hemstein, Bölkamp, Dorbach und Sölden in diesem Browser freigeschaltet.</div>'+
    '<div class="ucode"><div class="uh">Betrag</div><div class="urow"><input id="uamt" type="text" inputmode="decimal" autocomplete="off" value="5" aria-label="Betrag in Euro"><span class="ueur">€</span><button id="ubuy" class="main">Supporten</button></div><div id="upp"></div></div>'+
    '<div class="help" id="umsg"></div>'+
    '<div class="ucode"><div class="uh">Community-Code</div><div class="urow"><input id="ucode" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Code eingeben"><button id="ucodeb" class="sec">Einlösen</button></div></div>'+
    '<div class="help ulinks"><a href="#" id="ustory">Warum gibt es das Projekt?</a></div>'+
    '<div class="btns"><button id="uback" class="sec">← Zurück</button></div>'+
  '</div></div>';
  const msg=t=>{document.getElementById('umsg').textContent=t||'';};
  const done=()=>{const q=want?'?route='+want:'';location.href=location.pathname+q+'#go';if(location.search===q)location.reload();};
  document.getElementById('uback').onclick=()=>{helpOpen=false;if(lastMenu)menu(lastMenu[0],lastMenu[1]);else location.href=location.pathname;};
  document.getElementById('ustory').onclick=e=>{e.preventDefault();showStory();};
  const ci=document.getElementById('ucode');
  const doRedeem=async()=>{const c=ci.value.trim();if(!c)return;msg('Prüfe Code …');try{const r=await redeem(c);if(r.ok){msg('Freigeschaltet!');setTimeout(done,500);}else msg(r.error||'Code nicht gültig.');}catch(e){msg('Keine Verbindung zum Server.');}};
  document.getElementById('ucodeb').onclick=doRedeem;ci.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter')doRedeem();};ci.onkeyup=ci.onkeypress=e=>e.stopPropagation();
  const ai=document.getElementById('uamt'),buy=document.getElementById('ubuy');ai.onkeydown=ai.onkeyup=ai.onkeypress=e=>e.stopPropagation();
  const amount=()=>{const n=Math.round(parseFloat(String(ai.value).replace(',','.'))*100)/100;return isFinite(n)&&n>=1&&n<=500?n:null;};
  buy.onclick=async()=>{
    const a=amount();if(a===null){msg('Bitte einen Betrag von 1 bis 500 € eingeben.');return;}
    buy.disabled=true;ai.disabled=true;msg('PayPal wird geladen …');
    try{
      const cfg=await payConfig();if(!cfg.clientId){msg('Bezahlung ist noch nicht eingerichtet.');buy.disabled=false;ai.disabled=false;return;}
      const pp=await loadPayPal(cfg.clientId);msg('');
      pp.Buttons({style:{layout:'vertical',shape:'rect',label:'donate'},
        createOrder:()=>payCreate(a.toFixed(2)),
        onApprove:async d=>{msg('Zahlung wird bestätigt …');try{const cd=await payCapture(d.orderID);showThanks(cd,done);}catch(e){msg('Zahlung konnte nicht bestätigt werden: '+(e&&e.message||e)+' Bitte melde dich mit der PayPal-Transaktionsnummer.');}},
        onCancel:()=>{msg('Abgebrochen.');buy.disabled=false;ai.disabled=false;},
        onError:e=>{msg('PayPal-Fehler: '+(e&&e.message||e));buy.disabled=false;ai.disabled=false;}
      }).render('#upp');
    }catch(e){msg(String(e&&e.message||e));buy.disabled=false;ai.disabled=false;}
  };
  setTimeout(()=>{if(helpOpen&&document.getElementById('ustory')&&!sessionStorage.getItem('miworu_story_seen')){try{sessionStorage.setItem('miworu_story_seen','1');}catch(e){}showStory();}},350);   // kleines Fenster mit der Geschichte, einmal pro Sitzung
}
function showStory(){   // kleines Fenster ueber dem Support-Fenster: Foto und persoenlicher Text
  if(document.getElementById('story'))return;
  const d=document.createElement('div');d.id='story';
  d.innerHTML='<div class="sbox"><button class="sx" aria-label="Schließen">×</button>'+
    '<img class="sph" src="/assets/lars.jpg" alt="Lars" onerror="this.style.display=\'none\'">'+
    '<h2>Moin, ich bin Lars</h2>'+
    '<p>Ich fahre sehr gern Mountainbike, und wir sind eine kleine Crew. Eigentlich wollen wir oft zusammen raus, aber das Wetter spielt selten mit, und zeitlich bekommen wir regelmäßige Touren auch nicht immer hin.</p>'+
    '<p>Rennrad fahren möchte ich nicht. Also habe ich überlegt, wie ich das ganze System aus Swift, Rouvy und Co. aufs Mountainbiken übertragen kann. Daraus ist dieses Projekt entstanden.</p>'+
    '<p>Wer weitere Strecken fahren möchte, kann mich gern mit einem kleinen Betrag supporten. Ich entwickle das Programm ständig weiter.</p>'+
    '<button class="main sok">Zum Support</button></div>';
  document.body.appendChild(d);
  const c=()=>d.remove();d.querySelector('.sx').onclick=c;d.querySelector('.sok').onclick=c;d.onclick=e=>{if(e.target===d)c();};
}
function menu(title,sub){
  helpOpen=false;lastMenu=[title,sub];menuBtn.style.display='none';AUDIO.hold(true);
  ov.style.display='flex';hudBox.style.display=sub?'block':'none';
  const km=(TOTAL/1000).toFixed(1).replace('.',',');
  ov.innerHTML='<div class="intro">'+
    '<div class="poster"><img src="'+ASSETS+'ui/miworu.png" alt="MIWORU"></div>'+
    '<div class="panel">'+
      '<h1>MIWORU</h1>'+
      (sub?'<div class="res">'+sub+'</div>':'')+
      (String(ROUTE?RT.label:TRACK_NAME).replace(/<[^>]*>/g,'').trim().toUpperCase()==='MIWORU'?'':'<div class="route">'+(ROUTE?RT.label:TRACK_NAME)+'</div>')+
      '<div class="stats"><div><b>'+km+'</b><i>km</i></div><div><b>'+HM+'</b><i>Höhenmeter</i></div></div>'+
      '<div class="btns"><button id="go" class="main">'+title+'</button>'+(st.done&&REC.length>1?'<button id="stv" class="main" style="background:#fc4c02;border-color:#fc4c02;color:#fff">It never happened if it\'s not on Strava</button><div class="help" style="grid-column:1/-1;margin:0">Lädt deine Fahrt als Datei (.tcx) herunter. Bei Strava: + → Aktivität hochladen → Datei wählen, Sportart „Virtuelle Fahrt“ einstellen.</div>':'')+(paused||SAVED?'<button id="rst" class="sec">Neu starten</button>':'')+'<div class="bg">Verbinden</div><button id="trn" class="sec"><i class="dot'+(trainer.connected?' on':'')+'"></i>'+(trainer.connected?'Trainer: '+trainer.name+' ✓':'Trainer koppeln')+'</button><button id="clk" class="sec"><i class="dot'+(click.connected?(click.devs.filter(x=>!x.lost).length>=2?' on':' mid'):'')+'"></i>'+(()=>{const n=click.devs.filter(x=>!x.lost).length;return n>=2?'Zwift Click: beide Hälften ✓':n===1&&click.connected?'Zwift Click ✓ · zweite Hälfte koppeln (stabiler)':(click.devs.length?'Zwift Click: getrennt – neu koppeln':'Zwift Click koppeln');})()+'</button>'+'<button id="hrb" class="sec"><i class="dot'+(hrm.connected?' on':'')+'"></i>'+(hrm.connected?'Brustgurt: '+hrm.name+(hrm.live?' · ♥ '+hrm.bpm:' ✓'):'Brustgurt koppeln (Puls)')+'</button><div class="bg">Fahren</div><button id="dif" class="sec">Schwierigkeit (S): '+DIFFN[diff]+'</button><button id="ebb" class="sec">E-Bike (E): '+(EBIKE?'an':'aus')+'</button><button id="hubb" class="sec">Freilauf: '+(AUDIO.hub?AUDIO.hub+' Zähne':'aus')+'</button><button id="grpb" class="sec">'+(GRP_CODE?'Groupride: '+GRP_CODE:'Groupride')+'</button><div class="bg">Darstellung &amp; Ton</div><button id="qual" class="sec">Grafik (Q): '+qLabel()+'</button><button id="wxb" class="sec">Ambiente (A): '+WXL()+'</button><button id="nghb" class="sec" style="display:'+(MW?'':'none')+'">Nightride: '+(NIGHT?(NIGHT_AUTO&&!NIGHT_MAN?'an · automatisch':'an'):'aus')+'</button><button id="snd" class="sec">Sound: '+(AUDIO.on?'an':'aus')+'</button><button id="fsb" class="sec">'+(isFS()?'Vollbild beenden (V)':'Vollbild (V)')+'</button><div class="bg">Hilfe</div><button id="hlp" class="sec">So fährst du · Problem melden</button></div>'+mineHtml()+
      '<div class="help" id="blemsg">'+(trainer.connected?trainer.name+': '+trainer.status+' · '+Math.round(trainer.power)+' W':!BLE_OK?(IOS?'iPad: Seite in der App Bluefy öffnen (Safari kann kein Bluetooth).':'Bluetooth nur in Chrome/Edge (nicht Safari).'):'D100 oder KICKR einschalten, dann „Trainer koppeln“.')+(bleMsg?'<br>'+bleMsg:'')+''+(click.connected?'<br>'+click.name+' verbunden'+'<br>Click: kurz drücken = schwerer · gedrückt halten = leichter':(click.devs.length?'<br><b>'+click.name+': nicht verbunden</b> – Click einmal drücken oder neu koppeln':''))+'</div>'+
    '<div class="help" style="font-size:11px;opacity:.6">© 2026 Lars Kröger. Alle Rechte vorbehalten. Kopieren oder Weiterverwenden ohne Genehmigung untersagt.<br>© OpenStreetMap-Mitwirkende · © Geobasis NRW · Datenquelle: Land Tirol - data.tirol.gv.at (CC BY 4.0) · <a href="/rechtliches.html" target="_blank" rel="noopener" style="color:inherit">Rechtliches</a> · <a href="mailto:post@kroeger-grafikdesign.de" style="color:inherit">post@kroeger-grafikdesign.de</a></div>'+
    '</div></div>';
  document.getElementById('dif').onclick=()=>{setDiff(diff%4+1);menu(title,sub);};
  document.getElementById('qual').onclick=()=>{cycleQ();menu(title,sub);};
  document.getElementById('snd').onclick=()=>{AUDIO.toggle();menu(title,sub);};
  document.getElementById('wxb').onclick=()=>{cycleWX();menu(title,sub);};  document.getElementById('ebb').onclick=()=>{toggleEbike();menu(title,sub);};
  document.getElementById('nghb').onclick=()=>{toggleNight();menu(title,sub);};
  document.getElementById('hubb').onclick=()=>{AUDIO.cycleHub();menu(title,sub);};
  document.getElementById('grpb').onclick=()=>{const c=window.prompt('Groupride-Code für die gemeinsame Fahrt (alle Freunde geben denselben Code ein, leer = aus):',GRP_CODE);if(c===null)return;GRP_CODE=c.trim().toLowerCase().replace(/[^a-z0-9äöüß]+/g,'').slice(0,24);try{localStorage.setItem('miworu_group',GRP_CODE);}catch(_){}grpJoin();menu(title,sub);};
  document.querySelectorAll('[data-unlock]').forEach(b=>b.onclick=()=>showUnlock(b.getAttribute('data-unlock')||null));
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{const r=b.getAttribute('data-route');location.href=location.pathname+(r?'?route='+r:'')+'#go';});
  document.getElementById('fsb').onclick=()=>{toggleFS();setTimeout(()=>{const b=document.getElementById('fsb');if(b)b.textContent=isFS()?'Vollbild beenden (V)':'Vollbild (V)';},400);};
  document.getElementById('trn').onclick=async()=>{bleMsg='';if(bleGuard())return;try{await trainer.connect();}catch(e){bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Trainer: '+(e&&e.message||e);}menu(title,sub);};
  document.getElementById('hlp').onclick=showHelp;
  document.getElementById('hrb').onclick=async()=>{bleMsg='';if(bleGuard())return;try{await hrm.connect();}catch(e){bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Brustgurt: '+(e&&e.message||e);}menu(title,sub);};
  const stv=document.getElementById('stv');if(stv)stv.onclick=()=>{downloadTCX(REC,{name:'MIWORU '+(ROUTE?RT.label:'')});stv.textContent='Datei gespeichert ✓';};
  document.getElementById('clk').onclick=async()=>{bleMsg='';if(bleGuard())return;try{await click.connect();}catch(e){click.dbg('Koppeln fehlgeschlagen: '+(e&&e.name||'')+' '+(e&&e.message||e));bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Click: '+(e&&e.message||e);}menu(title,sub);};
  document.getElementById('go').onclick=paused?resume:(SAVED?startSaved:start);
  const rst=document.getElementById('rst');if(rst)rst.onclick=start;
}
// Pause + Hauptmenue (Esc oder Menue-Knopf oben rechts, z. B. fuer iPad ohne Tastatur)
function pauseGame(){if(!running)return;running=false;paused=true;trainer.setGrade(0,0.005,true);offEl.style.display='none';menu('Weiterfahren','Pause · '+(st.pos/1000).toFixed(2)+' km · '+fmtT(st.t));}
const menuBtn=document.getElementById('menuBtn');menuBtn.onclick=pauseGame;
hintEl.onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.getAttribute('data-act');if(a==='d1')setDiff(1);else if(a==='d2')setDiff(2);else if(a==='d3')setDiff(3);else if(a==='d4')setDiff(4);else if(a==='v')toggleFS();else if(a==='q')cycleQ();else if(a==='n'){AUDIO.toggle();toastEl.textContent='Sound: '+(AUDIO.on?'an':'aus');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1100);}else if(a==='w')cycleWX();else if(a==='l')toggleNight();else if(a==='f'){const h=AUDIO.cycleHub();hintHud.k=null;toastEl.textContent='Freilauf: '+(h?h+' Zähne':'aus');toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1200);}};
function resume(){if(GRP_CODE&&!GRP.peer)grpJoin();menuBtn.style.display='';paused=false;running=true;AUDIO.hold(false);ov.style.display='none';hudBox.style.display='block';}
const PK='miworu_prog2_'+RKEY;let SAVED=null;   // prog2: alte Fortschritte gehoerten zu anderen Strecken
try{const o=JSON.parse(localStorage.getItem(PK)||'null');if(o&&o.pos>50&&Date.now()-o.ts<864e5)SAVED=o;}catch(e){}
setInterval(()=>{if(running&&st.pos>50&&!st.done)try{localStorage.setItem(PK,JSON.stringify({pos:st.pos,t:st.t,ts:Date.now()}));}catch(e){}},2000);
function clearProg(){SAVED=null;try{localStorage.removeItem(PK);}catch(e){}}
function startSaved(){const o=SAVED;start();if(o){st.pos=o.pos;st.t=o.t;}}
function start(){AUDIO.init();if(GRP_CODE&&!GRP.peer)grpJoin();menuBtn.style.display='';clearProg();paused=false;reset();if(trainer.connected)trainer.setGrade(0,0.005,true);running=true;AUDIO.hold(false);lastSec=-1;ov.style.display='none';hudBox.style.display='block';}

// ================= Kamera & Render =================
const smp={x:0,y:0,z:0,h:0},smp2={x:0,y:0,z:0,h:0};
function sample(s,o){
  const e=s<0?s:0;s=clamp(s,0,TOTAL-0.001);
  const i=Math.floor(s/SEG),f=s/SEG-i;
  o.h=HS[i]+wrapA(HS[Math.min(i+1,N)]-HS[i])*f;
  o.x=lerp(PX[i],PX[i+1],f)+Math.sin(o.h)*e;o.y=lerp(PY[i],PY[i+1],f);o.z=lerp(PZ[i],PZ[i+1],f)+Math.cos(o.h)*e;
}
const camT=new THREE.Vector3(),lookT=new THREE.Vector3(),lookC=new THREE.Vector3(0,60,0),ctr=new THREE.Vector3();
let camInit=false,BRK=0,yawC=0;
const OR=ROUTE?{cx:MCX,cz:MCZ,r:1000,h:420,ly:55,cr:260}:{cx:0,cz:0,r:540,h:170,ly:58,cr:120};
const RAIN_N=900,rainG=new THREE.BufferGeometry(),rainP=new Float32Array(RAIN_N*6),rainS=new Float32Array(RAIN_N*3);
for(let k=0;k<RAIN_N;k++){rainS[k*3]=(Math.random()-0.5)*26;rainS[k*3+1]=Math.random()*14;rainS[k*3+2]=(Math.random()-0.5)*26;}
rainG.setAttribute('position',new THREE.BufferAttribute(rainP,3));
const rainM=new THREE.LineSegments(rainG,new THREE.LineBasicMaterial({color:0xcfd8e0,transparent:true,opacity:0.28,depthWrite:false,fog:false}));rainM.frustumCulled=false;rainM.visible=false;scene.add(rainM);
function updateRain(dt){
  rainM.visible=WX===2;if(WX!==2)return;rainM.material.opacity=STORMFX?0.42:0.28;
  const cx=camera.position.x,cy=camera.position.y-2,cz=camera.position.z,vv=(running?st.v:0);
  for(let k=0;k<RAIN_N;k++){
    rainS[k*3+1]-=dt*(STORMFX?13:9);let y=rainS[k*3+1];
    if(y<0){rainS[k*3+1]=y+14;rainS[k*3]=(Math.random()-0.5)*26;rainS[k*3+2]=(Math.random()-0.5)*26;y=rainS[k*3+1];}
    const x=cx+rainS[k*3],z=cz+rainS[k*3+2],yy=cy+y;
    rainP.set([x,yy,z,x+0.012*vv+WIND.x*0.05,yy+0.45,z+0.02*vv+WIND.z*0.05],k*6);
  }
  rainG.attributes.position.needsUpdate=true;
}
// Tropfen auf der "Linse": spritzen bei Pfuetzen auf, laufen leicht ab, verformen sich und verschwinden nach einigen Sekunden
const dropC=document.createElement('canvas');dropC.id='drops';dropC.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;';document.getElementById('wrap').appendChild(dropC);
const dropX=dropC.getContext('2d'),DROPS=[];
function splashDrops(v){
  const W=dropC.width||window.innerWidth,H=dropC.height||window.innerHeight,n=Math.min(26,6+Math.round(v*1.6));
  for(let k=0;k<n;k++){const rr=(0.004+Math.random()*0.012)*Math.min(W,H);DROPS.push({x:W*(0.12+Math.random()*0.76),y:H*(0.25+Math.random()*0.7),r:rr,life:2.8+Math.random()*3.2,age:-Math.random()*0.15,vy:(2+Math.random()*7)*H/700});}
}
function drawDrops(dt){
  const W=window.innerWidth,H=window.innerHeight;if(dropC.width!==W||dropC.height!==H){dropC.width=W;dropC.height=H;}
  if(WX===2&&running&&Math.random()<dt*2.2)DROPS.push({x:W*Math.random(),y:H*(0.1+Math.random()*0.8),r:(0.003+Math.random()*0.007)*Math.min(W,H),life:2.5+Math.random()*3,age:0,vy:(1+Math.random()*4)*H/700});
  dropX.clearRect(0,0,W,H);if(!running)return;
  for(let i=DROPS.length-1;i>=0;i--){const d=DROPS[i];d.age+=dt;if(d.age<0)continue;const u=d.age/d.life;if(u>=1){DROPS.splice(i,1);continue;}
    const fin=Math.min(1,u/0.12),fout=u<0.55?1:1-(u-0.55)/0.45,al=fin*fout;if(u>0.35)d.y+=d.vy*dt*(u-0.2);
    const rx=d.r*(1-0.35*u*u),ry=d.r*(1+1.1*Math.max(0,u-0.3));   // wird mit der Zeit schmaler und laeuft nach unten aus
    const g=dropX.createRadialGradient(d.x-rx*0.25,d.y-ry*0.3,rx*0.1,d.x,d.y,Math.max(rx,ry));
    g.addColorStop(0,'rgba(255,255,255,'+(0.16*al).toFixed(3)+')');g.addColorStop(0.7,'rgba(210,225,235,'+(0.16*al).toFixed(3)+')');g.addColorStop(1,'rgba(20,28,36,'+(0.5*al).toFixed(3)+')');
    dropX.fillStyle=g;dropX.beginPath();dropX.ellipse(d.x,d.y,rx,ry,0,0,6.2832);dropX.fill();
    dropX.fillStyle='rgba(255,255,255,'+(0.8*al).toFixed(3)+')';dropX.beginPath();dropX.ellipse(d.x-rx*0.3,d.y-ry*0.4,rx*0.22,ry*0.16,0,0,6.2832);dropX.fill();}
}
// ================= Grafik+: Tageszeit (T), Jahreszeit (J), Partikel (Laub, Schnee, Staub), Tempo-Effekte =================
function softTex(kind){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');
  if(kind==='leaf'){x.fillStyle='#fff';x.beginPath();x.ellipse(16,16,13,7,0.6,0,6.3);x.fill();}
  else{const g=x.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.45,'rgba(255,255,255,.6)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,32,32);}
  return new THREE.CanvasTexture(c);}
const PTS_U={uScale:{value:600},uLit:{value:1}};
function mkPts(n,tex,additive){
  const g=new THREE.BufferGeometry(),pos=new Float32Array(n*3),sz=new Float32Array(n),al=new Float32Array(n),col=new Float32Array(n*3);
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('aSize',new THREE.BufferAttribute(sz,1));g.setAttribute('aAlpha',new THREE.BufferAttribute(al,1));g.setAttribute('aCol',new THREE.BufferAttribute(col,3));
  const m=new THREE.ShaderMaterial({uniforms:{map:{value:tex},uScale:PTS_U.uScale,uLit:PTS_U.uLit},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
    vertexShader:'attribute float aSize,aAlpha;attribute vec3 aCol;uniform float uScale;varying float vA;varying vec3 vC;void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=min(160.0,aSize*uScale/max(0.1,-mv.z));vA=aAlpha;vC=aCol;}',
    fragmentShader:'uniform sampler2D map;uniform float uLit;varying float vA;varying vec3 vC;void main(){vec4 t=texture2D(map,gl_PointCoord);gl_FragColor=vec4(vC*uLit,t.a*vA);}'});
  const p=new THREE.Points(g,m);p.frustumCulled=false;p.visible=false;scene.add(p);
  return {p,g,pos,sz,al,col,n,m};}
const T_LEAF=softTex('leaf'),T_SOFT=softTex('soft');
const FALL=mkPts(1500,T_LEAF,false),FALL_PH=new Float32Array(1500).map(()=>Math.random()*6.283);
const DUST=mkPts(110,T_SOFT,false),DUST_V=new Float32Array(110*3),DUST_L=new Float32Array(110),DUST_A=new Float32Array(110);let dustI=0,dustAcc=0;
let SEAS=0,SPD=0;const SEAN=['Standard','Herbst','Winter'];
// ---- Gewitter: Boeen (Wind), Blitz-Flash, Laub im Sturm ----
const WIND={k:0,g:0,x:0,z:0,dir:0,gt:0,dur:3,pk:1,next:2,lt:5};
const FLASH=document.createElement('div');FLASH.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:4;background:#e2e8ff;opacity:0;transition:opacity .07s linear';document.getElementById('wrap').appendChild(FLASH);
function stormSync(){   // schaltet die Laub-Partikel zwischen Sturm und Jahreszeit um
  const on=STORM();if(on===STORMFX)return;STORMFX=on;WIND.next=1.5;WIND.lt=20+Math.random()*30;WIND.gt=0;
  if(on){FALL.p.visible=false;const c=camera.position;   // Gewitter ohne fliegendes Laub
    for(let i=0;i<FALL.n;i++){FALL.pos[i*3]=c.x+(Math.random()-0.5)*18;FALL.pos[i*3+1]=c.y-4+Math.random()*16;FALL.pos[i*3+2]=c.z+(Math.random()-0.5)*18;
      const k=Math.random();FALL.col.set(k<0.3?[.62,.78,.28]:k<0.55?[.95,.8,.28]:k<0.8?[1,.58,.16]:[.85,.3,.1],i*3);FALL.al[i]=1;FALL.sz[i]=0.12+Math.random()*0.08;}
    FALL.g.attributes.aCol.needsUpdate=true;FALL.g.attributes.aAlpha.needsUpdate=true;FALL.g.attributes.aSize.needsUpdate=true;}
  else seasonSet(SEAS);
}
function lightning(){   // Blitz: mehrfaches Aufflackern, Donner kommt je nach Entfernung verzoegert; jeder dritte Blitz ist ein Einschlag in der Naehe (gleissend hell, Knall sofort, Rad wackelt)
  const heavy=Math.random()<0.34,dist=heavy?Math.random()*0.1:Math.random();
  const seq=heavy?[[0,1],[70,0.3],[140,1],[230,0.4],[310,0.9],[400,0.25],[520,0.6],[700,0]]:[[0,0.8],[90,0.2],[170,0.65],[330,0]];
  seq.forEach(([d,o])=>setTimeout(()=>{FLASH.style.opacity=(o*(1-dist*0.45)).toFixed(2);},d));
  setTimeout(()=>{AUDIO.thunder(dist,heavy);if(heavy){SHK.vy+=0.6;SHK.vr+=(Math.random()-0.5)*2.5;SHK.wv+=(Math.random()<0.5?-1:1)*90;}else if(dist<0.35){SHK.vy+=0.22;SHK.vr+=(Math.random()-0.5)*0.8;}},heavy?120+dist*800:300+dist*3200);}
function windFx(dt,t){
  if(!STORMFX){if(WIND.k||WIND.g){WIND.k=WIND.g=WIND.x=WIND.z=0;AUDIO.setWind(0,false);}return;}
  WIND.next-=dt;
  if(WIND.gt<=0&&WIND.next<=0){WIND.gt=WIND.dur=2.5+Math.random()*2.5;WIND.pk=0.7+Math.random()*0.3;WIND.dir=Math.random()*6.283;WIND.next=3+Math.random()*6;
    if(running){const sg=Math.random()<0.5?-1:1;SHK.vr+=sg*0.5*WIND.pk;SHK.wv+=sg*45*WIND.pk;}}   // Boe erfasst das Rad
  let g=0;if(WIND.gt>0){WIND.gt-=dt;const u=1-Math.max(0,WIND.gt)/WIND.dur;g=Math.pow(Math.sin(Math.PI*u),2)*WIND.pk;}
  WIND.g=g;WIND.k=Math.min(1,0.22+0.78*g);const sp=1.2+9*g;WIND.x=Math.cos(WIND.dir)*sp;WIND.z=Math.sin(WIND.dir)*sp;
  if(g>0.45&&running)SHK.vr+=(Math.random()-0.5)*0.05*g;
  AUDIO.setWind(WIND.k,true);
  WIND.lt-=dt;if(WIND.lt<=0&&running&&!paused){WIND.lt=105+Math.random()*30;lightning();}   // ein Blitz etwa alle 2 Minuten
}
function seasonSet(m){
  SEAS=m;try{localStorage.setItem('miworu_sea',m);}catch(e){}
  SEA.aut.value=m===1?1:0;SEA.win.value=m===2?1:0;
  let mn=1e9,mx=-1e9;for(let i=0;i<=N;i+=4){mn=Math.min(mn,PY[i]);mx=Math.max(mx,PY[i]);}
  SEA.snowY.value=(RT&&RT.alp)?mn+(mx-mn)*0.3:-1e5;SEA.snowK.value=(RT&&RT.alp)?1:0.56;   // ausserhalb der Alpen liegt nur leichter Schnee
  FALL.p.visible=m===2||(m===1&&SPEC!=='fir'&&!(RT&&RT.alp));   // Nadelwald (Tannen) und Alpen: kein Laubfall im Herbst
  FALL.m.uniforms.map.value=m===1?T_LEAF:T_SOFT;
  const c=camera.position;for(let i=0;i<FALL.n;i++){FALL.pos[i*3]=c.x+(Math.random()-0.5)*32;FALL.pos[i*3+1]=c.y-4+Math.random()*16;FALL.pos[i*3+2]=c.z+(Math.random()-0.5)*32;
    const k=Math.random();if(m===1){const a=k<0.3?[1,.62,.14]:k<0.58?[.95,.42,.08]:k<0.8?[.72,.17,.07]:[.86,.78,.22];FALL.col.set(a,i*3);}else FALL.col.set([.95,.97,1],i*3);FALL.al[i]=m===1?(i<380?0.92:0):0.85;FALL.sz[i]=m===1?0.15:0.07+Math.random()*0.05;}   // Winter: viel mehr Flocken (1500), Herbst weiter 380 Blaetter
  FALL.g.attributes.aCol.needsUpdate=true;FALL.g.attributes.aAlpha.needsUpdate=true;FALL.g.attributes.aSize.needsUpdate=true;
  if(BK)applySun(true);
}
function sunAltAt(utc){const d=new Date(),doy=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/864e5);
  const phi=51.6*Math.PI/180,dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+doy)/365),H=(((utc+7.6/15)%24+24)%24-12)*15*Math.PI/180;
  return Math.asin(clamp(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H),-1,1))*180/Math.PI;}
function todSet(m){
  TODM=m;TODUTC=null;try{localStorage.setItem('miworu_tod',m);}catch(e){}
  if(NIGHT_AUTO){NIGHT_AUTO=false;if(!NIGHT_MAN){NIGHT=false;nightApply();}}
  if(m>0){let mx=-99,hm=12;for(let h=0;h<24;h+=0.05){const a=sunAltAt(h);if(a>mx){mx=a;hm=h;}}
    TODUTC=hm;
    if(m===1){const t=Math.min(8,mx*0.6);for(let h=hm;h>0;h-=0.05)if(sunAltAt(h)<t){TODUTC=h;break;}}
    else if(m===3){const t=Math.min(6,mx*0.45);for(let h=hm;h<24;h+=0.05)if(sunAltAt(h)<t){TODUTC=h;break;}}
    else if(m===4){for(let h=hm;h<24;h+=0.05)if(sunAltAt(h)<-3){TODUTC=h;break;}}}
  if(BK)applySun(true);
}
function toastMsg(t){toastEl.textContent=t;toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1600);}
const _gd=new THREE.Vector3(),_gs=new THREE.Vector3();
function updateFx(dt,now){
  PTS_U.uScale.value=renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360));
  const hl=NIGHT?0.12:clamp(0.3+sun.intensity*0.3+hemi.intensity*0.2,0.3,1.0);PTS_U.uLit.value=hl;
  const c=camera.position,t=now*0.001,run=running&&!st.done;windFx(dt,t);
  if(FALL.p.visible){const sp=STORMFX?0.8:SEAS===1?1.0:1.3,p=FALL.pos;
    for(let i=0;i<FALL.n;i++){const ph=FALL_PH[i],j=i*3;
      p[j]+=(Math.sin(t*1.3+ph)*(SEAS===1?0.7:0.3)+0.25)*dt;p[j+1]-=sp*dt*(0.7+0.3*Math.sin(ph*3));p[j+2]+=Math.cos(t*1.1+ph*1.7)*(SEAS===1?0.5:0.2)*dt;
      if(STORMFX){const lm=0.5+0.9*Math.abs(Math.sin(ph*5));p[j]+=WIND.x*lm*dt;p[j+2]+=WIND.z*lm*dt;p[j+1]+=WIND.g*dt*(1.2+2.8*Math.sin(ph*3+t*3.1));}   // Boeen wirbeln das Laub durch die Luft
      let dx=p[j]-c.x,dz=p[j+2]-c.z;const bw=STORMFX?9:16;if(dx>bw)p[j]-=bw*2;else if(dx<-bw)p[j]+=bw*2;if(dz>bw)p[j+2]-=bw*2;else if(dz<-bw)p[j+2]+=bw*2;   // Sturm: dichtere Wolke aus Laub um den Fahrer
      if(p[j+1]<c.y-4)p[j+1]+=16;else if(p[j+1]>c.y+12)p[j+1]-=16;
      if(SEAS===1||STORMFX)FALL.sz[i]=(STORMFX?0.5:0.15)*(0.5+0.5*Math.abs(Math.sin(t*2.4+ph*7)));}
    FALL.g.attributes.position.needsUpdate=true;if(SEAS===1||STORMFX)FALL.g.attributes.aSize.needsUpdate=true;}
  // Staub und Spritzer auf Schotter/Trail
  const si=clamp(Math.round(st.pos/SEG),0,N),dusty=run&&SURF[si]!==0&&st.v>3.5&&WX!==2;
  if(dusty){camera.getWorldDirection(_gd);_gd.y=0;_gd.normalize();dustAcc+=dt*st.v*2.4;
    while(dustAcc>1){dustAcc-=1;const i=dustI++%DUST.n,j=i*3,fw=1.6+Math.random()*1.4,sd=(Math.random()-0.5)*1.5;
      const x=c.x+_gd.x*fw-_gd.z*sd,z=c.z+_gd.z*fw+_gd.x*sd;DUST.pos[j]=x;DUST.pos[j+1]=gnd(x,z)+0.08;DUST.pos[j+2]=z;
      DUST_V[j]=-_gd.x*st.v*0.12+(Math.random()-0.5)*0.8;DUST_V[j+1]=0.5+Math.random()*0.9;DUST_V[j+2]=-_gd.z*st.v*0.12+(Math.random()-0.5)*0.8;
      DUST_L[i]=0.7+Math.random()*0.8;DUST_A[i]=0;DUST.col.set([0.62,0.55,0.45],j);}
    DUST.g.attributes.aCol.needsUpdate=true;}
  let any=false;for(let i=0;i<DUST.n;i++){if(DUST_L[i]<=0){DUST.al[i]=0;continue;}any=true;const j=i*3;DUST_A[i]+=dt;const u=DUST_A[i]/DUST_L[i];
    if(u>=1){DUST_L[i]=0;DUST.al[i]=0;continue;}
    DUST.pos[j]+=DUST_V[j]*dt;DUST.pos[j+1]+=DUST_V[j+1]*dt;DUST.pos[j+2]+=DUST_V[j+2]*dt;DUST_V[j+1]*=1-dt*1.2;
    DUST.sz[i]=0.25+u*0.9;DUST.al[i]=0.4*Math.pow(1-u,1.4);}
  DUST.p.visible=any;if(any){DUST.g.attributes.position.needsUpdate=true;DUST.g.attributes.aSize.needsUpdate=true;DUST.g.attributes.aAlpha.needsUpdate=true;}
  // Tempo: Randunschaerfe und Vignette, Sonnenstrahlen (nur Stufe Hoch)
  SPD+=((run?sstep(12,22,st.v):0)-SPD)*Math.min(1,dt*2.5);
  if(FXon&&FXP){const U=FXP.uniforms;U.spd.value=SPD;
    camera.getWorldDirection(_gd);const fc=_gd.dot(SUN);let ray=0;
    if(BK&&fc>0.12&&!NIGHT&&WX!==2){_gs.copy(c).addScaledVector(SUN,1000).project(camera);U.sunUV.value.set(_gs.x*0.5+0.5,_gs.y*0.5+0.5);
      const alt=window.__sun?window.__sun.alt:30;ray=sstep(0.12,0.55,fc)*(0.4+0.6*(1-sstep(10,34,alt)))*(WX===1?0.45:1)*(TODM===2?0.5:1);}
    U.ray.value=ray;}
}

// Nightride-Lampe: sichtbarer Lichtkegel (additive Scheiben, von Baeumen verdeckt) und Insekten im Strahl; nur Stufe Hoch
const BEAM=new THREE.Group();BEAM.visible=false;scene.add(BEAM);
for(let k=0;k<14;k++){const d=3+k*3.2,m=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:T_SOFT,color:0xfff1d6,transparent:true,opacity:0.02,blending:THREE.AdditiveBlending,depthWrite:false,fog:false}));m.position.z=-d;m.scale.setScalar(2*d*0.27);m.renderOrder=5;m.frustumCulled=false;m.userData.o=0.02*Math.exp(-d/26);BEAM.add(m);}
const INS=mkPts(22,T_SOFT,true),INS_W=new Float32Array(22*3),INS_P=new Float32Array(22).map(()=>Math.random()*6.28);INS.m.uniforms.uLit={value:1};
const _im=new THREE.Matrix4(),_iv=new THREE.Vector3();
function updateBeam(dt,now){
  const on=NIGHT&&quality>2;BEAM.visible=on;INS.p.visible=on;if(!on)return;
  const c=camera.position,t=now*0.001;
  BEAM.quaternion.copy(camera.quaternion);BEAM.position.set(0,-0.28,-0.3).applyQuaternion(camera.quaternion).add(c);
  const bm=1+(WX?1.8:0)+GF.value.x*2.5;BEAM.children.forEach(m=>{m.material.opacity=m.userData.o*bm;});
  camera.updateMatrixWorld();_im.copy(camera.matrixWorld).invert();
  for(let i=0;i<22;i++){const j=i*3;INS_W[j]+=(Math.random()-0.5)*dt*3.5;INS_W[j+1]+=(Math.random()-0.5)*dt*3.5;INS_W[j+2]+=(Math.random()-0.5)*dt*3.5;
    _iv.set(INS_W[j],INS_W[j+1],INS_W[j+2]).applyMatrix4(_im);
    if(_iv.z>-2||_iv.z<-26||Math.hypot(_iv.x,_iv.y+0.3)>-_iv.z*0.27){const z=-(6+Math.random()*18),r=Math.sqrt(Math.random())*0.25*-z,a=Math.random()*6.283;_iv.set(Math.cos(a)*r,Math.sin(a)*r-0.3,z).applyMatrix4(camera.matrixWorld);INS_W[j]=_iv.x;INS_W[j+1]=_iv.y;INS_W[j+2]=_iv.z;}
    INS.pos[j]=INS_W[j];INS.pos[j+1]=INS_W[j+1];INS.pos[j+2]=INS_W[j+2];INS.sz[i]=0.06;INS.al[i]=0.25+0.6*Math.abs(Math.sin(t*(7+INS_P[i])+INS_P[i]*9));INS.col.set([1,0.95,0.8],j);}
  INS.g.attributes.position.needsUpdate=true;INS.g.attributes.aAlpha.needsUpdate=true;INS.g.attributes.aSize.needsUpdate=true;INS.g.attributes.aCol.needsUpdate=true;
}
try{const q=new URLSearchParams(location.search);let a=({standard:0,herbst:1,winter:2})[q.get('jahreszeit')],b=({live:0,morgen:1,mittag:2,abend:3,daemmerung:4})[q.get('tageszeit')];
  if(a===undefined)a=+localStorage.getItem('miworu_sea')||0;if(b===undefined)b=+localStorage.getItem('miworu_tod')||0;
  if(a>0)seasonSet(a);if(b>0&&BK)todSet(b);}catch(e){}
function render(dt,now){
  updateRain(dt);drawDrops(dt);updateFx(dt,now);updateBeam(dt,now);
  sample(st.pos,smp);
  const rx=-Math.cos(smp.h),rz=Math.sin(smp.h);
  const bx=smp.x+rx*st.x,bz=smp.z+rz*st.x,by=smp.y+0.07+(running||st.done?tabH(st.pos):0);
  bike.position.set(bx,by,bz);
  const gi=Math.min(N-1,Math.floor(st.pos/SEG));
  st.pitch+=(-Math.atan(GR[gi]/100)-st.pitch)*Math.min(1,dt*5);
  bike.rotation.set(st.pitch,smp.h,st.lean);
  wheels[0].rotation.x=st.wheel;wheels[1].rotation.x=st.wheel;
  poseLegs(st.crank);
  const fp=running||st.done;
  bike.visible=!fp;
  cockpitEl.style.display=fp?'block':'none';if(!fp)FORK.style.display='none';document.body.classList.toggle('fpv',fp);
  if(fp){
    {const tg=clamp((-CKENV.gr-2)/5,0,1)*clamp(((running?st.v:0)-4)/4,0,1);STD+=(tg-STD)*(1-Math.exp(-dt*1.6));}
    const ey=by+1.3+STD*0.22,k=1-Math.exp(-dt*9);
    camera.position.set(bx+Math.sin(smp.h)*0.05+rx*Math.sin(st.crank)*0.011*Math.min(1,st.power/150),ey+Math.sin(st.wheel*0.9)*0.004*Math.min(1,st.v/4)+Math.abs(Math.sin(st.crank))*0.006*Math.min(1,st.power/150)-BRK*0.025+(running?(SHK.y+airH())*0.9+(SHK.buzz||0)*0.0055:0),bz+Math.cos(smp.h)*0.05);
    if(running&&SHK.buzz){camera.position.x+=rx*SHK.buzz*0.0022;camera.position.z+=rz*SHK.buzz*0.0022;}   // Rauschen des Untergrunds auch seitlich im Bild
    {const cx0=camera.position.x,cz0=camera.position.z,gm=Math.max(gnd(cx0,cz0),gnd(cx0-Math.sin(smp.h)*0.8,cz0-Math.cos(smp.h)*0.8),gnd(cx0+Math.sin(smp.h)*1.2,cz0+Math.cos(smp.h)*1.2));if(camera.position.y<gm+0.95)camera.position.y=gm+0.95;}   // Kamera nie unter oder in das Gelaende (Absatzkanten, Steilstuecke)
    sample(st.pos+9,smp2);
    lookT.set(smp2.x+rx*st.x*0.9,smp2.y+1.15,smp2.z+rz*st.x*0.9);
    {   // Blickrichtung als Winkel glaetten + Drehrate begrenzen: Spitzkehren schwenken weich wie ein Kopf, statt zu ruckeln
      const dx=lookT.x-camera.position.x,dz=lookT.z-camera.position.z,yT=Math.atan2(dx,dz),dist=Math.max(2,Math.hypot(dx,dz));
      if(!camInit){yawC=yT;lookC.copy(lookT);camInit=true;}
      else{let d=yT-yawC;d=Math.atan2(Math.sin(d),Math.cos(d));const mx=2.0*dt;d=clamp(d*(1-Math.exp(-dt*5)),-mx,mx);yawC+=d;
        lookC.x=camera.position.x+Math.sin(yawC)*dist;lookC.z=camera.position.z+Math.cos(yawC)*dist;lookC.y+=(lookT.y-lookC.y)*k;}
    }
    camera.fov+=((70+Math.min(12,st.v*0.9))-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();
    ctr.set(bx,by,bz);
  }else{
    const t=now*0.00006+0.6;
    camera.position.set(OR.cx+Math.cos(t)*OR.r,OR.h,OR.cz+Math.sin(t)*OR.r);lookC.set(OR.cx,OR.ly,OR.cz);
    camera.fov=50;camera.updateProjectionMatrix();camInit=false;
    ctr.set(OR.cx+Math.cos(t)*OR.cr,OR.ly+2,OR.cz+Math.sin(t)*OR.cr);
  }
  camera.lookAt(lookC);
  if(fp){
    camera.rotateZ(-st.lean*0.55+SHK.r*0.5+Math.sin(st.crank)*0.006*Math.min(1,st.power/150));             // Neigung in Kurven + Ruppeln
    camera.rotateX((running?Math.atan(tabD(st.pos))*0.7:0)-BRK*0.03+SHK.y*0.9+(SHK.air?0.035*Math.cos(Math.PI*airU()):0));
    const deg=clamp(st.bar,-17,17);                     // Lenker dreht mit
    cockpitEl.style.transform='translate(-50%,'+(18.5+Math.abs(deg)*0.062-(SHK.y+airH()*0.6)*70-(SHK.buzz||0)*0.12).toFixed(2)+'%) rotate('+clamp(deg+SHK.r*25+SHK.w+Math.sin(st.crank)*0.7*Math.min(1,st.power/150),-22,22).toFixed(2)+'deg)';
    {   // Eindruck 'im Stehen, von oben aufs Rad schauen': Lenkerbild nach vorn gekippt, Blick etwas nach unten
      const K=CK_STAND;
      cockpitEl.style.transform+=' translateY('+(STD*5).toFixed(2)+'%) scaleY('+(K[0]*(1-0.12*STD)).toFixed(3)+')';
      {const fc=forkComp(Math.min(0.05,Math.max(0.001,(now-(CKENV.t||now))/1000)));CKENV.t=now;FORK.style.display='block';FORK.style.transform=cockpitEl.style.transform;cockpitEl.style.transform+=' translateY('+(fc*7).toFixed(2)+'%)';}
      cockpitEl.style.transformOrigin='50% '+K[4]+'%';CKW.style.transformOrigin='50% '+K[4]+'%';
      camera.rotateX(-(K[1]+STD*4)*Math.PI/180);
      updateCockFx(now,deg);}
  }
  sky.position.copy(camera.position);sky.material.uniforms.time.value=now*0.001;nightFrame();
  if(BK)applySun();
  if(BK&&BIRDS.length){const t=now*0.001;BIRDS.forEach(b=>{
    const a=b.ph+b.w*t,x=b.cx+Math.cos(a)*b.r,z=b.cz+Math.sin(a)*b.r,y=b.y0+b.alt+Math.sin(t*0.23+b.ph)*3.5;
    const sg=Math.sign(b.w);b.g.position.set(x,y,z);b.g.rotation.set(0,Math.atan2(-Math.sin(a)*sg,Math.cos(a)*sg),0.28*sg);
    const cyc=((t+b.t0)%9)/9,flap=cyc<0.45?Math.sin(t*b.fp*2)*0.75:Math.sin(t*0.9+b.ph)*0.08;   // Fluegelschlag, dann Gleitphase
    b.L.rotation.z=flap;b.R.rotation.z=-flap;});}
  {   // Sonnenglanz (Lens-Glow) nur wenn man Richtung Sonne schaut
    camera.getWorldDirection(_cd);const fc=_cd.dot(SUN);
    if(fc>0.55&&!WX){_sv.copy(camera.position).addScaledVector(SUN,1000).project(camera);
      const o=clamp((fc-0.55)/0.4,0,1);glowEl.style.opacity=(o*0.85).toFixed(3);
      glowEl.style.background='radial-gradient(circle at '+((_sv.x*0.5+0.5)*100).toFixed(1)+'% '+((-_sv.y*0.5+0.5)*100).toFixed(1)+'%, rgba(255,226,170,.75) 0, rgba(255,190,110,.28) 9%, rgba(255,170,90,.10) 24%, transparent 48%)';
    }else glowEl.style.opacity=0;
  }
  const sc=running||st.done?1:3.2;
  sun.shadow.camera.left=-90*sc;sun.shadow.camera.right=90*sc;sun.shadow.camera.top=90*sc;sun.shadow.camera.bottom=-90*sc;sun.shadow.camera.far=520*sc;sun.shadow.camera.updateProjectionMatrix();
  sun.position.copy(ctr).addScaledVector(SUN,220*sc);sun.target.position.copy(ctr);sun.target.updateMatrixWorld();
  if((tileN++%6)===0)updateTiles(camera.position);
  renderer.shadowMap.needsUpdate=!(running&&!st.done)||((shN++)&1)===0;
  if(FXon&&composer){FXP.uniforms.exposure.value=renderer.toneMappingExposure;composer.render();}else renderer.render(scene,camera);
  if(running||st.done)drawHud();
}
let tileN=0;
function updateTiles(cp){   // weit entfernte Kacheln nicht zeichnen, Schatten nur im Nahbereich (Schattenkarte deckt nur +-90 m ab)
  const far=TREE_FAR[QE()],far2=(far+130)*(far+130),sh2=(running||st.done?170:520)*(running||st.done?170:520);
  for(let i=0;i<TILES.length;i++){const T=TILES[i],dx=T.x-cp.x,dz=T.z-cp.z,d2=dx*dx+dz*dz;T.m.visible=d2<far2;if(T.sh)T.m.castShadow=d2<sh2;}
}
{   // Kleinobjekte aus OpenStreetMap: Zaeune, Mauern, Hecken, Leitplanken, Laternen, Baenke, Wegweiser, Masten, Stromleitungen
  if(OBJ_RAW&&ROUTE&&!CUS){
    const O=OBJ_RAW,P=[],Cc=[],Nn=[];
    const ca=new THREE.Color(),lp=[];
    // Quader (Mitte, Groesse, Drehung um Y, Farbe) in einen gemeinsamen Puffer
    const box=(cx,cy,cz,sx,sy,sz,ry,hex,sh)=>{
      ca.setHex(hex);const c=Math.cos(ry),s=Math.sin(ry),r=ca.r*(sh||1),g=ca.g*(sh||1),b=ca.b*(sh||1);
      const F=[[[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],[[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],[[0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]],[[0,0,1],[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]],[[0,0,-1],[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]]];
      F.forEach(f=>{const nx=f[0][0]*c+f[0][2]*s,nz=-f[0][0]*s+f[0][2]*c;
        [0,1,2,0,2,3].forEach(i=>{const v=f[1][i],lx=v[0]*sx,lz=v[2]*sz;P.push(cx+lx*c+lz*s,cy+v[1]*sy,cz-lx*s+lz*c);Nn.push(nx,f[0][1],nz);Cc.push(r,g,b);});});
    };
    const G=(x,z)=>gnd(x,z);
    const post=(x,z,h,w,hex)=>box(x,G(x,z)+h/2,z,w,h,w,0,hex);
    const beam=(x0,y0,z0,x1,y1,z1,w,hex)=>{   // beliebig geneigter Vierkantstab (Gittermast-Streben)
      let ax=x1-x0,ay=y1-y0,az=z1-z0;const L=Math.hypot(ax,ay,az)||1;ax/=L;ay/=L;az/=L;
      let ux=ay*0-az*1,uy=az*0-ax*0,uz=ax*1-ay*0;   // a x (0,1,0)
      let ul=Math.hypot(ux,uy,uz);if(ul<0.05){ux=1;uy=0;uz=0;ul=1;}ux/=ul;uy/=ul;uz/=ul;
      const vx=ay*uz-az*uy,vy=az*ux-ax*uz,vz=ax*uy-ay*ux,h=w/2;ca.setHex(hex);
      const C=[];for(let e=0;e<8;e++){const su=(e&1)?h:-h,sv=(e&2)?h:-h,t=(e&4)?1:0;C.push([(t?x1:x0)+ux*su+vx*sv,(t?y1:y0)+uy*su+vy*sv,(t?z1:z0)+uz*su+vz*sv]);}
      [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]].forEach(f=>{const A=C[f[0]],B=C[f[1]],D=C[f[2]];const e1=[B[0]-A[0],B[1]-A[1],B[2]-A[2]],e2=[D[0]-A[0],D[1]-A[1],D[2]-A[2]];let nx=e1[1]*e2[2]-e1[2]*e2[1],ny=e1[2]*e2[0]-e1[0]*e2[2],nz=e1[0]*e2[1]-e1[1]*e2[0];const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
        [0,1,2,0,2,3].forEach(i=>{const q=C[f[i]];P.push(q[0],q[1],q[2]);Nn.push(nx,ny,nz);Cc.push(ca.r,ca.g,ca.b);});});
    };
    // Hochspannungsmasten: Richtung der Leitung bestimmen (Traversen quer dazu), Seile spaeter an den Traversen befestigen
    const PYH=40,PYL=O.nodes.filter(n=>n[0]==='pylon').map(n=>({x:n[1],z:n[2],a:null}));
    const pyAt=(x,z)=>{for(let i=0;i<PYL.length;i++)if(Math.hypot(PYL[i].x-x,PYL[i].z-z)<9)return PYL[i];return null;};
    O.lines.forEach(L=>{if(L[0]!=='line')return;const q=L[1];for(let i=0;i+3<q.length;i+=2){const a=pyAt(q[i],q[i+1]),b=pyAt(q[i+2],q[i+3]);if(a||b){const ang=Math.atan2(q[i+2]-q[i],q[i+3]-q[i+1]);if(a&&a.a===null)a.a=ang;if(b&&b.a===null)b.a=ang;}}});
    O.nodes.forEach(n=>{const k=n[0],x=n[1],z=n[2],y=G(x,z),hh=n[3]||0,rot=rnd()*6.283;
      if(nearest(allHash,x,z)&&nD<(HW[nI]||2)+0.9)return;   // nichts im Fahrbereich
      if(k==='lamp'){post(x,z,5.2,0.14,0x4a4d52);box(x+0.45,y+5.2,z,1.0,0.12,0.2,rot,0x4a4d52);box(x+0.9,y+5.1,z,0.5,0.12,0.3,rot,0xfff2c0,1.4);}
      else if(k==='bench'){box(x,y+0.45,z,1.7,0.07,0.5,rot,0x8a6a45);box(x-0.2*Math.sin(rot),y+0.8,z-0.2*Math.cos(rot),1.7,0.45,0.06,rot,0x8a6a45);post(x+0.7*Math.cos(rot),z-0.7*Math.sin(rot),0.45,0.1,0x3a3a3a);post(x-0.7*Math.cos(rot),z+0.7*Math.sin(rot),0.45,0.1,0x3a3a3a);}
      else if(k==='table'){box(x,y+0.76,z,2.0,0.06,0.8,rot,0x8a6a45);box(x,y+0.45,z+0.0,2.0,0.06,1.7,rot,0x8a6a45,0.9);post(x,z,0.7,0.12,0x5a4a35);}
      else if(k==='sign'){post(x,z,2.1,0.12,0x6a4a2e);box(x,y+1.9,z,0.9,0.5,0.06,rot,0xe8e2c8);}
      else if(k==='pole'){post(x,z,9.5,0.28,0x5b4636);box(x,y+9.2,z,2.2,0.12,0.12,rot,0x5b4636);}
      else if(k==='pylon'){const h=PYH,py=pyAt(x,z),ang=py&&py.a!==null?py.a:rot,cs=Math.cos(ang),sn=Math.sin(ang),col=0x8d949b;
        const at=(lx,lz,yy)=>[x+lx*cs+lz*sn,y+yy,z-lx*sn+lz*cs];   // lokal: lx quer zur Leitung, lz laengs
        const yW=h*0.58,yA1=h*0.62,yA2=h*0.78,yT=h*0.93,bw=3.4,ww=0.95;   // Fuss-, Taillen- und Kopfmasse
        [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(c=>{const f=at(c[0]*bw,c[1]*bw,0),w=at(c[0]*ww,c[1]*ww,yW),t=at(c[0]*ww*0.8,c[1]*ww*0.8,yT);beam(f[0],f[1],f[2],w[0],w[1],w[2],0.34,col);beam(w[0],w[1],w[2],t[0],t[1],t[2],0.3,col);});
        for(let k2=1;k2<=5;k2++){const t=k2/6,y0=yW*t,y1=yW*(t+1/6>1?1:t+1/6),wa=bw+(ww-bw)*t,wb=bw+(ww-bw)*Math.min(1,t+1/6);   // Querstreben + Diagonalen am Unterbau
          const sd=[[[-1,-1],[1,-1]],[[1,-1],[1,1]],[[1,1],[-1,1]],[[-1,1],[-1,-1]]];
          sd.forEach(e=>{const p0=at(e[0][0]*wa,e[0][1]*wa,y0),p1=at(e[1][0]*wa,e[1][1]*wa,y0);beam(p0[0],p0[1],p0[2],p1[0],p1[1],p1[2],0.13,col);
            const p2=at(e[1][0]*wb,e[1][1]*wb,y1);beam(p0[0],p0[1],p0[2],p2[0],p2[1],p2[2],0.1,col);});}
        const spl=(yy,half,ln)=>{const l=at(-half,0,yy),r=at(half,0,yy);beam(l[0],l[1],l[2],r[0],r[1],r[2],0.32,col);   // Traverse
          [-half,half].forEach(e=>{const tip=at(e,0,yy),up=at(e*0.5,0,yy+1.3),dn=at(e*0.97,0,yy-ln);beam(tip[0],tip[1],tip[2],up[0],up[1],up[2],0.12,col);beam(tip[0],tip[1],tip[2],dn[0],dn[1],dn[2],0.17,0xd7d2c6);});};   // Isolatorkette haengt herunter
        spl(yA1,6.6,1.9);spl(yA2,5.0,1.6);spl(yT,3.0,1.4);
        const tp=at(0,0,yT),pk=at(0,0,h);beam(tp[0],tp[1],tp[2],pk[0],pk[1],pk[2],0.3,col);}
      else if(k==='mast'){post(x,z,hh||24,0.5,0xb9bcc0);}
      else if(k==='chimney'){post(x,z,hh||30,2.6,0xb7a99a);}
      else if(k==='bollard'){post(x,z,0.9,0.18,0xd8d8d0);}
      else if(k==='gate'){post(x,z,1.2,0.14,0x6b6b6b);}
      else if(k==='shelter'){box(x,y+2.2,z,3.4,0.15,2.4,rot,0x6a4a2e);[[-1.5,-1],[1.5,-1],[-1.5,1],[1.5,1]].forEach(a=>post(x+a[0]*Math.cos(rot)+a[1]*Math.sin(rot),z-a[0]*Math.sin(rot)+a[1]*Math.cos(rot),2.2,0.14,0x6a4a2e));}
      else if(k==='bin'){post(x,z,0.9,0.4,0x3d5a45);}
    });
    const hedge=[],RP=[],RC=[],MP=[],MC=[],roadSegs=[],parkSegs=[];
    O.lines.forEach(L=>{const k=L[0],q=L[1];
      if(k==='road'){roadSegs.push(L);return;}
      if(k==='park'){parkSegs.push(L);return;}
      for(let i=0;i+3<q.length;i+=2){
        const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<0.3||len>400)continue;
        const ry=Math.atan2(dx,dz)-Math.PI/2;
        if(k==='line'){lp.push([ax,az,bx,bz,!!(pyAt(ax,az)&&pyAt(bx,bz))]);continue;}
        const stp=k==='hedge'?1.2:k==='wall'?2.5:3;
        const n=Math.max(1,Math.round(len/stp));
        for(let j=0;j<n;j++){
          const t0=j/n,t1=(j+1)/n,x0=ax+dx*t0,z0=az+dz*t0,x1=ax+dx*t1,z1=az+dz*t1,xm=(x0+x1)/2,zm=(z0+z1)/2,yg=Math.max(G(x0,z0),G(x1,z1)),sl=len/n+0.05;
          if(nearest(allHash,xm,zm)&&nD<(HW[nI]||2)+0.8)continue;
          if(k==='fence'){post(x0,z0,1.15,0.09,0x6b563c);box(xm,G(xm,zm)+0.95,zm,sl,0.07,0.03,ry,0x8a7350);box(xm,G(xm,zm)+0.6,zm,sl,0.07,0.03,ry,0x8a7350);}
          else if(k==='rail'){post(x0,z0,0.75,0.1,0x8b9097);box(xm,G(xm,zm)+0.62,zm,sl,0.28,0.05,ry,0xb9bcc0);}
          else if(k==='wall'){box(xm,yg-0.25+0.55,zm,sl,1.1,0.4,ry,0x8a8379,0.9+rnd()*0.2);}
          else if(k==='hedge'){hedge.push([xm,G(xm,zm),zm,sl,ry]);}
        }
      }
    });
    // Strassen (ohne die Strecke selbst): Asphaltband mit Mittellinie, Randlinien und Bordsteinen, auf das Gelaende gelegt
    roadSegs.forEach(L=>{   // Kreisverkehre: geschlossene, runde Strassenringe als Fahrbahnring mit Mittelinsel (Rasen) und Bordstein
      const q=L[1],ex=L[2]||{},n=q.length/2;if(n<8||ex.u||ex.br||Math.hypot(q[0]-q[q.length-2],q[1]-q[q.length-1])>1.5)return;
      let cx=0,cz=0;for(let i=0;i<q.length;i+=2){cx+=q[i];cz+=q[i+1];}cx/=n;cz/=n;
      const rr=[];for(let i=0;i<q.length;i+=2)rr.push(Math.hypot(q[i]-cx,q[i+1]-cz));const R=rr.reduce((a,b)=>a+b,0)/n;
      if(R<5||R>35||Math.max(...rr)>R*1.3||Math.min(...rr)<R*0.7)return;
      const w=Math.max(ex.w||6,6),ri=R-w/2,ro=R+w/2,M=28,lift=0.13;
      const ring=(r0,r1,y,col,P_,C_)=>{for(let m=0;m<M;m++){const a0=m/M*6.2832,a1=(m+1)/M*6.2832;
        const p=(r,a)=>[cx+Math.cos(a)*r,cz+Math.sin(a)*r],A=p(r0,a0),B=p(r1,a0),C=p(r0,a1),D=p(r1,a1);
        [[A],[B],[C],[B],[D],[C]].forEach(v=>{P_.push(v[0][0],G(v[0][0],v[0][1])+y,v[0][1]);C_.push(col[0]*(0.95+0.1*fbm(v[0][0]/3,v[0][1]/3)),col[1],col[2]);});}};
      ring(ri,ro,lift,[0.4,0.4,0.4],RP,RC);
      ring(0,ri-0.35,lift+0.12,[0.2,0.33,0.14],MP,MC);   // Mittelinsel mit Gras
      ring(ri-0.35,ri,lift+0.14,[0.6,0.6,0.58],MP,MC);   // Bordstein
      ring(ro,ro+0.3,lift+0.02,[0.55,0.55,0.53],MP,MC);  // aeusserer Randstein
      if(window.__counts)window.__counts.rb=(window.__counts.rb||0)+1;
    });
    const hrAt=i=>HW[i]*(SURF[i]===0?1:SURF[i]===1?1.5:1.7);
    const flat=(x0,z0,x1,z1,ww,col,y0,y1)=>{const ddx=x1-x0,ddz=z1-z0,ll=Math.hypot(ddx,ddz)||1,nn=[-ddz/ll*ww/2,ddx/ll*ww/2];
      [[x0+nn[0],y0,z0+nn[1]],[x0-nn[0],y0,z0-nn[1]],[x1+nn[0],y1,z1+nn[1]],[x0-nn[0],y0,z0-nn[1]],[x1-nn[0],y1,z1-nn[1]],[x1+nn[0],y1,z1+nn[1]]].forEach(v=>{MP.push(v[0],v[1],v[2]);MC.push(col[0],col[1],col[2]);});};
    roadSegs.forEach(L=>{
      const q=L[1],ex=L[2]||{},w=ex.w||5,hw=ex.h,paved=!ex.u&&hw!=='service'||(hw==='service'&&!ex.u);
      if(ex.u||ex.br)return;
      const pts=[];for(let i=0;i+3<q.length;i+=2){const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],l=Math.hypot(bx-ax,bz-az),n=Math.max(1,Math.ceil(l/2));for(let t=(i?1:0);t<=n;t++)pts.push([ax+(bx-ax)*t/n,az+(bz-az)*t/n]);}
      const mid=(hw==='primary'||hw==='secondary'||hw==='tertiary'||hw==='trunk'||(hw==='unclassified'&&w>=5.4)),edge=(hw==='primary'||hw==='secondary'||hw==='trunk'),kerb=(hw==='residential'||hw==='living_street'||hw==='tertiary'||hw==='unclassified');
      const hrAt=i=>HW[i]*(SURF[i]===0?1:SURF[i]===1?1.5:1.7);
      const nearI=p=>{const f=nearest(allHash,p[0],p[1]);return f?{d:nD,i:nI}:null;};
      let dist=0;
      for(let i=0;i+1<pts.length;i++){
        const a=pts[i],b=pts[i+1],A=nearI(a),B=nearI(b);
        if(strIn&&/^(unclassified|service|track|path)$/.test(hw||'')){   // Nebenstrassen/Zufahrten nur dort zeichnen, wo es amtlich eine Strassenflaeche gibt, wo es amtlich auch eine Strassenflaeche gibt: keine schwebenden Fragmente im Gelaende
          const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2,ex2=b[0]-a[0],ez2=b[1]-a[1],el=Math.hypot(ex2,ez2)||1,ox=-ez2/el*w*0.4,oz=ex2/el*w*0.4;
          if(!(strIn(mx,mz)||strIn(a[0],a[1])||strIn(b[0],b[1])||strIn(mx+ox,mz+oz)||strIn(mx-ox,mz-oz)))continue;}
        {   // parallel zur Strecke (dieselbe Strasse): auslassen; querende Strasse: bis an den Rand der Strecke durchziehen
          const sx=b[0]-a[0],sz=b[1]-a[1],sl=Math.hypot(sx,sz)||1,ni=A?A.i:(B?B.i:-1),par=ni>=0?Math.abs(sx*Math.sin(HS[ni])+sz*Math.cos(HS[ni]))/sl>0.8:false;
          if(par){if((A&&A.d<hrAt(A.i)+w/2+2.5)||(B&&B.d<hrAt(B.i)+w/2+2.5))continue;}
          else if((A&&A.d<hrAt(A.i)+0.15)||(B&&B.d<hrAt(B.i)+0.15))continue;}
        const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
        const ya=G(a[0],a[1]),yb=G(b[0],b[1]),lift=0.13;
        const cA=[a[0]+nx*w/2,a[1]+nz*w/2],dA=[a[0]-nx*w/2,a[1]-nz*w/2],cB=[b[0]+nx*w/2,b[1]+nz*w/2],dB=[b[0]-nx*w/2,b[1]-nz*w/2];
        const hA1=G(cA[0],cA[1])+lift,hA2=G(dA[0],dA[1])+lift,hB1=G(cB[0],cB[1])+lift,hB2=G(dB[0],dB[1])+lift;
        const sh=0.9+0.12*fbm(a[0]/4,a[1]/4),pth=(hw==='footway'||hw==='cycleway'||hw==='pedestrian'),cb=pth?0.5:0.4;   // Wege heller als Fahrbahnen
        {const lat=(P_,Q_,t)=>[P_[0]+(Q_[0]-P_[0])*t,P_[1]+(Q_[1]-P_[1])*t];
          const sa=[cA,lat(cA,dA,1/3),lat(cA,dA,2/3),dA],sb=[cB,lat(cB,dB,1/3),lat(cB,dB,2/3),dB],hh=(c)=>G(c[0],c[1])+lift;
          for(let m=0;m<3;m++){const a1=sa[m],a2=sa[m+1],b1=sb[m],b2=sb[m+1];
            [[a1],[a2],[b1],[a2],[b2],[b1]].forEach(v=>{RP.push(v[0][0],hh(v[0]),v[0][1]);RC.push(cb*sh,cb*sh,cb*sh*1.01);});}}
        const flat=(x0,z0,x1,z1,ww,col,y0,y1)=>{const ddx=x1-x0,ddz=z1-z0,ll=Math.hypot(ddx,ddz)||1,nn=[-ddz/ll*ww/2,ddx/ll*ww/2];
          [[x0+nn[0],y0,z0+nn[1]],[x0-nn[0],y0,z0-nn[1]],[x1+nn[0],y1,z1+nn[1]],[x0-nn[0],y0,z0-nn[1]],[x1-nn[0],y1,z1-nn[1]],[x1+nn[0],y1,z1+nn[1]]].forEach(v=>{MP.push(v[0],v[1],v[2]);MC.push(col[0],col[1],col[2]);});};
        if(mid&&((dist/6)|0)%2===0)flat(a[0],a[1],b[0],b[1],0.14,[0.85,0.85,0.8],ya+0.16,yb+0.16);
        if(edge){const o=w/2-0.35;flat(a[0]+nx*o,a[1]+nz*o,b[0]+nx*o,b[1]+nz*o,0.12,[0.8,0.8,0.76],G(a[0]+nx*o,a[1]+nz*o)+0.16,G(b[0]+nx*o,b[1]+nz*o)+0.16);flat(a[0]-nx*o,a[1]-nz*o,b[0]-nx*o,b[1]-nz*o,0.12,[0.8,0.8,0.76],G(a[0]-nx*o,a[1]-nz*o)+0.16,G(b[0]-nx*o,b[1]-nz*o)+0.16);}
        if(kerb&&i%1===0){const ang=Math.atan2(dx,dz)-Math.PI/2,ca=[a[0]+nx*(w/2+0.12),a[1]+nz*(w/2+0.12)],cb=[a[0]-nx*(w/2+0.12),a[1]-nz*(w/2+0.12)];
          box((ca[0]+b[0]+nx*(w/2+0.12))/2,Math.max(hA1,hB1)-0.02,(ca[1]+b[1]+nz*(w/2+0.12))/2,l+0.05,0.2,0.25,ang,0x9b9b96);
          box((cb[0]+b[0]-nx*(w/2+0.12))/2,Math.max(hA2,hB2)-0.02,(cb[1]+b[1]-nz*(w/2+0.12))/2,l+0.05,0.2,0.25,ang,0x9b9b96);}
        if(ex.sw&&!pth){   // Buergersteige (OSM sidewalk=*): hellgraue, leicht erhoehte Streifen mit Randstein
          [[1,nx,nz],[2,-nx,-nz]].forEach(([bit,sx,sz])=>{if(!(ex.sw&bit))return;const off=w/2+0.1+0.85,c0=[a[0]+sx*off,a[1]+sz*off],c1=[b[0]+sx*off,b[1]+sz*off];
            flat(c0[0],c0[1],c1[0],c1[1],1.7,[0.34,0.34,0.33],G(c0[0],c0[1])+0.2,G(c1[0],c1[1])+0.2);
            const ko=w/2+0.04;flat(a[0]+sx*ko,a[1]+sz*ko,b[0]+sx*ko,b[1]+sz*ko,0.16,[0.55,0.55,0.53],G(a[0]+sx*ko,a[1]+sz*ko)+0.21,G(b[0]+sx*ko,b[1]+sz*ko)+0.21);});}
        dist+=l;
      }
    });
    {   // Kreuzungen: Fahrbahnflaeche, wo mindestens drei Strassenenden/-knoten zusammentreffen (statt flacher Luecken zwischen den Baendern)
      const J=new Map();
      roadSegs.forEach((L,wi)=>{const e=L[2]||{};if(e.u||e.br||/^(footway|cycleway|path|track|pedestrian)$/.test(e.h||''))return;const q=L[1];
        for(let i=0;i<q.length;i+=2){const kx=Math.round(q[i]/0.8),kz=Math.round(q[i+1]/0.8),k=kx*100003+kz;let o=J.get(k);if(!o)J.set(k,o={x:q[i],z:q[i+1],ws:new Set(),w:0,end:0,n:q.length/2,rb:e.rb});
          o.ws.add(wi);o.w=Math.max(o.w,e.w||5);if(i===0||i===q.length-2)o.end++;}});
      J.forEach(o=>{if(o.ws.size<3&&!(o.ws.size===2&&o.end>=2&&false))return;
        if(strIn&&!strIn(o.x,o.z)&&o.w<=4.5)return;
        const f=nearest(allHash,o.x,o.z),nd=f?nD:99;if(f&&nd<hrAt(nI)*0.9)return;   // nicht auf der Strecke selbst
        const r=o.w/2*1.12+0.2,M2=22,y=G(o.x,o.z)+0.125;
        for(let m=0;m<M2;m++){const a0=m/M2*6.2832,a1=(m+1)/M2*6.2832;[[o.x,o.z,y],[o.x+Math.cos(a0)*r,o.z+Math.sin(a0)*r,G(o.x+Math.cos(a0)*r,o.z+Math.sin(a0)*r)+0.125],[o.x+Math.cos(a1)*r,o.z+Math.sin(a1)*r,G(o.x+Math.cos(a1)*r,o.z+Math.sin(a1)*r)+0.125]].forEach(v=>{RP.push(v[0],v[2],v[1]);RC.push(0.11,0.115,0.12);});}});
    }
    {   // Ampeln, Fussgaengeruebergaenge (Zebrastreifen) und Bushaltestellen: an der naechsten echten Strasse ausgerichtet
      const roadNear=(x,z,maxd)=>{let best=null,bd=maxd;
        roadSegs.forEach(L=>{const e=L[2]||{};if(e.u||e.br||/^(footway|cycleway|path|track|pedestrian|service)$/.test(e.h||''))return;const q=L[1];
          for(let i=0;i+3<q.length;i+=2){const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=clamp(((x-ax)*dx+(z-az)*dz)/l2,0,1),px=ax+dx*t,pz=az+dz*t,d=Math.hypot(x-px,z-pz);
            if(d<bd){bd=d;const l=Math.sqrt(l2);best={d:d,px:px,pz:pz,ux:dx/l,uz:dz/l,w:e.w||6,h:e.h};}}});
        return best;};
      O.nodes.forEach(n=>{const k=n[0];if(k!=='signal'&&k!=='xing'&&k!=='busstop')return;const r=roadNear(n[1],n[2],k==='xing'?4:14);if(!r)return;
        if(nearest(allHash,r.px,r.pz)&&nD<(HW[nI]||2)+0.9)return;   // nicht auf der Strecke selbst
        const nx=-r.uz,nz=r.ux,y=G(r.px,r.pz);
        if(k==='xing'){if(n[3]!==1&&!/^(primary|secondary|tertiary|trunk|unclassified)$/.test(r.h||''))return;
          const w=r.w,ang=Math.atan2(r.ux,r.uz)-Math.PI/2;
          for(let o=-w/2+0.5;o<=w/2-0.45;o+=1.0){const cx=r.px+nx*o,cz=r.pz+nz*o;flat(cx-r.ux*1.6,cz-r.uz*1.6,cx+r.ux*1.6,cz+r.uz*1.6,0.5,[0.9,0.9,0.86],G(cx-r.ux*1.6,cz-r.uz*1.6)+0.17,G(cx+r.ux*1.6,cz+r.uz*1.6)+0.17);}
          // Haltelinien vor dem Uebergang
          [-1,1].forEach(sg=>{const ox=r.px+r.ux*sg*3.2,oz=r.pz+r.uz*sg*3.2;flat(ox-nx*(w/2-0.2),oz-nz*(w/2-0.2),ox+nx*(w/2-0.2),oz+nz*(w/2-0.2),0.35,[0.88,0.88,0.84],G(ox,oz)+0.17,G(ox,oz)+0.17);});
          return;}
        const side=(((n[1]*7.3+n[2]*3.1)|0)%2)?1:-1,ox=r.px+nx*side*(r.w/2+0.9),oz=r.pz+nz*side*(r.w/2+0.9),oy=G(ox,oz),face=Math.atan2(-nx*side,-nz*side);
        if(k==='signal'){   // Ampelmast mit dreifeldigem Signalgeber (rot/gelb/gruen), Blickrichtung zur Fahrbahn
          box(ox,oy+1.75,oz,0.14,3.5,0.14,0,0x3b3d40);box(ox-nx*side*0.3,oy+3.2,oz-nz*side*0.3,0.34,1.05,0.28,face,0x232527);
          [[2.95,0xd23a2e],[3.2,0xe0b030],[3.45,0x3aa84a]].forEach(c=>box(ox-nx*side*0.46,oy+c[0],oz-nz*side*0.46,0.2,0.2,0.04,face,c[1]));}
        else{box(ox,oy+1.4,oz,0.07,2.8,0.07,0,0x5a5d60);box(ox,oy+2.7,oz,0.55,0.55,0.05,face,0xf2c500);box(ox,oy+2.7,oz,0.12,0.3,0.06,face,0x1b5e2a);}   // Haltestellenschild (gelb, grosses H)
      });
    }
    parkSegs.forEach(L=>{   // Parkplaetze (OSM amenity=parking): Flaeche aus Asphalt/Schotter, Randstein und Stellplatzlinien
      const q=L[1],ex=L[2]||{},n=q.length/2;if(n<4)return;
      let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,area=0;for(let i=0;i<n;i++){x0=Math.min(x0,q[i*2]);x1=Math.max(x1,q[i*2]);z0=Math.min(z0,q[i*2+1]);z1=Math.max(z1,q[i*2+1]);const j=(i+1)%n;area+=q[i*2]*q[j*2+1]-q[j*2]*q[i*2+1];}
      area=Math.abs(area)/2;if(area<40||x1-x0>250||z1-z0>250)return;
      const inP=(x,z)=>{let c=false;for(let u=0,w=n-1;u<n;w=u++){if((q[u*2+1]>z)!==(q[w*2+1]>z)&&x<(q[w*2]-q[u*2])*(z-q[u*2+1])/(q[w*2+1]-q[u*2+1])+q[u*2])c=!c;}return c;};
      const col=ex.u?[0.3,0.27,0.22]:[0.12,0.125,0.13],cs=1.6,lift=0.1;
      for(let x=x0;x<x1;x+=cs)for(let z=z0;z<z1;z+=cs){if(!inP(x+cs/2,z+cs/2))continue;
        const sh=0.92+0.1*fbm(x/5,z/5),P4=[[x,z],[x+cs,z],[x,z+cs],[x+cs,z],[x+cs,z+cs],[x,z+cs]];
        P4.forEach(v=>{RP.push(v[0],G(v[0],v[1])+lift,v[1]);RC.push(col[0]*sh,col[1]*sh,col[2]*sh);});}
      // Randstein entlang der Kante
      for(let i=0;i<n;i++){const j=(i+1)%n;flat(q[i*2],q[i*2+1],q[j*2],q[j*2+1],0.22,[0.5,0.5,0.48],G(q[i*2],q[i*2+1])+lift+0.04,G(q[j*2],q[j*2+1])+lift+0.04);}
      if(!ex.u&&area>150){   // Stellplatzlinien: ausgerichtet an der laengsten Kante, Reihen 5 m tief, 6 m Fahrgasse
        let bl=0,ang=0;for(let i=0;i<n;i++){const j=(i+1)%n,dx=q[j*2]-q[i*2],dz=q[j*2+1]-q[i*2+1],l=Math.hypot(dx,dz);if(l>bl){bl=l;ang=Math.atan2(dz,dx);}}
        const ux=Math.cos(ang),uz=Math.sin(ang),vx=-uz,vz=ux,cx=(x0+x1)/2,cz=(z0+z1)/2,R=Math.hypot(x1-x0,z1-z0)/2+2;
        for(let rv=-R;rv<R;rv+=16){   // eine Doppelreihe je 16 m: 5 m Stellplaetze | 6 m Fahrgasse | 5 m Stellplaetze
          for(const [v0,dir] of [[rv,1],[rv+16-0,-1]]){const vv0=v0;
            for(let uu=-R;uu<R;uu+=2.5){const ax=cx+ux*uu+vx*vv0,az=cz+uz*uu+vz*vv0,bx=ax+vx*5*dir,bz=az+vz*5*dir;
              if(!(inP(ax,az)&&inP(bx,bz)&&inP((ax+bx)/2,(az+bz)/2)))continue;
              flat(ax,az,bx,bz,0.1,[0.8,0.8,0.78],G(ax,az)+lift+0.05,G(bx,bz)+lift+0.05);}}}
      }
    });
    const mkRibbon=(arr,carr,off,tex)=>{if(!arr.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));
      if(tex){const uv=new Float32Array(arr.length/3*2);for(let i=0;i<arr.length/3;i++){uv[i*2]=arr[i*3]*0.16;uv[i*2+1]=arr[i*3+2]*0.16;}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));}g.setAttribute('color',new THREE.Float32BufferAttribute(carr,3));g.computeVertexNormals();g.computeBoundingSphere();
      const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,map:tex||null,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:off,polygonOffsetUnits:off}));m.receiveShadow=true;scene.add(m);};
    const texRoad=canvasTex(256,256,(g,w,h)=>{g.fillStyle='#8a8a8c';g.fillRect(0,0,w,h);speckle(g,w,h,14000,['#6c6c6e','#a0a0a2','#b2b2b4','#5e5e60','#939395'],1,2.6);},true);
    mkRibbon(RP,RC,-2,texRoad);mkRibbon(MP,MC,-4);
    if(window.__counts)window.__counts.objV=P.length/3;
    if(P.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Nn,3));g.setAttribute('color',new THREE.Float32BufferAttribute(Cc,3));
      g.computeBoundingSphere();const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));m.castShadow=false;m.receiveShadow=true;scene.add(m);}
    if(hedge.length){   // Hecken: dichte Gruenquader mit Blatttextur
      const hg=new THREE.BoxGeometry(1,1,1),hm=new THREE.MeshLambertMaterial({map:(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#35592a';g.fillRect(0,0,64,64);for(let i=0;i<260;i++){g.fillStyle='hsl('+(85+Math.random()*35)+','+(35+Math.random()*25)+'%,'+(14+Math.random()*24)+'%)';g.beginPath();g.arc(Math.random()*64,Math.random()*64,1+Math.random()*3,0,6.3);g.fill();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;return t;})(),color:0x9fb08a});
      const im=new THREE.InstancedMesh(hg,hm,hedge.length),D=new THREE.Object3D();
      hedge.forEach((h,i)=>{const hh=1.3+rnd()*0.7;D.position.set(h[0],h[1]+hh/2,h[2]);D.rotation.set(0,h[4],0);D.scale.set(h[3]+0.1,hh,0.9+rnd()*0.4);D.updateMatrix();im.setMatrixAt(i,D.matrix);});
      im.castShadow=false;im.frustumCulled=false;scene.add(im);}
    if(lp.length){   // Stromleitungen: durchhaengende Seile; Hochspannung an den Traversen der Masten, Niederspannung in 9 m Hoehe
      const pts=[];
      const cab=(ax,ay,az,bx,by,bz,sag)=>{let px=ax,py=ay,pz=az;for(let i=1;i<=6;i++){const t=i/6,x=ax+(bx-ax)*t,z=az+(bz-az)*t,y=ay+(by-ay)*t-Math.sin(t*Math.PI)*sag;pts.push(px,py,pz,x,y,z);px=x;py=y;pz=z;}};
      lp.forEach(l=>{
        if(!l[4]){const h0=9,sag=0.8;cab(l[0],G(l[0],l[1])+h0,l[1],l[2],G(l[2],l[3])+h0,l[3],sag);return;}
        const dx=l[2]-l[0],dz=l[3]-l[1],len=Math.hypot(dx,dz)||1,nx=-dz/len,nz=dx/len,gA=G(l[0],l[1]),gB=G(l[2],l[3]),sag=Math.min(12,len*0.025+1.5);
        [[6.6,PYH*0.62-1.9],[-6.6,PYH*0.62-1.9],[5.0,PYH*0.78-1.6],[-5.0,PYH*0.78-1.6],[3.0,PYH*0.93-1.4],[-3.0,PYH*0.93-1.4]].forEach(o=>{cab(l[0]+nx*o[0],gA+o[1],l[1]+nz*o[0],l[2]+nx*o[0],gB+o[1],l[3]+nz*o[0],sag);});
        cab(l[0],gA+PYH,l[1],l[2],gB+PYH,l[3],sag*0.8);   // Erdseil an der Mastspitze
      });
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));g.computeBoundingSphere();
      scene.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x2a2c2e})));}
  }
}
const BIRDS=[];
if(BK){   // Voegel: kreisen und gleiten um die Strecke, schlagen zwischendurch mit den Fluegeln
  const bm=new THREE.MeshBasicMaterial({color:0x1c1c1e,side:THREE.DoubleSide});
  const wg=new THREE.BufferGeometry();wg.setAttribute('position',new THREE.Float32BufferAttribute([0,0,-0.12,1,0,-0.2,1,0,0.2,0,0,-0.12,1,0,0.2,0,0,0.16],3));wg.computeVertexNormals();
  const bg=new THREE.BoxGeometry(0.14,0.12,0.5);
  const nB=Math.min(46,Math.floor(N/18));
  for(let k=0;k<nB;k++){
    const i=Math.floor((k+rnd()*0.8)/nB*(N-4))+2,r=40+rnd()*110,alt=22+rnd()*45,sp=7+rnd()*5,dir=rnd()<0.5?1:-1;
    const grp=new THREE.Group(),L=new THREE.Mesh(wg,bm),R=new THREE.Mesh(wg,bm),body=new THREE.Mesh(bg,bm);
    R.scale.x=-1;[L,R,body].forEach(m=>{m.frustumCulled=false;grp.add(m);});
    const sz=1.5+rnd()*0.8;grp.scale.set(sz,sz,sz);scene.add(grp);
    BIRDS.push({g:grp,L:L,R:R,cx:PX[i]+(rnd()-0.5)*80,cz:PZ[i]+(rnd()-0.5)*80,r:r,alt:alt,w:dir*sp/r,ph:rnd()*6.283,fp:6+rnd()*3,t0:rnd()*40,y0:0});
    BIRDS[k].y0=gnd(BIRDS[k].cx,BIRDS[k].cz);
  }
}
// Lars' Van: parkt am Strassenrand und faehrt vorbei - nur auf Asphalt im Bereich von Haeusern (feste Strecken)
var VANS=[],vanWait=14;
// Fremdmodelle (Sketchfab, siehe #credits): GLB-Dateien, Front +z, auf echte Groesse skaliert; Hersteller-Laden erst wenn geladen
const CARS={
  pv5:{hl:2.2,url:null,sc:[3.1,3.9,4.1],hw:0.98},            // Kia PV5, teenlin3, CC BY
  ae86:{hl:2.1,url:null,sc:[0.01,0.01,0.01],hw:0.85},       // Toyota AE86 Trueno
  gmc:{hl:4.2,url:null,sc:[0.9,0.9,0.9],hw:1.45},            // GMC Motorhome
  c10:{hl:2.4,url:null,sc:[0.01,0.01,0.01],hw:1.05},         // Chevrolet C10 1963
  jeep:{hl:2.45,url:null,sc:[0.97,0.97,0.97],hw:1.1},        // Jeep Wrangler Rubicon 4xe
  ranger:{hl:2.7,url:null,sc:[0.96,0.96,0.96],rot:Math.PI,hw:1.07},   // Ford Ranger Offroad (Front war -z)
  volvo740:{hl:2.4,url:null,sc:[1.73,1.73,1.73],rot:Math.PI,hw:1.05},   // Volvo 740 (Front war -z)
  amazon:{hl:2.2,url:null,sc:[4.45,4.45,4.45],hw:0.99},    // Volvo Amazon Kombi (stilisiert)
  santana:{hl:1.95,url:null,sc:[1,1,1],rot:-Math.PI/2,hw:0.99},      // Santana S3 (Front war +x)
  ram:{hl:3.0,url:null,sc:[0.92,0.92,0.92],hw:1.15},        // Ram 2500 Power Wagon (Front +z)
};
const shadowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,6,32,32,32);gr.addColorStop(0,'rgba(0,0,0,0.75)');gr.addColorStop(0.7,'rgba(0,0,0,0.35)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
if(false)Object.keys(CARS).forEach(k=>{const C=CARS[k];C.tpl=null;C.wait=[];
  new GLTFLoader().load(C.url,gl=>{const m=gl.scene;m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=true;const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(q=>{q.roughness=Math.max(q.roughness||0,0.38);q.metalness=Math.min(q.metalness||0,0.45);q.envMapIntensity=0.9;q.userData.keepEnv=true;if(q.map)q.map.anisotropy=8;if(q.normalMap)q.normalMap.anisotropy=4;});}});
    const b=new THREE.Box3().setFromObject(m),c=b.getCenter(new THREE.Vector3());m.position.set(-c.x,-b.min.y,-c.z);   // mittig auf den Boden stellen
    const r=new THREE.Group();r.add(m);r.rotation.y=C.rot||0;const w=new THREE.Group();w.add(r);w.scale.set(...C.sc);C.tpl=w;C.wait.forEach(g=>g.add(w.clone(true)));C.wait.length=0;},undefined,()=>{});});
const makeCar=k=>{const C=CARS[k],g=new THREE.Group();g.userData.wheels=[];g.userData.hw=C.hw;g.userData.hl=C.hl;
  const sh=new THREE.Mesh(new THREE.PlaneGeometry(C.hw*2.5,C.hl*2.3),new THREE.MeshBasicMaterial({map:shadowTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}));sh.rotation.x=-Math.PI/2;sh.position.y=0.05;sh.renderOrder=1;g.add(sh);   // weicher Kontaktschatten
  if(C.tpl)g.add(C.tpl.clone(true));else C.wait.push(g);return g;};
let carDeck=[];   // ausgewogen: alle Modelle gemischt, jedes kommt erst wieder, wenn alle einmal dran waren
const pickCar=rnd=>{if(!carDeck.length){carDeck=Object.keys(CARS);for(let k=carDeck.length-1;k>0;k--){const j=Math.floor(rnd()*(k+1));[carDeck[k],carDeck[j]]=[carDeck[j],carDeck[k]];}}return makeCar(carDeck.pop());};
var VANS=[],vanWait=14;
const nearHouse=(()=>{if(!BK||!OSM)return null;
  const H=new Map(),K=(x,z)=>Math.floor(x/30)*10000+Math.floor(z/30);
  OSM.buildings.forEach(b=>{const p=b.p;let cx=0,cz=0;for(let i=0;i<p.length;i+=2){cx+=p[i];cz+=p[i+1];}cx/=p.length/2;cz/=p.length/2;const k=K(cx,cz);(H.get(k)||H.set(k,[]).get(k)).push(cx,cz);});
  return (x,z,r,n)=>{let c=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const l=H.get(K(x+a*30,z+b*30));if(!l)continue;for(let i=0;i<l.length;i+=2)if(Math.hypot(l[i]-x,l[i+1]-z)<r)c++;}return c>=n;};})();
let GRND=null;const grc=new THREE.Raycaster();grc.ray.direction.set(0,-1,0);
// nur kleine Gelaendekacheln (<30000 Dreiecke): riesige Netze (Gebaeude, Grobgelaende) wuerden jeden Strahl sekundenlang ausbremsen
const groundY=(x,z)=>{   // Hoehe des tatsaechlich gezeichneten Bodens (Gelaende, Wege): Strahl von knapp ueber dem Boden nach unten
  const g0=gnd(x,z);
  if(!GRND)GRND=TERR;
  grc.far=6;grc.ray.origin.set(x,g0+2.5,z);const h=grc.intersectObjects(GRND,false);
  for(const k of h)if(Math.abs(k.point.y-g0)<2)return k.point.y;return g0;};
const vanPose=(v,x,z,h,fwd)=>{   // Auto aufs Gelaende setzen: Ebene durch 4 Radpunkte (Nick und Rollen), Hoehe so, dass kein Rad im Boden steckt
  const H=fwd>0?h:h+Math.PI,hl=(v.g.userData.hl||2.6)*0.75,hw=(v.g.userData.hw||1)*0.85,fx=Math.sin(H),fz=Math.cos(H),rx=Math.cos(H),rz=-Math.sin(H);   // Modell: Front +z, rechts +x
  const q=(a,b)=>groundY(x+fx*a+rx*b,z+fz*a+rz*b),fl=q(hl,-hw),fr=q(hl,hw),bl=q(-hl,-hw),br=q(-hl,hw),mean=(fl+fr+bl+br)/4;
  const pitch=((fl+fr)-(bl+br))/2/(2*hl),roll=((fr+br)-(fl+bl))/2/(2*hw);
  const dev=Math.max(fl-(mean+pitch*hl-roll*hw),fr-(mean+pitch*hl+roll*hw),bl-(mean-pitch*hl-roll*hw),br-(mean-pitch*hl+roll*hw),0);
  v.g.position.set(x,mean+dev*0.5-0.02,z);v.g.rotation.order='YXZ';v.g.rotation.y=H;v.g.rotation.x=-Math.atan(pitch);v.g.rotation.z=Math.atan(roll);
};
const vanFast=(v,x,z,h,fwd,dt)=>{   // fahrende Autos: guenstige Pose aus gnd() plus alle 0,3 s gemessener Versatz zum gezeichneten Boden
  const H=fwd>0?h:h+Math.PI,hl=(v.g.userData.hl||2.2)*0.75,fx=Math.sin(H),fz=Math.cos(H);
  v.pt=(v.pt||0)-dt;if(v.pt<=0||v.off===undefined){v.pt=0.3;v.off=groundY(x,z)-gnd(x,z);}
  const a=gnd(x+fx*hl,z+fz*hl),b=gnd(x-fx*hl,z-fz*hl),pitch=(a-b)/(2*hl);
  v.g.position.set(x,(a+b)/2+v.off-0.02,z);v.g.rotation.order='YXZ';v.g.rotation.y=H;v.g.rotation.x=-Math.atan(pitch);v.g.rotation.z=0;
};
const vanPos=(s,lat,o)=>{sample(s,o);return [o.x-Math.cos(o.h)*lat,o.z+Math.sin(o.h)*lat];};
const carInHouse=(()=>{   // Grundrisse (OSM und LOD2): kein Auto in oder unter einem Haus
  const polys=[];if(OSM)OSM.buildings.forEach(b=>polys.push(b.p));
  if(LOD2)LOD2.b.forEach(poly=>poly.forEach(f=>{if(f[0]==='g'){const q=f[1],a=[];for(let i=0;i<q.length/3;i++)a.push(q[i*3],q[i*3+2]);polys.push(a);}}));
  const G=new Map(),K=(x,z)=>Math.floor(x/25)*10000+Math.floor(z/25);
  polys.forEach(p=>{let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(let i=0;i<p.length;i+=2){x0=Math.min(x0,p[i]);x1=Math.max(x1,p[i]);z0=Math.min(z0,p[i+1]);z1=Math.max(z1,p[i+1]);}
    const o={p:p,x0:x0-1.5,x1:x1+1.5,z0:z0-1.5,z1:z1+1.5};for(let cx=Math.floor(o.x0/25);cx<=Math.floor(o.x1/25);cx++)for(let cz=Math.floor(o.z0/25);cz<=Math.floor(o.z1/25);cz++){const k=cx*10000+cz;(G.get(k)||G.set(k,[]).get(k)).push(o);}});
  return (x,z,m)=>{const l=G.get(K(x,z));if(!l)return false;
    for(const o of l){if(x<o.x0||x>o.x1||z<o.z0||z>o.z1)continue;const P=o.p;let c=false;
      for(let u=0,w=P.length-2;u<P.length;w=u,u+=2){if((P[u+1]>z)!==(P[w+1]>z)&&x<(P[w]-P[u])*(z-P[u+1])/(P[w+1]-P[u+1])+P[u])c=!c;}
      if(c)return true;
      for(let i=0;i<P.length;i+=2){const ax=P[i],az=P[i+1],bx=P[(i+2)%P.length],bz=P[(i+3)%P.length],dx=bx-ax,dz=bz-az,l2=dx*dx+dz*dz||1,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),ex=ax+dx*t-x,ez=az+dz*t-z;if(ex*ex+ez*ez<m*m)return true;}}
    return false;};})();
const carRoad=(()=>{   // nur echte Autostrassen aus OSM (keine Wirtschaftswege, Zufahrten, Radwege, Unbefestigtes): Asphalt allein heisst nicht Autostrasse
  if(!OBJ_RAW)return ()=>false;
  const OK=/^(trunk|primary|secondary|tertiary|unclassified|residential|living_street)$/,G=new Map(),K=(x,z)=>Math.floor(x/20)*10000+Math.floor(z/20);
  OBJ_RAW.lines.forEach(L=>{if(L[0]!=='road')return;const e=L[2]||{};if(e.u||e.br||!OK.test(e.h||''))return;const q=L[1],r=(e.w||5)/2+3;
    for(let i=0;i+3<q.length;i+=2){const a=[q[i],q[i+1],q[i+2],q[i+3],r],l=Math.hypot(a[2]-a[0],a[3]-a[1]),n=Math.max(1,Math.ceil(l/10));
      for(let t=0;t<=n;t++){const k=K(a[0]+(a[2]-a[0])*t/n,a[1]+(a[3]-a[1])*t/n);(G.get(k)||G.set(k,new Set()).get(k)).add(a);}}});
  return (x,z)=>{for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const c=G.get(K(x+a*20,z+b*20));if(!c)continue;
    for(const g of c){const dx=g[2]-g[0],dz=g[3]-g[1],l2=dx*dx+dz*dz||1,t=clamp(((x-g[0])*dx+(z-g[1])*dz)/l2,0,1);if(Math.hypot(x-g[0]-dx*t,z-g[1]-dz*t)<g[4])return true;}}return false;};})();
if(false&&nearHouse){
  const o={x:0,y:0,z:0,h:0};let rs=Math.random;let seed=7;rs=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const cand=[];for(let s=30;s<TOTAL-30;s+=5){const i=Math.floor(s/SEG);if(SURF[i]!==0)continue;sample(s,o);if(nearHouse(o.x,o.z,55,1)&&carRoad(o.x,o.z))cand.push(s);}
  const spacing=42;let lastS=-1e9,clu=0,cluN=0,prevC=-1e9;   // gleichmaessig verteilt: mindestens 85 m Abstand, je Siedlungsabschnitt hoechstens 4 Autos
  for(const s of cand){
    if(s-prevC>150){clu++;cluN=0;}prevC=s;
    if(s-lastS<spacing||cluN>=9)continue;
    const i=Math.floor(s/SEG);sample(s,o);
    const side=rs()<0.5?1:-1,g=pickCar(rs),fwd=side>0?1:-1;let ok=false,x=0,z=0;
    for(let ex=0;ex<=2.4&&!ok;ex+=0.4){   // seitlich nach aussen schieben, bis das ganze Auto (Ecken, Seitenmitte) Abstand zur Strecke hat
      const lat=side*(HW[i]+0.6+(g.userData.hw||1)+ex);[x,z]=vanPos(s,lat,o);
      const H=fwd>0?o.h:o.h+Math.PI,hl=g.userData.hl||2.2,hw=g.userData.hw||1;ok=true;
      for(const [a,b] of [[hl,-hw],[hl,hw],[-hl,-hw],[-hl,hw],[0,-hw],[0,hw],[hl,0],[-hl,0]]){
        const px=x+Math.sin(H)*a+Math.cos(H)*b,pz=z+Math.cos(H)*a-Math.sin(H)*b;
        for(let j=0;j<=N&&ok;j++){const hr=HW[Math.min(N-1,j)]*(SURF[Math.min(N-1,j)]===0?1:SURF[Math.min(N-1,j)]===1?1.5:1.7);if(Math.hypot(PX[j]-px,PZ[j]-pz)<hr+0.6)ok=false;}
        if(ok&&carInHouse(px,pz,1.2))ok=false;
        if(!ok)break;}
      if(ok){   // nur auf ebenem Boden parken: Hoehenunterschied unter den Raedern klein
        const hl2=hl*0.75,hw2=hw*0.85,hs=[[hl2,-hw2],[hl2,hw2],[-hl2,-hw2],[-hl2,hw2]].map(([a,b])=>groundY(x+Math.sin(H)*a+Math.cos(H)*b,z+Math.cos(H)*a-Math.sin(H)*b));
        if(Math.max(...hs)-Math.min(...hs)>0.32)ok=false;}
    }
    if(!ok){scene.remove(g);continue;}
    const v={g:g,parked:true,s:s};vanPose(v,x,z,o.h,fwd);scene.add(v.g);VANS.push(v);lastS=s;cluN++;
  }
  if(window.__counts)window.__counts.vans=VANS.length;
  for(let k=0;k<5;k++){const g=pickCar(rs),v={g:g,parked:false,active:false,s:0,dir:-1,v:0,cruise:0,lat:0};g.visible=false;scene.add(g);VANS.push(v);}
}

// ================= Bergkamen: Asphaltdetails, Altglascontainer, parkende Autos an Wohnstrassen =================
if(MW&&OBJ_RAW){
  let sd=777001;const rs=()=>{sd=(sd*16807)%2147483647;return sd/2147483647;};
  const HCg=new Map(),HK=(x,z)=>Math.floor(x/40)*10000+Math.floor(z/40),hc=window.__hc||[];
  for(let i=0;i<hc.length;i+=2){const k=HK(hc[i],hc[i+1]);(HCg.get(k)||HCg.set(k,[]).get(k)).push(hc[i],hc[i+1]);}
  NT.houseNear=null;const houseNear=(x,z,r)=>{for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const l=HCg.get(HK(x+a*40,z+b*40));if(!l)continue;for(let i=0;i<l.length;i+=2)if(Math.hypot(l[i]-x,l[i+1]-z)<r)return true;}return false;};
  NT.houseNear=houseNear;
  const DP=[],DC=[];
  const tri=(a,b,c,col,y)=>{[a,b,c].forEach(v=>{DP.push(v[0],gnd(v[0],v[1])+y,v[1]);DC.push(col[0],col[1],col[2]);});};
  const rect=(cx,cz,ux,uz,hl,hw,col,y)=>{const vx=-uz,vz=ux,A=[cx+ux*hl+vx*hw,cz+uz*hl+vz*hw],B=[cx+ux*hl-vx*hw,cz+uz*hl-vz*hw],C=[cx-ux*hl+vx*hw,cz-uz*hl+vz*hw],D=[cx-ux*hl-vx*hw,cz-uz*hl-vz*hw];tri(A,B,C,col,y);tri(B,D,C,col,y);};
  const disc=(cx,cz,r,col,y)=>{const M=10;for(let m=0;m<M;m++){const a0=m/M*6.2832,a1=(m+1)/M*6.2832;tri([cx,cz],[cx+Math.cos(a0)*r,cz+Math.sin(a0)*r],[cx+Math.cos(a1)*r,cz+Math.sin(a1)*r],col,y);}};
  const manhole=(x,z,y)=>{disc(x,z,0.42,[0.2,0.2,0.2],y);disc(x,z,0.34,[0.045,0.045,0.05],y+0.004);rect(x,z,1,0,0.2,0.05,[0.16,0.16,0.17],y+0.008);rect(x,z,0,1,0.2,0.05,[0.16,0.16,0.17],y+0.008);};
  const gully=(x,z,ux,uz,y)=>{rect(x,z,ux,uz,0.3,0.2,[0.17,0.17,0.17],y);rect(x,z,ux,uz,0.25,0.15,[0.03,0.03,0.035],y+0.004);};
  const patch=(x,z,ux,uz,L,W,y)=>{const dk=rs()<0.6;rect(x,z,ux,uz,L/2+0.06,W/2+0.06,[0.035,0.035,0.04],y);rect(x,z,ux,uz,L/2,W/2,dk?[0.07,0.07,0.075]:[0.15,0.15,0.15],y+0.004);};
  // 1) Strecke selbst: Kanaldeckel, Flicken, Gullys an bebauten Asphaltabschnitten
  for(let i=6;i<N-6;){const x=PX[i],z=PZ[i];i+=Math.max(6,Math.round((30+rs()*34)/SEG));
    if(SURF[i-3]!==0||!houseNear(x,z,70))continue;
    const h=HS[i],fx=Math.sin(h),fz=Math.cos(h),rx=Math.cos(h),rz=-Math.sin(h),hw=HW[i],kind=rs();
    if(kind<0.4)manhole(x+rx*(rs()-0.5)*hw*1.1,z+rz*(rs()-0.5)*hw*1.1,0.04);
    else if(kind<0.8){const o=(rs()-0.5)*hw*1.2;patch(x+rx*o,z+rz*o,fx,fz,1.6+rs()*2.4,0.8+rs()*0.9,0.04);}
    else{const sg=rs()<0.5?-1:1;gully(x+rx*sg*(hw-0.3),z+rz*sg*(hw-0.3),fx,fz,0.04);}}
  // 2) OSM-Wohnstrassen: Kanaldeckel, Gullys, Flicken, Haltelinien; abgesenkte Bordsteine an Fussgaengeruebergaengen; Altglascontainer
  const ROAD=[],VK=new Map(),EK=(x,z)=>Math.round(x/1.2)*100003+Math.round(z/1.2);
  OBJ_RAW.lines.forEach(L=>{if(L[0]!=='road')return;const e=L[2]||{};if(e.u||e.br||!/^(residential|living_street|tertiary|unclassified)$/.test(e.h||''))return;ROAD.push(L);const q=L[1];
    for(let i=0;i<q.length;i+=2){const k=EK(q[i],q[i+1]);let o=VK.get(k);if(!o)VK.set(k,o={e:0,n:0});if(i===0||i===q.length-2)o.e++;else o.n++;}});
  const isJn=(x,z)=>{const o=VK.get(EK(x,z));return !!o&&(o.e+o.n>=3||(o.e>=1&&o.n>=1));};
  const offRoute=(x,z,w)=>{const f=nearest(allHash,x,z);return !(f&&nD<(HW[nI]||2)+w/2+2.5);};
  ROAD.forEach(L=>{const q=L[1],e=L[2]||{},w=e.w||5.5;if(w<4)return;
    let run=0,nM=15+rs()*20,nP=30+rs()*40,nG=20+rs()*20;
    for(let i=0;i+3<q.length;i+=2){const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],l=Math.hypot(bx-ax,bz-az);if(l<0.5)continue;const ux=(bx-ax)/l,uz=(bz-az)/l,vx=-uz,vz=ux;
      for(;;){const m=Math.min(nM,nP,nG);if(m>=run+l)break;const t=m-run,x=ax+ux*t,z=az+uz*t,ok=offRoute(x,z,w)&&houseNear(x,z,60);
        if(m===nM){if(ok)manhole(x+vx*(rs()-0.5)*w*0.4,z+vz*(rs()-0.5)*w*0.4,0.17);nM+=22+rs()*26;}
        else if(m===nP){if(ok){const o=(rs()-0.5)*w*0.5;patch(x+vx*o,z+vz*o,ux,uz,1.6+rs()*2.6,0.9+rs()*1.0,0.17);}nP+=38+rs()*50;}
        else{if(ok)[-1,1].forEach(sg=>{if(rs()<0.8)gully(x+vx*sg*(w/2-0.28),z+vz*sg*(w/2-0.28),ux,uz,0.17);});nG+=24+rs()*14;}}
      run+=l;}
    // Haltelinien (rechte Fahrbahnhaelfte, kurz vor dem Ende) und Eck-Bordabsenkungen an Einmuendungen
    [[q.length-4,q.length-2],[2,0]].forEach(([ia,ib])=>{const ex=q[ib],ez=q[ib+1];if(!isJn(ex,ez))return;
      const ax=q[ia],az=q[ia+1],l=Math.hypot(ex-ax,ez-az);if(l<9)return;const d=[(ex-ax)/l,(ez-az)/l];
      const px=ex-d[0]*3.4,pz=ez-d[1]*3.4;if(!offRoute(px,pz,w)||!houseNear(px,pz,70))return;
      const rx=d[1],rz=-d[0];rect(px+rx*w/4,pz+rz*w/4,rx,rz,w/4-0.2,0.15,[0.86,0.86,0.82],0.17);
      [-1,1].forEach(sg=>{const kx=ex-d[0]*5+rx*sg*(w/2+0.55),kz=ez-d[1]*5+rz*sg*(w/2+0.55);rect(kx,kz,d[0],d[1],0.5,0.45,[0.7,0.68,0.56],0.21);});});
  });
  // Altglascontainer: drei Iglus (weiss, gruen, braun) an wenigen Haltepunkten
  const GL=[];{let gacc=0;ROAD.forEach(L=>{const q=L[1],e=L[2]||{},w=e.w||5.5;if(w<5)return;for(let i=0;i+3<q.length;i+=2){const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],l=Math.hypot(bx-ax,bz-az);if(l<6)continue;gacc+=l;if(gacc<230)continue;
    const ux=(bx-ax)/l,uz=(bz-az)/l,mx=(ax+bx)/2,mz=(az+bz)/2,sg=rs()<0.5?-1:1,cx=mx-uz*sg*(w/2+2.2),cz=mz+ux*sg*(w/2+2.2);
    if(!offRoute(mx,mz,w)||!houseNear(mx,mz,50)||carInHouse(cx,cz,1.5)||inBuilding(cx,cz))continue;gacc=0;
    [[0xe8e8e2,-1.4],[0x3f8a4a,0],[0x8a5a2e,1.4]].forEach(([c,o])=>GL.push({x:cx+ux*o,z:cz+uz*o,c:c,ry:Math.atan2(ux,uz)}));}});}
  if(GL.length){const g=new THREE.CylinderGeometry(0.62,0.62,1.5,10,1),m=new THREE.InstancedMesh(g,new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.7}),GL.length),D=new THREE.Object3D(),cc=new THREE.Color();
    GL.forEach((a,k)=>{D.position.set(a.x,gnd(a.x,a.z)+0.75,a.z);D.rotation.set(0,a.ry,0);D.updateMatrix();m.setMatrixAt(k,D.matrix);cc.setHex(a.c);m.setColorAt(k,cc);});m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);}
  if(DP.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(DP,3));g.setAttribute('color',new THREE.Float32BufferAttribute(DC,3));g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,side:THREE.DoubleSide}));m.receiveShadow=true;m.frustumCulled=false;scene.add(m);}
  // 3) parkende Autos an Wohnstrassen (auch ohne OSM-Parkinfo): einfache Instanz-Modelle am Fahrbahnrand, nur bei Haeusern, nie auf der Strecke
  {let n=0;const MAXC=60,CP=[],COL=[0x8c9094,0x1d1f22,0xd8d8d2,0x6e1d1d,0x24406b,0x3a4a3e,0x5b5f64,0x6b4a2e,0xa9acb0,0x2a2a2e,0x9a2a22,0x14304f];
    ROAD.forEach(L=>{const q=L[1],e=L[2]||{},w=e.w||5.5;if(w<5||!/^(residential|living_street|unclassified)$/.test(e.h||''))return;let tl=0;for(let i=0;i+3<q.length;i+=2)tl+=Math.hypot(q[i+2]-q[i],q[i+3]-q[i+1]);
      let run=0,nx=8+rs()*10;
      for(let i=0;i+3<q.length&&n<MAXC;i+=2){const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],l=Math.hypot(bx-ax,bz-az);if(l<1)continue;const ux=(bx-ax)/l,uz=(bz-az)/l;
        while(nx<run+l&&n<MAXC){const t=nx-run,at=nx;nx+=11+rs()*12;
          if(at<8||tl-at<8||rs()<0.45)continue;
          const x0=ax+ux*t,z0=az+uz*t;if(!houseNear(x0,z0,34))continue;
          const typ=rs(),sc=0.94+rs()*0.14,hl=(typ<0.2?2.35:2.05)*sc,hw=0.9*sc,sg=rs()<0.5?-1:1,lat=w/2-hw*0.9+0.15,x=x0-uz*sg*lat,z=z0+ux*sg*lat;
          const H=Math.atan2(ux,uz)+(sg>0?0:Math.PI);let ok=offRoute(x,z,w)&&offRoute(x+ux*hl,z+uz*hl,w)&&offRoute(x-ux*hl,z-uz*hl,w);
          if(ok)for(const [a,b] of [[hl,-hw],[hl,hw],[-hl,-hw],[-hl,hw],[0,-hw],[0,hw]]){const px=x+ux*a-uz*b,pz=z+uz*a+ux*b;if(carInHouse(px,pz,1.0)||inBuilding(px,pz)){ok=false;break;}}
          if(!ok)continue;
          const fx=Math.sin(H),fz=Math.cos(H),rx=Math.cos(H),rz=-Math.sin(H),a=hl*0.75,b=hw*0.85,gf=(da,db)=>gnd(x+fx*da+rx*db,z+fz*da+rz*db),
            fl=gf(a,-b),fr=gf(a,b),bl=gf(-a,-b),br=gf(-a,b),mean=(fl+fr+bl+br)/4;
          if(Math.max(fl,fr,bl,br)-Math.min(fl,fr,bl,br)>0.4)continue;
          CP.push({x:x,z:z,y:mean,H:H,pitch:-Math.atan(((fl+fr)-(bl+br))/2/(2*a)),roll:Math.atan(((fr+br)-(fl+bl))/2/(2*b)),hl:hl,hw:hw,typ:typ,c:COL[(rs()*COL.length)|0]});n++;}
        run+=l;}});
    if(CP.length){   // Fantasieautos mit Seitenprofil: abgerundete Karosserie (Extrusion), getoentes Fensterband, Raeder mit Felgen, Front-/Rueckleuchten
      const TY=[
        {hl:2.25,wz:1.38,zf:2.14,zr:-2.25,yh:0.66,yt:0.86,body:[[-2.2,0.22],[-2.26,0.7],[-2.2,1.3],[-2.05,1.48],[0.1,1.52],[0.85,1.04],[1.2,0.96],[2.05,0.82],[2.15,0.62],[2.1,0.22]],
         glass:[[[-2.05,1.06],[-2.02,1.4],[-1.9,1.44],[-0.42,1.44],[-0.42,1.06]],[[-0.24,1.06],[-0.24,1.44],[0.1,1.44],[0.8,1.08]]]},
        {hl:2.05,wz:1.25,zf:2.04,zr:-2.05,yh:0.66,yt:0.78,body:[[-2.0,0.22],[-2.06,0.7],[-1.95,0.98],[-1.45,1.42],[-1.2,1.5],[0.2,1.5],[0.95,1.0],[1.15,0.95],[1.95,0.8],[2.05,0.62],[2.0,0.22]],
         glass:[[[-1.8,1.04],[-1.4,1.38],[-1.15,1.43],[-0.42,1.43],[-0.42,1.04]],[[-0.24,1.04],[-0.24,1.43],[0.12,1.43],[0.82,1.06]]]},
        {hl:2.25,wz:1.4,zf:2.19,zr:-2.25,yh:0.64,yt:0.8,body:[[-2.2,0.22],[-2.26,0.65],[-2.18,1.0],[-1.7,1.03],[-1.2,1.48],[-0.9,1.52],[0.1,1.52],[0.85,1.03],[1.2,0.97],[2.1,0.8],[2.2,0.62],[2.15,0.22]],
         glass:[[[-1.62,1.07],[-1.2,1.42],[-0.95,1.46],[-0.42,1.46],[-0.42,1.07]],[[-0.24,1.07],[-0.24,1.46],[0.08,1.46],[0.8,1.07]]]}];
      const W=1.76,chaikin=(pts,it)=>{for(let k=0;k<it;k++){const o=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];o.push([a[0]*0.75+b[0]*0.25,a[1]*0.75+b[1]*0.25],[a[0]*0.25+b[0]*0.75,a[1]*0.25+b[1]*0.75]);}pts=o;}return pts;},mkShape=(pts,it)=>{pts=chaikin(pts,it);const sh=new THREE.Shape();pts.forEach((q,i)=>i?sh.lineTo(q[0],q[1]):sh.moveTo(q[0],q[1]));sh.closePath();return sh;};
      const orient=g=>{g.rotateY(-Math.PI/2);return g;};
      TY.forEach(T=>{
        const bt=0.07;let g=new THREE.ExtrudeGeometry(mkShape(T.body,2),{depth:W-2*bt,bevelEnabled:true,bevelThickness:bt,bevelSize:0.07,bevelSegments:2,curveSegments:1});g.translate(0,0,-(W-2*bt)/2);T.bg=orient(g);
        const gs=[];T.glass.forEach(pl=>{const q=new THREE.ExtrudeGeometry(mkShape(pl,1),{depth:W+0.03,bevelEnabled:false});q.translate(0,0,-(W+0.03)/2);gs.push(orient(q));});T.gg=gs;});
      const wrap=(geo,tint,cnt,rough,met)=>{const m=new THREE.InstancedMesh(geo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:rough,metalness:met}),cnt);m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);return m;};
      const NT=[0,0,0],tOf=a=>a.typ<0.35?0:a.typ<0.7?1:2;CP.forEach(a=>{a.t=tOf(a);a.k=NT[a.t]++;});
      const bx=new THREE.BoxGeometry(1,1,1),cy=new THREE.CylinderGeometry(1,1,1,12),NB=CP.length;
      const MT=TY.map((T,t)=>({b:wrap(T.bg,0,Math.max(1,NT[t]),0.3,0.2),g:T.gg.map(q=>wrap(q,0,Math.max(1,NT[t]),0.15,0.2))}));
      const Mtire=wrap(cy,0,NB*4,0.9,0),Mrim=wrap(cy,0,NB*4,0.35,0.7),Mhl=wrap(bx,0,NB*2,0.3,0),Mtl=wrap(bx,0,NB*2,0.4,0),Mund=wrap(bx,0,NB,0.9,0),March=wrap(cy,0,NB*4,0.95,0),Mtrim=wrap(bx,0,NB*16,0.6,0.1);
      const P=new THREE.Object3D(),L_=new THREE.Object3D(),cc=new THREE.Color(),M4=new THREE.Matrix4(),I=new THREE.Matrix4();
      const put=(M,idx,col,px,py,pz,sx,sy,sz,rz_)=>{L_.position.set(px,py,pz);L_.rotation.set(0,0,rz_||0);L_.scale.set(sx,sy,sz);L_.updateMatrix();M4.multiplyMatrices(P.matrix,L_.matrix);M.setMatrixAt(idx,M4);cc.setHex(col);M.setColorAt(idx,cc);};
      CP.forEach((a,ci)=>{const T=TY[a.t],m=MT[a.t],k=a.k,sc=a.sc||1;P.position.set(a.x,a.y,a.z);P.rotation.order='YXZ';P.rotation.set(a.pitch,a.H,a.roll);P.scale.set(1,1,1);P.updateMatrix();
        put(m.b,k,a.c,0,0,0,1,1,1);m.g.forEach(q=>put(q,k,0x1c252d,0,0,0,1,1,1));
        put(Mund,ci,0x101010,0,0.2,0,1.5,0.1,T.hl*1.8);
        [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx,sz],wi)=>{const id=ci*4+wi;put(Mtire,id,0x141414,sx*0.84,0.33,sz*T.wz,0.33,0.2,0.33,Math.PI/2);put(Mrim,id,0xaab0b6,sx*0.94,0.33,sz*T.wz,0.2,0.2,0.2,Math.PI/2);});
        [-1,1].forEach((sx,wi)=>{put(Mhl,ci*2+wi,0xf4f1e2,sx*0.62,T.yh,T.zf-0.01,0.42,0.12,0.07);put(Mtl,ci*2+wi,0xb41a1a,sx*0.66,T.yt,T.zr+0.01,0.4,0.13,0.07);});});
      CP.forEach((a,ci)=>{const T=TY[a.t];P.position.set(a.x,a.y,a.z);P.rotation.order='YXZ';P.rotation.set(a.pitch,a.H,a.roll);P.scale.set(1,1,1);P.updateMatrix();
        [[-1,1],[1,1],[-1,-1],[1,-1]].forEach(([sx,sz],wi)=>put(March,ci*4+wi,0x0b0b0c,sx*0.885,0.34,sz*T.wz,0.43,0.025,0.43,Math.PI/2));
        let ti=ci*16;const tr=(col,px,py,pz,sx,sy,sz)=>put(Mtrim,ti++,col,px,py,pz,sx,sy,sz);
        [-1,1].forEach(sx=>{tr(0x0e0e0f,sx*0.885,0.88,-0.33,0.012,0.5,0.015);tr(0x0e0e0f,sx*0.885,0.88,0.55,0.012,0.5,0.015);   // Tuerfugen
          tr(0x15181b,sx*0.97,1.12,T.zf-1.2,0.12,0.09,0.2);   // Aussenspiegel
          tr(0x1a1a1c,sx*0.86,0.27,0,0.05,0.12,T.hl*1.25);});   // Seitenschweller
        tr(0x111214,0,0.62,T.zf-0.01,0.78,0.16,0.06);   // Kuehlergrill
        tr(0x16171a,0,0.33,T.zf-0.04,1.62,0.2,0.14);tr(0x16171a,0,0.34,T.zr+0.04,1.62,0.2,0.14);   // Stossfaenger
        tr(0xe8e6dc,0,0.5,T.zr-0.02,0.52,0.12,0.02);   // Kennzeichen hinten
        while(ti<ci*16+16)tr(0x000000,0,-5,0,0.001,0.001,0.001);});
      const fin=M=>{M.instanceMatrix.needsUpdate=true;if(M.instanceColor)M.instanceColor.needsUpdate=true;};
      MT.forEach(m=>{fin(m.b);m.g.forEach(fin);});[Mtire,Mrim,Mhl,Mtl,Mund,March,Mtrim].forEach(fin);}
    if(window.__counts)window.__counts.mwcars=n;window.__mwcars=n;window.__cp=CP;}
  // Nachtbeleuchtung: zusaetzliche Laternen an Wohnstrassen (alle ~42 m, wechselseitig) und weiche Lichtflecken unter allen Laternen
  {const L2=[];
    ROAD.forEach(L=>{const q=L[1],e=L[2]||{},w=e.w||5.5;if(w<5||!/^(residential|living_street|tertiary|unclassified)$/.test(e.h||''))return;let runL=0,nx=15+rs()*20;
      for(let i=0;i+3<q.length&&L2.length<90;i+=2){const ax=q[i],az=q[i+1],bx=q[i+2],bz=q[i+3],l=Math.hypot(bx-ax,bz-az);if(l<1)continue;const ux=(bx-ax)/l,uz=(bz-az)/l;
        while(nx<runL+l&&L2.length<90){const t=nx-runL;nx+=42;const x0=ax+ux*t,z0=az+uz*t;if(!offRoute(x0,z0,w)||!houseNear(x0,z0,45))continue;
          const sg=(L2.length%2?1:-1),px=x0-uz*sg*(w/2+1.3),pz=z0+ux*sg*(w/2+1.3);if(carInHouse(px,pz,0.8)||inBuilding(px,pz))continue;
          L2.push({x:px,z:pz,hx:px+uz*sg*1.3,hz:pz-ux*sg*1.3,a:Math.atan2(ux,uz)});}
        runL+=l;}});
    if(L2.length){const pm=new THREE.MeshStandardMaterial({color:0x4a4d52,roughness:0.7,metalness:0.4}),hm=new THREE.MeshStandardMaterial({color:0xfff2c0,emissive:0xffe9a8,emissiveIntensity:NIGHT?3.2:0.35,roughness:0.6});hm.userData.dI=0.35;hm.userData.nI=3.2;NT.emi.push(hm);
      const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06,0.09,5.6,8),pm,L2.length),head=new THREE.InstancedMesh(new THREE.BoxGeometry(0.9,0.14,0.32),hm,L2.length),D=new THREE.Object3D();
      L2.forEach((l,k)=>{const y=gnd(l.x,l.z);D.rotation.set(0,0,0);D.position.set(l.x,y+2.8,l.z);D.updateMatrix();pole.setMatrixAt(k,D.matrix);D.rotation.set(0,l.a,0);D.position.set(l.hx,y+5.5,l.hz);D.updateMatrix();head.setMatrixAt(k,D.matrix);NT.lampPts.push([l.hx,l.hz]);});
      [pole,head].forEach(m=>{m.castShadow=true;m.frustumCulled=false;scene.add(m);});}
    if(NT.lampPts.length){const pl=new THREE.InstancedMesh(new THREE.PlaneGeometry(17,17).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:NT.poolTex,color:0xffd49a,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),NT.lampPts.length),D=new THREE.Object3D();
      NT.lampPts.forEach((p,k)=>{D.position.set(p[0],gnd(p[0],p[1])+0.16,p[1]);D.updateMatrix();pl.setMatrixAt(k,D.matrix);});pl.frustumCulled=false;pl.visible=NIGHT;scene.add(pl);NT.pools.push(pl);}
    if(NIGHT)nightApply();}
}
window.__vans=VANS;
const vo={x:0,y:0,z:0,h:0};
// ---- Nachtwild: schemenhaft Wildschwein, Hirsch und Reh im dunklen Wald (nur Nightride), nur ab und zu. Echte 3D-Koerper (kein Bild),
// kaum beleuchtet, tauchen aus der Dunkelheit auf und verschwinden wieder. Die Augen reflektieren das Licht der Stirnlampe (Katzenaugen-Effekt).
const WL={list:[],wait:5+Math.random()*8,pool:{},eyeTex:null,get a(){return this.list[0]||null;}};
const wlS={x:0,y:0,z:0,h:0},_wv=V3(0,0,0),_wc=V3(0,0,0),_wd=V3(0,0,0);
function wlEyeTex(){
  if(WL.eyeTex)return WL.eyeTex;
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,235,1)');r.addColorStop(0.22,'rgba(215,255,170,.9)');r.addColorStop(0.55,'rgba(130,210,90,.25)');r.addColorStop(1,'rgba(100,180,70,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);return WL.eyeTex=new THREE.CanvasTexture(c);
}
function wlBlob(){   // Kugel mit leichter Unregelmaessigkeit (Fell, Muskeln): wirkt weniger wie ein Klotz
  const g=new THREE.SphereGeometry(1,18,13),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=1+0.06*Math.sin(x*5.1+y*3.3)*Math.cos(z*4.7+x*2.1)+0.03*Math.sin(y*9+z*7.3);p.setXYZ(i,x*n,y*n,z*n);}
  g.computeVertexNormals();return g;
}
function wlBuild(kind){
  const mat=new THREE.MeshLambertMaterial({color:0x040303,emissive:0x05070a,transparent:true,opacity:0}),root=new THREE.Group(),body=new THREE.Group();root.add(body);
  const ell=(par,rx,ry,rz,x,y,z,rz2)=>{const m=new THREE.Mesh(wlBlob(),mat);m.scale.set(rx,ry,rz);m.position.set(x,y,z);if(rz2)m.rotation.z=rz2;par.add(m);return m;};
  const limb=(par,a,b,r0,r1)=>{const d=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),L=d.length(),m=new THREE.Mesh(new THREE.CylinderGeometry(r1,r0,L,7,1),mat);
    m.position.set((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());par.add(m);return m;};
  const boar=kind==='boar'||kind==='piglet',stag=kind==='stag',head=new THREE.Group(),legs=[];
  let eyeX,eyeY,eyeZ,legH,legX,legZ;
  if(boar){
    // Wildschwein: hohe, keilfoermige Schulter, nach hinten abfallender Ruecken, kraeftiger Nacken, langer Keilkopf, Borstenkamm
    ell(body,0.6,0.3,0.28,-0.02,0.6,0);ell(body,0.4,0.36,0.31,0.3,0.7,0);ell(body,0.34,0.27,0.26,-0.42,0.56,0);ell(body,0.28,0.3,0.27,0.58,0.64,0);
    for(let i=0;i<16;i++){const u=i/15,c=new THREE.Mesh(new THREE.ConeGeometry(0.02+0.012*(1-u),0.1+0.13*(1-Math.abs(u-0.25)*1.2),5),mat);
      c.position.set(0.52-u*1.0,0.98-u*0.2,(Math.random()-0.5)*0.05);c.rotation.z=-0.55+u*0.2;c.rotation.x=(Math.random()-0.5)*0.3;body.add(c);}   // Borstenkamm
    limb(body,[-0.74,0.62,0],[-0.9,0.5,0],0.035,0.015);
    head.position.set(0.84,0.52,0);ell(head,0.24,0.16,0.14,0.1,0,0);limb(head,[0.2,0.0,0],[0.5,-0.1,0],0.115,0.05);ell(head,0.05,0.045,0.06,0.5,-0.1,0);
    ell(head,0.045,0.09,0.03,-0.02,0.15,0.09,0.35);ell(head,0.045,0.09,0.03,-0.02,0.15,-0.09,-0.35);
    limb(head,[0.3,-0.1,0.05],[0.36,-0.16,0.06],0.012,0.008);limb(head,[0.3,-0.1,-0.05],[0.36,-0.16,-0.06],0.012,0.008);   // kleine Hauer
    eyeX=0.2;eyeY=0.05;eyeZ=0.09;legH=0.46;legX=[0.42,-0.4];legZ=0.17;
  }else if(kind==='doe'){   // Reh: kompakt, Hinterhand hoeher als der Widerrist, kurzer Hals, kleiner Kopf mit grossen Lauschern, duenne Laeufe
    ell(body,0.46,0.21,0.17,0,0.74,0);ell(body,0.27,0.22,0.17,0.3,0.78,0);ell(body,0.25,0.25,0.19,-0.3,0.8,0);ell(body,0.2,0.2,0.16,-0.46,0.78,0);
    limb(body,[0.36,0.82,0],[0.62,1.06,0],0.1,0.058);
    limb(body,[-0.62,0.8,0],[-0.68,0.74,0],0.03,0.02);
    head.position.set(0.7,1.1,0);ell(head,0.15,0.075,0.062,0.07,-0.02,0);limb(head,[0.16,-0.03,0],[0.27,-0.06,0],0.045,0.03);
    ell(head,0.035,0.115,0.022,-0.04,0.1,0.075,0.75);ell(head,0.035,0.115,0.022,-0.04,0.1,-0.075,-0.75);
    eyeX=0.1;eyeY=0.025;eyeZ=0.058;legH=0.58;legX=[0.36,-0.4];legZ=0.11;
  }else{
    ell(body,0.68,0.3,0.25,0,1.12,0);ell(body,0.36,0.3,0.24,0.38,1.15,0);
    limb(body,[-0.62,1.2,0],[-0.7,1.0,0],0.04,0.025);
    limb(body,[0.55,1.2,0],[0.92,1.62,0],0.13,0.08);
    head.position.set(1.0,1.68,0);ell(head,0.22,0.11,0.09,0.1,-0.04,0);limb(head,[0.24,-0.06,0],[0.4,-0.1,0],0.07,0.05);
    ell(head,0.05,0.11,0.03,-0.03,0.1,0.11,0.5);ell(head,0.05,0.11,0.03,-0.03,0.1,-0.11,-0.5);
    if(stag)[1,-1].forEach(s=>{      // Geweih
      const P=[[0,0.08,s*0.05],[-0.12,0.36,s*0.12],[-0.22,0.62,s*0.1],[-0.14,0.9,s*0.13]];
      for(let i=0;i<3;i++)limb(head,P[i],P[i+1],0.02,0.014);
      limb(head,P[1],[0.06,0.52,s*0.22],0.015,0.01);limb(head,P[2],[0.04,0.86,s*0.22],0.015,0.01);limb(head,P[2],[-0.34,0.84,s*0.05],0.014,0.01);limb(head,P[3],[0.02,1.08,s*0.18],0.012,0.008);
    });
    eyeX=0.12;eyeY=0.02;eyeZ=0.08;legH=0.84;legX=[0.45,-0.45];legZ=0.14;
  }
  body.add(head);
  legX.forEach(x=>[1,-1].forEach(z=>{const lg=new THREE.Group();lg.position.set(x,legH,z*legZ);if(boar){limb(lg,[0,0,0],[0.0,-legH*0.55,0],0.06,0.036);limb(lg,[0,-legH*0.55,0],[0.01,-legH,0],0.034,0.024);ell(lg,0.034,0.03,0.03,0.025,-legH,0);}else{const r0=kind==='doe'?0.042:0.05,r1=kind==='doe'?0.017:0.022;limb(lg,[0,0,0],[-0.05,-legH*0.5,0],r0,r1*1.5);limb(lg,[-0.05,-legH*0.5,0],[0.02,-legH,0],r1*1.5,r1);ell(lg,0.032,0.028,0.026,0.03,-legH,0);}body.add(lg);legs.push(lg);}));
  const eyes=[1,-1].map(s=>{const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:wlEyeTex(),color:boar?0xffd9a0:0xe6ffc0,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false,opacity:0}));sp.position.set(eyeX,eyeY,s*eyeZ);head.add(sp);return sp;});
  root.scale.setScalar(kind==='piglet'?0.4:1);root.visible=false;scene.add(root);
  return {kind:kind,g:root,body:body,head:head,legs:legs,eyes:eyes,mat:mat,boar:boar};
}
function wlPlace(kind,x,z,grp,delay){
  const pl=WL.pool[kind]||(WL.pool[kind]=[]);let T=pl.find(q=>!q.on);if(!T){T=wlBuild(kind);T.mat.color.setHex(kind==='boar'||kind==='piglet'?0x0b0907:0x120e0b);pl.push(T);}   // alle als dunkle Schemen im Lampenkegel
  T.on=true;T.called=false;T.panic=false;T.grp=grp;WL.list.push(T);T.x=x;T.z=z;T.t=-delay;T.ph='in';T.stand=grp.stand+(Math.random()-0.5);T.speed=0;T.blink=1.5+Math.random()*3;
  T.willCall=kind==='piglet'?false:true;T.callAt=Math.random()*0.9;
  T.yaw=Math.atan2(-(camera.position.z-z),camera.position.x-x)+(Math.random()-0.5)*1.1;
  T.g.position.set(x,gnd(x,z),z);T.g.rotation.y=T.yaw;T.g.visible=true;T.mat.opacity=0;return T;
}
function wlSpawnAt(kind,s,o){   // Einzeltier (auch fuer Tests)
  sample(s,wlS);const x=wlS.x-Math.cos(wlS.h)*o,z=wlS.z+Math.sin(wlS.h)*o;
  return wlPlace(kind,x,z,{stand:4+Math.random()*6,panic:false},0);
}
function wlSpawnGroup(kind,x,z){   // Wildschweine kommen in Rotten: 2-3 Bachen mit 2-4 Frischlingen; Hirsch/Reh einzeln oder als kleines Paar
  const grp={stand:kind==='boar'?0.5+Math.random()*1.2:4+Math.random()*6,panic:false};   // Wildschweine stehen naeher am Weg: sie muessen frueher rufen, sonst fliehen sie vor dem Ruf
  if(kind==='boar'){
    const nb=2+((Math.random()*3)|0),np=3+((Math.random()*3)|0);
    for(let i=0;i<nb;i++)wlPlace('boar',x+(Math.random()-0.5)*5,z+(Math.random()-0.5)*5,grp,i*0.5+Math.random()*0.6);
    for(let i=0;i<np;i++)wlPlace('piglet',x+(Math.random()-0.5)*4,z+(Math.random()-0.5)*4,grp,0.3+Math.random()*1.4);
  }else{
    wlPlace(kind,x,z,grp,0);
    const nx=kind==='doe'?(Math.random()<0.45?1:0)+(Math.random()<0.22?1:0)+(Math.random()<0.1?1:0):(Math.random()<0.3?1:0);   // auch mal mehrere: Rehe bis zu 4, Hirsche manchmal zu zweit
    for(let k=0;k<nx;k++)wlPlace(kind==='stag'&&k>0?'doe':kind,x+(2+Math.random()*3)*(k%2?-1:1),z+(Math.random()-0.5)*4,grp,0.5+k*0.4);
  }
  return grp;
}
function wlSpawnTry(){
  const kinds=['boar','boar','boar','boar','boar','boar','boar','stag','stag','doe','doe'];   // Wildschweine ca. 30 % seltener, Hirsche und Rehe ca. 20 % haeufiger (zusammen mit dem laengeren Abstand unten)
  for(let t=0;t<24;t++){
    const kind=kinds[(Math.random()*kinds.length)|0],bo=kind==='boar';   // Wildschweine sind niedrig und dunkel: sie stehen naeher und mittiger im Lampenkegel, sonst sieht man sie nie
    const s=st.pos+(bo?26+Math.random()*22:35+Math.random()*40);if(s>TOTAL-60)break;
    const si=Math.min(N-1,Math.floor(s/SEG)),asp=SURF[si]===0;
    if(GR[si]>-2&&Math.random()<0.7)continue;   // Schwerpunkt bergab: auf Anstiegen und flachen Stuecken nur selten
    sample(s,wlS);const o=(Math.random()<0.5?-1:1)*(bo?8.5+Math.random()*4:10+Math.random()*7),x=wlS.x-Math.cos(wlS.h)*o,z=wlS.z+Math.sin(wlS.h)*o;   // 10-17 m vom Weg (auf Distanz), beim Wegrennen nie ueber ~30 m
    if(forestD(x,z)<(asp?0.55:0.38)||inBuilding(x,z))continue;   // auch an Asphaltwegen (z. B. Hemstein), dann aber nur im dichteren Wald
    if(WL.list.some(q=>Math.hypot(q.x-x,q.z-z)<25))continue;
    wlSpawnGroup(kind,x,z);return true;
  }
  return false;
}
function wlEnd(a){a.g.visible=false;a.on=false;a.eyes.forEach(e=>e.material.opacity=0);const i=WL.list.indexOf(a);if(i>=0)WL.list.splice(i,1);}
function wlUpdateOne(a,dt){
  const cp=camera.position;a.t+=dt;
  const dx=cp.x-a.x,dz=cp.z-a.z,dist=Math.hypot(dx,dz);
  if(dist<10)a.grp.panic=true;   // naeher als 10 m: die ganze Rotte haut sofort ab
  if(a.ph==='in'){a.mat.opacity=Math.max(0,Math.min(1,a.t/1.8));if(a.t>=1.8)a.ph='stand';if(a.grp.panic&&a.t>0){a.panic=true;a.ph='go';a.gt=0;a.speed=a.boar?6.5:6;a.away=Math.atan2(dz,-dx)+(Math.random()-0.5)*0.9;}}
  else if(a.ph==='stand'||a.ph==='call'){
    a.mat.opacity=1;
    const want=Math.atan2(-dz,dx);let d=want-a.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));a.yaw+=Math.max(-1.1*dt,Math.min(1.1*dt,d*0.8));   // schaut dem Fahrer nach
    if(a.grp.panic){a.panic=true;a.ph='go';a.gt=0;a.speed=a.boar?6.5:6;a.away=Math.atan2(dz,-dx)+(Math.random()-0.5)*0.9;}
    else if(a.ph==='stand'&&(a.t>1.8+a.stand||dist>110)){a.ph='call';a.ct=0;}
    if(a.ph==='call'){
      a.ct+=dt;
      if(!a.called&&a.ct>=a.callAt){a.called=true;if(a.willCall&&!a.grp.called){a.grp.called=true;const me=camera.matrixWorld.elements,pn=Math.max(-1,Math.min(1,((a.x-cp.x)*me[0]+(a.z-cp.z)*me[2])/Math.max(8,dist)));AUDIO.call(a.kind,Math.max(0,Math.min(1,1.15-dist/110)),pn);}}   // jedes Tier ruft hoechstens einmal, leise
      if(a.ct>(a.kind==='stag'?2.1:1.7)){a.ph='go';a.gt=0;a.speed=a.boar?4.6:4.2;a.away=Math.atan2(dz,-dx)+(Math.random()-0.5)*0.9;}
    }
  }else{
    a.gt+=dt;let d=a.away-a.yaw;d=Math.atan2(Math.sin(d),Math.cos(d));a.yaw+=Math.max(-3.5*dt,Math.min(3.5*dt,d*2.5));
    a.x+=Math.cos(a.yaw)*a.speed*dt;a.z-=Math.sin(a.yaw)*a.speed*dt;
    a.mat.opacity=a.panic?Math.max(0,1-Math.max(0,a.gt-0.15)/0.95):Math.max(0,1-Math.max(0,a.gt-0.6)/1.4);   // verschwinden in der Dunkelheit
    if(a.gt>(a.panic?1.3:2.2)){wlEnd(a);return;}
  }
  const moving=a.ph==='go',sw=moving?Math.sin(a.t*11)*0.55:0;
  a.g.position.set(a.x,gnd(a.x,a.z),a.z);a.g.rotation.y=a.yaw;
  a.legs.forEach((l,i)=>{l.rotation.z=((i%3===0)?1:-1)*sw;});
  a.body.position.y=moving?Math.abs(Math.sin(a.t*11))*0.06:Math.sin(a.t*1.6)*0.006;
  let pitch=a.boar?-0.32+0.12*Math.sin(a.t*0.8):0.06+0.14*Math.sin(a.t*0.7)-(Math.sin(a.t*0.23)>0.9?0.5:0);
  if(a.ph==='call')pitch=a.kind==='stag'?0.55:a.boar?0.3:0.4;   // Kopf hoch beim Rufen
  a.head.rotation.z=pitch;a.head.rotation.y=0.22*Math.sin(a.t*0.5)*(a.ph==='call'?0.3:1);
  // Augen: Katzenaugen-Reflexion nur, wenn das Tier den Fahrer ansieht UND vom Lampenkegel getroffen wird
  camera.getWorldDirection(_wd);
  const hy=a.yaw+a.head.rotation.y,fx=Math.cos(hy),fz=-Math.sin(hy),blink=(a.t%a.blink)<0.14?0.1:1;
  a.eyes.forEach(e=>{
    e.getWorldPosition(_wv);_wc.set(cp.x-_wv.x,cp.y-_wv.y,cp.z-_wv.z);const D=_wc.length();_wc.multiplyScalar(1/(D||1));
    const al=Math.max(0,fx*_wc.x+fz*_wc.z),la=-(_wd.x*_wc.x+_wd.y*_wc.y+_wd.z*_wc.z);
    const sh=Math.pow(al,2)*Math.max(0,Math.min(1,(la-0.86)/0.1))*Math.max(0,1-D/110)*a.mat.opacity*blink;
    e.material.opacity=sh;const sz=(0.07+0.005*D)*(0.6+0.4*sh);e.scale.set(sz,sz,1);
  });
}
function updateWildlife(dt){
  if(!MW||!NIGHT||(RT&&RT.alp)){while(WL.list.length)wlEnd(WL.list[0]);return;}   // Tiere auf allen Strecken ausser Soelden
  WL.list.slice().forEach(a=>wlUpdateOne(a,dt));
  WL.wait-=dt/1.21;
  if(WL.wait>0||st.v<2||st.lift)return;
  const ng=new Set(WL.list.map(q=>q.grp)).size;if(ng>=3){WL.wait=3;return;}
  if(wlSpawnTry())WL.wait=(ng<2&&Math.random()<0.45)?2+Math.random()*4:6+Math.random()*14;   // oefter: alle ~15-45 s, manchmal zwei kurz nacheinander
  else WL.wait=1.5;
}
function updateVans(dt){   // fahrende Autos: kommen entgegen, bremsen rechtzeitig bis zum Stand und warten, bis der Fahrer vorbei ist. Nie Kontakt.
  if(!nearHouse)return;
  const mv=VANS.filter(v=>!v.parked);if(!mv.length)return;
  mv.forEach(v=>{
    if(!v.active)return;
    const gap=v.s-st.pos;   // Auto liegt vor dem Fahrer (gap>0) und faehrt ihm entgegen
    const tgt=gap>0?v.cruise*clamp((gap-14)/26,0,1):v.cruise;   // ab ca. 40 m Abstand abbremsen, bei 14 m Stillstand
    v.v=v.v>tgt?Math.max(tgt,v.v-7*dt):Math.min(tgt,v.v+2.5*dt);
    v.s+=v.dir*v.v*dt;
    if(v.s<st.pos+9&&v.v>0.01&&gap>0)v.s=Math.max(v.s,st.pos+9);   // Sicherung: nie naeher als 9 m heranruecken, solange es vor dem Fahrer steht
    const i=Math.floor(clamp(v.s,0,TOTAL-1)/SEG);
    sample(v.s,vo);
    v.g.userData.wheels&&v.g.userData.wheels.forEach(w=>{w.rotation.x+=v.v*dt/0.41;});
    if(v.s<6||v.s>TOTAL-10||SURF[i]!==0||st.pos-v.s>25||Math.abs(v.s-st.pos)>260||!carRoad(vo.x,vo.z)||carInHouse(vo.x,vo.z,3.5)){v.active=false;v.g.visible=false;return;}
    const lat=-Math.max(HW[i]-(v.g.userData.hw||1)-0.15,0.95);
    vanFast(v,vo.x-Math.cos(vo.h)*lat,vo.z+Math.sin(vo.h)*lat,vo.h,v.dir,dt);
  });
  vanWait-=dt;
  if(vanWait<=0){
    const v=mv.find(q=>!q.active);vanWait=3;if(!v)return;
    const s=st.pos+50+Math.random()*50;   // nur dort starten, wo die Strasse auf den naechsten 50 m durchgehend befahrbar ist
    if(s<8||s>TOTAL-30)return;
    for(let d=0;d<=40;d+=10){const q=s-d,qi=Math.floor(q/SEG);if(q<st.pos+8)break;if(qi<0||SURF[qi]!==0){return;}sample(q,vo);if(!carRoad(vo.x,vo.z)||carInHouse(vo.x,vo.z,3.5))return;}
    if(VANS.some(q=>q.parked&&Math.abs(q.s-s)<8)||joggers.some(j=>j.active&&Math.abs(j.s-s)<45))return;
    v.s=s;v.dir=-1;v.cruise=6+Math.random()*2.5;v.v=v.cruise;v.off=undefined;v.active=true;v.g.visible=true;vanWait=8+Math.random()*16;
  }
}
await BOOT('Setze Autos und Mitfahrer …',95);
// ================= Gruppenfahrt: farbige Punkte der Mitfahrer =================
const GRP=makeGroup(),GRP_ROUTE=GPX_ID?'gpx_'+GPX_ID:(RKEY||'tour2');
let GRP_CODE='';try{GRP_CODE=localStorage.getItem('miworu_group')||'';}catch(e){}
const DOT_RANGE=500;   // ab dieser Entfernung (m) verschwindet der Punkt im Sichtfeld (nur noch in Minikarte und Profil)
const dotTex=[0,1,2,3].map(l=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=[22,22,22,22][l];
  if(l===0){g.fillStyle='rgba(0,0,0,0.85)';g.beginPath();g.arc(32,32,r+4,0,7);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(32,32,r,0,7);g.fill();}   // scharfer Punkt mit dunklem Rand
  else{const bl=[0,5,10,16][l],gr=g.createRadialGradient(32,32,Math.max(0,r-bl-2),32,32,r+bl+4);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);}   // je weiter weg, desto unschaerfer
  return new THREE.CanvasTexture(c);});
const dotSp=[];for(let k=0;k<8;k++){const m=new THREE.SpriteMaterial({map:dotTex[0],color:new THREE.Color(GROUP_COLORS[k]),transparent:true,depthWrite:false,fog:false,toneMapped:false});const sp=new THREE.Sprite(m);sp.visible=false;sp.renderOrder=9;scene.add(sp);dotSp.push(sp);}
const grpO={x:0,y:0,z:0,h:0};
window.__grp=GRP;
function grpJoin(){if(GRP_CODE)GRP.join(GRP_CODE,GRP_ROUTE);else GRP.leave();}
function updateGroup(dt){
  GRP.update(dt,st.pos,st.x,st.v,running);
  dotSp.forEach(sp=>sp.visible=false);
  GRP.live().forEach(r=>{
    const sp=dotSp[r.k%8];if(!sp||!isFinite(r.d))return;
    sample(clamp(r.d,0,TOTAL-1),grpO);const x=grpO.x-Math.cos(grpO.h)*r.x,z=grpO.z+Math.sin(grpO.h)*r.x,y=gnd(x,z)+1.45;
    const d=Math.hypot(x-camera.position.x,y-camera.position.y,z-camera.position.z);
    if(d>DOT_RANGE||d<1.2)return;
    const t=d/DOT_RANGE,lv=t<0.08?0:t<0.25?1:t<0.55?2:3;   // je weiter weg, desto unschaerfer
    sp.material.map=dotTex[lv];sp.material.opacity=1-t*0.6;sp.scale.setScalar(Math.max(0.3,d*0.012)*(1+lv*0.35));sp.position.set(x,y,z);sp.visible=true;
  });
}
{   // Luftbilder laden und in den Spielfarben verwenden
  if(DOP_RAW&&ROUTE&&!CUS&&DOPHOOK.length){
    const M=DOP_RAW,res=M.res||1,ids=M.tiles.map(t=>{const k=Object.keys(DOP_I).find(q=>q.split('/').pop()===t.f);return k?DOP_I[k]:null;});
    const E0=Math.min(...M.tiles.map(t=>t.e0)),E1=Math.max(...M.tiles.map(t=>t.e0+t.w*res)),N1=Math.max(...M.tiles.map(t=>t.n1)),N0=Math.min(...M.tiles.map(t=>t.n1-t.h*res));
    const W=Math.ceil((E1-E0)/res),H=Math.ceil((N1-N0)/res),cv=document.createElement('canvas');cv.width=W;cv.height=H;const cx=cv.getContext('2d',{willReadFrequently:true});
    Promise.all(M.tiles.map((t,i)=>new Promise(ok=>{if(!ids[i])return ok();const im=new Image();im.onload=()=>{cx.drawImage(im,Math.round((t.e0-E0)/res),Math.round((N1-t.n1)/res),t.w,t.h);ok();};im.onerror=()=>ok();im.src=ids[i];}))).then(()=>{
      let D;try{D=cx.getImageData(0,0,W,H).data;}catch(e){return;}
      const a=M.aff;
      dopAt=(x,z,r)=>{const E=a.E0+a.ex*x+a.ez*z,N=a.N0+a.nx*x+a.nz*z,px=Math.round((E-E0)/res),py=Math.round((N1-N)/res);
        let R=0,G=0,B=0,c=0;for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++){const X=px+i,Y=py+j;if(X<0||Y<0||X>=W||Y>=H)continue;const o=(Y*W+X)*4;if(D[o+3]<250)continue;R+=D[o];G+=D[o+1];B+=D[o+2];c++;}
        return c?[R/c/255,G/c/255,B/c/255]:null;};
      DOPHOOK.forEach(f=>{try{f();}catch(e){console.warn('DOP',e);}});
    });
  }
}
let last=performance.now(),drsAcc=0,drsN=0;
function drsTick(dt){if(!running||paused){drsAcc=drsN=0;return;}drsAcc+=dt;drsN++;if(drsAcc<2.5)return;const ft=drsAcc/drsN;drsAcc=drsN=0;
  const slow=FPSCAP===30;   // bei 30-fps-Limit liegt die Frame-Zeit ohnehin bei ~33 ms
  if(ft>(slow?0.042:0.029)&&DRS>0.7){DRS=Math.max(0.7,+(DRS-0.1).toFixed(2));applyQ();}else if(ft<(slow?0.0365:0.0185)&&DRS<1){DRS=Math.min(1,+(DRS+0.05).toFixed(2));applyQ();}}
function loop(now){
  if(FPSCAP&&now-last<1000/FPSCAP-3){requestAnimationFrame(loop);return;}   // Bildrate begrenzen (spart Akku und Waerme)
  const dt=clamp((now-last)/1000,0,0.05);last=now;
  update(dt);render(dt,now);drsTick(dt);
  requestAnimationFrame(loop);
}
window.__dbg={get LIFTS(){return LIFTS;},get WL(){return WL;},updateWildlife:updateWildlife,wlSpawnAt:wlSpawnAt,forestD:forestD,splash:splashDrops,PUDH:PUDH,AUDIO:AUDIO,renderer:renderer,scene:scene,SHK:SHK,BUMPS:BUMPS,gnd:gnd,HS:HS,PX:PX,PZ:PZ,HW:HW,KV:KV,ROUTE:ROUTE,SURF:SURF,cam:camera,joggers:joggers,groundY:groundY,TABS:TABS,tabH:tabH,get st(){return st;},set pos(v){st.pos=v;camInit=false;},N:N,TOTAL:TOTAL,iTrail:iTrail,SEC:SEC,PY:PY,GR:GR,forestD:forestD,lu:(k,x,z)=>LU?lu(LU[k],x,z):-1};
if(SAVED)menu('Weiterfahren bei '+(SAVED.pos/1000).toFixed(2).replace('.',',')+' km','Gespeicherte Fahrt · '+fmtT(SAVED.t));else menu('Start');
if(location.hash==='#go'&&!PAYWALL)start();
if(PAYWALL)showUnlock(PAYWALL);
requestAnimationFrame(loop);
requestAnimationFrame(()=>{const b=document.getElementById('boot');if(b){b.classList.add('off');setTimeout(()=>b.remove(),700);}});

// Vollbild: Mauszeiger verschwindet nach 2,5 s Ruhe und kommt bei jeder Mausbewegung oder jedem Klick wieder
{let ct=0;const show=()=>{document.body.classList.remove('nocur');clearTimeout(ct);if(isFS())ct=setTimeout(()=>{if(isFS())document.body.classList.add('nocur');},2500);};
 ['mousemove','mousedown','wheel','touchstart'].forEach(ev=>document.addEventListener(ev,show,{passive:true}));
 ['fullscreenchange','webkitfullscreenchange'].forEach(ev=>document.addEventListener(ev,show));}

// Nach dem Neuladen: zuletzt gekoppelten Trainer und Click automatisch wieder verbinden (ohne Auswahlfenster, wenn der Browser es erlaubt)
setTimeout(()=>{trainer.reconnect();click.reconnect();hrm.reconnect();},1500);

// E-Bike-Schalter auch in der oberen Leiste (neben Nightride): Kopie des Nightride-Knopfes, wird nach jedem Neuaufbau der Leiste ergaenzt
{const one=(act,key,text,on)=>{   // Knopf als Kopie des Nightride-Knopfes anlegen bzw. Beschriftung aktualisieren
   const src=hintEl.querySelector('[data-act="l"]');if(!src)return;
   let b=hintEl.querySelector('[data-act="'+act+'"]');
   if(!b){b=src.cloneNode(true);b.setAttribute('data-act',act);hintEl.querySelector('[data-act="'+(act==='t'?'l':'e')+'"]')?.after(b);if(!b.parentNode)src.after(b);}
   const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT),tn=[];while(w.nextNode())if(w.currentNode.nodeValue.trim())tn.push(w.currentNode);
   if(tn.length>=2){if(tn[0].nodeValue!==key)tn[0].nodeValue=key;if(tn[1].nodeValue!==text)tn[1].nodeValue=text;}
   else if(tn.length===1){const v=key+' '+text;if(tn[0].nodeValue!==v)tn[0].nodeValue=v;}
   b.classList.toggle('on',!!on);
 };
 const diffOne=()=>{   // Schwierigkeit: vier Knoepfe zu einem zusammenfassen, der beim Klick durchschaltet (wie Grafik)
   ['d1','d3','d4'].forEach(a=>{const x=hintEl.querySelector('[data-act="'+a+'"]');if(x&&x.style.display!=='none')x.style.display='none';});
   const b=hintEl.querySelector('[data-act="d2"]');if(!b)return;
   const w=document.createTreeWalker(b,NodeFilter.SHOW_TEXT),tn=[];while(w.nextNode())if(w.currentNode.nodeValue.trim())tn.push(w.currentNode);
   const key='S',text='Stufe '+DIFFN[diff];
   if(tn.length>=2){if(tn[0].nodeValue!==key)tn[0].nodeValue=key;if(tn[1].nodeValue!==text)tn[1].nodeValue=text;}
   else if(tn.length===1){const v=key+' '+text;if(tn[0].nodeValue!==v)tn[0].nodeValue=v;}
   b.classList.add('on');
 };
 hintEl.addEventListener('click',e=>{if(e.target.closest('[data-act="d2"]')){e.stopPropagation();setDiff(diff%4+1);diffOne();}},true);
 const ensure=()=>{one('e','E','E-Bike '+(EBIKE?'an':'aus'),EBIKE);one('t','T','Zeit '+(TODN[TODM]||''),false);diffOne();};
 new MutationObserver(ensure).observe(hintEl,{childList:true,subtree:true,characterData:true});
 hintEl.addEventListener('click',e=>{if(e.target.closest('[data-act="e"]')){toggleEbike();ensure();}else if(e.target.closest('[data-act="t"]')){todSet((TODM+1)%5);toastMsg('Tageszeit: '+TODN[TODM]);ensure();}});
 ensure();window.__ensureEbHint=ensure;setInterval(ensure,1000);}
