import * as THREE from 'three';

const QUALITY={auto:{size:64,hz:6},high:{size:128,hz:8},ultra:{size:128,hz:12}};

// Capture only the tunnel, avoiding recursive/self reflections. The proxy
// borrows its geometry/material; their lifetime belongs to the main scene.
export class CyberReflections {
  constructor(tunnel) {
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x01020a);
    this.proxy=new THREE.Mesh(tunnel.geometry,tunnel.material);this.proxy.frustumCulled=false;
    this.scene.add(this.proxy);
    this.target=new THREE.WebGLCubeRenderTarget(64,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:false});
    this.camera=new THREE.CubeCamera(.1,180,this.target);
    this.camera.coordinateSystem=THREE.WebGLCoordinateSystem;this.camera.updateCoordinateSystem();
    this.interval=1/6;this.lastTime=-Infinity;this.palette=-1;this.dirty=true;this.captures=0;
  }
  setQuality(quality) {
    const setting=QUALITY[quality]||QUALITY.auto;
    if(this.target.width!==setting.size){this.target.setSize(setting.size,setting.size);this.dirty=true;}
    this.interval=1/setting.hz;
  }
  render(renderer,position,time,palette) {
    if(!this.dirty&&palette===this.palette&&time-this.lastTime<this.interval)return;
    const previous=renderer.getRenderTarget(),face=renderer.getActiveCubeFace?.()||0,mip=renderer.getActiveMipmapLevel?.()||0;
    const xr=renderer.xr?.enabled;
    this.camera.position.copy(position);this.camera.updateMatrixWorld(true);
    try {
      if(renderer.xr)renderer.xr.enabled=false;
      for(let i=0;i<6;i++){
        renderer.setRenderTarget(this.target,i,0);
        renderer.render(this.scene,this.camera.children[i]);
      }
      this.lastTime=time;this.palette=palette;this.dirty=false;this.captures++;
    } finally {
      if(renderer.xr)renderer.xr.enabled=xr;
      renderer.setRenderTarget(previous,face,mip);
    }
  }
  dispose(){this.target.dispose();}
}
