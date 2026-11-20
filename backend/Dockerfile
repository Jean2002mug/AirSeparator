FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
        cmake g++ ninja-build python3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY CMakeLists.txt .
COPY backend/include backend/include
COPY backend/src backend/src
COPY backend/third_party backend/third_party
COPY backend/tests backend/tests
RUN cmake -S . -B /build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=ON \
    && cmake --build /build --parallel 2 \
    && ctest --test-dir /build --output-on-failure

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/airseparator /usr/local/bin/airseparator
COPY backend/third_party/httplib/LICENSE /usr/share/doc/airseparator/httplib-LICENSE
COPY backend/third_party/nlohmann/LICENSE.MIT /usr/share/doc/airseparator/nlohmann-LICENSE
USER 65534:65534
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/airseparator"]
CMD ["8080", "0.0.0.0"]
