import * as THREE from 'three';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
const loadingStep = document.querySelector('#loadingStep');
const loadingBar = document.querySelector('#loadingBar');
const statusText = document.querySelector('#statusText');
const status = document.querySelector('.status');
const timeSlider = document.querySelector('#timeSlider');
const timeLabel = document.querySelector('#timeLabel');
const info = document.querySelector('#info');
const infoTitle = document.querySelector('#infoTitle');
const infoType = document.querySelector('#infoType');
const infoDetails = document.querySelector('#infoDetails');
const closeInfo = document.querySelector('#closeInfo');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb8c4be);
scene.fog = new THREE.FogExp2(0xb8c4be, 0.000095);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 1, 30000);
camera.position.set(2600, 1800, 3200);

const world = new THREE.Group();
scene.add(world);

const hemi = new THREE.HemisphereLight(0xdde9e8, 0x5d594f, 1.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d2, 3.1);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -4500; sun.shadow.camera.right = 4500;
sun.shadow.camera.top = 4500; sun.shadow.camera.bottom = -4500;
sun.shadow.camera.near = 50; sun.shadow.camera.far = 9000;
sun.shadow.bias = -0.00025;
scene.add(sun); scene.add(sun.target);

const fill = new THREE.DirectionalLight(0xa8c6d4, .6);
fill.position.set(-2500, 1800, -1800);
scene.add(fill);

const centerLat = 49.25;
const centerLon = 6.095;
const metersPerLat = 111320;
const metersPerLon = 111320 * Math.cos(centerLat * Math.PI / 180);
const TERRAIN_EXAGGERATION = 1.28;
let terrainData;
let osmData;
let terrainMesh;
let minElev = 150;
let waterMaterials = [];
let nightPoints = [];
let nightEmissiveMaterials = [];
let animated = [];
let railPaths = [];
let roadPaths = [];
let industrialCentroids = [];
let forestPolygons = [];
let interactive = [];
let lodNearObjects = [];
let landmarkPositions = new Map();
let introActive = true;
let cameraTween = null;
let currentTime = 16.5;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setProgress(p, text) { loadingBar.style.width = `${p}%`; if (text) loadingStep.textContent = text; }
function project(lat, lon) { return { x: (lon - centerLon) * metersPerLon, z: -(lat - centerLat) * metersPerLat }; }
function unproject(x, z) { return { lon: centerLon + x / metersPerLon, lat: centerLat - z / metersPerLat }; }

function elevationAt(lat, lon) {
  if (!terrainData) return 170;
  const { bbox, rows, cols, elevations } = terrainData;
  const u = THREE.MathUtils.clamp((lon - bbox.west) / (bbox.east - bbox.west), 0, 1) * (cols - 1);
  const v = THREE.MathUtils.clamp((bbox.north - lat) / (bbox.north - bbox.south), 0, 1) * (rows - 1);
  const c0 = Math.floor(u), r0 = Math.floor(v), c1 = Math.min(c0 + 1, cols - 1), r1 = Math.min(r0 + 1, rows - 1);
  const fu = u - c0, fv = v - r0;
  const a = elevations[r0 * cols + c0], b = elevations[r0 * cols + c1], c = elevations[r1 * cols + c0], d = elevations[r1 * cols + c1];
  const raw = THREE.MathUtils.lerp(THREE.MathUtils.lerp(a,b,fu), THREE.MathUtils.lerp(c,d,fu), fv);
  return minElev + (raw - minElev) * TERRAIN_EXAGGERATION;
}
function elevationXZ(x,z) { const g=unproject(x,z); return elevationAt(g.lat,g.lon); }

function makeTerrain() {
  const { bbox, rows, cols, elevations } = terrainData;
  minElev = Math.min(...elevations.filter(Number.isFinite));
  const positions = [], colors = [], indices = [];
  const color = new THREE.Color();
  for (let r=0;r<rows;r++) for(let c=0;c<cols;c++) {
    const lat = bbox.north - (bbox.north-bbox.south) * r/(rows-1);
    const lon = bbox.west + (bbox.east-bbox.west) * c/(cols-1);
    const {x,z} = project(lat,lon);
    const raw = elevations[r*cols+c];
    const y = minElev + (raw-minElev)*TERRAIN_EXAGGERATION;
    positions.push(x,y,z);
    const t = THREE.MathUtils.clamp((raw-165)/220,0,1);
    color.setHSL(0.22 - t*.04, .13 + t*.08, .58 - t*.18);
    colors.push(color.r,color.g,color.b);
  }
  for(let r=0;r<rows-1;r++) for(let c=0;c<cols-1;c++) {
    const a=r*cols+c,b=a+1,d=(r+1)*cols+c,e=d+1;
    indices.push(a,d,b,b,d,e);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.setIndex(indices); geo.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,metalness:0});
  terrainMesh=new THREE.Mesh(geo,mat); terrainMesh.receiveShadow=true; terrainMesh.name='Terrain'; world.add(terrainMesh);

  const skirtMat=new THREE.MeshStandardMaterial({color:0x51534b,roughness:1});
  const sizeX=Math.abs(project(centerLat,bbox.east).x-project(centerLat,bbox.west).x);
  const sizeZ=Math.abs(project(bbox.north,centerLon).z-project(bbox.south,centerLon).z);
  const base=new THREE.Mesh(new THREE.BoxGeometry(sizeX+80,120,sizeZ+80),skirtMat);
  base.position.y=minElev-62; base.receiveShadow=true; world.add(base);
}

