/**
 * Quick hosted vs local capability snapshot (no browser).
 */
const HOSTED =
  "https://mbox-web-newmedia-496107.storage.googleapis.com/index.html";
const API =
  "https://mbox-api-118689443638.asia-northeast3.run.app";

async function main() {
  const index = await fetch(HOSTED);
  const html = await index.text();
  const hasBatch = /data\/asset\s*배치/.test(html);
  const script = html.match(/src="(\.\/assets\/[^"]+\.js)"/)?.[1];
  const health = await fetch(`${API}/health`);
  const manifest = await fetch(`${API}/asset-manifest/data-asset`);

  console.log(
    JSON.stringify(
      {
        hosted: {
          indexStatus: index.status,
          bundle: script,
          devAssetBatchButtonInBundle: hasBatch,
          note: hasBatch
            ? "배치 버튼이 번들에 포함됨"
            : "프로덕션: 20장은 파일 다중 업로드 또는 로컬 배치 필요",
        },
        api: {
          health: health.status,
          dataAssetManifest: manifest.status,
          manifestWorksOnCloudRun: manifest.ok,
        },
        localE2E: {
          webUrl: "http://127.0.0.1:5174 (VITE_ENABLE_DEV_ASSET_BATCH=true)",
          script: "python scripts/run_data_asset_cube_e2e.py",
          manifest: "experiments/assets/data-asset-manifest.json (20 JPG)",
        },
        deliverable:
          "experiments/outputs/data_asset_cube_20.{mp4,webm}",
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
