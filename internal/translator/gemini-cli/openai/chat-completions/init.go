package chat_completions

import (
	. "github.com/qinye6/CLIProxyAPIUltra/internal/constant"
	"github.com/qinye6/CLIProxyAPIUltra/internal/interfaces"
	"github.com/qinye6/CLIProxyAPIUltra/internal/translator/translator"
)

func init() {
	translator.Register(
		OpenAI,
		GeminiCLI,
		ConvertOpenAIRequestToGeminiCLI,
		interfaces.TranslateResponse{
			Stream:    ConvertCliResponseToOpenAI,
			NonStream: ConvertCliResponseToOpenAINonStream,
		},
	)
}