function cleanGeometry(el) {
  if (el.geometry?.length) return [el.geometry];
  if (!el.members?.length) return [];
  const same=(a,b)=>Math.abs(a.lat-b.lat)<1e-6&&Math.abs(a.lon-b.lon)<1e-6;
  const segs=el.members.filter(m=>m.geometry?.length&&m.role!=='inner').map(m=>m.geometry.map(p=>({lat:p.lat,lon:p.lon})));
  const rings=[];
  while(segs.length){
    let ring=segs.shift();let changed=true;
    while(changed&&!same(ring[0],ring.at(-1))){
      changed=false;
      for(let i=0;i<segs.length;i++){const g=segs[i],last=ring.at(-1);if(same(last,g[0])){ring.push(...g.slice(1));segs.splice(i,1);changed=true;break;}if(same(last,g.at(-1))){ring.push(...g.slice(0,-1).reverse());segs.splice(i,1);changed=true;break;}}
    }
    if(ring.length>3&&same(ring[0],ring.at(-1)))rings.push(ring);
  }
  return rings;
}
function coordsFromGeom(g){ return g.map(p=>{const {x,z}=project(p.lat,p.lon);return {x,z,lat:p.lat,lon:p.lon,y:elevationAt(p.lat,p.lon)};}); }
function centroidOf(coords){ let x=0,z=0; for(const p of coords){x+=p.x;z+=p.z;} return {x:x/coords.length,z:z/coords.length}; }
function polygonShape(coords) {
  if(coords.length<3) return null;
  const pts=coords.slice();
  if(Math.hypot(pts[0].x-pts.at(-1).x,pts[0].z-pts.at(-1).z)<.1) pts.pop();
  if(pts.length<3) return null;
  const shape=new THREE.Shape(); shape.moveTo(pts[0].x,-pts[0].z);
  for(let i=1;i<pts.length;i++) shape.lineTo(pts[i].x,-pts[i].z);
  shape.closePath(); return shape;
}
function buildingHeight(tags={}) {
  const parseNum=v=>Number(String(v??'').replace(',','.').replace(/[^0-9.\-]/g,''));
  let h=parseNum(tags.height);
  if(!Number.isFinite(h)||h<2){const lv=parseNum(tags['building:levels']);if(Number.isFinite(lv)&&lv>0)h=lv*3.1;}
  if(!Number.isFinite(h)||h<2){
    const t=(tags.building||'').toLowerCase();
    h = /church|cathedral/.test(t)?18:/industrial|warehouse/.test(t)?9:/apartments|residential/.test(t)?11:/garage|shed/.test(t)?3.5:7.5;
  }
  return THREE.MathUtils.clamp(h,2.8,55);
}
function buildingBase(coords){let sum=0; for(const p of coords)sum+=p.y; return sum/coords.length;}
function mergeGeometries(list){
  if(!list.length)return null;
  let totalVerts=0,totalIdx=0;
  for(const g of list){totalVerts+=g.attributes.position.count;totalIdx+=g.index?g.index.count:g.attributes.position.count;}
  const pos=new Float32Array(totalVerts*3),nor=new Float32Array(totalVerts*3),uv=new Float32Array(totalVerts*2),idx=totalVerts>65535?new Uint32Array(totalIdx):new Uint16Array(totalIdx);
  let vo=0,io=0;
  for(const g of list){
    const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
    pos.set(p.array,vo*3); if(n)nor.set(n.array,vo*3); if(u)uv.set(u.array,vo*2);
    if(g.index){for(let i=0;i<g.index.count;i++)idx[io++]=g.index.getX(i)+vo;} else {for(let i=0;i<p.count;i++)idx[io++]=i+vo;}
    vo+=p.count;
  }
  const out=new THREE.BufferGeometry(); out.setAttribute('position',new THREE.BufferAttribute(pos,3)); out.setAttribute('normal',new THREE.BufferAttribute(nor,3)); out.setAttribute('uv',new THREE.BufferAttribute(uv,2)); out.setIndex(new THREE.BufferAttribute(idx,1)); out.computeBoundingSphere(); return out;
}

const mats={
  buildings:new THREE.MeshStandardMaterial({color:0xcac7bd,roughness:.82,metalness:.02}),
  industrialBuildings:new THREE.MeshStandardMaterial({color:0x9c9790,roughness:.7,metalness:.12}),
  landmark:new THREE.MeshStandardMaterial({color:0xd8c9ae,roughness:.74,metalness:.02,emissive:0x000000}),
  forest:new THREE.MeshStandardMaterial({color:0x426452,roughness:1,transparent:true,opacity:.70,polygonOffset:true,polygonOffsetFactor:-2}),
  industrial:new THREE.MeshStandardMaterial({color:0x756b63,roughness:.94,transparent:true,opacity:.60,polygonOffset:true,polygonOffsetFactor:-3}),
  commercial:new THREE.MeshStandardMaterial({color:0x8a8174,roughness:.9,transparent:true,opacity:.38,polygonOffset:true,polygonOffsetFactor:-3}),
  road:new THREE.MeshStandardMaterial({color:0xd1cec3,roughness:.95}),
  majorRoad:new THREE.MeshStandardMaterial({color:0xb9b6ad,roughness:.92}),
  bridge:new THREE.MeshStandardMaterial({color:0xd8d6cf,roughness:.75,metalness:.05}),
  rail:new THREE.MeshStandardMaterial({color:0x3f4748,roughness:.7,metalness:.15}),
  sleeper:new THREE.MeshStandardMaterial({color:0x5b554f,roughness:.9}),
  water:new THREE.MeshPhysicalMaterial({color:0x3f7e91,roughness:.25,metalness:.02,transparent:true,opacity:.78,clearcoat:.6,clearcoatRoughness:.2}),
  waterway:new THREE.MeshPhysicalMaterial({color:0x4a8899,roughness:.28,transparent:true,opacity:.82,clearcoat:.5}),
};

function makeArea(el, material, lift=1.1) {
  for(const g of cleanGeometry(el)){
    const coords=coordsFromGeom(g); const shape=polygonShape(coords); if(!shape)continue;
    const geo=new THREE.ShapeGeometry(shape, 8); geo.rotateX(-Math.PI/2);
    const base=buildingBase(coords)+lift; geo.translate(0,base,0);
    const mesh=new THREE.Mesh(geo,material); mesh.receiveShadow=true; world.add(mesh);
    if(el.tags?.name){mesh.userData={name:el.tags.name,tags:el.tags,type:'Zone'};interactive.push(mesh);}
    if(el.tags?.landuse==='industrial'){const c=centroidOf(coords),xs=coords.map(p=>p.x),zs=coords.map(p=>p.z);industrialCentroids.push({...c,area:(Math.max(...xs)-Math.min(...xs))*(Math.max(...zs)-Math.min(...zs))});}
  }
}

