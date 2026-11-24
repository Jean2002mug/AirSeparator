#include "Separation.hpp"
#include <algorithm>
#include <set>
#include <stdexcept>

namespace {
constexpr double radiansPerDegree = 0.017453292519943295769236907684886;
constexpr double earthRadiusNm = 3440.065;

void checkRange(double value, double minimum, double maximum, const std::string& name) {
    if (!std::isfinite(value) || value < minimum || value > maximum) {
        throw std::invalid_argument(name + " must be finite and between " +
                                    std::to_string(minimum) + " and " + std::to_string(maximum));
    }
}

void normalizeCallSign(std::string& callSign) {
    constexpr char whitespace[] = " \t\r\n\f\v";
    const auto first = callSign.find_first_not_of(whitespace);
    if (first == std::string::npos || callSign.find_last_not_of(whitespace) - first >= 7)
        throw std::invalid_argument("callSign must be 1 to 7 characters after trimming");
    callSign = callSign.substr(first, callSign.find_last_not_of(whitespace) - first + 1);
    bool hasLetter = false;
    for (char& c : callSign) {
        if (c >= 'a' && c <= 'z') {
            c = static_cast<char>(c - 'a' + 'A');
        }
        if (c >= 'A' && c <= 'Z') {
            hasLetter = true;
        } else if (!(c >= '0' && c <= '9')) {
            throw std::invalid_argument("callSign may contain only A-Z, a-z and 0-9");
        }
    }
    if (!hasLetter) throw std::invalid_argument("callSign must contain at least one letter");
}
}

double horizontalSeparationNm(const Aircraft& a, const Aircraft& b) {
    const double deltaLat = (b.latitudeDegrees - a.latitudeDegrees) * radiansPerDegree;
    const double deltaLon = std::remainder(b.longitudeDegrees - a.longitudeDegrees, 360.0) * radiansPerDegree;
    const double sinHalfLat = std::sin(deltaLat / 2.0);
    const double sinHalfLon = std::sin(deltaLon / 2.0);
    // Longitude does not affect distance at either pole.
    const auto cosLatitude = [](double degrees) {
        return std::abs(degrees) == 90.0 ? 0.0 : std::cos(degrees * radiansPerDegree);
    };
    const double h = sinHalfLat * sinHalfLat + cosLatitude(a.latitudeDegrees) *
                     cosLatitude(b.latitudeDegrees) * sinHalfLon * sinHalfLon;
    // Roundoff near antipodal points can otherwise put the square root outside asin's domain.
    return 2.0 * earthRadiusNm * std::asin(std::sqrt(std::clamp(h, 0.0, 1.0)));
}

ScenarioResult evaluateScenario(std::vector<Aircraft> aircraft, SeparationThresholds thresholds) {
    if (aircraft.size() < minAircraft || aircraft.size() > maxAircraft) {
        throw std::invalid_argument("a scenario must contain 2 to 20 aircraft");
    }
    checkRange(thresholds.horizontalNm, thresholds.minHorizontalNm, thresholds.maxHorizontalNm, "horizontalNm");
    checkRange(thresholds.verticalFeet, thresholds.minVerticalFeet, thresholds.maxVerticalFeet, "verticalFeet");
    std::set<std::string> seen;
    for (Aircraft& plane : aircraft) {
        normalizeCallSign(plane.callSign);
        if (!seen.insert(plane.callSign).second) {
            throw std::invalid_argument("duplicate callSign: " + plane.callSign);
        }
        checkRange(plane.latitudeDegrees, -90, 90, plane.callSign + ".latitudeDegrees");
        checkRange(plane.longitudeDegrees, -180, 180, plane.callSign + ".longitudeDegrees");
        checkRange(plane.altitudeFeet, -2000, 60000, plane.callSign + ".altitudeFeet");
    }

    ScenarioResult result;
    for (std::size_t i = 0; i < aircraft.size(); ++i) {
        for (std::size_t j = i + 1; j < aircraft.size(); ++j) {
            const Aircraft& a = aircraft[i];
            const Aircraft& b = aircraft[j];
            const double horizontal = horizontalSeparationNm(a, b);
            const double vertical = verticalSeparationFeet(a, b);
            const bool warning = horizontal < thresholds.horizontalNm && vertical < thresholds.verticalFeet;
            result.pairs.push_back({a.callSign, b.callSign, horizontal, vertical, warning});
            if (warning) {
                ++result.warningCount;
            }
        }
    }
    return result;
}
