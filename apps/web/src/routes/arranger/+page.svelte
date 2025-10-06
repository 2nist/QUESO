<script>
  import KaraokePlayer from '$lib/components/KaraokePlayer.svelte';
  const TRACK_ID = 'demo-track-001';
  const API = import.meta.env.VITE_API_BASE || 'http://localhost:8080';
  const src = `${API}/api/tracks/${TRACK_ID}/arrangement`;
</script>

<KaraokePlayer {src} />
