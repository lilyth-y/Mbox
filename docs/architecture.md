# Architecture

## Flow

1. `apps/web` uploads an image and sends base64 payload to `apps/api`.
2. `apps/api` calls Vertex AI Gemini for JSON analysis metadata, including category suggestion and confidence.
3. `apps/api` normalizes analysis metadata and resolves the final suggested category through shared policy code in `packages/shared`.
4. `apps/web` optionally calls `apps/api` `/edit` for background removal before crop, or applies template background generation after crop.
5. `apps/web` crops the prepared image to 1024x1024 using returned center coordinates.
6. `apps/web` stores processed images in local gallery state and persists category catalog plus user assignments in browser storage.
7. `apps/web` renders presentation-ready images on the 3D cube within the shared byte budget.

## Boundaries

- `packages/shared` owns the API contract types, category enums, and category suggestion policy.
- `apps/api` owns prompts, model names, retries, and response parsing.
- `apps/web` owns UI state, cropping, gallery rendering, category UX, and cube lifecycle.
- `experiments` and `scripts` call the same API contract as the web app.

## Security

- Vertex AI credentials stay on the API process only through Application Default Credentials.
- `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` configure the Vertex endpoint.
- Browser code never imports or stores provider credentials.
