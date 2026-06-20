import type { Camera } from "@babylonjs/core/Cameras/camera";

import type { Engine } from "@babylonjs/core/Engines/engine";

import type { Scene } from "@babylonjs/core/scene";

import type { JewelCubePhysicsRig } from "./jewelCubeFactory";



let spillEl: HTMLElement | null = null;



export function bindShowcaseBackdropSpillTarget(el: HTMLElement | null): void {

  spillEl = el;

  resetBackdropSpillStyles();

}



export function disposeShowcaseBackdropSpill(): void {

  resetBackdropSpillStyles();

  spillEl = null;

}



function resetBackdropSpillStyles(): void {

  if (!spillEl) {

    return;

  }

  spillEl.style.setProperty("--crystal-spill-opacity", "0");

  const video = spillEl.parentElement?.querySelector(".showcase-dom-backdrop");

  if (video instanceof HTMLElement) {

    video.style.filter = "";

  }

}



/** DOM spill disabled — per-frame CSS updates caused visible backdrop flicker. */

export function tickShowcaseCrystalBackdropSpill(

  _scene: Scene,

  _camera: Camera,

  _engine: Engine,

  _rig: JewelCubePhysicsRig | null | undefined,

  _dtMs = 16

): void {

  if (!spillEl) {

    return;

  }

  spillEl.style.setProperty("--crystal-spill-opacity", "0");

}

