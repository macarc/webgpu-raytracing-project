// Delete a three.js Object3D
//
// This file was adapted from:
// https://github.com/maximeq/three-js-disposer/blob/r4.130/src/disposer.ts

import * as THREE from "three";

/**
 * Delete a Three.JS Object3D.
 * This must be called on all Object3Ds when they are finished with,
 * to free the WebGL resources associated with the Object3D.
 * @param o the object to dispose.
 */
export function dispose(o: THREE.Object3D | null) {
  if (o) {
    callOnAllChildren(o, disposeNode);
  }
}

/**
 * Run a callback on each descendent of the node.
 * @param node
 * @param callback
 */
function callOnAllChildren(
  node: THREE.Object3D,
  callback: (node: THREE.Object3D) => void,
) {
  for (var i = node.children.length - 1; i >= 0; i--) {
    var child = node.children[i];
    callOnAllChildren(child, callback);
    callback(child);
  }
}

/**
 * Free all WebGL resources associated with an Object3D.
 * @param node
 */
function disposeNode(node: THREE.Object3D) {
  if (node instanceof THREE.Mesh) {
    // Dispose of node geometry.
    if (node.geometry) {
      node.geometry.dispose();
    }

    // Dispose of node material.
    if (node.material) {
      if (node.material.materials) {
        for (let i = 0; i < node.material.materials.length; ++i) {
          disposeMaterial(node.material.materials[i]);
        }
      } else {
        disposeMaterial(node.material);
      }
    }
  }
}

function disposeMaterial(mtrl: any) {
  if (mtrl.map) mtrl.map.dispose();
  if (mtrl.lightMap) mtrl.lightMap.dispose();
  if (mtrl.bumpMap) mtrl.bumpMap.dispose();
  if (mtrl.normalMap) mtrl.normalMap.dispose();
  if (mtrl.specularMap) mtrl.specularMap.dispose();
  if (mtrl.envMap) mtrl.envMap.dispose();

  mtrl.dispose();
}
