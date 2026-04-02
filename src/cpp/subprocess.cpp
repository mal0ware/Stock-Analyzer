#include "subprocess.h"
#include <array>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <sstream>
#include <iostream>
#include <unistd.h>
#include <sys/wait.h>
#include <poll.h>
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
        uint32_t size = sizeof(buf);
        if (_NSGetExecutablePath(buf, &size) == 0) {
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
// Escape a string for safe embedding in a JSON string value.
// Handles quotes, backslashes, newlines, tabs, and control chars.
// ================================================================
static std::string sanitizeForJson(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    // Skip other control characters
                } else {
                    out += c;
                }
        }
    }
    return out;
}

// ================================================================
// Safe subprocess execution using fork/execvp (OWASP A03:2021)
//
// Stdout and stderr are captured on SEPARATE pipes so that
// warnings or error messages on stderr never corrupt the JSON
// output on stdout. Stderr is logged server-side for debugging.
//
// Arguments go directly to the target process via execvp, which
// prevents shell injection attacks regardless of input content.
// ================================================================
std::string run(const std::string& executable, const std::vector<std::string>& args, const std::string& input) {
    int stdinPipe[2]  = {-1, -1};
    int stdoutPipe[2] = {-1, -1};
    int stderrPipe[2] = {-1, -1};

    // Create stdout pipe (always needed)
    if (pipe(stdoutPipe) < 0) {
        return "{\"error\":\"Failed to create stdout pipe\"}";
    }

    // Create stderr pipe (always needed — keeps stderr separate from stdout)
    if (pipe(stderrPipe) < 0) {
        close(stdoutPipe[0]);
        close(stdoutPipe[1]);
        return "{\"error\":\"Failed to create stderr pipe\"}";
    }

    // Create stdin pipe only if we need to send input
    if (!input.empty()) {
        if (pipe(stdinPipe) < 0) {
            close(stdoutPipe[0]); close(stdoutPipe[1]);
            close(stderrPipe[0]); close(stderrPipe[1]);
            return "{\"error\":\"Failed to create stdin pipe\"}";
        }
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(stdoutPipe[0]); close(stdoutPipe[1]);
        close(stderrPipe[0]); close(stderrPipe[1]);
        if (stdinPipe[0] >= 0) { close(stdinPipe[0]); close(stdinPipe[1]); }
        return "{\"error\":\"Failed to fork process\"}";
    }

    if (pid == 0) {
        // ---- Child process ----

        // Redirect stdout to the stdout pipe
        close(stdoutPipe[0]);
        dup2(stdoutPipe[1], STDOUT_FILENO);
        close(stdoutPipe[1]);

        // Redirect stderr to the SEPARATE stderr pipe
        close(stderrPipe[0]);
        dup2(stderrPipe[1], STDERR_FILENO);
        close(stderrPipe[1]);

        // Redirect stdin if input is provided
        if (stdinPipe[0] >= 0) {
            close(stdinPipe[1]);
            dup2(stdinPipe[0], STDIN_FILENO);
            close(stdinPipe[0]);
        }

        // Clear environment variables that interfere with Python imports.
        // VIRTUAL_ENV and CONDA_PREFIX cause Python to modify sys.path,
        // which can make numpy (and other C extensions) try to import from
        // the wrong location — e.g., "you should not try to import numpy
        // from its source directory". This happens when the app is launched
        // from a shell that has a virtualenv or conda env activated.
        // __PYVENV_LAUNCHER__ is a macOS-specific variable set by framework
        // Python launchers that can redirect sys.prefix.
        unsetenv("VIRTUAL_ENV");
        unsetenv("CONDA_PREFIX");
        unsetenv("CONDA_DEFAULT_ENV");
        unsetenv("CONDA_SHLVL");
        unsetenv("PYTHONHOME");
        unsetenv("PYTHONPATH");
        unsetenv("__PYVENV_LAUNCHER__");

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
    // Close the write ends we don't use
    close(stdoutPipe[1]);
    close(stderrPipe[1]);
    if (stdinPipe[0] >= 0) close(stdinPipe[0]);

    // Write input to child's stdin (if any)
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

    // Read stdout and stderr concurrently using poll() to avoid deadlock.
    // If we read only stdout first and the stderr buffer fills, the child
    // blocks on stderr write and never closes stdout — deadlock.
    std::string output;
    std::string stderrOutput;
    char buf[4096];

    struct pollfd fds[2];
    fds[0].fd = stdoutPipe[0];
    fds[0].events = POLLIN;
    fds[1].fd = stderrPipe[0];
    fds[1].events = POLLIN;
    int openFds = 2;

    while (openFds > 0) {
        int ret = poll(fds, 2, 10000); // 10s timeout
        if (ret <= 0) break; // timeout or error

        // Read from stdout if ready
        if (fds[0].fd >= 0 && (fds[0].revents & (POLLIN | POLLHUP))) {
            ssize_t n = read(fds[0].fd, buf, sizeof(buf) - 1);
            if (n > 0) {
                buf[n] = '\0';
                output += buf;
            } else {
                close(fds[0].fd);
                fds[0].fd = -1;
                openFds--;
            }
        }

        // Read from stderr if ready
        if (fds[1].fd >= 0 && (fds[1].revents & (POLLIN | POLLHUP))) {
            ssize_t n = read(fds[1].fd, buf, sizeof(buf) - 1);
            if (n > 0) {
                buf[n] = '\0';
                stderrOutput += buf;
            } else {
                close(fds[1].fd);
                fds[1].fd = -1;
                openFds--;
            }
        }
    }

    // Clean up any remaining open fds
    if (fds[0].fd >= 0) close(fds[0].fd);
    if (fds[1].fd >= 0) close(fds[1].fd);

    // Wait for child to exit
    int status;
    waitpid(pid, &status, 0);

    // Log stderr output for debugging (goes to server's own stderr, not to API responses)
    if (!stderrOutput.empty()) {
        std::cerr << "[subprocess:" << executable << "] stderr: "
                  << stderrOutput.substr(0, 1000) << std::endl;
    }

    // Handle non-zero exit codes
    if (WIFEXITED(status) && WEXITSTATUS(status) != 0) {
        int exitCode = WEXITSTATUS(status);
        std::cerr << "[subprocess] " << executable << " exited with code " << exitCode << std::endl;

        if (output.empty()) {
            // No stdout output — build error from stderr
            std::string errMsg = stderrOutput.empty()
                ? "Process exited with code " + std::to_string(exitCode)
                : sanitizeForJson(stderrOutput.substr(0, 300));
            return "{\"error\":\"" + errMsg + "\"}";
        }
    }

    return output;
}

// ================================================================
// Executable discovery — finds Python/Java in known safe locations
// ================================================================
static std::string findExecutable(const std::string& name) {
    std::string home = getenv("HOME") ? getenv("HOME") : "";
    std::string base = getBasePath();
    std::vector<std::string> candidates;

    if (name == "java") {
        // Bundled JRE first (inside .app bundle or alongside the binary)
        candidates.push_back(base + "/jre/bin/java");
        candidates.push_back(base + "/jre/Contents/Home/bin/java");
        if (!home.empty()) {
            candidates.push_back(home + "/.local/jdk/bin/java");
            candidates.push_back(home + "/.sdkman/candidates/java/current/bin/java");
        }
        candidates.push_back("/opt/homebrew/bin/java");
        candidates.push_back("/opt/homebrew/opt/openjdk/bin/java");
        candidates.push_back("/usr/local/bin/java");
        candidates.push_back("/usr/bin/java");
    } else if (name == "python3") {
        // Bundled Python first (inside .app bundle or alongside the binary)
        candidates.push_back(base + "/python-env/bin/python3");
        // macOS Homebrew — where pip packages (yfinance) get installed.
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
        std::cerr << "[runPython] Script not found: " << path
                  << " (basePath=" << getBasePath() << ")" << std::endl;
        return "{\"error\":\"Python script not found: " + script + "\"}";
    }

    std::string python = findExecutable("python3");
    static bool logged = false;
    if (!logged) {
        std::cerr << "[runPython] Using python: " << python << ", script: " << path << std::endl;
        logged = true;
    }

#if defined(__APPLE__) && defined(__aarch64__)
    // On Apple Silicon, force arm64 architecture for universal system Python
    // binaries. Without this, Python may run as x86_64 if any ancestor in the
    // process tree was x86_64 (e.g., VS Code or Rosetta terminal), causing
    // arm64-only C extensions like numpy to fail with "incompatible architecture".
    // Bundled Python (inside getBasePath()) is already native arm64 and does
    // not need the arch wrapper.
    bool isBundled = python.rfind(getBasePath(), 0) == 0;
    if (!isBundled) {
        std::vector<std::string> fullArgs = {"-arm64", python, path};
        fullArgs.insert(fullArgs.end(), args.begin(), args.end());
        return run("/usr/bin/arch", fullArgs);
    }
#endif
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
