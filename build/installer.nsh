; AutoWSGR-GUI NSIS 自定义安装脚本
; 在安装过程中静默安装 VC++ Redistributable

!macro customInstall
  ; 检查 vcruntime140.dll 是否已存在
  IfFileExists "$SYSDIR\vcruntime140.dll" VCRedistInstalled 0
    DetailPrint "正在安装 Microsoft Visual C++ Redistributable..."
    nsExec::ExecToLog '"$INSTDIR\redist\vc_redist.x64.exe" /install /quiet /norestart'
    Pop $0
    DetailPrint "VC++ Redistributable 安装完成 (exit code: $0)"
  VCRedistInstalled:
!macroend
