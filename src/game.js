// MIWORU by Wenn & Aber Bike Crew – Spielcode (Stand Prototyp 0.6).
// Noch eine einzige Datei; wird schrittweise in Module aufgeteilt (Strecke, Gelände, Vegetation, Figuren, HUD).
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import './style.css';
import { makeVan } from './van.js';
import { makeGroup, GROUP_COLORS } from './group.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Trainer, ClickPad, BLE_OK } from './ble.js';
import MITT1 from './routes/mittwochsrunde.json';
import MIW from './routes/miworu.json';
import BUE from './routes/buellberg.json';
import WUP from './routes/wuppertal.json';
import ISE from './routes/iserlohn.json';
import HEM from './routes/hemer.json';
import HAG from './routes/hagen.json';
import DOR from './routes/dortmund.json';
import { parseGpx, listRoutes, loadRoute, saveRoute, renameRoute, deleteRoute } from './gpx.js';
const SURF_FILES=import.meta.glob('./routes/*.surf.json');   // Streckendaten werden pro Strecke nachgeladen (nicht mehr alle im Startpaket)
// Strecke: Standard ist die Tour vom 5.10.2022 (komoot-GPX); ?route=mittwoch bzw. ?route=halde nur zum Entwickeln
const ROUTES={mittwoch:{data:MITT1,label:'Mittwochsrunde',surf:'mittwochsrunde',btn:'Mittwochsrunde'},tour2:{data:MIW,label:'MIWORU',surf:'miworu',btn:'MIWORU',nhn0:MIW.nhn0,place:'Bergkamen',dem:'miworu'},wuppertal:{data:WUP,label:'Wuppertal',surf:'wuppertal',btn:'Wuppertal',nhn0:WUP.nhn0,place:'Wuppertal',dem:'wuppertal'},hagen:{data:HAG,label:'Hagen',surf:'hagen',btn:'Hagen',nhn0:HAG.nhn0,place:'Hagen',dem:'hagen'},iserlohn:{data:ISE,label:'Iserlohn',surf:'iserlohn',btn:'Iserlohn',nhn0:ISE.nhn0,place:'Iserlohn',dem:'iserlohn'},hemer:{data:HEM,label:'Hemer',surf:'hemer',btn:'Hemer',nhn0:HEM.nhn0,place:'Hemer',dem:'hemer'},buellberg:{data:BUE,label:'Böllberg',surf:'buellberg',btn:'Böllberg',nhn0:BUE.nhn0,place:'Böllberg',dem:'buellberg'},dortmund:{data:DOR,label:'Dortmund',surf:'dortmund',btn:'Dortmund',nhn0:DOR.nhn0,place:'Dortmund',dem:'dortmund'}};
const RKEY=new URLSearchParams(location.search).get('route');
const GPX_ID=RKEY&&RKEY.indexOf('gpx_')===0?RKEY.slice(4):null,CUSTOM=GPX_ID?loadRoute(GPX_ID):null;   // vom Nutzer hochgeladene GPX-Strecke (nur im Browser gespeichert)
if(CUSTOM)ROUTES[RKEY]={data:CUSTOM,label:CUSTOM.name||'Eigene Strecke',surf:'__eigene',btn:CUSTOM.name,custom:true,nhn0:CUSTOM.nhn0||0,place:'Eigene GPX-Strecke'};
// Doppelte aufraeumen: eigene GPX-Strecken mit dem Namen einer festen Strecke (Hagen, Iserlohn, Wuppertal, MIWORU) loeschen
try{listRoutes().forEach(e=>{const nm=String(e.name||'').trim().toLowerCase();if(e.id!==GPX_ID&&['hagen','iserlohn','wuppertal','miworu','hemer','buellberg','dortmund'].indexOf(nm)>=0)deleteRoute(e.id);});}catch(e){}
const RT=RKEY==='halde'?null:(ROUTES[RKEY]||ROUTES.tour2);   // Standard: die Tour vom 5.10.2022; andere Strecken nur noch per URL (?route=halde|mittwoch) für Entwicklung
const ROUTE=!!RT,MITT=RT?RT.data:MITT1;
// Echtes Geländemodell (DGM1 NRW, per npm run terrain erzeugt): Höhenraster in Dezimetern
const TERR=[];   // Gelaendekacheln (fuer die Bodenhoehe der Autos)
const BOOT=(t,p)=>{const m=document.getElementById('bootmsg'),b=document.querySelector('#bootbar i');if(m)m.textContent=t;if(b&&p!==undefined)b.style.width=p+'%';return new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0)));};
await BOOT('Lade Streckendaten …',5);
const GEL_F=import.meta.glob('./routes/*gelaende.json'),OSM_F=import.meta.glob('./routes/*umgebung.json'),LOD2_F=import.meta.glob('./routes/*.lod2.json'),CAN_F=import.meta.glob('./routes/*.canopy.json'),R1_F=import.meta.glob('./routes/*.dgm1.json'),STR_F=import.meta.glob('./routes/*.strassen.json'),OBJ_F=import.meta.glob('./routes/*.objekte.json'),DOP_J=import.meta.glob('./routes/*.dop.json'),DOP_I=import.meta.glob('./routes/*.dop-*.jpg',{eager:true,query:'?url',import:'default'});
const DATA_KEY=(F,_,ext)=>Object.keys(F).find(k=>k.split('/').pop()===((RT&&RT.dem)?RT.dem+'.'+ext:ext));   // Standard: gelaende.json / umgebung.json; eigene Strecken: <name>.gelaende.json / <name>.umgebung.json
const LZ=async(F,ext)=>{const k=DATA_KEY(F,0,ext);if(!k)return null;const m=await F[k]();return m.default||m;};
const _OK=!!RT&&!RT.custom;
const [GEL_RAW,OSM_RAW,LOD2_RAW,CAN_RAW,R1_RAW,OBJ_RAW,DOP_RAW,SURF_RAW,STR_RAW]=await Promise.all([LZ(GEL_F,'gelaende.json'),_OK?LZ(OSM_F,'umgebung.json'):null,_OK?LZ(LOD2_F,'lod2.json'):null,_OK?LZ(CAN_F,'canopy.json'):null,_OK?LZ(R1_F,'dgm1.json'):null,_OK?LZ(OBJ_F,'objekte.json'):null,_OK?LZ(DOP_J,'dop.json'):null,
  (async()=>{if(!RT)return null;const ov=Object.keys(SURF_FILES).find(k=>k.indexOf('/'+RT.surf+'.surf')>=0);if(!ov)return null;const m=await SURF_FILES[ov]();return m.default||m;})(),_OK?LZ(STR_F,'strassen.json'):null]);
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
const smoothS=u=>u*u*(3-2*u),tabH=s=>{for(let i=0;i<TABS.length;i++){const t=TABS[i],u=s-t.s0;if(u<0)return 0;if(u>9.2)continue;return u<3.2?t.H*smoothS(u/3.2):u<5.6?t.H:t.H*(1-smoothS((u-5.6)/3.6));}return 0;};
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
if(ROUTE&&!CUS&&STR_RAW){   // echte Fahrbahnbreite aus den amtlichen Flaechen (ALKIS): quer zur Strecke messen
  const G=24,gm=new Map(),polys=STR_RAW.polys,bbs=polys.map(P=>{let a=1e9,b=1e9,c=-1e9,d=-1e9;for(let i=0;i<P.length;i+=2){a=Math.min(a,P[i]);c=Math.max(c,P[i]);b=Math.min(b,P[i+1]);d=Math.max(d,P[i+1]);}return [a,b,c,d];});
  polys.forEach((P,k)=>{const b=bbs[k];for(let cx=Math.floor(b[0]/G);cx<=Math.floor(b[2]/G);cx++)for(let cz=Math.floor(b[1]/G);cz<=Math.floor(b[3]/G);cz++){const key=cx*100000+cz;(gm.get(key)||gm.set(key,[]).get(key)).push(k);}});
  const inR=(x,z)=>{const l=gm.get(Math.floor(x/G)*100000+Math.floor(z/G));if(!l)return false;
    for(const k of l){const b=bbs[k];if(x<b[0]||x>b[2]||z<b[1]||z>b[3])continue;const P=polys[k];let c=false;for(let u=0,w=P.length-2;u<P.length;w=u,u+=2){if((P[u+1]>z)!==(P[w+1]>z)&&x<(P[w]-P[u])*(z-P[u+1])/(P[w+1]-P[u+1])+P[u])c=!c;}if(c)return true;}return false;};
  let nm=0;
  for(let i=0;i<=N;i++){if(SEC[i]!==0)continue;
    const a=Math.max(0,i-1),b=Math.min(N,i+1),dx=PX[b]-PX[a],dz=PZ[b]-PZ[a],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
    let o0=null;for(let k=0;k<=8&&o0===null;k++){for(const sg of [1,-1]){const o=k*0.5*sg;if(inR(PX[i]+nx*o,PZ[i]+nz*o)){o0=o;break;}}}
    if(o0===null)continue;
    let r=o0,q=o0;while(r<o0+9&&inR(PX[i]+nx*(r+0.5),PZ[i]+nz*(r+0.5)))r+=0.5;while(q>o0-9&&inR(PX[i]+nx*(q-0.5),PZ[i]+nz*(q-0.5)))q-=0.5;
    HW[i]=Math.max(1.5,Math.min(6,(r-q)/2));nm++;}
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
const renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
renderer.outputEncoding=THREE.sRGBEncoding;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=0.95;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const scene=new THREE.Scene();
const HORIZON=new THREE.Color(0.62,0.74,0.86);
scene.background=HORIZON;
scene.fog=new THREE.FogExp2(HORIZON,0.00055);
const camera=new THREE.PerspectiveCamera(64,16/9,0.4,6000);
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
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();
// Qualitaetsstufen (Taste Q): Aufloesung, Schattenkarte
const TILES=[];const TREE_FAR=[0,300,560,950];let GRS=null;   // Sichtweite fuer Baum-/Buschkacheln je Qualitaetsstufe (m)
const QN={1:'Niedrig',2:'Mittel',3:'Hoch'};let quality=2;try{quality=clamp(+localStorage.getItem('miworu_q')||2,1,3);}catch(e){}
function applyQ(){
  const dpr=window.devicePixelRatio||1;
  renderer.setPixelRatio([0,Math.min(dpr,0.7),Math.min(dpr,1.25),Math.max(Math.min(dpr,2),1.5)][quality]);   // Niedrig bewusst weich, Hoch mit Supersampling
  scene.fog.density=[0,0.0009,0.00055,0.0004][quality];                                                        // Niedrig: naeher Dunst, spart Fernsicht
  sun.castShadow=quality>1;if(GRS)GRS.visible=quality>1;                                                       // Niedrig: keine Schatten, kein Gras
  const sz=[0,1024,2048,4096][quality];
  if(sun.shadow.mapSize.x!==sz){sun.shadow.mapSize.set(sz,sz);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  resize();
}
applyQ();
function cycleQ(){quality=quality%3+1;try{localStorage.setItem('miworu_q',quality);}catch(_){}applyQ();toastEl.textContent='Grafik: '+QN[quality];toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1100);}

// ================= Himmel =================
const sky=new THREE.Mesh(new THREE.SphereGeometry(4500,32,16),new THREE.ShaderMaterial({
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
  ' col+=sunCol*(pow(sd,350.0)*6.0+pow(sd,12.0)*0.25);',
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

// Sonnenstand nach Uhrzeit (nur Bergkamen). Nie dunkler als leichte Daemmerung: unter ~5 Grad Sonnenhoehe bleibt das Licht auf diesem Niveau.
// Test: ?zeit=7.5 (Uhrzeit in Stunden, lokale Zeit)
let _sunMin=-1;
function applySun(force){
  if(!BK)return;
  const d=new Date(),mn=Math.floor(d.getTime()/60000);if(!force&&mn===_sunMin)return;_sunMin=mn;
  let utc=d.getUTCHours()+d.getUTCMinutes()/60;
  const zp=new URLSearchParams(location.search).get('zeit');if(zp!==null&&!isNaN(+zp))utc=+zp+d.getTimezoneOffset()/60;
  const doy=Math.floor((Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())-Date.UTC(d.getUTCFullYear(),0,0))/864e5);
  const phi=51.6*Math.PI/180,dec=23.44*Math.PI/180*Math.sin(2*Math.PI*(284+doy)/365),H=((utc+7.6/15)%24-12)*15*Math.PI/180;
  const sa=Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(H),alt=Math.asin(clamp(sa,-1,1));
  let A=Math.acos(clamp((Math.sin(dec)-Math.sin(phi)*sa)/(Math.cos(phi)*Math.cos(alt)+1e-6),-1,1));if(H>0)A=2*Math.PI-A;   // Azimut ab Nord, im Uhrzeigersinn
  const altE=Math.max(alt,5*Math.PI/180),ca=Math.cos(altE);
  SUN.set(ca*Math.sin(A),Math.sin(altE),-ca*Math.cos(A)).normalize();
  const deg=alt*180/Math.PI,low=1-sstep(6,32,deg),tw=sstep(-4,5,deg);   // low: tiefe Sonne (warm), tw: 1 = Tag, 0 = Daemmerung
  const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  let sc=mixc([1.0,0.9,0.78],[1.0,0.58,0.34],low);sc=mixc([0.62,0.52,0.7],sc,tw);
  const inten=(0.95+1.55*sstep(4,30,deg))*(0.72+0.28*tw);
  sun.color.setRGB(sc[0],sc[1],sc[2]);sun.intensity=Math.max(1.35,inten);
  let hs=mixc([0.72,0.84,1.0],[0.88,0.72,0.66],low*0.7);hs=mixc([0.46,0.52,0.78],hs,tw);
  hemi.color.setRGB(hs[0],hs[1],hs[2]);hemi.groundColor.setRGB(0.34-0.1*(1-tw),0.31-0.1*(1-tw),0.22-0.02*(1-tw));hemi.intensity=0.8*(0.86+0.14*tw);
  renderer.toneMappingExposure=0.95*(1.0+0.12*(1-tw));
  let hor=mixc([0.62,0.74,0.86],[0.9,0.64,0.5],low*0.8);hor=mixc([0.42,0.45,0.66],hor,tw);
  let zen=mixc([0.10,0.27,0.60],[0.14,0.25,0.52],low);zen=mixc([0.12,0.15,0.36],zen,tw);
  const u=sky.material.uniforms;u.horCol.value.set(hor[0],hor[1],hor[2]);u.zenCol.value.set(zen[0],zen[1],zen[2]);u.sunCol.value.set(sc[0],sc[1]*0.95,sc[2]*0.85);
  const ct=mixc([1,0.82,0.7],[1,1,1],1-low);u.cloudTint.value.set(ct[0]*(0.75+0.25*tw),ct[1]*(0.78+0.22*tw),ct[2]*(0.85+0.15*tw));
  scene.fog.color.setRGB(hor[0],hor[1],hor[2]);scene.background=scene.background&&scene.background.isColor?new THREE.Color(hor[0],hor[1],hor[2]):scene.background;
  window.__sun={alt:deg,az:A*180/Math.PI,utc:utc};
}
if(BK)applySun(true);

// ================= Foto-Assets (optional; ohne Dateien bleibt alles prozedural) =================
const ASSETS=import.meta.env.BASE_URL+'assets/';
const TL=new THREE.TextureLoader();
function photo(id,karte,srgb,cb){
  TL.load(ASSETS+'textures/'+id+'/'+karte+'.jpg',t=>{t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(srgb)t.encoding=THREE.sRGBEncoding;cb(t);},undefined,()=>{});
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
  if(!BK){scene.background=tex;sky.visible=false;}
  hemi.intensity=0.5;if(BK)applySun(true);
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
        if(SURF[i]===2)c=mix3(c,cDirt,(1-sstep(HW[i],HW[i]+2.2,d))*0.9);
        else if(ROUTE&&SURF[i]===1)c=mix3(c,cDirt,(1-sstep(HW[i],HW[i]+2.2,d))*0.8);
        else c=mix3(c,cGravel,(1-sstep(HW[i]+0.4,HW[i]+2.8,d))*0.9);
      }
      if(found&&ROUTE&&GR[i]<-12){c=mix3(c,cDirt,(1-sstep(HW[i]+0.5,HW[i]+3.4,d))*0.9);M[vi]=Math.min(M[vi],0.12);}   // steile Abfahrt: Weg/Boeschung immer als Erde, nie als gruene Flaeche
      if(found&&STEEP[i]>0.02){   // steile Abfahrt: Laubstreu, nackte Erde, Steinflecken statt einheitlich dunkel
        const wR=STEEP[i]*(1-sstep(HW[i]*0.9,HW[i]+3.4,d));
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
  const tm=new THREE.MeshStandardMaterial({map:texGround,vertexColors:true,roughness:1,metalness:0});
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
const asphaltMat=new THREE.MeshStandardMaterial({map:texAsphalt,roughness:0.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
applyPhoto(asphaltMat,'asphalt_02',1,2,{arm:true,color:new THREE.Color(1.1,1.1,1.1)});
if(!ROUTE)ribbon(0,Math.min(N,iTrail+4),1,asphaltMat,8,0.05);
const trailMat=new THREE.MeshStandardMaterial({vertexColors:true,map:texDirt,roughness:1,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
applyPhoto(trailMat,'forest_ground_04',1,1.6,{arm:true,color:new THREE.Color(1.25,1.2,1.15),onDiffuse:()=>{
  trailMat.alphaMap=canvasTex(64,4,(g,w,h)=>{const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'#000');ag.addColorStop(0.3,'#fff');ag.addColorStop(0.7,'#fff');ag.addColorStop(1,'#000');g.fillStyle=ag;g.fillRect(0,0,w,h);},true);
  trailMat.alphaMap.encoding=THREE.LinearEncoding;trailMat.needsUpdate=true;}});
if(!ROUTE)ribbon(iTrail-2,N,1.7,trailMat,5,0.07);
else{
  const gravelMat=new THREE.MeshStandardMaterial({vertexColors:true,map:texDirt,roughness:1,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  applyPhoto(gravelMat,'forest_ground_04',1,1.6,{arm:true,color:new THREE.Color(1.65,1.58,1.45),onDiffuse:()=>{
    gravelMat.alphaMap=canvasTex(64,4,(g,w,h)=>{const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'#000');ag.addColorStop(0.25,'#fff');ag.addColorStop(0.75,'#fff');ag.addColorStop(1,'#000');g.fillStyle=ag;g.fillRect(0,0,w,h);},true);
    gravelMat.alphaMap.encoding=THREE.LinearEncoding;gravelMat.needsUpdate=true;}});
  surfRuns((sf,a,b)=>{ribbon(Math.max(0,a-2),Math.min(N,b+2),sf===0?1:(sf===1?1.5:1.7),sf===0?asphaltMat:(sf===1?gravelMat:trailMat),sf===0?8:5,sf===0?0.05:0.07);});
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
const leafDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:texLeaf,alphaTest:0.35});
const grassMat=new THREE.MeshLambertMaterial({map:texGrass,alphaTest:0.3});
const trunkGeo=new THREE.CylinderGeometry(0.6,1,1,6,1,true);trunkGeo.translate(0,0.5,0);
const trunkMat=new THREE.MeshLambertMaterial({color:C(0x6a5f52)});
applyPhoto(trunkMat,'tree_bark_03',2,7,{normal:false,color:new THREE.Color(0.75,0.72,0.7)});
const DUM=new THREE.Object3D(),TC=new THREE.Color();
// Baumart je Strecke: Wuppertal/Hagen/Iserlohn dichte Fichten (Nadelwald), Bergkamen Birken; andere Strecken wie bisher
const SPEC=(RT&&['wuppertal','hagen','iserlohn','hemer'].indexOf(RT.dem)>=0)?'fir':(RT===ROUTES.tour2?'birch':null);
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
const firMat=new THREE.MeshLambertMaterial({map:texFir,side:THREE.DoubleSide});
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
    let H=(7+rnd()*7)*scale,cw=(3.6+rnd()*3.4)*scale,ch=H*(0.5+rnd()*0.18);
    if(SPEC==='fir'){H=(15+rnd()*11)*scale;cw=(3.2+rnd()*2.0)*scale;ch=Math.max(H*0.3,Math.min(H*(0.84+rnd()*0.08),H-4.3));}   // Nadeln erst ab ca. 4 m Hoehe: man faehrt unter den Aesten durch
    else if(SPEC==='birch'){H=(9+rnd()*6)*scale;cw=(2.8+rnd()*2.2)*scale;ch=H*(0.5+rnd()*0.15);}
    if(SPEC==='fir'&&nearest(allHash,x,z)&&nD<10)cw*=0.7;
    if(nearest(allHash,x,z)&&(ROUTE?SURF[nI]===2:nI>=iTrail-3)&&nD<8){H=Math.max(H,9+rnd()*3);ch=Math.min(ch,H-4.8);}
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
      g.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,30,0),T*0.75+50);
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
      if(rnd()<Math.min(1,pr*(0.8+0.5*stp))){
        const hw=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7)*0.9,o0=-hw*(0.7+rnd()*0.3),o1=hw*(0.7+rnd()*0.3),Lf=o1-o0,L=Lf*(0.45+rnd()*0.5),oc=rnd()<0.5?o0+L/2:o1-L/2,sk=(rnd()-0.5)*0.9;
        const x=PX[i]+rx*oc,z=PZ[i]+rz*oc;
        const rr=0.04+rnd()*0.05+stp*(0.03+rnd()*0.07);BUMPS.push({s:i*SEG,o0:o0-0.1,o1:o1+0.1,a:0.45+rnd()*0.35+rr*1.5});roots.push({x:x,y:gnd(x,z)+rr*0.4,z:z,L:L/Math.cos(sk),r:rr,a:Math.atan2(-rz,rx)+sk,t:rnd()});
        if(rnd()<0.4+0.4*stp){const x2=x+Math.sin(h)*0.5,z2=z+Math.cos(h)*0.5;roots.push({x:x2,y:gnd(x2,z2)+0.03,z:z2,L:L*0.6,r:0.025+rnd()*0.03+stp*0.05,a:Math.atan2(-rz,rx)+sk+(rnd()-0.5)*0.6,t:rnd()});}
        if(stp>0.4&&rnd()<0.55){   // Wurzelverzweigung: kurzer dicker Ast längs/schräg zum Weg
          const ob=(rnd()*2-1)*hw*0.6,x3=PX[i]+rx*ob,z3=PZ[i]+rz*ob,rb=0.04+rnd()*0.08*stp+0.03;
          roots.push({x:x3,y:gnd(x3,z3)+rb*0.4,z:z3,L:0.5+rnd()*1.1,r:rb,a:Math.atan2(-rz,rx)+Math.PI/2+(rnd()-0.5)*1.1,t:rnd()});
        }
      }
      if(ROUTE&&SURF[i]>=1&&dn>=5&&(FEAT.length===0||i*SEG-FEAT[FEAT.length-1].s>(FEAT[FEAT.length-1].k==='j'?120:22))){   // Abfahrten: Kanten, kleine Drops und ab und zu ein Sprung
        const kv=Math.abs(KV[i]),r=rnd(),pd=Math.min(1,dn/12);
        if(kv<0.02&&SURF[i]===2&&dn<=16&&dn>=4&&r<0.02*pd&&i*SEG>40){const H=0.4+rnd()*0.15,s0=i*SEG;TABS.push({s0:s0,H:H});FEAT.push({s:s0+5.6,k:'j',a:1});}   // Table: Anfahrt, Plateau, Landung
        else if(r<0.012*pd+0.004){const big=rnd()<0.3,a=big?1.5+rnd()*0.8:0.7+rnd()*0.6;FEAT.push({s:i*SEG,k:'e',a:a});   // Kante/Drop: quer liegende Steinplatte oder Absatz
          const hh=HS[i],ox=(rnd()-0.5)*hw0(i)*0.5,x=PX[i]-Math.cos(hh)*ox,z=PZ[i]+Math.sin(hh)*ox;edges.push({x:x,y:gnd(x,z),z:z,h:hh,w:big?1.3:0.8});}
      }
      const ns=Math.round(pr*(3+rnd()*6)*(1+0.5*stp));
      for(let k=0;k<ns;k++){
        const hw=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7),o=(rnd()*2-1)*hw*(rnd()<0.7?0.95:1.6),x=PX[i]+rx*o+Math.sin(h)*(rnd()-0.5)*SEG,z=PZ[i]+rz*o+Math.cos(h)*(rnd()-0.5)*SEG;
        const w=0.05+Math.pow(rnd(),2.4)*0.17;
        if(w>0.07)BUMPS.push({s:i*SEG+(rnd()-0.5)*SEG*0.8,o0:o-0.3-w,o1:o+0.3+w,a:0.15+w*3});
        const hh=w*(0.35+rnd()*0.3);stones.push({x:x,y:gnd(x,z)-hh*(0.2+rnd()*0.3),z:z,w:w*(0.8+rnd()*0.6),hh:hh,t:rnd()});   // zum Teil im Waldboden versunken
        if(w>0.11&&rnd()<0.6){for(let q=0;q<1+(rnd()*2|0);q++){const ax=x+(rnd()-0.5)*0.5,az=z+(rnd()-0.5)*0.5,w2=w*(0.3+rnd()*0.4),h2=w2*(0.4+rnd()*0.3);stones.push({x:ax,y:gnd(ax,az)-h2*0.3,z:az,w:w2,hh:h2,t:rnd()});}}   // kleine Begleitsteine
      }
    }
    const rm=new THREE.InstancedMesh(rootG,new THREE.MeshStandardMaterial({roughness:1,color:0xffffff,map:barkTex,side:THREE.DoubleSide}),Math.max(1,roots.length));rm.count=roots.length;
    roots.forEach((r,i)=>{DUM.rotation.set(0,r.a,0);DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.L,r.r,r.r);DUM.updateMatrix();rm.setMatrixAt(i,DUM.matrix);rm.setColorAt(i,TC.setRGB(0.36+r.t*0.4,0.32+r.t*0.32,0.28+r.t*0.24));});
    rm.castShadow=false;rm.receiveShadow=true;rm.frustumCulled=false;scene.add(rm);
    const sm=new THREE.InstancedMesh(stoneG,new THREE.MeshStandardMaterial({roughness:0.95,color:0xffffff,flatShading:true}),Math.max(1,stones.length));sm.count=stones.length;
    stones.forEach((r,i)=>{DUM.rotation.set((rnd()-0.5)*0.5,rnd()*6.283,(rnd()-0.5)*0.5);DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.w,r.hh,r.w*(0.6+rnd()*0.6));DUM.updateMatrix();sm.setMatrixAt(i,DUM.matrix);const c=0.10+r.t*0.15,q=(r.t*977)%1;sm.setColorAt(i,q<0.32?TC.setRGB(c*0.7,c*0.95,c*0.5):q<0.45?TC.setRGB(c*1.15,c*0.95,c*0.72):TC.setRGB(c*1.05,c*1.02,c*0.95));});
    sm.castShadow=true;sm.receiveShadow=true;sm.frustumCulled=false;scene.add(sm);
    BUMPS.sort((a,b)=>a.s-b.s);FEAT.sort((a,b)=>a.s-b.s);
    if(TABS.length){   // Tables als Erdhuegel mit Rampe, Plateau und Landung
      const P=[],U=[],I=[],S={};let vi=0;
      TABS.forEach(t=>{const n=Math.round(9.2/0.4);
        for(let k=0;k<=n;k++){const ss=t.s0+k*0.4,hh=tabH(ss);sample(ss,S);const ii=Math.min(N-1,Math.floor(ss/SEG)),hw=Math.max(1.1,Math.min(1.5,HW[ii]*0.9)),rx=-Math.cos(S.h),rz=Math.sin(S.h);
          [[-(hw+0.8),0],[-hw,1],[hw,1],[hw+0.8,0]].forEach(q=>{const x=S.x+rx*q[0],z=S.z+rz*q[0];P.push(x,gnd(x,z)+(q[1]?hh+0.02:-0.04),z);U.push(q[0]/2,ss/2);});
          if(k<n){const b0=vi;for(let c=0;c<3;c++){I.push(b0+c,b0+c+4,b0+c+1,b0+c+1,b0+c+4,b0+c+5);}}
          vi+=4;}
      });
      const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(P,3));tg.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));tg.setIndex(I);tg.computeVertexNormals();
      const tm2=new THREE.Mesh(tg,new THREE.MeshStandardMaterial({map:texGround,color:0x5a4430,roughness:1,side:THREE.DoubleSide}));tm2.receiveShadow=true;tm2.castShadow=false;tm2.frustumCulled=false;scene.add(tm2);
    }
    if(edges.length){const em=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({roughness:0.95,color:0x4f4b43}),edges.length);   // Steinplatte/Absatz quer zum Weg
      edges.forEach((e,i)=>{DUM.rotation.set((rnd()-0.5)*0.12,e.h+Math.PI/2+(rnd()-0.5)*0.4,(rnd()-0.5)*0.12);DUM.position.set(e.x,e.y+0.02,e.z);DUM.scale.set(0.5+rnd()*0.3,0.09+rnd()*0.07,e.w);DUM.updateMatrix();em.setMatrixAt(i,DUM.matrix);});em.receiveShadow=true;em.castShadow=true;em.frustumCulled=false;scene.add(em);}
    window.__rs={roots:roots.length,stones:stones.length};
  }
  // Pfuetzen (spiegeln den Himmel) und Herbstlaub auf/neben dem Weg
  {
    const hwOf=i=>HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7);
    const pud=[],leaves=[];
    for(let i=2;i<N-2;i++){
      const h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),hw=hwOf(i),dirt=!ROUTE||SURF[i]>0;
      if(dirt&&Math.abs(GR[i])<3&&rnd()<0.06){
        const o=(rnd()*2-1)*hw*0.55,x=PX[i]+rx*o,z=PZ[i]+rz*o,a=0.9+rnd()*1.6;
        pud.push({x:x,y:gnd(x,z),z:z,a:a,b:a*(0.35+rnd()*0.4),r:-h+(rnd()-0.5)*0.5});
      }
      const nl=dirt?5:2;
      for(let k=0;k<nl;k++){
        const o=(rnd()<0.6?(rnd()<0.5?-1:1)*(hw*(0.7+rnd()*1.6)):(rnd()*2-1)*hw*1.1),al=(rnd()-0.5)*SEG;
        const x=PX[i]+rx*o+Math.sin(h)*al,z=PZ[i]+rz*o+Math.cos(h)*al;
        leaves.push({x:x,y:gnd(x,z)+0.03,z:z,s:0.13+rnd()*0.2,r:rnd()*6.283,t:rnd()});
      }
    }
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
    watM.envMapIntensity=2.4;watM.userData.keepEnv=true;
    const mud=new THREE.InstancedMesh(pg2,mudM,Math.max(1,pud.length)),wat=new THREE.InstancedMesh(pg2,watM,Math.max(1,pud.length));
    mud.count=wat.count=pud.length;
    pud.forEach((p,i)=>{
      DUM.rotation.set(0,p.r,0);DUM.position.set(p.x,p.y+0.085,p.z);DUM.scale.set(p.a*1.45,1,p.b*1.45);DUM.updateMatrix();mud.setMatrixAt(i,DUM.matrix);
      DUM.position.y=p.y+0.095;DUM.scale.set(p.a,1,p.b);DUM.updateMatrix();wat.setMatrixAt(i,DUM.matrix);
    });
    mud.frustumCulled=wat.frustumCulled=false;mud.renderOrder=2;wat.renderOrder=3;scene.add(mud);scene.add(wat);
    // Laub: kleine flache Blaetter, Herbstfarben
    const lg=new THREE.PlaneGeometry(1,1);lg.rotateX(-Math.PI/2);
    const lt=canvasTex(64,64,(g,w,h)=>{
      g.clearRect(0,0,w,h);g.translate(w/2,h/2);g.fillStyle='#fff';
      g.beginPath();g.moveTo(0,-26);g.bezierCurveTo(22,-14,22,14,0,26);g.bezierCurveTo(-22,14,-22,-14,0,-26);g.fill();
      g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1.6;g.beginPath();g.moveTo(0,-24);g.lineTo(0,26);for(let k=-16;k<=16;k+=8){g.moveTo(0,k);g.lineTo(9,k-7);g.moveTo(0,k);g.lineTo(-9,k-7);}g.stroke();
    });
    const lm=new THREE.InstancedMesh(lg,new THREE.MeshLambertMaterial({map:lt,alphaTest:0.5,side:THREE.DoubleSide}),Math.max(1,leaves.length));lm.count=leaves.length;
    const PAL=[[0.62,0.26,0.07],[0.72,0.40,0.09],[0.55,0.18,0.06],[0.60,0.50,0.14],[0.38,0.22,0.09],[0.45,0.30,0.10]];
    leaves.forEach((l,i)=>{
      DUM.rotation.set((rnd()-0.5)*0.35,l.r,(rnd()-0.5)*0.35);DUM.position.set(l.x,l.y,l.z);DUM.scale.set(l.s*0.7,1,l.s);DUM.updateMatrix();lm.setMatrixAt(i,DUM.matrix);
      const c=PAL[(l.t*PAL.length)|0],k=0.75+rnd()*0.5;lm.setColorAt(i,TC.setRGB(c[0]*k,c[1]*k,c[2]*k));
    });
    lm.receiveShadow=true;lm.frustumCulled=false;scene.add(lm);
    window.__fx={puddles:pud.length,leaves:leaves.length,at:pud.slice(0,40).map(p=>[p.x,p.z])};
  }
  window.__counts={trees:trees.length,bushes:bushes.length,tufts:tufts.length};
})();

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
function arch(i,txt,bg){
  const g=new THREE.Group();g.position.set(PX[i],PY[i],PZ[i]);g.rotation.y=HS[i];
  const w=HW[i]+0.9,mat=new THREE.MeshStandardMaterial({color:C(0x222428),roughness:0.6});
  [-1,1].forEach(s=>{const p=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,4.4,8),mat);p.position.set(s*w,2.2,0);p.castShadow=true;g.add(p);});
  const b=new THREE.Mesh(new THREE.PlaneGeometry(w*2,w*0.5),new THREE.MeshLambertMaterial({map:textTex(txt,bg,'#111'),side:THREE.DoubleSide}));
  b.position.y=4.4-w*0.25;b.rotation.y=Math.PI;b.castShadow=true;g.add(b);
  scene.add(g);
}
arch(6,'START','#f5a524');
arch(N-8,'ZIEL','#f5a524');
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
new GLTFLoader().load(ASSETS+'models/joggerin.glb',gltf=>{
  const fbx=gltf.scene,box=new THREE.Box3().setFromObject(fbx),h=box.max.y-box.min.y||170,k=1.68/h;
  const clip=gltf.animations[0];
  console.log('joggerin.glb geladen: Hoehe',h.toFixed(1),'Clips',gltf.animations.length,clip?clip.name+' '+clip.duration.toFixed(2)+'s':'-');
  joggers.forEach((j,n)=>{
    const m=SkeletonUtils.clone(fbx);
    m.scale.setScalar(k*(0.97+n*0.03));
    m.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
    j.body.visible=false;j.g.add(m);
    j.mixer=new THREE.AnimationMixer(m);
    if(clip){const a=j.mixer.clipAction(clip);a.play();a.time=n*0.37;}
  });
},undefined,e=>console.warn('joggerin.glb nicht geladen, Platzhalter bleiben',e&&e.message));
function resetJoggers(){joggers.forEach((j,n)=>{j.active=false;j.g.visible=false;j.wait=n===0?0.5:6+n*11;});}
function updateJoggers(dt){
  const sMax=ROUTE?TOTAL-40:(iTrail-30)*SEG;
  joggers.forEach(j=>{
    if(!j.active){
      j.wait-=dt;
      if(j.wait<=0){
        const s=st.pos+170+Math.random()*230;
        if(s<sMax&&SURF[Math.floor(s/SEG)]<2){j.s=s;j.x=-(0.85+Math.random()*0.6);j.active=true;j.g.visible=true;}
        else j.wait=4;
      }
      return;
    }
    j.s-=j.speed*dt;j.phase+=dt*9.5;
    if(j.s<st.pos-30||j.s<4||(ROUTE&&SURF[Math.floor(j.s/SEG)]===2)){j.active=false;j.g.visible=false;j.wait=7+Math.random()*16;return;}
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
await BOOT('Baue Häuser und Gewässer …',72);
// ================= Gebäude und Gewässer (OpenStreetMap) =================
if(OSM){
  // --- Fassaden- und Dachtexturen (im Code erzeugt, Kachel = 5 m breit x 6 m hoch bzw. 1,6 m Ziegelreihen) ---
  const mkTex=(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const tx=new THREE.CanvasTexture(c);tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.anisotropy=4;tx.encoding=THREE.sRGBEncoding;return tx;};
  const noise=(x,w,h,n,a)=>{for(let i=0;i<n;i++){const v=Math.random()<0.5?0:255;x.fillStyle='rgba('+v+','+v+','+v+','+(Math.random()*a)+')';x.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*2,1+Math.random()*2);}};
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
        x.fillStyle=gr;x.fillRect(cx-ww/2,y0,ww,wh);
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
  const uvWall=(g,plain,tw)=>{const p=g.attributes.position,nr=g.attributes.normal,bt=g.attributes.btop,uv=new Float32Array(p.count*2);
    for(let v=0;v<p.count;v++){
      if(plain||Math.abs(nr.getY(v))>0.5){uv[v*2]=0.03;uv[v*2+1]=0.03;continue;}   // Dachflaechen/Kappen: neutraler Fleck der Fassadentextur
      const nx=nr.getX(v),nz=nr.getZ(v),tx=-nz,tz=nx;uv[v*2]=(p.getX(v)*tx+p.getZ(v)*tz)/(tw||24);uv[v*2+1]=bt?1+Math.min(0,(p.getY(v)-bt.getX(v))/6):p.getY(v)/6;}   // Fensterreihen von der Traufe nach unten gezaehlt: nie von der Dachkante abgeschnitten

    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));if(bt)g.deleteAttribute('btop');};
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
    const wP=[],wC=[],wT=[],wP2=[],wC2=[],wT2=[],rP=[],rC=[],rU=[],rB=[];
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
    let curTop=0;const pushT=(arr,carr,V,t,col,sh)=>{t.forEach(tr=>tr.forEach(k=>{arr.push(V[k][0],V[k][1],V[k][2]);carr.push(col.r*sh,col.g*sh,col.b*sh);if(arr===wP)wT.push(curTop);else if(arr===wP2)wT2.push(curTop);}));};
    const flatC=new THREE.Color(0x5f5c59);
    LOD2.b.forEach(poly=>{
      {const fp=[];poly.forEach(f=>{if(f[0]==='g'){const q=f[1];for(let i=0;i<q.length/3;i++)fp.push(q[i*3],q[i*3+2]);}});if(ROUTE&&!CUS&&hitsRoute(fp))return;}
      const wc=wallC[(rnd()*wallC.length)|0],rc=roofC[(rnd()*roofC.length)|0],sh=0.92+rnd()*0.14,rb={a:rC.length,b:0,pts:[],sh:sh};
      {let tp=1e9,mx=-1e9;poly.forEach(f=>{if(f[0]!=='w')return;const q=f[1];let m=-1e9;for(let i=1;i<q.length;i+=3)m=Math.max(m,q[i]-NHN0);tp=Math.min(tp,m);mx=Math.max(mx,m);});curTop=tp<1e8?tp:mx;}
      let cwP=wP,cwC=wC;{const gf=poly.find(f=>f[0]==='g');if(gf){const q=gf[1],n=q.length/3;let ar=0,gy=1e9,cx=0,cz=0;for(let i=0;i<n;i++){const j=(i+1)%n;ar+=q[i*3]*q[j*3+2]-q[j*3]*q[i*3+2];gy=Math.min(gy,q[i*3+1]-NHN0);cx+=q[i*3];cz+=q[i*3+2];}ar=Math.abs(ar)/2;cx/=n;cz/=n;const H=curTop-gy,hs=Math.abs(Math.sin(cx*12.9898+cz*78.233)*43758.5453)%1;   // Hallen, Garagen, Gewerbe: ohne Fensterreihen
        if(ar>500||H<3.8||(H<9&&ar>300)||hs<0.2||(H>11&&ar<220&&H>2.2*Math.sqrt(ar))||H>26){cwP=wP2;cwC=wC2;}}}   // Traufhoehe: niedrigste Oberkante der Waende
      poly.forEach(f=>{
        const k=f[0],q=f[1],n=q.length/3,V=[];
        for(let i=0;i<n;i++)V.push([q[i*3],q[i*3+1]-NHN0,q[i*3+2]]);
        if(k==='g'){   // Grundriss: Sockelwaende bis unter das Gelaende, damit nichts schwebt
          for(let i=0;i<n;i++){const a=V[i],b=V[(i+1)%n],lo=Math.min(gnd(a[0],a[2]),gnd(b[0],b[2]),a[1],b[1])-0.6;
            const Q=[[a[0],a[1],a[2]],[b[0],b[1],b[2]],[b[0],lo,b[2]],[a[0],lo,a[2]]];pushT(cwP,cwC,Q,[[0,1,2],[0,2,3]],wc,sh*0.97);}
          return;
        }
        const T=triOf(V);
        if(k==='w'){pushT(cwP,cwC,V,T.t,wc,sh);return;}
        if(Math.abs(T.n[1])>0.97){pushT(cwP,cwC,V,T.t,flatC,sh);return;}   // Flachdach: dunkle Kappe
        // geneigte Dachflaeche: Ziegel-UV entlang Traufe (u) und Hang (v)
        const hl=Math.hypot(T.n[0],T.n[2])||1,tx=-T.n[2]/hl,tz=T.n[0]/hl,sx=T.n[1]*T.n[0]/hl,sz=T.n[1]*T.n[2]/hl,sy=-hl;
        rb.pts.push(V[0][0],V[0][2]);T.t.forEach(tr=>tr.forEach(i=>{const v=V[i];rP.push(v[0],v[1],v[2]);rC.push(rc.r*sh,rc.g*sh,rc.b*sh);rU.push((v[0]*tx+v[2]*tz)/1.6,(v[0]*sx+v[1]*sy+v[2]*sz)/1.6);}));
      });
      rb.b=rC.length;if(rb.b>rb.a)rB.push(rb);
    });
    if(wP.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(wP,3));g.setAttribute('color',new THREE.Float32BufferAttribute(wC,3));g.setAttribute('btop',new THREE.Float32BufferAttribute(wT,1));g.computeVertexNormals();uvWall(g,false);wallG.push(g);}
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
  const addMesh=(arr,map)=>{if(!arr.length)return;const mg=BufferGeometryUtils.mergeBufferGeometries(arr);const m=new THREE.Mesh(mg,new THREE.MeshStandardMaterial({map:map,vertexColors:true,roughness:0.88,metalness:0,side:THREE.DoubleSide}));m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;scene.add(m);};
  addMesh(wallG,facadeTex);addMesh(wallP,plainTex);addMesh(roofG,roofTex);
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
// ================= Zustand, Eingabe, Physik =================
const M=95,CDA=0.38,RHO=1.2,GRAV=9.81,PMAX=300,BRAKE=260;
const keys={};
let running=false,inputMode='keyboard',st,FPV=true;
const trainer=new Trainer(),click=new ClickPad();let paused=false,gear=0,bleMsg='',lastMenu=null;   // gear: virtuelle Schaltung = Widerstand in %-Steigung (+/-)
let gearUsed=false,toastT=0;
const DIFFN={1:'Leicht',2:'Normal',3:'Hardcore',4:'Eskalation',5:'Marvin'};
let diff=1;try{const v=+localStorage.getItem('miworu_diff');if(v>=1&&v<=5)diff=v;}catch(e){}   // Schwierigkeit: 1 Leicht (Steigungen zählen 40 %), 2 Normal
const gearF=()=>(gear<0?Math.pow(1.26,gear):1+gear*0.05)*(diff===1?0.4:(diff===3?1.5:(diff===4?1.2:(diff===5?1.56:1))));   // Faktor auf die Steigung: Gang x Schwierigkeit
function setDiff(d){diff=d;try{localStorage.setItem('miworu_diff',d);}catch(e){}gearHud.k=null;hintHud.k=null;toastEl.textContent='Schwierigkeit: '+DIFFN[d];toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),1200);}
const gearEl=document.getElementById('gear'),toastEl=document.getElementById('toast'),hintEl=document.getElementById('hint');
function shift(d){
  const ng=clamp(gear+d,-6,5);gearUsed=true;   // 12 Gänge: Stufen -6..5 = Anzeige 1..12
  const n=ng+7;
  if(ng===gear){toastEl.textContent=(d>0?'Schwerster Gang · ':'Leichtester Gang · ')+n;}
  else{gear=ng;SHK.vy+=0.12*d;toastEl.textContent=(d>0?'▲ ':'▼ ')+'Gang '+n+(d>0?' · schwerer':' · leichter');}
  toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),900);
}
function hintHud(){
  const key=diff+'|'+quality;if(hintHud.k===key)return;hintHud.k=key;
  hintEl.innerHTML=[1,2,3,4,5].map(n=>'<button type="button" data-act="d'+n+'"'+(diff===n?' class="on"':'')+'><b>'+(n===5?'M':n)+'</b>'+DIFFN[n]+'</button>').join('')+'<button type="button" data-act="q"><b>Q</b>Grafik '+QN[quality]+'</button>';
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
const bleChange=()=>{if(trainer.connected)inputMode='trainer';else if(inputMode==='trainer')inputMode='keyboard';const ck=click.connected+'|'+click.devs.length;if(bleKey.indexOf(ck)<0&&bleMsg.indexOf('Click')===0)bleMsg='';const k=trainer.connected+'|'+ck+'|'+bleMsg;if(k===bleKey)return;bleKey=k;if(ov.style.display!=='none'&&lastMenu&&!helpOpen)menu(lastMenu[0],lastMenu[1]);};
trainer.onChange=bleChange;click.onChange=bleChange;   // FPV: Cockpit-Ansicht aus Fahrersicht (Taste C wechselt)
const cockpitEl=document.getElementById('cockpit'),glowEl=document.getElementById('glow'),_cd=new THREE.Vector3(),_sv=new THREE.Vector3();
function reset(){SHK.y=SHK.vy=SHK.r=SHK.vr=0;SHK.i=0;SHK.fi=0;SHK.w=SHK.wv=0;SHK.air=null;st={pos:0,v:0,x:0.4,power:0,t:0,crank:0.6,wheel:0,lean:0,bar:0,pitch:0,done:false};resetJoggers();vanWait=12;VANS&&VANS.forEach(v=>{if(!v.parked){v.active=false;v.g.visible=false;}});}
reset();
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key)>=0)e.preventDefault();
  keys[e.key]=true;
  if(e.key==='r'||e.key==='R')start();
  if(e.key==='c'||e.key==='C')FPV=!FPV;
  if(e.key==='Escape')pauseGame();
  if(e.key==='q'||e.key==='Q')cycleQ();
  if(e.key==='1')setDiff(1);
  if(e.key==='2')setDiff(2);
  if(e.key==='3')setDiff(3);
  if(e.key==='4')setDiff(4);
  if(e.key==='m'||e.key==='M')setDiff(5);
  if(e.key==='+'||e.key==='PageUp')shift(1);
  if(e.key==='-'||e.key==='PageDown')shift(-1);
});
window.addEventListener('keyup',e=>{keys[e.key]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});

