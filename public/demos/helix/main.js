import * as THREE from './vendor/three.slim.js';

const canvas=document.getElementById('scene');
const track=document.getElementById('track');
const bar=document.getElementById('bar');
const codexTitle=document.querySelector('.line1');
const threeTitle=document.querySelector('.line2');
const transitionShade=document.getElementById('transitionShade');
const transitionTitle=document.getElementById('transitionTitle');
const introTrack=document.getElementById('introTrack');
const introStage=document.getElementById('introStage');
const introBlock=document.getElementById('introBlock');
const outro=document.getElementById('outro');
const outroBlock=document.getElementById('outroBlock');

const renderer=new THREE.WebGLRenderer({
  canvas,alpha:true,antialias:true,powerPreference:'high-performance'
});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.outputColorSpace=THREE.SRGBColorSpace;

const scene=new THREE.Scene();
const rig=new THREE.Group();
scene.add(rig);

const outlineGroup=new THREE.Group();
rig.add(outlineGroup);

const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.1,100);
camera.position.set(0,0,9.25);

const loader=new THREE.TextureLoader();
const cards=[];
const gridCards=[];
const COUNT=9;
const W_SEGS=32;
const GRID_H_SEGS=12;
const OUTLINE_SAMPLES=240;
const HELIX_CARD_H=1.34;
const HELIX_CARD_W=2.8;
const GRID_CARD_H=1.77;
const GRID_CARD_W=2.54;
const CARD_ASSETS=[
  './assets/work-01.svg',
  './assets/work-02.svg',
  './assets/work-03.svg',
  './assets/work-04.svg',
  './assets/work-05.svg',
  './assets/work-06.svg',
  './assets/work-07.svg',
  './assets/work-08.svg',
  './assets/work-09.svg'
];

// Optional local validation artwork; production ordering remains unchanged.
const validationParams=new URLSearchParams(location.search);
if(validationParams.has('validate'))history.scrollRestoration='manual';

// Homepage opening: ?intro=1 keeps the normal scroll timeline without the outro,
// and tells the parent page once the visitor has scrolled to the end.
const introMode=validationParams.has('intro');
const INTRO_HOLD=500;
let introEndStamp=null,introAnnounced=false,introDone=false;
if(introMode){
  history.scrollRestoration='manual';
  document.documentElement.classList.add('is-intro');
  addEventListener('keydown',e=>{
    if(e.key==='Escape')parent.postMessage({type:'baize:intro-skip'},location.origin);
  });
}
if(validationParams.get('artwork')==='mixed'){
  CARD_ASSETS.splice(0,CARD_ASSETS.length,
    './validation/assets/wide.jpg','./validation/assets/square.jpeg',
    './validation/assets/portrait.png','./validation/assets/tall.webp',
    './validation/assets/alpha.png','./validation/assets/alpha.webp',
    './validation/assets/square.svg','./validation/assets/wide.png',
    './validation/assets/portrait.jpg');
}

const R=4.45;
const Y_START=-1.09;
const pitchPerRad=0.82;

const MID=0.0;
const DIP_A=0.52;
const DIP_S=1.20;

const dsPerRad=Math.sqrt(R*R+pitchPerRad*pitchPerRad);

const CARD_ARC_WIDTH=2.18;
const GAP_ARC=0.24;
const STEP_ARC=CARD_ARC_WIDTH+GAP_ARC;

const TRAVEL_TURNS=3.18;
const TRAVEL_ARC=Math.PI*2*TRAVEL_TURNS*dsPerRad;
const BASE_ARC=-43.10;

const HELIX_START=.095;
const HELIX_END=.91;
const HELIX_MID=(HELIX_START+HELIX_END)*0.5;

