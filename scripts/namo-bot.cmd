@echo off
rem Starts Claude Code in this repo with the Telegram channel on, so feedback
rem sent to the Namo bot (from the owner and Rahul) arrives here. Keep this
rem window open: messages sent while it is closed are not received.
rem The rules the bot works by are in CLAUDE.md, "Feedback from Telegram".
set "PATH=%APPDATA%\npm;%USERPROFILE%\.bun\bin;%PATH%"
cd /d "%~dp0.."
claude --permission-mode acceptEdits --channels plugin:telegram@claude-plugins-official
