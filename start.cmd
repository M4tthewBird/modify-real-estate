@echo off
rem Opens the copy of modifyrealestate.cz at http://localhost:4180. Close this window to stop it.

cd /d "%~dp0"
start "" http://localhost:4180
node tools\serve.mjs