/*
  Closing transition: build into a 3x2 stacked grid before
  the final helix card fully exits the top of the viewport.
*/
const STACK_START=.655;
const STACK_END=.985;
const GRID_ORDER=[1,2,3,4,5,6];
const GRID_TARGETS=[
  new THREE.Vector3(-2.72, 0.98, .12),
  new THREE.Vector3( 0.00, 0.98, .10),
  new THREE.Vector3( 2.72, 0.98, .08),
  new THREE.Vector3(-2.72,-0.98, .08),
  new THREE.Vector3( 0.00,-0.98, .06),
  new THREE.Vector3( 2.72,-0.98, .10)
];
const DESKTOP_GRID_TARGETS=GRID_TARGETS.map(target=>target.clone());
const GRID_ENTRANCES=[
  new THREE.Vector3(-8.2, 5.6,.55),
  new THREE.Vector3( 0.0, 5.95,.40),
  new THREE.Vector3( 8.2, 5.6,.55),
  new THREE.Vector3(-8.0,-5.75,.45),
  new THREE.Vector3( 0.0,-6.05,.36),
  new THREE.Vector3( 8.0,-5.75,.45)
];
const GRID_START_ROT=[
  new THREE.Euler(.06,-.16,-.18),
  new THREE.Euler(.11, .00,-.04),
  new THREE.Euler(.06, .16, .18),
  new THREE.Euler(-.05,-.15,-.17),
  new THREE.Euler(-.10, .00, .05),
  new THREE.Euler(-.05, .15, .17)
];
const STACK_STAGGER=.07;
const GRID_MOVE_DURATION=.34;
const STACK_ENTRY_FRACTION=.8;
const GRID_DESKTOP_BREAKPOINT=1200;
const GRID_MOBILE_BREAKPOINT=600;

let gridLayoutScale=1;

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>t*t*(3-2*t);
const smoother=t=>t*t*t*(t*(t*6-15)+10);

function dip(a){
  const d=(a-MID)/DIP_S;
  return DIP_A*Math.exp(-d*d);
}

function hPos(a,out=new THREE.Vector3()){
  out.set(
    R*Math.cos(a),
    Y_START+a*pitchPerRad-dip(a),
    R*Math.sin(a)
  );
  return out;
}

const _a=new THREE.Vector3(),_b=new THREE.Vector3();
function tangent(a,out=new THREE.Vector3()){
  const e=.0015;
  hPos(a-e,_a);
  hPos(a+e,_b);
  out.copy(_b).sub(_a).normalize();
  return out;
}

const _radial=new THREE.Vector3();
function upVector(a,tan,out=new THREE.Vector3()){
  const radial=_radial.set(Math.cos(a),0,Math.sin(a)).normalize();
  out.set(0,1,0);
  out.lerp(radial,.07);
  out.addScaledVector(tan,-out.dot(tan)).normalize();
  return out;
}

function getTextureDimensions(tex){
  const image=tex.image;
  return {
    width:image?.naturalWidth || image?.videoWidth || image?.width || 1,
    height:image?.naturalHeight || image?.videoHeight || image?.height || 1
  };
}

function updateCoverCrop(material,tex,targetAspect){
  const {width,height}=getTextureDimensions(tex);
  const imageAspect=width/height;
  const coverScale=material.uniforms.coverScale.value;

  if(imageAspect>targetAspect){
    coverScale.set(targetAspect/imageAspect,1);
  }else{
    coverScale.set(1,imageAspect/targetAspect);
  }
}

function buildCardMaterial(tex){
  return new THREE.ShaderMaterial({
    uniforms:{
      map:{value:tex},
      opacity:{value:1.0},
      coverScale:{value:new THREE.Vector2(1,1)}
    },
    transparent:true,
    side:THREE.DoubleSide,
    vertexShader:`
      varying vec2 vUv;
      void main(){
        vUv=uv;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
      }
    `,
    fragmentShader:`
      uniform sampler2D map;
      uniform float opacity;
      uniform vec2 coverScale;
      varying vec2 vUv;
      void main(){
        vec2 uv=(vUv-0.5)*coverScale+0.5;
        if(!gl_FrontFacing){
          uv.x=1.0-uv.x;
        }
        vec4 c=texture2D(map,uv);
        gl_FragColor=vec4(c.rgb,c.a*opacity);
        #include <colorspace_fragment>
      }
    `
  });
}

