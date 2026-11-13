// The TV's casing (thread "Fix TV side texture and slats"). Felix, 28 Oct: "The side of the tv doesn't have the best texture -
// and the ventilation slats could use some work as they keep creating artifacts when looked at from various angles (showing up
// as 1px wide lines that seem to be black/white)".
// The old vents were 54 slats 4.5 mm wide, on plates 1 mm off the shell, in an atlas of 4.6 mm to the texel: each slat's faces
// had a sliver of light map at most, whatever texel it fell on, so one slat came out dark and the next bright, and at a
// distance they fell between the pixels. Here there is no thin geometry left:
//  - tvVentsOff takes the slats and their plates out of the room;
//  - the vents are drawn on the shell itself, in its shader: slots with rounded ends, seen into (a ray from the eye finds the
//    slot's wall or its dark floor, so they have depth from any side), with their edges worked out from the pixel's size, and
//    fading to their average brightness before they get smaller than a pixel. Nothing there to shimmer;
//  - with the cleaned light maps (tvcase/clean_irr.py: no blotches, no dark rectangles under the old plates), the shell reads
//    them through the cubic B-spline of pccase/case.js and gets its moulded stipple.
// Wiring (tvcase/wire.py): tvVentsOff(root) once the scene is in, and in the load traverse, after the page's baked material,
//   o.material=tvCase(THREE,o.material,mname)
import { patch as cubicLight, stippleTex, CASE } from "../pccase/case.js";

// per vent: slots, pitch, half width, half length, depth (mm), and the plane's centre: all from the old vents' places in the
// room (metres). Slots are the shader's uniforms: change them from the console and the room follows.
export const VENT={
  side:{ at:[1.056,.082], slot:[6.4,1.45,44,7], n:13 },
  top:{ at:[0,.083], slot:[6.4,1.45,36,7], n:38 },
  rear:{ at:[1.038,0], slot:[6.8,1.5,78,7], n:12 },
  inner:[.03,.62,2.2],   // inside a slot, as a share of the shell's light: the floor, the wall at the rim, how fast it falls (mm)
};
const FACE={ x:.17, y:1.198, z:-.245 };   // the three planes the vents lie on
const clones=new Map(), uni={ ventSide:{value:VENT.side.slot}, ventTop:{value:VENT.top.slot}, ventRear:{value:VENT.rear.slot}, ventInner:{value:VENT.inner} };
export function tvVentsOff(root){ const gone=[]; root.traverse(o=>{ if(/^tv_(slat|vent)_(top|side|rear)/.test(o.name)) gone.push(o); }); for(const o of gone) o.parent.remove(o); return gone.length; }

