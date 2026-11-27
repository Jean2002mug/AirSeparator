#pragma once
#include "Aircraft.hpp"
#include <cmath>
#include <cstddef>
#include <vector>

inline double verticalSeparationFeet(const Aircraft& a, const Aircraft& b) {
    return std::abs(a.altitudeFeet - b.altitudeFeet);
}

double horizontalSeparationNm(const Aircraft& a, const Aircraft& b);

struct SeparationThresholds {
    double horizontalNm = 5.0;
    double verticalFeet = 1000.0;
    static constexpr double minHorizontalNm = 0.5, maxHorizontalNm = 20.0;
    static constexpr double minVerticalFeet = 100.0, maxVerticalFeet = 5000.0;
};

inline constexpr std::size_t minAircraft = 2, maxAircraft = 50;

struct PairSeparation {
    std::string callSignA;
    std::string callSignB;
    double horizontalNm;
    double verticalFeet;
    bool warning;
};

struct ScenarioResult {
    std::vector<PairSeparation> pairs;
    std::size_t warningCount{};
};

// Checks inputs and throws std::invalid_argument if the scenario is invalid.
ScenarioResult evaluateScenario(std::vector<Aircraft> aircraft, SeparationThresholds thresholds = {});
