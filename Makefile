# Stock Analyzer — Makefile
# Builds the C++ application. Detects available system libraries.

CXX = g++
CXXFLAGS = -std=c++17 -O2 -Wall -Wextra
INCLUDES = -Ilib -Isrc/cpp
LDFLAGS = -pthread

SRCDIR = src/cpp
BUILDDIR = build
SOURCES = $(SRCDIR)/main.cpp $(SRCDIR)/server.cpp $(SRCDIR)/analysis.cpp $(SRCDIR)/subprocess.cpp $(SRCDIR)/cache.cpp
TARGET = $(BUILDDIR)/stock_analyzer

# Detect webkit2gtk and GTK for GUI mode
HAS_WEBKIT := $(shell pkg-config --exists webkit2gtk-4.1 2>/dev/null && echo yes || (pkg-config --exists webkit2gtk-4.0 2>/dev/null && echo yes || echo no))

ifeq ($(HAS_WEBKIT),yes)
    # Try 4.1 first, then 4.0
    WEBKIT_VER := $(shell pkg-config --exists webkit2gtk-4.1 2>/dev/null && echo webkit2gtk-4.1 || echo webkit2gtk-4.0)
    GTK_CFLAGS := $(shell pkg-config --cflags gtk+-3.0 $(WEBKIT_VER))
    GTK_LIBS := $(shell pkg-config --libs gtk+-3.0 $(WEBKIT_VER))
    CXXFLAGS += $(GTK_CFLAGS)
    LDFLAGS += $(GTK_LIBS)
    $(info Building WITH GUI support ($(WEBKIT_VER)))
else
    CXXFLAGS += -DNO_GUI
    $(info Building in HEADLESS mode (no webkit2gtk-dev found))
    $(info Install libwebkit2gtk-4.1-dev for GUI: sudo apt install libwebkit2gtk-4.1-dev)
endif

.PHONY: all clean copy-assets java

all: $(TARGET) copy-assets

$(TARGET): $(SOURCES) | $(BUILDDIR)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $@ $(SOURCES) $(LDFLAGS)

$(BUILDDIR):
	mkdir -p $(BUILDDIR)

copy-assets:
	@cp -r src/frontend $(BUILDDIR)/frontend 2>/dev/null || true
	@cp -r src/python $(BUILDDIR)/python 2>/dev/null || true
	@mkdir -p $(BUILDDIR)/java 2>/dev/null || true

java:
	@mkdir -p $(BUILDDIR)/java
	javac -d $(BUILDDIR)/java src/java/src/analyzer/*.java

clean:
	rm -rf $(BUILDDIR)
