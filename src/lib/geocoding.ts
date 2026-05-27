/**
 * Reverse geocoding via Nominatim (OpenStreetMap) — 100% gratuit, sans clé API
 * Limite : 1 requête/seconde max (respectée dans le hook de tracking)
 */

interface NominatimResult {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    municipality?: string;
    county?: string;
    country?: string;
  };
  display_name?: string;
}

/**
 * Récupère le nom de la ville à partir de coordonnées GPS
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'IndemniteKilometrique/1.0 (logan.ernoux@gmail.com)',
      },
    });
    if (!response.ok) return null;
    const data: NominatimResult = await response.json();
    if (!data.address) return null;

    return (
      data.address.city ||
      data.address.town ||
      data.address.village ||
      data.address.hamlet ||
      data.address.municipality ||
      data.address.county ||
      null
    );
  } catch {
    return null;
  }
}

/**
 * Récupère l'adresse complète à partir de coordonnées GPS
 */
export async function getAddress(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'IndemniteKilometrique/1.0 (logan.ernoux@gmail.com)',
      },
    });
    if (!response.ok) return null;
    const data: NominatimResult = await response.json();
    return data.display_name || null;
  } catch {
    return null;
  }
}
