-- Compile this app beside start_app.sh; the project can then be moved together.
set appPath to POSIX path of (path to me)
set projectDirectory to do shell script "/usr/bin/dirname " & quoted form of appPath
set launchCommand to "cd " & quoted form of projectDirectory & " && ./start_app.sh"
tell application "Terminal"
    activate
    do script launchCommand
end tell
