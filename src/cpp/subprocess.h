#pragma once
#include <string>
#include <vector>

namespace subprocess {

// Run a command with explicit argument list (no shell interpretation).
// This is the safe interface — arguments are passed directly to execvp,
// preventing shell injection attacks. (OWASP A03:2021)
std::string run(const std::string& executable, const std::vector<std::string>& args, const std::string& input = "");

// Get the path to the directory containing the running executable
std::string getBasePath();

// Run a Python script with safe argument passing (no shell)
std::string runPython(const std::string& script, const std::vector<std::string>& args);

// Run a Java class with safe argument passing, optionally piping input via stdin
std::string runJava(const std::string& className, const std::vector<std::string>& args, const std::string& input = "");

} // namespace subprocess
