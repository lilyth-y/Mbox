function testSpline() {
  const N_app = 2, T_app = 2.4;
  const N_ret = 2, T_ret = 2.0;
  const N_gap = 2, T_gap = 1.6;

  const v0 = 2 * N_ret / T_ret; // 2.0
  const v1 = 2 * N_app / T_app; // 1.666...
  const T = T_gap;
  const dR = N_gap;

  const c2 = (3 * dR - (2 * v0 + v1) * T) / (T * T);
  const c3 = (-2 * dR + (v0 + v1) * T) / (T * T * T);

  console.log(`v0 = ${v0}, v1 = ${v1}, c2 = ${c2}, c3 = ${c3}`);

  for (let t = 0; t <= T + 0.01; t += 0.2) {
    const revs = v0 * t + c2 * t * t + c3 * t * t * t;
    const v = v0 + 2 * c2 * t + 3 * c3 * t * t;
    console.log(`t=${t.toFixed(1)}: revs=${revs.toFixed(3)}, v=${v.toFixed(3)}`);
  }
}
testSpline();
