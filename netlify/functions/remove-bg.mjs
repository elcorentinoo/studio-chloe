/**
 * Netlify Function — proxy sécurisé vers l'API Remove.bg
 * ----------------------------------------------------------------------------
 * Le navigateur envoie l'image ici (POST multipart, champ « image_file »).
 * La fonction ajoute la clé API côté serveur puis relaie la requête à Remove.bg.
 * → La clé n'est JAMAIS visible dans le code du site ni dans le dépôt GitHub.
 *
 * Configuration : Netlify → Site configuration → Environment variables
 *   REMOVE_BG_API_KEY = votre clé Remove.bg
 *
 * Accessible sur : /api/remove-bg
 */

const REMOVE_BG_ENDPOINT = 'https://api.remove.bg/v1.0/removebg';
const ALLOWED_SIZES = new Set(['preview', 'auto', 'full']);

const jsonError = (title, status) =>
  Response.json({ errors: [{ title }] }, { status });

export default async (req) => {
  if (req.method !== 'POST') return jsonError('Méthode non autorisée', 405);

  const apiKey = Netlify.env.get('REMOVE_BG_API_KEY');
  if (!apiKey) {
    return jsonError('Clé REMOVE_BG_API_KEY absente dans les variables d’environnement Netlify', 500);
  }

  let incoming;
  try {
    incoming = await req.formData();
  } catch {
    return jsonError('Corps de requête invalide (multipart attendu)', 400);
  }

  const image = incoming.get('image_file');
  if (!image || typeof image === 'string') return jsonError('Aucune image reçue', 400);

  const size = ALLOWED_SIZES.has(incoming.get('size')) ? incoming.get('size') : 'preview';

  // Requête relayée à Remove.bg (la réponse est un PNG transparent, ou un JSON d'erreur)
  const outgoing = new FormData();
  outgoing.append('image_file', image, 'source');
  outgoing.append('size', size);
  outgoing.append('format', 'png');

  let upstream;
  try {
    upstream = await fetch(REMOVE_BG_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: outgoing,
    });
  } catch {
    return jsonError('Remove.bg injoignable depuis le serveur', 502);
  }

  // On renvoie tel quel : statut, type de contenu et corps (image ou erreur JSON)
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  });
};

export const config = { path: '/api/remove-bg' };
