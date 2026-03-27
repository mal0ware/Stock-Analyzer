#include "subprocess.h"
#include <array>
#include <cstdio>
#include <cstdlib>
#include <stdexcept>
#include <sstream>
#include <unistd.h>
#include <sys/wait.h>
#include <cstring>
#include <vector>
#include <filesystem>

namespace subprocess {

static std::string basePath;

std::string getBasePath() {
    if (basePath.empty()) {
        // Get the directory of the executable
        char buf[4096];
        ssize_t len = readlink("/proc/self/exe", buf, sizeof(buf) - 1);
        if (len != -1) {
            buf[len] = '\0';
            std::string exePath(buf);
            basePath = exePath.substr(0, exePath.find_last_of('/'));
        } else {
            basePath = ".";
        }
    }
    return basePath;
}

std::string run(const std::string& command, const std::string& input) {
    if (!input.empty()) {
        // Need to pipe stdin - use fork/exec
        int stdinPipe[2];
        int stdoutPipe[2];

        if (pipe(stdinPipe) < 0 || pipe(stdoutPipe) < 0) {
            return "{\"error\":\"Failed to create pipes\"}";
        }

        pid_t pid = fork();
        if (pid < 0) {
            return "{\"error\":\"Failed to fork process\"}";
        }

        if (pid == 0) {
            // Child process
            close(stdinPipe[1]);  // Close write end of stdin
            close(stdoutPipe[0]); // Close read end of stdout

            dup2(stdinPipe[0], STDIN_FILENO);
            dup2(stdoutPipe[1], STDOUT_FILENO);
            dup2(stdoutPipe[1], STDERR_FILENO);

            close(stdinPipe[0]);
            close(stdoutPipe[1]);

            execl("/bin/sh", "sh", "-c", command.c_str(), nullptr);
            _exit(127);
        }

        // Parent process
        close(stdinPipe[0]);  // Close read end of stdin
        close(stdoutPipe[1]); // Close write end of stdout

        // Write input
        write(stdinPipe[1], input.c_str(), input.size());
        close(stdinPipe[1]);

        // Read output
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

        return output;
    }

    // Simple case - no stdin input needed
    std::string fullCommand = command + " 2>&1";
    std::array<char, 4096> buffer;
    std::string result;

    FILE* pipe = popen(fullCommand.c_str(), "r");
    if (!pipe) {
        return "{\"error\":\"Failed to execute command\"}";
    }

    while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
        result += buffer.data();
    }

    int status = pclose(pipe);
    if (WEXITSTATUS(status) != 0 && result.empty()) {
        return "{\"error\":\"Command failed with exit code " + std::to_string(WEXITSTATUS(status)) + "\"}";
    }

    return result;
}

static std::string findExecutable(const std::string& name) {
    // Check common user-local and system locations
    std::string home = getenv("HOME") ? getenv("HOME") : "";
    std::vector<std::string> candidates;

    if (name == "java") {
        if (!home.empty()) {
            candidates.push_back(home + "/.local/jdk/bin/java");
            candidates.push_back(home + "/.sdkman/candidates/java/current/bin/java");
        }
        candidates.push_back("/usr/bin/java");
        candidates.push_back("/usr/local/bin/java");
    } else if (name == "python3") {
        if (!home.empty()) {
            candidates.push_back(home + "/.local/bin/python3");
        }
        candidates.push_back("/usr/bin/python3");
        candidates.push_back("/usr/local/bin/python3");
    }

    for (auto& c : candidates) {
        if (std::filesystem::exists(c)) return c;
    }
    return name; // fallback to PATH lookup
}

std::string runPython(const std::string& script, const std::string& args) {
    std::string path = getBasePath() + "/python/" + script;
    // Fallback: check if running from build dir
    if (!std::filesystem::exists(path)) {
        path = getBasePath() + "/../src/python/" + script;
    }
    std::string python = findExecutable("python3");
    std::string cmd = python + " \"" + path + "\" " + args;
    return run(cmd);
}

std::string runJava(const std::string& className, const std::string& args, const std::string& input) {
    std::string classPath = getBasePath() + "/java";
    // Fallback
    if (!std::filesystem::exists(classPath + "/analyzer")) {
        classPath = getBasePath() + "/../build/java";
    }
    std::string java = findExecutable("java");
    std::string cmd = java + " -cp \"" + classPath + "\" " + className;
    if (!args.empty()) {
        cmd += " " + args;
    }
    return run(cmd, input);
}

} // namespace subprocess
