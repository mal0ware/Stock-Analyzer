# Stock Analyzer — Makefile
# Builds the C++ backend server and analysis engine

CXX = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra
INCLUDES = -Ilib -Isrc/cpp
LDFLAGS = -pthread

SRCDIR = src/cpp
BUILDDIR = build
SOURCES = $(SRCDIR)/main.cpp $(SRCDIR)/server.cpp $(SRCDIR)/analysis.cpp $(SRCDIR)/subprocess.cpp $(SRCDIR)/cache.cpp
TARGET = $(BUILDDIR)/stock_analyzer

.PHONY: all clean copy-assets java

all: $(TARGET) copy-assets

$(TARGET): $(SOURCES) | $(BUILDDIR)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $@ $(SOURCES) $(LDFLAGS)

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
