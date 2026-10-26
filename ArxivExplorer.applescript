-- RAVEN 可移植启动器
-- 自动以「本 .app 所在的文件夹」作为项目目录（不依赖个人用户名），
-- 因此整个项目文件夹复制到另一台 Mac（含 Mac mini）后，重建本 .app 即可直接使用。
--
-- 重建方法：osacompile -o ArxivExplorer.app ArxivExplorer.applescript
-- （automation/setup_new_mac.sh 会自动重建）

on run
	set appPath to POSIX path of (path to me)
	set projectPath to do shell script "dirname " & quoted form of appPath
	tell application "Terminal"
		activate
		do script "cd " & quoted form of projectPath & " && ./start_app.sh"
	end tell
end run