function loadCardTexture(url,targetAspect,onMaterialReady){
  const tex=loader.load(url,loadedTexture=>{
    updateCoverCrop(onMaterialReady(),loadedTexture,targetAspect);
    needsRender=true;
  });
  tex.colorSpace=THREE.SRGBColorSpace;
  return tex;
}

// The two guide lines carry the logo's heterochromia: blue above, yellow below.
const outlineUpperMaterial=new THREE.LineBasicMaterial({
  color:0x5a9be6,
  transparent:true,
  opacity:0.6,
  depthWrite:false,
  depthTest:true
});

const outlineLowerMaterial=new THREE.LineBasicMaterial({
  color:0xd8c04a,
  transparent:true,
  opacity:0.6,
  depthWrite:false,
  depthTest:false
});

// The guide lines keep one position buffer and rewrite it in place each frame.
function outlineGeometry(){
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(OUTLINE_SAMPLES*3),3));
  return geometry;
}
const outlineUpper=new THREE.Line(outlineGeometry(),outlineUpperMaterial);
const outlineLower=new THREE.Line(outlineGeometry(),outlineLowerMaterial);
outlineUpper.frustumCulled=false;
outlineLower.frustumCulled=false;
outlineUpper.renderOrder=1;
outlineLower.renderOrder=10;
outlineGroup.add(outlineUpper,outlineLower);

for(let i=0;i<COUNT;i++){
  const cardNumber=COUNT-i;
  let material;
  const tex=loadCardTexture(
    CARD_ASSETS[cardNumber-1],
    CARD_ARC_WIDTH/HELIX_CARD_H,
    ()=>material
  );
  material=buildCardMaterial(tex);

  const mesh=new THREE.Mesh(
    new THREE.PlaneGeometry(HELIX_CARD_W,HELIX_CARD_H,W_SEGS,1),
    material
  );
  mesh.frustumCulled=false;
  mesh.renderOrder=2;
  cards.push(mesh);
  rig.add(mesh);
}

for(let i=0;i<GRID_ORDER.length;i++){
  const asset=GRID_ORDER[i];
  let material;
  const tex=loadCardTexture(
    CARD_ASSETS[asset-1],
    GRID_CARD_W/GRID_CARD_H,
    ()=>material
  );
  material=buildCardMaterial(tex);

  const geo=new THREE.PlaneGeometry(GRID_CARD_W,GRID_CARD_H,W_SEGS,GRID_H_SEGS);
  const mesh=new THREE.Mesh(geo,material);
  mesh.frustumCulled=false;
  mesh.renderOrder=6;
  mesh.userData.base=Float32Array.from(geo.attributes.position.array);
  mesh.userData.slot=i;
  gridCards.push(mesh);
  scene.add(mesh);
}

function updateGridLayout(){
  if(innerWidth>=GRID_DESKTOP_BREAKPOINT){
    gridLayoutScale=1;
    GRID_TARGETS.forEach((target,index)=>target.copy(DESKTOP_GRID_TARGETS[index]));
    return;
  }

  const columns=innerWidth<=GRID_MOBILE_BREAKPOINT?1:2;
  const rows=Math.ceil(GRID_TARGETS.length/columns);
  const gapX=columns===1?0:.18;
  const gapY=columns===1?.12:.18;
  const baseWidth=columns*GRID_CARD_W+(columns-1)*gapX;
  const baseHeight=rows*GRID_CARD_H+(rows-1)*gapY;
  const worldHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*camera.position.z;
  const worldWidth=worldHeight*camera.aspect;
  const maxWidth=worldWidth*.9;
  const maxHeight=worldHeight*.88;

  gridLayoutScale=Math.min(1,maxWidth/baseWidth,maxHeight/baseHeight);

  GRID_TARGETS.forEach((target,index)=>{
    const column=index%columns;
    const row=Math.floor(index/columns);
    const x=(column-(columns-1)*.5)*(GRID_CARD_W+gapX)*gridLayoutScale;
    const y=((rows-1)*.5-row)*(GRID_CARD_H+gapY)*gridLayoutScale;
    target.set(x,y,DESKTOP_GRID_TARGETS[index].z);
  });
}

