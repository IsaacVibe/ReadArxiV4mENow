tell application "Terminal"
	activate
	do script "cd /Users/bao/Desktop/DailyArxiv && RAVEN_FETCH_METHOD=auto RAVEN_HOST=127.0.0.1 RAVEN_PORT=5173 ./start_app.sh"
	try
		set miniaturized of front window to true
	end try
end tell
