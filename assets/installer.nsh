!macro customHeader
 !ifndef BUILD_UNINSTALLER
  Function FMCloseBeforeMigration
    ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 == 0
      Sleep 1500
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${If} $R0 == 0
        MessageBox MB_OK|MB_ICONINFORMATION "Cerrá el launcher y el juego antes de actualizar. Tus partidas se conservan." /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
    ${EndIf}
  FunctionEnd
 !endif
!macroend

!macro customInit
  ReadRegStr $R8 HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $R8 != ""
  ${AndIf} ${FileExists} "$R8\${APP_EXECUTABLE_FILENAME}"
    StrCpy $appExe "$R8\${APP_EXECUTABLE_FILENAME}"
    Call FMCloseBeforeMigration
    InitPluginsDir
    File /oname=$PLUGINSDIR\preserve-data.cjs "${BUILD_RESOURCES_DIR}\preserve-data.cjs"
    ReadEnvStr $R7 ELECTRON_RUN_AS_NODE
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t "1") i.r0'
    nsExec::ExecToLog '"$R8\${APP_EXECUTABLE_FILENAME}" "$PLUGINSDIR\preserve-data.cjs" "$R8" "$LOCALAPPDATA\ForbiddenMemoriesAmigos"'
    Pop $R6
    System::Call 'Kernel32::SetEnvironmentVariable(t "ELECTRON_RUN_AS_NODE", t R7) i.r0'
    ${If} $R6 != 0
      MessageBox MB_OK|MB_ICONSTOP "No se pudo proteger tu juego y tus partidas. La actualización se canceló. Cerrá el juego y volvé a intentar." /SD IDOK
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
!macroend


!macro customInstall
  ${If} ${isUpdated}
  ${AndIf} ${Silent}
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --updated'
  ${EndIf}
!macroend
