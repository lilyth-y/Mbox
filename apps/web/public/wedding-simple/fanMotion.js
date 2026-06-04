/**
 * Wedding-simple fan-blade cube motion (vanilla JS, mirrors React cubeFanTimeline).
 */
(function initWeddingSimpleFan(global) {
  const THREE = global.THREE;
  if (!THREE) {
    console.warn("[fanMotion] THREE not loaded");
    return;
  }

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

  const FAN_APPROACH_MS = 2400;
  const FAN_OPENING_HOLD_MS = 1200;
  const FAN_SHOWCASE_HOLD_MS = 900;
  const FAN_RETREAT_MS = 2000;
  const FAN_GAP_MS = 1600;
  const FAN_LOOP_BRIDGE_MS = 1100;

  const FAN_SCALE_FAR = 0.5;
  const FAN_SCALE_PEAK = 1.05;
  const FAN_SCALE_RETREAT = 0.5;
  const FAN_PARALLAX_PEAK = 0.16;

  const STYLES = ["yaw_arc", "pitch_lift", "pitch_drop", "roll_tilt", "corner_swing", "yaw_arc"];

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

  function slerpEuler(current, target, alpha) {
    if (!current && !target) {
      return new THREE.Euler(0, 0, 0);
    }
    if (!current) {
      return target.clone ? target.clone() : new THREE.Euler(target.x || 0, target.y || 0, target.z || 0);
    }
    if (!target) {
      return current.clone ? current.clone() : new THREE.Euler(current.x || 0, current.y || 0, current.z || 0);
    }
    const from = new THREE.Quaternion().setFromEuler(current);
    const to = new THREE.Quaternion().setFromEuler(target);
    // Some THREE builds can be finicky about slerpQuaternions return values; use explicit slerp.
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

  function resolveCubeTransitionStyle(step, mode) {
    switch (mode) {
      case "yaw_cw":
        return { style: "yaw_arc", reverseYaw: false };
      case "yaw_ccw":
        return { style: "yaw_arc", reverseYaw: true };
      case "pitch_up":
        return { style: "pitch_lift", reverseYaw: false };
      case "pitch_down":
        return { style: "pitch_drop", reverseYaw: false };
      case "roll":
        return { style: "roll_tilt", reverseYaw: false };
      case "corner_swing":
        return { style: "corner_swing", reverseYaw: false };
      default:
        return { style: STYLES[step % STYLES.length] ?? "yaw_arc", reverseYaw: false };
    }
  }

  function accentWaypoint(from, to, style) {
    const mid = slerpEuler(from, to, 0.5);
    switch (style) {
      case "pitch_lift":
        mid.x -= 0.26;
        break;
      case "pitch_drop":
        mid.x += 0.24;
        break;
      case "roll_tilt":
        mid.z += 0.17 * (from.y < to.y ? 1 : -1);
        break;
      case "corner_swing":
        mid.x -= 0.14;
        mid.y += 0.11 * Math.sign(to.y - from.y || 1);
        mid.z += 0.09;
        break;
      default:
        mid.y += 0.07 * Math.sign(to.y - from.y || 1);
    }
    return mid;
  }

  function slerpCubeTransition(from, to, alpha, step, mode) {
    if (!from || !to) {
      return slerpEuler(from, to, alpha);
    }
    const { style, reverseYaw } = resolveCubeTransitionStyle(step, mode);
    const clamped = Math.min(1, Math.max(0, alpha));
    const fromEuler = reverseYaw ? to : from;
    const toEuler = reverseYaw ? from : to;
    const via = accentWaypoint(fromEuler, toEuler, style);
    if (clamped <= 0.5) {
      return slerpEuler(fromEuler, via, clamped * 2);
    }
    return slerpEuler(via, toEuler, (clamped - 0.5) * 2);
  }

  function getCubeEntryRotation(step) {
    if (step === 0) {
      return CORNER_REST.clone();
    }
    return getFaceRotation(getPresentationFace(step));
  }

  function getCubeExitRotation(step, presentationCount) {
    if (step + 1 >= presentationCount) {
      return CORNER_REST.clone();
    }
    return getFaceRotation(getPresentationFace(step + 1));
  }

  function getFanShowcaseHoldMs(step) {
    return step === 0 ? FAN_OPENING_HOLD_MS : FAN_SHOWCASE_HOLD_MS;
  }

  function getFanStepSegmentMs(step, speedMul = 1) {
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    return (FAN_APPROACH_MS + getFanShowcaseHoldMs(step) + FAN_RETREAT_MS + FAN_GAP_MS) / mul;
  }

  function getPresentationDurationMs(presentationCount, speedMul = 1) {
    const count = Math.max(1, presentationCount);
    let total = 0;
    for (let step = 0; step < count; step += 1) {
      total += getFanStepSegmentMs(step, speedMul);
    }
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    return total + FAN_LOOP_BRIDGE_MS / mul;
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

  const FAN_MIN_TRANSITION_SPIN = 0.016;
  const RETREAT_SPIN_MAX = 0.38;
  const HANDOFF_SPIN = 0.022;

  function resolveSpinYawSign(mode) {
    return mode === "yaw_ccw" ? -1 : 1;
  }

  function fanSpinEuler(seed, step, base, intensity, elapsedMs, speedMul, yawSign = 1) {
    if (intensity <= 0.001) {
      return base.clone();
    }
    const rnd = mulberry32(seed ^ step * 9973);
    const speed = Math.max(0.35, Math.min(2.5, speedMul));
    const seconds = elapsedMs / 1000;
    const spinEnvelope = 1 - Math.exp(-seconds * 0.85);
    const yawDir = yawSign >= 0 ? 1 : -1;
    const yawRate = (0.3 + rnd() * 0.42) * intensity * yawDir * speed;
    const pitchRate = (0.04 + rnd() * 0.1) * intensity * (rnd() > 0.5 ? 1 : -1) * speed;
    const rollRate = (0.025 + rnd() * 0.07) * intensity * (rnd() > 0.5 ? 1 : -1) * speed;
    const euler = base.clone();
    euler.y += yawRate * seconds * spinEnvelope;
    euler.x += pitchRate * seconds * 0.32 * spinEnvelope;
    euler.z += rollRate * seconds * 0.22 * spinEnvelope;
    return euler;
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

  function sampleFanCubeMotion(
    step,
    stepElapsed,
    currentFace,
    presentationCount,
    motionSeed,
    rotationMode,
    speedMul
  ) {
    const { phase, phaseU, phaseElapsed } = resolveFanPhase(step, stepElapsed, speedMul);
    const faceRotation = getFaceRotation(currentFace);
    const entry = getCubeEntryRotation(step);
    const exit = getCubeExitRotation(step, presentationCount);

    const approachEase = easeInOutSine(phaseU);
    const retreatEase = easeInOutSine(phaseU);
    const handoffEase = easeInOutSine(phaseU);
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    const showcaseHoldMs = getFanShowcaseHoldMs(step) / mul;
    const approachMs = FAN_APPROACH_MS / mul;
    const retreatStartMs = approachMs + showcaseHoldMs;
    const transitionSpinMs = Math.max(0, stepElapsed - retreatStartMs);
    const yawSign = resolveSpinYawSign(rotationMode);
    const transitionSpinIntensity = Math.max(FAN_MIN_TRANSITION_SPIN, HANDOFF_SPIN);

    let presentationScale = FAN_SCALE_RETREAT;
    let rotation = faceRotation.clone();
    let parallaxAmount = 0;
    let focusPulse = 0;

    switch (phase) {
      case "approach": {
        const approachFrom = FAN_SCALE_FAR;
        presentationScale = THREE.MathUtils.lerp(approachFrom, FAN_SCALE_PEAK, approachEase);
        if (step === 0) {
          const spinIntensity = THREE.MathUtils.lerp(0.85, 0.05, approachEase);
          rotation = slerpCubeTransition(entry, faceRotation, approachEase, step, rotationMode);
          rotation = fanSpinEuler(motionSeed, step + 3, rotation, spinIntensity, stepElapsed, speedMul, yawSign);
        } else {
          const prevStep = step - 1;
          const prevApproachMs = FAN_APPROACH_MS / mul;
          const prevShowcaseHoldMs = getFanShowcaseHoldMs(prevStep) / mul;
          const prevRetreatStartMs = prevApproachMs + prevShowcaseHoldMs;
          const prevTransitionEndMs = Math.max(
            0,
            getFanStepSegmentMs(prevStep, speedMul) - prevRetreatStartMs
          );
          const prevExit = getCubeExitRotation(prevStep, presentationCount);
          const prevHandoffEnd = fanSpinEuler(
            motionSeed,
            prevStep + 31,
            prevExit.clone(),
            transitionSpinIntensity,
            prevTransitionEndMs,
            speedMul,
            yawSign
          );
          rotation = slerpCubeTransition(prevHandoffEnd, faceRotation, approachEase, step, rotationMode);
        }
        parallaxAmount = FAN_PARALLAX_PEAK * approachEase * 0.5;
        focusPulse = 0;
        break;
      }
      case "showcase_hold": {
        const breathe = Math.sin(phaseU * Math.PI);
        presentationScale = FAN_SCALE_PEAK;
        rotation = faceRotation.clone();
        const spinRamp = Math.min(1, phaseElapsed / 520);
        rotation = fanSpinEuler(
          motionSeed,
          step + 3,
          rotation,
          0.07 * spinRamp,
          stepElapsed,
          speedMul,
          yawSign
        );
        parallaxAmount = FAN_PARALLAX_PEAK * (0.28 + 0.1 * breathe);
        focusPulse = step === 0 ? 0.2 + 0.08 * breathe : 0.14 + 0.06 * breathe;
        break;
      }
      case "retreat": {
        presentationScale = THREE.MathUtils.lerp(FAN_SCALE_PEAK, FAN_SCALE_RETREAT, retreatEase);
        let spinIntensity = THREE.MathUtils.lerp(0.05, RETREAT_SPIN_MAX, retreatEase);
        if (phaseU > 0.82) {
          spinIntensity *= (1 - (phaseU - 0.82) / 0.18);
        }
        const showcaseEnd = fanSpinEuler(
          motionSeed,
          step + 3,
          faceRotation.clone(),
          0.04,
          Math.max(0, retreatStartMs - 33),
          speedMul,
          yawSign
        );
        const slerpTarget = slerpCubeTransition(showcaseEnd, exit, retreatEase, step, rotationMode);
        rotation = slerpTarget;
        rotation = fanSpinEuler(
          motionSeed,
          step + 17,
          rotation,
          spinIntensity,
          transitionSpinMs,
          speedMul,
          yawSign
        );
        parallaxAmount = FAN_PARALLAX_PEAK * (1 - retreatEase) * 0.32;
        focusPulse = 0.06 * (1 - retreatEase);
        break;
      }
      case "handoff":
      default: {
        presentationScale = FAN_SCALE_RETREAT;
        rotation = exit.clone();
        rotation = fanSpinEuler(
          motionSeed,
          step + 31,
          rotation,
          transitionSpinIntensity,
          transitionSpinMs,
          speedMul,
          yawSign
        );
        parallaxAmount = 0.04 * (1 - handoffEase);
        focusPulse = 0;
        break;
      }
    }

    return { presentationScale, rotation, parallaxAmount, focusPulse, phase };
  }

  function sampleLoopBridge(bridgeElapsed, bridgeMs, lastStep, motionSeed = 0, rotationMode = "auto", speedMul = 1) {
    const mul = Math.max(0.35, Math.min(2.5, speedMul));
    const approachMs = FAN_APPROACH_MS / mul;
    const showcaseHoldMs = getFanShowcaseHoldMs(lastStep) / mul;
    const retreatMs = FAN_RETREAT_MS / mul;
    const transitionSpinMs = (FAN_APPROACH_MS + getFanShowcaseHoldMs(lastStep) + FAN_RETREAT_MS + FAN_GAP_MS) / mul - (approachMs + showcaseHoldMs);
    const yawSign = resolveSpinYawSign(rotationMode);
    const transitionSpinIntensity = Math.max(FAN_MIN_TRANSITION_SPIN, HANDOFF_SPIN);

    const lastStepExit = CORNER_REST.clone();
    const fromRotation = fanSpinEuler(
      motionSeed,
      lastStep + 31,
      lastStepExit,
      transitionSpinIntensity,
      transitionSpinMs * mul,
      speedMul,
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
