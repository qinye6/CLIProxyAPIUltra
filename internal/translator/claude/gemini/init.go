package gemini

import (
	. "github.com/qinye6/CLIProxyAPIUltra/internal/constant"
	"github.com/qinye6/CLIProxyAPIUltra/internal/interfaces"
	"github.com/qinye6/CLIProxyAPIUltra/internal/translator/translator"
)

func init() {
	translator.Register(
		Gemini,
		Claude,
		ConvertGeminiRequestToClaude,
		interfaces.TranslateResponse{
			Stream:     ConvertClaudeResponseToGemini,
			NonStream:  ConvertClaudeResponseToGeminiNonStream,
			TokenCount: GeminiTokenCount,
		},
	)
}