function ribbonGeometry(coords,width,lift=1.3){
  if(coords.length<2)return null;
  const positions=[],indices=[]; let vi=0;
  for(let i=0;i<coords.length-1;i++){
    const a=coords[i],b=coords[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,nx=-dz/len*width/2,nz=dx/len*width/2;
    const ya=elevationXZ(a.x,a.z)+lift,yb=elevationXZ(b.x,b.z)+lift;
    positions.push(a.x+nx,ya,a.z+nz,a.x-nx,ya,a.z-nz,b.x+nx,yb,b.z+nz,b.x-nx,yb,b.z-nz);
    indices.push(vi,vi+1,vi+2,vi+2,vi+1,vi+3); vi+=4;
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
function addMergedMeshes(geos,material,batch=500){
  const made=[];for(let i=0;i<geos.length;i+=batch){const geo=mergeGeometries(geos.slice(i,i+batch));if(!geo)continue;const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;world.add(mesh);made.push(mesh);}return made;
}
function makeRibbon(coords,width,material,lift=1.3,userData=null){
  const geo=ribbonGeometry(coords,width,lift);if(!geo)return null;const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;world.add(mesh);if(userData){mesh.userData=userData;interactive.push(mesh);}return mesh;
}
function addBuildings(elements){
  const regular=[],industrial=[]; let buildingCount=0,namedCount=0;
  for(const el of elements){
    if(!el.tags?.building)continue;
    const geometries=cleanGeometry(el);
    for(const geom of geometries){
      if(!geom?.length)continue;
      const coords=coordsFromGeom(geom);if(el.type==='relation'&&coords.length>2&&Math.hypot(coords[0].x-coords.at(-1).x,coords[0].z-coords.at(-1).z)>3)continue;const shape=polygonShape(coords);if(!shape)continue;
      const h=buildingHeight(el.tags), base=buildingBase(coords);
      const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:1,steps:1});geo.rotateX(-Math.PI/2);geo.translate(0,base,0);
      const isInd=/industrial|warehouse|factory/.test(el.tags.building||'');
      const isLandmark=!!el.tags.name || /church/.test(el.tags.building||'');
      if(isLandmark){
        const mesh=new THREE.Mesh(geo,mats.landmark);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData={name:el.tags.name||'Bâtiment',tags:el.tags,type:'Bâtiment'};world.add(mesh);interactive.push(mesh);namedCount++;
        if(el.tags.name){const c=centroidOf(coords);landmarkPositions.set(el.tags.name.toLowerCase(),new THREE.Vector3(c.x,base+h,c.z));}
      }else{(isInd?industrial:regular).push(geo);}
      buildingCount++;
      if(Math.random()<.16){const c=centroidOf(coords);for(let w=0;w<(Math.random()<.22?2:1);w++)nightPoints.push(new THREE.Vector3(c.x+(Math.random()-.5)*3.5,base+Math.min(h*(.35+Math.random()*.45),h-1),c.z+(Math.random()-.5)*3.5));}
    }
  }
  addMergedMeshes(regular,mats.buildings,450);addMergedMeshes(industrial,mats.industrialBuildings,450);
  console.log(`Bâtiments: ${buildingCount} (${namedCount} nommés/interactifs)`);
  return buildingCount;
}
function roadWidth(tags){const h=tags.highway;return ({motorway:15,trunk:13,primary:11,secondary:9,tertiary:7,residential:5.5,unclassified:5,service:3.5,living_street:4.5,track:2.2,path:1.6,footway:1.3,cycleway:1.8})[h]||3.2;}
function makeTransport(elements){
  const minor=[],major=[],bridges=[],rails=[],waters=[];
  for(const el of elements){
    if(el.type!=='way'||!el.geometry?.length)continue;
    if(el.tags?.highway){
      const c=coordsFromGeom(el.geometry),isMajor=/motorway|trunk|primary|secondary/.test(el.tags.highway),bridge=el.tags.bridge&&el.tags.bridge!=='no';
      const geo=ribbonGeometry(c,roadWidth(el.tags),bridge?5:1.6);if(geo)(bridge?bridges:isMajor?major:minor).push(geo);
      if(c.length>2&&/primary|secondary|tertiary/.test(el.tags.highway))roadPaths.push(c);
    }
    if(el.tags?.railway && /rail|light_rail/.test(el.tags.railway)){
      const c=coordsFromGeom(el.geometry),geo=ribbonGeometry(c,3.3,el.tags.bridge?5.5:2.2);if(geo)rails.push(geo);if(c.length>2)railPaths.push(c);
    }
    if(el.tags?.waterway){
      const c=coordsFromGeom(el.geometry),w=el.tags.waterway==='river'?18:el.tags.waterway==='canal'?11:5,geo=ribbonGeometry(c,w,.7);if(geo)waters.push(geo);
    }
  }
  lodNearObjects.push(...addMergedMeshes(minor,mats.road,650));addMergedMeshes(major,mats.majorRoad,400);addMergedMeshes(bridges,mats.bridge,250);addMergedMeshes(rails,mats.rail,250);addMergedMeshes(waters,mats.waterway,250);waterMaterials.push(mats.waterway);
}
function makeWaterAndLand(elements){
  for(const el of elements){
    if(el.tags?.natural==='water'){makeArea(el,mats.water,.55);waterMaterials.push(mats.water);}
    if(el.tags?.natural==='wood'||el.tags?.landuse==='forest'){for(const g of cleanGeometry(el)){const c=coordsFromGeom(g);if(c.length>3)forestPolygons.push(c);}}
    if(el.tags?.landuse==='industrial')makeArea(el,mats.industrial,.48);
    if(el.tags?.landuse==='commercial')makeArea(el,mats.commercial,.48);
  }
}
function pointInPolygon(x,z,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const xi=poly[i].x,zi=poly[i].z,xj=poly[j].x,zj=poly[j].z;const hit=((zi>z)!=(zj>z))&&(x<(xj-xi)*(z-zi)/(zj-zi+1e-9)+xi);if(hit)inside=!inside;}return inside;}
function addForestTrees(){
  if(!forestPolygons.length)return;
  const trunkMat=new THREE.MeshStandardMaterial({color:0x5a4a39,roughness:1});
  const crownMat=new THREE.MeshStandardMaterial({color:0x365847,roughness:.96});
  const trunkGeo=new THREE.CylinderGeometry(.55,.75,6,5),crownGeo=new THREE.ConeGeometry(4.2,13,7);
  const placements=[];let seed=937261;const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  for(const poly of forestPolygons){
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of poly){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
    const area=(maxX-minX)*(maxZ-minZ),target=Math.min(85,Math.max(3,Math.round(area/4200)));let attempts=0,added=0;
    while(added<target&&attempts<target*18&&placements.length<1100){attempts++;const x=THREE.MathUtils.lerp(minX,maxX,rnd()),z=THREE.MathUtils.lerp(minZ,maxZ,rnd());if(!pointInPolygon(x,z,poly))continue;placements.push({x,z,s:.72+rnd()*.75});added++;}
    if(placements.length>=1100)break;
  }
  if(!placements.length)return;
  const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,placements.length),crowns=new THREE.InstancedMesh(crownGeo,crownMat,placements.length);trunks.castShadow=true;crowns.castShadow=true;trunks.receiveShadow=true;crowns.receiveShadow=true;
  const d=new THREE.Object3D();placements.forEach((p,i)=>{const y=elevationXZ(p.x,p.z);d.position.set(p.x,y+3*p.s,p.z);d.scale.set(p.s,p.s,p.s);d.rotation.y=(i*.618)%Math.PI;d.updateMatrix();trunks.setMatrixAt(i,d.matrix);d.position.y=y+(10.5*p.s);d.updateMatrix();crowns.setMatrixAt(i,d.matrix);});
  world.add(trunks,crowns);lodNearObjects.push(trunks,crowns);
}

