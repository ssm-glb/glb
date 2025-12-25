/*!
 * three-orbit-viewcube v1.0.2
 * https://github.com/nytimes/three-orbit-viewcube
 * (c) 2021 The New York Times Company
 * Released under the MIT License.
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('three')) :
  typeof define === 'function' && define.amd ? define(['three'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.OrbitViewCube = factory(global.THREE));
}(this, (function (THREE) { 'use strict';

function OrbitViewCube(camera, domElement, options) {
  options = options || {};
  var size = options.size || 100;
  var position = options.position || { top: 20, right: 20 };
  var opacity = options.opacity || 1;
  var font = options.font || 'bold 16px Arial';
  var faces = options.faces || {
    px: 'R', nx: 'L', py: 'U', ny: 'D', pz: 'F', nz: 'B'
  };

  var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(size, size);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.width = size + 'px';
  renderer.domElement.style.height = size + 'px';
  renderer.domElement.style.opacity = opacity;
  renderer.domElement.style.pointerEvents = 'auto';
  renderer.domElement.style.userSelect = 'none';
  renderer.domElement.style.zIndex = 200;

  if (position.top !== undefined) renderer.domElement.style.top = position.top + 'px';
  if (position.right !== undefined) renderer.domElement.style.right = position.right + 'px';
  if (position.bottom !== undefined) renderer.domElement.style.bottom = position.bottom + 'px';
  if (position.left !== undefined) renderer.domElement.style.left = position.left + 'px';

  domElement.parentElement.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var cubeCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
  cubeCamera.position.set(0, 0, 3);

  var geometry = new THREE.BoxGeometry(1, 1, 1);
  var materials = [
    createFaceMaterial(faces.px, font, '#00c3ff'), // px
    createFaceMaterial(faces.nx, font, '#00c3ff'), // nx
    createFaceMaterial(faces.py, font, '#00c3ff'), // py
    createFaceMaterial(faces.ny, font, '#00c3ff'), // ny
    createFaceMaterial(faces.pz, font, '#00c3ff'), // pz
    createFaceMaterial(faces.nz, font, '#00c3ff')  // nz
  ];
  var cube = new THREE.Mesh(geometry, materials);
  scene.add(cube);

  var raycaster = new THREE.Raycaster();
  var mouse = new THREE.Vector2();

  renderer.domElement.addEventListener('mousedown', onMouseDown, false);

  function createFaceMaterial(text, font, color) {
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(30,60,120,0.95)';
    ctx.fillRect(0, 0, 128, 128);
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) });
  }

  function onMouseDown(event) {
    var rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, cubeCamera);
    var intersects = raycaster.intersectObject(cube, false);
    if (intersects.length > 0) {
      var faceIndex = intersects[0].face.materialIndex;
      var target = getTargetByFaceIndex(faceIndex);
      if (target) animateCameraTo(target);
    }
  }

  function getTargetByFaceIndex(index) {
    switch (index) {
      case 0: return { x: 1, y: 0, z: 0 }; // px
      case 1: return { x: -1, y: 0, z: 0 }; // nx
      case 2: return { x: 0, y: 1, z: 0 }; // py
      case 3: return { x: 0, y: -1, z: 0 }; // ny
      case 4: return { x: 0, y: 0, z: 1 }; // pz
      case 5: return { x: 0, y: 0, z: -1 }; // nz
      default: return null;
    }
  }

  function animateCameraTo(target) {
    var controls = OrbitViewCube._controls;
    if (!controls) return;
    var distance = camera.position.distanceTo(controls.target);
    var newPos = new THREE.Vector3(
      controls.target.x + target.x * distance,
      controls.target.y + target.y * distance,
      controls.target.z + target.z * distance
    );
    controls.saveState && controls.saveState();
    controls.target.copy(controls.target);
    controls.object.position.copy(newPos);
    controls.update();
  }

  this.attach = function (controls) {
    OrbitViewCube._controls = controls;
  };

  function render() {
    // 让小立方体的朝向和主相机一致
    cube.quaternion.copy(camera.quaternion);
    renderer.render(scene, cubeCamera);
  }

  function animate() {
    requestAnimationFrame(animate);
    render();
  }
  animate();
}

return OrbitViewCube;

})));