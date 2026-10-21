import * as THREE from 'three';
import {terrainHeight,type GroundCover,type TerrainDocument} from './world-terrain';

/** A live, disposable scene projection of the editable metric TerrainDocument. */
export interface TerrainProjection {
  root: THREE.Group;
  surface: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  dispose(): void;
}

const palettes: Record<GroundCover,{low:string,mid:string,high:string,stone:string}> = {
  woodland:{low:'#4a6243',mid:'#647b50',high:'#819477',stone:'#788177'},
  meadow:{low:'#648850',mid:'#899962',high:'#a2aa7a',stone:'#938f80'},
  rock:{low:'#686f67',mid:'#817f72',high:'#b2aca0',stone:'#777972'},
  arid:{low:'#9d855f',mid:'#b29a73',high:'#c7b591',stone:'#8d806d'},
};

function rng(seed: number) {
  let state=seed>>>0;
  return () => {
    state=(Math.imul(1664525,state)+1013904223)>>>0;
    return state/4294967296;
  };
}

/** Render geometry is generated from data, not merged into the native BIM GLB. */
export function createTerrainProjection(doc: TerrainDocument): TerrainProjection {
  const root=new THREE.Group();
  root.name='CAD Site · Editable Terrain';
  root.userData={category:'terrain',schema:doc.schema,editable:true};
  const geometry=new THREE.PlaneGeometry(doc.width,doc.depth,doc.resolution,doc.resolution);
  geometry.rotateX(-Math.PI/2);
  const positions=geometry.getAttribute('position') as THREE.BufferAttribute;
  const colors=new Float32Array(positions.count*3);
  const palette=palettes[doc.cover];
  const low=new THREE.Color(palette.low),mid=new THREE.Color(palette.mid),
    high=new THREE.Color(palette.high),stone=new THREE.Color(palette.stone);
  for (let i=0;i<positions.count;i++) {
    const x=positions.getX(i),z=positions.getZ(i);
    positions.setY(i,terrainHeight(doc,x,z)-doc.baseElevation);
  }
  geometry.computeVertexNormals();
  const normal=geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let i=0;i<positions.count;i++) {
    const height=positions.getY(i);
    const slope=1-Math.max(0,normal.getY(i));
    const color=low.clone().lerp(mid,Math.min(1,Math.max(0,height/30)));
    color.lerp(high,Math.min(1,Math.max(0,(height-24)/85)));
    color.lerp(stone,Math.min(1,Math.max(0,(slope-.19)*2.6)));
    // Bake a restrained directional relief cue into the vertex colors. This
    // keeps terrain legible on GPU drivers whose lit landscape shader whites out.
    const daylight=Math.max(0,normal.getX(i)*.45+normal.getY(i)*.8+normal.getZ(i)*.22);
    color.multiplyScalar(.70+daylight*.34);
    colors[3*i]=color.r;colors[3*i+1]=color.g;colors[3*i+2]=color.b;
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false});
  const surface=new THREE.Mesh(geometry,material);
  surface.name='Site terrain · sculptable heightfield';
  surface.receiveShadow=true;
  root.add(surface);

  const seeded=rng(doc.seed);
  const dummy=new THREE.Object3D();
  const trees:THREE.InstancedMesh[]=[];
  const rocks:THREE.InstancedMesh[]=[];
  const within = (x:number,z:number) => Math.hypot(x,z)>doc.protectedRadius+3;
  const slopeAt = (x:number,z:number) => {
    const h=terrainHeight(doc,x,z);
    return Math.hypot(h-terrainHeight(doc,x+2,z),h-terrainHeight(doc,x,z+2));
  };
  function place(geometry:THREE.BufferGeometry,material:THREE.Material,count:number,
    verticalOffset:number,scaleRange:[number,number],type:'tree'|'rock') {
    if(count<1){geometry.dispose();material.dispose();return;}
    const instances=new THREE.InstancedMesh(geometry,material,count);
    instances.name='Site scenery · '+type;
    instances.castShadow=true;instances.receiveShadow=true;
    let added=0;
    for(let attempts=0;added<count&&attempts<count*45;attempts++){
      const x=(seeded()-.5)*(doc.width-6),z=(seeded()-.5)*(doc.depth-6);
      if(!within(x,z) || slopeAt(x,z)>(type==='tree'?4:9))continue;
      const height=terrainHeight(doc,x,z)-doc.baseElevation;
      dummy.position.set(x,height+verticalOffset,z);
      const size=(scaleRange[0]+seeded()*(scaleRange[1]-scaleRange[0]))*(type==='tree'?doc.treeScale:doc.rockScale);
      dummy.scale.setScalar(size);dummy.rotation.y=seeded()*Math.PI*2;dummy.updateMatrix();
      instances.setMatrixAt(added++,dummy.matrix);
    }
    instances.count=added;instances.instanceMatrix.needsUpdate=true;
    root.add(instances);
    (type==='tree'?trees:rocks).push(instances);
  }
  // These are editable proxy landscape assets, not geospatially sourced trees.
  const trunkMat=new THREE.MeshStandardMaterial({color:'#443727',roughness:1});
  const foliageMat=new THREE.MeshStandardMaterial({color:'#304d31',roughness:1});
  const rockMat=new THREE.MeshStandardMaterial({color:palette.stone,roughness:1});
  place(new THREE.CylinderGeometry(.13,.20,2,6),trunkMat,doc.treeCount,1,[.8,1.6],'tree');
  // Keep tree crowns anchored to the same transforms as trunks.
  const trunkInstances=trees[0];
  if(trunkInstances){
    const crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1.35,4.5,7),foliageMat,trunkInstances.count);
    crowns.name='Site scenery · tree canopies';crowns.castShadow=true;crowns.receiveShadow=true;
    const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
    for(let i=0;i<trunkInstances.count;i++){
      trunkInstances.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);
      pos.y+=2.05*scale.y;matrix.compose(pos,quat,scale);crowns.setMatrixAt(i,matrix);
    }
    crowns.instanceMatrix.needsUpdate=true;root.add(crowns);trees.push(crowns);
  }else{foliageMat.dispose();}
  place(new THREE.DodecahedronGeometry(1,0),rockMat,doc.rockCount,.25,[.35,1.7],'rock');

  return {root,surface,dispose(){
    root.parent?.remove(root);
    geometry.dispose();material.dispose();
    for(const instance of [...trees,...rocks]){
      instance.geometry.dispose();
      (instance.material as THREE.Material).dispose();
      instance.dispose();
    }
  }};
}
