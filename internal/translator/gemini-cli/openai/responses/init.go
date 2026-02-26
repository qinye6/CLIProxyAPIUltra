package responses

import (
	. "github.com/qinye6/CLIProxyAPIUltra/internal/constant"
	"github.com/qinye6/CLIProxyAPIUltra/internal/interfaces"
	"github.com/qinye6/CLIProxyAPIUltra/internal/translator/translator"
)

func init() {
	translator.Register(
		OpenaiResponse,
		GeminiCLI,
		ConvertOpenAIResponsesRequestToGeminiCLI,
		interfaces.TranslateResponse{
			Stream:    ConvertGeminiCLIResponseToOpenAIResponses,
			NonStream: ConvertGeminiCLIResponseToOpenAIResponsesNonStream,
		},
	)
}
