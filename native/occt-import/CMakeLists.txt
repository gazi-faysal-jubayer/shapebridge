# shapebridge-occt: the desktop app's native STEP/IGES/BREP reader (see main.cpp). Built by scripts/build-occt.mjs.
# Licence: LGPL-2.1 with the OCCT exception, like OpenCascade itself. It is a separate program, not linked into
# ShapeBridge (Apache-2.0), which talks to it only through files and its exit code.
cmake_minimum_required(VERSION 3.16)
project(shapebridge_occt CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
find_package(OpenCASCADE CONFIG REQUIRED)

add_executable(shapebridge-occt main.cpp)
target_include_directories(shapebridge-occt PRIVATE ${OpenCASCADE_INCLUDE_DIR})
# OCCT's CMake package doesn't carry the dependencies of its static toolkits, so link every toolkit it built;
# the linker keeps only what is used. GNU ld needs a group to resolve their circular references.
if(UNIX AND NOT APPLE)
  target_link_libraries(shapebridge-occt PRIVATE -Wl,--start-group ${OpenCASCADE_LIBRARIES} -Wl,--end-group pthread dl)
else()
  target_link_libraries(shapebridge-occt PRIVATE ${OpenCASCADE_LIBRARIES})
endif()
if(WIN32)
  target_link_libraries(shapebridge-occt PRIVATE user32 advapi32 ws2_32 gdi32)
endif()
