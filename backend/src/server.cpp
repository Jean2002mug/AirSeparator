#include "Separation.hpp"
#include <httplib/httplib.h>
#include <nlohmann/json.hpp>
#include <algorithm>
#include <charconv>
#include <initializer_list>
#include <iostream>
#include <stdexcept>
#include <string_view>
#include <utility>

namespace {
using Json = nlohmann::json;

void sendJson(httplib::Response& response, const Json& body, int status = 200) {
    response.status = status;
    response.set_content(body.dump(), "application/json");
}

void checkObject(const Json& obj, const char* name, std::initializer_list<std::string_view> allowed) {
    if (!obj.is_object()) {
        throw std::invalid_argument(std::string(name) + " must be an object");
    }
    for (const auto& item : obj.items()) {
        if (std::find(allowed.begin(), allowed.end(), item.key()) == allowed.end()) {
            throw std::invalid_argument(std::string(name) + " has unknown field " + item.key());
        }
    }
}

double number(const Json& obj, const char* field) {
    if (!obj.contains(field) || !obj.at(field).is_number()) {
        throw std::invalid_argument(std::string(field) + " must be a number");
    }
    return obj.at(field).get<double>();
}

Aircraft readAircraft(const Json& obj) {
    checkObject(obj, "aircraft entry", {"callSign", "latitudeDegrees", "longitudeDegrees", "altitudeFeet"});
    if (!obj.contains("callSign") || !obj.at("callSign").is_string()) {
        throw std::invalid_argument("callSign must be a string");
    }
    return {obj.at("callSign").get<std::string>(), number(obj, "latitudeDegrees"),
            number(obj, "longitudeDegrees"), number(obj, "altitudeFeet")};
}

Json config() {
    const SeparationThresholds defaults;
    return {{"defaults", {{"horizontalNm", defaults.horizontalNm}, {"verticalFeet", defaults.verticalFeet}}},
            {"limits", {{"horizontalNm", {{"min", defaults.minHorizontalNm}, {"max", defaults.maxHorizontalNm}}},
                        {"verticalFeet", {{"min", defaults.minVerticalFeet}, {"max", defaults.maxVerticalFeet}}},
                        {"aircraft", {{"min", minAircraft}, {"max", maxAircraft}}}}}};
}

Json separationResponse(const Json& body, bool singlePair) {
    checkObject(body, "request", {"aircraft", "thresholds"});
    if (!body.contains("aircraft") || !body.at("aircraft").is_array()) {
        throw std::invalid_argument("aircraft must be an array");
    }
    const auto& entries = body.at("aircraft");
    if (singlePair && entries.size() != 2) {
        throw std::invalid_argument("/api/separation requires exactly 2 aircraft");
    }
    if (entries.size() < minAircraft || entries.size() > maxAircraft) {
        throw std::invalid_argument("a scenario must contain 2 to " + std::to_string(maxAircraft) + " aircraft");
    }
    SeparationThresholds thresholds;
    if (body.contains("thresholds")) {
        const auto& overrides = body.at("thresholds");
        checkObject(overrides, "thresholds", {"horizontalNm", "verticalFeet"});
        if (overrides.contains("horizontalNm")) {
            thresholds.horizontalNm = number(overrides, "horizontalNm");
        }
        if (overrides.contains("verticalFeet")) {
            thresholds.verticalFeet = number(overrides, "verticalFeet");
        }
    }
    std::vector<Aircraft> aircraft;
    for (const auto& entry : entries) {
        aircraft.push_back(readAircraft(entry));
    }
    const auto result = evaluateScenario(std::move(aircraft), thresholds);
    Json pairs = Json::array();
    for (const auto& pair : result.pairs) {
        pairs.push_back({{"callSignA", pair.callSignA}, {"callSignB", pair.callSignB},
                         {"horizontalNm", pair.horizontalNm}, {"verticalFeet", pair.verticalFeet},
                         {"status", pair.warning ? "WARNING" : "NO_WARNING"}});
    }
    return {{"pairs", std::move(pairs)}, {"warningCount", result.warningCount}};
}

void calculate(const httplib::Request& req, httplib::Response& res) {
    try {
        const auto body = Json::parse(req.body);
        sendJson(res, separationResponse(body, req.path == "/api/separation"));
    } catch (const Json::exception&) {
        sendJson(res, {{"error", "invalid JSON or number outside the supported range"}}, 400);
    } catch (const std::invalid_argument& error) {
        sendJson(res, {{"error", error.what()}}, 400);
    }
}
}

int main(int argc, char** argv) {
    if (argc > 3) {
        std::cerr << "Usage: airseparator [port [address]]\n";
        return 1;
    }
    const std::string host = argc == 3 ? argv[2] : "127.0.0.1";
    if (host.empty()) {
        std::cerr << "Listen address must not be empty\n";
        return 1;
    }
    int port = 8080;
    if (argc >= 2) {
        const std::string_view arg = argv[1];
        const auto end = arg.data() + arg.size();
        const auto parsed = std::from_chars(arg.data(), end, port);
        if (parsed.ec != std::errc{} || parsed.ptr != end || port < 0 || port > 65535) {
            std::cerr << "Port must be an integer between 0 and 65535\n";
            return 1;
        }
    }

    httplib::Server server;
    server.set_payload_max_length(64 * 1024);
    server.Get("/health", [](const auto&, auto& res) { sendJson(res, {{"status", "ok"}}); });
    server.Get("/api/config", [](const auto&, auto& res) { sendJson(res, config()); });
    server.Post("/api/separation", calculate);
    server.Post("/api/conflicts", calculate);
    if (port == 0) {
        port = server.bind_to_any_port(host);
    } else if (!server.bind_to_port(host, port)) {
        port = -1;
    }
    if (port < 1) {
        std::cerr << "Could not bind to the requested address and port\n";
        return 1;
    }
    const auto urlHost = host.find(':') == std::string::npos ? host : "[" + host + "]";
    std::cout << "Listening on http://" << urlHost << ':' << port << std::endl;
    return server.listen_after_bind() ? 0 : 1;
}