function update(dt){
  if(!running)return;
  const kb=inputMode==='keyboard';
  const up=kb&&keys.ArrowUp,down=kb&&keys.ArrowDown,left=kb&&keys.ArrowLeft,right=kb&&keys.ArrowRight;
  const i=Math.min(N-1,Math.floor(st.pos/SEG)),dirt=SURF[i]===2;
  const tr=inputMode==='trainer'&&trainer.connected;
  if(tr)st.power+=(trainer.power-st.power)*Math.min(1,dt*6);else st.power+=((up?PMAX:0)-st.power)*Math.min(1,dt*2.5);
  const gf=gearF();   // Gang x Schwierigkeit: Normal: leichtester Gang x0,25, schwerster x1,3; Leicht: alles x0,4
  const eg=Math.max(0,(GR[i]>0?GR[i]*gf+Math.max(0,gear)*0.15:Math.max(0,gear)*0.15*(GR[i]>-2?1:0))+(GR[i]>-2?(diff===3?0.8:diff===4?0.5:diff===5?0.65:0):0));   // Abfahrten neutral; Hardcore/Eskalation auch auf flachen Stuecken mit etwas Grundlast
  if(tr)trainer.setGrade(eg,(dirt?0.012:SURF[i]===1?0.009:0.005)*(diff===1?0.5:1));
  const climb=eg/100;            // Abfahrten neutral: zählen wie flach
  const v=st.v,vs=Math.max(v,0.55);   // kleine Mindestgeschwindigkeit: auch steile Rampen lassen sich aus dem Stand anfahren
  const fres=M*GRAV*((dirt?0.012:SURF[i]===1?0.009:0.005)+climb)+0.5*RHO*CDA*v*v+(down?BRAKE:0);
  const pf=[1,1.6,1,0.85,0.83,0.64][diff]||1;   // Schwierigkeit wirkt auf jeder Strecke: Leicht 1,6x Wirkung der Watt, Normal 1,0x (realistisch), Hardcore 0,85x, Eskalation 0,83x (20 % haerter)
  st.v=Math.max(0,v+(Math.min(st.power*pf/vs,420)-fres)/M*dt);   // Zugkraft am Hinterrad gedeckelt (Traktion)
  if(st.v<0.3&&eg>7&&st.power>15&&st.t-(update.hintT||-9)>7){update.hintT=st.t;toastEl.textContent='Zu steil für diese Leistung · "−" = leichterer Gang';toastEl.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>toastEl.classList.remove('on'),2600);}
  const off=Math.abs(st.x)>HW[i]+0.15;
  if(off)st.v*=Math.max(0,1-1.3*dt);
  const p0=st.pos;st.pos=Math.max(0,st.pos+st.v*dt);st.t+=dt;
  // Ruppeln: Wurzeln und Steine unter dem Rad geben Stöße, Schotter/Trail rauschen leicht
  while(SHK.i<BUMPS.length&&BUMPS[SHK.i].s<st.pos){
    const b=BUMPS[SHK.i++];
    if(b.s>=p0-0.01&&st.x>b.o0&&st.x<b.o1&&st.v>0.8){const f=0.5+0.5*Math.min(1,st.v/7);SHK.vy+=b.a*f*(rnd()<0.5?1:0.7);SHK.vr+=(rnd()-0.5)*b.a*f*5;}
  }
  while(SHK.fi<FEAT.length&&FEAT[SHK.fi].s<st.pos){   // Kanten, Drops und Sprung
    const f=FEAT[SHK.fi++];if(!(f.s>=p0-0.01&&st.v>2.2))continue;
    if(f.k==='e'){const a=f.a*(0.55+0.45*Math.min(1,st.v/9));SHK.vy+=a;SHK.vr+=(rnd()-0.5)*a*9;SHK.wv+=(rnd()<0.5?-1:1)*a*110;}
    else if(f.k==='j'&&!SHK.air&&st.v>4.5){SHK.air={t:0,T:clamp(0.28+st.v*0.022,0.4,0.7),H:clamp(0.07+st.v*0.011,0.12,0.28)};}
  }
  if(SHK.air){SHK.air.t+=dt;if(SHK.air.t>=SHK.air.T){const H=SHK.air.H;SHK.air=null;SHK.vy-=1.1*Math.min(1,H/0.3);SHK.vr+=(rnd()-0.5)*3;SHK.wv+=(rnd()<0.5?-1:1)*14*Math.min(1,H/0.3);}}
  SHK.wv+=(-900*SHK.w-9*SHK.wv)*dt;SHK.w+=SHK.wv*dt;   // Lenker flattert nach Stoessen
  SHK.vy+=(-420*SHK.y-17*SHK.vy)*dt;SHK.y+=SHK.vy*dt;SHK.vr+=(-380*SHK.r-16*SHK.vr)*dt;SHK.r+=SHK.vr*dt;
  const rough=(ROUTE?[0,0.4,1][SURF[i]]:(i>=iTrail?1:0.2))*(1+Math.max(0,-GR[i])*0.06)*Math.min(1,st.v/6);
  SHK.buzz=rough*(Math.sin(st.pos*9.3)+Math.sin(st.pos*17.9+1.3)*0.7+Math.sin(st.pos*31.7)*0.4);
  updateJoggers(dt);updateVans(dt);updateGroup(dt);
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
  st.lean+=((clamp((tx-st.x)*0.12,-0.1,0.1)-clamp(KV[i]*st.v*st.v*0.08,-0.35,0.35))-st.lean)*Math.min(1,dt*5);
  st.bar+=((clamp((tx-st.x)*6,-6,6)-clamp(KV[i]*600,-17,17))-st.bar)*Math.min(1,dt*6);   // Lenkereinschlag in Grad (Cockpit)
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
function drawHud(){
  const i=Math.min(N-1,Math.floor(st.pos/SEG));
  if(SEC[i]!==lastSec){lastSec=SEC[i];secEl.innerHTML=SECN[lastSec]+'<small>'+PLACE+'</small>';}
  spdEl.firstChild.nodeValue=(st.v*3.6).toFixed(0);
  gearHud();
  subEl.innerHTML='<b>'+Math.round(st.power)+' W</b>'+' · '+(GR[i]>=0?'+':'')+GR[i].toFixed(0)+' %'+(GR[i]>2&&Math.abs(GR[i]*gearF()-GR[i])>0.5?' (fühlt sich an wie '+(GR[i]*gearF()).toFixed(0)+' %)':'')+' · '+(NHN0+PY[i]).toFixed(0)+' m ü. NHN<br>'+(st.pos/1000).toFixed(2)+' / '+(TOTAL/1000).toFixed(2)+' km · '+fmtT(st.t);
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
  const base=[['tour2','MIWORU','Bergkamen'],['wuppertal','Wuppertal','Wuppertal und Umland'],['hagen','Hagen','Hagen und Umland'],['iserlohn','Iserlohn','Iserlohn und Umland'],['hemer','Hemer','Hemer und Umland'],['buellberg','Böllberg','Böllberg und Umland'],['dortmund','Dortmund','Dortmund und Umland']];
  let h='<div class="mine"><div class="mh">Strecken</div>'+base.map(b=>'<div class="mr'+(b[0]===cur?' cur':'')+'"><span class="mn">'+b[1]+'<small>'+b[2]+'</small></span>'+(b[0]===cur?'<span class="act">aktiv</span>':'<button class="sec" data-route="'+b[0]+'">Fahren</button>')+'</div>').join('');
  const L=listRoutes();
  if(L.length)h+='<div class="mh" style="margin-top:10px">Meine Strecken (GPX)</div>'+L.map(e=>'<div class="mr'+(e.id===GPX_ID?' cur':'')+'"><span class="mn">'+esc(e.name)+'<small>'+String(e.km).replace('.',',')+' km</small></span>'
    +(e.id===GPX_ID?'<span class="act">aktiv</span>':'<button class="sec" data-gpx-go="'+e.id+'">Fahren</button>')+'<button class="sec" data-gpx-ren="'+e.id+'" title="Umbenennen">✎</button><button class="sec" data-gpx-del="'+e.id+'" title="Löschen">🗑</button></div>').join('');
  return h+'</div>';
}
let helpOpen=false;
function showHelp(){
  helpOpen=true;ov.style.display='flex';
  ov.innerHTML='<div class="intro"><div class="panel">'+
    '<div class="by">by Wenn &amp; Aber Bike Crew</div><h1>So fährst du</h1>'+
    '<div class="help keys">'+
    '<div><b>↑</b> treten &nbsp;·&nbsp; <b>↓</b> bremsen &nbsp;·&nbsp; mit Trainer: einfach treten</div>'+
    '<div><b>+</b> / <b>−</b> (oder Bild↑/↓): Gang schwerer / leichter</div>'+
    '<div>Zwift Click (rechts): <b>+</b> kurz drücken = schwerer · gedrückt halten oder andere Taste = leichter</div>'+
    '<div><b>1</b> Leicht (1,6x Wirkung deiner Watt, Steigungen nur 40 %) · <b>2</b> Normal · <b>3</b> Hardcore (Steigungen 150 %, 0,85x Watt) · <b>4</b> Eskalation (20 % härter als realistisch) · <b>M</b> Marvin (30 % härter als Eskalation) · auch oben rechts antippbar</div>'+
    '<div><b>Q</b> Grafik: Niedrig / Mittel / Hoch · <b>C</b> Ansicht (Cockpit/Außen) · <b>R</b> Neustart · <b>Esc</b> Pause und Menü</div>'+
    '<div><b>Gruppenfahrt</b>: im Menü einen Gruppencode eingeben (alle Freunde denselben, dieselbe Strecke wählen). Mitfahrer erscheinen als farbige Punkte, in Minikarte und Profil immer.</div>'+
    '<div>Ins <b>Höhenprofil</b> klicken oder ziehen: an diese Stelle der Strecke springen</div>'+
    '<div class="note">Lenken und Ausweichen laufen automatisch. Abfahrten sind neutral: Tempo entsteht nur durchs Treten.</div></div>'+
    '<div class="btns"><button id="hback" class="main">← Zurück</button></div>'+
  '</div></div>';
  document.getElementById('hback').onclick=()=>{helpOpen=false;if(lastMenu)menu(lastMenu[0],lastMenu[1]);};
}
function menu(title,sub){
  helpOpen=false;lastMenu=[title,sub];menuBtn.style.display='none';
  ov.style.display='flex';hudBox.style.display=sub?'block':'none';
  const km=(TOTAL/1000).toFixed(1).replace('.',',');
  ov.innerHTML='<div class="intro">'+
    '<div class="poster"><img src="'+ASSETS+'ui/miworu.png" alt="MIWORU"></div>'+
    '<div class="panel">'+
      '<div class="by">by Wenn &amp; Aber Bike Crew</div>'+
      '<h1>MIWORU</h1>'+
      (sub?'<div class="res">'+sub+'</div>':'')+
      '<div class="route">'+(ROUTE?RT.label:TRACK_NAME)+'<span>'+(ROUTE&&RT.place?RT.place:'Bergkamen und Umland')+'</span></div>'+
      '<div class="stats"><div><b>'+km+'</b><i>km</i></div><div><b>'+HM+'</b><i>Höhenmeter</i></div></div>'+
      '<div class="btns"><button id="go" class="main">'+title+'</button>'+(paused||SAVED?'<button id="rst" class="sec">Neu starten</button>':'')+'<button id="trn" class="sec">'+(trainer.connected?'Trainer: '+trainer.name+' ✓':'Trainer koppeln')+'</button><button id="clk" class="sec">'+(()=>{const n=click.devs.filter(x=>!x.lost).length;return n>=2?'Zwift Click: beide Hälften ✓':n===1&&click.connected?'Zwift Click ✓ · zweite Hälfte koppeln (stabiler)':(click.devs.length?'Zwift Click: getrennt – neu koppeln':'Zwift Click koppeln');})()+'</button><button id="mode" class="sec">'+(inputMode==='keyboard'?'Tastatur: an':'Tastatur: aus')+'</button>'+'<button id="dif" class="sec">Schwierigkeit: '+DIFFN[diff]+'</button><button id="qual" class="sec">Grafik: '+QN[quality]+'</button><button id="grpb" class="sec">'+(GRP_CODE?'Gruppe: '+GRP_CODE:'Gruppenfahrt')+'</button><button id="gpx" class="sec">GPX-Strecke laden</button><button id="hlp" class="sec">So fährst du</button><input id="gpxf" type="file" accept=".gpx,.xml,application/gpx+xml" style="display:none"></div>'+mineHtml()+
      '<div class="help" id="blemsg">'+(trainer.connected?trainer.name+': '+trainer.status+' · '+Math.round(trainer.power)+' W':!BLE_OK?'Bluetooth nur in Chrome/Edge (nicht Safari).':'D100 oder KICKR einschalten, dann „Trainer koppeln“.')+(bleMsg?'<br>'+bleMsg:'')+''+(click.connected?'<br>'+click.name+' verbunden'+'<br>Click: kurz drücken = schwerer · gedrückt halten = leichter':'')+'</div>'+
    '</div></div>';
  const gpxf=document.getElementById('gpxf');
  const go=id=>{const q='?route=gpx_'+id;const same=location.search===q;location.href=location.pathname+q+'#go';if(same)location.reload();};
  document.getElementById('gpx').onclick=()=>gpxf.click();
  document.getElementById('dif').onclick=()=>{setDiff(diff%5+1);menu(title,sub);};
  document.getElementById('qual').onclick=()=>{cycleQ();menu(title,sub);};
  document.getElementById('grpb').onclick=()=>{const c=window.prompt('Gruppencode für die gemeinsame Fahrt (alle Freunde geben denselben Code ein, leer = aus):',GRP_CODE);if(c===null)return;GRP_CODE=c.trim().toLowerCase().replace(/[^a-z0-9äöüß]+/g,'').slice(0,24);try{localStorage.setItem('miworu_group',GRP_CODE);}catch(_){}grpJoin();menu(title,sub);};
  gpxf.onchange=async()=>{
    const f=gpxf.files&&gpxf.files[0];if(!f)return;
    bleMsg='GPX wird gelesen …';menu(title,sub);
    try{
      const r=parseGpx(await f.text(),f.name.replace(/\.[^.]+$/,'')),nm=window.prompt('Name der Strecke:',r.name);
      if(nm===null){bleMsg='';menu(title,sub);return;}
      go(saveRoute(r,nm||r.name));
    }catch(e){bleMsg='GPX: '+(e&&e.message||e);menu(title,sub);}
  };
  document.querySelectorAll('[data-gpx-go]').forEach(b=>b.onclick=()=>go(b.getAttribute('data-gpx-go')));
  document.querySelectorAll('[data-gpx-ren]').forEach(b=>b.onclick=()=>{const id=b.getAttribute('data-gpx-ren'),e=listRoutes().find(x=>x.id===id),nm=window.prompt('Neuer Name:',e?e.name:'');if(nm&&nm.trim()){renameRoute(id,nm);menu(title,sub);}});
  document.querySelectorAll('[data-gpx-del]').forEach(b=>b.onclick=()=>{const id=b.getAttribute('data-gpx-del'),e=listRoutes().find(x=>x.id===id);
    if(!window.confirm('Strecke „'+(e?e.name:'')+'“ wirklich löschen?'))return;
    deleteRoute(id);if(GPX_ID===id){location.href=location.pathname+'#go';location.reload();}else menu(title,sub);});
  document.getElementById('mode').onclick=()=>{inputMode=inputMode==='keyboard'?'off':'keyboard';menu(title,sub);};
  document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{const r=b.getAttribute('data-route');location.href=location.pathname+(r?'?route='+r:'')+'#go';});
  document.getElementById('trn').onclick=async()=>{bleMsg='';try{await trainer.connect();}catch(e){bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Trainer: '+(e&&e.message||e);}menu(title,sub);};
  document.getElementById('hlp').onclick=showHelp;
  document.getElementById('clk').onclick=async()=>{bleMsg='';try{await click.connect();}catch(e){click.dbg('Koppeln fehlgeschlagen: '+(e&&e.name||'')+' '+(e&&e.message||e));bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Click: '+(e&&e.message||e);}menu(title,sub);};
  document.getElementById('go').onclick=paused?resume:(SAVED?startSaved:start);
  const rst=document.getElementById('rst');if(rst)rst.onclick=start;
}
// Pause + Hauptmenue (Esc oder Menue-Knopf oben rechts, z. B. fuer iPad ohne Tastatur)
function pauseGame(){if(!running)return;running=false;paused=true;trainer.setGrade(0,0.005,true);offEl.style.display='none';menu('Weiterfahren','Pause · '+(st.pos/1000).toFixed(2)+' km · '+fmtT(st.t));}
const menuBtn=document.getElementById('menuBtn');menuBtn.onclick=pauseGame;
hintEl.onclick=e=>{const b=e.target.closest('[data-act]');if(!b)return;const a=b.getAttribute('data-act');if(a==='d1')setDiff(1);else if(a==='d2')setDiff(2);else if(a==='d3')setDiff(3);else if(a==='d4')setDiff(4);else if(a==='d5')setDiff(5);else if(a==='q')cycleQ();};
function resume(){if(GRP_CODE&&!GRP.peer)grpJoin();menuBtn.style.display='';paused=false;running=true;ov.style.display='none';hudBox.style.display='block';}
const PK='miworu_prog2_'+RKEY;let SAVED=null;   // prog2: alte Fortschritte gehoerten zu anderen Strecken
try{const o=JSON.parse(localStorage.getItem(PK)||'null');if(o&&o.pos>50&&Date.now()-o.ts<864e5)SAVED=o;}catch(e){}
setInterval(()=>{if(running&&st.pos>50&&!st.done)try{localStorage.setItem(PK,JSON.stringify({pos:st.pos,t:st.t,ts:Date.now()}));}catch(e){}},2000);
function clearProg(){SAVED=null;try{localStorage.removeItem(PK);}catch(e){}}
function startSaved(){const o=SAVED;start();if(o){st.pos=o.pos;st.t=o.t;}}
function start(){if(GRP_CODE&&!GRP.peer)grpJoin();menuBtn.style.display='';clearProg();paused=false;reset();if(trainer.connected)trainer.setGrade(0,0.005,true);running=true;lastSec=-1;ov.style.display='none';hudBox.style.display='block';}

// ================= Kamera & Render =================
const smp={x:0,y:0,z:0,h:0},smp2={x:0,y:0,z:0,h:0};
function sample(s,o){
  const e=s<0?s:0;s=clamp(s,0,TOTAL-0.001);
  const i=Math.floor(s/SEG),f=s/SEG-i;
  o.h=HS[i]+wrapA(HS[Math.min(i+1,N)]-HS[i])*f;
  o.x=lerp(PX[i],PX[i+1],f)+Math.sin(o.h)*e;o.y=lerp(PY[i],PY[i+1],f);o.z=lerp(PZ[i],PZ[i+1],f)+Math.cos(o.h)*e;
}
const camT=new THREE.Vector3(),lookT=new THREE.Vector3(),lookC=new THREE.Vector3(0,60,0),ctr=new THREE.Vector3();
let camInit=false;
const OR=ROUTE?{cx:MCX,cz:MCZ,r:1000,h:420,ly:55,cr:260}:{cx:0,cz:0,r:540,h:170,ly:58,cr:120};
function render(dt,now){
  sample(st.pos,smp);
  const rx=-Math.cos(smp.h),rz=Math.sin(smp.h);
  const bx=smp.x+rx*st.x,bz=smp.z+rz*st.x,by=smp.y+0.07+(running||st.done?tabH(st.pos):0);
  bike.position.set(bx,by,bz);
  const gi=Math.min(N-1,Math.floor(st.pos/SEG));
  st.pitch+=(-Math.atan(GR[gi]/100)-st.pitch)*Math.min(1,dt*5);
  bike.rotation.set(st.pitch,smp.h,st.lean);
  wheels[0].rotation.x=st.wheel;wheels[1].rotation.x=st.wheel;
  poseLegs(st.crank);
  const fp=FPV&&(running||st.done);
  bike.visible=!fp;
  cockpitEl.style.display=fp?'block':'none';document.body.classList.toggle('fpv',fp);
  if(fp){
    const ey=by+1.3,k=1-Math.exp(-dt*9);
    camera.position.set(bx+Math.sin(smp.h)*0.05,ey+Math.sin(st.wheel*0.9)*0.004*Math.min(1,st.v/4)+(running?(SHK.y+airH())*0.9+(SHK.buzz||0)*0.0035:0),bz+Math.cos(smp.h)*0.05);
    {const cx0=camera.position.x,cz0=camera.position.z,gm=Math.max(gnd(cx0,cz0),gnd(cx0-Math.sin(smp.h)*0.8,cz0-Math.cos(smp.h)*0.8),gnd(cx0+Math.sin(smp.h)*1.2,cz0+Math.cos(smp.h)*1.2));if(camera.position.y<gm+0.95)camera.position.y=gm+0.95;}   // Kamera nie unter oder in das Gelaende (Absatzkanten, Steilstuecke)
    sample(st.pos+9,smp2);
    lookT.set(smp2.x+rx*st.x*0.9,smp2.y+1.15,smp2.z+rz*st.x*0.9);
    if(!camInit){lookC.copy(lookT);camInit=true;}else lookC.lerp(lookT,k);
    camera.fov+=((70+Math.min(12,st.v*0.9))-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();
    ctr.set(bx,by,bz);
  }else if(running||st.done){
    sample(st.pos-6.2,smp2);
    const r2x=-Math.cos(smp2.h),r2z=Math.sin(smp2.h);
    camT.set(smp2.x+r2x*st.x*0.75,Math.max(smp2.y,by-0.4)+2.25,smp2.z+r2z*st.x*0.75);
    sample(st.pos+9,smp2);
    lookT.set(smp2.x+rx*st.x*0.5,smp2.y+1.0,smp2.z+rz*st.x*0.5);
    const k=camInit?1-Math.exp(-dt*7):1;camInit=true;
    camera.position.lerp(camT,k);lookC.lerp(lookT,k);
    camera.fov+=((62+Math.min(16,st.v*1.1))-camera.fov)*Math.min(1,dt*3);camera.updateProjectionMatrix();
    ctr.set(bx,by,bz);
  }else{
    const t=now*0.00006+0.6;
    camera.position.set(OR.cx+Math.cos(t)*OR.r,OR.h,OR.cz+Math.sin(t)*OR.r);lookC.set(OR.cx,OR.ly,OR.cz);
    camera.fov=50;camera.updateProjectionMatrix();camInit=false;
    ctr.set(OR.cx+Math.cos(t)*OR.cr,OR.ly+2,OR.cz+Math.sin(t)*OR.cr);
  }
  camera.lookAt(lookC);
  if(fp){
    camera.rotateZ(-st.lean*0.55+SHK.r*0.5);             // Neigung in Kurven + Ruppeln
    camera.rotateX((running?Math.atan(tabD(st.pos))*0.7:0)+SHK.y*0.9+(SHK.air?0.035*Math.cos(Math.PI*airU()):0));
    const deg=clamp(st.bar,-17,17);                     // Lenker dreht mit
    cockpitEl.style.transform='translate(-50%,'+(18.5+Math.abs(deg)*0.062-(SHK.y+airH()*0.6)*70-(SHK.buzz||0)*0.12).toFixed(2)+'%) rotate('+(deg+SHK.r*25+SHK.w).toFixed(2)+'deg)';
  }
  sky.position.copy(camera.position);sky.material.uniforms.time.value=now*0.001;
  if(BK)applySun();
  if(BK&&BIRDS.length){const t=now*0.001;BIRDS.forEach(b=>{
    const a=b.ph+b.w*t,x=b.cx+Math.cos(a)*b.r,z=b.cz+Math.sin(a)*b.r,y=b.y0+b.alt+Math.sin(t*0.23+b.ph)*3.5;
    const sg=Math.sign(b.w);b.g.position.set(x,y,z);b.g.rotation.set(0,Math.atan2(-Math.sin(a)*sg,Math.cos(a)*sg),0.28*sg);
    const cyc=((t+b.t0)%9)/9,flap=cyc<0.45?Math.sin(t*b.fp*2)*0.75:Math.sin(t*0.9+b.ph)*0.08;   // Fluegelschlag, dann Gleitphase
    b.L.rotation.z=flap;b.R.rotation.z=-flap;});}
  {   // Sonnenglanz (Lens-Glow) nur wenn man Richtung Sonne schaut
    camera.getWorldDirection(_cd);const fc=_cd.dot(SUN);
    if(fc>0.55){_sv.copy(camera.position).addScaledVector(SUN,1000).project(camera);
      const o=clamp((fc-0.55)/0.4,0,1);glowEl.style.opacity=(o*0.85).toFixed(3);
      glowEl.style.background='radial-gradient(circle at '+((_sv.x*0.5+0.5)*100).toFixed(1)+'% '+((-_sv.y*0.5+0.5)*100).toFixed(1)+'%, rgba(255,226,170,.75) 0, rgba(255,190,110,.28) 9%, rgba(255,170,90,.10) 24%, transparent 48%)';
    }else glowEl.style.opacity=0;
  }
  const sc=running||st.done?1:3.2;
  sun.shadow.camera.left=-90*sc;sun.shadow.camera.right=90*sc;sun.shadow.camera.top=90*sc;sun.shadow.camera.bottom=-90*sc;sun.shadow.camera.far=520*sc;sun.shadow.camera.updateProjectionMatrix();
  sun.position.copy(ctr).addScaledVector(SUN,220*sc);sun.target.position.copy(ctr);sun.target.updateMatrixWorld();
  if((tileN++%6)===0)updateTiles(camera.position);
  renderer.render(scene,camera);
  if(running||st.done)drawHud();
}
let tileN=0;
function updateTiles(cp){   // weit entfernte Kacheln nicht zeichnen, Schatten nur im Nahbereich (Schattenkarte deckt nur +-90 m ab)
  const far=TREE_FAR[quality],far2=(far+130)*(far+130),sh2=(running||st.done?170:520)*(running||st.done?170:520);
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
    O.nodes.forEach(n=>{const k=n[0],x=n[1],z=n[2],y=G(x,z),hh=n[3]||0,rot=rnd()*6.283;
      if(nearest(allHash,x,z)&&nD<(HW[nI]||2)+0.9)return;   // nichts im Fahrbereich
      if(k==='lamp'){post(x,z,5.2,0.14,0x4a4d52);box(x+0.45,y+5.2,z,1.0,0.12,0.2,rot,0x4a4d52);box(x+0.9,y+5.1,z,0.5,0.12,0.3,rot,0xfff2c0,1.4);}
      else if(k==='bench'){box(x,y+0.45,z,1.7,0.07,0.5,rot,0x8a6a45);box(x-0.2*Math.sin(rot),y+0.8,z-0.2*Math.cos(rot),1.7,0.45,0.06,rot,0x8a6a45);post(x+0.7*Math.cos(rot),z-0.7*Math.sin(rot),0.45,0.1,0x3a3a3a);post(x-0.7*Math.cos(rot),z+0.7*Math.sin(rot),0.45,0.1,0x3a3a3a);}
      else if(k==='table'){box(x,y+0.76,z,2.0,0.06,0.8,rot,0x8a6a45);box(x,y+0.45,z+0.0,2.0,0.06,1.7,rot,0x8a6a45,0.9);post(x,z,0.7,0.12,0x5a4a35);}
      else if(k==='sign'){post(x,z,2.1,0.12,0x6a4a2e);box(x,y+1.9,z,0.9,0.5,0.06,rot,0xe8e2c8);}
      else if(k==='pole'){post(x,z,9.5,0.28,0x5b4636);box(x,y+9.2,z,2.2,0.12,0.12,rot,0x5b4636);}
      else if(k==='pylon'){const h=hh||34;[[1,1],[1,-1],[-1,1],[-1,-1]].forEach(a=>box(x+a[0]*1.6,y+h*0.35,z+a[1]*1.6,0.3,h*0.7,0.3,0,0x8b9097));box(x,y+h*0.7,z,5,0.4,5,0,0x8b9097);post(x,z,h,0.5,0x8b9097);box(x,y+h*0.85,z,9,0.3,0.3,rot,0x8b9097);box(x,y+h*0.95,z,6,0.3,0.3,rot,0x8b9097);}
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
        if(k==='line'){lp.push([ax,az,bx,bz]);continue;}
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
      ring(ri,ro,lift,[0.11,0.115,0.12],RP,RC);
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
        {   // parallel zur Strecke (dieselbe Strasse): auslassen; querende Strasse: bis an den Rand der Strecke durchziehen
          const sx=b[0]-a[0],sz=b[1]-a[1],sl=Math.hypot(sx,sz)||1,ni=A?A.i:(B?B.i:-1),par=ni>=0?Math.abs(sx*Math.sin(HS[ni])+sz*Math.cos(HS[ni]))/sl>0.8:false;
          if(par){if((A&&A.d<hrAt(A.i)+w/2+2.5)||(B&&B.d<hrAt(B.i)+w/2+2.5))continue;}
          else if((A&&A.d<hrAt(A.i)+0.15)||(B&&B.d<hrAt(B.i)+0.15))continue;}
        const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1,nx=-dz/l,nz=dx/l;
        const ya=G(a[0],a[1]),yb=G(b[0],b[1]),lift=0.13;
        const cA=[a[0]+nx*w/2,a[1]+nz*w/2],dA=[a[0]-nx*w/2,a[1]-nz*w/2],cB=[b[0]+nx*w/2,b[1]+nz*w/2],dB=[b[0]-nx*w/2,b[1]-nz*w/2];
        const hA1=G(cA[0],cA[1])+lift,hA2=G(dA[0],dA[1])+lift,hB1=G(cB[0],cB[1])+lift,hB2=G(dB[0],dB[1])+lift;
        const sh=0.9+0.12*fbm(a[0]/4,a[1]/4),pth=(hw==='footway'||hw==='cycleway'||hw==='pedestrian'),cb=pth?0.2:0.11;   // Wege heller als Fahrbahnen
        [[cA,hA1],[dA,hA2],[cB,hB1],[dA,hA2],[dB,hB2],[cB,hB1]].forEach(v=>{RP.push(v[0][0],v[1],v[0][1]);RC.push(cb*sh,cb*1.04*sh,cb*1.08*sh);});
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
        const f=nearest(allHash,o.x,o.z),nd=f?nD:99;if(f&&nd<hrAt(nI)*0.9)return;   // nicht auf der Strecke selbst
        const r=o.w/2*1.12+0.2,M2=22,y=G(o.x,o.z)+0.125;
        for(let m=0;m<M2;m++){const a0=m/M2*6.2832,a1=(m+1)/M2*6.2832;[[o.x,o.z,y],[o.x+Math.cos(a0)*r,o.z+Math.sin(a0)*r,G(o.x+Math.cos(a0)*r,o.z+Math.sin(a0)*r)+0.125],[o.x+Math.cos(a1)*r,o.z+Math.sin(a1)*r,G(o.x+Math.cos(a1)*r,o.z+Math.sin(a1)*r)+0.125]].forEach(v=>{RP.push(v[0],v[2],v[1]);RC.push(0.11,0.115,0.12);});}});
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
    const mkRibbon=(arr,carr,off)=>{if(!arr.length)return;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));g.setAttribute('color',new THREE.Float32BufferAttribute(carr,3));g.computeVertexNormals();g.computeBoundingSphere();
      const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:off,polygonOffsetUnits:off}));m.receiveShadow=true;scene.add(m);};
    mkRibbon(RP,RC,-2);mkRibbon(MP,MC,-4);
    if(window.__counts)window.__counts.objV=P.length/3;
    if(P.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(Nn,3));g.setAttribute('color',new THREE.Float32BufferAttribute(Cc,3));
      g.computeBoundingSphere();const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({vertexColors:true}));m.castShadow=false;m.receiveShadow=true;scene.add(m);}
    if(hedge.length){   // Hecken: dichte Gruenquader mit Blatttextur
      const hg=new THREE.BoxGeometry(1,1,1),hm=new THREE.MeshLambertMaterial({map:(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.fillStyle='#35592a';g.fillRect(0,0,64,64);for(let i=0;i<260;i++){g.fillStyle='hsl('+(85+Math.random()*35)+','+(35+Math.random()*25)+'%,'+(14+Math.random()*24)+'%)';g.beginPath();g.arc(Math.random()*64,Math.random()*64,1+Math.random()*3,0,6.3);g.fill();}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;return t;})(),color:0x9fb08a});
      const im=new THREE.InstancedMesh(hg,hm,hedge.length),D=new THREE.Object3D();
      hedge.forEach((h,i)=>{const hh=1.3+rnd()*0.7;D.position.set(h[0],h[1]+hh/2,h[2]);D.rotation.set(0,h[4],0);D.scale.set(h[3]+0.1,hh,0.9+rnd()*0.4);D.updateMatrix();im.setMatrixAt(i,D.matrix);});
      im.castShadow=false;im.frustumCulled=false;scene.add(im);}
    if(lp.length){   // Stromleitungen: durchhaengende Seile zwischen den Masten
      const pts=[];lp.forEach(l=>{const h0=9,sag=0.8;let px=l[0],pz=l[1],py=G(px,pz)+h0;for(let i=1;i<=4;i++){const t=i/4,x=l[0]+(l[2]-l[0])*t,z=l[1]+(l[3]-l[1])*t,y=G(x,z)+h0-Math.sin(t*Math.PI)*sag;pts.push(px,py,pz,x,y,z);px=x;py=y;pz=z;}});
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
window.__vans=VANS;
const vo={x:0,y:0,z:0,h:0};
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
let last=performance.now();
function loop(now){
  const dt=clamp((now-last)/1000,0,0.05);last=now;
  update(dt);render(dt,now);
  requestAnimationFrame(loop);
}
window.__dbg={renderer:renderer,scene:scene,SHK:SHK,BUMPS:BUMPS,gnd:gnd,HS:HS,PX:PX,PZ:PZ,HW:HW,KV:KV,ROUTE:ROUTE,SURF:SURF,cam:camera,joggers:joggers,groundY:groundY,TABS:TABS,tabH:tabH,get st(){return st;},set pos(v){st.pos=v;camInit=false;},N:N,TOTAL:TOTAL,iTrail:iTrail,SEC:SEC,PY:PY,GR:GR,forestD:forestD,lu:(k,x,z)=>LU?lu(LU[k],x,z):-1};
if(SAVED)menu('Weiterfahren bei '+(SAVED.pos/1000).toFixed(2).replace('.',',')+' km','Gespeicherte Fahrt · '+fmtT(SAVED.t));else menu('Start');
if(location.hash==='#go')start();
requestAnimationFrame(loop);
requestAnimationFrame(()=>{const b=document.getElementById('boot');if(b){b.classList.add('off');setTimeout(()=>b.remove(),700);}});