function makeBeam(a,b,r,mat,parent){const mid=a.clone().add(b).multiplyScalar(.5),len=a.distanceTo(b);const geo=new THREE.CylinderGeometry(r,r,len,6);const mesh=new THREE.Mesh(geo,mat);mesh.position.copy(mid);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());mesh.castShadow=true;parent.add(mesh);return mesh;}
function addDrinceTower(elements){
  let el=elements.find(e=>e.tags?.man_made==='tower'&&/drince/i.test(e.tags?.name||''))||elements.find(e=>/tour de drince/i.test(e.tags?.name||''));
  let lat=49.237354,lon=6.092295,tags={name:'Tour de Drince',man_made:'tower',height:'25',source:'position de secours documentée'};
  if(el){tags=el.tags||tags;if(el.lat){lat=el.lat;lon=el.lon}else if(el.center){lat=el.center.lat;lon=el.center.lon}else{const g=el.geometry[Math.floor(el.geometry.length/2)];lat=g.lat;lon=g.lon;}}
  const {x,z}=project(lat,lon),y=elevationAt(lat,lon)+1;
  const group=new THREE.Group();group.position.set(x,y,z);group.userData={name:tags.name||'Tour de Drince',tags,type:'Monument'};world.add(group);interactive.push(group);
  const metal=new THREE.MeshStandardMaterial({color:0x4e5552,roughness:.47,metalness:.72,emissive:0x000000}); group.userData.material=metal;
  const s=6.7,h=25,top=1.7;
  const bases=[[-s,0,-s],[s,0,-s],[s,0,s],[-s,0,s]].map(p=>new THREE.Vector3(...p));
  const tops=[[-top,h,-top],[top,h,-top],[top,h,top],[-top,h,top]].map(p=>new THREE.Vector3(...p));
  for(let i=0;i<4;i++){makeBeam(bases[i],tops[i],.22,metal,group);for(let level=1;level<=5;level++){const t0=(level-1)/5,t1=level/5;const p1=bases[i].clone().lerp(tops[i],t0),p2=bases[(i+1)%4].clone().lerp(tops[(i+1)%4],t1),p3=bases[(i+1)%4].clone().lerp(tops[(i+1)%4],t0),p4=bases[i].clone().lerp(tops[i],t1);makeBeam(p1,p2,.10,metal,group);makeBeam(p3,p4,.10,metal,group);}}
  const platform=new THREE.Mesh(new THREE.BoxGeometry(5.3,.45,5.3),metal);platform.position.y=22.3;platform.castShadow=true;group.add(platform);
  const topPlatform=new THREE.Mesh(new THREE.BoxGeometry(3,.35,3),metal);topPlatform.position.y=24.4;group.add(topPlatform);
  landmarkPositions.set('tour de drince',new THREE.Vector3(x,y+27,z));
}

function elementLatLon(el){
  if(Number.isFinite(el.lat)&&Number.isFinite(el.lon))return {lat:el.lat,lon:el.lon};
  if(el.center&&Number.isFinite(el.center.lat))return el.center;
  const geoms=cleanGeometry(el);if(!geoms.length)return null;let lat=0,lon=0,n=0;for(const g of geoms)for(const p of g){lat+=p.lat;lon+=p.lon;n++;}return n?{lat:lat/n,lon:lon/n}:null;
}
function addPoiMarkers(elements){
  const mat=new THREE.MeshStandardMaterial({color:0xd9b66f,emissive:0x4a3210,emissiveIntensity:.15,roughness:.55,metalness:.25});nightEmissiveMaterials.push(mat);
  for(const el of elements){
    const name=el.tags?.name||'';
    const eligible=/station|townhall|place_of_worship/.test(`${el.tags?.railway||''} ${el.tags?.amenity||''} ${el.tags?.public_transport||''}`)||!!el.tags?.historic||/fond saint/i.test(name);
    if(!eligible||/drince/i.test(name))continue;
    if(el.tags?.building&&el.type!=='node')continue;
    const ll=elementLatLon(el);if(!ll)continue;
    const {x,z}=project(ll.lat,ll.lon),y=elevationAt(ll.lat,ll.lon);
    const mesh=new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.7,13,10),mat);mesh.position.set(x,y+6.5,z);mesh.castShadow=true;mesh.userData={name:name||'Point remarquable',tags:el.tags,type:el.tags?.historic?'Patrimoine':'Lieu'};world.add(mesh);interactive.push(mesh);if(name)landmarkPositions.set(name.toLowerCase(),new THREE.Vector3(x,y+18,z));
  }
}
function pointsGeometry(points,size=2.1){const pos=[];for(const p of points)pos.push(p.x,p.y,p.z);const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));const mat=new THREE.PointsMaterial({color:0xffd58a,size,sizeAttenuation:true,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});const obj=new THREE.Points(geo,mat);world.add(obj);return obj;}
let windowsObj, streetObj;
function addNightDetails(){
  windowsObj=pointsGeometry(nightPoints,3.1);
  const pts=[];for(const path of roadPaths.slice(0,18)){for(let i=0;i<path.length;i+=Math.max(2,Math.floor(path.length/7))){const p=path[i];pts.push(new THREE.Vector3(p.x,elevationXZ(p.x,p.z)+5.5,p.z));}}
  streetObj=pointsGeometry(pts,2.7);
}

