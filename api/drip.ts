// Vercel serves functions from the project root's api/ folder. The code lives in apps/relayer so it
// is tested with the rest of the workspace; this only exposes it at /api/drip on the site's origin.
export { GET, POST } from '../apps/relayer/api/drip.js';
