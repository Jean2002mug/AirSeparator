// These assertions must also run when CMake builds the tests in Release mode.
#ifdef NDEBUG
#undef NDEBUG
#endif
#include "Separation.hpp"
#include <cassert>
#include <limits>
#include <stdexcept>

int main() {
    Aircraft a{"a1", 0, 0, 10000};
    Aircraft b{"B2", 0, 0, 10000};
    assert(horizontalSeparationNm(a, b) == 0);

    // One degree along the equator is about 60.04046 nautical miles.
    b.longitudeDegrees = 1;
    assert(std::abs(horizontalSeparationNm(a, b) - 60.04046) < 0.00001);
    a.longitudeDegrees = 179.5;
    b.longitudeDegrees = -179.5;
    assert(std::abs(horizontalSeparationNm(a, b) - 60.04046) < 0.00001);
    a.latitudeDegrees = 60;
    b.latitudeDegrees = 60;
    assert(std::abs(horizontalSeparationNm(a, b) - 30.01994) < 0.0001);
    assert(horizontalSeparationNm(a, b) == horizontalSeparationNm(b, a));
    b.latitudeDegrees = 61;
    b.longitudeDegrees = a.longitudeDegrees;
    assert(std::abs(horizontalSeparationNm(a, b) - 60.04046) < 0.00001);

    a = {"a1", 0, 0, 10000};
    b = {"B2", 0, 0.05, 10999};
    const double distance = horizontalSeparationNm(a, b);
    // Use adjacent representable thresholds to catch rounding or <= comparisons.
    assert(evaluateScenario({a, b}, {distance, 1000}).warningCount == 0);
    assert(evaluateScenario({a, b}, {std::nextafter(distance, 0.0), 1000}).warningCount == 0);
    assert(evaluateScenario({a, b}, {std::nextafter(distance, 20.0), 1000}).warningCount == 1);
    b.altitudeFeet = 11000;
    assert(evaluateScenario({a, b}).warningCount == 0);
    b.altitudeFeet = 11001;
    assert(evaluateScenario({a, b}).warningCount == 0);

    // JSON cannot represent NaN or infinity, but C++ callers can pass either.
    for (double value : {std::numeric_limits<double>::quiet_NaN(),
                         std::numeric_limits<double>::infinity()}) {
        b.altitudeFeet = value;
        try {
            evaluateScenario({a, b});
            assert(false && "nonfinite altitude accepted");
        } catch (const std::invalid_argument&) {}
    }
}
