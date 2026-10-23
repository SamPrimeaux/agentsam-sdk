cmake_minimum_required(VERSION 3.20)
project(agentsam_occt_service LANGUAGES CXX)

# Backwards-compatible build entrypoint. The canonical implementation is in
# packages/agentsam-occt/native; do not copy engine source back into this folder.
add_subdirectory(
  "${CMAKE_CURRENT_LIST_DIR}/../../../packages/agentsam-occt/native"
  "${CMAKE_CURRENT_BINARY_DIR}/occt-engine-build"
)
