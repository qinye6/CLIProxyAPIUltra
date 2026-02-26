package geminiCLI

import (
	. "github.com/qinye6/CLIProxyAPIUltra/internal/constant"
	"github.com/qinye6/CLIProxyAPIUltra/internal/interfaces"
	"github.com/qinye6/CLIProxyAPIUltra/internal/translator/translator"
)

func init() {
	translator.Register(
		GeminiCLI,
		Claude,
		ConvertGeminiCLIRequestToClaude,
		interfaces.TranslateResponse{
			Stream:     ConvertClaudeResponseToGeminiCLI,
			NonStream:  ConvertClaudeResponseToGeminiCLINonStream,
			TokenCount: GeminiCLITokenCount,
		},
	)
}
