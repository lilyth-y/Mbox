/**
 * Wedding-simple fan-blade cube motion (vanilla JS).
 * Refactored into functional Micro-Modules for safety and maintainability.
 */
(function initWeddingSimpleFan(global) {
  const THREE = global.THREE;
  if (!THREE) {
    console.warn("[fanMotion] THREE not loaded");
    return;
  }

  // --------------------------------------------------------
  // 1. TIMING & MATH MODULE (시간 계산 및 유틸리티)
  // --------------------------------------------------------
  const FAN_APPROACH_MS = 2400;
  const FAN_OPENING_HOLD_MS = 2800;
  const FAN_SHOWCASE_HOLD_MS = 4400;
  const FAN_RETREAT_MS = 2000;
  const FAN_GAP_MS = 1600;
  const FAN_LOOP_BRIDGE_MS = 1100;

  const FAN_SCALE_FAR = 0.5;
  const FAN_SCALE_PEAK = 1.25;
  const FAN_SCALE_RETREAT = 0.5;
  const FX = global.MBOX_CUBE_EFFECT_FRAMEWORK || {};
  const FAN_PARALLAX_PEAK = FX.parallaxPeakMax ?? 0.34;
  const PARALLAX_ALLOWED = FX.parallaxAllowedPhases || ["showcase_hold"];
  const FAN_APPROACH_REVS = 2;
  const FAN_RETREAT_REVS = 1.6;
  const FAN_HANDOFF_REVS = 0.4;
  const FAN_SHOWCASE_SPIN_RATE = 0;

  function mulberry32(seed) {
    let state = seed | 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function easeInOutSine(t) {
    const x = Math.min(1, Math.max(0, t));
    return (-(Math.cos(Math.PI * x) - 1)) / 2;
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  /** Slow ease-in → hold → ease-out for readable VoluMax on wedding-simple. */
  function slowShowcaseEnvelope(phaseU) {
    const u = Math.min(1, Math.max(0, phaseU));
    if (u < 0.38) return easeInOutSine(u / 0.38) * 0.42;
    if (u > 0.72) return easeInOutSine((1 - u) / 0.28) * 0.42;
    return 0.42 + 0.58 * easeInOutSine((u - 0.38) / 0.34);
  }

  function easeInQuart(t) {
    return t * t * t * t;
  }

  function getFanShowcaseHoldMs(step) {
    return step === 0 ? FAN_OPENING_HOLD_MS : FAN_SHOWCASE_HOLD_MS;
  }

  function getFanStepSegmentMs(step, speedMul = 1) {
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    return (FAN_APPROACH_MS + getFanShowcaseHoldMs(step) + FAN_RETREAT_MS + FAN_GAP_MS) / mul;
  }

  function resolveFanPhase(step, stepElapsed, speedMul = 1) {
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    let t = stepElapsed;

    const approachMs = FAN_APPROACH_MS / mul;
    if (t < approachMs) {
      return { phase: "approach", phaseElapsed: t, phaseU: t / approachMs };
    }
    t -= approachMs;

    const showcaseMs = getFanShowcaseHoldMs(step) / mul;
    if (t < showcaseMs) {
      return { phase: "showcase_hold", phaseElapsed: t, phaseU: t / showcaseMs };
    }
    t -= showcaseMs;

    const retreatMs = FAN_RETREAT_MS / mul;
    if (t < retreatMs) {
      return { phase: "retreat", phaseElapsed: t, phaseU: t / retreatMs };
    }
    t -= retreatMs;

    const gapMs = FAN_GAP_MS / mul;
    return {
      phase: "handoff",
      phaseElapsed: t,
      phaseU: Math.min(1, Math.max(0, t / gapMs)),
    };
  }

  function resolvePresentationTimeline(elapsed, segmentMs, loopBridgeMs) {
    const contentMs = segmentMs.reduce((sum, v) => sum + v, 0);
    if (loopBridgeMs > 0 && elapsed >= contentMs) {
      return {
        kind: "loop_bridge",
        bridgeElapsed: Math.min(elapsed - contentMs, loopBridgeMs),
        lastStep: Math.max(0, segmentMs.length - 1),
      };
    }
    let accumulated = 0;
    for (let step = 0; step < segmentMs.length; step += 1) {
      const segment = segmentMs[step] ?? 0;
      if (elapsed < accumulated + segment) {
        return { kind: "step", step, stepElapsed: elapsed - accumulated };
      }
      accumulated += segment;
    }
    const last = segmentMs.length - 1;
    const lastSegment = segmentMs[last] ?? 1;
    return { kind: "step", step: last, stepElapsed: Math.max(0, lastSegment - 1) };
  }

  // --------------------------------------------------------
  // 2. CORE TRANSFORMS MODULE (3D 회전 제어)
  // --------------------------------------------------------
  const CUBE_FACE_ORDER = [4, 0, 1, 2, 3, 5];
  const CORNER_REST = new THREE.Euler(0, 0.38, 0);
  const FACE_ROTATIONS = {
    4: new THREE.Euler(0, 0, 0),
    5: new THREE.Euler(0, Math.PI, 0),
    0: new THREE.Euler(0, -Math.PI / 2, 0),
    1: new THREE.Euler(0, Math.PI / 2, 0),
    2: new THREE.Euler(-Math.PI / 2, 0, 0),
    3: new THREE.Euler(Math.PI / 2, 0, 0),
  };
  const STYLES = ["yaw_arc", "pitch_lift", "pitch_drop", "roll_tilt", "corner_swing", "yaw_arc"];

  function slerpEuler(current, target, alpha) {
    if (!current && !target) return new THREE.Euler(0, 0, 0);
    if (!current) return target.clone ? target.clone() : new THREE.Euler(target.x || 0, target.y || 0, target.z || 0);
    if (!target) return current.clone ? current.clone() : new THREE.Euler(current.x || 0, current.y || 0, current.z || 0);
    const from = new THREE.Quaternion().setFromEuler(current);
    const to = new THREE.Quaternion().setFromEuler(target);
    from.slerp(to, alpha);
    return new THREE.Euler().setFromQuaternion(from, current.order);
  }

  function getPresentationFace(step) {
    return CUBE_FACE_ORDER[step % CUBE_FACE_ORDER.length] ?? CUBE_FACE_ORDER[0];
  }

  function getFaceRotation(faceIndex) {
    const rot = FACE_ROTATIONS[faceIndex];
    return rot ? rot.clone() : new THREE.Euler(0, 0, 0);
  }

  /** Parent rotation so mount face normal points at +Z (camera). */
  function getCubeShowcaseRootRotation(faceIndex) {
    const qMount = new THREE.Quaternion().setFromEuler(getFaceRotation(faceIndex));
    const outward = new THREE.Vector3(0, 0, 1).applyQuaternion(qMount);
    const qRoot = new THREE.Quaternion().setFromUnitVectors(outward, new THREE.Vector3(0, 0, 1));
    return new THREE.Euler().setFromQuaternion(qRoot, "XYZ");
  }

  function resolveCubeTransitionStyle(step, mode) {
    switch (mode) {
      case "yaw_cw": return { style: "yaw_arc", reverseYaw: false };
      case "yaw_ccw": return { style: "yaw_arc", reverseYaw: true };
      case "pitch_up": return { style: "pitch_lift", reverseYaw: false };
      case "pitch_down": return { style: "pitch_drop", reverseYaw: false };
      case "roll": return { style: "roll_tilt", reverseYaw: false };
      case "corner_swing": return { style: "corner_swing", reverseYaw: false };
      default: return { style: STYLES[step % STYLES.length] ?? "yaw_arc", reverseYaw: false };
    }
  }

  function accentWaypoint(from, to, style) {
    const mid = slerpEuler(from, to, 0.5);
    switch (style) {
      case "pitch_lift": mid.x -= 0.26; break;
      case "pitch_drop": mid.x += 0.24; break;
      case "roll_tilt": mid.z += 0.17 * (from.y < to.y ? 1 : -1); break;
      case "corner_swing":
        mid.x -= 0.14; mid.y += 0.11 * Math.sign(to.y - from.y || 1); mid.z += 0.09; break;
      default:
        mid.y += 0.07 * Math.sign(to.y - from.y || 1);
    }
    return mid;
  }

  function slerpCubeTransition(from, to, alpha, step, mode) {
    if (!from || !to) return slerpEuler(from, to, alpha);
    const { style, reverseYaw } = resolveCubeTransitionStyle(step, mode);
    const clamped = Math.min(1, Math.max(0, alpha));
    const fromEuler = reverseYaw ? to : from;
    const toEuler = reverseYaw ? from : to;
    const via = accentWaypoint(fromEuler, toEuler, style);
    if (clamped <= 0.5) return slerpEuler(fromEuler, via, clamped * 2);
    return slerpEuler(via, toEuler, (clamped - 0.5) * 2);
  }

  function getCubeEntryRotation(step) {
    return step === 0 ? CORNER_REST.clone() : getCubeShowcaseRootRotation(getPresentationFace(step));
  }

  function getCubeExitRotation(step, presentationCount) {
    return step + 1 >= presentationCount
      ? CORNER_REST.clone()
      : getCubeShowcaseRootRotation(getPresentationFace(step + 1));
  }

  function resolveSpinYawSign(mode) {
    return mode === "yaw_ccw" ? -1 : 1;
  }

  function getShowcaseSpinRevs() {
    return 0;
  }

  function getStepSpinRevsTotal() {
    return FAN_APPROACH_REVS + FAN_RETREAT_REVS + FAN_HANDOFF_REVS;
  }

  /** Approach decel → showcase freeze (2s) → retreat+handoff accel. */
  function getRevsWithinStep(stepElapsedMs, step, speedMul = 1) {
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    let t = stepElapsedMs * mul;

    if (t < FAN_APPROACH_MS) {
      return FAN_APPROACH_REVS * easeOutQuart(t / FAN_APPROACH_MS);
    }
    t -= FAN_APPROACH_MS;

    const showcaseMs = getFanShowcaseHoldMs(step);
    if (t < showcaseMs) {
      return FAN_APPROACH_REVS;
    }
    t -= showcaseMs;

    const retreatHandoffMs = FAN_RETREAT_MS + FAN_GAP_MS;
    const retreatHandoffRevs = FAN_RETREAT_REVS + FAN_HANDOFF_REVS;
    const u = Math.min(1, Math.max(0, t / retreatHandoffMs));
    return FAN_APPROACH_REVS + retreatHandoffRevs * easeInQuart(u);
  }

  function getAccumulatedRevs(stepElapsedMs, step, speedMul = 1) {
    let base = 0;
    for (let i = 0; i < step; i += 1) {
      base += getStepSpinRevsTotal();
    }
    return base + getRevsWithinStep(stepElapsedMs, step, speedMul);
  }

  function fanSpinEuler(seed, step, base, accumulatedRevs, yawSign = 1) {
    const yawDir = yawSign >= 0 ? 1 : -1;
    const baseQuat = new THREE.Quaternion().setFromEuler(base);
    const spinQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      accumulatedRevs * 2 * Math.PI * yawDir
    );
    return new THREE.Euler().setFromQuaternion(spinQuat.clone().multiply(baseQuat), base.order);
  }

  // --------------------------------------------------------
  // 3. PHASE SAMPLERS MODULE (페이즈별 독립 샘플러)
  // --------------------------------------------------------
  function sampleApproachPhase(state, step, stepElapsed, entry, faceRotation, presentationCount, motionSeed, rotationMode, speedMul) {
    const { phaseU } = state;
    const approachEase = easeInOutSine(phaseU);
    const approachRotEase = easeOutQuart(phaseU);
    const yawSign = resolveSpinYawSign(rotationMode);
    
    let presentationScale = THREE.MathUtils.lerp(FAN_SCALE_FAR, FAN_SCALE_PEAK, approachEase);
    let rotation = faceRotation.clone();
    
    const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, speedMul);

    if (step === 0) {
      rotation = slerpCubeTransition(entry, faceRotation, approachRotEase, step, rotationMode);
      rotation = fanSpinEuler(motionSeed, step + 3, rotation, accumulatedRevs, yawSign);
    } else {
      const prevStep = step - 1;
      const prevTotalMs = getFanStepSegmentMs(prevStep, speedMul);
      const prevExit = getCubeExitRotation(prevStep, presentationCount);
      
      const prevRevs = getAccumulatedRevs(prevTotalMs, prevStep, speedMul);
      const prevHandoffEnd = fanSpinEuler(
        motionSeed,
        prevStep + 31,
        prevExit.clone(),
        prevRevs,
        yawSign
      );
      
      rotation = slerpCubeTransition(prevHandoffEnd, faceRotation, approachRotEase, step, rotationMode);
      rotation = fanSpinEuler(motionSeed, step + 3, rotation, accumulatedRevs, yawSign);
    }
    
    return {
      presentationScale,
      rotation,
      parallaxAmount: 0,
      focusPulse: 0,
      phase: "approach"
    };
  }

  function sampleShowcaseHoldPhase(state, step, stepElapsed, faceRotation, motionSeed, rotationMode, speedMul) {
    const { phaseU, phaseElapsed } = state;
    const breathe = Math.sin(phaseU * Math.PI);
    const yawSign = resolveSpinYawSign(rotationMode);

    const rotation = fanSpinEuler(
      motionSeed,
      step + 3,
      faceRotation.clone(),
      FAN_APPROACH_REVS,
      yawSign
    );

    const holdEnvelope = slowShowcaseEnvelope(phaseU);
    const rawParallax = FAN_PARALLAX_PEAK * 0.72 * (0.96 + 0.04 * breathe) * holdEnvelope;
    const parallaxAmount = Math.min(FAN_PARALLAX_PEAK, Math.max(0, rawParallax));
    return {
      presentationScale: FAN_SCALE_PEAK,
      rotation,
      parallaxAmount: PARALLAX_ALLOWED.includes("showcase_hold") ? parallaxAmount : 0,
      focusPulse: holdEnvelope * (step === 0 ? 0.34 + 0.08 * breathe : 0.3 + 0.06 * breathe),
      phase: "showcase_hold"
    };
  }

  function sampleRetreatPhase(state, step, stepElapsed, faceRotation, exit, motionSeed, rotationMode, speedMul) {
    const { phaseU } = state;
    const retreatEase = easeInOutSine(phaseU);
    const retreatRotEase = easeInQuart(phaseU);
    const yawSign = resolveSpinYawSign(rotationMode);
    
    let presentationScale = THREE.MathUtils.lerp(FAN_SCALE_PEAK, FAN_SCALE_RETREAT, retreatEase);
    const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, speedMul);
    
    let rotation = slerpCubeTransition(faceRotation, exit, retreatRotEase, step, rotationMode);
    rotation = fanSpinEuler(
      motionSeed,
      step + 17,
      rotation,
      accumulatedRevs,
      yawSign
    );
    
    return {
      presentationScale,
      rotation,
      parallaxAmount: 0,
      focusPulse: 0,
      phase: "retreat"
    };
  }

  function sampleHandoffPhase(state, step, stepElapsed, exit, motionSeed, rotationMode, speedMul) {
    const { phaseU } = state;
    const handoffEase = easeInOutSine(phaseU);
    const yawSign = resolveSpinYawSign(rotationMode);
    
    const accumulatedRevs = getAccumulatedRevs(stepElapsed, step, speedMul);
    
    let rotation = exit.clone();
    rotation = fanSpinEuler(
      motionSeed,
      step + 31,
      rotation,
      accumulatedRevs,
      yawSign
    );
    
    return {
      presentationScale: FAN_SCALE_RETREAT,
      rotation,
      parallaxAmount: 0,
      focusPulse: 0,
      phase: "handoff"
    };
  }

  // --------------------------------------------------------
  // 4. ORCHESTRATOR MODULE (메인 오케스트레이터)
  // --------------------------------------------------------
  function getPresentationDurationMs(presentationCount, speedMul = 1) {
    const count = Math.max(1, presentationCount);
    let total = 0;
    for (let step = 0; step < count; step += 1) {
      total += getFanStepSegmentMs(step, speedMul);
    }
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    return total + FAN_LOOP_BRIDGE_MS / mul;
  }

  function sampleFanCubeMotion(
    step,
    stepElapsed,
    currentFace,
    presentationCount,
    motionSeed,
    rotationMode,
    speedMul
  ) {
    const state = resolveFanPhase(step, stepElapsed, speedMul);
    const faceRotation = getCubeShowcaseRootRotation(currentFace);
    const entry = getCubeEntryRotation(step);
    const exit = getCubeExitRotation(step, presentationCount);

    switch (state.phase) {
      case "approach":
        return sampleApproachPhase(state, step, stepElapsed, entry, faceRotation, presentationCount, motionSeed, rotationMode, speedMul);
      case "showcase_hold":
        return sampleShowcaseHoldPhase(state, step, stepElapsed, faceRotation, motionSeed, rotationMode, speedMul);
      case "retreat":
        return sampleRetreatPhase(state, step, stepElapsed, faceRotation, exit, motionSeed, rotationMode, speedMul);
      case "handoff":
      default:
        return sampleHandoffPhase(state, step, stepElapsed, exit, motionSeed, rotationMode, speedMul);
    }
  }

  function sampleLoopBridge(bridgeElapsed, bridgeMs, lastStep, motionSeed = 0, rotationMode = "auto", speedMul = 1) {
    const yawSign = resolveSpinYawSign(rotationMode);
    const totalStepMs = getFanStepSegmentMs(lastStep, speedMul);
    
    const lastStepExit = CORNER_REST.clone();
    const fromRotation = fanSpinEuler(
      motionSeed,
      lastStep + 31,
      lastStepExit,
      getAccumulatedRevs(totalStepMs, lastStep, speedMul),
      yawSign
    );

    const alpha = easeInOutSine(Math.min(1, Math.max(0, bridgeElapsed / Math.max(bridgeMs, 1))));
    const rotation = slerpEuler(fromRotation, CORNER_REST, alpha);
    const scale = THREE.MathUtils.lerp(FAN_SCALE_RETREAT, FAN_SCALE_FAR, alpha);
    return { rotation, presentationScale: scale };
  }

  function createMotionSeed(processedImages) {
    let hash = 0;
    processedImages.forEach((image, index) => {
      hash = (Math.imul(hash, 31) + (image.id || index)) | 0;
    });
    return hash;
  }

  global.WeddingSimpleFan = {
    FAN_LOOP_BRIDGE_MS,
    getPresentationFace,
    getFanStepSegmentMs,
    getPresentationDurationMs,
    resolveFanPhase,
    resolvePresentationTimeline,
    sampleFanCubeMotion,
    sampleLoopBridge,
    createMotionSeed,
  };
})(typeof window !== "undefined" ? window : globalThis);