// QA diagnostics are DOM-readable only when explicitly requested.
let validationOutput=null,validationStamp=-Infinity;
if(validationParams.has('validate')){
  validationOutput=document.createElement('output');
  validationOutput.id='helix-validation-state';validationOutput.hidden=true;
  document.body.append(validationOutput);
}
let target=0,current=0,needsRender=true;
let introProgress=0;
let outroProgress=0;
function readScroll(){
  needsRender=true;
  const r=track.getBoundingClientRect();
  // A zero-size viewport would make this NaN, and the easing could never recover from it.
  const range=track.offsetHeight-innerHeight;
  if(range>0)target=clamp(-r.top/range);

  const ir=introTrack.getBoundingClientRect();

  /*
    The hero is not sticky; measure its natural upward travel
    through one viewport.
  */
  introProgress=clamp(-ir.top/innerHeight);

  const or=outro.getBoundingClientRect();
  /*
    Footer reverse-blend:
    begin once the footer starts entering the viewport and complete
    through most of its first viewport of travel.
  */
  outroProgress=clamp((innerHeight-or.top)/(innerHeight*0.92));
}

// Scratch vectors: the helix is rebuilt every frame, so avoid allocating per vertex.
const _cp=new THREE.Vector3(),_tan=new THREE.Vector3(),_up=new THREE.Vector3();
function wrapCardOnHelix(mesh,sArcStart){
  const pos=mesh.geometry.attributes.position;
  const cols=W_SEGS+1;

  for(let row=0;row<2;row++){
    const hOff=(row===0?-0.5:0.5)*HELIX_CARD_H;

    for(let col=0;col<cols;col++){
      const u=col/W_SEGS;
      const arc=sArcStart+u*CARD_ARC_WIDTH;
      const a=arc/dsPerRad;

      const cp=hPos(a,_cp);
      const tan=tangent(a,_tan);
      const up=upVector(a,tan,_up);

      const actualRow=row===0?1:0;
      const idx=actualRow*cols+col;
      pos.setXYZ(idx,cp.x+up.x*hOff,cp.y+up.y*hOff,cp.z+up.z*hOff);
    }
  }

  // Cards are never frustum culled, so their bounding spheres are not needed.
  pos.needsUpdate=true;
}

function updateOutline(line,centerArc,arcLength,heightOffset,opacity){
  const pos=line.geometry.attributes.position;
  const arcStart=centerArc-arcLength*0.5;
  const arcEnd=centerArc+arcLength*0.5;

  for(let i=0;i<OUTLINE_SAMPLES;i++){
    const u=i/(OUTLINE_SAMPLES-1);
    const arc=arcStart+(arcEnd-arcStart)*u;
    const a=arc/dsPerRad;

    const cp=hPos(a,_cp);
    const tan=tangent(a,_tan);
    const up=upVector(a,tan,_up);
    pos.setXYZ(i,cp.x+up.x*heightOffset,cp.y+up.y*heightOffset,cp.z+up.z*heightOffset);
  }

  pos.needsUpdate=true;
  line.material.opacity=opacity;
}

