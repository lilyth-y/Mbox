#!/usr/bin/env node

/** Ensures micro-module registry stays in sync with host runtimes. */

import { readFileSync } from "node:fs";

import { dirname, join } from "node:path";

import { fileURLToPath } from "node:url";



const root = join(dirname(fileURLToPath(import.meta.url)), "..");



function assert(cond, msg) {

  if (!cond) throw new Error(msg);

}



const registrySrc = readFileSync(

  join(root, "packages/shared/src/presentationMicroModuleRegistry.ts"),

  "utf8"

);

const hostSrc = readFileSync(

  join(root, "apps/web/src/features/cube/microModules/presentationMicroModuleHost.ts"),

  "utf8"

);

const cubeViewSrc = readFileSync(

  join(root, "apps/web/src/features/cube/CubeView.tsx"),

  "utf8"

);



const specIds = [

  ...registrySrc.matchAll(

    /id: "(galaxy_background|orbital_showcase|hologram_fresnel_rim|selective_bloom)"/g

  ),

].map((m) => m[1]);

assert(specIds.length >= 4, "registry must define all module specs");



const hostClassById = {

  galaxy_background: "GalaxyBackgroundMicroModule",

  orbital_showcase: "OrbitalShowcaseMicroModule",

  hologram_fresnel_rim: "HologramFresnelRimMicroModule",

  selective_bloom: "SelectiveBloomMicroModule",

};



for (const id of specIds) {

  const className = hostClassById[id];

  assert(className, `unknown module id ${id}`);

  assert(new RegExp(className).test(hostSrc), `host missing ${className}`);

}



assert(/PresentationMicroModuleHost/.test(cubeViewSrc), "CubeView must use PresentationMicroModuleHost");

assert(!/createGalaxyBackground\(/.test(cubeViewSrc), "CubeView must not call createGalaxyBackground directly");

assert(/microModuleHost\.render\(/.test(cubeViewSrc), "CubeView must render via micro-module host");



assert(/qualityUpgrades/.test(registrySrc), "registry includes quality roadmap");

assert(/CROSS_CUTTING_QUALITY_UPGRADES/.test(registrySrc), "cross-cutting upgrades defined");



console.log("verify-micro-module-registry: OK", { modules: specIds });

