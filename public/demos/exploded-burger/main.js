import * as THREE from '../helix/vendor/three.slim.js';

const PARTS = [
  {name:'芝麻麵包',en:'SESAME BUN',title:'從第一眼，到第一口。',description:'圓潤的輪廓與芝麻紋理，先替整體定下個性。',tint:'#e0a35a'},
  {name:'紫洋蔥',en:'RED ONION',title:'一點對比，就有層次。',description:'細緻的環狀結構，讓色彩、口感與造型多一分變化。',tint:'#a56bd6'},
  {name:'番茄',en:'TOMATO',title:'讓細節，保有鮮明。',description:'切面、厚度與種子紋理，都是可以被單獨說明的設計。',tint:'#e8574a'},
  {name:'生菜',en:'LETTUCE',title:'不規則，也是一種個性。',description:'展開柔軟的葉緣，看見每個層次如何與其他材料相接。',tint:'#86c04f'},
  {name:'切達起司',en:'CHEDDAR',title:'把不同，連在一起。',description:'薄片垂落的輪廓，示範柔軟材質與相鄰層之間的關係。',tint:'#f0b53c'},
  {name:'烤肉排',en:'BEEF PATTY',title:'核心，值得被看見。',description:'拆開外層，讓中心結構與表面紋理有自己的說明空間。',tint:'#b5714a'},
  {name:'底層麵包',en:'BASE BUN',title:'好結構，從基礎開始。',description:'回到底層，看它如何承接每一層，再一起組成完整產品。',tint:'#d9a561'},
];

// Scroll timeline, as shares of the pinned track.
const HERO_END = .05;
const EXPLODE_END = .30;
const FOCUS_END = .86;
const MERGE_END = .97;
const SEGMENT = (FOCUS_END - EXPLODE_END) / PARTS.length;

// Top to bottom, same order as PARTS. y: base height in the assembled burger and when apart.
const LAYERS = [
  {kind:'dome', y:.975, apart:3.42, tilt:.12, spin:-.9},
  {kind:'flat', file:'onion', size:1.0, thick:.07, shells:12, wave:.016, y:.945, apart:2.72, tilt:.62, spin:.7},
  {kind:'flat', file:'tomato', size:1.03, thick:.075, shells:12, wave:0, y:.86, apart:1.98, tilt:.62, spin:-.6},
  {kind:'flat', file:'lettuce', size:1.3, thick:.024, shells:5, wave:.075, yaw:Math.PI, y:.76, apart:1.27, tilt:.62, spin:.8},
  {kind:'flat', file:'cheese', size:.94, thick:.022, shells:4, drape:.12, yaw:Math.PI/4, y:.665, apart:.60, tilt:.62, spin:-.75},
  {kind:'puck', top:'patty-top', side:'patty-side', radius:1.03, thick:.33, lump:.022, band:[.42,.96], y:.31, apart:-.28, tilt:.5, spin:.65},
  {kind:'puck', top:'bun-cut', side:'bun-bottom-side', radius:1, thick:.33, lump:.008, band:[.1,.96], y:0, apart:-1.10, tilt:.45, spin:-.5},
];
const STACK_CENTRE = 1.05;
const APART_CENTRE = 1.68;
const FRAMING = {
  assembled:{height:3.9,width:3.1},
  apart:{height:6.5,width:3.2},
  focus:{height:3.7,width:3.4},
};

