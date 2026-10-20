/* NOSTALGIA — online_config.js
 * The pluggable backend config for src/online.js (ARCHITECTURE §23, design/online_setup.md).
 *   N.ONLINE_CONFIG = null                         -> the Online menu says "Online play is coming soon"
 *                                                     and nothing is loaded (the guest / offline game as before)
 *   N.ONLINE_CONFIG = {provider: 'supabase', url, key, ...}  -> online play on (web pages only; file:// stays off)
 * Fields: url (project URL), key (the PUBLIC publishable key: safe to ship; the database only lets it call the
 *   save_* / journey_* / profile_* functions), sdk (script URLs tried in order; the vendored copy is the fallback),
 *   realtimeKey (optional: a legacy anon JWT for Realtime if the project's Realtime ever rejects the
 *   publishable key), maxPlayers (room cap, 10), stateHz (position updates per second, 8).
 * Tests (tests/online.cjs) set window.NOSTALGIA_ONLINE_CONFIG before the page loads to point the game at a
 * local stand-in server, or to null for the "coming soon" path.
 */
(() => {
  'use strict';
  const N = window.N;
  const override = Object.prototype.hasOwnProperty.call(window, 'NOSTALGIA_ONLINE_CONFIG');
  N.ONLINE_CONFIG = override ? window.NOSTALGIA_ONLINE_CONFIG : {
    provider: 'supabase',
    url: 'https://gralunajtfapqkpwulyg.supabase.co',
    key: 'sb_publishable_VyeXDrbTZtdEpZ3ZGnZvEQ_bKuUUTSM',
    sdk: [
      'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js',
      'vendor/supabase/supabase.js',
      '../vendor/supabase/supabase.js',
    ],
    // public legacy anon key, used only for Realtime rooms (safest choice until rooms are confirmed on the publishable key)
    realtimeKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdyYWx1bmFqdGZhcHFrcHd1bHlnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0Mjc5MTksImV4cCI6MjEwODAwMzkxOX0.TyTS2Ip0_YmCzSeU4dcXrqvm19x3PP_91Jy367HpHvU',
    maxPlayers: 10,
    stateHz: 8,
  };
})();
