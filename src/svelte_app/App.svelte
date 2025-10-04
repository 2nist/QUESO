<!-- App.svelte -->
<div class="min-h-screen bg-background text-foreground font-sans tracking-normal">
  <div class="max-w-5xl mx-auto p-6">
    <h1 class="text-2xl font-bold">QUESO</h1>
    <div class="mt-4 card">
      <label class="block text-sm opacity-80">Input</label>
      <input class="mt-1 input" placeholder="C:\music\song.wav or https://..." />
      <div class="mt-3 flex gap-2">
        <button class="btn">Analyze</button>
        <button class="btn btn-secondary">Cancel</button>
      </div>
    </div>
  </div>
</div>