const clamp = (v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const smooth = t=>{const v=clamp(t);return v*v*(3-2*v);};
const smoother = t=>{const v=clamp(t);return v*v*v*(v*(v*6-15)+10);};

const root = document.documentElement;
const track = document.querySelector('#track');
const canvas = document.querySelector('#scene');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

const el = {
  heroA:document.querySelector('#hero-a'),
  heroB:document.querySelector('#hero-b'),
  hint:document.querySelector('#hint'),
  giant:document.querySelector('#giant'),
  caption:document.querySelector('#caption'),
  index:document.querySelector('#caption-index'),
  name:document.querySelector('#caption-name'),
  title:document.querySelector('#caption-title'),
  text:document.querySelector('#caption-text'),
  finale:document.querySelector('#finale'),
  bar:document.querySelector('#bar'),
  rail:document.querySelector('#rail'),
  buttons:[...document.querySelectorAll('[data-layer]')],
};

function fallback(){
  root.classList.remove('is-loading');
  root.classList.add('no-webgl');
}

let renderer;
try{
  renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});
}catch{
  fallback();
}

const SIDE_VERTEX = /* glsl */`
  attribute vec2 aSideUv;
  attribute vec2 aTopUv;
  varying vec2 vSideUv;
  varying vec2 vTopUv;
  varying vec3 vObjectNormal;
  varying vec3 vWorldNormal;
  void main(){
    vSideUv = aSideUv;
    vTopUv = aTopUv;
    vObjectNormal = normal;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SOLID_FRAGMENT = /* glsl */`
  uniform sampler2D uSide;
  uniform sampler2D uTop;
  uniform sampler2D uUnder;
  uniform float uDim;
  uniform vec2 uBlend;
  varying vec2 vSideUv;
  varying vec2 vTopUv;
  varying vec3 vObjectNormal;
  varying vec3 vWorldNormal;
  void main(){
    vec3 n = normalize(vObjectNormal);
    vec3 colour = mix(texture2D(uSide, vSideUv).rgb, texture2D(uTop, vTopUv).rgb, smoothstep(uBlend.x, uBlend.y, n.y));
    colour = mix(colour, texture2D(uUnder, vTopUv).rgb, smoothstep(-.45, -.8, n.y));
    float light = .8 + .22 * max(dot(normalize(vWorldNormal), normalize(vec3(-.35, .8, .55))), 0.);
    gl_FragColor = vec4(colour * light * uDim, 1.);
    #include <colorspace_fragment>
  }
