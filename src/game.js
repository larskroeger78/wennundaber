// Wenn und Aber Bike Crew – Spielcode (Stand Prototyp 0.5).
// Noch eine einzige Datei; wird schrittweise in Module aufgeteilt (Strecke, Gelände, Vegetation, Figuren, HUD).
import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SkeletonUtils } from 'three/examples/jsm/utils/SkeletonUtils.js';
import './style.css';
import { Trainer, ClickPad, BLE_OK } from './ble.js';
import MITT from './routes/mittwochsrunde.json';
const SURF_FILES=import.meta.glob('./routes/*.surf.json',{eager:true});
// Strecke per URL: ?route=mittwoch startet die Mittwochsrunde (GPX), sonst Halde Großes Holz
const ROUTE=new URLSearchParams(location.search).get('route')==='mittwoch';
// Echtes Geländemodell (DGM1 NRW, per npm run terrain erzeugt): Höhenraster in Dezimetern
const GEL_F=import.meta.glob('./routes/gelaende.json',{eager:true});
const GEL=(()=>{
  const k=Object.keys(GEL_F)[0];if(!k)return null;
  const g=GEL_F[k].default||GEL_F[k],bin=atob(g.dm),u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return {g:g,h:new Int16Array(u.buffer)};
})();
const useDem=ROUTE&&!!GEL;
function demH(x,z){
  const g=GEL.g,u=Math.max(0,Math.min(g.nx-1.001,(x-g.x0)/g.cell)),v=Math.max(0,Math.min(g.nz-1.001,(z-g.z0)/g.cell));
  const i=Math.floor(u),j=Math.floor(v),fu=u-i,fv=v-j,H=GEL.h,o=j*g.nx+i;
  return ((H[o]*(1-fu)+H[o+1]*fu)*(1-fv)+(H[o+g.nx]*(1-fu)+H[o+g.nx+1]*fu)*fv)/10;
}

// ================= Helfer =================
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const BUMPS=[],SHK={y:0,vy:0,r:0,vr:0,i:0};   // Stöße (Wurzeln/Steine) -> Cockpit ruppelt
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
const HTOP=90,RTOP=62,RBASE=340,KR=(RBASE-RTOP)/HTOP,SEG=2,NHN0=55.8;
const TRACK_NAME='Halde Großes Holz · Uphill + Trail „Highway“';
const SECN=ROUTE?['Asphaltweg','Schotterweg','Trail']:['Anfahrt am Haldenfuß','Uphill · Asphalt','Zwischenplateau · Blauer Leuchtmarker','Uphill · Asphalt','Gipfelplateau · 145,8 m ü. NHN','Trail „Highway“'];
const PLACE=ROUTE?'Mittwochsrunde · Bergkamen':'Halde Großes Holz · Bergkamen';
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
  const ov=Object.keys(SURF_FILES).find(k=>k.indexOf('mittwochsrunde')>=0);
  if(ov){const a=SURF_FILES[ov].default||SURF_FILES[ov];for(let i=0;i<n;i++)raw[i].sec=a[Math.min(a.length-1,i)];return;}
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
function baseRoute(x,z){
  const s1=fld(FG.S1,x,z),a=sstep(0.04,0.35,s1/FG.s1m);
  const m1=fld(FG.T1,x,z)/(s1+1e-6),m2=fld(FG.T2,x,z)/(fld(FG.S2,x,z)+0.02*FG.s2m);
  return lerp(m2,m1,a)+(fbm(x/60+11,z/60+7)-0.5)*5*sstep(0.1,0.5,s1/FG.s1m);
}
function baseH(x,z){
  if(useDem){            // echtes Gelände, am Rand weich zur Umland-Ebene auslaufend
    const e=Math.min(x-FG.ox,FG.ox+(FG.nx-1)*FG.G-x,z-FG.oz,FG.oz+(FG.nz-1)*FG.G-z);
    return lerp(-1.2,demH(x,z),sstep(0,110,e));
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
const SUN=new THREE.Vector3(-0.55,0.62,0.42).normalize();
const hemi=new THREE.HemisphereLight(new THREE.Color(0.72,0.84,1.0),new THREE.Color(0.34,0.31,0.22),0.75);scene.add(hemi);
const sun=new THREE.DirectionalLight(new THREE.Color(1.0,0.92,0.78),2.1);
sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-90;sun.shadow.camera.right=90;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-90;
sun.shadow.camera.near=10;sun.shadow.camera.far=520;
sun.shadow.bias=-0.0004;sun.shadow.normalBias=0.3;
scene.add(sun);scene.add(sun.target);
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();

// ================= Himmel =================
const sky=new THREE.Mesh(new THREE.SphereGeometry(4500,32,16),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{sunDir:{value:SUN},time:{value:0}},
  vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:[
  'uniform vec3 sunDir;uniform float time;varying vec3 vDir;',
  'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
  'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}',
  'float fbm(vec2 p){float a=0.5,s=0.0;for(int i=0;i<5;i++){s+=a*noise(p);p*=2.03;a*=0.5;}return s;}',
  'void main(){',
  ' vec3 d=normalize(vDir);float h=max(d.y,0.0);',
  ' vec3 zen=vec3(0.10,0.27,0.60),hor=vec3(0.62,0.74,0.86);',
  ' vec3 col=mix(hor,zen,pow(h,0.45));',
  ' float sd=max(dot(d,sunDir),0.0);',
  ' col+=vec3(1.0,0.85,0.6)*(pow(sd,350.0)*6.0+pow(sd,12.0)*0.25);',
  ' vec2 uv=d.xz/(h+0.12)*0.9+vec2(time*0.004,0.0);',
  ' float c=fbm(uv*1.2);float cov=smoothstep(0.46,0.72,c);',
  ' float sh=fbm(uv*1.2+sunDir.xz*0.15);',
  ' vec3 cc=mix(vec3(0.50,0.56,0.66),vec3(1.25,1.2,1.15),smoothstep(0.3,0.8,1.0-sh*0.9+sd*0.3));',
  ' col=mix(col,cc,cov*smoothstep(0.0,0.12,d.y)*0.9);',
  ' col=mix(hor,col,smoothstep(-0.02,0.06,d.y));',
  ' gl_FragColor=vec4(col,1.0);',
  ' #include <tonemapping_fragment>',
  ' #include <encodings_fragment>',
  '}'].join('\n')
}));
sky.frustumCulled=false;scene.add(sky);

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
  SUN.set(Math.cos(lon)*Math.cos(lat),Math.max(0.35,Math.sin(lat)),Math.sin(lon)*Math.cos(lat)).normalize();
  let r=0,g=0,b=0,n=0;const yy=Math.floor(h*0.485);
  for(let x=0;x<w;x+=8){const k=(yy*w+x)*4,f=Math.pow(2,d[k+3]-136);r+=d[k]*f;g+=d[k+1]*f;b+=d[k+2]*f;n++;}
  const hc=new THREE.Color(Math.min(1.2,r/n),Math.min(1.2,g/n),Math.min(1.2,b/n));
  scene.fog.color.copy(hc);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  const pm=new THREE.PMREMGenerator(renderer);
  scene.environment=pm.fromEquirectangular(tex).texture;pm.dispose();
  scene.background=tex;sky.visible=false;
  hemi.intensity=0.5;
  scene.traverse(o=>{const m=o.material;if(m&&m.isMeshStandardMaterial)m.envMapIntensity=0.28;});
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

