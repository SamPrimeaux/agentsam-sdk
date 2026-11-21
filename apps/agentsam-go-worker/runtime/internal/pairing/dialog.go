package pairing

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
)

// NativeApprover shows the platform's own Allow/Deny dialog. Dialog text is
// built from a validated origin and passed as argv, never through a shell.
func NativeApprover() Approver {
	return func(ctx context.Context, origin string) (bool, error) {
		if !ValidOrigin(origin) {
			return false, errors.New("invalid origin")
		}
		msg := "Allow " + origin + " to connect to AgentSam on this computer?\n\nThis lets that site run commands and use Docker here. Only allow sites you trust."
		var cmd *exec.Cmd
		switch runtime.GOOS {
		case "darwin":
			script := `display dialog "` + strings.ReplaceAll(msg, "\n", `" & return & "`) + `" with title "AgentSam" buttons {"Deny", "Allow"} default button "Deny" cancel button "Deny" with icon caution giving up after 60`
			cmd = exec.CommandContext(ctx, "osascript", "-e", script)
		case "linux":
			if p, err := exec.LookPath("zenity"); err == nil {
				cmd = exec.CommandContext(ctx, p, "--question", "--title=AgentSam", "--text="+msg, "--ok-label=Allow", "--cancel-label=Deny", "--timeout=60")
			} else if p, err := exec.LookPath("kdialog"); err == nil {
				cmd = exec.CommandContext(ctx, p, "--title", "AgentSam", "--yesno", msg)
			} else {
				return false, errors.New("no dialog tool (zenity or kdialog) found")
			}
		case "windows":
			ps := "Add-Type -AssemblyName PresentationFramework; $r=[System.Windows.MessageBox]::Show('Allow " + origin + " to connect to AgentSam on this computer?','AgentSam','YesNo','Warning','No'); if($r -eq 'Yes'){exit 0}else{exit 1}"
			cmd = exec.CommandContext(ctx, "powershell", "-NoProfile", "-Command", ps)
		default:
			return false, errors.New("unsupported platform")
		}
		out, err := cmd.Output()
		if runtime.GOOS == "darwin" {
			// osascript exits non-zero on Deny/cancel; "gave up:true" means the prompt timed out.
			if err != nil {
				return false, nil
			}
			text := string(out)
			return strings.Contains(text, "button returned:Allow") && !strings.Contains(text, "gave up:true"), nil
		}
		if err != nil {
			var ee *exec.ExitError
			if errors.As(err, &ee) {
				return false, nil
			}
			return false, err
		}
		return true, nil
	}
}
