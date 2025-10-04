@echo off
echo Starting servers...

echo Starting Node.js API and Svelte Dev servers...
start "Web Servers" cmd /c "npm run dev"

echo All servers are starting in separate windows.
