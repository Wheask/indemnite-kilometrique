import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Trip } from '@/types/trip';

// ── Client Supabase ─────────────────────────────────────────────────────────
// Si les variables d'environnement ne sont pas définies, le client est null
// et l'app fonctionne en mode localStorage seul (dégradation gracieuse).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

// ── Types ───────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  email: string;
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase non configuré');
  return supabase.auth.signUp({ email, password });
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase non configuré');
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// ── Trips CRUD ──────────────────────────────────────────────────────────────

/** Sauvegarde (upsert) un trajet terminé dans Supabase */
export async function saveTripToCloud(userId: string, trip: Trip): Promise<void> {
  if (!supabase || trip.status !== 'completed') return;
  await supabase.from('trips').upsert({
    id:             trip.id,
    user_id:        userId,
    start_time:     trip.startTime,
    end_time:       trip.endTime,
    distance_km:    trip.distanceKm,
    duration_ms:    trip.durationMs,
    indemnite:      trip.indemnite,
    status:         trip.status,
    start_address:  trip.startAddress,
    end_address:    trip.endAddress,
    points:         trip.points,
    cities_visited: trip.citiesVisited,
  }, { onConflict: 'id' });
}

/** Charge tous les trajets de l'utilisateur depuis Supabase */
export async function loadTripsFromCloud(): Promise<Trip[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'completed')
    .order('start_time', { ascending: false });

  if (error || !data) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((row: any): Trip => ({
    id:             row.id,
    startTime:      row.start_time,
    endTime:        row.end_time,
    distanceKm:     row.distance_km,
    durationMs:     row.duration_ms,
    indemnite:      row.indemnite,
    status:         row.status,
    startAddress:   row.start_address,
    endAddress:     row.end_address,
    points:         row.points ?? [],
    citiesVisited:  row.cities_visited ?? [],
  }));
}

/** Supprime un trajet de Supabase */
export async function deleteTripFromCloud(tripId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('trips').delete().eq('id', tripId);
}

/** Synchronise les trajets localStorage vers Supabase (migration initiale) */
export async function syncLocalTripsToCloud(
  userId: string,
  localTrips: Trip[]
): Promise<void> {
  if (!supabase || localTrips.length === 0) return;
  const rows = localTrips
    .filter((t) => t.status === 'completed')
    .map((trip) => ({
      id:             trip.id,
      user_id:        userId,
      start_time:     trip.startTime,
      end_time:       trip.endTime,
      distance_km:    trip.distanceKm,
      duration_ms:    trip.durationMs,
      indemnite:      trip.indemnite,
      status:         trip.status,
      start_address:  trip.startAddress,
      end_address:    trip.endAddress,
      points:         trip.points,
      cities_visited: trip.citiesVisited,
    }));
  if (rows.length > 0) {
    await supabase.from('trips').upsert(rows, { onConflict: 'id' });
  }
}