function pathLength(path){let s=0;for(let i=1;i<path.length;i++)s+=Math.hypot(path[i].x-path[i-1].x,path[i].z-path[i-1].z);return s;}
function pointOnPath(path,t){
  const total=pathLength(path);let target=((t%1)+1)%1*total;
  for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i],seg=Math.hypot(b.x-a.x,b.z-a.z);if(target<=seg){const u=seg?target/seg:0;return {x:THREE.MathUtils.lerp(a.x,b.x,u),z:THREE.MathUtils.lerp(a.z,b.z,u),tx:(b.x-a.x)/Math.max(seg,1),tz:(b.z-a.z)/Math.max(seg,1)};}target-=seg;}
  const a=path.at(-2),b=path.at(-1);return {x:b.x,z:b.z,tx:b.x-a.x,tz:b.z-a.z};
}
function makeVehicle(path,offset=0,speed=.016,industrial=false){
  const group=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(industrial?10:6,industrial?3.5:2.3,industrial?4:3),new THREE.MeshStandardMaterial({color:industrial?0xb67b3a:0x5d6f73,roughness:.5,metalness:.15}));body.position.y=industrial?2.3:1.6;body.castShadow=true;group.add(body);
  const head=new THREE.Mesh(new THREE.BoxGeometry(industrial?2.2:1.5,.7,.35),new THREE.MeshBasicMaterial({color:0xffedbe}));head.position.set(industrial?5:3,1.6,0);head.visible=false;group.add(head);world.add(group);
  animated.push({kind:'vehicle',group,path,t:offset,speed,head});
}
function stitchProjectedPaths(paths,tolerance=24){
  const pool=paths.map(p=>p.slice()).filter(p=>p.length>1),joined=[];
  while(pool.length){let path=pool.shift(),changed=true;while(changed){changed=false;const end=path.at(-1),start=path[0];for(let i=0;i<pool.length;i++){const q=pool[i],q0=q[0],q1=q.at(-1);const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);if(d(end,q0)<tolerance){path.push(...q.slice(1));pool.splice(i,1);changed=true;break;}if(d(end,q1)<tolerance){path.push(...q.slice(0,-1).reverse());pool.splice(i,1);changed=true;break;}if(d(start,q1)<tolerance){path.unshift(...q.slice(0,-1));pool.splice(i,1);changed=true;break;}if(d(start,q0)<tolerance){path.unshift(...q.slice(1).reverse());pool.splice(i,1);changed=true;break;}}}joined.push(path);}return joined;
}
function makeTrain(){
  if(!railPaths.length)return;const path=stitchProjectedPaths(railPaths).sort((a,b)=>pathLength(b)-pathLength(a))[0];
  const group=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color:0xb7c2c3,roughness:.45,metalness:.35});const stripe=new THREE.MeshStandardMaterial({color:0x4d6d7a,roughness:.55});
  for(let i=0;i<3;i++){const car=new THREE.Mesh(new THREE.BoxGeometry(28,4.2,3.6),mat);car.position.x=-i*31;car.position.y=3;car.castShadow=true;group.add(car);const band=new THREE.Mesh(new THREE.BoxGeometry(27.6,1,3.65),stripe);band.position.set(-i*31,3.2,0);group.add(band);}world.add(group);animated.push({kind:'train',group,path,t:.1,speed:.006});
}
function addAnimations(){
  const candidates=roadPaths.sort((a,b)=>pathLength(b)-pathLength(a)).slice(0,10);for(let i=0;i<Math.min(9,candidates.length);i++)makeVehicle(candidates[i],i/.9*.11,.011+(i%3)*.003,false);
  if(industrialCentroids.length&&candidates.length){const ic=[...industrialCentroids].sort((a,b)=>b.area-a.area)[0];const near=[...candidates].sort((a,b)=>Math.hypot(centroidOf(a).x-ic.x,centroidOf(a).z-ic.z)-Math.hypot(centroidOf(b).x-ic.x,centroidOf(b).z-ic.z))[0];makeVehicle(near,.4,.009,true);makeVehicle(near,.72,.008,true);}
  makeTrain();
  const birdMat=new THREE.MeshBasicMaterial({color:0x252b2b,side:THREE.DoubleSide});const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute([-2,0,0,0,1,0,0,0,0,0,1,0,2,0,0,0,0,0],3));
  const center=landmarkPositions.get('tour de drince')||new THREE.Vector3(project(49.237354,6.092295).x,elevationAt(49.237354,6.092295)+70,project(49.237354,6.092295).z);
  for(let i=0;i<7;i++){const mesh=new THREE.Mesh(geo,birdMat);world.add(mesh);animated.push({kind:'bird',group:mesh,center,phase:i/7*Math.PI*2,radius:65+i*11,height:35+(i%3)*10});}
}

