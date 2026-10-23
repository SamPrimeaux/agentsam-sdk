# AgentSam OCCT build entrypoint

The canonical reusable engine package is `packages/agentsam-occt`. This service path is retained as a backwards-compatible CMake entrypoint so existing build scripts keep working; the C++ implementation is not duplicated here.

```sh
cmake -S services/cad/occt -B /tmp/agentsam-occt-build -G Ninja \
  -DAGENTSAM_OCCT_PREFIX="$(brew --prefix opencascade)"
cmake --build /tmp/agentsam-occt-build
/tmp/agentsam-occt-build/agentsam-occt --doctor
/tmp/agentsam-occt-build/agentsam-occt --box 100 60 20 /tmp/agentsam-bracket.step
/tmp/agentsam-occt-build/agentsam-occt --inspect /tmp/agentsam-bracket.step
```

The engine requires an installed OCCT development package, C++20 compiler and CMake. It does not implicitly install OCCT or silently fall back to approximate geometry. See `packages/agentsam-occt/README.md` for the shared browser/native contract and provider ownership.
