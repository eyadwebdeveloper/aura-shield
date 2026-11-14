/** Isolated test: do zero-copy sub-view picker geometries raycast correctly? */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Two tiny "parts": a triangle at x=0 and a triangle at x=10
function tri(x0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    x0, 0, 0, x0 + 1, 0, 0, x0, 1, 0,
  ]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Int16Array([0, 0, 32767, 0, 0, 32767, 0, 0, 32767]), 3, true));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array([0, 1, 2]), 1));
  g.setAttribute('partIndex', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 1));
  return g;
}

const parts = [
  { indexCount: 3, bounds: new THREE.Box3(new THREE.Vector3(0, 0, -0.1), new THREE.Vector3(1, 1, 0.1)) },
  { indexCount: 3, bounds: new THREE.Box3(new THREE.Vector3(10, 0, -0.1), new THREE.Vector3(11, 1, 0.1)) },
];
const merged = mergeGeometries([tri(0), tri(10)], false);
console.log('merged index type:', merged.getIndex().array.constructor.name);

// build pickers exactly like the engine
const pos = merged.getAttribute('position');
const idx = merged.getIndex();
const idxArr = idx.array;
const idxBuffer = idxArr.buffer;
const IndexCtor = idxArr.BYTES_PER_ELEMENT === 4 ? Uint32Array : Uint16Array;
const stride = idxArr.BYTES_PER_ELEMENT;
let tCursor = 0;
const pickers = [];
for (const p of parts) {
  const pick = new THREE.BufferGeometry();
  pick.setAttribute('position', new THREE.BufferAttribute(pos.array, 3));
  pick.setIndex(new THREE.BufferAttribute(
    new IndexCtor(idxBuffer, idxArr.byteOffset + tCursor * stride, p.indexCount), 1
  ));
  const sphere = new THREE.Sphere();
  p.bounds.getBoundingSphere(sphere);
  pick.boundingSphere = sphere;
  pick.boundingBox = p.bounds.clone();
  const mesh = new THREE.Mesh(pick);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  pickers.push(mesh);
  tCursor += p.indexCount;
}

// Ray straight into each triangle from z=+5
const raycaster = new THREE.Raycaster();
function hit(mesh, tx, ty) {
  raycaster.set(new THREE.Vector3(tx, ty, 5), new THREE.Vector3(0, 0, -1));
  return raycaster.intersectObject(mesh, false);
}
console.log('picker0 (triangle at x=0..1), ray at (0.5,0.3):', hit(pickers[0], 0.5, 0.3).length, 'hits');
console.log('picker1 (triangle at x=10..11), ray at (10.5,0.3):', hit(pickers[1], 10.5, 0.3).length, 'hits');
console.log('picker0, ray at WRONG place (10.5,0.3):', hit(pickers[0], 10.5, 0.3).length, 'hits (expect 0)');

// Also verify sphere/box pretest path used in pickAt
const ray = new THREE.Ray(new THREE.Vector3(0.5, 0.3, 5), new THREE.Vector3(0, 0, -1));
const tmp = new THREE.Vector3();
console.log('ray.intersectBox part0:', !!ray.intersectBox(parts[0].bounds, tmp));
