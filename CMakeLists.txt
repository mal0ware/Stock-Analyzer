cmake_minimum_required(VERSION 3.16)
project(StockAnalyzer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/lib
    ${CMAKE_SOURCE_DIR}/src/cpp
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
target_link_libraries(stock_analyzer pthread)

# Compiler flags
target_compile_options(stock_analyzer PRIVATE -O2)

# Copy frontend files to build directory
add_custom_command(TARGET stock_analyzer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${CMAKE_SOURCE_DIR}/src/frontend
    ${CMAKE_BINARY_DIR}/frontend
    COMMENT "Copying frontend files"
)

# Copy python files to build directory
add_custom_command(TARGET stock_analyzer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    ${CMAKE_SOURCE_DIR}/src/python
    ${CMAKE_BINARY_DIR}/python
    COMMENT "Copying Python files"
)

# Ensure java output directory exists
add_custom_command(TARGET stock_analyzer POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory ${CMAKE_BINARY_DIR}/java
    COMMENT "Ensuring java output directory exists"
)