// ================= Gelände =================
const cGrassA=L3(0x5f7d34),cGrassB=L3(0x84903f),cDry=L3(0xa39a5c),cForest=L3(0x3d4a25),cGravel=L3(0x837c6d),cDirt=L3(0x5c4730),cField=L3(0x6d8a3e);
function forestD(x,z){
  if(ROUTE){
    let f=sstep(0.05,0.2,routePresence(x,z))*(sstep(0.32,0.48,fbm(x/90+3,z/90+9))*0.85+0.15);
    return f*(1-0.75*sstep(38,64,baseH(x,z)));      // oben auf der Halde offener
  }
  const r=Math.hypot(x,z);
  let f=sstep(RTOP+18,RTOP+95,r)*(1-sstep(RBASE+110,RBASE+210,r));
  f*=sstep(0.34,0.5,fbm(x/90+3,z/90+9))*0.85+0.15;
  return f;
}
(function buildTerrain(){
  const G=4,X0=ROUTE?FG.ox:-660,Z0=ROUTE?FG.oz:-660;
  const nx=ROUTE?Math.floor((FG.nx-1)*FG.G/G):330,nz=ROUTE?Math.floor((FG.nz-1)*FG.G/G):330,VX=nx+1,VZ=nz+1;
  const pos=new Float32Array(VX*VZ*3),col=new Float32Array(VX*VZ*3),col2=new Float32Array(VX*VZ*3),uv=new Float32Array(VX*VZ*2);
  let p=0,q=0,u=0;
  for(let iz=0;iz<VZ;iz++){
    for(let ix=0;ix<VX;ix++){
      const x=X0+ix*G,z=Z0+iz*G,r=Math.hypot(x,z);
      const h=gnd(x,z);
      const found=nI>=0&&nD<OUTR[nI]+4,d=nD,i=nI;
      pos[p++]=x;pos[p++]=h;pos[p++]=z;
      uv[u++]=x/7;uv[u++]=z/7;
      let c=mix3(cGrassA,cGrassB,fbm(x/22+1,z/22+4));
      if(ROUTE){
        c=mix3(c,cDry,0.3*fbm(x/40+8,z/40)+0.35*sstep(38,64,h));
        c=mix3(c,cForest,forestD(x,z)*0.85);
        c=mix3(c,cField,1-sstep(0.04,0.22,routePresence(x,z)));
      }else{
        c=mix3(c,cDry,0.55*(1-sstep(RTOP+30,RTOP+130,r))*sstep(RTOP-2,RTOP+6,r)+0.25*fbm(x/40+8,z/40));
        c=mix3(c,cForest,forestD(x,z)*0.85);
        c=mix3(c,cField,sstep(RBASE+170,RBASE+260,r));
      }
      if(found){
        if(SURF[i]===2)c=mix3(c,cDirt,(1-sstep(HW[i],HW[i]+2.2,d))*0.9);
        else if(ROUTE&&SURF[i]===1)c=mix3(c,cDirt,(1-sstep(HW[i],HW[i]+2.2,d))*0.55);
        else c=mix3(c,cGravel,(1-sstep(HW[i]+0.4,HW[i]+2.8,d))*0.9);
      }
      col2[q]=Math.min(1.6,c[0]/0.50);col2[q+1]=Math.min(1.6,c[1]/0.42);col2[q+2]=Math.min(1.6,c[2]/0.20);
      col[q++]=c[0];col[q++]=c[1];col[q++]=c[2];
    }
  }
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
  {   // steile Hänge: Erde/Geröll statt Rasen (Böschungen wirken gewachsen statt tapeziert)
    const nr=g.attributes.normal.array;
    for(let v=0;v<VX*VZ;v++){
      const ny=nr[v*3+1],t=sstep(0.93,0.8,ny)*0.7*(0.6+0.8*fbm(pos[v*3]/3,pos[v*3+2]/3));
      if(t<=0.01)continue;
      const e=mix3([col[v*3],col[v*3+1],col[v*3+2]],cDirt,Math.min(1,t));
      col[v*3]=e[0];col[v*3+1]=e[1];col[v*3+2]=e[2];
      col2[v*3]=Math.min(1.6,e[0]/0.50);col2[v*3+1]=Math.min(1.6,e[1]/0.42);col2[v*3+2]=Math.min(1.6,e[2]/0.20);
    }
    g.attributes.color.needsUpdate=true;
  }
  const tm=new THREE.MeshStandardMaterial({map:texGround,vertexColors:true,roughness:1,metalness:0});
  applyPhoto(tm,'forrest_ground_01',1.75,1.75,{arm:true,normalScale:1.2,onDiffuse:()=>{g.setAttribute('color',new THREE.BufferAttribute(col2,3));}});
  const m=new THREE.Mesh(g,tm);
  m.receiveShadow=true;scene.add(m);
})();
// Umland: Felder, Kanal
(function(){
  texFields.repeat.set(5,5);
  const f=new THREE.Mesh(new THREE.PlaneGeometry(10000,10000),new THREE.MeshLambertMaterial({map:texFields}));
  f.rotation.x=-Math.PI/2;f.position.y=-1.5;scene.add(f);
  const w=new THREE.Mesh(new THREE.PlaneGeometry(5000,46),new THREE.MeshStandardMaterial({color:C(0x3b6078),roughness:0.15,metalness:0.1}));
  w.rotation.x=-Math.PI/2;w.position.set(0,-1.35,-930);if(!ROUTE)scene.add(w);
})();

