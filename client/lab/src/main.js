import './app.css'
import App from './App.svelte'

// Remove the static fallback placeholder from index.html immediately
// so users don't see the "loading (static fallback)" message after the
// client script starts executing.
try {
	document.getElementById('lab-debug')?.remove()
} catch (e) {
	// swallow — non-critical
}

const app = new App({ target: document.getElementById('app') })
export default app