function updateGridCard(mesh,moveT,settleT,time){
  const posAttr=mesh.geometry.attributes.position;
  const base=mesh.userData.base;
  const windBase=1-settleT;
  const waveAmp=(0.05 + 0.25*(1-moveT))*Math.pow(windBase,0.88);

  for(let i=0;i<posAttr.count;i++){
    const ix=i*3;
    const x=base[ix];
    const y=base[ix+1];

    const rip1=Math.sin(x*2.25 + time*2.5 + mesh.userData.slot*.55);
    const rip2=Math.sin(y*6.4 + time*3.35 + mesh.userData.slot*.31);
    const rip3=Math.cos((x+y)*1.95 + time*2.05 + mesh.userData.slot*.77);

    const dx=(rip2*0.05 + rip3*0.02)*waveAmp;
    const dz=(rip1*0.82 + rip2*0.42 + rip3*0.52)*waveAmp;

    posAttr.setXYZ(i,x+dx,y,dz);
  }
  posAttr.needsUpdate=true;

  const slot=mesh.userData.slot;
  const p0=GRID_ENTRANCES[slot];
  const p1=GRID_TARGETS[slot];
  mesh.position.lerpVectors(p0,p1,moveT);

  const drift=(0.025 + 0.095*(1-moveT))*windBase;
  mesh.position.x += Math.sin(time*3.0+slot*.85)*drift;
  mesh.position.y += Math.cos(time*3.35+slot*.55)*drift*1.22;
  mesh.position.z += Math.sin(time*2.45+slot)*drift*0.75;

  const r0=GRID_START_ROT[slot];
  mesh.rotation.x=lerp(r0.x,0,moveT) + Math.sin(time*3.55+slot)*0.04*windBase;
  mesh.rotation.y=lerp(r0.y,0,moveT) + Math.cos(time*2.95+slot*.7)*0.05*windBase;
  mesh.rotation.z=lerp(r0.z,0,moveT) + Math.sin(time*3.8+slot*.9)*0.035*windBase;

  const sc=lerp(.95,1,moveT)*gridLayoutScale;
  mesh.scale.set(sc,sc,sc);
  mesh.material.uniforms.opacity.value=clamp(moveT*1.7);
}

function resize(){
  needsRender=true;
  renderer.setSize(innerWidth,innerHeight,false);
  camera.aspect=innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  camera.position.z=innerWidth<800?11.8:9.25;
  updateGridLayout();
  readScroll();
}

function updateIntro(tms){
  if(!introAnnounced&&[...cards,...gridCards].every(mesh=>mesh.material.uniforms.map.value.image?.naturalWidth>0)){
    introAnnounced=true;
    parent.postMessage({type:'baize:intro-ready'},location.origin);
  }
  // Scrolling back up before the hold ends cancels the exit.
  if(current<.995){
    introEndStamp=null;
    return;
  }
  if(introEndStamp===null)introEndStamp=tms;
  if(tms-introEndStamp>=INTRO_HOLD&&!introDone){
    introDone=true;
    parent.postMessage({type:'baize:intro-done'},location.origin);
  }
}

