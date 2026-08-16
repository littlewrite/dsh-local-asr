using System;
using System.Speech.Recognition;

var file = FindArgument("--file");
if (file == null)
{
    EmitError("missing --file <path>");
    return;
}

try
{
    using var recognizer = new SpeechRecognitionEngine();
    recognizer.LoadGrammar(new DictationGrammar());
    recognizer.SetInputToWaveFile(file);
    var result = recognizer.Recognize();
    Emit("final", result?.Text ?? "");
}
catch (Exception error)
{
    EmitError(error.Message);
}

static string? FindArgument(string name)
{
    for (var index = 0; index + 1 < Environment.GetCommandLineArgs().Length; index++)
    {
        if (Environment.GetCommandLineArgs()[index] == name)
            return Environment.GetCommandLineArgs()[index + 1];
    }
    return null;
}

static void Emit(string type, string text)
{
    Console.WriteLine($"{{\"type\":\"{Escape(type)}\",\"text\":\"{Escape(text)}\"}}");
    Console.Out.Flush();
}

static void EmitError(string message)
{
    Console.WriteLine($"{{\"type\":\"error\",\"message\":\"{Escape(message)}\"}}");
    Console.Out.Flush();
}

static string Escape(string value)
{
    return value.Replace("\\", "\\\\").Replace("\"", "\\\"")
        .Replace("\r", "\\r").Replace("\n", "\\n");
}
