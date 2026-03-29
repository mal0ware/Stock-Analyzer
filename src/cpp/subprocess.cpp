#include "subprocess.h"
#include <array>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <sstream>
#include <iostream>
#include <unistd.h>
#include <sys/wait.h>
#include <cstring>
#include <vector>
#include <filesystem>
#ifdef __APPLE__
#include <mach-o/dyld.h>
#include <climits>
#endif

namespace subprocess {

static std::string basePath;

std::string getBasePath() {
    if (basePath.empty()) {
        char buf[4096];
#ifdef __APPLE__
        // macOS: use _NSGetExecutablePath or /proc/self workaround
        uint32_t size = sizeof(buf);
        if (_NSGetExecutablePath(buf, &size) == 0) {
            // Resolve to absolute path
            char resolved[PATH_MAX];
            if (realpath(buf, resolved)) {
                std::string exePath(resolved);
                basePath = exePath.substr(0, exePath.find_last_of('/'));
            }
        }
#else
        ssize_t len = readlink("/proc/self/exe", buf, sizeof(buf) - 1);
        if (len != -1) {
            buf[len] = '\0';
            std::string exePath(buf);
            basePath = exePath.substr(0, exePath.find_last_of('/'));
        }
#endif
        if (basePath.empty()) {
            basePath = ".";
        }
    }
    return basePath;
}

// ================================================================
// Safe subprocess execution using fork/execvp (OWASP A03:2021)
//
// This function NEVER passes arguments through a shell interpreter.
// Arguments go directly to the target process via execvp, which
// prevents shell injection attacks regardless of input content.
// ================================================================
std::string run(const std::string& executable, const std::vector<std::string>& args, const std::string& input) {
    int stdinPipe[2]  = {-1, -1};
    int stdoutPipe[2] = {-1, -1};

    if (pipe(stdoutPipe) < 0) {
        return "{\"error\":\"Failed to create output pipe\"}";
    }
    if (!input.empty()) {
        if (pipe(stdinPipe) < 0) {
            close(stdoutPipe[0]);
            close(stdoutPipe[1]);
            return "{\"error\":\"Failed to create input pipe\"}";
        }
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(stdoutPipe[0]); close(stdoutPipe[1]);
        if (stdinPipe[0] >= 0) { close(stdinPipe[0]); close(stdinPipe[1]); }
        return "{\"error\":\"Failed to fork process\"}";
    }

    if (pid == 0) {
        // ---- Child process ----
        // Redirect stdout and stderr to the output pipe
        close(stdoutPipe[0]);
        dup2(stdoutPipe[1], STDOUT_FILENO);
        dup2(stdoutPipe[1], STDERR_FILENO);
        close(stdoutPipe[1]);

        // Redirect stdin if input is provided
        if (stdinPipe[0] >= 0) {
            close(stdinPipe[1]);
            dup2(stdinPipe[0], STDIN_FILENO);
            close(stdinPipe[0]);
        }

        // Build argv array for execvp (safe — no shell interpretation)
        std::vector<const char*> argv;
        argv.push_back(executable.c_str());
        for (const auto& arg : args) {
            argv.push_back(arg.c_str());
        }
        argv.push_back(nullptr);

        execvp(executable.c_str(), const_cast<char* const*>(argv.data()));
        // If execvp returns, the command was not found
        _exit(127);
    }

    // ---- Parent process ----
    close(stdoutPipe[1]);
    if (stdinPipe[0] >= 0) close(stdinPipe[0]);

    // Write input to child's stdin
    if (!input.empty() && stdinPipe[1] >= 0) {
        const char* data = input.c_str();
        size_t remaining = input.size();
        while (remaining > 0) {
            ssize_t written = write(stdinPipe[1], data, remaining);
            if (written <= 0) break;
            data += written;
            remaining -= written;
        }
        close(stdinPipe[1]);
    }

    // Read child's stdout
    std::string output;
    char buf[4096];
    ssize_t bytesRead;
    while ((bytesRead = read(stdoutPipe[0], buf, sizeof(buf) - 1)) > 0) {
        buf[bytesRead] = '\0';
        output += buf;
    }
    close(stdoutPipe[0]);

    int status;
    waitpid(pid, &status, 0);

    if (WIFEXITED(status) && WEXITSTATUS(status) != 0) {
        int exitCode = WEXITSTATUS(status);
        std::cerr << "[subprocess] " << executable << " exited with code " << exitCode << std::endl;
        if (!output.empty()) {
            std::cerr << "[subprocess] output: " << output.substr(0, 500) << std::endl;
        }
        if (output.empty()) {
            return "{\"error\":\"Command failed with exit code " +
                   std::to_string(exitCode) + "\"}";
        }
    }

    return output;
}

// ================================================================
// Executable discovery — finds Python/Java in known safe locations
// ================================================================
static std::string findExecutable(const std::string& name) {
    std::string home = getenv("HOME") ? getenv("HOME") : "";
    std::vector<std::string> candidates;

    if (name == "java") {
        // User-local installs first (setup.sh puts JDK here)
        if (!home.empty()) {
            candidates.push_back(home + "/.local/jdk/bin/java");
            candidates.push_back(home + "/.sdkman/candidates/java/current/bin/java");
        }
        // macOS Homebrew (Apple Silicon then Intel) — before system paths
        // because Homebrew versions have user-installed packages
        candidates.push_back("/opt/homebrew/bin/java");
        candidates.push_back("/opt/homebrew/opt/openjdk/bin/java");
        candidates.push_back("/usr/local/bin/java");
        candidates.push_back("/usr/bin/java");
    } else if (name == "python3") {
        // macOS Homebrew first — this is where pip packages (yfinance) get installed.
        // The system /usr/bin/python3 on macOS is Xcode's bare Python which does NOT
        // have user-installed packages, so it must be checked LAST.
        candidates.push_back("/opt/homebrew/bin/python3");
        if (!home.empty()) {
            candidates.push_back(home + "/.local/bin/python3");
        }
        candidates.push_back("/usr/local/bin/python3");
        candidates.push_back("/usr/bin/python3");
    }

    for (auto& c : candidates) {
        if (std::filesystem::exists(c)) return c;
    }
    return name; // fallback to PATH lookup via execvp
}

// ================================================================
// Python runner — passes arguments as a safe vector, never a shell string
// ================================================================
std::string runPython(const std::string& script, const std::vector<std::string>& args) {
    std::string path = getBasePath() + "/python/" + script;
    if (!std::filesystem::exists(path)) {
        path = getBasePath() + "/../src/python/" + script;
    }

    if (!std::filesystem::exists(path)) {
        std::cerr << "[runPython] Script not found: " << path << " (basePath=" << getBasePath() << ")" << std::endl;
        return "{\"error\":\"Python script not found: " + script + "\"}";
    }

    std::string python = findExecutable("python3");
    static bool logged = false;
    if (!logged) {
        std::cerr << "[runPython] Using python: " << python << ", script: " << path << std::endl;
        logged = true;
    }

    std::vector<std::string> fullArgs = {path};
    fullArgs.insert(fullArgs.end(), args.begin(), args.end());

    return run(python, fullArgs);
}

// ================================================================
// Java runner — passes arguments as a safe vector, never a shell string
// ================================================================
std::string runJava(const std::string& className, const std::vector<std::string>& args, const std::string& input) {
    std::string classPath = getBasePath() + "/java";
    if (!std::filesystem::exists(classPath + "/analyzer")) {
        classPath = getBasePath() + "/../build/java";
    }

    std::string java = findExecutable("java");
    std::vector<std::string> fullArgs = {"-cp", classPath, className};
    fullArgs.insert(fullArgs.end(), args.begin(), args.end());

    return run(java, fullArgs, input);
}

} // namespace subprocess
