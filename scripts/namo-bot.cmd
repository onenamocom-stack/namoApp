@echo off
rem Starts Claude Code in this repo with the Telegram channel on, so feedback
rem sent to the Namo bot (from the owner and Rahul) arrives here. Keep this
rem window open: messages sent while it is closed are not received.
rem The rules the bot works by are in CLAUDE.md, "Feedback from Telegram".
set "PATH=%APPDATA%\npm;%USERPROFILE%\.bun\bin;%PATH%"
rem Started from inside another Claude session (an editor, a tool), the
rem window inherits its markers and runs as a CHILD session, where the
rem Telegram channel does not start (seen 10 Oct 2026). Clear them.
for %%V in (CLAUDECODE CLAUDE_PID CLAUDE_AGENT_SDK_VERSION CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_SESSION_ID CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_EMIT_STARTUP_TIMING CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING CLAUDE_CODE_ENABLE_TASKS CLAUDE_CODE_QUESTION_PREVIEW_FORMAT MCP_CONNECTION_NONBLOCKING) do set "%%V="
cd /d "%~dp0.."
claude --permission-mode acceptEdits --channels plugin:telegram@claude-plugins-official
