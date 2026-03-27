cmake_minimum_required(VERSION 3.16)
project(StockAnalyzer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find required packages
find_package(PkgConfig REQUIRED)

# Try webkit2gtk-4.1 first, fall back to 4.0
pkg_check_modules(WEBKIT QUIET webkit2gtk-4.1)
if(NOT WEBKIT_FOUND)
    pkg_check_modules(WEBKIT REQUIRED webkit2gtk-4.0)
endif()

pkg_check_modules(GTK REQUIRED gtk+-3.0)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/lib
    ${CMAKE_SOURCE_DIR}/src/cpp
    ${WEBKIT_INCLUDE_DIRS}
    ${GTK_INCLUDE_DIRS}
)

# Link directories
link_directories(
    ${WEBKIT_LIBRARY_DIRS}
    ${GTK_LIBRARY_DIRS}
)

# Source files
set(SOURCES
    src/cpp/main.cpp
    src/cpp/server.cpp
    src/cpp/analysis.cpp
    src/cpp/subprocess.cpp
    src/cpp/cache.cpp
)

# Build executable
add_executable(stock_analyzer ${SOURCES})

# Link libraries
target_link_libraries(stock_analyzer
    ${WEBKIT_LIBRARIES}
    ${GTK_LIBRARIES}
    pthread
)

# Compiler flags
target_compile_options(stock_analyzer PRIVATE
    ${WEBKIT_CFLAGS_OTHER}
    ${GTK_CFLAGS_OTHER}
    -O2
)

# Copy frontend files to build directory
add_custom_command(TARGET stock_analyzer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${CMAKE_SOURCE_DIR}/src/frontend
    ${CMAKE_BINARY_DIR}/frontend
    COMMENT "Copying frontend files to build directory"
)

# Copy python files to build directory
add_custom_command(TARGET stock_analyzer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${CMAKE_SOURCE_DIR}/src/python
    ${CMAKE_BINARY_DIR}/python
    COMMENT "Copying Python files to build directory"
)

# Copy java class files if they exist
add_custom_command(TARGET stock_analyzer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/java
    COMMENT "Ensuring java output directory exists"
)