const f=v=>v.toFixed(4);
const VENTS=`
varying vec3 vTvP;
uniform vec4 ventSide,ventTop,ventRear; uniform vec3 ventInner;
// how much of the shell's light is left at p (mm in the vent's plane, x across the slots, y along them; dx, dy: p's change per
// pixel), E the view in (across, along, into the shell), V the slots: pitch, half width, half length, depth
float tvSlots(vec2 p,vec2 dx,vec2 dy,vec3 E,vec4 V,float n){
  float u=p.x/V.x+n*.5, i=clamp(floor(u),0.,n-1.);
  vec2 q=vec2((u-i-.5)*V.x,p.y);
  float r=V.y*.92; vec2 e=abs(q)-V.yz+r, eo=max(e,0.), sq=sign(q);
  float sd=length(eo)+min(max(e.x,e.y),0.)-r;
  vec2 g=(eo.x>0.||eo.y>0.)?normalize(eo)*sq:(e.x>e.y?vec2(sq.x,0.):vec2(0.,sq.y));
  float px=max(length(vec2(dot(g,dx),dot(g,dy))),1e-4), cov=clamp(.5-sd/px,0.,1.);
  // into the slot: the ray from here, how deep it gets before a wall, and the wall's light at that depth
  vec2 t=E.xy/max(E.z,.02), to=vec2(t.x<0.?-1.:1.,t.y<0.?-1.:1.), w=(to*V.yz-clamp(q,-V.yz,V.yz))*to/(abs(t)+1e-4);
  float z=min(min(abs(w.x),abs(w.y)),V.w), inner=ventInner.x+ventInner.y*exp(-z/ventInner.z);
  float near=1.-cov*(1.-inner);
  // too small for a pixel: the vent's average, inside its outline
  float fp=max(abs(dx.x),abs(dy.x)), m=smoothstep(.22,.6,fp/V.x);
  if(m<=0.) return near;
  vec2 hs=vec2((n-1.)*.5*V.x+V.y,V.z), b=abs(p)-hs; float rc=clamp(.5-max(b.x/max(fp,1e-4),b.y/max(max(abs(dx.y),abs(dy.y)),1e-4)),0.,1.);
  float A=2.*V.y/V.x, mean=1.-A*(1.-mix(.12,.45,1.-E.z));
  return mix(near,mix(1.,mean,rc),m);
}
float tvVents(){
  vec3 P=vTvP, Dx=dFdx(P)*1e3, Dy=dFdy(P)*1e3, E=normalize(P-cameraPosition);
  if(abs(abs(P.x)-${f(FACE.x)})<.002) return tvSlots(vec2(P.z-${f(VENT.side.at[1])},P.y-${f(VENT.side.at[0])})*1e3,Dx.zy,Dy.zy,vec3(E.z,E.y,-sign(P.x)*E.x),ventSide,${VENT.side.n}.);
  if(abs(P.y-${f(FACE.y)})<.002) return tvSlots(vec2(P.x,P.z-${f(VENT.top.at[1])})*1e3,Dx.xz,Dy.xz,vec3(E.x,E.z,-E.y),ventTop,${VENT.top.n}.);
  if(abs(P.z-(${f(FACE.z)}))<.002) return tvSlots(vec2(P.y-${f(VENT.rear.at[0])},P.x)*1e3,Dx.yx,Dy.yx,vec3(E.y,E.x,E.z),ventRear,${VENT.rear.n}.);
  return 1.;
}
`;
// The hairline along the seam behind the bezel, a pixel wide at any zoom: the bezel's rounded back edge turns away from the eye,
// and there, with the normal square to the view, the lamps' highlight (their direct specular) runs away. It goes out as the
// surface turns edge-on.
const RIM="reflectedLight.directSpecular*=smoothstep(0.,.35,saturate(dot(normal,normalize(vViewPosition))));\n#include <aomap_fragment>";
export function tvCase(THREE,m,name){
  if(clones.has(m)) return clones.get(m);
  if(!m?.lightMap) return m;
  const c=m.clone(), obc=m.onBeforeCompile, key=m.customProgramCacheKey, shell=name==="tv_plastic", t=stippleTex(THREE);
  c.onBeforeCompile=(sh,r)=>{ obc.call(c,sh,r); cubicLight(sh); sh.fragmentShader=sh.fragmentShader.replace("#include <aomap_fragment>",RIM);
    if(!shell) return;
    Object.assign(sh.uniforms,uni);
    sh.vertexShader=sh.vertexShader.replace("#include <common>","#include <common>\nvarying vec3 vTvP;").replace("#include <project_vertex>","#include <project_vertex>\n  vTvP=(modelMatrix*vec4(transformed,1.)).xyz;");
    sh.fragmentShader=sh.fragmentShader.replace("void main() {",VENTS+"void main() {").replace("#include <opaque_fragment>","outgoingLight*=tvVents();\n#include <opaque_fragment>"); };
  c.customProgramCacheKey=()=>key.call(c)+"|tvcase"+(shell?":shell":"");
  c.userData.tvCase=name;
  c.bumpMap=t; c.bumpScale=CASE.grain; c.roughnessMap=t; c.roughness=Math.min(1,m.roughness*2/(CASE.rough[0]+CASE.rough[1]));
  clones.set(m,c); return c;
}
