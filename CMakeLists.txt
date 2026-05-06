cmake_minimum_required(VERSION 3.20)
project(znake VERSION 1.0 LANGUAGES CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)

include(FetchContent)
set(FETCHCONTENT_QUIET FALSE)

# ── GLFW ──────────────────────────────────────────────────────────────────────
FetchContent_Declare(
    glfw
    GIT_REPOSITORY https://github.com/glfw/glfw.git
    GIT_TAG        3.4
    GIT_PROGRESS   TRUE
)
set(GLFW_BUILD_DOCS     OFF CACHE BOOL "" FORCE)
set(GLFW_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(GLFW_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GLFW_INSTALL        OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(glfw)

# ── GLM ───────────────────────────────────────────────────────────────────────
FetchContent_Declare(
    glm
    GIT_REPOSITORY https://github.com/g-truc/glm.git
    GIT_TAG        1.0.1
    GIT_PROGRESS   TRUE
)
FetchContent_MakeAvailable(glm)

# ── GLAD 2 ────────────────────────────────────────────────────────────────────
FetchContent_Declare(
    glad2
    GIT_REPOSITORY https://github.com/Dav1dde/glad.git
    GIT_TAG        glad2
    GIT_PROGRESS   TRUE
    SOURCE_SUBDIR  cmake
)
FetchContent_MakeAvailable(glad2)
glad_add_library(glad_gl STATIC REPRODUCIBLE API gl:core=3.3)

# ── Executable ────────────────────────────────────────────────────────────────
add_executable(znake src/main.cpp)

target_link_libraries(znake PRIVATE
    glad_gl
    glfw
    glm::glm
)

target_compile_definitions(znake PRIVATE GLFW_INCLUDE_NONE)

if(MSVC)
    target_compile_options(znake PRIVATE /W4)
    # UTF-8 source
    target_compile_options(znake PRIVATE /utf-8)
else()
    target_compile_options(znake PRIVATE -Wall -Wextra)
endif()

# Copy shaders next to the binary after every build
add_custom_command(TARGET znake POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
        "${CMAKE_SOURCE_DIR}/shaders"
        "$<TARGET_FILE_DIR:znake>/shaders"
    COMMENT "Copying shaders → bin/shaders/"
)