function animate(tms=0){
  requestAnimationFrame(animate);
  const time=tms*0.001;
  current+=(target-current)*.105;
  if(Math.abs(target-current)<1e-5)current=target;
  if(introMode)updateIntro(tms);

  const stackRaw=clamp((current-STACK_START)/(STACK_END-STACK_START));
  // At rest the scene is still, except while the closing cards are mid-flight and waving.
  const settled=current===target&&!(stackRaw>0&&stackRaw<1);
  if(settled&&!needsRender&&!validationOutput)return;
  needsRender=false;

  const hp=clamp((current-HELIX_START)/(HELIX_END-HELIX_START));
  const scrollArc=hp*TRAVEL_ARC;

  rig.position.set(0,0,0);

  const stackT=smoother(stackRaw);
  const helixFade=1-smooth(clamp((current-(STACK_START+.12))/((STACK_END-.04)-(STACK_START+.12))));

  cards.forEach((mesh,i)=>{
    const sArcStart=BASE_ARC+i*STEP_ARC+scrollArc;
    wrapCardOnHelix(mesh,sArcStart);

    const centerA=(sArcStart+CARD_ARC_WIDTH*.5)/dsPerRad;
    const c=hPos(centerA,_cp);
    const worldY=c.y+rig.position.y;

    const fadeTop=8.15;
    const fadeBottom=-7.9;
    const edge=Math.min(worldY-fadeBottom,fadeTop-worldY);
    const baseOpacity=clamp(edge/.85);
    mesh.material.uniforms.opacity.value=baseOpacity*helixFade;
  });

  const bandMidOffset=((COUNT-1)*STEP_ARC + CARD_ARC_WIDTH)*0.5;
  const bandStartCenter=BASE_ARC + bandMidOffset;

  let lineProgress;
  if(current<=HELIX_MID){
    lineProgress=0.5*clamp(current/HELIX_MID);
  }else{
    lineProgress=0.5+0.5*clamp((current-HELIX_MID)/(HELIX_END-HELIX_MID));
  }

  const OUTLINE_PHASE_ARC=Math.PI*dsPerRad;
  const outlineCenterArc=
    bandStartCenter +
    (1.0-lineProgress)*TRAVEL_ARC -
    OUTLINE_PHASE_ARC;

  const outlineArcLength=STEP_ARC*2.5;
  const outlineOffset=HELIX_CARD_H*0.72;
  const outlineShowIn=clamp(lineProgress/0.035);
  const outlineShowOut=clamp((1-lineProgress)/0.08);
  const outlineFade=1-smooth(clamp((current-(STACK_START+.1))/((STACK_END-.03)-(STACK_START+.1))));
  const outlineOpacity=0.9*Math.min(outlineShowIn,outlineShowOut)*outlineFade;

  updateOutline(outlineUpper,outlineCenterArc,outlineArcLength, outlineOffset, outlineOpacity);
  updateOutline(outlineLower,outlineCenterArc,outlineArcLength,-outlineOffset, outlineOpacity);

  const openT=clamp(hp/0.28);
  const openSmooth=openT*openT*(3-2*openT);
  const radialScale=0.72 + openSmooth*0.28;
  rig.scale.set(radialScale,1,radialScale);

  rig.rotation.z=THREE.MathUtils.degToRad(-1.0);
  rig.rotation.x=THREE.MathUtils.degToRad(1.5);
  rig.rotation.y=THREE.MathUtils.degToRad(-1.0);

  gridCards.forEach((mesh,idx)=>{
    const start=idx*STACK_STAGGER;
    const nextStart=idx<gridCards.length-1
      ? (idx+1)*STACK_STAGGER
      : 1.0;

    /*
      Maintain visible overlap during arrival and settling so earlier
      cards continue floating while later cards are approaching.
    */
    const entryEnd=Math.min(start+GRID_MOVE_DURATION,1.0);
    const moveT=smoother(clamp((stackRaw-start)/(entryEnd-start || 1)));

    const settleStart=idx<gridCards.length-1
      ? Math.min(nextStart+.02,.90)
      : Math.min(start+.10,.84);

    const settleEnd=idx<gridCards.length-1
      ? Math.min(settleStart+.40,.985)
      : 1.0;

    const settleT=smoother(
      clamp((stackRaw-settleStart)/(settleEnd-settleStart || 1))
    );

    updateGridCard(mesh,moveT,settleT,time);
  });

  camera.position.x=0;
  camera.position.y=0;
  camera.lookAt(0,.05,0);

  /*
    Editorial title timeline:
      1) enter and settle
      2) hold centered
      3) exit outward completely
      4) clear before the closing grid resolves

    This is intentionally independent of the stack timing.
  */
  const TITLE_ENTER_START=.055;
  const TITLE_ENTER_END=.17;
  const TITLE_HOLD_END=.565;
  const TITLE_EXIT_END=.735;

  const enterRaw=clamp((current-TITLE_ENTER_START)/(TITLE_ENTER_END-TITLE_ENTER_START));
  const enterT=smoother(enterRaw);

  const exitRaw=clamp((current-TITLE_HOLD_END)/(TITLE_EXIT_END-TITLE_HOLD_END));
  const exitT=smoother(exitRaw);

  const leftEnter=(1-enterT)*-72;
  const rightEnter=(1-enterT)*72;

  // Once the hold is over, send each title farther outward than its original entrance.
  const exitDistance=104*exitT;

  codexTitle.style.transform=`translate3d(${leftEnter-exitDistance}vw,0,0)`;
  threeTitle.style.transform=`translate3d(${rightEnter+exitDistance}vw,0,0)`;

  const titleOpacity=clamp(enterT*(1-exitT*0.35)*1.2);
  codexTitle.style.opacity=String(titleOpacity);
  threeTitle.style.opacity=String(titleOpacity);

  /*
    Opening transition — no sticky hero.

    The hero scrolls upward with the document. During the first part
    of that travel, the background blends to paper, the intro text
    blends to dark ink, and the content receives a subtle lift/scale.
  */
  const introBlend=smoother(clamp((introProgress-.035)/.30));
  const introLift=smoother(clamp((introProgress-.02)/.42));

  introBlock.style.transform=
    `translateY(calc(-50% - ${introLift*7.5}vh)) scale(${1-introLift*.018})`;

  const introDark=[14,13,11];
  const introLight=[20,18,15];
  const introTextLight=[242,236,226];
  const introTextDark=[242,236,226];

  const br=Math.round(lerp(introDark[0],introLight[0],introBlend));
  const bg=Math.round(lerp(introDark[1],introLight[1],introBlend));
  const bb=Math.round(lerp(introDark[2],introLight[2],introBlend));
  const tr=Math.round(lerp(introTextLight[0],introTextDark[0],introBlend));
  const tg=Math.round(lerp(introTextLight[1],introTextDark[1],introBlend));
  const tb=Math.round(lerp(introTextLight[2],introTextDark[2],introBlend));

  introStage.style.backgroundColor=`rgb(${br},${bg},${bb})`;
  introBlock.style.color=`rgb(${tr},${tg},${tb})`;

  // Sticky scene begins already light; only a tiny residual dark carry remains.
  const shadeT=smoother(clamp(current/.035));
  transitionShade.style.opacity=String((1-shadeT)*0.18);

  // Large transition title: appear immediately, hold briefly, then fade away.
  const ttIn=smoother(clamp(current/.018));
  const ttOut=smoother(clamp((current-.04)/.07));
  const ttOpacity=clamp(ttIn*(1-ttOut));
  transitionTitle.style.opacity=String(ttOpacity);
  const ttScale=lerp(.965,1,ttIn)-ttOut*.018;
  transitionTitle.style.transform=`translate(-50%,-50%) scale(${ttScale})`;

  /*
    Footer reverse of the hero:
    light -> dark background and dark -> light text as the footer enters.
  */
  const outroBlend=smoother(clamp((outroProgress-.05)/.82));
  const outroLift=smoother(clamp((outroProgress-.02)/.92));

  const outroLight=[20,18,15];
  const outroDark=[14,13,11];
  const outroTextDark=[242,236,226];
  const outroTextLight=[242,236,226];

  const obr=Math.round(lerp(outroLight[0],outroDark[0],outroBlend));
  const obg=Math.round(lerp(outroLight[1],outroDark[1],outroBlend));
  const obb=Math.round(lerp(outroLight[2],outroDark[2],outroBlend));
  const otr=Math.round(lerp(outroTextDark[0],outroTextLight[0],outroBlend));
  const otg=Math.round(lerp(outroTextDark[1],outroTextLight[1],outroBlend));
  const otb=Math.round(lerp(outroTextDark[2],outroTextLight[2],outroBlend));

  outro.style.backgroundColor=`rgb(${obr},${obg},${obb})`;
  outro.style.color=`rgb(${otr},${otg},${otb})`;
  outroBlock.style.color=`rgb(${otr},${otg},${otb})`;
  outroBlock.style.transform=`translateY(${(1-outroLift)*2.4}vh) scale(${1-outroLift*.015})`;

  bar.style.transform=`scaleX(${current})`;
  renderer.render(scene,camera);
  if(validationOutput&&tms-validationStamp>180){
    validationStamp=tms;
    const round=v=>Math.round(v*10000)/10000;
    const textureInfo=mesh=>{const tex=mesh.material.uniforms.map.value;const dimensions=getTextureDimensions(tex);return {source:tex.image?.currentSrc||tex.image?.src||'',...dimensions,cover:mesh.material.uniforms.coverScale.value.toArray().map(round)};};
    const curvature=mesh=>{const p=mesh.geometry.attributes.position;const a=new THREE.Vector3().fromBufferAttribute(p,0),b=new THREE.Vector3().fromBufferAttribute(p,W_SEGS),m=new THREE.Vector3().fromBufferAttribute(p,W_SEGS/2);return round(m.distanceTo(a.clone().lerp(b,.5)));};
    validationOutput.dataset.width=String(innerWidth);
    validationOutput.dataset.ready=String(Math.abs(target-current)<.001&&[...cards,...gridCards].every(mesh=>mesh.material.uniforms.map.value.image?.naturalWidth>0));
    validationOutput.value=JSON.stringify({
      viewport:[innerWidth,innerHeight],target:round(target),progress:round(current),
      camera:{fov:camera.fov,z:camera.position.z},
      travel:{cardArc:round(BASE_ARC+scrollArc),guideArc:round(outlineCenterArc)},
      helixCount:cards.length,columns:W_SEGS,curvature:cards.map(curvature),
      guides:{upper:{order:outlineUpper.renderOrder,depthTest:outlineUpper.material.depthTest,opacity:round(outlineUpper.material.opacity)},lower:{order:outlineLower.renderOrder,depthTest:outlineLower.material.depthTest,opacity:round(outlineLower.material.opacity)}},
      grid:{columns:innerWidth>=1200?3:innerWidth>600?2:1,scale:round(gridLayoutScale),cards:gridCards.map((mesh,index)=>({asset:GRID_ORDER[index],position:mesh.position.toArray().map(round),target:GRID_TARGETS[index].toArray().map(round),rotation:mesh.rotation.toArray().slice(0,3).map(round),opacity:round(mesh.material.uniforms.opacity.value),maxWave:round(Math.max(...Array.from(mesh.geometry.attributes.position.array).filter((_,i)=>i%3===2).map(Math.abs)))}))},
      textures:{helix:cards.map(textureInfo),grid:gridCards.map(textureInfo)},
      renderer:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles},
      introProgress:round(introProgress),outroProgress:round(outroProgress)
    });
  }
}

