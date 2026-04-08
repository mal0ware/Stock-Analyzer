# Stock Analyzer — Makefile
# Builds the C++ backend server and analysis engine
#
# Targets:
#   make              — Build for current platform
#   make windows      — Cross-compile for Windows (requires MinGW)
#   make java         — Compile Java classes
#   make clean        — Remove build artifacts

CXX = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra
INCLUDES = -Ilib -Isrc/cpp
LDFLAGS = -pthread

# MinGW cross-compiler for Windows targets
MINGW_CXX = x86_64-w64-mingw32-g++
MINGW_CXXFLAGS = -std=c++17 -O2 -Wall -DWIN32 -D_WIN32
MINGW_LDFLAGS = -lws2_32 -static -static-libgcc -static-libstdc++ -pthread

SRCDIR = src/cpp
BUILDDIR = build
SOURCES = $(SRCDIR)/main.cpp $(SRCDIR)/server.cpp $(SRCDIR)/analysis.cpp $(SRCDIR)/subprocess.cpp $(SRCDIR)/subprocess_pool.cpp $(SRCDIR)/cache.cpp
TARGET = $(BUILDDIR)/stock_analyzer
WIN_TARGET = $(BUILDDIR)/stock_analyzer.exe

.PHONY: all clean copy-assets java windows

all: $(TARGET) copy-assets

$(TARGET): $(SOURCES) | $(BUILDDIR)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $@ $(SOURCES) $(LDFLAGS)

windows: $(SOURCES) | $(BUILDDIR)
	$(MINGW_CXX) $(MINGW_CXXFLAGS) $(INCLUDES) -o $(WIN_TARGET) $(SOURCES) $(MINGW_LDFLAGS)

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

copy-assets:
	@rm -rf $(BUILDDIR)/frontend $(BUILDDIR)/python
	@cp -r src/frontend $(BUILDDIR)/frontend 2>/dev/null || true
	@cp -r src/python $(BUILDDIR)/python 2>/dev/null || true
	@mkdir -p $(BUILDDIR)/java 2>/dev/null || true

java:
	@mkdir -p $(BUILDDIR)/java
	javac -d $(BUILDDIR)/java src/java/src/analyzer/*.java

clean:
	rm -rf $(BUILDDIR)