class SmoothOrbit {
  constructor(camera,dom){this.camera=camera;this.dom=dom;this.target=new THREE.Vector3();this.enabled=true;this.minDistance=120;this.maxDistance=8500;this.minPolar=.18;this.maxPolar=1.49;this.spherical=new THREE.Spherical();this.velTheta=0;this.velPhi=0;this.velZoom=0;this.velPan=new THREE.Vector3();this.drag=false;this.mode='rotate';this.last=new THREE.Vector2();this.sync();
    dom.addEventListener('contextmenu',e=>e.preventDefault());dom.addEventListener('pointerdown',e=>this.down(e));dom.addEventListener('pointermove',e=>this.move(e));addEventListener('pointerup',()=>this.drag=false);dom.addEventListener('wheel',e=>this.wheel(e),{passive:false});}
  sync(){this.spherical.setFromVector3(this.camera.position.clone().sub(this.target));}
  down(e){if(!this.enabled)return;this.drag=true;this.mode=(e.button===2||e.shiftKey)?'pan':'rotate';this.last.set(e.clientX,e.clientY);this.dom.setPointerCapture?.(e.pointerId);}
  move(e){if(!this.enabled||!this.drag)return;const dx=e.clientX-this.last.x,dy=e.clientY-this.last.y;this.last.set(e.clientX,e.clientY);if(this.mode==='rotate'){this.velTheta-=dx*.0032;this.velPhi-=dy*.0032;}else{const scale=this.spherical.radius*.0013;const right=new THREE.Vector3().setFromMatrixColumn(this.camera.matrix,0);const up=new THREE.Vector3(0,1,0);this.velPan.addScaledVector(right,-dx*scale).addScaledVector(up,dy*scale*.35);const forward=new THREE.Vector3();this.camera.getWorldDirection(forward);forward.y=0;forward.normalize();this.velPan.addScaledVector(forward,dy*scale*.65);}}
  wheel(e){if(!this.enabled)return;e.preventDefault();this.velZoom+=Math.sign(e.deltaY)*this.spherical.radius*.075;}
  update(){if(!this.enabled)return;this.spherical.theta+=this.velTheta;this.spherical.phi=THREE.MathUtils.clamp(this.spherical.phi+this.velPhi,this.minPolar,this.maxPolar);this.spherical.radius=THREE.MathUtils.clamp(this.spherical.radius+this.velZoom,this.minDistance,this.maxDistance);this.target.add(this.velPan);const minY=elevationXZ(this.target.x,this.target.z)+12;this.target.y=Math.max(this.target.y,minY);const offset=new THREE.Vector3().setFromSpherical(this.spherical);this.camera.position.copy(this.target).add(offset);const camMin=elevationXZ(this.camera.position.x,this.camera.position.z)+20;if(this.camera.position.y<camMin){this.camera.position.y=camMin;this.sync();}this.camera.lookAt(this.target);this.velTheta*=.86;this.velPhi*=.86;this.velZoom*=.80;this.velPan.multiplyScalar(.82);}
}
const controls=new SmoothOrbit(camera,canvas);

function findNamed(re){for(const [name,pos] of landmarkPositions)if(re.test(name))return pos.clone();return null;}
function pointAt(lat,lon,extra=10){const p=project(lat,lon);return new THREE.Vector3(p.x,elevationAt(lat,lon)+extra,p.z);}
function getView(name){
  const overview=pointAt(49.25,6.095,90);
  const mainIndustrial=industrialCentroids.length?[...industrialCentroids].sort((a,b)=>b.area-a.area)[0]:null;
  const industrial=mainIndustrial?new THREE.Vector3(mainIndustrial.x,elevationXZ(mainIndustrial.x,mainIndustrial.z)+15,mainIndustrial.z):pointAt(49.258,6.12,15);
  const target={overview,center:pointAt(49.25134,6.09371,18),valley:pointAt(49.257,6.097,12),fond:findNamed(/fond saint/)||pointAt(49.2404,6.0783,10),drince:findNamed(/tour de drince|drince/)||pointAt(49.237354,6.092295,20),station:findNamed(/rombas.*clouange|gare/)||pointAt(49.255898,6.099796,12),industrial}[name]||overview;
  const spec={overview:[2700,2250,3150],center:[650,520,700],valley:[1400,620,1800],fond:[650,500,680],drince:[520,360,520],station:[600,410,680],industrial:[1000,650,900]}[name]||[2700,2250,3150];
  return {target,position:target.clone().add(new THREE.Vector3(...spec))};
}
function tweenCamera(name,duration=1800){const to=getView(name),fromP=camera.position.clone(),fromT=controls.target.clone(),start=performance.now();controls.enabled=false;cameraTween={start,duration,fromP,fromT,to,onDone:()=>{controls.target.copy(to.target);controls.sync();controls.enabled=true;document.querySelectorAll('.views button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));}};}
function updateTween(now){if(!cameraTween)return;const t=THREE.MathUtils.clamp((now-cameraTween.start)/cameraTween.duration,0,1),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;camera.position.lerpVectors(cameraTween.fromP,cameraTween.to.position,e);controls.target.lerpVectors(cameraTween.fromT,cameraTween.to.target,e);camera.lookAt(controls.target);if(t>=1){const done=cameraTween.onDone;cameraTween=null;done?.();}}
function startIntro(){
  const end=getView('center');const mid=getView('overview');const startP=mid.target.clone().add(new THREE.Vector3(-3600,2900,4300));camera.position.copy(startP);controls.target.copy(mid.target);camera.lookAt(controls.target);controls.enabled=false;
  const t0=performance.now(),duration=6200;cameraTween={start:t0,duration,fromP:startP,fromT:mid.target.clone(),to:end,onDone:()=>{controls.target.copy(end.target);controls.sync();controls.enabled=true;introActive=false;}};
}

document.querySelectorAll('.views button').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.view==='overview'){const v=getView('overview');cameraTween=null;camera.position.copy(v.position);controls.target.copy(v.target);controls.sync();controls.enabled=true;camera.lookAt(controls.target);document.querySelectorAll('.views button').forEach(x=>x.classList.toggle('active',x===b));}else tweenCamera(b.dataset.view,1600);}));
closeInfo.addEventListener('click',()=>info.classList.add('hidden'));

function escapeHtml(v){return String(v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));}
function formatTags(tags={}){const keep=[['building','Bâtiment'],['amenity','Usage'],['railway','Rail'],['highway','Voirie'],['landuse','Zone'],['historic','Historique'],['height','Hauteur']];return keep.filter(([k])=>tags[k]).map(([k,l])=>`<span class="tag">${escapeHtml(l)}: ${escapeHtml(String(tags[k]).replaceAll('_',' '))}</span>`).join('');}
canvas.addEventListener('click',e=>{
  if(Math.abs(controls.velTheta)+Math.abs(controls.velPhi)>.01)return;
  const rect=canvas.getBoundingClientRect();pointer.x=(e.clientX-rect.left)/rect.width*2-1;pointer.y=-(e.clientY-rect.top)/rect.height*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(interactive,true);if(!hits.length){info.classList.add('hidden');return;}
  let obj=hits[0].object;while(obj&&!obj.userData?.name)obj=obj.parent;if(!obj)return;infoType.textContent=(obj.userData.type||'LIEU').toUpperCase();infoTitle.textContent=obj.userData.name;infoDetails.innerHTML=formatTags(obj.userData.tags)||'Nom disponible dans les données cartographiques.';info.classList.remove('hidden');
});