// Baize's pupils follow the pointer, matching the studio site's logo behaviour.
const pupils=[...document.querySelectorAll('.eye-pupil')].map(el=>({
  el,
  svg:el.ownerSVGElement,
  cx:parseFloat(el.getAttribute('cx')),
  cy:parseFloat(el.getAttribute('cy')),
  mx:parseFloat(el.dataset.mx),
  my:parseFloat(el.dataset.my)
}));
addEventListener('pointermove',e=>{
  pupils.forEach(p=>{
    const r=p.svg.getBoundingClientRect();
    if(!r.width||r.bottom<0||r.top>innerHeight)return;
    const dx=e.clientX-(r.left+p.cx/240*r.width);
    const dy=e.clientY-(r.top+p.cy/100*r.height);
    const dist=Math.hypot(dx,dy)||1;
    const reach=clamp(dist/(r.width*.8));
    p.el.setAttribute('transform',`translate(${dx/dist*p.mx*reach} ${dy/dist*p.my*reach})`);
  });
},{passive:true});

addEventListener('scroll',readScroll,{passive:true});
addEventListener('resize',resize);

resize();
readScroll();
function applyValidationPosition(){
  if(!validationParams.has('validate')||!validationParams.has('at'))return;
  const at=validationParams.get('at');let y;
  if(at.startsWith('intro:'))y=Number(at.slice(6))*innerHeight;
  else if(at.startsWith('footer:'))y=outro.offsetTop-innerHeight+Number(at.slice(7))*innerHeight;
  else y=track.offsetTop+clamp(Number(at))*(track.offsetHeight-innerHeight);
  if(Number.isFinite(y)){window.scrollTo({top:y,behavior:'instant'});readScroll();}
}
applyValidationPosition();
if(document.readyState!=='complete')addEventListener('load',applyValidationPosition,{once:true});

animate();
