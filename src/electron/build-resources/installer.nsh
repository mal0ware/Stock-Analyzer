; Custom NSIS installer script for Stock Analyzer
; Dark-themed branded installer/uninstaller

!macro customHeader
  !system "echo 'Stock Analyzer custom installer'"
!macroend

!macro preInit
  SetRegView 64
!macroend

; Custom install page colors — dark theme
!macro customInit
  ; Set MUI colors to match app dark theme
  SetSilent normal
!macroend

!macro customInstallMode
  StrCpy $INSTDIR "$LOCALAPPDATA\Stock Analyzer"
!macroend

!macro customUnInit
  ; Custom uninstaller init
!macroend

; After installation completes
!macro customInstall
  ; Create uninstaller entry with display icon
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "DisplayIcon" "$INSTDIR\Stock Analyzer.exe"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "Publisher" "mal0ware"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "URLInfoAbout" "https://mal0ware.github.io"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" \
    "HelpLink" "https://github.com/mal0ware/Stock-Analyzer"
!macroend
