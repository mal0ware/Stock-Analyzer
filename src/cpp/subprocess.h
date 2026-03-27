#pragma once
#include <string>

namespace subprocess {

// Run a command and capture stdout. Returns the stdout output.
// If the command fails, returns a JSON error string.
std::string run(const std::string& command, const std::string& input = "");

// Get the path to the project root (where the executable is)
std::string getBasePath();

// Run Python script and return output
std::string runPython(const std::string& script, const std::string& args);

// Run Java class and return output, optionally piping input via stdin
std::string runJava(const std::string& className, const std::string& args = "", const std::string& input = "");

} // namespace subprocess
