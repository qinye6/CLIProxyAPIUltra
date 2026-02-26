package gemini

import (
	. "github.com/qinye6/CLIProxyAPIUltra/internal/constant"
	"github.com/qinye6/CLIProxyAPIUltra/internal/interfaces"
	"github.com/qinye6/CLIProxyAPIUltra/internal/translator/translator"
)

// Register a no-op response translator and a request normalizer for Gemini→Gemini.
// The request converter ensures missing or invalid roles are normalized to valid values.
func init() {
	translator.Register(
		Gemini,
		Gemini,
		ConvertGeminiRequestToGemini,
		interfaces.TranslateResponse{
			Stream:     PassthroughGeminiResponseStream,
			NonStream:  PassthroughGeminiResponseNonStream,
			TokenCount: GeminiTokenCount,
		},
	)
}
