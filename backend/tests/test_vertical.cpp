// These assertions must also run when CMake builds the tests in Release mode.
#ifdef NDEBUG
#undef NDEBUG
#endif
#include "Separation.hpp"
#include <cassert>

int main() {
    Aircraft a{};
    Aircraft b{};
    // Test 1: Vertical separation between two aircraft with different altitudes
    a.altitudeFeet = 10000.0;
    b.altitudeFeet = 12500.0;

    assert(verticalSeparationFeet(a, b) == 2500.0);
    // Test 2: Reverse aircraft order
    assert(verticalSeparationFeet(b, a) == 2500.0);

    // Test 3: Same altitude
    b.altitudeFeet = 10000.0;
    assert(verticalSeparationFeet(a, b) == 0.0);

    // Test 4: Fractional altitude
    b.altitudeFeet = 10250.5;
    assert(verticalSeparationFeet(a, b) == 250.5);

    return 0;
}
