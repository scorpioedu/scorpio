// Runs before every test file. Firebase sets GCLOUD_PROJECT in production; a fresh checkout or CI has none,
// and functions/src/grading.ts builds its Vertex AI client at import time, which throws without a project.
process.env.GCLOUD_PROJECT ||= "demo-scorpio";
