Var ExistingInstallBeforeCopy

!macro NSIS_HOOK_PREINSTALL
  StrCpy $ExistingInstallBeforeCopy 0
  IfFileExists "$INSTDIR\${MAINBINARYNAME}.exe" 0 +2
    StrCpy $ExistingInstallBeforeCopy 1
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $ExistingInstallBeforeCopy = 1
    FileOpen $0 "$INSTDIR\.inspiration-drawer-post-install" w
    FileWrite $0 "1"
    FileClose $0
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$APPDATA\com.inspirationdrawer.app\browser-extension.json"
  RMDir /r "$APPDATA\com.inspirationdrawer.app\browser-extension"
!macroend