`;
const FLAT_VERTEX = /* glsl */`
  attribute float aShade;
  varying vec2 vUv;
  varying float vShade;
  void main(){
    vUv = uv;
    vShade = aShade;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FLAT_FRAGMENT = /* glsl */`
  uniform sampler2D uMap;
  uniform float uDim;
  varying vec2 vUv;
  varying float vShade;
  void main(){
    vec4 tex = texture2D(uMap, vUv);
    if(tex.a < .5) discard;
    gl_FragColor = vec4(tex.rgb * vShade * uDim, tex.a);
    #include <colorspace_fragment>
  }
`;
const SHADOW_FRAGMENT = /* glsl */`
  uniform float uStrength;
  varying vec2 vUv;
  void main(){
    float d = length(vUv - .5) * 2.;
    gl_FragColor = vec4(0., 0., 0., uStrength * smoothstep(1., .62, d));
  }
`;
const DEBRIS_VERTEX = /* glsl */`
  attribute vec3 aStart;
  attribute vec3 aVelocity;
  attribute vec4 aMotion;
  attribute vec2 aCell;
  uniform float uBurst;
  uniform float uTime;
  uniform float uGrid;
  varying vec2 vUv;
  varying float vFade;
  void main(){
    float t = max(uBurst - aMotion.w * .18, 0.);
    float travel = 1. - exp(-3.2 * t);
    vec3 p = aStart + aVelocity * travel;
    p.x += sin(uTime * .5 + aMotion.y) * .035 * travel;
    p.y += cos(uTime * .4 + aMotion.y) * .035 * travel;
    float angle = aMotion.x * travel + aMotion.y;
    vec2 corner = vec2(cos(angle) * position.x - sin(angle) * position.y, sin(angle) * position.x + cos(angle) * position.y);
    vec4 view = modelViewMatrix * vec4(p, 1.);
    view.xy += corner * aMotion.z * smoothstep(0., .1, t);
    gl_Position = projectionMatrix * view;
    vUv = (aCell + uv) / uGrid;
    vFade = smoothstep(0., .08, t);
  }
`;
const DEBRIS_FRAGMENT = /* glsl */`
  uniform sampler2D uMap;
  uniform float uDim;
  varying vec2 vUv;
  varying float vFade;
  void main(){
    vec4 tex = texture2D(uMap, vUv);
    if(tex.a * vFade < .5) discard;
    gl_FragColor = vec4(tex.rgb * uDim, 1.);
    #include <colorspace_fragment>
  }
`;
const PLAIN_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main(){
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

function ringMesh(rows, segments, under, sideTexture, topTexture, underTexture, blend){
  // Surface of revolution. Each row: world r and y, and where that row sits in the side photo.
  const positions=[],sideUv=[],topUv=[],index=[];
  const radius=Math.max(...rows.map(row=>row.r));
  rows.forEach(row=>{
    for(let s=0;s<=segments;s++){
      const a=s/segments*Math.PI*2;
      const r=row.r*(1+(row.lump||0)*(Math.sin(a*3+1.1)*.6+Math.sin(a*7+.4)*.4)*Math.min(1,row.r/radius*1.4));
      const x=r*Math.sin(a),z=r*Math.cos(a);
      positions.push(x,row.y,z);
      // Fold the back half onto the front of the photo so there is no hard seam. A linear fold,
      // not a sine, or the photo's edge would smear when that side turns to face the camera.
      const fold=Math.asin(Math.sin(a))/(Math.PI/2);
      sideUv.push(row.cx+row.hw*.82*fold,1-row.v);
      topUv.push(.5+x/radius*.5,.5+z/radius*.5);
    }
  });
  const stride=segments+1;
  for(let r=0;r<rows.length-1;r++)for(let s=0;s<segments;s++){
    const a=r*stride+s,b=a+1,c=a+stride,d=c+1;
    index.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aSideUv',new THREE.Float32BufferAttribute(sideUv,2));
  geometry.setAttribute('aTopUv',new THREE.Float32BufferAttribute(topUv,2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // The first and last column share a position; average their normals to hide the join.
  const normal=geometry.attributes.normal;
  for(let r=0;r<rows.length;r++){
    const a=r*stride,b=a+segments;
    const nx=normal.getX(a)+normal.getX(b),ny=normal.getY(a)+normal.getY(b),nz=normal.getZ(a)+normal.getZ(b);
    const len=Math.hypot(nx,ny,nz)||1;
    normal.setXYZ(a,nx/len,ny/len,nz/len);normal.setXYZ(b,nx/len,ny/len,nz/len);
  }
  const material=new THREE.ShaderMaterial({
    vertexShader:SIDE_VERTEX,fragmentShader:SOLID_FRAGMENT,side:THREE.DoubleSide,
    uniforms:{uSide:{value:sideTexture},uTop:{value:topTexture},uUnder:{value:underTexture},uDim:{value:1},uBlend:{value:new THREE.Vector2(blend[0],blend[1])}},
  });
  return new THREE.Mesh(geometry,material);
}

function domeMesh(profile,textures){
  // The photographed bun curves back in under its widest point. Stop just below that and close
  // it flat, like a cut bun, so the narrow underside never shows as a pinched skirt.
  const widestAt=profile.reduce((best,row,i)=>row.r>profile[best].r?i:best,0);
  let end=widestAt;
  while(end<profile.length-1&&profile[end+1].r>.96)end++;
  const rows=profile.slice(0,end+1);
  const base=rows[rows.length-1];
  rows.forEach(row=>{row.y-=base.y;});
  // Close the silhouette at the crown and across the cut underside.
  rows.unshift({...rows[0],r:0,y:rows[0].y+.01});
  rows.push({...base,y:0,r:base.r*.985},{...base,y:0,r:0});
  return ringMesh(rows,96,true,textures['bun-top-side'],textures['bun-top-top'],textures['bun-cut'],[.6,.86]);
}

function puckMesh(layer,textures){
  const {radius,thick,band,lump}=layer;
  const rows=[];
  const fold=thick*.32;
  const add=(r,y,bandShare)=>rows.push({r,y,cx:.5,hw:.47,v:lerp(band[0],band[1],bandShare),lump});
  add(0,thick+.012,0);
  add(radius*.5,thick+.008,0);
  add(radius-fold*.9,thick,0);
  for(let i=1;i<=8;i++){
    const a=i/8*Math.PI/2;
    add(radius-fold+Math.sin(a)*fold,thick-fold+Math.cos(a)*fold,(1-Math.cos(a))*.3);
  }
  add(radius,fold,.7);
  for(let i=1;i<=6;i++){
    const a=i/6*Math.PI/2;
    add(radius-fold*(1-Math.cos(a)),fold-Math.sin(a)*fold,.7+.3*Math.sin(a));
  }
  add(0,0,1);
  return ringMesh(rows,96,true,textures[layer.side],textures[layer.top],textures['bun-cut'],[.55,.9]);
}

function flatMesh(layer,textures){
  // A stack of alpha-cut sheets. Edge-on, the stack reads as real thickness and keeps the
  // irregular silhouette of the leaf or the onion rings, which a modelled solid could not.
  const {size,thick,shells,wave=0,drape=0}=layer;
  const segments=28;
  const stride=segments+1;
  const positions=[],uvs=[],shade=[],index=[];
  for(let k=0;k<shells;k++){
    const share=k/Math.max(1,shells-1);
    const shrink=1-share*.018;
    for(let j=0;j<=segments;j++)for(let i=0;i<=segments;i++){
      const u=i/segments,v=j/segments;
      const x=(u-.5)*2*size*shrink,z=(v-.5)*2*size*shrink;
      const r=Math.hypot(x,z)/size;
      const angle=Math.atan2(z,x);
      let y=-share*thick;
      y+=wave*Math.sin(angle*4+1)*r*r+wave*.6*Math.sin(angle*7)*r*r;
      y-=drape*Math.max(0,r-.62)**2/.3;
      positions.push(x,y,z);uvs.push(u,1-v);shade.push(k===0?1:lerp(.86,.46,share));
    }
    const base=k*stride*stride;
    for(let j=0;j<segments;j++)for(let i=0;i<segments;i++){
      const a=base+j*stride+i,b=a+1,c=a+stride,d=c+1;
      index.push(a,c,b,b,c,d);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setAttribute('aShade',new THREE.Float32BufferAttribute(shade,1));
  geometry.setIndex(index);
  const material=new THREE.ShaderMaterial({
    vertexShader:FLAT_VERTEX,fragmentShader:FLAT_FRAGMENT,side:THREE.DoubleSide,alphaToCoverage:true,
    uniforms:{uMap:{value:textures[layer.file]},uDim:{value:1}},
  });
  return new THREE.Mesh(geometry,material);
}

function shadowDisc(radius){
  const material=new THREE.ShaderMaterial({
    vertexShader:PLAIN_VERTEX,fragmentShader:SHADOW_FRAGMENT,transparent:true,depthWrite:false,
    uniforms:{uStrength:{value:0}},
  });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(radius*2,radius*2),material);
  mesh.rotation.x=-Math.PI/2;
  return mesh;
}

function debrisMesh(meta,texture){
  const rng=(()=>{let s=20261105;return()=>(s=(s*16807)%2147483647)/2147483647;})();
  const {grid,origins}=meta;
  const count=190;
  const start=new Float32Array(count*3),velocity=new Float32Array(count*3),motion=new Float32Array(count*4),cell=new Float32Array(count*2);
  for(let i=0;i<count;i++){
    const c=Math.floor(rng()*origins.length);
    const origin=origins[c];
    const y=lerp(LAYERS[origin].y,LAYERS[origin].apart,rng());
    const a=rng()*Math.PI*2;
    const r=.2+rng()*.75;
    start[i*3]=Math.cos(a)*r;start[i*3+1]=y+(rng()-.5)*.25;start[i*3+2]=Math.sin(a)*r;
    const speed=1.3+rng()*3.2;
    velocity[i*3]=Math.cos(a)*speed;velocity[i*3+1]=(rng()-.5)*1.8;velocity[i*3+2]=Math.sin(a)*speed*.6;
    const seed=c<8;
    motion[i*4]=(rng()-.5)*11;
    motion[i*4+1]=rng()*Math.PI*2;
    motion[i*4+2]=seed?.022+rng()*.016:.022+rng()*rng()*.07;
    motion[i*4+3]=rng();
    cell[i*2]=c%grid;cell[i*2+1]=grid-1-Math.floor(c/grid);
  }
  const quad=new THREE.PlaneGeometry(2,2);
  const geometry=new THREE.InstancedBufferGeometry();
  geometry.index=quad.index;
  geometry.setAttribute('position',quad.attributes.position);
  geometry.setAttribute('uv',quad.attributes.uv);
  geometry.setAttribute('aStart',new THREE.InstancedBufferAttribute(start,3));
  geometry.setAttribute('aVelocity',new THREE.InstancedBufferAttribute(velocity,3));
  geometry.setAttribute('aMotion',new THREE.InstancedBufferAttribute(motion,4));
  geometry.setAttribute('aCell',new THREE.InstancedBufferAttribute(cell,2));
  geometry.instanceCount=count;
  const material=new THREE.ShaderMaterial({
    vertexShader:DEBRIS_VERTEX,fragmentShader:DEBRIS_FRAGMENT,side:THREE.DoubleSide,alphaToCoverage:true,
    uniforms:{uMap:{value:texture},uBurst:{value:0},uTime:{value:0},uDim:{value:1},uGrid:{value:grid}},
  });
  const mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;
  return mesh;
}

async function loadAssets(){
  const meta=await fetch('assets/layers.json').then(response=>response.json());
  const names=['onion','tomato','lettuce','cheese','bun-top-top','patty-top','bun-cut','bun-top-side','patty-side','bun-bottom-side','debris'];
  const loader=new THREE.TextureLoader();
  const anisotropy=renderer.capabilities.getMaxAnisotropy();
  const textures={};
  await Promise.all(names.map(async name=>{
    const texture=await loader.loadAsync(`assets/${name}.webp`);
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,anisotropy);
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    textures[name]=texture;
  }));
  return {meta,textures};
}

function buildScene({meta,textures}){
  const scene=new THREE.Scene();
  const world=new THREE.Group();
  scene.add(world);
  const items=LAYERS.map((layer,i)=>{
    const group=new THREE.Group();
    const mesh=layer.kind==='dome'?domeMesh(meta.bunProfile,textures):layer.kind==='puck'?puckMesh(layer,textures):flatMesh(layer,textures);
    group.add(mesh);
    const shadow=shadowDisc(layer.kind==='flat'?layer.size*1.02:1.1);
    shadow.position.y=layer.kind==='flat'?-(layer.thick+.012):-.012;
    if(i<LAYERS.length-1)group.add(shadow);
    world.add(group);
    return {layer,group,mesh,shadow};
  });
  const debris=debrisMesh(meta.debris,textures.debris);
  world.add(debris);
  const ground=shadowDisc(1.5);
  world.add(ground);
  return {scene,world,items,debris,ground};
}

function layerAmount(raw,index){
  // The middle of the burger lets go first, and the opening spreads outward from there.
  const distance=Math.abs(index-3)/3;
  return smoother(clamp(raw*1.3-distance*.3));
}

function focusWeights(p){
  return PARTS.map((_,i)=>{
    const u=(p-EXPLODE_END-i*SEGMENT)/SEGMENT;
    if(u<=0||u>=1)return 0;
    return smooth(u/.2)*(1-smooth((u-.8)/.2));
  });
}

function cameraFocus(p){
  // Rests on a layer for most of its segment, gliding to the next one in between.
  const x=clamp((p-EXPLODE_END)/SEGMENT-.5,-.5,PARTS.length-.5);
  const k=Math.floor(x);
  return clamp(k+smooth((x-k-.28)/.44),0,PARTS.length-1);
}

function distanceToFit(camera,framing){
  const t=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  return Math.max(framing.height/2/t,framing.width/2/(t*camera.aspect));
}

function start(built){
  const {scene,world,items,debris,ground}=built;
  const camera=new THREE.PerspectiveCamera(26,1,.1,100);
  const lookAt=new THREE.Vector3();
  let target=0,current=0,lastCaption=-1,lastTms=0,time=0;

  function readScroll(){
    const range=track.offsetHeight-innerHeight;
    if(range>0)target=clamp(-track.getBoundingClientRect().top/range);
  }
  function resize(){
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    renderer.setSize(innerWidth,innerHeight,false);
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    readScroll();
  }

  function setCaption(index){
    if(index===lastCaption)return;
    lastCaption=index;
    el.buttons.forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
    if(index<0)return;
    const part=PARTS[index];
    el.index.textContent=`${String(index+1).padStart(2,'0')} / 07`;
    el.name.textContent=part.name;
    el.title.textContent=part.title;
    el.text.textContent=part.description;
    el.giant.textContent=part.en;
    el.giant.style.color=part.tint;
  }

  function update(p){
    const still=reduced.matches;
    const raw=p<HERO_END?0:p<EXPLODE_END?(p-HERO_END)/(EXPLODE_END-HERO_END):p<FOCUS_END?1:1-(p-FOCUS_END)/(MERGE_END-FOCUS_END);
    const open=clamp(raw);
    const weights=focusWeights(p);
    const focusMax=Math.max(...weights);
    const zoom=smooth((p-EXPLODE_END)/.03)*(1-smooth((p-FOCUS_END+.03)/.03));

    items.forEach((item,i)=>{
      const {layer,group,mesh,shadow}=item;
      const amount=layerAmount(open,i);
      const w=weights[i];
      const u=clamp((p-EXPLODE_END-i*SEGMENT)/SEGMENT);
      // One full turn while in focus; the turn also unwinds smoothly on the way back.
      const turn=still?0:Math.PI*2*smooth((u-.08)/.84);
      group.position.y=lerp(layer.y,layer.apart,amount);
      group.position.z=w*.55;
      group.rotation.set(w*layer.tilt,(layer.yaw||0)+(still?0:layer.spin*2.4*amount)+turn,0,'XYZ');
      group.scale.setScalar(1+w*.08);
      const dim=1-.74*Math.max(0,focusMax-w);
      mesh.material.uniforms.uDim.value=dim;
      shadow.material.uniforms.uStrength.value=.5*(1-amount)**2;
    });

    debris.material.uniforms.uBurst.value=smooth(open)**1.5;
    debris.material.uniforms.uDim.value=1-.62*focusMax;
    debris.material.uniforms.uTime.value=still?0:time;
    ground.position.y=lerp(-.06,LAYERS[6].apart-.12,smooth(open));
    ground.material.uniforms.uStrength.value=.55*(1-smooth(open)*.75);

    const openShare=smooth(open);
    const fullDistance=lerp(distanceToFit(camera,FRAMING.assembled),distanceToFit(camera,FRAMING.apart),openShare);
    const distance=lerp(fullDistance,distanceToFit(camera,FRAMING.focus),zoom);
    const f=cameraFocus(p);
    const k=Math.floor(f);
    const focusY=lerp(LAYERS[k].apart,LAYERS[Math.min(k+1,6)].apart,f-k)+.05;
    const centre=lerp(STACK_CENTRE,APART_CENTRE,openShare);
    const y=lerp(centre,focusY,zoom);
    const elevation=THREE.MathUtils.degToRad(lerp(lerp(17,20,openShare),25,zoom));
    lookAt.set(0,y,0);
    camera.position.set(0,y+Math.sin(elevation)*distance,Math.cos(elevation)*distance);
    camera.lookAt(lookAt);

    // The whole burger breathes a little, and turns once as it closes back up.
    const closing=p>=FOCUS_END?Math.PI*2*smoother((p-FOCUS_END)/(MERGE_END-FOCUS_END)):0;
    world.rotation.y=(still?0:Math.sin(time*.35)*.05*(1-focusMax))+(still?0:closing);

    // Overlays.
    const heroOut=smoother((p-.012)/.07);
    el.heroA.style.transform=`translate3d(${-heroOut*90}vw,0,0)`;
    el.heroB.style.transform=`translate3d(${heroOut*90}vw,0,0)`;
    el.heroA.style.opacity=el.heroB.style.opacity=String(1-smooth((p-.05)/.03));
    el.hint.style.opacity=String(1-smooth(p/.02));
    const finaleIn=smooth((p-.93)/.04);
    el.finale.style.opacity=String(finaleIn);
    el.finale.style.transform=`translate3d(-50%,${(1-finaleIn)*18}px,0)`;

    let active=-1;
    weights.forEach((w,i)=>{if(w>.02&&(active<0||w>weights[active]))active=i;});
    if(p>EXPLODE_END&&p<FOCUS_END&&active>=0){
      setCaption(active);
      const u=clamp((p-EXPLODE_END-active*SEGMENT)/SEGMENT);
      el.caption.style.opacity=String(weights[active]);
      el.caption.style.transform=`translate3d(0,${(1-weights[active])*14}px,0)`;
      el.giant.style.opacity=String(weights[active]*.9);
      el.giant.style.transform=`translate3d(calc(-50% + ${(.5-u)*14}vw),-50%,0)`;
    }else{
      el.caption.style.opacity='0';
      el.giant.style.opacity='0';
      if(p<=EXPLODE_END||p>=FOCUS_END)setCaption(-1);
    }
    el.rail.classList.toggle('is-visible',p>EXPLODE_END-.02&&p<FOCUS_END+.01);
    el.bar.style.transform=`scaleX(${p})`;
  }

  function frame(tms=0){
    requestAnimationFrame(frame);
    const dt=Math.min(100,tms-lastTms);
    lastTms=tms;
    if(!reduced.matches)time+=dt/1000;
    current=reduced.matches?target:current+(target-current)*.1;
    if(Math.abs(target-current)<.0002)current=target;
    // Nothing to draw once the closing section has scrolled over the pinned stage.
    if(track.getBoundingClientRect().bottom<0)return;
    update(current);
    renderer.render(scene,camera);
  }

  function seek(p){
    const range=track.offsetHeight-innerHeight;
    scrollTo({top:track.offsetTop+clamp(p)*range,behavior:'instant'});
  }

  el.buttons.forEach((button,i)=>button.addEventListener('click',()=>seek(EXPLODE_END+(i+.5)*SEGMENT)));
  document.querySelectorAll('[data-action="restart"]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();seek(0);}));
  addEventListener('scroll',readScroll,{passive:true});
  addEventListener('resize',resize);
  resize();
  current=target;
  // One frame is drawn before the fade-in, so the page never reveals an empty canvas.
  update(current);
  renderer.render(scene,camera);
  root.classList.remove('is-loading');
  root.classList.add('is-ready');
  requestAnimationFrame(frame);
}

if(renderer){
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000,0);
  loadAssets().then(buildScene).then(start).catch(error=>{
    console.error(error);
    fallback();
  });
}