function updateDaylight(hour){
  currentTime=hour;const daylight=THREE.MathUtils.smoothstep(Math.sin((hour-6)/12*Math.PI),-.10,.24);const night=1-daylight;const angle=(hour-6)/24*Math.PI*2;const elev=Math.max(-.2,Math.sin((hour-6)/12*Math.PI));sun.position.set(Math.cos(angle)*4200,500+Math.max(elev,0)*4300,Math.sin(angle)*3500);sun.target.position.set(0,170,0);sun.intensity=.18+daylight*3.1;hemi.intensity=.22+daylight*1.55;fill.intensity=.18+daylight*.42;
  const dawn=Math.exp(-Math.pow((hour-6.7)/1.6,2))+Math.exp(-Math.pow((hour-19.2)/1.6,2));sun.color.setRGB(1,.79+.15*daylight,.55+.35*daylight);renderer.toneMappingExposure=.67+daylight*.48+dawn*.08;
  const skyDay=new THREE.Color(0xb8c7c5),skyNight=new THREE.Color(0x07121b),skySunset=new THREE.Color(0xb07861);const sky=skyNight.clone().lerp(skyDay,daylight);if(dawn>.12)sky.lerp(skySunset,Math.min(.28,dawn*.16));scene.background.copy(sky);scene.fog.color.copy(sky);scene.fog.density=.00010+night*.000035;
  if(windowsObj)windowsObj.material.opacity=Math.pow(night,1.2)*.95;if(streetObj)streetObj.material.opacity=Math.pow(night,1.05)*.95;mats.landmark.emissive.setRGB(.16*night,.11*night,.045*night);mats.landmark.emissiveIntensity=night*1.35;for(const m of nightEmissiveMaterials){m.emissiveIntensity=.12+night*1.7;}
  for(const a of animated)if(a.head)a.head.visible=night>.35;
  for(const obj of interactive){const mat=obj.userData?.material;if(mat?.emissive)mat.emissive.setRGB(.16*night,.12*night,.06*night);}
}
timeSlider.addEventListener('input',()=>{const h=Number(timeSlider.value);const hh=Math.floor(h),mm=Math.round((h-hh)*60);timeLabel.textContent=`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;updateDaylight(h);});

function updateAnimated(dt,time){
  for(const a of animated){
    if(a.kind==='vehicle'||a.kind==='train'){a.t=(a.t+a.speed*dt)%2;const reverse=a.t>1,u=reverse?2-a.t:a.t,p=pointOnPath(a.path,u);if(reverse){p.tx*=-1;p.tz*=-1;}a.group.position.set(p.x,elevationXZ(p.x,p.z)+(a.kind==='train'?2.6:2),p.z);a.group.rotation.y=-Math.atan2(p.tz,p.tx);}
    else if(a.kind==='bird'){const q=time*.00018+a.phase;a.group.position.set(a.center.x+Math.cos(q)*a.radius,a.center.y+a.height+Math.sin(q*1.7)*6,a.center.z+Math.sin(q)*a.radius*.7);a.group.rotation.y=-q;}
  }
  for(const m of new Set(waterMaterials)){if(m.opacity!==undefined)m.opacity=.77+Math.sin(time*.0012)*.025;}
}

const labelLayer=document.createElement('div');labelLayer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:2';document.querySelector('#app').appendChild(labelLayer);
const labelDefs=[['Tour de Drince',/tour de drince|drince/,()=>pointAt(49.237354,6.092295,28)],['Église Saint-Rémi',/saint-r[ée]mi/,()=>pointAt(49.25228,6.09184,25)],['Gare Rombas-Clouange',/rombas.*clouange|gare/,()=>pointAt(49.255898,6.099796,24)],['Fond Saint-Martin',/fond saint/,()=>pointAt(49.2404,6.0783,18)]];
const labels=labelDefs.map(([txt,re,fallback])=>{const el=document.createElement('div');el.textContent=txt;el.style.cssText='position:absolute;padding:5px 8px;border-radius:8px;background:rgba(12,20,22,.68);border:1px solid rgba(255,255,255,.14);color:#edf2f1;font:10px system-ui;white-space:nowrap;transform:translate(-50%,-120%);backdrop-filter:blur(6px);opacity:.9';labelLayer.appendChild(el);return{el,re,fallback};});

function updateLOD(){
  const d=camera.position.distanceTo(controls.target),near=d<3600;for(const o of lodNearObjects)o.visible=near;if(windowsObj)windowsObj.visible=d<3000;if(streetObj)streetObj.visible=d<3600;
}
function updateLabels(){for(const l of labels){const p=findNamed(l.re)||l.fallback();const v=p.clone().project(camera);const vis=v.z>-1&&v.z<1&&Math.abs(v.x)<1.15&&Math.abs(v.y)<1.15;l.el.style.display=vis?'block':'none';if(vis){l.el.style.left=`${(v.x*.5+.5)*innerWidth}px`;l.el.style.top=`${(-v.y*.5+.5)*innerHeight}px`;}}}

const DATA_BBOX = { south: 49.210, west: 6.035, north: 49.290, east: 6.155 };
const CACHE_VERSION = 'rombas3d-v2-2026-09';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function openCacheDb(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open('Rombas3DCache',1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('geo'))db.createObjectStore('geo');};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function cacheGet(key){
  try{const db=await openCacheDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('geo','readonly');const r=tx.objectStore('geo').get(`${CACHE_VERSION}:${key}`);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});}catch{return null;}
}
async function cacheSet(key,value){
  try{const db=await openCacheDb();await new Promise((resolve,reject)=>{const tx=db.transaction('geo','readwrite');tx.objectStore('geo').put(value,`${CACHE_VERSION}:${key}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}catch(e){console.warn('Cache navigateur indisponible',e);}
}
function validOsm(d){const e=d?.elements||[];return e.length>300&&e.some(x=>x.tags?.building)&&e.some(x=>x.tags?.highway)&&e.some(x=>x.tags?.railway);}
function validTerrain(d){return d?.rows>=17&&d?.cols>=17&&Array.isArray(d.elevations)&&d.elevations.length===d.rows*d.cols&&d.elevations.every(Number.isFinite);}
function overpassQuery(){
  const b=`${DATA_BBOX.south},${DATA_BBOX.west},${DATA_BBOX.north},${DATA_BBOX.east}`;
  return `[out:json][timeout:180];(way["building"](${b});relation["building"](${b});way["highway"](${b});way["railway"](${b});way["waterway"](${b});way["natural"="water"](${b});relation["natural"="water"](${b});way["landuse"~"forest|industrial|commercial"](${b});relation["landuse"~"forest|industrial|commercial"](${b});way["natural"="wood"](${b});relation["natural"="wood"](${b});nwr["railway"="station"](${b});nwr["public_transport"="station"](${b});nwr["man_made"="tower"](${b});nwr["tourism"="viewpoint"](${b});nwr["amenity"~"place_of_worship|townhall"](${b});nwr["historic"](${b});nwr["name"~"Fond Saint-Martin|Fond Saint Martin|Drince",i](${b}););out body geom;`;
}
async function getOsm(){
  const cached=await cacheGet('osm');if(validOsm(cached)){setProgress(16,'Données OpenStreetMap en cache…');return cached;}
  const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
  let last;
  for(const ep of endpoints){
    try{
      setProgress(12,'Téléchargement OpenStreetMap de Rombas…');
      const body=new URLSearchParams({data:overpassQuery()});
      const r=await fetch(ep,{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'}});
      if(!r.ok)throw new Error(`Overpass ${r.status}`);
      const json=await r.json();if(!validOsm(json))throw new Error('réponse OpenStreetMap incomplète');
      json._rombas3d={bbox:DATA_BBOX,source:ep,fetchedAt:new Date().toISOString()};await cacheSet('osm',json);return json;
    }catch(e){last=e;console.warn('Overpass',ep,e);await sleep(900);}
  }
  throw new Error(`OpenStreetMap indisponible (${last?.message||'erreur réseau'})`);
}
async function elevationChunkOpenTopo(chunk){
  const locations=chunk.map(([lat,lon])=>`${lat.toFixed(6)},${lon.toFixed(6)}`).join('|');
  const url=`https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locations)}&interpolation=bilinear`;
  const r=await fetch(url);if(!r.ok)throw new Error(`SRTM ${r.status}`);const json=await r.json();
  if(json.status!=='OK'||!Array.isArray(json.results))throw new Error(json.error||'SRTM invalide');
  return json.results.map(x=>Number.isFinite(x.elevation)?x.elevation:null);
}
async function elevationChunkOpenElevation(chunk){
  const locations=chunk.map(([lat,lon])=>`${lat.toFixed(6)},${lon.toFixed(6)}`).join('|');
  const url=`https://api.open-elevation.com/api/v1/lookup?locations=${encodeURIComponent(locations)}`;
  const r=await fetch(url);if(!r.ok)throw new Error(`Open-Elevation ${r.status}`);const json=await r.json();
  if(!Array.isArray(json.results))throw new Error('Open-Elevation invalide');
  return json.results.map(x=>Number.isFinite(x.elevation)?x.elevation:null);
}
async function getTerrain(){
  const cached=await cacheGet('terrain');if(validTerrain(cached)){setProgress(18,'Relief SRTM en cache…');return cached;}
  const rows=33,cols=33,points=[];
  for(let r=0;r<rows;r++){const lat=DATA_BBOX.north-(DATA_BBOX.north-DATA_BBOX.south)*r/(rows-1);for(let c=0;c<cols;c++){const lon=DATA_BBOX.west+(DATA_BBOX.east-DATA_BBOX.west)*c/(cols-1);points.push([lat,lon]);}}
  const elevations=[];
  for(let i=0;i<points.length;i+=80){
    const chunk=points.slice(i,i+80);let vals=null,last;
    for(let attempt=0;attempt<3&&!vals;attempt++){
      try{vals=await elevationChunkOpenTopo(chunk);}catch(e){last=e;await sleep(1100*(attempt+1));}
    }
    if(!vals){try{vals=await elevationChunkOpenElevation(chunk);}catch(e){last=e;}}
    if(!vals)throw new Error(`Relief indisponible (${last?.message||'erreur réseau'})`);
    elevations.push(...vals.map(v=>Number.isFinite(v)?v:170));
    setProgress(12+Math.round((i+chunk.length)/points.length*12),`Relief réel SRTM… ${Math.min(i+chunk.length,points.length)}/${points.length}`);
    await sleep(900);
  }
  const payload={bbox:DATA_BBOX,rows,cols,elevations,source:'SRTM30m / OpenTopoData',fetchedAt:new Date().toISOString()};await cacheSet('terrain',payload);return payload;
}

async function load(){
  try{
    setProgress(8,'Connexion aux données géographiques réelles…');
    [terrainData,osmData]=await Promise.all([getTerrain(),getOsm()]);
    setProgress(28,'Construction de la vallée de l’Orne…');makeTerrain();
    setProgress(43,'Forêts, plans d’eau et zones industrielles…');makeWaterAndLand(osmData.elements);addForestTrees();
    setProgress(58,'Réseau routier, ponts et voies ferrées…');makeTransport(osmData.elements);
    setProgress(73,'Extrusion des bâtiments OSM…');const buildingCount=addBuildings(osmData.elements);
    setProgress(85,'Monuments, gare et Tour de Drince…');addPoiMarkers(osmData.elements);addDrinceTower(osmData.elements);addNightDetails();
    setProgress(94,'Animations et éclairage…');addAnimations();updateDaylight(currentTime);
    setProgress(100,'Rombas 3D est prêt');statusText.textContent=`${buildingCount.toLocaleString('fr-FR')} bâtiments · données OSM réelles`;status.classList.add('ready');
    setTimeout(()=>loading.classList.add('done'),450);startIntro();
  }catch(err){console.error(err);loadingStep.innerHTML=`Erreur : ${escapeHtml(err.message)}<br><small>Vérifie la connexion Internet puis recharge la page. Les données seront mises en cache après le premier chargement réussi.</small>`;loadingBar.style.width='100%';loadingBar.style.background='#c46f61';statusText.textContent='Données indisponibles';}
}

let last=performance.now();
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;if(cameraTween)updateTween(now);else controls.update();updateAnimated(dt,now);updateLOD();updateLabels();renderer.render(scene,camera);}
requestAnimationFrame(animate);load();

addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});