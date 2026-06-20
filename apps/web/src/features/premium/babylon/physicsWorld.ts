/** Registers Scene.enablePhysics — required for tree-shaken Babylon.js builds. */
import "@babylonjs/core/Physics/physicsEngineComponent";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import HavokPhysics from "@babylonjs/havok";

const GRAVITY = new Vector3(0, -9.81, 0);
/** Served at ./havok/HavokPhysics.wasm (see scripts/sync-havok-wasm.mjs). */
export const HAVOK_WASM_URL = "./havok/HavokPhysics.wasm";

export async function enableHavokPhysics(scene: Scene): Promise<void> {
  const havokInstance = await HavokPhysics({
    locateFile: () => HAVOK_WASM_URL,
  });
  const plugin = new HavokPlugin(true, havokInstance);
  if (!plugin.isSupported()) {
    throw new Error("Havok plugin failed to initialize.");
  }
  const enabled = scene.enablePhysics(GRAVITY, plugin);
  if (!enabled || !scene.getPhysicsEngine()) {
    throw new Error("scene.enablePhysics did not attach a physics engine.");
  }
}