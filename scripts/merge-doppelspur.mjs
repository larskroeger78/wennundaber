// Zieht doppelt gefahrene Abschnitte (GPS-Versatz einige Meter) auf eine gemeinsame Linie.
// Aufruf: node scripts/merge-doppelspur.mjs <route> [Radius_m=9]
// Aendert nur die Lage der Punkte (x,z,y); Punktzahl, Schrittweite und Reihenfolge bleiben, Oberflaechen-Dateien passen weiter.
import fs from 'fs';
const name=process.argv[2],R=+(process.argv[3]||9);
if(!name){console.error('Route angeben');process.exit(1);}
const f=`src/routes/${name}.json`,d=JSON.parse(fs.readFileSync(f,'utf8')),p=d.pts.map(a=>a.slice()),n=p.length,MIN=100;
const tang=(q,i)=>{const a=q[Math.max(0,i-3)],b=q[Math.min(n-1,i+3)];const dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz)||1;return[dx/l,dz/l];};
const stat=q=>{const H=new Map(),k=(x,z)=>Math.floor(x/12)+','+Math.floor(z/12);q.forEach((v,i)=>{const c=k(v[0],v[1]);(H.get(c)||H.set(c,[]).get(c)).push(i);});
  let c2=0,c12=0;q.forEach((v,i)=>{let m=99;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const j of H.get(k(v[0]+a*12,v[1]+b*12))||[])if(Math.abs(i-j)>MIN)m=Math.min(m,Math.hypot(q[j][0]-v[0],q[j][1]-v[1]));if(m<12)c12++;if(m<1.5)c2++;});return`${c12*d.step} m mit Parallelspur <12 m, davon ${c2*d.step} m <1,5 m`;};
console.log('vorher:',stat(p));
let cur=p;
for(let it=0;it<14;it++){
  const H=new Map(),k=(x,z)=>Math.floor(x/R)+','+Math.floor(z/R);cur.forEach((v,i)=>{const c=k(v[0],v[1]);(H.get(c)||H.set(c,[]).get(c)).push(i);});
  const T=cur.map((_,i)=>tang(cur,i)),dx=new Float64Array(n),dz=new Float64Array(n),dy=new Float64Array(n);
  for(let i=0;i<n;i++){let bj=-1,bd=R;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const j of H.get(k(cur[i][0]+a*R,cur[i][1]+b*R))||[]){
      if(Math.abs(i-j)<=MIN)continue;const dd=Math.hypot(cur[j][0]-cur[i][0],cur[j][1]-cur[i][1]);
      if(dd<bd&&Math.abs(cur[j][2]-cur[i][2])<2.5&&Math.abs(T[i][0]*T[j][0]+T[i][1]*T[j][1])>0.85){bd=dd;bj=j;}}
    if(bj>=0){const w=bd<=R*0.6?1:(R-bd)/(R*0.4);dx[i]=0.5*w*(cur[bj][0]-cur[i][0]);dz[i]=0.5*w*(cur[bj][1]-cur[i][1]);dy[i]=0.5*w*(cur[bj][2]-cur[i][2]);}}
  const nxt=cur.map((v,i)=>{let sx=0,sz=0,sy=0,c=0;for(let u=-4;u<=4;u++){const q=i+u;if(q<0||q>=n)continue;const wt=5-Math.abs(u);sx+=dx[q]*wt;sz+=dz[q]*wt;sy+=dy[q]*wt;c+=wt;}return[v[0]+sx/c,v[1]+sz/c,v[2]+sy/c];});
  cur=nxt;}
console.log('nachher:',stat(cur));
let L0=0,L1=0;for(let i=1;i<n;i++){L0+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);L1+=Math.hypot(cur[i][0]-cur[i-1][0],cur[i][1]-cur[i-1][1]);}
console.log('Laenge vorher/nachher (m):',L0.toFixed(0),L1.toFixed(0));
let mx=0;for(let i=0;i<n;i++)mx=Math.max(mx,Math.hypot(cur[i][0]-p[i][0],cur[i][1]-p[i][1]));console.log('groesste Verschiebung (m):',mx.toFixed(1));
if(process.argv.includes('--write')){d.pts=cur.map(v=>v.map(x=>Math.round(x*100)/100));fs.writeFileSync(f,JSON.stringify(d));console.log('geschrieben:',f);}
