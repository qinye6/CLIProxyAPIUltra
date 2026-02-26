package responses

import (
	. "github.com/qinye6/CLIProxyAPIUltra/internal/translator/antigravity/gemini"
	. "github.com/qinye6/CLIProxyAPIUltra/internal/translator/gemini/openai/responses"
)

func ConvertOpenAIResponsesRequestToAntigravity(modelName string, inputRawJSON []byte, stream bool) []byte {
	rawJSON := inputRawJSON
	rawJSON = ConvertOpenAIResponsesRequestToGemini(modelName, rawJSON, stream)
	return ConvertGeminiRequestToAntigravity(modelName, rawJSON, stream)
}