// ================= Wege =================
function ribbon(i0,i1,wScale,mat,vLen,lift){
  const cnt=i1-i0+1,pos=new Float32Array(cnt*6),uv=new Float32Array(cnt*4),idx=[];
  for(let k=0;k<cnt;k++){
    const i=i0+k,h=HS[i],rx=-Math.cos(h),rz=Math.sin(h),w=HW[i]*wScale;
    pos[k*6]=PX[i]-rx*w;pos[k*6+1]=PY[i]+lift;pos[k*6+2]=PZ[i]-rz*w;
    pos[k*6+3]=PX[i]+rx*w;pos[k*6+4]=PY[i]+lift;pos[k*6+5]=PZ[i]+rz*w;
    if(useDem){      // Wegband liegt auf dem Gelände (kein Schweben über Böschungen oder doppelten Wegen)
      const gl=gnd(pos[k*6],pos[k*6+2])+lift+0.08,gr=gnd(pos[k*6+3],pos[k*6+5])+lift+0.08;
      pos[k*6+1]=Math.min(PY[i]+lift+0.6,Math.max(PY[i]+lift-0.6,gl));pos[k*6+4]=Math.min(PY[i]+lift+0.6,Math.max(PY[i]+lift-0.6,gr));
    }
    uv[k*4]=0;uv[k*4+1]=i*SEG/vLen;uv[k*4+2]=1;uv[k*4+3]=i*SEG/vLen;
    if(k<cnt-1){const a=k*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();
  const m=new THREE.Mesh(g,mat);m.receiveShadow=true;scene.add(m);return m;
}
const asphaltMat=new THREE.MeshStandardMaterial({map:texAsphalt,roughness:0.85,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
applyPhoto(asphaltMat,'asphalt_02',1,2,{arm:true,color:new THREE.Color(1.1,1.1,1.1)});
if(!ROUTE)ribbon(0,Math.min(N,iTrail+4),1,asphaltMat,8,0.05);
const trailMat=new THREE.MeshStandardMaterial({map:texDirt,roughness:1,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
applyPhoto(trailMat,'forest_ground_04',1,1.6,{arm:true,color:new THREE.Color(1.25,1.2,1.15),onDiffuse:()=>{
  trailMat.alphaMap=canvasTex(64,4,(g,w,h)=>{const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'#000');ag.addColorStop(0.3,'#fff');ag.addColorStop(0.7,'#fff');ag.addColorStop(1,'#000');g.fillStyle=ag;g.fillRect(0,0,w,h);},true);
  trailMat.alphaMap.encoding=THREE.LinearEncoding;trailMat.needsUpdate=true;}});
if(!ROUTE)ribbon(iTrail-2,N,1.7,trailMat,5,0.07);
else{
  const gravelMat=new THREE.MeshStandardMaterial({map:texDirt,roughness:1,side:THREE.DoubleSide,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  applyPhoto(gravelMat,'forest_ground_04',1,1.6,{arm:true,color:new THREE.Color(1.65,1.58,1.45),onDiffuse:()=>{
    gravelMat.alphaMap=canvasTex(64,4,(g,w,h)=>{const ag=g.createLinearGradient(0,0,w,0);ag.addColorStop(0,'#000');ag.addColorStop(0.25,'#fff');ag.addColorStop(0.75,'#fff');ag.addColorStop(1,'#000');g.fillStyle=ag;g.fillRect(0,0,w,h);},true);
    gravelMat.alphaMap.encoding=THREE.LinearEncoding;gravelMat.needsUpdate=true;}});
  surfRuns((sf,a,b)=>{ribbon(Math.max(0,a-2),Math.min(N,b+2),sf===0?1:(sf===1?1.5:1.7),sf===0?asphaltMat:(sf===1?gravelMat:trailMat),sf===0?8:5,sf===0?0.05:0.07);});
}

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

(function plant(){
  const trees=[],bushes=[],tufts=[];
  function clearOf(x,z,extra){
    if(!nearest(allHash,x,z))return true;
    const lim=(ROUTE?SURF[nI]===2:nI>=iTrail-3)?HW[nI]+0.9+extra:FLAT[nI]+1+extra;
    return nD>lim;
  }
  function addTree(x,z,scale){
    let H=(7+rnd()*7)*scale,cw=(3.6+rnd()*3.4)*scale,ch=H*(0.5+rnd()*0.18);
    if(nearest(allHash,x,z)&&(ROUTE?SURF[nI]===2:nI>=iTrail-3)&&nD<8){H=Math.max(H,9+rnd()*3);ch=Math.min(ch,H-4.8);}
    trees.push({x:x,y:gnd(x,z)-0.2,z:z,H:H,cw:cw,ch:ch,rad:0.11+rnd()*0.14,rot:rnd()*6.283});
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
      for(let k=0;k<3;k++){
        if(rnd()<0.3)continue;
        const o=(HW[i]+1.8+Math.pow(rnd(),1.5)*75)*(rnd()<0.5?-1:1),x=PX[i]+rx*o+(rnd()-0.5)*3,z=PZ[i]+rz*o+(rnd()-0.5)*3;
        if(rnd()>forestD(x,z)*1.15||!clearOf(x,z,0.3))continue;
        addTree(x,z,0.85+rnd()*0.3);
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
  const fol=new THREE.InstancedMesh(foliageGeo,leafMat,trees.length);
  const trk=new THREE.InstancedMesh(trunkGeo,trunkMat,trees.length);
  trees.forEach((t,i)=>{
    DUM.rotation.set(0,t.rot,0);
    DUM.position.set(t.x,t.y+t.H-t.ch,t.z);DUM.scale.set(t.cw,t.ch,t.cw);DUM.updateMatrix();fol.setMatrixAt(i,DUM.matrix);
    DUM.position.set(t.x,t.y,t.z);DUM.scale.set(t.rad,t.H-t.ch*0.45,t.rad);DUM.updateMatrix();trk.setMatrixAt(i,DUM.matrix);
    const tb=0.8+rnd()*0.45;fol.setColorAt(i,TC.setRGB(tb*(0.85+rnd()*0.35),tb,tb*(0.7+rnd()*0.25)));
    const tg=0.65+rnd()*0.6;trk.setColorAt(i,TC.setRGB(tg,tg*0.97,tg*0.92));
  });
  fol.castShadow=true;fol.receiveShadow=true;fol.customDepthMaterial=leafDepth;fol.frustumCulled=false;
  trk.castShadow=true;trk.receiveShadow=true;trk.frustumCulled=false;
  scene.add(fol);scene.add(trk);
  const bsh=new THREE.InstancedMesh(foliageGeo,leafMat,bushes.length);
  bushes.forEach((b,i)=>{
    DUM.rotation.set(0,rnd()*6.283,0);DUM.position.set(b.x,b.y,b.z);DUM.scale.set(b.w,b.h,b.w);DUM.updateMatrix();bsh.setMatrixAt(i,DUM.matrix);
    const bb=0.75+rnd()*0.4;bsh.setColorAt(i,TC.setRGB(bb,bb*1.05,bb*0.7));
  });
  bsh.castShadow=true;bsh.receiveShadow=true;bsh.customDepthMaterial=leafDepth;bsh.frustumCulled=false;scene.add(bsh);
  const grs=new THREE.InstancedMesh(grassGeo,grassMat,tufts.length);
  tufts.forEach((t,i)=>{
    DUM.rotation.set(0,rnd()*6.283,0);DUM.position.set(t.x,t.y,t.z);DUM.scale.set(t.w,t.h,t.w);DUM.updateMatrix();grs.setMatrixAt(i,DUM.matrix);
    grs.setColorAt(i,TC.setRGB(0.5+t.dry*0.4,0.55+t.dry*0.25,0.4+t.dry*0.08));
  });
  grs.receiveShadow=true;grs.frustumCulled=false;scene.add(grs);
  // Bergab: Untergrund wird wurzelig und steinig (je steiler, desto mehr), Wurzeln queren den Weg, Steine liegen drauf und daneben
  {
    const rootG=new THREE.CylinderGeometry(1,1,1,5);rootG.rotateZ(Math.PI/2);
    const stoneG=new THREE.DodecahedronGeometry(1,0);
    const roots=[],stones=[];
    for(let i=(ROUTE?0:iTrail);i<N;i++){
      if(ROUTE&&SURF[i]===0)continue;
      const dn=-GR[i];if(dn<2)continue;
      const pr=clamp((dn-2)/9,0,1)*(ROUTE&&SURF[i]===1?0.6:1),h=HS[i],rx=-Math.cos(h),rz=Math.sin(h);
      if(rnd()<pr*0.8){
        const hw=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7)*0.9,o0=-hw*(0.7+rnd()*0.3),o1=hw*(0.7+rnd()*0.3),L=o1-o0,oc=(o0+o1)/2,sk=(rnd()-0.5)*0.9;
        const x=PX[i]+rx*oc,z=PZ[i]+rz*oc;
        BUMPS.push({s:i*SEG,o0:o0-0.1,o1:o1+0.1,a:0.45+rnd()*0.35});roots.push({x:x,y:gnd(x,z)+0.035,z:z,L:L/Math.cos(sk),r:0.05+rnd()*0.07,a:Math.atan2(-rz,rx)+sk,t:rnd()});
        if(rnd()<0.4){const x2=x+Math.sin(h)*0.5,z2=z+Math.cos(h)*0.5;roots.push({x:x2,y:gnd(x2,z2)+0.03,z:z2,L:L*0.6,r:0.025+rnd()*0.03,a:Math.atan2(-rz,rx)+sk+(rnd()-0.5)*0.6,t:rnd()});}
      }
      const ns=Math.round(pr*(3+rnd()*6));
      for(let k=0;k<ns;k++){
        const hw=HW[i]*(ROUTE?[1,1.5,1.7][SURF[i]]:1.7),o=(rnd()*2-1)*hw*(rnd()<0.7?0.95:1.6),x=PX[i]+rx*o+Math.sin(h)*(rnd()-0.5)*SEG,z=PZ[i]+rz*o+Math.cos(h)*(rnd()-0.5)*SEG;
        const w=0.05+Math.pow(rnd(),2.4)*0.17;
        if(w>0.07)BUMPS.push({s:i*SEG+(rnd()-0.5)*SEG*0.8,o0:o-0.3-w,o1:o+0.3+w,a:0.15+w*3});
        stones.push({x:x,y:gnd(x,z)+w*0.18,z:z,w:w,hh:w*(0.45+rnd()*0.35),t:rnd()});
      }
    }
    const rm=new THREE.InstancedMesh(rootG,new THREE.MeshStandardMaterial({roughness:1,color:0xffffff}),Math.max(1,roots.length));rm.count=roots.length;
    roots.forEach((r,i)=>{DUM.rotation.set(0,r.a,0);DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.L,r.r,r.r);DUM.updateMatrix();rm.setMatrixAt(i,DUM.matrix);rm.setColorAt(i,TC.setRGB(0.14+r.t*0.1,0.09+r.t*0.06,0.05+r.t*0.03));});
    rm.castShadow=false;rm.receiveShadow=true;rm.frustumCulled=false;scene.add(rm);
    const sm=new THREE.InstancedMesh(stoneG,new THREE.MeshStandardMaterial({roughness:0.95,color:0xffffff,flatShading:true}),Math.max(1,stones.length));sm.count=stones.length;
    stones.forEach((r,i)=>{DUM.rotation.set(rnd()*0.6,rnd()*6.283,rnd()*0.6);DUM.position.set(r.x,r.y,r.z);DUM.scale.set(r.w,r.hh,r.w*(0.7+rnd()*0.5));DUM.updateMatrix();sm.setMatrixAt(i,DUM.matrix);const c=0.16+r.t*0.16;sm.setColorAt(i,TC.setRGB(c*1.05,c*0.95,c*0.8));});
    sm.castShadow=true;sm.receiveShadow=true;sm.frustumCulled=false;scene.add(sm);
    BUMPS.sort((a,b)=>a.s-b.s);
    window.__rs={roots:roots.length,stones:stones.length};
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
    if(Math.abs(j.s-st.pos)<1.1&&Math.abs(j.x-st.x)<0.55)st.v*=0.4;   // Rempler bremst
    sample(j.s,jS);
    j.g.position.set(jS.x-Math.cos(jS.h)*j.x,jS.y+0.05,jS.z+Math.sin(jS.h)*j.x);
    j.g.rotation.y=jS.h+Math.PI;
    if(j.mixer)j.mixer.update(dt*j.speed/3.0);else poseJogger(j);
  });
}

// ================= Zustand, Eingabe, Physik =================
const M=95,CDA=0.38,RHO=1.2,GRAV=9.81,PMAX=300,BRAKE=260;
const keys={};
let running=false,inputMode='keyboard',st,FPV=true;
const trainer=new Trainer(),click=new ClickPad();let paused=false,gear=0,bleMsg='',lastMenu=null;   // gear: virtuelle Schaltung = Widerstand in %-Steigung (+/-)
function shift(d){gear=clamp(gear+d,-6,6);}
click.onShift=shift;
const bleChange=()=>{if(trainer.connected)inputMode='trainer';else if(inputMode==='trainer')inputMode='keyboard';if(ov.style.display!=='none'&&lastMenu)menu(lastMenu[0],lastMenu[1]);};
trainer.onChange=bleChange;click.onChange=bleChange;   // FPV: Cockpit-Ansicht aus Fahrersicht (Taste C wechselt)
const cockpitEl=document.getElementById('cockpit');
function reset(){SHK.y=SHK.vy=SHK.r=SHK.vr=0;SHK.i=0;st={pos:0,v:0,x:0.4,power:0,t:0,crank:0.6,wheel:0,lean:0,bar:0,pitch:0,done:false};resetJoggers();}
reset();
window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].indexOf(e.key)>=0)e.preventDefault();
  keys[e.key]=true;
  if(e.key==='r'||e.key==='R')start();
  if(e.key==='c'||e.key==='C')FPV=!FPV;
  if(e.key==='Escape'&&running){running=false;paused=true;trainer.setGrade(0,0.005,true);offEl.style.display='none';menu('Weiterfahren','Pause · '+(st.pos/1000).toFixed(2)+' km · '+fmtT(st.t));}
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
  const eg=Math.max(0,GR[i]+gear*0.5);          // effektive Steigung inkl. virtueller Schaltung; Abfahrten neutral
  if(tr)trainer.setGrade(eg,dirt?0.012:SURF[i]===1?0.009:0.005);
  const climb=eg/100;            // Abfahrten neutral: zählen wie flach
  const v=st.v,vs=Math.max(v,1.5);
  const fres=M*GRAV*((dirt?0.012:SURF[i]===1?0.009:0.005)+climb)+0.5*RHO*CDA*v*v+(down?BRAKE:0);
  st.v=Math.max(0,v+(st.power/vs-fres)/M*dt);
  const off=Math.abs(st.x)>HW[i]+0.15;
  if(off)st.v*=Math.max(0,1-1.3*dt);
  const p0=st.pos;st.pos=Math.max(0,st.pos+st.v*dt);st.t+=dt;
  // Ruppeln: Wurzeln und Steine unter dem Rad geben Stöße, Schotter/Trail rauschen leicht
  while(SHK.i<BUMPS.length&&BUMPS[SHK.i].s<st.pos){
    const b=BUMPS[SHK.i++];
    if(b.s>=p0-0.01&&st.x>b.o0&&st.x<b.o1&&st.v>0.8){const f=0.5+0.5*Math.min(1,st.v/7);SHK.vy+=b.a*f*(rnd()<0.5?1:0.7);SHK.vr+=(rnd()-0.5)*b.a*f*5;}
  }
  SHK.vy+=(-420*SHK.y-17*SHK.vy)*dt;SHK.y+=SHK.vy*dt;SHK.vr+=(-380*SHK.r-16*SHK.vr)*dt;SHK.r+=SHK.vr*dt;
  const rough=(ROUTE?[0,0.4,1][SURF[i]]:(i>=iTrail?1:0.2))*(1+Math.max(0,-GR[i])*0.06)*Math.min(1,st.v/6);
  SHK.buzz=rough*(Math.sin(st.pos*9.3)+Math.sin(st.pos*17.9+1.3)*0.7+Math.sin(st.pos*31.7)*0.4);
  updateJoggers(dt);
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
    st.done=true;running=false;trainer.setGrade(0,0.005,true);
    menu('Nochmal fahren','Ziel! '+fmtT(st.t)+' · Ø '+(st.pos/st.t*3.6).toFixed(1)+' km/h');
  }
}
const fmtT=t=>Math.floor(t/60)+':'+('0'+Math.floor(t%60)).slice(-2)+','+Math.floor(t*10%10);

// ================= HUD =================
const hudBox=document.getElementById('hudbox'),secEl=document.getElementById('sec'),spdEl=document.getElementById('spd'),subEl=document.getElementById('sub'),offEl=document.getElementById('off');
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
const profBase=document.createElement('canvas');profBase.width=420;profBase.height=64;
const profY=i=>58-(PY[i]/HTOP)*50;
(function(){
  const g=profBase.getContext('2d');
  g.fillStyle='rgba(0,0,0,0.35)';g.fillRect(0,0,420,64);
  surfRuns((sf,a,b)=>{
    g.fillStyle=SURFFILL[sf];g.beginPath();g.moveTo(a/N*420,62);
    for(let i=a;i<=b;i+=4)g.lineTo(i/N*420,profY(i));
    g.lineTo(b/N*420,profY(b));g.lineTo(b/N*420,62);g.closePath();g.fill();
  });
})();
let lastSec=-1;
function drawHud(){
  const i=Math.min(N-1,Math.floor(st.pos/SEG));
  if(SEC[i]!==lastSec){lastSec=SEC[i];secEl.innerHTML=SECN[lastSec]+'<small>'+PLACE+'</small>';}
  spdEl.firstChild.nodeValue=(st.v*3.6).toFixed(0);
  subEl.innerHTML='<b>'+Math.round(st.power)+' W</b>'+(gear?' · Gang '+(gear>0?'+':'')+gear:'')+' · '+(GR[i]>=0?'+':'')+GR[i].toFixed(0)+' % · '+(NHN0+PY[i]).toFixed(0)+' m ü. NHN<br>'+(st.pos/1000).toFixed(2)+' / '+(TOTAL/1000).toFixed(2)+' km · '+fmtT(st.t);
  mg.clearRect(0,0,180,180);mg.drawImage(miniBase,0,0);
  const mx=90+(PX[i]-Math.cos(HS[i])*st.x-MCX)*MS,my=90+(PZ[i]+Math.sin(HS[i])*st.x-MCZ)*MS;
  mg.save();mg.translate(mx,my);mg.rotate(Math.atan2(Math.cos(HS[i]),Math.sin(HS[i])));
  mg.fillStyle='#fff';mg.strokeStyle='#111';mg.lineWidth=1.5;mg.beginPath();mg.moveTo(7,0);mg.lineTo(-5,4.5);mg.lineTo(-5,-4.5);mg.closePath();mg.fill();mg.stroke();mg.restore();
  pg.clearRect(0,0,420,64);pg.drawImage(profBase,0,0);
  pg.fillStyle='#fff';pg.fillRect(i/N*420-1,2,2,60);pg.beginPath();pg.arc(i/N*420,profY(i),4,0,7);pg.fill();
}
let HM=90;
if(ROUTE){HM=0;for(let i=0;i<N;i++)HM+=Math.max(0,PY[i+1]-PY[i]);HM=Math.round(HM/10)*10;}
const ov=document.getElementById('overlay');
function menu(title,sub){
  lastMenu=[title,sub];
  ov.style.display='flex';hudBox.style.display=sub?'block':'none';
  ov.innerHTML='<div class="tag">The Aber Version · Prototyp 0.5</div>'+
    '<h1>Wenn und Aber<br><em>Bike Crew</em></h1>'+
    (sub?'<div class="res">'+sub+'</div>':'')+
    '<div class="tag">'+(ROUTE?'Mittwochsrunde · Halde Großes Holz und Umland':TRACK_NAME)+' · '+(TOTAL/1000).toFixed(1).replace('.',',')+' km · '+HM+' Hm</div>'+
    '<div><button id="go">'+title+'</button><button id="mode" class="sec">'+(inputMode==='keyboard'?'Tastaturmodus: AN':'Tastaturmodus: AUS')+'</button><button id="alt" class="sec">'+(ROUTE?'Halde Großes Holz':'Mittwochsrunde starten')+'</button><button id="trn" class="sec">'+(trainer.connected?'Trainer: '+trainer.name+' ✓':'Trainer koppeln (D100 / KICKR)')+'</button><button id="clk" class="sec">'+(click.connected?'Zwift Click ✓ ('+click.count+')':'Zwift Click koppeln (experimentell)')+'</button></div>'+
    '<div class="help" id="blemsg">'+(trainer.connected?trainer.name+': '+trainer.status+' · '+Math.round(trainer.power)+' W':!BLE_OK?'Bluetooth nur in Chrome/Edge (nicht Safari).':'')+(bleMsg?'<br>'+bleMsg:'')+(click.connected&&click.log.length?'<br><small>'+click.log.slice(-3).join('<br>')+'</small>':'')+'</div>'+
    '<div class="help">↑ treten · ↓ bremsen · +/− Schaltung · Esc Pause/Menü · R neu starten · C Ansicht<br>Lenken und Ausweichen laufen automatisch (Trainer können nicht lenken)<br>Abfahrten sind neutral: Tempo entsteht nur durchs Treten.</div>';
  document.getElementById('mode').onclick=()=>{inputMode=inputMode==='keyboard'?'off':'keyboard';menu(title,sub);};
  document.getElementById('alt').onclick=()=>{location.href=location.pathname+(ROUTE?'':'?route=mittwoch')+'#go';};
  document.getElementById('trn').onclick=async()=>{bleMsg='';try{await trainer.connect();}catch(e){bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Trainer: '+(e&&e.message||e);}menu(title,sub);};
  document.getElementById('clk').onclick=async()=>{bleMsg='';try{await click.connect();}catch(e){bleMsg=(e&&e.name==='NotFoundError')?'Kein Gerät gewählt.':'Click: '+(e&&e.message||e);}menu(title,sub);};
  document.getElementById('go').onclick=paused?resume:start;
}
function resume(){paused=false;running=true;ov.style.display='none';hudBox.style.display='block';}
function start(){paused=false;reset();if(trainer.connected)trainer.setGrade(0,0.005,true);running=true;lastSec=-1;ov.style.display='none';hudBox.style.display='block';}

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
  const bx=smp.x+rx*st.x,bz=smp.z+rz*st.x,by=smp.y+0.07;
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
    camera.position.set(bx+Math.sin(smp.h)*0.05,ey+Math.sin(st.wheel*0.9)*0.004*Math.min(1,st.v/4)+(running?SHK.y*0.9+(SHK.buzz||0)*0.0035:0),bz+Math.cos(smp.h)*0.05);
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
    camera.rotateX(SHK.y*0.9);
    const deg=clamp(st.bar,-17,17);                     // Lenker dreht mit
    cockpitEl.style.transform='translate(-50%,'+(18.5+Math.abs(deg)*0.062-SHK.y*70-(SHK.buzz||0)*0.12).toFixed(2)+'%) rotate('+(deg+SHK.r*25).toFixed(2)+'deg)';
  }
  sky.position.copy(camera.position);sky.material.uniforms.time.value=now*0.001;
  const sc=running||st.done?1:3.2;
  sun.shadow.camera.left=-90*sc;sun.shadow.camera.right=90*sc;sun.shadow.camera.top=90*sc;sun.shadow.camera.bottom=-90*sc;sun.shadow.camera.far=520*sc;sun.shadow.camera.updateProjectionMatrix();
  sun.position.copy(ctr).addScaledVector(SUN,220*sc);sun.target.position.copy(ctr);sun.target.updateMatrixWorld();
  renderer.render(scene,camera);
  if(running||st.done)drawHud();
}
let last=performance.now();
function loop(now){
  const dt=clamp((now-last)/1000,0,0.05);last=now;
  update(dt);render(dt,now);
  requestAnimationFrame(loop);
}
window.__dbg={SHK:SHK,BUMPS:BUMPS,gnd:gnd,HS:HS,PX:PX,PZ:PZ,HW:HW,KV:KV,ROUTE:ROUTE,SURF:SURF,cam:camera,joggers:joggers,get st(){return st;},set pos(v){st.pos=v;camInit=false;},N:N,TOTAL:TOTAL,iTrail:iTrail,SEC:SEC,PY:PY,GR:GR};
menu('Start');
if(location.hash==='#go')start();
requestAnimationFrame(loop);
